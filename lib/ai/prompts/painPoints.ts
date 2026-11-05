import { z } from "zod";
import { NEVER_FABRICATE, jsonOnly } from "@/lib/ai/prompts/shared";
import { MIN_QUOTE_CHARS } from "@/lib/rules/evidenceValidator";
import type { FiredSignal } from "@/lib/types";

/**
 * AI-3 · Two pain points (§6).
 *
 * Whatever comes back is re-checked against the source text by
 * `validatePainPoints` — a quote that does not appear verbatim is rejected in code and
 * replaced with `not stated`, regardless of how confident the prose sounds.
 */

export const PainPointsSchema = z.object({
  pain_points: z
    .array(
      z.object({
        text: z.string().min(1),
        quote: z.string().min(1),
        url: z.string().min(1),
      }),
    )
    .min(1)
    .max(2),
});

export type PainPointsOutput = z.infer<typeof PainPointsSchema>;

const SHAPE = `{
  "pain_points": [
    { "text": "one sentence naming the problem", "quote": "verbatim sentence from the source", "url": "the page URL it came from" },
    { "text": "...", "quote": "...", "url": "..." }
  ]
}`;

export function buildPainPointsPrompt(input: {
  domain: string;
  signals: FiredSignal[];
  pages: { url: string; text: string }[];
}): string {
  const signalLines =
    input.signals.length > 0
      ? input.signals
          .map((s) => `- ${s.signal_id} (${s.independence_group}): "${s.quote ?? ""}"`)
          .join("\n")
      : "- (no timing signals fired)";

  const corpus = input.pages
    .map((p) => `### SOURCE ${p.url}\n"""\n${p.text}\n"""`)
    .join("\n\n");

  return `You are preparing a cold outreach email to ${input.domain} on behalf of Sprinto, which automates SOC 2 and ISO 27001 compliance.

Identify exactly two compliance-related problems this specific company plausibly has, each supported by a verbatim quote from their own site.

Signals our rules engine already detected:
${signalLines}

Good pain points are specific to this company: an audit under way with no automation, enterprise buyers demanding security reviews, a first security hire about to inherit manual evidence collection.
Bad pain points are generic: "compliance is hard", "security matters".

SOURCES:
${corpus}

${jsonOnly(SHAPE)}

Each "quote" must be at least ${MIN_QUOTE_CHARS} characters and must appear character-for-character in one of the SOURCES above. Each "url" must be one of the SOURCE URLs exactly as written.

${NEVER_FABRICATE}`;
}
