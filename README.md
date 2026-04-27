# Bitmovin Skills

Portable agent skills for integrating Bitmovin Player SDKs:
- **Web:** Bitmovin Web Player (Player v8 + Player Web X / PWX)
- **Android:** Bitmovin Android Player SDK

This repo is intentionally **not tied to Claude Code only**:
- Core skills live under `skills/<skill-name>/SKILL.md`
- `.claude-plugin/` provides Claude Code plugin wrappers (currently web)
- `plugins/<skill-name>/.codex-plugin/plugin.json` provides Codex plugin wrappers
- The canonical `skills/` layout is compatible with [`skills.sh`](https://skills.sh)
- The same skill files can also be installed directly into local skills directories

## Skills

| Skill | Status | What it covers |
| --- | --- | --- |
| [`bitmovin-player-web`](skills/bitmovin-player-web/SKILL.md) | Available | Bitmovin Web Player SDK — Player v8 (stable) and Player Web X / PWX (next-gen) |
| [`bitmovin-player-android`](skills/bitmovin-player-android/SKILL.md) | Available | Bitmovin Android Player SDK integration and troubleshooting |

## Install In Claude Code

```bash
# Add the Bitmovin marketplace
/plugin marketplace add bitmovin/skills

# Install plugin
/plugin install bitmovin-player-web@bitmovin
```

After install, the skill loads in every Claude Code session automatically.

## Install In ChatGPT / Codex (local skills)

```bash
mkdir -p ~/.codex/skills/bitmovin-player-web
cp skills/bitmovin-player-web/SKILL.md ~/.codex/skills/bitmovin-player-web/SKILL.md

mkdir -p ~/.codex/skills/bitmovin-player-android
cp skills/bitmovin-player-android/SKILL.md ~/.codex/skills/bitmovin-player-android/SKILL.md
```

## Install With skills.sh

Examples:

```bash
# List skills exposed by this repo
npx skills add bitmovin/skills --list

# Install web skill
npx skills add bitmovin/skills --skill bitmovin-player-web

# Install android skill
npx skills add bitmovin/skills --skill bitmovin-player-android

# Install to specific agents
npx skills add bitmovin/skills --skill bitmovin-player-web -a claude-code -a codex

# Install globally without prompts
npx skills add bitmovin/skills --skill bitmovin-player-android -g -y
```

## Install In Codex As A Plugin

This repo includes Codex plugin wrappers at:
- `plugins/bitmovin-player-web/`
- `plugins/bitmovin-player-android/`

plus marketplace metadata at `.agents/plugins/marketplace.json`.

For a home-local Codex plugin install:

```bash
mkdir -p ~/.agents/plugins ~/plugins
cp -R plugins/bitmovin-player-web ~/plugins/bitmovin-player-web
cp -R plugins/bitmovin-player-android ~/plugins/bitmovin-player-android
cp .agents/plugins/marketplace.json ~/.agents/plugins/marketplace.json
```

If you already have `~/.agents/plugins/marketplace.json`, merge plugin entries instead of overwriting.

## Repo Layout

- `skills/bitmovin-player-web/SKILL.md`: portable web skill content
- `skills/bitmovin-player-android/SKILL.md`: portable android skill content
- `.claude-plugin/plugin.json`: Claude Code plugin metadata (web)
- `.claude-plugin/marketplace.json`: Claude marketplace metadata (web)
- `plugins/bitmovin-player-web/.codex-plugin/plugin.json`: Codex plugin metadata (web)
- `plugins/bitmovin-player-web/skills/bitmovin-player-web/SKILL.md`: symlink to shared root web skill
- `plugins/bitmovin-player-android/.codex-plugin/plugin.json`: Codex plugin metadata (android)
- `plugins/bitmovin-player-android/skills/bitmovin-player-android/SKILL.md`: symlink to shared root android skill
- `.agents/plugins/marketplace.json`: Codex marketplace metadata

## Other Hosts

Skill files are plain markdown and can be reused in any agent environment supporting local skills, including Cursor, Copilot, Codex, Goose, Gemini CLI, and Cline.

## Contributing

Source-of-truth skill files are:
- `skills/bitmovin-player-web/SKILL.md`
- `skills/bitmovin-player-android/SKILL.md`

If you change plugin behavior or published metadata, keep wrappers in sync:
- `.claude-plugin/plugin.json`
- `.claude-plugin/marketplace.json`
- `plugins/bitmovin-player-web/.codex-plugin/plugin.json`
- `plugins/bitmovin-player-web/skills/bitmovin-player-web/SKILL.md`
- `plugins/bitmovin-player-android/.codex-plugin/plugin.json`
- `plugins/bitmovin-player-android/skills/bitmovin-player-android/SKILL.md`
- `.agents/plugins/marketplace.json`

Keep instructions concrete: code examples for every claim, primary-source links, and explicit common-mistakes guidance.

## License

MIT
