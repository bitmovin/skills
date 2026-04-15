---
name: bitmovin-player
description: Integrate the Bitmovin Web Player SDK into a web app. Use when the user asks to add video playback, embed a player, play HLS/DASH/MP4, set up DRM (Widevine/PlayReady/FairPlay), integrate ads, or work with the Bitmovin Player in any way. Covers both Player v8 (stable) and Player Web X / PWX (next-gen).
---

# Bitmovin Web Player Integration Skill

You are an expert at integrating the Bitmovin Web Player SDK. When the user asks you to add video playback, embed a player, integrate streaming, or work with the Bitmovin Player — use this skill.

## When to activate

- User asks to add video playback to a web app
- User mentions Bitmovin Player, `bitmovin-player`, or streaming integration
- User needs HLS, DASH, Smooth, or DRM playback in a browser
- User wants to customize player UI, add ads, subtitles, or analytics

## Choose the player version deliberately

**Default to Player Web v8** unless the user explicitly asks for PWX, is evaluating PWX, or the architecture tradeoff matters.

Only ask which player they want when the answer changes the implementation, for example:
- The user mentions PWX, Player Web X, bundles, or custom packages
- The user wants to benchmark or compare v8 vs PWX
- The user is migrating an existing PWX proof of concept

Recommended options:

1. **Player Web v8** (`bitmovin-player`) — the stable production default. Supports HLS, DASH, Smooth, DRM (Widevine/PlayReady/FairPlay), ads (VAST/VMAP/IMA), analytics, subtitles, Chromecast, AirPlay. Mature API, full documentation.

2. **Player Web X / PWX** (`@bitmovin/player-web-x`) — the next-generation modular player. Still evolving and feature-incomplete. Use when the user explicitly wants PWX, wants the package architecture, or is validating PWX-specific behavior.

## Live docs MCP server

For anything this skill doesn't cover — obscure APIs, recent SDK releases, specific code samples — query the **Bitmovin Docs MCP** instead of guessing:

```
https://agentic.bitmovin.com/documentation/mcp
```

It indexes `developer.bitmovin.com` documentation and the official GitHub sample repositories (`bitmovin-player-web-samples`, `bitmovin-player-ios-samples`, `bitmovin-player-android-samples`, `bitmovin-player-roku-samples`, `bitmovin-api-sdk-examples`).

**When to use it:**
- You need a working code sample for a specific feature (DRM flavor, custom ad integration, subtitle styling, etc.)
- The user asks about a feature not documented in this skill
- You're unsure about a config field or API signature — verify against live docs before writing code
- The user reports the SDK behavior differs from what this skill describes (SDK may have moved on)

Add it as an MCP connector in the chat client, or fetch URLs from `developer.bitmovin.com` directly. Prefer the MCP when it's available — it's faster than fetching individual doc pages.

---

# Player Web v8 (stable)

## Installation

```bash
npm install bitmovin-player
```

For explicit UI customization or version pinning, also install the dedicated UI package:

```bash
npm install bitmovin-player-ui
```

The main package includes the player runtime and TypeScript types. The dedicated `bitmovin-player-ui` package ships the UI assets and type declarations for explicit UI work.

### CDN alternative

```html
<script src="https://cdn.bitmovin.com/player/web/8/bitmovinplayer.js"></script>
<script src="https://cdn.bitmovin.com/player/web/8/bitmovinplayer-ui.js"></script>
<link rel="stylesheet" href="https://cdn.bitmovin.com/player/web/8/bitmovinplayer-ui.css" />
```

**These are UMD bundles that attach to global namespaces — NOT ES modules.** Do not `import` from the CDN URL:
- Player: `window.bitmovin.player.Player`
- UI: `window.bitmovin.playerui.UIFactory`

For ES module `import` syntax, install via npm and use a bundler.

### License key

Every Bitmovin Player instance needs a license key. `localhost` is auto-allowed; deployed domains must be added to the license allowlist.

