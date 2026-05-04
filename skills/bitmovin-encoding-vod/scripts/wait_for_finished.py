#!/usr/bin/env python3
"""Poll a VOD encoding until it reaches FINISHED, then print manifest URLs.

VOD encodings progress through QUEUED -> RUNNING -> FINISHED. Transient
API errors during polling are tolerated. The script exits non-zero on a
bad terminal status (ERROR / CANCELED) or when --timeout-min elapses
before FINISHED is reached.
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import sys
import time


TERMINAL_GOOD = {"FINISHED"}
TERMINAL_BAD = {"ERROR", "CANCELED"}
DASHBOARD_URL = "https://dashboard.bitmovin.com/encoding/encodings/{eid}"


def _client():
    from bitmovin_api_sdk import BitmovinApi

    api_key = os.environ.get("BITMOVIN_API_KEY")
    if not api_key:
        sys.exit("error: BITMOVIN_API_KEY is not set")
    return BitmovinApi(api_key=api_key)


def _safe_call(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs), None
    except Exception as exc:
        return None, exc


def _status_value(task) -> str:
    raw = getattr(task, "status", None)
    if raw is None:
        return ""
    return getattr(raw, "value", str(raw)).upper()


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("encoding_id")
    parser.add_argument("--timeout-min", type=int, default=120)
    parser.add_argument("--poll-sec", type=int, default=15)
    parser.add_argument(
        "--state-file",
        type=pathlib.Path,
        help=(
            "Path to the state.json written by start_from_template.py. "
            "When provided, manifest URLs are derived from the output's "
            "bucket and printed once the encoding finishes."
        ),
    )
    args = parser.parse_args(argv)

    api = _client()
    deadline = time.monotonic() + args.timeout_min * 60

    print(
        f"waiting for encoding {args.encoding_id} to finish "
        f"(timeout {args.timeout_min} min, poll every {args.poll_sec}s)...",
        flush=True,
    )
    last_progress = -1.0
    last_status = ""
    last_err: Exception | None = None
    while time.monotonic() < deadline:
        task, err = _safe_call(api.encoding.encodings.status, args.encoding_id)
        if task is None:
            last_err = err
            time.sleep(args.poll_sec)
            continue

        status = _status_value(task)
        progress = float(getattr(task, "progress", 0) or 0)

        if status != last_status or progress != last_progress:
            print(f"  status={status} progress={progress:.0f}%", flush=True)
            last_status = status
            last_progress = progress

        if status in TERMINAL_GOOD:
            break
        if status in TERMINAL_BAD:
            _log_task_errors(task)
            sys.exit(
                f"error: encoding {args.encoding_id} reached terminal status {status}"
            )

        time.sleep(args.poll_sec)
    else:
        msg = f"timed out after {args.timeout_min} min waiting for FINISHED"
        if last_err:
            msg += f"; last error: {last_err}"
        sys.exit(f"error: {msg}")

    print()
    print(f"Encoding ID:   {args.encoding_id}")
    print(f"Status:        FINISHED")
    if args.state_file:
        _print_manifest_urls(api, args.state_file)
    print(f"Dashboard:     {DASHBOARD_URL.format(eid=args.encoding_id)}")
    return 0


def _log_task_errors(task) -> None:
    """Print messages with type=ERROR from a finished task. Best-effort."""
    messages = getattr(task, "messages", None) or []
    for msg in messages:
        kind = getattr(getattr(msg, "type", None), "value", None) or getattr(msg, "type", "")
        if str(kind).upper() == "ERROR":
            print(f"  {getattr(msg, 'text', msg)}", file=sys.stderr)


def _print_manifest_urls(api, state_file: pathlib.Path) -> None:
    """Read state.json and print best-effort HTTPS URLs for each manifest."""
    try:
        state = json.loads(state_file.read_text())
    except (FileNotFoundError, json.JSONDecodeError) as exc:
        print(f"(could not read state file {state_file}: {exc})")
        return

    manifests = state.get("manifests") or {}
    if not manifests:
        return

    output_cache: dict[str, tuple[str, object] | None] = {}

    for kind, items in manifests.items():
        for entry in items or []:
            output_id = entry.get("outputId")
            output_path = (entry.get("outputPath") or "").lstrip("/")
            manifest_name = (entry.get("manifestName") or "").lstrip("/")
            if manifest_name:
                base = output_path.rstrip("/")
                full_path = f"{base}/{manifest_name}" if base else manifest_name
            else:
                full_path = output_path
            label = f"{kind.upper()} URL"

            resolved = output_cache.get(output_id) if output_id else None
            if output_id and output_id not in output_cache:
                resolved = _lookup_output(api, output_id)
                output_cache[output_id] = resolved

            if resolved:
                output_kind, output_obj = resolved
                url = _build_https_url(output_kind, output_obj, full_path)
                if url:
                    print(f"{label:14}{url}")
                    continue
            print(
                f"{label:14}<output:{output_id}>/{full_path} "
                "(plug in your CDN/origin URL)"
            )


def _lookup_output(api, output_id: str):
    """Try each supported output type and return (kind, output) once a GET
    succeeds. Returns ``None`` if every lookup fails."""
    for kind in ("s3", "gcs", "gcs_service_account", "azure", "generic_s3"):
        target = getattr(api.encoding.outputs, kind, None)
        if target is None:
            continue
        try:
            return kind, target.get(output_id)
        except Exception:
            continue
    return None


def _build_https_url(kind: str, obj, path: str) -> str | None:
    bucket = (
        getattr(obj, "bucket_name", None)
        or getattr(obj, "container_name", None)
        or ""
    )
    if kind == "s3":
        region = getattr(obj.cloud_region, "value", str(obj.cloud_region or "")).lower().replace("_", "-")
        if bucket and region:
            return f"https://{bucket}.s3.{region}.amazonaws.com/{path}"
    if kind in ("gcs", "gcs_service_account"):
        if bucket:
            return f"https://storage.googleapis.com/{bucket}/{path}"
    return None


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
