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
})();
