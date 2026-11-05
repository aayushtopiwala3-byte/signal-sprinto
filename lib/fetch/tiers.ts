import { USER_AGENT } from "@/lib/fetch/robots";
import { cleanPage, type CleanedPage } from "@/lib/fetch/clean";

/**
 * ② The three-tier fetch (§7.1).
 *
 *   tier 1  plain GET, 8s timeout, browser UA
 *   tier 2  r.jina.ai, only when tier 1 yields fewer than 200 clean words
 *   tier 3  stop — the caller quarantines with a named reason
 */

export const THIN_PAGE_WORDS = 200;
export const FETCH_TIMEOUT_MS = 8000;

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

/**
 * `readerEnabled` is the `reader_enabled` switch (§5.5). When off, tier 2 is skipped entirely
 * and a thin page goes straight to the loop or to quarantine.
 */
export async function fetchPage(
  url: string,
  opts: { readerEnabled?: boolean; timeoutMs?: number } = {},
): Promise<FetchOutcome> {
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
