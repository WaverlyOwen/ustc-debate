(function () {
  const E = DT.engine, R = DT.render;
  const T0 = 1000000;
  const MATCH = { title: '测试', proMotion: '甲', conMotion: '乙', proTeam: '物理学院', conTeam: '化学院', proSeat: 'left' };
  const F = () => DT.BUILTIN_FORMATS.find(f => f.id === 'ustc-freshman-cup');
  const idx = name => F().stages.findIndex(s => s.name === name);
  const OPENING = '正方一辩开篇立论';        // pro, 3:00, warn bell at 0:30
  const CROSS = '反方四辩质询正方一辩';      // con, 2:00, right after it
  const CON_OPENING = '反方一辩开篇立论';    // con, 3:00
  const PRO = 'rgb(179, 38, 30)', CON = 'rgb(26, 78, 143)', GOLD = 'rgb(183, 121, 31)', INK = 'rgb(21, 23, 27)';
  const OCHRE = 'rgb(116, 75, 13)', PALE_GOLD = 'rgb(244, 215, 154)';

  function host() {
    const box = document.getElementById('sandbox');
    box.innerHTML = '<div class="dt-stage-host" style="width:960px;height:540px"></div>';
    return box.firstChild;
  }
  const root = () => document.querySelector('.dt-stage');
  const deco = () => root().querySelector('.dt-deco');
  const css = (el, prop, pseudo) => getComputedStyle(el, pseudo || null)[prop];
  const held = name => getComputedStyle(deco()).getPropertyValue(name).trim();
  const session = seat => E.createSession(F(), Object.assign({}, MATCH, { proSeat: seat || 'left' }), T0, { theme: 'daylight' });
  // Go to a stage at `at` and run it for `share` of its length, then pause: the view's time is when it paused.
  function used(s, name, share, at) {
    s = E.goto(s, idx(name), at);
    s = E.toggle(s, at);
    const end = at + F().stages[idx(name)].secs * 1000 * share;
    return [E.toggle(s, end), end];
  }
  // The left and right insets of a computed clip-path: inset(), as shares of the stage's width (1 or more: nothing shows).
  function sides(clip) {
    const m = /^inset\(([^)]*)\)$/.exec(clip);
    assert.ok(m, 'an inset(): ' + clip);
    const v = m[1].trim().split(/\s+/);
    const right = v[1] || v[0], left = v[3] || right;
    const share = x => /%$/.test(x) ? parseFloat(x) / 100 : parseFloat(x) / root().getBoundingClientRect().width;
    return { left: share(left), right: share(right) };
  }
  // The entrance over, and every transition run out (the colons breathe for ever, so animations are left alone).
  function settle() {
    root().classList.remove('is-entering');
    root().getAnimations({ subtree: true }).forEach(a => { if (a instanceof CSSTransition) a.finish(); });
  }
  // Any CSS colour (color-mix gives one in its own space) as the sRGB a canvas paints for it.
  const pen = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  function rgb(c) {
    pen.clearRect(0, 0, 1, 1); pen.fillStyle = c; pen.fillRect(0, 0, 1, 1);
    const d = pen.getImageData(0, 0, 1, 1).data;
    return 'rgb(' + d[0] + ', ' + d[1] + ', ' + d[2] + ')';
  }
  // Seat every transition running in the stage at `ms` into its run.
  function seat(ms) {
    root().getAnimations({ subtree: true }).forEach(a => { if (a instanceof CSSTransition) { a.pause(); a.currentTime = ms; } });
  }
  // The free debate: pro speaks first, con takes the floor at 20 s.
  const dual = () => { let s = E.floor(E.goto(session(), idx('自由辩论'), T0), 'pro', T0); return E.floor(s, 'con', T0 + 20000); };

  DT.test('theme daylight: the free debate dims the waiting half by colour, to the old filter\'s colours, with no filter', () => {
    const h = R.mount(host());
    h.update(E.view(dual(), T0 + 70000));
    settle();
    [root()].concat(Array.from(root().querySelectorAll('*'))).forEach(el =>
      assert.equal(css(el, 'filter'), 'none', (el.className || el.tagName) + ' is filtered'));
    const pro = root().querySelector('.dt-half[data-side="pro"]'), con = root().querySelector('.dt-half[data-side="con"]');
    assert.equal(rgb(css(pro.querySelector('.dt-half-field'), 'backgroundColor')), 'rgb(92, 42, 39)', 'the waiting band');
    assert.equal(rgb(css(con.querySelector('.dt-half-field'), 'backgroundColor')), CON, 'the speaking band');
    assert.equal(css(pro.querySelector('.dt-digits-on'), 'color'), 'rgb(191, 190, 188)');
    assert.equal(css(pro.querySelector('.dt-digits:not(.dt-digits-on)'), 'color'), 'rgb(17, 18, 19)');
    assert.equal(css(pro, 'backgroundColor'), css(root(), 'backgroundColor'), 'the light ground is not dimmed');
    assert.equal(rgb(css(pro, 'backgroundColor', '::before')), 'rgb(235, 201, 196)', 'nor the pale track');
    h.destroy();
  });

  // The band follows --dim frame by frame; the digits and the colon ease to their targets on the same 520 ms curve.
  DT.test('theme daylight: a floor switch dims the band, the digits and the colon together', () => {
    const h = R.mount(host());
    let s = dual();
    h.update(E.view(s, T0 + 70000));
    settle();
    s = E.floor(s, 'pro', T0 + 70000);
    h.update(E.view(s, T0 + 70000));
    const con = root().querySelector('.dt-half[data-side="con"]');
    const band = () => rgb(css(con.querySelector('.dt-half-field'), 'backgroundColor'));
    const on = con.querySelector('.dt-digits-on'), colon = on.querySelector('.dt-colon');
    seat(0);
    assert.equal(band(), CON, 'not dimmed at the first frame');
    [100, 260, 400].forEach(ms => {
      seat(ms);
      assert.ok(band() !== CON, ms + ' ms: the band is on its way');
      assert.equal(css(colon, 'color'), css(on, 'color'), ms + ' ms: the colon keeps up with the digits');
    });
    seat(520);
    assert.equal(band(), 'rgb(40, 58, 81)');
    assert.equal(css(on, 'color'), 'rgb(191, 190, 188)');
    h.destroy();
  });

  DT.test('theme daylight: the warn colon is 赭 off the band and pale gold on it, and dimmed with a waiting half', () => {
    const h = R.mount(host());
    h.update(E.view(E.toggle(E.goto(session(), idx(OPENING), T0), T0), T0 + 155000));
    settle();
    const clock = root().querySelector('.dt-clock[data-clock="main"]');
    assert.equal(clock.dataset.phase, 'warn');
    assert.equal(css(clock.querySelector('.dt-digits:not(.dt-digits-on) .dt-colon'), 'color'), OCHRE);
    assert.equal(css(clock.querySelector('.dt-digits-on .dt-colon'), 'color'), PALE_GOLD);
    let s = E.floor(E.goto(session(), idx('自由辩论'), T0), 'pro', T0);
    s = E.floor(s, 'con', T0 + 215000);   // pro is left with 25 s: in its warn, and waiting
    h.update(E.view(s, T0 + 216000));
    settle();
    const pro = root().querySelector('.dt-half[data-side="pro"] .dt-clock');
    assert.equal(pro.dataset.phase, 'warn');
    assert.equal(css(pro.querySelector('.dt-digits:not(.dt-digits-on) .dt-colon'), 'color'), 'rgb(75, 60, 39)');
    h.destroy();
  });

  // Overtime: the track turns gold at once under a cover of its pale colour that draws back to the far end; a still is the
  // gold track alone, and the digits and colon stay ink.
  DT.test('theme daylight: overtime runs gold back along the track from the seat', () => {
    ['left', 'right'].forEach(seatSide => {
      const h = R.mount(host());
      let s = E.toggle(E.goto(session(seatSide), idx(OPENING), T0), T0);
      h.update(E.view(s, T0 + 179000));
      settle();
      assert.equal(css(deco(), 'transitionProperty'), 'background-color');
      h.update(E.view(s, T0 + 181000));
      const clock = root().querySelector('.dt-clock[data-clock="main"]');
      assert.equal(clock.dataset.phase, 'over');
      assert.equal(css(deco(), 'backgroundColor'), GOLD, 'gold at once, under the cover');
      const cover = getComputedStyle(deco(), '::after');
      assert.equal(cover.animationName, 'dt-daylight-recede');
      assert.equal(cover.scale, '1', 'the first frame: all pale, as it was');
      root().getAnimations({ subtree: true }).filter(a => a.animationName === 'dt-daylight-recede').forEach(a => a.finish());
      assert.equal(getComputedStyle(deco(), '::after').scale, '0 1', 'the cover ends on nothing');
      assert.equal(cover.transformOrigin.split(' ')[0], seatSide === 'left' ? '960px' : '0px', seatSide + ': it draws back from the seat');
      settle();
      assert.equal(css(clock.querySelector('.dt-digits'), 'color'), INK);
      assert.equal(css(clock.querySelector('.dt-colon'), 'color'), INK, 'from 赭 to ink in 300 ms');
      h.destroy();
    });
  });

  // The band rings along its edges where there is one; a break keeps the ellipse.
  DT.test('theme daylight: a bell rings two lines out from the band\'s edges, clear of the head', () => {
    const h = R.mount(host());
    h.update(E.view(E.toggle(E.goto(session(), idx(OPENING), T0), T0), T0 + 151000));
    settle();
    h.pulse({ type: 'warn', clock: 'main' });
    const ring = root().querySelector('.dt-ring[data-type="warn"]');
    assert.equal(css(ring, 'animationName'), 'none');
    ['::before', '::after'].forEach(p => {
      assert.equal(css(ring, 'animationName', p), 'dt-daylight-ring', p);
      assert.equal(css(ring, 'backgroundColor', p), OCHRE, p);
    });
    const r = ring.getBoundingClientRect(), field = root().querySelector('.dt-field').getBoundingClientRect();
    assert.near(r.top, field.top, 1, 'the ring is the band');
    assert.near(r.height, field.height, 1);
    h.destroy();
    // The end bell's lines reach farthest; the long two-line name comes lowest. The top line, at the end of its run
    // (its keyframe, whatever --daylight-reach is), stays below the name.
    const longName = '正方一辩开篇立论，并就本方的定义、判准与论证义务作出完整的陈述和说明';
    const longF = Object.assign({}, F(), { stages: F().stages.map((st, i) => i === idx(OPENING) ? Object.assign({}, st, { name: longName }) : st) });
    [F(), longF].forEach(format => {
      const e = R.mount(host());
      const s = E.createSession(format, MATCH, T0, { theme: 'daylight' });
      e.update(E.view(E.toggle(E.goto(s, idx(OPENING), T0), T0), T0 + 179900));
      settle();
      const where = format === longF ? 'the long name' : 'the name';
      const head = root().querySelector('.dt-head').getBoundingClientRect();
      if (format === longF) {
        assert.equal(root().dataset.long, 'true', where);
        assert.ok(head.height > 2 * parseFloat(css(root().querySelector('.dt-title'), 'fontSize')), where + ': on two lines');
      }
      e.pulse({ type: 'end', clock: 'main' });
      const end = root().querySelector('.dt-ring[data-type="end"]');
      end.getAnimations({ subtree: true }).filter(a => a.effect.pseudoElement === '::before').forEach(a => a.finish());
      const line = getComputedStyle(end, '::before');
      const ty = new DOMMatrix(line.transform).f, top = end.getBoundingClientRect().top - parseFloat(line.height) / 2 + ty;
      assert.ok(ty < 0, where + ': the top line has travelled up: ' + ty);
      assert.ok(top > head.bottom, where + ': the farthest line (' + top + ') stays below the head (' + head.bottom + ')');
      e.destroy();
    });
    const b = R.mount(host());
    b.update(E.view(E.toggle(E.goto(session(), idx('评委打分'), T0), T0), T0 + 29000));
    root().classList.remove('is-entering');
    b.pulse({ type: 'end', clock: 'main' });
    const ellipse = root().querySelector('.dt-ring');
    assert.equal(css(ellipse, 'animationName'), 'dt-ring', 'a break has no band: the ellipse');
    assert.equal(css(ellipse, 'borderTopColor'), OCHRE);
    assert.equal(getComputedStyle(ellipse).getPropertyValue('--ring-to').trim(), '1.25');
    b.destroy();
  });

  DT.test('theme daylight: the track lights up and goes out with a single stage', () => {
    const h = R.mount(host());
    let s = E.goto(session(), idx('评委打分'), T0);
    h.update(E.view(s, T0));
    settle();
    assert.equal(css(deco(), 'backgroundColor'), 'rgba(0, 0, 0, 0)', 'a break shows no track');
    s = E.goto(s, idx('反方二辩驳论'), T0 + 1000);
    h.update(E.view(s, T0 + 1000));
    seat(0);
    assert.equal(css(deco(), 'backgroundColor'), 'rgba(0, 0, 0, 0)', 'it starts from the bare ground');
    seat(300);
    assert.equal(css(deco(), 'backgroundColor'), 'rgb(199, 214, 234)', 'and is lit in 300 ms');
    settle();
    s = E.goto(s, idx('正反方二辩对辩'), T0 + 2000);
    h.update(E.view(s, T0 + 2000));
    const tracks = root().querySelector('.dt-half').getAnimations({ subtree: true })
      .filter(a => a instanceof CSSTransition && a.transitionProperty === 'opacity' && a.effect.pseudoElement === '::before');
    assert.ok(tracks.length >= 1, 'the halves\' tracks fade in');
    h.destroy();
  });

  // The hold starts from the stage on screen because render.js enters before it writes the new stage (theme-hall pins it).
  DT.test('theme daylight: a new stage holds the band it replaces under its own while it enters', () => {
    const h = R.mount(host());
    const frame = v => { h.update(v); held('--daylight-was-r'); };
    let [s, at] = used(session('left'), OPENING, 0.4, T0);
    frame(E.view(s, at));
    settle();
    s = E.goto(s, idx(CROSS), at + 1000);
    frame(E.view(s, at + 1000));
    assert.equal(root().dataset.side, 'con');
    assert.near(parseFloat(held('--daylight-was-r')), 0.4, 0.001, 'the pro band as it stood');
    assert.equal(held('--daylight-was-band'), PRO);
    const old = getComputedStyle(deco(), '::before');
    assert.equal(old.display, 'block');
    assert.equal(old.animationName, 'dt-daylight-outgoing');
    root().classList.remove('is-entering');
    assert.equal(getComputedStyle(deco(), '::before').display, 'none');
    assert.equal(parseFloat(held('--daylight-was-r')), 0, 'the hold stops with the class');
    h.destroy();
    // Rapid changes: the stage just left, not the one before it.
    const g = R.mount(host());
    const frame2 = v => { g.update(v); held('--daylight-was-r'); };
    [s, at] = used(session('left'), OPENING, 0.4, T0);
    frame2(E.view(s, at));
    [s, at] = used(s, CROSS, 0.25, at + 100);
    frame2(E.view(s, at));
    assert.equal(held('--daylight-was-band'), PRO);
    s = E.goto(s, idx(CON_OPENING), at + 100);
    frame2(E.view(s, at + 100));
    assert.equal(held('--daylight-was-band'), CON, 'the con stage just left');
    assert.near(parseFloat(held('--daylight-was-l')), 0.25, 0.001);
    g.destroy();
  });

  // Back to a single stage that has used time (Z, ← or a goto) from a full band: only the part the new band will sweep
  // over is held; past its edge the track's own crossfade shows at once, so no ink digits stand on the old band.
  DT.test('theme daylight: back to a used stage, only the band the new one sweeps over is held', () => {
    ['left', 'right'].forEach(seat => {
      const h = R.mount(host());
      const frame = v => { h.update(v); held('--daylight-was-r'); };
      let [s, at] = used(session(seat), OPENING, 0.4, T0);
      frame(E.view(s, at));
      s = E.goto(s, idx(CROSS), at + 1000);   // con, not started: its band full
      frame(E.view(s, at + 1000));
      settle();
      s = E.goto(s, idx(OPENING), at + 2000);   // back: 40% of it used
      frame(E.view(s, at + 2000));
      const r = root();
      assert.ok(r.classList.contains('is-entering') && r.dataset.side === 'pro', seat);
      assert.near(parseFloat(r.style.getPropertyValue('--used')), 0.4, 0.001, seat + ': the stage kept its time');
      assert.equal(held('--daylight-was-band'), CON, seat + ': the full con band held');
      const old = getComputedStyle(deco(), '::before'), u = sides(old.clipPath);
      const want = seat === 'left' ? { left: 0, right: 0.4 } : { left: 0.4, right: 0 };
      assert.ok(Math.abs(u.left - want.left) < 1e-3 && Math.abs(u.right - want.right) < 1e-3, seat + ': only under the new band, ' + old.clipPath);
      assert.equal(old.display, 'block');
      assert.equal(old.animationName, 'dt-daylight-outgoing');
      h.destroy();
    });
    // Into a break no band comes: all of the held band goes out with the track.
    const h = R.mount(host());
    let [s, at] = used(session('left'), OPENING, 0.4, T0);
    h.update(E.view(s, at));
    settle();
    s = E.goto(s, idx('评委打分'), at + 1000);
    h.update(E.view(s, at + 1000));
    const old = getComputedStyle(deco(), '::before'), u = sides(old.clipPath);
    assert.ok(Math.abs(u.left) < 1e-3 && Math.abs(u.right - 0.4) < 1e-3, 'into a break, all of it: ' + old.clipPath);
    assert.equal(old.animationTimingFunction, 'cubic-bezier(0.2, 0.8, 0.2, 1)');
    h.destroy();
  });

  DT.test('theme daylight: 暂停 is ink, below the band on a single stage and below the track in a free debate', () => {
    const h = R.mount(host());
    let [s, at] = used(session('left'), OPENING, 0.4, T0);
    h.update(E.view(s, at));
    settle();
    const state = root().querySelector('.dt-clock[data-clock="main"] .dt-state');
    assert.equal(state.textContent, '暂停');
    assert.equal(css(state, 'color'), INK);
    assert.ok(state.getBoundingClientRect().top > root().querySelector('.dt-field').getBoundingClientRect().bottom);
    let d = E.floor(E.goto(session(), idx('自由辩论'), T0), 'pro', T0);
    d = E.pause(d, T0 + 30000);
    h.update(E.view(d, T0 + 30000));
    settle();
    const half = root().querySelector('.dt-half[data-side="pro"]');
    const ds = half.querySelector('.dt-state');
    assert.equal(ds.textContent, '暂停');
    assert.ok(ds.getBoundingClientRect().top > half.getBoundingClientRect().top + 0.69 * half.getBoundingClientRect().height - 1,
      'below the track');
    h.destroy();
  });

  DT.test('theme daylight: stills and thumbnails show no held band, and the overtime still is the gold track', () => {
    const url = window.location.href;
    let h = null;
    try {
      history.replaceState(null, '', window.location.pathname + '?demo=single&frozen=1');
      h = R.mount(host());
      let [s, at] = used(session('left'), OPENING, 0.4, T0);
      h.update(E.view(s, at));
      s = E.goto(s, idx(CROSS), at + 1000);
      h.update(E.view(s, at + 1000));
      assert.ok(root().hasAttribute('data-still'));
      assert.equal(getComputedStyle(deco(), '::before').display, 'none');
      assert.equal(css(deco(), 'backgroundColor'), 'rgb(199, 214, 234)', 'the track at once');
      // Overtime: the cover's from-only keyframe ends on its live scale (0), so the still is the gold track alone.
      h.update(E.view(E.toggle(E.goto(session('left'), idx(OPENING), T0), T0), T0 + 181000));
      assert.equal(root().querySelector('.dt-clock[data-clock="main"]').dataset.phase, 'over');
      assert.equal(css(deco(), 'backgroundColor'), GOLD, 'the gold track');
      assert.equal(getComputedStyle(deco(), '::after').scale, '0 1', 'and no cover over it');
      h.destroy(); h = null;
      history.replaceState(null, '', url);
      h = R.mount(host(), { thumbnail: true });
      h.update(E.view(E.goto(session('left'), idx(CON_OPENING), T0), T0));
      assert.equal(getComputedStyle(deco(), '::before').display, 'none', 'thumbnail');
    } finally {
      history.replaceState(null, '', url);
      if (h) h.destroy();
    }
  });
})();
