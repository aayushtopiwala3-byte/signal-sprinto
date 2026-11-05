/**
 * ③ Clean (§7.1). Strip chrome, drop short blocks, de-duplicate, cap at 2,000 tokens.
 *
 * Every AI call in §6 takes cleaned page text and never raw HTML, so this is the only place
 * markup is allowed to exist.
 */

/** ~4 characters per token is the standard rough conversion; the cap is a budget, not a tariff. */
export const TOKEN_CAP = 2000;
const CHARS_PER_TOKEN = 4;

const BLOCK_TAGS =
  /<\/?(?:p|div|section|article|header|footer|main|aside|ul|ol|li|h[1-6]|br|tr|td|th|table|blockquote|figcaption|dd|dt|label|option)\b[^>]*>/gi;

/** Chrome that carries no company-specific meaning and would otherwise dominate the budget. */
const STRIP_ELEMENTS = /<(script|style|noscript|svg|iframe|template|form|select)\b[^>]*>[\s\S]*?<\/\1>/gi;
const STRIP_SELF_CLOSING = /<(?:img|input|source|link|meta|br|hr)\b[^>]*\/?>/gi;
const STRIP_NAV = /<(nav|footer)\b[^>]*>[\s\S]*?<\/\1>/gi;
const COMMENTS = /<!--[\s\S]*?-->/g;

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
  trade: "™",
  reg: "®",
  copy: "©",
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[String(name).toLowerCase()] ?? m);
}

function safeCodePoint(n: number): string {
  if (!Number.isFinite(n) || n < 0 || n > 0x10ffff) return "";
  try {
    return String.fromCodePoint(n);
  } catch {
    return "";
  }
}

export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

export type CleanedPage = {
  /** Cleaned, de-duplicated, capped text — the only thing an AI call ever sees. */
  text: string;
  /** Word count of the cleaned text, which drives the tier-2 threshold. */
  words: number;
  /** Absolute, same-host candidate links for AI-2's shortlist. */
  links: { url: string; label: string }[];
  /** Page `<title>`, kept because it is often the clearest statement of what a company sells. */
  title: string | null;
};

/** Pull candidate links before the markup is destroyed. Same host only — we read their site. */
export function extractLinks(html: string, baseUrl: string): { url: string; label: string }[] {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }

  const out: { url: string; label: string }[] = [];
  const seen = new Set<string>();
  const anchor = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchor)) {
    const href = decodeEntities(match[1]).trim();
    if (!href || href.startsWith("#") || /^(?:mailto|tel|javascript):/i.test(href)) continue;

    let resolved: URL;
    try {
      resolved = new URL(href, base);
    } catch {
      continue;
    }
    if (resolved.protocol !== "https:" && resolved.protocol !== "http:") continue;

    // Same registrable host only, ignoring a `www.` difference.
    const strip = (h: string) => h.replace(/^www\./, "");
    if (strip(resolved.hostname) !== strip(base.hostname)) continue;

    resolved.hash = "";
    const url = resolved.toString().replace(/\/$/, "") || resolved.origin;
    if (seen.has(url)) continue;
    seen.add(url);

    const label = decodeEntities(match[2].replace(/<[^>]+>/g, " "))
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);

    out.push({ url, label });
    if (out.length >= 150) break;
  }

  return out;
}

export function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return null;
  const t = decodeEntities(m[1].replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
  return t.length > 0 ? t : null;
}

/**
 * The cleaner. `isMarkdown` skips the HTML-stripping stages for Jina Reader output, which is
 * already markdown and would otherwise survive intact anyway.
 */
export function cleanHtml(input: string, opts: { isMarkdown?: boolean } = {}): CleanedPage {
  const title = opts.isMarkdown ? null : extractTitle(input);

  let s = input;
  if (!opts.isMarkdown) {
    s = s.replace(COMMENTS, " ");
    s = s.replace(STRIP_ELEMENTS, " ");
    s = s.replace(STRIP_NAV, " ");
    s = s.replace(STRIP_SELF_CLOSING, " ");
    s = s.replace(BLOCK_TAGS, "\n");
    s = s.replace(/<[^>]+>/g, " ");
  } else {
    // Jina output: drop image embeds and link syntax, keep the prose.
    s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, " ");
    s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
    s = s.replace(/^#{1,6}\s*/gm, "");
  }

  s = decodeEntities(s);
  s = s.replace(/[ \t\u00a0]+/g, " ");

  const blocks: string[] = [];
  const seen = new Set<string>();

  for (const rawBlock of s.split(/\n+/)) {
    const block = rawBlock.trim();
    if (block.length === 0) continue;

    // Drop blocks under 8 words: that is nav labels, button text and legal boilerplate.
    if (wordCount(block) < 8) continue;

    const key = block.toLowerCase().replace(/[^a-z0-9 ]/g, "");
    if (seen.has(key)) continue;
    seen.add(key);

    blocks.push(block);
  }

  let text = blocks.join("\n");

  const capChars = TOKEN_CAP * CHARS_PER_TOKEN;
  if (text.length > capChars) {
    text = text.slice(0, capChars);
    // Cut at the last block boundary so a quote is never truncated mid-sentence and then
    // fails its own verbatim check later.
    const lastBreak = text.lastIndexOf("\n");
    if (lastBreak > capChars * 0.5) text = text.slice(0, lastBreak);
  }

  return {
    text,
    words: wordCount(text),
    links: [],
    title,
  };
}

/** Convenience wrapper that keeps links and title together with the text. */
export function cleanPage(html: string, url: string, isMarkdown = false): CleanedPage {
  const cleaned = cleanHtml(html, { isMarkdown });
  return { ...cleaned, links: isMarkdown ? [] : extractLinks(html, url) };
}
