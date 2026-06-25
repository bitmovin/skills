/**
 * significance.ts — significance and sample-size gating.
 *
 * This is what stops the agent chasing noise. Thin slices swing wildly; a
 * dramatic-looking move on a low-volume segment is often nothing. The model
 * approximates these tests badly in-head, so they live here as audited code.
 *
 * Coverage:
 *   - twoProportionZTest: for COUNT/COUNT proportions only — error rate,
 *     video-start-failure rate, % of sessions that rebuffered. NOT for duration
 *     ratios like buffering-time/view-time: those aren't binomial trials, so the
 *     pooled-proportion SE is wrong. Treat a duration ratio as a mean (welch) or
 *     judge it by effect size, and flag the limitation.
 *   - wilsonInterval: a well-behaved CI for a single proportion (better than
 *     the normal approximation at small n or extreme p).
 *   - welchTTest: for mean metrics (e.g. startup time) WHEN the query returns a
 *     standard deviation. If only count+mean are available, you cannot test the
 *     mean from aggregates — fall back to sampleSizeAdequate + an effect-size
 *     judgment and flag the limitation.
 *   - sampleSizeAdequate: the cheap gate to run BEFORE any of the above.
 *
 * Dependency-free: the normal CDF uses an erf approximation; the Welch p-value
 * uses a normal approximation, which is accurate at the large df typical of
 * analytics volumes. Small samples are excluded by the sample-size gate first,
 * so the approximation is not load-bearing where it would be weakest.
 */

/** Abramowitz & Stegun 7.1.26 erf approximation; |error| < 1.5e-7. */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t -
      0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

/** Standard normal CDF. */
function normCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/** Two-sided p-value from a z statistic. */
function twoSidedP(z: number): number {
  return 2 * (1 - normCdf(Math.abs(z)));
}

export interface SampleGate {
  adequate: boolean;
  reasons: string[];
}

/**
 * Gate a segment before testing it. `minN` guards raw volume; `minExpected`
 * guards that the rarer outcome (e.g. rebuffer events) is observed enough times
 * for the normal approximation to hold.
 */
export function sampleSizeAdequate(
  n: number,
  opts: { minN?: number; eventCount?: number; minExpected?: number } = {},
): SampleGate {
  const { minN = 1000, eventCount, minExpected = 30 } = opts;
  const reasons: string[] = [];
  if (n < minN) reasons.push(`n=${n} below minN=${minN}`);
  if (eventCount !== undefined && eventCount < minExpected) {
    reasons.push(`event count=${eventCount} below minExpected=${minExpected}`);
  }
  return { adequate: reasons.length === 0, reasons };
}

export interface ProportionTest {
  p0: number;
  p1: number;
  diff: number;
  z: number;
  pValue: number;
  significant: boolean;
  /** 95% CI on (p1 - p0). */
  diffCi95: [number, number];
}

/**
 * Two-proportion z-test. x = successes (events), n = trials (impressions).
 * @param alpha significance level, default 0.05.
 */
export function twoProportionZTest(
  x0: number,
  n0: number,
  x1: number,
  n1: number,
  alpha = 0.05,
): ProportionTest {
  if (n0 <= 0 || n1 <= 0) throw new Error("twoProportionZTest needs n>0.");
  const p0 = x0 / n0;
  const p1 = x1 / n1;
  const pPool = (x0 + x1) / (n0 + n1);
  const sePool = Math.sqrt(pPool * (1 - pPool) * (1 / n0 + 1 / n1));
  const z = sePool < 1e-12 ? 0 : (p1 - p0) / sePool;
  const pValue = twoSidedP(z);
  // Unpooled SE for the CI on the difference.
  const seDiff = Math.sqrt(
    (p0 * (1 - p0)) / n0 + (p1 * (1 - p1)) / n1,
  );
  const zCrit = 1.959963984540054; // ~ z_{0.975}
  const diff = p1 - p0;
  return {
    p0,
    p1,
    diff,
    z,
    pValue,
    significant: pValue < alpha,
    diffCi95: [diff - zCrit * seDiff, diff + zCrit * seDiff],
  };
}

/** Wilson score interval for a single proportion. Default 95%. */
export function wilsonInterval(
  x: number,
  n: number,
  z = 1.959963984540054,
): [number, number] {
  if (n <= 0) throw new Error("wilsonInterval needs n>0.");
  const p = x / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half =
    (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

export interface MeanTest {
  mean0: number;
  mean1: number;
  diff: number;
  t: number;
  /** Welch–Satterthwaite degrees of freedom. */
  df: number;
  pValue: number;
  significant: boolean;
}

/**
 * Welch's t-test for two means with unequal variance. Requires per-window
 * standard deviations. p-value uses a normal approximation (accurate at the
 * large df of analytics volumes).
 */
export function welchTTest(
  mean0: number,
  sd0: number,
  n0: number,
  mean1: number,
  sd1: number,
  n1: number,
  alpha = 0.05,
): MeanTest {
  if (n0 < 2 || n1 < 2) throw new Error("welchTTest needs n>=2 per window.");
  const v0 = (sd0 * sd0) / n0;
  const v1 = (sd1 * sd1) / n1;
  const se = Math.sqrt(v0 + v1);
  const diff = mean1 - mean0;
  const t = se < 1e-12 ? 0 : diff / se;
  const df =
    se < 1e-12
      ? n0 + n1 - 2
      : (v0 + v1) ** 2 /
        ((v0 * v0) / (n0 - 1) + (v1 * v1) / (n1 - 1));
  const pValue = twoSidedP(t); // normal approx
  return { mean0, mean1, diff, t, df, pValue, significant: pValue < alpha };
}

export const _internal = { erf, normCdf, twoSidedP };
