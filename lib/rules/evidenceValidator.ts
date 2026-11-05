import { NOT_STATED } from "@/lib/types";

/**
 * "Never fabricate", enforced in code rather than requested in a prompt.
 *
 * Every claim shown to a user traces to a verbatim quote plus a live URL, or displays the
 * literal string `not stated`. There is no third option — so this module is the only thing
 * standing between a confident model and an invented quote in a cold email.
 */

export type Source = { url: string; text: string };

/**
 * Normalise only what cannot carry meaning: whitespace, and the typographic variants that
 * differ between a page's HTML and a model's echo of it. Letters and words are untouched, so
 * a paraphrase can never pass as a quote.
 */
export function normalizeForComparison(s: string): string {
  return s
    .replace(/[\u2018\u2019\u02bc\u2032]/g, "'")
    .replace(/[\u201c\u201d\u2033]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\u00a0/g, " ")
    .replace(/\u2026/g, "...")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** A quote shorter than this is not evidence, it is a coincidence. */
export const MIN_QUOTE_CHARS = 25;

export type QuoteCheck =
  | { valid: true; url: string }
  | { valid: false; reason: string };

export function checkQuote(
  quote: string | null | undefined,
  sources: Source[],
  expectedUrl?: string | null,
): QuoteCheck {
  if (!quote || quote.trim().length === 0) {
    return { valid: false, reason: "no quote was supplied" };
  }
  if (normalizeForComparison(quote) === normalizeForComparison(NOT_STATED)) {
    return { valid: false, reason: "the model returned `not stated`" };
  }
  if (quote.trim().length < MIN_QUOTE_CHARS) {
    return {
      valid: false,
      reason: `quote is only ${quote.trim().length} characters, below the ${MIN_QUOTE_CHARS}-character minimum for evidence`,
    };
  }

  const needle = normalizeForComparison(quote);

  // Prefer the URL the model claimed, so a quote attributed to the wrong page still fails.
  if (expectedUrl) {
    const claimed = sources.find((s) => s.url === expectedUrl);
    if (claimed && normalizeForComparison(claimed.text).includes(needle)) {
      return { valid: true, url: claimed.url };
    }
  }

  for (const source of sources) {
    if (normalizeForComparison(source.text).includes(needle)) {
      return { valid: true, url: source.url };
    }
  }

  return {
    valid: false,
    reason: expectedUrl
      ? `quote does not appear verbatim on ${expectedUrl}, or on any other page we fetched`
      : "quote does not appear verbatim in any page we fetched",
  };
}

export type ValidatedDraft = {
  validated: boolean;
  blocked_reason: string | null;
  /** Corrected to the page the quote was actually found on, when the model mis-attributed it. */
  hook_url: string | null;
};

/**
 * T-10 — a draft whose hook quote is absent from the source text is blocked, never sent.
 * The draft is still stored and still shown, with the reason on the card, because hiding it
 * would teach the user nothing.
 */
export function validateDraft(
  draft: { hook_quote: string | null; hook_url: string | null; body: string },
  sources: Source[],
): ValidatedDraft {
  const check = checkQuote(draft.hook_quote, sources, draft.hook_url);
  if (!check.valid) {
    return {
      validated: false,
      blocked_reason: `Hook evidence failed: ${check.reason}. This draft cannot be sent.`,
      hook_url: draft.hook_url,
    };
  }
  return { validated: true, blocked_reason: null, hook_url: check.url };
}

export type ValidatedPainPoint = {
  text: string;
  quote: string | null;
  source_url: string | null;
  validated: boolean;
};

/**
 * AI-3's output, filtered. A pain point whose quote is absent or not verbatim is rejected here
 * and replaced with `not stated` rather than shown as if it were grounded.
 */
export function validatePainPoints(
  points: { text: string; quote: string | null; url: string | null }[],
  sources: Source[],
): ValidatedPainPoint[] {
  const out: ValidatedPainPoint[] = [];

  for (let i = 0; i < 2; i++) {
    const point = points[i];
    if (!point) {
      out.push({ text: NOT_STATED, quote: null, source_url: null, validated: false });
      continue;
    }
    const check = checkQuote(point.quote, sources, point.url);
    out.push(
      check.valid
        ? { text: point.text, quote: point.quote, source_url: check.url, validated: true }
        : { text: NOT_STATED, quote: null, source_url: null, validated: false },
    );
  }

  return out;
}
