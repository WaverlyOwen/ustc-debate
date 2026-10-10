(function () {
  const E = DT.engine, R = DT.render;
  const T0 = 1000000;
  const MATCH = { title: '测试', proMotion: '甲', conMotion: '乙', proTeam: '物理学院', conTeam: '化学院', proSeat: 'left' };
  const F = () => DT.BUILTIN_FORMATS.find(f => f.id === 'ustc-freshman-cup');
  const idx = name => F().stages.findIndex(s => s.name === name);
  const OPENING = '正方一辩开篇立论';   // pro, 3:00, warn bell at 0:30
  const REBUTTAL = '反方二辩驳论';      // con, 2:00
  // [stage, seat, the edge the speaking side sits at]
  const SEATINGS = [[OPENING, 'left', 'left'], [OPENING, 'right', 'right'], [REBUTTAL, 'left', 'right'], [REBUTTAL, 'right', 'left']];

  function mountPoster(view, w, h) {
    const box = document.getElementById('sandbox');
    box.innerHTML = '<div class="dt-stage-host" style="width:' + (w || 960) + 'px;height:' + (h || 540) + 'px"></div>';
    const stage = R.mount(box.firstChild);
    stage.update(view);
    const root = box.querySelector('.dt-stage');
    root.classList.remove('is-entering');   // measure at rest, not during the entrance
    return { stage, root };
  }
  function session(name, seat) {
    return E.goto(E.createSession(F(), Object.assign({}, MATCH, { proSeat: seat || 'left' }), T0, { theme: 'construct' }), idx(name), T0);
  }
  // A single stage running for `secs` seconds.
  const singleAt = (name, secs, seat) => E.view(E.toggle(session(name, seat), T0), T0 + secs * 1000);
  // The free debate: pro speaks first, con takes the floor at 20 s, the view at `secs`.
  function dualAt(secs, seat) {
    let s = E.floor(session('自由辩论', seat), 'pro', T0);
    s = E.floor(s, 'con', T0 + 20000);
    return E.view(s, T0 + secs * 1000);
  }
  const titleView = seat => E.view(E.createSession(F(), Object.assign({}, MATCH, { proSeat: seat || 'left' }), T0, { theme: 'construct' }), T0);
  function resolve(el, varName) {
    const probe = document.createElement('i');
    probe.style.color = 'var(' + varName + ')';
    el.appendChild(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  }
  // A position (a length, or a percentage of the element's own box) resolved there, from its left or top edge.
  function pos(el, expr, axis) {
    const probe = document.createElement('i');
    probe.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0';
    probe.style[axis === 'y' ? 'top' : 'left'] = expr;
    el.appendChild(probe);
    const r = probe.getBoundingClientRect(), b = el.getBoundingClientRect();
    probe.remove();
    return axis === 'y' ? r.top - b.top : r.left - b.left;
  }
  // An angle custom property resolved there, in degrees.
  function angle(el, expr) {
    const probe = document.createElement('i');
    probe.style.rotate = expr;
    el.appendChild(probe);
    const v = getComputedStyle(probe).rotate;
    probe.remove();
    const m = /(-?[\d.]+)deg/.exec(v);
    return m ? Number(m[1]) : v === 'none' ? 0 : NaN;
  }
  const mixer = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  function rgba(css) {
    mixer.clearRect(0, 0, 1, 1);
    mixer.fillStyle = css; mixer.fillRect(0, 0, 1, 1);
    const d = mixer.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  }
  function lum(css) {
    const [r, g, b] = rgba(css).slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function contrast(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  const sameColour = (a, b) => rgba(a).every((v, i) => Math.abs(v - rgba(b)[i]) <= (i === 3 ? 0.01 : 1));
  const pseudo = (el, which) => getComputedStyle(el, which);
  const px = s => parseFloat(s);
  const shown = cs => cs.content !== 'none' && cs.display !== 'none';
  const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const used = root => parseFloat(root.style.getPropertyValue('--used'));
  // The whole seconds a clock shows and its length, as render.js writes them on the stage and on each half.
  const secsOf = el => parseFloat(el.style.getPropertyValue('--secs'));
  const totalOf = el => parseFloat(el.style.getPropertyValue('--secs-total'));
  // A 60-minute first stage: its 30 s warn bell sits within a degree of the dial's axis.
  const LONG = () => {
    const f = JSON.parse(JSON.stringify(F()));
    f.stages[0].secs = 3600;
    return f;
  };
  const longAt = (secs, seat) => E.view(E.toggle(E.goto(E.createSession(LONG(), Object.assign({}, MATCH, { proSeat: seat || 'left' }), T0,
    { theme: 'construct' }), 0, T0), T0), T0 + secs * 1000);
  // Two convex polygons ([[x, y], ...]) overlap unless some edge's normal separates them.
  function polysOverlap(a, b) {
    return [a, b].every(poly => poly.every((p, i) => {
      const q = poly[(i + 1) % poly.length], nx = q[1] - p[1], ny = p[0] - q[0];
      const span = pts => pts.map(([x, y]) => x * nx + y * ny);
      const sa = span(a), sb = span(b);
      return Math.max.apply(null, sa) > Math.min.apply(null, sb) && Math.max.apply(null, sb) > Math.min.apply(null, sa);
    }));
  }
  const rectPoly = r => [[r.left, r.top], [r.right, r.top], [r.right, r.bottom], [r.left, r.bottom]];
  // The diagonal band (.dt-deco::before) as a polygon in page coordinates, turned about its transform origin.
  function bandPoly(root) {
    const deco = root.querySelector('.dt-deco'), d = deco.getBoundingClientRect();
    const cs = pseudo(deco, '::before');
    const x0 = d.left + px(cs.left), y0 = d.top + px(cs.top) + px(cs.marginTop), w = px(cs.width), h = px(cs.height);
    const [ox, oy] = cs.transformOrigin.split(' ').map(px);
    const t = angle(root, cs.rotate) * Math.PI / 180, cx = x0 + ox, cy = y0 + oy;
    return [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]].map(([x, y]) =>
      [cx + (x - cx) * Math.cos(t) - (y - cy) * Math.sin(t), cy + (x - cx) * Math.sin(t) + (y - cy) * Math.cos(t)]);
  }
  // The stage's number (the current segment's ::before) as a box in page coordinates, from its containing block.
  function numberRect(root) {
    const cur = root.querySelector('.dt-seg[data-state="current"]');
    let cb = cur.parentElement;
    while (cb && getComputedStyle(cb).position === 'static') cb = cb.parentElement;
    const b = cb.getBoundingClientRect(), n = pseudo(cur, '::before');
    const w = px(n.width), h = px(n.height);
    const left = b.left + px(n.left);
    const bottom = b.bottom - px(n.bottom);
    return { left, right: left + w, top: bottom - h, bottom };
  }

  DT.test('theme construct: 构成 is a dark theme drawn by its stylesheet alone', () => {
    const meta = (DT.THEMES || []).find(t => t.id === 'construct');
    assert.ok(meta, 'construct is in DT.THEMES');
    assert.equal(meta.name, '构成');
    assert.equal(meta.tone, 'dark');
    assert.equal(DT.themes.get('construct'), null, 'no defs and no painter: the dial is a conic-gradient');
  });

  // Spec §2.5: 正方 red, 反方 blue, a yellow for the warn bell and overtime, on a dark ground that is not near-black.
  DT.test('theme construct: red, blue and a yellow accent on a dark ground that is not near-black', () => {
    const { stage, root } = mountPoster(singleAt(OPENING, 60));
    const [pr, pg, pb] = rgba(resolve(root, '--pro'));
    assert.ok(pr > 150 && pr > 3 * pg && pr > 3 * pb, 'a red: ' + resolve(root, '--pro'));
    const [cr, cg, cb] = rgba(resolve(root, '--con'));
    assert.ok(cb > 140 && cb > 2 * cg && cb > 3 * cr, 'a blue: ' + resolve(root, '--con'));
    const [ar, ag, ab] = rgba(resolve(root, '--accent'));
    assert.ok(ar > 200 && ag > 150 && ab < 100, 'a yellow: ' + resolve(root, '--accent'));
    const ground = resolve(root, '--ground');
    assert.ok(lum(ground) < 0.06, 'dark: ' + ground);
    assert.ok(lum(ground) > lum('#1a1a1a'), 'not near-black: ' + ground);
    ['--pro-deep', '--con-deep'].forEach(v => assert.ok(sameColour(resolve(root, v), ground), v + ': the ground shows where the dial is not'));
    stage.destroy();
  });

  // Spec §2.5: the time left is a large sector, its centre outside the speaking side's seat edge, so only part of a
  // giant dial shows.
  DT.test('theme construct: the time left is a large sector centred outside the speaking side\'s seat edge', () => {
    SEATINGS.forEach(([name, seat, from]) => {
      const { stage, root } = mountPoster(singleAt(name, 60, seat), 1920, 1080);
      const where = name + ' / ' + seat;
      const field = root.querySelector('.dt-field');
      const cs = getComputedStyle(field);
      assert.ok(cs.display !== 'none', where + ': shown');
      assert.ok(/conic-gradient/.test(cs.backgroundImage), where + ': a sector: ' + cs.backgroundImage);
      assert.equal(cs.clipPath, 'none', where + ': the sector turns, it is not cut back');
      assert.ok(/radial-gradient/.test(cs.maskImage || cs.webkitMaskImage), where + ': the rim of a disc');
      const W = field.getBoundingClientRect().width, H = field.getBoundingClientRect().height;
      const x = pos(field, 'var(--dial-x)'), y = pos(field, 'var(--dial-y)', 'y'), r = pos(field, 'var(--construct-r)');
      if (from === 'left') assert.ok(x < 0 && x > -0.1 * W, where + ': just outside the left edge: ' + x);
      else assert.ok(x > W && x < 1.1 * W, where + ': just outside the right edge: ' + x);
      assert.ok(y > 0.4 * H && y < 0.75 * H, where + ': beside the digits: ' + y);
      assert.ok(r > 1.1 * H, where + ': large: ' + r);
      assert.ok(r - Math.abs(from === 'left' ? x : x - W) < 0.85 * W, where + ': its rim shows on the stage');
      stage.destroy();
    });
  });

  // The half of the dial that shows is the whole time: the sector's angle is the time left × 180°, by the whole seconds
  // the digits show (render.js --secs of --secs-total). It is a fan about the clock's horizontal axis that closes onto
  // that axis, so however little time is left it still runs from the hub behind the digits to a rim on the stage, and
  // the room stays the speaking side's to the last second.
  DT.test('theme construct: the sector\'s angle is the time left and it closes onto the clock\'s axis', () => {
    SEATINGS.forEach(([name, seat, from]) => {
      [30, 90, 100, 170].forEach(secs => {
        const { stage, root } = mountPoster(singleAt(name, secs, seat), 1920, 1080);
        const where = name + ' / ' + seat + ' / ' + secs + ' s';
        if (root.dataset.phase === 'over') { stage.destroy(); return; }
        const field = root.querySelector('.dt-field');
        const sweep = angle(field, 'var(--construct-sweep)');
        assert.near(sweep, secsOf(root) / totalOf(root) * 180, 0.01, where + ': the time left × 180°');
        const start = angle(field, 'var(--dial-from)');
        assert.near(start, (from === 'left' ? 90 : 270) - sweep / 2, 0.01, where + ': centred on the horizontal');
        // The axis is the digits' centre line, and the rim where it meets it is on the stage.
        const b = field.getBoundingClientRect();
        const d = root.querySelector('.dt-clock[data-clock="main"] .dt-digits').getBoundingClientRect();
        const y = pos(field, 'var(--dial-y)', 'y'), x = pos(field, 'var(--dial-x)'), r = pos(field, 'var(--construct-r)');
        assert.near(y, (d.top + d.bottom) / 2 - b.top, 0.03 * b.height, where + ': level with the digits');
        const rim = from === 'left' ? x + r : x - r;
        assert.ok(rim > 0 && rim < b.width, where + ': its rim on the axis is on the stage: ' + rim);
        stage.destroy();
      });
    });
  });

  // A single stage's digits sit inside the dial, clear of its scale at the rim, even five characters wide.
  DT.test('theme construct: the digits sit inside the dial, clear of its scale', () => {
    [[1920, 1080], [1366, 768]].forEach(([w, h]) => {
      SEATINGS.forEach(([name, seat, from]) => {
        const { stage, root } = mountPoster(singleAt(name, 30, seat), w, h);
        const where = w + ' / ' + name + ' / ' + seat;
        root.querySelectorAll('.dt-clock[data-clock="main"] .dt-min').forEach(m => { m.textContent = '58'; });
        const field = root.querySelector('.dt-field');
        const b = field.getBoundingClientRect();
        const d = root.querySelector('.dt-clock[data-clock="main"] .dt-digits').getBoundingClientRect();
        const cx = b.left + pos(field, 'var(--dial-x)'), cy = b.top + pos(field, 'var(--dial-y)', 'y');
        const inner = pos(field, 'var(--construct-r)') - 0.032 * h;   // the inner edge of the tick band
        [[d.left, d.top], [d.right, d.top], [d.left, d.bottom], [d.right, d.bottom]].forEach(([px_, py]) => {
          assert.ok(Math.hypot(px_ - cx, py - cy) < inner, where + ': a corner inside the scale');
        });
        const mid = (d.left + d.right) / 2 - b.left;
        assert.ok(from === 'left' ? mid < b.width / 2 : mid > b.width / 2, where + ': moved toward the hub: ' + mid);
        stage.destroy();
      });
    });
  });

  // Main spec: the speaking side stays visible when its time is up. The dial's hub stays at the seat.
  DT.test('theme construct: in overtime the hub stays at the seat and the band turns yellow', () => {
    SEATINGS.forEach(([name, seat]) => {
      const { stage, root } = mountPoster(singleAt(name, 200, seat));
      const where = name + ' / ' + seat;
      assert.equal(root.dataset.phase, 'over', where);
      const field = root.querySelector('.dt-field');
      const cs = getComputedStyle(field);
      assert.ok(cs.display !== 'none', where + ': shown');
      assert.near(angle(field, 'var(--construct-sweep)'), 0, 0.01, where + ': the sector is gone');
      assert.ok(pos(field, 'var(--hub-r)') > 0.1 * field.getBoundingClientRect().height, where + ': a hub');
      assert.ok(/radial-gradient/.test(cs.backgroundImage), where + ': drawn as a disc');
      const band = pseudo(root.querySelector('.dt-deco'), '::before');
      assert.ok(sameColour(band.backgroundColor, resolve(root, '--accent')), where + ': the band is the accent: ' + band.backgroundColor);
      stage.destroy();
    });
    const { stage, root } = mountPoster(singleAt(OPENING, 60));
    const band = pseudo(root.querySelector('.dt-deco'), '::before');
    assert.ok(!sameColour(band.backgroundColor, resolve(root, '--accent')), 'not yellow before the time is up');
    stage.destroy();
  });

  // Spec §1.5: overtime's digits and their hung "+" are the band's yellow and can land on it (4:3 and 5:4 from +0:00,
  // wider stages from +10:00), so a stroke in the ground's colour, painted under the fill, knocks them out of it.
  DT.test('theme construct: in overtime the digits and their sign are knocked out of the band in the ground\'s colour', () => {
    SEATINGS.forEach(([name, seat]) => {
      const { stage, root } = mountPoster(singleAt(name, 200, seat));
      const digits = root.querySelector('.dt-clock[data-clock="main"] .dt-digits:not(.dt-digits-on)');
      const sign = digits.querySelector('.dt-sign');
      assert.equal(sign.textContent, '+', name + ' / ' + seat + ': overtime');
      const ground = resolve(root, '--ground');
      [['digits', digits], ['sign', sign]].forEach(([part, el]) => {
        const cs = getComputedStyle(el), where = name + ' / ' + seat + ' / ' + part;
        assert.ok(px(cs.webkitTextStrokeWidth) > 0, where + ': stroked: ' + cs.webkitTextStrokeWidth);
        assert.ok(sameColour(cs.webkitTextStrokeColor, ground), where + ': in the ground\'s colour: ' + cs.webkitTextStrokeColor);
        assert.ok(/^stroke/.test(cs.paintOrder), where + ': the stroke under the fill: ' + cs.paintOrder);
      });
      stage.destroy();
    });
    const { stage, root } = mountPoster(singleAt(REBUTTAL, 60, 'left'));
    const cs = getComputedStyle(root.querySelector('.dt-clock[data-clock="main"] .dt-digits:not(.dt-digits-on)'));
    assert.equal(px(cs.webkitTextStrokeWidth), 0, 'no knockout before the time is up');
    stage.destroy();
  });

  // The digits cross the sector's edge as it turns, so they are one layer that reads on the red, the blue and the
  // ground alike, never cut.
  DT.test('theme construct: the digits are one layer that reads on both sides and on the ground', () => {
    SEATINGS.forEach(([name, seat]) => {
      const { stage, root } = mountPoster(singleAt(name, 60, seat));
      const where = name + ' / ' + seat;
      assert.equal(getComputedStyle(root.querySelector('.dt-clock[data-clock="main"] .dt-digits-on')).display, 'none', where);
      const digits = root.querySelector('.dt-clock[data-clock="main"] .dt-digits:not(.dt-digits-on)');
      assert.equal(getComputedStyle(digits).clipPath, 'none', where + ': not cut');
      const ink = getComputedStyle(digits).color;
      ['--pro', '--con', '--ground'].forEach(v => {
        const c = contrast(ink, resolve(root, v));
        assert.ok(c >= 4.5, where + ': on ' + v + ' ' + c.toFixed(2));
      });
      stage.destroy();
    });
    const { stage, root } = mountPoster(dualAt(30));
    root.querySelectorAll('.dt-half').forEach(h => {
      assert.equal(getComputedStyle(h.querySelector('.dt-digits-on')).display, 'none', 'dual: one layer');
      assert.equal(getComputedStyle(h.querySelector('.dt-digits:not(.dt-digits-on)')).clipPath, 'none', 'dual: not cut');
    });
    stage.destroy();
  });

  // The warn bell point is two marks of the dial: yellow notches across the rim on the rays where the fan's edges
  // will be when the warn bell rings, kept out of the bottom bar.
  DT.test('theme construct: the warn bell point is two yellow notches at the dial\'s rim', () => {
    SEATINGS.forEach(([name, seat, from]) => {
      const { stage, root } = mountPoster(singleAt(name, 60, seat), 1920, 1080);
      const where = name + ' / ' + seat;
      const line = root.querySelector('.dt-warnline');
      const lcs = getComputedStyle(line);
      assert.ok(!line.hidden && lcs.display !== 'none' && lcs.opacity !== '0', where);
      const mask = lcs.maskImage || lcs.webkitMaskImage || '';
      assert.ok(/linear-gradient/.test(mask), where + ': cut short of the bottom bar: ' + mask);
      const field = root.querySelector('.dt-field');
      const accent = rgba(resolve(root, '--accent'));
      const warnAt = parseFloat(root.style.getPropertyValue('--warn-at'));
      const axis = from === 'left' ? 0 : 180;
      const r = pos(field, 'var(--construct-r)');
      [['::before', -1], ['::after', 1]].forEach(([which, sign]) => {
        const cs = pseudo(line, which);
        const at = where + ' ' + which;
        assert.ok(shown(cs), at);
        const stops = cs.backgroundImage.match(/rgba?\([^)]*\)/g) || [];
        assert.ok(stops.some(c => rgba(c).every((v, i) => Math.abs(v - accent[i]) <= 1)), at + ': yellow: ' + cs.backgroundImage);
        assert.equal(rgba(stops[0] || 'red')[3], 0, at + ': clear from the hub: ' + cs.backgroundImage);
        assert.near(px(cs.left), pos(field, 'var(--dial-x)'), 1, at + ': from the dial\'s centre');
        assert.near(px(cs.top) + px(cs.marginTop) + px(cs.height) / 2, pos(field, 'var(--dial-y)', 'y'), 1, at);
        assert.ok(px(cs.height) >= 0.005 * 1080 && px(cs.height) < 0.02 * 1080, at + ': a ray: ' + cs.height);
        assert.ok(px(cs.width) > r, at + ': across the rim: ' + cs.width);
        assert.ok(/^0px/.test(cs.transformOrigin), at + ': turning about the centre: ' + cs.transformOrigin);
        assert.near(angle(line, cs.rotate), axis + sign * warnAt * 90, 0.1, at + ': where the fan\'s edge is at the bell');
      });
      stage.destroy();
    });
  });

  // When the bell is within a degree or so of the axis (30 s of an hour) two notches would lie a few units apart beside
  // the digits and read as '='. They merge into one wedge on the axis, just outside the rim, pointing in.
  DT.test('theme construct: a warn bell near the end is one wedge on the axis outside the rim, not two notches', () => {
    SEATINGS.slice(0, 2).forEach(([, seat, from]) => {
      const { stage, root } = mountPoster(longAt(73, seat), 1920, 1080);
      const where = seat;
      const line = root.querySelector('.dt-warnline');
      const field = root.querySelector('.dt-field');
      const warnAt = parseFloat(root.style.getPropertyValue('--warn-at'));
      assert.ok(warnAt > 0 && warnAt < 0.01, where + ': the bell is near the end: ' + warnAt);
      const axis = from === 'left' ? 0 : 180;
      const r = pos(field, 'var(--construct-r)');
      const [a, b] = ['::before', '::after'].map(w => pseudo(line, w));
      assert.near(angle(line, a.rotate), axis, 0.01, where + ': on the axis');
      assert.near(angle(line, b.rotate), axis, 0.01, where + ': both on the axis');
      assert.ok(/polygon/.test(a.clipPath), where + ': cut to a wedge: ' + a.clipPath);
      assert.ok(px(a.height) > 0.03 * 1080, where + ': a wedge, broad at its base: ' + a.height);
      // The wedge's point lies just outside the rim (100% - 5.2cqh along the ray), so it cannot sit by the digits.
      const tip = px(a.width) - 0.052 * 1080;
      assert.ok(tip > r && tip < r + 0.02 * 1080, where + ': the point just outside the rim: ' + tip + ' vs ' + r);
      const digits = root.querySelector('.dt-clock[data-clock="main"] .dt-digits').getBoundingClientRect();
      const hub = root.getBoundingClientRect().left + pos(field, 'var(--dial-x)');
      const far = from === 'left' ? digits.right - hub : hub - digits.left;
      assert.ok(tip - far > 0.05 * 1080, where + ': clear of the digits by ' + (tip - far));
      stage.destroy();
    });
    // A three-minute stage keeps its two notches, at the fan's edges at the bell.
    const { stage, root } = mountPoster(singleAt(OPENING, 60), 1920, 1080);
    const line = root.querySelector('.dt-warnline');
    const warnAt = parseFloat(root.style.getPropertyValue('--warn-at'));
    assert.near(angle(line, pseudo(line, '::before').rotate), -warnAt * 90, 0.1);
    assert.near(angle(line, pseudo(line, '::after').rotate), warnAt * 90, 0.1);
    stage.destroy();
  });

  // Who opens the free debate is set in the cream of all the type, underlined in yellow: yellow type on the con's
  // blue would read only 3.8:1.
  DT.test('theme construct: who speaks first in free debate reads 4.5:1 on either disc', () => {
    ['left', 'right'].forEach(seat => {
      const s = E.goto(E.createSession(F(), Object.assign({}, MATCH, { proSeat: seat }), T0, { theme: 'construct' }), idx('自由辩论'), T0);
      const { stage, root } = mountPoster(E.view(s, T0), 1920, 1080);
      const name = root.querySelector('.dt-next-name');
      assert.equal(name.textContent, '先由正方发言');
      const cs = getComputedStyle(name);
      ['--pro', '--con', '--ground'].forEach(v => {
        assert.ok(contrast(cs.color, resolve(root, v)) >= 4.5, seat + ' on ' + v + ': ' + contrast(cs.color, resolve(root, v)).toFixed(2));
      });
      assert.ok(/underline/.test(cs.textDecorationLine) && sameColour(cs.textDecorationColor, resolve(root, '--accent')), seat + ': ' + cs.textDecoration);
      stage.destroy();
    });
  });

  // Spec §2.5: a fine grid and a thick diagonal band are part of the composition.
  DT.test('theme construct: a fine grid over the stage and a thick diagonal band', () => {
    SEATINGS.forEach(([name, seat]) => {
      const { stage, root } = mountPoster(singleAt(name, 60, seat), 1920, 1080);
      const where = name + ' / ' + seat;
      const grid = getComputedStyle(root.querySelector('.dt-deco-over')).backgroundImage;
      assert.ok((grid.match(/repeating-linear-gradient/g) || []).length >= 2, where + ': lines both ways: ' + grid);
      const lines = grid.match(/rgba\([^)]*\)/g) || [];
      assert.ok(lines.length && lines.every(c => rgba(c)[3] <= 0.12), where + ': faint: ' + lines);
      const band = pseudo(root.querySelector('.dt-deco'), '::before');
      assert.ok(shown(band), where + ': a band');
      const turn = Math.abs(angle(root, band.rotate));
      assert.ok(turn > 20 && turn < 65, where + ': diagonal: ' + band.rotate);
      assert.ok(px(band.height) > 0.05 * 1080, where + ': thick: ' + band.height);
      stage.destroy();
    });
  });

  // Spec §2.5: a large number of the stage in the running order, as a piece of the composition. CSS counts the
  // progress bar's segments, so it is the true order. It stands clear of the dial, on the other side.
  DT.test('theme construct: the stage\'s place in the order is set large, away from the dial', () => {
    SEATINGS.forEach(([name, seat, from]) => {
      const { stage, root } = mountPoster(singleAt(name, 60, seat), 1920, 1080);
      const where = name + ' / ' + seat;
      const segs = root.querySelectorAll('.dt-seg');
      assert.ok(/dt-construct-stage/.test(getComputedStyle(root.querySelector('.dt-progress')).counterReset), where + ': counted afresh');
      segs.forEach(s => assert.ok(/dt-construct-stage/.test(getComputedStyle(s).counterIncrement), where + ': every segment counts'));
      const cur = root.querySelector('.dt-seg[data-state="current"]');
      const n = pseudo(cur, '::before');
      assert.ok(shown(n), where + ': shown');
      assert.ok(/counter\(dt-construct-stage, decimal-leading-zero\)/.test(n.content), where + ': ' + n.content);
      assert.ok(px(n.fontSize) >= 0.2 * 1080, where + ': large: ' + n.fontSize);
      assert.equal(n.position, 'absolute', where);
      // Half into the outer grid column on the side away from the dial, clear of its rim.
      assert.near(px(from === 'left' ? n.right : n.left), -1920 / 24, 1, where + ': on the side away from the dial');
      // The current segment is still marked, now by a yellow frame.
      const seg = getComputedStyle(cur);
      assert.ok(seg.outlineStyle === 'solid' && sameColour(seg.outlineColor, resolve(root, '--accent')), where + ': ' + seg.outline);
      stage.destroy();
    });
    const { stage, root } = mountPoster(titleView());
    assert.equal(root.querySelector('.dt-seg[data-state="current"]'), null, 'no number on the title card');
    stage.destroy();
  });

  // An outlined numeral with the solid band through it reads as noise: the band's path keeps clear of the number, in
  // every seating and phase, at both projector sizes.
  DT.test('theme construct: the diagonal band keeps clear of the stage number', () => {
    [[1920, 1080], [1366, 768]].forEach(([w, h]) => {
      SEATINGS.forEach(([name, seat]) => {
        [60, 200].forEach(secs => {
          const { stage, root } = mountPoster(singleAt(name, secs, seat), w, h);
          const where = w + ' ' + name + ' / ' + seat + ' @' + secs;
          const n = numberRect(root);
          assert.ok(n.right - n.left > 0.05 * w && n.bottom - n.top > 0.1 * h, where + ': the number measured: ' + JSON.stringify(n));
          assert.ok(!polysOverlap(bandPoly(root), rectPoly(n)), where + ': the band crosses the number');
          const bar = root.querySelector('.dt-progress').getBoundingClientRect();
          assert.ok(n.bottom <= bar.top, where + ': above the bottom bar');
          stage.destroy();
        });
      });
      const { stage, root } = mountPoster(longAt(73), w, h);
      assert.ok(!polysOverlap(bandPoly(root), rectPoly(numberRect(root))), w + ' long stage');
      stage.destroy();
    });
    // The check itself: the old placement, higher up, did cross the band.
    const { stage, root } = mountPoster(singleAt(OPENING, 60), 1920, 1080);
    const n = numberRect(root), up = { left: n.left, right: n.right, top: n.top - 0.226 * 1080, bottom: n.bottom - 0.226 * 1080 };
    assert.ok(polysOverlap(bandPoly(root), rectPoly(up)), 'the band did cross the number where it used to stand');
    stage.destroy();
  });

  // Spec §2.5: the top bar is turned 90° and set against the edges, in the outer columns of the grid.
  DT.test('theme construct: the top bar is set in upright columns against the edges', () => {
    [[1920, 1080], [1366, 768]].forEach(([w, h]) => {
      ['left', 'right'].forEach(seat => {
        const { stage, root } = mountPoster(singleAt(OPENING, 60, seat), w, h);
        const where = w + ' / ' + seat;
        const box = root.getBoundingClientRect();
        const match = root.querySelector('.dt-match'), format = root.querySelector('.dt-format');
        [match, format].forEach(el => {
          const cs = getComputedStyle(el);
          // Upright characters in a column, read top to bottom on both edges: the two labels are a matched pair, and
          // neither is turned over (Edge sets CJK upright under sideways once there is letter-spacing).
          assert.equal(cs.writingMode, 'vertical-rl', where + ': in a column');
          assert.equal(cs.textOrientation, 'upright', where + ': characters upright');
          assert.equal(cs.rotate, 'none', where + ': not turned over');
          assert.equal(cs.transform, 'none', where + ': not turned over');
          const r = el.getBoundingClientRect();
          assert.ok(r.height > 2 * r.width, where + ': runs down the edge');
          [root.querySelector('.dt-head'), root.querySelector('.dt-clock[data-clock="main"] .dt-digits')].forEach(o => {
            assert.ok(!overlaps(r, o.getBoundingClientRect()), where + ': clear of ' + o.className);
          });
        });
        const m = match.getBoundingClientRect(), f = format.getBoundingClientRect();
        assert.ok(m.right - box.left < box.width / 12, where + ': the match at the left edge');
        assert.ok(box.right - f.left < box.width / 12, where + ': the format at the right edge');
        stage.destroy();
      });
    });
  });

  // Spec §2.5: in free debate two sectors face each other from the outer edges; the speaking side's is the larger
  // and is the one turning back as its time runs.
  DT.test('theme construct: in free debate two dials face each other from the outer edges', () => {
    ['left', 'right'].forEach(seat => {
      const { stage, root } = mountPoster(dualAt(30, seat), 1920, 1080);
      const halves = root.querySelectorAll('.dt-half');
      halves.forEach((h, i) => {
        const where = seat + ' / ' + h.dataset.side;
        assert.equal(getComputedStyle(h).backgroundColor, 'rgba(0, 0, 0, 0)', where + ': the ground shows between the dials');
        const f = h.querySelector('.dt-half-field');
        const cs = getComputedStyle(f);
        assert.ok(/conic-gradient/.test(cs.backgroundImage), where + ': a sector');
        const b = f.getBoundingClientRect();
        assert.ok(b.height > 0.95 * root.getBoundingClientRect().height, where + ': the whole height');
        const x = pos(f, 'var(--dial-x)');
        if (i === 0) assert.ok(x < 0, where + ': outside the left edge: ' + x);
        else assert.ok(x > b.width, where + ': outside the right edge: ' + x);
        const left = secsOf(h) / totalOf(h);
        assert.near(angle(f, 'var(--construct-sweep)'), left * 180, 0.01, where + ': the time left × 180°');
        assert.near(angle(f, 'var(--dial-from)'), (i === 0 ? 90 : 270) - left * 90, 0.01, where + ': centred on the horizontal');
      });
      const active = root.querySelector('.dt-half[data-active] .dt-half-field');
      const waiting = root.querySelector('.dt-half:not([data-active]) .dt-half-field');
      assert.ok(pos(active, 'var(--construct-r)') > pos(waiting, 'var(--construct-r)'), seat + ': the speaker\'s dial is the larger');
      stage.destroy();
    });
  });

  // The title card: each side's dial, full, at its own seat.
  DT.test('theme construct: the title card shows each side\'s full dial at its seat', () => {
    ['left', 'right'].forEach(seat => {
      const { stage, root } = mountPoster(titleView(seat));
      assert.equal(root.dataset.mode, 'title');
      const deco = root.querySelector('.dt-deco');
      const img = getComputedStyle(deco).backgroundImage;
      assert.ok((img.match(/radial-gradient/g) || []).length >= 2, seat + ': two discs: ' + img);
      const W = deco.getBoundingClientRect().width;
      const px_ = pos(deco, 'var(--pro-x)'), cx = pos(deco, 'var(--con-x)');
      assert.ok(seat === 'left' ? px_ <= 0 && cx >= W : px_ >= W && cx <= 0, seat + ': each at its seat: ' + px_ + ' / ' + cx);
      stage.destroy();
    });
  });

  // The end card marks each row's side with a quarter of a dial.
  DT.test('theme construct: the record marks each row with a quarter disc', () => {
    let s = E.toggle(session(OPENING), T0);
    const t = T0 + 200000;
    s = E.goto(s, 99, t);
    const { stage, root } = mountPoster(Object.assign(E.view(s, t), { record: E.record(s, t) }), 1920, 1080);
    assert.equal(root.dataset.mode, 'end');
    const mark = pseudo(root.querySelector('.dt-record tr[data-side="pro"] td:first-child'), '::before');
    assert.ok(/100%/.test(mark.borderTopRightRadius) || px(mark.borderTopRightRadius) >= px(mark.width) - 0.5, 'a quarter disc: ' + mark.borderRadius);
    assert.equal(px(mark.borderBottomLeftRadius), 0, 'its centre at the corner');
    stage.destroy();
  });

  // ---- motion (design/construct-final.md) ----

  // A stage still entering, as render.js leaves it for 1.1 s.
  function mountEntering(view, w, h) {
    const box = document.getElementById('sandbox');
    box.innerHTML = '<div class="dt-stage-host" style="width:' + (w || 960) + 'px;height:' + (h || 540) + 'px"></div>';
    const stage = R.mount(box.firstChild);
    stage.update(view);
    return { stage, root: box.querySelector('.dt-stage') };
  }
  const dur = s => s.split(',').map(x => parseFloat(x) * (/ms$/.test(x.trim()) ? 1 : 1000));
  // A computed transform's matrix(a, b, c, d, e, f) as numbers (none: the identity).
  function matrix(t) {
    if (t === 'none') return [1, 0, 0, 1, 0, 0];
    const m = /matrix\(([^)]*)\)/.exec(t);
    return m ? m[1].split(',').map(Number) : null;
  }

  // CO3: the fan moves once a second, as the digits change: its angle is the whole seconds shown × 180° / the length,
  // not the time used to the frame (between two ticks the two differ by up to a second's share).
  DT.test('theme construct: the fan stands still between the seconds the digits show', () => {
    SEATINGS.forEach(([name, seat]) => {
      [30.4, 70.9, 100.2].forEach(secs => {
        const { stage, root } = mountPoster(singleAt(name, secs, seat));
        const where = name + ' / ' + seat + ' / ' + secs + ' s';
        const field = root.querySelector('.dt-field');
        const whole = secsOf(root), total = totalOf(root);
        assert.equal(whole, Math.ceil(F().stages[idx(name)].secs - secs), where + ': --secs is the whole seconds shown');
        assert.near(angle(field, 'var(--construct-sweep)'), whole / total * 180, 0.01, where);
        assert.ok(Math.abs(angle(field, 'var(--construct-sweep)') - (1 - used(root)) * 180) > 0.05, where + ': not the time used');
        stage.destroy();
      });
    });
    const { stage, root } = mountPoster(dualAt(30.4));
    root.querySelectorAll('.dt-half').forEach(h => {
      assert.near(angle(h.querySelector('.dt-half-field'), 'var(--construct-sweep)'), secsOf(h) / totalOf(h) * 180, 0.01, 'dual ' + h.dataset.side);
    });
    stage.destroy();
  });

  // The step is a jump on the frame the digits change (one repaint a second), never eased; only a side that yields
  // turns its fan back onto the axis, with the switch, and not while the stage enters.
  DT.test('theme construct: the fan jumps to each second, and a yielded fan turns back with the switch', () => {
    let { stage, root } = mountPoster(singleAt(OPENING, 60));
    const field = root.querySelector('.dt-field');
    assert.ok(!/construct-sweep/.test(getComputedStyle(field).transitionProperty), 'no eased step: ' + getComputedStyle(field).transitionProperty);
    stage.destroy();
    let s = E.floor(session('自由辩论'), 'pro', T0);
    s = E.yieldTime(s, T0 + 5000);
    ({ stage, root } = mountEntering(E.view(s, T0 + 5000)));
    const out = root.querySelector('.dt-half[data-locked] .dt-half-field');
    assert.ok(out, 'a side has yielded');
    assert.ok(!/construct-sweep/.test(getComputedStyle(out).transitionProperty), 'not while the stage enters');
    root.classList.remove('is-entering');
    const cs = getComputedStyle(out);
    assert.equal(cs.transitionProperty, '--construct-sweep');
    assert.deepEqual(dur(cs.transitionDuration), [520]);
    assert.near(angle(out, 'var(--construct-sweep)'), 0, 0.01, 'its fan is on the axis');
    const on = root.querySelector('.dt-half:not([data-locked]) .dt-half-field');
    assert.ok(!/construct-sweep/.test(getComputedStyle(on).transitionProperty), 'the other side still jumps');
    stage.destroy();
  });

  // CO4: both edges of the fan are soft over a tenth of a degree, and a fan of nothing draws nothing.
  DT.test('theme construct: the fan\'s edges are soft, and a closed fan leaves no hairline', () => {
    let { stage, root } = mountPoster(singleAt(OPENING, 60));
    let field = root.querySelector('.dt-field');
    assert.near(angle(field, 'var(--dial-soft)'), 0.1, 0.001, 'a tenth of a degree');
    const img = getComputedStyle(field).backgroundImage;
    assert.ok(/conic-gradient\(from [^,]+ at [^,]+, (rgba\(0, 0, 0, 0\)|transparent) 0deg, rgb\(191, 42, 29\) 0\.1deg/.test(img), 'transparent into the side over .1deg: ' + img);
    stage.destroy();
    ({ stage, root } = mountPoster(singleAt(OPENING, 200)));
    field = root.querySelector('.dt-field');
    assert.near(angle(field, 'var(--dial-soft)'), 0, 0.001, 'overtime: no soft edge either');
    stage.destroy();
  });

  // CO1: a new stage's poster is set up: the hub pushes in from the seat as the fan opens, the scale comes up after,
  // the band slides up its diagonal from below the stage, and the stage's number rises with its name.
  DT.test('theme construct: a new stage pushes the hub in, slides the band up its diagonal and raises the number', () => {
    SEATINGS.forEach(([name, seat, from]) => {
      const { stage, root } = mountEntering(singleAt(name, 60, seat));
      const where = name + ' / ' + seat;
      const field = root.querySelector('.dt-field');
      assert.equal(getComputedStyle(field).animationName, 'dt-construct-open', where);
      // At its first frame the fan is shut and the hub's disc lies just outside the seat's edge.
      const open = root.getAnimations({ subtree: true }).find(a => a.animationName === 'dt-construct-open');
      open.pause();
      open.currentTime = 0;
      assert.near(angle(field, 'var(--construct-sweep)'), 0, 0.01, where + ': the fan shut');
      const hub = parseFloat(getComputedStyle(field).getPropertyValue('--construct-hub'));
      assert.near(hub, 0.065 * 540, 0.5, where + ': the hub at the edge (7cqh out, less its ring)');
      open.play();
      const scale = pseudo(field, '::before');
      assert.equal(scale.animationName, 'dt-fade-in', where + ': the scale');
      assert.deepEqual(dur(scale.animationDelay), [160], where);
      const band = pseudo(root.querySelector('.dt-deco'), '::before');
      assert.equal(band.animationName, 'dt-construct-band', where + ': the band');
      assert.equal(band.animationFillMode, 'backwards', where);
      // Back toward the floor along its own length: down-left for a band rising to the right, down-right otherwise.
      assert.equal(band.getPropertyValue('--band-back').trim(), from === 'left' ? '-1' : '1', where);
      // At its first frame the whole band, corners and all, lies below the stage's lower edge, so it first shows
      // coming out from under the fan, not as a stub of its far end on the bottom bar.
      const slide = root.getAnimations({ subtree: true }).find(a => a.animationName === 'dt-construct-band');
      slide.pause();
      slide.currentTime = 0;
      const b0 = pseudo(root.querySelector('.dt-deco'), '::before');
      const tx = matrix(b0.transform)[4], turn = angle(root, b0.rotate) * Math.PI / 180;
      const [ox, oy] = b0.transformOrigin.split(' ').map(px);
      const top = px(b0.top) + px(b0.marginTop) + oy;
      const highest = Math.min(...[-ox, px(b0.width) - ox].flatMap(x => [-oy, px(b0.height) - oy].map(y =>
        top + (x + tx) * Math.sin(turn) + y * Math.cos(turn))));
      assert.ok(highest >= root.querySelector('.dt-deco').getBoundingClientRect().height - 0.5,
        where + ': the band starts below the stage: its highest corner at ' + highest.toFixed(1) + ' px');
      slide.play();
      assert.equal(pseudo(root.querySelector('.dt-seg[data-state="current"]'), '::before').animationName, 'dt-rise', where + ': the number');
      root.classList.remove('is-entering');
      assert.equal(getComputedStyle(field).animationName, 'none', where + ': over with the entrance');
      assert.equal(pseudo(root.querySelector('.dt-deco'), '::before').animationName, 'none', where);
      stage.destroy();
    });
    // A thumbnail never enters.
    const box = document.getElementById('sandbox');
    box.innerHTML = '<div class="dt-stage-host" style="width:320px;height:180px"></div>';
    const thumb = R.mount(box.firstChild, { thumbnail: true });
    thumb.update(singleAt(OPENING, 60));
    assert.equal(pseudo(box.querySelector('.dt-deco'), '::before').animationName, 'none', 'thumbnail');
    thumb.destroy();
  });

  // CO5: a bell strikes the hub and lights the scale, in yellow marks of their own; stage.css's ring is not drawn on a
  // dial. In free debate, on the dial of the side that rang.
  DT.test('theme construct: a bell strikes the hub and lights the scale instead of a ring round the digits', () => {
    SEATINGS.forEach(([name, seat]) => {
      const { stage, root } = mountPoster(singleAt(name, 60, seat), 1920, 1080);
      const where = name + ' / ' + seat;
      const over = root.querySelector('.dt-deco-over');
      assert.equal(pseudo(over, '::before').content, 'none', where + ': nothing before the bell');
      assert.equal(pseudo(over, '::after').content, 'none', where);
      stage.pulse({ type: 'warn', clock: 'main' });
      const ring = root.querySelector('.dt-ring');
      assert.ok(ring && getComputedStyle(ring).display === 'none', where + ': no ring round the digits');
      const hub = pseudo(over, '::before'), lit = pseudo(over, '::after');
      assert.equal(hub.animationName, 'dt-construct-strike', where);
      assert.equal(lit.animationName, 'dt-construct-lit', where);
      // The hub's mark is centred on the dial's hub; the scale's is drawn about the same centre.
      const field = root.querySelector('.dt-field'), o = over.getBoundingClientRect(), f = field.getBoundingClientRect();
      const hx = f.left + pos(field, 'var(--dial-x)'), hy = f.top + pos(field, 'var(--dial-y)', 'y');
      assert.near(o.left + px(hub.left) + px(hub.width) / 2, hx, 1, where + ': the hub\'s mark on the hub');
      assert.near(o.top + px(hub.top) + px(hub.height) / 2, hy, 1, where);
      assert.near(o.left + px(lit.left) + pos(over, lit.getPropertyValue('--mark-x')), hx, 1, where + ': the scale\'s mark about the hub');
      stage.destroy();
    });
    // Free debate: the con side runs out; only its half's marks show.
    const { stage, root } = mountPoster(dualAt(30), 1920, 1080);
    stage.pulse({ type: 'end', clock: 'con' });
    const con = root.querySelector('.dt-half[data-side="con"]'), pro = root.querySelector('.dt-half[data-side="pro"]');
    assert.equal(pseudo(con, '::before').animationName, 'dt-construct-strike', 'dual: the side that rang');
    assert.equal(pseudo(con, '::after').animationName, 'dt-construct-lit', 'dual');
    assert.equal(pseudo(pro, '::before').content, 'none', 'dual: not the other side');
    assert.equal(root.querySelectorAll('.dt-ring').length, 1, 'one ring for a side out of time (stage.css), not drawn');
    assert.equal(getComputedStyle(root.querySelector('.dt-ring')).display, 'none');
    stage.destroy();
  });

  // CO2: time up on a single stage: the yellow runs up the band from the floor (the concrete drawn back off it), and
  // the scale turns yellow on the second stroke; a still and a stage opened in overtime simply show them yellow.
  DT.test('theme construct: the end bell runs yellow up the band and lights the scale for good', () => {
    SEATINGS.forEach(([name, seat]) => {
      const { stage, root } = mountPoster(singleAt(name, 200, seat), 1920, 1080);
      const where = name + ' / ' + seat;
      const deco = root.querySelector('.dt-deco');
      assert.equal(pseudo(deco, '::after').content, 'none', where + ': opened in overtime, no cover');
      stage.pulse({ type: 'end', clock: 'main' });
      const cover = pseudo(deco, '::after');
      assert.equal(cover.animationName, 'dt-construct-band-yellow', where);
      assert.equal(cover.backgroundColor, resolve(root, '--band'), where + ': the concrete');
      // Its end: drawn back along the band to nothing at the far end.
      root.getAnimations({ subtree: true }).filter(a => a.animationName === 'dt-construct-band-yellow').forEach(a => a.finish());
      const m = matrix(pseudo(deco, '::after').transform);
      assert.ok(m && Math.abs(m[0]) < 1e-6, where + ': drawn back to nothing: ' + pseudo(deco, '::after').transform);
      assert.ok(sameColour(pseudo(deco, '::before').backgroundColor, resolve(root, '--accent')), where + ': yellow under it');
      assert.equal(pseudo(root.querySelector('.dt-field'), '::before').animationName, 'dt-construct-scale-hold', where);
      const mark = pseudo(root.querySelector('.dt-deco-over'), '::after');
      assert.equal(mark.animationName, 'dt-fade-in', where + ': the scale\'s mark');
      assert.deepEqual(dur(mark.animationDelay), [320], where + ': on the second stroke');
      stage.destroy();
    });
  });

  // CO8: in free debate each dial is drawn on a sheet the stage's width, anchored at its seat's edge, so the columns'
  // spring only moves the half's clip.
  DT.test('theme construct: each free-debate dial is drawn on a sheet that keeps its size through a switch', () => {
    ['left', 'right'].forEach(seat => {
      const { stage, root } = mountPoster(dualAt(30, seat), 1920, 1080);
      const r = root.getBoundingClientRect();
      const halves = root.querySelectorAll('.dt-half');
      halves.forEach((h, i) => {
        const f = h.querySelector('.dt-half-field').getBoundingClientRect();
        assert.near(f.width, r.width, 1, seat + ' ' + h.dataset.side + ': the stage\'s width');
        if (i === 0) assert.near(f.left, r.left, 1, seat + ': anchored at the left edge');
        else assert.near(f.right, r.right, 1, seat + ': anchored at the right edge');
      });
      stage.destroy();
    });
  });

  // CO9 (in part): the title card's two dials swell in from the seats as the card comes.
  DT.test('theme construct: the title card\'s dials swell in from the seats', () => {
    const { stage, root } = mountEntering(titleView());
    const deco = root.querySelector('.dt-deco');
    assert.equal(getComputedStyle(deco).animationName, 'dt-construct-disc');
    root.classList.remove('is-entering');
    assert.near(parseFloat(getComputedStyle(deco).getPropertyValue('--construct-disc')), 0.52 * 540, 1, 'the full dial once in');
    stage.destroy();
  });
})();
