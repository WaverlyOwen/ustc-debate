#!/usr/bin/env python3
"""Record a theme's animation as a sequence of PNG frames (and a tiled contact sheet) in headless Edge (or Chrome).

Usage:
    python timer/tests/frames.py --theme hall                                     # 入场：单方环节扫入
    python timer/tests/frames.py --theme ink --demo dual --skip 1200 --key KeyL   # 入场结束后，自由辩换边
    python timer/tests/frames.py --theme hall --skip 76500 --count 24 --step 60   # 提示铃的金环（single 还剩 30 秒时）
    python timer/tests/frames.py --theme riso --demo dual --skip 1200 --key KeyG,KeyG   # 放弃（G G，两次相隔 --key-gap）

The page opens as <html>?demo=<名字>&theme=<id> (not frozen) with its clock paused; --skip advances the clock that
many milliseconds, --key then presses one key (or several, comma-separated, --key-gap ms apart: the second press of
R R / G G / Q Q must come between 250 and 1500 ms after the first), and --count frames --step ms apart are saved to
timer/tests/out/frames/<W>x<H>/<id>/<名字>[-<key>[+<key>…]][-skip<ms>]/NNN.png, with sheet.png beside them when ffmpeg
is installed. Each frame's line on stdout gives its time offset and the stage's data-phase, data-side, data-kind and
whether it is still entering. A bell only shows when a capture step crosses its point (the engine drops a bell
crossed more than 1.5 s ago), so stop --skip short of it.
Exit 0 when every frame was written, 1 when something failed, 2 when no browser is found.
"""
import argparse
import base64
import json
import math
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path
from urllib.parse import quote

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from run_js_tests import build, find_browser  # noqa: E402
from screenshots import DEMOS  # noqa: E402
from test_keyboard import CDP, KEYS as _KEYS, free_port  # noqa: E402

WAIT_S = 30   # the bound on every wait

KEYS = dict(_KEYS)
KEYS["ArrowLeft"] = dict(code="ArrowLeft", key="ArrowLeft", windowsVirtualKeyCode=37)
for _ch in "ABGLMQRSZ":
    KEYS["Key" + _ch] = dict(code="Key" + _ch, key=_ch.lower(), windowsVirtualKeyCode=ord(_ch), text=_ch.lower())

# How the frames are made deterministic. Emulation.setVirtualTimePolicy freezes the page's clock (Date, performance,
# timers, the painters' `now`), but in headless Chromium the Web Animations timeline keeps running on real time, and
# requestAnimationFrame callbacks only run in the frame a screenshot forces. So the document timeline is slowed to a
# standstill through the DevTools Animation domain (a rate of exactly 0 makes Page.captureScreenshot hang), and
# before each frame this driver seats every CSS animation and transition at its virtual age: one first seen now was
# created during the previous frame's render (the renderer's rAF loop ran then), so it counts from that frame. The
# sentinel is a composited animation that never ends: with no animation running, captureScreenshot hangs as well.
DRIVER = """(() => {
  if (window.__dtFrames) return;
  const F = window.__dtFrames = { seen: new Map(), last: null };
  const s = document.createElement('div');
  s.style.cssText = 'position:fixed;left:-10px;top:-10px;width:1px;height:1px;pointer-events:none;will-change:transform';
  document.body.appendChild(s);
  F.sentinel = s.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(1px)' }], { duration: 1e7, iterations: Infinity });
  F.step = () => {
    const now = performance.now(), live = new Set();
    document.getAnimations().forEach(a => {
      if (a === F.sentinel) return;
      live.add(a);
      if (!F.seen.has(a)) F.seen.set(a, F.last === null ? now : F.last);
      const t = now - F.seen.get(a);
      if (a.currentTime !== t) a.currentTime = t;
    });
    F.seen.forEach((v, a) => { if (!live.has(a)) F.seen.delete(a); });
    F.last = now;
    return live.size;
  };
  F.mark = () => { F.last = performance.now(); };
})()"""
STATE = """(() => { const s = document.querySelector('.dt-stage'); if (!s) return null;
  return [s.dataset.phase, s.dataset.side, s.dataset.kind, s.classList.contains('is-entering')]; })()"""


