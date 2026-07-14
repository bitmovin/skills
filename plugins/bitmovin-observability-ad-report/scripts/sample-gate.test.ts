import { describe, it, expect } from "vitest";
import { sampleSizeAdequate } from "./sample-gate.js";

describe("sampleSizeAdequate", () => {
  it("is adequate at default minN with sufficient volume", () => {
    const g = sampleSizeAdequate(5_000);
    expect(g.adequate).toBe(true);
    expect(g.reasons).toEqual([]);
  });

  it("fails below default minN", () => {
    const g = sampleSizeAdequate(500);
    expect(g.adequate).toBe(false);
    expect(g.reasons.join(" ")).toMatch(/below minN/);
  });

  it("honors minN override", () => {
    const g = sampleSizeAdequate(2_000, { minN: 10_000 });
    expect(g.adequate).toBe(false);
  });

  it("fails when event count is below minExpected", () => {
    const g = sampleSizeAdequate(50_000, { eventCount: 5, minExpected: 30 });
    expect(g.adequate).toBe(false);
    expect(g.reasons.join(" ")).toMatch(/event count/);
  });

  it("accepts event count when above minExpected", () => {
    const g = sampleSizeAdequate(50_000, { eventCount: 100 });
    expect(g.adequate).toBe(true);
  });

  it("stacks reasons when both gates fail", () => {
    const g = sampleSizeAdequate(100, { eventCount: 1 });
    expect(g.adequate).toBe(false);
    expect(g.reasons.length).toBe(2);
  });
});