Get one of these ways:
- **Bitmovin Dashboard**: https://dashboard.bitmovin.com → Player → Licenses
- **Bitmovin CLI** (if installed): `bitmovin player licenses list` — lists all licenses with their keys and allowed domains. `bitmovin player licenses get <id> --json` for details.

## Basic integration

```typescript
import { Player } from 'bitmovin-player';

const container = document.getElementById('player');

const player = new Player(container, {
  key: 'YOUR_LICENSE_KEY',
  playback: {
    autoplay: false,
    muted: false,
  },
});

// Load a source
await player.load({
  hls: 'https://example.com/stream.m3u8',
  title: 'My Video',
  poster: 'https://example.com/poster.jpg',
});
```

### UI guidance for current v8 releases

**Last verified:** 2026-04-15 against Bitmovin Web release notes and UI v4 docs.

For new Web SDK integrations on current v8 releases, **do not assume you must wire `UIFactory` manually**. Since Web `8.245.0` (released 2026-02-09), Bitmovin's default Web UI integration migrated to UI v4 and standard setups can use the default UI without extra wiring.

Use the explicit UI package only when you need one of these:
- Pin a specific UI version
- Customize the UI build process
- Stay on an older player version where you still initialize the UI manually
- Build a non-default UI variant intentionally

### Explicit or custom UI integration

For explicit UI wiring, prefer the dedicated `bitmovin-player-ui` package because it ships type declarations.

```typescript
import { Player } from 'bitmovin-player';
import { UIFactory } from 'bitmovin-player-ui';
import 'bitmovin-player-ui/dist/css/bitmovinplayer-ui.css';

const player = new Player(document.getElementById('player'), {
  key: 'YOUR_LICENSE_KEY',
  ui: false,
});

UIFactory.buildUI(player);
```

When you want to pin the hosted UI assets explicitly, configure them through `PlayerConfig.location`:

```typescript
const player = new Player(document.getElementById('player'), {
  key: 'YOUR_LICENSE_KEY',
  location: {
    ui: 'https://cdn.jsdelivr.net/npm/bitmovin-player-ui@4/dist/js/bitmovinplayer-ui.js',
    ui_css: 'https://cdn.jsdelivr.net/npm/bitmovin-player-ui@4/dist/css/bitmovinplayer-ui.css',
  },
});
```

If you set `ui: false`, you are responsible for attaching a UI yourself.

## Source configuration

The source object tells the player what to play. At least one of `hls`, `dash`, `smooth`, or `progressive` is required.

**API reference:** https://developer.bitmovin.com/playback/reference/web-sdk-source-config

```typescript
await player.load({
  // Stream URL — pick one:
  hls: 'https://cdn.example.com/stream.m3u8',       // HLS
  dash: 'https://cdn.example.com/stream.mpd',        // DASH
  smooth: 'https://cdn.example.com/stream.ism',      // Smooth Streaming
  progressive: 'https://cdn.example.com/video.mp4',  // Progressive MP4/WebM

  // Metadata
  title: 'Video Title',
  description: 'Video description',
  poster: 'https://cdn.example.com/poster.jpg',

  // Subtitles
  subtitleTracks: [
    { url: 'https://cdn.example.com/subs_en.vtt', lang: 'en', label: 'English' },
    { url: 'https://cdn.example.com/subs_de.vtt', lang: 'de', label: 'Deutsch' },
  ],

  // Thumbnails (for seek preview)
  thumbnailTrack: { url: 'https://cdn.example.com/thumbs.vtt' },
});
```

## Player configuration

The config object passed to `new Player(container, config)`.

**API reference:** https://developer.bitmovin.com/playback/reference/web-sdk-player-config

