# Signal — Verification Log (G6)

Written for a reader who was not watching. Every entry names the command run, the output
observed, and a verdict: **PASS**, **FAIL** or **GAP**.

Starting commit: `1d7ca3c` (Phases 1–6 of `FIX_PROMPT.md`).

---

## Summary

| Verdict | Count | Where |
|---|---|---|
| **PASS** | 23 | §1 discipline · A.1 A.2 A.3 · Part B · §5 A4 M5 F1 F2 F4 F6 · §6.2 §6.3 §6.4 §6.5 §6.6 · §7.1 §7.2 §7.4 §7.5 §7.6 §7.7 |
| **PASS (by construction)** | 2 | F3 Hunter 429, F7 cost ceiling — not forced against live services, and marked apart so the distinction is on the record |
| **FAIL → fixed → PASS** | 2 | F8 blank screen on a database failure · §6.1 13.5s cold start |
| **GAP** | 3 | §9 — G4 D3 is a spec error · FABRICATED unfired on a live run · the F8 banner needs JS |
| **GAP → CLOSED** | 1 | GAP-1 — a real email was sent via Resend on 19 Nov 2026, with T-13's recipient lock proven live |

**Five real defects were found by executing paths that previously only had unit coverage**, none
of them by reading the code:

1. The contact ladder promoted a **Software Engineer over a Founder** (off-ladder tie fell
   through to alphabetical email order; `seniority` was being ignored).
2. The superseded contact kept the **ladder's** reason after R-52, not the human's.
3. Pulling the database produced a **blank screen** — there was no error boundary at all.
4. A cold production start was **13.5 seconds of blank page** — no loading state existed.
5. The header overflowed **every page** at phone width once the Replies tab was added.

A sixth finding was not a defect: my own `wrong_person` test reply contained an unsubscribe
request, and AI-5 was right to classify it `unsubscribe`.

---

## §1 · Measurement discipline

`npm run build` while a dev server is running corrupts `.next` and silently kills hydration.
That invalidated a round of verification during Phase 5, so this run starts from a cold build
and every interactive observation below is taken against `npm start`, never `npm run dev`.

```
$ lsof -i :3000 -i :3001
(no output — nothing listening)

$ rm -rf ./.next ./.next-stale-1794554861
$ ls -d .next .next-stale-*
zsh: no matches found      # both removed

$ npm run build
✓ Compiled successfully
  16 routes built, including ƒ /replies and ƒ /api/reply

$ npm start                # port 3000
```

Hydration confirmed before any interactive check:

```js
// in the page, against the production server
{ hydrated: true, url: "http://localhost:3000/", title: "Signal — outbound qualification & drafting" }
```

**PASS** — the stale `.next-stale-1794554861` directory (145 MB) is also deleted, which closes
§7.6 early.

---
## §4 · Part C — four domains chosen for fit, recorded before they were fetched

G6 §4 requires the selection to be committed **before** observation, so that a bad score cannot
quietly become a reason to swap a company out. This section was written and committed to the
repository before `SAMPLE_DOMAINS` was edited and before any of the four was fetched.

ICP applied, from `G2_Stack_and_ICP.md` Part 1: *cloud-native B2B SaaS, 11–200 employees, Seed to
Series B (Series C a fading edge), whose own public pages show compliance pressure, and which does
not already run an in-house GRC function.* India or India-adjacent.

| Domain | Why it fits the ICP — written before fetching |
|---|---|
| `zluri.com` | Bengaluru. SaaS management and access governance, Series B. Sells directly to IT and security buyers, and holds customers' SSO and identity data — access review is the adjacent problem to evidence collection, so compliance pressure is structural rather than incidental. |
| `signzy.com` | Bengaluru/Mumbai. Digital KYC and onboarding for banks and NBFCs, Series B. A regulated vertical by definition — its customers are RBI-governed — and it processes identity documents. If S-07 does not fire here, S-07 is miscalibrated. |
| `everstage.com` | Chennai. Sales commission management, Series B. Handles compensation and CRM data for mid-market and enterprise RevOps teams, which is the buyer segment that sends security questionnaires. |
| `hyperverge.co` | Bengaluru. AI identity verification, Series B. Processes biometric and government-ID data for financial-services customers — about as data-sensitive as B2B SaaS gets. |

**Predictions are deliberately absent.** I do not know what any of these four publish on their
security pages. Whatever they score is recorded below unchanged. Per §4, the only legitimate
reason to remove one afterwards is a *structural* failure (robots 403, DNS death), recorded the
same way `zomato.com` was.

---

## §2 · Part A — the three paths that had never run

### A.1 · `FABRICATED` fires, visibly — **PASS**

New surface: a **"Run the fabrication drill"** button on `/selftest`, backed by
`lib/seed/fabricationDrill.ts` and `POST /api/drill`. It runs the *shipped* tiering functions
(`tierForSignal`, `applyEvidenceTiers`, `repriceSignals`, `zeroUnsupported`) over a stored
fixture — a private re-implementation would have demonstrated nothing about the real code.

The domain is `fabrication-demo.invalid`. `.invalid` is reserved by RFC 2606 and can never
resolve, so it cannot be mistaken for a company.

Observed on screen after pressing the button (production build, `npm start`):

```
This is a stored fixture, not a live company. It exists to show the check firing.

DOMAIN                      fabrication-demo.invalid
THE PAGE TEXT WE FETCHED    "Security at Fabrication Demo. We encrypt data in transit and at
                             rest, and we review access quarterly. Questions about our security
                             practices can be sent to the team through the contact form."
THE QUOTE THE MODEL CLAIMED "Fabrication Demo completed its SOC 2 Type II audit in March 2026
                             with zero exceptions."
APPEARS IN THE PAGE TEXT?   NO — NOT ON ANY PAGE FETCHED FOR THIS COMPANY
TIER ASSIGNED BY R-23       FABRICATED
                            "this quote does not appear on any page we fetched for this company"
POINTS                      +40 claimed    0 awarded
REACHES THE SCORING SET?    NO — DROPPED BEFORE SCORING   (timing score with this signal: 0)
```

The stubbed quote is deliberately plausible rather than garbled — that is the shape a real
hallucination takes: a sentence the page could have contained and did not.

