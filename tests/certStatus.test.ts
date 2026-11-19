import { describe, it, expect } from "vitest";
import {
  resolveCertStatus,
  certTokensIn,
  hasCertToken,
  SECURITY_PAGE_URL,
} from "@/lib/rules/certStatus";
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

  it("withholds 'none' when the page calls itself a trust centre, even with a bare body", () => {
    // The stricter §1.1 list. Concluding "none" drives S-02's thirty points, S-03's "their
    // first hire" and R-04's routing, so a company that maintains a dedicated trust centre —
    // whose badges may be images the cleaner dropped — is left unknown for a human to settle.
    // S-02 is judged on the narrower list and may still fire here; R-24 catches any disagreement.
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

describe("which page counts as the trust page", () => {
  it("rejects marketing pages that merely have a vertical word in the path", () => {
    // Both of these were treated as the company's own trust page on a live run.
    // `/in/industries/security-brokerage` is an industry page about the securities brokerage
    // sector; `/use-cases/compliance-and-auditing-for-healthcare` is a use-case page. One gave
    // hyperverge.co an S-02 quote of "KYC for Security & Brokerage"; the other let a HIPAA
    // mention in nected.ai's marketing copy settle their certification status.
    expect(SECURITY_PAGE_URL.test("https://hyperverge.co/in/industries/security-brokerage")).toBe(
      false,
    );
    expect(
      SECURITY_PAGE_URL.test("https://nected.ai/use-cases/compliance-and-auditing-for-healthcare"),
    ).toBe(false);
  });

  it("still accepts the real thing, however it is named", () => {
    for (const url of [
      "https://plivo.com/security",
      "https://whatfix.com/trust",
      "https://acme.com/trust-center",
      "https://acme.com/security-and-compliance",
    ]) {
      expect(SECURITY_PAGE_URL.test(url)).toBe(true);
    }
  });
});

describe("certification tokens", () => {
  it("counts real certifications, not the page's name for itself", () => {
    expect(certTokensIn(TRUST_TITLE)).toEqual([]);
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
    // A real certification in the title, which a body-only check would miss.
    const fired = detectSignals(
      {
        evidence: { ...EMPTY_EVIDENCE_MAP, cert_status: null },
        pages: pages(BARE_TRUST_TEXT, "Acme Security — SOC 2 Type II certified"),
      },
      DEFAULT_WEIGHTS,
    );
    expect(fired.find((s) => s.signal_id === "S-02")).toBeUndefined();
  });

  it("still fires on a page that only calls itself a Trust Center — that is the signal", () => {
    // "Trust Center" is the page's name, not its content. A page titled that way which names
    // no certification is precisely "they built a trust page and have nothing to put on it
    // yet", so blocking S-02 on its own title would make the signal unfireable on the only
    // companies it exists to find. On the live run, `atlan.com` and `rocketlane.com` were both
    // blocked this way. FIX_PROMPT_V3 §1.1 lists `trust center` as a certification token; its
    // own acceptance §6.2 says S-02 must fire on none whose trust page *names a certification*,
    // and a page called Trust Center that names none does not.
    const fired = detectSignals(
      {
        evidence: { ...EMPTY_EVIDENCE_MAP, cert_status: null },
        pages: pages(BARE_TRUST_TEXT, TRUST_TITLE),
      },
      DEFAULT_WEIGHTS,
    );
    expect(fired.find((s) => s.signal_id === "S-02")).toBeDefined();
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
