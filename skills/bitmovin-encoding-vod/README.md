# bitmovin-encoding-vod

A portable agent skill that walks you through creating and starting a
Bitmovin VOD encoding (H.264 per-title, H.264 fixed ladder, AV1
per-title for UGC, H.264 hardware-accelerated sports clips, or a
**custom-built template** for use cases the prebaked scenarios don't
cover) end-to-end. Self-contained.

The skill leans on the Bitmovin **Encoding Templates API** via the
**Bitmovin CLI** (`@bitmovin/cli`): a single
`bitmovin encoding templates start` creates inputs, codec configs, the
encoding, streams, muxings, manifests, **and** starts the encoding from
one YAML document. You parameterize that YAML with a small `params.yaml`.

## What you get

- 4 ready-to-render templates: H.264 per-title, H.264 fixed ladder,
  AV1 per-title (UGC), H.264 sports clips (hardware-accelerated)
- 1 custom-build flow that assembles a template from primitives, guided
  by the published JSON schema and a cross-field rulebook
  (`references/rulebook.yaml`) derived from Bitmovin's server-side
  validators
- A working flow that ends with the encoding in `FINISHED` and a
  dashboard link
- Two helper scripts: `scripts/ensure_venv.sh` (resolves a Python with
  `pyyaml` + `jinja2` for the inline render step) and
  `scripts/validate_rules.py` (post-render semantic checks before
  submit). Everything else is the CLI.

## Requirements

- **Bitmovin CLI** ≥ 0.2.0 — `npm install -g @bitmovin/cli`. Drives
  every workflow step except the inline Jinja render and rule checks.
- **Python ≥ 3.10** (the skill creates a dedicated venv on first run if
  you don't want to install the deps into your system / user Python —
  see Setup)
- A Bitmovin API key with permission to create encodings, inputs, and
  outputs
- A bucket (S3, GCS, …) you can write to
- An input source — either a public HTTP/HTTPS URL host (no creds), or
  a pre-existing input in your Bitmovin account that you reference by id

## Setup

```bash
npm install -g @bitmovin/cli
export BITMOVIN_API_KEY=<your-key>
```

Then either:

- **Auto-venv (recommended)** — let `scripts/ensure_venv.sh` create
  `~/.cache/bitmovin/bitmovin-encoding-vod/.venv/` and install
  `pyyaml`, `jinja2` into it on first use. The inline Jinja render block
  resolves the right Python via that helper.
- **Manual** — install the deps into whatever Python environment you
  prefer: `pip install pyyaml jinja2`. Replace `$PYTHON` with `python3`
  in the snippets below.

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
bitmovin encoding inputs list --type https
# or:
bitmovin encoding inputs create https \
  --name "sample-content" \
  --host bitmovin-sample-content.s3.eu-west-1.amazonaws.com

# 2. Pick or create an output
bitmovin encoding outputs list --type s3
# or:
bitmovin encoding outputs create s3 \
  --name "my-vod-output" --bucket "my-bucket" --region "eu-west-1" \
  --access-key "$BITMOVIN_OUTPUT_ACCESS_KEY" \
  --secret-key "$BITMOVIN_OUTPUT_SECRET_KEY"

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

# 5. Validate + submit
bitmovin encoding templates validate "$WORK/template.yaml"
"$PYTHON" "$SKILL_DIR/scripts/validate_rules.py" "$WORK/template.yaml"
ENCODING_ID=$(bitmovin encoding templates start "$WORK/template.yaml" \
              | awk '/^Encoding started:/ {print $3}')
echo "encoding id: $ENCODING_ID"

# 6. Wait for FINISHED (per-title can take a while on long inputs)
until [ "$(bitmovin encoding jobs status "$ENCODING_ID" --jq .status 2>/dev/null | tr -d '"')" = "FINISHED" ]; do
  sleep 15
done
echo "Dashboard: https://dashboard.bitmovin.com/encoding/encodings/$ENCODING_ID"
```

(The interactive flow inside Claude Code or Codex CLI also adds a 15s
silent-partial-parse check between steps 5 and 6 and bails out on
ERROR / CANCELED — see `SKILL.md` for the full sequence.)

## Templates

| File | When to use |
|---|---|
| `templates/per-title-h264.yaml.j2` | Default. Let the Per-Title algorithm pick an optimal ladder. THREE_PASS encoding. |
| `templates/fixed-ladder-h264.yaml.j2` | You already know the renditions. SINGLE_PASS by default. |
| `templates/av1-per-title-ugc.yaml.j2` | AV1 per-title for viral / UGC pipelines. Progressive MP4 per rendition (no manifest). Video-only. THREE_PASS. |
| `templates/sports-clips-h264.yaml.j2` | H.264 sports clips. NVIDIA-GPU `VOD_HARDWARE_SHORTFORM` preset, 9-rendition ladder, HLS-only. Video-only. Pinned to `cloudRegion: AWS_EU_WEST_1`. |

The per-title and fixed-ladder H.264 templates produce CMAF-style fmp4
with default DASH+HLS manifests. The AV1 UGC template produces
progressive MP4 files without a manifest. The sports-clips template
produces fmp4 with HLS-only manifests using a hardware-accelerated
preset. The rendered YAML is plain text — feel free to hand-edit before
submitting.

## Security notes

- Credentials (Bitmovin API key, output access/secret keys) are read
  from environment variables only. The Bitmovin CLI's `outputs create`
  requires `--access-key` / `--secret-key` flags — pass these via shell
  env-var expansion so the literal value never appears in scripts,
  history, the params file, or the rendered template.
- The rendered template under
  `~/.cache/bitmovin/bitmovin-encoding-vod/<run-id>/` contains only
  resource ids, names, and paths.
- Inputs that need credentials (S3, GCS, Azure, …) MUST be reused via
  an existing input id — `bitmovin encoding inputs create` only handles
  HTTP/HTTPS inputs in this skill's quick-start path.
