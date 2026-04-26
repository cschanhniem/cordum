package store

// Integration coverage for the SetJobRequest → InspectApprovalRepair
// roundtrip: store and the rest of the platform now share a single
// canonicaliser via core/protocol/reqhash. This test pins that
// InspectApprovalRepair's RequestHash matches reqhash.Hash on the same
// logical JobRequest after the protojson roundtrip the store performs.
//
// Unit-level invariants of the canonicaliser (approval-label stripping,
// EffectiveConfigEnvVar stripping, proto unknown field stripping, real
// payload-change detection) are pinned by core/protocol/reqhash's own
// tests. This test exists to catch regressions in the integration path:
// any future refactor that bypasses reqhash on either the SetJobRequest
// or InspectApprovalRepair side, or that mutates the persisted bytes,
// would break here.
//
// Originated as scheduler/job_hash_stale_request_test.go's
// TestHashApprovalJobRequest_MatchesSchedulerHashJobRequest under
// task-fa783d7a; relocated and refactored under task-3b8dd78f when the
// scheduler.HashJobRequest forwarder was deleted.

import (
	"context"
	"testing"

	miniredis "github.com/alicebob/miniredis/v2"
	"github.com/cordum/cordum/core/infra/bus"
	"github.com/cordum/cordum/core/infra/config"
	"github.com/cordum/cordum/core/model"
	pb "github.com/cordum/cordum/core/protocol/pb/v1"
	"github.com/cordum/cordum/core/protocol/reqhash"
	"google.golang.org/protobuf/encoding/protojson"
)

func TestRedisStore_RequestHashMatchesReqhash(t *testing.T) {
	t.Parallel()

	srv := miniredis.RunT(t)
	store, err := NewRedisJobStore("redis://" + srv.Addr())
	if err != nil {
		t.Fatalf("create store: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })

	// A realistic single-step approval payload: body + labels that
	// reqhash keeps (run_id/step_id/workflow_id) AND labels + env that
	// reqhash strips (approval_*, LabelBusMsgID, EffectiveConfigEnvVar).
	req := &pb.JobRequest{
		JobId:      "job-xcheck",
		Topic:      "job.approval-gate",
		TenantId:   "default",
		ContextPtr: "ctx:job-xcheck",
		Labels: map[string]string{
			"run_id":           "run-xcheck",
			"step_id":          "approve",
			"workflow_id":      "wf-xcheck",
			"approval_granted": "true",
			"approval_reason":  "looks safe",
			bus.LabelBusMsgID:  "approval:job-xcheck",
		},
		Env: map[string]string{
			config.EffectiveConfigEnvVar: `{"tenant":"default","effective":true}`,
			"CUSTOM_VAR":                 "keep-me",
		},
	}

	ctx := context.Background()
	if err := store.SetJobRequest(ctx, req); err != nil {
		t.Fatalf("set job request: %v", err)
	}
	if err := store.SetState(ctx, req.GetJobId(), model.JobStateApproval); err != nil {
		t.Fatalf("set state: %v", err)
	}

	want, err := reqhash.Hash(req)
	if err != nil {
		t.Fatalf("reqhash.Hash: %v", err)
	}

	snap, err := store.InspectApprovalRepair(ctx, req.GetJobId())
	if err != nil {
		t.Fatalf("inspect approval repair: %v", err)
	}
	if snap.RequestHash == "" {
		t.Fatal("InspectApprovalRepair returned empty RequestHash")
	}

	if want != snap.RequestHash {
		t.Fatalf("InspectApprovalRepair RequestHash diverged from reqhash.Hash: want=%s got=%s",
			want, snap.RequestHash)
	}

	// Also pin that protojson roundtripping the in-memory proto (what
	// SetJobRequest persists into Redis) does not shift the canonical
	// hash — the invariant that lets the reconciler re-hash the stored
	// form and still match the submit-time hash.
	raw, err := protojson.MarshalOptions{EmitUnpopulated: true}.Marshal(req)
	if err != nil {
		t.Fatalf("protojson marshal: %v", err)
	}
	roundtripped := &pb.JobRequest{}
	if err := protojson.Unmarshal(raw, roundtripped); err != nil {
		t.Fatalf("protojson unmarshal: %v", err)
	}
	got, err := reqhash.Hash(roundtripped)
	if err != nil {
		t.Fatalf("reqhash.Hash roundtripped: %v", err)
	}
	if got != want {
		t.Fatalf("reqhash.Hash not stable across protojson roundtrip: before=%s after=%s",
			want, got)
	}
}
