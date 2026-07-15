/**
 * funnel.ts — build the ad funnel and detect SSAI / quartile-beacon gaps.
 *
 * Input: six canonical stages in order, optionally with side-branch totals.
 * Output: per-stage drop-offs, completion/start rate, and a flag the agent
 * uses to know when the quartile beacons can't be trusted.
 *
 * The script does not interpret beyond the threshold — `quartileBeaconsMissing`
 * is true if Q1/Q2/Q3 are all near zero while completions are non-trivial. The
 * agent decides what to say about it.
 */

import type {
  FunnelInput,
  FunnelResult,
  FunnelStage,
  FunnelStageName,
} from "./types.js";

const CANONICAL_STAGES: FunnelStageName[] = [
  "impressions",
  "starts",
  "q1",
  "midpoint",
  "q3",
  "completions",
];

/**
 * A funnel stage is considered "missing" when its count is below this fraction
 * of impressions. The default catches the SSAI signature (quartile beacons
 * not fired at all) while not false-positiving on tiny but real beacon counts.
 */
const DEFAULT_BEACON_MISSING_RATIO = 0.01;

/** Completions must be at least this share of impressions to judge SSAI. */
const COMPLETIONS_MEANINGFUL_RATIO = 0.01;

export function buildFunnel(input: FunnelInput): FunnelResult {
  if (!input.stages || input.stages.length !== CANONICAL_STAGES.length) {
    throw new Error(
      `expected exactly ${CANONICAL_STAGES.length} stages in canonical order: [${CANONICAL_STAGES.join(", ")}]`,
    );
  }
  for (let i = 0; i < CANONICAL_STAGES.length; i++) {
    const got = input.stages[i];
    if (got.name !== CANONICAL_STAGES[i]) {
      throw new Error(
        `stage ${i}: expected '${CANONICAL_STAGES[i]}', got '${got.name}'`,
      );
    }
    if (!Number.isFinite(got.count) || got.count < 0) {
      throw new Error(
        `stage '${got.name}': count must be a finite non-negative number, got ${got.count}`,
      );
    }
  }

  const impressions = input.stages[0].count;

  const stages: FunnelStage[] = input.stages.map((s, i, arr) => {
    const share = impressions > 0 ? s.count / impressions : 0;
    if (i === 0) {
      return {
        name: s.name,
        count: s.count,
        share,
        dropFromPrev: null,
        dropRateFromPrev: null,
      };
    }
    const prevCount = arr[i - 1].count;
    const dropFromPrev = prevCount - s.count;
    const dropRateFromPrev = prevCount > 0 ? dropFromPrev / prevCount : null;
    return { name: s.name, count: s.count, share, dropFromPrev, dropRateFromPrev };
  });

  const starts = stages[1].count;
  const q1 = stages[2].count;
  const midpoint = stages[3].count;
  const q3 = stages[4].count;
  const completions = stages[5].count;

  const completionRate = impressions > 0 ? completions / impressions : null;
  const startRate = impressions > 0 ? starts / impressions : null;

  const beaconMissingRatio = input.beaconMissingRatio ?? DEFAULT_BEACON_MISSING_RATIO;
  const completionsMeaningful =
    impressions > 0 && completions >= impressions * COMPLETIONS_MEANINGFUL_RATIO;
  const threshold = impressions * beaconMissingRatio;
  const allQuartilesMissing =
    q1 < threshold && midpoint < threshold && q3 < threshold;
  const quartileBeaconsMissing = completionsMeaningful && allQuartilesMissing;

  const clicks = input.clicks ?? null;
  const skips = input.skips ?? null;
  const clickThroughRate =
    clicks != null && clicks > 0 && impressions > 0
      ? clicks / impressions
      : null;
  const skipRate =
    skips != null && impressions > 0 ? skips / impressions : null;

  return {
    stages,
    completionRate,
    startRate,
    quartileBeaconsMissing,
    clicks,
    skips,
    clickThroughRate,
    skipRate,
  };
}
