---
sidebar_position: 3
title: Claude Code Wrapper
---

# Cordum Edge for Claude Code

This guide explains how Cordum Edge governs Claude Code through the command-hook
path and the `cordumctl edge claude` launcher.

**Cordum stays quiet until governance matters.** Developers see Cordum exactly
when it protects them: before a risky tool runs, when approval is needed, and
when evidence must be exported.

## Command

```bash
CORDUM_GATEWAY=http://localhost:8081 \
CORDUM_API_KEY=<cordum-api-key> \
CORDUM_TENANT_ID=default \
cordumctl edge claude -- --print "summarize this repo"
```

Use `cordumctl edge claude [edge flags] -- [claude args...]`. Cordum flags stay
**before** `--`; Claude arguments go after it. The wrapper supplies the governed
`--settings` file and rejects a forwarded `--settings` override so the governed
settings cannot be accidentally replaced. See the [CLI reference](/edge/cli) for
the full flag table.

## Hook and agentd behavior

The runtime path is:

```text
Claude Code command hook → cordum-hook → local cordum-agentd → Gateway evaluate
```

- **`cordum-hook`** reads one bounded JSON payload from stdin, redacts/maps it,
  and calls only the local agentd URL — never the Gateway directly.
- **`cordum-agentd`** owns Edge session/execution lifecycle, heartbeat, local
  hook authentication, Gateway evaluate calls, optional safe-allow cache,
  optional inline approval wait, and shutdown evidence.
- **Gateway / Safety Kernel** own tenant-aware policy evaluation, approvals,
  audit, metrics, and redaction before persistence.

## What the wrapper does

1. Resolves Gateway credentials, tenant, principal, cwd/repo/git/host metadata,
   policy mode, approval-wait timeout, and dashboard URL.
2. Generates a high-entropy nonce and starts `cordum-agentd` with the nonce in
   `CORDUM_AGENTD_NONCE` plus Gateway credentials.
3. Waits for agentd to write session/execution/dashboard state.
4. Renders temporary Claude command-hook settings with a bare loopback
   `CORDUM_AGENTD_URL` and `CORDUM_AGENTD_HOOK_TIMEOUT=4.5s`.
5. Launches Claude with `CORDUM_AGENTD_HOOK_NONCE` only in the process
   environment.
6. Propagates Claude's exit code and cleans up the tempdir/agentd process.

## Settings generation

Generated settings contain command hooks for supported Claude events and
non-secret session metadata. They **never** contain:

- `CORDUM_API_KEY`, `CORDUM_AGENTD_NONCE`, `CORDUM_AGENTD_HOOK_NONCE`
- `nonce=` URL query strings
- provider API keys, bearer tokens, raw prompts, raw tool payloads, transcripts,
  or command output

Use `--settings-output -` to inspect the generated JSON safely. File output is
create-only and refuses to overwrite an existing operator/user settings file.

## Approval UX

A `REQUIRE_APPROVAL` decision becomes a Claude-compatible deny with an
`approval_ref` and retry guidance. Reviewers approve/reject in Cordum; the agent
then retries the same action. Replay checks bind the approval to the action
hash, input hash, and policy snapshot — approval records a governance decision,
it does not edit command content.

For destructive actions, the backend approval must also have matching **resolved
audit provenance** before the retry is allowed: the tenant audit chain needs an
approved `edge.approval_resolved` event with the same `approval_ref` and
`action_hash`. A requested-only approval event is not proof of approval. See
[Policy & modes](/edge/policy-and-modes#approval-retry) for the full contract.

## Fail modes

| Mode | Behavior when governance is unavailable |
| --- | --- |
| `observe` | Allow degraded actions and record evidence where possible. |
| `enforce` | Allow known-safe degraded actions only; deny risky/unknown actions. |
| `enterprise-strict` | Fail closed. |

Malformed hook input fails closed with redacted stderr. Hook timeout values must
stay below Claude Code's 5s command-hook deadline; generated settings use
`4.5s`.

## Token tradeoffs

The developer wrapper avoids storing long-lived API keys or hook nonces in
settings/evidence, but same-user process inspection may see runtime process env
while a local session is running. That is acceptable for development only.
Enterprise enforcement requires managed settings, endpoint controls, binary
trust, and service-bootstrap/keychain secret handling — see
[Architecture](/edge/architecture).

## Next steps

- [CLI reference](/edge/cli)
- [Configuration](/edge/configuration)
- [Policy & modes](/edge/policy-and-modes)
