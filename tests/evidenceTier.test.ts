import { describe, expect, it } from "vitest";
import {
  SIGNAL_TRIGGERS,
  applyEvidenceTiers,
  domainStem,
  mentionsCompany,
  tierAllSignals,
  tierFor,
  tierForSignal,
  tierPainPoints,
} from "@/lib/rules/evidenceTier";
import type { FiredSignal } from "@/lib/types";
import type { Source } from "@/lib/rules/evidenceValidator";

/**
 * R-23 (§3.1). Every quote below is real — each one was pulled from the `signals` table after a
 * production run, and every one of them passed the verbatim validator and scored points.
 */

const page = (url: string, text: string): Source => ({ url, text });

describe("R-23 · a quote that exists is not a quote that supports the claim", () => {
  it("downgrades an industry statistic that never names the company (zipy S-06)", () => {
    const quote =
      "SaaS startups have raised $5 billion to date in funding since the beginning of 2022, according to data research and analysis firm Venture Intelligence.";
    const sources = [page("https://zipy.ai/press-coverage", `Press coverage. ${quote} More text.`)];

    const result = tierForSignal({
      signal_id: "S-06",
      quote,
      claimedUrl: "https://zipy.ai/press-coverage",
      sources,
      domain: "zipy.ai",
    });

    expect(result.tier).toBe("asserted");
    expect(result.reason).toContain("does not mention zipy");
  });

  it("downgrades a quote that names the company only to date a person's earlier job (zipy S-07)", () => {
    // The hard case: "Zipy" and "healthcare" really are both in this sentence. It is still a
    // bio of somebody's previous work, not evidence that Zipy sells into healthcare.
    const quote =
      "Prior to Zipy, Vishalini has been an integral part of the MindTickle unicorn journey and has mentored multiple startups in edtech, healthcare and ecommerce domains in their Product Strategy.";
    const sources = [page("https://zipy.ai/about-us", `About us. ${quote}`)];

    const result = tierForSignal({
      signal_id: "S-07",
      quote,
      claimedUrl: "https://zipy.ai/about-us",
      sources,
      domain: "zipy.ai",
    });

    expect(result.tier).toBe("asserted");
    expect(result.reason).toContain("before it");
  });

  it("downgrades the reader tier's own error text (zerodha S-02)", () => {
    const quote = "Warning: Target URL returned error 404: Not Found";
    const sources = [page("https://zerodha.com/trust", `${quote}\n\nnothing else here`)];

    expect(
      tierForSignal({
        signal_id: "S-02",
        quote,
        claimedUrl: "https://zerodha.com/trust",
        sources,
        domain: "zerodha.com",
      }).tier,
    ).toBe("asserted");
  });

  it("downgrades a cookie banner dressed as a security page (springworks S-02)", () => {
    const quote =
      "* Description YouTube cookie used to protect user security and prevent fraud, especially during the login process.";
    const sources = [page("https://springworks.in/security", `Security. ${quote}`)];

    expect(
      tierForSignal({
        signal_id: "S-02",
        quote,
        claimedUrl: "https://springworks.in/security",
        sources,
        domain: "springworks.in",
      }).tier,
    ).toBe("asserted");
  });

  it("keeps a quote that names the company and the claim (rocketlane S-06)", () => {
    const quote =
      "Rocketlane Raises $60 Million in Series C to Redefine Professional Services for the AI Era";
    const sources = [page("https://rocketlane.com/press", `Press. ${quote}`)];

    const result = tierForSignal({
      signal_id: "S-06",
      quote,
      claimedUrl: "https://rocketlane.com/press",
      sources,
      domain: "rocketlane.com",
    });

    expect(result.tier).toBe("verified");
    expect(result.reason).toBeNull();
  });

  it("keeps first-person evidence on the company's own page (atlan S-06)", () => {
    const quote =
      "We raised $105 million led by GIC and Meritech Capital to build the context layer for AI, bringing total funding to over $200 million.";
    const sources = [page("https://atlan.com/about", `About. ${quote}`)];

    expect(
      tierForSignal({
        signal_id: "S-06",
        quote,
        claimedUrl: "https://atlan.com/about",
        sources,
        domain: "atlan.com",
      }).tier,
    ).toBe("verified");
  });

  it("does not let first person on somebody else's page count as a mention", () => {
    // "We raised $40 million" on a VC's blog is the VC talking, not the portfolio company.
    const quote = "We raised $40 million to accelerate our compliance roadmap this year.";
    const sources = [page("https://someinvestor.com/blog", `Blog. ${quote}`)];

    expect(
      tierForSignal({
        signal_id: "S-06",
        quote,
        claimedUrl: "https://someinvestor.com/blog",
        sources,
        domain: "acme.com",
      }).tier,
    ).toBe("asserted");
  });

  it("marks a quote that appears on no fetched page as fabricated", () => {
    const sources = [page("https://acme.com/", "Acme builds developer tools for teams.")];

    const result = tierForSignal({
      signal_id: "S-06",
      quote: "Acme today announced a $50 million Series B led by Sequoia Capital.",
      claimedUrl: "https://acme.com/",
      sources,
      domain: "acme.com",
    });

    expect(result.tier).toBe("fabricated");
    expect(result.reason).toContain("does not appear on any page");
  });

  it("downgrades an on-topic company quote attached to the wrong signal", () => {
    // Real, about Acme, and says nothing whatever about funding.
    const quote = "Acme is trusted by healthcare providers across the country for patient intake.";
    const sources = [page("https://acme.com/", `Home. ${quote}`)];

    const asFunding = tierForSignal({
      signal_id: "S-06",
      quote,
      claimedUrl: "https://acme.com/",
      sources,
      domain: "acme.com",
    });
    const asVertical = tierForSignal({
      signal_id: "S-07",
      quote,
      claimedUrl: "https://acme.com/",
      sources,
      domain: "acme.com",
    });

    expect(asFunding.tier).toBe("asserted");
    expect(asFunding.reason).toContain("says nothing about the claim");
    expect(asVertical.tier).toBe("verified");
  });
});

