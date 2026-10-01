# 计时器：五个新主题与「导出这一场」Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给计时器加上可以用代码画背景的主题接口、五个新主题、开赛页的主题缩略图网格，以及「导出这一场」专用单文件。

**Architecture:** 主题 = CSS（必需）+ 同名 JS（可选，注册 SVG 定义与 Canvas 画师），注册表在 `render.js`；`build.py` 自动收集主题 JS 与生成开发外壳。导出由新模块 `preset.js` 负责：启动时从 DOM 取出单文件的样式与主脚本原文，拼上预设块生成新文件；有预设时存储键加命名空间。

**Tech Stack:** 与既有计时器相同：原生 HTML/CSS/JS（经典脚本，`window.DT`），WebAudio，Python 3 标准库，无头 Edge。

**Spec:** `docs/superpowers/specs/2026-10-01-timer-themes-and-match-export-design.md`（下文「新规格 §N」），以及它所基于的 `docs/superpowers/specs/2026-09-30-debate-timer-design.md`（「主规格 §N」）。

## Global Constraints

- 主规格的全部全局约束继续有效：单文件 `timer/debate-timer.html`、离线、零依赖、不得有指向本地文件或网络的 `src=` / `href=`；经典脚本；`python`（不是 `python3`）；`event.code`；`DT.clock.now()`；localStorage 读写包 try/catch；注释英文、界面中文
- 主题只用代码生成视觉：CSS 渐变、内联 SVG（含 data URI）、Canvas。**不得**加入任何图片、字体或音频文件，不得用 base64 嵌入位图
- 每个主题的规则全部挂在 `[data-theme="<id>"]` 下，只写在自己的 `themes/<id>.css` / `themes/<id>.js` 里；SVG 定义的 id 以 `dt-<id>-` 开头
- 可读性硬约束见新规格 §1.5，`tests/themes.test.js` 自动检查其中的对比度部分
- 画师：确定性（只用 `DT.themes.rng(seed)`），≤ 30fps 由渲染器节流，`document.hidden` 时不画，reduced-motion / frozen / 缩略图只画静态帧
- 从 Task 13 起，每次改 `timer/src/` 后都要 `python timer/build.py`，把重新生成的 `timer/debate-timer.html`（以及 Task 13 起生成的 `timer/src/index.html`）一起提交；`python timer/build.py --check` 是测试的一部分
- 子代理提交自己的任务：只 `git add` 本任务列出的文件与生成文件，提交信息用仓库风格（英文祈使句），结尾两行：
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01YHLFBz1SxMJDZCpoDqt2Nt`

## Review Focus

规格没有写死、但最可能让真人用户碰上的五种情况，每条都在负责的任务里加了测试或截图检查：

1. **普通计时器里没打完的一场，串到导出的专用文件里**（Edge 里 `file://` 共用 localStorage）→ Task 20 测试 `preset: a plain session never leaks into a preset file`
2. **专用文件被人又改名、又拷来拷去，或者预设块坏了**：页面不能白屏，退回普通计时器 → Task 20 测试 `preset: a broken preset falls back to the plain timer`
3. **辩题里有 `</script>` 这类字符**（有人会粘贴奇怪的文字）：导出的文件不能被截断 → Task 20 测试 `preset: script-like text in the motion is escaped`
4. **花哨的主题在投影上看不清**：对比度自动检查 + 两种分辨率截图评审 → Task 13 的 `themes.test.js` 自动覆盖之后的每个主题
5. **星轨主题拖垮一台旧笔记本**：画师节流、隐藏时不画、增量绘制 → Task 13 测试 `themes: painter frames are throttled and skipped when hidden`，Task 16 截图 + 代码评审

---

## 文件地图

| 文件 | 职责 | 任务 |
|---|---|---|
| `timer/src/render.js` | `DT.themes` 注册表、rng、defs 注入、画师生命周期、缩略图模式 | 13 |
| `timer/build.py` | 收集 `themes/*.js`、`tone`、生成 `src/index.html`、主脚本加 `id="dt-main"` | 13 |
| `timer/src/styles/base.css`、`stage.css` | `--digits-on-field` / `--digits-off-field`、`.dt-canvas` 层 | 13 |
| `timer/src/themes/hall.css`、`daylight.css`、`chroma.css` | 补 `tone`；满足对比度检查 | 13 |
| `timer/tests/run_js_tests.py` | 测试页加载全部样式并注入 `DT.THEMES` | 13 |
| `timer/tests/screenshots.py`、`timer/src/demo.js` | `--theme <id>`；`?theme=` 覆盖 | 13 |
| `timer/tests/themes.test.js` | 每个主题的自动检查 | 13 |
| `timer/src/setup.js`、`styles/editor.css` | 主题缩略图网格 | 14 |
| `timer/src/themes/ink.css` (+`.js`) | 墨 | 15 |
| `timer/src/themes/startrail.css` + `.js` | 星轨 | 16 |
| `timer/src/themes/chalk.css` (+`.js`) | 黑板 | 17 |
| `timer/src/themes/riso.css` (+`.js`) | 孔版 | 18 |
| `timer/src/themes/construct.css` (+`.js`) | 构成 | 19 |
| `timer/src/preset.js` | 导出与读取预设 | 20 |
| `timer/src/store.js`、`ui.js`、`setup.js`、`editor.js` | 命名空间、路由、导出按钮、共享下载函数 | 20 |
| `timer/tests/preset.test.js`、`test_export.py` | 导出测试 | 20 |
| `timer/README.md`、根 `README.md` | 文档 | 21 |

