---
name: bitmovin-encoding-vod
description: Guide a user through creating and starting a Bitmovin VOD encoding (H.264 per-title, H.264 fixed ladder, AV1 per-title for UGC, H.264 hardware-accelerated sports clips, or a custom-built template assembled from the user's free-text use case using the Encoding Template schema and a cross-field rulebook) end-to-end via the Bitmovin CLI's Encoding Templates commands.
---

# Bitmovin VOD Encoding Skill

Walks the user through configuring and starting a Bitmovin VOD encoding.
The heavy lifting is done by the Bitmovin **Encoding Templates API**: a
single `POST /encoding/templates/start` creates inputs, codec configs,
encoding, streams, muxings, manifests **and** starts the encoding from
one YAML document.

This skill renders that YAML from a small parameter file, validates and
submits it via the **Bitmovin CLI** (`bitmovin encoding ...`), polls
until the encoder reaches `FINISHED`, and points the user at the
dashboard to grab manifest URLs.

## Prerequisites

- **Bitmovin CLI** (`@bitmovin/cli`, ≥ 0.2.0) — drives `inputs list/create`,
  `outputs list/create`, `templates validate`, `templates start`,
  `jobs get`, `jobs status`. Install with `npm install -g @bitmovin/cli`.
- **Python ≥ 3.10** — Step 1's `scripts/ensure_venv.sh` auto-creates a
  dedicated venv and installs `pyyaml` and `jinja2` into it if they
  aren't already importable from the user's `python3`. Used only by the
  inline Jinja render block in Step 6 and by `validate_rules.py` in
  Step 7; every other workflow step is the CLI.
- `BITMOVIN_API_KEY` environment variable set.
- For creating a new output (optional): `BITMOVIN_OUTPUT_ACCESS_KEY` /
  `BITMOVIN_OUTPUT_SECRET_KEY` env vars (see Step 4). Credentials are
  read from the environment and passed to the CLI via shell expansion at
  invocation time — never hardcoded into scripts, the params file, or
  the rendered template.

The skill never embeds secrets in the rendered template or log output.
Inputs that need credentials (S3, GCS, Azure, …) must be **reused** via
an existing input id — they are never created from this skill, since
that would require pasting credentials into a parameter file.

## Path Conventions

- `SKILL_DIR`: install location of this skill (e.g.
  `~/.claude/skills/bitmovin-encoding-vod` or
  `~/.codex/skills/bitmovin-encoding-vod`). Used to locate `scripts/` and
  `templates/`.
- `RUN_DIR`: per-run cache directory at
  `~/.cache/bitmovin/bitmovin-encoding-vod/<run-id>/`, where `<run-id>` is
  `YYYYMMDD-HHMMSS-<short-hash>`. Holds the rendered template and a copy
  of the params file. RUN_DIR MUST stay outside the skill directory so
  its contents are never published or installed.

## Scripts

| Script | Purpose |
|---|---|
| `scripts/ensure_venv.sh` | Prints the path to a Python interpreter that has `pyyaml` and `jinja2` available. Uses the user's `python3` if it already has them; otherwise creates / reuses a venv at `~/.cache/bitmovin/bitmovin-encoding-vod/.venv/` and installs the deps there. |
| `scripts/validate_rules.py <template.yaml>` | Runs cross-field rule checks (see `references/rulebook.yaml`) against a rendered Encoding Template. Catches semantic errors the JSON schema can't express — fMP4-stream-count, AV1 min bitrate (with per-title carve-out), per-title bitrate algebra, hardware-encoding limits, sprite/thumbnail rules, Dolby Vision constraints. Exits non-zero on violations. Always run between `bitmovin encoding templates validate` and `bitmovin encoding templates start`. |

All other workflow steps — input listing / creation, output listing /
creation, template validation / submission, status polling — are driven
directly by the Bitmovin CLI from the inline shell snippets in this
document. SKILL.md is responsible for prompting the user.

## References

| File | Purpose |
|---|---|
| `references/rulebook.yaml` | Cross-field semantic rules for VOD encodings, derived from Bitmovin's server-side validators. Each rule has an `id`, a `rule` description, and an `applies_when` predicate. Consulted during the custom-build flow (Step 2b) to prune options the API would reject; enforced post-render by `validate_rules.py`. |

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
`bitmovin encoding templates start` if they need variants (more
renditions, different segment naming, additional muxing types).

`<SKILL_DIR>/examples/params.example.yaml` documents every parameter.

## Workflow

### Step 1 — Verify prerequisites

Confirm the Bitmovin CLI is installed and resolve the Python interpreter
that has the runtime deps (used by Steps 6 and 7):

```bash
command -v bitmovin >/dev/null \
  || { echo "error: bitmovin CLI not found. Install with: npm install -g @bitmovin/cli" >&2; exit 1; }
PYTHON=$(bash <SKILL_DIR>/scripts/ensure_venv.sh) || exit 1
test -n "$BITMOVIN_API_KEY" || { echo "error: BITMOVIN_API_KEY is not set" >&2; exit 1; }
echo "OK ($PYTHON)"
```

`$PYTHON` is reused in Steps 6 and 7. If `BITMOVIN_API_KEY` is empty,
ask the user to export it before continuing. The CLI reads the key from
the same env var, so no extra config is required.

If `python3` itself is missing, `ensure_venv.sh` prints a clear error
and exits non-zero — point the user at https://www.python.org/downloads/
(Python ≥ 3.10).

### Step 2 — Pick scenario

Ask the user which template to use. These are the only valid choices —
do **not** offer an `Other (specify)` free-text fallback. The fifth
option is the explicit escape hatch:

1. `per-title-h264` — H.264 Per-Title (default; let the algorithm pick the ladder)
2. `fixed-ladder-h264` — H.264 fixed ladder (you specify the renditions)
3. `av1-per-title-ugc` — AV1 Per-Title for UGC pipelines (progressive MP4, no manifests, ~50% bitrate savings vs H.264)
4. `sports-clips-h264` — H.264 sports clips with NVIDIA hardware acceleration (VOD_HARDWARE_SHORTFORM preset, HLS-only, hardcoded sports ladder, time-to-publish optimized)
5. `custom` — none of the above fits; describe the use case in free text and the skill assembles a template from the schema + rulebook (see Step 2b)

For options 1–4, map to the matching template under
`<SKILL_DIR>/templates/`. For option 5, jump to **Step 2b** before Step 3.

### Step 2b — Custom Build (only when scenario = `custom`)

The user has described a use case the four prebaked scenarios don't fit.
The skill guides them through assembling a template from primitives,
filtering options at each decision using the cross-field rulebook so
choices that the API would reject never appear.

**Sources of truth, in order of authority:**

1. `<SKILL_DIR>/references/rulebook.yaml` — semantic compatibility rules
   derived from Bitmovin's server-side validators. Each rule has an
   `applies_when` predicate; if it matches the user's choices, apply the
   rule's constraint. Every rule applies to VOD (live-only rules have
   been removed).
