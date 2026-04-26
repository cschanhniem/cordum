package llmchat

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func newTestAPIClient(t *testing.T, baseURL string, opts ...APIClientOption) *APIClient {
	t.Helper()
	cfg := APIClientConfig{
		BaseURL:  baseURL,
		APIKey:   "svc-test-key",
		TenantID: "tenant-a",
	}
	c, err := NewAPIClient(cfg, opts...)
	if err != nil {
		t.Fatalf("NewAPIClient: %v", err)
	}
	return c
}

// fastBackoff replaces the exponential backoff with a near-instant
// schedule so retry tests do not gate on real wall-clock time.
func fastBackoff() APIClientOption {
	return WithRetryPolicy(RetryPolicy{
		MaxAttempts: 3,
		Base:        time.Millisecond,
		Cap:         5 * time.Millisecond,
	})
}

// (a) Success ListJobs round-trip — GET, X-API-Key set, Accept: application/json.
func TestAPIClient_GetJob_Success_AppliesServiceAPIKey(t *testing.T) {
	t.Parallel()
	var seenURL, seenMethod, seenAccept, seenAPIKey, seenAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenURL = r.URL.String()
		seenMethod = r.Method
		seenAccept = r.Header.Get("Accept")
		seenAPIKey = r.Header.Get("X-API-Key")
		seenAuth = r.Header.Get("Authorization")
		_ = json.NewEncoder(w).Encode(map[string]any{"id": "job-123", "state": "SUCCEEDED"})
	}))
	defer srv.Close()

	c := newTestAPIClient(t, srv.URL)
	got, err := c.GetJob(context.Background(), "job-123", "")
	if err != nil {
		t.Fatalf("GetJob err: %v", err)
	}
	if got["id"] != "job-123" {
		t.Fatalf("decoded id mismatch: %v", got)
	}
	if seenMethod != http.MethodGet {
		t.Errorf("method = %s, want GET", seenMethod)
	}
	if !strings.Contains(seenURL, "/api/v1/jobs/job-123") {
		t.Errorf("URL = %s, want path containing /api/v1/jobs/job-123", seenURL)
	}
	if seenAPIKey != "svc-test-key" {
		t.Errorf("X-API-Key = %q, want svc-test-key", seenAPIKey)
	}
	if seenAuth != "" {
		t.Errorf("Authorization = %q, want empty (no bearer supplied)", seenAuth)
	}
	if seenAccept != "application/json" {
		t.Errorf("Accept = %q, want application/json", seenAccept)
	}
}

// (b) 401 unauthorized — typed *ApiUnauthorizedError, no retry.
func TestAPIClient_401_TypedNoRetry(t *testing.T) {
	t.Parallel()
	var attempts atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts.Add(1)
		http.Error(w, `{"error":"invalid_api_key"}`, http.StatusUnauthorized)
	}))
	defer srv.Close()

	c := newTestAPIClient(t, srv.URL, fastBackoff())
	_, err := c.GetJob(context.Background(), "job-x", "")
	var ue *ApiUnauthorizedError
	if !errors.As(err, &ue) {
		t.Fatalf("err = %v, want *ApiUnauthorizedError", err)
	}
	if attempts.Load() != 1 {
		t.Errorf("attempts = %d, want 1 (no retry on 4xx)", attempts.Load())
	}
}

// (c) 403 forbidden — typed *ApiForbiddenError, no retry.
func TestAPIClient_403_TypedNoRetry(t *testing.T) {
	t.Parallel()
	var attempts atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts.Add(1)
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
	}))
	defer srv.Close()

	c := newTestAPIClient(t, srv.URL, fastBackoff())
	_, err := c.GetJob(context.Background(), "job-x", "")
	var fe *ApiForbiddenError
	if !errors.As(err, &fe) {
		t.Fatalf("err = %v, want *ApiForbiddenError", err)
	}
	if attempts.Load() != 1 {
		t.Errorf("attempts = %d, want 1 (no retry on 4xx)", attempts.Load())
	}
}

