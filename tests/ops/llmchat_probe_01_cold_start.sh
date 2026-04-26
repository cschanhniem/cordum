#!/usr/bin/env bash
# Probe 01 — vLLM cold start readiness and dashboard hide gate
#
# Failure mode: qwen-inference restarts while FP8 weights load.
# Acceptance criteria: llm-chat /readyz returns 503 during load, dashboard health gate returns 503 within 10s, readyz returns 200 within 600s and dashboard health gate returns 200 within 10s.
# Expected recovery time: <=600s cold start; <=10s dashboard visibility transitions.
# Nightly/manual marker: gpu-nightly, destructive.

set -euo pipefail
PROBE_ID="llmchat_probe_01_cold_start"
# shellcheck source=tests/ops/llmchat_common.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/llmchat_common.sh"
probe_init
write_probe_manifest 'qwen-inference restarts while FP8 weights load' 'llm-chat /readyz and gateway chat health return 503 during load, then recover to 200; dashboard poll gate follows within 10s' '<=600s cold start; <=10s dashboard visibility transitions' 'gpu-nightly destructive'
record_section 'setup'
log_evidence 'destructive=true command=docker compose restart qwen-inference; requires real vLLM, not docker-compose.dev.yml mock'
require_real_vllm
require_destructive
require_cmd curl
require_cmd docker
require_chat_api_key

runs="${LLMCHAT_OPS_COLD_START_RUNS:-3}"
readyz_url="${LLMCHAT_DIRECT_URL%/}/readyz"
dashboard_health_url="${LLMCHAT_DASHBOARD_HEALTH_URL:-${GATEWAY_URL%/}/api/v1/chat/healthz}"
times_file="${PROBE_OUT_DIR}/cold-start-seconds.txt"
: >"${times_file}"

for run in $(seq 1 "${runs}"); do
  record_section "cold start run ${run}/${runs}"
  poll_readyz "${readyz_url}" 200 120 || probe_fail "llm-chat not ready before cold-start run ${run}"
  start=$(date +%s)
  run_capture "docker compose restart qwen-inference run ${run}" docker_compose restart qwen-inference || probe_fail 'docker compose restart qwen-inference failed'
  wait_http_status "llm-readyz-degraded-run-${run}" 503 60 5 "${readyz_url}" || probe_fail "llm-chat /readyz did not return 503 during vLLM cold start run ${run}"
  wait_chat_health_status "dashboard-chat-health-hidden-run-${run}" 503 10 2 "${dashboard_health_url}" || probe_fail "dashboard chat health gate did not hide within 10s run ${run}"
  poll_readyz "${readyz_url}" 200 600 || probe_fail "llm-chat /readyz did not recover within 600s run ${run}"
  wait_chat_health_status "dashboard-chat-health-visible-run-${run}" 200 10 2 "${dashboard_health_url}" || probe_fail "dashboard chat health gate did not reappear within 10s run ${run}"
  end=$(date +%s)
  elapsed=$((end - start))
  printf '%s\n' "${elapsed}" >>"${times_file}"
  log_evidence "cold_start_seconds_run_${run}=${elapsed}"
done

record_section 'cold-start summary'
sort -n "${times_file}" | sed -e 's/^/cold_start_seconds_sorted: /' >>"${EVIDENCE_FILE}"
if [ -n "${PYTHON_BIN}" ]; then
  ${PYTHON_BIN} - "${times_file}" >>"${EVIDENCE_FILE}" <<'PY'
import statistics, sys
vals=[int(x.strip()) for x in open(sys.argv[1], encoding='utf-8') if x.strip()]
print(f"cold_start_min={min(vals)}")
print(f"cold_start_median={statistics.median(vals)}")
print(f"cold_start_max={max(vals)}")
PY
fi
probe_pass "vLLM cold-start readiness/dashboard gate recovered across ${runs} run(s)"
