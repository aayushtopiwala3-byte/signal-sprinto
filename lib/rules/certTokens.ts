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
  /\btrust\s*cent(?:er|re)\b/i,
  /\baudit report\b/i,
];

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

export const SECURITY_PAGE_URL = /\/(security|trust|compliance|privacy\/security)\b/i;
