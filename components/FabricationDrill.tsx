"use client";

import { useState } from "react";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle } from "@/components/ui/primitives";
import type { DrillResult } from "@/lib/seed/fabricationDrill";

/**
 * G6 §2 A.1 — the fabrication drill, on a labelled surface.
 *
 * The run-level counter on `/health` keeps reporting what the real run found. This is separate
 * and says so in the words the brief asked for, because a demonstration that could be mistaken
 * for a measurement is worse than no demonstration.
 */
export function FabricationDrill() {
  const [result, setResult] = useState<DrillResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/drill", { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; result?: DrillResult; error?: string };
      if (!res.ok || !data.result) setError(data.error ?? "The drill did not run.");
      else setResult(data.result);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center gap-2">
        <CardTitle>The fabrication drill</CardTitle>
        <Badge tone="hold">fixture</Badge>
      </CardHeader>
      <CardBody className="space-y-2 text-xs">
        <p className="leading-snug text-ink-300">
          Health reports <span className="font-mono">0 fabrications blocked</span>, and that zero
          is honest — every bad quote found on a real run so far was genuine text that failed the
          support test, not invented text. An unfired branch is an unproven one, so this runs the
          shipped tiering functions over a stored fixture and shows the check refusing a quote
          that is not on the page.
        </p>

        <Button size="sm" disabled={busy} onClick={run}>
          {busy ? "Running…" : "Run the fabrication drill"}
        </Button>

        {error ? <p className="text-drop">{error}</p> : null}

        {result ? (
          <div className="space-y-2 pt-1">
            <p className="rounded-md border border-hold/40 bg-hold/10 px-3 py-2 text-[11px] font-semibold leading-snug text-hold">
              This is a stored fixture, not a live company. It exists to show the check firing.
            </p>

            <Field label="Domain">
              <span className="font-mono">{result.domain}</span>
              <span className="ml-2 text-ink-400">
                (.invalid is reserved by RFC 2606 and can never resolve)
              </span>
            </Field>

            <Field label="The page text we actually fetched">
              <span className="italic text-ink-300">“{result.sourceText}”</span>
            </Field>

            <Field label="The quote the model claimed">
              <span className="italic text-drop">“{result.claimedQuote}”</span>
            </Field>

            <Field label="Does that sentence appear in the page text?">
              <Badge tone={result.verbatim ? "send" : "drop"}>
                {result.verbatim ? "yes" : "no — not on any page fetched for this company"}
              </Badge>
            </Field>

            <Field label="Tier assigned by R-23">
              <Badge tone={result.tier === "fabricated" ? "drop" : "hold"}>{result.tier}</Badge>
              {result.tierReason ? (
                <span className="ml-2 text-ink-300">{result.tierReason}</span>
              ) : null}
            </Field>

            <Field label="Points">
              <span className="font-mono text-ink-400 line-through">
                +{result.pointsClaimed} claimed
              </span>
              <span className="ml-2 font-mono font-semibold text-drop">
                {result.pointsAwarded} awarded
              </span>
            </Field>

            <Field label="Does it reach the scoring set at all?">
              <Badge tone={result.reachesScoring ? "hold" : "drop"}>
                {result.reachesScoring ? "yes" : "no — dropped before scoring"}
              </Badge>
              <span className="ml-2 text-ink-400">
                timing score with this signal: {result.timingScoreWithDrill}
              </span>
            </Field>

            <p className="leading-snug text-ink-400">
              A fabricated quote has no page to link to, so it is never rendered as evidence on a
              card. It is counted on Health when it happens on a real run — this drill writes
              nothing, so the counter there is unaffected by pressing this button.
            </p>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-ink-700 bg-ink-850 px-3 py-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">{label}</p>
      <p className="mt-0.5 text-[11px] leading-snug text-ink-100">{children}</p>
    </div>
  );
}