| Field | Type | Description |
|-------|------|-------------|
| `key` | `string` | **Required.** License key from Bitmovin Dashboard. |
| `playback.autoplay` | `boolean` | Start playback automatically. Default: `false`. |
| `playback.muted` | `boolean` | Start muted (required for autoplay in most browsers). |
| `ui` | `boolean` | Set to `false` when using UIFactory. |
| `adaptation.startupBitrate` | `string` | Initial quality (e.g. `"2000kbps"`). |
| `network.preprocessHttpRequest` | `function` | Modify requests before they're sent (add tokens, headers). |
| `network.sendHttpRequest` | `function` | Completely replace the HTTP fetch mechanism. |
| `buffer.video.forwardduration` | `number` | Forward buffer target in seconds. Default: 30. |
| `style.width` | `string` | Player width. Default: `'100%'`. |
| `style.aspectratio` | `string` | Aspect ratio. Default: `'16:9'`. |

## Player API

**API reference:** https://developer.bitmovin.com/playback/reference/web-sdk-player-api

```typescript
// Playback control
await player.load(sourceConfig);
player.play();
player.pause();
player.seek(120);         // seek to 2:00
player.setVolume(50);     // 0-100

// State queries
player.getCurrentTime();  // seconds
player.getDuration();     // seconds (Infinity for live)
player.isPlaying();
player.isPaused();
player.getVolume();

// Quality
player.getAvailableVideoQualities();
player.setVideoQuality('auto');

// Events
player.on('play', () => { ... });
player.on('pause', () => { ... });
player.on('timechanged', () => { ... });
player.on('error', (e) => { console.error(e.code, e.message); });
player.on('ready', () => { ... });
player.on('sourceloaded', () => { ... });

// Cleanup
player.destroy();
```

## DRM (Digital Rights Management)

Add `drm` to the source config. The player handles license acquisition automatically.

```typescript
await player.load({
  dash: 'https://cdn.example.com/encrypted.mpd',
  drm: {
    widevine: {
      LA_URL: 'https://license.example.com/widevine',
      headers: { 'X-Auth': 'token123' },  // optional
    },
    playready: {
      LA_URL: 'https://license.example.com/playready',
    },
    fairplay: {
      LA_URL: 'https://license.example.com/fairplay',
      certificateURL: 'https://license.example.com/fairplay/cert',
    },
  },
});
```

**Key points:**
- Widevine works on Chrome, Firefox, Edge, Android
- PlayReady works on Edge (Windows), some Smart TVs
- FairPlay works on Safari (macOS, iOS)
- Provide multiple DRM configs for cross-browser support — the player auto-selects
- HLS with FairPlay uses `hls` + `drm.fairplay`; DASH with Widevine uses `dash` + `drm.widevine`

## Advertising

Supports VAST, VMAP, and IMA SDK integration.

```typescript
const player = new Player(container, {
  key: 'YOUR_KEY',
  advertising: {
    adBreaks: [
      {
        tag: { url: 'https://example.com/vast-preroll.xml', type: 'vast' },
        position: 'pre',
      },
      {
        tag: { url: 'https://example.com/vast-midroll.xml', type: 'vast' },
        position: '50%',  // midroll at 50%
      },
      {
        tag: { url: 'https://example.com/vast-postroll.xml', type: 'vast' },
        position: 'post',
      },
    ],
  },
});
```

For VMAP (server-defined ad schedule):
```typescript
advertising: {
  adBreaks: [
    { tag: { url: 'https://example.com/vmap.xml', type: 'vmap' }, position: 'pre' },
  ],
}
```

## Analytics

Bitmovin Analytics is bundled with the player. Enable by providing an analytics license key:

```typescript
const player = new Player(container, {
  key: 'YOUR_PLAYER_KEY',
  analytics: {
    key: 'YOUR_ANALYTICS_KEY',
    title: 'My Video',
    videoId: 'video-123',
    customData1: 'category-sports',
  },
});
```

Set `analytics: false` to disable.

## Network customization

### Adding auth tokens to requests

```typescript
const player = new Player(container, {
  key: 'YOUR_KEY',
  network: {
    preprocessHttpRequest: (type, request) => {
      if (type.startsWith('media/') || type.startsWith('manifest/')) {
        request.headers['Authorization'] = 'Bearer ' + getToken();
      }
      return Promise.resolve(request);
    },
  },
});
```

### Completely replacing the network layer

