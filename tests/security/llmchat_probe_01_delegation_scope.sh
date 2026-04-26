#!/usr/bin/env bash
set -euo pipefail
PROBE_ID="llmchat_probe_01_delegation_scope"
# shellcheck source=tests/security/llmchat_common.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/llmchat_common.sh"
probe_init
write_probe_manifest "DelegationClient outbound request uses the chat-assistant MCP-tool allowlist + core/auth/delegation TokenService subset/chain-depth checks"
record_section "attack payload"
log_evidence 'payload: request chat-assistant child delegation with extra allowed_actions=[cordum_update_policy_bundle] and allowed_topics=[cfg.*]; expected ErrScopeExceeded/403 before any direct gateway mutation. Accepted safe client contracts are either the older abstract narrow set [read,submit_job,query_policy]+[job.*] or the current MCP-tool allowlist expectedAllowedTools()+empty topics.'

if grep -nE '"allowed_actions":[[:space:]]*expectedAllowedTools\(\)' "${REPO_ROOT}/core/llmchat/delegation.go" >>"${EVIDENCE_FILE}" 2>&1; then
  log_evidence "delegation_contract=mcp-tool-allowlist"
  assert_file_contains "core/llmchat/delegation.go" '"allowed_topics":[[:space:]]*\[\]string\{\}' "delegation request must not widen topic scope"
  assert_file_contains "core/llmchat/bootstrap.go" 'mcp\.ToolSubmitJob' "canonical allowlist must include submit_job"
  assert_file_contains "core/llmchat/bootstrap.go" 'mcp\.ToolQueryPolicy' "canonical allowlist must include query_policy"
  assert_file_not_contains "core/llmchat/bootstrap.go" 'mcp\.ToolUpdatePolicyBundle' "canonical allowlist must exclude policy-bundle mutation"
else
  log_evidence "delegation_contract=abstract-action-narrow-set"
  assert_file_contains "core/llmchat/delegation.go" '"allowed_actions":[[:space:]]*\[\]string\{"read", "submit_job", "query_policy"\}' "delegation request must pin narrow allowed_actions"
  assert_file_contains "core/llmchat/delegation.go" '"allowed_topics":[[:space:]]*\[\]string\{"job\.\*"\}' "delegation request must pin job.* allowed_topics"
fi
assert_file_contains "core/llmchat/delegation.go" 'IssueTTL[[:space:]]+time\.Duration' "delegation config must expose bounded TTL"
assert_file_contains "core/llmchat/delegation.go" '15 \* time\.Minute' "delegation default TTL must be 15 minutes"
assert_file_contains "core/auth/delegation/token.go" 'ErrScopeExceeded' "TokenService must reject widened child scopes"
assert_file_contains "core/auth/delegation/token.go" 'ErrChainTooDeep' "TokenService must enforce delegation chain depth"
assert_file_contains "core/auth/delegation/token.go" '!isSubset\(allowedActions, parent\.AllowedActions\)' "TokenService must compare child actions against parent"
assert_file_contains "core/auth/delegation/token.go" '!isSubset\(allowedTopics, parent\.AllowedTopics\)' "TokenService must compare child topics against parent"

run_go_test "go test delegation scope monotonicity" ./core/auth/delegation -run 'TestIssueAndVerifyDelegationToken|TestIssueDelegationTokenScopeMonotonicityAcrossChain|TestVerifyDelegationTokenRevocationAndScopeDowngrade' -count=1 || probe_fail "delegation TokenService regression tests failed"
run_go_test "go test llmchat delegation client" ./core/llmchat -run 'TestDelegationClient_OutboundBodyShape|TestDelegationClient_ForSessionReusesFreshToken|TestDelegationClient_ServiceAPIKeyHeader' -count=1 || probe_fail "llmchat delegation-client regression tests failed"

if [ -n "${LLMCHAT_SECURITY_DELEGATION_TOKEN:-}" ]; then
  record_section "live token decode"
  jwt_payload_decode "${LLMCHAT_SECURITY_DELEGATION_TOKEN}" | tee -a "${EVIDENCE_FILE}"
  jwt_payload_decode "${LLMCHAT_SECURITY_DELEGATION_TOKEN}" >"${PROBE_OUT_DIR}/delegation-payload.json"
  assert_text_contains "${PROBE_OUT_DIR}/delegation-payload.json" '"chain_depth"[[:space:]]*:[[:space:]]*1' "delegation JWT must be chain_depth=1"
  assert_text_contains "${PROBE_OUT_DIR}/delegation-payload.json" '"allowed_topics"' "delegation JWT must carry allowed_topics"
  body="${PROBE_OUT_DIR}/policy-bundles-with-delegation.body"
  status=$(curl_status_body "delegation token against non-chat mutating endpoint" "${body}" -X POST "${GATEWAY_URL}/api/v1/policy/bundles" -H "Authorization: Bearer ${LLMCHAT_SECURITY_DELEGATION_TOKEN}" -H "Content-Type: application/json" -d '{"name":"evil.test","rules":[]}') || true
  assert_http_status_in "${status}" "401,403" "delegation token must not authorize direct policy-bundle mutation"
else
  live_evidence_not_run "live_token_decode" "LLMCHAT_SECURITY_DELEGATION_TOKEN not provided; production chat service does not expose delegation bearer to browser frames"
fi

probe_pass "delegation scope is pinned by client body and TokenService monotonicity tests"
