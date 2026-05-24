---
sidebar_position: 6
title: Action Gates
---

# Action Gates

Action gates are Cordum's **deterministic pre-dispatch action-layer checks**.
Each gate is a small, single-purpose evaluator that inspects the structured
`ActionDescriptor` on a policy input and returns an allow/deny decision. The
same pipeline runs on both the Gateway HTTP path and the Safety Kernel gRPC path,
so a destructive action is gated identically regardless of entry point.

Gates consume **structured fields only** — they never regex over free-form
prompts or approximate a content classifier (that path lives upstream in the
[classifier](/edge/policy-and-modes)). Tenant identity comes from auth, not the
request body; approval claims are untrusted until resolved against the backend
approval store and audit chain.

## Pipeline order

```text
tenant ─▶ file ─▶ url ─▶ mcp ─▶ mutation ─▶ provenance
```

The ordering is deliberate and short-circuits on the first non-allow decision:

| Gate | `GateID` | Fires for | Enforces |
| --- | --- | --- | --- |
| Tenant | `actiongate.tenant` | `tenant_query`, `mutation` | Cross-tenant denials first, so a later check can't leak that a resource exists in another tenant. |
| File | `actiongate.file` | `file` | Filesystem path invariants. |
| URL | `actiongate.url` | `url` | Egress / DNS / SSRF invariants (see [policy](/edge/policy-and-modes#url-egress-dnsssrf-gate)). |
| MCP | `actiongate.mcp` | `mcp_call` | Tool/server/resource scope before mutation logic. |
| Mutation | `actiongate.mutation` | destructive `mutation` | Approval, self-approval, expiry, and consume-once checks. |
| Provenance | `actiongate.provenance` | destructive `mutation` | Audit-chain evidence — last, because it depends on the approval the mutation gate validated. |

A gate returns a zero decision ("does not apply") when the action kind is
unrelated, and the pipeline continues. An `ALLOW` is non-terminal — each gate
enforces a different invariant, so the pipeline keeps running until a gate
blocks or all gates pass.

## Fail-closed posture

Every gate has a fail-closed default. Missing or unavailable dependencies
degrade an individual gate to a deny rather than taking down the pipeline:

- **MutationGate** needs an approvals lookup — without it, every destructive
  action fails closed with `internal_error`.
- **ProvenanceGate** needs both an approvals lookup and an audit chain verifier.
  If the verifier is absent/unavailable, destructive actions fail closed with
  `service_unavailable` rather than an ambiguous `internal_error`.
- **MCPGate** needs an identity resolver — without it, every `mcp_call` fails
  closed with `internal_error`.
- File / URL / Tenant gates have no required dependencies (the URL resolver
  defaults to the platform resolver and a never-seen stance for unknown hosts).

Failures in side channels (approval store, audit chain) must fail closed with
`internal_error` or `service_unavailable` — never a silent allow.

## The MCP gate

The MCP gate (`actiongate.mcp`) validates a tool call against the calling
identity resolved from `(tenant, agent_id)`. It denies when, in order:

1. authentication or `agent_id` is missing (`unauthorized`);
2. the identity resolver is unavailable (`internal_error`) or the identity is
   not found (`unauthorized`);
3. the target server is not in `AllowedServers` (`access_denied`,
   `server_not_allowlisted`);
4. the tool is not in `AllowedTools` (`tool_not_allowlisted`);
5. a non-empty target resource is not in `AllowedResources`
   (`resource_not_allowlisted`);
6. the identity lacks a `RequiredEntitlement` (`unlicensed`);
7. a configured **dangerous-parameter** rule matches the call arguments
   (`dangerous_param:<name>`);
8. an optional reachability probe reports the server failed or is unreachable
   (`service_unavailable`).

Allow-list matching uses `path.Match` glob semantics, and dangerous-parameter
rules are JSON-normalized at construction so an admin-configured value (e.g.
`int(1)`) still matches a JSON-decoded `1` arriving over the wire.

## HTTP boundary mapping

Gate codes map to the existing Edge error envelope:

| Code | HTTP |
| --- | --- |
| `unauthorized` | 401 |
| `access_denied` | 403 |
| `not_found` | 404 |
| `conflict` | 409 |
| `internal_error` | 500 |
| `service_unavailable` | 503 |
| `require_human` | informational at the simulate endpoint (200); triggers the inline-approval workflow at the edge. |

## Related

- [Policy & modes](/edge/policy-and-modes) — classifier inputs, decisions, approval retry.
- [Architecture](/edge/architecture#trust-boundaries) — where gates sit in the pipeline.
- [Observability](/edge/observability#provenancegate-audit-chain-verification) — provenance verification details.
