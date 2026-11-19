import { describe, it, expect } from "vitest";
import { resolveCertStatus, certTokensIn, hasCertToken } from "@/lib/rules/certStatus";
import { detectSignals } from "@/lib/rules/signals";
import { EMPTY_EVIDENCE_MAP, DEFAULT_WEIGHTS } from "@/lib/types";

/**
 * §1.1 and §1.2 — the headline defect of v3, reproduced from the real pages.
 *
 * Every string below is the text the live system actually read on `rocketlane.com`. The point
 * of the fixture is that it is not a constructed edge case: it is what one Send card said.
 */

const PRIVACY_QUOTE =
  "We use appropriate technical and organizational measures to protect the Personal Data that we collect and process about you.";

const TRUST_TITLE = "Rocketlane Trust Center: Security, Compliance, and Reliability";
const TRUST_TEXT =
  "Rocketlane is committed to protecting customer data across every product surface. " +
  "Our SOC 2 Type 2 report is available to customers under NDA on request. " +
  "We review access controls on a quarterly basis and publish the outcome to customers.";

const BARE_TRUST_TEXT =
  "We take the security of customer data seriously and review our controls regularly. " +
  "Our infrastructure runs on managed cloud providers with encryption at rest and in transit. " +
  "Questions about our security posture can be sent to the team at any time.";

describe("§1.1 — only the right page may conclude 'none'", () => {
  it("refuses 'none' sourced from a privacy policy when no security page was fetched", () => {
    const out = resolveCertStatus({
      evidence: {
        ...EMPTY_EVIDENCE_MAP,
        cert_status: "none",
        cert_status_evidence: { quote: PRIVACY_QUOTE, url: "https://rocketlane.com/privacy" },
      },
      pages: [{ url: "https://rocketlane.com/privacy", text: PRIVACY_QUOTE, title: "Privacy" }],
      securityPageUrl: null,
    });

    expect(out.demoted).toBe(true);
    expect(out.evidence.cert_status).toBeNull();
    expect(out.note).toContain("no security or trust page was ever fetched");
  });

  it("refuses 'none' when the security page itself names a certification", () => {
    const out = resolveCertStatus({
      evidence: {
        ...EMPTY_EVIDENCE_MAP,
        cert_status: "none",
        cert_status_evidence: { quote: PRIVACY_QUOTE, url: "https://rocketlane.com/privacy" },
      },
      pages: [
        { url: "https://rocketlane.com/trust", text: TRUST_TEXT, title: TRUST_TITLE },
        { url: "https://rocketlane.com/privacy", text: PRIVACY_QUOTE, title: "Privacy" },
      ],
      securityPageUrl: "https://rocketlane.com/trust",
    });

    expect(out.demoted).toBe(true);
    expect(out.evidence.cert_status).toBeNull();
    expect(out.note).toContain("soc 2");
  });

  it("catches a certification named only in the page title", () => {
    // The title alone carries "trust center" and "compliance". A body-only check misses it.
    const out = resolveCertStatus({
      evidence: {
        ...EMPTY_EVIDENCE_MAP,
        cert_status: "none",
        cert_status_evidence: { quote: PRIVACY_QUOTE, url: "https://rocketlane.com/privacy" },
      },
      pages: [{ url: "https://rocketlane.com/trust", text: BARE_TRUST_TEXT, title: TRUST_TITLE }],
      securityPageUrl: "https://rocketlane.com/trust",
    });

    expect(out.demoted).toBe(true);
    expect(out.evidence.cert_status).toBeNull();
  });

  it("permits 'none' from a genuinely bare security page, and re-sources the quote to it", () => {
    const out = resolveCertStatus({
      evidence: {
        ...EMPTY_EVIDENCE_MAP,
        cert_status: "none",
        cert_status_evidence: { quote: PRIVACY_QUOTE, url: "https://acme.com/privacy" },
      },
      pages: [
        { url: "https://acme.com/security", text: BARE_TRUST_TEXT, title: "Security at Acme" },
        { url: "https://acme.com/privacy", text: PRIVACY_QUOTE, title: "Privacy" },
      ],
      securityPageUrl: "https://acme.com/security",
    });

    expect(out.demoted).toBe(false);
    expect(out.evidence.cert_status).toBe("none");
    // The quote now comes from the page entitled to answer, not the privacy policy.
    expect(out.evidence.cert_status_evidence?.url).toBe("https://acme.com/security");
  });

  it("never gates a positive claim — 'certified' may come from any page", () => {
    const out = resolveCertStatus({
      evidence: {
        ...EMPTY_EVIDENCE_MAP,
        cert_status: "certified",
        cert_status_evidence: { quote: "We are SOC 2 certified.", url: "https://acme.com/blog" },
      },
      pages: [{ url: "https://acme.com/blog", text: "We are SOC 2 certified.", title: null }],
      securityPageUrl: null,
    });

    expect(out.demoted).toBe(false);
    expect(out.evidence.cert_status).toBe("certified");
  });
});

describe("certification tokens", () => {
  it("counts the tokens a trust page uses", () => {
    expect(certTokensIn(TRUST_TITLE)).toContain("trust center");
    expect(certTokensIn("Gets SOC 1 Type 2 Certified")).toEqual(
      expect.arrayContaining(["soc 1", "certified"]),
    );
  });

  it("does not treat a bare GDPR mention as a certification", () => {
    expect(hasCertToken("We respect your GDPR rights and use cookies.")).toBe(false);
    expect(hasCertToken("We are GDPR compliant following an external audit.")).toBe(true);
  });
});

describe("§1.2 — S-02 requires a bare trust page", () => {
  const pages = (text: string, title: string | null) => [
    { url: "https://rocketlane.com/trust", text, title },
  ];

  it("does not fire when the trust page names a certification in its title", () => {
    const fired = detectSignals(
      { evidence: { ...EMPTY_EVIDENCE_MAP, cert_status: null }, pages: pages(BARE_TRUST_TEXT, TRUST_TITLE) },
      DEFAULT_WEIGHTS,
    );
    expect(fired.find((s) => s.signal_id === "S-02")).toBeUndefined();
  });

  it("does not fire when the certification is in the body", () => {
    const fired = detectSignals(
      { evidence: { ...EMPTY_EVIDENCE_MAP, cert_status: null }, pages: pages(TRUST_TEXT, "Trust") },
      DEFAULT_WEIGHTS,
    );
    expect(fired.find((s) => s.signal_id === "S-02")).toBeUndefined();
  });

  it("still fires on a genuinely bare trust page — the signal is not broken, only narrowed", () => {
    const fired = detectSignals(
      { evidence: { ...EMPTY_EVIDENCE_MAP, cert_status: null }, pages: pages(BARE_TRUST_TEXT, "Security at Acme") },
      DEFAULT_WEIGHTS,
    );
    expect(fired.find((s) => s.signal_id === "S-02")).toBeDefined();
  });

  it("cannot fire at all when no security page was fetched", () => {
    const fired = detectSignals(
      {
        evidence: { ...EMPTY_EVIDENCE_MAP, cert_status: null },
        pages: [{ url: "https://acme.com/", text: BARE_TRUST_TEXT, title: "Home" }],
      },
      DEFAULT_WEIGHTS,
    );
    expect(fired.find((s) => s.signal_id === "S-02")).toBeUndefined();
  });
});
