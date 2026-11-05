import { requireSendTo, capability } from "@/lib/env";
import { sendViaGmail } from "@/lib/mail/gmail";
import { sendViaResend } from "@/lib/mail/resend";

/**
 * Gmail → Resend → fail loudly (§7.4). The transport that actually sent is recorded and
 * displayed, so a fallback is never mistaken for the primary path.
 *
 * The recipient is NOT a parameter. It is read from GMAIL_SEND_TO inside this function, which
 * is what makes the §2.2 lock structural rather than a convention a future caller could
 * forget (T-13).
 */

export type Transport = "gmail" | "resend";

export type SendOutcome =
  | { ok: true; transport: Transport; to: string; messageId: string; attempts: AttemptLog[] }
  | { ok: false; to: string | null; error: string; attempts: AttemptLog[] };

export type AttemptLog = { transport: Transport; ok: boolean; error: string | null };

export async function sendEmail(input: {
  subject: string;
  body: string;
}): Promise<SendOutcome> {
  let to: string;
  try {
    to = requireSendTo();
  } catch (err) {
    return {
      ok: false,
      to: null,
      error: err instanceof Error ? err.message : String(err),
      attempts: [],
    };
  }

  const attempts: AttemptLog[] = [];

  if (capability.gmail()) {
    try {
      const result = await sendViaGmail({ to, subject: input.subject, body: input.body });
      attempts.push({ transport: "gmail", ok: true, error: null });
      return { ok: true, transport: "gmail", to, messageId: result.messageId, attempts };
    } catch (err) {
      attempts.push({
        transport: "gmail",
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  } else {
    attempts.push({
      transport: "gmail",
      ok: false,
      error: "not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN)",
    });
  }

  if (capability.resend()) {
    try {
      const result = await sendViaResend({ to, subject: input.subject, body: input.body });
      attempts.push({ transport: "resend", ok: true, error: null });
      return { ok: true, transport: "resend", to, messageId: result.messageId, attempts };
    } catch (err) {
      attempts.push({
        transport: "resend",
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  } else {
    attempts.push({
      transport: "resend",
      ok: false,
      error: "not configured (RESEND_API_KEY / EMAIL_FROM)",
    });
  }

  // Fail loudly. Never report success for an email that did not leave the building.
  return {
    ok: false,
    to,
    error: `Every transport failed. ${attempts
      .map((a) => `${a.transport}: ${a.error}`)
      .join(" | ")}`,
    attempts,
  };
}
