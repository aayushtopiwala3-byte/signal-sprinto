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
  "zomato.com",
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
  "zomato.com is not B2B SaaS — dropped on R-01",
];
