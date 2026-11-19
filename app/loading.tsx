/**
 * Every page here is `force-dynamic`, because a board that renders stale verdicts would be worse
 * than one that is slow. So Next shows this implicit Suspense boundary on *every* navigation,
 * and it used to appear instantly — a skeleton flashing on a click that resolved in 80ms reads
 * as jank, not as feedback.
 *
 * Two things changed. The data underneath got genuinely fast: the function now runs in the same
 * region as the database (`vercel.json`), and the 47-statement schema replay that ran on every
 * cold start is fingerprinted and skipped (`lib/db/client.ts`). And this component now waits
 * 400ms before it becomes visible, so a navigation that beats that threshold never shows a
 * skeleton at all — the page simply appears. Only a genuinely slow start, a cold function or a
 * suspended database, gets this screen, which is the only time it was ever useful.
 *
 * The delay is CSS rather than a timer because this is a server component: no state, no effect,
 * no hydration needed to decide not to paint.
 */
export default function Loading() {
  return (
    <>
      <style>{`
        @keyframes signal-loading-in { from { opacity: 0 } to { opacity: 1 } }
        .signal-loading {
          opacity: 0;
          animation: signal-loading-in 140ms ease-out 400ms forwards;
        }
        @media (prefers-reduced-motion: reduce) {
          .signal-loading { animation-duration: 1ms; }
        }
      `}</style>

      <div className="signal-loading mx-auto max-w-[1100px] px-4 py-6">
        <div className="rounded-md border border-ink-700 bg-ink-850 px-4 py-4">
          <div className="flex items-center gap-2.5">
            <span className="h-3 w-3 animate-pulse rounded-full bg-accent" />
            <span className="text-sm font-medium text-ink-100">Reading the database…</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-ink-400">
            Signal reads every verdict, quote and loop trace from Postgres on each request, so
            nothing on screen is ever a cached guess. This screen only appears when that takes
            longer than it should — usually the first request after a quiet period, while the
            serverless function and the database connection start cold.
          </p>

          <div className="mt-4 space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-md border border-ink-800 bg-ink-900 px-3 py-2.5">
                <div className="h-2.5 w-32 animate-pulse rounded bg-ink-700" />
                <div className="mt-2 h-2 w-full animate-pulse rounded bg-ink-800" />
                <div className="mt-1.5 h-2 w-3/5 animate-pulse rounded bg-ink-800" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
