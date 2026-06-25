# Roku Collector

Roku uses BrightScript/SceneGraph and is the most distinct of the four platforms. The config object shape is
the same as everywhere else (only the license key is required):
```brightscript
analyticsConfig = {
    key: "<ANALYTICS_LICENSE_KEY>"
}
```

The collector attaches to a Roku Video node; the Bitmovin Player for Roku and a native Video node are
configured differently, mirroring the Bitmovin-vs-third-party split on other platforms.

**Before generating Roku code, fetch the current page** — the BrightScript attach/component API and node
wiring change more than the other SDKs and aren't safe to reproduce from memory:

- Setup: https://developer.bitmovin.com/playback/docs/setup-analytics-roku
- Releases: https://developer.bitmovin.com/playback/docs/analytics-collector-roku-releases
- Examples: https://github.com/bitmovin/bitmovin-player-roku-samples
- Allowlisting a Roku channel: https://developer.bitmovin.com/playback/docs/how-can-i-allow-list-my-roku-channel-in-the-bitmovin-dashboard

Phase 0 (license key + channel allowlisting) and Phase 3 customization (the shared config/metadata fields in
`configuration.md`) still apply unchanged.

## Per-program sessions on a continuous/live stream (`programChange`)

To split a continuous live/linear stream into one session per program (new impression without reloading the
source), call `programChange` on the collector node with the new program's metadata as an associative array
(collector **v2.14.0+**):
```brightscript
m.theoPlayerCollector.callFunc("programChange", {
    title: "Evening News",
    videoId: "program-002",
    isLive: true,
    m3u8Url: "https://example.com/news.m3u8"   ' or mpdUrl / progUrl
})
```
> **Roku limitation:** `programChange` is implemented on the **THEOplayer collector only** — NOT the Bitmovin
> Player collector and NOT the native Video collector. If called before a source is loaded (SETUP) it applies
> as a metadata update without starting a new impression.

Full cross-platform semantics and availability matrix: `program-change.md`.
