#!/usr/bin/env bash
set -euo pipefail
PROBE_NAME="probe-09"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common-fixture.sh
source "${SCRIPT_DIR}/common-fixture.sh"

write_probe_header
log_evidence "title=alert rules"
log_evidence "status=placeholder"
probe_skip "probe 09 implementation is scheduled for a later task step"
