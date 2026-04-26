package gateway

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/cordum/cordum/core/controlplane/gateway/policybundles"
	"github.com/cordum/cordum/core/infra/config"
	"github.com/cordum/cordum/core/model"
	"google.golang.org/protobuf/encoding/protojson"
)

func (d submitPolicyDecision) auditVerdict() string {
	switch {
	case d.ApprovalRequired:
		return "require_approval"
	case d.Throttled:
		return "throttle"
	case d.Denied:
		return "deny"
	case d.Constraints != nil:
		return "constrain"
	default:
		return "allow"
	}
}

func (d submitPolicyDecision) auditExtra(topic string, labels map[string]string) map[string]string {
	base := map[string]string{}
	if topic = strings.TrimSpace(topic); topic != "" {
		base["topic"] = topic
	}
	if d.ApprovalRequired {
		base["approval_status"] = string(model.ApprovalStatusPending)
	}
	if d.Constraints != nil {
		if raw, err := protojson.Marshal(d.Constraints); err == nil && len(raw) > 0 && string(raw) != "null" {
			base["constraints"] = string(raw)
		}
	}
	return mergeStringMap(base, config.DelegationAuditExtras(config.DelegationContextFromLabels(labels)))
}

// safetyDecisionWireValue maps the audit verdict (allow/deny/constrain/
// throttle/require_approval) to the wire-format token surfaced in the
// /api/v1/jobs response. Downstream HTTP consumers (CordClaw daemon,
// any other policy-aware client) read these to mirror the gRPC
// SafetyClient decision contract without needing a second round trip.
func safetyDecisionWireValue(verdict string) string {
	switch verdict {
	case "allow":
		return "ALLOW"
	case "deny":
		return "DENY"
	case "constrain":
		return "CONSTRAIN"
	case "throttle":
		return "THROTTLE"
	case "require_approval":
		return "REQUIRE_HUMAN"
	default:
		return strings.ToUpper(verdict)
	}
}

// safetyDecisionResponseFields surfaces the synchronous policy-decision
// fields needed by HTTP /api/v1/jobs callers that govern downstream
// actions. Callers that don't care simply ignore unknown keys; existing
// job_id/trace_id consumers see no behavioral change.
//
// approvalRef is the job id of the approval-required record, or empty
// when the decision didn't require human approval.
func safetyDecisionResponseFields(decision submitPolicyDecision, approvalRef string) map[string]any {
	fields := map[string]any{
		"safety_decision": safetyDecisionWireValue(decision.auditVerdict()),
	}
	if reason := strings.TrimSpace(decision.Reason); reason != "" {
		fields["safety_reason"] = reason
	}
	if rule := strings.TrimSpace(decision.RuleId); rule != "" {
		fields["safety_rule_id"] = rule
	}
	if snap := strings.TrimSpace(decision.PolicySnapshot); snap != "" {
		fields["safety_snapshot"] = snap
	}
	if decision.Constraints != nil {
		if raw, err := protojson.Marshal(decision.Constraints); err == nil && len(raw) > 0 && string(raw) != "null" {
			fields["constraints"] = json.RawMessage(raw)
		}
	}
	if ref := strings.TrimSpace(approvalRef); ref != "" {
		fields["approval_ref"] = ref
	}
	return fields
}

// mergeResponseFields merges src into dst (dst wins on key collision so
// existing fields like job_id are preserved). Returns dst for chaining
// at the writeJSON call site.
func mergeResponseFields(dst, src map[string]any) map[string]any {
	for k, v := range src {
		if _, exists := dst[k]; exists {
			continue
		}
		dst[k] = v
	}
	return dst
}

func (s *server) appendSubmitSafetyDecisionAudit(
	ctx context.Context,
	action string,
	jobID string,
	topic string,
	actorID string,
	role string,
	message string,
	decision submitPolicyDecision,
	labels map[string]string,
	agentID string,
	agentName string,
	agentRiskTier string,
) {
	_ = s.appendPolicyAudit(ctx, policybundles.PolicyAuditEntry{
		Action:        action,
		ResourceType:  "job",
		ResourceID:    strings.TrimSpace(jobID),
		ResourceName:  strings.TrimSpace(topic),
		ActorID:       strings.TrimSpace(actorID),
		Role:          strings.TrimSpace(role),
		Message:       strings.TrimSpace(message),
		Reason:        strings.TrimSpace(decision.Reason),
		Decision:      decision.auditVerdict(),
		MatchedRule:   strings.TrimSpace(decision.RuleId),
		PolicyVersion: snapshotBase(strings.TrimSpace(decision.PolicySnapshot)),
		Extra:         decision.auditExtra(topic, labels),
		AgentID:       strings.TrimSpace(agentID),
		AgentName:     strings.TrimSpace(agentName),
		AgentRiskTier: strings.TrimSpace(agentRiskTier),
	})
}
