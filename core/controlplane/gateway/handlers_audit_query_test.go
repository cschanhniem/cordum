package gateway

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"github.com/cordum/cordum/core/audit"
)

// seedChainWithActions appends one event per action string so query tests
// can assert per-type filtering. Order of return matches order of
// actions argument.
func seedChainWithActions(t *testing.T, s *server, tenant string, actions []string) []audit.SIEMEvent {
	t.Helper()
	chainer := audit.NewChainer(s.redisClient(), "")
	out := make([]audit.SIEMEvent, 0, len(actions))
	for i, action := range actions {
		ev := audit.SIEMEvent{
			EventType: audit.EventSafetyDecision,
			Severity:  audit.SeverityInfo,
			TenantID:  tenant,
			Action:    action,
			JobID:     "job-" + strconv.Itoa(i),
		}
		if err := chainer.Append(context.Background(), &ev); err != nil {
			t.Fatalf("seed append[%d]: %v", i, err)
		}
		out = append(out, ev)
	}
	return out
}

func TestHandleAuditQuery_HappyPathNoFilter(t *testing.T) {
	s, _, _ := newTestGateway(t)
	seedChainWithActions(t, s, "default", []string{"a", "b", "c"})

	req := adminCtx(httptest.NewRequest(http.MethodGet, "/api/v1/audit/query?tenant=default", nil))
	rec := httptest.NewRecorder()
	s.handleAuditQuery(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200: %s", rec.Code, rec.Body.String())
	}
	var resp auditQueryResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.Total != 3 || len(resp.Items) != 3 {
		t.Fatalf("Total=%d Items=%d, want 3/3", resp.Total, len(resp.Items))
	}
	for i, want := range []string{"a", "b", "c"} {
		if got := resp.Items[i].Event.Action; got != want {
			t.Errorf("item %d action = %q, want %q", i, got, want)
		}
		if resp.Items[i].StreamID == "" {
			t.Errorf("item %d StreamID empty", i)
		}
	}
	if resp.NextCursor != "" {
		t.Errorf("NextCursor = %q, want empty when last page", resp.NextCursor)
	}
}

func TestHandleAuditQuery_FiltersByEventType(t *testing.T) {
	s, _, _ := newTestGateway(t)
	seedChainWithActions(t, s, "default", []string{"chat.bootstrap_registered", "mcp.tool_invocation", "chat.bootstrap_registered", "policy.deny"})

	req := adminCtx(httptest.NewRequest(http.MethodGet,
		"/api/v1/audit/query?tenant=default&type=chat.bootstrap_registered", nil))
	rec := httptest.NewRecorder()
	s.handleAuditQuery(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200: %s", rec.Code, rec.Body.String())
	}
	var resp auditQueryResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.Total != 2 {
		t.Fatalf("Total = %d, want 2 (only chat.bootstrap_registered)", resp.Total)
	}
	for i, item := range resp.Items {
		if item.Event.Action != "chat.bootstrap_registered" {
			t.Errorf("item %d action = %q, want chat.bootstrap_registered", i, item.Event.Action)
		}
	}
}

