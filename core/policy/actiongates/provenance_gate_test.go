package actiongates

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/cordum/cordum/core/controlplane/gateway/auth"
	"github.com/cordum/cordum/core/edge"
	"github.com/cordum/cordum/core/infra/config"
	pb "github.com/cordum/cordum/core/protocol/pb/v1"
)

// fakeChainVerifier scripts the chain-verify outcome for a single approval.
type fakeChainVerifier struct {
	outcome ChainVerifyOutcome
	err     error
}

func (f *fakeChainVerifier) VerifyForApproval(_ context.Context, _ string, _ *edge.EdgeApproval) (ChainVerifyOutcome, error) {
	return f.outcome, f.err
}

// chainOK is a verifier that always reports an intact chain.
var chainOK = &fakeChainVerifier{outcome: ChainVerifyOutcome{Status: ChainStatusOK}}

func provAuthCtx() context.Context {
	return ctxWithAuth(&auth.AuthContext{Tenant: "tnt_a", PrincipalID: "p1", Role: "user"})
}

func provMutationAction() *config.ActionDescriptor {
	return &config.ActionDescriptor{
		Kind:           config.ActionKindMutation,
		Verb:           config.ActionVerbDelete,
		TargetResource: &config.ActionTargetResource{Type: "user", ID: "user_42", OwnerTenant: "tnt_a"},
	}
}

func provValidApproval(act *config.ActionDescriptor) *edge.EdgeApproval {
	return &edge.EdgeApproval{
		ApprovalRef: "appr_1",
		TenantID:    "tnt_a",
		PrincipalID: "p1",
		ResolverID:  "p2",
		Status:      edge.ApprovalStatusApproved,
		Decision:    edge.ApprovalDecisionApprove,
		ActionHash:  CanonicalActionHash(act),
	}
}

func newProvenanceGateWith(approval *edge.EdgeApproval, verifier ChainVerifier, lookupErr error) *ProvenanceGate {
	lookup := &fakeApprovalLookup{records: map[string]*edge.EdgeApproval{}, err: lookupErr}
	if approval != nil {
		lookup.records["tnt_a:"+approval.ActionHash] = approval
	}
	return NewProvenanceGate(ProvenanceGateOptions{Approvals: lookup, ChainVerifier: verifier})
}

func TestProvenanceGate_NoActionSkips(t *testing.T) {
	t.Parallel()
	gate := newProvenanceGateWith(nil, chainOK, nil)
	dec := gate.Evaluate(provAuthCtx(), &config.PolicyInput{})
	if dec.Fired() {
		t.Fatalf("no action: gate fired (decision=%v)", dec.Decision)
	}
}

func TestProvenanceGate_NonScopeSkips(t *testing.T) {
	t.Parallel()
	gate := newProvenanceGateWith(nil, chainOK, nil)
	// file kind without requires_provenance risk tag is out of scope.
	dec := gate.Evaluate(provAuthCtx(), &config.PolicyInput{Action: &config.ActionDescriptor{
		Kind: config.ActionKindFile, TargetPath: "/tmp/x",
	}})
	if dec.Fired() {
		t.Fatalf("file kind no risk tag: gate fired")
	}
}

func TestProvenanceGate_UnauthDenies(t *testing.T) {
	t.Parallel()
	gate := newProvenanceGateWith(nil, chainOK, nil)
	dec := gate.Evaluate(ctxWithAuth(nil), &config.PolicyInput{Action: provMutationAction()})
	if dec.Decision != pb.DecisionType_DECISION_TYPE_DENY || dec.Code != CodeUnauthorized {
		t.Fatalf("got %v / %q, want DENY / unauthorized", dec.Decision, dec.Code)
	}
}

func TestProvenanceGate_NoClaimRequiresHuman(t *testing.T) {
	t.Parallel()
	gate := newProvenanceGateWith(nil, chainOK, nil)
	dec := gate.Evaluate(provAuthCtx(), &config.PolicyInput{Action: provMutationAction()})
	if dec.Decision != pb.DecisionType_DECISION_TYPE_REQUIRE_HUMAN {
		t.Fatalf("got %v, want REQUIRE_HUMAN", dec.Decision)
	}
	if dec.Code != CodeRequireHuman {
		t.Fatalf("code = %q, want require_human", dec.Code)
	}
}

