#!/usr/bin/env python3
"""One-shot status + progress for a VOD encoding."""

from __future__ import annotations

import argparse
import os
import sys


def _client():
    from bitmovin_api_sdk import BitmovinApi

    api_key = os.environ.get("BITMOVIN_API_KEY")
    if not api_key:
        sys.exit("error: BITMOVIN_API_KEY is not set")
    return BitmovinApi(api_key=api_key)


def _enum(value) -> str:
    return getattr(value, "value", str(value or "")).upper()


def _format_api_error(exc: Exception) -> str:
    """Compact one-line summary of a Bitmovin SDK error.

    The SDK's BitmovinError.__str__ dumps the entire request and response,
    which is too noisy for a CLI's stderr. Surface only the fields that
    pinpoint the failure: short message, developerMessage, and errorCode.
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


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("encoding_id")
    args = parser.parse_args(argv)

    api = _client()
    try:
        task = api.encoding.encodings.status(args.encoding_id)
    except Exception as exc:
        sys.exit(
            f"error: could not GET status for {args.encoding_id}: "
            f"{_format_api_error(exc)}"
        )

    status = _enum(getattr(task, "status", None))
    progress = float(getattr(task, "progress", 0) or 0)
    print(f"Encoding:  {args.encoding_id}")
    print(f"Status:    {status}")
    print(f"Progress:  {progress:.0f}%")

    if status == "ERROR":
        for msg in getattr(task, "messages", None) or []:
            kind = _enum(getattr(msg, "type", None))
            if kind == "ERROR":
                print(f"  {getattr(msg, 'text', msg)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
