import type { Evidence, SizeBand, SizeSource } from "@/lib/types";

/**
 * §2.3 — headcount, inferred in code rather than scraped by a model.
 *
 * v1 asked AI-1 for `size_band` and forbade it from estimating, which was the right rule and
 * the wrong place to apply it. The result was that 7 of 8 companies finished with `size_band`
 * null after spending all four extra fetches on it, so R-02 could never fire and the board had
 * no DROPs at all. The fix is not to let the model guess — it is to do the arithmetic here,
 * where the method is inspectable and the provenance is recorded alongside the answer.
 *
 * Three sources, tried in order, each stamping `size_source`:
 *   1. `stated`   — the company printed a headcount on its own site. Carries a verbatim quote.
 *   2. `inferred` — counted from open job listings. No quote chip, ever: there is no sentence
 *                   that says this, and dressing an estimate in quotation marks is the exact
 *                   failure this build is organised against.
 *   3. `hunter`   — employee metadata on the Domain Search response, when present.
 */

export type SizePage = {
  url: string;
  text: string;
  /** Links that look like individual job postings, including ATS-hosted ones. */
  job_links?: string[];
};

export type SizeFinding = {
  band: SizeBand;
  source: SizeSource;
  /** Present only for `stated`. `inferred` and `hunter` findings are never quoted. */
  evidence: Evidence | null;
  /** Plain-English method, shown on the card beside the band. */
  method: string;
};

export type SizeResult = {
  finding: SizeFinding | null;
  /** Why nothing was found, when nothing was. Never silence. */
  reason: string;
};

/* --------------------------------------------------------- source 1: stated */

/**
 * Blocks that look like a self-reported headcount. Exported because `lib/fetch/clean.ts` uses
 * it to protect these blocks from the two filters that were destroying them: the 8-word minimum
 * and the 2,000-token cap. whatfix.com states "crossing 500 employees globally" 71% of the way
 * through its /about-us page, so v1's cleaner deleted the one sentence that would have dropped it.
 */
export const HEADCOUNT_FACT =
  /\b(?:team of (?:over |more than |about |around |nearly )?[\d,]*\d|[\d,]*\d\s*\+?\s*(?:employees|employee|team members|teammates|staff|strong)|[\d,]*\d[- ]person (?:team|company|startup)|headcount of [\d,]*\d|we(?:'| a)?re (?:now )?(?:over |more than |a team of )?[\d,]*\d\s*(?:people|employees|strong))\b/i;

/**
 * Sentences that use a people-number for something other than staff. atlan.com's "onboarded
 * 6,000 people" is customers, and reading it as headcount would have dropped a fitting company
 * on R-02 using a number about its users. A wrong DROP is worse than no DROP.
 */
const NOT_HEADCOUNT =
  /\b(?:customers?|users?|clients?|subscribers?|members|learners?|students?|candidates?|onboard(?:ed|ing)?|served|serving|trained|helped|reached|community|downloads?|sign[- ]?ups?|audience|attendees|developers use|companies use|teams use|businesses)\b/i;

/** Modifiers that make the number a floor rather than a point estimate. */
const AT_LEAST =
  /\b(?:over|more than|above|beyond|crossing|crossed|surpass(?:ed|ing)?|exceed(?:ed|ing)?|north of|upwards of|\d\+)\b|\d\s*\+/i;

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= 400);
}

/** Parse "6,000" / "500" / "1,200" into a number. Rejects a bare comma, which v1's regex matched. */
function toCount(raw: string): number | null {
  const digits = raw.replace(/,/g, "");
  if (!/^\d+$/.test(digits)) return null;
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 && n < 10_000_000 ? n : null;
}

/**
 * Bands are closed at the top (`201-500` includes 500), so a number that is really a floor —
 * "crossing 500 employees" — must land in the band above, not the one it numerically touches.
 */
export function bandForCount(count: number, atLeast = false): SizeBand {
  if (count <= 10) return atLeast && count === 10 ? "11-50" : "1-10";
  if (count <= 50) return atLeast && count === 50 ? "51-200" : "11-50";
  if (count <= 200) return atLeast && count === 200 ? "201-500" : "51-200";
  if (count <= 500) return atLeast && count === 500 ? "500+" : "201-500";
  return "500+";
}

