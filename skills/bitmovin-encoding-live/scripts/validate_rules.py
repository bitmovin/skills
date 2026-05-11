#!/usr/bin/env python3
"""Cross-field rule checks for a parsed Live Encoding Template.

Mirrors a subset of the Bitmovin server-side validators that fire at
template-submission time. The Bitmovin CLI's `templates validate` already
catches structural / schema errors; this catches semantic errors the schema
cannot express (e.g. "fMP4 muxings must hold exactly one stream", "live
encodings cannot use THREE_PASS") plus live-ingest specifics observed in
practice (the `inputs.rtmp` silent-drop, `$/...` streamKeyId refs that
don't resolve).

Each check carries the rule_id from references/rulebook.yaml. When you
change a rule, update both files together.

Adapted from skills/bitmovin-encoding-vod/scripts/validate_rules.py — kept
the rules that can fire on a LIVE encoding, dropped per-title / hardware /
sprite / thumbnail / Dolby Vision (out of scope for live), added
live-ingest-specific checks.

Usage:
    python validate_rules.py path/to/template.yaml
    cat template.yaml | python validate_rules.py
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from typing import Any, Callable, Iterator


@dataclass(frozen=True)
class Violation:
    rule_id: str
    path: str
    message: str

    def __str__(self) -> str:
        return f"[{self.rule_id}] {self.path}: {self.message}"


# ─── Walkers ──────────────────────────────────────────────────────────────


def _walk_codec_configs(template: dict) -> Iterator[tuple[str, str, str, dict]]:
    """Yield (config_path, kind, codec_type, properties) for all codec configs.

    kind is "video" or "audio". codec_type is "h264", "aac", etc. (lowercased).
    config_path matches the `$/configurations/<kind>/<codec_type>/<id>`
    reference form used in stream `codecConfigId` fields.
    """
    configs = template.get("configurations") or {}
    for kind, by_codec in configs.items():
        if not isinstance(by_codec, dict):
            continue
        for codec_type, by_id in by_codec.items():
            if not isinstance(by_id, dict):
                continue
            for cfg_id, cfg in by_id.items():
                if not isinstance(cfg, dict):
                    continue
                path = f"$/configurations/{kind}/{codec_type}/{cfg_id}"
                props = cfg.get("properties") or {}
                yield path, str(kind).lower(), str(codec_type).lower(), props


def _build_codec_lookup(template: dict) -> dict[str, tuple[str, str, dict]]:
    """{config_path: (kind, codec_type, properties)}."""
    return {p: (k, t, props) for p, k, t, props in _walk_codec_configs(template)}


def _walk_encodings(template: dict) -> Iterator[tuple[str, dict]]:
    encs = template.get("encodings") or {}
    for enc_id, enc in encs.items():
        yield enc_id, enc or {}


def _walk_streams(template: dict) -> Iterator[tuple[str, str, str, dict, dict]]:
    """Yield (stream_path, encoding_id, stream_id, properties, full_node)."""
    for enc_id, enc in _walk_encodings(template):
        streams = enc.get("streams") or {}
        for stream_id, stream in streams.items():
            path = f"$/encodings/{enc_id}/streams/{stream_id}"
            node = stream or {}
            yield path, enc_id, stream_id, node.get("properties") or {}, node


def _walk_muxings(template: dict) -> Iterator[tuple[str, str, str, str, dict]]:
    """Yield (muxing_path, encoding_id, kind, muxing_id, properties)."""
    for enc_id, enc in _walk_encodings(template):
        muxings = enc.get("muxings") or {}
        for kind, by_id in muxings.items():
            if not isinstance(by_id, dict):
                continue
            for mid, mux in by_id.items():
                path = f"$/encodings/{enc_id}/muxings/{kind}/{mid}"
                yield path, enc_id, str(kind).lower(), mid, (mux or {}).get("properties") or {}


def _resolve_stream_codec(template: dict) -> dict[str, tuple[str, str, dict]]:
    """{stream_path: (kind, codec_type, codec_props)} for resolvable streams."""
    codecs = _build_codec_lookup(template)
    out: dict[str, tuple[str, str, dict]] = {}
    for sp, _, _, sprops, _ in _walk_streams(template):
        ccid = sprops.get("codecConfigId")
        if ccid in codecs:
            out[sp] = codecs[ccid]
    return out


_VIDEO_CODECS = {"h264", "h265", "av1", "vp8", "vp9", "mpeg2"}
_LIVE_ALLOWED_ENCODING_MODES = {"STANDARD", "SINGLE_PASS", "TWO_PASS"}


def _is_live_encoding(enc: dict) -> bool:
    """True if the encoding has a `live.start` block (template-level signal
    that this is a live encoding regardless of `metadata.type` upstream)."""
    return bool((enc.get("live") or {}).get("start"))


# ─── Checks ───────────────────────────────────────────────────────────────


def check_codec_av1_min_bitrate(template: dict) -> list[Violation]:
    """codec.av1.min_bitrate — live has no per-title carve-out."""
    out = []
    for cpath, _, ctype, props in _walk_codec_configs(template):
        if ctype != "av1":
            continue
        br = props.get("bitrate")
        if br is None:
            out.append(Violation(
                "codec.av1.min_bitrate", cpath,
                "AV1 video config has no bitrate set; required >= 10000",
            ))
        elif br < 10000:
            out.append(Violation(
                "codec.av1.min_bitrate", cpath,
                f"AV1 bitrate {br} < 10000",
            ))
    return out


def check_muxing_fmp4_exactly_one_stream(template: dict) -> list[Violation]:
    """muxing.fmp4.exactly_one_stream"""
    out = []
    for mpath, _, kind, _, props in _walk_muxings(template):
        if kind != "fmp4":
            continue
        n = len(props.get("streams") or [])
        if n != 1:
            out.append(Violation(
                "muxing.fmp4.exactly_one_stream", mpath,
                f"fMP4 muxing has {n} streams; must be exactly 1",
            ))
    return out


def check_muxing_fmp4_pts_align_mode_codec(template: dict) -> list[Violation]:
    """muxing.fmp4.pts_align_mode_codec"""
    out = []
    stream_codec = _resolve_stream_codec(template)
    for mpath, _, kind, _, props in _walk_muxings(template):
        if kind != "fmp4":
            continue
        if props.get("ptsAlignMode") != "ALIGN_ZERO_NEGATIVE_CTO":
            continue
        for s in props.get("streams") or []:
            spath = s.get("streamId")
            entry = stream_codec.get(spath)
            if entry is None:
                continue
            kind_resolved, ctype, _ = entry
            if kind_resolved != "video":
                continue
            if ctype not in {"h264", "h265"}:
                out.append(Violation(
                    "muxing.fmp4.pts_align_mode_codec", mpath,
                    f"PTSAlignMode=ALIGN_ZERO_NEGATIVE_CTO requires H.264 or "
                    f"H.265; stream {spath} uses {ctype.upper()}",
                ))
    return out


def check_encoding_mode_live_subset(template: dict) -> list[Violation]:
    """encoding_mode.live_subset — live can't use THREE_PASS, etc."""
    out = []
    for enc_id, enc in _walk_encodings(template):
        if not _is_live_encoding(enc):
            continue
        # Mode can be set on live.start.liveEncodingMode, on
        # live.start.encodingMode, or on individual codec configs. Check all.
        live_props = (enc.get("live", {}).get("start") or {}).get("properties") or {}
        for field in ("liveEncodingMode", "encodingMode"):
            mode = live_props.get(field)
            if mode and mode not in _LIVE_ALLOWED_ENCODING_MODES:
                out.append(Violation(
                    "encoding_mode.live_subset",
                    f"$/encodings/{enc_id}/live/start/properties/{field}",
                    f"live encodings only support {sorted(_LIVE_ALLOWED_ENCODING_MODES)}; "
                    f"got {mode!r}",
                ))
        # Codec-level encodingMode
        for cpath, _, _, cprops in _walk_codec_configs(template):
            cmode = cprops.get("encodingMode")
            if cmode and cmode not in _LIVE_ALLOWED_ENCODING_MODES:
                # Only fires if this codec config is referenced by a stream
                # in this live encoding — keep the check simple and report
                # once per codec config; the rule still applies regardless.
                out.append(Violation(
                    "encoding_mode.live_subset", cpath,
                    f"codec config encodingMode={cmode!r} not allowed in live "
                    f"encodings (allowed: {sorted(_LIVE_ALLOWED_ENCODING_MODES)})",
                ))
    return out


