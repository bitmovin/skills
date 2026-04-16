# Bitmovin Player Skill

A portable agent skill for integrating the Bitmovin Web Player SDK — both **Player v8** (stable) and **Player Web X / PWX** (next-gen).

This repo is intentionally **not tied to Claude Code only**:
- The core skill lives in [`skills/bitmovin-player/SKILL.md`](skills/bitmovin-player/SKILL.md)
- `.claude-plugin/` provides a Claude Code plugin wrapper
- `plugins/bitmovin-player/.codex-plugin/plugin.json` provides a Codex plugin wrapper
- The canonical `skills/` layout is compatible with [`skills.sh`](https://skills.sh)
- The same skill file can also be installed directly into ChatGPT/Codex-style local skills directories

## Install In Claude Code

```bash
# Add the Bitmovin marketplace
/plugin marketplace add bitmovin/bitmovin-player-skill

# Install the plugin
/plugin install bitmovin-player@bitmovin
```

After install, the skill loads in every Claude Code session automatically. No further config.

Verify with *"What skills do you have access to?"* — `bitmovin-player` should appear.

## Install In ChatGPT / Codex

If your ChatGPT/Codex setup supports local skills, copy the skill into your Codex home:

```bash
mkdir -p ~/.codex/skills/bitmovin-player
cp skills/bitmovin-player/SKILL.md ~/.codex/skills/bitmovin-player/SKILL.md
```

That gives ChatGPT/Codex the same Bitmovin Player guidance without depending on the Claude-specific plugin wrapper.

## Install With skills.sh

This repository is compatible with [`skills.sh`](https://skills.sh) because the canonical skill lives under `skills/bitmovin-player/SKILL.md`, which is one of the repository layouts that `npx skills` discovers automatically.

Examples:

```bash
# List the skills exposed by this repo
npx skills add bitmovin/bitmovin-player-skill --list

# Install just this skill interactively
npx skills add bitmovin/bitmovin-player-skill --skill bitmovin-player

# Install to specific agents
npx skills add bitmovin/bitmovin-player-skill --skill bitmovin-player -a claude-code -a codex

# Install globally without prompts
npx skills add bitmovin/bitmovin-player-skill --skill bitmovin-player -g -y
```

Use `skills.sh` when you want the portable skill installed into an agent's normal skill directory. Use the Claude or Codex plugin wrappers in this repo only when you specifically want those host-native plugin surfaces.

## Install In Codex As A Plugin

This repo now includes a Codex plugin wrapper at `plugins/bitmovin-player/` plus repo-local marketplace metadata at `.agents/plugins/marketplace.json`.

For a home-local Codex plugin install, copy the plugin and marketplace entry into the standard Codex locations:

```bash
mkdir -p ~/.agents/plugins ~/plugins
cp -R plugins/bitmovin-player ~/plugins/bitmovin-player
cp .agents/plugins/marketplace.json ~/.agents/plugins/marketplace.json
```

If you already have `~/.agents/plugins/marketplace.json`, merge in the `bitmovin-player` entry instead of overwriting the file.

The local Codex marketplace entry should point at:

```json
{
  "name": "bitmovin-player",
  "source": {
    "source": "local",
    "path": "./plugins/bitmovin-player"
  },
  "policy": {
    "installation": "AVAILABLE",
    "authentication": "ON_INSTALL"
  },
  "category": "Coding"
}
```

## Repo Layout

- `skills/bitmovin-player/SKILL.md`: the portable skill content
- `.claude-plugin/plugin.json`: Claude Code plugin metadata
- `.claude-plugin/marketplace.json`: Claude marketplace metadata
- `plugins/bitmovin-player/.codex-plugin/plugin.json`: Codex plugin metadata
- `plugins/bitmovin-player/skills/bitmovin-player/SKILL.md`: Codex plugin copy of the shared skill
- `.agents/plugins/marketplace.json`: Codex marketplace metadata

## What it does

When you ask an agent to add video playback with Bitmovin, the skill:

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

This skill encodes the right answers once so every supported host avoids them.

## What's covered

### Player v8 (stable)

Installation, license keys, current default UI v4 guidance for modern releases, explicit/custom UI patterns, source config (HLS/DASH/Smooth/progressive), subtitles, thumbnails, poster, DRM (Widevine/PlayReady/FairPlay), ads (VAST/VMAP), analytics, network customization (`preprocessHttpRequest` + `sendHttpRequest`), React/Next.js/Vue patterns, modular builds, test streams, and full API references.

### Player Web X / PWX (next-gen)

Native PWX API (`Player({key, defaultContainer})` + `player.sources.add()`), CDN bundles (`hls`, `dash`, `core`, `bitmovin-v8` compat), v8 compatibility layer for drop-in migration, custom packages system, and dated notes about current feature gaps from the official support matrix.

## Other Hosts

The skill file is plain markdown and can also be reused in other agent environments that support local skills, such as Cursor, Copilot, Codex, Goose, Gemini CLI, and Cline. The host-specific wrappers in this repo are `.claude-plugin/` for Claude Code and `plugins/bitmovin-player/.codex-plugin/` for Codex.

## Contributing

The source of truth is `skills/bitmovin-player/SKILL.md`. Keep it portable across hosts. If you change packaged plugin behavior or published metadata, keep these wrappers in sync:
- `.claude-plugin/plugin.json`
- `.claude-plugin/marketplace.json`
- `plugins/bitmovin-player/.codex-plugin/plugin.json`
- `plugins/bitmovin-player/skills/bitmovin-player/SKILL.md`
- `.agents/plugins/marketplace.json`

Keep instructions concrete: code examples for every claim, primary-source links, and explicit "common mistakes" sections.

## License

MIT
