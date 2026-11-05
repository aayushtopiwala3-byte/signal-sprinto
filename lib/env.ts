/**
 * Startup environment contract.
 *
 * §10 requires a named failure for a missing variable. T-25/T-26 require the app to start and
 * run rules-only with no Gemini key. Both hold because the list is split: exactly one variable
 * is fatal, and every other absence becomes a named, on-screen degradation. Nothing defaults
 * silently.
 */

export type Degradation = {
  /** The env var that is missing. */
  variable: string;
  /** What stops working, in the user's words. */
  effect: string;
  /** Banner severity on screen. */
  level: "warn" | "error";
};

export class MissingEnvError extends Error {
  constructor(variable: string, purpose: string) {
    super(
      `Signal cannot start: required environment variable ${variable} is not set. ` +
        `It is required because ${purpose} ` +
        `Add it to .env.local for local development or to the Vercel project settings for production. ` +
        `See .env.example for the full list.`,
    );
    this.name = "MissingEnvError";
  }
}

const read = (name: string): string | null => {
  const raw = process.env[name];
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : trimmed;
};

/**
 * The locked outbound recipient (§2.2). Server-only, read at call time, never defaulted.
 * This is the single hard-required variable: a silent default here would mean sending mail
 * to an address nobody chose, which is the one unsafe default in the system.
 */
export function requireSendTo(): string {
  const value = read("GMAIL_SEND_TO");
  if (!value) {
    throw new MissingEnvError(
      "GMAIL_SEND_TO",
      "it is the hardcoded outbound recipient and the app must never fall back to a guessed address.",
    );
  }
  return value;
}

/** Non-throwing read of the locked recipient, for rendering the lock label before any send. */
export function sendToOrNull(): string | null {
  return read("GMAIL_SEND_TO");
}

export const env = {
  databaseUrl: () => read("DATABASE_URL"),
  geminiApiKey: () => read("GEMINI_API_KEY"),
  openRouterApiKey: () => read("OPENROUTER_API_KEY"),
  hunterApiKey: () => read("HUNTER_API_KEY"),
  googleClientId: () => read("GOOGLE_CLIENT_ID"),
  googleClientSecret: () => read("GOOGLE_CLIENT_SECRET"),
  googleRefreshToken: () => read("GOOGLE_REFRESH_TOKEN"),
  resendApiKey: () => read("RESEND_API_KEY"),
  emailFrom: () => read("EMAIL_FROM"),
  siteUrl: () => read("NEXT_PUBLIC_SITE_URL"),
  costCeilingUsd: () => {
    const raw = read("AI_COST_CEILING_USD");
    if (!raw) return 1.0;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1.0;
  },
};

export const capability = {
  /** Gemini direct, or OpenRouter as the Gemini transport fallback. */
  ai: () => env.geminiApiKey() !== null || env.openRouterApiKey() !== null,
  hunter: () => env.hunterApiKey() !== null,
  gmail: () =>
    env.googleClientId() !== null &&
    env.googleClientSecret() !== null &&
    env.googleRefreshToken() !== null,
  resend: () => env.resendApiKey() !== null && env.emailFrom() !== null,
  /** False means the in-memory PGlite driver is active and nothing survives a restart. */
  durableDb: () => env.databaseUrl() !== null,
};

/**
 * Everything currently degraded, for the banners. Order is worst-first so the UI can render
 * the list as-is.
 */
export function degradations(): Degradation[] {
  const out: Degradation[] = [];

  if (!capability.durableDb()) {
    out.push({
      variable: "DATABASE_URL",
      effect:
        "Running on an in-memory PGlite database. Runs are not persisted and will disappear on restart. Fine locally, fatal on Vercel.",
      level: "error",
    });
  }

  if (!capability.ai()) {
    out.push({
      variable: "GEMINI_API_KEY",
      effect:
        "Rules-only mode. Verdicts, scores and rule IDs are still produced by the deterministic engine; extraction falls back to keyword matching and no email is drafted.",
      level: "warn",
    });
  }

  if (!capability.hunter()) {
    out.push({
      variable: "HUNTER_API_KEY",
      effect:
        "Point-of-contact lookup is unavailable. Contacts come from the seeded set and render a visible `seeded` badge.",
      level: "warn",
    });
  }

  if (!capability.gmail() && !capability.resend()) {
    out.push({
      variable: "GOOGLE_REFRESH_TOKEN",
      effect:
        "No send transport is configured. Drafts are produced and validated but Approve & send will fail loudly rather than pretend.",
      level: "warn",
    });
  }

  if (sendToOrNull() === null) {
    out.push({
      variable: "GMAIL_SEND_TO",
      effect:
        "The locked recipient is not set, so sending is disabled entirely. This is the one variable Signal refuses to guess.",
      level: "error",
    });
  }

  const site = env.siteUrl();
  if (site && site.includes("localhost") && process.env.VERCEL === "1") {
    out.push({
      variable: "NEXT_PUBLIC_SITE_URL",
      effect: "Set to localhost in a deployed environment, so generated links will not resolve.",
      level: "error",
    });
  }

  return out;
}
