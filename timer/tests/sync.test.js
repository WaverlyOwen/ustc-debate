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

  // ---- beyond the brief ----

  const wait = ms => new Promise(r => setTimeout(r, ms));
  const T0 = 5000000;
  const MATCH = { title: '测试', proMotion: '甲', conMotion: '乙', proTeam: '', conTeam: '', proSeat: 'left' };
  const freshman = () => DT.BUILTIN_FORMATS.find(f => f.id === 'ustc-freshman-cup');
  const key = (code, extra) => ({ data: Object.assign({ source: 'debate-timer', type: 'key', code,
    shiftKey: false, ctrlKey: false, altKey: false, repeat: false }, extra || {}) });
  function memStorage() {
    const m = new Map();
    return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
  }
  function fakeBells() {
    return { unlock() {}, isUnlocked: () => true, schedule() {}, cancelAll() {}, play() {}, setVolume() {}, setMuted() {} };
  }
  const press = (code, opts) => window.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ code, key: 'Process', bubbles: true }, opts || {})));

  // A console page whose window opens `proj` as the projector.
  function bootConsole(extra) {
    let now = T0;
    DT.clock.set(() => now);
    const box = document.getElementById('sandbox'); box.innerHTML = '<div></div>';
    const host = fakeWin(), proj = fakeWin();
    let opens = 0;
    host.open = function (url, name, feat) { opens++; this.opened = [url, name, feat]; return proj; };
    const c = DT.app.boot(Object.assign({ root: box.firstChild, storage: memStorage(), bells: fakeBells(), route: 'timer',
      window: host, pollMs: 10, formatId: 'ustc-freshman-cup', match: MATCH }, extra || {}));
    return { c, host, proj, root: box.firstChild, opens: () => opens,
      advance: ms => { now += ms; },
      states: () => proj.sent.filter(m => m.type === 'state'),
      done() { c.destroy(); DT.clock.reset(); } };
  }

  DT.test('sync: the console link hands on keys from the projector and ignores other sources', () => {
    const target = fakeWin(), proj = fakeWin(); const keys = [];
    const link = DT.sync.createConsoleLink({ target, getWindow: () => proj, onKey: (code, k) => keys.push([code, k.shiftKey]), onClosed() {} });
    target.emit('message', key('ArrowUp', { shiftKey: true }));
    target.emit('message', { data: { source: 'other', type: 'key', code: 'Space' } });
    target.emit('message', { data: 'Space' });
    assert.deepEqual(keys, [['ArrowUp', true]]);
    link.stop();
    target.emit('message', key('Space'));
    assert.equal(keys.length, 1);
  });

  DT.test('sync: the heartbeat sends the last state again', async () => {
    const proj = fakeWin();
    const link = DT.sync.createConsoleLink({ getWindow: () => proj, onKey() {}, onClosed() {}, heartbeatMs: 10 });
    link.push({ type: 'state', session: { id: 'a' }, settings: {} });
    link.push({ type: 'toast', message: '提示' });
    await wait(45);
    link.stop();
    const states = proj.sent.filter(m => m.type === 'state');
    assert.ok(states.length >= 3, 'heartbeats: ' + states.length);
    assert.ok(states.every(m => m.session.id === 'a'));
    assert.equal(proj.sent.filter(m => m.type === 'toast').length, 1);
  });

  DT.test('sync: the projector falls back to the saved session and its storage events', () => {
    const me = fakeWin(), storage = memStorage(); const states = [];
    storage.setItem('dt.session.v1', JSON.stringify({ id: 'saved' }));
    const end = DT.sync.createProjectorEnd({ target: me, opener: null, storage, onState: s => states.push(s.session.id), onKey() {} });
    me.emit('storage', { key: 'dt.session.v1', newValue: JSON.stringify({ id: 'later' }) });
    me.emit('storage', { key: 'dt.session.v1', newValue: '{broken' });
    me.emit('storage', { key: 'dt.settings.v1', newValue: JSON.stringify({ id: 'settings' }) });
    me.emit('storage', { key: 'dt.session.v1', newValue: null });
    assert.deepEqual(states, ['saved', 'later']);
    me.emit('keydown', { code: 'Space', preventDefault() {} });   // no opener: nothing to forward, no error
    end.stop();
    me.emit('storage', { key: 'dt.session.v1', newValue: JSON.stringify({ id: 'after-stop' }) });
    assert.equal(states.length, 2);
  });

  // P4
  DT.test('sync: a projector whose console is gone neither forwards nor swallows keys', () => {
    const me = fakeWin(); const opener = Object.assign(fakeWin(), { closed: true });
    const end = DT.sync.createProjectorEnd({ target: me, opener, storage: null, onState() {}, onKey() {} });
    let prevented = false;
    me.emit('keydown', { code: 'Space', preventDefault() { prevented = true; } });
    assert.equal(opener.sent.length, 0);
    assert.equal(prevented, false);
    end.stop();
  });

  DT.test('sync: the projector leaves browser shortcuts to the browser', () => {
    const me = fakeWin(), opener = fakeWin();
    const end = DT.sync.createProjectorEnd({ target: me, opener, storage: null, onState() {}, onKey() {} });
    const ev = extra => Object.assign({ prevented: false, preventDefault() { this.prevented = true; } }, extra);
    const space = ev({ code: 'Space' }), reload = ev({ code: 'KeyR', ctrlKey: true }), f5 = ev({ code: 'F5' });
    [space, reload, f5].forEach(e => me.emit('keydown', e));
    assert.equal(space.prevented, true);
    assert.equal(reload.prevented, false);
    assert.equal(f5.prevented, false);
    assert.deepEqual(opener.sent.map(m => [m.type, m.code, m.ctrlKey]), [['key', 'Space', false], ['key', 'KeyR', true], ['key', 'F5', false]]);
    end.stop();
  });

  // 2026-10-03 spec §3: a presenter or an on-screen keyboard that sends no code is read by its key, in the
  // projector window too.
  DT.test('sync: codeOf reads a key that comes without a code', () => {
    assert.equal(DT.sync.codeOf({ code: 'KeyA', key: 'q' }), 'KeyA', 'a code wins');
    assert.equal(DT.sync.codeOf({ code: '', key: ' ' }), 'Space');
    assert.equal(DT.sync.codeOf({ code: '', key: 'PageDown' }), 'PageDown');
    assert.equal(DT.sync.codeOf({ code: '', key: 'f' }), 'KeyF');
    assert.equal(DT.sync.codeOf({ code: '', key: '?' }), 'Slash');
    assert.equal(DT.sync.codeOf({ code: '', key: 'Unidentified' }), '');
    assert.equal(DT.sync.codeOf({}), '');
  });

  DT.test('sync: the projector forwards a key that comes without a code by its key', () => {
    const me = fakeWin(), opener = fakeWin(); const seen = [];
    const end = DT.sync.createProjectorEnd({ target: me, opener, storage: null, onState() {}, onKey: code => seen.push(code) });
    const ev = extra => Object.assign({ prevented: false, preventDefault() { this.prevented = true; } }, extra);
    const down = ev({ code: '', key: 'PageDown' }), space = ev({ code: '', key: ' ' }), f = ev({ code: '', key: 'f' });
    const unknown = ev({ code: '', key: 'Unidentified' });
    [down, space, f, unknown].forEach(e => me.emit('keydown', e));
    assert.deepEqual(opener.sent.map(m => m.code), ['PageDown', 'Space'], 'F stays here; an unknown key is not sent');
    assert.deepEqual(seen.slice(0, 3), ['PageDown', 'Space', 'KeyF'], 'this window hears the key it stands for');
    assert.equal(down.prevented, true);
    assert.equal(space.prevented, true);
    assert.equal(unknown.prevented, false, 'a key the timer cannot read stays with the browser');
    end.stop();
  });

  DT.test('sync: openProjector returns null when the window is blocked', () => {
    const w = fakeWin();
    w.open = () => null;
    assert.equal(DT.sync.openProjector(w), null);
    w.open = () => { throw new Error('blocked'); };
    assert.equal(DT.sync.openProjector(w), null);
  });

  DT.test('sync: findProjector keeps a projector window and closes a blank one', () => {
    const w = fakeWin(), proj = fakeWin(), blank = fakeWin();
    proj.location.hash = '#projector';
    blank.close = function () { this.wasClosed = true; };
    w.open = function (url, name) { this.asked = [url, name]; return proj; };
    assert.equal(DT.sync.findProjector(w), proj);
    assert.deepEqual(w.asked, ['', 'dt-projector']);
    w.open = () => blank;
    assert.equal(DT.sync.findProjector(w), null);
    assert.equal(blank.wasClosed, true);
    // Another file's page is cross-origin: reading its location throws, and only our projector has that name.
    const far = fakeWin();
    Object.defineProperty(far, 'location', { get() { throw new Error('cross-origin'); } });
    w.open = () => far;
    assert.equal(DT.sync.findProjector(w), far);
  });

  DT.test('sync: O opens the projector window and the page becomes the console', () => {
    const t = bootConsole();
    try {
      assert.equal(t.root.querySelector('.dt-dock button[data-act="projector"]').textContent.indexOf('投影窗口') >= 0, true);
      press('KeyO');
      assert.equal(t.host.opened[1], 'dt-projector');
      assert.equal(t.root.getAttribute('data-layout'), 'console');
      assert.ok(t.root.querySelector('.dt-console .dt-preview.dt-stage-host > .dt-stage'));
      assert.equal(t.root.querySelectorAll('.dt-console-list button[data-index]').length, t.c.session().timeline.length);
      assert.equal(t.states().pop().session.cursor, -1);
      press('Space');
      const last = t.states().pop();
      assert.equal(last.session.cursor, 0);
      assert.equal(last.source, 'debate-timer');
      assert.deepEqual(Object.keys(last.settings).sort(), ['muted', 'volume']);
      assert.ok(t.c.session().history.length > 0);
      assert.deepEqual(last.session.history, [], 'the projector is sent no undo history');
      press('KeyO');
      assert.equal(t.opens(), 1, 'a second O brings the open window forward instead of opening another');
    } finally { t.done(); }
  });

  DT.test('sync: keys pressed in the projector window drive the console', () => {
    const t = bootConsole();
    try {
      press('KeyO');
      t.host.emit('message', key('Space'));
      assert.equal(t.c.session().cursor, 0);
      assert.ok(DT.engine.getRun(t.c.session()).running);
      t.host.emit('message', { data: { source: 'other', type: 'key', code: 'Space' } });
      assert.ok(DT.engine.getRun(t.c.session()).running);
      t.host.emit('message', key('Space'));
      assert.equal(DT.engine.getRun(t.c.session()).running, false);
    } finally { t.done(); }
  });

  DT.test('sync: closing the projector window brings back the single screen', async () => {
    const t = bootConsole();
    try {
      press('KeyO');
      t.proj.closed = true;
      await wait(50);
      assert.equal(t.root.hasAttribute('data-layout'), false);
      assert.equal(t.root.querySelector('.dt-console'), null);
      assert.equal(t.root.querySelector('.dt-stage').parentNode, t.root);
      t.host.emit('message', key('Space'));
      assert.equal(t.c.session().cursor, -1, 'the closed window no longer sends keys');
    } finally { t.done(); }
  });

  DT.test('sync: console controls and the stage list act like the keys', () => {
    const t = bootConsole();
    try {
      press('KeyO');
      const panel = t.root.querySelector('.dt-console-controls');
      const btn = sel => panel.querySelector('button[data-act="' + sel + '"]');
      btn('toggle').click();
      assert.equal(t.c.session().cursor, 0);
      t.advance(30000);
      panel.querySelector('button[data-act="adjust"][data-ms="5000"]').click();
      assert.equal(DT.engine.remaining(DT.engine.getRun(t.c.session()), 'main', DT.clock.now()), 155000);
      assert.equal(panel.querySelector('button[data-act="floor"][data-side="pro"]').disabled, true);
      t.root.querySelectorAll('.dt-console-list button[data-index]')[7].click();
      assert.equal(t.c.session().cursor, 7);
      const rows = t.root.querySelectorAll('.dt-console-list button[data-index]');
      assert.equal(rows[7].getAttribute('aria-current'), 'step');
      assert.equal(rows[0].querySelector('.dt-row-state').textContent, '✓ 0:25');
      btn('toggle').click();
      t.advance(4000);
      const id = t.c.session().timeline[7].id;
      assert.ok(t.c.session().runs[id]);
      btn('reset').click();
      assert.equal(btn('reset').querySelector('.dt-arm-ask').textContent, '再点一次重置');
      t.advance(300); btn('reset').click();
      assert.equal(t.c.session().runs[id], undefined, 'the stage is fresh');
      assert.equal(t.c.session().cursor, 7);
    } finally { t.done(); }
  });

  // 2026-10-03 spec §2.2: the console's 退出, and the projector window while the console is away.
  DT.test('sync: the console exits with two clicks and the projector shows the title card meanwhile', () => {
    const t = bootConsole();
    try {
      press('KeyO');
      const btn = sel => t.root.querySelector('.dt-console-controls button[data-act="' + sel + '"]');
      press('Space');
      t.advance(8000);
      btn('exit').click();
      assert.equal(btn('exit').querySelector('.dt-arm-ask').textContent, '再点一次退出');
      t.advance(300); btn('exit').click();
      assert.equal(t.c.route(), 'setup');
      assert.equal(t.root.querySelector('.dt-console'), null);
      const away = t.states().pop();
      assert.equal(away.away, true, 'the projector is told the console is away');
      assert.equal(away.session.cursor, 0);
      assert.equal(DT.engine.getRun(away.session).running, false);
      t.advance(60000);
      t.root.querySelector('button[data-action="resume"]').click();
      assert.equal(t.c.route(), 'timer');
      assert.equal(t.root.getAttribute('data-layout'), 'console', 'back as the console, the projector still open');
      const back = t.states().pop();
      assert.equal(back.away, false);
      assert.equal(DT.engine.remaining(DT.engine.getRun(back.session), 'main', DT.clock.now()), 180000 - 8300,
        'charged up to the confirming click, not for the minute away');
    } finally { t.done(); }
  });

  DT.test('sync: a projector shows the title card while the console is away, and storage does not undo that', () => {
    const box = document.getElementById('sandbox'); box.innerHTML = '<div></div>';
    const me = fakeWin(), opener = fakeWin();
    me.opener = opener;
    DT.clock.set(() => T0);
    const c = DT.app.boot({ root: box.firstChild, route: 'projector', window: me, storage: memStorage(), bells: fakeBells() });
    try {
      const s = DT.engine.goto(DT.engine.createSession(freshman(), MATCH, T0), 2, T0);
      const state = extra => ({ data: Object.assign({ source: 'debate-timer', type: 'state', session: s, settings: {} }, extra) });
      me.emit('message', state({ away: true }));
      const stage = box.querySelector('.dt-stage');
      assert.equal(stage.getAttribute('data-mode'), 'title');
      assert.equal(c.view().mode, 'title');
      const foot = box.querySelector('.dt-next').textContent;
      assert.ok(foot.indexOf('比赛暂停') >= 0 && foot.indexOf('停在第 3 个环节：' + s.timeline[2].name) >= 0, foot);
      assert.equal(foot.indexOf('空格开始'), -1, 'no call to start what the room cannot start from here');
      me.emit('keydown', { code: 'Space', key: ' ', preventDefault() {} });
      assert.equal(box.querySelector('.dt-toast').textContent, '计时员在开赛页，回到计时后继续', 'a key here is answered');
      me.emit('storage', { key: 'dt.session.v1', newValue: JSON.stringify(s) });
      assert.equal(stage.getAttribute('data-mode'), 'title', 'the console saving on its way out changes nothing');
      me.emit('message', state({ away: false }));
      assert.equal(stage.getAttribute('data-mode'), 'stage');
      assert.equal(c.session().cursor, 2);
    } finally { c.destroy(); DT.clock.reset(); }
  });

  DT.test('sync: 放弃并新开 on the setup page clears the projector, which keeps it cleared', async () => {
    const t = bootConsole({ route: undefined, location: { search: '', hash: '' }, preset: null });
    try {
      t.root.querySelector('[data-format-id="ustc-freshman-cup"]').click();
      t.root.querySelector('button[data-action="start"]').click();
      press('KeyO');
      press('Space');
      press('KeyQ'); press('KeyQ');
      assert.equal(t.c.route(), 'setup');
      t.root.querySelector('button[data-action="discard"]').click();
      assert.equal(t.proj.sent[t.proj.sent.length - 1].type, 'clear');
      await wait(1100);   // the heartbeat
      assert.equal(t.proj.sent.filter(m => m.type === 'state' || m.type === 'clear').pop().type, 'clear',
        'the heartbeat does not bring the discarded match back');
    } finally { t.done(); }
  });

  DT.test('sync: a cleared projector shows nothing of the discarded match', () => {
    const box = document.getElementById('sandbox'); box.innerHTML = '<div></div>';
    const me = fakeWin(), opener = fakeWin();
    me.opener = opener;
    DT.clock.set(() => T0);
    const c = DT.app.boot({ root: box.firstChild, route: 'projector', window: me, storage: memStorage(), bells: fakeBells() });
    try {
      const s = DT.engine.createSession(freshman(), MATCH, T0);
      me.emit('message', { data: { source: 'debate-timer', type: 'state', session: s, settings: {}, away: true } });
      assert.equal(box.querySelector('.dt-stage').getAttribute('data-mode'), 'title');
      me.emit('message', { data: { source: 'debate-timer', type: 'clear' } });
      assert.equal(c.session(), null);
      assert.equal(box.querySelectorAll('.dt-stage').length, 1);
      assert.equal(box.querySelector('.dt-stage').hasAttribute('data-mode'), false, 'a blank stage');
      assert.equal(box.querySelector('.dt-teams').textContent.indexOf('甲'), -1);
    } finally { c.destroy(); DT.clock.reset(); }
  });

  // The console's heartbeat repeats its last word, a clear included, every second: a cleared projector stays as it is.
  DT.test('sync: a clear repeated by the heartbeat leaves a cleared projector alone', () => {
    const box = document.getElementById('sandbox'); box.innerHTML = '<div></div>';
    const me = fakeWin(), opener = fakeWin();
    me.opener = opener;
    DT.clock.set(() => T0);
    const c = DT.app.boot({ root: box.firstChild, route: 'projector', window: me, storage: memStorage(), bells: fakeBells() });
    const clear = () => me.emit('message', { data: { source: 'debate-timer', type: 'clear' } });
    try {
      const s = DT.engine.createSession(freshman(), MATCH, T0);
      me.emit('message', { data: { source: 'debate-timer', type: 'state', session: s, settings: {}, away: false } });
      clear();
      const blank = box.querySelector('.dt-stage');
      me.emit('message', { data: { source: 'debate-timer', type: 'toast', message: '新的一场' } });
      clear();
      clear();
      assert.equal(box.querySelector('.dt-stage'), blank, 'the blank stage is not built again');
      assert.equal(box.querySelector('.dt-toast').textContent, '新的一场', 'nor is a toast on it wiped');
      me.emit('message', { data: { source: 'debate-timer', type: 'state', session: s, settings: {}, away: false } });
      assert.equal(box.querySelector('.dt-stage').getAttribute('data-mode'), 'title');
      clear();
      assert.ok(box.querySelector('.dt-stage') !== blank, 'a match shown again is cleared again');
      assert.equal(box.querySelector('.dt-stage').hasAttribute('data-mode'), false);
      assert.equal(c.session(), null);
    } finally { c.destroy(); DT.clock.reset(); }
  });

  DT.test('sync: bell events reach the projector, and of the toasts only what the room should see', () => {
    const t = bootConsole();
    const toasts = () => t.proj.sent.filter(m => m.type === 'toast').map(m => m.message);
    try {
      press('KeyO');
      press('Space');
      t.advance(150500);
      press('KeyP');
      const events = t.proj.sent.filter(m => m.type === 'events');
      assert.deepEqual(events.map(m => m.events.map(e => e.key)), [['w30']]);
      press('KeyR'); press('KeyB'); press('KeyA');
      assert.equal(t.root.querySelector('.dt-toast').textContent, '这个环节只有一个计时器', 'the console still shows them');
      assert.deepEqual(toasts(), [], "the timekeeper's own prompts stay on the console");
      t.c.act('goto', t.c.session().timeline.findIndex(s => s.name === '自由辩论'));
      press('KeyA'); t.advance(1000);
      press('KeyG'); press('KeyG');
      press('KeyA');
      assert.deepEqual(toasts(), ['正方已放弃剩余时间']);
    } finally { t.done(); }
  });

  DT.test('sync: a refreshed console finds its projector window again', () => {
    const flagged = () => ({ getItem: k => (k === 'dt.projector' ? '1' : null), setItem() {}, removeItem() {} });
    const box = document.getElementById('sandbox');
    const bootWith = host => {
      box.innerHTML = '<div></div>';
      DT.clock.set(() => T0);
      return DT.app.boot({ root: box.firstChild, storage: memStorage(), bells: fakeBells(), route: 'timer', window: host,
        formatId: 'ustc-freshman-cup', match: MATCH });
    };
    // The projector is still there: the page comes back as the console and feeds it at once.
    const host = fakeWin(), proj = fakeWin();
    proj.location.hash = '#projector';
    host.sessionStorage = flagged();
    host.open = function (url, name) { this.asked = [url, name]; return proj; };
    let c = bootWith(host);
    try {
      assert.deepEqual(host.asked, ['', 'dt-projector']);
      assert.equal(box.firstChild.getAttribute('data-layout'), 'console');
      assert.ok(proj.sent.some(m => m.type === 'state'));
    } finally { c.destroy(); DT.clock.reset(); }
    // It was closed meanwhile: the name opens a blank window, which is closed again at once.
    const blank = fakeWin();
    blank.close = function () { this.wasClosed = true; };
    host.open = () => blank;
    c = bootWith(host);
    try {
      assert.equal(blank.wasClosed, true);
      assert.equal(box.firstChild.hasAttribute('data-layout'), false);
    } finally { c.destroy(); DT.clock.reset(); }
    // No projector was open in this tab: nothing is looked for, so no blank window flashes up on a plain load.
    const quiet = fakeWin();
    let asked = 0;
    quiet.open = () => { asked++; return proj; };
    c = bootWith(quiet);
    try {
      assert.equal(asked, 0);
      assert.equal(box.firstChild.hasAttribute('data-layout'), false);
    } finally { c.destroy(); DT.clock.reset(); }
  });

  DT.test('sync: the projector route draws what the console sends and hides its hint after a key', () => {
    const box = document.getElementById('sandbox'); box.innerHTML = '<div></div>';
    const me = fakeWin(), opener = fakeWin();
    me.opener = opener;
    let now = T0;
    DT.clock.set(() => now);
    const c = DT.app.boot({ root: box.firstChild, route: 'projector', window: me, storage: memStorage(), bells: fakeBells() });
    try {
      const hint = box.querySelector('.dt-projector-hint');
      assert.equal(hint.textContent, '把这个窗口拖到投影屏幕上，按 F 全屏');
      assert.equal(hint.hidden, false);
      let s = DT.engine.createSession(freshman(), MATCH, T0);
      s = DT.engine.toggle(s, T0);
      me.emit('message', { data: { source: 'debate-timer', type: 'state', session: s, settings: {} } });
      assert.equal(c.route(), 'projector');
      assert.equal(c.session().cursor, 0);
      const stage = box.querySelector('.dt-stage');
      assert.equal(stage.getAttribute('data-mode'), 'stage');
      assert.equal(box.querySelector('.dt-title').textContent, '正方一辩开篇立论');
      now += 13000;
      assert.deepEqual(c.view().clocks.map(x => x.text), ['2:47']);
      me.emit('keydown', { code: 'Space', preventDefault() {} });
      assert.deepEqual(opener.sent.map(m => m.code), ['Space']);
      assert.equal(hint.hidden, true);
      me.emit('message', { data: { source: 'debate-timer', type: 'toast', message: '反方时间已用完' } });
      assert.equal(box.querySelector('.dt-toast').textContent, '反方时间已用完');
    } finally { c.destroy(); DT.clock.reset(); }
    assert.equal(box.querySelector('.dt-stage'), null);
  });

  DT.test('sync: a projector whose console was closed says how to reconnect', () => {
    const box = document.getElementById('sandbox'); box.innerHTML = '<div></div>';
    const me = fakeWin(), opener = fakeWin();
    me.opener = opener;
    DT.clock.set(() => T0);
    const c = DT.app.boot({ root: box.firstChild, route: 'projector', window: me, storage: memStorage(), bells: fakeBells() });
    try {
      opener.closed = true;
      let prevented = false;
      me.emit('keydown', { code: 'Space', preventDefault() { prevented = true; } });
      assert.equal(opener.sent.length, 0);
      assert.equal(prevented, false);
      assert.equal(box.querySelector('.dt-toast').textContent, '控制台已关闭。关掉这个窗口，在主窗口按 O 重新打开投影');
    } finally { c.destroy(); DT.clock.reset(); }
  });

  DT.test('sync: the projector starts from the saved session and rings a bell once', () => {
    const box = document.getElementById('sandbox'); box.innerHTML = '<div></div>';
    const storage = memStorage();
    let s = DT.engine.createSession(freshman(), MATCH, T0);
    s = DT.engine.goto(s, 1, T0);
    storage.setItem('dt.session.v1', JSON.stringify(s));
    DT.clock.set(() => T0);
    const me = fakeWin();
    const c = DT.app.boot({ root: box.firstChild, route: 'projector', window: me, storage, bells: fakeBells() });
    try {
      assert.equal(c.session().cursor, 1);
      assert.equal(box.querySelector('.dt-title').textContent, '反方四辩质询正方一辩');
      const warn = { type: 'warn', clock: 'main', key: 'w30', at: T0 };
      me.emit('message', { data: { source: 'debate-timer', type: 'events', events: [warn] } });
      me.emit('message', { data: { source: 'debate-timer', type: 'events', events: [Object.assign({}, warn)] } });
      assert.equal(box.querySelectorAll('.dt-ring').length, 1);
    } finally { c.destroy(); DT.clock.reset(); }
  });

  DT.test('sync: the console demo stops in the cross-examination with 1:12 left', () => {
    const box = document.getElementById('sandbox'); box.innerHTML = '<div></div>';
    const c = DT.app.boot({ root: box.firstChild, bells: fakeBells(), location: { search: '?demo=console&frozen=1', hash: '' } });
    try {
      const root = box.firstChild;
      assert.equal(root.getAttribute('data-layout'), 'console');
      const rows = root.querySelectorAll('.dt-console-list button[data-index]');
      assert.equal(rows[1].getAttribute('aria-current'), 'step');
      assert.equal(rows[1].querySelector('.dt-row-state').textContent, '● 1:12');
      assert.equal(rows[0].querySelector('.dt-row-state').textContent, '✓ 2:57');
      assert.equal(root.querySelector('.dt-console-note-text').textContent, '双边计时：问答共用这一个表');
      assert.equal(root.querySelector('.dt-preview .dt-title').textContent, '反方四辩质询正方一辩');
    } finally { c.destroy(); DT.clock.reset(); }
  });
  DT.test('sync: a projector opened from a match file follows that file\'s session, not the plain timer\'s', () => {
    const box = document.getElementById('sandbox'); box.innerHTML = '<div></div>';
    const storage = memStorage();
    const preset = DT.preset.make(freshman(), MATCH, 'hall', T0);
    storage.setItem('dt.session.v1', JSON.stringify(DT.engine.goto(DT.engine.createSession(freshman(), MATCH, T0), 4, T0)));
    storage.setItem('dt.m.' + preset.id + '.session.v1', JSON.stringify(DT.engine.goto(DT.engine.createSession(freshman(), MATCH, T0), 1, T0)));
    DT.clock.set(() => T0);
    const me = fakeWin();
    const c = DT.app.boot({ root: box.firstChild, route: 'projector', window: me, storage, bells: fakeBells(), preset });
    try {
      assert.equal(c.session().cursor, 1);
      me.emit('storage', { key: 'dt.session.v1', newValue: storage.getItem('dt.session.v1') });
      assert.equal(c.session().cursor, 1, 'a write by a plain timer in another tab is not this match');
      const later = DT.engine.goto(DT.engine.createSession(freshman(), MATCH, T0), 2, T0);
      me.emit('storage', { key: 'dt.m.' + preset.id + '.session.v1', newValue: JSON.stringify(later) });
      assert.equal(c.session().cursor, 2);
    } finally { c.destroy(); DT.clock.reset(); }
    assert.equal(DT.store.sessionKey(), 'dt.session.v1', 'destroy leaves the plain keys in use again');
  });
})();
