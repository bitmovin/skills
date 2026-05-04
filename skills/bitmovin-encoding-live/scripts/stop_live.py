#!/usr/bin/env python3
"""Stop a running live encoding.

Calls POST /encoding/encodings/<id>/live/stop. The encoding shell remains
in the account (not deleted) so logs and statistics remain accessible.
"""

from __future__ import annotations

import argparse
import os
import sys


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("encoding_id")
    args = parser.parse_args(argv)

    from bitmovin_api_sdk import BitmovinApi

    api_key = os.environ.get("BITMOVIN_API_KEY")
    if not api_key:
        sys.exit("error: BITMOVIN_API_KEY is not set")

    api = BitmovinApi(api_key=api_key)
    response = api.encoding.encodings.live.stop(args.encoding_id)
    print(f"stop accepted for encoding {args.encoding_id} (response id: {getattr(response, 'id', '?')})")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
