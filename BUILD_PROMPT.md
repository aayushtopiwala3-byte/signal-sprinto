# Signal — Build Prompt

> Paste everything below the line into Claude Code in an **empty repo**.

---

# Signal — Sprinto outbound qualification & drafting agent

## 0. How to run this prompt

You are building a complete, deployed web app from scratch in this empty repo.

Work in the phases in §14. After each phase: run the app, run `npm run test`, fix every
error, then continue. **Do not ask me questions unless a required env var is missing** —
make sensible decisions, record each one in `DECISIONS.md`, and keep going.

Before writing code, write `PLAN.md` (file tree, data model, phase order) and follow it.

Two rules that override your instincts throughout:

1. **Rules decide, AI explains.** Every verdict, score, gate and completeness check is
   plain TypeScript. The model is used only where meaning must be read out of prose.
   If you find yourself asking the model to decide something, you have made a mistake.
2. **Never fabricate.** Every claim shown to a user traces to a verbatim quote plus a
   live URL, or displays the literal string `not stated`. There is no third option.

---

## 1. Mission

A Growth Lead at Sprinto (a compliance-automation SaaS) spends ~3 hours a week researching
companies and writing cold emails. By email nine the quality has collapsed — not because
the companies are worse fits, but because the person writing is tired.

**Signal** takes a list of company domains, reads each company's own public pages, runs an
**agent loop** that keeps fetching until named fields are filled or a hard cap is hit,
applies a **deterministic rules engine** to produce a verdict (Send / Hold / Drop), finds
the right person to contact, extracts two evidenced pain points, and drafts an email whose
hook cites a verbatim quote from the company's own site. The Growth Lead approves, edits or
rejects each one; approved emails send via Gmail to a hardcoded inbox.

**Done** = a stranger opens the live URL with no login, clicks *Load sample data*, runs 12
domains, sees companies **dropped with named reasons**, opens a Send card, clicks the hook's
source link and lands on the exact sentence quoted, and sends one email that arrives.

---

## 2. Non-negotiables (from the brief)

1. **All AI tasks must use Gemini Flash. Do not use the Claude API.** Pin the model id in
   `lib/ai/model.ts`, add a runtime guard that throws if the resolved id does not start with
   `gemini-`, and render the resolved model id in the site footer on every page.
2. **The outgoing `to:` address is hardcoded** to the value of `GMAIL_SEND_TO`. There is no
   UI field, no query param and no API parameter that can change the recipient. Render the
   lock visibly next to every send button: `to: <GMAIL_SEND_TO> (locked in code)`.
3. **Send via the Gmail API** (`users.messages.send`), OAuth2 refresh token, scope
   `https://www.googleapis.com/auth/gmail.send`.
4. **Point of contact comes from the Hunter.io API** (Domain Search).
5. **No login, no password, no paywall on any page a judge can reach.**
6. **The system must be repeatable** — same input must produce the same verdict, asserted
   by a test.
7. Deliverables: a live Vercel URL and a Components Map in the README.

---

## 3. Users and the judge's journey

The only user is the **Growth Lead**. A judge plays her.

1. Opens the live URL in incognito. The decision board loads with an empty state that says
   what to do next and offers **Load sample data**.
2. Clicks **Load sample data** → 12 domains populate the input, including domains that are
   *designed to fail*.
3. Optionally adjusts **ICP weight sliders** and **feature switches** in a panel that is
   visible on the main page, not buried in settings.
4. Clicks **Run**. Rows resolve **one at a time**, streaming in. Each row shows its current
   stage (`fetching`, `extracting`, `looping (2/4)`, `scoring`, `finding contact`, `drafting`).
5. The board fills with three columns: **Send now · Hold · Drop**, plus a **Quarantine** tab.
6. She opens a Drop card first. It names the rule that fired: `R-02: headcount 1,000 > 500`.
7. She opens a Send card. It shows: the verdict and score, every signal that contributed with
   its points and its quote, the named contact with the runner-up and why it lost, two pain
   points each with a verbatim quote and a live URL, and the draft email with its hook's
   source one click away.
