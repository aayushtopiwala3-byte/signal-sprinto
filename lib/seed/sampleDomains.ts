/**
 * §4.2 — the seeded entries, in this exact order. The failures are the point: a duplicate
 * pair, a messy URL that collapses onto one of them, and a domain that does not resolve.
 * Never silently remove them.
 *
 * Broadened to 16 entries in G6 §4. One Send on a board of nine is defensible but thin, so four
 * more ICP-fitting companies were added — chosen on fit, named in VERIFICATION_LOG.md before
 * being fetched, and kept whatever they scored.
 */
export const SAMPLE_DOMAINS: string[] = [
  "rocketlane.com",
  "zipy.ai",
  "nected.ai",
  "springworks.in",
  "apty.io",
  "whatfix.com",
  // Was zomato.com. Its robots.txt answers 403, so it quarantined before the fit gate could
  // run and the R-01 demonstration never happened. zerodha.com is also plainly not B2B SaaS —
  // a retail stock brokerage — and its robots.txt and homepage are both readable, so R-01
  // actually fires. Verified by running it, not assumed (§2.5).
  "zerodha.com",
  "atlan.com",
  "  HTTPS://Rocketlane.com/pricing?utm_source=x  ",
  "rocketlane.com",
  "sprinto-test-does-not-exist-9x.com",
  "plivo.com",
  // G6 §4 — four more, chosen for ICP fit and committed to VERIFICATION_LOG.md *before* they
  // were fetched. Indian B2B SaaS, Series A–C, all handling customer data. Whatever they score
  // is what they score: swapping one out because the board looked better without it would be
  // tuning the test to the answer, which is the failure G4 §0 exists to prevent.
  "zluri.com",
  "signzy.com",
  "everstage.com",
  "hyperverge.co",
  // v3 §2.3 — two more, added to test S-01 specifically. Across the previous 12 companies S-01
  // never fired, and the diagnosis (VERIFICATION_LOG.md §12) found the cause in the sample
  // rather than the code: nobody in it publicly states that a certification is under way. These
  // two were chosen for the highest prior probability of being mid-audit and *saying so* — a
  // billing system and an employee-health platform, both selling into buyers who run security
  // review as routine. Named in the log before they were fetched. They stay whatever they score.
  "zenskar.com",
  "plumhq.com",
  // v3 §6.7 — three genuinely early-stage companies. The first live v3 run returned zero Sends,
  // and the reason was not the rules: R-24 found that four of the twelve were already
  // certified and saying so on their own pages, which is a migration conversation, not a cold
  // send. The sample had almost no pre-certification company left in it. These three are Seed
  // to Series A at 11–50 people — the stage the ICP actually describes, and the stage at which
  // a trust page is usually still bare. Named here before they were fetched, kept whatever they
  // score. If none of them sends either, that is the finding and the log says so.
  "plotline.so",
  "kula.ai",
  "zipteams.com",
];

export const SAMPLE_TEXT = SAMPLE_DOMAINS.join("\n");

/** What the sample set is designed to demonstrate, rendered next to the button. */
export const SAMPLE_NOTES = [
  "3 entries collapse to rocketlane.com — one company, one Hunter credit",
  "sprinto-test-does-not-exist-9x.com cannot resolve — quarantined, run continues",
  // This slot held zomato.com, which was chosen to demonstrate R-01 and never could: its
  // robots.txt answers 403, so the gate stopped it before any page was read. zerodha.com was
  // swapped in only after checking that its robots.txt and homepage both return content.
  "zerodha.com is a stock brokerage, not B2B SaaS — DROP on R-01",
  "zenskar.com and plumhq.com were added to test S-01 — chosen before fetching, kept either way",
];
