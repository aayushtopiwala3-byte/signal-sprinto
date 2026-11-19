import { z } from "zod";
import { NEVER_FABRICATE, jsonOnly } from "@/lib/ai/prompts/shared";
import { MIN_QUOTE_CHARS } from "@/lib/rules/evidenceValidator";
import {
  SUBJECT_MAX_CHARS,
  SUBJECT_MAX_WORDS,
  SUBJECT_MIN_WORDS,
} from "@/lib/rules/subject";
import type { HookPlan } from "@/lib/rules/hook";
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
  "subject": "sentence case, 4-9 words, under 60 characters, ending on a noun",
  "body": "the email body, under 150 words, signed off as the Growth Lead",
  "hook_quote": "the verbatim sentence from their site that the first line references",
  "hook_url": "the page URL that quote came from"
}`;

const PLAY_BRIEF: Record<Play, string> = {
  greenfield: `This company has no compliance certification yet. The angle is getting certified for the first time without it consuming an engineer for three months.`,
  migration: `This company is ALREADY certified. Do not offer to get them certified — that would read as if we had not done our homework. The angle is migration: maintaining and renewing the certification with less manual evidence collection than their current tooling or consultant requires.`,
};

/**
 * R-41 (§3.1) — never pitch a certification they already hold.
 *
 * The draft this rule exists to prevent told a company that had been SOC 2 compliant for two
 * years running that "obtaining certifications like SOC 2 and ISO 27001 often ties up an
 * engineer for three months". The evidence to contradict it was on the same card, two sections
 * up. Nothing in the prompt was wrong; the prompt was simply never told.
 *
 * Two routes into the migration angle. `certified` is the settled case. The contradicted case —
 * R-24 fired, so the pages disagree with each other — is not settled, and the email must not
 * pretend otherwise: it is written so that it still reads correctly if they are certified, which
 * means never offering to get them certified.
 */
const CONTRADICTION_BRIEF = `IMPORTANT — R-24 has fired on this company: their own pages disagree about whether they are certified. One page implies they are not; a verified quote elsewhere names a certification. You must therefore NEVER offer to get them certified, and never use phrases like "obtaining SOC 2" or "getting certified for the first time" — if they already hold it, that sentence destroys the email's credibility. Write so the email is correct either way: lead on the operational cost of maintaining and evidencing compliance continuously, not on acquiring it.`;

export function buildDraftPrompt(input: {
  domain: string;
  /** §4.4 — from SENDER_NAME, never hardcoded into the prompt. */
  senderName: string;
  contactName: string;
  contactTitle: string;
  signals: FiredSignal[];
  painPoints: { text: string; quote: string | null; url: string | null }[];
  play: Play;
  pages: { url: string; text: string }[];
  /** R-42 — which facts the hook may open on. */
  hook: HookPlan;
  /** R-41 — true when R-24 fired and the certification position is unsettled. */
  contradicted: boolean;
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

  return `Write one cold email to ${input.contactName}, ${input.contactTitle} at ${input.domain}, from ${input.senderName} at Sprinto (compliance automation for SOC 2 and ISO 27001).

PLAY: ${input.play}
${input.contradicted ? CONTRADICTION_BRIEF : PLAY_BRIEF[input.play]}

${
  input.hook.preferred.length > 0
    ? `HOOK — R-42. The first sentence must be built on ONE of these compliance-specific facts, not on a funding round or a press mention:
${input.hook.preferred.map((h) => `- ${h.label}: "${h.quote}" (${h.url ?? ""})`).join("\n")}`
    : `HOOK — R-42. No compliance-specific fact survived the evidence check for this company, so you may open on the strongest verified fact available, including a funding round. Do not pretend to knowledge the quotes above do not support.`
}

Evidence our rules engine found on their site:
${signalLines}

Pain points:
${painLines}

Hard constraints:
- Under 150 words in the body.
- The FIRST SENTENCE must reference a specific fact about ${input.domain} drawn from the quotes above. Not a compliment, not a generality.
- No superlatives. No "I hope this finds you well". No "I wanted to reach out". No "game-changing", "revolutionary", "best-in-class".
- One clear ask at the end, low commitment.
- Sign off as ${input.senderName}.
- Plain text. No markdown, no bullet points.
- The subject line is sentence case: capitalise the first word and proper nouns only. Not all-lowercase, not Title Case. Between ${SUBJECT_MIN_WORDS} and ${SUBJECT_MAX_WORDS} words, at most ${SUBJECT_MAX_CHARS} characters, and it must end on the noun it is about — never on "for", "to", "with", "the" or any other word that leaves the phrase hanging.

SOURCES:
${corpus}

${jsonOnly(SHAPE)}

"hook_quote" must be at least ${MIN_QUOTE_CHARS} characters and must appear character-for-character in one of the SOURCES above. "hook_url" must be the SOURCE URL it came from. If you cannot find a quote that supports your first sentence, rewrite the first sentence around a quote you can find.

${NEVER_FABRICATE}`;
}
