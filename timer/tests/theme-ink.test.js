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
  // The stroke's tip in page x: its painted length (--stroke-at, the first background-size) from the field's seat
  // edge. A half's size keeps its percentages in the computed style, so it is resolved in the field's own box.
  function tipX(field, seat) {
    // The first layer's width: the size list up to its first top-level comma, less the height after it.
    const size = getComputedStyle(field).backgroundSize;
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
    assert.ok(len > 0, 'stroke length ' + getComputedStyle(field).backgroundSize);
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
    const refs = getComputedStyle(a.root.querySelector('.dt-field')).filter.match(/#dt-ink-[\w-]+/g) || [];
    assert.ok(refs.length >= 1, 'the field uses a brush filter');
    refs.forEach(r => assert.ok(ids.indexOf(r.slice(1)) >= 0, r));
    a.stage.destroy(); b.destroy();
  });

  // Spec §2.1: a wide stroke of about 44vh across the screen, its edges bled and dry-brushed by the filter.
  DT.test('theme ink: the field is one wide brush stroke across the screen, clear of the head', () => {
    const { stage, root } = mountInk(singleAt(OPENING, 60));
    root.classList.remove('is-entering', 'is-m-enter');   // measure the stroke at rest, not as the brush lands
    const box = root.getBoundingClientRect();
    const field = root.querySelector('.dt-field');
    const f = field.getBoundingClientRect();
    assert.ok(f.left <= box.left && f.right >= box.right, 'it runs off both edges of the screen');
    assert.ok(f.height >= 0.42 * box.height && f.height <= 0.5 * box.height, 'about 44% of the height: ' + f.height);
    assert.ok(f.top > root.querySelector('.dt-head').getBoundingClientRect().bottom, 'below the stage name and speaker');
    assert.ok(/url\("?#dt-ink-brush/.test(getComputedStyle(field).filter), getComputedStyle(field).filter);
    assert.ok(['none', 'inset(0px)'].indexOf(getComputedStyle(field).clipPath) >= 0, 'the tip is the filtered stroke, not a straight cut: ' + getComputedStyle(field).clipPath);
    stage.destroy();
  });

  // The stroke is painted as a background as long as the time left, from the speaking side's seat.
  DT.test('theme ink: the stroke draws back toward the speaking side\'s seat', () => {
    [[OPENING, 'left', 'left'], [OPENING, 'right', 'right'], [REBUTTAL, 'left', 'right'], [REBUTTAL, 'right', 'left']].forEach(([name, seat, from]) => {
      const { stage, root } = mountInk(singleAt(name, 60, seat));
      const field = root.querySelector('.dt-field');
      const used = parseFloat(root.style.getPropertyValue('--used'));
      const cs = getComputedStyle(field);
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
      root.classList.remove('is-entering', 'is-m-enter');
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
      root.classList.remove('is-entering', 'is-m-enter');
      const S = root.getBoundingClientRect().width;
      root.querySelectorAll('.dt-half').forEach((h, i) => {
        const from = i === 0 ? 'left' : 'right';
        const tip = tipX(h.querySelector('.dt-half-field'), from);
        const body = from === 'left' ? tip - 0.07 * S : tip + 0.07 * S;
        assert.near(cutX(h.querySelector('.dt-digits-on'), from), body, 2, seat + ' ' + h.dataset.side);
      });
      stage.destroy();
    });
  });

  DT.test('theme ink: each layer of the digits has a thin halo, so a stray hair crossing it does not eat its edge', () => {
    [singleAt(OPENING, 60), dualAt(30)].forEach(view => {
      const { stage, root } = mountInk(view);
      root.querySelectorAll('.dt-digits').forEach(d => {
        const f = getComputedStyle(d).filter;
        assert.ok(/drop-shadow/.test(f), root.dataset.kind + ' ' + d.className + ': ' + f);
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
    const f = getComputedStyle(off).filter;
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
    const bigFilter = getComputedStyle(big.root.querySelector('.dt-field')).filter;
    big.stage.destroy();
    const small = mountInk(singleAt(OPENING, 60), 240, 135);
    const smallFilter = getComputedStyle(small.root.querySelector('.dt-field')).filter;
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

  // Spec §2.1: two strokes face each other, the speaking side's is the dense one; dimming the paper would grey it.
  DT.test('theme ink: in free debate the speaking side\'s stroke is dense and the other one pale', () => {
    const { stage, root } = mountInk(dualAt(30));
    const half = side => root.querySelector('.dt-half[data-side="' + side + '"]');
    const con = half('con'), pro = half('pro');
    assert.ok(con.hasAttribute('data-active'));
    assert.equal(getComputedStyle(pro).filter, 'none', 'the waiting half keeps its paper');
    const dense = resolve(con.querySelector('.dt-half-field'), '--ink-stroke');
    const pale = resolve(pro.querySelector('.dt-half-field'), '--ink-stroke');
    assert.equal(dense, resolve(con, '--con'), 'the speaking stroke is the full colour');
    assert.ok(lum(pale) > lum(resolve(pro, '--pro')) * 1.5, 'the waiting stroke is diluted: ' + pale);
    // The digits on each stroke stay readable.
    [[con, dense], [pro, pale]].forEach(([h, ground]) => {
      const digits = getComputedStyle(h.querySelector('.dt-digits-on')).color;
      assert.ok(contrast(digits, ground) >= 3, h.dataset.side + ' ' + digits + ' on ' + ground + ' ' + contrast(digits, ground).toFixed(2));
    });
    // Each stroke starts at its own seat, the outer edge of the screen.
    assert.equal(getComputedStyle(pro.querySelector('.dt-half-field')).backgroundPositionX.split(',')[0].trim(), '0%');
    assert.equal(getComputedStyle(con.querySelector('.dt-half-field')).backgroundPositionX.split(',')[0].trim(), '100%');
    stage.destroy();
  });

  DT.test('theme ink: seats swapped, the strokes still start from each side\'s own edge', () => {
    const { stage, root } = mountInk(dualAt(30, 'right'));
    const pos = side => getComputedStyle(root.querySelector('.dt-half[data-side="' + side + '"] .dt-half-field')).backgroundPositionX.split(',')[0].trim();
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
        root.classList.remove('is-entering', 'is-m-enter');
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

  // ---- motion (motion spec §2.1): 起—行—收 of the brush, 落—洇—干 of the ink ----

  const anim = (el, which) => getComputedStyle(el, which || null).animationName;
  const ink = (root, sel) => root.querySelector(sel);
  const titleView = () => E.view(E.createSession(F(), MATCH, T0, { theme: 'ink' }), T0);
  function breakAt(secs) {
    const s = E.toggle(session('评委打分'), T0);
    return E.view(E.tick(s, T0 + secs * 1000).session, T0 + secs * 1000);
  }
  // A length (a custom property, say) resolved in el's own box, as a probe's width: a negative one comes out 0.
  function lengthIn(el, expr) {
    const probe = document.createElement('i');
    probe.style.cssText = 'position:absolute;left:0;top:0;height:1px;width:' + expr;
    el.appendChild(probe);
    const w = probe.getBoundingClientRect().width;
    probe.remove();
    return w;
  }
  const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  // The stage at rest: no moment class, no entrance.
  const rest = root => Array.from(root.classList).filter(c => c.indexOf('is-m-') === 0 || c === 'is-entering')
    .forEach(c => root.classList.remove(c));
  // Every element the theme put in, by its dt-ink- class.
  const inked = root => Array.from(root.querySelectorAll('[class*="dt-ink-"]'));
  const nameOf = el => el.className.baseVal !== undefined ? el.className.baseVal : el.className;

  DT.test('theme ink: decorate puts the brush, the drop, the seals and the 圆相 into the stage, ids prefixed dt-ink-', () => {
    const { stage, root } = mountInk(dualAt(30));
    // A second stage on the same page.
    const other = R.mount(document.getElementById('sandbox').appendChild(document.createElement('div')));
    other.update(singleAt(OPENING, 60));
    const count = sel => root.querySelectorAll(sel).length;
    assert.equal(count('.dt-deco > .dt-ink-bleed'), 1, 'the bleed under the stroke');
    ['.dt-ink-press', '.dt-ink-fall', '.dt-ink-bloom', '.dt-ink-tip', '.dt-ink-dry'].forEach(s => assert.equal(count('.dt-deco-over > ' + s), 1, s));
    assert.equal(count('.dt-clock[data-clock="main"] > .dt-ink-seal-time'), 1, 'the 时 seal');
    assert.equal(count('.dt-half > .dt-ink-seal-stop'), 2, 'a 止 seal in each half');
    assert.equal(count('.dt-card > svg.dt-ink-enso'), 1, 'the title card\'s 圆相');
    assert.equal(count('.dt-clock[data-clock="main"] > svg.dt-ink-enso'), 1, 'the break\'s 圆相');
    assert.equal(ink(root, '.dt-ink-seal-time').textContent, '时');
    assert.equal(ink(root, '.dt-ink-seal-stop').textContent, '止');
    inked(root).forEach(el => assert.ok(el.closest('[aria-hidden="true"]'), nameOf(el) + ' is hidden from screen readers'));
    const ids = Array.from(document.querySelectorAll('#sandbox .dt-stage [id]')).map(n => n.id);
    assert.ok(ids.length >= 4, ids.join(','));
    ids.forEach(id => assert.ok(id.indexOf('dt-ink-') === 0, id));
    assert.equal(new Set(ids).size, ids.length, 'two stages on one page share no id: ' + ids.join(','));
    // Each 圆相's mask is in its own drawing.
    const masked = root.querySelectorAll('svg.dt-ink-enso [mask]');
    assert.equal(masked.length, 2);
    masked.forEach(g => {
      const id = g.getAttribute('mask').match(/#([\w-]+)/)[1];
      assert.ok(g.ownerSVGElement.querySelector('[id="' + id + '"]'), id);
    });
    stage.destroy(); other.destroy();
  });

  // Spec §2.1 enter: 起笔 at the seat, 行笔 with a 飞白 front, 收笔 bleeding into the paper; then the title seeps
  // from pale ink to dense and the small seal is pressed. Not the hall's sweep and rise.
  DT.test('theme ink: a new stage lands the brush from the seat, then seeps the title in and presses the seal', () => {
    const { stage, root } = mountInk(singleAt(OPENING, 60));   // its first view enters
    assert.ok(root.classList.contains('is-m-enter'));
    assert.equal(anim(root), 'dt-ink-land', 'the brush\'s reach, which the stroke and the digits follow');
    assert.equal(anim(ink(root, '.dt-ink-press')), 'dt-ink-press');
    assert.equal(anim(ink(root, '.dt-ink-bleed')), 'dt-ink-bleed');
    assert.equal(anim(ink(root, '.dt-title')), 'dt-ink-seep');
    assert.equal(anim(ink(root, '.dt-head'), '::before'), 'dt-ink-seal-press');
    const field = ink(root, '.dt-field'), cs = getComputedStyle(field);
    assert.equal(cs.animationName, 'dt-ink-head', 'the stroke\'s head comes down (not the hall\'s clip-path sweep)');
    assert.ok(/url\(/.test(cs.maskImage || cs.webkitMaskImage), 'the stroke is shown through its 飞白 front');
    ['.dt-clock[data-clock="main"]', '.dt-speaker'].forEach(s => assert.ok(!/dt-rise/.test(anim(ink(root, s))), s));
    // The brush moves fast, then slow (spec: cubic-bezier(.16,.84,.24,1), ≈520 ms after a ≈120 ms press).
    const st = getComputedStyle(root);
    assert.equal(st.animationTimingFunction, 'cubic-bezier(0.16, 0.84, 0.24, 1)');
    assert.equal(st.animationDuration, '0.52s');
    assert.equal(st.animationDelay, '0.12s');
    stage.destroy();
  });

  // While the brush lands, the digits are ink on the paper until the stroke's body is under them: they turn paper
  // coloured behind its front, so they read in every frame (motion spec §1.2).
  DT.test('theme ink: while the brush lands the digits turn paper-coloured only behind its front', () => {
    ['left', 'right'].forEach(seat => {
      const { stage, root } = mountInk(singleAt(OPENING, 60, seat), 1920, 1080);
      rest(root);
      const S = root.getBoundingClientRect(), on = ink(root, '.dt-clock[data-clock="main"] .dt-digits-on');
      const body = lengthIn(on, 'var(--cut)');
      const at = land => { root.style.setProperty('--ink-land', String(land)); return lengthIn(on, 'var(--ink-cut)'); };
      const box = on.getBoundingClientRect();
      // Before the brush: the paper-coloured layer is clipped away.
      if (seat === 'left') assert.equal(at(0), 0, seat + ': none before the brush');
      else assert.ok(at(0) >= box.width, seat + ': none before the brush: ' + at(0));
      // Half way: at the body's front, in the digits' own box.
      const C = S.width * 1.06, tail = S.width * 0.03;
      const reach = C * (1 - 1.08 * 0.5 - 0.025) - tail;   // less what the brush's ragged end trails by
      const x = seat === 'left' ? reach : S.width - reach;
      assert.near(at(0.5), x - (box.left - S.left), 2, seat + ': at its front');
      // Landed: where the body ends, as at rest.
      assert.near(at(1), body, 1, seat + ': landed');
      root.style.removeProperty('--ink-land');
      stage.destroy();
    });
  });

  DT.test('theme ink: in free debate the side taking the floor lands its brush again, the other lifts its own', () => {
    let s = E.floor(session('自由辩论'), 'pro', T0);
    const { stage, root } = mountInk(E.view(s, T0 + 10000));   // pro speaking
    rest(root);
    s = E.floor(s, 'con', T0 + 20000);
    stage.update(E.view(s, T0 + 20000));                         // con takes the floor
    assert.ok(root.classList.contains('is-m-switch'));
    const con = ink(root, '.dt-half[data-side="con"]'), pro = ink(root, '.dt-half[data-side="pro"]');
    assert.equal(anim(con), 'dt-ink-land', 'the taking side lands its brush');
    assert.equal(getComputedStyle(con).animationDuration, '0.42s');
    assert.equal(anim(pro), 'none');
    // The yielding side lifts its brush: its stroke pales and thins over ≈240 ms.
    const t = getComputedStyle(pro);
    const props = t.transitionProperty.split(',').map(x => x.trim()), durs = t.transitionDuration.split(',').map(x => x.trim());
    assert.ok(props.indexOf('--ink-stroke') >= 0, t.transitionProperty);
    assert.equal(durs[props.indexOf('--ink-stroke')], '0.24s');
    assert.equal(getComputedStyle(pro.querySelector('.dt-half-field')).transitionDuration.split(',')[0].trim(), '0.24s');
    // The taking side's digits, too, are ink until its stroke is under them.
    rest(root);
    const on = con.querySelector('.dt-digits-on');
    con.style.setProperty('--ink-land', '0');
    const none = lengthIn(on, 'var(--ink-cut)');
    con.style.setProperty('--ink-land', '1');
    const landed = lengthIn(on, 'var(--ink-cut)');
    assert.equal(none, 0, 'no paper-coloured digits before the brush (the cut is measured from its seat)');
    assert.near(landed, lengthIn(on, 'var(--cut)'), 1, 'landed');
    stage.destroy();
  });

  // Spec §2.1 warn: a drop of ink falls ≈8vh onto the bell point and spreads into a pale ring; no gold ring.
  DT.test('theme ink: at the warn bell a drop of ink falls onto the bell point and blooms', () => {
    const { stage, root } = mountInk(singleAt(OPENING, 120));
    rest(root);
    const dot = ink(root, '.dt-warnline').getBoundingClientRect();
    stage.pulse({ type: 'warn', clock: 'main' });
    const fall = ink(root, '.dt-ink-fall'), bloom = ink(root, '.dt-ink-bloom');
    assert.equal(anim(fall), 'dt-ink-fall');
    assert.equal(anim(bloom), 'dt-ink-bloom');
    assert.equal(getComputedStyle(fall).animationDuration, '0.3s');
    assert.equal(getComputedStyle(bloom).animationDuration, '0.7s');
    assert.ok(root.querySelectorAll('.dt-ring').length > 0);
    root.querySelectorAll('.dt-ring').forEach(r => assert.equal(getComputedStyle(r).display, 'none', 'no gold ring'));
    // Both centred on the bell point.
    rest(root);
    [fall, bloom].forEach(el => {
      const r = el.getBoundingClientRect();
      assert.near(r.left + r.width / 2, dot.left + dot.width / 2, 1.5, nameOf(el));
      assert.near(r.top + r.height / 2, dot.top + dot.height / 2, 1.5, nameOf(el));
      assert.equal(getComputedStyle(el).opacity, '0', nameOf(el) + ' is gone at rest');
    });
    stage.destroy();
  });

  DT.test('theme ink: each second of a countdown leaves a faint ring of ink behind the digits, which do not jump', () => {
    const { stage, root } = mountInk(singleAt(OPENING, 176));
    rest(root);
    stage.pulse({ type: 'count', clock: 'main', key: 'c4' });
    const clock = ink(root, '.dt-clock[data-clock="main"]');
    assert.equal(anim(clock, '::before'), 'dt-ink-halo');
    assert.equal(getComputedStyle(clock, '::before').animationDuration, '0.3s');
    assert.equal(getComputedStyle(clock, '::before').zIndex, '-1', 'behind the digits');
    assert.ok(clock.classList.contains('is-bump'));
    clock.querySelectorAll('.dt-digits').forEach(d => assert.equal(anim(d), 'none', 'no bump'));
    stage.destroy();
  });

  // Spec §2.1 end: the last of the stroke runs dry, then a 朱文 seal 时 is pressed at the digits' lower right.
  DT.test('theme ink: when the time runs out the brush runs dry and a 时 seal is pressed beside the digits', () => {
    const calm = mountInk(singleAt(OPENING, 60));
    assert.equal(getComputedStyle(ink(calm.root, '.dt-ink-seal-time')).display, 'none', 'no seal while time is left');
    calm.stage.destroy();
    [singleAt(OPENING, 181), singleAt(OPENING, 181, 'right'), breakAt(400)].forEach(view => {
      const { stage, root } = mountInk(view, 1920, 1080);
      rest(root);
      const where = root.dataset.kind + ' ' + root.dataset.phase + ' ' + root.dataset.proSeat;
      const seal = ink(root, '.dt-ink-seal-time');
      assert.ok(['over', 'done'].indexOf(root.dataset.phase) >= 0, where);
      assert.ok(getComputedStyle(seal).display !== 'none' && getComputedStyle(seal).opacity === '1', where + ': the seal stays');
      const s = seal.getBoundingClientRect(), d = ink(root, '.dt-clock[data-clock="main"] .dt-digits').getBoundingClientRect();
      assert.ok(s.width > 0 && !overlaps(s, d), where + ': clear of the digits');
      assert.ok(s.left >= d.right && s.top + s.height / 2 > d.top + d.height / 2, where + ': at their lower right');
      assert.ok(/dt-ink-seal/.test(getComputedStyle(seal).filter), where + ': a worn seal');
      stage.pulse({ type: 'end', clock: 'main' });
      assert.equal(anim(seal), 'dt-ink-seal-press', where);
      if (root.dataset.kind === 'single') assert.ok(/^dt-ink-dry/.test(anim(ink(root, '.dt-ink-dry'))), where + ': 枯笔');
      stage.destroy();
    });
  });

  // Spec §2.1 over: the seal paste at the 超时 seal's edge bleeds very slowly (a 2.4 s cycle, small).
  DT.test('theme ink: in overtime the 超时 seal\'s paste bleeds slowly at its edge', () => {
    const { stage, root } = mountInk(singleAt(OPENING, 187));
    rest(root);
    const bleed = getComputedStyle(ink(root, '.dt-deco-over'), '::before');
    assert.equal(bleed.content, '"超时"');
    assert.equal(bleed.animationName, 'dt-ink-ooze');
    assert.equal(bleed.animationDuration, '2.4s');
    assert.equal(bleed.animationIterationCount, 'infinite');
    const calm = mountInk(singleAt(OPENING, 60));
    assert.ok(['none', 'normal'].indexOf(getComputedStyle(ink(calm.root, '.dt-deco-over'), '::before').content) >= 0);
    calm.stage.destroy();
    // Pressed as it appears.
    const m = mountInk(singleAt(OPENING, 187));
    rest(m.root);
    m.stage.moment('over', { side: 'pro', clock: 'main' });
    assert.equal(anim(ink(m.root, '.dt-deco-over'), '::after'), 'dt-ink-seal-press');
    m.stage.destroy();
  });

  DT.test('theme ink: 暂停 seeps out in pale ink, and a resumed clock flicks the stroke\'s dry front', () => {
    let s = E.toggle(session(OPENING), T0);
    const { stage, root } = mountInk(E.view(s, T0 + 30000));
    rest(root);
    s = E.toggle(s, T0 + 30000);   // paused at 30 s
    stage.update(E.view(s, T0 + 31000));
    assert.ok(root.classList.contains('is-m-pause'));
    assert.equal(anim(ink(root, '.dt-clock[data-clock="main"] .dt-state')), 'dt-ink-seep');
    s = E.toggle(s, T0 + 32000);
    stage.update(E.view(s, T0 + 32000));
    assert.ok(root.classList.contains('is-m-start'));
    const tip = ink(root, '.dt-ink-tip');
    assert.equal(anim(tip), 'dt-ink-tip');
    // At the stroke's end: the dry front starts where the solid body stops.
    rest(root);
    const t = tip.getBoundingClientRect();
    assert.near(t.left, tipX(ink(root, '.dt-field'), 'left') - 0.07 * root.getBoundingClientRect().width, 2);
    stage.destroy();
  });

  // Spec §2.1 lock: the side out of time or yielding fades to pale grey ink and a small 止 seal is pressed.
  DT.test('theme ink: a side that locks fades to pale grey ink and is sealed 止', () => {
    let s = E.floor(session('自由辩论'), 'pro', T0);
    const { stage, root } = mountInk(E.view(s, T0 + 30000));
    rest(root);
    s = E.yieldTime(s, T0 + 30000);
    stage.update(E.view(s, T0 + 30000));
    assert.ok(root.classList.contains('is-m-lock'));
    assert.equal(root.dataset.mSide, 'pro');
    const pro = ink(root, '.dt-half[data-side="pro"]'), con = ink(root, '.dt-half[data-side="con"]');
    assert.equal(anim(pro.querySelector('.dt-ink-seal-stop')), 'dt-ink-seal-press');
    assert.equal(getComputedStyle(con.querySelector('.dt-ink-seal-stop')).display, 'none', 'only the locked side');
    const fading = getComputedStyle(pro).transitionProperty.split(',').map(x => x.trim());
    assert.ok(fading.indexOf('--ink-stroke') >= 0, 'the stroke greys over time');
    stage.destroy();
    // At rest, locked.
    const done = mountInk(E.view(s, T0 + 30000));
    rest(done.root);
    const half = side => ink(done.root, '.dt-half[data-side="' + side + '"]');
    const seal = half('pro').querySelector('.dt-ink-seal-stop');
    assert.ok(getComputedStyle(seal).display !== 'none' && getComputedStyle(seal).opacity === '1');
    assert.ok(!overlaps(seal.getBoundingClientRect(), half('pro').querySelector('.dt-state').getBoundingClientRect()), 'beside 已放弃');
    // The stroke stays, as long as the time it gave up, in pale grey ink.
    const field = half('pro').querySelector('.dt-half-field'), fcs = getComputedStyle(field);
    assert.ok(Number(fcs.opacity) > 0.3 && Number(fcs.opacity) < 1, 'paled: ' + fcs.opacity);
    const grey = srgb(resolve(field, '--ink-stroke')).match(/\d+/g).map(Number);
    assert.ok(Math.max.apply(null, grey) - Math.min.apply(null, grey) <= 12, 'grey: ' + grey);
    const box = half('pro').getBoundingClientRect();
    const gap = 0.024 * done.root.getBoundingClientRect().width;
    const c = E.view(s, T0 + 30000).clocks.find(x => x.id === 'pro');
    const left = (c.remaining + c.yielded) / c.total;   // all but the 30 s spoken
    assert.near(left, 1 - 30000 / c.total, 1e-9);
    assert.near(tipX(field, 'left') - box.left, left * (box.width - gap), 3, 'as long as what it gave up');
    done.stage.destroy();
  });

  // Spec §2.1 title: the 圆相 is drawn with stroke-dashoffset on the title card (≈1.4 s); in a break it pales away
  // as the break runs down.
  DT.test('theme ink: the title card draws its 圆相; a break\'s pales as the break runs down', () => {
    const { stage, root } = mountInk(titleView(), 1920, 1080);
    assert.equal(root.dataset.mode, 'title');
    assert.ok(root.classList.contains('is-m-title'));
    const enso = ink(root, '.dt-card > .dt-ink-enso');
    assert.ok(getComputedStyle(enso).display !== 'none');
    const reveal = enso.querySelector('.dt-ink-enso-reveal');
    assert.equal(anim(reveal), 'dt-ink-enso-draw');
    assert.equal(getComputedStyle(reveal).animationDuration, '1.4s');
    // Centred on the card, under its words.
    const e = enso.getBoundingClientRect(), c = ink(root, '.dt-card').getBoundingClientRect();
    assert.near(e.left + e.width / 2, c.left + c.width / 2, 2);
    assert.near(e.top + e.height / 2, c.top + c.height / 2, 2);
    assert.equal(getComputedStyle(enso).zIndex, '-1');
    assert.equal(getComputedStyle(ink(root, '.dt-clock[data-clock="main"] > .dt-ink-enso')).display, 'none');
    stage.destroy();
    const opacity = secs => {
      const m = mountInk(breakAt(secs), 1920, 1080);
      rest(m.root);
      const el = ink(m.root, '.dt-clock[data-clock="main"] > .dt-ink-enso');
      assert.ok(getComputedStyle(el).display !== 'none', 'break ' + secs);
      assert.equal(getComputedStyle(ink(m.root, '.dt-card > .dt-ink-enso')).display, 'none', 'one 圆相 in a break');
      const o = Number(getComputedStyle(el).opacity);
      m.stage.destroy();
      return o;
    };
    const early = opacity(5), late = opacity(150);
    assert.ok(early > 0 && late < early * 0.6, early + ' then ' + late);
  });

  // A still stage (a thumbnail, reduced motion) gets no moments: the theme's pieces stand at their end state.
  DT.test('theme ink: a thumbnail and reduced motion show the end state, with nothing moving', () => {
    const realMatch = window.matchMedia;
    const check = (mount, label) => {
      [singleAt(OPENING, 181), titleView(), dualAt(30)].forEach(view => {
        const { stage, root } = mount(view);
        const where = label + ' ' + root.dataset.mode + ' ' + root.dataset.kind;
        stage.pulse({ type: 'warn', clock: 'main' });
        stage.moment('lock', { side: 'pro' });
        assert.ok(!Array.from(root.classList).some(c => c.indexOf('is-m-') === 0), where + ': ' + root.className);
        assert.equal(anim(root), 'none', where);
        inked(root).concat([ink(root, '.dt-title'), ink(root, '.dt-field')]).forEach(el => {
          assert.equal(anim(el), 'none', where + ' ' + nameOf(el));
        });
        const reveal = ink(root, '.dt-card .dt-ink-enso-reveal');
        assert.equal(parseFloat(getComputedStyle(reveal).strokeDashoffset), 0, where + ': the 圆相 drawn');
        if (root.dataset.phase === 'over') assert.equal(getComputedStyle(ink(root, '.dt-ink-seal-time')).opacity, '1', where);
        stage.destroy();
      });
    };
    check(view => {
      const box = document.getElementById('sandbox');
      box.innerHTML = '<div class="dt-stage-host" style="width:480px;height:270px"></div>';
      const stage = R.mount(box.firstChild, { thumbnail: true });
      stage.update(view);
      return { stage, root: box.querySelector('.dt-stage') };
    }, 'thumbnail');
    window.matchMedia = q => ({ matches: /reduce/.test(q), media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    try { check(view => mountInk(view), 'reduced'); } finally { window.matchMedia = realMatch; }
  });

  DT.test('theme ink: moments in quick succession replay, they do not pile up elements', () => {
    const { stage, root } = mountInk(dualAt(30));
    const before = root.querySelectorAll('*').length;
    for (let i = 0; i < 30; i++) {
      ['enter', 'start', 'pause', 'warn', 'count', 'end', 'over', 'switch', 'lock', 'title']
        .forEach(m => stage.moment(m, { side: i % 2 ? 'pro' : 'con', clock: 'main' }));
    }
    assert.equal(root.querySelectorAll('*').length, before);
    stage.destroy();
  });

  DT.test('theme ink: leaving the theme takes every piece of it off the stage', () => {
    const { stage, root } = mountInk(singleAt(OPENING, 60));
    assert.ok(inked(root).length >= 8);
    assert.ok(root.style.getPropertyValue('--ink-front-l'));
    const s = E.goto(E.createSession(F(), MATCH, T0, { theme: 'hall' }), idx(OPENING), T0);
    stage.update(E.view(s, T0));
    assert.equal(root.dataset.theme, 'hall');
    assert.equal(inked(root).length, 0);
    ['--ink-front-l', '--ink-front-r', '--ink-hairs-l', '--ink-hairs-r'].forEach(v => assert.equal(root.style.getPropertyValue(v), '', v));
    stage.destroy();
  });
})();
