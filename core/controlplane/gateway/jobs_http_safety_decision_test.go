package gateway

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	pb "github.com/cordum/cordum/core/protocol/pb/v1"
)

// These tests pin the synchronous safety-decision contract on the
// /api/v1/jobs HTTP response. CordClaw's daemon (Cord-Claw repo,
// task-db841006) and any other policy-aware HTTP client read these
// fields to mirror the gRPC SafetyClient decision contract.
//
// The contract (per safetyDecisionResponseFields):
//   - safety_decision: ALLOW | DENY | CONSTRAIN | REQUIRE_HUMAN | THROTTLE
//   - safety_reason   (omitted when empty)
//   - safety_rule_id  (omitted when empty)
//   - safety_snapshot (omitted when empty)
//   - constraints     (omitted when nil; protojson-encoded PolicyConstraints)
//   - approval_ref    (only on REQUIRE_HUMAN; equals job_id of the approval)
//
// Any change to these field names or values is a breaking API change
// that requires bumping CordClaw + downstream consumers in lockstep.

func decodeJobsResponse(t *testing.T, body []byte) map[string]any {
	t.Helper()
	var resp map[string]any
	if err := json.Unmarshal(body, &resp); err != nil {
		t.Fatalf("decode response: %v\nbody: %s", err, body)
	}
	return resp
}

func submitJobsHTTPRequest(t *testing.T, s *server, payload map[string]any) *httptest.ResponseRecorder {
	t.Helper()
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/jobs", bytes.NewReader(body))
	req.Header.Set("X-Tenant-ID", "default")
	rec := httptest.NewRecorder()
	s.handleSubmitJobHTTP(rec, req)
	return rec
}