**The Health counter is untouched by this.** The drill writes nothing to the database, so the
run-level counter continues to report what the real run found. Padding that counter with a
fixture would turn the best artifact in the build into a lie, which is the opposite of what A.1
is for. The screen says *"This is a stored fixture, not a live company"* in those words.

---

## §5 · Part D — the golden set, row by row

`G4_Golden_Test_Set.md` is the contract. Rows that can be forced deterministically are asserted
in `tests/goldenRows.test.ts`; live rows are recorded against the real run further down.

### A4 — funding alone must never reach Send — **PASS**, and it exposes a contradiction in G4

```
$ npx vitest run tests/goldenRows.test.ts
✓ holds at the default funding weight of 10          (10 pts, 1 group, HOLD)
✓ still holds at the maximum funding weight          (50 pts, 1 group, HOLD, R-21)
✓ the slider moves the score                          (10 → 45 pts, still HOLD)
```

**Observed ≠ expected, and G4 is the one that is wrong.** `G4 §5 D3` says *"Move funding from
10 → 45 … A4 moves from HOLD to SEND and the trace says why."* It cannot, at any weight:

- R-20 requires **both** ≥ 50 points **and** ≥ 2 independent groups.
- A funding-only company has exactly one group (`funding`) however the slider is set.
- At the maximum weight of 50 the score bar clears and **R-21 holds it** — *"only 1 independent
  signal"*.

So D3 contradicts A4 in the same document, and A4 is the row to keep. A4's own note says it
plainly: *"If A4 ever returns SEND, the weights are wrong and the build has quietly become the
thing I said I wouldn't build."* Making D3 pass would mean letting a press mention qualify a
company, which is the exact failure A4 was written to prevent.

**What D3 was reaching for is still demonstrable**, and the third assertion above is it: the
slider genuinely moves the score (10 → 45) and the board genuinely re-ranks. What it cannot do
is manufacture independence, because independence is a different test from weight. The honest
demonstration of customisation is a company with *two* groups crossing the line — which is
what `S-06` at 45 does on a real multi-signal company.

**Verdict: PASS on A4. GAP recorded against G4 D3 as a specification error, not a code defect.**

### M5 — Hunter returns only generic mailboxes — **PASS** (forced by fixture)

No live domain in the set produced an all-generic Hunter response, so it is forced:

```
✓ refuses to select any generic mailbox, at any confidence
✓ prefers a named person at confidence 40 over info@ at confidence 95
✓ a company with only generic mailboxes becomes a HOLD, never a send to info@
```

R-30 ranks `info@` / `hello@` / `support@` at 99 and the selector refuses them outright. The
rule M5 is really testing — *"the system would rather hold than send to a mailbox nobody
reads"* — holds.

### A.3 · R-52 promotes a runner-up on real data — **PASS**, after fixing two defects it exposed

Executing this path found two real bugs. Both are fixed; neither was found by reading the code.

#### Defect 1 — the ladder promoted a Software Engineer over a Founder

First attempt, on `zipy.ai`. `size_band` is unknown there, so the null band uses the 51–200
ladder, on which neither "Founder" nor "Software Engineer" appears — both landed off-ladder at
rank 99 with confidence 70. The tiebreak then fell through to **alphabetical email order**:

```
BEFORE  SELECTED rank=2  Anchal Rastogi  | Chief Technology Officer
                 rank=99 Sandesh Murdia  | Software Engineer   seniority=null
                 rank=99 Vishalini Paliwal | Founder           seniority=executive

APPLY → {"applied":true,"rule":"R-52","note":"Promoted Sandesh Murdia"}     ← wrong person
```

Hunter already returns a `seniority` field and the ranker was ignoring it. `selectContact` now
breaks a ladder tie on seniority **before** confidence. That ordering is consistent with the
design rather than new: confidence is *deliverability*, not relevance, and the ladder already
prefers relevance over deliverability (a named person at confidence 40 beats `info@` at 95).
Locked in `tests/poc.test.ts` with the real Hunter rows, including that an unknown seniority
sorts last and that seniority never rescues a generic mailbox.

#### Defect 2 — my own test reply was ambiguous, and AI-5 was right to call it

My first `wrong_person` fixture ended *"Please don't send this to me again."* AI-5 classified it
`unsubscribe` at confidence 0.90 with that exact sentence quoted. **The model was correct** — that
is an unsubscribe request — and it erred toward the conservative reading, which is what the
prompt asks for. The fixture was the problem, not the classifier. Replaced with a reply that is
unambiguously about the person and not about contact.

#### The clean execution, on `zluri.com`

```
CLASSIFY  intent=wrong_person  confidence=0.95
          quote="I'm not the right person for this one."     ← verbatim in the reply
          action R-52 · effect=recontact · requiresTypedConfirmation=false

APPLY → HTTP 200 {"ok":true,"applied":true,"rule":"R-52","effect":"recontact",
                  "note":"Promoted Aditi Sharma"}

BEFORE  SELECTED rank=99 Sethu Meenakshisundaram | Cofounder          conf=98 executive
                 rank=99 Divyam Sharma           | Software Engineer  conf=97 (no seniority)
                 rank=99 Aditi Sharma            | Head of GTM        conf=96 executive

AFTER   SELECTED rank=99 Aditi Sharma            | Head of GTM
                 rank=99 Sethu Meenakshisundaram | Cofounder
                   lost: "R-52: they replied that they are not the right person
                          — superseded on 2026-11-14"
                 rank=99 Divyam Sharma           | Software Engineer
```

Three things to note:

- **The ladder re-ran and the runner-up was promoted.** ✅
- **The seniority fix is visible here too:** Divyam (confidence 97, no seniority) would have won
  under the old ordering. The Head of GTM, an executive at 96, beat the IC at 97.
- **The superseded primary records the reply as the cause**, not the ladder's original reason.
  `supersedeContact` writes it; `swapSelectedContact` alone left "ladder rank 99 vs 2", which
  says nothing about a human having told us we had the wrong person.

And the detail page's panel, observed on screen:

```
WHAT WOULD MOVE THIS
  [reply]  R-52 applied — contact re-laddered after a reply
  They replied that we had the wrong person, so the contact ladder was re-run with them
  excluded and the runner-up promoted. The draft above still opens to the previous contact —
  re-draft it before sending.
```

A reply is newer information than the run that produced the verdict, so it is rendered above the
verdict's own reasoning rather than in a history panel. The verdict's `what_would_change_it`
("20 more points and 1 more independent signal") is kept below it — §0 protects that panel.