---

### Task 13: 主题基础设施

**Files:**
- Modify: `timer/src/render.js`、`timer/src/styles/base.css`、`timer/src/styles/stage.css`
- Modify: `timer/src/themes/hall.css`、`daylight.css`、`chroma.css`（第一行加 `tone=`；让对比度检查通过）
- Modify: `timer/build.py`、`timer/tests/test_build.py`
- Modify: `timer/tests/run_js_tests.py`、`timer/tests/screenshots.py`、`timer/src/demo.js`、`timer/src/ui.js`（只为 `?theme=` 覆盖）
- Create: `timer/tests/themes.test.js`
- Generated: `timer/src/index.html`、`timer/debate-timer.html`

**Interfaces:**
- Produces（`render.js`）：
  - `DT.themes.register(id, {defs?, painter?})`、`DT.themes.get(id)`、`DT.themes.ids()`、`DT.themes.rng(seed: string|number) → () => number`（mulberry32；字符串种子先做 FNV-1a 哈希）
  - `DT.render.mount(host, {thumbnail?: boolean})`；缩略图模式见新规格 §3.2
  - 画师工厂签名：`painter(canvas, ctx, {thumbnail, reducedMotion, frozen}) → {frame(view, now), resize(w, h), destroy()}`
  - 渲染器内部：`.dt-canvas` 只在有画师时存在；30fps 节流（距上次 `frame` 不足 33ms 的 `update` 不调用 `frame`）；`document.hidden` 时跳过；静态模式下只在挂载、`resize`、视图的 `stage.id` / `mode` / `phase` 变化时画
  - 主题存在性判断：`DT.THEMES`（构建注入或测试页注入）里有的 id 才用，否则退回 `hall`（替换现在的 `BUILTIN_THEMES` 回退逻辑时保留"没有 DT.THEMES 时只认三个内置 id"的行为）
- Produces（`build.py`）：`themes_meta()` 每项多 `tone`；`theme_scripts() -> list[Path]`；`script_files()` 在 `render.js` 后插入 `theme_scripts()`；`dev_index_html() -> str`（生成开发外壳）；`inline_html` 的主 `<script>` 带 `id="dt-main"`；`main()` 的 outputs 加 `SRC / "index.html"`
- Produces（CSS 契约）：`--digits-on-field`、`--digits-off-field`（`base.css` 默认 `var(--ink)`）；`.dt-canvas { position:absolute; inset:0; }`，z 轴在 `.dt-backdrop` 之上、`.dt-field` 之下
- Produces（测试与截图）：`run_js_tests.py` 的测试页先注入 `<script>window.DT=window.DT||{};DT.THEMES=<themes_meta() JSON>;</script>`，再 `<link>` 全部 `style_files()`；`screenshots.py --theme <id>`（给每个 URL 加 `&theme=<id>`，输出到 `tests/out/<WxH>/<id>/<名>.png`）；`?theme=<id>` 让任何演示态改用这个主题

- [ ] **Step 1: 写失败的测试**

`timer/tests/themes.test.js`：

