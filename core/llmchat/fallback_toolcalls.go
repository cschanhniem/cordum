// Package llmchat — fallback tool-call extraction.
//
// Some OpenAI-compatible backends — most notably Ollama in streaming
// mode with smaller models (Qwen2.5:7b, llama3.2:3b on 19+ tool
// surfaces) — emit tool calls as JSON code blocks INSIDE the assistant
// `content` field instead of as proper streaming `delta.tool_calls[]`.
// The structured emission only happens reliably with `stream:false`
// and Ollama's post-completion extractor, but the Cordum provider
// hardcodes `stream:true` so summary-phase token streaming stays
// responsive.
//
// extractContentToolCalls parses an assistant content string and
// returns synthesized ToolCall entries for any JSON tool-call blocks
// it finds. Supported shapes (forgiving — small models drift):
//
//   {"tool_call":  {"name":"X","args":{...}}}
//   {"tool_call":  {"name":"X","arguments":{...}}}
//   {"tool_calls": [{"name":"X","args":{...}}, ...]}
//   {"name": "X", "args": {...}}                       (single-call shorthand)
//
// Each shape may be wrapped in ```json fences or inline. Multiple
// blocks in the same content are returned in order. Unparseable JSON
// is silently skipped (not a fatal error — the agent treats no calls
// as "summarize the user message" and the user sees that prose).
//
// This is a fallback only. If the provider returns proper structured
// tool_calls the agent uses those and never invokes this extractor.

package llmchat

import (
	"encoding/json"
	"strings"
)

// extractContentToolCalls finds tool-call JSON blocks in a free-form
// assistant content string and returns synthesized ToolCall entries.
// Returns nil when no parseable blocks are present.
func extractContentToolCalls(content string) []ToolCall {
	if content == "" {
		return nil
	}
	stripped := stripCodeFences(content)
	var out []ToolCall
	for _, raw := range findJSONObjects(stripped) {
		if calls := parseToolCallShape(raw); len(calls) > 0 {
			out = append(out, calls...)
		}
	}
	return out
}

// stripCodeFences removes triple-backtick markdown fences. Models
// often wrap tool-call JSON in ```json … ``` fenced blocks; stripping
// avoids confusing the JSON-object scanner with the leading prose.
func stripCodeFences(s string) string {
	// Simple fence remover: replace the fence delimiters with newlines.
	// We don't need full markdown parsing — just enough for the JSON
	// scanner downstream to find balanced { … } objects.
	s = strings.ReplaceAll(s, "```json", "\n")
	s = strings.ReplaceAll(s, "```JSON", "\n")
	s = strings.ReplaceAll(s, "```", "\n")
	return s
}

// findJSONObjects walks the input and returns every balanced { … }
// object substring as a raw byte slice. Brace counting respects
// strings (so braces inside JSON string values don't unbalance the
// counter). Non-object content between objects is ignored. Returns
// nil if no balanced object is found.
func findJSONObjects(s string) [][]byte {
	var objects [][]byte
	depth := 0
	inString := false
	escaped := false
	start := -1
	bs := []byte(s)
	for i, c := range bs {
		if escaped {
			escaped = false
			continue
		}
		if inString {
			if c == '\\' {
				escaped = true
				continue
			}
			if c == '"' {
				inString = false
			}
			continue
		}
		switch c {
		case '"':
			inString = true
		case '{':
			if depth == 0 {
				start = i
			}
			depth++
		case '}':
			if depth == 0 {
				continue
			}
			depth--
			if depth == 0 && start >= 0 {
				objects = append(objects, bs[start:i+1])
				start = -1
			}
		}
	}
	return objects
}

// parseToolCallShape attempts every supported shape against the JSON
// blob and returns synthesized ToolCalls on the first match. Returns
// nil when none of the shapes apply.
func parseToolCallShape(raw []byte) []ToolCall {
	// Shape 1: {"tool_call": {name, args|arguments}}
	var single struct {
		ToolCall *toolCallNamed `json:"tool_call"`
	}
	if err := json.Unmarshal(raw, &single); err == nil && single.ToolCall != nil {
		if call := single.ToolCall.toToolCall(); call != nil {
			return []ToolCall{*call}
		}
	}
	// Shape 2: {"tool_calls": [{name, args|arguments}, …]}
	var plural struct {
		ToolCalls []toolCallNamed `json:"tool_calls"`
	}
	if err := json.Unmarshal(raw, &plural); err == nil && len(plural.ToolCalls) > 0 {
		out := make([]ToolCall, 0, len(plural.ToolCalls))
		for i := range plural.ToolCalls {
			if call := plural.ToolCalls[i].toToolCall(); call != nil {
				out = append(out, *call)
			}
		}
		if len(out) > 0 {
			return out
		}
	}
	// Shape 3: bare {name, args|arguments} object
	var bare toolCallNamed
	if err := json.Unmarshal(raw, &bare); err == nil {
		if call := bare.toToolCall(); call != nil {
			return []ToolCall{*call}
		}
	}
	return nil
}

// toolCallNamed accepts both `args` (Llama / freeform shape) and
// `arguments` (OpenAI canonical shape). It also accepts arguments as
// either a JSON object (the common case) or a string-encoded JSON
// object (the OpenAI-canonical wire shape when relayed by hand).
type toolCallNamed struct {
	Name      string          `json:"name"`
	Args      json.RawMessage `json:"args,omitempty"`
	Arguments json.RawMessage `json:"arguments,omitempty"`
	ID        string          `json:"id,omitempty"`
}

func (t *toolCallNamed) toToolCall() *ToolCall {
	name := strings.TrimSpace(t.Name)
	if name == "" {
		return nil
	}
	rawArgs := t.Arguments
	if len(rawArgs) == 0 {
		rawArgs = t.Args
	}
	args := normaliseArguments(rawArgs)
	return &ToolCall{
		ID:        t.ID,
		Name:      name,
		Arguments: args,
	}
}

// normaliseArguments accepts either a JSON object or a string-quoted
// JSON object (OpenAI's canonical wire shape) and returns the bare
// JSON object bytes. An empty / null input becomes `{}` so downstream
// json.Unmarshal into typed parameter structs always succeeds.
func normaliseArguments(raw json.RawMessage) json.RawMessage {
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" || trimmed == "null" {
		return json.RawMessage(`{}`)
	}
	if strings.HasPrefix(trimmed, `"`) {
		// String-quoted: `"{\"x\":1}"` → unwrap one level.
		var unwrapped string
		if err := json.Unmarshal([]byte(trimmed), &unwrapped); err == nil {
			unwrappedTrim := strings.TrimSpace(unwrapped)
			if strings.HasPrefix(unwrappedTrim, "{") {
				return json.RawMessage(unwrappedTrim)
			}
		}
	}
	if strings.HasPrefix(trimmed, "{") {
		return json.RawMessage(trimmed)
	}
	return json.RawMessage(`{}`)
}
