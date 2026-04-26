#!/usr/bin/env bash
# Probe 04 — Redis partition
#
# Failure mode: Redis becomes unreachable for 30s while chat sessions are active.
# Acceptance criteria: llm-chat /readyz degrades, active clients receive terminal or structured user-visible error frames (not silent hangs), Redis reconnect recovers /readyz within 60s, and RSS stays bounded.
# Expected recovery time: 30s partition + <=60s recovery.
# Nightly/manual marker: compose-nightly destructive.

set -euo pipefail
PROBE_ID="llmchat_probe_04_redis_partition"
# shellcheck source=tests/ops/llmchat_common.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/llmchat_common.sh"
probe_init
write_probe_manifest 'Redis docker-network partition during active chat sessions' 'readyz 503, structured terminal/error frames, recovery within 60s, bounded RSS' '30s partition + <=60s recovery' 'compose-nightly destructive'
require_live_stack
require_destructive
require_go
require_chat_api_key
require_cmd docker
poll_readyz "${LLMCHAT_DIRECT_URL%/}/readyz" 200 120 || probe_fail 'llm-chat not ready before Redis partition'

sessions="${LLMCHAT_OPS_PARTITION_SESSIONS:-16}"
partition_seconds="${LLMCHAT_OPS_REDIS_PARTITION_SECONDS:-30}"
rss_before="$(container_rss_kb llm-chat || echo 0)"
log_evidence "rss_before_kb=${rss_before} sessions=${sessions} partition_seconds=${partition_seconds}"

record_section 'disconnect Redis from compose network'
network_disconnect_service redis
trap 'network_connect_service redis >/dev/null 2>&1 || true' EXIT
wait_http_status 'readyz during redis partition' 503 20 2 "${LLMCHAT_DIRECT_URL%/}/readyz" || probe_fail 'llm-chat /readyz did not degrade to 503 during Redis partition'

record_section 'active chat during Redis partition'
pids_file="${PROBE_OUT_DIR}/redis-partition-pids.txt"
: >"${pids_file}"
for i in $(seq 1 "${sessions}"); do
  out="${PROBE_OUT_DIR}/redis-partition-session-${i}.jsonl"
  set +e
  run_ws_client "${out}" '["During the Redis partition, list jobs or explain temporary storage failure clearly."]' "$((partition_seconds + 30))" false &
  pid=$!
  set -e
  printf '%s %s %s\n' "${pid}" "${out}" "${i}" >>"${pids_file}"
done
sleep "${partition_seconds}"

record_section 'reconnect Redis and wait for recovery'
network_connect_service redis
trap - EXIT
poll_readyz "${LLMCHAT_DIRECT_URL%/}/readyz" 200 60 || probe_fail 'llm-chat /readyz did not recover within 60s after Redis reconnect'

failures=0
silent=0
while read -r pid out sid; do
  set +e
  wait "${pid}"
  code=$?
  set -e
  log_evidence "redis_partition_session=${sid} pid=${pid} exit=${code} out=${out}"
  [ -f "${out}" ] && sed -e "s/^/redis_partition_ws_${sid}: /" "${out}" >>"${EVIDENCE_FILE}" || true
  if ! grep -E '"event":"frame"|"event":"read_error"|"event":"dial_error"' "${out}" >/dev/null 2>&1; then
    silent=$((silent + 1))
  fi
  if grep -Ei 'panic:|fatal error|stack trace' "${out}" >/dev/null 2>&1; then
    failures=$((failures + 1))
  fi
done <"${pids_file}"
[ "${silent}" -eq 0 ] || probe_fail "${silent} clients hung silently during Redis partition"
[ "${failures}" -eq 0 ] || probe_fail "${failures} clients leaked panic/stack during Redis partition"
rss_after="$(container_rss_kb llm-chat || echo 0)"
log_evidence "rss_after_kb=${rss_after}"
if [ "${rss_before}" -gt 0 ] && [ "${rss_after}" -gt $((rss_before + rss_before / 4)) ]; then
  probe_fail "RSS grew >25% across Redis partition (${rss_before}KiB -> ${rss_after}KiB)"
fi
probe_pass "Redis partition recovered with bounded resources and no silent hangs"
