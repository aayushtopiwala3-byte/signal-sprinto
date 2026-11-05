import { z } from "zod";
import { NEVER_FABRICATE, jsonOnly } from "@/lib/ai/prompts/shared";
import { MIN_QUOTE_CHARS } from "@/lib/rules/evidenceValidator";
import type { FiredSignal, Play } from "@/lib/types";

/**
 * AI-4 · Draft the email (§6).
 *
 * The output passes through the evidence validator before it can be sent: a hook quote that is
 * not in the source text blocks the draft (T-10). The prompt asks for grounding; the validator
 * is what guarantees it.
 */

export const DraftSchema = z.object({
  subject: z.string().min(1).max(140),
  body: z.string().min(1),
  hook_quote: z.string().min(1),
  hook_url: z.string().min(1),
});

export type DraftOutput = z.infer<typeof DraftSchema>;

const SHAPE = `{
  "subject": "under 60 characters, lower-case, specific",
  "body": "the email body, under 150 words, signed off as the Growth Lead",
  "hook_quote": "the verbatim sentence from their site that the first line references",
  "hook_url": "the page URL that quote came from"
}`;

const PLAY_BRIEF: Record<Play, string> = {
  greenfield: `This company has no compliance certification yet. The angle is getting certified for the first time without it consuming an engineer for three months.`,
  migration: `This company is ALREADY certified. Do not offer to get them certified — that would read as if we had not done our homework. The angle is migration: maintaining and renewing the certification with less manual evidence collection than their current tooling or consultant requires.`,
};

export function buildDraftPrompt(input: {
  domain: string;
  contactName: string;
  contactTitle: string;
  signals: FiredSignal[];
  painPoints: { text: string; quote: string | null; url: string | null }[];
  play: Play;
  pages: { url: string; text: string }[];
}): string {
  const signalLines =
    input.signals
      .map((s) => `- ${s.signal_id}: "${s.quote ?? ""}" (${s.source_url ?? ""})`)
      .join("\n") || "- (none)";

  const painLines =
    input.painPoints
      .filter((p) => p.quote)
      .map((p) => `- ${p.text}\n  evidence: "${p.quote}" (${p.url})`)
      .join("\n") || "- (none validated)";

  const corpus = input.pages
    .map((p) => `### SOURCE ${p.url}\n"""\n${p.text}\n"""`)
    .join("\n\n");

  return `Write one cold email to ${input.contactName}, ${input.contactTitle} at ${input.domain}, from the Growth Lead at Sprinto (compliance automation for SOC 2 and ISO 27001).

PLAY: ${input.play}
${PLAY_BRIEF[input.play]}

Evidence our rules engine found on their site:
${signalLines}

Pain points:
${painLines}

Hard constraints:
- Under 150 words in the body.
- The FIRST SENTENCE must reference a specific fact about ${input.domain} drawn from the quotes above. Not a compliment, not a generality.
- No superlatives. No "I hope this finds you well". No "I wanted to reach out". No "game-changing", "revolutionary", "best-in-class".
- One clear ask at the end, low commitment.
- Sign off as the Growth Lead at Sprinto.
- Plain text. No markdown, no bullet points.

SOURCES:
${corpus}

${jsonOnly(SHAPE)}

"hook_quote" must be at least ${MIN_QUOTE_CHARS} characters and must appear character-for-character in one of the SOURCES above. "hook_url" must be the SOURCE URL it came from. If you cannot find a quote that supports your first sentence, rewrite the first sentence around a quote you can find.

${NEVER_FABRICATE}`;
}
