import { env, capability } from "@/lib/env";
import { sql } from "@/lib/db/client";
import type { HunterCandidate } from "@/lib/rules/poc";
import { SEEDED_CONTACTS } from "@/lib/seed/seededContacts";

/**
 * §2.4 — the point of contact comes from the Hunter.io Domain Search API.
 *
 * Three things protect the credit balance: `limit=5`, a department filter so the five returned
 * are plausible ladder matches rather than five engineers, and a per-domain cache so the three
 * entries that collapse to rocketlane.com cost exactly one credit (T-02).
 */

export const HUNTER_LIMIT = 5;
export const QUOTA_GUARD_RATIO = 0.8;

/** Departments the §5.4 ladder can actually rank. Anything else is a wasted result. */
export const DEPARTMENTS = ["executive", "it", "legal", "hr", "management", "operations"];

// Hunter names the plan's total `available`, which reads like "still left" and is not: a free
// plan reports used 7, available 50, remaining 43. Reading it as the remainder overstated the
// credits left on /health. The field is split here so the name cannot be misread again.
export type HunterQuota = {
  used: number;
  limit: number;
  remaining: number;
  ratio: number;
  /** True at or above 80% — lookups stop and the seeded fallback takes over. */
  guardTripped: boolean;
  resetDate: string | null;
};

export type ContactLookup = {
  candidates: HunterCandidate[];
  source: "live" | "cached" | "seeded";
  /** Named reason whenever we did not go to the live API. */
  note: string | null;
  creditUsed: boolean;
  /**
   * The non-email half of Hunter's response — organization, industry and sometimes a headcount.
   * §2.3's third size source reads it. Frequently absent, and absence is never an error.
   */
  meta: unknown | null;
};

/** What `hunter_cache` holds. The array form is the pre-v2 shape and is still read. */
type CachedHunter = { emails?: HunterEmail[]; [key: string]: unknown };

function readCached(json: string): { emails: HunterEmail[]; meta: unknown | null } {
  const parsed = JSON.parse(json) as HunterEmail[] | CachedHunter;
  // v1 stored the bare email array, so every row written before this change has no metadata.
  // Those rows are not re-fetched to get it: a Hunter credit is not worth spending on a field
  // that is usually absent anyway.
  if (Array.isArray(parsed)) return { emails: parsed, meta: null };
  return { emails: parsed.emails ?? [], meta: parsed };
}

/**
 * Read Hunter's metadata for a domain *from the cache only* — no request, no credit.
 *
 * Size inference runs before the fit gate, and the fit gate can DROP, so a live lookup here
 * would spend a credit on companies we are about to discard. This is deliberately the weakest
 * of the three sources: it answers only for domains we have already paid to look up.
 */
export async function peekHunterMeta(domain: string): Promise<unknown | null> {
  try {
    const rows = await sql<{ response_json: string }>`
      SELECT response_json FROM hunter_cache WHERE domain = ${domain}`;
    return rows.length > 0 ? readCached(rows[0].response_json).meta : null;
  } catch {
    return null;
  }
}

type HunterEmail = {
  value?: string;
  type?: string;
  confidence?: number;
  first_name?: string | null;
  last_name?: string | null;
  position?: string | null;
  seniority?: string | null;
  department?: string | null;
};

function toCandidates(emails: HunterEmail[]): HunterCandidate[] {
  return emails
    .filter((e): e is HunterEmail & { value: string } => typeof e.value === "string")
    .map((e) => ({
      first_name: e.first_name ?? null,
      last_name: e.last_name ?? null,
      position: e.position ?? null,
      seniority: e.seniority ?? null,
      department: e.department ?? null,
      email: e.value,
      confidence: typeof e.confidence === "number" ? e.confidence : 0,
      type: e.type ?? null,
    }));
}