```js
(function () {
  const E = DT.engine, R = DT.render;
  const T0 = 1000000;
  const MATCH = { title: '测试', proMotion: '甲', conMotion: '乙', proTeam: '', conTeam: '', proSeat: 'left' };
  const F = () => DT.BUILTIN_FORMATS.find(f => f.id === 'ustc-freshman-cup');
  const idx = name => F().stages.findIndex(s => s.name === name);
  function host() {
    const box = document.getElementById('sandbox');
    box.innerHTML = '<div class="dt-stage-host" style="width:960px;height:540px"></div>';
    return box.firstChild;
  }
  function viewAt(stageName, theme) {
    let s = E.goto(E.createSession(F(), MATCH, T0, { theme }), idx(stageName), T0);
    s = E.toggle(s, T0);
    return E.view(s, T0 + 60000);
  }
  function rgb(str) {
    const s = String(str).trim();
    let m = s.match(/^#([0-9a-f]{6})$/i);
    if (m) return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
    m = s.match(/^#([0-9a-f]{3})$/i);
    if (m) return m[1].split('').map(c => parseInt(c + c, 16));
    m = s.match(/rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/);
    if (m) return [m[1], m[2], m[3]].map(Number);
    throw new Error('cannot parse colour ' + s);
  }
  function lum(c) {
    const [r, g, b] = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function contrast(a, b) { const x = lum(rgb(a)), y = lum(rgb(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  // Resolve a custom property to a concrete colour by letting the browser compute it on a probe element.
  function resolve(root, varName) {
    const probe = document.createElement('i');
    probe.style.color = 'var(' + varName + ')';
    root.appendChild(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  }

  DT.test('themes: every theme in DT.THEMES has a name, a description and a tone', () => {
    assert.ok(DT.THEMES.length >= 3);
    DT.THEMES.forEach(t => {
      assert.ok(t.id && t.name && t.desc, JSON.stringify(t));
      assert.ok(t.tone === 'dark' || t.tone === 'light', t.id);
    });
  });

  DT.test('themes: digits and titles keep their contrast on every theme and side', () => {
    DT.THEMES.forEach(t => {
      ['正方一辩开篇立论', '反方一辩开篇立论'].forEach(stage => {
        const h = R.mount(host());
        h.update(viewAt(stage, t.id));
        const root = document.querySelector('.dt-stage');
        assert.equal(root.dataset.theme, t.id);
        const field = resolve(root, '--side-color'), deep = resolve(root, '--side-deep');
        const on = resolve(root, '--digits-on-field'), off = resolve(root, '--digits-off-field');
        const title = getComputedStyle(root.querySelector('.dt-title')).color;
        const where = t.id + ' / ' + stage;
        assert.ok(contrast(on, field) >= 3, where + ': digits on field ' + contrast(on, field).toFixed(2));
        assert.ok(contrast(off, deep) >= 3, where + ': digits off field ' + contrast(off, deep).toFixed(2));
        assert.ok(contrast(title, field) >= 4.5 || contrast(title, deep) >= 4.5, where + ': title');
        h.destroy();
      });
    });
  });

  DT.test('themes: register, get, ids and a deterministic rng', () => {
    DT.themes.register('zz-test', { defs: '<svg width="0" height="0"><defs><filter id="dt-zz-test-f"></filter></defs></svg>' });
    assert.ok(DT.themes.ids().indexOf('zz-test') >= 0);
    assert.ok(DT.themes.get('zz-test').defs);
    const a = DT.themes.rng('ink'), b = DT.themes.rng('ink'), c = DT.themes.rng('riso');
    const xs = [a(), a(), a()], ys = [b(), b(), b()];
    assert.deepEqual(xs, ys);
    assert.ok(xs.every(x => x >= 0 && x < 1));
    assert.ok(c() !== xs[0]);
  });

  DT.test('themes: defs are injected once per document', () => {
    DT.themes.register('zz-defs', { defs: '<svg width="0" height="0" data-probe="zz-defs"><defs><filter id="dt-zz-defs-f"></filter></defs></svg>' });
    const DTH = Array.isArray(DT.THEMES) ? DT.THEMES : [];
    const saved = DT.THEMES; DT.THEMES = DTH.concat([{ id: 'zz-defs', name: 'x', desc: 'x', tone: 'dark' }]);
    try {
      const h1 = R.mount(host()); h1.update(viewAt('正方一辩开篇立论', 'zz-defs'));
      const h2 = R.mount(document.getElementById('sandbox').appendChild(document.createElement('div')));
      h2.update(viewAt('正方一辩开篇立论', 'zz-defs'));
      assert.equal(document.querySelectorAll('[data-probe="zz-defs"]').length, 1);
      h1.destroy(); h2.destroy();
    } finally { DT.THEMES = saved; }
  });

  DT.test('themes: painter frames are throttled and skipped when hidden', () => {
    const calls = [];
    DT.themes.register('zz-paint', { painter: () => ({ frame: (v, now) => calls.push(now), resize() {}, destroy() { calls.push('destroyed'); } }) });
    const saved = DT.THEMES; DT.THEMES = (saved || []).concat([{ id: 'zz-paint', name: 'x', desc: 'x', tone: 'dark' }]);
    try {
      const h = R.mount(host());
      const v = viewAt('正方一辩开篇立论', 'zz-paint');
      assert.ok(document.querySelector('.dt-canvas'));
      let now = 5000; DT.clock.set(() => now);
      h.update(v); now += 10; h.update(v); now += 10; h.update(v); now += 40; h.update(v);
      const frames = calls.filter(c => c !== 'destroyed');
      assert.equal(frames.length, 2, 'two frames 50 ms apart, the 10 ms ones skipped');
      h.update(Object.assign({}, v, { theme: 'hall' }));
      assert.equal(document.querySelector('.dt-canvas'), null);
      assert.ok(calls.indexOf('destroyed') >= 0);
      h.destroy();
    } finally { DT.THEMES = saved; DT.clock.reset(); }
  });

  DT.test('themes: thumbnail mode draws once and never animates', () => {
    let frames = 0;
    DT.themes.register('zz-thumb', { painter: () => ({ frame() { frames++; }, resize() {}, destroy() {} }) });
    const saved = DT.THEMES; DT.THEMES = (saved || []).concat([{ id: 'zz-thumb', name: 'x', desc: 'x', tone: 'dark' }]);
    try {
      const h = R.mount(host(), { thumbnail: true });
      const v = viewAt('正方一辩开篇立论', 'zz-thumb');
      let now = 0; DT.clock.set(() => now);
      h.update(v); now += 100; h.update(v); now += 100; h.update(v);
      assert.equal(frames, 1);
      assert.ok(!document.querySelector('.dt-stage').classList.contains('is-entering'));
      h.pulse({ type: 'warn' });
      assert.equal(document.querySelectorAll('.dt-ring').length, 0);
      h.destroy();
    } finally { DT.THEMES = saved; DT.clock.reset(); }
  });
})();
```

