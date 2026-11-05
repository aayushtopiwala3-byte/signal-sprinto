import { describe, it, expect } from "vitest";
import {
  checkQuote,
  validateDraft,
  validatePainPoints,
  normalizeForComparison,
  type Source,
} from "@/lib/rules/evidenceValidator";
import { NOT_STATED } from "@/lib/types";

const SOURCES: Source[] = [
  {
    url: "https://example.com/security",
    text: "Our SOC 2 Type II audit is currently in progress and we expect the report next quarter. We encrypt all customer data at rest.",
  },
  {
    url: "https://example.com/careers",
    text: "We are hiring a Security Engineer to build our compliance programme from the ground up.",
  },
];

describe("T-10 — a draft with an unsupported hook is blocked, never sent (§7.1 ⑩)", () => {
  it("blocks a draft whose hook quote appears nowhere in the source text", () => {
    const result = validateDraft(
      {
        hook_quote: "We are proud to be the industry leader in compliance automation.",
        hook_url: "https://example.com/security",
        body: "...",
      },
      SOURCES,
    );
    expect(result.validated).toBe(false);
    expect(result.blocked_reason).toContain("Hook evidence failed");
  });

  it("validates a draft whose hook quote appears verbatim", () => {
    const result = validateDraft(
      {
        hook_quote: "Our SOC 2 Type II audit is currently in progress",
        hook_url: "https://example.com/security",
        body: "...",
      },
      SOURCES,
    );
    expect(result.validated).toBe(true);
    expect(result.blocked_reason).toBeNull();
    expect(result.hook_url).toBe("https://example.com/security");
  });

  it("blocks a draft with no hook quote at all", () => {
    const result = validateDraft({ hook_quote: null, hook_url: null, body: "..." }, SOURCES);
    expect(result.validated).toBe(false);
    expect(result.blocked_reason).toContain("no quote was supplied");
  });

  it("corrects the url when the model attributes a real quote to the wrong page", () => {
    const result = validateDraft(
      {
        hook_quote: "We are hiring a Security Engineer to build our compliance programme",
        hook_url: "https://example.com/security",
        body: "...",
      },
      SOURCES,
    );
    expect(result.validated).toBe(true);
    expect(result.hook_url).toBe("https://example.com/careers");
  });
});

describe("quote checking tolerates typography but never paraphrase", () => {
  it("accepts curly quotes and non-breaking spaces as equivalent", () => {
    const sources: Source[] = [
      { url: "https://e.com/", text: "We\u00a0don\u2019t compromise on our customers\u2019 security." },
    ];
    expect(checkQuote("We don't compromise on our customers' security.", sources).valid).toBe(true);
  });

  it("rejects a paraphrase that changes a single word", () => {
    expect(
      checkQuote("Our SOC 2 Type I audit is currently in progress", SOURCES).valid,
    ).toBe(false);
  });

  it("rejects a quote too short to be evidence", () => {
    const check = checkQuote("SOC 2", SOURCES);
    expect(check.valid).toBe(false);
    if (!check.valid) expect(check.reason).toContain("below the 25-character minimum");
  });

  it("rejects the literal string `not stated` as a quote", () => {
    const check = checkQuote(NOT_STATED, SOURCES);
    expect(check.valid).toBe(false);
  });

  it("normalises only whitespace and typography, never letters", () => {
    expect(normalizeForComparison("A  B\u2014C")).toBe("a b-c");
  });
});

describe("AI-3 pain points are rejected in code, not trusted (§6)", () => {
  it("replaces an unsupported pain point with the literal string `not stated`", () => {
    const result = validatePainPoints(
      [
        {
          text: "They are mid-audit.",
          quote: "Our SOC 2 Type II audit is currently in progress",
          url: "https://example.com/security",
        },
        {
          text: "They are losing enterprise deals.",
          quote: "We lose six-figure deals every quarter to security reviews.",
          url: "https://example.com/security",
        },
      ],
      SOURCES,
    );
    expect(result[0].validated).toBe(true);
    expect(result[1].validated).toBe(false);
    expect(result[1].text).toBe(NOT_STATED);
    expect(result[1].quote).toBeNull();
  });

  it("always returns exactly two entries, padding with `not stated`", () => {
    const result = validatePainPoints([], SOURCES);
    expect(result).toHaveLength(2);
    expect(result.every((p) => p.text === NOT_STATED && !p.validated)).toBe(true);
  });
});
