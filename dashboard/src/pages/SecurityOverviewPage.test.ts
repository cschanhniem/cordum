import { describe, it, expect } from "vitest";

describe("SecurityOverviewPage", () => {
  it("exports default SecurityOverviewPage component", async () => {
    const mod = await import("./SecurityOverviewPage");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });
});
