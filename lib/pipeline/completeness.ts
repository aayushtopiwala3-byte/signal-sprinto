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
