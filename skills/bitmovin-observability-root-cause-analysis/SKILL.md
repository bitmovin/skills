---
name: bitmovin-observability-root-cause-analysis
description: >-
  Root-cause analysis for a video QoE metric that moved — startup time,
  rebuffer ratio, error rate, bitrate, video-start-failures — using the
  Bitmovin Observability MCP. Use whenever someone asks WHY a QoE metric
  changed, spiked, dropped, regressed, or "looks off", whether a release or CDN
  change hurt quality, or what drives a delta between two windows or cohorts.
  Trigger even without "RCA" — "rebuffering is up in APAC", "did v11 regress
  startup?", "what happened to error rate Tuesday" all belong here. Drives a
  disciplined Define→Gather→Reflect→Conclude investigation with mix-vs-rate
  (Simpson's paradox) protection and a falsification step, producing a
  structured findings object.
---

# QoE Root-Cause Analysis

Explain *why* a video QoE metric moved between two windows (or cohorts), with
enough discipline that the answer survives scrutiny. The output is a structured
findings object (`references/findings-contract.md`).

## Operating principle

**The agent decides; the scripts compute.** Every deterministic, multi-term, or
numerically load-bearing calculation goes to a script under `scripts/` — a silent
arithmetic slip over dozens of segments corrupts the single most important
verdict (mix vs rate), and a script is auditable and tested where mental math is
not. Scripts return numbers and classifications; they **never** return a verdict
like "this is a regression." Query construction, hypothesis formation, and the
weighing of falsification stay with the agent.

## Setup (once)

Scripts run under Node via `tsx`.

1. Check the runtime: `node --version` and `npm --version`. **If either is
   missing, stop and ask the user for approval before installing anything** —
   installing a runtime is a system change you must not make unattended. State
   the platform command (macOS: `brew install node`) and wait for approval.
2. Install deps once from `scripts/`: `npm install` (pulls `tsx`).
   Afterwards `npx tsx scripts/cli.ts <cmd>` uses the local `tsx`, no network.

If no Node is available and no one can approve an install, report that as a
blocking limitation — do **not** fall back to in-head arithmetic for the
decomposition.

## Tools

Analytics: **`query`** (time series), **`queryGroupBy`** (grouped),
**`queryTotal`** (one aggregate). Schema helpers: `searchMetrics`,
`getAvailableMetrics`, `searchFilters` / `getAvailableFilters`,
`peekAllLicenses`. For an aggregate fingerprint of a slice (not per-session
traces): `getImpressionOverview` / `analyzeImpression`.

## The four phases

Run **Define → Gather → Reflect → Conclude**, where **Reflect loops back to
Gather** until the delta is explained or a stop guard fires. The phase boundary
keeps the investigation honest:

- **Gather may not conclude.** It only pulls data.
- **Reflect may not pull data.** It interprets, then decides what to pull next.

That separation stops the agent seizing on the first dimension it queries and
narrating a story around it. A quick triage is one lap; a deep RCA is several.

### 1 — Define

Pin the question and the math before touching data.

1. Resolve schema: real metric keyword via `searchMetrics` (names are
   non-obvious — `plays` is `impression_id`, the OS attribute is
   `OPERATINGSYSTEM`); groupable attributes via `searchFilters` /
   `getAvailableFilters`; license key (`peekAllLicenses` if not supplied).
2. State the target: metric, **statistic** (median vs p95 vs p99 fail
   differently — be specific), magnitude, current window, baseline window.
3. **Classify the metric kind** — it decides whether decomposition is valid:
   - **ratio / mean** (rebuffer ratio, error rate, avg startup) → decomposes
     exactly. Use `decompose`.
   - **percentile** (p95/p99) → **not additive**. Use `rank-percentile` for a
     ranked heuristic only, labelled as such. Never `decompose` a percentile.
4. Set the **exit criterion**: explain ≥ a target fraction of the delta (e.g.
   80%), or report the residual honestly.
5. Note any human-supplied change context (see HITL) — sharpens everything,
   never required.

### 2 — Gather

Pull data. Depth depends on the lap.

- **First lap (broad, cheap).** Confirm the move is real and find its onset:
  `query` the series over a multi-week window, then `detect-onset`. The onset
  bucket *defines the before/after boundary* for everything downstream. The
  detector is **not** seasonality-aware — feed it same-weekday-comparable buckets
  (or read its result against known weekly patterns) so weekend troughs don't
  masquerade as onsets. Get the two window totals with `queryTotal`. Then a
  breadth-first localization screen: per candidate dimension, one `queryGroupBy`
  for the metric + one for volume, current window. This is the **subagent**
  boundary (below).
- **Later laps (narrow, deep).** On the suspect dimension, pull metric and volume
  per segment in **both** windows via `queryGroupBy` — the input to `decompose`.
  If correlating with a release, pull the same split by player/SDK version.

Given the MCP's query timeouts, screen first, prune to the top one or two
dimensions, then go deep — never the deep two-window pull across five dimensions.

### 3 — Reflect

Interpret and decide. No new queries.

1. **Decompose** (ratio/mean) or **rank** (percentile). Assemble the per-segment
   `{key, count0, count1, metric0, metric1}` table and call the script. Pass the
   true window aggregates from `queryTotal` as `observed` so it can flag
   under-coverage (`coverageResidual`).
2. **Mix vs rate — the Simpson guard.** Read `rateShareOfDelta`,
   `mixShareOfDelta`, `interactionShareOfDelta`. Mostly **rate** → segments
   genuinely got worse (a regression to chase). Mostly **mix** → *nothing
   regressed*; traffic shifted toward already-worse segments, and the remediation
   is different. A large **interaction** share means the segments that grew are
   also the ones that worsened — report `mixed`, not a clean rate story. Opposite
   signs between mix and rate is a strong mix-shift signal. When the aggregate
   barely moved, the shares are unstable — lead with the absolute terms.
3. **Significance / sample size.** Gate before believing a segment:
   `sample-gate`, then `two-proportion` (count/count proportions — error rate,
   VSF, % of sessions that rebuffered) or `welch` (means; also duration ratios
   like buffering-time/view-time, which are **not** binomial — never
   `two-proportion` them). A dramatic swing on a thin slice is usually noise.
4. **Falsify** the candidate driver — the step that separates RCA from
   storytelling. It must be *confined* to the suspect segment and *absent
   elsewhere* (filtered `queryTotal` on both); sit in the **rate** term; and have
   matching onset timing. If the regression is everywhere, kill the segment
   hypothesis.
5. **Account.** `accumulate` the confirmed drivers — from **one** orthogonal
   dimension; don't sum overlapping cdn + country drivers (watch the `overshoot`
   flag). Then `loop-decision`:
   - **conclude** — explained ≥ target and falsification passed.
   - **gather** — go deeper, or pick a new candidate (this one was mix, or failed
     to falsify).
   - **stop_no_progress** — a lap didn't raise the explained fraction; stop and
     report the residual.
   - **stop_budget** — lap cap reached; report explained + residual.