const NUMBER_NEAR_STAFF =
  /\b(?:team of (?:over |more than |about |around |nearly )?([\d,]*\d)|([\d,]*\d)\s*\+?\s*(?:employees|employee|team members|teammates|staff)|([\d,]*\d)[- ]person|headcount of ([\d,]*\d)|we(?:'| a)?re (?:now )?(?:over |more than |a team of )?([\d,]*\d)\s*(?:people|employees|strong))\b/i;

export function statedSize(pages: readonly SizePage[]): SizeFinding | null {
  for (const page of pages) {
    for (const sentence of splitSentences(page.text)) {
      if (!HEADCOUNT_FACT.test(sentence)) continue;
      if (NOT_HEADCOUNT.test(sentence)) continue;

      const m = sentence.match(NUMBER_NEAR_STAFF);
      if (!m) continue;
      const raw = m.slice(1).find((g) => g !== undefined);
      const count = raw ? toCount(raw) : null;
      if (count === null) continue;

      const atLeast = AT_LEAST.test(sentence);
      return {
        band: bandForCount(count, atLeast),
        source: "stated",
        evidence: { quote: sentence, url: page.url },
        method: `stated on their own site: ${count.toLocaleString("en-US")}${atLeast ? "+" : ""} staff`,
      };
    }
  }
  return null;
}

/* ----------------------------------------------------- source 2: job counts */

/**
 * §2.3's bands. The one deviation: 0 listings infers nothing.
 *
 * The spec maps `0-5 roles → likely ≤ 50`, but in practice zero is not a measurement — nearly
 * every zero we saw was a JavaScript-rendered board that neither tier could read (whatfix is
 * one). Treating "we could not see the listings" as "they are a small company" would be the
 * same fabrication in the opposite direction, and it would feed R-02b, which drops companies.
 */
export function bandForJobCount(roles: number): SizeBand | null {
  if (roles < 1) return null;
  if (roles <= 5) return "11-50";
  if (roles <= 20) return "51-200";
  if (roles <= 60) return "201-500";
  return "500+";
}

const CAREERS_URL = /\/(careers|jobs|join-us|work-with-us|openings|positions)\b/i;

export function inferredSize(pages: readonly SizePage[]): SizeFinding | null {
  const careers = pages.filter((p) => CAREERS_URL.test(p.url));
  if (careers.length === 0) return null;

  const roles = new Set<string>();
  for (const page of careers) for (const link of page.job_links ?? []) roles.add(link);

  const band = bandForJobCount(roles.size);
  if (!band) return null;

  return {
    band,
    source: "inferred",
    // No quote. There is no sentence on the page that says this, and attaching one would imply
    // the company stated a headcount it never stated.
    evidence: null,
    method: `inferred from ${roles.size} open ${roles.size === 1 ? "role" : "roles"} on their careers page — an estimate, not a stated figure`,
  };
}

/* -------------------------------------------------- source 3: Hunter metadata */

/** The shape we look for. Hunter returns it for some domains and not others; absence is fine. */
type HunterMeta = {
  organization?: unknown;
  company_size?: unknown;
  employees?: unknown;
  headcount?: unknown;
};

/**
 * Hunter's Domain Search sometimes carries a size field and sometimes does not. It must never
 * cause a retry or an error — it is a free upgrade when present and nothing when absent.
 */
export function hunterSize(meta: unknown): SizeFinding | null {
  if (!meta || typeof meta !== "object") return null;
  const data = (meta as { data?: HunterMeta }).data ?? (meta as HunterMeta);
  const raw = data.company_size ?? data.employees ?? data.headcount;
  if (raw === undefined || raw === null) return null;

  const text = String(raw);
  const count = toCount(text.match(/[\d,]*\d/)?.[0] ?? "");
  if (count === null) return null;

  return {
    band: bandForCount(count, /\+|over|more than/i.test(text)),
    source: "hunter",
    evidence: null,
    method: `from Hunter's company metadata for this domain: ${text}`,
  };
}

/* ------------------------------------------------------------------ the gate */

export function inferSize(input: {
  pages: readonly SizePage[];
  hunterResponse?: unknown;
}): SizeResult {
  const stated = statedSize(input.pages);
  if (stated) return { finding: stated, reason: stated.method };

  const inferred = inferredSize(input.pages);
  if (inferred) return { finding: inferred, reason: inferred.method };

  const hunter = hunterSize(input.hunterResponse);
  if (hunter) return { finding: hunter, reason: hunter.method };

  const sawCareers = input.pages.some((p) => CAREERS_URL.test(p.url));
  return {
    finding: null,
    reason: sawCareers
      ? "no headcount stated on any page read, and the careers page listed no roles we could count (job boards rendered in JavaScript are invisible to both fetch tiers)"
      : "no headcount stated on any page read, and no careers page was reachable",
  };
}
