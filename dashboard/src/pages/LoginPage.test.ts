import { describe, it, expect } from "vitest";
import { isSafeReturnUrl } from "./LoginPage";

describe("isSafeReturnUrl", () => {
  it("accepts valid relative paths", () => {
    expect(isSafeReturnUrl("/")).toBe("/");
    expect(isSafeReturnUrl("/dashboard")).toBe("/dashboard");
    expect(isSafeReturnUrl("/jobs?status=failed")).toBe("/jobs?status=failed");
    expect(isSafeReturnUrl("/workflows/abc/runs/123")).toBe("/workflows/abc/runs/123");
  });

  it("rejects null/undefined/empty", () => {
    expect(isSafeReturnUrl(null)).toBe("/");
    expect(isSafeReturnUrl("")).toBe("/");
    expect(isSafeReturnUrl("  ")).toBe("/");
  });

  it("rejects absolute URLs (open redirect)", () => {
    expect(isSafeReturnUrl("https://evil.com")).toBe("/");
    expect(isSafeReturnUrl("http://evil.com")).toBe("/");
    expect(isSafeReturnUrl("ftp://evil.com")).toBe("/");
  });

  it("rejects protocol-relative URLs", () => {
    expect(isSafeReturnUrl("//evil.com")).toBe("/");
    expect(isSafeReturnUrl("//evil.com/path")).toBe("/");
  });

  it("rejects javascript: and data: schemes", () => {
    expect(isSafeReturnUrl("javascript:alert(1)")).toBe("/");
    expect(isSafeReturnUrl("data:text/html,<script>")).toBe("/");
  });

  it("rejects URLs with embedded whitespace or colons", () => {
    expect(isSafeReturnUrl("/foo bar")).toBe("/");
    expect(isSafeReturnUrl("/foo:bar")).toBe("/");
  });
});
