package llmchat

import (
	"encoding/json"
	"regexp"

	"github.com/cordum/cordum/core/mcp"
)

// Redactor scrubs sensitive content from MCP tool results before the
// agent loop feeds them into LLM context. It runs ONLY on tool RESULTS
// (epic rail #7 + task rail #2 — user input is verbatim into the
// prompt; this layer guards the model's view of tool output).
type Redactor interface {
	// RedactToolResult takes a JSON-serialised tool result body and
	// returns a redacted version. The output is still valid JSON-ish
	// text — the regex-pass swaps in `[REDACTED:...]` markers without
	// re-marshaling, since the consumer (agent.go) drops the result
	// straight into a chat message Content string.
	RedactToolResult(body []byte) []byte
}

// defenseInDepth chains two scrubbers:
//  1. core/mcp/DefaultRedactor() — the canonical Cordum redactor
//     (matches by JSON field name: api_key, password, token, secret,
//     bearer_token, etc.).
//  2. A regex pass that catches raw text like `AWS_ACCESS_KEY_ID=AKIA...`
//     or `Authorization: Bearer ...` which slip past field-name
//     matching when the secret is embedded in a free-form string.
type defenseInDepth struct {
	mcpRedactor mcp.ArgumentRedactor
}

// sensitiveEnvPattern matches `<NAME>=value` or `<NAME>: value` where
// NAME ends in API_KEY / PASSWORD / TOKEN / SECRET / ACCESS_KEY /
// SECRET_KEY / KEY_ID, with optional uppercase prefix (so both bare
// `API_KEY=...` and `AWS_ACCESS_KEY_ID=...` and `STRIPE_API_SECRET=...`
// match). The capture group is the NAME; the value is dropped into the
// REDACTED marker.
var sensitiveEnvPattern = regexp.MustCompile(`(?i)([A-Z][A-Z0-9_]*?(?:API_KEY|PASSWORD|TOKEN|SECRET|ACCESS_KEY|SECRET_KEY|KEY_ID)|API_KEY|PASSWORD|TOKEN|SECRET)[\s]*[:=][\s]*['"]?([^\s'"\\]+)`)

// authHeaderPattern matches `Authorization: Bearer ...` exactly so we
// only swap the bearer value, not the whole line.
var authHeaderPattern = regexp.MustCompile(`(?i)(Authorization)\s*:\s*(Bearer)\s+(\S+)`)

// NewRedactor constructs the production redactor (mcp DefaultRedactor +
// env-var/auth-header regex pass).
func NewRedactor() Redactor {
	return &defenseInDepth{mcpRedactor: mcp.DefaultRedactor()}
}

// RedactToolResult applies the two-layer scrub. Best-effort: malformed
// JSON falls through the mcp pass (it operates on json.RawMessage, so
// non-JSON input is returned verbatim) and only the regex pass runs on
// the bytes.
func (r *defenseInDepth) RedactToolResult(body []byte) []byte {
	scrubbed := r.mcpPass(body)
	scrubbed = sensitiveEnvPattern.ReplaceAll(scrubbed, []byte("$1=[REDACTED:env_secret]"))
	scrubbed = authHeaderPattern.ReplaceAll(scrubbed, []byte("$1: $2 [REDACTED:bearer]"))
	return scrubbed
}

// mcpPass calls the canonical core/mcp redactor when the input is
// well-formed JSON. Non-JSON or empty input is returned unchanged so
// the regex pass below still gets a chance.
func (r *defenseInDepth) mcpPass(body []byte) []byte {
	if r.mcpRedactor == nil || len(body) == 0 {
		return body
	}
	// Verify it parses as JSON before handing to the mcp redactor —
	// the redactor's contract is json.RawMessage; passing non-JSON is
	// a contract violation.
	if !json.Valid(body) {
		return body
	}
	return []byte(r.mcpRedactor.Redact(json.RawMessage(body)))
}
