# Findings contract (v1.0)

The structured object the RCA skill emits at **Conclude**. A neutral record of
what the analysis found — facts, with their confidence and residual — so a
consumer can frame it for different audiences without re-deriving anything.

Types are defined in `scripts/types.ts` (`Finding`, `RcaFindings`, `Driver`).
This file is the prose spec and the field-by-field contract.

## Top level: `RcaFindings`

| Field | Type | Meaning |
| --- | --- | --- |
| `schemaVersion` | `"1.0"` | Bump on any breaking change. |
| `generatedAt` | ISO string | When the RCA ran. |
| `licenseKey` | string | The analyzed license. |
| `finding` | `Finding` | The result (below). |

## `Finding`

| Field | Type | Meaning |
| --- | --- | --- |
| `metric` | string | Resolved metric keyword (e.g. `impression_id`, not the display name). |
| `metricKind` | `"ratio" \| "mean" \| "percentile"` | Decides whether `drivers` came from exact decomposition or the percentile heuristic. |
| `statistic` | string | The statistic analyzed, e.g. `median`, `p95`, `ratio`. |
| `windowBaseline` / `windowCurrent` | `{start, end}` | The two windows; `windowCurrent.start` aligns to the detected onset where one was found. |
| `deltaAbsolute` | number | `m1 - m0` in metric units. |
| `deltaRelative` | number | `(m1 - m0) / m0`, the signed fraction. |
| `onset` | string \| null | Onset timestamp from `detect-onset`, or null if no sustained shift. |
| `primaryDriver` | `Driver` \| null | The top confirmed driver, or null if the delta is unattributed (e.g. pure noise, or residual too large). |
| `drivers` | `Driver[]` | All confirmed drivers, largest contribution first. |
| `mixVsRate` | `"mostly_rate" \| "mostly_mix" \| "mixed"` | The Simpson-guard verdict. `mostly_mix` means *no regression* — composition shifted. `mixed` covers a large interaction term (segments grew *and* worsened). |
| `confidence` | `"high" \| "medium" \| "low"` | Agent's confidence, informed by significance, sample size, falsification, and residual. |
| `explainedShare` | number [0,1] | Fraction of the delta the drivers explain (from `accumulate`). |
| `residualShare` | number [0,1] | Unexplained fraction — **always reported**, never hidden. |
| `aggregateFingerprint` | object \| null | The session-level substitute: error-code distribution, percentile shape, top failing slice. A signature, not session-level proof. |
| `notDeterminable` | string[] | What this tool surface cannot establish — e.g. "specific deploy unconfirmed (no release feed)", "no session traces". |
| `recommendedAction` | string \| null | The next concrete step. |

## `Driver`

| Field | Type | Meaning |
| --- | --- | --- |
| `dimension` | string | e.g. `cdn`, `player_version`, `country`. |
| `segmentKey` | string | e.g. `CDN-X`, `v11`, `DE`. |
| `contribution` | number | Signed contribution to `deltaAbsolute` (the segment's rate term, by default). |
| `kind` | `"rate" \| "mix"` | `rate` = the segment got worse; `mix` = traffic shifted toward it. |

## Versioning

`schemaVersion` is `"1.0"`. Additive fields (new optional keys) don't bump the
major; renames, type changes, or removals do. Consumers must tolerate unknown
additive fields.
