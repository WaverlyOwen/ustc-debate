# 计时器：主题动画完善 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 8 个主题各有自己的动作语言（墨做得最深），并提供能把动画「看见」的动作取样工具。

**Architecture:** `render.js` 统一推出动作时刻并在 `.dt-stage` 上重放 `is-m-<时刻>` 类、调用主题 JS 的 `decorate().moment()` 与画师的 `moment()`；主题在自己的 CSS / JS 里编排。`timer/tests/cdp.py` 抽出共用的 DevTools 客户端，`timer/tests/motion.py` 放慢动画、等间隔截帧、拼成连拍图并测帧耗时。

**Tech Stack:** 同前；无新依赖（连拍图用本地 HTML + 无头 Edge 截图拼，不用 Pillow）。

**Spec:** `docs/superpowers/specs/2026-10-05-timer-theme-motion-design.md`（下文「本规格 §N」），以及此前三份计时器规格。

## Global Constraints

- 此前计划的全局约束全部有效（单文件、离线、经典脚本、`python`、`DT.clock.now()`、主题规则只写在 `[data-theme="<id>"]` 下与自己的文件里、SVG id 以 `dt-<id>-` 开头、可读性硬约束与对比度自动检查）
- 本规格 §1.2 的动作硬约束：时长 150–1200ms（over / title 环境动作除外）、写明曲线、只动 transform / opacity / clip-path / mask-position / stroke-dashoffset / CSS 变量、不持续动画滤镜、动画期间数字可读、reduced-motion 直接终态、帧耗时 p95 ≤ 20ms
- 每次改 `timer/src/` 后 `python timer/build.py` 并提交生成文件；`--check` 是测试的一部分
- 只结束自己启动的浏览器进程，**绝不**按名字结束进程
- 提交：只 add 本任务文件与生成文件；英文祈使句主题；结尾两行
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01YHLFBz1SxMJDZCpoDqt2Nt`

## Review Focus

1. **动画盖住数字**：粒子、遮罩、印章在任何一帧都不能遮挡数字 → 每个主题任务的连拍图评审逐帧看
2. **一场比赛里时刻会快速连发**（倒数每秒一次、自由辩快速来回换手）：重放类与 `decorate` 元素不能堆积、泄漏或互相打断成乱帧 → Task 32 测试 `render: rapid moments do not pile up elements`
3. **投影窗口与操作台预览同时播放**：两个渲染实例各自独立，不共享 DOM 状态 → Task 32 测试 `render: two stages animate independently`
4. **reduced-motion**：所有新动画在 reduced-motion 下直接到终态 → 每个主题任务用 `motion.py --reduced` 检查
5. **慢电脑**：一次性滤镜动画与 Canvas 不能让帧耗时失控 → `summary.json` 的 p95 预算

---

### Task 32: 动作时刻接口与动作取样工具

**Files:**
- Modify: `timer/src/render.js`（时刻推导、`is-m-<时刻>` 重放、`--moment-ms`、`data-m-side`、`decorate` 钩子、画师 `moment`）
- Modify: `timer/src/ui.js`（`?test=1` 钩子增加：触发动作、推进时钟、设置画师时间倍率）
- Create: `timer/tests/cdp.py`（从 `test_keyboard.py` 抽出客户端）；Modify: `timer/tests/test_keyboard.py`（改用它）
- Create: `timer/tests/motion.py`
- Create: `timer/tests/moments.test.js`
- Generated: `timer/src/index.html`、`timer/debate-timer.html`

**Interfaces:**
- `DT.themes.register(id, {defs?, painter?, decorate?})`；`decorate(stageEl, {thumbnail, reducedMotion, frozen}) → {update?(view), moment?(name, detail), destroy?()}`
- `painter` 返回对象可选 `moment(name, detail)`
- `render` 的 handle 增加 `moment(name, detail)`（ui 不直接调用；由 `update` 与 `pulse` 推出）
- 时刻名：`enter start pause warn count end over switch lock title`；`detail = {side, clock, key}`
- `motion.py` 的命令行见本规格 §3

测试（`moments.test.js`）：

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
  function spyTheme(id, log) {
    DT.themes.register(id, { decorate: () => ({ moment: (n, d) => log.push([n, d && d.side]), destroy() { log.push(['destroyed']); } }) });
    const saved = DT.THEMES; DT.THEMES = (saved || []).concat([{ id, name: 'x', desc: 'x', tone: 'dark' }]);
    return () => { DT.THEMES = saved; };
  }

  DT.test('render: moments are derived from view changes and events', () => {
    const log = []; const undo = spyTheme('zz-moments', log);
    try {
      const h = R.mount(host());
      let s = E.goto(E.createSession(F(), MATCH, T0, { theme: 'zz-moments' }), 0, T0);
      h.update(E.view(s, T0));                                   // enter
      s = E.toggle(s, T0); h.update(E.view(s, T0));              // start
      h.pulse({ type: 'warn', clock: 'main' });                  // warn
      s = E.toggle(s, T0 + 1000); h.update(E.view(s, T0 + 1000)); // pause
      const names = log.map(x => x[0]);
      ['enter', 'start', 'warn', 'pause'].forEach(n => assert.ok(names.indexOf(n) >= 0, n));
      h.destroy();
      assert.ok(names.concat(log.map(x => x[0])).indexOf('destroyed') >= 0);
    } finally { undo(); }
  });

  DT.test('render: a moment replays its class on the stage', () => {
    const h = R.mount(host());
    const s = E.toggle(E.goto(E.createSession(F(), MATCH, T0), 0, T0), T0);
    h.update(E.view(s, T0));
    h.pulse({ type: 'warn', clock: 'main' });
    const root = document.querySelector('.dt-stage');
    assert.ok(root.classList.contains('is-m-warn'));
    h.pulse({ type: 'warn', clock: 'main' });
    assert.ok(root.classList.contains('is-m-warn'));
    h.destroy();
  });

  DT.test('render: lock and switch are reported with their side', () => {
    const log = []; const undo = spyTheme('zz-side', log);
    try {
      const h = R.mount(host());
      let s = E.goto(E.createSession(F(), MATCH, T0, { theme: 'zz-side' }), idx('自由辩论'), T0);
      s = E.toggle(s, T0); h.update(E.view(s, T0));
      s = E.yieldTime(s, T0 + 1000); h.update(E.view(s, T0 + 1000));
      assert.ok(log.some(x => x[0] === 'lock' && x[1] === 'pro'));
      assert.ok(log.some(x => x[0] === 'switch'));
      h.destroy();
    } finally { undo(); }
  });

  DT.test('render: thumbnails and reduced motion get no moments', () => {
    const log = []; const undo = spyTheme('zz-still', log);
    try {
      const h = R.mount(host(), { thumbnail: true });
      const s = E.toggle(E.goto(E.createSession(F(), MATCH, T0, { theme: 'zz-still' }), 0, T0), T0);
      h.update(E.view(s, T0)); h.pulse({ type: 'warn', clock: 'main' });
      assert.equal(log.filter(x => x[0] !== 'destroyed').length, 0);
      assert.ok(!document.querySelector('.dt-stage').classList.contains('is-m-warn'));
      h.destroy();
    } finally { undo(); }
  });

  DT.test('render: rapid moments do not pile up elements', () => {
    const h = R.mount(host());
    const s = E.toggle(E.goto(E.createSession(F(), MATCH, T0), 0, T0), T0);
    h.update(E.view(s, T0));
    const before = document.querySelector('.dt-stage').querySelectorAll('*').length;
    for (let i = 0; i < 50; i++) h.pulse({ type: 'count', clock: 'main', key: 'c' + (i % 5) });
    const after = document.querySelector('.dt-stage').querySelectorAll('*').length;
    assert.ok(after - before <= 12, 'grew by ' + (after - before));
    h.destroy();
  });

  DT.test('render: two stages animate independently', () => {
    const box = document.getElementById('sandbox');
    box.innerHTML = '<div class="dt-stage-host" style="width:480px;height:270px"></div><div class="dt-stage-host" style="width:480px;height:270px"></div>';
    const a = R.mount(box.children[0]), b = R.mount(box.children[1]);
    const s = E.toggle(E.goto(E.createSession(F(), MATCH, T0), 0, T0), T0);
    a.update(E.view(s, T0)); b.update(E.view(s, T0));
    a.pulse({ type: 'warn', clock: 'main' });
    assert.ok(box.children[0].querySelector('.dt-stage').classList.contains('is-m-warn'));
    assert.ok(!box.children[1].querySelector('.dt-stage').classList.contains('is-m-warn'));
    a.destroy(); b.destroy();
  });
})();
```

