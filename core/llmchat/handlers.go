package llmchat

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

// redisPinger is the slice of *redis.Client we exercise in /readyz.
// Splitting the dependency out of the concrete type lets tests pass a
// miniredis-backed client without dragging the full Redis surface into
// the handler tests; production wiring still uses *redis.Client.
type redisPinger interface {
	Ping(ctx context.Context) *redis.StatusCmd
}

// Handlers exposes the cordum-llm-chat process-level HTTP handlers
// (/healthz, /readyz). Phase 1 of epic-ac495830 keeps the surface
// intentionally small — chat endpoints, session admin, and audit
// emitters land in follow-up tasks.
type Handlers struct {
	provider Provider
	redis    redisPinger
	timeout  time.Duration
}

// NewHandlers wires a Handlers from its dependencies. The timeout
// caps each individual readiness probe so a slow vLLM cannot stall
// the reverse proxy in front of the service.
func NewHandlers(provider Provider, redisClient *redis.Client, probeTimeout time.Duration) *Handlers {
	if probeTimeout <= 0 {
		probeTimeout = 2 * time.Second
	}
	return &Handlers{
		provider: provider,
		redis:    redisClient,
		timeout:  probeTimeout,
	}
}

// healthBody is the payload returned by /healthz.
type healthBody struct {
	Status  string `json:"status"`
	Service string `json:"service"`
}

// readyBody is the payload returned by /readyz. The fields are pinned
// because the dashboard chat-button availability gate (epic rail #5)
// keys off the `vllm` field — renaming it would silently break the
// widget's hide-on-unhealthy logic.
type readyBody struct {
	Status string `json:"status"`
	Redis  string `json:"redis"`
	Vllm   string `json:"vllm"`
}

// Healthz reports liveness. It does not consult dependencies — that
// is /readyz's job — so a transient backend hiccup does not flap a
// liveness probe and force a pod restart.
func (h *Handlers) Healthz(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, healthBody{
		Status:  "ok",
		Service: "cordum-llm-chat",
	})
}

// Readyz reports readiness. It probes Redis and the LLM provider in
// parallel under a per-probe deadline; if either fails the service
// reports 503 so upstreams can drain traffic. The body's `redis` and
// `vllm` fields carry the per-component result so an operator can
// see which dependency is degraded.
func (h *Handlers) Readyz(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	body := readyBody{Status: "ok", Redis: "ok", Vllm: "ok"}

	var (
		wg       sync.WaitGroup
		mu       sync.Mutex
		redisErr error
		vllmErr  error
	)

	if h.redis != nil {
		wg.Add(1)
		go func() {
			defer wg.Done()
			probeCtx, cancel := context.WithTimeout(ctx, h.timeout)
			defer cancel()
			if err := h.redis.Ping(probeCtx).Err(); err != nil {
				mu.Lock()
				redisErr = err
				mu.Unlock()
			}
		}()
	} else {
		body.Redis = "fail: redis client not configured"
	}

	if h.provider != nil {
		wg.Add(1)
		go func() {
			defer wg.Done()
			probeCtx, cancel := context.WithTimeout(ctx, h.timeout)
			defer cancel()
			if err := h.provider.HealthCheck(probeCtx); err != nil {
				mu.Lock()
				vllmErr = err
				mu.Unlock()
			}
		}()
	} else {
		body.Vllm = "fail: provider not configured"
	}

	wg.Wait()

	if redisErr != nil {
		body.Redis = "fail: " + redisErr.Error()
	}
	if vllmErr != nil {
		body.Vllm = "fail: " + vllmErr.Error()
	}

	status := http.StatusOK
	if body.Redis != "ok" || body.Vllm != "ok" {
		status = http.StatusServiceUnavailable
		body.Status = "degraded"
	}
	writeJSON(w, status, body)
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		slog.Warn("llmchat: encode response failed", "error", err)
	}
}
