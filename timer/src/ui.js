/* ui.js: application assembly: boot, routing, the timer controller (keys, dock, overlays, bells, persistence)
   and the frame loop. */
(function (DT) {
  'use strict';
  const DOUBLE_MS = 1500;       // the second press of R R / G G must come within this
  const DOCK_IDLE_MS = 2500;    // the dock folds away after this long without pointer movement
  const SIDE_NAME = { pro: '正方', con: '反方' };

  // Keys in the help overlay (spec §5.8). E and O are added by the tasks that bring the editor and the projector.
  const HELP = [
    [['空格'], '单方 / 间隔：开始 / 暂停；自由辩 / 对辩：在双方之间切换（未开始则开始）'],
    [['A'], '发言权给正方（自由辩 / 对辩）'],
    [['L'], '发言权给反方（自由辩 / 对辩）'],
    [['P'], '暂停 / 继续'],
    [['Z', 'Ctrl+Z'], '撤销上一步'],
    [['→', 'PageDown'], '下一环节'],
    [['←', 'PageUp'], '上一环节'],
    [['↑', '↓'], '当前时钟 +1 / −1 秒'],
    [['Shift+↑', 'Shift+↓'], '当前时钟 +5 / −5 秒'],
    [['R R'], '重置当前环节（连按两次）'],
    [['G G'], '当前发言方放弃剩余时间（自由辩 / 对辩，连按两次）'],
    [['B'], '手动敲铃'],
    [['X'], '插入奇袭（赛制有可插入环节时）'],
    [['S'], '环节列表'],
    [['Shift+S'], '本场记录'],
    [['F'], '全屏'],
    [['M'], '静音'],
    [['H', '?'], '帮助'],
    [['Esc'], '关闭覆盖层'],
  ];

  const ICON = {
    prev: '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M7.5 1.2 2.2 5l5.3 3.8z"/></svg>',
    next: '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2.5 1.2 7.8 5 2.5 8.8z"/></svg>',
    play: '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2.6 1.2 8.6 5l-6 3.8z"/></svg>',
    pause: '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2.2 1.4h2v7.2h-2zM5.8 1.4h2v7.2h-2z"/></svg>',
    muted: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6h2.6L8 3v10L4.6 10H2z"/>' +
      '<path d="m10.4 5.8 4 4.4m0-4.4-4 4.4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  };

  // Static markup only; session text goes in through textContent.
  const DOCK =
    '<div class="dt-dock-group">' +
    '<button type="button" data-act="prev">' + ICON.prev + '<span>上一环节</span><kbd>←</kbd></button>' +
    '<button type="button" data-act="next"><span>下一环节</span>' + ICON.next + '<kbd>→</kbd></button></div>' +
    '<div class="dt-dock-group"><button type="button" data-act="toggle" data-primary>' +
    '<span class="dt-icon"></span><span class="dt-toggle-label">开始</span><kbd>空格</kbd></button></div>' +
    '<div class="dt-dock-group">' +
    '<button type="button" data-act="floor" data-side="pro"><i class="dt-swatch" data-side="pro"></i><span>正方</span><kbd>A</kbd></button>' +
    '<button type="button" data-act="floor" data-side="con"><i class="dt-swatch" data-side="con"></i><span>反方</span><kbd>L</kbd></button></div>' +
    '<div class="dt-dock-group">' +
    '<button type="button" data-act="undo"><span>撤销</span><kbd>Z</kbd></button>' +
    '<button type="button" data-act="insert"><span>插入奇袭</span><kbd>X</kbd></button>' +
    '<button type="button" data-act="stages"><span>环节</span><kbd>S</kbd></button></div>' +
    '<div class="dt-dock-group"><button type="button" data-act="fullscreen"><span>全屏</span><kbd>F</kbd></button></div>';
  const STATUS =
    '<span class="dt-pill" data-kind="sound">按任意键启用声音</span>' +
    '<span class="dt-pill" data-kind="muted">' + ICON.muted + '<span>静音</span></span>';
  const PANEL =
    '<div class="dt-scrim"></div><section class="dt-panel" role="dialog" tabindex="-1">' +
    '<header class="dt-panel-head"><h2></h2><button type="button" class="dt-close" aria-label="关闭"><kbd>Esc</kbd></button></header>' +
    '<div class="dt-panel-body"></div></section>';
  const OVERLAY_TITLE = { stages: '环节', help: '键位', insert: '插入奇袭', record: '本场记录' };

  // ---- small helpers ----

  // Demos keep their writes in memory so they never touch the real saved match.
  function memoryStorage() {
    const m = new Map();
    return {
      getItem: k => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => { m.set(k, String(v)); },
      removeItem: k => { m.delete(k); },
    };
  }

  function el(tag, cls, content) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (content !== undefined) e.textContent = content;
    return e;
  }

  function text(e, s) { if (e.textContent !== s) e.textContent = s; }

  function attr(e, name, value) {
    if (value === false || value === null || value === undefined) {
      if (e.hasAttribute(name)) e.removeAttribute(name);
    } else {
      const s = value === true ? '' : String(value);
      if (e.getAttribute(name) !== s) e.setAttribute(name, s);
    }
  }

  const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);

  function isEditable(target) {
    if (!target || !target.tagName) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!target.isContentEditable;
  }

  // Whole seconds, as on the end card.
  function duration(ms) { return DT.engine.fmt(Math.round(ms / 1000) * 1000); }

  function planned(stage) { return (stage.type === 'dual' ? '各 ' : '') + DT.engine.fmt(stage.secs * 1000); }

  // 环节 / 计划 / 实际 / 超时, tab separated, for pasting into a spreadsheet.
  function recordText(record) {
    const lines = [['环节', '计划', '实际', '超时']].concat(record.map(r => [
      r.name, DT.engine.fmt(r.planned), r.used > 0 ? duration(r.used) : '', r.over >= 1000 ? duration(r.over) : '',
    ]));
    return lines.map(l => l.join('\t')).join('\n');
  }

  function routeOf(loc) {
    const params = new URLSearchParams(loc.search || '');
    const demo = params.get('demo');
    if (demo && DT.demo.names.indexOf(demo) >= 0) return { name: 'demo', demo, frozen: params.get('frozen') === '1' };
    // '#projector' becomes the projector window in the sync task; until then it opens like any other page.
    return { name: 'timer' };
  }

  // A saved match worth resuming: unfinished and sound enough to render. Anything else is dropped.
  function resumable(saved, now) {
    if (!saved) return null;
    const ok = Array.isArray(saved.timeline) && Number.isInteger(saved.cursor) &&
      saved.cursor >= -1 && isObj(saved.runs) && isObj(saved.format) && isObj(saved.extrasUsed) &&
      !DT.store.validateFormat(Object.assign({}, saved.format, { stages: saved.timeline })).length;
    if (!ok) { console.warn('保存的场次已损坏，已丢弃'); return null; }
    if (saved.cursor >= saved.timeline.length) return null;
    try { DT.engine.view(saved, now); } catch (e) { console.warn('保存的场次已损坏，已丢弃'); return null; }
    if (!Array.isArray(saved.history)) saved.history = [];
    return saved;
  }

  // Until the setup page exists: a new match in the given format, or the first one, on its title card.
  function newSession(o, now) {
    const formats = DT.store.loadFormats();
    const format = formats.find(f => f.id === o.formatId) || formats[0];
    return DT.engine.createSession(format, o.match || {}, now);
  }

  // What a key does. `hold` lets a held key repeat; `twice` asks for a second press and names the toast.
  function command(code, shift) {
    switch (code) {
      case 'Space': return { act: ['toggle'] };
      case 'KeyA': return { act: ['floor', 'pro'] };
      case 'KeyL': return { act: ['floor', 'con'] };
      case 'KeyP': return { act: ['pause'] };
      case 'KeyZ': return { act: ['undo'] };
      case 'ArrowRight': case 'PageDown': return { act: ['next'] };
      case 'ArrowLeft': case 'PageUp': return { act: ['prev'] };
      case 'ArrowUp': return { act: ['adjust', shift ? 5000 : 1000], hold: true };
      case 'ArrowDown': return { act: ['adjust', shift ? -5000 : -1000], hold: true };
      case 'KeyR': return { act: ['reset'], twice: '再按一次 R 重置本环节' };
      case 'KeyG': return { act: ['yield'], twice: '再按一次 G 放弃剩余时间' };
      case 'KeyB': return { act: ['bell'] };
      case 'KeyM': return { act: ['mute'] };
      case 'KeyF': return { act: ['fullscreen'] };
      case 'KeyX': return { overlay: 'insert' };
      case 'KeyS': return { overlay: shift ? 'record' : 'stages' };
      case 'KeyH': case 'Slash': return { overlay: 'help' };
      case 'Escape': return { close: true };
      default: return null;
    }
  }

  // Engine actions: each takes (session, now, ...args) and returns the next session.
  const SESSION_ACTS = {
    toggle: (s, now) => DT.engine.toggle(s, now),
    floor: (s, now, side) => DT.engine.floor(s, side, now),
    pause: (s, now) => DT.engine.pause(s, now),
    undo: (s, now) => DT.engine.undo(s, now),
    next: (s, now) => DT.engine.next(s, now),
    prev: (s, now) => DT.engine.prev(s, now),
    adjust: (s, now, ms, clockId) => DT.engine.adjust(s, ms, now, clockId),
    reset: (s, now) => DT.engine.reset(s, now),
    yield: (s, now) => DT.engine.yieldTime(s, now),
    goto: (s, now, index) => DT.engine.goto(s, index, now),
    insert: (s, now, group, variant, side) => DT.engine.insertExtra(s, group, variant, side, now),
  };

  function boot(opts) {
    const o = opts || {};
    const root = o.root;
    if (o.clock) DT.clock.set(() => o.clock.now());
    const route = o.route ? { name: o.route } : routeOf(o.location || window.location);
    const bells = o.bells || DT.bells;
    let session, demo = null;
    if (route.name === 'demo') {
      DT.store.useStorage(memoryStorage());
      const now = DT.clock.now();
      if (route.frozen) DT.clock.set(() => now);
      demo = DT.demo.build(route.demo, now);
      session = demo.session;
    } else {
      if (o.storage) DT.store.useStorage(o.storage);
      const now = DT.clock.now();
      session = resumable(DT.store.loadSession(), now) || newSession(o, now);
    }
    const still = route.name === 'demo' && route.frozen;   // a screenshot: no sound hint
    const settings = DT.store.loadSettings();
    bells.setVolume(settings.volume);
    bells.setMuted(settings.muted);

    root.classList.add('dt-app');
    const stage = DT.render.mount(root);
    const dock = el('div', 'dt-dock');
    attr(dock, 'role', 'group');   // not a toolbar: the arrow keys belong to the timer
    attr(dock, 'aria-label', '计时控制');
    dock.innerHTML = DOCK;
    const status = el('div', 'dt-status');
    status.innerHTML = STATUS;
    root.appendChild(dock);
    root.appendChild(status);
    const dockBtn = sel => dock.querySelector('button[data-act="' + sel + '"]');
    const btn = {
      prev: dockBtn('prev'), next: dockBtn('next'), toggle: dockBtn('toggle'),
      pro: dock.querySelector('button[data-side="pro"]'), con: dock.querySelector('button[data-side="con"]'),
      undo: dockBtn('undo'), insert: dockBtn('insert'),
    };
    const toggleIcon = btn.toggle.querySelector('.dt-icon');
    const toggleLabel = btn.toggle.querySelector('.dt-toggle-label');
    const pills = { sound: status.querySelector('[data-kind="sound"]'), muted: status.querySelector('[data-kind="muted"]') };

    const listeners = { change: [], events: [] };
    let raf = null, destroyed = false, overlay = null, armed = null, dockTimer = null, dockPinned = false;

    function emit(name, arg) { listeners[name].slice().forEach(fn => fn(arg)); }

    function viewAt(now) {
      const v = DT.engine.view(session, now);
      if (v.mode === 'end') v.record = DT.engine.record(session, now);
      return v;
    }

    function pulse(events) {
      if (!events.length) return;
      events.forEach(e => stage.pulse(e));
      emit('events', events);
    }

    // ---- painting: stage, dock, status pills, the open overlay ----

    function paintDock(v) {
      const st = v.stage;
      const run = st ? DT.engine.getRun(session) : null;
      const dual = !!st && st.type === 'dual';
      btn.prev.disabled = session.cursor < 0;
      btn.next.disabled = session.cursor >= session.timeline.length;
      btn.toggle.disabled = v.mode === 'end' || !!(run && run.done);
      const started = v.clocks.some(c => c.remaining !== c.total);
      const label = v.running ? (dual ? '换边' : '暂停') : started ? '继续' : '开始';
      text(toggleLabel, label);
      const icon = v.running && !dual ? 'pause' : 'play';
      if (toggleIcon.dataset.icon !== icon) { toggleIcon.dataset.icon = icon; toggleIcon.innerHTML = ICON[icon]; }
      ['pro', 'con'].forEach(side => {
        const clock = v.clocks.find(c => c.id === side);
        btn[side].disabled = !dual || !!(clock && clock.locked);
      });
      btn.undo.disabled = !(session.history && session.history.length);
      btn.insert.disabled = !v.extras.length;
    }

    function paintStatus() {
      attr(pills.sound, 'data-shown', !still && !bells.isUnlocked());
      attr(pills.muted, 'data-shown', !!settings.muted);
    }

    function paint(now) {
      const v = viewAt(now);
      stage.update(v);
      attr(root, 'data-theme', stage.el.getAttribute('data-theme'));
      paintDock(v);
      if (overlay) overlay.refresh(now, v);
    }

    // ---- actions ----

    // Every session action ticks first: a dual side that ran out must be locked before the action applies.
    function apply(fn, args) {
      const now = DT.clock.now();
      const out = DT.engine.tick(session, now);
      pulse(out.events);
      session = fn.apply(null, [out.session, now].concat(args));
      DT.store.saveSession(session);
      bells.schedule(DT.engine.upcomingBells(session, now), now);
      if (session.lastFeedback) stage.toast(session.lastFeedback.message);
      emit('change', session);
      paint(now);
    }

    function fullscreen() {
      try {
        const p = document.fullscreenElement ? document.exitFullscreen() : root.requestFullscreen();
        if (p && p.catch) p.catch(() => {});
      } catch (e) { /* fullscreen not allowed here */ }
    }

    function toggleMute() {
      settings.muted = !settings.muted;
      bells.setMuted(settings.muted);
      DT.store.saveSettings(settings);
      paintStatus();
    }

    const OTHER_ACTS = { bell: () => bells.play('ding'), mute: toggleMute, fullscreen };

    function act(name) {
      if (destroyed) return false;
      const args = Array.prototype.slice.call(arguments, 1);
      if (SESSION_ACTS[name]) apply(SESSION_ACTS[name], args);
      else if (OTHER_ACTS[name]) OTHER_ACTS[name]();
      else return false;
      return true;
    }

    // ---- keys ----

    // The one entry for keys, from this window's keydown or forwarded from elsewhere. Returns true when handled.
    function key(code, opts) {
      const k = opts || {};
      if (destroyed || k.altKey || k.metaKey || (k.ctrlKey && code !== 'KeyZ')) return false;
      const cmd = command(code, !!k.shiftKey);
      if (!cmd) return false;
      if (k.repeat && !cmd.hold) return true;   // swallowed, so a held space neither repeats nor scrolls
      if (cmd.close) {
        if (!overlay) return false;
        closeOverlay();
        return true;
      }
      if (cmd.twice) {
        const now = DT.clock.now();
        if (armed && armed.code === code && now - armed.at <= DOUBLE_MS) {
          armed = null;
          act.apply(null, cmd.act);
        } else {
          armed = { code, at: now };
          stage.toast(cmd.twice);
        }
        return true;
      }
      armed = null;
      if (cmd.overlay) {
        if (overlay && overlay.name === cmd.overlay) closeOverlay();
        else openOverlay(cmd.overlay);
        return true;
      }
      act.apply(null, cmd.act);
      return true;
    }

    // ---- overlays ----

    function stagesOverlay(body) {
      const list = el('ol', 'dt-stagelist');
      body.appendChild(list);
      let sig = null, rows = [];
      return function refresh(now, v) {
        const tl = session.timeline;
        const s = tl.map(x => x.id + ',' + x.name).join('|');
        if (s !== sig) {
          sig = s;
          list.textContent = '';
          rows = tl.map((st, i) => {
            const li = el('li');
            const b = el('button', 'dt-row');
            b.type = 'button';
            attr(b, 'data-index', i);
            attr(b, 'data-side', st.side || 'none');
            attr(b, 'data-kind', st.type);
            attr(b, 'data-gap', i > 0 && (st.block || '') !== (tl[i - 1].block || ''));
            const state = el('span', 'dt-row-state');
            [el('span', 'dt-row-index', String(i + 1)), el('i', 'dt-row-side'), el('span', 'dt-row-name', st.name),
              el('span', 'dt-row-plan', planned(st)), state].forEach(c => b.appendChild(c));
            b.addEventListener('click', () => { act('goto', i); closeOverlay(); });
            li.appendChild(b);
            list.appendChild(li);
            return { b, state };
          });
        }
        const rec = DT.engine.record(session, now);
        const active = v.clocks.find(c => c.active) || v.clocks[0];
        rows.forEach((r, i) => {
          const cur = i === session.cursor;
          attr(r.b, 'aria-current', cur ? 'step' : null);
          attr(r.b, 'data-over', !cur && rec[i].over >= 1000);
          let s = '';
          if (cur) s = '● ' + (active ? active.text : '');
          else if (rec[i].over >= 1000) s = '+' + duration(rec[i].over);
          else if (rec[i].used > 0) s = '✓ ' + duration(rec[i].used);
          text(r.state, s);
        });
      };
    }

    function helpOverlay(body) {
      const table = el('table', 'dt-keys');
      HELP.forEach(([keys, what]) => {
        const tr = el('tr');
        const th = el('th');
        keys.forEach(k => th.appendChild(el('kbd', null, k)));
        tr.appendChild(th);
        tr.appendChild(el('td', null, what));
        table.appendChild(tr);
      });
      body.appendChild(table);
      return () => {};
    }

    function insertOverlay(body) {
      let sig = null;
      return function refresh(now, v) {
        const s = JSON.stringify(v.extras);
        if (s === sig) return;
        sig = s;
        body.textContent = '';
        v.extras.forEach(g => {
          const sec = el('section', 'dt-extra');
          const h = el('h3', null, g.group);
          h.appendChild(el('small', null, '每方 ' + g.perSide + ' 次'));
          sec.appendChild(h);
          g.variants.forEach((variant, k) => {
            const row = el('div', 'dt-extra-row');
            const name = el('div', 'dt-extra-name', variant.name);
            if (variant.note) name.appendChild(el('small', null, variant.note));
            row.appendChild(name);
            row.appendChild(el('span', 'dt-extra-time', DT.engine.fmt(variant.secs * 1000)));
            ['pro', 'con'].forEach(side => {
              const used = g.used[side] >= g.perSide;
              const b = el('button', 'dt-extra-side');
              b.type = 'button';
              b.dataset.group = g.group;
              b.dataset.variant = String(k);
              b.dataset.side = side;
              b.disabled = used;
              b.appendChild(el('i', 'dt-swatch'));
              b.lastChild.dataset.side = side;
              b.appendChild(el('span', null, SIDE_NAME[side] + (used ? ' 已用' : '')));
              b.addEventListener('click', () => {
                act('insert', g.group, k, side);
                if (!session.lastFeedback) closeOverlay();
              });
              row.appendChild(b);
            });
            sec.appendChild(row);
          });
          body.appendChild(sec);
        });
        body.appendChild(el('p', 'dt-hint', '插在当前环节之后，按 → 进入'));
      };
    }

    function copyText(value) {
      const fallback = () => {
        const ta = el('textarea');
        ta.value = value;
        ta.setAttribute('readonly', '');
        ta.className = 'dt-offscreen';
        root.appendChild(ta);
        ta.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        ta.remove();
        stage.toast(ok ? '已复制' : '没能复制，请手动选中表格复制');
      };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(value).then(() => stage.toast('已复制'), fallback);
          return;
        }
      } catch (e) { /* fall back below */ }
      fallback();
    }

    function recordOverlay(body) {
      const table = el('table', 'dt-record-table');
      const foot = el('div', 'dt-panel-foot');
      const copy = el('button', 'dt-button', '复制为文本');
      copy.type = 'button';
      copy.dataset.action = 'copy';
      copy.addEventListener('click', () => copyText(recordText(DT.engine.record(session, DT.clock.now()))));
      foot.appendChild(copy);
      body.appendChild(table);
      body.parentNode.appendChild(foot);   // below the scrolling body, always in view
      let sig = null, cells = [];
      return function refresh(now) {
        const rec = DT.engine.record(session, now);
        const s = rec.map(r => r.name).join('|');
        if (s !== sig) {
          sig = s;
          table.textContent = '';
          const head = el('tr');
          ['环节', '计划', '实际', '超时'].forEach(h => head.appendChild(el('th', null, h)));
          table.appendChild(head);
          cells = rec.map(r => {
            const tr = el('tr');
            attr(tr, 'data-side', r.side || 'none');
            const tds = [0, 1, 2, 3].map(() => tr.appendChild(el('td')));
            table.appendChild(tr);
            return { tr, tds };
          });
        }
        rec.forEach((r, i) => {
          const c = cells[i];
          text(c.tds[0], r.name);
          text(c.tds[1], DT.engine.fmt(r.planned));
          text(c.tds[2], r.used > 0 ? duration(r.used) : '—');
          text(c.tds[3], r.over >= 1000 ? '+' + duration(r.over) : '');
          attr(c.tr, 'data-over', r.over >= 1000);
          attr(c.tr, 'data-current', i === session.cursor);
        });
      };
    }

    const OVERLAYS = { stages: stagesOverlay, help: helpOverlay, insert: insertOverlay, record: recordOverlay };

    function openOverlay(name) {
      if (destroyed || !OVERLAYS[name]) return false;
      if (name === 'insert' && !(session.format.extras || []).length) {
        stage.toast('这个赛制没有可插入的环节');
        return false;
      }
      closeOverlay();
      const wrap = el('div', 'dt-overlay');
      wrap.dataset.name = name;
      wrap.innerHTML = PANEL;
      const panel = wrap.querySelector('.dt-panel');
      attr(panel, 'aria-label', OVERLAY_TITLE[name]);
      text(wrap.querySelector('h2'), OVERLAY_TITLE[name]);
      wrap.querySelector('.dt-scrim').addEventListener('click', closeOverlay);
      wrap.querySelector('.dt-close').addEventListener('click', closeOverlay);
      overlay = { name, el: wrap, refresh: OVERLAYS[name](wrap.querySelector('.dt-panel-body')) };
      root.appendChild(wrap);
      const now = DT.clock.now();
      overlay.refresh(now, viewAt(now));
      try { panel.focus({ preventScroll: true }); } catch (e) { /* focus is a nicety */ }
      return true;
    }

    function closeOverlay() {
      if (!overlay) return;
      overlay.el.remove();
      overlay = null;
    }

    // ---- dock: shown on pointer movement or keyboard focus, folded away when idle ----

    function showDock() {
      attr(dock, 'data-shown', true);
      attr(root, 'data-idle', false);
      clearTimeout(dockTimer);
      dockTimer = setTimeout(hideDock, DOCK_IDLE_MS);
    }

    function hideDock() {
      dockTimer = null;
      if (dockPinned || dock.contains(document.activeElement)) return;   // focusout restarts the timer
      if (dock.matches(':hover')) { dockTimer = setTimeout(hideDock, DOCK_IDLE_MS); return; }
      attr(dock, 'data-shown', false);
      attr(root, 'data-idle', true);
    }

    const DOCK_ACTS = {
      prev: () => act('prev'), next: () => act('next'), toggle: () => act('toggle'), undo: () => act('undo'),
      insert: () => openOverlay('insert'), stages: () => openOverlay('stages'), fullscreen: () => act('fullscreen'),
    };
    dock.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      if (b.dataset.act === 'floor') act('floor', b.dataset.side);
      else if (DOCK_ACTS[b.dataset.act]) DOCK_ACTS[b.dataset.act]();
    });
    // A mouse click must not leave focus on a button, or the next space would press it as well as toggle.
    dock.addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); });
    dock.addEventListener('focusin', showDock);
    dock.addEventListener('focusout', showDock);

    // ---- window listeners ----

    // The first gesture unlocks audio; until then a pill asks for a key.
    function gesture() {
      if (bells.isUnlocked()) return;
      bells.unlock();
      paintStatus();
    }

    function onKeyDown(e) {
      gesture();
      if (isEditable(e.target)) return;
      if (e.isComposing) return;
      if (key(e.code, e)) e.preventDefault();
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', gesture);
    window.addEventListener('pointermove', showDock);

    // ---- frame loop ----

    // One frame: apply the automatic rules, keep what changed, play their visual events, repaint.
    function frame() {
      const now = DT.clock.now();
      const out = DT.engine.tick(session, now);
      if (out.session !== session) {
        session = out.session;
        DT.store.saveSession(session);
        emit('change', session);
      }
      pulse(out.events);
      paint(now);
      raf = requestAnimationFrame(frame);
    }
    frame();
    const bootNow = DT.clock.now();
    bells.schedule(DT.engine.upcomingBells(session, bootNow), bootNow);   // a resumed clock rings on time
    paintStatus();
    if (demo && demo.dock) {
      dockPinned = true;
      attr(dock, 'data-pinned', true);
      showDock();
    }

    return {
      session: () => session,
      view: () => viewAt(DT.clock.now()),
      key, act, openOverlay, closeOverlay,
      on(name, fn) {
        listeners[name].push(fn);
        return () => { listeners[name] = listeners[name].filter(f => f !== fn); };
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        cancelAnimationFrame(raf);
        clearTimeout(dockTimer);
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('pointerdown', gesture);
        window.removeEventListener('pointermove', showDock);
        bells.cancelAll();
        closeOverlay();
        dock.remove();
        status.remove();
        stage.destroy();
        root.classList.remove('dt-app');
        ['data-theme', 'data-idle'].forEach(a => root.removeAttribute(a));
        listeners.change = [];
        listeners.events = [];
      },
    };
  }

  function autoboot() {
    if (document.body.hasAttribute('data-dt-autoboot')) boot({ root: document.getElementById('app') });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoboot);
  else autoboot();

  DT.app = { boot };
})(window.DT = window.DT || {});
