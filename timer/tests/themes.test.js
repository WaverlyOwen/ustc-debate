(function () {
  const E = DT.engine, R = DT.render;
  const T0 = 1000000;
  const MATCH = { title: '测试', proMotion: '甲', conMotion: '乙', proTeam: '', conTeam: '', proSeat: 'left' };
  const F = () => DT.BUILTIN_FORMATS.find(f => f.id === 'ustc-freshman-cup');
  const idx = name => F().stages.findIndex(s => s.name === name);
  function host() {
    const box = document.getElementById('sandbox');
    box.innerHTML = '<div class="dt-stage-host" style="width:960px;height:540px"></div>';
    return box.firstChild;
  }
  function viewAt(stageName, theme) {
    let s = E.goto(E.createSession(F(), MATCH, T0, { theme }), idx(stageName), T0);
    s = E.toggle(s, T0);
    return E.view(s, T0 + 60000);
  }
  function rgb(str) {
    const s = String(str).trim();
    let m = s.match(/^#([0-9a-f]{6})$/i);
    if (m) return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
    m = s.match(/^#([0-9a-f]{3})$/i);
    if (m) return m[1].split('').map(c => parseInt(c + c, 16));
    m = s.match(/rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/);
    if (m) return [m[1], m[2], m[3]].map(Number);
    throw new Error('cannot parse colour ' + s);
  }
  function lum(c) {
    const [r, g, b] = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function contrast(a, b) { const x = lum(rgb(a)), y = lum(rgb(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  // Resolve a custom property to a concrete colour by letting the browser compute it on a probe element.
  function resolve(root, varName) {
    const probe = document.createElement('i');
    probe.style.color = 'var(' + varName + ')';
    root.appendChild(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  }

  DT.test('themes: every theme in DT.THEMES has a name, a description and a tone', () => {
    assert.ok(DT.THEMES.length >= 3);
    DT.THEMES.forEach(t => {
      assert.ok(t.id && t.name && t.desc, JSON.stringify(t));
      assert.ok(t.tone === 'dark' || t.tone === 'light', t.id);
    });
  });

  DT.test('themes: digits and titles keep their contrast on every theme and side', () => {
    DT.THEMES.forEach(t => {
      ['正方一辩开篇立论', '反方一辩开篇立论'].forEach(stage => {
        const h = R.mount(host());
        h.update(viewAt(stage, t.id));
        const root = document.querySelector('.dt-stage');
        assert.equal(root.dataset.theme, t.id);
        const field = resolve(root, '--side-color'), deep = resolve(root, '--side-deep');
        const on = resolve(root, '--digits-on-field'), off = resolve(root, '--digits-off-field');
        const title = getComputedStyle(root.querySelector('.dt-title')).color;
        const where = t.id + ' / ' + stage;
        assert.ok(contrast(on, field) >= 3, where + ': digits on field ' + contrast(on, field).toFixed(2));
        assert.ok(contrast(off, deep) >= 3, where + ': digits off field ' + contrast(off, deep).toFixed(2));
        assert.ok(contrast(title, field) >= 4.5 || contrast(title, deep) >= 4.5, where + ': title');
        h.destroy();
      });
    });
  });

  DT.test('themes: register, get, ids and a deterministic rng', () => {
    DT.themes.register('zz-test', { defs: '<svg width="0" height="0"><defs><filter id="dt-zz-test-f"></filter></defs></svg>' });
    assert.ok(DT.themes.ids().indexOf('zz-test') >= 0);
    assert.ok(DT.themes.get('zz-test').defs);
    const a = DT.themes.rng('ink'), b = DT.themes.rng('ink'), c = DT.themes.rng('riso');
    const xs = [a(), a(), a()], ys = [b(), b(), b()];
    assert.deepEqual(xs, ys);
    assert.ok(xs.every(x => x >= 0 && x < 1));
    assert.ok(c() !== xs[0]);
  });

  DT.test('themes: defs are injected once per document', () => {
    DT.themes.register('zz-defs', { defs: '<svg width="0" height="0" data-probe="zz-defs"><defs><filter id="dt-zz-defs-f"></filter></defs></svg>' });
    const DTH = Array.isArray(DT.THEMES) ? DT.THEMES : [];
    const saved = DT.THEMES; DT.THEMES = DTH.concat([{ id: 'zz-defs', name: 'x', desc: 'x', tone: 'dark' }]);
    try {
      const h1 = R.mount(host()); h1.update(viewAt('正方一辩开篇立论', 'zz-defs'));
      const h2 = R.mount(document.getElementById('sandbox').appendChild(document.createElement('div')));
      h2.update(viewAt('正方一辩开篇立论', 'zz-defs'));
      assert.equal(document.querySelectorAll('[data-probe="zz-defs"]').length, 1);
      h1.destroy(); h2.destroy();
    } finally { DT.THEMES = saved; }
  });

  DT.test('themes: painter frames are throttled and skipped when hidden', () => {
    const calls = [];
    DT.themes.register('zz-paint', { painter: () => ({ frame: (v, now) => calls.push(now), resize() {}, destroy() { calls.push('destroyed'); } }) });
    const saved = DT.THEMES; DT.THEMES = (saved || []).concat([{ id: 'zz-paint', name: 'x', desc: 'x', tone: 'dark' }]);
    try {
      const h = R.mount(host());
      const v = viewAt('正方一辩开篇立论', 'zz-paint');
      let now = 5000; DT.clock.set(() => now);
      h.update(v);
      assert.ok(document.querySelector('.dt-canvas'));   // the renderer learns the theme from the first view
      now += 10; h.update(v); now += 10; h.update(v); now += 40; h.update(v);
      const frames = calls.filter(c => c !== 'destroyed');
      assert.equal(frames.length, 2, 'two frames 50 ms apart, the 10 ms ones skipped');
      h.update(Object.assign({}, v, { theme: 'hall' }));
      assert.equal(document.querySelector('.dt-canvas'), null);
      assert.ok(calls.indexOf('destroyed') >= 0);
      h.destroy();
    } finally { DT.THEMES = saved; DT.clock.reset(); }
  });

  DT.test('themes: thumbnail mode draws once and never animates', () => {
    let frames = 0;
    DT.themes.register('zz-thumb', { painter: () => ({ frame() { frames++; }, resize() {}, destroy() {} }) });
    const saved = DT.THEMES; DT.THEMES = (saved || []).concat([{ id: 'zz-thumb', name: 'x', desc: 'x', tone: 'dark' }]);
    try {
      const h = R.mount(host(), { thumbnail: true });
      const v = viewAt('正方一辩开篇立论', 'zz-thumb');
      let now = 0; DT.clock.set(() => now);
      h.update(v); now += 100; h.update(v); now += 100; h.update(v);
      assert.equal(frames, 1);
      assert.ok(!document.querySelector('.dt-stage').classList.contains('is-entering'));
      h.pulse({ type: 'warn' });
      assert.equal(document.querySelectorAll('.dt-ring').length, 0);
      h.destroy();
    } finally { DT.THEMES = saved; DT.clock.reset(); }
  });
})();
