import { aiCall } from "@/lib/ai/call";
import { NextPageSchema, buildNextPagePrompt, FALLBACK_PATHS } from "@/lib/ai/prompts/nextPage";
import type { LoopField } from "@/lib/types";

/**
 * ⑥ The loop controller (§7.3).
 *
 * AI-2 suggests a URL. This module decides whether to follow it. A suggestion is only honoured
 * when it is on the company's own site, in the candidate list we actually scraped, and not
 * already fetched — otherwise the deterministic fallback priority map takes over. That
 * division is the whole point: the model reads meaning, code keeps control.
 */

export type NextChoice = {
  url: string | null;
  reason: string;
  chosen_by: "ai" | "fallback" | "none";
  /** Which empty field the choice is meant to fill, for the loop trace. */
  targetField: LoopField | null;
};

function sameHost(url: string, domain: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const target = domain.replace(/^www\./, "");
    return host === target || host.endsWith(`.${target}`);
  } catch {
    return false;
  }
}

/**
 * Scheme and a leading `www.` are dropped so `https://x.com/careers` and `http://www.x.com/careers`
 * collapse to one entry. Sites link to both forms freely, and with only four extra fetches to
 * spend, re-reading the same page under a different host is budget the loop cannot get back.
 */
function canonical(url: string): string {
  try {
    const u = new URL(url);
    const host = u.host.replace(/^www\./, "");
    const path = u.pathname.replace(/\/$/, "");
    return `${host}${path}${u.search}`;
  } catch {
    return url;
  }
}

/**
 * The deterministic half. Walks the empty fields in priority order and takes the first
 * candidate URL whose path matches that field's preferred locations; failing that, constructs
 * the conventional path directly.
 */
export function fallbackChoice(input: {
  domain: string;
  emptyFields: readonly LoopField[];
  candidates: { url: string; label: string }[];
  alreadyFetched: string[];
}): NextChoice {
  const fetched = new Set(input.alreadyFetched.map(canonical));

  for (const field of input.emptyFields) {
    for (const wantedPath of FALLBACK_PATHS[field]) {
      const match = input.candidates.find((c) => {
        if (fetched.has(canonical(c.url))) return false;
        try {
          const path = new URL(c.url).pathname.replace(/\/$/, "") || "/";
          return path === wantedPath || path.startsWith(`${wantedPath}/`);
        } catch {
          return false;
        }
      });
      if (match) {
        return {
          url: match.url,
          reason: `fallback priority map: ${field} usually lives at ${wantedPath}, and that link exists on the site`,
          chosen_by: "fallback",
          targetField: field,
        };
      }
    }
  }

  // Nothing in the scraped links matched. Try the conventional path anyway — plenty of sites
  // have /security without linking to it from the homepage.
  for (const field of input.emptyFields) {
    for (const wantedPath of FALLBACK_PATHS[field]) {
      if (wantedPath === "/") continue;
      const guess = `https://${input.domain}${wantedPath}`;
      if (fetched.has(canonical(guess))) continue;
      return {
        url: guess,
        reason: `fallback priority map: no link to ${wantedPath} was found, trying the conventional path for ${field}`,
        chosen_by: "fallback",
        targetField: field,
      };
    }
  }

  return {
    url: null,
    reason: "no unfetched candidate remains for any empty field",
    chosen_by: "none",
    targetField: null,
  };
}

export async function chooseNextUrl(input: {
  domain: string;
  emptyFields: readonly LoopField[];
  candidates: { url: string; label: string }[];
  alreadyFetched: string[];
  runId: string | null;
  companyId: string | null;
  aiEnabled: boolean;
  budgetExhausted: boolean;
}): Promise<NextChoice> {
  if (input.emptyFields.length === 0) {
    return { url: null, reason: "nothing left to fill", chosen_by: "none", targetField: null };
  }

  const fetched = new Set(input.alreadyFetched.map(canonical));
  const available = input.candidates.filter((c) => !fetched.has(canonical(c.url)));

  if (available.length > 0) {
    const suggestion = await aiCall({
      callName: "AI-2 next page",
      prompt: buildNextPagePrompt({
        domain: input.domain,
        emptyFields: input.emptyFields,
        candidates: available,
        alreadyFetched: input.alreadyFetched,
      }),
      schema: NextPageSchema,
      runId: input.runId,
      companyId: input.companyId,
      aiEnabled: input.aiEnabled,
      budgetExhausted: input.budgetExhausted,
    });

    if (suggestion.ok) {
      const url = suggestion.data.next_url.trim();
      const known = available.some((c) => canonical(c.url) === canonical(url));

      // Code decides. Three independent reasons to refuse the model's choice.
      if (!sameHost(url, input.domain)) {
        const fb = fallbackChoice(input);
        return {
          ...fb,
          reason: `AI suggested ${url}, which is off-site — refused. ${fb.reason}`,
        };
      }
      if (fetched.has(canonical(url))) {
        const fb = fallbackChoice(input);
        return {
          ...fb,
          reason: `AI suggested ${url}, which we already fetched — refused. ${fb.reason}`,
        };
      }
      if (!known) {
        const fb = fallbackChoice(input);
        return {
          ...fb,
          reason: `AI suggested ${url}, which was not in the scraped candidate list — refused. ${fb.reason}`,
        };
      }

      const target = input.emptyFields.find(
        (f) => f === suggestion.data.which_field_it_should_fill,
      );
      return {
        url,
        reason: `AI-2: ${suggestion.data.reason} (targeting ${suggestion.data.which_field_it_should_fill})`,
        chosen_by: "ai",
        targetField: target ?? input.emptyFields[0],
      };
    }
  }

  return fallbackChoice(input);
}
