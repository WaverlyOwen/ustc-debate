#!/usr/bin/env python3
"""Sample the timer's motion moments frame by frame (motion spec §3).

Usage:
    python timer/tests/motion.py --theme ink[,hall,…|all] --moments enter,warn,count,end,switch,lock,title
        [--size 1920x1080] [--frames 10] [--slow 4] [--reduced] [--html timer/debate-timer.html] [--out DIR]

Each moment of each theme opens the built page on a demo scene (?demo=…&theme=…&test=1) in a headless Edge of
this script's own, sets the scene up through the ?test=1 hook and sets the moment off, twice:

1. At full speed, with nothing else going on, to time it: every requestAnimationFrame stamp over the moment gives
   the frame times (p50 / p95 / max), and the stage's finite CSS animations show how long it really moves.
2. Slowed down `--slow` times (Animation.setPlaybackRate for CSS, the hook's rate for DT.clock, the renderer's
   timers and so a painter's time), to take `--frames` screenshots evenly over the moment's window: from the
   trigger to just past the end of its last animation or its --moment-ms, whichever is longer (4 s for over and
   title, whose motion is ambient). Each frame is labelled with the page clock's time since the trigger and, as a check
   that the slowdown took, the CSS time of the stage's longest-running animation.

Out: <out>/<theme>/<moment>.png, a contact sheet of the frames in time order (an HTML page of them screenshotted
by the same browser; no Pillow), the frames themselves in <theme>/frames/, and <theme>/summary.json with each
moment's window and frame times. --reduced emulates prefers-reduced-motion: reduce and writes to
<theme>/reduced/ instead, where every frame should already show the end state. <out> is timer/tests/out/motion.
Only the browser this script started is ended. Exit 0 when every sheet was written, 1 when some failed, 2 when
no browser is found.
"""
import argparse
import base64
import html
import json
import math
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from cdp import launch, stop  # noqa: E402
from run_js_tests import build, find_browser  # noqa: E402

AMBIENT_MS = 4000        # the window of over and title: two breaths of a 0.5 Hz loop
TIMING_MS = 2500         # how long the timing pass records an ordinary moment
TAIL_MS = 100            # past the last frame that moved, so the last screenshot shows where it came to rest
SETTLE_S = 1.5           # after a page load or a set-up step: the entrance and what it set off are over
BUDGET_MS = 20           # motion spec §1.2: frame time p95 at most this
SHEET_W = 2560           # the contact sheet's width in CSS pixels

# Before a trigger: these read the scene through the hook. T is window.__dtTest.
CLOCK = "T.view().clocks[0]"
ADVANCE_TO_WARN = f"(() => {{ const v = T.view(), c = {CLOCK}; T.advance(c.remaining - v.warnAt * c.total + 50); }})()"
ADVANCE_TO_END = f"(() => {{ const c = {CLOCK}; T.advance(c.remaining + 50); }})()"
# No built-in format counts down, so the count moment is a c5 bell shown on a clock with 5 s left.
ADVANCE_TO_COUNT = f"(() => {{ const c = {CLOCK}; T.advance(c.remaining - 5300); }})()"
COUNT = "T.pulse([{ type: 'count', clock: 'main', key: 'c5', at: DT.clock.now() }])"

# moment: (demo scene, set-up step or None, trigger). The scenes are DT.demo's.
MOMENTS = {
    "enter": ("title", None, "T.act('next')"),
    "start": ("single", "T.act('toggle')", "T.act('toggle')"),
    "pause": ("single", None, "T.act('toggle')"),
    "warn": ("single", None, ADVANCE_TO_WARN),
    "count": ("single", ADVANCE_TO_COUNT, COUNT),
    "end": ("single", None, ADVANCE_TO_END),
    "over": ("single", None, ADVANCE_TO_END),
    "switch": ("dual", None, "T.act('toggle')"),
    "lock": ("dual", None, "T.act('yield')"),
    "title": ("single", "T.act('toggle')", "T.act('goto', -1)"),
}
AMBIENT = ("over", "title")

