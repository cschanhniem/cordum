package llmchat

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/cordum/cordum/core/mcp"
)

// scriptedProvider is a Provider whose Complete returns a scripted
// stream of Chunks per call, recording the SamplingMode it was given.
// Tests configure scripts[0] for the first call, scripts[1] for the
// second, etc. After exhausting scripts, Complete returns error.
type scriptedProvider struct {
	mu       sync.Mutex
	scripts  [][]Chunk
	modes    []SamplingMode
	delay    time.Duration
	calls    int
	failOpen bool
}

func (p *scriptedProvider) Complete(ctx context.Context, _ CompleteRequest, mode SamplingMode) (<-chan Chunk, error) {
	p.mu.Lock()
	p.modes = append(p.modes, mode)
	if p.calls >= len(p.scripts) {
		p.mu.Unlock()
		if p.failOpen {
			return nil, errors.New("scriptedProvider: no more scripts")
		}
		// Default: empty stream that ends with finish_reason=stop.
		out := make(chan Chunk, 1)
		out <- Chunk{Done: true, FinishReason: "stop"}
		close(out)
		return out, nil
	}
	chunks := p.scripts[p.calls]
	p.calls++
	delay := p.delay
	p.mu.Unlock()

	out := make(chan Chunk, len(chunks)+1)
	go func() {
		defer close(out)
		for _, c := range chunks {
			if delay > 0 {
				select {
				case <-ctx.Done():
					return
				case <-time.After(delay):
				}
			}
			select {
			case <-ctx.Done():
				return
			case out <- c:
			}
		}
	}()
	return out, nil
}

func (p *scriptedProvider) HealthCheck(_ context.Context) error { return nil }

func (p *scriptedProvider) Modes() []SamplingMode {
	p.mu.Lock()
	defer p.mu.Unlock()
	out := make([]SamplingMode, len(p.modes))
	copy(out, p.modes)
	return out
}

// fakeMCPCaller scripts ListTools + CallTool responses for tests.
type fakeMCPCaller struct {
	mu          sync.Mutex
	tools       []mcp.Tool
	callHandler func(name string, args json.RawMessage) (*mcp.ToolCallResult, error)
	calls       []mcpCallRecord
}

type mcpCallRecord struct {
	Name string
	Args json.RawMessage
}

func (f *fakeMCPCaller) ListTools(_ context.Context) (*mcp.ToolListResult, error) {
	return &mcp.ToolListResult{Tools: f.tools}, nil
}

func (f *fakeMCPCaller) CallTool(_ context.Context, name string, args json.RawMessage, _ string) (*mcp.ToolCallResult, error) {
	f.mu.Lock()
	f.calls = append(f.calls, mcpCallRecord{Name: name, Args: args})
	handler := f.callHandler
	f.mu.Unlock()
	if handler != nil {
		return handler(name, args)
	}
	return &mcp.ToolCallResult{Content: []mcp.ContentItem{{Type: "text", Text: `{"ok":true}`}}}, nil
}

// fakeSessions records the Append + SetPendingToolCall calls for
// assertions; also serves as an in-memory store so the Agent's
// session.Messages mutations roundtrip.
type fakeSessions struct {
	mu                sync.Mutex
	appended          []SessionMessage
	pendingToolCall   *ToolCallRef
	pendingSetCalls   int
	clearPendingCalls int
}

func (s *fakeSessions) AppendMessage(_ context.Context, _ string, msg SessionMessage) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.appended = append(s.appended, msg)
	return nil
}

func (s *fakeSessions) SetPendingToolCall(_ context.Context, _ string, ref *ToolCallRef) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if ref == nil {
		s.pendingToolCall = nil
		s.clearPendingCalls++
	} else {
		clone := *ref
		s.pendingToolCall = &clone
		s.pendingSetCalls++
	}
	return nil
}

// staticPromptLoader returns a fixed string.
type staticPromptLoader struct{ text string }

func (s staticPromptLoader) Load(_ context.Context) (string, error) { return s.text, nil }

// newTestAgent wires a barebones agent for table-driven tests.
func newTestAgent(provider Provider, mcp MCPCaller, sessions SessionStorer, budgetOverride *agentBudgets) *Agent {
	return NewAgent(AgentConfig{
		Provider:     provider,
		MCP:          mcp,
		Redactor:     NewRedactor(),
		PromptLoader: staticPromptLoader{text: "test-system"},
		Sessions:     sessions,
		Budgets:      budgetOverride,
	})
}

