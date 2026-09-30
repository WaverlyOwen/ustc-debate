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

  // ---- beyond the brief ----

  const $ = (t, sel) => t.box.querySelector(sel);
  const row = (t, i) => $(t, '[data-stage-index="' + i + '"]');
  const typeInto = (input, value, type) => { input.value = value; input.dispatchEvent(new Event(type || 'input', { bubbles: true })); };
  const later = ms => new Promise(r => setTimeout(r, ms));
  const mine = (id, name) => ({ id, name, builtin: false, theme: 'hall', bells: { warn: [30], countdown: 0, end: 'double' },
    stages: [{ id: id + '-1', name: '立论', type: 'single', side: 'pro', secs: 120 }], extras: [] });
  const withMine = () => { DT.store.useStorage({ getItem: () => null, setItem() {}, removeItem() {} });
    return DT.store.loadFormats().concat([mine('u-weekend', '周末模辩')]); };

  DT.test('editor: moveStage clamps the target and leaves an out-of-range source alone', () => {
    const f = DT.BUILTIN_FORMATS[0], n = f.stages.length;
    assert.equal(DT.editor.moveStage(f, 0, 99).stages[n - 1].id, f.stages[0].id);
    assert.equal(DT.editor.moveStage(f, 2, -5).stages[0].id, f.stages[2].id);
    assert.deepEqual(DT.editor.moveStage(f, 99, 0).stages.map(s => s.id), f.stages.map(s => s.id));
  });

  DT.test('editor: the list shows built-in formats, then the user\'s own, and marks the chosen one', () => {
    const t = mount({ formats: withMine() });
    const items = Array.from(t.box.querySelectorAll('[data-format-id]'));
    assert.equal(items.length, DT.BUILTIN_FORMATS.length + 1);
    assert.equal(items[items.length - 1].dataset.formatId, 'u-weekend');
    assert.equal($(t, '[data-format-id][aria-current="true"]').dataset.formatId, 'ustc-freshman-cup');
    assert.equal($(t, 'input[name="format-name"]').value, '中国科学技术大学新生辩论赛');
    $(t, '[data-format-id="u-weekend"]').click();
    assert.equal($(t, 'input[name="format-name"]').value, '周末模辩');
    assert.equal(t.box.querySelectorAll('[data-stage-index]').length, 1);
    t.h.select('recruit-1v1');
    assert.equal($(t, 'input[name="format-name"]').value, '招新赛 1v1');
    t.h.destroy();
  });

  DT.test('editor: typing a name saves it and renames the list entry; an empty name is refused', () => {
    const t = mount();
    const name = $(t, 'input[name="format-name"]');
    typeInto(name, '新生赛（改）');
    assert.equal(current(t.state).name, '新生赛（改）');
    assert.ok($(t, '[data-format-id="ustc-freshman-cup"]').textContent.indexOf('新生赛（改）') >= 0);
    assert.ok($(t, '.dt-ed-status').textContent.indexOf('已保存') >= 0);
    const saves = t.state.changes;
    typeInto(name, '  ');
    assert.equal(t.state.changes, saves);
    assert.ok($(t, '[data-slot="name"]').textContent.indexOf('赛制名称不能为空') >= 0);
    assert.ok($(t, '.dt-ed-status').textContent.indexOf('改好才会保存') >= 0);
    typeInto(name, '新生赛');
    assert.equal(current(t.state).name, '新生赛');
    assert.equal($(t, '[data-slot="name"]').textContent, '');
    t.h.destroy();
  });

  DT.test('editor: a stage error from validation shows on its own row without the 第 N 个环节 prefix', () => {
    const t = mount();
    typeInto(row(t, 2).querySelector('input[name="name"]'), '');
    const msg = row(t, 2).querySelector('.dt-ed-msg').textContent;
    assert.equal(msg, '名称不能为空');
    assert.equal(row(t, 1).querySelector('.dt-ed-msg').textContent, '');
    assert.equal(t.state.changes, 0);
    t.h.destroy();
  });

  DT.test('editor: durations accept the spec\'s spellings and settle as m:ss', () => {
    const t = mount();
    const input = row(t, 0).querySelector('input[name="secs"]');
    [['180', 180, '3:00'], ['3分30秒', 210, '3:30'], ["1'30", 90, '1:30'], ['45秒', 45, '0:45']].forEach(([text, secs, shown]) => {
      typeInto(input, text, 'change');
      assert.equal(current(t.state).stages[0].secs, secs, text);
      assert.equal(input.value, shown, text);
    });
    typeInto(input, '61:00', 'change');
    assert.equal(input.getAttribute('aria-invalid'), 'true');
    assert.equal(current(t.state).stages[0].secs, 45);
    t.h.destroy();
  });

  DT.test('editor: a bad duration blocks saving other edits until it is fixed', () => {
    const t = mount();
    typeInto(row(t, 0).querySelector('input[name="secs"]'), '三分钟', 'change');
    typeInto($(t, 'input[name="format-name"]'), '别的名字');
    assert.equal(t.state.changes, 0);
    typeInto(row(t, 0).querySelector('input[name="secs"]'), '3:00', 'change');
    assert.equal(current(t.state).name, '别的名字');
    t.h.destroy();
  });

  DT.test('editor: break stages hide the side control; back to single brings the side back', () => {
    const t = mount();
    row(t, 0).querySelector('[data-type="break"]').click();
    let s = current(t.state).stages[0];
    assert.equal(s.type, 'break'); assert.equal(s.side, null); assert.equal('first' in s, false);
    assert.equal(row(t, 0).querySelector('[data-side], [data-first]'), null);
    row(t, 0).querySelector('[data-type="single"]').click();
    s = current(t.state).stages[0];
    assert.equal(s.type, 'single'); assert.equal(s.side, 'pro');
    row(t, 0).querySelector('[data-side="con"]').click();
    assert.equal(current(t.state).stages[0].side, 'con');
    assert.equal(row(t, 0).querySelector('[data-side="con"]').getAttribute('aria-pressed'), 'true');
    row(t, 0).querySelector('[data-type="dual"]').click();
    assert.equal(current(t.state).stages[0].first, 'con', 'the side that had the stage speaks first');
    row(t, 0).querySelector('[data-first="pro"]').click();
    assert.equal(current(t.state).stages[0].first, 'pro');
    t.h.destroy();
  });

  DT.test('editor: the expanded row edits speaker, block, note and the stage\'s own bells', () => {
    const t = mount();
    const r = () => row(t, 1);
    assert.equal(r().querySelector('input[name="speaker"]'), null, 'folded at first');
    r().querySelector('button[data-action="expand"]').click();
    assert.equal(r().querySelector('button[data-action="expand"]').getAttribute('aria-expanded'), 'true');
    assert.equal(r().querySelector('input[name="speaker"]').value, '反四 问，正一 答');
    typeInto(r().querySelector('input[name="speaker"]'), '反四 问');
    typeInto(r().querySelector('input[name="block"]'), 'B');
    typeInto(r().querySelector('input[name="note"]'), '');
    let s = current(t.state).stages[1];
    assert.equal(s.speaker, '反四 问'); assert.equal(s.block, 'B'); assert.equal('note' in s, false, 'an empty note is dropped');
    const mode = r().querySelector('select[name="bells-mode"]');
    assert.equal(mode.value, 'follow');
    assert.equal(r().querySelector('input[name="warn"]'), null);
    mode.value = 'custom'; mode.dispatchEvent(new Event('change', { bubbles: true }));
    assert.deepEqual(current(t.state).stages[1].bells, { warn: [30], countdown: 0, end: 'double' });
    typeInto(r().querySelector('input[name="warn"]'), '60，30', 'change');
    const cd = r().querySelector('select[name="countdown"]'); cd.value = '5'; cd.dispatchEvent(new Event('change', { bubbles: true }));
    const end = r().querySelector('select[name="end"]'); end.value = 'triple'; end.dispatchEvent(new Event('change', { bubbles: true }));
    assert.deepEqual(current(t.state).stages[1].bells, { warn: [60, 30], countdown: 5, end: 'triple' });
    assert.equal(r().querySelector('input[name="warn"]').value, '60, 30');
    typeInto(r().querySelector('input[name="warn"]'), '半分钟', 'change');
    assert.ok(r().textContent.indexOf('提示铃点写成秒数') >= 0);
    typeInto(r().querySelector('input[name="warn"]'), '', 'change');
    assert.deepEqual(current(t.state).stages[1].bells.warn, [], 'an empty box means no warning bell');
    const m2 = r().querySelector('select[name="bells-mode"]');
    m2.value = 'follow'; m2.dispatchEvent(new Event('change', { bubbles: true }));
    s = current(t.state).stages[1];
    assert.equal('bells' in s, false);
    t.h.destroy();
  });

  DT.test('editor: the format\'s default bells are edited in place', () => {
    const t = mount();
    const main = $(t, '[data-slot="bells"]').parentNode;
    typeInto(main.querySelector('input[name="warn"]'), '60 30', 'change');
    const end = main.querySelector('select[name="end"]'); end.value = 'long'; end.dispatchEvent(new Event('change', { bubbles: true }));
    assert.deepEqual(current(t.state).bells, { warn: [60, 30], countdown: 0, end: 'long' });
    t.h.destroy();
  });

  DT.test('editor: removing a stage saves; the last stage cannot be removed', () => {
    const t = mount({ formats: withMine(), selectedId: 'u-weekend' });
    const weekend = () => t.state.list.find(f => f.id === 'u-weekend');
    assert.ok(row(t, 0).querySelector('button[data-action="remove-stage"]').disabled);
    $(t, 'button[data-action="add-stage"]').click();
    assert.equal(weekend().stages.length, 2);
    assert.equal(document.activeElement, row(t, 1).querySelector('input[name="name"]'), 'the new stage is ready to be named');
    row(t, 0).querySelector('button[data-action="remove-stage"]').click();
    assert.equal(weekend().stages.length, 1);
    assert.equal(weekend().stages[0].name, '新环节');
    t.h.destroy();
  });

  DT.test('editor: dragging the handle below the third row moves the first stage there', () => {
    const t = mount();
    const ids = current(t.state).stages.map(s => s.id);
    const handle = row(t, 0).querySelector('.dt-ed-handle');
    const target = row(t, 2).getBoundingClientRect();
    handle.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, button: 0, clientY: 5, bubbles: true }));
    assert.ok(row(t, 0).hasAttribute('data-dragging'));
    handle.dispatchEvent(new PointerEvent('pointermove', { pointerId: 7, clientY: target.bottom - 2, bubbles: true }));
    const line = $(t, '.dt-ed-drop');
    assert.ok(!line.hidden, 'the gold line shows where the row will land');
    handle.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, clientY: target.bottom - 2, bubbles: true }));
    assert.deepEqual(current(t.state).stages.slice(0, 3).map(s => s.id), [ids[1], ids[2], ids[0]]);
    assert.equal($(t, '[data-dragging]'), null);
    t.h.destroy();
  });

  DT.test('editor: new and duplicate add user formats and select them', () => {
    const t = mount();
    $(t, 'button[data-action="new"]').click();
    const made = t.state.list[t.state.list.length - 1];
    assert.equal(made.builtin, false);
    assert.equal($(t, 'input[name="format-name"]').value, made.name);
    assert.equal(document.activeElement, $(t, 'input[name="format-name"]'));
    assert.ok(!$(t, 'button[data-action="delete"]').disabled);
    assert.ok($(t, 'button[data-action="restore"]').disabled);
    t.h.select('ustc-freshman-cup');
    $(t, 'button[data-action="duplicate"]').click();
    const copy = t.state.list[t.state.list.length - 1];
    assert.equal(copy.name, '中国科学技术大学新生辩论赛（副本）');
    assert.equal(copy.stages.length, current(t.state).stages.length);
    assert.equal($(t, '[data-format-id][aria-current="true"]').dataset.formatId, copy.id);
    t.h.destroy();
  });

  DT.test('editor: deleting a user format asks first; 取消 keeps it, 删除 removes it', () => {
    const t = mount({ formats: withMine(), selectedId: 'u-weekend' });
    $(t, 'button[data-action="delete"]').click();
    const dialog = () => $(t, '[role="alertdialog"]');
    assert.ok(dialog().textContent.indexOf('删除「周末模辩」？此操作不能撤销') >= 0);
    dialog().querySelector('button[data-answer="no"]').click();
    assert.equal(dialog(), null);
    assert.equal(t.state.changes, 0);
    $(t, 'button[data-action="delete"]').click();
    dialog().querySelector('button[data-answer="yes"]').click();
    assert.equal(t.state.list.some(f => f.id === 'u-weekend'), false);
    assert.ok($(t, '[data-format-id][aria-current="true"]'), 'another format is chosen');
    t.h.destroy();
  });

  DT.test('editor: importing a format that is already there asks 覆盖 or 另存一份', async () => {
    const t = mount();
    const theirs = JSON.parse(JSON.stringify(current(t.state)));
    theirs.stages[0].secs = 200;
    t.state.files = [DT.store.exportFormats([theirs])];
    $(t, 'button[data-action="import"]').click();
    await later(20);
    const dialog = $(t, '[role="alertdialog"]');
    assert.ok(dialog.textContent.indexOf('已经有一个叫「中国科学技术大学新生辩论赛」的赛制') >= 0);
    assert.deepEqual(Array.from(dialog.querySelectorAll('button')).map(b => b.textContent), ['覆盖', '另存一份']);
    dialog.querySelector('button[data-answer="copy"]').click();
    await later(20);
    assert.equal(current(t.state).stages[0].secs, 180, 'the original is kept');
    assert.ok(t.state.list.some(f => f.name === '中国科学技术大学新生辩论赛（导入）' && f.stages[0].secs === 200));
    t.state.files = [DT.store.exportFormats([theirs])];
    $(t, 'button[data-action="import"]').click();
    await later(20);
    $(t, '[role="alertdialog"] button[data-answer="replace"]').click();
    await later(20);
    assert.equal(current(t.state).stages[0].secs, 200);
    assert.equal(current(t.state).builtin, true, 'still restorable');
    assert.equal($(t, 'input[name="format-name"]').value, '中国科学技术大学新生辩论赛');
    assert.equal(row(t, 0).querySelector('input[name="secs"]').value, '3:20');
    t.h.destroy();
  });

  DT.test('editor: extra groups can be added and edited, and their errors show in the group', () => {
    const t = mount();
    $(t, 'button[data-action="add-extra"]').click();
    let g = current(t.state).extras[0];
    assert.equal(g.group, '奇袭'); assert.equal(g.perSide, 1); assert.equal(g.variants[0].type, 'single');
    const group = () => $(t, '[data-extra-index="0"]');
    typeInto(group().querySelector('input[name="group"]'), '突袭');
    group().querySelector('button[data-action="add-variant"]').click();
    typeInto(group().querySelectorAll('input[name="secs"]')[1], '1:00', 'change');
    g = current(t.state).extras[0];
    assert.equal(g.group, '突袭'); assert.equal(g.variants.length, 2); assert.equal(g.variants[1].secs, 60);
    typeInto(group().querySelector('input[name="perSide"]'), '0', 'change');
    assert.ok(group().textContent.indexOf('每方次数至少 1 次') >= 0);
    assert.equal(current(t.state).extras[0].perSide, 1);
    typeInto(group().querySelector('input[name="perSide"]'), '2', 'change');
    group().querySelectorAll('button[data-action="remove-variant"]')[0].click();
    assert.equal(current(t.state).extras[0].variants.length, 1);
    assert.equal(current(t.state).extras[0].perSide, 2);
    group().querySelector('button[data-action="remove-extra"]').click();
    assert.deepEqual(current(t.state).extras, []);
    t.h.destroy();
  });

  DT.test('editor: names go in as text, not markup', () => {
    const t = mount({ formats: withMine().concat([mine('u-x', '<img src=x onerror=alert(1)>')]), selectedId: 'u-x' });
    assert.equal(t.box.querySelector('img'), null);
    assert.ok($(t, '[data-format-id="u-x"]').textContent.indexOf('<img') >= 0);
    t.h.destroy();
  });

  DT.test('editor: Esc and 完成 close it; Esc first closes an open dialog', async () => {
    let t = mount({ formats: withMine(), selectedId: 'u-weekend' });
    $(t, 'button[data-action="delete"]').click();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
    assert.equal($(t, '[role="alertdialog"]'), null);
    assert.ok($(t, '.dt-editor'));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
    await later(400);
    assert.equal(t.state.closed, true);
    assert.equal($(t, '.dt-editor'), null);
    t = mount();
    $(t, 'button[data-action="close"]').click();
    await later(400);
    assert.equal(t.state.closed, true);
    t.h.destroy();
  });

  DT.test('editor: a mistyped duration stays with its stage when the stage moves', () => {
    const t = mount();
    typeInto(row(t, 0).querySelector('input[name="secs"]'), '三分钟', 'change');
    row(t, 0).dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown', altKey: true, bubbles: true }));
    assert.equal(row(t, 0).querySelector('.dt-ed-msg').textContent, '');
    assert.equal(row(t, 1).querySelector('.dt-ed-msg').textContent, '时长写成 3:00 或 180');
    assert.equal(row(t, 1).querySelector('input[name="secs"]').value, '三分钟');
    assert.equal(t.state.changes, 0);
    t.h.destroy();
  });

  DT.test('editor: closing with something still wrong asks before dropping it', async () => {
    const t = mount();
    typeInto(row(t, 0).querySelector('input[name="secs"]'), '三分钟', 'change');
    $(t, 'button[data-action="close"]').click();
    const dialog = () => $(t, '[role="alertdialog"]');
    assert.ok(dialog().textContent.indexOf('还有 1 处没改好') >= 0);
    dialog().querySelector('button[data-answer="stay"]').click();
    await later(400);
    assert.equal(t.state.closed, undefined);
    $(t, 'button[data-action="close"]').click();
    dialog().querySelector('button[data-answer="drop"]').click();
    await later(400);
    assert.equal(t.state.closed, true);
    assert.equal(t.state.changes, 0);
    t.h.destroy();
  });

  DT.test('editor: closing commits the box being typed in', async () => {
    const t = mount();
    const input = row(t, 0).querySelector('input[name="secs"]');
    input.focus();
    input.value = '2:00';
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
    assert.equal(current(t.state).stages[0].secs, 120);
    await later(400);
    t.h.destroy();
  });

  // ---- the editor in the app (ui.js) ----

  function memStorage() {
    const m = new Map();
    return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
  }
  function fakeBells() {
    const log = { unlocked: 0 };
    return { log, unlock() { log.unlocked++; }, isUnlocked: () => log.unlocked > 0, schedule() {}, cancelAll() {},
      play() {}, setVolume() {}, setMuted() {} };
  }
  function bootApp(extra) {
    DT.clock.set(() => 9000000);
    const box = document.getElementById('sandbox'); box.innerHTML = '<div></div>';
    const storage = memStorage();
    const c = DT.app.boot(Object.assign({ root: box.firstChild, storage, bells: fakeBells(), location: { search: '', hash: '' } }, extra || {}));
    return { c, box, storage, done() { c.destroy(); DT.clock.reset(); } };
  }
  const press = code => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: 'Process', bubbles: true }));

  DT.test('ui: 编辑赛制 opens the editor; closing it refreshes the list and keeps what was typed', async () => {
    const t = bootApp();
    try {
      t.box.querySelector('input[name="proTeam"]').value = '物理学院';
      t.box.querySelector('input[name="title"]').value = '第 9 场';
      t.box.querySelector('button[data-action="edit"]').click();
      const ed = t.box.querySelector('.dt-editor');
      assert.ok(ed);
      assert.ok(t.box.querySelector('.dt-setup').inert, 'the page behind is out of reach');
      ed.querySelector('[data-format-id="recruit-2v2"]').click();
      ed.querySelector('button[data-action="add-stage"]').click();
      const saved = JSON.parse(t.storage.getItem('dt.formats.v1'));
      assert.equal(saved.formats[0].id, 'recruit-2v2');
      press('Escape');
      await later(400);
      assert.equal(t.box.querySelector('.dt-editor'), null);
      const chosen = t.box.querySelector('[data-format-id][aria-selected="true"]');
      assert.equal(chosen.dataset.formatId, 'recruit-2v2', 'the format just edited is chosen');
      assert.ok(chosen.textContent.indexOf('13 个环节') >= 0, chosen.textContent);
      assert.equal(t.box.querySelector('input[name="proTeam"]').value, '物理学院');
      assert.equal(t.box.querySelector('input[name="title"]').value, '第 9 场');
      assert.equal(t.box.querySelector('.dt-setup').inert, false);
    } finally { t.done(); }
  });

  DT.test('ui: E opens the editor over a match, which keeps running and ignores timing keys', async () => {
    const t = bootApp({ route: 'timer', formatId: 'recruit-1v1' });
    try {
      press('Space');
      press('KeyE');
      const ed = t.box.querySelector('.dt-editor');
      assert.ok(ed);
      assert.equal(ed.querySelector('[data-format-id][aria-current="true"]').dataset.formatId, 'recruit-1v1');
      const cursor = t.c.session().cursor;
      press('Space'); press('ArrowRight');
      assert.equal(t.c.session().cursor, cursor);
      ed.querySelector('button[data-action="add-stage"]').click();
      assert.equal(t.c.session().timeline.length, DT.BUILTIN_FORMATS.find(f => f.id === 'recruit-1v1').stages.length,
        'the match keeps the format it started with');
      press('Escape');
      await later(400);
      assert.equal(t.box.querySelector('.dt-editor'), null);
      assert.equal(t.c.route(), 'timer');
      press('ArrowRight');
      assert.equal(t.c.session().cursor, cursor + 1);
    } finally { t.done(); }
  });

  DT.test('ui: the editor demos open on the freshman cup, one with a mistyped duration', () => {
    ['editor', 'editor-error'].forEach(name => {
      const t = bootApp({ storage: undefined, location: { search: '?demo=' + name + '&frozen=1', hash: '' } });
      try {
        const ed = t.box.querySelector('.dt-editor');
        assert.ok(ed, name);
        assert.equal(ed.querySelector('[data-format-id][aria-current="true"]').dataset.formatId, 'ustc-freshman-cup');
        assert.ok(ed.querySelector('[data-format-id="u-demo-weekend"]'), name + ': a format of the user\'s own');
        const bad = ed.textContent.indexOf('时长写成 3:00 或 180') >= 0;
        assert.equal(bad, name === 'editor-error', name);
      } finally { t.done(); }
    });
  });
})();
