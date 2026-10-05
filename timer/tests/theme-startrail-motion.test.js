(function () {
  const E = DT.engine, R = DT.render;
  const T0 = 1000000;
  const MATCH = { title: '测试', proMotion: '甲', conMotion: '乙', proTeam: '物理学院', conTeam: '化学院', proSeat: 'left' };
  const F = () => DT.BUILTIN_FORMATS.find(f => f.id === 'ustc-freshman-cup');
  const idx = name => F().stages.findIndex(s => s.name === name);
  const OPENING = '正方一辩开篇立论';
  const DUAL = '自由辩论';

  function mountSky(view, w, h, opts) {
    const box = document.getElementById('sandbox');
    box.innerHTML = '<div class="dt-stage-host" style="width:' + (w || 960) + 'px;height:' + (h || 540) + 'px"></div>';
    const stage = R.mount(box.firstChild, opts);
    stage.update(view);
    return { stage, root: box.querySelector('.dt-stage') };
  }
  function session(name, seat) {
    return E.goto(E.createSession(F(), Object.assign({}, MATCH, { proSeat: seat || 'left' }), T0, { theme: 'startrail' }), idx(name), T0);
  }
  const singleAt = (name, secs, seat) => E.view(E.toggle(session(name, seat), T0), T0 + secs * 1000);

  DT.test('theme startrail motion: decorate inserts elements with dt-startrail- prefix', () => {
    const { stage, root } = mountSky(singleAt(OPENING, 60));
    const added = root.querySelectorAll('[id^="dt-startrail-"]');
    assert.ok(added.length > 0, 'decorate added elements: ' + added.length);
    stage.destroy();
    const after = root.querySelectorAll('[id^="dt-startrail-"]');
    assert.equal(after.length, 0, 'destroy removed them');
  });
  DT.test('theme startrail motion: enter triggers shutter opening animation', () => {
    const { stage, root } = mountSky(singleAt(OPENING, 60));
    root.classList.remove('is-entering', 'is-m-enter');
    stage.moment('enter', {});
    assert.ok(root.classList.contains('is-m-enter'), 'enter moment class added');
    stage.destroy();
  });

  DT.test('theme startrail motion: pause dims the sky, start brightens it', () => {
    let now = T0 + 60000;
    DT.clock.set(() => now);
    try {
      const { stage, root } = mountSky(singleAt(OPENING, 60));
      root.classList.remove('is-entering', 'is-m-enter');
      stage.moment('pause', {});
      assert.ok(root.classList.contains('is-m-pause'), 'pause moment class added');
      stage.moment('start', {});
      assert.ok(root.classList.contains('is-m-start'), 'start moment class added');
      stage.destroy();
    } finally { DT.clock.reset(); }
  });

  DT.test('theme startrail motion: warn triggers meteor animation', () => {
    const { stage, root } = mountSky(singleAt(OPENING, 152));
    root.classList.remove('is-entering');
    stage.pulse({ type: 'warn', clock: 'main' });
    assert.ok(root.classList.contains('is-m-warn'), 'warn moment class added');
    const meteor = root.querySelector('.dt-ring');
    assert.ok(meteor, 'meteor element exists');
    assert.equal(getComputedStyle(meteor).animationName, 'dt-startrail-meteor');
    stage.destroy();
  });

  DT.test('theme startrail motion: count triggers star twinkle', () => {
    const { stage, root } = mountSky(singleAt(OPENING, 175));
    root.classList.remove('is-entering');
    stage.moment('count', { clock: 'main' });
    assert.ok(root.classList.contains('is-m-count'), 'count moment class added');
    stage.destroy();
  });

  DT.test('theme startrail motion: end triggers shutter closing', () => {
    const { stage, root } = mountSky(singleAt(OPENING, 180));
    root.classList.remove('is-entering');
    stage.moment('end', { clock: 'main' });
    assert.ok(root.classList.contains('is-m-end'), 'end moment class added');
    stage.destroy();
  });

  DT.test('theme startrail motion: over shows breathing glow animation', () => {
    const { stage, root } = mountSky(singleAt(OPENING, 200));
    root.classList.remove('is-entering');
    assert.equal(root.dataset.phase, 'over');
    stage.moment('over', { clock: 'main' });
    assert.ok(root.classList.contains('is-m-over'), 'over moment class added');
    stage.destroy();
  });

  DT.test('theme startrail motion: switch triggers colour temperature transition', () => {
    let s = E.floor(session(DUAL), 'pro', T0);
    s = E.floor(s, 'con', T0 + 20000);
    const { stage, root } = mountSky(E.view(s, T0 + 20000));
    root.classList.remove('is-entering');
    stage.moment('switch', { side: 'con' });
    assert.ok(root.classList.contains('is-m-switch'), 'switch moment class added');
    assert.equal(root.dataset.mSide, 'con');
    stage.destroy();
  });

  DT.test('theme startrail motion: lock greys out exhausted side trails', () => {
    const { stage, root } = mountSky(singleAt(OPENING, 200));
    root.classList.remove('is-entering');
    stage.moment('lock', { side: 'pro' });
    assert.ok(root.classList.contains('is-m-lock'), 'lock moment class added');
    stage.destroy();
  });

  DT.test('theme startrail motion: title shows slow ambient rotation', () => {
    const s = E.createSession(F(), Object.assign({}, MATCH, { proSeat: 'left' }), T0, { theme: 'startrail' });
    const view = E.view(s, T0);
    const { stage, root } = mountSky(view);
    root.classList.remove('is-entering');
    assert.equal(root.dataset.mode, 'title');
    stage.moment('title', {});
    assert.ok(root.classList.contains('is-m-title'), 'title moment class added');
    stage.destroy();
  });
  DT.test('theme startrail motion: reduced-motion skips animations and shows final state', () => {
    const { stage, root } = mountSky(singleAt(OPENING, 60), 960, 540);
    stage.moment('enter', {});
    assert.ok(root.classList.contains('is-m-enter'), 'enter moment class added');
    // The @media (prefers-reduced-motion) CSS rule disables animations, not the class
    stage.destroy();
  });

  DT.test('theme startrail motion: thumbnail skips moment animations', () => {
    const { stage, root } = mountSky(singleAt(OPENING, 60), 320, 180, { thumbnail: true });
    stage.moment('enter', {});
    assert.ok(!root.classList.contains('is-m-enter'), 'no moment class in thumbnail');
    stage.destroy();
  });

  DT.test('theme startrail motion: repeated moments do not pile up elements', () => {
    const { stage, root } = mountSky(singleAt(OPENING, 60));
    root.classList.remove('is-entering');
    const initial = root.querySelectorAll('[id^="dt-startrail-"]').length;
    for (let i = 0; i < 5; i++) stage.moment('warn', { clock: 'main' });
    const after = root.querySelectorAll('[id^="dt-startrail-"]').length;
    assert.equal(after, initial, 'element count unchanged: ' + initial + ' → ' + after);
    stage.destroy();
  });

  DT.test('theme startrail motion: destroy removes all decorate elements', () => {
    const { stage, root } = mountSky(singleAt(OPENING, 60));
    const before = root.querySelectorAll('[id^="dt-startrail-"]').length;
    assert.ok(before > 0, 'decorate added elements');
    stage.destroy();
    const after = document.querySelectorAll('[id^="dt-startrail-"]').length;
    assert.equal(after, 0, 'all elements removed');
  });
})();
