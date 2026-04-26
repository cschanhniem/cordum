//go:build integration
// +build integration

package llmchat

import (
	"context"
	"encoding/json"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/cordum/cordum/core/llmchat/testutil/mockvllm"
	"github.com/cordum/cordum/core/mcp"
)

// fakeIntegrationMCP is a concurrency-safe scripted MCP fixture for the
// integration tests in this file. It is intentionally separate from the
// fakeMCPCaller in agent_test.go because that helper ships with the
// default-tag test build and the integration tag won't see it.
type fakeIntegrationMCP struct {
	mu    sync.Mutex
	tools []mcp.Tool
	resp  func(name string, args json.RawMessage) (*mcp.ToolCallResult, error)
	calls []mcpIntegrationCall
}

type mcpIntegrationCall struct {
	Name string
	Args json.RawMessage
}

func (f *fakeIntegrationMCP) ListTools(_ context.Context) (*mcp.ToolListResult, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return &mcp.ToolListResult{Tools: append([]mcp.Tool(nil), f.tools...)}, nil
}

func (f *fakeIntegrationMCP) CallTool(_ context.Context, name string, args json.RawMessage, _ string) (*mcp.ToolCallResult, error) {
	f.mu.Lock()
	f.calls = append(f.calls, mcpIntegrationCall{Name: name, Args: args})
	resp := f.resp
	f.mu.Unlock()
	if resp != nil {
		return resp(name, args)
	}
	return &mcp.ToolCallResult{Content: []mcp.ContentItem{{Type: "text", Text: `{"ok":true}`}}}, nil
}

func (f *fakeIntegrationMCP) Calls() []mcpIntegrationCall {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]mcpIntegrationCall, len(f.calls))
	copy(out, f.calls)
	return out
}

type integrationSessions struct {
	mu       sync.Mutex
	messages []SessionMessage
	pending  *ToolCallRef
}

func (s *integrationSessions) AppendMessage(_ context.Context, _ string, m SessionMessage) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.messages = append(s.messages, m)
	return nil
}

func (s *integrationSessions) SetPendingToolCall(_ context.Context, _ string, ref *ToolCallRef) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if ref == nil {
		s.pending = nil
	} else {
		clone := *ref
		s.pending = &clone
	}
	return nil
}

type integrationPrompt struct{ text string }

func (p integrationPrompt) Load(_ context.Context) (string, error) { return p.text, nil }

// collectFramesIntegration reads frames off the channel until close or
// deadline. Mirrors collectFrames in agent_test.go (which is in the
// default tag and not visible from the integration tag).
func collectFramesIntegration(t *testing.T, ch <-chan Frame) []Frame {
	t.Helper()
	var got []Frame
	deadline := time.NewTimer(15 * time.Second)
	defer deadline.Stop()
	for {
		select {
		case f, ok := <-ch:
			if !ok {
				return got
			}
			got = append(got, f)
		case <-deadline.C:
			t.Fatalf("collectFrames timed out after 15s; got=%d frames", len(got))
			return got
		}
	}
}

