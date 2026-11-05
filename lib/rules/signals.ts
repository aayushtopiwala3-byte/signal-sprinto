import type {
  EvidenceMap,
  FiredSignal,
  IndependenceGroup,
  SignalId,
  Weights,
} from "@/lib/types";

/**
 * §5.2 — TIMING signals. Additive, and every one must carry evidence.
 *
 * Detection is keyword and shape matching over cleaned page text, so the same input always
 * produces the same signals (T-14). A signal that cannot find a verbatim sentence to quote
 * does not fire at all — "never fabricate" applies to the scoreboard too, not just the email.
 */

export type PageRecord = { url: string; text: string; title: string | null };

export type SignalInput = {
  evidence: EvidenceMap;
  pages: PageRecord[];
};

/**
 * S-01 and S-02 share the `certification` group on purpose (§5.2): they are two readings of the
 * same page, so stacking them must not manufacture a second independent signal (T-06).
 */
export const INDEPENDENCE_GROUP: Record<SignalId, IndependenceGroup> = {
  "S-01": "certification",
  "S-02": "certification",
  "S-03": "hiring",
  "S-04": "enterprise-demand",
  "S-05": "enterprise-demand",
  "S-06": "funding",
  "S-07": "vertical",
};

export const SIGNAL_LABEL: Record<SignalId, string> = {
  "S-01": "Certification in progress, stated on their own site",
  "S-02": "Security or trust page exists with no badge on it",
  "S-03": "First ever security / compliance / GRC hire is open",
  "S-04": "Enterprise logos out of proportion to headcount",
  "S-05": "Enterprise pricing tier mentions SOC 2, DPA or security review",
  "S-06": "Recent funding round",
  "S-07": "Sells into a regulated vertical",
};

/* ------------------------------------------------------------------ matching */

/** Split cleaned text into sentences, preserving each one verbatim for quoting. */
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 20 && s.length <= 400);
}

type Hit = { quote: string; url: string };

/**
 * Find the first sentence matching every pattern in `all` and at least one in `any`.
 * Returns the sentence verbatim so the stored quote is character-for-character from the page.
 */
function find(
  pages: PageRecord[],
  patterns: { all?: RegExp[]; any?: RegExp[]; none?: RegExp[]; urlMatch?: RegExp },
): Hit | null {
  for (const page of pages) {
    if (patterns.urlMatch && !patterns.urlMatch.test(page.url)) continue;
    for (const sentence of sentences(page.text)) {
      if (patterns.all && !patterns.all.every((re) => re.test(sentence))) continue;
      if (patterns.any && !patterns.any.some((re) => re.test(sentence))) continue;
      if (patterns.none && patterns.none.some((re) => re.test(sentence))) continue;
      return { quote: sentence, url: page.url };
    }
  }
  return null;
}

const CERT_NAME = /\b(soc\s*2|soc2|iso\s*27001|iso27001|hipaa|pci[- ]?dss)\b/i;
const IN_PROGRESS =
  /\b(in progress|under way|underway|coming soon|on our roadmap|roadmap|pursuing|working towards|working toward|currently undergoing|in the process of|we are seeking|audit is|type\s*1\b|observation period)\b/i;
const CERTIFIED_BADGE =
  /\b(we are (?:soc\s*2|iso\s*27001)|certified|attestation|compliant with|successfully completed|achieved|report is available|we hold)\b/i;
const SECURITY_PAGE_URL = /\/(security|trust|compliance|privacy\/security)\b/i;
const CAREERS_URL = /\/(careers|jobs|join-us|work-with-us|openings)\b/i;
const SECURITY_ROLE =
  /\b(security engineer|security analyst|compliance (?:manager|lead|officer|analyst)|grc\b|governance,? risk|information security|infosec|ciso|head of security|security lead|trust and safety engineer)\b/i;
const ENTERPRISE_PROOF =
  /\b(fortune\s*500|global\s*2000|enterprise (?:customers|clients|teams|brands)|trusted by|leading (?:enterprises|brands|companies)|used by teams at|customers include)\b/i;
const PRICING_URL = /\/(pricing|plans)\b/i;
const ENTERPRISE_TIER_COMPLIANCE =
  /\b(soc\s*2|iso\s*27001|security review|security questionnaire|questionnaires|dpa\b|data processing agreement|vendor (?:security )?assessment|custom (?:security|legal) terms|sso and scim|audit logs?)\b/i;