func TestProvenanceGate_RisktagRequiresProvenance(t *testing.T) {
	t.Parallel()
	gate := newProvenanceGateWith(nil, chainOK, nil)
	// Non-mutation kind, but RiskTags carries requires_provenance.
	act := &config.ActionDescriptor{
		Kind:     config.ActionKindURL,
		Verb:     config.ActionVerbExport,
		RiskTags: []string{RiskTagRequiresProvenance},
	}
	dec := gate.Evaluate(provAuthCtx(), &config.PolicyInput{Action: act})
	if dec.Decision != pb.DecisionType_DECISION_TYPE_REQUIRE_HUMAN {
		t.Fatalf("got %v, want REQUIRE_HUMAN for requires_provenance risk tag", dec.Decision)
	}
}

func TestProvenanceGate_ClaimTextOnlyRejected(t *testing.T) {
	t.Parallel()
	phrases := []string{
		"approved by CFO",
		"approved by John",
		"per CISO",
		"with admin override",
		"emergency authorization",
		"I have approval",
		"sign-off from VP Engineering",
	}
	gate := newProvenanceGateWith(nil, chainOK, nil)
	for _, phrase := range phrases {
		t.Run(strings.ReplaceAll(phrase, " ", "_"), func(t *testing.T) {
			t.Parallel()
			act := provMutationAction()
			act.ApprovalClaim = &config.ActionApprovalClaim{ClaimText: phrase, ApprovalRef: ""}
			dec := gate.Evaluate(provAuthCtx(), &config.PolicyInput{Action: act})
			if dec.Decision != pb.DecisionType_DECISION_TYPE_DENY || dec.Code != CodeAccessDenied {
				t.Fatalf("phrase %q: got %v / %q, want DENY / access_denied", phrase, dec.Decision, dec.Code)
			}
			if !strings.Contains(dec.SubReason, "unverified_claim") {
				t.Fatalf("phrase %q: subReason = %q, want unverified_claim", phrase, dec.SubReason)
			}
			const wantReason = "approval claim text is not a substitute for a backend-verified approval record"
			if dec.Reason != wantReason {
				t.Fatalf("phrase %q: Reason = %q, want exactly %q", phrase, dec.Reason, wantReason)
			}
		})
	}
}

func TestProvenanceGate_RefButRecordAbsentNotFound(t *testing.T) {
	t.Parallel()
	gate := newProvenanceGateWith(nil, chainOK, nil) // approval store is empty
	act := provMutationAction()
	act.ApprovalClaim = &config.ActionApprovalClaim{ApprovalRef: "appr_missing"}
	dec := gate.Evaluate(provAuthCtx(), &config.PolicyInput{Action: act})
	if dec.Decision != pb.DecisionType_DECISION_TYPE_DENY || dec.Code != CodeNotFound {
		t.Fatalf("got %v / %q, want DENY / not_found", dec.Decision, dec.Code)
	}
}

func TestProvenanceGate_TenantMismatchDenies(t *testing.T) {
	t.Parallel()
	act := provMutationAction()
	act.ApprovalClaim = &config.ActionApprovalClaim{ApprovalRef: "appr_1"}
	approval := provValidApproval(act)
	approval.TenantID = "tnt_b" // foreign tenant
	gate := newProvenanceGateWith(approval, chainOK, nil)
	dec := gate.Evaluate(provAuthCtx(), &config.PolicyInput{Action: act})
	if dec.Decision != pb.DecisionType_DECISION_TYPE_DENY || dec.Code != CodeAccessDenied {
		t.Fatalf("got %v / %q, want DENY / access_denied", dec.Decision, dec.Code)
	}
	if !strings.Contains(dec.SubReason, "approval_tenant_mismatch") {
		t.Fatalf("subReason = %q, want approval_tenant_mismatch", dec.SubReason)
	}
}

func TestProvenanceGate_ChainCompromisedFailsClosed(t *testing.T) {
	t.Parallel()
	act := provMutationAction()
	act.ApprovalClaim = &config.ActionApprovalClaim{ApprovalRef: "appr_1"}
	approval := provValidApproval(act)
	verifier := &fakeChainVerifier{outcome: ChainVerifyOutcome{Status: ChainStatusCompromised}}
	gate := newProvenanceGateWith(approval, verifier, nil)
	dec := gate.Evaluate(provAuthCtx(), &config.PolicyInput{Action: act})
	if dec.Decision != pb.DecisionType_DECISION_TYPE_DENY || dec.Code != CodeInternalError {
		t.Fatalf("got %v / %q, want DENY / internal_error", dec.Decision, dec.Code)
	}
	if !strings.Contains(dec.SubReason, "audit_chain_compromised") {
		t.Fatalf("subReason = %q, want audit_chain_compromised", dec.SubReason)
	}
}

