/**
 * accounting.ts — contribution accounting and loop control.
 *
 * Two jobs the agent must NOT do in its head, because the loop's control flow
 * depends on the numbers being right:
 *
 *  1. accumulate(): how much of the delta the confirmed drivers explain so far.
 *     If the model miscounts "we've explained 60%", the loop terminates wrong —
 *     either stopping early on an unexplained delta or grinding past a clean
 *     answer.
 *
 *  2. loopDecision(): the Reflect→Gather / Reflect→Conclude branch, plus the
 *     two stop guards. The loop converges on success (explained ≥ target),
 *     stops on a lap budget, and — critically — stops on NO PROGRESS so it
 *     can't spin: if a Reflect pass didn't increase the explained fraction,
 *     report the residual honestly instead of looping again. Terminate on
 *     diminishing returns, not only on success.
 *
 * Only "rate" drivers count toward the explained fraction by default: a mix
 * driver means the delta was a composition shift, which is itself the finding —
 * there is no further per-segment regression to explain.
 */

import type { Driver, ExplainedAccounting, LoopVerdict } from "./types.js";

const EPS = 1e-9;

export function accumulate(
  deltaTotal: number,
  drivers: Driver[],
  opts: { countMixDrivers?: boolean } = {},
): ExplainedAccounting {
  const { countMixDrivers = false } = opts;
  const counted = drivers.filter(
    (d) => countMixDrivers || d.kind === "rate",
  );
  const explainedSigned = counted.reduce((a, d) => a + d.contribution, 0);
  const residual = deltaTotal - explainedSigned;
  const degenerate = Math.abs(deltaTotal) < EPS;
  const rawShare = degenerate
    ? 0
    : Math.abs(explainedSigned) / Math.abs(deltaTotal);
  const explainedShare = Math.min(1, rawShare);
  // residualShare stays consistent with the clamped explainedShare (they sum to
  // 1); overshoot, not a >1 residual, is how we flag drivers exceeding the delta.
  const residualShare = degenerate ? 0 : 1 - explainedShare;
  const overshoot = !degenerate && rawShare > 1 + EPS;
  return {
    deltaTotal,
    explainedSigned,
    explainedShare,
    residual,
    residualShare,
    overshoot,
  };
}

export interface LoopState {
  /** Current explained fraction in [0,1]. */
  explainedShare: number;
  /** Explained fraction at the end of the previous lap (0 on first lap). */
  prevExplainedShare: number;
  /** 1-based lap counter. */
  lap: number;
  /** Hard cap on laps. */
  maxLaps: number;
  /** Target explained fraction to declare success, e.g. 0.8. */
  target: number;
  /** Minimum lap-over-lap improvement to justify another lap, e.g. 0.05. */
  minImprovement: number;
  /** True only after the candidate driver passed the falsification step. */
  falsificationPassed: boolean;
}

export function loopDecision(s: LoopState): LoopVerdict {
  if (s.explainedShare >= s.target && s.falsificationPassed) {
    return {
      decision: "conclude",
      reason: `explained ${(s.explainedShare * 100).toFixed(0)}% ≥ target ` +
        `${(s.target * 100).toFixed(0)}% and falsification passed`,
    };
  }
  if (s.lap >= s.maxLaps) {
    return {
      decision: "stop_budget",
      reason: `lap budget reached (${s.lap}/${s.maxLaps}); ` +
        `report residual ${((1 - s.explainedShare) * 100).toFixed(0)}%`,
    };
  }
  const improvement = s.explainedShare - s.prevExplainedShare;
  if (s.lap > 1 && improvement < s.minImprovement) {
    return {
      decision: "stop_no_progress",
      reason: `improvement ${(improvement * 100).toFixed(1)}% below ` +
        `${(s.minImprovement * 100).toFixed(0)}%; diminishing returns`,
    };
  }
  return {
    decision: "gather",
    reason: s.falsificationPassed
      ? `explained ${(s.explainedShare * 100).toFixed(0)}% < target; ` +
        `go deeper or find the next driver`
      : `candidate not yet falsified; gather to confirm or refute`,
  };
}