const FUNDING =
  /\b(series\s*[a-e]\b|seed round|pre-seed|raised\s*\$?[\d.]+\s*(?:m|million|bn|billion|cr|crore)|funding round|led the round|led by [a-z]|closed (?:our|a)\s*\$)\b/i;
const REGULATED_VERTICAL =
  /\b(healthcare|health system|patients?|clinical|ehr\b|hipaa|fintech|financial services|banks?|lending|payments?|insurance|payroll|hr tech|human resources|recruiting|benefits administration|pharma)\b/i;
const SMALL_BANDS = new Set(["1-10", "11-50", "51-200"]);

/* ------------------------------------------------------------------ detection */

/**
 * Detect which signals fire. Weights are applied here so that a slider at 0 removes the
 * signal's contribution without changing which evidence was found (§5.5, T-22).
 */
export function detectSignals(input: SignalInput, weights: Weights): FiredSignal[] {
  const { evidence, pages } = input;
  const fired: FiredSignal[] = [];

  const push = (signal_id: SignalId, hit: Hit | null) => {
    // No verbatim sentence to quote means the signal does not fire. Evidence is the price of
    // admission, not a decoration added afterwards.
    if (!hit) return;
    fired.push({
      signal_id,
      points: weights[signal_id],
      independence_group: INDEPENDENCE_GROUP[signal_id],
      quote: hit.quote,
      source_url: hit.url,
    });
  };

  // S-01 — their own site says a certification is under way.
  const certEvidence = evidence.cert_status_evidence;
  if (evidence.cert_status === "in_progress" && certEvidence) {
    push("S-01", { quote: certEvidence.quote, url: certEvidence.url });
  } else {
    push("S-01", find(pages, { all: [CERT_NAME, IN_PROGRESS] }));
  }

  // S-02 — a security or trust page exists, with no badge on it. Only meaningful when they
  // are not already certified, otherwise the badge is simply elsewhere.
  if (evidence.cert_status !== "certified") {
    const securityPage = pages.find((p) => SECURITY_PAGE_URL.test(p.url));
    if (securityPage) {
      const hasBadge = sentences(securityPage.text).some(
        (s) => CERT_NAME.test(s) && CERTIFIED_BADGE.test(s),
      );
      if (!hasBadge) {
        const hit =
          find([securityPage], { any: [/\bsecurity\b/i, /\btrust\b/i, /\bcompliance\b/i] }) ??
          (sentences(securityPage.text)[0]
            ? { quote: sentences(securityPage.text)[0], url: securityPage.url }
            : null);
        push("S-02", hit);
      }
    }
  }

  // S-03 — an open security/compliance/GRC role, treated as their first because no
  // certification programme exists yet.
  if (evidence.cert_status === "none" || evidence.cert_status === null) {
    const hit =
      find(pages, { all: [SECURITY_ROLE], urlMatch: CAREERS_URL }) ??
      find(pages, { all: [SECURITY_ROLE], any: [/\b(hiring|open role|we are looking|join)\b/i] });
    push("S-03", hit);
  }

  // S-04 — enterprise proof out of proportion to a small headcount.
  if (evidence.size_band !== null && SMALL_BANDS.has(evidence.size_band)) {
    push("S-04", find(pages, { all: [ENTERPRISE_PROOF] }));
  }

  // S-05 — the enterprise pricing tier names the compliance gate itself.
  push(
    "S-05",
    find(pages, { all: [ENTERPRISE_TIER_COMPLIANCE], urlMatch: PRICING_URL }) ??
      find(pages, { all: [ENTERPRISE_TIER_COMPLIANCE, /\benterprise\b/i] }),
  );

  // S-06 — a recent funding round.
  push("S-06", find(pages, { all: [FUNDING] }));

  // S-07 — sells into a regulated vertical.
  push("S-07", find(pages, { all: [REGULATED_VERTICAL] }));

  // Stable order, so two runs over identical input produce byte-identical rows (T-14).
  return fired.sort((a, b) => a.signal_id.localeCompare(b.signal_id));
}

/** Re-price already-detected signals when a weight slider moves. No re-detection, no fetch. */
export function repriceSignals(fired: FiredSignal[], weights: Weights): FiredSignal[] {
  return fired.map((s) => ({ ...s, points: weights[s.signal_id] ?? s.points }));
}
