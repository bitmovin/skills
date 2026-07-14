/**
 * sample-gate.ts — minimum-volume gate for a slice.
 *
 * Vendored verbatim from the QoE RCA skill (`scripts/significance.ts`). Kept
 * as a standalone file here so this skill doesn't depend on the other skill's
 * package being installed.
 *
 * Use this BEFORE declaring any per-advertiser / per-ad-system / per-error-code
 * "offender" in the report — thin slices swing wildly and should not be named.
 * Apply the gate per slice, not on the aggregate. `minN` guards raw volume;
 * `minExpected` guards that the rarer outcome (e.g. error events) is observed
 * enough times for downstream comparisons to be stable.
 */

import type { SampleGate } from "./types.js";

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