/** Live quota read for the /health meter (§9). */
export async function fetchQuota(): Promise<HunterQuota | null> {
  const key = env.hunterApiKey();
  if (!key) return null;

  try {
    const response = await fetch(
      `https://api.hunter.io/v2/account?api_key=${encodeURIComponent(key)}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!response.ok) return null;

    const json = (await response.json()) as {
      data?: {
        requests?: {
          searches?: { used?: number; available?: number; remaining?: number };
        };
        reset_date?: string;
      };
    };

    const searches = json.data?.requests?.searches;
    const used = searches?.used ?? 0;
    const limit = searches?.available ?? 0;
    const remaining = searches?.remaining ?? Math.max(limit - used, 0);
    const ratio = limit > 0 ? used / limit : 0;

    return {
      used,
      limit,
      remaining,
      ratio,
      guardTripped: ratio >= QUOTA_GUARD_RATIO,
      resetDate: json.data?.reset_date ?? null,
    };
  } catch {
    return null;
  }
}

function seededFor(domain: string, note: string): ContactLookup {
  const seeded = SEEDED_CONTACTS[domain] ?? [];
  return { candidates: seeded, source: "seeded", note, creditUsed: false, meta: null };
}

/**
 * One lookup per normalised domain. The cache check happens before the quota check, so a
 * repeat domain is free even when the guard has tripped.
 */
export async function findContacts(domain: string): Promise<ContactLookup> {
  // --- Cache: this is what makes three rocketlane entries cost one credit (T-02) ----------
  try {
    const cached = await sql<{ response_json: string }>`
      SELECT response_json FROM hunter_cache WHERE domain = ${domain}`;
    if (cached.length > 0) {
      const { emails, meta } = readCached(cached[0].response_json);
      return {
        candidates: toCandidates(emails),
        source: "cached",
        note: "served from the per-domain cache — no Hunter credit consumed",
        creditUsed: false,
        meta,
      };
    }
  } catch {
    // Treat a cache failure as a miss.
  }

  if (!capability.hunter()) {
    return seededFor(
      domain,
      "HUNTER_API_KEY is not set, so this contact comes from the seeded set, not from live data.",
    );
  }

  const quota = await fetchQuota();
  if (quota?.guardTripped) {
    return seededFor(
      domain,
      `Hunter quota guard tripped at ${Math.round(quota.ratio * 100)}% (${quota.used}/${quota.limit} searches used, ${quota.remaining} left). Falling back to the seeded set to protect the remaining credits.`,
    );
  }

  const key = env.hunterApiKey()!;
  const url =
    `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}` +
    `&limit=${HUNTER_LIMIT}&department=${DEPARTMENTS.join(",")}` +
    `&api_key=${encodeURIComponent(key)}`;

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(12_000) });

    if (!response.ok) {
      return seededFor(
        domain,
        `Hunter returned HTTP ${response.status} for ${domain}. Falling back to the seeded set.`,
      );
    }

    const json = (await response.json()) as { data?: CachedHunter };
    const data = json.data ?? {};
    const emails = data.emails ?? [];

    try {
      // The whole `data` object, not just the emails: v1 stored the array and so threw away the
      // organization block that §2.3's third size source needs. Caching the response as Hunter
      // sent it costs nothing extra and does not require a second credit later.
      await sql`
        INSERT INTO hunter_cache (domain, response_json)
        VALUES (${domain}, ${JSON.stringify(data)})
        ON CONFLICT (domain) DO NOTHING`;
    } catch {
      // Caching is an optimisation.
    }

    if (emails.length === 0) {
      return seededFor(
        domain,
        `Hunter found no addresses for ${domain}. Falling back to the seeded set.`,
      );
    }

    return {
      candidates: toCandidates(emails),
      source: "live",
      note: null,
      creditUsed: true,
      meta: data,
    };
  } catch (err) {
    return seededFor(
      domain,
      `Hunter request failed for ${domain}: ${err instanceof Error ? err.message : String(err)}. Falling back to the seeded set.`,
    );
  }
}
