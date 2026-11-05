"use client";

import * as React from "react";
import Link from "next/link";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Badge,
  Input,
  Textarea,
  Select,
  Switch,
  Slider,
} from "@/components/ui/primitives";
import { RulesOnlyBanner } from "@/components/SiteChrome";
import { SIGNAL_LABEL } from "@/lib/rules/signals";
import { SAMPLE_DOMAINS } from "@/lib/seed/sampleDomains";
import {
  DEFAULT_WEIGHTS,
  DEFAULT_SWITCHES,
  type SignalId,
  type Switches,
  type Weights,
} from "@/lib/types";

/* --------------------------------------------------------------- the shape */

type SignalRow = { signal_id: string; points: number; independence_group: string };

type CompanyCard = {
  id: string;
  domain: string;
  normalized_domain: string;
  status: string;
  stage: string;
  verdict: string | null;
  timing_score: number | null;
  independent_signals: number | null;
  play: string | null;
  verdict_reason: string | null;
  rule_fired: string | null;
  fetches_used: number;
  size_band: string | null;
  cert_status: string | null;
  error: string | null;
  signals: SignalRow[];
  missing_fields: string[];
};

type BoardState = {
  run: { id: string; status: string; domains_submitted: number; duplicates_removed: number };
  weights: Weights;
  switches: Switches;
  companies: CompanyCard[];
  quarantine: { domain: string; reason_code: string; reason_text: string }[];
  cost: { totalUsd: number; calls: number; cacheHits: number; failures: number };
  pending: number;
  done: boolean;
};

const COLUMNS = [
  { verdict: "SEND", label: "Send", tone: "send" as const, blurb: "Worth an email today." },
  { verdict: "HOLD", label: "Hold", tone: "hold" as const, blurb: "Real, but not yet, or not sure." },
  { verdict: "DROP", label: "Drop", tone: "drop" as const, blurb: "Not a fit. The rule says why." },
];

const SLIDERS: { id: SignalId; max: number }[] = [
  { id: "S-01", max: 60 },
  { id: "S-02", max: 60 },
  { id: "S-03", max: 60 },
  { id: "S-04", max: 60 },
  { id: "S-05", max: 60 },
  { id: "S-06", max: 60 },
  { id: "S-07", max: 60 },
];

const USD_TO_INR = 84;

/* ------------------------------------------------------------- the component */

