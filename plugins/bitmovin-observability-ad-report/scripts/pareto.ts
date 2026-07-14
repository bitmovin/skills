/**
 * pareto.ts — concentration analysis for a list of (key, value) entries.
 *
 * Input: any non-negative numeric series (e.g. advertisers by completion count,
 * error codes by session count, ad systems by error volume).
 * Output: ranked entries with running cumulative share, a top-N summary, and
 * the head count needed to cover a configurable share threshold (default 80%).
 *
 * A small headCount means inventory is concentrated in a few players; a large
 * one means it's diffuse. The script never says "this is good" or "this is
 * bad" — the agent reads the shape.
 */

import type { ParetoInput, ParetoResult, ParetoEntry } from "./types.js";

const DEFAULT_TOP_N = 5;
const DEFAULT_THRESHOLD = 0.8;

export function pareto(input: ParetoInput): ParetoResult {
  const topN = input.topN ?? DEFAULT_TOP_N;
  const threshold = input.threshold ?? DEFAULT_THRESHOLD;

  if (!Number.isFinite(topN) || topN < 1) {
    throw new Error(`topN must be >= 1, got ${topN}`);
  }
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
    throw new Error(`threshold must be in (0, 1], got ${threshold}`);
  }

  const raw = input.entries ?? [];
  for (const e of raw) {
    if (!Number.isFinite(e.value) || e.value < 0) {
      throw new Error(
        `entry '${e.key}': value must be a finite non-negative number, got ${e.value}`,
      );
    }
  }

  const total = raw.reduce((acc, e) => acc + e.value, 0);

  // Stable descending sort: index break-tie preserves input order for equal values.
  const sorted = raw
    .map((e, i) => ({ ...e, _i: i }))
    .sort((a, b) => (b.value - a.value) || (a._i - b._i));

  let cumulative = 0;
  const entries: ParetoEntry[] = sorted.map((e, i) => {
    const share = total > 0 ? e.value / total : 0;
    cumulative += share;
    return {
      key: e.key,
      value: e.value,
      share,
      cumulative,
      rank: i + 1,
    };
  });

  const topNShare = entries
    .slice(0, topN)
    .reduce((acc, e) => acc + e.share, 0);

  // Use raw value accumulation against threshold*total — avoids the floating-
  // point drift of summing many small shares (8 × 0.1 ≠ 0.8 in IEEE-754).
  let headCount = 0;
  if (total > 0) {
    const target = threshold * total;
    let cumValue = 0;
    for (const e of sorted) {
      cumValue += e.value;
      headCount++;
      if (cumValue >= target) break;
    }
  }

  return {
    total,
    entries,
    topN: { count: Math.min(topN, entries.length), share: topNShare },
    threshold,
    headCount,
  };
}
