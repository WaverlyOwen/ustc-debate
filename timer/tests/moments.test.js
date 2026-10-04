(function () {
  const E = DT.engine, R = DT.render;
  const T0 = 1000000;
  const MATCH = { title: '测试', proMotion: '甲', conMotion: '乙', proTeam: '', conTeam: '', proSeat: 'left' };
  const F = () => DT.BUILTIN_FORMATS.find(f => f.id === 'ustc-freshman-cup');
  const idx = name => F().stages.findIndex(s => s.name === name);
  function host() {
    const box = document.getElementById('sandbox');
    box.innerHTML = '<div class="dt-stage-host" style="width:960px;height:540px"></div>';
    return box.firstChild;
  }
  function spyTheme(id, log) {
    DT.themes.register(id, { decorate: () => ({ moment: (n, d) => log.push([n, d && d.side]), destroy() { log.push(['destroyed']); } }) });
    const saved = DT.THEMES; DT.THEMES = (saved || []).concat([{ id, name: 'x', desc: 'x', tone: 'dark' }]);
    return () => { DT.THEMES = saved; };
  }

  DT.test('render: moments are derived from view changes and events', () => {
    const log = []; const undo = spyTheme('zz-moments', log);
    try {
      const h = R.mount(host());
      let s = E.goto(E.createSession(F(), MATCH, T0, { theme: 'zz-moments' }), 0, T0);
      h.update(E.view(s, T0));                                   // enter
      s = E.toggle(s, T0); h.update(E.view(s, T0));              // start
      h.pulse({ type: 'warn', clock: 'main' });                  // warn
      s = E.toggle(s, T0 + 1000); h.update(E.view(s, T0 + 1000)); // pause
      const names = log.map(x => x[0]);
      ['enter', 'start', 'warn', 'pause'].forEach(n => assert.ok(names.indexOf(n) >= 0, n));
      h.destroy();
      assert.ok(names.concat(log.map(x => x[0])).indexOf('destroyed') >= 0);
    } finally { undo(); }
  });

  DT.test('render: a moment replays its class on the stage', () => {
    const h = R.mount(host());
    const s = E.toggle(E.goto(E.createSession(F(), MATCH, T0), 0, T0), T0);
    h.update(E.view(s, T0));
    h.pulse({ type: 'warn', clock: 'main' });
    const root = document.querySelector('.dt-stage');
    assert.ok(root.classList.contains('is-m-warn'));
    h.pulse({ type: 'warn', clock: 'main' });
    assert.ok(root.classList.contains('is-m-warn'));
    h.destroy();
  });

  DT.test('render: lock and switch are reported with their side', () => {
    const log = []; const undo = spyTheme('zz-side', log);
    try {
      const h = R.mount(host());
      let s = E.goto(E.createSession(F(), MATCH, T0, { theme: 'zz-side' }), idx('自由辩论'), T0);
      s = E.toggle(s, T0); h.update(E.view(s, T0));
      s = E.yieldTime(s, T0 + 1000); h.update(E.view(s, T0 + 1000));
      assert.ok(log.some(x => x[0] === 'lock' && x[1] === 'pro'));
      assert.ok(log.some(x => x[0] === 'switch'));
      h.destroy();
    } finally { undo(); }
  });

  DT.test('render: thumbnails and reduced motion get no moments', () => {
    const log = []; const undo = spyTheme('zz-still', log);
    try {
      const h = R.mount(host(), { thumbnail: true });
      const s = E.toggle(E.goto(E.createSession(F(), MATCH, T0, { theme: 'zz-still' }), 0, T0), T0);
      h.update(E.view(s, T0)); h.pulse({ type: 'warn', clock: 'main' });
      assert.equal(log.filter(x => x[0] !== 'destroyed').length, 0);
      assert.ok(!document.querySelector('.dt-stage').classList.contains('is-m-warn'));
      h.destroy();
    } finally { undo(); }
  });

  DT.test('render: rapid moments do not pile up elements', () => {
    const h = R.mount(host());
    const s = E.toggle(E.goto(E.createSession(F(), MATCH, T0), 0, T0), T0);
    h.update(E.view(s, T0));
    const before = document.querySelector('.dt-stage').querySelectorAll('*').length;
    for (let i = 0; i < 50; i++) h.pulse({ type: 'count', clock: 'main', key: 'c' + (i % 5) });
    const after = document.querySelector('.dt-stage').querySelectorAll('*').length;
    assert.ok(after - before <= 12, 'grew by ' + (after - before));
    h.destroy();
  });

  DT.test('render: two stages animate independently', () => {
    const box = document.getElementById('sandbox');
    box.innerHTML = '<div class="dt-stage-host" style="width:480px;height:270px"></div><div class="dt-stage-host" style="width:480px;height:270px"></div>';
    const a = R.mount(box.children[0]), b = R.mount(box.children[1]);
    const s = E.toggle(E.goto(E.createSession(F(), MATCH, T0), 0, T0), T0);
    a.update(E.view(s, T0)); b.update(E.view(s, T0));
    a.pulse({ type: 'warn', clock: 'main' });
    assert.ok(box.children[0].querySelector('.dt-stage').classList.contains('is-m-warn'));
    assert.ok(!box.children[1].querySelector('.dt-stage').classList.contains('is-m-warn'));
    a.destroy(); b.destroy();
  });
})();
