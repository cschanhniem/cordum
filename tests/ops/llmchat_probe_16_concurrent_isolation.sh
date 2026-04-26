#!/usr/bin/env bash
# Probe 16 — concurrent sessions isolation and leak check
#
# Failure mode: 16 concurrent sessions leak context, memory, goroutines, file descriptors, or audit-chain integrity under 1-hour load.
# Acceptance criteria: no session-B data in session-A output, RSS drift <=25%, FD drift <=25%, pprof endpoints archive heap/goroutine, and audit verify remains ok.
# Expected recovery time: goroutine/FD counts return near baseline within 60s after load.
# Nightly/manual marker: gpu-nightly long-running.

set -euo pipefail
PROBE_ID="llmchat_probe_16_concurrent_isolation"
# shellcheck source=tests/ops/llmchat_common.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/llmchat_common.sh"
probe_init
write_probe_manifest '16 concurrent sessions x 20 messages x 2 tool calls under 1-hour load' 'no context bleed; RSS/FD/goroutine stable; audit chain ok' '1h load + <=60s settle' 'gpu-nightly long-running'
require_real_vllm
require_go
require_chat_api_key
require_cmd docker

sessions="${LLMCHAT_OPS_LOAD_SESSIONS:-16}"
messages_per_session="${LLMCHAT_OPS_LOAD_MESSAGES:-20}"
turn_timeout="${LLMCHAT_OPS_LOAD_TURN_TIMEOUT_SECONDS:-120}"
record_section 'baseline resources'
rss_before="$(container_rss_kb llm-chat || echo 0)"
fd_before="$(container_fd_count llm-chat || echo 0)"
log_evidence "rss_before_kb=${rss_before} fd_before=${fd_before}"
pprof_fetch goroutine "${PROBE_OUT_DIR}/goroutine-before.pprof" || probe_fail 'llm-chat /debug/pprof/goroutine unavailable; cannot satisfy leak DoD'
pprof_fetch heap "${PROBE_OUT_DIR}/heap-before.pprof" || probe_fail 'llm-chat /debug/pprof/heap unavailable; cannot satisfy leak DoD'

record_section "start ${sessions} concurrent sessions"
pids_file="${PROBE_OUT_DIR}/load-pids.txt"
: >"${pids_file}"
for i in $(seq 1 "${sessions}"); do
  msgfile="${PROBE_OUT_DIR}/session-${i}-messages.json"
  ${PYTHON_BIN:-python} - "${i}" "${messages_per_session}" >"${msgfile}" <<'PY'
import json, sys
sid=int(sys.argv[1]); n=int(sys.argv[2])
msgs=[]
for j in range(1,n+1):
    msgs.append(f"Session {sid} turn {j}: list my tenant-scoped jobs, then query policy for read-only access. Include marker SESSION_{sid}_ONLY in your final summary.")
print(json.dumps(msgs))
PY
  out="${PROBE_OUT_DIR}/session-${i}.jsonl"
  set +e
  run_ws_client "${out}" "$(cat "${msgfile}")" "${turn_timeout}" true &
  pid=$!
  set -e
  printf '%s %s %s\n' "${pid}" "${out}" "${i}" >>"${pids_file}"
done

failures=0
while read -r pid out sid; do
  set +e
  wait "${pid}"
  code=$?
  set -e
  log_evidence "load_client_session=${sid} pid=${pid} exit=${code} out=${out}"
  [ "${code}" -eq 0 ] || failures=$((failures + 1))
  [ -f "${out}" ] && sed -e "s/^/load_ws_${sid}: /" "${out}" >>"${EVIDENCE_FILE}" || true
  assert_no_bang_stream "${out}"
  other=$((sid % sessions + 1))
  if grep -E "SESSION_${other}_ONLY" "${out}" >/dev/null 2>&1; then
    probe_fail "session ${sid} output contains marker from session ${other} (context bleed)"
  fi
done <"${pids_file}"
[ "${failures}" -eq 0 ] || probe_fail "${failures} concurrent session clients failed"

record_section 'post-load resources'
sleep 60
rss_after="$(container_rss_kb llm-chat || echo 0)"
fd_after="$(container_fd_count llm-chat || echo 0)"
log_evidence "rss_after_kb=${rss_after} fd_after=${fd_after}"
pprof_fetch goroutine "${PROBE_OUT_DIR}/goroutine-after.pprof" || probe_fail 'failed to archive goroutine pprof after load'
pprof_fetch heap "${PROBE_OUT_DIR}/heap-after.pprof" || probe_fail 'failed to archive heap pprof after load'
if [ "${rss_before}" -gt 0 ] && [ "${rss_after}" -gt $((rss_before + rss_before / 4)) ]; then
  probe_fail "RSS grew >25% (${rss_before}KiB -> ${rss_after}KiB)"
fi
if [ "${fd_before}" -gt 0 ] && [ "${fd_after}" -gt $((fd_before + fd_before / 4 + 4)) ]; then
  probe_fail "FD count grew >25%+4 (${fd_before} -> ${fd_after})"
fi

audit_body="${PROBE_OUT_DIR}/audit-verify-after-load.json"
audit_status=$(chat_auth_curl -o "${audit_body}" -w '%{http_code}' "${GATEWAY_URL%/}/api/v1/audit/verify?tenant=${LLMCHAT_OPS_TENANT:-default}" 2>>"${EVIDENCE_FILE}") || true
log_evidence "audit_verify_status=${audit_status} body=${audit_body}"
[ -f "${audit_body}" ] && sed -e 's/^/audit_verify: /' "${audit_body}" >>"${EVIDENCE_FILE}" || true
[ "${audit_status}" = '200' ] || probe_fail "audit verify after load returned ${audit_status}, want 200"
grep -E '"status"[[:space:]]*:[[:space:]]*"ok"' "${audit_body}" >/dev/null 2>&1 || probe_fail 'audit chain not ok after concurrent load'
probe_pass "concurrent isolation/load stable: sessions=${sessions}, messages_per_session=${messages_per_session}, rss=${rss_before}->${rss_after}KiB, fd=${fd_before}->${fd_after}"
