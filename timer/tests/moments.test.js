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

  // ---- review fixes (fix round 1): hall's own sweep edge, rings under the digits, a draining lock, stated curves,
  // dual digits that scale instead of changing size ----

  const after = el => getComputedStyle(el, '::after');
  const z = el => Number(getComputedStyle(el).zIndex);

  DT.test('hall: a thin bright edge rides the entrance sweep, from the seat the field comes from', () => {
    const h = R.mount(host());
    h.update(E.view(E.goto(E.createSession(F(), MATCH, T0, { theme: 'hall' }), 0, T0), T0));
    const root = document.querySelector('.dt-stage');
    assert.ok(root.classList.contains('is-m-enter'));
    const edge = after(root.querySelector('.dt-deco-over'));
    const field = getComputedStyle(root.querySelector('.dt-field'));
    assert.equal(edge.animationName, 'dt-hall-edge-' + (root.dataset.side === 'pro' ? 'l' : 'r'));
    assert.equal(edge.animationDuration, field.animationDuration, 'as long as the sweep');
    assert.equal(edge.animationTimingFunction, field.animationTimingFunction, 'on the sweep\'s curve');
    assert.ok(parseFloat(edge.width) <= 2, 'a hairline: ' + edge.width);
    root.classList.remove('is-m-enter');
    assert.equal(after(root.querySelector('.dt-deco-over')).content, 'none', 'gone with the moment');
    h.destroy();

    const right = R.mount(host());
    const m = Object.assign({}, MATCH, { proSeat: 'right' });
    right.update(E.view(E.goto(E.createSession(F(), m, T0, { theme: 'hall' }), 0, T0), T0));
    const r = document.querySelector('.dt-stage');
    const want = (r.dataset.side === 'pro') === (r.dataset.proSeat === 'right') ? 'r' : 'l';
    assert.equal(after(r.querySelector('.dt-deco-over')).animationName, 'dt-hall-edge-' + want, 'from the right-hand seat');
    right.destroy();

    const dual = R.mount(host());
    dual.update(E.view(E.goto(E.createSession(F(), MATCH, T0, { theme: 'hall' }), idx('自由辩论'), T0), T0));
    const d = document.querySelector('.dt-stage');
    assert.equal(after(d.querySelector('.dt-half:first-child')).animationName, 'dt-hall-edge-half-l');
    assert.equal(after(d.querySelector('.dt-half:last-child')).animationName, 'dt-hall-edge-half-r');
    dual.destroy();
  });

  DT.test('render: a bell\'s ring sits under the digits, in a dual stage inside its own half', () => {
    const h = R.mount(host());
    h.update(E.view(E.toggle(E.goto(E.createSession(F(), MATCH, T0), 0, T0), T0), T0));
    h.pulse({ type: 'warn', clock: 'main' });
    const root = document.querySelector('.dt-stage');
    const ring = root.querySelector('.dt-ring');
    assert.ok(ring.parentNode.classList.contains('dt-rings'));
    assert.ok(z(ring.parentNode) < z(root.querySelector('.dt-clock[data-clock="main"]')), 'the ring layer under the clock');
    h.destroy();

    const d = R.mount(host());
    const s = E.toggle(E.goto(E.createSession(F(), MATCH, T0), idx('自由辩论'), T0), T0);
    d.update(E.view(s, T0));
    d.pulse({ type: 'warn', clock: 'pro' });
    const half = document.querySelector('.dt-half[data-side="pro"]');
    const dr = document.querySelector('.dt-ring');
    assert.equal(dr.parentNode, half, 'in the half of the clock that rang');
    assert.ok(z(dr) < z(half.querySelector('.dt-clock')), 'under that half\'s clock');
    dr.style.animation = 'none';   // measure its box at rest, not part way through its growth
    dr.style.opacity = '1';
    const rb = dr.getBoundingClientRect(), cb = half.querySelector('.dt-digits').getBoundingClientRect();
    assert.near(rb.left + rb.width / 2, cb.left + cb.width / 2, 2, 'centred on the digits across');
    assert.near(rb.top + rb.height / 2, cb.top + cb.height / 2, 2, 'and down');
    d.destroy();
  });

  DT.test('render: a side that locks drains its field from what it had left', () => {
    const h = R.mount(host());
    let s = E.toggle(E.goto(E.createSession(F(), MATCH, T0, { theme: 'hall' }), idx('自由辩论'), T0), T0);
    h.update(E.view(s, T0));
    s = E.yieldTime(s, T0 + 1000);
    const v = E.view(s, T0 + 1000);
    h.update(v);
    const half = document.querySelector('.dt-half[data-side="pro"]');
    const pro = v.clocks.find(c => c.id === 'pro');
    assert.ok(half.hasAttribute('data-locked'));
    assert.ok(pro.yielded / pro.total > 0.9, 'yielded with most of its time');
    assert.near(parseFloat(half.style.getPropertyValue('--lock-from')), pro.yielded / pro.total, 0.001, 'the time left when it locked');
    const field = half.querySelector('.dt-half-field');
    const cs = getComputedStyle(field);
    assert.ok(cs.transitionProperty.split(', ').indexOf('clip-path') >= 0, 'cut away, not dropped: ' + cs.transitionProperty);
    assert.ok(parseFloat(cs.transitionDuration) >= 0.15, cs.transitionDuration);
    assert.ok(field.getBoundingClientRect().height > 0.9 * half.getBoundingClientRect().height, 'the field keeps its height');
    h.destroy();
  });

  DT.test('render: dual digits keep one size; the clocks scale on a switch', () => {
    const h = R.mount(host());
    const s = E.toggle(E.goto(E.createSession(F(), MATCH, T0), idx('自由辩论'), T0), T0);
    const root = h.el;
    root.querySelectorAll('.dt-half .dt-clock').forEach(c => { c.style.transition = 'none'; });
    h.update(E.view(s, T0));
    const on = root.querySelector('.dt-half[data-active]'), off = root.querySelector('.dt-half:not([data-active])');
    const dg = el => getComputedStyle(el.querySelector('.dt-digits'));
    assert.equal(dg(on).fontSize, dg(off).fontSize, 'one font size');
    assert.ok(dg(on).transitionProperty.indexOf('font-size') < 0, 'no font-size transition: ' + dg(on).transitionProperty);
    const scale = el => parseFloat(getComputedStyle(el.querySelector('.dt-clock')).getPropertyValue('--clock-scale'));
    assert.near(scale(on), 1, 0.001);
    assert.near(scale(off), 0.5, 0.001);
    const hOn = on.querySelector('.dt-digits').getBoundingClientRect().height;
    const hOff = off.querySelector('.dt-digits').getBoundingClientRect().height;
    assert.near(hOff / hOn, 0.5, 0.02, 'the waiting side at half size');
    root.querySelectorAll('.dt-half .dt-clock').forEach(c => { c.style.transition = ''; });
    assert.ok(getComputedStyle(on.querySelector('.dt-clock')).transitionProperty.indexOf('--clock-scale') >= 0);
    h.destroy();
  });

  DT.test('hall: every transition and animation on the stage states its curve (no default ease)', () => {
    const split = str => String(str).split(/,(?![^(]*\))/).map(x => x.trim());
    const check = (root, where) => {
      const els = [root].concat(Array.from(root.querySelectorAll('*')));
      els.forEach(el => [null, '::before', '::after'].forEach(pseudo => {
        const cs = getComputedStyle(el, pseudo);
        const name = (typeof el.className === 'string' ? el.className : el.tagName) + (pseudo || '');
        const tDur = split(cs.transitionDuration), tFn = split(cs.transitionTimingFunction);
        tDur.forEach((d, i) => {
          if (parseFloat(d) > 0) assert.ok(tFn[i % tFn.length] !== 'ease', where + ': ' + name + ' transition ' + split(cs.transitionProperty)[i]);
        });
        if (cs.animationName !== 'none') {
          const aDur = split(cs.animationDuration), aFn = split(cs.animationTimingFunction);
          aDur.forEach((d, i) => {
            if (parseFloat(d) > 0) assert.ok(aFn[i % aFn.length] !== 'ease', where + ': ' + name + ' animation ' + split(cs.animationName)[i]);
          });
        }
      }));
    };
    const h = R.mount(host());
    let s = E.toggle(E.goto(E.createSession(F(), MATCH, T0, { theme: 'hall' }), 0, T0), T0);
    h.update(E.view(s, T0));
    h.pulse({ type: 'end', clock: 'main' });
    check(h.el, 'single');
    s = E.toggle(E.goto(s, idx('自由辩论'), T0), T0);
    h.update(E.view(s, T0));
    h.pulse({ type: 'warn', clock: 'pro' });
    check(h.el, 'dual');
    h.destroy();
  });
})();
