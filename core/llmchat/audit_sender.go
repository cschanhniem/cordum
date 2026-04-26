package llmchat

import (
	"context"
	"log/slog"
	"strings"
	"time"

	"github.com/cordum/cordum/core/audit"
)

const chatAuditAppendTimeout = 5 * time.Second

// ChainedAuditSender mirrors the gateway audit-chain sender locally for the
// llm-chat service: append to the tamper-evident Redis chain, then forward to
// an optional downstream SIEM sender.
type ChainedAuditSender struct {
	chainer    *audit.Chainer
	downstream audit.AuditSender
}

func NewChainedAuditSender(chainer *audit.Chainer, downstream audit.AuditSender) audit.AuditSender {
	if chainer == nil {
		return downstream
	}
	return &ChainedAuditSender{chainer: chainer, downstream: downstream}
}

func (s *ChainedAuditSender) Send(event audit.SIEMEvent) {
	if s == nil {
		return
	}
	if s.chainer != nil && strings.TrimSpace(event.TenantID) != "" {
		ctx, cancel := context.WithTimeout(context.Background(), chatAuditAppendTimeout)
		defer cancel()
		if err := s.chainer.Append(ctx, &event); err != nil {
			slog.Error("llmchat: audit chain append failed", "event_type", event.EventType, "tenant_id", event.TenantID, "error", err)
		}
	}
	if s.downstream != nil {
		s.downstream.Send(event)
	}
}

func (s *ChainedAuditSender) Close() error {
	if s == nil || s.downstream == nil {
		return nil
	}
	return s.downstream.Close()
}
