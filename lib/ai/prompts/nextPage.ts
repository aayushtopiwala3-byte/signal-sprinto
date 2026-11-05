import { z } from "zod";
import { jsonOnly } from "@/lib/ai/prompts/shared";
import type { LoopField } from "@/lib/types";

/**
 * AI-2 · Choose the next page to fetch (§6).
 *
 * The model only suggests. Code decides whether to fetch, using the §7.3 cap and the
 * deterministic fallback priority map below when the suggestion is unreachable or off-site.
 */

export const NextPageSchema = z.object({
  next_url: z.string().min(1),
  which_field_it_should_fill: z.string().min(1),
  reason: z.string().min(1),
});

export type NextPageOutput = z.infer<typeof NextPageSchema>;

/**
 * The fallback priority map (§6, AI-2). Used when AI is off, when the model's suggestion is
 * unreachable, or when it points somewhere we will not follow.
 */
export const FALLBACK_PATHS: Record<LoopField, string[]> = {
  size_band: ["/careers", "/about", "/team", "/jobs", "/company"],
  cert_status: ["/security", "/trust", "/compliance", "/legal", "/privacy"],
  is_b2b_saas: ["/", "/product", "/pricing", "/platform", "/solutions"],
  pressure_signals: ["/customers", "/pricing", "/blog", "/case-studies", "/enterprise"],
};

const SHAPE = `{
  "next_url": "absolute URL chosen from the candidate list",
  "which_field_it_should_fill": "is_b2b_saas | cert_status | size_band | pressure_signals",
  "reason": "one short sentence"
}`;

export function buildNextPagePrompt(input: {
  domain: string;
  emptyFields: readonly LoopField[];
  candidates: { url: string; label: string }[];
  alreadyFetched: string[];
}): string {
  const list = input.candidates
    .slice(0, 60)
    .map((c) => `- ${c.url}${c.label ? `  (link text: "${c.label}")` : ""}`)
    .join("\n");

  return `You are helping decide which single page to read next on ${input.domain}.

Still missing: ${input.emptyFields.join(", ")}

Already fetched, do not choose these again:
${input.alreadyFetched.map((u) => `- ${u}`).join("\n") || "- (none yet)"}

Candidate links found on the pages read so far:
${list || "- (none)"}

Where these facts usually live:
- size_band: /careers, /about, /team
- cert_status: /security, /trust, /compliance
- is_b2b_saas: /, /product, /pricing
- pressure_signals: /customers, /pricing, /blog

Choose exactly one URL from the candidate list that is most likely to fill a missing field.

${jsonOnly(SHAPE)}

Choose only from the candidate list above. Your choice is a suggestion: the system decides whether to follow it.`;
}
