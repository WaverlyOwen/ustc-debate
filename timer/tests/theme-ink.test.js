(function () {
  const E = DT.engine, R = DT.render;
  const T0 = 1000000;
  const MATCH = { title: '测试', proMotion: '甲', conMotion: '乙', proTeam: '物理学院', conTeam: '化学院', proSeat: 'left' };
  const F = () => DT.BUILTIN_FORMATS.find(f => f.id === 'ustc-freshman-cup');
  const idx = name => F().stages.findIndex(s => s.name === name);
  const OPENING = '正方一辩开篇立论';   // pro, 3:00
  const REBUTTAL = '反方二辩驳论';

  function mountInk(view, w, h) {
    const box = document.getElementById('sandbox');
    box.innerHTML = '<div class="dt-stage-host" style="width:' + (w || 960) + 'px;height:' + (h || 540) + 'px"></div>';
    const stage = R.mount(box.firstChild);
    stage.update(view);
    return { stage, root: box.querySelector('.dt-stage') };
  }
  function session(name, seat) {
    return E.goto(E.createSession(F(), Object.assign({}, MATCH, { proSeat: seat || 'left' }), T0, { theme: 'ink' }), idx(name), T0);
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
  // Any CSS colour (color-mix gives oklab) as the sRGB a canvas paints for it.
  const mixer = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  function srgb(css) {
    mixer.clearRect(0, 0, 1, 1);
    mixer.fillStyle = css; mixer.fillRect(0, 0, 1, 1);
    const d = mixer.getImageData(0, 0, 1, 1).data;
    return 'rgb(' + d[0] + ', ' + d[1] + ', ' + d[2] + ')';
  }
  function lum(css) {
    const m = srgb(css).match(/rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/);
    const [r, g, b] = [m[1], m[2], m[3]].map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function contrast(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  const pseudo = (el, which) => getComputedStyle(el, which);
  const px = s => parseFloat(s);
  // The ink: the field (a half's field) carries the stroke, its ::before paints it under the brush filter.
  const ink = field => getComputedStyle(field, '::before');
  // A field's scale on screen: a half's field keeps one size and is scaled with its column (1 for a single stage).
  const scaleOf = field => field.getBoundingClientRect().width / field.offsetWidth;
  // The entrance over, and every transition run out.
  function settle(root) {
    root.classList.remove('is-entering');
    root.getAnimations({ subtree: true }).forEach(a => { if (a instanceof CSSTransition) a.finish(); });
  }
  // Every transition running in the stage seated at `ms` into its run (its delay counts).
  function seat(root, ms) {
    root.getAnimations({ subtree: true }).forEach(a => { if (a instanceof CSSTransition) { a.pause(); a.currentTime = ms; } });
  }
  const anim = (root, name) => root.getAnimations({ subtree: true }).filter(a => a.animationName === name);
  // Where the paper-coloured layer of the digits stops, in page x: --cut resolved in that layer's own box, the box
  // its clip-path's percentages refer to. `from` is the side of the box the cut is measured from.
  function cutX(on, from) {
    const probe = document.createElement('i');
    probe.style.cssText = 'position:absolute;left:0;top:0;height:1px;width:var(--cut)';
    on.appendChild(probe);
    const w = probe.getBoundingClientRect().width;
    probe.remove();
    const r = on.getBoundingClientRect();
    return from === 'left' ? r.left + w : r.right - w;
  }
  // The stroke's tip in page x: its painted length (--stroke-at, the ink's first background-size) from the field's seat
  // edge. It is measured by a probe inside the field, so a half's field, which is scaled, scales the probe with it.
  function tipX(field, seat) {
    // The first layer's width: the size list up to its first top-level comma, less the height after it.
    const size = ink(field).backgroundSize;
    let depth = 0, end = size.length;
    for (let i = 0; i < size.length; i++) {
      const c = size[i];
      if (c === '(') depth++;
      else if (c === ')') depth--;
      else if (c === ',' && depth === 0) { end = i; break; }
    }
    const probe = document.createElement('i');
    probe.style.cssText = 'position:absolute;left:0;top:0;height:1px;width:' + size.slice(0, end).trim().replace(/\s+\S+$/, '');
    field.appendChild(probe);
    const len = probe.getBoundingClientRect().width;
    probe.remove();
    assert.ok(len > 0, 'stroke length ' + ink(field).backgroundSize);
    const f = field.getBoundingClientRect();
    return seat === 'left' ? f.left + len : f.right - len;
  }

  DT.test('theme ink: 墨 is a light theme registered with SVG defs and no painter', () => {
    const meta = (DT.THEMES || []).find(t => t.id === 'ink');
    assert.ok(meta, 'ink is in DT.THEMES');
    assert.equal(meta.name, '墨');
    assert.equal(meta.tone, 'light');
    const spec = DT.themes.get('ink');
    assert.ok(spec, 'ink is registered');
    assert.ok(typeof spec.defs === 'string' && spec.defs.indexOf('<filter') >= 0, 'defs carry the brush filters');
    assert.equal(spec.painter, undefined);
  });

  DT.test('theme ink: the defs go into the document once, every id prefixed dt-ink-', () => {
    const a = mountInk(singleAt(OPENING, 60));
    const b = R.mount(document.getElementById('sandbox').appendChild(document.createElement('div')));
    b.update(singleAt(OPENING, 60));
    const boxes = document.querySelectorAll('[data-dt-defs="ink"]');
    assert.equal(boxes.length, 1);
    const ids = Array.from(boxes[0].querySelectorAll('[id]')).map(n => n.id);
    assert.ok(ids.length >= 3, ids.join(','));
    ids.forEach(id => assert.ok(id.indexOf('dt-ink-') === 0, id));
    // Every filter the stroke refers to is one of them.
    const refs = ink(a.root.querySelector('.dt-field')).filter.match(/#dt-ink-[\w-]+/g) || [];
    assert.ok(refs.length >= 1, 'the field uses a brush filter');
    refs.forEach(r => assert.ok(ids.indexOf(r.slice(1)) >= 0, r));
    a.stage.destroy(); b.destroy();
  });

  // The paper is one tile of feTurbulence, drawn once. render.js writes --used on every step of the clock, and Chromium
  // paints a box's image again on every recalculation when its url() reaches the rule through var() (stage.css draws
  // --backdrop so) or shares a list with a gradient: the tile is written out, alone, on the backdrop's ::before, and the
  // backdrop keeps only its light. The sheet laid over a stroke as it comes in (落笔) is the same paper.
  DT.test('theme ink: the paper is one tile written out over the backdrop\'s light, and the 落笔 sheet is the same paper', () => {
    let rules = 0;
    Array.from(document.styleSheets).forEach(sh => {
      let list;
      try { list = sh.cssRules; } catch (e) { return; }
      Array.from(list).forEach(function walk(r) {
        if (r.cssRules) Array.from(r.cssRules).forEach(walk);
        if (!r.style || !/data-theme="ink"\] \.dt-backdrop::before/.test(r.selectorText || '')) return;
        rules++;
        const v = r.style.getPropertyValue('background-image');
        assert.ok(/^url\("data:[^"]*"\)$/.test(v), r.selectorText + ': one image, written out: ' + v.slice(0, 40));
      });
    });
    assert.equal(rules, 1, 'the paper\'s rule');
    const { stage, root } = mountInk(singleAt(OPENING, 60));
    settle(root);
    const backdrop = root.querySelector('.dt-backdrop'), paper = pseudo(backdrop, '::before');
    const light = getComputedStyle(backdrop).backgroundImage;
    assert.ok(/radial-gradient/.test(light) && !/url\(/.test(light), 'the backdrop is the light: ' + light.slice(0, 40));
    assert.ok(/^url\("data:[^"]*"\)$/.test(paper.backgroundImage), 'one tile and nothing beside it: ' + paper.backgroundImage.slice(0, 40));
    assert.ok(/feTurbulence/.test(paper.backgroundImage), 'paper from noise');
    assert.equal(paper.position, 'absolute');
    ['top', 'right', 'bottom', 'left'].forEach(k => assert.equal(paper[k], '0px', 'over the whole backdrop: ' + k));
    // The sheet: the same tile at the same size, then the same light.
    const sheet = getComputedStyle(root, '::after');
    assert.equal(sheet.backgroundImage.indexOf(paper.backgroundImage), 0, 'the sheet is the same paper');
    assert.equal(sheet.backgroundSize.split(',')[0].trim(), paper.backgroundSize);
    assert.ok(sheet.backgroundImage.indexOf(light) > 0, 'over the same light');
    stage.destroy();
  });

  // Spec §2.1: a wide stroke of about 44vh across the screen, its edges bled and dry-brushed by the filter.
  DT.test('theme ink: the field is one wide brush stroke across the screen, clear of the head', () => {
    const { stage, root } = mountInk(singleAt(OPENING, 60));
    root.classList.remove('is-entering');   // measure the stroke at rest, not its entrance sweep
    const box = root.getBoundingClientRect();
    const field = root.querySelector('.dt-field');
    const f = field.getBoundingClientRect();
    assert.ok(f.left <= box.left && f.right >= box.right, 'it runs off both edges of the screen');
    assert.ok(f.height >= 0.42 * box.height && f.height <= 0.5 * box.height, 'about 44% of the height: ' + f.height);
    assert.ok(f.top > root.querySelector('.dt-head').getBoundingClientRect().bottom, 'below the stage name and speaker');
    assert.ok(/url\("?#dt-ink-brush/.test(ink(field).filter), ink(field).filter);
    // The filter is on the ink, not on the field: a field that is masked, scaled or faded keeps its drawn stroke.
    assert.equal(getComputedStyle(field).filter, 'none');
    assert.ok(['none', 'inset(0px)'].indexOf(getComputedStyle(field).clipPath) >= 0, 'the tip is the filtered stroke, not a straight cut: ' + getComputedStyle(field).clipPath);
    stage.destroy();
  });

  // The stroke is painted as a background as long as the time left, from the speaking side's seat.
  DT.test('theme ink: the stroke draws back toward the speaking side\'s seat', () => {
    [[OPENING, 'left', 'left'], [OPENING, 'right', 'right'], [REBUTTAL, 'left', 'right'], [REBUTTAL, 'right', 'left']].forEach(([name, seat, from]) => {
      const { stage, root } = mountInk(singleAt(name, 60, seat));
      const field = root.querySelector('.dt-field');
      const used = parseFloat(root.style.getPropertyValue('--used'));
      const cs = ink(field);
      const where = name + ' / ' + seat;
      assert.equal(cs.backgroundPositionX.split(',')[0].trim(), from === 'left' ? '0%' : '100%', where);
      // The stroke's end lands where the digits change colour: (1 - used) of the screen from the seat.
      const stroke = px(cs.backgroundSize.split(',')[0]);
      const fieldBox = field.getBoundingClientRect(), stageBox = root.getBoundingClientRect();
      const offscreen = from === 'left' ? stageBox.left - fieldBox.left : fieldBox.right - stageBox.right;
      assert.near(stroke - offscreen, (1 - used) * stageBox.width, 1.5, where);
      stage.destroy();
    });
  });

  // The last 7cqw of the stroke is loose hairs only (the dry tip), so the digits turn paper-coloured only over the
  // solid body: across the hairs they stay ink, and each layer carries a thin halo of the other ground's colour.
  DT.test('theme ink: the paper-coloured digits end where the solid body of the stroke ends, not at its dry tip', () => {
    [[OPENING, 'left', 'left'], [OPENING, 'right', 'right'], [REBUTTAL, 'left', 'right'], [REBUTTAL, 'right', 'left']].forEach(([name, seat, from]) => {
      const { stage, root } = mountInk(singleAt(name, 60, seat));
      root.classList.remove('is-entering');
      const S = root.getBoundingClientRect().width;
      const on = root.querySelector('.dt-clock[data-clock="main"] .dt-digits-on');
      const tip = tipX(root.querySelector('.dt-field'), from);
      const body = from === 'left' ? tip - 0.07 * S : tip + 0.07 * S;
      assert.near(cutX(on, 'left'), body, 2, name + ' / ' + seat);
      stage.destroy();
    });
  });

  DT.test('theme ink: in free debate too the digits change colour at the end of the stroke\'s body', () => {
    ['left', 'right'].forEach(seat => {
      const { stage, root } = mountInk(dualAt(30, seat));
      root.classList.remove('is-entering');
      const S = root.getBoundingClientRect().width;
      root.querySelectorAll('.dt-half').forEach((h, i) => {
        const from = i === 0 ? 'left' : 'right';
        const field = h.querySelector('.dt-half-field'), k = scaleOf(field);
        const tip = tipX(field, from);
        // The dry tip is 7cqw of the field, scaled with it.
        const body = from === 'left' ? tip - 0.07 * S * k : tip + 0.07 * S * k;
        assert.near(cutX(h.querySelector('.dt-digits-on'), from), body, 2, seat + ' ' + h.dataset.side);
      });
      stage.destroy();
    });
  });

  // The halo is on each glyph, not on the layer: the colon breathes on every frame of a running clock, and inside a
  // filtered layer that makes the compositor draw the whole layer's halo again on every frame.
  DT.test('theme ink: each glyph of the digits has a thin halo, so a stray hair crossing it does not eat its edge', () => {
    [singleAt(OPENING, 60), dualAt(30)].forEach(view => {
      const { stage, root } = mountInk(view);
      root.querySelectorAll('.dt-digits').forEach(d => {
        assert.equal(getComputedStyle(d).filter, 'none', root.dataset.kind + ' ' + d.className + ': the layer');
        d.querySelectorAll(':scope > span').forEach(g => {
          const f = getComputedStyle(g).filter;
          assert.ok(/drop-shadow/.test(f), root.dataset.kind + ' ' + d.className + ' ' + g.className + ': ' + f);
        });
      });
      stage.destroy();
    });
  });

  // Past the body's end the ink layer lies on the dry tip's loose cinnabar or indigo hairs (ink on cinnabar is about
  // 2.4:1). Its paper halo is built up (three drop-shadows, the widest .02em) so each stroke of the digit keeps a band
  // of paper round it there.
  DT.test('theme ink: over the dry tip the ink digits keep a band of paper round each stroke', () => {
    const { stage, root } = mountInk(singleAt(OPENING, 60), 1920, 1080);
    const off = root.querySelector('.dt-clock[data-clock="main"] .dt-digits:not(.dt-digits-on)');
    const f = getComputedStyle(off.querySelector('.dt-min')).filter;
    const shadows = f.match(/drop-shadow\([^()]*(\([^()]*\))?[^()]*\)/g) || [];
    const paper = srgb(resolve(root, '--paper-ink'));
    const fontPx = px(getComputedStyle(off).fontSize);
    assert.ok(shadows.length >= 3, 'a built-up halo: ' + f);
    shadows.forEach(sh => assert.ok(sh.indexOf(paper.replace('rgb', 'rgb')) >= 0 || sh.indexOf(resolve(root, '--paper-ink')) >= 0, 'paper-coloured: ' + sh));
    const widest = Math.max.apply(null, shadows.map(sh => { const m = sh.match(/([\d.]+)px\)?\s*$/) || sh.match(/0px 0px ([\d.]+)px/); return m ? Number(m[1]) : 0; }));
    assert.ok(widest >= 0.019 * fontPx, 'the widest reaches .02em: ' + widest + 'px of ' + fontPx + 'px');
    stage.destroy();
  });

  DT.test('theme ink: the brush filter follows the stage size, so a thumbnail keeps its proportions', () => {
    const big = mountInk(singleAt(OPENING, 60), 1920, 1080);
    const bigFilter = ink(big.root.querySelector('.dt-field')).filter;
    big.stage.destroy();
    const small = mountInk(singleAt(OPENING, 60), 240, 135);
    const smallFilter = ink(small.root.querySelector('.dt-field')).filter;
    small.stage.destroy();
    assert.ok(bigFilter !== smallFilter, bigFilter + ' vs ' + smallFilter);
    assert.ok(/#dt-ink-brush/.test(smallFilter), smallFilter);
  });

  // Spec §2.1: the stage type is marked with a small 朱文 seal, in the app's own words for the types. Its one column of
  // type sits in the middle of the box (equal padding either side; a vertical-rl column would otherwise hug the right
  // edge), large enough to read at 1366×768, where the seal also wears more lightly.
  DT.test('theme ink: the seal\'s two characters sit centred in the box, large enough to read', () => {
    [[1920, 1080, /dt-ink-seal"?\)/], [1366, 768, /dt-ink-seal-light/]].forEach(([w, h, filter]) => {
      const { stage, root } = mountInk(singleAt(OPENING, 60), w, h);
      const seal = pseudo(root.querySelector('.dt-head'), '::before');
      assert.equal(seal.paddingLeft, seal.paddingRight, w + ': even either side');
      assert.ok(px(seal.fontSize) >= 0.03 * h, w + ': ' + seal.fontSize);
      const inner = px(seal.width) - (seal.boxSizing === 'border-box'
        ? px(seal.paddingLeft) + px(seal.paddingRight) + px(seal.borderLeftWidth) + px(seal.borderRightWidth) : 0);
      assert.near(inner, px(seal.fontSize) * px(seal.lineHeight) / px(seal.fontSize), 1.5, w + ': the box is the column wide: ' + seal.width);
      assert.ok(filter.test(seal.filter), w + ': ' + seal.filter);
      stage.destroy();
    });
  });

  // Spec §2.1: the stage type is marked with a small 朱文 seal, in the app's own words for the types.
  DT.test('theme ink: a small seal names the stage type', () => {
    const cases = [[singleAt(OPENING, 60), '单方'], [dualAt(30), '双方'],
      [E.view(E.toggle(session('评委打分'), T0), T0 + 5000), '间隔']];
    cases.forEach(([view, word]) => {
      const { stage, root } = mountInk(view);
      const seal = pseudo(root.querySelector('.dt-head'), '::before');
      assert.equal(seal.content, '"' + word + '"', root.dataset.kind);
      assert.ok(seal.display !== 'none' && px(seal.width) > 0, root.dataset.kind + ' seal shows');
      stage.destroy();
    });
  });

  // Spec §2.1: the warn bell point is a drop of ink, not a line.
  DT.test('theme ink: the warn bell point is a drop of ink below the stroke', () => {
    const { stage, root } = mountInk(singleAt(OPENING, 60));
    const drop = root.querySelector('.dt-warnline');
    const cs = getComputedStyle(drop);
    assert.ok(!drop.hidden);
    assert.near(px(cs.width), px(cs.height), 1, 'round');
    assert.ok(px(cs.width) < 0.08 * root.getBoundingClientRect().height, 'a drop, not a bar: ' + cs.width);
    assert.equal(cs.backgroundColor, resolve(root, '--ink'));
    const d = drop.getBoundingClientRect(), f = root.querySelector('.dt-field').getBoundingClientRect();
    assert.ok(d.top >= f.bottom - 1, 'under the stroke, on the paper');
    // Its centre sits at the warn point, as the hairline did: 30 s of 3:00 from the seat.
    const box = root.getBoundingClientRect();
    assert.near((d.left + d.width / 2 - box.left) / box.width, 30 / 180, 0.01);
    stage.destroy();
  });

  // Spec §2.1: two strokes face each other, the speaking side's is the dense one; dimming the paper would grey it. The
  // waiting one is 淡墨: the same ink at .42 with the paper through it (the field's opacity, so the filtered stroke is
  // not drawn again), and its brush lifted (.7 high); --field-ground says what its digits lie on.
  DT.test('theme ink: in free debate the speaking side\'s stroke is dense and the other one pale', () => {
    const { stage, root } = mountInk(dualAt(30));
    const half = side => root.querySelector('.dt-half[data-side="' + side + '"]');
    const con = half('con'), pro = half('pro');
    assert.ok(con.hasAttribute('data-active'));
    assert.equal(getComputedStyle(pro).filter, 'none', 'the waiting half keeps its paper');
    const conField = con.querySelector('.dt-half-field'), proField = pro.querySelector('.dt-half-field');
    assert.equal(resolve(conField, '--ink-stroke'), resolve(con, '--con'), 'the speaking stroke is the full colour');
    assert.equal(resolve(proField, '--ink-stroke'), resolve(pro, '--pro'), 'the waiting one too, diluted by its opacity');
    assert.near(px(getComputedStyle(conField).opacity), 1, 0.001, 'speaking: dense');
    assert.near(px(getComputedStyle(proField).opacity), 0.42, 0.001, 'waiting: 淡墨');
    assert.equal(getComputedStyle(proField).scale, '1 0.7', 'waiting: the brush lifted');
    const dense = resolve(con, '--side-color'), pale = resolve(pro, '--field-ground');
    assert.ok(lum(pale) > lum(resolve(pro, '--pro')) * 1.5, 'the waiting stroke is diluted: ' + pale);
    // The digits on each stroke stay readable.
    [[con, dense], [pro, pale]].forEach(([h, ground]) => {
      const digits = getComputedStyle(h.querySelector('.dt-digits-on')).color;
      assert.ok(contrast(digits, ground) >= 3, h.dataset.side + ' ' + digits + ' on ' + ground + ' ' + contrast(digits, ground).toFixed(2));
    });
    // Each stroke starts at its own seat, the outer edge of the screen.
    assert.equal(ink(proField).backgroundPositionX.split(',')[0].trim(), '0%');
    assert.equal(ink(conField).backgroundPositionX.split(',')[0].trim(), '100%');
    stage.destroy();
  });

  DT.test('theme ink: seats swapped, the strokes still start from each side\'s own edge', () => {
    const { stage, root } = mountInk(dualAt(30, 'right'));
    const pos = side => ink(root.querySelector('.dt-half[data-side="' + side + '"] .dt-half-field')).backgroundPositionX.split(',')[0].trim();
    assert.equal(pos('pro'), '100%');
    assert.equal(pos('con'), '0%');
    stage.destroy();
  });

  // Overtime (main spec §5.3): the digits change colour, as in every theme: ink's ochre gold, not its black (a black
  // +0:07 reads as a calm clock from the back of a lit hall) and not the seal's red (正方's cinnabar while 反方 runs
  // over); and a large seal stamps 超时 beside them.
  DT.test('theme ink: overtime turns the digits ochre gold and stamps a 超时 seal', () => {
    const calm = mountInk(singleAt(OPENING, 60));
    const none = pseudo(calm.root.querySelector('.dt-deco-over'), '::after');
    assert.ok(none.content === 'none' || none.display === 'none', 'no stamp before time is up');
    calm.stage.destroy();
    const { stage, root } = mountInk(singleAt(OPENING, 187));
    assert.equal(root.dataset.phase, 'over');
    const digits = getComputedStyle(root.querySelector('.dt-clock[data-clock="main"] .dt-digits')).color;
    assert.equal(digits, resolve(root, '--accent'));
    assert.ok(digits !== resolve(root, '--ink'), 'not the calm ink');
    assert.ok(contrast(digits, resolve(root, '--ground')) >= 3, 'reads on the paper: ' + contrast(digits, resolve(root, '--ground')).toFixed(2));
    const stamp = pseudo(root.querySelector('.dt-deco-over'), '::after');
    assert.equal(stamp.content, '"超时"');
    assert.ok(stamp.display !== 'none');
    assert.ok(px(stamp.fontSize) >= 0.06 * root.getBoundingClientRect().height, 'a large stamp: ' + stamp.fontSize);
    const s = root.querySelector('.dt-deco-over').getBoundingClientRect();
    const d = root.querySelector('.dt-clock[data-clock="main"] .dt-digits').getBoundingClientRect();
    assert.ok(s.width > 0 && d.width > 0);
    stage.destroy();
  });

  // Spec §1.5: the speaking side shows in every state. When the time runs out the ink runs out at the seat: a short
  // dry stub of the side's colour stays at its edge, clear of the digits (the red seal alone would read as 正方's).
  DT.test('theme ink: in overtime a dry stub of the speaking side\'s ink stays at its seat', () => {
    [[OPENING, 'left', 'left', '--pro'], [OPENING, 'right', 'right', '--pro'], [REBUTTAL, 'left', 'right', '--con'], [REBUTTAL, 'right', 'left', '--con']].forEach(([name, seat, from, color]) => {
      [179, 187].forEach(secs => {
        const { stage, root } = mountInk(singleAt(name, secs, seat));
        root.classList.remove('is-entering');
        const where = name + ' / ' + seat + ' @' + secs;
        const field = root.querySelector('.dt-field');
        const box = root.getBoundingClientRect(), S = box.width;
        assert.equal(getComputedStyle(field).opacity, '1', where);
        assert.equal(resolve(field, '--ink-stroke'), resolve(root, color), where);
        const onScreen = from === 'left' ? tipX(field, from) - box.left : box.right - tipX(field, from);
        assert.ok(onScreen >= 0.05 * S && onScreen <= 0.1 * S, where + ': stub ' + onScreen);
        const d = root.querySelector('.dt-clock[data-clock="main"] .dt-digits').getBoundingClientRect();
        const clear = from === 'left' ? d.left - tipX(field, from) : tipX(field, from) - d.right;
        assert.ok(clear > 0.1 * S, where + ': clear of the digits by ' + clear);
        stage.destroy();
      });
    });
  });

  // 「暂停」 stands at .8 on the paper; emptied on resume it keeps its word (stage.css :empty::before) while it fades,
  // so it must still fade to 0 and not stay on screen.
  DT.test('theme ink: 暂停 fades out on resume, it does not stay on the paper', () => {
    let s = E.toggle(session(OPENING), T0);
    const { stage, root } = mountInk(E.view(s, T0 + 1000));
    root.classList.remove('is-entering');
    const state = root.querySelector('.dt-clock[data-clock="main"] .dt-state');
    s = E.toggle(s, T0 + 2000);
    stage.update(E.view(s, T0 + 2000));
    state.getAnimations().forEach(a => a.finish());
    assert.equal(getComputedStyle(state).opacity, '0.8', 'paused');
    s = E.toggle(s, T0 + 3000);
    stage.update(E.view(s, T0 + 3000));
    assert.equal(state.textContent, '');
    state.getAnimations().forEach(a => a.finish());
    assert.equal(getComputedStyle(state).opacity, '0', 'resumed, it fades out');
    stage.destroy();
  });

  // ---- motion ----

  // 落笔 (spec §2.1 从这一方的席位一侧落笔): the stroke stands whole from the first frame under a sheet of the same
  // paper (the stage's ::after, over the digits too), whose edge, a brush's head, is drawn back from the seat. Only the
  // sheet's mask moves; the stroke itself has no entrance of its own.
  DT.test('theme ink: a new stage\'s stroke is laid from its seat, under a sheet of its paper over the stroke\'s band', () => {
    [[OPENING, 'left', 'l'], [REBUTTAL, 'left', 'r'], [OPENING, 'right', 'r'], [REBUTTAL, 'right', 'l']].forEach(([name, seat, dir]) => {
      const { stage, root } = mountInk(singleAt(name, 0, seat));
      const where = name + ' / ' + seat;
      assert.ok(root.classList.contains('is-entering'), where);
      const sheet = getComputedStyle(root, '::after'), field = root.querySelector('.dt-field');
      assert.equal(sheet.display, 'block', where);
      assert.equal(sheet.zIndex, '6', where + ': over the digits');
      assert.ok(/data:image\/svg\+xml/.test(sheet.maskImage), where + ': the brush head ' + sheet.maskImage.slice(0, 40));
      assert.equal(sheet.animationName, 'dt-ink-lay-' + dir, where);
      assert.equal(getComputedStyle(field).animationName, 'none', where + ': the stroke stands whole');
      // The head covers the stroke's band, and no more.
      const box = root.getBoundingClientRect(), f = field.getBoundingClientRect();
      assert.near(px(sheet.maskSize.split(' ')[1]), f.height, 1, where + ': as high as the stroke');
      assert.near(px(sheet.maskPosition.split(' ').pop()), f.top - box.top, 1, where + ': at its height');
      root.classList.remove('is-entering');
      assert.equal(getComputedStyle(root, '::after').display, 'none', where + ': gone with the entrance');
      stage.destroy();
    });
  });

  // The brush lands behind the seat's edge and ends past the far edge, where its sheet hides nothing.
  DT.test('theme ink: the brush starts behind the seat and ends past the far edge', () => {
    const { stage, root } = mountInk(singleAt(OPENING, 0, 'left'));
    const W = root.getBoundingClientRect().width, u = root.querySelector('.dt-field').getBoundingClientRect().height / 48;
    const lay = anim(root, 'dt-ink-lay-l')[0];
    assert.ok(lay, 'the lay runs');
    assert.equal(lay.effect.getTiming().duration, 560, 'with the stage\'s other entrances');
    lay.pause();
    lay.currentTime = 0;
    const x0 = px(getComputedStyle(root, '::after').maskPosition.split(' ')[0]);
    assert.ok(x0 + 20 * u <= 0, 'its belly behind the seat at first: ' + (x0 + 20 * u));
    lay.currentTime = 560;
    const x1 = px(getComputedStyle(root, '::after').maskPosition.split(' ')[0]);
    assert.ok(x1 + 11 * u >= W, 'its last hair past the far edge at the end: ' + (x1 + 11 * u) + ' of ' + W);
    stage.destroy();
  });

  // In free debate each half has a sheet of its own over its stroke's band, laid from its own seat.
  DT.test('theme ink: in free debate each stroke is laid from its own seat, under its own sheet', () => {
    ['left', 'right'].forEach(seat => {
      const { stage, root } = mountInk(dualAt(30, seat));
      root.querySelectorAll('.dt-half').forEach((h, i) => {
        const where = seat + ' ' + h.dataset.side, sheet = getComputedStyle(h, '::after'), f = getComputedStyle(h.querySelector('.dt-half-field'));
        assert.equal(sheet.display, 'block', where);
        assert.equal(sheet.animationName, i === 0 ? 'dt-ink-lay-l' : 'dt-ink-lay-r', where);
        assert.near(px(sheet.top), px(f.top), 1, where + ': over the stroke');
        assert.near(px(sheet.height), px(f.height), 1, where);
        assert.ok(px(sheet.zIndex) > px(getComputedStyle(h.querySelector('.dt-clock')).zIndex), where + ': over the digits');
      });
      stage.destroy();
    });
  });

  // Stills: a frozen demo and a thumbnail show the stroke laid, the seal pressed and the circle drawn, with nothing over
  // them and no layer for the press.
  DT.test('theme ink: stills and thumbnails show the stroke laid, with no sheet, press or drawing', () => {
    const url = window.location.href;
    try {
      history.replaceState(null, '', window.location.pathname + '?demo=single&frozen=1');
      [singleAt(OPENING, 60), dualAt(30), singleAt(OPENING, 187), E.view(E.toggle(session('评委打分'), T0), T0 + 5000)].forEach(view => {
        const { stage, root } = mountInk(view);
        const where = root.dataset.kind + ' ' + root.dataset.phase;
        assert.ok(root.hasAttribute('data-still') && root.classList.contains('is-entering'), where);
        assert.equal(getComputedStyle(root, '::after').display, 'none', where + ': no sheet');
        root.querySelectorAll('.dt-half').forEach(h => assert.equal(getComputedStyle(h, '::after').display, 'none', where + ' half'));
        assert.equal(pseudo(root.querySelector('.dt-deco-over'), '::after').animationName, 'none', where + ': no press');
        assert.equal(pseudo(root.querySelector('.dt-clock[data-clock="main"]'), '::before').animationName, 'none', where + ': no drawing');
        stage.destroy();
      });
    } finally { history.replaceState(null, '', url); }
    const box = document.getElementById('sandbox');
    box.innerHTML = '<div class="dt-stage-host" style="width:240px;height:135px"></div>';
    const t = R.mount(box.firstChild, { thumbnail: true });
    t.update(singleAt(OPENING, 0));
    const root = box.querySelector('.dt-stage');
    assert.ok(!root.classList.contains('is-entering'));
    assert.equal(getComputedStyle(root, '::after').display, 'none', 'thumbnail');
    t.destroy();
  });

  // I3: a half's field keeps one size, the speaking column's (58cqw and its tail off screen), and is scaled with its
  // column on the divider's own spring, so a switch draws no filtered stroke again.
  DT.test('theme ink: the half strokes keep their size through a switch and are scaled with their columns', () => {
    let s = E.floor(session('自由辩论'), 'pro', T0);
    const { stage, root } = mountInk(E.view(s, T0 + 10000));
    settle(root);
    const S = root.getBoundingClientRect().width;
    const fields = () => Array.from(root.querySelectorAll('.dt-half')).map(h => [h, h.querySelector('.dt-half-field')]);
    const check = when => fields().forEach(([h, f]) => {
      assert.near(f.offsetWidth, 0.61 * S, 1.5, when + ' ' + h.dataset.side + ': one size');
      assert.near(scaleOf(f), h.getBoundingClientRect().width / (0.58 * S), 0.01, when + ' ' + h.dataset.side + ': scaled with its column');
    });
    check('before');
    const spring = getComputedStyle(root.querySelector('.dt-half'));
    assert.ok(/--ink-col/.test(spring.transitionProperty), spring.transitionProperty);
    s = E.floor(s, 'con', T0 + 20000);
    stage.update(E.view(s, T0 + 20000));
    [0, 130, 260, 400, 520].forEach(ms => { seat(root, ms); check('at ' + ms); });
    settle(root);
    check('after');
    stage.destroy();
  });

  // I2: 提笔再落笔 in sequence. The yielding brush lifts at once (0-260 ms), the taking one presses after it (220-520 ms);
  // the digits on each stroke, their halo and their colon change colour in one step where the stroke under them reads
  // alike for paper and ink digits: the lifting side's at 130 ms, the pressing side's at 260 ms.
  DT.test('theme ink: on a switch the yielding brush lifts first and the taking one presses after it, the digits stepping with them', () => {
    let s = E.floor(session('自由辩论'), 'pro', T0);
    const { stage, root } = mountInk(E.view(s, T0 + 10000));
    settle(root);
    const half = side => root.querySelector('.dt-half[data-side="' + side + '"]');
    const paper = resolve(root, '--paper-ink'), inkC = resolve(root, '--ink');
    s = E.floor(s, 'con', T0 + 20000);
    stage.update(E.view(s, T0 + 20000));
    const dim = side => px(getComputedStyle(half(side)).getPropertyValue('--dim'));
    const digits = side => { const on = half(side).querySelector('.dt-digits-on');
      const c = getComputedStyle(on).color;
      assert.equal(getComputedStyle(on.querySelector('.dt-colon')).color, c, side + ': the colon with its digits');
      return c; };
    const halo = side => getComputedStyle(half(side).querySelector('.dt-digits-on .dt-min')).filter;
    seat(root, 120);
    assert.ok(dim('pro') > 0.3 && dim('pro') < 0.6, 'pro lifting: ' + dim('pro'));
    assert.equal(dim('con'), 1, 'con waits for it');
    assert.equal(digits('pro'), paper, 'pro still paper digits on its dense stroke');
    seat(root, 140);
    assert.equal(digits('pro'), inkC, 'pro: ink digits as its stroke pales');
    assert.ok(halo('pro').indexOf(paper) >= 0 || /242, 243, 238/.test(halo('pro')), 'with a paper halo: ' + halo('pro'));
    seat(root, 250);
    assert.ok(dim('con') < 1 && dim('con') > 0.4, 'con pressing: ' + dim('con'));
    assert.equal(digits('con'), inkC, 'con still ink digits');
    seat(root, 270);
    assert.equal(digits('con'), paper, 'con: paper digits on its dense stroke');
    seat(root, 520);
    assert.near(dim('pro'), 1, 0.001); assert.near(dim('con'), 0, 0.001);
    stage.destroy();
  });

  // A yield (已放弃): the stroke fades where it lay in 300 ms, keeping its length; --remain, which sets its length, steps
  // to 0 only once it is gone (eased, it would draw the filtered stroke again on every frame).
  DT.test('theme ink: a yielded stroke fades where it lay, and its length goes only once it is gone', () => {
    let s = E.floor(session('自由辩论'), 'pro', T0);
    const { stage, root } = mountInk(E.view(s, T0 + 30000));
    settle(root);
    const pro = root.querySelector('.dt-half[data-side="pro"]'), field = pro.querySelector('.dt-half-field');
    const len = () => ink(field).backgroundSize.split(',')[0];
    const before = len();
    s = E.yieldTime(s, T0 + 30000);
    stage.update(E.view(s, T0 + 30000));
    assert.ok(pro.hasAttribute('data-locked'));
    seat(root, 150);
    const op = px(getComputedStyle(field).opacity);
    assert.ok(op > 0.05 && op < 0.95, 'fading: ' + op);
    assert.equal(len(), before, 'at its length');
    seat(root, 290);
    assert.equal(len(), before, 'still at its length');
    seat(root, 310);
    assert.equal(px(getComputedStyle(field).opacity), 0);
    assert.equal(px(getComputedStyle(pro).getPropertyValue('--remain')), 0, 'its time goes once it is gone');
    stage.destroy();
  });

  // I6: the bell is ink blooming in the paper behind the digits: a frayed tide line that spreads and fades, drawn once
  // under the drop's filter; the end bell's second bloom spreads further.
  DT.test('theme ink: a bell is a bloom of ink behind the digits, not a gold ring', () => {
    const { stage, root } = mountInk(singleAt(OPENING, 150));
    settle(root);
    stage.pulse({ type: 'warn', clock: 'main' });
    const ring = root.querySelector('.dt-clock[data-clock="main"] .dt-ring');
    assert.ok(ring, 'a ring');
    const cs = getComputedStyle(ring);
    assert.equal(cs.animationName, 'dt-ink-bloom');
    assert.equal(cs.animationDuration, '1.1s', 'the shared ring\'s length');
    assert.equal(cs.borderTopWidth, '0px', 'no ruled border');
    assert.ok(/#dt-ink-drop/.test(getComputedStyle(ring, '::before').filter), 'frayed by the paper\'s fibres');
    assert.equal(cs.zIndex, '-1', 'under the digits');
    const second = document.createElement('i');
    second.className = 'dt-ring'; second.dataset.nth = '2';
    ring.parentNode.appendChild(second);
    // Where each bloom stops: its last frame's scale (read before animationend removes the ring).
    const last = el => { el.getAnimations().forEach(a => a.finish()); return px(getComputedStyle(el).scale); };
    const a = last(ring), b = last(second);
    assert.ok(a > 1.2 && a < 1.65, 'the bloom spreads, short of the shared ring\'s reach: ' + a);
    assert.ok(b > a && b <= 1.65, 'the second spreads further: ' + b);
    stage.destroy();
  });

  // I5: the 超时 seal is pressed on the second bell (320 ms), once the gold digits are read. It fills backwards: a held
  // fill would keep the filtered seal on a layer of its own after the press.
  DT.test('theme ink: the 超时 seal is pressed on the second bell', () => {
    const { stage, root } = mountInk(singleAt(OPENING, 187));
    const seal = pseudo(root.querySelector('.dt-deco-over'), '::after');
    assert.equal(seal.animationName, 'dt-stamp');
    assert.equal(seal.animationDuration, '0.3s');
    assert.equal(seal.animationDelay, '0.32s');
    assert.equal(seal.animationFillMode, 'backwards');
    stage.destroy();
  });

  // I9: the break's 圆相 is drawn as the break comes in, once round from where it begins, while the clock rises; at rest
  // it is the circle as it always was.
  DT.test('theme ink: the break\'s 圆相 is drawn as the break comes in', () => {
    const { stage, root } = mountInk(E.view(E.toggle(session('评委打分'), T0), T0 + 5000));
    const circle = () => pseudo(root.querySelector('.dt-clock[data-clock="main"]'), '::before');
    assert.equal(circle().animationName, 'dt-ink-enso');
    assert.equal(circle().animationDelay, '0.14s');
    assert.equal((circle().maskImage.match(/conic-gradient/g) || []).length, 2, 'the drawing and the circle');
    root.classList.remove('is-entering');
    assert.equal(circle().animationName, 'none');
    assert.equal((circle().maskImage.match(/conic-gradient/g) || []).length, 1, 'the circle alone');
    stage.destroy();
  });

  // I10: the speaker's floor line is a dry brush line in their own ink, a fixed length, written out from their seat as
  // their brush presses and drawn back into it as it lifts; as a free debate comes in it is written after the stroke.
  DT.test('theme ink: the floor line is a brush line in the speaker\'s ink, written out from their seat', () => {
    ['left', 'right'].forEach(seat => {
      const { stage, root } = mountInk(dualAt(30, seat));
      root.querySelectorAll('.dt-half').forEach((h, i) => {
        const line = h.querySelector('.dt-floorline'), cs = getComputedStyle(line), where = seat + ' ' + h.dataset.side;
        assert.equal(cs.backgroundColor, resolve(h, '--side-color'), where + ': in its ink');
        assert.near(px(cs.transformOrigin.split(' ')[0]), i === 0 ? 0 : line.offsetWidth, 1, where + ': from its seat');
        assert.ok(cs.clipPath.indexOf('polygon') === 0, where + ': tapering');
        if (h.hasAttribute('data-active')) {
          assert.equal(cs.animationName, 'dt-ink-write', where + ': written as the stage comes in');
          assert.equal(cs.transitionDelay, '0.22s', where + ': pressed after the other lifts');
        } else {
          assert.equal(cs.transitionDuration, '0.26s', where + ': drawn back as it lifts');
        }
      });
      stage.destroy();
    });
  });
})();
