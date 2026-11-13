import { NextResponse } from "next/server";
import { GOLDEN_SET, runGoldenSet } from "@/lib/seed/goldenSet";
import { BEHAVIOURAL_SET } from "@/lib/seed/behavioural";
import { resolveModelId } from "@/lib/ai/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * §7 — the structural assertions plus the behavioural ones, run against the deployed code and
 * the live database.
 *
 * F-11 was that this endpoint reported ALL GREEN, 14 passed while the live run produced eight
 * Holds and nothing else. It could, because every assertion ran on frozen fixtures: the rules
 * engine was fine and the layer feeding it was not. The behavioural half exists so that a suite
 * which cannot see that failure cannot report success either.
 *
 * Skipped is a real outcome here and is counted separately from passed. A case that needs a run
 * and has none says so; it never borrows a pass it did not earn.
 */
export async function GET() {
  const results = await runGoldenSet([...GOLDEN_SET, ...BEHAVIOURAL_SET]);

  const structural = results.filter((r) => r.kind === "structural");
  const behavioural = results.filter((r) => r.kind === "behavioural");
  const count = (rows: typeof results, status: string) =>
    rows.filter((r) => r.status === status).length;

  return NextResponse.json({
    model: resolveModelId(),
    passed: count(results, "pass"),
    failed: count(results, "fail"),
    skipped: count(results, "skipped"),
    structural: {
      passed: count(structural, "pass"),
      failed: count(structural, "fail"),
      skipped: count(structural, "skipped"),
    },
    behavioural: {
      passed: count(behavioural, "pass"),
      failed: count(behavioural, "fail"),
      skipped: count(behavioural, "skipped"),
    },
    results,
  });
}