2. `~/.config/bitmovin/template-schema-v1.json` — the published Encoding
   Template JSON Schema (24h-cached by `bitmovin encoding templates
   validate`). Use it to discover allowed values for enum fields
   (codecs, profiles, manifest types, DRM types, ACL permissions, …).
   If the cache is missing, run `bitmovin encoding templates validate`
   against any prebaked template once to warm it, or fall back to the
   four existing templates as worked examples.
3. `<SKILL_DIR>/templates/*.yaml.j2` — worked examples of valid template
   shapes. Read at least one matching the user's container choice
   (fmp4 / progressive mp4 / hls-only) before authoring.

**Workflow:**

1. **Capture the use case.** Take the user's free-text description.
   Re-state your understanding back in one sentence and confirm before
   continuing.

2. **Walk a decision tree.** Ask **one question at a time** with a
   selectable picker. After each answer, consult the rulebook: drop any
   downstream option whose `applies_when` would conflict with the
   answers so far. Order:

   a. **Video codec(s)** — h264 (broadest device support), h265
      (~50% bandwidth savings), av1 (~50% savings, newer; rule
      `codec.av1.min_bitrate` requires bitrate ≥ 10000 unless
      per-title). Multi-codec ladders allowed.
   b. **Encoding strategy** — per-title (algorithm-driven ladder, runs
      THREE_PASS), fixed ladder (renditions you list), single rendition.
   c. **Audio** — AAC (default), Dolby Atmos / DD+ (rule
      `dd.drm_encoder_features` gates with DRM; rule `dd.invalid_filters`
      blocks AUDIO_VOLUME / WATERMARK / ENHANCED_WATERMARK), pass-through,
      or none (video-only).
   d. **Muxing format** — fmp4 (CMAF-style; works with DASH and HLS;
      rule `muxing.fmp4.exactly_one_stream` means one muxing per
      stream), progressive MP4 (single file, no manifest), TS, CMAF.
      For fmp4 + AV1, rule `muxing.mp4_fragmented.av1_manifest_type`
      restricts manifest type to DASH_ON_DEMAND or NONE.
   e. **Manifest format** — DASH only, HLS only, both, none. Default-API
      manifests (`defaultapi.<id>`) are simpler than custom; prefer them
      unless the user needs custom adaptation sets.
   f. **DRM** (optional) — none (default), Widevine, PlayReady, FairPlay,
      multi-DRM via CencDrm. Rulebook gates: `drm.fmp4.fairplay_codec`
      requires HEVC for fmp4+FairPlay unless encoder version supports
      `FIXED_ENCRYPTION_METHOD_SELECTION`.
   g. **HDR / Dolby Vision** (optional) — none (default), HDR10, Dolby
      Vision. DV pulls in many rules (`dv.input_codec_allowlist` →
      H.264/H.265 only, `dv.muxing_audio_codec_allowlist` → AAC/Atmos
      audio, `dv.pixel_format` → YUV420P10LE, `dv.bufsize_maxrate_required`
      except per-title which uses `dv.per_title_factors_required`).
      Walk these explicitly with the user.
   h. **Hardware acceleration** (optional) — none (default), or NVIDIA
      preset. Hardware encoding pulls in rules `hw.vod_only`,
      `hw.aws_only`, `hw.no_per_title`, `hw.no_dolby_vision`,
      `hw.no_filters`, `hw.no_thumbnails`, `hw.no_psnr`, etc. — if the
      user already chose per-title or DV, hardware is no longer offered.
   i. **Out-of-scope features** — sprites, subtitles (CEA / WebVTT /
      IMSC), filters (watermark / scale / crop), SCTE-35,
      concatenation, multi-period DASH. If the user needs any of
      these, point them at https://developer.bitmovin.com/encoding/docs
      and stop the custom build (the rulebook covers some of these but
      the skill does not yet author the YAML for them).

