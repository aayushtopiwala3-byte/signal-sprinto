"use client";

/**
 * The last resort: an error thrown in the root layout itself, which `app/error.tsx` cannot
 * catch because the layout is what renders it. This replaces the whole document, so it carries
 * its own `<html>` and `<body>` and cannot rely on any styling the layout would have provided —
 * which is why the styles here are inline rather than Tailwind classes.
 *
 * G4 F8 again: a blank screen is the one outcome that is not allowed, and a failure in the
 * layout is precisely when a blank screen is most likely.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: "#0b0d10",
          color: "#e6e8eb",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          padding: "40px 16px",
        }}
      >
        <div
          style={{
            maxWidth: 680,
            margin: "0 auto",
            border: "1px solid rgba(239,68,68,0.4)",
            background: "rgba(239,68,68,0.08)",
            borderRadius: 6,
            padding: "16px 18px",
          }}
        >
          <h1 style={{ fontSize: 14, margin: 0, color: "#f87171" }}>
            Signal could not start this page.
          </h1>
          <p style={{ fontSize: 12, lineHeight: 1.7, marginTop: 10 }}>
            This failed in the application shell, which usually means a missing required
            environment variable or an unreachable database. <code>GMAIL_SEND_TO</code> is the one
            variable Signal refuses to start without, and it is never defaulted — a silent default
            there would mean sending mail to an address nobody chose.
          </p>
          <p style={{ fontSize: 12, lineHeight: 1.7, color: "#9aa3ad" }}>
            Nothing was half-written. The run commits one company at a time.
          </p>
          {error.digest ? (
            <p style={{ fontSize: 10, fontFamily: "ui-monospace, monospace", color: "#6b7480" }}>
              server digest: {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 10,
              borderRadius: 4,
              border: "1px solid #39414b",
              background: "#1a1f26",
              color: "#e6e8eb",
              padding: "6px 12px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
