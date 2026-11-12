import type { LoopField } from "@/lib/types";

/**
 * §2.1 — who gets to spend the four extra fetches.
 *
 * Fetch 0 (not counted): the homepage. Unchanged.
 * Extra fetch 1: RESERVED — security / trust page
 * Extra fetch 2: RESERVED — careers page
 * Extra fetches 3-4: DISCRETIONARY — chosen by AI-2 against whatever is still empty
 *
 * `MAX_EXTRA_FETCHES` has not moved and must not. What changed is the allocation. v1 pooled all
 * four and let AI-2 spend them, and it spent every one of them on `size_band` — the field a
 * company's own site answers least often — while never once opening the security page that
 * carries S-01, S-02 and S-03, 70 of the available points.
 *
 * This is a return to the L4 deck, not an invention: the deck's Evidence Map budgets fetches
 * *per question* ("Already certified?" → homepage footer · /security · /trust → 1 fetch;
 * "Right stage?" → /careers · /pricing · /customers → 2 fetches), worst case 4 beyond the
 * homepage. v1 kept the total and dropped the per-question allocation.
 */

export type SlotKind = "reserved" | "discretionary";

export type ReservedSlot = {
  kind: "reserved";
  /** What the slot is for, in the words the loop trace shows. */
  purpose: "security" | "careers";
  /** Tried in order; the first to return enough text wins the slot. */
  paths: string[];
  /** Why this page is worth a guaranteed slot — rendered in the trace's reason column. */
  rationale: string;
};

/**
 * Reserved fetch 1 — the security page.
 *
 * If none of these resolve, the absence is itself informative and must be shown on the card as
 * `no security page found`: a B2B SaaS company with no trust page at all is a different kind of
 * prospect from one with a page full of badges, and both are different from one we never looked.
 */
export const SECURITY_PATHS = [
  "/security",
  "/trust",
  "/trust-center",
  "/compliance",
  "/soc2",
  "/legal/security",
  "/privacy",
];

/**
 * Reserved fetch 2 — the careers page. It earns the slot twice over: S-03 (first compliance
 * hire) reads it, and so does the headcount inference in `lib/size/infer.ts`. The deck says the
 * same thing — it answers headcount, seniority and often funding in a single request.
 */
export const CAREERS_PATHS = ["/careers", "/jobs", "/about/careers", "/company/careers"];

export const RESERVED_SLOTS: ReservedSlot[] = [
  {
    kind: "reserved",
    purpose: "security",
    paths: SECURITY_PATHS,
    rationale:
      "reserved slot 1 of 2: the security/trust page carries S-01, S-02 and S-03 — the largest block of points on the board, and not a page a model gets to decide to skip",
  },
  {
    kind: "reserved",
    purpose: "careers",
    paths: CAREERS_PATHS,
    rationale:
      "reserved slot 2 of 2: the careers page answers headcount and the first-compliance-hire signal in one request",
  },
];

/** A page is only thin enough to keep trying past it if it is under this. Matches §2.1. */
export const RESERVED_MIN_WORDS = 200;

/**
 * Which slot the next extra fetch belongs to. `fetchesUsed` counts extra fetches only — the
 * homepage is fetch 0 and is never counted.
 */
export function slotFor(fetchesUsed: number): ReservedSlot | { kind: "discretionary" } {
  return RESERVED_SLOTS[fetchesUsed] ?? { kind: "discretionary" };
}

export function slotKind(fetchesUsed: number): SlotKind {
  return fetchesUsed < RESERVED_SLOTS.length ? "reserved" : "discretionary";
}

/**
 * §2.3 — `size_band` is demoted as a loop driver.
 *
 * It gets at most one *discretionary* fetch. The reserved careers slot already made the best
 * attempt available, and `inferSize` runs over everything fetched regardless; after that, a
 * loop that keeps asking for the same field is not persistence, it is the F-2 failure mode.
 * Note the asymmetry is deliberate: this caps how often the field may *drive a choice*, not how
 * often it may be filled. A page fetched for another reason can still answer it.
 */
export const SIZE_DISCRETIONARY_BUDGET = 1;

/**
 * Drop `size_band` from the fields the loop is allowed to chase once it has had its one
 * discretionary turn. Everything else keeps its place and relative order.
 */
export function driveableFields(
  emptyFields: readonly LoopField[],
  sizeFetchesSpent: number,
): LoopField[] {
  if (sizeFetchesSpent < SIZE_DISCRETIONARY_BUDGET) return [...emptyFields];
  const rest = emptyFields.filter((f) => f !== "size_band");
  // If size_band were the only thing left, returning [] would end the loop early while fetches
  // remain. Better to let it have the turn than to stop reading with budget unspent.
  return rest.length > 0 ? rest : [...emptyFields];
}

/**
 * Rank a set of candidate URLs by which of the slot's paths they match, not by the order a site
 * happens to list them.
 *
 * This is a measured fix, not a tidy-up. The first live run after reserving the slots resolved
 * the security page to `/privacy-policy` on four of eight companies — including whatfix and
 * rocketlane, both of which publish a real `/trust` page with over 700 words that was never
 * opened. The cause: links the site publishes were probed before conventional guesses (a real
 * link is evidence the page exists), every footer on the web links a privacy policy, and
 * `/privacy-policy` contains `/privacy`, which is the last entry in `SECURITY_PATHS`. A long
 * privacy policy then passed the word floor and won the slot on the first probe.
 *
 * A privacy policy is not a trust page. It does not carry a SOC 2 badge or a certification
 * status, so S-01 and S-02 cannot fire from it — the slot was spent and the signals it exists
 * to reach were still unreachable. Path priority now outranks link provenance, and being
 * site-published only breaks ties within the same path.
 */
export function orderByPathPriority(urls: readonly string[], slot: ReservedSlot): string[] {
  const rank = (url: string): number => {
    const lower = url.toLowerCase();
    const i = slot.paths.findIndex((p) => lower.includes(p));
    return i === -1 ? slot.paths.length : i;
  };
  return [...new Set(urls)]
    .map((url, index) => ({ url, r: rank(url), index }))
    .sort((a, b) => a.r - b.r || a.index - b.index)
    .map((c) => c.url);
}

/** Absolute URLs for a slot's paths, in order, skipping anything already read. */
export function slotCandidates(
  domain: string,
  slot: ReservedSlot,
  alreadyFetched: readonly string[],
): string[] {
  const seen = new Set(
    alreadyFetched.map((u) => {
      try {
        const parsed = new URL(u);
        return `${parsed.host.replace(/^www\./, "")}${parsed.pathname.replace(/\/$/, "")}`;
      } catch {
        return u;
      }
    }),
  );
  const host = domain.replace(/^www\./, "");
  return slot.paths
    .map((p) => ({ path: p, key: `${host}${p}` }))
    .filter((c) => !seen.has(c.key))
    .map((c) => `https://${host}${c.path}`);
}
