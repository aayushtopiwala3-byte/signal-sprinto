import { describe, it, expect } from "vitest";
import { checkContradiction } from "@/lib/rules/contradiction";
import { tierForSignal, isMediaArtifact, companyRaisedFunding } from "@/lib/rules/evidenceTier";
import { detectSignals } from "@/lib/rules/signals";
import { EMPTY_EVIDENCE_MAP, DEFAULT_WEIGHTS } from "@/lib/types";

/** The sentence that made `rocketlane.com` the board's only Send while contradicting itself. */
const SOC2_PAIN_POINT =
  "Rocketlane Fortifies Infosec: Gets SOC 1 Type 2 Certified, Stays SOC 2 Type 2 Compliant Two Years In A Row";

/** Its S-07 quote: a third party's interview headline. */
const FINTECH_INTERVIEW =
  "FinTech Interview with Srikrishnan Ganesan, Co-Founder and CEO of Rocketlane";

/** Its S-06 quote, which must survive — a funding round is announced through press. */
const FUNDING_HEADLINE = "Rocketlane Raises $60 Million in Series C Led by 8VC and Matrix Partners";

describe("R-24 — the contradiction gate (§1.3)", () => {
  it("fires when cert_status says none and a verified quote names a certification", () => {
    const c = checkContradiction({
      certStatus: "none",
      certQuote: "We use appropriate technical and organizational measures.",
      certUrl: "https://rocketlane.com/privacy",
      claims: [
        {
          kind: "pain_point",
          label: "pain point 1",
          quote: SOC2_PAIN_POINT,
          url: "https://rocketlane.com/newsroom",
        },
      ],
    });

    expect(c).not.toBeNull();
    expect(c?.cert_status).toBe("none");
    expect(c?.tokens).toEqual(expect.arrayContaining(["soc 1", "certified"]));
    expect(c?.reason).toContain("R-24: the pages say both");
    // Both sides are carried, so the card can show them next to each other.
    expect(c?.cert_quote).toContain("technical and organizational");
    expect(c?.claim.quote).toBe(SOC2_PAIN_POINT);
  });

  it("fires on an unknown cert_status too — silence is not agreement", () => {
    const c = checkContradiction({
      certStatus: null,
      certQuote: null,
      certUrl: null,
      claims: [{ kind: "signal", label: "S-05", quote: SOC2_PAIN_POINT, url: null }],
    });
    expect(c?.cert_status).toBe("unknown");
  });

  it("does not fire when the company is already recorded as certified", () => {
    // Same fact stated twice is corroboration, not conflict.
    expect(
      checkContradiction({
        certStatus: "certified",
        certQuote: "We are SOC 2 certified.",
        certUrl: null,
        claims: [{ kind: "pain_point", label: "pain point 1", quote: SOC2_PAIN_POINT, url: null }],
      }),
    ).toBeNull();
  });

  it("does not fire on in_progress — that is the signal, not a contradiction", () => {
    expect(
      checkContradiction({
        certStatus: "in_progress",
        certQuote: "We are pursuing SOC 2.",
        certUrl: null,
        claims: [{ kind: "signal", label: "S-01", quote: "We are pursuing SOC 2.", url: null }],
      }),
    ).toBeNull();
  });

  it("stays quiet when nothing mentions a certification", () => {
    expect(
      checkContradiction({
        certStatus: "none",
        certQuote: "We care about security.",
        certUrl: null,
        claims: [
          { kind: "signal", label: "S-06", quote: FUNDING_HEADLINE, url: null },
          { kind: "evidence", label: "size_band", quote: "We are a team of 120 people.", url: null },
        ],
      }),
    ).toBeNull();
  });
});

describe("§2.1 — R-23's fourth test: media artifacts", () => {
  const sources = [
    { url: "https://rocketlane.com/press", text: `${FINTECH_INTERVIEW} ${FUNDING_HEADLINE}` },
  ];

  it("recognises a publication artifact", () => {
    expect(isMediaArtifact(FINTECH_INTERVIEW)).toBe(true);
    expect(isMediaArtifact("Top 50 SaaS Companies To Watch")).toBe(true);
    expect(isMediaArtifact("We serve healthcare providers across the US.")).toBe(false);
  });

  it("downgrades Rocketlane's S-07 interview headline to asserted", () => {
    const t = tierForSignal({
      signal_id: "S-07",
      quote: FINTECH_INTERVIEW,
      claimedUrl: "https://rocketlane.com/press",
      sources,
      domain: "rocketlane.com",
    });

    expect(t.tier).toBe("asserted");
    expect(t.reason).toContain("publication artifact");
  });

  it("lets the funding headline through for S-06, because that is how rounds are announced", () => {
    const t = tierForSignal({
      signal_id: "S-06",
      quote: FUNDING_HEADLINE,
      claimedUrl: "https://rocketlane.com/press",
      sources,
      domain: "rocketlane.com",
    });
    expect(t.tier).toBe("verified");
  });

  it("does not extend that exception to a listicle that merely mentions funding", () => {
    const quote = "Top 10 Funded SaaS Startups of 2024, featuring Rocketlane and others";
    const t = tierForSignal({
      signal_id: "S-06",
      quote,
      claimedUrl: "https://example.com/list",
      sources: [{ url: "https://example.com/list", text: quote }],
      domain: "rocketlane.com",
    });
    expect(t.tier).toBe("asserted");
  });

  it("requires the company to be the subject of the funding verb", () => {
    expect(companyRaisedFunding(FUNDING_HEADLINE, "rocketlane.com")).toBe(true);
    expect(
      companyRaisedFunding("Matrix Partners raised a new $500M fund; Rocketlane is a portfolio company.", "rocketlane.com"),
    ).toBe(false);
  });
});

describe("§2.2 — S-07 needs customer language, not topic language", () => {
  const page = (text: string) => [{ url: "https://rocketlane.com/", text, title: null }];

  it("does not fire on a vertical word in an interview headline", () => {
    const fired = detectSignals(
      { evidence: EMPTY_EVIDENCE_MAP, pages: page(FINTECH_INTERVIEW) },
      DEFAULT_WEIGHTS,
    );
    expect(fired.find((s) => s.signal_id === "S-07")).toBeUndefined();
  });

  it("fires on a sentence about who they sell to", () => {
    const fired = detectSignals(
      {
        evidence: EMPTY_EVIDENCE_MAP,
        pages: page(
          "We serve healthcare providers and insurance carriers who need audit-ready onboarding.",
        ),
      },
      DEFAULT_WEIGHTS,
    );
    expect(fired.find((s) => s.signal_id === "S-07")).toBeDefined();
  });

  it("does not fire on a founder's biography", () => {
    const fired = detectSignals(
      {
        evidence: EMPTY_EVIDENCE_MAP,
        pages: page(
          "Prior to founding the company she spent eight years building payments infrastructure at a bank.",
        ),
      },
      DEFAULT_WEIGHTS,
    );
    expect(fired.find((s) => s.signal_id === "S-07")).toBeUndefined();
  });
});
