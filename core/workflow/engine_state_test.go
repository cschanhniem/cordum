package workflow

import (
	"testing"
	"time"
)

// ---------------------------------------------------------------------------
// updateRunStatus regression tests — denied step propagation
// ---------------------------------------------------------------------------

func TestUpdateRunStatus_DeniedStep_ProducesRunDenied(t *testing.T) {
	now := time.Now().UTC()
	wfDef := &Workflow{
		ID: "wf-denied",
		Steps: map[string]*Step{
			"step1": {ID: "step1", Type: StepTypeWorker, Topic: "job.test"},
		},
	}
	run := &WorkflowRun{
		ID:         "run-denied",
		WorkflowID: wfDef.ID,
		OrgID:      "org-1",
		Status:     RunStatusRunning,
		Steps: map[string]*StepRun{
			"step1": {StepID: "step1", Status: StepStatusDenied, CompletedAt: &now},
		},
	}

	updateRunStatus(run, wfDef, now)

	if run.Status != RunStatusDenied {
		t.Fatalf("expected run status denied, got %s", run.Status)
	}
	if run.CompletedAt == nil {
		t.Fatalf("expected CompletedAt to be set on denied run")
	}
}

func TestUpdateRunStatus_DeniedStepWithOnError_Recovers(t *testing.T) {
	now := time.Now().UTC()
	wfDef := &Workflow{
		ID: "wf-denied-recover",
		Steps: map[string]*Step{
			"main":    {ID: "main", Type: StepTypeWorker, Topic: "job.test", OnError: "handler"},
			"handler": {ID: "handler", Type: StepTypeWorker, Topic: "job.test"},
		},
	}
	run := &WorkflowRun{
		ID:         "run-denied-recover",
		WorkflowID: wfDef.ID,
		OrgID:      "org-1",
		Status:     RunStatusRunning,
		Steps: map[string]*StepRun{
			"main":    {StepID: "main", Status: StepStatusDenied, CompletedAt: &now},
			"handler": {StepID: "handler", Status: StepStatusSucceeded, CompletedAt: &now},
		},
	}

	updateRunStatus(run, wfDef, now)

	if run.Status != RunStatusSucceeded {
		t.Fatalf("expected run status succeeded after on_error recovery, got %s", run.Status)
	}
}

func TestUpdateRunStatus_DeniedStepWithOnError_Pending(t *testing.T) {
	now := time.Now().UTC()
	wfDef := &Workflow{
		ID: "wf-denied-pending",
		Steps: map[string]*Step{
			"main":    {ID: "main", Type: StepTypeWorker, Topic: "job.test", OnError: "handler"},
			"handler": {ID: "handler", Type: StepTypeWorker, Topic: "job.test"},
		},
	}
	run := &WorkflowRun{
		ID:         "run-denied-pending",
		WorkflowID: wfDef.ID,
		OrgID:      "org-1",
		Status:     RunStatusRunning,
		Steps: map[string]*StepRun{
			"main":    {StepID: "main", Status: StepStatusDenied, CompletedAt: &now},
			"handler": {StepID: "handler", Status: StepStatusRunning},
		},
	}

	updateRunStatus(run, wfDef, now)

	// Handler is still running — run should not be terminal yet.
	if run.Status == RunStatusDenied || run.Status == RunStatusFailed {
		t.Fatalf("expected run not terminal while handler is running, got %s", run.Status)
	}
}