### 4 — Conclude

Emit the findings object (`references/findings-contract.md`): primary driver,
contribution %, mix-vs-rate verdict, confidence, **residual unexplained
portion**, the aggregate fingerprint, the recommended next action, and **what is
not determinable on this surface** (e.g. can't confirm a specific deploy without
a release feed; no per-session traces). If the output triggers a side effect
(paging, posting to a channel, flagging a CDN), get human approval first.

## The decompose handoff

Assemble from two-window `queryGroupBy` results and pipe JSON to the CLI:

```bash
echo '{
  "metricKind": "ratio",
  "observed": {"m0": 0.021, "m1": 0.038},
  "segments": [
    {"key":"CDN-X","count0":15000,"count1":22000,"metric0":0.030,"metric1":0.072},
    {"key":"CDN-A","count0":40000,"count1":38000,"metric0":0.018,"metric1":0.019}
  ]
}' | npx tsx scripts/cli.ts decompose
```

Back: `deltaTotal`, `mixTotal` / `rateTotal` / `interactionTotal` and their
`*ShareOfDelta`, an `identityResidual` (~0; non-zero ⇒ malformed input), a
`coverageResidual` (segments vs the `observed` aggregate; large ⇒ the segments
don't cover the population, so the delta is understated), and `segments[]` sorted
by absolute **rate** contribution. A segment present in only one window (a new
CDN, a retired version) is attributed entirely to **mix** — no baseline rate to
regress from.

Other commands: `rank-percentile`, `detect-onset`, `two-proportion`, `welch`,
`wilson`, `sample-gate`, `accumulate`, `loop-decision`. All take JSON on stdin,
return JSON on stdout; signatures are at the top of `scripts/cli.ts`.

## Guards

- **Mix-vs-rate (Simpson):** never report a regression without checking the mix
  share. A large mix term means composition, not regression.
- **Percentile non-additivity:** never `decompose` a percentile metric.
- **Sample-size gating:** gate every segment before believing its swing.
- **Coverage:** check `coverageResidual` — the segments must reconstruct the true
  aggregate, or the delta is understated.
- **Lap budget + stop-on-no-progress:** terminate on diminishing returns, not
  only on success. Report residuals honestly.
- **Cardinality / cost:** screen breadth-first before the deep two-window pull;
  never `groupBy` an unbounded dimension (`impression_id`, `stream_id`).

## Human-in-the-loop

HITL is enrichment, never a dependency — every touchpoint must degrade to a
stated assumption when no human is present.

- **Front-loaded context (primary).** Let the human optionally seed Define with
  change context the telemetry cannot contain — releases, a big customer
  onboarding, a CDN vendor incident, planned maintenance. Non-blocking.
- **One surgical Reflect prompt (fallback).** Only when a strong hypothesis lacks
  confirmation: "the regression is confined to v11, onset Tuesday 14:00 — does
  that line up with anything you know?" Ask for ground truth, **never** "what do
  you think caused it?"
- **Conclude approval** for any side effect.

## Subagent boundary

Isolate exactly one chunk: the **breadth-first localization screen**. Screening
candidate dimensions is independent per dimension and produces many grouped rows
you don't want in the main thread; it distils to a compact contract (dimension →
contribution ranking). Fan out, get back "CDN: concentrated in CDN-X; OS: flat;
country: tracks CDN", and keep the raw rows out of the main reasoning. Do **not**
subagent the decomposition (its output drives hypothesis + falsification in the
main thread) or the falsification probes (coordination cost exceeds the work).

## Scripts

| Command | Purpose |
| --- | --- |
| `decompose` | Mix/rate/interaction split + coverage check |
| `rank-percentile` | Rank suspects for non-additive percentile metrics |
| `detect-onset` | Level-shift detection + onset timing (rolling median+MAD) |
| `two-proportion` / `welch` / `wilson` | Significance + CIs for ratio / mean metrics |
| `sample-gate` | Minimum-volume / minimum-event gate |
| `accumulate` | Explained fraction + residual |
| `loop-decision` | Reflect→Gather/Conclude + stop guards |

Run from the skill root: `npx tsx scripts/cli.ts <command>`. Each is pure and
runtime-dependency-free.
