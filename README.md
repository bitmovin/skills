# Bitmovin Player Plugin for Claude Code

A Claude Code plugin that teaches Claude how to integrate the Bitmovin Web Player SDK — both **Player v8** (stable) and **Player Web X / PWX** (next-gen). Install it once and Claude always knows how to build Bitmovin Player integrations correctly.

## Install

```bash
# Add the Bitmovin marketplace
/plugin marketplace add bitmovin/bitmovin-player-skill

# Install the plugin
/plugin install bitmovin-player@bitmovin
```

After install, the skill loads in every Claude Code session automatically. No further config.

Verify with *"What skills do you have access to?"* — `bitmovin-player` should appear.

## What it does

When you ask Claude to add video playback with Bitmovin, the skill:

1. **Defaults to Player v8** and only asks about PWX when the choice materially changes implementation
2. **Uses current UI guidance** — default UI v4 for modern v8 setups, explicit/custom UI paths when needed
3. **Writes correct code** — right npm package, right import paths, right API calls
4. **Covers DRM, ads, analytics, subtitles, network customization**
5. **Uses framework patterns** for React, Next.js (SSR-safe), and Vue
6. **Warns about common mistakes** and links to authoritative docs

## Why this exists

LLMs have stale or confused Bitmovin Player knowledge. Common failures without this plugin:

- Wrong npm package (`@bitmovin/player` — doesn't exist, it's `bitmovin-player`)
- Assuming manual `UIFactory` wiring is required on every modern v8 integration
- Using stale UI v3/v4 wiring or the wrong asset-loading path
- No SSR guard on Next.js imports → crash
- Outdated doc URLs (`/playback/docs/*` instead of `/playback/reference/*`)
- Mixing v8 and PWX APIs in the same code

This plugin encodes the right answers once so every Claude session avoids them.

## What's covered

### Player v8 (stable)

Installation, license keys, current default UI v4 guidance for modern releases, explicit/custom UI patterns, source config (HLS/DASH/Smooth/progressive), subtitles, thumbnails, poster, DRM (Widevine/PlayReady/FairPlay), ads (VAST/VMAP), analytics, network customization (`preprocessHttpRequest` + `sendHttpRequest`), React/Next.js/Vue patterns, modular builds, test streams, and full API references.

### Player Web X / PWX (next-gen)

Native PWX API (`Player({key, defaultContainer})` + `player.sources.add()`), CDN bundles (`hls`, `dash`, `core`, `bitmovin-v8` compat), v8 compatibility layer for drop-in migration, custom packages system, and dated notes about current feature gaps from the official support matrix.

## Use outside Claude Code

The skill file is a plain markdown — it also works when copied into other agent skill directories (Cursor, Copilot, Codex, Goose, Gemini CLI, Cline). The plugin/marketplace layer is Claude-Code-specific, but the skill content itself is portable.

```bash
# Example: for Cursor
cp skills/bitmovin-player/SKILL.md ~/.cursor/skills/bitmovin-player/
```

## Contributing

The skill is a single markdown file at `skills/bitmovin-player/SKILL.md`. Update it, bump the version in `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`, open a PR. Keep instructions concrete: code examples for every claim, primary-source links, and explicit "common mistakes" sections.

## License

MIT
