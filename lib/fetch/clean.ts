import { HEADCOUNT_FACT } from "@/lib/size/infer";

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
  /**
   * Links that look like individual job postings, counted by `lib/size/infer.ts`. Kept separate
   * from `links` because these may be off-host (Greenhouse, Lever, Ashby) and AI-2 must never be
   * offered an off-site page to fetch.
   */
  job_links: string[];
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

/** Applicant-tracking hosts. A careers page that links here keeps its listings off-domain. */
const ATS_HOST =
  /\b(?:boards\.greenhouse\.io|job-boards\.greenhouse\.io|jobs\.lever\.co|jobs\.ashbyhq\.com|apply\.workable\.com|[\w-]+\.recruitee\.com|[\w-]+\.bamboohr\.com|[\w-]+\.freshteam\.com|jobs\.smartrecruiters\.com|[\w-]+\.myworkdayjobs\.com|[\w-]+\.darwinbox\.in|[\w-]+\.keka\.com|[\w-]+\.zohorecruit\.com)\b/i;

/** A path that names one posting rather than the board itself: /careers/senior-engineer. */
const JOB_DETAIL_PATH = /\/(?:careers?|jobs?|openings?|positions?|vacancies)\/[^/]+/i;

/**
 * Count links that point at a single job posting. This is the input to §2.3's headcount
 * inference, and it is deliberately conservative: a board rendered in JavaScript produces zero
 * links, and `inferSize` treats zero as "could not measure" rather than "small company".
 */
export function extractJobLinks(html: string, baseUrl: string): string[] {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }

  const found = new Set<string>();
  for (const match of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["']/gi)) {
    const href = decodeEntities(match[1]).trim();
    if (!href || href.startsWith("#")) continue;
    let url: URL;
    try {
      url = new URL(href, base);
    } catch {
      continue;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") continue;

    const isAts = ATS_HOST.test(url.hostname);
    const isDetail = JOB_DETAIL_PATH.test(url.pathname);
    // An ATS *board* root is one link, not one job; require a path segment under it too.
    if (isAts && url.pathname.split("/").filter(Boolean).length < 2) continue;
    if (!isAts && !isDetail) continue;

    url.hash = "";
    url.search = "";
    found.add(url.toString().replace(/\/$/, ""));
    if (found.size >= 300) break;
  }
  return [...found];
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
  const facts: string[] = [];

  for (const rawBlock of s.split(/\n+/)) {
    const block = rawBlock.trim();
    if (block.length === 0) continue;

    // A stated headcount is often a three-word block — "| 500 Employees" — and the 8-word floor
    // deleted it. Two words is enough when the block is a headcount statement; the pattern is
    // narrow enough that nav labels do not match it.
    const isFact = block.length <= 300 && HEADCOUNT_FACT.test(block);

    // Drop blocks under 8 words: that is nav labels, button text and legal boilerplate.
    if (!isFact && wordCount(block) < 8) continue;
    if (isFact && wordCount(block) < 2) continue;

    const key = block.toLowerCase().replace(/[^a-z0-9 ]/g, "");
    if (seen.has(key)) continue;
    seen.add(key);

    if (isFact) facts.push(block);
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

    // The cap is a cost control. It must not decide which facts exist — and on whatfix.com it
    // was doing exactly that: "crossing 500 employees globally" sits 72% of the way through
    // /about-us, so the page we kept said nothing about headcount and R-02 could never fire.
    // Headcount blocks are re-appended verbatim (so any quote taken from them still verifies
    // against the page) and capped hard, because the point is to keep a sentence, not a section.
    const kept = new Set(text.split("\n"));
    const rescued = facts.filter((f) => !kept.has(f)).slice(0, 4);
    if (rescued.length > 0) text = `${text}\n${rescued.join("\n")}`;
  }

  return {
    text,
    words: wordCount(text),
    links: [],
    job_links: [],
    title,
  };
}

/** Convenience wrapper that keeps links and title together with the text. */
export function cleanPage(html: string, url: string, isMarkdown = false): CleanedPage {
  const cleaned = cleanHtml(html, { isMarkdown });
  return {
    ...cleaned,
    links: isMarkdown ? [] : extractLinks(html, url),
    // Jina Reader output keeps markdown links, so job postings are still countable there — which
    // matters, because a JS-rendered board is exactly the case tier 2 exists for.
    job_links: isMarkdown ? extractMarkdownJobLinks(html, url) : extractJobLinks(html, url),
  };
}

/** The same count, over Jina's `[label](url)` output instead of anchors. */
export function extractMarkdownJobLinks(markdown: string, baseUrl: string): string[] {
  const anchors = [...markdown.matchAll(/\[[^\]]*\]\(([^)\s]+)[^)]*\)/g)]
    .map((m) => `<a href="${m[1]}">`)
    .join("");
  return extractJobLinks(anchors, baseUrl);
}