### A.2 · R-54 executes a permanent block — **PASS**

**Target: `everstage.com`.** R-54 cannot be run against the board's only Send, and every domain
in the original twelve carries a demonstration (`apty.io` is the `strict_icp` toggle,
`springworks.in` the R-22 handoff, `zipy.ai` the R-23 asserted quotes, `zerodha.com` R-01,
`whatfix.com` R-02a, `sprinto-test-does-not-exist-9x.com` the dead domain). `everstage.com` is
one of the four new domains and landed HOLD on R-04 — a migration-play example that `apty.io`
already provides. It is the row that carries the least unique demo weight, which is the whole
selection criterion §2 A.2 sets.

**No undo was added.** Permanence is the point, and `setOutreachState` additionally refuses to
move a domain *out* of `block` by any later reply.

#### Step 1 — the guard a judge will test: wrong confirmation phrase

```
POST /api/reply  {mode:"apply", intent:"unsubscribe", confirmation:"block permanently"}
→ HTTP 400 {"error":"R-54 is permanent and requires the exact phrase
                      \"BLOCK PERMANENTLY\" to be typed."}

outreach_state AFTER: (none)          ← nothing written
```

Lower-case fails. The check runs server-side, not only in the browser, so disabling the button
is not the only thing standing between a misclick and a permanent block.

#### Step 2 — the full path with the correct phrase

```
CLASSIFY  intent=unsubscribe  confidence=1.00
          quote="please take us off your list permanently."   ← verbatim in the reply
          action R-54 · effect=block · requiresTypedConfirmation=true
                      · confirmationPhrase="BLOCK PERMANENTLY"

APPLY → HTTP 200 {"ok":true,"applied":true,"rule":"R-54","effect":"block"}
```

`outreach_state`, before and after:

```
BEFORE  (none)

AFTER   {"domain":"everstage.com","kind":"block","rule":"R-54",
         "reason":"Block this domain permanently. Every future run quarantines it before any
                   page is fetched. This cannot be undone from this interface.",
         "until":null,                       ← no expiry. This is what permanent means.
         "created_at":"2026-11-14T04:33:44.400Z"}
```

#### Step 3 — the next run skips it, with a named reason

The very next run of the sample set, before any page was fetched:

```
$ node runboard.mjs
submitting 16 entries
run: run_5106aa7bfecc4154b19f  queued: 13  dupes: 2        ← 14 unique, 13 queued
suppressed at start:
   everstage.com :: R-54: they asked not to be contacted again. This block is permanent.
```

The gate sits in `/api/run/start` **before** `insertCompany`, so the domain is never queued and
therefore never fetched. A blocked domain that got queued and then fetched would have been
contacted in every sense that matters.

---

## §3 · Part B — the send path is provable before the credentials exist — **PASS**

`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `RESEND_API_KEY` and
`EMAIL_FROM` are not set, so `sends` had 0 rows and step 7 of the brief was unproven. Closed with
a third transport, `dry_run`, which **does not transmit and never says it did**.

Observed by pressing **Approve and send** on the live `rocketlane.com` Send card:

```
DRY RUN
Not sent — no mail transport is configured.

This is the exact message that would have been transmitted. Add the Gmail or Resend
credentials and this same draft goes out unchanged — no code change, no re-draft.

RFC 822 BYTES — WHAT THE GMAIL PATH WOULD BASE64URL-ENCODE

To: demo@example.com\r\n
From: the Growth Lead at Sprinto <me — the authorised Gmail mailbox, substituted by the API
      at send time>\r\n
Subject: Compliance automation for your engineering team\r\n
MIME-Version: 1.0\r\n
Content-Type: text/plain; charset="UTF-8"\r\n
Content-Transfer-Encoding: 8bit\r\n
\r\n
According to your press announcements, Rocketlane raises $60 Million in Series C to Redefine
Professional Services for the AI Era. ...
```

Those are the real bytes, CRLF-terminated, not a summary of them. The `From:` does not invent an
address we do not have — Gmail substitutes the authorised mailbox for the literal `me`, so that
is what is shown.

The row it wrote:

```
transport=dry_run | status=not_sent | to=demo@example.com
error="No mail transport is configured (no Gmail OAuth values and no Resend key)."
```

And `/health`, counting three ways rather than two:

```
Send transport                    [DRY RUN ONLY]
Sent                        0
Dry-run (not transmitted)   1
Send failed                 0
Transport chain             none configured — dry run
```

The four rules §3 sets, and how each is held:

| Rule | How |
|---|---|
| `dry_run` impossible when credentials are present | `dryRunAvailable()` is false if Gmail **or** Resend is configured. `tests/dryRun.test.ts` asserts all four combinations, including that a partial Gmail config (2 of 3 values) does **not** count as configured. |
| The word "sent" never appears in any tense | The only occurrence on the card is *"Not sent"*. A test asserts the outcome object carries no `sent`/`sending`/`sends` token. |
| Health reports `dry-run` separately | Three counters above, from `sendCounts()`. Folding it into `sent` would claim a transmission; into `failed` would report a breakage when nothing broke. |
| The chain order is unchanged | `sendEmail` still walks Gmail → Resend → fail loudly. The dry run is checked **before** that chain is entered, never inside it, so a transport failure cannot silently downgrade into "here are the bytes". |

**The one-line check that no code change is needed when the credentials land:**

```ts
it("the first real send needs no code change — credentials alone flip the selector", () => {
  expect(dryRunAvailable()).toBe(true);
  process.env.GOOGLE_CLIENT_ID = "id";
  process.env.GOOGLE_CLIENT_SECRET = "secret";
  process.env.GOOGLE_REFRESH_TOKEN = "token";
  expect(dryRunAvailable()).toBe(false);
  expect(capability.gmail()).toBe(true);
});
```

---

## §6 · Part E — the judge surfaces

### §6.2 · Mobile (375 × 844) — **PASS**, after two real fixes

Measured, not eyeballed: for each page, `documentElement.scrollWidth − clientWidth` and the
widest element extending past the viewport.

**Two defects found and fixed.**

1. **The header overflowed every page by 37–48px.** Adding the *Replies* tab gave the nav five
   links, which do not fit at 375px — so every page had a horizontal scroll, not just one.
   `SiteHeader` now wraps.
2. **The loop trace was a 640px table inside a scroll container.** The page did not scroll, but
   the *table* did, and the column a judge has to drag sideways to reach is **Why** — the one
   carrying the argument. It is now a table on `sm:` and up, and stacked cards below, with the
   field names humanised (`company size`, not `size_band`).

After both fixes:

| Page | overflow at 375px |
|---|---|
| `/` | **0px** |
| `/replies` | **0px** |
| `/quarantine` | **0px** |
| `/health` | **0px** |
| `/selftest` | **0px** |
| `/company/[id]` | **0px** — table hidden, 5 stacked steps rendered |

Desktop at 1014px confirmed unchanged: table visible, stacked list hidden, 0px overflow.

### §6.3 · Zero empty sections — **PASS**

All four empty states route through `lib/ui/emptyStates.ts`, asserted by T-26:

```
app/quarantine/page.tsx:39   : EMPTY_STATE_QUARANTINE
app/health/page.tsx:160      : EMPTY_STATE_HEALTH
components/Replies.tsx:159   : EMPTY_STATE_REPLIES
components/Board.tsx:580     : {EMPTY_STATE_BOARD}
```

Each states what is absent, why, and the next action. T-26 fails if one is deleted or trimmed
below 20 characters — a test against a string the page does not render would have been F-11
again, so the pages render the same constants the test reads.

### §6.4 · Toggle matrix — **PASS** (G4 A3 and D4)

`strict_icp` against the two certified companies, via `/api/rerank`:

```
strict_icp OFF (default)
  apty.io  HOLD  play=migration  R-04
    "HOLD — R-04: already certified, routed to the migration play (strict_icp off).
     Timing score 15 across 1 independent signal."
  zipy.ai  HOLD  play=migration  R-04

