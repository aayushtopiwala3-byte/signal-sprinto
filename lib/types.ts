/** Shared domain vocabulary. The Evidence Map (§4.3) and everything the rules engine reads. */

export type CertStatus = "none" | "in_progress" | "certified";
export type SizeBand = "1-10" | "11-50" | "51-200" | "201-500" | "500+";
export type Verdict = "SEND" | "HOLD" | "DROP";
export type Play = "greenfield" | "migration";

export type Evidence = { quote: string; url: string };

/**
 * The four fields, and only these four, decide whether the loop keeps going (§4.3).
 * `null` means "we have not found this", which is why every field is nullable in the DB too.
 * `pressure_signals` is the exception: it may be an empty array, but is not null once a page
 * has been read.
 */
export type EvidenceMap = {
  is_b2b_saas: boolean | null;
  is_b2b_saas_evidence: Evidence | null;
  cert_status: CertStatus | null;
  cert_status_evidence: Evidence | null;
  size_band: SizeBand | null;
  size_band_evidence: Evidence | null;
  pressure_signals: string[] | null;
  /** R-03 input. Not a loop-gating field: absence is treated as "not a services business". */
  is_services: boolean | null;
};

export const EMPTY_EVIDENCE_MAP: EvidenceMap = {
  is_b2b_saas: null,
  is_b2b_saas_evidence: null,
  cert_status: null,
  cert_status_evidence: null,
  size_band: null,
  size_band_evidence: null,
  pressure_signals: null,
  is_services: null,
};

/** The four loop-gating fields, in the order the fallback priority map prefers them. */
export const LOOP_FIELDS = [
  "is_b2b_saas",
  "size_band",
  "cert_status",
  "pressure_signals",
] as const;
export type LoopField = (typeof LOOP_FIELDS)[number];

export type SignalId = "S-01" | "S-02" | "S-03" | "S-04" | "S-05" | "S-06" | "S-07";
export type IndependenceGroup =
  | "certification"
  | "hiring"
  | "enterprise-demand"
  | "funding"
  | "vertical";

export type FiredSignal = {
  signal_id: SignalId;
  points: number;
  independence_group: IndependenceGroup;
  quote: string | null;
  source_url: string | null;
};

/** S-01…S-07 point values. User-adjustable 0–50 via the sliders (§5.5). */
export type Weights = Record<SignalId, number>;

export const DEFAULT_WEIGHTS: Weights = {
  "S-01": 40,
  "S-02": 30,
  "S-03": 30,
  "S-04": 25,
  "S-05": 15,
  "S-06": 10,
  "S-07": 15,
};

export type Switches = {
  strict_icp: boolean;
  ai_enabled: boolean;
  reader_enabled: boolean;
  auto_send: boolean;
};

export const DEFAULT_SWITCHES: Switches = {
  strict_icp: false,
  ai_enabled: true,
  reader_enabled: true,
  auto_send: false,
};

export type VerdictResult = {
  verdict: Verdict;
  timing_score: number;
  independent_signals: number;
  play: Play;
  /** Human-readable, always names the rule, e.g. "R-02: headcount above 500...". */
  verdict_reason: string;
  /** The single rule or threshold id that decided it. */
  rule_fired: string;
  fired_signals: FiredSignal[];
  /** What would move this to the next verdict up, for the "why" panel (§9). */
  what_would_change_it: string | null;
};

export type ContactRow = {
  id: string;
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
  source: "live" | "cached" | "seeded";
};

/** The literal string rendered wherever a fact is missing. Never blank, never guessed (§9). */
export const NOT_STATED = "not stated" as const;

export type Stage =
  | "queued"
  | "fetching"
  | "extracting"
  | "looping"
  | "scoring"
  | "finding contact"
  | "drafting"
  | "done"
  | "quarantined"
  | "error";