// (d) 404 not-found on GetJob — typed *ApiNotFoundError, no retry.
func TestAPIClient_404_TypedNoRetry(t *testing.T) {
	t.Parallel()
	var attempts atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts.Add(1)
		http.Error(w, `{"error":"not_found"}`, http.StatusNotFound)
	}))
	defer srv.Close()

	c := newTestAPIClient(t, srv.URL, fastBackoff())
	_, err := c.GetJob(context.Background(), "missing-id", "")
	var ne *ApiNotFoundError
	if !errors.As(err, &ne) {
		t.Fatalf("err = %v, want *ApiNotFoundError", err)
	}
	if attempts.Load() != 1 {
		t.Errorf("attempts = %d, want 1 (no retry on 4xx)", attempts.Load())
	}
}

// (e) 500 retry-then-fail — exactly MaxAttempts (3) requests, returns *ApiServerError.
func TestAPIClient_500_RetryThenFail(t *testing.T) {
	t.Parallel()
	var attempts atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts.Add(1)
		http.Error(w, `{"error":"db_unavailable"}`, http.StatusInternalServerError)
	}))
	defer srv.Close()

	c := newTestAPIClient(t, srv.URL, fastBackoff())
	start := time.Now()
	_, err := c.GetJob(context.Background(), "job-1", "")
	elapsed := time.Since(start)

	var se *ApiServerError
	if !errors.As(err, &se) {
		t.Fatalf("err = %v, want *ApiServerError", err)
	}
	if attempts.Load() != 3 {
		t.Errorf("attempts = %d, want 3 (MaxAttempts)", attempts.Load())
	}
	if elapsed >= 30*time.Second {
		t.Errorf("elapsed = %v, want < 30s (retry cap)", elapsed)
	}
}

// (f) Network error retry — closed listener; retries 3x then surfaces wrapped error.
func TestAPIClient_NetworkError_RetryThenFail(t *testing.T) {
	t.Parallel()
	// Bind a port then immediately close it; subsequent dials will fail.
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	addr := ln.Addr().String()
	_ = ln.Close()

	c := newTestAPIClient(t, "http://"+addr, fastBackoff())
	_, err = c.GetJob(context.Background(), "job-1", "")
	if err == nil {
		t.Fatalf("err = nil, want network error")
	}
	// Don't gate on a specific error type — net.OpError or wrapped url.Error
	// shape varies by platform. Just confirm it's not one of the typed
	// HTTP-status errors (which would imply we got a response).
	var ue *ApiUnauthorizedError
	var fe *ApiForbiddenError
	var ne *ApiNotFoundError
	var se *ApiServerError
	if errors.As(err, &ue) || errors.As(err, &fe) || errors.As(err, &ne) || errors.As(err, &se) {
		t.Fatalf("err typed as HTTP error %T, want network error", err)
	}
}

// (g) Ctx cancel mid-call — error wraps context.Canceled.
func TestAPIClient_CtxCancel(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Block until ctx-cancelled by client.
		select {
		case <-r.Context().Done():
		case <-time.After(2 * time.Second):
		}
	}))
	defer srv.Close()

	c := newTestAPIClient(t, srv.URL, fastBackoff())
	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		time.Sleep(20 * time.Millisecond)
		cancel()
	}()
	_, err := c.GetJob(ctx, "job-1", "")
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("err = %v, want errors.Is(err, context.Canceled)", err)
	}
}

// (h) Bearer-token precedence — Authorization: Bearer X is set AND X-API-Key is OMITTED.
func TestAPIClient_BearerToken_OmitsAPIKey(t *testing.T) {
	t.Parallel()
	var seenAuth, seenAPIKey string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenAuth = r.Header.Get("Authorization")
		seenAPIKey = r.Header.Get("X-API-Key")
		_ = json.NewEncoder(w).Encode(map[string]any{"id": "job-1"})
	}))
	defer srv.Close()

	c := newTestAPIClient(t, srv.URL)
	if _, err := c.GetJob(context.Background(), "job-1", "delegated-token-abc"); err != nil {
		t.Fatalf("GetJob err: %v", err)
	}
	if seenAuth != "Bearer delegated-token-abc" {
		t.Errorf("Authorization = %q, want %q", seenAuth, "Bearer delegated-token-abc")
	}
	if seenAPIKey != "" {
		t.Errorf("X-API-Key = %q, want empty (bearer must replace, not accompany)", seenAPIKey)
	}
}

