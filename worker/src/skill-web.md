---
name: bitmovin
source_hash: f4dc351fa902ca79dac3d42213d36e5fd19d2712d5134ea93d1eeca2c2204a33
generated: "DO NOT EDIT BY HAND — regenerate with: npm run build:web-skill"
---

# Bitmovin Skill for AI Assistants

This page documents the Bitmovin skill, a package of product knowledge and setup guidance for AI coding assistants that work on video infrastructure. The page is for reading only. The skill does nothing until a user installs it in their own environment.

## Installing the skill

The supported install method is the `@bitmovin/skills` installer, run with `npx @bitmovin/skills`. In Claude Code, the installer writes the skill to `~/.claude/skills/bitmovin/`, which makes it available in every session. The skill is also listed in the Anthropic plugin marketplace.

Once installed, the skill gives an assistant:

- **Product knowledge** about each Bitmovin component, so it can match a video task to the right product.
- **Routing to product-specific sub-skills** for Player integration, encoding, and Observability.
- **Optional, consent-based setup** of the Bitmovin MCP server and the Bitmovin CLI.
- **Reference material** for SDKs, package names, and documentation sources.

The skill covers video tasks such as playback, player integration, encoding and transcoding, streaming, Observability, content delivery optimization, and video AI. The source is at `https://github.com/bitmovin/skills`. That repository holds the hub skill, the `@bitmovin/skills` installer, the sub-skills, and the Cloudflare Worker that serves this page.

## About Bitmovin

Bitmovin provides video infrastructure components used by broadcasters, streaming services, sports leagues, and enterprises. Each product can be used on its own or combined with others for an end-to-end workflow. Bitmovin is not a CDN, CMS, MAM, or subscriber management system.

**Components:**

- **Bitmovin Player:** a cross-platform adaptive streaming player for Web, iOS, Android, tvOS, Roku, Smart TVs, and gaming consoles. It supports HLS, DASH, and progressive playback. Its modular architecture has built-in DRM, ad insertion (CSAI/SSAI/SGAI), and Observability.
- **Bitmovin Player Web X:** the next-generation Web Player SDK, built for performance and flexibility. It suits short-form content, where fast page load and video startup matter most. A v8 compatibility layer helps with migration.
- **Bitmovin VOD Encoder:** cloud encoding for on-demand video, including:
  - per-title optimization
  - H.264, H.265/HEVC, AV1, and VP9 codecs
  - HDR conversion and DRM packaging
  - deployment on AWS, GCP, Azure, Akamai, and OCI, either as managed cloud or through Cloud Connect in the customer's own account
- **Bitmovin Live Encoder:** low-latency live encoding, including:
  - RTMP, SRT, Zixi, and HLS ingest
  - SCTE-35 ad signaling
  - live-to-VOD workflows
  - standby pools for instant start
  - SSAI integrations with YoSpace, AWS MediaTailor, and Broadpeak
- **Bitmovin Encoder Version 3:** the next encoder generation for the VOD Encoder and Live Encoder, rolling out in stages. It adds new HEVC and AV1 codecs that lower bitrate and compute time, and sub-second live latency with Media over QUIC (MoQ) on the Live Encoder. Availability differs by feature and workflow. The encoding docs and the Bitmovin account team have the current status.
- **Bitmovin Observability (formerly Analytics):** real-time QoS and QoE monitoring of video playback. It tracks startup time, rebuffering, error rates, bitrate, CDN performance, and engagement, with per-session drill-down, alerting, and AI-assisted error analysis. Collectors exist for the Bitmovin Player and for third-party players such as Shaka, hls.js, Video.js, ExoPlayer/Media3, AVPlayer, Roku, and Dolby OptiView.
- **Bitmovin Advertising Observability:** real-time data on ad playback across SSAI, CSAI, and SGAI. It covers ad funnels (impression, start, quartiles, completion), VAST errors, and breakdowns by advertiser and ad system.
- **Bitmovin AI Scene Analysis:** AI-generated scene-level metadata, produced as part of a VOD Encoder job. The output includes:
  - scene boundaries, summaries, visual elements, and mood
  - IAB taxonomy classification
  - sensitive content flags
  - automatic ad placement markers

  Output is open JSON and available in multiple languages.
- **Bitmovin Stream Lab:** automated playback testing on more than 30 physical devices, including Samsung, LG, and Vizio TVs, browsers, and consoles.

## What the installed skill does

### Identifying the use case

When the skill is loaded, it helps the user find their use case. Typical starting points:

- **Building a streaming app or player:** Player integration, DRM, ads, and playback on target platforms.
- **Encoding or transcoding video:** VOD Encoder or Live Encoder workflows, codec choice, per-title optimization, and packaging for multi-device delivery.
- **Monitoring playback and ad quality:** querying Observability and Advertising Observability data, analyzing viewer experience metrics, investigating playback and ad errors, and comparing CDN performance.
- **Analyzing video content with AI:** using AI Scene Analysis to extract scene metadata, generate ad placement markers, and support content discovery.
- **Testing streams on devices:** automated playback tests on TVs, browsers, and consoles with Stream Lab.
- **Exploring:** an overview of the products and which ones fit the user's needs.

