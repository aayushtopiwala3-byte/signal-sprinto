import { describe, expect, it, beforeEach } from "vitest";
import {
  RESERVED_SLOTS,
  SIZE_DISCRETIONARY_BUDGET,
  driveableFields,
  orderByPathPriority,
  slotCandidates,
  slotFor,
  slotKind,
} from "@/lib/fetch/plan";
import { MAX_EXTRA_FETCHES } from "@/lib/pipeline/completeness";
import { awaitPoliteness, resetPoliteness, FETCH_DELAY_MS } from "@/lib/fetch/tiers";
import { parseRobots, MAX_CRAWL_DELAY_MS } from "@/lib/fetch/robots";

/**
 * §2.1 and §2.6. The cap did not move; who spends it did. v1 pooled all four extra fetches and
 * AI-2 spent every one of them on `size_band`, never once opening the security page that
 * carries S-01, S-02 and S-03.
 */

describe("the fetch budget is allocated, not pooled", () => {
  it("still allows exactly four extra fetches", () => {
    expect(MAX_EXTRA_FETCHES).toBe(4);
  });

  it("reserves the first two and leaves the rest to the model", () => {
    expect(slotKind(0)).toBe("reserved");
    expect(slotKind(1)).toBe("reserved");
    expect(slotKind(2)).toBe("discretionary");
    expect(slotKind(3)).toBe("discretionary");
    expect(RESERVED_SLOTS).toHaveLength(2);
  });

  it("spends slot 1 on security and slot 2 on careers, in that order", () => {
    const first = slotFor(0);
    const second = slotFor(1);
    expect(first.kind === "reserved" && first.purpose).toBe("security");
    expect(second.kind === "reserved" && second.purpose).toBe("careers");
  });

  it("tries /security before /privacy, and skips paths already read", () => {
    const slot = RESERVED_SLOTS[0];
    const urls = slotCandidates("example.com", slot, []);
    expect(urls[0]).toBe("https://example.com/security");
    expect(urls.indexOf("https://example.com/privacy")).toBeGreaterThan(
      urls.indexOf("https://example.com/trust"),
    );

    const afterSecurity = slotCandidates("example.com", slot, ["https://www.example.com/security/"]);
    expect(afterSecurity).not.toContain("https://example.com/security");
  });

  it("never lets a linked /privacy-policy outrank a guessed /security", () => {
    // The first live run after reserving the slots spent the security fetch on /privacy-policy
    // for four of eight companies, including whatfix and rocketlane, both of which publish a
    // 700+ word /trust page that was never opened. Every footer links a privacy policy, and
    // "/privacy-policy" contains "/privacy" — the last entry in SECURITY_PATHS. Site-published
    // links still go first, but only within the same path rank.
    const slot = RESERVED_SLOTS[0];
    const ordered = orderByPathPriority(
      [
        "https://whatfix.com/privacy-policy", // linked from the footer
        "https://whatfix.com/security", // a guess
        "https://whatfix.com/trust", // a guess, and the page that actually exists
      ],
      slot,
    );
    expect(ordered[0]).toBe("https://whatfix.com/security");
    expect(ordered[1]).toBe("https://whatfix.com/trust");
    expect(ordered[2]).toBe("https://whatfix.com/privacy-policy");
  });

  it("keeps a site-published link ahead of a guess at the same path", () => {
    const ordered = orderByPathPriority(
      ["https://acme.com/en/trust", "https://acme.com/trust"],
      RESERVED_SLOTS[0],
    );
    expect(ordered[0]).toBe("https://acme.com/en/trust");
  });

  it("ranks a URL matching no path last rather than dropping it", () => {
    const ordered = orderByPathPriority(
      ["https://acme.com/about", "https://acme.com/compliance"],
      RESERVED_SLOTS[0],
    );
    expect(ordered).toEqual(["https://acme.com/compliance", "https://acme.com/about"]);
  });
});

describe("size_band is demoted as a loop driver (§2.3)", () => {
  it("lets it drive exactly one discretionary choice", () => {
    expect(SIZE_DISCRETIONARY_BUDGET).toBe(1);
    expect(driveableFields(["size_band", "cert_status"], 0)).toContain("size_band");
    expect(driveableFields(["size_band", "cert_status"], 1)).not.toContain("size_band");
  });

  it("keeps the other fields in their priority order", () => {
    expect(driveableFields(["is_b2b_saas", "size_band", "cert_status"], 1)).toEqual([
      "is_b2b_saas",
      "cert_status",
    ]);
  });

  it("would rather spend the fetch than stop with budget unused", () => {
    // Returning [] here would end the loop early. A second look at the one unknown field beats
    // handing off with fetches still in hand.
    expect(driveableFields(["size_band"], 1)).toEqual(["size_band"]);
  });
});

describe("politeness (§2.6a)", () => {
  beforeEach(() => resetPoliteness());

  it("does not delay the first request to a host", async () => {
    expect(await awaitPoliteness("https://example.com/")).toBe(0);
  });

  it("delays the second request to the same host", async () => {
    await awaitPoliteness("https://example.com/");
    const waited = await awaitPoliteness("https://example.com/security");
    expect(waited).toBeGreaterThan(0);
    expect(waited).toBeLessThanOrEqual(FETCH_DELAY_MS);
  });

  it("never makes one company wait for another — different servers", async () => {
    await awaitPoliteness("https://example.com/");
    expect(await awaitPoliteness("https://other.com/")).toBe(0);
  });

  it("charges the gap between requests, not before each one", async () => {
    // §0.1: two reserved fetches cost one delay, not two. The measured wait is also reduced by
    // whatever time the cleaning and the model call already consumed.
    await awaitPoliteness("https://example.com/", 60);
    await new Promise((r) => setTimeout(r, 70));
    expect(await awaitPoliteness("https://example.com/a", 60)).toBe(0);
  });
});

describe("Crawl-delay (§2.6a)", () => {
  it("is read from the group that applies to us", () => {
    const rules = parseRobots("User-agent: *\nCrawl-delay: 2\nDisallow: /admin");
    expect(rules.crawl_delay_ms).toBe(2000);
  });

  it("prefers our own group over the wildcard", () => {
    const rules = parseRobots(
      "User-agent: *\nCrawl-delay: 1\n\nUser-agent: SignalBot\nCrawl-delay: 3",
    );
    expect(rules.crawl_delay_ms).toBe(3000);
  });

  it("is capped, because a 60s handler cannot honour a 60s delay and still read anything", () => {
    const rules = parseRobots("User-agent: *\nCrawl-delay: 120");
    expect(rules.crawl_delay_ms).toBe(MAX_CRAWL_DELAY_MS);
  });

  it("is null when the file does not set one", () => {
    expect(parseRobots("User-agent: *\nDisallow: /admin").crawl_delay_ms).toBeNull();
  });

  it("ignores a value that is not a positive number", () => {
    expect(parseRobots("User-agent: *\nCrawl-delay: later").crawl_delay_ms).toBeNull();
    expect(parseRobots("User-agent: *\nCrawl-delay: -5").crawl_delay_ms).toBeNull();
  });

  it("does not let Crawl-delay break the Allow/Disallow parsing around it", () => {
    const rules = parseRobots("User-agent: *\nCrawl-delay: 1\nDisallow: /admin\nAllow: /admin/ok");
    expect(rules.disallow).toContain("/admin");
    expect(rules.allow).toContain("/admin/ok");
  });
});
