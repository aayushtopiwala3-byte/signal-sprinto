import { describe, it, expect } from "vitest";
import {
  normalizeDomain,
  normalizeBatch,
  splitDomainInput,
} from "@/lib/fetch/normalizeDomain";
import { SAMPLE_DOMAINS } from "@/lib/seed/sampleDomains";

describe("T-01 — aggressive normalisation (§4.1)", () => {
  it("collapses a messy URL to a bare domain", () => {
    const result = normalizeDomain("  HTTPS://Rocketlane.com/pricing?utm_source=x  ");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.domain).toBe("rocketlane.com");
  });

  it.each([
    ["http://www.rocketlane.com", "rocketlane.com"],
    ["//Rocketlane.COM/", "rocketlane.com"],
    ["rocketlane.com:443/path#frag", "rocketlane.com"],
    ["user:pw@rocketlane.com/x", "rocketlane.com"],
    ["WWW.Rocketlane.com.", "rocketlane.com"],
    ["https://sub.rocketlane.com/a/b?c=d", "sub.rocketlane.com"],
  ])("normalises %s to %s", (input, expected) => {
    const r = normalizeDomain(input);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.domain).toBe(expected);
  });

  it.each(["not a domain", "rocketlane", "-bad.com", "", "   ", "http://", ".com"])(
    "quarantines %j as invalid_domain",
    (input) => {
      const r = normalizeDomain(input);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason_code).toBe("invalid_domain");
    },
  );
});

describe("T-02 — de-duplication after normalisation (§4.1)", () => {
  it("collapses three rocketlane entries into one company", () => {
    const batch = normalizeBatch([
      "rocketlane.com",
      "  HTTPS://Rocketlane.com/pricing?utm_source=x  ",
      "rocketlane.com",
    ]);
    expect(batch.domains).toHaveLength(1);
    expect(batch.domains[0].domain).toBe("rocketlane.com");
    expect(batch.duplicates_removed).toBe(2);
  });

  it("reduces the 12 sample entries to 10 unique domains with 2 duplicates removed", () => {
    const batch = normalizeBatch(SAMPLE_DOMAINS);
    expect(batch.submitted).toBe(12);
    expect(batch.duplicates_removed).toBe(2);
    expect(batch.domains).toHaveLength(10);
    // One company means one Hunter credit for rocketlane.com.
    expect(batch.domains.filter((d) => d.domain === "rocketlane.com")).toHaveLength(1);
  });

  it("preserves first-seen order", () => {
    const batch = normalizeBatch(SAMPLE_DOMAINS);
    expect(batch.domains.map((d) => d.domain).slice(0, 4)).toEqual([
      "rocketlane.com",
      "zipy.ai",
      "nected.ai",
      "springworks.in",
    ]);
  });

  it("separates invalid entries from duplicates rather than conflating them", () => {
    const batch = normalizeBatch(["rocketlane.com", "rocketlane.com", "nonsense"]);
    expect(batch.duplicates_removed).toBe(1);
    expect(batch.invalid).toHaveLength(1);
    expect(batch.invalid[0].reason_code).toBe("invalid_domain");
  });
});

describe("input splitting (§4.1)", () => {
  it("accepts newline and comma separation mixed freely", () => {
    expect(splitDomainInput("a.com\nb.com, c.com\n\n d.com ")).toEqual([
      "a.com",
      "b.com",
      "c.com",
      "d.com",
    ]);
  });
});
