import { describe, it, expect } from "vitest";
import { computeVerdict, compareForBoard, independentSignals } from "@/lib/rules/verdict";
import { detectSignals } from "@/lib/rules/signals";
import { applyEvidenceTiers } from "@/lib/rules/evidenceTier";
import { evaluateFit } from "@/lib/rules/fit";
import type { FiredSignal } from "@/lib/types";
import {
  evidence,
  fittingEvidence,
  switches,
  weights,
  PAGE_FUNDING_ONLY,
  PAGE_CERT_IN_PROGRESS,
  PAGE_SECURITY_NO_BADGE,
  PAGE_CAREERS_SECURITY_ROLE,
  PAGE_PRICING_ENTERPRISE,
  PAGE_ENTERPRISE_LOGOS,
} from "./helpers";

/**
 * Verdict-math fixtures. `tier` defaults to `verified` because these cases are about the
 * thresholds and the independence count, not about evidence quality — R-23 itself is tested in
 * tests/evidenceTier.test.ts, and the asserted case is pinned explicitly further down.
 */
const signal = (
  signal_id: FiredSignal["signal_id"],
  points: number,
  group: FiredSignal["independence_group"],
  tier: FiredSignal["tier"] = "verified",
): FiredSignal => ({
  signal_id,
  points,
  independence_group: group,
  quote: "a sufficiently long verbatim sentence taken from the page",
  source_url: "https://example.com/",
  tier,
  tier_reason: tier === "verified" ? null : "downgraded for this test",
});

describe("T-03 — R-02 headcount gate (§5.1, §2.4)", () => {
  it("drops a 500+ company stated on its own site and names R-02a", () => {
    const result = computeVerdict(
      fittingEvidence({ size_band: "500+", size_source: "stated" }),
      [signal("S-01", 40, "certification"), signal("S-03", 30, "hiring")],
      weights(),
      switches(),
    );
    expect(result.verdict).toBe("DROP");
    expect(result.rule_fired).toBe("R-02a");
    expect(result.verdict_reason).toContain("headcount above 500");
  });

  it("names R-02b instead when the band was counted rather than read", () => {
    // Same verdict, different rule id, because the evidence behind it is weaker. A judge
    // reading the board has to be able to see which of the two happened.
    const result = computeVerdict(
      fittingEvidence({ size_band: "500+", size_source: "inferred" }),
      [],
      weights(),
      switches(),
    );
    expect(result.verdict).toBe("DROP");
    expect(result.rule_fired).toBe("R-02b");
    expect(result.verdict_reason).toContain("inferred");
  });

  it("does not fire on an unknown headcount — we never drop for a fact we failed to find", () => {
    const fit = evaluateFit(fittingEvidence({ size_band: null }), switches());
    expect(fit.pass).toBe(true);
  });

  it("R-02c flags the gap rather than silently passing the company through", () => {
    const fit = evaluateFit(fittingEvidence({ size_band: null }), switches());
    expect(fit.pass && fit.size_unknown).toBe(true);
    const known = evaluateFit(
      fittingEvidence({ size_band: "51-200", size_source: "stated" }),
      switches(),
    );
    expect(known.pass && known.size_unknown).toBe(false);
  });
});

describe("T-04 — R-01 B2B SaaS gate (§5.1)", () => {
  it("drops a non-SaaS company and names R-01", () => {
    const result = computeVerdict(
      fittingEvidence({ is_b2b_saas: false }),
      [signal("S-06", 10, "funding")],
      weights(),
      switches(),
    );
    expect(result.verdict).toBe("DROP");
    expect(result.rule_fired).toBe("R-01");
    expect(result.verdict_reason).toContain("not B2B SaaS");
  });

  it("holds rather than drops when is_b2b_saas is still null after the loop cap", () => {
    const result = computeVerdict(
      evidence({ is_b2b_saas: null }),
      [],
      weights(),
      switches(),
    );
    expect(result.verdict).toBe("HOLD");
    expect(result.verdict_reason).toBe("HOLD — fit unknown: is_b2b_saas not stated");
  });
});

