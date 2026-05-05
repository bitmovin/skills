---
name: bitmovin-encoding-live
description: Guide a user through creating and starting a Bitmovin live encoding (RTMP, redundant RTMP, SRT, or a custom-built template assembled from the user's free-text use case using the Encoding Template schema and a cross-field rulebook) end-to-end via the Bitmovin CLI's Encoding Templates commands.
---

# Bitmovin Live Encoding Skill

Walks the user through configuring and starting a Bitmovin live encoding. The
heavy lifting is done by the Bitmovin **Encoding Templates API**: a single
`POST /encoding/templates/start` creates inputs, codec configs, encoding,
streams, muxings, manifests **and** starts the live encoding from one YAML
document.

This skill renders that YAML from a small parameter file, validates and
submits it via the **Bitmovin CLI** (`bitmovin encoding ...`), polls until
the encoder is `RUNNING`, and asks the CLI for the ingest details.

## Prerequisites

- **Bitmovin CLI** (`@bitmovin/cli`, ≥ 0.3.0) — drives `templates validate`,
  `templates start`, `outputs list/create`, `jobs get`, `jobs status`,
  `jobs live`, `jobs stop`. `jobs live` (added in 0.3.0) returns
  `encoderIp` plus the per-template ingest details (`streamKeys[]` for
  RTMP / redundant RTMP, `srtInputs[]` with mode/host/port/path for SRT)
  and is the reason this skill no longer ships its own polling helper.
  Install with `npm install -g @bitmovin/cli`.
- **Python ≥ 3.10** — Step 1's `scripts/ensure_venv.sh` auto-creates a
  dedicated venv and installs `pyyaml` and `jinja2` into it if they aren't
  already importable from the user's `python3`. Used only by the inline
  Jinja render block in Step 5; every other workflow step is the CLI.
- `BITMOVIN_API_KEY` environment variable set.
- For creating a new output (optional): `BITMOVIN_OUTPUT_ACCESS_KEY` /
  `BITMOVIN_OUTPUT_SECRET_KEY` env vars (see Step 3). Credentials are read
  from the environment and passed to the CLI via shell expansion at
  invocation time — never hardcoded into scripts, the params file, or the
  rendered template.

The skill never embeds secrets in the rendered template or log output.

## Path Conventions

- `SKILL_DIR`: install location of this skill (e.g.
  `~/.claude/skills/bitmovin-encoding-live` or
  `~/.codex/skills/bitmovin-encoding-live`). Used to locate `scripts/` and
  `templates/`.
- `RUN_DIR`: per-run cache directory at
  `~/.cache/bitmovin/bitmovin-encoding-live/<run-id>/`, where `<run-id>` is
  `YYYYMMDD-HHMMSS-<short-hash>`. Holds the rendered template and a copy
  of the params file. RUN_DIR MUST stay outside the skill directory so its
  contents are never published or installed.

## Scripts

| Script | Purpose |
|---|---|
| `scripts/ensure_venv.sh` | Prints the path to a Python interpreter that has `pyyaml` and `jinja2` available. Uses the user's `python3` if it already has them; otherwise creates / reuses a venv at `~/.cache/bitmovin/bitmovin-encoding-live/.venv/` and installs the deps there. |
| `scripts/validate_rules.py <template.yaml>` | Runs cross-field rule checks (see `references/rulebook.yaml`) against a rendered Encoding Template. Catches semantic errors the JSON schema can't express — live-encoding-mode subset, fMP4-stream-count, AV1 min bitrate, the `inputs.rtmp` silent-drop, `$/...` streamKeyId refs that don't resolve. Exits non-zero on violations. Always run between `bitmovin encoding templates validate` and `bitmovin encoding templates start`. |

All other workflow steps — output listing / creation, template validation
/ submission, status polling, ingest details, stop — are driven directly
by the Bitmovin CLI from the inline shell snippets in this document.
SKILL.md is responsible for prompting the user.

## References

| File | Purpose |
|---|---|
| `references/rulebook.yaml` | Cross-field semantic rules for live encodings, derived from Bitmovin's server-side validators plus live-ingest specifics observed in practice. Each rule has an `id`, a `rule` description, and an `applies_when` predicate. Consulted during the custom-build flow (Step 2b) to prune options the API would reject; enforced post-render by `validate_rules.py`. |

## Templates

Jinja2 templates in `<SKILL_DIR>/templates/`:

| Template | Use case |
|---|---|
| `rtmp-live.yaml.j2` | Single RTMP ingest point. Uses `inputs.redundantRtmp` with one `staticIngestPoint` — Bitmovin's API has no separate non-redundant RTMP input type. |
| `redundant-rtmp-live.yaml.j2` | Two RTMP ingest points for HA ingest. |
| `srt-live.yaml.j2` | SRT ingest (CALLER or LISTENER mode). |

All templates produce CMAF-style output: fmp4 muxings serving both DASH and
HLS manifests with `manifestGenerator: V2`. Customers can hand-edit the
rendered YAML before `bitmovin encoding templates start` if they need
variants (additional renditions, different segment naming, additional
muxing types).

`<SKILL_DIR>/examples/params.example.yaml` documents every parameter.

## Workflow

### Step 1 — Verify prerequisites

Confirm the Bitmovin CLI is installed and resolve the Python interpreter
that has the runtime deps (used by the inline Jinja render in Step 5):

```bash
command -v bitmovin >/dev/null \
  || { echo "error: bitmovin CLI not found. Install with: npm install -g @bitmovin/cli" >&2; exit 1; }
PYTHON=$(bash <SKILL_DIR>/scripts/ensure_venv.sh) || exit 1
test -n "$BITMOVIN_API_KEY" || { echo "error: BITMOVIN_API_KEY is not set" >&2; exit 1; }
echo "OK ($PYTHON)"
```

`$PYTHON` is reused in Step 5. If `BITMOVIN_API_KEY` is empty, ask the user
to export it before continuing. The CLI reads the key from the same env
var, so no extra config is required.

If `python3` itself is missing, `ensure_venv.sh` prints a clear error and
exits non-zero — point the user at https://www.python.org/downloads/
(Python ≥ 3.10).

### Step 2 — Pick scenario

Ask the user which scenario fits. These are the only valid choices —
do **not** offer an `Other (specify)` fallback. The fourth option is the
explicit escape hatch:

1. `rtmp` — single RTMP ingest (most common)
2. `redundant-rtmp` — two RTMP ingest points for HA
3. `srt` — SRT ingest
4. `custom` — none of the above fits; describe the use case in free text
   and the skill assembles a template from the schema + rulebook (see
   Step 2b)

For options 1–3, map to the matching template under
`<SKILL_DIR>/templates/`. For option 4, jump to **Step 2b** before Step 3.

### Step 2b — Custom build (only when scenario = `custom`)

The user has described a use case the three prebaked scenarios don't fit
(e.g. HEVC ingest + AV1 distribution, Zixi or HLS pulled-input, a custom
ladder with non-standard segment naming, DRM-wrapped HLS). The skill
guides them through assembling a template from primitives, filtering
options at each decision using the cross-field rulebook so choices that
the API would reject never appear.

**Sources of truth, in order of authority:**

1. `<SKILL_DIR>/references/rulebook.yaml` — semantic compatibility rules
   derived from Bitmovin's server-side validators. Each rule has an
   `applies_when` predicate; if it matches the user's choices, apply the
   rule's constraint. Skip rules tagged `scope: vod-only` — they don't
   apply to live encodings.
2. `~/.config/bitmovin/template-schema-v1.json` — the published Encoding
   Template JSON Schema (24h-cached by `bitmovin encoding templates
   validate`). Use it to discover allowed values for enum fields (input
   types, codec types, manifest types, DRM types, ACL permissions,
   `liveEncodingMode`, …). If the cache is missing, run
   `bitmovin encoding templates validate` against any prebaked template
   first to warm it.
3. `<SKILL_DIR>/templates/*.yaml.j2` — worked examples of valid live
   template shapes. Read at least one before authoring (`rtmp-live` is
   the simplest reference).

**Workflow:**

1. **Capture the use case.** Take the user's free-text description.
   Re-state your understanding back in one sentence and confirm before
   continuing.

2. **Walk a decision tree.** Ask **one question at a time** with a
   selectable picker. After each answer, consult the rulebook: drop any
   downstream option whose `applies_when` would conflict with the
   answers so far. Order:

   a. **Input type** — choose from `inputs.*` enum values that make
      sense for live: `redundantRtmp` (single or HA RTMP via
      staticIngestPoints), `srt` (LISTENER / CALLER), `zixi`, `hls`
      (live-from-stream pull). Apply rule `live.rtmp_input_type` —
      never offer `inputs.rtmp`, that key is silently dropped.
   b. **Stream-key handling (RTMP variants only)** — `Use my own`
      (Step 4b pre-creates / reuses; ASSIGN with concrete UUID) or
      `Auto-generate` (API mints, GENERATE). Apply rule
      `live.stream_key_assignment` — `streamKeyId` must be a real
      UUID, never a `$/...` ref.
   c. **Video codec(s)** — h264 (broadest device support), h265
      (~50% bandwidth savings), av1 (~50% savings, newer; rule
      `codec.av1.min_bitrate` requires bitrate ≥ 10000 — live has no
      per-title carve-out, so always set bitrate). Multi-codec ladders
      allowed.
   d. **Encoding mode** — `STANDARD` (default), `SINGLE_PASS`, or
      `TWO_PASS`. Apply rule `encoding_mode.live_subset` — never
      offer `THREE_PASS`, the API rejects it for live even though the
      schema enum includes it.
   e. **Video ladder** — fixed list of `{height, bitrate}`. Per-Title
      is **VOD-only** (rule `hw.no_per_title` is for hardware; for
      live, per-title simply isn't a live.start primitive). Multi-stream
      live encodings hit rule `encoding_mode.all_video_streams_match`
      — pick one mode for all video streams.
   f. **Audio** — AAC (default), Dolby Atmos / DD+ (rule
      `dd.drm_encoder_features` gates with DRM; rule
      `dd.invalid_filters` blocks AUDIO_VOLUME / WATERMARK /
      ENHANCED_WATERMARK), pass-through, or none (video-only).
   g. **Muxing format** — fmp4 (CMAF-style; works with DASH and HLS;
      rule `muxing.fmp4.exactly_one_stream` means one muxing per
      stream), TS (HLS only). Live encodings rarely use progressive
      MP4 since there's nothing to download until the encoding stops.
   h. **Manifest format** — DASH only, HLS only, both, none. Pin
      `manifestGenerator: V2` (rule `live.manifest_generator_v2`).
      **V1 (LEGACY) is deprecated and will be discontinued soon** —
      do not offer V1 even though the API still accepts it (today the
      manifest-generator selection silently falls back to V1 when V2
      isn't supported by the encoder version). New live encodings must
      target V2.
   i. **DRM** (optional) — none (default), Widevine, PlayReady,
      FairPlay, multi-DRM via CencDrm. Rulebook gates:
      `drm.fmp4.fairplay_codec` requires HEVC for fmp4+FairPlay
      unless encoder version supports `FIXED_ENCRYPTION_METHOD_SELECTION`.
      `drm.hls.unsupported_drms` blocks MARLIN / PLAYREADY / PRIMETIME
      / CLEARKEY for live HLS — only Widevine, FairPlay, or AES-128
      / SAMPLE-AES are usable.
   j. **Auto-shutdown / encoder version** — same as the prebaked
      scenarios (Step 4 questions 11, 10).
   k. **Out-of-scope features** — Dolby Vision / HDR10, sprites,
      thumbnails, SCTE-35 / ESAM, ad insertion, multi-period DASH,
      captions/subtitles, hardware acceleration (VOD-only — see the
      VOD skill if needed), standby pools. If the user needs any of
      these, point them at https://developer.bitmovin.com/encoding/docs
      and stop the custom build.

3. **Author the YAML.** Once the decision tree is complete, write
   `$RUN_DIR/template.yaml` directly. Use the prebaked templates as
   structural examples. Required top-level keys for live: `metadata`
   (with `type: LIVE`), `inputs`, `configurations`, `encodings`,
   `manifests` (when manifests are emitted), `live` (only if
   `streamKeyMode: Use my own` and stream keys need pre-creation —
   see Step 4b).

   Live encoding's nested `live.start.properties` block needs:
   - `streamKey` (legacy field, schema-required)
   - `manifestGenerator: V2`
   - `autoShutdownConfiguration` (`streamTimeoutMinutes`,
     `bytesReadTimeoutSeconds`)
   - `dashManifests` / `hlsManifests` lists referencing
     `$/manifests/<kind>/<id>` resources

   Reference inputs/outputs by id (Step 3 + Step 4b for stream keys).
   Show the assembled YAML to the user and confirm before continuing.

4. **Rejoin Step 4b → Step 6.** If the custom design uses RTMP +
   user-supplied stream keys, run **Step 4b** to pre-create / reuse
   them and substitute the concrete UUIDs into the authored template
   (in-place edit; do not use `$/live/streamKeys/<id>` refs — rule
   `live.stream_key_assignment`). Then skip Step 5 (gather params) — the
   YAML is already authored — and run Step 6's
   `bitmovin encoding templates validate` plus `validate_rules.py` to
   catch any rule the decision tree missed.

If, during the decision tree, the user picks a combination that the
rulebook says is impossible (e.g. `inputs.rtmp` typo, or `THREE_PASS`
for live), stop, explain which rule blocks it (cite `rule.id`), and
ask the user to revisit the prior decision.

### Step 3 — Output (reuse or create)

Ask whether to **reuse** an existing output or **create** a new one.

**Reuse**: optionally run `bitmovin encoding outputs list --type s3` (or
`gcs`, `azure`) to surface candidates. Capture the `id` from the user. If
you list outputs first, stop there and ask the user to choose one before
moving on. Do not start Step 4 until `outputId` is captured.

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

(Use `bitmovin encoding outputs create gcs ...` for GCS — same flag shape,
no `--region`.) Capture the printed `output_id` immediately and do not start
Step 4 until it has been written into the working `params.yaml`.

Never accept access keys / secret keys / service-account JSON contents as
literal CLI args or in the params file. If env vars are missing, stop and
ask the user to export them.

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
4. **streamKeyMode** — RTMP scenarios only (`rtmp`, `redundant-rtmp`);
   skip for `srt`. Decides how the ingest stream key is set.
   - `Use my own` *(default — the skill pre-creates or reuses a stream key with the value you pick; ingest URL embeds that value, predictable across re-runs)*
   - `Auto-generate` *(API mints a random stream key; you read the value from `bitmovin encoding jobs live` once the encoder is RUNNING. Simpler, no Step 4b, no residue)*
5. **streamKey** — only when `streamKeyMode == Use my own`. Skip
   otherwise. **Must be globally unique within the Bitmovin
   organization** (3–20 chars, `[a-zA-Z0-9]`); if the value already
   exists Step 4b reuses the existing stream-key id rather than
   creating a duplicate. For `redundant-rtmp` the workflow auto-derives
   the backup key as `<streamKey>-backup`. Free text.
   - `live-<encodingName>` *(default — encodingName-derived; usually unique enough on first run)*
   - `bitmovin` *(short / memorable; likely already taken in established orgs)*
   - `Other (specify)`
6. **outputAcl** — always ask, surface security implications. An ACL
   must always be set; do **not** offer an `Other (specify)` fallback
   for this question.
   - `PUBLIC_READ` *(default — anyone with the URL can play)*
   - `PRIVATE` *(signed URLs only)*
7. **manifests**
   - `[dash, hls]` *(default)*
   - `[hls]`
   - `[dash]`
8. **videoLadder**
   - `240p + 480p + 720p (default)` → `[{240,800k}, {480,1.6M}, {720,3M}]`
   - `360p + 720p + 1080p` → `[{360,1.2M}, {720,3M}, {1080,5M}]`
   - `720p only` → `[{720,3M}]`
   - `Other (specify)` — free-text JSON / YAML list of `{height,bitrate}`
9. **audioBitrate** (bps)
   - `128000` *(default)*
   - `96000`
   - `192000`
   - `256000`
10. **segmentLength** (seconds)
    - `4.0` *(default)*
    - `2.0`
    - `6.0`
    - `Other (specify)`
11. **encoderVersion** — these are the only valid choices; do **not**
    offer an `Other (specify)` fallback for this question.
    - `STABLE` *(default)*
    - `BETA`
12. **autoShutdownStreamTimeoutMin**
    - `30` *(default)*
    - `5`
    - `15`
    - `60`
    - `Other (specify)`
13. **autoShutdownBytesReadTimeoutSec**
    - `30` *(default)*
    - `60`
    - `120`
    - `Other (specify)`

SRT-only questions (`srt-live.yaml.j2`):

14. **srtMode** — always ask.
    - `LISTENER` *(default — encoder listens; you push to it)*
    - `CALLER` *(encoder dials out to your host:port)*
15. **srtHost** — only when `srtMode == CALLER`. Free text.
16. **srtPort**
    - `2088` *(default; required to be 2088 / 2089 / 2090 / 2091 in LISTENER mode)*
    - `2089`
    - `2090`
    - `2091`
    - `Other (specify)` *(LISTENER mode rejects ports outside that set)*
17. **srtPath** — free text.
    - `live` *(default)*
    - `Other (specify)`
18. **srtLatencyMs**
    - `2000` *(default)*
    - `500`
    - `1000`
    - `4000`
    - `Other (specify)`
19. **srtPassphrase** — optional AES passphrase for the SRT input. Free
    text. Must be exactly 16 characters (AES-128) or 32 characters
    (AES-256); the template infers `keyLength` from the length. Skip the
    question when the user picks `None`.
    - `None` *(default — unencrypted SRT)*
    - `Other (specify)` — paste a 16- or 32-character passphrase

`manifestGenerator` is hardcoded to `V2` in all templates and is no longer a
configurable parameter.

After the last question, echo the resolved `params.yaml` back to the user
in full and confirm before proceeding to Step 4b (RTMP scenarios) or
Step 5 (SRT).

### Step 4b — Pre-create or reuse stream key(s) (RTMP, user-supplied mode only)

Skip this step entirely for the `srt` scenario, **and** for RTMP runs
where the user picked `streamKeyMode: Auto-generate` in Step 4 — in that
case the templates fall back to `streamKeyConfiguration: { type:
GENERATE }` and the API mints the keys for you. Step 7 surfaces the
generated value(s) via `bitmovin encoding jobs live`.

The Templates API accepts `streamKeyConfiguration: { type: ASSIGN,
streamKeyId: <uuid> }` on a `staticIngestPoint`, but only against a
**concrete, already-existing** stream-key UUID. Forward references to a
top-level `live.streamKeys.<local-id>` block declared in the same
template do **not** resolve — the API errors with
`Could not find reference resource: streamKeyId`. The Bitmovin CLI
doesn't (yet) expose stream-key management commands either, so the
skill calls `POST /encoding/live/stream-keys` directly via curl.

Stream-key `value`s are globally unique within a Bitmovin organization,
so re-running the skill with the same `streamKey` value would normally
fail with `code: 3002, "Stream key is not unique"`. We avoid that by
**creating-or-reusing**: try POST first, on 3002 fall back to a
paginated GET that finds the existing key by value and returns its id.
If the existing key is currently `ASSIGNED` to another encoding, the
Templates API will reject the assignment at submit time with a clear
error — the user can pick a different value and retry.

Define a small helper once, then call it from both scenarios:

```bash
ensure_stream_key_id() {
  local value="$1" name="$2"
  local resp id code

  resp=$(curl -sS -X POST https://api.bitmovin.com/v1/encoding/live/stream-keys \
    -H "X-Api-Key: $BITMOVIN_API_KEY" -H 'Content-Type: application/json' \
    -d "{\"name\":\"$name\",\"value\":\"$value\"}")
  id=$(printf '%s' "$resp" | jq -r '.data.result.id // empty')
  if [ -n "$id" ]; then printf '%s' "$id"; return 0; fi

  code=$(printf '%s' "$resp" | jq -r '.data.code // empty')
  [ "$code" = "3002" ] || { echo "stream-key create failed: $resp" >&2; return 1; }

  # 3002 = uniqueness violation -> the value already exists. Page through
  # the org's stream keys and return the existing id. limit=100 is the
  # API max per page.
  local offset=0 limit=100 page count
  while :; do
    page=$(curl -fsS -H "X-Api-Key: $BITMOVIN_API_KEY" \
      "https://api.bitmovin.com/v1/encoding/live/stream-keys?limit=$limit&offset=$offset")
    id=$(printf '%s' "$page" | jq -r --arg v "$value" \
      '.data.result.items[]? | select(.value == $v) | .id' | head -1)
    [ -n "$id" ] && { printf '%s' "$id"; return 0; }
    count=$(printf '%s' "$page" | jq '.data.result.items | length')
    [ "$count" -lt "$limit" ] && { echo "stream-key '$value' not found via lookup" >&2; return 1; }
    offset=$((offset + limit))
  done
}
```

For `rtmp`:

```bash
mainStreamKeyId=$(ensure_stream_key_id "$streamKey" "$encodingName main stream key") \
  || exit 1
```

For `redundant-rtmp` (primary uses the user's value, backup auto-derives
as `<value>-backup`):

```bash
primaryStreamKeyId=$(ensure_stream_key_id "$streamKey" "$encodingName primary stream key") \
  || exit 1
backupStreamKeyId=$(ensure_stream_key_id "${streamKey}-backup" "$encodingName backup stream key") \
  || exit 1
```

Add the captured `mainStreamKeyId` (rtmp) or `primaryStreamKeyId` /
`backupStreamKeyId` (redundant-rtmp) to the running `params.yaml`
before Step 5 — the Jinja templates reference these keys directly.

Stream-key resources persist after the encoding finishes (returning to
`status: UNASSIGNED`); the next run with the same value reuses them via
the lookup path above. If the user wants to delete them outright, use
`DELETE /encoding/live/stream-keys/<id>`.

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

### Step 6 — Validate + start

Validate the rendered YAML in two passes — schema (the CLI) and
cross-field semantic rules (`validate_rules.py`) — then submit it. The
CLI fetches the schema once and caches it for 24h at
`~/.config/bitmovin/template-schema-v1.json`.

```bash
# 1. Schema check — structural validity, required fields, enum values.
bitmovin encoding templates validate "$RUN_DIR/template.yaml"

# 2. Cross-field rule check — semantic constraints the schema can't
#    express (live-encoding-mode subset, fMP4 stream count, AV1 min
#    bitrate, the `inputs.rtmp` silent-drop, `$/...` streamKeyId refs).
#    Skip only as a last resort if a rule fires that the user is sure
#    is a false positive (the API may still reject server-side).
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

Do **not** pass `--watch` — the CLI's watch mode waits for the encoding to
reach `FINISHED/ERROR/CANCELED/TRANSFER_ERROR`, which a live encoding never
does until it is stopped. Step 7 polls for `RUNNING` (the success state for
live).

If `templates validate` reports schema errors, or `validate_rules.py`
prints any violations, abort and surface them to the user. For prebaked
scenarios the structure usually points at a missing param; for `custom`,
the rule_id in the violation output points directly at
`references/rulebook.yaml` for the explanation.

### Step 7 — Wait for `RUNNING`, then surface ingest details

Three short polling loops. All three call the Bitmovin CLI; no Python
helper is involved.

**7a — defensive partial-parse check (≈15s).** The Templates API
occasionally returns 200 + encoding-id but silently drops sections it
didn't recognize (e.g. `inputs.rtmp` instead of `inputs.redundantRtmp`).
Confirm the encoding's `type` settled to `LIVE` before doing anything else
— this is what catches that bug:

```bash
DEADLINE=$(( $(date +%s) + 15 ))
ACTUAL_TYPE=""
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  ACTUAL_TYPE=$(bitmovin encoding jobs get "$ENCODING_ID" --jq .type 2>/dev/null | tr -d '"')
  [ "$ACTUAL_TYPE" = "LIVE" ] && break
  sleep 2
done
if [ "$ACTUAL_TYPE" != "LIVE" ]; then
  echo "error: Templates API silently dropped most of the template" >&2
  echo "  encoding $ENCODING_ID has type='$ACTUAL_TYPE' (expected 'LIVE') after 15s" >&2
  echo "  inspect the rendered template at $RUN_DIR/template.yaml for unknown keys" >&2
  echo "  (e.g. 'inputs.rtmp' instead of 'inputs.redundantRtmp')" >&2
  exit 1
fi
```

**7b — wait for `RUNNING` (10 min).** Live encoders take 30–120s to come
up, sometimes longer. Bail out on the terminal-bad statuses, otherwise
keep polling. Transient CLI errors (network blips, 5xx) are ignored:

```bash
DEADLINE=$(( $(date +%s) + 600 ))
STATUS=""
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  STATUS=$(bitmovin encoding jobs status "$ENCODING_ID" --jq .status 2>/dev/null | tr -d '"')
  case "$STATUS" in
    RUNNING) break ;;
    ERROR|CANCELED|FINISHED) echo "error: encoding $ENCODING_ID reached terminal status $STATUS" >&2; exit 1 ;;
  esac
  sleep 10
done
[ "$STATUS" = "RUNNING" ] || { echo "error: timed out after 10 min waiting for RUNNING" >&2; exit 1; }
```

**7c — wait for ingest details, then print.** Right after RUNNING the
encoder may still be allocating an IP. `bitmovin encoding jobs live`
returns `available: false` during that window:

```bash
DEADLINE=$(( $(date +%s) + 300 ))
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  AVAILABLE=$(bitmovin encoding jobs live "$ENCODING_ID" --jq '.available // true' 2>/dev/null)
  [ "$AVAILABLE" = "true" ] && break
  sleep 10
done

bitmovin encoding jobs live "$ENCODING_ID"
echo
echo "Dashboard:    https://dashboard.bitmovin.com/live/encodings/$ENCODING_ID"
echo "Output base:  <outputBasePath from params> (manifests are listed in the dashboard)"
```

The `bitmovin encoding jobs live` output covers all three template
shapes:

- **`rtmp`** and **`redundant-rtmp`** — `streamKeys[]` lists each static
  ingest point's stream key (one entry for `rtmp`, two for
  `redundant-rtmp`). Combine with `encoderIp` / `application` to construct
  `rtmp://<encoderIp>/<application>/<streamKey>`.
- **`srt`** — `srtInputs[]` carries `mode`, `host`, `port`, `path`. For
  `LISTENER` mode the user pushes to `srt://<encoderIp>:<port>` (with
  `?streamid=<path>` if `path` is set); for `CALLER` mode the encoder
  dials the host/port the user runs their own listener on.

Translate the JSON to a usable ingest URL when reporting back to the user.

### Stop when the user is done

Remind the user that an encoding is now running.
Offer to stop the encoding for the user.

```bash
bitmovin encoding jobs stop "$ENCODING_ID"
```

The encoding shell remains in the account (not deleted). The user can
inspect logs and statistics afterwards via the dashboard.

For an ad-hoc status check at any point, use the CLI directly:

```bash
bitmovin encoding jobs status "$ENCODING_ID"
```

## Safety Rules

- Never log `BITMOVIN_API_KEY`, `BITMOVIN_OUTPUT_ACCESS_KEY`,
  `BITMOVIN_OUTPUT_SECRET_KEY`, or any value resembling a secret.
- Never accept credentials as literal CLI args or in `params.yaml`. The
  Bitmovin CLI's `outputs create` requires `--access-key` / `--secret-key`
  flags — pass these only via shell env-var expansion (`--access-key
  "$BITMOVIN_OUTPUT_ACCESS_KEY"`) so the literal value never appears in
  scripts, history, or rendered templates.
- Never write secrets into the rendered template.
- If a user pastes a secret into the prompt, refuse to use it; tell them to
  export it as an env var instead.
