package llmchat

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/cordum/cordum/core/mcp"
)

// fakeMCPServer mimics the cordum MCP HTTP transport: a GET /mcp/sse endpoint
// that emits the initial `event: session` frame and keepalives, and a
// POST /mcp/message endpoint that replies synchronously in the response body.
//
// Tests script per-method handlers so each case asserts independently.
type fakeMCPServer struct {
	t              *testing.T
	srv            *httptest.Server
	listToolsCalls atomic.Int32
	initCalls      atomic.Int32
	callToolCalls  atomic.Int32
	mu             sync.Mutex
	toolHandler    func(req *mcp.JSONRPCMessage) *mcp.JSONRPCMessage
	listHandler    func(req *mcp.JSONRPCMessage) *mcp.JSONRPCMessage
	initHandler    func(req *mcp.JSONRPCMessage) *mcp.JSONRPCMessage
	closeOnNextSSE atomic.Bool
	requireAPIKey  string
	sawHeaders     []http.Header
}

func newFakeMCPServer(t *testing.T) *fakeMCPServer {
	t.Helper()
	f := &fakeMCPServer{t: t}
	mux := http.NewServeMux()
	mux.HandleFunc("/mcp/sse", f.handleSSE)
	mux.HandleFunc("/mcp/message", f.handleMessage)
	f.srv = httptest.NewServer(mux)
	t.Cleanup(f.srv.Close)
	return f
}

func (f *fakeMCPServer) URL() string { return f.srv.URL }

func (f *fakeMCPServer) handleSSE(w http.ResponseWriter, r *http.Request) {
	if f.requireAPIKey != "" && r.Header.Get("X-API-Key") != f.requireAPIKey {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "no flush", http.StatusInternalServerError)
		return
	}
	// Mint a fresh session ID per connect so reconnect tests exercise
	// the setSessionID/invalidateSession lifecycle with distinct IDs
	// (regression guard against the close-already-closed panic).
	sessionID := fmt.Sprintf("fake-session-%d", f.initCalls.Load()+f.callToolCalls.Load()+f.listToolsCalls.Load()+1+int32(time.Now().UnixNano()&0xffff))
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("X-MCP-Session-ID", sessionID)
	w.WriteHeader(http.StatusOK)

	initial, _ := json.Marshal(map[string]string{"sessionId": sessionID})
	_, _ = fmt.Fprintf(w, "event: session\ndata: %s\n\n", initial)
	flusher.Flush()

	tick := time.NewTicker(50 * time.Millisecond)
	defer tick.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case <-tick.C:
			if f.closeOnNextSSE.Load() {
				return // simulate gateway-close mid-stream
			}
			_, _ = io.WriteString(w, ": ping\n\n")
			flusher.Flush()
		}
	}
}

