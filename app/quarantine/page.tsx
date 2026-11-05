import Link from "next/link";
import { Badge, Card, CardBody, CardHeader, CardTitle } from "@/components/ui/primitives";
import * as q from "@/lib/db/queries";

export const dynamic = "force-dynamic";

/**
 * Every domain the run refused, with its reason code (§9). A quarantine list is the honest half
 * of a decision board: the companies that never reached a verdict are named rather than dropped
 * silently from the count.
 */
export default async function QuarantinePage() {
  const run = await q.latestRun();
  const rows = run ? await q.listQuarantine(run.id) : [];
  const feedback = await q.listFeedback();
  const rejects = feedback.filter((f) => f.action === "reject");

  return (
    <div className="mx-auto max-w-[1100px] space-y-4 px-4 py-4">
      <header>
        <h1 className="text-lg font-semibold tracking-tight">Quarantine</h1>
        <p className="mt-0.5 text-xs text-ink-400">
          Domains this run refused, and why. Nothing here was scored, so nothing here has a
          verdict — that is the distinction.
        </p>
      </header>

      <Card>
        <CardHeader className="flex items-center gap-2">
          <CardTitle>This run</CardTitle>
          <Badge tone="neutral">{rows.length}</Badge>
        </CardHeader>
        <CardBody>
          {rows.length === 0 ? (
            <p className="text-xs text-ink-400">
              {run
                ? "Nothing was refused in this run. Every submitted domain was fetched and scored — check the board."
                : "No run yet. Press Run on the board and this page fills in as domains are refused."}{" "}
              <Link href="/" className="text-accent-soft hover:underline">
                Go to the board →
              </Link>
            </p>
          ) : (
            <ul className="space-y-2">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-baseline gap-2 rounded-md border border-ink-700 bg-ink-850 px-3 py-2"
                >
                  <span className="font-mono text-xs text-ink-100">{r.domain}</span>
                  <Badge tone="drop">{r.reason_code}</Badge>
                  <span className="text-[11px] leading-snug text-ink-300">{r.reason_text}</span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* T-24 — feedback with a visible consequence, read back from the table that causes it. */}
      <Card>
        <CardHeader className="flex items-center gap-2">
          <CardTitle>What changed because of your feedback</CardTitle>
          <Badge tone="neutral">{rejects.length}</Badge>
        </CardHeader>
        <CardBody>
          {rejects.length === 0 ? (
            <p className="text-xs text-ink-400">
              No rejections yet. Reject a company on its detail page with a reason, and the next
              run quarantines that domain before it fetches anything.
            </p>
          ) : (
            <ul className="space-y-2">
              {rejects.map((f) => (
                <li
                  key={f.id}
                  className="rounded-md border border-ink-700 bg-ink-850 px-3 py-2"
                >
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-mono text-xs text-ink-100">{f.domain}</span>
                    <Badge tone="hold">suppressed next run</Badge>
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-ink-300">
                    Your reason: “{f.reason}”. The next run skips this domain before any fetch,
                    quarantined with that reason attached.
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
