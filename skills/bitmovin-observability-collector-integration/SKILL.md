---
name: bitmovin-observability-collector-integration
description: >-
  Integrate the Bitmovin Observability (Analytics) collector into any video player on any platform.
  Use WHENEVER a developer wants to add Bitmovin Analytics / Observability tracking, "set up the
  collector", "enable analytics", "track playback / QoE / impressions", wire up a player to the Bitmovin
  dashboard, or asks why their analytics data is missing, empty, or wrong after integrating. Covers Web,
  Android/Fire TV, iOS/tvOS/visionOS, and Roku, for both the Bitmovin Player and third-party engines
  (HLS.js, Shaka, Video.js, HTML5, ExoPlayer, Media3, AVPlayer, THEOplayer, CAFv3). Use it even when the
  user only names their player ("add analytics to my Shaka player") without saying "Bitmovin collector".
  Knows that the Bitmovin Player has analytics pre-integrated while third-party players need a separate
  collector with a managed attach/detach lifecycle.
---

# Bitmovin Observability Collector Integration

Wire the collector into the developer's specific player on their specific platform, correctly the first
time, then help them enrich and verify the data.

Do not dump a generic snippet. Integration mechanics differ by **platform** (install/import and lifecycle)
and by **player type** (which class you attach). Resolve both before writing code.

## The one distinction that changes everything

```
Is the playback engine the Bitmovin Player, or a third-party player?
│
├─ BITMOVIN PLAYER  → analytics is PRE-INTEGRATED. No separate package, no manual
│                     attach, no manual source lifecycle. You just enable it in the
│                     player config with the analytics license key. (Done in ~2 lines.)
│
└─ THIRD-PARTY      → analytics is a SEPARATE collector you install, instantiate with a
   (HLS.js, Shaka,    player-specific adapter/factory, attach to the player, and
    Video.js, HTML5,   detach/re-attach around every source change and on teardown.
    AVPlayer, ExoPlayer,  This lifecycle is where ~all integration bugs live.
    Media3, THEOplayer, ...)
```

Everything else (the config object, the metadata fields) is shared across both paths and across platforms —
see `references/configuration.md`.

## Onboarding workflow

Walk these phases in order. Don't skip Phase 0 — a perfect code integration still produces zero data if the
license/allowlist step is missing, and that is the single most common "no data showing up" cause.

### Phase 0 — Prerequisites (platform-independent, always required)

1. **Analytics license key.** Distinct from the *player* license key. Found in the dashboard at
   Observability → Licenses. Confirm the developer has one and knows it is the *analytics* key.
2. **Allowlist the origin.** The license rejects data from un-allowlisted origins. Add the web **domain**
   (subdomains + `localhost` are allowed by default), the app **bundle identifier** (iOS), or **package
   name** (Android) under the license's "Domains / Package Names / Bundle Identifiers" section.
3. Use separate licenses for **dev vs prod** so test data never contaminates production metrics.

If either #1 or #2 is missing, the integration will look correct but show no data. Flag this explicitly.

### Phase 1 — Resolve the integration matrix

Determine three things (ask only what you can't infer from the project — a `package.json` with `hls.js`,
a `Podfile`, a `build.gradle`, or existing player code usually answers all three):

| Question | Why it matters |
|----------|----------------|
| **Platform?** Web / Android / iOS-tvOS-visionOS / Roku | Selects the package, import syntax, and lifecycle rules. |
| **Player type?** Bitmovin Player vs which third-party engine | Selects pre-integrated vs separate collector, and the exact adapter/factory class. |
| **(3rd-party + native only) Dependency manager?** SPM/CocoaPods (iOS) · Gradle module: ExoPlayer vs Media3-ExoPlayer (Android) | Selects the exact artifact and import. Media3 ≠ legacy ExoPlayer — they are different collector artifacts. |

Then load the matching reference file and follow it:

| Platform | Reference |
|----------|-----------|
| Web (browser, Smart TV, set-top, console, CAF receiver) | `references/web.md` |
| Android / Android TV / Fire TV | `references/android.md` |
| iOS / tvOS / visionOS | `references/ios.md` |
| Roku | `references/roku.md` |
| Any platform — one session per program on a continuous live/linear stream | `references/program-change.md` |

### Phase 2 — Basic integration

Goal: minimal correct tracking. The only required config field is the analytics license key. The platform
reference gives you the exact Bitmovin-pre-integrated path and the third-party path (install → config →
adapter/factory → attach → lifecycle). Get this working and confirm data flows **before** adding any
customization — it isolates "is the wiring correct?" from "is my metadata correct?".

### Phase 3 — Customization

Only after basic data flows. Enrich the session via the config and metadata objects. This is the same
surface on every platform (with a few platform-only fields). See `references/configuration.md` for the full
field reference, when each field is required, and the privacy-sensitive ones. Set at minimum `videoId` +
`title` (unlocks per-title breakdowns) and `cdnProvider` if multi-CDN.

**Live linear / per-program sessions.** If the player runs a *continuous* live stream (FAST channel, 24×7
broadcast, EPG) where the program changes but the source/manifest does not, a single watch is otherwise one
giant impression that smears per-title metrics. Use `programChange(newSourceMetadata)` at each program
boundary to end the current session and start a fresh impression (new `videoId`/`title`/`customData`, same
viewer) without reloading the source. Availability and the exact per-platform call differ — notably Roku
supports it on the **THEOplayer collector only**, and a pre-integrated player only has it if its bundled
collector is new enough. See `references/program-change.md`.

### Phase 4 — Verify

Confirm the integration actually works and the data is clean. See `references/verification.md` for the
dashboard check, what counts as an impression, the Observability-vs-Player impression-count gap, and the
common error codes (videostart timeout, buffering timeout, quality-change threshold).

## Hard rules that prevent silent data loss

These come up regardless of platform — enforce them:

- **License key ≠ player key.** Putting the player key in the analytics config is a frequent mistake.
- **Allowlist before testing.** Otherwise samples are dropped server-side with no client error.
- **Third-party = manage the lifecycle.** Attach after the player exists. On **native (iOS/Android)** every
  source change needs detach → update `sourceMetadata` → swap source → re-attach, plus a detach before
  teardown (`release()` on Android). Skipping it merges multiple videos into one session (sequence numbers
  don't reset) and corrupts startup metrics. **Web** adapters bind at construction and usually need no manual
  detach/attach — follow the per-player note in `web.md`.
- **`customUserId` is a prerequisite for session tracking.** Without it, every impression collapses into a
  single null user. But never send raw PII / emails — use an opaque or hashed ID (see configuration ref).
- **Match the collector version to the player/engine version** when the player isn't Bitmovin's — newer
  collectors track newer engines. Prefer staying current on both.

## Output expectations

When you produce an integration, give the developer:
1. The exact install/dependency line for their manager.
2. A minimal **basic** snippet (license key only) that compiles in their stack.
3. The lifecycle handling (third-party only), including source-change and teardown.
4. A short customization block they can fill in (videoId, title, cdnProvider, customUserId).
5. The one-line verification step (where in the dashboard data appears).

Keep snippets in the developer's actual language/framework. Don't show four platforms when they're on one.
