package llmchat

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/cordum/cordum/core/model"
	sdkclient "github.com/cordum/cordum/sdk/client"
)

// APIClientConfig is the boot-time configuration for an APIClient.
type APIClientConfig struct {
	// BaseURL is the Cordum gateway root, e.g. https://gateway.internal:8443.
	// The client appends /api/v1/* itself.
	BaseURL string

	// APIKey is the service-account credential. Forwarded as `X-API-Key`
	// on calls UNLESS a per-call bearer token is supplied, in which case
	// the bearer takes over and X-API-Key is omitted (rail #3 — service
	// API key never leaks into delegated read paths).
	APIKey string

	// TenantID, when non-empty, is sent as `X-Cordum-Tenant`.
	TenantID string

	// AgentID, when non-empty, is sent as `X-Agent-Id` so the gateway
	// resolves the chat-assistant identity for scope filtering.
	AgentID string

	// HTTPClient lets tests inject a transport. nil = http.DefaultClient
	// with a 30s timeout (per-call ctx still drives cancellation).
	HTTPClient *http.Client
}

// RetryPolicy controls the bounded backoff applied to 5xx + transport
// errors. 4xx responses are NEVER retried per rail #4.
type RetryPolicy struct {
	// MaxAttempts is the total request count including the first.
	MaxAttempts int

	// Base is the first backoff duration; subsequent attempts double up
	// to Cap. The cumulative wall-clock is bounded indirectly by Cap +
	// the caller's context.
	Base time.Duration

	// Cap is the per-step backoff ceiling.
	Cap time.Duration
}

// DefaultRetryPolicy is the production default: 3 attempts, 500ms base,
// 8s cap. Combined with the 30s per-call timeout this stays under the
// 30s wall-clock budget from rail #4.
var DefaultRetryPolicy = RetryPolicy{
	MaxAttempts: 3,
	Base:        500 * time.Millisecond,
	Cap:         8 * time.Second,
}

// APIClientOption customizes the APIClient at construction.
type APIClientOption func(*APIClient)

// WithRetryPolicy overrides the default retry policy. Tests use this to
// shrink backoff durations.
func WithRetryPolicy(p RetryPolicy) APIClientOption {
	return func(c *APIClient) { c.retry = p }
}

// WithLogger overrides the default slog logger.
func WithLogger(logger *slog.Logger) APIClientOption {
	return func(c *APIClient) {
		if logger != nil {
			c.logger = logger
		}
	}
}

// APIClient is a READ-ONLY HTTP client for Cordum's REST API. Every
// method issues GET. Mutations must traverse the MCP client (mcpclient.go)
// so ApprovalGate + ToolInvocationAuditor + SIEMEvent governance fires.
//
// Concurrency: all methods are goroutine-safe.
type APIClient struct {
	httpClient    *http.Client
	baseURL       string
	serviceAPIKey string
	tenantID      string
	agentID       string
	retry         RetryPolicy
	logger        *slog.Logger
}

// NewAPIClient validates cfg and returns a ready-to-use client.
func NewAPIClient(cfg APIClientConfig, opts ...APIClientOption) (*APIClient, error) {
	if strings.TrimSpace(cfg.BaseURL) == "" {
		return nil, fmt.Errorf("llmchat/apiclient: BaseURL is required")
	}
	httpClient := cfg.HTTPClient
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 30 * time.Second}
	}
	c := &APIClient{
		httpClient:    httpClient,
		baseURL:       strings.TrimRight(cfg.BaseURL, "/"),
		serviceAPIKey: cfg.APIKey,
		tenantID:      cfg.TenantID,
		agentID:       cfg.AgentID,
		retry:         DefaultRetryPolicy,
		logger:        slog.Default(),
	}
	for _, opt := range opts {
		opt(c)
	}
	if c.retry.MaxAttempts <= 0 {
		c.retry.MaxAttempts = 1
	}
	return c, nil
}

// ListJobsOptions narrows a /api/v1/jobs query. Zero values are omitted
// from the outbound query string.
type ListJobsOptions struct {
	Limit         int64
	State         string
	Topic         string
	Tenant        string
	Team          string
	TraceID       string
	Cursor        int64
	UpdatedAfter  int64
	UpdatedBefore int64
}

// ListJobsResponse mirrors the gateway's anonymous {items, next_cursor}
// envelope from handleListJobs. The wrapper is local because the
// gateway-side type is unexported.
type ListJobsResponse struct {
	Items      []model.JobRecord `json:"items"`
	NextCursor *int64            `json:"next_cursor,omitempty"`
}