export function Board({ initial, aiAvailable }: { initial: BoardState | null; aiAvailable: boolean }) {
  const [domains, setDomains] = React.useState(SAMPLE_DOMAINS.join("\n"));
  const [weights, setWeights] = React.useState<Weights>(initial?.weights ?? DEFAULT_WEIGHTS);
  const [switches, setSwitches] = React.useState<Switches>(initial?.switches ?? DEFAULT_SWITCHES);
  const [board, setBoard] = React.useState<BoardState | null>(initial);
  const [running, setRunning] = React.useState(false);
  const [progress, setProgress] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState("score");
  const [rerankNote, setRerankNote] = React.useState<string | null>(null);
  const cancelled = React.useRef(false);

  const refresh = React.useCallback(async (runId: string) => {
    const res = await fetch(`/api/run/${runId}`, { cache: "no-store" });
    if (res.ok) setBoard((await res.json()) as BoardState);
  }, []);

  async function start() {
    setError(null);
    setRerankNote(null);
    setRunning(true);
    cancelled.current = false;
    setProgress("Normalising domains…");

    try {
      const res = await fetch("/api/run/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domains, weights, switches }),
      });
      const started = (await res.json()) as {
        runId?: string;
        error?: string;
        queued?: number;
        duplicates_removed?: number;
      };
      if (!res.ok || !started.runId) throw new Error(started.error ?? "Could not start the run.");

      const runId = started.runId;
      await refresh(runId);

      // One domain per request (§7.2): the board fills in row by row and no single handler
      // goes near the serverless timeout.
      let guard = 0;
      for (;;) {
        if (cancelled.current) break;
        if (guard++ > 200) throw new Error("Step loop exceeded 200 iterations; stopping.");

        const stepRes = await fetch("/api/run/step", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ runId }),
        });
        const step = (await stepRes.json()) as {
          done: boolean;
          remaining: number;
          result: { domain: string; verdict: string | null; status: string } | null;
          error?: string;
        };
        if (!stepRes.ok) throw new Error(step.error ?? "A step failed.");

        if (step.result) {
          setProgress(
            `${step.result.domain} → ${step.result.verdict ?? step.result.status} · ${step.remaining} left`,
          );
        }
        await refresh(runId);
        if (step.done) break;
      }
      setProgress(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setProgress(null);
    } finally {
      setRunning(false);
    }
  }

  async function applyWeights() {
    if (!board) return;
    setRerankNote("Re-scoring from stored signals…");
    const res = await fetch("/api/rerank", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runId: board.run.id, weights, switches }),
    });
    const json = (await res.json()) as {
      changes?: { domain: string; from: string | null; to: string }[];
      rescored?: number;
      error?: string;
    };
    if (!res.ok) {
      setRerankNote(json.error ?? "Re-score failed.");
      return;
    }
    await refresh(board.run.id);
    const changes = json.changes ?? [];
    setRerankNote(
      changes.length === 0
        ? `Re-scored ${json.rescored} companies from the database. No verdict changed. Zero fetches, zero AI calls.`
        : `Re-scored ${json.rescored} companies with zero fetches and zero AI calls. Moved: ${changes
            .map((c) => `${c.domain} ${c.from} → ${c.to}`)
            .join(", ")}.`,
    );
  }

  const filtered = React.useMemo(() => {
    const rows = board?.companies ?? [];
    const q = query.trim().toLowerCase();
    const matched = q
      ? rows.filter(
          (c) =>
            c.normalized_domain.includes(q) ||
            (c.verdict_reason ?? "").toLowerCase().includes(q) ||
            (c.rule_fired ?? "").toLowerCase().includes(q) ||
            c.signals.some((s) => s.signal_id.toLowerCase().includes(q)),
        )
      : rows;

    if (sort === "domain") {
      return [...matched].sort((a, b) => a.normalized_domain.localeCompare(b.normalized_domain));
    }
    if (sort === "independence") {
      return [...matched].sort(
        (a, b) => (b.independent_signals ?? 0) - (a.independent_signals ?? 0),
      );
    }
    return matched; // already in board order from the API
  }, [board, query, sort]);

  const weightsDirty =
    board != null && SLIDERS.some(({ id }) => weights[id] !== board.weights[id]);

  return (
    <div className="mx-auto grid max-w-[1500px] gap-5 px-4 py-5 lg:grid-cols-[300px_minmax(0,1fr)]">
      {/* ------------------------------------------------------------ controls */}
      <aside className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Domains</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2">
            <Textarea
              rows={8}
              value={domains}
              onChange={(e) => setDomains(e.target.value)}
              placeholder="one domain per line, or comma separated"
              className="font-mono text-[11px]"
              aria-label="Domains to qualify"
            />
            <div className="flex flex-wrap gap-2">
              <Button onClick={start} disabled={running} size="sm">
                {running ? "Running…" : "Run"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDomains(SAMPLE_DOMAINS.join("\n"))}
                disabled={running}
              >
                Reset to sample 12
              </Button>
              {running ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    cancelled.current = true;
                  }}
                >
                  Stop
                </Button>
              ) : null}
            </div>
            {progress ? (
              <p className="font-mono text-[11px] text-accent-soft" role="status">
                {progress}
              </p>
            ) : null}
            {error ? (
              <p className="rounded border border-drop/40 bg-drop/10 px-2 py-1.5 text-[11px] text-drop">
                {error}
              </p>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Signal weights</CardTitle>
          </CardHeader>
          <CardBody className="space-y-1">
            {SLIDERS.map(({ id, max }) => (
              <Slider
                key={id}
                label={id}
                sublabel={SIGNAL_LABEL[id]}
                value={weights[id]}
                max={max}
                onChange={(v) => setWeights((w) => ({ ...w, [id]: v }))}
              />
            ))}
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <Button
                size="sm"
                variant={weightsDirty ? "primary" : "outline"}
                onClick={applyWeights}
                disabled={!board || running}
              >
                Re-score board
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setWeights(DEFAULT_WEIGHTS)}
                disabled={running}
              >
                Defaults
              </Button>
            </div>
            <p className="pt-1 text-[11px] leading-snug text-ink-400">
              Re-scoring reads the signals already in the database. It makes no fetch and no AI
              call, because the score was never the model&apos;s to decide.
            </p>
            {rerankNote ? (
              <p className="rounded border border-accent/35 bg-accent/10 px-2 py-1.5 text-[11px] text-accent-soft">
                {rerankNote}
              </p>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Switches</CardTitle>
          </CardHeader>
          <CardBody>
            <Switch
              label="strict_icp"
              hint="Drop already-certified companies instead of routing them to the migration play."
              checked={switches.strict_icp}
              onChange={(v) => setSwitches((s) => ({ ...s, strict_icp: v }))}
            />
            <Switch
              label="ai_enabled"
              hint="Off: extraction falls back to keyword matching and no drafts are written. Verdicts still come from the rules engine."
              checked={switches.ai_enabled}
              onChange={(v) => setSwitches((s) => ({ ...s, ai_enabled: v }))}
            />
            <Switch
              label="reader_enabled"
              hint="Off: skip the r.jina.ai tier-2 fallback for thin pages."
              checked={switches.reader_enabled}
              onChange={(v) => setSwitches((s) => ({ ...s, reader_enabled: v }))}
            />
            <Switch
              label="auto_send"
              hint="Off: every send needs a click. Signal never emails anyone on its own."
              checked={switches.auto_send}
              onChange={(v) => setSwitches((s) => ({ ...s, auto_send: v }))}
            />
          </CardBody>
        </Card>
      </aside>

      {/* --------------------------------------------------------------- board */}
      <section className="min-w-0 space-y-4">
        {!aiAvailable || !switches.ai_enabled ? (
          <RulesOnlyBanner
            reason={
              !aiAvailable
                ? "GEMINI_API_KEY is not set. Verdicts, scores and rule IDs still come from the deterministic engine; extraction uses keyword matching and drafts are not generated."
                : undefined
            }
          />
        ) : null}

        {board ? (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by domain, rule ID, signal or reason"
              className="max-w-xs"
              aria-label="Filter companies"
            />
            <Select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort by">
              <option value="score">Sort: score, then independence</option>
              <option value="independence">Sort: independent signals</option>
              <option value="domain">Sort: domain A–Z</option>
            </Select>
            <span className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-400">
              <span>
                {board.run.domains_submitted} submitted ·{" "}
                <span className="text-ink-200">{board.run.duplicates_removed} duplicates removed</span>
              </span>
              <span>
                AI spend{" "}
                <span className="font-mono text-ink-200">
                  ${board.cost.totalUsd.toFixed(4)} / ₹{(board.cost.totalUsd * USD_TO_INR).toFixed(2)}
                </span>{" "}
                over {board.cost.calls} calls, {board.cost.cacheHits} cached
              </span>
              <Link href="/quarantine" className="underline hover:text-ink-100">
                {board.quarantine.length} quarantined
              </Link>
            </span>
          </div>
        ) : null}

        {!board ? <EmptyBoard /> : null}

        {board ? (
          <div className="grid gap-4 md:grid-cols-3">
            {COLUMNS.map((col) => {
              const rows = filtered.filter((c) => c.verdict === col.verdict);
              return (
                <div key={col.verdict} className="min-w-0 space-y-2">
                  <div className="flex items-baseline gap-2">
                    <Badge tone={col.tone}>{col.label}</Badge>
                    <span className="font-mono text-xs text-ink-400">{rows.length}</span>
                    <span className="truncate text-[11px] text-ink-400">{col.blurb}</span>
                  </div>
                  {rows.length === 0 ? (
                    <p className="rounded-md border border-dashed border-ink-700 px-3 py-4 text-[11px] text-ink-400">
                      Nothing in {col.label} for this run.
                    </p>
                  ) : (
                    rows.map((c) => <CompanyTile key={c.id} company={c} />)
                  )}
                </div>
              );
            })}
          </div>
        ) : null}

        {board && board.companies.some((c) => c.status === "error") ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-drop">Companies that errored</CardTitle>
            </CardHeader>
            <CardBody className="space-y-1.5 text-[11px]">
              {board.companies
                .filter((c) => c.status === "error")
                .map((c) => (
                  <p key={c.id}>
                    <span className="font-mono text-ink-200">{c.normalized_domain}</span>{" "}
                    <span className="text-ink-400">{c.error}</span>
                  </p>
                ))}
              <p className="pt-1 text-ink-400">
                One failure never stops the others — the run continues domain by domain.
              </p>
            </CardBody>
          </Card>
        ) : null}
      </section>
    </div>
  );
}

