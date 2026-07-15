import { describe, it, expect } from "vitest";
import { pareto } from "./pareto.js";

describe("pareto", () => {
  it("ranks entries by value descending and computes cumulative share", () => {
    const r = pareto({
      entries: [
        { key: "B", value: 200 },
        { key: "A", value: 500 },
        { key: "C", value: 100 },
        { key: "D", value: 50 },
      ],
    });
    expect(r.entries.map((e) => e.key)).toEqual(["A", "B", "C", "D"]);
    expect(r.entries.map((e) => e.rank)).toEqual([1, 2, 3, 4]);
    expect(r.total).toBe(850);
    expect(r.entries[0].share).toBeCloseTo(500 / 850, 6);
    expect(r.entries[3].cumulative).toBeCloseTo(1.0, 6);
  });

  it("reports a small headCount when one entry dominates", () => {
    const r = pareto({
      entries: [
        { key: "A", value: 900 },
        { key: "B", value: 50 },
        { key: "C", value: 50 },
      ],
    });
    expect(r.headCount).toBe(1);
    expect(r.entries[0].cumulative).toBeCloseTo(0.9, 6);
  });

  it("reports a head close to ceil(threshold * N) on uniform input", () => {
    // 10 entries, all equal. 80% needs at least 8 entries.
    const r = pareto({
      entries: Array.from({ length: 10 }, (_, i) => ({
        key: `k${i}`,
        value: 100,
      })),
    });
    expect(r.headCount).toBe(8);
  });

  it("returns zeros on empty input", () => {
    const r = pareto({ entries: [] });
    expect(r.total).toBe(0);
    expect(r.entries).toEqual([]);
    expect(r.headCount).toBe(0);
    expect(r.topN.share).toBe(0);
  });

  it("honors topN override", () => {
    const r = pareto({
      entries: [
        { key: "A", value: 50 },
        { key: "B", value: 30 },
        { key: "C", value: 15 },
        { key: "D", value: 5 },
      ],
      topN: 2,
    });
    expect(r.topN.count).toBe(2);
    expect(r.topN.share).toBeCloseTo(0.8, 6);
  });

  it("honors threshold override", () => {
    const r = pareto({
      entries: [
        { key: "A", value: 50 },
        { key: "B", value: 25 },
        { key: "C", value: 15 },
        { key: "D", value: 10 },
      ],
      threshold: 0.5,
    });
    // First entry alone clears 50%.
    expect(r.headCount).toBe(1);
  });

  it("breaks ties by preserving input order", () => {
    const r = pareto({
      entries: [
        { key: "first", value: 100 },
        { key: "second", value: 100 },
        { key: "third", value: 100 },
      ],
    });
    expect(r.entries.map((e) => e.key)).toEqual(["first", "second", "third"]);
  });

  it("preserves zero-value entries (rank, but no headCount contribution)", () => {
    const r = pareto({
      entries: [
        { key: "A", value: 100 },
        { key: "B", value: 0 },
      ],
    });
    expect(r.entries[1].share).toBe(0);
    expect(r.entries[1].cumulative).toBeCloseTo(1.0, 6);
    expect(r.headCount).toBe(1);
  });

  it("throws on negative value", () => {
    expect(() =>
      pareto({ entries: [{ key: "A", value: -1 }] }),
    ).toThrow(/value must be a finite non-negative number/);
  });

  it("throws on invalid topN or threshold", () => {
    expect(() => pareto({ entries: [], topN: 0 })).toThrow(/topN must be >= 1/);
    expect(() => pareto({ entries: [], threshold: 0 })).toThrow(/threshold/);
    expect(() => pareto({ entries: [], threshold: 1.5 })).toThrow(/threshold/);
  });
});
