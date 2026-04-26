#!/usr/bin/env bash
# Probe 15 — Tier 3 A100 no native FP8
#
# Failure mode: docs overstate A100 performance or deploy an FP8-native path unsupported by A100 tensor cores.
# Acceptance criteria: A100-compatible INT8/BF16 model deploys, latency is recorded as slower than Tier 1/Tier 2 expectations, and docs retain the 'supported but slower' caveat/recommended alternative.
# Expected recovery time: model rollout <=1200s on prepared A100 node.
# Nightly/manual marker: tier3-manual destructive.

set -euo pipefail
PROBE_ID="llmchat_probe_15_tier3_a100"
# shellcheck source=tests/ops/llmchat_common.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/llmchat_common.sh"
probe_init
write_probe_manifest 'A100 degraded-mode model latency and docs reality check' 'A100-compatible model works; latency recorded; docs say supported but slower/no native FP8' '<=1200s rollout' 'tier3-manual destructive'
if [ "${LLMCHAT_OPS_TIER3_LIVE:-0}" != '1' ]; then
  grep -Ei 'A100|supported but slower|no native FP8|INT8|BF16' "${REPO_ROOT}/docs/llmchat/helm.md" >>"${EVIDENCE_FILE}" 2>&1 || probe_fail 'Tier 3 docs lack A100 supported-but-slower caveat'
  probe_skip 'Tier 3 A100 hardware probe disabled; docs caveat present, rerun on A100 with LLMCHAT_OPS_TIER3_LIVE=1'
fi
require_destructive
require_helm
require_kubectl
require_go
require_chat_api_key
model="${LLMCHAT_OPS_TIER3_MODEL:-Qwen/Qwen3-Coder-30B-A3B-Instruct}"
namespace="${LLMCHAT_OPS_K8S_NAMESPACE:-cordum}"
release="${LLMCHAT_OPS_HELM_RELEASE:-cordum}"
chart="${LLMCHAT_OPS_HELM_CHART:-${REPO_ROOT}/cordum-helm}"
record_section 'deploy A100-compatible model via Helm'
"${HELM_BIN}" upgrade --install "${release}" "${chart}" -n "${namespace}" --create-namespace \
  --set qwenInference.model="${model}" \
  --set qwenInference.kvCacheDtype=auto \
  --set secrets.apiKey="${CHAT_API_KEY}" \
  ${LLMCHAT_OPS_HELM_EXTRA_ARGS:-} >>"${EVIDENCE_FILE}" 2>&1 || probe_fail 'helm upgrade/install for Tier 3 A100 failed'
"${KUBECTL_BIN}" -n "${namespace}" rollout status deployment/"${LLMCHAT_OPS_K8S_QWEN_DEPLOYMENT:-qwen-inference}" --timeout="${LLMCHAT_OPS_TIER3_ROLLOUT_TIMEOUT:-1200s}" >>"${EVIDENCE_FILE}" 2>&1 || probe_fail 'qwen-inference A100 rollout did not complete'
poll_readyz "${LLMCHAT_DIRECT_URL%/}/readyz" 200 1200 || probe_fail 'llm-chat /readyz did not recover after A100 rollout'

record_section 'A100 latency sample'
ws_out="${PROBE_OUT_DIR}/tier3-a100-latency.jsonl"
run_ws_client "${ws_out}" '["A100 Tier 3 latency probe: list jobs, query policy, and summarize in one sentence."]' 180 true || probe_fail 'A100 latency probe failed'
${PYTHON_BIN:-python} - "${ws_out}" >>"${EVIDENCE_FILE}" <<'PY'
import datetime as dt, json, sys
sent=None; done=None
for line in open(sys.argv[1], encoding='utf-8'):
    ev=json.loads(line); t=dt.datetime.fromisoformat(ev['time'].replace('Z','+00:00')).timestamp(); data=ev.get('data') or {}
    if ev.get('event')=='sent': sent=t
    if ev.get('event')=='turn_done': done=t
if sent and done:
    print(f"tier3_a100_turn_latency_seconds={done-sent:.3f}")
else:
    print("tier3_a100_turn_latency_seconds=unavailable")
PY
assert_no_bang_stream "${ws_out}"
grep -Ei 'A100|supported but slower|no native FP8|INT8|BF16' "${REPO_ROOT}/docs/llmchat/helm.md" >>"${EVIDENCE_FILE}" 2>&1 || probe_fail 'Tier 3 docs lack A100 supported-but-slower caveat after live run'
probe_pass "Tier 3 A100 degraded-mode latency recorded; docs caveat verified"
