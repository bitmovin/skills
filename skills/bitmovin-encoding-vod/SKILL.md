---
name: bitmovin-encoding-vod
description: Guide a user through creating and starting a Bitmovin VOD encoding (H.264 per-title, H.264 fixed ladder, AV1 per-title for UGC, or H.264 hardware-accelerated sports clips) end-to-end via the Encoding Templates API and the Bitmovin Python SDK.
---

# Bitmovin VOD Encoding Skill

Walks the user through configuring and starting a Bitmovin VOD encoding.
The heavy lifting is done by the Bitmovin **Encoding Templates API**: a
single `POST /encoding/templates/start` creates inputs, codec configs,
encoding, streams, muxings, manifests **and** starts the encoding from
one YAML document.

This skill renders that YAML from a small parameter file, submits it,
polls until the encoder is `FINISHED`, and prints the manifest URLs.

## Prerequisites

- Python ≥ 3.10 — Step 1's `scripts/ensure_venv.sh` auto-creates a dedicated
  venv and installs `bitmovin-api-sdk`, `pyyaml`, `jinja2`, and `jsonschema`
  if they aren't already importable from the user's `python3`.
- `BITMOVIN_API_KEY` environment variable set.
- For creating a new output (optional): `BITMOVIN_OUTPUT_*` env vars (see
  `scripts/create_output.py --help`). Credentials are **only** read from the
  environment, never from CLI arguments or the params file.

The skill never embeds secrets in the rendered template, the state file, or
log output. Inputs that need credentials (S3, GCS, Azure, …) must be
**reused** via an existing input id — they are never created from this
skill, since that would require pasting credentials into a parameter file.

## Path Conventions

- `SKILL_DIR`: install location of this skill (e.g.
  `~/.claude/skills/bitmovin-encoding-vod` or
  `~/.codex/skills/bitmovin-encoding-vod`). Used to locate `scripts/` and
  `templates/`.
- `RUN_DIR`: per-run cache directory at
  `~/.cache/bitmovin/bitmovin-encoding-vod/<run-id>/`, where `<run-id>` is
  `YYYYMMDD-HHMMSS-<short-hash>`. Holds the rendered template, the params
  file copy, and `state.json`. State files MUST stay outside the skill
  directory so they are never published or installed.

## Scripts

All scripts live in `<SKILL_DIR>/scripts/`. They are deterministic, never
prompt, and read configuration from CLI arguments and environment variables.
SKILL.md is responsible for prompting the user.

| Script | Purpose |
|---|---|
| `ensure_venv.sh` | Prints the path to a Python interpreter that has `bitmovin_api_sdk`, `pyyaml`, `jinja2`, and `jsonschema` available. Uses the user's `python3` if it already has them; otherwise creates / reuses a venv at `~/.cache/bitmovin/bitmovin-encoding-vod/.venv/` and installs the deps there. |
| `list_inputs.py [--type http\|https\|s3\|gcs\|...]` | List existing inputs the API key can see. Prints kind, id, name, host/bucket. |
| `create_input.py --type http\|https --host H [--name N]` | Create a fresh HTTP/HTTPS input (no credentials needed). For S3/GCS/Azure, reuse an existing input via `list_inputs.py`. Prints `input_id`. |
| `list_outputs.py [--type s3\|gcs\|...]` | List existing outputs the API key can see. Prints id, type, name, bucket. |
| `create_output.py --type s3\|gcs --name N --bucket B [--cloud-region R]` | Create an output from `BITMOVIN_OUTPUT_*` env vars. Prints `output_id`. |
| `start_from_template.py <rendered-template.yaml> [--run-dir DIR] [--no-validate]` | POST `/encoding/templates/start`. Attempts a local JSON-Schema lint against Bitmovin's published Encoding Template schema first (24h-cached on disk); when validation runs, schema errors abort the submit. `--no-validate` bypasses. Writes `state.json`. Prints `encoding_id`. |
| `wait_for_finished.py <encoding_id> [--state-file PATH] [--timeout-min 120] [--poll-sec 15]` | Poll status until `FINISHED`, then print best-effort HTTPS manifest URLs (when `--state-file` is passed) and the dashboard URL. Aborts on `ERROR` / `CANCELED`. |
| `show_status.py <encoding_id>` | One-shot status + progress percentage. |

