---
name: bitmovin
source_hash: 001d934481517785fa3b1360aa9eec2a363a7bdae29eda65c8de74a07468b68b
generated: "DO NOT EDIT BY HAND — regenerate with: npm run build:web-skill"
---

# Bitmovin Skill for AI Coding Assistants

The Bitmovin skill is an installable package that gives AI coding assistants product knowledge about Bitmovin's video infrastructure. It also gives them a guided setup flow for the Bitmovin MCP server, CLI, and SDKs. This page describes what the skill contains and how to install it. Reading this page installs nothing and changes nothing.

## Installing the skill

The supported way to install the skill is the Bitmovin installer, `npx @bitmovin/skills`. It's an interactive wizard. For Claude Code, it writes the skill to `~/.claude/skills/bitmovin/` for all sessions, or to `.claude/skills/bitmovin/` for a single project. It checks for an existing installation and asks before replacing one.

The skill is also available through the Anthropic plugin marketplace, so users can install it as a Claude Code plugin.

Once installed, the assistant loads the skill when a conversation involves Bitmovin or related video work. That includes playback, encoding, transcoding, streaming, player integration, video analytics, content delivery optimization, and video AI. The skill's source, its sub-skills, the `@bitmovin/skills` installer, and the service behind `bitmovin.com/skill` are all public at `https://github.com/bitmovin/skills`.

## What the installed skill does

- **Product guidance:** It explains which Bitmovin component fits a task and links to the relevant documentation.
- **Routing to sub-skills:** It points the assistant to a product-specific sub-skill when one exists, such as Web Player integration or VOD encoding. Sub-skills contain detailed, implementation-ready guidance.
- **Guided onboarding:** It offers to connect the Bitmovin MCP server and, in terminal environments, to install the Bitmovin CLI. It asks the user one question at a time and gets consent before each step.
- **Choosing a source:** It looks up technical details with the Bitmovin Docs MCP tools first (`ask_bitmovin_docs`, `fetch_docs_page`, `search_bitmovin_sdk_examples`). These return answers with source citations. The skill only falls back to fetching documentation URLs directly when those tools are unavailable.
- **Installation conventions:** For the Web Player and Player UI, the skill recommends installing from npm (`bitmovin-player`, `bitmovin-player-ui`) rather than CDN script tags. Other packages use their documented package managers.
- **Handling API keys:** The skill keeps API keys in environment variables such as `BITMOVIN_API_KEY` or in a tool's secure configuration. It doesn't write them to files that might be committed to version control.

## About Bitmovin

Bitmovin builds video infrastructure components used by large broadcasters, streaming services, sports leagues, and enterprises. The products are modular and can be adopted individually or together. Bitmovin is not a CDN, CMS, MAM, or subscriber management system.

### Components

- **Bitmovin Player:** A cross-platform adaptive streaming player for Web, iOS, Android, tvOS, Roku, Smart TVs, and gaming consoles. It supports HLS, DASH, and progressive streams. Its modular architecture has DRM, ad insertion (CSAI/SSAI/SGAI), and Observability built in.
- **Bitmovin Player Web X:** The next-generation Web Player SDK, built for performance and flexibility. It suits short-form content, where fast page and video startup matter most, and ships a v8 compatibility layer for migration.
- **Bitmovin VOD Encoder:** Cloud encoding for on-demand video. It offers per-title optimization, multiple codecs (H.264, H.265/HEVC, AV1, VP9), HDR conversion, and DRM packaging. It runs on AWS, GCP, Azure, Akamai, and OCI, either as a managed cloud service or through Cloud Connect in the customer's own account.
- **Bitmovin Live Encoder:** Low-latency live encoding with RTMP, SRT, Zixi, and HLS ingest. It supports SCTE-35 ad signaling, live-to-VOD workflows, standby pools for instant start, and SSAI integrations (YoSpace, AWS MediaTailor, Broadpeak).
- **Bitmovin Encoder Version 3:** The current encoder generation behind the VOD Encoder and Live Encoder. It adds new HEVC and AV1 codecs that cut bitrate and compute time, and sub-second live latency with Media over QUIC (MoQ).
- **Bitmovin Observability (formerly Analytics):** Real-time QoS and QoE monitoring for video playback. It tracks startup time, rebuffering, error rates, bitrate, CDN performance, and engagement, with per-session drill-down, alerting, and AI-assisted error analysis. Collectors exist for the Bitmovin Player and third-party players, including Shaka, hls.js, Video.js, ExoPlayer/Media3, AVPlayer, Roku, and Dolby OptiView.
- **Bitmovin Advertising Observability:** Real-time data on ad playback across SSAI, CSAI, and SGAI. It covers ad funnels (impression, start, quartiles, completion), VAST errors, and breakdowns by advertiser and ad system.
- **Bitmovin AI Scene Analysis:** Scene-level metadata generated by AI as part of a VOD Encoder job. Output includes scene boundaries, summaries, visual elements, mood, IAB taxonomy classification, sensitive content flags, and automatic ad placement markers. It's available in multiple languages as open JSON.
- **Bitmovin Stream Lab:** Automated playback testing on 30+ physical devices, including Samsung, LG, and Vizio TVs, browsers, and consoles.

