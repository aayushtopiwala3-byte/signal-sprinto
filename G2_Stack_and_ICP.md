# G2 — Stack Sheet, Researched ICP, and the Evidence Map

> Build 2 · Sprinto — "Cold Outreach, at Scale"
> Gate rule (playbook §G2): **no component without a fallback.**

---

## Part 1 — The ICP, arrived at through research

The brief says *"'Right companies' is **your definition to arrive at**, through research"* and slide 26
sharpens it: *"That is the first decision you will defend."* So we researched Sprinto's actual
customers rather than restating the brief's sentence back at them.

### What the evidence says

| Finding | Evidence | Source |
|---|---|---|
| Sprinto's own stated span | *"Trusted by 4,000+ companies from Series A to enterprise"* | [sprinto.com](https://sprinto.com/) |
| Real customer firmographics | Apty **51–200** employees; NitroPack **11–50**; Zipy **11–50** — Sprinto publishes Industry / Employees / Region on every case study | [apty](https://sprinto.com/customers/apty/) · [nitropack](https://sprinto.com/customers/nitropack/) · [zipy](https://sprinto.com/customers/zipy/) |
| Independent firmographics (704 detected customers) | Most common industry **Software Development 41%**; most common size **11–50 employees (44%)**. Funding-stage over-index: **Series B 86.0×, Series A 56.5×, Seed 44.3×** | [bloomberry](https://bloomberry.com/data/sprinto/) |
| Reviewer segment mix | **SMB (≤50) 57.1% · Mid-market 41.8% · Enterprise 1.1%** | [G2](https://www.g2.com/compare/sprinto-inc-vs-vanta) |
| Deal size implies a founder-signs purchase | No published list price — both tiers say "Contact sales". Third-party estimates $4–8K/yr small teams, up to $25K | [sprinto.com/pricing](https://sprinto.com/pricing/) · [brightdefense](https://www.brightdefense.com/resources/drata-vs-sprinto/) |
| Enterprise is a *disqualifier*, not an upsell | Reviews report Sprinto lacks depth for complex approval workflows, multi-entity risk models, SAP/Workday integration. Corroborated by the 1.1% enterprise share | [uprootsecurity](https://www.uprootsecurity.com/blog/sprinto-review) |

### Our ICP definition (and where it departs from the brief)

> **A cloud-native B2B SaaS company, 11–200 employees, Seed to Series B, whose own public pages show
> at least two independent signs of compliance pressure — and which does not already have an
> in-house GRC function.**

| Dimension | Our definition | The brief said | Why we changed it |
|---|---|---|---|
| Stage | **Seed → Series B** core; Series C fading edge | "typically Series A–C" | Seed over-indexes 44.3× in the real customer base. The brief's floor is too high and its ceiling too generous |
| Headcount | **11–200**; 201–500 downranked; **>500 drop** | not stated | 44% of customers are 11–50. Above ~500 they have a GRC team and Sprinto lacks the depth |
| Trigger | **≥2 stacked signals** required | "preparing for an audit or under enterprise pressure" | Same intent, made checkable — see the stacking rule below |

### The three departures we will be asked about

**1. Funding alone is not a signal.** The GTM research is blunt: *"Money plus motion is a signal.
Money alone is a press mention"* ([avina signals library](https://www.avina.io/signals-library/urgent-security-and-compliance-hiring)).
Size, industry and title are **fit**, not **timing**. So funding carries low weight and can never
qualify a company on its own. Our rule requires a **stack** — a funding round *plus* motion.

**2. "Already certified" is NOT an automatic disqualifier — this contradicts the faculty Evidence
Map, and we have evidence.** Slide 40 says: *"Already a named certification? → YES — disqualify and
stop."* But Sprinto runs an active **migration motion**: Apty switched in from Vanta and Scrut
mid-programme ([source](https://sprinto.com/customers/apty/)), and Sprinto publishes a case study
titled *"How Journeybee migrated to Sprinto without losing momentum"*
([source](https://sprinto.com/customers/)). A certified company is a *different play*, not a dead lead.

> **How we handle the disagreement:** this is a **feature switch**, defaulting to our researched
> behaviour, with the faculty rule one click away.
> - `strict_icp = ON` → certification short-circuits to DROP (slide 40's rule, exactly)
> - `strict_icp = OFF` *(default)* → certification re-routes to the **migration play**: qualified at
>   lower rank, different email angle ("you've done the hard part once"), flagged
>
> Both are testable in the toggle matrix, and the switch makes the disagreement visible and
> defensible instead of looking like we misread the slide.

**3. The PoC ladder is headcount-conditional, because the compliance owner usually isn't in
compliance.** Apty's compliance owner was **Head of People and Culture**; Zipy's was an
**Engineering Lead** ([apty](https://sprinto.com/customers/apty/) · [zipy](https://sprinto.com/customers/zipy/)).
A ladder that only ranks GRC titles mis-picks on exactly our core segment — and "finding the nearest
person with 'manager' in their title" is the named failure mode on slide 32.

| Company size | Rank 1 | Rank 2 | Rank 3 | Reasoning |
|---|---|---|---|---|
| ≤ 50 employees | CTO / Co-founder / Head of Engineering | Head of People / Ops | VP Sales *(feels the blocked deals)* | There is no compliance person. The founder signs a $5–10K line item |
| 51–200 | Head of Security / GRC / Compliance | CTO / VP Engineering | Head of People / COO | Big enough to have hired for it — if they have, that person is the buyer |
| > 200 | *n/a — dropped on fit* | | | |

Every PoC card shows the **runner-up and why it lost**.

---

## Part 2 — The Evidence Map (slide 39 format, filled with our research)

This is what defines "enough" for the agent loop. Per slide 30: *"Have the model extract facts into
named fields. Check if these fields are filled **in code**, not by asking the model."*

**The judgment being made:** *Can I decide whether this company fits Sprinto's ICP, and is it buying now?*

| The question | Fact that settles it | Where it lives | Sufficient when (code-checkable) | Limit | If unanswered | Short-circuit |
|---|---|---|---|---|---|---|
| **Is it B2B SaaS?** | A product description naming a business buyer | homepage hero · `/product` · `/about` | `is_b2b_saas` ∈ {true,false} **and** `buyer_description` is non-empty | 1 | `manual_review` | **NO → DROP and stop** |
| **Already certified?** | A named certification string | `/security` · `/trust` · footer | `certifications[]` contains any of SOC 2 / ISO 27001 / HIPAA / GDPR-audited | 1 | treat as not certified, flag | **YES → migration play** (DROP only if `strict_icp` ON) |
| **Right size & stage?** | Headcount band, funding stage, enterprise tier, open-role count | `/careers` · `/pricing` · `/customers` | any one of: `funding_stage` named · `open_roles ≥ 5` · `has_enterprise_tier = true` · `headcount_band` set | 2 | qualify at lower rank, flagged | **>500 employees → DROP and stop** |
| **Is there compliance pressure?** | A named trigger, quoted verbatim | `/security` · `/customers` · `/careers` | ≥1 of: `soc2_in_progress` · `security_page_without_badge` · `compliance_hire` · `enterprise_logos ≥ 3` | 2 | **HOLD**, never DROP | — |

**Worst case: 4 fetches beyond the homepage.** Defined before the build begins (slide 31).
**At the cap, the answer is not "try harder" — it is a graceful handoff:** verdict becomes
**HOLD**, with `needs: [the unfilled fields]` shown to the Growth Lead.

**The final question (slide 39):** *two of three answered, one unknown — qualify, drop, or
qualify-and-flag?* → **Qualify and flag, at a lower rank, with the unknown named on the card.**
Rationale: a wrong DROP is the expensive error — a good company silently never contacted. A wrong
QUALIFY costs two minutes of reading. We bias toward the cheap mistake and make it visible.

### The signal-stacking rule (R-20)

| Signal | Weight | Why | Source |
|---|---|---|---|
| "SOC 2 / ISO in progress" language on site | **40** | Strongest. Zipy: *"as soon as we started saying we are undergoing SOC2 audit… interest go up"* | [zipy](https://sprinto.com/customers/zipy/) |
| Security/trust page exists but no badge | **30** | NitroPack: *"practices were in place but informal… no completed audit… made winning larger businesses harder"* | [nitropack](https://sprinto.com/customers/nitropack/) |
| First-ever compliance/GRC hire, or a posting naming a framework | **30** | Rated "Strong"; the predictive version names a framework or audit date | [avina](https://www.avina.io/signals-library/urgent-security-and-compliance-hiring) |
| Enterprise logos out of proportion to headcount | **25** | Apty: *"Large clients refused to partner without SOC 2, stalling deal closures"* | [apty](https://sprinto.com/customers/apty/) |
| Enterprise pricing tier present | **15** | Moving upmarket — medium-high | [communitytracker](https://www.communitytracker.ai/blog/list-of-b2b-buying-signals) |
| Recent funding round | **10** | *Deliberately low.* "Money alone is a press mention" | [avina](https://www.avina.io/signals-library/urgent-security-and-compliance-hiring) |

**R-21:** `SEND` requires timing ≥ 50 **from at least two independent signals**. A single 40-point
signal scores 40 and lands in `HOLD`. This is the rule that stops the pipeline qualifying everything.

---

## Part 3 — Stack sheet

| Component | Choice | Rejected alternative | Free-tier limit | Failure mode | **Fallback** |
|---|---|---|---|---|---|
| **App** | Next.js 15 App Router · TS · Tailwind · shadcn/ui | Streamlit (no control over decision-first layout), Replit (link fragility) | — | Build error | Vercel keeps the last good deployment live |
| **Hosting** | Vercel | Render (cold starts), Replit (sleeps — a sleeping link is a zero on Link 4) | Hobby: 10 s function timeout ⚠️ | Pipeline exceeds 10 s per company | **Per-company processing, not per-batch.** Each domain is its own request; the UI streams results. Never one long job |
| **Database** | Neon Postgres (`postgres.js`) | SQLite/in-memory — loses runs between deploys, and the feedback loop has nothing to learn from | 0.5 GB | Connection exhaustion on serverless | Pooled connection string + retry; read path degrades to last-good snapshot |
| **AI** | **Gemini Flash**, pinned in `lib/ai/model.ts` with a runtime guard, resolved id shown in the footer | Claude/GPT — no brief constraint, but Flash is cheapest per slide 15 and matches the toolkit | Generous free tier | 429 / malformed JSON | 1 retry with the error → **OpenRouter transport, same model** → **rules-only mode** (extraction degrades, qualification still runs on regex + keyword rules and says so) |
| **Scrape · tier 1** | Plain `fetch` + heuristic clean (drop nav/footer/<8-word blocks/dupes, cap ~2,000 tokens) | Model-based extraction on raw HTML — 15,000 tokens of cookie banners, slide 10 | — | Page is a JS shell | → tier 2 |
| **Scrape · tier 2** | **Jina Reader** (`r.jina.ai/<url>`) — renders JS server-side, returns model-ready text | Playwright/`@sparticuz/chromium` on Vercel — 250 MB bundle, cold starts, 10 s timeout | ~20 req/min unauthenticated | Rate limit or timeout | → tier 3 |
| **Scrape · tier 3** | **Stop.** Record `failure_reason` and continue | Paid unblocking service | — | — | Company shows in **Quarantine** with the named reason (`cloudflare` / `404` / `robots_disallow` / `thin_content` / `timeout`). Slide 22 step 6: *"Stop."* |
| **Scrape cache** | Postgres, keyed by `sha256(url)`, 7-day TTL | Re-fetching every run | — | — | Slide 15: *"A company researched last week should cost nothing this week."* Cache-hit counter shown on Health |
| **robots.txt** | Checked and cached per domain **before** any fetch; verdict stored and displayed | Ignoring it | — | robots.txt unreachable | Treat as **disallow** and quarantine. Slide 16: *"Reading it takes 30 seconds"* |
| **PoC** | **Hunter.io** Domain Search, `limit=5`, department-filtered | Apollo manual hardcode — leaves a human-shaped hole in step 4 | ⚠️ **See the correction below** | 429 quota exhausted | **3-layer:** cache by domain → seeded PoC set for the demo domains → `HOLD: PoC unavailable`. Quota meter on Health, read live from `/v2/account` |
| **Email** | **Gmail API** + OAuth2 refresh token, scope `gmail.send`, `to:` hardcoded. **OAuth client on a personal Gmail, not the school Workspace account** | Nodemailer + App Password — ⚠️ app passwords are often disabled on Workspace/school accounts; SMTP can't run on Edge and stalls on serverless | — | Token expiry / API error | **Resend as a disclosed fallback**, then fail loudly. Every card names its transport: `sent via: gmail` / `sent via: resend (gmail token expired)` / `send_failed` + reason in red. Core output (the decision + draft) survives a dead mailbox |
| **Validation** | Zod at every boundary; invalid rows **quarantined with a reason**, never dropped | Silent coercion | — | — | Quarantine tab |
| **Tests** | Vitest on rules + parsers; `/selftest` page runs the golden set live | Manual checking | — | — | Judge-visible green/red |

### Two corrections the research forced

**⚠️ Hunter's free tier is not "25 searches/month."** Hunter moved to a unified **credit** model:
the free plan is **~50 credits/month**, and Domain Search bills **1 credit per email returned**
([API docs](https://hunter.io/api-documentation) · [pricing FAQ](https://help.hunter.io/en/articles/11131690-pricing-plans-and-feature-faqs)).
A default `limit=10` would burn ~10 credits on a single domain — five domains and the demo is dead.

> **What we do:** `limit=5`, `department=executive,it,management`, cache every lookup by domain, read
> live quota from `GET /v2/account` and render it as a meter, **hard-stop at 80% consumed** and fall
> back to the seeded set. The field is `confidence` (0–100), not `score`; `position`/`seniority`/
> `department` are frequently `null`, so every read is defensive. Quota exhaustion returns **HTTP 429**
> — which also means "too many requests per second", so we branch on the `details` text, not blind backoff.

**⚠️ Gmail: a refresh token from an OAuth app in "Testing" expires after 7 days.** The app would
work tonight and be dead before anyone grades it
([OAuth2 docs](https://developers.google.com/identity/protocols/oauth2)).

> **What we do:** publish the OAuth consent screen to **In production** before the freeze (unverified
> is fine for a sensitive scope when we are the only user — we accept the warning screen once). Then
> a **G6 check specifically for this**: re-run a send from a cold deployment and confirm it lands.
> Also: `raw` must be **base64url** (`-`/`_`, no `=`) — base64 is the #1 silent Gmail failure.
> And the OAuth client lives on a **personal Gmail account**: Mesa's Workspace admin can block
> OAuth app creation or external publishing, and finding that out at 10 pm on submission night
> is not a risk worth taking for a tidier-looking sender address.

**Send transport: Gmail primary, Resend fallback, transport named on every card.**
The brief asks for Gmail, so Gmail stays primary and visible. But a dead token at grading time
would mean a judge never sees an email actually leave the system — so if Gmail fails, the send
retries through Resend (already in the toolkit, no expiring token) and **the card says which
transport carried it.** A fallback a judge can see is a disclosed design decision; a silent one
would be the thing this whole build argues against.

### Cost model

| Item | Per company | 12 companies/week |
|---|---|---|
| Fetch (plain) | ~₹0 | ₹0 |
| Jina Reader (only when tier 1 is thin) | ~₹0 | ₹0 |
| Gemini Flash — ~4 calls, ~2,000 cleaned tokens in | **₹0.2–0.5** | **₹3–6/week** |
| Hunter | 1–5 credits, cached | within free tier |
| **Total** | | **under ₹30/month** against ~3.1 h/week of Growth Lead time |

Per-run ceiling enforced via `AI_COST_CEILING_USD`; every call logged to a cost ledger with tokens,
₹ and cache-hit status.

### Environment variables (names only)

`DATABASE_URL` · `GEMINI_API_KEY` · `OPENROUTER_API_KEY` · `HUNTER_API_KEY` ·
`GOOGLE_CLIENT_ID` · `GOOGLE_CLIENT_SECRET` · `GOOGLE_REFRESH_TOKEN` · `GMAIL_SEND_TO` ·
`RESEND_API_KEY` · `EMAIL_FROM` ·
`NEXT_PUBLIC_SITE_URL` · `AI_COST_CEILING_USD` · `CRON_SECRET`

`.env.example` carries names only. Startup fails with a clear message if a required variable is missing.

---

## Part 4 — Sources breadth (playbook §5)

Three independent source types, each earning its place:

| Source | What it adds that the others don't | Failure mode | Fallback |
|---|---|---|---|
| **Company's own pages** (homepage, /security, /careers, /pricing, /customers) | The buying signal in the company's own prose — slide 5: *"The buying signal is in the company's own prose"* | Cloudflare, JS shell, redesign | Jina Reader → quarantine with reason |
| **Hunter.io Domain Search** | A real named human with a verified email — nothing on the website gives this | Quota, stale contacts | Cache → seeded set → HOLD |
| **robots.txt + certification registries** (certification strings on /trust pages) | Permission to proceed, and the one fact that flips the entire play (certified → migration) | Unreachable | Treat as disallow; absent cert → "not stated", never assumed |

**Considered, not used — because:**

| Source | Why not |
|---|---|
| **LinkedIn** (company size, people, job posts) | Login wall + ToS. *hiQ v. LinkedIn*: won the public-data argument, still paid **$500,000**, took a permanent injunction and was ordered to delete its code and data — *"punished for an agreement they clicked through"* (slide 17) |
| **Crunchbase** | Funding data is the product; no meaningful free API. And funding is our lowest-weight signal anyway, so the cost buys little |
| **Apollo.io** | Free tier is web-UI only. Using it means hardcoding the PoC by hand — a human-shaped hole in a pipeline that is supposed to be repeatable (C6) |
| **Clearbit / ZoomInfo** | Paid. Slide 11 is right that these are cleaning-and-structuring companies, but there is no free tier to defend a spend against |
| **Google/Bing search API** | Would broaden signal, but paid, and it moves us from single-fetch toward crawling — more legal exposure for a marginal gain (slide 14) |
| **Job boards** (Greenhouse/Lever boards) | **Honest admission: this is the best thing we left on the table.** It would sharpen the compliance-hire signal considerably. Cut for time, named here, and it is the top item in "what I'd build next" |