## Templates

Jinja2 templates in `<SKILL_DIR>/templates/`:

| Template | Use case |
|---|---|
| `per-title-h264.yaml.j2` | H.264 Per-Title encoding — Bitmovin's algorithm picks an optimal bitrate ladder per input. Includes a 1080p fixed-resolution anchor so the ladder always reaches HD when the source supports it. THREE_PASS encoding. Default DASH + HLS manifests. |
| `fixed-ladder-h264.yaml.j2` | H.264 fixed bitrate ladder — encode the renditions you specify in `videoLadder`. Predictable output sizes, fast encode (single-pass by default). Default DASH + HLS manifests. |
| `av1-per-title-ugc.yaml.j2` | AV1 Per-Title for viral / UGC pipelines — ~50% bitrate savings vs H.264. Emits a progressive MP4 file per rendition (no fmp4 segments, no DASH/HLS manifest), video-only. Includes a 1080p fixed-resolution anchor. THREE_PASS encoding. |
| `sports-clips-h264.yaml.j2` | H.264 sports-clips workflow optimized for time-to-publish — NVIDIA-GPU-backed `VOD_HARDWARE_SHORTFORM` preset, 9-rendition ladder (360p–1080p with multi-bitrate steps at 540p/720p/1080p), HLS-only with explicit per-rendition manifest config. Pinned to `cloudRegion: AWS_EU_WEST_1` (required for the hardware preset). Video-only, ACL=PRIVATE by default. |

The H.264 per-title / fixed-ladder templates produce CMAF-style fmp4
with default DASH+HLS manifests. The AV1 UGC template produces
progressive MP4 files without manifests. The sports-clips template
produces fmp4 with HLS-only manifests and uses a hardcoded ladder.
Customers can hand-edit the rendered YAML before
`start_from_template.py` if they need variants (more renditions,
different segment naming, additional muxing types).

`<SKILL_DIR>/examples/params.example.yaml` documents every parameter.

## Workflow

### Step 1 — Verify prerequisites

Resolve the Python interpreter that has the runtime + validation deps:

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

Ask the user which template to use. These are the only valid choices —
do **not** offer an `Other (specify)` fallback for this question:

1. `per-title-h264` — H.264 Per-Title (default; let the algorithm pick the ladder)
2. `fixed-ladder-h264` — H.264 fixed ladder (you specify the renditions)
3. `av1-per-title-ugc` — AV1 Per-Title for UGC pipelines (progressive MP4, no manifests, ~50% bitrate savings vs H.264)
4. `sports-clips-h264` — H.264 sports clips with NVIDIA hardware acceleration (VOD_HARDWARE_SHORTFORM preset, HLS-only, hardcoded sports ladder, time-to-publish optimized)

Map to the matching template under `<SKILL_DIR>/templates/`.

### Step 3 — Input source

Ask whether to **reuse** an existing input or **create** a fresh HTTPS
input. The skill never accepts credentials, so for S3/GCS/Azure the
input must already exist in the account.

**Reuse**: optionally run `"$PYTHON" <SKILL_DIR>/scripts/list_inputs.py`
(filter with `--type s3` etc. if the user knows the type). Take an
`input_id` from the user. Persist it as `inputId` in the working
`params.yaml`.

**Create HTTPS**: ask for the host (no scheme, no path — e.g.
`bitmovin-sample-content.s3.eu-west-1.amazonaws.com`). Then run:

```bash
"$PYTHON" <SKILL_DIR>/scripts/create_input.py --type https --host <HOST>
```

It prints the new `input_id`. Persist it as `inputId` in `params.yaml`.

In **both** cases, also ask for `inputPath` — the path to the input file
*inside* the input source (e.g. `/sintel/sintel.mp4` or
`/path/inside/bucket/file.mp4`). Persist as `inputPath`.

