#!/usr/bin/env bash
# Probe 05 — NATS partition
#
# Failure mode: NATS becomes unreachable while chat-triggered MCP/audit/approval paths are active.
# Acceptance criteria: chat tool calls either complete after reconnect or emit structured retryable errors; NATS reconnect recovers within 60s; audit chain verifies ok with no gap.
# Expected recovery time: 30s partition + <=60s recovery.
# Nightly/manual marker: compose-nightly destructive.

set -euo pipefail
PROBE_ID="llmchat_probe_05_nats_partition"
# shellcheck source=tests/ops/llmchat_common.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/llmchat_common.sh"
probe_init
write_probe_manifest 'NATS docker-network partition during MCP/audit activity' 'structured completion/error, reconnect within 60s, audit verify ok' '30s partition + <=60s recovery' 'compose-nightly destructive'
require_live_stack
require_destructive
require_go
require_chat_api_key
require_cmd docker
poll_readyz "${LLMCHAT_DIRECT_URL%/}/readyz" 200 120 || probe_fail 'llm-chat not ready before NATS partition'

partition_seconds="${LLMCHAT_OPS_NATS_PARTITION_SECONDS:-30}"
record_section 'disconnect NATS from compose network'
network_disconnect_service nats
trap 'network_connect_service nats >/dev/null 2>&1 || true' EXIT

record_section 'chat/MCP activity during partition'
ws_out="${PROBE_OUT_DIR}/nats-partition-ws.jsonl"
set +e
run_ws_client "${ws_out}" '["During the NATS partition, list jobs and submit a safe demo no-op job if allowed; otherwise explain the retryable failure."]' "$((partition_seconds + 90))" false &
client_pid=$!
set -e
sleep "${partition_seconds}"

record_section 'reconnect NATS and verify recovery'
network_connect_service nats
trap - EXIT
set +e
wait "${client_pid}"
client_code=$?
set -e
log_evidence "nats_partition_client_exit=${client_code}"
[ -f "${ws_out}" ] && sed -e 's/^/nats_partition_ws: /' "${ws_out}" >>"${EVIDENCE_FILE}" || true
if ! grep -E '"event":"frame"' "${ws_out}" >/dev/null 2>&1; then
  probe_fail 'NATS partition client produced no WS frames (silent hang)'
fi
if grep -Ei 'panic:|fatal error|stack trace' "${ws_out}" >/dev/null 2>&1; then
  probe_fail 'NATS partition leaked panic/stack output'
fi
# Give async audit/NATS consumers time to reconnect and flush.
sleep 10
audit_body="${PROBE_OUT_DIR}/audit-verify-nats-partition.json"
audit_status=$(chat_auth_curl -o "${audit_body}" -w '%{http_code}' "${GATEWAY_URL%/}/api/v1/audit/verify?tenant=${LLMCHAT_OPS_TENANT:-default}" 2>>"${EVIDENCE_FILE}") || true
log_evidence "audit_verify_status=${audit_status} body=${audit_body}"
[ -f "${audit_body}" ] && sed -e 's/^/audit_verify: /' "${audit_body}" >>"${EVIDENCE_FILE}" || true
[ "${audit_status}" = '200' ] || probe_fail "audit verify returned ${audit_status}, want 200"
grep -E '"status"[[:space:]]*:[[:space:]]*"ok"' "${audit_body}" >/dev/null 2>&1 || probe_fail 'audit chain not ok after NATS partition'
probe_pass 'NATS partition recovered and audit chain verified ok'
