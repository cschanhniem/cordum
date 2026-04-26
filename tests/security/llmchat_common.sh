#!/usr/bin/env bash
# Shared helpers for Cordum LLM-chat security probes.
# Source from llmchat_probe_*.sh scripts; do not execute directly.

set -euo pipefail

LLMCHAT_SECURITY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${LLMCHAT_SECURITY_DIR}/../.." && pwd)"
SECURITY_OUT_DIR="${LLMCHAT_SECURITY_OUT_DIR:-${REPO_ROOT}/out/llmchat-security}"
GATEWAY_URL="${LLMCHAT_GATEWAY_URL:-http://127.0.0.1:8081}"
LLMCHAT_DIRECT_URL="${LLMCHAT_DIRECT_URL:-http://127.0.0.1:8090}"
VLLM_URL="${LLMCHAT_VLLM_URL:-http://127.0.0.1:8000}"
CURL_TIMEOUT_SECONDS="${LLMCHAT_CURL_TIMEOUT_SECONDS:-10}"
PYTHON_BIN="${LLMCHAT_PYTHON_BIN:-}"
if [ -z "${PYTHON_BIN}" ]; then
  if command -v python >/dev/null 2>&1; then
    PYTHON_BIN="python"
  elif command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="python3"
  elif command -v py >/dev/null 2>&1; then
    PYTHON_BIN="py -3"
  else
    PYTHON_BIN=""
  fi
fi
GO_BIN="${LLMCHAT_GO_BIN:-}"
if [ -z "${GO_BIN}" ]; then
  if command -v go >/dev/null 2>&1; then
    GO_BIN="go"
  elif [ -x /snap/bin/go ]; then
    GO_BIN="/snap/bin/go"
  elif command -v go.exe >/dev/null 2>&1; then
    GO_BIN="go.exe"
  else
    GO_BIN=""
  fi
fi
HELM_BIN="${LLMCHAT_HELM_BIN:-}"
if [ -z "${HELM_BIN}" ]; then
  if command -v helm >/dev/null 2>&1; then
    HELM_BIN="helm"
  elif command -v helm.exe >/dev/null 2>&1; then
    HELM_BIN="helm.exe"
  else
    HELM_BIN=""
  fi
fi

# Probe scripts may override PROBE_ID before sourcing; default derives from script name.
PROBE_ID="${PROBE_ID:-$(basename "${0:-probe}" .sh)}"
PROBE_OUT_DIR="${SECURITY_OUT_DIR}/${PROBE_ID}"
EVIDENCE_FILE="${PROBE_OUT_DIR}/evidence.txt"

