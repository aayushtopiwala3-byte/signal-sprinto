import { aiCall } from "@/lib/ai/call";
import { ExtractSchema, buildExtractPrompt, NOT_STATED_LITERAL } from "@/lib/ai/prompts/extract";
import { checkQuote } from "@/lib/rules/evidenceValidator";
import { sentences } from "@/lib/rules/signals";
import type { CertStatus, EvidenceMap, Evidence, LoopField, SizeBand } from "@/lib/types";

/**
 * ④ Extraction. AI-1 when the model is available, keyword matching when it is not.
 *
 * Both paths produce the same shape, and both are subject to the same rule: a field is only
 * populated if a verbatim quote from this page supports it. Rules-only mode therefore produces
 * genuine verdicts rather than a degraded imitation of them (T-23, T-25).
 */

export type ExtractionResult = {
  evidence: EvidenceMap;
  filled: LoopField[];
  source: "ai" | "rules";
  /** Named reason when AI was unavailable, so the UI can say why. */
  fallbackReason: string | null;
  attempts: number;
};

/** Only fill what is empty. A later page never overwrites an earlier, evidenced answer. */
function merge(
  current: EvidenceMap,
  found: Partial<EvidenceMap>,
): { evidence: EvidenceMap; filled: LoopField[] } {
  const next = { ...current };
  const filled: LoopField[] = [];

  const take = <K extends keyof EvidenceMap>(key: K, evidenceKey?: keyof EvidenceMap) => {
    if (next[key] !== null || found[key] === undefined || found[key] === null) return;
    next[key] = found[key] as EvidenceMap[K];
    if (evidenceKey && found[evidenceKey] !== undefined) {
      (next as Record<string, unknown>)[evidenceKey] = found[evidenceKey];
    }
    if (key === "is_b2b_saas" || key === "cert_status" || key === "size_band" || key === "pressure_signals") {
      filled.push(key);
    }
  };

  take("is_b2b_saas", "is_b2b_saas_evidence");
  take("cert_status", "cert_status_evidence");
  take("size_band", "size_band_evidence");
  take("pressure_signals");
  take("is_services");

  return { evidence: next, filled };
}

/* ------------------------------------------------------------------- AI-1 */

export async function extractWithAi(input: {
  domain: string;
  url: string;
  text: string;
  current: EvidenceMap;
  runId: string | null;
  companyId: string | null;
  aiEnabled: boolean;
  budgetExhausted: boolean;
  emptyFields: readonly LoopField[];
}): Promise<ExtractionResult> {
  const prompt = buildExtractPrompt({
    domain: input.domain,
    url: input.url,
    text: input.text,
    emptyFields: input.emptyFields,
  });

  const result = await aiCall({
    callName: "AI-1 extract",
    prompt,
    schema: ExtractSchema,
    runId: input.runId,
    companyId: input.companyId,
    aiEnabled: input.aiEnabled,
    budgetExhausted: input.budgetExhausted,
  });

  if (!result.ok) {
    const fallback = extractWithRules(input.url, input.text, input.current);
    return { ...fallback, fallbackReason: result.reason, attempts: result.attempts };
  }

  const sources = [{ url: input.url, text: input.text }];
  const found: Partial<EvidenceMap> = {};

  const read = (field: { value: string; quote: string }): Evidence | null => {
    if (field.value === NOT_STATED_LITERAL) return null;
    // Zod guaranteed a quote exists; this guarantees it is actually on the page.
    const check = checkQuote(field.quote, sources, input.url);
    return check.valid ? { quote: field.quote, url: check.url } : null;
  };

  const b2b = read(result.data.is_b2b_saas);
  if (b2b) {
    found.is_b2b_saas = result.data.is_b2b_saas.value === "true";
    found.is_b2b_saas_evidence = b2b;
  }

  const cert = read(result.data.cert_status);
  if (cert) {
    found.cert_status = result.data.cert_status.value as CertStatus;
    found.cert_status_evidence = cert;
  }

  const size = read(result.data.size_band);
  if (size) {
    found.size_band = result.data.size_band.value as SizeBand;
    found.size_band_evidence = size;
  }

  const services = read(result.data.is_services);
  if (services) found.is_services = result.data.is_services.value === "true";

  // pressure_signals becomes an empty array, not null, once a page has been read (§4.3).
  found.pressure_signals = result.data.pressure_signals
    .filter((p) => checkQuote(p.quote, sources, input.url).valid)
    .map((p) => p.text);

  const merged = merge(input.current, found);
  return { ...merged, source: "ai", fallbackReason: null, attempts: result.attempts };
}

/* --------------------------------------------------- rules-only extraction */

