"use client";

import { useState } from "react";
import { Badge, Card, CardBody, CardHeader, CardTitle, Input } from "@/components/ui/primitives";
import { USD_TO_INR } from "@/lib/ai/model";
import { cn } from "@/lib/utils";

/**
 * §6.4 — "What this run cost, and what it saved".
 *
 * The panel is split down the middle on purpose, and the split is the point. Everything above
 * the line is read out of the run's own ledger and is a fact. Everything below it is arithmetic
 * on an assumption the reader supplies, and is labelled an estimate wherever it appears.
 *
 * A client component only because the baseline is editable: §6.4 requires the assumption to be
 * visible and changeable on screen, which means the saved-time figures have to recompute without
 * a round trip. Nothing here is persisted — the baseline is the reader's own guess about their
 * own process, and storing it would start making a borrowed number look like a measured one.
 */

export const DEFAULT_BASELINE_MINUTES = 15;

/** The sentence §6.4 requires verbatim. Exported so a test can assert it survives edits. */
export const ESTIMATE_DISCLAIMER =
  "The measured numbers above come from the run's own ledger. The saved-time figure is an estimate built on the baseline you can edit — it is an assumption, not a measurement.";

export type EconomicsInput = {
  totalUsd: number;
  calls: number;
  cacheHits: number;
  hunterUsed: number | null;
  hunterRemaining: number | null;
  scored: number;
  send: number;
  elapsedMs: number | null;
};

function money(usd: number): string {
  return `$${usd.toFixed(4)} · ₹${(usd * USD_TO_INR).toFixed(2)}`;
}

function duration(ms: number | null): string {
  if (ms === null) return "still running";
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function EconomicsPanel({ data }: { data: EconomicsInput }) {
  const [baseline, setBaseline] = useState(DEFAULT_BASELINE_MINUTES);

  const hitRate = data.calls > 0 ? (data.cacheHits / data.calls) * 100 : null;
  const perCompany = data.scored > 0 ? data.totalUsd / data.scored : null;
  const perSend = data.send > 0 ? data.totalUsd / data.send : null;

  // Estimated. Every figure below this line depends on `baseline`, which is a guess.
  const minutesSaved = data.scored * baseline;
  const hoursSaved = minutesSaved / 60;
  const costPerHourSaved = hoursSaved > 0 ? data.totalUsd / hoursSaved : null;

  return (
    <Card>
      <CardHeader className="flex items-center gap-2">
        <CardTitle>What this run cost, and what it saved</CardTitle>
        <Badge tone="neutral">latest run</Badge>
      </CardHeader>
      <CardBody className="space-y-3 text-xs">
        <section>
          <p className="mb-1.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-ink-400">
            Measured <Badge tone="send">from the ledger</Badge>
          </p>
          <div className="space-y-1">
            <Line label="AI spend" value={money(data.totalUsd)} />
            <Line
              label="Model calls"
              value={`${data.calls} · ${data.cacheHits} served from cache${
                hitRate === null ? "" : ` (${hitRate.toFixed(0)}%)`
              }`}
            />
            <Line
              label="Hunter credits"
              value={
                data.hunterUsed === null
                  ? "no key configured — seeded contacts used"
                  : `${data.hunterUsed} used · ${data.hunterRemaining ?? "?"} remaining`
              }
            />
            <Line label="Companies scored" value={String(data.scored)} />
            <Line
              label="Cost per company qualified"
              value={perCompany === null ? "no companies scored" : money(perCompany)}
            />
            <Line
              label="Cost per Send"
              value={
                perSend === null
                  ? "no Sends on this run — the cost is real and the number of Sends is zero"
                  : money(perSend)
              }
            />
            <Line label="Wall-clock elapsed" value={duration(data.elapsedMs)} />
          </div>
        </section>

        <section className="rounded-md border border-dashed border-hold/30 bg-ink-900 px-3 py-2">
          <p className="mb-1.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-ink-400">
            Estimated <Badge tone="hold">estimate</Badge>
          </p>

          <label className="flex flex-wrap items-center gap-2 pb-2">
            <span className="text-ink-300">Assume qualifying one company by hand takes</span>
            <Input
              type="number"
              min={1}
              max={240}
              value={String(baseline)}
              onChange={(e) => setBaseline(Math.max(1, Number(e.target.value) || 1))}
              className="w-20"
            />
            <span className="text-ink-300">minutes</span>
          </label>

          <div className="space-y-1">
            <Line
              label="Hours saved this run"
              value={`${hoursSaved.toFixed(1)} h (${data.scored} companies at ${baseline} min each)`}
              estimated
            />
            <Line
              label="Cost per hour saved"
              value={costPerHourSaved === null ? "no companies scored" : money(costPerHourSaved)}
              estimated
            />
          </div>

          <p className="mt-2 border-t border-ink-800 pt-2 text-[11px] leading-snug text-hold">
            {ESTIMATE_DISCLAIMER}
          </p>
        </section>
      </CardBody>
    </Card>
  );
}

function Line({ label, value, estimated }: { label: string; value: string; estimated?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-ink-400">
        {label}
        {estimated ? <span className="ml-1 text-[10px] text-hold">(estimate)</span> : null}
      </span>
      <span
        className={cn(
          "text-right font-mono text-[11px]",
          estimated ? "text-hold" : "text-ink-100",
        )}
      >
        {value}
      </span>
    </div>
  );
}
