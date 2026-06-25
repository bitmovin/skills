# Web Collector

Package `bitmovin-analytics`. ES5-compatible but needs ES2015/ES2016 polyfills on old environments.
Install once for the whole web path:

```bash
npm i bitmovin-analytics      # or: yarn add bitmovin-analytics
```
or via script tag:
```html
<script type="text/javascript" src="https://cdn.bitmovin.com/analytics/web/2/bitmovin-analytics.js"></script>
```

The shared config object (used by every path below; full field list in `configuration.md`):
```ts
const analyticsConfig = {
  key: '<ANALYTICS_LICENSE_KEY>',
  videoId: 'VIDEO_ID',
};
```

---

## Path A — Bitmovin Player (pre-integrated)

Analytics ships inside the Bitmovin Player. Do **not** install `bitmovin-analytics` for this path.

### Standard build
Enable it by adding an `analytics` block to the player config — that's the whole integration:
```ts
const config = {
  key: '<YOUR PLAYER KEY>',
  analytics: {
    key: '<ANALYTICS_LICENSE_KEY>',
    videoId: 'VIDEO_ID',
  },
};
```

### Modular build
If you assemble the player from modular packages (e.g. to pin a different collector version), register the
analytics module manually, then use the same `analytics` config block as above.

npm:
```ts
import { Player } from 'bitmovin-player/modules/bitmovinplayer-core';
import { PlayerModule as AnalyticsModule } from 'bitmovin-analytics';
Player.addModule(AnalyticsModule);
```
script tag:
```js
bitmovin.player.Player.addModule(bitmovin.analytics.PlayerModule);
```

---

## Path B — Third-party players (adapter pattern)

Pattern is uniform: create the `analyticsConfig`, create your player, then instantiate the player-specific
**adapter** with `new XAdapter(config, player)`. The adapter binds to the player at construction; for most
web players you do not need a manual detach/attach cycle, but you should create the adapter at the right
point in the player's own lifecycle (noted per player below).

Import adapters from `bitmovin-analytics`.

### HLS.js
```ts
import { HlsAdapter } from 'bitmovin-analytics';
const player = new Hls();
const analytics = new HlsAdapter(analyticsConfig, player);
```

### Shaka
```ts
import { ShakaAdapter } from 'bitmovin-analytics';
const player = new shaka.Player(video);
const analytics = new ShakaAdapter(analyticsConfig, player);
```
**Shaka UI library gotcha:** when the UI builds the player for you, attach to the *local* player, not the UI
wrapper:
```ts
const ui = video['ui'];
const localPlayer = ui.getControls().getLocalPlayer(); // important
const analytics = new ShakaAdapter(analyticsConfig, localPlayer);
```

### Video.js
```ts
import { VideojsAdapter } from 'bitmovin-analytics';
const player = videojs('my-video', vjsOptions);
const analytics = new VideojsAdapter(analyticsConfig, player);
```

### Native HTML5 `<video>`
```ts
import { HTMLVideoElementAdapter } from 'bitmovin-analytics';
const video = document.getElementById('video');
const analytics = new HTMLVideoElementAdapter(analyticsConfig, video);
```

### THEOplayer / Dolby Optiview
```ts
import { THEOplayerAdapter } from 'bitmovin-analytics';
const player = new THEOplayer.Player(theoHtmlElement, {/* ... */});
const analytics = new THEOplayerAdapter(analyticsConfig, player);
```

### Chromecast CAFv3 receiver
```ts
import { CAFv3Adapter } from 'bitmovin-analytics';
const context = cast.framework.CastReceiverContext.getInstance();
const analytics = new CAFv3Adapter(analyticsConfig, context);
```

### Dash.js (deprecated adapter)
`DashjsAdapter` is deprecated:
```ts
import { DashjsAdapter } from 'bitmovin-analytics';
const dashjsPlayer = dashjs.MediaPlayer().create();
const analytics = new DashjsAdapter(analyticsConfig, dashjsPlayer);
```

---

---

## Per-program sessions on a continuous/live stream (`programChange`)

For a continuous live/linear stream where the program changes but the source/manifest does not, split the
watch into one analytics session per program with `programChange(sourceMetadata)` — it ends the current
impression and starts a new one (new `videoId`/`title`/`customData`) without reloading the source. Supported
on the pre-integrated Bitmovin Player and the HLS.js / Shaka / Video.js / HTML5 / THEOplayer / CAFv3
adapters (collector **v2.56.0+**; NOT PWX).
```ts
// pre-integrated Bitmovin Player
player.analytics.programChange({ videoId: 'program-002', title: 'Evening News', isLive: true });
// third-party adapter
adapter.programChange({ videoId: 'program-002', title: 'Evening News', isLive: true });
```
> If `player.analytics` only has `sourceChange` (older bundled collector), the player predates `programChange`
> — update the player or pin a newer analytics module via the modular build. `sourceChange(config)` is a
> separate API for actual stream-URL changes (call it before `player.load()`), not a per-program substitute.

Full cross-platform semantics, availability matrix, and caveats: `program-change.md`.

---

## Notes
- Confirm the exact set of currently supported third-party players against
  https://developer.bitmovin.com/playback/docs/supported-platforms-analytics — deprecations move over time.
- For Smart TV / set-top / console web targets, the same adapters apply; see
  `https://developer.bitmovin.com/playback/docs/how-to-setup-bitmovin-analytics-on-smarttvs` for device caveats.
- Source/page reference: https://developer.bitmovin.com/playback/docs/setup-analytics-web
