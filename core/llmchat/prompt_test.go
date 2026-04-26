package llmchat

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestPromptLoader_LoadsFromPath(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := filepath.Join(dir, "prompt.md")
	body := "You are a test assistant. Use tools wisely."
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	loader := NewFilePromptLoader(path)
	got, err := loader.Load(context.Background())
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if got != body {
		t.Errorf("Load = %q, want %q", got, body)
	}
}

func TestPromptLoader_CacheHitWithinTTL(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := filepath.Join(dir, "prompt.md")
	if err := os.WriteFile(path, []byte("first"), 0o600); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	loader := NewFilePromptLoader(path)
	first, err := loader.Load(context.Background())
	if err != nil {
		t.Fatalf("Load 1: %v", err)
	}
	// Mutate the file; cache should still return the first value.
	if err := os.WriteFile(path, []byte("second"), 0o600); err != nil {
		t.Fatalf("WriteFile 2: %v", err)
	}
	second, err := loader.Load(context.Background())
	if err != nil {
		t.Fatalf("Load 2: %v", err)
	}
	if first != second {
		t.Errorf("cache should serve stale value within TTL; first=%q second=%q", first, second)
	}
}

func TestPromptLoader_MissingFileFallsBackToDefault(t *testing.T) {
	t.Parallel()
	loader := NewFilePromptLoader("/nonexistent/path/prompt.md")
	got, err := loader.Load(context.Background())
	if err != nil {
		t.Fatalf("Load: %v (missing file should silently fall back)", err)
	}
	if got != DefaultSystemPrompt() {
		t.Errorf("missing-file fallback should return DefaultSystemPrompt; got %q", got)
	}
}

func TestPromptLoader_EnvOverridePath(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "env-prompt.md")
	if err := os.WriteFile(path, []byte("from env override"), 0o600); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	t.Setenv("LLMCHAT_SYSTEM_PROMPT_PATH", path)

	loader := NewFilePromptLoader("") // empty path → consult env
	got, err := loader.Load(context.Background())
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if got != "from env override" {
		t.Errorf("env-override path not honoured; got %q", got)
	}
}

func TestPromptLoader_EmptyFileFallsBackToDefault(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := filepath.Join(dir, "empty.md")
	if err := os.WriteFile(path, []byte{}, 0o600); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	loader := NewFilePromptLoader(path)
	got, err := loader.Load(context.Background())
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if got != DefaultSystemPrompt() {
		t.Errorf("empty-file fallback should return DefaultSystemPrompt; got %q", got)
	}
}

func TestPromptLoader_PassesThroughKnowledgePackPlaceholders(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := filepath.Join(dir, "tmpl.md")
	body := "Cordum tools: {{api_summary}}\n\nAbout: {{cordum_io_summary}}\n\nReady."
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	loader := NewFilePromptLoader(path)
	got, err := loader.Load(context.Background())
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if !strings.Contains(got, "{{api_summary}}") || !strings.Contains(got, "{{cordum_io_summary}}") {
		t.Errorf("placeholders should pass through unchanged; got %q", got)
	}
}

func TestPromptLoader_RespectsContextCancel(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := filepath.Join(dir, "p.md")
	if err := os.WriteFile(path, []byte("hello"), 0o600); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	loader := NewFilePromptLoader(path)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := loader.Load(ctx)
	if err == nil {
		t.Fatal("expected error from cancelled context")
	}
	if !strings.Contains(err.Error(), "context") {
		t.Errorf("error %v should mention context cancellation", err)
	}
	_ = time.Now() // touch time import keeps compiler happy if structure changes
}
