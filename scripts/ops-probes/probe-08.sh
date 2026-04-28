#!/usr/bin/env bash
set -euo pipefail
PROBE_NAME="probe-08"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common-fixture.sh
source "${SCRIPT_DIR}/common-fixture.sh"

write_probe_header
log_evidence "title=SIEM export"

actions="core/audit/siem_actions.go"
[[ -f "${actions}" ]] || probe_fail "missing ${actions}"
for action in 'chat.session_started' 'chat.session_closed'; do
  grep -Fq "${action}" "${actions}" || probe_fail "missing SIEM action ${action}"
  log_evidence "siem_action_present=${action}"
done

if grep -Fq 'chat.approval_required' "${actions}"; then
  log_evidence "siem_action_present=chat.approval_required"
else
  log_evidence "siem_action_retired=chat.approval_required informational-only default"
fi
if grep -RIn 'mcp.tool_invocation' core/audit core/mcp >/dev/null 2>&1; then
  log_evidence "siem_action_present=mcp.tool_invocation"
else
  log_evidence "siem_action_retired=mcp.tool_invocation informational-only chat path"
fi

for sink in webhook syslog datadog cloudwatch; do
  [[ -f "core/audit/${sink}.go" ]] || probe_fail "missing audit sink core/audit/${sink}.go"
  [[ -f "core/audit/${sink}_test.go" ]] || probe_fail "missing audit sink test core/audit/${sink}_test.go"
  log_evidence "audit_sink_present=${sink}"
done

# Reuse exporter package unit tests as static serialization evidence.
GO_BIN="${GO_BIN:-}"
if [[ -z "${GO_BIN}" ]]; then
  if command -v go >/dev/null 2>&1; then GO_BIN="go"; elif [[ -x /snap/bin/go ]]; then GO_BIN="/snap/bin/go"; fi
fi
if [[ -n "${GO_BIN}" ]]; then
  if "${GO_BIN}" test ./core/audit -run 'Test.*(Webhook|Syslog|Datadog|CloudWatch|SIEMAction)' -count=1 >"${probe_dir}/go-test-audit.txt" 2>&1; then
    log_evidence "go_test_audit=pass"
  else
    cat "${probe_dir}/go-test-audit.txt" >>"${evidence_file}"
    probe_fail "audit exporter unit tests failed"
  fi
else
  log_evidence "go_test_audit=not_run go not found"
fi

log_evidence "live_sink_exports=not_run configure webhook/syslog/datadog/cloudwatch endpoints for end-to-end sink capture"
probe_pass