# The stage's --moment-ms as render.js reads it, and whether any finite CSS animation or transition on it runs.
STAGE_JS = r"""
const S = document.querySelector('.dt-stage');
const momentMs = () => {
  const raw = getComputedStyle(S).getPropertyValue('--moment-ms').trim(), n = parseFloat(raw);
  return !(n > 0) ? 1200 : /[^m]s$/.test(raw) ? n * 1000 : n;
};
const moving = () => S.getAnimations({ subtree: true }).filter(a => a.playState === 'running' &&
  isFinite(a.effect.getComputedTiming().endTime));
"""

# Timing pass: stamps every frame for `until` ms from the trigger, and the last frame anything finite still moved.
TIMING_JS = """(() => {
  const T = window.__dtTest;
  %s
  const rec = { stamps: [], busy: 0, until: %d, momentMs: momentMs(), done: false };
  window.__motion = rec;
  function frame(ts) {
    rec.stamps.push(ts);
    if (moving().length) rec.busy = ts;
    if (ts - rec.t0 < rec.until) requestAnimationFrame(frame); else rec.done = true;
  }
  rec.t0 = performance.now();
  %s;
  requestAnimationFrame(frame);
  return true;
})()"""

# Capture pass: the page clock is noted right after the trigger (which may itself move the clock on); each stamp
# reads how far it has gone and the CSS time of the stage's longest-running finite animation (null when nothing
# finite moves).
CAPTURE_TRIGGER_JS = """(() => {
  const T = window.__dtTest;
  %s;
  window.__motion = { clock: DT.clock.now() };
  return true;
})()"""
STAMP_JS = """(() => {
  %s
  const css = moving().map(a => a.currentTime || 0);
  return { t: DT.clock.now() - window.__motion.clock, css: css.length ? Math.max.apply(null, css) : null };
})()"""


def percentile(values, p):
    """Nearest-rank percentile of a non-empty list."""
    xs = sorted(values)
    return xs[max(0, min(len(xs) - 1, math.ceil(p / 100 * len(xs)) - 1))]


