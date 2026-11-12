import { USER_AGENT } from "@/lib/fetch/robots";
import { cleanPage, wordCount, type CleanedPage } from "@/lib/fetch/clean";

/**
 * ② The three-tier fetch (§7.1).
 *
 *   tier 1  plain GET, 8s timeout, browser UA
 *   tier 2  r.jina.ai, only when tier 1 yields fewer than 200 clean words
 *   tier 3  stop — the caller quarantines with a named reason
 */

export const THIN_PAGE_WORDS = 200;
export const FETCH_TIMEOUT_MS = 8000;

/**
 * §2.6a — the politeness delay, between consecutive requests *to the same host*. Different
 * domains are different servers, so they are never made to wait for each other.
 *
 * It applies *between* requests, not before each one: two reserved fetches cost one delay, not
 * two. That matters because this budget shares a 60-second handler with the model calls.
 */
export const FETCH_DELAY_MS = 800;

const lastRequestAt = new Map<string, number>();

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Wait only as long as is actually owed: if 500 ms have already passed since the last request to
 * this host — doing the cleaning, the model call, the database write — only 300 ms remain.
 * Returns the delay applied, so the badge can show a real number rather than a nominal one.
 */
export async function awaitPoliteness(url: string, delayMs = FETCH_DELAY_MS): Promise<number> {
  const host = hostOf(url);
  const previous = lastRequestAt.get(host);
  const now = Date.now();
  let waited = 0;

  if (previous !== undefined) {
    const owed = delayMs - (now - previous);
    if (owed > 0) {
      await new Promise((resolve) => setTimeout(resolve, owed));
      waited = owed;
    }
  }
  lastRequestAt.set(host, Date.now());
  return waited;
}

/** Test seam. The map is module-level state and would otherwise leak between cases. */
export function resetPoliteness(): void {
  lastRequestAt.clear();
}

export type FetchAttempt = {
  url: string;
  tier: 1 | 2;
  status_code: number | null;
  word_count: number;
  ok: boolean;
  error: string | null;
};

export type FetchOutcome = {
  /** Every attempt made, in order, for the `fetches` table. */
  attempts: FetchAttempt[];
  /** The winning page, or null when every tier failed. */
  page: CleanedPage | null;
  /** The tier that produced `page`. */
  tier: 1 | 2 | null;
  /** Set when `page` is null — a named reason, never a silent empty. */
  reason_code: "thin_content" | "fetch_failed" | null;
  reason_text: string | null;
  /** True when `page` came from `page_cache` and no request left this machine. */
  cached: boolean;
  /** Milliseconds actually spent waiting to be polite to this host. */
  delay_ms: number;
};

async function get(url: string, timeoutMs: number): Promise<{ status: number; body: string }> {
  const response = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
      accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
  });
  const body = await response.text();
  return { status: response.status, body };
}

function describe(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "TimeoutError" || err.name === "AbortError")
      return `timed out after ${FETCH_TIMEOUT_MS}ms`;
    return err.message;
  }
  return String(err);
}

type CoreOutcome = Omit<FetchOutcome, "cached" | "delay_ms">;

/**
 * The three tiers themselves, with no cache and no delay. Split out so the wrapper below owns
 * every reason a request might not be made at all.
 */