（`yieldTime` 之后一方锁定、另一方接手，应同时报告 `lock`（pro）与 `switch`。如果现有 `pulse` 的元素清理方式不同，测试 5 的阈值以「不随次数线性增长」为准，写明你的判断。）

`motion.py`：先在一个主题上跑通（`--theme hall --moments enter,warn,end,switch`），连拍图里能清楚看到横扫与波纹的过程；再加 `--reduced`。写一个 `test_motion.py` 冒烟测试（无浏览器时跳过）：对 `hall` 的 `enter` 生成连拍图文件，`summary.json` 里有帧耗时字段。

步骤：失败测试 → 实现 → 通过 → 构建 → 生成 `hall` 的全部时刻连拍图并逐张看（确认工具本身取样正确：帧覆盖完整动画、时间标注对、放慢倍率生效）→ 提交。

---

### Task 33–38: 各主题的动作

| 任务 | 主题 | 本规格 | 文件 |
|---|---|---|---|
| 33 | `ink` 墨（最深） | §2.1 | `themes/ink.css`、`themes/ink.js` |
| 34 | `startrail` 星轨 | §2.2 | `themes/startrail.css`、`themes/startrail.js` |
| 35 | `chalk` 黑板 | §2.3 | `themes/chalk.css`、`themes/chalk.js` |
| 36 | `riso` 孔版 | §2.4 | `themes/riso.css`（必要时新建 `themes/riso.js`） |
| 37 | `construct` 构成 | §2.5 | `themes/construct.css`（必要时新建 `themes/construct.js`） |
| 38 | 堂、昼、绿幕与基线打磨 | §2.6 | `themes/hall.css`、`themes/daylight.css`、`themes/chroma.css`、`styles/stage.css`（只限基线动画的打磨） |

