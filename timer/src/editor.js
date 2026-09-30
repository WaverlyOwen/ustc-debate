/* editor.js: the format editor, a full-screen panel over the setup page or the timer (spec §5.10).
   Every edit lands on a draft of the chosen format first; only a draft that validates goes out through onChange. */
(function (DT) {
  'use strict';
  const CLOSE_MS = 260;    // the panel sinks back down in this long; editor.css animates the same 260ms
  const SAVED_MS = 1800;   // 已保存 stays up this long after a save
  const TYPES = [
    ['single', '单方', '一方发言，一个计时器：立论、质询、结辩'],
    ['dual', '双方', '双方各自计时、轮流发言：自由辩、对辩'],
    ['break', '间隔', '评委打分、中场休息：到 0 自动停'],
  ];
  const SIDES = [['pro', '正', '正方'], ['con', '反', '反方']];
  const COUNTDOWNS = [0, 3, 5, 10];
  const END_NAMES = { double: '两声', triple: '三声', long: '长鸣', chime: '轻铃', none: '不响' };
  const MSG = {
    secs: '时长写成 3:00 或 180',
    warn: '提示铃点写成秒数，如 30 或 60, 30',
  };
  const CHEVRON = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M3.6 1.6 7 5 3.6 8.4" fill="none" ' +
    'stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const clone = v => JSON.parse(JSON.stringify(v));

  // Static markup only; format and stage text goes in through textContent and value.
  const TEMPLATE =
    '<header class="dt-ed-head"><div class="dt-ed-title"><h1>编辑赛制</h1><p>改动会自动保存</p></div>' +
    '<span class="dt-ed-status" role="status" aria-live="polite"></span>' +
    '<button type="button" class="dt-button" data-action="close" data-primary>完成</button></header>' +
    '<div class="dt-ed-body">' +
    '<aside class="dt-ed-side" aria-label="赛制"><div class="dt-ed-list"></div>' +
    '<div class="dt-ed-tools">' +
    '<button type="button" class="dt-button" data-action="new">＋ 新建</button>' +
    '<button type="button" class="dt-button" data-action="duplicate">复制</button>' +
    '<button type="button" class="dt-button" data-action="import">导入</button>' +
    '<button type="button" class="dt-button" data-action="export">导出</button>' +
    '<button type="button" class="dt-button" data-action="delete">删除</button>' +
    '<button type="button" class="dt-button" data-action="restore">恢复默认</button>' +
    '</div><div class="dt-ed-notice" role="status" aria-live="polite"></div></aside>' +
    '<main class="dt-ed-main"></main></div>';

  function el(tag, cls, content) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (content !== undefined) e.textContent = content;
    return e;
  }

  function button(label, action, cls) {
    const b = el('button', cls || 'dt-button', label);
    b.type = 'button';
    if (action) b.dataset.action = action;
    return b;
  }

  const reducedMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // Moves one stage; the format and its stage list are left as they were. Shared by dragging and Alt+↑ / Alt+↓.
  function moveStage(format, from, to) {
    const stages = format.stages.slice();
    if (from >= 0 && from < stages.length) {
      const moved = stages.splice(from, 1)[0];
      stages.splice(Math.max(0, Math.min(stages.length, to)), 0, moved);
    }
    return Object.assign({}, format, { stages });
  }

  // Speaking stages (breaks left out) and the whole length, counted the way the setup page counts them.
  function summary(format) {
    const stages = format.stages.filter(s => s.type !== 'break').length;
    const secs = format.stages.reduce((n, s) => n + (s.secs || 0) * (s.type === 'dual' ? 2 : 1), 0);
    return stages + ' 个发言环节，约 ' + Math.max(1, Math.round(secs / 60)) + ' 分钟';
  }

  // Why a duration box could not be read: out of range when the digits themselves make sense.
  function secsMessage(text) {
    const m = /^\s*(\d+)(?:[:：](\d{2}))?\s*$/.exec(text);
    const secs = m ? +m[1] * (m[2] ? 60 : 1) + (m[2] ? +m[2] : 0) : null;
    if (secs === 0) return '时长要大于 0 秒';
    if (secs > 3600) return '时长不能超过 60 分钟';
    return MSG.secs;
  }

  // "60, 30" / "60，30" / "60 30秒" -> [60, 30]; an empty box is no warning bell; anything else is null.
  function parseWarn(text) {
    const parts = String(text).split(/[\s,，、;；]+/).filter(Boolean).map(p => p.replace(/(秒|s)$/i, ''));
    if (!parts.every(p => /^\d+$/.test(p) && +p >= 1 && +p <= 3600)) return null;
    return Array.from(new Set(parts.map(Number))).sort((a, b) => b - a);
  }

  // ---- default file access; tests pass their own ----

  function pickFiles() {
    return new Promise(resolve => {
      const input = el('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.multiple = true;
      input.hidden = true;
      const read = file => new Promise(done => {
        const r = new FileReader();
        r.onload = () => done(String(r.result));
        r.onerror = () => done('');
        r.readAsText(file, 'utf-8');
      });
      input.addEventListener('change', () => {
        Promise.all(Array.from(input.files || []).map(read)).then(resolve);
        input.remove();
      });
      input.addEventListener('cancel', () => { resolve([]); input.remove(); });
      document.body.appendChild(input);
      input.click();
    });
  }

  function saveFile(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = el('a');
    a.href = url;
    a.download = name;
    a.hidden = true;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function mount(root, opts) {
    const o = opts || {};
    let list = Array.isArray(o.formats) ? o.formats.slice() : [];
    const themes = Array.isArray(o.themes) && o.themes.length ? o.themes : [{ id: 'hall', name: '堂' }];
    const pick = o.pickFiles || pickFiles;
    const save = o.saveFile || saveFile;

    let currentId = null;
    let draft = null;            // the chosen format as edited; list keeps the last version that validated
    let bad = {};                // data-key -> {text, msg, where()}: boxes whose text cannot be read yet
    let expanded = new Set();    // stage ids whose details are open
    let dialog = null, closing = false, destroyed = false, savedTimer = null;
    let dragging = null;         // the end() of a drag under way, so destroy can call it off

    const panel = el('div', 'dt-editor');
    panel.innerHTML = TEMPLATE;
    // The editor always wears the default theme, whatever theme the match behind it is shown in.
    panel.setAttribute('data-theme', 'hall');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', '编辑赛制');
    panel.tabIndex = -1;
    const $ = sel => panel.querySelector(sel);
    const listEl = $('.dt-ed-list'), main = $('.dt-ed-main'), statusEl = $('.dt-ed-status'), notice = $('.dt-ed-notice');
    const tool = name => $('.dt-ed-tools button[data-action="' + name + '"]');
    const saved = () => list.find(f => f.id === currentId) || null;
    const byKey = key => Array.from(main.querySelectorAll('[data-key]')).find(x => x.dataset.key === key) || null;

    // ---- saving ----

    function status(kind, count) {
      clearTimeout(savedTimer);
      if (kind === 'saved') {
        statusEl.dataset.kind = 'saved';
        statusEl.textContent = '已保存';
        statusEl.setAttribute('data-shown', '');
        savedTimer = setTimeout(() => statusEl.removeAttribute('data-shown'), SAVED_MS);
      } else if (kind === 'invalid') {
        statusEl.dataset.kind = 'invalid';
        statusEl.textContent = '有 ' + count + ' 处要改，改好才会保存';
        statusEl.setAttribute('data-shown', '');
      } else if (statusEl.dataset.kind === 'invalid') {
        statusEl.removeAttribute('data-shown');
      }
    }

    function publish(next) {
      list = next;
      if (o.onChange) o.onChange(list);
      status('saved');
    }

    // Validate the draft; if it holds, put it in the list and hand the list on. Returns whether it holds.
    function commit() {
      const errs = DT.store.validateFormat(draft);
      paintErrors(errs);
      paintMeta();
      const count = errs.length + Object.keys(bad).length;
      if (count) {
        status('invalid', count);
        paintTools();
        return false;
      }
      const last = saved();
      if (last && JSON.stringify(last) === JSON.stringify(draft)) {
        status(null);
      } else {
        publish(list.map(f => (f.id === draft.id ? clone(draft) : f)));
        renderList();
      }
      paintTools();
      return true;
    }

    // Validation messages go to the part of the form they are about; 第 N 个环节 goes to that row, and a repeated
    // extra group's name to the repeat rather than the first group of that name (`dups` counts them per name).
    function slotOf(msg, dups) {
      const m = /^第 (\d+) 个环节：/.exec(msg);
      if (m) return ['stage:' + (+m[1] - 1), msg.slice(m[0].length)];
      if (msg.indexOf('赛制名称') === 0) return ['name', msg];
      if (msg.indexOf('铃声：') === 0) return ['bells', msg];
      if (msg === '至少要有一个环节') return ['stages', msg];
      const groups = draft.extras || [];
      if (msg === '可插入环节的名称不能为空') {
        const gi = groups.findIndex(g => !g || typeof g.group !== 'string' || !g.group.trim());
        if (gi >= 0) return ['extra:' + gi, '名称不能为空'];
      }
      const dup = /^可插入环节「([\s\S]*)」：名称和前面的一组重复$/.exec(msg);
      if (dup) {
        const name = dup[1].trim();
        const same = groups.map((g, gi) => (g && typeof g.group === 'string' && g.group.trim() === name ? gi : -1)).filter(gi => gi >= 0);
        dups[name] = (dups[name] || 0) + 1;
        const gi = same[Math.min(dups[name], same.length - 1)];
        if (gi !== undefined) return ['extra:' + gi, '名称和前面的一组重复'];
      }
      for (let gi = 0; gi < groups.length; gi++) {
        const p = '可插入环节「' + (groups[gi] && groups[gi].group) + '」';
        if (msg.indexOf(p) === 0) return ['extra:' + gi, msg.slice(p.length).replace(/^：/, '')];
      }
      return ['general', msg];
    }

    function paintErrors(errs) {
      const slots = {};
      const durations = {};   // slot -> whether every message in it is about a duration box
      const add = (slot, msg, secs) => {
        (slots[slot] = slots[slot] || []).push(msg);
        durations[slot] = (durations[slot] !== false) && secs;
      };
      Object.keys(bad).forEach(k => add(bad[k].where(), bad[k].msg, /:secs$/.test(k)));
      const marks = Object.keys(bad);
      const dups = {};
      errs.forEach(e => {
        const [slot, msg] = slotOf(e, dups);
        add(slot, msg, msg.indexOf('时长') === 0);
        const row = /^stage:(\d+)$/.exec(slot);
        const s = row && draft.stages[+row[1]];
        if (s && msg.indexOf('名称') === 0) marks.push('s:' + s.id + ':name');
        if (s && msg.indexOf('时长') === 0) marks.push('s:' + s.id + ':secs');
        if (slot === 'name') marks.push('f:name');
      });
      const shown = {};
      main.querySelectorAll('[data-slot]').forEach(m => {
        const slot = m.dataset.slot;
        shown[slot] = true;
        m.textContent = (slots[slot] || []).join('；');
        // A stage row's message sits under the duration box when that is all it is about (editor.css).
        if (durations[slot] && /^stage:/.test(slot)) m.setAttribute('data-about', 'secs');
        else m.removeAttribute('data-about');
      });
      // Anything without a place of its own (a row that is not drawn, say) is listed at the top.
      const loose = Object.keys(slots).filter(k => !shown[k] && k !== 'general').map(k => slots[k].join('；'));
      const general = main.querySelector('[data-slot="general"]');
      if (general && loose.length) general.textContent = [general.textContent].concat(loose).filter(Boolean).join('；');
      main.querySelectorAll('[aria-invalid]').forEach(x => x.removeAttribute('aria-invalid'));
      marks.forEach(k => { const x = byKey(k); if (x) x.setAttribute('aria-invalid', 'true'); });
      main.querySelectorAll('[data-stage-index]').forEach(r => {
        if (slots['stage:' + r.dataset.stageIndex]) r.setAttribute('data-invalid', '');
        else r.removeAttribute('data-invalid');
      });
    }

    function paintMeta() {
      const meta = main.querySelector('.dt-ed-meta');
      if (meta) meta.textContent = summary(draft);
    }

    function paintTools() {
      const f = saved();
      const builtin = !!(f && f.builtin);
      const del = tool('delete'), restore = tool('restore');
      del.disabled = !f || builtin;
      del.title = builtin ? '内置赛制不能删除，改乱了可以「恢复默认」' : '';
      const clean = builtin && DT.store.isPristine(f) && DT.store.isPristine(draft) && !Object.keys(bad).length;
      restore.disabled = !builtin || clean;
      restore.title = builtin ? '换回赛制库里的原样' : '只有内置赛制能恢复默认';
      tool('duplicate').disabled = tool('export').disabled = !f;
    }

    function note(lines) {
      notice.textContent = '';
      lines.forEach(([kind, msg]) => {
        const p = el('p', null, msg);
        p.dataset.kind = kind;
        notice.appendChild(p);
      });
    }

    // ---- the format list ----

    function renderList() {
      listEl.textContent = '';
      [['内置', list.filter(f => f.builtin)], ['我的', list.filter(f => !f.builtin)]].forEach(([label, group]) => {
        const box = el('div', 'dt-ed-group');
        box.appendChild(el('p', 'dt-ed-group-label', label));
        group.forEach(f => {
          const b = button(null, null, 'dt-ed-format');
          b.dataset.formatId = f.id;
          b.setAttribute('aria-current', f.id === currentId ? 'true' : 'false');
          b.appendChild(el('span', 'dt-ed-format-name', f.name));
          const meta = el('span', 'dt-ed-format-meta', summary(f));
          if (f.builtin && !DT.store.isPristine(f)) meta.appendChild(el('em', null, '已改'));
          b.appendChild(meta);
          b.addEventListener('click', () => { if (f.id !== currentId) settle(SWITCH, () => select(f.id)); });
          box.appendChild(b);
        });
        if (!group.length) box.appendChild(el('p', 'dt-ed-empty', '还没有。点「新建」从头写，或选一个内置赛制「复制」后再改。'));
        listEl.appendChild(box);
      });
    }

    // ---- form parts ----

    function text(name, key, value, cls) {
      const x = el('input', 'dt-input' + (cls ? ' ' + cls : ''));
      x.type = 'text';
      x.name = name;
      x.autocomplete = 'off';
      x.spellcheck = false;
      x.dataset.key = key;
      x.value = bad[key] ? bad[key].text : value;
      return x;
    }

    // A free text field; an empty optional field is dropped from the stage rather than kept as ''.
    function textField(name, key, obj, prop, cls, optional) {
      const x = text(name, key, obj[prop] || '', cls);
      const put = v => { if (optional && !v) delete obj[prop]; else obj[prop] = v; };
      x.addEventListener('input', () => { put(x.value); commit(); });
      x.addEventListener('change', () => {
        const v = x.value.trim();
        if (v !== x.value) x.value = v;
        put(v);
        commit();
      });
      return x;
    }

    // A box read by `parse` when it is left: good text is stored and shown the tidy way, bad text is kept and named.
    // `slot` names where its message goes; a function, for a stage row, so the message follows the stage.
    function parsedField(name, key, shown, slot, parse, message, store) {
      const x = text(name, key, shown, name === 'secs' ? 'dt-ed-secs' : 'dt-ed-short');
      const where = typeof slot === 'function' ? slot : () => slot;
      x.addEventListener('change', () => {
        const v = parse(x.value);
        if (v === null) bad[key] = { text: x.value, msg: message(x.value), where };
        else {
          delete bad[key];
          x.value = store(v);
        }
        commit();
      });
      return x;
    }

    function secsField(key, obj, slot) {
      return parsedField('secs', key, DT.store.formatDuration(obj.secs || 0), slot, DT.store.parseDuration, secsMessage,
        v => { obj.secs = v; return DT.store.formatDuration(v); });
    }

    function field(label, control, cls) {
      const f = el('label', 'dt-ed-field' + (cls ? ' ' + cls : ''));
      f.appendChild(el('span', 'dt-ed-label', label));
      f.appendChild(control);
      return f;
    }

    function selectBox(name, key, options, value) {
      const s = el('select', 'dt-input dt-ed-select');
      s.name = name;
      s.dataset.key = key;
      options.forEach(([v, label]) => {
        const op = el('option', null, label);
        op.value = String(v);
        s.appendChild(op);
      });
      s.value = String(value);
      return s;
    }

    // One segmented choice: a button per option, the chosen one pressed.
    function segmented(label, attr, key, options, value, onPick) {
      const g = el('div', 'dt-ed-seg');
      g.setAttribute('role', 'group');
      g.setAttribute('aria-label', label);
      options.forEach(([v, name, title]) => {
        const b = button(name, null, 'dt-ed-seg-btn');
        b.setAttribute('data-' + attr, v);
        b.dataset.key = key + ':' + v;
        b.setAttribute('aria-pressed', v === value ? 'true' : 'false');
        if (title) b.title = title;
        b.addEventListener('click', () => { if (v !== value) onPick(v); });
        g.appendChild(b);
      });
      return g;
    }

    // Warning bells, countdown and end bell. `set(field, value)` stores one of them.
    function bellControls(bells, key, slot, set, isBreak) {
      const box = el('div', 'dt-ed-bells');
      const warn = parsedField('warn', key + ':warn', bells.warn.join(', '), slot, parseWarn, () => MSG.warn,
        v => { set('warn', v); return v.join(', '); });
      warn.setAttribute('aria-label', '提示铃点（剩余秒数）');
      warn.placeholder = '不响';
      const w = field('提示', warn);
      w.appendChild(el('span', 'dt-ed-unit', '秒'));
      w.title = '剩这么多秒时响一声；可以写几个，如 60, 30';
      box.appendChild(w);
      const counts = COUNTDOWNS.indexOf(bells.countdown) >= 0 ? COUNTDOWNS : COUNTDOWNS.concat([bells.countdown]).sort((a, b) => a - b);
      const cd = selectBox('countdown', key + ':countdown', counts.map(n => [n, n ? '最后 ' + n + ' 秒' : '关']), bells.countdown);
      cd.addEventListener('change', () => { set('countdown', +cd.value); commit(); });
      box.appendChild(field('逐秒倒数', cd));
      const ends = ['double', 'triple', 'long', 'none'];
      if (isBreak || bells.end === 'chime') ends.splice(3, 0, 'chime');
      const end = selectBox('end', key + ':end', ends.map(e => [e, END_NAMES[e]]), bells.end);
      end.addEventListener('change', () => { set('end', end.value); commit(); });
      box.appendChild(field('终止铃', end));
      return box;
    }

    function msgSlot(slot) {
      const p = el('p', 'dt-ed-msg');
      p.dataset.slot = slot;
      return p;
    }

    // ---- the form ----

    function formatSection() {
      const sec = el('section', 'dt-ed-section dt-ed-format-head');
      const name = textField('format-name', 'f:name', draft, 'name', 'dt-input-title dt-ed-name');
      name.setAttribute('aria-label', '赛制名称');
      const nameField = field('名称', name, 'dt-ed-grow');
      nameField.appendChild(msgSlot('name'));
      sec.appendChild(nameField);
      const known = themes.some(t => t.id === draft.theme);
      const options = themes.map(t => [t.id, t.name || t.id]);
      if (!known) options.push([draft.theme, '找不到这个主题，按「堂」显示']);
      const theme = selectBox('theme', 'f:theme', options, draft.theme);
      const hint = el('span', 'dt-ed-hint');
      const describe = () => { const t = themes.find(x => x.id === theme.value); hint.textContent = (t && t.desc) || ''; };
      theme.addEventListener('change', () => { draft.theme = theme.value; describe(); commit(); });
      describe();
      const themeField = field('主题', theme);
      themeField.appendChild(hint);
      sec.appendChild(themeField);
      return sec;
    }

    function bellsSection() {
      const sec = el('section', 'dt-ed-section');
      sec.appendChild(el('h2', 'dt-ed-h2', '默认铃声'));
      sec.appendChild(bellControls(DT.engine.effectiveBells(draft, null), 'f:bells', 'bells', (k, v) => {
        draft.bells = Object.assign(DT.engine.effectiveBells(draft, null), { [k]: v });
      }, false));
      sec.appendChild(el('p', 'dt-ed-hint', '每个环节都照这个响，间隔环节除外；个别环节可以在它的「更多」里另设。'));
      sec.appendChild(msgSlot('bells'));
      return sec;
    }

    const rowOf = s => () => 'stage:' + draft.stages.indexOf(s);

    function setType(s, type) {
      const side = s.side || s.first || 'pro';
      s.type = type;
      s.side = type === 'single' ? side : null;
      if (type === 'dual') s.first = side;
      else delete s.first;
      renderForm();
      commit();
    }

    function stageRow(s, i, count) {
      const k = 's:' + s.id;
      const li = el('li', 'dt-ed-stage');
      li.dataset.stageIndex = String(i);
      li.dataset.tone = s.type === 'dual' ? 'dual' : s.side || 'none';
      const line = el('div', 'dt-ed-line');

      const handle = button('⠿', null, 'dt-ed-handle');
      handle.dataset.key = k + ':handle';
      handle.setAttribute('aria-label', '拖动排序，或按 Alt+↑ / Alt+↓ 上移下移');
      handle.title = '拖动排序（Alt+↑ / Alt+↓ 上移下移）';
      handle.addEventListener('pointerdown', e => startDrag(e, li, i));
      line.appendChild(handle);
      line.appendChild(el('span', 'dt-ed-index', String(i + 1)));

      const name = textField('name', k + ':name', s, 'name', 'dt-input-title');
      name.setAttribute('aria-label', '第 ' + (i + 1) + ' 个环节的名称');
      line.appendChild(name);

      line.appendChild(segmented('计时方式', 'type', k + ':type', TYPES, s.type, t => setType(s, t)));

      const side = el('div', 'dt-ed-side-cell');
      if (s.type === 'single') {
        side.appendChild(segmented('持方', 'side', k + ':side', SIDES, s.side, v => {
          s.side = v;
          renderForm();
          commit();
        }));
      } else if (s.type === 'dual') {
        side.appendChild(el('span', 'dt-ed-label', '先发言'));
        side.appendChild(segmented('先发言', 'first', k + ':first', SIDES, s.first, v => {
          s.first = v;
          renderForm();
          commit();
        }));
      }
      line.appendChild(side);

      const time = el('div', 'dt-ed-time');
      if (s.type === 'dual') time.appendChild(el('span', 'dt-ed-unit', '各'));
      const secs = secsField(k + ':secs', s, rowOf(s));
      secs.setAttribute('aria-label', s.type === 'dual' ? '每方时长' : '时长');
      time.appendChild(secs);
      line.appendChild(time);

      const open = expanded.has(s.id);
      const more = button(null, 'expand', 'dt-ed-icon');
      more.innerHTML = CHEVRON;
      more.dataset.key = k + ':expand';
      more.setAttribute('aria-expanded', open ? 'true' : 'false');
      more.setAttribute('aria-label', '更多设置：发言人、打分块、提示、铃声');
      more.title = '更多设置';
      more.addEventListener('click', () => {
        if (expanded.has(s.id)) expanded.delete(s.id); else expanded.add(s.id);
        renderForm();
      });
      line.appendChild(more);

      const remove = button('✕', 'remove-stage', 'dt-ed-icon dt-ed-remove');
      remove.dataset.key = k + ':remove';
      remove.setAttribute('aria-label', '删除这个环节');
      remove.title = count > 1 ? '删除这个环节' : '至少要留一个环节';
      remove.disabled = count <= 1;
      remove.addEventListener('click', () => {
        const at = draft.stages.indexOf(s);
        draft.stages.splice(at, 1);
        Object.keys(bad).forEach(key => { if (key.indexOf(k + ':') === 0) delete bad[key]; });
        renderForm();
        const next = draft.stages[Math.min(at, draft.stages.length - 1)];
        focusKey('s:' + next.id + ':remove');
        commit();
      });
      line.appendChild(remove);

      li.appendChild(line);
      li.appendChild(msgSlot('stage:' + i));
      if (open) li.appendChild(stageDetails(s, k));
      return li;
    }

    function stageDetails(s, k) {
      const box = el('div', 'dt-ed-details');
      const speaker = textField('speaker', k + ':speaker', s, 'speaker', null, true);
      speaker.placeholder = '投影上显示，如：正一';
      box.appendChild(field('发言人', speaker));
      const block = textField('block', k + ':block', s, 'block', 'dt-ed-short', true);
      block.placeholder = '如：A';
      const b = field('打分块', block);
      b.title = '同一块的环节在投影底部的进度条上排在一起';
      box.appendChild(b);
      const noteBox = textField('note', k + ':note', s, 'note', null, true);
      noteBox.placeholder = '只在操作台显示，不上投影';
      box.appendChild(field('计时员提示', noteBox, 'dt-ed-wide'));

      const custom = !!s.bells;
      const mode = selectBox('bells-mode', k + ':bells-mode', [['follow', s.type === 'break' ? '跟随默认（轻铃一声）' : '跟随赛制'], ['custom', '自定义']],
        custom ? 'custom' : 'follow');
      mode.addEventListener('change', () => {
        if (mode.value === 'custom') s.bells = DT.engine.effectiveBells(draft, Object.assign({}, s, { bells: undefined }));
        else delete s.bells;
        Object.keys(bad).forEach(key => { if (key.indexOf(k + ':bells') === 0) delete bad[key]; });
        renderForm();
        commit();
      });
      const bells = el('div', 'dt-ed-stage-bells dt-ed-wide');
      bells.appendChild(field('本环节铃声', mode));
      if (custom) {
        bells.appendChild(bellControls(DT.engine.effectiveBells(draft, s), k + ':bells', rowOf(s), (key, v) => {
          s.bells[key] = v;
        }, s.type === 'break'));
      }
      box.appendChild(bells);
      return box;
    }

    function stagesSection() {
      const sec = el('section', 'dt-ed-section');
      const head = el('div', 'dt-ed-section-head');
      head.appendChild(el('h2', 'dt-ed-h2', '环节'));
      head.appendChild(el('span', 'dt-ed-meta', summary(draft)));
      sec.appendChild(head);
      sec.appendChild(msgSlot('stages'));
      const cols = el('div', 'dt-ed-line dt-ed-cols');
      cols.setAttribute('aria-hidden', 'true');
      ['', '', '名称', '计时方式', '持方', '时长', '', ''].forEach(c => cols.appendChild(el('span', null, c)));
      sec.appendChild(cols);
      const box = el('div', 'dt-ed-stagebox');
      const ol = el('ol', 'dt-ed-stages');
      draft.stages.forEach((s, i) => ol.appendChild(stageRow(s, i, draft.stages.length)));
      box.appendChild(ol);
      const drop = el('div', 'dt-ed-drop');
      drop.hidden = true;
      box.appendChild(drop);
      sec.appendChild(box);
      const add = button('＋ 添加环节', 'add-stage', 'dt-ed-add');
      add.addEventListener('click', addStage);
      sec.appendChild(add);
      return sec;
    }

    function addStage() {
      const s = DT.store.newStage('single');
      const lastSide = draft.stages.map(x => x.side || x.first).filter(Boolean).pop();
      if (lastSide) s.side = lastSide === 'pro' ? 'con' : 'pro';   // debates take turns
      draft.stages.push(s);
      renderForm();
      commit();
      const name = byKey('s:' + s.id + ':name');
      if (name) { name.focus(); name.select(); }
    }

    function extraGroup(g, gi, groups) {
      const k = 'x:' + gi;
      const box = el('div', 'dt-ed-extra');
      box.dataset.extraIndex = String(gi);
      const head = el('div', 'dt-ed-extra-head');
      const name = textField('group', k + ':group', g, 'group', 'dt-input-title');
      head.appendChild(field('名称', name, 'dt-ed-grow'));
      const per = text('perSide', k + ':perSide', String(g.perSide), 'dt-ed-short');
      per.type = 'number';
      per.min = '1';
      per.step = '1';
      per.addEventListener('change', () => { g.perSide = per.value === '' ? 0 : Number(per.value); commit(); });
      const perField = field('每方', per);
      perField.appendChild(el('span', 'dt-ed-unit', '次'));
      head.appendChild(perField);
      const drop = button('删除这组', 'remove-extra');
      drop.addEventListener('click', () => {
        groups.splice(gi, 1);
        clearExtraBad();
        renderForm();
        commit();
      });
      head.appendChild(drop);
      box.appendChild(head);
      const rows = el('div', 'dt-ed-variants');
      g.variants.forEach((v, vi) => {
        const vk = k + ':' + vi;
        const row = el('div', 'dt-ed-variant');
        const vname = textField('name', vk + ':name', v, 'name', 'dt-input-title');
        vname.setAttribute('aria-label', '形式名称');
        row.appendChild(vname);
        const secs = secsField(vk + ':secs', v, 'extra:' + gi);
        secs.setAttribute('aria-label', '时长');
        row.appendChild(secs);
        const vnote = textField('note', vk + ':note', v, 'note', null, true);
        vnote.placeholder = '计时员提示，可不填';
        vnote.setAttribute('aria-label', '计时员提示');
        row.appendChild(vnote);
        const x = button('✕', 'remove-variant', 'dt-ed-icon dt-ed-remove');
        x.setAttribute('aria-label', '删除这种形式');
        x.disabled = g.variants.length <= 1;
        x.addEventListener('click', () => {
          g.variants.splice(vi, 1);
          clearExtraBad();
          renderForm();
          commit();
        });
        row.appendChild(x);
        rows.appendChild(row);
      });
      box.appendChild(rows);
      const addV = button('＋ 添加一种形式', 'add-variant', 'dt-ed-add dt-ed-add-small');
      addV.addEventListener('click', () => {
        g.variants.push({ name: '新形式', type: 'single', secs: 120 });
        renderForm();
        commit();
      });
      box.appendChild(addV);
      box.appendChild(msgSlot('extra:' + gi));
      return box;
    }

    function clearExtraBad() { Object.keys(bad).forEach(key => { if (key.indexOf('x:') === 0) delete bad[key]; }); }

    function extrasSection() {
      const sec = el('section', 'dt-ed-section');
      const head = el('div', 'dt-ed-section-head');
      head.appendChild(el('h2', 'dt-ed-h2', '可插入环节'));
      head.appendChild(el('span', 'dt-ed-meta', '比赛中可以插在任意环节之后，每方限次，如奇袭'));
      sec.appendChild(head);
      const groups = draft.extras || (draft.extras = []);
      groups.forEach((g, gi) => sec.appendChild(extraGroup(g, gi, groups)));
      const add = button('＋ 添加', 'add-extra', 'dt-ed-add');
      add.addEventListener('click', () => {
        const taken = groups.map(g => g.group);
        let name = '奇袭', n = 1;
        while (taken.indexOf(name) >= 0) name = '可插入环节 ' + (++n);
        groups.push({ group: name, perSide: 1, variants: [{ name: '奇袭质询', type: 'single', secs: 150 }] });
        renderForm();
        commit();
      });
      sec.appendChild(add);
      return sec;
    }

    function focusKey(key) {
      const x = key && byKey(key);
      if (x && !x.disabled) x.focus();
      return !!x;
    }

    // Redraws the form from the draft, keeping the scroll position and the focused control.
    function renderForm() {
      const active = document.activeElement;
      const key = active && main.contains(active) ? active.dataset.key : null;
      const top = main.scrollTop;
      main.textContent = '';
      if (!draft) return;
      main.appendChild(msgSlot('general'));
      [formatSection(), bellsSection(), stagesSection(), extrasSection()].forEach(s => main.appendChild(s));
      paintErrors(DT.store.validateFormat(draft));
      main.scrollTop = top;
      focusKey(key);
    }

    // ---- reordering ----

    function moveTo(from, to) {
      if (destroyed || to < 0 || to >= draft.stages.length || to === from) return;
      draft = moveStage(draft, from, to);
      renderForm();
      commit();
    }

    main.addEventListener('keydown', e => {
      const li = e.target.closest && e.target.closest('[data-stage-index]');
      const step = { ArrowUp: -1, ArrowDown: 1 }[e.code];
      if (!li || !step || e.target.tagName === 'SELECT' || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (!e.altKey && !e.target.classList.contains('dt-ed-handle')) return;
      e.preventDefault();
      const from = +li.dataset.stageIndex;
      moveTo(from, from + step);
    });

    // Pointer dragging on the handle: the row fades, a gold line marks where it will land.
    function startDrag(e, li, from) {
      if (e.button !== 0 || draft.stages.length < 2) return;
      e.preventDefault();
      const rows = Array.from(li.parentNode.children);
      const drop = main.querySelector('.dt-ed-drop');
      try { e.target.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointers cannot be captured */ }
      li.setAttribute('data-dragging', '');
      let gap = from;
      function onMove(ev) {
        gap = rows.findIndex(r => { const b = r.getBoundingClientRect(); return ev.clientY < b.top + b.height / 2; });
        if (gap < 0) gap = rows.length;
        drop.hidden = gap === from || gap === from + 1;
        if (!drop.hidden) {
          const above = rows[gap - 1], below = rows[gap];
          const y = above && below ? (above.offsetTop + above.offsetHeight + below.offsetTop) / 2
            : below ? below.offsetTop : above.offsetTop + above.offsetHeight;
          drop.style.top = y + 'px';
        }
        const box = main.getBoundingClientRect();
        if (ev.clientY < box.top + 48) main.scrollTop -= 14;
        else if (ev.clientY > box.bottom - 48) main.scrollTop += 14;
      }
      function end(ev) {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
        dragging = null;
        li.removeAttribute('data-dragging');
        drop.hidden = true;
        if (ev.type === 'pointerup') moveTo(from, gap > from ? gap - 1 : gap);
      }
      dragging = end;
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
    }

    // ---- choosing a format and the list's tools ----

    function select(id) {
      const f = list.find(x => x.id === id);
      if (!f) return;
      currentId = id;
      draft = clone(f);
      bad = {};
      expanded = new Set();
      renderList();
      main.scrollTop = 0;
      renderForm();
      paintTools();
      status(null);
      const item = listEl.querySelector('[aria-current="true"]');
      if (item && panel.isConnected) item.scrollIntoView({ block: 'nearest' });
    }

    const fit = name => (name.length > 40 ? name.slice(0, 40) : name);

    function add(f) {
      publish(list.concat([f]));
      select(f.id);
    }

    // A small question over the editor. Resolves with the chosen answer's value, or null on Esc.
    function ask(message, answers, hint) {
      if (dialog) dialog.close(null);
      const layer = el('div', 'dt-ed-dialog-layer');
      layer.appendChild(el('div', 'dt-ed-scrim'));
      const box = el('div', 'dt-ed-dialog');
      box.setAttribute('role', 'alertdialog');
      box.setAttribute('aria-modal', 'true');
      box.setAttribute('aria-label', message);
      box.appendChild(el('p', 'dt-ed-dialog-text', message));
      if (hint) box.appendChild(el('p', 'dt-ed-hint', hint));
      const acts = el('div', 'dt-ed-dialog-acts');
      box.appendChild(acts);
      layer.appendChild(box);
      const behind = [$('.dt-ed-head'), $('.dt-ed-body')];
      behind.forEach(x => { x.inert = true; });
      panel.appendChild(layer);
      return new Promise(resolve => {
        dialog = {
          close(value) {
            layer.remove();
            behind.forEach(x => { x.inert = false; });
            dialog = null;
            resolve(value);
          },
        };
        let first = null;
        answers.forEach(a => {
          const b = button(a.label);
          b.dataset.answer = a.value;
          if (a.kind) b.dataset.kind = a.kind;
          b.addEventListener('click', () => { if (dialog) dialog.close(a.value); });
          acts.appendChild(b);
          if (a.focus) first = b;
        });
        (first || acts.firstChild).focus();
      });
    }

    // Leaving the chosen format (another one chosen, one made or imported, the editor closed) drops what cannot
    // be saved yet, so first ask, as closing does. `go` runs when nothing is wrong or the timekeeper lets it go.
    const SWITCH = ['不保存，换过去', '换过去之后，这个赛制还是上次保存时的样子。'];
    const CLOSE = ['不保存，关闭', '关闭后，赛制还是上次保存时的样子。'];
    function settle(words, go) {
      if (destroyed || dialog) return;
      flush();
      const wrong = draft ? DT.store.validateFormat(draft).length + Object.keys(bad).length : 0;
      if (!wrong) { go(false); return; }
      ask('还有 ' + wrong + ' 处没改好，这些改动还没有保存', [
        { label: '接着改', value: 'stay', focus: true }, { label: words[0], value: 'drop', kind: 'danger' },
      ], words[1]).then(answer => { if (answer === 'drop' && !destroyed) go(true); });
    }

    const ACTIONS = {
      new: () => settle(SWITCH, () => {
        add(DT.store.newFormat());
        const name = byKey('f:name');
        if (name) { name.focus(); name.select(); }
      }),
      duplicate: () => settle(SWITCH, () => {
        const d = DT.store.duplicateFormat(saved());
        d.name = fit(d.name);
        add(d);
      }),
      restore() {
        publish(DT.store.restoreBuiltin(list, currentId));
        select(currentId);
      },
      export() {
        const f = saved();
        const name = DT.store.exportFileName(f);
        save(name, DT.store.exportFormats([f]));
        note([['ok', '已导出为「' + name + '」']]);
      },
      delete() {
        const f = saved();
        if (!f || f.builtin) return;
        ask('删除「' + f.name + '」？此操作不能撤销', [
          { label: '删除', value: 'yes', kind: 'danger' }, { label: '取消', value: 'no', focus: true },
        ]).then(answer => {
          if (answer !== 'yes' || destroyed) return;
          const at = list.indexOf(f);
          publish(list.filter(x => x !== f));
          const next = list[Math.min(at, list.length - 1)];
          if (next) select(next.id);
          else { currentId = null; draft = null; renderList(); renderForm(); paintTools(); }
        });
      },
      // Dropped edits go at once, so a cancelled file picker leaves the saved format on screen.
      import: () => settle(SWITCH, dropped => { if (dropped) select(currentId); importFiles(); }),
    };

    async function importFiles() {
      const texts = await pick();
      if (destroyed || !Array.isArray(texts) || !texts.length) return;
      const lines = [];
      let added = 0, last = null;
      for (let k = 0; k < texts.length; k++) {
        const r = DT.store.parseImport(texts[k]);
        const where = texts.length > 1 ? '第 ' + (k + 1) + ' 个文件：' : '';
        r.errors.forEach(e => lines.push(['bad', where + e]));
        for (const f of r.formats) {
          const there = list.find(x => x.id === f.id);
          let mode = 'copy';
          if (there) {
            mode = await ask('已经有一个叫「' + there.name + '」的赛制', [
              { label: '覆盖', value: 'replace' }, { label: '另存一份', value: 'copy', focus: true },
            ], '覆盖会换掉现有的；另存一份会两个都留着。按 Esc 不导入这一个。');
            if (destroyed) return;
            if (!mode) continue;
          }
          list = DT.store.addImported(list, f, mode);
          const got = mode === 'replace' ? list.find(x => x.id === f.id) : list[list.length - 1];
          got.name = fit(got.name);
          last = got.id;
          added += 1;
        }
      }
      if (added) {
        publish(list);
        select(last);
        lines.unshift(['ok', '导入了 ' + added + ' 个赛制']);
      }
      note(lines);
    }

    panel.querySelector('.dt-ed-tools').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (b && !b.disabled && ACTIONS[b.dataset.action]) ACTIONS[b.dataset.action]();
    });

    // ---- closing ----

    // The box being typed in has not seen its change event yet; give it one so nothing typed is lost.
    function flush() {
      const a = document.activeElement;
      if (a && main.contains(a) && a.tagName === 'INPUT') a.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function close() {
      if (closing) return;
      settle(CLOSE, leave);
    }

    function leave() {
      closing = true;
      panel.setAttribute('data-leaving', '');
      setTimeout(() => {
        if (destroyed) return;
        const id = currentId;
        destroy();
        if (o.onClose) o.onClose(id);
      }, reducedMotion() ? 0 : CLOSE_MS);
    }
    $('button[data-action="close"]').addEventListener('click', close);

    function onKey(e) {
      if (e.code !== 'Escape' || e.isComposing) return;
      e.preventDefault();
      if (dialog) dialog.close(null);
      else close();
    }
    window.addEventListener('keydown', onKey);

    function destroy() {
      if (destroyed) return;
      if (dialog) dialog.close(null);
      if (dragging) dragging({ type: 'cancel' });
      destroyed = true;
      clearTimeout(savedTimer);
      window.removeEventListener('keydown', onKey);
      panel.remove();
    }

    select(list.some(f => f.id === o.selectedId) ? o.selectedId : list.length ? list[0].id : null);
    if (!draft) { renderList(); paintTools(); }
    root.appendChild(panel);
    const item = listEl.querySelector('[aria-current="true"]');
    if (item) item.scrollIntoView({ block: 'nearest' });
    try { panel.focus({ preventScroll: true }); } catch (e) { /* focus is a nicety */ }

    return { el: panel, destroy, select };
  }

  DT.editor = { mount, moveStage };
})(window.DT = window.DT || {});