// TestIntegration_OpenAIProvider_StreamsTextThroughMockVLLM exercises the
// real provider_openai.go SSE parser against the mockvllm helper. This
// is the lowest-level integration probe: a single request → stream of
// text deltas → stop. It catches regressions in the SSE parser that
// unit tests with a scripted Provider would miss.
func TestIntegration_OpenAIProvider_StreamsTextThroughMockVLLM(t *testing.T) {
	t.Parallel()

	server := mockvllm.NewServer(t, mockvllm.Script{
		Turns: []mockvllm.Turn{{
			TextDeltas:   []string{"Hello, ", "world."},
			FinishReason: "stop",
		}},
	})

	provider := NewOpenAIProvider(ProviderConfig{
		Kind:               "openai",
		BaseURL:            server.URL + "/v1",
		Model:              "qwen3-coder",
		ToolTemperature:    0.3,
		ToolTopP:           0.9,
		SummaryTemperature: 0.7,
		SummaryTopP:        0.8,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	chunks, err := provider.Complete(ctx, CompleteRequest{
		Messages: []Message{{Role: "user", Content: "hi"}},
	}, SamplingModeSummary)
	if err != nil {
		t.Fatalf("provider.Complete: %v", err)
	}
	var collected []Chunk
	for c := range chunks {
		collected = append(collected, c)
	}
	if len(collected) == 0 {
		t.Fatal("expected at least one chunk from mockvllm")
	}

	var sb strings.Builder
	sawDone := false
	for _, c := range collected {
		sb.WriteString(c.Delta)
		if c.Done {
			sawDone = true
		}
	}
	if !sawDone {
		t.Errorf("never saw Done=true chunk; collected=%d", len(collected))
	}
	if got := sb.String(); got != "Hello, world." {
		t.Errorf("assembled text = %q, want %q", got, "Hello, world.")
	}
	if calls := server.Calls(); calls != 1 {
		t.Errorf("mockvllm calls = %d, want 1", calls)
	}
}

// TestIntegration_AgentLoop_OneToolCallThroughMockVLLM exercises the
// full Agent loop with the real OpenAIProvider + a fake MCP that
// returns a canned tool result. Verifies: tool-call SSE delta is parsed,
// MCP CallTool is invoked, summary turn streams the final text, and
// frame ordering matches the Gmail-widget protocol.
func TestIntegration_AgentLoop_OneToolCallThroughMockVLLM(t *testing.T) {
	t.Parallel()

	server := mockvllm.NewServer(t, mockvllm.Script{
		Turns: []mockvllm.Turn{
			// Turn 1 (tool-call sampling): emit cordum_list_jobs tool_call.
			{
				ToolCalls: []mockvllm.ToolCallDelta{{
					ID:        "call_1",
					Name:      mcp.ToolListJobs,
					Arguments: `{"limit":5}`,
				}},
				FinishReason: "tool_calls",
			},
			// Turn 2 (tool-call sampling): no more tool calls, signal stop.
			{FinishReason: "stop"},
			// Turn 3 (summary sampling): produce the final assistant text.
			{
				TextDeltas:   []string{"Found ", "5 ", "jobs."},
				FinishReason: "stop",
			},
		},
	})

	provider := NewOpenAIProvider(ProviderConfig{
		Kind:               "openai",
		BaseURL:            server.URL + "/v1",
		Model:              "qwen3-coder",
		ToolTemperature:    0.3,
		ToolTopP:           0.9,
		SummaryTemperature: 0.7,
		SummaryTopP:        0.8,
	})

	mcpFake := &fakeIntegrationMCP{
		tools: []mcp.Tool{{Name: mcp.ToolListJobs, Description: "list jobs"}},
		resp: func(_ string, _ json.RawMessage) (*mcp.ToolCallResult, error) {
			return &mcp.ToolCallResult{Content: []mcp.ContentItem{{
				Type: "text", Text: `{"jobs":[{"id":"job-1"},{"id":"job-2"},{"id":"job-3"},{"id":"job-4"},{"id":"job-5"}]}`,
			}}}, nil
		},
	}

	agent := NewAgent(AgentConfig{
		Provider:     provider,
		MCP:          mcpFake,
		Redactor:     NewRedactor(),
		PromptLoader: integrationPrompt{text: "test-system"},
		Sessions:     &integrationSessions{},
	})

	frames := collectFramesIntegration(t, agent.Turn(context.Background(), TurnInput{
		Session:     &Session{ID: "sess-int", UserPrincipal: "alice", Tenant: "acme"},
		UserMessage: "list jobs",
	}))

	if len(frames) == 0 {
		t.Fatal("expected at least one frame from agent loop")
	}
	if calls := mcpFake.Calls(); len(calls) != 1 || calls[0].Name != mcp.ToolListJobs {
		t.Errorf("MCP CallTool calls = %v, want exactly [%s]", calls, mcp.ToolListJobs)
	}

	var (
		sawToolCall   bool
		sawToolResult bool
		assistant     strings.Builder
	)
	for _, f := range frames {
		switch f.Type {
		case FrameToolCall:
			sawToolCall = true
		case FrameToolResult:
			sawToolResult = true
		case FrameFinal:
			assistant.WriteString(f.Text)
		case FrameAssistantDelta:
			assistant.WriteString(f.Text)
		}
	}
	if !sawToolCall {
		t.Errorf("no tool_call frame; frames=%v", frameTypeList(frames))
	}
	if !sawToolResult {
		t.Errorf("no tool_result frame; frames=%v", frameTypeList(frames))
	}
	if got := assistant.String(); !strings.Contains(got, "5") {
		t.Errorf("assistant text = %q, want to contain '5' (tool result said 5 jobs)", got)
	}
	if last := frames[len(frames)-1].Type; last != FrameFinal {
		t.Errorf("last frame = %s, want %s", last, FrameFinal)
	}

	// 3 mockvllm calls: tool-call dispatch + tool-call end-signal + summary.
	if calls := server.Calls(); calls != 3 {
		t.Errorf("mockvllm calls = %d, want 3 (tool-call dispatch, end-signal, summary)", calls)
	}
}

func frameTypeList(frames []Frame) []string {
	out := make([]string, 0, len(frames))
	for _, f := range frames {
		out = append(out, string(f.Type))
	}
	return out
}
