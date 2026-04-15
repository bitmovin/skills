# Bitmovin Player Skill

An AI coding agent skill that teaches agents how to correctly integrate the Bitmovin Web Player SDK. Install it in your agent's skills directory and it will guide code generation for Bitmovin Player integrations — v8 or Player Web X (PWX).

## What it does

When a user asks an AI coding agent (Claude Code, Cursor, Codex, Goose, etc.) to add video playback with Bitmovin, this skill:

1. **Asks upfront** whether to use Player v8 (stable, feature-complete) or Player Web X (next-gen, modular, WIP)
2. **Writes correct code** — the right npm package, import paths, API calls, config shape
3. **Covers DRM, ads, analytics, subtitles, network customization, modular builds**
4. **Includes framework patterns** for React, Next.js (SSR-safe), and Vue
5. **Warns about common mistakes** — the 8 integration bugs every new developer hits
6. **Links to authoritative docs** — the correct `/playback/reference/web-sdk-*` URLs

The skill is a single `SKILL.md` file — no dependencies, no build step.

## Install

### Claude Code

```bash
git clone https://github.com/bitmovin/bitmovin-player-skill.git
cp -r bitmovin-player-skill ~/.claude/skills/bitmovin-player
```

Or for a single project:

```bash
mkdir -p .claude/skills
cp -r bitmovin-player-skill .claude/skills/bitmovin-player
```

Verify with: *"What skills do you have access to?"* — `bitmovin-player` should appear.

### Other agents

Copy the skill directory into the agent's skills folder:

| Agent | Skills directory |
|-------|------------------|
| Claude Code | `~/.claude/skills/` |
| VS Code / GitHub Copilot | `~/.copilot/skills/` |
| Gemini CLI | `~/.gemini/skills/` |
| Cline | `~/.cline/skills/` |
| Goose | `~/.config/goose/skills/` |
| Codex | `~/.codex/skills/` |
| Cursor | `~/.cursor/skills/` |

### Vercel Skills CLI (cross-agent)

```bash
npx skills add bitmovin/bitmovin-player-skill
```

## What's covered

### Player v8 (stable)

- Installation (npm + CDN), license keys, localhost auto-allow
- Basic integration with `UIFactory.buildUI()` pattern
- Source config: HLS, DASH, Smooth, progressive, subtitles, thumbnails, poster
- Player config reference (all top-level fields)
- Player API reference (load, play, pause, seek, events, quality, destroy)
- DRM: Widevine, PlayReady, FairPlay with cross-browser setup
- Advertising: VAST/VMAP pre/mid/post-roll
- Analytics integration
- Network customization: `preprocessHttpRequest` + full `sendHttpRequest` replacement
- Framework patterns: React, Next.js (dynamic import for SSR), Vue
- Modular builds for smaller bundles
- Common mistakes and their fixes
- Public test streams

### Player Web X / PWX (next-gen)

- Native PWX API (`Player({key, defaultContainer})` + `player.sources.add()`)
- CDN bundles: `hls`, `dash`, `core`, `bitmovin-v8` (compat)
- v8 compatibility layer for drop-in migration
- Custom packages system
- Current feature gaps (no DRM, no ads, partial DASH, some NOP APIs)

## Why this exists

LLMs have stale or confused Bitmovin Player knowledge. Common failure modes without this skill:

- Wrong npm package (`@bitmovin/player` — doesn't exist, it's `bitmovin-player`)
- Wrong UIFactory method (`buildDefaultUI` instead of `buildUI`)
- Missing `ui: false` config causing double controls
- No SSR guard on Next.js imports
- Outdated doc URLs (`/playback/docs/*` instead of `/playback/reference/*`)
- Mixing v8 and PWX APIs in the same code

This skill encodes the right answers once so every agent using it avoids them.

## Contributing

The skill is a single markdown file. Update `SKILL.md`, open a PR. Keep instructions concrete — include code examples for every claim, link to primary sources (developer.bitmovin.com), and explicitly call out common mistakes.

## License

MIT
