/* render.js: the projected stage. Reads a View (engine.view) and writes text, attributes and CSS variables. */
(function (DT) {
  'use strict';
  const SIDE_NAME = { pro: '正方', con: '反方' };
  const BUILTIN_THEMES = ['hall', 'daylight', 'chroma'];   // used when build.py has not injected DT.THEMES
  const LONG_TITLE = 14;       // characters; longer stage names step the title down a size
  const LONG_TEAM = 12;        // characters; longer team names step down in a dual stage's half (and then clip)
  const ENTER_MS = 600;        // the entrance class outlives the longest entrance animation (560 ms)
  const TOAST_MS = 1500;
  const RING_MS = 1500;        // fallback removal when no animationend arrives (no stylesheet, animation off)
  const RING_GAP_MS = 320;     // the second ring of an end bell, in step with the double bell
  const BUMP_MS = 240;
  const ACTIVE_COL = 58;       // percent of the width the speaking half takes in a dual stage
  const FRAME_MS = 33;         // a theme's painter draws at most 30 frames a second
  const MOMENT_MS = 1200;      // how long an is-m-<moment> class stays, unless the theme sets --moment-ms

  const DIGITS = '<span class="dt-sign"></span><span class="dt-min"></span><span class="dt-colon">:</span>' +
    '<span class="dt-sec"></span>';
  // Two layers of the same digits: stage.css clips the second, in the on-field colour, to the field (spec §1.5).
  const CLOCK = '<span class="dt-digits">' + DIGITS + '</span>' +
    '<span class="dt-digits dt-digits-on" aria-hidden="true">' + DIGITS + '</span><span class="dt-state"></span>';
  const HALF = side => '<div class="dt-half" data-side="' + side + '"><div class="dt-half-field"></div>' +
    '<div class="dt-team"><span class="dt-team-name"></span></div><div class="dt-clock" data-clock="' + side + '">' + CLOCK + '</div>' +
    '<div class="dt-floorline"></div></div>';
  // Static markup only; every piece of match or format text goes in through textContent.
  const TEMPLATE =
    '<div class="dt-backdrop"></div><div class="dt-deco stage-deco"></div><div class="dt-field"></div>' +
    '<div class="dt-warnline" hidden></div>' +
    '<header class="dt-top"><span class="dt-match"></span><span class="dt-format"></span></header>' +
    '<section class="dt-head"><h1 class="dt-title"></h1><p class="dt-speaker"></p></section>' +
    '<div class="dt-clock" data-clock="main">' + CLOCK + '</div>' +
    '<div class="dt-halves">' + HALF('pro') + HALF('con') + '</div><div class="dt-deco-over"></div>' +
    '<section class="dt-card"><div class="dt-motions"><p class="dt-motion" data-side="pro"></p>' +
    '<p class="dt-motion" data-side="con"></p></div>' +
    '<div class="dt-teams"><span data-side="pro"></span><span data-side="con"></span></div>' +
    '<table class="dt-record" hidden></table></section>' +
    '<div class="dt-rings"></div>' +
    '<footer class="dt-bottom"><div class="dt-progress"></div><div class="dt-next">' +
    '<span class="dt-next-label"></span><span class="dt-next-name"></span><span class="dt-next-time"></span></div></footer>' +
    '<div class="dt-toast" role="status" aria-live="polite"></div>';

  // ---- small DOM helpers: write only when the value changes, so a per-frame update stays cheap ----

  function text(el, s) { if (el.textContent !== s) el.textContent = s; }

  function attr(el, name, value) {
    if (value === false || value === null || value === undefined) {
      if (el.hasAttribute(name)) el.removeAttribute(name);
    } else {
      const s = value === true ? '' : String(value);
      if (el.getAttribute(name) !== s) el.setAttribute(name, s);
    }
  }

  function cssVar(el, name, value) {
    const s = typeof value === 'number' ? String(Math.round(value * 10000) / 10000) : value;
    if (el.style.getPropertyValue(name) !== s) el.style.setProperty(name, s);
  }

  const clamp01 = x => Math.min(1, Math.max(0, x));
  const reducedMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  // A frozen demo (?demo=…&frozen=1) is a still for review: painters draw it as they would under reduced motion.
  const frozenPage = () => /[?&]frozen=1(?:&|$)/.test(window.location.search || '');

  // How fast the renderer's own timers run against the page clock: 1, or slower while tests/motion.py samples a
  // moment frame by frame (the ?test=1 hook slows DT.clock and the CSS animations to match).
  let rate = 1;

  // ---- the theme registry (spec §1.2): what themes/*.js add beyond their stylesheet ----
  // spec: {defs?: SVG markup put into the document once, painter?: (canvas, ctx, {thumbnail, reducedMotion,
  // frozen}) => {frame(view, now), resize(w, h), destroy(), moment?(name, detail)}, decorate?: (stageEl,
  // {thumbnail, reducedMotion, frozen}) => {update?(view), moment?(name, detail), destroy?()}}. resize gets the
  // stage's size in CSS pixels on a context already scaled to the canvas's pixel ratio; the renderer decides when
  // frame runs. decorate puts the theme's own elements into a stage and drives them at its moments (motion spec
  // §1.1); neither moment hook is called on a still stage, where those elements show their end state.
  const registry = {};

  // mulberry32; a string seed is hashed with 32-bit FNV-1a first. The only randomness a painter may use.
  function rng(seed) {
    let a;
    if (typeof seed === 'number') {
      a = seed >>> 0;
    } else {
      a = 0x811c9dc5;
      const s = String(seed);
      for (let i = 0; i < s.length; i++) { a ^= s.charCodeAt(i); a = Math.imul(a, 0x01000193); }
      a >>>= 0;
    }
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  DT.themes = {
    register(id, spec) { registry[id] = Object.assign({}, spec); },
    get(id) { return Object.prototype.hasOwnProperty.call(registry, id) ? registry[id] : null; },
    ids() { return Object.keys(registry); },
    rng,
  };

  // A theme's SVG defs go into the document the first time any stage there shows the theme.
  function injectDefs(doc, id) {
    const spec = DT.themes.get(id);
    if (!spec || !spec.defs || !doc.body) return;
    const boxes = doc.querySelectorAll('[data-dt-defs]');
    for (let i = 0; i < boxes.length; i++) if (boxes[i].getAttribute('data-dt-defs') === id) return;
    const box = doc.createElement('div');
    box.setAttribute('data-dt-defs', id);
    box.setAttribute('aria-hidden', 'true');
    box.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    box.innerHTML = spec.defs;
    doc.body.appendChild(box);
  }

  // An empty team name reads as the side itself.
  function teamName(match, side) {
    const name = String((match && match[side + 'Team']) || '').trim();
    return name || SIDE_NAME[side];
  }

  function themeOf(id) {
    const ids = Array.isArray(DT.THEMES) ? DT.THEMES.map(t => t.id) : BUILTIN_THEMES;
    return ids.indexOf(id) >= 0 ? id : 'hall';
  }

  // Digits tighten as time runs out; overtime and finished clocks stay tight; breaks never tense up. In steps of
  // 0.02, so --tension changes about every few seconds rather than every frame: each new value sets the digits'
  // font-variation-settings again, which lays the whole page out again (new spec §3, P5).
  function tension(clock, kind) {
    if (!clock || kind === 'break') return 0;
    if (clock.phase === 'over' || clock.phase === 'done') return 1;
    return Math.round(clamp01(1 - clock.fraction) * 50) / 50;
  }

  function stateText(clock, kind) {
    if (kind === 'dual' && clock.locked) return clock.yielded > 0 ? '已放弃' : '时间到';
    if (clock.running || !clock.active || clock.phase === 'done') return '';
    return clock.remaining !== clock.total ? '暂停' : '';
  }

  // Rounded to whole seconds for the record table.
  function duration(ms) { return DT.engine.fmt(Math.round(ms / 1000) * 1000); }

  // opts.thumbnail: a still preview (spec §3.2): no entrance, rings or toasts, and the painter draws once.
  function mount(host, opts) {
    const thumbnail = !!(opts && opts.thumbnail);
    host.classList.add('dt-stage-host');
    const stage = document.createElement('div');
    stage.className = 'dt-stage';
    stage.innerHTML = TEMPLATE;
    // A frozen demo's stage is a still: stage.css lands its transitions and animations at their ends.
    if (frozenPage()) stage.setAttribute('data-still', '');
    const $ = sel => stage.querySelector(sel);
    const els = {
      deco: $('.dt-deco'), field: $('.dt-field'), warnline: $('.dt-warnline'),
      match: $('.dt-match'), format: $('.dt-format'),
      title: $('.dt-title'), speaker: $('.dt-speaker'),
      halves: $('.dt-halves'),
      motions: { pro: $('.dt-motion[data-side="pro"]'), con: $('.dt-motion[data-side="con"]') },
      teams: $('.dt-teams'),
      record: $('.dt-record'), rings: $('.dt-rings'), progress: $('.dt-progress'),
      next: [$('.dt-next-label'), $('.dt-next-name'), $('.dt-next-time')],
      toast: $('.dt-toast'),
    };
    const clockParts = el => ({
      el, sign: el.querySelectorAll('.dt-sign'), min: el.querySelectorAll('.dt-min'),
      sec: el.querySelectorAll('.dt-sec'), state: el.querySelector('.dt-state'),
    });
    const clocks = { main: clockParts($('.dt-clock[data-clock="main"]')) };
    const halves = {};
    ['pro', 'con'].forEach(side => {
      const el = els.halves.querySelector('.dt-half[data-side="' + side + '"]');
      halves[side] = { el, team: el.querySelector('.dt-team'), teamName: el.querySelector('.dt-team-name') };
      clocks[side] = clockParts(el.querySelector('.dt-clock'));
    });
    const teamSpans = { pro: els.teams.querySelector('[data-side="pro"]'), con: els.teams.querySelector('[data-side="con"]') };
    host.appendChild(stage);

    const timers = new Set();
    let destroyed = false;
    let lastKey = null, lastSeat = null, progressSig = null, recordSig = null;
    let segs = [];
    let enterTimer = null, toastTimer = null;
    let theme = null;       // the theme on screen
    let paint = null;       // while that theme has a painter: its canvas, context, instance and frame bookkeeping
    let lastView = null, lastSig = null;
    let painterWarned = false;
    let deco = null, decoWarned = false;   // the theme's decorate instance, while it has one
    let was = null;                        // what the last update showed, to tell this one's moments from
    const momentTimers = {};               // per moment, the timer that takes its class off again

    function later(fn, ms) {
      const id = setTimeout(() => { timers.delete(id); fn(); }, ms / rate);
      timers.add(id);
      return id;
    }
    function cancel(id) { if (id !== null) { clearTimeout(id); timers.delete(id); } }

    // Restart a one-shot class animation: remove, force a reflow, add again.
    function replay(el, cls) {
      el.classList.remove(cls);
      void el.offsetWidth;
      el.classList.add(cls);
    }

    function enter() {
      if (thumbnail) return;
      replay(stage, 'is-entering');
      cancel(enterTimer);
      enterTimer = later(() => { enterTimer = null; stage.classList.remove('is-entering'); }, ENTER_MS);
    }

    function paintClock(parts, clock, kind) {
      const over = clock.text.charAt(0) === '+';
      const hm = (over ? clock.text.slice(1) : clock.text).split(':');
      const both = (list, s) => list.forEach(el => text(el, s));   // the digits and their on-field layer
      both(parts.sign, over ? '+' : '');
      both(parts.min, hm[0]);
      both(parts.sec, hm[1] || '');
      text(parts.state, stateText(clock, kind));
      attr(parts.el, 'data-phase', clock.phase);
      attr(parts.el, 'data-running', clock.running ? 'true' : 'false');
    }

    // Put the pro element first when the pro side sits on the left, last otherwise.
    function seatOrder(parent, proEl, conEl, seat) {
      const first = seat === 'right' ? conEl : proEl;
      if (parent.firstElementChild !== first) parent.insertBefore(first, parent.firstElementChild);
    }

    function paintProgress(progress) {
      const sig = progress.map(p => [p.side, p.type, p.block, p.extra].join(',')).join('|');
      if (sig !== progressSig) {
        progressSig = sig;
        els.progress.textContent = '';
        segs = progress.map((p, i) => {
          const seg = document.createElement('i');
          seg.className = 'dt-seg';
          attr(seg, 'data-side', p.side || 'none');
          attr(seg, 'data-block', p.block);
          attr(seg, 'data-kind', p.type);
          attr(seg, 'data-gap', i > 0 && p.block !== progress[i - 1].block);
          attr(seg, 'data-extra', p.extra);
          els.progress.appendChild(seg);
          return seg;
        });
      }
      progress.forEach((p, i) => attr(segs[i], 'data-state', p.state));
    }

    function paintRecord(record) {
      const sig = record ? JSON.stringify(record) : '';
      if (sig === recordSig) return;
      recordSig = sig;
      const table = els.record;
      table.textContent = '';
      attr(table, 'hidden', !record);
      if (!record) return;
      cssVar(table, '--rows', record.length + 1);
      const row = (cells, tag) => {
        const tr = document.createElement('tr');
        cells.forEach(c => { const td = document.createElement(tag); td.textContent = c; tr.appendChild(td); });
        table.appendChild(tr);
        return tr;
      };
      row(['环节', '计划', '实际', '备注'], 'th');
      record.forEach(r => {
        let note = '';
        if (r.over >= 1000) note = '超时 ' + duration(r.over);
        else if (r.yielded >= 1000) note = '放弃 ' + duration(r.yielded);
        const tr = row([r.name, DT.engine.fmt(r.planned), r.used > 0 ? duration(r.used) : '—', note], 'td');
        attr(tr, 'data-side', r.side || 'none');
        attr(tr, 'data-kind', r.type);   // a dual row is marked half and half, as on the progress bar
        attr(tr, 'data-over', r.over >= 1000);
        attr(tr, 'data-skipped', r.used <= 0);
      });
    }

    function nextParts(v, idleSide) {
      if (v.away) return ['比赛暂停', v.away, ''];   // a projector's title card while the console is away
      if (idleSide) return ['空格开始', '先由' + SIDE_NAME[idleSide] + '发言', ''];
      if (!v.next) return ['', '', ''];
      const time = (v.next.type === 'dual' ? '各 ' : '') + DT.engine.fmt(v.next.secs * 1000);
      if (v.mode === 'title') return ['空格开始', '第一个环节：' + v.next.name, time];
      return ['下一环节', v.next.name, time];
    }

    // ---- the theme's painter: its canvas sits above the backdrop and below the deco and the field ----

    // Size the canvas to the stage at up to 2x; true when the size changed (and the painter was told).
    function sizeCanvas() {
      const box = stage.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(box.width * ratio), h = Math.round(box.height * ratio);
      if (paint.sized && paint.canvas.width === w && paint.canvas.height === h) return false;
      paint.sized = true;
      paint.canvas.width = w;
      paint.canvas.height = h;
      if (paint.ctx) paint.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      if (!guard(() => paint.painter.resize(box.width, box.height))) return false;
      paint.dirty = true;
      return true;
    }

    // A painter is decoration: one that throws is stopped (said once in the console) and the theme carries on with
    // its stylesheet alone, so the digits, the bars and the rest of the frame keep updating.
    function guard(fn) {
      try {
        fn();
        return true;
      } catch (e) {
        if (!painterWarned) console.warn('主题画面出错，已停用画布，只保留样式：', e);
        painterWarned = true;
        stopPainter();
        return false;
      }
    }

    function startPainter(factory) {
      const canvas = document.createElement('canvas');
      canvas.className = 'dt-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      stage.insertBefore(canvas, els.deco);
      const ctx = canvas.getContext('2d');
      const flags = { thumbnail, reducedMotion: reducedMotion(), frozen: frozenPage() };
      paint = {
        canvas, ctx, painter: null,
        still: flags.thumbnail || flags.reducedMotion || flags.frozen,
        at: -Infinity, sig: null, dirty: true, sized: false, observer: null,
      };
      if (!guard(() => { paint.painter = factory(canvas, ctx, flags); })) return;
      if (!sizeCanvas() && !paint) return;
      if (typeof ResizeObserver === 'function') {
        paint.observer = new ResizeObserver(() => { if (paint && sizeCanvas() && lastView) draw(lastView, lastSig); });
        paint.observer.observe(stage);
      }
    }

    // A theme's decoration is as optional as its painter: one that throws is dropped (said once in the console).
    function decoCall(fn) {
      try {
        fn();
        return true;
      } catch (e) {
        if (!decoWarned) console.warn('主题装饰出错，已停用，只保留样式：', e);
        decoWarned = true;
        stopDecor();
        return false;
      }
    }

    function startDecor(factory) {
      const flags = { thumbnail, reducedMotion: reducedMotion(), frozen: frozenPage() };
      decoCall(() => { deco = factory(stage, flags) || null; });
    }

    function stopDecor() {
      if (!deco) return;
      const d = deco;
      deco = null;
      try {
        if (typeof d.destroy === 'function') d.destroy();
      } catch (e) { /* it is going anyway */ }
    }

    function stopPainter() {
      if (!paint) return;
      const p = paint;
      paint = null;
      if (p.observer) p.observer.disconnect();
      try {
        if (p.painter) p.painter.destroy();
      } catch (e) { /* it is going anyway */ }
      p.canvas.remove();
    }

    function useTheme(id) {
      if (id === theme) return;
      theme = id;
      stopPainter();
      stopDecor();
      injectDefs(stage.ownerDocument, id);
      const spec = DT.themes.get(id);
      if (spec && typeof spec.painter === 'function') startPainter(spec.painter);
      if (spec && typeof spec.decorate === 'function') startDecor(spec.decorate);
    }

    // Animated: at most one frame per FRAME_MS. Still (thumbnail, reduced motion, frozen demo): a frame when the
    // painter starts, when the stage is resized and when what is on screen changes. Never while the page is hidden.
    function draw(v, sig) {
      if (!paint || stage.ownerDocument.hidden) return;
      const now = DT.clock.now();
      if (paint.still ? !paint.dirty && sig === paint.sig : now - paint.at < FRAME_MS) return;
      paint.at = now;
      paint.sig = sig;
      paint.dirty = false;
      guard(() => paint.painter.frame(v, now));
    }

    // A frame skipped while the page was hidden (a thumbnail drawn in a background tab, say) is drawn when it shows:
    // a still painter would otherwise wait for the next change on screen.
    function onVisible() {
      if (!destroyed && paint && lastView && !stage.ownerDocument.hidden && (paint.dirty || paint.sig !== lastSig)) {
        draw(lastView, lastSig);
      }
    }
    stage.ownerDocument.addEventListener('visibilitychange', onVisible);

    function update(v) {
      if (destroyed || !v) return;
      const st = v.mode === 'stage' ? v.stage : null;
      const kind = st ? st.type : 'break';
      const seat = v.proSeat === 'right' ? 'right' : 'left';
      const match = v.match || {};

      const key = v.mode + '|' + (st ? st.id : '');
      if (key !== lastKey) { lastKey = key; enter(); }
      if (seat !== lastSeat) {
        lastSeat = seat;
        seatOrder(els.halves, halves.pro.el, halves.con.el, seat);
        seatOrder(els.teams, teamSpans.pro, teamSpans.con, seat);
      }

      const active = kind === 'dual' ? v.clocks.find(c => c.active) || null : v.clocks[0] || null;
      const idle = kind === 'dual' && !active;
      attr(stage, 'data-mode', v.mode);
      attr(stage, 'data-kind', kind);
      attr(stage, 'data-side', (active && kind !== 'break' && active.side) || 'none');
      attr(stage, 'data-phase', active ? active.phase : 'calm');
      attr(stage, 'data-running', v.running ? 'true' : 'false');
      const themeId = themeOf(v.theme);
      attr(stage, 'data-theme', themeId);
      useTheme(themeId);
      attr(stage, 'data-pro-seat', seat);
      attr(stage, 'data-long', st && Array.from(st.name).length > LONG_TITLE ? 'true' : 'false');
      cssVar(stage, '--used', kind !== 'dual' && active ? 1 - active.fraction : 0);
      cssVar(stage, '--tension', tension(active, kind));
      cssVar(stage, '--warn-at', v.warnAt || 0);
      attr(els.warnline, 'hidden', !st || v.warnAt === null || v.warnAt === undefined);

      text(els.match, match.title || '');
      text(els.format, v.formatName || '');
      text(els.title, st ? st.name : v.mode === 'end' ? '比赛结束' : '');
      text(els.speaker, st ? st.speaker : '');

      if (st && kind !== 'dual') paintClock(clocks.main, active, kind);
      if (kind === 'dual') {
        attr(els.halves, 'data-idle', idle);
        const leftSide = seat === 'left' ? 'pro' : 'con';
        const leftCol = idle ? 50 : active.side === leftSide ? ACTIVE_COL : 100 - ACTIVE_COL;
        cssVar(els.halves, '--left-col', leftCol + '%');
        cssVar(els.halves, '--right-col', (100 - leftCol) + '%');
        v.clocks.forEach(c => {
          const h = halves[c.id];
          attr(h.el, 'data-active', !idle && c.active);
          attr(h.el, 'data-locked', c.locked);
          cssVar(h.el, '--remain', c.locked ? 0 : c.fraction);
          cssVar(h.el, '--tension', tension(c, kind));
          paintClock(clocks[c.id], c, kind);
        });
      }

      ['pro', 'con'].forEach(side => {
        const motion = String(match[side + 'Motion'] || '');
        text(els.motions[side], motion);
        attr(els.motions[side], 'hidden', !motion);
        // The side label is drawn by CSS from data-label; it is left out when the name already is the side.
        const name = teamName(match, side);
        const label = name === SIDE_NAME[side] ? '' : SIDE_NAME[side];
        text(teamSpans[side], name);
        attr(teamSpans[side], 'data-label', label);
        text(halves[side].teamName, name);   // its own box, so a long name ends in an ellipsis
        attr(halves[side].team, 'data-label', label);
        attr(halves[side].team, 'data-long', Array.from(name).length > LONG_TEAM ? 'true' : 'false');
      });
      paintRecord(v.mode === 'end' && Array.isArray(v.record) ? v.record : null);
      paintProgress(v.progress || []);
      nextParts(v, idle ? st.first || 'pro' : null).forEach((s, i) => text(els.next[i], s));

      // What a still painter redraws for: the stage, its phase, who holds the floor and where the sides sit.
      lastView = v;
      lastSig = [key, active ? active.phase : '', active ? active.side : '', seat].join('|');
      draw(v, lastSig);
      if (deco && typeof deco.update === 'function') decoCall(() => deco.update(v));

      const shown = {
        key, card: v.mode !== 'stage' || kind === 'break', running: !!v.running,
        side: active ? active.side : null, clock: active ? active.id : null, phase: active ? active.phase : null,
        locked: kind === 'dual' ? v.clocks.filter(c => c.locked).map(c => c.id) : [],
      };
      momentsBetween(was, shown).forEach(m => moment(m[0], m[1]));
      was = shown;
    }

    // The moments a view brings (motion spec §1.1): a new stage or card enters; on the same one, a clock that starts
    // or stops (not one that ran out), a change of floor, a dual side that locks, a single clock going into overtime.
    // warn, count and end come from pulse.
    function momentsBetween(a, b) {
      const here = { side: b.side, clock: b.clock };
      if (!a || a.key !== b.key) return b.card ? [['enter', here], ['title', here]] : [['enter', here]];
      const out = [];
      if (b.running && !a.running) out.push(['start', here]);
      else if (!b.running && a.running && b.phase !== 'done') out.push(['pause', here]);
      // Switch before lock: a yield both hands over and locks, and data-m-side then names the side that locked.
      if (a.side && b.side && a.side !== b.side) out.push(['switch', here]);
      b.locked.forEach(id => { if (a.locked.indexOf(id) < 0) out.push(['lock', { side: id, clock: id }]); });
      if (b.phase === 'over' && a.phase !== 'over') out.push(['over', here]);
      return out;
    }

    // A theme may hold its moment classes longer or shorter with --moment-ms (a number of ms, or seconds with s).
    function momentMs() {
      const raw = getComputedStyle(stage).getPropertyValue('--moment-ms').trim();
      const n = parseFloat(raw);
      if (!(n > 0)) return MOMENT_MS;
      return /[^m]s$/.test(raw) ? n * 1000 : n;
    }

    // One moment of the motion vocabulary: its class replayed on the stage for --moment-ms, its side in
    // data-m-side, and the theme's decoration and painter told. Nothing on a still stage (thumbnail, frozen demo,
    // reduced motion), where the theme's elements stay at their end state.
    function moment(name, detail) {
      if (destroyed || thumbnail || frozenPage() || reducedMotion()) return;
      const d = { side: (detail && detail.side) || null, clock: (detail && detail.clock) || null,
        key: (detail && detail.key) || null };
      const cls = 'is-m-' + name;
      attr(stage, 'data-m-side', d.side || 'none');
      replay(stage, cls);
      cancel(momentTimers[name] || null);
      momentTimers[name] = later(() => { delete momentTimers[name]; stage.classList.remove(cls); }, momentMs());
      if (deco && typeof deco.moment === 'function') decoCall(() => deco.moment(name, d));
      if (paint && paint.painter && typeof paint.painter.moment === 'function') guard(() => paint.painter.moment(name, d));
    }

    // The side a bell's clock speaks for: a dual clock is its side; the main clock is the stage's.
    function sideOf(clockId) {
      if (clockId === 'pro' || clockId === 'con') return clockId;
      const c = lastView && (lastView.clocks || []).find(x => x.id === clockId);
      return (c && c.side) || null;
    }

    // A ring centred on the digits of the clock that rang.
    function ring(clockId) {
      if (destroyed) return;
      const parts = clocks[clockId] || clocks.main;
      const box = stage.getBoundingClientRect();
      const r = parts.el.querySelector('.dt-digits').getBoundingClientRect();
      const x = box.width && r.width ? (r.left + r.width / 2 - box.left) / box.width * 100 : 50;
      const y = box.height && r.height ? (r.top + r.height / 2 - box.top) / box.height * 100 : 50;
      const el = document.createElement('i');
      el.className = 'dt-ring';
      el.style.left = x + '%';
      el.style.top = y + '%';
      let fallback = null;
      const done = () => { cancel(fallback); el.remove(); };
      el.addEventListener('animationend', done);
      fallback = later(done, RING_MS);
      els.rings.appendChild(el);
    }

    function pulse(event) {
      if (destroyed || thumbnail || !event || reducedMotion()) return;
      // 'switch' is not one here: update sees the floor change, on this page and on a projector alike.
      if (event.type === 'warn' || event.type === 'count' || event.type === 'end') {
        moment(event.type, { side: sideOf(event.clock), clock: event.clock, key: event.key });
      }
      if (event.type === 'count') {
        const parts = clocks[event.clock] || clocks.main;
        replay(parts.el, 'is-bump');
        later(() => parts.el.classList.remove('is-bump'), BUMP_MS);
      } else if (event.type === 'warn') {
        ring(event.clock);
      } else if (event.type === 'end') {
        ring(event.clock);
        later(() => ring(event.clock), RING_GAP_MS);
      }
      // 'switch' needs no ring: the halves' own transition is the animation.
    }

    function toast(message) {
      if (destroyed || thumbnail) return;
      cancel(toastTimer);
      text(els.toast, message || '');
      if (!message) { els.toast.classList.remove('is-shown'); return; }
      els.toast.classList.add('is-shown');
      toastTimer = later(() => { toastTimer = null; els.toast.classList.remove('is-shown'); }, TOAST_MS);
    }

    function destroy() {
      destroyed = true;
      stage.ownerDocument.removeEventListener('visibilitychange', onVisible);
      stopPainter();
      stopDecor();
      timers.forEach(id => clearTimeout(id));
      timers.clear();
      stage.remove();
    }

    return { update, pulse, toast, moment, destroy, el: stage };
  }

  // tests/motion.py (through the ?test=1 hook): the renderer's timers run at this fraction of real time.
  function setRate(r) { rate = r > 0 && isFinite(r) ? r : 1; }

  DT.render = { mount, setRate };
})(window.DT = window.DT || {});
