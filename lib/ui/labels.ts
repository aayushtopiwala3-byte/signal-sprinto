/**
 * §5 — human labels for the identifiers the UI renders.
 *
 * The rule and field IDs are the defensibility of this build and are never replaced. Everything
 * here is additive: a label to put *beside* an ID, or a phrase to use where the raw identifier
 * was being shown to a reader who has no reason to know it.
 *
 * Kept in one module rather than inline so the board, the company card and the health page
 * cannot drift into calling the same field three different things.
 */

import type { LoopField } from "@/lib/types";

/** The Evidence Map as the four questions it actually asks. */
export const FIELD_QUESTION: Record<LoopField, string> = {
  is_b2b_saas: "Do they sell software to businesses?",
  size_band: "How big are they?",
  cert_status: "Are they already certified?",
  pressure_signals: "Is there compliance pressure?",
};

/**
 * The same four fields named as nouns, for running text like "still unknown: company size".
 * A question reads badly in a list; a noun phrase reads badly as a heading. Both are needed.
 */
export const FIELD_NOUN: Record<string, string> = {
  is_b2b_saas: "whether they sell to businesses",
  size_band: "company size",
  cert_status: "certification status",
  pressure_signals: "compliance pressure",
};

/** `["size_band", "cert_status"]` -> `"company size, certification status"`. */
export function fieldsAsNouns(fields: readonly string[]): string {
  return fields.map((f) => FIELD_NOUN[f] ?? f).join(", ");
}

/**
 * What each rule id means, for the "What do these codes mean?" disclosure. Kept here rather
 * than inline so the board and the README cannot drift apart on what a rule does.
 */
export const RULE_LABEL: Record<string, string> = {
  "R-01": "Not B2B SaaS — dropped",
  "R-02a": "Headcount above 500, stated on their site — they have in-house GRC",
  "R-02b": "Headcount inferred above 500 from their open roles",
  "R-02c": "Headcount unknown — does not gate the verdict either way",
  "R-03": "Services business rather than a software product",
  "R-04": "Already certified — routed to the migration play",
  "R-20": "Timing score decides it: 50+ sends, 20-49 holds, under 20 drops",
  "R-21": "Score is high enough but it all rests on one kind of evidence",
  "R-22": "A fact the verdict needs is still unknown — handed off rather than guessed",
  "R-23": "Signals fired but none of their quotes survived the evidence check",
  "R-30": "No named contact to send to",
  "R-40": "Subject line rejected by the code-side check",
};

/** The three evidence tiers, for the legend. */
export const TIER_LABEL: Record<string, string> = {
  verified: "quoted on a page we fetched, names this company, speaks to this signal",
  asserted: "the quote is real but fails one of those tests — scores 0",
  fabricated: "on no page we fetched — never shown as evidence",
};
