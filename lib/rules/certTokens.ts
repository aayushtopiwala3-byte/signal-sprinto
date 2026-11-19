/**
 * The certification-token vocabulary, in a module of its own with no imports.
 *
 * Three callers need it and two of them would otherwise form an import cycle: `signals.ts` asks
 * "does this trust page name a certification?" for S-02, `certStatus.ts` asks the same question
 * to decide whether "none" is permissible (§1.1), and `contradiction.ts` scans verified quotes
 * for R-24. One vocabulary, so the three can never drift into disagreeing about what counts as
 * a certification — which is precisely the class of bug R-24 exists to catch.
 */

/**
 * Tokens that mean "certification is being discussed here". Deliberately broad: this list is
 * used to *refuse* to conclude "none", so a false positive costs a null field and a human
 * glance, while a false negative costs a wrong Send. The asymmetry is the whole design.
 */
const CERT_TOKENS: RegExp[] = [
  /\bsoc\s*1\b/i,
  /\bsoc\s*2\b/i,
  /\bsoc2\b/i,
  /\biso\s*27001\b/i,
  /\biso27001\b/i,
  /\bhipaa\b/i,
  /\bpci[\s-]?dss\b/i,
  /\bcertified\b/i,
  /\bcertification\b/i,
  /\battestation\b/i,
  /\btype\s*(?:1|2|i|ii)\b/i,
  /\baudit report\b/i,
];

/**
 * `trust center` is deliberately NOT on that list, which is a departure from the token list in
 * `FIX_PROMPT_V3.md` §1.1, and the reason is worth stating.
 *
 * It is the page's *name*, not its *content*. Including it makes S-02 unfireable on precisely
 * the companies it exists to find: "they built a trust page and have nothing to put on it yet"
 * describes a page that is almost always called a trust page. On the live run of 17 scored
 * companies, exactly two had a trust page naming no certification at all — `atlan.com` and
 * `rocketlane.com` — and both were blocked from S-02 by the words "trust center" appearing on
 * a page about trust.
 *
 * It also makes `cert_status` unconcludable: §1.1 permits "none" only when the security page
 * names no token, so every company with a trust centre would stay null for ever and R-22 would
 * hold the entire board. A rule that can never reach a conclusion is not a strict rule, it is a
 * broken one.
 *
 * The brief's own acceptance criterion §6.2 is the tiebreak: S-02 must fire "on none whose trust
 * page **names a certification**". A page called Trust Center that names none does not.
 */

/**
 * GDPR is the exception. Almost every B2B site in Europe mentions it in a cookie banner, so on
 * its own it is noise — it only counts when it sits next to a certification verb.
 */
const GDPR_WITH_VERB =
  /\bgdpr\b[^.]{0,60}\b(certified|compliant|compliance|audited?|attestation|assessed)\b|\b(certified|compliant|compliance|audited?|attestation|assessed)\b[^.]{0,60}\bgdpr\b/i;

/** Every certification token found in a blob of text, for showing the reader what was seen. */
export function certTokensIn(text: string): string[] {
  const found = new Set<string>();
  for (const re of CERT_TOKENS) {
    const m = text.match(re);
    if (m) found.add(m[0].toLowerCase().replace(/\s+/g, " ").trim());
  }
  const gdpr = text.match(GDPR_WITH_VERB);
  if (gdpr) found.add("gdpr");
  return [...found].sort();
}

export function hasCertToken(text: string): boolean {
  return certTokensIn(text).length > 0;
}

/**
 * Page furniture: the words a trust page uses to name itself. Not a certification.
 *
 * Two different questions are being asked of these pages, and they deserve different answers.
 *
 *   "Is this trust page bare?"            S-02, R-24 — uses the narrow list above. A page
 *                                         titled Trust Center that names no certification is
 *                                         exactly the pre-certification moment S-02 looks for,
 *                                         so blocking it on its own title would make the signal
 *                                         unfireable on the only companies it is meant to find.
 *
 *   "May we conclude they hold none?"     §1.1 — uses the stricter list below. Concluding
 *                                         "none" is a strong claim that drives S-02's thirty
 *                                         points, S-03's "their first hire" and R-04's routing.
 *                                         A company that maintains a dedicated trust centre is
 *                                         engaged with the topic, and its badges may be images
 *                                         or links the cleaner dropped, so silence there is
 *                                         ambiguous rather than conclusive. Null, and R-22
 *                                         hands it to a human.
 *
 * Firing a signal on the page in front of us and refusing to conclude a fact about the company
 * are not the same act, and the asymmetry is deliberate: R-24 exists to catch the case where
 * the two disagree.
 */
const SELF_DESCRIPTION = /\btrust\s*cent(?:er|re)\b/i;

/** §1.1 only — the narrow tokens plus the page's own self-description. */
export function blocksCertNone(text: string): boolean {
  return hasCertToken(text) || SELF_DESCRIPTION.test(text);
}

export function certNoneBlockers(text: string): string[] {
  const out = certTokensIn(text);
  if (SELF_DESCRIPTION.test(text)) out.push("trust center");
  return [...new Set(out)].sort();
}

/**
 * Sections whose pages are marketing copy about a topic, not the company's own position on it.
 *
 * `\/(security|trust|compliance)\b` alone matched `/in/industries/security-brokerage` — an
 * industry page about the securities brokerage sector — and
 * `/use-cases/compliance-and-auditing-for-healthcare`, a use-case page. Both were then treated
 * as the reserved trust page: nected.ai had its `cert_status` settled by a HIPAA mention in
 * marketing copy, and hyperverge.co's S-02 quote became a KYC product headline.
 *
 * A trust page lives at the top of the site because it is addressed to buyers and auditors. A
 * page nested under industries, use-cases or solutions is addressed to prospects, and says
 * nothing about what the company itself holds.
 */
const MARKETING_SECTION = /\/(industries|use-cases|usecases|solutions|blog|resources|customers|case-studies|glossary)\//i;

/**
 * The page entitled to answer "are they certified?".
 *
 * `-center`, `-centre` and `-and-compliance` suffixes are kept, since `/trust-center` and
 * `/security-and-compliance` are both ordinary names for the real thing.
 */
export const SECURITY_PAGE_URL = {
  test(url: string): boolean {
    if (MARKETING_SECTION.test(url)) return false;
    return /\/(security|trust|compliance|privacy\/security)\b/i.test(url);
  },
};
