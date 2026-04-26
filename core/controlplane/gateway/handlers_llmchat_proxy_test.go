package gateway

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/cordum/cordum/core/controlplane/gateway/auth"
	"github.com/cordum/cordum/core/licensing"
)

func TestHandleLLMChatProxyHealthForwardsReadyzWithTrustedIdentity(t *testing.T) {
	s, _, _ := newTestGateway(t)
	setTestEntitlements(t, s, licensing.PlanEnterprise, func(entitlements *licensing.Entitlements) {
		entitlements.LLMChatAssistant = true
	})

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/readyz" {
			t.Fatalf("upstream path = %q, want /readyz", r.URL.Path)
		}
		if got := r.Header.Get("X-API-Key"); got != "forward-key" {
			t.Fatalf("X-API-Key = %q, want forward-key", got)
		}
		if got := r.Header.Get("X-Cordum-Tenant"); got != "tenant-a" {
			t.Fatalf("X-Cordum-Tenant = %q, want tenant-a", got)
		}
		if got := r.Header.Get("X-Cordum-Principal"); got != "alice" {
			t.Fatalf("X-Cordum-Principal = %q, want alice", got)
		}
		if got := r.Header.Get("X-Cordum-Role"); got != "operator" {
			t.Fatalf("X-Cordum-Role = %q, want operator", got)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok","redis":"ok","vllm":"ok"}`))
	}))
	defer upstream.Close()

	t.Setenv(envLLMChatURL, upstream.URL)
	t.Setenv(envLLMChatForwardAPIKey, "forward-key")

	authCtx := &auth.AuthContext{
		Tenant:      "tenant-a",
		PrincipalID: "alice",
		Role:        "operator",
	}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/chat/healthz", nil)
	req = req.WithContext(context.WithValue(req.Context(), auth.ContextKey{}, authCtx))
	rec := httptest.NewRecorder()

	s.handleLLMChatProxy(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 body=%s", rec.Code, rec.Body.String())
	}
	if rec.Body.String() != `{"status":"ok","redis":"ok","vllm":"ok"}` {
		t.Fatalf("body = %q", rec.Body.String())
	}
}

func TestHandleLLMChatProxyRequiresEntitlementBeforeForwarding(t *testing.T) {
	s, _, _ := newTestGateway(t)
	setTestEntitlements(t, s, licensing.PlanCommunity, func(entitlements *licensing.Entitlements) {
		entitlements.LLMChatAssistant = false
	})

	called := false
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	}))
	defer upstream.Close()

	t.Setenv(envLLMChatURL, upstream.URL)
	t.Setenv(envLLMChatForwardAPIKey, "forward-key")

	req := httptest.NewRequest(http.MethodGet, "/api/v1/chat/healthz", nil)
	rec := httptest.NewRecorder()

	s.handleLLMChatProxy(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403 body=%s", rec.Code, rec.Body.String())
	}
	if called {
		t.Fatal("upstream was called despite missing entitlement")
	}
}
