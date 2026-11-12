# Decisions

Every judgement call made while building, with the reason. Spec section in brackets.

---

### D-01 · Pinned model id is `gemini-2.0-flash` [§2.1] — superseded by D-21
The brief says "Gemini Flash" without a version. `gemini-2.0-flash` is the GA Flash id on the
Google AI Studio `v1beta` endpoint. It is a `const` in `lib/ai/model.ts` with no env override —
"pin" means pin. `resolveModelId()` throws `ModelGuardError` if the id does not start with
`gemini-`, and the resolved value renders in the footer of every page.

### D-02 · OpenRouter fallback uses `google/gemini-2.0-flash-001` [§6] — superseded by D-21
The fallback transport must still be Gemini Flash, so the OpenRouter slug is a mapping of the
same pinned model rather than an independent choice. The same `gemini-` guard runs against the
mapped-back id.

### D-03 · PGlite as the local/test database, Neon in production [§8, §10]
`DATABASE_URL` unset ⇒ the adapter boots `@electric-sql/pglite`, a real Postgres compiled to
WASM, in memory. This is what lets `npm run test` and a local dev server run with zero
credentials, and it keeps the schema honest because it is the same SQL Neon runs.
**Risk, disclosed:** in-memory state resets per lambda on Vercel, so production must set
`DATABASE_URL`. `/health` renders a loud red banner whenever the PGlite driver is active, and
`lib/env.ts` warns at startup.

### D-04 · Hard-required vs degradable env vars [§10 vs T-25/T-26]
§10 says fail at startup on a missing variable; T-25 says the app must still start and run
rules-only with `GEMINI_API_KEY` unset. Resolved by splitting the list:
- **Hard** (named startup failure): `GMAIL_SEND_TO`, because the locked recipient is the §2.2
  non-negotiable and a silent default there is the one unsafe default in the system.