8. She clicks **Approve & send**. The email arrives. The card turns green and names the
   transport used.
9. She **Rejects** another card and must give a reason. On the next run that company is
   suppressed and the reason appears in a *"What changed because of your feedback"* panel.

---

## 4. Inputs — exact formats

### 4.1 Domain input

A textarea accepting 1–20 entries, one per line or comma-separated. Normalise aggressively
before anything else:

- trim whitespace, lowercase
- strip scheme (`http://`, `https://`), `www.`, any path, query string and fragment
- reject anything that does not match `^[a-z0-9][a-z0-9-]*(\.[a-z0-9-]+)+$` → quarantine with
  reason `invalid_domain`
- **de-duplicate after normalisation**, and show `N duplicates removed` on the run header

So `  HTTPS://Rocketlane.com/pricing?utm_source=x  ` and `rocketlane.com` are **one** company
and cost **one** Hunter credit.

### 4.2 Sample data (the Load sample data button)

Seed exactly these 12, in this order. The failures are the point — never silently remove them.

```
rocketlane.com
zipy.ai
nected.ai
springworks.in
apty.io
whatfix.com
zomato.com
atlan.com
  HTTPS://Rocketlane.com/pricing?utm_source=x
rocketlane.com
sprinto-test-does-not-exist-9x.com
plivo.com
```

### 4.3 The Evidence Map — the four fields the loop is trying to fill

These four, and only these four, decide whether the loop keeps going. Store them on the
company row as nullable columns so emptiness is a database fact, not a model opinion.

| Field | Question it answers | Allowed values | Where it usually lives |
|---|---|---|---|
| `is_b2b_saas` | Do they sell software to businesses? | `true` / `false` / `null` | `/`, `/product`, `/pricing` |
| `cert_status` | Are they already certified? | `none` / `in_progress` / `certified` / `null` | `/security`, `/trust`, `/compliance` |
| `size_band` | How big, and what stage? | `1-10` / `11-50` / `51-200` / `201-500` / `500+` / `null` | `/careers`, `/about`, `/team` |
| `pressure_signals` | Is there compliance pressure? | array (may be empty, but **not** `null` once a page is read) | `/customers`, `/pricing`, `/security`, `/blog` |

Every field carries a companion `*_evidence` column: `{ quote: string, url: string }` or
`null`. **A field with a value but no evidence is invalid** — Zod rejects it and the extraction
is retried.

---

## 5. Decision logic (deterministic — all of §5 is plain TypeScript in `lib/rules/`)

### 5.1 FIT gate — binary, runs first, failure means DROP

| ID | Rule | Fail verdict and reason |
|---|---|---|
| R-01 | `is_b2b_saas === true` | `DROP — R-01: not B2B SaaS` |
| R-02 | `size_band` is not `500+` | `DROP — R-02: headcount above 500, has in-house GRC` |
| R-03 | Not a services/agency/consultancy business | `DROP — R-03: services business, not a software product` |
| R-04 | `cert_status !== 'certified'` **— switchable, see §5.5** | `DROP — R-04: already certified` |

If `is_b2b_saas` is still `null` after the loop cap, the verdict is **HOLD**, never DROP.
*We do not drop a company for a fact we failed to find.* Reason: `HOLD — fit unknown: is_b2b_saas not stated`.

### 5.2 TIMING signals — additive, each must carry evidence

| ID | Signal | Points | Independence group |
|---|---|---|---|
| S-01 | Own site says SOC 2 / ISO 27001 **in progress / coming soon / underway** | 40 | `certification` |
| S-02 | A security or trust page exists **with no badge on it** | 30 | `certification` |
| S-03 | An open role is their **first ever** security / compliance / GRC hire | 30 | `hiring` |
| S-04 | Enterprise customer logos out of proportion to headcount | 25 | `enterprise-demand` |
| S-05 | Pricing page's enterprise tier mentions SOC 2, security review, DPA or questionnaires | 15 | `enterprise-demand` |
| S-06 | Recent funding round | 10 | `funding` |
| S-07 | Sells into a regulated vertical (health, fintech, HR/payroll) | 15 | `vertical` |

