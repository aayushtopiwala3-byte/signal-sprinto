"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Input,
  NotStated,
  Textarea,
} from "@/components/ui/primitives";
import {
  REPLY_INTENTS,
  actionFor,
  type ReplyAction,
  type ReplyIntent,
} from "@/lib/rules/replyIntent";
import type { OutreachStateRow, ReplyRow } from "@/lib/db/queries";
import { cn } from "@/lib/utils";
import { EMPTY_STATE_REPLIES } from "@/lib/ui/emptyStates";

/**
 * §6.3 — the second human checkpoint.
 *
 * The shape of this page is the argument it makes: paste, see what the model read, see what the
 * rules would therefore do, and only then confirm. The classification and the action are shown
 * together and separately — the model's reading on one side, the rule it triggers on the other —
 * so it is visible that the model did not choose the consequence.
 *
 * Nothing is applied by classifying. The human can also overrule the intent outright, which is
 * why the selector is live rather than a label: the model is a suggestion at every point.
 */

const INTENT_LABEL: Record<ReplyIntent, string> = {
  interested: "They want to talk",
  not_now: "Right company, wrong time",
  wrong_person: "Right company, wrong person",
  not_interested: "They do not want this",
  unsubscribe: "They asked not to be contacted again",
  unclear: "Cannot tell",
};

type Classification = {
  domain: string;
  model: { intent: ReplyIntent | null; confidence: number; quote: string | null; unavailable?: string };
  intent: ReplyIntent;
  downgraded: boolean;
  downgrade_reason: string | null;
  action: ReplyAction;
};

