---
sidebar_position: 7
title: Edge REST API
---

# Edge REST API

The `/api/v1/edge/*` routes. The canonical wire schema is the OpenAPI spec
(`docs/api/openapi/cordum-api.yaml` in the repository); this page is the
operator-oriented map of routes, request/response shapes, auth, and errors. See
also the [full REST reference](/api-reference/full-reference).

## Global contract

- **Authentication:** every Edge route uses the Gateway auth path (`X-API-Key`
  or a bearer `Authorization` header) plus `X-Tenant-ID`.
- **Tenant isolation:** handlers reject missing/mismatched tenant data.
  Cross-tenant resources return the same not-found envelope as missing resources
  to avoid enumeration.
- **Bodies:** write routes accept `application/json` and bounded bodies. Raw
  prompts, raw tool payloads, command output, transcripts, signed URLs, bearer
  tokens, and API keys are rejected or redacted before persistence.
- **Errors:** `EdgeError` — `{ code, message, request_id, details? }`. `details`
  contains only bounded, redacted, enum-like values.
- **Pagination:** list routes return `{ items, next_cursor }`; omit `cursor` for
  the first page.

## Error codes

| HTTP | Stable codes | Notes |
| --- | --- | --- |
| 400 | `invalid_request`, `invalid_json`, `missing_required_field`, `missing_path_param`, `raw_payload_rejected`, `artifact_pointer_invalid`, `idempotency_key_invalid` | Validation, bad JSON, unsafe raw payloads, invalid artifact pointers. |
| 401 | `unauthorized` | Missing/invalid Gateway credentials. |
| 403 | `access_denied`, `tenant_required`, `tenant_mismatch`, `tenant_access_denied`, `self_approval_denied` | Caller cannot use this tenant/resource or tried to self-approve. |
| 404 | `not_found` | Missing, cross-tenant, or hidden resource. |
| 409 | `conflict`, `session_terminal`, `execution_terminal`, `execution_session_mismatch`, `approval_conflict`, `approval_not_actionable`, `idempotency_conflict`, `idempotency_window_expired` | Terminal resource, approval CAS conflict, or idempotent replay mismatch. |
| 413 | `request_too_large` | Body/export exceeds configured limits. |
| 429 | `max_executions_exceeded`, `event_cap_exceeded` | Write-side fanout caps (100 executions/session, 5000 events/execution). |
| 502 | `upstream_error` | Upstream policy/evaluate dependency failed. |
| 503 | `service_unavailable`, `store_unavailable` | Gateway store or Edge dependency unavailable. |
| 500 | `internal_error` | Unexpected server failure; response remains redacted. |

## Sessions

| Method / path | Notes |
| --- | --- |
| `POST /api/v1/edge/sessions` | Create a session + initial execution. Returns `session_id`, `execution_id`, `policy_snapshot`, `dashboard_url`. `tenant_id` in the body must match `X-Tenant-ID`. |
| `GET /api/v1/edge/sessions?principal_id=&cursor=&limit=` | Dashboard list API. |
| `GET /api/v1/edge/sessions/{session_id}` | One tenant-scoped session. |
| `POST /api/v1/edge/sessions/{session_id}/heartbeat` | Refresh active session heartbeat. |
| `POST /api/v1/edge/sessions/{session_id}/end` | End a session. Terminal sessions reject incompatible writes. |

## Executions

| Method / path | Notes |
| --- | --- |
| `POST /api/v1/edge/executions` | Add an execution under a session. The (cap+1)th call returns `429 max_executions_exceeded` with `details.{limit,current}` (cap = `CORDUM_EDGE_MAX_EXECUTIONS_PER_SESSION`, default 100). |
| `GET /api/v1/edge/executions/{execution_id}` | Tenant-scoped execution lookup. |
| `POST /api/v1/edge/executions/{execution_id}/end` | End an execution. |

## Policy evaluate

| Method / path | Notes |
| --- | --- |
| `POST /api/v1/edge/evaluate` | Classify the action, call the Safety Kernel, create approvals for `REQUIRE_APPROVAL`, and record decision evidence. The Gateway computes/validates hashes. Safety outages may still return `200` with `degraded=true` when the policy mode permits. |

Send redacted action input and hashes — never raw `tool_input`, prompts,
transcripts, `Authorization` headers, or provider secrets.

## Approvals

| Method / path | Notes |
| --- | --- |
| `GET /api/v1/edge/approvals?status=&session_id=&execution_id=&action_hash=&cursor=&limit=` | List tenant-scoped approvals. |
| `GET /api/v1/edge/approvals/{approval_ref}` | Requester or authorized operator/admin; hidden resources return `404`. |
| `POST /api/v1/edge/approvals/{approval_ref}/approve` | Resolve a pending approval. Self-approval returns `403 self_approval_denied`. |
| `POST /api/v1/edge/approvals/{approval_ref}/reject` | Reject a pending approval. |
| `POST /api/v1/edge/approvals/{approval_ref}/wait` | Bounded wait for local/demo inline flows; never consumes the approval. |

Approvals bind to `action_hash`, `input_hash`, `policy_snapshot`, requester, and
status, so an approval cannot be replayed against a different action. For
destructive action gates, consume is followed by audit provenance verification —
see [Policy & modes](/edge/policy-and-modes#approval-retry).

## Events

| Method / path | Notes |
| --- | --- |
| `POST /api/v1/edge/events` | Append one event; assigns/validates sequence. Optional `Idempotency-Key` header. The 5001st event for an execution returns `429 event_cap_exceeded`. |
| `POST /api/v1/edge/events/batch` | Append events in order (agentd uses this for atomic hook-receipt + decision evidence). A batch that would exceed 5000 events writes nothing and returns `429`. |
| `GET /api/v1/edge/sessions/{session_id}/events?cursor=&limit=&kind=&decision=&since=&until=` | List session events with bounded filters. |
| `GET /api/v1/edge/executions/{execution_id}/events?…` | List events for one execution. |

Event idempotency is scoped by tenant and endpoint. The Redis idempotency record
TTL is 24h, refreshed on every Reserve retry, and capped at a 7-day
max-in-flight; past the cap, attempts return `409 idempotency_record_expired`
and the caller must use a fresh idempotency key.

## Evidence export

| Method / path | Notes |
| --- | --- |
| `POST /api/v1/edge/sessions/{session_id}/export` | Metadata-only audit bundle (`SessionExportBundle`): session, executions/events, artifact pointer metadata, missing-artifact reasons, truncation metadata. `413 request_too_large` → reduce `max_events` or raise `CORDUM_EDGE_EXPORT_MAX_BYTES`. Raw artifact bodies are not inlined. |

## Additional Edge endpoint families

The OpenAPI spec also defines these Edge route families (see the full spec for
exact schemas):

- `POST /api/v1/edge/runtime/events` — runtime event ingest (disabled by default;
  see `CORDUM_EDGE_RUNTIME_INGEST_ENABLED`).
- `/api/v1/edge/mcp/upstreams*` — MCP upstream registry (register, list,
  enable/disable) with SSRF/DNS validation.
- `/api/v1/edge/shadow-agents*` and `/api/v1/edge/shadow/exception(s)*` — shadow
  agent findings, remediation, and exceptions.
- `POST /api/v1/edge/binary-integrity/events` — binary integrity attestation
  events.

## Related

- [Policy & modes](/edge/policy-and-modes)
- [Action gates](/edge/action-gates)
- [Observability](/edge/observability)
- [Configuration](/edge/configuration)
