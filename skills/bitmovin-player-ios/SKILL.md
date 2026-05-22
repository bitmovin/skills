---
name: bitmovin-player-ios
description: Integrate and troubleshoot the Bitmovin Player SDK for iOS, tvOS, and visionOS in Swift, SwiftUI, UIKit, and existing Objective-C apps, including playback setup, player lifecycle, source loading, DRM, ads, AirPlay, Google Cast / Chromecast, PiP, platform-specific UX, logs, network diagnostics, and stream validation.
---

# Bitmovin Player Apple SDK Integration

## API source of truth

Use the versioned Bitmovin Player Apple SDK markdown manifest as the authoritative reference for API behavior, class names, method signatures, setup steps, availability, and feature integration:

```text
https://cdn.bitmovin.com/player/ios/3/BitmovinPlayer-markdown-manifest.json
```

Version policy: if the app already uses a specific Bitmovin Player SDK version, prefer the matching versioned manifest when available. If the user has not specified a version or the matching manifest is unavailable, use the pinned manifest above until a newer source of truth is provided.

Lookup workflow:

1. Fetch the manifest.
2. Search `documents[]` by `title` or `identifier` for the API symbol/article.
3. Take the matching `identifier`, lowercase the full path, prefix it with `/data`, and append `.md`.
4. Fetch that markdown file from the same versioned CDN base.

Example:

```text
identifier: /documentation/BitmovinPlayerCore/PlayerEventsApi
markdown:   https://cdn.bitmovin.com/player/ios/3/data/documentation/bitmovinplayercore/playereventsapi.md
```

If a markdown file is unavailable, fall back to the corresponding DocC JSON at the same `/data/...json` path and state that the answer is derived from DocC JSON rather than markdown.

Use the samples repository as the implementation companion reference for wiring examples and end-to-end app setup:

```text
https://github.com/bitmovin/bitmovin-player-ios-samples
```

Use iOS/tvOS/visionOS release notes to determine available versions, recent changes, migration notes, and the latest Bitmovin Player Apple SDK version:

```text
https://developer.bitmovin.com/playback/docs/release-notes-ios.md
```

If examples, local source, cached snippets, or prior assumptions conflict with the manifest-backed markdown docs, follow the markdown docs.

## When to use this skill

Use this skill when the task involves Bitmovin Player SDK integration or troubleshooting in an Apple-platform app:

- Add or upgrade Bitmovin Player SDK in an iOS, tvOS, or visionOS app
- Wire playback into SwiftUI, UIKit, or mixed Swift/Objective-C code
- Fix compile/runtime issues in player setup, source loading, events, ads, DRM, or analytics
- Diagnose unexpected playback behavior, stalls, startup failures, stream issues, or network failures
- Add or debug AirPlay, Google Cast / Chromecast, Picture in Picture, fullscreen, background playback, or remote-control behavior
- Adapt one playback pipeline across iPhone, iPad, Apple TV, and visionOS surfaces
- Turn session-specific integration roadblocks into concise guidance that helps the agent reach a working integration faster

## Supported deployment targets

Unless the user or project explicitly requires a higher baseline, preserve these minimum deployment versions:

- iOS 14+
- tvOS 14+
- visionOS 1+

## Language policy

- Prefer Swift for new integrations.
- SwiftUI and UIKit are both valid depending on the host app.
- Objective-C is supported for existing codebases and interoperability, but discourage starting a new Bitmovin Player integration in Objective-C unless the user explicitly asks or the project is already Objective-C-first.

## Dependency installation

Use Swift Package Manager for new integrations.

### Swift Package Manager

In Xcode, add the Bitmovin Player SDK through Project > Package Dependencies with this package URL:

```text
https://github.com/bitmovin/player-ios.git
```

For `Package.swift` based projects, add the package dependency and use the `BitmovinPlayer` product:

```swift
dependencies: [
    .package(url: "https://github.com/bitmovin/player-ios.git", exact: "Version Number")
],
targets: [
    .target(
        name: "<NAME_OF_YOUR_PACKAGE>",
        dependencies: [
            .product(name: "BitmovinPlayer", package: "player-ios")
        ]
    )
]
```

