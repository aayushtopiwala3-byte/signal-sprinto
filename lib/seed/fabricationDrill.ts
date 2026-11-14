import { applyEvidenceTiers, tierForSignal } from "@/lib/rules/evidenceTier";
import { repriceSignals } from "@/lib/rules/signals";
import { timingScore, zeroUnsupported } from "@/lib/rules/verdict";
import { DEFAULT_WEIGHTS, type FiredSignal } from "@/lib/types";

/**
 * G6 §2 A.1 — make the `FABRICATED` tier fire once, visibly.
 *
 * `/health` reports `0 fabrications blocked`, which is honest: across every real run so far,
 * every bad quote has been *real text that failed the support test*, not invented text. But an
 * unfired branch is an unproven one, and "we have a check for that" is exactly the claim this
 * build refuses to accept from anyone else.
 *
 * So: a stored fixture, on a domain that cannot be mistaken for a company — `.invalid` is
 * reserved by RFC 2606 and can never resolve. The model's output is stubbed rather than
 * requested, because the point is to demonstrate the *check*, not to coax a real model into
 * lying. The quote below appears nowhere in the source text, and the verbatim test is what
 * catches it.
 *
 * This does **not** touch the Health counter. That counter reports what the real run found, and
 * padding it with a fixture would turn the best artifact in the build into a lie. The drill is
 * a separate, labelled surface and says so on screen.
 */

export const DRILL_DOMAIN = "fabrication-demo.invalid";

export const DRILL_SOURCE_URL = `https://${DRILL_DOMAIN}/security`;

/** Fixed source text. Note what it does *not* say: nothing about SOC 2, and no audit date. */
export const DRILL_SOURCE_TEXT = [
  "Security at Fabrication Demo.",
  "We encrypt data in transit and at rest, and we review access quarterly.",
  "Questions about our security practices can be sent to the team through the contact form.",
].join(" ");

/**
 * The stubbed AI output. Plausible, specific, well-formed — and absent from the source text
 * above. This is the shape a hallucination actually takes: not gibberish, but a sentence the
 * page could have contained and did not.
 */
export const DRILL_CLAIMED_QUOTE =
  "Fabrication Demo completed its SOC 2 Type II audit in March 2026 with zero exceptions.";

export type DrillResult = {
  domain: string;
  sourceUrl: string;
  sourceText: string;
  claimedQuote: string;
  /** Did the claimed quote appear verbatim in the source text? */
  verbatim: boolean;
  tier: string;
  tierReason: string | null;
  /** Points the signal would have scored had the quote been real. */
  pointsClaimed: number;
  /** Points it actually scores. */
  pointsAwarded: number;
  /** Whether the signal survives into the scoring set at all. */
  reachesScoring: boolean;
  timingScoreWithDrill: number;
};

/**
 * Runs the drill through the *same* functions the pipeline uses — `tierForSignal`,
 * `applyEvidenceTiers`, `repriceSignals`, `zeroUnsupported`. A drill that used a private
 * re-implementation would demonstrate nothing about the shipped code.
 */
export function runFabricationDrill(): DrillResult {
  const sources = [{ url: DRILL_SOURCE_URL, text: DRILL_SOURCE_TEXT }];

  const claimed: FiredSignal = {
    signal_id: "S-01",
    points: DEFAULT_WEIGHTS["S-01"],
    independence_group: "certification",
    quote: DRILL_CLAIMED_QUOTE,
    source_url: DRILL_SOURCE_URL,
  };

  const verdict = tierForSignal({
    signal_id: "S-01",
    quote: DRILL_CLAIMED_QUOTE,
    claimedUrl: DRILL_SOURCE_URL,
    sources,
    domain: DRILL_DOMAIN,
  });

  // The production path drops fabricated signals before scoring.
  const survived = applyEvidenceTiers([claimed], DRILL_DOMAIN, sources);
  const scored = zeroUnsupported(repriceSignals(survived, DEFAULT_WEIGHTS));

  return {
    domain: DRILL_DOMAIN,
    sourceUrl: DRILL_SOURCE_URL,
    sourceText: DRILL_SOURCE_TEXT,
    claimedQuote: DRILL_CLAIMED_QUOTE,
    verbatim: DRILL_SOURCE_TEXT.includes(DRILL_CLAIMED_QUOTE),
    tier: verdict.tier,
    tierReason: verdict.reason,
    pointsClaimed: DEFAULT_WEIGHTS["S-01"],
    pointsAwarded: scored[0]?.points ?? 0,
    reachesScoring: survived.length > 0,
    timingScoreWithDrill: timingScore(scored),
  };
}