def check_encoding_mode_no_request_codec_conflict(template: dict) -> list[Violation]:
    """encoding_mode.no_request_codec_conflict (live: live.start vs codec)."""
    out = []
    for enc_id, enc in _walk_encodings(template):
        live_props = (enc.get("live", {}).get("start") or {}).get("properties") or {}
        global_mode = live_props.get("encodingMode") or live_props.get("liveEncodingMode")
        if global_mode is None:
            continue
        for cpath, _, _, props in _walk_codec_configs(template):
            if "encodingMode" in props:
                out.append(Violation(
                    "encoding_mode.no_request_codec_conflict", cpath,
                    f"encodingMode set on both live.start "
                    f"(encoding {enc_id}: {global_mode!r}) and codec config "
                    f"({props['encodingMode']!r}); pick one",
                ))
    return out


def check_encoding_mode_all_video_streams_match(template: dict) -> list[Violation]:
    """encoding_mode.all_video_streams_match"""
    out = []
    stream_codec = _resolve_stream_codec(template)
    for enc_id, enc in _walk_encodings(template):
        live_props = (enc.get("live", {}).get("start") or {}).get("properties") or {}
        global_mode = live_props.get("encodingMode") or live_props.get("liveEncodingMode")
        modes: set[Any] = set()
        for sp, sid_enc, _, _sprops, _node in _walk_streams(template):
            if sid_enc != enc_id:
                continue
            entry = stream_codec.get(sp)
            if entry is None:
                continue
            kind, ctype, cprops = entry
            if kind != "video" or ctype not in _VIDEO_CODECS:
                continue
            modes.add(cprops.get("encodingMode") or global_mode)
        if len(modes) > 1:
            out.append(Violation(
                "encoding_mode.all_video_streams_match", f"$/encodings/{enc_id}",
                f"video streams have differing encoding modes: "
                f"{sorted(repr(m) for m in modes)}",
            ))
    return out


