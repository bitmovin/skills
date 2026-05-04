# bitmovin-encoding-vod

A portable agent skill that walks you through creating and starting a
Bitmovin VOD encoding (H.264 per-title, H.264 fixed ladder, AV1 per-title
for UGC, or H.264 hardware-accelerated sports clips) end-to-end.
Self-contained, depends only on the public Bitmovin Python SDK and a
YAML/Jinja toolchain.

The skill leans on the Bitmovin **Encoding Templates API**: a single
`POST /encoding/templates/start` creates inputs, codec configs, the encoding,
streams, muxings, manifests, **and** starts the encoding from one YAML
document. You parameterize that YAML with a small `params.yaml`.

## What you get

- 4 ready-to-render templates: H.264 per-title, H.264 fixed ladder,
  AV1 per-title (UGC), H.264 sports clips (hardware-accelerated)
- 8 helper scripts: ensure venv, list/create inputs and outputs, submit
  template, wait for finished, status
- A working flow that ends with the manifest URLs printed and the
  encoding in `FINISHED`

## Requirements

- Python ≥ 3.10 (the skill creates a dedicated venv on first run if you don't
  want to install the deps into your system / user Python — see Setup)
- A Bitmovin API key with permission to create encodings, inputs, and
  outputs
- A bucket (S3, GCS, …) you can write to
- An input source — either a public HTTP/HTTPS URL host (no creds), or a
  pre-existing input in your Bitmovin account that you reference by id

## Setup

```bash
export BITMOVIN_API_KEY=<your-key>
```

Then either:

- **Auto-venv (recommended)** — let `scripts/ensure_venv.sh` create
  `~/.cache/bitmovin/bitmovin-encoding-vod/.venv/` and install
  `bitmovin-api-sdk`, `pyyaml`, `jinja2`, `jsonschema` into it on first use.
  Every snippet below resolves the right Python via that helper.
- **Manual** — install the deps into whatever Python environment you prefer:
  `pip install bitmovin-api-sdk pyyaml jinja2 jsonschema`. Replace `$PYTHON`
  with `python3` in the snippets below.

Optional, only when creating a fresh output:

```bash
export BITMOVIN_OUTPUT_ACCESS_KEY=<access-id>
export BITMOVIN_OUTPUT_SECRET_KEY=<secret>
```

## Quick start (per-title H.264)

```bash
SKILL_DIR=~/.claude/skills/bitmovin-encoding-vod   # or ~/.codex/skills/...
WORK=~/vod-test && mkdir -p "$WORK"

# 0. Resolve the Python interpreter (auto-installs deps into a venv if needed)
PYTHON=$(bash "$SKILL_DIR/scripts/ensure_venv.sh") || exit 1

# 1. Pick or create an input
"$PYTHON" "$SKILL_DIR/scripts/list_inputs.py" --type https
# or:
"$PYTHON" "$SKILL_DIR/scripts/create_input.py" \
  --type https --host bitmovin-sample-content.s3.eu-west-1.amazonaws.com

# 2. Pick or create an output
"$PYTHON" "$SKILL_DIR/scripts/list_outputs.py" --type s3
# or:
"$PYTHON" "$SKILL_DIR/scripts/create_output.py" \
  --type s3 --name "my-vod-output" --bucket "my-bucket"

# 3. Copy and edit the params file
cp "$SKILL_DIR/examples/params.example.yaml" "$WORK/params.yaml"
# Set encodingName, inputId, inputPath, outputId, outputBasePath

# 4. Render the template
"$PYTHON" -c "
import jinja2, pathlib, yaml
params = yaml.safe_load(pathlib.Path('$WORK/params.yaml').read_text())
env = jinja2.Environment(
    loader=jinja2.FileSystemLoader('$SKILL_DIR/templates'),
    undefined=jinja2.StrictUndefined,
    trim_blocks=True, lstrip_blocks=True,
)
out = env.get_template('per-title-h264.yaml.j2').render(**params)
pathlib.Path('$WORK/template.yaml').write_text(out)
"

# 5. Submit + start
ENCODING_ID=$("$PYTHON" "$SKILL_DIR/scripts/start_from_template.py" "$WORK/template.yaml" --run-dir "$WORK")
echo "encoding id: $ENCODING_ID"

# 6. Wait for the encode to finish (per-title can take a while on long inputs)
"$PYTHON" "$SKILL_DIR/scripts/wait_for_finished.py" "$ENCODING_ID" --state-file "$WORK/state.json"
```

When invoked from inside Claude Code or Codex CLI, the skill will prompt for
the missing values (input/output ids, ladder, encoder version, etc.) and
run the steps above for you.

## Templates

| File | When to use |
|---|---|
| `templates/per-title-h264.yaml.j2` | Default. Let the Per-Title algorithm pick an optimal ladder. THREE_PASS encoding. |
| `templates/fixed-ladder-h264.yaml.j2` | You already know the renditions. SINGLE_PASS by default. |
| `templates/av1-per-title-ugc.yaml.j2` | AV1 per-title for viral / UGC pipelines. Progressive MP4 per rendition (no manifest). Video-only. THREE_PASS. |
| `templates/sports-clips-h264.yaml.j2` | H.264 sports clips. NVIDIA-GPU `VOD_HARDWARE_SHORTFORM` preset, 9-rendition ladder, HLS-only. Video-only. Pinned to `cloudRegion: AWS_EU_WEST_1`. |

The per-title and fixed-ladder H.264 templates produce CMAF-style fmp4 with
default DASH+HLS manifests. The AV1 UGC template produces progressive MP4
files without a manifest. The sports-clips template produces fmp4 with
HLS-only manifests using a hardware-accelerated preset. The rendered YAML
is plain text — feel free to hand-edit before submitting.

### Out of scope

DRM, HDR / Dolby Vision, SCTE-35 / ESAM, ad insertion, multi-period DASH, captions/subtitles, filters, VP9, concatenation, custom infrastructure (BYOC), and standby pools. The skill points users at https://developer.bitmovin.com/encoding/docs for those.

## Security notes

- Credentials (API key, output access/secret keys) are read from environment
  variables only. They are never accepted as CLI args, written into
  `params.yaml`, the rendered template, or `state.json`, and never logged.
- Inputs that need credentials (S3, GCS, Azure, …) MUST be reused via an
  existing input id — `create_input.py` only creates HTTP/HTTPS inputs.
- The state file under `~/.cache/bitmovin/bitmovin-encoding-vod/<run-id>/`
  contains only resource ids, names, and paths.
