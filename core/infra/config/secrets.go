package config

import (
	"fmt"
	"log/slog"
	"os"
	"strings"
)

// ReadSecret reads a secret value, preferring file-based secrets over
// environment variables. This supports Docker secrets (/run/secrets/*)
// and Kubernetes secret volume mounts.
//
// Lookup order:
//  1. fileEnv (e.g. CORDUM_ADMIN_PASSWORD_FILE) - read file contents
//  2. envVar (e.g. CORDUM_ADMIN_PASSWORD) - use env var with deprecation warning
//  3. Return empty string (caller decides if required)
//
// File contents are trimmed of leading/trailing whitespace and newlines.
func ReadSecret(envVar, fileEnv string) (string, error) {
	// Prefer file-based secret (Docker secrets / K8s volume mounts)
	if filePath := strings.TrimSpace(os.Getenv(fileEnv)); filePath != "" {
		data, err := os.ReadFile(filePath) // #nosec G304 -- operator-configured path
		if err != nil {
			return "", fmt.Errorf("read secret file %s=%s: %w", fileEnv, filePath, err)
		}

		// Warn on overly permissive file permissions
		info, statErr := os.Stat(filePath)
		if statErr == nil {
			mode := info.Mode().Perm()
			if mode&0o077 != 0 {
				slog.Warn("secret file has permissive permissions, recommend 0400 or 0600",
					"file", filePath, "mode", fmt.Sprintf("%04o", mode))
			}
		}

		return strings.TrimSpace(string(data)), nil
	}

	// Fallback to environment variable
	if value := os.Getenv(envVar); value != "" {
		slog.Warn("secret loaded from environment variable, prefer file-based secrets (_FILE suffix)",
			"env_var", envVar, "file_env", fileEnv)
		return value, nil
	}

	return "", nil
}

// ReadSecretRequired is like ReadSecret but returns an error if the secret
// is not found in either file or environment variable.
func ReadSecretRequired(envVar, fileEnv, description string) (string, error) {
	value, err := ReadSecret(envVar, fileEnv)
	if err != nil {
		return "", err
	}
	if value == "" {
		return "", fmt.Errorf("%s not configured: set %s (preferred) or %s", description, fileEnv, envVar)
	}
	return value, nil
}
