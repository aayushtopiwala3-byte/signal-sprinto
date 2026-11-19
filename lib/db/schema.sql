-- Signal schema (§8). Idempotent: safe to run repeatedly against Neon or PGlite.
-- The four Evidence Map fields are nullable columns on `companies` so that emptiness is a
-- database fact rather than a model opinion, each paired with a `*_evidence_json` column.

CREATE TABLE IF NOT EXISTS runs (
  id                 TEXT PRIMARY KEY,
  started_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at        TIMESTAMPTZ,
  weights_json       TEXT NOT NULL,
  switches_json      TEXT NOT NULL,
  domains_submitted  INTEGER NOT NULL DEFAULT 0,
  duplicates_removed INTEGER NOT NULL DEFAULT 0,
  status             TEXT NOT NULL DEFAULT 'running'
);

CREATE TABLE IF NOT EXISTS companies (
  id                        TEXT PRIMARY KEY,
  run_id                    TEXT NOT NULL,
  domain                    TEXT NOT NULL,
  normalized_domain         TEXT NOT NULL,
  status                    TEXT NOT NULL DEFAULT 'pending',
  stage                     TEXT NOT NULL DEFAULT 'queued',
  is_b2b_saas               BOOLEAN,
  is_b2b_saas_evidence_json TEXT,
  cert_status               TEXT,
  cert_status_evidence_json TEXT,
  size_band                 TEXT,
  size_band_evidence_json   TEXT,
  pressure_signals_json     TEXT,
  is_services               BOOLEAN,
  verdict                   TEXT,
  timing_score              INTEGER,
  independent_signals       INTEGER,
  play                      TEXT,
  verdict_reason            TEXT,
  rule_fired                TEXT,
  fetches_used              INTEGER NOT NULL DEFAULT 0,
  missing_fields_json       TEXT,
  error                     TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- When a serverless invocation dies mid-company — Vercel killed one on a slow site — the row
-- is left at status 'running' and nothing reclaims it, so the board spins on it forever.
-- `claimed_at` is what lets a later request tell "in progress" from "abandoned".
-- Added by ALTER rather than in the CREATE above so databases created before this still get it.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;
-- Reclaiming alone would retry a domain that always outlasts the handler forever, which is the
-- same stuck board by a slower route. Counting claims lets the run give up and say why.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
-- A headcount band that was counted from job listings and one a company printed about itself are
-- not the same claim, and R-02 drops a company on either. Storing which one it was keeps the
-- difference visible on the card instead of collapsing both into a bare band.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS size_source TEXT;
-- Reserved fetch 1 (§2.1) always asks whether a security/trust page exists. The answer "no"
-- is informative — a B2B SaaS company with no trust page at all is a different prospect from
-- one with a page full of badges — so it is recorded rather than left as an absence the card
-- cannot distinguish from "we never looked".
ALTER TABLE companies ADD COLUMN IF NOT EXISTS security_page_checked BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS security_page_url TEXT;

-- R-24 (§1.3). The contradiction itself, not just the fact that one was found: the card renders
-- the two conflicting quotes side by side, and a reason string alone cannot do that. Stored as
-- JSON on the company because it is a property of this run's evidence, not a separate entity
-- with a life of its own.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS contradiction_json TEXT;

-- §1.1. Why cert_status is null when it is, so the card can say "we refused to conclude this"
-- rather than showing an unexplained blank where a verdict-critical field should be.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS cert_note TEXT;

CREATE INDEX IF NOT EXISTS companies_run_idx ON companies (run_id);
CREATE UNIQUE INDEX IF NOT EXISTS companies_run_domain_idx
  ON companies (run_id, normalized_domain);

CREATE TABLE IF NOT EXISTS fetches (
  id          TEXT PRIMARY KEY,
  company_id  TEXT NOT NULL,
  url         TEXT NOT NULL,
  tier        INTEGER NOT NULL,
  status_code INTEGER,
  word_count  INTEGER NOT NULL DEFAULT 0,
  ok          BOOLEAN NOT NULL DEFAULT false,
  error       TEXT,
  -- Beyond §8's column list. The cleaned text must be retrievable after the fetch so the
  -- evidence validator can re-check every quote against the page it claims to come from.
  -- Without it, "never fabricate" would rest on trusting the model's memory of the page.
  clean_text  TEXT,
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fetches_company_idx ON fetches (company_id);
-- Set when the row was served from `page_cache` and no request reached the company's server.
-- Health counts these against live fetches, which is the deck's third cost dial made visible.
ALTER TABLE fetches ADD COLUMN IF NOT EXISTS from_cache BOOLEAN NOT NULL DEFAULT false;
-- Milliseconds actually spent waiting before this request, to honour our own politeness floor
-- and any Crawl-delay the site published. Stored so the badge shows a measurement, not a claim.
ALTER TABLE fetches ADD COLUMN IF NOT EXISTS delay_ms INTEGER NOT NULL DEFAULT 0;

-- The agent loop's audit trail. Rendered on the company page as
-- "How it decided what to read next" — the visible difference from a fixed pipeline.
CREATE TABLE IF NOT EXISTS loop_trace (
  id                TEXT PRIMARY KEY,
  company_id        TEXT NOT NULL,
  iteration         INTEGER NOT NULL,
  empty_fields_json TEXT NOT NULL,
  chosen_url        TEXT,
  chosen_reason     TEXT,
  chosen_by         TEXT NOT NULL,
  fetch_ok          BOOLEAN,
  fields_filled_json TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS loop_trace_company_idx ON loop_trace (company_id);

CREATE TABLE IF NOT EXISTS signals (
  id                 TEXT PRIMARY KEY,
  company_id         TEXT NOT NULL,
  signal_id          TEXT NOT NULL,
  points             INTEGER NOT NULL,
  independence_group TEXT NOT NULL,
  quote              TEXT,
  source_url         TEXT
);
CREATE INDEX IF NOT EXISTS signals_company_idx ON signals (company_id);
-- R-23 (§3.1). A quote that exists is not a quote that supports the claim: `verified` is the
-- only tier that scores, `asserted` is stored and shown greyed with `tier_reason` beside it.
-- Defaults to 'asserted' rather than 'verified' on purpose — a row written before tiering
-- existed has never been checked, and the safe reading of an unchecked claim is that it did not
-- earn its points. Re-scoring a company rewrites these rows with a real tier.
ALTER TABLE signals ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'asserted';
ALTER TABLE signals ADD COLUMN IF NOT EXISTS tier_reason TEXT;

CREATE TABLE IF NOT EXISTS contacts (
  id          TEXT PRIMARY KEY,
  company_id  TEXT NOT NULL,
  first_name  TEXT,
  last_name   TEXT,
  position    TEXT,
  seniority   TEXT,
  department  TEXT,
  email       TEXT NOT NULL,
  confidence  INTEGER NOT NULL DEFAULT 0,
  hunter_type TEXT,
  ladder_rank INTEGER NOT NULL DEFAULT 99,
  selected    BOOLEAN NOT NULL DEFAULT false,
  lost_reason TEXT,
  source      TEXT NOT NULL DEFAULT 'live'
);
CREATE INDEX IF NOT EXISTS contacts_company_idx ON contacts (company_id);

CREATE TABLE IF NOT EXISTS pain_points (
  id         TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  idx        INTEGER NOT NULL,
  text       TEXT NOT NULL,
  quote      TEXT,
  source_url TEXT,
  validated  BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS pain_points_company_idx ON pain_points (company_id);
-- R-23 again (§3.1). `validated` was already a boolean, but two very different things were
-- collapsing into `false`: a quote that is real but unsupported, and a quote that is not on any
-- page at all. The tier keeps them apart on the card.
ALTER TABLE pain_points ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'asserted';
ALTER TABLE pain_points ADD COLUMN IF NOT EXISTS tier_reason TEXT;

CREATE TABLE IF NOT EXISTS drafts (
  id             TEXT PRIMARY KEY,
  company_id     TEXT NOT NULL,
  subject        TEXT NOT NULL,
  body           TEXT NOT NULL,
  hook_quote     TEXT,
  hook_url       TEXT,
  validated      BOOLEAN NOT NULL DEFAULT false,
  blocked_reason TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS drafts_company_idx ON drafts (company_id);

-- R-42 (§3.2). When no compliance-specific fact survived the evidence check the hook falls back
-- to a funding round, and the card has to say so. A weak hook that explains itself is honest;
-- a weak hook that does not is just a weak hook.
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS hook_note TEXT;

-- R-23's ledger (§3.2). Every claim that failed the evidence check, across all three kinds of
-- claim, written in one place so the Health counter is a single query rather than a union of
-- three tables that each record their tier differently.
--
-- It exists mainly for the fabricated case. An asserted signal survives on its `signals` row and
-- could be counted there, but a fabricated one is dropped before it is ever persisted — its quote
-- is on no page we fetched, so there is nothing to link to and no business rendering it as
-- evidence. Without this table a fabrication would be blocked silently, and a block nobody can
-- see is indistinguishable from a check that never ran.
CREATE TABLE IF NOT EXISTS evidence_blocks (
  id         TEXT PRIMARY KEY,
  run_id     TEXT NOT NULL,
  company_id TEXT NOT NULL,
  domain     TEXT NOT NULL,
  -- 'signal' | 'pain_point' | 'draft_hook'
  kind       TEXT NOT NULL,
  -- The signal id for a signal, else null: a pain point and a hook carry no rule id of their own.
  claim_id   TEXT,
  tier       TEXT NOT NULL,
  quote      TEXT,
  reason     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS evidence_blocks_run_idx ON evidence_blocks (run_id);
CREATE INDEX IF NOT EXISTS evidence_blocks_company_idx ON evidence_blocks (company_id);

CREATE TABLE IF NOT EXISTS sends (
  id         TEXT PRIMARY KEY,
  draft_id   TEXT NOT NULL,
  to_address TEXT NOT NULL,
  transport  TEXT NOT NULL,
  status     TEXT NOT NULL,
  error      TEXT,
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sends_draft_idx ON sends (draft_id);

CREATE TABLE IF NOT EXISTS feedback (
  id         TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  domain     TEXT NOT NULL,
  action     TEXT NOT NULL,
  reason     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feedback_domain_idx ON feedback (domain);

CREATE TABLE IF NOT EXISTS cost_ledger (
  id         TEXT PRIMARY KEY,
  run_id     TEXT,
  company_id TEXT,
  call_name  TEXT NOT NULL,
  model_id   TEXT NOT NULL,
  tokens_in  INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  cost_usd   DOUBLE PRECISION NOT NULL DEFAULT 0,
  cache_hit  BOOLEAN NOT NULL DEFAULT false,
  transport  TEXT NOT NULL,
  ok         BOOLEAN NOT NULL DEFAULT true,
  error      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cost_ledger_run_idx ON cost_ledger (run_id);

CREATE TABLE IF NOT EXISTS quarantine (
  id          TEXT PRIMARY KEY,
  run_id      TEXT NOT NULL,
  domain      TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  reason_text TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quarantine_run_idx ON quarantine (run_id);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- AI response cache keyed by sha256(model + promptVersion + inputText) (§6).
CREATE TABLE IF NOT EXISTS ai_cache (
  cache_key  TEXT PRIMARY KEY,
  call_name  TEXT NOT NULL,
  response   TEXT NOT NULL,
  tokens_in  INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Page cache (§2.6b). Cleaned text only — never raw HTML, which we do not keep anywhere.
-- A hit saves the company's server a request and saves us the tokens; it does NOT refund a
-- loop fetch, because the four-fetch budget counts questions asked, not money spent.
CREATE TABLE IF NOT EXISTS page_cache (
  url        TEXT PRIMARY KEY,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  tier       INTEGER NOT NULL DEFAULT 1,
  clean_text TEXT NOT NULL,
  word_count INTEGER NOT NULL DEFAULT 0
);

-- Links are part of what a fetch produced, not a detail of how it was rendered: the reserved
-- security slot probes site-published links before conventional guesses, and `inferSize` counts
-- job links. Caching text alone let a cached run reach a different verdict from a cold one,
-- which §11 does not allow. Nullable on purpose — NULL marks a row written before link caching
-- existed, and `getCachedPage` treats that as a miss so the row refetches and repairs itself
-- instead of serving a lossy hit for the rest of the TTL.
ALTER TABLE page_cache ADD COLUMN IF NOT EXISTS links_json TEXT;
ALTER TABLE page_cache ADD COLUMN IF NOT EXISTS job_links_json TEXT;

-- §1.2 needs the page `<title>`, and a cache hit was returning `title: null` unconditionally —
-- the same bug the links comment above describes, left in place for the title. Rocketlane's
-- trust page carries two certification tokens in its title alone ("Rocketlane Trust Center:
-- Security, Compliance, and Reliability"), so a cached run read that page as bare and fired
-- S-02's thirty points on a company that is certified.
--
-- `title` cannot use NULL as the "not cached yet" sentinel, because a null title is a real
-- answer: markdown pages have none. Hence the explicit flag — false means the row predates
-- title caching and is treated as a miss, so it refetches and repairs itself.
ALTER TABLE page_cache ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE page_cache ADD COLUMN IF NOT EXISTS title_cached BOOLEAN NOT NULL DEFAULT false;

-- §6.3 — every reply that was pasted in, classified and acted on.
--
-- The raw text is kept because the quote guard is checked against it: a classification whose
-- supporting sentence cannot be found in the reply is forced to `unclear`, and that check has to
-- be re-runnable later, not just at the moment the paste happened.
CREATE TABLE IF NOT EXISTS replies (
  id           TEXT PRIMARY KEY,
  company_id   TEXT NOT NULL,
  domain       TEXT NOT NULL,
  raw_text     TEXT NOT NULL,
  -- AI-5's reading, after the quote guard has had its say.
  intent       TEXT NOT NULL,
  confidence   DOUBLE PRECISION NOT NULL DEFAULT 0,
  quote        TEXT,
  -- Set when the quote guard overrode the model, with the reason it did.
  downgraded   BOOLEAN NOT NULL DEFAULT false,
  downgrade_reason TEXT,
  rule_fired   TEXT NOT NULL,
  effect       TEXT NOT NULL,
  applied      BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS replies_company_idx ON replies (company_id);

-- §6.3 — what a reply did to a domain's future.
--
-- One row per domain, replaced on each new decision, because what matters to the next run is the
-- current state and not the history (which `replies` keeps). `until` NULL together with
-- kind = 'block' is R-54's permanent case: there is no date at which it lapses, and no UI path
-- that deletes the row.
CREATE TABLE IF NOT EXISTS outreach_state (
  domain     TEXT PRIMARY KEY,
  -- 'won' | 'snooze' | 'suppress' | 'block'
  kind       TEXT NOT NULL,
  rule       TEXT NOT NULL,
  reason     TEXT,
  until      TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Hunter Domain Search cache, so repeat domains never cost a second credit (§4.1, T-02).
CREATE TABLE IF NOT EXISTS hunter_cache (
  domain        TEXT PRIMARY KEY,
  response_json TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
