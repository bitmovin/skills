#!/usr/bin/env python3
"""POST a rendered Encoding Template to /encoding/templates/start.

The Templates API ingests the YAML body, creates every described resource
(input, codec configs, encoding, streams, muxings, manifests), and starts
the live encoding using the embedded `live.start` block. This script is a
thin wrapper that submits the YAML and writes a state file the rest of the
skill scripts read back.

Reads BITMOVIN_API_KEY from the environment.
Never logs the key or any value resembling a secret.
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import sys
import time
import urllib.error
import urllib.request

import yaml


def _api_key() -> str:
    key = os.environ.get("BITMOVIN_API_KEY")
    if not key:
        sys.exit("error: BITMOVIN_API_KEY is not set")
    return key


def _client():
    from bitmovin_api_sdk import BitmovinApi  # lazy import — keeps --help fast

    return BitmovinApi(api_key=_api_key())


def _post_template(api, template_body: dict):
    """Call /encoding/templates/start with a parsed template body.

    The Bitmovin Python SDK posts dicts as JSON. Field order matters — the API
    creates resources in the order they appear — and Python ≥3.7 dict +
    PyYAML preserve insertion order, so the YAML declaration order is kept.
    """
    return api.encoding.templates.start(template_body)


def _format_api_error(exc: Exception) -> str:
    """Compact one-line summary of a Bitmovin SDK error.

    The SDK's BitmovinError.__str__ dumps the entire request and response,
    which is too noisy on a 4xx (and risks leaking the full template body —
    including secrets like an SRT passphrase or stream key — to the user's
    terminal). Surface only short message + developerMessage + errorCode.
    """
    short = getattr(exc, "short_message", None)
    if not short:
        short = str(exc).splitlines()[0] if str(exc) else type(exc).__name__
    parts = [short]
    dev = getattr(exc, "developer_message", None)
    if dev and dev != short:
        parts.append(f"developerMessage: {dev}")
    code = getattr(exc, "error_code", None)
    if code is not None:
        parts.append(f"errorCode: {code}")
    return "; ".join(parts)


def _extract_state(template_yaml: str, encoding_id: str) -> dict:
    """Pull non-secret context out of the rendered template for state.json."""
    body = yaml.safe_load(template_yaml) or {}
    metadata = body.get("metadata", {}) or {}
    encodings = body.get("encodings", {}) or {}
    main = next(iter(encodings.values()), {}) or {}
    live = (main.get("live") or {}).get("start", {}).get("properties", {}) or {}
    inputs = body.get("inputs", {}) or {}
    input_type = next(iter(inputs.keys()), None)

    output_ids = set()
    output_paths = set()
    for muxings_by_kind in (main.get("muxings") or {}).values():
        for muxing in muxings_by_kind.values():
            for o in (muxing.get("properties") or {}).get("outputs") or []:
                if o.get("outputId"):
                    output_ids.add(o["outputId"])
                if o.get("outputPath"):
                    output_paths.add(o["outputPath"])

    manifest_files = {}
    for kind, manifests in (body.get("manifests") or {}).items():
        manifest_files[kind] = []
        for mid, mdef in manifests.items():
            props = mdef.get("properties") or {}
            manifest_files[kind].append(
                {
                    "templateId": mid,
                    "manifestName": props.get("manifestName"),
                    "outputId": (props.get("outputs") or [{}])[0].get("outputId"),
                    "outputPath": (props.get("outputs") or [{}])[0].get("outputPath"),
                }
            )

    return {
        "encodingId": encoding_id,
        "encodingName": metadata.get("name"),
        "encodingType": metadata.get("type"),
        "inputType": input_type,
        "streamKey": live.get("streamKey"),
        "manifestGenerator": live.get("manifestGenerator"),
        "outputIds": sorted(output_ids),
        "outputPaths": sorted(output_paths),
        "manifests": manifest_files,
    }


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("template", help="Path to a rendered Encoding Template YAML.")
    parser.add_argument(
        "--run-dir",
        type=pathlib.Path,
        help="Where to write state.json. Defaults to the directory holding the template.",
    )
    parser.add_argument(
        "--no-validate",
        action="store_true",
        help=(
            "Skip the local JSON-Schema pre-flight check against "
            "Bitmovin's published Encoding Template schema."
        ),
    )
    args = parser.parse_args(argv)

    template_path = pathlib.Path(args.template).expanduser().resolve()
    template_yaml = template_path.read_text()
    template_body = yaml.safe_load(template_yaml)
    if not isinstance(template_body, dict):
        sys.exit("error: rendered template did not parse to a YAML mapping")

    run_dir = (args.run_dir or template_path.parent).expanduser().resolve()
    run_dir.mkdir(parents=True, exist_ok=True)

    if not args.no_validate:
        _validate_against_schema(template_path, template_body)

    api = _client()
    try:
        response = _post_template(api, template_body)
    except Exception as exc:
        sys.exit(f"error: POST /encoding/templates/start failed: {_format_api_error(exc)}")

    encoding_id = getattr(response, "encoding_id", None) or getattr(
        response, "encodingId", None
    )
    if not encoding_id:
        sys.exit(
            "error: /encoding/templates/start did not return an encoding id; "
            f"response was: {response!r}"
        )

    state = _extract_state(template_yaml, encoding_id)
    (run_dir / "state.json").write_text(json.dumps(state, indent=2) + "\n")

    _verify_template_applied(api, encoding_id, state)

    print(encoding_id)
    return 0


_SCHEMA_URL = (
    "https://raw.githubusercontent.com/bitmovin/bitmovin-api-sdk-examples/"
    "main/bitmovin-encoding-template.json"
)
_SCHEMA_CACHE_VERSION = 1
_SCHEMA_CACHE_TTL_SEC = 24 * 60 * 60  # 24h, matches the Bitmovin CLI's cache.


def _validate_against_schema(template_path: pathlib.Path, template_body: dict) -> None:
    """Run a local JSON-Schema lint against Bitmovin's published Encoding
    Template schema before we POST.

    Same algorithm as ``bitmovin encoding templates validate`` (Bitmovin CLI):
    fetch the schema (24h-cached on disk), load the YAML body, run a
    Draft 2020-12 validator, and abort with a structured error on
    violations. Removes the Node-CLI dependency the earlier shell-out path
    needed.

    Best-effort: if `jsonschema` isn't installed or the schema can't be
    fetched and we have no cache, we warn and continue rather than block
    the run — the defensive `_verify_template_applied` post-POST check
    still catches the silent partial-parse behaviour after submission.
    """
    try:
        from jsonschema import Draft202012Validator
    except ImportError:
        print(
            "warning: jsonschema not installed; skipping local pre-flight. "
            "Install it (or rely on ensure_venv.sh) to enable schema-level "
            "validation.",
            file=sys.stderr,
        )
        return

    schema = _load_template_schema()
    if schema is None:
        return  # _load_template_schema already warned

    print(
        f"validating {template_path.name} against Bitmovin Encoding Template schema ...",
        file=sys.stderr,
        flush=True,
    )

    validator = Draft202012Validator(schema)
    errors = sorted(validator.iter_errors(template_body), key=lambda e: list(e.absolute_path))
    if not errors:
        print("template is valid.", file=sys.stderr)
        return

    formatted = []
    for err in errors:
        path = "/" + ".".join(str(p) for p in err.absolute_path) if err.absolute_path else "/"
        formatted.append(f"  {path}: {err.message}")

    sys.exit(
        "error: template failed schema validation.\n"
        + "\n".join(formatted)
        + "\n  Re-run with --no-validate to bypass."
    )


def _load_template_schema() -> dict | None:
    """Return Bitmovin's Encoding Template JSON schema as a dict.

    24h on-disk cache at
    ``$BITMOVIN_LIVE_SKILL_CACHE/template-schema-v<N>.json`` (default
    ``~/.cache/bitmovin/bitmovin-encoding-live/``). On fetch failure we fall
    back to a stale cache if one exists; if neither succeeds we return
    ``None`` and warn — the pre-flight is advisory, not load-bearing.
    """
    cache_root = pathlib.Path(
        os.environ.get(
            "BITMOVIN_LIVE_SKILL_CACHE",
            pathlib.Path.home() / ".cache" / "bitmovin" / "bitmovin-encoding-live",
        )
    )
    cache_file = cache_root / f"template-schema-v{_SCHEMA_CACHE_VERSION}.json"

    if cache_file.exists():
        age = time.time() - cache_file.stat().st_mtime
        if age < _SCHEMA_CACHE_TTL_SEC:
            try:
                return json.loads(cache_file.read_text())
            except (OSError, json.JSONDecodeError):
                pass  # fall through to fetch

    try:
        with urllib.request.urlopen(_SCHEMA_URL, timeout=10) as resp:
            body = resp.read()
        schema = json.loads(body)
        try:
            cache_root.mkdir(parents=True, exist_ok=True)
            cache_file.write_bytes(body)
        except OSError:
            pass  # cache is best-effort
        return schema
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        if cache_file.exists():
            try:
                return json.loads(cache_file.read_text())
            except (OSError, json.JSONDecodeError):
                pass
        print(
            f"warning: could not fetch Bitmovin template schema ({exc}); "
            "skipping local pre-flight. The defensive post-POST check still "
            "guards against silent partial-parse failures.",
            file=sys.stderr,
        )
        return None


def _verify_template_applied(
    api, encoding_id: str, state: dict, *, timeout_sec: int = 15, poll_sec: float = 1.5
) -> None:
    """Catch silent template-parse failures.

    `/encoding/templates/start` returns the new encoding id immediately and
    processes the rest of the template asynchronously. For the first few
    seconds the encoding has `type=NONE` and zero child resources even on a
    valid template. We poll for the type to match `metadata.type`. If it
    still hasn't settled after `timeout_sec`, the template was almost
    certainly silently dropped (e.g. `inputs.rtmp` instead of
    `inputs.redundantRtmp`) and we fail loudly so the user sees it here
    rather than 5 minutes into `wait_for_running.py`.
    """
    import time

    expected_type = (state.get("encodingType") or "").upper()
    if not expected_type:
        return  # nothing to compare against

    deadline = time.monotonic() + timeout_sec
    actual_type = ""
    stream_count = 0
    last_get_error: str | None = None
    while time.monotonic() < deadline:
        try:
            enc = api.encoding.encodings.get(encoding_id)
            actual_type = getattr(enc.type, "value", str(enc.type)).upper()
            if actual_type == expected_type:
                return
        except Exception as exc:
            # The encoding shell is sometimes briefly unreadable while the
            # Templates API is still applying child resources. Keep polling
            # but remember the most recent error to include in a timeout.
            last_get_error = str(exc).splitlines()[0] if str(exc) else type(exc).__name__
        time.sleep(poll_sec)

    last_streams_error: str | None = None
    try:
        stream_count = len(api.encoding.encodings.streams.list(encoding_id).items or [])
    except Exception as exc:
        # Best-effort diagnostic; don't shadow the type-mismatch error.
        last_streams_error = str(exc).splitlines()[0] if str(exc) else type(exc).__name__

    diag_lines = []
    if last_get_error:
        diag_lines.append(f"  last GET encoding error: {last_get_error}")
    if last_streams_error:
        diag_lines.append(f"  streams list error: {last_streams_error}")
    diag_block = ("\n" + "\n".join(diag_lines)) if diag_lines else ""

    sys.exit(
        "error: the Templates API silently dropped most of the template.\n"
        f"  encoding {encoding_id} still has type={actual_type or 'unknown'!r} "
        f"(expected {expected_type!r}) after {timeout_sec}s; "
        f"{stream_count} streams created.\n"
        "  This usually means a section of the template uses a key the API "
        "doesn't recognize (e.g. `inputs.rtmp` instead of `inputs.redundantRtmp`).\n"
        "  Inspect the rendered template and compare its top-level structure "
        f"against the working samples in <skill>/templates/{diag_block}"
    )


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
