import { sql, one, newId } from "@/lib/db/client";
import {
  DEFAULT_SWITCHES,
  DEFAULT_WEIGHTS,
  EMPTY_EVIDENCE_MAP,
  type EvidenceMap,
  type FiredSignal,
  type Switches,
  type Weights,
} from "@/lib/types";

/** Every read and write the pipeline and the pages need. Nothing here makes a decision. */

export type RunRow = {
  id: string;
  started_at: string;
  finished_at: string | null;
  weights_json: string;
  switches_json: string;
  domains_submitted: number;
  duplicates_removed: number;
  status: string;
};

export type CompanyRow = {
  id: string;
  run_id: string;
  domain: string;
  normalized_domain: string;
  status: string;
  stage: string;
  is_b2b_saas: boolean | null;
  is_b2b_saas_evidence_json: string | null;
  cert_status: string | null;
  cert_status_evidence_json: string | null;
  size_band: string | null;
  size_band_evidence_json: string | null;
  pressure_signals_json: string | null;
  is_services: boolean | null;
  verdict: string | null;
  timing_score: number | null;
  independent_signals: number | null;
  play: string | null;
  verdict_reason: string | null;
  rule_fired: string | null;
  fetches_used: number;
  missing_fields_json: string | null;
  error: string | null;
  created_at: string;
};

const parse = <T>(json: string | null, fallback: T): T => {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
};

/* -------------------------------------------------------------------- runs */

export async function createRun(input: {
  weights: Weights;
  switches: Switches;
  domainsSubmitted: number;
  duplicatesRemoved: number;
}): Promise<string> {
  const id = newId("run");
  await sql`
    INSERT INTO runs (id, weights_json, switches_json, domains_submitted, duplicates_removed, status)
    VALUES (${id}, ${JSON.stringify(input.weights)}, ${JSON.stringify(input.switches)},
            ${input.domainsSubmitted}, ${input.duplicatesRemoved}, 'running')`;
  return id;
}

export async function getRun(runId: string): Promise<RunRow | null> {
  return one<RunRow>`SELECT * FROM runs WHERE id = ${runId}`;
}

export async function latestRun(): Promise<RunRow | null> {
  return one<RunRow>`SELECT * FROM runs ORDER BY started_at DESC LIMIT 1`;
}

export async function finishRun(runId: string, status = "done"): Promise<void> {
  await sql`UPDATE runs SET finished_at = now(), status = ${status} WHERE id = ${runId}`;
}

/** Reweighting rewrites the run's own record, so a reload shows the slider positions in use. */
export async function updateRunTuning(
  runId: string,
  weights: Weights,
  switches: Switches,
): Promise<void> {
  await sql`
    UPDATE runs SET weights_json = ${JSON.stringify(weights)},
                    switches_json = ${JSON.stringify(switches)}
    WHERE id = ${runId}`;
}

export function runWeights(run: RunRow): Weights {
  return { ...DEFAULT_WEIGHTS, ...parse<Partial<Weights>>(run.weights_json, {}) };
}

export function runSwitches(run: RunRow): Switches {
  return { ...DEFAULT_SWITCHES, ...parse<Partial<Switches>>(run.switches_json, {}) };
}

/* --------------------------------------------------------------- companies */

export async function insertCompany(input: {
  runId: string;
  domain: string;
  normalizedDomain: string;
}): Promise<string> {
  const id = newId("co");
  await sql`
    INSERT INTO companies (id, run_id, domain, normalized_domain, status, stage)
    VALUES (${id}, ${input.runId}, ${input.domain}, ${input.normalizedDomain}, 'pending', 'queued')
    ON CONFLICT (run_id, normalized_domain) DO NOTHING`;
  return id;
}

/**
 * Claim exactly one pending company (§7.2). The UPDATE…RETURNING is atomic, so two concurrent
 * step calls can never process the same domain twice.
 */
export async function claimNextPending(runId: string): Promise<CompanyRow | null> {
  const rows = await sql<CompanyRow>`
    UPDATE companies SET status = 'running', stage = 'fetching'
    WHERE id = (
      SELECT id FROM companies
      WHERE run_id = ${runId} AND status = 'pending'
      ORDER BY created_at ASC LIMIT 1
    )
    RETURNING *`;
  return rows[0] ?? null;
}

export async function setStage(companyId: string, stage: string): Promise<void> {
  await sql`UPDATE companies SET stage = ${stage} WHERE id = ${companyId}`;
}