func collectFrames(t *testing.T, ch <-chan Frame) []Frame {
	t.Helper()
	var got []Frame
	deadline := time.NewTimer(5 * time.Second)
	defer deadline.Stop()
	for {
		select {
		case f, ok := <-ch:
			if !ok {
				return got
			}
			got = append(got, f)
		case <-deadline.C:
			t.Fatalf("collectFrames timed out, got=%v", got)
			return got
		}
	}
}

// 1. NoToolCalls: 0 tool calls; spy records 2 Provider.Complete calls
// (ToolCalls then Summary).
func TestTurn_NoToolCalls(t *testing.T) {
	t.Parallel()
	provider := &scriptedProvider{
		scripts: [][]Chunk{
			{{Delta: "internal tool-choice text must not stream", FinishReason: "stop", Done: true}}, // tool-call phase: no tools, finish stop
			{{Delta: "Hello! "}, {Delta: "How can I help?"}, {Done: true, FinishReason: "stop"}},
		},
	}
	sessions := &fakeSessions{}
	a := newTestAgent(provider, &fakeMCPCaller{}, sessions, nil)

	frames := collectFrames(t, a.Turn(context.Background(), TurnInput{
		Session:     &Session{ID: "s1", UserPrincipal: "u", Tenant: "t"},
		UserMessage: "hi",
	}))

	if len(provider.Modes()) != 2 {
		t.Fatalf("modes = %v, want 2 calls (ToolCalls then Summary)", provider.Modes())
	}
	if provider.Modes()[0] != SamplingModeToolCalls || provider.Modes()[1] != SamplingModeSummary {
		t.Errorf("modes = %v, want [ToolCalls, Summary]", provider.Modes())
	}
	for _, frame := range frames {
		if frame.Type == FrameAssistantDelta && strings.Contains(frame.Text, "internal tool-choice text") {
			t.Fatalf("tool-selection text leaked to user-visible frames: %+v", frames)
		}
	}
	if got := lastFrame(frames).Type; got != FrameFinal {
		t.Errorf("last frame = %s, want %s", got, FrameFinal)
	}
}

// 2. OneToolCall: 1 ToolCall (mcp.ToolListJobs); result; summary; final.
func TestTurn_OneToolCall(t *testing.T) {
	t.Parallel()
	provider := &scriptedProvider{
		scripts: [][]Chunk{
			{{ToolCalls: []ToolCall{{ID: "c1", Name: mcp.ToolListJobs, Arguments: json.RawMessage(`{"limit":5}`)}}, FinishReason: "tool_calls", Done: true}},
			{{Delta: "Found 5 jobs."}, {Done: true, FinishReason: "stop"}},
		},
	}
	mcpC := &fakeMCPCaller{}
	sessions := &fakeSessions{}
	a := newTestAgent(provider, mcpC, sessions, nil)

	frames := collectFrames(t, a.Turn(context.Background(), TurnInput{
		Session:     &Session{ID: "s2"},
		UserMessage: "list jobs",
	}))

	if len(mcpC.calls) != 1 {
		t.Errorf("CallTool called %d times, want 1", len(mcpC.calls))
	}
	hasToolCall := false
	hasToolResult := false
	for _, f := range frames {
		if f.Type == FrameToolCall {
			hasToolCall = true
		}
		if f.Type == FrameToolResult {
			hasToolResult = true
		}
	}
	if !hasToolCall || !hasToolResult {
		t.Errorf("expected tool_call + tool_result frames; got %v", frameTypes(frames))
	}
	if got := lastFrame(frames).Type; got != FrameFinal {
		t.Errorf("last frame = %s, want %s", got, FrameFinal)
	}
}

