# AdOpsReport contract (v1.0)

The structured object the ad-ops snapshot skill emits at **Report**. A neutral
record of what the analysis observed in one window — facts, flags, and
limitations — so a downstream consumer can render it for any audience without
re-deriving anything.

Types are defined in `scripts/types.ts` (`AdOpsReport`, `FunnelResult`,
`ParetoResult`, `AnomalyFlag`, etc.). This file is the prose spec and the
field-by-field contract.

## Top level: `AdOpsReport`

| Field             | Type                          | Meaning                                                                                   |
| ----------------- | ----------------------------- | ----------------------------------------------------------------------------------------- |
| `schemaVersion`   | `"1.0"`                       | Bump on any breaking change.                                                              |
| `generatedAt`     | ISO string                    | When the report ran.                                                                      |
| `licenseKey`      | string                        | The analyzed license.                                                                     |
| `mode`            | `"snapshot"`                  | Always `snapshot` in v1. Reserved for future modes (e.g. `investigation`).                |
| `window`          | `{start: string, end: string}` | Reporting window, ISO timestamps.                                                          |
| `cohort`          | object \| null                | The cohort filter applied to every pull (advertiser, ad system, country, etc.), or null. |
| `funnel`          | `FunnelResult`                | Stage counts and per-stage drop-offs.                                                     |
| `errors`          | `ErrorsSection`               | Error-code distribution and top offending ad systems / servers.                            |
| `concentration`   | `ConcentrationSection`        | Top advertisers / ad systems by completions and abandonment.                              |
| `podPositions`    | `PodPositionsSection`         | Completion + skip by `AD_POSITION` and (optional) `AD_POD_POSITION`.                       |
| `latency`         | `LatencySection`              | `ad_startup_time` percentiles and top offending ad systems.                                |
| `anomalies`       | `AnomalyFlag[]`               | Threshold breaches from `anomaly-flags`. Possibly empty.                                  |
| `notDeterminable` | string[]                      | What this report could NOT establish (e.g. SSAI suspected, no click data).                |
| `recommendedAction` | string \| null              | The single most actionable follow-up, or null.                                            |

## `FunnelResult`

| Field                     | Type           | Meaning                                                                                     |
| ------------------------- | -------------- | ------------------------------------------------------------------------------------------- |
| `stages`                  | `FunnelStage[]` | Ordered list: impressions → starts → q1 → midpoint → q3 → completions.                       |
| `completionRate`          | number [0,1]   | `completions / impressions`. Null when impressions = 0.                                     |
| `startRate`               | number [0,1]   | `starts / impressions`. Null when impressions = 0.                                          |
| `quartileBeaconsMissing`  | boolean        | True when Q1/Q2/Q3 sum near zero but completions > 0 — classic SSAI signature.              |
| `clicks`                  | number \| null | Side-branch total. Null when click tracking is not wired.                                   |
| `skips`                   | number \| null | Side-branch total.                                                                          |
| `clickThroughRate`        | number [0,1] \| null | `clicks / impressions`. Null when `clicks` is null or zero.                            |

### `FunnelStage`

| Field               | Type           | Meaning                                                                |
| ------------------- | -------------- | ---------------------------------------------------------------------- |
| `name`              | string         | Stage label: `impressions`, `starts`, `q1`, `midpoint`, `q3`, `completions`. |
| `count`             | number         | Raw count for the stage.                                               |
| `share`             | number [0,1]   | `count / impressions`.                                                 |
| `dropFromPrev`      | number \| null | Absolute drop from the previous stage. Null for the first stage.       |
| `dropRateFromPrev`  | number \| null | Relative drop from the previous stage (`(prev - this) / prev`).        |

## `ErrorsSection`

| Field              | Type              | Meaning                                                                |
| ------------------ | ----------------- | ---------------------------------------------------------------------- |
| `totalErrorSessions` | number          | `ad_error_sessions` total across the window.                            |
| `topCodes`           | `ErrorCodeEntry[]` | Top error codes by session count, with cumulative share.             |
| `topAdSystems`       | `ParetoEntry[]` | Ad systems ranked by error sessions, gated by sample-gate.              |
| `topTagServers`     | `ParetoEntry[]` \| null | Optional — when AD_TAG_SERVER was pulled.                       |

### `ErrorCodeEntry`

| Field     | Type   | Meaning                                                         |
| --------- | ------ | --------------------------------------------------------------- |
| `code`    | string | The ERROR_CODE value as returned by the API.                    |
| `count`   | number | Number of ad error sessions with this code.                     |
| `share`   | number [0,1] | `count / totalErrorSessions`.                              |

## `ConcentrationSection`

| Field            | Type             | Meaning                                                                          |
| ---------------- | ---------------- | -------------------------------------------------------------------------------- |
| `byCompletions`  | `ParetoResult`   | Top advertisers ranked by `ad_completions` (sum), with cumulative share.         |
| `adSystems`      | `ParetoResult` \| null | Top ad systems by completions. Null when only one ad system was observed. |

### `ParetoEntry` / `ParetoResult`

`ParetoEntry`: `{ key: string, value: number, share: number, cumulative: number, rank: number }`.

`ParetoResult`: `{ total: number, entries: ParetoEntry[], topN: { count: number, share: number }, threshold: number, headCount: number }`. `headCount` is the number of entries needed to cover `threshold` (default 80%) of the total.

## `PodPositionsSection`

| Field                  | Type                  | Meaning                                                                              |
| ---------------------- | --------------------- | ------------------------------------------------------------------------------------ |
| `byPosition`           | `PodPositionEntry[]`  | One entry per `AD_POSITION` value (pre / mid / post).                                 |
| `byPodPosition`        | `PodPositionEntry[]` \| null | Optional — one entry per `AD_POD_POSITION` slot.                              |
| `survivorBiasNote`     | string                | A canned note attached to any pod-position comparison — keep it visible.             |

### `PodPositionEntry`

| Field            | Type   | Meaning                                                            |
| ---------------- | ------ | ------------------------------------------------------------------ |
| `key`            | string | The pod position label (e.g. `pre`, `mid`, `post`, `0`, `1`, ...). |
| `starts`         | number | Ad starts at this position.                                        |
| `completions`    | number | Ad completions at this position.                                   |
| `skips`          | number | Ad skips at this position.                                         |
| `completionRate` | number [0,1] | `completions / starts`.                                       |
| `skipRate`       | number [0,1] | `skips / starts`.                                              |

## `LatencySection`

| Field           | Type             | Meaning                                                                  |
| --------------- | ---------------- | ------------------------------------------------------------------------ |
| `medianMs`      | number \| null   | `ad_startup_time` median across the window.                              |
| `p95Ms`         | number \| null   | `ad_startup_time` p95 across the window.                                 |
| `topAdSystems`  | `ParetoEntry[]`  | Ad systems ranked by median `ad_startup_time` (descending).              |

## `AnomalyFlag`

| Field      | Type                          | Meaning                                                                   |
| ---------- | ----------------------------- | ------------------------------------------------------------------------- |
| `id`       | string                        | Stable identifier (e.g. `impression-to-start-drop`).                       |
| `severity` | `"info" \| "warn" \| "high"`  | How loudly the agent should call attention to it.                          |
| `message`  | string                        | Human-readable summary including the observed value and the threshold.   |
| `detail`   | object                        | Machine-readable: `{observed, threshold, slice?, scope?}`.                |

## Versioning

`schemaVersion` is `"1.0"`. Additive fields (new optional keys) don't bump the
major; renames, type changes, or removals do. Consumers must tolerate unknown
additive fields.
