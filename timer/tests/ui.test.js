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

  DT.test('ui: pausing while the end bell rings lets it ring out', () => {
    const started = [];
    const node = () => ({ frequency: { value: 0 }, gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
      Q: { value: 0 }, connect() {}, disconnect() { this.disconnected = true; },
      start(t) { this.startAt = t; started.push(this); }, stop(t) { (this.stopCalls = this.stopCalls || []).push(t); } });
    const ctx = { currentTime: 10, destination: node(), sampleRate: 48000, resume: () => Promise.resolve(),
      createOscillator: node, createGain: node, createBiquadFilter: node, createBufferSource: node,
      createBuffer: (ch, len) => ({ getChannelData: () => new Float32Array(len) }) };
    DT.bells._setContextFactory(() => ctx); DT.bells._resetForTests();
    const t = boot({ bells: DT.bells });
    press('Space'); press('Space');
    const endBell = started.filter(n => n.startAt >= 190 - 0.01);
    assert.ok(endBell.length > 0, 'the end bell is planned at 180 s');
    t.clock.advance(180400); ctx.currentTime = 190.4;   // between the two strikes of the double bell
    press('Space');
    assert.equal(DT.engine.getRun(t.c.session()).running, false);
    endBell.forEach(n => assert.ok(!(n.stopCalls || []).includes(0) && !n.disconnected, 'the end bell is not cut off'));
    t.done();
    DT.bells._setContextFactory(null); DT.bells._resetForTests();
  });
  // ---- final review ----

  const run = t => DT.engine.getRun(t.c.session());
  const left = t => DT.engine.remaining(run(t), 'main', DT.clock.now());
  const later = ms => new Promise(r => setTimeout(r, ms));

  DT.test('ui: clicking the current row of the stage list leaves its running clock alone', () => {
    const t = boot();
    press('Space'); press('Space'); t.clock.advance(5000);
    const history = t.c.session().history.length;
    t.c.openOverlay('stages');
    document.querySelector('.dt-overlay[data-name="stages"] button[data-index="0"]').click();
    assert.ok(run(t).running);
    assert.equal(t.c.session().history.length, history);
    assert.equal(document.querySelector('.dt-overlay'), null, 'the list still closes');
    t.done();
  });

  DT.test('ui: taking time off a running clock past the 30 s point rings it at once', () => {
    const t = boot();
    const events = [];
    t.c.on('events', list => list.forEach(e => events.push(e.key)));
    press('Space'); press('Space');
    t.clock.advance(148000);
    press('ArrowDown', { shiftKey: true });
    assert.deepEqual(t.bells.log.played, ['ding']);
    assert.deepEqual(events, ['w30']);
    t.done();
  });

  DT.test('ui: undoing a mistaken switch rings the bell the speaker passed in the meantime', () => {
    const t = boot();
    freeDebate(t);
    const secs = DT.engine.currentStage(t.c.session()).secs;
    press('KeyA'); t.clock.advance(secs * 1000 - 35000);   // pro has 0:35 left
    press('KeyL'); t.clock.advance(8000);
    press('KeyZ');
    assert.deepEqual(t.bells.log.played, ['ding']);
    assert.equal(run(t).active, 'pro');
    t.done();
  });

  DT.test('ui: nothing can be inserted on the end card', () => {
    const t = boot({ formatId: 'ustc-school-cup-2025' });
    t.c.act('goto', t.c.session().timeline.length);
    assert.equal(document.querySelector('.dt-dock button[data-act="insert"]').disabled, true);
    press('KeyX');
    assert.equal(document.querySelector('.dt-overlay'), null);
    assert.equal(toastText(), '比赛已经结束');
    assert.equal(t.c.view().mode, 'end');
    t.done();
  });

  DT.test('ui: a held arrow key makes one undo step and saves once it settles', () => {
    const t = boot();
    press('Space'); press('Space'); t.clock.advance(30000);
    const before = t.c.session().history.length;
    press('ArrowUp');
    for (let i = 0; i < 20; i++) { t.clock.advance(33); press('ArrowUp', { repeat: true }); }
    assert.equal(t.c.session().history.length, before + 1);
    assert.equal(left(t), 150000 - 660 + 21000);
    press('KeyZ');
    assert.equal(left(t), 150000 - 660);
    t.clock.advance(1500); press('ArrowUp');
    t.clock.advance(1500); press('ArrowUp');
    assert.equal(t.c.session().history.length, before + 2, 'presses a second apart are separate steps');
    for (let i = 0; i < 5; i++) { t.clock.advance(33); press('ArrowUp', { repeat: true }); }
    t.done();
    const saved = JSON.parse(t.storage.getItem('dt.session.v1'));
    const stage = saved.timeline[saved.cursor];
    assert.equal(saved.runs[stage.id].clocks.main.used, t.c.session().runs[stage.id].clocks.main.used, 'the last step is saved on the way out');
  });

  DT.test('ui: one frame that throws does not stop the frame loop', async () => {
    const tick = DT.engine.tick;
    let calls = 0;
    DT.engine.tick = function () { if (!calls++) throw new Error('odd data'); return tick.apply(this, arguments); };
    const warn = console.warn;
    console.warn = () => {};
    let t;
    try { t = boot(); } finally { DT.engine.tick = tick; console.warn = warn; }
    try {
      press('Space'); press('Space');
      t.clock.advance(5000);
      await Promise.race([new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))), later(1000)]);
      assert.equal(document.querySelector('.dt-clock[data-clock="main"] .dt-sec').textContent, '55');
    } finally { t.done(); }
  });
  DT.test('ui: the current row of the stage list shows its time behind a dot of its own', () => {
    const t = boot();
    press('Space');
    t.c.openOverlay('stages');
    const row = i => document.querySelector('.dt-overlay[data-name="stages"] button[data-index="' + i + '"]');
    assert.equal(row(0).querySelector('.dt-row-dot').textContent, '● ');
    assert.equal(row(0).querySelector('.dt-row-state').textContent, '● 3:00');
    press('ArrowRight');
    t.c.openOverlay('stages');
    assert.equal(row(0).querySelector('.dt-row-dot').textContent, '');
    assert.equal(row(1).querySelector('.dt-row-dot').textContent, '● ');
    t.done();
  });

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

  // ---- match files (preset), beyond the brief ----

  const PRESET_MATCH = { title: '决赛', proMotion: '甲方辩题', conMotion: '乙方辩题', proTeam: '一队', conTeam: '二队', proSeat: 'left' };
  function bootPreset(storage, preset) {
    const box = document.getElementById('sandbox'); box.innerHTML = '<div></div>';
    const c = DT.app.boot({ root: box.firstChild, storage, bells: fakeBells(), preset, location: { search: '', hash: '' } });
    return { c, box, done() { c.destroy(); DT.clock.reset(); } };
  }

  DT.test('ui: a match file resumes its own unfinished match, in its own storage keys', () => {
    let now = T0; DT.clock.set(() => now);
    const storage = memStorage();
    const preset = DT.preset.make(DT.BUILTIN_FORMATS[0], PRESET_MATCH, 'ink', T0);
    let t = bootPreset(storage, preset);
    assert.equal(t.c.session().theme, 'ink');
    t.c.act('goto', 3);
    t.done();
    assert.equal(storage.getItem('dt.session.v1'), null, 'the plain timer\'s key is left alone');
    assert.equal(JSON.parse(storage.getItem('dt.m.' + preset.id + '.session.v1')).cursor, 3);
    t = bootPreset(storage, preset);
    assert.equal(t.c.route(), 'ask', 'a match left part way asks before it goes on');
    assert.ok(t.box.textContent.indexOf('决赛') >= 0);
    t.box.querySelector('button[data-action="resume"]').click();
    assert.equal(t.c.route(), 'timer');
    assert.equal(t.c.session().cursor, 3);
    t.done();
    assert.equal(DT.store.loadSession(), null, 'destroy leaves the plain keys in use again');
  });

  // A rehearsal left in the file (run, then the window closed) must not come back as the real match.
  DT.test('ui: a match file with a match left part way offers 继续上次 or 重新开始这一场', () => {
    let now = T0; DT.clock.set(() => now);
    const storage = memStorage();
    const preset = DT.preset.make(DT.BUILTIN_FORMATS[0], PRESET_MATCH, 'hall', T0);
    let t = bootPreset(storage, preset);
    press('Space'); press('Space');   // the first stage is running
    const rehearsal = t.c.session().id;
    t.done();
    now += 3 * 3600 * 1000;           // match day
    DT.clock.set(() => now);
    t = bootPreset(storage, preset);
    try {
      assert.equal(t.c.route(), 'ask');
      const resume = t.box.querySelector('button[data-action="resume"]');
      const restart = t.box.querySelector('button[data-action="restart"]');
      assert.equal(resume.textContent, '继续上次');
      assert.equal(restart.textContent, '重新开始这一场');
      assert.equal(document.activeElement, resume, 'Enter goes on, as a reload in the middle of the match wants');
      press('Space');
      assert.equal(t.c.route(), 'ask', "the timer's keys do nothing until one is chosen");
      restart.click();
      assert.equal(t.c.route(), 'timer');
      assert.ok(t.c.session().id !== rehearsal, 'a new match');
      assert.equal(t.c.session().cursor, -1);
      assert.deepEqual(t.c.session().runs, {});
      assert.equal(t.c.session().match.proMotion, '甲方辩题');
      assert.equal(JSON.parse(storage.getItem('dt.m.' + preset.id + '.session.v1')).id, t.c.session().id);
    } finally { t.done(); }
  });

  DT.test('ui: a match file whose match was never begun opens straight on its title card', () => {
    DT.clock.set(() => T0);
    const storage = memStorage();
    const preset = DT.preset.make(DT.BUILTIN_FORMATS[0], PRESET_MATCH, 'hall', T0);
    let t = bootPreset(storage, preset);
    const first = t.c.session().id;
    t.done();
    t = bootPreset(storage, preset);
    try {
      assert.equal(t.c.route(), 'timer');
      assert.equal(t.c.session().id, first);
      assert.equal(t.c.session().cursor, -1);
    } finally { t.done(); }
  });

  DT.test('ui: a match taken back to its title card still asks, since it has runs', () => {
    DT.clock.set(() => T0);
    const storage = memStorage();
    const preset = DT.preset.make(DT.BUILTIN_FORMATS[0], PRESET_MATCH, 'hall', T0);
    let t = bootPreset(storage, preset);
    press('Space'); press('Space'); press('ArrowLeft');
    assert.equal(t.c.session().cursor, -1);
    t.done();
    t = bootPreset(storage, preset);
    try { assert.equal(t.c.route(), 'ask'); } finally { t.done(); }
  });

  DT.test('ui: in a match file 放弃并新开 on the setup page goes back to a fresh title card of the match', () => {
    DT.clock.set(() => T0);
    const storage = memStorage();
    const preset = DT.preset.make(DT.BUILTIN_FORMATS[0], PRESET_MATCH, 'hall', T0);
    const t = bootPreset(storage, preset);
    try {
      press('Space'); press('Space'); press('ArrowLeft');
      const old = t.c.session().id;
      press('Escape');
      assert.equal(t.c.route(), 'setup');
      t.box.querySelector('button[data-action="discard"]').click();
      assert.equal(t.c.route(), 'timer');
      assert.ok(t.c.session().id !== old);
      assert.equal(t.c.session().cursor, -1);
      assert.equal(t.c.session().match.title, '决赛');
      assert.equal(JSON.parse(storage.getItem('dt.m.' + preset.id + '.session.v1')).id, t.c.session().id);
    } finally { t.done(); }
  });

  DT.test('ui: a different match started from a match file ends with 新的一场, back to the setup page', () => {
    DT.clock.set(() => T0);
    const preset = DT.preset.make(DT.BUILTIN_FORMATS[0], PRESET_MATCH, 'hall', T0);
    const t = bootPreset(memStorage(), preset);
    try {
      press('KeyE', { shiftKey: true });
      t.box.querySelector('[data-format-id="ustc-freshman-cup"]').click();
      t.box.querySelector('input[name="title"]').value = '友谊赛';
      t.box.querySelector('button[data-action="start"]').click();
      assert.equal(t.c.session().match.title, '友谊赛');
      t.c.act('goto', t.c.session().timeline.length);
      const btn = t.box.querySelector('.dt-dock button[data-act="new"]');
      assert.equal(btn.textContent, '新的一场');
      btn.click();
      assert.equal(t.c.route(), 'setup');
    } finally { t.done(); }
  });

  DT.test('ui: in a match file the end card restarts the same match on a fresh title card', () => {
    DT.clock.set(() => T0);
    const storage = memStorage();
    const preset = DT.preset.make(DT.BUILTIN_FORMATS[0], PRESET_MATCH, 'hall', T0);
    const t = bootPreset(storage, preset);
    try {
      const first = t.c.session().id;
      t.c.act('goto', t.c.session().timeline.length);
      const btn = t.box.querySelector('.dt-dock button[data-act="new"]');
      assert.equal(btn.hidden, false);
      assert.equal(btn.textContent, '重新开始这一场');
      btn.click();
      assert.equal(t.c.route(), 'timer');
      assert.ok(t.c.session().id !== first, 'a new match');
      assert.equal(t.c.session().cursor, -1);
      assert.equal(t.c.session().match.proMotion, '甲方辩题');
      assert.equal(t.box.querySelector('.dt-dock button[data-act="new"]').textContent, '重新开始这一场');
      assert.equal(JSON.parse(storage.getItem('dt.m.' + preset.id + '.session.v1')).id, t.c.session().id);
    } finally { t.done(); }
  });

  DT.test('ui: Shift+E on the title card opens the setup page, and Esc does in a match file; later E still opens the editor', () => {
    let t = boot();
    press('KeyE', { shiftKey: true });
    assert.equal(t.c.route(), 'setup');
    t.done();
    t = boot();
    press('Escape');
    assert.equal(t.c.route(), 'timer', 'in the plain timer Esc only closes overlays (main spec)');
    t.done();
    const preset = DT.preset.make(DT.BUILTIN_FORMATS[0], PRESET_MATCH, 'hall', T0);
    const m = bootPreset(memStorage(), preset);
    press('Escape');
    assert.equal(m.c.route(), 'setup', "a match file's Esc leads to the plain setup page (new spec §4.1)");
    m.done();
    t = boot();
    press('KeyH'); press('Escape');
    assert.equal(t.c.route(), 'timer', 'Esc closes an open overlay first');
    press('Space');
    press('KeyE', { shiftKey: true });
    assert.equal(t.c.route(), 'timer');
    assert.ok(document.querySelector('.dt-editor'), 'past the title card Shift+E is E');
    t.done();
  });

  DT.test('ui: a match file offers the plain setup page without its own format in the list', () => {
    const preset = DT.preset.make(Object.assign({}, DT.BUILTIN_FORMATS[0], { id: 'only-in-the-file', builtin: false }), PRESET_MATCH, 'hall', T0);
    const t = bootPreset(memStorage(), preset);
    try {
      press('KeyE', { shiftKey: true });
      assert.equal(t.c.route(), 'setup');
      assert.equal(t.box.querySelector('[data-format-id="only-in-the-file"]'), null);
      assert.equal(t.box.querySelectorAll('[data-format-id]').length, DT.BUILTIN_FORMATS.length);
      assert.ok(t.box.textContent.indexOf('上一场还没打完：决赛') >= 0, 'the match of the file waits to be resumed');
      t.box.querySelector('button[data-action="resume"]').click();
      assert.equal(t.c.session().match.proMotion, '甲方辩题');
    } finally { t.done(); }
  });

  DT.test('ui: 导出这一场 saves a page that opens on the chosen match, and says so', () => {
    const built = '<html lang="zh-CN"><head><title>辩论计时器</title><style>b{}</style></head><body data-dt-autoboot>' +
      '<div id="app"></div><script id="dt-main">window.__x = 1;</script></body></html>';
    const saved = [], realSave = DT.store.saveFile;
    DT.preset.captureSource(new DOMParser().parseFromString(built, 'text/html'));
    DT.store.saveFile = (name, text, mime) => saved.push({ name, text, mime });
    const t = bootPreset(memStorage(), null);
    try {
      t.box.querySelector('[data-format-id="ustc-freshman-cup"]').click();
      t.box.querySelector('input[name="title"]').value = '复赛';
      t.box.querySelector('input[name="proTeam"]').value = '物理学院';
      t.box.querySelector('[data-theme-id="daylight"]').click();
      const b = t.box.querySelector('button[data-action="export"]');
      assert.equal(b.disabled, false);
      b.click();
      assert.equal(saved.length, 1);
      assert.equal(saved[0].name, '复赛.html');
      assert.equal(saved[0].mime, 'text/html');
      const p = DT.preset.read(new DOMParser().parseFromString(saved[0].text, 'text/html'));
      assert.equal(p.format.id, 'ustc-freshman-cup');
      assert.equal(p.match.proTeam, '物理学院');
      assert.equal(p.theme, 'daylight');
      assert.ok(t.box.textContent.indexOf('已导出。把这个文件拷到比赛用的电脑上，双击就能直接开始这一场') >= 0);
      assert.equal(t.c.route(), 'setup', 'exporting does not start the match');
    } finally {
      t.done();
      DT.store.saveFile = realSave;
      DT.preset.captureSource(document);
    }
  });
})();