Use `sendHttpRequest` to intercept ALL HTTP requests. Useful for proxying, offline playback, or running in restricted environments (like MCP App sandboxes).

```typescript
network: {
  sendHttpRequest: (type, request) => {
    const isText = type.startsWith('manifest/');
    return {
      getResponse: async () => {
        const resp = await myCustomFetch(request.url);
        return {
          request,
          url: request.url,
          headers: {},
          status: 200,
          statusText: 'OK',
          body: isText ? await resp.text() : await resp.arrayBuffer(),
        };
      },
      setProgressListener: () => {},
      cancel: () => {},
    };
  },
}
```

## Framework integration patterns

### React

```tsx
import { useEffect, useRef } from 'react';
import { Player } from 'bitmovin-player';

function BitmovinPlayer({ source, licenseKey }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<Player | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const player = new Player(containerRef.current, {
      key: licenseKey,
    });
    playerRef.current = player;

    return () => {
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [licenseKey]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    let cancelled = false;

    (async () => {
      try {
        await player.load(source);
      } catch (error) {
        if (!cancelled) {
          console.error('Bitmovin load failed', error);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [source]);

  return <div ref={containerRef} />;
}
```

**Important:** Create the player once, then load new sources separately. Do not key the effect off `source.hls || source.dash || source.progressive` because that misses other source changes such as DRM, subtitles, poster, start offset, or analytics metadata.

### Next.js

The player touches `window`/`document` on import — it cannot SSR. Use dynamic import:

```tsx
import dynamic from 'next/dynamic';

const BitmovinPlayer = dynamic(() => import('./BitmovinPlayer'), { ssr: false });
```

### Vue

```vue
<template>
  <div ref="container" />
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { Player } from 'bitmovin-player';

const container = ref(null);
let player = null;

onMounted(async () => {
  player = new Player(container.value, { key: 'YOUR_KEY' });
  await player.load({ hls: 'https://example.com/stream.m3u8' });
});

onUnmounted(() => player?.destroy());
</script>
```

## Common mistakes

1. **Assuming manual `UIFactory.buildUI()` is required on every v8 integration** — On current Web SDK releases, standard setups can use the default UI integration without manual wiring.

2. **Disabling the UI without attaching one** — If you set `ui: false`, the player will not create a default UI for you.

3. **Not destroying on unmount** — The player creates DOM elements and event listeners. Always call `player.destroy()` when removing the player.

4. **Autoplay without muted** — Browsers block unmuted autoplay. Set `playback: { autoplay: true, muted: true }` or handle the `play()` promise rejection.

5. **SSR importing** — The player SDK accesses `window` and `document` at import time. Always use dynamic imports with `ssr: false` in Next.js/Nuxt.

6. **Missing explicit UI assets when pinning or customizing the UI** — If you override `location.ui` / `location.ui_css` or wire the UI package manually, load the matching JS and CSS assets together.

7. **Loading multiple sources without awaiting** — `player.load()` returns a promise. Await it before calling `load()` again or querying state.

8. **Hardcoding the license key** — Use environment variables. The key is exposed to the browser (client-side SDK) but shouldn't be in source control.

## Modular builds

For smaller bundles, import only the modules you need:

```typescript
import { Player } from 'bitmovin-player/modules/bitmovinplayer-core';
import EngineBitmovinModule from 'bitmovin-player/modules/bitmovinplayer-engine-bitmovin';
import MseRendererModule from 'bitmovin-player/modules/bitmovinplayer-mserenderer';
import HlsModule from 'bitmovin-player/modules/bitmovinplayer-hls';
import AbrModule from 'bitmovin-player/modules/bitmovinplayer-abr';
import ContainerTSModule from 'bitmovin-player/modules/bitmovinplayer-container-ts';
import ContainerMP4Module from 'bitmovin-player/modules/bitmovinplayer-container-mp4';
import PolyfillModule from 'bitmovin-player/modules/bitmovinplayer-polyfill';

[EngineBitmovinModule, MseRendererModule, HlsModule, AbrModule,
 ContainerTSModule, ContainerMP4Module, PolyfillModule]
  .forEach(m => Player.addModule(m));
```

