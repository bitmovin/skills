---
name: bitmovin-encoding-live
description: Guide a user through creating and starting a Bitmovin live encoding (RTMP, redundant RTMP, or SRT) end-to-end via the Encoding Templates API and the Bitmovin Python SDK.
---

# Bitmovin Live Encoding Skill

Walks the user through configuring and starting a Bitmovin live encoding. The
heavy lifting is done by the Bitmovin **Encoding Templates API**: a single
`POST /encoding/templates/start` creates inputs, codec configs, encoding,
streams, muxings, manifests **and** starts the live encoding from one YAML
document.

This skill renders that YAML from a small parameter file, submits it, polls
until the encoder is `RUNNING` and exposes its ingest IP + stream key, and
prints the manifest URLs.

## Prerequisites

- Python ≥ 3.10 — Step 1's `scripts/ensure_venv.sh` auto-creates a dedicated
  venv and installs `bitmovin-api-sdk`, `pyyaml`, `jinja2`, and `jsonschema`
  if they aren't already importable from the user's `python3`.
- `BITMOVIN_API_KEY` environment variable set.
- For creating a new output (optional): `BITMOVIN_OUTPUT_*` env vars (see
  `scripts/create_output.py --help`). Credentials are **only** read from the
  environment, never from CLI arguments or the params file.

The skill never embeds secrets in the rendered template, the state file, or
log output.

## Path Conventions

- `SKILL_DIR`: install location of this skill (e.g.
  `~/.claude/skills/bitmovin-encoding-live` or
  `~/.codex/skills/bitmovin-encoding-live`). Used to locate `scripts/` and
  `templates/`.
- `RUN_DIR`: per-run cache directory at
  `~/.cache/bitmovin/bitmovin-encoding-live/<run-id>/`, where `<run-id>` is
  `YYYYMMDD-HHMMSS-<short-hash>`. Holds the rendered template, the params
  file copy, and `state.json` (encoding id and name, encoding type,
  input type, stream key, manifest generator, output ids and paths, and a
  per-manifest list with template id, manifest filename, output id, and
  output path). State files MUST stay outside the skill
  directory so they are never published or installed.

## Scripts

All scripts live in `<SKILL_DIR>/scripts/`. They are deterministic, never
prompt, and read configuration from CLI arguments and environment variables.
SKILL.md is responsible for prompting the user.

| Script | Purpose |
|---|---|
| `ensure_venv.sh` | Prints the path to a Python interpreter that has `bitmovin_api_sdk`, `pyyaml`, `jinja2`, and `jsonschema` available. Uses the user's `python3` if it already has them; otherwise creates / reuses a venv at `~/.cache/bitmovin/bitmovin-encoding-live/.venv/` and installs the deps there. |
| `list_outputs.py [--type s3\|gcs\|...]` | List existing outputs the API key can see. Prints id, type, name, bucket. |
| `create_output.py --type s3\|gcs --name N --bucket B [--cloud-region R]` | Create an output from `BITMOVIN_OUTPUT_*` env vars. Prints `output_id`. |
| `start_from_template.py <rendered-template.yaml> [--run-dir DIR] [--no-validate]` | POST `/encoding/templates/start`. Attempts a local JSON-Schema lint against Bitmovin's published Encoding Template schema first (24h-cached on disk); when validation runs, schema errors abort the submit. `--no-validate` bypasses. Writes `state.json`. Prints `encoding_id`. |
| `wait_for_running.py <encoding_id> [--state-file PATH] [--timeout-min 10] [--poll-sec 10]` | Poll status until `RUNNING`/`ERROR`, then poll live details until `encoderIp`/`streamKey` are set. Prints ingest URL and the dashboard URL. With `--state-file`, also prints best-effort HTTPS manifest URLs. |
| `show_status.py <encoding_id>` | One-shot status + live details. |
| `stop_live.py <encoding_id>` | POST `/encoding/encodings/<id>/live/stop`. |

## Templates

Jinja2 templates in `<SKILL_DIR>/templates/`:

