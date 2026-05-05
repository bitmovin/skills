---
name: bitmovin-player-android
description: Integrate and troubleshoot the Bitmovin Android Player SDK in Kotlin/Compose Android apps, including playback setup, Web UI, PiP/fullscreen handlers, media session, cast, TV variants, and source-loading robustness.
---

# Bitmovin Android Player SDK Integration

## API source of truth

Use this documentation as the authoritative reference for API behavior, class names, method signatures, setup steps, and feature integration:

**https://cdn.bitmovin.com/player/android/md/3/index.md**

Use this samples repository as the implementation companion reference (patterns, wiring examples, end-to-end app setups):

**https://github.com/bitmovin/bitmovin-player-android-samples**

Use Android release notes to determine the latest Bitmovin Player Android SDK version:

**https://developer.bitmovin.com/playback/docs/release-notes-android.md**

Version policy: if not specified otherwise by the customer, use the latest Bitmovin Player Android SDK version.

If examples, cached artifacts, old snippets, or prior assumptions conflict with the docs, follow the docs.

## When to use this skill

Use this skill when the task involves any of the following in an Android app:

- Add or upgrade Bitmovin Player Android SDK integration
- Fix compile/runtime issues in Bitmovin player setup
- Integrate Bitmovin Web UI with `PlayerView`
- Add PiP/fullscreen behavior through Bitmovin handlers
- Add Bitmovin media session / background playback support
- Add cast support through Bitmovin integration
- Support phone/tablet + Android TV Bitmovin player UX variants
- Improve playback source loading reliability (VOD/live)

## Core principles

1. **Docs-first, implementation-second**
   - Verify required APIs in the official docs before editing code.
   - Do not treat local AAR/JAR introspection as source of truth.

2. **Use documented SDK entry points and API shapes exactly**
   - Respect property-vs-function APIs as documented.
   - Avoid guesswork around builders, configs, and handler wiring.

3. **Prefer SDK-native integrations over custom glue**
   - Use Bitmovin-provided handlers/configs for PiP/fullscreen/cast/media session where available.

4. **Keep playback path unified across device classes**
   - Reuse one player pipeline; vary UI/UX by form factor (e.g., TV vs small screen).

5. **Prefer Playlist API when switching sources**
   - For source transitions (next/previous/channel-style flows), prefer the Bitmovin Playlist API over repeated ad-hoc source reload patterns.

6. **Reuse player instances for performance**
   - Keep player instances long-lived for a playback scope when possible.
   - Avoid unnecessary player destruction/recreation during normal source changes.

7. **Treat configs as immutable where possible**
   - Treat player/source/playback configs as immutable after creation.
   - When behavior changes are needed, create new config objects instead of mutating existing instances.

8. **Use `+jason` Bitmovin dependencies when ExoPlayer/Media3 is also used**
   - If the app also depends on ExoPlayer/Media3 directly, use Bitmovin `+jason` flavor dependencies consistently.
   - Keep Bitmovin modules version-aligned and flavor-aligned.

9. **Assume `Player` API is main-thread-only unless docs explicitly state otherwise**
   - Access `Player` APIs from the main thread by default.
   - Allow off-main usage only for APIs the official docs explicitly mark as safe.

## Integration workflow

### 1) Validate setup from docs

Before code changes, confirm from docs:

- Required repository configuration
- Correct dependency coordinates
- SDK version policy: if the customer did not request a specific version, use the latest version from Android release notes
- Feature modules needed (core player, media session, UI/cast-related modules)
- Any mandatory manifest/service metadata

### 2) Configure player construction cleanly

Build player config explicitly and keep it centralized:

- `PlayerConfig` setup (including license key when required)
- `PlaybackConfig` setup for standard Android playback behavior
  - audio focus handling
  - audio becoming noisy handling
- Remote control / cast config where needed

### 3) Compose + `PlayerView` integration

- Use `Player` + `PlayerView` in Compose via `AndroidView` pattern.
- Bind lifecycle correctly (start/resume/pause/stop/destroy) for both player and view.
- Prevent leaks by disposing player/view/session cleanly.

### 4) Custom Bitmovin Web UI + native↔JS bridge

- Bitmovin Web UI is open source and can be customized: **https://github.com/bitmovin/bitmovin-player-ui**.
- Provide your custom Web UI bundle through `UiConfig.WebUi(...)` (typically via `jsLocation`/`cssLocation`, optionally `supplementalCssLocation`).
- Sample-verified pattern (`CustomHtmlUiKotlin`): load UI assets from `file:///android_asset/custom-bitmovinplayer-ui.min.js` and `...css`.
- Register `PlayerView.setCustomMessageHandler(CustomMessageHandler(...))` to enable native↔JS communication.
- JS → native: expose `@JavascriptInterface` methods (for example `closePlayer`) on the handler object; JS can call them via `window.bitmovin.customMessageHandler.sendSynchronous(...)` / `sendAsynchronous(...)`.
- Native → JS: call `customMessageHandler.sendMessage(name, data)`; JS can subscribe via `window.bitmovin.customMessageHandler.on(name, callback)`.

