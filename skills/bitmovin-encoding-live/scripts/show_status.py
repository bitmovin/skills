#!/usr/bin/env python3
"""One-shot dump of encoding status and live ingest details."""

from __future__ import annotations

import argparse
import os
import sys


STATIC_RTMP_HOST = "live-ingest.bitmovin.com"
STATIC_RTMP_APPLICATION = "live"


def _client():
    from bitmovin_api_sdk import BitmovinApi

    api_key = os.environ.get("BITMOVIN_API_KEY")
    if not api_key:
        sys.exit("error: BITMOVIN_API_KEY is not set")
    return BitmovinApi(api_key=api_key)


def _status_value(task) -> str:
    raw = getattr(task, "status", None)
    if raw is None:
        return ""
    return getattr(raw, "value", str(raw))


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("encoding_id")
    args = parser.parse_args(argv)

    api = _client()

    task = api.encoding.encodings.status(args.encoding_id)
    print(f"Encoding ID: {args.encoding_id}")
    print(f"Status:      {_status_value(task)}")
    progress = getattr(task, "progress", None)
    if progress is not None:
        print(f"Progress:    {progress}%")

    try:
        details = api.encoding.encodings.live.get(args.encoding_id)
    except Exception as exc:
        print(f"Live details: not available ({exc})")
        return 0

    encoder_ip = getattr(details, "encoder_ip", None)
    stream_key = getattr(details, "stream_key", None)
    application = getattr(details, "application", None)

    if encoder_ip:
        print(f"Encoder IP:  {encoder_ip}")

    static_rtmp_keys = _list_static_rtmp_keys(api, args.encoding_id)
    if static_rtmp_keys:
        if len(static_rtmp_keys) == 1:
            key = static_rtmp_keys[0]
            print(f"RTMPS Ingest: rtmps://{STATIC_RTMP_HOST}/{STATIC_RTMP_APPLICATION}/{key}")
            print(f"RTMP Ingest:  rtmp://{STATIC_RTMP_HOST}/{STATIC_RTMP_APPLICATION}/{key}")
        else:
            print("Static RTMP ingest points:")
            for index, key in enumerate(static_rtmp_keys, start=1):
                print(
                    f"  Ingest {index}: rtmps://{STATIC_RTMP_HOST}/{STATIC_RTMP_APPLICATION}/{key}"
                )
        return 0

    if stream_key:
        print(f"Stream Key:  {stream_key}")
    if application:
        print(f"Application: {application}")
    if encoder_ip and application and stream_key:
        print(f"RTMP Ingest: rtmp://{encoder_ip}/{application}/{stream_key}")
    return 0


def _list_static_rtmp_keys(api, encoding_id: str) -> list[str]:
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
        return []

    return sorted(
        [item.value for item in items if getattr(item, "value", None)],
        key=str,
    )


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
