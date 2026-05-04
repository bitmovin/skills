#!/usr/bin/env python3
"""List existing outputs visible to the configured BITMOVIN_API_KEY.

Prints id, type, name, and bucket (where applicable) so the user can pick an
existing output to reuse instead of creating a new one.

Listing failures are reported and cause a non-zero exit — silent recovery
to "no outputs found" would steer users toward creating duplicates.
"""

from __future__ import annotations

import argparse
import importlib
import os
import sys


# (kind, query-params module dotted path, query-params class name)
SUPPORTED = (
    ("s3", "bitmovin_api_sdk.encoding.outputs.s3.s3_output_list_query_params", "S3OutputListQueryParams"),
    ("gcs", "bitmovin_api_sdk.encoding.outputs.gcs.gcs_output_list_query_params", "GcsOutputListQueryParams"),
    ("gcs_service_account", "bitmovin_api_sdk.encoding.outputs.gcs_service_account.gcs_service_account_output_list_query_params", "GcsServiceAccountOutputListQueryParams"),
    ("azure", "bitmovin_api_sdk.encoding.outputs.azure.azure_output_list_query_params", "AzureOutputListQueryParams"),
    ("generic_s3", "bitmovin_api_sdk.encoding.outputs.generic_s3.generic_s3_output_list_query_params", "GenericS3OutputListQueryParams"),
)


def _client():
    from bitmovin_api_sdk import BitmovinApi

    api_key = os.environ.get("BITMOVIN_API_KEY")
    if not api_key:
        sys.exit("error: BITMOVIN_API_KEY is not set")
    return BitmovinApi(api_key=api_key)


def _query_params(module_path: str, class_name: str, *, limit: int):
    try:
        cls = getattr(importlib.import_module(module_path), class_name)
    except (ImportError, AttributeError):
        return None
    return cls(limit=limit)


def _list(api, kind: str, module_path: str, class_name: str, limit: int):
    """Return (items, error). Both may be None.

    error is set when the call fails so the caller can distinguish
    "API said the list is empty" from "we never reached the API".
    """
    target = getattr(api.encoding.outputs, kind, None)
    if target is None:
        return [], f"SDK has no api.encoding.outputs.{kind}"
    qp = _query_params(module_path, class_name, limit=limit)
    try:
        if qp is not None:
            page = target.list(query_params=qp)
        else:
            page = target.list()
    except Exception as exc:
        return [], str(exc).splitlines()[0]
    return list(page.items or []), None


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--type",
        choices=[k for k, *_ in SUPPORTED],
        help="Restrict listing to one output type. Default: list all supported types.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=100,
        help="Items per type to fetch. The Bitmovin API caps this at 100; "
        "values above 100 are clamped client-side.",
    )
    args = parser.parse_args(argv)

    if args.limit > 100:
        print(
            f"warning: --limit clamped from {args.limit} to 100 (Bitmovin API max)",
            file=sys.stderr,
        )
        args.limit = 100

    api = _client()
    selected = [t for t in SUPPORTED if not args.type or t[0] == args.type]

    rows: list[tuple[str, str, str, str]] = []
    errors: list[tuple[str, str]] = []
    for kind, module_path, class_name in selected:
        items, err = _list(api, kind, module_path, class_name, args.limit)
        if err:
            errors.append((kind, err))
            continue
        for out in items:
            bucket = (
                getattr(out, "bucket_name", "")
                or getattr(out, "container", "")
                or getattr(out, "container_name", "")
                or ""
            )
            rows.append((kind, out.id or "", out.name or "", bucket))

    if rows:
        widths = [
            max(len(r[i]) for r in rows + [("TYPE", "ID", "NAME", "BUCKET")])
            for i in range(4)
        ]
        fmt = "  ".join(f"{{:{w}}}" for w in widths)
        print(fmt.format("TYPE", "ID", "NAME", "BUCKET"))
        for r in rows:
            print(fmt.format(*r))
    elif not errors:
        print("(no outputs found)")

    if errors:
        print("", file=sys.stderr)
        for kind, msg in errors:
            print(f"error listing {kind}: {msg}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
