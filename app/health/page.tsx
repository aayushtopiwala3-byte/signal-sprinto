import Link from "next/link";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  NotStated,
} from "@/components/ui/primitives";
import { PINNED_MODEL_ID, USD_TO_INR, resolveModelId } from "@/lib/ai/model";
import { HUNTER_LIMIT, QUOTA_GUARD_RATIO, fetchQuota } from "@/lib/hunter/client";
import { capability, env } from "@/lib/env";
import { FETCH_DELAY_MS } from "@/lib/fetch/tiers";
import { MAX_CRAWL_DELAY_MS } from "@/lib/fetch/robots";
import { PAGE_CACHE_MAX_AGE_DAYS } from "@/lib/db/queries";
import { cn } from "@/lib/utils";
import * as q from "@/lib/db/queries";
import { EconomicsPanel } from "@/components/Economics";
import { EMPTY_STATE_HEALTH } from "@/lib/ui/emptyStates";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;

/** §4 — the rule ids stay, with a human label beside them, never instead of them. */
const KIND_LABEL: Record<string, string> = {
  signal: "timing signal",
  pain_point: "pain point",
  draft_hook: "email hook",
};

/** §9's health page: model id, Hunter quota, cost in ₹ and USD, cache-hit rate, staleness. */
export default async function HealthPage() {
  const run = await q.latestRun();
  const [quota, cost, ledger, pages, blocks, sendTally, sendRows, outcomes] = await Promise.all([
    fetchQuota(),
    run ? q.costSummary(run.id) : Promise.resolve(null),
    run ? q.costLedger(run.id) : Promise.resolve([]),
    run ? q.cacheCounts(run.id) : Promise.resolve({ cached: 0, live: 0 }),
    run ? q.evidenceBlocks(run.id) : Promise.resolve([]),
    q.sendCounts(),
    q.sendBreakdown(),
    run
      ? q.runOutcomeCounts(run.id)
      : Promise.resolve({ scored: 0, send: 0, hold: 0, drop: 0, quarantined: 0, elapsedMs: null }),
  ]);

  const downgraded = blocks.filter((b) => b.tier === "asserted");
  const fabricated = blocks.filter((b) => b.tier === "fabricated");

  const startedAt = run ? new Date(run.started_at) : null;
  const stale = startedAt !== null && Date.now() - startedAt.getTime() > DAY_MS;

  const usd = cost?.totalUsd ?? 0;
  const hitRate = cost && cost.calls > 0 ? (cost.cacheHits / cost.calls) * 100 : null;

  const byCall = new Map<string, { calls: number; usd: number }>();
  for (const row of ledger) {
    const prev = byCall.get(row.call_name) ?? { calls: 0, usd: 0 };
    byCall.set(row.call_name, { calls: prev.calls + 1, usd: prev.usd + Number(row.cost_usd) });
  }

  return (
    <div className="mx-auto max-w-[1100px] space-y-4 px-4 py-4">
      <header>
        <h1 className="text-lg font-semibold tracking-tight">Health</h1>
        <p className="mt-0.5 text-xs text-ink-400">
          What is configured, what it cost, and how fresh the numbers are.
        </p>
      </header>

      {stale ? (
        <div className="rounded-md border border-hold/40 bg-hold/10 px-3 py-2 text-xs text-hold">
          The last run finished more than 24 hours ago. These figures describe that run, not the
          live web —{" "}
          <Link href="/" className="underline">
            run it again
          </Link>{" "}
          before trusting them.
        </div>
      ) : null}

      <EconomicsPanel
        data={{
          totalUsd: usd,
          calls: cost?.calls ?? 0,
          cacheHits: cost?.cacheHits ?? 0,
          hunterUsed: quota?.used ?? null,
          hunterRemaining: quota?.remaining ?? null,
          scored: outcomes.scored,
          send: outcomes.send,
          elapsedMs: outcomes.elapsedMs,
        }}
      />

      <Card>
        <CardHeader className="flex items-center gap-2">
          <CardTitle>Send transport</CardTitle>
          <Badge tone={sendTally.sent > 0 ? "send" : sendTally.dryRun > 0 ? "hold" : "neutral"}>
            {sendTally.sent > 0 ? "live" : sendTally.dryRun > 0 ? "dry run only" : "nothing yet"}
          </Badge>
        </CardHeader>
        <CardBody className="space-y-1.5 text-xs">
          {/* §3 (G6). Three counters, never two. Folding dry runs into `sent` would claim a
              transmission that did not happen; folding them into `failed` would report a
              breakage when nothing broke. */}
          <Row label="Sent" value={String(sendTally.sent)} mono />
          <SendAttribution rows={sendRows} bucket="sent" />
          <Row label="Dry-run (not transmitted)" value={String(sendTally.dryRun)} mono />
          <SendAttribution rows={sendRows} bucket="dry_run" />
          <Row label="Send failed" value={String(sendTally.failed)} mono />
          <SendAttribution rows={sendRows} bucket="failed" />
          <Row
            label="Transport chain"
            value={
              capability.gmail()
                ? "Gmail → Resend → fail loudly"
                : capability.resend()
                  ? "Resend only (no Gmail OAuth) → fail loudly"
                  : "none configured — dry run"
            }
          />
          {!capability.gmail() && !capability.resend() ? (
            <p className="pt-1 text-[11px] leading-snug text-ink-400">
              With no credentials configured, Approve and send writes a{" "}
              <span className="font-mono">dry_run</span> row and renders the exact RFC-822 bytes
              the Gmail path would encode. Nothing leaves the building, and the card does not
              claim it did. Adding the credentials makes the same draft transmit unchanged.
            </p>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="flex items-center gap-2">
          <CardTitle>Evidence check — R-23</CardTitle>
          <Badge tone={fabricated.length > 0 ? "drop" : downgraded.length > 0 ? "hold" : "send"}>
            {blocks.length === 0 ? "nothing refused" : `${blocks.length} refused`}
          </Badge>
        </CardHeader>
        <CardBody className="space-y-2 text-xs">
          <p className="font-mono text-sm text-ink-100">
            <span className={downgraded.length > 0 ? "text-hold" : "text-ink-400"}>
              {downgraded.length} claim{downgraded.length === 1 ? "" : "s"} downgraded to asserted
            </span>
            <span className="text-ink-600"> · </span>
            <span className={fabricated.length > 0 ? "text-drop" : "text-ink-400"}>
              {fabricated.length} fabrication{fabricated.length === 1 ? "" : "s"} blocked this run
            </span>
          </p>
          <p className="text-[11px] leading-snug text-ink-400">
            A quote that exists is not a quote that supports the claim. R-23 checks a third thing
            beyond the verbatim match: that the sentence is about <em>this company</em> and about{" "}
            <em>this claim</em>. An <span className="font-mono">asserted</span> claim is real text
            that fails one of those two tests — it is still shown, greyed, with the reason, and it
            scores zero. A <span className="font-mono">fabricated</span> one appears on no page
            fetched for that company and is never rendered as evidence at all.
          </p>

          {blocks.length === 0 ? (
            <p className="text-[11px] leading-snug text-ink-400">
              {run
                ? "Nothing was refused on the last run. That is a result, not an absence of checking — every claim that fired was traced back to a page and matched."
                : EMPTY_STATE_HEALTH}
            </p>
          ) : (
            <details className="group rounded-md border border-ink-700 bg-ink-850">
              <summary className="cursor-pointer select-none px-3 py-2 text-[11px] text-ink-300 marker:text-ink-500">
                Show what was refused
              </summary>
              <div className="space-y-1.5 border-t border-ink-700 px-3 py-2">
                {blocks.map((b) => (
                  <div
                    key={b.id}
                    className={cn(
                      "rounded border px-2.5 py-1.5",
                      b.tier === "fabricated"
                        ? "border-drop/30 bg-drop/5"
                        : "border-hold/30 bg-hold/5",
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={b.tier === "fabricated" ? "drop" : "hold"}>
                        {b.tier === "fabricated" ? "blocked" : "asserted"}
                      </Badge>
                      <span className="font-mono text-[11px] text-ink-200">{b.domain}</span>
                      <span className="text-[11px] text-ink-400">{KIND_LABEL[b.kind] ?? b.kind}</span>
                      {b.claim_id ? (
                        <span className="font-mono text-[10px] text-ink-400">{b.claim_id}</span>
                      ) : null}
                    </div>
                    <p className="mt-1 border-l-2 border-ink-700 pl-2 text-[11px] italic leading-snug text-ink-500">
                      {b.quote ? `“${b.quote}”` : <NotStated />}
                    </p>
                    <p className="mt-1 text-[11px] leading-snug text-ink-300">
                      {b.reason ?? <NotStated />}
                    </p>
                  </div>
                ))}
              </div>
            </details>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardHeader className="flex items-center gap-2">
            <CardTitle>Model</CardTitle>
            <Badge tone={capability.ai() ? "send" : "hold"}>
              {capability.ai() ? "available" : "rules-only"}
            </Badge>
          </CardHeader>
          <CardBody className="space-y-1.5 text-xs">
            <Row label="Resolved model id" value={resolveModelId()} mono />
            <Row label="Pinned in code" value={PINNED_MODEL_ID} mono />
            <Row
              label="Transport"
              value={
                env.geminiApiKey()
                  ? "Gemini direct"
                  : env.openRouterApiKey()
                    ? "OpenRouter (Gemini slug)"
                    : "none configured"
              }
            />
            <p className="pt-1 text-[11px] leading-snug text-ink-400">
              A runtime guard throws if the resolved id does not start with{" "}
              <span className="font-mono">gemini-</span>, so no other model can be substituted by
              environment alone.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="flex items-center gap-2">
            <CardTitle>Hunter.io quota</CardTitle>
            {quota ? (
              <Badge tone={quota.guardTripped ? "drop" : "send"}>
                {quota.guardTripped ? "guard tripped" : "ok"}
              </Badge>
            ) : (
              <Badge tone="hold">no key</Badge>
            )}
          </CardHeader>
          <CardBody className="space-y-2 text-xs">
            {quota ? (
              <>
                <div className="h-2 w-full overflow-hidden rounded-full bg-ink-700">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      quota.guardTripped ? "bg-drop" : "bg-accent",
                    )}
                    style={{ width: `${Math.min(100, Math.round(quota.ratio * 100))}%` }}
                  />
                </div>
                <Row label="Used" value={`${quota.used} of ${quota.limit}`} mono />
                <Row label="Remaining" value={String(quota.remaining)} mono />
                <Row label="Resets" value={quota.resetDate ?? "not stated"} mono />
                <p className="text-[11px] leading-snug text-ink-400">
                  Lookups stop at {Math.round(QUOTA_GUARD_RATIO * 100)}% and the seeded contact
                  set takes over, badged <span className="font-mono">seeded</span> on every card.
                  At most {HUNTER_LIMIT} candidates are requested per domain.
                </p>
              </>
            ) : (
              <p className="text-[11px] leading-snug text-ink-400">
                HUNTER_API_KEY is not set, so point-of-contact lookup uses the seeded set. Every
                such contact renders a visible <span className="font-mono">seeded</span> badge —
                it is never passed off as live.
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cost — latest run</CardTitle>
          </CardHeader>
          <CardBody className="space-y-1.5 text-xs">
            <Row label="Total" value={`$${usd.toFixed(4)}`} mono />
            <Row label="Total (INR)" value={`₹${(usd * USD_TO_INR).toFixed(2)}`} mono />
            <Row label="Model calls" value={String(cost?.calls ?? 0)} mono />
            <Row
              label="Cache-hit rate"
              value={hitRate === null ? null : `${hitRate.toFixed(0)}%`}
              mono
            />
            <Row label="Failed calls" value={String(cost?.failures ?? 0)} mono />
            <Row label="Ceiling" value={`$${env.costCeilingUsd().toFixed(2)}`} mono />
            {byCall.size > 0 ? (
              <div className="pt-1">
                {[...byCall.entries()].map(([name, v]) => (
                  <Row
                    key={name}
                    label={name}
                    value={`${v.calls} call${v.calls === 1 ? "" : "s"} · $${v.usd.toFixed(4)}`}
                    mono
                  />
                ))}
              </div>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="flex items-center gap-2">
            <CardTitle>Pages read — latest run</CardTitle>
            <Badge tone={pages.cached > 0 ? "send" : "neutral"}>
              {pages.cached > 0 ? "cache warm" : "cold"}
            </Badge>
          </CardHeader>
          <CardBody className="space-y-1.5 text-xs">
            <Row
              label="This run"
              value={`${pages.cached} page${pages.cached === 1 ? "" : "s"} served from cache · ${pages.live} live fetch${pages.live === 1 ? "" : "es"}`}
              mono
            />
            <Row
              label="Cache entries expire after"
              value={`${PAGE_CACHE_MAX_AGE_DAYS} days`}
              mono
            />
            <Row
              label="Politeness gap"
              value={`${FETCH_DELAY_MS}ms, or robots.txt Crawl-delay up to ${MAX_CRAWL_DELAY_MS}ms`}
              mono
            />
            <p className="pt-1 text-[11px] leading-snug text-ink-400">
              A cache hit skips the request to the company&apos;s server and the tokens spent
              cleaning the page, but it still spends one of the four extra fetches. The budget
              counts questions answered, not money spent — so re-running a list cannot buy the
              loop more reading than a first run had.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Last run</CardTitle>
          </CardHeader>
          <CardBody className="space-y-1.5 text-xs">
            <Row label="Started" value={startedAt?.toISOString() ?? null} mono />
            <Row
              label="Finished"
              value={run?.finished_at ? new Date(run.finished_at).toISOString() : null}
              mono
            />
            <Row label="Status" value={run?.status ?? null} />
            <Row label="Domains submitted" value={run ? String(run.domains_submitted) : null} mono />
            <Row
              label="Duplicates removed"
              value={run ? String(run.duplicates_removed) : null}
              mono
            />
            <Row
              label="Database"
              value={capability.durableDb() ? "Neon Postgres" : "PGlite, in-memory"}
            />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-ink-400">{label}</span>
      <span className={cn("text-right text-ink-100", mono && "font-mono text-[11px]")}>
        {value ?? <NotStated />}
      </span>
    </div>
  );
}

/**
 * §4.2 (v3) — who each counter is about.
 *
 * Rendered directly beneath its count so the two cannot drift apart, and linked to the company
 * card so a reader can go and look rather than take the number on trust. Nothing is shown when
 * a bucket is empty: a row reading "Send failed 0" needs no drill-down, and an empty disclosure
 * is just furniture.
 */
function SendAttribution({
  rows,
  bucket,
}: {
  rows: {
    bucket: "sent" | "dry_run" | "failed";
    company_id: string;
    domain: string;
    transport: string;
    error: string | null;
    sent_at: string;
  }[];
  bucket: "sent" | "dry_run" | "failed";
}) {
  const mine = rows.filter((r) => r.bucket === bucket);
  if (mine.length === 0) return null;

  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 pb-1 pl-3 text-[11px] text-ink-400">
      {mine.map((r, i) => (
        <span key={`${r.company_id}-${r.sent_at}-${i}`} className="flex items-baseline gap-1">
          <Link
            href={`/company/${r.company_id}`}
            className="font-mono text-ink-200 underline decoration-ink-600 underline-offset-2 hover:text-ink-100"
          >
            {r.domain}
          </Link>
          <span className="text-ink-500">via {r.transport}</span>
          {r.error ? (
            <span className="text-ink-500" title={r.error}>
              — {r.error.length > 44 ? `${r.error.slice(0, 44)}…` : r.error}
            </span>
          ) : null}
        </span>
      ))}
    </div>
  );
}