export async function listCompanies(runId: string): Promise<CompanyRow[]> {
  return sql<CompanyRow>`
    SELECT * FROM companies WHERE run_id = ${runId} ORDER BY created_at ASC`;
}

export async function getCompany(companyId: string): Promise<CompanyRow | null> {
  return one<CompanyRow>`SELECT * FROM companies WHERE id = ${companyId}`;
}

export async function countPending(runId: string): Promise<number> {
  const rows = await sql<{ n: string | number }>`
    SELECT COUNT(*) AS n FROM companies
    WHERE run_id = ${runId} AND status IN ('pending', 'running')`;
  return Number(rows[0]?.n ?? 0);
}

export function evidenceFromRow(row: CompanyRow): EvidenceMap {
  return {
    is_b2b_saas: row.is_b2b_saas,
    is_b2b_saas_evidence: parse(row.is_b2b_saas_evidence_json, null),
    cert_status: row.cert_status as EvidenceMap["cert_status"],
    cert_status_evidence: parse(row.cert_status_evidence_json, null),
    size_band: row.size_band as EvidenceMap["size_band"],
    size_band_evidence: parse(row.size_band_evidence_json, null),
    pressure_signals: parse(row.pressure_signals_json, null),
    is_services: row.is_services,
  };
}

export async function saveEvidence(companyId: string, evidence: EvidenceMap): Promise<void> {
  await sql`
    UPDATE companies SET
      is_b2b_saas = ${evidence.is_b2b_saas},
      is_b2b_saas_evidence_json = ${evidence.is_b2b_saas_evidence ? JSON.stringify(evidence.is_b2b_saas_evidence) : null},
      cert_status = ${evidence.cert_status},
      cert_status_evidence_json = ${evidence.cert_status_evidence ? JSON.stringify(evidence.cert_status_evidence) : null},
      size_band = ${evidence.size_band},
      size_band_evidence_json = ${evidence.size_band_evidence ? JSON.stringify(evidence.size_band_evidence) : null},
      pressure_signals_json = ${evidence.pressure_signals ? JSON.stringify(evidence.pressure_signals) : null},
      is_services = ${evidence.is_services}
    WHERE id = ${companyId}`;
}

export async function saveVerdict(
  companyId: string,
  v: {
    verdict: string;
    timing_score: number;
    independent_signals: number;
    play: string;
    verdict_reason: string;
    rule_fired: string;
    fetches_used: number;
    missing_fields: string[];
  },
): Promise<void> {
  await sql`
    UPDATE companies SET
      verdict = ${v.verdict}, timing_score = ${v.timing_score},
      independent_signals = ${v.independent_signals}, play = ${v.play},
      verdict_reason = ${v.verdict_reason}, rule_fired = ${v.rule_fired},
      fetches_used = ${v.fetches_used},
      missing_fields_json = ${JSON.stringify(v.missing_fields)},
      status = 'done', stage = 'done'
    WHERE id = ${companyId}`;
}

export async function failCompany(companyId: string, error: string): Promise<void> {
  await sql`
    UPDATE companies SET status = 'error', stage = 'error', error = ${error}
    WHERE id = ${companyId}`;
}

export async function quarantineCompany(companyId: string): Promise<void> {
  await sql`UPDATE companies SET status = 'quarantined', stage = 'quarantined' WHERE id = ${companyId}`;
}

/* ----------------------------------------------------------------- fetches */

export type FetchRow = {
  id: string;
  company_id: string;
  url: string;
  tier: number;
  status_code: number | null;
  word_count: number;
  ok: boolean;
  error: string | null;
  clean_text: string | null;
  fetched_at: string;
};

export async function insertFetch(input: {
  companyId: string;
  url: string;
  tier: number;
  statusCode: number | null;
  wordCount: number;
  ok: boolean;
  error: string | null;
  cleanText: string | null;
}): Promise<void> {
  await sql`
    INSERT INTO fetches (id, company_id, url, tier, status_code, word_count, ok, error, clean_text)
    VALUES (${newId("fe")}, ${input.companyId}, ${input.url}, ${input.tier}, ${input.statusCode},
            ${input.wordCount}, ${input.ok}, ${input.error}, ${input.cleanText})`;
}

export async function listFetches(companyId: string): Promise<FetchRow[]> {
  return sql<FetchRow>`
    SELECT * FROM fetches WHERE company_id = ${companyId} ORDER BY fetched_at ASC`;
}