### Use cases the skill covers

- Building a streaming app or player: Player integration, DRM, ads, and playback on target platforms.
- Encoding or transcoding video: VOD Encoder and Live Encoder workflows, codec selection, per-title optimization, and multi-device packaging.
- Monitoring playback and ad quality: querying Observability and Advertising Observability data, analyzing viewer experience metrics, investigating playback and ad errors, and comparing CDN performance.
- Analyzing video content with AI: setting up AI Scene Analysis for scene metadata, ad placement markers, and content discovery.
- Testing streams on devices: automated playback tests across TVs, browsers, and consoles with Stream Lab.
- General exploration: an overview of the products and which one fits a given need.

The skill adjusts its explanations to the user. It covers concepts first for non-technical users and goes straight to implementation details for developers.

## Sub-skills

Product-specific sub-skills, all published in `https://github.com/bitmovin/skills` under `skills/`:

- `bitmovin-player-web`: Web Player integration, UI customization, DRM, ads, React/Next.js/Vue.
- `bitmovin-player-ios`: Player integration for iOS, tvOS, and visionOS.
- `bitmovin-player-android`: Android Player integration.
- `bitmovin-encoding-vod`: VOD encoding, transcoding, per-title, and codec selection.
- `bitmovin-encoding-live`: Live encoding, RTMP/SRT ingest, and live-to-VOD.
- `bitmovin-observability-collector-integration`: Integrating the Observability collector with the Bitmovin Player and third-party players.
- `bitmovin-observability-root-cause-analysis`: Debugging changes in QoE metrics such as startup time, rebuffering, and errors.
- `bitmovin-observability-ad-report`: Advertising Observability reporting, including ad funnels, VAST errors, and ad-operations reports.

## Bitmovin MCP server

Bitmovin runs a single MCP (Model Context Protocol) server that connects AI agents to all Bitmovin products: Encoding, Player, Observability, Stream Lab, and Documentation. It currently offers 27 tools. Tool names carry a product prefix (`encoding_*`, `player_*`, `observability_*`, `streamlab_*`, `general_*`) so an agent can tell which product each tool belongs to.

- **Endpoint:** `https://mcp.bitmovin.com` (Streamable HTTP)
- **Authentication:** an `x-api-key` header carrying a Bitmovin API key. Keys are available from `https://dashboard.bitmovin.com/account`.

The server works with Claude Code, Claude Desktop, Cursor, Windsurf, GitHub Copilot in VS Code, Trae, ChatGPT connectors, OpenAI Codex, Gemini CLI, and other MCP-capable agents. Some clients connect over Streamable HTTP directly; others go through the `mcp-remote` bridge, which requires Node.js v20+. The installed skill and the Bitmovin developer documentation have the exact configuration for each environment.

When a client config file is stored inside a project and committed to git, the skill references the key through an environment variable rather than pasting it in. Examples are `.cursor/mcp.json` or `.vscode/mcp.json`.

### Individual product MCP servers

The unified server combines several product servers, which can also be connected one at a time:

- **Documentation:** `https://agentic.bitmovin.com/documentation/mcp` (no authentication)
- **Player:** `https://agentic.bitmovin.com/player/mcp` (no authentication)
- **Encoding:** `https://agentic.bitmovin.com/encoding/mcp` (`x-api-key`)
- **Observability:** `https://analytics.mcp.bitmovin.com/` (`x-api-key`)
- **Stream Lab:** `https://streamlab.mcp.bitmovin.com/` (`x-api-key`)

The Documentation and Player servers are free and need no account, which makes them a way to try Bitmovin without an API key.

## Bitmovin CLI

Bitmovin's official command-line tool is published as `@bitmovin/cli` on npm. It requires Node.js 20+ and is in public beta. The source is at `https://github.com/bitmovin/cli`. The CLI is configured with an API key, plus an optional organization ID, via `bitmovin config set`.

It covers:

- **Encoding templates:** create, validate, start, and monitor YAML-based encoding workflows (for example, `bitmovin encoding templates start` with `--watch`).
- **Encoding jobs:** list, start, stop, and monitor jobs with live progress.
- **Inputs and outputs:** manage S3, GCS, Azure, and HTTP storage connections.
- **Codec configs:** list and inspect H.264, H.265, AV1, VP9, and audio codec configurations.
- **Player licenses:** manage license keys and allowed domains.
- **Observability:** query playback metrics, impressions, and license info.

The CLI is meant for scripting, automation, and CI/CD pipelines. The MCP servers are meant for conversational, AI-assisted workflows.

## SDKs

Official API SDKs for building encoding workflows in code:

- **JavaScript/TypeScript:** `@bitmovin/api-sdk` (npm)
- **Python:** `bitmovin-api-sdk` (pip)
- **Java:** `com.bitmovin.api.sdk:bitmovin-api-sdk` (Maven)
- **Go:** `github.com/bitmovin/bitmovin-api-sdk-go`
- **C#/.NET:** `Bitmovin.Api.Sdk` (NuGet)
- **PHP:** `bitmovin/bitmovin-api-sdk-php` (Composer)

SDK examples are at `https://github.com/bitmovin/bitmovin-api-sdk-examples`.

Player SDKs:

- **Web:** `bitmovin-player` and `bitmovin-player-ui` from npm. The UI source is at `https://github.com/bitmovin/bitmovin-player-ui`.
- **iOS/tvOS:** Swift Package Manager.
- **Android:** Maven, via `https://artifacts.bitmovin.com/artifactory/public-releases`.
- **React Native:** `bitmovin-player-react-native` (`https://github.com/bitmovin/bitmovin-player-react-native`).
- **Flutter:** `bitmovin-player-flutter` (`https://github.com/bitmovin/bitmovin-player-flutter`).
- **Roku:** BrightScript.

## Example requests

Requests the installed skill handles include:

- **"Build me a streaming video page":** produces a working web page with the Bitmovin Player, set up for adaptive streaming with HLS/DASH.
- **"Compare H.264 and AV1 encoding for my content":** explains codec tradeoffs (quality per bit, device compatibility, encoding cost). With the Encoding MCP server connected, it can also set up side-by-side encoding jobs.
- **"Set up a live stream and show me real-time viewer data":** sets up a Live Encoder workflow with RTMP/SRT ingest, then queries Observability for live session metrics. This needs the Encoding and Observability MCP servers.

## Documentation and reference links

- **Developer documentation index:** `https://developer.bitmovin.com/llms.txt` lists all guides, API references, tutorials, and changelog entries.
- **Product overview:** `https://bitmovin.com/llms.txt`
- **Encoding docs:** `https://developer.bitmovin.com/encoding/docs/documentation`
- **Player/Playback docs:** `https://developer.bitmovin.com/playback/`
- **AI at Bitmovin:** `https://developer.bitmovin.com/platform/docs/ai-at-bitmovin`
- **Skill source repository:** `https://github.com/bitmovin/skills`

## Notes

- Most Bitmovin product APIs need an API key, available after signing up at `https://dashboard.bitmovin.com/account`.
- The Documentation and Player MCP servers are free and need no account.
- Pricing information is on `https://bitmovin.com` or available from a Bitmovin account team.