describe("T-05 — a single weak signal never reaches SEND (§5.3, D-13)", () => {
  it("holds a company whose only signal is S-06 funding at 10 points", () => {
    const result = computeVerdict(
      fittingEvidence(),
      [signal("S-06", 10, "funding")],
      weights(),
      switches(),
    );
    expect(result.verdict).toBe("HOLD");
    expect(result.verdict).not.toBe("SEND");
    expect(result.timing_score).toBe(10);
    expect(result.rule_fired).toBe("R-20");
  });

  it("drops only when nothing fired at all, which is what the R-20 reason actually claims", () => {
    const result = computeVerdict(fittingEvidence(), [], weights(), switches());
    expect(result.verdict).toBe("DROP");
    expect(result.verdict_reason).toBe("R-20: fit passed, no timing signal");
  });

  it("R-23 — an asserted signal scores nothing and buys no independence", () => {
    const result = computeVerdict(
      fittingEvidence(),
      [
        signal("S-01", 40, "certification", "asserted"),
        signal("S-03", 30, "hiring", "asserted"),
      ],
      weights(),
      switches(),
    );

    expect(result.timing_score).toBe(0);
    expect(result.independent_signals).toBe(0);
    expect(result.verdict).toBe("DROP");
    // Still on the card, so the reader can see what was found and why it was not trusted.
    expect(result.fired_signals).toHaveLength(2);
    expect(result.fired_signals.every((s) => s.points === 0)).toBe(true);
  });

  it("R-23 — names the downgrade rather than claiming nothing was found", () => {
    // "No timing signal" and "no timing signal that held up" are different findings, and
    // reporting the first when the second is true hides the work R-23 did.
    const result = computeVerdict(
      fittingEvidence(),
      [signal("S-06", 10, "funding", "asserted")],
      weights(),
      switches(),
    );

    expect(result.rule_fired).toBe("R-23");
    expect(result.verdict_reason).toContain("none survived the evidence check");
    expect(result.verdict_reason).toContain("S-06");
  });

  it("R-23 — a verified signal alongside an asserted one scores only the verified half", () => {
    const result = computeVerdict(
      fittingEvidence(),
      [
        signal("S-01", 40, "certification", "verified"),
        signal("S-04", 25, "enterprise-demand", "asserted"),
      ],
      weights(),
      switches(),
    );

    expect(result.timing_score).toBe(40);
    expect(result.independent_signals).toBe(1);
    // 40 clears the score threshold; the second group was asserted, so R-21 is what bites.
    expect(result.rule_fired).toBe("R-20");
    expect(result.verdict).toBe("HOLD");
  });

  it("R-23 — an untiered signal is treated as unsupported, not waved through", () => {
    // Fail closed. Scoring an untiered signal would mean trusting that every path into the
    // verdict remembered to tier its evidence first.
    const untiered = {
      signal_id: "S-01" as const,
      points: 40,
      independence_group: "certification" as const,
      quote: "a sufficiently long verbatim sentence taken from the page",
      source_url: "https://example.com/",
    };
    const result = computeVerdict(fittingEvidence(), [untiered], weights(), switches());
    expect(result.timing_score).toBe(0);
  });

  it("detects S-06 alone from a funding page and still holds", () => {
    const fired = applyEvidenceTiers(
      detectSignals({ evidence: fittingEvidence(), pages: [PAGE_FUNDING_ONLY] }, weights()),
      "example.com",
      [{ url: PAGE_FUNDING_ONLY.url, text: PAGE_FUNDING_ONLY.text }],
    );
    expect(fired.map((f) => f.signal_id)).toEqual(["S-06"]);
    // "we have raised $12 million" — first person, on their own page, naming the claim.
    expect(fired[0].tier).toBe("verified");
    const result = computeVerdict(fittingEvidence(), fired, weights(), switches());
    expect(result.verdict).toBe("HOLD");
  });
});

describe("T-06 — S-01 and S-02 share one independence group (§5.2)", () => {
  it("counts two readings of the same page as one independent signal", () => {
    const fired = [signal("S-01", 40, "certification"), signal("S-02", 30, "certification")];
    expect(independentSignals(fired)).toBe(1);

    const result = computeVerdict(fittingEvidence(), fired, weights(), switches());
    expect(result.timing_score).toBe(70);
    expect(result.independent_signals).toBe(1);
    expect(result.verdict).toBe("HOLD");
    expect(result.rule_fired).toBe("R-21");
    expect(result.verdict_reason).toBe("R-21: only 1 independent signal");
  });

  it("reaches SEND once a genuinely independent group joins them", () => {
    const result = computeVerdict(
      fittingEvidence(),
      [
        signal("S-01", 40, "certification"),
        signal("S-02", 30, "certification"),
        signal("S-03", 30, "hiring"),
      ],
      weights(),
      switches(),
    );
    expect(result.independent_signals).toBe(2);
    expect(result.verdict).toBe("SEND");
  });

  it("does not double-count the certification group during live detection", () => {
    const fired = detectSignals(
      {
        evidence: fittingEvidence({ cert_status: "in_progress" }),
        pages: [PAGE_CERT_IN_PROGRESS],
      },
      weights(),
    );
    expect(independentSignals(fired)).toBe(1);
  });
});

describe("T-07 — strict_icp switches R-04 (§5.5)", () => {
  const certified = fittingEvidence({ cert_status: "certified" });
  const strongSignals = [signal("S-03", 30, "hiring"), signal("S-04", 25, "enterprise-demand")];

  it("drops a certified company when strict_icp is on", () => {
    const result = computeVerdict(
      certified,
      strongSignals,
      weights(),
      switches({ strict_icp: true }),
    );
    expect(result.verdict).toBe("DROP");
    expect(result.rule_fired).toBe("R-04");
    expect(result.verdict_reason).toContain("already certified");
  });

  it("routes to the migration play as a HOLD when strict_icp is off", () => {
    const result = computeVerdict(
      certified,
      strongSignals,
      weights(),
      switches({ strict_icp: false }),
    );
    expect(result.verdict).toBe("HOLD");
    expect(result.play).toBe("migration");
  });

  it("holds a migration company even on a weak score, so it is never dropped", () => {
    const result = computeVerdict(certified, [], weights(), switches({ strict_icp: false }));
    expect(result.verdict).toBe("HOLD");
    expect(result.play).toBe("migration");
  });

  it("ranks every migration company below every greenfield company", () => {
    const rows = [
      { domain: "migration.com", timing_score: 90, independent_signals: 3, play: "migration" },
      { domain: "greenfield.com", timing_score: 20, independent_signals: 1, play: "greenfield" },
    ];
    expect([...rows].sort(compareForBoard).map((r) => r.domain)).toEqual([
      "greenfield.com",
      "migration.com",
    ]);
  });
});