/** The pages the evidence validator checks quotes against. */
export async function sourcesFor(companyId: string): Promise<{ url: string; text: string }[]> {
  const rows = await sql<{ url: string; clean_text: string | null }>`
    SELECT url, clean_text FROM fetches
    WHERE company_id = ${companyId} AND ok = true AND clean_text IS NOT NULL
    ORDER BY fetched_at ASC`;
  return rows.map((r) => ({ url: r.url, text: r.clean_text ?? "" }));
}

/* -------------------------------------------------------------- loop trace */

export type LoopTraceRow = {
  id: string;
  company_id: string;
  iteration: number;
  empty_fields_json: string;
  chosen_url: string | null;
  chosen_reason: string | null;
  chosen_by: string;
  fetch_ok: boolean | null;
  fields_filled_json: string | null;
  created_at: string;
};

export async function insertLoopTrace(input: {
  companyId: string;
  iteration: number;
  emptyFields: string[];
  chosenUrl: string | null;
  chosenReason: string | null;
  chosenBy: string;
  fetchOk: boolean | null;
  fieldsFilled: string[] | null;
}): Promise<void> {
  await sql`
    INSERT INTO loop_trace
      (id, company_id, iteration, empty_fields_json, chosen_url, chosen_reason, chosen_by,
       fetch_ok, fields_filled_json)
    VALUES (${newId("lt")}, ${input.companyId}, ${input.iteration},
            ${JSON.stringify(input.emptyFields)}, ${input.chosenUrl}, ${input.chosenReason},
            ${input.chosenBy}, ${input.fetchOk},
            ${input.fieldsFilled ? JSON.stringify(input.fieldsFilled) : null})`;
}

export async function listLoopTrace(companyId: string): Promise<LoopTraceRow[]> {
  return sql<LoopTraceRow>`
    SELECT * FROM loop_trace WHERE company_id = ${companyId} ORDER BY iteration ASC`;
}

/* ----------------------------------------------------------------- signals */

export type SignalRow = {
  id: string;
  company_id: string;
  signal_id: string;
  points: number;
  independence_group: string;
  quote: string | null;
  source_url: string | null;
};

export async function replaceSignals(companyId: string, signals: FiredSignal[]): Promise<void> {
  await sql`DELETE FROM signals WHERE company_id = ${companyId}`;
  for (const s of signals) {
    await sql`
      INSERT INTO signals (id, company_id, signal_id, points, independence_group, quote, source_url)
      VALUES (${newId("sg")}, ${companyId}, ${s.signal_id}, ${s.points},
              ${s.independence_group}, ${s.quote}, ${s.source_url})`;
  }
}

export async function listSignals(companyId: string): Promise<SignalRow[]> {
  return sql<SignalRow>`
    SELECT * FROM signals WHERE company_id = ${companyId} ORDER BY signal_id ASC`;
}

export async function signalsForRun(runId: string): Promise<SignalRow[]> {
  return sql<SignalRow>`
    SELECT s.* FROM signals s
    JOIN companies c ON c.id = s.company_id
    WHERE c.run_id = ${runId}
    ORDER BY s.company_id, s.signal_id`;
}

export function toFiredSignals(rows: SignalRow[]): FiredSignal[] {
  return rows.map((r) => ({
    signal_id: r.signal_id as FiredSignal["signal_id"],
    points: r.points,
    independence_group: r.independence_group as FiredSignal["independence_group"],
    quote: r.quote,
    source_url: r.source_url,
  }));
}

/* ---------------------------------------------------------------- contacts */

export type ContactDbRow = {
  id: string;
  company_id: string;
  first_name: string | null;
  last_name: string | null;
  position: string | null;
  seniority: string | null;
  department: string | null;
  email: string;
  confidence: number;
  hunter_type: string | null;
  ladder_rank: number;
  selected: boolean;
  lost_reason: string | null;
  source: string;
};

export async function replaceContacts(
  companyId: string,
  contacts: Omit<ContactDbRow, "id" | "company_id">[],
): Promise<void> {
  await sql`DELETE FROM contacts WHERE company_id = ${companyId}`;
  for (const c of contacts) {
    await sql`
      INSERT INTO contacts (id, company_id, first_name, last_name, position, seniority,
                            department, email, confidence, hunter_type, ladder_rank,
                            selected, lost_reason, source)
      VALUES (${newId("ct")}, ${companyId}, ${c.first_name}, ${c.last_name}, ${c.position},
              ${c.seniority}, ${c.department}, ${c.email}, ${c.confidence}, ${c.hunter_type},
              ${c.ladder_rank}, ${c.selected}, ${c.lost_reason}, ${c.source})`;
  }
}