/* ---------------------------------------------------------------- the tile */

function CompanyTile({ company: c }: { company: CompanyCard }) {
  const tone = c.verdict === "SEND" ? "send" : c.verdict === "HOLD" ? "hold" : "drop";

  return (
    <Link href={`/company/${c.id}`} className="block">
      <Card className="transition-colors hover:border-accent/50">
        <CardBody className="space-y-2 pt-3">
          <div className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink-100">
              {c.normalized_domain}
            </span>
            <Badge tone={tone}>{c.timing_score ?? 0}</Badge>
          </div>

          <p className="text-[11px] leading-snug text-ink-300">
            {c.verdict_reason ?? "No reason recorded."}
          </p>

          <div className="flex flex-wrap items-center gap-1">
            {c.rule_fired ? <Badge tone="neutral">{c.rule_fired}</Badge> : null}
            {c.play === "migration" ? <Badge tone="accent">migration</Badge> : null}
            {c.signals
              .filter((s) => s.points > 0)
              .map((s) => (
                <Badge key={s.signal_id} tone="neutral" title={SIGNAL_LABEL[s.signal_id as SignalId]}>
                  {s.signal_id}
                </Badge>
              ))}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-ink-400">
            <span>{c.independent_signals ?? 0} independent</span>
            <span>{c.fetches_used}/4 extra fetches</span>
            {c.missing_fields.length > 0 ? (
              <span className="text-hold">missing: {c.missing_fields.join(", ")}</span>
            ) : null}
          </div>
        </CardBody>
      </Card>
    </Link>
  );
}

