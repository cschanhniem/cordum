#!/usr/bin/env bash
set -euo pipefail
PROBE_NAME="probe-04"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common-fixture.sh
source "${SCRIPT_DIR}/common-fixture.sh"

write_probe_header
log_evidence "title=admin session viewer + audit"
log_evidence "status=placeholder"
probe_skip "probe 04 implementation is scheduled for a later task step"
