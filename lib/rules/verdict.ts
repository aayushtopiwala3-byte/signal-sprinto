import type { EvidenceMap, FiredSignal, Switches, VerdictResult, Weights } from "@/lib/types";
import { evaluateFit } from "@/lib/rules/fit";
import { repriceSignals } from "@/lib/rules/signals";

/**
 * §5.3 — the verdict.
 *
 *   SEND  score >= 50 AND independent groups >= 2
 *   HOLD  score >= 50 AND groups < 2      R-21: only 1 independent signal
 *   HOLD  20 <= score < 50                R-20: timing score X, below 50
 *   DROP  score < 20                      R-20: fit passed, no timing signal
 *
 * Deterministic: no Math.random, no Date.now, no I/O. Enforced by tests/determinism.test.ts,
 * which greps this directory rather than trusting the convention.
 */

export const SEND_THRESHOLD = 50;
export const HOLD_THRESHOLD = 20;
export const MIN_INDEPENDENT_SIGNALS = 2;

export function timingScore(fired: FiredSignal[]): number {
  return fired.reduce((sum, s) => sum + s.points, 0);
}

/** R-21 — distinct independence groups, not distinct signals. */
export function independentSignals(fired: FiredSignal[]): number {
  return new Set(fired.filter((s) => s.points > 0).map((s) => s.independence_group)).size;
}

/**
 * R-23 — only verified evidence scores (§3.1). An asserted signal keeps its place in
 * `fired_signals` so the card can show it greyed with its reason, but its points are zeroed
 * here, which removes it from `timingScore` and from `independentSignals` in one move.
 *
 * A signal with no tier at all is treated as unsupported. Scoring it would mean trusting that
 * every path into the verdict remembered to tier its evidence first, and the whole point of
 * R-23 is to stop relying on that kind of memory.
 */
export function zeroUnsupported(fired: FiredSignal[]): FiredSignal[] {
  return fired.map((s) => (s.tier === "verified" ? s : { ...s, points: 0 }));
}

