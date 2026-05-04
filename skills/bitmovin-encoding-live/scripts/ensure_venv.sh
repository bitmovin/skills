#!/usr/bin/env bash
# Print the path of a Python interpreter that has the skill's runtime +
# validation deps (bitmovin_api_sdk, yaml, jinja2, jsonschema) importable.
# `jsonschema` powers the local Encoding Template schema pre-flight, so this
# helper may install it into the dedicated venv even when the core runtime
# deps are already present in the user's `python3`.
#
# 1. If the user's `python3` already has them, print `python3`.
# 2. Otherwise, create / reuse a dedicated venv at
#    ~/.cache/bitmovin/bitmovin-encoding-live/.venv/ and `pip install` the
#    deps into it, then print the venv's python.
#
# Stdout = path to the Python interpreter. All progress goes to stderr so
# callers can capture stdout cleanly:
#
#     PYTHON=$("<skill>/scripts/ensure_venv.sh") || exit 1
#     "$PYTHON" -c '...'

set -euo pipefail

CACHE_ROOT="${BITMOVIN_LIVE_SKILL_CACHE:-$HOME/.cache/bitmovin/bitmovin-encoding-live}"
VENV_DIR="$CACHE_ROOT/.venv"
PROBE='import bitmovin_api_sdk, yaml, jinja2, jsonschema'
DEPS=(bitmovin-api-sdk pyyaml jinja2 jsonschema)

log() { printf '%s\n' "$*" >&2; }

# Try the system python first.
if command -v python3 >/dev/null 2>&1 && python3 -c "$PROBE" >/dev/null 2>&1; then
    command -v python3
    exit 0
fi

# Otherwise fall back to the dedicated venv.
log "system python3 is missing one of: ${DEPS[*]}"
log "preparing venv at $VENV_DIR ..."

if [[ ! -x "$VENV_DIR/bin/python" ]]; then
    if ! command -v python3 >/dev/null 2>&1; then
        log "error: python3 is not installed; cannot create a venv"
        exit 1
    fi
    mkdir -p "$CACHE_ROOT"
    python3 -m venv "$VENV_DIR" >&2
fi

VENV_PY="$VENV_DIR/bin/python"

if ! "$VENV_PY" -c "$PROBE" >/dev/null 2>&1; then
    log "installing ${DEPS[*]} into venv ..."
    "$VENV_PY" -m pip install --quiet --upgrade pip >&2
    "$VENV_PY" -m pip install --quiet "${DEPS[@]}" >&2
fi

# Confirm everything imports; bail out loudly if not.
if ! "$VENV_PY" -c "$PROBE" >/dev/null 2>&1; then
    log "error: deps still not importable from $VENV_PY"
    exit 1
fi

printf '%s\n' "$VENV_PY"
