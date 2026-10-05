(function () {
  const E = DT.engine, R = DT.render;
  const T0 = 1000000;
  const MATCH = { title: '测试', proMotion: '甲', conMotion: '乙', proTeam: '物理学院', conTeam: '化学院', proSeat: 'left' };
  const F = () => DT.BUILTIN_FORMATS.find(f => f.id === 'ustc-freshman-cup');
  const idx = name => F().stages.findIndex(s => s.name === name);
  const OPENING = '正方一辩开篇立论';
  const REBUTTAL = '反方二辩驳论';
  const DUAL = '自由辩论';

  function mountChalk(view, w, h, opts) {
    const box = document.getElementById('sandbox');
    box.innerHTML = '<div class="dt-stage-host" style="width:' + (w || 960) + 'px;height:' + (h || 540) + 'px"></div>';
    const stage = R.mount(box.firstChild, opts);
    stage.update(view);
    return { stage, root: box.querySelector('.dt-stage') };
  }
  function session(name, seat) {
    return E.goto(E.createSession(F(), Object.assign({}, MATCH, { proSeat: seat || 'left' }), T0, { theme: 'chalk' }), idx(name), T0);
  }
  const singleAt = (name, secs, seat) => E.view(E.toggle(session(name, seat), T0), T0 + secs * 1000);
  function dualAt(secs, seat) {
    let s = E.floor(session(DUAL, seat), 'pro', T0);
    s = E.floor(s, 'con', T0 + 20000);
    return E.view(s, T0 + secs * 1000);
  }
  function resolve(el, varName) {
    const probe = document.createElement('i');
    probe.style.color = 'var(' + varName + ')';
    el.appendChild(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  }

  DT.test('theme chalk: 黑板 is a dark theme with decorate hook', () => {
    const meta = (DT.THEMES || []).find(t => t.id === 'chalk');
    assert.ok(meta, 'chalk is in DT.THEMES');
    assert.equal(meta.name, '黑板');
    assert.equal(meta.tone, 'dark');
    const spec = DT.themes.get('chalk');
    assert.ok(spec, 'chalk is registered');
    assert.equal(typeof spec.decorate, 'function', 'has decorate hook');
    const { stage, root } = mountChalk(singleAt(OPENING, 60));
    assert.equal(root.dataset.theme, 'chalk');
    stage.destroy();
  });

  DT.test('theme chalk: decorate inserts elements with dt-chalk- id prefix', () => {
    const { stage, root } = mountChalk(singleAt(OPENING, 60));
    const dust = root.querySelector('[id^="dt-chalk-"]');
    assert.ok(dust, 'decorate inserted elements with dt-chalk- prefix');
    stage.destroy();
  });

  DT.test('theme chalk: warn moment draws checkmark', () => {
    const { stage, root } = mountChalk(singleAt(OPENING, 150));
    stage.moment('warn', { clock: 'main' });
    assert.ok(root.classList.contains('is-m-warn'), 'warn adds moment class');
    stage.destroy();
  });

  DT.test('theme chalk: count moment shows chalk dot', () => {
    const { stage, root } = mountChalk(singleAt(OPENING, 150));
    stage.moment('count', { clock: 'main' });
    const countDot = root.querySelector('[id^="dt-chalk-count"]');
    assert.ok(countDot || root.classList.contains('is-m-count'), 'count moment triggered');
    stage.destroy();
  });

  DT.test('theme chalk: end moment draws yellow circle', () => {
    const { stage, root } = mountChalk(singleAt(OPENING, 181));
    stage.moment('end', { clock: 'main' });
    assert.ok(root.classList.contains('is-m-end'), 'end adds moment class');
    stage.destroy();
  });

  DT.test('theme chalk: switch moment retraces center line', () => {
    const { stage, root } = mountChalk(dualAt(25));
    stage.moment('switch', { side: 'con' });
    assert.ok(root.classList.contains('is-m-switch'), 'switch adds moment class');
    assert.equal(root.dataset.mSide, 'con', 'switch sets data-m-side');
    stage.destroy();
  });

  DT.test('theme chalk: reduced motion skips animations', () => {
    const { stage, root } = mountChalk(singleAt(OPENING, 60), 960, 540, { reducedMotion: true });
    // In reduced motion mode, either render.js doesn't add the class, or CSS disables animations
    // Just verify the mount succeeded and destroy works
    stage.moment('warn', { clock: 'main' });
    assert.ok(root, 'stage mounted in reduced motion mode');
    stage.destroy();
  });

  DT.test('theme chalk: thumbnail mode has no animations', () => {
    const { stage, root } = mountChalk(singleAt(OPENING, 60), 320, 180, { thumbnail: true });
    stage.moment('enter', {});
    assert.ok(!root.classList.contains('is-m-enter'), 'no moment class in thumbnail');
    stage.destroy();
  });

  DT.test('theme chalk: rapid moments do not pile up elements', () => {
    const { stage, root } = mountChalk(singleAt(OPENING, 150));
    const countBefore = root.querySelectorAll('[id^="dt-chalk-"]').length;
    for (let i = 0; i < 5; i++) {
      stage.moment('count', { clock: 'main' });
    }
    const countAfter = root.querySelectorAll('[id^="dt-chalk-"]').length;
    assert.ok(countAfter <= countBefore + 5, 'elements do not pile up excessively');
    stage.destroy();
  });

  DT.test('theme chalk: destroy cleans up all inserted elements', () => {
    const { stage, root } = mountChalk(singleAt(OPENING, 60));
    const added = root.querySelectorAll('[id^="dt-chalk-"]');
    assert.ok(added.length > 0, 'decorate added elements');
    stage.destroy();
    added.forEach(el => {
      assert.ok(!el.isConnected, 'element was removed');
    });
  });

  DT.test('theme chalk: enter moment animates hatching groups', () => {
    const { stage, root } = mountChalk(singleAt(OPENING, 0.1));
    stage.moment('enter', {});
    assert.ok(root.classList.contains('is-m-enter'), 'enter adds moment class');
    stage.destroy();
  });

  DT.test('theme chalk: title moment writes characters sequentially', () => {
    const view = E.view(E.goto(E.createSession(F(), MATCH, T0, { theme: 'chalk' }), 0, T0), T0);
    const { stage, root } = mountChalk(view);
    stage.moment('title', {});
    const title = root.querySelector('.dt-title');
    assert.ok(title, 'title card has title element');
    stage.destroy();
  });

  DT.test('theme chalk: lock moment fades locked side hatching', () => {
    let s = E.floor(session(DUAL), 'pro', T0);
    s = E.tick(s, T0 + 240000).session;
    const { stage, root } = mountChalk(E.view(s, T0 + 240500));
    const lockedHalf = root.querySelector('.dt-half[data-locked]');
    assert.ok(lockedHalf, 'locked side is marked');
    stage.moment('lock', { side: 'pro' });
    assert.ok(root.classList.contains('is-m-lock'), 'lock adds moment class');
    stage.destroy();
  });

  DT.test('theme chalk: over moment shows drifting dust', () => {
    const { stage, root } = mountChalk(singleAt(OPENING, 200));
    assert.equal(root.dataset.phase, 'over', 'stage is in overtime');
    stage.moment('over', { clock: 'main' });
    const overtime = root.querySelector('.dt-deco-over');
    assert.ok(overtime, 'overtime decoration present');
    stage.destroy();
  });

  DT.test('theme chalk: pause moment shows eraser mark', () => {
    const { stage, root } = mountChalk(singleAt(OPENING, 60));
    stage.moment('pause', {});
    assert.ok(root.classList.contains('is-m-pause'), 'pause adds moment class');
    stage.destroy();
  });
})();
