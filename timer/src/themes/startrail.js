/* themes/startrail.js: 星轨's canvas painter (spec §2.2). A long exposure of the night sky: the stars circle a
   celestial pole just off the speaking side's upper corner, and the time used is the length of their trails. */
(function (DT) {
  'use strict';
  const MAX_STARS = 600;          // over the whole sky, on any stage (spec §2.2)
  const SKY_PER_STAR = 3400;      // CSS px² of sky per star: the cap at 1920×1080, about 300 at 1366×768
  const MIN_STARS = 140;          // a thumbnail still shows a sky
  const SWEEP = 0.6;              // radians a trail turns through over a whole stage (about 34°)
  const DOT = 0.003;              // a star before any of its time is used: a point
  const OVER = 0.35;              // overtime lengthens the trails further, up to this share of a stage
  const TITLE_USED = 0.3;         // the title card shows an exposure already under way
  const ACTIVE_COL = 0.58;        // the speaking half's share of the width in free debate (as render.js)
  const HALF_SKY = 0.62;          // a pole's stars in free debate reach this far, so the wider half is covered too
  const CAST_FLOOR = { whole: 0.45, half: 0.15 };   // the least cast a star takes, far from its pole: a single stage's
                                  // whole sky leans to the speaker; two skies side by side keep to their own halves
  const STEP_PX = 2;              // a trail is drawn on only once it has grown this many pixels: pieces shorter than a
                                  // pixel would each be antialiased on their own and add up dimmer than one stroke
  const POLE = { x: -0.07, y: -0.42 };   // the pole, off the upper corner, in stage widths and heights

  // Starlight from hot to cool, and each side's cast: 正方 warm, 反方 cold.
  const TEMPS = [[170, 198, 255], [212, 225, 255], [246, 246, 255], [255, 238, 212], [255, 210, 160]];
  const CAST = { pro: [255, 176, 118], con: [104, 204, 240] };   // 反方 leans to the nebula's teal, not the blue-white of hot stars

  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const quant = (x, step) => Math.round(x / step) * step;

  // The stars one pole carries across a region `w` wide from its own edge: their places at the start of the
  // exposure, spread evenly over every part of the sky whose trail can cross the region.
  function makeSky(seed, W, H, w, cap) {
    const rand = DT.themes.rng(seed);
    const px = POLE.x * W, py = POLE.y * H;
    const angles = [[0, 0], [w, 0], [0, H], [w, H]].map(([x, y]) => Math.atan2(y - py, x - px));
    const reach = SWEEP * (1 + OVER);
    const amin = Math.min.apply(null, angles) - reach, amax = Math.max.apply(null, angles);
    const r0 = Math.hypot(px, py), r1 = Math.hypot(w - px, H - py);
    const inside = (r, a) => {
      const x = px + r * Math.cos(a), y = py + r * Math.sin(a);
      return x >= 0 && x <= w && y >= 0 && y <= H;
    };
    const n = Math.max(MIN_STARS, Math.min(cap, Math.round(w * H / SKY_PER_STAR)));
    const stars = [];
    let rmax = 0;
    for (let tries = 0; stars.length < n && tries < n * 40; tries++) {
      const r = Math.sqrt(r0 * r0 + rand() * (r1 * r1 - r0 * r0));
      const a = amin + rand() * (amax - amin);
      const m = rand(), t = rand();
      let seen = false;
      for (let k = 0; k <= 6 && !seen; k++) seen = inside(r, a + reach * k / 6);
      if (!seen) continue;
      const x = px + r * Math.cos(a);
      stars.push({ i: stars.length, r, a, m, t, x: Math.min(1, Math.max(0, x / W)) });
      rmax = Math.max(rmax, r);
    }
    return { stars, rmax, groups: {} };
  }

  // One stroke style per group of stars, so a frame strokes a few dozen paths rather than hundreds. `cast` tints
  // the stars toward a side, the most at the pole's own edge; `spread` is how far across the stage that falls off,
  // and `floor` the least cast any star keeps.
  function groupsOf(sky, cast, spread, floor, k) {
    const key = (cast || '') + '|' + spread + '|' + floor;   // a sky is made again whenever the stage (and so k) changes size
    if (sky.groups[key]) return sky.groups[key];
    const halos = {}, cores = {};
    const add = (into, style, width, star) => {
      const id = style + '|' + width;
      (into[id] = into[id] || { style, width, stars: [] }).stars.push(star);
    };
    sky.stars.forEach(s => {
      const bright = Math.pow(s.m, 4);
      const i = s.t * (TEMPS.length - 1), lo = Math.floor(i), hi = Math.min(TEMPS.length - 1, lo + 1);
      let c = mix(TEMPS[lo], TEMPS[hi], i - lo);
      if (cast) c = mix(c, CAST[cast], 0.85 * Math.max(floor, 1 - s.x / spread));
      const rgb = c.map(v => Math.min(255, quant(v, 8))).join(' ');
      const alpha = quant(0.14 + 0.8 * Math.pow(s.m, 2.4), 0.04);
      const width = quant((0.6 + 2 * bright) * k, 0.2);
      // The brightest stars bloom a little, as they do on film: a wide faint stroke under the trail.
      if (bright > 0.3) add(halos, 'rgb(' + rgb + ' / ' + quant(alpha * 0.14, 0.02) + ')', quant(width * 3.6, 0.4), s);
      add(cores, 'rgb(' + rgb + ' / ' + alpha + ')', width, s);
    });
    const list = o => Object.keys(o).map(id => o[id]);
    return (sky.groups[key] = list(halos).concat(list(cores)));   // the blooms first, under the trails
  }

  // What is on screen, as poles: which edge each sits beyond, whose stars it carries, how much of its time is used,
  // how wide its part of the stage is. `key` changes whenever the sky has to be painted again from nothing.
  function scene(v) {
    const seat = v.proSeat === 'right' ? 'right' : 'left';
    const edgeOf = side => (side === 'pro') === (seat === 'left') ? 'left' : 'right';
    const used = c => !c ? 0 : 1 - c.fraction + Math.min(OVER, c.total > 0 ? c.overtime / c.total : 0);
    const pair = u => ['pro', 'con'].map(side => ({ edge: edgeOf(side), sky: side + '/half', cast: side, used: u, width: 0.5 }));
    if (v.mode === 'title') return { key: 'title|' + seat, poles: pair(TITLE_USED) };
    if (v.mode !== 'stage' || !v.stage) return { key: 'end|' + seat, poles: pair(1) };
    const st = v.stage;
    if (st.type === 'dual') {
      const active = v.clocks.find(c => c.active) || null;
      return {
        key: ['dual', st.id, seat, active ? active.side : ''].join('|'),
        poles: v.clocks.map(c => ({
          edge: edgeOf(c.side), sky: c.side + '/half', cast: c.side, used: used(c),
          width: !active ? 0.5 : c.active ? ACTIVE_COL : 1 - ACTIVE_COL,
        })),
      };
    }
    const clock = v.clocks[0];
    if (st.type === 'break') return { key: 'break|' + st.id, poles: [{ edge: 'right', sky: 'break', cast: null, used: used(clock), width: 1 }] };
    const side = st.side === 'con' ? 'con' : 'pro';
    return { key: ['single', st.id, seat, side].join('|'), poles: [{ edge: edgeOf(side), sky: side, cast: side, used: used(clock), width: 1 }] };
  }

  const theta = used => DOT + SWEEP * used;

  function painter(canvas, ctx) {
    // drawn: the scene on the canvas, each pole's used share and the angle each of its trails has been drawn to.
    let W = 0, H = 0, skies = {}, drawn = null;

    function skyOf(name) {
      const half = /\/half$/.test(name);
      if (!skies[name]) skies[name] = makeSky('startrail/' + name, W, H, half ? HALF_SKY * W : W, half ? MAX_STARS / 2 : MAX_STARS);
      return skies[name];
    }

    // Draw a pole's trails on from the angle each has reached (`ends`, past its start) to `to`, skipping those that
    // have not yet grown by a step, and note where each now ends. A pole beyond the right edge is the left one
    // mirrored: its angles run the other way round.
    function arcs(pole, ends, to, cap) {
      const sky = skyOf(pole.sky);
      const k = Math.max(0.75, Math.sqrt(Math.min(1, W / 1920)));   // thinner on a small stage, never hairlines
      const whole = pole.width === 1;
      const groups = groupsOf(sky, pole.cast, whole ? 1 : HALF_SKY, whole ? CAST_FLOOR.whole : CAST_FLOOR.half, k);
      const mirror = pole.edge === 'right';
      const cx = mirror ? W - POLE.x * W : POLE.x * W, cy = POLE.y * H;
      const due = sky.stars.map(s => (to - ends[s.i]) * s.r >= STEP_PX || ends[s.i] === 0);
      ctx.save();
      if (pole.width < 1) {
        ctx.beginPath();
        ctx.rect(mirror ? W * (1 - pole.width) : 0, 0, W * pole.width, H);
        ctx.clip();
      }
      ctx.lineCap = cap;
      groups.forEach(g => {
        let any = false;
        ctx.beginPath();
        g.stars.forEach(s => {
          if (!due[s.i]) return;
          const a = mirror ? Math.PI - s.a - ends[s.i] : s.a + ends[s.i];
          const b = mirror ? Math.PI - s.a - to : s.a + to;
          ctx.moveTo(cx + s.r * Math.cos(a), cy + s.r * Math.sin(a));
          ctx.arc(cx, cy, s.r, a, b, mirror);
          any = true;
        });
        if (!any) return;
        ctx.strokeStyle = g.style;
        ctx.lineWidth = g.width;
        ctx.stroke();
      });
      ctx.restore();
      sky.stars.forEach(s => { if (due[s.i]) ends[s.i] = to; });
    }

    return {
      // The whole sky when the scene changes, the canvas was resized or time went back; otherwise only the growth of
      // the trails since they were last drawn on, a trail at a time once it has grown by a step.
      frame(v) {
        if (!W || !H || !v) return;
        const sc = scene(v);
        const fresh = !drawn || drawn.key !== sc.key || sc.poles.some((p, i) => p.used < drawn.used[i]);
        if (fresh) {
          ctx.clearRect(0, 0, W, H);
          drawn = { key: sc.key, used: [], ends: sc.poles.map(p => new Float64Array(skyOf(p.sky).stars.length)) };
        }
        sc.poles.forEach((p, i) => {
          if (!fresh && p.used === drawn.used[i]) return;
          arcs(p, drawn.ends[i], theta(p.used), fresh ? 'round' : 'butt');
          drawn.used[i] = p.used;
        });
      },
      resize(w, h) { W = w; H = h; skies = {}; drawn = null; },
      destroy() { skies = {}; drawn = null; },
    };
  }

  DT.themes.register('startrail', { painter });
})(window.DT = window.DT || {});