class Sampler:
    def __init__(self, cdp, page, size, frames, slow, reduced):
        self.cdp, self.page, self.size = cdp, page, size
        self.frames, self.slow, self.reduced = frames, slow, reduced

    def js(self, expr):
        return self.cdp.evaluate(expr)

    def wait(self, cond, timeout=10.0):
        deadline = time.time() + timeout
        while time.time() < deadline:
            if self.js(f"!!({cond})"):
                return
            time.sleep(0.05)
        raise RuntimeError("等不到 " + cond)

    def viewport(self, w, h):
        self.cdp.send("Emulation.setDeviceMetricsOverride",
                      {"width": w, "height": h, "deviceScaleFactor": 1, "mobile": False})

    def open(self, scene, theme, prep):
        """The scene in the theme at full speed, settled, with the set-up step done and settled too."""
        self.viewport(*self.size)
        self.cdp.send("Page.navigate", {"url": f"{self.page}?demo={scene}&theme={theme}&test=1"})
        self.wait("window.__dtTest && document.readyState === 'complete' && document.querySelector('.dt-stage')")
        self.js("document.fonts.ready.then(() => true)")
        self.cdp.send("Animation.setPlaybackRate", {"playbackRate": 1})
        time.sleep(SETTLE_S)
        if prep:
            self.js("(() => { const T = window.__dtTest; %s; return true; })()" % prep)
            time.sleep(SETTLE_S)

    def timing(self, theme, name):
        scene, prep, trigger = MOMENTS[name]
        self.open(scene, theme, prep)
        until = AMBIENT_MS if name in AMBIENT else TIMING_MS
        self.js(TIMING_JS % (STAGE_JS, until, trigger))
        self.wait("window.__motion.done", timeout=until / 1000 + 10)
        rec = self.js("window.__motion")
        t0 = rec["t0"]
        moved = max(0.0, rec["busy"] - t0) if rec["busy"] else 0.0
        window = AMBIENT_MS if name in AMBIENT else max(moved + TAIL_MS if moved else 0, rec["momentMs"])
        stamps = [t for t in rec["stamps"] if t <= t0 + window]
        gaps = [b - a for a, b in zip(stamps, stamps[1:])]
        frame_ms = {"p50": round(percentile(gaps, 50), 2), "p95": round(percentile(gaps, 95), 2),
                    "max": round(max(gaps), 2), "count": len(gaps)} if gaps else None
        return {"window_ms": round(window), "moment_ms": rec["momentMs"], "moved_ms": round(moved),
                "frame_ms": frame_ms}

    def capture(self, theme, name, window):
        """[(jpeg bytes, page ms since the trigger, CSS ms or None)], evenly over `window` ms of slowed time."""
        scene, prep, trigger = MOMENTS[name]
        self.open(scene, theme, prep)
        self.cdp.send("Animation.setPlaybackRate", {"playbackRate": 1 / self.slow})
        self.js(f"window.__dtTest.setRate({1 / self.slow})")
        self.js(CAPTURE_TRIGGER_JS % trigger)
        start = time.perf_counter()
        shots = []
        for i in range(self.frames):
            due = start + window * self.slow / 1000 * (i / (self.frames - 1) if self.frames > 1 else 0)
            while time.perf_counter() < due:
                time.sleep(min(0.005, max(0.0, due - time.perf_counter())))
            stamp = self.js(STAMP_JS % STAGE_JS)
            shot = self.cdp.send("Page.captureScreenshot", {"format": "jpeg", "quality": 90})
            shots.append((base64.b64decode(shot["data"]), stamp["t"], stamp["css"]))
        return shots

    def sheet(self, out_png, title, shots):
        """Lays the frames out in time order on a page of their own and screenshots it into out_png."""
        cols = min(len(shots), 5 if len(shots) > 8 else 4)
        cell = SHEET_W // cols
        figs = "".join(
            '<figure><img src="data:image/jpeg;base64,%s"><figcaption>%s</figcaption></figure>'
            % (base64.b64encode(img).decode(), html.escape(f"{t:.0f} ms" + ("" if css is None else f"　css {css:.0f}")))
            for img, t, css in shots)
        doc = ("<!doctype html><meta charset='utf-8'><style>"
               "body{margin:0;background:#1b1b1b;color:#eee;font:20px/1.3 system-ui,'Microsoft YaHei',sans-serif}"
               "h1{font-size:26px;font-weight:600;margin:0;padding:16px 20px}"
               f".g{{display:grid;grid-template-columns:repeat({cols},{cell}px)}}"
               "figure{margin:0;padding:8px}img{display:block;width:100%;outline:1px solid #555}"
               "figcaption{padding:6px 2px 4px;font-variant-numeric:tabular-nums}</style>"
               f"<h1>{html.escape(title)}</h1><div class='g'>{figs}</div>")
        tmp = out_png.with_suffix(".sheet.html")
        tmp.write_text(doc, encoding="utf-8")
        try:
            self.viewport(cols * cell, 400)
            self.cdp.send("Page.navigate", {"url": tmp.resolve().as_uri()})
            self.wait("document.readyState === 'complete'")
            self.js("Promise.all(Array.from(document.images).map(i => i.decode())).then(() => true)")
            height = self.js("document.documentElement.scrollHeight")
            self.viewport(cols * cell, height)
            png = self.cdp.send("Page.captureScreenshot", {"format": "png"})
            out_png.write_bytes(base64.b64decode(png["data"]))
        finally:
            tmp.unlink(missing_ok=True)

    def run(self, theme, name, out_dir):
        timing = self.timing(theme, name)
        shots = self.capture(theme, name, timing["window_ms"])
        frames_dir = out_dir / "frames"
        frames_dir.mkdir(parents=True, exist_ok=True)
        for i, (img, _, _) in enumerate(shots):
            (frames_dir / f"{name}-{i:02d}.jpg").write_bytes(img)
        w, h = self.size
        title = (f"{theme} · {name} · 窗口 {timing['window_ms']} ms · 放慢 {self.slow} 倍取样 · {w}×{h}"
                 + (" · reduced motion" if self.reduced else ""))
        self.sheet(out_dir / f"{name}.png", title, shots)
        # The slowdown took when what moves (all of it set off at or after the trigger) is no further on in CSS
        # time than the page clock; without it the CSS time would run `slow` times ahead.
        slowed = all(css <= t + max(40, 0.25 * t) for _, t, css in shots if css is not None)
        return dict(timing, slow=self.slow, size=f"{w}x{h}", sheet=f"{name}.png", slowed=slowed,
                    over_budget=bool(timing["frame_ms"] and timing["frame_ms"]["p95"] > BUDGET_MS),
                    frames=[{"t_ms": round(t, 1), "css_ms": None if css is None else round(css, 1)}
                            for _, t, css in shots])


