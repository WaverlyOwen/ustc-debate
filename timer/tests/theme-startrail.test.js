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
  // The page's CSS clock does not run here: the divider's transition is seated by hand. `settle` lands it (mounting
  // springs the columns from 50/50: render.js measures the stage for the painter before it writes them); `seat` puts
  // it `ms` in, as a frame that long after the change of floor would find it.
  const halvesOf = root => root.querySelector('.dt-halves');
  const settle = root => halvesOf(root).getAnimations().forEach(a => a.finish());
  const seat = (root, ms) => halvesOf(root).getAnimations().forEach(a => { a.currentTime = ms; });

  // Every arc the painter strokes while `fn` runs: its centre, radius and the angle it turns through, and whether it
  // went onto the stage's canvas or onto one of free debate's per-side layers; and the stage canvas's clears and
  // drawImage copies.
  function spyArcs(fn) {
    const P = CanvasRenderingContext2D.prototype;
    const arc = P.arc, clear = P.clearRect, copy = P.drawImage;
    const out = { arcs: [], clears: 0, copies: 0, stageArcs: 0, strips: [] };
    const mine = c => c.classList.contains('dt-canvas') || c.classList.contains('dt-canvas-layer');
    P.arc = function (x, y, r, a, b, ccw) {
      if (mine(this.canvas)) out.arcs.push({ x, y, r, span: Math.abs(b - a), layer: this.canvas.classList.contains('dt-canvas-layer') });
      if (this.canvas.classList.contains('dt-canvas')) out.stageArcs++;
      return arc.apply(this, arguments);
    };
    P.clearRect = function () {
      if (this.canvas.classList.contains('dt-canvas')) out.clears++;
      return clear.apply(this, arguments);
    };
    P.drawImage = function () {
      if (this.canvas.classList.contains('dt-canvas')) { out.copies++; out.strips.push(arguments.length === 9 ? { x: arguments[5], w: arguments[3] } : null); }
      return copy.apply(this, arguments);
    };
    try { fn(); } finally { P.arc = arc; P.clearRect = clear; P.drawImage = copy; }
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

  // Spec §2.2: no more than 600 stars. Spec §1.2: the projector and the console's preview show one picture, so a
  // stage of any size has the same stars in the same places (in stage proportions); only a thumbnail, a small still,
  // has fewer.
  DT.test('theme startrail: the same stars on the projector and the console preview, fewer on a thumbnail', () => {
    const sky = (view, w, h, opts) => {
      let s;
      const spy = spyArcs(() => { s = mountSky(view, w, h, opts); });
      s.stage.destroy();
      const rs = Array.from(new Set(spy.arcs.map(a => a.r / w))).sort((a, b) => a - b);
      return rs;
    };
    const big = sky(singleAt(OPENING, 60), 1920, 1080);
    assert.ok(big.length >= 300 && big.length <= 600, 'single stage at 1920×1080: ' + big.length);
    const preview = sky(singleAt(OPENING, 60), 704, 396);
    assert.equal(preview.length, big.length, 'the console preview has the same stars');
    assert.ok(preview.every((r, i) => Math.abs(r - big[i]) < 1e-6), 'at the same places in the stage');
    const laptop = sky(singleAt(OPENING, 60), 1366, 768);
    assert.equal(laptop.length, big.length, 'and so does a 1366×768 projector');
    const dual = sky(dualAt(30), 1920, 1080);
    assert.ok(dual.length >= 300 && dual.length <= 600, 'free debate at 1920×1080: ' + dual.length);
    const thumb = sky(singleAt(OPENING, 60), 240, 135, { thumbnail: true });
    assert.ok(thumb.length > 20 && thumb.length < big.length / 3, 'a thumbnail: ' + thumb.length);
  });

  // The same stars on a smaller stage would add up to more light per pixel; they are dimmed to match, so the preview
  // looks like the projector rather than a brighter, denser sky.
  DT.test('theme startrail: a smaller stage with the same stars is no brighter for it', () => {
    const glow = (w, h) => {
      const { stage, root } = mountSky(singleAt(OPENING, 120), w, h);
      const { data } = pixels(root);
      let sum = 0;
      for (let i = 3; i < data.length; i += 4) sum += data[i];
      stage.destroy();
      return sum / (data.length / 4);
    };
    const big = glow(1920, 1080), small = glow(704, 396);
    assert.ok(small < big * 1.5 && small > big * 0.6, 'mean light per pixel: ' + big.toFixed(2) + ' on the projector, ' + small.toFixed(2) + ' on the preview');
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
        assert.ok(grow.stageArcs > 50, seat + ': the speaking side\'s trails grow on the stage');
        assert.ok(grow.arcs.every(a => a.x === conPole), seat + ': only around con\'s pole');
        assert.equal(grow.clears + grow.copies, 0, seat + ': by their growth alone');
        s.stage.destroy();
      });
    } finally { DT.clock.reset(); }
  });

  // New spec §5.6: a frame under 8 ms. A change of floor springs the two columns over 520 ms; painting every trail
  // again would cost more the longer the free debate has run. Each side's trails are kept on a canvas of their own,
  // and the seam between the two skies goes with the columns frame by frame (audit ST4): each frame copies only the
  // strip the seam crossed since the last, no trail is drawn on the stage again, early or late, and once the spring is
  // over nothing is copied.
  DT.test('theme startrail: a change of floor moves the seam with the columns, a strip at a time from each side\'s layer', () => {
    let now = 90000;
    DT.clock.set(() => now);
    const E2 = DT.engine;
    try {
      [20, 200].forEach(late => {
        let s = E2.floor(session('自由辩论'), 'pro', T0);
        s = E2.floor(s, 'con', T0 + 10000);
        const at = T0 + late * 1000;
        let m;
        spyArcs(() => { m = mountSky(E2.view(s, at), 1920, 1080); });
        settle(m.root);
        now += 40;
        m.stage.update(E2.view(s, at));
        const cw = m.root.querySelector('.dt-canvas').width, move = (2 * 0.58 - 1) * cw;
        now += 40;
        const switched = E2.floor(s, 'pro', at);
        const first = spyArcs(() => m.stage.update(E2.view(switched, at)));
        assert.equal(first.stageArcs, 0, late + ' s: nothing drawn again on the stage');
        assert.equal(first.clears, 0, late + ' s: the rest of the stage stays as it is');
        // The columns' spring is at its start on the frame they are written, so the seam may not have moved yet.
        assert.ok(first.copies <= 2, late + ' s: at most a strip from each layer: ' + first.copies);
        const width = list => list.strips.reduce((a, st) => a + (st ? st.w : 0), 0);
        assert.ok(width(first) < move / 3, late + ' s: the seam does not jump to where the columns will end: ' + width(first) + ' of ' + move);
        let frames = 1, crossed = width(first);
        for (let ms = 40; ms <= 600; ms += 40) {
          now += 40;
          seat(m.root, ms);
          const spy = spyArcs(() => m.stage.update(E2.view(switched, at + ms)));
          const where = late + ' s, +' + ms + ' ms';
          assert.equal(spy.clears, 0, where + ': nothing is wiped');
          assert.ok(spy.copies <= 2, where + ': a strip at most from each layer: ' + spy.copies);
          assert.ok(maxSpan(spy.arcs) < 0.05, where + ': only the trails\' growth is drawn: ' + maxSpan(spy.arcs));
          if (spy.copies) { frames++; crossed += width(spy); }
        }
        assert.ok(frames >= 8, late + ' s: the seam moves over the spring, a frame at a time: ' + frames + ' frames');
        assert.ok(crossed >= move, late + ' s: all the way: ' + crossed + ' of ' + move);
        now += 40;
        const after = spyArcs(() => m.stage.update(E2.view(switched, at + 2000)));
        assert.ok(after.stageArcs > 20 && after.copies === 0, late + ' s: then the speaker\'s trails grow on the stage again');
        m.stage.destroy();
      });
    } finally { DT.clock.reset(); }
  });

  // Audit ST4: the seam between the two skies is under the divider at every frame the painter draws, as the columns
  // settle when the stage mounts, through the spring of a change of floor, and through the shortened spring of a floor
  // sent straight back: the painter reads the divider while the columns move, rather than reckoning the spring from
  // the clock (a new transition starts on the frame after the columns are written, and the projector learns of a
  // change of floor later than the console does).
  DT.test('theme startrail: the seam between the two skies stays under the divider through its spring', () => {
    let now = 90000;
    DT.clock.set(() => now);
    const E2 = DT.engine;
    // Where the seam stands after an update: the copy from the right-hand layer starts at it.
    const seamAt = spy => { const xs = spy.strips.filter(Boolean).map(st => st.x); return xs.length ? Math.max.apply(null, xs) : null; };
    try {
      let s = E2.floor(session('自由辩论'), 'pro', T0);
      s = E2.floor(s, 'con', T0 + 10000);   // con holds the floor; pro sits on the left
      const at = T0 + 30000;
      let m;
      const mounted = spyArcs(() => { m = mountSky(E2.view(s, at), 1920, 1080); });
      const halves = halvesOf(m.root);
      const ratio = m.root.querySelector('.dt-canvas').width / m.root.getBoundingClientRect().width;
      const css = () => parseFloat(getComputedStyle(halves).gridTemplateColumns);   // the left column, CSS px
      let seam = seamAt(mounted) / ratio;
      const check = where => assert.near(seam, css(), 2, where + ': the seam ' + seam.toFixed(1) + ' under the divider ' + css().toFixed(1));
      const frame = (view, ms, where) => {
        if (ms !== null) seat(m.root, ms);
        now += 40;
        const spy = spyArcs(() => m.stage.update(view));
        if (seamAt(spy) !== null) seam = seamAt(spy) / ratio;
        check(where);
        return spy;
      };
      check('mounted');
      frame(E2.view(s, at), 200, 'mounting, +200 ms');
      frame(E2.view(s, at), 1000, 'mounted and settled');
      assert.near(seam, 0.42 * 1920, 1, 'at rest where the columns end');
      // Pro takes the floor; the columns spring over 520 ms, with their overshoot.
      const s1 = E2.floor(s, 'pro', at);
      frame(E2.view(s1, at), null, 'the change of floor');
      let far = 0;
      for (let ms = 40; ms <= 640; ms += 40) { frame(E2.view(s1, at + ms), ms, '+' + ms + ' ms'); far = Math.max(far, seam); }
      assert.ok(far > 0.58 * 1920 + 5, 'past where the columns end, as the spring overshoots: ' + far.toFixed(1));
      assert.near(seam, 0.58 * 1920, 1, 'and back at rest where they end');
      // Con takes the floor again, and 120 ms into that spring pro takes it straight back: CSS runs the reversed
      // transition shortened, and the seam goes with it.
      const s2 = E2.floor(s1, 'con', at + 1000);
      frame(E2.view(s2, at + 1000), null, 'con again');
      seat(m.root, 120);
      const s3 = E2.floor(s2, 'pro', at + 1120);
      frame(E2.view(s3, at + 1120), null, 'sent straight back to pro');
      const back = halves.getAnimations()[0];
      const ms = back.effect.getTiming().duration;
      assert.ok(ms > 100 && ms < 500, 'the reversed transition is shortened: ' + ms + ' ms');
      for (let u = 40; u <= ms + 80; u += 40) frame(E2.view(s3, at + 1120 + u), u, 'back, +' + u + ' ms');
      const rest = spyArcs(() => { now += 40; m.stage.update(E2.view(s3, at + 1120 + ms + 200)); });
      assert.equal(rest.copies, 0, 'at rest nothing more is copied');
      m.stage.destroy();
    } finally { DT.clock.reset(); }
  });

  // What the stage shows after a change of floor is what painting the whole sky from nothing would show.
  DT.test('theme startrail: the sky after a change of floor matches the sky painted afresh', () => {
    let now = 90000;
    DT.clock.set(() => now);
    const E2 = DT.engine;
    try {
      let s = E2.floor(session('自由辩论'), 'pro', T0);
      s = E2.floor(s, 'con', T0 + 30000);
      const at = T0 + 60000;
      const m = mountSky(E2.view(s, at), 960, 540);
      settle(m.root);
      now += 40;
      const switched = E2.floor(s, 'pro', at);
      m.stage.update(E2.view(switched, at));
      now += 600;   // the seam has gone with the columns' spring to where they end
      settle(m.root);
      m.stage.update(E2.view(switched, at));
      const a = pixels(m.root);
      m.stage.destroy();
      const f = mountSky(E2.view(switched, at), 960, 540);
      settle(f.root);
      now += 40;
      f.stage.update(E2.view(switched, at));
      const b = pixels(f.root);
      f.stage.destroy();
      let diff = 0;
      for (let i = 0; i < a.data.length; i++) diff = Math.max(diff, Math.abs(a.data[i] - b.data[i]));
      let off = 0;
      for (let i = 0; i < a.data.length; i += 4) if (Math.abs(a.data[i + 3] - b.data[i + 3]) > 24) off++;
      assert.ok(off < a.data.length / 4 * 0.002, 'pixels that differ: ' + off + ' (largest step ' + diff + ')');
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
  // the horizon takes the speaking side's colour. A break keeps the town's warm haze. Three layers that stay on the
  // stage, one lit at a time, so a change of floor or of stage cross-fades them instead of the haze changing in a frame.
  const hazeLayers = root => [getComputedStyle(root.querySelector('.dt-backdrop'), '::before'),
    getComputedStyle(root.querySelector('.dt-backdrop'), '::after'), getComputedStyle(root, '::after')];
  DT.test('theme startrail: the horizon haze is the speaking side\'s colour, the town\'s on a break', () => {
    const haze = view => {
      const { stage, root } = mountSky(view);
      const layers = hazeLayers(root);
      const out = {
        lit: layers.filter(cs => cs.opacity === '1').map(cs => cs.backgroundImage),
        dark: layers.filter(cs => cs.opacity === '0').length,
        eased: layers.every(cs => cs.transitionProperty === 'opacity' && cs.transitionDuration === '0.52s'),
        sky: getComputedStyle(root.querySelector('.dt-backdrop')).backgroundImage,
      };
      stage.destroy();
      return out;
    };
    const PRO = 'rgba(214, 90, 124, 0.3)', CON = 'rgba(58, 160, 200, 0.3)', TOWN = 'rgba(236, 150, 96, 0.24)';
    const check = (view, colour, where) => {
      const h = haze(view);
      assert.ok(h.lit.length === 1 && h.dark === 2, where + ': one layer lit: ' + h.lit.join(' | '));
      assert.ok(h.lit[0].indexOf(colour) >= 0, where + ': ' + h.lit[0]);
      assert.ok(h.eased, where + ': the layers cross-fade over 520 ms');
      assert.ok(!/radial-gradient/.test(h.sky), where + ': the sky itself carries no haze: ' + h.sky);
    };
    ['left', 'right'].forEach(seat => {
      check(singleAt(OPENING, 200, seat), PRO, 'pro in overtime / ' + seat);
      check(singleAt(REBUTTAL, 200, seat), CON, 'con in overtime / ' + seat);
      check(dualAt(30, seat), CON, 'free debate, con holding the floor / ' + seat);
    });
    check(singleAt('评委打分', 60), TOWN, 'break');
  });

  DT.test('theme startrail: a change of floor cross-fades the haze instead of changing it in a frame', () => {
    const E2 = DT.engine;
    const s = E2.floor(session('自由辩论'), 'pro', T0);
    const m = mountSky(E2.view(s, T0 + 5000));
    const moving = () => m.root.getAnimations({ subtree: true }).filter(a => a.transitionProperty === 'opacity' &&
      a.effect && /::(before|after)/.test(a.effect.pseudoElement || '') && a.effect.target.matches('.dt-backdrop, .dt-stage'));
    assert.equal(moving().length, 0, 'nothing moves at mount');
    m.stage.update(E2.view(E2.floor(s, 'con', T0 + 5000), T0 + 5000));
    const fades = moving();
    assert.equal(fades.length, 2, 'the outgoing side\'s haze fades out as the incoming side\'s fades in');
    fades.forEach(a => assert.equal(a.effect.getTiming().duration, 520));
    m.stage.destroy();
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
  // The trails are densest near the pole, just where the top bar and the stage name are. The zenith is darkened well
  // down over that band, and the head's type carries a halo of night, so a trail crossing a stroke does not break it.
  DT.test('theme startrail: the head sits on a darkened zenith, its type haloed in night', () => {
    [singleAt(OPENING, 60), dualAt(30)].forEach(view => {
      const { stage, root } = mountSky(view, 1920, 1080);
      const where = root.dataset.kind;
      const deco = getComputedStyle(root.querySelector('.dt-deco')).backgroundImage;
      const zenith = /linear-gradient\(([^()]*(\([^()]*\))?)*\)\s*$/.exec(deco);
      assert.ok(zenith, where + ': a zenith gradient: ' + deco);
      const stops = zenith[0].match(/rgba?\([^)]*\)\s*[\d.]*(px|%)?/g) || [];
      const alpha = c => { const m = /,\s*([\d.]+)\)/.exec(c); return m ? Number(m[1]) : 1; };
      assert.ok(alpha(stops[0]) >= 0.7, where + ': dark at the top: ' + stops[0]);
      const held = stops.find(c => /px/.test(c) && alpha(c) >= 0.65);
      assert.ok(held && parseFloat(/([\d.]+)px/.exec(held)[1]) >= 0.2 * 1080, where + ': and still dark 20% of the way down: ' + stops.join(' | '));
      const head = root.querySelector('.dt-head').getBoundingClientRect();
      assert.ok(head.bottom <= 0.36 * 1080 + 1 || where === 'dual', where + ': the head is within the darkened band');
      ['.dt-title', '.dt-speaker', '.dt-top'].forEach(sel => {
        assert.ok(/rgba?\(7, 10, 34/.test(getComputedStyle(root.querySelector(sel)).textShadow), where + ' ' + sel + ': ' + getComputedStyle(root.querySelector(sel)).textShadow);
      });
      stage.destroy();
    });
  });

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
  // renderer sends no ring under reduced motion. The end bell's rings stay rings. The meteor is chosen by the bell that
  // rang, not by the phase: in free debate a side runs out while the new speaker's clock may read warn.
  DT.test('theme startrail: the warn bell sends a meteor over the digits; the end bell flares under them', () => {
    const warn = mountSky(singleAt(OPENING, 152));
    assert.equal(warn.root.dataset.phase, 'warn');
    warn.stage.pulse({ type: 'warn', clock: 'main' });
    const meteor = warn.root.querySelector('.dt-ring');
    assert.ok(meteor, 'the warn bell makes its ring');
    assert.equal(meteor.dataset.type, 'warn');
    assert.equal(getComputedStyle(meteor).animationName, 'dt-startrail-meteor');
    const cs = getComputedStyle(meteor);
    assert.ok(px(cs.width) > 4 * px(cs.height), 'a streak: ' + cs.width + ' × ' + cs.height);
    // The end bell, even in the warn phase, is the digits' bloom flaring: a soft gold glow under them, not a circle.
    warn.stage.pulse({ type: 'end', clock: 'main' });
    const flare = getComputedStyle(warn.root.querySelector('.dt-ring[data-type="end"]'));
    assert.equal(flare.animationName, 'dt-startrail-flare', 'an end bell in the warn phase flares');
    assert.equal(flare.borderTopWidth, '0px', 'no hard circle');
    assert.ok(/radial-gradient/.test(flare.backgroundImage), 'a soft glow: ' + flare.backgroundImage);
    assert.equal(flare.zIndex, '-1', 'under the digits');
    warn.stage.destroy();
    // A free-debate side that runs out flares once (render.js), shorter, so it is dark again as the column has sprung.
    const dual = mountSky(dualAt(30));
    dual.stage.pulse({ type: 'end', clock: 'con' });
    const half = dual.root.querySelectorAll('.dt-half .dt-ring');
    assert.equal(half.length, 1, 'one flare in the half');
    assert.equal(getComputedStyle(half[0]).animationName, 'dt-startrail-flare');
    assert.equal(getComputedStyle(half[0]).animationDuration, '0.6s', 'over with the spring');
    dual.stage.destroy();
    const over = mountSky(singleAt(OPENING, 181));
    over.stage.pulse({ type: 'end', clock: 'main' });
    assert.equal(getComputedStyle(over.root.querySelector('.dt-ring')).animationName, 'dt-startrail-flare');
    over.stage.destroy();
  });

  // Read once the entrance is over: the glow blooms in from nothing (see the entrance test).
  DT.test('theme startrail: in free debate the sky shows through both halves, each with its own glow', () => {
    const { stage, root } = mountSky(dualAt(30));
    root.classList.remove('is-entering');
    root.querySelectorAll('.dt-half').forEach(h => {
      assert.equal(getComputedStyle(h).backgroundColor, 'rgba(0, 0, 0, 0)', h.dataset.side);
      const f = getComputedStyle(h.querySelector('.dt-half-field'));
      assert.ok(/radial-gradient/.test(f.backgroundImage), h.dataset.side + ': ' + f.backgroundImage);
      assert.ok(px(f.opacity) > 0, h.dataset.side);
    });
    stage.destroy();
    // Pro has 10 s left of its 4:00: its glow has faded but still says whose floor it is.
    const low = mountSky(E.view(E.tick(E.floor(session('自由辩论'), 'pro', T0), T0 + 230000).session, T0 + 230000));
    low.root.classList.remove('is-entering');
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
    // A stage that opens with a side already out shows it so: the glow does not fade once the entrance is over.
    locked.root.classList.remove('is-entering');
    assert.equal(getComputedStyle(pro.querySelector('.dt-half-field')).opacity, '0');
    assert.equal(pro.querySelector('.dt-half-field').getAnimations().length, 0, 'nothing fades at mount');
    locked.stage.destroy();
  });

  // Audit ST9: a side that runs out (or yields) lets its glow die with the columns' spring, rather than dropping from
  // its floor of .5 to nothing in one frame.
  DT.test('theme startrail: a side that runs out lets its glow die with the spring', () => {
    const s = E.floor(session('自由辩论'), 'pro', T0);
    const before = E.tick(s, T0 + 239000).session;   // pro has a second of its 4:00 left
    const m = mountSky(E.view(before, T0 + 239000));
    m.root.classList.remove('is-entering');
    const half = m.root.querySelector('.dt-half[data-side="pro"]'), field = half.querySelector('.dt-half-field');
    assert.ok(!half.hasAttribute('data-locked') && px(getComputedStyle(field).opacity) >= 0.5, 'pro still glows');
    m.stage.update(E.view(E.tick(before, T0 + 241000).session, T0 + 241000));
    assert.ok(half.hasAttribute('data-locked'), 'pro is out of time');
    const fade = field.getAnimations().find(a => a.transitionProperty === 'opacity');
    assert.ok(fade, 'the glow fades');
    assert.equal(fade.effect.getTiming().duration, 520, 'with the spring');
    m.stage.destroy();
  });

  // Audit ST5: each side's nebula is as wide as the speaking column and anchored at its seat, whether its side is
  // speaking, waiting or neither has started; the half cuts it. A change of floor moves only the cut, so the glow
  // neither stretches nor slides its filaments with the spring.
  DT.test('theme startrail: each side\'s nebula is a fixed part of the sky, cut by its half', () => {
    [dualAt(10), dualAt(30), dualAt(30, 'right'), E.view(session('自由辩论'), T0)].forEach(view => {
      const { stage, root } = mountSky(view);
      root.classList.remove('is-entering');
      const box = root.getBoundingClientRect();
      const halves = root.querySelectorAll('.dt-half');
      halves.forEach((h, i) => {
        const r = h.querySelector('.dt-half-field').getBoundingClientRect();
        const where = root.dataset.proSeat + ' seat, ' + h.dataset.side + (h.hasAttribute('data-active') ? ' speaking' : ' waiting');
        assert.near(r.width, 0.58 * box.width, 1, where + ': as wide as the speaking column');
        if (i === 0) assert.near(r.left, box.left, 1, where + ': from the left seat');
        else assert.near(r.right, box.right, 1, where + ': from the right seat');
      });
      stage.destroy();
    });
  });

  // Audit ST1, ST2, ST11: a new stage opens as an exposure. The nebula blooms out from its seat (no straight clip edge
  // through a soft glow), the sky's trails fade in once the painter has drawn them, the line of time comes out of the
  // seat; each lands on its live value, so a still shows it landed, and none of it runs once the entrance is over.
  DT.test('theme startrail: a new stage opens as an exposure, and lands where it stands', () => {
    const shot = (view, sel, pseudo) => {
      const { stage, root } = mountSky(view);
      const read = () => [].concat(sel).map(q => getComputedStyle(root.querySelector(q), q === '.dt-deco' ? '::before' : null));
      const entering = read().map(cs => ({ name: cs.animationName, fill: cs.animationFillMode, delay: cs.animationDelay, origin: cs.transformOrigin }));
      root.setAttribute('data-still', '');
      const still = read().map(cs => ({ opacity: cs.opacity, scale: cs.scale, translate: cs.translate }));
      root.removeAttribute('data-still');
      root.classList.remove('is-entering');
      const after = read().map(cs => cs.animationName);
      stage.destroy();
      return { entering, still, after };
    };
    const single = shot(singleAt(OPENING, 60), ['.dt-field', '.dt-canvas', '.dt-deco']);
    assert.equal(single.entering[0].name, 'dt-startrail-bloom', 'the glow blooms');
    assert.equal(single.entering[0].fill, 'backwards');
    assert.ok(/^0px /.test(single.entering[0].origin), 'from its seat: ' + single.entering[0].origin);
    assert.equal(single.entering[1].name, 'dt-fade-in', 'the sky fades in');
    assert.equal(single.entering[1].delay, '0.04s', 'once the painter has drawn it');
    assert.equal(single.entering[2].name, 'dt-startrail-draw', 'the line comes out of the seat');
    assert.near(px(single.still[0].opacity), 0.55 + 0.45 * (1 - 60 / 180), 0.01, 'a still: the glow at its live strength');
    assert.equal(single.still[0].scale, 'none');
    assert.equal(single.still[1].opacity, '1');
    assert.equal(single.still[2].translate, 'none');
    assert.deepEqual(single.after, ['none', 'none', 'none'], 'nothing runs once the entrance is over');
    const right = shot(singleAt(OPENING, 60, 'right'), '.dt-field');
    assert.ok(/^960px /.test(right.entering[0].origin), 'the right seat: ' + right.entering[0].origin);
    const dual = shot(dualAt(30), ['.dt-half:first-child .dt-half-field', '.dt-half:last-child .dt-half-field']);
    assert.deepEqual(dual.entering.map(a => a.name), ['dt-startrail-bloom', 'dt-startrail-bloom'], 'each half from its own seat');
    // From the seat's own edge: the glow is strong there, and a box scaled about a point inside it would draw its edge
    // as a straight line down the glow.
    assert.ok(/^0px /.test(dual.entering[0].origin), 'the left half from the left edge: ' + dual.entering[0].origin);
    assert.near(px(dual.entering[1].origin), 0.58 * 960, 1, 'the right half from the right edge: ' + dual.entering[1].origin);
    // The end card's sky fades in to its dimmed strength, never brighter first.
    const end = shot(E.view(E.goto(session(OPENING), F().stages.length, T0), T0), '.dt-canvas');
    assert.equal(end.entering[0].name, 'dt-fade-in');
    assert.equal(end.still[0].opacity, '0.5');
  });

  // Audit ST6: on the title and end cards each side's half-sky leans to its colour, and the two cross over in a band
  // about the middle instead of meeting in a seam.
  DT.test('theme startrail: on the title and end cards the two half-skies cross over, with no seam', () => {
    [E.view(session(OPENING), T0), E.view(E.goto(session(OPENING), -1, T0), T0), E.view(E.goto(session(OPENING), F().stages.length, T0), T0)].forEach(view => {
      if (view.mode === 'stage') return;
      const { stage, root } = mountSky(view, 1920, 1080);
      const cold = [0.42, 0.44, 0.46, 0.48, 0.5, 0.52, 0.54, 0.56].map(x => { const [r, , b] = light(root, x, x + 0.02); return b / r; });
      const steps = cold.slice(1).map((c, i) => Math.abs(c - cold[i]));
      const total = Math.abs(cold[cold.length - 1] - cold[0]);
      assert.ok(total > 0.1, view.mode + ': the two halves lean apart: ' + cold.map(c => c.toFixed(2)).join(' '));
      assert.ok(Math.max.apply(null, steps) < 0.5 * total, view.mode + ': no one step takes the change: ' + cold.map(c => c.toFixed(2)).join(' '));
      stage.destroy();
    });
  });
})();
