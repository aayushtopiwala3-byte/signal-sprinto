/**
 * §4.2 — the 12 seeded entries, in this exact order. The failures are the point: a duplicate
 * pair, a messy URL that collapses onto one of them, and a domain that does not resolve.
 * Never silently remove them.
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
];