> Note: Templates reference inputs via `inputId`. The "Create HTTPS"
> path runs `create_input.py` to materialize the input first (returns an
> id); the template then references that id like any other input. This
> keeps the credential-free / credential-bearing distinction at the
> create step rather than smearing it across template rendering.

Do not start Step 4 until both `inputId` and `inputPath` are captured.

### Step 4 — Output (reuse or create)

Ask whether to **reuse** an existing output or **create** a new one.

**Reuse**: optionally run `"$PYTHON" <SKILL_DIR>/scripts/list_outputs.py`
(filter with `--type s3` etc.). Take an `output_id` from the user.

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

It prints the new `output_id`. Capture it immediately and do not start
Step 5 until it has been written into the working `params.yaml`.

Never accept access keys / secret keys / service-account JSON contents on
the CLI or in the params file. If env vars are missing, stop and ask the
user to export them.

### Step 5 — Gather parameters

Ask the user **one question at a time** with a selectable options menu (e.g.
via `AskUserQuestion` in Claude Code, or an equivalent picker in other
hosts). Don't ask the user to fill out the whole `params.yaml` in one go.

For every question, present the listed options. The first option is the
default — pre-select it. Always include an `Other (specify)` choice that
falls back to free-text input *unless the question text says otherwise*.
Once an answer is captured, write it to the running `params.yaml` and
move on to the next question.

The list below is the authoritative ordering. Ask in this order; skip any
parameter the user has already supplied earlier in the conversation. Each
question's "applies to" line lists which scenarios it applies to — skip the
question entirely for the others.

1. **encodingName** — free text. Suggest `vod-<short-purpose>`. (all scenarios)
2. **outputBasePath** — free text. Suggest `vod/<encodingName>/`. (all scenarios)
3. **outputAcl** — always ask, surface security implications. (all scenarios)
   - `PUBLIC_READ` *(default for `per-title-h264`, `fixed-ladder-h264` —
     anyone with the URL can play)*
   - `PRIVATE` *(default for `av1-per-title-ugc` and `sports-clips-h264` —
     downstream pipelines typically re-package via their own CDN; signed
     URLs only)*
   - `NONE` *(omit ACL block; bucket-level default applies)*
4. **manifests** — `per-title-h264`, `fixed-ladder-h264` only.
   `av1-per-title-ugc` emits progressive MP4 without a manifest;
   `sports-clips-h264` hardcodes HLS-only.
   - `[dash, hls]` *(default)*
   - `[hls]`
   - `[dash]`
5. **videoLadder** — `fixed-ladder-h264` only. The per-title scenarios
   (`per-title-h264`, `av1-per-title-ugc`) generate their own ladders;
   `sports-clips-h264` ships a fixed 9-rendition sports playbook ladder.
   - `360p + 720p + 1080p (default)` → `[{360,1.2M}, {720,2.4M}, {1080,4.8M}]`
   - `240p + 480p + 720p` → `[{240,400k}, {480,1.2M}, {720,2.4M}]`
   - `1080p only` → `[{1080,4.8M}]`
   - `Other (specify)` — free-text JSON / YAML list of `{height,bitrate}`
6. **audioBitrate** (bps) — `per-title-h264`, `fixed-ladder-h264` only.
   `av1-per-title-ugc` and `sports-clips-h264` are video-only.
   - `128000` *(default)*
   - `96000`
   - `192000`
   - `256000`
7. **segmentLength** (seconds) — `per-title-h264`, `fixed-ladder-h264`,
   `sports-clips-h264`. `av1-per-title-ugc` writes progressive MP4, not
   segments.
   - `4.0` *(default)*
   - `2.0`
   - `6.0`
   - `Other (specify)`
8. **encoderVersion** — these are the only valid choices; do **not**
   offer an `Other (specify)` fallback for this question. (all scenarios)
   - `STABLE` *(default)*
   - `BETA`
