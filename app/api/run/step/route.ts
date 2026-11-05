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
    // Nothing claimable is not the same as nothing left: a company claimed by an invocation
    // that is still within its 60s budget is unavailable but unfinished. Reporting `done` here
    // would strand it on the board forever, which is exactly what a killed handler once did.
    const remaining = await q.countPending(runId);
    if (remaining === 0) await q.finishRun(runId);
    return NextResponse.json({ done: remaining === 0, remaining, result: null });
  }

  if (claimed.attempts > q.MAX_CLAIM_ATTEMPTS) {
    // The domain has now outlasted the handler's budget three times. Reclaiming it a fourth time
    // would trade a stuck row for an endless one; quarantine records the refusal where §12's page
    // can show it, with the count, rather than leaving a judge to infer it from a spinning board.
    const text = `gave up after ${q.MAX_CLAIM_ATTEMPTS} attempts — each one exceeded the ${60}s a single request is allowed to run, so this domain is too slow to read within one invocation`;
    await q.insertQuarantine({
      runId,
      domain: claimed.domain,
      reasonCode: "handler_timeout",
      reasonText: text,
    });
    await q.quarantineCompany(claimed.id);
    const left = await q.countPending(runId);
    if (left === 0) await q.finishRun(runId);
    return NextResponse.json({
      done: left === 0,
      remaining: left,
      result: {
        companyId: claimed.id,
        domain: claimed.domain,
        status: "quarantined",
        verdict: null,
        fetchesUsed: 0,
        note: text,
      },
    });
  }

  // runCompany catches its own failures and marks the company, so one dead domain cannot
  // stop the other eleven (T-09).
  const result = await runCompany(claimed.id);
  const remaining = await q.countPending(runId);
  if (remaining === 0) await q.finishRun(runId);

  return NextResponse.json({ done: remaining === 0, remaining, result });
}
