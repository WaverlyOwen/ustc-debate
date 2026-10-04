/* ui.js: application assembly: boot, routing between the setup page and the timer, the timer controller
   (keys, dock, overlays, bells, persistence), the console beside a projector window, the projector window
   itself, and the frame loop. */
(function (DT) {
  'use strict';
  const DOUBLE_MS = 1500;       // the second press of R R / G G / Q Q, or click of 重置 / 退出, must come within this
  const CONFIRM_MIN_MS = 250;   // a second click sooner than this is one double-click, not a confirmation
  const DOCK_IDLE_MS = 2500;    // the dock folds away after this long without pointer movement
  const RUNG_MEMORY = 32;       // visual events the projector remembers, so one reported twice plays once
  const MERGE_MS = 1000;        // adjusts of one clock this close together are one undo step (a held arrow key)
  const SAVE_SOON_MS = 300;     // how long a merged adjust waits before it is saved
  const PROJECTOR_FLAG = 'dt.projector';   // sessionStorage: this tab has a projector window open (§5.11)
  const SIDE_NAME = { pro: '正方', con: '反方' };
  const LAST_MATCH = ['proMotion', 'conMotion', 'proTeam', 'conTeam', 'proSeat'];   // prefilled next time (§5.9)
  // Used when build.py has not injected DT.THEMES (the test page loads the sources directly).
  const FALLBACK_THEMES = [{ id: 'hall', name: '堂' }, { id: 'daylight', name: '昼' }, { id: 'chroma', name: '绿幕' }];
  const EXPORTED = '已导出。把这个文件拷到比赛用的电脑上，双击就能直接开始这一场';
  const EXPORT_FAILED = '没能导出这个文件：浏览器没有让它下载。再试一次，或换一个浏览器';
  const RESTART_LABEL = '重新开始这一场';   // 新的一场 on the end card of a match file (new spec §4.1)
  // A key in a projector window whose console tab was closed. A refreshed console finds this window again by name,
  // but a console opened anew cannot (its O opens a window of its own), so this one is to be closed.
  const CONSOLE_GONE = '控制台已关闭。关掉这个窗口，在主窗口按 O 重新打开投影';
  const CONSOLE_AWAY = '计时员在开赛页，回到计时后继续';         // a key in a projector window while the console is away
  // What ?exportProbe=1 exports, for the end-to-end test (new spec §4.4).
  const PROBE = {
    format: 'ustc-freshman-cup', theme: 'hall',
    match: { title: '探针场', proMotion: '探针辩题正方', conMotion: '探针辩题反方', proTeam: '探针队甲', conTeam: '探针队乙', proSeat: 'left' },
  };

  // Keys in the help overlay (spec §5.8).
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
    [['R R'], '重置当前环节（连按两次）；其他环节在环节列表（S）里重置'],
    [['G G'], '当前发言方放弃剩余时间（自由辩 / 对辩，连按两次）'],
    [['B'], '手动敲铃'],
    [['X'], '插入奇袭（赛制有可插入环节时）'],
    [['S'], '环节列表'],
    [['Shift+S'], '本场记录'],
    [['E'], '编辑赛制（这一场照常进行）'],
    [['Shift+E'], '开场卡上：回到开赛页'],
    [['Q Q'], '退出到开赛页，这一场保留，「继续」回到这个环节（连按两次）'],
    [['O'], '打开投影窗口（这个窗口变成操作台）'],
    [['F'], '全屏'],
    [['M'], '静音'],
    [['H', '?'], '帮助'],
    [['Esc'], '关闭覆盖层；导出的专用文件里，开场卡上没有覆盖层时：回到开赛页'],
  ];

  const ICON = {
    prev: '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M7.5 1.2 2.2 5l5.3 3.8z"/></svg>',
    next: '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2.5 1.2 7.8 5 2.5 8.8z"/></svg>',
    play: '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2.6 1.2 8.6 5l-6 3.8z"/></svg>',
    pause: '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2.2 1.4h2v7.2h-2zM5.8 1.4h2v7.2h-2z"/></svg>',
    muted: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6h2.6L8 3v10L4.6 10H2z"/>' +
      '<path d="m10.4 5.8 4 4.4m0-4.4-4 4.4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  };

  // 重置 and 退出 carry the words they show while armed (new spec §2.1) in the same cell as their rest, so the
  // button is always as wide as the longer of the two and arming moves nothing under the pointer.
  const armable = (act, label, keys, ask) => '<button type="button" data-act="' + act + '"><span class="dt-arm">' +
    '<span class="dt-arm-rest"><span>' + label + '</span><kbd>' + keys + '</kbd></span>' +
    '<span class="dt-arm-ask">' + ask + '</span></span></button>';
  const RESET_BUTTON = armable('reset', '重置', 'R R', '再点一次重置');
  const EXIT_BUTTON = armable('exit', '退出', 'Q Q', '再点一次退出');

  // Static markup only; session text goes in through textContent.
  const DOCK =
    '<div class="dt-dock-group">' +
    '<button type="button" data-act="prev">' + ICON.prev + '<span>上一环节</span><kbd>←</kbd></button>' +
    '<button type="button" data-act="next"><span>下一环节</span>' + ICON.next + '<kbd>→</kbd></button></div>' +
    '<div class="dt-dock-group"><button type="button" data-act="toggle" data-primary>' +
    '<span class="dt-icon"></span><span class="dt-toggle-label">开始</span><kbd>空格</kbd></button>' +
    '<button type="button" data-act="new" data-primary hidden><span>新的一场</span></button></div>' +
    '<div class="dt-dock-group">' +
    '<button type="button" data-act="floor" data-side="pro"><i class="dt-swatch" data-side="pro"></i><span>正方</span><kbd>A</kbd></button>' +
    '<button type="button" data-act="floor" data-side="con"><i class="dt-swatch" data-side="con"></i><span>反方</span><kbd>L</kbd></button></div>' +
    '<div class="dt-dock-group">' +
    '<button type="button" data-act="undo"><span>撤销</span><kbd>Z</kbd></button>' +
    RESET_BUTTON +
    '<button type="button" data-act="insert"><span>插入奇袭</span><kbd>X</kbd></button>' +
    '<button type="button" data-act="stages"><span>环节</span><kbd>S</kbd></button>' +
    '<button type="button" data-act="editor"><span>赛制</span><kbd>E</kbd></button></div>' +
    '<div class="dt-dock-group"><button type="button" data-act="projector"><span>投影窗口</span><kbd>O</kbd></button>' +
    '<button type="button" data-act="fullscreen"><span>全屏</span><kbd>F</kbd></button></div>' +
    '<div class="dt-dock-group" data-exit>' + EXIT_BUTTON + '</div>';
  // The console (spec §5.7): stage list, preview, controls. The stage moves into .dt-preview while it is open.
  const ADJUST = [[-5000, '−5'], [-1000, '−1'], [1000, '+1'], [5000, '+5']];
  const CONSOLE =
    '<aside class="dt-console-col dt-console-list" aria-label="环节"><h2 class="dt-console-head">环节</h2>' +
    '<div class="dt-console-scroll"></div></aside>' +
    '<section class="dt-console-col dt-console-main" aria-label="投影预览"><header class="dt-console-head">' +
    '<h2>投影预览</h2><div class="dt-console-status"></div><span class="dt-console-live">投影窗口已连接</span></header>' +
    '<div class="dt-preview-frame"><div class="dt-preview"></div>' +
    '<p class="dt-console-note" hidden><span class="dt-console-note-label">计时员提示</span>' +
    '<span class="dt-console-note-text"></span></p></div></section>' +
    '<aside class="dt-console-col dt-console-controls" aria-label="计时控制"><h2 class="dt-console-head">控制</h2>' +
    '<div class="dt-control-group"><button type="button" data-act="toggle" data-primary>' +
    '<span class="dt-icon"></span><span class="dt-toggle-label">开始</span><kbd>空格</kbd></button>' +
    '<button type="button" data-act="new" data-primary hidden><span>新的一场</span></button></div>' +
    '<div class="dt-control-group">' +
    '<button type="button" data-act="floor" data-side="pro"><i class="dt-swatch" data-side="pro"></i><span>正方</span><kbd>A</kbd></button>' +
    '<button type="button" data-act="floor" data-side="con"><i class="dt-swatch" data-side="con"></i><span>反方</span><kbd>L</kbd></button></div>' +
    '<div class="dt-control-group dt-adjust" role="group" aria-label="调整当前时钟">' +
    ADJUST.map(([ms, label]) => '<button type="button" data-act="adjust" data-ms="' + ms + '">' + label + '</button>').join('') +
    '<span class="dt-adjust-unit">秒</span></div>' +
    '<div class="dt-control-group">' +
    '<button type="button" data-act="prev"><span>上一环节</span><kbd>←</kbd></button>' +
    '<button type="button" data-act="next"><span>下一环节</span><kbd>→</kbd></button></div>' +
    '<div class="dt-control-group">' +
    '<button type="button" data-act="undo"><span>撤销</span><kbd>Z</kbd></button>' +
    RESET_BUTTON +
    '<button type="button" data-act="insert" data-wide><span>插入奇袭</span><kbd>X</kbd></button></div>' +
    '<div class="dt-control-group">' +
    '<button type="button" data-act="bell"><span>敲铃</span><kbd>B</kbd></button>' +
    '<button type="button" data-act="mute" aria-pressed="false"><span class="dt-mute-label">静音</span><kbd>M</kbd></button>' +
    // Not a <label>: a click on 音量 would give the slider focus (new spec §3, P1).
    '<div class="dt-volume"><span>音量</span><input type="range" name="volume" aria-label="音量" min="0" max="1" step="0.05"></div></div>' +
    '<div class="dt-control-group" data-exit>' + EXIT_BUTTON + '</div>' +
    '</aside>';
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

  // Inputs that take no typing (a slider, a checkbox…) leave the keys to the timer (new spec §3, P1).
  const UNTYPED = ['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'file'];

  // Where keys are typing: a text box, a select, an editable element.
  function isEditable(target) {
    if (!target || !target.tagName) return false;
    const tag = target.tagName;
    if (tag === 'INPUT') return UNTYPED.indexOf(String(target.type).toLowerCase()) < 0;
    return tag === 'TEXTAREA' || tag === 'SELECT' || !!target.isContentEditable;
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
    if (demo && DT.demo.names.indexOf(demo) >= 0) {
      return { name: 'demo', demo, frozen: params.get('frozen') === '1', theme: params.get('theme') };
    }
    if (loc.hash === '#projector') return { name: 'projector' };
    return { name: 'setup' };
  }

  // A saved match worth resuming: unfinished (or left with 退出, even from its end card: new spec §5.3) and sound
  // enough to render. Anything else is dropped.
  function resumable(saved, now) {
    if (!saved) return null;
    const ok = Array.isArray(saved.timeline) && Number.isInteger(saved.cursor) &&
      saved.cursor >= -1 && isObj(saved.runs) && isObj(saved.format) && isObj(saved.extrasUsed) &&
      !DT.store.validateFormat(Object.assign({}, saved.format, { stages: saved.timeline })).length;
    if (!ok) { console.warn('保存的场次已损坏，已丢弃'); return null; }
    if (saved.cursor >= saved.timeline.length && !saved.exited) return null;
    try { DT.engine.view(saved, now); } catch (e) { console.warn('保存的场次已损坏，已丢弃'); return null; }
    if (!Array.isArray(saved.history)) saved.history = [];
    return saved;
  }

  const themeList = () => (Array.isArray(DT.THEMES) && DT.THEMES.length ? DT.THEMES : FALLBACK_THEMES);

  // What has been typed on the setup page, read back from its form so a redraw after the editor keeps it.
  function setupDraft(root) {
    const page = root.querySelector('.dt-setup');
    if (!page) return null;
    const out = {};
    ['title', 'proMotion', 'conMotion', 'proTeam', 'conTeam'].forEach(k => {
      const input = page.querySelector('input[name="' + k + '"]');
      out[k] = input ? input.value : '';
    });
    const seat = page.querySelector('input[name="proSeat"]:checked');
    const chosen = page.querySelector('[data-format-id][aria-selected="true"]');
    out.proSeat = seat ? seat.value : 'left';
    out.formatId = chosen ? chosen.dataset.formatId : null;
    return out;
  }

  // The editor demos: open a row's details, or leave a duration mistyped, as a timekeeper would.
  function stageEditorDemo(root, spec) {
    const ed = root.querySelector('.dt-editor');
    const row = i => ed.querySelector('[data-stage-index="' + i + '"]');
    ed.setAttribute('data-still', '');   // a still for review: already risen, no entrance to catch half way
    if (spec.expand !== undefined) row(spec.expand).querySelector('button[data-action="expand"]').click();
    if (spec.typo) {
      const input = row(spec.typo[0]).querySelector('input[name="secs"]');
      input.value = spec.typo[1];
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  // The 'timer' route with nothing to resume: a new match in the given format, or the first one.
  function newSession(o, now) {
    const formats = DT.store.loadFormats();
    const format = formats.find(f => f.id === o.formatId) || formats[0];
    return DT.engine.createSession(format, o.match || {}, now);
  }

  // How the setup page names a match it can resume: its title, else the pro motion, else the format; the stage it
  // stopped on; whether the timekeeper left it with 退出 (else it was left by closing the page), and on its end card.
  function resumeInfo(session) {
    const m = isObj(session.match) ? session.match : {};
    const title = [m.title, m.proMotion, session.format.name].map(x => String(x || '').trim()).find(x => x);
    const st = session.timeline[session.cursor];
    return { title: title || '', cursor: session.cursor, stage: st ? st.name : '', exited: !!session.exited,
      finished: session.cursor >= session.timeline.length };
  }

  // What the projector's title card says while the console is away (new spec §2.2), in place of 空格开始.
  function awayText(session) {
    const st = session.timeline[session.cursor];
    if (st) return '停在第 ' + (session.cursor + 1) + ' 个环节：' + st.name;
    return session.cursor < 0 ? '还没开始第一个环节' : '比赛已经结束';
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
      case 'KeyQ': return { act: ['exit'], twice: '再按一次 Q 退出到开赛页，这一场会保留' };
      case 'KeyB': return { act: ['bell'] };
      case 'KeyM': return { act: ['mute'] };
      case 'KeyF': return { act: ['fullscreen'] };
      case 'KeyX': return { overlay: 'insert' };
      case 'KeyS': return { overlay: shift ? 'record' : 'stages' };
      case 'KeyE': return shift ? { setup: true, editor: true } : { editor: true };
      case 'KeyO': return { projector: true };
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
    reset: (s, now, index) => DT.engine.reset(s, now, index),
    yield: (s, now) => DT.engine.yieldTime(s, now),
    goto: (s, now, index) => DT.engine.goto(s, index, now),
    insert: (s, now, group, variant, side) => DT.engine.insertExtra(s, group, variant, side, now),
  };

  function toggleFullscreen(target) {
    try {
      const p = document.fullscreenElement ? document.exitFullscreen() : target.requestFullscreen();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* fullscreen not allowed here */ }
  }

  // The buttons a control surface (the dock, the console's column) paints; the ones it lacks are null.
  function controlSet(box) {
    const b = sel => box.querySelector('button[data-act="' + sel + '"]');
    const toggle = b('toggle');
    return {
      prev: b('prev'), next: b('next'), toggle, new: b('new'), undo: b('undo'), insert: b('insert'), reset: b('reset'),
      pro: box.querySelector('button[data-side="pro"]'), con: box.querySelector('button[data-side="con"]'),
      icon: toggle.querySelector('.dt-icon'), label: toggle.querySelector('.dt-toggle-label'),
    };
  }

  // A mouse click must not leave focus on a button, or the next space would press it as well as toggle, and Enter
  // would press it again. Every box of buttons gets this: the dock, the console's columns, the overlays.
  function keepFocus(box) {
    box.addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); });
  }

  // The buttons that reset or exit ask twice (new spec §2.1): the first click arms the button (data-armed), and
  // its CSS shows the words that say what the second click does; a second click 250 ms to 1.5 s after the first runs
  // `run`. A shaky double-click is too quick to count, and stays armed for a deliberate second click. 1.5 s, the
  // mouse leaving the button, or a press anywhere else disarms it. Only the mouse: a finger's tap ends with a
  // pointerleave of its own, which would disarm the button between two taps. `words()`, when given, writes those words
  // into `ask` as the button arms. data-armed alternates a / b so the 1.5 s drain under the words starts over on
  // every arming. Returns the function that disarms, for a page going away.
  function confirmTwice(button, run, ask, words) {
    let armedAt = null, timer = null, turn = 'b';
    function disarm() {
      armedAt = null;
      clearTimeout(timer);
      document.removeEventListener('pointerdown', elsewhere, true);
      button.removeEventListener('pointerleave', left);
      attr(button, 'data-armed', false);
    }
    function elsewhere(e) { if (!button.contains(e.target)) disarm(); }
    function left(e) { if (e.pointerType === 'mouse') disarm(); }
    // A held Enter clicks again on every repeat, and one of them would confirm: only a fresh press counts.
    button.addEventListener('keydown', e => {
      if (e.repeat && (e.key === 'Enter' || e.key === ' ')) e.preventDefault();
    });
    button.addEventListener('click', () => {
      const now = DT.clock.now();
      if (armedAt !== null && now - armedAt <= DOUBLE_MS) {
        if (now - armedAt < CONFIRM_MIN_MS) return;
        disarm();
        run();
        return;
      }
      disarm();
      armedAt = now;
      if (words) text(ask, words());
      turn = turn === 'a' ? 'b' : 'a';
      attr(button, 'data-armed', turn);
      timer = setTimeout(disarm, DOUBLE_MS);
      document.addEventListener('pointerdown', elsewhere, true);
      button.addEventListener('pointerleave', left);
    });
    return disarm;
  }

  // The timer page for one match. env: {bells, settings, still (a screenshot: no sound hint), pinDock,
  // console (open as the console beside a projector), emit(name, arg) to the app's listeners, onNewMatch() for
  // 新的一场 on the end card and newLabel to call it something else, onEdit(formatId) for E, onSetup() for
  // Shift+E on the title card (and Esc there when matchFile: this page is a match file), onProjector() for O
  // (false when no window could open), onExit(session) for Q Q and 退出 once the match is paused and saved,
  // blocked() true while the editor covers the timer and its keys}.
  function mountTimer(root, first, env) {
    const bells = env.bells, settings = env.settings, still = !!env.still, emit = env.emit;
    let session = first;
    const stage = DT.render.mount(root);
    const dock = el('div', 'dt-dock');
    attr(dock, 'role', 'group');   // not a toolbar: the arrow keys belong to the timer
    attr(dock, 'aria-label', '计时控制');
    dock.innerHTML = DOCK;
    // The end card's button, where a match file restarts its own match instead.
    const relabel = box => { if (env.newLabel) text(box.querySelector('button[data-act="new"] span'), env.newLabel); };
    relabel(dock);
    const status = el('div', 'dt-status');
    status.innerHTML = STATUS;
    root.appendChild(dock);
    root.appendChild(status);
    const dockSet = controlSet(dock);
    const pills = { sound: status.querySelector('[data-kind="sound"]'), muted: status.querySelector('[data-kind="muted"]') };

    let raf = null, destroyed = false, overlay = null, armed = null, dockTimer = null, dockPinned = false;
    let desk = null;   // the console's handle while a projector window is open
    let lastAdjust = null, saveTimer = null;   // {key, at} of the last adjust; a save held back while a key repeats
    const disarms = [];   // one per 重置 / 退出 of the dock and the console, to put its label back when the page goes

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

    // Toasts show on this stage. Only what the room should see goes to the projector too (the app relays
    // 'toast'); the timekeeper's own slips (再按一次 R, 没有可以撤销的操作…) stay on the console.
    function toast(message, forRoom) {
      stage.toast(message);
      if (forRoom) emit('toast', message);
    }

    // ---- painting: stage, dock, console, status pills, the open overlay ----

    function paintControls(btn, v) {
      const st = v.stage;
      const run = st ? DT.engine.getRun(session) : null;
      const dual = !!st && st.type === 'dual';
      btn.prev.disabled = session.cursor < 0;
      btn.next.disabled = session.cursor >= session.timeline.length;
      btn.toggle.disabled = v.mode === 'end' || !!(run && run.done);
      btn.toggle.hidden = v.mode === 'end';   // the end card offers 新的一场 in its place
      btn.new.hidden = v.mode !== 'end';
      const started = v.clocks.some(c => c.remaining !== c.total);
      const label = v.running ? (dual ? '换边' : '暂停') : started ? '继续' : '开始';
      text(btn.label, label);
      const icon = v.running && !dual ? 'pause' : 'play';
      if (btn.icon.dataset.icon !== icon) { btn.icon.dataset.icon = icon; btn.icon.innerHTML = ICON[icon]; }
      ['pro', 'con'].forEach(side => {
        const clock = v.clocks.find(c => c.id === side);
        btn[side].disabled = !dual || !!(clock && clock.locked);
      });
      btn.undo.disabled = !(session.history && session.history.length);
      btn.insert.disabled = !v.extras.length || v.mode === 'end';
      btn.reset.disabled = !st;
    }

    function paintStatus() {
      attr(pills.sound, 'data-shown', !still && !bells.isUnlocked());
      attr(pills.muted, 'data-shown', !!settings.muted);
      if (desk) desk.paintSettings();
    }

    function paint(now) {
      const v = viewAt(now);
      stage.update(v);
      attr(root, 'data-theme', stage.el.getAttribute('data-theme'));
      paintControls(dockSet, v);
      if (desk) desk.refresh(now, v);
      if (overlay) overlay.refresh(now, v);
    }

    // ---- actions ----

    // Now, or a moment later: a key held down would otherwise write the whole session thirty times a second.
    function save(soon) {
      clearTimeout(saveTimer);
      saveTimer = null;
      if (!soon) { DT.store.saveSession(session); return; }
      saveTimer = setTimeout(() => { saveTimer = null; DT.store.saveSession(session); }, SAVE_SOON_MS);
    }

    // The clock an adjust acts on, as the engine picks it.
    function adjustKey(s, clockId) {
      const st = DT.engine.currentStage(s);
      if (!st) return null;
      return st.id + ':' + (clockId || DT.engine.getRun(s).active || st.first || 'pro');
    }

    // Every session action ticks first: a dual side that ran out must be locked before the action applies.
    function apply(name, args) {
      const now = DT.clock.now();
      const out = DT.engine.tick(session, now);
      pulse(out.events);
      const before = out.session;
      let next = SESSION_ACTS[name].apply(null, [before, now].concat(args));
      const h0 = before.history || [], h1 = next.history || [];
      const pushed = h1.length > 0 && h1[h1.length - 1] !== h0[h0.length - 1];
      // Adjusts of one clock in quick succession (a held ↑ / ↓) share the undo step of the first of them.
      const key = name === 'adjust' ? adjustKey(before, args[1]) : null;
      const merged = pushed && !!key && !!lastAdjust && lastAdjust.key === key && now - lastAdjust.at <= MERGE_MS;
      if (merged) next = Object.assign({}, next, { history: h1.slice(0, -1) });
      lastAdjust = key && pushed ? { key, at: now } : null;
      session = next;
      save(merged);
      bells.schedule(DT.engine.upcomingBells(session, now), now);
      // A bell point the action itself crossed (time taken off a running clock, an undo) rings now.
      if (session.lastRung) {
        session.lastRung.forEach(e => { if (e.sound) bells.play(e.sound); });
        pulse(session.lastRung);
      }
      if (session.lastFeedback) toast(session.lastFeedback.message, session.lastFeedback.code === 'locked');
      emit('change', session);
      paint(now);
    }

    function toggleMute() {
      settings.muted = !settings.muted;
      bells.setMuted(settings.muted);
      DT.store.saveSettings(settings);
      paintStatus();
    }

    function setVolume(volume) {
      settings.volume = volume;
      bells.setVolume(volume);
      DT.store.saveSettings(settings);
    }

    // Leaving for the setup page (new spec §2.2): the clock is settled and stopped first, so the time spent away is
    // not charged, and the match is saved for 继续. Leaving is not a timing step, so it is no undo step either.
    function exit() {
      const now = DT.clock.now();
      const out = DT.engine.tick(session, now);
      pulse(out.events);
      session = out.session;
      if (DT.engine.currentStage(session) && DT.engine.getRun(session).running) {
        session = Object.assign(DT.engine.pause(session, now), { history: session.history });
      }
      save(false);
      emit('change', session);
      env.onExit(session);
    }

    const OTHER_ACTS = { bell: () => bells.play('ding'), mute: toggleMute, fullscreen: () => toggleFullscreen(root), exit };

    function act(name) {
      if (destroyed) return false;
      const args = Array.prototype.slice.call(arguments, 1);
      if (SESSION_ACTS[name]) apply(name, args);
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
      // On the title card, with nothing open over it, Shift+E goes back to the setup page; so does Esc in a match
      // file (new spec §4.1). In the plain timer Esc only closes overlays, as the main spec has it.
      const toSetup = session.cursor < 0 && !!env.onSetup;
      if (cmd.close) {
        if (overlay) closeOverlay();
        else if (toSetup && env.matchFile) env.onSetup();
        else return false;
        return true;
      }
      if (cmd.twice) {
        const now = DT.clock.now();
        if (armed && armed.code === code && now - armed.at <= DOUBLE_MS) {
          armed = null;
          act.apply(null, cmd.act);
        } else {
          armed = { code, at: now };
          toast(cmd.twice);
        }
        return true;
      }
      armed = null;
      if (cmd.setup && toSetup) {
        closeOverlay();
        env.onSetup();
        return true;
      }
      if (cmd.editor) {
        closeOverlay();
        env.onEdit(session.format.id);
        return true;
      }
      if (cmd.projector) {
        if (!env.onProjector()) toast('没能打开投影窗口。请允许这个页面弹出窗口，再按 O');
        return true;
      }
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
            const li = el('li', 'dt-stagelist-item');
            attr(li, 'data-gap', i > 0 && (st.block || '') !== (tl[i - 1].block || ''));
            const b = el('button', 'dt-row');
            b.type = 'button';
            attr(b, 'data-index', i);
            attr(b, 'data-side', st.side || 'none');
            attr(b, 'data-kind', st.type);
            const state = el('span', 'dt-row-state');
            const dot = state.appendChild(el('span', 'dt-row-dot'));
            const time = state.appendChild(el('span'));
            [el('span', 'dt-row-index', String(i + 1)), el('i', 'dt-row-side'), el('span', 'dt-row-name', st.name),
              el('span', 'dt-row-plan', planned(st)), state].forEach(c => b.appendChild(c));
            b.addEventListener('click', () => {
              if (i !== session.cursor) act('goto', i);   // the current row: a click must not stop its clock
              closeOverlay();
            });
            // Any stage that has been timed resets on its own, from here, without moving the cursor (new spec §2.1).
            const reset = el('button', 'dt-row-reset');
            reset.type = 'button';
            attr(reset, 'aria-label', '重置第 ' + (i + 1) + ' 个环节');
            attr(reset, 'title', '重置');
            reset.appendChild(el('span', 'dt-row-reset-icon', '↺')).setAttribute('aria-hidden', 'true');
            const label = reset.appendChild(el('span', 'dt-row-reset-label', '重置'));
            // Armed, it says what it does and what it throws away: the time the row shows (✓ 2:57, + 0:06, 1:12).
            confirmTwice(reset, () => act('reset', i), label,
              () => '再点一次重置' + (time.textContent ? '　' + time.textContent : ''));   // rebuilt with the list
            li.appendChild(b);
            li.appendChild(reset);
            list.appendChild(li);
            return { b, dot, time, reset };
          });
        }
        const rec = DT.engine.record(session, now);
        const active = v.clocks.find(c => c.active) || v.clocks[0];
        rows.forEach((r, i) => {
          const cur = i === session.cursor;
          attr(r.reset, 'hidden', !(session.runs[tl[i].id] && (rec[i].used > 0 || rec[i].yielded > 0)));
          attr(r.b, 'aria-current', cur ? 'step' : null);
          attr(r.b, 'data-over', !cur && rec[i].over >= 1000);
          let s = '';
          if (cur) s = active ? active.text : '';
          else if (rec[i].over >= 1000) s = '+' + duration(rec[i].over);
          else if (rec[i].used > 0) s = '✓ ' + duration(rec[i].used);
          text(r.dot, cur ? '● ' : '');
          text(r.time, s);
        });
      };
    }

    // Two tables side by side where the panel is wide enough, so the last keys (O, F, M, H, Esc) are not below the
    // fold of a 768-high screen; they stack where it is not.
    function helpOverlay(body) {
      const cols = el('div', 'dt-keys-cols');
      const half = Math.ceil(HELP.length / 2);
      [HELP.slice(0, half), HELP.slice(half)].forEach(rows => {
        const table = el('table', 'dt-keys');
        rows.forEach(([keys, what]) => {
          const tr = el('tr');
          const th = el('th');
          keys.forEach(k => th.appendChild(el('kbd', null, k)));
          tr.appendChild(th);
          tr.appendChild(el('td', null, what));
          table.appendChild(tr);
        });
        cols.appendChild(table);
      });
      body.appendChild(cols);
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
        toast(ok ? '已复制' : '没能复制，请手动选中表格复制');
      };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(value).then(() => toast('已复制'), fallback);
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
        toast('这个赛制没有可插入的环节');
        return false;
      }
      if (name === 'insert' && session.cursor >= session.timeline.length) {
        toast('比赛已经结束');
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
      keepFocus(wrap);
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

    // What a button on the dock or the console does. 重置 and 退出 are not here: they ask twice (confirmControls).
    const CONTROL_ACTS = {
      prev: () => act('prev'), next: () => act('next'), toggle: () => act('toggle'), undo: () => act('undo'),
      insert: () => openOverlay('insert'), stages: () => openOverlay('stages'), fullscreen: () => act('fullscreen'),
      new: () => env.onNewMatch(), editor: () => key('KeyE'), projector: () => key('KeyO'),
      bell: () => act('bell'), mute: () => act('mute'),
    };
    function confirmControls(box) {
      ['reset', 'exit'].forEach(name => {
        const b = box.querySelector('button[data-act="' + name + '"]');
        disarms.push(confirmTwice(b, () => act(name)));
      });
    }
    function onControlClick(e) {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      if (b.dataset.act === 'floor') act('floor', b.dataset.side);
      else if (b.dataset.act === 'adjust') act('adjust', Number(b.dataset.ms));
      else if (CONTROL_ACTS[b.dataset.act]) CONTROL_ACTS[b.dataset.act]();
    }
    dock.addEventListener('click', onControlClick);
    confirmControls(dock);
    keepFocus(dock);
    dock.addEventListener('focusin', showDock);
    dock.addEventListener('focusout', showDock);

    // ---- console: the three columns this window turns into beside a projector window (spec §5.7) ----

    // The stage moves into the preview, a 16:9 size container of its own, so it keeps the projector's proportions.
    function mountDesk() {
      const box = el('div', 'dt-console');
      attr(box, 'data-theme', 'hall');   // the timekeeper's desk keeps the default palette, whatever the room shows
      box.innerHTML = CONSOLE;
      relabel(box);
      const preview = box.querySelector('.dt-preview');
      preview.classList.add('dt-stage-host');
      preview.appendChild(stage.el);
      box.querySelector('.dt-console-status').appendChild(status);
      const controls = box.querySelector('.dt-console-controls');
      const set = controlSet(controls);
      const mute = controls.querySelector('button[data-act="mute"]');
      const volume = controls.querySelector('input[name="volume"]');
      const note = box.querySelector('.dt-console-note');
      const noteText = box.querySelector('.dt-console-note-text');
      const list = box.querySelector('.dt-console-scroll');
      const refreshList = stagesOverlay(list);
      controls.addEventListener('click', onControlClick);
      confirmControls(controls);
      keepFocus(controls);
      keepFocus(list);
      volume.addEventListener('input', () => setVolume(Number(volume.value)));
      root.insertBefore(box, root.firstChild);
      attr(root, 'data-layout', 'console');
      let cursor = null;
      return {
        refresh(now, v) {
          refreshList(now, v);
          paintControls(set, v);
          const tip = (v.stage && v.stage.note) || '';
          text(noteText, tip);
          attr(note, 'hidden', !tip);
          if (cursor !== session.cursor) {
            cursor = session.cursor;
            const current = list.querySelector('[aria-current]');
            if (current && current.scrollIntoView) current.scrollIntoView({ block: 'nearest' });
          }
        },
        paintSettings() {
          attr(mute, 'aria-pressed', settings.muted ? 'true' : 'false');
          text(mute.querySelector('.dt-mute-label'), settings.muted ? '取消静音' : '静音');
          if (document.activeElement !== volume) volume.value = String(settings.volume);
        },
        destroy() {
          root.insertBefore(stage.el, root.firstChild);
          root.appendChild(status);
          box.remove();
          attr(root, 'data-layout', null);
        },
      };
    }

    function setConsole(on) {
      if (destroyed || !!on === !!desk) return;
      if (on) desk = mountDesk();
      else { desk.destroy(); desk = null; }
      paintStatus();
      paint(DT.clock.now());
    }

    // ---- window listeners ----

    // The first gesture unlocks audio; until then a pill asks for a key.
    function gesture() {
      if (bells.isUnlocked()) return;
      bells.unlock();
      paintStatus();
    }

    function onKeyDown(e) {
      gesture();
      if (env.blocked()) return;
      if (isEditable(e.target)) return;
      if (e.isComposing) return;
      if (key(DT.sync.codeOf(e), e)) e.preventDefault();
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', gesture);
    window.addEventListener('pointermove', showDock);

    // ---- frame loop ----

    // One frame: apply the automatic rules, keep what changed, play their visual events, repaint.
    // The next frame is asked for first, so one frame that throws cannot stop the display for good.
    function frame() {
      raf = requestAnimationFrame(frame);
      try {
        const now = DT.clock.now();
        const out = DT.engine.tick(session, now);
        if (out.session !== session) {
          session = out.session;
          save(false);
          emit('change', session);
        }
        pulse(out.events);
        paint(now);
      } catch (e) {
        console.warn('这一帧没画出来：', e);
      }
    }
    frame();
    if (env.console) setConsole(true);
    const bootNow = DT.clock.now();
    bells.schedule(DT.engine.upcomingBells(session, bootNow), bootNow);   // a resumed clock rings on time
    paintStatus();
    if (env.pinDock) {
      dockPinned = true;
      attr(dock, 'data-pinned', true);
      showDock();
    }

    return {
      session: () => session,
      view: () => viewAt(DT.clock.now()),
      key, act, pulse, openOverlay, closeOverlay, setConsole,
      destroy() {
        if (destroyed) return;
        if (desk) setConsole(false);
        destroyed = true;
        cancelAnimationFrame(raf);
        clearTimeout(dockTimer);
        if (saveTimer) save(false);   // a held-back save goes out now
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('pointerdown', gesture);
        window.removeEventListener('pointermove', showDock);
        bells.cancelAll();
        disarms.forEach(f => f());
        closeOverlay();
        dock.remove();
        status.remove();
        stage.destroy();
        ['data-theme', 'data-idle'].forEach(a => root.removeAttribute(a));
      },
    };
  }

  // The projector window (spec §5.11): draws what the console sends and works out the time in between with
  // its own clock. Every key goes to the console except F, which makes this window full screen. While the
  // console is away on the setup page it shows the match's title card (new spec §2.2).
  function mountProjector(root, env) {
    let stage = DT.render.mount(root);
    const hint = el('div', 'dt-projector-hint');
    hint.append('把这个窗口拖到投影屏幕上，按 ', el('kbd', null, 'F'), ' 全屏');
    root.appendChild(hint);
    attr(root, 'data-layout', 'projector');
    let session = null, raf = null, destroyed = false, away = false;
    let blank = true;   // nothing of a match on the stage: a clear has nothing to do
    const rung = [];   // the console reports each bell it rings; this window may have seen it first

    function pulse(events) {
      events.forEach(e => {
        const id = [e.type, e.clock, e.key, e.at].join('|');
        if (rung.indexOf(id) >= 0) return;
        rung.push(id);
        if (rung.length > RUNG_MEMORY) rung.shift();
        stage.pulse(e);
      });
    }

    function viewAt(now) {
      if (away) {
        const card = DT.engine.view(Object.assign({}, session, { cursor: -1 }), now);
        card.away = awayText(session);   // render.js says where the match paused instead of 空格开始
        return card;
      }
      const v = DT.engine.view(session, now);
      if (v.mode === 'end') v.record = DT.engine.record(session, now);
      return v;
    }

    function draw(now) {
      if (!session || destroyed) return;
      try {
        const out = DT.engine.tick(session, now);   // the automatic rules, until the console's next word
        session = out.session;
        pulse(out.events);
        stage.update(viewAt(now));
        attr(root, 'data-theme', stage.el.getAttribute('data-theme'));
      } catch (e) {
        console.warn('收到的场次无法显示，已丢弃');
        session = null;
      }
    }

    function frame() {
      draw(DT.clock.now());
      raf = requestAnimationFrame(frame);
    }

    const end = DT.sync.createProjectorEnd({
      target: env.window, opener: env.window.opener || null, storage: env.storage, sessionKey: env.sessionKey,
      onState(m) {
        session = m.session;
        blank = false;
        if (typeof m.away === 'boolean') away = m.away;   // a state from storage leaves it as it was
        draw(DT.clock.now());
      },
      onEvents: pulse,
      onToast: message => stage.toast(message),
      onLost: () => stage.toast(CONSOLE_GONE),
      // The console dropped its match (放弃并新开): nothing of it stays on the wall. Its heartbeat repeats the
      // clear every second; once the stage is blank there is nothing more to do.
      onClear() {
        if (blank) return;
        blank = true;
        session = null;
        away = false;
        stage.destroy();
        stage = DT.render.mount(root);
        root.insertBefore(stage.el, hint);
        root.removeAttribute('data-theme');
      },
      onKey(code) {
        attr(hint, 'hidden', true);
        if (code === 'KeyF') toggleFullscreen(root);
        else if (code && away && session) stage.toast(CONSOLE_AWAY);   // the console is on the setup page: say so
      },
    });
    frame();

    return {
      session: () => session,
      view: () => (session ? viewAt(DT.clock.now()) : null),
      destroy() {
        if (destroyed) return;
        destroyed = true;
        cancelAnimationFrame(raf);
        end.stop();
        hint.remove();
        stage.destroy();
        ['data-theme', 'data-layout'].forEach(a => root.removeAttribute(a));
      },
    };
  }

  // The projector route's controller: it only shows, so the timer methods do nothing. Opened from a match
  // file, it follows that file's saved session (boot has set the namespace).
  function bootProjector(root, o, host) {
    let storage = o.storage || null;
    if (!storage) { try { storage = host.localStorage || null; } catch (e) { storage = null; } }
    root.classList.add('dt-app');
    if (host === window) document.title = '投影 - 辩论计时器';
    const handle = mountProjector(root, { window: host, storage, sessionKey: DT.store.sessionKey() });
    return {
      route: () => 'projector', session: handle.session, view: handle.view,
      key: () => false, act: () => false, pulse() {}, openOverlay: () => false, closeOverlay() {},
      on: () => () => {},
      destroy() {
        handle.destroy();
        root.classList.remove('dt-app');
        DT.store.setNamespace(null);
      },
    };
  }

  // Opens the page on its route and moves between the setup page and the timer. The returned controller
  // speaks for the timer while it is on screen; on the setup page its timer methods do nothing.
  // o.window stands for this browser window (tests pass a stand-in); o.pollMs is how often a closed
  // projector window is noticed; o.preset stands for the page's #dt-preset block (null: none).
  function boot(opts) {
    const o = opts || {};
    const root = o.root;
    const host = o.window || window;
    if (o.clock) DT.clock.set(() => o.clock.now());
    const route = o.route ? { name: o.route } : routeOf(o.location || window.location);
    // A match file (new spec §4.3) keeps its session and last match under its own keys. Demos have none.
    const preset = route.name === 'demo' ? null : 'preset' in o ? o.preset : DT.preset.read();
    DT.store.setNamespace(preset ? preset.id : null);
    if (route.name === 'projector') return bootProjector(root, o, host);
    const bells = o.bells || DT.bells;
    let demo = null;
    if (route.name === 'demo') {
      DT.store.useStorage(memoryStorage());
      const now = DT.clock.now();
      if (route.frozen) DT.clock.set(() => now);
      demo = DT.demo.build(route.demo, now, { theme: route.theme });
      if (demo.formats) DT.store.saveFormats(demo.formats);
    } else if (o.storage) {
      DT.store.useStorage(o.storage);
    }
    const settings = DT.store.loadSettings();
    bells.setVolume(settings.volume);
    bells.setMuted(settings.muted);
    root.classList.add('dt-app');

    const listeners = { change: [], events: [], toast: [] };
    let screen = null, destroyed = false;   // {name: 'setup' | 'ask' | 'timer', handle}
    let editor = null;                       // the format editor's handle, until it has closed
    let covered = false;                     // the editor covers the screen: from opening until it starts to leave
    let projector = null;                    // {win, link} while a projector window is open

    function emit(name, arg) {
      listeners[name].slice().forEach(fn => fn(arg));
      relay(name, arg);
    }
    const timer = () => (screen && screen.name === 'timer' ? screen.handle : null);

    // ---- the projector window: this page is the console while one is open (spec §5.11) ----

    // The undo history stays here: it is the bulk of a session and the projector never undoes. `away`: this page
    // has left the timer for the setup page, and the projector shows the title card until it is back.
    function pushState(session, away) {
      const s = session || (timer() ? timer().session() : null);
      if (!projector || !s) return;
      projector.link.push({ type: 'state', session: Object.assign({}, s, { history: [] }),
        settings: { volume: settings.volume, muted: settings.muted }, away: !!away });
    }

    // The match the projector shows is gone (放弃并新开 on the setup page): it goes blank until the next one.
    function clearProjector() {
      if (projector) projector.link.push({ type: 'clear' });
    }

    function relay(name, arg) {
      if (!projector) return;
      if (name === 'change') pushState(arg);
      else if (name === 'events') projector.link.push({ type: 'events', events: arg });
      else if (name === 'toast') projector.link.push({ type: 'toast', message: arg });
    }

    // Kept per tab, so a refreshed console knows to look for its projector window.
    function remember(open) {
      try {
        if (open) host.sessionStorage.setItem(PROJECTOR_FLAG, '1');
        else host.sessionStorage.removeItem(PROJECTOR_FLAG);
      } catch (e) { /* no session storage: a refresh just will not find the window again */ }
    }

    function connect(win) {
      const link = DT.sync.createConsoleLink({
        target: host, pollMs: o.pollMs, getWindow: () => win,
        onKey(code, k) { if (timer() && !covered) timer().key(code, k); },
        onClosed() { if (projector && projector.link === link) disconnect(); },
      });
      projector = { win, link };
      remember(true);
      if (timer()) timer().setConsole(true);
      pushState();
    }

    function disconnect() {
      if (!projector) return;
      projector.link.stop();
      projector = null;
      remember(false);
      if (timer()) timer().setConsole(false);
    }

    // O: open the window, or bring it forward when it is already open. False when the browser blocked it.
    function openProjector() {
      if (projector && !projector.win.closed) {
        try { projector.win.focus(); } catch (e) { /* focus is a nicety */ }
        return true;
      }
      disconnect();
      const win = DT.sync.openProjector(host);
      if (!win) return false;
      connect(win);
      return true;
    }

    function reclaimProjector() {
      let open = false;
      try { open = host.sessionStorage.getItem(PROJECTOR_FLAG) === '1'; } catch (e) { open = false; }
      if (!open) return;
      const win = DT.sync.findProjector(host);
      if (win) connect(win);
      else remember(false);
    }

    function leave() {
      if (screen) screen.handle.destroy();
      screen = null;
    }

    // Starting or resuming is a click or a key press, so the sound can be unlocked right there.
    function unlockSound() { if (!bells.isUnlocked()) bells.unlock(); }

    // The editor covers the page; what is behind it is out of reach until it starts to sink away (new spec §3, P3),
    // and `after(formatId)` runs once it is gone. Until then `editor` stays set, so it cannot open twice.
    function openEditor(selectedId, after) {
      if (editor || destroyed) return;
      const behind = Array.from(root.children);
      const uncover = () => {
        covered = false;
        behind.forEach(c => { c.inert = false; });
      };
      behind.forEach(c => { c.inert = true; });
      covered = true;
      editor = DT.editor.mount(root, {
        formats: DT.store.loadFormats(),
        selectedId,
        themes: themeList(),
        onChange(list) { DT.store.saveFormats(list); },
        onLeave: uncover,
        onClose(id) {
          editor = null;
          uncover();
          if (after && !destroyed) after(id);
        },
      });
    }

    // The file's own match, as the preset set it up (not another one started from the setup page in this file).
    function presetMatch(session) {
      if (!preset || !session || !session.format || session.format.id !== preset.format.id) return false;
      if (session.theme !== preset.theme) return false;
      const m = isObj(session.match) ? session.match : {};
      return ['title'].concat(LAST_MATCH).every(k => (m[k] || '') === (preset.match[k] || ''));
    }

    // extra: {pinDock, console} for the demos.
    function showTimer(given, extra) {
      leave();
      let session = given;
      if (session.exited) {   // back in a match left with 退出: no longer away, so once over it is not offered again
        session = Object.assign({}, session);
        delete session.exited;
        DT.store.saveSession(session);
      }
      const x = extra || {};
      const own = presetMatch(session);
      const env = {
        bells, settings, still: route.name === 'demo' && route.frozen, pinDock: !!x.pinDock, emit,
        console: !!projector || !!x.console, matchFile: !!preset,
        onNewMatch: () => newMatch(own), newLabel: own ? RESTART_LABEL : null,
        onEdit: formatId => openEditor(formatId), onSetup: () => showSetup(), onProjector: openProjector,
        onExit: exitMatch, blocked: () => covered,
      };
      screen = { name: 'timer', handle: mountTimer(root, session, env) };
      pushState();
    }

    // A fresh match from the file's preset, on its title card. The preset's format stays out of the library.
    function presetSession(now) {
      const session = DT.engine.createSession(preset.format, preset.match, now, { theme: preset.theme });
      DT.store.saveSession(session);
      return session;
    }

    // The match is over, so there is nothing to resume: a match file's own match starts again, anything else
    // goes back to the setup page.
    function newMatch(again) {
      DT.store.clearSession();
      if (again) showTimer(presetSession(DT.clock.now()));
      else showSetup();
    }

    // A match file's match left part way: go on, or start it again from a fresh title card (new spec §4.3).
    function showAsk(saved) {
      leave();
      const handle = DT.setup.ask(root, {
        resumable: resumeInfo(saved),
        onResume() {
          unlockSound();
          showTimer(saved);
        },
        onRestart() { newMatch(true); },
      });
      screen = { name: 'ask', handle };
    }

    // Begun means past the title card, or with any clock run: a match only opened and closed is not asked about.
    const begun = s => s.cursor >= 0 || Object.keys(s.runs).length > 0;

    // Q Q or 退出, with the match paused and saved (new spec §2.2): it is saved as left with 退出, so from any card,
    // the end card too, the setup page's banner offers it back (§5.3); a match file always asks 继续上次 or
    // 重新开始这一场, never the plain setup page. The projector window shows the title card meanwhile.
    function exitMatch(session) {
      DT.store.saveSession(Object.assign({}, session, { exited: true }));
      const saved = preset ? resumable(DT.store.loadSession(), DT.clock.now()) : null;
      if (saved) showAsk(saved);
      else showSetup();
      pushState(session, true);
    }

    // `typed`: what was on the page before the editor, with the format last looked at in the editor chosen.
    function showSetup(typed) {
      leave();
      const saved = resumable(DT.store.loadSession(), DT.clock.now());
      const handle = DT.setup.mount(root, {
        formats: DT.store.loadFormats(),
        lastMatch: typed || DT.store.loadLastMatch(),
        resumable: saved ? resumeInfo(saved) : null,
        themes: themeList(),
        canExport: !!DT.preset.sourceParts(),
        // The download is handed to the browser; what it does next (a save dialog the timekeeper may cancel) the page
        // cannot see, so the notice says only whether the file was handed over.
        onExport(format, match, theme) {
          try {
            const p = DT.preset.make(format, match, theme, DT.clock.now());
            DT.store.saveFile(DT.preset.fileName(p), DT.preset.buildHtml(DT.preset.sourceParts(), p), 'text/html');
          } catch (e) {
            console.warn('导出失败：', e);
            handle.toast(EXPORT_FAILED);
            return;
          }
          handle.toast(EXPORTED);
        },
        onStart(format, match, theme) {
          const last = { formatId: format.id };
          LAST_MATCH.forEach(k => { last[k] = match[k]; });
          DT.store.saveLastMatch(last);
          const session = DT.engine.createSession(format, match, DT.clock.now(), { theme });
          DT.store.saveSession(session);
          unlockSound();
          showTimer(session);
        },
        onResume() {
          unlockSound();
          showTimer(saved);
        },
        // In a match file the discarded match makes way for the file's own, on a fresh title card. In the plain
        // timer the projector lets go of it too.
        onDiscard() {
          if (preset) newMatch(true);
          else { DT.store.clearSession(); clearProjector(); }
        },
        onEdit() {
          const before = setupDraft(root);
          openEditor(before.formatId, id => {
            const typed = setupDraft(root) || before;
            showSetup(Object.assign(typed, { formatId: id || typed.formatId }));
            // The setup page does not prefill the match title, so it goes back in by hand.
            const title = root.querySelector('.dt-setup input[name="title"]');
            if (title) title.value = typed.title;
          });
        },
      });
      screen = { name: 'setup', handle };
    }

    if (!demo) reclaimProjector();
    if (demo && demo.route === 'setup') {
      if (demo.lastMatch) DT.store.saveLastMatch(demo.lastMatch);
      if (demo.session) DT.store.saveSession(demo.session);
      showSetup();
    } else if (demo) {
      showTimer(demo.session, { pinDock: demo.dock, console: demo.console });
      if (demo.overlay) timer().openOverlay(demo.overlay);
      if (demo.editor) {
        openEditor(demo.session.format.id);
        stageEditorDemo(root, demo.editor);
      }
    } else if (preset) {
      const now = DT.clock.now();
      const saved = resumable(DT.store.loadSession(), now);
      if (saved && begun(saved)) showAsk(saved);
      else showTimer(saved || presetSession(now));
    } else if (route.name === 'timer') {
      const now = DT.clock.now();
      showTimer(resumable(DT.store.loadSession(), now) || newSession(o, now));
    } else {
      showSetup();
    }

    return {
      route: () => (screen ? screen.name : null),
      session: () => (timer() ? timer().session() : null),
      view: () => (timer() ? timer().view() : null),
      key: (code, k) => (timer() ? timer().key(code, k) : false),
      act() { const t = timer(); return t ? t.act.apply(null, arguments) : false; },
      // Shows bell events as if their clock had rung them (the ?test=1 hook: a countdown no format has).
      pulse(events) { if (timer()) timer().pulse(events); },
      openOverlay: name => (timer() ? timer().openOverlay(name) : false),
      closeOverlay() { if (timer()) timer().closeOverlay(); },
      on(name, fn) {
        listeners[name].push(fn);
        return () => { listeners[name] = listeners[name].filter(f => f !== fn); };
      },
      // The last screen stays readable (session(), view()) after destroy, but nothing acts any more.
      destroy() {
        if (destroyed) return;
        destroyed = true;
        if (editor) { editor.destroy(); editor = null; }
        if (projector) { projector.link.stop(); projector = null; }   // the window itself stays for a reload
        if (screen) screen.handle.destroy();
        root.classList.remove('dt-app');
        Object.keys(listeners).forEach(k => { listeners[k] = []; });
        DT.store.setNamespace(null);
      },
    };
  }

  // ?exportProbe=1: no app, just the page a fixed match would export, as the text of the pre #export-probe,
  // for tests/test_export.py to open in its turn.
  function exportProbe() {
    const format = DT.BUILTIN_FORMATS.find(f => f.id === PROBE.format);
    const parts = DT.preset.sourceParts();
    const pre = el('pre');
    pre.id = 'export-probe';
    pre.textContent = parts ? DT.preset.buildHtml(parts, DT.preset.make(format, PROBE.match, PROBE.theme, DT.clock.now())) : '';
    document.body.appendChild(pre);
  }

  function autoboot() {
    DT.preset.captureSource();   // first, before anything changes the page: an export copies it as loaded
    if (!document.body.hasAttribute('data-dt-autoboot')) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('exportProbe') === '1') { exportProbe(); return; }
    const app = boot({ root: document.getElementById('app') });
    // ?test=1: a look at the app for tests/test_keyboard.py, which drives the page with real input, and the levers
    // tests/motion.py samples moments with: the controller's actions, bell events, and a clock it can move on and
    // slow down. That clock takes over DT.clock only once advance or setRate is first called.
    if (params.get('test') === '1') {
      const copy = v => (v ? JSON.parse(JSON.stringify(v)) : v);
      let clock = null;   // {at: DT.clock time at `real`, real: performance.now() then, rate}
      const own = () => {
        if (clock) return;
        clock = { at: DT.clock.now(), real: performance.now(), rate: 1 };
        DT.clock.set(() => clock.at + (performance.now() - clock.real) * clock.rate);
      };
      window.__dtTest = {
        route: () => app.route(), session: () => copy(app.session()), view: () => copy(app.view()),
        act() { return app.act.apply(null, arguments); },
        pulse: events => app.pulse(events),
        advance(ms) { own(); clock.at += ms; },
        // The match clock, the renderer's timers and with them a painter's time run at `r` of real time; the
        // caller slows the CSS animations to match (Animation.setPlaybackRate).
        setRate(r) {
          own();
          clock.at = DT.clock.now();
          clock.real = performance.now();
          clock.rate = r;
          DT.render.setRate(r);
        },
      };
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoboot);
  else autoboot();

  DT.app = { boot };
})(window.DT = window.DT || {});
