---
sidebar_position: 9
title: Edge Configuration
---

# Edge Configuration

Environment variables used by Cordum Edge: Gateway credentials, Claude
hook/agentd transport, policy modes, approvals, artifacts, retention, and state
security. **The code is authoritative** — when this page and the code diverge,
the code wins.

## Security rules

- Treat `CORDUM_API_KEY`, `CORDUM_AGENTD_NONCE`, and `CORDUM_AGENTD_HOOK_NONCE`
  as secrets.
- Generated Claude settings and enterprise managed-settings JSON must never
  persist API keys, hook nonces, bearer tokens, raw prompts, raw tool payloads,
  transcripts, command output, or signed URLs.
- Keep `CORDUM_AGENTD_URL` / `CORDUM_AGENTD_SOCKET` loopback-only. Never point
  `cordum-hook` at the Gateway or any remote host.

## Required Gateway identity

| Variable | Default | Notes |
| --- | --- | --- |
| `CORDUM_GATEWAY` | `cordumctl`: `http://localhost:8081`; raw `cordum-agentd` requires a value | Use HTTPS outside local dev; no credentials in the URL. |
| `CORDUM_API_KEY` | none | Secret. Passed to agentd for Gateway calls; never written to settings, logs, evidence, or exports. |
| `CORDUM_TENANT_ID` | `cordumctl`: `default`; raw agentd requires a value | Must match the tenant header used by Edge APIs. |
| `CORDUM_PRINCIPAL_ID` | launcher-detected | Preferred explicit audit principal. |
| `CORDUM_EDGE_PRINCIPAL_ID` | falls back to `CORDUM_PRINCIPAL_ID` | Hook-side principal correlation. |

## Local hook transport and nonce

| Variable | Default | Notes |
| --- | --- | --- |
| `CORDUM_AGENTD_SOCKET` | `http://127.0.0.1:8765/v1/edge/hooks/claude` | agentd bind URL. P0 accepts HTTP loopback only. |
| `CORDUM_AGENTD_URL` | same hook path, bare URL | `cordum-hook` client env. Must be loopback and must not contain `?nonce=`. |
| `CORDUM_AGENTD_NONCE` | auto-generated if empty | Secret. If set, base64 decoding to ≥32 bytes. Configures the daemon. |
| `CORDUM_AGENTD_HOOK_NONCE` | none | Secret. Sent by the hook as `X-Cordum-Agentd-Nonce`. Configures the hook process. |

Header-based nonce auth is the only supported delivery path; URL query-string
nonces are refused.

## Hook and Gateway timeouts

| Variable | Default | Bounds | Notes |
| --- | --- | --- | --- |
| `CORDUM_AGENTD_HOOK_TIMEOUT` | generated settings use `4.5s`; raw agentd `5s` | hook `<5s`; agentd `>0` and `≤5m` | Keep below Claude Code's 5s command-hook deadline. |
| `CORDUM_AGENTD_GATEWAY_TIMEOUT` | `10s` | `>0` and `≤5m` | Per-call Gateway lifecycle/evaluate/approval timeout. |
| `CORDUM_EDGE_HEARTBEAT_TTL` | `30s` | `>0` and `≤5m` | Gateway heartbeat TTL for active sessions. |
| `CORDUM_EDGE_HEARTBEAT_INTERVAL` | `TTL/2` | `>0`, `≤5m`, `≤ TTL/2` | Agentd heartbeat cadence. |
| `CORDUM_HOOK_MAX_INPUT_BYTES` | `1048576` | values above 8 MiB ignored | Max stdin JSON payload for `cordum-hook`. |

## Policy and fail modes

| Variable | Default | Notes |
| --- | --- | --- |
| `CORDUM_EDGE_POLICY_MODE` | raw agentd `observe`; `cordumctl edge claude` `enforce` | `observe`, `enforce`, `enterprise-strict`. |
| `CORDUM_EDGE_MODE` | mirrors policy mode | Hook-side mode for local/dev settings. |
| `CORDUM_AGENTD_FAIL_CLOSED` | `false` | When true, hook/agentd fail closed if local governance cannot start/respond. |
| `CORDUM_AGENTD_INLINE_APPROVAL_WAIT` | `false` (wrapper enables for demos) | Local/demo-only inline wait for `REQUIRE_APPROVAL`. |
| `CORDUM_AGENTD_INLINE_APPROVAL_WAIT_TIMEOUT` | `30s` | Strict wait budget. |

