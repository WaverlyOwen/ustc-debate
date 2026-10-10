/* render.js: the projected stage. Reads a View (engine.view) and writes text, attributes and CSS variables. */
(function (DT) {
  'use strict';
  const SIDE_NAME = { pro: '正方', con: '反方' };
  const BUILTIN_THEMES = ['hall', 'daylight', 'chroma'];   // used when build.py has not injected DT.THEMES
  const LONG_TITLE = 14;       // characters; longer stage names step the title down a size
  const LONG_TEAM = 12;        // characters; longer team names step down in a dual stage's half (and then clip)
  const ENTER_MS = 1100;       // the entrance class outlives the longest entrance animation (a theme's, up to 1000 ms)
  const TOAST_MS = 1500;
  const RING_MS = 1500;        // fallback removal when no animationend arrives (no stylesheet, animation off); also how
                               // long the stage says which bell rang (data-bell)
  const RING_GAP_MS = 320;     // the second ring of an end bell, in step with the double bell
  const RING_REACH = 1.65;     // the scale a ring grows to (stage.css); a half's ring may stop short of it
  const BUMP_MS = 240;
  const LOCKING_MS = 1000;     // how long a half that has just run out or yielded carries data-locking
  const ACTIVE_COL = 58;       // percent of the width the speaking half takes in a dual stage
  const STEPS = 2000;          // --used and --remain move in steps of 1/2000: about a pixel of a 1920 px stage
  const FRAME_MS = 33;         // a theme's painter draws at most 30 frames a second

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
  const quantize = x => Math.round(x * STEPS) / STEPS;
  const reducedMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  // A frozen demo (?demo=…&frozen=1) is a still for review: painters draw it as they would under reduced motion.
  const frozenPage = () => /[?&]frozen=1(?:&|$)/.test(window.location.search || '');

  // ---- the theme registry (spec §1.2): what themes/*.js add beyond their stylesheet ----
  // spec: {defs?: SVG markup put into the document once, painter?: (canvas, ctx, {thumbnail, reducedMotion,
  // frozen}) => {frame(view, now), resize(w, h), destroy()}}. resize gets the stage's size in CSS pixels on a
  // context already scaled to the canvas's pixel ratio; the renderer decides when frame runs.
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

  // The whole seconds a clock shows (m:ss rounds up while time remains); overtime counts as none left.
  const wholeSecs = clock => Math.max(0, Math.ceil(clock.remaining / 1000));
  const totalSecs = clock => Math.max(1, Math.ceil(clock.total / 1000));

  // Digits tighten as time runs out; overtime and finished clocks stay tight; breaks never tense up. By the whole
  // second shown, so --tension changes once a second, on the frame the digits change, never between ticks: each new
  // value sets the digits' font-variation-settings again, which lays the whole page out again (new spec §3, P5).
  function tension(clock, kind) {
    if (!clock || kind === 'break') return 0;
    if (clock.phase === 'over' || clock.phase === 'done') return 1;
    return clamp01(1 - wholeSecs(clock) / totalSecs(clock));
  }

  function stateText(clock, kind) {
    if (kind === 'dual' && clock.locked) return clock.yielded > 0 ? '已放弃' : '时间到';
    if (clock.running || !clock.active || clock.phase === 'done') return '';
    return clock.remaining !== clock.total ? '暂停' : '';
  }

  // Rounded to whole seconds for the record table.
  function duration(ms) { return DT.engine.fmt(Math.round(ms / 1000) * 1000); }

  // opts.thumbnail: a still preview (spec §3.2): no entrance, rings or toasts, the painter draws once, and stage.css
  // stands it still.
  function mount(host, opts) {
    const thumbnail = !!(opts && opts.thumbnail);
    host.classList.add('dt-stage-host');
    const stage = document.createElement('div');
    stage.className = 'dt-stage';
    stage.innerHTML = TEMPLATE;
    // A frozen demo's stage and a thumbnail are stills: stage.css lands their transitions and animations at their ends.
    if (frozenPage() || thumbnail) stage.setAttribute('data-still', '');
    const $ = sel => stage.querySelector(sel);
    const els = {
      deco: $('.dt-deco'), field: $('.dt-field'), warnline: $('.dt-warnline'),
      match: $('.dt-match'), format: $('.dt-format'),
      title: $('.dt-title'), speaker: $('.dt-speaker'),
      halves: $('.dt-halves'),
      motions: { pro: $('.dt-motion[data-side="pro"]'), con: $('.dt-motion[data-side="con"]') },
      teams: $('.dt-teams'),
      record: $('.dt-record'), progress: $('.dt-progress'),
      next: [$('.dt-next-label'), $('.dt-next-name'), $('.dt-next-time')],
      toast: $('.dt-toast'),
    };
    // bell: the glyphs' geometry measured for this clock's last bell, which an end bell's second ring reuses.
    const clockParts = el => ({
      el, sign: el.querySelectorAll('.dt-sign'), min: el.querySelectorAll('.dt-min'),
      sec: el.querySelectorAll('.dt-sec'), colons: el.querySelectorAll('.dt-colon'),
      state: el.querySelector('.dt-state'), bell: null,
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
    let enterTimer = null, toastTimer = null, bellTimer = null;
    let lockSeen = null;    // the halves' locked state as last painted, and on which stage: {key, pro, con}
    const lockTimers = { pro: null, con: null };
    let theme = null;       // the theme on screen
    let paint = null;       // while that theme has a painter: its canvas, context, instance and frame bookkeeping
    let lastView = null, lastSig = null;
    let painterWarned = false;

    function later(fn, ms) {
      const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
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
      attr(parts.el, 'data-long', hm[0].length > 1 ? '' : null);   // two-digit minutes (stage.css seats the sign)
      // 「暂停」 keeps its word (stage.css :empty::before) while it fades on resume; a locked side's word never lingers.
      const word = stateText(clock, kind);
      if (word) attr(parts.state, 'data-was', word === '暂停' ? word : '');
      text(parts.state, word);
      attr(parts.el, 'data-phase', clock.phase);
      const wasRunning = parts.el.getAttribute('data-running') === 'true';
      if (clock.running && !wasRunning) beat(parts, clock);
      attr(parts.el, 'data-running', clock.running ? 'true' : 'false');
    }

    // A clock that stops takes its colon's breath away (stage.css), and the colon settles to rest from where the breath
    // was: each colon's live opacity, read while the breath still runs, is the settle's from (--colon-from). `list`
    // pairs each clock about to be painted with what it will show. update() calls this before it writes anything, so
    // the read (a style flush) finds nothing half-written: part way through, it would split the update's changes in
    // two, and a transition one of them starts (a waiting half's digit colour) would not reach what inherits it (the
    // half's colon).
    function settle(list) {
      const stopping = list.filter(([parts, clock]) =>
        clock && !clock.running && parts.el.getAttribute('data-running') === 'true');
      const from = stopping.map(([parts]) => Array.from(parts.colons, colon => getComputedStyle(colon).opacity));
      stopping.forEach(([parts], i) => parts.colons.forEach((colon, j) => cssVar(colon, '--colon-from', from[i][j])));
    }

    // A clock that starts or resumes breathes its colon in step with the seconds: the breath (1000 ms, at full strength
    // at the start of each cycle) peaks as the digits change. The breath starts with the clock (stage.css), so its delay
    // is -(1000 - ms to the next tick), a new stage's 0 ms, for every colon of the clock. It is written before the clock
    // says it runs, so the breath is made with it: a delay changed while the new breath and the colon's wake are still
    // pending leaves the wake out of their first frame, and the colon would flash to the breath's value.
    function beat(parts, clock) {
      const rem = clock.remaining;
      const toTick = rem >= 0 ? rem % 1000 || 1000 : 1000 - (-rem % 1000);
      cssVar(parts.el, '--beat-delay', -Math.round(1000 - toTick) + 'ms');
    }

    // A half seen to run out or yield on the stage it was painted on carries data-locking for LOCKING_MS, for a theme's
    // one-shot. A stage that opens with a half already locked, the first paint after mounting and a thumbnail do not.
    function noteLocks(key, list) {
      const seen = lockSeen && lockSeen.key === key ? lockSeen : null;
      lockSeen = { key };
      list.forEach(c => {
        lockSeen[c.id] = c.locked;
        if (thumbnail || !seen || seen[c.id] !== false || !c.locked) return;
        const el = halves[c.id].el;
        attr(el, 'data-locking', true);
        cancel(lockTimers[c.id]);
        lockTimers[c.id] = later(() => { lockTimers[c.id] = null; attr(el, 'data-locking', false); }, LOCKING_MS);
      });
    }

    function clearLocking() {
      lockSeen = null;
      ['pro', 'con'].forEach(side => {
        cancel(lockTimers[side]);
        lockTimers[side] = null;
        attr(halves[side].el, 'data-locking', false);
      });
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
      injectDefs(stage.ownerDocument, id);
      const spec = DT.themes.get(id);
      if (spec && typeof spec.painter === 'function') startPainter(spec.painter);
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
      const active = kind === 'dual' ? v.clocks.find(c => c.active) || null : v.clocks[0] || null;
      const idle = kind === 'dual' && !active;
      settle(kind === 'dual' ? v.clocks.map(c => [clocks[c.id], c]) : st ? [[clocks.main, active]] : []);

      const key = v.mode + '|' + (st ? st.id : '');
      if (key !== lastKey) { lastKey = key; clearLocking(); enter(); }
      if (seat !== lastSeat) {
        lastSeat = seat;
        seatOrder(els.halves, halves.pro.el, halves.con.el, seat);
        seatOrder(els.teams, teamSpans.pro, teamSpans.con, seat);
      }

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
      cssVar(stage, '--used', kind !== 'dual' && active ? quantize(1 - active.fraction) : 0);
      cssVar(stage, '--tension', tension(active, kind));
      // Whole seconds left on the clock that holds the floor, and its length: they change once a second.
      cssVar(stage, '--secs', active ? wholeSecs(active) : 0);
      cssVar(stage, '--secs-total', active ? totalSecs(active) : 0);
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
          cssVar(h.el, '--remain', c.locked ? 0 : quantize(c.fraction));
          cssVar(h.el, '--tension', tension(c, kind));
          cssVar(h.el, '--secs', wholeSecs(c));
          cssVar(h.el, '--secs-total', totalSecs(c));
          paintClock(clocks[c.id], c, kind);
        });
        noteLocks(key, v.clocks);
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
    }

    // The glyphs of a clock as the room sees them: the union of its off-field layer's parts that have a box (an
    // empty sign has none), or the clock's own box when none has. In stage percent: w of the width; h, and dy (the
    // glyphs' centre below the clock's, which the digits' .07em drop puts there), of the height.
    function measureBell(parts) {
      const box = stage.getBoundingClientRect();
      const own = parts.el.getBoundingClientRect();
      let u = null;
      parts.el.querySelectorAll('.dt-digits:not(.dt-digits-on) > span').forEach(span => {
        const r = span.getBoundingClientRect();
        if (!r.width || !r.height) return;
        u = u ? { left: Math.min(u.left, r.left), top: Math.min(u.top, r.top), right: Math.max(u.right, r.right),
          bottom: Math.max(u.bottom, r.bottom) } : { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      });
      if (!u) u = { left: own.left, top: own.top, right: own.right, bottom: own.bottom };
      const x = box.width ? 100 / box.width : 0, y = box.height ? 100 / box.height : 0;
      const dy = ((u.top + u.bottom) - (own.top + own.bottom)) / 2;
      return { w: (u.right - u.left) * x, h: (u.bottom - u.top) * y, dy: dy * y };
    }

    // How far a half's ring may grow and still stay inside its column (96% of it), as the column will be once the
    // bell's switch, if any, has sprung: a warn bell rings for the half holding the floor; a side that runs out
    // hands the floor over, unless the other side is out already and the columns stay as they are.
    function reach(id, type, g) {
      const box = stage.getBoundingClientRect();
      const other = lastView && lastView.clocks ? lastView.clocks.find(c => c.id !== id) : null;
      const col = type === 'end' && !(other && other.locked) ? 100 - ACTIVE_COL : ACTIVE_COL;
      const ringW = (g.w * box.width + 3 * box.height) / 100;   // stage.css: --bell-w × 1cqw + 3cqh
      return ringW > 0 ? Math.min(RING_REACH, .96 * col * box.width / 100 / ringW) : RING_REACH;
    }

    // A ring inside the clock that rang, under its digits and sized from their glyphs (stage.css). The second ring of
    // an end bell reuses the first's measure, so the two are concentric whatever the sign or a lock has done since.
    function ring(id, type, nth) {
      if (destroyed) return;
      const parts = clocks[id];
      const g = nth > 1 && parts.bell ? parts.bell : (parts.bell = measureBell(parts));
      const el = document.createElement('i');
      el.className = 'dt-ring';
      attr(el, 'data-type', type);
      attr(el, 'data-nth', nth);
      attr(el, 'data-side', id !== 'main' ? id : (lastView && lastView.stage && lastView.stage.side) || 'none');
      cssVar(el, '--bell-w', g.w);
      cssVar(el, '--bell-h', g.h);
      cssVar(el, '--bell-dy', g.dy);
      if (id !== 'main') cssVar(el, '--ring-to', reach(id, type, g));
      let fallback = null;
      const done = () => { cancel(fallback); el.remove(); };
      el.addEventListener('animationend', done);
      fallback = later(done, RING_MS);
      parts.el.appendChild(el);
    }

    // Which bell rang and on which clock, on the stage for RING_MS, for a theme's one-shot (a plate's edge flashing).
    function markBell(type, id) {
      attr(stage, 'data-bell', type);
      attr(stage, 'data-bell-clock', id);
      cancel(bellTimer);
      bellTimer = later(() => {
        bellTimer = null;
        attr(stage, 'data-bell', false);
        attr(stage, 'data-bell-clock', false);
      }, RING_MS);
    }

    function pulse(event) {
      if (destroyed || thumbnail || !event || reducedMotion()) return;
      const id = clocks[event.clock] ? event.clock : 'main';
      if (event.type === 'count' || event.type === 'warn' || event.type === 'end') markBell(event.type, id);
      if (event.type === 'count') {
        const parts = clocks[id];
        replay(parts.el, 'is-bump');
        later(() => parts.el.classList.remove('is-bump'), BUMP_MS);
      } else if (event.type === 'warn') {
        ring(id, 'warn', 1);
      } else if (event.type === 'end') {
        ring(id, 'end', 1);
        // A free-debate side that runs out rings once, as the floor goes over at the same moment (spec §5.5); a single
        // stage's end rings twice, in step with the double bell.
        if (id === 'main') later(() => ring(id, 'end', 2), RING_GAP_MS);
      }
      // 'switch' needs nothing extra: the halves' own transition is the animation.
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
      timers.forEach(id => clearTimeout(id));
      timers.clear();
      stage.remove();
    }

    return { update, pulse, toast, destroy, el: stage };
  }

  DT.render = { mount };
})(window.DT = window.DT || {});
