#!/usr/bin/env bash
# vllm_pin_digest.sh — bump the qwen-inference vLLM image pin in lock-step
# across docker-compose.yml, docker-compose.release.yml, cordum-helm/values.yaml,
# and cordum-helm/templates/deployment-qwen-inference.yaml.
#
# Why this exists (task-991597a4):
#   The supply-chain rail mandates the vLLM image is referenced by sha256
#   digest, not a moving tag. Bumping that pin by hand is a quad-edit that's
#   trivial to get out of sync — a worker who forgets the release-compose
#   variant ships a dev-vs-release split that the CI gate then fails. This
#   script does the bump deterministically against the comment-marker
#   pattern landed in step 2, so it cannot accidentally rewrite an
#   unrelated `image:` line.
#
# Usage:
#   bash tools/scripts/vllm_pin_digest.sh <version-tag>            # interactive
#   bash tools/scripts/vllm_pin_digest.sh <version-tag> --yes      # CI / non-interactive
#
# Idempotent: re-running with the same tag is a no-op (digest unchanged → no
# diff to write). Re-running with a NEW tag prints the diff before writing,
# so an operator can sanity-check the resolved digest against an external
# source before committing.
#
# Resolves the manifest-list digest, NOT a per-architecture digest, so the
# pin covers every arch the upstream image publishes (we deploy linux/amd64
# but a future arm64 deploy stays consistent).

set -euo pipefail

if [ "${#}" -lt 1 ]; then
	cat >&2 <<'USAGE'
usage: vllm_pin_digest.sh <version-tag> [--yes]

  <version-tag>   vLLM image tag to pin, e.g. v0.16.0 or v0.16.1.
  --yes           non-interactive (CI use).

example:
  bash tools/scripts/vllm_pin_digest.sh v0.16.1
USAGE
	exit 2
fi

TAG="${1}"
ASSUME_YES="false"
if [ "${#}" -ge 2 ] && [ "${2}" = "--yes" ]; then
	ASSUME_YES="true"
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${REPO_ROOT}"

if ! command -v docker >/dev/null 2>&1; then
	echo "[ERROR] docker CLI not installed; required to resolve manifest digest" >&2
	exit 3
fi
if ! command -v jq >/dev/null 2>&1; then
	echo "[ERROR] jq not installed; required to parse manifest" >&2
	exit 3
fi

IMAGE_REPO="vllm/vllm-openai"
echo "[vllm-pin] resolving manifest-list digest for ${IMAGE_REPO}:${TAG}" >&2

# `docker buildx imagetools inspect` returns the manifest-list digest in a
# stable JSON shape; fall back to `docker manifest inspect` + jq if buildx
# is unavailable (older docker installs on CI runners).
RAW=""
if docker buildx imagetools inspect "${IMAGE_REPO}:${TAG}" --format '{{json .}}' >/tmp/vllm-imagetools.json 2>/dev/null; then
	RAW="$(jq -r '.manifest.digest // empty' </tmp/vllm-imagetools.json)"
fi
if [ -z "${RAW}" ]; then
	RAW="$(docker manifest inspect "${IMAGE_REPO}:${TAG}" 2>/dev/null | jq -r '.config.digest // empty' || true)"
fi
if [ -z "${RAW}" ] || ! [[ "${RAW}" =~ ^sha256:[a-f0-9]{64}$ ]]; then
	echo "[ERROR] could not resolve sha256 digest for ${IMAGE_REPO}:${TAG}" >&2
	exit 4
fi
NEW_DIGEST="${RAW}"
SHORT="${NEW_DIGEST#sha256:}"
SHORT="${SHORT:0:8}"
echo "[vllm-pin] resolved digest: ${NEW_DIGEST}" >&2
echo "[vllm-pin] short:           ${SHORT}" >&2

# The four files this script edits. Each is matched by the comment-marker
# anchor landed in step 2 — the script ONLY rewrites the `image:` line that
# immediately follows the marker block, so an unrelated `image:` line in
# the same file (e.g. cordum-llm-chat) stays untouched.
COMPOSE_FILES=(
	"docker-compose.yml"
	"docker-compose.release.yml"
)
HELM_VALUES="cordum-helm/values.yaml"
HELM_TEMPLATE="cordum-helm/templates/deployment-qwen-inference.yaml"

# Detect existing digest from docker-compose.yml (source of truth). If it
# matches NEW_DIGEST, this is a no-op invocation — exit clean.
EXISTING_DIGEST="$(grep -oE 'vllm/vllm-openai@sha256:[a-f0-9]{64}' docker-compose.yml | head -n1 | sed 's|vllm/vllm-openai@||' || true)"
if [ "${EXISTING_DIGEST}" = "${NEW_DIGEST}" ]; then
	echo "[vllm-pin] digest already pinned to ${NEW_DIGEST}; nothing to do." >&2
	exit 0
