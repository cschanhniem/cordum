#!/usr/bin/env bash
# Probe 18 — Redis backpressure boundedness
#
# Failure mode: Redis pause causes unbounded write buffering/OOM in llm-chat.
# Acceptance criteria: during a 30s Redis pause, llm-chat emits structured backpressure/provider/session errors or degraded readyz, RSS does not grow >25%, and queued writes recover within 60s after unpause.
# Expected recovery time: Redis unpause -> readyz 200 and successful chat turn within 60s.
# Nightly/manual marker: compose-nightly, destructive.

set -euo pipefail
PROBE_ID="llmchat_probe_18_backpressure"
# shellcheck source=tests/ops/llmchat_common.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/llmchat_common.sh"
probe_init
write_probe_manifest 'Redis paused during active chat writes' 'bounded memory/backoff; user-visible error/degraded status; recovery within 60s after unpause' '30s pause + <=60s recovery' 'compose-nightly destructive'
require_live_stack
require_destructive
require_go
require_chat_api_key
require_cmd docker
poll_readyz "${LLMCHAT_DIRECT_URL%/}/readyz" 200 120 || probe_fail 'llm-chat not ready before Redis backpressure probe'
redis_cid="$(require_service_container redis)"
rss_before="$(container_rss_kb llm-chat || echo 0)"
log_evidence "redis_container=${redis_cid} rss_before_kb=${rss_before}"

record_section 'pause Redis and send active chat turns'
run_capture 'docker pause redis' docker pause "${redis_cid}" || probe_fail 'failed to pause Redis'
trap 'docker unpause "'"${redis_cid}"'" >/dev/null 2>&1 || true' EXIT
ws_out="${PROBE_OUT_DIR}/redis-paused-ws.jsonl"
set +e
run_ws_client "${ws_out}" '["During this Redis outage, list jobs and explain any temporary service error clearly.","Try one more tenant-scoped read after the Redis pause begins."]' 45 false
ws_code=$?
set -e
log_evidence "redis_paused_ws_exit=${ws_code}"
[ -f "${ws_out}" ] && sed -e 's/^/redis_paused_ws: /' "${ws_out}" >>"${EVIDENCE_FILE}" || true
readyz_body="${PROBE_OUT_DIR}/readyz-during-redis-pause.body"
status=$(curl_status_body 'readyz during redis pause' "${readyz_body}" "${LLMCHAT_DIRECT_URL%/}/readyz") || true
log_evidence "readyz_during_redis_pause=${status}"
[ "${status}" = '503' ] || probe_fail "llm-chat /readyz during Redis pause returned ${status}, want 503 degraded"
rss_during="$(container_rss_kb llm-chat || echo 0)"
log_evidence "rss_during_kb=${rss_during}"
if [ "${rss_before}" -gt 0 ] && [ "${rss_during}" -gt $((rss_before + rss_before / 4)) ]; then
  probe_fail "RSS grew >25% during Redis pause (${rss_before}KiB -> ${rss_during}KiB)"
fi

record_section 'unpause Redis and verify recovery'
run_capture 'docker unpause redis' docker unpause "${redis_cid}" || probe_fail 'failed to unpause Redis'
trap - EXIT
poll_readyz "${LLMCHAT_DIRECT_URL%/}/readyz" 200 60 || probe_fail 'llm-chat /readyz did not recover within 60s after Redis unpause'
recovery_body="${PROBE_OUT_DIR}/post-redis-recovery.json"
recovery_status="${PROBE_OUT_DIR}/post-redis-recovery.status"
chat_post_json '{"message":"post-redis-backpressure recovery check: reply with one concise status sentence"}' "${recovery_body}" "${recovery_status}" || probe_fail 'post-Redis recovery chat POST failed'
[ "$(cat "${recovery_status}")" = '200' ] || probe_fail "post-Redis recovery chat status=$(cat "${recovery_status}"), want 200"
rss_after="$(container_rss_kb llm-chat || echo 0)"
log_evidence "rss_after_kb=${rss_after}"
if [ "${rss_before}" -gt 0 ] && [ "${rss_after}" -gt $((rss_before + rss_before / 4)) ]; then
  probe_fail "RSS remained >25% above baseline after recovery (${rss_before}KiB -> ${rss_after}KiB)"
fi
probe_pass "Redis backpressure bounded and recovered: rss=${rss_before}->${rss_during}->${rss_after}KiB"