This gives you HLS playback at ~1.2MB instead of 2.2MB. Add `DashModule`, `DrmModule`, etc. as needed.

## Test streams

Use these public streams for development and testing:

| Stream | URL | Type |
|--------|-----|------|
| Sintel (HLS) | `https://bitmovin-a.akamaihd.net/content/sintel/hls/playlist.m3u8` | HLS |
| Sintel (DASH) | `https://bitmovin-a.akamaihd.net/content/sintel/sintel.mpd` | DASH |
| Art of Motion (DASH) | `https://bitmovin-a.akamaihd.net/content/MI201109210084_1/mpds/f08e80da-bf1d-4e3d-8899-f0f6155f6efa.mpd` | DASH |
| Big Buck Bunny (MP4) | `https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4` | Progressive |
| Tears of Steel (HLS) | `https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8` | HLS |

## Reference links (v8)

- **Player Config:** https://developer.bitmovin.com/playback/reference/web-sdk-player-config
- **Source Config:** https://developer.bitmovin.com/playback/reference/web-sdk-source-config
- **Player API:** https://developer.bitmovin.com/playback/reference/web-sdk-player-api
- **Getting Started Guide:** https://developer.bitmovin.com/playback/docs/getting-started-web
- **Web Release Notes:** https://developer.bitmovin.com/playback/docs/release-notes-web
- **What's New in UI v4:** https://developer.bitmovin.com/playback/docs/whats-new-in-ui-v4
- **npm package:** https://www.npmjs.com/package/bitmovin-player
- **UI package:** https://www.npmjs.com/package/bitmovin-player-ui
- **GitHub samples:** https://github.com/bitmovin/bitmovin-player-web-samples

---

# Player Web X / PWX (next-generation)

Player Web X is Bitmovin's next-generation web player built on the **Phoenix Framework** — a from-scratch architecture with structured concurrency, an effect system, and a package-first design. It is modular, extensible, and produces smaller bundles than v8.

**Last verified:** 2026-04-15 against the PWX getting started guide, v8 compatibility guide, support matrix, and package docs.

**Status:** PWX is in active development and its capability surface is volatile. Use v8 for production by default unless the user explicitly needs PWX's package architecture or is validating PWX itself.

## What works in PWX today

- HLS playback
- DASH playback (partially supported)
- Sources API / multi-source workflows
- Load control and view mode packages
- WebVTT subtitles
- Optional analytics package support
- v8 API compatibility layer (partial)

## What does NOT work yet in PWX

- DRM and advertising are still incomplete enough that you should verify the live docs before promising them
- Smooth Streaming — not supported
- Progressive playback — not supported
- WebRTC — not supported
- Network API support is currently marked unsupported in the official support matrix
- Quality and playback APIs are still marked `Next` in the official support matrix
- Some v8 compatibility APIs are NOPs

## Installation

```bash
npm install @bitmovin/player-web-x
```

### CDN bundles

```html
<!-- HLS bundle (most common) -->
<script src="https://cdn.bitmovin.com/player/web_x/10/bundles/playerx-hls.js"></script>

<!-- DASH bundle (preliminary) -->
<script src="https://cdn.bitmovin.com/player/web_x/10/bundles/playerx-dash.js"></script>

<!-- v8 compatibility bundle (use v8 API with PWX engine) -->
<script src="https://cdn.bitmovin.com/player/web_x/10/bundles/playerx-bitmovin-v8.js"></script>
```

**These are UMD bundles — NOT ES modules.** Load via `<script src>`, not `import`. Global namespace attachments:

| Bundle | Global |
|--------|--------|
| `playerx-hls.js`, `playerx-dash.js`, `playerx-core.js` | `window.bitmovin.playerx.Player` |
| `playerx-bitmovin-v8.js`, `playerx-bitmovin-v8-core.js` | `window.bitmovin.player.Player` (⚠️ overwrites v8!) |