probe_init() {
  mkdir -p "${PROBE_OUT_DIR}"
  : >"${EVIDENCE_FILE}"
  log_evidence "probe=${PROBE_ID}"
  log_evidence "repo_root=${REPO_ROOT}"
  log_evidence "started_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}

log_evidence() {
  printf '%s\n' "$*" | tee -a "${EVIDENCE_FILE}"
}

record_section() {
  log_evidence ""
  log_evidence "## $*"
}

probe_pass() {
  local msg="${1:-PASS}"
  log_evidence "status=PASS message=${msg}"
  exit 0
}

probe_fail() {
  local msg="${1:-FAIL}"
  log_evidence "status=FAIL message=${msg}"
  echo "[${PROBE_ID}] FAIL: ${msg}" >&2
  exit 1
}

probe_skip() {
  local msg="${1:-SKIP}"
  log_evidence "status=SKIP message=${msg}"
  echo "[${PROBE_ID}] SKIP: ${msg}" >&2
  exit 77
}

live_evidence_not_run() {
  local key="$1"
  shift
  local reason="$*"
  log_evidence "${key}=not_run reason=${reason}"
  if [ "${LLMCHAT_SECURITY_REQUIRE_LIVE:-0}" = "1" ]; then
    probe_skip "live evidence required but ${key} was not run: ${reason}"
  fi
}

live_evidence_inconclusive() {
  local key="$1"
  shift
  local reason="$*"
  log_evidence "${key}=not_asserted reason=${reason}"
  if [ "${LLMCHAT_SECURITY_REQUIRE_LIVE:-0}" = "1" ]; then
    probe_fail "live evidence required but ${key} was inconclusive: ${reason}"
  fi
}

require_cmd() {
  local cmd="$1"
  command -v "${cmd}" >/dev/null 2>&1 || probe_skip "required command '${cmd}' not found"
}

assert_file_exists() {
  local file="$1"
  local msg="${2:-expected file to exist}"
  [ -f "${REPO_ROOT}/${file}" ] || probe_fail "${msg}: ${file}"
  log_evidence "assert_file_exists ok: ${file}"
}

assert_file_contains() {
  local file="$1"
  local pattern="$2"
  local msg="${3:-expected pattern present}"
  assert_file_exists "${file}" "file missing for contains assertion"
  if ! grep -nE -- "${pattern}" "${REPO_ROOT}/${file}" >>"${EVIDENCE_FILE}" 2>&1; then
    probe_fail "${msg}: ${file} pattern=${pattern}"
  fi
  log_evidence "assert_file_contains ok: ${file} pattern=${pattern}"
}

assert_file_not_contains() {
  local file="$1"
  local pattern="$2"
  local msg="${3:-expected pattern absent}"
  assert_file_exists "${file}" "file missing for absent assertion"
  if grep -nE -- "${pattern}" "${REPO_ROOT}/${file}" >>"${EVIDENCE_FILE}" 2>&1; then
    probe_fail "${msg}: ${file} pattern=${pattern}"
  fi
  log_evidence "assert_file_not_contains ok: ${file} pattern=${pattern}"
}

run_capture() {
  local label="$1"
  shift
  record_section "${label}"
  log_evidence "+ $*"
  set +e
  "$@" >>"${EVIDENCE_FILE}" 2>&1
  local code=$?
  set -e
  log_evidence "exit_code=${code}"
  return "${code}"
}

run_go_test() {
  local label="$1"
  shift
  if [ -z "${GO_BIN}" ]; then
    probe_skip "go command not found; set LLMCHAT_GO_BIN"
  fi
  run_capture "${label}" "${GO_BIN}" test "$@"
}

run_bash_capture() {
  local label="$1"
  local script="$2"
  record_section "${label}"
  log_evidence "+ bash -lc ${script}"
  set +e
  bash -lc "${script}" >>"${EVIDENCE_FILE}" 2>&1
  local code=$?
  set -e
  log_evidence "exit_code=${code}"
  return "${code}"
}

run_helm_template() {
  if [ -z "${HELM_BIN}" ]; then
    probe_skip "helm command not found; set LLMCHAT_HELM_BIN"
  fi
  local args=()
  local arg
  for arg in "$@"; do
    if [[ "${HELM_BIN}" == *".exe" ]] && command -v wslpath >/dev/null 2>&1 && [[ "${arg}" == /* ]] && [ -e "${arg}" ]; then
      args+=("$(wslpath -w "${arg}")")
    else
      args+=("${arg}")
    fi
  done
  "${HELM_BIN}" template "${args[@]}"
}

curl_status_body() {
  local label="$1"
  local body_file="$2"
  shift 2
  record_section "curl ${label}"
  log_evidence "+ curl $*"
  set +e
  local status
  status=$(curl -k -sS --max-time "${CURL_TIMEOUT_SECONDS}" -o "${body_file}" -w '%{http_code}' "$@" 2>>"${EVIDENCE_FILE}")
  local code=$?
  set -e
  log_evidence "curl_exit=${code} http_status=${status} body_file=${body_file}"
  if [ -f "${body_file}" ]; then
    sed -e 's/^/body: /' "${body_file}" >>"${EVIDENCE_FILE}" || true
  fi
  printf '%s' "${status}"
  return "${code}"
}

assert_http_status_in() {
  local got="$1"
  local allowed_csv="$2"
  local msg="$3"
  IFS=',' read -r -a allowed <<<"${allowed_csv}"
  for want in "${allowed[@]}"; do
    if [ "${got}" = "${want}" ]; then
      log_evidence "assert_http_status_in ok: got=${got} allowed=${allowed_csv}"
      return 0
    fi
  done
  probe_fail "${msg}: got HTTP ${got}, allowed ${allowed_csv}"
}

assert_text_contains() {
  local text_file="$1"
  local pattern="$2"
  local msg="$3"
  if ! grep -E -- "${pattern}" "${text_file}" >>"${EVIDENCE_FILE}" 2>&1; then
    probe_fail "${msg}: ${text_file} pattern=${pattern}"
  fi
  log_evidence "assert_text_contains ok: ${text_file} pattern=${pattern}"
}

assert_text_not_contains() {
  local text_file="$1"
  local pattern="$2"
  local msg="$3"
  if grep -E -- "${pattern}" "${text_file}" >>"${EVIDENCE_FILE}" 2>&1; then
    probe_fail "${msg}: ${text_file} pattern=${pattern}"
  fi
  log_evidence "assert_text_not_contains ok: ${text_file} pattern=${pattern}"
}

require_live_stack() {
  if [ "${LLMCHAT_SECURITY_LIVE:-0}" != "1" ]; then
    probe_skip "live stack probe disabled; rerun with LLMCHAT_SECURITY_LIVE=1 after clean compose-up"
  fi
}

compose_clean_up() {
  local profile="${LLMCHAT_SECURITY_COMPOSE_PROFILE:-llmchat}"
  record_section "clean compose baseline"
  log_evidence "profile=${profile}"
  run_capture "docker compose down -v" docker compose --profile "${profile}" down -v || return $?
  run_capture "docker compose up -d --build" docker compose --profile "${profile}" up -d --build || return $?
}

jwt_payload_decode() {
  local token="$1"
  ${PYTHON_BIN} - "$token" <<'PY'
import base64, json, sys
parts = sys.argv[1].split('.')
if len(parts) < 2:
    raise SystemExit('not a JWT')
payload = parts[1]
payload += '=' * ((4 - len(payload) % 4) % 4)
print(json.dumps(json.loads(base64.urlsafe_b64decode(payload.encode())), sort_keys=True, indent=2))
PY
}

mint_fixture_jwt() {
  # Fixture-only unsigned JWT for parser tests. Never accepted by Cordum auth.
  local payload_json="$1"
  ${PYTHON_BIN} - "$payload_json" <<'PY'
import base64, json, sys
header = {"alg": "none", "typ": "JWT"}
payload = json.loads(sys.argv[1])
def enc(obj):
    raw = json.dumps(obj, separators=(',', ':'), sort_keys=True).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip('=')
print(f"{enc(header)}.{enc(payload)}.")
PY
}

secret_grep_pattern() {
  printf '%s' 'sk-test-|Bearer [A-Za-z0-9._-]+|eyJ[A-Za-z0-9._-]+|AKIA[0-9A-Z]{16}'
}

assert_no_secret_patterns_in_file() {
  local file="$1"
  local msg="$2"
  if [ ! -f "${file}" ]; then
    probe_fail "${msg}: file missing ${file}"
  fi
  if grep -E "$(secret_grep_pattern)" "${file}" >>"${EVIDENCE_FILE}" 2>&1; then
    probe_fail "${msg}: secret-like pattern found in ${file}"
  fi
  log_evidence "assert_no_secret_patterns_in_file ok: ${file}"
}

assert_no_secret_patterns_in_dir() {
  local dir="$1"
  local msg="$2"
  if [ ! -d "${dir}" ]; then
    probe_fail "${msg}: dir missing ${dir}"
  fi
  if grep -RIE "$(secret_grep_pattern)" "${dir}" >>"${EVIDENCE_FILE}" 2>&1; then
    probe_fail "${msg}: secret-like pattern found under ${dir}"
  fi
  log_evidence "assert_no_secret_patterns_in_dir ok: ${dir}"
}

write_probe_manifest() {
  record_section "manifest"
  log_evidence "payload_hosts=attacker.example evil.test"
  log_evidence "expected_defense_layer=$1"
}
