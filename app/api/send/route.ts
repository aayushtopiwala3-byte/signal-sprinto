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

  // §4.2 — one row per transport attempted, not one row per send.
  //
  // `sendEmail` already walks Gmail then Resend and returns the whole chain. Recording only the
  // winner would put "sent via: resend" on the card with no way to say why the primary path was
  // not used, and a disclosed fallback that cannot explain itself is not disclosed. Failures are
  // written first so the successful row is the newest, which is the order `sendsFor` returns.
  for (const attempt of outcome.attempts) {
    if (attempt.ok) continue;
    await q.insertSend({
      draftId,
      toAddress: outcome.to ?? "unknown",
      transport: attempt.transport,
      status: "failed",
      error: attempt.error,
    });
  }

  if (outcome.ok) {
    await q.insertSend({
      draftId,
      toAddress: outcome.to,
      transport: outcome.transport,
      status: "sent",
      error: null,
    });
  } else if (outcome.attempts.length === 0) {
    // No transport was even attempted — the recipient lock itself refused. That is still a
    // failed send and still belongs on the card.
    await q.insertSend({
      draftId,
      toAddress: outcome.to ?? "unknown",
      transport: "none",
      status: "failed",
      error: outcome.error,
    });
  }

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
