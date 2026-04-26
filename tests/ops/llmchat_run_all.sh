#!/usr/bin/env bash
# Run all Cordum LLM-chat production-readiness probes and aggregate results.

set -euo pipefail

OPS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=tests/ops/llmchat_common.sh
. "${OPS_DIR}/llmchat_common.sh"

PROBES=(
  llmchat_probe_01_cold_start.sh
  llmchat_probe_02_vllm_crash.sh
  llmchat_probe_03_long_tool_conversation.sh
  llmchat_probe_04_redis_partition.sh
  llmchat_probe_05_nats_partition.sh
  llmchat_probe_06_tier1_capacity.sh
  llmchat_probe_07_gpu_oom.sh
  llmchat_probe_08_prefix_caching.sh
  llmchat_probe_09_session_ttl.sh
  llmchat_probe_10_token_budget.sh
  llmchat_probe_11_repeat_call.sh
  llmchat_probe_12_rolling_upgrade.sh
  llmchat_probe_13_hf_cache_loss.sh
  llmchat_probe_14_tier2_awq.sh
  llmchat_probe_15_tier3_a100.sh
  llmchat_probe_16_concurrent_isolation.sh
  llmchat_probe_17_graceful_shutdown.sh
  llmchat_probe_18_backpressure.sh
)

mkdir -p "${OPS_OUT_DIR}"
RESULTS_TSV="${OPS_OUT_DIR}/ops-results.tsv"
RESULTS_JSON="${OPS_OUT_DIR}/ops-results.json"
: >"${RESULTS_TSV}"

pass=0
fail=0
skip=0

for probe in "${PROBES[@]}"; do
  path="${OPS_DIR}/${probe}"
  name="${probe%.sh}"
  start=$(date +%s)
  stdout_file="${OPS_OUT_DIR}/${name}.stdout"
  stderr_file="${OPS_OUT_DIR}/${name}.stderr"
  evidence="${OPS_OUT_DIR}/${name}/evidence.txt"
  if [ ! -f "${path}" ]; then
    status='FAIL'
    code=127
    echo "missing probe script ${path}" >"${stderr_file}"
  else
    set +e
    bash "${path}" >"${stdout_file}" 2>"${stderr_file}"
    code=$?
    set -e
    if [ "${code}" -eq 0 ]; then
      status='PASS'
    elif [ "${code}" -eq 77 ]; then
      status='SKIP'
    else
      status='FAIL'
    fi
  fi
  end=$(date +%s)
  duration=$((end - start))
  case "${status}" in
    PASS) pass=$((pass + 1)) ;;
    SKIP) skip=$((skip + 1)) ;;
    FAIL) fail=$((fail + 1)) ;;
  esac
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "${name}" "${status}" "${code}" "${duration}" "${evidence}" "${stdout_file}" "${stderr_file}" >>"${RESULTS_TSV}"
  printf '[%s] %s (exit=%s, duration=%ss)\n' "${name}" "${status}" "${code}" "${duration}"
done

if [ -z "${PYTHON_BIN}" ]; then
  echo '[llmchat_ops_run_all] FAILED: python not found; set LLMCHAT_PYTHON_BIN' >&2
  exit 2
fi
${PYTHON_BIN} - "${RESULTS_TSV}" "${RESULTS_JSON}" "${pass}" "${fail}" "${skip}" <<'PY'
import csv, json, os, sys
rows=[]
with open(sys.argv[1], newline='', encoding='utf-8') as f:
    for row in csv.reader(f, delimiter='\t'):
        if not row:
            continue
        probe,status,code,duration,evidence,stdout,stderr=row
        rows.append({
            'probe': probe,
            'status': status,
            'exit_code': int(code),
            'duration_seconds': int(duration),
            'evidence': evidence,
            'stdout': stdout,
            'stderr': stderr,
        })
summary={
    'pass': int(sys.argv[3]),
    'fail': int(sys.argv[4]),
    'skip': int(sys.argv[5]),
    'total': len(rows),
    'live_required': os.environ.get('LLMCHAT_OPS_REQUIRE_LIVE') == '1',
}
with open(sys.argv[2], 'w', encoding='utf-8') as f:
    json.dump({'summary': summary, 'probes': rows}, f, indent=2, sort_keys=True)
    f.write('\n')
print(json.dumps(summary, sort_keys=True))
PY

if [ "${fail}" -gt 0 ]; then
  echo "[llmchat_ops_run_all] FAILED: ${fail} probe(s) failed; see ${RESULTS_JSON}" >&2
  exit 1
fi
if [ "${LLMCHAT_OPS_REQUIRE_LIVE:-0}" = '1' ] && [ "${skip}" -gt 0 ]; then
  echo "[llmchat_ops_run_all] FAILED: live required but ${skip} probe(s) skipped; see ${RESULTS_JSON}" >&2
  exit 1
fi

echo "[llmchat_ops_run_all] OK: pass=${pass} skip=${skip} fail=${fail}; results=${RESULTS_JSON}"
exit 0