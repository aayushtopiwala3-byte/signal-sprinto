/**
 * ① The robots.txt gate (§7.1). Runs before any page fetch, and its own request is never
 * recorded in `fetches` — that is what makes T-08 ("quarantined with zero page fetches
 * recorded") observable rather than merely intended.
 */

export const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 SignalBot/1.0";

/** The token we match against `User-agent:` groups. */
export const UA_TOKEN = "signalbot";

export type RobotsRules = {
  allow: string[];
  disallow: string[];
};

export type RobotsGate =
  | { allowed: true; rules: RobotsRules; note: string }
  | { allowed: false; reason_code: "robots_disallow" | "unreachable"; reason_text: string };

/**
 * Parse robots.txt into the single group that applies to us. A group for our own token wins
 * over the `*` group; consecutive `User-agent:` lines share one group, per the standard.
 */
export function parseRobots(text: string): RobotsRules {
  const starRules: RobotsRules = { allow: [], disallow: [] };
  const ourRules: RobotsRules = { allow: [], disallow: [] };
  let sawOurGroup = false;

  let activeAgents: string[] = [];
  let expectingAgents = true;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split("#")[0].trim();
    if (line.length === 0) continue;

    const sep = line.indexOf(":");
    if (sep === -1) continue;
    const field = line.slice(0, sep).trim().toLowerCase();
    const value = line.slice(sep + 1).trim();

    if (field === "user-agent") {
      if (!expectingAgents) {
        activeAgents = [];
        expectingAgents = true;
      }
      activeAgents.push(value.toLowerCase());
      continue;
    }

    if (field !== "allow" && field !== "disallow") continue;
    expectingAgents = false;

    for (const agent of activeAgents) {
      const target = agent === UA_TOKEN ? ourRules : agent === "*" ? starRules : null;
      if (!target) continue;
      if (agent === UA_TOKEN) sawOurGroup = true;
      target[field].push(value);
    }
  }

  return sawOurGroup ? ourRules : starRules;
}

/** Longest-match-wins, Allow breaking ties, as the de-facto standard specifies. */
export function isPathAllowed(rules: RobotsRules, path: string): boolean {
  const match = (pattern: string): number => {
    // An empty Disallow value means "allow everything" and matches nothing.
    if (pattern === "") return -1;
    const literal = pattern.replace(/\*+$/, "");
    return path.startsWith(literal) ? literal.length : -1;
  };

  let bestDisallow = -1;
  let bestAllow = -1;
  for (const p of rules.disallow) bestDisallow = Math.max(bestDisallow, match(p));
  for (const p of rules.allow) bestAllow = Math.max(bestAllow, match(p));

  if (bestDisallow === -1) return true;
  return bestAllow >= bestDisallow;
}

export async function checkRobots(domain: string, timeoutMs = 8000): Promise<RobotsGate> {
  const url = `https://${domain}/robots.txt`;
  let response: Response;

  try {
    response = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "text/plain,*/*" },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
    });
  } catch (err) {
    // DNS failure, TLS failure, connection refused or timeout. The host is not reachable at
    // all, so there is nothing to crawl and nothing to score. This is T-09's dead domain.
    return {
      allowed: false,
      reason_code: "unreachable",
      reason_text: `${domain} could not be reached: ${describe(err)}. No pages were fetched.`,
    };
  }

  // 404/410 is the normal "no robots.txt" case and means everything is permitted.
  if (response.status === 404 || response.status === 410) {
    return {
      allowed: true,
      rules: { allow: [], disallow: [] },
      note: "no robots.txt published, crawling permitted",
    };
  }

  if (!response.ok) {
    return {
      allowed: false,
      reason_code: "unreachable",
      reason_text: `${domain}/robots.txt returned HTTP ${response.status}, so crawl permission could not be established. No pages were fetched.`,
    };
  }

  const rules = parseRobots(await response.text());

  if (!isPathAllowed(rules, "/")) {
    return {
      allowed: false,
      reason_code: "robots_disallow",
      reason_text: `${domain}/robots.txt disallows "/" for our user agent. No pages were fetched.`,
    };
  }

  return { allowed: true, rules, note: "robots.txt allows crawling" };
}

function describe(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "TimeoutError") return "request timed out";
    return err.message;
  }
  return String(err);
}