| Template | Use case |
|---|---|
| `rtmp-live.yaml.j2` | Single RTMP ingest point. Uses `inputs.redundantRtmp` with one `staticIngestPoint` — Bitmovin's API has no separate non-redundant RTMP input type. |
| `redundant-rtmp-live.yaml.j2` | Two RTMP ingest points for HA ingest. |
| `srt-live.yaml.j2` | SRT ingest (CALLER or LISTENER mode). |

All templates produce CMAF-style output: fmp4 muxings serving both DASH and
HLS manifests with `manifestGenerator: V2`. Customers can hand-edit the
rendered YAML before `start_from_template.py` if they need variants
(additional renditions, different segment naming, additional muxing types).

`<SKILL_DIR>/examples/params.example.yaml` documents every parameter.

## Workflow

### Step 1 — Verify prerequisites

Resolve the Python interpreter that has the runtime + validation deps. The helper auto-creates
a dedicated venv at `~/.cache/bitmovin/bitmovin-encoding-live/.venv/` and installs
`bitmovin-api-sdk`, `pyyaml`, `jinja2`, and `jsonschema` if the user's `python3`
doesn't already have them:

```bash
PYTHON=$(bash <SKILL_DIR>/scripts/ensure_venv.sh) || exit 1
test -n "$BITMOVIN_API_KEY" || { echo "error: BITMOVIN_API_KEY is not set" >&2; exit 1; }
echo "OK ($PYTHON)"
```

`$PYTHON` is reused for every subsequent step. If `BITMOVIN_API_KEY` is empty,
ask the user to export it before continuing.

If `python3` itself is missing, the helper prints a clear error and exits
non-zero — point the user at https://www.python.org/downloads/ (Python ≥ 3.10).

### Step 2 — Pick scenario

Ask the user which input type to use. These are the only valid choices —
do **not** offer an `Other (specify)` fallback for this question:

1. `rtmp` — single RTMP ingest (most common)
2. `redundant-rtmp` — two RTMP ingest points for HA
3. `srt` — SRT ingest

Map to the matching template under `<SKILL_DIR>/templates/`.

### Step 3 — Output (reuse or create)

Ask whether to **reuse** an existing output or **create** a new one.

**Reuse**: optionally run `"$PYTHON" <SKILL_DIR>/scripts/list_outputs.py` (filter
with `--type s3` etc. if the user knows the type). Take an `output_id` from the
user. If you list outputs first, stop there and ask the user to choose one before
moving on. Do not start Step 4 until `outputId` is captured.

**Create**: confirm provider (`s3` or `gcs`), bucket name, and that the
relevant env vars are set:

- `s3`: `BITMOVIN_OUTPUT_ACCESS_KEY`, `BITMOVIN_OUTPUT_SECRET_KEY`
- `gcs`: `BITMOVIN_OUTPUT_ACCESS_KEY`, `BITMOVIN_OUTPUT_SECRET_KEY` (GCS
  HMAC interoperability keys)

Then run:

```bash
"$PYTHON" <SKILL_DIR>/scripts/create_output.py \
  --type <s3|gcs> --name <NAME> --bucket <BUCKET>
```

It prints the new `output_id`. Capture it immediately and do not start Step 4
until it has been written into the working `params.yaml`.

Never accept access keys / secret keys / service-account JSON contents on
the CLI or in the params file. If env vars are missing, stop and ask the
user to export them.

### Step 4 — Gather parameters

Ask the user **one question at a time** with a selectable options menu (e.g.
via `AskUserQuestion` in Claude Code, or an equivalent picker in other
hosts). Don't ask the user to fill out the whole `params.yaml` in one go.
Step 3 must be fully complete before Step 4 begins: once output selection or
creation starts, keep the user in that flow until `outputId` is resolved and
persisted.

For every question, present the listed options. The first option is the
default — pre-select it. Always include an `Other (specify)` choice that
falls back to free-text input. Once an answer is captured, write it to the
running `params.yaml` and move on to the next question.

The list below is the authoritative ordering. Ask in this order; skip any
parameter the user has already supplied earlier in the conversation. The
SRT block is only relevant for the `srt` scenario.