3. **Author the YAML.** Once the decision tree is complete, write
   `$RUN_DIR/template.yaml` directly. Use the prebaked templates as
   structural examples. Required top-level keys: `metadata` (with
   `type: VOD`), `configurations`, `encodings`, optionally `manifests`.
   Reference inputs/outputs by id (Steps 3 + 4). Show the assembled
   YAML to the user and confirm before continuing.

4. **Rejoin Step 7.** Skip Steps 5 (gather params) and 6 (render
   template) — the YAML is already authored. Step 7 runs
   `bitmovin encoding templates validate` plus `validate_rules.py`, so
   if any rulebook constraint was missed during the decision tree, it
   surfaces as a violation before the submit.

If, during the decision tree, the user picks a combination that the
rulebook says is impossible (e.g. hardware + per-title), stop, explain
which rule blocks it (cite `rule.id`), and ask the user to revisit the
prior decision.

### Step 3 — Input source

Ask whether to **reuse** an existing input or **create** a fresh HTTPS
input. The skill never accepts credentials, so for S3/GCS/Azure the
input must already exist in the account.

**Reuse**: optionally run `bitmovin encoding inputs list --type s3`
(filter with `--type https`, `--type gcs`, etc. if the user knows the
type) to surface candidates. Capture the `id` from the user. Persist it
as `inputId` in the working `params.yaml`.

**Create HTTPS**: ask for the host (no scheme, no path — e.g.
`bitmovin-sample-content.s3.eu-west-1.amazonaws.com`) and a name. Then
run:

```bash
bitmovin encoding inputs create https \
  --name "<NAME>" --host "<HOST>" \
  --json --jq .id
```

It prints the new `input_id`. Persist it as `inputId` in `params.yaml`.

In **both** cases, also ask for `inputPath` — the path to the input file
*inside* the input source (e.g. `/sintel/sintel.mp4` or
`/path/inside/bucket/file.mp4`). Persist as `inputPath`.