// (a-extra) ListJobs round-trip with typed model.JobRecord.
func TestAPIClient_ListJobs_RoundTrip(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/jobs" {
			http.Error(w, "wrong path", http.StatusNotFound)
			return
		}
		// Mirror gateway's anonymous {"items": ..., "next_cursor": ...} shape.
		_ = json.NewEncoder(w).Encode(map[string]any{
			"items": []map[string]any{
				{"id": "job-1", "state": "SUCCEEDED", "topic": "demo.echo"},
				{"id": "job-2", "state": "RUNNING", "topic": "demo.echo"},
			},
			"next_cursor": int64(1700000000000),
		})
	}))
	defer srv.Close()

	c := newTestAPIClient(t, srv.URL)
	resp, err := c.ListJobs(context.Background(), ListJobsOptions{Limit: 50}, "")
	if err != nil {
		t.Fatalf("ListJobs err: %v", err)
	}
	if len(resp.Items) != 2 {
		t.Fatalf("len(items) = %d, want 2", len(resp.Items))
	}
	if resp.Items[0].ID != "job-1" {
		t.Errorf("items[0].ID = %s, want job-1", resp.Items[0].ID)
	}
	if resp.NextCursor == nil || *resp.NextCursor != 1700000000000 {
		t.Errorf("next_cursor = %v, want 1700000000000", resp.NextCursor)
	}
}

// (a-extra) ListJobs propagates query params correctly.
func TestAPIClient_ListJobs_QueryParams(t *testing.T) {
	t.Parallel()
	var seenQuery string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenQuery = r.URL.RawQuery
		_ = json.NewEncoder(w).Encode(map[string]any{"items": []any{}, "next_cursor": nil})
	}))
	defer srv.Close()

	c := newTestAPIClient(t, srv.URL)
	_, err := c.ListJobs(context.Background(), ListJobsOptions{
		Limit:  25,
		State:  "RUNNING",
		Topic:  "demo.echo",
		Tenant: "tenant-b",
	}, "")
	if err != nil {
		t.Fatalf("ListJobs err: %v", err)
	}
	for _, want := range []string{"limit=25", "state=RUNNING", "topic=demo.echo", "tenant=tenant-b"} {
		if !strings.Contains(seenQuery, want) {
			t.Errorf("query = %q, want substring %q", seenQuery, want)
		}
	}
}

// (a-extra) Path-segment escaping for special characters — verifies
// url.PathEscape is applied so a jobID with spaces or # safely reaches
// the gateway as a single segment. (RFC-level dot-segment normalization
// is the gateway router's concern, not the client's; the client is not
// the path-traversal defense layer.)
func TestAPIClient_GetJob_PathEscapesID(t *testing.T) {
	t.Parallel()
	var seenRawPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// RequestURI preserves the encoded form; r.URL.Path is decoded.
		seenRawPath = r.URL.RequestURI()
		_ = json.NewEncoder(w).Encode(map[string]any{"id": "x"})
	}))
	defer srv.Close()

	c := newTestAPIClient(t, srv.URL)
	_, _ = c.GetJob(context.Background(), "job with#hash", "")
	if !strings.Contains(seenRawPath, "%20") {
		t.Errorf("RequestURI = %q, expected space encoded as %%20", seenRawPath)
	}
	if !strings.Contains(seenRawPath, "%23") {
		t.Errorf("RequestURI = %q, expected # encoded as %%23 (else it'd be parsed as fragment)", seenRawPath)
	}
}

// (a-extra) X-Cordum-Tenant header propagated when configured.
func TestAPIClient_TenantHeader(t *testing.T) {
	t.Parallel()
	var seenTenant string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenTenant = r.Header.Get("X-Cordum-Tenant")
		_ = json.NewEncoder(w).Encode(map[string]any{"id": "x"})
	}))
	defer srv.Close()

	c := newTestAPIClient(t, srv.URL)
	if _, err := c.GetJob(context.Background(), "x", ""); err != nil {
		t.Fatalf("GetJob err: %v", err)
	}
	if seenTenant != "tenant-a" {
		t.Errorf("X-Cordum-Tenant = %q, want tenant-a", seenTenant)
	}
}

// Empty BaseURL should fail at construction.
func TestNewAPIClient_RequiresBaseURL(t *testing.T) {
	t.Parallel()
	if _, err := NewAPIClient(APIClientConfig{APIKey: "x"}); err == nil {
		t.Fatalf("expected err for empty BaseURL")
	}
}
