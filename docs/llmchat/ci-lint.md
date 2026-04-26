# vLLM Config Drift Lint (phase 10)

## Purpose

The `vllm-config-lint` CI gate prevents regressions in the
`qwen-inference` service configuration shipped via `docker-compose.yml`,
`docker-compose.release.yml`, and `cordum-helm/`. It exists because
phase-7 of the LLM-chat epic originally shipped with three concrete
bugs that the lint would have caught at PR time:

1. `--tool-call-parser hermes` (a non-Qwen parser that produces
   malformed `<tool_call>` XML deltas — the `!!!!!!!!` symptom).
2. Missing `--kv-cache-dtype fp8` (memory budget busts on H100 at the
   model's full 131072-token context window).
3. `--host 127.0.0.1` (broke Docker DNS reachability for the
   `llm-chat` sidecar; the correct boundary is the host port mapping
   `127.0.0.1:8000:8000`, not the container bind address).

The lint encodes these specific rules so the next contributor cannot
silently re-introduce them. **Each rule fails the CI build hard.**
Warnings get ignored (per task rail #1).

## What the lint checks

### `vllm_config_lint.sh`

Runs against `docker-compose.yml` and `docker-compose.release.yml`.
For each file that defines a `qwen-inference` service:

| Rule | Reason |
| --- | --- |
| `model-must-match-tier` | Exact model identifier per `CORDUM_LLMCHAT_TIER` (1=FP8 default, 2=AWQ). Explicit codepath, not relaxed regex. |
| `parser-must-be-qwen3-xml` | `qwen3_xml` is the model's native tool-call format. |
| `parser-disallowed-hermes` | Hermes is a non-Qwen parser; produces malformed deltas. |
| `parser-disallowed-qwen3-coder` | `qwen3_coder` is not a real upstream-vLLM parser at all. |
| `max-model-len-flag` / `-value` | `--max-model-len 131072` is the model's documented context window. |
| `kv-cache-dtype-flag` / `-value` | `--kv-cache-dtype fp8` halves KV-cache memory; required to fit at 131072 ctx. |
| `enable-prefix-caching` | Multi-turn chats reuse the system-prompt KV cache; without this every turn pays the full prefill cost. |
| `ports-must-be-loopback` | Host port mapping must be `127.0.0.1:8000:8000`. The vLLM endpoint is never exposed off-host. |
| `ports-disallow-wildcard` | `0.0.0.0:8000:8000` would expose vLLM to the network. |
| `ports-disallow-bare` | Bare `8000:8000` defaults to `0.0.0.0`; same security failure. |
| `start-period-must-be-300s` | FP8 weights are ~30GB; first load takes 3–5min on NVMe. Anything shorter risks the container being marked unhealthy mid-warmup. |

Note: the `--host` flag is **not** a lint target; the rule lives on
the *port mapping*, not the bind address. Phase-7 reopen #1 corrected
the bind to `0.0.0.0` so the `llm-chat` sidecar can reach vLLM via
Docker DNS at `http://qwen-inference:8000/v1`. The host exposure
boundary is the loopback port mapping (`127.0.0.1:8000:8000`), not
the container bind address.

### `vllm_helm_lint.sh`

Renders `helm template cordum-helm -f values.yaml` and asserts:

| Rule | Reason |
| --- | --- |
| `helm-model-must-match-tier` | Same as compose: exact identifier per tier. |
| `helm-parser-must-be-qwen3-xml` (+ disallowed variants) | Same as compose. |
| `helm-max-model-len-flag` / `-value` | Same as compose. |
| `helm-kv-cache-dtype-flag` / `-value` | Same as compose. |
| `helm-enable-prefix-caching` | Same as compose. |
| `helm-service-type-clusterip` | `qwen-inference` Service must be `ClusterIP`. `LoadBalancer` / `NodePort` would break the zero-egress invariant. |
| `values-qwenInference-missing-<key>` | `cordum-helm/values.yaml` must declare all 5 mandatory `qwenInference` keys (`toolCallParser`, `maxModelLen`, `kvCacheDtype`, `enablePrefixCaching`, `gpuMemoryUtilization`). |

### `vllm_config_lint_test.sh`

Negative-case driver. Builds tiny fixture composes with each known
violation injected and asserts the lint rejects them with the right
rule name. Each negative case runs 3× (mirrors `go test -count=3`
flake-detection). One positive case (current real composes) runs
once.

## Tier 1 vs Tier 2

Tier is read from `CORDUM_LLMCHAT_TIER`:

- `CORDUM_LLMCHAT_TIER=1` (default, omittable): expects
  `Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8` (H100-class, FP8 native).
- `CORDUM_LLMCHAT_TIER=2`: expects
  `QuantTrio/Qwen3-Coder-30B-A3B-Instruct-AWQ` (Ada/Blackwell consumer
  cards without FP8 native, e.g. RTX 5090 / PRO 6000).

Per task rail #4, this is an explicit codepath — the lint does NOT
accept `(qwen3_xml|qwen3_coder)` style relaxed regex. Adding a new
tier means adding a new exact identifier in
`tools/scripts/vllm_lint_common.sh::vllm_lint_tier_model_name`.

## Running locally

From the repo root:

```bash
# Compose lint (default targets: docker-compose.yml + .release.yml)
bash tools/scripts/vllm_config_lint.sh

# Helm lint (default chart: cordum-helm/, default values: cordum-helm/values.yaml)
bash tools/scripts/vllm_helm_lint.sh

# Test driver (negative cases)
bash tools/scripts/vllm_config_lint_test.sh
```

Pre-reqs:

- `bash` (POSIX-portable; no GNU-only flags)
- `helm` v3.20+ (the helm-lint script renders templates)
- `yq` (mikefarah v4) — optional; the scripts fall back to `grep` if
  yq is absent. Install via `wget` (Linux/CI), `brew install yq`
  (macOS), or `choco install yq` (Windows).

## Adding or changing rules

Per task rail #3:

> Rules encode the plan-prescribed vLLM config. If the plan
> legitimately changes (e.g. upstream vLLM releases a better parser),
> this task's lint rules get a matching update in the same PR.

Workflow:

1. Update `tools/scripts/vllm_config_lint.sh` /
   `vllm_helm_lint.sh` to encode the new rule.
2. Update `tools/scripts/vllm_config_lint_test.sh` with a negative
   fixture proving the rule rejects the old behavior.
3. Update this doc with the new rule + the upstream evidence link.
4. Update the affected compose / helm files in the same PR; the lint
   gate will refuse to merge until both are consistent.

## CI integration

The workflow at `.github/workflows/vllm-config-lint.yml` runs on PRs
that touch `docker-compose*.yml`, `cordum-helm/**`, or any
`tools/scripts/vllm_*` file. It executes the test driver first
(catches lint-script regressions), then the actual compose + helm
lints. Total CI time is well under a minute.

Branch-protection promotion to required check is staged after a
7-run / 7-day soak.
