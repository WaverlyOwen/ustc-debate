/* preset.js: 导出这一场 (new spec §4): a match file is this page's own source plus a preset block that names
   the format, the match and the theme, so a double click opens straight on that match's title card. */
(function (DT) {
  'use strict';
  const KIND = 'debate-timer-match';
  const MAIN_ID = 'dt-main';       // build.py tags the main script so; the preset block goes just before it
  const PRESET_ID = 'dt-preset';
  const SCHEMA = 1;
  const APP_TITLE = '辩论计时器';
  const MOTION_CHARS = 16;   // a file named after the motion takes this much of it
  const MATCH_TEXT = ['title', 'proMotion', 'conMotion', 'proTeam', 'conTeam'];

  const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const clone = v => JSON.parse(JSON.stringify(v));

  // ---- the page's own source, read before the app changes anything ----
  let source = null;

  // The built page has one <style> and one main script (id dt-main); the dev shell links its files, so it has
  // no source to copy and cannot export. An old preset block is not part of the source: a new one replaces it.
  function captureSource(doc = document) {
    const main = doc.getElementById(MAIN_ID);
    const style = doc.querySelector('head > style');
    source = main && style ? {
      lang: doc.documentElement.getAttribute('lang') || 'zh-CN',
      title: doc.title,
      style: style.textContent,
      main: main.textContent,
    } : null;
  }

  function sourceParts() { return source ? Object.assign({}, source) : null; }

  // ---- the preset ----

  function make(format, match, theme, now) {
    const m = isObj(match) ? match : {};
    const out = {};
    MATCH_TEXT.forEach(k => { out[k] = typeof m[k] === 'string' ? m[k] : ''; });
    out.proSeat = m.proSeat === 'right' ? 'right' : 'left';
    return {
      kind: KIND, schema: SCHEMA, id: DT.store.uid('m'), createdAt: now,
      format: clone(format), match: out, theme: String(theme || 'hall'),
    };
  }

  // What names the match: its title, else the pro motion's first characters, else the format.
  function label(preset) {
    const m = preset.match || {};
    const title = String(m.title || '').trim();
    if (title) return title;
    const motion = String(m.proMotion || '').trim();
    if (motion) return Array.from(motion).slice(0, MOTION_CHARS).join('');
    return String((preset.format && preset.format.name) || APP_TITLE).trim();
  }

  // Windows forbids these in a file name, and drops trailing dots and spaces.
  function fileName(preset) {
    const base = label(preset).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/[. ]+$/, '');
    return (base || APP_TITLE) + '.html';
  }

  const escapeText = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // The whole page, with the preset before the main script. Every < in the JSON is written <, so no
  // text a timekeeper pastes into a motion can close the block (or open a comment) early.
  function buildHtml(parts, preset) {
    const json = JSON.stringify(preset).replace(/</g, '\\u003c');
    return '<!doctype html>\n' +
      '<html lang="' + escapeText(parts.lang).replace(/"/g, '&quot;') + '"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>' + escapeText(label(preset) + '：' + APP_TITLE) + '</title>\n' +
      '<style>' + parts.style + '</style></head>\n' +
      '<body data-dt-autoboot><div id="app"></div>\n' +
      '<script type="application/json" id="' + PRESET_ID + '">' + json + '</script>\n' +
      '<script id="' + MAIN_ID + '">' + parts.main + '</script></body></html>\n';
  }

  // The page's preset, or null. A block that cannot be used is reported and ignored, so the page falls back
  // to the plain timer instead of a blank screen.
  function read(doc = document) {
    const block = doc.getElementById(PRESET_ID);
    if (!block) return null;
    let p = null;
    try { p = JSON.parse(block.textContent); } catch (e) { p = null; }
    const why = !isObj(p) ? '不是有效的 JSON'
      : p.kind !== KIND ? '类型不对'
      : !(typeof p.schema === 'number' && p.schema <= SCHEMA) ? '来自更新版本的计时器'
      : !(typeof p.id === 'string' && p.id) ? '缺少编号'
      : !isObj(p.match) ? '缺少这一场的信息'
      : DT.store.validateFormat(p.format).length ? '赛制不对：' + DT.store.validateFormat(p.format)[0]
      : null;
    if (why) {
      console.warn('这个文件里的比赛预设用不了（' + why + '），按普通计时器打开');
      return null;
    }
    return p;
  }

  DT.preset = { captureSource, sourceParts, buildHtml, make, read, fileName };
})(window.DT = window.DT || {});
