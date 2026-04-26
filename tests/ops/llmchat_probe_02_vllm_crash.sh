#!/usr/bin/env bash
# Probe 02 — vLLM crash mid-request
#
# Failure mode: qwen-inference dies while llm-chat is streaming an assistant turn.
# Acceptance criteria: client receives a structured error frame (error_code upstream_unavailable or provider_failed), no stack trace, session/socket remains usable after vLLM restarts, and a second message returns a terminal frame.
# Expected recovery time: vLLM readyz recovers within 600s; retry message terminal frame within 90s after recovery.
# Nightly/manual marker: gpu-nightly, destructive.

set -euo pipefail
PROBE_ID="llmchat_probe_02_vllm_crash"
# shellcheck source=tests/ops/llmchat_common.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/llmchat_common.sh"
probe_init
write_probe_manifest 'qwen-inference dies mid-stream' 'structured WS error frame, no stack trace, session usable after restart' '<=600s vLLM restart; <=90s retry terminal frame' 'gpu-nightly destructive'
record_section 'setup'
log_evidence 'destructive=true action=kill -9 qwen-inference PID 1 while WS client is reading a long response'
require_real_vllm
require_destructive
require_cmd docker
require_go
require_chat_api_key
poll_readyz "${LLMCHAT_DIRECT_URL%/}/readyz" 200 120 || probe_fail 'llm-chat not ready before crash probe'

msg="${LLMCHAT_OPS_MIDSTREAM_MESSAGE:-Write a deliberately long operational explanation of Cordum LLM-chat readiness, including all health checks and recovery steps. Stream enough detail that the response remains active while the probe kills vLLM.}"
messages_json="$(printf '%s' "${msg}" | ${PYTHON_BIN:-python} -c 'import json,sys; print(json.dumps([sys.stdin.read()]))')"
client_out="${PROBE_OUT_DIR}/midstream-ws.jsonl"
record_section 'start WS turn'
set +e
run_ws_client "${client_out}" "${messages_json}" "${LLMCHAT_OPS_CRASH_READ_SECONDS:-120}" false &
client_pid=$!
set -e
sleep "${LLMCHAT_OPS_KILL_DELAY_SECONDS:-3}"
qwen_cid="$(require_service_container qwen-inference)"
record_section 'kill qwen-inference'
log_evidence "qwen_container=${qwen_cid}"
run_capture 'docker exec kill -9 1 qwen-inference' docker exec "${qwen_cid}" kill -9 1 || log_evidence 'kill_pid1_exit_nonzero=true; container may already be exiting'
set +e
wait "${client_pid}"
client_code=$?
set -e
log_evidence "midstream_client_exit=${client_code}"
[ -f "${client_out}" ] && sed -e 's/^/midstream_ws: /' "${client_out}" >>"${EVIDENCE_FILE}" || true

record_section 'restart qwen-inference'
run_capture 'docker compose up -d qwen-inference' docker_compose up -d qwen-inference || probe_fail 'failed to restart qwen-inference'
poll_readyz "${LLMCHAT_DIRECT_URL%/}/readyz" 200 600 || probe_fail 'llm-chat did not recover after qwen-inference restart'

record_section 'assert structured midstream failure'
grep -E '"event":"frame"' "${client_out}" >/dev/null 2>&1 || probe_fail 'WS client did not capture any frame before/after crash'
grep -E '"type":"error"' "${client_out}" >/dev/null 2>&1 || probe_fail 'vLLM crash did not surface as structured WS error frame'
grep -E '"error_code":"(upstream_unavailable|provider_failed)"' "${client_out}" >/dev/null 2>&1 || probe_fail 'structured error frame did not carry upstream_unavailable/provider_failed code'
if grep -Ei 'panic:|goroutine [0-9]+ \[|stack trace|runtime\.' "${client_out}" >/dev/null 2>&1; then
  probe_fail 'WS error leaked stack trace / runtime details'
fi

record_section 'retry after restart'
retry_out="${PROBE_OUT_DIR}/retry-ws.jsonl"
run_ws_client "${retry_out}" '["After the vLLM restart, reply with a one sentence readiness summary."]' 90 true || probe_fail 'retry message after vLLM restart did not return a terminal frame'
grep -E '"type":"final"|"type":"approval_required"|"type":"error"' "${retry_out}" >/dev/null 2>&1 || probe_fail 'retry did not produce a terminal WS frame'
probe_pass 'vLLM mid-request crash produced structured error and retry recovered after restart'
