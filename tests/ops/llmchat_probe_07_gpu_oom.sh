#!/usr/bin/env bash
# Probe 07 — GPU OOM / at-capacity path
#
# Failure mode: 50 long-context concurrent sessions exhaust KV cache/GPU memory and cause 500s, panics, or stuck streams.
# Acceptance criteria: overloaded sessions receive structured at_capacity/provider_failed 503/error frames, llm-chat does not panic, and service recovers within 60s after load drops.
# Expected recovery time: <=60s after overload clients exit.
# Nightly/manual marker: gpu-nightly destructive H100.

set -euo pipefail
PROBE_ID="llmchat_probe_07_gpu_oom"
# shellcheck source=tests/ops/llmchat_common.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/llmchat_common.sh"
probe_init
write_probe_manifest '50 long-context sessions exceed GPU capacity' 'structured at_capacity/503/provider_failed response, no 500/panic, recovery within 60s' '<=60s after load drop' 'gpu-nightly destructive'
require_real_vllm
require_destructive
require_go
require_chat_api_key
require_cmd docker

sessions="${LLMCHAT_OPS_OOM_SESSIONS:-50}"
long_chars="${LLMCHAT_OPS_OOM_CONTEXT_CHARS:-20000}"
turn_timeout="${LLMCHAT_OPS_OOM_TURN_TIMEOUT_SECONDS:-180}"
rss_before="$(container_rss_kb llm-chat || echo 0)"
log_evidence "rss_before_kb=${rss_before} sessions=${sessions} long_context_chars=${long_chars}"
scrape_vllm_metric 'vllm:.*(cache|gpu|kv)|vllm_.*(cache|gpu|kv)' >"${PROBE_OUT_DIR}/oom-metrics-before.txt" 2>>"${EVIDENCE_FILE}" || log_evidence 'metrics_before=unavailable'

pids_file="${PROBE_OUT_DIR}/oom-pids.txt"
: >"${pids_file}"
for i in $(seq 1 "${sessions}"); do
  msgfile="${PROBE_OUT_DIR}/oom-session-${i}.json"
  ${PYTHON_BIN:-python} - "${i}" "${long_chars}" >"${msgfile}" <<'PY'
import json, sys
sid=int(sys.argv[1]); chars=int(sys.argv[2])
blob=("capacity-token-%03d " % sid) * max(1, chars//20)
msg=f"Session {sid}: keep this long context in memory, then list jobs and summarize capacity behavior. Context: {blob}"
print(json.dumps([msg]))
PY
  out="${PROBE_OUT_DIR}/oom-session-${i}.jsonl"
  set +e
  run_ws_client "${out}" "$(cat "${msgfile}")" "${turn_timeout}" false &
  pid=$!
  set -e
  printf '%s %s %s\n' "${pid}" "${out}" "${i}" >>"${pids_file}"
done

structured_errors=0
panic_hits=0
while read -r pid out sid; do
  set +e
  wait "${pid}"
  code=$?
  set -e
  log_evidence "oom_session=${sid} pid=${pid} exit=${code} out=${out}"
  [ -f "${out}" ] && sed -e "s/^/oom_ws_${sid}: /" "${out}" >>"${EVIDENCE_FILE}" || true
  assert_no_bang_stream "${out}"
  if grep -E '"type":"error"' "${out}" | grep -E '"error_code":"(at_capacity|provider_failed|context_cancelled|wall_clock_budget_tripped)"' >/dev/null 2>&1; then
    structured_errors=$((structured_errors + 1))
  fi
  if grep -Ei 'panic:|fatal error|stack trace|runtime\.' "${out}" >/dev/null 2>&1; then
    panic_hits=$((panic_hits + 1))
  fi
done <"${pids_file}"
log_evidence "structured_error_sessions=${structured_errors} panic_hit_sessions=${panic_hits}"
[ "${panic_hits}" -eq 0 ] || probe_fail "${panic_hits} sessions leaked panic/stack output"
[ "${structured_errors}" -ge 1 ] || probe_fail 'overload did not produce any structured at-capacity/provider error frames; capacity path may be untested'
scrape_vllm_metric 'vllm:.*(cache|gpu|kv)|vllm_.*(cache|gpu|kv)' >"${PROBE_OUT_DIR}/oom-metrics-after.txt" 2>>"${EVIDENCE_FILE}" || log_evidence 'metrics_after=unavailable'
poll_readyz "${LLMCHAT_DIRECT_URL%/}/readyz" 200 60 || probe_fail 'llm-chat did not recover readyz within 60s after overload'
rss_after="$(container_rss_kb llm-chat || echo 0)"
log_evidence "rss_after_kb=${rss_after}"
probe_pass "GPU OOM/overload path recovered with ${structured_errors} structured error session(s)"