9. **encodingMode** — `fixed-ladder-h264` only. The per-title scenarios
   (`per-title-h264`, `av1-per-title-ugc`) hardcode `THREE_PASS` because
   per-title needs the analysis pass; `sports-clips-h264` lets the
   hardware preset pick the mode.
   - `SINGLE_PASS` *(default — fastest, lowest cost)*
   - `TWO_PASS` *(better quality at fixed bitrate)*
   - `THREE_PASS` *(highest quality)*

After the last question, echo the resolved `params.yaml` back to the user
in full and confirm before proceeding to Step 6.

### Step 6 — Render template

Render the chosen Jinja template into `<RUN_DIR>/template.yaml`:

```bash
RUN_ID=$(date -u +%Y%m%d-%H%M%S)-$(openssl rand -hex 3)
RUN_DIR="$HOME/.cache/bitmovin/bitmovin-encoding-vod/$RUN_ID"
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

### Step 7 — Create + start

```bash
"$PYTHON" <SKILL_DIR>/scripts/start_from_template.py "$RUN_DIR/template.yaml" \
  --run-dir "$RUN_DIR"
```

Before submitting, the script attempts to validate the rendered YAML
against Bitmovin's published Encoding Template JSON schema. The schema is
fetched once and cached for 24h at
`$BITMOVIN_VOD_SKILL_CACHE/template-schema-v1.json` (default
`~/.cache/bitmovin/bitmovin-encoding-vod/template-schema-v1.json`); the
fetch is best-effort, falling back to a stale cache offline. When the
schema is available, any validation errors are listed and the script
refuses to POST. If the schema cannot be loaded, the script warns and
proceeds without this pre-flight safeguard. Pass `--no-validate` to
bypass.

Captures the `encoding_id` and writes `state.json` with `encodingId`,
`encodingName`, `encodingType`, `inputType`, `encodingMode`, `perTitle`,
`outputIds`, `outputPaths`, and `manifests` (one entry per manifest with
its template id, manifest filename, output id, and output path). Prints
`encoding_id` to stdout.

### Step 8 — Wait for `FINISHED`

```bash
"$PYTHON" <SKILL_DIR>/scripts/wait_for_finished.py <encoding_id> \
  --state-file "$RUN_DIR/state.json"
```

Polls every 15s with a 120-minute timeout (per-title can take a while
for long inputs — extend `--timeout-min` if needed). Each status change
or progress tick prints a one-line update. On `FINISHED` the script
prints best-effort HTTPS URLs for each manifest (derived from the
output's bucket + path; falls back to `<output:<id>>/<path>` for
unsupported output types). On `ERROR` / `CANCELED` the script exits
non-zero after surfacing the task's error messages.

A dashboard link is printed in the form
`https://dashboard.bitmovin.com/encoding/encodings/<encoding-id>`.

### After it finishes

The encoding is now done; output files are in the bucket. The encoding
record stays in the account so the user can inspect logs, statistics,
and re-export manifests via the dashboard. There is no "stop" step for
VOD — it has already terminated.

## Out of scope (point users at docs)

- DRM (Widevine, PlayReady, FairPlay) and SPEKE
- HDR / Dolby Vision conversions
- SCTE-35 / ESAM / server-side ad insertion
- Multi-period DASH
- Captions and subtitles (CEA-608/708, WebVTT, IMSC)
- Filters (watermark, scale, crop, text overlay)
- VP9 codec (AV1 is covered by `av1-per-title-ugc`)
- Concatenation of multiple inputs
- Per-Title with manual ladder anchors beyond the single 1080p anchor

For any of these, link the user to https://developer.bitmovin.com/encoding/docs
and stop. Do not extend this skill inline.

## Safety Rules

- Never log `BITMOVIN_API_KEY`, `BITMOVIN_OUTPUT_ACCESS_KEY`,
  `BITMOVIN_OUTPUT_SECRET_KEY`, or any value resembling a secret.
- Never accept credentials as CLI args or in `params.yaml`.
- Never write secrets into `state.json` or the rendered template.
- If a user pastes a secret into the prompt, refuse to use it; tell them to
  export it as an env var instead.
- Inputs that need credentials (S3/GCS/Azure/SFTP/...) MUST be reused via
  an existing `inputId`. The skill only creates HTTP/HTTPS inputs.
