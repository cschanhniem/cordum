#!/usr/bin/env bash
# Probe 12 — Kubernetes rolling upgrade
#
# Failure mode: llm-chat pod is rolled while 16 WebSocket sessions stream responses.
# Acceptance criteria: rollout restart respects readiness/termination grace, active clients see terminal frames or reconnect cleanly, no missing final frames, and audit chain verifies ok.
# Expected recovery time: rollout status <=180s; per-session frame completion <=120s.
# Nightly/manual marker: k8s-nightly destructive.

set -euo pipefail
PROBE_ID="llmchat_probe_12_rolling_upgrade"
# shellcheck source=tests/ops/llmchat_common.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/llmchat_common.sh"
probe_init
write_probe_manifest 'rolling restart llm-chat deployment during active WS sessions' 'readiness/termination gates rollout; zero missing terminal frames; audit verify ok' '<=180s rollout' 'k8s-nightly destructive'
require_k8s_live
require_destructive
require_go
require_chat_api_key

namespace="${LLMCHAT_OPS_K8S_NAMESPACE:-cordum}"
deployment="${LLMCHAT_OPS_K8S_LLMCHAT_DEPLOYMENT:-llm-chat}"
sessions="${LLMCHAT_OPS_ROLLING_SESSIONS:-16}"
turn_timeout="${LLMCHAT_OPS_ROLLING_TURN_TIMEOUT_SECONDS:-120}"
record_section 'baseline deployment'
"${KUBECTL_BIN}" -n "${namespace}" get deployment "${deployment}" -o yaml >"${PROBE_OUT_DIR}/deployment-before.yaml" 2>>"${EVIDENCE_FILE}" || probe_fail "deployment ${namespace}/${deployment} not found"
grep -E 'terminationGracePeriodSeconds:[[:space:]]*60' "${PROBE_OUT_DIR}/deployment-before.yaml" >/dev/null 2>&1 || probe_fail 'deployment terminationGracePeriodSeconds is not 60s'

record_section "start ${sessions} active websocket sessions"
pids_file="${PROBE_OUT_DIR}/rolling-pids.txt"
: >"${pids_file}"
for i in $(seq 1 "${sessions}"); do
  out="${PROBE_OUT_DIR}/rolling-session-${i}.jsonl"
  set +e
  run_ws_client "${out}" '["During the rolling upgrade, list jobs and finish with marker ROLLING_UPGRADE_FINAL."]' "${turn_timeout}" true &
  pid=$!
  set -e
  printf '%s %s %s\n' "${pid}" "${out}" "${i}" >>"${pids_file}"
done
sleep "${LLMCHAT_OPS_ROLLING_SETTLE_SECONDS:-3}"

record_section 'rollout restart'
start=$(date +%s)
"${KUBECTL_BIN}" -n "${namespace}" rollout restart deployment/"${deployment}" >>"${EVIDENCE_FILE}" 2>&1 || probe_fail 'kubectl rollout restart failed'
"${KUBECTL_BIN}" -n "${namespace}" rollout status deployment/"${deployment}" --timeout="${LLMCHAT_OPS_ROLLOUT_TIMEOUT:-180s}" >>"${EVIDENCE_FILE}" 2>&1 || probe_fail 'kubectl rollout status failed/timed out'
end=$(date +%s)
log_evidence "rollout_elapsed_seconds=$((end-start))"

missing=0
while read -r pid out sid; do
  set +e
  wait "${pid}"
  code=$?
  set -e
  log_evidence "rolling_session=${sid} pid=${pid} exit=${code} out=${out}"
  [ -f "${out}" ] && sed -e "s/^/rolling_ws_${sid}: /" "${out}" >>"${EVIDENCE_FILE}" || true
  if ! grep -E '"type":"final"|"type":"approval_required"|"type":"error"' "${out}" >/dev/null 2>&1; then
    missing=$((missing + 1))
  fi
  if grep -Ei 'panic:|fatal error|stack trace' "${out}" >/dev/null 2>&1; then
    probe_fail "session ${sid} leaked panic/stack output during rollout"
  fi
done <"${pids_file}"
[ "${missing}" -eq 0 ] || probe_fail "${missing} rolling sessions missed terminal frames"

audit_body="${PROBE_OUT_DIR}/audit-verify-rolling.json"
audit_status=$(chat_auth_curl -o "${audit_body}" -w '%{http_code}' "${GATEWAY_URL%/}/api/v1/audit/verify?tenant=${LLMCHAT_OPS_TENANT:-default}" 2>>"${EVIDENCE_FILE}") || true
log_evidence "audit_verify_status=${audit_status}"
[ -f "${audit_body}" ] && sed -e 's/^/audit_verify: /' "${audit_body}" >>"${EVIDENCE_FILE}" || true
[ "${audit_status}" = '200' ] || probe_fail "audit verify returned ${audit_status}, want 200"
grep -E '"status"[[:space:]]*:[[:space:]]*"ok"' "${audit_body}" >/dev/null 2>&1 || probe_fail 'audit chain not ok after rolling upgrade'
probe_pass "rolling upgrade completed in $((end-start))s with ${sessions} active sessions"
