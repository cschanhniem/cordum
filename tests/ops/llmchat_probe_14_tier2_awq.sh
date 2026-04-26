#!/usr/bin/env bash
# Probe 14 — Tier 2 RTX 5090 / PRO 6000 AWQ perf budget
#
# Failure mode: AWQ checkpoint on consumer/pro GPU either loses tool-call accuracy or misses the documented 988-1207 tok/s budget.
# Acceptance criteria: AWQ model deployed, 15-turn tool conversation completes with >=20 tool calls, throughput metric >=988 tok/s, and 10 eval prompts all reach terminal frames.
# Expected recovery time: model rollout <=900s on prepared Tier 2 node.
# Nightly/manual marker: tier2-manual destructive.

set -euo pipefail
PROBE_ID="llmchat_probe_14_tier2_awq"
# shellcheck source=tests/ops/llmchat_common.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/llmchat_common.sh"
probe_init
write_probe_manifest 'Tier 2 AWQ model throughput and tool accuracy' 'tool calling works; tok/s >=988; 10 eval prompts terminal; no qwen parser corruption' '<=900s rollout' 'tier2-manual destructive'
if [ "${LLMCHAT_OPS_TIER2_LIVE:-0}" != '1' ]; then
  probe_skip 'Tier 2 hardware probe disabled; rerun on RTX 5090/PRO 6000 with LLMCHAT_OPS_TIER2_LIVE=1'
fi
require_destructive
require_helm
require_kubectl
require_go
require_chat_api_key
model="${LLMCHAT_OPS_TIER2_MODEL:-QuantTrio/Qwen3-Coder-30B-A3B-Instruct-AWQ}"
namespace="${LLMCHAT_OPS_K8S_NAMESPACE:-cordum}"
release="${LLMCHAT_OPS_HELM_RELEASE:-cordum}"
chart="${LLMCHAT_OPS_HELM_CHART:-${REPO_ROOT}/cordum-helm}"
record_section 'deploy AWQ model via Helm'
"${HELM_BIN}" upgrade --install "${release}" "${chart}" -n "${namespace}" --create-namespace \
  --set qwenInference.model="${model}" \
  --set qwenInference.kvCacheDtype=fp8 \
  --set secrets.apiKey="${CHAT_API_KEY}" \
  ${LLMCHAT_OPS_HELM_EXTRA_ARGS:-} >>"${EVIDENCE_FILE}" 2>&1 || probe_fail 'helm upgrade/install for Tier 2 AWQ failed'
"${KUBECTL_BIN}" -n "${namespace}" rollout status deployment/"${LLMCHAT_OPS_K8S_QWEN_DEPLOYMENT:-qwen-inference}" --timeout="${LLMCHAT_OPS_TIER2_ROLLOUT_TIMEOUT:-900s}" >>"${EVIDENCE_FILE}" 2>&1 || probe_fail 'qwen-inference AWQ rollout did not complete'
poll_readyz "${LLMCHAT_DIRECT_URL%/}/readyz" 200 900 || probe_fail 'llm-chat /readyz did not recover after AWQ rollout'

record_section 'AWQ 15-turn tool conversation'
ws_out="${PROBE_OUT_DIR}/tier2-awq-tool-conversation.jsonl"
${PYTHON_BIN:-python} - >"${PROBE_OUT_DIR}/tier2-messages.json" <<'PY'
import json
print(json.dumps([f"Tier2 AWQ turn {i}: list jobs, query policy, and summarize in one concise sentence." for i in range(1,16)]))
PY
run_ws_client "${ws_out}" "$(cat "${PROBE_OUT_DIR}/tier2-messages.json")" "${LLMCHAT_OPS_TIER2_TURN_TIMEOUT_SECONDS:-120}" true || probe_fail 'Tier 2 AWQ tool conversation failed'
assert_no_bang_stream "${ws_out}"
tool_calls="$(count_ws_frames "${ws_out}" tool_call)"
log_evidence "tier2_tool_call_frames=${tool_calls}"
[ "${tool_calls}" -ge "${LLMCHAT_OPS_MIN_TOOL_CALLS:-20}" ] || probe_fail "Tier 2 AWQ tool calls=${tool_calls}, want >=${LLMCHAT_OPS_MIN_TOOL_CALLS:-20}"

record_section 'throughput metric'
metric_file="${PROBE_OUT_DIR}/tier2-throughput-metrics.txt"
scrape_vllm_metric 'vllm:.*throughput.*(tok|token)|vllm_.*throughput.*(tok|token)' >"${metric_file}" 2>>"${EVIDENCE_FILE}" || probe_fail 'Tier 2 throughput metric unavailable'
throughput="$(metric_max_value "${metric_file}")"
[ -n "${throughput}" ] || probe_fail 'could not parse Tier 2 throughput metric'
log_evidence "tier2_throughput_tok_s=${throughput}"
${PYTHON_BIN:-python} - "${throughput}" <<'PY' || probe_fail "Tier 2 throughput ${throughput} tok/s below 988 budget"
import sys
sys.exit(0 if float(sys.argv[1]) >= 988.0 else 1)
PY

record_section '10-prompt terminal eval'
eval_out="${PROBE_OUT_DIR}/tier2-eval.jsonl"
${PYTHON_BIN:-python} - >"${PROBE_OUT_DIR}/tier2-eval-messages.json" <<'PY'
import json
prompts=[
"list jobs", "query policy for submit_job", "summarize last approvals", "list workflows", "explain tenant scope",
"submit safe demo job amount 1", "show recent job statuses", "query policy bundle name", "list agents", "explain approval gate"
]
print(json.dumps(prompts))
PY
run_ws_client "${eval_out}" "$(cat "${PROBE_OUT_DIR}/tier2-eval-messages.json")" 120 true || probe_fail 'Tier 2 10-prompt eval failed terminal-frame requirement'
probe_pass "Tier 2 AWQ met tool-call and throughput budget (${throughput} tok/s)"