For ES module `import` syntax, install via npm (`@bitmovin/player-web-x`) and use a bundler.

## Basic integration (native PWX API)

The PWX API is **fundamentally different from v8**. Do not mix them. Minimum working example:

```typescript
import { Player } from '@bitmovin/player-web-x/bundles/playerx-hls';
// CDN: const { Player } = window.bitmovin.playerx;

const player = Player({
  key: 'YOUR_LICENSE_KEY',
  defaultContainer: document.getElementById('player'),
});

// sources.add() returns a source HANDLE synchronously — it is NOT a promise.
// Do not `await` it. The handle is where playback control lives.
const source = player.sources.add({
  resources: [{ url: 'https://example.com/stream.m3u8' }],
});

// Trigger playback via the source, not the player. Autoplay config is unreliable;
// call source.play() explicitly (muted so browsers allow it).
source.play({ isMuted: true });

// Listen for first-frame / state changes on the SOURCE, not the player.
source.events.on('playing', () => console.log('first frame rendered'));

// Teardown
player.dispose();  // NOT player.destroy() — that's a v8 name
```

### Critical differences from v8 — read this before coding

| Concern | v8 | PWX (native) |
|---------|----|-----|
| Construct player | `new Player(container, config)` | `Player({ defaultContainer, ...config })` (no `new`) |
| Load a stream | `player.load({ hls: url })` returns a Promise | `player.sources.add({ resources: [{ url }] })` returns a source handle synchronously |
| Play / pause | `player.play()`, `player.pause()` | `source.play({ isMuted: true })`, `source.pause()` — lives on the source handle, NOT the player |
| Subscribe to events | `player.on('playing', fn)` | `source.events.on('playing', fn)` OR `player.events.on(...)` — the player instance has no `.on()` |
| Dispatch commands | N/A | `player.events.dispatch({ type: 'play', ... })` (event-driven architecture) |
| Autoplay config | `playback: { autoplay: true, muted: true }` works | Config does not autoplay — must call `source.play()` |
| Teardown | `player.destroy()` | `player.dispose()` |
| Player instance surface | rich API: play, pause, seek, on, load, destroy, ... | minimal: `{ packages, events, sources, dispose }` |

**DO NOT** call `play()` on the underlying `<video>` element to work around missing playback. That races the player's internal start flow and produces "play() request was interrupted by a new load request." Always use `source.play()`.

### PWX config

- `key` — license key (same as v8)
- `defaultContainer` — DOM element to mount into (v8 passes this as a constructor arg; PWX puts it in config)
- `playback.muted`, `playback.autoplay` — present in config, but unreliable in current PWX. Prefer explicit `source.play({ isMuted: true })`.

## Available bundles

| Bundle | Description | Use when |
|--------|-------------|----------|
| `playerx-hls.js` | HLS playback (TS + fMP4) | Most common use case |
| `playerx-dash.js` | DASH playback (fMP4, preliminary) | DASH-only content |
| `playerx-core.js` | Core only, add packages manually | Custom/minimal builds |
| `playerx-bitmovin-v8.js` | HLS + v8 API compatibility layer | Migrating from v8 |
| `playerx-bitmovin-v8-core.js` | Core + v8 API base compatibility | Custom v8-compat builds |

## Using the v8 compatibility layer

If you want the familiar v8 API (`new Player()`, `player.load()`, etc.) with the PWX engine:

```html
<script src="https://cdn.bitmovin.com/player/web_x/10/bundles/playerx-bitmovin-v8.js"></script>
<script>
  // Same API as v8!
  const player = new bitmovin.player.Player(
    document.getElementById('player'),
    {
      key: 'YOUR_KEY',
      playback: { autoplay: true, muted: true },
      location: {
        ui: 'https://cdn.bitmovin.com/player/web/8/bitmovinplayer-ui.js',
        ui_css: 'https://cdn.bitmovin.com/player/web/8/bitmovinplayer-ui.css',
      },
    }
  );
  player.load({ hls: 'https://example.com/stream.m3u8' });
</script>
```