- **Degradable** (boot, disable the feature, show an on-screen banner naming the missing var):
  `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `HUNTER_API_KEY`, `GOOGLE_*`, `RESEND_*`,
  `DATABASE_URL`, `NEXT_PUBLIC_SITE_URL`, `AI_COST_CEILING_USD`.
Nothing defaults silently — every degradation is named on screen.

### D-05 · Manual scaffold instead of `create-next-app` [build mechanics]
The repo already contained course PDFs and markdown, and `create-next-app` refuses a non-empty
directory and prompts interactively. Config files are written by hand.

### D-06 · Hand-rolled shadcn-style primitives instead of `shadcn init` [§9]
`shadcn init` is interactive. `components/ui/*` contains the same Radix-free primitives (Button,
Card, Badge, Tabs, Slider, Switch, Dialog, Input) in the shadcn idiom — `cva` variants, `cn()`
merge, CSS custom properties for theming — so the look and the API match without the prompt.

### D-07 · Tagged-template `sql` adapter over both drivers [§8]
`lib/db/client.ts` exports one `sql` tagged template that compiles interpolations to `$1..$n`
and dispatches to `postgres.js` or PGlite. Only plain value interpolation is used — none of
postgres.js's `sql(obj)` / `sql(array)` helpers — so the two backends stay behaviourally
identical and queries are parameterised, never string-concatenated.

### D-08 · Weight re-ranking recomputes from stored `signals` rows [§5.5, T-22]
Moving a slider reads the persisted `signals` rows for the run and re-runs `lib/rules/verdict.ts`
in process. No fetch, no AI call, no Hunter call is reachable from that code path — `/api/rerank`
imports only `lib/rules/*` and `lib/db/*`. The `recalculated, no new fetches` note is driven by
a counter that would be non-zero if anything had been fetched.

### D-09 · Determinism enforced by lint-style test, not convention [§5.3, T-14]
`tests/determinism.test.ts` reads every file under `lib/rules/` as text and fails on a literal
`Math.random(` or `Date.now(`. Convention is not a guarantee; a grep is.

### D-10 · Frozen fixtures are committed HTML, captured once [§11]
`tests/fixtures/` holds the first successful fetch of each sample domain. Determinism tests run
against these, so a site redesign cannot turn a test red. Live-web behaviour is asserted only in
the behavioural tests (T-20…T-26), which are marked as requiring network.

### D-11 · `/api/send` ignores the request body's recipient entirely [§2.2, T-13]
The handler never reads a `to` field. The address is `process.env.GMAIL_SEND_TO`, read server-side
at call time. A body containing `to` is accepted without error and ignored, and the response
echoes the address actually used so the lock is observable from the outside.

### D-13 · Resolving the §5.3 vs T-05 contradiction [§5.3, T-05]
§5.3's pseudocode says `DROP: timing_score < 20`. T-05 says a company with only S-06 (funding,
10 points) "returns `HOLD`, never `SEND`". Both cannot hold literally.

Resolved in favour of T-05, because §5.3's own DROP reason string — `"R-20: fit passed, no
timing signal"` — is only *true* when nothing fired. A company with one weak signal does have a
timing signal, so dropping it with that reason would print a falsehood on the card. The engine
therefore splits the sub-20 band:

- `score < 20` **and zero signals fired** ⇒ `DROP`, reason `R-20: fit passed, no timing signal`
- `score < 20` **and ≥1 signal fired** ⇒ `HOLD`, reason names the score and the weak-signal count

Both branches still report `R-20`. Nothing below 50 can ever reach SEND, which is the part of
T-05 that is emphasised.

### D-14 · The migration play is always HOLD [§5.5, T-07]
With `strict_icp` off, a certified company routes to the migration play. §5.5 fixes its verdict
at HOLD, so the score thresholds are bypassed entirely for that path — a migration company can
neither reach SEND on a high score nor fall to DROP on a low one. `compareForBoard` ranks every
migration company below every greenfield company, as specified.

### D-15 · A null `size_band` uses the 51-200 ladder [§5.4]
§5.4's table has no row for an unknown headcount. The PoC ladder defaults to the `51-200` rung
set — the middle of the table, and the least wrong guess when the fact was not found. The
company card still names `size_band` as `not stated`, so the assumption is never hidden.

### D-12 · Seeded contacts are badged, never silent [§11]
When Hunter is exhausted, unkeyed or returns nothing, `seededContacts.ts` supplies a contact and
the row is stored with `source = 'seeded'`. The UI renders a `seeded` badge next to it. A seeded
contact never renders as if it were live data.

### D-16 · A per-run AI budget ceiling of $1.00 [not in spec]
`aiCall` already accepts a `budgetExhausted` flag, but nothing supplied it. `runCompany` reads
the run's cost ledger once per company and sets the flag at `RUN_BUDGET_USD = 1.0`. Past the
ceiling, AI calls short-circuit to the rules-only path with a named reason rather than silently
spending. A 12-domain run costs well under this, so the valve should never trip in the demo —
it exists so a pathological loop cannot run up a bill unobserved.

### D-17 · R-22, the fetch-cap handoff [§7.3, T-12]
§7.3 requires that at the cap "the answer is never *try harder* — it is a handoff: verdict HOLD,
with the still-empty field named". No rule id is given for this, so the engine uses **R-22**,
numbered alongside the other verdict-family rules R-20 and R-21.

It applies **only once the FIT gate has passed**. A fit-gate DROP (R-01…R-04) rests on an
evidenced fact — `is_b2b_saas = false` with a quote — and is not made less certain by an unknown
`size_band`, so those DROPs stand. What R-22 blocks is a SEND issued while a field the verdict
depends on is still `not stated`. The reason string names both the missing fields and
`N/4 fetches used`.

### D-18 · No named contact downgrades SEND to HOLD [§5.4, R-30]
R-30 returns HOLD when every Hunter result is a generic mailbox. That verdict must win over a
SEND from the timing stack: there is nobody to send to, so rendering a Send card would promise
an action the app cannot perform. `runCompany` rewrites the verdict to HOLD with `rule_fired =
R-30` and the ladder's own reason string. All generic candidates are still stored and shown,
each with `lost_reason = "generic mailbox — never selectable (R-30)"`, so the rejection is
visible rather than implied by an empty list.

### D-19 · The consumer-business keyword set must be consumer-specific [§5.1, R-01]
Rules-only extraction originally read a bare `delivery`, `restaurant` or `marketplace` as
evidence that a company sells to consumers. On a live run that classified Rocketlane — "unifies
every part of **service delivery**" — as `is_b2b_saas = false`, producing a confident `DROP /
R-01` whose attached quote did not support the claim.

`is_b2b_saas = false` is the only field that ends the pipeline by itself, so it is held to a
higher bar than the true reading: every alternative in the pattern must be consumer-specific
standing alone (`order food online`, `restaurants near you`, `add to cart`), and a page carrying
both vocabularies resolves to B2B. The alternative — scoring a wrong rejection and calling it a
limitation of rules-only mode — would have been a fabricated verdict, which §1 forbids
regardless of which extraction path produced it.

### D-20 · `www.` and the scheme are stripped when deduplicating loop candidates [§7.3]
The loop keyed "already fetched" on the full URL, so `x.com/careers` and `www.x.com/careers`
counted as two different pages. A live run spent two of its four extra fetches reading the same
careers page twice. Canonicalisation now drops the scheme and a leading `www.`; the budget is
four pages, not four requests.

### D-21 · The pin moved to `gemini-3.8-flash` because 2.0 and 2.5 were retired [§2.1]
With a live `GEMINI_API_KEY` in hand, the pinned `gemini-2.0-flash` returned HTTP 404: *"This
model is no longer available. Please update your code to use models/gemini-3.8-flash."*
`gemini-2.5-flash` returned the same error. The key itself was valid — the model was gone.

The pin is now `gemini-3.8-flash`, Google's own named replacement, verified against the live
endpoint with the structured-output config the pipeline actually uses before the change was
made. `google/gemini-3.8-flash` is the matching OpenRouter slug, confirmed present in their
model list.

Deliberately **not** `gemini-flash-latest`. A floating alias would have survived this retirement
without a code change, but §2.1 requires a pinned id rendered in the footer as a verifiable
claim, and an alias makes that claim mean "whatever Google served that request". Taking the
breakage and re-pinning on purpose is the behaviour the brief asks for; the 404 is the pin
working, not failing.

Cost-ledger rates moved with it — 3.8 Flash bills $0.825/$4.125 per 1M input/output tokens
against 2.0 Flash's $0.10/$0.40, so leaving the old constants would have under-reported spend
by roughly 8x on the ₹ figure the brief asks to be reported.

### D-22 · T-20's missing Send is reported, not engineered away [§1, §7.3, T-20] — **withdrawn by D-27**
*The entry below was wrong in its central claim and is kept only so the mistake is on the record.
It asserted that six companies "genuinely do not publish a headcount on any page the loop could
reach." They do. The loop could not reach it because `lib/fetch/clean.ts` was deleting the
sentence — an 8-word block floor and a 2,000-token cap that between them removed whatfix's
"crossing 500 employees globally" before AI-1 ever saw the page. I measured the absence from the
cleaned text and reported it as a property of the web. See D-27.*

The live 12-domain run produced 7 Holds and no Send. The reason was measured rather than
assumed: `size_band` is still `not stated` for 6 of the 7 scored companies after all 4 extra
fetches, so **R-22 hands off instead of sending**. `nected.ai` is the clearest case — timing
score 55 across 2 independent groups clears R-20's Send bar outright, and R-22 still holds it.

The extractor is not at fault. Grepping every stored page for a headcount phrase turns up
exactly one — plivo.com's *"We're a 100+ person team"* — and AI-1 read it correctly, giving
plivo the only `missing_fields = []` on the board. The other six genuinely do not publish a
headcount on any page the loop could reach.

Three ways to make T-20 green were available and all were rejected:
- **Drop `size_band` from R-22's required set.** It is the field R-02 (>500 ⇒ DROP) depends on,
  so sending on an unknown headcount means sending to a company the FIT gate might have dropped.
- **Infer headcount** from job-listing counts or team photos — §4.3 explicitly forbids this.
- **Swap in a friendlier domain.** §4.2 says seed exactly these 12; the failures are the point.

Each would have produced a Send card that looks identical to a real one and is not backed by a
stated fact. §1 forbids that regardless of which component produced it, so the shortfall is
stated plainly in the README and in the report instead. Hold and Drop are both demonstrated —
`strict_icp` on drops rocketlane.com and zipy.ai under R-04 — so T-20 fails on the Send column
only, and it fails loudly.

A Send is reachable on this build whenever a company publishes its headcount; plivo.com proves
the path is live, and falls short only on independence (1 group, needs 2).

### D-23 · Timestamps are normalised in the driver, not at the call site [§8, D-03]
`/health` returned HTTP 500 — *"Objects are not valid as a React child (found: [object Date])"* —
the first time it was loaded against Neon with a real run in the table. Both drivers parse
`TIMESTAMPTZ` into a JavaScript `Date`, while every row type in `queries.ts` declares those
columns as `string`. TypeScript could not catch the mismatch because the driver's result is cast
on the way out, so the declared type was a comment with syntax.

Fixed in `lib/db/client.ts` by overriding the date/timestamp OID parsers on both drivers to hand
the text through untouched, rather than by formatting the one value that happened to crash.
D-03 claims the two backends are behaviourally identical; a per-call-site fix would have left
that claim false and the next timestamp read would have failed the same way.

Worth recording as a near miss: this page is T-25 and T-26's evidence, and it was only ever
exercised against PGlite with an empty `runs` table, where `finished_at` is `null` and the bug
is invisible. A green local suite is not a substitute for loading the page against the database
production actually uses.

### D-24 · Hunter's `available` is the plan total, not the remainder [§10, §15]
`/health` reported *"Used 7 of 57 · Remaining 50"* against an account that had 43 searches left.
Hunter's `/v2/account` returns `used: 7, available: 50, remaining: 43` — `available` is the
plan's size, and the code had read it as what was still unspent, then derived a 57-credit plan
that does not exist.

The field is now split into `limit` and `remaining` on `HunterQuota` so the name cannot be
misread again, and `remaining` is taken from Hunter's own figure. The 80% guard was already
computing `used / limit`, so it was never wrong — only the display was, which is the more
dangerous of the two: §15 asks for credits consumed and remaining to be reported, and the page
would have supplied a confident wrong number.

### D-25 · A killed invocation leaves a claim, not a result [§7.2, §13]
The first production run stranded `apty.io`. Vercel ended the invocation with
`FUNCTION_INVOCATION_TIMEOUT` partway through the agent loop, the row stayed at status
`running`, and the board spun on it with no process behind it. Two defects had to line up for
that to be permanent, and both are fixed:

`claimNextPending` only ever considered `status = 'pending'`, so a row orphaned by a dead
handler was unreachable forever. It now also takes a `running` row whose `claimed_at` is older
than `STALE_CLAIM_SECONDS` (90s) — longer than any handler may live, since `maxDuration` is 60 —
and orders `pending` ahead of stale retries so a reattempt never queue-jumps a domain nobody has
tried yet. The alternative, a heartbeat column updated during the loop, buys finer granularity
than one domain per request can use.

`/api/run/step` then compounded it: when nothing was claimable it returned `done: true,
remaining: 0`, which is a different statement from the one it had evidence for. A company held
by a live invocation is unavailable but unfinished. It now asks `countPending` and only reports
done — and only calls `finishRun` — when the count is actually zero.

Recorded because it is the one class of bug the local suite structurally cannot reach: PGlite
runs in-process and is never killed mid-transaction, so "the handler dies" is not a state it can
enter. `tests/claim.test.ts` reproduces the *consequence* by backdating `claimed_at`, which is
the closest a single-process test can get.

A second deploy was needed because the first fix did not reach the row it was written for. The
reclaim condition required `claimed_at` to be non-null, and the stranded row was claimed before
the column existed, so it aged out of nothing and stepping the run still returned
`remaining: 1` with no claim. Adding a column mid-incident means the rows you are trying to
rescue are exactly the ones that predate it. `claimNextPending` is the only writer of status
`running` and always stamps the time, so a null is now read as abandoned.

### D-26 · The handler watches its own clock, and the run is allowed to give up [§7.2, §12]
Reclaiming a stranded row (D-25) fixed the symptom and exposed the cause: `apty.io` was reclaimed
and then timed out again, because nothing in the pipeline knew how long it had. The agent loop
could open four extra pages at up to 20s each, and each model call carries its own 30s timeout,
so a slow site could spend the whole 60s budget before reaching a verdict.

`runCompany` now measures elapsed time and stops opening new pages once only the tail's reserve
remains (25s for scoring, Hunter and the two model calls), writing a `loop_trace` row with
`chosen_by = 'deadline'` so the audit panel shows the clock as a reason the same way it shows
AI-2's choices. If the budget is nearly gone by ⑨, pain points are skipped before the draft,
because a draft without pain points is still useful and the reverse is not; a skipped draft says
so in `blocked_reason` rather than appearing empty.

This is the §1 rule applied to time rather than to evidence. A deadline reached means fields stay
`not stated` and R-22 returns a HOLD naming them — the pipeline reports what it managed to read
instead of guessing the rest.

Separately, retries are capped at `MAX_CLAIM_ATTEMPTS = 3`. Reclaiming without a ceiling turns
one stuck row into a board that retries forever, which is the original bug wearing a disguise: a
site slow enough to outlast the budget once will do it again. The fourth claim quarantines the
domain with reason code `handler_timeout`, so §12's page states plainly that this pipeline could
not read it in the time one request is allowed — a reported limit rather than a hidden loop.

---

## Phase 1 — the decision layer and the evidence hole [FIX_PROMPT §2]

### D-27 · The cleaner was deciding which facts exist [§2.3, F-2, F-5, withdraws D-22]
`lib/fetch/clean.ts` dropped any block under 8 words and then truncated the result at 2,000
tokens. Both are reasonable cost controls and both were silently destroying the evidence the
board depends on:

- whatfix.com states *"crossing 500 employees globally"* at raw index 236,854 of 330,556 on
  `/about-us` — 72% of the way through the page, well past the cap. v1 truncated it away and
  then reported `not stated` as though the company had never said it.
- A page that renders its headcount as a stat tile produces the block `| 500 Employees` — three
  words, below the floor, deleted.

The fix is narrow on purpose. A block is exempt from the word floor when it matches
`HEADCOUNT_FACT` and is under 300 characters, and matching blocks that the cap removed are
re-appended **verbatim** after truncation. Verbatim matters: a quote taken from a rescued block
still has to verify against the live page, so paraphrasing or trimming it would convert a §1
violation from "fabricated" to "unverifiable", which is not an improvement.

The general lesson is the one D-22 missed. When a measurement says a fact is absent, the first
question is whether the instrument can see it. I measured the cleaned text and reported a
property of the web.

### D-28 · Two of the four extra fetches are reserved, not pooled [§2.1, F-3, F-4]
`MAX_EXTRA_FETCHES` is still 4 — the cap did not move, who spends it did. v1 let AI-2 choose all
four, and AI-2 spent every one chasing `size_band`, never opening the security page. That page
carries S-01, S-02 and S-03: the largest block of points on the board. The loop was structurally
incapable of producing a Send because it never read the page where Send comes from.

`lib/fetch/plan.ts` makes slots 0 and 1 reserved — security then careers — and leaves 2 and 3 to
the model. Two consequences worth stating:

- **A reserved slot runs even when the Evidence Map is already full.** Signals are not Evidence
  Map fields, so "nothing is missing" is not a reason to skip the page where the signals live.
- **The slot is spent whether or not it finds anything.** It asked its question. A company with
  no security page is a real finding (`security_page_checked = true`, `security_page_url = null`,
  rendered as `no security page found`), not a failed fetch to retry.

`driveableFields` then demotes `size_band` to one discretionary turn, so the field that
monopolised v1's budget cannot do it again — unless it is the only unknown left, in which case
a second look beats ending the loop with fetches in hand.

### D-29 · Zero open roles is not a small company [§2.3]
The spec maps `0-5 roles → likely ≤ 50`. `bandForJobCount(0)` returns `null` instead, because
nearly every zero we observed was a JavaScript-rendered board that neither fetch tier could read
— whatfix's careers page yields 0 links even through `r.jina.ai`. Reading "we could not see the
listings" as "they are a small company" is the same fabrication as D-27 pointing the other way,
and it feeds R-02b, which **drops** companies. A wrong DROP is worse than no DROP.

For the same reason `statedSize` rejects a people-number in a sentence about customers. atlan.com
publishes *"onboarded 6,000 people onto the platform"*; reading that as headcount would have
dropped a fitting company on R-02 using a figure about its users.

### D-30 · R-02 splits into a/b/c so the board shows which evidence dropped you [§2.4]
One rule id for two very different kinds of evidence hid the difference. R-02a is a headcount the
company stated on its own site with a quote behind it; R-02b is a band counted from open roles
with no quote at all and `evidence: null` by construction. Same verdict, different confidence,
and a judge reading the board has to be able to see which happened. R-02c is not a drop — it
flags `size_unknown` on a passing company so an unanswered question stays visible instead of
passing silently.

### D-31 · A cache hit does not refund a loop fetch [§2.6b]
`page_cache` has a 7-day TTL and saves the request to the company's server and the tokens spent
cleaning the page. It does **not** return a slot to the budget. `MAX_EXTRA_FETCHES` models
*questions answered*, not money spent — if a hit were free, re-running the same list would buy
the loop more reading than a first run had, and the same input would stop producing the same
verdict. §11's determinism requirement outranks the saving.

### D-32 · The politeness delay is charged on the gap, not before each request [§0.1, §2.6a]
`awaitPoliteness` waits only the remainder owed since the last request to that host, so two
reserved fetches cost 800ms of delay between them rather than 800ms each, and time already spent
cleaning the previous page or waiting on a model call counts toward the gap. Inside a 60s handler
that difference is the margin. `Crawl-delay` from robots.txt overrides the default when larger,
capped at 5s — a 60s handler cannot honour a 60s delay and still read anything, and quietly
ignoring the directive would be worse than capping it visibly.

### D-33 · Hunter metadata is read from cache only, never fetched [§2.3 source 3]
Size inference runs **before** the fit gate, and the fit gate can DROP. A live Hunter lookup
there would spend a credit on a company we are about to discard. `peekHunterMeta` reads the
existing cache and returns null otherwise — zero credits, zero network. This also fixed a
guarantee-of-nothing bug: v1 cached only the email array, so the `company_size` field source 3
reads could never have been present.

### D-34 · zomato.com is replaced by zerodha.com [§2.5]
zomato's robots.txt answers 403, so it quarantined before the fit gate ran and the R-01
demonstration — the non-SaaS DROP the sample set exists to show — never happened. A domain that
cannot be read cannot demonstrate a rule about what it is. zerodha.com is equally plainly not
B2B SaaS (a retail stock brokerage) and both its robots.txt and homepage return 200 with ~950
clean words. swiggy.com (202, 0 words) and nykaa.com (52 words) were tried first and rejected on
the same ground. Verified by running them, not assumed.

### D-35 · Security-page candidates rank by path strength, not by who linked them [§2.1]
Found by running the sample set, twice, in opposite directions.

The reserved security slot originally probed site-published links before conventional guesses,
on the reasoning that a real link is evidence the page exists and a guess is not. That is true,
and it still cost four of eight companies their security page: every footer on the web links a
privacy policy, `/privacy-policy` matches the `/privacy` entry in `SECURITY_PATHS`, and a long
privacy policy clears the 200-word floor and wins the slot on the first probe. whatfix and
rocketlane both publish a `/trust` page of 700+ words that was never opened. The slot was spent
and S-01 and S-02 — the signals it exists to reach — stayed unreachable.

Inverting the rule so path priority beat link provenance fixed those two and broke nected.ai,
which publishes neither `/security` nor `/trust` but does link a compliance page. Three guessed
paths exhausted its probe budget before that link was reached, and nected fell from SEND at 70
to HOLD at 15.

Both observations were correct and they were about different things. The offender was `/privacy`
specifically: it belongs among the candidates because a privacy policy occasionally names a
certification, but it carries no badge and no certification status, so neither S-01 nor S-02 can
ever fire from one. `WEAK_SECURITY_PATHS` demotes it below every other candidate, linked or
guessed, and provenance goes back to breaking ties among equals.

The general shape is worth naming, because it is the same one as D-27: a rule that looks like it
is about *where to look* was really about *what counts as having looked*.

### D-36 · A 404 does not escalate to the reader tier [§2.6a, §0.1]
Three of ten domains exceeded the 60s handler on the first Phase 1 run. §0.1 anticipated this and
named the lever — lower the per-fetch timeout from 20s to 12s before touching
`MAX_EXTRA_FETCHES`. The premise turned out not to hold: there is no 20s timeout. Tier 1 is 8s
and tier 2 is 12s, both already at or under the target, and the 20s figure is the two of them
added together on a single page.

The actual cause was that they were being added together on pages that did not exist. Reserving
two slots means probing conventional paths, a company with no `/security` and no `/trust` misses
several of them, and a 404 fell through to tier 2 — which fetches the same URL through a proxy
and cannot conjure a page the origin says is absent. Up to six reader timeouts per company, all
spent confirming something tier 1 had already established.

404 and 410 now stop at tier 1. 403 and 2xx-but-thin still escalate, because those are the cases
the reader tier exists for: the content is there and tier 1 could not see it. This made a missed
guess cheap enough to raise `MAX_SLOT_PROBES` from three to four rather than cut it.

`MAX_EXTRA_FETCHES` was not touched, and did not need to be.

### D-37 · Control bytes are stripped during cleaning [§2.3]
atlan.com ended the first Phase 1 run with `invalid byte sequence for encoding "UTF8": 0x00`
standing on the board where a verdict belonged. It serves a NUL byte; Postgres `text` columns
cannot hold one and reject the whole INSERT. C0 controls are now removed in `cleanHtml`, where
every tier's output passes through. None of them carry meaning in page text, and a quote
containing one could not be matched against the live page anyway — so stripping them costs no
evidence and removes a class of crash that presents as a missing verdict rather than as an error.

### D-38 · The page cache stores links, because a verdict may not depend on cache state [§2.6b, §11]
`page_cache` originally stored `clean_text` and nothing else, and the comment above it defended
the choice: links and job counts are cheap to recompute, but only from raw HTML, which we
deliberately do not keep. A cached page therefore contributed text and nothing else.

That is a determinism bug, not a storage trade-off. §11 requires the same input to produce the
same verdict, and nected.ai produced **SEND at 70 on a cold run and HOLD at 15 on a cached one**.
It publishes no `/security` and no `/trust`; its only route to S-02 is a compliance page linked
from its own site. Serve that page from cache with an empty link list and the route disappears.
The same loss silently disabled `inferSize`'s job-link source on any cached careers page, so a
headcount that was measurable cold became `not stated` warm.

Links are part of what a fetch *found*, not a detail of how it was *rendered*, so they are now
persisted beside the text in `links_json` and `job_links_json`. Both columns are nullable on
purpose: NULL marks a row written before link caching existed, and `getCachedPage` treats that as
a miss. Such a row refetches once and repairs itself, rather than serving a lossy hit for the
remaining seven days of its TTL.

What the cache was always for is unaffected — a hit still skips the request to the company's
server and the tokens spent re-reading the page. It still does not refund a loop fetch (D-31).

### D-39 · R-23 fails closed, and names *why* a quote failed rather than just that it did [§3.1]
The old validator asked one question — does this quote appear verbatim in the text we fetched —
and four quotes from the first Phase 1 run passed it that should not have: an industry statistic
about the SaaS market, a staff bio opening "Prior to Zipy…", a YouTube cookie banner, and a Jina
Reader error page. All four are genuinely present. Verbatim is a test of *transcription*, not of
*support*, and the gap between those two is exactly where a confident wrong email comes from.

R-23 adds two tests to the verbatim one: the quote must mention the company, and it must contain
a trigger term for the signal it was attached to. Two design points are worth recording.

**Naming the company is necessary but not sufficient.** "Prior to Zipy, Vishalini led engineering
at a healthcare company" does name Zipy, so a naive mention test passes it — while the sentence
is about a *different* employer at a time *before* the company existed. Biographical and
third-party attributions are therefore disqualified explicitly, not by hoping the name test
catches them.

**First person counts, but only on the company's own host.** "We are SOC 2 compliant" on their
site is a mention; the same sentence on a vendor's blog is not, because the "we" is the vendor's.

Three deliberate consequences:

- **`tier` is optional on `FiredSignal` but absent means unsupported.** Detection runs before
  anything has judged the evidence, so the field cannot be required at construction. A signal that
  reaches the verdict without one scores 0. The failure direction is a Send that becomes a Hold,
  never a Hold that becomes a Send.
- **The tier is stored on the row, not recomputed.** Re-scoring from a slider must not refetch
  pages (§5.5, T-22), so the tier decided at run time is read straight back from the database.
- **An asserted claim is still shown.** Greyed, struck through, with the reason, because hiding it
  would quietly recreate the thing R-23 exists to expose — the reader would see a lower score and
  no explanation of what was found and rejected.

The cost is real and was accepted rather than designed around: nected.ai's three signals all quote
marketing copy that names no one, so a domain that scored SEND/70 under the old validator is
expected to lose points under R-23. That is the check working. Loosening the mention test to
protect a board count would be optimising the demo against the rule it is demonstrating.

### D-40 · Fabrications are logged, because a block nobody can see cannot be told from no check [§3.2]
`applyEvidenceTiers` drops fabricated signals — correctly: a quote on no page we fetched has
nothing to link to. But dropped claims leave no trace, and §3.2's counter is the single artifact
that proves the check runs at all. A counter that can only ever report the failures it happens to
have kept is not evidence of anything.

So the pipeline tiers with `tierAllSignals`, records every refusal to `evidence_blocks`, and only
then filters. One table for all three kinds of claim, so Health is a single query rather than a
union over three tables that each store their tier differently.

Two details that keep the number honest:

- **`produced` on a pain point.** Two slots are always returned, and an unfilled one is tiered
  `fabricated` so the card renders `not stated`. It is not a fabrication the check caught, though —
  the model stayed silent rather than invented — so it is excluded from the count. Padding the
  counter with the model's silences would make the best artifact in the build a lie.
- **Replace, not append, keyed on the company.** Re-running one domain restates its blocks instead
  of doubling them. The counter describes the run as it currently stands, not the sum of every
  attempt ever made at it.

Editing a draft re-checks through `tierDraft`, not the older verbatim-only validator. Otherwise an
edit would be a way around the support requirement: a hook downgraded to asserted at run time
would come back sendable the moment anyone touched the body.
