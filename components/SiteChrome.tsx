import Link from "next/link";
import { resolveModelId } from "@/lib/ai/model";
import { degradations, sendToOrNull, capability } from "@/lib/env";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Board" },
  { href: "/quarantine", label: "Quarantine" },
  { href: "/health", label: "Health" },
  { href: "/selftest", label: "Self-test" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-ink-700 bg-ink-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1500px] items-center gap-4 px-4 py-2.5">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded bg-accent text-[11px] font-bold text-white">
            S
          </span>
          <span className="text-sm font-semibold tracking-tight">Signal</span>
        </Link>
        <span className="hidden text-[11px] text-ink-400 sm:inline">
          outbound qualification &amp; drafting
        </span>
        <nav className="ml-auto flex items-center gap-0.5">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="rounded px-2.5 py-1 text-xs text-ink-300 transition-colors hover:bg-ink-800 hover:text-ink-100"
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

/**
 * Fail-safe banners (§8 layer 2). Every missing capability is named on screen with the exact
 * variable that would restore it — the system never degrades silently.
 */
export function DegradationBanners() {
  const items = degradations();
  if (items.length === 0) return null;

  return (
    <div className="mx-auto max-w-[1500px] space-y-1.5 px-4 pt-3">
      {items.map((d) => (
        <div
          key={d.variable}
          className={cn(
            "flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-md border px-3 py-2 text-xs",
            d.level === "error"
              ? "border-drop/40 bg-drop/10 text-drop"
              : "border-hold/40 bg-hold/10 text-hold",
          )}
        >
          <span className="font-mono font-semibold">{d.variable}</span>
          <span className="opacity-60">not set —</span>
          <span className="min-w-0 flex-1 text-ink-300">{d.effect}</span>
        </div>
      ))}
    </div>
  );
}

/** The orange rules-only banner required by §5.5 and T-23. */
export function RulesOnlyBanner({ reason }: { reason?: string }) {
  return (
    <div className="rounded-md border border-hold/40 bg-hold/10 px-3 py-2 text-xs text-hold">
      <span className="font-semibold">rules-only</span>{" "}
      <span className="text-ink-300">
        {reason ??
          "AI is off. Verdicts, scores and rule IDs still come from the deterministic engine; extraction uses keyword matching and drafts are not generated."}
      </span>
    </div>
  );
}

export function SiteFooter() {
  const modelId = resolveModelId();
  const to = sendToOrNull();

  return (
    <footer className="mt-10 border-t border-ink-700 py-4">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-5 gap-y-1.5 px-4 text-[11px] text-ink-400">
        <span>
          model{" "}
          <span className="font-mono text-ink-300" data-testid="footer-model-id">
            {modelId}
          </span>
        </span>
        <span>
          AI{" "}
          <span className="font-mono text-ink-300">
            {capability.ai() ? "enabled" : "unavailable — rules-only"}
          </span>
        </span>
        <span>
          to:{" "}
          <span className="font-mono text-ink-300">{to ?? "unset"}</span>{" "}
          <span className="opacity-70">(locked in code)</span>
        </span>
        <span className="ml-auto">All AI tasks run on Gemini Flash. The Claude API is not used.</span>
      </div>
    </footer>
  );
}
