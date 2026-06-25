/**
 * decompose.ts — two-window shift-share (mix / rate / interaction) decomposition.
 *
 * The load-bearing calculation of the RCA skill: a sum over many segments that
 * decides whether a delta is a RATE change (segments got worse) or a MIX shift
 * (traffic moved toward already-worse segments) — opposite remediations.
 *
 * The math, for an aggregate metric M = Σ wₛ·mₛ (wₛ = volume share, Σwₛ = 1):
 *
 *   ΔM = Σ (Δwₛ)·m0ₛ        ← mix  (composition moved, rates held at baseline)
 *      + Σ w0ₛ·(Δmₛ)        ← rate (segments changed, shares held at baseline)
 *      + Σ (Δwₛ)·(Δmₛ)      ← interaction
 *
 * This is an EXACT identity: the three terms sum to M1 - M0. The function
 * verifies that and surfaces the residual.
 *
 * Validity by metric kind:
 *   - "ratio" / "mean": exact and additive. Use decompose().
 *   - "percentile": NOT additive (a p95 of the whole ≠ weighted sum of segment
 *     p95s). decompose() refuses these. Use rankPercentileHeuristic() instead,
 *     which only RANKS suspects and must be reported as a heuristic, not a
 *     contribution breakdown.
 *
 * Entry/exit convention: a segment present in only one window (a new CDN, a
 * retired player version) has no baseline rate to "regress" from, so its whole
 * effect is attributed to mix. Concretely, the absent-window metric is set
 * equal to the present-window metric, making Δmₛ = 0 (zero rate, zero
 * interaction) and pushing Δwₛ·mₛ entirely into the mix term. This both
 * preserves the exact identity and is the correct reading: new bad traffic
 * arriving is a composition change at this granularity, not a rate regression.
 */

import type {
  DecompositionResult,
  MetricKind,
  PercentileRank,
  SegmentContribution,
  SegmentObservation,
} from "./types.js";

const EPS = 1e-9;

/** Signed share of a part in a total, guarded against a ~zero denominator. */
function safeShare(part: number, total: number): number {
  if (Math.abs(total) < EPS) return NaN;
  return part / total;
}

export function decompose(
  segments: SegmentObservation[],
  metricKind: MetricKind,
  observed?: { m0?: number; m1?: number },
): DecompositionResult {
  if (metricKind === "percentile") {
    throw new Error(
      "decompose() is not valid for percentile metrics (non-additive). " +
        "Use rankPercentileHeuristic() and report it as a heuristic ranking.",
    );
  }
  if (segments.length === 0) {
    throw new Error("decompose() requires at least one segment.");
  }

  const totalCount0 = segments.reduce((a, s) => a + s.count0, 0);
  const totalCount1 = segments.reduce((a, s) => a + s.count1, 0);
  if (totalCount0 < EPS || totalCount1 < EPS) {
    throw new Error(
      "decompose() requires positive total volume in both windows.",
    );
  }

  const contributions: SegmentContribution[] = [];
  let mixTotal = 0;
  let rateTotal = 0;
  let interactionTotal = 0;

  for (const s of segments) {
    if (
      !Number.isFinite(s.count0) ||
      !Number.isFinite(s.count1) ||
      s.count0 < 0 ||
      s.count1 < 0
    ) {
      throw new Error(`Segment "${s.key}" has invalid counts.`);
    }
    const present0 = s.count0 > 0;
    const present1 = s.count1 > 0;
    if (!present0 && !present1) continue; // nothing to attribute

    const share0 = s.count0 / totalCount0;
    const share1 = s.count1 / totalCount1;

    // Resolve effective metric values, applying the entry/exit convention.
    let m0: number;
    let m1: number;
    if (present0 && present1) {
      if (s.metric0 === null || s.metric1 === null) {
        throw new Error(
          `Segment "${s.key}" has volume in both windows but a null metric.`,
        );
      }
      m0 = s.metric0;
      m1 = s.metric1;
    } else if (present1) {
      // Entered in window 1: no baseline rate → all effect to mix.
      if (s.metric1 === null) {
        throw new Error(`Entering segment "${s.key}" has a null metric1.`);
      }
      m1 = s.metric1;
      m0 = s.metric1; // Δm = 0
    } else {
      // Exited after window 0: no current rate → all effect to mix.
      if (s.metric0 === null) {
        throw new Error(`Exiting segment "${s.key}" has a null metric0.`);
      }
      m0 = s.metric0;
      m1 = s.metric0; // Δm = 0
    }

    const dShare = share1 - share0;
    const dMetric = m1 - m0;

    const mix = dShare * m0;
    const rate = share0 * dMetric;
    const interaction = dShare * dMetric;
    const total = mix + rate + interaction;

    mixTotal += mix;
    rateTotal += rate;
    interactionTotal += interaction;

    contributions.push({
      key: s.key,
      share0,
      share1,
      metric0: m0,
      metric1: m1,
      mix,
      rate,
      interaction,
      total,
      entryOrExit: !(present0 && present1),
    });
  }

  const m0Agg = contributions.reduce((a, c) => a + c.share0 * c.metric0, 0);
  const m1Agg = contributions.reduce((a, c) => a + c.share1 * c.metric1, 0);
  const deltaTotal = m1Agg - m0Agg;
  const termSum = mixTotal + rateTotal + interactionTotal;
  const identityResidual = deltaTotal - termSum;

  // Rank by who CAUSED it: largest absolute rate contribution first.
  contributions.sort((a, b) => Math.abs(b.rate) - Math.abs(a.rate));

  // Coverage check: do the supplied segments reconstruct the TRUE aggregate?
  // identityResidual only proves the terms are internally consistent; it cannot
  // catch missing segments. A large coverageResidual means the segments don't
  // cover the population, so deltaTotal understates the real move.
  const coverageResidual =
    observed === undefined
      ? null
      : {
          m0: observed.m0 === undefined ? null : observed.m0 - m0Agg,
          m1: observed.m1 === undefined ? null : observed.m1 - m1Agg,
        };

  return {
    metricKind,
    m0: m0Agg,
    m1: m1Agg,
    deltaTotal,
    mixTotal,
    rateTotal,
    interactionTotal,
    mixShareOfDelta: safeShare(mixTotal, deltaTotal),
    rateShareOfDelta: safeShare(rateTotal, deltaTotal),
    interactionShareOfDelta: safeShare(interactionTotal, deltaTotal),
    segments: contributions,
    identityResidual,
    coverageResidual,
  };
}

/**
 * Percentile metrics can't be decomposed additively. This ranks candidate
 * segments by (change in the segment's percentile) × (current volume) so the
 * agent has a defensible place to look first. The score is a RANKING SIGNAL
 * ONLY — it does not sum to ΔM and must not be reported as a contribution.
 */
export function rankPercentileHeuristic(
  segments: SegmentObservation[],
): PercentileRank[] {
  const ranked: PercentileRank[] = [];
  for (const s of segments) {
    if (s.count1 <= 0 || s.metric0 === null || s.metric1 === null) continue;
    const deltaMetric = s.metric1 - s.metric0;
    ranked.push({
      key: s.key,
      count1: s.count1,
      deltaMetric,
      score: deltaMetric * s.count1,
    });
  }
  ranked.sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
  return ranked;
}
