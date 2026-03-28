import { describe, it, expect } from "vitest";
import { formatDuration } from "@/lib/utils";

/**
 * Tests for useElapsedTimer logic — elapsed computation and edge cases.
 * Tests the pure computation without React rendering.
 */

function computeElapsed(startTime: string | null | undefined, isActive: boolean): { elapsed: number; formatted: string } {
  if (!isActive || !startTime) {
    return { elapsed: 0, formatted: "—" };
  }
  const startMs = new Date(startTime).getTime();
  if (isNaN(startMs)) {
    return { elapsed: 0, formatted: "—" };
  }
  const diff = Date.now() - startMs;
  const elapsed = diff > 0 ? diff : 0;
  return { elapsed, formatted: formatDuration(elapsed) };
}

describe("useElapsedTimer computation", () => {
  it("returns zero for inactive timer", () => {
    const result = computeElapsed("2026-01-01T00:00:00Z", false);
    expect(result.elapsed).toBe(0);
    expect(result.formatted).toBe("—");
  });

  it("returns zero for null startTime", () => {
    const result = computeElapsed(null, true);
    expect(result.elapsed).toBe(0);
    expect(result.formatted).toBe("—");
  });

  it("returns zero for undefined startTime", () => {
    const result = computeElapsed(undefined, true);
    expect(result.elapsed).toBe(0);
    expect(result.formatted).toBe("—");
  });

  it("returns zero for invalid startTime", () => {
    const result = computeElapsed("not-a-date", true);
    expect(result.elapsed).toBe(0);
    expect(result.formatted).toBe("—");
  });

  it("clamps future startTime to zero", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const result = computeElapsed(future, true);
    expect(result.elapsed).toBe(0);
  });

  it("computes positive elapsed for past startTime", () => {
    const past = new Date(Date.now() - 5000).toISOString();
    const result = computeElapsed(past, true);
    expect(result.elapsed).toBeGreaterThan(0);
    expect(result.elapsed).toBeLessThan(10_000);
    expect(result.formatted).not.toBe("—");
  });

  it("formatted output uses formatDuration format", () => {
    const past = new Date(Date.now() - 65_000).toISOString();
    const result = computeElapsed(past, true);
    // 65 seconds = "1m Xs"
    expect(result.formatted).toMatch(/1m \d+s/);
  });
});
