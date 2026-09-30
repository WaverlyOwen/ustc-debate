#!/usr/bin/env python3
"""Build the debate timer: builtin formats from the format library, then one inlined HTML.

Usage:
    python timer/build.py            # regenerate src/builtin-formats.js and debate-timer.html
    python timer/build.py --check    # fail if either generated file is stale

Only the standard library is used; the timer must build on a bare Windows Python.
"""
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = HERE / "src"
OUT = HERE / "debate-timer.html"
BUILTIN_JS = SRC / "builtin-formats.js"
DEFAULT_FORMATS_DIR = HERE.parent / ".claude" / "skills" / "debate-prep" / "references" / "formats"

# The one source of truth for script order: src/index.html, the test page and the build follow it.
ORDER = [
    "builtin-formats.js", "engine.js", "store.js", "bells.js", "render.js",
    "setup.js", "editor.js", "sync.js", "demo.js", "ui.js",
]
STYLES = ["styles/base.css", "styles/stage.css", "styles/console.css", "styles/editor.css"]


def script_files(existing_only=True):
    paths = [SRC / name for name in ORDER]
    return [p for p in paths if p.exists()] if existing_only else paths


def style_files(existing_only=True):
    paths = [SRC / name for name in STYLES] + sorted((SRC / "themes").glob("*.css"))
    return [p for p in paths if p.exists()] if existing_only else paths