func TestJobsHTTP_ResponseSurfacesSafetyDecision_Allow(t *testing.T) {
	s, _, safety := newTestGateway(t)
	s.tenant = "default"
	safety.setResponse(&pb.PolicyCheckResponse{
		Decision:       pb.DecisionType_DECISION_TYPE_ALLOW,
		Reason:         "ok",
		PolicySnapshot: "snap-allow-1",
		RuleId:         "rule-allow",
	})

	rec := submitJobsHTTPRequest(t, s, map[string]any{
		"prompt": "hello",
		"topic":  "job.test",
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	resp := decodeJobsResponse(t, rec.Body.Bytes())
	if got := resp["safety_decision"]; got != "ALLOW" {
		t.Errorf("safety_decision = %v, want ALLOW", got)
	}
	if got := resp["safety_reason"]; got != "ok" {
		t.Errorf("safety_reason = %v, want ok", got)
	}
	if got := resp["safety_snapshot"]; got != "snap-allow-1" {
		t.Errorf("safety_snapshot = %v, want snap-allow-1", got)
	}
	if got := resp["safety_rule_id"]; got != "rule-allow" {
		t.Errorf("safety_rule_id = %v, want rule-allow", got)
	}
	if _, ok := resp["constraints"]; ok {
		t.Errorf("constraints should be absent for plain ALLOW, got %v", resp["constraints"])
	}
	if _, ok := resp["approval_ref"]; ok {
		t.Errorf("approval_ref should be absent for ALLOW, got %v", resp["approval_ref"])
	}
}

func TestJobsHTTP_ResponseSurfacesSafetyDecision_Constrain(t *testing.T) {
	s, _, safety := newTestGateway(t)
	s.tenant = "default"
	safety.setResponse(&pb.PolicyCheckResponse{
		Decision:       pb.DecisionType_DECISION_TYPE_ALLOW_WITH_CONSTRAINTS,
		Reason:         "redact secrets",
		PolicySnapshot: "snap-constrain-2",
		RuleId:         "rule-redact",
		Constraints: &pb.PolicyConstraints{
			RedactionLevel: "strict",
		},
	})

	rec := submitJobsHTTPRequest(t, s, map[string]any{
		"prompt": "hello",
		"topic":  "job.test",
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	resp := decodeJobsResponse(t, rec.Body.Bytes())
	if got := resp["safety_decision"]; got != "CONSTRAIN" {
		t.Errorf("safety_decision = %v, want CONSTRAIN (non-nil constraints folds ALLOW_WITH_CONSTRAINTS into constrain verdict)", got)
	}
	cobj, ok := resp["constraints"].(map[string]any)
	if !ok {
		t.Fatalf("constraints should be a JSON object on CONSTRAIN, got %T = %v", resp["constraints"], resp["constraints"])
	}
	// protojson uses lowerCamelCase by default for proto3 message fields.
	got, hasCamel := cobj["redactionLevel"].(string)
	if !hasCamel {
		got, _ = cobj["redaction_level"].(string)
	}
	if got != "strict" {
		t.Errorf("constraints.redactionLevel = %v, want strict (keys: %v)", got, keysOf(cobj))
	}
}

func TestJobsHTTP_ResponseSurfacesSafetyDecision_Deny(t *testing.T) {
	s, _, safety := newTestGateway(t)
	s.tenant = "default"
	safety.setResponse(&pb.PolicyCheckResponse{
		Decision:       pb.DecisionType_DECISION_TYPE_DENY,
		Reason:         "prohibited",
		PolicySnapshot: "snap-deny-3",
		RuleId:         "rule-deny",
	})

	rec := submitJobsHTTPRequest(t, s, map[string]any{
		"prompt": "hello",
		"topic":  "job.test",
	})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status=%d body=%s want 403", rec.Code, rec.Body.String())
	}
	resp := decodeJobsResponse(t, rec.Body.Bytes())
	if got := resp["safety_decision"]; got != "DENY" {
		t.Errorf("safety_decision = %v, want DENY", got)
	}
	if got := resp["safety_reason"]; got != "prohibited" {
		t.Errorf("safety_reason = %v, want prohibited", got)
	}
	if got := resp["safety_rule_id"]; got != "rule-deny" {
		t.Errorf("safety_rule_id = %v, want rule-deny", got)
	}
	if got, ok := resp["job_id"].(string); !ok || got == "" {
		t.Errorf("job_id should still be present on deny, got %v", resp["job_id"])
	}
}

func TestJobsHTTP_ResponseSurfacesSafetyDecision_Throttle(t *testing.T) {
	s, _, safety := newTestGateway(t)
	s.tenant = "default"
	safety.setResponse(&pb.PolicyCheckResponse{
		Decision:       pb.DecisionType_DECISION_TYPE_THROTTLE,
		Reason:         "rate limit exceeded",
		PolicySnapshot: "snap-throttle-4",
		RuleId:         "rule-throttle",
	})

	rec := submitJobsHTTPRequest(t, s, map[string]any{
		"prompt": "hello",
		"topic":  "job.test",
	})
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("status=%d body=%s want 429", rec.Code, rec.Body.String())
	}
	if rec.Header().Get("Retry-After") == "" {
		t.Errorf("Retry-After header should be set on throttle")
	}
	resp := decodeJobsResponse(t, rec.Body.Bytes())
	if got := resp["safety_decision"]; got != "THROTTLE" {
		t.Errorf("safety_decision = %v, want THROTTLE", got)
	}
	if got := resp["safety_reason"]; got != "rate limit exceeded" {
		t.Errorf("safety_reason = %v, want 'rate limit exceeded'", got)
	}
}

func TestJobsHTTP_ResponseSurfacesSafetyDecision_RequireHuman(t *testing.T) {
	s, _, safety := newTestGateway(t)
	s.tenant = "default"
	safety.setResponse(&pb.PolicyCheckResponse{
		Decision:         pb.DecisionType_DECISION_TYPE_REQUIRE_HUMAN,
		Reason:           "high-risk action",
		PolicySnapshot:   "snap-approval-5",
		RuleId:           "rule-approval",
		ApprovalRequired: true,
	})

	rec := submitJobsHTTPRequest(t, s, map[string]any{
		"prompt": "hello",
		"topic":  "job.test",
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s want 200 (approval_required is success-shape)", rec.Code, rec.Body.String())
	}
	resp := decodeJobsResponse(t, rec.Body.Bytes())
	if got := resp["safety_decision"]; got != "REQUIRE_HUMAN" {
		t.Errorf("safety_decision = %v, want REQUIRE_HUMAN", got)
	}
	if got := resp["status"]; got != "approval_required" {
		t.Errorf("status = %v, want approval_required (legacy compat field)", got)
	}
	jobID, _ := resp["job_id"].(string)
	if jobID == "" {
		t.Fatalf("job_id missing from approval response")
	}
	if got, _ := resp["approval_ref"].(string); got != jobID {
		t.Errorf("approval_ref = %v, want %v (= job_id)", resp["approval_ref"], jobID)
	}
}

func TestJobsHTTP_NoSafetyClient_StillEmitsAllow(t *testing.T) {
	// When the gateway has no safety client wired (offline fixture),
	// evaluateSubmitPolicy returns Allowed=true with empty fields. The
	// response should still surface safety_decision: "ALLOW" so HTTP
	// clients have a uniform decision-extraction code path.
	s, _, _ := newTestGateway(t)
	s.tenant = "default"
	s.safetyClient = nil

	rec := submitJobsHTTPRequest(t, s, map[string]any{
		"prompt": "hello",
		"topic":  "job.test",
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	resp := decodeJobsResponse(t, rec.Body.Bytes())
	if got := resp["safety_decision"]; got != "ALLOW" {
		t.Errorf("safety_decision = %v, want ALLOW (no-safety-client default)", got)
	}
	if _, ok := resp["safety_reason"]; ok {
		t.Errorf("safety_reason should be absent when policyResult.Reason is empty")
	}
}

// safetyDecisionWireValue mapping smoke test — locks down the
// audit-verdict → wire-token bijection used by CordClaw.
func TestSafetyDecisionWireValue(t *testing.T) {
	cases := map[string]string{
		"allow":            "ALLOW",
		"deny":             "DENY",
		"constrain":        "CONSTRAIN",
		"throttle":         "THROTTLE",
		"require_approval": "REQUIRE_HUMAN",
	}
	for verdict, wire := range cases {
		if got := safetyDecisionWireValue(verdict); got != wire {
			t.Errorf("safetyDecisionWireValue(%q) = %q, want %q", verdict, got, wire)
		}
	}
}

// safetyDecisionResponseFields shape test — ensures empty fields are
// omitted (so consumers can use simple `if v, ok := resp[k]; ok` guards
// rather than checking for empty strings).
func TestSafetyDecisionResponseFields_OmitsEmpty(t *testing.T) {
	d := submitPolicyDecision{Allowed: true}
	fields := safetyDecisionResponseFields(d, "")
	if got := fields["safety_decision"]; got != "ALLOW" {
		t.Errorf("safety_decision = %v, want ALLOW", got)
	}
	for _, key := range []string{"safety_reason", "safety_rule_id", "safety_snapshot", "constraints", "approval_ref"} {
		if _, ok := fields[key]; ok {
			t.Errorf("%s should be absent on empty decision, got %v", key, fields[key])
		}
	}
}

func keysOf(m map[string]any) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}