/* --------------------------------------------------------------- empty state */

/** T-26 — before any run, the page still says what it is and what to press. */
function EmptyBoard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>No run yet</CardTitle>
      </CardHeader>
      <CardBody className="space-y-3 text-xs leading-relaxed text-ink-300">
        <p>
          Signal reads a company&apos;s own website, decides whether they are worth contacting
          today, and drafts the email if they are. Every claim on every card is a verbatim quote
          with a live link, or the literal words <span className="font-mono">not stated</span>.
        </p>
        <p>
          The twelve sample domains are already in the box on the left. Press{" "}
          <span className="font-semibold text-ink-100">Run</span> and the board fills in one
          company at a time.
        </p>
        <ul className="space-y-1 text-ink-400">
          <li>
            <span className="font-semibold text-ink-200">Send</span> — a timing signal fired from
            two independent sources and there is a named contact.
          </li>
          <li>
            <span className="font-semibold text-ink-200">Hold</span> — real, but early, or a field
            the verdict needs is still unknown.
          </li>
          <li>
            <span className="font-semibold text-ink-200">Drop</span> — out of profile, with the
            rule ID that said so.
          </li>
        </ul>
        <p className="text-ink-400">
          Nothing is emailed without a click, and the recipient is fixed in code — see the lock in
          the footer.
        </p>
      </CardBody>
    </Card>
  );
}
