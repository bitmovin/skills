# Bitmovin Skills

A collection of portable agent skills for working with the Bitmovin platform and video development in general.

This repo is intentionally **not tied to Claude Code only**:
- Each skill lives under `skills/<skill-name>/SKILL.md` as portable markdown
- `.claude-plugin/` provides Claude Code plugin wrappers
- `plugins/<skill-name>/.codex-plugin/plugin.json` provides Codex plugin wrappers
- The canonical `skills/` layout is compatible with [`skills.sh`](https://skills.sh)
- The same skill files can also be installed directly into ChatGPT/Codex-style local skills directories

## Skills

| Skill | Status | What it covers |
| --- | --- | --- |
| [`bitmovin-player-web`](skills/bitmovin-player-web/SKILL.md) | Available | Bitmovin Web Player SDK — Player v8 (stable) and Player Web X / PWX (next-gen) |
| `bitmovin-encoding-vod` | Planned | VOD encoding with the Bitmovin Encoding API |
| `bitmovin-encoding-live` | Planned | Live encoding with the Bitmovin Encoding API |
| `bitmovin-observability` | Planned | Bitmovin Analytics and observability tooling |
| `video-development` | Planned | General video development guidance (codecs, packaging, DRM, streaming protocols) not specific to Bitmovin |

The sections below describe install paths shared by all skills in this repo. Skill-specific details live inside each skill's directory.

## Install In Claude Code

```bash
# Add the Bitmovin marketplace
/plugin marketplace add bitmovin/skills

# Install a plugin (one per skill)
/plugin install bitmovin-player-web@bitmovin
```

After install, the skill loads in every Claude Code session automatically. No further config.

Verify with *"What skills do you have access to?"* — the installed skill should appear.

## Install In ChatGPT / Codex

If your ChatGPT/Codex setup supports local skills, copy the skill into your Codex home:

```bash
mkdir -p ~/.codex/skills/bitmovin-player-web
cp skills/bitmovin-player-web/SKILL.md ~/.codex/skills/bitmovin-player-web/SKILL.md
```

Repeat for any other skill in `skills/` you want available.

## Install With skills.sh

This repository is compatible with [`skills.sh`](https://skills.sh) because each skill lives under `skills/<skill-name>/SKILL.md`, which is one of the repository layouts that `npx skills` discovers automatically.

Examples:

```bash
# List the skills exposed by this repo
npx skills add bitmovin/skills --list

# Install just one skill interactively
npx skills add bitmovin/skills --skill bitmovin-player-web

# Install to specific agents
npx skills add bitmovin/skills --skill bitmovin-player-web -a claude-code -a codex

# Install globally without prompts
npx skills add bitmovin/skills --skill bitmovin-player-web -g -y
```

Use `skills.sh` when you want the portable skill installed into an agent's normal skill directory. Use the Claude or Codex plugin wrappers in this repo only when you specifically want those host-native plugin surfaces.

## Install In Codex As A Plugin

This repo includes Codex plugin wrappers under `plugins/<skill-name>/` plus repo-local marketplace metadata at `.agents/plugins/marketplace.json`.

For a home-local Codex plugin install, copy the plugin and marketplace entry into the standard Codex locations:

```bash
mkdir -p ~/.agents/plugins ~/plugins
cp -R plugins/bitmovin-player-web ~/plugins/bitmovin-player-web
cp .agents/plugins/marketplace.json ~/.agents/plugins/marketplace.json
```

If you already have `~/.agents/plugins/marketplace.json`, merge in the new entries instead of overwriting the file.

A local Codex marketplace entry looks like:

```json
{
  "name": "bitmovin-player-web",
  "source": {
    "source": "local",
    "path": "./plugins/bitmovin-player-web"
  },
  "policy": {
    "installation": "AVAILABLE",
    "authentication": "ON_INSTALL"
  },
  "category": "Coding"
}
```

## Repo Layout

- `skills/<skill-name>/SKILL.md`: the portable skill content (one directory per skill)
- `.claude-plugin/plugin.json`: Claude Code plugin metadata
- `.claude-plugin/marketplace.json`: Claude marketplace metadata (lists every skill exposed as a Claude plugin)
- `plugins/<skill-name>/.codex-plugin/plugin.json`: Codex plugin metadata (one per skill)
- `plugins/<skill-name>/skills/<skill-name>/SKILL.md`: symlink to the shared root skill
- `.agents/plugins/marketplace.json`: Codex marketplace metadata

## Skill: bitmovin-player-web

When you ask an agent to add video playback with Bitmovin, the skill:

1. **Defaults to Player v8** and only asks about PWX when the choice materially changes implementation
2. **Uses current UI guidance** — default UI v4 for modern v8 setups, explicit/custom UI paths when needed
3. **Writes correct code** — right npm package, right import paths, right API calls
4. **Covers DRM, ads, analytics, subtitles, network customization**
5. **Uses framework patterns** for React, Next.js (SSR-safe), and Vue
6. **Warns about common mistakes** and links to authoritative docs

### Why this skill exists

LLMs have stale or confused Bitmovin Player Web knowledge. Common failures without this skill:

- Wrong npm package (`@bitmovin/player` — doesn't exist, it's `bitmovin-player`)
- Assuming manual `UIFactory` wiring is required on every modern v8 integration
- Using stale UI v3/v4 wiring or the wrong asset-loading path
- No SSR guard on Next.js imports → crash
- Outdated doc URLs (`/playback/docs/*` instead of `/playback/reference/*`)
- Mixing v8 and PWX APIs in the same code

### What's covered

**Player v8 (stable):** Installation, license keys, current default UI v4 guidance for modern releases, explicit/custom UI patterns, source config (HLS/DASH/Smooth/progressive), subtitles, thumbnails, poster, DRM (Widevine/PlayReady/FairPlay), ads (VAST/VMAP), analytics, network customization (`preprocessHttpRequest` + `sendHttpRequest`), React/Next.js/Vue patterns, modular builds, test streams, and full API references.

**Player Web X / PWX (next-gen):** Native PWX API (`Player({key, defaultContainer})` + `player.sources.add()`), CDN bundles (`hls`, `dash`, `core`, `bitmovin-v8` compat), v8 compatibility layer for drop-in migration, custom packages system, and dated notes about current feature gaps from the official support matrix.

## Other Hosts

Skill files are plain markdown and can be reused in any agent environment that supports local skills, such as Cursor, Copilot, Codex, Goose, Gemini CLI, and Cline. The host-specific wrappers in this repo are `.claude-plugin/` for Claude Code and `plugins/<skill-name>/.codex-plugin/` for Codex.

## Contributing

The source of truth for each skill is `skills/<skill-name>/SKILL.md`. Keep it portable across hosts. If you change packaged plugin behavior or published metadata, keep the wrappers in sync:
- `.claude-plugin/plugin.json`
- `.claude-plugin/marketplace.json`
- `plugins/<skill-name>/.codex-plugin/plugin.json`
- `plugins/<skill-name>/skills/<skill-name>/SKILL.md`
- `.agents/plugins/marketplace.json`

The Codex plugin skill path is intentionally a symlink back to `skills/<skill-name>/SKILL.md` so the repo only has one canonical skill payload per skill.

Keep instructions concrete: code examples for every claim, primary-source links, and explicit "common mistakes" sections.

## License

MIT
