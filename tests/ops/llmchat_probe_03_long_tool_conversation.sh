#!/usr/bin/env bash
# Probe 03 — long-tool-conversation qwen3_xml parser sanity
#
# Failure mode: long Qwen tool-heavy conversations corrupt into infinite !!!!!!!! streams or malformed assistant_delta frames.
# Acceptance criteria: 15+ turns, >=20 tool_call frames, zero !!!!!!!! sequences, no oversize (>64KiB) WS frame lines, and terminal frames for every turn.
# Expected recovery time: normal turn completion <=120s/turn on Tier 1 H100.
# Nightly/manual marker: gpu-nightly.

set -euo pipefail
PROBE_ID="llmchat_probe_03_long_tool_conversation"
# shellcheck source=tests/ops/llmchat_common.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/llmchat_common.sh"
probe_init
write_probe_manifest '15+ turn conversation with 20+ MCP tool calls' '>=20 tool_call frames, no !!!!!!!! parser corruption, no WS frame overflow, terminal frame each turn' '<=120s per turn' 'gpu-nightly'
require_real_vllm
require_go
require_chat_api_key

messages_file="${PROBE_OUT_DIR}/long-tool-messages.json"
${PYTHON_BIN:-python} - >"${messages_file}" <<'PY'
import json
msgs=[]
for i in range(1,16):
    if i % 5 == 0:
        msgs.append(f"Turn {i}: submit a safe demo job for the mock-bank pack with amount 1 USD, then summarize the job id.")
    elif i % 3 == 0:
        msgs.append(f"Turn {i}: query policy for whether chat-assistant can submit demo jobs, then list the latest jobs.")
    else:
        msgs.append(f"Turn {i}: list the latest jobs and explain their statuses in one sentence.")
print(json.dumps(msgs))
PY
messages_json="$(cat "${messages_file}")"
ws_out="${PROBE_OUT_DIR}/long-tool-conversation.jsonl"
run_ws_client "${ws_out}" "${messages_json}" "${LLMCHAT_OPS_LONG_TURN_TIMEOUT_SECONDS:-120}" true || probe_fail 'long tool conversation did not complete every turn with a terminal frame'
assert_no_bang_stream "${ws_out}"
tool_calls="$(count_ws_frames "${ws_out}" tool_call)"
finals="$(count_ws_frames "${ws_out}" final)"
errors="$(count_ws_frames "${ws_out}" error)"
log_evidence "tool_call_frames=${tool_calls} final_frames=${finals} error_frames=${errors}"
[ "${tool_calls}" -ge "${LLMCHAT_OPS_MIN_TOOL_CALLS:-20}" ] || probe_fail "tool_call_frames=${tool_calls}, want >=${LLMCHAT_OPS_MIN_TOOL_CALLS:-20}"
if awk 'length($0) > 65536 { bad=1 } END { exit bad ? 0 : 1 }' "${ws_out}"; then
  probe_fail 'captured WS JSONL contains a frame line >64KiB (frame overflow risk)'
fi
probe_pass "long tool conversation stable: tool_call_frames=${tool_calls}, finals=${finals}, errors=${errors}"
