/**
 * §6.3 — R-50…R-55. What happens to a reply is decided here, in plain code.
 *
 * AI-5 reads the reply and says what it thinks it means. That is all it does. The consequence —
 * suppress, snooze, block, re-contact — is a pure function of the intent, and it has to be,
 * because one of these actions is irreversible. A model that could reach `unsubscribe` by
 * inference rather than by quotation would be a model that can permanently block a domain, and
 * no amount of prompt care makes that acceptable.
 *
 * Two guards sit in front of the table:
 *
 *  - **The quote must appear verbatim in the pasted reply**, or the intent is forced to
 *    `unclear`. Same rule as R-23, same reason: a classification with no traceable sentence
 *    behind it is an opinion, and opinions do not get to block domains.
 *  - **Nothing is applied until a human confirms it**, and R-54 additionally requires the
 *    confirmation to be typed. The checkpoint is the product, not a formality around it.
 */

import { normalizeForComparison } from "@/lib/rules/evidenceValidator";

export const REPLY_INTENTS = [
  "interested",
  "not_now",
  "wrong_person",
  "not_interested",
  "unsubscribe",
  "unclear",
] as const;

export type ReplyIntent = (typeof REPLY_INTENTS)[number];

/** What the action does to future runs. `none` leaves the domain exactly as it was. */
export type OutreachEffect = "won" | "snooze" | "suppress" | "block" | "recontact" | "none";

export type ReplyAction = {
  rule: string;
  intent: ReplyIntent;
  /** One line naming what will happen, shown before anything is applied. */
  summary: string;
  effect: OutreachEffect;
  /** Days until the effect lapses. Null means it does not. */
  days: number | null;
  /** R-54 only. A typed confirmation is required because the action cannot be undone. */
  requiresTypedConfirmation: boolean;
  /** The exact string the human must type, when one is required. */
  confirmationPhrase?: string;
  /** False when the rule deliberately does nothing on its own (R-55). */
  automatic: boolean;
};

export const SNOOZE_DAYS = 90;
export const SUPPRESS_DAYS = 180;

/** R-54's typed confirmation. Short enough to type, specific enough not to be reflex. */
export const UNSUBSCRIBE_PHRASE = "BLOCK PERMANENTLY";

/**
 * The quote guard. A reply is pasted text, so "appears verbatim" is checkable exactly —
 * there is no fetching, no caching and no ambiguity about which source to check against.
 */
export function quoteIsInReply(quote: string | null, reply: string): boolean {
  if (quote === null || quote.trim().length === 0) return false;
  return normalizeForComparison(reply).includes(normalizeForComparison(quote));
}

/**
 * AI-5's reading, after the guard. An intent whose quote is not in the reply becomes `unclear`,
 * which is the one intent that does nothing by itself.
 */
export function groundedIntent(
  intent: ReplyIntent,
  quote: string | null,
  reply: string,
): { intent: ReplyIntent; downgraded: boolean; reason: string | null } {
  if (intent === "unclear") return { intent, downgraded: false, reason: null };
  if (quoteIsInReply(quote, reply)) return { intent, downgraded: false, reason: null };
  return {
    intent: "unclear",
    downgraded: true,
    reason:
      quote === null || quote.trim().length === 0
        ? "the model gave no quote to support its reading, so there is nothing to check it against"
        : "the quote the model gave does not appear in the reply, so its reading cannot be traced to anything the sender wrote",
  };
}

/** R-50…R-55. Pure, total over the six intents. */
export function actionFor(intent: ReplyIntent): ReplyAction {
  switch (intent) {
    case "interested":
      return {
        rule: "R-50",
        intent,
        summary:
          "Mark this company won and stop further outreach. It will show in “what changed” on the next run.",
        effect: "won",
        days: null,
        requiresTypedConfirmation: false,
        automatic: true,
      };

    case "not_now":
      return {
        rule: "R-51",
        intent,
        summary: `Snooze for ${SNOOZE_DAYS} days. The company is not suppressed — it stays on the board and ranks below live prospects until the date passes.`,
        effect: "snooze",
        days: SNOOZE_DAYS,
        requiresTypedConfirmation: false,
        automatic: true,
      };

    case "wrong_person":
      return {
        rule: "R-52",
        intent,
        summary:
          "Re-run the contact ladder with this person excluded and promote the runner-up. The company is not suppressed — the company was right, the person was not.",
        effect: "recontact",
        days: null,
        requiresTypedConfirmation: false,
        automatic: true,
      };

    case "not_interested":
      return {
        rule: "R-53",
        intent,
        summary: `Suppress for ${SUPPRESS_DAYS} days with the reason recorded. Future runs will skip this domain until the date passes.`,
        effect: "suppress",
        days: SUPPRESS_DAYS,
        requiresTypedConfirmation: false,
        automatic: true,
      };

    case "unsubscribe":
      return {
        rule: "R-54",
        intent,
        summary:
          "Block this domain permanently. Every future run quarantines it before any page is fetched. This cannot be undone from this interface.",
        effect: "block",
        days: null,
        requiresTypedConfirmation: true,
        confirmationPhrase: UNSUBSCRIBE_PHRASE,
        automatic: true,
      };

    case "unclear":
      return {
        rule: "R-55",
        intent,
        summary:
          "No automatic action. The reading below is a suggestion only — choose what should happen, or leave it alone.",
        effect: "none",
        days: null,
        requiresTypedConfirmation: false,
        automatic: false,
      };
  }
}

/** The date an effect lapses, computed from a caller-supplied `now` so it stays testable. */
export function expiryFor(action: ReplyAction, now: Date): Date | null {
  if (action.days === null) return null;
  return new Date(now.getTime() + action.days * 24 * 60 * 60 * 1000);
}

/**
 * Whether a confirmation is good enough to apply. Separated from the UI so the API can run the
 * same check — a typed confirmation enforced only in the browser is not enforced.
 */
export function confirmationAccepted(action: ReplyAction, typed: string | null): boolean {
  if (!action.requiresTypedConfirmation) return true;
  return typed !== null && typed.trim() === action.confirmationPhrase;
}
