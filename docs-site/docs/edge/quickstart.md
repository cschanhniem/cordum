---
sidebar_position: 2
title: Edge Quickstart
---

# Edge Quickstart

This walks you from a clean `git clone` to a working governed Claude Code
session. The wrapper here is the developer/demo path — **not** enterprise
enforcement. For fleet rollout see [Architecture](/edge/architecture) and the
managed-settings boundary.

## Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| Docker | Compose v2 plugin | Docker Desktop (macOS/Windows) or native engine (Linux). |
| GNU Make | any | Drives `make dev-up` / `make build`. |
| Go | 1.24+ | Local binary builds. |
| Node.js | 18+ | Dashboard build. |
| `openssl`, `curl`, `jq`, `bash` | any recent | Mint a local API key and run the E2E script. |
| Claude Code | optional | Only for the real-Claude demo at the end. |

> Windows users: use Git Bash or WSL. The E2E script assumes POSIX shell
> semantics. Every `make` line has a raw `docker compose` / `go build` fallback.

## 1. Clone and seed config

```bash
git clone https://github.com/cordum-io/cordum.git
cd cordum

# The Compose stack reads CORDUM_API_KEY from .env at startup, so the same
# value must be in .env *and* exported in your shell.
[ -f .env ] || cp .env.example .env
export CORDUM_API_KEY=$(openssl rand -hex 32)
sed -i.bak "s|^CORDUM_API_KEY=.*|CORDUM_API_KEY=${CORDUM_API_KEY}|" .env && rm -f .env.bak

export CORDUM_TENANT_ID=default
export CORDUM_GATEWAY=https://localhost:8081
export CORDUM_GATEWAY_TLS_CA="$(pwd)/certs/ca/ca.crt"   # consumed by cordum-agentd
```

## 2. Bring up the stack and build the Edge binaries

```bash
make dev-up
# Equivalent: docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build

# Wait for services to become healthy
./tools/scripts/quickstart.sh --skip-build --skip-smoke

# Build the Edge binaries
make build SERVICE=cordum-hook
make build SERVICE=cordum-agentd
make build SERVICE=cordumctl
# Equivalent: go build -o bin/cordum-hook ./cmd/cordum-hook  (etc.)
```

## 3. Install the demo Edge policy pack

Without this pack, `/api/v1/edge/evaluate` runs against a default-allow policy
and the deny/approval rules will not fire.

```bash
export CORDUM_TLS_CA="$(pwd)/certs/ca/ca.crt"
./bin/cordumctl pack install ./examples/cordum-edge-pack
```

The pack ships policy overlays only (no pool overlay), so it registers as
`INACTIVE` — that is expected; the policy fragments are still applied.

## 4. Run the fake-hook end-to-end test

```bash
CORDUM_INTEGRATION=1 bash tools/scripts/edge_fake_hook_e2e.sh
```

You should see, in order:

```text
PASS edge_session_setup
PASS edge_pretooluse_deny
PASS edge_approval_flow
PASS edge_posttooluse_artifact
PASS edge_evidence_export
```

Those PASS lines confirm the `cordum-hook → cordum-agentd → Gateway → Safety
Kernel` path is wired correctly.

> If the script prints `SKIP edge_fake_hook_e2e`, you forgot
> `export CORDUM_INTEGRATION=1`. It skips by default so it never flaps CI runs
> that lack a stack.

## 5. Open the dashboard

```text
http://localhost:8082
```

Navigate to **Edge Sessions**. You should see one session row from the
fake-hook script with a PreToolUse deny, an approval + retry, a PostToolUse
artifact, and an evidence-export link. Click in to see the timeline and event
inspector — it shows decisions, approval refs, and artifact pointer metadata,
and deliberately does not render raw payloads, prompts, or command output.

## 6. Optional: run real Claude Code through Cordum

Requires Claude Code on `PATH` (or pass `--claude-path`).

```bash
export CORDUM_PRINCIPAL_ID=demo-user
./bin/cordumctl edge claude
```

Inside Claude, try:

| Prompt | Expected outcome |
| --- | --- |
| `read .env` | **Denied** before the tool runs. |
| `edit README.md` (or a guarded path) | `REQUIRE_APPROVAL`. Approve in the dashboard, then retry in Claude. |
| Safe action (`ls`, `grep` in a non-guarded path) | Allowed quietly. |

When done, exit Claude (`Ctrl-D`); the wrapper tears down agentd and the temp
settings directory.

## 7. Cleanup

```bash
make dev-down                 # stop containers, keep volumes
docker compose down -v        # full reset (drops Redis + evidence/audit chain)
```

> `make dev-down` only runs `docker compose down`; pass `-v` to `docker compose`
> directly, not to `make dev-down`.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `SKIP edge_fake_hook_e2e` | `CORDUM_INTEGRATION` unset | `export CORDUM_INTEGRATION=1`, re-run. |
| `FAIL edge_pretooluse_deny: ... != deny` | Demo pack not installed | Re-run step 3. |
| `POST /api/v1/edge/sessions → 401` | Wrong/missing API key | Export the same key the stack started with (`grep ^CORDUM_API_KEY= .env`). |
| `POST /api/v1/edge/sessions → 404` | Gateway image predates Edge | `docker compose down -v && make dev-up`. |
| `curl: (60) SSL certificate problem` | Self-signed dev cert | Use `--cacert ./certs/ca/ca.crt`. |
| `claude: command not found` | Claude Code not on PATH | `--claude-path /path/to/claude` or install Claude Code. |

For local diagnostics:

```bash
./bin/cordumctl edge doctor          # observe-only health checks
./bin/cordumctl edge doctor --json   # machine-readable
```

See the [CLI reference](/edge/cli) and [Configuration](/edge/configuration) for
the full surface.
