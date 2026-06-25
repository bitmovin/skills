# Configuration & Customization Reference

The config and metadata objects are shared across all platforms (a few fields are platform-specific, marked
below). This is the Phase 3 surface — apply it only after basic tracking works.

Two object families:
- **AnalyticsConfig** — collector behaviour (retry, privacy, ad tracking, error transform).
- **Metadata** — describes the session/content. `DefaultMetadata` is source-independent (set once);
  `SourceMetadata` is per-source (set/refresh on each source change). On Web the metadata fields sit on the
  same config object passed to the adapter / `analytics` block.

## Required

| Field | Notes |
|-------|-------|
| `key` (Web/Roku) / `licenseKey` (iOS/Android) | The **analytics** license key. The only mandatory field. Not the player key. |

## Optional config (collector behaviour)

| Field | Default | Platforms | Purpose |
|-------|---------|-----------|---------|
| `retryPolicy` | `NO_RETRY` | iOS, Android | Retry sending samples; `RetryPolicy.LONG_TERM` enables offline tracking. |
| `adTrackingDisabled` | `false` | iOS, Android | Disable client-side ad tracking (server-side ads unaffected). |
| `ssaiEngagementTrackingEnabled` | `false` | iOS, Android, Web | Server-side ad engagement (quartile) tracking. Premium — must be enabled on the account. |
| `errorTransformerCallback` | — | iOS, Android, Web | Callback to mutate analytics error data when a player error occurs. |
| `randomizeUserId` | `false` | iOS, Android | `false` = stable per-device id (connects sessions on a device). `true` = fresh UUID per session (use when users opt out of tracking). |
| `cookiesEnabled` | `true` | Web | Stores a random UUID in a cookie to cross-reference sessions (web analogue of stable user id). |

## Optional metadata (describe the content/session)

| Field | Why set it | Unlocks |
|-------|-----------|---------|
| `title` | Human-readable content name. | Video title filter/breakdown, bitrate heatmap |
| `videoId` | Stable content id. **Prerequisite** for title filter/breakdown — without it the title filter can't apply. Same id with multiple titles → data split across them. | Video title filter/breakdown, bitrate heatmap |
| `cdnProvider` | Identify the serving CDN. | CDN filter/breakdown (compare CDN performance) |
| `isLive` | Distinguish live vs VOD explicitly; auto-detection only resolves after stream metadata arrives, so set it for accuracy. | Live filter/breakdown |
| `experimentName` | Tag A/B test groups (e.g. new player version rollout). | Experiment filter/breakdown |
| `customUserId` | Subscriber/user id. **Required for session tracking** — without it all impressions map to one null user. Enables cross-device tracking. | Session tracking |
| `customData1` … `customDataN` | Free-form filter/breakdown dimensions (app version, profile id, content category, …). | Custom filters/breakdowns |
| `path` | Breadcrumb of where in the app the user is. | (iOS, Android only) |

### `customData` limits
- 5 fields included by default; expandable up to **50** total (extra fields may incur cost — request via
  dashboard support).
- Each field: **160 character** limit.
- Query cardinality cap: **15,000** distinct values per field within the selected time-frame (exceeding it
  triggers cardinality errors — see verification ref).
- Fields are relabelled in the dashboard under license settings.

## Privacy guidance
- Never send raw PII. Send `customUserId` as an opaque id or a **hashed** value, never an email — and keep
  the format consistent across your data sources if you plan to join datasets.
- For opt-out users, prefer `randomizeUserId: true` (native) / `cookiesEnabled: false` (web).
- Do-Not-Track and cookie behaviour:
  https://developer.bitmovin.com/playback/docs/do-not-track-cookie-handling-in-analytics and
  https://developer.bitmovin.com/playback/docs/cookies-in-bitmovin-analytics

## Related how-tos
- SSAI tracking setup: https://developer.bitmovin.com/playback/docs/how-to-set-up-ssai-tracking
- Modify error data client-side: https://developer.bitmovin.com/playback/docs/how-to-modify-error-data
- Change customData values at runtime: https://developer.bitmovin.com/playback/docs/how-to-change-customdata-fields-values
- Randomize userId per session: https://developer.bitmovin.com/playback/docs/how-can-the-userid-be-randomized-for-each-session-of-the-same-user

Source page: https://developer.bitmovin.com/playback/docs/configuration-analytics
