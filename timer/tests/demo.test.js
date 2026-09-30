(function () {
  const E = DT.engine;
  const NOW = 7000000;
  const build = name => DT.demo.build(name, NOW);
  const view = d => E.view(d.session, NOW);
  const texts = v => v.clocks.map(c => c.text);

  DT.test('demo: every name builds a timer session for the freshman cup match', () => {
    assert.ok(DT.demo.names.length >= 13);
    DT.demo.names.filter(name => name.indexOf('setup') !== 0).forEach(name => {
      const d = build(name);
      assert.equal(d.route, 'timer', name);
      assert.equal(d.session.match.title, '新生赛 第 3 场', name);
      assert.equal(d.session.match.proTeam, '物理学院', name);
      assert.equal(d.session.match.conMotion, '大学生不应该优先发展兴趣', name);
    });
  });

  DT.test('demo: single stages show the brief\'s times and phases', () => {
    let v = view(build('title'));
    assert.equal(v.mode, 'title');
    v = view(build('single'));
    assert.equal(v.stage.name, '正方一辩开篇立论');
    assert.deepEqual(texts(v), ['1:47']);
    assert.equal(v.running, true);
    v = view(build('cross'));
    assert.equal(v.stage.name, '反方四辩质询正方一辩');
    assert.deepEqual(texts(v), ['0:24']);
    assert.equal(v.clocks[0].phase, 'warn');
    v = view(build('over'));
    assert.equal(v.stage.name, '反方四辩结辩');
    assert.deepEqual(texts(v), ['+0:07']);
    assert.equal(v.clocks[0].phase, 'over');
    v = view(build('break'));
    assert.equal(v.stage.type, 'break');
    assert.deepEqual(texts(v), ['0:18']);
  });

  DT.test('demo: free debate states', () => {
    let v = view(build('dual'));
    assert.equal(v.stage.name, '自由辩论');
    assert.deepEqual(texts(v), ['2:31', '3:12']);
    assert.equal(v.clocks[0].running, true);
    v = view(build('dual-locked'));
    assert.deepEqual(texts(v), ['0:48', '0:00']);
    assert.equal(v.clocks[1].locked, true);
    assert.equal(v.clocks[0].running, true);
    v = view(build('dual-idle'));
    assert.equal(v.stage.type, 'dual');
    assert.equal(v.clocks.some(c => c.active), false);
  });

  DT.test('demo: end card has time on every stage and two overtimes', () => {
    const d = build('end');
    assert.equal(view(d).mode, 'end');
    const rec = E.record(d.session, NOW);
    assert.equal(rec.length, 18);
    assert.ok(rec.every(r => r.used > 0));
    assert.equal(rec.filter(r => r.over >= 1000).length, 2);
  });

  DT.test('demo: theme, seat and long variants', () => {
    const day = build('daylight'), chroma = build('chroma'), right = build('seat-right');
    assert.equal(day.session.theme, 'daylight');
    assert.deepEqual(texts(view(day)), ['1:47']);
    assert.equal(chroma.session.theme, 'chroma');
    assert.deepEqual(texts(view(chroma)), ['2:31', '3:12']);
    assert.equal(right.session.match.proSeat, 'right');
    assert.deepEqual(texts(view(right)), ['2:31', '3:12']);
    const v = view(build('long'));
    assert.equal(Array.from(v.stage.name).length, 40);
    assert.equal(v.clocks[0].total, 3600000);
    assert.equal(v.clocks[0].text.length, 5);
  });

  DT.test('demo: the setup scenes remember the last match; setup-resume leaves the free debate unfinished', () => {
    const plain = build('setup'), resume = build('setup-resume');
    [plain, resume].forEach(d => {
      assert.equal(d.route, 'setup');
      assert.deepEqual(d.lastMatch, { formatId: 'ustc-freshman-cup', proMotion: '大学生应该优先发展兴趣',
        conMotion: '大学生不应该优先发展兴趣', proTeam: '物理学院', conTeam: '化学院', proSeat: 'left' });
    });
    assert.equal(plain.session, null);
    assert.equal(view(resume).stage.name, '自由辩论');
    assert.deepEqual(texts(view(resume)), ['2:31', '3:12']);
  });

  DT.test('demo: sessions are played out by engine actions, so undo works', () => {
    const s = build('single').session;
    assert.ok(s.history.length >= 2);
    assert.equal(E.getRun(E.undo(s, NOW)).running, false);
  });

  function bootDemo(search) {
    const box = document.getElementById('sandbox');
    box.innerHTML = '<div></div>';
    const writes = [];
    const spy = { getItem: () => null, setItem: k => writes.push(k), removeItem: k => writes.push(k) };
    const c = DT.app.boot({ root: box.firstChild, storage: spy, location: { search, hash: '' } });
    return { c, box, writes };
  }

  DT.test('ui: ?demo=…&frozen=1 renders the demo on a stopped clock', () => {
    const t = bootDemo('?demo=single&frozen=1');
    try {
      const a = DT.clock.now();
      assert.equal(DT.clock.now(), a);
      assert.equal(t.c.session().cursor, 0);
      assert.equal(t.c.view().clocks[0].text, '1:47');
      const stage = t.box.querySelector('.dt-stage');
      assert.equal(stage.dataset.side, 'pro');
      assert.equal(stage.querySelector('.dt-min').textContent + ':' + stage.querySelector('.dt-sec').textContent, '1:47');
      assert.deepEqual(t.writes, []);
    } finally { t.c.destroy(); DT.clock.reset(); }
  });

  DT.test('ui: the end demo view carries the record for the end card', () => {
    const t = bootDemo('?demo=end&frozen=1');
    try {
      assert.equal(t.c.view().record.length, 18);
      assert.ok(t.box.querySelectorAll('.dt-record tr').length > 18);
    } finally { t.c.destroy(); DT.clock.reset(); }
  });

  DT.test('ui: without a demo it opens the setup page with the first built-in format chosen', () => {
    const t = bootDemo('');
    try {
      assert.equal(t.c.route(), 'setup');
      assert.equal(t.box.querySelector('.dt-stage'), null);
      const chosen = t.box.querySelector('[data-format-id][aria-selected="true"]');
      assert.equal(chosen.dataset.formatId, DT.BUILTIN_FORMATS[0].id);
      assert.deepEqual(t.writes, []);
      t.c.destroy();
      assert.equal(t.box.querySelector('.dt-setup'), null);
    } finally { DT.clock.reset(); }
  });

  DT.test('ui: an unknown demo name opens the setup page', () => {
    const t = bootDemo('?demo=nope');
    try {
      assert.equal(t.c.route(), 'setup');
    } finally { t.c.destroy(); DT.clock.reset(); }
  });
})();
