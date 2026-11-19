import { certTokensIn } from "@/lib/rules/certStatus";
import type { CertStatus } from "@/lib/types";

/**
 * R-24 — the contradiction gate (§1.3).
 *
 * Every other rule here asks whether the evidence is good enough. This one asks a question none
 * of them can: whether the evidence *agrees with itself*.
 *
 * It exists because `rocketlane.com` reached SEND while holding both of these on one screen:
 *
 *   evidence map  cert_status: none
 *   pain point    "Rocketlane Fortifies Infosec: Gets SOC 1 Type 2 Certified, Stays SOC 2
 *                  Type 2 Compliant Two Years In A Row"   — VERIFIED
 *
 * Both passed R-23. Both were real sentences, on real pages, about that company, on topic. R-23
 * checks each claim against the *page*; nothing checked the claims against *each other*. So a
 * company could be simultaneously uncertified enough to score S-02's thirty points and certified
 * enough to quote its own SOC 2 announcement, and the verdict would take the half it liked.
 *
 * R-24 refuses that. If the evidence map says "not certified" or "unknown" while a verified
 * quote anywhere on the company names a certification, the verdict is forced to HOLD and both
 * sentences are shown side by side for a human to settle. It cannot be out-scored: a
 * contradiction is not a weak signal to be outweighed, it is a reason to distrust the whole row.
 *
 * This is deliberately cheap — one token scan over quotes already in memory — and it would have
 * caught the headline defect on its own, without any of the other fixes in this phase.
 */

export type ClaimKind = "signal" | "pain_point" | "evidence" | "draft_hook";

export type VerifiedClaim = {
  kind: ClaimKind;
  /** "S-02", "pain point 1", "cert_status", "draft hook" — what the card calls it. */
  label: string;
  quote: string;
  url: string | null;
};

export type Contradiction = {
  /** The certification tokens that appeared where they should not have. */
  tokens: string[];
  /** The claim that names a certification. */
  claim: VerifiedClaim;
  /** What the evidence map said instead. */
  cert_status: "none" | "unknown";
  /** The quote behind `cert_status`, when there is one. */
  cert_quote: string | null;
  cert_url: string | null;
  reason: string;
};

const KIND_LABEL: Record<ClaimKind, string> = {
  signal: "a signal quote",
  pain_point: "a pain point",
  evidence: "the evidence map",
  draft_hook: "the draft's hook",
};

/**
 * Returns the contradiction, or null when the evidence agrees with itself.
 *
 * Only `none` and `null` cert statuses can contradict. `certified` and `in_progress` already
 * agree with a quote naming a certification — that is the same fact stated twice, which is
 * corroboration, not conflict.
 */
export function checkContradiction(args: {
  certStatus: CertStatus | null;
  certQuote: string | null;
  certUrl: string | null;
  claims: VerifiedClaim[];
}): Contradiction | null {
  const { certStatus, certQuote, certUrl, claims } = args;

  if (certStatus === "certified" || certStatus === "in_progress") return null;

  for (const claim of claims) {
    const tokens = certTokensIn(claim.quote);
    if (tokens.length === 0) continue;

    const said = certStatus === "none" ? "none" : "unknown";
    const tokenList = tokens.map((t) => `“${t}”`).join(", ");

    return {
      tokens,
      claim,
      cert_status: said,
      cert_quote: certQuote,
      cert_url: certUrl,
      reason:
        `R-24: the pages say both. cert_status reads ${said}, but a verified quote in ` +
        `${KIND_LABEL[claim.kind]} (${claim.label}${claim.url ? `, ${claim.url}` : ""}) names ${tokenList}. ` +
        `Settle this before sending.`,
    };
  }

  return null;
}

/** What the card offers the reader once R-24 has fired. */
export function contradictionCounterfactual(c: Contradiction): string {
  return (
    `Read ${c.claim.url ?? "the quoted page"} and set cert_status by hand. If they are certified this is a ` +
    `migration conversation under R-04, not a first-certification pitch. If the quote turns out to be about ` +
    `something else — a customer's certification, a blog post about the standard — then cert_status stands and ` +
    `this returns to its previous verdict on the next run.`
  );
}
