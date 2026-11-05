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
import { NOT_STATED, type EvidenceMap, type SignalId } from "@/lib/types";
import type {
  ContactDbRow,
  DraftRow,
  FeedbackRow,
  LoopTraceRow,
  PainPointRow,
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
};

type FetchView = {
  url: string;
  tier: number;
  ok: boolean;
  status_code: number | null;
  word_count: number;
  error: string | null;
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
  alreadySent: boolean;
  feedback: FeedbackRow | null;
  lockedTo: string | null;
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
        alreadySent={props.alreadySent}
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
}: {
  company: CompanyView;
  whatWouldChangeIt: string | null;
}) {
  const e = company.evidence;
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

        {whatWouldChangeIt ? (
          <div className="rounded-md border border-ink-700 bg-ink-850 px-3 py-2">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-400">
              What would change it
            </p>
            <p className="text-xs leading-relaxed text-ink-200">{whatWouldChangeIt}</p>
          </div>
        ) : company.verdict === "SEND" ? (
          <p className="text-xs text-send">Nothing is holding this back. It is ready to send.</p>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2">
          <EvidenceFact
            label="B2B SaaS"
            value={e.is_b2b_saas === null ? null : e.is_b2b_saas ? "yes" : "no"}
            quote={e.is_b2b_saas_evidence}
          />
          <EvidenceFact label="Headcount band" value={e.size_band} quote={e.size_band_evidence} />
          <EvidenceFact
            label="Certification"
            value={e.cert_status}
            quote={e.cert_status_evidence}
          />
          <EvidenceFact
            label="Pressure signals"
            value={e.pressure_signals?.length ? e.pressure_signals.join(", ") : null}
            quote={null}
          />
        </div>

        {company.missing_fields.length > 0 ? (
          <p className="text-xs text-hold">
            Still {NOT_STATED} after {company.fetches_used} extra fetches:{" "}
            <span className="font-mono">{company.missing_fields.join(", ")}</span>. Handed off
            rather than guessed.
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}

function EvidenceFact({
  label,
  value,
  quote,
}: {
  label: string;
  value: string | null;
  quote: { quote: string; url: string } | null;
}) {
  return (
    <div className="rounded-md border border-ink-700 bg-ink-850 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">
          {label}
        </span>
        {quote ? <QuoteChip url={quote.url} /> : <AiChip />}
      </div>
      <p className="mt-0.5 font-mono text-xs text-ink-100">{value ?? <NotStated />}</p>
      {quote ? (
        <p className="mt-1 border-l-2 border-ink-700 pl-2 text-[11px] leading-snug text-ink-300">
          “{quote.quote}”
        </p>
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
          signals.map((s) => (
            <div
              key={s.id}
              className="rounded-md border border-ink-700 bg-ink-850 px-3 py-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={s.points > 0 ? "accent" : "neutral"}>{s.signal_id}</Badge>
                <span className="text-xs text-ink-100">
                  {SIGNAL_LABEL[s.signal_id as SignalId] ?? s.signal_id}
                </span>
                <span className="font-mono text-xs text-accent-soft">+{s.points}</span>
                <Badge tone="neutral">{s.independence_group}</Badge>
                {s.quote ? <QuoteChip url={s.source_url} /> : null}
              </div>
              <p className="mt-1 border-l-2 border-ink-700 pl-2 text-[11px] leading-snug text-ink-300">
                {s.quote ? `“${s.quote}”` : <NotStated />}
              </p>
            </div>
          ))
        )}
      </CardBody>
    </Card>
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
                      <Badge tone={t.chosen_by === "ai" ? "accent" : "neutral"}>
                        {t.chosen_by}
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
                <Badge tone={f.ok ? "send" : "drop"}>tier {f.tier}</Badge>
                <span className="break-all font-mono text-[11px] text-ink-300">{f.url}</span>
                <span className="text-[11px] text-ink-400">
                  {f.status_code ?? "no status"} · {f.word_count} words
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
          pains.map((p) => (
            <div key={p.id} className="rounded-md border border-ink-700 bg-ink-850 px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs leading-relaxed text-ink-100">{p.text}</p>
                {p.validated ? <QuoteChip url={p.source_url} /> : null}
              </div>
              <p className="mt-1 border-l-2 border-ink-700 pl-2 text-[11px] leading-snug text-ink-300">
                {p.validated && p.quote ? `“${p.quote}”` : <NotStated />}
              </p>
            </div>
          ))
        )}
      </CardBody>
    </Card>
  );
}

/* ----------------------------------------------------------------- 6. Draft */

function DraftSection({
  draft,
  lockedTo,
  alreadySent,
  contact,
}: {
  draft: DraftRow | null;
  lockedTo: string | null;
  alreadySent: boolean;
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
    };
    setBusy(false);
    if (!res.ok || !data.ok) {
      setError(data.blocked_reason ?? data.error ?? "Send failed.");
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
            {draft.hook_quote ? <QuoteChip url={draft.hook_url} /> : null}
          </div>
          <p className="mt-1 text-[11px] leading-snug text-ink-300">
            {draft.hook_quote ? `“${draft.hook_quote}”` : <NotStated />}
          </p>
        </div>

        {error ? <p className="text-xs text-drop">{error}</p> : null}
        {note ? <p className="text-xs text-send">{note}</p> : null}

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