def main(argv=None):
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description="Sample the timer's motion moments into contact sheets.")
    ap.add_argument("--theme", default="hall", help="主题，逗号分隔，或 all")
    ap.add_argument("--moments", default=",".join(MOMENTS), help="时刻，逗号分隔：" + "、".join(MOMENTS))
    ap.add_argument("--size", default="1920x1080", help="窗口大小，如 1920x1080")
    ap.add_argument("--frames", type=int, default=10, help="每个时刻截几帧")
    ap.add_argument("--slow", type=float, default=4, help="取样时放慢几倍")
    ap.add_argument("--reduced", action="store_true", help="模拟 prefers-reduced-motion: reduce")
    ap.add_argument("--html", default=str(HERE.parent / "debate-timer.html"))
    ap.add_argument("--out", default=str(HERE / "out" / "motion"))
    args = ap.parse_args(argv)
    try:
        w, h = (int(x) for x in args.size.lower().split("x"))
    except ValueError:
        print(f"看不懂尺寸「{args.size}」，要写成 1920x1080 这样")
        return 1
    known = [t["id"] for t in build.themes_meta()]
    themes = known if args.theme.strip() == "all" else [t.strip() for t in args.theme.split(",") if t.strip()]
    moments = [m.strip() for m in args.moments.split(",") if m.strip()]
    for kind, asked, offered in (("主题", themes, known), ("时刻", moments, list(MOMENTS))):
        unknown = [x for x in asked if x not in offered]
        if not asked or unknown:
            print(f"没有这些{kind}：", "、".join(unknown) or "（空）", "；可选：", "、".join(offered))
            return 1
    if args.frames < 1 or args.slow < 1:
        print("--frames 至少 1，--slow 至少 1")
        return 1
    page = Path(args.html).resolve()
    if not page.exists():
        print(f"找不到 {page}。先运行 python timer/build.py")
        return 1
    browser = find_browser()
    if not browser:
        print("找不到 Edge 或 Chrome。装一个 Chromium 内核浏览器后重试。")
        return 2

    out_root = Path(args.out)
    failed = 0
    proc, profile, cdp = launch(browser, out_root / ".profiles", (w, h))
    try:
        cdp.send("Page.enable")
        cdp.send("Runtime.enable")
        cdp.send("Animation.enable")
        cdp.send("Emulation.setEmulatedMedia", {"features": [
            {"name": "prefers-reduced-motion", "value": "reduce" if args.reduced else "no-preference"}]})
        sampler = Sampler(cdp, page.as_uri(), (w, h), args.frames, args.slow, args.reduced)
        for theme in themes:
            out_dir = out_root / theme / ("reduced" if args.reduced else "")
            out_dir.mkdir(parents=True, exist_ok=True)
            summary_path = out_dir / "summary.json"
            try:
                summary = json.loads(summary_path.read_text("utf-8"))
            except (OSError, ValueError):
                summary = {}
            summary.update(theme=theme, reduced=args.reduced)
            summary.setdefault("moments", {})
            for name in moments:
                try:
                    entry = sampler.run(theme, name, out_dir)
                except Exception as e:   # one moment that fails does not stop the rest
                    print(f"{theme} {name}：失败，{e}")
                    failed += 1
                    continue
                summary["moments"][name] = entry
                summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
                ft = entry["frame_ms"]
                times = "帧耗时 p50 %.1f / p95 %.1f ms" % (ft["p50"], ft["p95"]) if ft else "没有帧耗时"
                notes = ("　超出 %d ms 预算" % BUDGET_MS if entry["over_budget"] else "") + \
                        ("" if entry["slowed"] else "　CSS 时间与页面时钟对不上：放慢可能没生效")
                print(f"{out_dir / entry['sheet']}　窗口 {entry['window_ms']} ms，{times}{notes}")
    finally:
        stop(proc, profile, cdp)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
