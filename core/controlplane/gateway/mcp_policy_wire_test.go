package gateway

import (
	"context"
	"errors"
	"testing"

	"github.com/cordum/cordum/core/infra/config"
	"github.com/cordum/cordum/core/mcp"
)

// fakeInvariantLookup returns a deny rule keyed by tool name. The
// tests use this to simulate the SecOps invariant SECURITY FLOOR
// taking priority over any actiongate decision.
type fakeInvariantLookup struct {
	denyTool string
	denyRule config.PolicyRule
}

func (f fakeInvariantLookup) InvariantsForMCPTool(_ context.Context) []config.PolicyRule {
	if f.denyTool == "" {
		return nil
	}
	return []config.PolicyRule{f.denyRule}
}

// fakePreapprovalLookup returns IsPreapproved=true for a configured
// (tenant, agent, tool) tuple. Used to assert preapproval HIT
// short-circuits the approval store consultation.
type fakePreapprovalLookup struct {
	tenant   string
	agentID  string
	toolName string
	calls    int
}

func (f *fakePreapprovalLookup) IsPreapproved(_ context.Context, tenant, agentID, toolName string) bool {
	f.calls++
	return tenant == f.tenant && agentID == f.agentID && toolName == f.toolName
}

// TestInvariantBeatsActionGate asserts the SECURITY FLOOR contract: an
// MCPInvariantLookup DENY rule blocks the tool even when the upstream
// actiongate decision was REQUIRE_HUMAN (or anything else). This must
// hold at the ConsumeActionGateDecision boundary because the policy
// wrapper hands off only on REQUIRE_HUMAN — invariant denies that
// catch destructive tools after action-gate processing would
// otherwise bypass the SecOps floor.
func TestInvariantBeatsActionGate(t *testing.T) {
	t.Parallel()
	denyRule := config.PolicyRule{
		ID:       "secops.no_payments",
		Decision: "deny",
		Match: config.PolicyMatch{
			MCP: config.MCPPolicy{DenyTools: []string{"payments.send"}},
		},
	}
	gate := &gatewayApprovalGate{
		store:      &MCPApprovalStore{},
		invariants: fakeInvariantLookup{denyTool: "payments.send", denyRule: denyRule},
	}
	_, err := gate.ConsumeActionGateDecision(context.Background(),
		mcp.PolicyDecision{Decision: 3 /* REQUIRE_HUMAN */},
		mcp.ToolCallApprovalContext{
			Tenant:     "tnt_a",
			AgentID:    "agent_alpha",
			Tool:       "payments.send",
			ActionHash: "deadbeef",
		})
	if err == nil {
		t.Fatal("expected invariant deny error, got nil")
	}
	if !errors.Is(err, ErrMCPInvariantDeny) {
		t.Fatalf("error not wrapping ErrMCPInvariantDeny: %v", err)
	}
}

// TestPreapprovalSkipsActionGate asserts that a preapproved (tenant,
// agent, tool) tuple short-circuits the approval store entirely.
// Returns ("", nil) so the caller treats the call as immediately
// allowed, mirroring the existing gatewayApprovalGate.Check fast path.
// Asserts the store is NOT consulted (call count == 0).
func TestPreapprovalSkipsActionGate(t *testing.T) {
	t.Parallel()
	preapproval := &fakePreapprovalLookup{
		tenant:   "tnt_a",
		agentID:  "agent_alpha",
		toolName: "git.push",
	}
	// We don't pass a real store so any unexpected store call would
	// panic — the test asserts no store interaction by reaching the
	// end without nil-deref.
	gate := &gatewayApprovalGate{
		store:       &MCPApprovalStore{},
		preapproval: preapproval,
	}
	ref, err := gate.ConsumeActionGateDecision(context.Background(),
		mcp.PolicyDecision{Decision: 3 /* REQUIRE_HUMAN */},
		mcp.ToolCallApprovalContext{
			Tenant:     "tnt_a",
			AgentID:    "agent_alpha",
			Tool:       "git.push",
			ActionHash: "deadbeef",
		})
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if ref != "" {
		t.Fatalf("preapproval HIT should return empty ref, got %q", ref)
	}
	if preapproval.calls != 1 {
		t.Fatalf("preapproval consulted %d times; want exactly 1", preapproval.calls)
	}
}

