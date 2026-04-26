#!/usr/bin/env bash
set -euo pipefail
PROBE_ID="llmchat_probe_05_parser_pinning"
# shellcheck source=tests/security/llmchat_common.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/llmchat_common.sh"
probe_init
write_probe_manifest "qwen3_xml parser is hardcoded in compose and Helm; qwen3_coder/hermes cannot be introduced by values/env override"
record_section "attack payload"
log_evidence 'payload: malicious operator sets --set qwenInference.toolCallParser=qwen3_coder or swaps compose parser to hermes; expected CI/probe fail-closed and rendered Deployment still uses qwen3_xml.'

for file in docker-compose.yml docker-compose.release.yml; do
  assert_file_contains "${file}" '^[[:space:]]*-[[:space:]]+qwen3_xml[[:space:]]*$' "compose parser must be qwen3_xml"
  assert_file_not_contains "${file}" '^[[:space:]]*-[[:space:]]+(qwen3_coder|hermes)[[:space:]]*$' "compose parser must not be qwen3_coder/hermes"
  assert_file_contains "${file}" 'Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8' "compose model must keep FP8 suffix"
  assert_file_contains "${file}" '--disable-log-requests' "compose vLLM must suppress prompt/request logging"
done

assert_file_contains "cordum-helm/templates/deployment-qwen-inference.yaml" 'qwen3_xml' "Helm template must contain qwen3_xml"
assert_file_not_contains "cordum-helm/templates/deployment-qwen-inference.yaml" 'qwenInference\.toolCallParser' "Helm parser must be hardcoded, not value-driven"
assert_file_not_contains "cordum-helm/templates/deployment-qwen-inference.yaml" 'qwen3_coder|hermes' "Helm template must not mention disallowed parsers"
assert_file_contains "cordum-helm/templates/deployment-qwen-inference.yaml" '--disable-log-requests' "Helm vLLM must suppress prompt/request logging"

run_capture "compose vLLM config lint" bash tools/scripts/vllm_config_lint.sh || probe_fail "compose vLLM config lint failed"
run_capture "compose vLLM negative lint tests" bash tools/scripts/vllm_config_lint_test.sh || probe_fail "compose vLLM negative lint tests failed"
run_capture "Helm vLLM lint" bash tools/scripts/vllm_helm_lint.sh || probe_fail "Helm vLLM lint failed"

render="${PROBE_OUT_DIR}/helm-parser-override.yaml"
record_section "helm override negative test"
log_evidence '+ helm template cordum-helm --set qwenInference.toolCallParser=qwen3_coder ...'
run_helm_template "${REPO_ROOT}/cordum-helm" --set secrets.apiKey=lint-dummy --set redis.auth.password=lint-dummy --set qwenInference.toolCallParser=qwen3_coder >"${render}" 2>>"${EVIDENCE_FILE}" || probe_fail "helm template with parser override failed to render"
assert_text_contains "${render}" '^[[:space:]]*-[[:space:]]+"?qwen3_xml"?[[:space:]]*$' "rendered Helm must still use hardcoded qwen3_xml under malicious override"
assert_text_not_contains "${render}" '^[[:space:]]*-[[:space:]]+"?(qwen3_coder|hermes)"?[[:space:]]*$' "rendered Helm must not include disallowed parser under malicious override"

probe_pass "parser pinning fail-closed checks passed"
