package llmchat

import (
	"strings"
	"testing"
)

func TestRedactor_McpFieldNamePath(t *testing.T) {
	t.Parallel()
	r := NewRedactor()
	body := []byte(`{"api_key":"sk-real-secret","other":"keep"}`)
	out := string(r.RedactToolResult(body))
	if strings.Contains(out, "sk-real-secret") {
		t.Errorf("api_key field should be redacted by mcp pass; got %s", out)
	}
	if !strings.Contains(out, "keep") {
		t.Errorf("non-sensitive fields should pass through; got %s", out)
	}
}

func TestRedactor_EnvVarRegexCatchesEmbeddedSecrets(t *testing.T) {
	t.Parallel()
	r := NewRedactor()
	cases := []struct {
		name string
		body string
	}{
		{"aws_access_key_id_eq", `{"output":"AWS_ACCESS_KEY_ID=AKIAJ7777777"}`},
		{"db_password_colon", `{"err":"connection: DB_PASSWORD: hunter2"}`},
		{"github_token_eq", `{"log":"GITHUB_TOKEN=ghp_abcdef1234567890"}`},
		{"stripe_api_secret_eq", `{"x":"STRIPE_API_SECRET=sk_live_aaaaaaaaaa"}`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			out := string(r.RedactToolResult([]byte(tc.body)))
			if !strings.Contains(out, "[REDACTED:env_secret]") {
				t.Errorf("expected [REDACTED:env_secret] marker in %s", out)
			}
			// Ensure the actual secret values are gone.
			for _, secret := range []string{"AKIAJ7777777", "hunter2", "ghp_abcdef1234567890", "sk_live_aaaaaaaaaa"} {
				if strings.Contains(out, secret) {
					t.Errorf("secret %q still present in redacted output: %s", secret, out)
				}
			}
		})
	}
}

func TestRedactor_AuthHeaderScrub(t *testing.T) {
	t.Parallel()
	r := NewRedactor()
	body := []byte(`{"raw":"GET /jobs\nAuthorization: Bearer eyJhbGciOiJSU\nContent-Type: application/json"}`)
	out := string(r.RedactToolResult(body))
	if strings.Contains(out, "eyJhbGciOiJSU") {
		t.Errorf("bearer token should be redacted; got %s", out)
	}
	if !strings.Contains(out, "[REDACTED:bearer]") {
		t.Errorf("expected [REDACTED:bearer] marker in %s", out)
	}
}

func TestRedactor_MalformedJSONFallsThrough(t *testing.T) {
	t.Parallel()
	r := NewRedactor()
	// Not valid JSON — mcp pass refuses, regex pass still scrubs.
	body := []byte(`API_KEY=sk-leak this is not JSON`)
	out := string(r.RedactToolResult(body))
	if strings.Contains(out, "sk-leak") {
		t.Errorf("regex pass should still scrub; got %s", out)
	}
}

func TestRedactor_Idempotent(t *testing.T) {
	t.Parallel()
	r := NewRedactor()
	body := []byte(`{"output":"GITHUB_TOKEN=ghp_secret"}`)
	once := r.RedactToolResult(body)
	twice := r.RedactToolResult(once)
	if string(once) != string(twice) {
		t.Errorf("RedactToolResult is not idempotent: once=%s twice=%s", once, twice)
	}
}