// 3. ThreeSequentialToolCalls: 3 multi-round tool-call dispatches +
// the "no more tools" signal + 1 Summary call. The agent makes one
// ToolCalls provider call per round (LLM dispatches one tool, agent
// runs it, LLM emits another in the next round). The final ToolCalls
// call signals "stop" with no tool_calls, and the Summary call
// follows with Summary sampling.
func TestTurn_ThreeSequentialToolCalls(t *testing.T) {
	t.Parallel()
	provider := &scriptedProvider{
		scripts: [][]Chunk{
			{{ToolCalls: []ToolCall{{ID: "c1", Name: mcp.ToolListJobs, Arguments: json.RawMessage(`{"limit":5}`)}}, FinishReason: "tool_calls", Done: true}},
			{{ToolCalls: []ToolCall{{ID: "c2", Name: mcp.ToolGetJob, Arguments: json.RawMessage(`{"id":"job-1"}`)}}, FinishReason: "tool_calls", Done: true}},
			{{ToolCalls: []ToolCall{{ID: "c3", Name: mcp.ToolListWorkers, Arguments: json.RawMessage(`{}`)}}, FinishReason: "tool_calls", Done: true}},
			{{FinishReason: "stop", Done: true}},                       // "no more tools" signal
			{{Delta: "All done."}, {Done: true, FinishReason: "stop"}}, // Summary phase
		},
	}
	a := newTestAgent(provider, &fakeMCPCaller{}, &fakeSessions{}, nil)

	_ = collectFrames(t, a.Turn(context.Background(), TurnInput{
		Session:     &Session{ID: "s3"},
		UserMessage: "give me a status",
	}))

	modes := provider.Modes()
	// 4 ToolCalls calls (3 dispatching + 1 detecting end) + 1 Summary
	if len(modes) != 5 {
		t.Fatalf("modes = %v, want 5 calls (4 ToolCalls + 1 Summary)", modes)
	}
	for i := range 4 {
		if modes[i] != SamplingModeToolCalls {
			t.Errorf("modes[%d] = %v, want SamplingModeToolCalls", i, modes[i])
		}
	}
	if modes[4] != SamplingModeSummary {
		t.Errorf("modes[4] = %v, want SamplingModeSummary", modes[4])
	}
}

// 4. ApprovalRequiredMidTurn: ApprovalRequiredError; FrameApprovalRequired
// emitted; sess.PendingToolCall set; sess.Save called; channel CLOSES via
// defer; NO final, NO error.
func TestTurn_ApprovalRequiredMidTurn(t *testing.T) {
	t.Parallel()
	provider := &scriptedProvider{
		scripts: [][]Chunk{
			{{ToolCalls: []ToolCall{{ID: "c1", Name: mcp.ToolSubmitJob, Arguments: json.RawMessage(`{"topic":"foo"}`)}}, FinishReason: "tool_calls", Done: true}},
		},
	}
	mcpC := &fakeMCPCaller{
		callHandler: func(_ string, _ json.RawMessage) (*mcp.ToolCallResult, error) {
			return nil, &ApprovalRequiredError{ApprovalID: "appr-7", Tool: mcp.ToolSubmitJob}
		},
	}
	sessions := &fakeSessions{}
	a := newTestAgent(provider, mcpC, sessions, nil)

	frames := collectFrames(t, a.Turn(context.Background(), TurnInput{
		Session:     &Session{ID: "s4"},
		UserMessage: "submit job",
	}))

	hasApproval := false
	for _, f := range frames {
		if f.Type == FrameApprovalRequired {
			hasApproval = true
			if f.ApprovalID != "appr-7" {
				t.Errorf("ApprovalID = %q, want appr-7", f.ApprovalID)
			}
		}
		if f.Type == FrameFinal {
			t.Errorf("approval-required must NOT emit FrameFinal (rail #4 pause-not-terminate)")
		}
		if f.Type == FrameError {
			t.Errorf("approval-required must NOT emit FrameError; got %s", f.ErrorCode)
		}
	}
	if !hasApproval {
		t.Errorf("expected FrameApprovalRequired; got %v", frameTypes(frames))
	}
	if sessions.pendingSetCalls != 1 {
		t.Errorf("SetPendingToolCall called %d times, want 1", sessions.pendingSetCalls)
	}
	if sessions.pendingToolCall == nil || sessions.pendingToolCall.Name != mcp.ToolSubmitJob {
		t.Errorf("pendingToolCall = %+v, want Name=%s", sessions.pendingToolCall, mcp.ToolSubmitJob)
	}
}

