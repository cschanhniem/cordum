#!/usr/bin/env bash
# Probe 09 — session TTL expiry
#
# Failure mode: user resumes a chat session after Redis session TTL expiry (>24h idle).
# Acceptance criteria: resume returns a graceful session_expired/not_found error (HTTP 404/410 or WS error frame), not 500 and not silent creation of a new session with stale id.
# Expected recovery time: immediate user-visible error; no service restart.
# Nightly/manual marker: compose-nightly.

set -euo pipefail
PROBE_ID="llmchat_probe_09_session_ttl"
# shellcheck source=tests/ops/llmchat_common.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/llmchat_common.sh"
probe_init
write_probe_manifest 'resume after Redis TTL expiry' 'graceful session_expired/not_found response, never 500 or silent stale-id recreation' 'immediate' 'compose-nightly'
require_live_stack
require_chat_api_key
require_cmd docker
[ -n "${PYTHON_BIN}" ] || probe_skip 'python required for JSON parsing'

record_section 'create session'
create_body="${PROBE_OUT_DIR}/create-session.json"
create_status="${PROBE_OUT_DIR}/create-session.status"
chat_post_json '{"message":"ops TTL probe: create a short session and return any concise response"}' "${create_body}" "${create_status}" || probe_fail 'initial chat POST failed'
status="$(cat "${create_status}")"
[ "${status}" = '200' ] || probe_fail "initial chat POST status=${status}, want 200"
session_id="$(json_field "${create_body}" session_id)" || probe_fail 'initial response missing session_id'
log_evidence "session_id=${session_id}"

record_section 'expire Redis session keys'
log_evidence "redis_commands=EXPIRE chat:session:${session_id} -1; EXPIRE chat:session:${session_id}:messages -1"
redis_cli EXPIRE "chat:session:${session_id}" -1 >>"${EVIDENCE_FILE}" 2>&1 || probe_fail 'failed to expire session metadata key'
redis_cli EXPIRE "chat:session:${session_id}:messages" -1 >>"${EVIDENCE_FILE}" 2>&1 || true

record_section 'attempt resume after expiry'
resume_body="${PROBE_OUT_DIR}/resume-expired-session.json"
resume_status="${PROBE_OUT_DIR}/resume-expired-session.status"
chat_post_json "{\"session_id\":\"${session_id}\",\"message\":\"resume after forced expiry\"}" "${resume_body}" "${resume_status}" || true
resume_code="$(cat "${resume_status}")"
log_evidence "resume_http_status=${resume_code}"
if [ "${resume_code}" = '500' ]; then
  probe_fail 'expired session returned HTTP 500'
fi
if [ "${resume_code}" = '200' ]; then
  if grep -E '"session_id"[[:space:]]*:[[:space:]]*"'"${session_id}"'"' "${resume_body}" >/dev/null 2>&1; then
    probe_fail 'expired session was silently recreated/reused with the stale session id; expected session_expired/not_found UX'
  fi
fi
if ! grep -E 'session_expired|not_found|expired|reload|404|410' "${resume_body}" >/dev/null 2>&1; then
  probe_fail 'expired session response did not contain session_expired/not_found/reload guidance'
fi
probe_pass 'expired session resume returned graceful non-500 user-visible error'