Replace `Version Number` with the desired SDK version. If a user has not requested a specific version, verify the current recommended/latest version before choosing one.

Note: command-line `swift build` is currently not supported for packages depending on `BitmovinPlayer`; open the package in Xcode instead.

### CocoaPods

CocoaPods is deprecated for this SDK and discouraged for new integrations. Only keep CocoaPods when maintaining an existing Podfile-based integration and the user explicitly wants to avoid migration. Prefer moving new work to Swift Package Manager.

### Analytics / Observability collector versioning

The analytics / observability collector version can be updated independently from the player version. Do not force a Bitmovin Player SDK upgrade only to update the collector, as long as the selected collector satisfies the minimum version required by the installed player version.

## Core principles

1. **Verify APIs before editing**
   - Resolve SDK-specific APIs through the API source-of-truth section before editing code.
   - Before writing SDK-specific code, inspect the app's installed SDK version, dependency manager, generated symbols, local examples, and the matching manifest-backed markdown docs.
   - When a requested feature is unfamiliar or the integration path is unclear, first search the matching API docs/manifest for relevant symbols or articles. If docs are missing or ambiguous, inspect local generated headers/package symbols before writing code, and state the evidence used.
   - Do not invent class names, initializers, config fields, or event names.

2. **Use one stable playback pipeline**
   - Keep player creation, source loading, event subscription, and teardown centralized.
   - Vary platform UI around that core pipeline instead of forking playback logic per device class.

3. **Respect Apple lifecycle boundaries**
   - Keep player instances stable for a playback scope.
   - Rebind views or controllers for UI changes instead of recreating the player during normal layout, navigation, fullscreen, or SwiftUI state changes.
   - Destroy/release player resources only when the playback context is finished.

4. **Do not bypass the SDK**
   - Never access or depend on the backing `AVPlayer` instance from the Bitmovin `Player` instance.
   - Use documented Bitmovin Player APIs for playback state, control, events, source handling, and feature integration.
   - If a use case appears to require direct `AVPlayer` access, treat that as a design roadblock and look for an SDK-supported API or escalate the missing capability to the user.

5. **Start troubleshooting from evidence**
   - Enable verbose/debug logging before reproducing issues.
   - Check SDK logs, app playback logs, event order, network requests, and stream validation output before changing code.
   - Separate player integration bugs from stream authoring, license, DRM, network, and platform-lifecycle issues.

6. **Derive roadblock-lifting guidance**
   - When integration stalls, identify the exact roadblock: missing API knowledge, project wiring, platform entitlement, network visibility, stream validity, lifecycle timing, or test coverage.
   - Convert verified findings into a compact task-local "skill fragment": what was checked, what was learned, the command or code path used, and what to avoid next.
   - Do not persist new durable memory or skill files unless the user explicitly asks.

## Integration workflow

### 1) Gather project context first

Before code changes, inspect:

- Target platforms: iOS, tvOS, visionOS, or shared Apple-platform module
- Deployment targets, preserving iOS 14+, tvOS 14+, and visionOS 1+ unless the project already requires higher
- UI stack: SwiftUI, UIKit, AppKit bridge, or mixed approach
- Language boundary: Swift-first for new work; Objective-C only for existing Objective-C codebases or interoperability
- Dependency manager: prefer Swift Package Manager; treat CocoaPods as legacy maintenance only
- Installed Bitmovin Player SDK version and related modules
- Analytics / observability collector version, which can usually move independently as long as it satisfies the player's minimum collector requirement
- Existing player wrapper/service, DI boundary, event bus, analytics layer, or sample app pattern
- License-key handling and bundle identifiers used by each target
- Required features: VOD/live, DRM/FairPlay, ads, analytics, subtitles, AirPlay, Google Cast, PiP, background playback, or platform-specific controls

### 2) Validate dependency and target setup

- Confirm each app target links the required Bitmovin SDK modules.
- Keep SDK modules version-aligned.
- Treat the analytics / observability collector as independently updatable when it still satisfies the player SDK's minimum required collector version.
- For new integrations, add `https://github.com/bitmovin/player-ios.git` through Swift Package Manager and depend on the `BitmovinPlayer` product.
- Avoid introducing CocoaPods; it is deprecated and should only remain for existing Podfile-based integrations when migration is out of scope.
- Confirm deployment targets remain at or above the supported minimums: iOS 14, tvOS 14, visionOS 1.
- Verify target platform support before wiring a feature into tvOS or visionOS.
- Check app capabilities and entitlements when a feature depends on platform support.
- Avoid broad project-file churn; update only the targets and package configuration required for the task.

