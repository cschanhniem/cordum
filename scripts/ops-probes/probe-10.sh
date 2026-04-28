#!/usr/bin/env bash
set -euo pipefail
PROBE_NAME="probe-10"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common-fixture.sh
source "${SCRIPT_DIR}/common-fixture.sh"

write_probe_header
log_evidence "title=cost / usage visibility"

hits="${probe_dir}/usage-static-hits.txt"
grep -RInE 'admin/chat/usage|chat/usage|ChatUsage|chat_usage|tokens_in|tokens_out|token.*tenant|tenant.*token|UsageCounters|usage counters' core cmd dashboard/src docs/llmchat 2>/dev/null >"${hits}" || true
log_evidence "usage_static_hits=$(wc -l <"${hits}" | tr -d ' ')"
head -60 "${hits}" >>"${evidence_file}" || true

if [[ "${LLMCHAT_OPS_LIVE}" == "1" && -n "${CORDUM_API_KEY:-}" ]]; then
  body="${probe_dir}/usage-live.json"
  http_code=$(curl "${curl_common[@]}" -H "X-API-Key: ${CORDUM_API_KEY}" -o "${body}" -w '%{http_code}' "${CORDUM_API_BASE}/admin/chat/usage?tenant=default" || true)
  log_evidence "live_usage_http=${http_code}"
else
  log_evidence "live_usage_api=not_run set CORDUM_API_KEY and LLMCHAT_OPS_LIVE=1"
fi

if ! grep -RInE 'admin/chat/usage|ChatUsage|chat_usage|tokens_in|tokens_out|UsageCounters' core cmd dashboard/src >/dev/null 2>&1; then
  log_evidence "finding=P1 per-tenant chat usage admin API/counters not implemented"
  probe_fail "per-tenant chat usage visibility not found"
fi
probe_pass
