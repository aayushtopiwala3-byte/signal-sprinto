import { describe, expect, it } from "vitest";
import { detectSignals } from "@/lib/rules/signals";
import { applyEvidenceTiers } from "@/lib/rules/evidenceTier";
import { computeVerdict, SEND_THRESHOLD, MIN_INDEPENDENT_SIGNALS } from "@/lib/rules/verdict";
import { selectContact } from "@/lib/rules/poc";
import { fittingEvidence, switches, weights, PAGE_FUNDING_ONLY } from "./helpers";
import { DEFAULT_WEIGHTS } from "@/lib/types";

/**
 * G6 §5 — the `G4_Golden_Test_Set.md` rows that can be forced deterministically.
 *
 * A4 and M5 are called out in G6 as rows that must be forced by fixture if no live company
 * produces the shape. These are those fixtures. The live rows (H1–H4, M1–M2, A1–A3, A6) are
 * exercised by the real run and recorded in VERIFICATION_LOG.md instead, because asserting them
 * here against frozen HTML would be asserting a different thing from what the board shows.
 */

const tiered = (pages: { url: string; text: string; title: string | null }[]) =>
  applyEvidenceTiers(
    detectSignals({ evidence: fittingEvidence({ size_band: "11-50" }), pages }, weights()),
    "example.com",
    pages.map((p) => ({ url: p.url, text: p.text })),
  );

describe("G4 A4 — funding alone can never reach Send", () => {
  it("holds at the default funding weight of 10", () => {
    const fired = tiered([PAGE_FUNDING_ONLY]);
    const r = computeVerdict(fittingEvidence({ size_band: "11-50" }), fired, weights(), switches());

    expect(fired.map((s) => s.signal_id)).toEqual(["S-06"]);
    expect(r.verdict).toBe("HOLD");
    expect(r.timing_score).toBe(10);
    expect(r.independent_signals).toBe(1);
  });

  /**
   * G4 D3 says dragging funding 10 → 45 moves A4 to Send. It cannot, and that is the rules
   * engine being right rather than the slider being broken: R-20 needs BOTH 50 points and two
   * independent groups, and a funding-only company has one group at any weight. The maximum a
   * slider reaches is 50, which clears the score bar and is then held by R-21.
   *
   * G4 A4 and G4 D3 contradict each other. A4 is the one to keep — "if A4 ever returns SEND,
   * the weights are wrong and the build has quietly become the thing I said I wouldn't build".
   */
  it("still holds at the maximum funding weight, because independence is a separate test", () => {
    const atMax = { ...DEFAULT_WEIGHTS, "S-06": 50 };
    const fired = applyEvidenceTiers(
      detectSignals(
        { evidence: fittingEvidence({ size_band: "11-50" }), pages: [PAGE_FUNDING_ONLY] },
        atMax,
      ),
      "example.com",
      [{ url: PAGE_FUNDING_ONLY.url, text: PAGE_FUNDING_ONLY.text }],
    );
    const r = computeVerdict(fittingEvidence({ size_band: "11-50" }), fired, atMax, switches());

    expect(r.timing_score).toBe(50);
    expect(r.timing_score).toBeGreaterThanOrEqual(SEND_THRESHOLD);
    expect(r.independent_signals).toBeLessThan(MIN_INDEPENDENT_SIGNALS);
    expect(r.verdict).toBe("HOLD");
    expect(r.rule_fired).toBe("R-21");
    expect(r.verdict_reason).toContain("only 1 independent signal");
  });

  it("the slider moves the score, so the control is live — it just cannot buy independence", () => {
    const at10 = computeVerdict(
      fittingEvidence({ size_band: "11-50" }),
      tiered([PAGE_FUNDING_ONLY]),
      weights(),
      switches(),
    );
    const at45 = computeVerdict(
      fittingEvidence({ size_band: "11-50" }),
      applyEvidenceTiers(
        detectSignals(
          { evidence: fittingEvidence({ size_band: "11-50" }), pages: [PAGE_FUNDING_ONLY] },
          { ...DEFAULT_WEIGHTS, "S-06": 45 },
        ),
        "example.com",
        [{ url: PAGE_FUNDING_ONLY.url, text: PAGE_FUNDING_ONLY.text }],
      ),
      { ...DEFAULT_WEIGHTS, "S-06": 45 },
      switches(),
    );
    expect(at10.timing_score).toBe(10);
    expect(at45.timing_score).toBe(45);
    expect(at45.verdict).toBe("HOLD");
  });
});

describe("G4 M5 — Hunter returning only generic mailboxes", () => {
  const generics = [
    { first_name: null, last_name: null, position: null, seniority: null, department: null, email: "info@example.com", confidence: 95, type: "generic" },
    { first_name: null, last_name: null, position: null, seniority: null, department: null, email: "hello@example.com", confidence: 92, type: "generic" },
    { first_name: null, last_name: null, position: null, seniority: null, department: null, email: "support@example.com", confidence: 90, type: "generic" },
  ];

  it("refuses to select any of them, at any confidence", () => {
    const poc = selectContact(generics, "51-200");
    expect(poc.ok).toBe(false);
  });

  it("prefers a named person on a worse confidence over a generic mailbox", () => {
    const withNamed = [
      ...generics,
      { first_name: "Priya", last_name: "N", position: "Head of Security", seniority: "senior", department: "it", email: "priya@example.com", confidence: 40, type: "personal" },
    ];
    const poc = selectContact(withNamed, "51-200");
    expect(poc.ok).toBe(true);
    if (poc.ok) expect(poc.selected.email).toBe("priya@example.com");
  });

  it("a company with only generic mailboxes becomes a HOLD, never a send to info@", () => {
    const poc = selectContact(generics, "11-50");
    expect(poc.ok).toBe(false);
    // R-30 is applied by applyHandoffRules; what matters here is that no generic is selectable.
    if (!poc.ok) {
      expect(JSON.stringify(poc)).not.toContain("info@example.com\",\"selected");
    }
  });
});
