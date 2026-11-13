import { Badge, Card, CardBody, CardHeader, CardTitle } from "@/components/ui/primitives";
import { GOLDEN_SET, runGoldenSet } from "@/lib/seed/goldenSet";
import { BEHAVIOURAL_SET } from "@/lib/seed/behavioural";
import { resolveModelId } from "@/lib/ai/model";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const TONE = { pass: "send", fail: "drop", skipped: "hold" } as const;

/**
 * §7 — the assertions, run against the deployed code rather than a CI badge.
 *
 * Split in two on screen because the two halves answer different questions. The structural ones
 * ask "are the rules right"; the behavioural ones ask "is the pipeline still feeding them". F-11
 * was this page reporting ALL GREEN, 14 passed while the live board produced eight Holds and
 * nothing else — which it could, because only the first question was ever being asked.
 */
export default async function SelfTestPage() {
  const results = await runGoldenSet([...GOLDEN_SET, ...BEHAVIOURAL_SET]);
  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const structural = results.filter((r) => r.kind === "structural");
  const behavioural = results.filter((r) => r.kind === "behavioural");

  return (
    <div className="mx-auto max-w-[1100px] space-y-4 px-4 py-4">
      <header>
        <h1 className="text-lg font-semibold tracking-tight">Self-test</h1>
        <p className="mt-0.5 text-xs text-ink-400">
          Every assertion below runs on this deployment at the moment you loaded the page.
          Structural cases use frozen inputs and touch nothing; behavioural cases read the live
          database, because a suite that cannot see the pipeline fail cannot be trusted when it
          says the pipeline is fine.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={failed === 0 ? "send" : "drop"}>
          {failed === 0 ? "all green" : `${failed} failing`}
        </Badge>
        <span className="font-mono text-xs text-ink-400">
          {passed} passed · {failed} failed · {skipped} skipped
        </span>
        <span className="font-mono text-xs text-ink-400">model: {resolveModelId()}</span>
      </div>

      <Section
        title="Structural — frozen inputs, no network, no model, no database"
        note="These prove the rules engine is right. They were all green while the product was broken, which is why they are not the whole suite."
        rows={structural}
      />

      <Section
        title="Behavioural — reads the live database"
        note="These prove the pipeline is still feeding the rules. A case that needs a run and has none reports skipped; it never borrows a pass."
        rows={behavioural}
      />
    </div>
  );
}

function Section({
  title,
  note,
  rows,
}: {
  title: string;
  note: string;
  rows: Awaited<ReturnType<typeof runGoldenSet>>;
}) {
  const failed = rows.filter((r) => r.status === "fail").length;
  return (
      <Card>
        <CardHeader className="flex flex-wrap items-center gap-2">
          <CardTitle>{title}</CardTitle>
          <Badge tone={failed === 0 ? "send" : "drop"}>
            {failed === 0 ? `${rows.length} assertions` : `${failed} failing`}
          </Badge>
        </CardHeader>
        <CardBody className="space-y-1.5">
          <p className="pb-1 text-[11px] leading-snug text-ink-400">{note}</p>
          {rows.map((r) => (
            <div
              key={r.id}
              className={cn(
                "rounded-md border px-3 py-2",
                r.status === "pass" && "border-ink-700 bg-ink-850",
                r.status === "fail" && "border-drop/40 bg-drop/10",
                r.status === "skipped" && "border-hold/40 bg-hold/10",
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={TONE[r.status]}>{r.id}</Badge>
                <span className="text-xs font-medium text-ink-100">{r.title}</span>
                <span className="ml-auto font-mono text-[10px] uppercase tracking-wide text-ink-400">
                  {r.status}
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-ink-300">{r.detail}</p>
            </div>
          ))}
        </CardBody>
      </Card>
  );
}
