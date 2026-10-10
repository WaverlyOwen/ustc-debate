(function () {
  const E = DT.engine, R = DT.render;
  const T0 = 1000000;
  const MATCH = { title: '测试', proMotion: '甲', conMotion: '乙', proTeam: '物理学院', conTeam: '化学院', proSeat: 'left' };
  const F = () => DT.BUILTIN_FORMATS.find(f => f.id === 'ustc-freshman-cup');
  const idx = name => F().stages.findIndex(s => s.name === name);
  const OPENING = '正方一辩开篇立论';        // pro, 3:00
  const CROSS = '反方四辩质询正方一辩';      // con, 2:00, right after it
  const CON_OPENING = '反方一辩开篇立论';    // con, 3:00, right after that
  const PRO = 'rgb(184, 50, 42)', PRO_DEEP = 'rgb(82, 21, 17)', CON = 'rgb(29, 78, 137)';

  function host() {
    const box = document.getElementById('sandbox');
    box.innerHTML = '<div class="dt-stage-host" style="width:960px;height:540px"></div>';
    return box.firstChild;
  }
  const root = () => document.querySelector('.dt-stage');
  const deco = () => root().querySelector('.dt-deco');
  const held = name => getComputedStyle(deco()).getPropertyValue(name).trim();
  const outgoing = () => getComputedStyle(deco(), '::before');   // the held field under the new one
  const bare = () => getComputedStyle(deco(), '::after');         // the held field where no new field comes
  const fade = pseudo => root().getAnimations({ subtree: true })
    .find(a => a.animationName === 'dt-hall-outgoing' && a.effect.pseudoElement === pseudo);
  function resolve(el, varName) {
    const probe = document.createElement('i');
    probe.style.color = 'var(' + varName + ')';
    el.appendChild(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  }
  const session = seat => E.createSession(F(), Object.assign({}, MATCH, { proSeat: seat || 'left' }), T0, { theme: 'hall' });
  // Go to a stage at `at` and run it for `share` of its length, then pause: the view's time is when it paused.
  function used(s, name, share, at) {
    s = E.goto(s, idx(name), at);
    s = E.toggle(s, at);
    const end = at + F().stages[idx(name)].secs * 1000 * share;
    return [E.toggle(s, end), end];
  }
  // The entrance over, as render.js's timer leaves it, and the ground's ease run out. The ground's transition is on the
  // stage itself and outlives the class (it would be over by 560 ms; a synchronous test reads its start); only the
  // stage's own animations are finished, since the colons below breathe for ever.
  function settle() {
    const r = root();
    r.classList.remove('is-entering');
    held('--hall-was-r');
    r.getAnimations().forEach(a => a.finish());
  }
  // The left and right insets of a computed clip-path: inset(), as shares of the stage's width (1 or more: nothing shows).
  function sides(clip) {
    const m = /^inset\(([^)]*)\)$/.exec(clip);
    assert.ok(m, 'an inset(): ' + clip);
    const v = m[1].trim().split(/\s+/);
    const right = v[1] || v[0], left = v[3] || right;
    const share = x => /%$/.test(x) ? parseFloat(x) / 100 : parseFloat(x) / root().getBoundingClientRect().width;
    return { left: share(left), right: share(right) };
  }
  // The stages whose field sweeps in from the right-hand seat, across the left-aligned name.
  const far = (seat, side) => (seat === 'left' && side === 'con') || (seat === 'right' && side === 'pro');

  DT.test('theme hall: a stage that sweeps in from the right-hand seat lifts its name and speaker after the field', () => {
    ['left', 'right'].forEach(seat => [[OPENING, 'pro'], [CON_OPENING, 'con']].forEach(([name, side]) => {
      const h = R.mount(host());
      h.update(E.view(E.goto(session(seat), idx(name), T0), T0));
      const r = root(), delay = sel => getComputedStyle(r.querySelector(sel)).animationDelay;
      const where = seat + ' / ' + side;
      assert.ok(r.classList.contains('is-entering'), where);
      assert.equal(delay('.dt-title'), far(seat, side) ? '0.26s' : '0s', where + ': name');
      assert.equal(delay('.dt-speaker'), far(seat, side) ? '0.33s' : '0.07s', where + ': speaker');
      assert.equal(delay('.dt-clock[data-clock="main"]'), '0.14s', where + ': the digits keep theirs');
      h.destroy();
    }));
    // A dual stage's name sits in the left half, which sweeps in from the left: con holding the floor with pro on the
    // left is no reason to wait, and a switch mid-entrance must not move the delay.
    const h = R.mount(host());
    h.update(E.view(E.floor(E.goto(session('left'), idx('自由辩论'), T0), 'con', T0), T0));
    assert.equal(root().dataset.side, 'con');
    assert.equal(getComputedStyle(root().querySelector('.dt-title')).animationDelay, '0s', 'dual: name');
    assert.equal(getComputedStyle(root().querySelector('.dt-speaker')).animationDelay, '0.07s', 'dual: speaker');
    h.destroy();
  });

  // The hold starts from the stage on screen only because render.js enters (and replay() flushes the styles) before it
  // writes the new stage: this pins that order too.
  DT.test('theme hall: a new stage holds the field it replaces under its own while it enters', () => {
    const h = R.mount(host());
    let [s, at] = used(session('left'), OPENING, 0.4, T0);
    h.update(E.view(s, at));
    settle();
    s = E.goto(s, idx(CROSS), at + 1000);
    h.update(E.view(s, at + 1000));
    assert.equal(root().dataset.side, 'con');
    assert.ok(root().classList.contains('is-entering'));
    assert.near(parseFloat(held('--hall-was-r')), 0.4, 0.001, 'the pro field as it stood, 40% taken back');
    assert.equal(parseFloat(held('--hall-was-l')), 0);
    assert.equal(held('--hall-was-field'), PRO);
    assert.equal(outgoing().display, 'block');
    assert.equal(outgoing().animationName, 'dt-hall-outgoing');
    assert.equal(outgoing().animationFillMode, 'backwards', 'it holds nothing once it has faded');
    assert.equal(getComputedStyle(root()).backgroundColor, PRO_DEEP, 'the ground eases from 朱·沉');
    // It keeps the field's light from above, and the bottom bar eases with the ground.
    const light = getComputedStyle(root().querySelector('.dt-field')).backgroundImage;
    assert.equal(outgoing().backgroundImage, light, 'the same light from above');
    assert.equal(bare().backgroundImage, light, 'on both parts');
    const probe = document.createElement('i');
    probe.style.backgroundImage = 'linear-gradient(to top, color-mix(in oklab, ' + PRO_DEEP + ' 55%, transparent), transparent)';
    root().appendChild(probe);
    assert.equal(getComputedStyle(root().querySelector('.dt-bottom'), '::before').backgroundImage, getComputedStyle(probe).backgroundImage,
      'the bottom bar eases with the ground');
    probe.remove();
    // The con field comes in full, so all of the held field is under it, and nothing of it is left bare.
    const u = sides(outgoing().clipPath), b = sides(bare().clipPath);
    assert.ok(Math.abs(u.left) < 1e-3 && Math.abs(u.right - 0.4) < 1e-3, 'under the new field: all of it, ' + outgoing().clipPath);
    assert.ok(b.left + b.right >= 1 - 1e-3, 'nothing bare: ' + bare().clipPath);
    // Under the new field it is solid until pushed over, ease-in: still .87 at 280 ms, gone at 560 ms.
    assert.equal(outgoing().animationTimingFunction, 'cubic-bezier(0.55, 0, 1, 0.45)', 'into a stage: ease-in');
    const under = fade('::before');
    assert.ok(under, 'the held field fades');
    under.pause();
    under.currentTime = 280;
    assert.near(parseFloat(outgoing().opacity), 0.865, 0.02, 'still solid at 280 ms');
    under.currentTime = 560;
    assert.equal(parseFloat(outgoing().opacity), 0, 'gone at 560 ms');
    under.play();
    root().classList.remove('is-entering');
    assert.equal(outgoing().display, 'none');
    assert.equal(bare().display, 'none');
    assert.equal(parseFloat(held('--hall-was-r')), 0, 'the hold stops with the class: the live con field');
    assert.equal(held('--hall-was-field'), CON);
    settle();
    assert.equal(getComputedStyle(root()).backgroundColor, resolve(root(), '--side-deep'), 'then the con deep ground');
    h.destroy();
  });

  // Into a break (as into a card or a dual stage) no field comes over the held one: all of it dims with the room.
  DT.test('theme hall: into a break the held field dims with the room', () => {
    const h = R.mount(host());
    let [s, at] = used(session('left'), OPENING, 0.4, T0);
    h.update(E.view(s, at));
    settle();
    s = E.goto(s, idx('评委打分'), at + 1000);
    h.update(E.view(s, at + 1000));
    assert.ok(root().classList.contains('is-entering'));
    const u = sides(outgoing().clipPath), b = sides(bare().clipPath);
    assert.ok(u.left + u.right >= 1 - 1e-3, 'nothing under a new field: ' + outgoing().clipPath);
    assert.ok(Math.abs(b.left) < 1e-3 && Math.abs(b.right - 0.4) < 1e-3, 'all of it bare: ' + bare().clipPath);
    assert.equal(bare().display, 'block');
    assert.equal(bare().animationName, 'dt-hall-outgoing');
    assert.equal(bare().animationTimingFunction, 'cubic-bezier(0.2, 0.8, 0.2, 1)', 'ease-out, with the room');
    assert.equal(bare().animationFillMode, 'backwards');
    h.destroy();
  });

  // Back to a single stage that has used time (Z, ← or a goto) from a full field: the new field sweeps only up to its
  // edge. Under it the held field waits to be pushed over (ease-in); past that edge nothing will cover it, so it dims
  // with the room (ease-out) rather than hold solid and drop. Back to a stage run into overtime no field comes at all.
  DT.test('theme hall: back to a used or overtime stage, the held field past the new field\'s edge dims with the room', () => {
    [['left', 0.4], ['right', 0.4], ['left', 1.05]].forEach(([seat, share]) => {
      const where = seat + ' / ' + share;
      const h = R.mount(host());
      const frame = v => { h.update(v); held('--hall-was-r'); };
      let [s, at] = used(session(seat), OPENING, share, T0);
      frame(E.view(s, at));
      s = E.goto(s, idx(CROSS), at + 1000);   // con, not started: its field full
      frame(E.view(s, at + 1000));
      settle();
      s = E.goto(s, idx(OPENING), at + 2000);   // back
      frame(E.view(s, at + 2000));
      const r = root(), now = Math.min(1, share);
      assert.ok(r.classList.contains('is-entering') && r.dataset.side === 'pro', where);
      assert.near(parseFloat(r.style.getPropertyValue('--used')), now, 0.001, where + ': the stage kept its time');
      assert.equal(held('--hall-was-field'), CON, where + ': the full con field held');
      // Pro's field lies at pro's seat; the held con field is all of the stage.
      const u = sides(outgoing().clipPath), b = sides(bare().clipPath);
      const want = seat === 'left' ? [{ left: 0, right: now }, { left: 1 - now, right: 0 }] : [{ left: now, right: 0 }, { left: 0, right: 1 - now }];
      if (now < 1) {
        assert.ok(Math.abs(u.left - want[0].left) < 1e-3 && Math.abs(u.right - want[0].right) < 1e-3, where + ': under it, ' + outgoing().clipPath);
      } else {
        assert.ok(u.left + u.right >= 1 - 1e-3, where + ': no new field, nothing under it: ' + outgoing().clipPath);
      }
      assert.ok(Math.abs(b.left - want[1].left) < 1e-3 && Math.abs(b.right - want[1].right) < 1e-3, where + ': bare, ' + bare().clipPath);
      assert.equal(outgoing().animationTimingFunction, 'cubic-bezier(0.55, 0, 1, 0.45)', where + ': under it, ease-in');
      assert.equal(bare().animationName, 'dt-hall-outgoing', where);
      assert.equal(bare().animationTimingFunction, 'cubic-bezier(0.2, 0.8, 0.2, 1)', where + ': bare, ease-out');
      assert.equal(bare().animationFillMode, 'backwards', where);
      // At 280 ms the part under the new field still holds; the bare part has mostly gone with the room.
      const a = fade('::before'), c = fade('::after');
      [a, c].forEach(x => { x.pause(); x.currentTime = 280; });
      assert.ok(parseFloat(outgoing().opacity) > 0.8, where + ': under it, ' + outgoing().opacity);
      assert.ok(parseFloat(bare().opacity) < 0.3, where + ': bare, ' + bare().opacity);
      h.destroy();
    });
  });

  // Each update is followed by a frame (its styles computed), as on screen; without one a stage's hold never starts.
  DT.test('theme hall: rapid stage changes hold the stage just left, not the one before it', () => {
    const h = R.mount(host());
    const frame = v => { h.update(v); held('--hall-was-r'); };
    let [s, at] = used(session('left'), OPENING, 0.4, T0);
    frame(E.view(s, at));
    [s, at] = used(s, CROSS, 0.25, at + 100);   // within the entrance of the one before
    frame(E.view(s, at));
    assert.equal(held('--hall-was-field'), PRO, 'the pro stage held while the con one enters');
    s = E.goto(s, idx(CON_OPENING), at + 100);
    frame(E.view(s, at + 100));
    assert.ok(root().classList.contains('is-entering'), 'the class was never removed');
    assert.equal(held('--hall-was-field'), CON, 'the con stage just left, not the pro one before it');
    assert.near(parseFloat(held('--hall-was-l')), 0.25, 0.001, 'with its own clip');
    assert.equal(parseFloat(held('--hall-was-r')), 0);
    h.destroy();
  });

  DT.test('theme hall: the held field is clipped as stage.css clips the field', () => {
    const norm = c => c.replace(/\b0%/g, '0px');
    ['left', 'right'].forEach(seat => [OPENING, CON_OPENING].forEach(name => {
      const h = R.mount(host());
      const [s, at] = used(session(seat), name, 0.4, T0);
      h.update(E.view(s, at));
      settle();
      const field = getComputedStyle(root().querySelector('.dt-field')).clipPath;
      assert.ok(/40%/.test(field), seat + ' / ' + name + ': ' + field);
      assert.equal(norm(outgoing().clipPath), norm(field), seat + ' / ' + name);
      h.destroy();
    }));
    // No field on screen: nothing to hold.
    const views = {
      'title card': s => E.view(s, T0),
      break: s => E.view(E.goto(s, idx('评委打分'), T0), T0),
      dual: s => E.view(E.floor(E.goto(s, idx('自由辩论'), T0), 'pro', T0), T0 + 5000),
      'end card': s => { const e = E.goto(s, 99, T0); return Object.assign(E.view(e, T0), { record: E.record(e, T0) }); },
    };
    Object.keys(views).forEach(where => {
      const h = R.mount(host());
      h.update(views[where](session('left')));
      settle();
      assert.equal(parseFloat(held('--hall-was-r')), 1, where + ': no field');
      h.destroy();
    });
  });

  DT.test('theme hall: stills and thumbnails show no held field', () => {
    const url = window.location.href;
    let h = null;
    try {
      history.replaceState(null, '', window.location.pathname + '?demo=single&frozen=1');
      h = R.mount(host());
      let [s, at] = used(session('left'), OPENING, 0.4, T0);
      h.update(E.view(s, at));
      const r = root();
      assert.ok(r.hasAttribute('data-still'));
      assert.equal(outgoing().display, 'none', 'frozen, mounted');
      assert.equal(getComputedStyle(r).transitionDuration, '0s');
      assert.equal(getComputedStyle(r).backgroundColor, resolve(r, '--side-deep'), 'frozen: the ground at once');
      s = E.goto(s, idx(CROSS), at + 1000);
      h.update(E.view(s, at + 1000));
      assert.ok(r.classList.contains('is-entering'), 'a frozen stage still enters, at its end');
      assert.equal(outgoing().display, 'none', 'frozen, a stage change');
      assert.equal(getComputedStyle(r).backgroundColor, resolve(r, '--side-deep'), 'frozen: the new ground at once');
      h.destroy(); h = null;
      history.replaceState(null, '', url);
      h = R.mount(host(), { thumbnail: true });
      h.update(E.view(E.goto(session('left'), idx(CON_OPENING), T0), T0));
      assert.ok(!root().classList.contains('is-entering'));
      assert.equal(outgoing().display, 'none', 'thumbnail');
      assert.equal(getComputedStyle(root()).backgroundColor, resolve(root(), '--side-deep'), 'thumbnail: the ground');
    } finally {
      history.replaceState(null, '', url);
      if (h) h.destroy();
    }
  });

  // themes.test.js checks contrast against --side-deep: once the entrance is over that is what is on screen.
  DT.test('theme hall: once entered, the ground and the bottom bar are the side\'s deep colour', () => {
    [OPENING, CON_OPENING, '评委打分'].forEach(name => {
      const h = R.mount(host());
      h.update(E.view(E.goto(session('left'), idx(name), T0), T0));
      settle();
      const r = root();
      assert.equal(getComputedStyle(r).backgroundColor, resolve(r, '--side-deep'), name);
      const probe = document.createElement('i');
      probe.style.backgroundImage = 'linear-gradient(to top, color-mix(in oklab, var(--side-deep) 55%, transparent), transparent)';
      r.appendChild(probe);
      assert.equal(getComputedStyle(r.querySelector('.dt-bottom'), '::before').backgroundImage,
        getComputedStyle(probe).backgroundImage, name + ': the bottom bar');
      probe.remove();
      h.destroy();
    });
  });
})();