strict_icp ON
  apty.io  DROP  play=greenfield R-04   "DROP — R-04: already certified"
  zipy.ai  DROP  play=greenfield R-04

strict_icp OFF (restored)  → back to migration HOLD
```

Both verdicts are reachable by one toggle and both are explained, which is what G2's documented
disagreement with slide 40 promised.

### §6.5 · Re-scoring costs nothing — **PASS**, proved from the tables

Not from the UI's claim — from `fetches` and `cost_ledger` directly:

```
BEFORE: fetches=75  cost_ledger_rows=93
  rocketlane:55  whatfix:30  zluri:30  apty:15  zerodha:15  atlan:10  ...

POST /api/rerank  (S-06 funding 10 → 45)  → HTTP 200

AFTER : fetches=75  cost_ledger_rows=93
  rocketlane:90  atlan:45  whatfix:30  zluri:30  apty:15  zerodha:15  ...

fetches delta     = 0
cost_ledger delta = 0
board order changed = true      (atlan.com moved 6th → 2nd)
```

This is G4's D3 in its honest form: a real company visibly moves up the board, and it costs
nothing because the score was never the model's to decide. `atlan.com` stays HOLD at 45 — one
independent group — which is A4's rule holding at the same time.

### §5 · Part D — fail-safe drills F1–F8

Run locally against the real modules, and recorded as local, per G6 §5.

| # | Drill | Result |
|---|---|---|
| F1 | Gemini returns invalid JSON | **PASS** — `tests/retry.test.ts` (T-15): the Zod error is re-sent to the model, exactly one retry, then rules-only. Grounding is enforced by the schema, not the prompt. |
| F2 | Gemini key removed entirely | **PASS** — `capability.ai() === false`, and `degradations()` returns a named warn banner: *"Rules-only mode. Verdicts, scores and rule IDs are still produced by the deterministic engine…"* |
| F3 | Hunter returns 429 | **PASS (by construction)** — the quota guard trips before the call; see F4. A 429 falls through the same cache → seeded path, and every seeded contact renders a visible `seeded` badge. Not forced against the live API: burning real credits to observe a 429 would cost the demo its remaining quota. |
| F4 | Hunter quota at 80% | **PASS** — `QUOTA_GUARD_RATIO = 0.8`, `HUNTER_LIMIT = 5`. The guard is a hard stop **before** the call, not a check after it. |
| F5 | Gmail token expired → Resend | **GAP** — cannot be executed. There is no Gmail token to expire. The chain order and its disclosure are asserted by `tests/send.test.ts` ("records which transport sent, so a fallback is never read as the primary path") and by F6 below, which shows both attempts recorded in order. |
| F6 | Gmail **and** Resend both down | **PASS** — fails loudly, both attempts named: `"Every transport failed. gmail: not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN) \| resend: not configured (RESEND_API_KEY / EMAIL_FROM)"`. One `sends` row per attempt, so the card can say why the fallback ran. |
| F7 | Cost ceiling hit mid-run | **PASS (by construction)** — `AI_COST_CEILING_USD` defaults to $1.00 and the run stops cleanly at the ceiling, keeping every completed company. Not forced: driving real spend past the ceiling to watch it stop would cost real money for an assertion the code already makes unconditionally. |
| F8 | Neon connection drops | **FAIL → fixed → PASS.** See below. |

#### F8 found a real defect: it was a blank screen

Drill: start the production server with an unreachable `DATABASE_URL`.

```
$ DATABASE_URL="postgresql://nobody:nothing@127.0.0.1:59999/nope" npx next start -p 3100
$ curl http://localhost:3100/
HTTP 500, 9446 bytes

VISIBLE TEXT: "Signal — outbound qualification & drafting"      ← the <title>, and nothing else
server log:   ⨯ Error: connect ECONNREFUSED 127.0.0.1:59999
```

G4 F8's expectation is *"Error banner, not a blank screen."* The app had **no error boundary at
all**, so Next's production error page rendered an empty body. The run failed visibly in the
server log and invisibly on screen, which is the wrong way round.

Fixed by adding `app/error.tsx` and `app/global-error.tsx` (the latter for a failure in the root
layout, which the former cannot catch). Re-running the same drill, observed in a browser:

```
Signal · Board · Replies · Quarantine · Health · Self-test          ← nav intact
Email sending isn't connected yet…                                  ← banner intact

This page could not be rendered.

The most common cause is the database being unreachable — Signal reads every board, verdict
and quote from Postgres on each request, so if Neon is down or DATABASE_URL is wrong, there
is nothing to render.

Nothing was half-written. A run processes one company per request and commits each one before
moving on, so whatever completed before the failure is intact and whatever did not is still
queued. Restoring the connection and re-running continues from where it stopped.

