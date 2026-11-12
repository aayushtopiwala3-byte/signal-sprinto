# Signal — Fix & Extend Prompt (v2)

> Paste everything below the line into Claude Code **in the existing Signal repo**.

---

# Signal v2 — fix the decision layer, close the evidence hole, then extend

You built this app from `BUILD_PROMPT.md`. It is deployed at
`https://signal-sprinto.vercel.app/`. I have now run it as a judge would and found
specific, reproducible failures. This prompt fixes them and then adds four extensions.

**Work in the phase order in §9. Do not start a later phase until the earlier one is
deployed and verified.** The first four phases exist to make the demo work at all. The
extensions are worthless on a board that shows "Nothing in Send for this run."

---

## 0. What is already right — do not regress any of this

Protect these. If a change below would break one of them, stop and solve it differently.

- The company detail page structure: *Verdict and why → Signals → loop trace → Contact →
  Pain points → Draft*. This is the strongest part of the build.
- The **"What would change it"** panel.
- The **loop trace table** showing the chosen URL, the model's stated reason, and which
  fields each fetch filled.
- The **runner-up contact with `lost_reason`** and the ladder rank.
- The locked recipient rendered next to every send button, and in the footer.
- The model id in the footer and the line *"All AI tasks run on Gemini Flash. The Claude
  API is not used."*
- Re-scoring that makes **no fetch and no AI call**, with that fact stated on screen.
- The quarantine page's distinction: *"Nothing here was scored, so nothing here has a verdict."*
- `MAX_EXTRA_FETCHES = 4`. **This number does not change in this prompt.**
- **The production timeout fix shipped on 12 Nov** (commits `ebc16ac`, `1234e45`, `d550a5e`):
  `claimNextPending` reclaiming rows stranded by a killed invocation; `/api/run/step` no
  longer declaring `done: true` while work remains; `runCompany` watching its own clock and
  recording `chosen_by = 'deadline'`; the 3-retry cap into `handler_timeout` quarantine.
  All of that stays.

### 0.1 The deadline guard and reserved fetches interact — read this before Phase 1

Phase 1 adds two reserved fetches and §2.6 adds an 800 ms same-host delay. Both increase
wall-clock time per domain, and the new deadline guard stops opening pages with 25 s left.
Those two changes pull in opposite directions, so order them explicitly:

1. **Reserved fetch 1 (security) is never skipped by the deadline guard.** It is the page
   carrying 70 of the 100 points. If the clock is tight, the guard drops a *discretionary*
   fetch, never a reserved one. If there is not even time for the security page, the domain
   must quarantine as `handler_timeout` rather than produce a HOLD that looks like a verdict.
2. The 800 ms delay does **not** apply before the first request to a host, only between
   consecutive ones — so a 2-reserved-fetch domain pays 1.6 s, not 2.4 s.
3. Re-measure after Phase 1. If domains start hitting the deadline, lower the per-fetch
   timeout from 20 s to 12 s before you touch `MAX_EXTRA_FETCHES`. The cap is a designed
   limit from the L4 deck; the timeout is a tuning number.

---

## 1. Observed failures — reproduce each before you fix it

Run the sample 12 and confirm you see what I saw:

| # | Observed | Why it is a failure |
|---|---|---|
| F-1 | **SEND 0 · HOLD 8 · DROP 0** | The tool makes no decision. A judge's first screen says "Nothing in Send for this run." |
| F-2 | `missing: size_band` on 7 of 8 companies, all at `4/4 extra fetches` | The loop spends its entire budget on the one field the company's own site rarely answers |
| F-3 | Zipy's loop trace: `/` → `/about-us` → `/press-coverage` → `/blog` → `/pricing` | **`/security` and `/trust` were never fetched.** S-01 (40) and S-02 (30) live there |
| F-4 | **S-01, S-02 and S-03 did not fire once across 10 companies** | Nothing can reach the 50-point Send threshold. The board is mathematically incapable of a Send |
| F-5 | `whatfix.com` (~1,000 staff) sits in **HOLD at 25**, not `DROP R-02` | R-02 cannot fire without `size_band`. The "watch it drop a company" demo does not exist |
| F-6 | `zomato.com` → robots.txt HTTP 403 → quarantined `UNREACHABLE` | Correct behaviour, wrong demo outcome: the `R-01 not B2B SaaS` drop never reaches the rules engine |
| F-7 | Zipy S-06 "Recent funding round" quote: *"SaaS startups have raised $5 billion to date… according to Venture Intelligence."* | An industry statistic presented as evidence that **this company** raised money |
| F-8 | Zipy S-07 "Regulated vertical" quote: *"…has mentored multiple startups in edtech, healthcare and ecommerce…"* | A founder's CV presented as evidence of **the company's** customer base |
| F-9 | Draft subject: `maintaining zipy's soc 2 type ii` | Lowercase and truncated mid-phrase |
| F-10 | Banner reads `GOOGLE_REFRESH_TOKEN not set`; footer reads `to: demo@example.com` | Step 7 of the brief — send via Gmail — is not functioning |
| F-11 | `/selftest` shows **ALL GREEN, 14 passed** while the live run fails | The suite tests the rules engine on synthetic fixtures. The broken layer is the one that feeds it |
| F-12 | Run `run_80dee855232e4ce1a6f7` (12 Nov, post-timeout-fix): **8 scored, all HOLD, 0 SEND, 0 DROP** | The timeout fix made the run *complete*. It did not make it *decide*. F-1 through F-6 are untouched |

**On the claim that this is "documented in D-22 rather than engineered away."** It is not a
documented limitation — it is F-2 restated. R-22 holds all 8 because `size_band` is still a
loop-driving field, and companies do not publish headcount in prose. The L4 deck's own
Evidence Map routes that question to `/careers` and says the page *"answers headcount,
seniority and often funding in a single request."* A build that holds every company for want
of a number its own source deck tells it where to find has not discovered a boundary; it has
skipped §2.3. Do not write this up as a principled limit until §2.3 has been implemented and
has genuinely failed.

---

## 2. Phase 1 — make the pipeline read the right pages

### 2.1 Reserve the first two of the four extra fetches

`MAX_EXTRA_FETCHES` stays at **4**. What changes is who spends them.

```ts
// lib/fetch/plan.ts
// Fetch 0 (not counted): the homepage. Unchanged.
// Extra fetch 1: RESERVED — security / trust page
// Extra fetch 2: RESERVED — careers page
// Extra fetches 3-4: DISCRETIONARY — chosen by AI-2 against whatever is still empty
```

**Reserved fetch 1 — the security page.** Try in order, stop at the first that returns
≥ 200 clean words: `/security`, `/trust`, `/trust-center`, `/compliance`, `/soc2`,
`/legal/security`, `/privacy`. If none resolve, record the attempt and the fact that no
security page exists — **that absence is itself informative** and must be visible on the card
as `no security page found`.

**Reserved fetch 2 — the careers page.** Try `/careers`, `/jobs`, `/about/careers`,
`/company/careers`. This page carries S-03 (first compliance hire) *and* the headcount
heuristic in §2.3, so it earns its reserved slot twice over.

In the loop trace, label these rows `RESERVED` in the `BY` column, against `AI` for the
discretionary ones. A judge must be able to see that two of the four were spent by design
and two by the model.

**Why this is defensible, and say so in the UI copy:** the cap did not move. What changed is
that the model no longer gets to spend a fixed budget on the cheapest question. The one page
carrying 70 of the points is not something I leave to a model to decide to visit.

