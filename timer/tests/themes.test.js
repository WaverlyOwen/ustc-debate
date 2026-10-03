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
  function viewAt(stageName, theme, seat) {
    const match = Object.assign({}, MATCH, { proSeat: seat || 'left' });
    let s = E.goto(E.createSession(F(), match, T0, { theme }), idx(stageName), T0);
    s = E.toggle(s, T0);
    return E.view(s, T0 + 60000);
  }
  function rgb(str) {
    const s = String(str).trim();
    let m = s.match(/^#([0-9a-f]{6})$/i);
    if (m) return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
    m = s.match(/^#([0-9a-f]{3})$/i);
    if (m) return m[1].split('').map(c => parseInt(c + c, 16));
    m = s.match(/rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/);
    if (m) return [m[1], m[2], m[3]].map(Number);
    // Anything else the browser computes (color-mix gives color(srgb …) or oklab): as a canvas paints it.
    const c = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    c.fillStyle = '#010203';
    c.fillStyle = s;
    if (c.fillStyle === '#010203' && s !== '#010203') throw new Error('cannot parse colour ' + s);
    c.fillRect(0, 0, 1, 1);
    const d = c.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]];
  }
  function lum(c) {
    const [r, g, b] = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function contrast(a, b) { const x = lum(rgb(a)), y = lum(rgb(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  // Resolve a custom property to a concrete colour by letting the browser compute it on a probe element.
  function resolve(root, varName) {
    const probe = document.createElement('i');
    probe.style.color = 'var(' + varName + ')';
    root.appendChild(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  }
  // What a (possibly translucent) text colour looks like on an opaque ground: a canvas composites the two.
  const mixer = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  function flat(fg, bg) {
    mixer.clearRect(0, 0, 1, 1);
    mixer.fillStyle = bg; mixer.fillRect(0, 0, 1, 1);
    mixer.fillStyle = fg; mixer.fillRect(0, 0, 1, 1);
    const d = mixer.getImageData(0, 0, 1, 1).data;
    return 'rgb(' + d[0] + ', ' + d[1] + ', ' + d[2] + ')';
  }
  // The opaque plate an element sits on inside the stage (chroma's head and bars), or null when it has none.
  function plateOf(el, root) {
    for (let n = el; n && n !== root; n = n.parentElement) {
      const bg = getComputedStyle(n).backgroundColor;
      if (/^rgb\(/.test(bg)) return bg;
    }
    return null;
  }
  const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const TEXT = [['title', '.dt-title'], ['speaker', '.dt-speaker'], ['top bar', '.dt-match']];
  const STAGES = ['正方一辩开篇立论', '反方一辩开篇立论'];
  // Every theme, both sides, both seatings: the calm single stage, one minute in.
  function eachStage(fn) {
    DT.THEMES.forEach(t => STAGES.forEach(stage => ['left', 'right'].forEach(seat => {
      const h = R.mount(host());
      h.update(viewAt(stage, t.id, seat));
      const root = document.querySelector('.dt-stage');
      assert.equal(root.dataset.theme, t.id);
      try { fn(root, t.id + ' / ' + stage + ' / ' + seat); } finally { h.destroy(); }
    })));
  }

  // 2026-10-03 final review: 重置 / 退出 waiting for the second click is the one state that must be read before the
  // next click, so its words keep 4.5:1 in the dock and the S drawer of every theme, and in the console.
  DT.test('themes: an armed 重置 or 退出 reads at 4.5:1 on every theme', () => {
    const box = document.getElementById('sandbox');
    const ARMED = '<span class="dt-arm"><span class="dt-arm-rest"><span>退出</span><kbd>Q Q</kbd></span>' +
      '<span class="dt-arm-ask">再点一次退出</span></span>';
    const check = (where, button, words) => {
      const fg = getComputedStyle(words).color;
      const bg = getComputedStyle(button).backgroundColor;
      assert.ok(/^rgb\(/.test(bg), where + ': an opaque fill, not a tint (' + bg + ')');
      const c = contrast(fg, bg);
      assert.ok(c >= 4.5, where + ': ' + c.toFixed(2) + ' (' + fg + ' on ' + bg + ')');
    };
    try {
      DT.THEMES.map(t => t.id).concat(['console']).forEach(id => {
        const theme = id === 'console' ? 'hall' : id;
        box.innerHTML = '<div class="dt-app dt-stage-host" style="width:1366px;height:768px" data-theme="' + theme + '">' +
          '<div class="dt-dock" data-shown><div class="dt-dock-group"><button type="button" data-armed="a">' + ARMED +
          '</button></div></div><div class="dt-overlay"><ol class="dt-stagelist"><li class="dt-stagelist-item">' +
          '<button class="dt-row" type="button"></button><button class="dt-row-reset" type="button" data-armed="a">' +
          '<span class="dt-row-reset-icon">↺</span><span class="dt-row-reset-label">再点一次重置</span></button></li></ol></div>' +
          '<div class="dt-console" data-theme="hall"><aside class="dt-console-controls"><div class="dt-control-group">' +
          '<button type="button" data-armed="a">' + ARMED + '</button></div></aside></div></div>';
        if (id === 'console') {
          const b = box.querySelector('.dt-console-controls button');
          check('console', b, b.querySelector('.dt-arm-ask'));
          return;
        }
        const dockButton = box.querySelector('.dt-dock button');
        check(id + ' / dock', dockButton, dockButton.querySelector('.dt-arm-ask'));
        const row = box.querySelector('.dt-row-reset');
        check(id + ' / stage list', row, row.querySelector('.dt-row-reset-label'));
      });
    } finally { box.innerHTML = ''; }
  });

  DT.test('themes: every theme in DT.THEMES has a name, a description and a tone', () => {
    assert.ok(DT.THEMES.length >= 3);
    DT.THEMES.forEach(t => {
      assert.ok(t.id && t.name && t.desc, JSON.stringify(t));
      assert.ok(t.tone === 'dark' || t.tone === 'light', t.id);
    });
  });

  // Spec §1.5: digits >= 3:1 on the field and on what shows where it is taken back; the stage name, the speaker
  // and the top bar >= 4.5:1 on both grounds they can sit on (--text-field and --text-deep, which default to
  // --side-color and --side-deep), or on their own plate. Translucent inks are composited before measuring.
  DT.test('themes: digits, titles, speaker and top bar keep their contrast on every theme and side', () => {
    const failures = [];
    const need = (ok, msg) => { if (!ok) failures.push(msg); };
    eachStage((root, where) => {
      const field = resolve(root, '--side-color'), deep = resolve(root, '--side-deep');
      const on = flat(resolve(root, '--digits-on-field'), field), off = flat(resolve(root, '--digits-off-field'), deep);
      need(contrast(on, field) >= 3, where + ': digits on field ' + contrast(on, field).toFixed(2));
      need(contrast(off, deep) >= 3, where + ': digits off field ' + contrast(off, deep).toFixed(2));
      const grounds = [resolve(root, '--text-field'), resolve(root, '--text-deep')];
      TEXT.forEach(([name, sel]) => {
        const el = root.querySelector(sel);
        need(el.textContent.trim(), where + ': ' + name + ' has no text');
        const ink = getComputedStyle(el).color;
        const plate = plateOf(el, root);
        (plate ? [plate] : grounds).forEach(g => {
          const c = contrast(flat(ink, g), g);
          need(c >= 4.5, where + ': ' + name + ' ' + ink + ' on ' + g + ' ' + c.toFixed(2));
        });
      });
    });
    assert.ok(!failures.length, failures.length + ' failures, across every theme:\n' + failures.join('\n'));
  });

  // The same rule beyond the calm single stage: overtime, and the free debate idle and running (the speaking half and
  // the waiting one). Measured on the digit layers as drawn (their computed colour, which overtime changes), each
  // against the grounds it can lie on: a layer clipped to the field on --field-ground (default --side-color: a theme
  // whose field is another colour, like ink's diluted waiting stroke, says so), a layer off it on --side-deep, and a
  // theme's single layer on both. A layer the field no longer reaches (overtime: nothing is left of it) is skipped.
  // Every failure in every theme is collected before the test fails, so one theme cannot hide another's.
  DT.test('themes: the digits keep 3:1 in overtime and in free debate, idle and running, on every theme', () => {
    const failures = [];
    const S = name => F().stages.find(x => x.name === name).secs;
    const states = [
      ['over', seat => { const m = Object.assign({}, MATCH, { proSeat: seat });
        const s = E.toggle(E.goto(E.createSession(F(), m, T0, { theme: '?' }), idx('反方四辩结辩'), T0), T0);
        return [s, T0 + (S('反方四辩结辩') + 9) * 1000]; }],
      ['dual idle', seat => [E.goto(E.createSession(F(), Object.assign({}, MATCH, { proSeat: seat }), T0, { theme: '?' }), idx('自由辩论'), T0), T0]],
      ['dual running', seat => { let s = E.goto(E.createSession(F(), Object.assign({}, MATCH, { proSeat: seat }), T0, { theme: '?' }), idx('自由辩论'), T0);
        s = E.floor(E.floor(s, 'pro', T0), 'con', T0 + 20000);
        return [s, T0 + 70000]; }],
    ];
    const ground = (el, v) => {
      const probe = document.createElement('i');
      probe.style.color = v;
      el.appendChild(probe);
      const c = getComputedStyle(probe).color;
      probe.remove();
      return c;
    };
    DT.THEMES.forEach(t => states.forEach(([state, make]) => ['left', 'right'].forEach(seat => {
      const [s0, at] = make(seat);
      const s = Object.assign({}, s0, { theme: t.id });
      const h = R.mount(host());
      h.update(E.view(s, at));
      const root = document.querySelector('.dt-stage');
      root.classList.remove('is-entering');
      try {
        const clocks = root.dataset.kind === 'dual'
          ? Array.from(root.querySelectorAll('.dt-half')).map(half => [half, half.querySelector('.dt-clock')])
          : [[root, root.querySelector('.dt-clock[data-clock="main"]')]];
        clocks.forEach(([scope, clock]) => {
          if (scope.hasAttribute && scope.hasAttribute('data-locked')) return;
          const where = t.id + ' / ' + state + ' / ' + seat + (scope === root ? '' : ' / ' + scope.dataset.side +
            (scope.hasAttribute('data-active') ? ' speaking' : ' waiting'));
          const field = ground(scope, 'var(--field-ground, var(--side-color))'), deep = ground(scope, 'var(--side-deep)');
          const onEl = clock.querySelector('.dt-digits-on'), offEl = clock.querySelector('.dt-digits:not(.dt-digits-on)');
          const two = getComputedStyle(onEl).display !== 'none';
          const reached = state !== 'over';
          const checks = two ? [[offEl, deep, 'off the field']].concat(reached ? [[onEl, field, 'on the field']] : [])
            : [[offEl, deep, 'off the field']].concat(reached ? [[offEl, field, 'on the field']] : []);
          checks.forEach(([layer, g, which]) => {
            const ink = flat(getComputedStyle(layer).color, g);
            const c = contrast(ink, g);
            if (c < 3) failures.push(where + ': digits ' + which + ' ' + ink + ' on ' + g + ' ' + c.toFixed(2));
          });
        });
      } finally { h.destroy(); }
    })));
    assert.ok(!failures.length, failures.length + ' failures:\n' + failures.join('\n'));
  });

  // The record on the end card is sized to what is left above the bottom bar, so its last row (often an overtime
  // one) is never drawn over the bar or, in chroma, off its plate onto the key green.
  DT.test('themes: the end card record fits above the bottom bar in every theme, at both projector sizes', () => {
    const failures = [];
    [[1920, 1080], [1366, 768]].forEach(([w, hgt]) => DT.THEMES.forEach(t => {
      const box = document.getElementById('sandbox');
      box.innerHTML = '<div class="dt-stage-host" style="width:' + w + 'px;height:' + hgt + 'px"></div>';
      const h = R.mount(box.firstChild);
      const s = DT.demo.build('end', T0, { theme: t.id }).session;
      h.update(Object.assign(E.view(s, T0), { record: E.record(s, T0) }));   // as ui.js adds it on the end card
      const root = box.querySelector('.dt-stage');
      root.classList.remove('is-entering');
      try {
        const where = t.id + ' ' + w + '×' + hgt;
        const rows = root.querySelectorAll('.dt-record tr');
        const last = rows[rows.length - 1].getBoundingClientRect();
        const bar = root.querySelector('.dt-bottom').getBoundingClientRect();
        if (last.bottom > bar.top) failures.push(where + ': the last row ends at ' + last.bottom + ', the bar starts at ' + bar.top);
        const card = root.querySelector('.dt-card');
        if (/^rgb\(/.test(getComputedStyle(card).backgroundColor)) {
          const c = card.getBoundingClientRect();
          if (last.bottom > c.bottom) failures.push(where + ': the last row runs off its plate: ' + last.bottom + ' > ' + c.bottom);
        }
        if (root.getBoundingClientRect().bottom < bar.bottom - 0.5) failures.push(where + ': the bar is pushed off the stage');
      } finally { h.destroy(); }
    }));
    assert.ok(!failures.length, failures.join('\n'));
  });

  // Spec §1.5: the warn bell point shows in every theme; near the seat (30 s of an hour) a theme's mark stays whole on
  // the stage rather than half off its edge.
  DT.test('themes: the warn bell mark stays whole on the stage when it falls near the seat', () => {
    const failures = [];
    const long = JSON.parse(JSON.stringify(F()));
    long.stages[0].secs = 3600;
    DT.THEMES.forEach(t => [['pro', 'left'], ['pro', 'right']].forEach(([, seat]) => {
      const m = Object.assign({}, MATCH, { proSeat: seat });
      const s = E.toggle(E.goto(E.createSession(long, m, T0, { theme: t.id }), 0, T0), T0);
      const h = R.mount(host());
      h.update(E.view(s, T0 + 73000));
      const root = document.querySelector('.dt-stage');
      root.style.setProperty('--warn-at', '0.002');   // nearer still: 30 s of a four-hour stage
      try {
        const line = root.querySelector('.dt-warnline');
        const cs = getComputedStyle(line);
        if (line.hidden || cs.display === 'none') return;
        const r = line.getBoundingClientRect(), b = root.getBoundingClientRect();
        if (r.left < b.left - 0.5 || r.right > b.right + 0.5) failures.push(t.id + ' / ' + seat + ': ' + r.left + '–' + r.right + ' of ' + b.left + '–' + b.right);
      } finally { h.destroy(); }
    }));
    assert.ok(!failures.length, failures.join('\n'));
  });

  // Chroma hides the hairline (it would stand on the key green); the warn point is a solid gold notch on the side's
  // plate instead, at the top and bottom edges, where the plate's edge will be when the bell rings.
  DT.test('themes: chroma marks the warn bell point with a gold notch on the plate', () => {
    ['left', 'right'].forEach(seat => ['正方一辩开篇立论', '反方一辩开篇立论'].forEach(stage => {
      const h = R.mount(host());
      h.update(viewAt(stage, 'chroma', seat));
      const root = document.querySelector('.dt-stage');
      const where = stage + ' / ' + seat;
      const plate = getComputedStyle(root.querySelector('.dt-clock[data-clock="main"]'), '::before');
      const gold = resolve(root, '--accent');
      const notches = plate.backgroundImage.split(/,\s*(?=linear-gradient)/).filter(g => /linear-gradient/.test(g));
      assert.equal(notches.length, 2, where + ': ' + plate.backgroundImage);
      notches.forEach(n => assert.ok(n.indexOf(gold) >= 0, where + ': solid gold ' + n));
      assert.equal(plate.backgroundColor, resolve(root, '--side-color'), where + ': on the side\'s plate');
      const warnAt = parseFloat(root.style.getPropertyValue('--warn-at'));
      const fromRight = (seat === 'left') !== (stage.charAt(0) === '正');
      const x = plate.backgroundPositionX.split(',')[0].trim();
      const want = (fromRight ? 1 - warnAt : warnAt) * 100;
      assert.near(parseFloat(x), want, 0.2, where + ': at the warn point: ' + x);
      h.destroy();
    }));
    // No warn bell, no notch; and none once the bell has rung.
    const h = R.mount(host());
    const v = viewAt('正方一辩开篇立论', 'chroma');
    h.update(Object.assign({}, v, { warnAt: null }));
    const root = document.querySelector('.dt-stage');
    assert.equal(getComputedStyle(root.querySelector('.dt-clock[data-clock="main"]'), '::before').backgroundImage, 'none');
    h.destroy();
  });

  // Two layers of digits meet at the field's edge; clipped exactly there, the pixel they share is part transparent in
  // both and a dark hairline runs through the digit. The on-field layer reaches a pixel past the edge.
  DT.test('themes: the two digit layers overlap by a pixel at the field edge, so no seam runs through a digit', () => {
    const visible = el => {
      const r = el.getBoundingClientRect();
      const m = /^inset\((.*)\)$/.exec(getComputedStyle(el).clipPath);
      assert.ok(m, 'an inset clip: ' + getComputedStyle(el).clipPath);
      const parts = [];
      let depth = 0, cur = '';
      for (const c of m[1].trim()) {
        if (c === '(') depth++;
        else if (c === ')') depth--;
        if (/\s/.test(c) && depth === 0) { if (cur) parts.push(cur); cur = ''; } else cur += c;
      }
      if (cur) parts.push(cur);
      const [top, right, bottom, left] = [parts[0], parts[1] || parts[0], parts[2] || parts[0], parts[3] || parts[1] || parts[0]];
      const len = (s, axis) => {
        const wasStatic = getComputedStyle(el).position === 'static';
        if (wasStatic) el.style.position = 'relative';   // so the probe's percentages are of this box
        const probe = document.createElement('i');
        probe.style.cssText = 'position:absolute;left:0;top:0;' + (axis === 'x' ? 'height:1px;width:' : 'width:1px;height:') + s;
        el.appendChild(probe);
        const b = probe.getBoundingClientRect();
        probe.remove();
        if (wasStatic) el.style.position = '';
        return axis === 'x' ? b.width : b.height;
      };
      // A negative inset (the -50% margins) comes out as a zero-size probe; they are never the edge that matters.
      return { left: r.left + len(left, 'x'), right: r.right - len(right, 'x'), top: r.top + len(top, 'y'), bottom: r.bottom - len(bottom, 'y') };
    };
    [['left', '正方一辩开篇立论', 'right'], ['left', '反方一辩开篇立论', 'left'], ['right', '正方一辩开篇立论', 'left']].forEach(([seat, stage, fieldEnd]) => {
      const h = R.mount(host());
      h.update(viewAt(stage, 'hall', seat));
      const root = document.querySelector('.dt-stage');
      const on = visible(root.querySelector('.dt-clock[data-clock="main"] .dt-digits-on'));
      const off = visible(root.querySelector('.dt-clock[data-clock="main"] .dt-digits:not(.dt-digits-on)'));
      const overlap = fieldEnd === 'right' ? on.right - off.left : off.right - on.left;
      assert.near(overlap, 1, 0.3, seat + ' / ' + stage + ': the layers overlap by ' + overlap);
      h.destroy();
    });
    const h = R.mount(host());
    let s = E.goto(E.createSession(F(), MATCH, T0, { theme: 'hall' }), idx('自由辩论'), T0);
    s = E.floor(s, 'pro', T0);
    h.update(E.view(s, T0 + 125000));   // about half of 4:00 left: the field's top edge runs through the digits
    const half = document.querySelector('.dt-half[data-side="pro"]');
    const on = visible(half.querySelector('.dt-digits-on')), off = visible(half.querySelector('.dt-digits:not(.dt-digits-on)'));
    assert.ok(on.top > half.querySelector('.dt-digits-on').getBoundingClientRect().top, 'the edge crosses the digits');
    assert.near(off.bottom - on.top, 1, 0.3, 'dual: the layers overlap by ' + (off.bottom - on.top));
    h.destroy();
  });

  // --text-field / --text-deep may leave their defaults only when that is true on screen, so the check above
  // cannot be passed by declaration alone.
  DT.test('themes: text grounds that leave the side colours match what is behind the text', () => {
    eachStage((root, where) => {
      const fieldBox = root.querySelector('.dt-field').getBoundingClientRect();
      const boxes = ['.dt-head', '.dt-top'].map(sel => root.querySelector(sel).getBoundingClientRect());
      if (resolve(root, '--text-field') !== resolve(root, '--side-color')) {
        assert.ok(boxes.every(b => !overlaps(b, fieldBox)), where + ': --text-field is not the field, yet the field reaches the text');
      }
      if (resolve(root, '--text-deep') !== resolve(root, '--side-deep')) {
        assert.equal(resolve(root, '--text-deep'), getComputedStyle(root).backgroundColor, where + ': --text-deep is not the stage ground');
      }
    });
  });

  // Spec §1.5: backdrop, canvas, deco (under the field), field / halves, overlay, warn line, text.
  DT.test('themes: the stage layers stack in the contract order', () => {
    DT.themes.register('zz-layers', { painter: () => ({ frame() {}, resize() {}, destroy() {} }) });
    const saved = DT.THEMES; DT.THEMES = (saved || []).concat([{ id: 'zz-layers', name: 'x', desc: 'x', tone: 'dark' }]);
    try {
      const h = R.mount(host());
      h.update(viewAt('正方一辩开篇立论', 'zz-layers'));
      const root = document.querySelector('.dt-stage');
      const el = sel => { const e = root.querySelector(sel); assert.ok(e, sel); return e; };
      const z = sel => Number(getComputedStyle(el(sel)).zIndex);
      const before = (a, b) => !!(el(a).compareDocumentPosition(el(b)) & Node.DOCUMENT_POSITION_FOLLOWING);
      const order = ['.dt-backdrop', '.dt-canvas', '.dt-deco', '.dt-field', '.dt-halves', '.dt-deco-over', '.dt-warnline', '.dt-head'];
      for (let i = 1; i < order.length; i++) {
        const a = order[i - 1], b = order[i];
        assert.ok(z(a) < z(b) || (z(a) === z(b) && before(a, b)), a + ' (' + z(a) + ') under ' + b + ' (' + z(b) + ')');
      }
      ['.dt-top', '.dt-clock', '.dt-card', '.dt-bottom'].forEach(sel => assert.equal(z(sel), z('.dt-head'), sel));
      h.destroy();
    } finally { DT.THEMES = saved; }
  });

  // A painter theme lets its canvas show through a dual stage by making the halves' own ground transparent.
  DT.test('themes: a dual half takes its ground from --half-ground', () => {
    const h = R.mount(host());
    const dual = F().stages.findIndex(x => x.type === 'dual');
    h.update(E.view(E.goto(E.createSession(F(), MATCH, T0, { theme: 'hall' }), dual, T0), T0));
    const half = document.querySelector('.dt-half');
    assert.equal(getComputedStyle(half).backgroundColor, resolve(half, '--side-deep'), "defaults to the side's deep colour");
    half.style.setProperty('--half-ground', 'transparent');
    assert.equal(getComputedStyle(half).backgroundColor, 'rgba(0, 0, 0, 0)');
    h.destroy();
  });

  DT.test('themes: register, get, ids and a deterministic rng', () => {
    DT.themes.register('zz-test', { defs: '<svg width="0" height="0"><defs><filter id="dt-zz-test-f"></filter></defs></svg>' });
    assert.ok(DT.themes.ids().indexOf('zz-test') >= 0);
    assert.ok(DT.themes.get('zz-test').defs);
    const a = DT.themes.rng('ink'), b = DT.themes.rng('ink'), c = DT.themes.rng('riso');
    const xs = [a(), a(), a()], ys = [b(), b(), b()];
    assert.deepEqual(xs, ys);
    assert.ok(xs.every(x => x >= 0 && x < 1));
    assert.ok(c() !== xs[0]);
  });

  DT.test('themes: defs are injected once per document', () => {
    DT.themes.register('zz-defs', { defs: '<svg width="0" height="0" data-probe="zz-defs"><defs><filter id="dt-zz-defs-f"></filter></defs></svg>' });
    const DTH = Array.isArray(DT.THEMES) ? DT.THEMES : [];
    const saved = DT.THEMES; DT.THEMES = DTH.concat([{ id: 'zz-defs', name: 'x', desc: 'x', tone: 'dark' }]);
    try {
      const h1 = R.mount(host()); h1.update(viewAt('正方一辩开篇立论', 'zz-defs'));
      const h2 = R.mount(document.getElementById('sandbox').appendChild(document.createElement('div')));
      h2.update(viewAt('正方一辩开篇立论', 'zz-defs'));
      assert.equal(document.querySelectorAll('[data-probe="zz-defs"]').length, 1);
      h1.destroy(); h2.destroy();
    } finally { DT.THEMES = saved; }
  });

  DT.test('themes: painter frames are throttled and skipped when hidden', () => {
    const calls = [];
    DT.themes.register('zz-paint', { painter: () => ({ frame: (v, now) => calls.push(now), resize() {}, destroy() { calls.push('destroyed'); } }) });
    const saved = DT.THEMES; DT.THEMES = (saved || []).concat([{ id: 'zz-paint', name: 'x', desc: 'x', tone: 'dark' }]);
    try {
      const h = R.mount(host());
      const v = viewAt('正方一辩开篇立论', 'zz-paint');
      let now = 5000; DT.clock.set(() => now);
      h.update(v);
      assert.ok(document.querySelector('.dt-canvas'));   // the renderer learns the theme from the first view
      now += 10; h.update(v); now += 10; h.update(v); now += 40; h.update(v);
      const frames = calls.filter(c => c !== 'destroyed');
      assert.equal(frames.length, 2, 'two frames 50 ms apart, the 10 ms ones skipped');
      h.update(Object.assign({}, v, { theme: 'hall' }));
      assert.equal(document.querySelector('.dt-canvas'), null);
      assert.ok(calls.indexOf('destroyed') >= 0);
      h.destroy();
    } finally { DT.THEMES = saved; DT.clock.reset(); }
  });

  // A painter is decoration. One that throws, when it is made, sized or asked for a frame, is stopped with one
  // warning; the rest of the frame (digits, bars, text) is still written, and the theme goes on as CSS alone.
  DT.test('themes: a painter that throws is stopped and the stage keeps updating', () => {
    const warn = console.warn, warnings = [];
    console.warn = function () { warnings.push(Array.from(arguments).join(' ')); };
    const saved = DT.THEMES;
    DT.THEMES = (saved || []).concat(['zz-bad-frame', 'zz-bad-make', 'zz-bad-size'].map(id => ({ id, name: 'x', desc: 'x', tone: 'dark' })));
    let frames = 0, destroyed = 0;
    DT.themes.register('zz-bad-frame', { painter: () => ({ frame() { frames++; throw new Error('frame'); }, resize() {}, destroy() { destroyed++; } }) });
    DT.themes.register('zz-bad-make', { painter: () => { throw new Error('make'); } });
    DT.themes.register('zz-bad-size', { painter: () => ({ frame() { frames++; }, resize() { throw new Error('size'); }, destroy() {} }) });
    let now = 5000; DT.clock.set(() => now);
    try {
      ['zz-bad-frame', 'zz-bad-make', 'zz-bad-size'].forEach(id => {
        warnings.length = 0; frames = 0;
        const h = R.mount(host());
        const root = document.querySelector('.dt-stage');
        h.update(viewAt('正方一辩开篇立论', id));
        assert.equal(root.querySelector('.dt-canvas'), null, id + ': the canvas goes');
        assert.ok(root.querySelector('.dt-next-name').textContent, id + ': the bottom bar was still written');
        now += 1000;
        h.update(Object.assign(viewAt('正方一辩开篇立论', id), { formatName: '之后的一帧' }));
        assert.equal(root.querySelector('.dt-format').textContent, '之后的一帧', id + ': later frames are written');
        assert.ok(frames <= 1, id + ': the painter is not asked again: ' + frames);
        assert.equal(warnings.length, 1, id + ': one warning: ' + warnings.join(' | '));
        h.destroy();
      });
      assert.equal(destroyed, 1, 'a painter that failed is still destroyed');
    } finally { console.warn = warn; DT.THEMES = saved; DT.clock.reset(); }
  });

  // A frame is never drawn while the page is hidden. A thumbnail updated once in a background tab would then keep a
  // bare backdrop; its frame is drawn when the page shows.
  DT.test('themes: a still frame skipped while the page is hidden is drawn when it shows', () => {
    let frames = 0;
    DT.themes.register('zz-hidden', { painter: () => ({ frame() { frames++; }, resize() {}, destroy() {} }) });
    const saved = DT.THEMES; DT.THEMES = (saved || []).concat([{ id: 'zz-hidden', name: 'x', desc: 'x', tone: 'dark' }]);
    let hidden = true;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    try {
      const h = R.mount(host(), { thumbnail: true });
      h.update(viewAt('正方一辩开篇立论', 'zz-hidden'));
      assert.equal(frames, 0, 'nothing drawn while hidden');
      hidden = false;
      document.dispatchEvent(new Event('visibilitychange'));
      assert.equal(frames, 1, 'drawn once it shows');
      document.dispatchEvent(new Event('visibilitychange'));
      assert.equal(frames, 1, 'and not again for nothing');
      h.destroy();
      hidden = true;
      const h2 = R.mount(host(), { thumbnail: true });
      h2.update(viewAt('正方一辩开篇立论', 'zz-hidden'));
      h2.destroy();
      hidden = false;
      document.dispatchEvent(new Event('visibilitychange'));
      assert.equal(frames, 1, 'a destroyed stage stops listening');
    } finally { delete document.hidden; DT.THEMES = saved; }
  });

  DT.test('themes: thumbnail mode draws once and never animates', () => {
    let frames = 0;
    DT.themes.register('zz-thumb', { painter: () => ({ frame() { frames++; }, resize() {}, destroy() {} }) });
    const saved = DT.THEMES; DT.THEMES = (saved || []).concat([{ id: 'zz-thumb', name: 'x', desc: 'x', tone: 'dark' }]);
    try {
      const h = R.mount(host(), { thumbnail: true });
      const v = viewAt('正方一辩开篇立论', 'zz-thumb');
      let now = 0; DT.clock.set(() => now);
      h.update(v); now += 100; h.update(v); now += 100; h.update(v);
      assert.equal(frames, 1);
      assert.ok(!document.querySelector('.dt-stage').classList.contains('is-entering'));
      h.pulse({ type: 'warn' });
      assert.equal(document.querySelectorAll('.dt-ring').length, 0);
      h.destroy();
    } finally { DT.THEMES = saved; DT.clock.reset(); }
  });
})();
