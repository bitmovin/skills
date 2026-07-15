---
name: bitmovin-observability-ad-report
description: >-
  Snapshot-style ad operations report for a Bitmovin Analytics license. Use
  whenever someone asks for an "ad ops report", "ad health check", "ad funnel",
  "weekly ad review", "VAST error breakdown", "advertiser performance", "ad
  system comparison", "ad startup-time breakdown", or "how are our ads doing" —
  even without the word "report". Builds the impression→start→quartile→
  completion funnel, ranks advertisers and ad systems, flags VAST/ad-server
  errors, evaluates pod-position cohorts, and summarizes ad startup latency as
  structured anomaly flags (AdOpsReport object). Does NOT explain why a metric
  moved between two windows — use the QoE RCA skill for that.
---

# Ad Operations Snapshot Report

Produce a structured, single-window report for an ad-operations audience: how
the funnel looks, where errors concentrate, which advertisers / ad systems are
carrying or dragging the inventory, how pod position affects completion, and
whether ad startup time is within bounds. The output is a structured
`AdOpsReport` object (`references/report-contract.md`) plus the prose
narrative the agent renders from it.

## Operating principle

**The agent decides; the scripts compute.** Funnel drop-offs across stages,
concentration ranking, and threshold checks all go to scripts under `scripts/`
— silent arithmetic slips poison a report the user cannot easily audit, and
the scripts are tested where mental math is not. Scripts return numbers and
classifications; they **never** return a verdict like "this advertiser is
underperforming." Query construction, framing, and the final narrative stay
with the agent.

## Setup (once)

Scripts run under Node via `tsx`.

1. Check the runtime: `node --version` and `npm --version`. **If either is
   missing, stop and ask the user for approval before installing anything** —
   installing a runtime is a system change you must not make unattended. State
   the platform command (macOS: `brew install node`) and wait for approval.
2. Install deps once from `scripts/`: `npm install` (pulls `tsx` + `vitest`).
   Afterwards `npx tsx scripts/cli.ts <cmd>` uses the local `tsx`, no network.

If no Node is available and no one can approve an install, report that as a
blocking limitation — do **not** fall back to in-head arithmetic for the
funnel decomposition or anomaly thresholds.

## Scope of this skill

**In scope.** Single-window snapshot reports for ad-ops audiences. The window
can be anything the user asks for (last 7 days, yesterday, last 30 days, a
custom range). Always assumes the license has the ads dataset wired up.

**Not in scope.** Window-comparison or "why did this change" RCA — that work
belongs in the QoE RCA skill (`bitmovin-observability-root-cause-analysis`).
If the user's question is "why did ad completions drop on Tuesday", redirect
them. This skill does not run mix-vs-rate decomposition or onset detection.

## Tools (ad analytics)

The ad query tools route any metric prefixed with `ad_` to the Ads Queries API:

- **`query`** — time series of a single ad metric, optional filter, optional
  group-by.
- **`queryGroupBy`** — grouped aggregation; this is the workhorse for
  concentration, error code breakdowns, and pod position cohorts.
- **`queryTotal`** — one aggregate value over the window. Used for each funnel
  stage and the latency percentiles.
- **Schema helpers** — `searchMetrics` to resolve the actual ad-metric keyword
  ("ads" → `ad_impressions`, "CTR" → `ad_clicks`), `searchFilters` /
  `getAvailableFilters` to confirm filter attributes (`AD_SYSTEM`,
  `ADVERTISER_NAME`, `AD_POSITION`, `AD_POD_POSITION`, `AD_TAG_SERVER`,
  `ERROR_CODE`, `CUSTOM_DATA_*`), `peekAllLicenses` when the user hasn't
  supplied a license key.

The ad filter catalog is disjoint from the playback filter catalog. The ads
dataset only accepts `AdAnalyticsAttribute` names — don't reuse playback
attribute names in ad queries.

## The four phases

Run **Scope → Pull → Flag → Report** strictly in order. Each phase has a job;
mixing them produces sloppy reports.

- **Scope** decides what to ask. No queries.
- **Pull** only pulls. No interpretation.
- **Flag** only interprets the pulled data through the scripts. No new queries.
- **Report** assembles the structured object and renders the narrative.

### 1 — Scope

Pin the question and the schema before touching data.

1. Resolve the license key (`peekAllLicenses` if not supplied) and the window
   (`start`, `end`). For "weekly review" with no explicit dates, default to
   the last 7 full days (UTC).
