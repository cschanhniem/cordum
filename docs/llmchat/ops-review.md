# LLM Chat Observability + Ops Senior Review

Task: `task-8eab552b`  
Status: **IN PROGRESS**  
Reviewer: Moe worker `worker-54cf`  
Last updated: 2026-04-28

## Scope note (2026-04-28 informational-only pivot)

The LLM chat assistant is now an **informational-only** Cordum docs/API helper.
It does not call MCP tools, does not submit jobs, and does not mutate state.
This review therefore keeps day-2 observability for chat sessions, admin review,
redaction, metrics, logs, alerts, and stable informational chat frames, while
marking retired chat→MCP/tool-call/approval-frame surfaces as superseded by the
pivot unless they still exist for backwards-compatibility.

Production default inference is Ollama/OpenAI-compatible local inference. vLLM
remains an opt-in GPU profile; dashboards and probes should label the active
backend and keep vLLM-specific panels as opt-in.

## Executive summary

| Probe | Surface | Verdict | Evidence |
|---|---|---:|---|
| 1 | Structured logs + redaction | TODO | `out/llmchat-ops/probe-01/evidence.txt` |
| 2 | Prometheus metrics + cardinality | TODO | `out/llmchat-ops/probe-02/evidence.txt` |
| 3 | Trace propagation / Jaeger | TODO | `out/llmchat-ops/probe-03/evidence.txt` |
| 4 | Admin session viewer + audit | TODO | `out/llmchat-ops/probe-04/evidence.txt` |
| 5 | Chat frame protocol stability | TODO | `out/llmchat-ops/probe-05/evidence.txt` |
| 6 | Ops runbook | TODO | `docs/llmchat/ops-runbook.md` |
| 7 | Grafana dashboard | TODO | `cordum-helm/dashboards/llm-chat.json` |
| 8 | SIEM export | TODO | `out/llmchat-ops/probe-08/evidence.txt` |
| 9 | Alert rules | TODO | `cordum-helm/alerts/llm-chat.yaml` |
| 10 | Cost / usage visibility | TODO | `out/llmchat-ops/probe-10/evidence.txt` |
| 11 | Admin debug dump | TODO | `out/llmchat-ops/probe-11/evidence.txt` |
| 12 | Log sampling / volume bounds | TODO | `out/llmchat-ops/probe-12/evidence.txt` |

### Current pre-probe findings from exploration

- Runtime logs from `llm-chat-ollama` are not pure JSON; they are text-prefixed
  slog lines. Probe 1 must verify whether that is still true for the current
  image and classify severity.
- Metrics are live and bounded by allowlists in `core/llmchat/metrics.go`, but
  metric names still contain legacy `tool`/`vllm` terminology.
- No OpenTelemetry/Jaeger wiring was found for llm-chat during exploration.
- Admin session list/detail routes enforce permission and tenant scope, but no
  `chat.admin_session_viewed` SIEM event constant/emission was found.
- `/settings/chat-sessions` exists, but search and chat-specific detail routing
  need verification; current rows navigate to `/copilot/sessions/:sessionId`.
- Chart path in this repo is `cordum-helm/`; plan references to `helm/cordum/`
  are stale.

## Cardinality ceiling

| Metric family | Labels | Expected max series | Enforcement |
|---|---|---:|---|
| `chat_sessions_active` | none | 1 | `core/llmchat/metrics_test.go` |
| `chat_tool_calls_total` | `tool` allowlist + `unknown` | 21 legacy/back-compat series | `normalizeTool` allowlist |
| `chat_approval_required_total` | none | 1 legacy/back-compat series | no labels |
| `chat_vllm_latency_seconds` | histogram `le` only | 12 histogram series | fixed buckets |
| `chat_token_budget_used_total` | none | 1 | no labels |
| `chat_errors_total` | `kind` allowlist | 8 series | `normalizeErrorKind` allowlist |

Session IDs, principals, tenants, prompt text, tokens, trace IDs, and error
messages must never be metric labels.

## Probe 1 — Structured logs + secret redaction

**Expected:** llm-chat logs are structured, machine-parseable, include safe
correlation fields (`session_id`, `user_principal`, `tenant`, `trace_id`) where
applicable, and never leak tokens, API keys, JWTs, PEM material, or prompts at
INFO.

**Procedure:** `scripts/ops-probes/probe-01.sh` captures logs, validates JSON
or records the non-JSON format as evidence, and runs the shared secret-pattern
scanner.

**Actual:** TODO

**Verdict:** TODO

**Evidence:** `out/llmchat-ops/probe-01/evidence.txt`

**Findings / tasks:** TODO

## Probe 2 — Metrics + cardinality

**Expected:** `/metrics` returns the required chat metric families, every label
is bounded, and no session-like or secret-like value appears in labels.

**Procedure:** `scripts/ops-probes/probe-02.sh` fetches Prometheus text format,
checks required families, counts label combinations per family, and scans label
values for UUID/session/token shapes.

**Actual:** TODO

**Verdict:** TODO

**Evidence:** `out/llmchat-ops/probe-02/evidence.txt`

**Findings / tasks:** TODO

## Probe 3 — Trace propagation / Jaeger

**Expected:** a single chat message has one trace across browser, gateway,
llm-chat, inference backend, audit, and any retained downstream services.
Under informational-only scope, MCP/scheduler/worker spans are retired unless a
legacy tool path is deliberately exercised.