### 3) Build player construction deliberately

- Create player/config objects in one clear owner, such as a playback service, view model, coordinator, or controller.
- Keep license, playback, advertising, DRM, analytics, and style configuration explicit.
- Avoid scattering one-off config mutation across SwiftUI views or UIKit lifecycle callbacks.
- Treat config objects as construct-and-apply inputs unless current SDK docs explicitly recommend mutation.

### 4) Attach UI without destabilizing playback

- SwiftUI: use a stable representable/coordinator boundary for SDK views or controllers.
- UIKit: keep view-controller lifecycle, player ownership, and teardown explicit.
- tvOS: preserve focus and remote-control behavior; do not assume touch-first controls map cleanly.
- visionOS: confirm feature availability and layout expectations before reusing iOS-specific UI behavior.
- Fullscreen/PiP/AirPlay should integrate with the SDK and platform lifecycle instead of causing player recreation.

#### SwiftUI fullscreen gotcha

The SwiftUI `VideoPlayerView` wrapper is suitable for inline playback, but SDK fullscreen is not supported through that SwiftUI wrapper yet because it does not expose the underlying `PlayerView` / `fullscreenHandler` surface.

If a SwiftUI app needs Bitmovin SDK fullscreen, wrap UIKit `PlayerView` in `UIViewRepresentable`, keep one stable `PlayerView` instance in the coordinator, set `playerView.fullscreenHandler`, and reparent that same view into a full-screen `UIViewController` on enter/exit. Do not create a second `Player` or replace the playback pipeline for fullscreen.

For fullscreen orientation behavior, check the app's supported interface orientations and make the presented fullscreen controller participate in rotation explicitly when needed.

#### PiP and background playback recipe

For iOS Picture in Picture and background playback, wire all required layers together instead of setting only the SDK flag:

- Enable background playback on the player config, for example `playerConfig.playbackConfig.isBackgroundPlaybackEnabled = true`.
- Enable PiP on the player view config, for example `playerViewConfig.pictureInPictureConfig.isEnabled = true`.
- If the product should enter PiP when backgrounded, verify and set the current SDK's auto-enter property, for example `playerViewConfig.pictureInPictureConfig.shouldEnterOnBackground = true`.
- Configure `AVAudioSession` with a playback category such as `.playback` before playback starts.
- Add `UIBackgroundModes` with `audio` to the app's Info.plist or target configuration.
- After building, inspect the built app's Info.plist to confirm `UIBackgroundModes` is actually present as an array containing `audio`; generated Info.plist build settings may not preserve this correctly in every project setup.

### 5) Add Google Cast deliberately

Google Cast support is not just an SDK flag. Wire all three layers: Bitmovin Cast API, Google Cast sender SDK dependency, and iOS local-network discovery configuration.

Before editing:

- Confirm the installed Bitmovin Player SDK version from `Package.resolved`, the project file, or the local package checkout.
- Verify the current Cast API from manifest-backed docs or generated headers. For Bitmovin Player 3.113.x, the relevant surface is `BitmovinCastManager.initializeCasting(...)`, `PlayerConfig.remoteControlConfig.isCastEnabled`, and, for custom controls, `player.castVideo()` / `player.castStop()`.
- Check whether the project already has Google Cast linked through CocoaPods, a vendored framework, or a Swift package. Do not assume the `BitmovinPlayer` SPM product includes the Google Cast sender SDK.
- If the user points to a local sample, compare that sample's package, Info.plist, app startup, and project-file wiring before inventing a new dependency shape.

For an SPM-based setup with the Google Cast binary SDK:

1. Add a local Swift package such as `GoogleCastSPMProxy/Package.swift` or mirror the user's existing sample path. The package should expose a product named `GoogleCast` backed by a binary target named `GoogleCast`.
2. Use Google's Cast SDK ZIP URL and checksum for the selected version. A previously validated local setup used `GoogleCastSDK-ios-4.8.4_dynamic.zip` with checksum `c9c3a794e8585198b59c6bb7da5418a3194ffa1ffa6f9a1cbdf4dc0ea26dc6cf`, but verify the current URL/checksum before choosing a new version.
3. Add the local package reference to the Xcode project and link the `GoogleCast` product into every app target that enables casting. Prefer Xcode/package tooling when available; if manually patching `project.pbxproj`, follow the file's existing `XCLocalSwiftPackageReference`, `XCSwiftPackageProductDependency`, `PBXBuildFile`, `packageReferences`, and `packageProductDependencies` patterns exactly.
4. Ensure the proxy is a normal tracked folder, not a nested git repository or gitlink. If GitHub shows `Subproject commit ...`, run `git ls-files --stage <proxy-path> .gitmodules`; mode `160000` means SwiftPM files inside the folder will not be visible as normal repo files.

Typical app-side wiring:

```swift
import BitmovinPlayer
import SwiftUI

@main
struct PlaybackApp: App {
    init() {
        BitmovinCastManager.initializeCasting()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
```

Enable casting where the player config is created, keeping it near the existing playback configuration:

```swift
let playerConfig = PlayerConfig()
playerConfig.key = licenseKey
playerConfig.remoteControlConfig.isCastEnabled = true
let player = PlayerFactory.createPlayer(playerConfig: playerConfig)
```

For iOS 14+ local-network discovery, add Info.plist entries for Google Cast Bonjour services. For the default Bitmovin Cast receiver, include both the generic service and the receiver-specific service:

```xml
<key>NSBonjourServices</key>
<array>
    <string>_googlecast._tcp</string>
    <string>_FFE417E5._googlecast._tcp</string>
</array>
<key>NSLocalNetworkUsageDescription</key>
<string>This app uses the local network to discover Google Cast devices.</string>
```

If the app uses a custom receiver app id, replace `FFE417E5` with that app id in the receiver-specific Bonjour entry after verifying the Bitmovin Cast initialization API for custom receivers.

After wiring:

- Run `plutil -lint` on edited plist files.
- Build with Xcode/Xcode MCP so Swift package resolution, local binary artifacts, and target product linking are checked together.
- Inspect `Package.resolved`: local packages may not add pins, so absence of a Google Cast pin is not automatically a failure.
- Runtime validation still requires a discoverable Cast receiver on the same network; a successful build only proves the dependency and API wiring.

### 6) Load sources explicitly

- Use explicit source types when the stream format is known.
- Keep source URL, stream type, DRM, ads, subtitle, thumbnail, and analytics metadata together.
- For source switching, prefer a deliberate transition strategy instead of destroying/recreating the player for routine changes.
- Add deterministic fallback only when the product needs multiple playback candidates.

### 7) Add advertising deliberately

The Apple SDK supports two client-side advertising module paths:

- BAM / Bitmovin advertising: use Bitmovin ad sources, for example `AdSource(..., ofType: .bitmovin)`. Prefer this path unless the user explicitly asks for IMA or the existing app already uses IMA.
- IMA advertising: use IMA ad sources, for example `AdSource(..., ofType: .ima)`. This requires the Google IMA SDK to be linked by the app target in addition to the Bitmovin Player SDK; do not assume the `BitmovinPlayer` SPM product alone provides Google IMA.

Before adding ads, identify the ad module, the ad tag type (VAST, VMAP, or another supported setup), and whether existing catalog metadata is placement-only. Fields such as `ad_markers_json` can describe where ads should appear, but they are not themselves VAST/VMAP ad supply unless the referenced payload contains an actual ad tag/config.

For a BAM pre-roll, keep the setup close to player construction:

```swift
let adSource = AdSource(tag: vastOrVmapTagUrl, ofType: .bitmovin)
let preRoll = AdItem(adSources: [adSource], atPosition: "pre")
playerConfig.advertisingConfig = AdvertisingConfig(schedule: [preRoll])
```

For IMA, first verify the current Google IMA installation instructions and the exact package/product or framework used by the project. Then add the Google IMA dependency to the same app target that links `BitmovinPlayer`, use `.ima` ad sources, and build the target after package resolution. If the user did not ask for IMA, do not add Google IMA.

