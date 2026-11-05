import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "@/lib/db/client";
import { DEFAULT_SWITCHES, DEFAULT_WEIGHTS } from "@/lib/types";
import * as q from "@/lib/db/queries";

/**
 * Claiming a company has to survive its own handler being killed.
 *
 * On the first production run Vercel terminated one invocation mid-loop. The row stayed at
 * status 'running' with no process behind it, nothing ever reclaimed it, and `/api/run/step`
 * then reported the whole run finished — so the board span on that domain permanently. These
 * tests pin both halves: an abandoned claim is retryable, and a live one is still off-limits.
 */

async function newRun(): Promise<string> {
  return q.createRun({
    weights: DEFAULT_WEIGHTS,
    switches: DEFAULT_SWITCHES,
    domainsSubmitted: 1,
    duplicatesRemoved: 0,
  });
}

async function backdateClaim(companyId: string, seconds: number): Promise<void> {
  await sql`
    UPDATE companies
    SET claimed_at = now() - make_interval(secs => ${seconds})
    WHERE id = ${companyId}`;
}

describe("claimNextPending · an abandoned claim is not a finished one", () => {
  let runId: string;
  let companyId: string;

  beforeAll(async () => {
    runId = await newRun();
    companyId = await q.insertCompany({
      runId,
      domain: "example.com",
      normalizedDomain: "example.com",
    });
  });

  it("claims the pending company and stamps when it was taken", async () => {
    const claimed = await q.claimNextPending(runId);
    expect(claimed?.id).toBe(companyId);
    expect(claimed?.status).toBe("running");
    expect(claimed?.claimed_at).not.toBeNull();
  });

  it("will not hand the same company to a second caller while the claim is fresh", async () => {
    expect(await q.claimNextPending(runId)).toBeNull();
  });

  it("still counts a running company as outstanding, so the run cannot report done", async () => {
    expect(await q.countPending(runId)).toBe(1);
  });

  it("reclaims it once the claim is older than any handler is allowed to live", async () => {
    await backdateClaim(companyId, q.STALE_CLAIM_SECONDS + 30);
    const reclaimed = await q.claimNextPending(runId);
    expect(reclaimed?.id).toBe(companyId);
  });

  it("reports nothing outstanding once the company reaches a terminal state", async () => {
    await q.quarantineCompany(companyId);
    expect(await q.countPending(runId)).toBe(0);
    expect(await q.claimNextPending(runId)).toBeNull();
  });
});

describe("claimNextPending · untried work outranks a retry", () => {
  it("takes the pending domain first, even though the stale one was queued earlier", async () => {
    const runId = await newRun();
    const first = await q.insertCompany({
      runId,
      domain: "stale.com",
      normalizedDomain: "stale.com",
    });
    const second = await q.insertCompany({
      runId,
      domain: "fresh.com",
      normalizedDomain: "fresh.com",
    });

    // Both rows default `created_at` to now() and can land on the same timestamp, which leaves
    // the queue order undefined. Space them so the test asserts the priority rule and not a tie.
    await sql`UPDATE companies SET created_at = now() - make_interval(secs => 10) WHERE id = ${first}`;

    expect((await q.claimNextPending(runId))?.id).toBe(first);
    await backdateClaim(first, q.STALE_CLAIM_SECONDS + 30);

    expect((await q.claimNextPending(runId))?.id).toBe(second);
    await backdateClaim(second, q.STALE_CLAIM_SECONDS + 30);
    expect((await q.claimNextPending(runId))?.id).toBe(first);
  });
});
