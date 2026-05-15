package actiongates

import (
	"context"

	"github.com/cordum/cordum/core/infra/config"
	pb "github.com/cordum/cordum/core/protocol/pb/v1"
)

// Pipeline runs the action-layer gates in fixed evaluation order:
// tenant → file → url → mcp → mutation → provenance. The ordering is
// deliberate:
//
//   - tenant first: cross-tenant denials short-circuit everything; we don't
//     want a target_path check leaking that resource exists in another tenant.
//   - file / url: enforce egress + filesystem invariants before tool-/MCP-
//     specific logic that might rely on them.
//   - mcp: validate tool/server/resource scope before evaluating mutations
//     so a non-allowlisted MCP server is rejected without revealing approval
//     state for its tools.
//   - mutation: approval+self-approval+expiry+consumption checks.
//   - provenance: chain-evidence verification — last because it depends on
//     the approval record the mutation gate already validated.
//
// A gate may return a zero decision (Decision == UNSPECIFIED) to signal
// "does not apply to this input"; the pipeline simply continues. An
// ALLOW or ALLOW_WITH_CONSTRAINTS lets subsequent gates run because
// each gate enforces a different invariant. Any other decision
// (DENY / REQUIRE_HUMAN / THROTTLE) short-circuits.
type Pipeline struct {
	gates []ActionGate
}

// NewPipeline returns a pipeline with the supplied gates in evaluation
// order. nil gates are filtered out so deployments can omit a gate
// (e.g. provenance gate when an approval store is not yet wired) by
// passing nil rather than wrapping the option struct in conditional
// build logic.
func NewPipeline(gates ...ActionGate) *Pipeline {
	if len(gates) == 0 {
		return &Pipeline{}
	}
	out := make([]ActionGate, 0, len(gates))
	for _, g := range gates {
		if g == nil {
			continue
		}
		out = append(out, g)
	}
	return &Pipeline{gates: out}
}

// Gates returns a shallow copy of the registered gates in evaluation
// order. Exposed for observability (admin endpoints, tests) — never
// mutate the returned slice.
func (p *Pipeline) Gates() []ActionGate {
	if p == nil || len(p.gates) == 0 {
		return nil
	}
	out := make([]ActionGate, len(p.gates))
	copy(out, p.gates)
	return out
}

// Run evaluates each gate in order. It returns (decision, true) on the
// first non-allow decision and short-circuits the remaining gates.
// A nil pipeline / nil input / Action-less input returns the zero
// decision with fired=false so callers can fall through to legacy
// rule evaluation without an action-layer ambiguity.
func (p *Pipeline) Run(ctx context.Context, in *config.PolicyInput) (ActionGateDecision, bool) {
	if p == nil || len(p.gates) == 0 {
		return ActionGateDecision{}, false
	}
	if in == nil || in.Action == nil {
		return ActionGateDecision{}, false
	}
	for _, g := range p.gates {
		select {
		case <-ctx.Done():
			return ActionGateDecision{
				Decision:  pb.DecisionType_DECISION_TYPE_DENY,
				GateID:    g.ID(),
				Code:      CodeInternalError,
				Reason:    "context canceled before pipeline completed",
				SubReason: "context_canceled",
				Extra:     map[string]string{"gate": g.ID(), "sub_reason": "context_canceled"},
			}, true
		default:
		}
		dec := g.Evaluate(ctx, in)
		if !dec.Fired() {
			continue
		}
		if dec.Allowed() {
			// ALLOW / ALLOW_WITH_CONSTRAINTS lets subsequent gates run.
			// Each gate enforces a different invariant and a downstream
			// gate may still produce a non-allow decision for the same
			// input.
			continue
		}
		return dec, true
	}
	return ActionGateDecision{}, false
}