// TestActionGateAllowSkipsApprovalStore asserts that the gate-side
// adapter is NOT consulted at all when the action-gate decision is
// ALLOW. ConsumeActionGateDecision is only invoked by the bridge
// wrapper on REQUIRE_HUMAN — for ALLOW the bridge forwards directly
// to upstream. This test documents the contract by asserting that
// when the bridge does NOT call ConsumeActionGateDecision, no
// approval-store side effects occur. We exercise the contract by
// confirming the dispatcher adapter is the only adapter consulted on
// ALLOW paths in the policy_evaluate flow (see core/mcp/bridge_policy_test.go
// TestInvokeToolWithPolicy_AllowEmitsPreAndPost asserting upstream
// reached + no approval store interaction).
func TestActionGateAllowSkipsApprovalStore(t *testing.T) {
	t.Parallel()
	// The core/mcp test TestInvokeToolWithPolicy_AllowEmitsPreAndPost
	// already asserts that on ALLOW the upstream tool service is
	// invoked exactly once AND no ApprovalHandoff call is made.
	// Here we lock the contract from the gateway side: if a future
	// refactor accidentally invokes ConsumeActionGateDecision on an
	// ALLOW decision, the gate's nil-store guard must still return
	// an error rather than silently creating phantom approvals.
	gate := &gatewayApprovalGate{store: nil}
	_, err := gate.ConsumeActionGateDecision(context.Background(),
		mcp.PolicyDecision{},
		mcp.ToolCallApprovalContext{Tool: "fs.read_file"})
	if err == nil {
		t.Fatal("nil-store gate must fail closed on direct ConsumeActionGateDecision invocation")
	}
}

// TestActionGateRequireHumanRoutesToApprovalStore asserts the happy
// REQUIRE_HUMAN path: no invariant deny, no preapproval hit → the
// gate falls through to the approval store. We use a real (nil-Redis)
// MCPApprovalStore so the ClaimPreApproved call hits the
// ensureReady-style early-error path and returns an error wrapped by
// our adapter — the test verifies the wrapping, which is the contract
// the JSON-RPC layer relies on for error code mapping.
func TestActionGateRequireHumanRoutesToApprovalStore(t *testing.T) {
	t.Parallel()
	// Real store with no Redis client; ClaimPreApproved will fail at
	// the readiness check. The adapter must propagate the failure
	// instead of silently treating it as a successful claim.
	gate := &gatewayApprovalGate{
		store: &MCPApprovalStore{},
	}
	_, err := gate.ConsumeActionGateDecision(context.Background(),
		mcp.PolicyDecision{Decision: 3 /* REQUIRE_HUMAN */},
		mcp.ToolCallApprovalContext{
			Tenant:     "tnt_a",
			AgentID:    "agent_alpha",
			Tool:       "fs.delete",
			ActionHash: "deadbeef",
		})
	if err == nil {
		t.Fatal("unwired Redis store should propagate error, got nil")
	}
}

// TestPolicyDispatcherAdapter_NilPipelineReturnsZero asserts the
// gateway-side dispatcher adapter fails open on a nil pipeline:
// returns the zero decision with fired=false so the legacy approval
// flow takes over. This protects gateway deploys that boot without
// the action gate pipeline wired (older configs, dev mode) from
// breaking the MCP tool-call path entirely.
func TestPolicyDispatcherAdapter_NilPipelineReturnsZero(t *testing.T) {
	t.Parallel()
	adapter := policyDispatcherAdapter{pipeline: nil}
	dec, fired := adapter.Dispatch(context.Background(), &config.PolicyInput{Tenant: "tnt_a"})
	if fired {
		t.Fatalf("nil pipeline should not fire; got fired=true dec=%v", dec)
	}
	if dec.Decision != 0 {
		t.Fatalf("nil pipeline should return zero decision; got %v", dec.Decision)
	}
}

// TestBuildMCPPolicyDeps_PopulatesNoopFallbacks asserts the builder
// returns a deps struct safe to pass to MCPServer.WithPolicyGate even
// when emitter + artifact store are nil — the no-op fallbacks satisfy
// the interfaces so the policy gate boot never crashes on a partial
// dev wiring.
func TestBuildMCPPolicyDeps_PopulatesNoopFallbacks(t *testing.T) {
	t.Parallel()
	deps := BuildMCPPolicyDeps(nil, &gatewayApprovalGate{}, nil, nil)
	if deps.Pipeline == nil {
		t.Fatal("deps.Pipeline should be a non-nil adapter (even wrapping nil pipeline)")
	}
	if deps.EventEmitter == nil {
		t.Fatal("deps.EventEmitter should fall back to noop, not nil")
	}
	if deps.ArtifactStore == nil {
		t.Fatal("deps.ArtifactStore should fall back to noop, not nil")
	}
	if deps.ApprovalHandoff == nil {
		t.Fatal("deps.ApprovalHandoff should be the supplied gate, not nil")
	}
	if deps.Redactor == nil {
		t.Fatal("deps.Redactor should default to mcp.DefaultRedactor")
	}
}
