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
    assert.ok(text.indexOf('17 个环节') >= 0, text);
    assert.ok(text.indexOf('约 35 分钟') >= 0, text);
    assert.ok(item(t, 'ustc-freshman-cup').textContent.indexOf('约 40 分钟') >= 0);
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

  DT.test('setup: the theme follows the format until one is picked', () => {
    const daylight = Object.assign(JSON.parse(JSON.stringify(DT.BUILTIN_FORMATS[1])), { theme: 'daylight' });
    const formats = [DT.BUILTIN_FORMATS[0], daylight];
    const t = mount({ formats });
    const theme = id => t.box.querySelector('input[name="theme"][value="' + id + '"]');
    assert.equal(theme('hall').checked, true);
    item(t, daylight.id).click();
    assert.equal(theme('daylight').checked, true);
    theme('hall').click();
    item(t, formats[0].id).click();
    item(t, daylight.id).click();
    assert.equal(theme('hall').checked, true, 'a picked theme stays');
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
    const t = mount({ resumable: { title: '新生赛 第 3 场', cursor: 4 } });
    const banner = t.box.querySelector('[data-role="resume"]');
    assert.ok(banner.textContent.indexOf('上一场还没打完：新生赛 第 3 场，停在第 5 个环节。') >= 0, banner.textContent);
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
      assert.equal(t.box.querySelector('.dt-stage'), null);
      t.box.querySelector('[data-format-id="ustc-freshman-cup"]').click();
      const pro = t.box.querySelector('input[name="proTeam"]'); pro.value = '物理学院';
      t.box.querySelector('input[name="theme"][value="daylight"]').click();
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
    assert.ok(t.box.textContent.indexOf('上一场还没打完：第 7 场，停在第 5 个环节。') >= 0);
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
      assert.equal(t.box.querySelector('.dt-stage'), null);
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
    } finally { t.done(); }
    t = bootApp(null, '?demo=setup-resume&frozen=1');
    try {
      assert.ok(t.box.textContent.indexOf('上一场还没打完：新生赛 第 3 场，停在第') >= 0);
      t.box.querySelector('button[data-action="resume"]').click();
      assert.equal(t.c.view().stage.name, '自由辩论');
    } finally { t.done(); }
  });
})();
