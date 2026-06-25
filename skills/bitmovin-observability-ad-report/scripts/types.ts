/**
 * Shared types for the ad-ops snapshot-report scripts.
 *
 * These scripts are pure, deterministic numeric helpers. They take structured
 * input (assembled by the agent from `queryTotal` / `queryGroupBy` results)
 * and return numbers + classifications. They NEVER return a verdict such as
 * "this advertiser is underperforming" — that judgment stays with the agent.
 *
 * The top-level `AdOpsReport` is the contract the skill emits at Report. See
 * references/report-contract.md for the prose spec.
 */

// ──────────────────────────────────────────────────────────────────────────────
// Funnel
// ──────────────────────────────────────────────────────────────────────────────

/** Canonical funnel stage labels, in order. */
export type FunnelStageName =
  | "impressions"
  | "starts"
  | "q1"
  | "midpoint"
  | "q3"
  | "completions";

export interface FunnelStageInput {
  name: FunnelStageName;
  count: number;
}

export interface FunnelInput {
  stages: FunnelStageInput[];
  /** Optional side-branch total. */
  clicks?: number | null;
  /** Optional side-branch total. */
  skips?: number | null;
  /**
   * Threshold below which Q1/Q2/Q3 totals are considered "missing beacons".
   * The default treats a stage as missing when its count is < 1% of
   * impressions. The script flags `quartileBeaconsMissing` when ALL three
   * quartile stages fall below the threshold but completions are non-trivial.
   */
  beaconMissingRatio?: number;
}

export interface FunnelStage {
  name: FunnelStageName;
  count: number;
  /** count / impressions; 0 when impressions = 0. */
  share: number;
  /** Absolute drop from the previous stage; null for the first stage. */
  dropFromPrev: number | null;
  /** Relative drop from the previous stage; null for the first stage. */
  dropRateFromPrev: number | null;
}

export interface FunnelResult {
  stages: FunnelStage[];
  /** completions / impressions. Null when impressions = 0. */
  completionRate: number | null;
  /** starts / impressions. Null when impressions = 0. */
  startRate: number | null;
  /** True when Q1/Q2/Q3 are all near zero but completions are non-trivial. */
  quartileBeaconsMissing: boolean;
  clicks: number | null;
  skips: number | null;
  /** clicks / impressions. Null when clicks is null/zero or impressions = 0. */
  clickThroughRate: number | null;
  /** skips / impressions. Null when skips is null or impressions = 0. */
  skipRate: number | null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Pareto
// ──────────────────────────────────────────────────────────────────────────────

export interface ParetoInputEntry {
  key: string;
  value: number;
}

export interface ParetoInput {
  entries: ParetoInputEntry[];
  /** Top-N to summarize. Default 5. */
  topN?: number;
  /** Cumulative-share split point. Default 0.8 (80%). */
  threshold?: number;
}

export interface ParetoEntry {
  key: string;
  value: number;
  /** value / total. */
  share: number;
  /** Running cumulative share through this entry. */
  cumulative: number;
  /** 1-based rank by value descending. */
  rank: number;
}

export interface ParetoResult {
  total: number;
  entries: ParetoEntry[];
  /** Sum of share across the top-N entries. */
  topN: { count: number; share: number };
  /** The threshold used for the head/tail split. */
  threshold: number;
  /** Number of entries needed to cover `threshold` of the total. */
  headCount: number;
}

// ──────────────────────────────────────────────────────────────────────────────
// Anomaly flags
// ──────────────────────────────────────────────────────────────────────────────

export type AnomalySeverity = "info" | "warn" | "high";

export interface AnomalyFlag {
  /** Stable identifier — see SKILL.md for the registry. */
  id: string;
  severity: AnomalySeverity;
  /** Human-readable summary including the observed value and the threshold. */
  message: string;
  detail: {
    observed: number;
    threshold: number;
    /** Optional slice the flag applies to (e.g. ad system name). */
    slice?: string;
    /** Optional extra context object. */
    scope?: Record<string, unknown>;
  };
}

export interface AnomalyThresholds {
  /** impression→start drop fraction (e.g. 0.08 = 8%). */
  impressionToStartDrop?: number;
  /** start→Q1 drop fraction. */
  startToQ1Drop?: number;
  /** Q3→completion drop fraction. */
  q3ToCompletionDrop?: number;
  /** Completion rate floor — flag when below. */
  completionRateMin?: number;
  /** Top error-code share above which one code dominates. */
  topErrorCodeShare?: number;
  /** Top advertiser share above which inventory is over-concentrated. */
  topAdvertiserShare?: number;
  /** ad_startup_time p95 ceiling (milliseconds). */
  adStartupP95Ms?: number;
  /** Overall ad-error percentage ceiling. */
  errorPercentageMax?: number;
}

export interface AnomalyFlagsInput {
  funnel: FunnelResult;
  errors?: {
    topCodeShare?: number | null;
    topCode?: string | null;
    errorPercentage?: number | null;
  };
  concentration?: {
    topAdvertiserShare?: number | null;
    topAdvertiser?: string | null;
  };
  latency?: {
    p95Ms?: number | null;
  };
  thresholds?: AnomalyThresholds;
}

export interface AnomalyFlagsResult {
  flags: AnomalyFlag[];
  /** The effective thresholds applied, including defaults. */
  thresholdsApplied: Required<AnomalyThresholds>;
}

// ──────────────────────────────────────────────────────────────────────────────
// Sample gate (vendored from the QoE RCA skill)
// ──────────────────────────────────────────────────────────────────────────────

export interface SampleGate {
  adequate: boolean;
  reasons: string[];
}

// ──────────────────────────────────────────────────────────────────────────────
// Top-level report contract (for downstream consumers, not used by scripts)
// ──────────────────────────────────────────────────────────────────────────────

export interface ErrorCodeEntry {
  code: string;
  count: number;
  share: number;
}

export interface ErrorsSection {
  totalErrorSessions: number;
  errorPercentage: number | null;
  topCodes: ErrorCodeEntry[];
  topAdSystems: ParetoEntry[];
  topTagServers: ParetoEntry[] | null;
}

export interface ConcentrationSection {
  byCompletions: ParetoResult;
  byAbandonment: ParetoResult;
  adSystems: ParetoResult | null;
  tail: { count: number; share: number };
}

export interface PodPositionEntry {
  key: string;
  starts: number;
  completions: number;
  skips: number;
  completionRate: number;
  skipRate: number;
}

export interface PodPositionsSection {
  byPosition: PodPositionEntry[];
  byPodPosition: PodPositionEntry[] | null;
  survivorBiasNote: string;
}

export interface LatencySection {
  medianMs: number | null;
  p95Ms: number | null;
  topAdSystems: ParetoEntry[];
}

export interface AdOpsReport {
  schemaVersion: "1.0";
  generatedAt: string;
  licenseKey: string;
  mode: "snapshot";
  window: { start: string; end: string };
  cohort: Record<string, unknown> | null;
  funnel: FunnelResult;
  errors: ErrorsSection;
  concentration: ConcentrationSection;
  podPositions: PodPositionsSection;
  latency: LatencySection;
  anomalies: AnomalyFlag[];
  notDeterminable: string[];
  recommendedAction: string | null;
}
