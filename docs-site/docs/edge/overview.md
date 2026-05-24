---
sidebar_position: 1
title: Edge Overview
slug: /edge
---

# Cordum Edge

Cordum Edge is the **compliance firewall for AI agents**. It places a policy,
approval, and evidence boundary between an AI agent and the actions it wants to
take in a developer workspace or managed runtime — reading files, writing code,
running commands, calling MCP tools, configuring, or deploying.

**Cordum stays quiet until governance matters.** Developers see Cordum exactly
when it protects them, their team, and production: a risky command is denied, an
action needs approval, an approved action must be retried safely, or an audit
trail is needed.

## Product model

Edge is built around the Claude Code command-hook path:

```text
Claude Code → cordum-hook → local cordum-agentd → Cordum Gateway
           → Safety Kernel → approvals, events, artifacts, dashboard
```

The local pieces capture and enforce the agent action before it runs; the
Gateway and Safety Kernel remain the policy authority. Edge does **not** turn
every agent action into a Cordum Job. It records `EdgeSession → AgentExecution →
AgentActionEvent` evidence and links to a job or workflow run only when there is
a real production job.

## Data hierarchy

| Level | Meaning | Stored evidence |
| --- | --- | --- |
| Tenant | Isolation boundary for all `/api/v1/edge/*` routes. | Gateway auth plus `X-Tenant-ID`. |
| Principal | Human/service identity that started or requested the action. | `principal_id` on sessions, executions, approvals, audit. |
| EdgeSession | One governed agent session. | Lifecycle, policy mode/snapshot, dashboard URL, heartbeat. |
| AgentExecution | One agent process/execution within the session. | Agent product/version, cwd/repo metadata, trace IDs, end status. |
| AgentActionEvent | Ordered action evidence. | Hook layer/kind, decision, hashes, approval ref, artifact pointer metadata. |
| Approval | Human decision for a `REQUIRE_APPROVAL` action. | Approval ref, requester/reviewer, status, hashes, bounded notes. |
| Artifact pointer | Metadata for evidence bodies outside Redis events. | URI, sha256, size, content type, retention class, redaction level. |

Raw prompts, tool payloads, transcripts, command output, API keys, bearer
tokens, and hook nonces are **never** stored in Edge events. Events carry
bounded redacted summaries, stable hashes, and artifact pointer metadata.

## Core capabilities

1. **Sessions and executions** — register, heartbeat, end, and inspect governed
   agent runs.
2. **Events and streams** — append idempotent action evidence and stream compact
   `edge.event` updates to the dashboard.
3. **Policy / evaluate** — classify agent actions, call the Safety Kernel, and
   return `ALLOW`, `DENY`, `REQUIRE_APPROVAL`, `THROTTLE`, or `CONSTRAIN`
   decisions. See [Policy & modes](/edge/policy-and-modes).
4. **Approvals** — reviewers approve/reject actions; retry checks bind the
   decision to the original action and redacted input hashes, and destructive
   retries additionally require resolved approval audit provenance.
5. **Artifacts and export** — attach metadata-only artifact pointers and export
   an audit-ready session bundle without inlining raw evidence bodies.

## Enforcement layers

Edge enforces in defence-in-depth layers, documented in detail in
[Architecture](/edge/architecture):

1. **Developer/demo launcher** — `cordumctl edge claude` starts a local
   `cordum-agentd`, renders temporary Claude command-hook settings, injects a
   process-only hook nonce, and launches Claude Code.
2. **Claude command hook** — `cordum-hook` reads one bounded hook payload,
   redacts/maps it, and calls only the local agentd.
3. **Local agentd** — `cordum-agentd` owns session lifecycle, hook auth, Gateway
   evaluate calls, optional safe-allow cache, optional inline approval wait,
   heartbeat, and shutdown evidence.
4. **Gateway and Safety Kernel** — enforce tenant auth, redaction, policy
   snapshot/mode, the [action gates](/edge/action-gates), approval creation, and
   audit/metrics.
5. **Enterprise managed settings** — managed Claude settings, endpoint controls,
   binary trust, and keychain/service bootstrap prevent bypass at fleet scale.

> The developer wrapper alone is **not** an enterprise enforcement boundary — a
> user who can run raw `claude` can bypass a wrapper. Fleet rollout requires
> managed settings and signed binaries.

## OSS vs. enterprise boundary

| Included in OSS | Enterprise-managed boundary |
| --- | --- |
| Edge data model, Gateway routes, redaction/hashing, policy/evaluate, approvals, event stream, artifact pointers, evidence export, hook/agentd/CLI demo path. | Managed Claude settings rollout, endpoint controls, binary signing/notarization, service bootstrap/keychain secrets, SIEM/compliance export packs, long-retention policies, org-wide enforcement reporting. |

## Start here

- [Quickstart](/edge/quickstart) — clean clone to a live governed Claude session.
- [Claude Code wrapper](/edge/claude-code) — how Edge governs Claude Code.
- [Architecture](/edge/architecture) — hook → agentd → Gateway → Safety Kernel.
- [Policy & modes](/edge/policy-and-modes) — decisions, modes, approval retry.
- [Action gates](/edge/action-gates) — the deterministic pre-dispatch pipeline.
- [REST API](/edge/api) · [CLI](/edge/cli) · [Configuration](/edge/configuration) · [Observability](/edge/observability)
