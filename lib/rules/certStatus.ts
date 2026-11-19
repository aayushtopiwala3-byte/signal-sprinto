import type { EvidenceMap } from "@/lib/types";
import { certTokensIn, SECURITY_PAGE_URL } from "@/lib/rules/certTokens";
import { sentences } from "@/lib/rules/signals";

/**
 * §1.1 — absence of evidence is not evidence of absence.
 *
 * `cert_status: "none"` is the most consequential thing this system can believe about a company.
 * It is what makes S-02 meaningful, what lets S-03 call a security hire "their first", and what
 * keeps R-04 from routing the company to the migration play. And until this rule existed, any
 * page could set it — so `rocketlane.com` was recorded as uncertified on the strength of a
 * privacy-policy sentence:
 *
 *   "We use appropriate technical and organizational measures to protect the Personal Data…"
 *
 * That sentence is real, it is theirs, and it says nothing whatsoever about certification. A
 * privacy policy is not where a company announces SOC 2; a trust page is. Meanwhile Rocketlane's
 * own trust centre is titled "Security, Compliance, and Reliability" and their newsroom
 * announces SOC 1 Type 2 certification — so the system believed "not certified" and "certified
 * two years running" at the same moment, and sent on the strength of the first.
 *
 * The rule is therefore about *which page is allowed to answer*, not about matching harder:
 *
 *   "none"        only from the reserved security/trust page, fetched successfully, with no
 *                 certification token anywhere in it — title included
 *   "certified"   } any fetched page may establish these: a company announcing a certification
 *   "in_progress" } is making a positive claim, and positive claims carry their own evidence
 *   otherwise     NULL — the loop continues, and at the cap R-22 holds for a human
 *
 * A null `cert_status` is a better outcome than a wrong one. R-22 already renders it well.
 */

export { certTokensIn, hasCertToken, SECURITY_PAGE_URL } from "@/lib/rules/certTokens";

export type CertPage = { url: string; text: string; title: string | null };

/** The page allowed to answer "are they certified?" — the reserved security/trust fetch. */
export function securityPageOf(pages: CertPage[], recordedUrl: string | null): CertPage | null {
  if (recordedUrl) {
    const exact = pages.find((p) => p.url === recordedUrl);
    if (exact) return exact;
  }
  return pages.find((p) => SECURITY_PAGE_URL.test(p.url)) ?? null;
}

export type CertResolution = {
  evidence: EvidenceMap;
  /** Null when nothing changed. Otherwise the sentence the card shows for why. */
  note: string | null;
  demoted: boolean;
};

/**
 * Apply §1.1 once the loop has finished and we know what was actually fetched.
 *
 * This runs after the loop rather than inside extraction on purpose. Whether "none" is
 * permissible depends on whether the *reserved security fetch* succeeded, and that is not known
 * while page 1 is being read. Deciding it per-page would mean guessing; deciding it here means
 * knowing.
 */
export function resolveCertStatus(args: {
  evidence: EvidenceMap;
  pages: CertPage[];
  securityPageUrl: string | null;
}): CertResolution {
  const { evidence, pages, securityPageUrl } = args;

  // Only "none" is gated. A positive claim carries its own evidence and may come from anywhere.
  if (evidence.cert_status !== "none") return { evidence, note: null, demoted: false };

  const securityPage = securityPageOf(pages, securityPageUrl);

  const demote = (note: string): CertResolution => ({
    evidence: { ...evidence, cert_status: null, cert_status_evidence: null },
    note,
    demoted: true,
  });

  if (!securityPage) {
    return demote(
      "cert_status was read as “none”, but no security or trust page was ever fetched for this company. " +
        "Nothing else is allowed to settle that question — a privacy policy or a marketing page can be silent " +
        "about certification for a dozen reasons that have nothing to do with whether they hold one. Left unknown.",
    );
  }

  const haystack = `${securityPage.title ?? ""}\n${securityPage.text}`;
  const tokens = certTokensIn(haystack);
  if (tokens.length > 0) {
    return demote(
      `cert_status was read as “none”, but their security page (${securityPage.url}) names ${tokens
        .map((t) => `“${t}”`)
        .join(", ")}. A trust page that talks about certification is not a trust page with nothing on it. Left unknown.`,
    );
  }

  // Permitted. Re-source the evidence to the page that was actually entitled to answer, so the
  // card cannot show "none" next to a quote from somewhere that had no standing to say so.
  const current = evidence.cert_status_evidence;
  if (current && current.url === securityPage.url) {
    return { evidence, note: null, demoted: false };
  }

  const replacement =
    sentences(securityPage.text).find((s) => /\b(security|trust|compliance|privacy)\b/i.test(s)) ??
    sentences(securityPage.text)[0] ??
    null;

  if (!replacement) {
    return demote(
      `cert_status was read as “none” from ${current?.url ?? "an unrecorded page"}, but their security page ` +
        `(${securityPage.url}) has no quotable sentence to support it. Left unknown rather than sourced to a page that cannot answer.`,
    );
  }

  return {
    evidence: {
      ...evidence,
      cert_status_evidence: { quote: replacement, url: securityPage.url },
    },
    note:
      `cert_status “none” was re-sourced from ${current?.url ?? "an unrecorded page"} to their security page ` +
      `(${securityPage.url}), which is the only page permitted to answer it.`,
    demoted: false,
  };
}
