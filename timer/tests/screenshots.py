#!/usr/bin/env python3
"""Screenshot every demo scene of the built timer with headless Edge (or Chrome).

Usage:
    python timer/tests/screenshots.py [--size 1920x1080] [--only 名字,名字] [--html timer/debate-timer.html]

Each scene opens as <html>?demo=<名字>&frozen=1 and is saved to timer/tests/out/<W>x<H>/<名字>.png.
Exit 0 when every screenshot was written, 1 when some failed, 2 when no browser is found.
"""
import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from run_js_tests import find_browser  # noqa: E402

# Must match DT.demo.names in src/demo.js (test_build.py checks it).
DEMOS = ["title", "single", "cross", "over", "dual", "dual-locked", "dual-idle", "break", "end",
         "daylight", "chroma", "seat-right", "long"]


def main(argv=None):
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description="Screenshot the timer's demo scenes.")
    ap.add_argument("--size", default="1920x1080", help="窗口大小，如 1366x768")
    ap.add_argument("--only", default="", help="只截这些演示态，逗号分隔")
    ap.add_argument("--html", default=str(HERE.parent / "debate-timer.html"))
    args = ap.parse_args(argv)
    try:
        w, h = (int(x) for x in args.size.lower().split("x"))
    except ValueError:
        print(f"看不懂尺寸「{args.size}」，要写成 1920x1080 这样")
        return 1
    names = [n.strip() for n in args.only.split(",") if n.strip()] or DEMOS
    unknown = [n for n in names if n not in DEMOS]
    if unknown:
        print("没有这些演示态：", "、".join(unknown))
        return 1
    page = Path(args.html).resolve()
    if not page.exists():
        print(f"找不到 {page}。先运行 python timer/build.py")
        return 1
    browser = find_browser()
    if not browser:
        print("找不到 Edge 或 Chrome。装一个 Chromium 内核浏览器后重试。")
        return 2
    out_dir = HERE / "out" / f"{w}x{h}"
    out_dir.mkdir(parents=True, exist_ok=True)
    profile = Path(tempfile.mkdtemp(prefix="dt-shots-"))
    failed = 0
    try:
        for name in names:
            out = out_dir / f"{name}.png"
            out.unlink(missing_ok=True)
            cmd = [browser, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
                   "--no-first-run", "--no-default-browser-check", f"--user-data-dir={profile}",
                   f"--window-size={w},{h}", "--virtual-time-budget=3000", f"--screenshot={out}",
                   f"{page.as_uri()}?demo={name}&frozen=1"]
            try:
                subprocess.run(cmd, capture_output=True, timeout=60)
            except subprocess.TimeoutExpired:
                pass
            if out.exists():
                print(out)
            else:
                print("截图失败：", name)
                failed += 1
    finally:
        shutil.rmtree(profile, ignore_errors=True)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
