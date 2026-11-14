import { NextResponse } from "next/server";
import { aiCall } from "@/lib/ai/call";
import { ReplyIntentSchema, buildReplyIntentPrompt } from "@/lib/ai/prompts/replyIntent";
import {
  actionFor,
  confirmationAccepted,
  expiryFor,
  groundedIntent,
  type ReplyIntent,
} from "@/lib/rules/replyIntent";
import { selectContact } from "@/lib/rules/poc";
import * as q from "@/lib/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * §6.3 — two endpoints in one, and the split is deliberate.
 *
 * `classify` reads the reply and returns what *would* happen. It changes nothing. `apply` takes
 * an intent the human has seen and confirms it. Nothing in between is implicit: there is no code
 * path where classifying a reply also acts on it, which is what makes the checkpoint real rather
 * than a dialog that always gets clicked through.
 *
 * `apply` re-derives the action from the intent rather than trusting a client-supplied action,
 * and re-checks the typed confirmation server-side. A confirmation enforced only in the browser
 * is not enforced.
 */

type Body = {
  mode?: "classify" | "apply";
  companyId?: string;
  reply?: string;
  /** apply only — the intent the human confirmed, which may differ from the model's. */
  intent?: ReplyIntent;
  /** apply only — R-54's typed phrase. */
  confirmation?: string | null;
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const { companyId, reply } = body;
  if (!companyId) return NextResponse.json({ error: "companyId is required." }, { status: 400 });
  if (typeof reply !== "string" || reply.trim().length === 0) {
    return NextResponse.json({ error: "reply text is required." }, { status: 400 });
  }

  const company = await q.getCompany(companyId);
  if (!company) {
    return NextResponse.json({ error: `Company ${companyId} not found.` }, { status: 404 });
  }
  const domain = company.normalized_domain;

  /* ------------------------------------------------------------------ classify */

  if ((body.mode ?? "classify") === "classify") {
    const run = await q.getRun(company.run_id);
    const switches = run ? q.runSwitches(run) : null;

    const result = await aiCall({
      callName: "AI-5 reply intent",
      prompt: buildReplyIntentPrompt({ domain, reply }),
      schema: ReplyIntentSchema,
      runId: company.run_id,
      companyId,
      aiEnabled: switches?.ai_enabled ?? true,
      budgetExhausted: false,
    });

    // With no model available the reply is not guessed at — it is handed to the human as
    // `unclear`, which is exactly what R-55 is for.
    if (!result.ok) {
      const action = actionFor("unclear");
      return NextResponse.json({
        ok: true,
        domain,
        model: { intent: null, confidence: 0, quote: null, unavailable: result.reason },
        intent: "unclear",
        downgraded: false,
        downgrade_reason: null,
        action,
      });
    }

    const grounded = groundedIntent(result.data.intent, result.data.quote, reply);
    const action = actionFor(grounded.intent);

    return NextResponse.json({
      ok: true,
      domain,
      // The model's own reading is returned even when it was overridden, so the human can see
      // what it thought and why that was not enough.
      model: {
        intent: result.data.intent,
        confidence: result.data.confidence,
        quote: result.data.quote,
      },
      intent: grounded.intent,
      downgraded: grounded.downgraded,
      downgrade_reason: grounded.reason,
      action,
    });
  }

  /* --------------------------------------------------------------------- apply */

  const intent = body.intent;
  if (!intent) return NextResponse.json({ error: "intent is required to apply." }, { status: 400 });

  const action = actionFor(intent);

  if (!confirmationAccepted(action, body.confirmation ?? null)) {
    return NextResponse.json(
      {
        error: `${action.rule} is permanent and requires the exact phrase "${action.confirmationPhrase}" to be typed.`,
      },
      { status: 400 },
    );
  }

  let note: string | null = null;
  let applied = false;

  if (action.effect === "recontact") {
    // R-52 — the company was right and the person was not, so the ladder re-runs with that
    // person excluded rather than the domain being suppressed.
    const lookup = await q.listContacts(companyId);
    const current = lookup.find((c) => c.selected);
    const pool = lookup
      .filter((c) => c.id !== current?.id)
      .map((c) => ({
        first_name: c.first_name,
        last_name: c.last_name,
        position: c.position,
        seniority: c.seniority,
        department: c.department,
        email: c.email,
        confidence: c.confidence,
        type: c.hunter_type,
      }));
    const next = selectContact(pool, company.size_band as never);
    if (next.ok) {
      const promoted = lookup.find((c) => c.email === next.selected.email);
      if (promoted && current) {
        // R-52 records *why* the contact changed, not just that it did. "ladder rank 99 vs 2"
        // is the ladder's reason; it is not the reason a human gave.
        await q.supersedeContact({
          companyId,
          supersededId: current.id,
          promotedId: promoted.id,
          reason: `R-52: they replied that they are not the right person — superseded on ${new Date().toISOString().slice(0, 10)}`,
        });
      } else if (promoted) {
        await q.swapSelectedContact(companyId, promoted.id);
      }
      note = `Promoted ${next.selected.first_name ?? ""} ${next.selected.last_name ?? ""}`.trim();
      applied = true;
    } else {
      note =
        "No runner-up was available — every other contact Hunter returned is a generic mailbox, so there is nobody to promote.";
    }
  } else if (action.effect !== "none") {
    const res = await q.setOutreachState({
      domain,
      kind: action.effect,
      rule: action.rule,
      reason: action.summary,
      until: expiryFor(action, new Date()),
    });
    applied = res.applied;
    if (res.blockedAlready) {
      note =
        "This domain is already permanently blocked under R-54. That state cannot be changed from here.";
    }
  }

  await q.insertReply({
    companyId,
    domain,
    rawText: reply,
    intent,
    confidence: 0,
    quote: null,
    downgraded: false,
    downgradeReason: null,
    ruleFired: action.rule,
    effect: action.effect,
    applied,
  });

  // The existing "what changed because of your feedback" panel reads the feedback table, so an
  // applied reply writes there too rather than being a second, parallel history nobody reads.
  if (applied && action.effect !== "recontact") {
    await q.insertFeedback({
      companyId,
      domain,
      action: `reply:${action.effect}`,
      reason: `${action.rule} — ${action.summary}`,
    });
  }

  return NextResponse.json({ ok: true, applied, rule: action.rule, effect: action.effect, note });
}
