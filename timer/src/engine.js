/* engine.js: pure timing engine for the debate timer. No DOM; never reads the clock itself. */
(function (DT) {
  'use strict';
  const HISTORY_MAX = 100;
  const STALE_MS = 1500;
  const DEFAULT_BELLS = Object.freeze({ warn: Object.freeze([30]), countdown: 0, end: 'double' });
  const BREAK_BELLS = Object.freeze({ warn: Object.freeze([]), countdown: 0, end: 'chime' });
  const END_SOUND = { double: 'double', triple: 'triple', long: 'long', chime: 'chime', none: null };
  const SIDE_NAME = { pro: '正方', con: '反方' };
  const NOT_DUAL = '这个环节只有一个计时器';
  const clone = v => JSON.parse(JSON.stringify(v));
  const other = side => (side === 'pro' ? 'con' : 'pro');

  // DT.clock: the single time source for callers (UI, bells). Engine functions take `now` instead.
  const defaultNow = () => performance.timeOrigin + performance.now();
  let nowFn = defaultNow;
  DT.clock = { now: () => nowFn(), set(fn) { nowFn = fn; }, reset() { nowFn = defaultNow; } };

  // ---- bells ----

  function mergeBells(base, over) {
    const b = { warn: base.warn.slice(), countdown: base.countdown, end: base.end };
    if (!over) return b;
    if (Array.isArray(over.warn)) b.warn = over.warn.slice();
    if (typeof over.countdown === 'number') b.countdown = over.countdown;
    if (typeof over.end === 'string') b.end = over.end;
    return b;
  }

  // Built-in default <- format bells <- stage bells. Breaks ignore the format and start from BREAK_BELLS.
  function effectiveBells(format, stage) {
    const base = stage && stage.type === 'break' ? BREAK_BELLS : mergeBells(DEFAULT_BELLS, format && format.bells);
    return mergeBells(base, stage && stage.bells);
  }

  // Every bell point of one clock, latest-remaining first: w<t>, c<n>…c1, end.
  function bellPoints(bells) {
    const pts = Array.from(new Set(bells.warn || [])).map(t => ({ key: 'w' + t, ms: t * 1000, type: 'warn' }));
    for (let n = bells.countdown || 0; n >= 1; n--) pts.push({ key: 'c' + n, ms: n * 1000, type: 'count' });
    pts.push({ key: 'end', ms: 0, type: 'end' });
    return pts.sort((a, b) => b.ms - a.ms);
  }

  function soundOf(point, bells) {
    if (point.type === 'warn') return 'ding';
    if (point.type === 'count') return 'tick';
    return Object.prototype.hasOwnProperty.call(END_SOUND, bells.end) ? END_SOUND[bells.end] : 'double';
  }

  // ---- runs and clocks ----

  function newRun(stage) {
    const ms = stage.secs * 1000;
    const dual = stage.type === 'dual';
    return {
      kind: stage.type,
      clocks: dual ? { pro: { total: ms, used: 0 }, con: { total: ms, used: 0 } } : { main: { total: ms, used: 0 } },
      active: dual ? null : 'main',
      running: false,
      since: null,
      locked: { pro: false, con: false },
      yielded: { pro: 0, con: 0 },
      fired: { main: [], pro: [], con: [] },
      done: false,
    };
  }

  // Only a single stage runs into overtime; a dual side or a break that ran out before the next tick reads 0.
  function remaining(run, id, now) {
    const c = run.clocks[id];
    const left = c.total - c.used - (run.running && run.active === id ? now - run.since : 0);
    return run.kind === 'single' ? left : Math.max(0, left);
  }

  // Settle the running clock's time into `used`; it keeps running from `now`.
  function commit(run, now) {
    if (!run.running || !run.active) return;
    run.clocks[run.active].used += now - run.since;
    run.since = now;
  }

  function stop(run, now) {
    commit(run, now);
    run.running = false;
    run.since = null;
  }

  function start(run, id, now) {
    commit(run, now);
    run.active = id;
    run.running = true;
    run.since = now;
  }

  // ---- session plumbing ----

  function createSession(format, match, now, opts) {
    const f = clone(format);
    const extrasUsed = {};
    (f.extras || []).forEach(g => { extrasUsed[g.group] = { pro: 0, con: 0 }; });
    return {
      schema: 1,
      id: 's-' + Math.floor(now).toString(36) + Math.random().toString(36).slice(2, 6),
      createdAt: now,
      match: clone(match || {}),
      format: f,
      theme: (opts && opts.theme) || f.theme || 'hall',
      timeline: clone(f.stages),
      cursor: -1,
      runs: {},
      extrasUsed,
      history: [],
      lastFeedback: null,
    };
  }

  function currentStage(session) {
    return session.timeline[session.cursor] || null;
  }

  function getRun(session, stageId) {
    const st = stageId == null ? currentStage(session) : session.timeline.find(x => x.id === stageId);
    if (!st) return null;
    return session.runs[st.id] || newRun(st);
  }

  function strip(session) {
    const o = Object.assign({}, session);
    delete o.history;
    return o;
  }

  // Start an undoable action: a fresh copy with the old session (minus history) pushed onto history.
  function begin(session) {
    const snap = clone(strip(session));
    snap.lastFeedback = null;
    const s = clone(snap);
    s.history = (session.history || []).concat([snap]).slice(-HISTORY_MAX);
    return s;
  }

  // An action that does not apply: a copy with only the feedback set, nothing pushed onto history.
  function refuse(session, code, message) {
    const s = clone(strip(session));
    s.history = (session.history || []).slice();
    s.lastFeedback = code ? { code, message } : null;
    return s;
  }

  const noop = session => refuse(session, null);

  function refuseLocked(session, run, side) {
    return refuse(session, 'locked', SIDE_NAME[side] + (run.yielded[side] > 0 ? '已放弃剩余时间' : '时间已用完'));
  }

  // Apply fn to the current stage's run inside an undoable action.
  function edit(session, fn) {
    const s = begin(session);
    const st = currentStage(s);
    const run = s.runs[st.id] || newRun(st);
    fn(run, s);
    s.runs[st.id] = run;
    return s;
  }

  // ---- actions ----

  function toggle(session, now) {
    if (session.cursor < 0) return next(session, now);
    const st = currentStage(session);
    if (!st) return noop(session);
    const r0 = getRun(session);
    if (r0.done) return refuse(session, 'done', '本环节已结束');
    if (r0.kind !== 'dual') return edit(session, run => (run.running ? stop(run, now) : start(run, 'main', now)));
    let target;
    if (r0.active === null) target = st.first || 'pro';
    else target = r0.running ? other(r0.active) : r0.active;
    // Paused on a side that has no time left: resume with the side that still has some.
    if (r0.locked[target] && !r0.running && !r0.locked[other(target)]) target = other(target);
    if (r0.locked[target]) return refuseLocked(session, r0, target);
    return edit(session, run => start(run, target, now));
  }

  function floor(session, side, now) {
    const st = currentStage(session);
    if (!st || st.type !== 'dual') return refuse(session, 'not-dual', NOT_DUAL);
    const r0 = getRun(session);
    if (r0.locked[side]) return refuseLocked(session, r0, side);
    if (r0.running && r0.active === side) return noop(session);
    return edit(session, run => start(run, side, now));
  }

  function pause(session, now) {
    const st = currentStage(session);
    if (!st) return noop(session);
    if (getRun(session).running) return edit(session, run => stop(run, now));
    return toggle(session, now);
  }

  function adjust(session, deltaMs, now, clockId) {
    const st = currentStage(session);
    if (!st) return noop(session);
    const r0 = getRun(session);
    const id = clockId || r0.active || st.first || 'pro';
    if (!r0.clocks[id]) return noop(session);
    return edit(session, (run, s) => {
      commit(run, now);
      const c = run.clocks[id];
      c.used = Math.max(0, c.used - deltaMs);
      if (run.kind !== 'single') c.used = Math.min(c.total, c.used);
      const left = c.total - c.used;
      if (left > 0) {
        if (run.kind === 'dual' && run.locked[id]) {
          run.locked[id] = false;
          run.yielded[id] = 0;
        }
        run.done = false;
      }
      // Re-arm bell points now above the remaining time; silently spend those below it on a stopped clock.
      const live = run.running && run.active === id;
      const fired = run.fired[id];
      bellPoints(effectiveBells(s.format, st)).forEach(p => {
        const i = fired.indexOf(p.key);
        if (left > p.ms) { if (i >= 0) fired.splice(i, 1); }
        else if (!live && i < 0) fired.push(p.key);
      });
    });
  }

  function yieldTime(session, now) {
    const st = currentStage(session);
    if (!st || st.type !== 'dual') return refuse(session, 'not-dual', NOT_DUAL);
    const r0 = getRun(session);
    if (!r0.active) return noop(session);
    if (r0.locked[r0.active]) return refuseLocked(session, r0, r0.active);
    return edit(session, (run, s) => {
      commit(run, now);
      const side = run.active;
      const c = run.clocks[side];
      run.yielded[side] = Math.max(0, c.total - c.used);
      c.used = c.total;
      run.locked[side] = true;
      run.fired[side] = bellPoints(effectiveBells(s.format, st)).map(p => p.key);
      if (!run.locked[other(side)]) start(run, other(side), now);
      else {
        run.running = false;
        run.since = null;
        run.done = true;
      }
    });
  }

  function reset(session, now) {
    const st = currentStage(session);
    if (!st) return noop(session);
    const s = begin(session);
    delete s.runs[st.id];
    return s;
  }

  function goto(session, index, now) {
    const target = Math.max(-1, Math.min(session.timeline.length, index));
    const st = currentStage(session);
    const running = !!(st && getRun(session).running);
    if (target === session.cursor && !running) return noop(session);
    const s = begin(session);
    if (st && s.runs[st.id]) stop(s.runs[st.id], now);
    s.cursor = target;
    return s;
  }

  function next(session, now) { return goto(session, session.cursor + 1, now); }
  function prev(session, now) { return goto(session, session.cursor - 1, now); }

  // Insert an extra stage right after the current one; the cursor stays where it is.
  function insertExtra(session, group, variantIndex, side, now) {
    const g = (session.format.extras || []).find(x => x.group === group);
    const variant = g && g.variants[variantIndex];
    if (!variant || !SIDE_NAME[side]) return noop(session);
    const st = currentStage(session);
    if (st && getRun(session).running) return refuse(session, 'running', '先暂停再插入');
    const used = (session.extrasUsed[group] || {})[side] || 0;
    if (used >= g.perSide) return refuse(session, 'extra-limit', SIDE_NAME[side] + '的' + group + '已经用过了');
    const s = begin(session);
    const ids = new Set(s.timeline.map(x => x.id));
    let n = 1;
    while (ids.has('x-' + n)) n++;
    const stage = Object.assign(clone(variant), {
      id: 'x-' + n,
      name: SIDE_NAME[side] + variant.name,
      side: variant.type === 'single' ? side : null,
      extra: true,
    });
    s.timeline.splice(Math.min(s.cursor + 1, s.timeline.length), 0, stage);
    s.extrasUsed[group] = s.extrasUsed[group] || { pro: 0, con: 0 };
    s.extrasUsed[group][side] = used + 1;
    return s;
  }

  function undo(session, now) {
    const h = session.history || [];
    if (!h.length) return refuse(session, 'nothing-to-undo', '没有可以撤销的操作');
    const s = clone(h[h.length - 1]);
    s.history = h.slice(0, -1);
    s.lastFeedback = null;
    return s;
  }

  // ---- automatic rules and bells ----

  // Apply the automatic rules up to `now` and report visual events in time order.
  // Returns the input session itself when nothing changed.
  function tick(session, now) {
    const st = currentStage(session);
    const r0 = st && session.runs[st.id];
    if (!r0 || !r0.running) return { session, events: [] };
    const run = clone(r0);
    const events = [];
    const points = bellPoints(effectiveBells(session.format, st));
    let changed = false;
    // Loop because a dual stage can hand over and run the second side out within the same tick.
    for (let guard = 0; guard < 3 && run.running; guard++) {
      const id = run.active;
      const c = run.clocks[id];
      const endAt = run.since + (c.total - c.used);
      points.forEach(p => {
        const at = endAt - p.ms;
        if (at > now || run.fired[id].indexOf(p.key) >= 0) return;
        run.fired[id].push(p.key);
        changed = true;
        if (now - at <= STALE_MS) events.push({ type: p.type, clock: id, key: p.key, at });
      });
      if (endAt > now || run.kind === 'single') break;
      changed = true;
      c.used = c.total;
      if (run.kind === 'dual') {
        run.locked[id] = true;
        const to = other(id);
        if (!run.locked[to]) {
          events.push({ type: 'switch', from: id, to, at: endAt });
          run.active = to;
          run.since = endAt;
          continue;
        }
      }
      run.running = false;
      run.since = null;
      run.done = true;
    }
    if (!changed) return { session, events };
    const runs = Object.assign({}, session.runs, { [st.id]: run });
    return { session: Object.assign({}, session, { runs }), events };
  }

  // Future bells of the running clock, plus the other side's after a dual handover.
  function upcomingBells(session, now) {
    const st = currentStage(session);
    const run = st && session.runs[st.id];
    if (!run || !run.running) return [];
    const bells = effectiveBells(session.format, st);
    const points = bellPoints(bells);
    const out = [];
    const list = (id, endAt) => points.forEach(p => {
      const at = endAt - p.ms;
      const sound = soundOf(p, bells);
      if (sound && at > now && run.fired[id].indexOf(p.key) < 0) out.push({ at, sound, clock: id });
    });
    const c = run.clocks[run.active];
    const endAt = run.since + c.total - c.used;
    list(run.active, endAt);
    const to = other(run.active);
    if (run.kind === 'dual' && !run.locked[to]) list(to, endAt + run.clocks[to].total - run.clocks[to].used);
    return out;
  }

  // ---- view and record ----

  function clockView(run, id, st, bells, now) {
    const c = run.clocks[id];
    const rem = remaining(run, id, now);
    const side = id === 'main' ? st.side || null : id;
    const locked = run.kind === 'dual' ? run.locked[id] : run.done;
    let phase = 'calm';
    if (locked || run.done) phase = 'done';
    else if (rem < 0) phase = 'over';
    else if (bells.countdown > 0 && rem <= bells.countdown * 1000) phase = 'count';
    else if (bells.warn.length && rem <= Math.max.apply(null, bells.warn) * 1000) phase = 'warn';
    return {
      id, side, label: SIDE_NAME[side] || '',
      total: c.total, remaining: rem,
      running: run.running && run.active === id, active: run.active === id,
      locked, yielded: run.kind === 'dual' ? run.yielded[id] : 0,
      fraction: Math.min(1, Math.max(0, rem / c.total)), overtime: Math.max(0, -rem),
      phase, text: fmt(rem),
    };
  }

  function view(session, now) {
    const count = session.timeline.length;
    const cur = session.cursor;
    const match = session.match;
    const st = currentStage(session);
    const out = {
      mode: cur < 0 ? 'title' : st ? 'stage' : 'end',
      match, theme: session.theme, proSeat: (match && match.proSeat) || 'left',
      stage: null, clocks: [], running: false, next: null, warnAt: null,
      progress: session.timeline.map((x, i) => ({
        index: i, side: x.side || null, type: x.type, block: x.block || '', extra: !!x.extra,
        state: i < cur ? 'done' : i === cur ? 'current' : 'todo',
      })),
      extras: (session.format.extras || []).map(g => ({
        group: g.group, perSide: g.perSide,
        used: Object.assign({ pro: 0, con: 0 }, session.extrasUsed[g.group]),
        variants: clone(g.variants),
      })),
      feedback: session.lastFeedback || null,
    };
    const nx = cur < count ? session.timeline[cur + 1] : null;
    if (nx) out.next = { name: nx.name, type: nx.type, side: nx.side || null, secs: nx.secs };
    if (!st) return out;
    const run = getRun(session);
    const bells = effectiveBells(session.format, st);
    out.stage = {
      id: st.id, index: cur, count, name: st.name, type: st.type, side: st.side || null,
      speaker: st.speaker || '', block: st.block || '', note: st.note || '', extra: !!st.extra,
      first: st.type === 'dual' ? st.first || 'pro' : null,
    };
    out.clocks = (run.kind === 'dual' ? ['pro', 'con'] : ['main']).map(id => clockView(run, id, st, bells, now));
    out.running = run.running;
    const total = st.secs * 1000;
    const warnMs = bells.warn.length ? Math.max.apply(null, bells.warn) * 1000 : 0;
    if (st.type === 'single' && warnMs > 0 && warnMs < total) out.warnAt = warnMs / total;
    return out;
  }

  // Per-stage record: `used` is time actually spoken (yielded time excluded), live up to `now`.
  function record(session, now) {
    return session.timeline.map((st, i) => {
      const run = session.runs[st.id];
      const planned = st.secs * 1000 * (st.type === 'dual' ? 2 : 1);
      let used = 0;
      let yielded = 0;
      if (run) Object.keys(run.clocks).forEach(id => {
        const c = run.clocks[id];
        let u = c.used + (run.running && run.active === id ? now - run.since : 0);
        if (run.kind !== 'single') u = Math.min(u, c.total);
        const y = run.kind === 'dual' ? run.yielded[id] : 0;
        used += u - y;
        yielded += y;
      });
      return { index: i, name: st.name, side: st.side || null, type: st.type, planned, used, over: Math.max(0, used - planned), yielded };
    });
  }

  // m:ss, seconds rounded up while time remains; +m:ss rounded down in overtime.
  function fmt(ms) {
    const over = ms < 0;
    const s = over ? Math.floor(-ms / 1000) : Math.ceil(ms / 1000);
    return (over ? '+' : '') + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  DT.engine = {
    DEFAULT_BELLS, createSession, currentStage, getRun, remaining, view, toggle, floor, pause, adjust,
    yieldTime, reset, goto, next, prev, insertExtra, undo, tick, upcomingBells, record, fmt,
    effectiveBells, bellPoints,
  };
})(window.DT = window.DT || {});
