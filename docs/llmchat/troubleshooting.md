# LLM Chat Assistant — Troubleshooting

## 1. The chat output contains long runs of `!!!!!!!!`

**Symptom.** The user asks a multi-step question that requires several
tool calls. The assistant's reply contains lines of bare `!`
characters — sometimes hundreds of them — instead of natural
language.

**Cause.** vLLM is running with `--tool-call-parser qwen3_coder`.
That parser is **broken** for this model on long tool-heavy
conversations; it emits an unbounded `!!!!!!!!` stream after a
certain number of tool-call frames. The Qwen3-Coder model card on
HuggingFace historically recommended `qwen3_coder` but vLLM's own
docs supersede the model card here.

**Fix.** Set the parser to `qwen3_xml`:

```bash
# In docker-compose.yml the qwen-inference command must include:
--tool-call-parser qwen3_xml

# Or in cordum-helm/values.yaml:
qwenInference:
  toolCallParser: "qwen3_xml"
```

After changing the value, restart the `qwen-inference` container or
helm-rollout the deployment. vLLM has to reload the model.

The other two parser values to avoid: `hermes` (different parser
family — output schema doesn't match this model) and
`tools_json_with_arguments` (legacy fallback that breaks streaming).
Phase 10 of the LLM-chat epic ships a CI lint that fails any PR
mentioning `qwen3_coder` or `hermes` in compose / helm files;
preserve that protection.

## 2. The chat button doesn't appear in the dashboard

**Symptom.** A user with an Enterprise license + correct RBAC role
loads the dashboard. Other dashboard buttons render but the
chat-assistant button is missing.

**Cause.** The button polls `/api/v1/chat/healthz` every 10s and
hides itself when the upstream vLLM is unreachable (epic rail #5 —
"users never see a broken chat UI").

**Fix.**

```bash
# Check vLLM health from the cordum-llm-chat container
docker compose exec cordum-llm-chat \
  wget -qO- http://qwen-inference:8000/v1/models

# If that fails, check vLLM logs for startup errors
docker compose logs -f qwen-inference

# Common causes
# - GPU not visible: missing NVIDIA runtime / nvidia-device-plugin
# - HF cache empty: first start downloads ~30GB; takes 3-5 min
# - Model file corrupted: clear qwen_hf_cache volume + restart
```

The button will reappear within 10s of `/v1/models` returning 200.

## 3. Every mutation prompts an approval, even simple ones

**Symptom.** The user asks the assistant to submit a job. Instead
of running it directly, an inline Approve / Reject prompt appears.

**Cause.** Default policy bundle preapproves `cordum_submit_job`
only. If the assistant chose a different mutation (e.g.,
`cordum_trigger_workflow` instead of `cordum_submit_job`), that's
gated.

**Fix.** Two options:

(a) Confirm the assistant picked the right tool — sometimes the
prompt-side guidance leads it to `cordum_trigger_workflow` when
`cordum_submit_job` would suffice. Tweak the system prompt's "When
to use" lines.

(b) Widen the policy bundle (rare; see `policy-bundle-default.md` →
"Promoting a tool from approval-gated to preapproved" — and read the
warning).

## 4. The assistant invents job IDs / run IDs

**Symptom.** A user asks "show me job-abc". The assistant replies
with what looks like real data, but `job-abc` doesn't exist.

**Cause.** Two-pass sampling's summary phase has temperature 0.7;
the model can hallucinate plausible-looking IDs if the system prompt
doesn't ground it.

**Fix.** Verify the system prompt is loading from
`config/llmchat/system-prompt.md` (look for guardrail #1 — "Never
invent IDs"). If the prompt loader fell back to a stub, that
guardrail is missing. Also check
`LLMCHAT_TOOL_TEMPERATURE ≤ 0.3` — tool args (including the id
arg to `cordum_get_job`) should be deterministic.

## 5. Tool calls are nondeterministic — same prompt, different args

**Symptom.** "List the last 50 jobs" sometimes returns 50, sometimes
47, sometimes 100.

**Cause.** `LLMCHAT_TOOL_TEMPERATURE` is too high. Tool args are
generated in the deterministic phase (default 0.3); raising this
randomizes filter values.

**Fix.**

```bash
LLMCHAT_TOOL_TEMPERATURE=0.3
LLMCHAT_TOOL_TOP_P=0.9
```

Restart the `cordum-llm-chat` container so the new env takes effect.

## 6. The assistant's reply gets cut off mid-sentence

**Symptom.** The final message ends abruptly with no period, often
mid-word.

**Cause.** Hit `LLMCHAT_MAX_ASSISTANT_BYTES` (default 32 KiB).
Long-data summarization (e.g., "explain the audit chain for the
last week") can blow past 32 KiB.

**Fix.** Raise the cap:

```bash
LLMCHAT_MAX_ASSISTANT_BYTES=131072  # 128 KiB
```

Or ask the user to scope their query more narrowly. The truncation
is a safety net, not the answer.

## 7. Chat fails with HTTP 402 for a Community-tier user

**Symptom.** A user on a Community-tier license loads the dashboard.
The chat button is hidden (correct), but if they hit
`/api/v1/chat/ws` directly the response is 402 with
`code: "feature_unavailable"`.

**Cause.** `LLMChatAssistant` license entitlement is Community
tier default false (epic rail #3). This is the intended behavior;
the chat assistant is an Enterprise feature.

**Fix.** Either:

(a) Upgrade the tenant's license to Enterprise (the standard path).

(b) For development / preview: set
`CORDUM_LICENSE_OVERRIDE_LLM_CHAT=true` in the gateway env. This is
**not** a production-supported path — it's there to unblock
demo / design-partner trials before the customer's license is
upgraded. Production Community deployments must use a real Enterprise
license.

## Where to file a bug

If your symptom isn't here, file a Moe task on the LLM chat epic
(`epic-ac495830`) with:

- The exact error code from the WS `error` frame (if any).
- The relevant `cordum-llm-chat` log excerpt (with secrets redacted —
  the redactor scrubs at the wire but be paranoid in bug reports).
- The vLLM command line (`docker compose exec qwen-inference cat /proc/1/cmdline | tr '\0' ' '`).
- Your hardware tier per `hardware-tiers.md`.
