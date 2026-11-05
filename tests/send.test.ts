import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * T-13 — a body carrying a different recipient still sends to GMAIL_SEND_TO.
 *
 * The transports are mocked so this test never puts a message on the wire, and the assertion is
 * made on the address the transport was *handed*. That is the only place a hijacked recipient
 * could show up, so watching it is equivalent to watching the envelope.
 */

const LOCKED = "locked@example.com";
const HIJACK = "attacker@evil.example";

type Envelope = { to: string; subject: string; body: string };

const sendViaResend = vi.fn(async (_: Envelope) => ({ messageId: "mock-resend" }));
const sendViaGmail = vi.fn(async (_: Envelope) => ({ messageId: "mock-gmail" }));

vi.mock("@/lib/mail/resend", () => ({ sendViaResend: (e: Envelope) => sendViaResend(e) }));
vi.mock("@/lib/mail/gmail", () => ({ sendViaGmail: (e: Envelope) => sendViaGmail(e) }));

describe("T-13 · the recipient is locked in code", () => {
  beforeEach(() => {
    vi.resetModules();
    sendViaResend.mockClear();
    sendViaGmail.mockClear();
    process.env.GMAIL_SEND_TO = LOCKED;
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "signal@example.com";
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_REFRESH_TOKEN;
  });

  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
  });

  it("ignores a `to` smuggled into the payload and uses GMAIL_SEND_TO", async () => {
    const { sendEmail } = await import("@/lib/mail/send");

    // Exactly what a malicious or careless API body would look like once parsed. TypeScript
    // already rejects the extra key; the cast is what lets the test prove the runtime does too.
    const payload = {
      subject: "Hello",
      body: "Body",
      to: HIJACK,
      recipient: HIJACK,
      email: HIJACK,
    } as unknown as { subject: string; body: string };

    const outcome = await sendEmail(payload);

    expect(outcome.ok).toBe(true);
    expect(outcome.to).toBe(LOCKED);
    expect(sendViaResend).toHaveBeenCalledTimes(1);
    expect(sendViaResend.mock.calls[0][0]).toMatchObject({ to: LOCKED });
    expect(JSON.stringify(sendViaResend.mock.calls[0][0])).not.toContain(HIJACK);
  });

  it("fails loudly rather than silently when GMAIL_SEND_TO is absent (D-04)", async () => {
    delete process.env.GMAIL_SEND_TO;
    const { sendEmail } = await import("@/lib/mail/send");

    const outcome = await sendEmail({ subject: "Hello", body: "Body" });

    expect(outcome.ok).toBe(false);
    expect(outcome.to).toBeNull();
    expect(sendViaResend).not.toHaveBeenCalled();
    expect(sendViaGmail).not.toHaveBeenCalled();
  });

  it("records which transport sent, so a fallback is never read as the primary path", async () => {
    const { sendEmail } = await import("@/lib/mail/send");
    const outcome = await sendEmail({ subject: "Hello", body: "Body" });

    expect(outcome.ok && outcome.transport).toBe("resend");
    expect(outcome.attempts.map((a) => a.transport)).toEqual(["gmail", "resend"]);
    expect(outcome.attempts[0].ok).toBe(false);
  });
});