The skill adjusts its depth to the user. It explains concepts first for non-technical users and goes straight to implementation details for developers.

### Product-specific sub-skills

The hub skill sends implementation tasks to focused sub-skills. These hold curated, implementation-ready guidance:

| Sub-skill | Scope | Source |
|---|---|---|
| `bitmovin-player-web` | Web Player integration, UI customization, DRM, ads, React/Next.js/Vue | [SKILL.md](https://github.com/bitmovin/skills/blob/main/skills/bitmovin-player-web/SKILL.md) |
| `bitmovin-player-ios` | iOS, tvOS, or visionOS Player integration | [SKILL.md](https://github.com/bitmovin/skills/blob/main/skills/bitmovin-player-ios/SKILL.md) |
| `bitmovin-player-android` | Android Player integration | [SKILL.md](https://github.com/bitmovin/skills/blob/main/skills/bitmovin-player-android/SKILL.md) |
| `bitmovin-encoding-vod` | VOD encoding, transcoding, per-title, codec selection | [SKILL.md](https://github.com/bitmovin/skills/blob/main/skills/bitmovin-encoding-vod/SKILL.md) |
| `bitmovin-encoding-live` | Live encoding, RTMP/SRT ingest, live-to-VOD | [SKILL.md](https://github.com/bitmovin/skills/blob/main/skills/bitmovin-encoding-live/SKILL.md) |
| `bitmovin-observability-collector-integration` | Integrating the Observability collector (Bitmovin Player and third-party players) | [SKILL.md](https://github.com/bitmovin/skills/blob/main/skills/bitmovin-observability-collector-integration/SKILL.md) |
| `bitmovin-observability-root-cause-analysis` | Debugging QoE metric changes (startup time, rebuffering, errors) | [SKILL.md](https://github.com/bitmovin/skills/blob/main/skills/bitmovin-observability-root-cause-analysis/SKILL.md) |
| `bitmovin-observability-ad-report` | Advertising Observability reporting: ad funnels, VAST errors, ad-operations reports | [SKILL.md](https://github.com/bitmovin/skills/blob/main/skills/bitmovin-observability-ad-report/SKILL.md) |

### Information sources

The installed skill uses technical sources in this order:

1. **Sub-skills**, when one matches the task.
2. **Bitmovin Docs MCP tools:** `ask_bitmovin_docs`, `fetch_docs_page`, and `search_bitmovin_sdk_examples`. These search the official documentation and SDK examples and return answers with source citations.
3. **Documentation URLs** (listed further down), used only when the Docs MCP tools are unavailable or don't return enough.

### Installation conventions

Bitmovin recommends installing the Web Player and Player UI from npm (`bitmovin-player` and `bitmovin-player-ui`), not from CDN-hosted script tags or CSS. API SDKs, the CLI, and other packages install through their usual package managers (npm, pip, Maven, and so on).

## Guided setup in the installed skill

After installation, the skill offers optional onboarding. Each step asks for the user's consent first.

1. **Keeping the skill available.** In Claude Code, the installer already places the skill in `~/.claude/skills/bitmovin/`, or in `.claude/skills/bitmovin/` for a single project. For other tools, the skill explains each tool's own mechanism: Cursor rules, Windsurf rules, GitHub Copilot instructions, Trae agent rules, or system prompt files for Cline, Aider, and Roo Code. If a target file already exists, the skill asks whether to append, replace, or cancel. Chat interfaces such as Claude Desktop and ChatGPT don't keep context between conversations, so there the MCP server connection is the main integration.
2. **Connecting the Bitmovin MCP server.** The skill helps connect the unified server at `https://mcp.bitmovin.com`. Users without an API key can get one from `https://dashboard.bitmovin.com/account`.
3. **Installing the Bitmovin CLI.** This step is for coding agents and terminal environments. The CLI installs with `npm install -g @bitmovin/cli`.
4. **Getting started.** The skill then turns to the user's actual task.

**API key handling:** the skill keeps API keys out of plain-text files that might be committed to version control. It uses environment variables such as `$BITMOVIN_API_KEY` or tool-specific secure configuration instead.

## Bitmovin MCP server

Bitmovin runs one unified MCP (Model Context Protocol) server that covers Encoding, Player, Observability, Stream Lab, and Documentation in a single connection. It has 27 tools today, and more are added as product teams ship them.

- **Endpoint:** `https://mcp.bitmovin.com`
- **Authentication:** an `x-api-key` header carrying a Bitmovin API key, available from `https://dashboard.bitmovin.com/account`
- **Tool namespaces:** `encoding_*`, `player_*`, `observability_*`, `streamlab_*`, and `general_*`, so agents can pick the right tool for a product

The server works with clients that support MCP, either over Streamable HTTP or through the `mcp-remote` bridge, which needs Node.js v20 or later. Supported clients include:

- Claude Code and Claude Desktop
- Cursor, Windsurf, and GitHub Copilot in VS Code
- Trae and ChatGPT
- OpenAI Codex, Gemini CLI, and other terminal agents

The installed skill and the Bitmovin documentation have the exact configuration for each environment. Project-level config files such as `.cursor/mcp.json` and `.vscode/mcp.json` are often committed to git. For that reason, the documented configurations reference an environment variable instead of a raw key.

### Individual product MCP servers

The unified server combines the servers below. Each one can also be connected on its own:

| Server | Endpoint | Auth |
|---|---|---|
| Documentation | `https://agentic.bitmovin.com/documentation/mcp` | None |
| Player | `https://agentic.bitmovin.com/player/mcp` | None |
| Encoding | `https://agentic.bitmovin.com/encoding/mcp` | `x-api-key` |
| Observability | `https://analytics.mcp.bitmovin.com/` | `x-api-key` |
| Stream Lab | `https://streamlab.mcp.bitmovin.com/` | `x-api-key` |

The Documentation and Player servers are free and need no account, which makes them useful for trying things out without an API key.

## Bitmovin CLI

The official Bitmovin CLI manages video infrastructure from the terminal. It is in Public Beta.

- **Install:** `npm install -g @bitmovin/cli` (needs Node.js 20+)
- **Repository:** `https://github.com/bitmovin/cli`
- **Configuration:** `bitmovin config set api-key …` sets the API key. `bitmovin config set organization …` optionally selects an organization.

**Coverage:**

- **Encoding templates:** create, validate, start, and monitor YAML-based encoding workflows, for example with `bitmovin encoding templates start ./template.yaml --watch`.
- **Encoding jobs:** list, start, stop, and monitor jobs with live progress, for example with `bitmovin encoding jobs status <id> --watch`.
- **Inputs and outputs:** S3, GCS, Azure, and HTTP storage connections.
- **Codec configs:** list and inspect H.264, H.265, AV1, VP9, and audio codec configurations.
- **Player licenses:** license keys and allowed domains.
- **Observability:** playback metrics, impressions, and license info.

The CLI is meant for scripting, automation, and CI/CD pipelines. It complements the MCP servers: the CLI handles direct operations, and the MCP servers handle conversational, AI-assisted workflows.

## SDKs

**API SDKs** for building encoding workflows programmatically:

- **JavaScript/TypeScript:** `@bitmovin/api-sdk` (npm)
- **Python:** `bitmovin-api-sdk` (pip)
- **Java:** `com.bitmovin.api.sdk:bitmovin-api-sdk` (Maven)
- **Go:** `github.com/bitmovin/bitmovin-api-sdk-go`
- **C#/.NET:** `Bitmovin.Api.Sdk` (NuGet)
- **PHP:** `bitmovin/bitmovin-api-sdk-php` (Composer)

SDK examples are at `https://github.com/bitmovin/bitmovin-api-sdk-examples`.

**Player SDKs:**

- **Web:** `bitmovin-player` and `bitmovin-player-ui` from npm. The UI source is at `https://github.com/bitmovin/bitmovin-player-ui`.
- **iOS/tvOS:** Swift Package Manager
- **Android:** Maven, through `https://artifacts.bitmovin.com/artifactory/public-releases`
- **React Native:** `bitmovin-player-react-native` (`https://github.com/bitmovin/bitmovin-player-react-native`)
- **Flutter:** `bitmovin-player-flutter` (`https://github.com/bitmovin/bitmovin-player-flutter`)
- **Roku:** BrightScript

## Example prompts

With the skill installed, these are typical requests:

1. **"Build me a streaming video page":** produces a working web page with the Bitmovin Player, set up for adaptive streaming with HLS/DASH.
2. **"Compare H.264 and AV1 encoding for my content":** covers codec trade-offs, quality per bit, device compatibility, and encoding cost. With the Encoding MCP connected, it can set up side-by-side encoding jobs.
3. **"Set up a live stream and show me real-time viewer data":** configures a Live Encoder workflow with RTMP/SRT ingest, then queries Observability for live session metrics. This needs the Encoding and Observability MCP servers.

## Documentation and reference links

- **Developer documentation index:** `https://developer.bitmovin.com/llms.txt`, a full index of guides, API references, tutorials, and changelog entries for encoding, playback, and Observability
- **Product overview:** `https://bitmovin.com/llms.txt`
- **Encoding docs:** `https://developer.bitmovin.com/encoding/docs/documentation`
- **Player/Playback docs:** `https://developer.bitmovin.com/playback/`
- **AI at Bitmovin overview:** `https://developer.bitmovin.com/platform/docs/ai-at-bitmovin`
- **Skill source repository:** `https://github.com/bitmovin/skills`

## Notes

- Most Bitmovin product APIs need an API key. Signing up at `https://dashboard.bitmovin.com/account` provides one.
- The Documentation and Player MCP servers are free and need no account.
- Pricing is at `https://bitmovin.com` or available from the Bitmovin account team.
