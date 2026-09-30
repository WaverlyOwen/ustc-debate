(function () {
  const E = DT.engine, R = DT.render;
  const T0 = 1000000;
  const MATCH = { title: '测试', proMotion: '甲', conMotion: '乙', proTeam: '物理学院', conTeam: '化学院', proSeat: 'left' };
  const F = () => DT.BUILTIN_FORMATS.find(f => f.id === 'ustc-freshman-cup');
  const idx = name => F().stages.findIndex(s => s.name === name);
  const OPENING = '正方一辩开篇立论';   // pro, 3:00, warn bell at 0:30
  const REBUTTAL = '反方二辩驳论';      // con

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
  const px = s => parseFloat(s);

  // Every arc the painter strokes while `fn` runs: its centre, radius and the angle it turns through.
  function spyArcs(fn) {
    const P = CanvasRenderingContext2D.prototype;
    const arc = P.arc, clear = P.clearRect;
    const out = { arcs: [], clears: 0 };
    P.arc = function (x, y, r, a, b, ccw) {
      if (this.canvas.classList.contains('dt-canvas')) out.arcs.push({ x, y, r, span: Math.abs(b - a) });
      return arc.apply(this, arguments);
    };
    P.clearRect = function () {
      if (this.canvas.classList.contains('dt-canvas')) out.clears++;
      return clear.apply(this, arguments);
    };
    try { fn(); } finally { P.arc = arc; P.clearRect = clear; }
    return out;
  }
  const maxSpan = arcs => arcs.reduce((m, a) => Math.max(m, a.span), 0);
  const radii = arcs => new Set(arcs.map(a => a.r.toFixed(3))).size;

  function pixels(root) {
    const c = root.querySelector('.dt-canvas');
    return { data: c.getContext('2d').getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height };
  }
  function hash(data) {
    let a = 0x811c9dc5;
    for (let i = 0; i < data.length; i++) { a ^= data[i]; a = Math.imul(a, 0x01000193); }
    return a >>> 0;
  }
  // The light the trails put on one horizontal part of the canvas, per channel (weighted by alpha).
  function light(root, from, to) {
    const { data, w, h } = pixels(root);
    const sum = [0, 0, 0];
    for (let y = 0; y < h; y++) {
      for (let x = Math.floor(from * w); x < Math.floor(to * w); x++) {
        const i = (y * w + x) * 4, a = data[i + 3] / 255;
        sum[0] += data[i] * a; sum[1] += data[i + 1] * a; sum[2] += data[i + 2] * a;
      }
    }
    return sum;
  }

  DT.test('theme startrail: 星轨 is a dark theme with a canvas painter', () => {
    const meta = (DT.THEMES || []).find(t => t.id === 'startrail');
    assert.ok(meta, 'startrail is in DT.THEMES');
    assert.equal(meta.name, '星轨');
    assert.equal(meta.tone, 'dark');
    const spec = DT.themes.get('startrail');
    assert.ok(spec, 'startrail is registered');
    assert.equal(typeof spec.painter, 'function');
    const { stage, root } = mountSky(singleAt(OPENING, 60));
    const canvas = root.querySelector('.dt-canvas');
    assert.ok(canvas, 'the stage has a canvas');
    assert.equal(canvas.width, Math.round(960 * Math.min(window.devicePixelRatio || 1, 2)));
    stage.destroy();
  });

  // Spec §1.2: the only randomness is DT.themes.rng, so the same view gives the same pixels on every screen.
  DT.test('theme startrail: the same view paints the same sky, pixel for pixel', () => {
    const shot = view => {
      const { stage, root } = mountSky(view);
      const { data } = pixels(root);
      let lit = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 0) lit++;
      const h = hash(data);
      stage.destroy();
      return { h, lit };
    };
    const a = shot(singleAt(OPENING, 60)), b = shot(singleAt(OPENING, 60));
    assert.ok(a.lit > 2000, 'the trails are drawn: ' + a.lit + ' lit pixels');
    assert.equal(a.h, b.h);
    assert.ok(shot(singleAt(REBUTTAL, 60)).h !== a.h, 'another side speaking paints another sky');
  });

  // Spec §2.2: the time used is the arc length; before the clock starts every star is a point.
  DT.test('theme startrail: the trails lengthen with the time used, from points', () => {
    const span = view => {
      let s;
      const spy = spyArcs(() => { s = mountSky(view); });
      s.stage.destroy();
      return maxSpan(spy.arcs);
    };
    const idle = span(E.view(session(OPENING), T0));
    const early = span(singleAt(OPENING, 18)), late = span(singleAt(OPENING, 162));
    assert.ok(idle > 0 && idle < 0.01, 'points before the clock runs: ' + idle);
    assert.ok(early > idle && late > 5 * early, 'longer as time is used: ' + early + ' then ' + late);
    const over = span(singleAt(OPENING, 200));
    assert.ok(over > span(singleAt(OPENING, 180)), 'and on into overtime: ' + over);
  });

  // Spec §2.2: only what changed is drawn. A frame adds the trails' growth since the last one; a stopped clock draws
  // nothing; going back to the start of a stage paints the sky again.
  DT.test('theme startrail: a frame draws only the growth of the trails, and nothing while the clock stands', () => {
    let now = 50000;
    DT.clock.set(() => now);
    try {
      let s;
      const first = spyArcs(() => { s = mountSky(singleAt(OPENING, 60)); });
      assert.ok(first.clears >= 1 && first.arcs.length > 100, 'the first frame paints the sky');
      const full = maxSpan(first.arcs);
      now += 40;
      const grow = spyArcs(() => s.stage.update(singleAt(OPENING, 64)));
      assert.equal(grow.clears, 0, 'nothing is wiped');
      assert.ok(grow.arcs.length > 100, 'every trail grows: ' + grow.arcs.length);
      assert.ok(maxSpan(grow.arcs) < full * 0.1, 'by the new piece only: ' + maxSpan(grow.arcs) + ' of ' + full);
      now += 40;
      const still = spyArcs(() => s.stage.update(singleAt(OPENING, 64)));
      assert.equal(still.arcs.length + still.clears, 0, 'a paused clock draws nothing');
      now += 40;
      const back = spyArcs(() => s.stage.update(singleAt(OPENING, 5)));
      assert.ok(back.clears >= 1 && maxSpan(back.arcs) < full, 'restarted: the shorter sky is painted afresh');
      s.stage.destroy();
    } finally { DT.clock.reset(); }
  });

  DT.test('theme startrail: no more than 600 stars on a projector, fewer on a small stage', () => {
    const count = (view, w, h) => {
      let s;
      const spy = spyArcs(() => { s = mountSky(view, w, h); });
      s.stage.destroy();
      return radii(spy.arcs);
    };
    const big = count(singleAt(OPENING, 60), 1920, 1080);
    assert.ok(big >= 300 && big <= 600, 'single stage at 1920×1080: ' + big);
    const dual = count(dualAt(30), 1920, 1080);
    assert.ok(dual >= 300 && dual <= 600, 'free debate at 1920×1080: ' + dual);
    const small = count(singleAt(OPENING, 60), 240, 135);
    assert.ok(small > 20 && small < big / 3, 'a thumbnail: ' + small);
  });

  // Spec §2.2: the pole is off screen at a corner: the speaking side's upper corner.
  DT.test('theme startrail: the stars turn about a pole off the speaking side\'s upper corner', () => {
    [[OPENING, 'left', 'left'], [OPENING, 'right', 'right'], [REBUTTAL, 'left', 'right'], [REBUTTAL, 'right', 'left']].forEach(([name, seat, corner]) => {
      let s;
      const spy = spyArcs(() => { s = mountSky(singleAt(name, 60, seat)); });
      const where = name + ' / ' + seat;
      const xs = new Set(spy.arcs.map(a => a.x.toFixed(2))), ys = new Set(spy.arcs.map(a => a.y.toFixed(2)));
      assert.equal(xs.size, 1, where + ': one pole');
      assert.equal(ys.size, 1, where);
      const x = spy.arcs[0].x, y = spy.arcs[0].y;
      assert.ok(y < 0, where + ': above the screen ' + y);
      assert.ok(corner === 'left' ? x < 0 : x > 960, where + ': beyond the ' + corner + ' edge ' + x);
      s.stage.destroy();
    });
  });

  // Spec §2.2: the speaking side's half of the sky leans to its colour temperature: 正方 warm, 反方 cold.
  DT.test('theme startrail: the speaking side\'s trails take its colour temperature', () => {
    [[OPENING, 'left', 0], [OPENING, 'right', 0.5], [REBUTTAL, 'left', 0.5], [REBUTTAL, 'right', 0]].forEach(([name, seat, from]) => {
      const { stage, root } = mountSky(singleAt(name, 120, seat));
      const [r, , b] = light(root, from, from + 0.5);
      const where = name + ' / ' + seat + ': r ' + Math.round(r) + ' b ' + Math.round(b);
      if (name === OPENING) assert.ok(r > b * 1.08, where);
      else assert.ok(b > r * 1.15, where);
      stage.destroy();
    });
  });

  // Spec §1.5 and §2.2: the whole room is the speaking side's, so the cast reaches across the sky, not only the pole's
  // half; and 反方's cold sky is plainly colder than the neutral sky of a break, not a near neighbour of it.
  DT.test('theme startrail: the whole sky leans warm for 正方 and cold for 反方', () => {
    const ratio = (view, from, to) => {
      const { stage, root } = mountSky(view);
      const [r, , b] = light(root, from, to);
      stage.destroy();
      return b / r;
    };
    const neutral = ratio(singleAt('评委打分', 60), 0, 1);
    [[OPENING, 'left', 0.5], [OPENING, 'right', 0], [REBUTTAL, 'left', 0], [REBUTTAL, 'right', 0.5]].forEach(([name, seat, far]) => {
      const farSide = ratio(singleAt(name, 120, seat), far, far + 0.5), whole = ratio(singleAt(name, 120, seat), 0, 1);
      const where = name + ' / ' + seat + ': far half b/r ' + farSide.toFixed(3) + ', whole ' + whole.toFixed(3) +
        ', neutral ' + neutral.toFixed(3);
      if (name === OPENING) {
        assert.ok(farSide < 0.8, where);
        assert.ok(whole < neutral * 0.75, where);
      } else {
        assert.ok(farSide > 1.25, where);
        assert.ok(whole > neutral * 1.3, where);
      }
    });
  });

  // Spec §2.2: in free debate a pole sits in each side's outer corner; only the speaking side's trails turn.
  DT.test('theme startrail: free debate has a pole for each side, and only the speaker\'s sky turns', () => {
    let now = 80000;
    DT.clock.set(() => now);
    try {
      ['left', 'right'].forEach(seat => {
        let s;
        const first = spyArcs(() => { s = mountSky(dualAt(40, seat)); });
        const xs = Array.from(new Set(first.arcs.map(a => a.x))).sort((a, b) => a - b);
        assert.equal(xs.length, 2, seat + ': two poles');
        assert.ok(xs[0] < 0 && xs[1] > 960, seat + ': one beyond each edge ' + xs.join(', '));
        now += 40;
        const grow = spyArcs(() => s.stage.update(dualAt(44, seat)));
        const conPole = seat === 'left' ? xs[1] : xs[0];   // con, who holds the floor, sits opposite pro
        assert.ok(grow.arcs.length > 50, seat + ': the speaking side\'s trails grow');
        assert.ok(grow.arcs.every(a => a.x === conPole), seat + ': only around con\'s pole');
        s.stage.destroy();
      });
    } finally { DT.clock.reset(); }
  });

  DT.test('theme startrail: a thumbnail paints its sky in one frame', () => {
    const spec = DT.themes.get('startrail');
    const factory = spec.painter;
    let frames = 0;
    spec.painter = (canvas, ctx, flags) => {
      const p = factory(canvas, ctx, flags);
      return { frame(v, now) { frames++; return p.frame(v, now); }, resize: (w, h) => p.resize(w, h), destroy: () => p.destroy() };
    };
    let now = 0;
    DT.clock.set(() => now);
    try {
      const { stage, root } = mountSky(singleAt(OPENING, 72), 320, 180, { thumbnail: true });
      now += 100; stage.update(singleAt(OPENING, 73));
      now += 100; stage.update(singleAt(OPENING, 74));
      assert.equal(frames, 1);
      let lit = 0;
      const { data } = pixels(root);
      for (let i = 3; i < data.length; i += 4) if (data[i] > 0) lit++;
      assert.ok(lit > 200, 'the one frame has trails: ' + lit);
      stage.destroy();
    } finally { spec.painter = factory; DT.clock.reset(); }
  });

  // Spec §2.2: no flat field: a translucent nebula glow on the speaking side, fading as its time runs out, and still
  // there in overtime so the room sees whose floor it is (spec §1.5).
  DT.test('theme startrail: the field is a nebula glow at the speaking seat that fades with the time left', () => {
    const glow = (secs, name, seat) => {
      const { stage, root } = mountSky(singleAt(name || OPENING, secs, seat));
      root.classList.remove('is-entering');
      const cs = getComputedStyle(root.querySelector('.dt-field'));
      const out = { opacity: px(cs.opacity), image: cs.backgroundImage, clip: cs.clipPath, color: cs.backgroundColor };
      stage.destroy();
      return out;
    };
    const early = glow(10), late = glow(150), low = glow(170), over = glow(200);
    assert.ok(/radial-gradient/.test(early.image), early.image);
    assert.equal(early.color, 'rgba(0, 0, 0, 0)', 'no flat colour');
    assert.ok(['none', 'inset(0px)'].indexOf(early.clip) >= 0, 'not cut back: ' + early.clip);
    assert.ok(early.opacity > late.opacity + 0.3, early.opacity + ' then ' + late.opacity);
    // It fades, but never so far that the speaker's side is lost once the clock is low or over (spec §1.5).
    assert.ok(low.opacity >= 0.55, 'a low clock keeps a strong glow: ' + low.opacity);
    assert.ok(over.opacity >= 0.55, 'overtime keeps a strong glow: ' + over.opacity);
    [[OPENING, 'left', '0%'], [OPENING, 'right', '100%'], [REBUTTAL, 'left', '100%'], [REBUTTAL, 'right', '0%']].forEach(([name, seat, x]) => {
      const g = glow(60, name, seat);
      assert.ok(g.image.indexOf(' at ' + x + ' ') >= 0, name + ' / ' + seat + ': ' + g.image);
      assert.ok(['none', 'inset(0px)'].indexOf(g.clip) >= 0, name + ' / ' + seat + ': not cut back: ' + g.clip);
    });
  });

  // Even in overtime, with the glow at its floor, the bottom third of the room says whose floor it is: the haze over
  // the horizon takes the speaking side's colour. A break keeps the town's warm haze.
  DT.test('theme startrail: the horizon haze is the speaking side\'s colour, the town\'s on a break', () => {
    const haze = view => {
      const { stage, root } = mountSky(view);
      const img = getComputedStyle(root.querySelector('.dt-backdrop')).backgroundImage;
      stage.destroy();
      return img.split('radial-gradient(')[1] || img;
    };
    const PRO = 'rgba(214, 90, 124, 0.3)', CON = 'rgba(58, 160, 200, 0.3)', TOWN = 'rgba(236, 150, 96, 0.24)';
    [['left'], ['right']].forEach(([seat]) => {
      let h = haze(singleAt(OPENING, 200, seat));
      assert.ok(h.indexOf(PRO) >= 0, 'pro in overtime / ' + seat + ': ' + h);
      h = haze(singleAt(REBUTTAL, 200, seat));
      assert.ok(h.indexOf(CON) >= 0, 'con in overtime / ' + seat + ': ' + h);
      h = haze(dualAt(30, seat));
      assert.ok(h.indexOf(CON) >= 0, 'free debate, con holding the floor / ' + seat + ': ' + h);
    });
    const h = haze(singleAt('评委打分', 60));
    assert.ok(h.indexOf(TOWN) >= 0, 'break: ' + h);
  });

  DT.test('theme startrail: the digits are starlight white with a faint glow, one layer on and off the glow', () => {
    const { stage, root } = mountSky(singleAt(OPENING, 60));
    const clock = root.querySelector('.dt-clock[data-clock="main"]');
    assert.equal(resolve(root, '--digits-on-field'), resolve(root, '--ink'));
    assert.equal(resolve(root, '--digits-off-field'), resolve(root, '--ink'));
    const shadow = getComputedStyle(clock.querySelector('.dt-digits')).textShadow;
    assert.ok(shadow !== 'none', 'a glow: ' + shadow);
    stage.destroy();
    // One colour, so one layer: two clipped layers would meet in a seam of their blooms across a digit.
    [singleAt(OPENING, 60), singleAt(OPENING, 60, 'right'), singleAt(REBUTTAL, 60), singleAt(REBUTTAL, 60, 'right'), dualAt(30)].forEach(view => {
      const s = mountSky(view);
      s.root.querySelectorAll('.dt-clock').forEach(c => {
        if (getComputedStyle(c).display === 'none') return;
        const where = s.root.dataset.kind + ' ' + s.root.dataset.side + ' ' + s.root.dataset.proSeat + ' ' + c.dataset.clock;
        assert.equal(getComputedStyle(c.querySelector('.dt-digits-on')).display, 'none', where);
        assert.equal(getComputedStyle(c.querySelector('.dt-digits')).clipPath, 'none', where);
      });
      s.stage.destroy();
    });
  });

  // Spec §1.5: overtime shows: the digits turn a bright star's gold (stage.css), on the sky and on the glow alike.
  DT.test('theme startrail: in overtime the digits turn gold', () => {
    const { stage, root } = mountSky(singleAt(OPENING, 200));
    assert.equal(root.dataset.phase, 'over');
    const d = root.querySelector('.dt-clock[data-clock="main"] .dt-digits');
    d.style.transition = 'none';   // read the colour it settles on, not the first frame of its fade
    assert.equal(getComputedStyle(d).color, resolve(root, '--accent'));
    stage.destroy();
  });

  // The warn point needs something to be reached by: a thin exposure line under the digits runs from the speaking
  // seat as far as the time left (where hall's field edge would be), and the warn point is a gold star on it.
  DT.test('theme startrail: the time left is a line of light, and the warn bell point a gold star on it', () => {
    [[OPENING, 'left', 'left'], [OPENING, 'right', 'right'], [REBUTTAL, 'left', 'right'], [REBUTTAL, 'right', 'left']].forEach(([name, seat, from]) => {
      const { stage, root } = mountSky(singleAt(name, 60, seat));
      const where = name + ' / ' + seat;
      const box = root.getBoundingClientRect();
      const line = getComputedStyle(root.querySelector('.dt-deco'), '::before');
      assert.ok(line.content !== 'none' && line.display !== 'none', where + ': the line shows');
      const total = name === OPENING ? 180 : 120;
      assert.near(px(line.width), (1 - 60 / total) * box.width, 1.5, where + ': as long as the time left');
      assert.equal(from === 'left' ? line.left : line.right, '0px', where + ': from the seat');
      const star = root.querySelector('.dt-warnline');
      const cs = getComputedStyle(star);
      assert.ok(!star.hidden && /polygon/.test(cs.clipPath), where + ': a star, not a hairline ' + cs.clipPath);
      assert.equal(cs.backgroundColor, resolve(root, '--accent'));
      const r = star.getBoundingClientRect();
      assert.near(r.top + r.height / 2 - box.top, px(line.top) + px(line.height) / 2, 1.5, where + ': on the line');
      const at = (r.left + r.width / 2 - box.left) / box.width;
      assert.near(from === 'left' ? at : 1 - at, 30 / total, 0.01, where + ': at the warn point');
      stage.destroy();
    });
  });

  // Spec §2.2: crossing the warn point sends one meteor over the digits (the renderer's warn ring, restyled); the
  // renderer sends no ring under reduced motion. The end bell's rings stay rings.
  DT.test('theme startrail: the warn bell sends a meteor over the digits; the end bell keeps its ring', () => {
    const warn = mountSky(singleAt(OPENING, 152));
    assert.equal(warn.root.dataset.phase, 'warn');
    warn.stage.pulse({ type: 'warn', clock: 'main' });
    const meteor = warn.root.querySelector('.dt-ring');
    assert.ok(meteor, 'the warn bell makes its ring');
    assert.equal(getComputedStyle(meteor).animationName, 'dt-startrail-meteor');
    const cs = getComputedStyle(meteor);
    assert.ok(px(cs.width) > 4 * px(cs.height), 'a streak: ' + cs.width + ' × ' + cs.height);
    warn.stage.destroy();
    const over = mountSky(singleAt(OPENING, 181));
    over.stage.pulse({ type: 'end', clock: 'main' });
    assert.equal(getComputedStyle(over.root.querySelector('.dt-ring')).animationName, 'dt-ring');
    over.stage.destroy();
  });

  DT.test('theme startrail: in free debate the sky shows through both halves, each with its own glow', () => {
    const { stage, root } = mountSky(dualAt(30));
    root.querySelectorAll('.dt-half').forEach(h => {
      assert.equal(getComputedStyle(h).backgroundColor, 'rgba(0, 0, 0, 0)', h.dataset.side);
      const f = getComputedStyle(h.querySelector('.dt-half-field'));
      assert.ok(/radial-gradient/.test(f.backgroundImage), h.dataset.side + ': ' + f.backgroundImage);
      assert.ok(px(f.opacity) > 0, h.dataset.side);
    });
    stage.destroy();
    // Pro has 10 s left of its 4:00: its glow has faded but still says whose floor it is.
    const low = mountSky(E.view(E.tick(E.floor(session('自由辩论'), 'pro', T0), T0 + 230000).session, T0 + 230000));
    const lowPro = low.root.querySelector('.dt-half[data-side="pro"]');
    assert.ok(!lowPro.hasAttribute('data-locked'), 'pro still has time');
    const lowOpacity = px(getComputedStyle(lowPro.querySelector('.dt-half-field')).opacity);
    assert.ok(lowOpacity >= 0.5, 'a half nearly out of time keeps its glow: ' + lowOpacity);
    low.stage.destroy();
    // Pro speaks until its 4:00 run out and is locked; con holds the floor.
    const s = E.tick(E.floor(session('自由辩论'), 'pro', T0), T0 + 245000).session;
    const locked = mountSky(E.view(s, T0 + 250000));
    const pro = locked.root.querySelector('.dt-half[data-side="pro"]');
    assert.ok(pro.hasAttribute('data-locked'), 'pro is out of time');
    assert.equal(getComputedStyle(pro.querySelector('.dt-half-field')).opacity, '0', 'a side out of time has no glow');
    locked.stage.destroy();
  });
})();
