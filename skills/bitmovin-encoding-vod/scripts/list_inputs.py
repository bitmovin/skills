#!/usr/bin/env python3
"""List existing inputs visible to the configured BITMOVIN_API_KEY.

Filter by type with --type. Useful when the user wants to reuse a
previously-configured S3/GCS/HTTP input.
"""

from __future__ import annotations

import argparse
import importlib
import os
import sys


# (kind, query-params module dotted path, query-params class name)
SUPPORTED = (
    ("http", "bitmovin_api_sdk.encoding.inputs.http.http_input_list_query_params", "HttpInputListQueryParams"),
    ("https", "bitmovin_api_sdk.encoding.inputs.https.https_input_list_query_params", "HttpsInputListQueryParams"),
    ("s3", "bitmovin_api_sdk.encoding.inputs.s3.s3_input_list_query_params", "S3InputListQueryParams"),
    ("s3_role_based", "bitmovin_api_sdk.encoding.inputs.s3_role_based.s3_role_based_input_list_query_params", "S3RoleBasedInputListQueryParams"),
    ("generic_s3", "bitmovin_api_sdk.encoding.inputs.generic_s3.generic_s3_input_list_query_params", "GenericS3InputListQueryParams"),
    ("gcs", "bitmovin_api_sdk.encoding.inputs.gcs.gcs_input_list_query_params", "GcsInputListQueryParams"),
    ("gcs_service_account", "bitmovin_api_sdk.encoding.inputs.gcs_service_account.gcs_service_account_input_list_query_params", "GcsServiceAccountInputListQueryParams"),
    ("azure", "bitmovin_api_sdk.encoding.inputs.azure.azure_input_list_query_params", "AzureInputListQueryParams"),
    ("ftp", "bitmovin_api_sdk.encoding.inputs.ftp.ftp_input_list_query_params", "FtpInputListQueryParams"),
    ("sftp", "bitmovin_api_sdk.encoding.inputs.sftp.sftp_input_list_query_params", "SftpInputListQueryParams"),
    ("akamai_netstorage", "bitmovin_api_sdk.encoding.inputs.akamai_netstorage.akamai_netstorage_input_list_query_params", "AkamaiNetStorageInputListQueryParams"),
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
    """Return (items, error). error is set when the call fails so the caller
    can distinguish "API said the list is empty" from "we never reached the API".
    """
    target = getattr(api.encoding.inputs, kind, None)
    if target is None:
        return [], f"SDK has no api.encoding.inputs.{kind}"
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
        help="Restrict listing to one input type. Default: list all supported types.",
    )
    parser.add_argument("--limit", type=int, default=100)
    args = parser.parse_args(argv)

    api = _client()
    selected = [t for t in SUPPORTED if not args.type or t[0] == args.type]

    rows: list[tuple[str, str, str, str]] = []
    errors: list[tuple[str, str]] = []
    for kind, module_path, class_name in selected:
        items, err = _list(api, kind, module_path, class_name, args.limit)
        if err:
            errors.append((kind, err))
            continue
        for item in items:
            host = (
                getattr(item, "host", None)
                or getattr(item, "bucket_name", None)
                or getattr(item, "account_name", None)
                or ""
            )
            rows.append((kind, item.id or "", item.name or "", host))

    if rows:
        widths = [
            max(len(r[i]) for r in rows + [("TYPE", "ID", "NAME", "HOST/BUCKET")])
            for i in range(4)
        ]
        fmt = "  ".join(f"{{:{w}}}" for w in widths)
        print(fmt.format("TYPE", "ID", "NAME", "HOST/BUCKET"))
        for r in rows:
            print(fmt.format(*r))
    elif not errors:
        print("(no inputs found)")

    if errors:
        print("", file=sys.stderr)
        for kind, msg in errors:
            print(f"error listing {kind}: {msg}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
