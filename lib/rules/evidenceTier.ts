import { NOT_STATED, type EvidenceTier, type FiredSignal, type SignalId } from "@/lib/types";
import { normalizeForComparison, type Source } from "@/lib/rules/evidenceValidator";

/**
 * R-23 — three evidence tiers (§3.1).
 *
 * The validator this sits on top of answers one question: does the quote appear verbatim on a
 * page we fetched? That question turned out to be the easy half. Every one of these passed it:
 *
 *   zerodha  S-02  "Warning: Target URL returned error 404: Not Found"
 *   springworks S-02  "* Description YouTube cookie used to protect user security ..."
 *   zipy     S-06  "SaaS startups have raised $5 billion ... according to Venture Intelligence"
 *   zipy     S-07  "Prior to Zipy, Vishalini ... mentored startups in edtech, healthcare ..."
 *
 * A reader-tier error message, a cookie banner, an industry statistic and a bio of somebody's
 * previous job. All real text, really on those pages, and not one of them evidence that *this
 * company* is doing the thing the signal claims. So a quote now has to clear two further bars,
 * both decided in code:
 *
 *   it is about this company   — names them, or speaks in the first person on their own page
 *   it is about this claim     — contains a trigger term for the signal it was attached to
 *
 * Only VERIFIED contributes to `timing_score` and to `independent_signals` (R-21). ASSERTED is
 * still shown, greyed, with the reason — hiding it would teach the reader nothing and would
 * quietly recreate the thing R-23 exists to expose.
 */

export type { EvidenceTier };

export type TierVerdict = {
  tier: EvidenceTier;
  /** Why it is not verified, phrased for the card. Null when it is. */
  reason: string | null;
  /** The page the quote was actually found on, which may not be the one claimed. */
  url: string | null;
};

/* --------------------------------------------------------------- company mention */

/**
 * "nected.ai" → "nected", "springworks.in" → "springworks", "rocketlane.com" → "rocketlane".
 * The stem is what appears in prose; nobody writes "Rocketlane.com raised a Series C".
 */
export function domainStem(domain: string): string {
  const host = domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
  const label = host.split(".")[0] ?? host;
  return label.replace(/[^a-z0-9]/g, "");
}

/** First person is only a company mention on the company's own site. */
const FIRST_PERSON = /\b(we|we're|we've|our|ours|us)\b/i;

function sameHost(url: string | null, domain: string): boolean {
  if (!url) return false;
  try {
    return new URL(url).hostname.replace(/^www\./, "").endsWith(domainRoot(domain));
  } catch {
    return false;
  }
}

function domainRoot(domain: string): string {
  return domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
}

/**
 * Frames that name the company but attribute the claim to somebody else, or to a different time.
 * Without these, "Prior to Zipy, Vishalini ... mentored startups in ... healthcare" counts as
 * Zipy selling into healthcare, because the word "Zipy" and the word "healthcare" are both
 * present in one sentence. They are, and it does not.
 */
const BIOGRAPHICAL = /\b(prior to|before joining|previously (?:at|with|the)|formerly (?:at|of|the)|ex-[a-z]|alum(?:nus|na|ni)? of|earlier in (?:his|her|their) career)\b/i;
const THIRD_PARTY =
  /\b(according to|as reported by|data (?:from|research)|research (?:firm|and analysis)|survey (?:by|from)|report(?:ed)? by|study by|analysts? at)\b/i;

export type MentionCheck = { mentions: boolean; reason: string | null };

export function mentionsCompany(
  quote: string,
  domain: string,
  sourceUrl: string | null,
): MentionCheck {
  const stem = domainStem(domain);
  const named = stem.length >= 3 && new RegExp(`\\b${stem}\\b`, "i").test(quote);
  const firstPerson = FIRST_PERSON.test(quote) && sameHost(sourceUrl, domain);

  if (!named && !firstPerson) {
    return {
      mentions: false,
      reason: `the quote is real but does not mention ${stem}`,
    };
  }

  // Named, but the sentence hands the claim to someone else or to a previous employer.
  if (named) {
    if (BIOGRAPHICAL.test(quote)) {
      return {
        mentions: false,
        reason: `the quote names ${stem} only to date something that happened before it — it describes a person's earlier work, not ${stem}`,
      };
    }
    if (THIRD_PARTY.test(quote)) {
      return {
        mentions: false,
        reason: `the quote attributes the claim to a third party rather than to ${stem}`,
      };
    }
  }

  return { mentions: true, reason: null };
}

