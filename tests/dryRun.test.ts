import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildDryRun, dryRunAvailable } from "@/lib/mail/dryRun";
import { capability } from "@/lib/env";

/**
 * §3 (G6). The dry run exists to close an unproven step honestly, which makes two properties
 * load-bearing: it must be unreachable once credentials exist, and it must never describe
 * itself as a send.
 */

const SAVED = { ...process.env };

beforeEach(() => {
  process.env.GMAIL_SEND_TO = "demo@example.com";
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.GOOGLE_REFRESH_TOKEN;
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  delete process.env.SENDER_NAME;
});

afterEach(() => {
  process.env = { ...SAVED };
});

describe("§3 · a dry run cannot shadow a real send", () => {
  it("is available only when no transport is configured", () => {
    expect(dryRunAvailable()).toBe(true);
  });

  it("becomes unreachable the moment Gmail credentials are present", () => {
    process.env.GOOGLE_CLIENT_ID = "id";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    process.env.GOOGLE_REFRESH_TOKEN = "token";
    expect(capability.gmail()).toBe(true);
    expect(dryRunAvailable()).toBe(false);
  });

  it("becomes unreachable when only Resend is present", () => {
    process.env.RESEND_API_KEY = "re_key";
    process.env.EMAIL_FROM = "outbound@example.com";
    expect(capability.resend()).toBe(true);
    expect(dryRunAvailable()).toBe(false);
  });

  it("a partial Gmail config does not count as configured", () => {
    // Two of three. The guard must not open a door on an incomplete credential set.
    process.env.GOOGLE_CLIENT_ID = "id";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    expect(capability.gmail()).toBe(false);
    expect(dryRunAvailable()).toBe(true);
  });

  /**
   * The one-line check G6 §3 asks for: when the four values land, the selector picks Gmail with
   * no code change. If this ever fails, adding credentials would silently keep dry-running.
   */
  it("the first real send needs no code change — credentials alone flip the selector", () => {
    expect(dryRunAvailable()).toBe(true);
    process.env.GOOGLE_CLIENT_ID = "id";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    process.env.GOOGLE_REFRESH_TOKEN = "token";
    expect(dryRunAvailable()).toBe(false);
    expect(capability.gmail()).toBe(true);
  });
});

describe("§3 · the dry run shows the real bytes and calls itself nothing else", () => {
  const draft = {
    subject: "Maintaining Zipy's SOC 2 evidence without the spreadsheet",
    body: "Hi Vishalini,\n\nYour trust centre says the audit is in progress.\n\n— Growth",
  };

  it("builds RFC-822 with the locked recipient, not a supplied one", () => {
    const dry = buildDryRun(draft);
    expect(dry.to).toBe("demo@example.com");
    expect(dry.rfc822).toContain("To: demo@example.com");
    expect(dry.rfc822).toContain(`Subject: ${draft.subject}`);
    expect(dry.rfc822).toContain("MIME-Version: 1.0");
    // The body is present verbatim, CRLF-normalised as the wire format requires.
    expect(dry.rfc822).toContain("Your trust centre says the audit is in progress.");
    expect(dry.rfc822.split("\r\n").length).toBeGreaterThan(5);
  });

  it("uses SENDER_NAME in From once it is set", () => {
    process.env.SENDER_NAME = "Aayush Topiwala";
    process.env.EMAIL_FROM = "outbound@example.com";
    // EMAIL_FROM alone does not configure Resend (that needs the key too), so the dry run is
    // still reachable — and it should now show the real From rather than the placeholder.
    expect(dryRunAvailable()).toBe(true);
    const dry = buildDryRun(draft);
    expect(dry.from).toBe("Aayush Topiwala <outbound@example.com>");
    expect(dry.rfc822).toContain("From: Aayush Topiwala <outbound@example.com>");
  });

  it("does not invent a From address it does not have", () => {
    const dry = buildDryRun(draft);
    expect(dry.from).toContain("the authorised Gmail mailbox");
    // No fabricated address.
    expect(dry.from).not.toMatch(/<[^@>]+@[^>]+\.[a-z]+>/i);
  });

  it("never describes itself as a send, in any tense", () => {
    const dry = buildDryRun(draft);
    // The outcome object carries headers and addresses only — no status word that could be
    // rendered as a claim. The card's copy is asserted separately in the verification log.
    const words = JSON.stringify({ to: dry.to, from: dry.from });
    expect(words.toLowerCase()).not.toMatch(/\bsent\b|\bsending\b|\bsends\b/);
  });

  it("throws rather than guessing when the locked recipient is missing", () => {
    delete process.env.GMAIL_SEND_TO;
    expect(() => buildDryRun(draft)).toThrow();
  });
});
