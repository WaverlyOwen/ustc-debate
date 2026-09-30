/* store.js: format validation, import/export and localStorage persistence. */
(function (DT) {
  'use strict';

  const KEYS = {
    formats: 'dt.formats.v1', session: 'dt.session.v1', settings: 'dt.settings.v1', lastMatch: 'dt.lastMatch.v1',
  };
  const END_BELLS = ['double', 'triple', 'long', 'none', 'chime'];
  const HISTORY_LIMIT = 20;
  const VARIANT_NAME_MAX = 38;   // an inserted stage is named 正方 / 反方 + this, and stage names stop at 40

  // ---- storage ----
  function memoryStorage() {
    const m = new Map();
    return {
      getItem: k => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => { m.set(k, String(v)); },
      removeItem: k => { m.delete(k); },
    };
  }
  let storage = null;
  function useStorage(obj) { storage = obj; }
  function store() {
    if (!storage) {
      try { storage = window.localStorage || memoryStorage(); } catch (e) { storage = memoryStorage(); }
    }
    return storage;
  }
  function readJSON(key) {
    try {
      const text = store().getItem(key);
      return text == null ? null : JSON.parse(text);
    } catch (e) { return null; }
  }
  function writeJSON(key, value) {
    try { store().setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }
  function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  // ---- ids ----
  let counter = 0;
  function uid(prefix) {
    counter += 1;
    return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + counter.toString(36);
  }

  // ---- durations ----
  function parseDuration(text) {
    if (text == null) return null;
    const t = String(text).trim().replace(/：/g, ':');
    let m, secs = null;
    if ((m = /^(\d+):(\d{2})$/.exec(t))) { if (+m[2] < 60) secs = +m[1] * 60 + +m[2]; }
    else if ((m = /^(\d+)'(\d{1,2})$/.exec(t))) { if (+m[2] < 60) secs = +m[1] * 60 + +m[2]; }
    else if ((m = /^(\d+)\s*(s|秒)?$/i.exec(t))) secs = +m[1];
    else if ((m = /^(\d+)\s*分(钟)?(\s*(\d+)\s*秒)?$/.exec(t))) secs = +m[1] * 60 + (m[4] ? +m[4] : 0);
    return secs !== null && secs >= 1 && secs <= 3600 ? secs : null;
  }
  function formatDuration(secs) {
    const s = Math.max(0, Math.round(secs));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  // ---- validation ----
  function isPosInt(n) { return typeof n === 'number' && Number.isInteger(n) && n > 0; }
  function secsError(secs) {
    if (!isPosInt(secs)) return '时长要大于 0 秒';
    return secs > 3600 ? '时长不能超过 60 分钟' : null;
  }
  function bellsErrors(b) {
    if (!isObj(b)) return ['铃声：格式不对'];
    const errs = [];
    if (b.warn !== undefined && !(Array.isArray(b.warn) && b.warn.every(isPosInt))) errs.push('铃声：提示铃点要写成正整数秒');
    if (b.countdown !== undefined && !(Number.isInteger(b.countdown) && b.countdown >= 0 && b.countdown <= 10)) errs.push('铃声：逐秒倒数最多 10 秒');
    if (b.end !== undefined && END_BELLS.indexOf(b.end) < 0) errs.push('铃声：终止铃只能是两声、三声、长鸣或不响');
    return errs;
  }
  function stageErrors(s, i, firstIndexOfId) {
    const p = '第 ' + (i + 1) + ' 个环节：';
    if (!isObj(s)) return [p + '名称不能为空'];
    const errs = [];
    if (typeof s.name !== 'string' || !s.name.trim()) errs.push(p + '名称不能为空');
    else if (s.name.length > 40) errs.push(p + '名称最多 40 个字');
    if (s.type !== 'single' && s.type !== 'dual' && s.type !== 'break') errs.push(p + '计时方式只能是单方、双方或间隔');
    const se = secsError(s.secs);
    if (se) errs.push(p + se);
    if (s.type === 'single' && s.side !== 'pro' && s.side !== 'con') errs.push(p + '单方环节要选正方或反方');
    if (s.type === 'dual' && s.first !== 'pro' && s.first !== 'con') errs.push(p + '先发言的一方只能是正方或反方');
    if (s.id !== undefined && firstIndexOfId[s.id] !== i) errs.push(p + '编号和第 ' + (firstIndexOfId[s.id] + 1) + ' 个环节重复');
    if (s.bells !== undefined && s.bells !== null) bellsErrors(s.bells).forEach(e => errs.push(p + e));
    return errs;
  }
  function extraErrors(g) {
    if (!isObj(g)) return ['可插入环节的格式不对'];
    if (typeof g.group !== 'string' || !g.group.trim()) return ['可插入环节的名称不能为空'];
    const p = '可插入环节「' + g.group + '」';
    const errs = [];
    if (!(Number.isInteger(g.perSide) && g.perSide >= 1)) errs.push(p + '：每方次数至少 1 次');
    if (!Array.isArray(g.variants) || !g.variants.length) {
      errs.push(p + '：至少要有一种形式');
    } else {
      g.variants.forEach((v, k) => {
        const q = p + '第 ' + (k + 1) + ' 种：';
        const name = isObj(v) && typeof v.name === 'string' ? v.name.trim() : '';
        if (!name) errs.push(q + '名称不能为空');
        else if (v.name.length > VARIANT_NAME_MAX) errs.push(q + '名称最多 ' + VARIANT_NAME_MAX + ' 个字（插入时前面还要加上正方或反方）');
        if (!isObj(v) || v.type !== 'single') errs.push(q + '只能是单方环节');
        if (!isObj(v) || secsError(v.secs)) errs.push(q + '时长要大于 0 秒');
      });
    }
    return errs;
  }
  function validateFormat(f) {
    if (!isObj(f)) return ['这不是一个赛制'];
    const errs = [];
    if (typeof f.name !== 'string' || !f.name.trim()) errs.push('赛制名称不能为空');
    else if (f.name.length > 40) errs.push('赛制名称最多 40 个字');
    if (!Array.isArray(f.stages) || !f.stages.length) {
      errs.push('至少要有一个环节');
    } else {
      const first = {};
      f.stages.forEach((s, i) => { if (isObj(s) && s.id !== undefined && !(s.id in first)) first[s.id] = i; });
      f.stages.forEach((s, i) => stageErrors(s, i, first).forEach(e => errs.push(e)));
    }
    if (f.bells !== undefined && f.bells !== null) bellsErrors(f.bells).forEach(e => errs.push(e));
    if (f.extras !== undefined) {
      if (Array.isArray(f.extras)) {
        // The insert menu finds a group by its name, so two groups may not share one.
        const seen = {};
        f.extras.forEach(g => {
          extraErrors(g).forEach(e => errs.push(e));
          const name = isObj(g) && typeof g.group === 'string' ? g.group.trim() : '';
          if (name && seen[name]) errs.push('可插入环节「' + g.group + '」：名称和前面的一组重复');
          if (name) seen[name] = true;
        });
      } else errs.push('可插入环节的格式不对');
    }
    return errs;
  }

  // ---- builtin comparison ----
  function canon(v) {
    if (Array.isArray(v)) return v.map(canon);
    if (v && typeof v === 'object') {
      const o = {};
      Object.keys(v).sort().forEach(k => { o[k] = canon(v[k]); });
      return o;
    }
    return v;
  }
  function builtinById(id) { return DT.BUILTIN_FORMATS.find(b => b.id === id) || null; }
  function isPristine(f) {
    const orig = f && f.builtin ? builtinById(f.id) : null;
    return !!orig && JSON.stringify(canon(f)) === JSON.stringify(canon(orig));
  }
  function restoreBuiltin(list, id) {
    const orig = builtinById(id);
    if (!orig) return list;
    return list.map(f => (f.id === id ? clone(orig) : f));
  }

  // ---- formats persistence ----
  // Stored entries the last load could not use, kept as they were so the next save does not erase them.
  let unread = { from: null, entries: [] };
  function loadFormats() {
    const data = readJSON(KEYS.formats);
    const seen = {};
    const skipped = [];
    // Skip invalid entries, entries without a usable id, and repeated ids (first one wins).
    const stored = data && Array.isArray(data.formats) ? data.formats.filter(f => {
      const ok = isObj(f) && typeof f.id === 'string' && !!f.id && !Object.prototype.hasOwnProperty.call(seen, f.id) &&
        !validateFormat(f).length;
      if (!ok) { skipped.push(f); return false; }
      seen[f.id] = true;
      return true;
    }) : [];
    unread = { from: store(), entries: skipped };
    if (skipped.length) console.warn('有 ' + skipped.length + ' 个保存的赛制读不出来，已跳过（仍然保留在存储里）');
    const byId = {};
    stored.forEach(f => { byId[f.id] = f; });
    const out = DT.BUILTIN_FORMATS.map(b => clone(byId[b.id] || b));
    stored.forEach(f => { if (!builtinById(f.id)) out.push(f); });
    return out;
  }
  function saveFormats(list) {
    const keep = unread.from === store() ? unread.entries : [];
    writeJSON(KEYS.formats, { schema: 1, formats: list.filter(f => !isPristine(f)).concat(keep) });
  }

  // ---- constructors ----
  function newStage(type) {
    if (type === 'dual') return { id: uid('s'), name: '新环节', type: 'dual', side: null, secs: 90, first: 'pro' };
    if (type === 'break') return { id: uid('s'), name: '休息', type: 'break', side: null, secs: 30 };
    return { id: uid('s'), name: '新环节', type: 'single', side: 'pro', secs: 180 };
  }
  function newFormat() {
    return {
      id: uid('u'), name: '新赛制', theme: 'hall', builtin: false,
      bells: clone(DT.engine.DEFAULT_BELLS), stages: [newStage('single')], extras: [],
    };
  }
  function duplicateFormat(f) {
    const d = clone(f);
    d.id = uid('u');
    d.name = f.name + '（副本）';
    d.builtin = false;
    delete d.source;
    return d;
  }

  // ---- import / export ----
  function exportFormats(list) {
    return JSON.stringify({ kind: 'debate-timer-formats', schema: 1, formats: list }, null, 2);
  }
  function exportFileName(f) {
    return String((f && f.name) || '赛制').replace(/[\\/:*?"<>|]/g, '_') + '.debate-timer.json';
  }
  function withDefaults(f) {
    if (!isObj(f)) return f;
    const o = clone(f);
    if (typeof o.id !== 'string' || !o.id.trim()) o.id = uid('u');   // loadFormats would skip any other id
    if (!o.theme) o.theme = 'hall';
    if (!o.bells) o.bells = clone(DT.engine.DEFAULT_BELLS);
    if (!o.extras) o.extras = [];
    if (Array.isArray(o.stages)) o.stages.forEach(s => { if (isObj(s) && !s.id) s.id = uid('s'); });
    return o;
  }
  function parseImport(text) {
    let data;
    try { data = JSON.parse(text); } catch (e) { return { formats: [], errors: ['文件不是有效的 JSON'] }; }
    let raw = null;
    if (isObj(data) && data.kind === 'debate-timer-formats') {
      if (typeof data.schema === 'number' && data.schema > 1) {
        return { formats: [], errors: ['这个文件来自更新版本的计时器，请先更新计时器'] };
      }
      raw = Array.isArray(data.formats) ? data.formats : null;
    } else if (isObj(data) && 'stages' in data) {
      raw = [data];
    }
    if (!raw) return { formats: [], errors: ['这不是计时器的赛制文件'] };
    const formats = [], errors = [];
    raw.forEach((item, k) => {
      const f = withDefaults(item);
      const errs = validateFormat(f);
      if (errs.length) {
        const label = isObj(f) && typeof f.name === 'string' && f.name.trim() ? f.name : '第 ' + (k + 1) + ' 个';
        errors.push('「' + label + '」：' + errs[0]);
      } else formats.push(f);
    });
    return { formats, errors };
  }
  function addImported(list, f, mode) {
    const conflict = list.some(x => x.id === f.id);
    if (conflict && mode === 'replace') {
      const rep = Object.assign({}, f, { builtin: !!builtinById(f.id) });
      return list.map(x => (x.id === f.id ? rep : x));
    }
    const add = Object.assign({}, f, { builtin: false });
    if (conflict) { add.id = uid('u'); add.name = f.name + '（导入）'; }
    return list.concat([add]);
  }

  // ---- session, settings, last match ----
  function loadSession() { const s = readJSON(KEYS.session); return isObj(s) ? s : null; }
  function saveSession(s) {
    const copy = Object.assign({}, s);
    if (Array.isArray(copy.history)) copy.history = copy.history.slice(-HISTORY_LIMIT);
    writeJSON(KEYS.session, copy);
  }
  function clearSession() { try { store().removeItem(KEYS.session); } catch (e) { /* ignore */ } }
  function loadSettings() {
    const s = readJSON(KEYS.settings);
    return Object.assign({ volume: 0.8, muted: false }, isObj(s) ? s : {});
  }
  function saveSettings(obj) { writeJSON(KEYS.settings, obj); }
  function loadLastMatch() { const m = readJSON(KEYS.lastMatch); return isObj(m) ? m : null; }
  function saveLastMatch(match) { writeJSON(KEYS.lastMatch, match); }

  DT.store = {
    useStorage, validateFormat, parseDuration, formatDuration, loadFormats, saveFormats, isPristine, restoreBuiltin,
    newFormat, duplicateFormat, newStage, uid, exportFormats, exportFileName, parseImport, addImported,
    loadSession, saveSession, clearSession, loadSettings, saveSettings, loadLastMatch, saveLastMatch,
  };
})(window.DT = window.DT || {});
