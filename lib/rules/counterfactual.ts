/**
 * §6.2 — "what would move this", computed rather than templated.
 *
 * `what_would_change_it` on the verdict already says something true for each branch, but it says
 * the same thing for every company that lands in that branch: *"10 more points would move this to
 * Send"* tells a reader the arithmetic they can already do. What they cannot do from the card is
 * work out **which** signal is missing, what it is worth under the current weights, and whether
 * we already looked for it — and that is the difference between a list to read and a queue to
 * work through.
 *
 * So this is deliberately a second, richer pass over the same facts, not a replacement. The
 * verdict keeps its own reason string (that is the audit record); this is the next action.
 *
 * `actionable: false` matters as much as the text. A company dropped on R-01 is not a lead with
 * a missing piece — it is a finished question, and saying so stops someone re-checking it every
 * week. Pretending every row has a next step would make the queue useless by filling it.
 */

import { INDEPENDENCE_GROUP, SIGNAL_LABEL } from "@/lib/rules/signals";
import { HOLD_THRESHOLD, MIN_INDEPENDENT_SIGNALS, SEND_THRESHOLD } from "@/lib/rules/verdict";
import type { SignalId, Weights } from "@/lib/types";

export type Counterfactual = {
  /** One sentence for the board card; the detail page shows the same text expanded. */
  text: string;
  /** False when nothing about this company could change the verdict. */
  actionable: boolean;
  /** A page worth opening next, when there is an obvious one. */
  suggestedUrl?: string;
  /** Set when the reader should be offered an inline correction (R-02b). */
  override?: "size_band";
};

export type CounterfactualInput = {
  domain: string;
  verdict: string | null;
  rule_fired: string | null;
  timing_score: number | null;
  independent_signals: number | null;
  /** Only the signals that scored. An asserted signal did not contribute and is not "found". */
  firedSignalIds: SignalId[];
  /** The groups that actually scored, for the independence case. */
  firedGroups: string[];
  weights: Weights;
  security_page_checked: boolean;
  security_page_url: string | null;
  size_band: string | null;
  size_source: string | null;
  /** How many open roles the size inference counted, when it inferred one. */
  inferred_role_count?: number | null;
};

/** The highest-value signal that has not fired, so the suggestion is worth the reader's time. */
function bestMissingSignal(
  fired: SignalId[],
  weights: Weights,
): { id: SignalId; points: number } | null {
  const all = Object.keys(weights) as SignalId[];
  const candidates = all
    .filter((id) => !fired.includes(id))
    .map((id) => ({ id, points: weights[id] }))
    .filter((c) => c.points > 0)
    // Deterministic: by points, then by id, never by object order (§11).
    .sort((a, b) => b.points - a.points || a.id.localeCompare(b.id));
  return candidates[0] ?? null;
}

/** A group that has not scored yet, so a signal from it would actually add independence. */
function missingGroup(firedGroups: string[], fired: SignalId[], weights: Weights): string | null {
  const all = Object.keys(weights) as SignalId[];
  const unfired = all
    .filter((id) => !fired.includes(id) && weights[id] > 0)
    .map((id) => INDEPENDENCE_GROUP[id])
    .filter((g) => !firedGroups.includes(g));
  return [...new Set(unfired)].sort()[0] ?? null;
}

