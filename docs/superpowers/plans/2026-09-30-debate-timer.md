# 华语辩论计时器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做一个单 HTML 文件的华语辩论计时器 `timer/debate-timer.html`：内置赛制库的全部赛制，可在界面里编辑赛制，支持单屏与双窗口投影，视觉有设计感、有动画、可换主题。

**Architecture:** 源码在 `timer/src/`，全部是经典脚本，共享全局 `window.DT`（`file://` 下不能用 ES module 和 fetch）。纯逻辑（engine、store）与 DOM 层（render、ui、setup、editor、sync）分开；`timer/build.py` 从赛制库生成内置赛制并把 `src/` 内联成一个 HTML。测试用 Python unittest（构建）和无头 Edge 跑的极简 JS 测试框架（其余全部）。

**Tech Stack:** 原生 HTML/CSS/JS（ES2019，Chromium 目标），WebAudio，Python 3.13 标准库，Microsoft Edge 无头模式。无任何第三方依赖。

**Spec:** `docs/superpowers/specs/2026-09-30-debate-timer-design.md`（下文写「规格 §N」）。每个任务开始前先读规格里它引用的章节。

## Global Constraints

- 交付物只有一个文件 `timer/debate-timer.html`，双击用 Edge 离线打开；不得引用任何 CDN、网络字体、npm 包，产物里不得有指向本地文件或网络的 `src=` / `href=`
- 本机没有 Node。构建与测试只用 `python`（Windows 上是 `python`，不是 `python3`）和系统自带的 Edge
- 源码是经典脚本：每个文件形如 `(function (DT) { 'use strict'; … DT.xxx = {…}; })(window.DT = window.DT || {});`，不用 `import` / `export`
- 脚本顺序唯一真源是 `timer/build.py` 的 `ORDER`：`builtin-formats.js, engine.js, store.js, bells.js, render.js, setup.js, editor.js, sync.js, demo.js, ui.js`
- 样式顺序：`styles/base.css, styles/stage.css, styles/console.css, styles/editor.css`，然后 `themes/*.css` 按文件名排序
- 代码注释用英文；界面文字、报错、提示用中文，句子要平实（"时长要大于 0 秒"，不是"Invalid duration"）
- 所有读时间的地方走 `DT.clock.now()`；engine 的函数从不读时钟，`now` 由调用方传入
- 主题色、字体只通过 CSS 变量契约使用（规格 §5.6）；组件 CSS 里不得写死主题色值
- 键盘用 `event.code`；焦点在 input / textarea / select / contenteditable 里时不响应快捷键
- `@media (prefers-reduced-motion: reduce)` 下关掉横扫、波纹、弹跳、呼吸
- 所有 localStorage 读写包在 try/catch 里，坏数据丢弃，页面不得白屏
- 每个任务结束时 `python timer/tests/run_js_tests.py` 与 `python -m unittest discover -s timer/tests -p "test_*.py"` 都要全绿（尚未存在的测试不算）
- 子代理**不要提交 git**；只改自己任务列出的文件。提交由编排者统一做

## Review Focus

规格没有写测试、但最可能让真人用户碰上的五种情况。每条都在负责它的任务里加了测试：

1. **中文输入法开着时按快捷键**：Windows 上微软拼音开着时 `event.key` 是 `"Process"`，快捷键必须照样生效（用 `event.code`）→ Task 8 测试 `ui: shortcuts work while an IME is composing-free but key is Process`
2. **比赛中途刷新或意外关闭页面**：重开后要回到同一环节，正在走的时钟按真实流逝的时间继续，不补响过期的铃 → Task 3（陈旧铃点）+ Task 8 测试 `ui: reload resumes the running clock`
3. **导入别人发来的坏文件或旧版本文件**：不能弄坏已有赛制，报错要说清是哪里错 → Task 4 测试 `store: parseImport rejects …` 与 `store: import never touches existing formats on error`
4. **窗口在后台或在另一块屏幕上时浏览器节流计时器**：铃声仍然准时 → Task 5 测试 `bells: schedule places sounds on the audio clock, not on timers`
5. **长名字与极端时长**：40 字的环节名、60 分钟的环节、1 秒的环节，投影上不溢出、不重叠 → Task 6 测试 `render: long names get the long class` + Task 7 截图 `long`

---

## 文件地图

| 文件 | 职责 | 任务 |
|---|---|---|
| `timer/build.py` | `ORDER`、赛制解析、内联构建、`--check` | 1、2、7 |
| `timer/src/builtin-formats.js` | 生成文件 | 2 |
| `timer/src/engine.js` | 计时引擎 + `DT.clock` | 3 |
| `timer/src/store.js` | 校验、时长解析、导入导出、持久化 | 4 |
| `timer/src/bells.js` | 合成与预排铃声 | 5 |
| `timer/src/render.js` | 投影画面 DOM | 6 |
| `timer/src/styles/base.css`、`stage.css` | 基础与投影画面样式、动画 | 6 |
| `timer/src/themes/hall.css`、`daylight.css`、`chroma.css` | 主题 | 6 |
| `timer/src/demo.js` | 演示态 | 7（后续任务补充） |
| `timer/src/ui.js` | 装配、键盘、控制条、覆盖层 | 7、8 |
| `timer/src/index.html` | 开发外壳 | 1、7 |
| `timer/src/styles/console.css` | 控制条、抽屉、覆盖层、操作台 | 8、11 |
| `timer/src/setup.js` | 开赛页 | 9 |
| `timer/src/editor.js`、`styles/editor.css` | 编辑器与开赛页样式 | 9、10 |
| `timer/src/sync.js` | 投影窗口 | 11 |
| `timer/tests/harness.js`、`run_js_tests.py` | JS 测试框架与运行器 | 1 |
| `timer/tests/*.test.js`、`test_build.py`、`screenshots.py` | 测试 | 各任务 |
| `timer/README.md`、根 `README.md` | 文档 | 12 |

---

### Task 1: 脚手架与 JS 测试运行器

**Files:**
- Create: `timer/build.py`（本任务只放 `ORDER`、`STYLES`、路径常量与 `script_files()` / `style_files()`；解析与内联在 Task 2、7 加）
- Create: `timer/src/index.html`
- Create: `timer/tests/harness.js`
- Create: `timer/tests/harness.test.js`
- Create: `timer/tests/run_js_tests.py`
- Modify: `.gitignore`（加 `timer/tests/out/`）

**Interfaces:**
- Produces: `build.ORDER: list[str]`，`build.STYLES: list[str]`，`build.SRC: Path`（`timer/src`），`build.script_files(existing_only=True) -> list[Path]`，`build.style_files(existing_only=True) -> list[Path]`（themes 按文件名排序接在 STYLES 后）
- Produces: JS 全局 `DT.test(name, fn)`、`DT.test.run() -> {passed, failed, results: [{name, ok, error}]}`、全局 `assert` 对象：`equal(a, b, msg?)`（`===`）、`deepEqual(a, b, msg?)`（JSON 结构比较，键序无关）、`ok(v, msg?)`、`throws(fn, msg?)`、`near(a, b, eps, msg?)`
- Produces: `python timer/tests/run_js_tests.py [--filter 子串] [--keep]`，退出码 0 全过 / 1 有失败 / 2 找不到浏览器或页面没跑完

- [ ] **Step 1: 写 `timer/build.py` 的骨架**

```python
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
```

- [ ] **Step 2: 写 `timer/tests/harness.js`**

```js
/* harness.js: a tiny test runner for the timer's browser tests. */
(function (DT) {
  'use strict';
  const tests = [];
  function test(name, fn) { tests.push({ name, fn }); }
  function canon(v) {
    if (Array.isArray(v)) return v.map(canon);
    if (v && typeof v === 'object') {
      const o = {};
      Object.keys(v).sort().forEach(k => { o[k] = canon(v[k]); });
      return o;
    }
    return v;
  }
  function fail(msg, detail) { throw new Error((msg ? msg + ': ' : '') + detail); }
  const assert = {
    equal(a, b, msg) { if (a !== b) fail(msg, 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); },
    deepEqual(a, b, msg) {
      const x = JSON.stringify(canon(a)), y = JSON.stringify(canon(b));
      if (x !== y) fail(msg, 'expected ' + y + ', got ' + x);
    },
    ok(v, msg) { if (!v) fail(msg, 'expected truthy, got ' + JSON.stringify(v)); },
    throws(fn, msg) { let threw = false; try { fn(); } catch (e) { threw = true; } if (!threw) fail(msg, 'expected an exception'); },
    near(a, b, eps, msg) { if (Math.abs(a - b) > eps) fail(msg, 'expected ' + b + ' ± ' + eps + ', got ' + a); },
  };
  async function run(filter) {
    const results = [];
    for (const t of tests) {
      if (filter && t.name.indexOf(filter) < 0) continue;
      try { await t.fn(); results.push({ name: t.name, ok: true }); }
      catch (e) { results.push({ name: t.name, ok: false, error: String(e && e.stack || e) }); }
    }
    const failed = results.filter(r => !r.ok).length;
    return { passed: results.length - failed, failed, results };
  }
  test.run = run;
  DT.test = test;
  window.assert = assert;
})(window.DT = window.DT || {});
```

- [ ] **Step 3: 写 `timer/tests/harness.test.js`（框架自检）**

```js
DT.test('harness: deepEqual ignores key order', () => {
  assert.deepEqual({ a: 1, b: [1, { c: 2, d: 3 }] }, { b: [1, { d: 3, c: 2 }], a: 1 });
});
DT.test('harness: throws and near', () => {
  assert.throws(() => { throw new Error('x'); });
  assert.near(0.1 + 0.2, 0.3, 1e-9);
});
DT.test('harness: async tests are awaited', async () => {
  const v = await new Promise(r => setTimeout(() => r(7), 5));
  assert.equal(v, 7);
});
```

- [ ] **Step 4: 写 `timer/tests/run_js_tests.py`**

```python
#!/usr/bin/env python3
"""Run the timer's browser tests in headless Edge (or Chrome) and report PASS/FAIL.

Usage:
    python timer/tests/run_js_tests.py [--filter 子串] [--keep]

A throwaway page loads every existing src script in build.ORDER, then
tests/harness.js and tests/*.test.js, runs them, and writes the JSON result
into <pre id="results">. The browser dumps the DOM and this script parses it.
Exit 0 all pass, 1 some fail, 2 no browser / page did not finish.
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


def test_page(filter_text):
    tags = [f'<script src="{p.as_uri()}"></script>' for p in build.script_files()]
    tags.append(f'<script src="{(HERE / "harness.js").as_uri()}"></script>')
    tags += [f'<script src="{p.as_uri()}"></script>' for p in sorted(HERE.glob("*.test.js"))]
    runner = (
        "<script>DT.test.run(%s).then(function (r) {"
        "document.getElementById('results').textContent = JSON.stringify(r);"
        "}).catch(function (e) {"
        "document.getElementById('results').textContent = JSON.stringify({fatal: String(e)});"
        "});</script>" % json.dumps(filter_text or "")
    )
    return ("<!doctype html><html><head><meta charset='utf-8'><title>timer tests</title></head>"
            "<body><div id='sandbox'></div><pre id='results'></pre>" + "".join(tags) + runner + "</body></html>")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--filter", default="")
    ap.add_argument("--keep", action="store_true", help="keep the generated test page and print its path")
    args = ap.parse_args()
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
```

注意：`sys.stdout` 在 Windows 控制台可能是 GBK / cp1252，打印中文会抛 `UnicodeEncodeError`。在 `main()` 开头加：

```python
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
```

- [ ] **Step 5: 运行，确认三个自检测试通过**

Run: `python timer/tests/run_js_tests.py`
Expected: `PASS harness: …` 三行，`3 passed, 0 failed`，退出码 0。如果输出"测试页没有跑完"，加 `--keep` 用浏览器手动打开测试页看控制台报错。

- [ ] **Step 6: 写 `timer/src/index.html` 开发外壳**

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>辩论计时器</title>
  <!-- build.py replaces every stylesheet link and script tag below with inline copies, in ORDER. -->
  <link rel="stylesheet" href="styles/base.css">
  <link rel="stylesheet" href="styles/stage.css">
  <link rel="stylesheet" href="styles/console.css">
  <link rel="stylesheet" href="styles/editor.css">
  <link rel="stylesheet" href="themes/chroma.css">
  <link rel="stylesheet" href="themes/daylight.css">
  <link rel="stylesheet" href="themes/hall.css">
</head>
<body data-dt-autoboot>
  <div id="app"></div>
  <script src="builtin-formats.js"></script>
  <script src="engine.js"></script>
  <script src="store.js"></script>
  <script src="bells.js"></script>
  <script src="render.js"></script>
  <script src="setup.js"></script>
  <script src="editor.js"></script>
  <script src="sync.js"></script>
  <script src="demo.js"></script>
  <script src="ui.js"></script>
</body>
</html>
```

- [ ] **Step 7: `.gitignore` 加一行 `timer/tests/out/`**

---

### Task 2: 从赛制库生成内置赛制

**Files:**
- Modify: `timer/build.py`（加解析、`write_builtin()`、`main()` 的 `--formats-dir` / `--check` 中与内置赛制相关的部分）
- Create: `timer/src/builtin-formats.js`（生成）
- Create: `timer/tests/test_build.py`

**Interfaces:**
- Consumes: Task 1 的 `build.SRC`、`BUILTIN_JS`、`DEFAULT_FORMATS_DIR`
- Produces: `build.parse_format(path: Path) -> dict`（规格 §2.1 的 Format），`build.parse_all(formats_dir) -> list[dict]`（按文件名排序，跳过 `_` 开头），`build.builtin_js(formats) -> str`（生成文件全文），`build.cn_int(text) -> int`，`class build.FormatError(Exception)`（消息含文件名与行号）
- Produces: 生成的 `DT.BUILTIN_FORMATS`（数组）。JS 端所有任务都从这里拿内置赛制

规格 §6.1 是解析规则的全文，照做。补充：

- `bells` 固定写 `{"warn": [30], "countdown": 0, "end": "double"}`，`theme` 写 `"hall"`，`builtin: true`，`source: 文件名`
- `break` 行的 `side` 为 `None`（JSON `null`），没有 `speaker` / `block` / `note` 键时省略这些键（不要写空字符串）
- `dual` 行加 `"first": "pro"`
- 生成文件内容：

```js
/* Generated by timer/build.py from the debate-prep format library. Do not edit by hand. */
/* Sources: recruit-1v1.md, recruit-2v2.md, recruit-3v3.md, ustc-freshman-cup.md, ustc-school-cup-2025.md */
(function (DT) {
  'use strict';
  DT.BUILTIN_FORMATS = [ …json.dumps(formats, ensure_ascii=False, indent=2)… ];
})(window.DT = window.DT || {});
```

（实际写法：`"DT.BUILTIN_FORMATS = " + json.dumps(formats, ensure_ascii=False, indent=2) + ";"`，缩进无所谓，但要确定性输出，`--check` 靠逐字节比较。）

- [ ] **Step 1: 写失败的测试 `timer/tests/test_build.py`**

```python
"""Tests for timer/build.py: parsing the format library and the drift check."""
import io
import shutil
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import build  # noqa: E402