**S-01 and S-02 are the same independence group on purpose** — they are two readings of the
same page, so stacking them must not manufacture a second "independent" signal.

### 5.3 Verdict

```
R-20  timing_score = sum of all fired signals
R-21  independent_signals = count of DISTINCT independence groups that fired

SEND  : timing_score >= 50 AND independent_signals >= 2
HOLD  : timing_score >= 50 AND independent_signals <  2   -> reason "R-21: only 1 independent signal"
HOLD  : 20 <= timing_score < 50                           -> reason "R-20: timing score X, below 50"
DROP  : timing_score < 20                                 -> reason "R-20: fit passed, no timing signal"
```

Tie-break for ordering inside a column: `timing_score` desc → `independent_signals` desc →
domain alphabetical. **Deterministic, with no `Math.random()` and no `Date.now()` anywhere in
`lib/rules/`.**

### 5.4 PoC ladder — R-30, headcount-conditional

| `size_band` | Rank 1 | Rank 2 | Rank 3 |
|---|---|---|---|
| `1-10`, `11-50` | CTO / Co-founder / Head of Engineering | Head of People / Ops | VP Sales |
| `51-200` | Head of Security / GRC / Compliance | CTO / VP Engineering | Head of People / COO |
| `201-500` | Head of Security / GRC / Compliance | VP Engineering | Head of Legal |

Rank candidates by `ladder_rank` first, then Hunter `confidence` desc. **Always store and
display the runner-up with the reason it lost** (`"ladder rank 2 vs 1"` / `"confidence 72 vs 91"`),
and give a one-click swap that re-drafts the email with the other person.

**Never select a contact whose Hunter `type` is `generic`** (`info@`, `hello@`, `sales@`).
If every candidate is generic → `HOLD — no named contact available`.

### 5.5 Feature switches (§5.5 is the customisation layer — all visible on the main page)

| Switch | Default | ON behaviour | OFF behaviour |
|---|---|---|---|
| `strict_icp` | **OFF** | R-04 active: certified companies are **dropped**, exactly as the course Evidence Map specifies | Certified companies route to the **migration play** — verdict HOLD, `play: migration`, ranked below every greenfield company, and the draft uses a migration-specific template |
| `ai_enabled` | ON | Gemini Flash runs all four AI touchpoints | **Rules-only mode**: regex + keyword extraction, verdicts still produced, orange `rules-only` banner on screen |
| `reader_enabled` | ON | Tier-2 Jina Reader fetch is allowed | Tier 1 only; thin pages go straight to the loop/quarantine |
| `auto_send` | **OFF** | Approved cards send without a second click | Every send needs an explicit human click |

Weight sliders for S-01…S-07 (range 0–50) sit beside the switches. Changing a weight
**re-ranks the existing board live** from stored signals, without re-fetching and without a
single new AI call. Show a `recalculated, no new fetches` note when it happens.

---

## 6. AI touchpoints — exactly four, all Gemini Flash, all strict JSON

Shared contract for every call: input is **cleaned page text, never raw HTML**, capped at
2,000 tokens. Output is JSON validated with Zod. On invalid JSON or a 5xx: **one retry with
the validation error appended to the prompt**, then switch transport to OpenRouter, then fall
back to rules-only mode and show the orange banner. Never silently default. Cache every call
by `sha256(model + promptVersion + inputText)`.

Every prompt ends with this literal instruction:

> Use only the text provided. For any field you cannot support with a verbatim quote from
> that text, return the exact string "not stated". Do not infer, do not use outside
> knowledge, do not guess. Every non-null field must be accompanied by a quote copied
> character-for-character from the input.