See [Policy & modes](/edge/policy-and-modes#policy-modes) for behavior detail.

## Safe-allow cache

| Variable | Default | Notes |
| --- | --- | --- |
| `CORDUM_AGENTD_SAFE_ALLOW_CACHE` | `false` | Optional local in-memory cache for low-risk cache-eligible `ALLOW` responses. |
| `CORDUM_AGENTD_SAFE_ALLOW_CACHE_TTL` | `5m` | Used only when the cache is enabled. |
| `CORDUM_AGENTD_SAFE_ALLOW_CACHE_MAX_ENTRIES` | `128` | `>0` and `≤10000` when enabled. |

The cache never stores raw payloads, tokens, approval refs, reviewer-updated
input, degraded results, high-risk actions, or decisions from another snapshot.

## Local state

| Variable | Default | Notes |
| --- | --- | --- |
| `CORDUM_AGENTD_STATE_DIR` | `~/.cordum/edge/sessions` or temp fallback | Small non-secret session state. Do not use shared directories. |
| `CORDUM_AGENTD_STRICT_PERMS` | `false` | Windows-only hardening. When true, agentd fails closed if the state-root ACL is broader than owner/SYSTEM-only. |

## Evidence export

| Variable | Default | Notes |
| --- | --- | --- |
| `CORDUM_EDGE_EXPORT_MAX_BYTES` | `10485760` (10 MiB) | Max serialized export response. Out-of-range values fall back to the default. |

## Retention and write-side caps

| Variable | Default | Notes |
| --- | --- | --- |
| `CORDUM_EDGE_MAX_EXECUTIONS_PER_SESSION` | `100` | Max `AgentExecution` rows per session; the (cap+1)th create returns `429 max_executions_exceeded`. |
| `CORDUM_EDGE_SESSION_RETENTION_TTL` | `720h` (30 days) | Sessions older than this are swept. Must parse as a positive Go duration. |
| `CORDUM_EDGE_SESSION_SWEEP_INTERVAL` | `1h` | Sweep cadence after the initial boot sweep. |

The execution cap plus the store-level 5000-events-per-execution cap protect
against pathological retry storms. To record more, end the session and start a
new one.

## Shadow detection, runtime ingest, managed policy

| Variable | Default | Notes |
| --- | --- | --- |
| `CORDUM_EDGE_SHADOW_RETENTION_SHORT` | `168h` (7d) | TTL for `shadow_short` findings. Use `168h`, not `7d`. |
| `CORDUM_EDGE_SHADOW_RETENTION_DEFAULT` | `2160h` (90d) | TTL for `shadow_default` findings. |
| `CORDUM_EDGE_SHADOW_RETENTION_LONG` | `8760h` (365d) | TTL for `shadow_long` findings. |
| `CORDUM_EDGE_SHADOW_SCAN_ENABLED` | unset (disabled) | Opt-in for `cordumctl shadow scan`; without it (or `--opt-in`) the scanner refuses to run. |
| `CORDUM_EDGE_RUNTIME_INGEST_ENABLED` | unset (disabled) | Set `true` to expose `POST /api/v1/edge/runtime/events`; otherwise the route returns `503`. |
| `CORDUM_EDGE_RUNTIME_REPLAY_REQUIRED` | unset (required) | Only `false`/`0`/`no` disables the runtime-ingest nonce requirement. Leave unset in production. |
| `CORDUM_EDGE_MANAGED_POLICY_MODE` | unset | Enterprise invariant. When `enterprise-strict`, the hook policy mode is pinned ahead of any local `CORDUM_EDGE_MODE`. Usually emitted by the managed-settings template. |

## Related

- [CLI reference](/edge/cli)
- [REST API](/edge/api)
- [Policy & modes](/edge/policy-and-modes)
- [Observability](/edge/observability)
