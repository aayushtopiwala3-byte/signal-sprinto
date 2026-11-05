import { Board } from "@/components/Board";
import { capability } from "@/lib/env";
import { compareForBoard } from "@/lib/rules/verdict";
import * as q from "@/lib/db/queries";

export const dynamic = "force-dynamic";

/**
 * The decision board (§3.1). Server-rendered with the latest run already in place, so a reload
 * never shows an empty page where work exists — and T-26's actionable empty state when it does
 * not.
 */
export default async function BoardPage() {
  const run = await q.latestRun();

  let initial = null;
  if (run) {
    const [companies, signals, quarantine, cost, pending] = await Promise.all([
      q.listCompanies(run.id),
      q.signalsForRun(run.id),
      q.listQuarantine(run.id),
      q.costSummary(run.id),
      q.countPending(run.id),
    ]);

    const byCompany = new Map<string, typeof signals>();
    for (const s of signals) {
      const list = byCompany.get(s.company_id) ?? [];
      list.push(s);
      byCompany.set(s.company_id, list);
    }

    initial = {
      run: {
        id: run.id,
        status: run.status,
        domains_submitted: run.domains_submitted,
        duplicates_removed: run.duplicates_removed,
      },
      weights: q.runWeights(run),
      switches: q.runSwitches(run),
      companies: companies
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
        ),
      quarantine,
      cost,
      pending,
      done: pending === 0,
    };
  }

  return <Board initial={initial} aiAvailable={capability.ai()} />;
}