def launch(browser, w, h):
    """(Popen, profile dir, CDP connection to its page): a headless browser of this script's own."""
    port = free_port()
    profile = tempfile.mkdtemp(prefix="dt-frames-")
    # No --disable-gpu: with it, a painter theme's canvas stalls the page's CSS transitions part way.
    proc = subprocess.Popen([
        browser, "--headless=new", f"--remote-debugging-port={port}", f"--user-data-dir={profile}",
        "--allow-file-access-from-files", "--no-first-run", "--no-default-browser-check", "--disable-extensions",
        "--hide-scrollbars", "--force-device-scale-factor=1", f"--window-size={w},{h}", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    deadline = time.time() + WAIT_S
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/json", timeout=1) as r:
                pages = [t for t in json.load(r) if t.get("type") == "page"]
            if pages:
                return proc, profile, CDP(pages[0]["webSocketDebuggerUrl"])
        except OSError:
            pass
        time.sleep(0.1)
    stop(proc, profile)
    raise RuntimeError("浏览器没有打开页面")


def stop(proc, profile):
    proc.terminate()   # only the browser this script started
    try:
        proc.wait(10)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(10)
    shutil.rmtree(profile, ignore_errors=True)


def advance(cdp, ms):
    """Moves the page's clock forward by ms (virtual) and returns when it got there."""
    t0 = cdp.evaluate("performance.now()")
    cdp.send("Emulation.setVirtualTimePolicy", {"policy": "pauseIfNetworkFetchesPending", "budget": ms,
                                                "maxVirtualTimeTaskStarvationCount": 100000})
    deadline = time.time() + WAIT_S
    while cdp.evaluate("performance.now()") - t0 < ms - 0.5:
        if time.time() > deadline:
            raise RuntimeError(f"页面的时钟没有走完 {ms} ms")
        time.sleep(0.005)


def load(cdp, url, tick):
    """Navigates and waits for the stage, calling tick() between polls."""
    cdp.send("Page.navigate", {"url": url})
    deadline = time.time() + WAIT_S
    while not cdp.evaluate("document.readyState === 'complete' && !!document.querySelector('.dt-stage')"):
        if time.time() > deadline:
            raise RuntimeError("页面没有加载完")
        tick()


def record(cdp, url, args, out_dir, w, h):
    cdp.sock.settimeout(15)   # a capture takes well under a second; a stuck one gives up here
    for domain in ("Page", "Runtime", "Animation"):
        cdp.send(domain + ".enable")
    # The page, not the window, is w x h: a headless window's own chrome (and an infobar) takes 87 px or more of its
    # height, so a 1024x768 window would show a page of about 1024x680.
    cdp.send("Emulation.setDeviceMetricsOverride", {"width": w, "height": h, "deviceScaleFactor": 1, "mobile": False})
    # The animations must really run, whatever the machine prefers.
    cdp.send("Emulation.setEmulatedMedia", {"features": [{"name": "prefers-reduced-motion", "value": "no-preference"}]})
    # A warm-up of the same page in real time: a painter theme's canvas has to have been presented once before the
    # clock is paused, or the first capture under virtual time hangs about one time in three.
    load(cdp, url, lambda: time.sleep(0.05))
    cdp.send("Page.captureScreenshot", {"format": "png"})
    cdp.send("Emulation.setVirtualTimePolicy", {"policy": "pause"})   # before the first script of the page runs
    # With the clock paused the document stays in `loading`; one 1 ms grant lets it parse, run and lay out.
    load(cdp, url, lambda: advance(cdp, 1))
    cdp.send("Animation.setPlaybackRate", {"playbackRate": 0.0001})
    cdp.evaluate(DRIVER)
    cdp.evaluate("window.__dtFrames.step()")   # the entrance starts from its first frame
    if args.skip:
        advance(cdp, args.skip)
        # Seat every animation at its age after the skip (one more frame lets the finished ones end and go), so a
        # transition that began at the load is not still sitting at its start when the key is pressed.
        cdp.evaluate("window.__dtFrames.step()")
        advance(cdp, 16)
        cdp.evaluate("window.__dtFrames.step()")
        cdp.evaluate("window.__dtFrames.mark()")   # what the key creates next counts from now, not from the load
    for i, key in enumerate(args.keys):
        if i:
            # A later key is pressed --key-gap ms of page time after the one before it, with a frame in between so
            # the page sees the first press (a second press of G G or R R confirms the first).
            cdp.evaluate("window.__dtFrames.step()")
            advance(cdp, args.key_gap)
            cdp.evaluate("window.__dtFrames.step()")
        d = dict(KEYS[key])
        text = d.pop("text", None)
        down = dict(type="rawKeyDown") if text is None else dict(type="keyDown", text=text, unmodifiedText=text)
        cdp.send("Input.dispatchKeyEvent", dict(down, **d))
        cdp.send("Input.dispatchKeyEvent", dict(type="keyUp", **d))
    print("  帧   时间   phase  side  kind    entering")
    for i in range(args.count):
        if i:
            advance(cdp, args.step)
        n = cdp.evaluate("window.__dtFrames.step()")
        png = base64.b64decode(cdp.send("Page.captureScreenshot", {"format": "png"})["data"])
        (out_dir / f"{i:03d}.png").write_bytes(png)
        st = cdp.evaluate(STATE) or ["?", "?", "?", "?"]
        print(f"  {i:03d}  +{i * args.step:5d}  {st[0]:<6} {st[1]:<5} {st[2]:<7} {'yes' if st[3] else 'no':<3}  ({n} 个动画)")


def sheet(out_dir, count, w):
    """Tiles the frames four across, at most 2400 px wide; None without ffmpeg."""
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return None
    cols = min(count, 4)
    out = out_dir / "sheet.png"
    cmd = [ffmpeg, "-y", "-loglevel", "error", "-start_number", "0", "-framerate", "1", "-i", str(out_dir / "%03d.png"),
           "-frames:v", "1", "-vf", f"scale={min(w, 2400 // cols)}:-1,tile={cols}x{math.ceil(count / cols)}", str(out)]
    try:
        subprocess.run(cmd, capture_output=True, timeout=120)
    except subprocess.TimeoutExpired:
        pass
    return out if out.exists() else None


def main(argv=None):
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description="Record a theme's animation frame by frame.")
    ap.add_argument("--theme", required=True, help="主题 id，如 hall")
    ap.add_argument("--demo", default="single", help="演示态，默认 single")
    ap.add_argument("--size", default="1280x720", help="页面（投影）大小，如 1366x768")
    ap.add_argument("--skip", type=int, default=0, help="先把页面时钟拨快这么多毫秒")
    ap.add_argument("--key", default="", help="然后按这个键（物理键位），如 KeyL、Space、ArrowRight；逗号隔开可以连按几个，如 KeyG,KeyG")
    ap.add_argument("--key-gap", type=int, default=400, help="连按几个键时两次之间隔多少毫秒（页面时间），默认 400")
    ap.add_argument("--count", type=int, default=16, help="截几帧")
    ap.add_argument("--step", type=int, default=50, help="帧间隔，毫秒")
    ap.add_argument("--html", default=str(HERE.parent / "debate-timer.html"))
    args = ap.parse_args(argv)
    try:
        w, h = (int(x) for x in args.size.lower().split("x"))
    except ValueError:
        print(f"看不懂尺寸「{args.size}」，要写成 1280x720 这样")
        return 1
    page = Path(args.html).resolve()
    keys = args.keys = [k for k in args.key.split(",") if k]
    bad_keys = [k for k in keys if k not in KEYS]
    problem = (f"没有这个主题：{args.theme}" if args.theme not in [t["id"] for t in build.themes_meta()]
               else f"没有这个演示态：{args.demo}" if args.demo not in DEMOS
               else f"不认识的键：{bad_keys[0]}。可用：" + "、".join(sorted(KEYS)) if bad_keys
               else "--count 和 --step 要大于 0，--skip、--key-gap 不能是负数"
               if args.count < 1 or args.step < 1 or args.skip < 0 or args.key_gap < 0
               else f"找不到 {page}。先运行 python timer/build.py" if not page.exists() else "")
    if problem:
        print(problem)
        return 1
    browser = find_browser()
    if not browser:
        print("找不到 Edge 或 Chrome。装一个 Chromium 内核浏览器后重试。")
        return 2
    name = args.demo + ("-" + "+".join(keys) if keys else "") + (f"-skip{args.skip}" if args.skip else "")
    out_dir = HERE / "out" / "frames" / f"{w}x{h}" / args.theme / name
    shutil.rmtree(out_dir, ignore_errors=True)
    out_dir.mkdir(parents=True)
    url = f"{page.as_uri()}?demo={args.demo}&theme={quote(args.theme)}"
    for attempt in (1, 2):   # the frames are deterministic, so a browser that got stuck is simply started again
        try:
            proc, profile, cdp = launch(browser, w, h)
        except (OSError, RuntimeError) as e:
            print("打不开浏览器：", e)
            return 1
        try:
            record(cdp, url, args, out_dir, w, h)
            break
        except (OSError, RuntimeError) as e:   # a CDP error, or a wait that ran out
            print("录制中断：", str(e)[:300], "" if attempt == 2 else "（重开浏览器再试一次）")
            if attempt == 2:
                return 1
        finally:
            cdp.close()
            stop(proc, profile)
    print(f"{args.count} 帧存到 {out_dir}")
    made = sheet(out_dir, args.count, w)
    if made:
        print("拼图：", made)
    return 0


if __name__ == "__main__":
    sys.exit(main())
