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
  const RED = [241, 80, 96], BLUE = [0, 120, 191];   // Riso Bright Red and Riso Blue (spec §2.4)

  function mountPoster(view, w, h) {
    const box = document.getElementById('sandbox');
    box.innerHTML = '<div class="dt-stage-host" style="width:' + (w || 960) + 'px;height:' + (h || 540) + 'px"></div>';
    const stage = R.mount(box.firstChild);
    stage.update(view);
    const root = box.querySelector('.dt-stage');
    root.classList.remove('is-entering');   // measure at rest, not during the entrance sweep
    return { stage, root };
  }
  function session(name, seat) {
    return E.goto(E.createSession(F(), Object.assign({}, MATCH, { proSeat: seat || 'left' }), T0, { theme: 'riso' }), idx(name), T0);
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
  // A length (or a percentage of the element's own box) resolved there: across for 'width', down for 'height'.
  function length(el, expr, axis) {
    const probe = document.createElement('i');
    probe.style.cssText = 'position:absolute;left:0;top:0;width:1px;height:1px';
    probe.style[axis || 'width'] = expr;
    el.appendChild(probe);
    const r = probe.getBoundingClientRect();
    probe.remove();
    return axis === 'height' ? r.height : r.width;
  }
  // Any CSS colour as the sRGB a canvas paints for it, with its alpha.
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
  const same = (css, rgb, tol, msg) => rgba(css).slice(0, 3).forEach((v, i) => assert.near(v, rgb[i], tol || 1, msg + ': ' + css));
  const pseudo = (el, which) => getComputedStyle(el, which);
  const px = s => parseFloat(s);
  const shown = cs => cs.content !== 'none' && cs.display !== 'none';
  // The shadows of a text-shadow list: [{color, x, y}].
  function shadows(value) {
    const out = [];
    const re = /(rgba?\([^)]*\))\s+(-?[\d.]+)px\s+(-?[\d.]+)px/g;
    let m;
    while ((m = re.exec(value))) out.push({ color: m[1], x: Number(m[2]), y: Number(m[3]) });
    return out;
  }
  const inkOf = side => (side === 'pro' ? RED : BLUE);
  const isInk = (css, rgb) => rgba(css).slice(0, 3).every((v, i) => Math.abs(v - rgb[i]) <= 1);

  DT.test('theme riso: 孔版 is a light theme drawn by its stylesheet alone', () => {
    const meta = (DT.THEMES || []).find(t => t.id === 'riso');
    assert.ok(meta, 'riso is in DT.THEMES');
    assert.equal(meta.name, '孔版');
    assert.equal(meta.tone, 'light');
    assert.equal(DT.themes.get('riso'), null, 'no defs and no painter: the halftone is CSS');
  });

  // Spec §2.4: the two classic riso inks, and where they overprint, a third colour: the text and the digits are
  // printed in both drums, so their colour is the paper multiplied by both inks.
  DT.test('theme riso: two riso inks, and the overprint of both is the colour of the type', () => {
    const { stage, root } = mountPoster(singleAt(OPENING, 60));
    same(resolve(root, '--pro'), RED, 0, '正方 is Riso Bright Red');
    same(resolve(root, '--con'), BLUE, 0, '反方 is Riso Blue');
    const paper = rgba(getComputedStyle(root).backgroundColor);
    const over = paper.slice(0, 3).map((p, i) => p * RED[i] / 255 * BLUE[i] / 255);
    same(resolve(root, '--overprint'), over, 2, 'paper × red × blue');
    ['--ink', '--digits-on-field', '--digits-off-field', '--speaker-ink'].forEach(v => same(resolve(root, v), over, 2, v));
    stage.destroy();
  });

  // Spec §2.4: cool printing paper with a little grain.
  DT.test('theme riso: the ground is a cool white printing paper with a grain', () => {
    const { stage, root } = mountPoster(singleAt(OPENING, 60));
    const bg = getComputedStyle(root).backgroundColor;
    const [r, g, b] = rgba(bg);
    assert.ok(lum(bg) > 0.8, 'white: ' + bg);
    assert.ok(b >= r && g >= r, 'cool, not cream: ' + bg);
    assert.ok(/feTurbulence/.test(getComputedStyle(root.querySelector('.dt-backdrop')).backgroundImage), 'paper grain');
    stage.destroy();
  });

  // Spec §2.4: the field is a halftone screen: tiled dots of the side's ink, printed onto the paper (multiply).
  // The dots are thresholded from a cone per cell and a ramp (a halftone made the way a screen makes one), so their
  // size can vary across the field.
  DT.test('theme riso: the field is a halftone of the side\'s ink printed onto the paper', () => {
    const { stage, root } = mountPoster(singleAt(OPENING, 60));
    const field = root.querySelector('.dt-field');
    const cs = getComputedStyle(field);
    same(cs.backgroundColor, RED, 1, 'the ink');
    assert.equal(cs.mixBlendMode, 'multiply', 'printed onto the paper');
    const screen = pseudo(field, '::before');
    assert.ok(/radialGradient/.test(screen.backgroundImage) && /pattern/.test(screen.backgroundImage), 'a screen of dots');
    assert.ok(/linear-gradient/.test(screen.backgroundImage), 'a ramp that sizes the dots');
    assert.ok(/contrast\(/.test(screen.filter), 'thresholded into hard dots: ' + screen.filter);
    assert.equal(screen.mixBlendMode, 'screen', 'the dots take the ink, the rest stays paper');
    const f = field.getBoundingClientRect(), box = root.getBoundingClientRect();
    assert.ok(f.left <= box.left + 1 && f.right >= box.right - 1, 'across the sheet');
    assert.ok(f.top > root.querySelector('.dt-head').getBoundingClientRect().bottom, 'below the stage name and speaker');
    assert.ok(f.bottom < root.querySelector('.dt-bottom').getBoundingClientRect().top, 'above the bottom bar');
    const d = root.querySelector('.dt-clock[data-clock="main"] .dt-digits').getBoundingClientRect();
    assert.ok(d.top > f.top && d.bottom < f.bottom, 'the digits are printed over it');
    stage.destroy();
  });

  // Spec §1.5: the sides differ by more than the hue. As a riso prints each drum at its own screen angle, 正方's
  // dots run at one angle and 反方's at the mirror of it.
  DT.test('theme riso: 正方 and 反方 are screened at mirrored angles', () => {
    const angle = name => {
      const { stage, root } = mountPoster(singleAt(name, 60));
      const m = /rotate\((-?[\d.]+)\)/.exec(pseudo(root.querySelector('.dt-field'), '::before').backgroundImage);
      stage.destroy();
      assert.ok(m, name + ': a rotated screen');
      return Number(m[1]);
    };
    const pa = angle(OPENING), ca = angle(REBUTTAL);
    assert.ok(Math.abs(pa) > 5 && Math.abs(pa) < 40, 'a screen angle: ' + pa);
    assert.near(pa + ca, 0, 0.01, 'mirrored: ' + pa + ' / ' + ca);
  });

  // Spec §2.4: the less time is left, the smaller and sparser the dots. The ramp runs from the speaking side's seat
  // to where the dots die out, as far as the time left, and the dots at the seat shrink too.
  DT.test('theme riso: the dots thin toward the seat as the time runs out', () => {
    SEATINGS.forEach(([name, seat, from]) => {
      const at = secs => {
        const { stage, root } = mountPoster(singleAt(name, secs, seat), 1920, 1080);
        const field = root.querySelector('.dt-field');
        const out = { used: parseFloat(root.style.getPropertyValue('--used')), W: field.getBoundingClientRect().width,
          edge: length(field, 'var(--edge)'), seat: lum(resolve(field, '--dot-seat')),
          ramp: pseudo(field, '::before').backgroundImage };
        stage.destroy();
        return out;
      };
      const where = name + ' / ' + seat;
      const a = at(30), b = at(90);
      assert.near(a.edge, (1 - a.used) * a.W, 0.005 * a.W, where + ': as far as the time left');
      assert.near(b.edge, (1 - b.used) * b.W, 0.005 * b.W, where + ': as far as the time left, later');
      assert.ok(b.seat > a.seat, where + ': smaller dots at the seat: ' + a.seat + ' → ' + b.seat);
      assert.ok(a.ramp.indexOf('linear-gradient(to ' + (from === 'left' ? 'right' : 'left')) >= 0, where + ': from the seat');
    });
  });

  // Spec §2.4: the digits are printed in both drums, the second one off register by 3–5 px, so an edge of each ink
  // shows beside the overprinted body. A fine grain of uneven ink over all of it. One layer, never cut.
  DT.test('theme riso: the digits are overprinted, the drums 3–5 px off register, with a grain', () => {
    [[OPENING, 'pro'], [REBUTTAL, 'con']].forEach(([name, side]) => {
      [[1920, 1080], [1366, 768]].forEach(([w, h]) => {
        const { stage, root } = mountPoster(singleAt(name, 60), w, h);
        const where = side + ' ' + w;
        const digits = root.querySelector('.dt-clock[data-clock="main"] .dt-digits');
        assert.equal(getComputedStyle(root.querySelector('.dt-clock[data-clock="main"] .dt-digits-on')).display, 'none', where);
        assert.equal(getComputedStyle(digits).clipPath, 'none', where + ': not cut');
        assert.equal(getComputedStyle(digits).color, resolve(root, '--digits-on-field'), where);
        digits.querySelectorAll('.dt-min, .dt-colon, .dt-sec').forEach(part => {
          const cs = getComputedStyle(part);
          const sh = shadows(cs.textShadow);
          assert.equal(sh.length, 2, where + ': two drums: ' + cs.textShadow);
          const own = sh.find(s => isInk(s.color, inkOf(side))), other = sh.find(s => isInk(s.color, inkOf(side === 'pro' ? 'con' : 'pro')));
          assert.ok(own && other, where + ': one edge of each ink: ' + cs.textShadow);
          const off = Math.hypot(own.x - other.x, own.y - other.y) / 2;
          assert.ok(off >= 3 && off <= 5.5, where + ': off register by ' + off);
          assert.ok(/feTurbulence/.test(cs.maskImage || cs.webkitMaskImage), where + ': a grain of uneven ink');
        });
        stage.destroy();
      });
    });
  });

  // The grain and the misregistration are painted per part and the digits tense up in steps, so the colon's breathing
  // and the tension do not repaint the whole clock on every frame.
  DT.test('theme riso: the digits are not painted again on every frame', () => {
    const { stage, root } = mountPoster(singleAt(OPENING, 60));
    const digits = root.querySelector('.dt-clock[data-clock="main"] .dt-digits');
    const cs = getComputedStyle(digits);
    assert.equal(cs.filter, 'none');
    assert.ok(!/url/.test(cs.maskImage || cs.webkitMaskImage || 'none'), 'the grain sits on the parts');
    const fvs = t => { root.style.setProperty('--tension', String(t)); return getComputedStyle(digits).fontVariationSettings; };
    assert.equal(fvs(0.301), fvs(0.309), 'one frame\'s change of tension leaves the digits as they are');
    assert.ok(fvs(0.301) !== fvs(0.36), 'but they do tense up');
    stage.destroy();
  });

  // Spec §2.4: headings set like a poster: heavy and tight, with the top bar tracked out; the stage name printed in
  // both drums as the digits are.
  DT.test('theme riso: the stage name is heavy and tight, off register like the digits', () => {
    const { stage, root } = mountPoster(singleAt(OPENING, 60), 1920, 1080);
    const title = getComputedStyle(root.querySelector('.dt-title'));
    assert.ok(Number(title.fontWeight) >= 700, 'heavy: ' + title.fontWeight);
    assert.ok(px(title.letterSpacing) < 0, 'tight: ' + title.letterSpacing);
    assert.ok(!/serif/.test(title.fontFamily.split(',').pop()) || /sans-serif/.test(title.fontFamily), 'a sans: ' + title.fontFamily);
    const sh = shadows(title.textShadow);
    assert.ok(sh.some(s => isInk(s.color, RED)) && sh.some(s => isInk(s.color, BLUE)), 'both drums: ' + title.textShadow);
    const top = getComputedStyle(root.querySelector('.dt-top'));
    assert.ok(Number(top.fontWeight) >= 700, 'the top bar is bold: ' + top.fontWeight);
    assert.ok(px(top.letterSpacing) >= 0.2 * px(top.fontSize), 'and tracked out: ' + top.letterSpacing);
    stage.destroy();
  });

  // The warn bell point is a printer's registration mark, set where the halftone will have thinned out to at the
  // warn bell, and it stays whole on screen when that point is near the seat.
  DT.test('theme riso: the warn bell point is a registration mark on the halftone', () => {
    SEATINGS.forEach(([name, seat, from]) => {
      const { stage, root } = mountPoster(singleAt(name, 60, seat));
      const where = name + ' / ' + seat;
      const mark = root.querySelector('.dt-warnline');
      const cs = getComputedStyle(mark);
      assert.ok(!mark.hidden && cs.display !== 'none', where);
      assert.near(px(cs.width), px(cs.height), 1, where + ': a mark, not a line');
      const box = root.getBoundingClientRect();
      assert.ok(px(cs.height) < 0.1 * box.height && px(cs.height) > 0.03 * box.height, where + ': ' + cs.height);
      assert.ok(/circle/.test(cs.backgroundImage) && /line|path/.test(cs.backgroundImage), where + ': a target');
      // Heavy enough to find from the back of the hall, knocked out of the dots onto a disc of bare paper.
      const sw = /stroke-width='([\d.]+)'/.exec(decodeURIComponent(cs.backgroundImage));
      assert.ok(sw && Number(sw[1]) >= 2.2, where + ': strokes about a tenth of the mark: ' + (sw && sw[1]));
      assert.ok(px(cs.height) >= 0.085 * box.height, where + ': about 9cqh across: ' + cs.height);
      const disc = /<circle r='([\d.]+)' fill='%23EDF0EF'|<circle r='([\d.]+)' fill='#EDF0EF'/.exec(cs.backgroundImage) ||
        /<circle r='([\d.]+)' fill='#EDF0EF'/.exec(decodeURIComponent(cs.backgroundImage));
      assert.ok(disc, where + ': on a disc of paper');
      assert.ok(isInk('#EDF0EF', rgba(resolve(root, '--ground')).slice(0, 3)), where + ': the disc is the paper');
      const t = mark.getBoundingClientRect(), f = root.querySelector('.dt-field').getBoundingClientRect();
      assert.ok(t.top >= f.top && t.bottom <= f.bottom, where + ': on the halftone');
      const x = (t.left + t.width / 2 - box.left) / box.width;
      const warnAt = parseFloat(root.style.getPropertyValue('--warn-at'));
      assert.near(from === 'left' ? x : 1 - x, warnAt, 0.01, where + ': at the warn point');
      root.style.setProperty('--warn-at', '0.004');   // 30 s of an hour-long stage
      const n = mark.getBoundingClientRect();
      assert.ok(n.left >= box.left && n.right <= box.right, where + ': whole near the seat: ' + n.left + '–' + n.right);
      stage.destroy();
    });
  });

  // In warn the second drum skips the colon: it prints in the side's ink alone.
  DT.test('theme riso: after the warn bell the colon prints in the side\'s ink', () => {
    const { stage, root } = mountPoster(singleAt(OPENING, 160));
    assert.equal(root.dataset.phase, 'warn');
    same(getComputedStyle(root.querySelector('.dt-clock[data-clock="main"] .dt-digits .dt-colon')).color, RED, 1, 'red');
    stage.destroy();
  });

  // Overtime: the second drum slips far off register, a 超时 block is printed in the side's ink, and a stub of the
  // side's dots stays at the seat, clear of the digits, so the room still sees whose floor it is (spec §1.5).
  DT.test('theme riso: in overtime the drums slip, a 超时 block is printed and the seat keeps a stub of dots', () => {
    SEATINGS.forEach(([name, seat, from]) => {
      const probe = mountPoster(singleAt(name, 60, seat), 1920, 1080);
      const secs = 60 / parseFloat(probe.root.style.getPropertyValue('--used'));
      const calm = shadows(getComputedStyle(probe.root.querySelector('.dt-clock[data-clock="main"] .dt-sec')).textShadow);
      probe.stage.destroy();
      const { stage, root } = mountPoster(singleAt(name, secs + 7, seat), 1920, 1080);
      const where = name + ' / ' + seat;
      assert.equal(root.dataset.phase, 'over', where);
      const side = root.dataset.side;
      const sec = root.querySelector('.dt-clock[data-clock="main"] .dt-sec');
      const over = shadows(getComputedStyle(sec).textShadow);
      const spread = s => Math.hypot(s[0].x - s[1].x, s[0].y - s[1].y);
      assert.ok(spread(over) > 2.5 * spread(calm), where + ': slipped: ' + spread(calm) + ' → ' + spread(over));
      same(getComputedStyle(root.querySelector('.dt-clock[data-clock="main"] .dt-digits')).color, rgba(resolve(root, '--overprint')), 1, where + ': still overprinted');
      const block = pseudo(root.querySelector('.dt-deco-over'), '::after');
      assert.ok(shown(block) && /超时/.test(block.content), where + ': ' + block.content);
      assert.ok(isInk(block.backgroundColor, inkOf(side)), where + ': in the side\'s ink: ' + block.backgroundColor);
      const field = root.querySelector('.dt-field');
      assert.ok(getComputedStyle(field).display !== 'none', where + ': the halftone');
      const box = root.getBoundingClientRect();
      const stub = length(field, 'var(--edge)');
      assert.near(stub, 0.07 * box.width, 2, where + ': a stub of 7cqw');
      const inner = from === 'left' ? box.left + stub : box.right - stub;
      const d = root.querySelector('.dt-clock[data-clock="main"] .dt-digits').getBoundingClientRect();
      assert.ok(from === 'left' ? inner + 0.02 * box.width < d.left : inner - 0.02 * box.width > d.right, where + ': clear of the digits');
      stage.destroy();
    });
    const calm = mountPoster(singleAt(OPENING, 60));
    assert.ok(!shown(pseudo(calm.root.querySelector('.dt-deco-over'), '::after')), 'no 超时 before the time is up');
    calm.stage.destroy();
  });

  // Spec §2.4: two posters side by side; the speaking side's is freshly printed, the other faded. Each half's
  // dots thin from its top down as its time goes.
  DT.test('theme riso: in free debate the speaking side\'s poster is freshly printed, the other faded', () => {
    ['left', 'right'].forEach(seat => {
      const { stage, root } = mountPoster(dualAt(30, seat));
      const half = side => root.querySelector('.dt-half[data-side="' + side + '"]');
      const pro = half('pro'), con = half('con');
      assert.ok(con.hasAttribute('data-active'), seat);
      [pro, con].forEach(h => assert.equal(getComputedStyle(h).backgroundColor, 'rgba(0, 0, 0, 0)', seat + ': the paper runs under both'));
      assert.equal(getComputedStyle(root.querySelector('.dt-halves')).mixBlendMode, 'multiply', seat + ': printed onto the paper');
      assert.equal(getComputedStyle(pro).filter, 'none', seat + ': faded by its ink, not greyed by a filter');
      const inkCon = getComputedStyle(con.querySelector('.dt-half-field')).backgroundColor;
      const inkPro = getComputedStyle(pro.querySelector('.dt-half-field')).backgroundColor;
      assert.ok(isInk(inkCon, BLUE), seat + ': fresh: ' + inkCon);
      assert.ok(lum(inkPro) > lum('rgb(' + RED + ')') + 0.15, seat + ': faded: ' + inkPro);
      [pro, con].forEach(h => {
        const f = h.querySelector('.dt-half-field');
        assert.ok(/to top/.test(pseudo(f, '::before').backgroundImage), seat + ': dots thin upward from the floor');
        const digits = getComputedStyle(h.querySelector('.dt-digits')).color;
        const c = contrast(digits, getComputedStyle(f).backgroundColor);
        assert.ok(c >= 3, seat + ' ' + h.dataset.side + ': the digits read on the ink: ' + c.toFixed(2));
      });
      const ap = /rotate\((-?[\d.]+)\)/.exec(pseudo(pro.querySelector('.dt-half-field'), '::before').backgroundImage);
      const ac = /rotate\((-?[\d.]+)\)/.exec(pseudo(con.querySelector('.dt-half-field'), '::before').backgroundImage);
      assert.ok(ap && ac && Number(ap[1]) === -Number(ac[1]), seat + ': mirrored screens');
      stage.destroy();
    });
    const at = secs => {
      const { stage, root } = mountPoster(dualAt(secs));
      const h = root.querySelector('.dt-half[data-side="con"]');
      const f = h.querySelector('.dt-half-field');
      const out = { remain: parseFloat(h.style.getPropertyValue('--remain')), H: f.getBoundingClientRect().height,
        edge: length(f, 'var(--edge)', 'height'), seat: lum(resolve(f, '--dot-seat')) };
      stage.destroy();
      return out;
    };
    const a = at(30), b = at(60);
    assert.ok(b.remain < a.remain);
    assert.near(a.edge, a.remain * a.H, 0.01 * a.H, 'the dots reach as high as the time left');
    assert.near(b.edge, b.remain * b.H, 0.01 * b.H, 'later, lower');
    assert.ok(b.seat > a.seat, 'and they are smaller at the floor');
  });

  DT.test('theme riso: a thumbnail keeps a coarse screen without the fine grain', () => {
    const screen = (w, h) => {
      const { stage, root } = mountPoster(singleAt(OPENING, 60), w, h);
      const f = root.querySelector('.dt-field');
      const out = { pitch: length(f, 'var(--dot-pitch)') / h, image: pseudo(f, '::before').backgroundImage };
      stage.destroy();
      return out;
    };
    const big = screen(1920, 1080), small = screen(240, 135);
    assert.ok(small.pitch > 1.3 * big.pitch, 'coarser on a thumbnail: ' + big.pitch + ' vs ' + small.pitch);
    assert.ok(/feTurbulence/.test(big.image), 'the ink grain on the projector');
    assert.ok(!/feTurbulence/.test(small.image), 'not on a thumbnail, where it is only noise');
  });

  // The title card: each motion is marked with a block of its side's ink; the side labels over the team names are
  // in the overprint, readable. They are small type, so they print in register: the drums' offset would smear them.
  DT.test('theme riso: on the title card the motions and teams carry their side\'s ink', () => {
    const { stage, root } = mountPoster(E.view(E.createSession(F(), MATCH, T0, { theme: 'riso' }), T0));
    assert.equal(root.dataset.mode, 'title');
    const paper = getComputedStyle(root).backgroundColor;
    ['pro', 'con'].forEach(side => {
      const mark = pseudo(root.querySelector('.dt-motion[data-side="' + side + '"]'), '::before');
      assert.ok(isInk(mark.backgroundColor, inkOf(side)), side + ': ' + mark.backgroundColor);
      const label = pseudo(root.querySelector('.dt-teams span[data-side="' + side + '"]'), '::before');
      assert.ok(contrast(label.color, paper) >= 4.5, side + ' label reads: ' + label.color);
      assert.equal(label.textShadow, 'none', side + ': no misregistration on small type');
    });
    stage.destroy();
  });

  // Misregistration is for type of 4cqh and up: every piece of text on every scene that carries the two drums'
  // offset is at least that large; the small labels (正方 / 反方 over the teams, about 2.2cqh) print in the overprint.
  DT.test('theme riso: only large type is printed off register', () => {
    const scenes = [E.view(E.createSession(F(), MATCH, T0, { theme: 'riso' }), T0), singleAt(OPENING, 60), dualAt(30)];
    scenes.forEach(view => {
      const { stage, root } = mountPoster(view, 1920, 1080);
      const H = root.getBoundingClientRect().height;
      const els = [root].concat(Array.from(root.querySelectorAll('*')));
      els.forEach(el => ['', '::before', '::after'].forEach(which => {
        const cs = which ? getComputedStyle(el, which) : getComputedStyle(el);
        if (which && (cs.content === 'none' || cs.content === 'normal')) return;
        if (el.closest('[hidden]') || cs.display === 'none') return;
        const two = shadows(cs.textShadow).filter(sh => isInk(sh.color, inkOf('pro')) || isInk(sh.color, inkOf('con')));
        if (two.length < 2) return;
        const text = which ? cs.content : Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
        if (!text || text === '""') return;
        assert.ok(px(cs.fontSize) >= 0.04 * H - 0.5, root.dataset.mode + ' ' + (el.className || el.tagName) + which + ' "' + text + '" at ' + cs.fontSize);
      }));
      stage.destroy();
    });
  });

  // The title card and the break are the poster's picture: a halftone disc of each ink rising from its side's seat,
  // each printed onto the paper as its own drum.
  DT.test('theme riso: the title card and the break show a halftone disc of each ink at its side\'s seat', () => {
    const title = seat => E.view(E.createSession(F(), Object.assign({}, MATCH, { proSeat: seat }), T0, { theme: 'riso' }), T0);
    const brk = seat => {
      const s = E.createSession(F(), Object.assign({}, MATCH, { proSeat: seat }), T0, { theme: 'riso' });
      return E.view(E.goto(s, F().stages.findIndex(x => x.type === 'break'), T0), T0);
    };
    [title, brk].forEach(make => ['left', 'right'].forEach(seat => {
      const { stage, root } = mountPoster(make(seat));
      const where = root.dataset.mode + '/' + root.dataset.kind + ' / ' + seat;
      [['.dt-deco', 'pro'], ['.dt-deco-over', 'con']].forEach(([sel, side]) => {
        const el = root.querySelector(sel);
        const cs = getComputedStyle(el);
        assert.ok(isInk(cs.backgroundColor, inkOf(side)), where + ' ' + side + ': ' + cs.backgroundColor);
        assert.equal(cs.mixBlendMode, 'multiply', where + ' ' + side);
        const disc = pseudo(el, '::before');
        assert.ok(shown(disc) && /contrast\(/.test(disc.filter), where + ' ' + side + ': a halftone');
        const atSeat = (side === 'pro') === (seat === 'left') ? 'left' : 'right';
        const x = length(el, 'var(--disc-x)') / el.getBoundingClientRect().width;
        assert.near(x, atSeat === 'left' ? 0 : 1, 0.01, where + ' ' + side + ': at its seat');
      });
      stage.destroy();
    }));
    const { stage, root } = mountPoster(singleAt(OPENING, 60));
    assert.ok(!shown(pseudo(root.querySelector('.dt-deco'), '::before')), 'not on a speaking stage');
    stage.destroy();
  });

  // A clock that is not running keeps a solid colon: stage.css's faded .55 colon with both drums' shadows would sink
  // into dots of its own size and value, so an idle clock would read '4 00'. The 暂停 line already says it waits.
  DT.test('theme riso: a clock that is not running prints a solid colon without the misregistration', () => {
    const idle = seat => E.view(session('自由辩论', seat), T0);
    ['left', 'right'].forEach(seat => {
      [['dual-idle', idle(seat), ['pro', 'con']], ['dual', dualAt(30, seat), ['pro']]].forEach(([what, view, waiting]) => {
        const { stage, root } = mountPoster(view, 1920, 1080);
        waiting.forEach(side => {
          const clock = root.querySelector('.dt-half[data-side="' + side + '"] .dt-clock');
          assert.equal(clock.getAttribute('data-running'), 'false', what + ' / ' + seat + ' ' + side);
          const cs = getComputedStyle(clock.querySelector('.dt-digits:not(.dt-digits-on) .dt-colon'));
          assert.equal(cs.opacity, '1', what + ' / ' + seat + ' ' + side + ': solid');
          assert.equal(cs.textShadow, 'none', what + ' / ' + seat + ' ' + side + ': no fringes');
          same(cs.color, rgba(resolve(root, '--overprint')), 1, what + ' / ' + seat + ' ' + side + ': overprint');
        });
        stage.destroy();
      });
    });
    // The running clock keeps the breathing, misregistered colon.
    const { stage, root } = mountPoster(dualAt(30), 1920, 1080);
    const run = root.querySelector('.dt-half[data-active] .dt-clock');
    assert.equal(run.getAttribute('data-running'), 'true');
    const colon = run.querySelector('.dt-digits:not(.dt-digits-on) .dt-colon');
    assert.equal(shadows(getComputedStyle(colon).textShadow).length, 2, 'running: both drums');
    assert.ok(/dt-breathe/.test(getComputedStyle(colon).animationName), 'running: breathes');
    stage.destroy();
  });

  // Main spec §5.4: the end card marks overtime. The accent is the overprint here, so the rows are marked the riso
  // way: a highlighter stroke of red ink under the navy text, which still reads at 4.5:1 on the tinted band.
  DT.test('theme riso: overtime rows of the record carry a stroke of red ink', () => {
    let s = E.toggle(session(OPENING), T0);
    const t = T0 + 200000;   // 3:00 planned, 3:20 used
    s = E.goto(s, 99, t);
    const { stage, root } = mountPoster(Object.assign(E.view(s, t), { record: E.record(s, t) }), 1920, 1080);
    assert.equal(root.dataset.mode, 'end');
    const paper = rgba(getComputedStyle(root).backgroundColor);
    const over = root.querySelector('.dt-record tr[data-over]');
    assert.ok(over, 'an overtime row');
    Array.from(over.cells).forEach((td, i) => {
      const bs = getComputedStyle(td).boxShadow;
      if (i < 2) { assert.equal(bs, 'none', 'name and plan unmarked'); return; }
      assert.ok(/inset/.test(bs), 'a stroke under cell ' + i + ': ' + bs);
      const m = /^((?:rgba?|color)\([^)]*\))/.exec(bs) || /((?:rgba?|color)\([^)]*\))/.exec(bs);
      const ink = rgba(m[1]);
      assert.near(ink[3], 0.6, 0.02, 'a tint of the ink');
      same('rgb(' + ink.slice(0, 3) + ')', RED, 1, 'red ink');
      const band = RED.map((v, k) => ink[3] * v + (1 - ink[3]) * paper[k]);
      const c = contrast(getComputedStyle(td).color, 'rgb(' + band.map(Math.round) + ')');
      assert.ok(c >= 4.5, 'the text reads on the band: ' + c.toFixed(2));
    });
    root.querySelectorAll('.dt-record tr:not([data-over]) td').forEach(td => assert.equal(getComputedStyle(td).boxShadow, 'none', 'no stroke on time kept'));
    stage.destroy();
  });
})();
