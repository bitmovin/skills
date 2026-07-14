/**
 * anomaly-flags.ts — apply ad-ops thresholds to a built funnel + side metrics.
 *
 * Defaults live below; callers can override any subset via `thresholds`.
 * Each flag is a fact: "metric X crossed threshold Y in this window." The
 * script never says "this is bad" or "this is a regression" — the agent
 * frames it for the audience.
 *
 * Quartile-stage flags (start→Q1, Q3→completion) are suppressed when the
 * funnel input has `quartileBeaconsMissing = true` — beacons we can't trust
 * cannot ground a flag.
 */

import type {
  AnomalyFlag,
  AnomalyFlagsInput,
  AnomalyFlagsResult,
  AnomalyThresholds,
  FunnelStage,
} from "./types.js";

const DEFAULTS: Required<AnomalyThresholds> = {
  impressionToStartDrop: 0.08,
  startToQ1Drop: 0.05,
  q3ToCompletionDrop: 0.05,
  completionRateMin: 0.5,
  topErrorCodeShare: 0.3,
  topAdvertiserShare: 0.5,
  adStartupP95Ms: 2000,
};

function findStage(stages: FunnelStage[], name: string): FunnelStage | undefined {
  return stages.find((s) => s.name === name);
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

export function anomalyFlags(input: AnomalyFlagsInput): AnomalyFlagsResult {
  const thresholds: Required<AnomalyThresholds> = {
    ...DEFAULTS,
    ...(input.thresholds ?? {}),
  };
  const flags: AnomalyFlag[] = [];

  const { funnel } = input;
  if (!funnel) {
    throw new Error("funnel is required");
  }

  // ── Funnel: impression → start ─────────────────────────────────────────────
  const starts = findStage(funnel.stages, "starts");
  if (starts?.dropRateFromPrev != null) {
    const observed = starts.dropRateFromPrev;
    if (observed > thresholds.impressionToStartDrop) {
      flags.push({
        id: "impression-to-start-drop",
        severity: "warn",
        message: `Impression→Start drop is ${pct(observed)} (threshold ${pct(thresholds.impressionToStartDrop)})`,
        detail: {
          observed,
          threshold: thresholds.impressionToStartDrop,
        },
      });
    }
  }

  // ── Funnel: start → Q1 ────────────────────────────────────────────────────
  if (!funnel.quartileBeaconsMissing) {
    const q1 = findStage(funnel.stages, "q1");
    if (q1?.dropRateFromPrev != null) {
      const observed = q1.dropRateFromPrev;
      if (observed > thresholds.startToQ1Drop) {
        flags.push({
          id: "start-to-q1-drop",
          severity: "warn",
          message: `Start→Q1 drop is ${pct(observed)} (threshold ${pct(thresholds.startToQ1Drop)})`,
          detail: {
            observed,
            threshold: thresholds.startToQ1Drop,
          },
        });
      }
    }
  }

  // ── Funnel: Q3 → completion ───────────────────────────────────────────────
  if (!funnel.quartileBeaconsMissing) {
    const completions = findStage(funnel.stages, "completions");
    if (completions?.dropRateFromPrev != null) {
      const observed = completions.dropRateFromPrev;
      if (observed > thresholds.q3ToCompletionDrop) {
        flags.push({
          id: "q3-to-completion-drop",
          severity: "warn",
          message: `Q3→Completion drop is ${pct(observed)} (threshold ${pct(thresholds.q3ToCompletionDrop)}) — usually a beacon issue, since Q3 viewers almost always complete`,
          detail: {
            observed,
            threshold: thresholds.q3ToCompletionDrop,
          },
        });
      }
    }
  }

  // ── Completion rate floor ─────────────────────────────────────────────────
  if (funnel.completionRate != null && funnel.completionRate < thresholds.completionRateMin) {
    flags.push({
      id: "low-completion-rate",
      severity: "high",
      message: `Completion rate is ${pct(funnel.completionRate)} (below ${pct(thresholds.completionRateMin)})`,
      detail: {
        observed: funnel.completionRate,
        threshold: thresholds.completionRateMin,
      },
    });
  }

  // ── Top error code share ──────────────────────────────────────────────────
  if (input.errors?.topCodeShare != null) {
    const observed = input.errors.topCodeShare;
    if (observed > thresholds.topErrorCodeShare) {
      flags.push({
        id: "top-error-code-share",
        severity: "warn",
        message: `Top error code accounts for ${pct(observed)} of ad errors (threshold ${pct(thresholds.topErrorCodeShare)})`,
        detail: {
          observed,
          threshold: thresholds.topErrorCodeShare,
          slice: input.errors.topCode ?? undefined,
        },
      });
    }
  }

  // ── Top advertiser share ──────────────────────────────────────────────────
  if (input.concentration?.topAdvertiserShare != null) {
    const observed = input.concentration.topAdvertiserShare;
    if (observed > thresholds.topAdvertiserShare) {
      flags.push({
        id: "top-advertiser-share",
        severity: "info",
        message: `Top advertiser accounts for ${pct(observed)} of completions (threshold ${pct(thresholds.topAdvertiserShare)})`,
        detail: {
          observed,
          threshold: thresholds.topAdvertiserShare,
          slice: input.concentration.topAdvertiser ?? undefined,
        },
      });
    }
  }

  // ── Ad startup p95 ────────────────────────────────────────────────────────
  if (input.latency?.p95Ms != null) {
    const observed = input.latency.p95Ms;
    if (observed > thresholds.adStartupP95Ms) {
      flags.push({
        id: "ad-startup-p95-high",
        severity: "warn",
        message: `Ad startup p95 is ${observed.toFixed(0)} ms (threshold ${thresholds.adStartupP95Ms} ms)`,
        detail: {
          observed,
          threshold: thresholds.adStartupP95Ms,
        },
      });
    }
  }

  return { flags, thresholdsApplied: thresholds };
}
