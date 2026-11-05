import { NextResponse } from "next/server";
import * as q from "@/lib/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * §9 — swapping the point of contact. The ladder (R-30) picks the default, but a Growth Lead
 * who knows the account can override it. Generic mailboxes stay unselectable: R-30 refuses them
 * at the ladder, so letting the UI promote one would put the rule back in the operator's hands.
 */
export async function POST(request: Request) {
  let body: { companyId?: string; contactId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const { companyId, contactId } = body;
  if (!companyId || !contactId) {
    return NextResponse.json({ error: "companyId and contactId are required." }, { status: 400 });
  }

  const contacts = await q.listContacts(companyId);
  const target = contacts.find((c) => c.id === contactId);
  if (!target) {
    return NextResponse.json(
      { error: `Contact ${contactId} is not on company ${companyId}.` },
      { status: 404 },
    );
  }

  if (target.ladder_rank === 99) {
    return NextResponse.json(
      {
        error:
          "R-30 never selects a generic mailbox. Pick a named person, or leave this company as a handoff.",
      },
      { status: 409 },
    );
  }

  await q.swapSelectedContact(companyId, contactId);
  return NextResponse.json({ ok: true, selected: contactId });
}