**This is not an invention — it is a return to the L4 deck.** The deck's own Evidence Map for
Sprinto assigns a fetch budget *per question*, not one pooled budget: `Already certified?` →
`homepage footer · /security · /trust` → **1 fetch**; `Right stage?` → `/careers · /pricing ·
/customers` → **2 fetches**; worst case **4 fetches beyond the homepage**. v1 kept the total
and dropped the per-question allocation, and that single omission is the root cause of every
failure in §1. The deck also states the reason the careers page is reserved rather than
discretionary: *it answers headcount, seniority and often funding in a single request.* Quote
that provenance in the viva — the fix is the deck's design, restored.

### 2.2 Evaluate signals per page, not once at the end

S-01 and S-02 must be evaluated against **the security page's text specifically**. Currently
they are evaluated against the merged corpus and never fire. After each fetch, run the signal
detectors over that page's cleaned text and record `source_url` per signal.

S-01 triggers on the company's own site asserting certification is *in progress*: `in progress`,
`underway`, `pursuing`, `working toward`, `coming soon`, `currently undergoing`, `audit in
progress`, `Type I` where no Type II is claimed.
S-02 triggers when a security or trust page resolved **and** no certification badge or named
certification appears on it.

### 2.3 Stop treating headcount as a scraping problem

Create `lib/size/infer.ts` with three code-side sources, tried in order, each recording
`size_source`:

1. **Explicit statement** — regex over all fetched text for `team of N`, `N+ employees`,
   `N people`, `N-person`, `we are N`. Highest confidence.
2. **Careers-page job count** — count distinct job listings on the careers page.
   `0–5 roles → likely ≤ 50` · `6–20 → likely 51–200` · `21–60 → likely 201–500` ·
   `> 60 → likely 500+`. Mark these **`inferred`**, not stated, and label them as such on the
   card. Never show an inferred band with a quote chip.
3. **Hunter metadata** — if the Domain Search response carries organization or company
   metadata including an employee count or range, use it with `size_source = 'hunter'`.
   Do not fail or retry if it is absent.

**Then demote `size_band` as a loop driver.** It gets at most **one** discretionary fetch.
If still unknown after that, the loop must move on to a field it can actually fill.

### 2.4 R-02 becomes a two-path rule

```
R-02a  size_band is KNOWN and '500+'            -> DROP, "headcount above 500, has in-house GRC"
R-02b  size_band is INFERRED as '500+'          -> DROP, "headcount inferred above 500 from N open roles"
R-02c  size_band UNKNOWN                        -> do not gate. Set flag size_unknown = true,
                                                   and the counterfactual must name it
```

`whatfix.com` must land in **DROP** after this phase. That is the acceptance test for Phase 1.

### 2.5 Fix the sample set

Replace `zomato.com` (its robots.txt returns 403, so it quarantines before the fit gate can
fire). Use a non-SaaS company whose robots.txt is readable — try `zerodha.com`, `swiggy.com`
or `nykaa.com` and **keep whichever one actually reaches the rules engine and drops on R-01**.
Verify by running it, not by assuming.

### 2.6 Close the two politeness gaps the L4 deck names explicitly

The deck's ethics slide lists two obligations under *Monetary* that v1 does not honour:
*"Responsible scrapers use delays, cache results, and don't run the same URL more than
necessary."* We cache AI calls (`ai_cache`) and Hunter lookups (`hunter_cache`) but not pages,
and we fire requests back-to-back. Both are cheap to fix and both are things a judge can ask
about in one sentence.

**(a) Politeness delay.** Add `FETCH_DELAY_MS = 800` in `lib/fetch/tiers.ts` and sleep that
long between consecutive requests *to the same host*. Not between domains — those are
different servers. Honour `Crawl-delay` from robots.txt when present and larger than 800 ms;
`lib/fetch/robots.ts` already parses the file, so add the directive to `RobotsRules` and read
it. Show the applied delay on the per-domain badge: `polite: 800ms between requests`.

