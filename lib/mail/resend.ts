import { env } from "@/lib/env";

/** The disclosed fallback transport (§7.4). The UI always names which transport actually sent. */
export async function sendViaResend(input: {
  to: string;
  subject: string;
  body: string;
}): Promise<{ messageId: string }> {
  const apiKey = env.resendApiKey();
  const from = env.emailFrom();

  if (!apiKey || !from) {
    throw new Error("Resend is not configured: RESEND_API_KEY and EMAIL_FROM must both be set.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      text: input.body,
    }),
  });

  const json = (await response.json()) as { id?: string; message?: string; name?: string };

  if (!response.ok || !json.id) {
    throw new Error(
      `Resend send failed (HTTP ${response.status}): ${json.message ?? json.name ?? "no id returned"}`,
    );
  }

  return { messageId: json.id };
}