export async function listContacts(companyId: string): Promise<ContactDbRow[]> {
  return sql<ContactDbRow>`
    SELECT * FROM contacts WHERE company_id = ${companyId}
    ORDER BY selected DESC, ladder_rank ASC, confidence DESC`;
}

export async function swapSelectedContact(
  companyId: string,
  contactId: string,
): Promise<void> {
  await sql`UPDATE contacts SET selected = false WHERE company_id = ${companyId}`;
  await sql`UPDATE contacts SET selected = true WHERE id = ${contactId} AND company_id = ${companyId}`;
}

/* ------------------------------------------------------------- pain points */

export type PainPointRow = {
  id: string;
  company_id: string;
  idx: number;
  text: string;
  quote: string | null;
  source_url: string | null;
  validated: boolean;
};

export async function replacePainPoints(
  companyId: string,
  points: { text: string; quote: string | null; source_url: string | null; validated: boolean }[],
): Promise<void> {
  await sql`DELETE FROM pain_points WHERE company_id = ${companyId}`;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    await sql`
      INSERT INTO pain_points (id, company_id, idx, text, quote, source_url, validated)
      VALUES (${newId("pp")}, ${companyId}, ${i}, ${p.text}, ${p.quote}, ${p.source_url}, ${p.validated})`;
  }
}

export async function listPainPoints(companyId: string): Promise<PainPointRow[]> {
  return sql<PainPointRow>`
    SELECT * FROM pain_points WHERE company_id = ${companyId} ORDER BY idx ASC`;
}

/* ------------------------------------------------------------------ drafts */

export type DraftRow = {
  id: string;
  company_id: string;
  subject: string;
  body: string;
  hook_quote: string | null;
  hook_url: string | null;
  validated: boolean;
  blocked_reason: string | null;
  created_at: string;
};

export async function replaceDraft(
  companyId: string,
  d: {
    subject: string;
    body: string;
    hook_quote: string | null;
    hook_url: string | null;
    validated: boolean;
    blocked_reason: string | null;
  },
): Promise<string> {
  await sql`DELETE FROM drafts WHERE company_id = ${companyId}`;
  const id = newId("dr");
  await sql`
    INSERT INTO drafts (id, company_id, subject, body, hook_quote, hook_url, validated, blocked_reason)
    VALUES (${id}, ${companyId}, ${d.subject}, ${d.body}, ${d.hook_quote}, ${d.hook_url},
            ${d.validated}, ${d.blocked_reason})`;
  return id;
}

export async function getDraft(companyId: string): Promise<DraftRow | null> {
  return one<DraftRow>`
    SELECT * FROM drafts WHERE company_id = ${companyId} ORDER BY created_at DESC LIMIT 1`;
}

export async function getDraftById(draftId: string): Promise<DraftRow | null> {
  return one<DraftRow>`SELECT * FROM drafts WHERE id = ${draftId}`;
}

export async function updateDraftText(
  draftId: string,
  subject: string,
  body: string,
): Promise<void> {
  await sql`UPDATE drafts SET subject = ${subject}, body = ${body} WHERE id = ${draftId}`;
}

/** An edit re-runs the evidence check, so the stored verdict on sendability moves with it. */
export async function setDraftValidation(
  draftId: string,
  validated: boolean,
  blockedReason: string | null,
): Promise<void> {
  await sql`UPDATE drafts SET validated = ${validated}, blocked_reason = ${blockedReason}
            WHERE id = ${draftId}`;
}

/* ------------------------------------------------------------------- sends */

export type SendRow = {
  id: string;
  draft_id: string;
  to_address: string;
  transport: string;
  status: string;
  error: string | null;
  sent_at: string;
};

export async function insertSend(input: {
  draftId: string;
  toAddress: string;
  transport: string;
  status: string;
  error: string | null;
}): Promise<void> {
  await sql`
    INSERT INTO sends (id, draft_id, to_address, transport, status, error)
    VALUES (${newId("sn")}, ${input.draftId}, ${input.toAddress}, ${input.transport},
            ${input.status}, ${input.error})`;
}

export async function sendsFor(draftId: string): Promise<SendRow[]> {
  return sql<SendRow>`SELECT * FROM sends WHERE draft_id = ${draftId} ORDER BY sent_at DESC`;
}