`test_build.py` 加：

```python
class ThemeBuildTests(unittest.TestCase):
    def test_themes_meta_has_tone(self):
        for t in build.themes_meta():
            self.assertIn(t["tone"], ("dark", "light"), t["id"])

    def test_theme_scripts_follow_render(self):
        names = [p.name for p in build.script_files()]
        r = names.index("render.js")
        for p in build.theme_scripts():
            self.assertGreater(names.index(p.name), r)
            self.assertLess(names.index(p.name), names.index("setup.js"))

    def test_dev_index_is_generated_and_complete(self):
        page = build.dev_index_html()
        self.assertIn("generated by timer/build.py", page)
        for p in build.script_files():
            self.assertIn(p.relative_to(build.SRC).as_posix(), page)
        for p in build.style_files():
            self.assertIn(p.relative_to(build.SRC).as_posix(), page)

    def test_main_script_is_tagged(self):
        html = build.inline_html(build.parse_all(FORMATS))
        self.assertEqual(html.count('<script id="dt-main">'), 1)

    def test_orphan_theme_script_fails(self):
        orphan = build.SRC / "themes" / "zz-orphan.js"
        orphan.write_text("// orphan\n", encoding="utf-8")
        try:
            with self.assertRaises(build.FormatError):
                build.theme_scripts()
        finally:
            orphan.unlink()
```

- [ ] **Step 2: 运行，确认失败**：`python timer/tests/run_js_tests.py --filter themes`、`python -m unittest discover -s timer/tests -p "test_*.py"`
- [ ] **Step 3: 实现**（接口见上）。三个旧主题要通过对比度检查：`daylight` 的数字在色带上是深色，对比度不够就改成数字落在色带上时用浅色（`--digits-on-field`），`stage.css` 相应用两层数字或其他办法实现，截图确认
- [ ] **Step 4: 构建、全部测试通过**：`python timer/build.py && python timer/build.py --check && python -m unittest discover -s timer/tests -p "test_*.py" && python timer/tests/run_js_tests.py`
- [ ] **Step 5: 截图确认旧主题没有走样**：`python timer/tests/screenshots.py --only single,dual,daylight,chroma` 两种分辨率，逐张看

---

### Task 14: 开赛页的主题缩略图网格

**Files:**
- Modify: `timer/src/setup.js`、`timer/src/styles/editor.css`、`timer/tests/setup.test.js`
- Modify: `timer/src/demo.js`（`setup` 演示态不变，确认网格出现）
- Generated: `timer/src/index.html`、`timer/debate-timer.html`

**Interfaces:**
- Consumes: `DT.render.mount(host, {thumbnail: true})`、`DT.THEMES`（含 `tone`）
- Produces: 开赛页 `.dt-setup-themes` 变为 `role="radiogroup"` 的网格，每格 `button[role="radio"][data-theme-id]`，内含一个 `.dt-stage-host` 缩略图与主题名；选中格 `aria-checked="true"`；`onStart` 的第三个参数仍是主题 id

新规格 §3.1。缩略图的视图：新生赛「正方一辩开篇立论」，用掉 40%、在走（用 `DT.engine` 推演，固定 now）。网格 4 列（8 个主题两行），1366×768 下也要放得下（必要时 2 行 × 4 列缩小，或右栏滚动，但「开始这一场」按钮必须始终可见）。键盘：←→↑↓ 在格子间移动焦点并选中，Tab 进出网格一次。说明文字仍在网格下方一行。

测试（加到 `setup.test.js`）：

