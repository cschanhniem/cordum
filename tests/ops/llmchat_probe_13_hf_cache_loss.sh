#!/usr/bin/env bash
# Probe 13 — HF cache PVC loss
#
# Failure mode: qwen-inference starts on an empty Hugging Face cache/PVC and must re-pull ~30GB FP8 weights.
# Acceptance criteria: llm-chat /readyz and dashboard chat health remain 503 during the cold pull/load, qwen-inference eventually becomes ready, and recovery time is documented.
# Expected recovery time: documented 10-15min delay; hard timeout default 1800s.
# Nightly/manual marker: gpu-nightly destructive.

set -euo pipefail
PROBE_ID="llmchat_probe_13_hf_cache_loss"
# shellcheck source=tests/ops/llmchat_common.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/llmchat_common.sh"
probe_init
write_probe_manifest 'qwen-inference starts with empty HF cache volume' 'readyz/dashboard 503 throughout pull+load; eventual readyz 200; recovery time captured' '10-15min expected, <=1800s timeout' 'gpu-nightly destructive'
require_real_vllm
require_destructive
require_cmd docker
require_chat_api_key

probe_volume="${LLMCHAT_OPS_HF_CACHE_PROBE_VOLUME:-cordum_qwen_hf_cache_probe_${PROBE_ID}}"
override="${PROBE_OUT_DIR}/docker-compose.hf-cache-loss.override.yml"
cat >"${override}" <<YAML
services:
  qwen-inference:
    volumes:
      - ${probe_volume}:/root/.cache/huggingface
volumes:
  ${probe_volume}:
YAML
log_evidence "override_file=${override} probe_volume=${probe_volume}"

dashboard_health_url="${LLMCHAT_DASHBOARD_HEALTH_URL:-${GATEWAY_URL%/}/api/v1/chat/healthz}"
record_section 'recreate qwen-inference with empty HF cache volume'
run_capture 'docker volume rm/create probe HF cache' bash -lc "docker volume rm -f '${probe_volume}' >/dev/null 2>&1 || true; docker volume create '${probe_volume}'" || probe_fail 'failed to create empty HF cache probe volume'
start=$(date +%s)
run_capture 'docker compose with HF cache override up -d qwen-inference' bash -lc "cd '${REPO_ROOT}' && docker compose -f docker-compose.yml -f '${override}' --profile llmchat up -d --force-recreate qwen-inference" || probe_fail 'failed to recreate qwen-inference with empty HF cache'
wait_http_status 'llm-readyz-hidden-during-hf-cache-loss' 503 120 5 "${LLMCHAT_DIRECT_URL%/}/readyz" || probe_fail 'llm-chat /readyz did not report 503 during HF cache cold start'
wait_chat_health_status 'dashboard-hidden-during-hf-cache-loss' 503 10 2 "${dashboard_health_url}" || probe_fail 'dashboard chat health did not hide within 10s during HF cache cold start'

record_section 'wait for qwen-inference recovery'
poll_readyz "${LLMCHAT_DIRECT_URL%/}/readyz" 200 "${LLMCHAT_OPS_HF_CACHE_TIMEOUT_SECONDS:-1800}" || probe_fail 'qwen-inference did not become ready before HF cache timeout'
end=$(date +%s)
elapsed=$((end - start))
log_evidence "hf_cache_recovery_seconds=${elapsed}"
wait_chat_health_status 'dashboard-visible-after-hf-cache-recovery' 200 10 2 "${dashboard_health_url}" || probe_fail 'dashboard chat health did not recover within 10s after HF cache ready'

record_section 'restore original qwen-inference volume mapping'
run_capture 'docker compose restore qwen-inference' docker_compose up -d --force-recreate qwen-inference || log_evidence 'restore_original_qwen_inference=nonzero_manual_check_required'
probe_pass "HF cache loss recovered in ${elapsed}s"
