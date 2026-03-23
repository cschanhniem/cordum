package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestReadSecret_FromFile(t *testing.T) {
	dir := t.TempDir()
	secretFile := filepath.Join(dir, "password")
	if err := os.WriteFile(secretFile, []byte("s3cret-from-file\n"), 0600); err != nil {
		t.Fatal(err)
	}

	t.Setenv("TEST_SECRET_FILE", secretFile)
	t.Setenv("TEST_SECRET", "should-not-use-this")

	val, err := ReadSecret("TEST_SECRET", "TEST_SECRET_FILE")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if val != "s3cret-from-file" {
		t.Fatalf("expected file value, got %q", val)
	}
}

func TestReadSecret_FallbackToEnv(t *testing.T) {
	t.Setenv("TEST_SECRET_FILE", "")
	t.Setenv("TEST_SECRET", "env-value")

	val, err := ReadSecret("TEST_SECRET", "TEST_SECRET_FILE")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if val != "env-value" {
		t.Fatalf("expected env value, got %q", val)
	}
}

func TestReadSecret_NeitherSet(t *testing.T) {
	t.Setenv("TEST_SECRET_FILE", "")
	t.Setenv("TEST_SECRET", "")

	val, err := ReadSecret("TEST_SECRET", "TEST_SECRET_FILE")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if val != "" {
		t.Fatalf("expected empty, got %q", val)
	}
}

func TestReadSecret_FileMissing(t *testing.T) {
	t.Setenv("TEST_SECRET_FILE", "/nonexistent/secret")

	_, err := ReadSecret("TEST_SECRET", "TEST_SECRET_FILE")
	if err == nil {
		t.Fatal("expected error for missing file")
	}
}

func TestReadSecret_TrimsNewline(t *testing.T) {
	dir := t.TempDir()
	secretFile := filepath.Join(dir, "password")
	if err := os.WriteFile(secretFile, []byte("  value-with-whitespace  \n\n"), 0600); err != nil {
		t.Fatal(err)
	}

	t.Setenv("TEST_SECRET_FILE", secretFile)

	val, err := ReadSecret("TEST_SECRET", "TEST_SECRET_FILE")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if val != "value-with-whitespace" {
		t.Fatalf("expected trimmed value, got %q", val)
	}
}

func TestReadSecretRequired_Missing(t *testing.T) {
	t.Setenv("TEST_SECRET_FILE", "")
	t.Setenv("TEST_SECRET", "")

	_, err := ReadSecretRequired("TEST_SECRET", "TEST_SECRET_FILE", "admin password")
	if err == nil {
		t.Fatal("expected error for missing required secret")
	}
}

func TestReadSecretRequired_Present(t *testing.T) {
	t.Setenv("TEST_SECRET_FILE", "")
	t.Setenv("TEST_SECRET", "present")

	val, err := ReadSecretRequired("TEST_SECRET", "TEST_SECRET_FILE", "admin password")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if val != "present" {
		t.Fatalf("expected 'present', got %q", val)
	}
}