/* --------------------------------------------------------------- trigger terms */

/**
 * The term that has to be present for the quote to be about *this* claim. Deliberately looser
 * than the detector's own patterns: the detector decides whether a signal fires, this decides
 * whether the sentence it chose is on topic. A quote that fires S-06 on "raised $60 million"
 * and is then asked to prove S-06 should not fail on a wording difference.
 */
export const SIGNAL_TRIGGERS: Record<SignalId, RegExp> = {
  "S-01": /\b(soc\s*2|soc2|iso\s*27001|iso27001|hipaa|pci|certif|audit|compliance|attestation|type\s*(?:1|2|i|ii))\b/i,
  "S-02": /\b(security|trust|compliance|privacy|certif|soc\s*2|iso\s*27001)\b/i,
  "S-03": /\b(security|compliance|grc|infosec|information security|ciso|governance|risk|hiring|role|engineer|analyst|manager|lead|officer)\b/i,
  "S-04": /\b(fortune|global\s*2000|enterprise|trusted by|customers?|clients?|brands?|teams)\b/i,
  "S-05": /\b(soc\s*2|iso\s*27001|security review|questionnaire|dpa|data processing|sso|scim|audit log|enterprise)\b/i,
  "S-06": /\b(series\s*[a-e]|seed|raised|funding|round|investment|led by|valuation|\$\s*\d)\b/i,
  "S-07": /\b(healthcare|health|patients?|clinical|ehr|hipaa|fintech|financial|bank|lending|payments?|insurance|payroll|hr tech|human resources|recruiting|benefits|pharma|government|regulated)\b/i,
};

/* --------------------------------------------------------------- the tier itself */

/** Does the quote appear verbatim on any page we fetched? */
export function appearsVerbatim(quote: string, sources: Source[]): { found: boolean; url: string | null } {
  const needle = normalizeForComparison(quote);
  if (needle.length === 0) return { found: false, url: null };
  for (const source of sources) {
    if (normalizeForComparison(source.text).includes(needle)) {
      return { found: true, url: source.url };
    }
  }
  return { found: false, url: null };
}

/**
 * The whole of R-23 for one claim. `trigger` is omitted for pain points and draft hooks, which
 * are not tied to a single signal — for those, the company-mention condition is the whole of
 * the support test.
 */
export function tierFor(args: {
  quote: string | null | undefined;
  claimedUrl: string | null;
  sources: Source[];
  domain: string;
  trigger?: RegExp;
}): TierVerdict {
  const { quote, claimedUrl, sources, domain, trigger } = args;

  if (!quote || quote.trim().length === 0) {
    return { tier: "fabricated", reason: "no quote was supplied", url: null };
  }

  const verbatim = appearsVerbatim(quote, sources);
  if (!verbatim.found) {
    return {
      tier: "fabricated",
      reason: "this quote does not appear on any page we fetched for this company",
      url: null,
    };
  }

  const url = verbatim.url ?? claimedUrl;

  const mention = mentionsCompany(quote, domain, url);
  if (!mention.mentions) {
    return { tier: "asserted", reason: mention.reason, url };
  }

  if (trigger && !trigger.test(quote)) {
    return {
      tier: "asserted",
      reason: "the quote is real and about this company, but says nothing about the claim it was attached to",
      url,
    };
  }

  return { tier: "verified", reason: null, url };
}

/** Convenience for signals, which always have a trigger. */
export function tierForSignal(args: {
  signal_id: SignalId;
  quote: string | null;
  claimedUrl: string | null;
  sources: Source[];
  domain: string;
}): TierVerdict {
  return tierFor({
    quote: args.quote,
    claimedUrl: args.claimedUrl,
    sources: args.sources,
    domain: args.domain,
    trigger: SIGNAL_TRIGGERS[args.signal_id],
  });
}

/* --------------------------------------------------------------- pain points & drafts */

export type TieredPainPoint = {
  text: string;
  quote: string | null;
  source_url: string | null;
  validated: boolean;
  tier: EvidenceTier;
  tier_reason: string | null;
  /**
   * Whether the model actually offered a claim here. Two slots are always returned, so an
   * unfilled one is tiered `fabricated` for display — but it is not a fabrication the check
   * caught, and counting it on Health would inflate the number with the model's silences.
   */
  produced: boolean;
  /** The quote as claimed, kept for the §3.2 ledger even when it is stripped from the card. */
  original_quote: string | null;
};