FORMATS = build.DEFAULT_FORMATS_DIR


def by_id(formats):
    return {f["id"]: f for f in formats}


class ParseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.all = by_id(build.parse_all(FORMATS))

    def test_all_five_formats_are_found_and_template_is_skipped(self):
        self.assertEqual(sorted(self.all), ["recruit-1v1", "recruit-2v2", "recruit-3v3",
                                            "ustc-freshman-cup", "ustc-school-cup-2025"])

    def test_freshman_cup_stage_types(self):
        f = self.all["ustc-freshman-cup"]
        self.assertEqual(f["name"], "中国科学技术大学新生辩论赛")
        types = [s["type"] for s in f["stages"]]
        self.assertEqual(len(types), 18)
        self.assertEqual(types.count("break"), 4)
        self.assertEqual(types.count("dual"), 2)
        free = [s for s in f["stages"] if s["name"] == "自由辩论"][0]
        self.assertEqual((free["type"], free["secs"], free["first"], free["side"]), ("dual", 240, "pro", None))
        duel = [s for s in f["stages"] if s["name"] == "正反方二辩对辩"][0]
        self.assertEqual((duel["type"], duel["secs"]), ("dual", 90))

    def test_sides_and_notes(self):
        st = {s["name"]: s for s in self.all["ustc-freshman-cup"]["stages"]}
        self.assertEqual(st["正方一辩开篇立论"]["side"], "pro")
        self.assertEqual(st["反方四辩质询正方一辩"]["side"], "con")
        self.assertIn("双边计时", st["反方四辩质询正方一辩"]["note"])
        self.assertEqual(st["正方三辩盘问反方二辩、四辩"]["type"], "single")
        self.assertIn("按 P 暂停", st["正方三辩盘问反方二辩、四辩"]["note"])
        self.assertEqual(st["反方四辩结辩"]["secs"], 210)
        self.assertEqual(st["反方四辩结辩"]["block"], "E")
        self.assertEqual(st["反方四辩质询正方一辩"]["speaker"], "反四 问，正一 答")
        self.assertNotIn("speaker", st["评委打分"])

    def test_recruit_3v3_breaks_without_numbers(self):
        f = self.all["recruit-3v3"]
        self.assertEqual(len(f["stages"]), 20)
        breaks = [s for s in f["stages"] if s["type"] == "break"]
        self.assertEqual([b["id"] for b in breaks], ["recruit-3v3-b1", "recruit-3v3-b2", "recruit-3v3-b3"])
        self.assertEqual(len({s["id"] for s in f["stages"]}), 20)

    def test_school_cup_surprise_attack_becomes_extras(self):
        f = self.all["ustc-school-cup-2025"]
        self.assertEqual(len(f["stages"]), 18)
        self.assertFalse(any("奇袭" in s["name"] for s in f["stages"]))
        self.assertEqual(len(f["extras"]), 1)
        ex = f["extras"][0]
        self.assertEqual((ex["group"], ex["perSide"]), ("奇袭", 1))
        self.assertEqual([(v["name"], v["type"], v["secs"]) for v in ex["variants"]],
                         [("奇袭质询", "single", 150), ("奇袭申论", "single", 120)])
        self.assertIn("双边计时", ex["variants"][0]["note"])

    def test_defaults(self):
        for f in self.all.values():
            self.assertEqual(f["theme"], "hall")
            self.assertEqual(f["bells"], {"warn": [30], "countdown": 0, "end": "double"})
            self.assertTrue(f["builtin"])
            self.assertEqual(f["source"], f["id"] + ".md")

    def test_cn_int(self):
        self.assertEqual([build.cn_int(x) for x in ["一", "两", "三", "十", "2"]], [1, 2, 3, 10, 2])


class ErrorTests(unittest.TestCase):
    def test_missing_table_names_the_file(self):
        tmp = Path(tempfile.mkdtemp())
        try:
            (tmp / "broken.md").write_text("# 赛制：坏的\n\n没有表。\n", encoding="utf-8")
            with self.assertRaises(build.FormatError) as cm:
                build.parse_all(tmp)
            self.assertIn("broken.md", str(cm.exception))
        finally:
            shutil.rmtree(tmp)


class CheckTests(unittest.TestCase):
    def test_check_passes_on_a_fresh_build_and_fails_after_an_edit(self):
        original = build.BUILTIN_JS.read_text(encoding="utf-8")
        try:
            with redirect_stdout(io.StringIO()):
                self.assertEqual(build.main(["--check"]), 0)
            build.BUILTIN_JS.write_text(original + "\n// edited\n", encoding="utf-8")
            with redirect_stdout(io.StringIO()):
                self.assertEqual(build.main(["--check"]), 1)
        finally:
            build.BUILTIN_JS.write_text(original, encoding="utf-8")


if __name__ == "__main__":
    unittest.main()
```

（`CheckTests` 在本任务只比较 `builtin-formats.js`；Task 7 加了 HTML 以后，`--check` 同时比较两个文件，这个测试不用改。）

- [ ] **Step 2: 运行，确认失败**

Run: `python -m unittest discover -s timer/tests -p "test_*.py" -v`
Expected: `AttributeError: module 'build' has no attribute 'parse_all'` 一类的错误。

- [ ] **Step 3: 实现解析**

要点（完整规则见规格 §6.1）：

```python
import argparse, json, re, sys

class FormatError(Exception):
    pass

