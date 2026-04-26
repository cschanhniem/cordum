#!/usr/bin/env bash
# vllm_lint_common.sh — shared bash helpers for the vLLM config drift
# lint scripts. Sourced by tools/scripts/vllm_config_lint.sh and
# tools/scripts/vllm_helm_lint.sh.
#
# Each assert_* helper prints a single-line FAIL with file:line+rule
# name and increments the FAILS counter that the caller exits with.
# Helpers are deliberately small + greppable so a contributor can map
# any failure to a specific check in 30 seconds (per task rail #2).
#
# POSIX-portable bash; no GNU-only flags. yq is used when available,
# else falls back to grep so the lint runs on stripped-down CI
# images without yq pre-installed.

set -euo pipefail

# FAILS is incremented by every assertion that detects a violation.
# Callers source this file then read FAILS at the end as the exit code.
FAILS=0

# vllm_lint_have_yq returns 0 if yq is present in PATH.
vllm_lint_have_yq() {
	command -v yq >/dev/null 2>&1
}

# vllm_lint_print_fail prints a uniformly-formatted FAIL line and bumps
# the counter. Format: `[FAIL] <file>:<line> rule=<name> — <explanation>`.
# When line is unknown (e.g. "missing flag"), pass `-` for line.
vllm_lint_print_fail() {
	local file="$1"
	local line="$2"
	local rule="$3"
	local msg="$4"
	echo "[FAIL] ${file}:${line} rule=${rule} — ${msg}" >&2
	FAILS=$((FAILS + 1))
}

# vllm_lint_assert_present greps file for regex; if absent, FAIL with
# rule=<rule> + msg="<rule> regex must be present".
vllm_lint_assert_present() {
	local file="$1"
	local regex="$2"
	local rule="$3"
	local msg="${4:-required line not found}"
	if ! grep -nE "$regex" "$file" >/dev/null 2>&1; then
		vllm_lint_print_fail "$file" "-" "$rule" "$msg (regex: $regex)"
	fi
}

# vllm_lint_assert_absent greps file for regex; if PRESENT, FAIL and
# include the offending line number from `grep -n`.
vllm_lint_assert_absent() {
	local file="$1"
	local regex="$2"
	local rule="$3"
	local msg="${4:-disallowed line found}"
	# `|| true` so set -e doesn't trip when grep finds nothing.
	local hit
	hit=$(grep -nE "$regex" "$file" 2>/dev/null || true)
	if [ -n "$hit" ]; then
		# Print the first matched line:number for the operator.
		local first
		first=$(echo "$hit" | head -n1)
		local line
		line=$(echo "$first" | cut -d: -f1)
		vllm_lint_print_fail "$file" "$line" "$rule" "$msg (offending line: $first)"
	fi
}

# vllm_lint_tier_model_name echoes the expected model name for the
# active tier. Tier 1 (default) = FP8 native. Tier 2 = AWQ INT4. Tier
# is read from CORDUM_LLMCHAT_TIER; unset/empty defaults to 1.
#
# The values are exact identifiers (not regexes) so a lint failure
# names the model the operator should be running.
vllm_lint_tier_model_name() {
	local tier="${CORDUM_LLMCHAT_TIER:-1}"
	case "$tier" in
		1) echo "Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8" ;;
		2) echo "QuantTrio/Qwen3-Coder-30B-A3B-Instruct-AWQ" ;;
		*)
			echo "[ERROR] CORDUM_LLMCHAT_TIER=${tier} is not 1 or 2; set explicitly" >&2
			exit 2
			;;
	esac
}

# vllm_lint_assert_value_yq runs `yq .key` on file and asserts equality
# with want. Falls back to grep on the literal line when yq is absent
# (good enough for top-level scalar values like start_period).
vllm_lint_assert_value_yq() {
	local file="$1"
	local query="$2"
	local want="$3"
	local rule="$4"
	if vllm_lint_have_yq; then
		local got
		got=$(yq -r "$query" "$file" 2>/dev/null || echo "<yq-error>")
		if [ "$got" != "$want" ]; then
			vllm_lint_print_fail "$file" "-" "$rule" "yq query '$query' returned '$got', want '$want'"
		fi
	else
		# grep fallback: the caller-supplied query is treated as a
		# regex hint of the expected line. This is best-effort.
		vllm_lint_assert_present "$file" "$want" "$rule" "grep fallback could not find expected '$want'"
	fi
}
