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
  // A halftone's ramp, its second image (black to the threshold's grey over the image's first 40th, then white), as
  // placed from its seat: the edge it is placed from, how far behind the seat it starts, how far from the seat it
  // reaches the grey (where the dots die out), and the grey it passes the seat at (0 black, .5 the threshold).
  // Positions read "-12px 0px", "right -12px top 0px" or "left 0px bottom -12px".
  function ramp(cs, vertical) {
    const size = cs.backgroundSize.split(',')[1].trim().split(/\s+/);
    const pos = cs.backgroundPosition.split(',')[1].trim().split(/\s+/);
    const len = px(size[vertical ? 1 : 0]) / 40;
    const four = pos.length === 4;
    const from = four ? pos[vertical ? 2 : 0] : (vertical ? 'top' : 'left');
    const back = -px(four ? pos[vertical ? 3 : 1] : pos[vertical ? 1 : 0]);
    return { from, back, reach: len - back, grey: 0.5 * back / len };
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

  // Spec §2.4: cool printing paper with a little grain. The grain and the registration targets are drawn by the
  // backdrop's ::before, apart from the light: stage.css reaches --backdrop through var(), and an image there (or one
  // beside a gradient) would be taken as new, and the whole sheet painted again, at every step of the clock.
  DT.test('theme riso: the ground is a cool white printing paper with a grain', () => {
    const { stage, root } = mountPoster(singleAt(OPENING, 60));
    const bg = getComputedStyle(root).backgroundColor;
    const [r, g, b] = rgba(bg);
    assert.ok(lum(bg) > 0.8, 'white: ' + bg);
    assert.ok(b >= r && g >= r, 'cool, not cream: ' + bg);
    const backdrop = root.querySelector('.dt-backdrop');
    const light = getComputedStyle(backdrop).backgroundImage, paper = pseudo(backdrop, '::before').backgroundImage;
    assert.ok(/feTurbulence/.test(paper), 'paper grain');
    assert.equal((paper.match(/<circle r='6'\/>/g) || []).length, 4, 'a target in each upper corner, in both drums');
    assert.ok(/^radial-gradient/.test(light) && !/url\(/.test(light), 'the light alone on the backdrop: ' + light.slice(0, 60));
    assert.ok(!/gradient\(/.test(paper), 'no gradient beside the images: ' + paper.slice(0, 60));
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
    assert.ok(/linearGradient/.test(screen.backgroundImage), 'a ramp that sizes the dots');
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
  // to where the dots die out, as far as the time left, and the dots at the seat shrink too: the ramp passes the seat
  // at a grey a quarter of the way to white times the time used (touching dots when it is full).
  DT.test('theme riso: the dots thin toward the seat as the time runs out', () => {
    SEATINGS.forEach(([name, seat, from]) => {
      const at = secs => {
        const { stage, root } = mountPoster(singleAt(name, secs, seat), 1920, 1080);
        const field = root.querySelector('.dt-field');
        const out = { used: parseFloat(root.style.getPropertyValue('--used')), W: field.getBoundingClientRect().width,
          edge: length(field, 'var(--edge)'), ramp: ramp(pseudo(field, '::before')) };
        stage.destroy();
        return out;
      };
      const where = name + ' / ' + seat;
      const a = at(30), b = at(90);
      assert.near(a.edge, (1 - a.used) * a.W, 0.005 * a.W, where + ': as far as the time left');
      assert.near(b.edge, (1 - b.used) * b.W, 0.005 * b.W, where + ': as far as the time left, later');
      [a, b].forEach(x => {
        assert.near(x.ramp.reach, x.edge, 1, where + ': the dots die out at the edge');
        assert.near(x.ramp.grey, 0.25 * x.used, 0.003, where + ': the grey at the seat');
      });
      assert.ok(b.ramp.grey > a.ramp.grey, where + ': smaller dots at the seat: ' + a.ramp.grey + ' → ' + b.ramp.grey);
      assert.equal(a.ramp.from, from, where + ': from the seat');
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

  // The grain and the misregistration are painted per part, so the colon's breathing does not repaint the whole clock
  // on every frame; the tension changes only in the renderer's steps of 0.02 (render.test.js).
  DT.test('theme riso: the digits are not painted again on every frame', () => {
    const { stage, root } = mountPoster(singleAt(OPENING, 60));
    const digits = root.querySelector('.dt-clock[data-clock="main"] .dt-digits');
    const cs = getComputedStyle(digits);
    assert.equal(cs.filter, 'none');
    assert.ok(!/url/.test(cs.maskImage || cs.webkitMaskImage || 'none'), 'the grain sits on the parts');
    const fvs = t => { root.style.setProperty('--tension', String(t)); return getComputedStyle(digits).fontVariationSettings; };
    assert.ok(fvs(0.3) !== fvs(0.36), 'the digits tense up');
    stage.destroy();
  });

  // Top-level items of a computed list: commas inside a url() or a function do not split it.
  function items(value) {
    const out = [];
    let depth = 0, quote = '', cur = '';
    for (const ch of value) {
      if (quote) { cur += ch; if (ch === quote) quote = ''; continue; }
      if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }

  // Consistency review §6.1: render.js writes --used (and in free debate --remain) on every step of the clock, so
  // every box has its style worked out again many times a second. Chromium takes an image as new, and paints its box
  // again with any filter on it, at each of those when the url() reaches the declaration through var(), or when one
  // background or mask list holds a url() image and a gradient together. So no image is kept in a variable or written
  // beside a var(), and no list mixes the two: the paper is painted once, the halftones only when the time left moves
  // a step, the digits only when they change.
  DT.test('theme riso: no image reaches a rule through a variable or shares a list with a gradient', () => {
    let seen = 0;
    Array.from(document.styleSheets).forEach(sh => {
      let rules;
      try { rules = sh.cssRules; } catch (e) { return; }
      Array.from(rules).forEach(function walk(r) {
        if (r.cssRules) Array.from(r.cssRules).forEach(walk);
        if (!r.style || !/data-theme="riso"/.test(r.selectorText || '')) return;
        seen++;
        for (let i = 0; i < r.style.length; i++) {
          const name = r.style[i], v = r.style.getPropertyValue(name);
          if (!/url\(\s*["']?data:/.test(v)) continue;
          assert.ok(name.indexOf('--') !== 0, r.selectorText + ': ' + name + ' holds an image');
          assert.ok(!/var\(/.test(v), r.selectorText + ' ' + name + ': an image beside a var()');
        }
      });
    });
    assert.ok(seen > 40, 'read the theme\'s rules: ' + seen);
    const title = E.view(E.createSession(F(), MATCH, T0, { theme: 'riso' }), T0);
    const brk = E.view(E.toggle(E.goto(E.createSession(F(), MATCH, T0, { theme: 'riso' }),
      F().stages.findIndex(x => x.type === 'break'), T0), T0), T0 + 5000);
    [[singleAt(OPENING, 60)], [singleAt(REBUTTAL, 60, 'right')], [singleAt(OPENING, 187)], [dualAt(30)], [title], [brk],
      [singleAt(OPENING, 60), 240, 135], [dualAt(30), 240, 135], [title, 240, 135]].forEach(([view, w, h]) => {
      const { stage, root } = mountPoster(view, w || 960, h || 540);
      let images = 0;
      root.querySelectorAll('*').forEach(el => [null, '::before', '::after'].forEach(p => {
        const cs = getComputedStyle(el, p);
        const where = root.dataset.mode + '/' + root.dataset.kind + '/' + root.dataset.phase + ' ' + (w || 960) + ' ' +
          (typeof el.className === 'string' ? el.className : el.tagName) + (p || '');
        ['backgroundImage', 'maskImage', 'webkitMaskImage'].forEach(prop => {
          const list = items(cs[prop] || 'none').filter(x => x !== 'none');
          const urls = list.filter(x => /^url\(/.test(x)).length;
          images += urls;
          assert.ok(urls === 0 || urls === list.length, where + ' ' + prop + ': ' + list.map(x => x.slice(0, 28)).join(' | '));
        });
      }));
      assert.ok(images > 3, root.dataset.mode + ': the images were read: ' + images);
      stage.destroy();
    });
  });

  // The step the halftones wait for: the field reads the time left as --remain-q, --used rounded to .0025 (400 steps
  // a stage, one every 450 ms on a 3:00 stage), and a poster its --remain rounded alike, so the thresholded screen is
  // painted again only when that moves, not at each of the renderer's writes. Where round() is missing the stylesheet
  // falls back to the exact time left, and there is no step to find.
  DT.test('theme riso: the halftones move only when the time left moves a step of .0025', () => {
    if (!CSS.supports('width: round(nearest, 1px, 1px)')) return;
    const screen = el => { const cs = pseudo(el, '::before'); return cs.backgroundSize + ' | ' + cs.backgroundPosition; };
    const { stage, root } = mountPoster(singleAt(OPENING, 60));
    const field = root.querySelector('.dt-field');
    const at = used => { root.style.setProperty('--used', String(used)); return screen(field); };
    assert.equal(at(0.3001), at(0.3010), 'the field: within a step');
    assert.ok(at(0.3001) !== at(0.3015), 'the field: across one');
    stage.destroy();
    const d = mountPoster(E.view(E.floor(session('自由辩论'), 'pro', T0), T0 + 5000));
    const half = d.root.querySelector('.dt-half[data-side="pro"]'), poster = half.querySelector('.dt-half-field');
    const left = remain => { half.style.setProperty('--remain', String(remain)); return screen(poster); };
    assert.equal(left(0.7001), left(0.7010), 'a poster: within a step');
    assert.ok(left(0.7001) !== left(0.7015), 'a poster: across one');
    d.stage.destroy();
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
  // side's dots stays at the seat, clear of the digit row, so the room still sees whose floor it is (spec §1.5). The
  // row is the digits and the "+" hung outside their box (stage.css); on a 16:9 stage both stay clear of the stub.
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
      const sign = root.querySelector('.dt-clock[data-clock="main"] .dt-sign');
      assert.equal(sign.textContent, '+', where + ': the sign is up');
      const d = root.querySelector('.dt-clock[data-clock="main"] .dt-digits').getBoundingClientRect(), g = sign.getBoundingClientRect();
      const row = { left: Math.min(d.left, g.left), right: Math.max(d.right, g.right) };
      assert.ok(from === 'left' ? inner + 0.02 * box.width < row.left : inner - 0.02 * box.width > row.right,
        where + ': clear of the digits and the sign: the stub to ' + inner + ', the row ' + row.left + '–' + row.right);
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
        assert.equal(ramp(pseudo(f, '::before'), true).from, 'bottom', seat + ': dots thin upward from the floor');
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
        edge: length(f, 'var(--edge)', 'height'), ramp: ramp(pseudo(f, '::before'), true) };
      stage.destroy();
      return out;
    };
    const a = at(30), b = at(60);
    assert.ok(b.remain < a.remain);
    assert.near(a.edge, a.remain * a.H, 0.01 * a.H, 'the dots reach as high as the time left');
    assert.near(b.edge, b.remain * b.H, 0.01 * b.H, 'later, lower');
    [a, b].forEach(x => assert.near(x.ramp.reach, x.edge, 1, 'the ramp reaches the grey there'));
    assert.ok(b.ramp.grey > a.ramp.grey, 'and they are smaller at the floor');
  });

  // Near the end of a side's time the stretched ramp is short: the poster above it is still white paper, not a full
  // screen of dots, and with no time left it is blank.
  DT.test('theme riso: a poster with little time left keeps its paper white above the dots', () => {
    const { stage, root } = mountPoster(dualAt(30), 1920, 1080);
    const f = root.querySelector('.dt-half[data-side="con"] .dt-half-field');
    const H = f.getBoundingClientRect().height;
    [0.01, 0.0025, 0].forEach(q => {
      f.style.setProperty('--remain-q', String(q));
      const cs = pseudo(f, '::before'), r = ramp(cs, true);
      const sizes = cs.backgroundSize.split(','), pos = cs.backgroundPosition.split(',');
      const top = r.reach + 39 * (r.reach + r.back);   // the ramp image's white runs up to here
      const white = /^left 0px bottom (-?[\d.]+)px$/.exec(pos[2].trim());
      assert.ok(white && sizes[2].trim() === '100% 100%', q + ': a sheet of white: ' + pos[2] + ' / ' + sizes[2]);
      assert.ok(Number(white[1]) <= Math.max(top, 0) + 0.5, q + ': it starts below the ramp\'s own white ends: ' + white[1] + ' / ' + top);
      assert.ok(Number(white[1]) >= r.reach - 0.5, q + ': and above the dots: ' + white[1] + ' / ' + r.reach);
      assert.ok(top < H || q > 0.005, q + ': (the ramp alone would not reach the top: ' + top + ' / ' + H + ')');
    });
    stage.destroy();
  });

  DT.test('theme riso: a thumbnail keeps a coarse screen without the fine grain', () => {
    const screen = (w, h) => {
      const { stage, root } = mountPoster(singleAt(OPENING, 60), w, h);
      const f = root.querySelector('.dt-field'), b = root.querySelector('.dt-backdrop');
      const out = { pitch: length(f, 'var(--dot-pitch)') / h, image: pseudo(f, '::before').backgroundImage,
        paper: pseudo(b, '::before').backgroundImage, light: getComputedStyle(b).backgroundImage };
      stage.destroy();
      return out;
    };
    const big = screen(1920, 1080), small = screen(240, 135);
    assert.ok(small.pitch > 1.3 * big.pitch, 'coarser on a thumbnail: ' + big.pitch + ' vs ' + small.pitch);
    assert.ok(/feTurbulence/.test(big.image), 'the ink grain on the projector');
    assert.ok(!/feTurbulence/.test(small.image), 'not on a thumbnail, where it is only noise');
    assert.ok(/feTurbulence/.test(big.paper) && !/feTurbulence/.test(small.paper), 'nor the paper\'s tooth');
    assert.equal((small.paper.match(/<circle r='6'\/>/g) || []).length, 4, 'the targets stay');
    assert.equal(small.light, 'none', 'and the sheet is flat');
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

  // ---- motion (design/riso-final.md) ----

  const firstColor = value => { const m = /((?:rgba?|color)\([^)]*\))/.exec(value || ''); return m ? m[1] : ''; };
  const alpha = css => rgba(css)[3];
  // Every transition and one-shot on the stage run to its end (loops keep going).
  const settleAll = root => root.getAnimations({ subtree: true })
    .filter(a => a.effect.getComputedTiming().endTime !== Infinity).forEach(a => a.finish());
  // The duration, delay and easing a computed transition list gives one property, or null.
  const listAt = (cs, name) => {
    const props = cs.transitionProperty.split(',').map(s => s.trim());
    const i = props.indexOf(name);
    if (i < 0) return null;
    const pick = list => { const a = list.split(',').map(s => s.trim()); return a[i % a.length]; };
    return { duration: pick(cs.transitionDuration), delay: pick(cs.transitionDelay), easing: pick(cs.transitionTimingFunction) };
  };

  // R4: the entrance prints in two passes. The first drum (the side's ink) comes with the sweep: the halftone, the
  // type's own-ink edge, and a solid colon in that ink; the second drum (the overprint and the other ink's edge,
  // landing from further off) 130 ms after each line of type starts to rise. It lands on the live values.
  DT.test('theme riso: a new stage is printed in two passes, the second drum 130 ms after the first', () => {
    const box = document.getElementById('sandbox');
    box.innerHTML = '<div class="dt-stage-host" style="width:960px;height:540px"></div>';
    const stage = R.mount(box.firstChild);
    stage.update(E.view(session(OPENING), T0));   // not started: the colon is solid
    const root = box.querySelector('.dt-stage');
    assert.ok(root.classList.contains('is-entering'));
    const clock = root.querySelector('.dt-clock[data-clock="main"]');
    const digits = clock.querySelector('.dt-digits');
    const d = getComputedStyle(digits);
    assert.equal(d.animationName, 'dt-riso-pass');
    assert.equal(d.animationDelay, '0.27s', 'the digits rise at 140 ms; their second drum 130 ms later');
    assert.equal(d.animationFillMode, 'backwards', 'never holds the pass after it lands');
    assert.equal(d.getPropertyValue('--riso-pass').trim(), '0', 'during the delay: the first pass only');
    const sec = getComputedStyle(digits.querySelector('.dt-sec'));
    assert.equal(alpha(sec.webkitTextFillColor), 0, 'no overprint body yet');
    const sh = shadows(sec.textShadow.replace(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/g,
      (m, r, g, b, a) => 'rgba(' + [r, g, b].map(v => Math.round(v * 255)).join(', ') + ', ' + (a || 1) + ')'));
    assert.ok(isInk(sh[0].color, RED), 'the own-ink edge is printed: ' + sec.textShadow);
    assert.equal(alpha(sh[1].color), 0, 'the other ink is not');
    const colon = getComputedStyle(digits.querySelector('.dt-colon'));
    assert.ok(isInk(colon.webkitTextFillColor, RED), 'a solid colon comes with the first drum, in the side\'s ink: ' + colon.webkitTextFillColor);
    assert.equal(colon.textShadow, 'none', 'and stays in register');
    const title = getComputedStyle(root.querySelector('.dt-title'));
    assert.equal(title.animationName, 'dt-rise, dt-riso-pass');
    assert.equal(title.animationDelay, '0s, 0.13s');
    assert.equal(getComputedStyle(root.querySelector('.dt-field')).animationTimingFunction, 'linear', 'the sheet is fed at one speed');
    // A still lands it: the overprint is down, both edges at the drums' offset.
    root.setAttribute('data-still', '');
    assert.equal(getComputedStyle(digits).getPropertyValue('--riso-pass').trim(), '1');
    assert.equal(alpha(getComputedStyle(digits.querySelector('.dt-sec')).webkitTextFillColor), 1);
    root.removeAttribute('data-still');
    root.classList.remove('is-entering');
    assert.equal(getComputedStyle(digits).animationName, 'none');
    stage.destroy();
  });

  // R7: the title card and the break print their discs in two passes, the pro drum then the con drum.
  DT.test('theme riso: the title card\'s discs come up drum by drum', () => {
    const box = document.getElementById('sandbox');
    box.innerHTML = '<div class="dt-stage-host" style="width:960px;height:540px"></div>';
    const stage = R.mount(box.firstChild);
    stage.update(E.view(E.createSession(F(), MATCH, T0, { theme: 'riso' }), T0));
    const root = box.querySelector('.dt-stage');
    const deco = getComputedStyle(root.querySelector('.dt-deco')), over = getComputedStyle(root.querySelector('.dt-deco-over'));
    assert.equal(deco.animationName, 'dt-fade-in');
    assert.equal(over.animationName, 'dt-fade-in');
    assert.equal(deco.animationDelay, '0s');
    assert.equal(over.animationDelay, '0.13s', 'the second drum');
    assert.equal(over.animationFillMode, 'backwards');
    stage.destroy();
    const s = mountPoster(singleAt(OPENING, 60));
    s.root.classList.add('is-entering');
    assert.equal(getComputedStyle(s.root.querySelector('.dt-deco')).animationName, 'none', 'not on a speaking stage');
    s.stage.destroy();
  });

  // R1, R2, R3: on a floor change the yielding poster fades with the shared --dim (its ink and its misregistration
  // together, on the switch's curve), the right-hand poster's screen hangs from its seat so its dots do not slide,
  // and the stage name's two edges stay with the seats.
  DT.test('theme riso: the free-debate posters fade with the switch, their screens fixed at the seats', () => {
    ['left', 'right'].forEach(seat => {
      const { stage, root } = mountPoster(dualAt(30, seat));
      const pro = root.querySelector('.dt-half[data-side="pro"]'), con = root.querySelector('.dt-half[data-side="con"]');
      const field = h => getComputedStyle(h.querySelector('.dt-half-field')).backgroundColor;
      const misreg = h => length(h, 'var(--misreg)', 'height') / root.getBoundingClientRect().height * 100;
      assert.near(misreg(con), 0.4, 0.01, seat + ': fresh drums .4cqh');
      assert.near(misreg(pro), 0.22, 0.01, seat + ': faded drums .22cqh');
      const faded = field(pro);
      pro.style.transition = 'none';   // read the colour at each --dim, not the shared transition's start
      pro.style.setProperty('--dim', '0.5');
      const half = field(pro);
      pro.style.setProperty('--dim', '0');
      const fresh = field(pro);
      pro.style.removeProperty('--dim');
      pro.style.removeProperty('transition');
      assert.ok(isInk(fresh, RED), seat + ': fresh at --dim 0: ' + fresh);
      assert.ok(lum(fresh) < lum(half) && lum(half) < lum(faded), seat + ': the ink fades with --dim: ' + [fresh, half, faded]);
      // A real switch: right after it, the poster that yields is still fresh; the fade runs on --dim.
      stage.update(E.view(E.floor(E.floor(E.floor(session('自由辩论', seat), 'pro', T0), 'con', T0 + 20000), 'pro', T0 + 30000), T0 + 30000));
      assert.ok(isInk(field(con), BLUE), seat + ': no one-frame cut: ' + field(con));
      settleAll(root);
      assert.ok(lum(field(con)) > lum('rgb(' + BLUE + ')') + 0.15, seat + ': then faded: ' + field(con));
      // The screens hang from the seats.
      const right = root.querySelector('.dt-half:last-child .dt-half-field'), left = root.querySelector('.dt-half:first-child .dt-half-field');
      // x of the grain and of the dot screen (the first layer and the last; the ramp and the white rise from the floor)
      const xs = el => pseudo(el, '::before').backgroundPosition.split(',').map(l => l.trim().split(/\s+/)[0]);
      const ends = el => [xs(el)[0], xs(el)[xs(el).length - 1]];
      assert.ok(ends(right).every(x => x === '100%'), seat + ': the right poster from its right edge: ' + xs(right));
      assert.ok(ends(left).every(x => /^0(px|%)$/.test(x)), seat + ': the left from its left: ' + xs(left));
      // The stage name: the left seat's ink up and to the left, whoever speaks.
      [dualAt(10, seat), dualAt(30, seat)].forEach(v => {
        stage.update(v);
        const sh = shadows(getComputedStyle(root.querySelector('.dt-title')).textShadow);
        const leftInk = seat === 'left' ? RED : BLUE;
        assert.ok(isInk(sh[0].color, leftInk) && sh[0].x < 0, seat + ' / ' + root.dataset.side + ': pinned: ' + sh[0].color);
      });
      stage.destroy();
    });
  });

  // R8: the colon's drum fringes ease with its colour (warn 300 ms) and with its opacity (stop and start, 200 ms).
  DT.test('theme riso: the colon\'s fringes ease', () => {
    const run = mountPoster(singleAt(OPENING, 60));
    const colon = c => getComputedStyle(c.root.querySelector('.dt-clock[data-clock="main"] .dt-digits .dt-colon'));
    const t = listAt(colon(run), 'text-shadow');
    assert.ok(t && t.duration === '0.2s', 'running / stopped: 200 ms: ' + colon(run).transition);
    assert.ok(listAt(colon(run), 'color'), 'keeps stage.css\'s colour transition');
    run.stage.destroy();
    const warn = mountPoster(singleAt(OPENING, 160));
    assert.equal(listAt(colon(warn), 'text-shadow').duration, '0.3s', 'warn: with the colour');
    warn.stage.destroy();
  });

  // R5: at the end bell the second drum slips over 450 ms; 超时 is stamped on the second bell (320 ms); the stub's
  // dots stay as they were until that bell, then print at full strength in one crisp step. The stamp and the hold
  // start with the overtime itself (not with the bell's data-bell, which can reach a projector a frame later); a
  // still and a thumbnail show the end state.
  DT.test('theme riso: overtime slips the drums, then stamps 超时 and inks the stub on the second bell', () => {
    SEATINGS.forEach(([name, seat, from]) => {
      const probe = mountPoster(singleAt(name, 60, seat), 1920, 1080);
      const secs = 60 / parseFloat(probe.root.style.getPropertyValue('--used'));
      probe.stage.destroy();
      const { stage, root } = mountPoster(singleAt(name, secs + 7, seat), 1920, 1080);
      const where = name + ' / ' + seat;
      const part = sel => getComputedStyle(root.querySelector('.dt-clock[data-clock="main"] .dt-digits ' + sel));
      ['.dt-min', '.dt-sec', '.dt-sign', '.dt-colon'].forEach(sel => {
        const t = listAt(part(sel), 'text-shadow');
        assert.ok(t && t.duration === '0.45s', where + ' ' + sel + ': the drum slips over 450 ms: ' + part(sel).transition);
      });
      assert.equal(listAt(part('.dt-sign'), 'opacity').duration, '0.3s', where + ': the sign still fades in');
      const block = () => pseudo(root.querySelector('.dt-deco-over'), '::after');
      const stub = () => pseudo(root.querySelector('.dt-field'), '::after');
      assert.equal(block().animationName, 'dt-stamp', where);
      assert.equal(block().animationDelay, '0.32s', where + ': on the second bell');
      assert.equal(block().animationFillMode, 'backwards', where);
      const s = stub();
      assert.ok(shown(s) && /contrast\(/.test(s.filter), where + ': the stub as it was, thresholded');
      assert.equal(s.animationName, 'dt-riso-hold', where);
      assert.equal(s.animationDuration, '0.32s', where);
      assert.ok(/steps\(1(, end)?\)|step-end/.test(s.animationTimingFunction), where + ': one crisp step: ' + s.animationTimingFunction);
      const r = ramp(s), under = pseudo(root.querySelector('.dt-field'), '::before');
      assert.near(r.grey, 0.25, 0.003, where + ': at the dots\' last size, the seat a quarter of the way to white: ' + r.grey);
      assert.near(r.reach, 0.07 * root.getBoundingClientRect().width, 1, where + ': dying out at the stub\'s edge: ' + r.reach);
      assert.equal(r.from, from, where + ': from the seat');
      const rot = cs => (/rotate\((-?[\d.]+)\)/.exec(cs.backgroundImage) || [])[1];
      assert.equal(rot(s), rot(under), where + ': through the field\'s own screen');
      assert.near(ramp(under).grey, 0, 0.001, where + ': over the stub at full strength');
      const W = root.getBoundingClientRect().width;
      assert.near(px(s.width), 0.1 * W, 2, where + ': only the stub');
      assert.near(from === 'left' ? px(s.left) : px(s.right), 0, 1, where + ': at the seat');
      root.setAttribute('data-still', '');
      assert.equal(block().animationName, 'none', where + ': a still shows it stamped');
      assert.ok(!shown(stub()), where + ': and the stub inked');
      stage.destroy();
    });
    const calm = mountPoster(singleAt(OPENING, 160));
    assert.ok(!shown(pseudo(calm.root.querySelector('.dt-field'), '::after')), 'no held dots before the time is up');
    calm.stage.destroy();
  });

  // R9, R6: a bell's ring is printed through both drums, solid: a stroke of the ring's side's ink and one of the
  // overprint, a misregistration apart, inside the clock (no blend mode there); the ink is lifted, the strokes
  // thinning to nothing as it spreads, never faded to a tint. Its ink is the ring's data-side, not the stage's.
  DT.test('theme riso: a bell rings in two solid strokes of its side\'s ink and the overprint', () => {
    const { stage, root } = mountPoster(singleAt(OPENING, 160));
    stage.pulse({ type: 'warn', clock: 'main' });
    const ring = root.querySelector('.dt-clock[data-clock="main"] .dt-ring');
    assert.ok(ring, 'a ring');
    const cs = getComputedStyle(ring), a = pseudo(ring, '::before'), b = pseudo(ring, '::after');
    assert.equal(px(cs.borderTopWidth), 0, 'no vector border');
    assert.equal(cs.opacity, '1', 'solid, never a tint');
    assert.equal(cs.animationName, 'dt-riso-ring, dt-riso-lift');
    [cs, a, b].forEach(x => assert.equal(x.mixBlendMode, 'normal', 'no blend inside the clock'));
    assert.ok(isInk(firstColor(a.boxShadow), RED), 'the side\'s drum: ' + a.boxShadow);
    same(firstColor(b.boxShadow), rgba(resolve(root, '--overprint')), 1, 'the overprint');
    assert.ok(/inset/.test(a.boxShadow) && /inset/.test(b.boxShadow), 'strokes');
    assert.ok(a.translate !== 'none' && b.translate === 'none', 'a misregistration apart: ' + a.translate);
    assert.ok(px(cs.getPropertyValue('--riso-ink-w')) > 0, 'printed: ' + cs.getPropertyValue('--riso-ink-w'));
    ring.getAnimations().forEach(x => x.finish());
    assert.equal(getComputedStyle(ring).getPropertyValue('--riso-ink-w').trim(), '0px', 'lifted: thinned to nothing');
    stage.destroy();
    // Free debate: pro runs out while con holds the floor's ink on the stage: the ring is still pro's.
    const d = mountPoster(dualAt(30));
    assert.equal(d.root.dataset.side, 'con');
    d.stage.pulse({ type: 'end', clock: 'pro' });
    const r = d.root.querySelector('.dt-half[data-side="pro"] .dt-ring');
    assert.ok(isInk(firstColor(pseudo(r, '::before').boxShadow), RED), 'pro\'s ring in pro\'s ink');
    d.stage.destroy();
  });

  // R9 (riso-final §2.9): the strokes thin in five held steps, so the ring is painted again five times in its 1100 ms,
  // not on every frame as an eased lift would have it.
  DT.test('theme riso: a ring\'s ink is lifted in five held steps', () => {
    const { stage, root } = mountPoster(singleAt(OPENING, 160));
    stage.pulse({ type: 'warn', clock: 'main' });
    const ring = root.querySelector('.dt-clock[data-clock="main"] .dt-ring');
    const lift = ring.getAnimations().find(a => a.animationName === 'dt-riso-lift');
    assert.ok(lift, 'the lift: ' + ring.getAnimations().map(a => a.animationName));
    const w = t => { lift.currentTime = t; return getComputedStyle(ring).getPropertyValue('--riso-ink-w').trim(); };
    assert.equal(w(10), w(380), 'held through the first step');
    assert.ok(w(380) !== w(390), 'then thinner at once: ' + w(380) + ' → ' + w(390));
    const seen = [];
    for (let t = 0; t < 1100; t += 10) { const v = w(t); if (v !== seen[seen.length - 1]) seen.push(v); }
    assert.equal(seen.length, 6, 'printed, five steps, the last to nothing: ' + seen.join(' → '));
    assert.equal(seen[5], '0px');
    stage.destroy();
  });

  // A break's chime is no side's: its ring is printed in the two inks, red up and to the left over blue, not in a
  // side's ink and the overprint.
  DT.test('theme riso: a break\'s chime rings in the two inks', () => {
    const brk = E.toggle(E.goto(E.createSession(F(), MATCH, T0, { theme: 'riso' }), F().stages.findIndex(x => x.type === 'break'), T0), T0);
    const { stage, root } = mountPoster(E.view(brk, T0 + 5000));
    stage.pulse({ type: 'end', clock: 'main' });
    const ring = root.querySelector('.dt-clock[data-clock="main"] .dt-ring');
    assert.equal(ring.dataset.side, 'none', 'no side\'s ring');
    const a = firstColor(pseudo(ring, '::before').boxShadow), b = firstColor(pseudo(ring, '::after').boxShadow);
    assert.ok(isInk(a, RED), 'the red drum: ' + a);
    assert.ok(isInk(b, BLUE), 'the blue drum: ' + b);
    stage.destroy();
  });

  // Shared G (yield) without re-printing the halftone every frame: a locked poster lifts off in place (300 ms opacity)
  // and its time left drops in one step after, never draining the dots frame by frame under the threshold filter.
  DT.test('theme riso: a yielded poster lifts off in place instead of draining', () => {
    let s = E.floor(session('自由辩论'), 'pro', T0);
    const { stage, root } = mountPoster(E.view(s, T0 + 5000));
    s = E.yieldTime(s, T0 + 5000);
    const view = E.view(s, T0 + 5000);
    const lockedHalf = view.clocks.find(c => c.locked);
    assert.ok(lockedHalf && lockedHalf.yielded > 0, 'pro yields');
    stage.update(view);
    const h = root.querySelector('.dt-half[data-side="' + lockedHalf.id + '"]');
    const f = getComputedStyle(h.querySelector('.dt-half-field'));
    assert.equal(listAt(f, 'opacity').duration, '0.3s', 'the poster lifts off over 300 ms');
    const t = listAt(getComputedStyle(h), '--remain');
    assert.ok(t && t.duration === '0s' && t.delay === '0.3s', 'the time left drops once the poster is gone: ' + getComputedStyle(h).transition);
    assert.ok(parseFloat(getComputedStyle(h).getPropertyValue('--remain')) > 0.5, 'the dots stay as they were while it lifts');
    settleAll(root);
    assert.equal(getComputedStyle(h.querySelector('.dt-half-field')).opacity, '0', 'then it is gone');
    assert.equal(parseFloat(getComputedStyle(h).getPropertyValue('--remain')), 0);
    stage.destroy();
  });
})();
