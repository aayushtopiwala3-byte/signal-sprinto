import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/mail/send";
import * as q from "@/lib/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * §2.2 — the recipient is not an input to this route.
 *
 * The body is read for exactly one field, `draftId`. `sendEmail` reads GMAIL_SEND_TO itself and
 * takes no `to` parameter, so a body carrying `to`, `recipient` or `email` cannot reach the
 * transport even by accident: there is no code path that would carry it there (T-13).
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const draftId = typeof body.draftId === "string" ? body.draftId : null;
  if (!draftId) return NextResponse.json({ error: "draftId is required." }, { status: 400 });

  const draft = await q.getDraftById(draftId);
  if (!draft) return NextResponse.json({ error: `Draft ${draftId} not found.` }, { status: 404 });

  // T-10 — a draft whose hook quote failed validation is never sent, whatever the UI asks for.
  if (!draft.validated) {
    return NextResponse.json(
      {
        error: "This draft is blocked and cannot be sent.",
        blocked_reason: draft.blocked_reason,
      },
      { status: 409 },
    );
  }

  const outcome = await sendEmail({ subject: draft.subject, body: draft.body });

  await q.insertSend({
    draftId,
    toAddress: outcome.to ?? "unknown",
    transport: outcome.ok ? outcome.transport : "none",
    status: outcome.ok ? "sent" : "failed",
    error: outcome.ok ? null : outcome.error,
  });

  if (!outcome.ok) {
    return NextResponse.json(
      { ok: false, error: outcome.error, attempts: outcome.attempts, to: outcome.to },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    to: outcome.to,
    transport: outcome.transport,
    messageId: outcome.messageId,
    attempts: outcome.attempts,
    // Echoed so the UI can state the lock plainly next to the confirmation.
    ignored_body_fields: Object.keys(body).filter((k) => k !== "draftId"),
  });
}