每个任务的共同步骤：

- [ ] 用 Skill 工具加载 `frontend-design:frontend-design`；读本规格 §1 与本主题那一节、主题现有的 CSS / JS；先用 `motion.py` 生成**改之前**的全部时刻连拍图，看清现状，写进报告
- [ ] 写一份简短的动作设计（每个时刻：做什么、时长、曲线、动哪个属性、为什么属于这个主题），写进报告
- [ ] 写该主题的行为测试，加到 `timer/tests/theme-<id>.test.js`（主题 33–37）或 `render.test.js`（38）：至少覆盖——`decorate` 插入的元素存在且 id 前缀正确；每个时刻触发后主题元素进入预期状态（类或属性）；缩略图 / reduced-motion 下处于终态且无动画；重复触发不堆积元素；`destroy` 清干净
- [ ] 实现；只改本任务列出的文件（38 可改 `stage.css` 的基线动画规则）；公共代码缺钩子时报告 DONE_WITH_CONCERNS，不要自己改 `render.js`
- [ ] `python timer/build.py`；`python timer/tests/motion.py --theme <id> --moments enter,start,pause,warn,count,end,over,switch,lock,title` 两种分辨率，外加 `--reduced`；逐张看连拍图，按本规格的编排与 §1.2 的硬约束反复改，直到每个时刻都好看、清楚、属于这个主题；`summary.json` 帧耗时 p95 ≤ 20ms
- [ ] 静态截图 `python timer/tests/screenshots.py --theme <id> --only single,dual,title,over,break` 确认终态没有走样
- [ ] 全部测试通过后提交

---

### Task 39: 文档

- `timer/README.md` 的「主题」一节：每个主题加一句动作的说明；「加主题」一节补上 `decorate` 钩子、动作时刻表、`is-m-<时刻>` 类、§1.2 的硬约束，以及 `motion.py` 的用法
- 运行全部验证与全部主题的动作取样，报告结果

---

## Self-Review 记录

- 本规格覆盖：§1 → T32；§2.1–2.6 → T33–38；§3 → T32；§4 → 各任务 + 最终评审
- 依赖：T33–38 都依赖 T32 的接口与工具；T39 依赖全部
- Review Focus 五条：1、4、5 在每个主题任务的连拍图与 `summary.json` 检查里；2、3 在 T32 的测试里