async function fetchTiers(
  url: string,
  opts: { readerEnabled?: boolean; timeoutMs?: number } = {},
): Promise<CoreOutcome> {
  const readerEnabled = opts.readerEnabled ?? true;
  const timeoutMs = opts.timeoutMs ?? FETCH_TIMEOUT_MS;
  const attempts: FetchAttempt[] = [];

  // --- Tier 1 ---------------------------------------------------------------
  let tier1Page: CleanedPage | null = null;
  try {
    const { status, body } = await get(url, timeoutMs);
    if (status >= 200 && status < 300) {
      const page = cleanPage(body, url, false);
      attempts.push({
        url,
        tier: 1,
        status_code: status,
        word_count: page.words,
        ok: page.words >= THIN_PAGE_WORDS,
        error: page.words >= THIN_PAGE_WORDS ? null : `thin: ${page.words} clean words`,
      });
      if (page.words >= THIN_PAGE_WORDS) {
        return { attempts, page, tier: 1, reason_code: null, reason_text: null };
      }
      tier1Page = page;
    } else {
      attempts.push({
        url,
        tier: 1,
        status_code: status,
        word_count: 0,
        ok: false,
        error: `HTTP ${status}`,
      });
    }
  } catch (err) {
    attempts.push({
      url,
      tier: 1,
      status_code: null,
      word_count: 0,
      ok: false,
      error: describe(err),
    });
  }

  // --- Tier 2 ---------------------------------------------------------------
  if (!readerEnabled) {
    return tier1Page && tier1Page.words > 0
      ? { attempts, page: tier1Page, tier: 1, reason_code: null, reason_text: null }
      : {
          attempts,
          page: null,
          tier: null,
          reason_code: "thin_content",
          reason_text: `${url} returned too little readable text and the Jina Reader tier is switched off (reader_enabled = false).`,
        };
  }

  const readerUrl = `https://r.jina.ai/${url}`;
  try {
    const { status, body } = await get(readerUrl, timeoutMs + 4000);
    if (status >= 200 && status < 300) {
      const page = cleanPage(body, url, true);
      const ok = page.words >= 40;
      attempts.push({
        url: readerUrl,
        tier: 2,
        status_code: status,
        word_count: page.words,
        ok,
        error: ok ? null : `reader also thin: ${page.words} clean words`,
      });
      if (ok) return { attempts, page, tier: 2, reason_code: null, reason_text: null };
    } else {
      attempts.push({
        url: readerUrl,
        tier: 2,
        status_code: status,
        word_count: 0,
        ok: false,
        error: `HTTP ${status}`,
      });
    }
  } catch (err) {
    attempts.push({
      url: readerUrl,
      tier: 2,
      status_code: null,
      word_count: 0,
      ok: false,
      error: describe(err),
    });
  }

  // --- Tier 3: stop ---------------------------------------------------------
  if (tier1Page && tier1Page.words > 0) {
    return { attempts, page: tier1Page, tier: 1, reason_code: null, reason_text: null };
  }

  const tier1 = attempts.find((a) => a.tier === 1);
  return {
    attempts,
    page: null,
    tier: null,
    reason_code: tier1 && tier1.status_code !== null ? "thin_content" : "fetch_failed",
    reason_text:
      `Both fetch tiers failed for ${url}. ` +
      attempts.map((a) => `tier ${a.tier}: ${a.error ?? "ok"}`).join("; "),
  };
}

/**
 * The fetch the pipeline actually calls: page cache first, then politeness, then the tiers.
 *
 * `readerEnabled` is the `reader_enabled` switch (§5.5). When off, tier 2 is skipped entirely
 * and a thin page goes straight to the loop or to quarantine.
 *
 * On the cache: a hit still consumes one of the four extra fetches. The budget models
 * *questions answered*, not money spent — a run that read ten pages because nine were cached
 * would be a different agent from the one whose loop we are demonstrating, and the loop trace
 * would stop meaning what it says. What the cache saves is the request to the company's server
 * and the tokens spent re-reading it, which is the whole of the obligation.
 */
export async function fetchPage(
  url: string,
  opts: {
    readerEnabled?: boolean;
    timeoutMs?: number;
    delayMs?: number;
    /** Injected by the pipeline. Absent in tests, which then exercise the live path. */
    cache?: {
      get: (url: string) => Promise<{ clean_text: string; tier: number } | null>;
      put: (row: { url: string; tier: number; clean_text: string; word_count: number }) => Promise<void>;
    };
  } = {},
): Promise<FetchOutcome> {
  if (opts.cache) {
    const hit = await opts.cache.get(url);
    if (hit) {
      const page: CleanedPage = {
        text: hit.clean_text,
        words: wordCount(hit.clean_text),
        // Links and job counts are not cached: they are cheap to recompute but only from the
        // raw HTML, which we deliberately do not store. A cached page therefore contributes
        // text and nothing else, and `inferSize` sees no job links for it.
        links: [],
        job_links: [],
        title: null,
      };
      return {
        attempts: [
          {
            url,
            tier: (hit.tier === 2 ? 2 : 1) as 1 | 2,
            status_code: null,
            word_count: page.words,
            ok: true,
            error: null,
          },
        ],
        page,
        tier: (hit.tier === 2 ? 2 : 1) as 1 | 2,
        reason_code: null,
        reason_text: null,
        cached: true,
        delay_ms: 0,
      };
    }
  }

  const delay = await awaitPoliteness(url, opts.delayMs ?? FETCH_DELAY_MS);
  const core = await fetchTiers(url, opts);

  if (opts.cache && core.page && core.page.words > 0) {
    await opts.cache.put({
      url,
      tier: core.tier ?? 1,
      clean_text: core.page.text,
      word_count: core.page.words,
    });
  }

  return { ...core, cached: false, delay_ms: delay };
}