// ListJobs hits GET /api/v1/jobs.
func (c *APIClient) ListJobs(ctx context.Context, opts ListJobsOptions, bearerToken string) (*ListJobsResponse, error) {
	q := url.Values{}
	if opts.Limit > 0 {
		q.Set("limit", strconv.FormatInt(opts.Limit, 10))
	}
	if opts.State != "" {
		q.Set("state", opts.State)
	}
	if opts.Topic != "" {
		q.Set("topic", opts.Topic)
	}
	if opts.Tenant != "" {
		q.Set("tenant", opts.Tenant)
	}
	if opts.Team != "" {
		q.Set("team", opts.Team)
	}
	if opts.TraceID != "" {
		q.Set("trace_id", opts.TraceID)
	}
	if opts.Cursor > 0 {
		q.Set("cursor", strconv.FormatInt(opts.Cursor, 10))
	}
	if opts.UpdatedAfter > 0 {
		q.Set("updated_after", strconv.FormatInt(opts.UpdatedAfter, 10))
	}
	if opts.UpdatedBefore > 0 {
		q.Set("updated_before", strconv.FormatInt(opts.UpdatedBefore, 10))
	}
	var out ListJobsResponse
	if err := c.do(ctx, "/api/v1/jobs", q, bearerToken, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// GetJob hits GET /api/v1/jobs/{id}. Gateway returns the raw HGETALL meta
// dump as JSON, so the typed surface here is map[string]any — matching
// the existing sdk/client.GetJob contract.
func (c *APIClient) GetJob(ctx context.Context, jobID, bearerToken string) (map[string]any, error) {
	if strings.TrimSpace(jobID) == "" {
		return nil, fmt.Errorf("llmchat/apiclient: job id required")
	}
	var out map[string]any
	path := "/api/v1/jobs/" + url.PathEscape(jobID)
	if err := c.do(ctx, path, nil, bearerToken, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// ListBundles hits GET /api/v1/policy/bundles. Gateway returns a
// list-shaped JSON; the wrapper shape is unexported so the typed return
// is []map[string]any matching the gateway response.
func (c *APIClient) ListBundles(ctx context.Context, bearerToken string) ([]map[string]any, error) {
	var out struct {
		Items []map[string]any `json:"items"`
	}
	if err := c.do(ctx, "/api/v1/policy/bundles", nil, bearerToken, &out); err != nil {
		return nil, err
	}
	return out.Items, nil
}

// GetBundle hits GET /api/v1/policy/bundles/{id}. Returns the raw bundle
// detail body — gateway emits policybundles.PolicyBundleDetail with an
// optional Shadow extension, but this client surfaces the JSON as a map
// so callers can read fields without taking on a policybundles import.
func (c *APIClient) GetBundle(ctx context.Context, bundleID, bearerToken string) (map[string]any, error) {
	if strings.TrimSpace(bundleID) == "" {
		return nil, fmt.Errorf("llmchat/apiclient: bundle id required")
	}
	var out map[string]any
	path := "/api/v1/policy/bundles/" + url.PathEscape(bundleID)
	if err := c.do(ctx, path, nil, bearerToken, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// ListPolicies hits GET /api/v1/policies — the catalog of registered
// policy rules.
func (c *APIClient) ListPolicies(ctx context.Context, bearerToken string) ([]map[string]any, error) {
	var out struct {
		Items []map[string]any `json:"items"`
	}
	if err := c.do(ctx, "/api/v1/policies", nil, bearerToken, &out); err != nil {
		return nil, err
	}
	return out.Items, nil
}

// AuditVerifyOptions narrows a GET /api/v1/audit/verify call.
type AuditVerifyOptions struct {
	Tenant  string
	SinceMs int64
	UntilMs int64
	Limit   int64
}

// GetAuditChain hits GET /api/v1/audit/verify and returns the typed
// integrity report. Reuses sdkclient.AuditVerifyResult so the wire
// contract stays in lock-step with cordumctl.
func (c *APIClient) GetAuditChain(ctx context.Context, opts AuditVerifyOptions, bearerToken string) (*sdkclient.AuditVerifyResult, error) {
	q := url.Values{}
	if t := strings.TrimSpace(opts.Tenant); t != "" {
		q.Set("tenant", t)
	}
	if opts.SinceMs > 0 {
		q.Set("since", strconv.FormatInt(opts.SinceMs, 10))
	}
	if opts.UntilMs > 0 {
		q.Set("until", strconv.FormatInt(opts.UntilMs, 10))
	}
	if opts.Limit > 0 {
		q.Set("limit", strconv.FormatInt(opts.Limit, 10))
	}
	var out sdkclient.AuditVerifyResult
	if err := c.do(ctx, "/api/v1/audit/verify", q, bearerToken, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// do is the shared GET-only request path for every typed method.
// Behavior:
//   - Auth (rail #3): bearerToken != "" replaces X-API-Key entirely; else
//     X-API-Key flows through.
//   - Retry (rail #4): 4xx → no retry, surface typed error; 5xx + transport
//     error → bounded exponential backoff capped at retry.Cap, max attempts
//     from retry.MaxAttempts; respects ctx.Done() between attempts.
//   - Response body capped at 16 MiB via io.LimitReader.
//   - Bearer token is NEVER logged.
func (c *APIClient) do(ctx context.Context, path string, query url.Values, bearerToken string, out any) error {
	full := c.baseURL + path
	if len(query) > 0 {
		full += "?" + query.Encode()
	}

	backoff := c.retry.Base
	if backoff <= 0 {
		backoff = DefaultRetryPolicy.Base
	}
	backoffCap := c.retry.Cap
	if backoffCap <= 0 {
		backoffCap = DefaultRetryPolicy.Cap
	}

	var lastErr error
	for attempt := 1; attempt <= c.retry.MaxAttempts; attempt++ {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, full, nil)
		if err != nil {
			return fmt.Errorf("llmchat/apiclient: build request: %w", err)
		}
		req.Header.Set("Accept", "application/json")
		c.applyAuthHeaders(req, bearerToken)
		c.applyContextHeaders(req)

		resp, err := c.httpClient.Do(req)
		if err != nil {
			// Surface ctx errors verbatim so callers can errors.Is.
			if ctx.Err() != nil {
				return ctx.Err()
			}
			lastErr = fmt.Errorf("llmchat/apiclient: GET %s: %w", path, err)
			c.logger.Warn("llmchat/apiclient retry on transport error",
				"method", "GET",
				"path", path,
				"attempt", attempt,
				"max_attempts", c.retry.MaxAttempts,
				"err", err)
			if attempt == c.retry.MaxAttempts {
				return lastErr
			}
			if waitErr := sleepBackoff(ctx, backoff); waitErr != nil {
				return waitErr
			}
			backoff *= 2
			if backoff > backoffCap {
				backoff = backoffCap
			}
			continue
		}

		// Read body up-front (capped at 16 MiB) so we can inspect status
		// before deciding to retry or decode.
		body, readErr := io.ReadAll(io.LimitReader(resp.Body, 1<<24))
		_ = resp.Body.Close()
		if readErr != nil {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			lastErr = fmt.Errorf("llmchat/apiclient: read body: %w", readErr)
			if attempt == c.retry.MaxAttempts {
				return lastErr
			}
			if waitErr := sleepBackoff(ctx, backoff); waitErr != nil {
				return waitErr
			}
			backoff *= 2
			if backoff > backoffCap {
				backoff = backoffCap
			}
			continue
		}

		// 2xx → decode and return.
		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			if out == nil {
				return nil
			}
			if err := json.Unmarshal(body, out); err != nil {
				return fmt.Errorf("llmchat/apiclient: decode body: %w", err)
			}
			return nil
		}

		// 4xx → no retry, surface typed error.
		if resp.StatusCode >= 400 && resp.StatusCode < 500 {
			return classify4xx(resp.StatusCode, body)
		}

		// 5xx → retry.
		lastErr = &ApiServerError{StatusCode: resp.StatusCode, Body: string(body)}
		c.logger.Warn("llmchat/apiclient retry on 5xx",
			"method", "GET",
			"path", path,
			"status", resp.StatusCode,
			"attempt", attempt,
			"max_attempts", c.retry.MaxAttempts)
		if attempt == c.retry.MaxAttempts {
			return lastErr
		}
		if waitErr := sleepBackoff(ctx, backoff); waitErr != nil {
			return waitErr
		}
		backoff *= 2
		if backoff > backoffCap {
			backoff = backoffCap
		}
	}
	if lastErr == nil {
		lastErr = errors.New("llmchat/apiclient: exhausted retries with no error captured")
	}
	return lastErr
}

// applyAuthHeaders mirrors mcpclient.go's auth hierarchy: a non-empty
// bearer token supplants X-API-Key entirely (rail #3).
func (c *APIClient) applyAuthHeaders(req *http.Request, bearerToken string) {
	if bearerToken != "" {
		req.Header.Set("Authorization", "Bearer "+bearerToken)
		req.Header.Del("X-API-Key")
		return
	}
	if c.serviceAPIKey != "" {
		req.Header.Set("X-API-Key", c.serviceAPIKey)
	}
}

// applyContextHeaders attaches tenant + agent identity headers so the
// gateway resolves identity at the auth middleware layer.
func (c *APIClient) applyContextHeaders(req *http.Request) {
	if c.tenantID != "" {
		req.Header.Set("X-Cordum-Tenant", c.tenantID)
	}
	if c.agentID != "" {
		req.Header.Set("X-Agent-Id", c.agentID)
	}
}

// sleepBackoff returns a ctx error if the wait was interrupted; nil
// otherwise. Pulling this into a helper keeps the do() loop readable.
func sleepBackoff(ctx context.Context, d time.Duration) error {
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}
