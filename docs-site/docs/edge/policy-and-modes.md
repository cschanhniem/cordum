---
sidebar_position: 5
title: Policy & Modes
---

# Edge Policy & Modes

Edge reuses the Safety Kernel policy evaluator for coding-agent actions. Raw
Claude Code hook input is normalized into deterministic policy inputs before
evaluation:

- **Topic:** `job.edge.action` (a Safety Kernel compatibility namespace — not a
  Cordum Job topic, queue, or worker-dispatch contract).
- **Capability:** classifier-owned category such as `exec.shell`, `file.read`,
  `file.write`, or `edge.unknown`.
- **Risk tags:** `test`, `build`, `secrets`, `destructive`, `write`, `git`,
  `network`, `unknown`, …
- **Labels:** bounded values such as `hook.tool_name`, `command.class`,
  `command.family`, `path.class`, `unknown.impact`.

The Gateway/classifier owns raw parsing and redaction; the Safety Kernel sees
normalized metadata and bounded redacted input only — never raw nested fields
like `tool_input.command`.

## Decisions

`POST /api/v1/edge/evaluate` returns one of:

| Decision | Meaning |
| --- | --- |
| `ALLOW` | Action may proceed. |
| `DENY` | Action is blocked; the agent sees the deny reason. |
| `REQUIRE_APPROVAL` | A human must approve before the action runs (see below). |
| `THROTTLE` | Action is rate-limited / deferred. |
| `CONSTRAIN` | Action may proceed with modified/constrained input. |

## Classifier mapping (demo policy)

The bundled `examples/cordum-edge-pack` demonstrates typical rules:

| Action | Capability | Key labels | Demo behavior |
| --- | --- | --- | --- |
| `npm test`, `go test`, `pytest`, `vitest` | `exec.shell` | `command.family=test` | Allow (`allow-safe-build-test`). |
| `npm run build`, `go build`, `make build` | `exec.shell` | `command.family=build` | Allow (`allow-safe-build-test`). |
| `rm -rf` and similar recursive deletes | `exec.shell` | `command.family=filesystem_delete` | Deny (`deny-destructive-shell`). |
| `Read` of `.env`, keys, tokens, credentials | `file.read` | `path.class=secret` | Deny (`deny-secret-reads`). |
| `Edit`/`Write`/`MultiEdit` source file | `file.write` | `path.class=source_code` | Require approval (`require-approval-for-edits`). |
| `git push …` | `exec.shell` | `command.family=git_push` | Require approval (`require-approval-for-vcs-push`). |
| `curl`/`wget`/`ssh`/`nc` egress | `exec.shell` | `command.family=network_egress` | Require approval (`require-approval-for-network`). |
| Unknown high-impact action | `edge.unknown` | `unknown.impact=high` | Deny (`deny-unknown-high-risk`). |

A narrower `policy.production.fragment.yaml` keeps deny-by-default for secrets,
destructive shell, and unknown high-risk actions while allowing safe local
tests/builds under explicit constraints. Neither fragment is a complete
enterprise enforcement boundary on its own.

## Policy modes

| Mode | Use | Behavior when Cordum governance is unavailable |
| --- | --- | --- |
| `observe` | Discovery and low-friction dev visibility. | Allow degraded actions, record evidence where possible. |
| `enforce` / `local-dev-enforce` | Local enforcement for risky/unknown actions. | Allow known-safe actions only; deny risky/unclassified actions. |
| `enterprise-strict` | Managed enterprise rollout. | Fail closed. |
| `requires-edge-governance` (tag) | Production workflow action that must be governed. | Fail closed on Gateway miss regardless of session mode. |

Mode is set via `--policy-mode` or `CORDUM_EDGE_POLICY_MODE`; see
[Configuration](/edge/configuration#policy-and-fail-modes).

## URL egress DNS/SSRF gate

The [URL action gate](/edge/action-gates) guards governed URL actions before
they reach an approval or allow decision. For non-literal hostnames it resolves
the host and denies if any answer is loopback, RFC1918/private, link-local, IPv6
ULA, unspecified, multicast, or a known cloud-metadata literal. Known
exfiltration hosts, paste destinations, prompt-exfil query signatures, and
literal metadata/private IPs are denied before DNS. Resolver uncertainty
(errors, empty answer sets, malformed addresses) fails closed.

## Approval retry {#approval-retry}

The default UX is an immediate `REQUIRE_APPROVAL` plus retry coordinates; an
opt-in inline wait is available for local/demo callers only.

### Default flow: deny + approve-then-retry

`evaluate` returns `decision=REQUIRE_APPROVAL` with everything the caller needs
to retry once a human approves:

| Field | Purpose |
| --- | --- |
| `approval_ref` | Server-generated ID (`edge_appr_…`) passed back on retry to consume the approval. |
| `approval_url` | Dashboard path `/edge/approvals/<approval_ref>` for reviewers. |
| `action_hash` | `sha256:<hex>` over the canonical action. Server-derived; client hashes are not trusted. |
| `input_hash` | `sha256:<hex>` over the redacted input. |
| `policy_snapshot` | Safety Kernel snapshot the approval is bound to. |
| `wait_strategy` / `wait_after` | `manual_approval` / `approve_then_retry`. |

Repeated evaluates of the same action reuse the same pending approval (bound to
the `tenant/session/execution/action_hash/policy_snapshot` tuple) rather than
spamming new ones.

### Retry: consume-once

The caller re-issues `evaluate` with the same body plus `approval_ref`. The
Gateway recomputes `action_hash` against the **fresh** policy snapshot, then:

- `approved` + matching hash + matching snapshot → `ALLOW` **once** (the store
  atomically marks `consumed_at` under WATCH/MULTI).
- mismatched hash/snapshot → `DENY`; the approval is **not** consumed.
- already consumed → `DENY` "approval already consumed".
- `rejected` → `DENY` echoing the resolution reason.
- `expired`/`invalidated` → `DENY` "approval expired".
- `pending` → `REQUIRE_APPROVAL` (still waiting).

A consumed approval is single-use; there is no "approve a class of actions" or
"approve for the next 5 minutes". Approvals never create Cordum Jobs and never
bypass tenant isolation.

### ProvenanceGate: resolved approval evidence

For **destructive** action-gate decisions, a backend `approved` approval is
necessary but not sufficient. After the mutation gate validates the stored
approval, `ProvenanceGate` verifies the tenant audit chain and requires a
canonical resolved approval event:

- event type `edge.approval_resolved`, decision `approved`/`approve`;
- exact tenant, `approval_ref`, and `action_hash` match in bounded audit `extra`.

A requested-only (`edge.approval_requested`) row, wrong tenant/ref/hash,
rejected/expired decision, malformed event, or verifier outage is an evidence
gap and fails closed — with bounded reason codes such as
`audit_evidence_missing`, `audit_chain_compromised`, or
`audit_chain_verifier_unavailable`. Raw prompts, tool payloads, transcripts, and
command output are never embedded in audit evidence.

### Optional inline wait (demo only)

`evaluate` accepts `wait_for_approval: true` and `approval_wait_timeout_ms`
(server-clamped to 5 minutes, default 30s) to block on the approval and route
through the same consume-once path. The standalone
`POST /api/v1/edge/approvals/{approval_ref}/wait` endpoint is observation-only:
it returns the resolved (or still-pending) approval and never consumes one.
Production hooks and agentd should default to `wait_for_approval: false`.

## Related

- [Action gates](/edge/action-gates) — the deterministic pre-dispatch pipeline.
- [REST API](/edge/api#approvals) — approval endpoints.
- [Configuration](/edge/configuration) — policy mode, approval-wait env vars.
