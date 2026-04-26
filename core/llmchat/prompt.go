package llmchat

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"sync"
	"time"
)

// PromptLoader supplies the system prompt that grounds the LLM in
// Cordum's domain at the start of every Turn.
type PromptLoader interface {
	Load(ctx context.Context) (string, error)
}

// promptCacheTTL is how long the file-loader keeps a successful read
// in memory before re-reading from disk. Operators editing the prompt
// see updates within 5 minutes without restart.
const promptCacheTTL = 5 * time.Minute

// promptPathEnv overrides the default path. Empty = use defaultPromptPath.
const (
	promptPathEnv     = "LLMCHAT_SYSTEM_PROMPT_PATH"
	defaultPromptPath = "config/llmchat/system-prompt.md"
)

// filePromptLoader reads the system prompt from a file with a 5-minute
// cache. Missing/empty file falls back to DefaultSystemPrompt() so the
// service stays operational on a fresh deploy before the prompt file is
// shipped.
type filePromptLoader struct {
	path string

	mu       sync.RWMutex
	cached   string
	loadedAt time.Time
}

// NewFilePromptLoader constructs a file-backed loader. Pass an empty
// path to consult the LLMCHAT_SYSTEM_PROMPT_PATH env var (with a
// project-default fallback).
func NewFilePromptLoader(path string) PromptLoader {
	if path == "" {
		path = os.Getenv(promptPathEnv)
	}
	if path == "" {
		path = defaultPromptPath
	}
	return &filePromptLoader{path: path}
}

// Load returns the cached prompt when fresh; otherwise reads from disk
// and refreshes the cache. File missing/empty → DefaultSystemPrompt()
// + slog.Warn (so operators notice but service stays up).
//
// Template placeholder pass-through (per Yaron 2026-04-25 directive
// "LLM should know all API + cordum.io info"): the loader does NOT
// substitute `{{api_summary}}` or `{{cordum_io_summary}}` tokens.
// A separately-filed knowledge-pack task (task-558966d0 et al.)
// owns the substituters that read the OpenAPI spec + Coretex-site
// MDX content. Pass-through here keeps the loader minimal until
// those readers ship.
func (l *filePromptLoader) Load(ctx context.Context) (string, error) {
	l.mu.RLock()
	if l.cached != "" && time.Since(l.loadedAt) < promptCacheTTL {
		out := l.cached
		l.mu.RUnlock()
		return out, nil
	}
	l.mu.RUnlock()

	if err := ctx.Err(); err != nil {
		return "", err
	}

	body, err := os.ReadFile(l.path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			slog.Warn("llmchat: system prompt file missing, using default",
				"path", l.path,
				"hint", "phase 8 ships config/llmchat/system-prompt.md")
			return DefaultSystemPrompt(), nil
		}
		return "", fmt.Errorf("llmchat/prompt: read %s: %w", l.path, err)
	}
	text := string(body)
	if text == "" {
		slog.Warn("llmchat: system prompt file empty, using default", "path", l.path)
		return DefaultSystemPrompt(), nil
	}

	l.mu.Lock()
	l.cached = text
	l.loadedAt = time.Now()
	l.mu.Unlock()
	return text, nil
}

// DefaultSystemPrompt is the stub shipped with phase 4. Phase 8 will
// replace this with production text + the API/cordum.io knowledge
// pack. The stub orients the LLM in Cordum's tool surface and pins
// the no-secret-echo, no-invented-IDs guardrails so even a degraded
// deploy (file missing) ships safely.
func DefaultSystemPrompt() string {
	return `You are the Cordum chat assistant.

Available tools come from the MCP server's tools/list response — never invent tool names, job IDs, or workflow IDs that did not appear in a prior tool result. When a user asks about a denial or failure, ALWAYS read the audit log via the audit-query tool before explaining what happened.

Never echo secrets or credentials from tool results. If a tool result contains an API key, password, token, or bearer credential, treat it as opaque and refer to the operator's vault for retrieval.

Knowledge pack placeholders for the API + cordum.io content live at {{api_summary}} and {{cordum_io_summary}}; these are populated by a separate knowledge-pack pipeline.`
}
