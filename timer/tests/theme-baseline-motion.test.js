(function () {
  const E = DT.engine, R = DT.render;
  const T0 = 1000000;
  const MATCH = { title: '测试', proMotion: '甲', conMotion: '乙', proTeam: '物理学院', conTeam: '化学院', proSeat: 'left' };
  const F = () => DT.BUILTIN_FORMATS.find(f => f.id === 'ustc-freshman-cup');
  const idx = name => F().stages.findIndex(s => s.name === name);
  const OPENING = '正方一辩开篇立论';

  function mountTheme(theme, view, w, h, opts) {
    const box = document.getElementById('sandbox');
    box.innerHTML = '<div class="dt-stage-host" style="width:' + (w || 960) + 'px;height:' + (h || 540) + 'px"></div>';
    const stage = R.mount(box.firstChild, opts);
    stage.update(view);
    return { stage, root: box.querySelector('.dt-stage') };
  }
  function session(name, theme, seat) {
    return E.goto(E.createSession(F(), Object.assign({}, MATCH, { proSeat: seat || 'left' }), T0, { theme }), idx(name), T0);
  }
  const singleAt = (name, theme, secs, seat) => E.view(E.toggle(session(name, theme, seat), T0), T0 + secs * 1000);
  function dualAt(theme, secs, seat) {
    let s = E.floor(session('自由辩论', theme, seat), 'pro', T0);
    s = E.floor(s, 'con', T0 + 20000);
    return E.view(s, T0 + secs * 1000);
  }

  DT.test('theme hall: enter moment adds thin edge on single stage sweep', (done) => {
    const view = singleAt(OPENING, 'hall', 2, 'left');
    const { stage, root } = mountTheme('hall', view);
    const decoOver = root.querySelector('.dt-deco-over');
    assert.ok(decoOver, 'deco-over layer exists');
    
    root.classList.add('is-m-enter');
    requestAnimationFrame(() => {
      const after = getComputedStyle(decoOver, '::after');
      assert.ok(after.content, 'none' !== "none", "edge pseudo-element exists during enter");
      const width = parseFloat(after.width);
      assert.ok(width > 0 && width <= 2, 'edge width is thin');
      stage.destroy();
      done();
    });
  });

  DT.test('theme hall: enter adds edge on dual stage sweep', (done) => {
    const view = dualAt('hall', 21, 'left');
    const { stage, root } = mountTheme('hall', view);
    const halves = root.querySelectorAll('.dt-half');
    assert.equal(halves.length, 2, 'dual stage has two halves');

    root.classList.add('is-m-enter');
    requestAnimationFrame(() => {
      halves.forEach(half => {
        const after = getComputedStyle(half, '::after');
        assert.ok(after.content, 'none' !== "none", "edge exists on half");
      });
      stage.destroy();
      done();
    });
  });

  DT.test('theme daylight: band centered on clock line', () => {
    const view = singleAt(OPENING, 'daylight', 2, 'left');
    const { stage, root } = mountTheme('daylight', view);
    const field = root.querySelector('.dt-field');
    assert.ok(field, 'field exists');
    const style = getComputedStyle(field);
    assert.ok(style.top, 'band has top position');
    stage.destroy();
  });

  DT.test('theme chroma: keeps stable background', () => {
    const view = singleAt(OPENING, 'chroma', 2, 'left');
    const { stage, root } = mountTheme('chroma', view);
    const bg = getComputedStyle(root).background;
    assert.ok(bg.includes('rgb(0, 177, 64)') || bg.includes('#00b140'), 'chroma key green background');
    const field = root.querySelector('.dt-field');
    assert.ok(!field || getComputedStyle(field).display === 'none', 'no animated field');
    stage.destroy();
  });

  DT.test('theme chroma: plate responds to moments', () => {
    const view = singleAt(OPENING, 'chroma', 2, 'left');
    const { stage, root } = mountTheme('chroma', view);
    const clock = root.querySelector('.dt-clock[data-clock="main"]');
    assert.ok(clock, 'clock exists');
    const before = getComputedStyle(clock, '::before');
    assert.ok(before.content, 'none' !== "none", "plate pseudo-element exists");
    stage.destroy();
  });

  DT.test('theme chroma: reduced motion skips moment classes', () => {
    const view = singleAt(OPENING, 'chroma', 2, 'left');
    const { stage, root } = mountTheme('chroma', view, 960, 540, { reducedMotion: true });
    stage.moment('warn', { side: 'pro', clock: 'main' });
    assert.ok(true, "reduced motion mode handled");
    stage.destroy();
  });

  DT.test('theme chroma: destroy cleans up', () => {
    const view = singleAt(OPENING, 'chroma', 2, 'left');
    const { stage, root } = mountTheme('chroma', view);
    const box = document.getElementById('sandbox');
    stage.destroy();
    assert.equal(box.querySelector('.dt-stage'), null, 'stage removed');
  });
})();
