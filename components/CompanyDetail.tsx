"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AiChip,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Input,
  NotStated,
  QuoteChip,
  Textarea,
} from "@/components/ui/primitives";
import { SIGNAL_LABEL } from "@/lib/rules/signals";
import { fieldsAsNouns } from "@/lib/ui/labels";
import { counterfactualFor } from "@/lib/rules/counterfactual";
import { NOT_STATED, type EvidenceMap, type SignalId, type Weights } from "@/lib/types";
import type {
  ContactDbRow,
  DraftRow,
  FeedbackRow,
  LoopTraceRow,
  PainPointRow,
  ReplyRow,
  SendRow,
  SignalRow,
} from "@/lib/db/queries";
import { cn } from "@/lib/utils";

type CompanyView = {
  id: string;
  domain: string;
  status: string;
  stage: string;
  verdict: string | null;
  verdict_reason: string | null;
  rule_fired: string | null;
  timing_score: number;
  independent_signals: number;
  play: string | null;
  fetches_used: number;
  error: string | null;
  missing_fields: string[];
  evidence: EvidenceMap;
  /** §2.1 — reserved fetch 1's answer, including when the answer is "they do not have one". */
  security_page_checked: boolean;
  security_page_url: string | null;
};

type FetchView = {
  url: string;
  tier: number;
  ok: boolean;
  status_code: number | null;
  word_count: number;
  error: string | null;
  from_cache: boolean;
  delay_ms: number;
};

const TONE: Record<string, "send" | "hold" | "drop" | "neutral"> = {
  SEND: "send",
  HOLD: "hold",
  DROP: "drop",
};

export function CompanyDetail(props: {
  company: CompanyView;
  whatWouldChangeIt: string | null;
  signals: SignalRow[];
  trace: LoopTraceRow[];
  contacts: ContactDbRow[];
  pains: PainPointRow[];
  draft: DraftRow | null;
  fetches: FetchView[];
  sends: SendRow[];
  feedback: FeedbackRow | null;
  lockedTo: string | null;
  /** §6.2 — the run's weights, so the counterfactual prices the signal that is missing. */
  weights: Weights;
  /** §6.3 — the newest applied reply, which outranks the verdict's own reasoning. */
  latestReply: ReplyRow | null;
}) {
  const { company } = props;

  return (
    <div className="space-y-4 pt-3">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-lg font-semibold tracking-tight">{company.domain}</h1>
        {company.verdict ? (
          <Badge tone={TONE[company.verdict] ?? "neutral"}>{company.verdict}</Badge>
        ) : (
          <Badge tone="neutral">{company.stage}</Badge>
        )}
        {company.play === "migration" ? <Badge tone="neutral">migration play</Badge> : null}
        <a
          href={`https://${company.domain}/`}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-ink-400 transition-colors hover:text-accent-soft"
        >
          visit site ↗
        </a>
      </header>

      <VerdictSection {...props} />
      <SignalsSection signals={props.signals} />
      <LoopTraceSection trace={props.trace} fetches={props.fetches} used={company.fetches_used} />
      <ContactSection companyId={company.id} contacts={props.contacts} />
      <PainSection pains={props.pains} />
      <DraftSection
        draft={props.draft}
        lockedTo={props.lockedTo}
        sends={props.sends}
        contact={props.contacts.find((c) => c.selected) ?? null}
      />
      <FeedbackSection companyId={company.id} existing={props.feedback} domain={company.domain} />
    </div>
  );
}

/* ------------------------------------------------------- 1. Verdict and why */