Treat public sample VAST tags as placeholders only. Prefer product-owned ad tags/configuration when available, and make placeholder tags obvious in code or configuration.

### 8) Listen to events with Combine

Prefer the modern Combine-based event API for Swift integrations:

Swift files that use `ObservableObject`, `@Published`, `AnyCancellable`, or `player.events.on(...)` publishers need `import Combine` explicitly. Do not assume `SwiftUI` or `Foundation` imports make those symbols available in every file.

```swift
import Combine

final class PlaybackObserver {
    private var cancellables = Set<AnyCancellable>()

    func bind(to player: Player) {
        player.events.on(ReadyEvent.self)
            .sink { event in
                // Handle player readiness.
            }
            .store(in: &cancellables)

        player.events.on(PlayerErrorEvent.self)
            .sink { event in
                // Handle player errors.
            }
            .store(in: &cancellables)

        player.events.on(SourceEvent.self)
            .sink { event in
                // Handle events emitted by the current source through the player.
            }
            .store(in: &cancellables)
    }
}
```

SwiftUI can subscribe directly with `onReceive` when the subscription lifetime matches the view:

```swift
VideoPlayerView(player: player, playerViewConfig: playerViewConfig)
    .onReceive(player.events.on(PlayerEvent.self)) { event in
        // Observe all player events.
    }
    .onReceive(player.events.on(SourceEvent.self)) { event in
        // Observe source events emitted through the player.
    }
```

Event API guidance:

- Use `player.events.on(SomePlayerEvent.self)` for player events.
- To receive all player-session events, subscribe to both `player.events.on(PlayerEvent.self)` and `player.events.on(SourceEvent.self)`.
- Use `player.events.on(SourceEvent.self)` for events from the current source as seen through the player.
- Use `source.events.on(SomeSourceEvent.self)` when observing a specific `Source` instance directly.
- Use `playerView.events.on(SomePlayerViewEvent.self)` for Swift-only `PlayerView` UI events.
- Store `AnyCancellable`s for as long as observation should remain active.
- Keep event handling lightweight; dispatch heavier analysis or UI state updates through the app's normal model/coordinator boundary.
- Never use events as a reason to reach into the backing `AVPlayer`.

Legacy and Objective-C guidance:

- The Combine event APIs are Swift-only.
- Existing Objective-C integrations and older Swift code can use listener protocols such as `PlayerListener`, `SourceListener`, and `UserInterfaceListener` through `add(listener:)` / `remove(listener:)`.
- For new Swift integrations, prefer Combine publishers instead of adding listener classes.
- If listener protocols are used, remove listeners explicitly at the same lifecycle boundary where they were added.

### 9) Instrument the session

When diagnosing or integrating a non-trivial flow:

- Enable SDK verbose/debug logging before creating player/source objects.
- Add app-level logs around player creation, source loading, playback start, errors, retries, ad/DRM setup, lifecycle transitions, and teardown.
- Subscribe to the relevant Combine event publishers and log event order with timestamps.
- Include source URL, source type, SDK version, target platform, and feature flags in bug reports when safe to share.

### 10) Apply the roadblock loop

If the agent is stuck:

1. Name the current blocker in one sentence.
2. State what evidence exists and what is still missing.
3. Choose the smallest next probe: search the matching API docs for unfamiliar features, inspect SDK symbols, check logs, reproduce with a known stream, inspect network, validate the HLS stream, or isolate lifecycle behavior.
4. After the probe, write down the verified rule that would have avoided the block.
5. Continue integration using that rule; do not expand scope unless the evidence requires it.

## Troubleshooting runbook

### Always check logs first

- Ensure SDK verbose/debug logging is enabled for the reproduction.
- Collect Xcode console logs, device logs, and app playback logs.
- Look first for license rejection, source-load failures, manifest parsing errors, DRM/FairPlay failures, ad errors, network status codes, ATS issues, and lifecycle-related teardown/reload ordering.
- If logs are noisy, add a short app-specific playback/session prefix and filter around the reproduction window.

### Inspect network requests

