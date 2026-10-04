# 计时器：键盘修复、重置与退出、校赛改名 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修好已证明的五个键盘根因并加真实输入回归测试；让任意环节可重置、任意画面可退出到开赛页；把「2025 校赛」改名为「校赛」。

**Architecture:** 改动集中在 `timer/src/ui.js`（按键、焦点、控制条、环节列表、退出路由）、`engine.js`（`reset` 的可选 index、开场卡空格）、`render.js`（tension 量化）、`sync.js`（投影端断开检测）、`editor.js`（`onLeave`）、`store.js`（旧 id 迁移），以及备赛技能的赛制文件与引用。

**Tech Stack:** 同前：经典脚本、Python 3 标准库、无头 Edge；新增一个只用标准库的最小 WebSocket/CDP 客户端（测试用）。

**Spec:** `docs/superpowers/specs/2026-10-03-timer-keyboard-reset-exit-schoolcup.md`（下文「本规格 §N」），以及它基于的两份计时器规格。

## Global Constraints

- 前两份计划的全局约束全部有效（单文件、离线、经典脚本、`python`、`event.code` 为主、`DT.clock.now()`、localStorage 包 try/catch、注释英文界面中文、主题规则只在主题文件里）
- 每次改 `timer/src/` 后 `python timer/build.py`，生成文件与源码一起提交；`--check` 是测试的一部分
- 提交：只 add 本任务的文件与生成文件；英文祈使句主题；结尾两行
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01YHLFBz1SxMJDZCpoDqt2Nt`
- **测试进程纪律**：测试与调试中启动的浏览器只能结束自己 `Popen` 出来的那个进程；**绝不**运行 `taskkill /IM msedge.exe` 或任何按名字结束进程的命令（会关掉用户自己的 Edge）
- 可复用的调查脚本：`timer/tests/out/kbd/cdp.py`（A 方向）与 `timer/tests/out/kbd/angleB/cdp.py`（B 方向）里有可用的最小 WebSocket + CDP 客户端，可以参考或改写进 `timer/tests/test_keyboard.py`（`tests/out/` 是 git 忽略的临时目录，正式测试不能依赖它）

## Review Focus

1. **焦点落在任何非文本控件上后，快捷键必须仍然有效**（滑块、按钮、列表行、覆盖层）→ Task 23 的 `test_keyboard.py` 场景 1–3
2. **退出时时钟必须停**：退出后在开赛页停留几分钟再「继续」，用时不能多算 → Task 24 测试 `ui: exiting pauses the running clock`
3. **两步确认不能被一次双击触发**（计时员手抖双击「退出」）：两次点击间隔太短（< 250ms）时不算确认 → Task 24 测试 `ui: a double-click does not confirm exit`
4. **浏览器里存过的旧校赛赛制不能丢** → Task 22 测试 `store: an edited 2025 school cup migrates to the new id`
5. **备赛技能的旧目录名** `校赛2025` 仍能被检查脚本认出 → Task 22 的 Python 断言

---

### Task 22: 校赛改名

**Files:**
- Rename: `.claude/skills/debate-prep/references/formats/ustc-school-cup-2025.md` → `ustc-school-cup.md`（`git mv`），并改标题、目录名、适用
- Modify: `.claude/skills/debate-prep/SKILL.md`、`README.md`、`.claude/skills/debate-prep/CHANGELOG.md`、`.claude/skills/debate-prep/VERSION`（3.3）、`references/stage-playbooks.md`、`references/evidence.md`、`references/formats/_template.md`、`assets/script-doc-template.tex`、`evals/evals.json`、`scripts/check_speeches.py`、`scripts/check_evidence.py`、`scripts/_version.py`（若有赛制目录映射）
- Modify: `timer/src/store.js`（旧 id 迁移）、`timer/tests/test_build.py`、`timer/tests/ui.test.js`、`timer/tests/store.test.js`、`timer/README.md`
- Generated: `timer/src/builtin-formats.js`、`timer/src/index.html`、`timer/debate-timer.html`

本规格 §1。要点：
- `check_speeches.py`：内置区间表的键改为 `ustc-school-cup`；按路径识别赛制时，目录名 `校赛` 与旧名 `校赛2025` 都映射到它；按标题识别（奇袭 / 四辩对辩 / 二辩质询）返回新 id。先读这两个脚本与 `_version.py` 弄清它们怎么从路径认赛制，再改
- `store.js`：`const RENAMED = { 'ustc-school-cup-2025': 'ustc-school-cup' }`；`loadFormats` 读到存储里 id 在 `RENAMED` 中的条目，改成新 id（若存储里已有新 id 的条目，以新 id 的为准，旧的丢弃）；`loadLastMatch` 的 `formatId` 同样映射
- 测试：

```js
// store.test.js
DT.test('store: an edited 2025 school cup migrates to the new id', () => {
  const m = new Map();
  DT.store.useStorage({ getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) });
  const cup = JSON.parse(JSON.stringify(DT.BUILTIN_FORMATS.find(f => f.id === 'ustc-school-cup')));
  cup.id = 'ustc-school-cup-2025'; cup.name = '我改过的校赛';
  m.set('dt.formats.v1', JSON.stringify({ schema: 1, formats: [cup] }));
  m.set('dt.lastMatch.v1', JSON.stringify({ formatId: 'ustc-school-cup-2025' }));
  const list = DT.store.loadFormats();
  const got = list.find(f => f.id === 'ustc-school-cup');
  assert.equal(got.name, '我改过的校赛');
  assert.ok(!list.some(f => f.id === 'ustc-school-cup-2025'));
  assert.equal(DT.store.loadLastMatch().formatId, 'ustc-school-cup');
});
```

```python
# test_build.py：把所有 "ustc-school-cup-2025" 换成 "ustc-school-cup"，并加
    def test_school_cup_name_has_no_year(self):
        f = self.all["ustc-school-cup"]
        self.assertEqual(f["name"], "中国科学技术大学校赛")
