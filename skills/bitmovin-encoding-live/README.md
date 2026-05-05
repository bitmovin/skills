# bitmovin-encoding-live

A portable agent skill that walks you through creating and starting a
Bitmovin live encoding (RTMP, redundant RTMP, SRT, or a custom-built
template assembled from your free-text use case) end-to-end.
Self-contained.

The skill leans on the Bitmovin **Encoding Templates API** via the
**Bitmovin CLI** (`@bitmovin/cli`): a single
`bitmovin encoding templates start` creates inputs, codec configs, the
encoding, streams, muxings, manifests, **and** starts the live encoding
from one YAML document. You parameterize that YAML with a small
`params.yaml`.

## What you get

- 3 ready-to-render templates: single RTMP, redundant RTMP, SRT
- 1 custom-build flow that assembles a template from primitives, guided
  by the published JSON schema and a cross-field rulebook
- A working flow that ends with the ingest URL printed and the encoding in
  `RUNNING`
- Two helper scripts: `scripts/ensure_venv.sh` (resolves a Python with
  `pyyaml` + `jinja2` for the inline render step) and
  `scripts/validate_rules.py` (post-render semantic checks before submit).
  Everything else is the CLI.

## Requirements

- **Bitmovin CLI** ≥ 0.3.0 — `npm install -g @bitmovin/cli`. 0.3.0 ships
  the `encoding jobs live` command this skill relies on for ingest
  details. (Earlier versions don't expose static-ingest-point keys or
  SRT input details.)
- **Python ≥ 3.10** (the skill creates a dedicated venv on first run if you
  don't want to install the deps into your system / user Python — see Setup)
- A Bitmovin API key with permission to create encodings and outputs
- A bucket (S3, GCS, …) you can write to

## Setup

```bash
npm install -g @bitmovin/cli
export BITMOVIN_API_KEY=<your-key>
```

Then either:

- **Auto-venv (recommended)** — let `scripts/ensure_venv.sh` create
  `~/.cache/bitmovin/bitmovin-encoding-live/.venv/` and install
  `pyyaml`, `jinja2` into it on first use. The inline Jinja render block
  resolves the right Python via that helper.
- **Manual** — install the deps into whatever Python environment you prefer:
  `pip install pyyaml jinja2`. Replace `$PYTHON` with `python3` in the
  snippets below.

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
bitmovin encoding outputs list --type s3
# or:
bitmovin encoding outputs create s3 \
  --name my-live-output --bucket my-bucket --region eu-west-1 \
  --access-key "$BITMOVIN_OUTPUT_ACCESS_KEY" \
  --secret-key "$BITMOVIN_OUTPUT_SECRET_KEY"

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

# 4. Validate + submit
bitmovin encoding templates validate "$WORK/template.yaml"
ENCODING_ID=$(bitmovin encoding templates start "$WORK/template.yaml" \
              | awk '/^Encoding started:/ {print $3}')
echo "encoding id: $ENCODING_ID"

# 5. Wait for the encoder to come up (30–120s), then surface ingest details
until [ "$(bitmovin encoding jobs status "$ENCODING_ID" --jq .status 2>/dev/null | tr -d '"')" = "RUNNING" ]; do
  sleep 10
done
bitmovin encoding jobs live "$ENCODING_ID"

# ... push your stream to the printed RTMP/SRT ingest URL ...

# 6. Stop when done
bitmovin encoding jobs stop "$ENCODING_ID"
```

(The interactive flow inside Claude Code or Codex CLI also adds a 15s
silent-partial-parse check between steps 4 and 5 and an `available: true`
gate before printing — see `SKILL.md` for the full sequence.)

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

- Credentials (Bitmovin API key, output access/secret keys) are read from
  environment variables only. The Bitmovin CLI's `outputs create` requires
  `--access-key` / `--secret-key` flags — pass these via shell env-var
  expansion so the literal value never appears in scripts, history, the
  params file, or the rendered template.
- The rendered template under `~/.cache/bitmovin/bitmovin-encoding-live/<run-id>/`
  contains only resource ids, names, paths, and the configured stream key.
