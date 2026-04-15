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

## IMPORTANT: Ask which player version first

Before writing any code, **ask the user** which player they want:

1. **Player Web v8** (`bitmovin-player`) — the stable, feature-complete SDK. Supports HLS, DASH, Smooth, DRM (Widevine/PlayReady/FairPlay), ads (VAST/VMAP/IMA), analytics, subtitles, Chromecast, AirPlay. Mature API, full documentation.

2. **Player Web X / PWX** (`@bitmovin/player-web-x`) — the next-generation player built on the Phoenix Framework. Modular package-first architecture, smaller bundles, extensible via custom packages. **Still in active development — not yet feature complete.** HLS with fMP4/TS works, DASH is preliminary. DRM, ads, and some APIs are not yet implemented or are NOPs.

**Default to v8** unless the user explicitly asks for PWX or needs the modular architecture. If unsure, recommend v8 for production and PWX for experimentation/greenfield projects.

---

# Player Web v8 (stable)

## Installation

```bash
npm install bitmovin-player
```

The package includes:
- `bitmovin-player` — core player + all modules (2.2MB)
- `bitmovin-player/bitmovinplayer-ui` — default UI module
- `bitmovin-player/bitmovinplayer-ui.css` — UI stylesheet
- TypeScript types in `bitmovin-player/types/`

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
import { UIFactory } from 'bitmovin-player/bitmovinplayer-ui';
import 'bitmovin-player/bitmovinplayer-ui.css';

const container = document.getElementById('player');

const player = new Player(container, {
  key: 'YOUR_LICENSE_KEY',
  playback: {
    autoplay: false,
    muted: false,
  },
  ui: false, // disable built-in UI, we use UIFactory instead
});

// Attach the default UI
UIFactory.buildUI(player);

// Load a source
await player.load({
  hls: 'https://example.com/stream.m3u8',
  title: 'My Video',
  poster: 'https://example.com/poster.jpg',
});
```

### Important: the UI module

The Bitmovin Player UI is a **separate module**. The pattern is:
1. Set `ui: false` in the player config (disables the legacy built-in UI)
2. Import `UIFactory` from `bitmovin-player/bitmovinplayer-ui`
3. Call `UIFactory.buildUI(player)` after creating the player

If you skip step 2-3, the player renders video but shows no controls.

**TypeScript note:** The UI module has no bundled type declarations. Add a shim:
```typescript
// types/bitmovin-player-ui.d.ts
declare module 'bitmovin-player/bitmovinplayer-ui' {
  export const UIFactory: any;
}
declare module 'bitmovin-player/bitmovinplayer-ui.css';
```

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
import { UIFactory } from 'bitmovin-player/bitmovinplayer-ui';
import 'bitmovin-player/bitmovinplayer-ui.css';

function BitmovinPlayer({ source, licenseKey }) {
  const containerRef = useRef(null);
  const playerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const player = new Player(containerRef.current, {
      key: licenseKey,
      ui: false,
    });
    UIFactory.buildUI(player);
    player.load(source);
    playerRef.current = player;

    return () => {
      player.destroy();
      playerRef.current = null;
    };
  }, [source.hls || source.dash || source.progressive]);

  return <div ref={containerRef} />;
}
```

**Important:** The player modifies the container DOM. Always `destroy()` on unmount. Use a stable key/ref to avoid unnecessary re-mounts.

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
import { UIFactory } from 'bitmovin-player/bitmovinplayer-ui';
import 'bitmovin-player/bitmovinplayer-ui.css';

const container = ref(null);
let player = null;

onMounted(() => {
  player = new Player(container.value, { key: 'YOUR_KEY', ui: false });
  UIFactory.buildUI(player);
  player.load({ hls: 'https://example.com/stream.m3u8' });
});

onUnmounted(() => player?.destroy());
</script>
```

## Common mistakes

1. **Forgetting `ui: false`** — If you use `UIFactory.buildUI()`, set `ui: false` in the config. Otherwise you get double controls.

2. **Not destroying on unmount** — The player creates DOM elements and event listeners. Always call `player.destroy()` when removing the player.

3. **Autoplay without muted** — Browsers block unmuted autoplay. Set `playback: { autoplay: true, muted: true }` or handle the play() promise rejection.

4. **SSR importing** — The player SDK accesses `window` and `document` at import time. Always use dynamic imports with `ssr: false` in Next.js/Nuxt.

5. **Missing UI stylesheet** — Import `bitmovin-player/bitmovinplayer-ui.css` or the controls render unstyled.

6. **Wrong UIFactory method** — It's `UIFactory.buildUI(player)`, not `buildDefaultUI`.

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
- **npm package:** https://www.npmjs.com/package/bitmovin-player
- **GitHub samples:** https://github.com/bitmovin/bitmovin-player-web-samples

---

# Player Web X / PWX (next-generation)

Player Web X is Bitmovin's next-generation web player built on the **Phoenix Framework** — a from-scratch architecture with structured concurrency, an effect system, and a package-first design. It is modular, extensible, and produces smaller bundles than v8.

**Status:** PWX is in active development. It is **not yet feature complete**. Use v8 for production unless the user explicitly needs PWX's modular architecture.

## What works in PWX today

- HLS playback (fMP4 and TS segments)
- DASH playback (preliminary)
- Adaptive bitrate switching
- Subtitles (WebVTT)
- v8 API compatibility layer (partial)

## What does NOT work yet in PWX

- DRM (Widevine, PlayReady, FairPlay) — not implemented
- Advertising (VAST/VMAP/IMA) — not implemented
- Smooth Streaming — not supported
- **Native PWX has no production-ready UI** — it renders bare HTML5 `<video>` controls. For a styled UI today, use the v8-compat bundle with `UIFactory.buildUI(player)` (see below).
- Some v8 API methods are NOPs (they exist but do nothing)
- Full API documentation is preliminary

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
import { Player } from '@bitmovin/player-web-x';
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
<script src="https://cdn.bitmovin.com/player/web/8/bitmovinplayer-ui.js"></script>
<script src="https://cdn.bitmovin.com/player/web_x/10/bundles/playerx-bitmovin-v8.js"></script>
<link rel="stylesheet" href="https://cdn.bitmovin.com/player/web/8/bitmovinplayer-ui.css" />
<script>
  // Same API as v8!
  const player = new bitmovin.player.Player(
    document.getElementById('player'),
    { key: 'YOUR_KEY', ui: false }
  );
  bitmovin.playerui.UIFactory.buildUI(player);  // full v8 UI works here too!
  player.load({ hls: 'https://example.com/stream.m3u8' });
</script>
```

**This is currently the recommended path if you need PWX with a real UI.** The same `UIFactory.buildUI()` used with v8 works against the v8-compat bundle — giving PWX the identical styled controls (play/pause/volume/scrubber/PiP/fullscreen/settings).

**Caveat:** Not all v8 APIs are implemented. Some methods are NOPs pending PWX feature completion. Check the [support matrix](https://developer.bitmovin.com/playback/docs/player-web-x-support-matrix) before relying on specific features.

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

Run both players in parallel (so network contention is equal) or sequentially (for isolated numbers) depending on what you're benchmarking. Typical observed results on a fast connection with a small HLS stream: **PWX ~450ms, v8 ~520ms** — PWX is usually ~50-100ms faster on startup.

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