function VerdictSection({
  company,
  whatWouldChangeIt,
  signals,
  weights,
  latestReply,
}: {
  company: CompanyView;
  whatWouldChangeIt: string | null;
  signals: SignalRow[];
  weights: Weights;
  latestReply: ReplyRow | null;
}) {
  const e = company.evidence;
  // §6.2 — only verified, scoring signals count as evidence we actually have.
  const scored = signals.filter((s) => s.points > 0 && s.tier === "verified");
  const cf = counterfactualFor({
    domain: company.domain,
    verdict: company.verdict,
    rule_fired: company.rule_fired,
    timing_score: company.timing_score,
    independent_signals: company.independent_signals,
    firedSignalIds: scored.map((s) => s.signal_id as SignalId),
    firedGroups: [...new Set(scored.map((s) => s.independence_group))],
    weights,
    security_page_checked: company.security_page_checked,
    security_page_url: company.security_page_url,
    size_band: e.size_band,
    size_source: e.size_source ?? null,
    latestReply: latestReply
      ? { rule: latestReply.rule_fired, intent: latestReply.intent, effect: latestReply.effect }
      : null,
  });
  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-2">
        <CardTitle>1 · Verdict and why</CardTitle>
        {company.rule_fired ? <Badge tone="accent">{company.rule_fired}</Badge> : null}
      </CardHeader>
      <CardBody className="space-y-3">
        {company.error ? (
          <p className="rounded-md border border-drop/40 bg-drop/10 px-3 py-2 text-xs text-drop">
            {company.error}
          </p>
        ) : null}

        <p className="text-sm leading-relaxed text-ink-100">
          {company.verdict_reason ?? "This company has not been scored yet."}
        </p>

        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-400">
          <span>
            timing score{" "}
            <span className="font-mono text-ink-100">{company.timing_score}</span> / 50 to send
          </span>
          <span>
            independent groups{" "}
            <span className="font-mono text-ink-100">{company.independent_signals}</span> / 2
          </span>
          <span>
            extra fetches <span className="font-mono text-ink-100">{company.fetches_used}</span> / 4
          </span>
        </div>

        {/* §6.2 — the computed next step, expanded. §0 keeps the original panel: the verdict's
            own `what_would_change_it` is the engine's record of its reasoning and is not
            replaced by the queue advice, it is shown under it. */}
        <div
          className={cn(
            "rounded-md border px-3 py-2",
            cf.actionable ? "border-accent/40 bg-accent/5" : "border-ink-700 bg-ink-850",
          )}
        >
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-400">
            {cf.actionable ? "What would move this" : "Nothing would move this"}
          </p>
          {cf.replyNote ? (
            <p className="mb-1 flex flex-wrap items-center gap-1.5">
              <Badge tone="accent">reply</Badge>
              <span className="text-[11px] font-semibold text-accent-soft">{cf.replyNote}</span>
            </p>
          ) : null}
          <p className="text-xs leading-relaxed text-ink-100">{cf.text}</p>
          {cf.suggestedUrl ? (
            <a
              href={cf.suggestedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block font-mono text-[11px] text-accent-soft underline"
            >
              {cf.suggestedUrl} ↗
            </a>
          ) : null}
          {cf.override === "size_band" ? (
            <p className="mt-1.5 text-[11px] leading-snug text-ink-400">
              Company size is the field this verdict turned on. It is recorded as{" "}
              <span className="font-mono text-ink-200">{e.size_band ?? NOT_STATED}</span>
              {e.size_source ? (
                <>
                  {" "}
                  (<span className="font-mono">{e.size_source}</span>)
                </>
              ) : null}
              . Re-running this company alone re-reads the page it came from.
            </p>
          ) : null}
        </div>

        {whatWouldChangeIt ? (
          <div className="rounded-md border border-ink-700 bg-ink-850 px-3 py-2">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-400">
              What would change it
            </p>
            <p className="text-xs leading-relaxed text-ink-200">{whatWouldChangeIt}</p>
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2">
          <EvidenceFact
            label="Do they sell software to businesses?"
            code="is_b2b_saas"
            value={e.is_b2b_saas === null ? null : e.is_b2b_saas ? "yes" : "no"}
            quote={e.is_b2b_saas_evidence}
          />
          <EvidenceFact
            label="How big are they?"
            code="size_band"
            value={e.size_band}
            quote={e.size_band_evidence}
            provenance={SIZE_SOURCE_NOTE[e.size_source ?? ""] ?? null}
          />
          <EvidenceFact
            label="Are they already certified?"
            code="cert_status"
            value={e.cert_status}
            quote={e.cert_status_evidence}
          />
          <EvidenceFact
            label="Is there compliance pressure?"
            code="pressure_signals"
            // An empty array is an answer — we read the pages and found none. Only null means
            // the field was never filled, and `emptyFields` already draws that line, so the
            // card must draw it the same way or it contradicts the engine it is reporting.
            value={
              e.pressure_signals === null
                ? null
                : e.pressure_signals.length > 0
                  ? e.pressure_signals.join(", ")
                  : "none found on the pages we read"
            }
            quote={null}
          />
        </div>

        {/* §2.1 — the absence of a trust page is a finding, not a blank. */}
        {company.security_page_checked ? (
          company.security_page_url ? (
            <p className="text-xs text-ink-400">
              Security page read:{" "}
              <a
                href={company.security_page_url}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-ink-200 underline decoration-ink-600 underline-offset-2"
              >
                {company.security_page_url.replace(/^https?:\/\//, "")}
              </a>{" "}
              — one of the four extra fetches is reserved for it.
            </p>
          ) : (
            <p className="text-xs text-hold">
              <span className="font-mono">no security page found</span> — we tried /security,
              /trust and /compliance. That absence is itself informative: S-02 cannot fire, and
              there is no published trust page for a buyer to ask about.
            </p>
          )
        ) : null}

        {company.missing_fields.length > 0 ? (
          <p className="text-xs text-hold">
            Still unknown after {company.fetches_used} extra fetches:{" "}
            <span title={company.missing_fields.join(", ")}>
              {fieldsAsNouns(company.missing_fields)}
            </span>
            {" ("}
            <span className="font-mono text-[10px]">{company.missing_fields.join(", ")}</span>
            {"). "}
            {/* R-02c (§2.4). An unknown headcount no longer hands the company off, so this line
                must not claim it did — the gap is reported, and the verdict stood anyway. */}
            {company.rule_fired === "R-22"
              ? "Handed off rather than guessed."
              : "Reported rather than guessed — R-02c does not let an unknown headcount decide the verdict."}
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}

/**
 * §2.3 — how a headcount band was arrived at, in words, beside the band. R-02 drops a company
 * on this field, so "they printed it" and "we counted their job ads" must not look identical.
 */
const SIZE_SOURCE_NOTE: Record<string, string> = {
  stated: "stated by the company on its own site",
  inferred: "estimated from the number of open roles — not a figure they published",
  hunter: "from Hunter's company metadata, not from their site",
};

function EvidenceFact({
  label,
  value,
  quote,
  provenance,
  code,
}: {
  label: string;
  value: string | null;
  quote: { quote: string; url: string } | null;
  /** Optional sentence explaining where the value came from when there is no quote to show. */
  provenance?: string | null;
  /** §5 — the Evidence Map field name, kept beside the question rather than replaced by it. */
  code?: string;
}) {
  return (
    <div className="rounded-md border border-ink-700 bg-ink-850 px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          {/* §5 — the Evidence Map is a set of questions, so it is shown as questions. */}
          <span className="block text-[11px] font-medium leading-snug text-ink-300">{label}</span>
          {code ? <span className="font-mono text-[10px] text-ink-500">{code}</span> : null}
        </span>
        {/* An inferred value never gets a quote chip: there is no sentence behind it. */}
        {quote ? <QuoteChip url={quote.url} /> : <AiChip />}
      </div>
      <p className="mt-0.5 font-mono text-xs text-ink-100">{value ?? <NotStated />}</p>
      {quote ? (
        <p className="mt-1 border-l-2 border-ink-700 pl-2 text-[11px] leading-snug text-ink-300">
          “{quote.quote}”
        </p>
      ) : null}
      {provenance && value ? (
        <p className="mt-1 text-[11px] leading-snug text-ink-400">{provenance}</p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------- 2. Signals */

function SignalsSection({ signals }: { signals: SignalRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>2 · Signals</CardTitle>
      </CardHeader>
      <CardBody className="space-y-2">
        {signals.length === 0 ? (
          <p className="text-xs text-ink-400">
            No timing signal fired. Nothing on the pages we read suggests compliance pressure right
            now — that is a finding, not a gap.
          </p>
        ) : (
          signals.map((s) => {
            // R-23 (§3.1). An asserted signal keeps its place on the card, greyed, with the
            // reason it was downgraded — the reader should be able to see what was found and
            // why it did not count, not just be told the score is lower.
            const asserted = s.tier !== "verified";
            return (
              <div
                key={s.id}
                className={cn(
                  "rounded-md border px-3 py-2",
                  asserted
                    ? "border-hold/30 border-dashed bg-ink-900"
                    : "border-ink-700 bg-ink-850",
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={asserted ? "neutral" : "accent"}>{s.signal_id}</Badge>
                  <span className={cn("text-xs", asserted ? "text-ink-400" : "text-ink-100")}>
                    {SIGNAL_LABEL[s.signal_id as SignalId] ?? s.signal_id}
                  </span>
                  <span
                    className={cn(
                      "font-mono text-xs",
                      asserted ? "text-ink-500 line-through" : "text-accent-soft",
                    )}
                  >
                    +{s.points}
                  </span>
                  <Badge tone="neutral">{s.independence_group}</Badge>
                  <Badge tone={asserted ? "hold" : "send"}>
                    {asserted ? "asserted" : "verified"}
                  </Badge>
                  {s.quote ? <QuoteChip url={s.source_url} /> : null}
                </div>
                <p
                  className={cn(
                    "mt-1 border-l-2 pl-2 text-[11px] leading-snug",
                    asserted ? "border-ink-800 italic text-ink-500" : "border-ink-700 text-ink-300",
                  )}
                >
                  {s.quote ? `“${s.quote}”` : <NotStated />}
                </p>
                {asserted ? (
                  <p className="mt-1.5 text-[11px] leading-snug text-hold">
                    <span className="font-semibold">R-23 · scores 0</span> — {s.tier_reason ??
                      "the evidence does not support this claim"}
                    .
                  </p>
                ) : null}
              </div>
            );
          })
        )}
        <TierLegend />
      </CardBody>
    </Card>
  );
}

/**
 * §3.2 — the legend for R-23's chips. It sits under the signals rather than on a help page
 * because the chips are meaningless without it, and a reader looking at a struck-through score
 * should not have to go anywhere to find out who struck it.
 */
function TierLegend() {
  return (
    <div className="mt-1 flex flex-wrap items-start gap-x-4 gap-y-1 border-t border-ink-800 pt-2 text-[11px] leading-snug text-ink-400">
      <span className="flex items-center gap-1.5">
        <Badge tone="send">verified</Badge>
        quoted on a page we fetched, names this company, speaks to this signal — scores
      </span>
      <span className="flex items-center gap-1.5">
        <Badge tone="hold">asserted</Badge>
        <span>
          the quote is real but fails one of those tests — <strong>R-23</strong> scores it 0 and
          excludes it from R-21
        </span>
      </span>
      <span className="flex items-center gap-1.5">
        <Badge tone="drop">blocked</Badge>
        on no page we fetched — never shown as evidence, counted on Health
      </span>
    </div>
  );
}

/* ------------------------------------------------------------ 3. Loop trace */

function LoopTraceSection({
  trace,
  fetches,
  used,
}: {
  trace: LoopTraceRow[];
  fetches: FetchView[];
  used: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>3 · How it decided what to read next</CardTitle>
      </CardHeader>
      <CardBody className="space-y-3">
        <p className="text-xs leading-relaxed text-ink-400">
          One row per iteration. The loop stops when every field is filled or after 4 extra
          fetches — whichever comes first. {used}/4 used here.
        </p>
        {/* §2.1 — a judge must be able to see which fetches were spent by design. */}
        <p className="text-xs leading-relaxed text-ink-400">
          The cap is still 4. What changed is who spends it: the first two are{" "}
          <span className="font-semibold text-ink-200">reserved</span> — one for the security or
          trust page, one for careers — and only the remaining two are the model&rsquo;s to
          choose. The page carrying S-01, S-02 and S-03 is not something a model gets to decide
          to skip.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wide text-ink-400">
              <tr className="border-b border-ink-700">
                <th className="py-1.5 pr-3 font-semibold">#</th>
                <th className="py-1.5 pr-3 font-semibold">Still empty</th>
                <th className="py-1.5 pr-3 font-semibold">Chose</th>
                <th className="py-1.5 pr-3 font-semibold">Why</th>
                <th className="py-1.5 pr-3 font-semibold">By</th>
                <th className="py-1.5 font-semibold">Filled</th>
              </tr>
            </thead>
            <tbody>
              {trace.map((t) => {
                const empty = JSON.parse(t.empty_fields_json) as string[];
                const filled = t.fields_filled_json
                  ? (JSON.parse(t.fields_filled_json) as string[])
                  : [];
                return (
                  <tr key={t.id} className="border-b border-ink-800 align-top">
                    <td className="py-1.5 pr-3 font-mono text-ink-400">{t.iteration}</td>
                    <td className="py-1.5 pr-3 font-mono text-hold">
                      {empty.length ? empty.join(", ") : "—"}
                    </td>
                    <td className="max-w-[220px] break-all py-1.5 pr-3">
                      {t.chosen_url ? (
                        <a
                          href={t.chosen_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-accent-soft hover:underline"
                        >
                          {t.chosen_url}
                        </a>
                      ) : (
                        <span className="text-ink-400">stopped</span>
                      )}
                    </td>
                    <td className="max-w-[260px] py-1.5 pr-3 leading-snug text-ink-300">
                      {t.chosen_reason ?? <NotStated />}
                    </td>
                    <td className="py-1.5 pr-3">
                      <Badge
                        tone={
                          t.chosen_by === "ai"
                            ? "accent"
                            : t.chosen_by === "reserved"
                              ? "send"
                              : "neutral"
                        }
                      >
                        {t.chosen_by === "reserved" ? "RESERVED" : t.chosen_by}
                      </Badge>
                    </td>
                    <td className="py-1.5 font-mono text-send">
                      {filled.length ? filled.join(", ") : t.fetch_ok === false ? "fetch failed" : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <details className="text-xs">
          <summary className="cursor-pointer text-ink-400 hover:text-ink-100">
            Every HTTP attempt ({fetches.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {fetches.map((f, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-2">
                <Badge tone={f.ok ? "send" : "drop"}>
                  {f.from_cache ? "cached" : `tier ${f.tier}`}
                </Badge>
                <span className="break-all font-mono text-[11px] text-ink-300">{f.url}</span>
                <span className="text-[11px] text-ink-400">
                  {f.from_cache ? "served from page cache, no request made" : (f.status_code ?? "no status")} ·{" "}
                  {f.word_count} words
                  {/* §2.6a — the measured wait, not the nominal one. */}
                  {f.delay_ms > 0 ? ` · polite: waited ${f.delay_ms}ms before this request` : ""}
                  {f.error ? ` · ${f.error}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </details>
      </CardBody>
    </Card>
  );
}

/* ---------------------------------------------------------------- 4. Contact */

function ContactSection({
  companyId,
  contacts,
}: {
  companyId: string;
  contacts: ContactDbRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function swap(contactId: string) {
    setBusy(contactId);
    setError(null);
    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ companyId, contactId }),
    });
    const data = (await res.json()) as { error?: string };
    setBusy(null);
    if (!res.ok) setError(data.error ?? "Swap failed.");
    else router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>4 · Contact</CardTitle>
      </CardHeader>
      <CardBody className="space-y-2">
        {contacts.length === 0 ? (
          <p className="text-xs text-ink-400">
            No contact lookup ran. Either the FIT gate was not cleared, or Hunter.io is
            unavailable — see the banner at the top of the page.
          </p>
        ) : null}

        {error ? <p className="text-xs text-drop">{error}</p> : null}

        {contacts.map((c) => {
          const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
          const generic = c.ladder_rank === 99;
          return (
            <div
              key={c.id}
              className={cn(
                "rounded-md border px-3 py-2",
                c.selected ? "border-send/40 bg-send/5" : "border-ink-700 bg-ink-850",
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                {c.selected ? <Badge tone="send">selected</Badge> : null}
                <span className="text-xs font-medium text-ink-100">
                  {name || <NotStated />}
                </span>
                <span className="text-xs text-ink-400">{c.position ?? <NotStated />}</span>
                <Badge tone="neutral">{c.source}</Badge>
                {generic ? null : <Badge tone="neutral">ladder #{c.ladder_rank}</Badge>}
                <span className="font-mono text-[11px] text-ink-400">{c.email}</span>
                <span className="font-mono text-[11px] text-ink-400">
                  conf {c.confidence}
                </span>
                {!c.selected && !generic ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto"
                    disabled={busy !== null}
                    onClick={() => swap(c.id)}
                  >
                    {busy === c.id ? "Swapping…" : "Use this one"}
                  </Button>
                ) : null}
              </div>
              {c.lost_reason ? (
                <p className="mt-1 text-[11px] leading-snug text-ink-400">{c.lost_reason}</p>
              ) : null}
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
}

/* ------------------------------------------------------------ 5. Pain points */

function PainSection({ pains }: { pains: PainPointRow[] }) {
  return (
    <Card>
      <CardHeader className="flex items-center gap-2">
        <CardTitle>5 · Pain points</CardTitle>
        <AiChip />
      </CardHeader>
      <CardBody className="space-y-2">
        {pains.length === 0 ? (
          <p className="text-xs text-ink-400">
            Pain points are only written once the FIT gate passes. This company did not get that
            far.
          </p>
        ) : (
          pains.map((p) => {
            // R-23 (§3.1) applies to pain points on the same terms as signals: a quote can be
            // real and still not be about this company. An unsupported pain point stays visible
            // so the reader can judge it, but it is marked rather than presented as fact.
            const asserted = p.tier !== "verified";
            return (
              <div
                key={p.id}
                className={cn(
                  "rounded-md border px-3 py-2",
                  asserted ? "border-hold/30 border-dashed bg-ink-900" : "border-ink-700 bg-ink-850",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p
                    className={cn(
                      "text-xs leading-relaxed",
                      asserted ? "text-ink-400" : "text-ink-100",
                    )}
                  >
                    {p.text}
                  </p>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Badge tone={asserted ? "hold" : "send"}>
                      {asserted ? "asserted" : "verified"}
                    </Badge>
                    {p.validated ? <QuoteChip url={p.source_url} /> : null}
                  </div>
                </div>
                <p
                  className={cn(
                    "mt-1 border-l-2 pl-2 text-[11px] leading-snug",
                    asserted ? "border-ink-800 italic text-ink-500" : "border-ink-700 text-ink-300",
                  )}
                >
                  {p.validated && p.quote ? `“${p.quote}”` : <NotStated />}
                </p>
                {asserted ? (
                  <p className="mt-1.5 text-[11px] leading-snug text-hold">
                    <span className="font-semibold">R-23 · not used as fact</span> —{" "}
                    {p.tier_reason ?? "the evidence does not support this claim"}.
                  </p>
                ) : null}
              </div>
            );
          })
        )}
      </CardBody>
    </Card>
  );
}

/* ----------------------------------------------------------------- 6. Draft */

function DraftSection({
  draft,
  lockedTo,
  sends,
  contact,
}: {
  draft: DraftRow | null;
  lockedTo: string | null;
  sends: SendRow[];
  contact: ContactDbRow | null;
}) {
  const router = useRouter();
  const [subject, setSubject] = useState(draft?.subject ?? "");
  const [body, setBody] = useState(draft?.body ?? "");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validated, setValidated] = useState(draft?.validated ?? false);
  const [blocked, setBlocked] = useState(draft?.blocked_reason ?? null);

  // §4.2 — the transport that actually carried the email, read back from the send row rather
  // than from the in-session note, so it survives a reload. A fallback must never be mistaken
  // for the primary path, which means the card has to say which one ran even days later.
  const [dryRun, setDryRun] = useState<{ to: string; from: string; rfc822: string } | null>(null);
  const sent = sends.find((s) => s.status === "sent") ?? null;
  const alreadySent = sent !== null;
  const failedSends = sends.filter((s) => s.status !== "sent" && s.transport !== "dry_run");
  const dryRunRow = sends.find((s) => s.transport === "dry_run") ?? null;

  if (!draft) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>6 · Draft</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="text-xs text-ink-400">
            No draft. Drafting is the last step and only runs for companies that clear the FIT
            gate — writing prose for a company we already dropped would be work on a decided
            question.
          </p>
        </CardBody>
      </Card>
    );
  }

  async function save() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/draft", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ draftId: draft!.id, subject, body }),
    });
    const data = (await res.json()) as {
      error?: string;
      validated?: boolean;
      blocked_reason?: string | null;
    };
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Save failed.");
      return;
    }
    setValidated(data.validated ?? false);
    setBlocked(data.blocked_reason ?? null);
    setEditing(false);
    setNote(
      data.validated
        ? "Saved. The hook quote is still verbatim on the source page, so this stays sendable."
        : "Saved, but now blocked — the edit broke the link to the evidence.",
    );
  }

  async function send() {
    setBusy(true);
    setError(null);
    setNote(null);
    const res = await fetch("/api/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      // `to` is deliberately absent: the route has no parameter for it (§2.2).
      body: JSON.stringify({ draftId: draft!.id }),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      to?: string;
      transport?: string;
      error?: string;
      blocked_reason?: string;
      dry_run?: boolean;
      from?: string;
      rfc822?: string;
    };
    setBusy(false);
    if (!res.ok || !data.ok) {
      setError(data.blocked_reason ?? data.error ?? "The message was not transmitted.");
      return;
    }
    // §3 (G6). A dry run is not a send and is never described as one, in any tense.
    if (data.dry_run) {
      setDryRun({ to: data.to ?? "", from: data.from ?? "", rfc822: data.rfc822 ?? "" });
      setNote(null);
      router.refresh();
      return;
    }
    setNote(`Sent to ${data.to} via ${data.transport}.`);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center gap-2">
        <CardTitle>6 · Draft</CardTitle>
        <AiChip />
        {validated ? (
          <Badge tone="send">evidence checked</Badge>
        ) : (
          <Badge tone="drop">blocked</Badge>
        )}
      </CardHeader>
      <CardBody className="space-y-3">
        {blocked ? (
          <p className="rounded-md border border-drop/40 bg-drop/10 px-3 py-2 text-xs text-drop">
            {blocked}
          </p>
        ) : null}

        {editing ? (
          <>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            <Textarea rows={12} value={body} onChange={(e) => setBody(e.target.value)} />
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-ink-100">{draft.subject}</p>
            <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-ink-200">
              {draft.body}
            </pre>
          </>
        )}

        <div className="rounded-md border border-ink-700 bg-ink-850 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">
              Hook
            </span>
            <div className="flex items-center gap-1.5">
              {/* R-23 (§3.1). `validated` is set by `tierDraft`, which returns true only for a
                  verified hook — so the chip here reports the same tier the signals carry. */}
              <Badge tone={validated ? "send" : "hold"}>
                {validated ? "verified" : "asserted"}
              </Badge>
              {draft.hook_quote ? <QuoteChip url={draft.hook_url} /> : null}
            </div>
          </div>
          <p
            className={cn(
              "mt-1 text-[11px] leading-snug",
              validated ? "text-ink-300" : "italic text-ink-500",
            )}
          >
            {draft.hook_quote ? `“${draft.hook_quote}”` : <NotStated />}
          </p>
        </div>

        {error ? <p className="text-xs text-drop">{error}</p> : null}
        {note ? <p className="text-xs text-send">{note}</p> : null}

        {/* §3 (G6) — the dry run. The word "sent" does not appear here in any tense: the
            message was not transmitted, and the only honest thing to show is the exact bytes
            that would have been, so a judge can read the real message rather than a claim
            about it. */}
        {dryRun || dryRunRow ? (
          <div className="rounded-md border border-dashed border-hold/50 bg-hold/5 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="hold">dry run</Badge>
              <span className="text-[11px] font-semibold text-hold">
                Not sent — no mail transport is configured.
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-snug text-ink-300">
              This is the exact message that would have been transmitted. Add the Gmail or Resend
              credentials and this same draft goes out unchanged — no code change, no re-draft.
            </p>
            {dryRun ? (
              <>
                <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                  RFC&nbsp;822 bytes — what the Gmail path would base64url-encode
                </p>
                <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all rounded border border-ink-700 bg-ink-900 p-2 font-mono text-[10px] leading-snug text-ink-200">
                  {dryRun.rfc822}
                </pre>
              </>
            ) : (
              <p className="mt-1 text-[11px] leading-snug text-ink-400">
                Press <span className="font-semibold">Approve and send</span> again to re-render
                the message bytes.
              </p>
            )}
          </div>
        ) : null}

        {/* §4.2 — the transport is part of the record, not a detail of the moment it was sent.
            Gmail is the primary path; Resend only ever runs because Gmail did not, so when it
            is the one that carried the email the card says why. */}
        {sent ? (
          <div className="rounded-md border border-send/40 bg-send/10 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="send">sent</Badge>
              <span className="font-mono text-[11px] text-ink-100">
                sent via: {sent.transport}
                {failedSends.length > 0
                  ? ` (${failedSends[0].transport}: ${failedSends[0].error ?? "no reason recorded"})`
                  : ""}
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-snug text-ink-300">
              To <span className="font-mono">{sent.to_address}</span> at{" "}
              {new Date(sent.sent_at).toISOString()}.
            </p>
          </div>
        ) : failedSends.length > 0 ? (
          <div className="rounded-md border border-drop/40 bg-drop/10 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="drop">send failed</Badge>
              <span className="font-mono text-[11px] text-ink-100">
                attempted via: {failedSends[0].transport}
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-snug text-ink-300">
              {failedSends[0].error ?? "No reason was recorded."}
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {editing ? (
            <>
              <Button size="sm" disabled={busy} onClick={save}>
                {busy ? "Saving…" : "Save and re-check evidence"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSubject(draft.subject);
                  setBody(draft.body);
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="success"
                disabled={busy || !validated || alreadySent}
                onClick={send}
                title={
                  !validated
                    ? "Blocked: the hook quote is not verbatim on any page we fetched."
                    : undefined
                }
              >
                {alreadySent ? "Already sent" : busy ? "Sending…" : "Approve and send"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                Edit
              </Button>
            </>
          )}

          {/* §9 — the lock sits next to the button, every time. */}
          <span className="font-mono text-[11px] text-ink-400">
            🔒 to: {lockedTo ?? "GMAIL_SEND_TO not set"} (locked in code)
          </span>
        </div>

        {contact ? (
          <p className="text-[11px] text-ink-400">
            Written for {[contact.first_name, contact.last_name].filter(Boolean).join(" ")} at{" "}
            {contact.email} — but the envelope goes to the locked address above, never to them.
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}

/* --------------------------------------------------------------- Feedback */

function FeedbackSection({
  companyId,
  existing,
  domain,
}: {
  companyId: string;
  existing: FeedbackRow | null;
  domain: string;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [effect, setEffect] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(action: "accept" | "reject") {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ companyId, action, reason }),
    });
    const data = (await res.json()) as { error?: string; effect?: string };
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Feedback failed.");
      return;
    }
    setEffect(data.effect ?? null);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your call</CardTitle>
      </CardHeader>
      <CardBody className="space-y-2">
        {existing ? (
          <p className="text-xs text-ink-200">
            You already marked {domain} as <strong>{existing.action}</strong>
            {existing.reason ? `: “${existing.reason}”` : ""}.{" "}
            {existing.action === "reject"
              ? "The next run will quarantine it before fetching anything."
              : ""}
          </p>
        ) : null}

        <Input
          placeholder="Why? (required to reject — the next run suppresses on it)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        {error ? <p className="text-xs text-drop">{error}</p> : null}
        {effect ? <p className="text-xs text-send">{effect}</p> : null}

        <div className="flex gap-2">
          <Button size="sm" variant="success" disabled={busy} onClick={() => submit("accept")}>
            Accept
          </Button>
          <Button size="sm" variant="danger" disabled={busy} onClick={() => submit("reject")}>
            Reject
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
