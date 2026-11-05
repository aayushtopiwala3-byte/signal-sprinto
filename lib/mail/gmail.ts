import { env } from "@/lib/env";

/**
 * §2.3 — send via the Gmail API (`users.messages.send`), OAuth2 refresh token,
 * scope `https://www.googleapis.com/auth/gmail.send`.
 */

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.send";

/** RFC-822 headers must not carry raw newlines, or a subject could inject one. */
function headerSafe(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/** RFC 2047 encoding, so non-ASCII subjects survive intact. */
function encodeHeaderValue(value: string): string {
  const safe = headerSafe(value);
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(safe)) return safe;
  return `=?UTF-8?B?${Buffer.from(safe, "utf8").toString("base64")}?=`;
}

export function buildRfc822(input: {
  to: string;
  from: string;
  subject: string;
  body: string;
}): string {
  const lines = [
    `To: ${headerSafe(input.to)}`,
    `From: ${headerSafe(input.from)}`,
    `Subject: ${encodeHeaderValue(input.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    input.body.replace(/\r?\n/g, "\r\n"),
  ];
  return lines.join("\r\n");
}

export function base64url(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function accessToken(): Promise<string> {
  const clientId = env.googleClientId();
  const clientSecret = env.googleClientSecret();
  const refreshToken = env.googleRefreshToken();

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Gmail is not configured: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REFRESH_TOKEN must all be set.",
    );
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    signal: AbortSignal.timeout(15_000),
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const json = (await response.json()) as { access_token?: string; error_description?: string; error?: string };
  if (!response.ok || !json.access_token) {
    throw new Error(
      `Gmail token refresh failed (HTTP ${response.status}): ${json.error_description ?? json.error ?? "no access_token returned"}`,
    );
  }
  return json.access_token;
}

export type GmailSendResult = { messageId: string; threadId: string | null };

/**
 * `to` is supplied by the caller, which reads it from GMAIL_SEND_TO. No parameter anywhere in
 * this module's call chain is reachable from an HTTP request body (§2.2).
 */
export async function sendViaGmail(input: {
  to: string;
  subject: string;
  body: string;
}): Promise<GmailSendResult> {
  const token = await accessToken();

  // `me` resolves to the authenticated mailbox, so the From address cannot drift from the
  // account that owns the refresh token.
  const raw = base64url(
    buildRfc822({ to: input.to, from: "me", subject: input.subject, body: input.body }),
  );

  const response = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({ raw }),
    },
  );

  const json = (await response.json()) as {
    id?: string;
    threadId?: string;
    error?: { message?: string };
  };

  if (!response.ok || !json.id) {
    throw new Error(
      `Gmail send failed (HTTP ${response.status}): ${json.error?.message ?? "no message id returned"}`,
    );
  }

  return { messageId: json.id, threadId: json.threadId ?? null };
}
