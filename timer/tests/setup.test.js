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

  // ---- beyond the brief ----

  const item = (t, id) => t.box.querySelector('[data-format-id="' + id + '"]');
  const input = (t, name) => t.box.querySelector('input[name="' + name + '"]');
  const keydown = (target, code, extra) => {
    const e = new KeyboardEvent('keydown', Object.assign({ code, key: 'Process', bubbles: true, cancelable: true }, extra || {}));
    target.dispatchEvent(e);
    return e;
  };

  DT.test('setup: each format shows its stages without breaks and its length with both sides of a dual', () => {
    const t = mount();
    // 招新赛 3v3: 20 stages, 3 of them breaks; 2070 s in all counting each free debate twice.
    const text = item(t, 'recruit-3v3').textContent;
    assert.ok(text.indexOf('17 个发言环节') >= 0, text);
    assert.ok(text.indexOf('约 35 分钟') >= 0, text);
    assert.ok(item(t, 'ustc-freshman-cup').textContent.indexOf('约 40 分钟') >= 0);
    item(t, 'recruit-3v3').click();
    assert.equal(t.box.querySelector('.dt-setup-meta').textContent, '17 个发言环节，约 35 分钟', "the editor's words");
    t.h.destroy();
  });

  DT.test('setup: built-in formats come first, the user\'s own after them', () => {
    const mine = Object.assign(JSON.parse(JSON.stringify(DT.BUILTIN_FORMATS[0])), { id: 'u-mine', name: '<b>周末模辩</b>', builtin: false });
    const t = mount({ formats: DT.BUILTIN_FORMATS.concat([mine]) });
    const ids = Array.from(t.box.querySelectorAll('[data-format-id]')).map(e => e.dataset.formatId);
    assert.equal(ids[ids.length - 1], 'u-mine');
    assert.ok(t.box.textContent.indexOf('我的') >= 0);
    assert.ok(item(t, 'u-mine').textContent.indexOf('<b>周末模辩</b>') >= 0, 'names are text, not markup');
    t.h.destroy();
  });

  DT.test('setup: preselects the last format and keeps empty fields empty', () => {
    const t = mount({ lastMatch: { formatId: 'recruit-2v2', proMotion: '  甲  ', proSeat: 'right' } });
    assert.equal(item(t, 'recruit-2v2').getAttribute('aria-selected'), 'true');
    assert.equal(t.box.querySelector('input[name="proSeat"][value="right"]').checked, true);
    t.box.querySelector('button[data-action="start"]').click();
    const [, id, match] = t.calls[0];
    assert.equal(id, 'recruit-2v2');
    assert.deepEqual(match, { title: '', proMotion: '甲', conMotion: '', proTeam: '', conTeam: '', proSeat: 'right' });
    t.h.destroy();
  });

  DT.test('setup: the team boxes sit in seat order and the button between them swaps the seats', () => {
    const t = mount();
    const order = () => Array.from(t.box.querySelectorAll('.dt-setup-teams input[type="text"]')).map(e => e.name);
    const swap = t.box.querySelector('.dt-setup-teams button[data-action="swap-seats"]');
    assert.deepEqual(order(), ['proTeam', 'conTeam']);
    assert.ok(swap.getAttribute('aria-label').indexOf('正方坐在左边') >= 0, swap.getAttribute('aria-label'));
    swap.click();
    assert.deepEqual(order(), ['conTeam', 'proTeam'], 'the left box is the side sitting on the left');
    assert.ok(swap.getAttribute('aria-label').indexOf('正方坐在右边') >= 0);
    assert.equal(t.box.querySelector('input[name="proSeat"]:checked').value, 'right');
    // Enter takes the boxes as laid out: the left one (反方) to the right one (正方), and that one starts.
    input(t, 'conTeam').focus();
    keydown(input(t, 'conTeam'), 'Enter');
    assert.equal(document.activeElement, input(t, 'proTeam'));
    keydown(input(t, 'proTeam'), 'Enter');
    assert.equal(t.calls[0][2].proSeat, 'right');
    swap.click();
    assert.deepEqual(order(), ['proTeam', 'conTeam']);
    t.h.destroy();
    const u = mount({ lastMatch: { proSeat: 'right' } });
    assert.deepEqual(Array.from(u.box.querySelectorAll('.dt-setup-teams input[type="text"]')).map(e => e.name),
      ['conTeam', 'proTeam'], 'a remembered right seat opens with 反方 on the left');
    u.h.destroy();
  });

  DT.test('setup: the theme grid has a row of its own, full width of the panel', () => {
    const t = mount();
    const row = t.box.querySelector('.dt-setup-themes').closest('.dt-setup-row');
    assert.equal(row.parentNode, t.box.querySelector('.dt-setup-match'));
    assert.equal(row.querySelector('input'), null, 'nothing else shares the row');
    t.h.destroy();
  });

  DT.test('setup: the theme follows the format until one is picked', () => {
    const daylight = Object.assign(JSON.parse(JSON.stringify(DT.BUILTIN_FORMATS[1])), { theme: 'daylight' });
    const formats = [DT.BUILTIN_FORMATS[0], daylight];
    const t = mount({ formats });
    const theme = id => t.box.querySelector('[role="radio"][data-theme-id="' + id + '"]');
    const checked = id => theme(id).getAttribute('aria-checked') === 'true';
    assert.equal(checked('hall'), true);
    item(t, daylight.id).click();
    assert.equal(checked('daylight'), true);
    theme('hall').click();
    item(t, formats[0].id).click();
    item(t, daylight.id).click();
    assert.equal(checked('hall'), true, 'a picked theme stays');
    t.box.querySelector('button[data-action="start"]').click();
    assert.equal(t.calls[0][3], 'hall');
    t.h.destroy();
  });

  DT.test('setup: a format with an unknown theme falls back to 堂', () => {
    const odd = Object.assign(JSON.parse(JSON.stringify(DT.BUILTIN_FORMATS[0])), { theme: 'we"ird' });
    const t = mount({ formats: [odd] });
    t.box.querySelector('button[data-action="start"]').click();
    assert.equal(t.calls[0][3], 'hall');
    t.h.destroy();
  });

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

  // Six themes, so the grid has a second row to move into.
  const SIX = ['hall', 'daylight', 'chroma', 't4', 't5', 't6'].map((id, i) => ({ id, name: '主题' + i, desc: 'desc ' + id, tone: 'dark' }));
  const cell = (t, id) => t.box.querySelector('[role="radio"][data-theme-id="' + id + '"]');
  const checkedTheme = t => t.box.querySelector('[role="radio"][aria-checked="true"]').dataset.themeId;

  DT.test('setup: the thumbnail is the opening speech, running, 40% used', () => {
    const t = mount();
    const stage = cell(t, 'daylight').querySelector('.dt-stage');
    assert.equal(stage.dataset.kind, 'single');
    assert.equal(stage.dataset.side, 'pro');
    assert.equal(stage.dataset.running, 'true');
    assert.equal(stage.querySelector('.dt-title').textContent, '正方一辩开篇立论');
    assert.equal(parseFloat(stage.style.getPropertyValue('--used')).toFixed(2), '0.40');
    assert.equal(cell(t, 'daylight').querySelector('.dt-stage-host').getAttribute('aria-hidden'), 'true', 'read by its name only');
    assert.ok(cell(t, 'daylight').textContent.indexOf('昼') >= 0);
    t.h.destroy();
  });

  DT.test('setup: the theme grid is one tab stop, moves by rows and wraps along a row', () => {
    const t = mount({ themes: SIX });
    const tabbable = () => Array.from(t.box.querySelectorAll('[role="radio"]')).filter(c => c.tabIndex === 0).map(c => c.dataset.themeId);
    assert.equal(t.box.querySelector('.dt-setup-themes').getAttribute('role'), 'radiogroup');
    assert.deepEqual(tabbable(), ['hall']);
    cell(t, 'hall').focus();
    assert.equal(keydown(cell(t, 'hall'), 'ArrowDown').defaultPrevented, true);
    const below = cell(t, checkedTheme(t));
    assert.ok(below.offsetTop > cell(t, 'hall').offsetTop, 'down goes to the next row');
    assert.ok(Math.abs(below.offsetLeft - cell(t, 'hall').offsetLeft) < 2, 'down keeps the column');
    assert.equal(document.activeElement, below, 'focus follows the choice');
    assert.deepEqual(tabbable(), [below.dataset.themeId]);
    keydown(below, 'ArrowUp');
    assert.equal(checkedTheme(t), 'hall');
    keydown(cell(t, 'hall'), 'ArrowUp');
    assert.equal(checkedTheme(t), 'hall', 'nothing above the first row');
    keydown(cell(t, 'hall'), 'ArrowLeft');
    assert.equal(checkedTheme(t), 't6', 'left from the first wraps to the last');
    keydown(cell(t, 't6'), 'Home');
    assert.equal(checkedTheme(t), 'hall');
    keydown(cell(t, 'hall'), 'End');
    assert.equal(checkedTheme(t), 't6');
    t.box.querySelector('button[data-action="start"]').click();
    assert.equal(t.calls[0][3], 't6');
    t.h.destroy();
  });

  DT.test('setup: the line under the grid describes the theme pointed at, then the chosen one again', () => {
    const t = mount({ themes: SIX });
    const desc = () => t.box.querySelector('.dt-setup-theme-desc').textContent;
    assert.equal(desc(), 'desc hall');
    cell(t, 'chroma').dispatchEvent(new MouseEvent('mouseenter'));
    assert.equal(desc(), 'desc chroma');
    cell(t, 'chroma').dispatchEvent(new MouseEvent('mouseleave'));
    assert.equal(desc(), 'desc hall');
    cell(t, 't4').dispatchEvent(new FocusEvent('focus'));
    assert.equal(desc(), 'desc t4');
    cell(t, 't4').dispatchEvent(new FocusEvent('blur'));
    assert.equal(desc(), 'desc hall');
    t.h.destroy();
  });

  DT.test('setup: Enter moves to the next box and starts from the last one, but not while composing', () => {
    const t = mount();
    const names = Array.from(t.box.querySelectorAll('input[type="text"]')).map(e => e.name);
    const last = input(t, names[names.length - 1]);
    input(t, 'title').focus();
    assert.equal(keydown(input(t, 'title'), 'Enter').defaultPrevented, true);
    assert.equal(document.activeElement, input(t, names[1]));
    keydown(last, 'Enter', { isComposing: true });
    assert.equal(t.calls.length, 0, 'Enter that ends IME composition only commits the text');
    keydown(last, 'NumpadEnter');
    assert.equal(t.calls.length, 1);
    assert.equal(t.calls[0][0], 'start');
    t.h.destroy();
  });

  DT.test('setup: the arrow keys move through the format list', () => {
    const t = mount();
    const list = t.box.querySelector('[role="listbox"]');
    const selected = () => t.box.querySelector('[data-format-id][aria-selected="true"]').dataset.formatId;
    assert.equal(selected(), DT.BUILTIN_FORMATS[0].id);
    assert.equal(keydown(list, 'ArrowDown').defaultPrevented, true);
    keydown(list, 'ArrowDown');
    assert.equal(selected(), DT.BUILTIN_FORMATS[2].id);
    keydown(list, 'ArrowUp');
    assert.equal(selected(), DT.BUILTIN_FORMATS[1].id);
    keydown(list, 'End');
    assert.equal(selected(), DT.BUILTIN_FORMATS[DT.BUILTIN_FORMATS.length - 1].id);
    keydown(list, 'ArrowDown');
    assert.equal(selected(), DT.BUILTIN_FORMATS[DT.BUILTIN_FORMATS.length - 1].id);
    assert.equal(list.getAttribute('aria-activedescendant'), item(t, selected()).id);
    t.h.destroy();
  });

  DT.test('setup: the resume banner names the match and the stage; discarding removes it', () => {
    const t = mount({ resumable: { title: '新生赛 第 3 场', cursor: 4, stage: '评委打分' } });
    const banner = t.box.querySelector('[data-role="resume"]');
    assert.ok(banner.textContent.indexOf('上一场还没打完：新生赛 第 3 场，停在第 5 个环节（评委打分）。') >= 0, banner.textContent);
    t.box.querySelector('button[data-action="discard"]').click();
    assert.equal(t.box.querySelector('[data-role="resume"]'), null);
    t.h.destroy();
    const u = mount();
    assert.equal(u.box.querySelector('[data-role="resume"]'), null);
    u.h.destroy();
  });

  DT.test('setup: 编辑赛制 is offered only when there is an editor to open', () => {
    const t = mount();
    t.box.querySelector('button[data-action="edit"]').click();
    assert.deepEqual(t.calls, [['edit']]);
    t.h.destroy();
    const u = mount({ onEdit: null });
    assert.equal(u.box.querySelector('button[data-action="edit"]'), null);
    u.h.destroy();
    assert.equal(u.box.firstChild.children.length, 0, 'destroy empties the root');
  });

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
  DT.test('setup: 导出这一场 is a plain button just left of 开始这一场, and the page can show a notice', () => {
    const t = mount({ canExport: true, onExport() {} });
    const foot = t.box.querySelector('.dt-setup-foot');
    const b = foot.querySelector('button[data-action="export"]');
    assert.equal(b.textContent, '导出这一场');
    assert.equal(b.nextElementSibling, foot.querySelector('button[data-action="start"]'));
    assert.ok(!b.hasAttribute('data-primary'));
    const notice = t.box.querySelector('.dt-setup-notice');
    assert.equal(notice.getAttribute('role'), 'status');
    t.h.toast('已导出');
    assert.equal(notice.textContent, '已导出');
    assert.ok(notice.hasAttribute('data-shown'));
    t.h.destroy();
    const u = mount({ onExport: null });
    assert.equal(u.box.querySelector('button[data-action="export"]'), null, 'no button without a handler');
    u.h.destroy();
  });

  // ---- routing (ui.js) ----

  function memStorage() {
    const m = new Map();
    return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
  }
  function fakeBells() {
    const log = { unlocked: 0 };
    return { log, unlock() { log.unlocked++; }, isUnlocked: () => log.unlocked > 0, schedule() {}, cancelAll() {},
      play() {}, setVolume() {}, setMuted() {} };
  }
  function bootApp(storage, search) {
    DT.clock.set(() => 9000000);
    const box = document.getElementById('sandbox'); box.innerHTML = '<div></div>';
    const bells = fakeBells();
    const c = DT.app.boot({ root: box.firstChild, storage, bells, location: { search: search || '', hash: '' } });
    return { c, box, bells, storage, done() { c.destroy(); DT.clock.reset(); } };
  }

  DT.test('ui: the page opens on the setup page and 开始这一场 starts the match', () => {
    const t = bootApp(memStorage());
    try {
      assert.equal(t.c.route(), 'setup');
      assert.equal(t.c.session(), null);
      assert.equal(t.box.querySelector(':not(.dt-setup-thumb) > .dt-stage'), null, 'no timer stage, only thumbnails');
      t.box.querySelector('[data-format-id="ustc-freshman-cup"]').click();
      const pro = t.box.querySelector('input[name="proTeam"]'); pro.value = '物理学院';
      t.box.querySelector('[data-theme-id="daylight"]').click();
      t.box.querySelector('button[data-action="start"]').click();
      assert.equal(t.c.route(), 'timer');
      assert.equal(t.box.querySelector('.dt-setup'), null);
      const s = t.c.session();
      assert.equal(s.format.id, 'ustc-freshman-cup');
      assert.equal(s.cursor, -1);
      assert.equal(s.theme, 'daylight');
      assert.equal(s.match.proTeam, '物理学院');
      assert.equal(t.box.querySelector('.dt-stage').dataset.theme, 'daylight');
      assert.ok(t.bells.log.unlocked >= 1, 'the click that starts the match unlocks the sound');
      const last = JSON.parse(t.storage.getItem('dt.lastMatch.v1'));
      assert.deepEqual(last, { formatId: 'ustc-freshman-cup', proMotion: '', conMotion: '', proTeam: '物理学院', conTeam: '', proSeat: 'left' });
      assert.equal(JSON.parse(t.storage.getItem('dt.session.v1')).id, s.id);
    } finally { t.done(); }
  });

  DT.test('ui: an unfinished match waits on the setup page; 继续 picks it up, 放弃并新开 drops it', () => {
    const storage = memStorage();
    let t = bootApp(storage);
    t.box.querySelector('[data-format-id="ustc-freshman-cup"]').click();
    t.box.querySelector('input[name="title"]').value = '第 7 场';
    t.box.querySelector('button[data-action="start"]').click();
    t.c.act('goto', 4);
    t.done();

    t = bootApp(storage);
    assert.equal(t.c.route(), 'setup');
    assert.ok(t.box.textContent.indexOf('上一场还没打完：第 7 场，停在第 5 个环节（评委打分）。') >= 0);
    t.box.querySelector('button[data-action="resume"]').click();
    assert.equal(t.c.route(), 'timer');
    assert.equal(t.c.session().cursor, 4);
    t.done();

    t = bootApp(storage);
    t.box.querySelector('button[data-action="discard"]').click();
    assert.equal(storage.getItem('dt.session.v1'), null);
    assert.equal(t.box.querySelector('[data-role="resume"]'), null);
    assert.equal(t.c.route(), 'setup');
    t.done();
  });

  DT.test('ui: the resume banner falls back to the motion, then the format name', () => {
    const storage = memStorage();
    const f = DT.BUILTIN_FORMATS.find(x => x.id === 'recruit-1v1');
    storage.setItem('dt.session.v1', JSON.stringify(DT.engine.createSession(f, { proMotion: '甲方辩题' }, 9000000)));
    let t = bootApp(storage);
    assert.ok(t.box.textContent.indexOf('上一场还没打完：甲方辩题，还没开始第一个环节。') >= 0, 'a match still on its title card');
    t.done();
    storage.setItem('dt.session.v1', JSON.stringify(DT.engine.createSession(f, {}, 9000000)));
    t = bootApp(storage);
    assert.ok(t.box.textContent.indexOf('上一场还没打完：招新赛 1v1') >= 0);
    t.done();
  });

  DT.test('ui: 新的一场 on the end card goes back to the setup page', () => {
    const storage = memStorage();
    const t = bootApp(storage);
    try {
      t.box.querySelector('button[data-action="start"]').click();
      const btn = t.box.querySelector('.dt-dock button[data-act="new"]');
      assert.ok(btn.hidden, 'only on the end card');
      t.c.act('goto', t.c.session().timeline.length);
      assert.equal(btn.hidden, false);
      btn.click();
      assert.equal(t.c.route(), 'setup');
      assert.equal(t.box.querySelector(':not(.dt-setup-thumb) > .dt-stage'), null, 'no timer stage, only thumbnails');
      assert.equal(t.box.querySelector('.dt-dock'), null);
      assert.equal(storage.getItem('dt.session.v1'), null);
      assert.equal(t.box.querySelector('[data-role="resume"]'), null);
    } finally { t.done(); }
  });

  DT.test('ui: the setup demos show the last match, and an unfinished one to resume', () => {
    let t = bootApp(null, '?demo=setup&frozen=1');
    try {
      assert.equal(t.c.route(), 'setup');
      assert.equal(t.box.querySelector('input[name="proTeam"]').value, '物理学院');
      assert.equal(t.box.querySelector('[data-format-id="ustc-freshman-cup"]').getAttribute('aria-selected'), 'true');
      assert.equal(t.box.querySelector('[data-role="resume"]'), null);
      const cells = t.box.querySelectorAll('.dt-setup-themes [role="radio"][data-theme-id]');
      assert.deepEqual(Array.from(cells).map(c => c.dataset.themeId).sort(), DT.THEMES.map(x => x.id).sort());
    } finally { t.done(); }
    t = bootApp(null, '?demo=setup-resume&frozen=1');
    try {
      assert.ok(t.box.textContent.indexOf('上一场还没打完：新生赛 第 3 场，停在第') >= 0);
      t.box.querySelector('button[data-action="resume"]').click();
      assert.equal(t.c.view().stage.name, '自由辩论');
    } finally { t.done(); }
  });
})();
