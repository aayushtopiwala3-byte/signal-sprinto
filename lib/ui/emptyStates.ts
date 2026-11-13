/**
 * §7, T-26 — the copy each page shows before any run has happened.
 *
 * These live in one module for a reason beyond tidiness: an empty state is the first thing a
 * judge sees, and it is the easiest thing in a build to leave as a blank div or an unexplained
 * "No data". Naming them here makes them assertable (T-26 fails if one is deleted or trimmed to
 * nothing) and makes it obvious when one of them stops saying what to do next.
 *
 * Each one states what is absent, why, and the next action — never just the absence.
 */

export const EMPTY_STATE_BOARD =
  "No run yet. Paste a list of domains — or load the sample 12 — and Signal will read each company's site, score it against the rules, and tell you which ones are worth an email today.";

export const EMPTY_STATE_QUARANTINE =
  "Nothing is quarantined. Domains land here when they cannot be read at all — robots.txt disallows us, the domain does not resolve, or every fetch tier failed. Nothing here was scored, so nothing here has a verdict.";

export const EMPTY_STATE_HEALTH =
  "No run yet, so there are no costs, no cache figures and no evidence checks to report. Run the board and these numbers become facts about that run rather than placeholders.";

export const EMPTY_STATE_REPLIES =
  "No companies have been scored yet. Run the board first — a reply belongs to a company, and there are none to attach one to.";
