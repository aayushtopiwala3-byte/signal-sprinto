import { NextResponse } from "next/server";
import { normalizeBatch, splitDomainInput } from "@/lib/fetch/normalizeDomain";
import { DEFAULT_WEIGHTS, DEFAULT_SWITCHES, type Weights, type Switches } from "@/lib/types";
import * as q from "@/lib/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Creates a run and queues one company per unique domain. Nothing is fetched here — the work
 * happens one domain at a time in `/api/run/step`, so this handler returns in milliseconds
 * however long the input list is (§7.2).
 */

type Body = {
  domains?: string;
  weights?: Partial<Weights>;
  switches?: Partial<Switches>;
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const batch = normalizeBatch(splitDomainInput(body.domains ?? ""));
  if (batch.domains.length === 0 && batch.invalid.length === 0) {
    return NextResponse.json({ error: "No domains supplied." }, { status: 400 });
  }

  const weights: Weights = { ...DEFAULT_WEIGHTS, ...(body.weights ?? {}) };
  const switches: Switches = { ...DEFAULT_SWITCHES, ...(body.switches ?? {}) };

  const runId = await q.createRun({
    weights,
    switches,
    domainsSubmitted: batch.submitted,
    duplicatesRemoved: batch.duplicates_removed,
  });

  for (const entry of batch.invalid) {
    await q.insertQuarantine({
      runId,
      domain: entry.raw,
      reasonCode: entry.reason_code,
      reasonText: entry.reason_text,
    });
  }

  // T-24 — a company you rejected with a reason does not come back. It is quarantined with
  // your own words attached, rather than silently dropped from the list.
  const suppressed = await q.suppressedDomains();
  const queued: string[] = [];
  const skipped: { domain: string; reason: string }[] = [];

  for (const { domain, raw } of batch.domains) {
    const reason = suppressed.get(domain);
    if (reason) {
      const text = `Suppressed by your feedback: ${reason}`;
      await q.insertQuarantine({ runId, domain, reasonCode: "suppressed", reasonText: text });
      skipped.push({ domain, reason: text });
      continue;
    }
    await q.insertCompany({ runId, domain: raw, normalizedDomain: domain });
    queued.push(domain);
  }

  return NextResponse.json({
    runId,
    submitted: batch.submitted,
    duplicates_removed: batch.duplicates_removed,
    invalid: batch.invalid,
    suppressed: skipped,
    queued: queued.length,
    weights,
    switches,
  });
}
