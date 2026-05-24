---
sidebar_position: 10
title: Edge Observability
---

# Edge Observability

Edge emits Prometheus metrics, structured logs, and audit/SIEM events for the
Claude command-hook + local agentd + Gateway path. This surface is **compliance
evidence**, not a second job lifecycle — Edge actions are modeled as
`EdgeSession → AgentExecution → AgentActionEvent`, and `job_id` is populated only
when an execution is explicitly linked to a real Cordum Job or workflow run.

All metric emission goes through `core/edge.Recorder`. **Tenant IDs are never
metric labels** — tenant correlation belongs in audit/log records.

## Key metrics

Metric names use the `cordum_edge_` namespace. A selection of the most useful
counters/gauges/histograms:

| Metric | Type | Labels | Emitted when |
| --- | --- | --- | --- |
| `cordum_edge_sessions_created_total` | counter | `mode`, `agent_product` | A session is created. |
| `cordum_edge_sessions_active` | gauge | `mode` | Active-session accounting. |
| `cordum_edge_executions_started_total` | counter | `mode`, `agent_product` | An execution is created. |
| `cordum_edge_action_decisions_total` | counter | `layer`, `kind`, `decision`, `mode` | Each evaluate/hook decision. |
| `cordum_edge_actions_denied_total` | counter | `layer`, `kind`, `reason_code` | Deny/throttle outcomes. |
| `cordum_edge_approvals_requested_total` | counter | `layer`, `kind` | An approval is required/enqueued. |
| `cordum_edge_approvals_resolved_total` | counter | `layer`, `kind`, `outcome` | Terminal approval outcomes. |
| `cordum_edge_degraded_total` | counter | `mode`, `component`, `reason_code` | A degraded Gateway/agentd/hook/evidence path. |
| `cordum_edge_fail_closed_total` | counter | `mode`, `reason_code` | Enterprise/workflow enforcement blocks on a governance miss. |
| `cordum_edge_event_persisted_total` | counter | `layer`, `kind`, `decision` | An event commits to the store. |
| `cordum_edge_hook_latency_seconds` | histogram | `hook_event`, `decision` | End-to-end hook latency (SLO input). |
| `cordum_edge_evaluate_latency_seconds` | histogram | `layer`, `kind`, `decision` | Gateway evaluate latency (SLO input). |
| `cordum_edge_session_cleanup_deadline_total` | counter | none | `DeleteSession` foreground deadline exceeded (alert candidate). |
| `cordum_edge_stream_drops_total` | counter | `reason` | Gateway stream-bridge drop paths (alert candidate). |

> Some external reviewer names omit the `cordum_edge_` namespace (e.g.
> `edge_policy_decision_total` maps to `cordum_edge_action_decisions_total`).
> Cordum keeps the shipped names so existing dashboards/alerts don't break.

### Bounded label discipline

Recorder normalizers collapse unrecognized values to `other` / `unknown`. Never
add raw command strings, prompts, file paths, signed URLs, session/event IDs,
approval refs, rule IDs, arbitrary error strings, tokens, or **tenant IDs** as
labels. Representative bounded sets:

| Label | Allowed values |
| --- | --- |
| `layer` | `hook`, `mcp`, `llm`, `runtime`, `workflow`, `system`, `other`, `unknown`. |
| `decision` | `allow`, `deny`, `require_approval`, `throttle`, `constrain`, `degraded`, `recorded`, `unknown`, `other`. |
| `mode` | `observe`, `local-dev`, `local-dev-enforce`, `enterprise-strict`, `workflow`, `unknown`, `other`. |
| `agent_product` | `claude-code`, `codex`, `cursor`, `unknown`, `other`. |
| `tenant_present` | `true` / `false` — never the tenant value. |

## Structured logs

Use the shared attribute builders in `core/edge/observability.go`
(`EventLogAttrs`, `SessionLogAttrs`, `ApprovalLogAttrs`, …). They emit only
bounded IDs, enum-like fields, timestamps, hashes, counts, redaction level, and
status/decision metadata — never raw input maps, hook payloads, prompts, tool
output, approval reason text, signed URIs, `Authorization` headers, API keys, or
hook nonces.

## Audit / SIEM events

Edge reuses the existing audit pipeline (`core/audit.AuditSender`,
`audit.SIEMEvent`). Audit emission is best-effort and must not change a
policy/evaluate/hook decision if the pipeline is unavailable.

| Event type | Severity |
| --- | --- |
| `edge.session_started` / `edge.session_ended` | `INFO` (`HIGH` for failed/degraded sessions). |
| `edge.execution_started` / `edge.execution_ended` | `INFO`–`HIGH` by terminal status. |
| `edge.policy_decision` | `INFO` (allow/recorded). |
| `edge.action_denied` | `HIGH` (deny), `MEDIUM` (throttle). |
| `edge.approval_requested` | `MEDIUM`. |
| `edge.approval_resolved` / `edge.approval_rejected` / `edge.approval_expired` | by outcome. |
| `edge.artifact_exported` | result-based. |
| `edge.agentd_degraded` | `MEDIUM` (`HIGH` in local-dev-enforce). |
| `edge.fail_closed` | `CRITICAL`. |

Audit `extra` carries only bounded keys (IDs, hashes, `policy_snapshot`,
`redaction_status`, `event_counts`, `reason_code`, …). Forbidden raw fields —
`raw_prompt`, `raw_tool_input`, `raw_stderr`, secrets, `.env` content, labels,
transcripts, command output, signed URLs, `Authorization` headers, API keys,
hook nonces — must never appear; tests assert that fake secret patterns do not
survive serialization.

## ProvenanceGate audit-chain verification {#provenancegate-audit-chain-verification}

For destructive actions that present a backend `approval_ref`, the production
[action-gate pipeline](/edge/action-gates) wires `ProvenanceGate` to the
per-tenant audit hash chain. The verifier bounds each check to the approval
window and uses the tenant stream (`audit:chain:<tenant>`) rather than scanning
unrelated history.

The accepted provenance event is **resolved-only**: a canonical
`edge.approval_resolved` event with decision `approved`/`approve`, the same
tenant, and bounded `extra` whose `approval_ref` and `action_hash` exactly match
the approval. An `edge.approval_requested` row proves review was requested but
does not satisfy the gate.

Verifier dependencies fail closed: a missing/unavailable Redis or chain verifier
returns `service_unavailable` with `audit_chain_verifier_unavailable` /
`audit_chain_verify_failed`; tampering (compromised hash/HMAC/linkage) returns
`audit_chain_compromised`; a missing resolved event, malformed JSON, wrong
tenant/ref/hash, or non-approved terminal decision returns
`audit_evidence_missing`. Retention-trimmed history may yield a `partial`
status, accepted only when in-window resolved evidence is still authenticated.

## Streams

Edge action events are forwarded to the Gateway WebSocket stream as compact
`edge.event` messages. Generic `cordum_gateway_ws_*` metrics remain the
transport-health source; Edge-specific stream metrics count bridge clients,
successful enqueues, and drops. Tenant filtering and quarantine/redaction are
preserved.

## Related

- [Action gates](/edge/action-gates)
- [Policy & modes](/edge/policy-and-modes#approval-retry)
- [REST API](/edge/api)
