# Cordum LLM Chat HTTP API

Phase 5 exposes the local Qwen-backed chat assistant over HTTP. All chat routes are gated by the `llm_chat_assistant` license entitlement; when disabled they return HTTP 402 with `code: "feature_unavailable"`.

## Endpoints

- `POST /api/v1/chat` — single-shot request/response. Body: `{"session_id":"optional","message":"..."}`. Response includes `session_id`, final `assistant` text, `tool_calls`, and the full ordered `frames` stream.
- `GET /api/v1/chat/stream?message=...&session_id=...` — Server-Sent Events fallback. Each event is a single line `data: <json>` followed by a blank line.
- `GET /api/v1/chat/ws` — WebSocket primary path for the dashboard widget. The client may provide `X-Chat-Session-Id`; otherwise the service creates a session and returns the id in the upgrade response header and on frames.
- `GET /api/v1/chat/sessions?cursor=&limit=` — admin session list, gated by `chat.read_all` or admin role.
- `GET /api/v1/chat/sessions/{session_id}` — admin transcript detail. Cross-tenant misses return 404 to avoid existence leaks.

## WebSocket frame schema

All frames are JSON objects with a stable `type` discriminator. Optional `session_id` is included by transports when a frame is sent to clients.

```json
{"type":"user","session_id":"sess-123","text":"list my jobs"}
```

```json
{"type":"assistant_delta","text":"I will check"}
```

```json
{"type":"tool_call","tool_call":{"name":"cordum_list_jobs","arguments":{"limit":5}}}
```

```json
{"type":"tool_result","tool_result":"{\"jobs\":[]}"}
```

Rejected approvals use the same frame type with `is_error:true`:

```json
{"type":"tool_result","tool_result":"denied by human reviewer","is_error":true}
```

```json
{"type":"approval_required","approval_id":"appr-123"}
```

```json
{"type":"final","text":"No jobs are currently running."}
```

```json
{"type":"error","error_code":"message_too_large","error_msg":"message exceeds 64KiB"}
```

## Session lifecycle

```text
connect -> user_message -> assistant_delta*
  -> [tool_call -> (approval_required -> approval resolved/rejected)? -> tool_result]*
  -> assistant_delta* -> final -> persist session
```

Sessions are stored in Redis under `chat:session:{id}` with a 24-hour sliding TTL. Per-session delegation tokens are minted for tool calls so the service-account API key is never used on user-scoped MCP paths.

## Approval resume

The WS handler registers a pending approval before emitting `approval_required`. The approval resumer subscribes to `sys.approvals.>` when NATS is configured. On resolved approval it resumes the paused agent loop and replays the pending tool call with the session delegation token. On rejected approval it injects a synthetic tool result (`is_error:true`, `tool_result:"denied by human reviewer"`) and lets the LLM produce the user-facing explanation.

## Audit

WebSocket connect emits `chat.session_started`; disconnect emits `chat.session_closed`. Both use `audit.SIEMEvent` and the same Redis hash-chain path as existing audit events, so `/api/v1/audit/verify` can attest the lifecycle events alongside tool invocation events.