export function counterfactualFor(input: CounterfactualInput): Counterfactual {
  const rule = input.rule_fired ?? "";
  const score = input.timing_score ?? 0;
  const groups = input.independent_signals ?? 0;

  /* ---------------------------------------------------------------- fit drops */

  if (rule === "R-01") {
    return {
      text: "Not a software product sold to businesses. Nothing on this site would change that — this is a finished question, not a gap.",
      actionable: false,
    };
  }

  if (rule === "R-03") {
    return {
      text: "A services business rather than a software product. Re-reading the site will not change that.",
      actionable: false,
    };
  }

  if (rule === "R-02a") {
    return {
      text: `Headcount above 500 is stated on their own site, so they almost certainly run compliance in-house. If that number is out of date, correcting the size band here re-scores them with no refetch.`,
      actionable: true,
      override: "size_band",
    };
  }

  if (rule === "R-02b") {
    const n = input.inferred_role_count;
    return {
      text: `Dropped on inferred size${
        n ? ` (${n} open roles counted)` : ""
      }. That is a guess from their careers page, not a stated figure — if it is wrong, correct the size band here and it re-scores.`,
      actionable: true,
      override: "size_band",
    };
  }

  if (rule === "R-04") {
    return {
      text: "Already certified, so this is a migration conversation rather than a cold first-certification pitch. Turning on “Drop already-certified companies” would drop them instead.",
      actionable: true,
    };
  }

  /* --------------------------------------------------------- the handoff rules */

  if (rule === "R-22") {
    return {
      text: "A fact the verdict depends on is still unknown after four extra fetches. This is a handoff, not a rejection — one look at their site settles it.",
      actionable: true,
      suggestedUrl: `https://${input.domain}/`,
    };
  }

  if (rule === "R-30") {
    return {
      text: "Every contact we found is a generic mailbox. A named person at this company would make this sendable — the evidence is already there.",
      actionable: true,
    };
  }

  /* ------------------------------------------------------------ R-23 and drops */

  if (rule === "R-23") {
    return {
      text: "Signals fired here, but every quote behind them failed the evidence check — real sentences from their site that are about someone else, some other time, or some other subject. A quote that names this company and speaks to the claim would change it.",
      actionable: true,
      suggestedUrl: input.security_page_url ?? undefined,
    };
  }

  /* ------------------------------------------------------- the scoring branches */

  // Score clears the bar; independence does not. Naming the group is the whole value here —
  // "one more signal" is wrong advice if it comes from a group that has already scored.
  if (score >= SEND_THRESHOLD && groups < MIN_INDEPENDENT_SIGNALS) {
    const group = missingGroup(input.firedGroups, input.firedSignalIds, input.weights);
    return {
      text: `Score is already enough at ${score}; the signals are not independent. One signal from any group other than ${
        input.firedGroups.join(" or ") || "the one that fired"
      }${group ? ` — ${group}, for instance` : ""} would move this to Send.`,
      actionable: true,
    };
  }

  if (input.verdict === "HOLD" || input.verdict === "DROP") {
    const short = SEND_THRESHOLD - score;
    const best = bestMissingSignal(input.firedSignalIds, input.weights);

    // The security-page case is worth calling out by name: S-01, S-02 and S-03 all live on that
    // one page, so whether we found it decides whether the gap is "go and look" or "there is
    // nothing more to read here".
    const securityGap =
      best !== null &&
      (best.id === "S-01" || best.id === "S-02" || best.id === "S-03") &&
      input.security_page_checked &&
      input.security_page_url === null;

    if (best !== null && short > 0) {
      const enough = best.points >= short;
      return {
        text:
          `${short} point${short === 1 ? "" : "s"} short of a Send. ` +
          `${best.id} (${SIGNAL_LABEL[best.id]}, +${best.points}) ${
            enough ? "alone would clear it" : "is the largest signal still missing"
          }. ` +
          (securityGap
            ? "We looked for a security or trust page at this domain and found none, so check whether one exists elsewhere — a subdomain, or a third-party trust portal."
            : "It did not fire on the pages we read."),
        actionable: true,
        suggestedUrl: securityGap ? undefined : (input.security_page_url ?? undefined),
      };
    }

    if (score === 0) {
      return {
        text: "They fit the profile but nothing on the pages we read suggests compliance pressure right now. Worth re-running after a funding announcement or a change to their security page.",
        actionable: true,
        suggestedUrl: `https://${input.domain}/`,
      };
    }
  }

  if (input.verdict === "SEND") {
    return {
      text:
        input.size_band === null
          ? "Nothing is holding this back. Company size is still unknown, which does not gate the verdict — but if they turn out to be above 500 they have in-house GRC and this becomes a Drop."
          : "Nothing is holding this back. It is ready to send.",
      actionable: false,
    };
  }

  return {
    text: `Held at ${score} point${score === 1 ? "" : "s"} across ${groups} independent signal${
      groups === 1 ? "" : "s"
    }. ${HOLD_THRESHOLD} points is the floor for a Hold and ${SEND_THRESHOLD} for a Send.`,
    actionable: true,
  };
}