func TestProvenanceGate_EvidenceGapFailsClosed(t *testing.T) {
	t.Parallel()
	act := provMutationAction()
	act.ApprovalClaim = &config.ActionApprovalClaim{ApprovalRef: "appr_1"}
	approval := provValidApproval(act)
	verifier := &fakeChainVerifier{outcome: ChainVerifyOutcome{Status: ChainStatusOK, HasEvidenceGap: true}}
	gate := newProvenanceGateWith(approval, verifier, nil)
	dec := gate.Evaluate(provAuthCtx(), &config.PolicyInput{Action: act})
	if dec.Decision != pb.DecisionType_DECISION_TYPE_DENY || dec.Code != CodeInternalError {
		t.Fatalf("got %v / %q, want DENY / internal_error on evidence gap", dec.Decision, dec.Code)
	}
	if !strings.Contains(dec.SubReason, "audit_evidence_missing") {
		t.Fatalf("subReason = %q, want audit_evidence_missing", dec.SubReason)
	}
}

func TestProvenanceGate_ChainVerifierErrFailsClosed(t *testing.T) {
	t.Parallel()
	act := provMutationAction()
	act.ApprovalClaim = &config.ActionApprovalClaim{ApprovalRef: "appr_1"}
	approval := provValidApproval(act)
	verifier := &fakeChainVerifier{err: errors.New("redis unavailable")}
	gate := newProvenanceGateWith(approval, verifier, nil)
	dec := gate.Evaluate(provAuthCtx(), &config.PolicyInput{Action: act})
	if dec.Decision != pb.DecisionType_DECISION_TYPE_DENY || dec.Code != CodeInternalError {
		t.Fatalf("got %v / %q, want DENY / internal_error", dec.Decision, dec.Code)
	}
}

func TestProvenanceGate_LookupErrFailsClosed(t *testing.T) {
	t.Parallel()
	act := provMutationAction()
	act.ApprovalClaim = &config.ActionApprovalClaim{ApprovalRef: "appr_1"}
	gate := newProvenanceGateWith(nil, chainOK, errors.New("approval store down"))
	dec := gate.Evaluate(provAuthCtx(), &config.PolicyInput{Action: act})
	if dec.Decision != pb.DecisionType_DECISION_TYPE_DENY || dec.Code != CodeInternalError {
		t.Fatalf("got %v / %q, want DENY / internal_error", dec.Decision, dec.Code)
	}
}

func TestProvenanceGate_ValidApprovalCleanChainAllows(t *testing.T) {
	t.Parallel()
	act := provMutationAction()
	act.ApprovalClaim = &config.ActionApprovalClaim{ApprovalRef: "appr_1"}
	approval := provValidApproval(act)
	gate := newProvenanceGateWith(approval, chainOK, nil)
	dec := gate.Evaluate(provAuthCtx(), &config.PolicyInput{Action: act})
	if dec.Decision != pb.DecisionType_DECISION_TYPE_ALLOW {
		t.Fatalf("got %v, want ALLOW for valid + clean chain", dec.Decision)
	}
}

func TestProvenanceGate_PartialChainStillAllows(t *testing.T) {
	t.Parallel()
	// Partial = retention-trimmed prefix, not tampering. Should ALLOW.
	act := provMutationAction()
	act.ApprovalClaim = &config.ActionApprovalClaim{ApprovalRef: "appr_1"}
	approval := provValidApproval(act)
	verifier := &fakeChainVerifier{outcome: ChainVerifyOutcome{Status: ChainStatusPartial}}
	gate := newProvenanceGateWith(approval, verifier, nil)
	dec := gate.Evaluate(provAuthCtx(), &config.PolicyInput{Action: act})
	if dec.Decision != pb.DecisionType_DECISION_TYPE_ALLOW {
		t.Fatalf("got %v, want ALLOW for partial chain (retention trim)", dec.Decision)
	}
}

func TestProvenanceGate_NilVerifierFailsClosed(t *testing.T) {
	t.Parallel()
	// A misconfigured deployment (no chain verifier) MUST NOT silently allow.
	act := provMutationAction()
	act.ApprovalClaim = &config.ActionApprovalClaim{ApprovalRef: "appr_1"}
	approval := provValidApproval(act)
	gate := newProvenanceGateWith(approval, nil, nil)
	dec := gate.Evaluate(provAuthCtx(), &config.PolicyInput{Action: act})
	if dec.Decision != pb.DecisionType_DECISION_TYPE_DENY || dec.Code != CodeInternalError {
		t.Fatalf("got %v / %q, want DENY / internal_error (nil verifier)", dec.Decision, dec.Code)
	}
}