```js
DT.test('setup: the theme grid shows a live thumbnail for every theme', () => {
  const themes = [{ id: 'hall', name: '堂', desc: 'a', tone: 'dark' }, { id: 'daylight', name: '昼', desc: 'b', tone: 'light' }, { id: 'chroma', name: '绿幕', desc: 'c', tone: 'dark' }];
  const t = mount({ themes });
  const cells = t.box.querySelectorAll('[role="radio"][data-theme-id]');
  assert.equal(cells.length, 3);
  cells.forEach(c => assert.ok(c.querySelector('.dt-stage[data-theme="' + c.dataset.themeId + '"]')));
  cells[1].click();
  assert.equal(cells[1].getAttribute('aria-checked'), 'true');
  t.box.querySelector('button[data-action="start"]').click();
  assert.equal(t.calls[0][3], 'daylight');
  t.h.destroy();
});
DT.test('setup: arrow keys move through the theme grid', () => {
  const themes = [{ id: 'hall', name: '堂', desc: 'a', tone: 'dark' }, { id: 'daylight', name: '昼', desc: 'b', tone: 'light' }];
  const t = mount({ themes });
  const first = t.box.querySelector('[data-theme-id="hall"]');
  first.focus();
  first.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', key: 'ArrowRight', bubbles: true }));
  assert.equal(t.box.querySelector('[data-theme-id="daylight"]').getAttribute('aria-checked'), 'true');
  t.h.destroy();
});
```

（`mount` 是 `setup.test.js` 里现有的辅助函数；如果它的签名不同，照它现在的写法调整调用，不要改断言的含义。）

步骤：写测试 → 失败 → 实现 → 构建与全部测试 → 截图 `setup`、`setup-resume` 两种分辨率并逐张看。

---

### Task 15–19: 五个新主题（每个主题一个任务，依次做）

每个任务的共同结构（任务 N 对应一个主题）：

**Files:**
- Create: `timer/src/themes/<id>.css`（第一行 `/* @theme id=<id> name=<名称> desc=<一句话> tone=<dark|light> */`）
- Create（需要时）: `timer/src/themes/<id>.js`（`DT.themes.register('<id>', {defs, painter})`）
- Create: `timer/tests/theme-<id>.test.js`（该主题自己的行为测试，至少：注册成功；有 defs 的，defs 被注入且 id 以 `dt-<id>-` 开头；有画师的，同一视图画两次得到相同像素（取 `getImageData` 的哈希比较，确定性）、`frame` 在缩略图模式只调用一次）
- Generated: `timer/src/index.html`、`timer/debate-timer.html`

**不改**任何其他源文件。如果发现公共代码缺钩子，在报告里写成 DONE_WITH_CONCERNS 说明需要什么，不要自己改公共文件。

**步骤：**
- [ ] 读新规格 §1（接口与可读性硬约束）、§2.6 与本主题那一节，读 `themes/hall.css` 了解变量契约与 DOM 结构（`timer/src/render.js` 顶部注释与 `stage.css`）
- [ ] 先用 Skill 工具加载 `frontend-design:frontend-design`，按它的方法写一个简短的设计计划（色值、字体、纹理、动效、每个画面的处理），写进报告
- [ ] 写 `theme-<id>.test.js` → 失败 → 实现 CSS / JS → 通过；`themes.test.js` 的对比度检查自动覆盖新主题，必须通过
- [ ] `python timer/build.py`，然后截图：`python timer/tests/screenshots.py --theme <id> --only title,single,cross,over,dual,dual-idle,dual-locked,break,end,seat-right,long` 与同样参数加 `--size 1366x768`；逐张用 Read 打开看，按新规格 §1.5 与本主题立意反复改，直到每一张都好看、清楚。把最终的自评写进报告
- [ ] 全部测试通过后提交

各任务的主题：

| 任务 | id | 名称 | 新规格 | 需要 JS |
|---|---|---|---|---|
| 15 | `ink` | 墨 | §2.1 | 是（SVG 晕染滤镜 defs） |
| 16 | `startrail` | 星轨 | §2.2 | 是（Canvas 画师） |
| 17 | `chalk` | 黑板 | §2.3 | 可能（粉笔抖动滤镜 defs） |
| 18 | `riso` | 孔版 | §2.4 | 可能（颗粒滤镜 defs） |
| 19 | `construct` | 构成 | §2.5 | 否（conic-gradient 即可） |

---

### Task 20: 导出这一场

**Files:**
- Create: `timer/src/preset.js`（在 `ORDER` 里放在 `store.js` 之后）
- Modify: `timer/build.py`（`ORDER` 加 `preset.js`）
- Modify: `timer/src/store.js`（存储键命名空间：`setNamespace(ns | null)`；共享的 `saveFile(name, text, mime?)`）
- Modify: `timer/src/editor.js`（改用 `DT.store.saveFile`，删掉自己的那份）
- Modify: `timer/src/setup.js`（「导出这一场」按钮；`onExport(format, match, theme)` 回调）
- Modify: `timer/src/ui.js`（启动时 `DT.preset.captureSource()`；读预设、设命名空间、路由；结束卡按钮文字；Shift+E 进开赛页；`?exportProbe=1`）
- Create: `timer/tests/preset.test.js`、`timer/tests/test_export.py`
- Modify: `timer/tests/setup.test.js`、`timer/tests/ui.test.js`（新行为）
- Generated: `timer/src/index.html`、`timer/debate-timer.html`

