import type { EvidenceMap, Switches } from "@/lib/types";

/**
 * §5.1 — the FIT gate. Binary, runs first, failure means DROP.
 *
 * Deterministic plain TypeScript. No model is consulted here and none ever should be: if you
 * find yourself asking Gemini whether a company is a fit, the architecture has been inverted.
 */

export type FitResult =
  | { pass: true; play: "greenfield" | "migration"; note: string | null }
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

  // R-02 — a null size_band is unknown, not large, so it does not fire.
  if (evidence.size_band === "500+") {
    return {
      pass: false,
      verdict: "DROP",
      rule_fired: "R-02",
      verdict_reason: "DROP — R-02: headcount above 500, has in-house GRC",
    };
  }

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
    };
  }

  return { pass: true, play: "greenfield", note: null };
}
