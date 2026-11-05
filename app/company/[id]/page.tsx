import Link from "next/link";
import { notFound } from "next/navigation";
import { CompanyDetail } from "@/components/CompanyDetail";
import { applyHandoffRules } from "@/lib/pipeline/runCompany";
import { computeVerdict } from "@/lib/rules/verdict";
import { evaluateFit } from "@/lib/rules/fit";
import { sendToOrNull } from "@/lib/env";
import * as q from "@/lib/db/queries";

export const dynamic = "force-dynamic";

/**
 * The six sections of §9, in the order given. `what_would_change_it` is recomputed here rather
 * than stored: it is a pure function of evidence, signals and the run's weights, so deriving it
 * keeps it honest when the sliders move instead of leaving a stale sentence in the database.
 */
export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const company = await q.getCompany(id);
  if (!company) notFound();

  const run = await q.getRun(company.run_id);
  const [signals, trace, contacts, pains, draft, fetches, feedback] = await Promise.all([
    q.listSignals(id),
    q.listLoopTrace(id),
    q.listContacts(id),
    q.listPainPoints(id),
    q.getDraft(id),
    q.listFetches(id),
    q.feedbackForCompany(id),
  ]);

  const sends = draft ? await q.sendsFor(draft.id) : [];

  const weights = run ? q.runWeights(run) : undefined;
  const switches = run ? q.runSwitches(run) : undefined;

  let whatWouldChangeIt: string | null = null;
  if (weights && switches && company.status === "done") {
    const evidence = q.evidenceFromRow(company);
    const fit = evaluateFit(evidence, switches);
    const recomputed = applyHandoffRules(
      computeVerdict(evidence, q.toFiredSignals(signals), weights, switches),
      {
        fitPass: fit.pass,
        missing: JSON.parse(company.missing_fields_json ?? "[]") as string[],
        fetchesUsed: company.fetches_used,
        hasNamedContact: contacts.some((c) => c.selected),
      },
    );
    whatWouldChangeIt = recomputed.what_would_change_it;
  }

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-4">
      <Link href="/" className="text-xs text-ink-400 transition-colors hover:text-ink-100">
        ← Back to the board
      </Link>
      <CompanyDetail
        company={{
          id: company.id,
          domain: company.normalized_domain,
          status: company.status,
          stage: company.stage,
          verdict: company.verdict,
          verdict_reason: company.verdict_reason,
          rule_fired: company.rule_fired,
          timing_score: company.timing_score ?? 0,
          independent_signals: company.independent_signals ?? 0,
          play: company.play,
          fetches_used: company.fetches_used,
          error: company.error,
          missing_fields: JSON.parse(company.missing_fields_json ?? "[]") as string[],
          evidence: q.evidenceFromRow(company),
        }}
        whatWouldChangeIt={whatWouldChangeIt}
        signals={signals}
        trace={trace}
        contacts={contacts}
        pains={pains}
        draft={draft}
        fetches={fetches.map((f) => ({
          url: f.url,
          tier: f.tier,
          ok: f.ok,
          status_code: f.status_code,
          word_count: f.word_count,
          error: f.error,
        }))}
        alreadySent={sends.some((s) => s.status === "sent")}
        feedback={feedback}
        lockedTo={sendToOrNull()}
      />
    </div>
  );
}
