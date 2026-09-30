/* themes/startrail.js: 星轨's canvas painter (spec §2.2). A long exposure of the night sky: the stars circle a
   celestial pole just off the speaking side's upper corner, and the time used is the length of their trails. */
(function (DT) {
  'use strict';
  const MAX_STARS = 600;          // over the whole sky (spec §2.2): the same stars on the projector and the console's
                                  // preview, placed in stage proportions, so the two show one picture (spec §1.2)
  const SKY_PER_STAR = 3400;      // a thumbnail's sky: CSS px² of sky per star, so a small still is not mush
  const MIN_STARS = 140;          // a thumbnail still shows a sky
  const REF_H = 1080;             // the stage height the trails' strength is set for
  const LAYER_FLUSH = 8;          // frames of growth a free debate layer holds before it is drawn (see frame)
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
  function makeSky(seed, W, H, w, cap, thumbnail) {
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
    const n = thumbnail ? Math.max(MIN_STARS, Math.min(cap, Math.round(w * H / SKY_PER_STAR))) : cap;
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
  // and `floor` the least cast any star keeps. `dim` scales their light, so a smaller stage with the same stars (the
  // console's preview) is not the brighter for it.
  function groupsOf(sky, cast, spread, floor, k, dim) {
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
      const alpha = quant((0.14 + 0.8 * Math.pow(s.m, 2.4)) * dim, 0.04);
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
      // Who holds the floor is not in the key: a change of floor only moves the two columns (see frame).
      return {
        key: ['dual', st.id, seat].join('|'), dual: true,
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

  function painter(canvas, ctx, flags) {
    const thumbnail = !!(flags && flags.thumbnail);
    // drawn: the scene on the canvas, each pole's used share and column width, and the angle each of its trails has
    // been drawn to. layers: in free debate, each side's whole sky on a canvas of its own (see frame).
    let W = 0, H = 0, skies = {}, drawn = null, layers = [];

    function skyOf(name) {
      const half = /\/half$/.test(name);
      if (!skies[name]) skies[name] = makeSky('startrail/' + name, W, H, half ? HALF_SKY * W : W, half ? MAX_STARS / 2 : MAX_STARS, thumbnail);
      return skies[name];
    }

    // The stage canvas as a target: a pole that has only part of the stage is cut to its column.
    const onStage = pole => ({ g: ctx, clip: pole.width < 1 ? pole : null });

    // Draw a pole's trails on from the angle each has reached (`ends`, past its start) to `to`, skipping those that
    // have not yet grown by a step, onto each target, and note where each now ends. A pole beyond the right edge is
    // the left one mirrored: its angles run the other way round.
    function arcs(pole, ends, to, cap, targets) {
      const sky = skyOf(pole.sky);
      const k = Math.max(0.75, Math.sqrt(Math.min(1, W / 1920)));   // thinner on a small stage, never hairlines
      const dim = thumbnail ? 1 : Math.min(1, H / REF_H / k);        // as much light over the stage, whatever its size
      const whole = pole.width === 1;
      const groups = groupsOf(sky, pole.cast, whole ? 1 : HALF_SKY, whole ? CAST_FLOOR.whole : CAST_FLOOR.half, k, dim);
      const mirror = pole.edge === 'right';
      const cx = mirror ? W - POLE.x * W : POLE.x * W, cy = POLE.y * H;
      const due = sky.stars.map(s => (to - ends[s.i]) * s.r >= STEP_PX || ends[s.i] === 0);
      targets.forEach(({ g: c, clip }) => {
        c.save();
        if (clip) {
          c.beginPath();
          c.rect(mirror ? W * (1 - clip.width) : 0, 0, W * clip.width, H);
          c.clip();
        }
        c.lineCap = cap;
        groups.forEach(grp => {
          let any = false;
          c.beginPath();
          grp.stars.forEach(s => {
            if (!due[s.i]) return;
            const a = mirror ? Math.PI - s.a - ends[s.i] : s.a + ends[s.i];
            const b = mirror ? Math.PI - s.a - to : s.a + to;
            c.moveTo(cx + s.r * Math.cos(a), cy + s.r * Math.sin(a));
            c.arc(cx, cy, s.r, a, b, mirror);
            any = true;
          });
          if (!any) return;
          c.strokeStyle = grp.style;
          c.lineWidth = grp.width;
          c.stroke();
        });
        c.restore();
      });
      sky.stars.forEach(s => { if (due[s.i]) ends[s.i] = to; });
    }

    // A free debate pole's own canvas: the part of the stage its stars can show in (HALF_SKY of it from its edge,
    // more than its column ever takes), at the stage canvas's pixel ratio, drawn on in stage coordinates.
    function layerFor(pole) {
      const ratio = canvas.width / W;
      const off = pole.edge === 'right' ? W * (1 - HALF_SKY) : 0;
      const c = document.createElement('canvas');
      c.className = 'dt-canvas-layer';
      c.width = Math.ceil(HALF_SKY * W * ratio);
      c.height = canvas.height;
      // Read from, never shown: kept in memory, so the flush below is cheap and the copy needs no read back.
      const g = c.getContext('2d', { willReadFrequently: true });
      g.setTransform(ratio, 0, 0, ratio, -off * ratio, 0);
      return { canvas: c, g, off, clip: null, pending: 0 };
    }

    // Where the two columns meet, in canvas pixels, for these column widths.
    function splitAt(poles, widths) {
      const i = poles.findIndex(p => p.edge === 'left');
      const leftWidth = i >= 0 ? widths[i] : 1 - widths[0];
      return Math.round(leftWidth * canvas.width);
    }

    // The stage made from the layers: each side's pixels copied from its own canvas, over the columns' new widths.
    // Only the strip the edge between them crossed changes hands (the rest of the stage already holds what the
    // layers hold), so a change of floor costs a copy of that strip, however long the trails have grown.
    function compose(poles, before) {
      const cw = canvas.width, ch = canvas.height;
      const split = splitAt(poles, poles.map(p => p.width));
      let x0 = 0, x1 = cw;
      if (before) {
        const was = splitAt(poles, before);
        x0 = Math.max(0, Math.min(was, split) - 2);
        x1 = Math.min(cw, Math.max(was, split) + 2);
      }
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'copy';   // the layer's pixels replace the stage's, with no blending
      poles.forEach((p, i) => {
        const L = layers[i];
        const a = p.edge === 'left' ? x0 : Math.max(x0, split), b = p.edge === 'left' ? Math.min(x1, split) : x1;
        const sx = a - Math.round(L.off / W * cw), w = Math.min(b - a, L.canvas.width - sx);
        if (w <= 0 || sx < 0) return;
        ctx.save();
        ctx.beginPath();
        ctx.rect(a, 0, w, ch);
        ctx.clip();   // 'copy' would clear the whole stage outside the copied part without it
        ctx.drawImage(L.canvas, sx, 0, w, ch, a, 0, w, ch);
        ctx.restore();
      });
      ctx.restore();
    }

    function dropLayers() {
      layers.forEach(L => { L.canvas.width = 0; L.canvas.height = 0; });
      layers = [];
    }

    return {
      // The whole sky when the scene changes, the canvas was resized or time went back; otherwise only the growth of
      // the trails since they were last drawn on, a trail at a time once it has grown by a step. In free debate each
      // side's trails also grow on a canvas of their own; when the floor changes and the columns move, the stage is
      // made again from those two canvases instead of every trail being painted again.
      frame(v) {
        if (!W || !H || !v) return;
        const sc = scene(v);
        const fresh = !drawn || drawn.key !== sc.key || sc.poles.some((p, i) => p.used < drawn.used[i]);
        if (fresh) {
          ctx.clearRect(0, 0, W, H);
          drawn = { key: sc.key, used: [], widths: [], ends: sc.poles.map(p => new Float64Array(skyOf(p.sky).stars.length)) };
          dropLayers();
          if (sc.dual) layers = sc.poles.map(layerFor);
        }
        const moved = !!sc.dual && (fresh || sc.poles.some((p, i) => p.width !== drawn.widths[i]));
        sc.poles.forEach((p, i) => {
          if (!fresh && p.used === drawn.used[i]) return;
          const targets = !sc.dual ? [onStage(p)] : moved ? [layers[i]] : [layers[i], onStage(p)];
          arcs(p, drawn.ends[i], theta(p.used), fresh ? 'round' : 'butt', targets);
          drawn.used[i] = p.used;
          // A canvas that is never shown keeps what is drawn on it as a list of strokes until it is read; left alone,
          // a whole stretch of one side's speech would be drawn at once, on the frame the floor changes. A read of one
          // pixel now and then draws it as it comes.
          if (sc.dual && ++layers[i].pending >= LAYER_FLUSH) {
            layers[i].g.getImageData(0, 0, 1, 1);
            layers[i].pending = 0;
          }
        });
        if (moved) compose(sc.poles, fresh ? null : drawn.widths);
        drawn.widths = sc.poles.map(p => p.width);
      },
      resize(w, h) { W = w; H = h; skies = {}; drawn = null; dropLayers(); },
      destroy() { skies = {}; drawn = null; dropLayers(); },
    };
  }

  DT.themes.register('startrail', { painter });
})(window.DT = window.DT || {});
