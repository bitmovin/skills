---
name: bitmovin-player-android
description: Integrate and troubleshoot the Bitmovin Android Player SDK in Kotlin/Compose Android apps, including playback setup, Web UI, PiP/fullscreen handlers, media session, cast, TV variants, and source-loading robustness.
---

# Bitmovin Android Player SDK Integration

## API source of truth

Use this documentation as the authoritative reference for API behavior, class names, method signatures, setup steps, and feature integration:

**https://cdn.bitmovin.com/player/android/md/3/index.md**

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

## Integration workflow

### 1) Validate setup from docs

Before code changes, confirm from docs:

- Required repository configuration
- Correct dependency coordinates
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

### 4) Source loading strategy

- Prefer `SourceConfig.fromUrl(...)` when source auto-detection is supported and appropriate.
- Avoid hardcoding source type unless there is a concrete need.
- For multi-URL playback candidates (e.g., HLS/DASH alternatives), implement deterministic fallback behavior.

### 5) PiP/fullscreen via Bitmovin handlers

Prefer Bitmovin handler wiring over fully custom PiP/fullscreen implementation:

- Register Bitmovin fullscreen handler on `PlayerView`
- Register Bitmovin PiP handler on `PlayerView`
- Forward lifecycle hooks required by handlers

### 6) Media session + background playback

- Use Bitmovin media session integration (`MediaSessionService` flow) for transport controls/background continuity.
- Keep session lifecycle tightly coupled to active player instance.

### 7) Cast integration

- Enable cast in Bitmovin remote/cast configuration.
- Add required Android manifest metadata/provider setup for cast framework integration.
- Reflect cast availability/active state through the documented player API shape.

### 8) TV + mobile support

- Keep core player flow shared.
- Switch Bitmovin Web UI variant by form factor (TV vs small-screen variant).
- Ensure TV discoverability and launcher behavior are configured when targeting Android TV.

## Common pitfalls to avoid

- Using outdated repository/dependency coordinates
- Building first-time dependency resolution with `--offline`
- Calling documented properties as functions (or vice versa)
- Forcing explicit source type when `fromUrl(...)` is better suited
- Re-implementing PiP/fullscreen behavior that Bitmovin handlers already provide
- Decoupling media session lifecycle from player lifecycle

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
   - Add/confirm targeted playback logs around source resolution, fallback decisions, and session transitions.

## Response behavior while executing

- Keep updates concise and implementation-focused.
- Explicitly state which Bitmovin docs sections were treated as source of truth when APIs are ambiguous.
- If blocked by doc ambiguity, report the exact class/API in question and the conflicting evidence.