1. **encodingName** — free text. Suggest `live-<short-purpose>`.
2. **cloudRegion** — always ask (no default).
   - `AWS_EU_WEST_1`
   - `AWS_US_EAST_1`
   - `AWS_AP_SOUTHEAST_1`
   - `GOOGLE_EUROPE_WEST_1`
   - `GOOGLE_US_CENTRAL_1`
   - `AZURE_EUROPE_WEST`
   - `Other (specify)`
3. **outputBasePath** — free text. Suggest `live/<encodingName>/`.
4. **streamKey** — RTMP scenarios only (`rtmp`, `redundant-rtmp`); skip
   this question for `srt`, where ingest is identified by host/port instead
   of a stream key. Free text.
   - `bitmovin` *(default)*
   - `Other (specify)`
5. **outputAcl** — always ask, surface security implications.
   - `PUBLIC_READ` *(default — anyone with the URL can play)*
   - `PRIVATE` *(signed URLs only)*
   - `NONE` *(omit ACL block; bucket-level default applies)*
6. **manifests**
   - `[dash, hls]` *(default)*
   - `[hls]`
   - `[dash]`
7. **videoLadder**
   - `240p + 480p + 720p (default)` → `[{240,800k}, {480,1.6M}, {720,3M}]`
   - `360p + 720p + 1080p` → `[{360,1.2M}, {720,3M}, {1080,5M}]`
   - `720p only` → `[{720,3M}]`
   - `Other (specify)` — free-text JSON / YAML list of `{height,bitrate}`
8. **audioBitrate** (bps)
   - `128000` *(default)*
   - `96000`
   - `192000`
   - `256000`
9. **segmentLength** (seconds)
   - `4.0` *(default)*
   - `2.0`
   - `6.0`
   - `Other (specify)`
10. **encoderVersion** — these are the only valid choices; do **not**
    offer an `Other (specify)` fallback for this question.
    - `STABLE` *(default)*
    - `BETA`
11. **autoShutdownStreamTimeoutMin**
    - `30` *(default)*
    - `5`
    - `15`
    - `60`
    - `Other (specify)`
12. **autoShutdownBytesReadTimeoutSec**
    - `30` *(default)*
    - `60`
    - `120`
    - `Other (specify)`

SRT-only questions (`srt-live.yaml.j2`):

13. **srtMode** — always ask.
    - `LISTENER` *(default — encoder listens; you push to it)*
    - `CALLER` *(encoder dials out to your host:port)*
14. **srtHost** — only when `srtMode == CALLER`. Free text.
15. **srtPort**
    - `2088` *(default; required to be 2088 / 2089 / 2090 / 2091 in LISTENER mode)*
    - `2089`
    - `2090`
    - `2091`
    - `Other (specify)` *(LISTENER mode rejects ports outside that set)*
16. **srtPath** — free text.
    - `live` *(default)*
    - `Other (specify)`
17. **srtLatencyMs**
    - `2000` *(default)*
    - `500`
    - `1000`
    - `4000`
    - `Other (specify)`
18. **srtPassphrase** — optional AES passphrase for the SRT input. Free
    text. Must be exactly 16 characters (AES-128) or 32 characters
    (AES-256); the template infers `keyLength` from the length. Skip the
    question when the user picks `None`.
    - `None` *(default — unencrypted SRT)*
    - `Other (specify)` — paste a 16- or 32-character passphrase

`manifestGenerator` is hardcoded to `V2` in all templates and is no longer a
configurable parameter.

After the last question, echo the resolved `params.yaml` back to the user
in full and confirm before proceeding to Step 5.

### Step 5 — Render template

Render the chosen Jinja template into `<RUN_DIR>/template.yaml`:

```bash
RUN_ID=$(date -u +%Y%m%d-%H%M%S)-$(openssl rand -hex 3)
RUN_DIR="$HOME/.cache/bitmovin/bitmovin-encoding-live/$RUN_ID"
mkdir -p "$RUN_DIR"
cp params.yaml "$RUN_DIR/params.yaml"
"$PYTHON" -c "
import jinja2, sys, yaml, pathlib
params = yaml.safe_load(pathlib.Path('$RUN_DIR/params.yaml').read_text())
env = jinja2.Environment(
    loader=jinja2.FileSystemLoader('<SKILL_DIR>/templates'),
    undefined=jinja2.StrictUndefined,
    trim_blocks=True, lstrip_blocks=True,
)
out = env.get_template('<TEMPLATE_NAME>.yaml.j2').render(**params)
pathlib.Path('$RUN_DIR/template.yaml').write_text(out)
print('$RUN_DIR/template.yaml')
"
```