**Interfaces:**
- Produces（`preset.js`）：
  - `DT.preset.captureSource(doc = document)`：必须在应用改动 DOM 之前调用（`ui.js` 的自动启动第一行）；缓存 `{lang, title, style, main}`；开发外壳里（没有 `#dt-main`）缓存 null
  - `DT.preset.sourceParts() → {lang, title, style, main} | null`
  - `DT.preset.buildHtml(parts, preset) → string`（新规格 §4.2 的结构；JSON 里的 `<` 一律写成 `<`，这样任何 `</script` 都不可能出现）
  - `DT.preset.make(format, match, theme, now) → preset`（`id: 'm-' + 随机`，`createdAt: now`，format 深拷贝）
  - `DT.preset.read(doc = document) → preset | null`（新规格 §4.3）
  - `DT.preset.fileName(preset) → string`（新规格 §4.1 的规则，加 `.html`）
- Produces（`store.js`）：`setNamespace(ns)`：ns 为字符串时，`session` 与 `lastMatch` 的键变成 `dt.m.<ns>.session.v1` / `dt.m.<ns>.lastMatch.v1`；`formats` 与 `settings` 不变；`setNamespace(null)` 复原。`saveFile(name, text, mime = 'application/json')`
- Produces（`setup.js`）：新选项 `onExport(format, match, theme)` 与 `canExport: boolean`（false 时按钮置灰，`title` 写「在构建好的 debate-timer.html 里才能导出」）

- [ ] **Step 1: 写失败的测试** `timer/tests/preset.test.js`：

```js
(function () {
  const P = DT.preset;
  const F = () => DT.BUILTIN_FORMATS.find(f => f.id === 'ustc-freshman-cup');
  const MATCH = { title: '新生赛决赛', proMotion: '大学生应该优先发展兴趣', conMotion: '大学生不应该优先发展兴趣', proTeam: '物理学院', conTeam: '化学院', proSeat: 'left' };
  const PARTS = { lang: 'zh-CN', title: '辩论计时器', style: 'body{margin:0}', main: 'window.__main_ran = true;' };
  function docFrom(html) { return new DOMParser().parseFromString(html, 'text/html'); }
  function memStorage() {
    const m = new Map();
    return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m };
  }

  DT.test('preset: buildHtml has exactly one preset and one main script and no external references', () => {
    const html = P.buildHtml(PARTS, P.make(F(), MATCH, 'ink', 1790000000000));
    const doc = docFrom(html);
    assert.equal(doc.querySelectorAll('#dt-preset').length, 1);
    assert.equal(doc.querySelectorAll('#dt-main').length, 1);
    assert.equal(doc.querySelector('#dt-main').textContent, PARTS.main);
    assert.ok(!/<script[^>]+src=/.test(html) && !/<link[^>]+href=/.test(html));
    assert.ok(doc.body.hasAttribute('data-dt-autoboot'));
    assert.equal(doc.title, '新生赛决赛：辩论计时器');
  });

  DT.test('preset: script-like text in the motion is escaped', () => {
    const evil = Object.assign({}, MATCH, { proMotion: '</script><script>alert(1)</script>' });
    const html = P.buildHtml(PARTS, P.make(F(), evil, 'hall', 1));
    assert.equal(html.split('</script>').length - 1, 2, 'only the two real closing tags');
    const back = P.read(docFrom(html));
    assert.equal(back.match.proMotion, evil.proMotion);
  });

  DT.test('preset: read round-trips and rejects broken presets', () => {
    const preset = P.make(F(), MATCH, 'riso', 5);
    assert.deepEqual(P.read(docFrom(P.buildHtml(PARTS, preset))), preset);
    const wrap = json => docFrom('<html><body><script type="application/json" id="dt-preset">' + json + '</script></body></html>');
    assert.equal(P.read(wrap('{oops')), null);
    assert.equal(P.read(wrap(JSON.stringify(Object.assign({}, preset, { kind: 'x' })))), null);
    assert.equal(P.read(wrap(JSON.stringify(Object.assign({}, preset, { schema: 2 })))), null);
    const bad = JSON.parse(JSON.stringify(preset)); bad.format.stages = [];
    assert.equal(P.read(wrap(JSON.stringify(bad))), null);
    assert.equal(P.read(docFrom('<html><body></body></html>')), null);
  });

  DT.test('preset: exporting again replaces the preset instead of stacking', () => {
    const first = P.buildHtml(PARTS, P.make(F(), MATCH, 'hall', 1));
    const d = docFrom(first);
    P.captureSource(d);
    const again = P.buildHtml(P.sourceParts(), P.make(F(), Object.assign({}, MATCH, { title: '复赛' }), 'hall', 2));
    const d2 = docFrom(again);
    assert.equal(d2.querySelectorAll('#dt-preset').length, 1);
    assert.equal(P.read(d2).match.title, '复赛');
    P.captureSource(document);   // restore for other tests
  });

  DT.test('preset: the dev shell cannot export', () => {
    P.captureSource(docFrom('<html><head><style>x{}</style></head><body><script src="engine.js"></script></body></html>'));
    assert.equal(P.sourceParts(), null);
    P.captureSource(document);
  });

  DT.test('preset: file names follow title, then motion, then format', () => {
    assert.equal(P.fileName(P.make(F(), MATCH, 'hall', 1)), '新生赛决赛.html');
    assert.equal(P.fileName(P.make(F(), Object.assign({}, MATCH, { title: '' }), 'hall', 1)), '大学生应该优先发展兴趣.html');
    assert.equal(P.fileName(P.make(F(), Object.assign({}, MATCH, { title: '', proMotion: '' }), 'hall', 1)), '中国科学技术大学新生辩论赛.html');
    assert.equal(P.fileName(P.make(F(), Object.assign({}, MATCH, { title: 'a/b:c*' }), 'hall', 1)), 'a_b_c_.html');
  });

  DT.test('preset: namespaced storage keeps sessions apart', () => {
    const st = memStorage(); DT.store.useStorage(st);
    DT.store.setNamespace(null); DT.store.saveSession({ id: 'plain', history: [] });
    DT.store.setNamespace('m-abc');
    assert.equal(DT.store.loadSession(), null);
    DT.store.saveSession({ id: 'preset', history: [] });
    assert.ok(st.getItem('dt.m.m-abc.session.v1'));
    DT.store.setNamespace(null);
    assert.equal(DT.store.loadSession().id, 'plain');
  });
})();
```

