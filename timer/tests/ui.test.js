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

  DT.test('ui: space on the title card starts the first stage, and pauses it', () => {
    const t = boot();
    press('Space');
    assert.equal(t.c.session().cursor, 0);
    assert.ok(DT.engine.getRun(t.c.session()).running);
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

  // The console beside a projector window, opened with O in a stand-in window.
  function bootDesk() {
    const proj = { closed: false, postMessage() {} };
    const host = { location: { href: 'file:///C:/x/debate-timer.html' }, addEventListener() {}, removeEventListener() {},
      open: () => proj };
    const t = boot({ window: host });
    press('KeyO');
    return t;
  }

  // P1: a focused range input must not swallow timer keys
  DT.test('ui: keys still work while the volume slider has focus', () => {
    const t = bootDesk();
    press('Space');                                     // title card → stage 1, running (new behaviour)
    const slider = document.querySelector('input[type="range"][name="volume"]');
    assert.ok(slider, 'the console shows the volume slider');
    assert.equal(slider.closest('label'), null, 'no label hands a click on 音量 to the slider');
    assert.equal(slider.getAttribute('aria-label'), '音量');
    slider.focus();
    const ev = new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true, cancelable: true });
    slider.dispatchEvent(ev);
    assert.ok(ev.defaultPrevented);
    assert.equal(DT.engine.getRun(t.c.session()).running, false);
    t.done();
  });

  // P2: mouse clicks in the stage list and overlays leave no focus behind
  DT.test('ui: clicking a stage-list row does not keep focus', () => {
    const t = boot();
    press('KeyS');
    const row = document.querySelector('.dt-overlay[data-name="stages"] button');
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    row.dispatchEvent(down);
    assert.ok(down.defaultPrevented);
    t.done();
  });

  DT.test('ui: clicking a row of the console\'s stage list does not keep focus', () => {
    const t = bootDesk();
    const row = document.querySelector('.dt-console-list button[data-index="2"]');
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    row.dispatchEvent(down);
    assert.ok(down.defaultPrevented);
    t.done();
  });

  // Some presenters and on-screen keyboards send no scan code.
  DT.test('ui: a key without a code falls back to its key', () => {
    const t = boot();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: '', key: 'ArrowRight', bubbles: true, cancelable: true }));
    assert.equal(t.c.session().cursor, 0);
    t.done();
  });

  // P3: the editor's close animation must not eat the keys pressed during it.
  DT.test('ui: a key pressed while the editor sinks away reaches the timer, once', async () => {
    const t = boot();
    const realMatch = window.matchMedia;
    // Not reduced motion, so the editor takes its 260 ms to close.
    window.matchMedia = q => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    try {
      press('Space');                                   // stage 1 is running
      press('KeyE');
      const history = t.c.session().history.length;
      press('Escape');
      assert.ok(document.querySelector('.dt-editor'), 'the editor is still sinking away');
      const root = document.getElementById('app-under-test');
      assert.ok(Array.from(root.children).every(c => c.classList.contains('dt-editor') || !c.inert), 'the page behind is live again');
      press('Space');
      assert.equal(DT.engine.getRun(t.c.session()).running, false, 'the space paused the clock');
      await new Promise(r => setTimeout(r, 400));
      assert.equal(document.querySelector('.dt-editor'), null);
      assert.equal(t.c.session().history.length, history + 1, 'exactly one toggle');
      assert.equal(DT.engine.getRun(t.c.session()).running, false);
    } finally {
      window.matchMedia = realMatch;
      t.done();
    }
  });

  // ---- reset any stage, exit from any screen (2026-10-03 spec §2) ----

  // The app as it opens for real: the setup page first, a match started from it.
  function bootSetup(storage) {
    const t = boot({ storage, route: undefined, location: { search: '', hash: '' }, preset: null });
    const box = document.getElementById('sandbox');
    assert.equal(t.c.route(), 'setup');
    box.querySelector('[data-format-id="ustc-freshman-cup"]').click();
    box.querySelector('button[data-action="start"]').click();
    assert.equal(t.c.route(), 'timer');
    return Object.assign(t, { box });
  }
  const savedRun = storage => {
    const s = JSON.parse(storage.getItem('dt.session.v1'));
    return s.runs[s.timeline[s.cursor].id];
  };
  const dockBtn = act => document.querySelector('.dt-dock button[data-act="' + act + '"]');

  DT.test('ui: Q twice exits to the setup page and keeps the match', () => {
    const storage = memStorage();
    const t = bootSetup(storage);
    try {
      press('Space');
      t.clock.advance(5000);
      press('KeyQ');
      assert.equal(toastText(), '再按一次 Q 退出到开赛页，这一场会保留');
      assert.equal(t.c.route(), 'timer');
      press('KeyQ');
      assert.equal(t.c.route(), 'setup');
      const banner = t.box.querySelector('.dt-setup-resume');
      assert.ok(banner && banner.textContent.indexOf('这一场暂停了：中国科学技术大学新生辩论赛，停在第 1 个环节（正方一辩开篇立论）。') >= 0,
        'the resume banner is shown, saying the match was paused here: ' + (banner && banner.textContent));
      assert.equal(savedRun(storage).running, false);
      assert.equal(savedRun(storage).clocks.main.used, 5000);
    } finally { t.done(); }
  });

  DT.test('ui: exiting pauses the running clock', () => {
    const storage = memStorage();
    const t = bootSetup(storage);
    try {
      press('Space');
      t.clock.advance(10000);
      press('KeyQ'); press('KeyQ');
      t.clock.advance(120000);
      t.box.querySelector('button[data-action="resume"]').click();
      assert.equal(t.c.route(), 'timer');
      assert.equal(t.c.session().cursor, 0, 'back on the stage it left');
      assert.equal(left(t), 180000 - 10000, 'the two minutes on the setup page are not charged');
      assert.equal(run(t).running, false);
    } finally { t.done(); }
  });

  DT.test('ui: a double-click does not confirm exit', () => {
    const t = bootSetup(memStorage());
    try {
      press('Space');
      const exit = dockBtn('exit');
      assert.equal(exit.querySelector('.dt-arm-rest').textContent, '退出Q Q');
      exit.click();
      assert.ok(exit.hasAttribute('data-armed'));
      assert.equal(exit.querySelector('.dt-arm-ask').textContent, '再点一次退出');
      t.clock.advance(100); exit.click();
      assert.equal(t.c.route(), 'timer', 'two clicks 100 ms apart are one double-click');
      t.clock.advance(400); exit.click();
      assert.equal(t.c.route(), 'setup');
    } finally { t.done(); }
  });

  DT.test('ui: the dock exit button disarms after 1.5 s or a click elsewhere', () => {
    const t = bootSetup(memStorage());
    try {
      const exit = dockBtn('exit');
      exit.click();
      t.clock.advance(1600); exit.click();
      assert.equal(t.c.route(), 'timer', 'too late: this click arms it again');
      assert.ok(exit.hasAttribute('data-armed'));
      dockBtn('stages').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      assert.equal(exit.hasAttribute('data-armed'), false);
      assert.equal(getComputedStyle(exit.querySelector('.dt-arm-rest')).visibility, 'visible', '退出 again');
      t.clock.advance(300); exit.click();
      assert.equal(t.c.route(), 'timer');
    } finally { t.done(); }
  });

  DT.test('ui: the dock reset button resets the current stage after two clicks', () => {
    const t = bootSetup(memStorage());
    try {
      const reset = dockBtn('reset');
      assert.equal(reset.disabled, true, 'nothing to reset on the title card');
      press('Space'); t.clock.advance(20000); press('Space');
      assert.equal(reset.disabled, false);
      reset.click(); t.clock.advance(300); reset.click();
      assert.equal(left(t), 180000);
      assert.equal(t.c.session().cursor, 0);
    } finally { t.done(); }
  });

  DT.test('ui: a stage-list row resets that stage after two clicks', () => {
    const t = bootSetup(memStorage());
    try {
      press('Space'); t.clock.advance(20000);
      press('ArrowRight');
      assert.equal(t.c.session().cursor, 1);
      press('KeyS');
      const list = document.querySelector('.dt-overlay[data-name="stages"]');
      const btn = list.querySelector('button[aria-label="重置第 1 个环节"]');
      assert.ok(btn, 'the used stage offers a reset');
      assert.equal(btn.hidden, false);
      assert.equal(list.querySelector('button[aria-label="重置第 3 个环节"]').hidden, true, 'an unused one does not');
      btn.click();
      assert.equal(btn.querySelector('.dt-row-reset-label').textContent, '再点一次重置　✓ 0:20', 'what it throws away');
      assert.equal(t.c.session().cursor, 1, 'one click does nothing yet');
      assert.ok(t.c.session().runs[t.c.session().timeline[0].id]);
      t.clock.advance(300); btn.click();
      const s = t.c.session();
      assert.equal(s.runs[s.timeline[0].id], undefined, 'stage 1 is fresh');
      assert.equal(s.cursor, 1, 'the cursor stays');
      assert.equal(btn.hidden, true);
      press('KeyZ');
      assert.equal(DT.engine.remaining(DT.engine.getRun(t.c.session(), t.c.session().timeline[0].id), 'main', DT.clock.now()), 160000);
    } finally { t.done(); }
  });

  // 2026-10-03 final review: the armed state names its action, keeps its footprint, and takes a fresh press.
  DT.test('ui: arming 重置 or 退出 names the action and moves nothing in the dock', () => {
    const t = bootSetup(memStorage());
    try {
      press('Space'); t.clock.advance(5000); press('Space');
      const dock = document.querySelector('.dt-dock');
      [['reset', '再点一次重置'], ['exit', '再点一次退出']].forEach(([act, words]) => {
        const b = dockBtn(act);
        const before = [b.getBoundingClientRect().width, dock.getBoundingClientRect().width];
        b.click();
        assert.ok(b.hasAttribute('data-armed'), act);
        assert.equal(b.querySelector('.dt-arm-ask').textContent, words);
        assert.equal(getComputedStyle(b.querySelector('.dt-arm-ask')).visibility, 'visible', act + ': the words show');
        assert.equal(getComputedStyle(b.querySelector('.dt-arm-rest')).visibility, 'hidden', act + ': in place of the rest');
        const after = [b.getBoundingClientRect().width, dock.getBoundingClientRect().width];
        assert.near(after[0], before[0], 0.5, act + ': the button keeps its width');
        assert.near(after[1], before[1], 0.5, act + ': so does the dock');
        document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      });
    } finally { t.done(); }
  });

  DT.test('ui: an armed button gives up when the mouse leaves it', () => {
    const t = bootSetup(memStorage());
    try {
      const exit = dockBtn('exit');
      exit.click();
      assert.ok(exit.hasAttribute('data-armed'));
      exit.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
      assert.equal(exit.hasAttribute('data-armed'), false);
      t.clock.advance(300); exit.click();
      assert.equal(t.c.route(), 'timer', 'the click after coming back arms it again');
      assert.ok(exit.hasAttribute('data-armed'));
    } finally { t.done(); }
  });

  // A tap ends with pointerleave right after pointerup: that must not disarm, or a touchscreen cannot confirm.
  DT.test('ui: two taps on a touchscreen confirm 退出 and 重置', () => {
    const t = bootSetup(memStorage());
    const tap = b => {
      const o = { pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true };
      b.dispatchEvent(new PointerEvent('pointerdown', o));
      b.dispatchEvent(new PointerEvent('pointerup', o));
      b.dispatchEvent(new PointerEvent('pointerout', o));
      b.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'touch', isPrimary: true }));
      b.click();
    };
    try {
      press('Space'); t.clock.advance(5000); press('Space');
      const left = () => DT.engine.remaining(DT.engine.getRun(t.c.session()), 'main', DT.clock.now());
      assert.equal(left(), 175000);
      const reset = dockBtn('reset');
      tap(reset);
      assert.ok(reset.hasAttribute('data-armed'), 'the first tap arms 重置');
      assert.equal(left(), 175000, 'one tap does nothing yet');
      t.clock.advance(300); tap(reset);
      assert.equal(reset.hasAttribute('data-armed'), false);
      assert.equal(left(), 180000, 'the second tap resets');
      const exit = dockBtn('exit');
      tap(exit);
      assert.ok(exit.hasAttribute('data-armed'), 'the first tap arms 退出');
      t.clock.advance(300); tap(exit);
      assert.equal(t.c.route(), 'setup', 'the second tap exits');
    } finally { t.done(); }
  });

  DT.test('ui: a held Enter or Space cannot confirm an armed button', () => {
    const t = bootSetup(memStorage());
    try {
      const exit = dockBtn('exit');
      const down = (key, repeat) => {
        const e = new KeyboardEvent('keydown', { key, code: key === ' ' ? 'Space' : key, repeat, bubbles: true, cancelable: true });
        exit.dispatchEvent(e);
        return e.defaultPrevented;
      };
      assert.equal(down('Enter', true), true, 'a repeat of Enter does not click');
      assert.equal(down(' ', true), true, 'nor one of Space');
    } finally { t.done(); }
  });

  DT.test('ui: arming a row\'s ↺ leaves the row where it was', () => {
    const t = bootSetup(memStorage());
    try {
      press('Space'); t.clock.advance(20000); press('ArrowRight');
      press('KeyS');
      const list = document.querySelector('.dt-overlay[data-name="stages"]');
      const btn = list.querySelector('button[aria-label="重置第 1 个环节"]');
      const row = btn.parentNode.querySelector('.dt-row');
      const next = list.querySelectorAll('.dt-row')[1];
      const box = e => { const r = e.getBoundingClientRect(); return [r.top, r.width, r.height]; };
      const before = [box(row), box(next)];
      btn.click();
      assert.ok(btn.hasAttribute('data-armed'));
      const after = [box(row), box(next)];
      [0, 1].forEach(i => [0, 1, 2].forEach(k => assert.near(after[i][k], before[i][k], 0.5, 'row ' + i + ' part ' + k)));
    } finally { t.done(); }
  });

  DT.test('ui: the title card and the end card can exit too', () => {
    const storage = memStorage();
    const t = bootSetup(storage);
    try {
      press('KeyQ'); press('KeyQ');
      assert.equal(t.c.route(), 'setup');
      assert.ok(t.box.textContent.indexOf('还没开始第一个环节') >= 0);
      t.box.querySelector('button[data-action="resume"]').click();
      t.c.act('goto', 0); press('Space'); t.clock.advance(9000); press('Space');
      t.c.act('goto', t.c.session().timeline.length);
      press('KeyQ'); press('KeyQ');
      assert.equal(t.c.route(), 'setup');
      const banner = t.box.querySelector('.dt-setup-resume');
      assert.ok(banner, 'the end card can be gone back to (2026-10-03 spec §5.3)');
      assert.ok(banner.textContent.indexOf('这一场已经打完：中国科学技术大学新生辩论赛，停在结束卡。') >= 0, banner.textContent);
      banner.querySelector('button[data-action="resume"]').click();
      assert.equal(t.c.route(), 'timer');
      assert.equal(t.c.view().mode, 'end');
      assert.equal(t.c.view().record[0].used, 9000, 'with its record');
      assert.equal('exited' in JSON.parse(storage.getItem('dt.session.v1')), false, 'back in the match, it is no longer away');
      press('ArrowLeft');
      assert.equal(t.c.session().cursor, t.c.session().timeline.length - 1, 'and the last stage is one ← away');
    } finally { t.done(); }
  });

  DT.test('ui: a match that ended without 退出 is not offered again', () => {
    const storage = memStorage();
    const t = bootSetup(storage);
    try {
      t.c.act('goto', t.c.session().timeline.length);
      t.done();
      const again = boot({ storage, route: undefined, location: { search: '', hash: '' }, preset: null });
      assert.equal(again.c.route(), 'setup');
      assert.equal(document.querySelector('.dt-setup-resume'), null);
      again.done();
    } finally { DT.clock.reset(); }
  });

  DT.test('ui: after 退出 the setup page leads with 继续, and 开始这一场 steps back', () => {
    const t = bootSetup(memStorage());
    try {
      const start = () => t.box.querySelector('button[data-action="start"]');
      press('Space');
      press('KeyQ'); press('KeyQ');
      assert.equal(t.c.route(), 'setup');
      assert.ok(t.box.querySelector('.dt-setup-resume button[data-action="resume"][data-primary]'));
      assert.equal(start().hasAttribute('data-primary'), false, 'one strong button on the page');
      t.box.querySelector('button[data-action="discard"]').click();
      assert.ok(start().hasAttribute('data-primary'), 'with nothing to resume, 开始这一场 leads again');
    } finally { t.done(); }
  });

  DT.test('ui: a match file exits to its ask page, and 继续上次 goes on where it left', () => {
    let now = T0; DT.clock.set(() => now);
    const preset = DT.preset.make(DT.BUILTIN_FORMATS[0], PRESET_MATCH, 'hall', T0);
    const t = bootPreset(memStorage(), preset);
    try {
      press('Space'); press('ArrowRight'); press('Space');
      now += 7000;
      press('KeyQ'); press('KeyQ');
      assert.equal(t.c.route(), 'ask');
      assert.ok(t.box.textContent.indexOf('停在第 2 个环节') >= 0);
      now += 60000;
      t.box.querySelector('button[data-action="resume"]').click();
      assert.equal(t.c.session().cursor, 1);
      assert.equal(DT.engine.remaining(run(t), 'main', now), DT.engine.currentStage(t.c.session()).secs * 1000 - 7000);
    } finally { t.done(); }
  });

  DT.test('ui: a match file exits to its ask page from its title card and its end card too', () => {
    let now = T0; DT.clock.set(() => now);
    const preset = DT.preset.make(DT.BUILTIN_FORMATS[0], PRESET_MATCH, 'hall', T0);
    const t = bootPreset(memStorage(), preset);
    try {
      assert.equal(t.c.session().cursor, -1);
      press('KeyQ'); press('KeyQ');
      assert.equal(t.c.route(), 'ask', 'not the plain setup page with another format chosen');
      t.box.querySelector('button[data-action="resume"]').click();
      assert.equal(t.c.session().cursor, -1);
      t.c.act('goto', t.c.session().timeline.length);
      press('KeyQ'); press('KeyQ');
      assert.equal(t.c.route(), 'ask');
      assert.ok(t.box.textContent.indexOf('停在结束卡') >= 0, t.box.textContent);
      t.box.querySelector('button[data-action="resume"]').click();
      assert.equal(t.c.view().mode, 'end');
    } finally { t.done(); }
  });

  // 2026-10-03 final review: at 1366x768 the last rows (O, F, M, H, Esc) fell below the panel's fold.
  DT.test('ui: the help shows every key without scrolling at 1366x768', () => {
    const box = document.getElementById('sandbox');
    box.innerHTML = '<div style="width:1366px;height:768px;position:relative"></div>';
    const c = DT.app.boot({ root: box.firstChild, location: { search: '?demo=help&frozen=1', hash: '' } });
    try {
      const panel = box.querySelector('.dt-overlay[data-name="help"] .dt-panel-body');
      assert.ok(panel, 'the help demo opens the help');
      assert.equal(panel.querySelectorAll('.dt-keys tr').length, 23);
      assert.ok(panel.scrollHeight <= panel.clientHeight + 1, panel.scrollHeight + ' > ' + panel.clientHeight);
      const esc = Array.from(panel.querySelectorAll('.dt-keys th')).find(th => th.textContent === 'Esc');
      const r = esc.getBoundingClientRect(), p = panel.getBoundingClientRect();
      assert.ok(r.bottom <= p.bottom + 1, 'Esc is in view');
    } finally { c.destroy(); DT.clock.reset(); }
  });

  DT.test('ui: the help lists Q Q', () => {
    const t = boot();
    press('KeyH');
    const keys = Array.from(document.querySelectorAll('.dt-keys th')).map(th => th.textContent);
    assert.ok(keys.indexOf('Q Q') >= 0, keys.join(','));
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
    press('Space'); t.clock.advance(20000); press('Space');
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
    press('Space');
    t.clock.advance(30000);
    press('ArrowUp'); press('ArrowUp', { shiftKey: true });
    assert.equal(DT.engine.remaining(DT.engine.getRun(t.c.session()), 'main', DT.clock.now()), 156000);
    t.done();
  });

  DT.test('ui: every action saves the session and reschedules bells', () => {
    const t = boot();
    press('Space');
    assert.ok(t.storage.getItem('dt.session.v1'));
    const last = t.bells.log.scheduled[t.bells.log.scheduled.length - 1];
    assert.ok(last.some(b => b.sound === 'double'));
    assert.ok(t.bells.log.unlocked >= 1);
    t.done();
  });

  DT.test('ui: reload resumes the running clock', () => {
    const storage = memStorage();
    let t = boot({ storage });
    press('Space');
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
    const t = boot({ formatId: 'ustc-school-cup' });
    press('Space'); t.clock.advance(1000); press('Space');
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
    press('Space'); t.clock.advance(20000); press('Space');
    press('KeyR'); press('KeyB'); press('KeyR');
    assert.equal(DT.engine.remaining(DT.engine.getRun(t.c.session()), 'main', DT.clock.now()), 160000);
    t.done();
  });

  DT.test('ui: a held key does not repeat switching actions, but adjusting repeats', () => {
    const t = boot();
    press('ArrowRight'); press('Space', { repeat: true });
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
      press('Space'); t.clock.advance(185000); press('Space');
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
    const t = boot({ formatId: 'ustc-school-cup' });
    press('Space'); t.clock.advance(1000); press('Space');
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
    press('ArrowRight');
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
    t = boot({ storage, formatId: 'ustc-school-cup' });
    assert.equal(t.c.session().format.id, 'ustc-school-cup');
    t.done();
  });

  DT.test('ui: listeners hear changes and bell events; destroy stops the keys', () => {
    const t = boot();
    const changes = [], events = [];
    t.c.on('change', s => changes.push(s.cursor));
    t.c.on('events', list => list.forEach(e => events.push(e.key)));
    press('Space');
    t.clock.advance(150500);
    press('KeyP');
    assert.deepEqual(changes, [0, 0]);
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
    press('Space');
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
    press('Space'); t.clock.advance(5000);
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
    press('Space');
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

  // The late bell an undo rings belongs to the stage the undo goes back to: it rings after that stage is painted,
  // or the stage change would clear it at once. A projector window hears the same order (it pulses before it
  // updates, so a bell sent ahead of the state would go with the stage change there).
  DT.test('ui: undoing a mistaken next rings the late bell on the stage it goes back to', () => {
    const t = boot();
    press('Space');
    const first = DT.engine.currentStage(t.c.session());
    t.clock.advance(first.secs * 1000 - 33000);   // 0:33 left
    press('ArrowRight'); t.clock.advance(5000);   // the clock runs on through the mistake, past 0:30
    const heard = [];
    t.c.on('change', s => heard.push('change:' + s.cursor));
    t.c.on('events', list => list.forEach(e => heard.push(e.type)));
    press('KeyZ');
    try {
      const root = document.querySelector('.dt-stage');
      assert.equal(DT.engine.currentStage(t.c.session()).id, first.id, 'back on the first stage');
      assert.deepEqual(t.bells.log.played, ['ding']);
      assert.equal(root.querySelectorAll('.dt-clock[data-clock="main"] .dt-ring').length, 1, 'its ring');
      assert.equal(root.dataset.bell, 'warn');
      assert.deepEqual(heard, ['change:0', 'warn'], 'the stage goes out first, then its bell');
    } finally { t.done(); }
  });

  DT.test('ui: nothing can be inserted on the end card', () => {
    const t = boot({ formatId: 'ustc-school-cup' });
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
    press('Space'); t.clock.advance(30000);
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
      press('Space');
      t.clock.advance(5000);
      // The loop paints on the browser's own frames, which a loaded headless browser can hold back for a while:
      // wait for the paint itself (up to 3 s), not for a fixed number of frames.
      const sec = () => document.querySelector('.dt-clock[data-clock="main"] .dt-sec').textContent;
      const until = Date.now() + 3000;
      while (sec() !== '55' && Date.now() < until) await Promise.race([new Promise(r => requestAnimationFrame(r)), later(50)]);
      assert.equal(sec(), '55');
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
    press('Space');          // a plain match is running
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
    press('Space');   // the first stage is running
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
    press('Space'); press('ArrowLeft');
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
      press('Space'); press('ArrowLeft');
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

  // A save that fails says so, rather than 已导出.
  DT.test('ui: 导出这一场 says when the file could not be saved', () => {
    const built = '<html lang="zh-CN"><head><title>辩论计时器</title><style id="dt-style">b{}</style></head><body data-dt-autoboot>' +
      '<div id="app"></div><script id="dt-main">window.__x = 1;</script></body></html>';
    const realSave = DT.store.saveFile, warn = console.warn;
    DT.preset.captureSource(new DOMParser().parseFromString(built, 'text/html'));
    DT.store.saveFile = () => { throw new Error('blocked'); };
    console.warn = () => {};
    const t = bootPreset(memStorage(), null);
    try {
      t.box.querySelector('[data-format-id="ustc-freshman-cup"]').click();
      t.box.querySelector('button[data-action="export"]').click();
      const notice = t.box.querySelector('.dt-setup-notice').textContent;
      assert.ok(notice.indexOf('已导出') < 0, 'no success message: ' + notice);
      assert.ok(notice.indexOf('没能导出') >= 0, notice);
      assert.equal(t.c.route(), 'setup');
    } finally {
      t.done();
      DT.store.saveFile = realSave;
      console.warn = warn;
      DT.preset.captureSource(document);
    }
  });

  DT.test('ui: 导出这一场 saves a page that opens on the chosen match, and says so', () => {
    const built = '<html lang="zh-CN"><head><title>辩论计时器</title><style id="dt-style">b{}</style></head><body data-dt-autoboot>' +
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
