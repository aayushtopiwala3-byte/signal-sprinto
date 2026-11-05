/**
 * The literal instruction every prompt must end with (§6). Kept in one place so it cannot
 * drift between the four touchpoints — and so that changing it forces a PROMPT_VERSION bump,
 * which invalidates the cache.
 */
export const NEVER_FABRICATE = `Use only the text provided. For any field you cannot support with a verbatim quote from that text, return the exact string "not stated". Do not infer, do not use outside knowledge, do not guess. Every non-null field must be accompanied by a quote copied character-for-character from the input.`;

/** Appended on the single retry, so the model sees exactly why its last answer was rejected. */
export function withValidationError(prompt: string, error: string): string {
  return `${prompt}

YOUR PREVIOUS RESPONSE WAS REJECTED. The validation error was:
${error}

Return corrected JSON that satisfies the schema exactly. Do not explain the error, return only the JSON object.`;
}

export function jsonOnly(shape: string): string {
  return `Return a single JSON object and nothing else. No markdown fence, no prose before or after.

Schema:
${shape}`;
}
