# bitmovin-encoding-live

A portable agent skill that walks you through creating and starting a
Bitmovin live encoding (RTMP, redundant RTMP, or SRT) end-to-end.
Self-contained, depends only on the public Bitmovin Python SDK and a
YAML/Jinja toolchain.

The skill leans on the Bitmovin **Encoding Templates API**: a single
`POST /encoding/templates/start` creates inputs, codec configs, the encoding,
streams, muxings, manifests, **and** starts the live encoding from one YAML
document. You parameterize that YAML with a small `params.yaml`.

## What you get

- 3 ready-to-render templates: single RTMP, redundant RTMP, SRT
- 6 helper scripts: list/create outputs, submit template, wait for ingest
  details, status, stop
- A working flow that ends with the ingest URL printed and the encoding in
  `RUNNING`

## Requirements

- Python ≥ 3.10 (the skill creates a dedicated venv on first run if you don't
  want to install the deps into your system / user Python — see Setup)
- A Bitmovin API key with permission to create encodings and outputs
- A bucket (S3, GCS, …) you can write to

## Setup

```bash
export BITMOVIN_API_KEY=<your-key>
```

Then either:

- **Auto-venv (recommended)** — let `scripts/ensure_venv.sh` create
  `~/.cache/bitmovin/bitmovin-encoding-live/.venv/` and install
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

## Quick start (RTMP)

```bash
SKILL_DIR=~/.claude/skills/bitmovin-encoding-live   # or ~/.codex/skills/...
WORK=~/live-test && mkdir -p "$WORK"

# 0. Resolve the Python interpreter (auto-installs deps into a venv if needed)
PYTHON=$(bash "$SKILL_DIR/scripts/ensure_venv.sh") || exit 1

# 1. Pick or create an output
"$PYTHON" "$SKILL_DIR/scripts/list_outputs.py" --type s3
# or:
"$PYTHON" "$SKILL_DIR/scripts/create_output.py" \
  --type s3 --name "my-live-output" --bucket "my-bucket"

# 2. Copy and edit the params file
cp "$SKILL_DIR/examples/params.example.yaml" "$WORK/params.yaml"
# Set encodingName, cloudRegion, outputId, outputBasePath, streamKey

# 3. Render the template
"$PYTHON" -c "
import jinja2, pathlib, yaml
params = yaml.safe_load(pathlib.Path('$WORK/params.yaml').read_text())
env = jinja2.Environment(
    loader=jinja2.FileSystemLoader('$SKILL_DIR/templates'),
    undefined=jinja2.StrictUndefined,
    trim_blocks=True, lstrip_blocks=True,
)
out = env.get_template('rtmp-live.yaml.j2').render(**params)
pathlib.Path('$WORK/template.yaml').write_text(out)
"

# 4. Submit + start
ENCODING_ID=$("$PYTHON" "$SKILL_DIR/scripts/start_from_template.py" "$WORK/template.yaml" --run-dir "$WORK")
echo "encoding id: $ENCODING_ID"

# 5. Wait for the encoder to come up (30–120s)
"$PYTHON" "$SKILL_DIR/scripts/wait_for_running.py" "$ENCODING_ID" --state-file "$WORK/state.json"

# ... push your stream to the printed RTMP/SRT ingest URL ...

# 6. Stop when done
"$PYTHON" "$SKILL_DIR/scripts/stop_live.py" "$ENCODING_ID"
```

When invoked from inside Claude Code or Codex CLI, the skill will prompt for
the missing values (cloud region, output id, etc.) and run the steps above
for you.

## Templates

| File | When to use |
|---|---|
| `templates/rtmp-live.yaml.j2` | Single RTMP ingest. Default choice. |
| `templates/redundant-rtmp-live.yaml.j2` | Two RTMP ingest points for HA. |
| `templates/srt-live.yaml.j2` | SRT ingest in `CALLER` or `LISTENER` mode. |

All three produce CMAF-style output (fmp4 muxings serving DASH and HLS) with
`manifestGenerator: V2`. The rendered YAML is plain text — feel free to
hand-edit before submitting.

## Out of scope

DRM, SCTE-35/ESAM, ad insertion, live content insertion, multi-period DASH,
captions/subtitles, custom infrastructure (BYOC), and standby pools are out
of scope for this skill. See https://developer.bitmovin.com/encoding/docs
for those topics.

## Security notes

- Credentials (API key, output access/secret keys) are read from environment
  variables only. They are never accepted as CLI args, written into
  `params.yaml`, the rendered template, or `state.json`, and never logged.
- The state file under `~/.cache/bitmovin/bitmovin-encoding-live/<run-id>/`
  contains only resource ids, names, paths, and the configured stream key.
