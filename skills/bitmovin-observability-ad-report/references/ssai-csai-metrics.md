# SSAI / CSAI ad-metric cheatsheet

How to fetch **server-side (SSAI)** vs **client-side (CSAI)** ad metrics through
the Observability MCP. Adapted for MCP usage from the dashboard-query guide
([Server-Side Advertising](https://developer.bitmovin.com/playback/docs/how-to-recreate-dashboard-queries-via-the-api-1#server-side-advertising)),
which is written against the query-builder DSL (`queryBuilder` / `adQueryBuilder`).
This file restates those definitions as `query` / `queryTotal` / `queryGroupBy`
calls.

Read this whenever the user explicitly says **SSAI**, **CSAI**, **server-side**,
or **client-side** ads, or asks for an ad metric "split by ad type."

## TL;DR

| You're querying        | Dataset             | Discriminator attribute | SSAI | CSAI | No ad |
| ---------------------- | ------------------- | ----------------------- | ---- | ---- | ----- |
| a **non-`ad_`** metric | playback ("normal") | `ad`                    | `2`  | `1`  | `0`   |
| an **`ad_*`** metric   | ads                 | `ad_type`               | `2`  | `1`  | —     |

- **SSAI = 2, CSAI = 1**, on both attributes.
- The attribute is chosen by the **metric's dataset, not the user's wording**:
  query an `ad_*` metric → filter `ad_type`; query anything else → filter `ad`.
- The two datasets have **disjoint** filter catalogs. `ad` is invalid on `ad_*`
  metrics; `ad_type` is invalid on playback metrics — the MCP rejects the wrong
  one (*"Unknown ad filter attribute…"*).
- When the user names an ad type, apply the discriminator on **every** pull
  (treat it as the Scope cohort filter) and state it in the output.
- Attribute names are case-insensitive in the `filters` array (`ad` = `AD`,
  `ad_type` = `AD_TYPE`). The dashboard docs write them uppercase.
- These attributes only exist on **ad-enabled** licenses. Confirm with
  `getAvailableFilters` on the target license before relying on them.

## How to express the filter

```jsonc
// SSAI / CSAI on an ad_* metric (the ads dataset)
{ "name": "ad_type", "operator": "eq", "value": 2 }   // SSAI
{ "name": "ad_type", "operator": "eq", "value": 1 }   // CSAI

// SSAI / CSAI on a playback metric (rebuffer, samples, error %, …)
{ "name": "ad", "operator": "eq", "value": 2 }        // SSAI
{ "name": "ad", "operator": "eq", "value": 1 }        // CSAI
```

## ⚠️ The `ad` playback marker is sample-level

The `ad` attribute marks an **individual sample** (`0` = no ad, `1` = CSAI,
`2` = SSAI), not a session. Combining it with metrics that pre-filter on the
startup sample — `plays`, `unique_users`, `video_startuptime` — returns **0**,
because a startup sample is never an ad sample. Use `ad` only with `samples`
and sample-averaged rates (`rebuffer_percentage`, `error_percentage`). It is
also frequently **sparse for SSAI**: server-stitched ad samples may be barely
tagged, so a near-zero SSAI count can mean "not tracked at the sample level,"
not "no SSAI ran." For anything ad-specific, prefer the dedicated `ad_*`
metrics, which scope to the ads dataset and carry the `ad_type` discriminator.

## Metrics from the **ads** dataset — filter with `ad_type`

The funnel workhorses. All accept `ad_type eq 2` (SSAI) / `eq 1` (CSAI) and only
the ad-specific group-by attributes (`ad_system`, `advertiser_name`,
`ad_position`, `ad_pod_position`, `ad_tag_server`, `error_code`, …).

| Dashboard metric          | MCP metric (`metric`) | Aggregation                | Definition / notes                                                  |
| ------------------------- | --------------------- | -------------------------- | ------------------------------------------------------------------- |
| Ad Impressions            | `ad_impressions`      | `count`                    | One per ad slot loaded — funnel entry stage.                        |
| Ad Starts                 | `ad_starts`           | `sum` / `average`          | `average` = **start rate** (0–1).                                   |
| Ad First Quartile (25%)   | `ad_quartile_1`       | `sum` / `average`          | **SSAI under-reports quartiles** — see Gotchas.                     |
| Ad Midpoint (50%)         | `ad_midpoint`         | `sum` / `average`          |                                                                     |
| Ad Third Quartile (75%)   | `ad_quartile_3`       | `sum` / `average`          |                                                                     |
| Ad Completions (100%)     | `ad_completions`      | `sum` / `average`          | `average` = **completion rate**; `1 − rate` = **abandonment rate**. |
| Ad Clicks                 | `ad_clicks`           | `sum` / `average`          | `average` = **CTR** (0–1).                                          |
| Ad Skips                  | `ad_skips`            | `sum` / `average`          | `average` = **skip rate** (0–1).                                    |
| Ad Startup Time           | `ad_startup_time`     | `median` / `average` / `percentile` | ms from ad request to first ad frame. Default `median`.    |
| Ad Play Percentage        | `ad_play_percentage`  | `average`                  | Mean fraction of ad duration watched (0–100).                       |
| Ad Time Played            | `ad_time_played`      | `sum` / `average`          | Total ad watch time (ms); `average` = per-ad.                       |
| Ad Unique Users           | `ad_unique_users`     | `count`                    | Unique users served ≥ 1 ad.                                        |
| Ad Error Percentage       | `ad_error_percentage` | `average`                  | Ad errors ÷ **ad impressions**.                                     |
| Ad Error Sessions / codes | `ad_error_sessions`   | `count`                    | `queryGroupBy` on `error_code` for the top ad error codes.          |

## Metrics from the **playback** dataset — filter with `ad`

The dashboard derives a few "ad" figures from normal playback samples rather
than the ads dataset. These need `ad eq 2` (SSAI) / `eq 1` (CSAI), used with
`samples` or sample-averaged rates only.

| Dashboard metric       | MCP metric (`metric`) | Aggregation | Definition / notes                                                |
| ---------------------- | --------------------- | ----------- | ----------------------------------------------------------------- |
| Ad Count / Ad Samples  | `samples`             | `count`     | Counts ad samples. (Docs: `count('SAMPLES')` + `AD_INDEX ≠ null`.)|
| Ad Rebuffer Percentage | `rebuffer_percentage` | `average`   | Rebuffering during ad playback. **No ads-dataset equivalent.**    |
| Ad Error Percentage    | `error_percentage`    | `average`   | Errors ÷ **play attempts** on ad samples — see "either source".   |

## Drawn from **either** dataset (the overlap)

A few quantities exist on both sides with **different denominators**. Both can
be ad-type-split — but with the matching attribute for that dataset. Pick one
source, state which, and don't mix them in a single comparison.

| Quantity            | Ads dataset (preferred)                       | Playback dataset                                  | Why they differ                                                        |
| ------------------- | --------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------- |
| Ad error rate       | `ad_error_percentage` (avg) + `ad_type=2`     | `error_percentage` (avg) + `ad=2`                 | Ads = errors ÷ ad impressions; playback = errors ÷ play attempts.      |
| Ad error sessions / top codes | `ad_error_sessions` (count, groupBy `error_code`) + `ad_type=2` | `error_sessions` (count, `error_code ne 0`) + `ad=2`, groupBy `error_code` | Ads dataset counts ad-impression errors; playback counts session errors on ad samples. |

**Prefer the `ad_*` (ads-dataset) route** for ad-specific accuracy — it scopes
to real ad impressions and isn't subject to the sample-level sparsity of `ad`.
Fall back to the playback route only when the ads dataset lacks the breakdown
you need, and label it as playback-derived.

## Documented but **not available** via the MCP

The dashboard guide lists these; the MCP has no matching metric/attribute, so
derive or skip them and note it in `notDeterminable`.

| Dashboard metric      | MCP status                                                                 |
| --------------------- | -------------------------------------------------------------------------- |
| Ad Abandonment Rate   | **Derive:** `1 − average(ad_completions)` with `ad_type=2`.                |
| Incomplete Ads        | **Derive:** `sum(ad_starts) − sum(ad_completions)` with `ad_type=2`.       |
| Ad Breaks Abandoned   | No MCP metric (`AD_BREAKS_ABANDONED` not exposed). Skip.                    |
| Ad Failed Beacon URLs | No MCP attribute (`*_FAILED_BEACON_URL` not exposed). Skip.                 |

## Worked MCP calls

```jsonc
// SSAI completion rate over the window — ads dataset, filter ad_type
queryTotal({ metric: "ad_completions", aggregation: "average",
             filters: [{ name: "ad_type", operator: "eq", value: 2 }],
             start, end, licenseKey })

// CSAI vs SSAI start rate — two calls, value 1 then value 2
queryTotal({ metric: "ad_starts", aggregation: "average",
             filters: [{ name: "ad_type", operator: "eq", value: 1 }], … })

// SSAI top ad error codes
queryGroupBy({ metric: "ad_error_sessions", groupBy: "error_code",
               filters: [{ name: "ad_type", operator: "eq", value: 2 }], … })

// SSAI ad rebuffering — playback metric, so filter `ad`, not `ad_type`
queryTotal({ metric: "rebuffer_percentage", aggregation: "average",
             filters: [{ name: "ad", operator: "eq", value: 2 }], … })

// Count SSAI ad samples — `ad` only works with `samples`
queryTotal({ metric: "samples", aggregation: "count",
             filters: [{ name: "ad", operator: "eq", value: 2 }], … })
```

## Gotchas

- **Match the attribute to the dataset.** `ad_type` is invalid on a playback
  metric; `ad` is invalid on an `ad_*` metric. The MCP rejects the wrong one.
- **`ad` is sample-level and sparse for SSAI.** Never pair it with `plays`,
  `unique_users`, or `video_startuptime` (returns 0). A near-zero SSAI sample
  count is often under-tagging, not absence — cross-check the ads dataset
  (`ad_impressions` + `ad_type=2`). There is no playback metric for "ad startup
  time"; use `ad_startup_time` from the ads dataset.
- **`is_linear` and `ad_module` are NOT ad-type.** `is_linear` is linear vs
  non-linear; `ad_module` is the player ad module (vendor-specific, and a given
  module can serve either ad type). Split ad type only with `ad` / `ad_type`.
- **SSAI quartile beacons are unreliable.** Even with `ad_type=2`,
  `ad_quartile_1/2/3` are frequently near-zero for server-side ads while
  `ad_completions` is non-zero. The `funnel` script flags this as
  `quartileBeaconsMissing`; when set, treat the funnel as impressions → starts →
  completions and record the limitation in `notDeterminable` (see SKILL.md →
  Guards).
- **State your denominator.** When you report an "ad error rate," say whether it
  came from `ad_error_percentage` (per ad impression) or `error_percentage`
  filtered `ad=2` (per play attempt). They are not interchangeable.
