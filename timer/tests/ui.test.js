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

  // ---- beyond the brief ----

  const freeDebate = t => t.c.act('goto', t.c.session().timeline.findIndex(s => s.name === '自由辩论'));
  const toastText = () => document.querySelector('.dt-toast').textContent;

  DT.test('ui: G needs a second press, then the speaker gives up the rest', () => {
    const t = boot();
    freeDebate(t);
    press('KeyA'); t.clock.advance(10000);
    press('KeyG');
    assert.equal(toastText(), '再按一次 G 放弃剩余时间');
    assert.equal(DT.engine.getRun(t.c.session()).active, 'pro');
    t.clock.advance(1000); press('KeyG');
    const r = DT.engine.getRun(t.c.session());
    assert.equal(r.locked.pro, true);
    assert.equal(r.active, 'con');
    assert.equal(r.yielded.pro, 229000);
    t.done();
  });

  DT.test('ui: another key between the two presses cancels the double press', () => {
    const t = boot();
    press('Space'); press('Space'); t.clock.advance(20000); press('Space');
    press('KeyR'); press('KeyB'); press('KeyR');
    assert.equal(DT.engine.remaining(DT.engine.getRun(t.c.session()), 'main', DT.clock.now()), 160000);
    t.done();
  });

  DT.test('ui: a held key does not repeat switching actions, but adjusting repeats', () => {
    const t = boot();
    press('Space'); press('Space', { repeat: true });
    assert.equal(t.c.session().cursor, 0);
    assert.equal(DT.engine.getRun(t.c.session()).running, false);
    press('ArrowUp', { repeat: true });
    assert.equal(DT.engine.getRun(t.c.session()).clocks.main.used, 0);
    press('ArrowDown', { repeat: true });
    assert.equal(DT.engine.getRun(t.c.session()).clocks.main.used, 1000);
    t.done();
  });

  DT.test('ui: browser shortcuts with Ctrl or Alt are left alone, except Ctrl+Z', () => {
    const t = boot();
    press('Space');
    const reload = new KeyboardEvent('keydown', { code: 'KeyR', ctrlKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(reload);
    assert.equal(reload.defaultPrevented, false);
    assert.equal(t.c.key('KeyS', { altKey: true }), false);
    assert.equal(document.querySelector('.dt-overlay'), null);
    const undo = new KeyboardEvent('keydown', { code: 'KeyZ', ctrlKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(undo);
    assert.equal(undo.defaultPrevented, true);
    assert.equal(t.c.session().cursor, -1);
    t.done();
  });

  DT.test('ui: an action that does not apply shows its feedback', () => {
    const t = boot();
    press('Space');
    press('KeyA');
    assert.equal(toastText(), '这个环节只有一个计时器');
    t.done();
  });

  DT.test('ui: timing keys keep working under an overlay; its own key closes it', () => {
    const t = boot();
    press('KeyS');
    press('Space');
    assert.equal(t.c.session().cursor, 0);
    assert.ok(document.querySelector('.dt-overlay[data-name="stages"]'));
    press('KeyS');
    assert.equal(document.querySelector('.dt-overlay'), null);
    press('KeyS', { shiftKey: true });
    assert.ok(document.querySelector('.dt-overlay[data-name="record"]'));
    press('Slash', { shiftKey: true });
    assert.ok(document.querySelector('.dt-overlay[data-name="help"]'));
    assert.equal(document.querySelectorAll('.dt-overlay').length, 1);
    t.c.closeOverlay();
    assert.equal(document.querySelector('.dt-overlay'), null);
    t.done();
  });

  DT.test('ui: the stage list marks the current stage and jumps on click', () => {
    const t = boot();
    press('Space');
    t.c.openOverlay('stages');
    const rows = document.querySelectorAll('.dt-overlay[data-name="stages"] button[data-index]');
    assert.equal(rows.length, t.c.session().timeline.length);
    assert.equal(rows[0].getAttribute('aria-current'), 'step');
    rows[3].click();
    assert.equal(t.c.session().cursor, 3);
    assert.equal(document.querySelector('.dt-overlay'), null);
    t.done();
  });

  DT.test('ui: the record copies as tab-separated text', async () => {
    const t = boot();
    let copied = null;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: s => { copied = s; return Promise.resolve(); } } });
    try {
      press('Space'); press('Space'); t.clock.advance(185000); press('Space');
      t.c.openOverlay('record');
      const panel = document.querySelector('.dt-overlay[data-name="record"]');
      assert.ok(panel.querySelectorAll('tr').length > t.c.session().timeline.length);
      panel.querySelector('button[data-action="copy"]').click();
      await Promise.resolve();
      const lines = copied.split('\n');
      assert.equal(lines[0], '环节\t计划\t实际\t超时');
      assert.equal(lines[1], '正方一辩开篇立论\t3:00\t3:05\t0:05');
      assert.equal(lines[2].split('\t')[2], '');
      assert.equal(lines.length, t.c.session().timeline.length + 1);
    } finally {
      delete navigator.clipboard;
      t.done();
    }
  });

  DT.test('ui: insert buttons of a used-up side are disabled and say so', () => {
    const t = boot({ formatId: 'ustc-school-cup-2025' });
    press('Space'); press('Space'); t.clock.advance(1000); press('Space');
    t.c.act('insert', '奇袭', 1, 'pro');
    t.c.openOverlay('insert');
    const btn = document.querySelector('.dt-overlay[data-name="insert"] button[data-side="pro"][data-variant="0"]');
    assert.equal(btn.disabled, true);
    assert.ok(btn.textContent.indexOf('已用') >= 0);
    assert.equal(document.querySelector('.dt-overlay[data-name="insert"] button[data-side="con"][data-variant="0"]').disabled, false);
    t.done();
  });

  DT.test('ui: X in a format without extras says so instead of opening a menu', () => {
    const t = boot();
    press('KeyX');
    assert.equal(document.querySelector('.dt-overlay'), null);
    assert.equal(toastText(), '这个赛制没有可插入的环节');
    t.done();
  });

  DT.test('ui: dock buttons follow the stage type and act like the keys', () => {
    const t = boot();
    const dock = document.querySelector('.dt-dock');
    const btn = sel => dock.querySelector('button[data-act="' + sel + '"]');
    assert.equal(btn('prev').disabled, true);
    press('Space');
    assert.equal(dock.querySelector('button[data-act="floor"][data-side="pro"]').disabled, true);
    assert.equal(btn('insert').disabled, true);
    btn('toggle').click();
    assert.ok(DT.engine.getRun(t.c.session()).running);
    assert.equal(btn('undo').disabled, false);
    freeDebate(t);
    assert.equal(dock.querySelector('button[data-act="floor"][data-side="con"]').disabled, false);
    dock.querySelector('button[data-act="floor"][data-side="con"]').click();
    assert.equal(DT.engine.getRun(t.c.session()).active, 'con');
    t.done();
  });

  DT.test('ui: the dock shows on pointer movement and on keyboard focus', () => {
    const t = boot();
    const dock = document.querySelector('.dt-dock');
    assert.equal(dock.hasAttribute('data-shown'), false);
    window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
    assert.equal(dock.hasAttribute('data-shown'), true);
    t.done();
    const u = boot();
    const d2 = document.querySelector('.dt-dock');
    d2.querySelector('button[data-act="stages"]').focus();
    assert.equal(d2.hasAttribute('data-shown'), true);
    u.done();
  });

  DT.test('ui: the dock demo holds the dock open on a still with no sound hint', () => {
    const box = document.getElementById('sandbox'); box.innerHTML = '<div></div>';
    const c = DT.app.boot({ root: box.firstChild, bells: fakeBells(), location: { search: '?demo=dock&frozen=1', hash: '' } });
    try {
      const dock = box.querySelector('.dt-dock');
      assert.ok(dock.hasAttribute('data-shown'));
      assert.ok(dock.hasAttribute('data-pinned'));
      assert.equal(dock.querySelector('.dt-toggle-label').textContent, '暂停');
      assert.equal(box.querySelector('.dt-pill[data-kind="sound"]').hasAttribute('data-shown'), false);
    } finally { c.destroy(); DT.clock.reset(); }
  });

  DT.test('ui: the sound hint shows until the first key, and a mute mark while muted', () => {
    const storage = memStorage();
    storage.setItem('dt.settings.v1', JSON.stringify({ volume: 0.5, muted: true }));
    const t = boot({ storage });
    assert.equal(t.bells.log.muted, true);
    const pill = kind => document.querySelector('.dt-pill[data-kind="' + kind + '"]');
    assert.equal(pill('sound').hasAttribute('data-shown'), true);
    assert.equal(pill('muted').hasAttribute('data-shown'), true);
    press('KeyM');
    assert.equal(pill('sound').hasAttribute('data-shown'), false);
    assert.equal(pill('muted').hasAttribute('data-shown'), false);
    assert.equal(t.bells.log.muted, false);
    t.done();
  });

  DT.test('ui: a broken saved session is dropped and a new match opens', () => {
    ['not json', '{"cursor":2}', JSON.stringify({ cursor: 0, timeline: [{ id: 'a' }], runs: {}, format: {}, match: {} })].forEach(bad => {
      const storage = memStorage();
      storage.setItem('dt.session.v1', bad);
      const t = boot({ storage });
      assert.equal(t.c.session().cursor, -1, bad);
      assert.equal(t.c.session().format.id, 'ustc-freshman-cup', bad);
      t.done();
    });
  });

  DT.test('ui: a finished saved match is not resumed', () => {
    const storage = memStorage();
    let t = boot({ storage });
    t.c.act('goto', t.c.session().timeline.length);
    t.done();
    t = boot({ storage, formatId: 'ustc-school-cup-2025' });
    assert.equal(t.c.session().format.id, 'ustc-school-cup-2025');
    t.done();
  });

  DT.test('ui: listeners hear changes and bell events; destroy stops the keys', () => {
    const t = boot();
    const changes = [], events = [];
    t.c.on('change', s => changes.push(s.cursor));
    t.c.on('events', list => list.forEach(e => events.push(e.key)));
    press('Space'); press('Space');
    t.clock.advance(150500);
    press('KeyP');
    assert.deepEqual(changes, [0, 0, 0]);
    assert.deepEqual(events, ['w30']);
    t.c.destroy();
    press('Space');
    assert.equal(t.c.session().cursor, 0);
    assert.equal(document.querySelector('.dt-dock'), null);
    DT.clock.reset();
  });
})();
