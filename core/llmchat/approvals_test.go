package llmchat

import (
	"context"
	"sync"
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