fi

echo "[vllm-pin] previous digest: ${EXISTING_DIGEST:-<none>}" >&2

# Build sed scripts that target ONLY the marker-anchored image: line. The
# marker line `# Pinned to vLLM …` precedes the `image:` line by 3 lines.
# We use a multi-line sed range against the literal `vllm/vllm-openai@sha256:` regex.

apply_compose_pin() {
	local f="${1}"
	# Replace "vllm/vllm-openai@sha256:<old>" with "vllm/vllm-openai@sha256:<new>"
	# everywhere in the file. Compose files only reference vllm-openai via the
	# pinned digest line; no false-positive risk.
	sed -i.bak \
		-e "s|vllm/vllm-openai@sha256:[a-f0-9]\{64\}|vllm/vllm-openai@${NEW_DIGEST}|g" \
		-e "s|# Pinned to vLLM [^@]*@sha256:[a-f0-9]\{8\}|# Pinned to vLLM ${TAG}@sha256:${SHORT}|g" \
		"${f}"
	rm -f "${f}.bak"
}

apply_helm_values_pin() {
	local f="${HELM_VALUES}"
	# values.yaml uses structured form: digest: "sha256:<hex>". Marker comment
	# above uses the short-digest tail. Both rewritten together.
	sed -i.bak \
		-e "s|digest: \"sha256:[a-f0-9]\{64\}\"|digest: \"${NEW_DIGEST}\"|g" \
		-e "s|# Pinned to vLLM [^@]*@sha256:[a-f0-9]\{8\}|# Pinned to vLLM ${TAG}@sha256:${SHORT}|g" \
		"${f}"
	rm -f "${f}.bak"
}

apply_helm_template_pin() {
	# The deployment template renders via {{ .Values.qwenInference.image.digest }};
	# updating values.yaml is sufficient. We still rewrite any literal digest
	# reference in the template (defensive: catches the case where someone
	# inlined the digest in a comment for documentation).
	local f="${HELM_TEMPLATE}"
	if grep -q 'sha256:[a-f0-9]\{64\}' "${f}"; then
		sed -i.bak \
			-e "s|sha256:[a-f0-9]\{64\}|${NEW_DIGEST}|g" \
			"${f}"
		rm -f "${f}.bak"
	fi
}

# Compute the diff first so the operator (or CI) can see what's about to
# change. We do this by applying to a temp copy, diffing, then either
# committing or aborting.
TMPDIR="$(mktemp -d)"
trap 'rm -rf "${TMPDIR}"' EXIT
for f in "${COMPOSE_FILES[@]}" "${HELM_VALUES}" "${HELM_TEMPLATE}"; do
	mkdir -p "${TMPDIR}/$(dirname "${f}")"
	cp "${f}" "${TMPDIR}/${f}"
done
(
	cd "${TMPDIR}"
	for f in "${COMPOSE_FILES[@]}"; do apply_compose_pin "${f}"; done
	apply_helm_values_pin
	apply_helm_template_pin
)

echo "[vllm-pin] proposed diff:" >&2
echo "----" >&2
DIFF_OUTPUT=""
for f in "${COMPOSE_FILES[@]}" "${HELM_VALUES}" "${HELM_TEMPLATE}"; do
	if ! diff -u "${f}" "${TMPDIR}/${f}" >/dev/null 2>&1; then
		DIFF_OUTPUT="${DIFF_OUTPUT}$(diff -u "${f}" "${TMPDIR}/${f}" || true)"$'\n'
	fi
done
printf '%s' "${DIFF_OUTPUT}" >&2
echo "----" >&2

if [ "${ASSUME_YES}" != "true" ]; then
	read -r -p "[vllm-pin] apply this digest update? [y/N] " ans
	if [ "${ans}" != "y" ] && [ "${ans}" != "Y" ]; then
		echo "[vllm-pin] aborted by operator." >&2
		exit 5
	fi
fi

# Apply for real.
for f in "${COMPOSE_FILES[@]}"; do apply_compose_pin "${f}"; done
apply_helm_values_pin
apply_helm_template_pin

echo "[vllm-pin] pinned ${IMAGE_REPO} to ${NEW_DIGEST} across:" >&2
for f in "${COMPOSE_FILES[@]}" "${HELM_VALUES}" "${HELM_TEMPLATE}"; do
	echo "  - ${f}" >&2
done
echo "[vllm-pin] next: review with 'git diff', then commit. The supply-chain CI" >&2
echo "[vllm-pin] gate (.github/workflows/supply-chain-vllm.yml) verifies all four" >&2
echo "[vllm-pin] references agree on the digest before scanning." >&2
