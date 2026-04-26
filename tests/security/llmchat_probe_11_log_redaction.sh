#!/usr/bin/env bash
set -euo pipefail
PROBE_ID="llmchat_probe_11_log_redaction"
# shellcheck source=tests/security/llmchat_common.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/llmchat_common.sh"
probe_init
write_probe_manifest "no prompt/token/API-key/JWT leakage in llm-chat/gateway/vLLM logs; vLLM prompt logging remains DEBUG/off by default"
record_section "attack payload"
log_evidence 'payload: 50 turns/min synthetic load containing sk-test-<random>, JWT-looking eyJ..., and Bearer <random>; expected grep -RE secret patterns returns zero hits across llm-chat, gateway, scheduler, vLLM logs.'

assert_file_contains "core/llmchat/redactor.go" 'authHeaderPattern' "llmchat redactor must scrub Authorization/Bearer strings"
assert_file_contains "core/llmchat/redactor.go" 'sensitiveEnvPattern' "llmchat redactor must scrub env-style secrets"
assert_file_contains "cmd/cordum-llm-chat/main.go" 'slog\.Info\("cordum-llm-chat listening"' "llm-chat startup logging should be structured and bounded"
assert_file_not_contains "core/llmchat/agent.go" 'slog\.(Debug|Info|Warn|Error).*UserMessage|slog\.(Debug|Info|Warn|Error).*ToolResult' "agent must not log user prompts or tool results"
assert_file_not_contains "core/llmchat/provider_openai.go" 'slog\.(Debug|Info|Warn|Error).*Authorization|slog\.(Debug|Info|Warn|Error).*APIKey|slog\.(Debug|Info|Warn|Error).*requestBody' "OpenAI/vLLM provider must not log auth headers or prompt bodies"
assert_file_contains "docker-compose.yml" 'VLLM_LOGGING_LEVEL=WARNING|--disable-log-requests|VLLM_DISABLE_LOG_REQUESTS' "compose should suppress vLLM request/prompt logs"

run_go_test "go test redaction and secret non-leak" ./core/llmchat -run 'TestRedactor_|TestTurn_RedactsSecretsInToolResults|TestOpenAIProvider_AuthHeader' -count=1 || probe_fail "llmchat redaction/provider auth tests failed"
run_go_test "go test MCP redaction" ./core/mcp -run 'TestDefaultRedactor_' -count=1 || probe_fail "core/mcp default redactor tests failed"
run_go_test "go test auth logging avoids raw keys" ./core/controlplane/gateway/auth -run 'TestNewBasicAuthProviderLogsAPIKeySource|TestParseAPIKeysFormats' -count=1 || probe_fail "gateway auth logging/key parsing tests failed"

if [ -n "${LLMCHAT_SECURITY_LOG_DIR:-}" ]; then
  assert_no_secret_patterns_in_dir "${LLMCHAT_SECURITY_LOG_DIR}" "provided log directory must not contain probe secret patterns"
else
  log_evidence "log_dir_scan=not_run reason=LLMCHAT_SECURITY_LOG_DIR not provided"
fi

if [ "${LLMCHAT_SECURITY_LIVE:-0}" = "1" ] && [ "${LLMCHAT_SECURITY_RUN_LOAD:-0}" = "1" ]; then
  duration_seconds="${LLMCHAT_SECURITY_LOAD_SECONDS:-3600}"
  turns_per_min="${LLMCHAT_SECURITY_TURNS_PER_MIN:-50}"
  record_section "live load test"
  log_evidence "duration_seconds=${duration_seconds} turns_per_min=${turns_per_min}"
  end=$((SECONDS + duration_seconds))
  interval=$(awk "BEGIN { printf \"%.3f\", 60/${turns_per_min} }")
  i=0
  while [ "${SECONDS}" -lt "${end}" ]; do
    i=$((i + 1))
    token="sk-test-probe-${i}-not-real"
    jwt="eyJhbGciOiJub25lIn0.eyJwcm9iZSI6${i}fQ."
    body="${PROBE_OUT_DIR}/load-${i}.body"
    curl_status_body "load turn ${i}" "${body}" -X POST "${GATEWAY_URL}/api/v1/chat" -H "X-Tenant-ID: ${LLMCHAT_SECURITY_TENANT:-default}" -H "Content-Type: application/json" -d "{\"message\":\"diagnostic ${token} Bearer ${jwt}\"}" >/dev/null || true
    sleep "${interval}"
  done
  logs_dir="${PROBE_OUT_DIR}/docker-logs"
  mkdir -p "${logs_dir}"
  for svc in cordum-llm-chat llm-chat api-gateway scheduler qwen-inference; do
    docker compose logs --no-color "${svc}" >"${logs_dir}/${svc}.log" 2>/dev/null || true
  done
  assert_no_secret_patterns_in_dir "${logs_dir}" "live docker logs must not contain synthetic secrets"
else
  log_evidence "live_log_load=not_run reason=set LLMCHAT_SECURITY_LIVE=1 LLMCHAT_SECURITY_RUN_LOAD=1 to run 1h/50tpm clean-stack load"
fi

probe_pass "log redaction static gates and redactor/provider tests passed"
