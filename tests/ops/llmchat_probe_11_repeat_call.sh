#!/usr/bin/env bash
# Probe 11 — repeat-call detector
#
# Failure mode: model repeats the exact same tool call with identical args, wasting budget or looping.
# Acceptance criteria: duplicate same-tool/same-args turn aborts with error_code repeat_tool_call and explanatory error_msg.
# Expected recovery time: <=90s.
# Nightly/manual marker: gpu-nightly.

set -euo pipefail
PROBE_ID="llmchat_probe_11_repeat_call"
# shellcheck source=tests/ops/llmchat_common.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/llmchat_common.sh"
probe_init
write_probe_manifest 'same tool called twice with identical arguments' 'repeat_tool_call error frame with explanation; no infinite loop' '<=90s' 'gpu-nightly'
require_real_vllm
require_go
require_chat_api_key
msg='For validation, call cordum_list_jobs with arguments {"limit":5} twice in a row before replying. Use exactly identical arguments both times.'
messages_json="$(printf '%s' "${msg}" | ${PYTHON_BIN:-python} -c 'import json,sys; print(json.dumps([sys.stdin.read()]))')"
ws_out="${PROBE_OUT_DIR}/repeat-call.jsonl"
set +e
run_ws_client "${ws_out}" "${messages_json}" "${LLMCHAT_OPS_REPEAT_TIMEOUT_SECONDS:-90}" false
code=$?
set -e
log_evidence "repeat_ws_exit=${code}"
assert_no_bang_stream "${ws_out}"
grep -E '"type":"error"' "${ws_out}" >/dev/null 2>&1 || probe_fail 'repeat call did not produce a structured error frame'
grep -E '"error_code":"repeat_tool_call"' "${ws_out}" >/dev/null 2>&1 || probe_fail 'repeat call detector did not emit repeat_tool_call'
grep -Ei 'called twice|identical|repeat' "${ws_out}" >/dev/null 2>&1 || probe_fail 'repeat call error lacks explanatory message'
probe_pass 'repeat-call detector tripped with structured explanation'
