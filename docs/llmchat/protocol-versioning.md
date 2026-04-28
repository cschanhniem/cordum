# LLM Chat Frame Protocol Versioning

Task: `task-8eab552b`

## Scope

This document describes the intended versioning strategy for the informational-only LLM chat websocket/SSE frame protocol after the 2026-04-28 scope reduction. Tool-call, approval-required, and MCP error-propagation frames are retired from the production-default chat surface; they should not be used as compatibility anchors for v1.

## Intended v1 frame contract

Every server-to-client and client-to-server chat frame should carry a top-level version field:

```json
{
  "v": 1,
  "type": "assistant_delta",
  "session_id": "<opaque-session-id>",
  "text": "partial assistant text"
}
```

Production-default v1 frame types:

- `user` — accepted user message echo.
- `assistant_delta` — streaming assistant text delta.
- `final` — exactly one final consolidated assistant message per successful turn.
- `error` — terminal failure frame with a stable `error_code` and redacted `error` text.
- `session_started` / `session_closed` lifecycle notifications, if emitted by the transport layer.

Retired/non-default legacy frame types (`tool_call`, `tool_result`, `approval_required`) must be absent from the default informational-only path. If a customer opts into an old experimental build, those frames are outside the supported v1 default contract.

## Unknown-version behavior

Clients may send only `v: 1` or omit `v` during a temporary migration window. Once the migration window closes, omission should also fail closed.

A frame with an unsupported version must be rejected with a stable error:

```json
{
  "v": 1,
  "type": "error",
  "error_code": "unsupported_protocol_version",
  "error": "unsupported chat protocol version"
}
```

The websocket should then close with a normal policy/error close code so clients do not keep retrying an incompatible frame shape indefinitely.

## v2 upgrade plan

1. Add v1 emission everywhere first and keep clients tolerant of missing `v` for one release.
2. Add server-side validation for incoming client frames: `v == 1` is accepted, unknown values return `unsupported_protocol_version`.
3. Publish dashboard/client release notes and update integration tests.
4. Introduce v2 behind an explicit feature flag and emit both v1/v2 compatibility fields for one release.
5. Remove the missing-version grace period only after the dashboard and documented clients have shipped with v1/v2 negotiation.
6. Keep the redaction rule unchanged across versions: never put secrets, prompts, tokens, or API keys into protocol error details.

## Current implementation status

The current senior-review probe records whether the code has reached this contract. At the time of this review, static evidence indicates the Go `Frame` struct does **not** include `json:"v"`, and no `unsupported_protocol_version` handler string is present. That is a P1 protocol-hardening gap, not an approved v1 state.
