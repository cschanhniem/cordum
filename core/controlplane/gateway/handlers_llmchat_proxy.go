package gateway

import (
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"

	"github.com/cordum/cordum/core/controlplane/gateway/auth"
)

const (
	envLLMChatURL           = "CORDUM_LLM_CHAT_URL"
	envLLMChatForwardAPIKey = "CORDUM_LLM_CHAT_FORWARD_API_KEY" // #nosec G101 -- environment variable name only.
	defaultLLMChatURL       = "http://llm-chat:8090"
	llmChatFeatureName      = "llm_chat_assistant"
)

// handleLLMChatProxy keeps the browser-facing chat API on the gateway origin
// while preserving the cordum-llm-chat trust boundary: the gateway remains the
// only component that authenticates the user, then forwards a service API key
// plus trusted identity headers to the chat service.
func (s *server) handleLLMChatProxy(w http.ResponseWriter, r *http.Request) {
	if !s.requireFeatureEntitlement(w, llmChatFeatureName, "LLM chat assistant requires an Enterprise license") {
		return
	}

	upstream, err := llmChatUpstreamURL()
	if err != nil {
		slog.Warn("llmchat proxy upstream invalid", "error", err)
		writeErrorJSON(w, http.StatusServiceUnavailable, "llm chat upstream unavailable")
		return
	}
	forwardKey := llmChatForwardAPIKey()
	if forwardKey == "" {
		slog.Error("llmchat proxy forward key missing")
		writeErrorJSON(w, http.StatusServiceUnavailable, "llm chat upstream unavailable")
		return
	}

	proxy := httputil.NewSingleHostReverseProxy(upstream)
	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		req.URL.Path = llmChatUpstreamPath(upstream, r.URL.Path)
		req.URL.RawPath = ""
		if r.URL.Path == "/api/v1/chat/healthz" {
			req.URL.RawQuery = ""
		}
		req.Host = upstream.Host

		// Do not pass end-user credentials to the private service. Replace them
		// with the gateway->llm-chat service key and identity headers derived
		// from the authenticated gateway context.
		req.Header.Del("Authorization")
		req.Header.Set("X-API-Key", forwardKey)
		req.Header.Set("X-Cordum-Tenant", tenantFromRequest(r))
		if authCtx := auth.FromRequest(r); authCtx != nil {
			req.Header.Set("X-Cordum-Principal", strings.TrimSpace(authCtx.PrincipalID))
			req.Header.Set("X-Cordum-Role", strings.TrimSpace(authCtx.Role))
			if authCtx.AllowCrossTenant {
				req.Header.Set("X-Cordum-Allow-Cross-Tenant", "true")
			} else {
				req.Header.Del("X-Cordum-Allow-Cross-Tenant")
			}
		} else {
			req.Header.Del("X-Cordum-Principal")
			req.Header.Del("X-Cordum-Role")
			req.Header.Del("X-Cordum-Allow-Cross-Tenant")
		}
	}
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		if r.URL.Path == "/readyz" || r.URL.Path == "/api/v1/chat/healthz" {
			// The dashboard probes every 10s and the llmchat compose profile is
			// often disabled on non-GPU developer machines. Return unavailable
			// without warning-level log spam; the hidden button is the signal.
			slog.Debug("llmchat readiness proxy unavailable", "error", err)
			writeErrorJSON(w, http.StatusServiceUnavailable, "llm chat upstream unavailable")
			return
		}
		slog.Warn("llmchat proxy request failed", "path", r.URL.Path, "error", err)
		writeErrorJSON(w, http.StatusBadGateway, "llm chat upstream unavailable")
	}
	proxy.ServeHTTP(w, r)
}

func llmChatUpstreamURL() (*url.URL, error) {
	raw := strings.TrimSpace(os.Getenv(envLLMChatURL))
	if raw == "" {
		raw = defaultLLMChatURL
	}
	parsed, err := url.Parse(raw)
	if err != nil {
		return nil, err
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return nil, fmt.Errorf("unsupported scheme %q", parsed.Scheme)
	}
	if strings.TrimSpace(parsed.Host) == "" {
		return nil, fmt.Errorf("missing host")
	}
	return parsed, nil
}

func llmChatForwardAPIKey() string {
	if key := strings.TrimSpace(os.Getenv(envLLMChatForwardAPIKey)); key != "" {
		return key
	}
	return strings.TrimSpace(os.Getenv("CORDUM_API_KEY"))
}

func llmChatUpstreamPath(upstream *url.URL, requestPath string) string {
	if requestPath == "/api/v1/chat/healthz" {
		return joinURLPath(upstream.Path, "/readyz")
	}
	return joinURLPath(upstream.Path, requestPath)
}

func joinURLPath(base, path string) string {
	switch {
	case base == "":
		if strings.HasPrefix(path, "/") {
			return path
		}
		return "/" + path
	case strings.HasSuffix(base, "/") && strings.HasPrefix(path, "/"):
		return base + strings.TrimPrefix(path, "/")
	case !strings.HasSuffix(base, "/") && !strings.HasPrefix(path, "/"):
		return base + "/" + path
	default:
		return base + path
	}
}
