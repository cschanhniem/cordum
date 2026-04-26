#!/usr/bin/env bash
# Probe 17 — graceful shutdown
#
# Failure mode: SIGTERM llm-chat while active WebSocket sessions exist.
# Acceptance criteria: llm-chat exits within 30s, does not panic, restarts cleanly, and audit chain verifies ok after chat.session_closed events flush.
# Expected recovery time: drain/exit <=30s; readyz recovers <=120s after restart.
# Nightly/manual marker: compose-nightly, destructive.

set -euo pipefail
PROBE_ID="llmchat_probe_17_graceful_shutdown"
# shellcheck source=tests/ops/llmchat_common.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/llmchat_common.sh"
probe_init
write_probe_manifest 'SIGTERM llm-chat with active WS sessions' 'drains/exits within 30s, emits closed-session audit events, restarts ready without panic' '<=30s drain; <=120s restart readiness' 'compose-nightly destructive'
require_live_stack
require_destructive
require_cmd docker
require_go
require_chat_api_key
poll_readyz "${LLMCHAT_DIRECT_URL%/}/readyz" 200 120 || probe_fail 'llm-chat not ready before graceful shutdown probe'

sessions="${LLMCHAT_OPS_SHUTDOWN_SESSIONS:-16}"
read_seconds="${LLMCHAT_OPS_SHUTDOWN_READ_SECONDS:-90}"
pids_file="${PROBE_OUT_DIR}/ws-client-pids.txt"
: >"${pids_file}"
record_section "open ${sessions} websocket sessions"
for i in $(seq 1 "${sessions}"); do
  out="${PROBE_OUT_DIR}/shutdown-ws-${i}.jsonl"
  set +e
  run_ws_client "${out}" '[]' "${read_seconds}" false &
  pid=$!
  set -e
  printf '%s %s\n' "${pid}" "${out}" >>"${pids_file}"
  sleep 0.2
done
sleep "${LLMCHAT_OPS_SHUTDOWN_SETTLE_SECONDS:-3}"
llm_cid="$(require_service_container llm-chat)"
log_evidence "llm_chat_container=${llm_cid}"

record_section 'SIGTERM llm-chat'
start=$(date +%s)
run_capture 'docker compose kill -s TERM llm-chat' docker_compose kill -s TERM llm-chat || probe_fail 'failed to SIGTERM llm-chat'
set +e
docker wait "${llm_cid}" >>"${EVIDENCE_FILE}" 2>&1
wait_code=$?
set -e
end=$(date +%s)
elapsed=$((end - start))
log_evidence "docker_wait_exit=${wait_code} shutdown_elapsed_seconds=${elapsed}"
[ "${elapsed}" -le 30 ] || probe_fail "llm-chat shutdown took ${elapsed}s, want <=30s"

record_section 'collect websocket clients'
while read -r pid out; do
  [ -n "${pid}" ] || continue
  set +e
  wait "${pid}"
  code=$?
  set -e
  log_evidence "ws_client_pid=${pid} exit=${code} out=${out}"
  [ -f "${out}" ] && sed -e "s/^/shutdown_ws_${pid}: /" "${out}" >>"${EVIDENCE_FILE}" || true
done <"${pids_file}"

record_section 'restart llm-chat'
run_capture 'docker compose up -d llm-chat' docker_compose up -d llm-chat || probe_fail 'failed to restart llm-chat'
poll_readyz "${LLMCHAT_DIRECT_URL%/}/readyz" 200 120 || probe_fail 'llm-chat /readyz did not recover after restart'

record_section 'logs and audit verification'
run_capture 'docker compose logs llm-chat --tail=200' docker_compose logs --tail=200 llm-chat || true
if grep -Ei 'panic:|fatal error|stack trace' "${EVIDENCE_FILE}" >/dev/null 2>&1; then
  probe_fail 'llm-chat logs leaked panic/fatal stack during graceful shutdown'
fi
if [ "${LLMCHAT_OPS_SKIP_AUDIT_VERIFY:-0}" != '1' ]; then
  audit_body="${PROBE_OUT_DIR}/audit-verify.json"
  set +e
  audit_status=$(chat_auth_curl -o "${audit_body}" -w '%{http_code}' "${GATEWAY_URL%/}/api/v1/audit/verify?tenant=${LLMCHAT_OPS_TENANT:-default}" 2>>"${EVIDENCE_FILE}")
  audit_code=$?
  set -e
  log_evidence "audit_verify_curl_exit=${audit_code} audit_verify_status=${audit_status} body=${audit_body}"
  [ -f "${audit_body}" ] && sed -e 's/^/audit_verify: /' "${audit_body}" >>"${EVIDENCE_FILE}" || true
  [ "${audit_status}" = '200' ] || probe_fail "audit verify returned ${audit_status}, want 200"
  grep -E '"status"[[:space:]]*:[[:space:]]*"ok"' "${audit_body}" >/dev/null 2>&1 || probe_fail 'audit chain status is not ok after shutdown'
else
  log_evidence 'audit_verify=skipped by LLMCHAT_OPS_SKIP_AUDIT_VERIFY=1'
fi
probe_pass "llm-chat graceful shutdown drained/restarted in ${elapsed}s"
