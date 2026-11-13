import { describe, expect, it } from "vitest";
import { counterfactualFor, type CounterfactualInput } from "@/lib/rules/counterfactual";
import { DEFAULT_WEIGHTS } from "@/lib/types";

/**
 * §6.2. The cases below are the live board: zerodha dropped on R-01, whatfix on R-02a,
 * nected on R-23, rocketlane sent at 55 with an unknown headcount.
 */

const base = (over: Partial<CounterfactualInput> = {}): CounterfactualInput => ({
  domain: "example.com",
  verdict: "HOLD",
  rule_fired: "R-20",
  timing_score: 40,
  independent_signals: 2,
  firedSignalIds: ["S-06", "S-07"],
  firedGroups: ["funding", "vertical"],
  weights: DEFAULT_WEIGHTS,
  security_page_checked: true,
  security_page_url: null,
  size_band: "11-50",
  size_source: "stated",
  ...over,
});

describe("§6.2 · the counterfactual is computed, not templated", () => {
  it("marks a non-SaaS drop as finished rather than as a gap", () => {
    const c = counterfactualFor(base({ verdict: "DROP", rule_fired: "R-01" }));
    expect(c.actionable).toBe(false);
    expect(c.text).toContain("finished question");
  });

  it("names the missing signal, its label and its points", () => {
    const c = counterfactualFor(base({ timing_score: 40 }));
    expect(c.actionable).toBe(true);
    // 10 short of 50, and S-01 at 40 is the largest unfired signal.
    expect(c.text).toContain("10 points short");
    expect(c.text).toContain("S-01");
    expect(c.text).toContain("+40");
  });

  it("says we already looked when the security page does not exist", () => {
    const c = counterfactualFor(base({ timing_score: 40, security_page_checked: true }));
    expect(c.text).toContain("found none");
    // Nothing to link to — suggesting a page we know is absent would waste the click.
    expect(c.suggestedUrl).toBeUndefined();
  });

  it("names the independence problem rather than asking for more points", () => {
    const c = counterfactualFor(
      base({
        timing_score: 60,
        independent_signals: 1,
        firedSignalIds: ["S-01", "S-02"],
        firedGroups: ["certification"],
      }),
    );
    expect(c.text).toContain("not independent");
    expect(c.text).toContain("certification");
    // The arithmetic advice would be actively wrong here.
    expect(c.text).not.toContain("points short");
  });

  it("offers an inline size override on an inferred-size drop, with the count", () => {
    const c = counterfactualFor(
      base({ verdict: "DROP", rule_fired: "R-02b", inferred_role_count: 61 }),
    );
    expect(c.override).toBe("size_band");
    expect(c.text).toContain("61 open roles");
    expect(c.text).toContain("guess");
  });

  it("offers the override on a stated-size drop too, without inventing a count", () => {
    const c = counterfactualFor(base({ verdict: "DROP", rule_fired: "R-02a" }));
    expect(c.override).toBe("size_band");
    expect(c.text).not.toContain("open roles");
  });

  it("tells the R-23 reader what kind of quote would count", () => {
    const c = counterfactualFor(base({ verdict: "DROP", rule_fired: "R-23", timing_score: 0 }));
    expect(c.text).toContain("evidence check");
    expect(c.text).toContain("names this company");
  });

  it("a Send with an unknown headcount still names the risk, and is not actionable", () => {
    const c = counterfactualFor(
      base({ verdict: "SEND", rule_fired: "R-20", timing_score: 55, size_band: null }),
    );
    expect(c.actionable).toBe(false);
    expect(c.text).toContain("above 500");
  });

  it("a Send with a known headcount simply says it is ready", () => {
    const c = counterfactualFor(
      base({ verdict: "SEND", rule_fired: "R-20", timing_score: 55, size_band: "11-50" }),
    );
    expect(c.actionable).toBe(false);
    expect(c.text).toContain("ready to send");
  });

  it("is deterministic — the same company always yields the same sentence (§11)", () => {
    const input = base({ timing_score: 35 });
    expect(counterfactualFor(input).text).toBe(counterfactualFor(input).text);
  });

  it("never returns an empty sentence for any rule the engine can fire", () => {
    for (const rule of ["R-01", "R-02a", "R-02b", "R-03", "R-04", "R-20", "R-21", "R-22", "R-23", "R-30"]) {
      const c = counterfactualFor(base({ rule_fired: rule, verdict: "DROP", timing_score: 0 }));
      expect(c.text.length, rule).toBeGreaterThan(20);
    }
  });
});