### AI-1 · Extract the Evidence Map fields
Input: cleaned text of one page + which fields are still empty.
Output: `{ is_b2b_saas, cert_status, size_band, pressure_signals[], and an evidence object for each }`.
Each evidence object: `{ quote, url }`. A populated field without a quote fails Zod → retry.

### AI-2 · Choose the next page to fetch (loop input only)
Input: the list of still-empty fields + the candidate link list scraped from the page.
Output: `{ next_url, which_field_it_should_fill, reason }`.
**The model only suggests. Code decides** whether to fetch, using the cap in §7.3 and a
deterministic fallback priority map if the model's suggestion is unreachable:
`size_band → /careers, /about, /team` · `cert_status → /security, /trust, /compliance, /legal` ·
`is_b2b_saas → /, /product, /pricing` · `pressure_signals → /customers, /pricing, /blog`.

### AI-3 · Two pain points
Input: all accumulated cleaned text + the fired signals.
Output: `{ pain_points: [{ text, quote, url }, { text, quote, url }] }`.
A pain point whose `quote` is absent or does not appear verbatim in the source text is
**rejected in code** and replaced with `not stated`.

### AI-4 · Draft the email
Input: contact name/title, the fired signals with quotes, the two pain points, the play
(`greenfield` or `migration`).
Output: `{ subject, body, hook_quote, hook_url }`.
Constraints in the prompt: under 150 words, no superlatives, no "I hope this finds you well",
first sentence must reference a company-specific fact, sign off as the Growth Lead.

---

## 7. Architecture and file tree

### 7.1 The pipeline, numbered

```
① robots.txt gate      → disallow or unreachable = QUARANTINE, before any fetch
② fetch tier 1         → plain GET, 8s timeout, browser UA
   fetch tier 2        → https://r.jina.ai/<url> if tier 1 yields < 200 clean words
   fetch tier 3        → stop. QUARANTINE with a named reason
③ clean                → strip nav/footer/script/style, drop blocks < 8 words, dedupe, cap 2k tokens
④ AI-1 extract         → populate Evidence Map fields + evidence
⑤ completeness check   → PLAIN CODE counts null fields. The model is never asked "is this enough?"
⑥ loop or score        → gaps remain AND fetches_used < 4 ? pick next page (AI-2 + code) : go to rules
⑦ rules engine         → FIT gate, TIMING stack, verdict (§5)
⑧ Hunter + PoC ladder  → only for companies that cleared FIT
⑨ AI-3 pain points     → each with a verbatim quote
⑩ AI-4 draft           → then the evidence validator: no quote in the hook = the draft cannot send
```

### 7.2 Vercel's 10-second limit

**Process one domain per HTTP request.** `POST /api/run/step` takes a `runId`, claims the next
`pending` company, runs ①–⑩ for that one company, persists, returns the result. The client
loops until the run reports done, rendering each row as it lands. Never write a single
long-running batch handler — it will time out on Hobby and the demo will die mid-run.

### 7.3 The loop controller — the centrepiece

```ts
const MAX_EXTRA_FETCHES = 4;   // set before any code was written. Do not make this dynamic.
```

Record a **loop trace** row for every iteration: which fields were empty, which URL was chosen,
why, whether the fetch succeeded, which fields it filled. **Render this trace on the company
detail page.** It is the single most important thing a judge can see, because it is the only
visible difference between this and a fixed pipeline.

At the cap, the answer is never "try harder". It is a handoff: verdict **HOLD**, with the
still-empty field named on the card and `4/4 fetches used`.

### 7.4 File tree

