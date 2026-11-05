# Build 2 · Sprinto — G0 (Nine Checks) + G1 (Problem Teardown)

> MESA PGP Cohort 4 · Term 2 · AI Case 2 — "Cold Outreach, at Scale"
> Run against `3_MRS_Playbook.md` gates. Deadline Fri 6 Nov 2026, 11:59 pm IST. Target submit 10 pm IST.
> Practice rubric: Components Map 8 · Link opens 4 · Build quality 8 · Design 4 · Viva 16 = 40.

---

## G0 — The Nine Checks, run on three candidate automations

The folder contains one brief. Rather than rubber-stamp it, we defined the three things we
*could* automate inside the Sprinto outbound workflow and ran all nine checks on each. This
reproduces the Option A / B / C exercise the lecture refers to on slide 36, and it gives us two
defended nos — which is what Mesa says it marks ("We are not looking for the right answer. We
are looking for a defended one.").

### The three candidates

| | Option | What it does | What the Growth Lead still does |
|---|---|---|---|
| **A** | **ICP Scorer** | Scrape + extract + qualify. Outputs a ranked list of fit scores with reasons. Stops there. | Finds the PoC. Writes every email. Sends. |
| **B** | **Research-to-Draft** (the brief) | All 7 steps: scrape → extract → qualify with agent loop → find PoC → pain points → draft email → send to *own* inbox. | Reviews the draft, approves, sends to the real prospect. |
| **C** | **Autonomous Outbound** | All 7 steps, but step 7 sends to the **real prospect** with no human in between. | Nothing. Reads replies. |

### The scorecard

| # | Check | Group | **A · ICP Scorer** | **B · Research-to-Draft** | **C · Autonomous** |
|---|---|---|---|---|---|
| 01 | Problem real? | Kill switch | **Yes** | **Yes** | **Yes** |
| 02 | Workflow repeated? | Kill switch | **Yes** | **Yes** | **Yes** |
| 03 | Input available? | Kill switch | **Yes** | **Yes** | **Yes** |
| 04 | Output valuable? | Sizing | **Partial** | **Yes** | **Yes** |
| 05 | Impact measurable? | Sizing | **Partial** | **Yes** | **Yes** |
| 06 | ROI worth it? | Sizing | **No** | **Yes** | **Yes** |
| 07 | Failure risk OK? | Boundary | **Yes** | **Partial** | **No** |
| 08 | Judgment protected? | Boundary | **Yes** | **Partial** | **No** |
| 09 | Owner clear? | Boundary | **Yes** | **Yes** | **Partial** |
| | **Verdict** | | **Rejected** — too small | **BUILD THIS** | **Reshaped into B** |

**The gate rule** (playbook §9): build only when all nine are Yes or Partial, every Partial names
its gap *and* the visible feature that mitigates it. Option B is the only candidate that clears it.

Note for the viva: Mesa's own answer sheet (slide 35) also marks checks 07 and 08 as **Partial**,
not Yes. A build where every single check is a clean Yes would mean we had removed the human from
a decision that needs one. The Partials are the design, not a weakness.

---

### Option A · ICP Scorer — rejected by Sizing

| # | Check | Answer | Evidence | Why it fails / what it would take |
|---|---|---|---|---|
| 01 | Problem real? | Yes | Brief: *"15-20 minutes per company"*, *"8–15 companies a week"* | — |
| 02 | Workflow repeated? | Yes | *"Same research process, every week, for every new prospect"* (slide 35) | — |
| 03 | Input available? | Yes | Company websites are public | — |
| 04 | Output valuable? | **Partial** | Produces a ranked list with scores | A list is not a decision. This is the exact MRS 2 faculty note: *"The app only collates… Implication or helping the founder make a decision is missing."* |
| 05 | Impact measurable? | **Partial** | Saves the research slice only | Qualification is maybe 5 of the 17.5 minutes. ~71% of the time untouched. |
| 06 | ROI worth it? | **No** | Brief: *"quality drops toward the end of the list - not because the companies are worse fits, but because the person writing the emails is tired"* | The stated root cause is **fatigue in writing**. Option A does not touch writing. It optimises the part that wasn't the bottleneck. |
| 07–09 | Boundary | Yes ×3 | Human does everything downstream | Safe, because it does almost nothing. |

**Why we rejected it:** Sizing normally says "any No means build something smaller." Option A is the
inversion — it fails 06 by being *too small*. It solves the symptom the brief explicitly tells us is
not the cause. Rejecting it is the first defended no.

---

### Option C · Autonomous Outbound — reshaped, not rejected

| # | Check | Answer | Evidence | What the No forces |
|---|---|---|---|---|
| 01–03 | Kill switches | Yes ×3 | Same as B | — |
| 04 | Output valuable? | Yes | Email reaches a real prospect — highest theoretical value | — |
| 05 | Impact measurable? | Yes | Reply rate, meetings booked | — |
| 06 | ROI worth it? | Yes | Zero human minutes per company | — |
| 07 | Failure risk OK? | **No** | A fabricated hook ("saw you're hiring a Compliance Manager" when they aren't) goes to a real CISO. Public, irreversible, damages Sprinto's domain reputation and sender score. Lecture slide 16: scraping personal data without consent *"falls under GDPR, DPDP (India)… The exposure is real."* | **Put a human exactly here.** Review-before-send gate. |
| 08 | Judgment protected? | **No** | "Is this hook true, and is it creepy?" is judgment. Knowledge file: *"Fabricated looks identical to real."* Model confidence is not evidence. | **Put a human exactly here.** Approve / Edit / Reject with a reason. |
| 09 | Owner clear? | **Partial** | Growth Lead owns the outcome but learns about a bad send only after the prospect replies | Owner must see it *before* it leaves. |

**This is where The Cut comes from.** The Boundary rule says a No means put a human exactly at
that step — and when you put a human at steps 7 and 8 of Option C, Option C *becomes* Option B.
Option B is not a compromise we settled for. It is Option C with the two checks applied.

> Mesa's own framing, slide 35: *"The designed limit of this build is that no email goes to a real
> prospect without human review. The system handles research and drafting. The Growth Lead handles send."*

---

### Option B · Research-to-Draft — the build

| # | Check | Answer | Evidence (quote) | If Partial: the gap + mitigation | Where it shows in the app |
|---|---|---|---|---|---|
| 01 | Problem real? | **Yes** | *"takes 15-20 minutes per company. At 8–15 companies a week, quality drops toward the end of the list"* → ~3.5 h/week of a Growth Lead | — | `/why` page + README, with the baseline maths |
| 02 | Workflow repeated? | **Yes** | Weekly cadence, identical steps per prospect: research → find person → write → send | — | Runs/History page; each run stamped and replayable |
| 03 | Input available? | **Yes** | Company websites are public. Contact data via Hunter.io Domain Search API (free tier, 25/month). | *Watch-out, not a gap:* robots.txt and ToS must be checked per domain; ~20% of sites sit behind Cloudflare (slide 21) | Sources & Health page: per-domain fetch method, robots.txt verdict, failure reason, "considered, not used" list |
| 04 | Output valuable? | **Yes** | Slide 35: *"A qualified lead with a drafted email is directly actionable."* | We go further than the slide: the output is a **verdict** (Send / Hold / Drop), not a list | Decision layer — "Do this now", top 3 companies, each with verdict + reason + one-click action |
| 05 | Impact measurable? | **Yes** | Slide 37 targets: time per company < 2 min; rewrites < 20%; PoC accuracy ≥ 60% | — | Impact panel: minutes saved this run vs the 17.5-min baseline, rewrite rate from real feedback, PoC accept rate |
| 06 | ROI worth it? | **Yes** | 12 companies/wk × 17.5 min = **3.5 h/wk**. At < 2 min each = 0.4 h/wk. **~3.1 h/wk ≈ 160 h/year saved.** AI cost ≈ ₹0.2–0.5 per company (cleaned text into Gemini Flash) → under ₹30/month | — | Cost ledger: tokens + ₹ per run, per-run ceiling, cache-hit counter; ROI line with an editable hourly-rate input |
| 07 | Failure risk OK? | **Partial** | Slide 35: *"sends to your own inbox only — no real-world risk in this build. PoC data may be stale."* Scraped signal can be wrong or absent. | **Gap:** a wrong qualification or an invented hook. **Mitigation:** every claim carries a source URL + verbatim quote or the words "not stated"; confidence per field; hard `to:` lock to own inbox; empty-output guard; quarantine for failed fetches with a named reason | Evidence panel on every claim; `to:` address shown locked in the UI; Quarantine tab; `/selftest` |
| 08 | Judgment protected? | **Partial** | Slide 35: *"You set the ICP criteria. The model applies them. Growth Lead reviews before any real send."* | **Gap:** the model picks the PoC and writes the hook. **Mitigation:** ICP weights are human-set and editable; AI output is visually labelled as a suggestion; Approve / Edit / Reject with a reason on every draft; alternate PoC always offered | Approve-Edit-Reject bar; "AI suggestion" label; feedback loop that re-ranks the next run |
| 09 | Owner clear? | **Yes** | Slide 35: *"The Growth Lead owns the output and the decision to send."* | — | Owner named on every decision; audit log of who approved what, when, and why |

**Checks 07, 08 and 09 are the spec for the fail-safe and feedback layers.** Every Boundary answer
above has a named feature. If a feature disappears from the build, the check is no longer answered.

---

## G1 — Problem teardown

### 1. Constraint sheet (hard requirements, quoted)

| # | Constraint | Source | Non-negotiable because |
|---|---|---|---|
| C1 | Exactly **7 steps**: scrape → extract → qualify → find PoC → pain points → draft → send | Brief, "What you're building" | The map and the build are graded against this shape |
| C2 | Step 3 qualification must use an **agent loop** — *"to fetch more information when the initial data is insufficient"* | Brief | This is the graded centrepiece of L4. A fixed pipeline fails the lecture's own test (slide 27) |
| C3 | Step 7 sends **via Gmail**, with **`to:` hardcoded to my own email address** | Brief | Explicit. Resend is not a substitute here |
| C4 | Step 4 PoC via **Hunter.io Domain Search API** (free tier, 25 searches/month) — chosen over the Apollo manual route | Brief, Option A | Manual hardcoding leaves a human-shaped hole in the pipeline |
| C5 | *"'Right companies' is **your definition to arrive at**, through research"* — and slide 26: *"That is the first decision you will defend"* | Brief + slide 26 | The ICP definition is itself graded. It must be written down, sourced, and editable |
| C6 | *"The system must be **repeatable**: run it on a list of domains and it should work end-to-end without you making decisions at each step"* | Brief | One input (domain list) → full output. No per-step prompts |
| C7 | Done = *"a personalised cold email lands in your inbox, addressed to a real person **by name**, with a hook a human would actually respond to"* | Brief | The demo must show a real inbox |
| C8 | Done = *"You can defend **every** decision the system made: why this company qualified, why this person, why the email was written this way"* | Brief | Every output needs a why-panel. This is 3 of the Q bank's 10 questions |
| C9 | Deliverables: **Components Map** + **working Vercel link** | Assignment | Map 8 + Link 4 = the marks most under our control |
| C10 | Deadline **Fri 6 Nov 2026, 11:59 pm IST**; personal target **10 pm IST** | Assignment | Freeze (G8) at 9 pm IST |

**Not constrained (our choice, to be defended):** the model. Unlike MRS 2, this brief names no
required provider; slide 38 says only *"AI Models (e.g. Gemini, Claude)"*. We pin **Gemini Flash**
and show the resolved model id in the footer — cheapest per slide 15, consistent with the toolkit,
and the pin + runtime guard costs nothing to carry.

### 2. The failure mode this build is designed against

Slide 32, verbatim, because it is the whole grading frame:

> *"A pipeline that runs without judgment - qualifying every company, sending every email, finding
> the nearest person with 'manager' in their title. The output looks like activity. It is not."*
>
> *"If Sprinto's Growth Lead would redo your pipeline's work before using it, you have not solved
> the problem. You have added a step."*

Two design consequences we will be held to:
- **The pipeline must visibly disqualify companies.** A run where every domain qualifies is a failed
  run, not a good one. We will seed domains that *should* be dropped, and show them being dropped.
- **The PoC must be argued, not nearest-match.** We rank roles against a written seniority ladder
  and always show the runner-up with the reason it lost.

### 3. The three decisions the Growth Lead makes each run

| # | Decision | What the app gives her | What she'd do without it |
|---|---|---|---|
| 1 | **Which of these domains deserve my time today, and in what order?** | Verdict per company: **Send now / Hold (needs X) / Drop (because Y)**, ranked, each with the rule that fired and the quoted evidence | Open 12 tabs, skim each homepage, guess |
| 2 | **Is this the right door into this company?** | Named PoC with role, seniority rank, confidence, source — plus the runner-up and why it lost | Search LinkedIn, guess at titles |
| 3 | **Do I send this email as written, edit the hook, or kill it?** | Draft with the hook traced to a verbatim quote and a live URL; Approve / Edit / Reject with a reason | Write it from scratch at 5 pm, tired |

**The one-sentence test (G1 exit):**
> *Because of this app, the Growth Lead opens Monday with 12 domains already triaged into send / hold /
> drop — each with a named person, a hook quoted from that company's own page, and a draft she can
> approve in under two minutes — instead of 3.5 hours of research and a batch of emails that get
> worse after number eight.*

### 4. The Cut — what we deliberately will not build

| Cut | Why | What we'd need to change our mind |
|---|---|---|
| **No sending to real prospects.** `to:` is locked to my own inbox in code, and the lock is visible in the UI | Forced by checks 07 and 08. Mesa's own designed limit | A verified sending domain, a suppression list, and a human approval step that logs consent |
| **No LinkedIn scraping** | Login wall + ToS. *hiQ v. LinkedIn*: hiQ won the public-data argument and still paid $500,000, took a permanent injunction, and was ordered to delete its code — *"punished for an agreement they clicked through"* (slide 17) | Nothing. This stays cut |
| **No crawler.** Single-fetch plus a fixed, named allow-list of sub-pages (`/careers`, `/security`, `/trust`, `/pricing`, `/about`, `/customers`), capped at 4 extra fetches | Slide 14: single-fetch is *"the narrowest scope, the lowest cost, and the lowest legal exposure."* A crawler multiplies both the bill and the exposure | Explicit permission + a budget |
| **No fight with Cloudflare.** A blocked domain is recorded with the reason and skipped | Slide 22 step 6: *"Stop."* Beating bot detection is *"a continuous arms race"* | A paid unblocking service, which we'd have to justify |
| **No CRM write-back, no follow-up sequences, no scheduler** | Pocus-adjacent plumbing (slide 42: *"Landing in a CRM is plumbing"*). None of it changes a decision the Growth Lead makes this week | A real HubSpot instance and a reason beyond "it would look complete" |
| **No paid data enrichment beyond Hunter free tier** | ROI: the free tier covers 25 domains/month against a real load of ~48/month. We cache instead | Budget sign-off and a measured PoC accuracy lift |

### 5. What stays human, and what happens when the tool is wrong

| Stays human | Why | Caught how |
|---|---|---|
| The **send** decision | Check 07/08 | Nothing leaves without Approve. Draft state is the default |
| The **ICP definition and weights** | C5 — this is the decision we must defend, so it can't be learned silently | Editable sliders, versioned, with "why the order changed" |
| The **hook**, if it's wrong | Fabrication is invisible (knowledge file) | Every hook shows its source quote + URL. No quote → the email is held, not sent |

**When it's wrong:** a wrong *qualify* costs two minutes of the Growth Lead's reading. A wrong *drop*
is the expensive one — a good company silently never contacted — so drops are never hidden: they
appear in their own tab with the rule that killed them and a one-click "override, qualify anyway".
A wrong *PoC* is caught by the runner-up being shown alongside. A *fabricated* hook cannot ship,
because an unquoted hook fails validation before it reaches the draft.

### 6. The assumption that most needs testing

> **That a company's own public pages carry enough signal to separate "preparing for a compliance
> audit" from "not there yet."**

Mesa asserts the careers page is rung one (slide 40: *"it answers headcount, seniority and often
funding in a single request"*). That is plausible, not proven. If it's wrong, the qualification is a
coin flip wearing a confidence score — the exact thing slide 27 warns about.

**How we test it:** the agent loop logs, per company, which fetch produced the deciding fact. After
the run we report the hit rate — *"the careers page settled stage in N of M companies"* — on the
Health page. A low hit rate is reported, not hidden, and it is the honest answer to "what would you
build next."

---

## Rubric map — where the effort goes

| Component | Max | MRS 2 | Target | What earns it here |
|---|---|---|---|---|
| Components Map | 8 | 6 | 7.5 | Mesa's own swimlane format (slide 38), regenerated from the final code, every box carrying a failure mode and fallback |
| Link opens | 4 | 4 | 4 | Incognito, mobile, cold start, no login, no quota that can expire before the deadline |
| Build quality | 8 | 3.2 | 7 | The agent loop visibly firing; companies visibly dropped; `/selftest` green; no empty sections |
| Design | 4 | 2.4 | 3.5 | Decision first, evidence second, raw data third. Controls on every list |
| Viva (practice) | 16 | 7.2 | 13 | The two defended nos above; agent-loop narration; feedback loop closed; map narrated in 90 s |
| **Total** | **40** | **22.8** | **35** | |

---

## Open question carried into G2

Hunter.io's free tier is **25 searches/month** against a real weekly load of 8–15 companies. The cap
is not a detail — it is the component most likely to break the judge's demo. G2 must answer it with a
cache, a seeded fallback, and a visible quota meter, or the Link mark is at risk.
