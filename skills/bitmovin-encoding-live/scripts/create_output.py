#!/usr/bin/env python3
"""Create a Bitmovin Output from credentials in the environment.

Credentials are read from environment variables only:
  BITMOVIN_OUTPUT_ACCESS_KEY    access key (S3) or HMAC access ID (GCS)
  BITMOVIN_OUTPUT_SECRET_KEY    secret key (S3) or HMAC secret (GCS)

The script never accepts secrets via CLI args, never echoes them, and never
writes them to disk. It prints only the new output id on stdout.

For other output types (Azure, FTP, Akamai, etc.) create the output via the
Bitmovin dashboard or your own tooling and pass its id to this skill.
"""

from __future__ import annotations

import argparse
import os
import sys


def _api_key() -> str:
    key = os.environ.get("BITMOVIN_API_KEY")
    if not key:
        sys.exit("error: BITMOVIN_API_KEY is not set")
    return key


def _required(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        sys.exit(f"error: {name} is not set")
    return value


def _coerce_region(enum_cls, value: str | None):
    """Coerce a string region (e.g. ``EU_WEST_1``) to the SDK enum.

    The Bitmovin SDK setters raise TypeError on raw strings, so we look the
    name up on the enum class. Accept both the canonical name and the
    enum-prefixed form (``AwsCloudRegion.EU_WEST_1``) for convenience.
    """
    if not value:
        return None
    name = value.split(".", 1)[-1].strip().upper().replace("-", "_")
    try:
        return enum_cls[name]
    except KeyError:
        valid = ", ".join(sorted(m.name for m in enum_cls))
        sys.exit(
            f"error: unknown {enum_cls.__name__} {value!r}. "
            f"Valid values: {valid}"
        )


def _create_s3(api, name: str, bucket: str, cloud_region: str | None):
    from bitmovin_api_sdk.models import AwsCloudRegion, S3Output

    out = S3Output(
        name=name,
        bucket_name=bucket,
        access_key=_required("BITMOVIN_OUTPUT_ACCESS_KEY"),
        secret_key=_required("BITMOVIN_OUTPUT_SECRET_KEY"),
        cloud_region=_coerce_region(AwsCloudRegion, cloud_region),
    )
    return api.encoding.outputs.s3.create(out)


def _create_gcs(api, name: str, bucket: str, cloud_region: str | None):
    from bitmovin_api_sdk.models import GcsOutput, GoogleCloudRegion

    out = GcsOutput(
        name=name,
        bucket_name=bucket,
        access_key=_required("BITMOVIN_OUTPUT_ACCESS_KEY"),
        secret_key=_required("BITMOVIN_OUTPUT_SECRET_KEY"),
        cloud_region=_coerce_region(GoogleCloudRegion, cloud_region),
    )
    return api.encoding.outputs.gcs.create(out)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--type", required=True, choices=("s3", "gcs"))
    parser.add_argument("--name", required=True, help="Display name for the output.")
    parser.add_argument("--bucket", required=True, help="Bucket / container name.")
    parser.add_argument(
        "--cloud-region",
        default=None,
        help="Optional cloud region (e.g. US_EAST_1, EUROPE_WEST_1).",
    )
    args = parser.parse_args(argv)

    from bitmovin_api_sdk import BitmovinApi

    api = BitmovinApi(api_key=_api_key())

    if args.type == "s3":
        created = _create_s3(api, args.name, args.bucket, args.cloud_region)
    else:
        created = _create_gcs(api, args.name, args.bucket, args.cloud_region)

    print(created.id)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
