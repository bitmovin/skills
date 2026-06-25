/**
 * Shared types for the QoE RCA scripts.
 *
 * These scripts are pure, deterministic numeric helpers. They take structured
 * input (assembled by the agent from `query` / `queryGroupBy` / `queryTotal`
 * results) and return numbers + classifications. They NEVER return a verdict
 * such as "this is a regression" — that judgment stays with the agent.
 *
 * The `Finding` / `RcaFindings` types are the findings contract the skill emits
 * at Conclude. See references/findings-contract.md for the prose spec.
 */

/** How a metric aggregates — decides whether exact decomposition is valid. */
export type MetricKind = "ratio" | "mean" | "percentile";

/** One segment of a dimension (e.g. CDN="CDN-X") observed in both windows. */
export interface SegmentObservation {
  /** Segment label, e.g. "CDN-X", "player v11", "DE". */
  key: string;
  /** Raw volume (impression count) in the baseline window. 0 if absent. */
  count0: number;
  /** Raw volume in the current window. 0 if absent. */
  count1: number;
  /**
   * Within-segment metric value in the baseline window.
   * For ratio metrics pass the ratio in [0,1]; for mean metrics pass the mean.
   * Pass null if the segment is absent in window 0 (count0 === 0).
   */
  metric0: number | null;
  /** Within-segment metric value in the current window; null if absent. */
  metric1: number | null;
}

/** Per-segment contribution breakdown from the shift-share decomposition. */
export interface SegmentContribution {
  key: string;
  /** Volume share in window 0 (count0 / totalCount0). */
  share0: number;
  /** Volume share in window 1. */
  share1: number;
  /** Within-segment metric, window 0 (effective value used in the math). */
  metric0: number;
  /** Within-segment metric, window 1. */
  metric1: number;
  /** Mix (composition) contribution: (share1 - share0) * metric0. */
  mix: number;
  /** Rate (within-segment) contribution: share0 * (metric1 - metric0). */
  rate: number;
  /** Interaction contribution: (share1 - share0) * (metric1 - metric0). */
  interaction: number;
  /** mix + rate + interaction — this segment's slice of the total delta. */
  total: number;
  /** True if the segment was absent in one window (entry/exit). */
  entryOrExit: boolean;
}

export interface DecompositionResult {
  metricKind: MetricKind;
  /** Aggregate metric value in window 0 (volume-weighted). */
  m0: number;
  /** Aggregate metric value in window 1. */
  m1: number;
  /** Total delta M1 - M0, reconstructed from segments (identity-checked). */
  deltaTotal: number;
  /** Sum of all mix contributions across segments. */
  mixTotal: number;
  /** Sum of all rate contributions. */
  rateTotal: number;
  /** Sum of all interaction contributions. */
  interactionTotal: number;
  /** mixTotal as a signed fraction of deltaTotal (NaN-guarded). */
  mixShareOfDelta: number;
  /** rateTotal as a signed fraction of deltaTotal. */
  rateShareOfDelta: number;
  /** interactionTotal as a signed fraction of deltaTotal. */
  interactionShareOfDelta: number;
  /** Per-segment breakdown, sorted by |rate| descending. */
  segments: SegmentContribution[];
  /** Residual of the exact identity check; should be ~0. Surfaced for safety. */
  identityResidual: number;
  /**
   * Reconstructed aggregate vs the caller-supplied true aggregate, per window.
   * null when no `observed` was passed. A non-zero value means the segments
   * don't cover the population — deltaTotal understates the real move.
   */
  coverageResidual: { m0: number | null; m1: number | null } | null;
}

/** A single ranked segment for the percentile heuristic (non-additive). */
export interface PercentileRank {
  key: string;
  count1: number;
  deltaMetric: number;
  /** deltaMetric * count1 — a ranking score only, NOT a contribution. */
  score: number;
}

/** One confirmed driver, after the agent's falsification step. */
export interface Driver {
  dimension: string;
  segmentKey: string;
  /** Signed contribution to the delta (typically the rate contribution). */
  contribution: number;
  kind: "rate" | "mix";
}

/** Accounting of how much of the delta is explained so far. */
export interface ExplainedAccounting {
  deltaTotal: number;
  explainedSigned: number;
  /** |explainedSigned| / |deltaTotal|, clamped to [0,1]. NaN-guarded. */
  explainedShare: number;
  /** Signed leftover: deltaTotal - explainedSigned. */
  residual: number;
  /** 1 - explainedShare, in [0,1] — consistent with the clamped explainedShare. */
  residualShare: number;
  /**
   * True when drivers explain MORE than the delta (|explainedSigned| >
   * |deltaTotal|). Usually a sign of double-counting overlapping drivers from
   * correlated dimensions — accumulate one orthogonal dimension at a time.
   */
  overshoot: boolean;
}

export type LoopDecision =
  | "conclude"
  | "gather"
  | "stop_no_progress"
  | "stop_budget";

export interface LoopVerdict {
  decision: LoopDecision;
  reason: string;
}

/** The findings contract — produced by Conclude, consumed by the Digest. */
export interface Finding {
  metric: string;
  metricKind: MetricKind;
  statistic: string;
  windowBaseline: { start: string; end: string };
  windowCurrent: { start: string; end: string };
  deltaAbsolute: number;
  deltaRelative: number;
  onset: string | null;
  primaryDriver: Driver | null;
  drivers: Driver[];
  mixVsRate: "mostly_rate" | "mostly_mix" | "mixed";
  confidence: "high" | "medium" | "low";
  explainedShare: number;
  residualShare: number;
  aggregateFingerprint: Record<string, unknown> | null;
  notDeterminable: string[];
  recommendedAction: string | null;
}

export interface RcaFindings {
  schemaVersion: "1.0";
  generatedAt: string;
  licenseKey: string;
  finding: Finding;
}
