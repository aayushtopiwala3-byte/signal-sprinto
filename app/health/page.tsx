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
import { cn } from "@/lib/utils";
import * as q from "@/lib/db/queries";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;

/** §9's health page: model id, Hunter quota, cost in ₹ and USD, cache-hit rate, staleness. */
export default async function HealthPage() {
  const run = await q.latestRun();
  const [quota, cost, ledger] = await Promise.all([
    fetchQuota(),
    run ? q.costSummary(run.id) : Promise.resolve(null),
    run ? q.costLedger(run.id) : Promise.resolve([]),
  ]);

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
