import { NextResponse } from "next/server";
import { runGoldenSet } from "@/lib/seed/goldenSet";
import { resolveModelId } from "@/lib/ai/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Runs §12's structural assertions against the deployed code, on demand (§9). */
export async function GET() {
  const results = await runGoldenSet();
  return NextResponse.json({
    model: resolveModelId(),
    passed: results.filter((r) => r.status === "pass").length,
    failed: results.filter((r) => r.status === "fail").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    results,
  });
}
