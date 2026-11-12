import type { EvidenceMap, Switches } from "@/lib/types";

/**
 * §5.1 — the FIT gate. Binary, runs first, failure means DROP.
 *
 * Deterministic plain TypeScript. No model is consulted here and none ever should be: if you
 * find yourself asking Gemini whether a company is a fit, the architecture has been inverted.
 */

export type FitResult =
  | {
      pass: true;
      play: "greenfield" | "migration";
      note: string | null;
      /** R-02c. True when the company passed the size gate only because size is unknown. */
      size_unknown?: boolean;
    }
  | { pass: false; verdict: "DROP" | "HOLD"; rule_fired: string; verdict_reason: string };

export function evaluateFit(evidence: EvidenceMap, switches: Switches): FitResult {
  // We do not drop a company for a fact we failed to find. An unknown fit is a handoff to a
  // human, not a rejection (§5.1).
  if (evidence.is_b2b_saas === null) {
    return {
      pass: false,
      verdict: "HOLD",
      rule_fired: "R-01",
      verdict_reason: "HOLD — fit unknown: is_b2b_saas not stated",
    };
  }

  // R-01
  if (evidence.is_b2b_saas === false) {
    return {
      pass: false,
      verdict: "DROP",
      rule_fired: "R-01",
      verdict_reason: "DROP — R-01: not B2B SaaS",
    };
  }

  // R-02 — three paths (§2.4), because "we read it on their site" and "we counted their job
  // ads" are not the same claim, and this rule discards a company. A single R-02 collapsed both
  // into a bare band, which meant the card could not show which one had happened.
  if (evidence.size_band === "500+") {
    const inferred = evidence.size_source === "inferred";
    return {
      pass: false,
      verdict: "DROP",
      // R-02b is the weaker evidence and is labelled as such wherever the rule id appears.
      rule_fired: inferred ? "R-02b" : "R-02a",
      verdict_reason: inferred
        ? "DROP — R-02b: headcount inferred above 500 from the number of open roles, so they will already have in-house GRC"
        : "DROP — R-02a: headcount above 500, stated on their own site — has in-house GRC",
    };
  }

  // R-02c — unknown size does not gate. We do not drop a company for a fact we failed to find,
  // but the gap is carried forward rather than forgotten: `size_unknown` puts it in the
  // counterfactual, so the card says what would change the verdict instead of going quiet.
  const sizeUnknown = evidence.size_band === null;

  // R-03
  if (evidence.is_services === true) {
    return {
      pass: false,
      verdict: "DROP",
      rule_fired: "R-03",
      verdict_reason: "DROP — R-03: services business, not a software product",
    };
  }

  // R-04 — switchable (§5.5). ON drops certified companies; OFF routes them to the
  // migration play instead of discarding a real, if different, opportunity.
  if (evidence.cert_status === "certified") {
    if (switches.strict_icp) {
      return {
        pass: false,
        verdict: "DROP",
        rule_fired: "R-04",
        verdict_reason: "DROP — R-04: already certified",
      };
    }
    return {
      pass: true,
      play: "migration",
      note: "Already certified. strict_icp is off, so this routes to the migration play and ranks below every greenfield company.",
      size_unknown: sizeUnknown,
    };
  }

  return { pass: true, play: "greenfield", note: null, size_unknown: sizeUnknown };
}
