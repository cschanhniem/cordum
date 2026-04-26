# LLM Chat Assistant — Default policy bundle

The chat-assistant agent identity needs an explicit allow-list of
tools and data classifications. We ship a default policy bundle that
matches the `chat-assistant` AgentIdentity's phase-3 spec
byte-for-byte: read-only discovery + `cordum_query_policy` +
`cordum_submit_job` (preapproved) + four approval-gated mutators.

## File

`config/llmchat/policy-default.yaml`

The file is heavily commented — this page is the operator-facing
reference; the YAML itself is the source of truth.

## Import

The bundle goes in via the existing policy-bundle endpoint:

```bash
curl -X POST "$CORDUM_BASE_URL/api/v1/policy/bundles" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $CORDUM_API_KEY" \
  -d "$(yq -o=json . config/llmchat/policy-default.yaml)"
```

Or the `cordumctl` equivalent:

```bash
cordumctl policy bundle import config/llmchat/policy-default.yaml
```

The gateway validates the bundle on import (same path the dashboard's
Policy Studio uses). Re-importing the bundle is idempotent —
operators can edit the YAML and re-run the import command without
worrying about duplicate rules.

## What it grants

### Read-only discovery (no approval prompt)

The chat assistant can call all 14 read-only tools without any
prompt — these are pure observation:

`cordum_list_jobs`, `cordum_get_job`, `cordum_list_runs`,
`cordum_get_run`, `cordum_run_timeline`, `cordum_list_workflows`,
`cordum_list_packs`, `cordum_list_topics`, `cordum_list_workers`,
`cordum_list_agents`, `cordum_list_pending_approvals`,
`cordum_audit_query`, `cordum_audit_verify`, `cordum_status`.

Plus `cordum_query_policy` (read-only inspection of policy bundles —
the assistant uses this to explain WHY a job was denied).

### Preapproved mutation (no approval prompt)

`cordum_submit_job` is the **only** preapproved mutation per epic
rail #4. The assistant can submit jobs without an inline Approve /
Reject prompt — but downstream policy rules (pack policy, safety
kernel, workflow engine) still gate the actual job execution.

### Approval-gated mutation (inline Approve / Reject)

Calling any of these surfaces an inline approval prompt in the chat
panel:

- `cordum_approve_job`
- `cordum_reject_job`
- `cordum_cancel_job`
- `cordum_trigger_workflow`

The user sees the tool name + arguments, clicks Approve or Reject,
and the assistant resumes (or surfaces the rejection) accordingly.

## Widening the allow-list

To grant the chat assistant a tool that's not in the default list,
edit the policy bundle:

```yaml
# Tenant alpha's chat assistant can also install packs (admin-only)
allow_tools:
  - cordum_list_jobs
  - cordum_submit_job
  - cordum_install_pack   # added — but this requires a separate
                          # subject selector since the default
                          # bundle is wildcard-tenant.
```

Recommended pattern for tenant overrides: ship a **second** bundle
with a narrow subject selector (`tenant: alpha`) that adds extra
tools. Don't edit the default bundle — that's a global change.

## Narrowing the allow-list

To restrict the chat assistant to read-only behavior for a specific
class of users (e.g., a "viewers" deployment):

```yaml
# Read-only chat assistant (no submit_job)
allow_tools:
  - cordum_list_jobs
  - cordum_get_job
  - cordum_list_runs
  - cordum_get_run
  - cordum_run_timeline
  - cordum_list_workflows
  - cordum_list_packs
  - cordum_list_topics
  - cordum_list_workers
  - cordum_list_agents
  - cordum_list_pending_approvals
  - cordum_audit_query
  - cordum_audit_verify
  - cordum_status
  - cordum_query_policy
  # (cordum_submit_job removed)
approval_required_tools: []  # no mutations at all
```

In this configuration, asking the chat assistant to submit anything
will return a tool-not-allowed error from the gateway scope filter
before the approval gate even sees the request.

## Promoting a tool from approval-gated to preapproved

**Don't.** The approval split is the load-bearing UX rail for the
chat assistant. Moving a tool into the preapproved bucket bypasses
the inline Approve/Reject UI — users will see actions taken without
their consent.

If you genuinely need a custom preapproved set for one tenant
(e.g., a pre-vetted automation), file an exception with a written
rationale in the policy bundle's `metadata.reason` field. The audit
chain will record the rationale alongside every tool call so the
preapproval is reviewable post-hoc.

## Verifying the bundle is active

After import:

```bash
curl -k "$CORDUM_BASE_URL/api/v1/policy/bundles" \
  -H "X-API-Key: $CORDUM_API_KEY" | jq '.bundles."chat-assistant-default"'
```

Or in the dashboard: **Govern → Policy Studio → Bundles →
chat-assistant-default**.

The `evaluatePolicy` endpoint can also dry-run a tool call against
the active bundles to verify routing:

```bash
curl -k "$CORDUM_BASE_URL/api/v1/policy/evaluate" \
  -H "X-API-Key: $CORDUM_API_KEY" \
  -d '{"agent_id":"chat-assistant","tool":"cordum_cancel_job"}'
# expected: {"decision":"require_approval", "rule":"chat-assistant-default"}
```
