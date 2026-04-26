#!/usr/bin/env bash
set -euo pipefail
PROBE_ID="llmchat_probe_02_agent_identity_scope"
# shellcheck source=tests/security/llmchat_common.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/llmchat_common.sh"
probe_init
write_probe_manifest "MCP FilterForIdentity removes non-AllowedTools before policy evaluation; server maps missing filtered tools to JSON-RPC -32601"
record_section "attack payload"
log_evidence 'payload: JSON-RPC tools/call name=cordum_unlist_tool_xyz with chat-assistant identity; expected MCP -32601 method not found from identity scope filter, not policy approval/deny.'

assert_file_contains "core/llmchat/bootstrap.go" 'func expectedAllowedTools\(\) \[\]string' "chat-assistant AllowedTools must be code-pinned"
assert_file_not_contains "core/llmchat/bootstrap.go" 'cordum_unlist_tool_xyz' "crafted non-listed tool must not be in chat-assistant scope"
assert_file_contains "core/mcp/filter.go" 'func FilterForIdentity' "MCP identity filter must exist"
assert_file_contains "core/mcp/filter.go" 'identityAdmitsTool\(id\.AllowedTools, tool\.Name\)' "AllowedTools gate must run before tools are exposed"
assert_file_contains "core/mcp/server.go" 'jsonRPCMethodNotFoundCode[[:space:]]*=[[:space:]]*-32601' "MCP method-not-found code must be -32601"
assert_file_contains "core/mcp/server.go" 'ErrMethodNotFound' "MCP server must translate filtered/missing tools to ErrMethodNotFound"

run_go_test "go test MCP identity filter" ./core/mcp -run 'TestFilterForIdentity_AllowedToolsGlob|TestFilterForIdentity_NilOrEmpty|TestEvaluateForIdentity_Reasons|TestUnknownMethod' -count=1 || probe_fail "MCP identity-filter/method-not-found tests failed"
run_go_test "go test chat-assistant bootstrap scope" ./core/llmchat -run 'TestBootstrapper|TestExpectedAllowedTools|TestExistingChatAssistant' -count=1 || probe_fail "chat-assistant bootstrap scope tests failed"

if [ "${LLMCHAT_SECURITY_LIVE:-0}" = "1" ] && [ -n "${LLMCHAT_SECURITY_MCP_URL:-}" ] && [ -n "${LLMCHAT_SECURITY_DELEGATION_TOKEN:-}" ]; then
  body="${PROBE_OUT_DIR}/crafted-mcp-call.body"
  status=$(curl_status_body "crafted non-listed MCP tool call" "${body}" -X POST "${LLMCHAT_SECURITY_MCP_URL}" -H "Authorization: Bearer ${LLMCHAT_SECURITY_DELEGATION_TOKEN}" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":"probe-02","method":"tools/call","params":{"name":"cordum_unlist_tool_xyz","arguments":{}}}') || true
  assert_http_status_in "${status}" "200,400" "MCP endpoint must respond deterministically"
  assert_text_contains "${body}" '(-32601|method not found)' "crafted tool must be rejected as method-not-found"
else
  log_evidence "live_mcp_call=not_run reason=set LLMCHAT_SECURITY_LIVE=1 LLMCHAT_SECURITY_MCP_URL and LLMCHAT_SECURITY_DELEGATION_TOKEN to exercise a clean compose stack"
fi

probe_pass "agent identity scope is enforced by FilterForIdentity and -32601 mapping"