This mirrors the current official v8-compat documentation more closely than manually calling `UIFactory.buildUI()`. Prefer the documented `location.ui` / `location.ui_css` path unless you have a specific reason to own the UI bootstrap yourself.

**Caveat:** Not all v8 APIs are implemented. Some methods are NOPs pending PWX feature completion. Check the live [support matrix](https://developer.bitmovin.com/playback/docs/player-web-x-support-matrix) before relying on specific features.

### Loading v8 AND PWX v8-compat on the same page

Both bundles attach to `window.bitmovin.player.Player` — whichever loads second wins. To run both side-by-side (e.g. an A/B demo), capture each reference between script loads:

```html
<!-- 1) Load v8 -->
<script src="https://cdn.bitmovin.com/player/web/8/bitmovinplayer.js"></script>
<script src="https://cdn.bitmovin.com/player/web/8/bitmovinplayer-ui.js"></script>
<script>
  window.V8Player = window.bitmovin.player.Player;      // capture v8
</script>

<!-- 2) Load PWX v8-compat (this OVERWRITES window.bitmovin.player.Player) -->
<script src="https://cdn.bitmovin.com/player/web_x/10/bundles/playerx-bitmovin-v8.js"></script>
<script>
  window.PwxPlayer = window.bitmovin.player.Player;     // capture PWX v8-compat
</script>

<script>
  const v8 = new window.V8Player(v8Container, { key, ui: false });
  const pwx = new window.PwxPlayer(pwxContainer, { key, ui: false });
  bitmovin.playerui.UIFactory.buildUI(v8);
  bitmovin.playerui.UIFactory.buildUI(pwx);             // same UI on both
  v8.load({ hls: url });
  pwx.load({ hls: url });
</script>
```

`window.bitmovin.playerui` is a separate namespace from a separate script — it is not affected by the collision.

## Measuring PWX vs v8 startup time

Both v8 and the PWX v8-compat bundle emit a `'playing'` event when the first frame renders. Measure time-to-first-frame like this:

```typescript
async function measureStartup(player, source) {
  const firstFrame = new Promise(resolve => player.on('playing', () => resolve(performance.now())));
  const t0 = performance.now();
  await player.load(source);
  const t1 = await firstFrame;
  return t1 - t0;  // startup in ms
}
```

Run both players in parallel (so network contention is equal) or sequentially (for isolated numbers) depending on what you're benchmarking. Do **not** hardcode an expected delta into your guidance: startup results vary significantly by browser, device, stream packaging, cache state, and SDK version.

## Custom packages

PWX's killer feature is its package system. You can extend, replace, or add functionality:

```typescript
import { Player } from '@bitmovin/player-web-x';

const player = Player({
  key: 'YOUR_KEY',
  defaultContainer: document.getElementById('player'),
});

// Add packages for the features you need
player.packages.add(hlsPackage);
player.packages.add(adaptationPackage);
player.packages.add(myCustomPackage);
```

See [Creating packages](https://developer.bitmovin.com/playback/docs/player-web-x-creating-packages) for the package authoring guide.

## Reference links (PWX)

- **About PWX:** https://developer.bitmovin.com/playback/docs/about-player-web-x
- **Getting Started:** https://developer.bitmovin.com/playback/docs/player-web-x-getting-started
- **Bundles & Packages:** https://developer.bitmovin.com/playback/docs/player-web-x-bundles-packages
- **v8 Compatibility:** https://developer.bitmovin.com/playback/docs/player-web-x-v8-compatibility
- **Support Matrix:** https://developer.bitmovin.com/playback/docs/player-web-x-support-matrix
- **Features:** https://developer.bitmovin.com/playback/docs/player-web-x-features
- **Release Notes:** https://developer.bitmovin.com/playback/docs/player-web-x-release-notes
- **API Docs (CDN):** https://cdn.bitmovin.com/player/web_x/beta/10/docs/index.html
- **npm package:** https://www.npmjs.com/package/@bitmovin/player-web-x
