import { NextResponse } from "next/server";
import { computeVerdict } from "@/lib/rules/verdict";
import { evaluateFit } from "@/lib/rules/fit";
import { applyHandoffRules } from "@/lib/pipeline/runCompany";
import { DEFAULT_WEIGHTS, DEFAULT_SWITCHES, type Weights, type Switches } from "@/lib/types";
import * as q from "@/lib/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * T-22 — move a weight, re-rank the board, touch the network zero times.
 *
 * Everything this needs is already in Postgres: the Evidence Map on `companies` and every
 * signal that fired on `signals`. It re-prices and re-runs the same deterministic verdict
 * function. There is no fetch and no AI call anywhere in this file, which is the property
 * being asserted — and it is only possible because scoring was kept out of the model.
 */
export async function POST(request: Request) {
  let body: { runId?: string; weights?: Partial<Weights>; switches?: Partial<Switches> };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const { runId } = body;
  if (!runId) return NextResponse.json({ error: "runId is required." }, { status: 400 });

  const run = await q.getRun(runId);
  if (!run) return NextResponse.json({ error: `Run ${runId} not found.` }, { status: 404 });

  const weights: Weights = { ...DEFAULT_WEIGHTS, ...q.runWeights(run), ...(body.weights ?? {}) };
  const switches: Switches = {
    ...DEFAULT_SWITCHES,
    ...q.runSwitches(run),
    ...(body.switches ?? {}),
  };

  const companies = await q.listCompanies(runId);
  const changes: {
    domain: string;
    from: string | null;
    to: string;
    score_from: number | null;
    score_to: number;
  }[] = [];

  for (const company of companies) {
    if (company.status !== "done") continue;

    const evidence = q.evidenceFromRow(company);
    const fired = q.toFiredSignals(await q.listSignals(company.id));
    const contacts = await q.listContacts(company.id);
    const fit = evaluateFit(evidence, switches);
    const missing = JSON.parse(company.missing_fields_json ?? "[]") as string[];

    const result = applyHandoffRules(computeVerdict(evidence, fired, weights, switches), {
      fitPass: fit.pass,
      missing,
      fetchesUsed: company.fetches_used,
      hasNamedContact: contacts.some((c) => c.selected),
    });

    if (
      result.verdict !== company.verdict ||
      result.timing_score !== company.timing_score ||
      result.rule_fired !== company.rule_fired
    ) {
      changes.push({
        domain: company.normalized_domain,
        from: company.verdict,
        to: result.verdict,
        score_from: company.timing_score,
        score_to: result.timing_score,
      });
    }

    await q.replaceSignals(company.id, fired);
    await q.saveVerdict(company.id, {
      verdict: result.verdict,
      timing_score: result.timing_score,
      independent_signals: result.independent_signals,
      play: result.play,
      verdict_reason: result.verdict_reason,
      rule_fired: result.rule_fired,
      fetches_used: company.fetches_used,
      missing_fields: missing,
    });
  }

  await q.updateRunTuning(runId, weights, switches);

  return NextResponse.json({
    ok: true,
    weights,
    switches,
    rescored: companies.filter((c) => c.status === "done").length,
    changes,
    fetches: 0,
    ai_calls: 0,
  });
}
