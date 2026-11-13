import { z } from "zod";
import { NEVER_FABRICATE, jsonOnly } from "@/lib/ai/prompts/shared";
import { REPLY_INTENTS } from "@/lib/rules/replyIntent";

/**
 * AI-5 · Read a reply and say what it means (§6.3).
 *
 * The model classifies. It does not decide. R-50…R-55 turn an intent into an action in plain
 * code, and the quote below is what makes that safe: an intent whose quote is not in the reply
 * is forced to `unclear` before the rules ever see it, so an inferred `unsubscribe` cannot
 * reach the one action that is irreversible.
 *
 * The prompt asks for a conservative reading for the same reason. Where the two mechanisms
 * disagree, the code wins — the prompt is a preference, the guard is a rule.
 */

export const ReplyIntentSchema = z.object({
  intent: z.enum(REPLY_INTENTS),
  confidence: z.number().min(0).max(1),
  quote: z.string().min(1),
});

export type ReplyIntentOutput = z.infer<typeof ReplyIntentSchema>;

const SHAPE = `{
  "intent": "one of: interested | not_now | wrong_person | not_interested | unsubscribe | unclear",
  "confidence": 0.0 to 1.0,
  "quote": "the verbatim sentence from the reply that your reading rests on"
}`;

export function buildReplyIntentPrompt(input: { domain: string; reply: string }): string {
  return `Classify this reply to a cold email sent to someone at ${input.domain}.

REPLY:
"""
${input.reply}
"""

The six intents:

- interested — they want to talk, see a demo, know pricing, or be introduced to someone who does.
- not_now — the need is real but the timing is wrong. "Check back next quarter", "we're mid-audit", "after our funding closes".
- wrong_person — they are not the right contact. They may or may not name a better one. The COMPANY is still a fit; the PERSON is not.
- not_interested — they do not want this, for a reason that is about the offer. Already have a vendor, built it in-house, no budget.
- unsubscribe — they are asking not to be contacted again. "Remove me", "take us off your list", "do not email me". This is about CONTACT, not about the offer.
- unclear — anything you cannot place with confidence. An out-of-office. A one-word answer. A forward with no comment. Two readings that are equally plausible.

Rules for choosing:

- **unsubscribe is narrower than not_interested.** "We're not interested" is not_interested. "We're not interested, please stop emailing" is unsubscribe. If they did not ask to stop being contacted, it is not unsubscribe.
- **not_now is narrower than interested.** A warm no with a date is not_now, not interested.
- **Prefer unclear over a guess.** unclear has no consequence attached to it; every other intent does. Being wrong in the direction of unclear costs a human ten seconds. Being wrong in the direction of unsubscribe permanently blocks a company that never asked to be blocked.
- "confidence" is your own, honestly: below 0.6 means you would not defend this reading.

"quote" must be a sentence or phrase that appears character-for-character in the REPLY above, and it must be the part that carries your reading — not the greeting, not the signature. A quote that does not appear in the reply causes your classification to be discarded in favour of unclear.

${jsonOnly(SHAPE)}

${NEVER_FABRICATE}`;
}
