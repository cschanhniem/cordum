package llmchat

import (
	"context"
	"sync"
	"testing"
)

type fakeApprovalBus struct {
	mu       sync.Mutex
	handlers []func(context.Context, ApprovalEvent) error
}

func newFakeApprovalBus() *fakeApprovalBus { return &fakeApprovalBus{} }

func (b *fakeApprovalBus) SubscribeApprovalEvents(_ context.Context, handler func(context.Context, ApprovalEvent) error) (ApprovalSubscription, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.handlers = append(b.handlers, handler)
	return fakeApprovalSubscription{}, nil
}

func (b *fakeApprovalBus) Publish(ev ApprovalEvent) {
	b.mu.Lock()
	handlers := append([]func(context.Context, ApprovalEvent) error(nil), b.handlers...)
	b.mu.Unlock()
	for _, h := range handlers {
		_ = h(context.Background(), ev)
	}
}

type fakeApprovalSubscription struct{}

func (fakeApprovalSubscription) Unsubscribe() error { return nil }

func TestApprovalResumerWrongAgentDoesNotConsumePending(t *testing.T) {
	runner := &scriptedChatRunner{resumeFrames: [][]Frame{{{Type: FrameToolResult, ToolResult: `{"ok":true}`}, {Type: FrameFinal, Text: "done"}}}}
	resumer := NewApprovalResumer(ApprovalResumerConfig{Runner: runner})
	var (
		mu     sync.Mutex
		frames []Frame
	)
	resumer.Register(ApprovalPending{
		ApprovalID:  "appr-1",
		AgentID:     "agent-a",
		Session:     &Session{ID: "sess-a"},
		BearerToken: "bearer-a",
		Emit: func(frame Frame) bool {
			mu.Lock()
			defer mu.Unlock()
			frames = append(frames, frame)
			return true
		},
	})

	if err := resumer.handleEvent(context.Background(), ApprovalEvent{ApprovalID: "appr-1", AgentID: "agent-b", Status: ApprovalStatusResolved}); err != nil {
		t.Fatalf("wrong-agent handleEvent: %v", err)
	}
	_, resumes := runner.snapshot()
	if len(resumes) != 0 {
		t.Fatalf("resumes after wrong agent=%+v want none", resumes)
	}

	if err := resumer.handleEvent(context.Background(), ApprovalEvent{ApprovalID: "appr-1", AgentID: "agent-a", Status: ApprovalStatusResolved}); err != nil {
		t.Fatalf("correct-agent handleEvent: %v", err)
	}
	_, resumes = runner.snapshot()
	if len(resumes) != 1 || resumes[0].BearerToken != "bearer-a" {
		t.Fatalf("resumes=%+v want one correct-agent resume", resumes)
	}
	mu.Lock()
	defer mu.Unlock()
	if len(frames) != 2 || frames[len(frames)-1].Type != FrameFinal {
		t.Fatalf("frames=%+v want tool_result + final after correct event", frames)
	}
}