**(b) Page cache.** New table `page_cache (url TEXT PRIMARY KEY, fetched_at TIMESTAMPTZ,
tier INT, clean_text TEXT, word_count INT)`. Check it before tier 1; serve any row newer than
**7 days** and mark that fetch `cached` in the loop trace, consuming **zero** of the four extra
fetches is *wrong* — it still consumes one, because the budget models *questions answered*,
not money spent. Make that explicit in a comment, because it is the kind of thing a judge will
probe. What the cache saves is the request to the company's server and the tokens, not the
loop budget.

This also completes the deck's third cost dial — *"whether you send it at all: a company
researched last week should cost nothing this week."* Surface it on Health as
`N pages served from cache · M live fetches this run`.

**Phase 1 is done when:** the sample run produces at least one company in Send, at least two
in Drop (one on R-01, one on R-02), S-01 or S-02 has fired on at least two companies, and a
second consecutive run of the same list shows a non-zero cache-hit count. Deploy before
continuing.

---

## 3. Phase 2 — close the evidence hole (R-23)

A quote that exists is not a quote that supports the claim. F-7 and F-8 both passed the
current validator. Both are wrong.

### 3.1 Three evidence tiers, computed in code

Create `lib/rules/evidenceTier.ts`:

```
VERIFIED   quote appears verbatim in fetched text
           AND the quote mentions the company (name, domain stem, or a first-person
               subject such as "we", "our", "us" on that company's own page)
           AND the quote contains at least one trigger term for the signal it supports

ASSERTED   quote appears verbatim, but fails one of the two support conditions above

FABRICATED quote does not appear verbatim in ANY page fetched for this company
```

**Only VERIFIED contributes to `timing_score` and to `independent_signals` (R-21).**

| Tier | Rendered as | Behaviour |
|---|---|---|
| VERIFIED | green `verified` chip + the quote + a live link | scores normally |
| ASSERTED | amber `asserted` chip, quote shown greyed, with the reason: *"the quote is real but does not mention Zipy"* | **scores 0**, excluded from R-21 |
| FABRICATED | red `blocked` chip | never rendered as evidence; draft blocked; counted on Health |

Apply this to **signals, pain points and the draft hook alike**.

### 3.2 Make the blocking visible

Add to `/health`: **`N claims downgraded to asserted · M fabrications blocked this run`**,
with a drill-down list. This counter is the single best artifact in the build — it is proof
that the thing everyone claims to prevent is actually being caught and counted.

Add `R-23` to the rules table in the README and the UI legend.

**Phase 2 acceptance:** Zipy's S-06 and S-07 both render as **asserted**, score 0, and Zipy's
timing score drops accordingly. If they still render as verified, the support check is too loose.

---

## 4. Phase 3 — make send actually work

