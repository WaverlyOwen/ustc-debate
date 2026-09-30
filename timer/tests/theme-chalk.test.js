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
  // A length variable resolved in the element's own box.
  function length(el, varName) {
    const probe = document.createElement('i');
    probe.style.cssText = 'position:absolute;left:0;top:0;height:1px;width:var(' + varName + ')';
    el.appendChild(probe);
    const w = probe.getBoundingClientRect().width;
    probe.remove();
    return w;
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
    const parts = m[1].trim().split(/\s+(?![^(]*\))/);
    // inset(top right bottom left), shortened the usual CSS way.
    const right = parts[1] || parts[0], left = parts[3] || right;
    const x = s => /%$/.test(s) ? parseFloat(s) / 100 * r.width : parseFloat(s);
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
    const back = getComputedStyle(root.querySelector('.dt-backdrop')).backgroundImage;
    assert.ok(/feTurbulence/.test(back), 'chalk dust from noise');
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
  // laptop without a GPU keeps its frame rate. The breathing colon and the tension may not redraw it.
  DT.test('theme chalk: the grain of the digits is not drawn again on every frame', () => {
    const { stage, root } = mountBoard(singleAt(OPENING, 60));
    const digits = root.querySelector('.dt-clock[data-clock="main"] .dt-digits');
    assert.equal(getComputedStyle(digits).filter, 'none', 'the filter sits on the parts, not round the breathing colon');
    const fvs = t => { root.style.setProperty('--tension', String(t)); return getComputedStyle(digits).fontVariationSettings; };
    assert.equal(fvs(0.301), fvs(0.309), 'the change of tension in one frame leaves the digits as they are');
    assert.ok(fvs(0.301) !== fvs(0.36), 'but they do tense up');
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
      assert.ok(px(cs.height) < 0.1 * box.height, where + ': small: ' + cs.height);
      assert.ok(/svg/.test(cs.backgroundImage) && /path/.test(cs.backgroundImage), where + ': a drawn tick');
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
      const dense = length(con.querySelector('.dt-half-field'), '--hatch-pitch');
      const sparse = length(pro.querySelector('.dt-half-field'), '--hatch-pitch');
      assert.ok(dense > 0 && dense < 0.7 * sparse, seat + ': ' + dense + ' vs ' + sparse);
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
    assert.ok(!shown(pseudo(calm.root.querySelector('.dt-deco-over'), '::after')), 'no loop before time is up');
    calm.stage.destroy();
    const { stage, root } = mountBoard(singleAt(OPENING, 187));
    assert.equal(root.dataset.phase, 'over');
    const digits = root.querySelector('.dt-clock[data-clock="main"] .dt-digits');
    assert.equal(getComputedStyle(digits).color, resolve(root, '--accent'));
    const loop = pseudo(root.querySelector('.dt-deco-over'), '::after');
    assert.ok(shown(loop));
    assert.ok(/svg/.test(loop.backgroundImage) && /#dt-chalk-stroke/.test(loop.filter), 'a chalk drawing');
    const o = root.querySelector('.dt-deco-over').getBoundingClientRect(), d = digits.getBoundingClientRect();
    const l = { left: o.left + px(loop.left) - px(loop.width) / 2, top: o.top + px(loop.top) - px(loop.height) / 2 };
    l.right = l.left + px(loop.width); l.bottom = l.top + px(loop.height);
    assert.ok(l.left < d.left && l.right > d.right && l.top < d.top + 0.2 * d.height && l.bottom > d.bottom - 0.2 * d.height,
      'round the digits: ' + JSON.stringify(l) + ' ' + JSON.stringify(d));
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
})();