`ui.test.js` 加（沿用其中现有的 `boot`、`memStorage`、`fakeBells` 辅助函数；`boot` 需要新增 `preset` 选项，直接把预设对象传给 `DT.app.boot`，等价于页面里有 `#dt-preset`）：

```js
DT.test('ui: a preset boots straight to its title card', () => {
  const preset = DT.preset.make(DT.BUILTIN_FORMATS[0], { title: '决赛', proMotion: '甲方辩题', conMotion: '乙方辩题', proTeam: '一队', conTeam: '二队', proSeat: 'right' }, 'hall', T0);
  const box = document.getElementById('sandbox'); box.innerHTML = '<div></div>';
  const c = DT.app.boot({ root: box.firstChild, storage: memStorage(), bells: fakeBells(), preset });
  assert.equal(c.session().cursor, -1);
  assert.equal(c.session().match.proMotion, '甲方辩题');
  assert.ok(box.textContent.indexOf('甲方辩题') >= 0);
  c.destroy(); DT.store.setNamespace(null);
});

DT.test('ui: a plain session never leaks into a preset file', () => {
  const storage = memStorage();
  const t = boot({ storage });
  press('Space'); press('Space');          // a plain match is running
  t.done();
  const preset = DT.preset.make(DT.BUILTIN_FORMATS[0], { title: '决赛', proMotion: '甲', conMotion: '乙', proTeam: '', conTeam: '', proSeat: 'left' }, 'hall', T0);
  const box = document.getElementById('sandbox'); box.innerHTML = '<div></div>';
  const c = DT.app.boot({ root: box.firstChild, storage, bells: fakeBells(), preset });
  assert.equal(c.session().cursor, -1);
  assert.equal(c.session().match.title, '决赛');
  c.destroy(); DT.store.setNamespace(null);
});

DT.test('ui: a broken preset falls back to the plain timer', () => {
  const box = document.getElementById('sandbox'); box.innerHTML = '<div></div>';
  const c = DT.app.boot({ root: box.firstChild, storage: memStorage(), bells: fakeBells(), preset: null });
  assert.ok(box.querySelector('.dt-setup'));
  c.destroy();
});
```

（`.dt-setup` 是开赛页根元素的类名；如果现有代码用的是别的类名，照实际改选择器。）

`setup.test.js` 加：

```js
DT.test('setup: export hands the chosen format, match and theme to onExport', () => {
  const got = [];
  const t = mount({ canExport: true, onExport: (f, m, th) => got.push([f.id, m.proTeam, th]) });
  t.box.querySelector('button[data-action="export"]').click();
  assert.equal(got.length, 1);
  assert.equal(got[0][1], '物理学院');
  t.h.destroy();
});
DT.test('setup: export is disabled in the dev shell', () => {
  const t = mount({ canExport: false, onExport: () => { throw new Error('should not run'); } });
  const b = t.box.querySelector('button[data-action="export"]');
  assert.ok(b.disabled);
  assert.ok(b.title.indexOf('debate-timer.html') >= 0);
  t.h.destroy();
});
```

`timer/tests/test_export.py`（端到端，新规格 §4.4）：

