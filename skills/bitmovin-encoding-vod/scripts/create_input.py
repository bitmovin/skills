#!/usr/bin/env python3
"""Create a fresh HTTP/HTTPS input in the Bitmovin account.

Only HTTP/HTTPS inputs are supported here because they don't need
credentials. For S3/GCS/Azure inputs (which would require pasting
secret keys), reuse an existing input via list_inputs.py instead;
this skill never accepts credentials on the CLI or in the params file.
"""

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


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--type", required=True, choices=("http", "https"))
    parser.add_argument("--host", required=True, help="Hostname (no scheme).")
    parser.add_argument("--name", help="Display name. Defaults to the host.")
    args = parser.parse_args(argv)

    api = _client()
    name = args.name or args.host

    if args.type == "https":
        from bitmovin_api_sdk import HttpsInput

        created = api.encoding.inputs.https.create(
            https_input=HttpsInput(host=args.host, name=name)
        )
    else:
        from bitmovin_api_sdk import HttpInput

        created = api.encoding.inputs.http.create(
            http_input=HttpInput(host=args.host, name=name)
        )

    print(created.id)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