```
app/
  page.tsx                     decision board (Send / Hold / Drop) + controls + empty state
  company/[id]/page.tsx        why panel, loop trace, signals, contacts, pain points, draft
  quarantine/page.tsx          every refused domain with its named reason
  health/page.tsx              model id, Hunter quota meter, cost ledger, cache hits, data freshness
  selftest/page.tsx            runs the golden set, green/red per assertion
  api/run/start/route.ts
  api/run/step/route.ts        ONE domain per call
  api/send/route.ts            to: forced from env, ignores any body recipient
  api/feedback/route.ts
  api/selftest/route.ts
lib/
  ai/model.ts                  pinned id + runtime guard + resolveModelId()
  ai/call.ts                   JSON call, Zod validate, 1 retry, OpenRouter fallback, cost log, cache
  ai/prompts/{extract,nextPage,painPoints,draft}.ts
  fetch/robots.ts  fetch/tiers.ts  fetch/clean.ts  fetch/normalizeDomain.ts
  rules/fit.ts  rules/signals.ts  rules/verdict.ts  rules/poc.ts  rules/evidenceValidator.ts
  hunter/client.ts             limit=5, department filter, cache, quota guard at 80%
  mail/gmail.ts                base64url RFC-822
  mail/resend.ts               disclosed fallback
  mail/send.ts                 gmail -> resend -> fail loudly, records transport
  db/{schema.sql,client.ts,queries.ts}
  seed/{sampleDomains.ts,seededContacts.ts,goldenSet.ts}
tests/
  rules.test.ts  normalize.test.ts  determinism.test.ts  evidenceValidator.test.ts  poc.test.ts
```

---

## 8. Data model (Neon Postgres via `postgres.js`)

```sql
runs(id, started_at, finished_at, weights_json, switches_json, domains_submitted,
     duplicates_removed, status)

companies(id, run_id, domain, normalized_domain, status, stage,
          is_b2b_saas, is_b2b_saas_evidence_json,
          cert_status, cert_status_evidence_json,
          size_band, size_band_evidence_json,
          pressure_signals_json,
          verdict, timing_score, independent_signals, play,
          verdict_reason, rule_fired, fetches_used, created_at)

fetches(id, company_id, url, tier, status_code, word_count, ok, error, fetched_at)

loop_trace(id, company_id, iteration, empty_fields_json, chosen_url, chosen_reason,
           chosen_by, fields_filled_json, created_at)

signals(id, company_id, signal_id, points, independence_group, quote, source_url)

contacts(id, company_id, first_name, last_name, position, seniority, department,
         email, confidence, hunter_type, ladder_rank, selected, lost_reason, source)

pain_points(id, company_id, idx, text, quote, source_url, validated)

drafts(id, company_id, subject, body, hook_quote, hook_url, validated, blocked_reason,
       created_at)

sends(id, draft_id, to_address, transport, status, error, sent_at)

feedback(id, company_id, action, reason, created_at)

cost_ledger(id, run_id, company_id, call_name, model_id, tokens_in, tokens_out,
            cost_usd, cache_hit, transport, ok, error, created_at)

quarantine(id, run_id, domain, reason_code, reason_text, created_at)

settings(key, value_json, updated_at)
```

`cost_ledger` and `loop_trace` are not optional extras — they are two of the things a judge
is explicitly looking for.

---

## 9. UI and UX

Tailwind + shadcn/ui. Clean, dense, one accent colour. Mobile-readable (cards stack; the
board becomes tabs under `md`).

**Every page must answer "what should I do now, and why".** No page may ever render empty
on a judge path — every empty state names the next action and offers **Load sample data**.

### Decision board (`/`)
- Header: run status, `N domains · M duplicates removed · K quarantined`, model id, elapsed.
- Controls panel, visible not hidden: 7 weight sliders + 4 switches + Run + Load sample data.
- Three columns: **Send now · Hold · Drop**, each card showing domain, verdict chip, score,
  the fired rule or signal count, the contact's name and title, and a one-line hook preview.
- A **Quarantine** tab with every refused domain and its reason code.
- Search + filter + sort over the board (by score, by verdict, by signal group). A list a judge
  cannot filter reads as "it only collates".