describe("verdict thresholds (§5.3)", () => {
  it("holds between 20 and 50 and names the score", () => {
    const result = computeVerdict(
      fittingEvidence(),
      [signal("S-04", 25, "enterprise-demand")],
      weights(),
      switches(),
    );
    expect(result.verdict).toBe("HOLD");
    expect(result.verdict_reason).toBe("R-20: timing score 25, below 50");
  });

  it("orders a column by score, then independence, then domain", () => {
    const rows = [
      { domain: "c.com", timing_score: 50, independent_signals: 2 },
      { domain: "a.com", timing_score: 70, independent_signals: 2 },
      { domain: "b.com", timing_score: 50, independent_signals: 3 },
      { domain: "a0.com", timing_score: 50, independent_signals: 2 },
    ];
    expect([...rows].sort(compareForBoard).map((r) => r.domain)).toEqual([
      "a.com",
      "b.com",
      "a0.com",
      "c.com",
    ]);
  });
});

describe("signal detection carries evidence or does not fire (§5.2)", () => {
  it("attaches a verbatim quote and a source url to every fired signal", () => {
    const fired = detectSignals(
      {
        evidence: fittingEvidence(),
        pages: [PAGE_CAREERS_SECURITY_ROLE, PAGE_PRICING_ENTERPRISE, PAGE_SECURITY_NO_BADGE],
      },
      weights(),
    );
    expect(fired.length).toBeGreaterThan(0);
    for (const s of fired) {
      expect(s.quote).toBeTruthy();
      expect(s.quote!.length).toBeGreaterThan(20);
      expect(s.source_url).toMatch(/^https:\/\//);
      // The quote must actually appear on the page it claims.
      const source = [
        PAGE_CAREERS_SECURITY_ROLE,
        PAGE_PRICING_ENTERPRISE,
        PAGE_SECURITY_NO_BADGE,
      ].find((p) => p.url === s.source_url)!;
      expect(source.text).toContain(s.quote!);
    }
  });

  it("fires S-02 only when the security page carries no badge", () => {
    const withoutBadge = detectSignals(
      { evidence: fittingEvidence(), pages: [PAGE_SECURITY_NO_BADGE] },
      weights(),
    );
    expect(withoutBadge.map((s) => s.signal_id)).toContain("S-02");

    const certified = detectSignals(
      {
        evidence: fittingEvidence({ cert_status: "certified" }),
        pages: [PAGE_SECURITY_NO_BADGE],
      },
      weights(),
    );
    expect(certified.map((s) => s.signal_id)).not.toContain("S-02");
  });

  it("fires S-04 only when enterprise proof is out of proportion to a small headcount", () => {
    const small = detectSignals(
      { evidence: fittingEvidence({ size_band: "11-50" }), pages: [PAGE_ENTERPRISE_LOGOS] },
      weights(),
    );
    expect(small.map((s) => s.signal_id)).toContain("S-04");

    const large = detectSignals(
      { evidence: fittingEvidence({ size_band: "201-500" }), pages: [PAGE_ENTERPRISE_LOGOS] },
      weights(),
    );
    expect(large.map((s) => s.signal_id)).not.toContain("S-04");
  });
});

describe("T-22 — weight changes re-price without re-detecting (§5.5)", () => {
  it("re-ranks from stored signals when the S-06 slider moves from 10 to 45", () => {
    const stored = [signal("S-06", 10, "funding"), signal("S-03", 30, "hiring")];

    const before = computeVerdict(fittingEvidence(), stored, weights(), switches());
    expect(before.timing_score).toBe(40);
    expect(before.verdict).toBe("HOLD");

    const after = computeVerdict(
      fittingEvidence(),
      stored,
      weights({ "S-06": 45 }),
      switches(),
    );
    expect(after.timing_score).toBe(75);
    expect(after.independent_signals).toBe(2);
    expect(after.verdict).toBe("SEND");
    // The evidence itself is untouched — only the price changed.
    expect(after.fired_signals.map((s) => s.quote)).toEqual(stored.map((s) => s.quote));
  });

  it("removes a signal from the independence count when its weight is zeroed", () => {
    const stored = [signal("S-06", 10, "funding"), signal("S-01", 40, "certification")];
    const after = computeVerdict(
      fittingEvidence(),
      stored,
      weights({ "S-06": 0 }),
      switches(),
    );
    expect(after.independent_signals).toBe(1);
    expect(after.timing_score).toBe(40);
  });
});
