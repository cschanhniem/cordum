#!/usr/bin/env bash
# Probe 08 — prefix-caching amortization
#
# Failure mode: --enable-prefix-caching is configured but ineffective, so every repeated tool-list turn pays full prefill.
# Acceptance criteria: repeated same-prefix turns drive vLLM prefix cache hit rate above 30% and the hit-rate curve is archived.
# Expected recovery time: n/a; steady-state metric after warm-up.
# Nightly/manual marker: gpu-nightly.

set -euo pipefail
PROBE_ID="llmchat_probe_08_prefix_caching"
# shellcheck source=tests/ops/llmchat_common.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/llmchat_common.sh"
probe_init
write_probe_manifest 'prefix cache hit-rate on repeated tool-list prompts' 'vllm:prefix_cache_hit_rate > 30%; metrics curve archived' 'steady-state after warm-up' 'gpu-nightly'
require_real_vllm
require_go
require_chat_api_key
turns="${LLMCHAT_OPS_PREFIX_TURNS:-100}"
turn_timeout="${LLMCHAT_OPS_PREFIX_TURN_TIMEOUT_SECONDS:-90}"
metric_pattern='vllm:prefix_cache_hit_rate|vllm_prefix_cache_hit_rate'
metrics_curve="${PROBE_OUT_DIR}/prefix-cache-hit-rate.tsv"
: >"${metrics_curve}"
record_section 'baseline metric'
scrape_vllm_metric "${metric_pattern}" >"${PROBE_OUT_DIR}/prefix-metrics-before.txt" 2>>"${EVIDENCE_FILE}" || log_evidence 'prefix_metric_before=unavailable'

messages_file="${PROBE_OUT_DIR}/prefix-messages.json"
${PYTHON_BIN:-python} - "${turns}" >"${messages_file}" <<'PY'
import json, sys
n=int(sys.argv[1])
base="Use the available Cordum tools. First list the available jobs with the same small limit, then answer with exactly one sentence. Repeated prefix cache probe turn"
print(json.dumps([f"{base} {i}." for i in range(1,n+1)]))
PY
ws_out="${PROBE_OUT_DIR}/prefix-cache-ws.jsonl"
set +e
run_ws_client "${ws_out}" "$(cat "${messages_file}")" "${turn_timeout}" true
ws_code=$?
set -e
log_evidence "prefix_ws_exit=${ws_code}"
[ "${ws_code}" -eq 0 ] || probe_fail 'prefix-cache repeated turns did not complete'
assert_no_bang_stream "${ws_out}"

record_section 'post-run metric samples'
for i in $(seq 1 10); do
  sample="${PROBE_OUT_DIR}/prefix-metrics-sample-${i}.txt"
  if scrape_vllm_metric "${metric_pattern}" >"${sample}" 2>>"${EVIDENCE_FILE}"; then
    value="$(${PYTHON_BIN:-python} - "${sample}" <<'PY'
import re, sys
vals=[]
for line in open(sys.argv[1], encoding='utf-8'):
    if line.startswith('#'): continue
    m=re.search(r'([-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)\s*$', line.strip())
    if m: vals.append(float(m.group(1)))
print(vals[-1] if vals else '')
PY
)"
    printf '%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${value}" >>"${metrics_curve}"
  else
    printf '%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "unavailable" >>"${metrics_curve}"
  fi
  sleep 2
done
sed -e 's/^/prefix_cache_curve: /' "${metrics_curve}" >>"${EVIDENCE_FILE}"
max_hit="$(${PYTHON_BIN:-python} - "${metrics_curve}" <<'PY'
import sys
vals=[]
for line in open(sys.argv[1], encoding='utf-8'):
    parts=line.strip().split('\t')
    if len(parts)>=2:
        try: vals.append(float(parts[1]))
        except Exception: pass
print(max(vals) if vals else '')
PY
)"
[ -n "${max_hit}" ] || probe_fail 'prefix cache metric unavailable; cannot prove amortization'
log_evidence "prefix_cache_hit_rate_max=${max_hit}"
${PYTHON_BIN:-python} - "${max_hit}" <<'PY' || probe_fail "prefix cache hit rate ${max_hit} <= 0.30"
import sys
sys.exit(0 if float(sys.argv[1]) > 0.30 else 1)
PY
probe_pass "prefix cache hit rate exceeded 30% (max=${max_hit}) over ${turns} repeated turns"