- Suggest setting up Charles Proxy to the user when network behavior is unclear.
- Use it to inspect manifest, segment, subtitle, DRM certificate/license, ad tag, analytics, and retry/fallback requests.
- Confirm HTTP status codes, redirects, headers, CORS-like service behavior, TLS/ATS compatibility, and response timing.
- Treat network traces as sensitive; do not ask the user to share tokens, license keys, or private URLs unless they can redact them.

### Validate HLS streams with Apple tools

For unexpected HLS playback behavior, run `mediastreamvalidator` against the sample stream when it is installed:

```shell
mediastreamvalidator "https://example.com/path/to/master.m3u8"
```

- If the tool is missing, tell the user and continue with available evidence.
- Flag validator warnings/errors to the user instead of silently treating them as SDK bugs.
- Distinguish stream-authoring problems from player-integration problems before proposing code changes.

### Reduce to a known-good comparison

- Reproduce with a known-good Bitmovin or Apple sample stream when the user's stream may be invalid.
- Reproduce the user's stream in a minimal sample when the app integration may be the issue.
- Compare event order, network requests, and validator output between the known-good stream and the failing stream.

## Common pitfalls to avoid

- Guessing APIs without checking the manifest-backed markdown docs
- Raising the deployment target without a project requirement or user approval
- Starting a new Objective-C integration when Swift is viable
- Starting a new CocoaPods integration instead of Swift Package Manager
- Accessing or customizing the backing `AVPlayer` instance instead of using Bitmovin Player APIs
- Recreating the player during SwiftUI updates, fullscreen toggles, orientation changes, or routine source switches
- Calling player APIs from an unsafe thread or actor context without SDK support
- Treating every playback error as an SDK bug before checking logs and network requests
- Ignoring license allowlist, bundle identifier, or entitlement mismatches across targets
- Mixing SDK module versions or leaving a target without a required binary/module
- Enabling `remoteControlConfig.isCastEnabled` without linking the Google Cast sender SDK to the app target
- Adding a Google Cast SPM proxy as a nested repo/gitlink, which makes GitHub show `Subproject commit ...` instead of `Package.swift`
- Forgetting `NSBonjourServices` and `NSLocalNetworkUsageDescription` for Cast discovery on iOS 14+
- Defaulting to IMA when BAM / Bitmovin advertising would satisfy the request
- Adding `.ima` ad sources without linking the Google IMA SDK to the affected app target
- Treating catalog ad markers or chapter metadata as actual VAST/VMAP ad tags
- Assuming iOS behavior automatically applies to tvOS or visionOS
- Debugging HLS playback without validating the manifest when stream authoring looks suspicious
- Hiding `mediastreamvalidator`, Charles, or log findings from the user because they are "only warnings"

## Verification checklist

After integration changes, verify each applicable item:

1. **Build/compile**
   - The affected iOS, tvOS, and/or visionOS targets compile with the selected SDK modules.

2. **Playback smoke test**
   - A representative stream loads, starts, pauses, resumes, seeks when supported, and tears down cleanly.

3. **Log health**
   - Verbose/debug logs are enabled during troubleshooting.
   - No unexplained SDK errors, source-load failures, DRM/ad failures, or lifecycle warnings remain.
   - Advertising integrations log enough ad events or errors to prove the selected module is wired.
   - Cast integrations log or visibly prove Cast manager initialization and device discovery when a receiver is available.

4. **Network evidence**
   - Manifest/segment/license/ad requests look correct when inspected through available logs or Charles Proxy.

5. **Stream validity**
   - `mediastreamvalidator` has been run for suspicious HLS streams when available, and results are summarized to the user.

6. **Lifecycle resilience**
   - Background/foreground, navigation, fullscreen/PiP/AirPlay, and teardown paths do not recreate or leak players unexpectedly.

7. **Platform UX**
   - iOS touch controls, tvOS focus/remote behavior, and visionOS layout expectations are checked for the affected targets.

## Response behavior while executing

- Keep updates concise and evidence-led.
- State which manifest-backed markdown document or SDK evidence was used when APIs are ambiguous.
- When blocked, report the exact missing API, project wiring issue, log line, network result, or stream-validator finding.
- Suggest the next smallest probe before proposing broad rewrites.
