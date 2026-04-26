#!/usr/bin/env bash
set -euo pipefail
PROBE_ID="llmchat_probe_10_rate_limit"
# shellcheck source=tests/security/llmchat_common.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/llmchat_common.sh"
probe_init
write_probe_manifest "gateway rate-limit middleware and llm-chat WS backpressure/size guards bound floods without panic/leaked goroutines"
record_section "attack payload"
log_evidence 'payload: flood one chat WS session at 100 msgs/sec for 60s; expected gateway 429 or WS error{code:rate_limit/backpressure/message_too_large}, service remains healthy and no goroutine explosion.'

assert_file_contains "core/controlplane/gateway/middleware.go" 'newRedisRateLimiter|newKeyedRateLimiter' "gateway must have rate limiter implementation"
assert_file_contains "core/controlplane/gateway/gateway.go" 'API_RATE_LIMIT_RPS' "gateway rate limit must be configurable"
assert_file_contains "core/llmchat/chat_handlers.go" 'maxWSMessageBytes[[:space:]]*=[[:space:]]*64 \* 1024' "chat WS must cap message size"
assert_file_contains "core/llmchat/chat_handlers.go" 'ErrorCode: "message_too_large"' "chat WS must emit message_too_large on oversized frame"
assert_file_contains "core/llmchat/chat_handlers.go" 'ErrorCode: "backpressure"' "chat WS must emit backpressure when client is too slow"
assert_file_contains "core/llmchat/agent.go" 'maxToolCallsPerTurn|MaxToolCallsPerTurn' "agent loop must bound tool calls per turn"
assert_file_contains "core/llmchat/agent.go" 'MaxWallClockPerTurn|WallClock' "agent loop must bound wall-clock per turn"

run_go_test "go test gateway rate limit middleware" ./core/controlplane/gateway -run 'TestRateLimitMiddleware|TestRateLimitAuthOrdering|TestRateLimitKeyTenantBased|TestRateLimitTenantSharedAcrossIPs|TestRedisRateLimiter_RedTeam14_BurstExceeded|TestRedisRateLimiter_120Requests_MostRejected|TestKeyedRateLimiter_BurstEnforced' -count=1 || probe_fail "gateway rate-limit regression tests failed"
run_go_test "go test llmchat WS/flood guards" ./core/llmchat -run 'TestChatWSOversizeMessageClosesWithErrorFrame|TestTurn_WallClockBudgetTrips|TestTurn_AssistantBytesBudgetTrips|TestTurn_RepeatCallDetector' -count=1 || probe_fail "llmchat WS/agent flood guard tests failed"

if [ "${LLMCHAT_SECURITY_LIVE:-0}" = "1" ] && [ "${LLMCHAT_SECURITY_RUN_FLOOD:-0}" = "1" ]; then
  record_section "live WS flood"
  log_evidence "duration_seconds=${LLMCHAT_SECURITY_FLOOD_SECONDS:-60} rate_per_second=${LLMCHAT_SECURITY_FLOOD_RATE:-100}"
  ${PYTHON_BIN} - "${GATEWAY_URL}" "${PROBE_OUT_DIR}/ws-flood.json" <<'PY'
import json, os, sys, time, urllib.request
# Placeholder live hook: real WebSocket client libraries are intentionally not vendored.
# Exercise HTTP POST flood against the same gateway rate-limit key when websocket tooling is unavailable.
base, out = sys.argv[1], sys.argv[2]
rate = int(os.environ.get('LLMCHAT_SECURITY_FLOOD_RATE', '100'))
duration = int(os.environ.get('LLMCHAT_SECURITY_FLOOD_SECONDS', '60'))
statuses = {}
end = time.time() + duration
payload = json.dumps({"message":"rate-limit probe from evil.test placeholder"}).encode()
while time.time() < end:
    for _ in range(rate):
        req = urllib.request.Request(base.rstrip('/') + '/api/v1/chat', data=payload, method='POST', headers={'Content-Type':'application/json','X-Tenant-ID':'default'})
        try:
            with urllib.request.urlopen(req, timeout=2) as resp:
                code = resp.status
        except Exception as exc:
            code = getattr(getattr(exc, 'fp', None), 'status', 0) or getattr(exc, 'code', 0) or 0
        statuses[str(code)] = statuses.get(str(code), 0) + 1
    time.sleep(1)
with open(out, 'w', encoding='utf-8') as f:
    json.dump(statuses, f, indent=2, sort_keys=True)
PY
  sed -e 's/^/flood_statuses: /' "${PROBE_OUT_DIR}/ws-flood.json" >>"${EVIDENCE_FILE}"
  assert_text_contains "${PROBE_OUT_DIR}/ws-flood.json" '429|401|403|503' "live flood must be bounded before unbounded chat processing"
else
  log_evidence "live_rate_limit=not_run reason=set LLMCHAT_SECURITY_LIVE=1 LLMCHAT_SECURITY_RUN_FLOOD=1 for 60s/100rps clean-stack flood"
fi

probe_pass "rate-limit/backpressure guard tests passed"