export function computeVerdict(
  evidence: EvidenceMap,
  firedRaw: FiredSignal[],
  weights: Weights,
  switches: Switches,
): VerdictResult {
  // Order matters. Reprice first so a slider at 0 removes a signal entirely (T-22), then zero
  // what R-23 will not score — otherwise an asserted signal would be filtered out as weightless
  // and the card would lose the very downgrade it is supposed to display.
  const fired = zeroUnsupported(repriceSignals(firedRaw, weights).filter((s) => s.points > 0));
  const score = timingScore(fired);
  const groups = independentSignals(fired);
  const verified = fired.filter((s) => s.tier === "verified");

  const fit = evaluateFit(evidence, switches);

  if (!fit.pass) {
    return {
      verdict: fit.verdict,
      timing_score: score,
      independent_signals: groups,
      play: "greenfield",
      verdict_reason: fit.verdict_reason,
      rule_fired: fit.rule_fired,
      fired_signals: fired,
      what_would_change_it: whatWouldChangeFit(fit.rule_fired, fit.verdict),
    };
  }

  const play = fit.play;
  const base = {
    timing_score: score,
    independent_signals: groups,
    play,
    fired_signals: fired,
  };

  // A certified company on the migration play is never a cold Send and never a Drop — it is a
  // different conversation, held for a human and ranked below every greenfield company (§5.5).
  if (play === "migration") {
    return {
      ...base,
      verdict: "HOLD",
      rule_fired: "R-04",
      verdict_reason: `HOLD — R-04: already certified, routed to the migration play (strict_icp off). Timing score ${score} across ${groups} independent signal${groups === 1 ? "" : "s"}.`,
      what_would_change_it:
        "Turning strict_icp on would drop this instead. The migration play targets companies switching compliance vendors, not first-time certification.",
    };
  }

  if (score >= SEND_THRESHOLD && groups >= MIN_INDEPENDENT_SIGNALS) {
    return {
      ...base,
      verdict: "SEND",
      rule_fired: "R-20",
      verdict_reason: `SEND — R-20: timing score ${score} with ${groups} independent signals.`,
      what_would_change_it: null,
    };
  }

  if (score >= SEND_THRESHOLD) {
    return {
      ...base,
      verdict: "HOLD",
      rule_fired: "R-21",
      verdict_reason: "R-21: only 1 independent signal",
      what_would_change_it:
        "One more independent signal would move this to Send. The score already clears 50; it is the independence test that is failing.",
    };
  }

  if (score >= HOLD_THRESHOLD) {
    return {
      ...base,
      verdict: "HOLD",
      rule_fired: "R-20",
      verdict_reason: `R-20: timing score ${score}, below 50`,
      what_would_change_it: `${SEND_THRESHOLD - score} more points${
        groups >= MIN_INDEPENDENT_SIGNALS
          ? ""
          : ` and ${MIN_INDEPENDENT_SIGNALS - groups} more independent signal`
      } would move this to Send.`,
    };
  }

  // §5.3's DROP branch reads "fit passed, no timing signal", and that reason is only true when
  // nothing fired at all. A company with one weak signal — S-06 alone is 10 points — has a
  // timing signal, so dropping it would contradict the stated reason. It holds instead, which
  // is also what T-05 asserts. See DECISIONS.md D-13.
  // Counted on verified signals only. An asserted signal is not a weak timing signal, it is an
  // unsupported claim — holding on it would mean the quote bought the company a verdict it
  // could not earn, which is exactly what R-23 was added to stop.
  if (verified.length > 0) {
    return {
      ...base,
      verdict: "HOLD",
      rule_fired: "R-20",
      verdict_reason: `R-20: timing score ${score}, below the ${HOLD_THRESHOLD}-point floor — ${verified.length} weak signal${verified.length === 1 ? "" : "s"} only`,
      what_would_change_it: `${SEND_THRESHOLD - score} more points across ${Math.max(
        MIN_INDEPENDENT_SIGNALS - groups,
        0,
      )} further independent signal(s) would move this to Send.`,
    };
  }

  // "No timing signal" and "no timing signal that held up" are different findings, and the
  // second one is the more useful of the two: it says we found something and rejected it.
  const downgraded = fired.filter((s) => s.tier === "asserted");
  if (downgraded.length > 0) {
    const ids = downgraded.map((s) => s.signal_id).join(", ");
    return {
      ...base,
      verdict: "DROP",
      rule_fired: "R-23",
      verdict_reason: `R-23: ${downgraded.length} signal${
        downgraded.length === 1 ? "" : "s"
      } found (${ids}) but none survived the evidence check — every quote was real and none of them supported the claim`,
      what_would_change_it:
        "A quote that names this company and speaks to the claim it is attached to. The sentences we found are genuine text from their site, but they are about somebody else, some other time, or some other subject.",
    };
  }

  return {
    ...base,
    verdict: "DROP",
    rule_fired: "R-20",
    verdict_reason: "R-20: fit passed, no timing signal",
    what_would_change_it:
      "They fit the ICP but nothing on their site suggests compliance pressure right now. Worth re-running after a funding announcement or a security-page change.",
  };
}

function whatWouldChangeFit(rule: string, verdict: "DROP" | "HOLD"): string | null {
  if (verdict === "HOLD") {
    return "We could not establish whether they sell software to businesses. This is a handoff, not a rejection — one look at their homepage settles it.";
  }
  switch (rule) {
    case "R-01":
      return "Nothing. They do not sell software to businesses, so no timing signal could rescue this.";
    case "R-02":
      return "Nothing in this product. Above 500 people they almost certainly have in-house GRC and buy differently.";
    case "R-03":
      return "Nothing. A services business has no product to certify in the way Sprinto's ICP assumes.";
    case "R-04":
      return "Turning strict_icp off would route this to the migration play as a HOLD instead of dropping it.";
    default:
      return null;
  }
}

/**
 * Ordering inside a column (§5.3): timing_score desc → independent_signals desc → domain
 * alphabetical. Migration-play companies rank below every greenfield company (§5.5).
 */
export function compareForBoard(
  a: { timing_score: number; independent_signals: number; domain: string; play?: string | null },
  b: { timing_score: number; independent_signals: number; domain: string; play?: string | null },
): number {
  const aMigration = a.play === "migration" ? 1 : 0;
  const bMigration = b.play === "migration" ? 1 : 0;
  if (aMigration !== bMigration) return aMigration - bMigration;
  if (a.timing_score !== b.timing_score) return b.timing_score - a.timing_score;
  if (a.independent_signals !== b.independent_signals)
    return b.independent_signals - a.independent_signals;
  return a.domain.localeCompare(b.domain);
}