[Try again]  [Open /health to see what is configured]
```

**One honest caveat.** `app/error.tsx` is a client boundary, so the *server-rendered* HTML is
still empty and `curl` still sees a blank body — the banner appears once JS runs. A judge uses a
browser, so the row passes; a judge using `curl` would not see it. The server digest is shown
instead of a stack trace, because a hex digest is the only server detail Next exposes to the
client and a stack trace is not something an error page should print.

---

## §4 · Part C — what the four new domains actually scored

Recorded unchanged. None of the four produced a Send; all four stay in the set, which is the
rule §4 sets and the reason the reasons were committed to git before the fetch.

| Domain | Verdict | Score | Groups | Rule | What happened |
|---|---|---|---|---|---|
| `zluri.com` | **HOLD** | 30 | 1 | R-20 | S-02 **verified**: *"Zluri is designed with security at its core."* One independent group, so 20 points short of a Send. The strongest of the four. |
| `signzy.com` | **DROP** | 0 | 0 | R-23 | S-07 fired and was downgraded: *"Check business credibility with deep risk analysis…"* — real product copy that names no company. |
| `hyperverge.co` | **DROP** | 0 | 0 | R-23 | S-02 and S-07 both downgraded. *"KYC for Security & Brokerage…"* is a page title, not a statement about HyperVerge. |
| `everstage.com` | **HOLD → blocked** | 10 | 1 | R-04 | Already certified → migration play. Then used as the R-54 target (§2 A.2) and is now permanently blocked, so it appears in quarantine rather than on the board. |

**The honest reading:** two of the four fire a signal that R-23 then refuses, which is the same
pattern the original set showed. Marketing copy on an Indian SaaS homepage very often states a
capability without naming the company — *"KYC for Security & Brokerage"* — and R-23 is strict
about exactly that. `signzy.com` is the sharpest case: it is a KYC provider selling to
RBI-regulated banks, so S-07 is almost certainly *true* of it, and the quote still does not
support the claim. The rule costs a true positive there, and that is the trade R-23 was chosen
for: a verdict built on a sentence that does not mention the company is a verdict that cannot be
defended in a viva.

`zluri.com` is the counter-example that shows the check is not simply too tight: *"Zluri is
designed with security at its core"* names the company, speaks to the signal, and scores.

---

## §7 · Part F — freeze

### §7.1 · One clean run in the history — **PASS**

An earlier run was polluted: a regex in my own throwaway runner matched the `SAMPLE_NOTES`
array as well as `SAMPLE_DOMAINS`, so six prose strings were submitted as domains and quarantined
as `invalid_domain`. The real 14 domains were unaffected and their verdicts were valid, but the
quarantine page was noisy.

Fixed in the runner (it now slices only the `SAMPLE_DOMAINS` array) and a clean run was executed.
Every page reads `latestRun()`, so the clean run **is** what a judge sees; nothing was deleted.
Final quarantine is exactly two rows, both meaningful:

```
everstage.com                       [unsubscribed]  R-54: they asked not to be contacted
                                                    again. This block is permanent.
sprinto-test-does-not-exist-9x.com  [unreachable]   could not be reached: fetch failed.
                                                    No pages were fetched.
```

The reply history on `/replies` deliberately **keeps** the verification drills. They are real
applied actions against real companies, and hiding them would mean the "what changed" panel
lied about what changed.

### §7.2 · Components Map regenerated from the final code — **PASS**

Every box names a real file. Checked mechanically, not by eye:

```
subgraph/end: 9 9 balanced
undeclared edge endpoints: none
files named: 38 | missing: none        ← every <code>path</code> exists on disk
MERMAID_OK nodes=41 viewBox=-8 -8 5578 3749
```

One dangling edge (`V1 --> TEST`, pointing at a subgraph rather than a node) was found by that
check and fixed. The map now shows the two reserved fetches as distinct from the discretionary
loop, R-23 as a three-question gate with the `asserted` path arriving at zero points, the reply
loop as a second human checkpoint, and `dry_run` sitting outside the transport chain.

### §7.5 · No key was ever committed — **PASS**

```
$ git check-ignore -v .env.local
.gitignore:13:.env*     .env.local

$ git log --all -p -- .env.local
(empty — the path has never been committed on any branch)
```

Checking the path is not enough, because a key can be committed in some *other* file. So all
history was also searched for the literal values:

```
$ git log --all -p -S"npg_oPqFTLN7bIQ8"                 → 0 commits   (Neon password)
$ git log --all -p -S"AQ.Ab8RN6I"                       → 0 commits   (Gemini key)
$ git log --all -p -S"1cf7b5320ce635a13708dc177209f2db8b4d81a1" → 0 commits  (Hunter key)

$ git grep -lI -E "npg_oPqFTLN7|AQ\.Ab8RN6I|1cf7b5320ce6"
(no tracked file contains a live key)
```

### §7.4 · Clean from a cold `.next` — **PASS**

```
$ rm -rf .next && npm run build     ✓ Compiled successfully
$ npx tsc --noEmit                  clean
$ npx vitest run                    Test Files 20 passed | Tests 234 passed
$ git status --short                (empty)
```

### §7.6 · `.next-stale-*` deleted — **PASS** (done in §1)

### §6.1 · Cold start, timed — **FAIL → fixed**

The instruction was explicit that this is where a missing loading state gets found. It was.

```
$ curl -o /dev/null -w "ttfb=%{time_starttransfer}s" -H "Cache-Control: no-cache" \
       "https://signal-sprinto.vercel.app/?cb=$RANDOM"

  attempt 1 (cold):  ttfb=13.549s  total=13.838s  HTTP 200
  attempt 2 (warm):  ttfb= 1.823s  total= 2.039s  HTTP 200
```

**13.5 seconds of blank white page.** A serverless cold start, a fresh Neon connection and the
idempotent schema pass all complete before the first server component can resolve, and every
page is `force-dynamic` on purpose — a board rendering stale verdicts would be worse than a slow
one.

Fixed with `app/loading.tsx`, which gives Next an implicit Suspense boundary: the layout (nav,
degradation banners, footer) now streams immediately and a skeleton fills the slot underneath
while the data resolves. It does **not** make the cold start faster — it makes it legible, which
is the difference between "this is loading" and "this is broken". The copy names the cause,
because the one time a judge sees this screen for ten seconds, knowing why is the useful part.

### §6.6 · Footer cross-check — **PASS**

Present on every page, observed on `/selftest`, `/health` and a company card:

```
model gemini-3.8-flash · AI enabled
to: demo@example.com (locked in code)
All AI tasks run on Gemini Flash. The Claude API is not used.
```

### §7.7 · Production matches local — **PASS**

```
$ curl https://signal-sprinto.vercel.app/api/selftest

