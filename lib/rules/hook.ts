import type { FiredSignal, SignalId } from "@/lib/types";

/**
 * R-42 — a funding round alone cannot be the hook (§3.2).
 *
 * The draft that prompted this rule opened on *"Rocketlane raises $60 Million in Series C…"*.
 * It is the most-used cold-email opener in existence, and more to the point it is a press
 * mention rather than a compliance-pressure fact — which is the same reason S-06 is weighted 10
 * and not 40. Opening on it says "we read your press page", not "we understand your problem".
 *
 * So the hook follows the same priority the scoreboard already encodes. If any verified
 * compliance-specific fact exists, the hook must use it. Funding is permitted only when nothing
 * else survived the evidence check — and then the card has to say so out loud, because a weak
 * hook that explains itself is honest while a weak hook that doesn't is just a weak hook.
 */

/**
 * Signals that say something about this company's compliance position.
 *
 *   S-01  a certification is under way
 *   S-02  a trust page exists with nothing on it
 *   S-03  a first security/compliance/GRC hire is open
 *   S-05  the enterprise tier names SOC 2, a DPA or a security review
 *
 * S-04 is enterprise demand, S-06 is funding and S-07 is the vertical they sell into. Those are
 * all context for *why* compliance pressure exists; none of them is evidence that it does.
 */
export const COMPLIANCE_SIGNALS: ReadonlySet<SignalId> = new Set<SignalId>([
  "S-01",
  "S-02",
  "S-03",
  "S-05",
]);

export type HookCandidate = { label: string; quote: string; url: string | null };

export type HookPlan = {
  /** Quotes the model is allowed to open on. Empty means "anything verified". */
  preferred: HookCandidate[];
  /** True when no compliance-specific fact survived and funding is the fallback. */
  fallback: boolean;
  /** Shown on the card when `fallback` is true. Null otherwise. */
  note: string | null;
};

export function planHook(args: {
  signals: FiredSignal[];
  certEvidence: { quote: string; url: string } | null;
  certStatus: string | null;
}): HookPlan {
  const preferred: HookCandidate[] = [];

  for (const s of args.signals) {
    if (s.tier !== "verified" || !s.quote) continue;
    if (!COMPLIANCE_SIGNALS.has(s.signal_id)) continue;
    preferred.push({ label: s.signal_id, quote: s.quote, url: s.source_url ?? null });
  }

  // The certification status itself is a compliance-specific fact when it was established from
  // a page rather than left unknown.
  if (args.certEvidence && args.certStatus) {
    preferred.push({
      label: `cert_status: ${args.certStatus}`,
      quote: args.certEvidence.quote,
      url: args.certEvidence.url,
    });
  }

  if (preferred.length > 0) return { preferred, fallback: false, note: null };

  return {
    preferred: [],
    fallback: true,
    note:
      "Hook falls back to funding — no compliance-specific fact survived the evidence check. " +
      "Nothing verified on their site speaks to their certification status, their trust page, a " +
      "compliance hire or an enterprise security requirement, so the opening line rests on the " +
      "weakest kind of fact this system collects. Worth a human glance before it goes out.",
  };
}
