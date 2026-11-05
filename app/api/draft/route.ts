import { NextResponse } from "next/server";
import { validateDraft } from "@/lib/rules/evidenceValidator";
import * as q from "@/lib/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * §9 — the draft is editable, and editing re-runs the evidence check.
 *
 * An edit that deletes the hook quote from the body un-grounds the email, so the draft is
 * re-validated against the same fetched pages the model saw. Editing can therefore block a draft
 * that was sendable, which is the point: the lock is on the evidence, not on the author.
 */
export async function POST(request: Request) {
  let body: { draftId?: string; subject?: string; body?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const { draftId } = body;
  if (!draftId) return NextResponse.json({ error: "draftId is required." }, { status: 400 });
  if (typeof body.subject !== "string" || typeof body.body !== "string") {
    return NextResponse.json({ error: "subject and body are required." }, { status: 400 });
  }

  const draft = await q.getDraftById(draftId);
  if (!draft) return NextResponse.json({ error: `Draft ${draftId} not found.` }, { status: 404 });

  const sources = await q.sourcesFor(draft.company_id);
  const check = validateDraft(
    { hook_quote: draft.hook_quote, hook_url: draft.hook_url, body: body.body },
    sources,
  );

  await q.updateDraftText(draftId, body.subject, body.body);
  await q.setDraftValidation(draftId, check.validated, check.blocked_reason);

  return NextResponse.json({
    ok: true,
    validated: check.validated,
    blocked_reason: check.blocked_reason,
  });
}
