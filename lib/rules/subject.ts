/**
 * R-40 · The subject line is checked in code, not asked for in the prompt (§4.3, F-9).
 *
 * F-9 was `maintaining zipy's soc 2 type ii` — lowercase, and cut off mid-phrase after a
 * trailing "ii" that reads as an abandoned sentence. The prompt had asked for "under 60
 * characters, lower-case, specific", so the model did exactly what it was told. Asking more
 * politely would not have fixed it; the prompt and the check have to disagree, with the check
 * winning, or there is nothing to catch a bad generation.
 *
 * Four defects, each one a rule:
 *
 *  - **Entirely lowercase.** Reads as a draft someone forgot to finish. Sentence case means the
 *    first character is a capital, not that every word is.
 *  - **Ends on a preposition or article.** The signature of a truncated phrase: "soc 2 type ii
 *    for", "a look at the". A subject may legitimately end on a noun; it may not end on a word
 *    that promises another one.
 *  - **Over 60 characters.** Gmail truncates around there, and a subject the reader sees cut
 *    off is worse than a shorter one.
 *  - **Outside 4–9 words.** Under four is a fragment; over nine is a sentence.
 *
 * `checkSubject` reports; the caller decides whether to regenerate. Nothing here rewrites the
 * model's words — a subject patched into compliance by string surgery would read like one.
 */

export const SUBJECT_MAX_CHARS = 60;
export const SUBJECT_MIN_WORDS = 4;
export const SUBJECT_MAX_WORDS = 9;

/**
 * Words that cannot end a subject line. Articles and prepositions both leave the phrase owing
 * the reader a noun. Conjunctions are here for the same reason.
 */
const DANGLING = new Set([
  // articles
  "a", "an", "the",
  // prepositions
  "about", "above", "across", "after", "against", "along", "among", "around", "as", "at",
  "before", "behind", "below", "beneath", "beside", "between", "beyond", "but", "by",
  "despite", "down", "during", "except", "for", "from", "in", "inside", "into", "like",
  "near", "of", "off", "on", "onto", "out", "outside", "over", "past", "since", "through",
  "throughout", "to", "toward", "towards", "under", "underneath", "until", "up", "upon",
  "with", "within", "without",
  // conjunctions
  "and", "or", "nor", "so", "yet", "because", "while", "whereas",
]);

export type SubjectCheck = {
  ok: boolean;
  /** Every rule the subject broke, in a form that can go straight into a retry prompt. */
  problems: string[];
};

export function subjectWords(subject: string): string[] {
  return subject.trim().split(/\s+/).filter((w) => w.length > 0);
}

/** True when the subject contains no uppercase letter at all. */
export function isAllLowercase(subject: string): boolean {
  return subject === subject.toLowerCase() && /[a-z]/.test(subject);
}

export function endsDangling(subject: string): boolean {
  const words = subjectWords(subject);
  const last = words[words.length - 1];
  if (!last) return false;
  // Strip trailing punctuation so "…for," and "…for" are judged the same.
  const bare = last.replace(/[^\p{L}\p{N}']+$/u, "").toLowerCase();
  return DANGLING.has(bare);
}

export function checkSubject(subject: string): SubjectCheck {
  const problems: string[] = [];
  const trimmed = subject.trim();
  const words = subjectWords(trimmed);

  if (trimmed.length === 0) {
    return { ok: false, problems: ["The subject is empty."] };
  }

  if (trimmed.length > SUBJECT_MAX_CHARS) {
    problems.push(
      `It is ${trimmed.length} characters; the limit is ${SUBJECT_MAX_CHARS}, because Gmail truncates past that.`,
    );
  }

  if (isAllLowercase(trimmed)) {
    problems.push(
      "It is entirely lowercase. Use sentence case: capitalise the first word and any proper nouns, and nothing else.",
    );
  }

  if (endsDangling(trimmed)) {
    problems.push(
      `It ends on "${words[words.length - 1]}", which leaves the phrase unfinished. End on the noun the phrase is about.`,
    );
  }

  if (words.length < SUBJECT_MIN_WORDS) {
    problems.push(`It is ${words.length} word(s); use at least ${SUBJECT_MIN_WORDS}.`);
  } else if (words.length > SUBJECT_MAX_WORDS) {
    problems.push(`It is ${words.length} words; use at most ${SUBJECT_MAX_WORDS}.`);
  }

  return { ok: problems.length === 0, problems };
}

/** The correction appended to the retry prompt when a first subject fails. */
export function subjectRetryNote(check: SubjectCheck): string {
  return [
    "Your previous subject line was rejected by a code-side check. Fix exactly these problems and keep the body unchanged:",
    ...check.problems.map((p) => `- ${p}`),
  ].join("\n");
}
