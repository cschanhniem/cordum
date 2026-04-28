package knowledge

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
)

type staticLoader struct {
	text  string
	err   error
	calls atomic.Int32
}

func (l *staticLoader) Load(context.Context) (string, error) {
	l.calls.Add(1)
	if l.err != nil {
		return "", l.err
	}
	return l.text, nil
}

func TestLoaderSubstitutesBothPlaceholdersAndCachesForLifetime(t *testing.T) {
	inner := &staticLoader{text: "API:\n{{api_summary}}\nSITE:\n{{cordum_io_summary}}"}
	api := &staticLoader{text: "GET /api/v1/jobs"}
	site := &staticLoader{text: "Epic and task definitions"}
	loader := NewLoader(inner, api, site)

	first, err := loader.Load(context.Background())
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	second, err := loader.Load(context.Background())
	if err != nil {
		t.Fatalf("second Load() error = %v", err)
	}
	if first != second {
		t.Fatalf("cached Load() mismatch:\nfirst=%q\nsecond=%q", first, second)
	}
	assertContains(t, first, "GET /api/v1/jobs")
	assertContains(t, first, "Epic and task definitions")
	assertNotContains(t, first, "{{api_summary}}")
	assertNotContains(t, first, "{{cordum_io_summary}}")
	if got := inner.calls.Load(); got != 1 {
		t.Fatalf("inner calls = %d, want 1", got)
	}
	if got := api.calls.Load(); got != 1 {
		t.Fatalf("api calls = %d, want 1", got)
	}
	if got := site.calls.Load(); got != 1 {
		t.Fatalf("site calls = %d, want 1", got)
	}
	if stats := loader.Stats(); stats.APITokens == 0 || stats.SiteTokens == 0 || stats.CombinedTokens == 0 {
		t.Fatalf("Stats() = %+v, want non-zero counts", stats)
	}
}

func TestLoaderCombinedBudgetFailsClosed(t *testing.T) {
	loader := NewLoader(
		&staticLoader{text: "{{api_summary}}\n{{cordum_io_summary}}"},
		&staticLoader{text: strings.Repeat("a", 64)},
		&staticLoader{text: strings.Repeat("b", 64)},
		WithCombinedPromptMaxTokens(2),
	)
	_, err := loader.Load(context.Background())
	if err == nil {
		t.Fatal("Load() error = nil, want budget error")
	}
	assertContains(t, err.Error(), "combined system prompt exceeds token budget")
}

func TestLoaderPropagatesSubstituterError(t *testing.T) {
	wantErr := errors.New("api failed")
	loader := NewLoader(
		&staticLoader{text: "{{api_summary}}\n{{cordum_io_summary}}"},
		&staticLoader{err: wantErr},
		&staticLoader{text: "site"},
	)
	_, err := loader.Load(context.Background())
	if !errors.Is(err, wantErr) {
		t.Fatalf("Load() error = %v, want %v", err, wantErr)
	}
}

func TestDefaultKnowledgeCorpusGroundsRequiredSmokePrompts(t *testing.T) {
	apiPath, err := filepath.Abs(filepath.Join("..", "..", "..", "docs", "api", "openapi", "cordum-api.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	siteRoot, err := filepath.Abs(filepath.Join("..", "..", "..", "docs-site", "docs"))
	if err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{apiPath, siteRoot} {
		if _, err := os.Stat(path); err != nil {
			t.Fatalf("required default corpus path %s: %v", path, err)
		}
	}

	loader := NewLoader(
		&staticLoader{text: "API:\n{{api_summary}}\nSITE:\n{{cordum_io_summary}}"},
		NewAPISubstituter(apiPath),
		NewSiteSubstituter(siteRoot,
			WithSiteGlobs(
				[]string{"concepts/*.md", "getting-started/*.md", "operations/*.md"},
				[]string{"concepts/adr/**"},
			),
		),
	)
	got, err := loader.Load(context.Background())
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	assertContains(t, got, "GET /api/v1/jobs")
	assertContains(t, got, "/api/v1/jobs")
	assertContains(t, got, "Enterprise features ship in cordum core")
	assertContains(t, got, "signed license")
	assertContains(t, got, "A Cordum epic is a planning container")
	assertContains(t, got, "A Cordum task is the executable unit")
	if stats := loader.Stats(); stats.APITokens == 0 || stats.SiteTokens == 0 || stats.CombinedTokens == 0 || stats.CombinedTokens > defaultCombinedPromptMaxTokens {
		t.Fatalf("Stats() = %+v, want non-zero counts under %d combined tokens", stats, defaultCombinedPromptMaxTokens)
	}
}
