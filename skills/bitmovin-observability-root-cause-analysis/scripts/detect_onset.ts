/**
 * detect_onset.ts — lightweight change-point / onset detection.
 *
 * With `getReleaseTimeline` unavailable, the skill has no authoritative feed of
 * "what changed when." This script recovers the ONSET TIMING from the metric's
 * own time series so the agent can (a) decide whether a move is a real level
 * shift vs same-weekday noise, and (b) fix the before/after window boundary
 * that every downstream step depends on.
 *
 * Method: a robust, nonparametric Hampel-style detector. For each bucket we
 * compute the median and MAD (median absolute deviation) of a trailing window,
 * scale the MAD by 1.4826 so it estimates the standard deviation for roughly
 * normal data, and flag buckets that fall outside median ± k·σ̂. A single
 * out-of-band bucket is noise; an onset requires `persistence` consecutive
 * out-of-band buckets in the same direction — that is what separates a level
 * shift from a spike.
 *
 * This is deliberately the FLOOR, not the ceiling. It is a stand-in for the
 * conformal-band tooling, robust enough to be trustworthy and simple enough to
 * audit. It does not model weekly seasonality; for that, pass a series already
 * aligned to comparable buckets, or compare same-weekday lags upstream.
 */

const MAD_TO_SIGMA = 1.4826;
const EPS = 1e-9;

export interface Bucket {
  /** ISO timestamp or any sortable label for the bucket. */
  t: string;
  value: number;
}

export interface OnsetResult {
  /** True if a sustained level shift was found. */
  levelShift: boolean;
  /** Timestamp of the first bucket of the sustained shift, or null. */
  onset: string | null;
  /** Index into the input series of the onset bucket, or -1. */
  onsetIndex: number;
  direction: "up" | "down" | "none";
  /** Robust z-score of the onset bucket (how far outside the band). */
  onsetRobustZ: number;
}

function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function mad(xs: number[], med: number): number {
  if (xs.length === 0) return NaN;
  return median(xs.map((x) => Math.abs(x - med)));
}

/**
 * @param series      Ordered oldest→newest buckets.
 * @param trailing    Size of the trailing reference window. Default 14.
 * @param k           Band half-width in robust σ. Default 3.5 (conservative).
 * @param persistence Consecutive out-of-band buckets required. Default 3.
 */
export function detectOnset(
  series: Bucket[],
  trailing = 14,
  k = 3.5,
  persistence = 3,
): OnsetResult {
  const none: OnsetResult = {
    levelShift: false,
    onset: null,
    onsetIndex: -1,
    direction: "none",
    onsetRobustZ: 0,
  };
  if (series.length < trailing + persistence) return none;

  let runStart = -1;
  let runDir: "up" | "down" | "none" = "none";
  let runLen = 0;

  for (let i = trailing; i < series.length; i++) {
    const ref = series.slice(i - trailing, i).map((b) => b.value);
    const med = median(ref);
    const sigma = mad(ref, med) * MAD_TO_SIGMA;
    const v = series[i].value;

    // Degenerate flat reference (sigma 0): fall back to a tiny relative band
    // so identical-valued history doesn't make every wiggle "significant".
    const band = sigma > EPS ? k * sigma : Math.abs(med) * 1e-3 + EPS;
    const dev = v - med;
    const dir: "up" | "down" | "none" =
      dev > band ? "up" : dev < -band ? "down" : "none";

    if (dir !== "none") {
      if (dir === runDir) {
        runLen += 1;
      } else {
        runDir = dir;
        runStart = i;
        runLen = 1;
      }
      if (runLen >= persistence) {
        const onsetIdx = runStart;
        const refAtOnset = series
          .slice(onsetIdx - trailing, onsetIdx)
          .map((b) => b.value);
        const medAt = median(refAtOnset);
        const sigAt = mad(refAtOnset, medAt) * MAD_TO_SIGMA;
        const robustZ =
          sigAt > EPS ? (series[onsetIdx].value - medAt) / sigAt : Infinity;
        return {
          levelShift: true,
          onset: series[onsetIdx].t,
          onsetIndex: onsetIdx,
          direction: runDir,
          onsetRobustZ: robustZ,
        };
      }
    } else {
      runDir = "none";
      runStart = -1;
      runLen = 0;
    }
  }
  return none;
}
