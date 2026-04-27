package main

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"testing"

	capsdk "github.com/cordum-io/cap/v2/sdk/go"
)

type fakeAgentRegistry struct {
	lookupResp *capsdk.AgentIdentity
	lookupErr  error
	setErr     error

	lookupCalls  int
	lookupName   string
	lookupTenant string
	setCalls     int
	updates      []capsdk.AgentScopeUpdate
}

func (f *fakeAgentRegistry) Lookup(_ context.Context, name, tenant string) (*capsdk.AgentIdentity, error) {
	f.lookupCalls++
	f.lookupName = name
	f.lookupTenant = tenant
	if f.lookupErr != nil {
		return nil, f.lookupErr
	}
	return f.lookupResp, nil
}

func (f *fakeAgentRegistry) SetScope(_ context.Context, update capsdk.AgentScopeUpdate) error {
	f.setCalls++
	f.updates = append(f.updates, update)
	return f.setErr
}

func withFakeAgentRegistry(t *testing.T, fake *fakeAgentRegistry) {
	t.Helper()
	orig := newAgentRegistry
	newAgentRegistry = func(*flagSet) (AgentRegistry, error) {
		return fake, nil
	}
	t.Cleanup(func() { newAgentRegistry = orig })
}

func runAgentSetScopeForTest(t *testing.T, fake *fakeAgentRegistry, args ...string) (string, error) {
	t.Helper()
	withFakeAgentRegistry(t, fake)
	var err error
	stdout := captureStdout(t, func() {
		err = runAgentSetScopeE(args)
	})
	return stdout, err
}

func agentIdentityForScope(id string, allowed, preapproved []string) *capsdk.AgentIdentity {
	return &capsdk.AgentIdentity{
		ID:                       id,
		Name:                     "chat-assistant",
		AllowedTools:             append([]string{}, allowed...),
		PreapprovedMutatingTools: append([]string{}, preapproved...),
	}
}

func requireOneScopeUpdate(t *testing.T, fake *fakeAgentRegistry) capsdk.AgentScopeUpdate {
	t.Helper()
	if fake.setCalls != 1 {
		t.Fatalf("SetScope calls = %d, want 1", fake.setCalls)
	}
	if len(fake.updates) != 1 {
		t.Fatalf("recorded updates = %d, want 1", len(fake.updates))
	}
	return fake.updates[0]
}

func TestAgentSetScope_ReplacesAllowedToolsPreservesPreapproved(t *testing.T) {
	fake := &fakeAgentRegistry{
		lookupResp: agentIdentityForScope("agent-123", []string{"old"}, []string{"cordum_submit_job"}),
	}

	_, err := runAgentSetScopeForTest(t, fake, "chat-assistant", "--allowed-tools", "cordum_list_jobs,cordum_get_job")
	if err != nil {
		t.Fatalf("runAgentSetScopeE returned error: %v", err)
	}

	if fake.lookupCalls != 1 || fake.lookupName != "chat-assistant" || fake.lookupTenant != "default" {
		t.Fatalf("Lookup = calls:%d name:%q tenant:%q, want 1/chat-assistant/default", fake.lookupCalls, fake.lookupName, fake.lookupTenant)
	}
	got := requireOneScopeUpdate(t, fake)
	if got.AgentID != "agent-123" {
		t.Fatalf("AgentID = %q, want agent-123", got.AgentID)
	}
	if !reflect.DeepEqual(got.AllowedTools, []string{"cordum_list_jobs", "cordum_get_job"}) {
		t.Fatalf("AllowedTools = %#v", got.AllowedTools)
	}
	if !reflect.DeepEqual(got.PreapprovedMutatingTools, []string{"cordum_submit_job"}) {
		t.Fatalf("PreapprovedMutatingTools = %#v, want preserved submit tool", got.PreapprovedMutatingTools)
	}
}

func TestAgentSetScope_ReplacesPreapprovedMutatingToolsOnly(t *testing.T) {
	fake := &fakeAgentRegistry{
		lookupResp: agentIdentityForScope("agent-123", []string{"cordum_list_jobs"}, []string{"old_submit"}),
	}

	_, err := runAgentSetScopeForTest(t, fake, "chat-assistant", "--preapproved-mutating-tools", "cordum_submit_job")
	if err != nil {
		t.Fatalf("runAgentSetScopeE returned error: %v", err)
	}

	got := requireOneScopeUpdate(t, fake)
	if got.AllowedTools != nil {
		t.Fatalf("AllowedTools = %#v, want nil/leave-unchanged", got.AllowedTools)
	}
	if !reflect.DeepEqual(got.PreapprovedMutatingTools, []string{"cordum_submit_job"}) {
		t.Fatalf("PreapprovedMutatingTools = %#v", got.PreapprovedMutatingTools)
	}
}

