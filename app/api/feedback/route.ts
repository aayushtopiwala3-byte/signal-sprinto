import { NextResponse } from "next/server";
import * as q from "@/lib/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * T-24 — feedback with a consequence. `reject` suppresses the domain on the next run, and the
 * "what changed because of your feedback" panel reads back from this table, so the loop is
 * visible rather than claimed.
 */

const ACTIONS = new Set(["accept", "reject"]);

export async function POST(request: Request) {
  let body: { companyId?: string; action?: string; reason?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const { companyId, action } = body;
  if (!companyId) return NextResponse.json({ error: "companyId is required." }, { status: 400 });
  if (!action || !ACTIONS.has(action)) {
    return NextResponse.json({ error: "action must be 'accept' or 'reject'." }, { status: 400 });
  }

  const company = await q.getCompany(companyId);
  if (!company) {
    return NextResponse.json({ error: `Company ${companyId} not found.` }, { status: 404 });
  }

  const reason = body.reason?.trim();
  if (action === "reject" && !reason) {
    return NextResponse.json(
      { error: "A rejection needs a reason — it is what the next run suppresses on." },
      { status: 400 },
    );
  }

  await q.insertFeedback({
    companyId,
    domain: company.normalized_domain,
    action,
    reason: reason ?? null,
  });

  return NextResponse.json({
    ok: true,
    domain: company.normalized_domain,
    action,
    effect:
      action === "reject"
        ? `${company.normalized_domain} will be quarantined on the next run, with your reason attached.`
        : `${company.normalized_domain} stays in the pool. Accepts are recorded but never suppress.`,
  });
}