func TestHandleAuditQuery_PaginatesViaCursor(t *testing.T) {
	s, _, _ := newTestGateway(t)
	const total = 7
	actions := make([]string, total)
	for i := range actions {
		actions[i] = "x"
	}
	seedChainWithActions(t, s, "default", actions)

	// Page 1: limit=3 — expect 3 items + a non-empty NextCursor.
	req1 := adminCtx(httptest.NewRequest(http.MethodGet,
		"/api/v1/audit/query?tenant=default&limit=3", nil))
	rec1 := httptest.NewRecorder()
	s.handleAuditQuery(rec1, req1)
	if rec1.Code != http.StatusOK {
		t.Fatalf("page 1 status = %d, body=%s", rec1.Code, rec1.Body.String())
	}
	var page1 auditQueryResponse
	if err := json.NewDecoder(rec1.Body).Decode(&page1); err != nil {
		t.Fatalf("page 1 decode: %v", err)
	}
	if len(page1.Items) != 3 || page1.NextCursor == "" {
		t.Fatalf("page 1: items=%d, cursor=%q (want 3 items + cursor)", len(page1.Items), page1.NextCursor)
	}

	// Page 2: cursor=<last seen>, limit=3 — expect next 3 items.
	req2 := adminCtx(httptest.NewRequest(http.MethodGet,
		"/api/v1/audit/query?tenant=default&limit=3&cursor="+page1.NextCursor, nil))
	rec2 := httptest.NewRecorder()
	s.handleAuditQuery(rec2, req2)
	if rec2.Code != http.StatusOK {
		t.Fatalf("page 2 status = %d, body=%s", rec2.Code, rec2.Body.String())
	}
	var page2 auditQueryResponse
	if err := json.NewDecoder(rec2.Body).Decode(&page2); err != nil {
		t.Fatalf("page 2 decode: %v", err)
	}
	if len(page2.Items) != 3 {
		t.Fatalf("page 2: items=%d, want 3", len(page2.Items))
	}

	// Page 3: continuing — expect the final 1 item, no further cursor.
	req3 := adminCtx(httptest.NewRequest(http.MethodGet,
		"/api/v1/audit/query?tenant=default&limit=3&cursor="+page2.NextCursor, nil))
	rec3 := httptest.NewRecorder()
	s.handleAuditQuery(rec3, req3)
	if rec3.Code != http.StatusOK {
		t.Fatalf("page 3 status = %d, body=%s", rec3.Code, rec3.Body.String())
	}
	var page3 auditQueryResponse
	if err := json.NewDecoder(rec3.Body).Decode(&page3); err != nil {
		t.Fatalf("page 3 decode: %v", err)
	}
	if len(page3.Items) != 1 || page3.NextCursor != "" {
		t.Fatalf("page 3: items=%d, cursor=%q (want 1 item + empty cursor)", len(page3.Items), page3.NextCursor)
	}

	// All cursors must produce a strictly-increasing partition: union of
	// the three pages' stream IDs equals the seeded total with no
	// duplicates and no gaps.
	seen := map[string]bool{}
	for _, p := range []auditQueryResponse{page1, page2, page3} {
		for _, it := range p.Items {
			if seen[it.StreamID] {
				t.Fatalf("duplicate stream id %q across pages", it.StreamID)
			}
			seen[it.StreamID] = true
		}
	}
	if len(seen) != total {
		t.Fatalf("paginated union = %d events, seeded %d", len(seen), total)
	}
}

func TestHandleAuditQuery_RejectsInvalidLimit(t *testing.T) {
	s, _, _ := newTestGateway(t)

	for _, raw := range []string{"abc", "0", "-5"} {
		req := adminCtx(httptest.NewRequest(http.MethodGet,
			"/api/v1/audit/query?tenant=default&limit="+raw, nil))
		rec := httptest.NewRecorder()
		s.handleAuditQuery(rec, req)
		if rec.Code != http.StatusBadRequest {
			t.Errorf("limit=%q: status = %d, want 400", raw, rec.Code)
		}
	}
}

func TestHandleAuditQuery_RejectsInvalidSinceUntil(t *testing.T) {
	s, _, _ := newTestGateway(t)

	cases := []struct {
		name string
		path string
	}{
		{"since-non-numeric", "/api/v1/audit/query?tenant=default&since=yesterday"},
		{"until-non-numeric", "/api/v1/audit/query?tenant=default&until=tomorrow"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			req := adminCtx(httptest.NewRequest(http.MethodGet, c.path, nil))
			rec := httptest.NewRecorder()
			s.handleAuditQuery(rec, req)
			if rec.Code != http.StatusBadRequest {
				t.Errorf("status = %d, want 400 (body=%s)", rec.Code, rec.Body.String())
			}
		})
	}
}

func TestHandleAuditQuery_CapsLimit(t *testing.T) {
	s, _, _ := newTestGateway(t)
	// Seed more than the cap so we can verify the cap is enforced.
	actions := make([]string, auditQueryMaxLimit+10)
	for i := range actions {
		actions[i] = "x"
	}
	seedChainWithActions(t, s, "default", actions)

	req := adminCtx(httptest.NewRequest(http.MethodGet,
		"/api/v1/audit/query?tenant=default&limit=100000", nil))
	rec := httptest.NewRecorder()
	s.handleAuditQuery(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var resp auditQueryResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(resp.Items) > auditQueryMaxLimit {
		t.Fatalf("Items=%d, want <= %d (auditQueryMaxLimit)", len(resp.Items), auditQueryMaxLimit)
	}
}

func TestHandleAuditQuery_EmptyChainReturnsEmptyItems(t *testing.T) {
	s, _, _ := newTestGateway(t)
	// No seed.

	req := adminCtx(httptest.NewRequest(http.MethodGet, "/api/v1/audit/query?tenant=default", nil))
	rec := httptest.NewRecorder()
	s.handleAuditQuery(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200: %s", rec.Code, rec.Body.String())
	}
	var resp auditQueryResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.Total != 0 || len(resp.Items) != 0 || resp.NextCursor != "" {
		t.Errorf("empty chain: Total=%d Items=%d Cursor=%q, want 0/0/\"\"", resp.Total, len(resp.Items), resp.NextCursor)
	}
}