export function Replies({
  companies,
  history,
  state,
}: {
  companies: { id: string; domain: string; verdict: string | null }[];
  history: ReplyRow[];
  state: OutreachStateRow[];
}) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [result, setResult] = useState<Classification | null>(null);
  const [chosen, setChosen] = useState<ReplyIntent | null>(null);
  const [typed, setTyped] = useState("");

  // The action shown is always derived from the intent currently selected, not from the one the
  // model returned — overruling the model has to change the consequence on screen immediately.
  const effective: ReplyIntent | null = chosen ?? result?.intent ?? null;
  const action = effective ? actionFor(effective) : null;

  async function classify() {
    setBusy(true);
    setError(null);
    setNote(null);
    setResult(null);
    setChosen(null);
    setTyped("");
    try {
      const res = await fetch("/api/reply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "classify", companyId, reply }),
      });
      const data = (await res.json()) as Classification & { error?: string };
      if (!res.ok) setError(data.error ?? "Could not read that reply.");
      else setResult(data);
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!effective) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/reply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "apply",
          companyId,
          reply,
          intent: effective,
          confirmation: typed || null,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        applied?: boolean;
        rule?: string;
        note?: string | null;
      };
      if (!res.ok) {
        setError(data.error ?? "Could not apply that.");
      } else {
        setNote(
          data.applied
            ? `${data.rule} applied.${data.note ? ` ${data.note}` : ""}`
            : (data.note ?? `${data.rule} made no change.`),
        );
        setResult(null);
        setReply("");
        setTyped("");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1100px] space-y-4 px-4 py-4">
      <header>
        <h1 className="text-lg font-semibold tracking-tight">Replies</h1>
        <p className="mt-0.5 text-xs text-ink-400">
          Paste a reply. The model reads it; the rules decide what happens; you confirm before
          anything is applied.
        </p>
      </header>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>1 · The reply</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2">
            {companies.length === 0 ? (
              <p className="text-xs text-ink-400">
                {EMPTY_STATE_REPLIES}
              </p>
            ) : (
              <>
                <label className="block text-[11px] text-ink-400">
                  Company
                  <select
                    value={companyId}
                    onChange={(e) => setCompanyId(e.target.value)}
                    className="mt-1 h-9 w-full rounded-md border border-ink-700 bg-ink-850 px-2 text-sm text-ink-100"
                  >
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.domain}
                        {c.verdict ? ` — ${c.verdict}` : ""}
                      </option>
                    ))}
                  </select>
                </label>

                <Textarea
                  rows={10}
                  value={reply}
                  placeholder="Paste the reply exactly as it arrived, signature and all."
                  onChange={(e) => setReply(e.target.value)}
                />

                <Button size="sm" disabled={busy || reply.trim().length === 0} onClick={classify}>
                  {busy ? "Reading…" : "Read this reply"}
                </Button>
                <p className="text-[11px] leading-snug text-ink-400">
                  Reading changes nothing. It shows you what would happen.
                </p>
              </>
            )}
            {error ? <p className="text-xs text-drop">{error}</p> : null}
            {note ? <p className="text-xs text-send">{note}</p> : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="flex items-center gap-2">
            <CardTitle>2 · What it means, and what that does</CardTitle>
            {action ? <Badge tone="accent">{action.rule}</Badge> : null}
          </CardHeader>
          <CardBody className="space-y-3">
            {!result ? (
              <p className="text-xs text-ink-400">
                Nothing read yet. The model&apos;s reading and the rule it triggers will appear
                here, side by side, before anything is applied.
              </p>
            ) : (
              <>
                <div className="rounded-md border border-ink-700 bg-ink-850 px-3 py-2">
                  <p className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                    The model read it as <Badge tone="neutral">AI-5</Badge>
                  </p>
                  {result.model.unavailable ? (
                    <p className="text-[11px] leading-snug text-hold">
                      No model was available ({result.model.unavailable}), so there is no reading
                      to show. Choose below.
                    </p>
                  ) : (
                    <>
                      <p className="text-xs text-ink-100">
                        {result.model.intent ? INTENT_LABEL[result.model.intent] : <NotStated />}{" "}
                        <span className="font-mono text-[11px] text-ink-400">
                          {result.model.intent} · confidence{" "}
                          {result.model.confidence.toFixed(2)}
                        </span>
                      </p>
                      <p className="mt-1 border-l-2 border-ink-700 pl-2 text-[11px] italic leading-snug text-ink-300">
                        {result.model.quote ? `“${result.model.quote}”` : <NotStated />}
                      </p>
                    </>
                  )}
                </div>

                {result.downgraded ? (
                  <div className="rounded-md border border-dashed border-hold/40 bg-hold/5 px-3 py-2">
                    <p className="text-[11px] leading-snug text-hold">
                      <span className="font-semibold">Overruled in code</span> —{" "}
                      {result.downgrade_reason}. Forced to <span className="font-mono">unclear</span>
                      , which does nothing on its own.
                    </p>
                  </div>
                ) : null}

                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                    Your call
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {REPLY_INTENTS.map((i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setChosen(i);
                          setTyped("");
                        }}
                        className={cn(
                          "rounded border px-2 py-1 text-[11px] transition-colors",
                          effective === i
                            ? "border-accent bg-accent/15 text-ink-100"
                            : "border-ink-700 bg-ink-850 text-ink-400 hover:text-ink-200",
                        )}
                      >
                        {INTENT_LABEL[i]}
                        <span className="ml-1 font-mono text-[10px] opacity-60">{i}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {action ? (
                  <div
                    className={cn(
                      "rounded-md border px-3 py-2",
                      action.requiresTypedConfirmation
                        ? "border-drop/40 bg-drop/10"
                        : action.automatic
                          ? "border-accent/40 bg-accent/5"
                          : "border-ink-700 bg-ink-850",
                    )}
                  >
                    <p className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                      {action.rule} would
                      {action.requiresTypedConfirmation ? (
                        <Badge tone="drop">irreversible</Badge>
                      ) : null}
                    </p>
                    <p className="text-xs leading-relaxed text-ink-100">{action.summary}</p>

                    {action.requiresTypedConfirmation ? (
                      <div className="mt-2 space-y-1.5">
                        <p className="text-[11px] leading-snug text-drop">
                          Type{" "}
                          <span className="font-mono font-semibold">
                            {action.confirmationPhrase}
                          </span>{" "}
                          to confirm. There is no undo for this, here or anywhere else in the
                          interface.
                        </p>
                        <Input
                          value={typed}
                          onChange={(e) => setTyped(e.target.value)}
                          placeholder={action.confirmationPhrase}
                        />
                      </div>
                    ) : null}

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant={action.requiresTypedConfirmation ? "danger" : "success"}
                        disabled={
                          busy ||
                          action.effect === "none" ||
                          (action.requiresTypedConfirmation &&
                            typed.trim() !== action.confirmationPhrase)
                        }
                        onClick={apply}
                      >
                        {busy ? "Applying…" : `Confirm — apply ${action.rule}`}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setResult(null)}>
                        Cancel
                      </Button>
                    </div>

                    {action.effect === "none" ? (
                      <p className="mt-1.5 text-[11px] leading-snug text-ink-400">
                        R-55 has nothing to apply. Pick a different reading above if one of them
                        is right, or leave this reply alone.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>What replies have changed</CardTitle>
        </CardHeader>
        <CardBody className="space-y-2">
          {state.length === 0 ? (
            <p className="text-xs text-ink-400">
              No reply has changed a domain&apos;s state yet.
            </p>
          ) : (
            state.map((s) => (
              <div
                key={s.domain}
                className="flex flex-wrap items-baseline gap-2 rounded-md border border-ink-700 bg-ink-850 px-3 py-2 text-[11px]"
              >
                <Badge tone={s.kind === "block" ? "drop" : s.kind === "won" ? "send" : "hold"}>
                  {s.kind}
                </Badge>
                <span className="font-mono text-ink-100">{s.domain}</span>
                <span className="font-mono text-[10px] text-ink-400">{s.rule}</span>
                <span className="min-w-0 flex-1 text-ink-300">{s.reason}</span>
                <span className="text-ink-400">
                  {s.until
                    ? `until ${new Date(s.until).toISOString().slice(0, 10)}`
                    : "no end date"}
                </span>
              </div>
            ))
          )}

          {history.length > 0 ? (
            <details className="mt-2 rounded-md border border-ink-700 bg-ink-850">
              <summary className="cursor-pointer select-none px-3 py-2 text-[11px] text-ink-300 marker:text-ink-500">
                Every reply read ({history.length})
              </summary>
              <div className="space-y-1 border-t border-ink-700 px-3 py-2">
                {history.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-baseline gap-2 text-[11px]">
                    <span className="font-mono text-ink-200">{r.domain}</span>
                    <span className="font-mono text-[10px] text-accent-soft">{r.rule_fired}</span>
                    <span className="text-ink-400">{r.intent}</span>
                    <Badge tone={r.applied ? "send" : "neutral"}>
                      {r.applied ? "applied" : "not applied"}
                    </Badge>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}
