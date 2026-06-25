# Verify the Integration

After wiring, confirm data actually flows and is clean.

## 1. Confirm data appears
Events record automatically once the collector is attached (or analytics is enabled on the Bitmovin Player).
Play a session, then check the dashboard: **Observability → Audience** (`https://bitmovin.com/dashboard/analytics/audience`).
A new impression should show within a short delay.

## 2. If nothing shows up — triage in this order
1. **Allowlist.** Is the origin (domain / bundle id / package name) added to *this* license? Un-allowlisted
   samples are dropped server-side with no client error. (Highest-probability cause.)
2. **Right key on the right license.** Is the key the **analytics** license key (not the player key), and
   does the dashboard you're checking correspond to that license?
3. **Attachment (third-party).** Was the collector attached *after* the player existed, and is it still
   attached during playback? On native, was it detached prematurely?
4. **Lifecycle (third-party).** On a source change, did you detach → update metadata → swap → re-attach? If
   sessions look merged or startup metrics look wrong, the lifecycle order is usually off.
5. **Sandbox testing:** there is no separate sandbox — use a dedicated dev license instead
   (https://developer.bitmovin.com/playback/docs/is-there-a-sandbox-environment-to-test-bitmovin-analytics).

## 3. Impression semantics (set expectations)
- What counts as an analytics impression:
  https://developer.bitmovin.com/playback/docs/what-counts-as-an-analytics-impression
- **Observability vs Player impression counts differ** by design — don't treat a mismatch as a bug:
  https://developer.bitmovin.com/playback/docs/why-is-there-a-difference-between-my-observability-and-player-impression-counts

## 4. Common error codes (what they mean)
- `ANALYTICS_VIDEOSTART_TIMEOUT_REACHED` — playback never started within the window (often a real startup
  failure or a source/DRM issue):
  https://developer.bitmovin.com/playback/docs/what-is-an-analytics_videostart_timeout_reached-error
- `ANALYTICS_BUFFERING_TIMEOUT_REACHED` — stalled buffering beyond threshold:
  https://developer.bitmovin.com/playback/docs/what-is-a-analytics_buffering_timeout_reached-error
- `ANALYTICS_QUALITY_CHANGE_THRESHOLD_EXCEEDED` — excessive quality switches in a session (max 50
  switches/hour recorded):
  https://developer.bitmovin.com/playback/docs/what-is-an-analytics_quality_change_threshold_exceeded-error
- Cardinality errors — a `customData` field exceeded 15,000 distinct values in the time-frame:
  https://developer.bitmovin.com/playback/docs/whats-analytics-cardinality-and-why-it-triggers-errors
- Top-errors workflow for debugging: https://developer.bitmovin.com/playback/docs/using-top-errors-for-debugging

## 5. Programmatic checks (optional)
Beyond the dashboard, data is queryable via the Analytics API and the Bitmovin Observability MCP server for
automated smoke-tests of an integration:
- API: https://developer.bitmovin.com/playback/docs/getting-started-with-the-analytics-api
- Observability MCP: https://developer.bitmovin.com/playback/docs/bitmovin-observability-mcp-server
