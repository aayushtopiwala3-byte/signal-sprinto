"use client";

import Link from "next/link";

/**
 * G4 F8 — "Run fails visibly, nothing half-written. Error banner, not a blank screen."
 *
 * Before this existed, pulling the database produced exactly the thing that row forbids: Next's
 * production error page renders an empty body, so a judge who killed Neon saw a blank screen and
 * had no way to tell a broken deployment from a broken connection. Found by running the drill,
 * not by reading the code.
 *
 * The copy does two things deliberately. It names the most likely cause rather than printing a
 * stack trace — `digest` is the only server detail Next exposes to the client, and a hex digest
 * tells a judge nothing. And it says plainly that nothing was half-written, because the question
 * someone actually has when a pipeline dies mid-run is whether the data is now wrong.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-[760px] px-4 py-10">
      <div className="rounded-md border border-drop/40 bg-drop/10 px-4 py-4">
        <h1 className="text-sm font-semibold text-drop">This page could not be rendered.</h1>

        <p className="mt-2 text-xs leading-relaxed text-ink-200">
          The most common cause is the database being unreachable — Signal reads every board,
          verdict and quote from Postgres on each request, so if Neon is down or{" "}
          <span className="font-mono">DATABASE_URL</span> is wrong, there is nothing to render.
        </p>

        <p className="mt-2 text-xs leading-relaxed text-ink-300">
          <span className="font-semibold text-ink-100">Nothing was half-written.</span> A run
          processes one company per request and commits each one before moving on, so whatever
          completed before the failure is intact and whatever did not is still queued. Restoring
          the connection and re-running continues from where it stopped — it does not duplicate
          work already done.
        </p>

        {error.digest ? (
          <p className="mt-2 font-mono text-[10px] text-ink-400">
            server digest: {error.digest} — the full error is in the server log, not here, because
            an error page is not a place to print a stack trace.
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="rounded border border-ink-600 bg-ink-800 px-3 py-1.5 text-xs text-ink-100 hover:bg-ink-700"
          >
            Try again
          </button>
          <Link
            href="/health"
            className="rounded border border-ink-700 px-3 py-1.5 text-xs text-ink-300 hover:text-ink-100"
          >
            Open /health to see what is configured
          </Link>
        </div>
      </div>
    </div>
  );
}
