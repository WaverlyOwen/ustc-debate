/* render.js: the projected stage. Reads a View (engine.view) and writes text, attributes and CSS variables. */
(function (DT) {
  'use strict';
  const SIDE_NAME = { pro: '正方', con: '反方' };
  const BUILTIN_THEMES = ['hall', 'daylight', 'chroma'];   // used when build.py has not injected DT.THEMES
  const LONG_TITLE = 14;       // characters; longer stage names step the title down a size
  const ENTER_MS = 600;        // the entrance class outlives the longest entrance animation (560 ms)
  const TOAST_MS = 1500;
  const RING_MS = 1500;        // fallback removal when no animationend arrives (no stylesheet, animation off)
  const RING_GAP_MS = 320;     // the second ring of an end bell, in step with the double bell
  const BUMP_MS = 240;
  const ACTIVE_COL = 58;       // percent of the width the speaking half takes in a dual stage

  const CLOCK = '<span class="dt-digits"><span class="dt-sign"></span><span class="dt-min"></span>' +
    '<span class="dt-colon">:</span><span class="dt-sec"></span></span><span class="dt-state"></span>';
  const HALF = side => '<div class="dt-half" data-side="' + side + '"><div class="dt-half-field"></div>' +
    '<div class="dt-team"></div><div class="dt-clock" data-clock="' + side + '">' + CLOCK + '</div>' +
    '<div class="dt-floorline"></div></div>';
  // Static markup only; every piece of match or format text goes in through textContent.
  const TEMPLATE =
    '<div class="dt-backdrop"></div><div class="dt-deco stage-deco"></div><div class="dt-field"></div>' +
    '<div class="dt-warnline" hidden></div>' +
    '<header class="dt-top"><span class="dt-match"></span><span class="dt-format"></span></header>' +
    '<section class="dt-head"><h1 class="dt-title"></h1><p class="dt-speaker"></p></section>' +
    '<div class="dt-clock" data-clock="main">' + CLOCK + '</div>' +
    '<div class="dt-halves">' + HALF('pro') + HALF('con') + '</div>' +
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

  // An empty team name reads as the side itself.
  function teamName(match, side) {
    const name = String((match && match[side + 'Team']) || '').trim();
    return name || SIDE_NAME[side];
  }

  function themeOf(id) {
    const ids = Array.isArray(DT.THEMES) ? DT.THEMES.map(t => t.id) : BUILTIN_THEMES;
    return ids.indexOf(id) >= 0 ? id : 'hall';
  }

  // Digits tighten as time runs out; overtime and finished clocks stay tight; breaks never tense up.
  function tension(clock, kind) {
    if (!clock || kind === 'break') return 0;
    if (clock.phase === 'over' || clock.phase === 'done') return 1;
    return clamp01(1 - clock.fraction);
  }

  function stateText(clock, kind) {
    if (kind === 'dual' && clock.locked) return clock.yielded > 0 ? '已放弃' : '时间到';
    if (clock.running || !clock.active || clock.phase === 'done') return '';
    return clock.remaining !== clock.total ? '暂停' : '';
  }

  // Rounded to whole seconds for the record table.
  function duration(ms) { return DT.engine.fmt(Math.round(ms / 1000) * 1000); }

  function mount(host) {
    host.classList.add('dt-stage-host');
    const stage = document.createElement('div');
    stage.className = 'dt-stage';
    stage.innerHTML = TEMPLATE;
    const $ = sel => stage.querySelector(sel);
    const els = {
      field: $('.dt-field'), warnline: $('.dt-warnline'),
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
      el, sign: el.querySelector('.dt-sign'), min: el.querySelector('.dt-min'),
      sec: el.querySelector('.dt-sec'), state: el.querySelector('.dt-state'),
    });
    const clocks = { main: clockParts($('.dt-clock[data-clock="main"]')) };
    const halves = {};
    ['pro', 'con'].forEach(side => {
      const el = els.halves.querySelector('.dt-half[data-side="' + side + '"]');
      halves[side] = { el, team: el.querySelector('.dt-team') };
      clocks[side] = clockParts(el.querySelector('.dt-clock'));
    });
    const teamSpans = { pro: els.teams.querySelector('[data-side="pro"]'), con: els.teams.querySelector('[data-side="con"]') };
    host.appendChild(stage);

    const timers = new Set();
    let destroyed = false;
    let lastKey = null, lastSeat = null, progressSig = null, recordSig = null;
    let segs = [];
    let enterTimer = null, toastTimer = null;

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
      replay(stage, 'is-entering');
      cancel(enterTimer);
      enterTimer = later(() => { enterTimer = null; stage.classList.remove('is-entering'); }, ENTER_MS);
    }

    function paintClock(parts, clock, kind) {
      const over = clock.text.charAt(0) === '+';
      const hm = (over ? clock.text.slice(1) : clock.text).split(':');
      text(parts.sign, over ? '+' : '');
      text(parts.min, hm[0]);
      text(parts.sec, hm[1] || '');
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
      row(['环节', '计划', '实际', ''], 'th');
      record.forEach(r => {
        let note = '';
        if (r.over >= 1000) note = '超时 ' + duration(r.over);
        else if (r.yielded >= 1000) note = '放弃 ' + duration(r.yielded);
        const tr = row([r.name, DT.engine.fmt(r.planned), r.used > 0 ? duration(r.used) : '—', note], 'td');
        attr(tr, 'data-side', r.side || 'none');
        attr(tr, 'data-over', r.over >= 1000);
        attr(tr, 'data-skipped', r.used <= 0);
      });
    }

    function nextParts(v, idleSide) {
      if (idleSide) return ['空格开始', '先由' + SIDE_NAME[idleSide] + '发言', ''];
      if (!v.next) return ['', '', ''];
      const time = (v.next.type === 'dual' ? '各 ' : '') + DT.engine.fmt(v.next.secs * 1000);
      if (v.mode === 'title') return ['空格开始', '第一个环节：' + v.next.name, time];
      return ['下一环节', v.next.name, time];
    }

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
      attr(stage, 'data-theme', themeOf(v.theme));
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
        text(halves[side].team, name);
        attr(halves[side].team, 'data-label', label);
      });
      paintRecord(v.mode === 'end' && Array.isArray(v.record) ? v.record : null);
      paintProgress(v.progress || []);
      nextParts(v, idle ? st.first || 'pro' : null).forEach((s, i) => text(els.next[i], s));
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
      if (destroyed || !event || reducedMotion()) return;
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
      // 'switch' needs nothing extra: the halves' own transition is the animation.
    }

    function toast(message) {
      if (destroyed) return;
      cancel(toastTimer);
      text(els.toast, message || '');
      if (!message) { els.toast.classList.remove('is-shown'); return; }
      els.toast.classList.add('is-shown');
      toastTimer = later(() => { toastTimer = null; els.toast.classList.remove('is-shown'); }, TOAST_MS);
    }

    function destroy() {
      destroyed = true;
      timers.forEach(id => clearTimeout(id));
      timers.clear();
      stage.remove();
    }

    return { update, pulse, toast, destroy, el: stage };
  }

  DT.render = { mount };
})(window.DT = window.DT || {});