**Procedure:** `scripts/ops-probes/probe-03.sh` records trace IDs from logs and
queries the configured Jaeger/OTEL endpoint when present.

**Actual:** TODO

**Verdict:** TODO

**Evidence:** `out/llmchat-ops/probe-03/evidence.txt` and Jaeger screenshot
reference if available.

**Findings / tasks:** TODO

## Probe 4 — Admin session viewer + audit

**Expected:** admin-only session list/detail works, supports pagination and
search, shows read-only transcripts, and emits a SIEM/audit event for each
admin view.

**Procedure:** `scripts/ops-probes/probe-04.sh` exercises list/detail APIs where
credentials exist; browser evidence is attached separately.

**Actual:** TODO

**Verdict:** TODO

**Evidence:** `out/llmchat-ops/probe-04/evidence.txt`

**Findings / tasks:** TODO

## Probe 5 — Chat frame protocol stability

**Expected:** informational chat frames are schema-pinned. If a version field is
used it is pinned to `v: 1`; unknown versions fail closed. Retired tool-call and
approval frames are not treated as production-default requirements after the
2026-04-28 pivot.

**Procedure:** `scripts/ops-probes/probe-05.sh` checks static frame schema tests
and, in live mode, sends a deliberately unsupported version frame.

**Actual:** TODO

**Verdict:** TODO

**Evidence:** `out/llmchat-ops/probe-05/evidence.txt`

**Findings / tasks:** TODO

## Probe 6 — Ops runbook

**Expected:** `docs/llmchat/ops-runbook.md` covers deploy, upgrade, rollback,
scale, health checks, alerts, known issues, and escalation for customer ops.

**Procedure:** `scripts/ops-probes/probe-06.sh` checks required headings and
links.

**Actual:** TODO

**Verdict:** TODO

**Evidence:** `docs/llmchat/ops-runbook.md`, `out/llmchat-ops/probe-06/evidence.txt`

**Findings / tasks:** TODO

## Probe 7 — Grafana dashboard

**Expected:** `cordum-helm/dashboards/llm-chat.json` ships with panels for
active sessions, backend latency, token budget, errors, and backend health; it
imports with no-data panels instead of errors.

**Procedure:** `scripts/ops-probes/probe-07.sh` validates JSON structure and, in
live mode, records Grafana import evidence.

**Actual:** TODO

**Verdict:** TODO

**Evidence:** `out/llmchat-ops/probe-07/evidence.txt`

**Findings / tasks:** TODO

## Probe 8 — SIEM export

**Expected:** chat lifecycle events and retained governance events export
through the existing audit sinks. Retired `mcp.tool_invocation` and
`chat.approval_required` paths are not production-default chat requirements.

**Procedure:** `scripts/ops-probes/probe-08.sh` checks constants/tests and, when
sinks are configured, captures webhook/syslog/Datadog/CloudWatch examples.

**Actual:** TODO

**Verdict:** TODO

**Evidence:** `out/llmchat-ops/probe-08/evidence.txt`

**Findings / tasks:** TODO

## Probe 9 — Alert rules

**Expected:** llm-chat alert rules ship in the Helm chart and validate with
promtool: backend down, high error rate, approval backlog/retired equivalent,
and zero sessions for 30m.

**Procedure:** `scripts/ops-probes/probe-09.sh` validates YAML and runs promtool
when available.

**Actual:** TODO

**Verdict:** TODO

**Evidence:** `out/llmchat-ops/probe-09/evidence.txt`

**Findings / tasks:** TODO

## Probe 10 — Cost / usage visibility

**Expected:** per-tenant chat usage counters exist for ops/billing planning
(tokens in/out, messages, backend calls; tool-call counters only for legacy
compatibility).

**Procedure:** `scripts/ops-probes/probe-10.sh` checks for admin API routes and,
in live mode, verifies per-tenant counters.

**Actual:** TODO

**Verdict:** TODO

**Evidence:** `out/llmchat-ops/probe-10/evidence.txt`

**Findings / tasks:** TODO

## Probe 11 — Admin debug dump

**Expected:** an admin can export a redacted support bundle for a chat session:
transcript, frame log, trace/correlation IDs, and zero secrets. Dumps must have
bounded retention or cleanup semantics.

**Procedure:** `scripts/ops-probes/probe-11.sh` checks for endpoint/UI support
and scans any produced dump with the shared secret scanner.

**Actual:** TODO

**Verdict:** TODO

**Evidence:** `out/llmchat-ops/probe-11/evidence.txt`

**Findings / tasks:** TODO

## Probe 12 — Log sampling / volume bounds

**Expected:** high-volume streaming/token-delta logs are sampled or suppressed
at INFO; correlation IDs remain available even when detail logs are sampled out.

**Procedure:** `scripts/ops-probes/probe-12.sh` counts log lines during a small
chat load test and records whether DEBUG-level token deltas are bounded.

**Actual:** TODO

**Verdict:** TODO

**Evidence:** `out/llmchat-ops/probe-12/evidence.txt`

**Findings / tasks:** TODO

## Follow-up task log

| Severity | Task | Probe | Summary |
|---|---|---|---|
| TODO | TODO | TODO | TODO |

## Final verification log

Commands and results will be appended here before `moe.complete_task`.
