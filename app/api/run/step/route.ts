import { NextResponse } from "next/server";
import { runCompany } from "@/lib/pipeline/runCompany";
import * as q from "@/lib/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * One domain per request (§7.2). The client calls this in a loop until `done` is true, which is
 * what keeps every individual handler clear of Vercel's Hobby timeout and lets the board fill in
 * row by row instead of appearing all at once at the end.
 */
export async function POST(request: Request) {
  let runId: string | undefined;
  try {
    ({ runId } = (await request.json()) as { runId?: string });
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  if (!runId) return NextResponse.json({ error: "runId is required." }, { status: 400 });

  const run = await q.getRun(runId);
  if (!run) return NextResponse.json({ error: `Run ${runId} not found.` }, { status: 404 });

  const claimed = await q.claimNextPending(runId);
  if (!claimed) {
    await q.finishRun(runId);
    return NextResponse.json({ done: true, remaining: 0, result: null });
  }

  // runCompany catches its own failures and marks the company, so one dead domain cannot
  // stop the other eleven (T-09).
  const result = await runCompany(claimed.id);
  const remaining = await q.countPending(runId);
  if (remaining === 0) await q.finishRun(runId);

  return NextResponse.json({ done: remaining === 0, remaining, result });
}