func TestUpdateRunStatus_DeniedStepWithOnError_Exhausted(t *testing.T) {
	now := time.Now().UTC()
	wfDef := &Workflow{
		ID: "wf-denied-exhausted",
		Steps: map[string]*Step{
			"main":    {ID: "main", Type: StepTypeWorker, Topic: "job.test", OnError: "handler"},
			"handler": {ID: "handler", Type: StepTypeWorker, Topic: "job.test"},
		},
	}
	run := &WorkflowRun{
		ID:         "run-denied-exhausted",
		WorkflowID: wfDef.ID,
		OrgID:      "org-1",
		Status:     RunStatusRunning,
		Steps: map[string]*StepRun{
			"main":    {StepID: "main", Status: StepStatusDenied, CompletedAt: &now},
			"handler": {StepID: "handler", Status: StepStatusFailed, CompletedAt: &now},
		},
	}

	updateRunStatus(run, wfDef, now)

	// The handler step itself is failed (and is a regular wfDef step), so
	// hasFailed is set. hasFailed takes precedence over hasDenied, producing
	// RunStatusFailed.
	if run.Status != RunStatusFailed {
		t.Fatalf("expected run status failed (handler failure takes precedence), got %s", run.Status)
	}
}

func TestUpdateRunStatus_DeniedStepOnly_NoDeps(t *testing.T) {
	// When a step is denied with no on_error handler and no other failures,
	// hasDenied should be the only terminal flag, producing RunStatusDenied.
	now := time.Now().UTC()
	wfDef := &Workflow{
		ID: "wf-denied-only",
		Steps: map[string]*Step{
			"step1": {ID: "step1", Type: StepTypeWorker, Topic: "job.test"},
			"step2": {ID: "step2", Type: StepTypeWorker, Topic: "job.test"},
		},
	}
	run := &WorkflowRun{
		ID:         "run-denied-only",
		WorkflowID: wfDef.ID,
		OrgID:      "org-1",
		Status:     RunStatusRunning,
		Steps: map[string]*StepRun{
			"step1": {StepID: "step1", Status: StepStatusSucceeded, CompletedAt: &now},
			"step2": {StepID: "step2", Status: StepStatusDenied, CompletedAt: &now},
		},
	}

	updateRunStatus(run, wfDef, now)

	if run.Status != RunStatusDenied {
		t.Fatalf("expected run status denied, got %s", run.Status)
	}
}

func TestUpdateRunStatus_FailedTakesPrecedenceOverDenied(t *testing.T) {
	now := time.Now().UTC()
	wfDef := &Workflow{
		ID: "wf-mixed",
		Steps: map[string]*Step{
			"step1": {ID: "step1", Type: StepTypeWorker, Topic: "job.test"},
			"step2": {ID: "step2", Type: StepTypeWorker, Topic: "job.test"},
		},
	}
	run := &WorkflowRun{
		ID:         "run-mixed",
		WorkflowID: wfDef.ID,
		OrgID:      "org-1",
		Status:     RunStatusRunning,
		Steps: map[string]*StepRun{
			"step1": {StepID: "step1", Status: StepStatusFailed, CompletedAt: &now},
			"step2": {StepID: "step2", Status: StepStatusDenied, CompletedAt: &now},
		},
	}

	updateRunStatus(run, wfDef, now)

	// Failed takes precedence over denied in updateRunStatus.
	if run.Status != RunStatusFailed {
		t.Fatalf("expected run status failed (takes precedence over denied), got %s", run.Status)
	}
}

func TestUpdateRunStatus_AllSucceeded_NotDenied(t *testing.T) {
	now := time.Now().UTC()
	wfDef := &Workflow{
		ID: "wf-all-ok",
		Steps: map[string]*Step{
			"step1": {ID: "step1", Type: StepTypeWorker, Topic: "job.test"},
		},
	}
	run := &WorkflowRun{
		ID:         "run-all-ok",
		WorkflowID: wfDef.ID,
		OrgID:      "org-1",
		Status:     RunStatusRunning,
		Steps: map[string]*StepRun{
			"step1": {StepID: "step1", Status: StepStatusSucceeded, CompletedAt: &now},
		},
	}

	updateRunStatus(run, wfDef, now)

	if run.Status != RunStatusSucceeded {
		t.Fatalf("expected run succeeded, got %s", run.Status)
	}
}
