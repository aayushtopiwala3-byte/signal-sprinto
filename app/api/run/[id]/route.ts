import { NextResponse } from "next/server";
import { compareForBoard } from "@/lib/rules/verdict";
import * as q from "@/lib/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Everything the board needs for one run, in the order the board renders it (§5.5). */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const run = await q.getRun(id);
  if (!run) return NextResponse.json({ error: `Run ${id} not found.` }, { status: 404 });

  const [companies, signals, quarantine, cost, pending] = await Promise.all([
    q.listCompanies(id),
    q.signalsForRun(id),
    q.listQuarantine(id),
    q.costSummary(id),
    q.countPending(id),
  ]);

  const byCompany = new Map<string, q.SignalRow[]>();
  for (const s of signals) {
    const list = byCompany.get(s.company_id) ?? [];
    list.push(s);
    byCompany.set(s.company_id, list);
  }

  const rows = companies
    .map((c) => ({
      ...c,
      signals: byCompany.get(c.id) ?? [],
      missing_fields: JSON.parse(c.missing_fields_json ?? "[]") as string[],
    }))
    .sort((a, b) =>
      compareForBoard(
        {
          timing_score: a.timing_score ?? 0,
          independent_signals: a.independent_signals ?? 0,
          play: a.play,
          domain: a.normalized_domain,
        },
        {
          timing_score: b.timing_score ?? 0,
          independent_signals: b.independent_signals ?? 0,
          play: b.play,
          domain: b.normalized_domain,
        },
      ),
    );

  return NextResponse.json({
    run,
    weights: q.runWeights(run),
    switches: q.runSwitches(run),
    companies: rows,
    quarantine,
    cost,
    pending,
    done: pending === 0,
  });
}
