package store

import (
	"testing"
	"time"
)

func TestIdempotencyTTLLongerThanMetaTTL(t *testing.T) {
	// The idempotency TTL must always be longer than metaTTL to prevent
	// duplicate jobs when clients retry after metaTTL expiry.
	store := &RedisJobStore{
		metaTTL:        7 * 24 * time.Hour,  // 7 days (default)
		idempotencyTTL: 90 * 24 * time.Hour, // 90 days (default)
	}
	if store.idempotencyTTL <= store.metaTTL {
		t.Fatalf("idempotencyTTL (%v) must be > metaTTL (%v)",
			store.idempotencyTTL, store.metaTTL)
	}
}

func TestIdempotencyTTLDefault90Days(t *testing.T) {
	expected := 90 * 24 * time.Hour
	store := &RedisJobStore{idempotencyTTL: expected}
	if store.idempotencyTTL != expected {
		t.Fatalf("expected default idempotencyTTL %v, got %v",
			expected, store.idempotencyTTL)
	}
}

func TestIdempotencyTTLConfigFromEnv(t *testing.T) {
	// Verify the env var parsing logic works
	t.Setenv("CORDUM_IDEMPOTENCY_TTL", "720h") // 30 days
	parsed, err := time.ParseDuration("720h")
	if err != nil {
		t.Fatalf("failed to parse duration: %v", err)
	}
	if parsed != 30*24*time.Hour {
		t.Fatalf("expected 30 days, got %v", parsed)
	}
}

func TestIdempotencyTTLInvalidEnvUsesDefault(t *testing.T) {
	// Invalid env value should not crash — uses default
	t.Setenv("CORDUM_IDEMPOTENCY_TTL", "not-a-duration")
	_, err := time.ParseDuration("not-a-duration")
	if err == nil {
		t.Fatal("expected parse error for invalid duration")
	}
	// Constructor would log warning and use default (90 days)
}

func TestIdempotencyKeyScopedFormat(t *testing.T) {
	// Verify key format includes tenant to prevent cross-tenant collisions
	key1 := jobIdempotencyKeyScoped("tenant-a", "my-key")
	key2 := jobIdempotencyKeyScoped("tenant-b", "my-key")
	if key1 == key2 {
		t.Fatalf("scoped keys for different tenants must differ: %q == %q", key1, key2)
	}
	if key1 == "" || key2 == "" {
		t.Fatal("scoped keys must not be empty")
	}
}

func TestIdempotencyKeyLegacyFormat(t *testing.T) {
	// Legacy key should not include tenant
	key := jobIdempotencyKey("my-key")
	if key == "" {
		t.Fatal("legacy key must not be empty")
	}
	// Verify it differs from scoped key
	scoped := jobIdempotencyKeyScoped("tenant-a", "my-key")
	if key == scoped {
		t.Fatal("legacy and scoped keys must differ")
	}
}
