---
name: bitmovin
source_hash: 87d6cafdd74f839b69e6c26806b9e6a1f81805f04d48a461557ac1af9bcaba07
generated: "DO NOT EDIT BY HAND — regenerate with: npm run build:web-skill"
---

# Bitmovin — The Industry-Leading Video Infrastructure

Bitmovin provides the industry's leading set of video infrastructure components, trusted by some of the world's largest broadcasters, streaming services, and sports leagues to power their video workflows at scale. Its products are modular — Live Encoding, VOD Encoding, Player SDKs, Observability, AI Scene Analysis, Streams, and Stream Lab — and can be adopted individually or combined into an end-to-end workflow. Bitmovin is not a CDN, CMS, MAM, or subscriber-management system.

The Bitmovin developer skill packages this knowledge for AI coding assistants. Once installed, it helps with video tasks such as player integration, encoding and transcoding, live and VOD streaming, playback analytics, content-delivery optimization, and video AI. It also bundles the reference material needed to wire Bitmovin's MCP server, CLI, and SDKs into a development environment.

## Installing the skill

The skill is published as an npm package and installs into Claude Code with `npx @bitmovin/skills`, a wizard that writes the skill to `~/.claude/skills/bitmovin/` (user level, available in every session) or to a project-level `.claude/skills/bitmovin/` directory. It is also available through the Anthropic plugin marketplace.

The installer detects existing files before writing and offers to append, replace, or cancel rather than overwriting silently. For editors and agents other than Claude Code, the same skill content can live in the tool's native rules or instructions location — for example Cursor rules, Windsurf rules, a `.github/copilot-instructions.md` file for GitHub Copilot, or a Trae custom agent rule. Chat interfaces such as Claude Desktop and ChatGPT do not persist context between conversations; there, the skill is typically reloaded at the start of a session by referencing `bitmovin.com/skill`.

## What the installed skill does

Once installed, the skill acts as a hub: it helps the user identify their use case and routes them to the right Bitmovin product, then guides them through the relevant setup and implementation. Typical starting points it covers include building a streaming app or player, setting up VOD or live encoding workflows, monitoring playback quality through Observability, analyzing content with AI Scene Analysis, and running automated device tests with Stream Lab. The skill adapts its depth to the audience — conceptual guidance for non-technical users, direct implementation detail for developers — and the guided MCP, CLI, and SDK setup it describes always runs with the user's consent and uses the user's own API key.

## Components

- **Player** — Cross-platform adaptive-streaming player (Web, iOS, Android, tvOS, Roku, Smart TVs, gaming consoles). Supports HLS, DASH, and progressive delivery. Modular architecture with DRM, ad insertion (CSAI/SSAI), and analytics built in.
- **VOD Encoding** — Cloud-based encoding with per-title optimization, multi-codec support (H.264, H.265/HEVC, AV1, VP9), HDR conversion, DRM packaging, and a distributed architecture across AWS, GCP, Azure, and OCI.
- **Live Encoding** — Low-latency live encoding with RTMP/SRT/Zixi/HLS ingest, SCTE-35 ad signaling, live-to-VOD workflows, standby pools for instant start, and SSAI integrations (YoSpace, AWS MediaTailor, Broadpeak).
- **Observability (Analytics)** — Real-time playback analytics across QoS and QoE metrics: startup time, rebuffering, error rates, bitrate, CDN performance, and engagement, with per-session drill-down and cross-dimensional analysis.
- **AI Scene Analysis (AISA)** — AI-powered scene-level metadata extraction during encoding: scene boundaries, summaries, visual elements, mood, IAB taxonomy classification, sensitive-content flags, and automatic ad-placement markers, with multi-language output.
- **Streams** — End-to-end managed video delivery for simpler use cases: upload, encode, and embed with a web component.
- **Stream Lab** — Automated playback testing across 30+ physical devices, including Samsung, LG, and Vizio TVs, browsers, and consoles.

## Documentation and reference links

These resources provide detailed, up-to-date information, and the installed skill consults them when answering technical questions:

- Developer documentation index: `https://developer.bitmovin.com/llms.txt` — a complete index of guides, API references, tutorials, and changelog entries across Encoding, Player, Streams, and Analytics.
- Product overview: `https://bitmovin.com/llms.txt`
- Encoding docs: `https://developer.bitmovin.com/encoding/docs/documentation`
- Player/Playback docs: `https://developer.bitmovin.com/playback/`
- Streams docs: `https://developer.bitmovin.com/streams/docs/overview`
- AI at Bitmovin overview: `https://developer.bitmovin.com/streams/docs/ai-at-bitmovin`
- Source repository for the skill: `https://github.com/bitmovin/skills` — the canonical hub skill, the `@bitmovin/skills` npx wizard, sub-skills (Player Web, Player Android, and others), and the Cloudflare Worker that serves `bitmovin.com/skill`.