describe("the pieces R-23 is built from", () => {
  it("reduces a domain to the word a human would write", () => {
    expect(domainStem("nected.ai")).toBe("nected");
    expect(domainStem("springworks.in")).toBe("springworks");
    expect(domainStem("https://www.rocketlane.com/trust")).toBe("rocketlane");
  });

  it("will not match a stem inside a longer word", () => {
    // "spring" must not match "Springtime", or every seasonal sales page becomes evidence
    // about springworks. No first person here either, so nothing else can rescue it.
    const check = mentionsCompany(
      "Springtime brings a fresh round of discounts across the catalogue.",
      "spring.io",
      "https://unrelated.com/sale",
    );
    expect(check.mentions).toBe(false);
  });

  it("accepts first person on the company's own page as a mention", () => {
    const check = mentionsCompany("Apply now for our open roles.", "apt.io", "https://apt.io/jobs");
    expect(check.mentions).toBe(true);
  });

  it("gives every signal a trigger", () => {
    const ids = ["S-01", "S-02", "S-03", "S-04", "S-05", "S-06", "S-07"] as const;
    for (const id of ids) expect(SIGNAL_TRIGGERS[id]).toBeInstanceOf(RegExp);
  });

  it("treats the company-mention test as the whole support check when no signal is named", () => {
    // Pain points and draft hooks are not tied to one signal, so they get the mention test only.
    const quote = "Our team spends days every quarter answering security questionnaires by hand.";
    const sources = [page("https://acme.com/blog", `Blog. ${quote}`)];

    expect(
      tierFor({ quote, claimedUrl: "https://acme.com/blog", sources, domain: "acme.com" }).tier,
    ).toBe("verified");
  });
});

/**
 * §3.2. The Health counter is the artifact that proves R-23 runs at all, so the two ways it
 * could lie — losing a fabrication, or padding the total with something that was never a
 * fabrication — are worth asserting directly.
 */
describe("R-23 · the refusals are countable", () => {
  const signal = (signal_id: FiredSignal["signal_id"], quote: string): FiredSignal => ({
    signal_id,
    points: 20,
    independence_group: "certification",
    quote,
    source_url: "https://acme.com/security",
    tier: "verified",
  });

  const SOURCES = [
    page("https://acme.com/security", "Acme is SOC 2 Type II certified as of March."),
  ];

  it("keeps the fabricated signal that the scoring path drops", () => {
    const fired = [
      signal("S-01", "Acme is SOC 2 Type II certified as of March."),
      signal("S-02", "Acme has begun its ISO 27001 audit."),
    ];

    // The scoring path must not see the invented quote...
    const scored = applyEvidenceTiers(fired, "acme.com", SOURCES);
    expect(scored.map((s) => s.signal_id)).toEqual(["S-01"]);

    // ...but the accounting path has to, or the block is invisible and the counter undercounts.
    const all = tierAllSignals(fired, "acme.com", SOURCES);
    expect(all).toHaveLength(2);
    expect(all.find((s) => s.signal_id === "S-02")?.tier).toBe("fabricated");
  });

  it("does not count a pain point the model never wrote as a fabrication it caught", () => {
    // AI-3 offered one point, so the second slot is empty. Both render as `not stated`, but only
    // one of them is a claim the check refused.
    const tiered = tierPainPoints(
      [{ text: "Manual evidence collection.", quote: "Invented sentence.", url: null }],
      SOURCES,
      "acme.com",
    );

    expect(tiered).toHaveLength(2);
    expect(tiered.map((p) => p.tier)).toEqual(["fabricated", "fabricated"]);
    expect(tiered.map((p) => p.produced)).toEqual([true, false]);

    const counted = tiered.filter((p) => p.produced && p.tier !== "verified");
    expect(counted).toHaveLength(1);
    // The quote survives for the ledger even though the card is stripped back to `not stated`.
    expect(counted[0].original_quote).toBe("Invented sentence.");
  });
});
