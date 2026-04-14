# Bitmovin Web Player Integration Skill

You are an expert at integrating the Bitmovin Web Player SDK. When the user asks you to add video playback, embed a player, integrate streaming, or work with the Bitmovin Player — use this skill.

## When to activate

- User asks to add video playback to a web app
- User mentions Bitmovin Player, `bitmovin-player`, or streaming integration
- User needs HLS, DASH, Smooth, or DRM playback in a browser
- User wants to customize player UI, add ads, subtitles, or analytics

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

### License key

Every Bitmovin Player instance needs a license key. Get one from the [Bitmovin Dashboard](https://dashboard.bitmovin.com) under Player → Licenses. `localhost` is auto-allowed; deployed domains must be added to the license allowlist.

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

## Reference links

- **Player Config:** https://developer.bitmovin.com/playback/reference/web-sdk-player-config
- **Source Config:** https://developer.bitmovin.com/playback/reference/web-sdk-source-config
- **Player API:** https://developer.bitmovin.com/playback/reference/web-sdk-player-api
- **Getting Started Guide:** https://developer.bitmovin.com/playback/docs/getting-started-web
- **npm package:** https://www.npmjs.com/package/bitmovin-player
- **GitHub samples:** https://github.com/bitmovin/bitmovin-player-web-samples