const PATTERNS = {
  b2bTrue:
    /\b(for (?:teams|businesses|companies|enterprises)|b2b|saas platform|our platform helps (?:teams|companies)|software for|workflow (?:automation|software)|api\b|integrations?\b|per (?:user|seat)\/month|start(?:s)? your free trial|book a demo)\b/i,
  // Every alternative here must be consumer-specific on its own. Bare `delivery` and bare
  // `restaurant` were not: "service delivery" and "software for restaurants" are ordinary B2B
  // SaaS copy, and matching them produced a confident R-01 DROP on a quote that did not support
  // it. A false reading of this field ends the pipeline, so it is held to a higher bar than a
  // true one.
  b2bFalse:
    /\b(order (?:food|groceries|online)|food delivery|restaurants? near (?:you|me)|book a table|marketplace for consumers|download the app on the (?:app store|play store)|shop now|free shipping|add to (?:cart|basket))\b/i,
  services:
    /\b(our consultants|consulting services|agency|we are a (?:design|development|digital) (?:studio|agency)|staff augmentation|bespoke development services)\b/i,
  certified:
    /\b(?:we are|is|are now)\s*(?:soc\s*2|iso\s*27001)[^.]{0,60}\b(?:certified|compliant)\b|\b(?:soc\s*2|iso\s*27001)[^.]{0,40}\b(?:certification|attestation|report)\s*(?:is\s*)?(?:complete|available|achieved)\b/i,
  inProgress:
    /\b(soc\s*2|soc2|iso\s*27001|iso27001)\b[^.]{0,80}\b(in progress|under ?way|coming soon|roadmap|pursuing|working to(?:wards?)?|currently undergoing|observation period|in the process)\b/i,
  securityMention: /\b(security|compliance|privacy|data protection)\b/i,
};

const SIZE_PATTERNS: { band: SizeBand; re: RegExp }[] = [
  { band: "500+", re: /\b(?:[5-9]\d{2}|[1-9]\d{3,})\+?\s*(?:employees|people|team members|strong)\b/i },
  { band: "201-500", re: /\b(?:2[0-9]\d|[34]\d\d)\+?\s*(?:employees|people|team members|strong)\b/i },
  { band: "51-200", re: /\b(?:[6-9]\d|1\d\d|2 ?00)\+?\s*(?:employees|people|team members|strong)\b/i },
  { band: "11-50", re: /\b(?:[1-5]\d)\+?\s*(?:employees|people|team members|strong)\b/i },
  { band: "1-10", re: /\b(?:[1-9])\s*(?:employees|people|team members)\b|\bsmall team of\b/i },
];

function quoteFor(text: string, re: RegExp): string | null {
  for (const sentence of sentences(text)) {
    if (re.test(sentence)) return sentence;
  }
  return null;
}

/**
 * Rules-only extraction (§5.5, `ai_enabled` off). Keyword and shape matching over cleaned text,
 * holding to the same evidence standard: no quote, no value.
 */
export function extractWithRules(
  url: string,
  text: string,
  current: EvidenceMap,
): Omit<ExtractionResult, "fallbackReason" | "attempts"> {
  const found: Partial<EvidenceMap> = {};

  const b2bQuote = quoteFor(text, PATTERNS.b2bTrue);
  const consumerQuote = quoteFor(text, PATTERNS.b2bFalse);
  if (consumerQuote && !b2bQuote) {
    found.is_b2b_saas = false;
    found.is_b2b_saas_evidence = { quote: consumerQuote, url };
  } else if (b2bQuote) {
    found.is_b2b_saas = true;
    found.is_b2b_saas_evidence = { quote: b2bQuote, url };
  }

  const servicesQuote = quoteFor(text, PATTERNS.services);
  if (servicesQuote) found.is_services = true;

  const certifiedQuote = quoteFor(text, PATTERNS.certified);
  const progressQuote = quoteFor(text, PATTERNS.inProgress);
  if (certifiedQuote) {
    found.cert_status = "certified";
    found.cert_status_evidence = { quote: certifiedQuote, url };
  } else if (progressQuote) {
    found.cert_status = "in_progress";
    found.cert_status_evidence = { quote: progressQuote, url };
  } else if (/\/(security|trust|compliance)\b/i.test(url)) {
    const mention = quoteFor(text, PATTERNS.securityMention);
    if (mention) {
      found.cert_status = "none";
      found.cert_status_evidence = { quote: mention, url };
    }
  }

  for (const { band, re } of SIZE_PATTERNS) {
    const quote = quoteFor(text, re);
    if (quote) {
      found.size_band = band;
      found.size_band_evidence = { quote, url };
      break;
    }
  }

  found.pressure_signals = [];

  const merged = merge(current, found);
  return { ...merged, source: "rules" };
}
