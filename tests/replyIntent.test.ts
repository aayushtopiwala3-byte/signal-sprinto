import { describe, expect, it } from "vitest";
import {
  REPLY_INTENTS,
  SNOOZE_DAYS,
  SUPPRESS_DAYS,
  UNSUBSCRIBE_PHRASE,
  actionFor,
  confirmationAccepted,
  expiryFor,
  groundedIntent,
  quoteIsInReply,
  type ReplyIntent,
} from "@/lib/rules/replyIntent";

/**
 * §6.3, and T-19. The table below is the spec's, asserted directly — if a rule is ever
 * renumbered or an effect quietly changed, this is what notices.
 */

const REPLY = `Thanks for reaching out. We're actually in the middle of a SOC 2 audit
right now with another vendor, so please take us off your list.`;

describe("§6.3 · each intent maps to its rule", () => {
  const expected: Record<ReplyIntent, { rule: string; effect: string }> = {
    interested: { rule: "R-50", effect: "won" },
    not_now: { rule: "R-51", effect: "snooze" },
    wrong_person: { rule: "R-52", effect: "recontact" },
    not_interested: { rule: "R-53", effect: "suppress" },
    unsubscribe: { rule: "R-54", effect: "block" },
    unclear: { rule: "R-55", effect: "none" },
  };

  it("covers all six intents with no gaps", () => {
    expect(REPLY_INTENTS).toHaveLength(6);
    for (const intent of REPLY_INTENTS) {
      const a = actionFor(intent);
      expect(a.rule, intent).toBe(expected[intent].rule);
      expect(a.effect, intent).toBe(expected[intent].effect);
      expect(a.summary.length, intent).toBeGreaterThan(20);
    }
  });

  it("snoozes for 90 days and suppresses for 180", () => {
    expect(actionFor("not_now").days).toBe(SNOOZE_DAYS);
    expect(SNOOZE_DAYS).toBe(90);
    expect(actionFor("not_interested").days).toBe(SUPPRESS_DAYS);
    expect(SUPPRESS_DAYS).toBe(180);
  });

  it("a snooze is not a suppression — the company stays on the board", () => {
    const a = actionFor("not_now");
    expect(a.effect).toBe("snooze");
    expect(a.summary).toContain("not suppressed");
  });

  it("wrong_person re-contacts rather than suppressing the company", () => {
    const a = actionFor("wrong_person");
    expect(a.effect).toBe("recontact");
    expect(a.days).toBeNull();
    expect(a.summary).toContain("not suppressed");
  });

  it("only R-54 is permanent, and only R-54 demands a typed confirmation", () => {
    for (const intent of REPLY_INTENTS) {
      const a = actionFor(intent);
      expect(a.requiresTypedConfirmation, intent).toBe(intent === "unsubscribe");
    }
    const block = actionFor("unsubscribe");
    expect(block.confirmationPhrase).toBe(UNSUBSCRIBE_PHRASE);
    expect(block.summary).toContain("cannot be undone");
  });

  it("R-55 takes no automatic action", () => {
    const a = actionFor("unclear");
    expect(a.automatic).toBe(false);
    expect(a.effect).toBe("none");
    expect(a.summary).toContain("suggestion only");
  });
});

describe("§6.3 · the quote guard", () => {
  it("accepts a quote that is in the reply", () => {
    expect(quoteIsInReply("please take us off your list", REPLY)).toBe(true);
  });

  it("ignores the whitespace the paste introduced", () => {
    // The reply has a newline inside this phrase; the model will quote it as one line.
    expect(quoteIsInReply("SOC 2 audit right now with another vendor", REPLY)).toBe(true);
  });

  it("rejects a quote that is not there", () => {
    expect(quoteIsInReply("we would love a demo next week", REPLY)).toBe(false);
  });

  it("rejects an empty or missing quote", () => {
    expect(quoteIsInReply(null, REPLY)).toBe(false);
    expect(quoteIsInReply("   ", REPLY)).toBe(false);
  });
});

describe("§6.3 · an ungrounded reading cannot block a domain", () => {
  it("downgrades unsubscribe to unclear when the quote is invented", () => {
    const g = groundedIntent("unsubscribe", "remove me from all future emails", REPLY);
    expect(g.intent).toBe("unclear");
    expect(g.downgraded).toBe(true);
    expect(g.reason).toContain("does not appear in the reply");
    // And the downgraded action is therefore the one that does nothing.
    expect(actionFor(g.intent).effect).toBe("none");
    expect(actionFor(g.intent).requiresTypedConfirmation).toBe(false);
  });

  it("downgrades when no quote was given at all", () => {
    const g = groundedIntent("not_interested", null, REPLY);
    expect(g.intent).toBe("unclear");
    expect(g.reason).toContain("no quote");
  });

  it("keeps a grounded reading intact", () => {
    const g = groundedIntent("unsubscribe", "please take us off your list", REPLY);
    expect(g.intent).toBe("unsubscribe");
    expect(g.downgraded).toBe(false);
    expect(g.reason).toBeNull();
  });

  it("leaves unclear alone — there is nothing to downgrade it to", () => {
    const g = groundedIntent("unclear", null, REPLY);
    expect(g.intent).toBe("unclear");
    expect(g.downgraded).toBe(false);
  });
});

describe("§6.3 · confirmation and expiry", () => {
  const now = new Date("2026-11-13T00:00:00.000Z");

  it("computes the return date a snooze promises", () => {
    const d = expiryFor(actionFor("not_now"), now);
    expect(d?.toISOString().slice(0, 10)).toBe("2027-02-11");
  });

  it("gives a permanent block no expiry", () => {
    expect(expiryFor(actionFor("unsubscribe"), now)).toBeNull();
    expect(expiryFor(actionFor("interested"), now)).toBeNull();
  });

  it("refuses a wrong or missing typed confirmation for R-54", () => {
    const block = actionFor("unsubscribe");
    expect(confirmationAccepted(block, null)).toBe(false);
    expect(confirmationAccepted(block, "block permanently")).toBe(false);
    expect(confirmationAccepted(block, "yes")).toBe(false);
    expect(confirmationAccepted(block, `  ${UNSUBSCRIBE_PHRASE}  `)).toBe(true);
  });

  it("does not demand a confirmation from the rules that are reversible", () => {
    expect(confirmationAccepted(actionFor("not_now"), null)).toBe(true);
    expect(confirmationAccepted(actionFor("not_interested"), null)).toBe(true);
  });
});
