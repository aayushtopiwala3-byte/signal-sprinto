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