CN_DIGITS = {"零": 0, "一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10}

def cn_int(text):
    text = text.strip()
    if text.isdigit():
        return int(text)
    if text in CN_DIGITS:
        return CN_DIGITS[text]
    if text.startswith("十") and len(text) == 2:
        return 10 + CN_DIGITS[text[1]]
    raise ValueError(text)

def _cells(line):
    return [c.strip().replace("**", "") for c in line.strip().strip("|").split("|")]
```

- 找 `## 流程总表` 标题，从它往下找第一行以 `|` 开头的表头；第二行是分隔行（`|---|`）；之后连续的 `|` 行是数据，遇到非 `|` 行结束
- 表头列名到键：`序`→no，`环节`→name，`时长`→dur，`计时`→timing，`发言人`→speaker，最后一列（`打分块` 或 `段`）→block。缺任何一个就 `FormatError(f"{path.name}:{行号}: 流程总表缺少「{列名}」列")`
- `secs`：`re.search(r"\d+", dur)`，没有就 `FormatError`
- `side`：在 name 里找第一个 `正` 或 `反`
- 奇袭行识别：`no == "—"` 且 `timing != "—"`。组名：name 里第一个中文词组，写法 `re.match(r"([^（(]+)", name).group(1).strip()`（得「奇袭」）；`perSide`：`re.search(r"每方([一二两三四五六七八九十\d]+)次", name)`；variants：`dur.split("/")`，每段 `re.match(r"\s*(\S+?)\s*(\d+)\s*秒", seg)` 得名词与秒数，名字 = 组名 + 名词
- 休息行（`no == "—"` 且 `timing == "—"`）id 用 `f"{fid}-b{k}"`，k 从 1 起数
- `name` 字段来自 `re.search(r"^# 赛制：(.+)$", text, re.M)`

`main(argv=None)`：

```python
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
    stale = [p for p, text in outputs.items() if not p.exists() or p.read_text(encoding="utf-8") != text]
    if args.check:
        for p in stale:
            print("过期：", p.relative_to(HERE.parent), "—— 运行 python timer/build.py 重新生成")
        return 1 if stale else 0
    for p, text in outputs.items():
        p.write_text(text, encoding="utf-8", newline="\n")
        print("写入", p.relative_to(HERE.parent))
    return 0

if __name__ == "__main__":
    sys.exit(main())
```

注意 `--check` 的提示里不要用破折号，改成「过期：<路径>。运行 python timer/build.py 重新生成」。

- [ ] **Step 4: 生成并运行测试**

Run: `python timer/build.py` 然后 `python -m unittest discover -s timer/tests -p "test_*.py" -v`
Expected: 全部 OK。再跑 `python timer/build.py --check`，退出码 0。

- [ ] **Step 5: 用浏览器测试确认生成文件能被加载**

在 `timer/tests/` 加 `builtin.test.js`：

```js
DT.test('builtin: five formats load with unique stage ids', () => {
  assert.equal(DT.BUILTIN_FORMATS.length, 5);
  DT.BUILTIN_FORMATS.forEach(f => {
    const ids = f.stages.map(s => s.id);
    assert.equal(new Set(ids).size, ids.length, f.id);
  });
});
```

Run: `python timer/tests/run_js_tests.py`
Expected: 全部 PASS。

---

### Task 3: 计时引擎

**Files:**
- Create: `timer/src/engine.js`
- Create: `timer/tests/engine.test.js`

**Interfaces:**
- Consumes: 无（引擎不依赖 store、DOM；测试用内联夹具）
- Produces: `DT.clock = { now(), set(fn), reset() }`（默认 `performance.timeOrigin + performance.now()`）；`DT.engine` 的全部 API，签名见规格 §3.1，外加：
  - `DT.engine.DEFAULT_BELLS = { warn: [30], countdown: 0, end: 'double' }`
  - `DT.engine.effectiveBells(format, stage) -> {warn, countdown, end}`；`break` 的默认是 `{warn: [], countdown: 0, end: 'chime'}`，只有环节自己的 `bells` 能覆盖它
  - `DT.engine.fmt(ms) -> string`
  - `DT.engine.bellPoints(bells) -> [{key, ms, type}]`，按 ms 降序：`w<t>`（type `warn`）、`c<n>`（type `count`）、`end`（type `end`，ms 0）
  - `record()` 每行：`{ index, name, side, type, planned, used, over, yielded }`；`dual` 的 `planned = secs*2000`，`used` 双方合计，`yielded` 双方合计；`over = max(0, used - planned)`，只有 `single` 可能 > 0
  - `lastFeedback.code` 取值：`locked`、`done`、`running`、`extra-limit`、`nothing-to-undo`、`not-dual`
  - `view().stage` 另含 `id`；`view().clocks[i]` 另含 `label`（`'正方'`/`'反方'`/`''`）与 `text`（`fmt(remaining)`）
  - `view().progress[i].state`：`i < cursor` → `'done'`，`i === cursor` → `'current'`，否则 `'todo'`
  - `view().warnAt`：当前单方环节最大 warn 点占总时长的比例（`t*1000/total`），没有则 `null`（给色场上的金色标线用）

对规格 §3.2 的两处补充：

- **insertExtra 的前置条件**：当前环节的 Run 没在走即可（包括开场卡）。在走则反馈 `running`
- 引擎文件同时定义 `DT.clock`，但引擎自己的函数从不调用它

实现要点：

- 所有动作先 `const s = clone(session)`（`JSON.parse(JSON.stringify(...))` 足够，session 很小），清掉 `lastFeedback`，把去掉 `history` 的旧 session 压进 `s.history`（上限 100，超出从头部丢），再修改 `s` 并返回。`tick` 与 `upcomingBells` 不压栈；`tick` 也不清 `lastFeedback`
- 不适用的动作（如对单方环节按 A）返回的新 session 不压栈，只带 feedback
- `goto`、`next`、`prev` 要先结算当前环节：`used += now - since; running = false; since = null`
- `tick` 用循环处理连锁耗尽：dual 正方耗尽转反方后，同一次 tick 里反方也可能已耗尽
- 铃点事件在 `tick` 里按时间顺序产出；越过时刻 `crossAt = since + (total - used) - pointMs`（对当前在走的时钟），`now - crossAt > 1500` 的静默
- `remaining` 对 `break` 在 `done` 后返回 0

- [ ] **Step 1: 写失败的测试 `timer/tests/engine.test.js`**

```js
(function () {
  const E = DT.engine;
  const T0 = 1000000;
  const MATCH = { title: '第 1 场', proMotion: 'A 是 B', conMotion: 'A 不是 B', proTeam: '物理', conTeam: '化学', proSeat: 'left' };
  function fx() {
    return {
      id: 'fx', name: '测试赛制', theme: 'hall',
      bells: { warn: [30], countdown: 0, end: 'double' },
      stages: [
        { id: 's1', name: '正方一辩开篇立论', type: 'single', side: 'pro', secs: 180, speaker: '正一', block: 'A' },
        { id: 's2', name: '反方四辩质询正方一辩', type: 'single', side: 'con', secs: 120, speaker: '反四 问，正一 答', block: 'A' },
        { id: 'b1', name: '评委打分', type: 'break', side: null, secs: 30 },
        { id: 's3', name: '自由辩论', type: 'dual', side: null, secs: 240, first: 'pro', block: 'D' },
        { id: 's4', name: '反方四辩结辩', type: 'single', side: 'con', secs: 210, block: 'E', bells: { countdown: 5 } },
      ],
      extras: [{ group: '奇袭', perSide: 1, variants: [
        { name: '奇袭质询', type: 'single', secs: 150 }, { name: '奇袭申论', type: 'single', secs: 120 }] }],
    };
  }
  function at(i, now) { return E.goto(E.createSession(fx(), MATCH, T0), i, now === undefined ? T0 : now); }
  const rem = (s, clock, now, id) => E.remaining(E.getRun(s, id), clock, now);

  DT.test('engine: createSession copies the format and starts at the title card', () => {
    const f = fx(); const s = E.createSession(f, MATCH, T0);
    assert.equal(s.cursor, -1);
    f.stages[0].secs = 1;
    assert.equal(s.timeline[0].secs, 180);
    assert.equal(s.format.stages[0].secs, 180);
    assert.equal(E.view(s, T0).mode, 'title');
  });

  DT.test('engine: effectiveBells merges default, format and stage; breaks chime', () => {
    const f = fx();
    assert.deepEqual(E.effectiveBells(f, f.stages[0]), { warn: [30], countdown: 0, end: 'double' });
    assert.deepEqual(E.effectiveBells(f, f.stages[4]), { warn: [30], countdown: 5, end: 'double' });
    assert.deepEqual(E.effectiveBells({ bells: { end: 'triple' } }, { type: 'single' }), { warn: [30], countdown: 0, end: 'triple' });
    assert.deepEqual(E.effectiveBells(f, f.stages[2]), { warn: [], countdown: 0, end: 'chime' });
    assert.deepEqual(E.effectiveBells(f, { type: 'break', bells: { warn: [10] } }), { warn: [10], countdown: 0, end: 'chime' });
  });

  DT.test('engine: fmt rounds remaining up and overtime down', () => {
    assert.equal(E.fmt(180000), '3:00');
    assert.equal(E.fmt(179001), '3:00');
    assert.equal(E.fmt(179000), '2:59');
    assert.equal(E.fmt(1), '0:01');
    assert.equal(E.fmt(0), '0:00');
    assert.equal(E.fmt(-7999), '+0:07');
    assert.equal(E.fmt(-65000), '+1:05');
    assert.equal(E.fmt(3600000), '60:00');
  });

  DT.test('engine: space on the title card moves to the first stage', () => {
    const s = E.toggle(E.createSession(fx(), MATCH, T0), T0);
    assert.equal(s.cursor, 0);
    assert.equal(E.getRun(s).running, false);
  });

  DT.test('engine: single stage accumulates time across pauses', () => {
    let s = at(0);
    s = E.toggle(s, T0);
    s = E.toggle(s, T0 + 10000);
    assert.equal(rem(s, 'main', T0 + 50000), 170000);
    s = E.toggle(s, T0 + 60000);
    assert.equal(rem(s, 'main', T0 + 65000), 165000);
  });

  DT.test('engine: single stage runs into overtime without stopping', () => {
    let s = E.toggle(at(0), T0);
    const now = T0 + 187000;
    s = E.tick(s, now).session;
    const r = E.getRun(s);
    assert.ok(r.running);
    assert.equal(E.remaining(r, 'main', now), -7000);
    const c = E.view(s, now).clocks[0];
    assert.equal(c.phase, 'over'); assert.equal(c.overtime, 7000); assert.equal(c.fraction, 0);
    assert.equal(c.text, '+0:07');
  });

  DT.test('engine: pause toggles in every kind of stage', () => {
    let s = E.toggle(at(3), T0);
    s = E.pause(s, T0 + 5000);
    assert.equal(E.getRun(s).running, false); assert.equal(E.getRun(s).active, 'pro');
    s = E.pause(s, T0 + 9000);
    assert.ok(E.getRun(s).running); assert.equal(E.getRun(s).active, 'pro');
    assert.equal(rem(s, 'pro', T0 + 10000), 234000);
  });

  DT.test('engine: first space in a dual stage gives the floor to first', () => {
    const r = E.getRun(E.toggle(at(3), T0));
    assert.equal(r.active, 'pro'); assert.ok(r.running);
  });

  DT.test('engine: space switches the floor and charges each side its own time', () => {
    let s = E.toggle(at(3), T0);
    s = E.toggle(s, T0 + 20000);
    s = E.toggle(s, T0 + 35000);
    assert.equal(rem(s, 'pro', T0 + 35000), 220000);
    assert.equal(rem(s, 'con', T0 + 35000), 225000);
    assert.equal(E.getRun(s).active, 'pro');
  });

  DT.test('engine: floor gives the floor directly and ignores single stages', () => {
    const s = E.floor(at(3), 'con', T0);
    assert.equal(E.getRun(s).active, 'con');
    const same = E.floor(s, 'con', T0 + 1000);
    assert.equal(rem(same, 'con', T0 + 5000), 235000);
    const single = E.floor(at(0), 'pro', T0);
    assert.equal(E.getRun(single).running, false);
    assert.equal(single.lastFeedback.code, 'not-dual');
  });

  DT.test('engine: exhausting one side hands over at the exact moment', () => {
    const s = E.toggle(at(3), T0);
    const late = T0 + 240000 + 3700;
    const out = E.tick(s, late);
    const r = E.getRun(out.session);
    assert.ok(r.locked.pro);
    assert.equal(r.clocks.pro.used, 240000);
    assert.equal(r.active, 'con');
    assert.equal(E.remaining(r, 'con', late), 240000 - 3700);
    assert.ok(out.events.some(e => e.type === 'switch' && e.from === 'pro' && e.to === 'con' && e.at === T0 + 240000));
  });

  DT.test('engine: a locked side cannot take the floor', () => {
    let s = E.toggle(at(3), T0);
    s = E.tick(s, T0 + 240000).session;
    const a = E.floor(s, 'pro', T0 + 241000);
    assert.equal(E.getRun(a).active, 'con');
    assert.equal(a.lastFeedback.code, 'locked');
    const sp = E.toggle(s, T0 + 241000);
    assert.equal(E.getRun(sp).active, 'con');
    assert.equal(sp.lastFeedback.code, 'locked');
  });

  DT.test('engine: the dual stage is done when both sides run out, even in one tick', () => {
    let s = E.toggle(at(3), T0);
    s = E.tick(s, T0 + 480010).session;
    const r = E.getRun(s);
    assert.ok(r.locked.pro && r.locked.con); assert.ok(r.done); assert.equal(r.running, false);
  });

  DT.test('engine: yielding records the unused time and hands over', () => {
    let s = E.toggle(at(3), T0);
    s = E.yieldTime(s, T0 + 100000);
    const r = E.getRun(s);
    assert.ok(r.locked.pro); assert.equal(r.yielded.pro, 140000);
    assert.equal(r.active, 'con'); assert.ok(r.running);
    assert.equal(E.remaining(r, 'con', T0 + 110000), 230000);
  });

  DT.test('engine: undoing a mistaken switch keeps the first side running', () => {
    let s = E.toggle(at(3), T0);
    s = E.toggle(s, T0 + 10000);
    s = E.undo(s, T0 + 13000);
    const r = E.getRun(s);
    assert.equal(r.active, 'pro'); assert.ok(r.running);
    assert.equal(E.remaining(r, 'pro', T0 + 13000), 227000);
    assert.equal(E.remaining(r, 'con', T0 + 13000), 240000);
  });

  DT.test('engine: undo history is capped at 100 and empty undo gives feedback', () => {
    let s = at(0);
    for (let i = 0; i < 130; i++) s = E.toggle(s, T0 + i * 1000);
    assert.ok(s.history.length <= 100);
    const e = E.undo(E.createSession(fx(), MATCH, T0), T0);
    assert.equal(e.lastFeedback.code, 'nothing-to-undo');
  });

  DT.test('engine: adjust clamps at full time and re-arms bells above the new remaining', () => {
    let s = E.toggle(at(0), T0);
    s = E.tick(s, T0 + 150500).session;
    assert.ok(E.getRun(s).fired.main.indexOf('w30') >= 0);
    s = E.adjust(s, 5000, T0 + 150500);
    assert.ok(E.getRun(s).fired.main.indexOf('w30') < 0);
    s = E.adjust(s, 999000, T0 + 150500);
    assert.equal(rem(s, 'main', T0 + 150500), 180000);
  });

  DT.test('engine: adding time to a locked side unlocks it', () => {
    let s = E.toggle(at(3), T0);
    s = E.tick(s, T0 + 240000).session;
    s = E.adjust(s, 5000, T0 + 241000, 'pro');
    const r = E.getRun(s);
    assert.equal(r.locked.pro, false);
    assert.equal(E.remaining(r, 'pro', T0 + 241000), 5000);
    assert.equal(r.active, 'con');
  });

  DT.test('engine: a bell point fires once when crossed', () => {
    const s = E.toggle(at(0), T0);
    let out = E.tick(s, T0 + 150000);
    assert.deepEqual(out.events.map(e => e.key), ['w30']);
    out = E.tick(out.session, T0 + 150400);
    assert.equal(out.events.length, 0);
    out = E.tick(out.session, T0 + 180000);
    assert.deepEqual(out.events.map(e => e.type), ['end']);
  });

  DT.test('engine: stale bell points are marked without firing', () => {
    const out = E.tick(E.toggle(at(0), T0), T0 + 152000);
    assert.equal(out.events.length, 0);
    assert.ok(E.getRun(out.session).fired.main.indexOf('w30') >= 0);
  });

  DT.test('engine: crossing a bell point while paused does not fire', () => {
    let s = E.toggle(at(0), T0);
    s = E.toggle(s, T0 + 140000);
    s = E.adjust(s, -15000, T0 + 141000);
    const out = E.tick(s, T0 + 141000);
    assert.equal(out.events.length, 0);
    assert.ok(E.getRun(out.session).fired.main.indexOf('w30') >= 0);
  });

  DT.test('engine: countdown fires one event per second', () => {
    let s = E.toggle(at(4), T0);
    let keys = [];
    for (let t = 204000; t <= 210000; t += 250) {
      const out = E.tick(s, T0 + t); s = out.session; keys = keys.concat(out.events.map(e => e.key));
    }
    assert.deepEqual(keys, ['c5', 'c4', 'c3', 'c2', 'c1', 'end']);
  });

  DT.test('engine: a break stops itself at zero and fires end', () => {
    const s = E.toggle(at(2), T0);
    const out = E.tick(s, T0 + 30500);
    const r = E.getRun(out.session);
    assert.equal(r.running, false); assert.ok(r.done);
    assert.equal(E.remaining(r, 'main', T0 + 40000), 0);
    assert.deepEqual(out.events.map(e => e.type), ['end']);
    assert.equal(E.toggle(out.session, T0 + 41000).lastFeedback.code, 'done');
  });

  DT.test('engine: moving between stages pauses and keeps each stage', () => {
    let s = E.toggle(at(0), T0);
    s = E.next(s, T0 + 30000);
    assert.equal(s.cursor, 1);
    s = E.prev(s, T0 + 90000);
    const r = E.getRun(s);
    assert.equal(r.running, false);
    assert.equal(E.remaining(r, 'main', T0 + 90000), 150000);
  });

  DT.test('engine: goto clamps to the title and end cards', () => {
    const s = E.createSession(fx(), MATCH, T0);
    assert.equal(E.goto(s, -9, T0).cursor, -1);
    assert.equal(E.goto(s, 99, T0).cursor, 5);
    assert.equal(E.view(E.goto(s, 99, T0), T0).mode, 'end');
  });

  DT.test('engine: reset restores the current stage only', () => {
    let s = E.toggle(at(0), T0); s = E.next(s, T0 + 50000); s = E.toggle(s, T0 + 50000);
    s = E.reset(s, T0 + 60000);
    assert.equal(rem(s, 'main', T0 + 70000), 120000);
    assert.equal(rem(s, 'main', T0 + 70000, 's1'), 130000);
  });

  DT.test('engine: extras insert after the current stage and respect perSide', () => {
    let s = E.toggle(at(0), T0); s = E.toggle(s, T0 + 170000);
    s = E.insertExtra(s, '奇袭', 0, 'con', T0 + 171000);
    assert.equal(s.cursor, 0);
    assert.equal(s.timeline[1].name, '反方奇袭质询');
    assert.equal(s.timeline[1].side, 'con');
    assert.ok(s.timeline[1].extra);
    assert.equal(s.timeline[1].secs, 150);
    assert.equal(s.extrasUsed['奇袭'].con, 1);
    const again = E.insertExtra(s, '奇袭', 1, 'con', T0 + 172000);
    assert.equal(again.lastFeedback.code, 'extra-limit');
    assert.equal(again.timeline.length, s.timeline.length);
    const pro = E.insertExtra(s, '奇袭', 1, 'pro', T0 + 172000);
    assert.equal(pro.timeline[1].name, '正方奇袭申论');
    assert.ok(pro.timeline[1].id !== pro.timeline[2].id);
  });

  DT.test('engine: extras cannot be inserted while a clock is running', () => {
    const s = E.toggle(at(0), T0);
    assert.equal(E.insertExtra(s, '奇袭', 0, 'pro', T0 + 1000).lastFeedback.code, 'running');
  });

  DT.test('engine: view reports calm, warn, count, over and done phases', () => {
    const s = E.toggle(at(4), T0);
    const ph = t => E.view(s, T0 + t).clocks[0].phase;
    assert.equal(ph(100000), 'calm');
    assert.equal(ph(181000), 'warn');
    assert.equal(ph(206000), 'count');
    assert.equal(ph(211000), 'over');
    let d = E.toggle(at(3), T0); d = E.yieldTime(d, T0 + 1000);
    const pro = E.view(d, T0 + 2000).clocks.find(c => c.id === 'pro');
    assert.equal(pro.phase, 'done'); assert.ok(pro.locked);
  });

  DT.test('engine: view carries stage, next, progress and warnAt', () => {
    let s = E.toggle(at(0), T0); s = E.next(s, T0 + 180000);
    const v = E.view(s, T0 + 180000);
    assert.equal(v.mode, 'stage');
    assert.equal(v.stage.index, 1); assert.equal(v.stage.count, 5);
    assert.equal(v.stage.side, 'con'); assert.equal(v.next.name, '评委打分');
    assert.deepEqual(v.progress.map(p => p.state), ['done', 'current', 'todo', 'todo', 'todo']);
    assert.equal(v.proSeat, 'left');
    assert.near(v.warnAt, 30 / 120, 1e-9);
    const dv = E.view(at(3), T0);
    assert.deepEqual(dv.clocks.map(c => c.id), ['pro', 'con']);
    assert.deepEqual(dv.clocks.map(c => c.label), ['正方', '反方']);
  });

  DT.test('engine: upcomingBells lists future bells of the running clock', () => {
    const s = E.toggle(at(4), T0);
    assert.deepEqual(E.upcomingBells(s, T0 + 1000).map(b => [b.sound, b.at - T0]), [
      ['ding', 180000], ['tick', 205000], ['tick', 206000], ['tick', 207000], ['tick', 208000], ['tick', 209000], ['double', 210000]]);
    assert.deepEqual(E.upcomingBells(E.toggle(s, T0 + 2000), T0 + 2000), []);
    const b = E.toggle(at(2), T0);
    assert.deepEqual(E.upcomingBells(b, T0).map(x => [x.sound, x.at - T0]), [['chime', 30000]]);
  });

  DT.test('engine: upcomingBells follows the handover in a dual stage', () => {
    let s = E.toggle(at(3), T0);
    s = E.toggle(s, T0 + 100000);
    s = E.toggle(s, T0 + 130000);
    assert.deepEqual(E.upcomingBells(s, T0 + 130000).map(b => [b.clock, b.sound, b.at - T0]), [
      ['pro', 'ding', 240000], ['pro', 'double', 270000], ['con', 'ding', 450000], ['con', 'double', 480000]]);
  });

  DT.test('engine: record reports planned and used time per stage', () => {
    let s = E.toggle(at(0), T0); s = E.next(s, T0 + 187000);
    s = E.toggle(s, T0 + 190000); s = E.next(s, T0 + 290000);
    const rec = E.record(s, T0 + 300000);
    assert.deepEqual(rec.slice(0, 2).map(r => [r.planned, r.used, r.over]), [[180000, 187000, 7000], [120000, 100000, 0]]);
    assert.equal(rec[2].used, 0);
    assert.equal(rec[3].planned, 480000);
  });

  DT.test('engine: actions never mutate their input', () => {
    const s = E.toggle(at(3), T0);
    const snap = JSON.stringify(s);
    E.toggle(s, T0 + 1000); E.floor(s, 'con', T0 + 1000); E.yieldTime(s, T0 + 1000);
    E.adjust(s, 1000, T0 + 1000); E.tick(s, T0 + 999999); E.next(s, T0 + 1000); E.undo(s, T0 + 1000);
    E.insertExtra(E.pause(s, T0 + 1), '奇袭', 0, 'pro', T0 + 2);
    assert.equal(JSON.stringify(s), snap);
  });

  DT.test('engine: a session survives a JSON round trip', () => {
    let s = E.toggle(at(3), T0); s = E.toggle(s, T0 + 5000);
    const back = JSON.parse(JSON.stringify(s));
    assert.equal(E.remaining(E.getRun(back), 'con', T0 + 9000), 236000);
    assert.equal(E.getRun(E.toggle(back, T0 + 9000)).active, 'pro');
  });

  DT.test('engine: DT.clock can be replaced and restored', () => {
    DT.clock.set(() => 42);
    assert.equal(DT.clock.now(), 42);
    DT.clock.reset();
    assert.ok(DT.clock.now() > 1e12);
  });
})();
```

- [ ] **Step 2: 运行，确认失败**

Run: `python timer/tests/run_js_tests.py --filter engine`
Expected: 每条 FAIL，错误为 `Cannot read properties of undefined (reading 'createSession')` 一类。

- [ ] **Step 3: 实现 `timer/src/engine.js`**

按规格 §3 与上面的补充实现。建议的内部结构：

```js
/* engine.js: pure timing engine for the debate timer. No DOM; never reads the clock itself. */
(function (DT) {
  'use strict';
  const HISTORY_MAX = 100;
  const STALE_MS = 1500;
  const DEFAULT_BELLS = Object.freeze({ warn: [30], countdown: 0, end: 'double' });
  const BREAK_BELLS = Object.freeze({ warn: [], countdown: 0, end: 'chime' });
  const END_SOUND = { double: 'double', triple: 'triple', long: 'long', chime: 'chime', none: null };
  const clone = v => JSON.parse(JSON.stringify(v));

  // DT.clock: the single time source for callers (UI, bells). Engine functions take `now` instead.
  const defaultNow = () => performance.timeOrigin + performance.now();
  let nowFn = defaultNow;
  DT.clock = { now: () => nowFn(), set(fn) { nowFn = fn; }, reset() { nowFn = defaultNow; } };

  function effectiveBells(format, stage) { /* default ← format ← stage; breaks start from BREAK_BELLS and skip format */ }
  function bellPoints(bells) { /* [{key:'w30', ms:30000, type:'warn'}, …, {key:'c5',…}, {key:'end', ms:0, type:'end'}] sorted by ms desc */ }
  function newRun(stage) { /* per §2.2 */ }
  function remaining(run, id, now) { /* per §2.2 */ }
  function commit(run, now) { /* used += now - since on the active clock; since = now if still running */ }
  function begin(session) { /* clone, clear feedback, push history */ }
  function refuse(session, code, message) { /* clone, set lastFeedback, no history */ }
  // … toggle, floor, pause, adjust, yieldTime, reset, goto, next, prev, insertExtra, undo, tick, upcomingBells, view, record, fmt
  DT.engine = { DEFAULT_BELLS, createSession, currentStage, getRun, remaining, view, toggle, floor, pause, adjust,
                yieldTime, reset, goto, next, prev, insertExtra, undo, tick, upcomingBells, record, fmt,
                effectiveBells, bellPoints };
})(window.DT = window.DT || {});
```

反馈文案（`message`）：`locked` → 「<正方/反方>时间已用完」（放弃的写「<方>已放弃剩余时间」）；`done` → 「本环节已结束」；`running` → 「先暂停再插入」；`extra-limit` → 「<方>的<组名>已经用过了」；`nothing-to-undo` → 「没有可以撤销的操作」；`not-dual` → 「这个环节只有一个计时器」。

- [ ] **Step 4: 运行，确认全部通过**

Run: `python timer/tests/run_js_tests.py`
Expected: 全部 PASS。

---

### Task 4: 赛制存取（store）

**Files:**
- Create: `timer/src/store.js`
- Create: `timer/tests/store.test.js`

**Interfaces:**
- Consumes: `DT.BUILTIN_FORMATS`（Task 2），`DT.engine.DEFAULT_BELLS`（Task 3）
- Produces: `DT.store`：
  - `useStorage(obj)`：注入 `{getItem, setItem, removeItem}`；默认 `window.localStorage`（取不到时用内存 Map）
  - `validateFormat(f) -> string[]`（空数组 = 通过）
  - `parseDuration(text) -> int | null`（秒，1–3600），`formatDuration(secs) -> 'm:ss'`
  - `loadFormats() -> Format[]`（内置在前按 `DT.BUILTIN_FORMATS` 顺序，存储里同 id 的覆盖它；然后用户赛制按存储顺序）
  - `saveFormats(list)`：只存用户赛制与和原样不同的内置赛制
  - `isPristine(f) -> bool`（内置且与原样相同）
  - `restoreBuiltin(list, id) -> list`
  - `newFormat() -> Format`（名字「新赛制」，一个 180 秒正方单方环节，id `u-…`）
  - `duplicateFormat(f) -> Format`（新 id，名字加「（副本）」，`builtin: false`，删掉 `source`）
  - `newStage(type) -> Stage`（`single`：「新环节」正方 180 秒；`dual`：「新环节」各 90 秒 first pro；`break`：「休息」30 秒）
  - `uid(prefix) -> string`
  - `exportFormats(list) -> string`（JSON，缩进 2）、`exportFileName(f) -> '<名称>.debate-timer.json'`（去掉 Windows 文件名非法字符 `\/:*?"<>|`）
  - `parseImport(text) -> {formats: Format[], errors: string[]}`
  - `addImported(list, f, mode) -> list`：`mode` 为 `'replace'`（同 id 覆盖）或 `'copy'`（换新 id，名字加「（导入）」，`builtin: false`）；没有冲突时直接追加，`builtin` 一律视为 false 除非 id 与某个内置赛制相同且 mode 为 replace
  - `loadSession() / saveSession(s) / clearSession()`（保存时把 `history` 截到最后 20 条）
  - `loadSettings() -> {volume: 0.8, muted: false, …存储里的}` / `saveSettings(obj)`
  - `loadLastMatch() / saveLastMatch(match)`
  - 存储键：`dt.formats.v1`、`dt.session.v1`、`dt.settings.v1`、`dt.lastMatch.v1`

校验文案（照抄；`N` 从 1 起数）：

| 情况 | 文案 |
|---|---|
| 不是对象 | `这不是一个赛制` |
| name 空 | `赛制名称不能为空` |
| name > 40 字 | `赛制名称最多 40 个字` |
| stages 不是非空数组 | `至少要有一个环节` |
| 环节 name 空 | `第 N 个环节：名称不能为空` |
| 环节 name > 40 字 | `第 N 个环节：名称最多 40 个字` |
| type 非法 | `第 N 个环节：计时方式只能是单方、双方或间隔` |
| secs 不是整数或 ≤ 0 | `第 N 个环节：时长要大于 0 秒` |
| secs > 3600 | `第 N 个环节：时长不能超过 60 分钟` |
| single 的 side 非 pro/con | `第 N 个环节：单方环节要选正方或反方` |
| dual 的 first 非 pro/con | `第 N 个环节：先发言的一方只能是正方或反方` |
| id 重复 | `第 N 个环节：编号和第 M 个环节重复` |
| bells.warn 非正整数数组 | `铃声：提示铃点要写成正整数秒`（环节级前面加 `第 N 个环节：`） |
| bells.countdown 非 0–10 整数 | `铃声：逐秒倒数最多 10 秒` |
| bells.end 非法 | `铃声：终止铃只能是两声、三声、长鸣或不响`（取值 double / triple / long / none / chime） |
| extras 某组 perSide < 1 | `可插入环节「组名」：每方次数至少 1 次` |
| extras 某组 variants 空 | `可插入环节「组名」：至少要有一种形式` |
| extras variant 的 type 不是 single | `可插入环节「组名」第 K 种：只能是单方环节` |
| extras variant secs 非法 | `可插入环节「组名」第 K 种：时长要大于 0 秒` |

`parseImport` 的错误：JSON 解析失败 → `文件不是有效的 JSON`；既不是 `{kind: 'debate-timer-formats'}` 也不像 Format（没有 `stages`）→ `这不是计时器的赛制文件`；`schema > 1` → `这个文件来自更新版本的计时器，请先更新计时器`；每个非法 Format → `「<名称或第 K 个>」：<该赛制第一条校验错误>`（只报第一条）。合法的照样返回在 `formats` 里，只补全下面这些缺省字段（不要加 `builtin`、`source` 等别的键，往返测试靠这一点）：没有 `id` 的补 `u-…`，没有 `theme` 的补 `hall`，没有 `bells` 的补默认，没有 `extras` 的补 `[]`，stage 没有 `id` 的补。

- [ ] **Step 1: 写失败的测试 `timer/tests/store.test.js`**

```js
(function () {
  const S = DT.store;
  function memStorage() {
    const m = new Map();
    return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m };
  }
  function good() {
    return { id: 'u-x', name: '周末模辩', theme: 'hall', bells: { warn: [30], countdown: 0, end: 'double' },
      stages: [{ id: 'a', name: '正方立论', type: 'single', side: 'pro', secs: 180 },
               { id: 'b', name: '自由辩', type: 'dual', side: null, secs: 120, first: 'con' },
               { id: 'c', name: '休息', type: 'break', side: null, secs: 30 }], extras: [] };
  }
  const withStage = patch => { const f = good(); Object.assign(f.stages[0], patch); return f; };

  DT.test('store: every builtin format validates', () => {
    assert.ok(DT.BUILTIN_FORMATS.length >= 5);
    DT.BUILTIN_FORMATS.forEach(f => assert.deepEqual(S.validateFormat(f), [], f.id));
    assert.deepEqual(S.validateFormat(good()), []);
  });

  DT.test('store: validation messages name the stage in Chinese', () => {
    assert.deepEqual(S.validateFormat(Object.assign(good(), { name: '' })), ['赛制名称不能为空']);
    assert.deepEqual(S.validateFormat(Object.assign(good(), { stages: [] })), ['至少要有一个环节']);
    assert.deepEqual(S.validateFormat(withStage({ secs: 0 })), ['第 1 个环节：时长要大于 0 秒']);
    assert.deepEqual(S.validateFormat(withStage({ secs: 3601 })), ['第 1 个环节：时长不能超过 60 分钟']);
    assert.deepEqual(S.validateFormat(withStage({ type: 'x' })), ['第 1 个环节：计时方式只能是单方、双方或间隔']);
    assert.deepEqual(S.validateFormat(withStage({ side: null })), ['第 1 个环节：单方环节要选正方或反方']);
    assert.deepEqual(S.validateFormat(withStage({ id: 'b' })), ['第 2 个环节：编号和第 1 个环节重复']);
    assert.deepEqual(S.validateFormat(withStage({ name: '长'.repeat(41) })), ['第 1 个环节：名称最多 40 个字']);
    const f = good(); f.stages[1].first = 'x';
    assert.deepEqual(S.validateFormat(f), ['第 2 个环节：先发言的一方只能是正方或反方']);
    assert.deepEqual(S.validateFormat(Object.assign(good(), { bells: { warn: [30], countdown: 11, end: 'double' } })), ['铃声：逐秒倒数最多 10 秒']);
    assert.deepEqual(S.validateFormat(withStage({ bells: { warn: [-5] } })), ['第 1 个环节：铃声：提示铃点要写成正整数秒']);
    assert.deepEqual(S.validateFormat(Object.assign(good(), { extras: [{ group: '奇袭', perSide: 0, variants: [{ name: 'x', type: 'single', secs: 60 }] }] })),
      ['可插入环节「奇袭」：每方次数至少 1 次']);
    assert.deepEqual(S.validateFormat(null), ['这不是一个赛制']);
  });

  DT.test('store: parseDuration accepts the written forms and rejects the rest', () => {
    const ok = { '3:00': 180, '180': 180, '180秒': 180, '180s': 180, '3分': 180, '3分钟': 180, '3分30秒': 210,
                 "1'30": 90, ' 2:05 ': 125, '1：30': 90, '60:00': 3600, '1': 1 };
    Object.keys(ok).forEach(k => assert.equal(S.parseDuration(k), ok[k], k));
    ['0', '', 'abc', '1:75', '61:00', '-5', '1.5', '3:', ':30', null, undefined].forEach(k => assert.equal(S.parseDuration(k), null, String(k)));
    assert.equal(S.formatDuration(180), '3:00');
    assert.equal(S.formatDuration(65), '1:05');
  });

  DT.test('store: builtins load first and edits override them', () => {
    const st = memStorage(); S.useStorage(st);
    let list = S.loadFormats();
    assert.equal(list[0].id, DT.BUILTIN_FORMATS[0].id);
    assert.ok(list.every(f => S.isPristine(f)));
    list[0] = Object.assign({}, list[0], { name: '改过的' });
    list.push(good());
    S.saveFormats(list);
    const stored = JSON.parse(st.getItem('dt.formats.v1'));
    assert.deepEqual(stored.formats.map(f => f.id), [DT.BUILTIN_FORMATS[0].id, 'u-x']);
    const again = S.loadFormats();
    assert.equal(again[0].name, '改过的');
    assert.equal(again[again.length - 1].id, 'u-x');
    const restored = S.restoreBuiltin(again, DT.BUILTIN_FORMATS[0].id);
    assert.ok(S.isPristine(restored[0]));
  });

  DT.test('store: bad storage never throws', () => {
    const st = memStorage(); S.useStorage(st);
    st.setItem('dt.formats.v1', '{not json'); st.setItem('dt.session.v1', 'x'); st.setItem('dt.settings.v1', '[');
    assert.equal(S.loadFormats().length, DT.BUILTIN_FORMATS.length);
    assert.equal(S.loadSession(), null);
    assert.deepEqual(S.loadSettings(), { volume: 0.8, muted: false });
    S.useStorage({ getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() {} });
    assert.equal(S.loadFormats().length, DT.BUILTIN_FORMATS.length);
    S.saveFormats([good()]);
  });

  DT.test('store: export then import round-trips', () => {
    const text = S.exportFormats([good()]);
    const back = S.parseImport(text);
    assert.deepEqual(back.errors, []);
    assert.deepEqual(back.formats[0], good());
    assert.deepEqual(S.parseImport(JSON.stringify(good())).formats[0].name, '周末模辩');
    assert.equal(S.exportFileName({ name: 'a/b:c' }), 'a_b_c.debate-timer.json');
  });

  DT.test('store: parseImport rejects broken, foreign and newer files', () => {
    assert.deepEqual(S.parseImport('{oops').errors, ['文件不是有效的 JSON']);
    assert.deepEqual(S.parseImport('{"hello": 1}').errors, ['这不是计时器的赛制文件']);
    assert.deepEqual(S.parseImport(JSON.stringify({ kind: 'debate-timer-formats', schema: 2, formats: [] })).errors,
      ['这个文件来自更新版本的计时器，请先更新计时器']);
    const bad = good(); bad.stages[0].secs = 0;
    const r = S.parseImport(S.exportFormats([bad, Object.assign(good(), { id: 'u-y' })]));
    assert.deepEqual(r.errors, ['「周末模辩」：第 1 个环节：时长要大于 0 秒']);
    assert.equal(r.formats.length, 1);
  });

  DT.test('store: parseImport fills defaults for minimal files', () => {
    const r = S.parseImport(JSON.stringify({ name: '极简', stages: [{ name: '立论', type: 'single', side: 'pro', secs: 60 }] }));
    assert.deepEqual(r.errors, []);
    const f = r.formats[0];
    assert.ok(/^u-/.test(f.id)); assert.equal(f.theme, 'hall');
    assert.deepEqual(f.bells, DT.engine.DEFAULT_BELLS); assert.deepEqual(f.extras, []);
    assert.ok(f.stages[0].id);
  });

  DT.test('store: import never touches existing formats on error', () => {
    const list = [good()];
    const r = S.parseImport('{oops');
    const after = r.formats.reduce((l, f) => S.addImported(l, f, 'copy'), list);
    assert.equal(after, list);
  });

  DT.test('store: addImported replaces or copies on id conflict', () => {
    const list = [good()];
    const incoming = Object.assign(good(), { name: '新版' });
    assert.equal(S.addImported(list, incoming, 'replace')[0].name, '新版');
    assert.equal(S.addImported(list, incoming, 'replace').length, 1);
    const copied = S.addImported(list, incoming, 'copy');
    assert.equal(copied.length, 2);
    assert.equal(copied[1].name, '新版（导入）');
    assert.ok(copied[1].id !== 'u-x');
    assert.equal(list.length, 1);
  });

  DT.test('store: new, duplicate and newStage give valid shapes', () => {
    assert.deepEqual(S.validateFormat(S.newFormat()), []);
    const d = S.duplicateFormat(DT.BUILTIN_FORMATS[0]);
    assert.equal(d.builtin, false); assert.ok(d.name.endsWith('（副本）'));
    assert.ok(d.id !== DT.BUILTIN_FORMATS[0].id); assert.equal(d.source, undefined);
    ['single', 'dual', 'break'].forEach(t => {
      const f = good(); f.stages.push(S.newStage(t));
      assert.deepEqual(S.validateFormat(f), [], t);
    });
  });

  DT.test('store: session is saved with a short history', () => {
    const st = memStorage(); S.useStorage(st);
    S.saveSession({ id: 's', history: new Array(60).fill({ x: 1 }) });
    assert.equal(S.loadSession().history.length, 20);
    S.clearSession();
    assert.equal(S.loadSession(), null);
    S.saveSettings({ volume: 0.3, muted: true });
    assert.deepEqual(S.loadSettings(), { volume: 0.3, muted: true });
    S.saveLastMatch({ proTeam: '甲' });
    assert.equal(S.loadLastMatch().proTeam, '甲');
  });
})();
```

- [ ] **Step 2: 运行，确认失败**

Run: `python timer/tests/run_js_tests.py --filter store`
Expected: 全部 FAIL（`DT.store` 未定义）。

- [ ] **Step 3: 实现 `timer/src/store.js`**

`parseDuration`：先 `String(text).trim()`，把全角冒号 `：` 换成 `:`，然后依次匹配：`^(\d+):(\d{2})$`（秒 < 60）、`^(\d+)'(\d{1,2})$`、`^(\d+)\s*(s|秒)?$`、`^(\d+)\s*分(钟)?(\s*(\d+)\s*秒)?$`。结果不在 1–3600 返回 null。

`isPristine(f)`：`f.builtin` 且 `JSON.stringify(canon(f)) === JSON.stringify(canon(原样))`，`canon` 按键排序。

- [ ] **Step 4: 运行，确认全部通过**

Run: `python timer/tests/run_js_tests.py`
Expected: 全部 PASS。

---

### Task 5: 铃声

**Files:**
- Create: `timer/src/bells.js`
- Create: `timer/tests/bells.test.js`

**Interfaces:**
- Consumes: `DT.clock.now()`（Task 3），`upcomingBells` 的条目形状 `{at, sound, clock}`（Task 3）
- Produces: `DT.bells`：`unlock()`、`isUnlocked()`、`setVolume(v)`、`setMuted(b)`、`play(sound)`、`schedule(list, now)`、`cancelAll()`、`_setContextFactory(fn)`（测试注入；`fn()` 返回一个 AudioContext 形状的对象）、`SOUNDS`（名字数组：`ding double triple long tick chime`）

合成参数见规格 §4。结构：

```js
/* bells.js: synthesized debate bells, scheduled on the audio clock so background throttling cannot delay them. */
(function (DT) {
  'use strict';
  let factory = () => new (window.AudioContext || window.webkitAudioContext)();
  let ctx = null, master = null, volume = 0.8, muted = false;
  let pending = [];     // last list passed to schedule(), replayed after unlock
  let live = [];        // {node, key} currently scheduled, stopped by cancelAll()
  // strike(t, f0, decay): three sine partials (1, 2.76, 5.40 × f0; gains 1, .35, .15) through one gain envelope
  // voices: ding(t) strike(t,1318,1.4); double(t) ding(t)+ding(t+.32); triple: 3 × .28; long(t) strike(t,1046,3);
  //         tick(t) 1760 Hz sine 45 ms + band-passed noise burst; chime(t) C6 (1046.5) at t, G6 (1568) at t+.35, 0.7 s each
  // schedule(list, now): cancelAll(); pending = list; if (!ctx) return;
  //   for each item with at >= now - 20, dedupe by sound+'@'+at, start at ctx.currentTime + (at - now) / 1000
  // unlock(): create ctx on first call, ctx.resume(), then schedule(pending, DT.clock.now())
  DT.bells = { /* … */ };
})(window.DT = window.DT || {});
```

每个声音函数返回它创建的所有源节点（振荡器、BufferSource），`live` 记下它们，`cancelAll` 对每个调用 `stop(0)`（包 try/catch）并 `disconnect()`。`master.gain.value = muted ? 0 : volume`。

- [ ] **Step 1: 写失败的测试 `timer/tests/bells.test.js`**

```js
(function () {
  const B = DT.bells;
  function fakeCtx() {
    const started = [];
    function param() { return { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} }; }
    function node(kind) {
      return { kind, frequency: param(), gain: param(), Q: param(), type: '', buffer: null,
        connect() { return this; }, disconnect() { this.disconnected = true; },
        start(t) { this.startAt = t; started.push(this); }, stop(t) { this.stopAt = t; } };
    }
    return {
      currentTime: 10, state: 'running', destination: node('dest'), sampleRate: 48000, started,
      resume() { this.state = 'running'; return Promise.resolve(); },
      createOscillator: () => node('osc'), createGain: () => node('gain'), createBiquadFilter: () => node('filter'),
      createBufferSource: () => node('buf'),
      createBuffer: (ch, len) => ({ getChannelData: () => new Float32Array(len) }),
    };
  }
  let ctx;
  function fresh() { ctx = fakeCtx(); B._setContextFactory(() => ctx); B._resetForTests(); }

  DT.test('bells: schedule places sounds on the audio clock, not on timers', () => {
    fresh(); DT.clock.set(() => 5000); B.unlock();
    B.schedule([{ at: 7500, sound: 'ding', clock: 'main' }], 5000);
    const starts = ctx.started.map(n => n.startAt);
    assert.ok(starts.length >= 3);
    starts.forEach(t => assert.near(t, 12.5, 0.01));
    DT.clock.reset();
  });

  DT.test('bells: schedule dedupes, skips the past and replaces the previous plan', () => {
    fresh(); DT.clock.set(() => 0); B.unlock();
    B.schedule([{ at: 1000, sound: 'ding' }, { at: 1000, sound: 'ding' }, { at: -5000, sound: 'ding' }], 0);
    const first = ctx.started.length;
    assert.ok(first >= 3);
    B.schedule([{ at: 2000, sound: 'tick' }], 0);
    ctx.started.slice(0, first).forEach(n => assert.ok(n.stopAt !== undefined, 'old nodes stopped'));
    DT.clock.reset();
  });

  DT.test('bells: double and triple strike two and three times', () => {
    fresh(); DT.clock.set(() => 0); B.unlock();
    B.schedule([{ at: 0, sound: 'ding' }], 0); const one = ctx.started.length; B.cancelAll();
    ctx.started.length = 0; B.schedule([{ at: 0, sound: 'double' }], 0); assert.equal(ctx.started.length, one * 2);
    ctx.started.length = 0; B.schedule([{ at: 0, sound: 'triple' }], 0); assert.equal(ctx.started.length, one * 3);
    DT.clock.reset();
  });

  DT.test('bells: nothing plays before unlock, then the future part is scheduled', () => {
    fresh(); DT.clock.set(() => 0);
    B.schedule([{ at: 1000, sound: 'ding' }, { at: 9000, sound: 'double' }], 0);
    assert.equal(ctx.started.length, 0);
    assert.equal(B.isUnlocked(), false);
    DT.clock.set(() => 5000); B.unlock();
    assert.ok(B.isUnlocked());
    assert.ok(ctx.started.length > 0);
    ctx.started.forEach(n => assert.ok(n.startAt >= 10 + 3.9, 'only the 9000 ms bell'));
    DT.clock.reset();
  });

  DT.test('bells: mute and volume drive the master gain', () => {
    fresh(); DT.clock.set(() => 0); B.unlock();
    B.setVolume(0.5); assert.near(B._master().gain.value, 0.5, 1e-9);
    B.setMuted(true); assert.equal(B._master().gain.value, 0);
    B.setMuted(false); assert.near(B._master().gain.value, 0.5, 1e-9);
    DT.clock.reset();
  });

  DT.test('bells: every named sound can be played', () => {
    fresh(); DT.clock.set(() => 0); B.unlock();
    B.SOUNDS.forEach(name => { const n = ctx.started.length; B.play(name); assert.ok(ctx.started.length > n, name); });
    DT.clock.reset();
  });
})();
```

测试还用到两个仅供测试的函数：`_resetForTests()`（清掉 ctx、master、pending、live，音量回到 0.8、取消静音）与 `_master()`（返回 master GainNode）。把它们加进 Produces。

- [ ] **Step 2: 运行，确认失败**

Run: `python timer/tests/run_js_tests.py --filter bells`
Expected: FAIL。

- [ ] **Step 3: 实现 `timer/src/bells.js`**

- [ ] **Step 4: 运行，确认全部通过**

Run: `python timer/tests/run_js_tests.py`
Expected: 全部 PASS。

---

### Task 6: 投影画面（render）、样式与主题

**Files:**
- Create: `timer/src/render.js`
- Create: `timer/src/styles/base.css`、`timer/src/styles/stage.css`
- Create: `timer/src/themes/hall.css`、`timer/src/themes/daylight.css`、`timer/src/themes/chroma.css`
- Create: `timer/tests/render.test.js`

**Interfaces:**
- Consumes: `DT.engine.view()` 的 View（Task 3），`DT.engine.fmt`
- Produces: `DT.render.mount(root) -> handle`，`handle.update(view)`、`handle.pulse(event)`（event 来自 `tick`：`warn` → 一圈波纹；`end` → 两圈；`count` → 数字轻弹；`switch` → 无额外动作，版式过渡本身就是动画）、`handle.toast(message)`、`handle.destroy()`
- Produces: DOM 契约（主题 CSS 与后续任务都依赖，名字照抄）：

```
<div class="dt-stage" data-mode="title|stage|end" data-kind="single|dual|break" data-side="pro|con|none"
     data-phase="calm|warn|count|over|done" data-running="true|false" data-theme="hall" data-pro-seat="left|right"
     data-long="true|false" style="--used:0.42; --tension:0.42; --warn-at:0.25">
  <div class="dt-backdrop"></div>            主题的 --backdrop
  <div class="dt-deco"></div>                主题装饰层
  <div class="dt-field"></div>               单方/间隔的全屏色场（CSS 用 --used 与 data-side、data-pro-seat 决定 clip-path）
  <div class="dt-warnline"></div>            提示铃点金线（--warn-at）
  <header class="dt-top"><span class="dt-match"></span><span class="dt-format"></span></header>
  <section class="dt-head"><h1 class="dt-title"></h1><p class="dt-speaker"></p></section>
  <div class="dt-clock" data-clock="main"><span class="dt-digits"><span class="dt-sign"></span><span class="dt-min"></span><span class="dt-colon">:</span><span class="dt-sec"></span></span><span class="dt-state"></span></div>
  <div class="dt-halves">                    仅 dual
    <div class="dt-half" data-side="pro" data-active data-locked style="--remain:0.8">
      <div class="dt-half-field"></div><div class="dt-team"></div><div class="dt-clock" data-clock="pro">…同上…</div><div class="dt-floorline"></div>
    </div>
    <div class="dt-half" data-side="con">…</div>
  </div>
  <section class="dt-card">                  开场卡 / 间隔 / 结束卡的辩题、队名、记录
    <div class="dt-motions"><p class="dt-motion" data-side="pro"></p><p class="dt-motion" data-side="con"></p></div>
    <div class="dt-teams"><span data-side="pro"></span><span data-side="con"></span></div>
    <table class="dt-record"></table>
  </section>
  <div class="dt-rings"></div>
  <footer class="dt-bottom"><div class="dt-progress"><i class="dt-seg" data-state data-side data-block data-kind></i>…</div><div class="dt-next"></div></footer>
  <div class="dt-toast" role="status" aria-live="polite"></div>
</div>
```

- `data-long="true"`：环节名超过 14 字时，标题字号降一级（`.dt-stage[data-long="true"] .dt-title`）
- `dual` 未开始（`active` 为 null）时，`.dt-halves` 带 `data-idle`，两半等宽，底部 `.dt-next` 位置显示「空格开始，先由正方发言」
- 结束卡的 `.dt-record` 由 `update(view)` 在 `mode === 'end'` 时根据 `view.record`（由调用方放进 view：`Object.assign(view, {record: DT.engine.record(s, now)})`）填表；没有 `record` 就不显示表
- 进度条的 `.dt-seg` 数量等于 `view.progress.length`；`block` 变化处加 `data-gap`
- 标题、发言人、辩题用 `textContent` 写入（防注入）
- 换环节检测：`view.stage.id` 变了 → 给根元素加 `is-entering` 类，600ms 后移除（重复触发要先移除再强制回流再加）
- `update` 每帧调用，除了换环节与模式变化，只改文本与 CSS 变量，不重建 DOM
- `--tension`：`clamp(1 - fraction, 0, 1)`；`over` 与 `done` 时为 1；间隔环节恒为 0

视觉：严格按规格 §5.2–5.6。给实现者的要点：

- `base.css` 定义变量契约的默认值（取「堂」的值）、`@font-face` 不需要（全部系统字体）、`.dt-stage` 的尺寸基准：`position: fixed; inset: 0` 仅当它是 `body > #app` 的直接内容；在预览容器里用 `position: absolute; inset: 0`。为此 `.dt-stage` 一律 `position: absolute; inset: 0`，由外层容器决定大小；字号全部用**容器查询单位** `cqh` / `cqw`（外层 `.dt-stage-host { container-type: size; position: relative; }`），这样操作台里缩小的预览与全屏投影比例一致
- 数字：`.dt-digits { font-family: var(--font-digits); font-variant-numeric: tabular-nums; font-variation-settings: "wght" calc(300 + 400 * var(--tension)), "wdth" calc(100 - 22 * var(--tension)); }`（Chromium 支持 `calc()` 在 `font-variation-settings` 里；如果截图里看不到变化，改为在 `update` 里直接写 `style.fontVariationSettings`）
- 色场收回：`.dt-field { background: var(--side-color); clip-path: inset(0 calc(var(--used) * 100%) 0 0); }`，`[data-pro-seat="right"][data-side="pro"]` 与 `[data-pro-seat="left"][data-side="con"]` 改成 `inset(0 0 0 calc(var(--used) * 100%))`；底色 `.dt-stage { background: var(--side-deep) }`。`--side-color` / `--side-deep` 由 `[data-side="pro"]` 映射到 `--pro` / `--pro-deep`
- `dual` 的两半：`.dt-halves { display: grid; grid-template-columns: var(--left-col) var(--right-col); transition: grid-template-columns 520ms cubic-bezier(.34,1.36,.64,1); }`，发言方 58%；`.dt-half-field { height: calc(var(--remain) * 100%); align-self: end; }`
- 波纹：`handle.pulse` 往 `.dt-rings` 里插一个 `<i class="dt-ring">`，动画结束（`animationend`）后移除
- `@media (prefers-reduced-motion: reduce)`：`.dt-stage *, .dt-stage { animation: none !important; transition: none !important; }`，波纹不插入
- 主题文件第一行必须是 `/* @theme id=<id> name=<名称> desc=<说明> */`
- 「昼」与「绿幕」的差异见规格 §5.6

- [ ] **Step 1: 写失败的测试 `timer/tests/render.test.js`**

```js
(function () {
  const E = DT.engine, R = DT.render;
  const T0 = 1000000;
  const MATCH = { title: '第 1 场', proMotion: '人工智能利大于弊', conMotion: '人工智能弊大于利', proTeam: '物理学院', conTeam: '化学院', proSeat: 'left' };
  const F = () => DT.BUILTIN_FORMATS.find(f => f.id === 'ustc-freshman-cup');
  function host() {
    const box = document.getElementById('sandbox');
    box.innerHTML = '<div class="dt-stage-host" style="width:960px;height:540px"></div>';
    return box.firstChild;
  }
  function session(idx) { return E.goto(E.createSession(F(), MATCH, T0), idx, T0); }
  const stageIdx = name => F().stages.findIndex(s => s.name === name);

  DT.test('render: title card shows both motions and teams', () => {
    const h = R.mount(host());
    h.update(E.view(E.createSession(F(), MATCH, T0), T0));
    const root = document.querySelector('.dt-stage');
    assert.equal(root.dataset.mode, 'title');
    assert.equal(root.querySelector('.dt-motion[data-side="pro"]').textContent, '人工智能利大于弊');
    assert.equal(root.querySelector('.dt-teams [data-side="con"]').textContent, '化学院');
    h.destroy();
  });

  DT.test('render: single stage sets side, digits and the used fraction', () => {
    const h = R.mount(host());
    let s = E.toggle(session(0), T0);
    h.update(E.view(s, T0 + 60000));
    const root = document.querySelector('.dt-stage');
    assert.equal(root.dataset.kind, 'single'); assert.equal(root.dataset.side, 'pro');
    assert.equal(root.dataset.running, 'true'); assert.equal(root.dataset.phase, 'calm');
    assert.equal(root.querySelector('.dt-min').textContent + ':' + root.querySelector('.dt-sec').textContent, '2:00');
    assert.near(parseFloat(root.style.getPropertyValue('--used')), 1 / 3, 1e-3);
    assert.equal(root.querySelector('.dt-title').textContent, '正方一辩开篇立论');
    assert.equal(root.querySelectorAll('.dt-seg').length, F().stages.length);
    h.destroy();
  });

  DT.test('render: overtime shows a plus sign and the over phase', () => {
    const h = R.mount(host());
    const s = E.toggle(session(0), T0);
    h.update(E.view(s, T0 + 187000));
    const root = document.querySelector('.dt-stage');
    assert.equal(root.dataset.phase, 'over');
    assert.equal(root.querySelector('.dt-sign').textContent, '+');
    assert.equal(root.style.getPropertyValue('--tension').trim(), '1');
    h.destroy();
  });

  DT.test('render: dual stage marks the active and locked halves', () => {
    const h = R.mount(host());
    let s = E.toggle(session(stageIdx('自由辩论')), T0);
    s = E.tick(s, T0 + 241000).session;
    h.update(E.view(s, T0 + 241000));
    const pro = document.querySelector('.dt-half[data-side="pro"]');
    const con = document.querySelector('.dt-half[data-side="con"]');
    assert.ok(pro.hasAttribute('data-locked'));
    assert.ok(con.hasAttribute('data-active'));
    assert.ok(!document.querySelector('.dt-halves').hasAttribute('data-idle'));
    h.destroy();
  });

  DT.test('render: an idle dual stage says who speaks first', () => {
    const h = R.mount(host());
    h.update(E.view(session(stageIdx('自由辩论')), T0));
    assert.ok(document.querySelector('.dt-halves').hasAttribute('data-idle'));
    assert.ok(document.querySelector('.dt-next').textContent.indexOf('先由正方发言') >= 0);
    h.destroy();
  });

  DT.test('render: seats follow the match setting', () => {
    const h = R.mount(host());
    const s = E.goto(E.createSession(F(), Object.assign({}, MATCH, { proSeat: 'right' }), T0), 0, T0);
    h.update(E.view(s, T0));
    assert.equal(document.querySelector('.dt-stage').dataset.proSeat, 'right');
    const halves = E.goto(E.createSession(F(), Object.assign({}, MATCH, { proSeat: 'right' }), T0), stageIdx('自由辩论'), T0);
    h.update(E.view(halves, T0));
    const order = [...document.querySelectorAll('.dt-half')].map(x => x.dataset.side);
    assert.deepEqual(order, ['con', 'pro']);
    h.destroy();
  });

  DT.test('render: changing stage plays the entrance once', () => {
    const h = R.mount(host());
    let s = session(0);
    h.update(E.view(s, T0));
    const root = document.querySelector('.dt-stage');
    root.classList.remove('is-entering');
    h.update(E.view(s, T0 + 16));
    assert.ok(!root.classList.contains('is-entering'));
    s = E.next(s, T0 + 100);
    h.update(E.view(s, T0 + 100));
    assert.ok(root.classList.contains('is-entering'));
    h.destroy();
  });

  DT.test('render: long names get the long class and text is not parsed as HTML', () => {
    const f = JSON.parse(JSON.stringify(F()));
    f.stages[0].name = '<b>正方一辩开篇立论加上一段很长很长的补充说明</b>';
    const h = R.mount(host());
    h.update(E.view(E.goto(E.createSession(f, MATCH, T0), 0, T0), T0));
    const root = document.querySelector('.dt-stage');
    assert.equal(root.dataset.long, 'true');
    assert.equal(root.querySelector('.dt-title b'), null);
    h.destroy();
  });

  DT.test('render: pulse adds a ring that removes itself', () => {
    const h = R.mount(host());
    h.update(E.view(E.toggle(session(0), T0), T0));
    h.pulse({ type: 'warn' });
    assert.equal(document.querySelectorAll('.dt-ring').length, 1);
    h.destroy();
  });

  DT.test('render: end card lists the record when given', () => {
    const h = R.mount(host());
    let s = E.toggle(session(0), T0); s = E.goto(s, 99, T0 + 190000);
    const v = Object.assign(E.view(s, T0 + 190000), { record: E.record(s, T0 + 190000) });
    h.update(v);
    assert.equal(document.querySelector('.dt-stage').dataset.mode, 'end');
    assert.ok(document.querySelectorAll('.dt-record tr').length >= F().stages.length);
    h.destroy();
  });

  DT.test('render: every theme file declares its metadata line', () => {
    // build.py injects DT.THEMES only in the built file; in tests the stylesheet is not loaded,
    // so this checks the render side: unknown theme ids fall back to hall.
    const h = R.mount(host());
    const v = E.view(session(0), T0); v.theme = 'nope';
    h.update(v);
    assert.equal(document.querySelector('.dt-stage').dataset.theme, 'hall');
    h.destroy();
  });
})();
```

`render.js` 判断主题是否存在：`DT.THEMES`（构建时注入）存在时，`view.theme` 不在其中就用 `hall`；`DT.THEMES` 不存在时（测试页），只接受 `hall`、`daylight`、`chroma` 三个 id。

- [ ] **Step 2: 运行，确认失败**

Run: `python timer/tests/run_js_tests.py --filter render`
Expected: FAIL。

- [ ] **Step 3: 实现 `render.js`、`base.css`、`stage.css` 与三个主题**

- [ ] **Step 4: 运行，确认全部通过**

Run: `python timer/tests/run_js_tests.py`
Expected: 全部 PASS。视觉验收在 Task 7 截图后做。

---

### Task 7: 单文件构建、演示态与截图

**Files:**
- Modify: `timer/build.py`（加 `themes_meta()`、`inline_html()`，`main()` 的 outputs 加 `OUT`）
- Create: `timer/src/demo.js`
- Create: `timer/src/ui.js`（本任务只做启动、路由、演示态渲染与 rAF 循环；交互在 Task 8）
- Create: `timer/tests/screenshots.py`
- Modify: `timer/tests/test_build.py`（加内联测试）
- Create: `timer/debate-timer.html`（生成）

**Interfaces:**
- Consumes: 前面全部模块
- Produces:
  - `build.themes_meta() -> [{"id","name","desc"}]`（读 `themes/*.css` 第一行 `/* @theme id=… name=… desc=… */`，缺这行就 `FormatError`）
  - `build.inline_html(formats) -> str`：读 `src/index.html`，删掉原有的 `<link rel="stylesheet" …>` 与 `<script src=…></script>` 标签，在 `</head>` 前放一个 `<style>`（按 `style_files()` 顺序拼接，每段前加 `/* === <相对路径> === */`），在 `</body>` 前放一个 `<script>`：先 `window.DT = window.DT || {}; DT.THEMES = <json>;`，然后按 `ORDER` 拼接每个脚本（每段前加注释）。`builtin-formats.js` 用 `builtin_js(formats)` 的内容（不读磁盘，保证 `--check` 一致）。文件开头 `<!doctype html>` 之后加注释 `<!-- 由 timer/build.py 生成。改源码请改 timer/src/，改完运行 python timer/build.py。赛制来源：… -->`
  - 内联时脚本里若出现 `</script`，替换成 `<\/script`
  - `DT.demo`：`DT.demo.names -> string[]`，`DT.demo.build(name, now) -> {route, session?, settings?, theme?}`；`route` 取值 `timer`、`setup`、`editor`、`console`（后三者由 Task 9–11 实现，本任务先只实现 timer 类演示）
  - `DT.app.boot({root, storage?, clock?, bells?, location?}) -> controller`：controller 至少有 `session()`、`view()`、`destroy()`；Task 8 扩展
  - 自动启动：`document.body.hasAttribute('data-dt-autoboot')` 时 `DOMContentLoaded` 后 `DT.app.boot({root: document.getElementById('app')})`
  - 路由：`location.search` 有 `demo=<名>` → 演示态（`frozen=1` 时 `DT.clock.set(() => 固定值)`；演示态不写 localStorage，用内存存储）；`location.hash === '#projector'` → 投影窗口（Task 11）；否则 → 开赛页（Task 9 之前临时：直接用第一个内置赛制开一场并进入开场卡）

本任务要实现的演示态（全部用新生赛，场次「新生赛 第 3 场」，辩题「大学生应该 / 不应该优先发展兴趣」，队名「物理学院」「化学院」）：

| 名 | 画面 |
|---|---|
| `title` | 开场卡 |
| `single` | 正方一辩开篇立论，已用 73 秒，在走（剩 1:47） |
| `cross` | 反方四辩质询正方一辩，剩 0:24（warn 态） |
| `over` | 反方四辩结辩超时 7 秒 |
| `dual` | 自由辩论，正方发言剩 2:31，反方剩 3:12 |
| `dual-locked` | 自由辩论，反方已用完，正方发言剩 0:48 |
| `dual-idle` | 自由辩论还没开始 |
| `break` | 评委打分剩 0:18 |
| `end` | 结束卡，每个环节都有用时，两个环节超时 |
| `daylight` | 同 `single`，主题「昼」 |
| `chroma` | 同 `dual`，主题「绿幕」 |
| `seat-right` | 同 `dual`，正方坐右 |
| `long` | 自造一个 40 字的环节名、60 分钟的单方环节 |

`demo.js` 用 `DT.engine` 的动作从 `createSession` 起推演出这些状态（例如 `single`：`goto 0`、`toggle @T0`，然后以 `T0 + 73000` 作为冻结的 now），不要手写 session JSON。

`timer/tests/screenshots.py`：

```
python timer/tests/screenshots.py [--size 1920x1080] [--only 名字,名字] [--html timer/debate-timer.html]
```

对 `DT.demo.names` 里每一个（名字清单写在脚本里的常量 `DEMOS`，与 `demo.js` 保持一致；测试检查两边一致），运行 `msedge --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --window-size=W,H --virtual-time-budget=3000 --screenshot=<out> "<file uri>?demo=<名>&frozen=1"`，输出到 `timer/tests/out/<W>x<H>/<名>.png`，打印路径。复用 `run_js_tests.find_browser()`。

- [ ] **Step 1: 在 `test_build.py` 加失败的内联测试**

```python
class InlineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = build.inline_html(build.parse_all(FORMATS))

    def test_no_external_references(self):
        import re
        self.assertIsNone(re.search(r'<script[^>]+src=', self.html))
        self.assertIsNone(re.search(r'<link[^>]+href=', self.html))
        self.assertNotIn("http://", self.html.replace("http://www.w3.org", ""))
        self.assertNotIn("https://", self.html)

    def test_every_source_is_inlined_in_order(self):
        positions = [self.html.index(f"=== {name} ===") for name in build.ORDER]
        self.assertEqual(positions, sorted(positions))
        for p in build.style_files():
            self.assertIn(f"=== {p.relative_to(build.SRC).as_posix()} ===", self.html)

    def test_themes_are_declared(self):
        ids = [t["id"] for t in build.themes_meta()]
        self.assertEqual(sorted(ids), ["chroma", "daylight", "hall"])
        self.assertIn('DT.THEMES = ', self.html)

    def test_generated_banner(self):
        self.assertIn("由 timer/build.py 生成", self.html[:400])

    def test_demo_names_match_screenshots(self):
        import re
        demo_js = (build.SRC / "demo.js").read_text(encoding="utf-8")
        sys.path.insert(0, str(HERE))
        import screenshots
        for name in screenshots.DEMOS:
            self.assertIn(f"'{name}'", demo_js)
```

Run: `python -m unittest discover -s timer/tests -p "test_*.py" -v` → 新测试 FAIL。

- [ ] **Step 2: 实现 `build.py` 的内联、`demo.js`、`ui.js` 启动部分、`screenshots.py`**

- [ ] **Step 3: 构建并跑全部测试**

Run: `python timer/build.py && python timer/build.py --check && python -m unittest discover -s timer/tests -p "test_*.py" && python timer/tests/run_js_tests.py`
Expected: 全部通过。

- [ ] **Step 4: 截图并逐张看**

Run: `python timer/tests/screenshots.py` 与 `python timer/tests/screenshots.py --size 1366x768`
然后用 Read 工具逐张打开 PNG 看。对照规格 §5 检查并修改 CSS，直到：

- 数字清楚、居中，没有被裁切；小数点、冒号不跳动（tabular-nums）
- 色场颜色与方向正确（正方在左时正方的色场从右往左收回；`seat-right` 相反）
- 自由辩发言方明显更宽、更亮；锁定方显示「时间到」
- 标题、发言人、顶栏、底栏在 1366×768 下不溢出、不重叠
- `long` 截图标题没有溢出（必要时两行，行高 1.2）
- `daylight` 在亮底上对比度足够；`chroma` 背景是纯 `#00B140`
- 画面给人的感觉是"屋子被一方的颜色占据"，而不是"一个表盘挂在背景上"

---

### Task 8: 计时交互（键盘、控制条、覆盖层、铃声接线、持久化）

**Files:**
- Modify: `timer/src/ui.js`
- Create: `timer/src/styles/console.css`（控制条、抽屉、覆盖层、提示条部分）
- Modify: `timer/src/demo.js`（无新演示态）
- Create: `timer/tests/ui.test.js`

**Interfaces:**
- Consumes: engine、store、bells、render、demo
- Produces: controller 扩展为：`session()`、`view()`、`key(code, {shiftKey, ctrlKey, repeat}?)`（与真实键盘事件走同一条路径）、`act(name, ...args)`（控制条按钮与投影窗口转发共用：`toggle floor pause undo next prev adjust reset yield bell insert mute fullscreen`）、`openOverlay(name)` / `closeOverlay()`（`stages help insert record`）、`on(event, fn)`（`change`、`events`）、`destroy()`
- `DT.app.boot` 选项：`{root, storage, clock, bells, location, route}`；`bells` 可注入假对象（测试用 `{unlock(){}, isUnlocked(){return true}, schedule(){}, cancelAll(){}, play(){}, setVolume(){}, setMuted(){}}`）

行为（规格 §5.7、§5.8、§5.12）：

- 键盘监听挂在 `window`，`controller.key` 是唯一入口；`keydown` 处理：`if (isEditable(e.target)) return; if (e.isComposing) return;` 然后 `controller.key(e.code, e)`，处理了就 `preventDefault()`
- 连按两次：R、G；第一次调用 `render.toast('再按一次 R 重置本环节')` / `'再按一次 G 放弃剩余时间'`，记下时间，1.5 秒内第二次才执行
- 每个动作后：`store.saveSession(s)`；`bells.schedule(engine.upcomingBells(s, now), now)`；若有 `lastFeedback` 就 toast
- rAF 循环：`const out = engine.tick(s, now)`；session 有变化（自动转换、铃点标记）则保存；`out.events` 交给 `render.pulse`；`render.update(view)`
- 第一次 `keydown` / `pointerdown` 调 `bells.unlock()`；未解锁时屏幕右上角显示「按任意键启用声音」小药丸，解锁后淡出
- 控制条：单屏模式下 `pointermove` 显示，2.5 秒无移动收起；Tab 键聚焦时显示；按钮文字见规格 §5.7；类型不适用的按钮 `disabled`
- 覆盖层：`S` 环节列表（左侧抽屉，点击跳转）、`H`/`?` 帮助（键位表，从规格 §5.8 复制）、`X` 插入（列出 `view.extras`，每个 variant × 正方 / 反方按钮，用完的置灰并写「已用」）、`Shift+S` 本场记录（`engine.record` 的表，另有「复制为文本」按钮，复制成 `环节\t计划\t实际\t超时` 的制表符文本）。Esc 关闭。覆盖层打开时，除 Esc 与该覆盖层自己的快捷键外，计时快捷键仍然有效（计时员可能边看列表边操作）
- `F`：`document.fullscreenElement ? exitFullscreen() : root.requestFullscreen()`
- `M`：切换静音并存 `dt.settings.v1`；静音时屏幕右上角显示一个静音标记
- `B`：`bells.play('ding')`
- 启动时：`store.loadSession()` 有未结束的场次（`cursor < timeline.length`）且路由是计时页时直接恢复（开赛页的恢复横幅在 Task 9）
- 本任务不注册 `E` 和 `O`：`E` 由 Task 10 注册，`O` 由 Task 11 注册

- [ ] **Step 1: 写失败的测试 `timer/tests/ui.test.js`**

```js
(function () {
  const T0 = 5000000;
  function memStorage() {
    const m = new Map();
    return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
  }
  function fakeBells() {
    const log = { scheduled: [], played: [], unlocked: 0 };
    return { log, unlock() { log.unlocked++; }, isUnlocked: () => log.unlocked > 0, schedule(list) { log.scheduled.push(list); },
      cancelAll() {}, play(s) { log.played.push(s); }, setVolume() {}, setMuted(m) { log.muted = m; } };
  }
  function boot(extra) {
    let now = T0;
    const clock = { now: () => now, advance: ms => { now += ms; } };
    DT.clock.set(() => now);
    const box = document.getElementById('sandbox'); box.innerHTML = '<div id="app-under-test"></div>';
    const bells = fakeBells();
    const storage = (extra && extra.storage) || memStorage();
    const c = DT.app.boot(Object.assign({ root: box.firstChild, storage, bells, route: 'timer',
      formatId: 'ustc-freshman-cup', match: { title: '测试', proMotion: '甲', conMotion: '乙', proTeam: '', conTeam: '', proSeat: 'left' } }, extra || {}));
    return { c, clock, bells, storage, done() { c.destroy(); DT.clock.reset(); } };
  }
  const press = (code, opts) => window.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ code, key: 'Process', bubbles: true }, opts || {})));

  DT.test('ui: space leaves the title card, then starts and pauses', () => {
    const t = boot();
    press('Space'); assert.equal(t.c.session().cursor, 0);
    press('Space'); assert.ok(DT.engine.getRun(t.c.session()).running);
    t.clock.advance(5000);
    press('Space'); assert.equal(DT.engine.getRun(t.c.session()).running, false);
    t.done();
  });

  DT.test('ui: shortcuts work while an IME reports Process as the key', () => {
    const t = boot();
    press('ArrowRight'); press('ArrowRight');
    assert.equal(t.c.session().cursor, 1);
    press('PageUp'); assert.equal(t.c.session().cursor, 0);
    t.done();
  });

  DT.test('ui: typing in an input does not trigger shortcuts', () => {
    const t = boot();
    const input = document.createElement('input'); document.getElementById('sandbox').appendChild(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true }));
    assert.equal(t.c.session().cursor, -1);
    t.done();
  });

  DT.test('ui: A and L give the floor in free debate; Z undoes a wrong switch', () => {
    const t = boot();
    const idx = t.c.session().timeline.findIndex(s => s.name === '自由辩论');
    t.c.act('goto', idx);
    press('KeyA'); t.clock.advance(10000);
    press('KeyL'); t.clock.advance(3000);
    press('KeyZ');
    const r = DT.engine.getRun(t.c.session());
    assert.equal(r.active, 'pro');
    assert.equal(DT.engine.remaining(r, 'pro', T0 + 13000), 227000);
    t.done();
  });

  DT.test('ui: R needs a second press within 1.5 s', () => {
    const t = boot();
    press('Space'); press('Space'); t.clock.advance(20000); press('Space');
    press('KeyR');
    assert.equal(DT.engine.remaining(DT.engine.getRun(t.c.session()), 'main', DT.clock.now()), 160000);
    t.clock.advance(2000); press('KeyR');
    assert.equal(DT.engine.remaining(DT.engine.getRun(t.c.session()), 'main', DT.clock.now()), 160000);
    t.clock.advance(500); press('KeyR');
    assert.equal(DT.engine.remaining(DT.engine.getRun(t.c.session()), 'main', DT.clock.now()), 180000);
    t.done();
  });

  DT.test('ui: arrows adjust by one and five seconds', () => {
    const t = boot();
    press('Space'); press('Space');
    t.clock.advance(30000);
    press('ArrowUp'); press('ArrowUp', { shiftKey: true });
    assert.equal(DT.engine.remaining(DT.engine.getRun(t.c.session()), 'main', DT.clock.now()), 156000);
    t.done();
  });

  DT.test('ui: every action saves the session and reschedules bells', () => {
    const t = boot();
    press('Space'); press('Space');
    assert.ok(t.storage.getItem('dt.session.v1'));
    const last = t.bells.log.scheduled[t.bells.log.scheduled.length - 1];
    assert.ok(last.some(b => b.sound === 'double'));
    assert.ok(t.bells.log.unlocked >= 1);
    t.done();
  });

  DT.test('ui: reload resumes the running clock', () => {
    const storage = memStorage();
    let t = boot({ storage });
    press('Space'); press('Space');
    t.clock.advance(10000);
    t.done();
    let now = T0 + 40000;
    DT.clock.set(() => now);
    const box = document.getElementById('sandbox'); box.innerHTML = '<div></div>';
    const c = DT.app.boot({ root: box.firstChild, storage, bells: fakeBells(), route: 'timer' });
    assert.equal(c.session().cursor, 0);
    assert.equal(DT.engine.remaining(DT.engine.getRun(c.session()), 'main', now), 140000);
    c.destroy(); DT.clock.reset();
  });

  DT.test('ui: overlays open and close with their keys and Esc', () => {
    const t = boot();
    press('KeyS'); assert.ok(document.querySelector('.dt-overlay[data-name="stages"]'));
    press('Escape'); assert.equal(document.querySelector('.dt-overlay'), null);
    press('KeyH'); assert.ok(document.querySelector('.dt-overlay[data-name="help"]'));
    press('Escape');
    t.done();
  });

  DT.test('ui: B rings the bell and M mutes', () => {
    const t = boot();
    press('KeyB'); assert.deepEqual(t.bells.log.played, ['ding']);
    press('KeyM'); assert.equal(t.bells.log.muted, true);
    assert.equal(JSON.parse(t.storage.getItem('dt.settings.v1')).muted, true);
    t.done();
  });

  DT.test('ui: insert menu adds a surprise attack in the school cup', () => {
    const t = boot({ formatId: 'ustc-school-cup-2025' });
    press('Space'); press('Space'); t.clock.advance(1000); press('Space');
    press('KeyX');
    const btn = document.querySelector('.dt-overlay[data-name="insert"] button[data-side="con"][data-variant="0"]');
    assert.ok(btn); btn.click();
    assert.equal(t.c.session().timeline[1].name, '反方奇袭质询');
    t.done();
  });
})();
```

`boot` 的 `formatId` / `match` 选项：路由为 `timer` 且没有可恢复的场次时，用它们直接开一场（Task 9 前的临时入口，也方便测试）。

- [ ] **Step 2: 运行，确认失败**；**Step 3: 实现**；**Step 4: 全部测试通过**；**Step 5: 重新构建并截图**（`python timer/build.py`；截图检查控制条出现时不遮住数字：给 `screenshots.py` 加演示态 `dock`——控制条可见的 `single`；加到 `DEMOS` 与 `demo.js`）

---

### Task 9: 开赛页

**Files:**
- Create: `timer/src/setup.js`
- Create: `timer/src/styles/editor.css`（开赛页与编辑器共用的表单、列表样式；本任务写开赛页部分）
- Modify: `timer/src/ui.js`（路由：无场次 → 开赛页；开赛页「开始这一场」→ 计时页；计时页结束卡上「新的一场」→ 开赛页）
- Modify: `timer/src/demo.js`、`timer/tests/screenshots.py`（加 `setup`、`setup-resume` 演示态）
- Create: `timer/tests/setup.test.js`

**Interfaces:**
- Consumes: store（`loadFormats`、`loadSession`、`loadLastMatch`、`saveLastMatch`、`clearSession`），engine（`createSession`），`DT.THEMES`
- Produces: `DT.setup.mount(root, {formats, lastMatch, resumable, themes, onStart(format, match, theme), onResume(), onDiscard(), onEdit()}) -> {destroy()}`

版式与文案见规格 §5.9。要点：

- 赛制列表每项显示名称、环节数（不含间隔）、总时长（`dual` 按两倍算，含间隔，写成「约 42 分钟」）
- 队名空时 `match.proTeam` 存空字符串（渲染时显示「正方」「反方」由 render 负责，本任务在 render 里补：`proTeam || '正方'`）
- 「开始这一场」前校验：辩题两个表述都可以为空（队内练习常不填），不阻止开始
- 恢复横幅：`resumable` 存在时显示，「继续」调 `onResume`，「放弃并新开」调 `onDiscard`（ui 里 `store.clearSession()`）
- 键盘：Enter 在最后一个输入框里等同「开始这一场」；赛制列表可以用 ↑↓ 选择（列表获得焦点时）

测试（`setup.test.js`）：

```js
(function () {
  function mount(opts) {
    const box = document.getElementById('sandbox'); box.innerHTML = '<div></div>';
    const calls = [];
    const h = DT.setup.mount(box.firstChild, Object.assign({
      formats: DT.BUILTIN_FORMATS, lastMatch: { proTeam: '物理学院' }, resumable: null,
      themes: [{ id: 'hall', name: '堂' }, { id: 'daylight', name: '昼' }],
      onStart: (f, m, th) => calls.push(['start', f.id, m, th]), onResume: () => calls.push(['resume']),
      onDiscard: () => calls.push(['discard']), onEdit: () => calls.push(['edit']) }, opts || {}));
    return { box, h, calls };
  }
  DT.test('setup: lists every format with its stage count', () => {
    const t = mount();
    assert.equal(t.box.querySelectorAll('[data-format-id]').length, DT.BUILTIN_FORMATS.length);
    assert.ok(t.box.textContent.indexOf('中国科学技术大学新生辩论赛') >= 0);
    t.h.destroy();
  });
  DT.test('setup: prefills the last match and starts with the chosen format', () => {
    const t = mount();
    assert.equal(t.box.querySelector('input[name="proTeam"]').value, '物理学院');
    t.box.querySelector('[data-format-id="recruit-3v3"]').click();
    const con = t.box.querySelector('input[name="conTeam"]'); con.value = '化学院'; con.dispatchEvent(new Event('input'));
    t.box.querySelector('input[name="proSeat"][value="right"]').click();
    t.box.querySelector('button[data-action="start"]').click();
    const [kind, id, match, theme] = t.calls[0];
    assert.equal(kind, 'start'); assert.equal(id, 'recruit-3v3');
    assert.equal(match.conTeam, '化学院'); assert.equal(match.proSeat, 'right'); assert.equal(theme, 'hall');
    t.h.destroy();
  });
  DT.test('setup: offers to resume an unfinished match', () => {
    const t = mount({ resumable: { title: '第 3 场', cursor: 4 } });
    assert.ok(t.box.textContent.indexOf('上一场还没打完') >= 0);
    t.box.querySelector('button[data-action="resume"]').click();
    t.box.querySelector('button[data-action="discard"]').click();
    assert.deepEqual(t.calls.map(c => c[0]), ['resume', 'discard']);
    t.h.destroy();
  });
})();
```

`resumable` 形状：`{title, cursor}`，`title` 用场次名，没有就用正方辩题，都没有就用赛制名；横幅写「停在第 N 个环节」，N = cursor + 1。

步骤：写测试 → 确认失败 → 实现 → 测试通过 → 构建、截图 `setup` 与 `setup-resume`，逐张看。

---

### Task 10: 赛制编辑器

**Files:**
- Create: `timer/src/editor.js`
- Modify: `timer/src/styles/editor.css`
- Modify: `timer/src/ui.js`（注册 E 键；开赛页的「编辑赛制」；编辑器关闭后开赛页刷新赛制列表）
- Modify: `timer/src/demo.js`、`timer/tests/screenshots.py`（加 `editor`、`editor-error` 演示态）
- Create: `timer/tests/editor.test.js`

**Interfaces:**
- Consumes: store 的全部赛制函数，`DT.THEMES`
- Produces: `DT.editor.mount(root, {formats, selectedId, themes, onChange(list), onClose(), pickFiles?, saveFile?}) -> {destroy(), select(id)}`；`DT.editor.moveStage(format, from, to) -> Format`（纯函数，拖动与 Alt+↑↓ 共用）
- `pickFiles()`：返回 `Promise<string[]>`（文件文本）；默认实现用隐藏的 `<input type="file" accept=".json,application/json" multiple>` + `FileReader`；测试注入
- `saveFile(name, text)`：默认用 `Blob` + `URL.createObjectURL` + 临时 `<a download>`；测试注入

版式与行为见规格 §5.10。要点：

- 每次修改先在内存里改，`store.validateFormat` 通过才 `onChange(list)`（ui 里 `store.saveFormats(list)` 并显示「已保存」）；不通过时在出错的字段下方显示对应文案（`validateFormat` 的文案里带「第 N 个环节」，编辑器把它映射回那一行；时长输入的解析错误显示「时长写成 3:00 或 180」）
- 行内展开区（▸）：发言人、打分块、计时员提示、本环节铃声（下拉：跟随赛制 / 自定义；自定义时显示提示铃点、逐秒倒数、终止铃三个控件）
- 拖动：Pointer Events；拖动时被拖的行半透明、插入位置显示一条 2px 的金线；松手调用 `moveStage`
- 导入：同 id 冲突时弹出一个小对话框「已经有一个叫「X」的赛制」，按钮「覆盖」「另存一份」，分别调 `store.addImported(list, f, 'replace' | 'copy')`
- 删除用户赛制：对话框「删除「X」？此操作不能撤销」，按钮「删除」「取消」
- 关闭：Esc 或右上角「完成」；打开 / 关闭动画 260ms，从底部升起

测试（`editor.test.js`）至少包含：

```js
(function () {
  function mount(extra) {
    const box = document.getElementById('sandbox'); box.innerHTML = '<div></div>';
    DT.store.useStorage({ getItem: () => null, setItem() {}, removeItem() {} });
    const state = { list: DT.store.loadFormats(), changes: 0, saved: [] };
    const h = DT.editor.mount(box.firstChild, Object.assign({
      formats: state.list, selectedId: 'ustc-freshman-cup', themes: [{ id: 'hall', name: '堂' }],
      onChange: l => { state.list = l; state.changes++; }, onClose: () => { state.closed = true; },
      pickFiles: () => Promise.resolve(state.files || []), saveFile: (n, t) => state.saved.push([n, t]) }, extra || {}));
    return { box, h, state };
  }
  const current = st => st.list.find(f => f.id === 'ustc-freshman-cup');

  DT.test('editor: moveStage reorders without mutating', () => {
    const f = DT.BUILTIN_FORMATS[0];
    const g = DT.editor.moveStage(f, 0, 2);
    assert.equal(g.stages[2].id, f.stages[0].id);
    assert.equal(f.stages[0].id, DT.BUILTIN_FORMATS[0].stages[0].id);
  });

  DT.test('editor: adding a stage saves a valid format', () => {
    const t = mount();
    const before = current(t.state).stages.length;
    t.box.querySelector('button[data-action="add-stage"]').click();
    assert.equal(current(t.state).stages.length, before + 1);
    assert.deepEqual(DT.store.validateFormat(current(t.state)), []);
    t.h.destroy();
  });

  DT.test('editor: a bad duration shows a message and does not save', () => {
    const t = mount();
    const input = t.box.querySelector('[data-stage-index="0"] input[name="secs"]');
    input.value = '三分钟'; input.dispatchEvent(new Event('change'));
    assert.equal(t.state.changes, 0);
    assert.ok(t.box.querySelector('[data-stage-index="0"]').textContent.indexOf('时长写成 3:00 或 180') >= 0);
    input.value = '2:30'; input.dispatchEvent(new Event('change'));
    assert.equal(current(t.state).stages[0].secs, 150);
    assert.equal(input.value, '2:30');
    t.h.destroy();
  });

  DT.test('editor: switching a stage to dual swaps the side control for first speaker', () => {
    const t = mount();
    t.box.querySelector('[data-stage-index="0"] [data-type="dual"]').click();
    const s = current(t.state).stages[0];
    assert.equal(s.type, 'dual'); assert.equal(s.side, null); assert.equal(s.first, 'pro');
    assert.ok(t.box.querySelector('[data-stage-index="0"] [data-first="con"]'));
    t.h.destroy();
  });

  DT.test('editor: Alt+ArrowDown moves a stage', () => {
    const t = mount();
    const firstId = current(t.state).stages[0].id;
    const row = t.box.querySelector('[data-stage-index="0"]');
    row.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown', altKey: true, bubbles: true }));
    assert.equal(current(t.state).stages[1].id, firstId);
    t.h.destroy();
  });

  DT.test('editor: builtin formats cannot be deleted but can be restored', () => {
    const t = mount();
    assert.ok(t.box.querySelector('button[data-action="delete"]').disabled);
    t.box.querySelector('button[data-action="add-stage"]').click();
    t.box.querySelector('button[data-action="restore"]').click();
    assert.ok(DT.store.isPristine(current(t.state)));
    t.h.destroy();
  });

  DT.test('editor: export hands a named JSON file to saveFile', () => {
    const t = mount();
    t.box.querySelector('button[data-action="export"]').click();
    assert.equal(t.state.saved[0][0], '中国科学技术大学新生辩论赛.debate-timer.json');
    assert.equal(DT.store.parseImport(t.state.saved[0][1]).formats[0].id, 'ustc-freshman-cup');
    t.h.destroy();
  });

  DT.test('editor: importing a new format adds it; a broken file shows the reason', async () => {
    const t = mount();
    t.state.files = [JSON.stringify({ name: '周末模辩', stages: [{ name: '立论', type: 'single', side: 'pro', secs: 60 }] }), '{oops'];
    t.box.querySelector('button[data-action="import"]').click();
    await new Promise(r => setTimeout(r, 30));
    assert.ok(t.state.list.some(f => f.name === '周末模辩'));
    assert.ok(t.box.textContent.indexOf('文件不是有效的 JSON') >= 0);
    t.h.destroy();
  });
})();
```

步骤：写测试 → 确认失败 → 实现 → 测试通过 → 构建、截图 `editor` 与 `editor-error`（一个时长写错的行），逐张看。

---

### Task 11: 投影窗口与操作台

**Files:**
- Create: `timer/src/sync.js`
- Modify: `timer/src/ui.js`（O 键；有投影窗口时切换为操作台布局；`#projector` 路由）
- Modify: `timer/src/styles/console.css`（操作台布局）
- Modify: `timer/src/demo.js`、`timer/tests/screenshots.py`（加 `console` 演示态：操作台 + 右侧控制 + 中间预览，环节停在「反方四辩质询正方一辩」剩 1:12）
- Create: `timer/tests/sync.test.js`

**Interfaces:**
- Consumes: controller（Task 8）、render
- Produces: `DT.sync`：
  - `openProjector(win = window) -> Window | null`（`win.open(url, 'dt-projector', 'popup,width=1280,height=720')`，url = 当前地址去掉 hash 和 query，加 `#projector`）
  - `createConsoleLink({getWindow, onKey, onClosed}) -> {push(message), stop()}`：`push({type:'state', session, settings})`；每秒心跳；轮询 `win.closed`（每 1000ms）检测关闭后调 `onClosed`
  - `createProjectorEnd({target: window, opener, storage, onState, onKey})`：收到 `state` 消息调 `onState`；本窗口 `keydown` 除 F 外转发给 opener（`{type:'key', code, shiftKey, ctrlKey, altKey, repeat}`）；也监听 `storage` 事件里的 `dt.session.v1` 作为后备
  - 消息都带 `source: 'debate-timer'`，收到别的来源的消息一律忽略
- 操作台：规格 §5.7 的三栏布局。预览是 `.dt-stage-host` 按 16:9 缩放（容器查询单位保证比例）
- 投影窗口第一次打开时的提示「把这个窗口拖到投影屏幕上，按 F 全屏」，收到第一次按键后消失
- 操作台刷新：启动时 `window.open('', 'dt-projector')` 拿回已存在的投影窗口（如果返回的窗口 `location.hash !== '#projector'` 说明是新开的空白窗口，立刻 `close()` 它）

测试（`sync.test.js`）用假的窗口对象：

```js
(function () {
  function fakeWin() {
    const listeners = {}; const sent = [];
    return { sent, closed: false, location: { href: 'file:///C:/x/debate-timer.html?demo=1#abc', hash: '' },
      addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
      removeEventListener: (t, fn) => { listeners[t] = (listeners[t] || []).filter(f => f !== fn); },
      emit: (t, ev) => (listeners[t] || []).forEach(fn => fn(ev)),
      postMessage: (m) => sent.push(m), open: function (url, name, feat) { this.opened = [url, name, feat]; return fakeWin(); } };
  }
  DT.test('sync: openProjector strips query and hash', () => {
    const w = fakeWin(); DT.sync.openProjector(w);
    assert.equal(w.opened[0], 'file:///C:/x/debate-timer.html#projector');
    assert.equal(w.opened[1], 'dt-projector');
  });
  DT.test('sync: projector applies state and forwards keys except F', () => {
    const me = fakeWin(), opener = fakeWin(); const states = [];
    const end = DT.sync.createProjectorEnd({ target: me, opener, storage: null, onState: s => states.push(s), onKey: () => {} });
    me.emit('message', { data: { source: 'debate-timer', type: 'state', session: { id: 's1' }, settings: {} } });
    me.emit('message', { data: { source: 'other', type: 'state', session: { id: 'evil' } } });
    assert.deepEqual(states.map(s => s.session.id), ['s1']);
    me.emit('keydown', { code: 'Space', shiftKey: false, ctrlKey: false, altKey: false, repeat: false, preventDefault() {} });
    me.emit('keydown', { code: 'KeyF', preventDefault() {} });
    assert.deepEqual(opener.sent.map(m => m.code), ['Space']);
    assert.equal(opener.sent[0].source, 'debate-timer');
    end.stop();
  });
  DT.test('sync: console link pushes state and notices a closed window', async () => {
    const proj = fakeWin(); let closed = 0;
    const link = DT.sync.createConsoleLink({ getWindow: () => proj, onKey: () => {}, onClosed: () => closed++, pollMs: 10 });
    link.push({ type: 'state', session: { id: 's' }, settings: {} });
    assert.equal(proj.sent[0].type, 'state'); assert.equal(proj.sent[0].source, 'debate-timer');
    proj.closed = true;
    await new Promise(r => setTimeout(r, 40));
    assert.equal(closed, 1);
    link.stop();
  });
})();
```

（`createConsoleLink` 接受可选的 `pollMs`，默认 1000。）

步骤：写测试 → 确认失败 → 实现 → 测试通过 → 构建 → 截图 `console` 并看 → **手工验证**：在 Edge 里双击打开 `timer/debate-timer.html`（用 `start msedge <路径>`），按 O，确认第二个窗口打开并同步；这一步如果环境不允许开可见窗口，就在报告里写明没做。

---

### Task 12: 文档与收尾

**Files:**
- Create: `timer/README.md`
- Modify: `README.md`（根目录，加「计时器」一节）
- Modify: `timer/debate-timer.html`（重新生成）

`timer/README.md` 内容（中文，句子平实，不写营销语）：

1. 一句话：这是什么，双击 `debate-timer.html` 用 Edge 打开
2. 开一场：开赛页怎么填
3. 键位表（从规格 §5.8 复制）
4. 三种计时方式怎么操作（规格 §2.3 的表）
5. 投影：单屏与双窗口
6. 改赛制：界面里的编辑器、导入导出；或者改赛制库的 `.md` 后运行 `python timer/build.py`
7. 加主题：复制 `src/themes/hall.css`，改第一行元数据和变量，运行 `python timer/build.py`；变量契约清单
8. 开发：目录结构、`python timer/build.py`、`--check`、两条测试命令、截图命令
9. 已知限制：规格 §9

根 `README.md` 在「目录结构」之后加一节「计时器」：三五句话 + 指向 `timer/README.md`，并在目录树里加 `timer/`。

- [ ] **Step 1: 写文档**
- [ ] **Step 2: 全量验证**

Run:
```
python timer/build.py
python timer/build.py --check
python -m unittest discover -s timer/tests -p "test_*.py" -v
python timer/tests/run_js_tests.py
python timer/tests/screenshots.py
python timer/tests/screenshots.py --size 1366x768
```
Expected: 全部通过；逐张看截图。

---

## Self-Review 记录

- 规格覆盖：§1 布局 → T1/T7；§2 数据 → T2/T3/T4；§3 引擎 → T3；§4 铃声 → T5；§5.1–5.6 视觉 → T6/T7；§5.7–5.8 → T8/T11；§5.9 → T9；§5.10 → T10；§5.11 → T11；§5.12 → T4/T8；§5.13 → T3/T8；§6 → T2/T7；§7 → 各任务；§8 验收 → T12 与最终评审
- 类型一致：`upcomingBells` 条目 `{at, sound, clock}` 在 T3、T5、T8 一致；`view().clocks[i].text/label` 在 T3 定义、T6 使用；`DT.app.boot` 选项在 T7 定义、T8/T9 扩展
- Review Focus 五条各有测试：IME（T8）、刷新恢复（T3 + T8）、坏文件导入（T4）、后台节流（T5）、长名字（T6 + T7 截图）
