#!/usr/bin/env python3
"""Build the Pages site and the standalone, offline debate timer.

Usage:
    python timer/build.py                    # build both targets
    python timer/build.py --target web       # timer/dist/pages/
    python timer/build.py --target offline   # timer/ustc-debate-timer.html
    python timer/build.py --check            # check both targets without writing

Only the standard library is used; the timer must build on a bare Windows Python.
"""
import argparse
import base64
import hashlib
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = HERE / "src"
OUT = HERE / "ustc-debate-timer.html"
WEB = HERE / "web"
PAGES = HERE / "dist" / "pages"
BUILTIN_JS = SRC / "builtin-formats.js"
DEFAULT_FORMATS_DIR = HERE.parent / ".claude" / "skills" / "debate-prep" / "references" / "formats"

# The one source of truth for script order: src/index.html, the test page and the build follow it.
# themes/*.js go in right after render.js, which holds the registry they register with.
ORDER = [
    "builtin-formats.js", "engine.js", "store.js", "preset.js", "bells.js", "vendor/sumi-ink-0.14.0.js", "render.js",
    "setup.js", "editor.js", "sync.js", "demo.js", "ui.js",
]
STYLES = ["styles/base.css", "styles/stage.css", "styles/console.css", "styles/editor.css"]


def theme_scripts():
    """themes/*.js by name; each must have its themes/<id>.css, which carries the theme's metadata."""
    out = sorted((SRC / "themes").glob("*.js"))
    for p in out:
        if not p.with_suffix(".css").exists():
            raise FormatError(f"themes/{p.name}: 找不到同名的 themes/{p.stem}.css（主题必须有样式文件）")
    return out


def script_files():
    """Every script in ORDER, on disk or not: a missing one is a mistake to report, not a file to skip."""
    out = []
    for name in ORDER:
        out.append(SRC / name)
        if name == "render.js":
            out += theme_scripts()
    return out


def style_files():
    return [SRC / name for name in STYLES] + sorted((SRC / "themes").glob("*.css"))


class FormatError(Exception):
    pass


