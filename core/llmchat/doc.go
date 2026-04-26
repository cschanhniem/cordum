// Package llmchat is the Cordum LLM Chat Assistant runtime — the
// in-cluster service that connects users to the local vLLM-served Qwen
// model and proxies tool calls through Cordum's existing MCP server.
//
// # Two HTTP surfaces, one strict split
//
// The chat assistant talks to Cordum over two HTTP surfaces with
// non-overlapping responsibilities:
//
//   - mcpclient.go — MCP transport over /mcp/sse + /mcp/message. Carries
//     every tool call (cordum_submit_job, cordum_approve_job,
//     cordum_trigger_workflow, ...) so the call traverses the existing
//     ApprovalGate + ToolInvocationAuditor + SIEMEvent pipeline. This is
//     the ONLY mutation path for the chat assistant.
//
//   - apiclient.go — read-only REST over /api/v1/*. Carries fast list/fetch
//     reads (jobs, bundles, policies, audit chain) that are already
//     gated by the gateway's auth + RBAC middleware and don't need
//     ApprovalGate overhead.
//
// apiclient.go is enforced READ-ONLY by source-grep unit test
// (apiclient_readonly_test.go). Any future contributor who adds a
// http.MethodPost / Put / Patch / Delete to the apiclient*.go family
// fails the standard `go test ./core/llmchat/...` run. If a new
// mutation is needed it goes through mcpclient.go — no exceptions.
//
// Both transports honor the same auth hierarchy: a non-empty per-call
// bearer token (the per-session delegation JWT minted in
// delegation.go) supplants the service-account X-API-Key entirely.
// The service API key never accompanies a delegation-scoped request.
package llmchat
