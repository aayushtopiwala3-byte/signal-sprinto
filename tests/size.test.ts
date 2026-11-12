import { describe, expect, it } from "vitest";
import { bandForCount, bandForJobCount, inferSize, statedSize } from "@/lib/size/infer";
import { cleanHtml } from "@/lib/fetch/clean";

/**
 * §2.3. `size_band` was null on 7 of 8 companies after every extra fetch had been spent chasing
 * it, which meant R-02 could not fire and the board had no DROPs at all. These pin the three
 * sources, and — just as importantly — the cases that must *not* produce a band, because R-02
 * discards a company and a wrong DROP is worse than no DROP.
 */

const page = (text: string, url = "https://example.com/about") => ({ url, text });

describe("source 1 · a headcount the company stated itself", () => {
  it("reads the sentence whatfix.com actually publishes", () => {
    const found = statedSize([
      page("Whatfix continues to grow its international team, crossing 500 employees globally."),
    ]);
    expect(found?.source).toBe("stated");
    // "crossing 500" is a floor, not a point estimate, so it belongs above the 201-500 band.
    expect(found?.band).toBe("500+");
    expect(found?.evidence?.quote).toContain("crossing 500 employees globally");
  });

  it("handles the short form a page renders as a stat tile", () => {
    expect(statedSize([page("| 500 Employees")])?.band).toBe("201-500");
    expect(statedSize([page("We are a team of 40 people building for developers.")])?.band).toBe(
      "11-50",
    );
    expect(statedSize([page("A 12-person team, fully remote.")])?.band).toBe("11-50");
  });

  it("refuses a people-number that is about customers, not staff", () => {
    // atlan.com says this. Reading it as headcount would have dropped a fitting company on
    // R-02 using a figure about its users.
    expect(statedSize([page("We have onboarded 6,000 people onto the platform.")])).toBeNull();
    expect(statedSize([page("Trusted by 3,000 customers and 50,000 users worldwide.")])).toBeNull();
  });

  it("refuses a bare comma, which the first version of this regex matched", () => {
    expect(statedSize([page("Our team of , people is growing fast and we are hiring now.")])).toBeNull();
  });

  it("carries a verbatim quote, so the band can be checked against the page", () => {
    const text = "Today we are 220 employees across four offices.";
    const found = statedSize([page(text)]);
    expect(text).toContain(found!.evidence!.quote);
  });
});

describe("the cleaner must stop deleting the sentence (§2.3)", () => {
  it("keeps a three-word headcount block that the 8-word floor used to drop", () => {
    const html = `<div>| 500 Employees</div><p>${"filler words ".repeat(50)}</p>`;
    expect(cleanHtml(html).text).toContain("500 Employees");
  });

  it("keeps a headcount stated past the 2,000-token cap", () => {
    // whatfix.com states its headcount 72% of the way through /about-us, so v1 truncated it
    // away and then reported `not stated` as though the company had never said it.
    const filler = Array.from(
      { length: 400 },
      (_, i) => `<p>Sentence number ${i} about the product and its many enterprise customers.</p>`,
    ).join("");
    const html = `${filler}<p>Whatfix continues to grow its international team, crossing 500 employees globally.</p>`;
    const cleaned = cleanHtml(html);
    expect(cleaned.text.length).toBeLessThan(9_500);
    expect(cleaned.text).toContain("crossing 500 employees globally");
  });

  it("the rescued block is verbatim, so a quote taken from it still verifies", () => {
    const filler = "<p>Long marketing sentence that fills the token budget nicely.</p>".repeat(200);
    const sentence = "Our team of 320 employees works across three continents.";
    const cleaned = cleanHtml(`${filler}<p>${sentence}</p>`);
    const found = statedSize([page(cleaned.text)]);
    expect(cleaned.text).toContain(found!.evidence!.quote);
  });
});

describe("source 2 · counted from open roles", () => {
  it("maps role counts onto bands and never attaches a quote", () => {
    const careers = {
      url: "https://example.com/careers",
      text: "Open roles at Example.",
      job_links: Array.from({ length: 30 }, (_, i) => `https://example.com/careers/role-${i}`),
    };
    const result = inferSize({ pages: [careers] });
    expect(result.finding?.band).toBe("201-500");
    expect(result.finding?.source).toBe("inferred");
    // An inferred band has no sentence behind it. Attaching one would claim the company said
    // something it never said.
    expect(result.finding?.evidence).toBeNull();
    expect(result.finding?.method).toContain("estimate, not a stated figure");
  });

  it("infers nothing from zero listings, because zero is usually a JavaScript board", () => {
    // whatfix.com's careers page yields 0 links even through the reader tier. Reading that as
    // "small company" would feed R-02b, which drops companies.
    expect(bandForJobCount(0)).toBeNull();
    const result = inferSize({
      pages: [{ url: "https://example.com/careers", text: "Join us.", job_links: [] }],
    });
    expect(result.finding).toBeNull();
    expect(result.reason).toContain("rendered in JavaScript");
  });

  it("yields to a stated figure when both are available", () => {
    const result = inferSize({
      pages: [
        { url: "https://example.com/about", text: "We are a team of 30 people." },
        {
          url: "https://example.com/careers",
          text: "Roles",
          job_links: Array.from({ length: 40 }, (_, i) => `https://example.com/careers/r${i}`),
        },
      ],
    });
    expect(result.finding?.source).toBe("stated");
    expect(result.finding?.band).toBe("11-50");
  });
});

describe("source 3 · Hunter metadata", () => {
  it("reads a size field when the cached response carries one", () => {
    const result = inferSize({
      pages: [],
      hunterResponse: { organization: "Example", company_size: "201-500" },
    });
    expect(result.finding?.source).toBe("hunter");
    expect(result.finding?.band).toBe("201-500");
  });

  it("is silent when the field is absent, which is the common case", () => {
    const result = inferSize({ pages: [], hunterResponse: { organization: "Example" } });
    expect(result.finding).toBeNull();
    expect(result.reason).toContain("no headcount stated");
  });
});

describe("band boundaries", () => {
  it("treats an exact boundary as the band it closes, unless the number is a floor", () => {
    expect(bandForCount(500)).toBe("201-500");
    expect(bandForCount(500, true)).toBe("500+");
    expect(bandForCount(501)).toBe("500+");
    expect(bandForCount(10)).toBe("1-10");
    expect(bandForCount(10, true)).toBe("11-50");
  });
});
