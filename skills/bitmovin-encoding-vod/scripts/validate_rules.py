#!/usr/bin/env python3
"""Deterministic cross-field rule checks for a parsed Encoding Template dict.

Mirrors a subset of the Bitmovin server-side validators that fire at
template-submission time. The Bitmovin CLI's `templates validate` already
catches structural / schema errors; this catches semantic errors the schema
cannot express (e.g. "fMP4 muxings must hold exactly one stream").

Each check carries the rule_id from references/rulebook.yaml. When you
change a rule, update both files together.

Run between `bitmovin encoding templates validate` and
`bitmovin encoding templates start`:

    python validate_rules.py path/to/template.yaml
    cat template.yaml | python validate_rules.py

Out of scope for this version:
    - Live-only rules (the skill is VOD).
    - Hardware-encoding rules — need a way to detect HW-accelerated codec
      configs from the template alone, which the rulebook doesn't yet pin
      down.
    - Encoder-version-gated rules — we don't resolve `encoderVersion`
      against the active feature-flag set at validation time.
    - Cross-stream per-title bitrate-gap rules — need stream sorting by
      pixel count plus minBitrateStepSize lookup; mechanical but not v1.
    - Cross-stream Dolby Vision rules (no_mixed_dv_and_non_dv_outputs,
      no_mixed_dynamic_ranges, single_crop_filter) — same complexity class.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from typing import Any, Callable, Iterable, Iterator


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
    """Yield (stream_path, encoding_id, stream_id, properties, full_node).

    full_node is the whole stream entry so callers can reach sub-resources
    like `thumbnails:` and `sprites:` that sit alongside `properties:`.
    """
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
_DV_PROFILE_DYNAMIC_RANGES = {"DOLBY_VISION", "DOLBY_VISION_PROFILE_5", "DOLBY_VISION_PROFILE_8_1"}
_PER_TITLE_TEMPLATE_MODES = {
    "PER_TITLE_TEMPLATE",
    "PER_TITLE_TEMPLATE_FIXED_RESOLUTION",
    "PER_TITLE_TEMPLATE_COMPLEXITY_RANGE",
}


def _codec_has_non_per_title_consumer(template: dict, codec_path: str) -> bool:
    """True if any stream that references this codec config is NOT in a
    per-title-template mode. Per-title-template streams skip per-codec
    validators (the per-title carve-out is enforced at the encoding level,
    where the validator can see whether the encoding is per-title)."""
    seen = False
    for _, _, _, sprops, _ in _walk_streams(template):
        if sprops.get("codecConfigId") != codec_path:
            continue
        seen = True
        if sprops.get("mode") not in _PER_TITLE_TEMPLATE_MODES:
            return True
    # If no stream references the codec at all, default to applying the rule
    # (the codec config might still be validated when the resource is created).
    return not seen


def _is_dolby_vision_codec_config(props: dict) -> bool:
    """Heuristic: codec config carries a Dolby Vision dynamic range marker.

    Templates set `h265DynamicRange` (or similar) on the codec properties.
    Conservative: only return True when we see a DV-flavored enum value, so
    we never flag a non-DV config as DV.
    """
    dr = props.get("h265DynamicRange") or props.get("dynamicRange")
    return isinstance(dr, str) and dr.upper() in _DV_PROFILE_DYNAMIC_RANGES


# ─── Checks ───────────────────────────────────────────────────────────────


def check_codec_av1_min_bitrate(template: dict) -> list[Violation]:
    """codec.av1.min_bitrate (skipped for per-title-only codec configs)."""
    out = []
    for cpath, _, ctype, props in _walk_codec_configs(template):
        if ctype != "av1":
            continue
        if not _codec_has_non_per_title_consumer(template, cpath):
            continue  # per-title computes bitrate; rule does not apply
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


def check_muxing_mp4_fragmented_av1_manifest_type(template: dict) -> list[Violation]:
    """muxing.mp4_fragmented.av1_manifest_type"""
    out = []
    stream_codec = _resolve_stream_codec(template)
    allowed = {"DASH_ON_DEMAND", "NONE"}
    for mpath, _, kind, _, props in _walk_muxings(template):
        if kind != "mp4":
            continue
        if props.get("fragmentDuration") is None:
            continue
        mtype = props.get("fragmentedMP4MuxingManifestType")
        if mtype is not None and mtype in allowed:
            continue
        # Either mtype is None (implicit; the API still rejects AV1 here), or
        # it's a manifest type other than DASH_ON_DEMAND/NONE — both reject AV1.
        for s in props.get("streams") or []:
            spath = s.get("streamId")
            entry = stream_codec.get(spath)
            if entry is None:
                continue
            _, ctype, _ = entry
            if ctype != "av1":
                continue
            mtype_repr = repr(mtype) if mtype is not None else "<unset>"
            out.append(Violation(
                "muxing.mp4_fragmented.av1_manifest_type", mpath,
                f"AV1 stream {spath} in fragmented MP4 muxing requires "
                f"fragmentedMP4MuxingManifestType DASH_ON_DEMAND or NONE; "
                f"got {mtype_repr}",
            ))
    return out


def check_encoding_mode_no_request_codec_conflict(template: dict) -> list[Violation]:
    """encoding_mode.no_request_codec_conflict"""
    out = []
    for enc_id, enc in _walk_encodings(template):
        global_mode = ((enc.get("start") or {}).get("properties") or {}).get("encodingMode")
        if global_mode is None:
            continue
        for cpath, _, _, props in _walk_codec_configs(template):
            if "encodingMode" in props:
                out.append(Violation(
                    "encoding_mode.no_request_codec_conflict", cpath,
                    f"encodingMode set on both start request "
                    f"(encoding {enc_id}: {global_mode!r}) and codec config "
                    f"({props['encodingMode']!r}); pick one",
                ))
    return out


def check_encoding_mode_all_video_streams_match(template: dict) -> list[Violation]:
    """encoding_mode.all_video_streams_match"""
    out = []
    stream_codec = _resolve_stream_codec(template)
    for enc_id, enc in _walk_encodings(template):
        global_mode = ((enc.get("start") or {}).get("properties") or {}).get("encodingMode")
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


def _per_title_codec_config(start_props: dict, codec_type: str) -> dict | None:
    """Return per-title.<codec>Configuration for the given codec_type, or None."""
    pt = start_props.get("perTitle") or {}
    return pt.get(f"{codec_type}Configuration")


def check_per_title_fixed_resolution_max_bitrate(template: dict) -> list[Violation]:
    """per_title.fixed_resolution_max_bitrate"""
    out = []
    stream_codec = _resolve_stream_codec(template)
    for enc_id, enc in _walk_encodings(template):
        start_props = (enc.get("start") or {}).get("properties") or {}
        for sp, sid_enc, _, sprops, _ in _walk_streams(template):
            if sid_enc != enc_id:
                continue
            if sprops.get("mode") != "PER_TITLE_TEMPLATE_FIXED_RESOLUTION":
                continue
            entry = stream_codec.get(sp)
            if entry is None:
                continue
            _, ctype, _ = entry
            pt_cfg = _per_title_codec_config(start_props, ctype) or {}
            pt_max = pt_cfg.get("maxBitrate")
            if pt_max is None:
                continue
            stream_max = ((sprops.get("perTitleSettings") or {})
                          .get("fixedResolutionAndBitrateSettings") or {}).get("maxBitrate")
            if stream_max is None:
                continue
            if stream_max > pt_max:
                out.append(Violation(
                    "per_title.fixed_resolution_max_bitrate", sp,
                    f"fixed-resolution stream maxBitrate {stream_max} exceeds "
                    f"per-title {ctype}Configuration.maxBitrate {pt_max}",
                ))
    return out


def check_per_title_fixed_resolution_min_bitrate(template: dict) -> list[Violation]:
    """per_title.fixed_resolution_min_bitrate"""
    out = []
    stream_codec = _resolve_stream_codec(template)
    for enc_id, enc in _walk_encodings(template):
        start_props = (enc.get("start") or {}).get("properties") or {}
        for sp, sid_enc, _, sprops, _ in _walk_streams(template):
            if sid_enc != enc_id:
                continue
            if sprops.get("mode") != "PER_TITLE_TEMPLATE_FIXED_RESOLUTION":
                continue
            entry = stream_codec.get(sp)
            if entry is None:
                continue
            _, ctype, _ = entry
            pt_cfg = _per_title_codec_config(start_props, ctype) or {}
            pt_min = pt_cfg.get("minBitrate")
            if pt_min is None:
                continue
            stream_min = ((sprops.get("perTitleSettings") or {})
                          .get("fixedResolutionAndBitrateSettings") or {}).get("minBitrate")
            if stream_min is None:
                continue
            if stream_min < pt_min:
                out.append(Violation(
                    "per_title.fixed_resolution_min_bitrate", sp,
                    f"fixed-resolution stream minBitrate {stream_min} is below "
                    f"per-title {ctype}Configuration.minBitrate {pt_min}",
                ))
    return out


# ─── Sprite ───────────────────────────────────────────────────────────────


def _walk_sprites(template: dict) -> Iterator[tuple[str, dict]]:
    """Yield (sprite_path, properties) for sprites attached to streams."""
    for sp, _, _, _, node in _walk_streams(template):
        sprites = node.get("sprites") or {}
        if not isinstance(sprites, dict):
            continue
        for spr_id, spr in sprites.items():
            if not isinstance(spr, dict):
                continue
            yield f"{sp}/sprites/{spr_id}", spr.get("properties") or {}


_IMG_EXT_VALID = (".jpg", ".jpeg", ".png")


def _ext_lower(name: str | None) -> str | None:
    if not isinstance(name, str):
        return None
    idx = name.rfind(".")
    return name[idx:].lower() if idx >= 0 else None


def check_sprite_tiles_paired(template: dict) -> list[Violation]:
    """sprite.tiles_paired"""
    out = []
    for path, props in _walk_sprites(template):
        h, v = props.get("hTiles"), props.get("vTiles")
        if (h is None) != (v is None):
            out.append(Violation(
                "sprite.tiles_paired", path,
                f"hTiles and vTiles must be set together (got hTiles={h}, vTiles={v})",
            ))
    return out


def check_sprite_aspect_mode_dimensions(template: dict) -> list[Violation]:
    """sprite.aspect_mode_dimensions"""
    out = []
    for path, props in _walk_sprites(template):
        if props.get("aspectMode") is None:
            continue
        if props.get("width") is None or props.get("height") is None:
            out.append(Violation(
                "sprite.aspect_mode_dimensions", path,
                "aspectMode is set; both width and height must be specified",
            ))
    return out


def check_sprite_file_extension(template: dict) -> list[Violation]:
    """sprite.file_extension"""
    out = []
    for path, props in _walk_sprites(template):
        name = props.get("spriteName")
        ext = _ext_lower(name)
        if name is None:
            continue
        if ext not in _IMG_EXT_VALID:
            out.append(Violation(
                "sprite.file_extension", path,
                f"spriteName {name!r} must end in .jpg, .jpeg, or .png",
            ))
    return out


def check_sprite_jpeg_config_jpg_only(template: dict) -> list[Violation]:
    """sprite.jpeg_config_jpg_only"""
    out = []
    for path, props in _walk_sprites(template):
        if props.get("jpegConfig") is None:
            continue
        ext = _ext_lower(props.get("spriteName"))
        if ext == ".png":
            out.append(Violation(
                "sprite.jpeg_config_jpg_only", path,
                "jpegConfig is set on a PNG sprite; only valid for JPG/JPEG sprites",
            ))
    return out


def check_sprite_images_per_file_no_tiles(template: dict) -> list[Violation]:
    """sprite.images_per_file_no_tiles"""
    out = []
    for path, props in _walk_sprites(template):
        if props.get("imagesPerFile") is None:
            continue
        if props.get("hTiles") is not None and props.get("vTiles") is not None:
            out.append(Violation(
                "sprite.images_per_file_no_tiles", path,
                "imagesPerFile cannot be set when both hTiles and vTiles are defined",
            ))
    return out


# ─── Thumbnail ────────────────────────────────────────────────────────────


def _walk_thumbnails(template: dict) -> Iterator[tuple[str, dict]]:
    for sp, _, _, _, node in _walk_streams(template):
        thumbs = node.get("thumbnails") or {}
        if not isinstance(thumbs, dict):
            continue
        for thumb_id, thumb in thumbs.items():
            if not isinstance(thumb, dict):
                continue
            yield f"{sp}/thumbnails/{thumb_id}", thumb.get("properties") or {}


def check_thumbnail_position_or_interval(template: dict) -> list[Violation]:
    """thumbnail.position_or_interval"""
    out = []
    for path, props in _walk_thumbnails(template):
        positions = props.get("positions")
        interval = props.get("interval")
        has_positions = bool(positions)
        has_interval = interval is not None
        if has_positions and has_interval:
            out.append(Violation(
                "thumbnail.position_or_interval", path,
                "positions and interval are mutually exclusive; only one may be set",
            ))
    return out


def check_thumbnail_position_or_interval_required(template: dict) -> list[Violation]:
    """thumbnail.position_or_interval_required"""
    out = []
    for path, props in _walk_thumbnails(template):
        if not props.get("positions") and props.get("interval") is None:
            out.append(Violation(
                "thumbnail.position_or_interval_required", path,
                "either positions or interval must be specified",
            ))
    return out


def check_thumbnail_aspect_mode_dimensions(template: dict) -> list[Violation]:
    """thumbnail.aspect_mode_dimensions"""
    out = []
    for path, props in _walk_thumbnails(template):
        if props.get("aspectMode") is None:
            continue
        if props.get("width") is None or props.get("height") is None:
            out.append(Violation(
                "thumbnail.aspect_mode_dimensions", path,
                "aspectMode is set; both width and height must be specified",
            ))
    return out


def check_thumbnail_interval_min(template: dict) -> list[Violation]:
    """thumbnail.interval_min"""
    out = []
    for path, props in _walk_thumbnails(template):
        interval = props.get("interval")
        if isinstance(interval, (int, float)) and interval < 1.0:
            out.append(Violation(
                "thumbnail.interval_min", path,
                f"interval {interval} < 1.0",
            ))
    return out


def check_thumbnail_pattern_extension(template: dict) -> list[Violation]:
    """thumbnail.pattern_extension"""
    out = []
    for path, props in _walk_thumbnails(template):
        pattern = props.get("pattern")
        ext = _ext_lower(pattern)
        if pattern is None:
            continue
        if ext not in _IMG_EXT_VALID:
            out.append(Violation(
                "thumbnail.pattern_extension", path,
                f"pattern {pattern!r} must produce a .jpg, .jpeg, or .png file",
            ))
    return out


# ─── Dolby Vision ─────────────────────────────────────────────────────────


def check_dv_pixel_format(template: dict) -> list[Violation]:
    """dv.pixel_format"""
    out = []
    for cpath, _, _, props in _walk_codec_configs(template):
        if not _is_dolby_vision_codec_config(props):
            continue
        pf = props.get("pixelFormat")
        if pf is not None and str(pf).upper() != "YUV420P10LE":
            out.append(Violation(
                "dv.pixel_format", cpath,
                f"Dolby Vision codec config has pixelFormat {pf!r}; required YUV420P10LE",
            ))
    return out


def check_dv_bufsize_maxrate_required(template: dict) -> list[Violation]:
    """dv.bufsize_maxrate_required (skipped for per-title encodings)."""
    out = []
    # Determine per-title encodings (carve-out)
    per_title_encs = set()
    for enc_id, enc in _walk_encodings(template):
        if (enc.get("start") or {}).get("properties", {}).get("perTitle") is not None:
            per_title_encs.add(enc_id)
    # Map codec config path → set of encoding ids that reference it
    codec_to_encs: dict[str, set[str]] = {}
    for sp, enc_id, _, sprops, _ in _walk_streams(template):
        ccid = sprops.get("codecConfigId")
        if ccid:
            codec_to_encs.setdefault(ccid, set()).add(enc_id)
    for cpath, _, _, props in _walk_codec_configs(template):
        if not _is_dolby_vision_codec_config(props):
            continue
        # Carve out: skip if the only encodings referencing this codec are per-title
        refs = codec_to_encs.get(cpath, set())
        if refs and refs.issubset(per_title_encs):
            continue
        missing = [k for k in ("bufsize", "maxBitrate") if props.get(k) is None]
        # API field names: bufSize, maxRate (camel-cased)
        bufsize = props.get("bufSize") if "bufSize" in props else props.get("bufsize")
        maxrate = props.get("maxRate") if "maxRate" in props else props.get("maxRate")
        if bufsize is None or maxrate is None:
            out.append(Violation(
                "dv.bufsize_maxrate_required", cpath,
                f"Dolby Vision codec config requires bufSize and maxRate "
                f"(bufSize={bufsize!r}, maxRate={maxrate!r})",
            ))
    return out


def check_dv_single_config_per_stream(template: dict) -> list[Violation]:
    """dv.single_config_per_stream

    A stream references a single codecConfigId, so structurally there can
    only be one DV config per stream — but an unconventional template might
    smuggle multiple DV-related codec configs onto a stream via filters or
    extensions. We don't have a robust signal for that beyond the template
    schema's own checks, so this is a no-op until we see it in the wild.
    """
    return []


def check_dv_input_codec_allowlist(template: dict) -> list[Violation]:
    """dv.input_codec_allowlist

    Streams with a Dolby Vision input must use codec H.264 or H.265.
    Detection signal: stream's input is a Dolby Vision input. Templates
    typically express this with a `dolbyVisionMetadata` property on the
    inputStream entry; absent that, we cannot tell.
    """
    out = []
    stream_codec = _resolve_stream_codec(template)
    for sp, _, _, sprops, _ in _walk_streams(template):
        ins = sprops.get("inputStreams") or []
        looks_dv = any(
            isinstance(i, dict) and (
                i.get("dolbyVisionMetadata") is not None
                or (i.get("inputStreamType") or "").upper() == "DOLBY_VISION"
            )
            for i in ins
        )
        if not looks_dv:
            continue
        entry = stream_codec.get(sp)
        if entry is None:
            continue
        kind, ctype, _ = entry
        if kind != "video" or ctype not in {"h264", "h265"}:
            out.append(Violation(
                "dv.input_codec_allowlist", sp,
                f"Dolby Vision input requires H.264 or H.265 codec; got {ctype.upper()}",
            ))
    return out


_DV_AUDIO_ALLOWLIST = {"aac", "dolby_atmos", "dolbyatmos"}


def check_dv_muxing_audio_codec_allowlist(template: dict) -> list[Violation]:
    """dv.muxing_audio_codec_allowlist

    A muxing carrying any Dolby Vision video stream may only carry AAC or
    Dolby Atmos audio in addition.
    """
    out = []
    codec_lookup = _build_codec_lookup(template)
    stream_codec = _resolve_stream_codec(template)
    for mpath, _, _kind, _, props in _walk_muxings(template):
        mux_streams = props.get("streams") or []
        # Does this muxing carry any DV video?
        has_dv_video = False
        for s in mux_streams:
            sp = s.get("streamId")
            entry = stream_codec.get(sp)
            if entry is None:
                continue
            skind, _, sprops_codec = entry
            if skind == "video" and _is_dolby_vision_codec_config(sprops_codec):
                has_dv_video = True
                break
        if not has_dv_video:
            continue
        # Check audio streams in the same muxing
        for s in mux_streams:
            sp = s.get("streamId")
            entry = stream_codec.get(sp)
            if entry is None:
                continue
            akind, atype, _ = entry
            if akind != "audio":
                continue
            if atype not in _DV_AUDIO_ALLOWLIST:
                out.append(Violation(
                    "dv.muxing_audio_codec_allowlist", mpath,
                    f"muxing carries Dolby Vision video; audio stream {sp} "
                    f"uses {atype.upper()} but only AAC or Dolby Atmos is allowed",
                ))
    return out


def check_dv_crop_filter_dynamic_range(template: dict) -> list[Violation]:
    """dv.crop_filter_dynamic_range

    A crop filter on a stream is only allowed when the stream's codec config
    has H265DynamicRange in {DOLBY_VISION, DOLBY_VISION_PROFILE_5,
    DOLBY_VISION_PROFILE_8_1}.

    Note: the server-side validator gates crop filters on Dolby Vision
    presence. Crop filters on non-DV streams are allowed by other paths;
    this rule only fires when DV output is present elsewhere in the
    encoding. To stay conservative, this check only flags streams that
    have BOTH a crop filter AND a non-DV dynamic range, when the encoding
    contains any DV stream.
    """
    out = []
    stream_codec = _resolve_stream_codec(template)
    for enc_id, _ in _walk_encodings(template):
        # Does the encoding contain any DV stream?
        has_dv = False
        for sp, sid_enc, _, _, _ in _walk_streams(template):
            if sid_enc != enc_id:
                continue
            entry = stream_codec.get(sp)
            if entry is None:
                continue
            _, _, cprops = entry
            if _is_dolby_vision_codec_config(cprops):
                has_dv = True
                break
        if not has_dv:
            continue
        # Flag any stream with a crop filter that isn't itself DV-flagged
        for sp, sid_enc, _, sprops, _ in _walk_streams(template):
            if sid_enc != enc_id:
                continue
            filters = sprops.get("filters") or []
            has_crop = any(isinstance(f, dict) and f.get("type", "").upper() == "CROP" for f in filters)
            if not has_crop:
                continue
            entry = stream_codec.get(sp)
            if entry is None:
                continue
            _, _, cprops = entry
            if not _is_dolby_vision_codec_config(cprops):
                out.append(Violation(
                    "dv.crop_filter_dynamic_range", sp,
                    "crop filter requires H265DynamicRange in {DOLBY_VISION, "
                    "DOLBY_VISION_PROFILE_5, DOLBY_VISION_PROFILE_8_1}; this "
                    "stream's codec is not Dolby Vision",
                ))
    return out


def check_dv_per_title_factors_required(template: dict) -> list[Violation]:
    """dv.per_title_factors_required"""
    out = []
    stream_codec = _resolve_stream_codec(template)
    for enc_id, enc in _walk_encodings(template):
        start_props = (enc.get("start") or {}).get("properties") or {}
        if start_props.get("perTitle") is None:
            continue
        # Find DV codec configs referenced by this encoding's streams
        for sp, sid_enc, _, sprops, _ in _walk_streams(template):
            if sid_enc != enc_id:
                continue
            entry = stream_codec.get(sp)
            if entry is None:
                continue
            _, _, cprops = entry
            if not _is_dolby_vision_codec_config(cprops):
                continue
            missing = [
                k for k in ("codecBufsizeFactor", "codecMaxBitrateFactor")
                if cprops.get(k) is None
            ]
            if missing:
                # Path the violation against the codec config, not the stream
                ccid = sprops.get("codecConfigId") or sp
                out.append(Violation(
                    "dv.per_title_factors_required", ccid,
                    f"Dolby Vision per-title encoding requires {missing} on the codec config",
                ))
    return out


# ─── Registry & entry point ───────────────────────────────────────────────


RULES: list[Callable[[dict], list[Violation]]] = [
    check_codec_av1_min_bitrate,
    check_muxing_fmp4_exactly_one_stream,
    check_muxing_fmp4_pts_align_mode_codec,
    check_muxing_mp4_fragmented_av1_manifest_type,
    check_encoding_mode_no_request_codec_conflict,
    check_encoding_mode_all_video_streams_match,
    check_per_title_fixed_resolution_max_bitrate,
    check_per_title_fixed_resolution_min_bitrate,
    check_sprite_tiles_paired,
    check_sprite_aspect_mode_dimensions,
    check_sprite_file_extension,
    check_sprite_jpeg_config_jpg_only,
    check_sprite_images_per_file_no_tiles,
    check_thumbnail_position_or_interval,
    check_thumbnail_position_or_interval_required,
    check_thumbnail_aspect_mode_dimensions,
    check_thumbnail_interval_min,
    check_thumbnail_pattern_extension,
    check_dv_pixel_format,
    check_dv_bufsize_maxrate_required,
    check_dv_single_config_per_stream,
    check_dv_input_codec_allowlist,
    check_dv_muxing_audio_codec_allowlist,
    check_dv_crop_filter_dynamic_range,
    check_dv_per_title_factors_required,
]


def run_all(template: dict) -> list[Violation]:
    """Run every check against `template` and return aggregated violations."""
    return [v for f in RULES for v in f(template)]


def _main(argv: list[str]) -> int:
    import argparse

    parser = argparse.ArgumentParser(
        description=(
            "Run cross-field rule checks against a parsed Encoding Template. "
            "Reads a YAML template from stdin or a file path."
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