> Note: Templates reference inputs via `inputId`. The "Create HTTPS"
> path materializes the input first (returns an id); the template then
> references that id like any other input. This keeps the
> credential-free / credential-bearing distinction at the create step
> rather than smearing it across template rendering.

Do not start Step 4 until both `inputId` and `inputPath` are captured.

### Step 4 — Output (reuse or create)

Ask whether to **reuse** an existing output or **create** a new one.

**Reuse**: optionally run `bitmovin encoding outputs list --type s3`
(or `gcs`, `azure`) to surface candidates. Capture the `id` from the
user. If you list outputs first, stop there and ask the user to choose
one before moving on. Do not start Step 5 until `outputId` is captured.

**Create**: confirm provider (`s3` or `gcs`), bucket name, and that the
relevant env vars are set:

- `s3`: `BITMOVIN_OUTPUT_ACCESS_KEY`, `BITMOVIN_OUTPUT_SECRET_KEY` (AWS keys)
- `gcs`: `BITMOVIN_OUTPUT_ACCESS_KEY`, `BITMOVIN_OUTPUT_SECRET_KEY` (GCS
  HMAC interoperability keys)

Then run (env-var expansion only — never inline literals):

```bash
bitmovin encoding outputs create s3 \
  --name "<NAME>" --bucket "<BUCKET>" --region "<AWS_REGION>" \
  --access-key "$BITMOVIN_OUTPUT_ACCESS_KEY" \
  --secret-key "$BITMOVIN_OUTPUT_SECRET_KEY" \
  --json --jq .id
```

(Use `bitmovin encoding outputs create gcs ...` for GCS — same flag
shape, no `--region`.) Capture the printed `output_id` immediately and
do not start Step 5 until it has been written into the working
`params.yaml`.

Never accept access keys / secret keys / service-account JSON contents
as literal CLI args or in the params file. If env vars are missing,
stop and ask the user to export them.

### Step 5 — Gather parameters

*Scenarios 1–4 only. For `custom`, the template was authored in Step 2b
and Steps 5 + 6 are skipped — proceed directly to Step 7.*

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

*Scenarios 1–4 only. For `custom`, the template was authored directly
in Step 2b — skip to Step 7.*

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

### Step 7 — Validate + start

Validate the rendered YAML in two passes — schema (the CLI) and
cross-field semantic rules (`validate_rules.py`) — then submit it. The
CLI fetches the schema once and caches it for 24h at
`~/.config/bitmovin/template-schema-v1.json`.

```bash
# 1. Schema check — structural validity, required fields, enum values.
bitmovin encoding templates validate "$RUN_DIR/template.yaml"

# 2. Cross-field rule check — semantic constraints the schema can't
#    express (fMP4 stream count, AV1 min bitrate, per-title bitrate
#    algebra, hardware-encoding limits, sprite/thumbnail rules,
#    Dolby Vision constraints). Skip only as a last resort if a rule
#    fires that the user is sure is a false positive (the API may still
#    reject server-side).
"$PYTHON" <SKILL_DIR>/scripts/validate_rules.py "$RUN_DIR/template.yaml" \
  || { echo "error: rule checks failed; fix the template before submitting" >&2; exit 1; }

# 3. Submit.
ENCODING_ID=$(
  bitmovin encoding templates start "$RUN_DIR/template.yaml" \
    | awk '/^Encoding started:/ {print $3}'
)
test -n "$ENCODING_ID" || { echo "error: failed to capture encoding id" >&2; exit 1; }
echo "encoding id: $ENCODING_ID"
```

Do **not** pass `--watch` here — Step 8 runs a defensive partial-parse
check first. `--watch` would skip that and wait for terminal status
even when the template was silently dropped.

If `templates validate` reports schema errors, or `validate_rules.py`
prints any violations, abort and surface them to the user. For prebaked
scenarios the structure usually points at a missing param; for `custom`,
the rule_id in the violation output points directly at
`references/rulebook.yaml` for the explanation.

### Step 8 — Wait for `FINISHED`

Two short polling loops. Both call the Bitmovin CLI; no Python helper
is involved.

**8a — defensive partial-parse check (≈15s).** The Templates API
occasionally returns 200 + encoding-id but silently drops sections it
didn't recognize (e.g. unknown top-level keys). Confirm the encoding's
`type` settled to `VOD` before doing anything else:

```bash
DEADLINE=$(( $(date +%s) + 15 ))
ACTUAL_TYPE=""
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  ACTUAL_TYPE=$(bitmovin encoding jobs get "$ENCODING_ID" --jq .type 2>/dev/null | tr -d '"')
  [ "$ACTUAL_TYPE" = "VOD" ] && break
  sleep 2
done
if [ "$ACTUAL_TYPE" != "VOD" ]; then
  echo "error: Templates API silently dropped most of the template" >&2
  echo "  encoding $ENCODING_ID has type='$ACTUAL_TYPE' (expected 'VOD') after 15s" >&2
  echo "  inspect the rendered template at $RUN_DIR/template.yaml for unknown keys" >&2
  exit 1
fi
```

**8b — wait for terminal status.** VOD encodings progress
QUEUED → RUNNING → FINISHED. Bail out on ERROR / CANCELED. Default
timeout 120 minutes — extend for long inputs. Transient CLI errors
(network blips, 5xx) are ignored:

```bash
DEADLINE=$(( $(date +%s) + 120 * 60 ))
STATUS=""
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  STATUS=$(bitmovin encoding jobs status "$ENCODING_ID" --jq .status 2>/dev/null | tr -d '"')
  case "$STATUS" in
    FINISHED) break ;;
    ERROR|CANCELED|TRANSFER_ERROR) echo "error: encoding $ENCODING_ID reached terminal status $STATUS" >&2; exit 1 ;;
  esac
  sleep 15
done
[ "$STATUS" = "FINISHED" ] || { echo "error: timed out after 120 min waiting for FINISHED" >&2; exit 1; }

echo
echo "Dashboard:    https://dashboard.bitmovin.com/encoding/encodings/$ENCODING_ID"
echo "Output base:  <outputBasePath from params> (manifests are listed in the dashboard)"
```

Manifest URL synthesis is delegated to the dashboard — the rendered
output paths plus per-bucket conventions are easier to surface there
than to reconstruct in the shell. The user can also call
`bitmovin encoding manifests list --type dash` and `--type hls` for
the manifest IDs and use `bitmovin encoding manifests get <id> --type
<dash|hls>` to inspect details.

### After it finishes

The encoding is now done; output files are in the bucket. The encoding
record stays in the account so the user can inspect logs, statistics,
and re-export manifests via the dashboard. There is no "stop" step for
VOD — it has already terminated.

For an ad-hoc status check at any point, use the CLI directly:

```bash
bitmovin encoding jobs status "$ENCODING_ID"
```

## Out of scope (point users at docs)

- DRM (Widevine, PlayReady, FairPlay) and SPEKE
- HDR / Dolby Vision conversions
- SCTE-35 / ESAM / server-side ad insertion
- Multi-period DASH
- Captions and subtitles (CEA-608/708, WebVTT, IMSC)
- Filters (watermark, scale, crop, text overlay)
- VP9 codec (AV1 is supported via `av1-per-title-ugc`)
- Concatenation of multiple inputs
- Per-Title with manual ladder anchors beyond the single 1080p anchor

The custom-build flow (Step 2b) can attempt some of these — the
rulebook covers cross-field constraints for DRM, Dolby Vision,
hardware encoding, sprites, thumbnails, encoding modes, and per-title
bitrate algebra — but the skill does not yet author the YAML for
sprites, subtitles, filters, SCTE-35, concatenation, or multi-period
DASH. For those, link the user to https://developer.bitmovin.com/encoding/docs
and stop. Do not extend this skill inline.

## Safety Rules

- Never log `BITMOVIN_API_KEY`, `BITMOVIN_OUTPUT_ACCESS_KEY`,
  `BITMOVIN_OUTPUT_SECRET_KEY`, or any value resembling a secret.
- Never accept credentials as literal CLI args or in `params.yaml`. The
  Bitmovin CLI's `outputs create` requires `--access-key` /
  `--secret-key` flags — pass these only via shell env-var expansion
  (`--access-key "$BITMOVIN_OUTPUT_ACCESS_KEY"`) so the literal value
  never appears in scripts, history, or rendered templates.
- Never write secrets into the rendered template.
- If a user pastes a secret into the prompt, refuse to use it; tell
  them to export it as an env var instead.
- Inputs that need credentials (S3/GCS/Azure/SFTP/...) MUST be reused
  via an existing `inputId`. The skill only creates HTTP/HTTPS inputs.
