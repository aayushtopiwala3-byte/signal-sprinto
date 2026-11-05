import { z } from "zod";
import { NEVER_FABRICATE, jsonOnly } from "@/lib/ai/prompts/shared";
import { MIN_QUOTE_CHARS } from "@/lib/rules/evidenceValidator";
import type { LoopField } from "@/lib/types";

/**
 * AI-1 · Extract the Evidence Map fields (§6).
 *
 * The model never returns a URL. The URL is the page we fetched, which we already know — so a
 * hallucinated source is structurally impossible rather than merely discouraged.
 */

export const NOT_STATED_LITERAL = "not stated";

/**
 * A populated field with no quote fails Zod and triggers exactly one retry (T-15). That rule
 * lives here, in the schema, rather than in a prompt instruction the model may ignore.
 */
// The model expresses "no quote" as `null` as often as by omitting the key, and writes JSON
// booleans for the true/false fields instead of the quoted strings the shape asks for. Both are
// notation, not meaning, so they are normalised before validation rather than retried. The rule
// itself is untouched: an empty quote still fails `.refine` below for any populated value.
const asString = (v: unknown) => (typeof v === "boolean" ? String(v) : v);
const asQuote = (v: unknown) => (v == null ? "" : v);

const evidenced = <T extends string>(values: readonly [T, ...T[]]) =>
  z
    .object({
      value: z.preprocess(
        asString,
        z.enum([...values, NOT_STATED_LITERAL] as unknown as [string, ...string[]]),
      ),
      quote: z.preprocess(asQuote, z.string()).default(""),
    })
    .refine(
      (f) => f.value === NOT_STATED_LITERAL || f.quote.trim().length >= MIN_QUOTE_CHARS,
      (f) => ({
        message: `field "${f.value}" was populated without a verbatim quote of at least ${MIN_QUOTE_CHARS} characters. Either supply the quote copied character-for-character from the input text, or set value to "${NOT_STATED_LITERAL}".`,
      }),
    );

export const ExtractSchema = z.object({
  is_b2b_saas: evidenced(["true", "false"] as const),
  cert_status: evidenced(["none", "in_progress", "certified"] as const),
  size_band: evidenced(["1-10", "11-50", "51-200", "201-500", "500+"] as const),
  is_services: evidenced(["true", "false"] as const),
  pressure_signals: z
    .array(
      z.object({
        text: z.string().min(1),
        quote: z.string().min(MIN_QUOTE_CHARS),
      }),
    )
    .max(6)
    .default([]),
});

export type ExtractOutput = z.infer<typeof ExtractSchema>;

const SHAPE = `{
  "is_b2b_saas":  { "value": "true" | "false" | "not stated", "quote": "verbatim sentence" },
  "cert_status":  { "value": "none" | "in_progress" | "certified" | "not stated", "quote": "verbatim sentence" },
  "size_band":    { "value": "1-10" | "11-50" | "51-200" | "201-500" | "500+" | "not stated", "quote": "verbatim sentence" },
  "is_services":  { "value": "true" | "false" | "not stated", "quote": "verbatim sentence" },
  "pressure_signals": [ { "text": "short description", "quote": "verbatim sentence" } ]
}`;

export function buildExtractPrompt(input: {
  domain: string;
  url: string;
  text: string;
  emptyFields: readonly LoopField[];
}): string {
  const focus =
    input.emptyFields.length > 0
      ? `We still do not know: ${input.emptyFields.join(", ")}. Prioritise those, but fill anything else this page supports.`
      : `All fields already have values. Confirm or correct them from this page only.`;

  return `You are reading one page from the website of ${input.domain} on behalf of a B2B sales team that sells compliance automation (SOC 2, ISO 27001).

Extract only what this page states.

Field definitions:
- is_b2b_saas: does this company sell software to other businesses? A marketplace, a consumer app, a restaurant delivery service or an agency is "false".
- cert_status: "certified" only if the page states they hold a completed SOC 2 / ISO 27001 certification or attestation. "in_progress" if an audit, observation period or certification effort is described as under way, coming soon or on the roadmap. "none" if the page discusses security or the company generally but states no certification at all.
- size_band: headcount band. Use an explicit employee count, a "we are a team of N" statement, or an equivalent stated figure. Do not estimate from the number of job listings or team photographs.
- is_services: is this an agency, consultancy or services business rather than a software product company?
- pressure_signals: statements suggesting compliance or security pressure from customers — enterprise security reviews, questionnaires, DPAs, procurement requirements. Empty array is a valid and common answer.

${focus}

PAGE URL: ${input.url}

PAGE TEXT:
"""
${input.text}
"""

${jsonOnly(SHAPE)}

Every "quote" must be at least ${MIN_QUOTE_CHARS} characters and must appear character-for-character in the PAGE TEXT above. Do not supply a URL — we already know which page this is.

${NEVER_FABRICATE}`;
}
