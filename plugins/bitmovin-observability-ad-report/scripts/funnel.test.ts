import { describe, it, expect } from "vitest";
import { buildFunnel } from "./funnel.js";
import type { FunnelInput, FunnelStageName } from "./types.js";

function stages(counts: number[]): FunnelInput["stages"] {
  const names: FunnelStageName[] = [
    "impressions",
    "starts",
    "q1",
    "midpoint",
    "q3",
    "completions",
  ];
  return names.map((name, i) => ({ name, count: counts[i] }));
}

describe("buildFunnel", () => {
  it("computes per-stage shares and drop-offs on a normal funnel", () => {
    const r = buildFunnel({
      stages: stages([100_000, 92_000, 85_000, 78_000, 72_000, 68_000]),
    });
    expect(r.stages.map((s) => s.share)).toEqual([
      1, 0.92, 0.85, 0.78, 0.72, 0.68,
    ]);
    expect(r.stages[0].dropFromPrev).toBeNull();
    expect(r.stages[1].dropFromPrev).toBe(8_000);
    expect(r.stages[1].dropRateFromPrev).toBeCloseTo(0.08, 6);
    expect(r.stages[5].dropFromPrev).toBe(4_000);
    expect(r.stages[5].dropRateFromPrev).toBeCloseTo(4_000 / 72_000, 6);
    expect(r.startRate).toBeCloseTo(0.92, 6);
    expect(r.completionRate).toBeCloseTo(0.68, 6);
    expect(r.quartileBeaconsMissing).toBe(false);
  });

  it("flags quartileBeaconsMissing on the SSAI signature", () => {
    // Quartile beacons not firing, but completions are clearly tracked.
    const r = buildFunnel({
      stages: stages([100_000, 92_000, 0, 0, 0, 68_000]),
    });
    expect(r.quartileBeaconsMissing).toBe(true);
    expect(r.completionRate).toBeCloseTo(0.68, 6);
  });

  it("does NOT flag SSAI when completions are also near zero", () => {
    // Funnel collapsed at start — not a beacon issue.
    const r = buildFunnel({
      stages: stages([100_000, 1_000, 0, 0, 0, 500]),
    });
    expect(r.quartileBeaconsMissing).toBe(false);
  });

  it("does NOT flag SSAI when at least one quartile has real volume", () => {
    const r = buildFunnel({
      stages: stages([100_000, 92_000, 0, 50_000, 0, 68_000]),
    });
    // Midpoint is clearly above the 1% threshold.
    expect(r.quartileBeaconsMissing).toBe(false);
  });

  it("returns null rates and zero shares when impressions = 0", () => {
    const r = buildFunnel({
      stages: stages([0, 0, 0, 0, 0, 0]),
    });
    expect(r.completionRate).toBeNull();
    expect(r.startRate).toBeNull();
    expect(r.stages.every((s) => s.share === 0)).toBe(true);
    expect(r.stages[1].dropRateFromPrev).toBeNull();
    expect(r.quartileBeaconsMissing).toBe(false);
  });

  it("includes clicks and CTR when clicks > 0", () => {
    const r = buildFunnel({
      stages: stages([100_000, 92_000, 85_000, 78_000, 72_000, 68_000]),
      clicks: 1_500,
      skips: 4_000,
    });
    expect(r.clicks).toBe(1_500);
    expect(r.clickThroughRate).toBeCloseTo(0.015, 6);
    expect(r.skips).toBe(4_000);
    expect(r.skipRate).toBeCloseTo(0.04, 6);
  });

  it("treats null clicks as 'not tracked' — CTR is null", () => {
    const r = buildFunnel({
      stages: stages([100_000, 92_000, 85_000, 78_000, 72_000, 68_000]),
      clicks: null,
    });
    expect(r.clicks).toBeNull();
    expect(r.clickThroughRate).toBeNull();
  });

  it("treats clicks = 0 as 'not tracked' — CTR is null (matches guard)", () => {
    const r = buildFunnel({
      stages: stages([100_000, 92_000, 85_000, 78_000, 72_000, 68_000]),
      clicks: 0,
    });
    expect(r.clicks).toBe(0);
    expect(r.clickThroughRate).toBeNull();
  });

  it("throws on wrong stage count", () => {
    expect(() =>
      buildFunnel({
        stages: [
          { name: "impressions", count: 100 },
          { name: "starts", count: 90 },
        ],
      }),
    ).toThrow(/expected exactly 6 stages/);
  });

  it("throws on wrong stage order", () => {
    expect(() =>
      buildFunnel({
        stages: [
          { name: "impressions", count: 100 },
          { name: "q1", count: 90 },
          { name: "starts", count: 92 },
          { name: "midpoint", count: 78 },
          { name: "q3", count: 72 },
          { name: "completions", count: 68 },
        ],
      }),
    ).toThrow(/stage 1: expected 'starts'/);
  });

  it("throws on negative count", () => {
    expect(() =>
      buildFunnel({
        stages: stages([100, 90, 80, 70, -1, 50]),
      }),
    ).toThrow(/must be a finite non-negative number/);
  });

  it("permits later stage > earlier stage (negative drop) without crashing", () => {
    // Real data can have this due to beacon-timing skew. The script reports
    // the negative drop honestly rather than masking it.
    const r = buildFunnel({
      stages: stages([100_000, 92_000, 85_000, 78_000, 72_000, 75_000]),
    });
    expect(r.stages[5].dropFromPrev).toBe(-3_000);
    expect(r.stages[5].dropRateFromPrev).toBeLessThan(0);
  });
});