export async function sendsForRun(runId: string): Promise<(SendRow & { company_id: string })[]> {
  return sql<SendRow & { company_id: string }>`
    SELECT s.*, d.company_id FROM sends s
    JOIN drafts d ON d.id = s.draft_id
    JOIN companies c ON c.id = d.company_id
    WHERE c.run_id = ${runId}`;
}

/* ---------------------------------------------------------------- feedback */

export type FeedbackRow = {
  id: string;
  company_id: string;
  domain: string;
  action: string;
  reason: string | null;
  created_at: string;
};

export async function insertFeedback(input: {
  companyId: string;
  domain: string;
  action: string;
  reason: string | null;
}): Promise<void> {
  await sql`
    INSERT INTO feedback (id, company_id, domain, action, reason)
    VALUES (${newId("fb")}, ${input.companyId}, ${input.domain}, ${input.action}, ${input.reason})`;
}

/** Domains rejected in a previous run, which the next run suppresses (§3.9, T-24). */
export async function suppressedDomains(): Promise<Map<string, string>> {
  const rows = await sql<{ domain: string; reason: string | null; created_at: string }>`
    SELECT DISTINCT ON (domain) domain, reason, created_at
    FROM feedback WHERE action = 'reject'
    ORDER BY domain, created_at DESC`;
  return new Map(rows.map((r) => [r.domain, r.reason ?? "no reason given"]));
}

export async function listFeedback(): Promise<FeedbackRow[]> {
  return sql<FeedbackRow>`SELECT * FROM feedback ORDER BY created_at DESC LIMIT 50`;
}

export async function feedbackForCompany(companyId: string): Promise<FeedbackRow | null> {
  return one<FeedbackRow>`
    SELECT * FROM feedback WHERE company_id = ${companyId} ORDER BY created_at DESC LIMIT 1`;
}

/* -------------------------------------------------------------- quarantine */

export type QuarantineRow = {
  id: string;
  run_id: string;
  domain: string;
  reason_code: string;
  reason_text: string;
  created_at: string;
};

export async function insertQuarantine(input: {
  runId: string;
  domain: string;
  reasonCode: string;
  reasonText: string;
}): Promise<void> {
  await sql`
    INSERT INTO quarantine (id, run_id, domain, reason_code, reason_text)
    VALUES (${newId("qa")}, ${input.runId}, ${input.domain}, ${input.reasonCode}, ${input.reasonText})`;
}

export async function listQuarantine(runId: string): Promise<QuarantineRow[]> {
  return sql<QuarantineRow>`
    SELECT * FROM quarantine WHERE run_id = ${runId} ORDER BY created_at ASC`;
}

/* ------------------------------------------------------------- cost ledger */

export type CostRow = {
  id: string;
  run_id: string | null;
  company_id: string | null;
  call_name: string;
  model_id: string;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  cache_hit: boolean;
  transport: string;
  ok: boolean;
  error: string | null;
  created_at: string;
};

export async function costLedger(runId: string): Promise<CostRow[]> {
  return sql<CostRow>`
    SELECT * FROM cost_ledger WHERE run_id = ${runId} ORDER BY created_at ASC`;
}

export async function costSummary(runId: string): Promise<{
  totalUsd: number;
  calls: number;
  cacheHits: number;
  failures: number;
}> {
  const rows = await sql<{
    total: string | number | null;
    calls: string | number;
    hits: string | number;
    failures: string | number;
  }>`
    SELECT COALESCE(SUM(cost_usd), 0) AS total,
           COUNT(*) AS calls,
           COUNT(*) FILTER (WHERE cache_hit) AS hits,
           COUNT(*) FILTER (WHERE NOT ok) AS failures
    FROM cost_ledger WHERE run_id = ${runId}`;
  const r = rows[0];
  return {
    totalUsd: Number(r?.total ?? 0),
    calls: Number(r?.calls ?? 0),
    cacheHits: Number(r?.hits ?? 0),
    failures: Number(r?.failures ?? 0),
  };
}

/* ---------------------------------------------------------------- settings */

export async function readSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await one<{ value_json: string }>`
    SELECT value_json FROM settings WHERE key = ${key}`;
  return parse<T>(row?.value_json ?? null, fallback);
}

export async function writeSetting(key: string, value: unknown): Promise<void> {
  await sql`
    INSERT INTO settings (key, value_json, updated_at)
    VALUES (${key}, ${JSON.stringify(value)}, now())
    ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = now()`;
}

export const EMPTY_EVIDENCE = EMPTY_EVIDENCE_MAP;
