import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPage, resetPoliteness } from "@/lib/fetch/tiers";
import { cleanHtml } from "@/lib/fetch/clean";

/**
 * Two faults found by running the sample set rather than by reading the code. Both are pinned
 * here because both are invisible in a unit test of the thing that broke — one showed up as a
 * handler timeout, the other as a Postgres error standing where a verdict should have been.
 */

afterEach(() => {
  vi.unstubAllGlobals();
  resetPoliteness();
});

/** Record every URL the tiers actually request, so escalation is observable. */
function stubFetch(handler: (url: string) => { status: number; body: string }) {
  const seen: string[] = [];
  vi.stubGlobal("fetch", async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString();
    seen.push(url);
    const { status, body } = handler(url);
    return new Response(body, { status });
  });
  return seen;
}

describe("a 404 does not escalate to the reader tier", () => {
  it("does not call r.jina.ai for a page the origin says is absent", async () => {
    const seen = stubFetch(() => ({ status: 404, body: "<html><body>Not found</body></html>" }));

    const outcome = await fetchPage("https://example.com/security", { delayMs: 0 });

    expect(seen).toEqual(["https://example.com/security"]);
    expect(seen.some((u) => u.includes("r.jina.ai"))).toBe(false);
    expect(outcome.page).toBeNull();
    expect(outcome.reason_code).toBe("not_found");
  });

  it("still escalates a 2xx page that was simply too thin to read", async () => {
    // A JavaScript app returns 200 with almost no text. The content exists; tier 1 cannot see
    // it. That is the case the reader tier was added for, and it must survive the 404 guard.
    const seen = stubFetch((url) =>
      url.includes("r.jina.ai")
        ? { status: 200, body: `# Security\n\n${"Readable sentence about our controls. ".repeat(60)}` }
        : { status: 200, body: "<html><body><div id=root></div></body></html>" },
    );

    const outcome = await fetchPage("https://example.com/security", { delayMs: 0 });

    expect(seen.some((u) => u.includes("r.jina.ai"))).toBe(true);
    expect(outcome.page?.words).toBeGreaterThan(200);
    expect(outcome.tier).toBe(2);
  });

  it("still escalates a 403, because a bot block is not a missing page", async () => {
    const seen = stubFetch((url) =>
      url.includes("r.jina.ai")
        ? { status: 200, body: `# Trust\n\n${"We hold a SOC 2 Type II report. ".repeat(80)}` }
        : { status: 403, body: "Forbidden" },
    );

    await fetchPage("https://example.com/trust", { delayMs: 0 });
    expect(seen.some((u) => u.includes("r.jina.ai"))).toBe(true);
  });
});

describe("a cache hit returns the page a cold fetch returned (§11)", () => {
  /** The real `page_cache` round-trip: everything goes through JSON on the way to Postgres. */
  function memoryCache() {
    const store = new Map<string, string>();
    return {
      rows: store,
      get: async (url: string) => {
        const raw = store.get(url);
        return raw === undefined
          ? null
          : (JSON.parse(raw) as {
              clean_text: string;
              tier: number;
              links: { url: string; label: string }[];
              job_links: string[];
            });
      },
      put: async (row: {
        url: string;
        tier: number;
        clean_text: string;
        word_count: number;
        links: { url: string; label: string }[];
        job_links: string[];
      }) => {
        store.set(
          row.url,
          JSON.stringify({
            clean_text: row.clean_text,
            tier: row.tier,
            links: row.links,
            job_links: row.job_links,
          }),
        );
      },
    };
  }

  const CAREERS = `<html><body><main>
    <h1>Careers at Nected</h1>
    <p>${"We are hiring across engineering, design and go to market teams this quarter. ".repeat(20)}</p>
    <a href="/use-cases/compliance-and-automation">Compliance and automation</a>
    <a href="/jobs/senior-backend-engineer">Senior Backend Engineer</a>
    <a href="/jobs/security-engineer">Security Engineer</a>
  </main></body></html>`;

  it("serves the same links and job links it served cold", async () => {
    // nected.ai scored SEND at 70 on a cold run and HOLD at 15 on a cached one. `page_cache`
    // stored `clean_text` alone, so a hit returned a page with no links — and nected's only
    // route to S-02 is a compliance page linked from its site, never a guessable path.
    const cache = memoryCache();
    stubFetch(() => ({ status: 200, body: CAREERS }));
    const url = "https://nected.ai/careers";

    const cold = await fetchPage(url, { delayMs: 0, cache });
    const warm = await fetchPage(url, { delayMs: 0, cache });

    expect(cold.cached).toBe(false);
    expect(warm.cached).toBe(true);
    expect(warm.page?.links).toEqual(cold.page?.links);
    expect(warm.page?.job_links).toEqual(cold.page?.job_links);
    expect(warm.page?.text).toBe(cold.page?.text);

    // Not a vacuous pass: the cold fetch really did find the link the verdict turned on.
    expect(cold.page?.links.map((l) => l.url)).toContain(
      "https://nected.ai/use-cases/compliance-and-automation",
    );
    expect(cold.page?.job_links.length).toBeGreaterThan(0);
  });

  it("treats a row written before link caching as a miss, so it repairs itself", async () => {
    // `getCachedPage` returns null when `links_json IS NULL`. Serving such a row would keep a
    // lossy hit alive for the rest of the TTL; refetching costs one request and fixes the row.
    const cache = memoryCache();
    const seen = stubFetch(() => ({ status: 200, body: CAREERS }));
    const url = "https://nected.ai/careers";

    await fetchPage(url, { delayMs: 0, cache });
    cache.rows.clear(); // what a NULL links_json row looks like to the caller: nothing
    const refetched = await fetchPage(url, { delayMs: 0, cache });

    expect(seen).toHaveLength(2);
    expect(refetched.cached).toBe(false);
    expect(refetched.page?.job_links.length).toBeGreaterThan(0);
  });
});

describe("control bytes never reach the database", () => {
  it("strips the NUL that crashed atlan.com mid-run", () => {
    // Postgres rejects the whole INSERT with `invalid byte sequence for encoding "UTF8": 0x00`,
    // so one stray byte in the markup replaced a verdict with a database error on the board.
    const html = `<p>We are a team of 40 people\u0000 building for developers everywhere today.</p>`;
    const cleaned = cleanHtml(html);
    expect(cleaned.text).not.toMatch(/\u0000/);
    expect(cleaned.text).toContain("team of 40 people");
  });

  it("leaves ordinary whitespace and accented text alone", () => {
    const cleaned = cleanHtml("<p>Our Montréal team\tships every week and loves em dashes — a lot.</p>");
    expect(cleaned.text).toContain("Montréal");
    expect(cleaned.text).toContain("—");
  });
});