CN_DIGITS = {"零": 0, "一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10}
COLUMNS = {"序": "no", "环节": "name", "时长": "dur", "计时": "timing", "发言人": "speaker"}
NOTE_BOTH = "双边计时：问答共用这一个表"
NOTE_ONE = "单边计时：只计盘问方，对方回答时按 P 暂停"
NOTE_DUAL = "A 给正方、L 给反方；一方用完自动转给对方"
# Must match DEFAULT_BELLS in src/engine.js (test_build.py checks it): 30 s, 5 s, 3-2-1, the end bell, every second over.
DEFAULT_BELLS = {"warn": [30, 5], "countdown": 3, "end": "double", "overtime": "tick"}


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
    keys["block"] = next((i for i, name in enumerate(names) if name in ("打分块", "段")), len(names) - 1)
    for label, key in (("计时员提示", "note"), ("插入后间隔", "after")):
        if label in names:
            keys[key] = names.index(label)
    rows = []
    i = head + 2  # skip the |---| separator
    while i < len(lines) and lines[i].lstrip().startswith("|"):
        rows.append((i + 1, _cells(lines[i])))
        i += 1
    return keys, rows


def _extra_group(path, no, name, dur, after):
    group = re.match(r"([^（(]+)", name).group(1).strip()
    per = re.search(r"每方([一二两三四五六七八九十\d]+)次", name)
    variants = []
    for seg in dur.split("/"):
        m = re.match(r"\s*(\S+?)\s*(\d+)\s*秒", seg)
        if not m:
            raise FormatError(f"{path.name}:{no}: 看不懂奇袭的时长「{seg.strip()}」")
        v = {"name": group + m.group(1), "type": "single", "secs": int(m.group(2))}
        note = re.search(r"（(.+)）\s*$", seg)
        if note:
            v["note"] = note.group(1)
        elif "双边" in seg:
            v["note"] = NOTE_BOTH
        variants.append(v)
    following_break = None
    if after and after != "—":
        timing = re.fullmatch(r"(.+?)\s+([1-9]\d*)\s*秒", after)
        if not timing:
            raise FormatError(f"{path.name}:{no}: 插入后间隔应写成「名称 30 秒」，实际为「{after}」")
        following_break = {"name": timing.group(1), "secs": int(timing.group(2))}
    return {"group": group, "perSide": cn_int(per.group(1)) if per else 1, "where": "break", "after": following_break,
            "variants": variants}


def _judges_break(stages):
    """What follows an inserted stage: the format's own first 评委打分 break (its name and length), or None."""
    judges = next((s for s in stages if s["type"] == "break" and "评委打分" in s["name"]), None)
    return {"name": judges["name"], "secs": judges["secs"]} if judges else None


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
            extras.append(_extra_group(path, no, name, dur, get.get("after")))
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
        if get.get("note") and get["note"] != "—":
            stage["note"] = get["note"]
        stages.append(stage)
    if not stages:
        raise FormatError(f"{path.name}: 流程总表里没有环节")
    for g in extras:
        if g["after"] is None:
            g["after"] = _judges_break(stages)
    return {"id": fid, "name": title.group(1).strip(), "builtin": True, "source": path.name,
            "theme": "hall", "bells": {**DEFAULT_BELLS, "warn": list(DEFAULT_BELLS["warn"])},
            "stages": stages, "extras": extras}


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


THEME_LINE = re.compile(r"/\*\s*@theme\s+(.*?)\s*\*/")
THEME_FIELD = re.compile(r"(\w+)=(.*?)(?=\s+\w+=|$)")


def themes_meta():
    """Read each theme's first line, /* @theme id=… name=… desc=… tone=… order=… */, into [{id, name, desc, tone}].

    The list is in the order the setup page's grid shows the themes: by each header's order= (a whole number; the
    grid groups the themes by purpose), then by file name; a theme without one goes after those that have one."""
    out = []
    for p in sorted((SRC / "themes").glob("*.css")):
        lines = p.read_text(encoding="utf-8").splitlines()
        m = THEME_LINE.fullmatch(lines[0].strip()) if lines else None
        fields = dict(THEME_FIELD.findall(m.group(1))) if m else {}
        if not all(fields.get(k) for k in ("id", "name", "desc")):
            raise FormatError(f"themes/{p.name}:1: 第一行要写成 /* @theme id=… name=… desc=… tone=… order=… */")
        if fields.get("tone") not in ("dark", "light"):
            raise FormatError(f"themes/{p.name}:1: tone 要写 dark 或 light（主题是深底还是浅底）")
        order = fields.get("order")
        if order is not None and not re.fullmatch(r"\d+", order):
            raise FormatError(f"themes/{p.name}:1: order 要写一个整数（主题在开赛页网格里的位置），现在是「{order}」")
        out.append((int(order) if order is not None else float("inf"), {k: fields[k] for k in ("id", "name", "desc", "tone")}))
    return [meta for _, meta in sorted(out, key=lambda x: x[0])]


def _script_text(path, formats):
    if path == BUILTIN_JS:
        return builtin_js(formats)  # from the parsed formats, not the disk copy, so --check sees one truth
    return _source_text(path)


def _source_text(path):
    if not path.exists():
        raise FormatError(f"src/{path.relative_to(SRC).as_posix()}: 找不到（build.py 的列表里有它）")
    return path.read_text(encoding="utf-8")


def _themes_js():
    meta = json.dumps(themes_meta(), ensure_ascii=False).replace("</", "<\\/")
    return "window.DT = window.DT || {};\nDT.THEMES = " + meta + ";\n"


def _page(banner, head, body):
    """The HTML shell shared by the development, Pages and offline entries."""
    return ("<!doctype html>\n" + banner +
            '<html lang="zh-CN">\n<head>\n  <meta charset="utf-8">\n'
            '  <meta name="viewport" content="width=device-width, initial-scale=1">\n'
            "  <title>辩论计时器</title>\n" + head + "</head>\n"
            '<body data-dt-autoboot>\n  <div id="app"></div>\n' + body + "</body>\n</html>\n")


def dev_index_html():
    """src/index.html: the development shell, every stylesheet and script linked in build order."""
    def rel(p):
        return p.relative_to(SRC).as_posix()
    head = "".join(f'  <link rel="stylesheet" href="{rel(p)}">\n' for p in style_files())
    body = f"  <script>\n{_themes_js()}</script>\n"
    body += "".join(f'  <script src="{rel(p)}"></script>\n' for p in script_files())
    return _page("<!-- generated by timer/build.py from its STYLES and ORDER; do not edit by hand. -->\n", head, body)


def core_assets(formats):
    css = "".join(f"/* === {p.relative_to(SRC).as_posix()} === */\n{_source_text(p)}\n"
                  for p in style_files())
    js = _themes_js()
    js += "".join(f"/* === {p.relative_to(SRC).as_posix()} === */\n{_script_text(p, formats)}\n"
                  for p in script_files())
    js = re.sub(r"</script", r"<\/script", js, flags=re.I)
    return css, js


def inline_html(formats):
    """The single-file timer: every stylesheet and script inlined, in STYLES and ORDER."""
    sources = ", ".join(f["source"] for f in formats)
    banner = ("<!-- 由 timer/build.py 生成。改源码请改 timer/src/，改完运行 python timer/build.py。"
              f"赛制来源：{sources} -->\n")
    css, js = core_assets(formats)
    # The main script is tagged so a page can find its own source (the match export reads it back).
    # Both are tagged so an export (preset.js) copies exactly these, whatever else ends up in the page.
    return _page(banner, f'<style id="dt-style">\n{css}</style>\n', f'<script id="dt-main">\n{js}</script>\n')


def embedded_modules(entry):
    """Collect relative ES module imports into a self-contained import map for file://."""
    imports = {}

    def visit(path):
        path = path.resolve()
        name = "expedition/" + path.relative_to(WEB).as_posix()
        if name not in imports:
            imports[name] = ""
            source = path.read_text(encoding="utf-8")
            source = re.sub(r"""^(import\s+[^\n;]+\s+from\s+)['"](\.[^'"]+)['"]""",
                            lambda m: m[1] + json.dumps(visit(path.parent / m[2])), source, flags=re.M)
            imports[name] = "data:text/javascript;base64," + base64.b64encode(source.encode()).decode("ascii")
        return name

    return visit(entry), imports


def web_outputs(formats):
    css, js = core_assets(formats)
    entry = WEB / "main.js"
    if not entry.is_file():
        raise FormatError("找不到线上入口 web/main.js")

    def version(content):
        return hashlib.sha256(content).hexdigest()[:16]

    three = "./web/vendor/three-0.187.0"
    imports = {"three": f"{three}/build/three.module.js", "three/addons/": f"{three}/examples/jsm/"}
    scene_script = WEB / "climb-theme.js"
    scene_style = WEB / "climb/match.css"
    head = (f'<link id="dt-web-style" rel="stylesheet" href="assets/timer.css?v={version(css.encode())}">\n'
            f'<link id="dt-scene-style" rel="stylesheet" href="web/climb/match.css?v={version(scene_style.read_bytes())}">\n'
            f'<script type="importmap">{json.dumps({"imports": imports})}</script>\n')
    body = (f'<script defer src="web/climb-theme.js?v={version(scene_script.read_bytes())}"></script>\n'
            f'<script defer src="web/main.js?v={version(entry.read_bytes())}"></script>\n'
            f'<script defer id="dt-web-main" src="assets/timer.js?v={version(js.encode())}"></script>\n')
    index = _page("<!-- GitHub Pages -->\n", head, body)
    outputs = {PAGES / "index.html": index, PAGES / "assets/timer.css": css, PAGES / "assets/timer.js": js,
               PAGES / "debate-timer.html": index, PAGES / ".nojekyll": ""}
    _, scene_imports = embedded_modules(WEB / "climb/match-view.js")
    license_text = (WEB / "vendor/three-0.187.0/LICENSE").read_text(encoding="utf-8")
    outputs[PAGES / "assets/climb-export.js"] = (
        f"/* {license_text} */\n(function() {{\n"
        "const map = document.createElement('script');\nmap.type = 'importmap';\n"
        f"map.textContent = JSON.stringify({json.dumps({'imports': scene_imports})});\n"
        "document.head.appendChild(map);\n})();\n" + scene_script.read_text(encoding="utf-8") + "\n")
    for path in WEB.rglob("*"):
        if path.is_file():
            outputs[PAGES / "web" / path.relative_to(WEB)] = path.read_bytes()
    return outputs


def main(argv=None):
    ap = argparse.ArgumentParser(description="Build the debate timer.")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--target", choices=("all", "web", "offline"), default="all")
    ap.add_argument("--formats-dir", default=str(DEFAULT_FORMATS_DIR))
    args = ap.parse_args(argv)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    try:
        formats = parse_all(Path(args.formats_dir))
    except FormatError as e:
        print("赛制解析失败：", e)
        return 1
    try:
        outputs = {BUILTIN_JS: builtin_js(formats), SRC / "index.html": dev_index_html()}
        if args.target in ("all", "offline"):
            outputs[OUT] = inline_html(formats)
        if args.target in ("all", "web"):
            outputs.update(web_outputs(formats))
    except FormatError as e:
        print("构建失败：", e)
        return 1
    stale = False
    for p, content in outputs.items():
        binary = isinstance(content, bytes)
        if p.is_file() and (p.read_bytes() if binary else p.read_text(encoding="utf-8")) == content:
            continue
        stale = True
        if args.check:
            print(f"过期：{p.relative_to(HERE.parent)}。运行 python timer/build.py 重新生成")
            continue
        p.parent.mkdir(parents=True, exist_ok=True)
        if binary:
            p.write_bytes(content)
        else:
            p.write_text(content, encoding="utf-8", newline="\n")
        print("写入", p.relative_to(HERE.parent))
    return int(args.check and stale)


if __name__ == "__main__":
    sys.exit(main())