2. Resolve schema via `searchMetrics` and `searchFilters` — never guess
   keywords. The canonical ad metric names are `ad_impressions`, `ad_starts`,
   `ad_quartile_1`, `ad_midpoint`, `ad_quartile_3`, `ad_completions`,
   `ad_clicks`, `ad_skips`, `ad_error_sessions`, `ad_error_percentage`,
   `ad_startup_time`, `ad_play_percentage`, `ad_unique_users`.
3. **Confirm the license has ad data.** Run one `queryTotal` on
   `ad_impressions` over the window. If it returns 0 (or near-zero), stop and
   report "license has no ad data in this window" — do not attempt the rest of
   the report.
4. Capture any human-supplied scope (filter to a specific advertiser, ad
   system, country, app version) and remember it as a filter to apply to every
   pull. See HITL — context is enrichment, never required.
5. Decide which sections to produce. The default report includes all five
   sections; the agent may skip a section when the user's ask is narrow
   ("just show me the error breakdown").

### 2 — Pull

Five independent data batches. Run them as a fan-out (see subagent boundary).

- **Funnel batch.** Six `queryTotal` calls — one per stage:
  `ad_impressions`, `ad_starts` (sum), `ad_quartile_1` (sum), `ad_midpoint`
  (sum), `ad_quartile_3` (sum), `ad_completions` (sum). Same window, same
  cohort filter on every call. Optionally pull `ad_clicks` (sum) and
  `ad_skips` (sum) as side-branch totals.
- **Errors batch.** `queryTotal` on `ad_error_sessions` + `queryGroupBy` on
  `ERROR_CODE` (top 10 by count) + `queryGroupBy` on `AD_SYSTEM` for
  `ad_error_sessions`. Optionally `AD_TAG_SERVER` if the user cares about ad
  server attribution.
- **Concentration batch.** `queryGroupBy` on `ADVERTISER_NAME` for both
  `ad_completions` (sum) and `ad_starts` (sum). Optionally `AD_SYSTEM` for the
  same metrics. Limit to top 20 entries — pareto only cares about the head.
- **Pod position batch.** `queryGroupBy` on `AD_POSITION` for `ad_starts`
  (sum), `ad_completions` (sum), and `ad_skips` (sum). Optionally
  `AD_POD_POSITION` for the in-pod slot effect.
- **Latency batch.** `queryTotal` on `ad_startup_time` with `average`, plus
  `median` and `percentile` (p95). `queryGroupBy` on `AD_SYSTEM` for the
  median to spot one ad system anchoring the latency.

Apply the cohort filter from Scope (if any) to every call. Do not interpret
results in this phase — write them to a structured payload and move on.

### 3 — Flag

Run the scripts. No new queries.

1. **`funnel`** — assemble the six stage counts (plus optional clicks/skips)
   and pipe to the script. Returns per-stage drop-off, completion rate, start
   rate, **and a `quartileBeaconsMissing` flag** (true when Q1/Q2/Q3 are near
   zero but completions are non-zero — classic SSAI signature). When that flag
   is true, treat the funnel as start→completion only and note it in
   `notDeterminable`.
2. **`pareto`** — feed the concentration entries (advertisers, ad systems).
   Returns rank, cumulative share, top-N share, and how many entries cover the
   threshold (default 80%). A small `headCount` means one or two players carry
   the inventory; a large one means it's diffuse.
3. **`sample-gate`** — before declaring any advertiser / ad system / error
   code "an offender" in the narrative, gate it: thin slices swing wildly and
   should not be named. The gate is **per slice**, not on the aggregate.
4. **`anomaly-flags`** — feed the funnel, top error code share, top advertiser
   share, and the latency p95. The script applies ad-ops thresholds (see
   below) and returns an `AnomalyFlag[]`. The script never says "this is bad";
   it says "metric X crossed threshold Y."

### 4 — Report

Assemble the `AdOpsReport` (`references/report-contract.md`):

- the funnel section, with the SSAI degradation noted if it fired,
- the errors section, top codes + top offending ad systems / servers (gated),
- the concentration section, top advertisers + top ad systems (gated),
- the pod position section, with the **survivor-bias note attached** to any
  comparison across positions,
