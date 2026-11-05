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

-- Hunter Domain Search cache, so repeat domains never cost a second credit (§4.1, T-02).
CREATE TABLE IF NOT EXISTS hunter_cache (
  domain        TEXT PRIMARY KEY,
  response_json TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