### Company detail (`/company/[id]`)
Sections, in this order:
1. **Verdict and why** — the verdict, the exact rule ID that fired, and *what would change it*
   (e.g. `"One more independent signal would move this to Send"`).
2. **Signals** — each fired signal with points, group, the verbatim quote, and a live link.
3. **Loop trace** — the table from §7.3. Label it *"How it decided what to read next"*.
4. **Contact** — selected person and the runner-up with `lost_reason`, plus a swap button.
   Badge the source: `live` / `cached` / `seeded`.
5. **Pain points** — two, each with its quote and link, or the literal words `not stated`.
6. **Draft** — subject, body, and the hook with its source one click away. Editable.
   Approve / Edit / Reject (Reject requires a reason).

### Labelling rules (non-negotiable)
- Anything the model produced carries a small **AI** chip.
- Anything quoted from a source carries a **quote** chip with a live link.
- Anything missing shows the literal string `not stated` in muted type. Never blank, never guessed.
- The send button always sits next to `to: <address> (locked in code)`.

### Health (`/health`)
Resolved model id · Hunter quota meter read live from `GET /v2/account` with the 80% guard
state · cost ledger total for the run in ₹ and USD · cache-hit rate · last-run timestamp with
a **staleness banner** if older than 24h.

---

## 10. Environment variables (names only — create `.env.example` with names and comments only)

| Name | Purpose |
|---|---|
| `DATABASE_URL` | Neon Postgres |
| `GEMINI_API_KEY` | Google AI Studio, direct Gemini Flash |
| `OPENROUTER_API_KEY` | OpenRouter transport fallback, model pinned to Gemini Flash |
| `HUNTER_API_KEY` | Hunter.io Domain Search |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REFRESH_TOKEN` | Gmail send |
| `GMAIL_SEND_TO` | **The hardcoded recipient.** Read only on the server |
| `RESEND_API_KEY` / `EMAIL_FROM` | Disclosed send fallback |
| `NEXT_PUBLIC_SITE_URL` | Production URL used in links — must never be localhost |
| `AI_COST_CEILING_USD` | Per-run spend cap; stop cleanly and keep completed rows |

Add `.env*` except `.env.example` to `.gitignore`. **Fail at startup with a clear named message
if any required variable is missing** — never start with a silent default.

---

## 11. Seed and test data

- `sampleDomains.ts` — the 12 from §4.2, in that order, failures included.
- `seededContacts.ts` — a realistic contact for each of the 12, used only when Hunter is
  exhausted or returns nothing. Every seeded contact renders with a visible `seeded` badge.
- `goldenSet.ts` — the assertions from §12, each with an id, an input, and an expected outcome.
- Frozen HTML fixtures in `tests/fixtures/` captured on the **first** successful fetch of each
  sample domain, so determinism tests run against frozen input and a site redesign cannot
  change a test result.

---

## 12. Acceptance tests (`npm run test` must be green, and `/selftest` must be green in the browser)

### Structural — assert these regardless of what the live web says
| ID | Assertion |
|---|---|
| T-01 | `  HTTPS://Rocketlane.com/pricing?utm_source=x  ` normalises to `rocketlane.com` |
| T-02 | Three entries resolving to `rocketlane.com` produce **one** company and **one** Hunter lookup |
| T-03 | A company with `size_band = '500+'` returns `DROP` with `rule_fired = 'R-02'` |
| T-04 | A non-SaaS company returns `DROP` with `rule_fired = 'R-01'` |
| T-05 | **A company with only S-06 (funding, 10 pts) returns `HOLD`, never `SEND`** |
| T-06 | S-01 + S-02 together give `independent_signals = 1`, not 2 |
| T-07 | `strict_icp = true` on a `certified` company → `DROP R-04`; `false` → `HOLD`, `play = 'migration'` |
| T-08 | robots.txt disallow → quarantined **with zero page fetches recorded** |
| T-09 | A dead domain quarantines and the other 11 companies still complete |
| T-10 | A draft whose `hook_quote` is absent from the source text is `blocked`, never sent |
| T-11 | Every Hunter candidate of `type = 'generic'` is excluded; all-generic → `HOLD` |
| T-12 | The loop stops at exactly 4 extra fetches and returns `HOLD` with the missing field named |
| T-13 | `/api/send` with a body containing a different recipient still sends to `GMAIL_SEND_TO` |
| T-14 | **Determinism:** running the frozen fixture set twice yields byte-identical verdicts, scores and rule IDs |
| T-15 | A populated Evidence Map field with no `quote` fails Zod and triggers exactly one retry |