func (f *fakeMCPServer) handleMessage(w http.ResponseWriter, r *http.Request) {
	if f.requireAPIKey != "" && r.Header.Get("X-API-Key") != f.requireAPIKey && r.Header.Get("Authorization") == "" {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	f.mu.Lock()
	f.sawHeaders = append(f.sawHeaders, r.Header.Clone())
	f.mu.Unlock()

	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	var req mcp.JSONRPCMessage
	if err := json.Unmarshal(body, &req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	var resp *mcp.JSONRPCMessage
	switch req.Method {
	case mcp.MethodInitialize:
		f.initCalls.Add(1)
		if f.initHandler != nil {
			resp = f.initHandler(&req)
		} else {
			resp = jsonResult(req.ID, mcp.InitializeResult{
				ProtocolVersion: mcp.DefaultProtocolVersion,
				ServerInfo:      mcp.Implementation{Name: "fake-mcp", Version: "0.0.1"},
			})
		}
	case mcp.MethodToolsList:
		f.listToolsCalls.Add(1)
		if f.listHandler != nil {
			resp = f.listHandler(&req)
		} else {
			resp = jsonResult(req.ID, map[string]any{
				"tools": []map[string]string{{"name": "cordum_list_jobs"}},
			})
		}
	case mcp.MethodToolsCall:
		f.callToolCalls.Add(1)
		if f.toolHandler != nil {
			resp = f.toolHandler(&req)
		} else {
			resp = jsonResult(req.ID, mcp.ToolCallResult{
				Content: []mcp.ContentItem{{Type: "text", Text: "ok"}},
			})
		}
	default:
		resp = &mcp.JSONRPCMessage{
			JSONRPC: mcp.JSONRPCVersion,
			ID:      req.ID,
			Error: &mcp.JSONRPCError{
				Code:    -32601,
				Message: "method not found",
			},
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

func jsonResult(id json.RawMessage, payload any) *mcp.JSONRPCMessage {
	raw, _ := json.Marshal(payload)
	return &mcp.JSONRPCMessage{
		JSONRPC: mcp.JSONRPCVersion,
		ID:      id,
		Result:  json.RawMessage(raw),
	}
}

func newClient(t *testing.T, srv *fakeMCPServer, opts ...func(*MCPClientConfig)) *MCPClient {
	t.Helper()
	cfg := MCPClientConfig{
		BaseURL:          srv.URL(),
		APIKey:           srv.requireAPIKey,
		ToolsCacheTTL:    60 * time.Second,
		ReconnectInitial: 20 * time.Millisecond,
		ReconnectMax:     200 * time.Millisecond,
		PostTimeout:      2 * time.Second,
	}
	for _, o := range opts {
		o(&cfg)
	}
	c, err := NewMCPClient(cfg)
	if err != nil {
		t.Fatalf("NewMCPClient: %v", err)
	}
	t.Cleanup(c.Close)
	return c
}

func TestMCPClient_Initialize_RoundTrip(t *testing.T) {
	t.Parallel()
	srv := newFakeMCPServer(t)
	c := newClient(t, srv)

	res, err := c.Initialize(context.Background())
	if err != nil {
		t.Fatalf("Initialize: %v", err)
	}
	if res.ProtocolVersion != mcp.DefaultProtocolVersion {
		t.Errorf("ProtocolVersion = %q, want %q", res.ProtocolVersion, mcp.DefaultProtocolVersion)
	}
	if res.ServerInfo.Name != "fake-mcp" {
		t.Errorf("ServerInfo.Name = %q, want fake-mcp", res.ServerInfo.Name)
	}
	if got := srv.initCalls.Load(); got != 1 {
		t.Errorf("init calls = %d, want 1", got)
	}
}

func TestMCPClient_ListTools_Cached(t *testing.T) {
	t.Parallel()
	srv := newFakeMCPServer(t)
	c := newClient(t, srv)

	if _, err := c.Initialize(context.Background()); err != nil {
		t.Fatalf("Initialize: %v", err)
	}
	if _, err := c.ListTools(context.Background()); err != nil {
		t.Fatalf("ListTools first: %v", err)
	}
	if _, err := c.ListTools(context.Background()); err != nil {
		t.Fatalf("ListTools second: %v", err)
	}
	if got := srv.listToolsCalls.Load(); got != 1 {
		t.Errorf("listTools calls = %d, want 1 (cached)", got)
	}
}

func TestMCPClient_CallTool_Success(t *testing.T) {
	t.Parallel()
	srv := newFakeMCPServer(t)
	srv.toolHandler = func(req *mcp.JSONRPCMessage) *mcp.JSONRPCMessage {
		var p mcp.ToolCallParams
		_ = json.Unmarshal(req.Params, &p)
		return jsonResult(req.ID, mcp.ToolCallResult{
			Content: []mcp.ContentItem{{Type: "text", Text: "tool=" + p.Name}},
		})
	}
	c := newClient(t, srv)
	if _, err := c.Initialize(context.Background()); err != nil {
		t.Fatalf("Initialize: %v", err)
	}

	args := json.RawMessage(`{"limit":5}`)
	res, err := c.CallTool(context.Background(), mcp.ToolListJobs, args, "")
	if err != nil {
		t.Fatalf("CallTool: %v", err)
	}
	if len(res.Content) == 0 || res.Content[0].Text != "tool="+mcp.ToolListJobs {
		t.Fatalf("ToolCallResult = %+v, want tool=%s", res, mcp.ToolListJobs)
	}
	if got := srv.callToolCalls.Load(); got != 1 {
		t.Errorf("callTool calls = %d, want 1", got)
	}
}

func TestMCPClient_CallTool_ApprovalRequired(t *testing.T) {
	t.Parallel()
	srv := newFakeMCPServer(t)
	srv.toolHandler = func(req *mcp.JSONRPCMessage) *mcp.JSONRPCMessage {
		return &mcp.JSONRPCMessage{
			JSONRPC: mcp.JSONRPCVersion,
			ID:      req.ID,
			Error: &mcp.JSONRPCError{
				Code:    -32099,
				Message: "approval required",
				Data: map[string]any{
					"approval_id": "appr-123",
					"reason":      "human review",
					"tool":        "cordum_submit_job",
				},
			},
		}
	}
	c := newClient(t, srv)
	if _, err := c.Initialize(context.Background()); err != nil {
		t.Fatalf("Initialize: %v", err)
	}

	_, err := c.CallTool(context.Background(), "cordum_submit_job", nil, "")
	if !errors.Is(err, ErrApprovalRequired) {
		t.Fatalf("errors.Is(err, ErrApprovalRequired) = false, err=%v", err)
	}
	var ae *ApprovalRequiredError
	if !errors.As(err, &ae) {
		t.Fatalf("errors.As(err, &ApprovalRequiredError) failed, err=%v", err)
	}
	if ae.ApprovalID != "appr-123" {
		t.Errorf("ApprovalID = %q, want appr-123", ae.ApprovalID)
	}
	if ae.Tool != "cordum_submit_job" {
		t.Errorf("Tool = %q, want cordum_submit_job", ae.Tool)
	}
}

func TestMCPClient_CallTool_CtxCancel(t *testing.T) {
	t.Parallel()
	srv := newFakeMCPServer(t)
	srv.toolHandler = func(req *mcp.JSONRPCMessage) *mcp.JSONRPCMessage {
		time.Sleep(150 * time.Millisecond)
		return jsonResult(req.ID, mcp.ToolCallResult{})
	}
	c := newClient(t, srv)
	if _, err := c.Initialize(context.Background()); err != nil {
		t.Fatalf("Initialize: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()

	_, err := c.CallTool(ctx, mcp.ToolListJobs, nil, "")
	if err == nil {
		t.Fatal("expected ctx cancel error, got nil")
	}
	if !errors.Is(err, context.DeadlineExceeded) && !errors.Is(err, context.Canceled) {
		t.Errorf("error = %v, want context.DeadlineExceeded or Canceled", err)
	}
}

func TestMCPClient_Reconnect_AfterServerClose(t *testing.T) {
	t.Parallel()
	srv := newFakeMCPServer(t)
	c := newClient(t, srv)
	if _, err := c.Initialize(context.Background()); err != nil {
		t.Fatalf("Initialize: %v", err)
	}

	// Wait for SSE to connect at least once.
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) && c.SSEConnections() < 1 {
		time.Sleep(20 * time.Millisecond)
	}
	if c.SSEConnections() < 1 {
		t.Fatalf("SSE never connected, count=%d", c.SSEConnections())
	}

	// Tell server to close the next SSE pingtick → forces reconnect.
	srv.closeOnNextSSE.Store(true)
	time.Sleep(120 * time.Millisecond)
	srv.closeOnNextSSE.Store(false)

	// Wait for reconnect to bump the counter.
	deadline = time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) && c.SSEConnections() < 2 {
		time.Sleep(30 * time.Millisecond)
	}
	if c.SSEConnections() < 2 {
		t.Fatalf("SSE did not reconnect, count=%d", c.SSEConnections())
	}

	// Subsequent CallTool succeeds against the same server.
	res, err := c.CallTool(context.Background(), mcp.ToolListJobs, nil, "")
	if err != nil {
		t.Fatalf("CallTool after reconnect: %v", err)
	}
	if len(res.Content) == 0 {
		t.Errorf("post-reconnect ToolCallResult content empty: %+v", res)
	}
}

func TestMCPClient_AuthHierarchy(t *testing.T) {
	t.Parallel()
	srv := newFakeMCPServer(t)
	srv.requireAPIKey = "service-key"
	c := newClient(t, srv)
	if _, err := c.Initialize(context.Background()); err != nil {
		t.Fatalf("Initialize: %v", err)
	}

	// Bearer token must replace X-API-Key (rail #3).
	if _, err := c.CallTool(context.Background(), mcp.ToolListJobs, nil, "delegation-token"); err != nil {
		t.Fatalf("CallTool: %v", err)
	}

	srv.mu.Lock()
	defer srv.mu.Unlock()
	var foundBearer bool
	for _, h := range srv.sawHeaders {
		auth := h.Get("Authorization")
		key := h.Get("X-API-Key")
		if auth == "Bearer delegation-token" {
			foundBearer = true
			if key != "" {
				t.Errorf("when bearer is set, X-API-Key MUST be omitted, got %q", key)
			}
		}
	}
	if !foundBearer {
		t.Errorf("never saw Authorization: Bearer ... header; sawHeaders=%v", len(srv.sawHeaders))
	}
}

func TestMCPClient_SessionIDPropagated(t *testing.T) {
	t.Parallel()
	srv := newFakeMCPServer(t)
	c := newClient(t, srv)
	if _, err := c.Initialize(context.Background()); err != nil {
		t.Fatalf("Initialize: %v", err)
	}

	srv.mu.Lock()
	defer srv.mu.Unlock()
	if len(srv.sawHeaders) == 0 {
		t.Fatal("no headers recorded")
	}
	for i, h := range srv.sawHeaders {
		if got := h.Get("X-MCP-Session-ID"); got == "" {
			t.Errorf("request[%d] X-MCP-Session-ID = empty, want server-minted id", i)
		}
	}
}