// 5. RepeatCallDetector: same {name,args} twice; FrameError code='repeat_tool_call'.
func TestTurn_RepeatCallDetector(t *testing.T) {
	t.Parallel()
	provider := &scriptedProvider{
		scripts: [][]Chunk{
			{{ToolCalls: []ToolCall{{ID: "c1", Name: mcp.ToolListJobs, Arguments: json.RawMessage(`{"limit":5}`)}}, FinishReason: "tool_calls", Done: true}},
			{{ToolCalls: []ToolCall{{ID: "c2", Name: mcp.ToolListJobs, Arguments: json.RawMessage(`{"limit":5}`)}}, FinishReason: "tool_calls", Done: true}},
		},
	}
	a := newTestAgent(provider, &fakeMCPCaller{}, &fakeSessions{}, nil)

	frames := collectFrames(t, a.Turn(context.Background(), TurnInput{
		Session:     &Session{ID: "s5"},
		UserMessage: "list jobs again",
	}))

	terminal := lastFrame(frames)
	if terminal.Type != FrameError {
		t.Fatalf("terminal = %+v, want FrameError", terminal)
	}
	if terminal.ErrorCode != ErrorCodeRepeatToolCall {
		t.Errorf("ErrorCode = %q, want %q", terminal.ErrorCode, ErrorCodeRepeatToolCall)
	}
}

// 6. WallClockBudgetTrips: t.Setenv MAX_WALL_CLOCK=50ms; spy delays 100ms;
// FrameError code='wall_clock_budget_tripped'.
func TestTurn_WallClockBudgetTrips(t *testing.T) {
	provider := &scriptedProvider{
		scripts: [][]Chunk{
			{{Delta: "thinking..."}, {FinishReason: "stop", Done: true}},
		},
		delay: 200 * time.Millisecond,
	}
	budgets := &agentBudgets{
		MaxToolCalls:      defaultMaxToolCallsPerTurn,
		MaxWallClock:      50 * time.Millisecond,
		MaxAssistantBytes: defaultMaxAssistantBytes,
	}
	a := newTestAgent(provider, &fakeMCPCaller{}, &fakeSessions{}, budgets)

	frames := collectFrames(t, a.Turn(context.Background(), TurnInput{
		Session:     &Session{ID: "s6"},
		UserMessage: "slow",
	}))
	terminal := lastFrame(frames)
	if terminal.Type != FrameError {
		t.Fatalf("terminal = %+v, want FrameError", terminal)
	}
	if terminal.ErrorCode != ErrorCodeWallClockBudgetTripped && terminal.ErrorCode != ErrorCodeContextCancelled {
		t.Errorf("ErrorCode = %q, want wall_clock_budget_tripped (or context_cancelled if budget expired during chunk read)", terminal.ErrorCode)
	}
}

// 7. AssistantBytesBudgetTrips: t.Setenv MAX_ASSISTANT_BYTES=64; spy emits
// 200B; FrameError code='assistant_bytes_budget_tripped'.
func TestTurn_AssistantBytesBudgetTrips(t *testing.T) {
	t.Parallel()
	bigText := strings.Repeat("x", 200)
	provider := &scriptedProvider{
		scripts: [][]Chunk{
			{{Delta: bigText, FinishReason: "stop", Done: true}},
		},
	}
	budgets := &agentBudgets{
		MaxToolCalls:      defaultMaxToolCallsPerTurn,
		MaxWallClock:      defaultMaxWallClock,
		MaxAssistantBytes: 64,
	}
	a := newTestAgent(provider, &fakeMCPCaller{}, &fakeSessions{}, budgets)

	frames := collectFrames(t, a.Turn(context.Background(), TurnInput{
		Session:     &Session{ID: "s7"},
		UserMessage: "talk",
	}))
	terminal := lastFrame(frames)
	if terminal.Type != FrameError {
		t.Fatalf("terminal = %+v, want FrameError", terminal)
	}
	if terminal.ErrorCode != ErrorCodeAssistantBytesBudget {
		t.Errorf("ErrorCode = %q, want %q", terminal.ErrorCode, ErrorCodeAssistantBytesBudget)
	}
}

