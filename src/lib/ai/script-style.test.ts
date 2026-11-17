import { describe, expect, it } from "vitest";
import { cleanScript, removeScriptDashes } from "./script-style";

describe("script dash rule", () => {
  it("removes em and en dashes", () => {
    expect(removeScriptDashes("It works \u2014 really")).toBe("It works, really");
    expect(removeScriptDashes("Pages 5\u201310")).not.toMatch(/[\u2013\u2014-]/);
  });
  it("removes hyphens inside words and number ranges", () => {
    expect(removeScriptDashes("a follow-up call")).toBe("a follow up call");
    expect(removeScriptDashes("study 5-10 minutes")).toBe("study 5 to 10 minutes");
  });
  it("leaves hashtags alone but cleans every spoken field and option", () => {
    const out = cleanScript({ hook: "Quick-start", options: { hook: { a: "x - y", b: "ok" } }, hashtags: ["#a"] }) as { hook: string; options: { hook: { a: string } } };
    expect(out.hook).toBe("Quick start");
    expect(out.options.hook.a).toBe("x, y");
  });
});
