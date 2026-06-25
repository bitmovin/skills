# Per-program sessions on a continuous stream — `programChange`

## What it solves

A long continuous stream (live linear / FAST channel / 24×7 broadcast / EPG) plays many programs
back-to-back over **one** source/manifest. By default that entire watch is a **single** impression, so
per-title metrics (startup time, rebuffering, errors, bitrate) get smeared across every show.

`programChange` splits it: it **ends the current analytics session and opens a fresh impression** — with a
new `videoId` / `title` / `customData` — **without** reloading the source, re-attaching the collector, or
recreating the player. One program → one session.

This is distinct from a **source change** (loading a different manifest URL), which already starts a new
session through the normal source lifecycle. Use `programChange` precisely when the *stream stays the same*
but the *program changes*.

## Semantics (consistent across all four platforms)

Calling `programChange(newSourceMetadata)`:

- **Closes the current impression and starts a new one** with a new `impressionId`. (Verified in source on
  all platforms — e.g. Web `Analytics.ts` `programChange` → `init()` → `generateUUID()`.)
- Keeps the **same player and same source** playing — no detach/re-attach, no `load()`.
- Resets the sample **sequence number** and emits a dedicated `programchange` sample
  (`isProgramChange = true`, `videoStartupTime = 1`).
- **Carries over `customUserId`** — it lives in the source-independent/default metadata, so every program
  stays attributed to the same viewer (the cross-program journey is preserved).
- **Metadata scope differs by platform:** Web *merges* the new metadata onto the existing config (omitted
  fields keep their previous value); native (iOS/Android) *replaces* the active source's metadata. Either
  way, **set every field you want present** on the new program rather than relying on carry-over.
- Is **manual** — it is NOT fired automatically by player events. Drive it from your EPG/schedule or from
  in-stream timed metadata (ID3 / EMSG / HLS `#EXT-X-DATERANGE`).
- Call it **once per boundary** — dedupe if you trigger from repeating timed-metadata tags.
- If called **before the first program starts playing** (setup/startup), it just updates the metadata of the
  first session instead of creating an extra empty impression.

## Platform / player availability — the important inconsistency

| Platform | Players that support `programChange` | Argument | Added in collector |
|----------|--------------------------------------|----------|--------------------|
| Web | Bitmovin Player (`player.analytics`), HLS.js, Shaka, Video.js, HTML5 `<video>`, THEOplayer, Chromecast CAFv3 | `SourceMetadata` | v2.56.0 |
| iOS / tvOS / visionOS | Bitmovin Player, AVPlayer, THEOplayer | `SourceMetadata` | v3.21.0 |
| Android / Android TV / Fire TV | Bitmovin Player, ExoPlayer, Media3 ExoPlayer, THEOplayer | `SourceMetadata` | ~v3.22.0 (confirm in releases) |
| Roku | **THEOplayer collector ONLY** — NOT the Bitmovin Player collector, NOT the native Video collector | assoc. array | v2.14.0 |

- **Not supported:** Bitmovin Player **Web X (PWX)** — there each source is already its own session;
  recreate the source per program instead.
- **Version caveat (verified in practice):** the **pre-integrated** player bundles a *fixed* collector
  version. If `player.analytics` has no `programChange` (e.g. an older Web player that bundles a collector
  < 2.56.0 — it will only expose `sourceChange`), then update the player, pin a newer analytics module via
  the modular build, or fall back to `sourceChange`.

## The argument — `SourceMetadata` (metadata only, NOT the full `AnalyticsConfig`)

Per-program fields: `videoId`, `title`, `cdnProvider`, `path`, `isLive`, and `customData`
(`customData1..N` + `experimentName`). Roku additionally accepts stream-URL fields
(`m3u8Url` / `mpdUrl` / `progUrl`, which set `streamFormat`).

Do **not** put the license `key` here — that is set once at setup. `customUserId` is default/source-independent
metadata (set at setup), not a per-program field, so it persists automatically.

## Per-platform call

### Web
Pre-integrated Bitmovin Player:
```ts
player.analytics.programChange({
  videoId: 'program-002',
  title: 'Evening News',
  isLive: true,
  customData: { customData1: 'news' },
});
```
Third-party adapter (HLS.js / Shaka / Video.js / HTML5 / THEOplayer / CAFv3) — call on the adapter you
created at setup:
```ts
const adapter = new HlsAdapter(analyticsConfig, hls);
adapter.programChange({ videoId: 'program-002', title: 'Evening News', isLive: true });
```
Web also has a separate `sourceChange(analyticsConfig)` for actual stream-URL changes (call it *before*
`player.load()`); that is NOT a substitute for `programChange` on a continuous stream.

### iOS / tvOS / visionOS (Swift, `SourceMetadata`)
```swift
let next = SourceMetadata(
    videoId: "program-002",
    title: "Evening News",
    isLive: true,
    customData: CustomData(customData1: "news")
)
collector.programChange(newSourceMetadata: next)
// collector is BitmovinPlayerCollector / AVPlayerCollector / THEOplayerCollector
```
You need a reference to the collector. On the manual / third-party path you already hold it. For the
**pre-integrated** Bitmovin Player, reach it via the player's analytics accessor (`player.analytics`) —
**confirm the exact accessor in the Player iOS SDK API reference**; if you can't reach it, integrate the
collector manually so you keep a handle.

### Android / Android TV / Fire TV (Kotlin, `SourceMetadata`)
```kotlin
val next = SourceMetadata(
    videoId = "program-002",
    title = "Evening News",
    isLive = true,
    customData = CustomData(customData1 = "news"),
)
collector.programChange(next)
// collector is any AnalyticsCollector: Bitmovin / ExoPlayer / Media3 ExoPlayer / THEOplayer
```
Same handle caveat as iOS (hold the collector reference; for pre-integrated confirm the player's analytics
accessor against the SDK reference). **Call from the player thread** — the collector API is not thread-safe.
If the collector is not attached to a player, the call is silently ignored.

### Roku (BrightScript, associative array) — THEOplayer collector only
```brightscript
m.theoPlayerCollector.callFunc("programChange", {
    title: "Evening News",
    videoId: "program-002",
    isLive: true,
    m3u8Url: "https://example.com/news.m3u8"   ' or mpdUrl / progUrl
})
```
If called in `SETUP` (no source loaded yet) it applies as a metadata update without starting a new
impression. Not available on the Bitmovin Player or native Video collectors.

## Verify

After each `programChange` you should see a **separate impression per program** in the dashboard (filter by
`videoId` / `title`), each with its own startup time, all sharing the same `customUserId`. Two programs →
two impressions. See `verification.md`.
