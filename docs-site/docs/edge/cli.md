---
sidebar_position: 8
title: Edge CLI
---

# Edge CLI — `cordumctl edge`

`cordumctl edge` is the local entry point for Cordum Edge. It has four
subcommands:

| Subcommand | Purpose |
| --- | --- |
| `init` | Scaffold local Edge config and (optionally) a Claude wrapper in the current repo. |
| `claude` | Launch a governed Claude Code session (developer/demo path). |
| `doctor` | Run observe-only local diagnostics. |
| `managed-settings` | Render/verify enterprise managed-settings payloads. |

All subcommands honor the global `cordumctl` flags (`--gateway`, `--api-key`,
`--tenant`, `--cacert`, `--insecure`) and their `CORDUM_*` env equivalents.

## `cordumctl edge init`

```bash
cordumctl edge init [--cwd path] [--force] [--gateway URL] [--tenant id] \
  [--principal id] [--api-key-env NAME] [--no-wrapper] [--non-interactive]
```

Seeds local Edge configuration in the target directory. Use `--no-wrapper` to
skip generating the Claude wrapper, and `--non-interactive` for CI/scripts.

## `cordumctl edge claude`

Starts a governed local Claude Code session: it starts `cordum-agentd`, renders
temporary Claude command-hook settings, injects the hook nonce into the Claude
process environment, and forwards arguments to `claude`.

```bash
cordumctl edge claude [edge flags] -- [claude args...]
```

Arguments before `--` configure Cordum; arguments after `--` are forwarded to
Claude. The wrapper supplies `claude --settings <temp-settings.json>` and
rejects a forwarded `--settings` override.

### Required inputs

| Input | Env fallback | Default |
| --- | --- | --- |
| `--gateway` | `CORDUM_GATEWAY` | `http://localhost:8081` |
| `--api-key` | `CORDUM_API_KEY` | none (secret; redacted from output) |
| `--tenant` | `CORDUM_TENANT_ID` | `default` |
| `--principal` | `CORDUM_PRINCIPAL_ID`, `CORDUM_EDGE_PRINCIPAL_ID` | launcher-detected |

### Common optional flags

| Flag | Default | Purpose |
| --- | --- | --- |
| `--claude-path` | `CLAUDE_PATH` or PATH | Claude Code binary path. |
| `--agentd-path` | `CORDUM_AGENTD_PATH` or PATH | `cordum-agentd` binary path. |
| `--policy-mode` | `enforce` | `observe`, `enforce`, or `enterprise-strict`. |
| `--approval-wait-timeout` | `30s` | Local/demo inline approval-wait timeout. |
| `--settings-output PATH` | none | Write generated settings to `PATH` or `-`; implies no launch, refuses overwrite. |
| `--dry-run` | `false` | Start agentd, render settings, print redacted summary, skip launch. |
| `--no-launch` | `false` | Render settings then exit without launching Claude. |
| `--verbose` | `false` | Non-secret diagnostics to stderr. |

Repo/git/host evidence (`--cwd`, `--repo`, `--git-remote`, `--git-branch`,
`--git-sha`, `--host-id`, `--device-id`, `--dashboard-url`) is auto-detected and
overridable. See [Configuration](/edge/configuration) for the full env-var map
and [Claude Code wrapper](/edge/claude-code) for the runtime behavior.

## `cordumctl edge doctor`

Verifies the local Edge Claude path **without** auto-fixing anything. Safe for CI
and support scripts: checks are bounded, secrets are never printed, and real
Claude Code is not required when you pass a mock `--claude-path`.

```bash
cordumctl edge doctor              # human-readable table
cordumctl edge doctor --json       # machine-readable envelope
```

It reports `ok` / `warn` / `fail` / `skip` for: Gateway `/readyz`, Gateway
auth/tenant, Safety Kernel reachability, the Edge sessions API, executable
discovery (`claude`, `cordum-hook`, `cordum-agentd`), generated-settings shape,
local agentd loopback, the demo policy fixture, optional dashboard reachability,
policy-mode implications, and (when `--managed-settings-path` is set) managed
-settings compliance.

| Exit code | Meaning |
| --- | --- |
| `0` | All checks passed or were skipped. |
| `1` | At least one check failed. |
| `2` | No failures, but a warning needs attention. |

## `cordumctl edge managed-settings`

The enterprise rollout sibling of `edge claude`. It is operator/MDM-script
invoked — Cordum never calls Jamf, Intune, or any MDM API itself.

| Subcommand | Purpose |
| --- | --- |
| `export` | Render `managed-settings.json` + `managed-mcp.json` into `--output <dir>`. Refuses to overwrite without `--force`; rejects flag values that look like secrets. |
| `verify` | Validate a deployed `managed-settings.json` at `--path <file>` against the enterprise invariants. `--json` emits `{ok, drifts[], source}`. |
| `rollback-template` | **Synthetic test fixture only.** Atomically regenerates the template at `--path <file>` (mode `0600`) and re-runs `verify`. Production rollback is MDM-orchestrated. |

```bash
cordumctl edge managed-settings export \
  --output ./payload/ \
  --mcp-gateway-url https://mcp.cordum.example/mcp \
  --llm-proxy-base-url https://llm-proxy.cordum.example \
  --api-key-helper-command "/opt/cordum/bin/cordum-agentd claude api-key-helper"

cordumctl edge managed-settings verify \
  --path /etc/claude-code/managed-settings.json
```

| Exit code | Meaning |
| --- | --- |
| `0` | Success. |
| `1` | Drift detected, or post-rollback verification failed. |
| `2` | Validation error (missing/sensitive flag, missing/unparseable file, unknown subcommand). |

## Related

- [Claude Code wrapper](/edge/claude-code)
- [Configuration](/edge/configuration)
- [Quickstart](/edge/quickstart)