model: gemini-3.8-flash
TOTAL        passed 26  failed 0  skipped 0
structural   17 passed, 0 failed, 0 skipped
behavioural   9 passed, 0 failed, 0 skipped

T-16  All 11 companies that cleared R-01 have a security-page attempt on record
T-20  1 Send · 5 Hold · 6 Drop across 12 scored
T-21  1 Send hook(s) checked, every quote found character-for-character on the page
      its own URL points to
```

Identical to local. The live board shows the broadened sample set, and T-20 is green on merit —
it reads the live database, so if the pipeline stopped producing Sends it would go red on the
next page load.

---

## §11 · The 13.5s cold start was misdiagnosed in §6.1 [19 Nov 2026]

§6.1 recorded a 13.5s cold start, attributed it to "a serverless function cold start, a fresh
Neon connection and the idempotent schema pass", and added `app/loading.tsx` so the wait was at
least legible. The loading screen was a reasonable thing to add. The diagnosis under it was
wrong, and it stayed wrong because a measurement was taken and then explained rather than
explained and then tested.

Two causes, both structural, neither of them "serverless is slow".

**1. The function and the database were on opposite sides of the planet.**

```
x-vercel-id: bom1::iad1::zv5cx-...     function executes in iad1  — Washington DC
DATABASE_URL  ...ap-southeast-1...     database lives in ap-southeast-1 — Singapore
```

There was no `vercel.json`, so the function defaulted to `iad1` while Neon sat in Singapore.
Every query made a round trip of roughly 230ms before it did any work.

**2. The schema was replayed, statement by statement, on every cold start.**

`lib/db/client.ts` ran `for (const stmt of statements(schemaSql())) await driver.query(stmt, [])`
— **47 statements, sequential, each awaiting its own round trip.** 47 x 230ms is about eleven
seconds, which is most of the 13.5s and explains why the figure was so stubbornly reproducible.

### The fix

`vercel.json` pins the function to `sin1`, co-located with Neon. The Mumbai edge now reaches a
Singapore function that reaches a Singapore database, instead of crossing the Pacific twice per
query.

The schema replay is kept but fingerprinted. `schema.sql` is hashed; a matching hash in a new
`schema_version` table means every statement in it has already been applied, so the 47 round
trips become one `SELECT`. The property the replay existed for — `ALTER TABLE ... IF NOT EXISTS`
migrations reaching a deployed database with no migration step — is unchanged: alter one
character of `schema.sql` and the fingerprint misses and the full replay returns.

### Observed

| | before | after |
|---|---|---|
| Serving region | `iad1` (Washington DC) | `sin1` (Singapore) |
| Queries per cold start, schema | 47 | 2 |
| Warm TTFB, `/health` | 0.366s | 0.225s |
| Warm TTFB, `/replies` | 0.328s | 0.215s |
| First request after deploy | 13.5s (§6.1) | 0.50s |

`app/loading.tsx` stays, because a cold function and a suspended Neon branch are still real. It
no longer appears on every click: it is now invisible for its first 400ms, so any navigation that
beats that threshold shows no skeleton at all. The screen is reserved for the case it was written
for instead of flashing on every fast page load.

**What this says about the earlier entry.** §6.1 is left as written rather than quietly edited.
It is an honest record of a measurement taken correctly and reasoned about badly, and the gap
between those two is the point.

---

## §12 · v3 — the S-01 diagnosis, written before anything was changed [19 Nov 2026]

`FIX_PROMPT_V3.md` §2.3 asks why S-01 — 40 points, the largest single weight, the signal the
whole ICP argument rests on — has never fired across 12 scored companies, and requires the
diagnosis to be written down before the cause is touched. Here it is.

**Method.** For each company in the latest run (`run_5106aa7bfecc4154b19f`), read every page
actually fetched (`fetches.clean_text`, which is the same text the detector saw) and ask three
questions separately, so that "no certification language" and "no in-progress language" cannot
hide behind each other.

| domain | security page read | cert term anywhere | in-progress term anywhere | both in one sentence |
|---|---|---|---|---|
| apty.io | `/security` | yes | **no** | no |
| atlan.com | `/security` | no | **no** | no |
| hyperverge.co | `/in/industries/security-brokerage` | no | **no** | no |
| nected.ai | `/use-cases/compliance-and-auditing-for-healthcare` | yes | yes | **no** |
| plivo.com | `/security` | yes | **no** | no |
| rocketlane.com | `/trust` | yes | **no** | no |
| signzy.com | — none fetched — | yes | **no** | no |
| springworks.in | `/security` | no | yes | **no** |
| whatfix.com | `/trust` | no | **no** | no |
| zerodha.com | `/trust` | no | **no** | no |
| zipy.ai | — none fetched — | yes | **no** | no |
| zluri.com | `/security` | yes | **no** | no |

**Finding: this is a fact about the sample, not a defect in the code.**

Ten of the twelve use no in-progress construction anywhere on any page fetched. The two that do
are not talking about certification:

```
nected.ai       "We ask for features, and they promptly prepone them on their roadmap—ensuring
                 continuous improvements that align with SideCarHealth's evolving needs"
                 → a customer testimonial about the product roadmap

springworks.in  "* Description Twitter sets this cookie to integrate and share features for
                 social media and also store information about how the user uses the website"
                 → a cookie-banner description, matched twice
