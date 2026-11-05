# G4 — Golden Test Set

> Build 2 · Sprinto — "Cold Outreach, at Scale"
> **Written before any code.** That is the whole point of this gate: if the expected
> outputs are written after the build, they describe what the code does, not what it
> should do.
> Gate rule: the build is not done when it runs — it is done when **every row below
> produces the expected outcome, including the rows where the expected outcome is a refusal.**

---

## 0. Two kinds of expectation, and why they are not the same

A row in this file asserts one of two things, and I keep them visibly separate because
only one of them can honestly be frozen before the first fetch.

**Structural expectations — asserted now, never change.** These depend only on my code:
a disallowed robots.txt quarantines, a dead domain quarantines, a duplicate collapses,
a 900-person company fails the fit gate, one signal cannot reach Send. I can assert these
before I write a line, and a unit test holds them forever.

**Signal expectations — predicted now, frozen after the first real fetch.** Whether
`rocketlane.com` actually says "SOC 2 in progress" on its trust page today is a fact
about the live web, not about my code. I write my prediction, run the fetch once, and then
**lock the observed value into the fixture.** From that moment the test asserts
*same input → same verdict* against the frozen HTML, not against the live site.

This matters for the viva: *"Did you tune the rules until the companies you liked passed?"*
No — the structural rows were asserted before the rules existed, and the signal rows are
asserted against frozen HTML so a site redesign cannot quietly change my score.

---

## 1. The happy path — 4 companies that should produce a sendable email