// 8. RedactsSecretsInToolResults: tool result contains 'API_KEY=sk-abc123';
// the redacted text is what the next provider call would see (no
// 'sk-abc123' inside the recorded tool message).
func TestTurn_RedactsSecretsInToolResults(t *testing.T) {
	t.Parallel()
	provider := &scriptedProvider{
		scripts: [][]Chunk{
			{{ToolCalls: []ToolCall{{ID: "c1", Name: mcp.ToolListJobs, Arguments: json.RawMessage(`{}`)}}, FinishReason: "tool_calls", Done: true}},
			{{Delta: "summarised."}, {Done: true, FinishReason: "stop"}},
		},
	}
	mcpC := &fakeMCPCaller{
		callHandler: func(_ string, _ json.RawMessage) (*mcp.ToolCallResult, error) {
			return &mcp.ToolCallResult{Content: []mcp.ContentItem{{Type: "text", Text: "AWS_ACCESS_KEY_ID=AKIAJ7777777"}}}, nil
		},
	}
	sessions := &fakeSessions{}
	a := newTestAgent(provider, mcpC, sessions, nil)

	frames := collectFrames(t, a.Turn(context.Background(), TurnInput{
		Session:     &Session{ID: "s8"},
		UserMessage: "scan",
	}))

	for _, f := range frames {
		if f.Type == FrameToolResult && strings.Contains(f.ToolResult, "AKIAJ7777777") {
			t.Errorf("FrameToolResult leaked secret: %s", f.ToolResult)
		}
	}
	for _, msg := range sessions.appended {
		if strings.Contains(msg.Text, "AKIAJ7777777") {
			t.Errorf("session.appended leaked secret: %s", msg.Text)
		}
	}
}

// 9. TwoPassSampling: spy records SamplingMode per call; tool-call phase
// = ToolCalls; summary = Summary; summary fired exactly ONCE.
func TestTurn_TwoPassSampling(t *testing.T) {
	t.Parallel()
	provider := &scriptedProvider{
		scripts: [][]Chunk{
			{{ToolCalls: []ToolCall{{ID: "c1", Name: mcp.ToolListJobs, Arguments: json.RawMessage(`{"limit":5}`)}}, FinishReason: "tool_calls", Done: true}},
			{{Delta: "Found 5 jobs."}, {Done: true, FinishReason: "stop"}},
		},
	}
	a := newTestAgent(provider, &fakeMCPCaller{}, &fakeSessions{}, nil)
	_ = collectFrames(t, a.Turn(context.Background(), TurnInput{
		Session:     &Session{ID: "s9"},
		UserMessage: "list",
	}))

	modes := provider.Modes()
	summaryCount := 0
	for i, m := range modes {
		if m == SamplingModeSummary {
			summaryCount++
			if i != len(modes)-1 {
				t.Errorf("Summary mode at index %d, want only at end (rail #6 — summary fires ONCE after tool-calls)", i)
			}
		}
	}
	if summaryCount != 1 {
		t.Errorf("summary count = %d, want exactly 1 (rail #6)", summaryCount)
	}
}

// 10. Determinism: same user message run 3 times — tool-call phase args
// IDENTICAL across runs (deterministic by design via sampling-mode +
// the scriptedProvider's fixed script).
func TestTurn_Determinism(t *testing.T) {
	t.Parallel()
	makeProvider := func() *scriptedProvider {
		return &scriptedProvider{
			scripts: [][]Chunk{
				{{ToolCalls: []ToolCall{{ID: "c1", Name: mcp.ToolListJobs, Arguments: json.RawMessage(`{"limit":5,"status":"failed"}`)}}, FinishReason: "tool_calls", Done: true}},
				{{Delta: "Done."}, {Done: true, FinishReason: "stop"}},
			},
		}
	}

	hashes := make([]string, 3)
	for i := range 3 {
		mcpC := &fakeMCPCaller{}
		a := newTestAgent(makeProvider(), mcpC, &fakeSessions{}, nil)
		_ = collectFrames(t, a.Turn(context.Background(), TurnInput{
			Session:     &Session{ID: "sd"},
			UserMessage: "list failed jobs",
		}))
		if len(mcpC.calls) != 1 {
			t.Fatalf("run %d: CallTool calls = %d, want 1", i, len(mcpC.calls))
		}
		hashes[i] = repeatCallHash(mcpC.calls[0].Name, mcpC.calls[0].Args)
	}
	if hashes[0] != hashes[1] || hashes[1] != hashes[2] {
		t.Errorf("tool-call hashes diverge across runs: %v (rail #1 — tool-call phase must be deterministic)", hashes)
	}
}

// helpers

func lastFrame(fr []Frame) Frame {
	if len(fr) == 0 {
		return Frame{}
	}
	return fr[len(fr)-1]
}

func frameTypes(fr []Frame) []FrameType {
	out := make([]FrameType, len(fr))
	for i, f := range fr {
		out[i] = f.Type
	}
	return out
}
