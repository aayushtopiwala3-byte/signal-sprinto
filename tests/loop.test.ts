import { describe, expect, it } from "vitest";
import { MAX_EXTRA_FETCHES, emptyFields, shouldContinue } from "@/lib/pipeline/completeness";
import { fallbackChoice } from "@/lib/pipeline/loop";
import { applyHandoffRules, loopMayContinue, timeLeftMs } from "@/lib/pipeline/runCompany";
import { computeVerdict } from "@/lib/rules/verdict";
import { evidence, fittingEvidence, switches, weights } from "./helpers";

/**
 * T-12 — the loop stops at exactly 4 extra fetches and hands off with the missing field named.
 *
 * Driven through the controller rather than through `runCompany`, because the property under
 * test is the stopping rule, not the HTTP stack. A test that needed the network to prove the
 * cap would be proving the network.
 */

describe("T-12 · the loop's stopping rule", () => {
  const incomplete = evidence({
    is_b2b_saas: true,
    is_b2b_saas_evidence: { quote: "We sell software to businesses.", url: "https://x.com/" },
    pressure_signals: [],
    // size_band and cert_status stay null, so the loop always has a reason to keep going.
  });

  it("keeps going for fetches 0 through 3 and stops at exactly 4", () => {
    for (let used = 0; used < MAX_EXTRA_FETCHES; used++) {
      expect(shouldContinue(incomplete, used).continue, `at ${used} fetches`).toBe(true);
    }
    expect(shouldContinue(incomplete, MAX_EXTRA_FETCHES).continue).toBe(false);
  });

  it("names the fields that are still unknown when it gives up", () => {
    const stop = shouldContinue(incomplete, MAX_EXTRA_FETCHES);
    expect(stop.missing).toEqual(["size_band", "cert_status"]);
    expect(stop.reason).toContain("size_band, cert_status");
    expect(stop.reason).toContain(`${MAX_EXTRA_FETCHES}/${MAX_EXTRA_FETCHES}`);
  });

  it("stops the moment all four fields are filled, before the cap", () => {
    const full = fittingEvidence();
    expect(emptyFields(full)).toEqual([]);
    expect(shouldContinue(full, 1).continue).toBe(false);
  });

  it("hands the company off as HOLD under R-22 rather than guessing the missing field", () => {
    const base = computeVerdict(fittingEvidence(), [], weights(), switches());
    expect(base.verdict).toBe("DROP");

    const handed = applyHandoffRules(base, {
      fitPass: true,
      missing: ["size_band", "cert_status"],
      fetchesUsed: MAX_EXTRA_FETCHES,
      hasNamedContact: true,
    });

    expect(handed.verdict).toBe("HOLD");
    expect(handed.rule_fired).toBe("R-22");
    expect(handed.verdict_reason).toContain("size_band, cert_status");
    expect(handed.verdict_reason).toContain("not stated");
  });

  it("leaves a fit-gate DROP alone — an evidenced rejection is not made uncertain by a gap", () => {
    const nonSaas = computeVerdict(
      evidence({
        is_b2b_saas: false,
        is_b2b_saas_evidence: { quote: "We run a chain of coffee shops.", url: "https://x.com/" },
      }),
      [],
      weights(),
      switches(),
    );
    expect(nonSaas.rule_fired).toBe("R-01");

    const handed = applyHandoffRules(nonSaas, {
      fitPass: false,
      missing: ["size_band"],
      fetchesUsed: MAX_EXTRA_FETCHES,
      hasNamedContact: false,
    });
    expect(handed).toEqual(nonSaas);
  });
});

describe("T-12 · the loop never re-reads a page it has already read", () => {
  const candidates = [
    { url: "https://x.com/careers", label: "Careers" },
    { url: "https://www.x.com/careers", label: "Careers" },
    { url: "https://x.com/security", label: "Security" },
  ];

  it("treats www and bare hosts as the same page, so the cap is not spent twice", () => {
    const choice = fallbackChoice({
      domain: "x.com",
      emptyFields: ["size_band"],
      candidates,
      alreadyFetched: ["https://x.com/careers"],
    });
    expect(choice.url).not.toContain("careers");
  });

  it("falls through to the next empty field once its own candidates are exhausted", () => {
    const choice = fallbackChoice({
      domain: "x.com",
      emptyFields: ["cert_status"],
      candidates,
      alreadyFetched: [],
    });
    expect(choice.url).toBe("https://x.com/security");
    expect(choice.chosen_by).toBe("fallback");
    expect(choice.targetField).toBe("cert_status");
  });
});

describe("the handler's own clock", () => {
  it("keeps reading while the tail still fits", () => {
    expect(loopMayContinue(0)).toBe(true);
    expect(loopMayContinue(25_000)).toBe(true);
  });

  it("stops opening pages once only the tail's reserve is left", () => {
    // 55s budget less a 25s reserve for scoring, Hunter and the two model calls.
    expect(loopMayContinue(30_000)).toBe(false);
    expect(loopMayContinue(54_000)).toBe(false);
  });

  it("reports time left as negative once the budget is blown, never wrapping positive", () => {
    expect(timeLeftMs(60_000)).toBeLessThan(0);
  });
});
