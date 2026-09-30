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

  // The half of the dial that shows is the whole time: the sector's angle is the time left × 180°, anchored at the
  // floor, so its free edge falls like a gauge's needle and the last of the time lies against the seat.
  DT.test('theme construct: the sector\'s angle is the time left and its edge falls toward the floor', () => {
    SEATINGS.forEach(([name, seat, from]) => {
      [30, 90].forEach(secs => {
        const { stage, root } = mountPoster(singleAt(name, secs, seat));
        const where = name + ' / ' + seat + ' / ' + secs + ' s';
        const field = root.querySelector('.dt-field');
        const sweep = angle(field, 'var(--construct-sweep)');
        assert.near(sweep, (1 - used(root)) * 180, 0.6, where + ': the time left × 180°');
        const start = angle(field, 'var(--dial-from)');
        assert.near(start, from === 'left' ? 180 - sweep : 180, 0.01, where + ': anchored at the floor');
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

  // The warn bell point is a mark of the dial: a yellow ray from the hub at the angle the needle will have when the
  // warn bell rings.
  DT.test('theme construct: the warn bell point is a yellow ray of the dial', () => {
    SEATINGS.forEach(([name, seat, from]) => {
      const { stage, root } = mountPoster(singleAt(name, 60, seat));
      const where = name + ' / ' + seat;
      const ray = root.querySelector('.dt-warnline');
      const cs = getComputedStyle(ray);
      assert.ok(!ray.hidden && cs.display !== 'none' && cs.opacity !== '0', where);
      const accent = rgba(resolve(root, '--accent'));
      const stops = cs.backgroundImage.match(/rgba?\([^)]*\)/g) || [];
      assert.ok(stops.some(s => rgba(s).every((v, i) => Math.abs(v - accent[i]) <= 1)), where + ': yellow: ' + cs.backgroundImage);
      assert.equal(cs.maskImage || 'none', 'none', where + ': not faded as the hairline is');
      const field = root.querySelector('.dt-field');
      const box = root.getBoundingClientRect();
      assert.near(px(cs.left), pos(field, 'var(--dial-x)'), 1, where + ': from the dial\'s centre');
      assert.near(px(cs.top) + px(cs.marginTop) + px(cs.height) / 2, pos(field, 'var(--dial-y)', 'y'), 1, where);
      assert.ok(px(cs.height) >= 0.005 * box.height && px(cs.height) < 0.02 * box.height, where + ': a ray: ' + cs.height);
      const warnAt = parseFloat(root.style.getPropertyValue('--warn-at'));
      // The ray points east rotated clockwise: toward the floor, as far round as the needle at the warn bell.
      const want = from === 'left' ? 90 - warnAt * 180 : 90 + warnAt * 180;
      assert.near(angle(ray, cs.rotate), want, 0.1, where + ': at the warn angle');
      assert.ok(/^0px/.test(cs.transformOrigin), where + ': turning about the centre: ' + cs.transformOrigin);
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
      assert.equal(from === 'left' ? n.right : n.left, '0px', where + ': on the side away from the dial');
      // The current segment is still marked, now by a yellow frame.
      const seg = getComputedStyle(cur);
      assert.ok(seg.outlineStyle === 'solid' && sameColour(seg.outlineColor, resolve(root, '--accent')), where + ': ' + seg.outline);
      stage.destroy();
    });
    const { stage, root } = mountPoster(titleView());
    assert.equal(root.querySelector('.dt-seg[data-state="current"]'), null, 'no number on the title card');
    stage.destroy();
  });

  // Spec §2.5: the top bar is turned 90° and set against the edges, in the outer columns of the grid.
  DT.test('theme construct: the top bar is turned 90° against the edges', () => {
    [[1920, 1080], [1366, 768]].forEach(([w, h]) => {
      ['left', 'right'].forEach(seat => {
        const { stage, root } = mountPoster(singleAt(OPENING, 60, seat), w, h);
        const where = w + ' / ' + seat;
        const box = root.getBoundingClientRect();
        const match = root.querySelector('.dt-match'), format = root.querySelector('.dt-format');
        [match, format].forEach(el => {
          const cs = getComputedStyle(el);
          assert.ok(/^vertical/.test(cs.writingMode) && cs.textOrientation === 'sideways', where + ': turned: ' + cs.writingMode + ' ' + cs.textOrientation);
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
        const remain = parseFloat(h.style.getPropertyValue('--remain'));
        assert.near(angle(f, 'var(--construct-sweep)'), remain * 180, 0.6, where + ': the time left × 180°');
        assert.near(angle(f, 'var(--dial-from)'), i === 0 ? 180 - remain * 180 : 180, 0.6, where + ': anchored at the floor');
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
})();