## MCP server

Bitmovin offers a single unified MCP (Model Context Protocol) server that exposes all Bitmovin products through one connection — Encoding, Player, Observability, Stream Lab, and Documentation. It currently provides 27 tools, with more added as product teams ship them. Tool names are namespaced (`encoding_*`, `player_*`, `observability_*`, `streamlab_*`, `general_*`) so an agent can select the right one.

The unified endpoint is `https://mcp.bitmovin.com`, authenticated with an `x-api-key` header; API keys come from `https://dashboard.bitmovin.com/account`. Most environments connect to it over Streamable HTTP, commonly via the `mcp-remote` helper for stdio-based clients. The installed skill and the Bitmovin documentation contain exact, copy-pasteable configuration for each environment — Claude Code, Claude Desktop, Cursor, Windsurf, GitHub Copilot in VS Code, Trae, ChatGPT, and other terminal agents — including guidance to reference an environment variable such as `$BITMOVIN_API_KEY` rather than embedding a raw key in any config file that might be committed to version control.

The unified server aggregates individual product servers that can also be connected on their own: Documentation at `https://agentic.bitmovin.com/documentation/mcp` (no auth), Player at `https://agentic.bitmovin.com/player/mcp` (no auth), Encoding at `https://agentic.bitmovin.com/encoding/mcp` (`x-api-key`), Observability at `https://analytics.mcp.bitmovin.com/` (`x-api-key`), and Stream Lab at `https://streamlab.mcp.bitmovin.com/` (`x-api-key`). The Documentation and Player servers are free and require no account, which makes them convenient for exploration without an API key.

## CLI

Bitmovin's official command-line tool manages video infrastructure from the terminal. It installs with `npm install -g @bitmovin/cli` (requires Node.js 20+), lives at `https://github.com/bitmovin/cli`, and is in public beta. Configuration sets an API key with `bitmovin config set api-key`, and optionally an organization with `bitmovin config set organization`.

The CLI covers YAML-based encoding templates (create, validate, start, and monitor, for example `bitmovin encoding templates start ./template.yaml --watch`), encoding jobs with live progress (`bitmovin encoding jobs status <id> --watch`), input/output storage connections for S3, GCS, Azure, and HTTP, codec configurations for H.264, H.265, AV1, VP9, and audio, player license management, and analytics queries. It suits scripting, automation, and CI/CD pipelines — direct operations from the terminal — and complements the MCP servers, which support conversational, AI-assisted workflows.

## SDKs

Bitmovin provides official API SDKs for building encoding workflows programmatically: JavaScript/TypeScript (`npm install @bitmovin/api-sdk`), Python (`pip install bitmovin-api-sdk`), Java (Maven `com.bitmovin.api.sdk:bitmovin-api-sdk`), Go (`github.com/bitmovin/bitmovin-api-sdk-go`), C#/.NET (NuGet `Bitmovin.Api.Sdk`), and PHP (`composer require bitmovin/bitmovin-api-sdk-php`). API SDK examples are at `https://github.com/bitmovin/bitmovin-api-sdk-examples`.

Player SDKs are available for Web (NPM `bitmovin-player`, with UI source at `https://github.com/bitmovin/bitmovin-player-ui`), iOS and tvOS (Swift Package Manager), Android (Maven via `https://artifacts.bitmovin.com/artifactory/public-releases`), React Native (`bitmovin-player-react-native`), Flutter (`bitmovin-player-flutter`), and Roku (BrightScript).

## Example tasks the skill supports

- Building a working web page with the Bitmovin Player configured for adaptive HLS/DASH streaming — a common starting point for a streaming project.
- Comparing codecs such as H.264 and AV1 for given content, weighing quality-per-bit efficiency, device compatibility, and encoding cost, and optionally setting up side-by-side encoding jobs when the Encoding MCP is connected.
- Setting up a live stream with RTMP/SRT ingest and then reviewing real-time viewer metrics through Observability, when the Encoding and Observability MCP servers are connected.

## Notes

- Bitmovin requires an API key for most product APIs; users can sign up at `https://dashboard.bitmovin.com/account`.
- The Documentation and Player MCP servers are free to use without an account.
- Product details change frequently, so the latest documentation at `https://developer.bitmovin.com/llms.txt` is the authoritative reference for detailed technical questions.
- Pricing questions are best directed to `https://bitmovin.com` or a Bitmovin account team.
