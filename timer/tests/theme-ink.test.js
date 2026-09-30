(function () {
  const E = DT.engine, R = DT.render;
  const T0 = 1000000;
  const MATCH = { title: '测试', proMotion: '甲', conMotion: '乙', proTeam: '物理学院', conTeam: '化学院', proSeat: 'left' };
  const F = () => DT.BUILTIN_FORMATS.find(f => f.id === 'ustc-freshman-cup');
  const idx = name => F().stages.findIndex(s => s.name === name);
  const OPENING = '正方一辩开篇立论';   // pro, 3:00
  const REBUTTAL = '反方二辩驳论';

  function mountInk(view, w, h) {
    const box = document.getElementById('sandbox');
    box.innerHTML = '<div class="dt-stage-host" style="width:' + (w || 960) + 'px;height:' + (h || 540) + 'px"></div>';
    const stage = R.mount(box.firstChild);
    stage.update(view);
    return { stage, root: box.querySelector('.dt-stage') };
  }
  function session(name, seat) {
    return E.goto(E.createSession(F(), Object.assign({}, MATCH, { proSeat: seat || 'left' }), T0, { theme: 'ink' }), idx(name), T0);
  }
  // A single stage running for `secs` seconds.
  const singleAt = (name, secs, seat) => E.view(E.toggle(session(name, seat), T0), T0 + secs * 1000);
  // The free debate: pro speaks first, con takes the floor at 20 s, the view at `secs`.
  function dualAt(secs, seat) {
    let s = E.floor(session('自由辩论', seat), 'pro', T0);
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
  // Any CSS colour (color-mix gives oklab) as the sRGB a canvas paints for it.
  const mixer = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  function srgb(css) {
    mixer.clearRect(0, 0, 1, 1);
    mixer.fillStyle = css; mixer.fillRect(0, 0, 1, 1);
    const d = mixer.getImageData(0, 0, 1, 1).data;
    return 'rgb(' + d[0] + ', ' + d[1] + ', ' + d[2] + ')';
  }
  function lum(css) {
    const m = srgb(css).match(/rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/);
    const [r, g, b] = [m[1], m[2], m[3]].map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function contrast(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  const pseudo = (el, which) => getComputedStyle(el, which);
  const px = s => parseFloat(s);

  DT.test('theme ink: 墨 is a light theme registered with SVG defs and no painter', () => {
    const meta = (DT.THEMES || []).find(t => t.id === 'ink');
    assert.ok(meta, 'ink is in DT.THEMES');
    assert.equal(meta.name, '墨');
    assert.equal(meta.tone, 'light');
    const spec = DT.themes.get('ink');
    assert.ok(spec, 'ink is registered');
    assert.ok(typeof spec.defs === 'string' && spec.defs.indexOf('<filter') >= 0, 'defs carry the brush filters');
    assert.equal(spec.painter, undefined);
  });

  DT.test('theme ink: the defs go into the document once, every id prefixed dt-ink-', () => {
    const a = mountInk(singleAt(OPENING, 60));
    const b = R.mount(document.getElementById('sandbox').appendChild(document.createElement('div')));
    b.update(singleAt(OPENING, 60));
    const boxes = document.querySelectorAll('[data-dt-defs="ink"]');
    assert.equal(boxes.length, 1);
    const ids = Array.from(boxes[0].querySelectorAll('[id]')).map(n => n.id);
    assert.ok(ids.length >= 3, ids.join(','));
    ids.forEach(id => assert.ok(id.indexOf('dt-ink-') === 0, id));
    // Every filter the stroke refers to is one of them.
    const refs = getComputedStyle(a.root.querySelector('.dt-field')).filter.match(/#dt-ink-[\w-]+/g) || [];
    assert.ok(refs.length >= 1, 'the field uses a brush filter');
    refs.forEach(r => assert.ok(ids.indexOf(r.slice(1)) >= 0, r));
    a.stage.destroy(); b.destroy();
  });

  // Spec §2.1: a wide stroke of about 44vh across the screen, its edges bled and dry-brushed by the filter.
  DT.test('theme ink: the field is one wide brush stroke across the screen, clear of the head', () => {
    const { stage, root } = mountInk(singleAt(OPENING, 60));
    root.classList.remove('is-entering');   // measure the stroke at rest, not its entrance sweep
    const box = root.getBoundingClientRect();
    const field = root.querySelector('.dt-field');
    const f = field.getBoundingClientRect();
    assert.ok(f.left <= box.left && f.right >= box.right, 'it runs off both edges of the screen');
    assert.ok(f.height >= 0.42 * box.height && f.height <= 0.5 * box.height, 'about 44% of the height: ' + f.height);
    assert.ok(f.top > root.querySelector('.dt-head').getBoundingClientRect().bottom, 'below the stage name and speaker');
    assert.ok(/url\("?#dt-ink-brush/.test(getComputedStyle(field).filter), getComputedStyle(field).filter);
    assert.ok(['none', 'inset(0px)'].indexOf(getComputedStyle(field).clipPath) >= 0, 'the tip is the filtered stroke, not a straight cut: ' + getComputedStyle(field).clipPath);
    stage.destroy();
  });

  // The stroke is painted as a background as long as the time left, from the speaking side's seat.
  DT.test('theme ink: the stroke draws back toward the speaking side\'s seat', () => {
    [[OPENING, 'left', 'left'], [OPENING, 'right', 'right'], [REBUTTAL, 'left', 'right'], [REBUTTAL, 'right', 'left']].forEach(([name, seat, from]) => {
      const { stage, root } = mountInk(singleAt(name, 60, seat));
      const field = root.querySelector('.dt-field');
      const used = parseFloat(root.style.getPropertyValue('--used'));
      const cs = getComputedStyle(field);
      const where = name + ' / ' + seat;
      assert.equal(cs.backgroundPositionX.split(',')[0].trim(), from === 'left' ? '0%' : '100%', where);
      // The stroke's end lands where the digits change colour: (1 - used) of the screen from the seat.
      const stroke = px(cs.backgroundSize.split(',')[0]);
      const fieldBox = field.getBoundingClientRect(), stageBox = root.getBoundingClientRect();
      const offscreen = from === 'left' ? stageBox.left - fieldBox.left : fieldBox.right - stageBox.right;
      assert.near(stroke - offscreen, (1 - used) * stageBox.width, 1.5, where);
      stage.destroy();
    });
  });

  DT.test('theme ink: the brush filter follows the stage size, so a thumbnail keeps its proportions', () => {
    const big = mountInk(singleAt(OPENING, 60), 1920, 1080);
    const bigFilter = getComputedStyle(big.root.querySelector('.dt-field')).filter;
    big.stage.destroy();
    const small = mountInk(singleAt(OPENING, 60), 240, 135);
    const smallFilter = getComputedStyle(small.root.querySelector('.dt-field')).filter;
    small.stage.destroy();
    assert.ok(bigFilter !== smallFilter, bigFilter + ' vs ' + smallFilter);
    assert.ok(/#dt-ink-brush/.test(smallFilter), smallFilter);
  });

  // Spec §2.1: the stage type is marked with a small 朱文 seal, in the app's own words for the types.
  DT.test('theme ink: a small seal names the stage type', () => {
    const cases = [[singleAt(OPENING, 60), '单方'], [dualAt(30), '双方'],
      [E.view(E.toggle(session('评委打分'), T0), T0 + 5000), '间隔']];
    cases.forEach(([view, word]) => {
      const { stage, root } = mountInk(view);
      const seal = pseudo(root.querySelector('.dt-head'), '::before');
      assert.equal(seal.content, '"' + word + '"', root.dataset.kind);
      assert.ok(seal.display !== 'none' && px(seal.width) > 0, root.dataset.kind + ' seal shows');
      stage.destroy();
    });
  });

  // Spec §2.1: the warn bell point is a drop of ink, not a line.
  DT.test('theme ink: the warn bell point is a drop of ink below the stroke', () => {
    const { stage, root } = mountInk(singleAt(OPENING, 60));
    const drop = root.querySelector('.dt-warnline');
    const cs = getComputedStyle(drop);
    assert.ok(!drop.hidden);
    assert.near(px(cs.width), px(cs.height), 1, 'round');
    assert.ok(px(cs.width) < 0.08 * root.getBoundingClientRect().height, 'a drop, not a bar: ' + cs.width);
    assert.equal(cs.backgroundColor, resolve(root, '--ink'));
    const d = drop.getBoundingClientRect(), f = root.querySelector('.dt-field').getBoundingClientRect();
    assert.ok(d.top >= f.bottom - 1, 'under the stroke, on the paper');
    // Its centre sits at the warn point, as the hairline did: 30 s of 3:00 from the seat.
    const box = root.getBoundingClientRect();
    assert.near((d.left + d.width / 2 - box.left) / box.width, 30 / 180, 0.01);
    stage.destroy();
  });

  // Spec §2.1: two strokes face each other, the speaking side's is the dense one; dimming the paper would grey it.
  DT.test('theme ink: in free debate the speaking side\'s stroke is dense and the other one pale', () => {
    const { stage, root } = mountInk(dualAt(30));
    const half = side => root.querySelector('.dt-half[data-side="' + side + '"]');
    const con = half('con'), pro = half('pro');
    assert.ok(con.hasAttribute('data-active'));
    assert.equal(getComputedStyle(pro).filter, 'none', 'the waiting half keeps its paper');
    const dense = resolve(con.querySelector('.dt-half-field'), '--ink-stroke');
    const pale = resolve(pro.querySelector('.dt-half-field'), '--ink-stroke');
    assert.equal(dense, resolve(con, '--con'), 'the speaking stroke is the full colour');
    assert.ok(lum(pale) > lum(resolve(pro, '--pro')) * 1.5, 'the waiting stroke is diluted: ' + pale);
    // The digits on each stroke stay readable.
    [[con, dense], [pro, pale]].forEach(([h, ground]) => {
      const digits = getComputedStyle(h.querySelector('.dt-digits-on')).color;
      assert.ok(contrast(digits, ground) >= 3, h.dataset.side + ' ' + digits + ' on ' + ground + ' ' + contrast(digits, ground).toFixed(2));
    });
    // Each stroke starts at its own seat, the outer edge of the screen.
    assert.equal(getComputedStyle(pro.querySelector('.dt-half-field')).backgroundPositionX.split(',')[0].trim(), '0%');
    assert.equal(getComputedStyle(con.querySelector('.dt-half-field')).backgroundPositionX.split(',')[0].trim(), '100%');
    stage.destroy();
  });

  DT.test('theme ink: seats swapped, the strokes still start from each side\'s own edge', () => {
    const { stage, root } = mountInk(dualAt(30, 'right'));
    const pos = side => getComputedStyle(root.querySelector('.dt-half[data-side="' + side + '"] .dt-half-field')).backgroundPositionX.split(',')[0].trim();
    assert.equal(pos('pro'), '100%');
    assert.equal(pos('con'), '0%');
    stage.destroy();
  });

  // Overtime: the stroke is gone; the digits keep full ink and a seal stamps 超时 beside them.
  DT.test('theme ink: overtime keeps the digits in ink and stamps a 超时 seal', () => {
    const calm = mountInk(singleAt(OPENING, 60));
    const none = pseudo(calm.root.querySelector('.dt-deco-over'), '::after');
    assert.ok(none.content === 'none' || none.display === 'none', 'no stamp before time is up');
    calm.stage.destroy();
    const { stage, root } = mountInk(singleAt(OPENING, 187));
    assert.equal(root.dataset.phase, 'over');
    const digits = getComputedStyle(root.querySelector('.dt-clock[data-clock="main"] .dt-digits')).color;
    assert.equal(digits, resolve(root, '--ink'));
    const stamp = pseudo(root.querySelector('.dt-deco-over'), '::after');
    assert.equal(stamp.content, '"超时"');
    assert.ok(stamp.display !== 'none');
    stage.destroy();
  });
})();
