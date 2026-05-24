---
sidebar_position: 4
title: Edge Architecture
---

# Edge Architecture

Edge governs the Claude Code command-hook path with a production-shaped pipeline:
a local hook and daemon capture each agent action, and the Gateway plus Safety
Kernel remain the tenant-aware policy authority.

```text
Claude Code ──hook payload──▶ cordum-hook ──loopback──▶ cordum-agentd
                                                              │
                                          POST /api/v1/edge/* │ (X-API-Key, X-Tenant-ID)
                                                              ▼
                                                       Cordum Gateway
                                                              │ policy/evaluate
                                                              ▼
                                                   Safety Kernel + action gates
                                                              │
                              ┌───────────────────────────────┼───────────────────────────────┐
                              ▼                                ▼                                ▼
                          approvals                         events                         artifacts
                                                              │
                                                       edge.event stream ──▶ dashboard
```

Edge actions are **not** Cordum Jobs. They are recorded as
`EdgeSession → AgentExecution → AgentActionEvent` evidence and linked to a job
or workflow run only when a real production job exists.

## Component responsibilities

| Component | Owns | Never does |
| --- | --- | --- |
| `cordum-hook` | Reads one bounded hook JSON payload from stdin, redacts/maps it, calls only the local agentd URL. | Call the Gateway directly; persist secrets. |
| `cordum-agentd` | Session/execution lifecycle, heartbeat, local hook auth, Gateway evaluate calls, optional safe-allow cache, optional inline approval wait, shutdown evidence. | Store API keys, raw payloads, or transcripts. |
| Gateway | Tenant auth, redaction, policy snapshot/mode, approval creation, event persistence, `edge.event` stream, audit/metrics. | Trust client-supplied hashes or tenant. |
| Safety Kernel | Policy evaluation and the [action gates](/edge/action-gates). | See raw prompts or tool payloads. |

## Enforcement layers (defence in depth)

1. **Developer/demo launcher.** `cordumctl edge claude` starts a local
   `cordum-agentd`, generates temporary Claude command-hook settings, injects a
   process-only hook nonce, then launches Claude Code. This is the adoption and
   demo path, not an enterprise enforcement boundary by itself.
2. **Claude command hook.** `cordum-hook` receives one bounded hook payload on
   stdin and calls only local agentd. Header-based nonce auth
   (`X-Cordum-Agentd-Nonce`) is the only supported delivery path; URL
   query-string nonces are refused.
3. **Local agentd.** `cordum-agentd` owns the local session, hook auth, Gateway
   evaluate calls, optional cache and inline approval wait, heartbeat, and
   shutdown evidence.
4. **Gateway and Safety Kernel.** `/api/v1/edge/evaluate` enforces tenant-aware
   auth, redaction, policy snapshot/mode, approval creation, action gates, and
   audit/metrics.
5. **Enterprise managed settings.** Managed Claude settings, endpoint controls,
   binary trust, keychain/service bootstrap, and optional proxy controls prevent
   bypass at fleet scale.

> **The wrapper alone cannot stop a user from running raw `claude`.** Enterprise
> rollout requires managed Claude settings, signed/notarized binaries, and a
> deployment-controlled keychain. See the OSS-vs-enterprise boundary on the
> [overview](/edge#oss-vs-enterprise-boundary).

## Trust boundaries

- **Tenant identity** is sourced from auth (`X-Tenant-ID` + API key), never from
  the request body. A body-claimed tenant is diagnostic only.
- **Hashes** (`action_hash`, `input_hash`) are computed and validated by the
  Gateway; client-supplied hashes are not trusted.
- **Approval claims** are untrusted text. Only a backend `EdgeApproval` resolved
  through the approval store grants a destructive action, and the audit chain
  must carry resolved provenance for it.
- **Redaction** happens before persistence. Raw prompts, tool payloads,
  transcripts, command output, bearer tokens, and API keys never reach Edge
  events; events carry bounded summaries, hashes, and artifact pointers.

## Retention and caps

Edge keeps bounded session/event metadata in the Gateway stores and keeps large
bodies behind artifact pointers. Redis evidence fanout is bounded at **100
executions per session** and **5000 events per execution**. `DeleteSession` uses
bounded scans and batched deletes, and the Gateway runs a 30-day retention
sweeper by default. See [Configuration](/edge/configuration#retention-and-write-side-caps)
for the exact knobs.

## Related

- [Claude Code wrapper](/edge/claude-code)
- [Policy & modes](/edge/policy-and-modes)
- [Action gates](/edge/action-gates)
- [Observability](/edge/observability)
