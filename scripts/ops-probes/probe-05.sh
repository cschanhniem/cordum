#!/usr/bin/env bash
set -euo pipefail
PROBE_NAME="probe-05"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common-fixture.sh
source "${SCRIPT_DIR}/common-fixture.sh"

write_probe_header
log_evidence "title=chat frame protocol stability"

doc="docs/llmchat/protocol-versioning.md"
[[ -f "${doc}" ]] || probe_fail "missing ${doc}"
log_evidence "protocol_doc=${doc}"

frame_hits="${probe_dir}/frame-version-hits.txt"
grep -RInE 'json:"v(,|")|ProtocolVersion|unsupported_protocol_version|UnsupportedProtocolVersion' core/llmchat dashboard/src/types dashboard/src/components/chat-assistant >"${frame_hits}" || true
log_evidence "frame_version_static_hits=$(wc -l <"${frame_hits}" | tr -d ' ')"
head -40 "${frame_hits}" >>"${evidence_file}" || true

for term in 'v2 upgrade plan' 'unsupported_protocol_version' 'assistant_delta' 'informational-only' 'redaction'; do
  grep -Fqi "${term}" "${doc}" || probe_fail "protocol doc missing term: ${term}"
  log_evidence "doc_term_present=${term}"
done

if [[ "${LLMCHAT_OPS_LIVE}" == "1" && -n "${LLMCHAT_WS_URL:-}" ]]; then
  log_evidence "live_ws_version_probe=not_implemented url=${LLMCHAT_WS_URL}"
else
  log_evidence "live_ws_version_probe=not_run set LLMCHAT_OPS_LIVE=1 LLMCHAT_WS_URL=..."
fi

failures=0
if ! grep -RInE 'json:"v(,|")' core/llmchat dashboard/src/types dashboard/src/components/chat-assistant >/dev/null 2>&1; then
  log_evidence "finding=P1 chat frames do not carry top-level json v field"
  failures=$((failures+1))
fi
if ! grep -RIn 'unsupported_protocol_version' core/llmchat dashboard/src >/dev/null 2>&1; then
  log_evidence "finding=P1 unknown protocol versions are not rejected with unsupported_protocol_version"
  failures=$((failures+1))
fi
if [[ "${failures}" -gt 0 ]]; then
  probe_fail "chat protocol v1 pinning is not implemented"
fi
probe_pass