func TestAgentSetScope_EmptyPreapprovedValueClears(t *testing.T) {
	fake := &fakeAgentRegistry{
		lookupResp: agentIdentityForScope("agent-123", []string{"cordum_list_jobs"}, []string{"cordum_submit_job"}),
	}

	_, err := runAgentSetScopeForTest(t, fake, "chat-assistant", "--preapproved-mutating-tools", "")
	if err != nil {
		t.Fatalf("runAgentSetScopeE returned error: %v", err)
	}

	got := requireOneScopeUpdate(t, fake)
	if got.PreapprovedMutatingTools == nil {
		t.Fatal("PreapprovedMutatingTools = nil, want non-nil empty slice for explicit revoke")
	}
	if len(got.PreapprovedMutatingTools) != 0 {
		t.Fatalf("PreapprovedMutatingTools = %#v, want empty", got.PreapprovedMutatingTools)
	}
}

func TestAgentSetScope_AddToolMergesAndPreservesPreapproved(t *testing.T) {
	fake := &fakeAgentRegistry{
		lookupResp: agentIdentityForScope("agent-123", []string{"cordum_list_jobs", "cordum_get_job"}, []string{"cordum_submit_job"}),
	}

	_, err := runAgentSetScopeForTest(t, fake, "chat-assistant", "--add-tool", "cordum_status")
	if err != nil {
		t.Fatalf("runAgentSetScopeE returned error: %v", err)
	}

	got := requireOneScopeUpdate(t, fake)
	if !reflect.DeepEqual(got.AllowedTools, []string{"cordum_list_jobs", "cordum_get_job", "cordum_status"}) {
		t.Fatalf("AllowedTools = %#v", got.AllowedTools)
	}
	if !reflect.DeepEqual(got.PreapprovedMutatingTools, []string{"cordum_submit_job"}) {
		t.Fatalf("PreapprovedMutatingTools = %#v, want preserved", got.PreapprovedMutatingTools)
	}
}

func TestAgentSetScope_RemoveToolMergesAndPreservesPreapproved(t *testing.T) {
	fake := &fakeAgentRegistry{
		lookupResp: agentIdentityForScope("agent-123", []string{"a", "b", "c"}, []string{"cordum_submit_job"}),
	}

	_, err := runAgentSetScopeForTest(t, fake, "chat-assistant", "--remove-tool", "b")
	if err != nil {
		t.Fatalf("runAgentSetScopeE returned error: %v", err)
	}

	got := requireOneScopeUpdate(t, fake)
	if !reflect.DeepEqual(got.AllowedTools, []string{"a", "c"}) {
		t.Fatalf("AllowedTools = %#v, want [a c]", got.AllowedTools)
	}
	if !reflect.DeepEqual(got.PreapprovedMutatingTools, []string{"cordum_submit_job"}) {
		t.Fatalf("PreapprovedMutatingTools = %#v, want preserved", got.PreapprovedMutatingTools)
	}
}

func TestAgentSetScope_DryRunPrintsResultAndDoesNotCallSetScope(t *testing.T) {
	fake := &fakeAgentRegistry{
		lookupResp: agentIdentityForScope("agent-123", []string{"a"}, []string{"cordum_submit_job"}),
	}

	stdout, err := runAgentSetScopeForTest(t, fake, "chat-assistant", "--add-tool", "b", "--dry-run")
	if err != nil {
		t.Fatalf("runAgentSetScopeE returned error: %v", err)
	}
	if fake.setCalls != 0 {
		t.Fatalf("SetScope calls = %d, want 0 for dry-run", fake.setCalls)
	}
	for _, want := range []string{`"agent_id"`, `"allowed_tools"`, `"a"`, `"b"`, `"preapproved_mutating_tools"`, `"cordum_submit_job"`} {
		if !strings.Contains(stdout, want) {
			t.Fatalf("dry-run stdout missing %q:\n%s", want, stdout)
		}
	}
}

func TestAgentSetScope_IdempotencyKeyPassedThrough(t *testing.T) {
	fake := &fakeAgentRegistry{
		lookupResp: agentIdentityForScope("agent-123", nil, []string{"cordum_submit_job"}),
	}

	_, err := runAgentSetScopeForTest(t, fake, "chat-assistant", "--allowed-tools", "a", "--idempotency-key", "scope-123")
	if err != nil {
		t.Fatalf("runAgentSetScopeE returned error: %v", err)
	}

	got := requireOneScopeUpdate(t, fake)
	if got.IdempotencyKey != "scope-123" {
		t.Fatalf("IdempotencyKey = %q, want scope-123", got.IdempotencyKey)
	}
}

