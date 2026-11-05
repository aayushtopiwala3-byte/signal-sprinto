import type { SizeBand } from "@/lib/types";

/**
 * §5.4 — R-30, the headcount-conditional PoC ladder.
 *
 * Who to contact depends on how big they are. At 20 people the founder owns security; at 300
 * there is someone whose job it is. Ranking is plain TypeScript over Hunter's response — the
 * model is not asked who the right person is.
 */

export type HunterCandidate = {
  first_name: string | null;
  last_name: string | null;
  position: string | null;
  seniority: string | null;
  department: string | null;
  email: string;
  confidence: number;
  /** Hunter's own classification. `generic` is never selectable (§5.4). */
  type: string | null;
};

export type RankedCandidate = HunterCandidate & {
  ladder_rank: number;
  /** Which ladder rung matched, for display. */
  ladder_label: string;
};

export type PocResult =
  | {
      ok: true;
      selected: RankedCandidate;
      runnerUp: RankedCandidate | null;
      /** Why the runner-up lost, e.g. "ladder rank 2 vs 1" or "confidence 72 vs 91". */
      runnerUpLostReason: string | null;
      ladder: LadderRung[];
      /** Every named candidate in selection order, so the UI can offer a swap. */
      ranked: RankedCandidate[];
    }
  | { ok: false; verdict: "HOLD"; reason: string; rejectedGeneric: number };

export type LadderRung = { rank: number; label: string; match: RegExp };

const SECURITY_RUNG: LadderRung = {
  rank: 1,
  label: "Head of Security / GRC / Compliance",
  match: /\b(security|grc|compliance|governance|risk|infosec|ciso|trust)\b/i,
};

const LADDERS: Record<SizeBand, LadderRung[]> = {
  "1-10": [
    {
      rank: 1,
      label: "CTO / Co-founder / Head of Engineering",
      match: /\b(cto|chief technology|co[- ]?founder|founder|head of engineering|vp engineering|vp of engineering)\b/i,
    },
    {
      rank: 2,
      label: "Head of People / Ops",
      match: /\b(head of people|people ops|chief people|hr (?:head|director|lead)|head of operations|coo|chief operating)\b/i,
    },
    { rank: 3, label: "VP Sales", match: /\b(vp sales|vp of sales|chief revenue|cro|head of sales)\b/i },
  ],
  "11-50": [
    {
      rank: 1,
      label: "CTO / Co-founder / Head of Engineering",
      match: /\b(cto|chief technology|co[- ]?founder|founder|head of engineering|vp engineering|vp of engineering)\b/i,
    },
    {
      rank: 2,
      label: "Head of People / Ops",
      match: /\b(head of people|people ops|chief people|hr (?:head|director|lead)|head of operations|coo|chief operating)\b/i,
    },
    { rank: 3, label: "VP Sales", match: /\b(vp sales|vp of sales|chief revenue|cro|head of sales)\b/i },
  ],
  "51-200": [
    SECURITY_RUNG,
    {
      rank: 2,
      label: "CTO / VP Engineering",
      match: /\b(cto|chief technology|vp engineering|vp of engineering|head of engineering)\b/i,
    },
    {
      rank: 3,
      label: "Head of People / COO",
      match: /\b(head of people|people ops|chief people|coo|chief operating|head of operations)\b/i,
    },
  ],
  "201-500": [
    SECURITY_RUNG,
    { rank: 2, label: "VP Engineering", match: /\b(vp engineering|vp of engineering|head of engineering|cto|chief technology)\b/i },
    { rank: 3, label: "Head of Legal", match: /\b(legal|general counsel|gc\b|counsel)\b/i },
  ],
  // Present for completeness. R-02 drops 500+ before the ladder is ever reached.
  "500+": [SECURITY_RUNG],
};

/** A null size_band uses the 51-200 ladder: the middle rung, and the least wrong guess. */
export const DEFAULT_LADDER_BAND: SizeBand = "51-200";

export function ladderFor(band: SizeBand | null): LadderRung[] {
  return LADDERS[band ?? DEFAULT_LADDER_BAND];
}

const UNRANKED = 99;

function rank(candidate: HunterCandidate, ladder: LadderRung[]): { rank: number; label: string } {
  const haystack = [candidate.position, candidate.department, candidate.seniority]
    .filter(Boolean)
    .join(" ");
  for (const rung of ladder) {
    if (rung.match.test(haystack)) return { rank: rung.rank, label: rung.label };
  }
  return { rank: UNRANKED, label: "off-ladder" };
}

export function isGeneric(candidate: HunterCandidate): boolean {
  if ((candidate.type ?? "").toLowerCase() === "generic") return true;
  // Belt and braces: Hunter occasionally types a role mailbox as personal.
  const local = candidate.email.split("@")[0].toLowerCase();
  return ["info", "hello", "sales", "support", "contact", "admin", "team", "careers"].includes(
    local,
  );
}

/**
 * Rank by ladder rung first, then Hunter confidence desc (§5.4). Email is the final tiebreak so
 * the ordering is total and the same response always yields the same selection (T-14).
 */
export function selectContact(
  candidates: HunterCandidate[],
  sizeBand: SizeBand | null,
): PocResult {
  const ladder = ladderFor(sizeBand);
  const generic = candidates.filter(isGeneric);
  const named = candidates.filter((c) => !isGeneric(c));

  if (named.length === 0) {
    return {
      ok: false,
      verdict: "HOLD",
      reason:
        generic.length > 0
          ? `HOLD — no named contact available: all ${generic.length} Hunter result${generic.length === 1 ? " was" : "s were"} generic (info@, hello@, sales@).`
          : "HOLD — no named contact available: Hunter returned no results for this domain.",
      rejectedGeneric: generic.length,
    };
  }

  const ranked: RankedCandidate[] = named
    .map((c) => {
      const r = rank(c, ladder);
      return { ...c, ladder_rank: r.rank, ladder_label: r.label };
    })
    .sort((a, b) => {
      if (a.ladder_rank !== b.ladder_rank) return a.ladder_rank - b.ladder_rank;
      if (a.confidence !== b.confidence) return b.confidence - a.confidence;
      return a.email.localeCompare(b.email);
    });

  const selected = ranked[0];
  const runnerUp = ranked[1] ?? null;

  let runnerUpLostReason: string | null = null;
  if (runnerUp) {
    runnerUpLostReason =
      runnerUp.ladder_rank !== selected.ladder_rank
        ? `ladder rank ${runnerUp.ladder_rank} vs ${selected.ladder_rank}`
        : `confidence ${runnerUp.confidence} vs ${selected.confidence}`;
  }

  return { ok: true, selected, runnerUp, runnerUpLostReason, ladder, ranked };
}

export function displayName(c: {
  first_name: string | null;
  last_name: string | null;
  email: string;
}): string {
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return name.length > 0 ? name : c.email;
}