Show the rendered YAML to the user (or its key sections) and confirm before
posting.

### Step 6 — Create + start

```bash
"$PYTHON" <SKILL_DIR>/scripts/start_from_template.py "$RUN_DIR/template.yaml" \
  --run-dir "$RUN_DIR"
```

Before submitting, the script attempts to validate the rendered YAML
against Bitmovin's published Encoding Template JSON schema. The schema is
fetched once and cached for 24h at
`$BITMOVIN_LIVE_SKILL_CACHE/template-schema-v1.json` (default
`~/.cache/bitmovin/bitmovin-encoding-live/template-schema-v1.json`); the
fetch is best-effort, falling back to a stale cache offline. When the
schema is available, any validation errors are listed and the script
refuses to POST — this catches the same class of bug (e.g.
`inputs.rtmp` instead of `inputs.redundantRtmp`) the Templates API
otherwise accepts silently and can turn into a stuck encoding. If the
schema cannot be loaded, the script warns and proceeds without this
pre-flight safeguard. Pass `--no-validate` to bypass.

Captures the `encoding_id` and writes `state.json` with `encodingId`,
`encodingName`, `encodingType`, `inputType`, `streamKey`, `manifestGenerator`,
`outputIds`, `outputPaths`, and `manifests` (one entry per manifest with
its template id, manifest filename, output id, and output path). Prints
`encoding_id` to stdout.

### Step 7 — Wait for `RUNNING`

```bash
"$PYTHON" <SKILL_DIR>/scripts/wait_for_running.py <encoding_id> \
  --state-file "$RUN_DIR/state.json"
```

Polls every 10s with a 10-minute timeout. Transient `BitmovinException`s are
ignored — live encoders take a few minutes to come up. Once `RUNNING` is reached
the script polls live details until `encoderIp` and `streamKey` are set,
then prints:

- Ingest URL: for the RTMP templates, the script prints the static
  RTMP/RTMPS ingest URL(s) assigned to the encoding when it can resolve them,
  otherwise it tells the user to check the dashboard; for SRT it prints
  `srt://<encoderIp>:<port>` (LISTENER) / the encoder-dials-out target (CALLER)
- Manifest URLs (when `--state-file` is passed) derived from the output's
  bucket and the manifest path — best-effort for S3 and GCS. For other
  output types or unknown buckets the script falls back to
  `<output:<id>>/<path>` and tells the user to plug in their CDN/origin URL
- A dashboard URL in the form `https://dashboard.bitmovin.com/live/encodings/<encoding-id>`

### Stop when the user is done

Remind the user that an encoding is now running.
Offer to stop the encoding for the user.

```bash
"$PYTHON" <SKILL_DIR>/scripts/stop_live.py <encoding_id>
```

The encoding shell remains in the account (not deleted). The user can
inspect logs and statistics afterwards via the dashboard.

## Out of scope (point users at docs)

- DRM (Widevine, PlayReady, FairPlay)
- SCTE-35 / ESAM signal processing
- Ad insertion
- Live content insertion (mid-roll VOD splicing)
- Multi-period DASH
- Captions and subtitles (DVB, CEA-608/708, SRT subtitle, WebVTT)
- Custom infrastructure (BYOC, role-based AWS, Azure, OCI)
- Standby pools

For any of these, link the user to https://developer.bitmovin.com/encoding/docs
and stop. Do not extend this skill inline.

## Safety Rules

- Never log `BITMOVIN_API_KEY`, `BITMOVIN_OUTPUT_ACCESS_KEY`,
  `BITMOVIN_OUTPUT_SECRET_KEY`, or any value resembling a secret.
- Never accept credentials as CLI args or in `params.yaml`.
- Never write secrets into `state.json` or the rendered template.
- If a user pastes a secret into the prompt, refuse to use it; tell them to
  export it as an env var instead.
