# iOS / tvOS / visionOS Collector

Supports iOS 14+, tvOS 14+, visionOS 1+ (current 3.x line). Players: Bitmovin (pre-integrated), AVPlayer,
THEOplayer. You need a basic working player first.

API reference: https://cdn.bitmovin.com/analytics/ios/3.0.0/docs/index.html

---

## Path A — Bitmovin Player (pre-integrated)

Analytics is built into the Bitmovin Player since player `3.42.0`. No separate dependency, no attach, no
manual source lifecycle — enable it at player creation.

```swift
let analyticsConfig = AnalyticsConfig(licenseKey: "<ANALYTICS_LICENSE_KEY>")
let player = PlayerFactory.createPlayer(
    playerConfig: playerConfig,
    analytics: .enabled(analyticsConfig: analyticsConfig)
)
```

Enrich with metadata. `DefaultMetadata` is source-independent (set at creation); `SourceMetadata` is
per-source:
```swift
let defaultMetadata = DefaultMetadata(
    customUserId: "userId",
    customData: CustomData(customData1: "appVersion4")
)
let player = PlayerFactory.createPlayer(
    playerConfig: playerConfig,
    analytics: .enabled(analyticsConfig: analyticsConfig, defaultMetadata: defaultMetadata)
)

let sourceMetadata = SourceMetadata(
    videoId: "exampleId",
    title: "stream title",
    customData: CustomData(customData2: "ExampleGenre")
)
let source = Source.createSource(from: sourceConfig, sourceMetadata: sourceMetadata)
player.load(source: source)
```

---

## Path B — Third-party players (AVPlayer, THEOplayer)

### Step 1 — Add the SDK

**Swift Package Manager** (supported since `2.8.0`). Repo:
`https://github.com/bitmovin/bitmovin-analytics-collector-ios`. Products:
- `AVFoundationCollector` (AVPlayer)
- `THEOplayerCollector` (requires `THEOplayerSDK >= 10.7.0, < 11.0.0`)

In `Package.swift`:
```swift
.package(url: "https://github.com/bitmovin/bitmovin-analytics-collector-ios", exact: "Version Number")
// then as a target dependency:
.product(name: "AVFoundationCollector", package: "bitmovin-analytics-collector-ios")
// or
.product(name: "THEOplayerCollector", package: "bitmovin-analytics-collector-ios")
```
> Limitation: `swift build` from the CLI is unsupported; open the package in Xcode.

**CocoaPods** (needs CocoaPods `>= 1.4`):
```ruby
pod 'BitmovinAnalyticsCollector/AVPlayer', 'VERSION_NUMBER'
# or
pod 'BitmovinAnalyticsCollector/THEOplayer', 'VERSION_NUMBER'
```

### Step 2 — Import
Always import `CoreCollector` plus the player-specific module:
```swift
import CoreCollector
import AVFoundationCollector      // AVPlayer
// or
import THEOplayerCollector        // THEOplayer
```

### Step 3 — Configure, create, attach
```swift
let config = AnalyticsConfig(licenseKey: "<ANALYTICS_LICENSE_KEY>")
let metadata = DefaultMetadata(customUserId: "custom-user-id")

let analyticsCollector = AVPlayerCollectorFactory.create(config: config, defaultMetadata: metadata)
// or: THEOplayerCollectorFactory.create(config: config, defaultMetadata: metadata)

analyticsCollector.attach(to: player)   // attach once the player exists
```

### Step 4 — Source-change lifecycle (the critical part)
Each source must be its own analytics session (fresh `sequence_number` from 0, clean startup metrics).
**Order matters: detach before changing the source, attach after.**
```swift
// 1. detach before swapping the source
analyticsCollector.detach()

// 2. update source metadata for the new source (recommended)
analyticsCollector.sourceMetadata = SourceMetadata(videoId: "new-video-id")

// 3. change the source (AVPlayer example)
let newItem = AVPlayerItem(url: URL(string: "https://example.com/new-source.m3u8")!)
player.replaceCurrentItem(with: newItem)
// THEOplayer example:
// player.source = SourceDescription(source: TypedSource(src: "...m3u8", type: "application/x-mpegurl"))

// 4. re-attach, then play
analyticsCollector.attach(to: player)
player.play()
```
Detach again before you tear the player down.

---

## Per-program sessions on a continuous/live stream (`programChange`)

For a continuous live/linear stream where the program changes but the source does not, split the watch into
one session per program with `programChange(newSourceMetadata:)` — it ends the current impression and starts
a new one without swapping the source or re-attaching. Available on all iOS collectors (Bitmovin, AVPlayer,
THEOplayer) since collector **v3.21.0**.
```swift
let next = SourceMetadata(videoId: "program-002", title: "Evening News", isLive: true)
collector.programChange(newSourceMetadata: next)
```
`customUserId` (in `DefaultMetadata`) persists across programs. You need a handle to the collector — on the
third-party path you already hold it; for the pre-integrated Bitmovin Player, reach it via the player's
analytics accessor (`player.analytics`) — confirm the exact accessor in the Player iOS SDK API reference, or
integrate the collector manually to keep a handle. This is distinct from the Step 4 source-change lifecycle
(which is for an actual new source). Full cross-platform details: `program-change.md`.

Examples: https://github.com/bitmovin/bitmovin-analytics-collector-ios-samples
Source page: https://developer.bitmovin.com/playback/docs/setup-analytics-ios