/**
 * §3.1 applies R-23 to pain points as well as signals. A pain point is not tied to one signal,
 * so the company-mention test is the whole of the support check.
 *
 * An asserted point keeps its text and its quote and is rendered greyed — the reader can see
 * what was found and why it was not trusted. A fabricated one is replaced with `not stated`,
 * because there is no page to link it to and nothing honest to show.
 */
export function tierPainPoints(
  points: { text: string; quote: string | null; url: string | null }[],
  sources: Source[],
  domain: string,
): TieredPainPoint[] {
  const out: TieredPainPoint[] = [];

  for (let i = 0; i < 2; i++) {
    const point = points[i];
    if (!point) {
      out.push({
        text: NOT_STATED,
        quote: null,
        source_url: null,
        validated: false,
        tier: "fabricated",
        tier_reason: "no pain point was produced",
        produced: false,
        original_quote: null,
      });
      continue;
    }

    const verdict = tierFor({
      quote: point.quote,
      claimedUrl: point.url,
      sources,
      domain,
    });

    out.push(
      verdict.tier === "fabricated"
        ? {
            text: NOT_STATED,
            quote: null,
            source_url: null,
            validated: false,
            tier: "fabricated",
            tier_reason: verdict.reason,
            produced: true,
            original_quote: point.quote,
          }
        : {
            text: point.text,
            quote: point.quote,
            source_url: verdict.url,
            validated: verdict.tier === "verified",
            tier: verdict.tier,
            tier_reason: verdict.reason,
            produced: true,
            original_quote: point.quote,
          },
    );
  }

  return out;
}

export type TieredDraft = {
  validated: boolean;
  blocked_reason: string | null;
  hook_url: string | null;
  tier: EvidenceTier;
};

/**
 * T-10 with R-23's teeth. A draft is sendable only on a **verified** hook.
 *
 * Asserted is blocked too, and that is the point rather than an oversight: a cold email whose
 * opening line quotes a sentence that is not about the recipient is the precise failure this
 * whole build is meant to prevent. The draft is still written and still shown, with the reason
 * on the card — blocking it silently would teach the reader nothing.
 */
export function tierDraft(
  draft: { hook_quote: string | null; hook_url: string | null; body: string },
  sources: Source[],
  domain: string,
): TieredDraft {
  const verdict = tierFor({
    quote: draft.hook_quote,
    claimedUrl: draft.hook_url,
    sources,
    domain,
  });

  if (verdict.tier === "verified") {
    return { validated: true, blocked_reason: null, hook_url: verdict.url, tier: "verified" };
  }

  const prefix =
    verdict.tier === "fabricated"
      ? "Hook evidence failed (R-23, fabricated)"
      : "Hook evidence failed (R-23, asserted)";

  return {
    validated: false,
    blocked_reason: `${prefix}: ${verdict.reason}. This draft cannot be sent.`,
    hook_url: verdict.url ?? draft.hook_url,
    tier: verdict.tier,
  };
}

/**
 * Decorate detected signals with their tier, and correct `source_url` to the page the quote was
 * actually found on. Detection stays pure pattern matching over text; this is the separate
 * question of whether the sentence it picked supports the claim it was attached to.
 *
 * Fabricated signals are dropped outright — a signal whose quote is on no page we fetched has
 * no business on the card even greyed, because there is nothing to link to.
 */
export function applyEvidenceTiers(
  fired: FiredSignal[],
  domain: string,
  sources: Source[],
): FiredSignal[] {
  return tierAllSignals(fired, domain, sources).filter((s) => s.tier !== "fabricated");
}

/**
 * The same work without the drop, for callers that have to account for what was refused.
 *
 * A fabrication that is silently discarded cannot be counted, and §3.2's counter is the proof
 * that the check runs at all — so the pipeline tiers with this, records the failures, and only
 * then filters. Scoring callers should keep using `applyEvidenceTiers`.
 */
export function tierAllSignals(
  fired: FiredSignal[],
  domain: string,
  sources: Source[],
): FiredSignal[] {
  return fired.map((signal) => {
    const verdict = tierForSignal({
      signal_id: signal.signal_id,
      quote: signal.quote,
      claimedUrl: signal.source_url,
      sources,
      domain,
    });
    return {
      ...signal,
      source_url: verdict.url ?? signal.source_url,
      tier: verdict.tier,
      tier_reason: verdict.reason,
    };
  });
}
