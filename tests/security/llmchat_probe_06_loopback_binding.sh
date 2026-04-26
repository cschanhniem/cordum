#!/usr/bin/env bash
set -euo pipefail
PROBE_ID="llmchat_probe_06_loopback_binding"
# shellcheck source=tests/security/llmchat_common.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/llmchat_common.sh"
probe_init
write_probe_manifest "compose publishes vLLM on host loopback only; Helm exposes qwen-inference as ClusterIP only"
record_section "attack payload"
log_evidence 'payload: change compose port to 0.0.0.0:8000:8000 or bare 8000:8000, or Helm Service.type=LoadBalancer/NodePort; expected static lint/probe failure before deploy.'

for file in docker-compose.yml docker-compose.release.yml; do
  assert_file_contains "${file}" '127\.0\.0\.1:8000:8000' "compose vLLM host port must bind loopback"
  assert_file_not_contains "${file}" '^[[:space:]]*-[[:space:]]+"?0\.0\.0\.0:8000:8000"?[[:space:]]*$' "compose vLLM must not bind wildcard host"
  assert_file_not_contains "${file}" '^[[:space:]]*-[[:space:]]+"?8000:8000"?[[:space:]]*$' "compose vLLM must not use bare host-port mapping"
done
assert_file_contains "cordum-helm/templates/service-qwen-inference.yaml" 'type:[[:space:]]+ClusterIP' "Helm qwen-inference Service must be ClusterIP"
assert_file_not_contains "cordum-helm/templates/service-qwen-inference.yaml" 'LoadBalancer|NodePort' "Helm qwen-inference Service must never expose externally"

run_capture "docker compose llmchat config" bash -lc 'CORDUM_API_KEY=dummy REDIS_PASSWORD=dummy docker compose -f docker-compose.yml --profile llmchat config -q' || probe_fail "docker compose llmchat config failed"
run_capture "docker compose release llmchat config" bash -lc 'CORDUM_API_KEY=dummy REDIS_PASSWORD=dummy CORDUM_TLS_DIR=./certs SAFETY_POLICY_PUBLIC_KEY=dummy SAFETY_POLICY_SIGNATURE=dummy docker compose -f docker-compose.release.yml --profile llmchat config -q' || probe_fail "docker compose release llmchat config failed"
run_capture "compose loopback lint" bash tools/scripts/vllm_config_lint.sh || probe_fail "vLLM compose loopback lint failed"
run_capture "Helm ClusterIP lint" bash tools/scripts/vllm_helm_lint.sh || probe_fail "vLLM Helm ClusterIP lint failed"

render="${PROBE_OUT_DIR}/helm-render.yaml"
run_helm_template "${REPO_ROOT}/cordum-helm" --set secrets.apiKey=lint-dummy --set redis.auth.password=lint-dummy >"${render}" 2>>"${EVIDENCE_FILE}" || probe_fail "helm template failed"
assert_text_contains "${render}" 'kind:[[:space:]]+Service' "rendered Helm must contain Service objects"
assert_text_contains "${render}" 'qwen-inference' "rendered Helm must include qwen-inference Service"
assert_text_contains "${render}" 'type:[[:space:]]+ClusterIP' "rendered qwen-inference Service must be ClusterIP"
assert_text_not_contains "${render}" 'type:[[:space:]]+(LoadBalancer|NodePort)' "rendered Helm must not expose qwen-inference externally"

if [ "${LLMCHAT_SECURITY_LIVE:-0}" = "1" ]; then
  host_body="${PROBE_OUT_DIR}/vllm-host-loopback.body"
  status=$(curl_status_body "host loopback vLLM models" "${host_body}" "${VLLM_URL}/v1/models") || true
  assert_http_status_in "${status}" "200,000" "host loopback check must be deterministic; 200 when vLLM is up, 000 when local no-GPU stack is down"
  ext_host="${LLMCHAT_SECURITY_EXTERNAL_HOST:-host.docker.internal}"
  ext_body="${PROBE_OUT_DIR}/vllm-external.body"
  ext_status=$(curl_status_body "external interface vLLM should refuse" "${ext_body}" "http://${ext_host}:8000/v1/models") || true
  assert_http_status_in "${ext_status}" "000,403,404" "external interface must not expose vLLM models"
else
  log_evidence "live_loopback=not_run reason=set LLMCHAT_SECURITY_LIVE=1 after clean compose-up to curl host/external/intra-network paths"
fi

probe_pass "loopback/ClusterIP exposure checks passed"
