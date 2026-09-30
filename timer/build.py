#!/usr/bin/env python3
"""Build the debate timer: builtin formats from the format library, then one inlined HTML.

Usage:
    python timer/build.py            # regenerate src/builtin-formats.js and debate-timer.html
    python timer/build.py --check    # fail if either generated file is stale

Only the standard library is used; the timer must build on a bare Windows Python.
"""
import argparse
import json
import re
import sys
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


class FormatError(Exception):
    pass


CN_DIGITS = {"零": 0, "一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10}
COLUMNS = {"序": "no", "环节": "name", "时长": "dur", "计时": "timing", "发言人": "speaker"}
NOTE_BOTH = "双边计时：问答共用这一个表"
NOTE_ONE = "单边计时：只计盘问方，对方回答时按 P 暂停"
NOTE_DUAL = "A 给正方、L 给反方；一方用完自动转给对方"
DEFAULT_BELLS = {"warn": [30], "countdown": 0, "end": "double"}


def cn_int(text):
    """Convert 一 / 两 / 十 / 十二 / 2 to an int (kept local so the build never needs the skill's helpers)."""
    text = text.strip()
    if text.isdigit():
        return int(text)
    if text in CN_DIGITS:
        return CN_DIGITS[text]
    if text.startswith("十") and len(text) == 2 and text[1] in CN_DIGITS:
        return 10 + CN_DIGITS[text[1]]
    raise ValueError(text)


def _cells(line):
    return [c.strip().replace("**", "") for c in line.strip().strip("|").split("|")]


def _table_rows(path, lines):
    """Return (header keys, [(line number, cells)]) of the first table under 「## 流程总表」."""
    start = next((i for i, l in enumerate(lines) if l.strip() == "## 流程总表"), None)
    if start is None:
        raise FormatError(f"{path.name}: 找不到「## 流程总表」")
    head = next((i for i in range(start + 1, len(lines)) if lines[i].lstrip().startswith("|")), None)
    if head is None:
        raise FormatError(f"{path.name}:{start + 1}: 「## 流程总表」下面没有表格")
    names = _cells(lines[head])
    keys = {}
    for want, key in COLUMNS.items():
        if want not in names:
            raise FormatError(f"{path.name}:{head + 1}: 流程总表缺少「{want}」列")
        keys[key] = names.index(want)
    keys["block"] = len(names) - 1
    rows = []
    i = head + 2  # skip the |---| separator
    while i < len(lines) and lines[i].lstrip().startswith("|"):
        rows.append((i + 1, _cells(lines[i])))
        i += 1
    return keys, rows


def _extra_group(path, no, name, dur):
    group = re.match(r"([^（(]+)", name).group(1).strip()
    per = re.search(r"每方([一二两三四五六七八九十\d]+)次", name)
    variants = []
    for seg in dur.split("/"):
        m = re.match(r"\s*(\S+?)\s*(\d+)\s*秒", seg)
        if not m:
            raise FormatError(f"{path.name}:{no}: 看不懂奇袭的时长「{seg.strip()}」")
        v = {"name": group + m.group(1), "type": "single", "secs": int(m.group(2))}
        if "双边" in seg:
            v["note"] = NOTE_BOTH
        variants.append(v)
    return {"group": group, "perSide": cn_int(per.group(1)) if per else 1, "variants": variants}


def parse_format(path):
    path = Path(path)
    text = path.read_text(encoding="utf-8")
    fid = path.stem
    title = re.search(r"^# 赛制：(.+)$", text, re.M)
    if not title:
        raise FormatError(f"{path.name}: 找不到「# 赛制：」标题")
    keys, rows = _table_rows(path, text.splitlines())
    stages, extras, breaks = [], [], 0
    for no, cells in rows:
        if len(cells) <= max(keys.values()):
            raise FormatError(f"{path.name}:{no}: 这一行的列数不够")
        get = {k: cells[i] for k, i in keys.items()}
        name, dur, timing = get["name"], get["dur"], get["timing"]
        if get["no"] == "—" and timing != "—":
            extras.append(_extra_group(path, no, name, dur))
            continue
        m = re.search(r"\d+", dur)
        if not m:
            raise FormatError(f"{path.name}:{no}: 时长「{dur}」里没有数字")
        stage = {"id": "", "name": name, "secs": int(m.group())}
        if timing == "—":
            stage["type"], stage["side"] = "break", None
        elif "各" in dur:
            stage["type"], stage["side"], stage["first"] = "dual", None, "pro"
        else:
            stage["type"] = "single"
            side = re.search(r"[正反]", name)
            stage["side"] = None if not side else ("pro" if side.group() == "正" else "con")
        if get["no"] == "—":
            breaks += 1
            stage["id"] = f"{fid}-b{breaks}"
        else:
            stage["id"] = f"{fid}-{get['no']}"
        if get["speaker"] != "—":
            stage["speaker"] = get["speaker"]
        if get["block"] != "—":
            stage["block"] = get["block"]
        if stage["type"] != "break":
            note = None
            if "双边计时" in timing:
                note = NOTE_BOTH
            elif stage["type"] == "single" and timing == "单边计时":
                note = NOTE_ONE
            elif stage["type"] == "dual":
                note = NOTE_DUAL
            if note:
                stage["note"] = note
        stages.append(stage)
    if not stages:
        raise FormatError(f"{path.name}: 流程总表里没有环节")
    return {"id": fid, "name": title.group(1).strip(), "builtin": True, "source": path.name,
            "theme": "hall", "bells": dict(DEFAULT_BELLS), "stages": stages, "extras": extras}


def parse_all(formats_dir):
    if not Path(formats_dir).is_dir():
        raise FormatError(f"找不到赛制目录：{formats_dir}")
    files = sorted(p for p in Path(formats_dir).glob("*.md") if not p.name.startswith("_"))
    if not files:
        raise FormatError(f"赛制目录里没有赛制文件（*.md）：{formats_dir}")
    return [parse_format(p) for p in files]


def builtin_js(formats):
    sources = ", ".join(f["source"] for f in formats)
    return ("/* Generated by timer/build.py from the debate-prep format library. Do not edit by hand. */\n"
            f"/* Sources: {sources} */\n"
            "(function (DT) {\n  'use strict';\n  "
            "DT.BUILTIN_FORMATS = " + json.dumps(formats, ensure_ascii=False, indent=2) + ";\n"
            "})(window.DT = window.DT || {});\n")


def main(argv=None):
    ap = argparse.ArgumentParser(description="Build the debate timer.")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--formats-dir", default=str(DEFAULT_FORMATS_DIR))
    args = ap.parse_args(argv)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    try:
        formats = parse_all(Path(args.formats_dir))
    except FormatError as e:
        print("赛制解析失败：", e)
        return 1
    outputs = {BUILTIN_JS: builtin_js(formats)}
    # Task 7 adds: outputs[OUT] = inline_html(...)
    stale = [p for p, text in outputs.items()
             if not p.exists() or p.read_text(encoding="utf-8") != text]
    if args.check:
        for p in stale:
            print(f"过期：{p.relative_to(HERE.parent)}。运行 python timer/build.py 重新生成")
        return 1 if stale else 0
    for p, text in outputs.items():
        p.write_text(text, encoding="utf-8", newline="\n")
        print("写入", p.relative_to(HERE.parent))
    return 0


if __name__ == "__main__":
    sys.exit(main())
