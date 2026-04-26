# LLM Chat Assistant — Provider + sampling configuration

Every operator-tunable knob for the `cordum-llm-chat` service is an
environment variable. This page documents all of them with defaults
and the reasoning behind each.

## Core provider

| Env var | Default | Purpose |
|---|---|---|
| `LLMCHAT_PROVIDER` | `openai` | Inference provider adapter. Currently only `openai` (which speaks the OpenAI-compatible API that vLLM serves). |
| `LLMCHAT_BASE_URL` | `http://qwen-inference:8000/v1` | OpenAI-compatible endpoint URL. Default points at the in-cluster vLLM sidecar. Override to point at a shared inference cluster (loses zero-egress posture; see `helm.md` external-vLLM mode). |
| `LLMCHAT_MODEL` | `qwen3-coder` | The `--served-model-name` vLLM was launched with. The chat-assistant uses this verbatim in the OpenAI `model` field. |
| `LLMCHAT_API_KEY` | empty | Optional. Forwarded as `Authorization: Bearer ...` to the inference endpoint when set. Unset for in-cluster vLLM (no auth needed). |

## Two-pass sampling

The chat agent runs each turn in **two phases** with different
sampling parameters. The split exists because tool-call args and
natural-language summaries have opposite quality bars.

| Env var | Default | Purpose |
|---|---|---|
| `LLMCHAT_TOOL_TEMPERATURE` | `0.3` | Temperature for the **tool-call phase**. Low so tool args are deterministic — `{"limit": 50}` instead of `{"limit": 47}` on the same prompt. Drift in tool args breaks idempotency and confuses the audit log. |
| `LLMCHAT_TOOL_TOP_P` | `0.9` | Top-p for the tool-call phase. Pairs with the low temperature to cut the long tail. |
| `LLMCHAT_SUMMARY_TEMPERATURE` | `0.7` | Temperature for the **natural-language summarization phase** (the prose the user reads). Higher so explanations don't feel robotic — same job-deny outcome can be narrated 3 different ways across sessions. |
| `LLMCHAT_SUMMARY_TOP_P` | `0.8` | Top-p for the summary phase. |

**Why two phases.** A single phase forces a tradeoff: low-temp gives
correct-but-monotone prose; high-temp gives lively prose that
randomizes filter values. The two-pass split lets us pin tool args
deterministically while keeping summaries fresh.

If a customer reports "tool arguments are flaky", verify
`LLMCHAT_TOOL_TEMPERATURE ≤ 0.3`. If they report "the explanations
all sound the same", `LLMCHAT_SUMMARY_TEMPERATURE` may be too low.

## Per-turn budgets

| Env var | Default | Purpose |
|---|---|---|
| `LLMCHAT_MAX_TOOL_CALLS_PER_TURN` | `12` | Hard ceiling on tool calls per user message. Stops runaway loops where the LLM keeps calling `cordum_get_job` on the same id. |
| `LLMCHAT_MAX_WALL_CLOCK_PER_TURN` | `60s` | Per-turn timeout. Aborts the loop if the model + tool calls exceed this. |
| `LLMCHAT_MAX_ASSISTANT_BYTES` | `32768` | Truncates the final assistant text to keep responses readable. Raise for chat sessions doing big-data summarization. |

## vLLM command (correct flag form)

The `qwen-inference` sidecar must be launched with this exact flag
form. Phase 7 ships these in `docker-compose.yml` and
`cordum-helm/templates/deployment-qwen-inference.yaml`; the values are
also pinned in `cordum-helm/values.yaml.qwenInference.*`.

```text
vllm serve Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8 \
  --served-model-name qwen3-coder \
  --enable-auto-tool-choice \
  --tool-call-parser qwen3_xml \
  --max-model-len 131072 \
  --kv-cache-dtype fp8 \
  --enable-prefix-caching \
  --gpu-memory-utilization 0.9 \
  --host 0.0.0.0 \
  --port 8000
```

(In-container `--host` is `0.0.0.0` so the llm-chat pod can reach
vLLM via the Service ClusterIP. The host port mapping in compose
restricts external exposure to loopback. See `helm.md` for the
network exposure boundary detail.)

### Anti-example: do NOT use these values

```text
# WRONG — every line below is a real failure mode that customers have hit
vllm serve Qwen/Qwen3-Coder-30B-A3B-Instruct \           # missing -FP8 suffix
  --tool-call-parser hermes \                            # different parser family — output schema doesn't match
  --tool-call-parser qwen3_coder \                       # known broken — emits infinite "!!!!!!!!" stream on long tool conversations
  --host 0.0.0.0 --port 8000                             # OK in container, but if you map "0.0.0.0:8000:8000" on the host you've exposed inference externally
```

- `Qwen3-Coder-30B-A3B-Instruct` (no `-FP8`) is the BF16 checkpoint;
  it does not fit on an H100 80GB at 128k context.
- `hermes` is a different tool-call parser that doesn't match this
  model's output schema. Tool calls round-trip as raw text.
- `qwen3_coder` (mentioned in early Qwen model cards) emits
  infinite `!!!!!!!!` token streams on long tool-heavy conversations.
  vLLM's docs supersede the Qwen model card here. See
  `troubleshooting.md` entry 1.
- `0.0.0.0:8000:8000` host port mapping exposes the inference
  endpoint externally. Use `127.0.0.1:8000:8000` (compose) or
  `Service.type: ClusterIP` (helm).

## External inference cluster mode

To point at an existing vLLM cluster instead of the in-cluster
sidecar:

```bash
# Compose
COMPOSE_PROFILES=llmchat \
LLMCHAT_BASE_URL=https://vllm.internal.example/v1 \
docker compose up -d cordum-llm-chat
# (qwen-inference will still come up under the llmchat profile;
# stop/skip it explicitly if you don't want it running.)

# Helm
helm install cordum cordum-helm/ \
  --set llmChat.externalBaseUrl=https://vllm.internal.example/v1 \
  --set qwenInference.enabled=false \
  ...
```

Caveat: the chat assistant is no longer zero-egress when pointed at
an external endpoint. The `helm.md` "External vLLM mode" section
covers the security implications.
