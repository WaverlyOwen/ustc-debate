#!/usr/bin/env python3
"""Run the timer's browser tests in headless Edge (or Chrome) and report PASS/FAIL.

Usage:
    python timer/tests/run_js_tests.py [--filter 子串] [--keep]

A throwaway page gets the build's DT.THEMES and every stylesheet, loads every src script in
build.script_files() (build.ORDER with the theme scripts after render.js), then
tests/harness.js and tests/*.test.js, runs them, and writes the JSON result
into <pre id="results">. The browser dumps the DOM and this script parses it.
A script that throws while it loads (a syntax error, say) counts as a failure.
Exit 0 all pass, 1 some fail, 2 no browser / a source missing / page did not finish.
"""
import argparse
import html
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import build  # noqa: E402

CANDIDATES = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
]


def find_browser():
    for c in CANDIDATES:
        if os.path.exists(c):
            return c
    for name in ("msedge", "chrome", "chromium", "google-chrome"):
        p = shutil.which(name)
        if p:
            return p
    return None


# Collects what is thrown while the scripts load; a test file that does not parse would otherwise just be absent.
LOAD_ERRORS = ("<script>window.__loadErrors = []; window.addEventListener('error', function (e) {"
               "__loadErrors.push((e.filename || '').split('/').pop() + ':' + (e.lineno || '?') + ' ' + e.message);"
               "});</script>")


def missing_sources():
    return [p for p in build.script_files() if not p.exists()]


def test_page(filter_text):
    # The theme list the build injects, and every stylesheet, so theme tests can read computed styles.
    themes = json.dumps(build.themes_meta(), ensure_ascii=False).replace("</", "<\\/")
    tags = [LOAD_ERRORS, f"<script>window.DT = window.DT || {{}}; DT.THEMES = {themes};</script>"]
    tags += [f'<link rel="stylesheet" href="{p.as_uri()}">' for p in build.style_files()]
    tags += [f'<script src="{p.as_uri()}"></script>' for p in build.script_files()]
    tags.append(f'<script src="{(HERE / "harness.js").as_uri()}"></script>')
    tags += [f'<script src="{p.as_uri()}"></script>' for p in sorted(HERE.glob("*.test.js"))]
    runner = (
        "<script>DT.test.run(%s).then(function (r) {"
        "__loadErrors.forEach(function (e) { r.results.push({name: 'load ' + e, ok: false, error: e}); r.failed++; });"
        "document.getElementById('results').textContent = JSON.stringify(r);"
        "}).catch(function (e) {"
        "document.getElementById('results').textContent = JSON.stringify({fatal: String(e)});"
        "});</script>" % json.dumps(filter_text or "")
    )
    return ("<!doctype html><html><head><meta charset='utf-8'><title>timer tests</title></head>"
            "<body><div id='sandbox'></div><pre id='results'></pre>" + "".join(tags) + runner + "</body></html>")


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser()
    ap.add_argument("--filter", default="")
    ap.add_argument("--keep", action="store_true", help="keep the generated test page and print its path")
    args = ap.parse_args()
    missing = missing_sources()
    if missing:
        print("找不到这些源文件：", "、".join(p.relative_to(build.SRC).as_posix() for p in missing))
        return 2
    browser = find_browser()
    if not browser:
        print("找不到 Edge 或 Chrome。装一个 Chromium 内核浏览器后重试。")
        return 2
    tmp = Path(tempfile.mkdtemp(prefix="dt-tests-"))
    page = tmp / "test.html"
    page.write_text(test_page(args.filter), encoding="utf-8")
    cmd = [browser, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
           "--allow-file-access-from-files", "--autoplay-policy=no-user-gesture-required",
           f"--user-data-dir={tmp / 'profile'}", "--virtual-time-budget=20000", "--dump-dom", page.as_uri()]
    proc = subprocess.run(cmd, capture_output=True, timeout=120)
    dom = proc.stdout.decode("utf-8", "replace")
    m = re.search(r'<pre id="results">(.*?)</pre>', dom, re.S)
    if args.keep:
        print("测试页：", page)
    else:
        shutil.rmtree(tmp, ignore_errors=True)
    if not m or not m.group(1).strip():
        print("测试页没有跑完（没有结果）。浏览器输出：")
        print(proc.stderr.decode("utf-8", "replace")[-2000:])
        return 2
    data = json.loads(html.unescape(m.group(1)))
    if "fatal" in data:
        print("FATAL", data["fatal"])
        return 1
    for r in data["results"]:
        print(("PASS " if r["ok"] else "FAIL ") + r["name"])
        if not r["ok"]:
            print("     " + r["error"].replace("\n", "\n     "))
    print(f"{data['passed']} passed, {data['failed']} failed")
    return 0 if data["failed"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
