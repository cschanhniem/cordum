#!/usr/bin/env bash
# Probe 06 — Tier 1 H100 capacity
#
# Failure mode: Tier 1 cannot sustain the documented 16 comfortable / 32 stress concurrent sessions, or tool-call latency/audit throughput collapses.
# Acceptance criteria: 16-session phase and 32-session ramp complete, p50/p95/p99 per-turn latency recorded, vLLM KV/GPU metrics archived, and audit chain verifies ok.
# Expected recovery time: no recovery path; steady-state load for 30 min at 16 then stress ramp to 32.
# Nightly/manual marker: gpu-nightly long-running H100.

set -euo pipefail
PROBE_ID="llmchat_probe_06_tier1_capacity"
# shellcheck source=tests/ops/llmchat_common.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/llmchat_common.sh"
probe_init
write_probe_manifest 'Tier 1 H100 16-32 concurrent sessions capacity' '16-session and 32-session phases complete; p50/p95/p99 recorded; vLLM/audit metrics archived' '30m steady + stress ramp' 'gpu-nightly h100 long-running'
require_real_vllm
require_go
require_chat_api_key
require_cmd docker

comfortable="${LLMCHAT_OPS_TIER1_COMFORTABLE_SESSIONS:-16}"
stress="${LLMCHAT_OPS_TIER1_STRESS_SESSIONS:-32}"
messages="${LLMCHAT_OPS_TIER1_MESSAGES:-20}"
turn_timeout="${LLMCHAT_OPS_TIER1_TURN_TIMEOUT_SECONDS:-120}"

run_phase() {
  local label="$1" count="$2"
  record_section "capacity phase ${label} sessions=${count} messages=${messages}"
  scrape_vllm_metric 'vllm:.*(cache|gpu|kv)|vllm_.*(cache|gpu|kv)' >"${PROBE_OUT_DIR}/${label}-metrics-before.txt" 2>>"${EVIDENCE_FILE}" || log_evidence "metrics_before_${label}=unavailable"
  local pids_file="${PROBE_OUT_DIR}/${label}-pids.txt"
  : >"${pids_file}"
  for i in $(seq 1 "${count}"); do
    msgfile="${PROBE_OUT_DIR}/${label}-session-${i}-messages.json"
    ${PYTHON_BIN:-python} - "${i}" "${messages}" >"${msgfile}" <<'PY'
import json, sys
sid=int(sys.argv[1]); n=int(sys.argv[2])
print(json.dumps([f"Capacity phase session {sid} turn {j}: list tenant-scoped jobs, query policy for chat read access, and provide one concise final sentence." for j in range(1,n+1)]))
PY
    out="${PROBE_OUT_DIR}/${label}-session-${i}.jsonl"
    set +e
    run_ws_client "${out}" "$(cat "${msgfile}")" "${turn_timeout}" true &
    pid=$!
    set -e
    printf '%s %s %s\n' "${pid}" "${out}" "${i}" >>"${pids_file}"
  done
  local failures=0
  while read -r pid out sid; do
    set +e
    wait "${pid}"
    code=$?
    set -e
    log_evidence "capacity_phase=${label} session=${sid} pid=${pid} exit=${code} out=${out}"
    [ "${code}" -eq 0 ] || failures=$((failures + 1))
    [ -f "${out}" ] && sed -e "s/^/capacity_${label}_${sid}: /" "${out}" >>"${EVIDENCE_FILE}" || true
    assert_no_bang_stream "${out}"
  done <"${pids_file}"
  [ "${failures}" -eq 0 ] || probe_fail "capacity phase ${label} had ${failures} failed sessions"
  scrape_vllm_metric 'vllm:.*(cache|gpu|kv)|vllm_.*(cache|gpu|kv)' >"${PROBE_OUT_DIR}/${label}-metrics-after.txt" 2>>"${EVIDENCE_FILE}" || log_evidence "metrics_after_${label}=unavailable"
  ${PYTHON_BIN:-python} - "${PROBE_OUT_DIR}" "${label}" "${count}" >>"${EVIDENCE_FILE}" <<'PY'
import datetime as dt, glob, json, os, statistics, sys
root,label,count=sys.argv[1],sys.argv[2],int(sys.argv[3])
lat=[]
for path in glob.glob(os.path.join(root, f"{label}-session-*.jsonl")):
    sent={}
    for line in open(path, encoding='utf-8'):
        try: ev=json.loads(line)
        except Exception: continue
        t=dt.datetime.fromisoformat(ev['time'].replace('Z','+00:00')).timestamp()
        data=ev.get('data') or {}
        if ev.get('event')=='sent': sent[int(data.get('turn',0))]=t
        if ev.get('event')=='turn_done':
            turn=int(data.get('turn',0))
            if turn in sent: lat.append(t-sent[turn])
if not lat:
    print(f"latency_{label}_samples=0")
    sys.exit(2)
lat.sort()
def pct(p):
    idx=min(len(lat)-1, max(0, int(round((p/100)*(len(lat)-1)))))
    return lat[idx]
print(f"latency_{label}_samples={len(lat)}")
print(f"latency_{label}_p50_seconds={pct(50):.3f}")
print(f"latency_{label}_p95_seconds={pct(95):.3f}")
print(f"latency_{label}_p99_seconds={pct(99):.3f}")
PY
}

run_phase comfortable "${comfortable}"
run_phase stress "${stress}"

audit_body="${PROBE_OUT_DIR}/audit-verify-capacity.json"
audit_status=$(chat_auth_curl -o "${audit_body}" -w '%{http_code}' "${GATEWAY_URL%/}/api/v1/audit/verify?tenant=${LLMCHAT_OPS_TENANT:-default}" 2>>"${EVIDENCE_FILE}") || true
log_evidence "audit_verify_status=${audit_status}"
[ -f "${audit_body}" ] && sed -e 's/^/audit_verify: /' "${audit_body}" >>"${EVIDENCE_FILE}" || true
[ "${audit_status}" = '200' ] || probe_fail "audit verify returned ${audit_status}, want 200"
grep -E '"status"[[:space:]]*:[[:space:]]*"ok"' "${audit_body}" >/dev/null 2>&1 || probe_fail 'audit chain not ok after capacity probe'
probe_pass "Tier 1 capacity phases completed: comfortable=${comfortable}, stress=${stress}"
