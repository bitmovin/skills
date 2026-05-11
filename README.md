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
| [`bitmovin-player-android`](skills/bitmovin-player-android/SKILL.md) | Available | Bitmovin Android Player SDK integration and troubleshooting |
| [`bitmovin-encoding-vod`](skills/bitmovin-encoding-vod/SKILL.md) | Available | VOD encoding with the Bitmovin Encoding API (H.264 per-title, fixed ladder, AV1 UGC, hardware-accelerated sports clips) via the Encoding Templates API |
| [`bitmovin-encoding-live`](skills/bitmovin-encoding-live/SKILL.md) | Available | Live encoding with the Bitmovin Encoding API (RTMP, redundant RTMP, SRT) via the Encoding Templates API |
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

- `skills/<skill-name>/`: the portable skill content (one directory per skill, with `SKILL.md` plus any scripts / templates / examples it ships)
- `.claude-plugin/marketplace.json`: Claude marketplace metadata (lists every skill exposed as a Claude plugin)
- `.claude-plugin/plugin.json`: Claude Code plugin metadata for the legacy root-as-plugin layout (`bitmovin-player-web`)
- `plugins/<skill-name>/.claude-plugin/plugin.json`: Claude Code plugin metadata (per-plugin layout used by newer skills)
- `plugins/<skill-name>/.codex-plugin/plugin.json`: Codex plugin metadata (one per skill)
- `plugins/<skill-name>/skills/<skill-name>/`: symlink back to `skills/<skill-name>/` (for skills that ship only `SKILL.md` it can be a per-file symlink instead — `bitmovin-player-web` uses that variant)
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

## Skill: bitmovin-encoding-live

When you ask an agent to start a Bitmovin live encoding, the skill:

1. **Drives the Encoding Templates API** — a single `POST /encoding/templates/start` creates inputs, codec configs, encoding, streams, muxings, manifests, and starts the live encoding from one YAML document
2. **Ships three Jinja templates** — single RTMP, redundant RTMP (HA ingest), and SRT (LISTENER / CALLER, optional AES passphrase)
3. **Walks the user one question at a time** — encoding name, cloud region, output (reuse or create), output base path, manifests, ladder, audio bitrate, segment length, encoder version, auto-shutdown timeouts
4. **Validates the rendered template** against Bitmovin's published Encoding Template JSON schema before submitting (the API otherwise accepts mistyped fields silently and the encoding gets stuck in `CREATED`)
5. **Polls until `RUNNING`** and prints the ingest URL, manifest URLs, and dashboard URL
6. **Keeps secrets out of params, state, and logs** — credentials are read from environment variables only

### What's covered

CMAF output (fmp4 muxings serving DASH and HLS, `manifestGenerator: V2`); RTMP / RTMPS / SRT ingest; AWS / GCP / Azure cloud regions; S3 / GCS outputs (reuse or create); per-encoding stream key (RTMP) or host:port (SRT); ACL choices (PUBLIC_READ / PRIVATE / NONE); auto-shutdown on stream loss / no bytes read; STABLE vs BETA encoder.

## Skill: bitmovin-encoding-vod

When you ask an agent to run a Bitmovin VOD encoding, the skill:

1. **Drives the Encoding Templates API** — a single `POST /encoding/templates/start` creates inputs, codec configs, encoding, streams, muxings, manifests, and starts the encoding from one YAML document
2. **Ships four Jinja templates** — H.264 per-title (algorithm-picked ladder, THREE_PASS), H.264 fixed ladder (you specify renditions), AV1 per-title for UGC (progressive MP4 per rendition, no manifest), and an H.264 sports-clips template using NVIDIA hardware acceleration (`VOD_HARDWARE_SHORTFORM` preset, hardcoded 9-rendition sports ladder, HLS-only, pinned to `AWS_EU_WEST_1`)
3. **Walks the user one question at a time** — encoding name, input (reuse or create HTTPS), output (reuse or create), output base path, manifests, ladder, audio bitrate, segment length, encoder version, encoding mode
4. **Validates the rendered template** against Bitmovin's published Encoding Template JSON schema before submitting
5. **Polls until `FINISHED`** and prints manifest URLs and the dashboard URL
6. **Refuses to materialize credentialed inputs** — only HTTP/HTTPS inputs are created from the skill; S3 / GCS / Azure inputs MUST be reused via an existing input id, so credentials never enter the params or template

### What's covered

H.264 (per-title and fixed-ladder, SINGLE_PASS / TWO_PASS / THREE_PASS) and AV1 per-title; CMAF fmp4 (DASH + HLS) for the H.264 templates; progressive MP4 for AV1 UGC; HLS-only with explicit per-rendition manifest config for the sports-clips hardware template; HTTP / HTTPS / S3 / GCS / Azure inputs (creation only for HTTP/HTTPS); S3 / GCS outputs (reuse or create); ACL choices (PUBLIC_READ / PRIVATE / NONE) with scenario-aware defaults.

## Other Hosts

Skill files are plain markdown and can be reused in any agent environment that supports local skills, such as Cursor, Copilot, Codex, Goose, Gemini CLI, and Cline. The host-specific wrappers in this repo are `.claude-plugin/` for Claude Code and `plugins/<skill-name>/.codex-plugin/` for Codex.

## Contributing

The source of truth for each skill is `skills/<skill-name>/` (with `SKILL.md` at the top plus any scripts, templates, and examples the skill ships). Keep it portable across hosts. If you change packaged plugin behavior or published metadata, keep the wrappers in sync:
- `.claude-plugin/plugin.json` (legacy root-as-plugin layout, used by `bitmovin-player-web`)
- `.claude-plugin/marketplace.json`
- `plugins/<skill-name>/.claude-plugin/plugin.json` (per-plugin layout, used by newer skills)
- `plugins/<skill-name>/.codex-plugin/plugin.json`
- `plugins/<skill-name>/skills/<skill-name>/` (symlink back to `skills/<skill-name>/` — directory symlink for skills that ship scripts/templates/examples; per-file symlink works for `SKILL.md`-only skills)
- `.agents/plugins/marketplace.json`

The plugin skill path is intentionally a symlink back into `skills/<skill-name>/` so the repo only has one canonical skill payload per skill.

Keep instructions concrete: code examples for every claim, primary-source links, and explicit "common mistakes" sections.

## License

MIT