- the latency section, p50 / p95 + top offending ad system,
- the `anomalies[]` list,
- `notDeterminable[]`: anything the report could not establish (e.g. "clicks
  not tracked — `ad_clicks` was 0 across the window", "SSAI suspected — Q1/Q2/
  Q3 missing", "advertiser names absent — likely ad system not surfacing
  VAST"),
- a single `recommendedAction` — the most actionable item (e.g. "Investigate
  error code 30021 on ad system X — 42% of all ad errors"). May be null when
  nothing is actionable.

Then render the narrative from the object — never from in-head re-derivation.

## Default anomaly thresholds

These are the conventions baked into `anomaly-flags`. Override per-customer
when you have reason to.

| Flag id                       | Default       | Why it matters                                                  |
| ----------------------------- | ------------- | --------------------------------------------------------------- |
| `impression-to-start-drop`    | > 8%          | Ad-server timeouts, VAST parse failures, player issues          |
| `start-to-q1-drop`            | > 5%          | Early in-ad abandonment or quartile beacon issue                |
| `q3-to-completion-drop`       | > 5%          | Suspicious — Q3 viewers almost always complete; usually beacons |
| `low-completion-rate`         | < 50%         | Inventory is leaking value                                      |
| `top-error-code-share`        | > 30%         | One error code dominates → usually a single fixable cause       |
| `top-advertiser-share`        | > 50%         | Over-concentration risk                                         |
| `ad-startup-p95-high`         | > 2000 ms     | Slow ad load drags start rate                                   |

The thresholds are *flags*, not failures. The narrative should acknowledge a
flagged condition and propose investigation — never declare it a regression.

## Guards

- **SSAI / quartile reliability.** Server-side ad insertion does not fire
  quartile beacons consistently. If Q1/Q2/Q3 are near zero but completions are
  non-zero, the `funnel` script sets `quartileBeaconsMissing = true`; never
  report quartile drop-offs in that case, and add the limitation to
  `notDeterminable`.
- **Mid-roll survivor bias.** Later pod positions are pre-filtered to users
  who already retained through earlier ads — comparing completion rate at
  pod-position-3 to pod-position-0 without saying so is misleading. Every
  pod-position comparison in the narrative MUST mention this.
- **Sample-size at advertiser level.** Tiny advertisers swing wildly; gate
  every named advertiser through `sample-gate` on its `ad_starts` volume
  (default minN = 1000 starts). Per-slice ad impressions cannot be pulled, so
  starts are the gate input. Aggregate the long tail as "Other (N
  advertisers)" rather than list low-volume ones.
- **Click tracking availability.** CTR is meaningless when `ad_clicks` is zero
  across the window — record "clicks not tracked" in `notDeterminable` instead
  of reporting a 0% CTR.
- **Custom ad systems may not surface VAST attributes.** When `ADVERTISER_NAME`
  comes back empty for most rows, note it in `notDeterminable`; do not blame
  any single ad system without evidence.
- **Don't suggest a "regression" from one window of data.** This skill
  produces a snapshot, not a comparison. If the user wants to know whether
  something got worse, redirect to the QoE RCA skill.

## Human-in-the-loop

HITL is enrichment, never a dependency — every touchpoint must degrade to a
stated assumption when no human is present.

- **Front-loaded context (primary).** Let the human optionally seed Scope
  with: a target cohort (advertiser / ad system / region), known recent
  changes (ad-server vendor swap, new VAST tag, campaign launch), the
  audience for the report (engineering vs sales vs leadership). Non-blocking.
- **Section selection (fallback).** When the user's ask is narrow ("just the
  error breakdown"), confirm before producing the full five-section report.
- **Report approval** for any side effect (paging on a flag, posting to a
  channel, flagging an ad system as an offender to a customer). Get explicit
  human approval before any external action.

## Subagent boundary

Isolate exactly one chunk: the **five data-pull batches** in Pull. They are
independent, produce many grouped rows you don't want in the main thread, and
distill to compact contracts (funnel counts, top-N entries, etc.). Fan out the
five batches and bring back structured payloads. Do **not** subagent the Flag
phase — the script outputs drive the narrative in the main thread, and
splitting them adds coordination cost for no parallelism gain.

## Scripts

| Command         | Purpose                                                            |
| --------------- | ------------------------------------------------------------------ |
| `funnel`        | Stage drop-offs + SSAI / quartile-beacon detection                 |
| `pareto`        | Concentration ranking + cumulative share + threshold split        |
| `anomaly-flags` | Apply ad-ops thresholds to funnel + side metrics → AnomalyFlag[]  |
| `sample-gate`   | Minimum-volume gate per slice — vendored from QoE RCA              |

Run from the skill root: `npx tsx scripts/cli.ts <command>`. Each command takes
JSON on stdin, returns JSON on stdout. Signatures are at the top of
`scripts/cli.ts`. Tests cover the math: `npm test` in `scripts/`.
