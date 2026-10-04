/* themes/ink.js: 墨's SVG filters (spec §2.1): the brush stroke's bled edge and dry tip, the worn seal, the drop; and
   the pieces its motion moves (motion spec §2.1): the brush's dry front, the falling drop, the seals, the 圆相. */
(function (DT) {
  'use strict';
  // The filters work in screen pixels, so there is one brush per stage size and ink.css picks it by the stage's
  // width: a thumbnail's stroke is the projector's stroke made small, not shredded by full-size displacement.
  // k scales every length (and divides every frequency); 1 is drawn for a 1920-pixel-wide stage.
  const SIZES = { xl: 1, l: 0.72, m: 0.45, s: 0.14 };

  const n = x => String(Math.round(x * 10000) / 10000);
  const freq = (fx, fy, k) => n(fx / k) + ' ' + n(fy / k);

  // The stroke's own geometry (ink.css) is a flat band with a few loose hairs at its edges; this makes it a brush:
  // 1. every row of hairs ends at its own place, so the tip frays into 飞白 (dry brush);
  // 2. the edges swell and thin with the brush's pressure, then bleed a little into the paper's fibres (晕染);
  // 3. ink pools in streaks along the stroke and the brush's hairs leave paler lines, so the colour has the depth
  //    of 墨 rather than a flat print.
  function brush(name, k) {
    return '<filter id="dt-ink-brush-' + name + '" x="-4%" y="-12%" width="108%" height="124%" color-interpolation-filters="sRGB">' +
      '<feTurbulence type="fractalNoise" baseFrequency="' + freq(0.0012, 0.075, k) + '" numOctaves="2" seed="4" result="hairs"/>' +
      '<feColorMatrix in="hairs" type="matrix" values="1 0 0 0 0  0 0 0 0 .5  0 0 0 0 0  0 0 0 0 1" result="rows"/>' +
      '<feDisplacementMap in="SourceGraphic" in2="rows" scale="' + n(110 * k) + '" xChannelSelector="R" yChannelSelector="G" result="dry"/>' +
      '<feTurbulence type="fractalNoise" baseFrequency="' + freq(0.005, 0.018, k) + '" numOctaves="3" seed="9" result="press"/>' +
      '<feDisplacementMap in="dry" in2="press" scale="' + n(64 * k) + '" xChannelSelector="G" yChannelSelector="R" result="swell"/>' +
      '<feTurbulence type="fractalNoise" baseFrequency="' + freq(0.3, 0.3, k) + '" numOctaves="1" seed="2" result="fibre"/>' +
      '<feDisplacementMap in="swell" in2="fibre" scale="' + n(4 * k) + '" xChannelSelector="R" yChannelSelector="G" result="frayed"/>' +
      '<feGaussianBlur in="frayed" stdDeviation="' + n(0.8 * k) + '" result="bled"/>' +
      '<feTurbulence type="fractalNoise" baseFrequency="' + freq(0.0015, 0.05, k) + '" numOctaves="3" seed="15" result="tone"/>' +
      '<feColorMatrix in="tone" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.1 0 0 0 -.5" result="pool"/>' +
      '<feComposite in="pool" in2="bled" operator="in" result="pooled"/>' +
      '<feTurbulence type="fractalNoise" baseFrequency="' + freq(0.0008, 0.11, k) + '" numOctaves="3" seed="23" result="grain"/>' +
      '<feColorMatrix in="grain" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  1 0 0 0 -.64" result="hair"/>' +
      '<feComposite in="hair" in2="bled" operator="in" result="haired"/>' +
      '<feMerge><feMergeNode in="bled"/><feMergeNode in="pooled"/><feMergeNode in="haired"/></feMerge>' +
      '</filter>';
  }

  // A seal pressed onto paper: its edges a little rough, its ink missing in a few worn spots. The light one is for a
  // smaller stage, where the small seal's strokes are only a pixel or two wide and the full wear would eat them.
  const seal = (id, rough, wear) => '<filter id="' + id + '" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">' +
    '<feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" seed="5" result="grain"/>' +
    '<feDisplacementMap in="SourceGraphic" in2="grain" scale="' + rough + '" xChannelSelector="R" yChannelSelector="G" result="rough"/>' +
    '<feTurbulence type="fractalNoise" baseFrequency=".09" numOctaves="3" seed="8" result="wear"/>' +
    '<feColorMatrix in="wear" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  9 0 0 0 ' + wear + '" result="kept"/>' +
    '<feComposite in="rough" in2="kept" operator="in"/>' +
    '</filter>';
  const SEAL = seal('dt-ink-seal', 2.4, -2.6) + seal('dt-ink-seal-light', 1.1, -1.6);

  // A drop of ink soaking into the paper: a fibrous rim. It also roughens the title card's dabs and the break's circle.
  const DROP = '<filter id="dt-ink-drop" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB">' +
    '<feTurbulence type="fractalNoise" baseFrequency=".3" numOctaves="2" seed="3" result="fibre"/>' +
    '<feDisplacementMap in="SourceGraphic" in2="fibre" scale="4.5" xChannelSelector="R" yChannelSelector="G"/>' +
    '</filter>';

  // ---- the brush's motion (motion spec §2.1): images the stylesheet masks with, and the pieces decorate adds ----

  const rnd = DT.themes.rng('ink');
  const r2 = x => Math.round(x * 100) / 100;
  const uri = svg => 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
  // Drawn rooted at the left; the right-hand seat's copy is the same image mirrored.
  const image = (w, h, body) => ['l', 'r'].map(side => uri('<svg xmlns="http://www.w3.org/2000/svg" width="' + w +
    '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none"><defs><linearGradient id="dt-ink-f">' +
    '<stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
    '<linearGradient id="dt-ink-b"><stop offset=".78" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>' +
    (side === 'l' ? body : '<g transform="matrix(-1 0 0 1 ' + w + ' 0)">' + body + '</g>') + '</svg>'));
  // Loose hairs of a dry brush, rows across the stroke's ink (4%–94% of its box), each ending at its own place and
  // fading as it goes: from x0, up to len long.
  function hairs(n, x0, len, min) {
    let out = '';
    for (let i = 0; i < n; i++) {
      const y = 4 + rnd() * 88, h = 0.5 + rnd() * 2.2, l = len * (min + (1 - min) * rnd());
      out += '<rect x="' + r2(x0) + '" y="' + r2(y) + '" width="' + r2(l) + '" height="' + r2(h) +
        '" fill="url(#dt-ink-f)" opacity="' + r2(0.45 + 0.55 * rnd()) + '"/>';
    }
    return out;
  }
  // The stroke's mask while the brush lands, twice the field wide: its left half the solid body, its end rounded like
  // a brush's tip (the middle leads) and ragged row by row, then a front of dry hairs 8% of the field long (飞白),
  // then nothing. ink.css slides it across the field.
  function frontBody() {
    let out = '<rect width="955" height="100" fill="#fff"/>';
    for (let y = 0; y < 100; y += 1.25) {
      const u = (y + 0.6 - 49) / 46, end = 1000 - 24 * u * u + (rnd() - 0.5) * 10;
      out += '<rect x="954" y="' + r2(y) + '" width="' + r2(end - 954) + '" height="1.35" fill="url(#dt-ink-b)"/>';
    }
    return out;
  }
  const FRONT = image(2000, 100, frontBody() + hairs(34, 990, 90, 0.2));
  // The dry hairs alone: the front a resumed brush flicks, the last of the ink running out.
  const HAIRS = image(100, 100, hairs(30, 0, 100, 0.3));
  const IMAGES = { '--ink-front-l': FRONT[0], '--ink-front-r': FRONT[1], '--ink-hairs-l': HAIRS[0], '--ink-hairs-r': HAIRS[1] };

  // The 圆相: a circle drawn in one breath, clockwise from the lower left. The ink is a filled shape, heavy where the
  // brush came down and thinning as it runs dry, its last stretch broken into hairs; it shows through a mask whose
  // stroke along the brush's path ink.css draws out with stroke-dashoffset, so it appears as if painted.
  const ENSO = (() => {
    const R = 100, W = 25, A0 = 112, SWEEP = 322, N = 160;
    const ph = [0, 1, 2, 3].map(() => rnd() * 2 * Math.PI);
    const radius = t => R + 1.6 * Math.sin(t * 8.2 + ph[0]) + 0.9 * Math.sin(t * 23 + ph[1]) + 4 * t * t;
    // Heaviest where the brush came down, then thinning steadily as it runs dry.
    const width = t => t < 0.05 ? W * (1.14 - 0.14 * Math.sin(t / 0.05 * Math.PI / 2))
      : W * (1 - 0.7 * Math.pow((t - 0.05) / 0.95, 1.2));
    const at = (t, off) => {
      const a = (A0 + SWEEP * t) * Math.PI / 180, r = radius(t) + off;
      return [Math.cos(a) * r, Math.sin(a) * r];
    };
    const fmt = p => r2(p[0]) + ' ' + r2(p[1]);
    // The paper's tooth along each edge.
    const rough = (t, k) => 0.45 * Math.sin(t * 97 + ph[k]) + 0.3 * Math.sin(t * 211 + ph[k] * 2);
    const END = 0.88;   // the solid body ends here; hairs carry on
    const outer = [], inner = [];
    for (let i = 0; i <= N; i++) {
      const t = END * i / N, w = width(t) * (i > N - 8 ? 0.4 + 0.6 * (N - i) / 8 : 1);
      outer.push(at(t, w / 2 + rough(t, 2)));
      inner.push(at(t, -w / 2 + rough(t, 3)));
    }
    // A round end where the brush came down: half a circle behind the first point.
    const cap = [];
    const a0 = A0 * Math.PI / 180, c = at(0, 0), rc = width(0) / 2;
    for (let k = 1; k < 12; k++) {
      const f = -Math.PI / 2 + Math.PI * k / 12;   // from the inner edge, round the back, to the outer
      const back = [Math.sin(a0), -Math.cos(a0)], out = [Math.cos(a0), Math.sin(a0)];
      cap.push([c[0] + rc * (Math.cos(f) * back[0] + Math.sin(f) * out[0]), c[1] + rc * (Math.cos(f) * back[1] + Math.sin(f) * out[1])]);
    }
    const body = 'M' + outer.map(fmt).join('L') + 'L' + inner.reverse().map(fmt).join('L') + 'L' + cap.map(fmt).join('L') + 'Z';
    const line = (t0, t1, off, steps) => {
      const pts = [];
      for (let i = 0; i <= steps; i++) pts.push(at(t0 + (t1 - t0) * i / steps, off(t0 + (t1 - t0) * i / steps)));
      return 'M' + pts.map(fmt).join('L');
    };
    // 飞白: hairs running on past the body, and streaks of paper opening inside its last stretch; along the whole
    // body, the paler lines its hairs leave, more of them and clearer as it dries.
    const strands = [];
    for (let i = 0; i < 7; i++) {
      const o = (i / 6 - 0.5) * 0.8, t0 = 0.66 + rnd() * 0.12, t1 = 0.93 + rnd() * 0.065;
      strands.push({ d: line(t0, t1, t => o * width(t) + 0.6 * Math.sin(t * 40 + i), 40), w: r2(0.7 + rnd() * 1.1), o: r2(0.5 + rnd() * 0.45) });
    }
    let gaps = '';
    for (let i = 0; i < 5; i++) {
      const o = (rnd() - 0.5) * 0.7, t0 = 0.5 + rnd() * 0.2;
      gaps += '<path d="' + line(t0, END + 0.02, t => o * width(t), 30) + '" stroke-width="1.1"/>';
    }
    for (let i = 0; i < 16; i++) {
      const o = (rnd() - 0.5) * 0.85, t0 = rnd() * 0.6, t1 = Math.min(END + 0.02, t0 + 0.12 + rnd() * 0.35);
      gaps += '<path d="' + line(t0, t1, t => o * width(t), 40) + '" stroke-width="' + r2(0.5 + rnd()) +
        '" stroke-opacity="' + r2(t0 > 0.4 ? 0.35 + 0.3 * rnd() : 0.08 + 0.2 * rnd()) + '"/>';
    }
    return { body, strands, gaps, reveal: line(-0.03, 1.03, () => 0, 180) };
  })();
  const enso = id => '<svg class="dt-ink-enso" viewBox="-125 -125 250 250" aria-hidden="true" focusable="false">' +
    '<mask id="' + id + '" maskUnits="userSpaceOnUse" x="-125" y="-125" width="250" height="250">' +
    '<path class="dt-ink-enso-reveal" pathLength="1" d="' + ENSO.reveal + '" fill="none" stroke="#fff" stroke-width="40"/>' +
    '<g fill="none" stroke="#000" stroke-linecap="round">' + ENSO.gaps + '</g></mask>' +
    '<g mask="url(#' + id + ')"><path d="' + ENSO.body + '" fill="currentColor"/>' +
    ENSO.strands.map(s => '<path d="' + s.d + '" fill="none" stroke="currentColor" stroke-width="' + s.w +
      '" stroke-linecap="round" opacity="' + s.o + '"/>').join('') + '</g></svg>';

  let stages = 0;   // numbers each stage's masks: two stages on one page (the console and its preview) share no id

  // The pieces the stylesheet moves: under the stroke, the bleed round it; over it, the wet blot where the brush came
  // down, the falling drop and its bloom, the dry front and the last dry hairs; a 时 seal by the digits,
  // a 止 seal in each half, a 圆相 on the title card and one behind a break's digits. None is driven from here: each
  // moment's class on the stage (render.js) plays them, and without one they rest at their end state.
  function decorate(stage) {
    const doc = stage.ownerDocument, n = ++stages, added = [];
    const put = (parent, html) => {
      if (!parent) return;
      const box = doc.createElement('div');
      box.innerHTML = html;
      added.push(parent.appendChild(box.firstChild));
    };
    const q = sel => stage.querySelector(sel);
    const piece = name => '<i class="dt-ink-' + name + '" aria-hidden="true"></i>';
    const seal = (name, word) => '<span class="dt-ink-seal dt-ink-seal-' + name + '" aria-hidden="true">' + word + '</span>';
    put(q('.dt-deco'), piece('bleed'));
    ['press', 'fall', 'bloom', 'tip', 'dry'].forEach(name => put(q('.dt-deco-over'), piece(name)));
    const main = q('.dt-clock[data-clock="main"]');
    put(main, seal('time', '时'));
    put(main, enso('dt-ink-enso-' + n + '-break'));
    put(q('.dt-card'), enso('dt-ink-enso-' + n + '-title'));
    stage.querySelectorAll('.dt-half').forEach(half => put(half, seal('stop', '止')));
    Object.keys(IMAGES).forEach(name => stage.style.setProperty(name, IMAGES[name]));
    return {
      destroy() {
        added.forEach(el => el.remove());
        Object.keys(IMAGES).forEach(name => stage.style.removeProperty(name));
      },
    };
  }

  DT.themes.register('ink', {
    defs: '<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>' +
      Object.keys(SIZES).map(name => brush(name, SIZES[name])).join('') + SEAL + DROP + '</defs></svg>',
    decorate,
  });
})(window.DT = window.DT || {});