```

- 备赛技能的验证：对 `prep/v2/新生赛/*` 与 `prep/v3/招新3v3/*` 跑 `check_speeches.py`、`check_voice.py`、`check_recordcard.py`、`check_consistency.py --canon`、`check_evidence.py --canon`，结果与改名前一致（先在改名前跑一遍记下基线，改后再跑对比，写进报告）。另造一个临时目录 `prep/v3/校赛2025/x/`（测试完删除，不提交）放一份最小文稿，确认 `check_speeches.py` 仍认出校赛；`校赛` 目录同样
- `git grep -n "ustc-school-cup-2025\|校赛2025"` 只剩 CHANGELOG 历史条目、`docs/superpowers/` 历史文件和检查脚本里的别名

步骤：基线 → 写失败的测试 → 改 → 构建 → 全部测试（计时器两套 + 备赛检查对比）→ 提交。

---

### Task 23: 键盘根因修复与真实输入回归测试

**Files:**
- Modify: `timer/src/ui.js`（`isEditable`、音量控件结构、`keepFocus` 覆盖范围、编辑器关闭时解除阻挡、`e.key` 兜底）
- Modify: `timer/src/editor.js`（`onLeave` 回调）
- Modify: `timer/src/sync.js`（投影端断开检测与提示）
- Modify: `timer/src/render.js`（tension 量化与不变不写）、`timer/src/themes/riso.css`、`timer/src/themes/chalk.css`（删掉各自的量化）
- Modify: `timer/src/engine.js`（开场卡空格直接开始）
- Modify: `timer/tests/ui.test.js`、`sync.test.js`、`render.test.js`、`engine.test.js`、`demo.test.js` 等受开场卡行为变化影响的测试
- Create: `timer/tests/test_keyboard.py`
- Generated: `timer/src/index.html`、`timer/debate-timer.html`

本规格 §3 与 §4。修法按表格逐条做，**每条先有失败的测试**：

合成测试（加到对应文件）：

```js
// ui.test.js — P1: a focused range input must not swallow timer keys
DT.test('ui: keys still work while the volume slider has focus', () => {
  const t = boot();
  press('Space');                                     // title card → stage 1, running (new behaviour)
  const slider = document.querySelector('input[type="range"][name="volume"]');
  if (slider) {
    slider.focus();
    const ev = new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true, cancelable: true });
    slider.dispatchEvent(ev);
    assert.ok(ev.defaultPrevented);
    assert.equal(DT.engine.getRun(t.c.session()).running, false);
  }
  t.done();
});
// （音量滑块只在操作台或控制条里出现时，测试用相应的 boot 选项打开那个布局；照 ui.test.js 里现有的操作台测试写法）

// ui.test.js — P2: mouse clicks in the stage list and overlays leave no focus behind
DT.test('ui: clicking a stage-list row does not keep focus', () => {
  const t = boot();
  press('KeyS');
  const row = document.querySelector('.dt-overlay[data-name="stages"] button');
  const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
  row.dispatchEvent(down);
  assert.ok(down.defaultPrevented);
  t.done();
});

// ui.test.js — e.key fallback
DT.test('ui: a key without a code falls back to its key', () => {
  const t = boot();
  window.dispatchEvent(new KeyboardEvent('keydown', { code: '', key: 'ArrowRight', bubbles: true, cancelable: true }));
  assert.equal(t.c.session().cursor, 0);
  t.done();
});

// sync.test.js — P4
DT.test('sync: a projector whose console is gone neither forwards nor swallows keys', () => {
  const me = fakeWin(); const opener = Object.assign(fakeWin(), { closed: true });
  const end = DT.sync.createProjectorEnd({ target: me, opener, storage: null, onState() {}, onKey() {} });
  let prevented = false;
  me.emit('keydown', { code: 'Space', preventDefault() { prevented = true; } });
  assert.equal(opener.sent.length, 0);
  assert.equal(prevented, false);
  end.stop();
});

// render.test.js — P5
DT.test('render: tension is quantized and not rewritten when unchanged', () => {
  const h = R.mount(host());
  let s = E.toggle(session(0), T0);
  h.update(E.view(s, T0 + 60000));
  const root = document.querySelector('.dt-stage');
  const first = root.style.getPropertyValue('--tension');
  assert.equal(Number(first) * 50 % 1, 0, 'a multiple of 0.02');
  let writes = 0;
  const orig = root.style.setProperty.bind(root.style);
  root.style.setProperty = (k, v) => { if (k === '--tension') writes++; return orig(k, v); };
  h.update(E.view(s, T0 + 60010));
  assert.equal(writes, 0);
  h.destroy();
});

// engine.test.js — title card: one Space starts stage 1 (replaces the old test of the same name)
DT.test('engine: space on the title card starts the first stage', () => {
  const s = E.toggle(E.createSession(fx(), MATCH, T0), T0);
  assert.equal(s.cursor, 0);
  assert.ok(E.getRun(s).running);
});
```

（`fakeWin`、`host`、`session`、`E`、`R`、`fx`、`MATCH`、`T0`、`boot`、`press` 都是各测试文件里已有的辅助；名字不同时照实际改。P3 的合成测试：打开编辑器、按 Escape、立即派发 Space，断言恰好一次切换；需要绕开 reduced-motion 的快捷路径让 260ms 的关闭动画真的发生，照 `editor.js` 现有的判断写。）

开场卡行为改变后，许多现有测试里「`press('Space'); press('Space')` 从开场卡进入并开始」的写法会变成「开始然后暂停」：逐个改成「一次 `Space` 开始」，**不要改变测试想验证的含义**；`demo.js` 推演演示态时如果依赖旧行为，也照改并确认截图不变。

`timer/tests/test_keyboard.py`（真实输入，本规格 §4 的 6 个场景）：

```python
"""Keyboard regressions that only trusted input reproduces (focus, default actions).

Launches its own headless Edge with --remote-debugging-port and drives it with the
DevTools protocol (Input.dispatchMouseEvent / Input.dispatchKeyEvent). Only the
browser this test started is terminated. Skipped when no Edge/Chrome is installed.
"""
# Structure (write it out fully; standard library only):
#  - class CDP: minimal websocket client (HTTP Upgrade, masked client frames, read text frames),
#    send(method, params) -> result, evaluate(js) -> value
#  - launch(): free port, temp --user-data-dir under timer/tests/out/kbd-tests/, Popen, poll /json for the page target
#  - helpers: click(x, y) with mousePressed/mouseReleased; key(code, key, vk) with rawKeyDown/char/keyUp;
#    rect(selector) via Runtime.evaluate(getBoundingClientRect); state() reads DT.app controller state
#    (expose a read-only test hook if needed: e.g. window.__dtTest = {session: () => …} only when ?test=1)
#  - unittest.TestCase with setUpClass launching once and six test methods (本规格 §4 的 1–6),
#    each opening the built file with the needed query (?demo=console&…, or the setup flow)
#  - tearDownClass terminates the Popen handle only
```

如果需要页面暴露只读的测试钩子来读状态，只在查询参数 `?test=1` 时挂上，并在报告里写明。

步骤：每个根因：失败测试 → 修 → 通过；最后 `test_keyboard.py` 全过、全部测试过、构建 → 截图 `single,dual,console,title` 确认画面没变（P5 量化后数字粗细仍随时间变化）→ 提交（可以分几个提交，每个根因一个）。

---

### Task 24: 任意环节重置与随时退出

**Files:**
- Modify: `timer/src/engine.js`（`reset(session, now, index?)`）
- Modify: `timer/src/ui.js`（Q Q；控制条「重置」「退出」按钮；操作台「退出」按钮；两步确认组件；环节列表行尾的重置按钮；退出路由；帮助表）
- Modify: `timer/src/sync.js` 或 `ui.js` 的投影端（操作台退出后投影显示开场卡）
- Modify: `timer/src/styles/console.css`
- Modify: `timer/tests/engine.test.js`、`ui.test.js`、`test_keyboard.py`（加一个场景：点控制条「退出」两次 → 开赛页出现「上一场还没打完」）
- Modify: `timer/README.md`（键位表加 Q Q；重置与退出的说明）
- Generated: `timer/src/index.html`、`timer/debate-timer.html`

本规格 §2。测试：

```js
// engine.test.js
DT.test('engine: reset can target any stage and leaves the cursor alone', () => {
  let s = E.toggle(at(0), T0); s = E.next(s, T0 + 50000);       // stage 0 used 50 s, now on stage 1
  s = E.toggle(s, T0 + 50000);                                   // stage 1 running
  s = E.reset(s, T0 + 60000, 0);
  assert.equal(s.cursor, 1);
  assert.equal(E.remaining(E.getRun(s, 's1'), 'main', T0 + 70000), 180000);
  assert.ok(E.getRun(s).running, 'stage 1 untouched');
  s = E.undo(s, T0 + 61000);
  assert.equal(E.remaining(E.getRun(s, 's1'), 'main', T0 + 70000), 130000);
});

// ui.test.js
DT.test('ui: Q twice exits to the setup page and keeps the match', () => {
  const storage = memStorage();
  const t = boot({ storage, route: undefined });     // the normal app route (setup first) — follow the existing setup tests
  // start a match from the setup page the way the existing tests do, press Space to start, advance 5 s,
  // then: press('KeyQ'); press('KeyQ');
  // assert: the setup page is shown, its resume banner says 上一场还没打完, the saved session's current run is not running
  t.done();
});
DT.test('ui: exiting pauses the running clock', () => {
  // start, advance 10 s, Q Q, advance 120 s on the setup page, click 继续:
  // remaining time equals total - 10 s (the 120 s on the setup page are not charged)
});
DT.test('ui: a double-click does not confirm exit', () => {
  // two clicks on the dock 退出 button 100 ms apart (DT.clock advanced by 100) → still on the timer page;
  // a third click 400 ms later (within 1.5 s of the first) → exits
});
DT.test('ui: a stage-list row resets that stage after two clicks', () => {
  // use stage 0, go to stage 1, open S, the row for stage 0 shows a reset button (aria-label 重置第 1 个环节);
  // one click → its label reads 再点一次确认; second click (after 300 ms) → stage 0 is fresh, cursor unchanged
});
```

（后四条按 `ui.test.js` 里已有的开赛页 / 计时页测试的写法补全为可运行的代码，断言照注释。）

两步确认的统一实现：一个小函数 `confirmTwice(button, label, run)`：第一次点击记下时间并把按钮文字换成「再点一次确认」，加 `data-armed`；距第一次 ≥ 250ms 且 ≤ 1500ms 的第二次点击执行 `run`；超时或点了别处复原。键盘的 R R / G G / Q Q 继续用 `key()` 里已有的 `armed` 逻辑（不加 250ms 下限，按键不会双击误触）。

视觉：控制条加两个按钮后仍要放得下（1366 宽）；「退出」放在最右，与其他按钮有间隔；环节列表的重置按钮安静，只在悬停 / 聚焦 / 已用过的行出现。截图 `dock,console` 两种分辨率并看。

---

## Self-Review 记录

- 本规格覆盖：§1 → T22；§2 → T24；§3 → T23；§4 → T23（+T24 加一个场景）；§5 → 最终评审
- 依赖：T23 改了 `isEditable` 与 `keepFocus`，T24 新加的按钮与列表行沿用；T24 的 `test_keyboard.py` 场景复用 T23 的 CDP 客户端
- Review Focus 五条都有测试
