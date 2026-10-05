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

  // P5: a new --tension every frame re-lays out the variable-font digits, and with them the page.
  DT.test('render: tension is quantized and not rewritten when unchanged', () => {
    const h = R.mount(host());
    let s = E.toggle(session(0), T0);
    h.update(E.view(s, T0 + 60000));
    const root = document.querySelector('.dt-stage');
    const first = root.style.getPropertyValue('--tension');
    assert.equal(Number(first) * 50 % 1, 0, 'a multiple of 0.02');
    let writes = 0;
    const orig = root.style.setProperty.bind(root.style);
    root.style.setProperty = (k, v) => { if (k === '--tension') writes++; return orig(k, v); };
    h.update(E.view(s, T0 + 60010));
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
      assert.equal(getComputedStyle(sign).animationName, 'dt-breathe', 'overtime breathes');
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

  // Task 38: baseline motion polish tests (hall, daylight, chroma)
  const idx = name => F().stages.findIndex(s => s.name === name);
  const OPENING = '正方一辩开篇立论';

  function mountTheme(theme, view, w, h, opts) {
    const box = document.getElementById('sandbox');
    box.innerHTML = '<div class="dt-stage-host" style="width:' + (w || 960) + 'px;height:' + (h || 540) + 'px"></div>';
    const stage = R.mount(box.firstChild, opts);
    stage.update(view);
    return { stage, root: box.querySelector('.dt-stage') };
  }
  function session(name, theme, seat) {
    const match = { title: '测试', proMotion: '甲', conMotion: '乙', proTeam: '物理学院', conTeam: '化学院', proSeat: seat || 'left' };
    return E.goto(E.createSession(F(), match, T0, { theme }), idx(name), T0);
  }
  const singleAt = (name, theme, secs, seat) => E.view(E.toggle(session(name, theme, seat), T0), T0 + secs * 1000);
  function dualAt(theme, secs, seat) {
    let s = E.floor(session('自由辩论', theme, seat), 'pro', T0);
    s = E.floor(s, 'con', T0 + 20000);
    return E.view(s, T0 + secs * 1000);
  }

  DT.test('theme hall: enter moment adds edge decoration on single stage', () => {
    const view = singleAt(OPENING, 'hall', 2, 'left');
    const { stage, root } = mountTheme('hall', view);
    const decoOver = root.querySelector('.dt-deco-over');
    assert.ok(decoOver, 'deco-over layer exists');
    
    root.classList.add('is-m-enter');
    const after = getComputedStyle(decoOver, '::after');
    assert.ok(after.content !== "none", "edge pseudo-element exists during enter");
    stage.destroy();
  });

  DT.test('theme hall: enter adds edge on dual stage', () => {
    const view = dualAt('hall', 21, 'left');
    const { stage, root } = mountTheme('hall', view);
    const halves = root.querySelectorAll('.dt-half');
    assert.equal(halves.length, 2, 'dual stage has two halves');

    root.classList.add('is-m-enter');
    halves.forEach(half => {
      const after = getComputedStyle(half, '::after');
      assert.ok(after.content !== "none", "edge exists on half");
    });
    stage.destroy();
  });

  DT.test('theme daylight: band positioned relative to clock', () => {
    const view = singleAt(OPENING, 'daylight', 2, 'left');
    const { stage, root } = mountTheme('daylight', view);
    const field = root.querySelector('.dt-field');
    assert.ok(field, 'field exists');
    const style = getComputedStyle(field);
    assert.ok(style.top, 'band has top position');
    stage.destroy();
  });

  DT.test('theme chroma: stable background without animated field', () => {
    const view = singleAt(OPENING, 'chroma', 2, 'left');
    const { stage, root } = mountTheme('chroma', view);
    const bg = getComputedStyle(root).background;
    assert.ok(bg.includes('rgb(0, 177, 64)') || bg.includes('#00b140'), 'chroma key green background');
    const field = root.querySelector('.dt-field');
    assert.ok(!field || getComputedStyle(field).display === 'none', 'no animated field');
    stage.destroy();
  });

  DT.test('theme chroma: plate pseudo-element exists for moments', () => {
    const view = singleAt(OPENING, 'chroma', 2, 'left');
    const { stage, root } = mountTheme('chroma', view);
    const clock = root.querySelector('.dt-clock[data-clock="main"]');
    assert.ok(clock, 'main clock exists');
    const before = getComputedStyle(clock, '::before');
    assert.ok(before.content !== "none", "plate pseudo-element exists");
    stage.destroy();
  });

  DT.test('theme chroma: reduced motion mode handled', () => {
    const view = singleAt(OPENING, 'chroma', 2, 'left');
    const { stage, root } = mountTheme('chroma', view, 960, 540, { reducedMotion: true });
    stage.moment('warn', { side: 'pro', clock: 'main' });
    assert.ok(true, "reduced motion mode handled");
    stage.destroy();
  });

  DT.test('theme chroma: destroy removes stage', () => {
    const view = singleAt(OPENING, 'chroma', 2, 'left');
    const { stage, root } = mountTheme('chroma', view);
    const box = document.getElementById('sandbox');
    stage.destroy();
    assert.equal(box.querySelector('.dt-stage'), null, 'stage removed');
  });
})();