### 5) Source loading strategy

- Prefer hardcoding source types when the stream type is known.
- Use `SourceConfig.fromUrl(...)` when source auto-detection is needed or the source type is unknown.
- For multi-URL playback candidates (e.g., HLS/DASH alternatives), implement deterministic fallback behavior.

### 6) PiP/fullscreen via Bitmovin handlers

Prefer Bitmovin handler wiring over fully custom PiP/fullscreen implementation:

- Register Bitmovin fullscreen handler on `PlayerView`
- Register Bitmovin PiP handler on `PlayerView`
- Forward lifecycle hooks required by handlers

### 7) Media session + background playback

- Use Bitmovin media session integration (`MediaSessionService` flow) for transport controls/background continuity.
- Keep session lifecycle tightly coupled to active player instance.

### 8) Cast integration

- Enable cast in Bitmovin remote/cast configuration.
- Add required Android manifest metadata/provider setup for cast framework integration.
- Reflect cast availability/active state through the documented player API shape.

### 9) TV + mobile support

- Keep core player flow shared.
- Switch Bitmovin Web UI variant by form factor (TV vs small-screen variant).
- Ensure TV discoverability and launcher behavior are configured when targeting Android TV.

### 10) Source switching strategy (Playlist-first)

- For frequent source changes (episodes/channels/next-previous flows), prefer the Bitmovin Playlist API.
- Avoid full player teardown for normal transitions.
- Use one-off source loading directly only when playlist behavior is not needed.

### 11) Player lifecycle for performance

- Reuse one player per playback scope where feasible.
- Rebind view/UI to the reused player instead of recreating the player instance.
- Destroy the player only when the playback context is truly finished.

### 12) Config immutability pattern

- Build configs in a construct-once/apply-once style where possible.
- On behavior changes, create fresh config instances and apply deliberately.
- Avoid mutating shared config instances after they are handed to SDK components.

### 13) Dependency flavor policy

- If ExoPlayer/Media3 is present in the app, use Bitmovin `+jason` flavor dependencies.
- Keep all Bitmovin modules aligned to the same flavor/version line.
- Check dependency graph consistency before merge.

### 14) Threading discipline

- Run I/O and parsing on background dispatchers.
- Marshal back to main thread before calling `Player` APIs.
- Assume `Player` APIs are main-thread-only unless the official docs explicitly state otherwise.

## Common pitfalls to avoid

- Using outdated repository/dependency coordinates
- Pinning an older SDK version without a customer requirement
- Calling documented properties as functions (or vice versa)
- Relying on source auto-detection when the source type is known and should be explicit
- Re-implementing PiP/fullscreen behavior that Bitmovin handlers already provide
- Decoupling media session lifecycle from player lifecycle
- Recreating players for routine source switches instead of using playlist/reuse patterns
- Mutating config objects in-place after SDK handoff
- Mixing `+jason` and non-`+jason` Bitmovin artifacts in the same integration
- Calling `Player` APIs off-main without explicit documentation support

## Verification checklist (Bitmovin-focused)

After integration changes, verify each applicable capability:

1. **Build/compile**
   - App compiles successfully with updated Bitmovin integration.

2. **Playback smoke test**
   - Load and play at least one representative stream.
   - Validate source load path and fallback behavior if implemented.

3. **Lifecycle resilience**
   - Background/foreground transitions do not break player state.

4. **Feature-specific checks (as applicable)**
   - PiP/fullscreen controls behave correctly
   - Media session appears and is controllable
   - Cast discovery/session works
   - TV UI variant and remote-control flow work

5. **Log-based diagnostics**
   - For SDK debug logs, set `DebugConfig.isLoggingEnabled = true` (**before** creating any `Player`, `Source`, or `PlayerView`).
   - Prefer setting it once in `Application.onCreate` when troubleshooting.
   - SDK debug output is emitted through `android.util.Log`.
   - Use this mainly for troubleshooting/bug reports; requires Bitmovin Player Android SDK `>= 3.93.0`.
   - Add/confirm targeted app playback logs around source resolution, fallback decisions, and session transitions.

6. **Source-switch performance**
   - Verify source transitions are smooth and avoid unnecessary player recreation.

7. **Dependency graph health**
   - Verify Bitmovin modules are flavor/version aligned.
   - If ExoPlayer/Media3 is present, verify Bitmovin uses `+jason` flavor artifacts consistently.

8. **Main-thread API usage**
   - Verify `Player` API access happens on main thread by default.
   - Allow exceptions only where official docs explicitly state off-main safety.

## Response behavior while executing

- Keep updates concise and implementation-focused.
- Explicitly state which Bitmovin docs sections were treated as source of truth when APIs are ambiguous.
- If blocked by doc ambiguity, report the exact class/API in question and the conflicting evidence.