```

So S-01 is behaving correctly. **No company in this sample publicly states that a certification
is under way**, which is exactly the condition S-01 exists to detect. Widening the pattern until
it fired would not have found a mid-certification company; it would have manufactured one out of
a roadmap testimonial and a cookie banner — the precise failure R-23 was built to stop, committed
by the detector instead of the model.

The sample skews this way for a structural reason worth stating: a company mid-audit is in that
state for a few months, while a certified company advertises it permanently and an uncertified
one says nothing. S-01 detects a narrow window, so a 12-company sample finding nobody in it is
the expected outcome, not a surprising one.

**What was changed as a result: nothing in the detector.** §2.3 permits either a code fix or a
sample finding. This is a sample finding, and the brief's own instruction is to say so.

### Two companies added to test S-01, chosen and recorded before fetching

Per `G6_PROMPT.md` §4 the names and the reasons go down first, so the sample cannot be chosen to
flatter the result.

| domain | why it fits the ICP | why S-01 might fire |
|---|---|---|
| **zenskar.com** | B2B billing and revenue-recognition SaaS, Seed–Series A, 11–50 — squarely the 11–200 cloud-native band, and 44% of Sprinto's detected customers are 11–50 | A billing system touches revenue data for US SaaS finance teams. SOC 2 is a procurement gate for that category, so a company at this stage is either mid-audit or about to be, and usually says so on a trust page to unblock deals |
| **plumhq.com** | Employee health-insurance SaaS, Series A, 51–200, selling to Indian enterprises | Handles health and HR data, which puts ISO 27001 and SOC 2 pressure on it directly, and sells into enterprise HR where security review is routine. A regulated-vertical buyer forces the certification conversation early |

**Both stay in the set whatever they turn out to be.** If neither is mid-certification, S-01 still
has not fired, and that strengthens the finding above rather than weakening it — the log will say
so.

---

## §13 · v3 — the board before and after [19 Nov 2026]

Fresh live run `run_c8bcd0e6b22c45578635`. **132 fetches, 0 from cache**, all between 17:38 and
17:40 on 19 Nov — the page cache was cleared first, so every verdict below was read off today's
web rather than five-day-old text.

### Counts

| | before (`run_5106aa…`) | after (`run_c8bcd0…`) |
|---|---|---|
| SEND | **1** | **0** |
| HOLD | 5 | 14 |
| DROP | 6 | 3 |
| scored | 12 | 17 |
| S-02 fires on | 8 companies | **4** |
| S-02 verified | 3 | 1 |
| S-01 fires on | 0 | 0 |

### Every verdict that changed, and the rule that changed it

| domain | before | after | rule | why |
|---|---|---|---|---|
| **rocketlane.com** | **SEND 55** | **HOLD 40** | **R-24** | Its own newsroom: *"Gets SOC 1 Type 2 Certified, Stays SOC 2 Type 2 Compliant Two Years In A Row"*, while `cert_status` read none. The headline defect |
| plivo.com | DROP 0 (R-23) | HOLD 0 | **R-24** | *"Plivo is SOC 2 certified. We're audited annually by an independent auditor."* |
| zluri.com | HOLD 30 (R-20) | HOLD 0 | **R-24** | *"Zluri complies with GDPR, NIST, SOC 2 Type II, PCI-DSS, ISO/IEC 27001, and ISO 27701."* |
| signzy.com | DROP 0 (R-23) | HOLD 0 | **R-24** | *"Signzy is ISO 27001, SOC 2 Type II, and PCI-DSS compliant."* |
| nected.ai | DROP 0 (R-23) | HOLD 0 | R-22 | Its `cert_status` had been settled by a HIPAA mention on `/use-cases/compliance-and-auditing-for-healthcare` — a marketing page being read as a trust page |
| whatfix.com | DROP 30 (R-02a) | DROP 0 (R-02a) | — | Same verdict, but S-02's 30 points are gone: its trust page names a certification |
| atlan.com | HOLD 10 | HOLD 10 | R-20 | unchanged |
| apty.io / zipy.ai | HOLD (R-04) | HOLD (R-04) | — | already certified, already migration play |

**The brief found this on one company. It was true of four.** `plivo`, `signzy` and `zluri` were
all being scored as uncertified while their own pages said, in plain first-person English, that
they are certified. Three of them were DROPs, so the error was invisible on the board — it only
showed up on Rocketlane because Rocketlane happened to score high enough to send.

### Acceptance (§6)

| # | criterion | result |
|---|---|---|
| 1 | rocketlane no longer reports `none` while quoting its SOC 2 announcement | **PASS** — `cert_status: null`, verdict HOLD, `rule_fired: R-24` |
| 2 | S-02 fires on strictly fewer companies, none whose trust page names a certification | **PASS** — 8 → 4 |
| 3 | Rocketlane's S-07 scores 0, reason naming the media-artifact test | **PASS, differently** — see below |
| 4 | S-01 diagnosis written down, with a code fix or a sample finding | **PASS** — §12, a sample finding |
| 5 | No draft pitches a certification the company already holds | **PASS** — checked by pattern across all 17 drafts, 0 violations |
| 6 | One status per send card | **PASS** — §4.1 |
| 7 | A fresh same-day live run with at least one Send | **FAIL** — see below |

**On #3.** Rocketlane's S-07 no longer appears at all, rather than appearing as ASSERTED. §2.2's
customer-language requirement rejects *"FinTech Interview with Srikrishnan Ganesan…"* at
detection, so it never reaches R-23 to be downgraded. Both routes score 0. The media-artifact
test itself is exercised by `tests/contradiction.test.ts`, which asserts that exact sentence
tiers `asserted` with the reason naming a publication artifact. The letter of the criterion
asked for a downgrade; what happened is that the quote stopped qualifying one step earlier.

**On #7 — no Send survives, and this is the honest result rather than an over-correction.**

The obvious fix was tried twice. Five companies were added across two rounds — `zenskar.com`,
`plumhq.com`, then `plotline.so`, `kula.ai`, `zipteams.com` — each chosen on ICP fit, named in
this log before being fetched, and kept whatever they scored. None sends. Three of the five have
no trust page at all (`cert_status` null → R-22), one is already certified, one hit R-24.

The reason is structural, and it is the same finding as §12 seen from the other side. A SEND
needs 50 points across two independent groups, and the certification group — S-01 at 40 and S-02
at 30 — is where almost all of that weight lives. Across 17 companies:

- **S-01 fires on nobody.** No company states a certification is under way (§12).
- **S-02 verifies on one.** Only `atlan.com` and `rocketlane.com` have a trust page naming no
  certification, and Rocketlane is held by R-24 anyway.
- **S-03 fires on nobody.** Careers pages were fetched for 15 of 17; security-role language
  appears on three, and all three are excluded for correct reasons — `apty.io` is already
  certified, `whatfix.com` is above 500 people, and Rocketlane's is not on a careers page.

So the sample is overwhelmingly **post**-certification. Nine of seventeen companies are either
recorded `certified` or caught by R-24 naming their own certification. That is a true fact about
established Indian B2B SaaS companies, and it is exactly the population Sprinto has *already
sold to* rather than the one it sells into.

What would produce a Send is a company that is genuinely mid-certification and says so, or one
with a bare trust page and an open GRC role. What would **not** be acceptable is reaching the
same number by lowering `SEND_THRESHOLD`, re-weighting the certification group, or dropping the
two-group independence test — each of which would have produced a Send this afternoon and would
have meant exactly the thing `FIX_PROMPT_V3.md` §0 was written to stop.

**The board went from one Send to none, and the one it lost was wrong.** Rocketlane has been SOC
2 compliant for two years. A system whose only Send was an offer to help a certified company get
certified was not doing better than a system that sends nothing.

---

## §9 · Gaps — every one, with the fix that was tried

A gap is only a gap after the obvious fix has been tried and has failed. Four were recorded at
freeze; **GAP-1 has since been closed** and is kept below with its evidence rather than deleted,
so the record shows what was missing and what fixed it. Three remain, and each says what was
attempted.

### GAP-1 · CLOSED on 19 Nov 2026 — a real email was sent

**Closed by taking the easier road, not the specified one.** The brief assumed Gmail OAuth. A
Resend key needs no consent screen, no OAuth playground and no Google Cloud navigation, and the
Resend transport was already in the chain as the disclosed fallback — so no code changed. Three
environment values were added to Vercel and the deployment was rebuilt:

```
RESEND_API_KEY   re_...                     (sending access only)
EMAIL_FROM       onboarding@resend.dev      (Resend's shared sender; no domain verified)
GMAIL_SEND_TO    aayushtopiwala3@gmail.com  (replaced demo@example.com)
```

`GMAIL_SEND_TO` had to change because Resend will not deliver to any address but the account
owner's until a domain is verified. That constraint was discovered without sending anything: a
probe to a third-party address returned `403` naming the permitted recipient.

**The send, with a recipient injection deliberately included in the body:**

```
POST /api/send
{"draftId":"dr_7435b42812b14babb3d8","to":"attacker@evil.com","recipient":"attacker@evil.com"}

{
  "ok": true,
  "to": "aayushtopiwala3@gmail.com",
  "transport": "resend",
  "messageId": "01a1f3c5-efc9-774b-ab3b-46627c0ffc39",
  "attempts": [
    { "transport": "gmail",  "ok": false,
      "error": "not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN)" },
    { "transport": "resend", "ok": true, "error": null }
  ],
  "ignored_body_fields": ["to", "recipient"]
}
```

**Three things are proven here that were not proven before.**

1. **A real email left the building.** Resend message id `01a1f3c5-efc9-774b-ab3b-46627c0ffc39`,
   delivered to the inbox.
2. **The chain order was observed in production**, not asserted by a test — Gmail attempted
   first, declined for a named reason, then Resend.
3. **T-13's recipient lock held against a live injection.** `attacker@evil.com` was supplied
   twice in the request body and appears in `ignored_body_fields`, never in `to`. This test
   normally *skips* once a transport is configured, precisely so `/selftest` does not send mail
   on every page load — so the lock had never been exercised against a real transport until now.

**The `sends` table, which is the artefact that survives this session:**

```
2026-11-14T04:40:16  dry_run  not_sent  demo@example.com           :: No mail transport is configured
2026-11-19T12:26:38  gmail    failed    aayushtopiwala3@gmail.com  :: not configured (GOOGLE_CLIENT_ID / ...)
2026-11-19T12:26:38  resend   sent      aayushtopiwala3@gmail.com
```

`/health` reads **Sent 1 · Dry-run 1 · Send failed 1**. The failed row is the Gmail attempt and
it is supposed to be there: §4.2 writes one row per transport *attempted*, because a disclosed
fallback that cannot say why the primary path went unused is not disclosed.

**What is still not proven, and will not be claimed.** G4 F5 asks for the fallback to fire on a
*dead token*. What fired here was a fallback on an *absent* one. The branch taken is the same
line of code, but the trigger is weaker, and a judge should know that. Gmail OAuth remains
unconfigured by choice: obtaining a refresh token means signing into a Google account, which is
out of bounds. The `dry_run` path is now unreachable in production (`dryRunAvailable()` is false
while a key is present, asserted in `tests/dryRun.test.ts`) and its historical row is kept.

### GAP-2 · G4 D3 cannot pass, and should not

`G4 §5 D3` expects the funding slider to move A4 from Hold to Send. It cannot at any weight —
R-20 requires two independent groups and a funding-only company has one. **The obvious fix was
tried and rejected on purpose:** making D3 pass means letting a press mention qualify a company,
which is exactly what A4 forbids in the same document. Recorded as a specification error.

What D3 was reaching for is demonstrated instead: the slider moves the score 10 → 45 and
re-ranks the board with zero fetches and zero model calls.

### GAP-3 · `FABRICATED` has never fired on a live run

`/health` reports `0 fabrications blocked`, and that zero is honest — every bad quote found so
far was real text that failed the *support* test, not invented text.

**What was tried:** the labelled fixture drill (§2 A.1), which executes the shipped tiering
functions and shows the tier firing. What cannot be manufactured is a real model hallucinating
on a real company on demand; waiting for one would mean shipping an unproven branch.

### GAP-4 · The F8 error banner needs JavaScript

`app/error.tsx` is a client boundary, so a server-render failure still returns an empty body to a
client that does not run JS. A judge in a browser sees the banner; `curl` sees a blank page.

**What was tried:** `app/error.tsx` plus `app/global-error.tsx` for layout-level failures. A
server-rendered static fallback would mean catching the error inside every page component rather
than at the boundary, which trades one correct failure mode for thirteen hand-written ones.

### Not a gap, recorded for completeness

- **F3 (Hunter 429) and F7 (cost ceiling) were not forced against live services.** Both would
  cost real credits or real money to observe, for assertions the code makes unconditionally and
  that are visible in `QUOTA_GUARD_RATIO = 0.8` and `AI_COST_CEILING_USD = 1.00`. Marked
  PASS (by construction) above rather than PASS, so the distinction is on the record.
- **R-52's promotion and R-54's block ran against the production database.** They are real state
  changes, not simulations: `everstage.com` is permanently blocked and will stay blocked.

