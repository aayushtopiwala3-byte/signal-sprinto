import { describe, it, expect } from "vitest";
import { buildDraftPrompt } from "@/lib/ai/prompts/draft";
import { planHook, COMPLIANCE_SIGNALS } from "@/lib/rules/hook";
import type { FiredSignal } from "@/lib/types";

const sig = (
  id: FiredSignal["signal_id"],
  quote: string,
  tier: FiredSignal["tier"] = "verified",
): FiredSignal => ({
  signal_id: id,
  points: 30,
  independence_group: "certification",
  quote,
  source_url: `https://rocketlane.com/${id}`,
  tier,
});

const base = {
  domain: "rocketlane.com",
  senderName: "the Growth Lead at Sprinto",
  contactName: "Srikrishnan Ganesan",
  contactTitle: "Co-Founder and CEO",
  painPoints: [],
  pages: [{ url: "https://rocketlane.com/", text: "some text" }],
};

describe("R-41 (§3.1) — never pitch a certification they already hold", () => {
  it("uses the migration angle for a certified company", () => {
    const prompt = buildDraftPrompt({
      ...base,
      signals: [],
      play: "migration",
      hook: { preferred: [], fallback: true, note: null },
      contradicted: false,
    });

    expect(prompt).toContain("ALREADY certified");
    expect(prompt).toContain("Do not offer to get them certified");
    expect(prompt).not.toContain("getting certified for the first time");
  });

  it("refuses the greenfield angle when R-24 has fired, even though play is greenfield", () => {
    // This is the case the rule exists for. cert_status is none or null, so FIT routes the
    // company to greenfield — but a verified quote names a certification, so the first-time
    // pitch is exactly the sentence that would destroy the email.
    const prompt = buildDraftPrompt({
      ...base,
      signals: [],
      play: "greenfield",
      hook: { preferred: [], fallback: true, note: null },
      contradicted: true,
    });

    expect(prompt).toContain("R-24 has fired");
    expect(prompt).toContain("NEVER offer to get them certified");
    // The greenfield brief must be absent entirely — that is the instruction that would have
    // produced the offending draft. Checking for the bare phrase "getting certified for the
    // first time" would not work here and was not a weaker test, it was the wrong one: the
    // contradiction brief *forbids* that exact phrase by quoting it, so a substring check
    // cannot tell an instruction from a prohibition. The brief's own sentence is the thing to
    // assert on.
    expect(prompt).not.toContain("has no compliance certification yet");
    expect(prompt).not.toContain(
      "The angle is getting certified for the first time without it consuming an engineer",
    );
  });

  it("still uses the greenfield angle for an ordinary uncertified company", () => {
    const prompt = buildDraftPrompt({
      ...base,
      signals: [],
      play: "greenfield",
      hook: { preferred: [], fallback: true, note: null },
      contradicted: false,
    });
    expect(prompt).toContain("has no compliance certification yet");
  });
});

describe("R-42 (§3.2) — a funding round alone cannot be the hook", () => {
  it("prefers a compliance-specific fact over funding when one survived", () => {
    const plan = planHook({
      signals: [
        sig("S-06", "Rocketlane Raises $60 Million in Series C"),
        sig("S-02", "Security, Compliance, and Reliability at Rocketlane"),
      ],
      certEvidence: null,
      certStatus: null,
    });

    expect(plan.fallback).toBe(false);
    expect(plan.preferred.map((p) => p.label)).toEqual(["S-02"]);
    // The funding quote is not offered as a hook candidate at all.
    expect(plan.preferred.map((p) => p.quote).join()).not.toContain("$60 Million");
  });

  it("falls back to funding only when nothing compliance-specific survived, and says so", () => {
    const plan = planHook({
      signals: [sig("S-06", "Rocketlane Raises $60 Million in Series C")],
      certEvidence: null,
      certStatus: null,
    });

    expect(plan.fallback).toBe(true);
    expect(plan.note).toContain("no compliance-specific fact survived");
  });

  it("ignores an asserted compliance signal — a rejected quote cannot become the hook", () => {
    const plan = planHook({
      signals: [sig("S-02", "Some trust page sentence", "asserted")],
      certEvidence: null,
      certStatus: null,
    });
    expect(plan.fallback).toBe(true);
  });

  it("counts the certification status itself as a compliance-specific fact", () => {
    const plan = planHook({
      signals: [],
      certEvidence: { quote: "We are pursuing SOC 2.", url: "https://acme.com/security" },
      certStatus: "in_progress",
    });
    expect(plan.fallback).toBe(false);
    expect(plan.preferred[0].label).toBe("cert_status: in_progress");
  });

  it("treats funding and vertical as context, not compliance evidence", () => {
    expect(COMPLIANCE_SIGNALS.has("S-06")).toBe(false);
    expect(COMPLIANCE_SIGNALS.has("S-07")).toBe(false);
    expect(COMPLIANCE_SIGNALS.has("S-04")).toBe(false);
    expect(COMPLIANCE_SIGNALS.has("S-02")).toBe(true);
  });

  it("writes the permitted hooks into the prompt and forbids opening on funding", () => {
    const prompt = buildDraftPrompt({
      ...base,
      signals: [],
      play: "greenfield",
      hook: {
        preferred: [
          { label: "S-02", quote: "Security, Compliance, and Reliability", url: "https://x/trust" },
        ],
        fallback: false,
        note: null,
      },
      contradicted: false,
    });

    expect(prompt).toContain("HOOK — R-42");
    expect(prompt).toContain("not on a funding round or a press mention");
    expect(prompt).toContain("Security, Compliance, and Reliability");
  });
});
