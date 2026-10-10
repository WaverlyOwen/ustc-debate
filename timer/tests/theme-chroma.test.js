(function () {
  const E = DT.engine, R = DT.render;
  const T0 = 1000000;
  const MATCH = { title: '测试', proMotion: '甲', conMotion: '乙', proTeam: '物理学院', conTeam: '化学院', proSeat: 'left' };
  const F = () => DT.BUILTIN_FORMATS.find(f => f.id === 'ustc-freshman-cup');
  const idx = name => F().stages.findIndex(s => s.name === name);
  const OPENING = '正方一辩开篇立论';        // pro, 3:00
  const CON_OPENING = '反方一辩开篇立论';    // con, 3:00
  const KEY = 'rgb(0, 177, 64)', PLATE = 'rgb(42, 45, 51)';
  const H = 540;                            // the host's height: 1cqh is 5.4px
  const cqh = n => n * H / 100;

  function host() {
    const box = document.getElementById('sandbox');
    box.innerHTML = '<div class="dt-stage-host" style="width:960px;height:' + H + 'px"></div>';
    return box.firstChild;
  }
  const root = () => document.querySelector('.dt-stage');
  const cs = (el, pseudo) => getComputedStyle(typeof el === 'string' ? root().querySelector(el) : el, pseudo || null);
  const MAIN = '.dt-clock[data-clock="main"]';
  const DIGITS = MAIN + ' .dt-digits:not(.dt-digits-on)';
  function resolve(el, value) {
    const probe = document.createElement('i');
    probe.style.color = value;
    el.appendChild(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  }
  // Any colour the browser computes (color-mix gives oklab()), as a canvas paints it.
  const ink = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  function rgb(c) {
    ink.clearRect(0, 0, 1, 1);
    ink.fillStyle = '#000';
    ink.fillStyle = c;
    ink.fillRect(0, 0, 1, 1);
    return Array.from(ink.getImageData(0, 0, 1, 1).data.slice(0, 3));
  }
  function sameColour(a, b, msg) {
    const x = rgb(a), y = rgb(b);
    assert.ok(x.every((v, i) => Math.abs(v - y[i]) <= 1), msg + ': ' + a + ' is not ' + b);
  }
  // The alpha of a computed colour: rgba(… a), oklab(… / a), color(… / a); 1 otherwise.
  function alpha(c) {
    let m = /^rgba\([^)]*,\s*([\d.]+)\)$/.exec(c);
    if (m) return parseFloat(m[1]);
    m = /\/\s*([\d.]+)\)$/.exec(c);
    return m ? parseFloat(m[1]) : 1;
  }
  // The px a background position stands back from the far edge: calc(100% - Npx).
  const fromFar = pos => { const m = /calc\(100% - ([\d.]+)px\)/.exec(pos); return m ? parseFloat(m[1]) : NaN; };
  // A matte's origin's x as a share of its box: 0 at its left, 1 at its right (a matte that is not there fails).
  function originX(st) {
    assert.equal(st.animationName, 'cr-matte', 'a matte');
    const x = parseFloat(st.transformOrigin) / parseFloat(st.width);
    assert.ok(isFinite(x), 'a matte with a box: ' + st.transformOrigin + ' of ' + st.width);
    return x;
  }
  // The clock's plate: its box, 2cqh above and below and 4cqh either side (chroma.css).
  function plate(clock) {
    const r = clock.getBoundingClientRect();
    return { left: r.left - cqh(4), right: r.right + cqh(4), top: r.top - cqh(2), bottom: r.bottom + cqh(2) };
  }

  const session = seat => E.createSession(F(), Object.assign({}, MATCH, { proSeat: seat || 'left' }), T0, { theme: 'chroma' });
  // A single stage started at T0 and seen running at `at` (a minute in); paused: stopped 5 s in, seen 4 s later.
  const single = (name, seat, at) => E.view(E.toggle(E.goto(session(seat), idx(name), T0), T0), at || T0 + 60000);
  const paused = name => { const s = E.toggle(E.toggle(E.goto(session(), idx(name), T0), T0), T0 + 5000); return E.view(s, T0 + 9000); };
  // The free debate: pro, then con holding the floor since 0:20, 70 s in.
  const dual = seat => E.view(E.floor(E.floor(E.goto(session(seat), idx('自由辩论'), T0), 'pro', T0), 'con', T0 + 20000), T0 + 70000);
  const dualIdle = () => E.view(E.goto(session(), idx('自由辩论'), T0), T0);
  // Pro runs out (4:00 a side) and the floor goes over to con.
  function locked() {
    const s = E.floor(E.goto(session(), idx('自由辩论'), T0), 'pro', T0);
    return E.view(E.tick(s, T0 + 240100).session, T0 + 240100);
  }
  const breakView = () => E.view(E.toggle(E.goto(session(), idx('评委打分'), T0), T0), T0 + 1000);
  const titleView = () => E.view(session(), T0);
  const endView = () => { const e = E.goto(session(), 99, T0); return Object.assign(E.view(e, T0), { record: E.record(e, T0) }); };

  function frozen(fn) {
    const url = window.location.href;
    try {
      history.replaceState(null, '', window.location.pathname + '?demo=single&frozen=1');
      fn();
    } finally { history.replaceState(null, '', url); }
  }
  function mounted(view, fn) {
    const h = R.mount(host());
    try { h.update(view); fn(root(), h); } finally { h.destroy(); }
  }

  // Every element and ::before / ::after on screen in the stage, with its computed style.
  function surfaces(r) {
    const out = [];
    [r].concat(Array.from(r.querySelectorAll('*'))).forEach(el => {
      if (!el.getClientRects().length) return;   // not rendered (display: none here or above)
      out.push({ el, pseudo: null, st: getComputedStyle(el) });
      ['::before', '::after'].forEach(p => {
        const st = getComputedStyle(el, p);
        if (st.content !== 'none' && st.content !== 'normal' && st.display !== 'none') out.push({ el, pseudo: p, st });
      });
    });
    return out;
  }
  const name = s => s.el.className + (s.pseudo || '');

  // A plate is never faded over the key (the theme's hard rule): every solid, non-key surface whose nearest solid
  // ground is the key is drawn by no running animation or transition that touches opacity, its own or an ancestor's.
  function fadesOverKey(r) {
    const solid = st => alpha(st.backgroundColor) === 1;
    const fading = (el, pseudo) => el.getAnimations({ subtree: true }).some(a => {
      const fx = a.effect;
      if (!fx || fx.target !== el || (fx.pseudoElement || null) !== pseudo) return false;
      if (a.transitionProperty) return a.transitionProperty === 'opacity';
      return fx.getKeyframes().some(k => 'opacity' in k);
    });
    const bad = [];
    surfaces(r).forEach(s => {
      if (!solid(s.st) || resolve(r, s.st.backgroundColor) === KEY) return;
      let ground = s.pseudo ? s.el : s.el.parentElement;
      while (ground && ground !== r && !solid(getComputedStyle(ground))) ground = ground.parentElement;
      if (getComputedStyle(ground || r).backgroundColor !== KEY) return;   // on a plate already
      if (s.pseudo && fading(s.el, s.pseudo)) bad.push(name(s));
      for (let n = s.el; n && n !== r.parentElement; n = n.parentElement) if (fading(n, null)) bad.push(name(s) + ' in ' + n.className);
    });
    return bad;
  }

  DT.test('theme chroma: a stage enters under key-coloured mattes, and no plate is faded over the key', () => {
    const MATTES = {
      single: [['.dt-head', '::after'], [DIGITS, '::after']],
      dual: [['.dt-head', '::after'], ['.dt-half:first-child', '::after'], ['.dt-half:last-child', '::after']],
      title: [['.dt-card', '::before'], ['.dt-card', '::after']],
      break: [['.dt-head', '::before'], ['.dt-head', '::after'], [DIGITS, '::before'], [DIGITS, '::after'],
        ['.dt-card', '::before'], ['.dt-card', '::after']],
      end: [['.dt-head', '::after'], ['.dt-card', '::before'], ['.dt-card', '::after']],
    };
    const views = { single: () => single(OPENING), dual: () => dual(), title: titleView, break: breakView, end: endView };
    Object.keys(views).forEach(where => mounted(views[where](), r => {
      assert.ok(r.classList.contains('is-entering'), where);
      MATTES[where].forEach(([sel, p]) => {
        const st = cs(sel, p);
        assert.equal(st.backgroundColor, cs(r).backgroundColor, where + ' ' + sel + p + ': the key');
        assert.equal(st.animationName, 'cr-matte', where + ' ' + sel + p);
        assert.equal(st.zIndex, '2', where + ' ' + sel + p + ': over what it covers');
      });
      const bad = fadesOverKey(r);
      assert.ok(!bad.length, where + ': faded over the key: ' + bad.join(', '));
      r.classList.remove('is-entering');
      MATTES[where].forEach(([sel, p]) => assert.equal(cs(sel, p).content, 'none', where + ' ' + sel + p + ': gone once entered'));
    }));
    // The clock and a free-debate team plate carry plates: they rise by translate only, at the shared 140 / 70 ms.
    mounted(single(OPENING), r => {
      assert.equal(cs(MAIN).animationName, 'cr-rise');
      assert.equal(cs(MAIN).animationDelay, '0.14s');
      // The head's words rise once most of its plate is there; the digits come with theirs.
      assert.equal(cs('.dt-title').animationDelay, '0.1s', 'the title after its plate');
      assert.equal(cs('.dt-speaker').animationDelay, '0.17s', 'the speaker after the title');
      assert.equal(cs(DIGITS, '::before').content, 'none', 'one matte on a single stage');
    });
    mounted(dual(), r => {
      r.querySelectorAll('.dt-half').forEach(half => {
        assert.equal(cs(half.querySelector('.dt-clock')).animationName, 'cr-rise', half.dataset.side + ' clock');
        assert.equal(cs(half.querySelector('.dt-team')).animationName, 'cr-rise', half.dataset.side + ' team');
        assert.equal(cs(half.querySelector('.dt-team')).animationDelay, '0.07s');
        assert.equal(cs(half, '::after').animationDuration, '0.56s', 'a half on the field sweep\'s 560 ms');
      });
      assert.equal(cs('.dt-half:first-child .dt-digits', '::after').content, 'none', 'the half\'s matte covers the clock');
    });
    mounted(breakView(), () => {
      assert.equal(cs('.dt-card', '::before').animationDelay, '0.14s', 'the break\'s motions after its digits');
      assert.equal(cs(DIGITS, '::after').animationDelay, '0.14s');
    });
  });

  // Plates come in from the edge they hang from: the clock from the speaker's seat, a half from its outer edge, a
  // centred head, clock or card from its middle.
  DT.test('theme chroma: each matte leaves from the edge its plate hangs from', () => {
    ['left', 'right'].forEach(seat => [[OPENING, 'pro'], [CON_OPENING, 'con']].forEach(([stage, side]) => {
      mounted(single(stage, seat), () => {
        const fromRight = (seat === 'right') === (side === 'pro');   // the speaker sits on the right
        // The matte shrinks toward its origin, so the plate shows first at the other end.
        assert.near(originX(cs(DIGITS, '::after')), fromRight ? 0 : 1, 0.01, seat + ' / ' + side);
        assert.near(originX(cs('.dt-head', '::after')), 1, 0.01, seat + ' / ' + side + ': the head from its left');
      });
    }));
    ['left', 'right'].forEach(seat => mounted(dual(seat), () => {
      assert.near(originX(cs('.dt-half:first-child', '::after')), 1, 0.01, seat + ': the left half from its left');
      assert.near(originX(cs('.dt-half:last-child', '::after')), 0, 0.01, seat + ': the right half from its right');
    }));
    mounted(breakView(), r => {
      const box = r.querySelector('.dt-head').getBoundingClientRect();
      [['.dt-head', box], [DIGITS, r.querySelector(DIGITS).getBoundingClientRect()]].forEach(([sel, b]) => {
        const before = cs(sel, '::before'), after = cs(sel, '::after');
        assert.near(originX(before), 0, 0.01, sel + '::before goes to the left');
        assert.near(originX(after), 1, 0.01, sel + '::after goes to the right');
        // Each covers its half and a pixel past the middle, so no seam shows where they meet.
        assert.near(parseFloat(before.right), b.width / 2 - 1, 0.6, sel + '::before ends a pixel past the middle');
        assert.near(parseFloat(after.left), b.width / 2 - 1, 0.6, sel + '::after starts a pixel before it');
      });
    });
    [['title card', titleView], ['end card', endView]].forEach(([where, view]) => mounted(view(), () => {
      assert.equal(cs('.dt-head', '::before').content, 'none', where + ': its head is not split');
    }));
  });

  DT.test('theme chroma: stills and thumbnails never show a matte', () => {
    frozen(() => [['single', () => single(OPENING), [['.dt-head', '::after'], [DIGITS, '::after']]],
      ['dual', () => dual(), [['.dt-half:first-child', '::after'], ['.dt-half:last-child', '::after']]],
      ['title', titleView, [['.dt-card', '::before'], ['.dt-card', '::after']]]].forEach(([where, view, mattes]) => {
      mounted(view(), r => {
        assert.ok(r.hasAttribute('data-still') && r.classList.contains('is-entering'), where);
        mattes.forEach(([sel, p]) => assert.equal(cs(sel, p).transform, 'matrix(0, 0, 0, 1, 0, 0)', where + ' ' + sel + p));
        r.classList.remove('is-entering');
        mattes.forEach(([sel, p]) => assert.equal(cs(sel, p).content, 'none', where + ' ' + sel + p));
      });
    }));
    // A thumbnail never enters.
    const h = R.mount(host(), { thumbnail: true });
    try {
      h.update(single(OPENING));
      assert.ok(!root().classList.contains('is-entering'));
      assert.equal(cs(DIGITS, '::after').content, 'none');
    } finally { h.destroy(); }
  });

  // The top bar yields to the team plates in a free debate by closing to its middle, laid out where it was.
  DT.test('theme chroma: in a free debate the top bar stays in place, closed to its middle', () => {
    let bar = null;
    mounted(single(OPENING), r => {
      r.classList.remove('is-entering');
      const st = cs('.dt-top');
      assert.equal(st.clipPath, 'polygon(-1px -1px, calc(100% + 1px) -1px, calc(100% + 1px) calc(100% + 1px), -1px calc(100% + 1px))',
        'open: a pixel outside the bar, cutting nothing');
      assert.equal(st.transitionProperty, 'clip-path');
      assert.equal(st.transitionDuration, '0.36s', 'it opens in 360 ms');
      bar = r.querySelector('.dt-top').getBoundingClientRect();
    });
    mounted(dual(), r => {
      r.classList.remove('is-entering');
      const st = cs('.dt-top');
      assert.equal(st.display, 'flex');
      assert.equal(st.position, 'absolute');
      assert.equal(st.clipPath, 'polygon(50% 0px, 50% 0px, 50% 100%, 50% 100%)', 'closed: no width, at the middle');
      assert.equal(st.transitionDuration, '0.32s', 'it closes in 320 ms');
      const b = r.querySelector('.dt-top').getBoundingClientRect();
      ['left', 'right', 'top', 'height'].forEach(k => assert.near(b[k], bar[k], 0.5, 'the same box: ' + k));
    });
  });

  // The waiting side's plate is its colour let down toward the plate by the shared --dim, so it eases with the switch.
  DT.test('theme chroma: the waiting plate dims by --dim, the speaker\'s plate is its own colour', () => {
    mounted(dual(), r => {
      r.classList.remove('is-entering');
      const pro = r.querySelector('.dt-half[data-side="pro"]'), con = r.querySelector('.dt-half[data-side="con"]');
      assert.ok(con.hasAttribute('data-active'));
      assert.equal(getComputedStyle(pro).getPropertyValue('--dim').trim(), '1');
      sameColour(cs(pro.querySelector('.dt-clock'), '::before').backgroundColor,
        resolve(pro, 'color-mix(in oklab, var(--side-color) 55%, var(--plate))'), 'waiting: 55% of its colour');
      sameColour(cs(con.querySelector('.dt-clock'), '::before').backgroundColor, resolve(con, 'var(--side-color)'), 'speaking');
      // Half way through a switch (the half's own 520 ms ease held off, so the value is read as set).
      pro.style.setProperty('transition', 'none');
      pro.style.setProperty('--dim', '0.5');
      sameColour(cs(pro.querySelector('.dt-clock'), '::before').backgroundColor,
        resolve(pro, 'color-mix(in oklab, var(--side-color) 77.5%, var(--plate))'), 'half way');
      pro.style.removeProperty('--dim');
      pro.style.removeProperty('transition');
    });
  });

  // The speaker's gold floor rule is drawn on both plate layers, inside the plate's bottom edge, never on the key.
  DT.test('theme chroma: the speaker\'s floor rule lies inside the plate, opening with the switch', () => {
    mounted(dual(), r => {
      r.classList.remove('is-entering');
      const gold = resolve(r, 'var(--accent)');
      r.querySelectorAll('.dt-floorline').forEach(l => assert.equal(cs(l).display, 'none', 'no line on the key'));
      r.querySelectorAll('.dt-half').forEach(half => ['::before', '::after'].forEach(p => {
        const st = cs(half.querySelector('.dt-clock'), p), where = half.dataset.side + p;
        assert.ok(st.backgroundImage.indexOf(gold) >= 0, where + ': gold ' + st.backgroundImage);
        const width = st.backgroundSize.split(' ')[0];
        if (half.hasAttribute('data-active')) assert.ok(width !== '0%' && width !== '0px', where + ': open ' + width);
        else assert.equal(width, '0%', where + ': closed');
        // Its lower edge stands 2 × --plate-rim (.8cqh) above the plate's.
        assert.ok(fromFar(st.backgroundPositionY) >= cqh(0.4), where + ': inside the plate ' + st.backgroundPositionY);
        assert.ok(/background-size/.test(st.transitionProperty), where + ': it opens and closes with the switch');
      }));
    });
    mounted(dualIdle(), r => {
      r.classList.remove('is-entering');
      r.querySelectorAll('.dt-half .dt-clock').forEach(c => assert.equal(cs(c, '::before').backgroundImage, 'none', 'idle: no one has the floor'));
    });
  });

  // A bell lights the plate's own rim, --plate-rim inside its edge, over the plate (solid on screen). A warn bell lights
  // it where the time stands on the plate and opens it out both ways; an end bell lights it all at once.
  DT.test('theme chroma: a bell lights a gold rim inside the plate, a warn bell from the time edge', () => {
    // A minute into a 3:00 stage a third is used: the side's colour reaches 2/3 of the plate from the speaker's seat.
    ['left', 'right'].forEach(seat => [[OPENING, 'pro'], [CON_OPENING, 'con']].forEach(([stage, side]) => {
      mounted(single(stage, seat), (r, h) => {
        r.classList.remove('is-entering');
        h.pulse({ type: 'warn', clock: 'main' });
        const clock = r.querySelector(MAIN), ring = clock.querySelector('.dt-ring'), where = seat + ' / ' + side;
        assert.ok(ring, 'a ring in the clock');
        const st = cs(ring);
        assert.equal(st.animationName, 'cr-ignite', where);
        assert.ok(parseFloat(st.borderTopWidth) > 0 && resolve(r, st.borderTopColor) === resolve(r, 'var(--accent)'), 'a gold rim');
        // Opened out (it opens in 330 ms) and cooling: the whole rim, inside the plate by --plate-rim.
        const a = ring.getAnimations()[0];
        a.pause();
        a.currentTime = 400;
        const p = plate(clock), b = ring.getBoundingClientRect(), rim = cqh(0.4) - 0.5;
        assert.ok(b.left - p.left >= rim && p.right - b.right >= rim && b.top - p.top >= rim && p.bottom - b.bottom >= rim,
          where + ': inside the plate by --plate-rim: ' + JSON.stringify([b.left - p.left, p.right - b.right, b.top - p.top, p.bottom - b.bottom]));
        // It was lit at the time edge: the scale's origin is where the side's colour ends on the plate.
        const fromRight = (seat === 'right') === (side === 'pro');
        const edge = fromRight ? p.left + (p.right - p.left) / 3 : p.left + (p.right - p.left) * 2 / 3;
        assert.near(b.left + parseFloat(st.transformOrigin), edge, 1.5, where + ': lit at the time edge');
      });
    }));
    // A free-debate side's warn bell is lit where its --remain stands.
    mounted(dual(), (r, h) => {
      r.classList.remove('is-entering');
      h.pulse({ type: 'warn', clock: 'con' });
      const half = r.querySelector('.dt-half[data-side="con"]'), ring = half.querySelector('.dt-ring');
      assert.equal(cs(ring).animationName, 'cr-ignite');
      const a = ring.getAnimations()[0];
      a.pause();
      a.currentTime = 400;
      const p = plate(half.querySelector('.dt-clock')), b = ring.getBoundingClientRect();
      const remain = parseFloat(getComputedStyle(half).getPropertyValue('--remain'));
      const edge = half.matches(':last-child') ? p.right - (p.right - p.left) * remain : p.left + (p.right - p.left) * remain;
      assert.near(b.left + parseFloat(cs(ring).transformOrigin), edge, 1.5, 'lit at the half\'s time edge');
    });
    // A single stage's end: one closed rim flashing twice; its second ring is not drawn. The sign's piece, drawn out on
    // the second bell, carries the rim round its own end on the same animation.
    mounted(E.view(E.toggle(E.goto(session(), idx(OPENING), T0), T0), T0 + 179900), (r, h) => {
      r.classList.remove('is-entering');
      h.pulse({ type: 'end', clock: 'main' });
      h.update(E.view(E.toggle(E.goto(session(), idx(OPENING), T0), T0), T0 + 180200));   // +0:00
      const clock = r.querySelector(MAIN), ring = clock.querySelector('.dt-ring[data-nth="1"]');
      assert.equal(clock.dataset.phase, 'over');
      assert.equal(cs(ring).animationName, 'cr-flash-twice');
      assert.equal(cs(ring).borderLeftWidth, cs(ring).borderTopWidth, 'closed until the sign\'s piece covers its left');
      assert.equal(cs(ring).transform, 'none', 'all at once');
      assert.equal(r.dataset.bell, 'end');
      const sign = r.querySelector(DIGITS + ' .dt-sign');
      assert.equal(cs(sign, '::after').animationName, 'cr-flash-twice');
      // Live, not in a still: the shared sign fades in over 300 ms, which would fade its piece in over the key.
      assert.deepEqual(fadesOverKey(r), [], 'the + and its piece are not faded in over the key');
      assert.equal(cs(sign).animationDelay, '0.32s, 0.62s', 'the + comes on the second bell, then breathes');
      // The second ring, as render.js adds it 320 ms on.
      const second = document.createElement('i');
      second.className = 'dt-ring';
      second.setAttribute('data-type', 'end');
      second.setAttribute('data-nth', '2');
      clock.appendChild(second);
      assert.equal(cs(second).display, 'none', 'the second ring is not drawn');
      second.remove();
    });
    // A stage that opens already over rings no bell: its + comes with the plate, under the matte, which reaches out
    // over the sign's piece; neither is faded in over the key.
    mounted(E.view(E.toggle(E.goto(session(), idx(OPENING), T0), T0), T0 + 189000), r => {
      assert.ok(r.classList.contains('is-entering'));
      const digits = r.querySelector(DIGITS), sign = digits.querySelector('.dt-sign');
      assert.equal(cs(sign).animationDelay, '0s, 0.62s');
      const matte = digits.getBoundingClientRect().left + parseFloat(cs(digits, '::after').left);
      const piece = sign.getBoundingClientRect().left + parseFloat(cs(sign, '::before').left);
      assert.ok(matte <= piece, 'the matte covers the sign\'s piece: ' + matte + ' > ' + piece);
      assert.deepEqual(fadesOverKey(r), [], 'nothing faded in over the key');
    });
    // A free-debate side that runs out flashes once, all at once.
    mounted(dual(), (r, h) => {
      r.classList.remove('is-entering');
      h.pulse({ type: 'end', clock: 'con' });
      const ring = r.querySelector('.dt-half[data-side="con"] .dt-ring');
      assert.equal(cs(ring).animationName, 'cr-flash');
    });
  });

  // Overtime: the digits keep their place; the + comes on a piece of plate drawn out of the plate's left edge, and
  // breathes by its colour, since its piece must stay solid.
  DT.test('theme chroma: in overtime the sign comes on its own piece of plate and the digits stay put', () => {
    frozen(() => mounted(E.view(E.toggle(E.goto(session(), idx(OPENING), T0), T0), T0 + 179500), (r, h) => {
      const centre = () => {
        const a = r.querySelector(DIGITS + ' .dt-min').getBoundingClientRect();
        const b = r.querySelector(DIGITS + ' .dt-sec').getBoundingClientRect();
        return (a.left + b.right) / 2;
      };
      const sign = r.querySelector(DIGITS + ' .dt-sign');
      assert.equal(sign.textContent, '');
      assert.equal(cs(sign, '::before').display, 'none', 'no piece before overtime');
      const before = centre();
      h.update(E.view(E.toggle(E.goto(session(), idx(OPENING), T0), T0), T0 + 180200));
      assert.equal(sign.textContent, '+');
      assert.near(centre(), before, 0.5, 'the digits do not move');
      const st = cs(sign);
      assert.equal(st.opacity, '1', 'lands at 1');
      assert.ok(/cr-tab-out/.test(st.animationName) && /cr-sign-breathe/.test(st.animationName), st.animationName);
      assert.ok(!/dt-breathe/.test(st.animationName), st.animationName);
      const piece = cs(sign, '::before'), s = sign.getBoundingClientRect(), p = plate(r.querySelector(MAIN));
      assert.equal(piece.backgroundColor, PLATE);
      const dy = parseFloat(piece.translate.split(' ')[1] || '0');
      assert.near(s.top + parseFloat(piece.top) + dy, p.top, 1, 'its top is the plate\'s');
      assert.near(s.bottom - parseFloat(piece.bottom) + dy, p.bottom, 1, 'its bottom is the plate\'s');
      assert.ok(s.right - parseFloat(piece.right) - p.left >= cqh(2), 'it covers the plate\'s rounded left edge');
    }));
  });

  // A side out of time keeps a plate the size of its digits, drained to the dark track, with the word on it.
  DT.test('theme chroma: a locked side keeps its plate, drained, with 时间到 on it', () => {
    frozen(() => mounted(locked(), r => {
      const half = r.querySelector('.dt-half[data-side="pro"]');
      assert.ok(half.hasAttribute('data-locked'));
      const clock = half.querySelector('.dt-clock'), state = half.querySelector('.dt-state');
      assert.equal(state.textContent, '时间到');
      const clip = cs(clock, '::before').clipPath;
      assert.ok(/^inset\(/.test(clip) && /100%/.test(clip), 'the side\'s colour drained to nothing: ' + clip);
      assert.ok(clock.getBoundingClientRect().width + cqh(8) > state.getBoundingClientRect().width, 'a plate wider than the word');
      const st = cs(state);
      assert.equal(alpha(st.backgroundColor), 0, 'no tab: the word lies on the plate');
      assert.equal(st.color, resolve(r, 'var(--ink)'));
      assert.equal(st.clipPath, 'none');
      const w = state.getBoundingClientRect(), c = clock.getBoundingClientRect();
      assert.near((w.top + w.bottom) / 2, (c.top + c.bottom) / 2, 1, 'centred on the plate');
    }));
  });

  // 「暂停」 is a solid tab tucked behind the plate's lower edge, rolled down from it, never a translucent word on the key.
  DT.test('theme chroma: 暂停 is a solid tab rolled down from the plate', () => {
    mounted(paused(OPENING), r => {
      r.classList.remove('is-entering');
      const clock = r.querySelector(MAIN), state = clock.querySelector('.dt-state'), st = cs(state);
      assert.equal(state.textContent, '暂停');
      assert.equal(st.backgroundColor, PLATE);
      assert.equal(st.color, resolve(r, 'var(--ink-dim)'));
      assert.equal(st.opacity, '1');
      assert.equal(st.clipPath, 'inset(0px)');
      assert.equal(st.zIndex, '-3', 'under the plate');
      const t = state.getBoundingClientRect(), p = plate(clock);
      assert.ok(t.top < p.bottom && t.bottom > p.bottom, 'its top tucked behind the plate\'s lower edge');
      assert.equal(st.transitionProperty, 'clip-path');
      assert.equal(st.transitionDuration, '0.2s');
    });
    mounted(single(OPENING), r => {
      r.classList.remove('is-entering');
      const state = r.querySelector(MAIN + ' .dt-state'), st = cs(state);
      assert.equal(state.textContent, '');
      assert.equal(st.clipPath, 'inset(0px 0px 100%)', 'rolled up while running');
      assert.ok(/暂停/.test(cs(state, '::before').content), 'it keeps the word as it rolls back up');
    });
  });

  DT.test('theme chroma: the toast is a plate with its gold rule inside it', () => {
    mounted(single(OPENING), (r, h) => {
      h.toast('反方时间已用完');
      const st = cs('.dt-toast');
      assert.equal(st.backgroundColor, PLATE);
      assert.equal(st.borderBottomWidth, '0px');
      assert.ok(st.backgroundImage.indexOf(resolve(r, 'var(--accent)')) >= 0, st.backgroundImage);
      assert.ok(fromFar(st.backgroundPositionY.split(',')[0]) >= cqh(0.4), 'off the edge: ' + st.backgroundPositionY);
    });
  });

  // Both layers are --ink, so one is drawn, unclipped: --used no longer repaints the digits every frame.
  DT.test('theme chroma: the digits are one unclipped layer', () => {
    ['left', 'right'].forEach(seat => [OPENING, CON_OPENING].forEach(stage => mounted(single(stage, seat), r => {
      assert.equal(cs(MAIN + ' .dt-digits-on').display, 'none', seat + ' / ' + stage);
      assert.equal(cs(DIGITS).clipPath, 'none', seat + ' / ' + stage);
    })));
    mounted(dual(), r => r.querySelectorAll('.dt-half').forEach(half => {
      assert.equal(cs(half.querySelector('.dt-digits-on')).display, 'none', half.dataset.side);
      assert.equal(cs(half.querySelector('.dt-digits:not(.dt-digits-on)')).clipPath, 'none', half.dataset.side);
    }));
  });

  // Nothing translucent over the key: every surface is either clear or solid, in each state at rest.
  DT.test('theme chroma: no surface on the stage is translucent', () => {
    const over = () => E.view(E.toggle(E.goto(session(), idx(OPENING), T0), T0), T0 + 189000);
    frozen(() => [['single', () => single(OPENING)], ['over', over], ['dual', () => dual()], ['idle', dualIdle],
      ['locked', locked], ['paused', () => paused(OPENING)], ['break', breakView], ['title', titleView], ['end', endView]]
      .forEach(([where, view]) => mounted(view(), (r, h) => {
        h.toast('提示');
        const bad = surfaces(r).filter(s => { const a = alpha(s.st.backgroundColor); return a > 0 && a < 1; })
          .map(s => name(s) + ' ' + s.st.backgroundColor);
        assert.ok(!bad.length, where + ': ' + bad.join('; '));
      })));
  });
})();
