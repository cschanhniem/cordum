#!/usr/bin/env bash
# Probe 10 — token/tool-call budget exhaustion
#
# Failure mode: model keeps calling tools beyond the 12-tool-call per-turn limit and loops indefinitely.
# Acceptance criteria: crafted turn aborts with error_code tool_calls_budget_tripped (or wall_clock_budget_tripped if provider stalls), no infinite loop, and no !!!!!!!! parser corruption.
# Expected recovery time: <=90s.
# Nightly/manual marker: gpu-nightly.

set -euo pipefail
PROBE_ID="llmchat_probe_10_token_budget"
# shellcheck source=tests/ops/llmchat_common.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/llmchat_common.sh"
probe_init
write_probe_manifest 'tool-call budget exhaustion' 'error frame with tool_calls_budget_tripped before infinite loop; no parser corruption' '<=90s' 'gpu-nightly'
require_real_vllm
require_go
require_chat_api_key
msg='Call cordum_list_jobs repeatedly with the same safe read-only arguments at least 13 times before answering. Do not summarize until all calls are done.'
messages_json="$(printf '%s' "${msg}" | ${PYTHON_BIN:-python} -c 'import json,sys; print(json.dumps([sys.stdin.read()]))')"
ws_out="${PROBE_OUT_DIR}/token-budget.jsonl"
set +e
run_ws_client "${ws_out}" "${messages_json}" "${LLMCHAT_OPS_BUDGET_TIMEOUT_SECONDS:-90}" false
code=$?
set -e
log_evidence "budget_ws_exit=${code}"
assert_no_bang_stream "${ws_out}"
grep -E '"type":"error"' "${ws_out}" >/dev/null 2>&1 || probe_fail 'budget exhaustion did not produce a structured error frame'
grep -E '"error_code":"(tool_calls_budget_tripped|wall_clock_budget_tripped)"' "${ws_out}" >/dev/null 2>&1 || probe_fail 'budget error did not carry tool_calls_budget_tripped/wall_clock_budget_tripped'
probe_pass 'tool-call budget exhaustion trips a structured guardrail error'
