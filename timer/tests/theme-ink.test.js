(function () {
  // 墨, ink dropped into water (docs/superpowers/specs/2026-11-27-ink-water-design.md). The water and its ink are a
  // WebGL painter; the stylesheet keeps the colours, the text and a plain column of ink for where there
  // is no WebGL. The painter's tests read its canvas back; where this browser has no WebGL they check the stand-in.
  const E = DT.engine, R = DT.render;
  const T0 = 1000000;
  const MATCH = { title: '测试', proMotion: '甲方的辩题', conMotion: '乙方的辩题', proTeam: '物理学院', conTeam: '化学院', proSeat: 'left' };
  const F = () => DT.BUILTIN_FORMATS.find(f => f.id === 'ustc-freshman-cup');
  const idx = name => F().stages.findIndex(s => s.name === name);
  const OPENING = '正方一辩开篇立论';   // pro, 3:00
  const REBUTTAL = '反方二辩驳论';       // con, 2:00
  const CLOSING = '反方四辩结辩';        // con, 3:30
  const GAP = 0.04, BED = 0.955;
  const surfaceOf = root => parseFloat(getComputedStyle(root).getPropertyValue('--ink-surface')) / 100;
  const frontAt = (surface, used, bed = BED) => surface + GAP + (bed - surface - GAP) * used;

  function mountInk(view, w, h, opts) {
    const box = document.getElementById('sandbox');
    box.innerHTML = '<div class="dt-stage-host" style="width:' + (w || 960) + 'px;height:' + (h || 540) + 'px"></div>';
    const stage = R.mount(box.firstChild, opts);
    stage.update(view);
    return { stage, root: box.querySelector('.dt-stage') };
  }
  const still = (view, w, h) => mountInk(view, w, h, { thumbnail: true });
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
  const titleCard = seat => E.view(E.createSession(F(), Object.assign({}, MATCH, { proSeat: seat || 'left' }), T0, { theme: 'ink' }), T0);
  const breakAt = secs => E.view(E.toggle(session('评委打分'), T0), T0 + secs * 1000);
  function endCard() {
    const s = DT.demo.build('end', T0, { theme: 'ink' }).session;
    return Object.assign(E.view(s, T0), { record: E.record(s, T0) });
  }
  function resolve(el, varName) {
    const probe = document.createElement('i');
    probe.style.color = 'var(' + varName + ')';
    el.appendChild(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  }
  const mixer = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  function rgbOf(css) {
    mixer.clearRect(0, 0, 1, 1);
    mixer.fillStyle = css; mixer.fillRect(0, 0, 1, 1);
    const d = mixer.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]];
  }
  const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lumOf = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  const contrast = (a, b) => ratio(lumOf(rgbOf(a)), lumOf(rgbOf(b)));
  const pseudo = (el, which) => getComputedStyle(el, which);
  const px = s => parseFloat(s);
  // Quiet the one warning a painter stopped for want of WebGL gives.
  function quietly(fn) {
    const warn = console.warn;
    console.warn = () => {};
    try { return fn(); } finally { console.warn = warn; }
  }
  // As if this machine had no WebGL: the painter cannot start, and the stylesheet stands in.
  function withoutWebGL(fn) {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind) { return /webgl/.test(kind) ? null : getContext.apply(this, arguments); };
    try { return quietly(fn); } finally { HTMLCanvasElement.prototype.getContext = getContext; }
  }
  let glKnown = null;
  function hasGL() {
    if (glKnown === null) {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      glKnown = !!gl;
      const lose = gl && gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
    }
    return glKnown;
  }
  // The painter's canvas as drawn, read back in the task that drew it (its buffer is not kept after it is shown), in
  // stage coordinates: at(x, y) takes CSS px from the stage's corner.
  function picture(root) {
    const canvas = root.querySelector('.dt-canvas');
    assert.ok(canvas && root.isConnected, 'the painter has a canvas on the page');
    const g = document.createElement('canvas');
    g.width = canvas.width; g.height = canvas.height;
    const c = g.getContext('2d', { willReadFrequently: true });
    c.drawImage(canvas, 0, 0);
    const data = c.getImageData(0, 0, g.width, g.height).data;
    const box = root.getBoundingClientRect();
    const k = g.width / box.width;
    const at = (x, y) => {
      const i = (Math.min(g.height - 1, Math.max(0, Math.floor(y * k))) * g.width + Math.min(g.width - 1, Math.max(0, Math.floor(x * k)))) * 4;
      return [data[i], data[i + 1], data[i + 2]];
    };
    // Every pixel of the buffer inside a stage rect [x0, y0, x1, y1] (CSS px).
    const each = (r, fn) => {
      for (let y = Math.floor(r[1] * k); y < Math.ceil(r[3] * k); y++) {
        for (let x = Math.floor(r[0] * k); x < Math.ceil(r[2] * k); x++) {
          if (x < 0 || y < 0 || x >= g.width || y >= g.height) continue;
          const i = (y * g.width + x) * 4;
          fn([data[i], data[i + 1], data[i + 2]], x / k, y / k);
        }
      }
    };
    const mean = (r, f) => { let s = 0, n = 0; each(r, c => { s += f(c); n++; }); return n ? s / n : NaN; };
    return { at, each, mean, surface: surfaceOf(root), W: box.width, H: box.height, data, g, k };
  }
  const warmth = c => c[0] - c[2];
  // The first colour in a gradient as an opaque CSS colour: color(srgb r g b / a) or rgb(a)(…).
  function firstColour(image) {
    let m = /color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/.exec(image);
    if (m) return 'rgb(' + [m[1], m[2], m[3]].map(v => Math.round(Number(v) * 255)).join(', ') + ')';
    m = /rgba?\((\d+), (\d+), (\d+)/.exec(image);
    return m ? 'rgb(' + m[1] + ', ' + m[2] + ', ' + m[3] + ')' : '';
  }   // cinnabar ink pulls a pixel's red above its blue; water and indigo the other way
  // The lowest row with ink in it, as a share of the height: a row of plain water is one colour across.
  function lowestInk(pic, x0, x1) {
    const step = 1 / pic.k;
    for (let y = pic.H * 0.985; y > pic.H * pic.surface; y -= step) {
      let lo = Infinity, hi = 0;
      for (let x = x0; x < x1; x += step) { const l = lumOf(pic.at(x, y)); lo = Math.min(lo, l); hi = Math.max(hi, l); }
      if (lo < 0.94 * hi) return y / pic.H;
    }
    return pic.surface;
  }
  // How many rows of a stage rect have ink in them: plain water is one colour across a row, ink is not.
  function inkedRows(pic, r, tol) {
    let rows = 0;
    const step = 1 / pic.k;
    for (let y = r[1]; y < r[3]; y += step) {
      const c = [0, 1, 2].map(i => { let a = Infinity, b = -Infinity; for (let x = r[0]; x < r[2]; x += step) { const v = pic.at(x, y)[i]; a = Math.min(a, v); b = Math.max(b, v); } return b - a; });
      if (Math.max.apply(null, c) > (tol || 2)) rows++;
    }
    return rows;
  }
  // The glyphs of a clock as drawn, in stage px from the stage's corner.
  function glyphs(root, clock) {
    const box = root.getBoundingClientRect();
    let u = null;
    clock.querySelectorAll('.dt-digits:not(.dt-digits-on) > span').forEach(s => {
      const r = s.getBoundingClientRect();
      if (!r.width) return;
      const v = [r.left - box.left, r.top - box.top, r.right - box.left, r.bottom - box.top];
      u = u ? [Math.min(u[0], v[0]), Math.min(u[1], v[1]), Math.max(u[2], v[2]), Math.max(u[3], v[3])] : v;
    });
    return u;
  }
  // Every transition run out.
  function settle(root) {
    root.classList.remove('is-entering');
    root.getAnimations({ subtree: true }).forEach(a => { if (a instanceof CSSTransition) a.finish(); });
  }

  // ---- what the theme is ----

  DT.test('theme ink: the live HD projector retains detail from the pigment texture to the screen', () => {
    if (!hasGL()) return;
    const copies = [];
    const proto = CanvasRenderingContext2D.prototype, drawImage = proto.drawImage;
    proto.drawImage = function (source, ...args) {
      if (source instanceof HTMLCanvasElement && source.parentNode === document.body) {
        copies.push([source.width, this.canvas.width]);
      }
      return drawImage.call(this, source, ...args);
    };
    let mounted;
    try {
      mounted = mountInk(dualAt(25), 1920, 1080);
      const display = mounted.root.querySelector('.dt-canvas');
      const gl = display.getContext('webgl2') || display.getContext('webgl');
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      const software = info && /swiftshader|llvmpipe|software rasterizer|basic render driver/i.test(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
      const minWidth = software ? 1024 : 1920;
      assert.ok(display.width >= minWidth && display.height >= minWidth * 9 / 16, 'HD projector pixel budget');
      // A GPU with no half-float solver uses the 640-wide traced renderer.
      const dyeWidth = Math.min(1920, gl.getParameter(gl.MAX_TEXTURE_SIZE));
      assert.ok(copies.length && copies.every(([src, dest]) => src === dest &&
        (software ? dest >= 440 : dest === 640 || dest >= dyeWidth - 1)),
        'the pigment frames pass through the cache without downsampling');
    } finally {
      proto.drawImage = drawImage;
      mounted?.stage.destroy();
    }
  });

  DT.test('theme ink: 墨 is a light theme with a WebGL painter that follows the clock, and the seals\' filters', () => {
    const meta = (DT.THEMES || []).find(t => t.id === 'ink');
    assert.ok(meta, 'ink is in DT.THEMES');
    assert.equal(meta.name, '墨');
    assert.equal(meta.tone, 'light');
    assert.ok(/水/.test(meta.desc) && /墨/.test(meta.desc), meta.desc);
    const spec = DT.themes.get('ink');
    assert.equal(spec.context, 'webgl');
    assert.equal(typeof spec.painter, 'function');
    assert.equal(spec.followsClock, true, 'a still shows the time: the ink\'s depth');
    ['dt-ink-seal', 'dt-ink-seal-light', 'dt-ink-drop'].forEach(id => assert.ok(spec.defs.indexOf('id="' + id + '"') >= 0, id));
    assert.ok(!/brush/.test(spec.defs), 'no brush filters are left');
  });

  DT.test('theme ink: the defs go in once, every id prefixed dt-ink-, and every filter the stage uses is one of them', () => {
    const a = still(singleAt(OPENING, 187));
    const b = R.mount(document.getElementById('sandbox').appendChild(document.createElement('div')), { thumbnail: true });
    b.update(singleAt(OPENING, 60));
    const boxes = document.querySelectorAll('[data-dt-defs="ink"]');
    assert.equal(boxes.length, 1);
    const ids = Array.from(boxes[0].querySelectorAll('[id]')).map(n => n.id);
    ids.forEach(id => assert.ok(id.indexOf('dt-ink-') === 0, id));
    const used = [];
    a.root.querySelectorAll('*').forEach(el => [null, '::before', '::after'].forEach(p => {
      (getComputedStyle(el, p).filter.match(/#dt-[\w-]+/g) || []).forEach(r => used.push(r.slice(1)));
    }));
    assert.ok(used.length >= 2, 'the seals use them: ' + used.join(','));
    used.forEach(r => assert.ok(ids.indexOf(r) >= 0, r));
    a.stage.destroy(); b.destroy();
  });

  // The stroke and everything that served it are gone: the sheets over the stage and the halves, the paper's tile, the
  // brush filters, the floor line.
  DT.test('theme ink: no stroke, paper sheet, brush or floor line is left', () => {
    let brushRules = 0;
    Array.from(document.styleSheets).forEach(sh => {
      let list;
      try { list = sh.cssRules; } catch (e) { return; }
      Array.from(list).forEach(function walk(r) {
        if (r.cssRules) Array.from(r.cssRules).forEach(walk);
        if (/data-theme="ink"/.test(r.selectorText || '') && /dt-ink-brush|feTurbulence/.test(r.cssText)) brushRules++;
      });
    });
    assert.equal(brushRules, 0, 'no rule draws a brush or a paper tile');
    [singleAt(OPENING, 0), dualAt(30)].forEach(view => {
      const { stage, root } = mountInk(view);
      const where = root.dataset.kind;
      const gone = s => s.content === 'none' || s.display === 'none';
      assert.ok(gone(pseudo(root, '::after')), where + ': no sheet over the stage, even as it comes in');
      root.querySelectorAll('.dt-half').forEach(h => assert.ok(gone(pseudo(h, '::after')), where + ': no sheet over a half'));
      assert.ok(gone(pseudo(root.querySelector('.dt-backdrop'), '::before')), where + ': no paper');
      root.querySelectorAll('.dt-field, .dt-half-field').forEach(f => assert.ok(gone(pseudo(f, '::before')), where + ': no stroke'));
      root.querySelectorAll('.dt-floorline').forEach(l => assert.equal(getComputedStyle(l).display, 'none', where + ': no floor line'));
      stage.destroy();
    });
  });

  // Colours live in the stylesheet only: the painter reads these off the stage (spec 技术约束).
  DT.test('theme ink: the palette the painter reads is the stylesheet\'s', () => {
    const { stage, root } = still(singleAt(OPENING, 60));
    const cs = getComputedStyle(root);
    ['--ink-water-top', '--ink-water-deep', '--pro', '--con', '--accent', '--ink-neutral', '--ink-surface', '--ink-cap'].forEach(v =>
      assert.ok(cs.getPropertyValue(v).trim(), v + ' is defined'));
    assert.ok(surfaceOf(root) > 0, 'a visible surface below the heading');
    const cap = px(cs.getPropertyValue('--ink-cap'));
    assert.ok(cap > 0 && cap < 1, '--ink-cap ' + cap);
    const top = rgbOf(resolve(root, '--ink-water-top')), deep = rgbOf(resolve(root, '--ink-water-deep'));
    assert.ok(lumOf(top) > lumOf(deep), 'the water deepens toward the bed');
    [top, deep].forEach(c => assert.ok(c[2] >= c[0], 'cool water, not cream: ' + c));
    // Where the ink is thickest behind the digits is what the shared contrast tests read: --side-color.
    assert.ok(/color-mix|rgb|color\(/.test(cs.getPropertyValue('--side-color')), cs.getPropertyValue('--side-color'));
    if (hasGL()) {
      // The bed, under the bottom bar's middle, where no ink has reached: the water there is --ink-water-deep.
      const pic = picture(root);
      const c = pic.at(pic.W / 2, pic.H * 0.995);
      c.forEach((v, i) => assert.near(v, deep[i], 6, 'the painter\'s water is the stylesheet\'s: ' + c + ' vs ' + deep));
    }
    stage.destroy();
  });

  // ---- the digits ----

  // Spec: the digits are one colour, always; never cut into two.
  DT.test('theme ink: the digits are one colour, never cut', () => {
    const views = [singleAt(OPENING, 60), singleAt(OPENING, 165), singleAt(OPENING, 187), singleAt(REBUTTAL, 50, 'right'),
      dualAt(30), dualAt(30, 'right'), E.view(E.tick(E.toggle(session('自由辩论'), T0), T0 + 241000).session, T0 + 241000), breakAt(5)];
    views.forEach(view => {
      const { stage, root } = mountInk(view);
      settle(root);
      root.querySelectorAll('.dt-clock').forEach(clock => {
        if (getComputedStyle(clock).display === 'none') return;
        const where = root.dataset.kind + ' ' + root.dataset.phase + ' ' + clock.dataset.clock;
        assert.equal(getComputedStyle(clock.querySelector('.dt-digits-on')).display, 'none', where + ': one layer');
        const digits = clock.querySelector('.dt-digits:not(.dt-digits-on)');
        assert.equal(getComputedStyle(digits).clipPath, 'none', where + ': not cut');
        assert.equal(getComputedStyle(digits.querySelector('.dt-colon')).filter, 'none', where + ': no halo');
        const colours = Array.from(digits.querySelectorAll('.dt-sign, .dt-min, .dt-sec')).map(s => getComputedStyle(s).color);
        assert.ok(colours.every(c => c === colours[0]), where + ': ' + colours.join(' / '));
      });
      stage.destroy();
    });
  });

  // Read actual pigment under the clock in single, dual, break and overtime stages.
  DT.test('theme ink: the ink behind the digits never takes them below 3:1', () => {
    if (!hasGL()) return;
    const failures = [];
    const cases = [];
    [0.2, 0.28, 0.36, 0.45, 0.55].forEach(u => [[OPENING, 180], [REBUTTAL, 120]].forEach(([name, secs]) =>
      ['left', 'right'].forEach(seat => cases.push(singleAt(name, u * secs, seat)))));
    cases.push(singleAt(CLOSING, 217), singleAt(OPENING, 200, 'right'), dualAt(30), dualAt(130), dualAt(200, 'right'), breakAt(12));
    cases.forEach(view => {
      const { stage, root } = still(view);
      const pic = picture(root);
      root.querySelectorAll('.dt-clock').forEach(clock => {
        if (getComputedStyle(clock).display === 'none') return;
        const g = glyphs(root, clock);
        if (!g) return;
        const ink = rgbOf(getComputedStyle(clock.querySelector('.dt-digits:not(.dt-digits-on) .dt-min')).color);
        let darkest = 1;
        pic.each(g, c => { darkest = Math.min(darkest, lumOf(c)); });
        const c = ratio(lumOf(ink), darkest);
        if (c < 3) failures.push(root.dataset.kind + ' ' + root.dataset.phase + ' ' + clock.dataset.clock + ' ' + root.style.getPropertyValue('--used') + ': ' + c.toFixed(2));
      });
      stage.destroy();
    });
    assert.ok(!failures.length, failures.join('\n'));
  });

  // Overtime: the digits turn an ochre deep enough for the ink thinned behind them then, and 超时 is stamped beside them.
  DT.test('theme ink: overtime turns the digits ochre and stamps a 超时 seal', () => {
    const calm = mountInk(singleAt(OPENING, 60));
    const none = pseudo(calm.root.querySelector('.dt-deco-over'), '::after');
    assert.ok(none.content === 'none' || none.display === 'none', 'no stamp before time is up');
    calm.stage.destroy();
    const { stage, root } = mountInk(singleAt(OPENING, 187));
    settle(root);   // the digits' colour eases in as a stage opens in overtime
    assert.equal(root.dataset.phase, 'over');
    const digits = getComputedStyle(root.querySelector('.dt-clock[data-clock="main"] .dt-digits')).color;
    assert.equal(digits, resolve(root, '--over-ink'));
    assert.ok(digits !== resolve(root, '--ink'), 'not the calm ink');
    const hue = rgbOf(digits);
    assert.ok(hue[0] > hue[1] && hue[1] > hue[2], 'ochre: ' + hue);
    ['--side-color', '--ink-water-deep', '--ink-water-top'].forEach(g =>
      assert.ok(contrast(digits, resolve(root, g)) >= 3, g + ': ' + contrast(digits, resolve(root, g)).toFixed(2)));
    const stamp = pseudo(root.querySelector('.dt-deco-over'), '::after');
    assert.equal(stamp.content, '"超时"');
    assert.ok(px(stamp.fontSize) >= 0.06 * root.getBoundingClientRect().height, 'a large stamp: ' + stamp.fontSize);
    assert.ok(/#dt-ink-seal/.test(stamp.filter), stamp.filter);
    stage.destroy();
  });

  // I5: the 超时 seal is pressed on the second bell (320 ms). It fills backwards: a held fill would keep the filtered
  // seal on a layer of its own after the press.
  DT.test('theme ink: the 超时 seal is pressed on the second bell', () => {
    const { stage, root } = mountInk(singleAt(OPENING, 187));
    const seal = pseudo(root.querySelector('.dt-deco-over'), '::after');
    assert.equal(seal.animationName, 'dt-stamp');
    assert.equal(seal.animationDuration, '0.3s');
    assert.equal(seal.animationDelay, '0.32s');
    assert.equal(seal.animationFillMode, 'backwards');
    stage.destroy();
  });

  // 「暂停」 stands at .8 under the digits; emptied on resume it keeps its word (stage.css :empty::before) while it fades,
  // so it must still fade to 0 and not stay on screen.
  DT.test('theme ink: 暂停 fades out on resume, it does not stay in the water', () => {
    let s = E.toggle(session(OPENING), T0);
    const { stage, root } = mountInk(E.view(s, T0 + 1000));
    root.classList.remove('is-entering');
    const state = root.querySelector('.dt-clock[data-clock="main"] .dt-state');
    s = E.toggle(s, T0 + 2000);
    stage.update(E.view(s, T0 + 2000));
    state.getAnimations().forEach(a => a.finish());
    assert.equal(getComputedStyle(state).opacity, '0.8', 'paused');
    s = E.toggle(s, T0 + 3000);
    stage.update(E.view(s, T0 + 3000));
    assert.equal(state.textContent, '');
    state.getAnimations().forEach(a => a.finish());
    assert.equal(getComputedStyle(state).opacity, '0', 'resumed, it fades out');
    stage.destroy();
  });

  // ---- the tank: the surface and the front ----

  DT.test('theme ink: moving the digits leaves the ink underneath identical', () => {
    if (!hasGL()) return;
    for (const view of [singleAt(OPENING, 60), dualAt(130), breakAt(12)]) {
      const {stage, root} = still(view, 640, 360);
      try {
        const before = picture(root);
        root.querySelectorAll('.dt-clock').forEach(clock => { clock.style.translate = '0 -35cqh'; });
        stage.update({...view, turns: (view.turns || []).slice()});
        const after = picture(root);
        assert.ok(before.data.every((v, i) => v === after.data[i]), view.stage.name + ': no clock-shaped lightening');
      } finally { stage.destroy(); }
    }
  });

  DT.test('theme ink: title and end cards show their settled composition on entry', () => {
    if (!hasGL()) return;
    let now = T0;
    DT.clock.set(() => now);
    try {
      for (const card of [titleCard(), endCard()]) {
        const {stage, root} = mountInk(card, 640, 360);
        try {
          const before = picture(root);
          now += 1500;
          stage.update(card);
          const after = picture(root);
          // The words can enter separately. Sample the water away from their boxes.
          const strip = [0, 0, before.W * .10, before.H * .8];
          before.each(strip, (rgb, x, y) => {
            const next = after.at(x + .1, y + .1);
            if (rgb.some((v, i) => Math.abs(v - next[i]) > 1)) throw Error(card.mode + ': pigment moved on entry');
          });
        } finally { stage.destroy(); }
      }
    } finally { DT.clock.reset(); }
  });

  DT.test('theme ink: the opening card fades into the first speaking clock', () => {
    if (!hasGL()) return;
    let now = T0;
    DT.clock.set(() => now);
    const { stage, root } = mountInk(titleCard(), 640, 360);
    try {
      now += 1200;
      stage.update(titleCard());
      const old = picture(root);
      const region = [0, 80, 640, 300];
      const difference = pic => {
        let sum = 0, n = 0;
        old.each(region, (rgb, x, y) => {
          const b = pic.at(x + 0.1, y + 0.1);
          sum += Math.abs(rgb[1] - b[1]); n++;
        });
        return sum / n;
      };
      const ready = session(OPENING);
      const frame = dt => { now += dt; stage.update(E.view(ready, now)); return difference(picture(root)); };
      const first = frame(100), middle = frame(260), last = frame(500);
      assert.ok(first < 1 && middle > first + 1 && last > middle + 1, [first, middle, last].join(' / '));
    } finally { stage.destroy(); DT.clock.reset(); }
  });

  DT.test('theme ink: one drop opens in a fixed tank before another enters across the page', () => {
    if (!hasGL()) return;
    for (const [name, duration, sign] of [[OPENING, 180, 1], [REBUTTAL, 120, -1]]) {
      const { stage, root } = still(singleAt(name, 0), 800, 360);
      const frame = progress => { stage.update(singleAt(name, progress * duration)); return picture(root); };
      const ink = (pic, x0, x1, y0, y1) => pic.mean([
        pic.W * (sign > 0 ? x0 : 1 - x1), pic.H * (pic.surface + (1 - pic.surface) * y0),
        pic.W * (sign > 0 ? x1 : 1 - x0), pic.H * (pic.surface + (1 - pic.surface) * y1)
      ], rgb => sign > 0 ? Number(warmth(rgb) > 38) : Number(warmth(rgb) < -26));
      try {
        const early = frame(0.015), spread = frame(0.12), second = frame(0.16);
        assert.ok(ink(early, 0, 0.52, 0, 0.3) > 0.001, 'first drop is visible near the top');
        assert.equal(ink(spread, 0.61, 1, 0.025, 0.3), 0, 'no second drop while the first opens');
        assert.ok(ink(spread, 0, 0.55, 0.22, 0.8) > 0.003, 'the first drop has spread deeper');
        assert.ok(ink(second, 0.61, 1, 0, 0.3) > 0.001 && ink(second, 0, 0.55, 0.22, 0.9) > 0.003,
          'the new drop enters across the page with the earlier ink still in the tank');
        for (const [progress, x0, x1] of [[0.36, 0, 0.16], [0.57, 0.84, 1]]) {
          assert.ok(ink(frame(progress), x0, x1, 0, 0.34) > 0.001, 'ink reaches the outer edge at ' + progress);
        }
      } finally { stage.destroy(); }
    }
  });

  DT.test('theme ink: a handoff preserves the tank and the earlier pigment', () => {
    if (!hasGL()) return;
    const pro = E.floor(session('自由辩论'), 'pro', T0);
    const handoff = T0 + 24000;
    const { stage, root } = still(E.view(pro, handoff), 800, 450);
    const bounds = () => root.querySelector('.dt-half[data-side="pro"]').getBoundingClientRect();
    const center = pic => {
      let sum = 0, weight = 0;
      pic.each([0, pic.H * pic.surface, pic.W / 2, pic.H * BED], (rgb, x) => {
        const tint = Math.max(0, warmth(rgb));
        sum += x * tint; weight += tint;
      });
      assert.ok(weight > 0, 'the first speaker left a visible plume');
      return sum / weight;
    };
    try {
      const first = center(picture(root)), wall = bounds().right;
      const con = E.floor(pro, 'con', handoff);
      stage.update(E.view(con, handoff));
      assert.near(bounds().right, wall, 1, 'the tank wall holds across a floor change');
      assert.near(center(picture(root)), first, 0.03 * 800, 'switching clocks does not move the earlier pigment abruptly');
      stage.update(singleAt(REBUTTAL, 0));
      const next = picture(root);
      assert.equal(next.mean([0, 0, next.W, next.H], rgb => warmth(rgb) > 25 ? 1 : 0), 0, 'a new stage starts with clean water');
    } finally { stage.destroy(); }
  });

  DT.test('theme ink: giving time back restores the drop and wake of that moment', () => {
    if (!hasGL()) return;
    // Undo and ↑↓ give time back: the same stage shown at less time used is the picture of that moment, not of the
    // deepest it has been.
    const fresh = still(singleAt(OPENING, 72), 640, 360);
    const want = picture(fresh.root).data;
    fresh.stage.destroy();
    const { stage, root } = still(singleAt(OPENING, 150), 640, 360);
    stage.update(singleAt(OPENING, 72));
    const got = picture(root).data;
    stage.destroy();
    let diff = 0;
    for (let i = 0; i < want.length; i++) diff = Math.max(diff, Math.abs(want[i] - got[i]));
    assert.ok(diff <= 1, 'the front is back where 1:48 puts it: ' + diff);
  });

  // A card whose WebGL cannot build the shader gives its context back at once, rather than holding one of the
  // browser's few live contexts until the canvas is collected; the stylesheet's column takes over.
  DT.test('theme ink: a shader that will not build gives its WebGL context back', () => {
    if (!hasGL()) return;
    const getContext = HTMLCanvasElement.prototype.getContext;
    let lost = 0, made = 0;
    HTMLCanvasElement.prototype.getContext = function (kind) {
      const gl = getContext.apply(this, arguments);
      if (!gl || !/webgl/.test(kind)) return gl;
      made++;
      gl.getShaderParameter = () => false;
      gl.getShaderInfoLog = () => 'refused for the test';
      const ext = gl.getExtension.bind(gl);
      gl.getExtension = name => {
        const e = ext(name);
        if (name !== 'WEBGL_lose_context' || !e) return e;
        return { loseContext: () => { lost++; e.loseContext(); }, restoreContext: () => e.restoreContext() };
      };
      return gl;
    };
    try {
      quietly(() => {
        const { stage, root } = mountInk(singleAt(OPENING, 60));
        settle(root);
        assert.ok(made > 0, 'the painter asked for WebGL');
        assert.equal(root.querySelector('.dt-canvas'), null, 'the painter stopped');
        assert.ok(!root.hasAttribute('data-painter'), 'no live painter');
        assert.ok(lost >= 1, 'its context was given back');
        stage.destroy();
      });
    } finally { HTMLCanvasElement.prototype.getContext = getContext; }
  });

  // Without WebGL the stylesheet draws a plain column of the side's ink from the surface down to the front (--used),
  // so the room still reads the time and who has the floor.
  DT.test('theme ink: without WebGL a column of ink runs from the surface down to the front', () => {
    withoutWebGL(() => {
      for (const name of [OPENING, '评委打分', '正反方二辩对辩', '自由辩论']) {
        const {stage, root} = mountInk(E.view(session(name), T0));
        try {
          const fields = root.querySelectorAll(root.dataset.kind === 'dual' ? '.dt-half-field' : '.dt-field');
          fields.forEach(field => {
            const style = getComputedStyle(field);
            assert.equal(style.opacity, '0', name + ': ready water is clear');
            assert.equal(style.animationName, 'none', name + ': switching pages releases no ink');
          });
        } finally { stage.destroy(); }
      }
      [0, 1 / 3, 2 / 3, 1].forEach(u => [[OPENING, 'left', '--pro'], [REBUTTAL, 'right', '--con']].forEach(([name, seat, side]) => {
        const secs = name === OPENING ? 180 : 120;
        const { stage, root } = mountInk(singleAt(name, u * secs, seat));
        settle(root);
        const where = name + ' / ' + seat + ' @' + u.toFixed(2);
        assert.equal(root.querySelector('.dt-canvas'), null, where + ': no canvas');
        assert.ok(!root.hasAttribute('data-painter'), where + ': no painter');
        const field = root.querySelector('.dt-field'), cs = getComputedStyle(field);
        assert.ok(cs.display !== 'none' && cs.visibility === 'visible', where + ': the column shows');
        assert.ok(/gradient/.test(cs.backgroundImage), where + ': ' + cs.backgroundImage.slice(0, 60));
        assert.deepEqual(rgbOf(firstColour(cs.backgroundImage)), rgbOf(resolve(root, side)), where + ': in its side\'s ink');
        const b = root.getBoundingClientRect(), f = field.getBoundingClientRect();
        assert.near((f.top - b.top) / b.height, surfaceOf(root), 0.005, where + ': from the surface');
        assert.near((f.bottom - b.top) / b.height, frontAt(surfaceOf(root), u, 1) + 0.02, 0.005, where + ': to the front and its soft edge');
        assert.ok(f.left <= b.left + 0.5 && f.right >= b.right - 0.5, where + ': across the tank');
        stage.destroy();
      }));
    });
    // Where the painter draws, the column is its job.
    if (hasGL()) {
      const { stage, root } = mountInk(singleAt(OPENING, 60));
      assert.equal(root.getAttribute('data-painter'), 'live');
      assert.equal(getComputedStyle(root.querySelector('.dt-field')).visibility, 'hidden');
      stage.destroy();
    }
  });

  DT.test('theme ink: neither seat displays a warning notch before or during the warning', () => {
    const check = () => [OPENING, REBUTTAL].forEach(name => ['left', 'right'].forEach(seat => {
      const { stage, root } = still(singleAt(name, 20, seat));
      try {
        for (const secs of [20, name === OPENING ? 151 : 91]) {
          stage.update(singleAt(name, secs, seat));
          assert.equal(getComputedStyle(root.querySelector('.dt-warnline')).display, 'none', name + ' / ' + seat);
        }
      } finally { stage.destroy(); }
    }));
    check();
    withoutWebGL(check);
  });

  // ---- the painter's water ----

  // Spec 确定性: the picture is a function of the view and the stage's size, so the projector and the console's preview
  // show one tank; and a clock that stands still is still water, drawn once.
  DT.test('theme ink: slow playback presents each refresh and samples the moving plume throughout the second', () => {
    if (!hasGL()) return;
    let now = T0;
    DT.clock.set(() => now);
    const running = E.toggle(session(OPENING), T0);
    const { stage, root } = mountInk(E.view(running, T0), 640, 360);
    const canvas = root.querySelector('.dt-canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const draws = new Set(), uploads = new Set(), originals = {};
    try {
      now += 11123;
      stage.update(E.view(running, now));
      for (const name of ['drawArrays', 'texImage2D', 'texSubImage2D']) {
        originals[name] = gl[name];
        gl[name] = function (...args) {
          (name === 'drawArrays' ? draws : uploads).add(now);
          return originals[name].apply(this, args);
        };
      }
      for (let i = 1; i <= 60; i++) {
        now = T0 + 11123 + Math.round(i * 1000 / 60);
        stage.update(E.view(running, now));
      }
      assert.ok(uploads.size >= 7, 'distinct plume samples in one second of a three-minute speech: ' + uploads.size);
      assert.equal(draws.size, 60, 'all 60 display updates present the advancing ink');
    } finally {
      Object.assign(gl, originals);
      stage.destroy();
      DT.clock.reset();
    }
  });

  DT.test('theme ink: the same view is the same water, and a standing clock is not drawn again', () => {
    if (!hasGL()) return;
    const a = still(dualAt(70), 640, 360), pa = picture(a.root).data;
    const b = still(dualAt(70), 640, 360), pb = picture(b.root).data;
    a.stage.destroy(); b.stage.destroy();
    let same = pa.length === pb.length;
    for (let i = 0; same && i < pa.length; i++) same = pa[i] === pb[i];
    assert.ok(same, 'two stages, one view: one picture');
    const draws = [];
    const protos = [window.WebGLRenderingContext, window.WebGL2RenderingContext].filter(Boolean).map(C => C.prototype);
    const saved = protos.map(p => p.drawArrays);
    protos.forEach((p, i) => { p.drawArrays = function () {
      if (this.canvas.classList.contains('dt-canvas')) draws.push(1);  // Sumi has its own offscreen drawing passes
      return saved[i].apply(this, arguments);
    }; });
    let now = 50000;
    DT.clock.set(() => now);
    try {
      const paused = E.toggle(E.toggle(session(OPENING), T0), T0 + 40000);   // ran 40 s, then paused
      const { stage, root } = mountInk(E.view(paused, T0 + 40000));
      assert.equal(root.getAttribute('data-painter'), 'live');
      now += 1000; stage.update(E.view(paused, T0 + 41000));   // the drops have fallen in
      now += 1000; stage.update(E.view(paused, T0 + 42000));   // the layout has settled
      const before = draws.length;
      for (let i = 0; i < 5; i++) { now += 100; stage.update(E.view(paused, T0 + 42000 + i * 100)); }
      assert.equal(draws.length, before, 'paused: nothing drawn');
      const running = E.toggle(paused, T0 + 43000);
      for (let i = 1; i <= 3; i++) { now += 100; stage.update(E.view(running, T0 + 43000 + i * 100)); }
      assert.equal(draws.length, before + 3, 'running: the water moves');
      stage.destroy();
    } finally { protos.forEach((p, i) => { p.drawArrays = saved[i]; }); DT.clock.reset(); }
  });

  // Track the silhouette of the coloured bead in the air, separately from the existing dye below it.
  function beadHeight(pic, x, pigment) {
    let count = 0, sum = 0;
    pic.each([pic.W*x - pic.H*.02, pic.H*(pic.surface-.13), pic.W*x + pic.H*.02, pic.H*(pic.surface-.004)],
      (rgb, _, y) => {
        if (pigment === 'pro' ? warmth(rgb)>30 : pigment === 'con' ? warmth(rgb)<-32 : rgb[0]<150) {
          count++; sum += y;
        }
      });
    return count ? sum / count / pic.H : null;
  }

  DT.test('theme ink: the first bead waits for the timer and follows it through a pause', () => {
    if (!hasGL()) return;
    let now = T0;
    DT.clock.set(() => now);
    try {
      for (const [name, side, x] of [[OPENING, 'pro', .28], [REBUTTAL, 'con', .72], ['评委打分', 'neutral', .412],
        ['正反方二辩对辩', 'con', .555], ['自由辩论', 'pro', .445]]) {
        const two = name === '正反方二辩对辩' || name === '自由辩论';
        let s = session(name);
        const {stage, root} = mountInk(E.view(s, now), 640, 360);
        try {
          const frame = ms => { now += ms; stage.update(E.view(s, now)); return picture(root); };
          const bead = pic => beadHeight(pic, x, side);
          const wet = pic => pic.mean([pic.W*(x-.08),pic.H*(pic.surface+.007),pic.W*(x+.08),pic.H*(pic.surface+.15)],
            rgb => Number(side === 'pro' ? warmth(rgb)>30 : side === 'con' ? warmth(rgb)<-30 : rgb[0]<150));
          for (const wait of [0, 200, 2500]) {
            const idle = frame(wait);
            assert.equal(bead(idle), null, name + ': no bead on page entry');
            assert.equal(wet(idle), 0, name + ': ready water is clear');
          }
          s = two ? E.floor(s, side, now) : E.toggle(s, now);
          const high = bead(frame(120));
          const falling = frame(330), low = bead(falling);
          assert.ok(high !== null && low !== null && low > high + .015, name + ': falls after start');
          assert.equal(wet(falling), 0, name + ': water clear until impact');
          s = E.pause(s, now);
          assert.near(bead(frame(1800)), low, .002, name + ': pause holds the bead');
          s = E.toggle(s, now);
          const landed = frame(750);
          assert.ok(bead(landed) === null && wet(landed) > .001, name + ': resumes and enters the water');
        } finally { stage.destroy(); }
      }
    } finally { DT.clock.reset(); }
  });

  DT.test('theme ink: airborne and submerged drops keep their proportions across tank widths', () => {
    if (!hasGL()) return;
    function bounds(pic, above) {
      let left = Infinity, top = Infinity, right = -1, bottom = -1;
      pic.each([0, above ? 0 : pic.H*(pic.surface+.002), pic.W, above ? pic.H*(pic.surface-.004) : pic.H], (rgb, x, y) => {
        if (warmth(rgb) < 30) return;
        left = Math.min(x,left); right = Math.max(x,right); top = Math.min(y,top); bottom = Math.max(y,bottom);
      });
      assert.ok(right > left && bottom > top, 'visible coloured drop');
      return (right-left+1/pic.k)/(bottom-top+1/pic.k);
    }
    const shapes = [400, 640, 840].map(width => {
      const running = s => singleAt(OPENING,s);
      const {stage,root} = still(running(2.5), width, 360);
      try {
        const bloom = bounds(picture(root), false);
        stage.update(running(.78));
        const contact = bounds(picture(root), false);
        stage.update(running(25));
        return [bloom, contact, bounds(picture(root), true)];
      } finally { stage.destroy(); }
    });
    shapes[0].forEach((_, i) => {
      const ratios = shapes.map(shape => shape[i]);
      assert.ok(Math.max(...ratios)/Math.min(...ratios) < 1.23, ['bloom','contact','air'][i] + ': ' + ratios.join(', '));
    });
  });

  DT.test('theme ink: every later speaking and break drop falls through air at its own injection point', () => {
    if (!hasGL()) return;
    for (const [view, side, secs] of [[s=>singleAt(OPENING,s),'pro',180],
      [s=>singleAt(REBUTTAL,s),'con',120],[breakAt,'neutral',30]]) {
      const {stage,root} = mountInk(view(0),640,360);
      try {
        for (const [at, position] of [[.14,.78],[.34,.09],[.55,.90],[.77,.48]]) {
          const x = side==='con' ? 1-position : side==='neutral' ? .3+.4*position : position;
          const sample = offset => { stage.update(view(at*secs+offset)); return beadHeight(picture(root),x,side); };
          const high = sample(-.50), low = sample(-.22);
          assert.ok(high!==null && low!==null && low>high+.012, side+' drop '+at+' descends: '+high+' to '+low);
          assert.equal(sample(.8),null,side+' drop '+at+' has landed');
        }
      } finally { stage.destroy(); }
    }
  });

  DT.test('theme ink: each speaker releases all five drops through the surface across handoffs', () => {
    if (!hasGL()) return;
    for (const [name, seat] of [['正反方二辩对辩','left'],['自由辩论','right']]) {
      let s = session(name,seat), now = T0;
      const {stage, root} = mountInk(E.view(s,now),640,360), used = {pro:0,con:0};
      try {
        for (const [fraction, pos] of [[0,.445],[.14,.36],[.34,.475],[.55,.29],[.77,.42]]) {
          for (const side of ['pro','con']) {
            const x = (side==='pro') === (seat==='left') ? pos : 1-pos;
            s = E.floor(s,side,now);
            const clock = E.view(s,now).clocks.find(c=>c.id===side);
            const threshold = fraction*clock.total;
            now += threshold-used[side];
            const bead = (state,t) => { stage.update(E.view(state,t)); return beadHeight(picture(root),x,side); };
            const high = bead(s,now+140), low = bead(s,now+460);
            assert.ok(high!==null && low!==null && low>high+.02, name+' '+side+' drop '+fraction+' falls');
            if (fraction===0 && side==='con') {
              const paused = E.pause(s,now+460);
              assert.near(bead(paused,now+1600),low,.004,'pausing holds the airborne drop');
              assert.near(bead(JSON.parse(JSON.stringify(paused)),now+2600),low,.004,'restored flight is at the same height');
            }
            assert.equal(bead(s,now+1000),null,'landed at the speaking side');
            now += 1000; used[side] = threshold+1000;
          }
        }
      } finally { stage.destroy(); }
    }
  });

  DT.test('theme ink: switching speakers mid-flight lets both beads reach the shared surface', () => {
    if (!hasGL()) return;
    const pro = E.floor(session('自由辩论'),'pro',T0);
    const con = E.floor(pro,'con',T0+220);
    const {stage,root} = mountInk(E.view(pro,T0),640,360);
    const sample = ms => { stage.update(E.view(con,T0+ms)); return picture(root); };
    try {
      const both = sample(430), one = sample(800), landed = sample(1300);
      const red = beadHeight(both,.445,'pro'), blue = beadHeight(both,.555,'con');
      assert.ok(red!==null && blue!==null && red>blue+.012,'earlier bead leads the second in flight');
      assert.ok(beadHeight(one,.445,'pro')===null && beadHeight(one,.555,'con')!==null,'red reaches water first');
      assert.equal(beadHeight(landed,.555,'con'),null,'blue lands too');
    } finally { stage.destroy(); }
  });

  // Spec 铃: a bell drops fresh ink into the speaking side that sinks to the front and melts into it, its age the time
  // the clock has used since the bell, so it is the same drop after an undo or on the projector; without the painter a
  // ripple round the digits is the bell.
  DT.test('theme ink: a bell\'s drop comes and goes with the clock\'s time, and the ripple stands in without WebGL', () => {
    if (hasGL()) {
      let now = 90000;
      DT.clock.set(() => now);
      try {
        const run = E.toggle(session(OPENING), T0);
        const at = secs => E.view(run, T0 + secs * 1000);
        const make = () => {
          const box = document.getElementById('sandbox').appendChild(document.createElement('div'));
          box.className = 'dt-stage-host';
          box.style.cssText = 'width:640px;height:360px';
          const h = R.mount(box);
          h.update(at(149));
          return { h, root: box.querySelector('.dt-stage') };
        };
        document.getElementById('sandbox').innerHTML = '';
        const rung = make(), quiet = make();
        const both = secs => { now += 1000; [rung, quiet].forEach(s => s.h.update(at(secs))); return [rung, quiet].map(s => picture(s.root).data); };
        both(149.5);   // the drops have fallen in
        rung.h.pulse({ type: 'warn', clock: 'main', key: 'w30', at: T0 + 150000 });
        const differ = ([a, b]) => { let d = 0; for (let i = 0; i < a.length; i++) d = Math.max(d, Math.abs(a[i] - b[i])); return d; };
        assert.ok(differ(both(150.5)) > 20, 'a drop falls');
        assert.ok(differ(both(152.5)) <= 1, 'and has melted into the front 2 s on');
        assert.ok(differ(both(150.5)) > 20, 'the clock taken back, the drop is where it was then');
        assert.ok(differ(both(148)) <= 1, 'and before the bell there is none');
        const ring = rung.root.querySelector('.dt-ring');
        assert.ok(ring && getComputedStyle(ring).visibility === 'hidden', 'the drop is the bell: the ripple stands aside');
        // A break has no speaking side and no drop: its end bell is the ripple, painter or not.
        const b = mountInk(breakAt(29));
        b.stage.pulse({ type: 'end', clock: 'main', key: 'end' });
        assert.equal(getComputedStyle(b.root.querySelector('.dt-ring')).visibility, 'visible', "a break's bell is seen");
        b.stage.destroy();
        [rung, quiet].forEach(s => s.h.destroy());
      } finally { DT.clock.reset(); }
    }
    withoutWebGL(() => {
      const { stage, root } = mountInk(singleAt(OPENING, 150));
      settle(root);
      stage.pulse({ type: 'warn', clock: 'main', key: 'w30' });
      const ring = root.querySelector('.dt-clock[data-clock="main"] .dt-ring');
      assert.ok(ring, 'a ring');
      const cs = getComputedStyle(ring);
      assert.equal(cs.visibility, 'visible', 'seen where there is no painter');
      assert.equal(cs.animationName, 'dt-ink-ripple');
      assert.equal(cs.animationDuration, '1.1s');
      assert.ok(px(cs.borderTopWidth) > 0, 'a ripple\'s line');
      stage.destroy();
    });
  });

  // Spec 超时: a thin thread of the accent's ink keeps falling from the surface at the speaking seat.
  DT.test('theme ink: overtime is a thread of ochre ink falling at the speaking seat', () => {
    if (!hasGL()) return;
    [['left', 'right'], ['right', 'left']].forEach(([seat, wall]) => {
      const { stage, root } = still(singleAt(CLOSING, 217, seat), 960, 540);   // 反方: its seat is the one 正方 is not on
      const pic = picture(root);
      const ochre = (x0, x1) => { let n = 0; pic.each([x0, pic.H * (pic.surface + 0.02), x1, pic.H * 0.9], c => { if (c[0] - c[2] > 40 && c[1] - c[2] > 15) n++; }); return n; };
      const near = wall === 'left' ? ochre(0, pic.W * 0.15) : ochre(pic.W * 0.85, pic.W);
      const far = wall === 'left' ? ochre(pic.W * 0.85, pic.W) : ochre(0, pic.W * 0.15);
      assert.ok(near > 100 && far === 0, seat + ': at the ' + wall + ' wall: ' + near + ' / ' + far);
      stage.destroy();
    });
    const calm = still(singleAt(CLOSING, 100), 960, 540);
    const pic = picture(calm.root);
    let n = 0;
    pic.each([0, 0, pic.W, pic.H], c => { if (c[0] - c[2] > 40 && c[1] - c[2] > 15) n++; });
    assert.equal(n, 0, 'none before the time is up');
    calm.stage.destroy();
  });

  // ---- two speakers in one tank ----

  DT.test('theme ink: in both debate formats the mixed plume follows the order of the turns and survives reload', () => {
    if (!hasGL()) return;
    for (const name of ['正反方二辩对辩', '自由辩论']) {
      const base = session(name);
      let a = E.floor(base, 'pro', T0);
      a = E.floor(a, 'con', T0 + 12000);
      a = E.floor(a, 'pro', T0 + 24000);
      a = E.pause(a, T0 + 30000);
      let b = E.floor(base, 'con', T0);
      b = E.floor(b, 'pro', T0 + 12000);
      b = E.pause(b, T0 + 30000);
      const view = s => E.view(s, T0 + 35000);
      assert.deepEqual(view(a).clocks, view(b).clocks, 'same clocks and final speaker');
      const { root, stage } = still(view(a), 640, 360);
      try {
        const first = picture(root);
        stage.update(view(b));
        const second = picture(root);
        let changed = 0;
        first.each([first.W * 0.38, first.H * first.surface, first.W * 0.62, first.H * BED], (rgb, x, y) => {
          const next = second.at(x + 0.1, y + 0.1);
          if (rgb.some((channel, i) => Math.abs(channel - next[i]) > 8)) changed++;
        });
        assert.ok(changed > 100, name + ': turn order changes the pigment near the center');
        stage.update(E.view(JSON.parse(JSON.stringify(a)), T0 + 90000));
        const replay = picture(root).data;
        assert.ok(first.data.every((channel, i) => Math.abs(channel - replay[i]) <= 1), name + ': paused ink restores at its original position');
      } finally { stage.destroy(); }
    }
  });

  // Both colours stay in the shared tank. Only the speaker's clock advances.
  DT.test('theme ink: both pigments move through the middle of the tank during free debate', () => {
    ['left', 'right'].forEach(seat => {
      const view = dualAt(130, seat);   // 反方 speaking, 110 s used; 正方 waiting, 20 s used
      if (hasGL()) {
        const { stage, root } = still(view);
        const pic = picture(root);
        const box = root.getBoundingClientRect();
        const half = side => {
          const r = root.querySelector('.dt-half[data-side="' + side + '"]').getBoundingClientRect();
          return [r.left - box.left + 0.03 * pic.H, pic.H * (pic.surface + 0.005), r.right - box.left - 0.03 * pic.H, pic.H * 0.9];
        };
        const pro = half('pro'), con = half('con');
        assert.ok(pic.mean(pro, c => warmth(c) > 15 ? 1 : 0) > 0.01, seat + ': cinnabar in the pro half');
        assert.ok(pic.mean(con, c => warmth(c) < -28 ? 1 : 0) > 0.01, seat + ': indigo in the con half');
        stage.update(dualAt(132, seat));
        const later = picture(root);
        const changed = r => {
          let count = 0;
          pic.each(r, (rgb, x, y) => {
            const next = later.at(x + 0.1, y + 0.1);
            if (rgb.some((v, i) => Math.abs(v - next[i]) > 5)) count++;
          });
          return count;
        };
        assert.ok(changed(pro) > 100, seat + ': the speaker stirs the water around the earlier ink');
        const center = [pic.W * 0.48, pic.H * (pic.surface + 0.015), pic.W * 0.52, pic.H * BED];
        assert.ok(changed(center) > 20, seat + ': pigment moves through the center');
        assert.ok(changed(con) > 100, seat + ': the speaking drop moves');
        stage.destroy();
      }
      withoutWebGL(() => {
        const { stage, root } = mountInk(view);
        settle(root);
        const f = side => root.querySelector('.dt-half[data-side="' + side + '"] .dt-half-field');
        const b = root.getBoundingClientRect();
        const bottom = side => (f(side).getBoundingClientRect().bottom - b.top) / b.height;
        assert.near(bottom('con'), frontAt(surfaceOf(root), 110 / 240) + 0.02, 0.006, seat + ': 反方\'s column to its front');
        assert.near(bottom('pro'), frontAt(surfaceOf(root), 20 / 240) + 0.02, 0.006, seat + ': 正方\'s to its own');
        assert.ok(px(getComputedStyle(f('pro')).opacity) < px(getComputedStyle(f('con')).opacity), seat + ': the waiting column paler');
        stage.destroy();
      });
    });
  });

  // The halves have no glass between them and no floor line; the waiting half is not greyed by the shared filter (its
  // ink pales instead), so its digits stay as crisp as the speaker's.
  DT.test('theme ink: the halves part without glass, and the waiting half keeps crisp digits', () => {
    const { stage, root } = mountInk(dualAt(30));
    settle(root);
    root.querySelectorAll('.dt-half').forEach(h => {
      assert.equal(getComputedStyle(h).boxShadow, 'none', h.dataset.side + ': no glass');
      assert.equal(getComputedStyle(h).filter, 'none', h.dataset.side + ': not greyed');
      assert.equal(getComputedStyle(h).backgroundColor, 'rgba(0, 0, 0, 0)', h.dataset.side + ': the water shows through');
    });
    stage.destroy();
  });

  // A locked clock leaves its ink in the tank, paler.
  DT.test('theme ink: yielding leaves the ink in place and an expired side keeps its ink', () => {
    withoutWebGL(() => {
      const pro = E.floor(session('自由辩论'), 'pro', T0), at = T0 + 30000;
      const { stage, root } = still(E.view(pro, at));
      try {
        const field = root.querySelector('.dt-half[data-side="pro"] .dt-half-field');
        const depth = field.getBoundingClientRect().bottom;
        stage.update(E.view(E.yieldTime(pro, at), at));
        settle(root);
        assert.near(field.getBoundingClientRect().bottom, depth, 1, 'the fallback keeps the depth reached before yielding');
      } finally { stage.destroy(); }
    });
    let s = E.floor(session('自由辩论'), 'pro', T0);
    const { stage, root } = mountInk(E.view(s, T0 + 30000));
    settle(root);
    s = E.yieldTime(s, T0 + 30000);
    stage.update(E.view(s, T0 + 30000));
    const pro = root.querySelector('.dt-half[data-side="pro"]');
    assert.ok(pro.hasAttribute('data-locked'));
    const clear = pro.getAnimations().find(a => a.transitionProperty === '--ink-clear');
    assert.ok(clear, 'the painter\'s --ink-clear runs');
    assert.equal(clear.effect.getTiming().duration, 300);
    clear.finish();
    assert.equal(px(getComputedStyle(pro).getPropertyValue('--ink-clear')), 1);
    stage.destroy();
    if (!hasGL()) return;
    // The two kinds of lock, as stills (landed): 正方 yielded at 30 s; 正方 out of time.
    const yielded = () => E.view(E.yieldTime(E.floor(session('自由辩论'), 'pro', T0), T0 + 30000), T0 + 30000);
    const out = () => E.view(E.tick(E.toggle(session('自由辩论'), T0), T0 + 241000).session, T0 + 241000);
    [[yielded, 'yielded'], [out, 'out']].forEach(([view, how]) => {
      const m = still(view());   // one at a time: a stage taken out of the page has no picture to read
      assert.ok(m.root.isConnected);
      const pic = picture(m.root);
      const box = m.root.getBoundingClientRect(), r = m.root.querySelector('.dt-half[data-side="pro"]').getBoundingClientRect();
      const x0 = r.left - box.left + 0.03 * pic.H, x1 = r.right - box.left - 0.03 * pic.H;
      const rows = inkedRows(pic, [x0, pic.H * (pic.surface + 0.01), x1, pic.H * 0.97]);
      if (how === 'yielded') assert.ok(rows > 0, 'the pigment stays when the floor is yielded');
      else {
        assert.ok(rows > 0.3 * pic.H * 0.6, 'out of time: its ink is still there: ' + rows + ' rows');
        assert.ok(lowestInk(pic, x0, x1) > BED - 0.05, 'on the bed: ' + lowestInk(pic, x0, x1));
      }
      m.stage.destroy();
    });
  });

  // A half out of time puts 时间到 (已放弃) where its digits were, at the clock's centre.
  DT.test('theme ink: a locked half\'s word stands where its digits were', () => {
    ['left', 'right'].forEach(seat => [[960, 540], [1024, 768]].forEach(([w, h]) => [['out', '时间到'], ['yield', '已放弃']].forEach(([how, word]) => {
      let s = session('自由辩论', seat), t;
      if (how === 'out') { s = E.toggle(s, T0); t = T0 + 241000; s = E.tick(s, t).session; }
      else { s = E.floor(s, 'pro', T0); t = T0 + 30000; s = E.yieldTime(s, t); }
      const { stage, root } = mountInk(E.view(s, t), w, h);
      root.classList.remove('is-entering');
      const where = seat + ' ' + w + 'x' + h + ' ' + how;
      const pro = root.querySelector('.dt-half[data-side="pro"]');
      assert.ok(pro.hasAttribute('data-locked'), where);
      const clock = pro.querySelector('.dt-clock'), state = clock.querySelector('.dt-state');
      assert.equal(state.textContent, word, where);
      state.getAnimations().forEach(a => a.finish());
      const c = clock.getBoundingClientRect(), r = state.getBoundingClientRect();
      assert.near((r.left + r.right) / 2, (c.left + c.right) / 2, 1, where + ': across');
      assert.near((r.top + r.bottom) / 2, (c.top + c.bottom) / 2, 1, where + ': down');
      stage.destroy();
    })));
  });

  // ---- the cards, and the thumbnail ----

  // Spec 卡片: the title card's two drops bloom each on its own side; the break's neutral drop sinks in the middle;
  // the end card's two inks lie in layers.
  DT.test('theme ink: the cards: two blooms on their own sides, a grey drop in the middle, two layers at the end', () => {
    if (!hasGL()) return;
    ['left', 'right'].forEach(seat => {
      const { stage, root } = still(titleCard(seat));
      const pic = picture(root);
      const third = i => [pic.W * i / 3, pic.H * 0.2, pic.W * (i + 1) / 3, pic.H * 0.9];
      const pro = third(seat === 'left' ? 0 : 2), con = third(seat === 'left' ? 2 : 0);
      const red = c => warmth(c) > 20 ? 1 : 0, blue = c => warmth(c) < -28 ? 1 : 0;
      assert.ok(pic.mean(pro, red) > 0.01 && pic.mean(con, red) === 0, 'cinnabar on the pro side only');
      const conBlue = pic.mean(con, blue), proBlue = pic.mean(pro, blue);
      assert.ok(conBlue > 0.01 && proBlue === 0, 'indigo on the con side only: ' + conBlue + ' / ' + proBlue);
      // and the blooms keep to their sides, clear of the motions in the middle
      const dark = rr => pic.mean(rr, c => 1 - lumOf(c));
      const mid = dark([pic.W * 0.42, pic.H * 0.2, pic.W * 0.58, pic.H * 0.9]);
      assert.ok(mid < dark(third(0)) && mid < dark(third(2)), 'title / ' + seat + ': the middle is the clearest: ' + mid.toFixed(3));
      stage.destroy();
    });
    {
      const { stage, root } = still(breakAt(12));
      const pic = picture(root);
      const dark = r => pic.mean(r, c => 1 - lumOf(c));
      const mid = dark([pic.W * 0.4, pic.H * 0.2, pic.W * 0.6, pic.H * BED]);
      const side = dark([0, pic.H * 0.2, pic.W * 0.15, pic.H * BED]);
      assert.ok(mid > side + 0.01, 'break: the drop is in the middle: ' + mid.toFixed(3) + ' vs ' + side.toFixed(3));
      let tinted = 0;
      pic.each([pic.W * 0.3, pic.H * 0.2, pic.W * 0.7, pic.H * 0.7], c => { if (Math.abs(warmth(c)) > 30) tinted++; });
      assert.equal(tinted, 0, 'break: neutral ink, neither side\'s');
      stage.destroy();
    }
    {
      const { stage, root } = still(endCard(), 960, 540);
      const pic = picture(root);
      const band = (y0, y1) => pic.mean([0, pic.H * y0, pic.W * 0.2, pic.H * y1], warmth);
      const over = band(0.3, 0.45);   // the clear water over the layers
      assert.ok(band(0.64, 0.76) > over + 6, 'end: 正方\'s ink in the upper layer: ' + band(0.64, 0.76).toFixed(1) + ' vs ' + over.toFixed(1));
      assert.ok(band(0.84, 0.95) < band(0.64, 0.76) - 15, 'end: 反方\'s in the lower: ' + band(0.84, 0.95).toFixed(1));
      stage.destroy();
    }
  });

  // The setup page's thumbnails are tiny: the ink must still read as ink in water there.
  DT.test('theme ink: a thumbnail is still ink in water', () => {
    if (!hasGL()) {
      withoutWebGL(() => {
        const { stage, root } = still(singleAt(OPENING, 27), 240, 135);
        assert.equal(getComputedStyle(root.querySelector('.dt-field')).visibility, 'visible');
        stage.destroy();
      });
      return;
    }
    const { stage, root } = still(singleAt(OPENING, 27), 240, 135);   // setup.js's sample: 15% used
    assert.equal(root.getAttribute('data-painter'), 'live');
    const pic = picture(root);
    assert.ok(pic.g.width >= 240, 'drawn at the thumbnail\'s own pixels: ' + pic.g.width);
    let inked = 0, n = 0;
    const water = warmth(pic.at(pic.W / 2, pic.H * 0.995));
    const upperTank = [0, pic.H * pic.surface, pic.W, pic.H * (pic.surface + .6 * (1 - pic.surface))];
    pic.each(upperTank, c => { n++; if (warmth(c) > water + 15) inked++; });
    assert.ok(inked > 0.03 * n && inked < 0.7 * n, 'distinct blooms in the upper tank: ' + inked + ' of ' + n);
    stage.destroy();
  });

  // ---- the seals ----

  // The stage type is marked with a small 朱文 seal, in the app's own words for the types. Its one column of type sits
  // in the middle of the box, large enough to read at 1366×768, where the seal also wears more lightly.
  DT.test('theme ink: the seal\'s two characters sit centred in the box, large enough to read', () => {
    [[1920, 1080, /dt-ink-seal"?\)/], [1366, 768, /dt-ink-seal-light/]].forEach(([w, h, filter]) => {
      const { stage, root } = mountInk(singleAt(OPENING, 60), w, h);
      const seal = pseudo(root.querySelector('.dt-head'), '::before');
      assert.equal(seal.paddingLeft, seal.paddingRight, w + ': even either side');
      assert.ok(px(seal.fontSize) >= 0.03 * h, w + ': ' + seal.fontSize);
      const inner = px(seal.width) - (seal.boxSizing === 'border-box'
        ? px(seal.paddingLeft) + px(seal.paddingRight) + px(seal.borderLeftWidth) + px(seal.borderRightWidth) : 0);
      assert.near(inner, px(seal.fontSize) * px(seal.lineHeight) / px(seal.fontSize), 1.5, w + ': the box is the column wide: ' + seal.width);
      assert.ok(filter.test(seal.filter), w + ': ' + seal.filter);
      stage.destroy();
    });
  });

  DT.test('theme ink: a small seal names the stage type', () => {
    [[singleAt(OPENING, 60), '单方'], [dualAt(30), '双方'], [breakAt(5), '间隔'], [endCard(), '终局']].forEach(([view, word]) => {
      const { stage, root } = mountInk(view);
      const seal = pseudo(root.querySelector('.dt-head'), '::before');
      assert.equal(seal.content, '"' + word + '"', root.dataset.kind);
      assert.ok(seal.display !== 'none' && px(seal.width) > 0, root.dataset.kind + ' seal shows');
      stage.destroy();
    });
  });

  DT.test('theme ink: a distinct waterline clears the stage lettering and the break retains its original level', () => {
    const views = [singleAt(OPENING, 60), dualAt(30), titleCard(), breakAt(5), endCard()];
    const wrapped = singleAt(OPENING, 60);
    wrapped.stage = { ...wrapped.stage, name:'正方第一轮针对反方结辩提出的问题进行限时回应与补充说明' };
    views.push(wrapped);
    const check = () => views.forEach(view => {
      const { stage, root } = still(view, view === wrapped ? 360 : 800, 450);
      try {
        const surface = surfaceOf(root), box = root.getBoundingClientRect();
        if (view.stage && view.stage.type !== 'break') {
          const head = root.querySelector('.dt-head').getBoundingClientRect();
          assert.near(surface - (head.bottom - box.top) / box.height, .016, .005, 'waterline directly below the text');
          if (view === wrapped) {
            const title = root.querySelector('.dt-title');
            assert.ok(title.offsetHeight > 1.5 * px(getComputedStyle(title).lineHeight), 'title occupies two lines');
          }
        } else if (view.stage) assert.equal(surface, .19, 'original break waterline');
        for (const el of root.querySelectorAll('.dt-top, .dt-head, .dt-team')) {
          assert.equal(getComputedStyle(el).backgroundColor, 'rgba(0, 0, 0, 0)', 'the header row is clear');
        }
        for (const el of root.querySelectorAll('.dt-top span, .dt-title, .dt-speaker, .dt-team-name')) {
          if (el.textContent && el.getBoundingClientRect().width) assert.ok(getComputedStyle(el).textShadow !== 'none', 'light behind ' + el.textContent);
        }
        if (root.dataset.painter === 'live') {
          const pic = picture(root), y = surface * pic.H, x = pic.W * .94;
          const above = pic.at(x, y - 5), edge = pic.at(x, y), below = pic.at(x, y + 4);
          assert.ok(edge[0] + 6 < Math.min(above[0], below[0]), view.mode + ': visible surface in clear water');
        }
      } finally { stage.destroy(); }
    });
    check();
    withoutWebGL(check);
  });
})();