```python
"""End to end: an exported match file opens straight on its title card."""
import html as htmllib
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import run_js_tests  # noqa: E402

BUILT = HERE.parent / "debate-timer.html"
OUT = HERE / "out"


def dump(url, budget=8000):
    browser = run_js_tests.find_browser()
    tmp = Path(tempfile.mkdtemp(prefix="dt-export-"))
    try:
        cmd = [browser, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
               "--allow-file-access-from-files", f"--user-data-dir={tmp}", f"--virtual-time-budget={budget}",
               "--dump-dom", url]
        return subprocess.run(cmd, capture_output=True, timeout=120).stdout.decode("utf-8", "replace")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


@unittest.skipUnless(run_js_tests.find_browser(), "needs Edge or Chrome")
class ExportEndToEnd(unittest.TestCase):
    def test_exported_file_opens_on_its_title_card(self):
        dom = dump(BUILT.as_uri() + "?exportProbe=1")
        m = re.search(r'<pre id="export-probe">(.*?)</pre>', dom, re.S)
        self.assertIsNotNone(m, "exportProbe did not write its output")
        exported = htmllib.unescape(m.group(1))
        OUT.mkdir(exist_ok=True)
        target = OUT / "export-test.html"
        target.write_text(exported, encoding="utf-8")
        page = dump(target.as_uri())
        self.assertIn('data-mode="title"', page)
        self.assertIn("探针辩题正方", page)
        self.assertIn("探针队甲", page)


if __name__ == "__main__":
    unittest.main()
```

`?exportProbe=1`（`ui.js`）：不启动界面；用新生赛，`match = {title: '探针场', proMotion: '探针辩题正方', conMotion: '探针辩题反方', proTeam: '探针队甲', conTeam: '探针队乙', proSeat: 'left'}`，主题 `hall`，`now` 取 `DT.clock.now()`；把 `buildHtml(sourceParts(), preset)` 的结果写进 `<pre id="export-probe">`（`textContent`）。

- [ ] **Step 2: 运行，确认失败**
- [ ] **Step 3: 实现**。ui 的启动顺序：`captureSource()` → `preset = DT.preset.read()`（测试里可以由 `boot({preset})` 直接给）→ 有预设则 `DT.store.setNamespace(preset.id)` → 路由（新规格 §4.3）。开赛页的「导出这一场」：`onExport` 里 `DT.store.saveFile(DT.preset.fileName(p), DT.preset.buildHtml(DT.preset.sourceParts(), p), 'text/html')`，然后提示条显示新规格 §4.1 的那句话。结束卡的按钮在预设文件里写「重新开始这一场」，行为是用同一个预设新建一场进开场卡。Shift+E 在开场卡上进开赛页（有预设时开赛页照常，预设的这一场不出现在赛制列表里）
- [ ] **Step 4: 构建、全部测试通过**（包括 `python -m unittest discover -s timer/tests -p "test_*.py"` 里的 `test_export.py`）
- [ ] **Step 5: 截图** `setup` 两种分辨率，确认按钮位置与层级（次要按钮，不抢「开始这一场」）；再手动打开一次 `timer/tests/out/export-test.html` 的截图（`msedge --headless=new --screenshot=... --window-size=1920,1080 <uri>`）确认开场卡正确

---

### Task 21: 文档与收尾

**Files:** `timer/README.md`、根 `README.md`、生成文件

- `timer/README.md`：
  - 「开一场」一节加「导出这一场」：做什么、文件名规则、导出的文件怎么用（双击直接开场卡、刷新能恢复、Shift+E 进开赛页、存储与普通计时器分开）
  - 「主题」改成一张表：8 个主题的名称、一句话立意、适合的场合（暗场 / 亮场 / 直播）
  - 「加主题」按新接口重写：CSS 必需、JS 可选；元数据行（含 `tone`）；`--digits-on-field` / `--digits-off-field`；`DT.themes.register` 的 `defs` 与 `painter`；确定性随机数；可读性硬约束与自动对比度检查；重新构建；截图命令 `--theme`
- 根 `README.md` 的计时器一节：提到导出这一场与 8 个主题，一两句话
- 运行全部验证命令与全部截图（两种分辨率；8 个主题各跑一遍 `--theme`），报告结果

---

## Self-Review 记录

- 新规格覆盖：§1 接口 → T13；§1.5 可读性 → T13 自动检查 + T15–19 截图；§2 五主题 → T15–19；§3 缩略图网格 → T13（缩略图模式）+ T14；§4 导出 → T20；§5 验收 → T21 与最终评审
- 类型一致：`DT.render.mount(host, {thumbnail})` 在 T13 定义、T14 使用；`DT.themes.register` / `rng` 在 T13 定义、T15–19 使用；`DT.store.setNamespace` / `saveFile` 与 `DT.preset.*` 都在 T20 内部定义与使用
- Review Focus 五条都有测试或截图检查
