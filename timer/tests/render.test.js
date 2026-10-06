(function () {
  const E = DT.engine, R = DT.render;
  const T0 = 1000000;
  const MATCH = { title: '第 1 场', proMotion: '人工智能利大于弊', conMotion: '人工智能弊大于利', proTeam: '物理学院', conTeam: '化学院', proSeat: 'left' };
  const F = () => DT.BUILTIN_FORMATS.find(f => f.id === 'ustc-freshman-cup');
  function host() {
    const box = document.getElementById('sandbox');
    box.innerHTML = '<div class="dt-stage-host" style="width:960px;height:540px"></div>';
    return box.firstChild;
  }
  function session(idx) { return E.goto(E.createSession(F(), MATCH, T0), idx, T0); }
  const stageIdx = name => F().stages.findIndex(s => s.name === name);

  DT.test('render: title card shows both motions and teams', () => {
    const h = R.mount(host());
    h.update(E.view(E.createSession(F(), MATCH, T0), T0));
    const root = document.querySelector('.dt-stage');
    assert.equal(root.dataset.mode, 'title');
    assert.equal(root.querySelector('.dt-motion[data-side="pro"]').textContent, '人工智能利大于弊');
    assert.equal(root.querySelector('.dt-teams [data-side="con"]').textContent, '化学院');
    h.destroy();
  });

  DT.test('render: the top bar shows the match title and the format name from the view', () => {
    const h = R.mount(host());
    h.update(E.view(session(0), T0));
    const root = document.querySelector('.dt-stage');
    assert.equal(root.querySelector('.dt-match').textContent, '第 1 场');
    assert.equal(root.querySelector('.dt-format').textContent, F().name);
    h.destroy();
  });

  // P5: a new --tension every frame re-lays out the variable-font digits, and with them the page. It moves with the
  // whole second shown, on the frame the digits change, never between two ticks.
  DT.test('render: tension changes only with the whole second shown and is not rewritten when unchanged', () => {
    const h = R.mount(host());
    const s = E.toggle(session(0), T0);   // 3:00
    const root = document.querySelector('.dt-stage');
    const at = ms => { h.update(E.view(s, T0 + ms)); return root.style.getPropertyValue('--tension'); };
    const first = at(60000);
    assert.near(Number(first), 1 - 120 / 180, 1e-4, '2:00 of 3:00');
    assert.equal(at(60500), first, 'within the second');
    assert.equal(at(60999), first, 'to its last millisecond');
    assert.equal(root.querySelector('.dt-sec').textContent, '00');
    assert.near(Number(at(61000)), 1 - 119 / 180, 1e-4, 'and on as the digits change');
    assert.equal(root.querySelector('.dt-sec').textContent, '59');
    let writes = 0;
    const orig = root.style.setProperty.bind(root.style);
    root.style.setProperty = (k, v) => { if (k === '--tension') writes++; return orig(k, v); };
    h.update(E.view(s, T0 + 61010));
    assert.equal(writes, 0);
    h.destroy();
  });

  DT.test('render: single stage sets side, digits and the used fraction', () => {
    const h = R.mount(host());
    let s = E.toggle(session(0), T0);
    h.update(E.view(s, T0 + 60000));
    const root = document.querySelector('.dt-stage');
    assert.equal(root.dataset.kind, 'single'); assert.equal(root.dataset.side, 'pro');
    assert.equal(root.dataset.running, 'true'); assert.equal(root.dataset.phase, 'calm');
    assert.equal(root.querySelector('.dt-min').textContent + ':' + root.querySelector('.dt-sec').textContent, '2:00');
    assert.near(parseFloat(root.style.getPropertyValue('--used')), 1 / 3, 1e-3);
    assert.equal(root.querySelector('.dt-title').textContent, '正方一辩开篇立论');
    assert.equal(root.querySelectorAll('.dt-seg').length, F().stages.length);
    h.destroy();
  });

  DT.test('render: overtime shows a plus sign and the over phase', () => {
    const h = R.mount(host());
    const s = E.toggle(session(0), T0);
    h.update(E.view(s, T0 + 187000));
    const root = document.querySelector('.dt-stage');
    assert.equal(root.dataset.phase, 'over');
    assert.equal(root.querySelector('.dt-sign').textContent, '+');
    assert.equal(root.style.getPropertyValue('--tension').trim(), '1');
    h.destroy();
  });

  DT.test('render: dual stage marks the active and locked halves', () => {
    const h = R.mount(host());
    let s = E.toggle(session(stageIdx('自由辩论')), T0);
    s = E.tick(s, T0 + 241000).session;
    h.update(E.view(s, T0 + 241000));
    const pro = document.querySelector('.dt-half[data-side="pro"]');
    const con = document.querySelector('.dt-half[data-side="con"]');
    assert.ok(pro.hasAttribute('data-locked'));
    assert.ok(con.hasAttribute('data-active'));
    assert.ok(!document.querySelector('.dt-halves').hasAttribute('data-idle'));
    h.destroy();
  });

  DT.test('render: an idle dual stage says who speaks first', () => {
    const h = R.mount(host());
    h.update(E.view(session(stageIdx('自由辩论')), T0));
    assert.ok(document.querySelector('.dt-halves').hasAttribute('data-idle'));
    assert.ok(document.querySelector('.dt-next').textContent.indexOf('先由正方发言') >= 0);
    h.destroy();
  });

  DT.test('render: seats follow the match setting', () => {
    const h = R.mount(host());
    const s = E.goto(E.createSession(F(), Object.assign({}, MATCH, { proSeat: 'right' }), T0), 0, T0);
    h.update(E.view(s, T0));
    assert.equal(document.querySelector('.dt-stage').dataset.proSeat, 'right');
    const halves = E.goto(E.createSession(F(), Object.assign({}, MATCH, { proSeat: 'right' }), T0), stageIdx('自由辩论'), T0);
    h.update(E.view(halves, T0));
    const order = [...document.querySelectorAll('.dt-half')].map(x => x.dataset.side);
    assert.deepEqual(order, ['con', 'pro']);
    h.destroy();
  });

  DT.test('render: changing stage plays the entrance once', () => {
    const h = R.mount(host());
    let s = session(0);
    h.update(E.view(s, T0));
    const root = document.querySelector('.dt-stage');
    root.classList.remove('is-entering');
    h.update(E.view(s, T0 + 16));
    assert.ok(!root.classList.contains('is-entering'));
    s = E.next(s, T0 + 100);
    h.update(E.view(s, T0 + 100));
    assert.ok(root.classList.contains('is-entering'));
    h.destroy();
  });

  DT.test('render: long names get the long class and text is not parsed as HTML', () => {
    const f = JSON.parse(JSON.stringify(F()));
    f.stages[0].name = '<b>正方一辩开篇立论加上一段很长很长的补充说明</b>';
    const h = R.mount(host());
    h.update(E.view(E.goto(E.createSession(f, MATCH, T0), 0, T0), T0));
    const root = document.querySelector('.dt-stage');
    assert.equal(root.dataset.long, 'true');
    assert.equal(root.querySelector('.dt-title b'), null);
    h.destroy();
  });

  DT.test('render: pulse adds a ring that removes itself', () => {
    const h = R.mount(host());
    h.update(E.view(E.toggle(session(0), T0), T0));
    h.pulse({ type: 'warn' });
    assert.equal(document.querySelectorAll('.dt-ring').length, 1);
    h.destroy();
  });

  // A frozen demo is a still for review: every transition lands at once and every animation at its end, so a still
  // shows the state it is taken for, even where the browser would stall a transition part way (a painter's canvas).
  DT.test('render: a frozen demo shows end states, with no transition or animation part way', () => {
    const url = window.location.href;
    const at = search => history.replaceState(null, '', window.location.pathname + search);
    let h = null;
    try {
      h = R.mount(host());
      h.update(E.view(E.toggle(session(0), T0), T0));
      assert.ok(!document.querySelector('.dt-stage').hasAttribute('data-still'), 'a live page is not a still');
      assert.ok(parseFloat(getComputedStyle(document.querySelector('.dt-digits')).transitionDuration) > 0, 'live digits ease');
      h.destroy();
      at('?demo=single&frozen=1');
      h = R.mount(host());
      h.update(E.view(E.toggle(session(stageIdx('自由辩论')), T0), T0));
      const root = document.querySelector('.dt-stage');
      assert.ok(root.hasAttribute('data-still'));
      ['.dt-halves', '.dt-digits', '.dt-colon', '.dt-field'].forEach(sel => {
        assert.equal(getComputedStyle(root.querySelector(sel)).transitionDuration, '0s', sel);
      });
      assert.equal(getComputedStyle(root.querySelector('.dt-deco'), '::before').transitionDuration, '0s', 'pseudo-elements too');
      h.pulse({ type: 'warn', clock: 'pro' });
      const ring = root.querySelector('.dt-ring');
      assert.ok(ring, 'the ring is still added');
      assert.equal(getComputedStyle(ring).animationDelay, '-10s', 'and is already over');
      assert.equal(getComputedStyle(ring).animationPlayState, 'paused');
      h.destroy();
      // A breathing loop stands at its start, full strength, not wherever the clock of the browser happened to be.
      h = R.mount(host());
      h.update(E.view(E.toggle(session(0), T0), T0 + 187000));
      const sign = document.querySelector('.dt-stage .dt-sign');
      assert.ok(/dt-breathe/.test(getComputedStyle(sign).animationName), 'overtime breathes');
      assert.equal(getComputedStyle(sign).animationPlayState, 'paused');
      assert.equal(getComputedStyle(sign).opacity, '1');
    } finally {
      history.replaceState(null, '', url);
      if (h) h.destroy();
    }
  });

  DT.test('render: end card lists the record when given', () => {
    const h = R.mount(host());
    let s = E.toggle(session(0), T0); s = E.goto(s, 99, T0 + 190000);
    const v = Object.assign(E.view(s, T0 + 190000), { record: E.record(s, T0 + 190000) });
    h.update(v);
    assert.equal(document.querySelector('.dt-stage').dataset.mode, 'end');
    assert.ok(document.querySelectorAll('.dt-record tr').length >= F().stages.length);
    h.destroy();
  });

  DT.test('render: every theme file declares its metadata line', () => {
    // build.py injects DT.THEMES only in the built file; in tests the stylesheet is not loaded,
    // so this checks the render side: unknown theme ids fall back to hall.
    const h = R.mount(host());
    const v = E.view(session(0), T0); v.theme = 'nope';
    h.update(v);
    assert.equal(document.querySelector('.dt-stage').dataset.theme, 'hall');
    h.destroy();
  });

  // ---- beyond the brief ----

  DT.test('render: empty team names show as 正方 and 反方', () => {
    const h = R.mount(host());
    const m = Object.assign({}, MATCH, { proTeam: '', conTeam: '  ' });
    h.update(E.view(E.createSession(F(), m, T0), T0));
    assert.equal(document.querySelector('.dt-teams [data-side="pro"]').textContent, '正方');
    assert.equal(document.querySelector('.dt-teams [data-side="con"]').textContent, '反方');
    h.update(E.view(E.goto(E.createSession(F(), m, T0), stageIdx('自由辩论'), T0), T0));
    assert.equal(document.querySelector('.dt-half[data-side="con"] .dt-team').textContent, '反方');
    h.destroy();
  });

  DT.test('render: a break keeps the digits relaxed and shows no side', () => {
    const h = R.mount(host());
    const s = E.toggle(session(stageIdx('评委打分')), T0);
    h.update(E.view(s, T0 + 20000));
    const root = document.querySelector('.dt-stage');
    assert.equal(root.dataset.kind, 'break');
    assert.equal(root.dataset.side, 'none');
    assert.equal(root.style.getPropertyValue('--tension').trim(), '0');
    assert.equal(root.querySelector('.dt-motion[data-side="con"]').textContent, '人工智能弊大于利');
    h.destroy();
  });

  DT.test('render: a yielded dual side says so instead of showing digits', () => {
    const h = R.mount(host());
    let s = E.toggle(session(stageIdx('自由辩论')), T0);
    s = E.yieldTime(s, T0 + 10000);
    h.update(E.view(s, T0 + 12000));
    assert.equal(document.querySelector('.dt-half[data-side="pro"] .dt-state').textContent, '已放弃');
    assert.ok(document.querySelector('.dt-half[data-side="con"]').hasAttribute('data-active'));
    h.destroy();
  });

  DT.test('render: a ring leaves when its animation ends and destroy removes the stage', () => {
    const box = host();
    const h = R.mount(box);
    h.update(E.view(E.toggle(session(0), T0), T0));
    h.pulse({ type: 'warn', clock: 'main' });
    document.querySelector('.dt-ring').dispatchEvent(new Event('animationend'));
    assert.equal(document.querySelectorAll('.dt-ring').length, 0);
    h.destroy();
    assert.equal(box.querySelector('.dt-stage'), null);
  });
  // ---- final review ----

  DT.test('render: record rows carry their kind so a free debate is marked like its progress segment', () => {
    const h = R.mount(host());
    const s = E.goto(E.toggle(session(0), T0), 99, T0 + 60000);
    h.update(Object.assign(E.view(s, T0 + 60000), { record: E.record(s, T0 + 60000) }));
    const rows = Array.from(document.querySelectorAll('.dt-record tr')).slice(1);
    const kinds = F().stages.map(st => st.type);
    assert.deepEqual(rows.map(r => r.getAttribute('data-kind')), kinds);
    assert.deepEqual(Array.from(document.querySelectorAll('.dt-record th')).map(th => th.textContent), ['环节', '计划', '实际', '备注']);
    h.destroy();
  });

  // ---- animation hooks for the themes ----

  const wait = ms => new Promise(r => setTimeout(r, ms));
  const num = (el, name) => parseFloat(el.style.getPropertyValue(name));
  // The glyphs of a clock's off-field layer, which a bell's ring is sized from: in stage percent, and their centre.
  function glyphs(clock, root) {
    const box = root.getBoundingClientRect(), own = clock.getBoundingClientRect();
    const rs = Array.from(clock.querySelectorAll('.dt-digits:not(.dt-digits-on) > span'))
      .map(s => s.getBoundingClientRect()).filter(r => r.width && r.height);
    const l = Math.min.apply(null, rs.map(r => r.left)), r = Math.max.apply(null, rs.map(r => r.right));
    const t = Math.min.apply(null, rs.map(r => r.top)), b = Math.max.apply(null, rs.map(r => r.bottom));
    return { w: (r - l) / box.width * 100, h: (b - t) / box.height * 100,
      dy: ((t + b) - (own.top + own.bottom)) / 2 / box.height * 100, cx: (l + r) / 2, cy: (t + b) / 2 };
  }
  // The ring's last scale in a half: 96% of the column it is left with, at most 1.65 (stage.css: --bell-w × 1cqw + 3cqh).
  function reachIn(ring, root, col) {
    const box = root.getBoundingClientRect();
    return Math.min(1.65, 0.96 * col * box.width / ((num(ring, '--bell-w') * box.width + 3 * box.height) / 100));
  }

  // The ring sits in the clock that rang, under its digits (the clock is a stacking context), round their glyphs.
  DT.test('render: a bell rings inside its clock, under the digits, round their glyphs', () => {
    const h = R.mount(host());
    h.update(E.view(E.toggle(session(0), T0), T0 + 150500));   // 0:30 left: the warn bell
    const root = document.querySelector('.dt-stage');
    root.classList.remove('is-entering');
    const clock = root.querySelector('.dt-clock[data-clock="main"]');
    assert.equal(root.querySelector('.dt-rings'), null, 'no layer of rings over the text');
    h.pulse({ type: 'warn', clock: 'main' });
    const ring = root.querySelector('.dt-ring');
    assert.equal(ring.parentElement, clock, 'in the clock that rang');
    assert.deepEqual([ring.dataset.type, ring.dataset.nth, ring.dataset.side], ['warn', '1', 'pro']);
    const cs = getComputedStyle(ring);
    assert.equal(cs.zIndex, '-1', 'under the digits');
    assert.equal(cs.pointerEvents, 'none');
    assert.equal(cs.animationName, 'dt-ring');
    const g = glyphs(clock, root);
    assert.near(num(ring, '--bell-w'), g.w, 0.01, '--bell-w');
    assert.near(num(ring, '--bell-h'), g.h, 0.01, '--bell-h');
    assert.near(num(ring, '--bell-dy'), g.dy, 0.01, '--bell-dy');
    assert.ok(g.dy > 0, 'the glyphs sit a little below the clock\'s centre (their .07em drop)');
    assert.equal(ring.style.getPropertyValue('--ring-to'), '', 'on a single stage it grows to the default');
    const r = ring.getBoundingClientRect();
    assert.near((r.left + r.right) / 2, g.cx, 1, 'centred on the glyphs across');
    assert.near((r.top + r.bottom) / 2, g.cy, 1, 'and down');
    assert.ok(r.width > g.w / 100 * root.getBoundingClientRect().width, 'and starting outside them');
    h.destroy();
  });

  // S2/S5: the end bell's two rings are concentric: the second reuses the first's measure, though the sign has come in
  // between and the glyphs measured now would be wider.
  DT.test('render: a single stage\'s end rings twice, 320 ms apart, both round the same glyphs', async () => {
    const h = R.mount(host());
    const s = E.toggle(session(0), T0);
    h.update(E.view(s, T0 + 179900));
    const root = document.querySelector('.dt-stage');
    const clock = root.querySelector('.dt-clock[data-clock="main"]');
    try {
      h.pulse({ type: 'end', clock: 'main' });   // the frame loops pulse before they paint
      h.update(E.view(s, T0 + 180200));          // +0:00
      assert.equal(clock.querySelectorAll('.dt-ring').length, 1);
      clock.querySelector('.dt-ring').getAnimations({ subtree: true }).forEach(a => a.pause());   // the page's timeline can jump: keep it
      await wait(280);
      assert.equal(clock.querySelectorAll('.dt-ring').length, 1, 'the second is not there yet');
      await wait(80);
      const rings = Array.from(clock.querySelectorAll('.dt-ring'));
      assert.deepEqual(rings.map(x => x.dataset.nth), ['1', '2']);
      assert.deepEqual(rings.map(x => x.dataset.type), ['end', 'end']);
      ['--bell-w', '--bell-h', '--bell-dy'].forEach(v => {
        assert.equal(rings[1].style.getPropertyValue(v), rings[0].style.getPropertyValue(v), v + ': concentric');
      });
      assert.ok(glyphs(clock, root).w > num(rings[0], '--bell-w') + 1, 'though the glyphs and the sign are wider now');
    } finally { h.destroy(); }
  });

  // Spec §5.5: a free-debate side that runs out rings once, as the floor goes over. In a half the ring stops short of
  // the column it will have: 42% when the floor goes over, 58% for a warn bell or when the other side is out already
  // (the columns stay as they are then).
  DT.test('render: a free-debate side that runs out rings once, inside the column it is left with', async () => {
    const h = R.mount(host());
    let s = E.toggle(session(stageIdx('自由辩论')), T0);   // pro holds the floor; 4:00 a side
    h.update(E.view(s, T0 + 239900));
    const root = document.querySelector('.dt-stage');
    root.classList.remove('is-entering');
    const half = side => root.querySelector('.dt-half[data-side="' + side + '"]');
    try {
      h.pulse({ type: 'end', clock: 'pro' });
      s = E.tick(s, T0 + 240100).session;
      h.update(E.view(s, T0 + 240100));
      await wait(400);
      const rings = root.querySelectorAll('.dt-ring');
      assert.equal(rings.length, 1, 'one ring');
      assert.equal(rings[0].parentElement, half('pro').querySelector('.dt-clock'), 'in the side that ran out');
      assert.deepEqual([rings[0].dataset.type, rings[0].dataset.nth, rings[0].dataset.side], ['end', '1', 'pro']);
      assert.deepEqual([root.dataset.bell, root.dataset.bellClock], ['end', 'pro']);
      assert.near(num(rings[0], '--ring-to'), reachIn(rings[0], root, 0.42), 1e-3, 'the 42% it is left with');
      h.pulse({ type: 'warn', clock: 'con' });
      const warn = half('con').querySelector('.dt-ring');
      assert.equal(warn.dataset.side, 'con');
      assert.near(num(warn, '--ring-to'), reachIn(warn, root, 0.58), 1e-3, 'the 58% of the side holding the floor');
      h.pulse({ type: 'end', clock: 'con' });   // the last side runs out too
      s = E.tick(s, T0 + 480200).session;
      h.update(E.view(s, T0 + 480200));
      const last = half('con').querySelector('.dt-ring[data-type="end"]');
      assert.near(num(last, '--ring-to'), reachIn(last, root, 0.58), 1e-3, 'no switch follows: its column stays');
      assert.equal(root.querySelector('.dt-halves').style.getPropertyValue('--right-col'), '58%', 'as it does');
      await wait(400);
      assert.equal(half('con').querySelectorAll('.dt-ring[data-type="end"]').length, 1, 'and it too rang once');
    } finally { h.destroy(); }
  });

  // A theme's one-shot for the bell itself (a plate's edge flashing) keys on the stage; it goes after 1.5 s.
  DT.test('render: the stage says which bell rang and on which clock, then clears', async () => {
    const h = R.mount(host());
    h.update(E.view(E.toggle(session(0), T0), T0 + 150500));
    const root = document.querySelector('.dt-stage');
    try {
      assert.ok(!root.hasAttribute('data-bell'));
      h.pulse({ type: 'warn', clock: 'main' });
      assert.deepEqual([root.dataset.bell, root.dataset.bellClock], ['warn', 'main']);
      h.pulse({ type: 'count', clock: 'main' });
      assert.equal(root.dataset.bell, 'count', 'a count bell too, though it only bumps the digits');
      await wait(1550);
      assert.ok(!root.hasAttribute('data-bell') && !root.hasAttribute('data-bell-clock'), 'gone after 1.5 s');
    } finally { h.destroy(); }
  });

  // S11: a thumbnail is a still, so its colon does not breathe for as long as the setup page is open.
  DT.test('render: a thumbnail is a still', () => {
    const h = R.mount(host(), { thumbnail: true });
    h.update(E.view(E.toggle(session(0), T0), T0 + 60000));
    const root = document.querySelector('.dt-stage');
    assert.ok(root.hasAttribute('data-still'));
    const colon = root.querySelector('.dt-clock[data-clock="main"] .dt-colon');
    assert.equal(getComputedStyle(colon).animationPlayState.split(',')[0].trim(), 'paused');
    assert.equal(getComputedStyle(colon).opacity, '1', 'running, it stands at full strength');
    h.destroy();
  });

  // S2: the sign hangs outside the row, so the digits keep their place (and the end rings their centre).
  DT.test('render: the overtime sign fades in left of the digits, which keep their place', () => {
    const h = R.mount(host());
    const s = E.toggle(session(0), T0);
    h.update(E.view(s, T0 + 179500));   // 0:01
    const root = document.querySelector('.dt-stage');
    root.classList.remove('is-entering');
    const digits = root.querySelector('.dt-clock[data-clock="main"] .dt-digits:not(.dt-digits-on)');
    const sign = digits.querySelector('.dt-sign');
    const cs = getComputedStyle(sign);
    assert.equal(cs.position, 'absolute', 'out of the row');
    assert.ok(cs.display !== 'none', 'empty, it is clear rather than gone');
    assert.equal(cs.opacity, '0');
    const centre = () => { const r = digits.getBoundingClientRect(); return (r.left + r.right) / 2; };
    const before = centre();
    const colon = digits.querySelector('.dt-colon'), gold = getComputedStyle(colon).color;
    h.update(E.view(s, T0 + 181500));   // +0:01
    assert.equal(sign.textContent, '+');
    assert.near(centre(), before, 0.5, 'the digits do not move');
    const box = root.getBoundingClientRect();
    assert.near(centre(), (box.left + box.right) / 2, 1, 'they stay on the stage\'s centre');
    assert.ok(sign.getBoundingClientRect().right <= digits.querySelector('.dt-min').getBoundingClientRect().left + 0.5, 'the sign hangs left of them');
    assert.equal(cs.transitionProperty, 'opacity', 'and fades in');
    assert.ok(/dt-breathe/.test(cs.animationName), 'then breathes');
    assert.equal(cs.animationDelay, '0.3s', 'after the fade');
    assert.equal(getComputedStyle(colon).color, gold, 'the gold colon stays gold, no flash through the digits\' old colour');
    digits.style.transition = 'none';
    assert.equal(getComputedStyle(digits).color, gold, 'the digits turn the same gold');
    h.destroy();
  });

  // CO3 and the like: a step once a second, on the stage for the clock holding the floor and on each half for its own.
  DT.test('render: --secs and --secs-total give the whole seconds shown, on the stage and on each half', () => {
    const h = R.mount(host());
    const s = E.toggle(session(0), T0);
    const root = document.querySelector('.dt-stage');
    const secs = el => [el.style.getPropertyValue('--secs'), el.style.getPropertyValue('--secs-total')];
    h.update(E.view(s, T0 + 60000)); assert.deepEqual(secs(root), ['120', '180']);
    h.update(E.view(s, T0 + 60999)); assert.deepEqual(secs(root), ['120', '180'], 'until the digits change');
    h.update(E.view(s, T0 + 61000)); assert.deepEqual(secs(root), ['119', '180']);
    h.update(E.view(s, T0 + 185000)); assert.deepEqual(secs(root), ['0', '180'], 'overtime has none left');
    h.update(E.view(E.toggle(session(stageIdx('自由辩论')), T0), T0 + 30500));
    const half = side => root.querySelector('.dt-half[data-side="' + side + '"]');
    assert.deepEqual(secs(half('pro')), ['210', '240']);
    assert.deepEqual(secs(half('con')), ['240', '240']);
    assert.deepEqual(secs(root), ['210', '240'], 'the stage follows the side holding the floor');
    h.destroy();
  });

  // S7: the breath runs all the time; stopping and starting are one-shots over it.
  DT.test('render: the colon settles as its clock stops and rises as it starts, over a breath that never stops', () => {
    const h = R.mount(host());
    let s = session(0);
    h.update(E.view(s, T0));
    const colon = document.querySelector('.dt-clock[data-clock="main"] .dt-colon');
    const cs = getComputedStyle(colon);
    assert.equal(cs.animationName, 'dt-breathe, dt-colon-rest', 'stopped');
    assert.equal(cs.animationFillMode.split(', ')[1], 'forwards', 'and staying stopped');
    const breath = () => colon.getAnimations().find(a => a.animationName === 'dt-breathe');
    const first = breath();
    s = E.toggle(s, T0 + 1000);
    h.update(E.view(s, T0 + 1000));
    assert.equal(cs.animationName, 'dt-breathe, dt-colon-wake', 'started');
    assert.equal(breath(), first, 'the same breath, not a new one');
    s = E.toggle(s, T0 + 2000);
    h.update(E.view(s, T0 + 2000));
    assert.equal(cs.animationName, 'dt-breathe, dt-colon-rest', 'stopped again');
    assert.equal(breath(), first);
    assert.equal(cs.animationDuration, '1s, 0.2s');
    h.destroy();
  });

  // The breath peaks as the digits change. The delay allows for how far each colon's breath has already run.
  DT.test('render: a clock that starts or resumes sets --beat-delay so its colon breathes in step with the seconds', () => {
    const h = R.mount(host());
    let s = session(0);
    h.update(E.view(s, T0));
    const clock = document.querySelector('.dt-clock[data-clock="main"]');
    const [colon, onColon] = clock.querySelectorAll('.dt-colon');
    assert.equal(clock.style.getPropertyValue('--beat-delay'), '', 'not while it waits');
    s = E.toggle(s, T0);
    h.update(E.view(s, T0));
    assert.equal(clock.style.getPropertyValue('--beat-delay'), '0ms', 'a new stage: a second to the first tick');
    const breath = el => el.getAnimations().find(a => a.animationName === 'dt-breathe');
    // Where in its cycle a colon's breath is: its time less its delay.
    const phase = el => {
      const delay = parseFloat(getComputedStyle(el).animationDelay) * 1000;
      return (((breath(el).currentTime - delay) % 1000) + 1000) % 1000;
    };
    s = E.toggle(s, T0 + 1300);
    h.update(E.view(s, T0 + 1300));   // paused with 178.7 s left
    breath(colon).currentTime = 4437;   // the breath has run on, 4.437 s, its phase anything
    breath(onColon).currentTime = 4100;   // the on-field layer's started later (it is not shown on every stage)
    s = E.toggle(s, T0 + 5000);
    h.update(E.view(s, T0 + 5000));   // resumed: 700 ms to the next tick, so 300 ms into the cycle
    assert.equal(clock.style.getPropertyValue('--beat-delay'), '-863ms');
    assert.near(phase(colon), 300, 1, 'the colon peaks on the tick');
    assert.near(phase(onColon), 300, 1, 'and so does the other layer\'s');
    assert.equal(onColon.style.getPropertyValue('--beat-delay'), '-200ms', 'with a delay of its own');
    h.destroy();
  });

  DT.test('render: a still shows a running colon at full strength and a stopped one at rest', () => {
    const url = window.location.href;
    let h = null;
    try {
      history.replaceState(null, '', window.location.pathname + '?demo=single&frozen=1');
      h = R.mount(host());
      h.update(E.view(E.toggle(session(0), T0), T0 + 60000));
      const colon = document.querySelector('.dt-clock[data-clock="main"] .dt-colon');
      assert.equal(getComputedStyle(colon).opacity, '1', 'running');
      h.update(E.view(E.toggle(E.toggle(session(0), T0), T0 + 1000), T0 + 60000));
      assert.equal(getComputedStyle(colon).opacity, '0.55', 'stopped');
    } finally {
      history.replaceState(null, '', url);
      if (h) h.destroy();
    }
  });

  // K13: a theme's lock one-shot keys on data-locking, which only a lock seen happening sets.
  DT.test('render: a half seen to run out or yield carries data-locking for a second; one already out does not', async () => {
    const h = R.mount(host());
    let s = E.toggle(session(stageIdx('自由辩论')), T0);
    h.update(E.view(s, T0 + 239000));
    const root = document.querySelector('.dt-stage');
    const pro = root.querySelector('.dt-half[data-side="pro"]');
    try {
      assert.ok(!pro.hasAttribute('data-locking'));
      s = E.tick(s, T0 + 240100).session;
      h.update(E.view(s, T0 + 240100));
      assert.ok(pro.hasAttribute('data-locked'), 'out of time');
      assert.ok(pro.hasAttribute('data-locking'), 'and seen to go');
      assert.ok(!root.querySelector('.dt-half[data-side="con"]').hasAttribute('data-locking'));
      await wait(1050);
      assert.ok(!pro.hasAttribute('data-locking'), 'for a second only');
      assert.ok(pro.hasAttribute('data-locked'));
    } finally { h.destroy(); }
    const again = R.mount(host());
    again.update(E.view(s, T0 + 241000));
    const out = document.querySelector('.dt-half[data-side="pro"]');
    assert.ok(out.hasAttribute('data-locked') && !out.hasAttribute('data-locking'), 'not on the first paint');
    again.destroy();
    const yielding = R.mount(host());
    let y = E.toggle(session(stageIdx('自由辩论')), T0);
    yielding.update(E.view(y, T0 + 10000));
    y = E.yieldTime(y, T0 + 10000);
    yielding.update(E.view(y, T0 + 10016));
    assert.ok(document.querySelector('.dt-half[data-side="pro"]').hasAttribute('data-locking'), 'a yield is seen too');
    yielding.destroy();
    const thumb = R.mount(host(), { thumbnail: true });
    thumb.update(E.view(E.toggle(session(stageIdx('自由辩论')), T0), T0 + 239000));
    thumb.update(E.view(s, T0 + 240100));
    assert.ok(!document.querySelector('.dt-half[data-side="pro"]').hasAttribute('data-locking'), 'never on a thumbnail');
    thumb.destroy();
  });

  // S8: the field's edge in steps of about a pixel at 1920, not a new value every frame.
  DT.test('render: --used and --remain move in steps of 1/2000', () => {
    const h = R.mount(host());
    h.update(E.view(E.toggle(session(0), T0), T0 + 60123));
    const root = document.querySelector('.dt-stage');
    const used = Number(root.style.getPropertyValue('--used'));
    assert.near(used * 2000, Math.round(used * 2000), 1e-6, 'a multiple of 1/2000: ' + used);
    assert.near(used, 60.123 / 180, 1 / 4000);
    h.update(E.view(E.toggle(session(stageIdx('自由辩论')), T0), T0 + 77777));
    const remain = Number(root.querySelector('.dt-half[data-side="pro"]').style.getPropertyValue('--remain'));
    assert.near(remain * 2000, Math.round(remain * 2000), 1e-6, 'a multiple of 1/2000: ' + remain);
    assert.near(remain, 1 - 77.777 / 240, 1 / 4000);
    h.destroy();
  });

  // S10: the lock's end state holds at once, so a stage opening with a side out shows it still; only its transitions
  // wait for the entrance to be over (an animation could not be gated so: it plays whenever its rule starts to match).
  DT.test('render: a side out of time keeps its digits\' place; they recede and 时间到 is centred over them', () => {
    const h = R.mount(host());
    let s = E.toggle(session(stageIdx('自由辩论')), T0);
    s = E.tick(s, T0 + 241000).session;
    h.update(E.view(s, T0 + 241000));
    const root = document.querySelector('.dt-stage');
    const pro = root.querySelector('.dt-half[data-side="pro"]');
    const clock = pro.querySelector('.dt-clock'), digits = clock.querySelector('.dt-digits'), state = clock.querySelector('.dt-state');
    assert.equal(state.textContent, '时间到');
    const d = getComputedStyle(digits), st = getComputedStyle(state);
    assert.ok(d.display !== 'none', 'the digits keep their box');
    assert.equal(d.opacity, '0');
    assert.equal(d.scale, '0.92');
    assert.equal(st.position, 'absolute');
    assert.ok(/dt-fade-in/.test(st.animationName) && st.animationDelay === '0.2s', 'the word comes in after them: ' + st.animationName);
    const c = clock.getBoundingClientRect(), r = state.getBoundingClientRect();
    assert.near((r.left + r.right) / 2, (c.left + c.right) / 2, 1, 'centred across');
    assert.near((r.top + r.bottom) / 2, (c.top + c.bottom) / 2, 1, 'and down');
    assert.near(c.width, digits.getBoundingClientRect().width / 0.92, 2, 'the clock keeps the digits\' size');
    assert.ok(root.classList.contains('is-entering'));
    assert.ok(!/opacity/.test(d.transitionProperty), 'no fade while the stage enters: ' + d.transitionProperty);
    assert.ok(!/--remain/.test(getComputedStyle(pro).transitionProperty), 'nor a drain');
    root.classList.remove('is-entering');
    assert.equal(d.transitionProperty, 'font-size, color, opacity, scale');
    assert.equal(d.transitionDuration, '0.52s, 0.3s, 0.24s, 0.24s');
    assert.equal(getComputedStyle(pro).transitionProperty, 'filter, --dim, --remain');
    assert.equal(d.opacity, '0', 'the same end state');
    h.destroy();
  });

  // S4 / K9: the switch's parts end together: the digits' size and the dim over 520 ms, off the divider's spring.
  DT.test('render: the waiting half dims by --dim as well as its filter, with the digits\' size, over 520 ms', () => {
    const h = R.mount(host());
    h.update(E.view(E.toggle(session(stageIdx('自由辩论')), T0), T0 + 30000));
    const root = document.querySelector('.dt-stage');
    root.classList.remove('is-entering');
    const half = side => getComputedStyle(root.querySelector('.dt-half[data-side="' + side + '"]'));
    assert.equal(half('pro').getPropertyValue('--dim').trim(), '0', 'speaking');
    assert.equal(half('con').getPropertyValue('--dim').trim(), '1', 'waiting');
    assert.equal(half('con').transitionProperty, 'filter, --dim');
    assert.equal(half('con').transitionDuration, '0.52s, 0.52s');
    const digits = getComputedStyle(root.querySelector('.dt-half[data-side="pro"] .dt-digits'));
    assert.equal(digits.transitionProperty, 'font-size, color');
    assert.equal(digits.transitionTimingFunction.indexOf('cubic-bezier(0.2, 0.8, 0.2, 1)'), 0, 'ease-out, no overshoot');
    assert.equal(getComputedStyle(root.querySelector('.dt-halves')).transitionTimingFunction, 'cubic-bezier(0.34, 1.36, 0.64, 1)', 'the divider keeps its spring');
    h.destroy();
  });

  // S6 / A: the text rises in reading order, filling backwards only, so no property is held once it has risen.
  DT.test('render: the entrance rises in reading order, fills backwards, and the warn line comes in with the field', () => {
    const h = R.mount(host());
    const root = () => document.querySelector('.dt-stage');
    const anim = sel => {
      const cs = getComputedStyle(root().querySelector(sel));
      return [cs.animationName, cs.animationDelay, cs.animationFillMode].join(' ');
    };
    h.update(E.view(E.toggle(session(0), T0), T0 + 1000));
    assert.ok(root().classList.contains('is-entering'));
    assert.equal(anim('.dt-title'), 'dt-rise 0s backwards');
    assert.equal(anim('.dt-speaker'), 'dt-rise 0.07s backwards');
    assert.equal(anim('.dt-clock[data-clock="main"]'), 'dt-rise 0.14s backwards');
    assert.equal(anim('.dt-warnline'), 'dt-fade-in 0.26s backwards');
    h.update(E.view(session(stageIdx('评委打分')), T0));
    assert.equal(anim('.dt-card'), 'none 0s none', 'a card does not rise as one block');
    assert.equal(anim('.dt-title'), 'dt-rise 0s backwards');
    assert.equal(anim('.dt-clock[data-clock="main"]'), 'dt-rise 0.14s backwards');
    assert.equal(anim('.dt-motions'), 'dt-rise 0.21s backwards', 'a break: name, digits, then the motions');
    h.update(E.view(E.createSession(F(), MATCH, T0), T0));
    assert.equal(anim('.dt-motions'), 'dt-rise 0s backwards', 'the title card: the motions');
    assert.equal(anim('.dt-teams'), 'dt-rise 0.07s backwards', 'then the teams');
    let e = E.goto(E.toggle(session(0), T0), 99, T0 + 60000);
    h.update(Object.assign(E.view(e, T0 + 60000), { record: E.record(e, T0 + 60000) }));
    assert.equal(anim('.dt-record'), 'dt-rise 0.14s backwards', 'the end card: the record after its name');
    const seg = root().querySelector('.dt-seg[data-state="current"]') || root().querySelector('.dt-seg');
    assert.equal(getComputedStyle(seg).transitionProperty, 'opacity');
    h.update(E.view(session(1), T0));
    assert.equal(getComputedStyle(root().querySelector('.dt-seg[data-state="current"]'), '::after').animationName, 'dt-fade-in');
    h.destroy();
  });

  DT.test('render: the entrance class stays for 1100 ms, room for a theme\'s entrance of up to a second', async () => {
    const h = R.mount(host());
    h.update(E.view(session(0), T0));
    const root = document.querySelector('.dt-stage');
    try {
      await wait(1050);
      assert.ok(root.classList.contains('is-entering'), 'still entering at 1050 ms');
      await wait(100);
      assert.ok(!root.classList.contains('is-entering'), 'over by 1150 ms');
    } finally { h.destroy(); }
  });

  DT.test('render: the toast leaves easing in and arrives easing out', () => {
    const h = R.mount(host());
    h.update(E.view(session(0), T0));
    const t = document.querySelector('.dt-toast');
    assert.equal(getComputedStyle(t).transitionTimingFunction, 'ease-in');
    h.toast('已撤销');
    assert.equal(getComputedStyle(t).transitionTimingFunction, 'cubic-bezier(0.2, 0.8, 0.2, 1)');
    h.destroy();
  });

  DT.test('render: a dual team name sits in a box of its own and steps down when long', () => {
    const h = R.mount(host());
    const long = '物理学院与天文学系及近代物理系联合代表队';
    const m = Object.assign({}, MATCH, { conTeam: long });
    h.update(E.view(E.goto(E.createSession(F(), m, T0), stageIdx('自由辩论'), T0), T0));
    const team = side => document.querySelector('.dt-half[data-side="' + side + '"] .dt-team');
    assert.equal(team('con').querySelector('.dt-team-name').textContent, long);
    assert.equal(team('con').getAttribute('data-long'), 'true');
    assert.equal(team('pro').querySelector('.dt-team-name').textContent, '物理学院');
    assert.equal(team('pro').getAttribute('data-long'), 'false');
    h.destroy();
  });
})();
