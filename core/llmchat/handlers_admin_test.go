package llmchat

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	gatewayauth "github.com/cordum/cordum/core/controlplane/gateway/auth"
)

func withLLMAuth(req *http.Request, tenant, principal, role string, crossTenant bool) *http.Request {
	ctx := context.WithValue(req.Context(), gatewayauth.ContextKey{}, &gatewayauth.AuthContext{
		Tenant: tenant, PrincipalID: principal, Role: role, AllowCrossTenant: crossTenant,
	})
	return req.WithContext(ctx)
}

func TestChatAdminListPermissionAndTenantScope(t *testing.T) {
	sessions := newFakeChatSessionStore()
	seedSession(t, sessions, "sess-a", "tenant-a", "alice")
	seedSession(t, sessions, "sess-b", "tenant-b", "bob")

	h := newTestChatHandlers(&scriptedChatRunner{}, sessions, true)
	h.permissions = fakePermissionEnforcer{allow: false}
	rr := httptest.NewRecorder()
	h.HandleListSessions(rr, withLLMAuth(httptest.NewRequest(http.MethodGet, "/api/v1/chat/sessions", nil), "tenant-a", "alice", "viewer", false))
	if rr.Code != http.StatusForbidden {
		t.Fatalf("non-admin status=%d body=%s want 403", rr.Code, rr.Body.String())
	}

	h.permissions = fakePermissionEnforcer{allow: true}
	rr = httptest.NewRecorder()
	h.HandleListSessions(rr, withLLMAuth(httptest.NewRequest(http.MethodGet, "/api/v1/chat/sessions", nil), "tenant-a", "admin-a", "admin", false))
	if rr.Code != http.StatusOK {
		t.Fatalf("tenant admin status=%d body=%s", rr.Code, rr.Body.String())
	}
	var tenantResp SessionListPage
	if err := json.NewDecoder(rr.Body).Decode(&tenantResp); err != nil {
		t.Fatalf("decode tenant list: %v", err)
	}
	if len(tenantResp.Items) != 1 || tenantResp.Items[0].ID != "sess-a" {
		t.Fatalf("tenant admin items=%+v want only sess-a", tenantResp.Items)
	}

	rr = httptest.NewRecorder()
	h.HandleListSessions(rr, withLLMAuth(httptest.NewRequest(http.MethodGet, "/api/v1/chat/sessions", nil), "tenant-a", "root", "admin", true))
	var globalResp SessionListPage
	if err := json.NewDecoder(rr.Body).Decode(&globalResp); err != nil {
		t.Fatalf("decode global list: %v", err)
	}
	if len(globalResp.Items) != 2 {
		t.Fatalf("global items=%+v want both tenants", globalResp.Items)
	}
}

func TestChatAdminDetailTranscriptAndCrossTenantNotFound(t *testing.T) {
	sessions := newFakeChatSessionStore()
	sess := seedSession(t, sessions, "sess-b", "tenant-b", "bob")
	sess.Messages = []SessionMessage{{Role: "user", Text: "hello"}, {Role: "assistant", Text: "hi"}}
	sessions.byID[sess.ID] = sess

	h := newTestChatHandlers(&scriptedChatRunner{}, sessions, true)
	h.permissions = fakePermissionEnforcer{allow: true}

	rr := httptest.NewRecorder()
	h.HandleGetSession(rr, withLLMAuth(httptest.NewRequest(http.MethodGet, "/api/v1/chat/sessions/sess-b", nil), "tenant-a", "admin-a", "admin", false), "sess-b")
	if rr.Code != http.StatusNotFound || strings.Contains(rr.Body.String(), "forbidden") {
		t.Fatalf("cross-tenant status/body=%d %s want 404 not forbidden", rr.Code, rr.Body.String())
	}

	rr = httptest.NewRecorder()
	h.HandleGetSession(rr, withLLMAuth(httptest.NewRequest(http.MethodGet, "/api/v1/chat/sessions/sess-b", nil), "tenant-a", "root", "admin", true), "sess-b")
	if rr.Code != http.StatusOK {
		t.Fatalf("global detail status=%d body=%s", rr.Code, rr.Body.String())
	}
	var got Session
	if err := json.NewDecoder(rr.Body).Decode(&got); err != nil {
		t.Fatalf("decode detail: %v", err)
	}
	if got.ID != "sess-b" || len(got.Messages) != 2 {
		t.Fatalf("detail=%+v want full transcript", got)
	}
}

func TestChatAdminRejectsSpoofedAdminHeadersWithoutTrustedAuth(t *testing.T) {
	sessions := newFakeChatSessionStore()
	seedSession(t, sessions, "sess-a", "tenant-a", "alice")

	h := newTestChatHandlers(&scriptedChatRunner{}, sessions, true)

	listReq := httptest.NewRequest(http.MethodGet, "/api/v1/chat/sessions", nil)
	listReq.Header.Set("X-Role", "admin")
	listReq.Header.Set("X-Cordum-Role", "admin")
	listReq.Header.Set("X-Cordum-Global-Admin", "true")
	list := httptest.NewRecorder()
	h.HandleListSessions(list, listReq)
	if list.Code != http.StatusForbidden {
		t.Fatalf("spoofed list status=%d body=%s want 403", list.Code, list.Body.String())
	}

	detailReq := httptest.NewRequest(http.MethodGet, "/api/v1/chat/sessions/sess-a", nil)
	detailReq.Header.Set("X-Role", "admin")
	detailReq.Header.Set("X-Cordum-Role", "admin")
	detailReq.Header.Set("X-Cordum-Global-Admin", "true")
	detail := httptest.NewRecorder()
	h.HandleGetSession(detail, detailReq, "sess-a")
	if detail.Code != http.StatusForbidden {
		t.Fatalf("spoofed detail status=%d body=%s want 403", detail.Code, detail.Body.String())
	}
}

func TestChatAdminFailsClosedWithoutPermissionChecker(t *testing.T) {
	sessions := newFakeChatSessionStore()
	seedSession(t, sessions, "sess-a", "tenant-a", "alice")

	h := newTestChatHandlers(&scriptedChatRunner{}, sessions, true)
	req := withLLMAuth(httptest.NewRequest(http.MethodGet, "/api/v1/chat/sessions", nil), "tenant-a", "admin-a", "admin", false)
	rr := httptest.NewRecorder()
	h.HandleListSessions(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Fatalf("trusted admin without permission checker status=%d body=%s want 403", rr.Code, rr.Body.String())
	}
}

func seedSession(t *testing.T, store *fakeChatSessionStore, id, tenant, principal string) *Session {
	t.Helper()
	sess, err := store.Create(context.Background(), Session{ID: id, Tenant: tenant, UserPrincipal: principal, AgentID: "chat-assistant"})
	if err != nil {
		t.Fatalf("seed %s: %v", id, err)
	}
	return &sess
}
