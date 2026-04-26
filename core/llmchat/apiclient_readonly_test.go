package llmchat

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// TestAPIClient_ReadOnly enforces task-845cb55b rail #1: the apiclient.go
// surface MUST issue only GET requests. Any POST/PUT/PATCH/DELETE in the
// apiclient*.go family is a bug — mutations must traverse the MCP client
// for ApprovalGate governance.
//
// Implemented as a source-grep test (instead of a CI lint script) so any
// PR that adds a forbidden HTTP method constant fails the standard
// `go test ./core/llmchat/...` run.
func TestAPIClient_NoMutatingHTTPMethods(t *testing.T) {
	t.Parallel()
	pattern := regexp.MustCompile(`http\.Method(Post|Put|Patch|Delete)\b`)

	entries, err := os.ReadDir(".")
	if err != nil {
		t.Fatalf("read dir: %v", err)
	}
	var checked int
	for _, e := range entries {
		if e.IsDir() || !strings.HasPrefix(e.Name(), "apiclient") {
			continue
		}
		if !strings.HasSuffix(e.Name(), ".go") {
			continue
		}
		// The enforcement test itself names these constants in the
		// regexp literal above; skip it to avoid a self-match.
		if e.Name() == "apiclient_readonly_test.go" {
			continue
		}
		path := filepath.Join(".", e.Name())
		body, err := os.ReadFile(path) // #nosec G304 -- test reads sibling files in the package directory.
		if err != nil {
			t.Fatalf("read %s: %v", path, err)
		}
		checked++
		if loc := pattern.FindIndex(body); loc != nil {
			t.Errorf("%s: forbidden mutating HTTP method constant at offset %d (rail #1: apiclient is READ-ONLY; mutations must go through mcpclient)", path, loc[0])
		}
	}
	if checked == 0 {
		t.Fatalf("no apiclient*.go files found — readonly guard cannot run")
	}
}