### Behavioural — run end to end against the live sample set
| ID | Assertion |
|---|---|
| T-20 | A full 12-domain run completes with at least one company in each of Send, Hold and Drop |
| T-21 | Every Send card's hook quote appears verbatim on the page its URL points to |
| T-22 | Moving the S-06 funding weight from 10 to 45 re-ranks the board **without any new fetch or AI call** |
| T-23 | With `ai_enabled = false`, a full run still produces verdicts and shows the rules-only banner |
| T-24 | Rejecting a company with a reason suppresses it on the next run and names it in the "what changed" panel |
| T-25 | With `GEMINI_API_KEY` unset, the app starts, runs rules-only, and says so on screen |
| T-26 | Every page renders a non-empty, actionable state before any run has happened |

---

## 13. Deploy

1. `git init`, push to a new public GitHub repo.
2. Deploy to Vercel. Set every env var from §10 in project settings.
3. Run the schema against Neon.
4. **Verify the live URL in a logged-out incognito window and on a phone viewport.**
5. Confirm `NEXT_PUBLIC_SITE_URL` is the production URL, not localhost.
6. Generate the **Components Map as Mermaid in the README**, regenerated from the final code —
   swimlanes for Growth Lead, System, Hunter.io, Gemini Flash, Gmail, with the agent loop drawn
   as the one conditional path.
7. README sections: what it does · how a judge tests it in 2 minutes · the Components Map ·
   the rules table with IDs · **AI compliance note naming the pinned Gemini Flash model id** ·
   known limits.

---

## 14. Phases — build in this order and deploy at the end of Phase 3

1. **Skeleton + deploy.** Next.js, Tailwind, shadcn, Neon schema, env guard, model guard,
   footer model id, empty states. Deploy now so deployment is never the last risk.
2. **Fetch + clean + quarantine.** robots gate, 3 tiers, cleaner, normaliser, Quarantine page.
   Tests T-01, T-02, T-08, T-09.
3. **Rules engine first, AI second.** Write `lib/rules/*` and its unit tests against hand-built
   fixtures **before any AI call exists**. T-03…T-07, T-11, T-14. **Deploy.**
4. **AI-1 + the loop.** Extraction, Zod, retry, completeness check in code, loop trace, cap.
   T-12, T-15.
5. **Hunter + PoC ladder.** Quota guard, cache, seeded fallback, runner-up. T-11.
6. **AI-3, AI-4, evidence validator.** T-10, T-21.
7. **Send.** Gmail, then Resend fallback, transport recorded and displayed. T-13.
8. **The five layers:** decision board polish with search/filter/sort · fail-safe banners ·
   feedback loop · weight sliders · feature switches. T-22, T-23, T-24.
9. **`/selftest` + `/health`.** Golden set in the browser, quota meter, cost ledger, staleness.
10. **README + Components Map + judge path.** T-20, T-25, T-26.

---

## 15. Report back

When you finish, tell me plainly:

- The live URL and the repo URL.
- Which of T-01…T-26 pass and which fail, **with the reason for each failure**.
- The total AI cost of the full 12-domain test run, in ₹ and USD, from the cost ledger.
- How many Hunter credits the test run consumed, and how many remain.
- The resolved Gemini model id as rendered in the footer.
- **Anything in this spec you did not complete — stated plainly, not quietly dropped.**
