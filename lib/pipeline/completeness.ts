import { LOOP_FIELDS, type EvidenceMap, type LoopField } from "@/lib/types";

/**
 * ⑤ The completeness check (§7.1).
 *
 * Plain code counts null fields. The model is never asked "is this enough?" — that is the
 * decision the loop turns on, and handing it to a model would make the agent's stopping
 * condition a matter of opinion.
 */

/** §7.3 — set before any code was written. Do not make this dynamic. */
export const MAX_EXTRA_FETCHES = 4;

export function emptyFields(evidence: EvidenceMap): LoopField[] {
  return LOOP_FIELDS.filter((field) => {
    const value = evidence[field];
    // pressure_signals may legitimately be an empty array; only null means "not yet read".
    if (field === "pressure_signals") return value === null;
    return value === null;
  });
}

export function isComplete(evidence: EvidenceMap): boolean {
  return emptyFields(evidence).length === 0;
}

/**
 * R-02c (§2.4) — the fields whose absence actually makes a verdict unsound.
 *
 * This is deliberately NOT the same set the loop chases. The loop should keep trying to fill
 * every field; the question here is narrower: which gaps mean we must not decide at all.
 *
 * `size_band` is excluded, and that exclusion is the whole point of R-02c. An unknown headcount
 * cannot drop a company (R-02c) — but R-22 was then re-imposing the same gate one rule later as
 * a HOLD, so unknown size still decided the outcome and F-2 survived the fix that was supposed
 * to close it. rocketlane.com is the case that exposed it: 55 points across 3 independent
 * groups, every signal verified, held because nobody publishes a readable careers page at a URL
 * we can guess. The gap is real, but it is not a reason to disbelieve three verified signals —
 * so it is carried as `size_unknown` and named in the counterfactual instead of gating.
 *
 * The other three do gate. Without `is_b2b_saas` we cannot say R-01 passed; without
 * `cert_status` the play is a coin flip between greenfield and migration, and the email would
 * open on the wrong angle; `pressure_signals` is what the signals are read from.
 */
export const VERDICT_CRITICAL_FIELDS: readonly LoopField[] = LOOP_FIELDS.filter(
  (f) => f !== "size_band",
);

/** The subset of `emptyFields` that R-22 is allowed to hand off on. */
export function blockingFields(evidence: EvidenceMap): LoopField[] {
  return emptyFields(evidence).filter((f) => VERDICT_CRITICAL_FIELDS.includes(f));
}

/**
 * The loop's stopping decision, in one deterministic place.
 * At the cap the answer is never "try harder" — it is a handoff (§7.3).
 */
export function shouldContinue(
  evidence: EvidenceMap,
  fetchesUsed: number,
): { continue: boolean; reason: string; missing: LoopField[] } {
  const missing = emptyFields(evidence);

  if (missing.length === 0) {
    return { continue: false, reason: "all four Evidence Map fields are filled", missing };
  }
  if (fetchesUsed >= MAX_EXTRA_FETCHES) {
    return {
      continue: false,
      reason: `${MAX_EXTRA_FETCHES}/${MAX_EXTRA_FETCHES} fetches used — handing off with ${missing.join(", ")} still unknown`,
      missing,
    };
  }
  return {
    continue: true,
    reason: `${missing.length} field(s) still empty, ${fetchesUsed}/${MAX_EXTRA_FETCHES} extra fetches used`,
    missing,
  };
}