| # | Domain | Why it's in the set | Expected verdict | Expected rule trace | Expected PoC rank-1 | Expected email hook |
|---|---|---|---|---|---|---|
| H1 | `rocketlane.com` | Indian B2B SaaS, client-onboarding, Series A/B, enterprise logos out of proportion to headcount | **SEND** *(predicted)* | R-01 FIT pass · R-20 stack ≥ 50 · R-21 ≥ 2 independent signals | 51–200 ladder → Head of Security / GRC, else CTO | Must quote their own security/trust page verbatim |
| H2 | `zipy.ai` | Small Indian SaaS, ≤ 50 people, dev-tooling, handles session data → real compliance pressure | **SEND or HOLD** *(predicted)* | R-01 pass · R-20 depends on trust-page content | ≤ 50 ladder → CTO / co-founder (**not** a compliance person — there isn't one**)** | Quote from their security or privacy page |
| H3 | `nected.ai` | Seed-stage, rules-engine SaaS, likely *pre*-certification — the exact moment Sprinto wants | **SEND or HOLD** *(predicted)* | R-20: security page **without** a badge = 30 | ≤ 50 ladder → CTO / co-founder | "You publish a security page but no badge yet" |
| H4 | `springworks.in` | HR-tech SaaS, handles PII at scale, 51–200 band | **SEND or HOLD** *(predicted)* | R-20 stack; PII handling raises enterprise-pressure signal | 51–200 ladder | Quote their own data-handling language |

**What "expected" means for a happy row:** a named person with a real title, two pain points
**each carrying a verbatim quote with a live URL**, and a draft whose hook names a
company-specific fact that is one click from its source. A row that produces a generic
hook ("I saw you're growing fast") is a **failure of this test even if the email sends.**

---

## 2. The messy path — 5 inputs that must survive, not crash

| # | Input | What's messy | Expected behaviour | Visible to the judge as |
|---|---|---|---|---|
| M1 | `  HTTPS://Rocketlane.com/pricing?utm_source=x  ` | Leading/trailing space, caps, scheme, path, query string | Normalised to `rocketlane.com`, then **collapsed into H1 as a duplicate** | "1 duplicate removed" on the run header |
| M2 | `rocketlane.com` listed twice | Exact duplicate | One row, not two. **One Hunter credit, not two.** | Credit ledger shows 1 |
| M3 | A domain whose homepage is a JavaScript shell (< 200 words after clean) | Tier-1 plain fetch returns almost nothing | Auto-escalate to **tier 2 Jina Reader**; if that also fails → quarantine | Per-domain badge: `fetched via: reader` |
| M4 | A one-page site with no security page, no careers page, no pricing | Genuinely thin — not broken, just empty | Loop fires, exhausts the **4-fetch cap**, lands in **HOLD** with the missing field named | "Held: company stage not stated. 4/4 fetches used." |
| M5 | A domain where Hunter returns only generic emails (`info@`, `hello@`) | No named person exists in Hunter's index | Falls down the ladder → seeded set → **HOLD: PoC unavailable**. **Never addresses an email to `info@`.** | "source: seeded" or "Held: no named contact" |

**The rule M5 is really testing:** the system would rather hold than send to a mailbox
nobody reads. A tool that emails `info@` to keep its throughput up is the failure mode
on slide 32 wearing a suit.

---

## 3. The adversarial path — 6 inputs that must be *refused*, with a reason

These are the rows I most want a judge to run, because a pipeline that qualifies
everything looks identical to a good one until you hand it something that should fail.

| # | Input | What it attacks | Expected refusal | Expected reason shown |
|---|---|---|---|---|
| A1 | `zomato.com` | FIT gate — big consumer marketplace, not B2B SaaS | **DROP** | `R-01: not B2B SaaS` |
| A2 | `whatfix.com` | FIT gate — real B2B SaaS, but ~1,000 people | **DROP** | `R-01: headcount > 500 — has in-house GRC` |
| A3 | `apty.io` | The faculty's "already certified" rule **and** my disagreement with it | `strict_icp` **ON** → DROP `already certified`. `strict_icp` **OFF** → **HOLD, migration play**, ranked below all greenfield | Both verdicts reachable by one toggle, side by side |
| A4 | A company whose **only** signal is a funding round | R-21 — the two-independent-signals rule | **HOLD, not SEND** (10 points, one signal) | `R-21: only 1 independent signal (funding, 10 pts)` |
| A5 | A domain whose `robots.txt` disallows the paths we want | The legal/ethical boundary | **QUARANTINE before any fetch** | `robots_disallow` — and the run continues for everyone else |
| A6 | `sprinto-test-does-not-exist-9x.com` | Dead domain / DNS failure | **QUARANTINE**, other domains unaffected | `fetch_failed: DNS` |

**A4 is the single most important row in this file.** It is the difference between a
scoring system and a scoring *theatre*. One loud signal — a funding announcement — is a
press mention, not evidence of compliance pressure. If A4 ever returns SEND, the weights
are wrong and the build has quietly become the thing I said I wouldn't build.

---

## 4. Fail-safe drills — break each dependency on purpose

Each of these is run by flipping a switch or pulling a key, **with a judge watching.**

| # | Break this | Expected behaviour | Expected on screen |
|---|---|---|---|
| F1 | Gemini returns invalid JSON | 1 retry with the error → OpenRouter transport → **rules-only mode** | Orange `rules-only` badge; **verdict still produced** |
| F2 | Gemini key removed entirely | Rules-only mode for the whole run | Banner: "Running without AI — qualification is rule-based" |
| F3 | Hunter returns 429 (quota) | Cache → seeded set → HOLD | Quota meter red; `source: seeded` on every PoC |
| F4 | Hunter quota at 80% | **Hard stop before the call**, not after | "Quota guard: 40/50 credits used, PoC lookup paused" |
| F5 | Gmail token expired / revoked | **Fall back to Resend**, send anyway, say which transport was used | Card shows `sent via: resend (gmail token expired)` |
| F6 | Gmail *and* Resend both down | Fail loudly. Draft persists. | Red card, status `send_failed`, reason in plain words |
| F7 | `AI_COST_CEILING_USD` hit mid-run | Stop cleanly, keep completed rows | "Cost ceiling reached after 7 of 12 domains" |
| F8 | Neon connection drops | Run fails visibly, nothing half-written | Error banner, not a blank screen |

**F5 is new since G2.** Gmail stays primary because the brief asks for Gmail, and the
transport is named on every card — so the fallback is a disclosed behaviour, not a dodge.

---

## 5. Determinism and consistency checks

| # | Check | Method | Pass condition |
|---|---|---|---|
| D1 | Same input → same verdict | Run the frozen fixture set twice | **Byte-identical** verdicts, scores and rule IDs |
| D2 | Rules engine unit tests | Vitest over each rule in isolation | Every rule R-01…R-21 has a pass case **and** a fail case |
| D3 | Weight sliders re-rank live | Move "funding" from 10 → 45 | A4 moves from HOLD to SEND **and the trace says why** |
| D4 | `strict_icp` toggle | ON then OFF on A3 | Verdict flips, both are explained |
| D5 | Evidence validator | Force a hook with no quote | Draft is **blocked**, not sent. "Held: hook has no source" |
| D6 | Feedback loop | Reject H1 with a reason, re-run | H1 suppressed/down-ranked; "what changed" panel names the reason |
| D7 | Zero empty sections | Click every page with sample data loaded | No empty state anywhere on a judge path |

**D3 is the honest version of "customisation".** A slider that changes the colour of a
chart is decoration. A slider that visibly moves a company from Hold to Send, and shows
the recalculated trace, is the user disagreeing with my judgement and winning.

---

## 6. The judge's 2-minute path — what I will actually hand them

1. Open the link **in incognito**. No login appears.
2. Click **Load sample data** — 12 domains appear, including the ones designed to fail.
3. Run. Watch rows resolve one at a time (one domain per request — Vercel's 10 s limit).
4. **Look at Drop first, not Send.** Read `R-01: headcount > 500`. The tool argues its refusals.
5. Open a Send card. Click the hook's source link — it opens the company's own page, at the sentence quoted.
6. Flip `strict_icp`. Watch `apty.io` move from Drop to the migration play.
7. Drag the funding weight to 45. Watch A4 move to Send, with a trace that says why.
8. Click **Approve & send**. The email arrives in my inbox — `to:` is locked in code and the lock is on screen.
9. Reject a card with a reason. Re-run. The "what changed because of your feedback" panel names it.

**Anything a judge can reach that I have not listed here is a surface I have not tested.**
That is the point of writing the path down before the build rather than after it.

---

## 7. What this test set deliberately does not cover

| Not tested | Why not | What I'd say if asked |
|---|---|---|
| More than 20 domains in one run | Vercel Hobby timeouts and Hunter's 50-credit month make a 100-domain run a lie, not a feature | "The constraint is real. I'd rather demo 12 that work than claim 100 that don't." |
| Email reply handling | Out of scope — the brief ends at send | "That's the next build, and it needs a different human in a different place." |
| LinkedIn as a source | *hiQ v. LinkedIn* is about public data; LinkedIn's ToS and auth wall are a separate problem I chose not to walk into | "The company's own pages are the primary source. I cite that as a choice, not a limitation." |
| Deliverability / spam scoring | We send to one hardcoded inbox, so deliverability is untestable here by design | "Testing deliverability against my own inbox would be a meaningless green tick." |
