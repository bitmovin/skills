import { describe, it, expect } from "vitest";
import { anomalyFlags } from "./anomaly-flags.js";
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

const cleanFunnel = buildFunnel({
  // 2% impr→start drop, 1% per quartile, 1% Q3→complete: well within defaults.
  stages: stages([100_000, 98_000, 97_000, 96_000, 95_000, 94_000]),
});

describe("anomalyFlags", () => {
  it("returns no flags on a clean funnel", () => {
    const r = anomalyFlags({ funnel: cleanFunnel });
    expect(r.flags).toEqual([]);
    expect(r.thresholdsApplied.impressionToStartDrop).toBe(0.08);
  });

  it("flags impression→start drop above threshold", () => {
    const f = buildFunnel({
      stages: stages([100_000, 85_000, 84_000, 83_000, 82_000, 81_000]),
    });
    const r = anomalyFlags({ funnel: f });
    const flag = r.flags.find((x) => x.id === "impression-to-start-drop");
    expect(flag).toBeDefined();
    expect(flag!.severity).toBe("warn");
    expect(flag!.detail.observed).toBeCloseTo(0.15, 6);
  });

  it("flags Q3→completion drop, but suppresses it when quartileBeaconsMissing", () => {
    const f1 = buildFunnel({
      stages: stages([100_000, 98_000, 97_000, 96_000, 95_000, 50_000]),
    });
    const r1 = anomalyFlags({ funnel: f1 });
    expect(r1.flags.some((x) => x.id === "q3-to-completion-drop")).toBe(true);

    // SSAI: Q1/Q2/Q3 = 0, completions present. Quartile flags must be suppressed.
    const f2 = buildFunnel({
      stages: stages([100_000, 98_000, 0, 0, 0, 50_000]),
    });
    expect(f2.quartileBeaconsMissing).toBe(true);
    const r2 = anomalyFlags({ funnel: f2 });
    expect(r2.flags.some((x) => x.id === "start-to-q1-drop")).toBe(false);
    expect(r2.flags.some((x) => x.id === "q3-to-completion-drop")).toBe(false);
  });

  it("flags low completion rate as high severity", () => {
    const f = buildFunnel({
      // 30% completion rate.
      stages: stages([100_000, 60_000, 50_000, 40_000, 35_000, 30_000]),
    });
    const r = anomalyFlags({ funnel: f });
    const flag = r.flags.find((x) => x.id === "low-completion-rate");
    expect(flag).toBeDefined();
    expect(flag!.severity).toBe("high");
  });

  it("flags top error code concentration with the slice attached", () => {
    const r = anomalyFlags({
      funnel: cleanFunnel,
      errors: { topCodeShare: 0.42, topCode: "30021" },
    });
    const flag = r.flags.find((x) => x.id === "top-error-code-share");
    expect(flag).toBeDefined();
    expect(flag!.detail.slice).toBe("30021");
  });

  it("flags top advertiser concentration as info", () => {
    const r = anomalyFlags({
      funnel: cleanFunnel,
      concentration: { topAdvertiserShare: 0.6, topAdvertiser: "AcmeCorp" },
    });
    const flag = r.flags.find((x) => x.id === "top-advertiser-share");
    expect(flag).toBeDefined();
    expect(flag!.severity).toBe("info");
    expect(flag!.detail.slice).toBe("AcmeCorp");
  });

  it("flags slow ad startup p95", () => {
    const r = anomalyFlags({
      funnel: cleanFunnel,
      latency: { p95Ms: 2500 },
    });
    const flag = r.flags.find((x) => x.id === "ad-startup-p95-high");
    expect(flag).toBeDefined();
    expect(flag!.detail.observed).toBe(2500);
  });

  it("honors threshold overrides", () => {
    // Strict threshold: 0.5% impression→start drop.
    const f = buildFunnel({
      stages: stages([100_000, 99_000, 98_000, 97_000, 96_000, 95_000]),
    });
    const r = anomalyFlags({
      funnel: f,
      thresholds: { impressionToStartDrop: 0.005 },
    });
    expect(r.flags.some((x) => x.id === "impression-to-start-drop")).toBe(true);
    expect(r.thresholdsApplied.impressionToStartDrop).toBe(0.005);
  });

  it("stacks multiple flags", () => {
    const f = buildFunnel({
      stages: stages([100_000, 70_000, 60_000, 55_000, 50_000, 30_000]),
    });
    const r = anomalyFlags({
      funnel: f,
      errors: { topCodeShare: 0.5, topCode: "30021" },
      concentration: { topAdvertiserShare: 0.7, topAdvertiser: "X" },
      latency: { p95Ms: 3000 },
    });
    expect(r.flags.length).toBeGreaterThanOrEqual(5);
    expect(new Set(r.flags.map((x) => x.id)).size).toBe(r.flags.length);
  });

  it("does not crash when all optional sections are absent", () => {
    expect(() => anomalyFlags({ funnel: cleanFunnel })).not.toThrow();
  });

  it("throws when funnel is missing", () => {
    // @ts-expect-error intentional missing param
    expect(() => anomalyFlags({})).toThrow(/funnel is required/);
  });
});