def check_live_rtmp_input_type(template: dict) -> list[Violation]:
    """live.rtmp_input_type — the Bitmovin API silently drops `inputs.rtmp`
    (uppercase or lowercase) because that input type is read-only and not
    creatable from a Templates submission. Authors must use
    `inputs.redundantRtmp` even for a single ingest.
    """
    out = []
    inputs = template.get("inputs") or {}
    if not isinstance(inputs, dict):
        return out
    for key in inputs.keys():
        if str(key).lower() == "rtmp":
            out.append(Violation(
                "live.rtmp_input_type", f"$/inputs/{key}",
                "no `inputs.rtmp` input type — use `inputs.redundantRtmp` "
                "with one or two staticIngestPoints; the API silently drops "
                "this section, leaving the encoding stuck at type=NONE",
            ))
    return out


def check_live_stream_key_assignment(template: dict) -> list[Violation]:
    """live.stream_key_assignment — `streamKeyConfiguration.streamKeyId`
    must be a concrete UUID, not a `$/...` template reference. The
    Templates API does not resolve forward refs to inline
    `live.streamKeys.<id>` declarations.
    """
    out = []
    inputs = template.get("inputs") or {}
    redundant = inputs.get("redundantRtmp") or {}
    if not isinstance(redundant, dict):
        return out
    for input_id, input_def in redundant.items():
        if not isinstance(input_def, dict):
            continue
        props = input_def.get("properties") or {}
        for idx, point in enumerate(props.get("staticIngestPoints") or []):
            if not isinstance(point, dict):
                continue
            cfg = point.get("streamKeyConfiguration") or {}
            if cfg.get("type") != "ASSIGN":
                continue
            ref = cfg.get("streamKeyId")
            if isinstance(ref, str) and ref.startswith("$/"):
                out.append(Violation(
                    "live.stream_key_assignment",
                    f"$/inputs/redundantRtmp/{input_id}/staticIngestPoints[{idx}]",
                    f"streamKeyId={ref!r} is a template reference; Templates API "
                    "does not resolve `$/...` for streamKeyId. Pre-create the "
                    "stream key via POST /encoding/live/stream-keys and pass "
                    "the concrete UUID instead.",
                ))
    return out


# NOTE: rulebook v0.1's live.srt_listener_port_range and
# live.srt_passphrase_length checks were dropped during the v0.2
# verification pass — neither rule is enforced as an API pre-submit
# check. Both appear to be infrastructure / SRT-runtime constraints, not
# API-time validations. The prebaked SRT prompts in SKILL.md still gate
# users to the working envelope; the rulebook keeps notes about them.
# Don't add false-positive checks back without a matching pre-submit
# rejection observed against the API.


# ─── Registry & entry point ───────────────────────────────────────────────


RULES: list[Callable[[dict], list[Violation]]] = [
    check_codec_av1_min_bitrate,
    check_muxing_fmp4_exactly_one_stream,
    check_muxing_fmp4_pts_align_mode_codec,
    check_encoding_mode_live_subset,
    check_encoding_mode_no_request_codec_conflict,
    check_encoding_mode_all_video_streams_match,
    check_live_rtmp_input_type,
    check_live_stream_key_assignment,
]


def run_all(template: dict) -> list[Violation]:
    """Run every check against `template` and return aggregated violations."""
    return [v for f in RULES for v in f(template)]


def _main(argv: list[str]) -> int:
    import argparse

    parser = argparse.ArgumentParser(
        description=(
            "Run cross-field rule checks against a parsed Live Encoding "
            "Template. Reads a YAML template from stdin or a file path."
        ),
    )
    parser.add_argument(
        "template",
        nargs="?",
        help="Path to a rendered template YAML. If omitted, reads from stdin.",
    )
    args = parser.parse_args(argv)

    import yaml  # local import: keep --help fast

    if args.template:
        with open(args.template) as f:
            body = yaml.safe_load(f)
    else:
        body = yaml.safe_load(sys.stdin.read())

    if not isinstance(body, dict):
        print("error: template did not parse to a YAML mapping", file=sys.stderr)
        return 2

    violations = run_all(body)
    if not violations:
        print("ok: 0 violations.", file=sys.stderr)
        return 0
    for v in violations:
        print(str(v))
    print(f"\n{len(violations)} violation(s).", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(_main(sys.argv[1:]))
