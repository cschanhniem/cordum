import { describe, it, expect } from "vitest";

/**
 * Tests for RunDetailPage logic: skipped step detection, live vs historical indicator.
 */

const TERMINAL_STATUSES = ["succeeded", "failed", "denied", "cancelled", "timed_out"];
const ACTIVE_STATUSES = ["running", "pending", "waiting"];

function isRunning(status: string): boolean {
  return ACTIVE_STATUSES.includes(status);
}

function isTerminal(status: string): boolean {
  return TERMINAL_STATUSES.includes(status);
}

function stepClasses(status: string): string[] {
  const classes: string[] = [];
  if (status === "pending") classes.push("text-muted-foreground");
  if (status === "skipped") classes.push("text-muted-foreground", "line-through", "opacity-50");
  if (status !== "pending" && status !== "skipped") classes.push("text-foreground");
  return classes;
}

describe("Skipped step rendering", () => {
  it("applies line-through and opacity for skipped steps", () => {
    const classes = stepClasses("skipped");
    expect(classes).toContain("line-through");
    expect(classes).toContain("opacity-50");
    expect(classes).toContain("text-muted-foreground");
  });

  it("does not apply line-through for pending steps", () => {
    const classes = stepClasses("pending");
    expect(classes).not.toContain("line-through");
    expect(classes).toContain("text-muted-foreground");
  });

  it("does not apply line-through for succeeded steps", () => {
    const classes = stepClasses("succeeded");
    expect(classes).not.toContain("line-through");
    expect(classes).toContain("text-foreground");
  });
});

describe("Live vs historical indicator", () => {
  it("running is live", () => {
    expect(isRunning("running")).toBe(true);
    expect(isTerminal("running")).toBe(false);
  });

  it("pending is live", () => {
    expect(isRunning("pending")).toBe(true);
  });

  it("succeeded is terminal (historical)", () => {
    expect(isRunning("succeeded")).toBe(false);
    expect(isTerminal("succeeded")).toBe(true);
  });

  it("failed is terminal", () => {
    expect(isTerminal("failed")).toBe(true);
  });

  it("cancelled is terminal", () => {
    expect(isTerminal("cancelled")).toBe(true);
  });

  it("timed_out is terminal", () => {
    expect(isTerminal("timed_out")).toBe(true);
  });

  it("denied is terminal (governance outcome, distinct from failed)", () => {
    expect(isTerminal("denied")).toBe(true);
    expect(isRunning("denied")).toBe(false);
  });

  it("waiting is active, not terminal", () => {
    expect(isRunning("waiting")).toBe(true);
    expect(isTerminal("waiting")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// mapStepStatus — waiting must NOT collapse to running
// ---------------------------------------------------------------------------

function mapStepStatus(status?: string): string {
  switch (status) {
    case "succeeded": return "succeeded";
    case "running": return "running";
    case "waiting": return "waiting";
    case "quarantined":
    case "output_quarantined": return "quarantined";
    case "failed":
    case "timed_out": return "failed";
    case "cancelled": return "skipped";
    default: return "pending";
  }
}

describe("mapStepStatus — approval-waiting preservation", () => {
  it("preserves waiting as distinct from running", () => {
    expect(mapStepStatus("waiting")).toBe("waiting");
    expect(mapStepStatus("running")).toBe("running");
    expect(mapStepStatus("waiting")).not.toBe("running");
  });

  it("maps succeeded, failed, cancelled correctly", () => {
    expect(mapStepStatus("succeeded")).toBe("succeeded");
    expect(mapStepStatus("failed")).toBe("failed");
    expect(mapStepStatus("cancelled")).toBe("skipped");
    expect(mapStepStatus("timed_out")).toBe("failed");
  });

  it("maps quarantined states", () => {
    expect(mapStepStatus("quarantined")).toBe("quarantined");
    expect(mapStepStatus("output_quarantined")).toBe("quarantined");
  });

  it("defaults to pending for unknown", () => {
    expect(mapStepStatus(undefined)).toBe("pending");
    expect(mapStepStatus("")).toBe("pending");
  });
});
