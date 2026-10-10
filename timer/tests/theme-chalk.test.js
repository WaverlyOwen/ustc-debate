(function () {
  const E = DT.engine, R = DT.render;
  const T0 = 1000000;
  const MATCH = { title: '测试', proMotion: '甲', conMotion: '乙', proTeam: '物理学院', conTeam: '化学院', proSeat: 'left' };
  const F = () => DT.BUILTIN_FORMATS.find(f => f.id === 'ustc-freshman-cup');
  const idx = name => F().stages.findIndex(s => s.name === name);
  const OPENING = '正方一辩开篇立论';   // pro, 3:00, warn bell at 0:30
  const REBUTTAL = '反方二辩驳论';      // con
  // [stage, seat, the edge the speaking side sits at]
  const SEATINGS = [[OPENING, 'left', 'left'], [OPENING, 'right', 'right'], [REBUTTAL, 'left', 'right'], [REBUTTAL, 'right', 'left']];

  function mountBoard(view, w, h) {
    const box = document.getElementById('sandbox');
    box.innerHTML = '<div class="dt-stage-host" style="width:' + (w || 960) + 'px;height:' + (h || 540) + 'px"></div>';
    const stage = R.mount(box.firstChild);
    stage.update(view);
    const root = box.querySelector('.dt-stage');
    root.classList.remove('is-entering');   // measure at rest, not during the entrance sweep
    return { stage, root };
  }
  function session(name, seat) {
    return E.goto(E.createSession(F(), Object.assign({}, MATCH, { proSeat: seat || 'left' }), T0, { theme: 'chalk' }), idx(name), T0);
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
  // A length resolved in the element's own box (an inset of a clip-path, say).
  function lengthIn(el, value) {
    const probe = document.createElement('i');
    probe.style.cssText = 'position:absolute;left:0;top:0;height:1px;width:' + value;
    el.appendChild(probe);
    const w = probe.getBoundingClientRect().width;
    probe.remove();
    return w;
  }
  // A comma-separated CSS list split at its top level (a background or mask list).
  function lists(v) {
    const out = [];
    let depth = 0, cur = '';
    for (const c of v) {
      if (c === '(') depth++;
      if (c === ')') depth--;
      if (c === ',' && !depth) { out.push(cur.trim()); cur = ''; } else cur += c;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }
  // The four values of an inset() clip, as written.
  function insetOf(clip) {
    const m = /^inset\((.*)\)$/.exec(clip);
    assert.ok(m, 'an inset clip: ' + clip);
    const parts = [];
    let depth = 0, cur = '';
    for (const c of m[1].trim()) {
      if (c === '(') depth++;
      else if (c === ')') depth--;
      if (/\s/.test(c) && depth === 0) { if (cur) parts.push(cur); cur = ''; } else cur += c;
    }
    if (cur) parts.push(cur);
    const top = parts[0], right = parts[1] || top, bottom = parts[2] || top, left = parts[3] || right;
    return [top, right, bottom, left];
  }
  // Any CSS colour (color-mix gives oklab or srgb) as the sRGB a canvas paints for it, with its alpha.
  const mixer = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  function rgba(css) {
    mixer.clearRect(0, 0, 1, 1);
    mixer.fillStyle = css; mixer.fillRect(0, 0, 1, 1);
    const d = mixer.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  }
  function lum(css) {
    const [r, g, b] = rgba(css).slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function contrast(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  const pseudo = (el, which) => getComputedStyle(el, which);
  const px = s => parseFloat(s);
  const shown = cs => cs.content !== 'none' && cs.display !== 'none';
  // The angle of a gradient's first layer, in degrees.
  function angleOf(image) {
    const m = /repeating-linear-gradient\(\s*(-?[\d.]+)deg/.exec(image);
    assert.ok(m, 'a repeating-linear-gradient with an angle: ' + image);
    return Number(m[1]);
  }
  // The part of an element its clip-path inset() leaves visible, in page x.
  function visibleX(el) {
    const r = el.getBoundingClientRect();
    const m = /^inset\((.*)\)$/.exec(getComputedStyle(el).clipPath);
    assert.ok(m, 'an inset clip: ' + getComputedStyle(el).clipPath);
    // Split at the top-level spaces only: a value may be a min() or calc() with spaces inside.
    const parts = [];
    let depth = 0, cur = '';
    for (const c of m[1].trim()) {
      if (c === '(') depth++;
      else if (c === ')') depth--;
      if (/\s/.test(c) && depth === 0) { if (cur) parts.push(cur); cur = ''; } else cur += c;
    }
    if (cur) parts.push(cur);
    // inset(top right bottom left), shortened the usual CSS way.
    const right = parts[1] || parts[0], left = parts[3] || right;
    // Each horizontal inset resolved in the element's own box, which its percentages refer to.
    const x = s => {
      const probe = document.createElement('i');
      probe.style.cssText = 'position:absolute;left:0;top:0;height:1px;width:' + s;
      el.appendChild(probe);
      const w = probe.getBoundingClientRect().width;
      probe.remove();
      return w;
    };
    return { left: r.left + x(left), right: r.right - x(right) };
  }

  DT.test('theme chalk: 黑板 is a dark theme registered with SVG defs and no painter', () => {
    const meta = (DT.THEMES || []).find(t => t.id === 'chalk');
    assert.ok(meta, 'chalk is in DT.THEMES');
    assert.equal(meta.name, '黑板');
    assert.equal(meta.tone, 'dark');
    const spec = DT.themes.get('chalk');
    assert.ok(spec, 'chalk is registered');
    assert.ok(typeof spec.defs === 'string' && spec.defs.indexOf('<filter') >= 0, 'defs carry the chalk filters');
    assert.equal(spec.painter, undefined);
  });

  DT.test('theme chalk: the defs go into the document once, every id prefixed dt-chalk-', () => {
    const a = mountBoard(singleAt(OPENING, 60));
    const b = R.mount(document.getElementById('sandbox').appendChild(document.createElement('div')));
    b.update(singleAt(OPENING, 60));
    const boxes = document.querySelectorAll('[data-dt-defs="chalk"]');
    assert.equal(boxes.length, 1);
    const ids = Array.from(boxes[0].querySelectorAll('[id]')).map(n => n.id);
    assert.ok(ids.length >= 3, ids.join(','));
    ids.forEach(id => assert.ok(id.indexOf('dt-chalk-') === 0, id));
    // Every filter the hatching, the digits and the stage name refer to is one of them.
    const used = [pseudo(a.root.querySelector('.dt-field'), '::before').filter,
      getComputedStyle(a.root.querySelector('.dt-clock[data-clock="main"] .dt-digits .dt-sec')).filter,
      getComputedStyle(a.root.querySelector('.dt-title')).filter];
    used.forEach(f => {
      const refs = f.match(/#dt-chalk-[\w-]+/g) || [];
      assert.ok(refs.length >= 1, 'a chalk filter: ' + f);
      refs.forEach(r => assert.ok(ids.indexOf(r.slice(1)) >= 0, r));
    });
    a.stage.destroy(); b.destroy();
  });

  // Spec §2.3: a green-black board, rubbed with chalk dust by feTurbulence under a radial light.
  DT.test('theme chalk: the ground is a green blackboard with the dust of old chalk rubbed into it', () => {
    const { stage, root } = mountBoard(singleAt(OPENING, 60));
    const [r, g, b] = rgba(getComputedStyle(root).backgroundColor);
    assert.ok(g > r && g > b, 'green: ' + [r, g, b]);
    const L = lum(getComputedStyle(root).backgroundColor);
    assert.ok(L > 0.015 && L < 0.06, 'dark, but a board and not black: ' + L);
    // The light is the backdrop's own; the dust is drawn over it by its pseudo-elements (stage.css reaches --backdrop
    // through var(), and an image reached that way is drawn again on every step of the clock).
    const backdrop = root.querySelector('.dt-backdrop');
    const back = getComputedStyle(backdrop).backgroundImage;
    const dust = pseudo(backdrop, '::before').backgroundImage + ' ' + pseudo(backdrop, '::after').backgroundImage;
    assert.ok(/feTurbulence/.test(dust), 'chalk dust from noise');
    assert.ok(/radial-gradient/.test(back), 'a board lit unevenly');
    stage.destroy();
  });

  // Spec §2.3: the field is diagonal chalk hatching made to shake and break by a displacement filter.
  DT.test('theme chalk: the field is diagonal chalk hatching between the stage name and the bottom bar', () => {
    const { stage, root } = mountBoard(singleAt(OPENING, 60));
    const field = root.querySelector('.dt-field');
    assert.equal(getComputedStyle(field).backgroundColor, 'rgba(0, 0, 0, 0)', 'no flat colour');
    const hatch = pseudo(field, '::before');
    const a = angleOf(hatch.backgroundImage);
    assert.ok(a % 90 !== 0, 'diagonal: ' + a);
    assert.ok(/url\("?#dt-chalk-stroke/.test(hatch.filter), 'the chalk filter shakes the lines: ' + hatch.filter);
    const f = field.getBoundingClientRect(), box = root.getBoundingClientRect();
    assert.ok(f.left <= box.left + 1 && f.right >= box.right - 1, 'across the board');
    assert.ok(f.top > root.querySelector('.dt-head').getBoundingClientRect().bottom, 'below the stage name and speaker');
    assert.ok(f.bottom < root.querySelector('.dt-bottom').getBoundingClientRect().top, 'above the bottom bar');
    const d = root.querySelector('.dt-clock[data-clock="main"] .dt-digits').getBoundingClientRect();
    assert.ok(d.top > f.top && d.bottom < f.bottom, 'the digits are written on it');
    stage.destroy();
  });

  // Spec §1.5: the two sides are told apart by more than the hue; their hatching runs the other way.
  DT.test('theme chalk: 正方 and 反方 hatch in opposite directions, in their own chalk', () => {
    const angle = name => {
      const { stage, root } = mountBoard(singleAt(name, 60));
      const a = angleOf(pseudo(root.querySelector('.dt-field'), '::before').backgroundImage);
      const c = resolve(root, '--side-color');
      stage.destroy();
      return [a, c];
    };
    const [pa, pc] = angle(OPENING), [ca, cc] = angle(REBUTTAL);
    assert.near(((pa + ca) % 180 + 180) % 180, 0, 0.01, 'mirrored: ' + pa + ' / ' + ca);
    assert.ok(pa % 180 !== ca % 180, 'not the same direction');
    const [pr, , pb] = rgba(pc), [cr, , cb] = rgba(cc);
    assert.ok(pr > pb, 'red chalk: ' + pc);
    assert.ok(cb > cr, 'blue chalk: ' + cc);
  });

  // Spec §2.3: taken back, the hatching is wiped off like a board eraser, toward the speaking side's seat.
  DT.test('theme chalk: the hatching is erased toward the speaking side\'s seat, eraser dust along its edge', () => {
    SEATINGS.forEach(([name, seat, from]) => {
      const { stage, root } = mountBoard(singleAt(name, 60, seat));
      const where = name + ' / ' + seat;
      const box = root.getBoundingClientRect(), W = box.width;
      const used = parseFloat(root.style.getPropertyValue('--used'));
      const vis = visibleX(root.querySelector('.dt-field'));
      const edge = from === 'left' ? vis.right : vis.left;
      if (from === 'left') assert.near(vis.left, box.left, 1, where + ': from the seat');
      else assert.near(vis.right, box.right, 1, where + ': from the seat');
      assert.near(Math.abs(edge - (from === 'left' ? box.left : box.right)), (1 - used) * W, 2, where + ': as long as the time left');
      const dust = pseudo(root.querySelector('.dt-deco-over'), '::before');
      assert.ok(shown(dust), where + ': eraser dust');
      assert.ok(/feTurbulence/.test(dust.maskImage || dust.webkitMaskImage), where + ': streaked by the eraser');
      const centre = box.left + px(dust.left) + px(dust.width) / 2;
      assert.near(centre, edge, 0.02 * W, where + ': at the edge');
      stage.destroy();
    });
  });

  // The board never comes quite clean: where the hatching was wiped, a haze of that side's chalk stays, so its
  // floor still shows when the time has run out (spec §1.5).
  DT.test('theme chalk: the wiped board keeps a faint dust of the speaking side\'s chalk, into overtime', () => {
    [[OPENING, 60, 'pro'], [REBUTTAL, 60, 'con'], [OPENING, 187, 'pro'], [REBUTTAL, 227, 'con']].forEach(([name, secs, side]) => {
      const { stage, root } = mountBoard(singleAt(name, secs, 'left'));
      const where = name + ' @' + secs;
      const haze = pseudo(root.querySelector('.dt-deco'), '::before');
      assert.ok(shown(haze), where);
      const [r, , b, a] = rgba(haze.backgroundColor);
      assert.ok(a > 0.08 && a < 0.4, where + ': faint: ' + a);
      assert.ok(side === 'pro' ? r > b : b > r, where + ': that side\'s chalk: ' + haze.backgroundColor);
      const h = root.querySelector('.dt-deco').getBoundingClientRect(), f = root.querySelector('.dt-field').getBoundingClientRect();
      assert.near(px(haze.top), f.top - h.top, 1, where + ': where the hatching was');
      stage.destroy();
    });
  });

  // The eraser misses the last stroke or two at the seat: a stub of the speaking side's hatching stays there as the
  // time runs out and through overtime, clear of the digits, so the room still sees whose floor it is (spec §1.5).
  // The eraser stops at the stub before the time is up, so nothing jumps back in when overtime begins.
  DT.test('theme chalk: in overtime a stub of the speaker\'s hatching stays at the seat, clear of the digits', () => {
    SEATINGS.forEach(([name, seat, from]) => {
      const probe = mountBoard(singleAt(name, 60, seat));
      const secs = 60 / parseFloat(probe.root.style.getPropertyValue('--used'));   // the stage's length
      probe.stage.destroy();
      [[secs * 0.985, 'running'], [secs + 7, 'over']].forEach(([t, phase]) => {
        const { stage, root } = mountBoard(singleAt(name, t, seat), 1920, 1080);
        const where = name + ' / ' + seat + ' / ' + phase;
        if (phase === 'over') assert.equal(root.dataset.phase, 'over', where);
        const box = root.getBoundingClientRect(), W = box.width;
        const field = root.querySelector('.dt-field');
        assert.ok(getComputedStyle(field).display !== 'none' && shown(pseudo(field, '::before')), where + ': the hatching');
        const vis = visibleX(field);
        const seatEdge = from === 'left' ? box.left : box.right;
        const inner = from === 'left' ? vis.right : vis.left;
        assert.near(from === 'left' ? vis.left : vis.right, seatEdge, 1, where + ': at the seat');
        assert.near(Math.abs(inner - seatEdge), 0.06 * W, 2, where + ': a stub of 6cqw');
        const d = root.querySelector('.dt-clock[data-clock="main"] .dt-digits').getBoundingClientRect();
        assert.ok(from === 'left' ? inner + 0.02 * W < d.left : inner - 0.02 * W > d.right,
          where + ': clear of the digits: ' + inner + ' vs ' + d.left + '–' + d.right);
        // The eraser's dust lies along the stub's edge, not off the screen.
        const dust = pseudo(root.querySelector('.dt-deco-over'), '::before');
        assert.near(box.left + px(dust.left) + px(dust.width) / 2, inner, 0.02 * W, where + ': eraser dust at the stub');
        stage.destroy();
      });
    });
  });

  DT.test('theme chalk: in overtime the haze of the speaker\'s chalk is heavier than while the time runs', () => {
    [[OPENING, 'pro'], [REBUTTAL, 'con']].forEach(([name, side]) => {
      const alpha = secs => {
        const { stage, root } = mountBoard(singleAt(name, secs, 'left'));
        const c = pseudo(root.querySelector('.dt-deco'), '::before').backgroundColor;
        const phase = root.dataset.phase;
        stage.destroy();
        return [rgba(c)[3], phase];
      };
      const [running] = alpha(60), [over, phase] = alpha(240);
      assert.equal(phase, 'over', name);
      assert.ok(over >= 0.25 && over > running * 1.8, name + ' / ' + side + ': ' + running + ' → ' + over);
    });
  });

  // Spec §2.3: chalk white, with a grainy chalk edge, the body solid. One colour on and off the hatching, so the
  // renderer's second, clipped layer is not needed.
  DT.test('theme chalk: the digits are chalk white in one layer, with a grain of chalk at their edges', () => {
    [singleAt(OPENING, 60), dualAt(30)].forEach(view => {
      const { stage, root } = mountBoard(view);
      root.querySelectorAll('.dt-digits-on').forEach(d => assert.equal(getComputedStyle(d).display, 'none', root.dataset.kind));
      root.querySelectorAll('.dt-clock:not([hidden])').forEach(c => {
        const d = c.querySelector('.dt-digits');
        if (getComputedStyle(c).display === 'none') return;
        const cs = getComputedStyle(d);
        assert.equal(cs.color, resolve(root, '--ink'), root.dataset.kind + ' ' + c.dataset.clock);
        assert.equal(cs.clipPath, 'none', root.dataset.kind + ' ' + c.dataset.clock + ' is not cut');
        d.querySelectorAll('.dt-min, .dt-colon, .dt-sec').forEach(part => {
          assert.ok(/#dt-chalk-grain/.test(getComputedStyle(part).filter), part.className + ': ' + getComputedStyle(part).filter);
        });
      });
      stage.destroy();
    });
  });

  // The chalk grain is a costly filter: it is drawn again only when the numbers change, not on every frame, so a
  // laptop without a GPU keeps its frame rate. The breathing colon may not redraw it; the tension changes only in
  // the renderer's steps of 0.02 (render.test.js).
  DT.test('theme chalk: the grain of the digits is not drawn again on every frame', () => {
    const { stage, root } = mountBoard(singleAt(OPENING, 60));
    const digits = root.querySelector('.dt-clock[data-clock="main"] .dt-digits');
    assert.equal(getComputedStyle(digits).filter, 'none', 'the filter sits on the parts, not round the breathing colon');
    const fvs = t => { root.style.setProperty('--tension', String(t)); return getComputedStyle(digits).fontVariationSettings; };
    assert.ok(fvs(0.3) !== fvs(0.36), 'the digits tense up');
    stage.destroy();
  });

  // Spec §2.3: 楷体, like a teacher's writing on the board.
  DT.test('theme chalk: the stage name, the speaker and the top bar are written in 楷体', () => {
    const { stage, root } = mountBoard(singleAt(OPENING, 60));
    ['.dt-title', '.dt-speaker', '.dt-top'].forEach(sel => {
      const first = getComputedStyle(root.querySelector(sel)).fontFamily.split(',')[0].replace(/["']/g, '').trim();
      assert.ok(/kai/i.test(first) || first === '楷体', sel + ': ' + first);
    });
    stage.destroy();
  });

  // Spec §2.3: the warn bell point is a chalk tick drawn on the field.
  DT.test('theme chalk: the warn bell point is a chalk tick on the hatching', () => {
    SEATINGS.forEach(([name, seat, from]) => {
      const { stage, root } = mountBoard(singleAt(name, 60, seat));
      const where = name + ' / ' + seat;
      const tick = root.querySelector('.dt-warnline');
      const cs = getComputedStyle(tick);
      assert.ok(!tick.hidden && cs.display !== 'none', where);
      assert.near(px(cs.width), px(cs.height), 1, where + ': a mark, not a line');
      const box = root.getBoundingClientRect();
      // A mark rather than a figure, but big and heavy enough to find from the back of the room through the chalk's
      // broken edge: about 11cqh across, strokes 17 units of 100, in a patch wiped clear of the hatching.
      assert.ok(px(cs.height) < 0.12 * box.height && px(cs.height) >= 0.1 * box.height, where + ': ' + cs.height);
      assert.ok(/svg/.test(cs.backgroundImage) && /path/.test(cs.backgroundImage), where + ': a drawn tick');
      const sw = /stroke-width='([\d.]+)'/.exec(cs.backgroundImage);
      assert.ok(sw && Number(sw[1]) >= 15, where + ': a heavy stroke: ' + (sw && sw[1]));
      const patch = pseudo(root.querySelector('.dt-deco-over'), '::after');
      assert.ok(shown(patch) && /radial-gradient/.test(patch.backgroundImage), where + ': on a wiped patch');
      const o = root.querySelector('.dt-deco-over').getBoundingClientRect(), tr = tick.getBoundingClientRect();
      assert.near(o.left + px(patch.left) + px(patch.width) / 2, tr.left + tr.width / 2, 1, where + ': the patch under the tick');
      assert.ok(/#dt-chalk-stroke/.test(cs.filter), where + ': in chalk');
      const t = tick.getBoundingClientRect(), f = root.querySelector('.dt-field').getBoundingClientRect();
      assert.ok(t.top >= f.top && t.bottom <= f.bottom, where + ': on the field');
      const x = (t.left + t.width / 2 - box.left) / box.width;
      const warnAt = parseFloat(root.style.getPropertyValue('--warn-at'));   // 30 s before the end
      assert.ok(warnAt > 0.1, where + ': ' + warnAt);
      assert.near(from === 'left' ? x : 1 - x, warnAt, 0.01, where + ': at the warn point');
      stage.destroy();
    });
  });

  DT.test('theme chalk: near the seat\'s edge the tick stays whole on the board', () => {
    SEATINGS.forEach(([name, seat]) => {
      const { stage, root } = mountBoard(singleAt(name, 60, seat));
      root.style.setProperty('--warn-at', '0.004');   // 30 s of an hour-long stage
      const t = root.querySelector('.dt-warnline').getBoundingClientRect(), box = root.getBoundingClientRect();
      assert.ok(t.width > 0.02 * box.height, name + ' / ' + seat + ': the tick, not a hairline: ' + t.width);
      assert.ok(t.left >= box.left && t.right <= box.right, name + ' / ' + seat + ': ' + t.left + '–' + t.right);
      stage.destroy();
    });
  });

  // Spec §2.3: a chalk line down the middle parts the board; the speaking side's hatching is denser.
  DT.test('theme chalk: in free debate a chalk line parts the board and the speaking side hatches denser', () => {
    ['left', 'right'].forEach(seat => {
      const { stage, root } = mountBoard(dualAt(30, seat));
      const half = side => root.querySelector('.dt-half[data-side="' + side + '"]');
      const con = half('con'), pro = half('pro');
      assert.ok(con.hasAttribute('data-active'), seat);
      const line = pseudo(root.querySelector('.dt-half:last-child'), '::after');
      assert.ok(shown(line), seat + ': the dividing line');
      assert.ok(px(line.width) < 0.02 * root.getBoundingClientRect().width, seat + ': a line: ' + line.width);
      assert.ok(/#dt-chalk-stroke/.test(line.filter), seat + ': in chalk');
      assert.equal(getComputedStyle(root.querySelector('.dt-half + .dt-half')).boxShadow, 'none', 'no hairline besides');
      // Denser: the speaker's half shows the strokes between its strokes (::after, half a pitch on); the waiting half
      // shows only its first set, in its lighter hand.
      const between = h => pseudo(h.querySelector('.dt-half-field'), '::after');
      assert.equal(between(con).opacity, '1', seat + ': the speaker hatches between its strokes');
      assert.equal(between(pro).opacity, '0', seat + ': the waiting side does not');
      assert.ok(/deg, rgba\(0, 0, 0, 0\) 0px/.test(between(con).backgroundImage), seat + ': half a stroke apart: ' + between(con).backgroundImage);
      assert.ok(Number(pseudo(pro.querySelector('.dt-half-field'), '::before').opacity) < 0.8, seat + ': a lighter hand');
      // The board shows through both halves; the waiting half is not greyed.
      [pro, con].forEach(h => assert.equal(getComputedStyle(h).backgroundColor, 'rgba(0, 0, 0, 0)', seat + ' ' + h.dataset.side));
      assert.equal(getComputedStyle(pro).filter, 'none', seat + ': the waiting half keeps its board');
      // Opposite hatching directions here too, and the digits read on both.
      const ap = angleOf(pseudo(pro.querySelector('.dt-half-field'), '::before').backgroundImage);
      const ac = angleOf(pseudo(con.querySelector('.dt-half-field'), '::before').backgroundImage);
      assert.near(((ap + ac) % 180 + 180) % 180, 0, 0.01, seat + ': mirrored');
      [pro, con].forEach(h => {
        const digits = getComputedStyle(h.querySelector('.dt-digits')).color, ground = resolve(h, '--side-color');
        assert.ok(contrast(digits, ground) >= 3, seat + ' ' + h.dataset.side + ' ' + contrast(digits, ground).toFixed(2));
      });
      stage.destroy();
    });
  });

  // Each half is wiped from the top down as its time goes; the lines left standing do not slide.
  DT.test('theme chalk: each half\'s hatching is wiped from the top, the lines that are left standing still', () => {
    const at = secs => {
      const { stage, root } = mountBoard(dualAt(secs));
      const h = root.querySelector('.dt-half[data-side="con"]');
      const field = h.querySelector('.dt-half-field');
      const f = field.getBoundingClientRect();
      const hatch = pseudo(field, '::before');
      assert.ok(shown(hatch) && px(hatch.height) > 0, 'the hatching at ' + secs + ' s');
      const out = { remain: parseFloat(h.style.getPropertyValue('--remain')), top: f.top, bottom: f.bottom,
        lines: px(hatch.height), linesBottom: f.bottom - (f.top + px(hatch.top) + px(hatch.height)) };
      stage.destroy();
      return out;
    };
    const a = at(30), b = at(60);
    assert.ok(b.remain < a.remain);
    assert.near(a.bottom, b.bottom, 1, 'the floor of the hatching stays');
    assert.ok(b.top > a.top + 5, 'wiped from the top');
    assert.near((a.bottom - a.top) / a.remain, (b.bottom - b.top) / b.remain, 2, 'as much as the time left');
    assert.near(a.lines, b.lines, 0.5, 'the lines keep their box');
    assert.near(a.linesBottom, 0, 1); assert.near(b.linesBottom, 0, 1);
  });

  // Overtime: the digits turn yellow chalk and a teacher's loop of yellow chalk rings them.
  DT.test('theme chalk: in overtime the digits are yellow chalk, circled on the board', () => {
    const calm = mountBoard(singleAt(OPENING, 60));
    const before = pseudo(calm.root.querySelector('.dt-deco-over'), '::after');
    assert.ok(!shown(before) || !/M820 58/.test(before.backgroundImage), 'no loop before time is up');
    calm.stage.destroy();
    const { stage, root } = mountBoard(singleAt(OPENING, 187));
    assert.equal(root.dataset.phase, 'over');
    const digits = root.querySelector('.dt-clock[data-clock="main"] .dt-digits');
    assert.equal(getComputedStyle(digits).color, resolve(root, '--accent'));
    const loop = pseudo(root.querySelector('.dt-deco-over'), '::after');
    assert.ok(shown(loop));
    assert.ok(/svg/.test(loop.backgroundImage) && /#dt-chalk-stroke/.test(loop.filter), 'a chalk drawing');
    assert.equal(loop.translate, 'none', 'placed by left and top: a layer at a fraction of a pixel loses its grain');
    const o = root.querySelector('.dt-deco-over').getBoundingClientRect(), d = digits.getBoundingClientRect();
    const l = { left: o.left + px(loop.left), top: o.top + px(loop.top) };
    l.right = l.left + px(loop.width); l.bottom = l.top + px(loop.height);
    assert.ok(l.left < d.left && l.right > d.right && l.top < d.top + 0.2 * d.height && l.bottom > d.bottom - 0.2 * d.height,
      'round the digits: ' + JSON.stringify(l) + ' ' + JSON.stringify(d));
    // stage.css hangs the + left of the digits: the loop rings it too, centred on the time with its sign.
    const sign = root.querySelector('.dt-clock[data-clock="main"] .dt-digits .dt-sign').getBoundingClientRect();
    assert.ok(sign.width > 0 && l.left < sign.left - 0.02 * px(loop.width), 'round the sign: ' + l.left + ' vs ' + sign.left);
    assert.near(sign.left - l.left, l.right - d.right, 0.04 * px(loop.width), 'centred on the time with its sign');
    stage.destroy();
  });

  DT.test('theme chalk: the chalk filters follow the stage size, so a thumbnail keeps its strokes', () => {
    const filt = (w, h) => {
      const { stage, root } = mountBoard(singleAt(OPENING, 60), w, h);
      const f = pseudo(root.querySelector('.dt-field'), '::before').filter;
      stage.destroy();
      return f;
    };
    const big = filt(1920, 1080), small = filt(240, 135);
    assert.ok(big !== small, big + ' vs ' + small);
    assert.ok(/#dt-chalk-stroke/.test(small), small);
    // A thumbnail's board has the dust but not the fine speck, which at that size would only be snow.
    const speck = (w, h) => {
      const { stage, root } = mountBoard(singleAt(OPENING, 60), w, h);
      const b = root.querySelector('.dt-backdrop');
      const out = [shown(pseudo(b, '::before')), shown(pseudo(b, '::after'))];
      stage.destroy();
      return out;
    };
    assert.deepEqual(speck(1920, 1080), [true, true], 'the projector: dust and speck');
    assert.deepEqual(speck(240, 135), [true, false], 'a thumbnail: dust only');
  });

  // The title card: each motion is marked by a patch of its side's hatching, and the side labels over the team
  // names are in the two chalks, not a mix toward white.
  DT.test('theme chalk: on the title card the motions and teams carry their side\'s chalk', () => {
    const { stage, root } = mountBoard(E.view(E.createSession(F(), MATCH, T0, { theme: 'chalk' }), T0));
    assert.equal(root.dataset.mode, 'title');
    ['pro', 'con'].forEach(side => {
      const mark = pseudo(root.querySelector('.dt-motion[data-side="' + side + '"]'), '::before');
      assert.ok(/repeating-linear-gradient/.test(mark.backgroundImage), side + ': ' + mark.backgroundImage);
      const label = pseudo(root.querySelector('.dt-teams span[data-side="' + side + '"]'), '::before');
      assert.equal(label.color, resolve(root, '--' + side), side);
      assert.ok(contrast(label.color, getComputedStyle(root).backgroundColor) >= 4.5, side + ' label reads');
    });
    stage.destroy();
  });
  // ---- motion (design/chalk-final.md) ----

  // A stage mounted and left in its entrance (is-entering), for the entrance's rules.
  function mountEntering(view, w, h) {
    const box = document.getElementById('sandbox');
    box.innerHTML = '<div class="dt-stage-host" style="width:' + (w || 960) + 'px;height:' + (h || 540) + 'px"></div>';
    const stage = R.mount(box.firstChild);
    stage.update(view);
    return { stage, root: box.querySelector('.dt-stage') };
  }
  // Every element of the stage with its two pseudo-elements: [element, pseudo, computed style, label].
  function everyBox(root) {
    const out = [];
    root.querySelectorAll('*').forEach(el => [null, '::before', '::after'].forEach(p => {
      out.push([el, p, getComputedStyle(el, p), (typeof el.className === 'string' ? el.className : el.tagName) + (p || '')]);
    }));
    return out;
  }

  // CH7: render.js writes --used (or --remain) on every step of the clock. Chromium takes an image as new, and paints
  // its box again with any filter on it, on every style recalculation when the url() reaches the declaration through
  // var(), and on a pseudo-element when one background or mask list holds a url() image and a gradient together.
  DT.test('theme chalk: no image reaches a rule through a variable or shares a list with a gradient', () => {
    let seen = 0;
    Array.from(document.styleSheets).forEach(sh => {
      let rules;
      try { rules = sh.cssRules; } catch (e) { return; }
      Array.from(rules).forEach(function walk(r) {
        if (r.cssRules) Array.from(r.cssRules).forEach(walk);
        if (!r.style || !/data-theme="chalk"/.test(r.selectorText || '')) return;
        seen++;
        for (let i = 0; i < r.style.length; i++) {
          const name = r.style[i], v = r.style.getPropertyValue(name);
          if (!/url\(\s*["']?data:/.test(v)) continue;
          assert.ok(name.indexOf('--') !== 0, r.selectorText + ': ' + name + ' holds an image');
          assert.ok(!/var\(/.test(v), r.selectorText + ' ' + name + ': an image beside a var()');
        }
      });
    });
    assert.ok(seen > 20, 'read the theme\'s rules: ' + seen);
    [singleAt(OPENING, 60), singleAt(OPENING, 187), dualAt(30)].forEach(view => {
      const { stage, root } = mountBoard(view);
      everyBox(root).forEach(([, , cs, where]) => ['backgroundImage', 'maskImage', 'webkitMaskImage'].forEach(prop => {
        const items = lists(cs[prop] || 'none').filter(x => x !== 'none');
        const urls = items.filter(x => /^url\(/.test(x)).length;
        assert.ok(urls === 0 || urls === items.length, where + ' ' + prop + ': ' + items.map(x => x.slice(0, 28)).join(' | '));
      }));
      stage.destroy();
    });
  });

  // CH7: what a chalk filter draws is drawn once. A layer that carries its own filter and is marked for transforms has
  // the compositor run the filter again on every frame; one of its own at a fraction of a pixel is resampled, which
  // washes the grain out. So: never will-change: transform on a filtered box, and a filtered box with a layer of its
  // own (will-change: opacity) has no translate. The hatching is such a layer, and the field that clips it has none.
  DT.test('theme chalk: what a chalk filter draws is a layer drawn once, never moved by a transform of its own', () => {
    [singleAt(OPENING, 60), singleAt(OPENING, 187), dualAt(30)].forEach(view => {
      const { stage, root } = mountBoard(view);
      everyBox(root).forEach(([, , cs, where]) => {
        if (!/#dt-chalk-/.test(cs.filter)) return;
        assert.ok(!/transform|translate|scale|rotate/.test(cs.willChange), where + ': will-change ' + cs.willChange);
        if (/opacity/.test(cs.willChange)) assert.equal(cs.translate, 'none', where + ': on whole pixels');
      });
      const field = root.querySelector(root.dataset.kind === 'dual' ? '.dt-half-field' : '.dt-field');
      assert.ok(/opacity/.test(pseudo(field, '::before').willChange), 'the hatching is a layer of its own');
      assert.equal(getComputedStyle(field).filter, 'none', 'the clipped box carries no filter');
      assert.equal(getComputedStyle(field).willChange, 'auto', 'the clipped box is not a layer');
      stage.destroy();
    });
  });

  // CH3: a new stage is hatched in along the strokes from its seat, by a ragged edge on the lines' parents (the haze
  // and the eraser's dust come in under the same edge), not swept by stage.css's straight edge across them. The
  // keyframes have no `to`; at rest the field is back on its wipe.
  DT.test('theme chalk: a new stage is hatched in along the strokes, then rests on the wipe', () => {
    SEATINGS.forEach(([name, seat]) => {
      const where = name + ' / ' + seat;
      const { stage, root } = mountEntering(singleAt(name, 10, seat));
      assert.ok(root.classList.contains('is-entering'), where);
      const field = root.querySelector('.dt-field');
      assert.equal(getComputedStyle(field).animationName, 'dt-chalk-in', where);
      assert.ok(/^polygon\(/.test(getComputedStyle(field).clipPath), where + ': ' + getComputedStyle(field).clipPath.slice(0, 40));
      assert.ok(lists(getComputedStyle(field).clipPath.replace(/^polygon\(|\)$/g, '')).length >= 10, where + ': a ragged edge');
      ['.dt-deco', '.dt-deco-over'].forEach(sel => {
        const cs = getComputedStyle(root.querySelector(sel));
        assert.equal(cs.animationName, 'dt-chalk-in', where + ' ' + sel);
        assert.ok(/^polygon\(/.test(cs.clipPath), where + ' ' + sel + ' under the same edge');
      });
      // It starts at 0; with no `to` frame it ends on the live value, 1 (registered, not inherited): the stage at rest,
      // which is also what a still ([data-still] stands it 10 s in) and reduced motion (no animation) show.
      assert.equal(Number(getComputedStyle(field).getPropertyValue('--chalk-in')), 0, where + ': from the seat');
      field.getAnimations().forEach(a => a.finish());
      assert.equal(Number(getComputedStyle(field).getPropertyValue('--chalk-in')), 1, where + ': ends at rest');
      root.classList.remove('is-entering');
      assert.ok(/^inset\(/.test(getComputedStyle(field).clipPath), where + ': at rest, the wipe');
      assert.equal(getComputedStyle(root.querySelector('.dt-deco')).clipPath, 'none', where + ': the haze unclipped');
      stage.destroy();
    });
    // A free debate: each half from its own seat edge.
    const { stage, root } = mountEntering(dualAt(30));
    root.querySelectorAll('.dt-half-field').forEach(f => {
      assert.equal(getComputedStyle(f).animationName, 'dt-chalk-in', 'a half');
      assert.ok(/^polygon\(/.test(getComputedStyle(f).clipPath), 'a half: ' + getComputedStyle(f).clipPath.slice(0, 40));
    });
    stage.destroy();
  });

  // CH10: the warn bell. The eraser reaches the tick as the bell rings (engine.js) and takes it toward the seat in one
  // stroke; going back to calm puts it back at once. The patch under it is cut at the wipe, so what is left of it lies
  // over lines the eraser has not reached and no chalk comes back as it goes.
  DT.test('theme chalk: at the warn bell the eraser takes the tick, and its patch goes only where the eraser has been', () => {
    [['left', 'left'], ['right', 'right']].forEach(([seat, from]) => {
      const calm = mountBoard(singleAt(OPENING, 60, seat));
      const c = getComputedStyle(calm.root.querySelector('.dt-warnline'));
      assert.ok(!/clip-path/.test(c.transitionProperty), seat + ': undo puts the tick back at once: ' + c.transitionProperty);
      calm.stage.destroy();
      const { stage, root } = mountBoard(singleAt(OPENING, 152, seat));   // 28 s left
      assert.equal(root.dataset.phase, 'warn', seat);
      const w = getComputedStyle(root.querySelector('.dt-warnline'));
      assert.ok(/clip-path/.test(w.transitionProperty) && px(w.transitionDuration) >= 0.3, seat + ': taken in a stroke: ' + w.transitionProperty);
      const v = insetOf(w.clipPath);
      assert.ok(px(from === 'left' ? v[1] : v[3]) >= 100, seat + ': gone toward the seat: ' + w.clipPath);
      const over = root.querySelector('.dt-deco-over'), o = over.getBoundingClientRect();
      const patch = pseudo(over, '::after');
      assert.ok(shown(patch), seat + ': the patch');
      assert.equal(patch.filter, 'none', seat + ': no filter, so cutting it each step is cheap');
      const left = o.left + px(patch.left), right = left + px(patch.width);
      const used = parseFloat(root.style.getPropertyValue('--used')), W = o.width;
      const edge = from === 'left' ? o.left + (1 - used) * W : o.left + used * W;
      const cut = insetOf(patch.clipPath);
      const visible = from === 'left' ? right - lengthIn(over, cut[1]) : left + lengthIn(over, cut[3]);
      assert.ok(edge > left && edge < right, seat + ': the edge is over the patch');
      assert.near(visible, edge, 2, seat + ': cut at the wipe');
      stage.destroy();
    });
  });

  // CH6: a bell rings in chalk, and chalk marks do not grow. The warn bell underlines the number (a stroke drawn left
  // to right, under the digits, then dust); a single stage's end and a free-debate side out of time have no ring.
  DT.test('theme chalk: a bell is a chalk mark that does not grow', () => {
    const { stage, root } = mountBoard(singleAt(OPENING, 150.5));
    stage.pulse({ type: 'warn', clock: 'main' });
    const clock = root.querySelector('.dt-clock[data-clock="main"]');
    const ring = clock.querySelector('.dt-ring');
    assert.ok(ring, 'a ring');
    const cs = getComputedStyle(ring);
    assert.equal(cs.animationName, 'dt-chalk-underline');
    assert.equal(cs.borderTopWidth, '0px', 'no border');
    assert.ok(px(cs.height) < px(cs.width) / 5, 'a line, not a ring: ' + cs.width + ' × ' + cs.height);
    const frames = ring.getAnimations().filter(a => a.animationName === 'dt-chalk-underline')[0].effect.getKeyframes();
    assert.ok(frames.every(k => !('scale' in k) && !('transform' in k) && !('width' in k)), 'it does not grow');
    const stroke = pseudo(ring, '::before');
    assert.ok(/#dt-chalk-stroke/.test(stroke.filter) && /opacity/.test(stroke.willChange), 'chalk, drawn once');
    const r = ring.getBoundingClientRect(), d = clock.querySelector('.dt-digits').getBoundingClientRect();
    assert.ok(r.top > d.bottom - 0.2 * d.height && r.left > d.left - 4 && r.right < d.right + 4, 'under the digits');
    stage.destroy();
    // A break's end bell underlines its time too, and its second bell strikes a second line under the first.
    const brk = mountBoard(E.view(E.goto(E.createSession(F(), MATCH, T0, { theme: 'chalk' }), idx('评委打分'), T0), T0));
    assert.equal(brk.root.dataset.kind, 'break');
    const bclock = brk.root.querySelector('.dt-clock[data-clock="main"]');
    const ends = [1, 2].map(n => {
      const r = document.createElement('i');
      r.className = 'dt-ring'; r.dataset.type = 'end'; r.dataset.nth = String(n);
      bclock.appendChild(r);
      return getComputedStyle(r);
    });
    ends.forEach(c => assert.ok(c.display !== 'none' && c.animationName === 'dt-chalk-underline', 'a break\'s end is underlined'));
    assert.ok(px(ends[1].marginTop) > px(ends[0].marginTop), 'the second stroke below the first');
    brk.stage.destroy();
    // A single stage's end: no ring (the eraser's pass and the loop answer it); a half's end: no ring (时间到 does).
    const end = mountBoard(singleAt(OPENING, 179.9));
    end.stage.pulse({ type: 'end', clock: 'main' });
    end.root.querySelectorAll('.dt-clock[data-clock="main"] .dt-ring').forEach(x => assert.equal(getComputedStyle(x).display, 'none', 'no end ring'));
    end.stage.destroy();
    const d2 = mountBoard(dualAt(30));
    d2.stage.pulse({ type: 'end', clock: 'pro' });
    const hr = d2.root.querySelector('.dt-half[data-side="pro"] .dt-ring');
    assert.ok(hr && getComputedStyle(hr).display === 'none', 'no ring for a side out of time');
    d2.stage.destroy();
  });

  // CH4: time up. On the first bell the eraser's last pass lets the heavier haze in from the far side (the running
  // haze holds ahead of it); on the second the loop is drawn by a sweeping mask on its parent, the loop itself drawn
  // once. All keyed on data-bell, so a stage opened in overtime, a still and reduced motion show the end state.
  DT.test('theme chalk: time up is the eraser\'s last pass and the loop drawn on the second bell', () => {
    [['left', 'l'], ['right', 'r']].forEach(([seat, dir]) => {
      const { stage, root } = mountBoard(singleAt(OPENING, 179.9, seat));
      stage.pulse({ type: 'end', clock: 'main' });
      stage.update(singleAt(OPENING, 180.2, seat));
      assert.equal(root.dataset.phase, 'over', seat);
      assert.equal(root.dataset.bell, 'end', seat);
      const deco = root.querySelector('.dt-deco'), over = root.querySelector('.dt-deco-over');
      assert.equal(pseudo(deco, '::before').animationName, 'dt-chalk-pass-' + dir, seat + ': the heavier haze behind the eraser');
      const rest = pseudo(deco, '::after');
      assert.ok(shown(rest) && rest.animationName === 'dt-chalk-rest-' + dir, seat + ': the running haze ahead of it');
      const oc = getComputedStyle(over);
      assert.ok(/conic-gradient/.test(oc.maskImage || oc.webkitMaskImage), seat + ': a sweep uncovers the loop');
      assert.equal(oc.animationName, 'dt-chalk-draw', seat);
      assert.near(px(oc.animationDelay), 0.32, 0.001, seat + ': on the second bell');
      const loop = pseudo(over, '::after');
      assert.equal(loop.animationName, 'none', seat + ': the loop itself is not animated');
      assert.ok(/opacity/.test(loop.willChange), seat + ': a layer of its own, filtered once');
      root.removeAttribute('data-bell'); root.removeAttribute('data-bell-clock');
      assert.ok(!shown(pseudo(deco, '::after')), seat + ': gone with the bell');
      assert.ok(/^none$/.test(getComputedStyle(over).maskImage) || getComputedStyle(over).maskImage === '', seat + ': no mask at rest');
      stage.destroy();
    });
  });

  // On a 4:3 stage the loop cannot move left by half the sign: it moves as far as the stage allows and stays on it.
  DT.test('theme chalk: on a 4:3 stage the overtime loop stays on the board', () => {
    const { stage, root } = mountBoard(singleAt(OPENING, 187), 1024, 768);
    const loop = pseudo(root.querySelector('.dt-deco-over'), '::after');
    const o = root.querySelector('.dt-deco-over').getBoundingClientRect(), box = root.getBoundingClientRect();
    const l = o.left + px(loop.left), r = l + px(loop.width);
    assert.ok(l >= box.left - 0.012 * box.height && r <= box.right, 'on the stage: ' + l + '–' + r);
    stage.destroy();
  });

  // CH9: 时间到 / 已放弃 is written in chalk where the digits stood (stage.css fades it in after they go). Painted with
  // its clock: a layer of its own at a fraction of a pixel (it is centred by translate) would lose the grain.
  DT.test('theme chalk: a side out of time has 时间到 written in chalk', () => {
    let s = E.floor(session('自由辩论'), 'pro', T0);
    s = E.floor(s, 'con', T0 + 20000);
    s = E.tick(s, T0 + 262000).session;   // 反方 runs out
    const { stage, root } = mountBoard(E.view(s, T0 + 262000));
    const locked = root.querySelector('.dt-half[data-locked]');
    assert.ok(locked, 'a side out of time');
    const st = getComputedStyle(locked.querySelector('.dt-state'));
    assert.ok(/#dt-chalk-write/.test(st.filter), st.filter);
    assert.equal(st.willChange, 'auto', 'no layer of its own');
    stage.destroy();
  });

  // CH1 / CH2: a switch only fades two sets of the same strokes (520 ms, with the columns' spring). Each set is a layer
  // of its own in a box that never changes: the widest column with its overhang, held at the half's seat edge.
  DT.test('theme chalk: a switch fades two sets of strokes that stand still as the halves spring', () => {
    const idle = E.view(session('自由辩论'), T0);
    ['left', 'right'].forEach(seat => {
      const boxes = {};
      // 正方 holds the floor, then 反方.
      [E.view(E.floor(session('自由辩论', seat), 'pro', T0), T0 + 10000), dualAt(30, seat)].forEach(view => {
        const { stage, root } = mountBoard(view);
        const W = root.getBoundingClientRect().width;
        root.querySelectorAll('.dt-half').forEach(h => {
          const f = h.querySelector('.dt-half-field'), r = f.getBoundingClientRect(), hb = h.getBoundingClientRect();
          (boxes[h.dataset.side] = boxes[h.dataset.side] || []).push([r.left, r.right]);
          assert.near(r.width, 0.62 * W, 2, seat + ' ' + h.dataset.side + ': the widest column\'s box');
          const first = h === h.parentNode.firstElementChild;
          assert.near(first ? r.left : r.right, first ? hb.left - 0.02 * W : hb.right + 0.02 * W, 2, seat + ': held at the seat edge');
          ['::before', '::after'].forEach(w => {
            const cs = pseudo(f, w);
            assert.ok(/opacity/.test(cs.willChange), w + ': a layer of its own');
            assert.equal(cs.transitionProperty, 'opacity', w);
            assert.near(px(cs.transitionDuration), 0.52, 0.001, w);
          });
          const active = h.hasAttribute('data-active');
          assert.equal(pseudo(f, '::after').opacity, active ? '1' : '0', seat + ' ' + h.dataset.side);
          const light = h.dataset.side === 'pro' ? 0.63 : 0.62;
          assert.near(Number(pseudo(f, '::before').opacity), active ? 1 : light, 0.001, seat + ' ' + h.dataset.side + ': the lighter hand');
        });
        stage.destroy();
      });
      ['pro', 'con'].forEach(side => {
        assert.near(boxes[side][0][0], boxes[side][1][0], 0.5, seat + ' ' + side + ': the box does not move');
        assert.near(boxes[side][0][1], boxes[side][1][1], 0.5, seat + ' ' + side);
      });
    });
    // Before the first floor: both halves show the first set, and the second lightly.
    const { stage, root } = mountBoard(idle);
    assert.ok(root.querySelector('.dt-halves').hasAttribute('data-idle'), 'idle');
    root.querySelectorAll('.dt-half-field').forEach(f => {
      assert.equal(pseudo(f, '::before').opacity, '1');
      assert.near(Number(pseudo(f, '::after').opacity), 0.4, 0.001);
    });
    stage.destroy();
  });
})();