func TestAgentSetScope_UUIDSkipsLookupAndRequiresPreapprovedExplicit(t *testing.T) {
	const agentID = "123e4567-e89b-12d3-a456-426614174000"
	fake := &fakeAgentRegistry{}

	_, err := runAgentSetScopeForTest(t, fake, agentID, "--allowed-tools", "a", "--preapproved-mutating-tools", "cordum_submit_job")
	if err != nil {
		t.Fatalf("runAgentSetScopeE returned error: %v", err)
	}
	if fake.lookupCalls != 0 {
		t.Fatalf("Lookup calls = %d, want 0 for UUID fast-path", fake.lookupCalls)
	}
	got := requireOneScopeUpdate(t, fake)
	if got.AgentID != agentID {
		t.Fatalf("AgentID = %q, want raw UUID %q", got.AgentID, agentID)
	}

	missingPreapproved := &fakeAgentRegistry{}
	_, err = runAgentSetScopeForTest(t, missingPreapproved, agentID, "--allowed-tools", "a")
	if err == nil || !strings.Contains(err.Error(), "cannot preserve preapproved") {
		t.Fatalf("error = %v, want cannot-preserve-preapproved error", err)
	}
	if missingPreapproved.lookupCalls != 0 || missingPreapproved.setCalls != 0 {
		t.Fatalf("UUID missing-preapproved path should not Lookup/SetScope, got lookup=%d set=%d", missingPreapproved.lookupCalls, missingPreapproved.setCalls)
	}
}

func TestAgentSetScope_IDDetectionAvoidsAgentNameFalsePositive(t *testing.T) {
	tests := []struct {
		name  string
		value string
		want  bool
	}{
		{name: "bare uuid", value: "123e4567-e89b-12d3-a456-426614174000", want: true},
		{name: "prefixed uuid", value: "agent-123e4567-e89b-12d3-a456-426614174000", want: true},
		{name: "agent name with prefix", value: "agent-prod", want: false},
		{name: "hex looking name", value: "deadbeef-agent", want: false},
		{name: "chat assistant name", value: "chat-assistant", want: false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := isAgentID(tc.value); got != tc.want {
				t.Fatalf("isAgentID(%q) = %v, want %v", tc.value, got, tc.want)
			}
		})
	}
}

func TestAgentSetScope_LookupNotFound(t *testing.T) {
	fake := &fakeAgentRegistry{lookupErr: capsdk.ErrAgentNotFound}

	_, err := runAgentSetScopeForTest(t, fake, "missing-agent", "--allowed-tools", "a")
	if err == nil {
		t.Fatal("expected not-found error")
	}
	if !errors.Is(err, capsdk.ErrAgentNotFound) && !strings.Contains(strings.ToLower(err.Error()), "agent not found") {
		t.Fatalf("error = %v, want agent not found", err)
	}
	if fake.setCalls != 0 {
		t.Fatalf("SetScope calls = %d, want 0 when Lookup fails", fake.setCalls)
	}
}

func TestAgentSetScope_AgentAPIErrorIncludesStatusAndBody(t *testing.T) {
	fake := &fakeAgentRegistry{
		lookupResp: agentIdentityForScope("agent-123", []string{"a"}, []string{"cordum_submit_job"}),
		setErr: &capsdk.AgentAPIError{
			StatusCode: 403,
			Method:     "PUT",
			Path:       "/api/v1/agents/agent-123",
			Body:       `{"error":"agent_identity entitlement required"}`,
		},
	}

	_, err := runAgentSetScopeForTest(t, fake, "chat-assistant", "--allowed-tools", "a,b")
	if err == nil {
		t.Fatal("expected AgentAPIError")
	}
	msg := err.Error()
	for _, want := range []string{"status 403", "PUT", "/api/v1/agents/agent-123", "agent_identity entitlement required"} {
		if !strings.Contains(msg, want) {
			t.Fatalf("error %q missing %q", msg, want)
		}
	}
}

func TestAgentSetScope_RequiresAtLeastOneScopeFlag(t *testing.T) {
	fake := &fakeAgentRegistry{
		lookupResp: agentIdentityForScope("agent-123", nil, nil),
	}

	_, err := runAgentSetScopeForTest(t, fake, "chat-assistant")
	if err == nil || !strings.Contains(err.Error(), "no scope changes requested") {
		t.Fatalf("error = %v, want no-scope-changes error", err)
	}
	if fake.lookupCalls != 0 || fake.setCalls != 0 {
		t.Fatalf("no-scope path should not Lookup/SetScope, got lookup=%d set=%d", fake.lookupCalls, fake.setCalls)
	}
}

func TestAgentSetScope_ConflictingAllowedAndIncrementalFlags(t *testing.T) {
	fake := &fakeAgentRegistry{
		lookupResp: agentIdentityForScope("agent-123", nil, nil),
	}

	_, err := runAgentSetScopeForTest(t, fake, "chat-assistant", "--allowed-tools", "a", "--add-tool", "b")
	if err == nil || !strings.Contains(err.Error(), "mutually exclusive") {
		t.Fatalf("error = %v, want mutually-exclusive error", err)
	}
	if fake.lookupCalls != 0 || fake.setCalls != 0 {
		t.Fatalf("conflict path should not Lookup/SetScope, got lookup=%d set=%d", fake.lookupCalls, fake.setCalls)
	}
}