1. Set `GOOGLE_REFRESH_TOKEN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and a real
   `GMAIL_SEND_TO` in Vercel. The OAuth consent screen must be published to **In production**
   — a token from an app left in "Testing" expires after 7 days and will be dead at grading.
2. Wire `RESEND_API_KEY` and `EMAIL_FROM` as the disclosed fallback. Every send records its
   transport and the card displays it: `sent via: gmail` / `sent via: resend (gmail token expired)`.
3. **Fix the subject line (F-9).** Sentence case, 4–9 words, never truncated mid-phrase.
   Validate in code: reject and regenerate a subject that is entirely lowercase, ends in a
   preposition or article, or exceeds 60 characters.
4. Replace the signature `Growth Lead at Sprinto` with a `SENDER_NAME` env var.

**Phase 3 acceptance:** approve one Send card, confirm the email arrives, confirm the card
turns green and names its transport.

---

## 5. Phase 4 — stop leaking internals into the UI

Keep every rule ID and signal ID. They are the defensibility of this build. **Add a human
label beside each one** — never replace it.

| Currently rendered | Replace with |
|---|---|
| `GOOGLE_REFRESH_TOKEN not set — No send transport is configured…` | **"Email sending isn't connected yet. Drafts are still written and checked — Approve & send will report the failure rather than pretend."** |
| `missing: size_band` | **"still unknown: company size"** |
| `missing: size_band, cert_status` | **"still unknown: company size, certification status"** |
| `strict_icp` | **"Drop already-certified companies"** *(keep `strict_icp` as small monospace secondary text)* |
| `ai_enabled` | **"Use AI to read pages"** |
| `reader_enabled` | **"Deep-read JavaScript-heavy sites"** |
| `auto_send` | **"Send without asking me"** |
| `r.jina.ai tier-2 fallback` | **"a reader service that renders JavaScript pages"** |
| bare chips `R-20 S-05 S-07` | `S-05 · enterprise security review` — ID kept, label added |
| `B2B SAAS` / `HEADCOUNT BAND` / `CERTIFICATION` / `PRESSURE SIGNALS` | **"Do they sell software to businesses?" / "How big are they?" / "Are they already certified?" / "Is there compliance pressure?"** — the Evidence Map is a set of questions, so show it as questions |

Add a small **"What do these codes mean?"** disclosure on the board that expands into the
full rules and signals table. A judge who wants the IDs gets them; a judge who doesn't isn't
taxed by them.

---

## 6. Phase 5 — the four extensions

### 6.1 Verified / Asserted / Fabricated — already built in Phase 2

Finish it by adding the legend to the board header and a line in the README explaining the
three tiers and why only Verified scores.

### 6.2 Counterfactual explainer — "what would move this"

`lib/rules/counterfactual.ts` → `counterfactualFor(company): { text, actionable, suggestedUrl? }`

Every Hold and every Drop gets a specific, computed next step — not a template:

- Hold at 40 with 2 groups → *"10 points short. A security page signal (S-02, +30) would clear it — we found no security page at this domain, so check whether one exists elsewhere."*
- Hold at 60 with 1 group → *"Score is enough; the signals aren't independent. One signal from any group other than `certification` would move this to Send."*
- Drop on R-02b → *"Dropped on inferred size (61 open roles). If that inference is wrong, correct the size band here and it re-scores."* — with an inline override control.
- Drop on R-01 → *"Not a software product. Nothing on this page would change that."* — `actionable: false`.

Render it on the board card as a single line, and expanded on the detail page. Where
`suggestedUrl` exists, make it a link. **This converts a passive list into a work queue** —
she knows what to go and look at next.

### 6.3 Reply-intent loop — the second human checkpoint

New page `/replies`.

The Growth Lead pastes a raw reply and picks the company. **AI-5** classifies; **code**
decides what happens. Same division as everywhere else in this build.

**AI-5 output (Zod-validated):**
`{ intent, confidence, quote }` where `intent ∈ interested | not_now | wrong_person |
not_interested | unsubscribe | unclear`. The `quote` must appear verbatim in the pasted
reply, or the intent is forced to `unclear`.

**Deterministic actions:**

| Rule | Intent | Action |
|---|---|---|
| R-50 | `interested` | Mark `won`, suppress further outreach, surface in "what changed" |
| R-51 | `not_now` | Snooze 90 days; re-ranks down but is not suppressed; show the return date |
| R-52 | `wrong_person` | Re-run the PoC ladder **excluding that person**, promote the runner-up, offer a re-draft |
| R-53 | `not_interested` | Suppress 180 days with the reason recorded |
| R-54 | `unsubscribe` | **Permanent hard block.** The domain is quarantined before any fetch on every future run, and this cannot be undone from the UI |
| R-55 | `unclear` | No automatic action. Ask the human to choose, with the model's reading shown as a suggestion only |

**The human checkpoint is explicit:** the classification and the proposed action are shown,
and nothing is applied until she clicks Confirm. R-54 additionally requires a typed
confirmation, because it is irreversible.

Feed every applied action into the existing *"What changed because of your feedback"* panel.

### 6.4 Batch economics panel

New section on `/health`, titled **"What this run cost, and what it saved"**.

Measured, from the database — present these as facts:
AI spend in ₹ and USD · AI calls, cache hits and cache-hit rate · Hunter credits consumed and
remaining · **cost per company qualified** · **cost per Send** · wall-clock elapsed for the run.

Estimated — and **labelled "estimate" with the assumption shown and editable on screen**:
manual baseline minutes per company (default 15, editable), therefore hours saved this run,
therefore cost per hour saved.

> Render this line verbatim beneath the estimate: **"The measured numbers above come from the
> run's own ledger. The saved-time figure is an estimate built on the baseline you can edit —
> it is an assumption, not a measurement."**

That sentence is the difference between showing ROI and claiming it.

---

## 7. Phase 6 — make `/selftest` tell the truth

The current suite is green while the product is broken (F-11). Keep all 14 structural
assertions and add these. Behavioural assertions may hit the database and the live run;
label them **BEHAVIOURAL** and let them be slower.

| ID | Assertion |
|---|---|
| T-09 | A dead domain quarantines and the other companies still complete |
| T-16 | **Every company clearing R-01 has a security-page fetch attempt recorded** (resolved or not) |
| T-17 | A quote that is verbatim but does not mention the company is tiered `asserted` and scores 0 |
| T-18 | Every Hold and every Drop has a non-empty counterfactual string |
| T-19 | Each of the six reply intents maps to its rule R-50…R-55, and `unsubscribe` blocks the domain on the next run |
| T-20 | **A full sample run produces ≥ 1 Send, ≥ 2 Drop and ≥ 1 Hold** |
| T-21 | Every Send card's hook quote appears verbatim on the page its URL points to |
| T-22 | Moving the S-06 weight from 10 to 45 re-ranks the board with zero new fetches and zero new AI calls |
| T-23 | With `ai_enabled` off, a full run still produces verdicts and shows the rules-only banner |
| T-24 | Rejecting a company with a reason suppresses it next run and names it in the "what changed" panel |
| T-25 | With `GEMINI_API_KEY` unset the app starts, runs rules-only, and says so on screen |
| T-26 | Every page renders a non-empty, actionable state before any run has happened |

**T-20 must be red until Phase 1 is finished. Do not stub it to green.**

---

## 8. README and Components Map

Regenerate the Mermaid map from the final code. It must now show: the two reserved fetches as
distinct from the discretionary loop, the R-23 evidence tiering as a gate before scoring, and
the reply-intent loop as a **second** human checkpoint alongside Approve & send.

Add README sections for: the three evidence tiers and why only Verified scores · the reserved-
fetch design and why the cap did not change · the reply-intent rules table · what is measured
versus what is estimated in the economics panel.

---

## 9. Phase order — deploy between each

1. **Reserved fetches, per-page signals, size inference, R-02a/b/c, sample-set swap.** Verify Send ≥ 1 and Drop ≥ 2. **Deploy.**
2. **R-23 evidence tiering + the Health counter.** Verify Zipy's S-06/S-07 read `asserted`. **Deploy.**
3. **Gmail + Resend + subject fix + sender name.** Send one real email. **Deploy.**
4. **UI language pass.** No raw env var, DB column or config key visible anywhere. **Deploy.**
5. **Counterfactuals → economics panel → reply-intent loop**, in that order. Counterfactuals are cheap and improve every card; the reply loop is the largest piece of new work and goes last.
6. **`/selftest` rebuild**, README, Components Map regeneration. **Deploy.**

---

## 10. Report back

- Which of F-1…F-11 are fixed, and which are not, **with the reason for each**.
- The new board counts: Send / Hold / Drop / Quarantine.
- How many claims were downgraded to `asserted` and how many fabrications were blocked.
- Whether a real email sent, and via which transport.
- The full `/selftest` result, including anything still red.
- **Anything in this prompt you did not complete — stated plainly, not quietly dropped.**
