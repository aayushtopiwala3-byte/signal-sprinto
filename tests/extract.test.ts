import { describe, expect, it } from "vitest";
import { extractWithRules } from "@/lib/pipeline/extract";
import { EMPTY_EVIDENCE_MAP } from "@/lib/types";

/**
 * Rules-only extraction holds the same evidence standard as AI-1: no quote, no value.
 *
 * `is_b2b_saas = false` is the one field that ends the pipeline on its own (R-01 is a DROP), so
 * these cases concentrate on not reaching it by accident. A loose keyword here is not a scoring
 * inaccuracy — it is a fabricated rejection with a quote attached that does not support it.
 */

const URL = "https://example.com/";

function extract(text: string) {
  return extractWithRules(URL, text, EMPTY_EVIDENCE_MAP).evidence;
}

describe("rules-only extraction · is_b2b_saas", () => {
  it("does not read B2B software vocabulary as a consumer business", () => {
    const e = extract(
      "Rocketlane unifies every part of service delivery and powers it with AI agents that execute, govern, and learn.",
    );
    expect(e.is_b2b_saas).not.toBe(false);
  });

  it("does not reject a vendor that sells software to restaurants", () => {
    const e = extract("We build workflow automation software for restaurants and their suppliers.");
    expect(e.is_b2b_saas).toBe(true);
  });

  it("still catches a genuine consumer business", () => {
    const e = extract("Order food online from thousands of restaurants near you. Free shipping on your first order.");
    expect(e.is_b2b_saas).toBe(false);
    expect(e.is_b2b_saas_evidence?.quote).toContain("Order food online");
    expect(e.is_b2b_saas_evidence?.url).toBe(URL);
  });

  it("prefers the B2B reading when both vocabularies appear on one page", () => {
    const e = extract(
      "Shop now for our merch. Our platform helps teams ship faster with a modern API and integrations.",
    );
    expect(e.is_b2b_saas).toBe(true);
  });

  it("leaves the field null when the page says nothing either way", () => {
    const e = extract("We are a company. We care about our customers. Read our latest blog post.");
    expect(e.is_b2b_saas).toBeNull();
    expect(e.is_b2b_saas_evidence).toBeNull();
  });

  it("never populates a value without the quote that justifies it", () => {
    const e = extract("Our platform helps teams move faster. We have 120 employees.");
    for (const [value, ev] of [
      [e.is_b2b_saas, e.is_b2b_saas_evidence],
      [e.size_band, e.size_band_evidence],
      [e.cert_status, e.cert_status_evidence],
    ] as const) {
      if (value !== null) expect(ev, `populated ${String(value)} with no evidence`).not.toBeNull();
    }
  });
});
