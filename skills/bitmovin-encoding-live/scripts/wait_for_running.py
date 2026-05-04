#!/usr/bin/env python3
"""Poll an encoding until it is RUNNING and the live ingest IP is exposed.

Live encoders take 30–120s to come up. Transient API errors during that
window are normal and ignored.
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import sys
import time


TERMINAL_BAD = {"ERROR", "CANCELED", "FINISHED"}
DASHBOARD_URL = "https://dashboard.bitmovin.com/live/encodings/{eid}"
STATIC_RTMP_HOST = "live-ingest.bitmovin.com"
STATIC_RTMP_APPLICATION = "live"


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


def _poll_until(predicate, *, timeout_min: int, poll_sec: int, label: str):
    deadline = time.monotonic() + timeout_min * 60
    last_err = None
    while time.monotonic() < deadline:
        result, err = predicate()
        if result is not None:
            return result
        if err is not None:
            last_err = err
        time.sleep(poll_sec)
    raise TimeoutError(
        f"timed out after {timeout_min} min waiting for {label}"
        + (f"; last error: {last_err}" if last_err else "")
    )


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("encoding_id")
    parser.add_argument("--timeout-min", type=int, default=10)
    parser.add_argument("--poll-sec", type=int, default=10)
    parser.add_argument(
        "--state-file",
        type=pathlib.Path,
        help=(
            "Path to the state.json written by start_from_template.py. "
            "When provided, manifest URLs are derived from the output's "
            "bucket and printed alongside the ingest URL."
        ),
    )
    args = parser.parse_args(argv)

    api = _client()
    state = _load_state(args.state_file) if args.state_file else None
    input_type = (state or {}).get("inputType")

    def status_check():
        task, err = _safe_call(api.encoding.encodings.status, args.encoding_id)
        if task is None:
            return None, err
        status = _status_value(task)
        if status == "RUNNING":
            return task, None
        if status in TERMINAL_BAD:
            sys.exit(
                f"error: encoding {args.encoding_id} reached terminal status {status}"
            )
        return None, None

    print(f"waiting for encoding {args.encoding_id} to reach RUNNING...", flush=True)
    try:
        _poll_until(
            status_check,
            timeout_min=args.timeout_min,
            poll_sec=args.poll_sec,
            label="status RUNNING",
        )
        print("encoding is RUNNING. Waiting for ingest details...", flush=True)

        def live_check():
            details, err = _safe_call(api.encoding.encodings.live.get, args.encoding_id)
            if details is None:
                return None, err
            if not getattr(details, "encoder_ip", None):
                return None, None
            # SRT ingest has no user-facing stream key; only RTMP needs it.
            if input_type != "srt" and not getattr(details, "stream_key", None):
                return None, None
            return details, None

        details = _poll_until(
            live_check,
            timeout_min=args.timeout_min,
            poll_sec=args.poll_sec,
            label="encoder IP" + ("" if input_type == "srt" else " / stream key"),
        )
    except TimeoutError as exc:
        sys.exit(f"error: {exc}")

    print()
    print(f"Encoding ID:   {args.encoding_id}")
    print(f"Encoder IP:    {details.encoder_ip}")

    if input_type == "srt":
        _print_srt_ingest(api, args.encoding_id, details)
    elif input_type == "redundantRtmp":
        _print_static_rtmp_ingest(api, args.encoding_id)
    else:
        stream_key = getattr(details, "stream_key", None)
        application = getattr(details, "application", None)
        if stream_key:
            print(f"Stream Key:    {stream_key}")
        if application:
            print(f"Application:   {application}")
            print(f"RTMP Ingest:   rtmp://{details.encoder_ip}/{application}/{stream_key}")
        else:
            _print_srt_ingest(api, args.encoding_id, details)

    if args.state_file:
        _print_manifest_urls(api, args.state_file)

    print(f"Dashboard:     {DASHBOARD_URL.format(eid=args.encoding_id)}")
    return 0


def _load_state(state_file: pathlib.Path) -> dict | None:
    try:
        return json.loads(state_file.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def _print_manifest_urls(api, state_file: pathlib.Path) -> None:
    """Read state.json and print best-effort HTTPS URLs for each manifest.

    Falls back to a placeholder line if the output type is something for
    which we can't derive a public-facing URL pattern (e.g. Akamai NetStorage
    where the host depends on the customer's CDN configuration).
    """
    try:
        state = json.loads(state_file.read_text())
    except (FileNotFoundError, json.JSONDecodeError) as exc:
        print(f"(could not read state file {state_file}: {exc})")
        return

    manifests = state.get("manifests") or {}
    if not manifests:
        return

    # Cache output lookups so we hit the API once per (id, kind).
    output_cache: dict[str, tuple[str, object] | None] = {}

    for kind, items in manifests.items():
        for entry in items or []:
            output_id = entry.get("outputId")
            output_path = (entry.get("outputPath") or "").lstrip("/")
            manifest_name = (entry.get("manifestName") or "").lstrip("/")
            if manifest_name:
                # Force exactly one '/' between the bucket-relative directory
                # and the manifest filename — outputPath isn't guaranteed to
                # end with a slash.
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
            # Wrong type (404) or auth/transport error — try the next kind.
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


def _print_static_rtmp_ingest(api, encoding_id: str) -> None:
    """Print the static RTMP/RTMPS ingest URL(s) for templates that use
    `inputs.redundantRtmp.staticIngestPoints`.

    For these templates the encoder IP from `live.get` is not the ingest host;
    Bitmovin assigns stream keys to static ingest points under
    `live-ingest.bitmovin.com/live`.
    """
    try:
        from bitmovin_api_sdk.encoding.live.stream_keys.stream_key_list_query_params import (
            StreamKeyListQueryParams,
        )

        items = (
            api.encoding.live.stream_keys.list(
                StreamKeyListQueryParams(assigned_encoding_id=encoding_id, limit=20)
            ).items
            or []
        )
    except Exception:
        items = []

    keys = sorted(
        [item.value for item in items if getattr(item, "value", None)],
        key=str,
    )
    if not keys:
        print(
            "RTMP ingest:  check the dashboard for the exact static RTMP/RTMPS "
            "ingest URL(s); this template uses Bitmovin static ingest points, "
            "so `live.get` does not expose a usable encoder-ip-based ingest URL."
        )
        return

    if len(keys) == 1:
        key = keys[0]
        print(f"RTMPS Ingest: rtmps://{STATIC_RTMP_HOST}/{STATIC_RTMP_APPLICATION}/{key}")
        print(f"RTMP Ingest:  rtmp://{STATIC_RTMP_HOST}/{STATIC_RTMP_APPLICATION}/{key}")
        return

    print("Static RTMP ingest points:")
    for index, key in enumerate(keys, start=1):
        print(
            f"  Ingest {index}:   rtmps://{STATIC_RTMP_HOST}/{STATIC_RTMP_APPLICATION}/{key}"
        )


def _print_srt_ingest(api, encoding_id: str, details) -> None:
    """Resolve the SRT input attached to the encoding and print a usable URL.

    LISTENER input mode → encoder listens; user pushes to
    ``srt://<encoder_ip>:<port>``.

    CALLER input mode → encoder dials out to the user's host:port; the user
    runs their own listener at the configured destination.
    """
    srt_input = _resolve_srt_input(api, encoding_id)
    if srt_input is None:
        print(f"Ingest host:   {details.encoder_ip}")
        print(
            "(could not resolve SRT input details — check the encoding's "
            "input configuration in the dashboard)"
        )
        return

    mode = getattr(srt_input.mode, "value", str(srt_input.mode or "")).upper()
    port = getattr(srt_input, "port", None)
    path = getattr(srt_input, "path", None) or ""
    host = getattr(srt_input, "host", None)

    print(f"Input mode:    SRT {mode or '?'}")
    if mode == "LISTENER" and port:
        url = f"srt://{details.encoder_ip}:{port}"
        if path:
            url += f"/{path.lstrip('/')}"
        print(f"SRT Ingest:    {url}")
        print(
            "(connect from your encoder/streamer in CALLER mode; the "
            "encoder is listening here)"
        )
    elif mode == "CALLER" and host and port:
        target = f"srt://{host}:{port}"
        if path:
            target += f"/{path.lstrip('/')}"
        print(f"Encoder dials: {target}")
        print(
            "(encoder is in CALLER mode — start your SRT listener at the "
            "address above before the encoder connects)"
        )
    else:
        print(f"Ingest host:   {details.encoder_ip}")
        print(
            f"(SRT mode={mode!r} port={port!r} host={host!r}; could not "
            "build a complete ingest URL)"
        )


def _resolve_srt_input(api, encoding_id: str):
    """Walk encoding → first stream → input_id → SRT input. Returns ``None``
    if any step doesn't yield a usable SrtInput."""
    try:
        streams = api.encoding.encodings.streams.list(encoding_id).items or []
    except Exception:
        return None
    for stream in streams:
        for input_stream in getattr(stream, "input_streams", None) or []:
            input_id = getattr(input_stream, "input_id", None)
            if not input_id:
                continue
            try:
                return api.encoding.inputs.srt.get(input_id)
            except Exception:
                continue
    return None


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
