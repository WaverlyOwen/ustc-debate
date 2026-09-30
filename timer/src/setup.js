/* setup.js: the setup page, the first page of the file. Pick a format, fill in this match, start (spec §5.9). */
(function (DT) {
  'use strict';
  const TEXT_FIELDS = ['title', 'proMotion', 'conMotion', 'proTeam', 'conTeam'];
  const PREFILL = ['proMotion', 'conMotion', 'proTeam', 'conTeam'];   // the match title is new every time
  const ENTER = ['Enter', 'NumpadEnter'];
  // What every theme thumbnail shows (spec §3.1): this stage of this format, running with this much used.
  const SAMPLE = { format: 'ustc-freshman-cup', stage: '正方一辩开篇立论', used: 0.4 };
  const NOTICE_MS = 6000;   // how long a notice stays up
  const NO_EXPORT = '在构建好的 debate-timer.html 里才能导出';
  let mounts = 0;   // keeps option ids unique if the page is mounted again

  // Static markup only; format names and match text go in through textContent and value.
  const TEMPLATE =
    '<header class="dt-setup-head"><h1>辩论计时器</h1><p>选好赛制，填好这一场，就可以开始</p></header>' +
    '<div class="dt-setup-body">' +
    '<section class="dt-setup-formats"><h2 class="dt-setup-label">赛制</h2>' +
    '<div class="dt-setup-list" role="listbox" tabindex="0" aria-label="赛制"></div></section>' +
    '<section class="dt-setup-match" aria-label="这一场">' +
    '<div class="dt-setup-chosen"><h2 class="dt-setup-chosen-name"></h2><p class="dt-setup-meta"></p>' +
    '<div class="dt-setup-strip" aria-hidden="true"></div></div>' +
    '<label class="dt-setup-row"><span class="dt-setup-label">场次名</span>' +
    '<input class="dt-input" type="text" name="title" autocomplete="off" maxlength="40" placeholder="可不填，如：新生赛 第 3 场"></label>' +
    '<fieldset class="dt-setup-row"><legend class="dt-setup-label">辩题</legend>' +
    '<label class="dt-setup-side" data-side="pro"><span>正方</span>' +
    '<input class="dt-input dt-input-title" type="text" name="proMotion" autocomplete="off" placeholder="正方的表述，可不填"></label>' +
    '<label class="dt-setup-side" data-side="con"><span>反方</span>' +
    '<input class="dt-input dt-input-title" type="text" name="conMotion" autocomplete="off" placeholder="反方的表述，可不填"></label>' +
    '</fieldset>' +
    // The two team boxes sit as the sides will on the projector, left to right; the button between them swaps
    // the seats. The radios hold the seat for the form (and for ui.js's draft) and are not shown.
    '<fieldset class="dt-setup-row dt-setup-teams"><legend class="dt-setup-label">队名与座位</legend>' +
    '<div class="dt-setup-seating">' +
    '<label class="dt-setup-side" data-side="pro"><span>正方</span>' +
    '<input class="dt-input" type="text" name="proTeam" autocomplete="off" maxlength="40" placeholder="不填就显示「正方」"></label>' +
    '<button type="button" class="dt-setup-swap" data-action="swap-seats">' +
    '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M3 7h13M12 3l4 4-4 4M17 13H4M8 9l-4 4 4 4"/></svg>' +
    '</button>' +
    '<label class="dt-setup-side" data-side="con"><span>反方</span>' +
    '<input class="dt-input" type="text" name="conTeam" autocomplete="off" maxlength="40" placeholder="不填就显示「反方」"></label>' +
    '</div>' +
    '<span hidden><input type="radio" name="proSeat" value="left" tabindex="-1">' +
    '<input type="radio" name="proSeat" value="right" tabindex="-1"></span>' +
    '</fieldset>' +
    '<fieldset class="dt-setup-row"><legend class="dt-setup-label">主题</legend>' +
    '<div class="dt-setup-themes" role="radiogroup" aria-label="主题"></div>' +
    '<p class="dt-setup-hint dt-setup-theme-desc"></p></fieldset>' +
    '<footer class="dt-setup-foot">' +
    '<button type="button" class="dt-button dt-setup-start" data-action="start" data-primary>开始这一场</button>' +
    '</footer></section></div>' +
    '<p class="dt-setup-notice" role="status" aria-live="polite"></p>';

  function el(tag, cls, content) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (content !== undefined) e.textContent = content;
    return e;
  }

  function button(label, action, primary) {
    const b = el('button', 'dt-button', label);
    b.type = 'button';
    b.dataset.action = action;
    if (primary) b.setAttribute('data-primary', '');
    return b;
  }

  // Speaking stages (breaks left out) and the whole length, a free debate counting both sides.
  function summary(format) {
    const stages = format.stages.filter(s => s.type !== 'break').length;
    const secs = format.stages.reduce((n, s) => n + s.secs * (s.type === 'dual' ? 2 : 1), 0);
    return { stages, minutes: Math.max(1, Math.round(secs / 60)) };
  }

  // The format's shape: one segment per stage, as long as the stage and coloured by its side.
  function strip(box, format) {
    box.textContent = '';
    format.stages.forEach(s => {
      const seg = el('i');
      seg.dataset.side = s.side || 'none';
      seg.dataset.kind = s.type;
      seg.style.flexGrow = String(s.secs * (s.type === 'dual' ? 2 : 1));
      box.appendChild(seg);
    });
  }

  // 第 N counts every row, breaks included, as the editor and the console number them; the name says which.
  function resumeText(r) {
    const name = r.stage ? '（' + r.stage + '）' : '';
    const where = r.cursor >= 0 ? '停在第 ' + (r.cursor + 1) + ' 个环节' + name : '还没开始第一个环节';
    return ['上一场还没打完：', String(r.title || ''), '，' + where + '。'];
  }

  // The sample stage played out from a fixed moment, so every thumbnail and every screenshot shows one frame.
  function sampleView() {
    const E = DT.engine;
    let s = E.createSession(DT.BUILTIN_FORMATS.find(f => f.id === SAMPLE.format), {}, 0);
    const i = s.timeline.findIndex(x => x.name === SAMPLE.stage);
    s = E.toggle(E.goto(s, i, 0), 0);
    return E.view(s, s.timeline[i].secs * 1000 * SAMPLE.used);
  }

  function mount(root, opts) {
    const o = opts || {};
    const formats = Array.isArray(o.formats) ? o.formats : [];
    const given = Array.isArray(o.themes) && o.themes.length ? o.themes : [{ id: 'hall', name: '堂' }];
    const themes = given.slice().sort((a, b) => (b.id === 'hall') - (a.id === 'hall'));   // the default leads
    const last = o.lastMatch && typeof o.lastMatch === 'object' ? o.lastMatch : {};
    const prefix = 'dt-setup-' + (++mounts) + '-';

    const page = el('div', 'dt-setup');
    page.innerHTML = TEMPLATE;
    const $ = sel => page.querySelector(sel);
    const list = $('.dt-setup-list');
    const field = name => $('input[name="' + name + '"]');
    const texts = TEXT_FIELDS.map(field);

    // ---- the resume banner ----
    if (o.resumable) {
      const banner = el('section', 'dt-setup-resume');
      banner.dataset.role = 'resume';
      const p = el('p');
      const parts = resumeText(o.resumable);
      p.appendChild(document.createTextNode(parts[0]));
      p.appendChild(el('strong', null, parts[1]));
      p.appendChild(document.createTextNode(parts[2]));
      const acts = el('div', 'dt-setup-resume-acts');
      const resume = button('继续', 'resume', true);
      const discard = button('放弃并新开', 'discard');
      resume.addEventListener('click', () => { if (o.onResume) o.onResume(); });
      discard.addEventListener('click', () => {
        if (o.onDiscard) o.onDiscard();
        banner.remove();
      });
      acts.appendChild(resume);
      acts.appendChild(discard);
      banner.appendChild(p);
      banner.appendChild(acts);
      page.insertBefore(banner, $('.dt-setup-body'));
    }

    // ---- the format list: built-in first, the user's own after ----
    const options = [];
    const groups = [['内置', formats.filter(f => f.builtin)], ['我的', formats.filter(f => !f.builtin)]];
    const labelled = groups.every(g => g[1].length);
    groups.forEach(([label, group]) => {
      if (!group.length) return;
      const box = el('div', 'dt-setup-group');
      box.setAttribute('role', 'group');
      box.setAttribute('aria-label', label);
      if (labelled) {
        const head = el('p', 'dt-setup-group-label', label);
        head.setAttribute('role', 'presentation');
        box.appendChild(head);
      }
      group.forEach(f => {
        const opt = el('div', 'dt-setup-format');
        opt.id = prefix + options.length;
        opt.setAttribute('role', 'option');
        opt.setAttribute('aria-selected', 'false');
        opt.dataset.formatId = f.id;
        const sum = summary(f);
        const meta = el('span', 'dt-setup-format-meta');
        meta.appendChild(el('span', null, sum.stages + ' 个发言环节'));
        meta.appendChild(el('span', null, '约 ' + sum.minutes + ' 分钟'));
        const bar = el('span', 'dt-setup-strip');
        bar.setAttribute('aria-hidden', 'true');
        strip(bar, f);
        opt.appendChild(el('span', 'dt-setup-format-name', f.name));
        opt.appendChild(meta);
        opt.appendChild(bar);
        const index = options.length;
        opt.addEventListener('click', () => select(index));
        options.push({ format: f, el: opt });
        box.appendChild(opt);
      });
      list.appendChild(box);
    });

    // ---- themes: a grid of thumbnails, each the real stage in that theme; one tab stop, arrows move ----
    const themeBox = $('.dt-setup-themes');
    const themeDesc = $('.dt-setup-theme-desc');
    const sample = sampleView();
    const thumbs = [];
    const cells = themes.map(th => {
      const cell = el('button', 'dt-setup-theme');
      cell.type = 'button';
      cell.setAttribute('role', 'radio');
      cell.setAttribute('aria-checked', 'false');
      cell.tabIndex = -1;
      cell.dataset.themeId = th.id;
      const host = el('span', 'dt-setup-thumb');
      host.setAttribute('aria-hidden', 'true');   // the cell is read by its name
      const thumb = DT.render.mount(host, { thumbnail: true });
      thumb.update(Object.assign({}, sample, { theme: th.id }));
      thumbs.push(thumb);
      cell.appendChild(host);
      cell.appendChild(el('span', 'dt-setup-theme-name', th.name || th.id));
      themeBox.appendChild(cell);
      return cell;
    });
    let chosen = null;         // the chosen theme's cell
    let themePicked = false;   // the theme follows the chosen format until the timekeeper picks one
    // Compared as values, not put into a selector: an imported format's theme id can be any string.
    const cellOf = id => cells.find(c => c.dataset.themeId === id) || null;
    const describe = cell => { themeDesc.textContent = themes[cells.indexOf(cell)].desc || ''; };
    function setTheme(id, focus) {
      chosen = cellOf(id) || cellOf('hall') || cells[0];
      cells.forEach(c => {
        c.setAttribute('aria-checked', String(c === chosen));
        c.tabIndex = c === chosen ? 0 : -1;
      });
      describe(chosen);
      if (focus) chosen.focus();
    }
    function pickTheme(i, focus) {
      themePicked = true;
      setTheme(cells[i].dataset.themeId, focus);
    }
    cells.forEach((cell, i) => {
      cell.addEventListener('click', () => pickTheme(i));
      // The line under the grid describes the theme pointed at or focused, then the chosen one again.
      ['mouseenter', 'focus'].forEach(type => cell.addEventListener(type, () => describe(cell)));
      ['mouseleave', 'blur'].forEach(type => cell.addEventListener(type, () => describe(chosen)));
    });
    // ←→ step through the grid, wrapping round; ↑↓ keep the column and change the row, as laid out.
    themeBox.addEventListener('keydown', e => {
      const i = cells.indexOf(e.target), n = cells.length;
      if (i < 0 || e.altKey || e.ctrlKey || e.metaKey) return;
      const cols = cells.filter(c => c.offsetTop === cells[0].offsetTop).length || 1;
      const moves = {
        ArrowRight: (i + 1) % n, ArrowLeft: (i - 1 + n) % n, Home: 0, End: n - 1,
        ArrowDown: i + cols < n ? i + cols : i, ArrowUp: i - cols >= 0 ? i - cols : i,
      };
      if (!(e.code in moves)) return;
      e.preventDefault();
      pickTheme(moves[e.code], true);
    });
    setTheme('hall');   // until a format is chosen

    // ---- selection ----
    let current = -1;
    function select(i) {
      if (i < 0 || i >= options.length) return;
      if (current >= 0) options[current].el.setAttribute('aria-selected', 'false');
      current = i;
      const { format, el: opt } = options[i];
      opt.setAttribute('aria-selected', 'true');
      list.setAttribute('aria-activedescendant', opt.id);
      if (page.isConnected) opt.scrollIntoView({ block: 'nearest' });
      const sum = summary(format);
      $('.dt-setup-chosen-name').textContent = format.name;
      $('.dt-setup-meta').textContent = sum.stages + ' 个发言环节，约 ' + sum.minutes + ' 分钟';
      strip($('.dt-setup-chosen .dt-setup-strip'), format);
      if (!themePicked) setTheme(format.theme);
    }

    list.addEventListener('keydown', e => {
      const moves = { ArrowDown: current + 1, ArrowUp: current - 1, Home: 0, End: options.length - 1 };
      if (!(e.code in moves) || e.altKey || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      select(Math.min(options.length - 1, Math.max(0, moves[e.code])));
    });

    // ---- the match ----
    PREFILL.forEach(k => { if (typeof last[k] === 'string') field(k).value = last[k]; });
    const seat = last.proSeat === 'right' ? 'right' : 'left';
    page.querySelector('input[name="proSeat"][value="' + seat + '"]').checked = true;
    const seating = $('.dt-setup-seating');
    const swap = $('.dt-setup-swap');
    const seatNow = () => page.querySelector('input[name="proSeat"]:checked').value;
    // The boxes are moved in the page, not just drawn in the other order, so Tab and Enter go left to right too.
    function paintSeat() {
      const right = seatNow() === 'right';
      const pro = field('proTeam').parentNode, con = field('conTeam').parentNode;
      seating.insertBefore(right ? con : pro, swap);
      seating.appendChild(right ? pro : con);
      seating.dataset.seat = right ? 'right' : 'left';
      const label = '左右交换（现在正方坐在' + (right ? '右' : '左') + '边）';
      swap.setAttribute('aria-label', label);
      swap.title = label;
    }
    page.querySelectorAll('input[name="proSeat"]').forEach(r => r.addEventListener('change', paintSeat));
    swap.addEventListener('click', () => {
      page.querySelector('input[name="proSeat"][value="' + (seatNow() === 'right' ? 'left' : 'right') + '"]').checked = true;
      paintSeat();
    });
    paintSeat();

    function matchNow() {
      const match = {};
      TEXT_FIELDS.forEach(k => { match[k] = field(k).value.trim(); });
      match.proSeat = page.querySelector('input[name="proSeat"]:checked').value;
      return match;
    }
    function start() {
      if (current < 0 || !o.onStart) return;
      o.onStart(options[current].format, matchNow(), chosen.dataset.themeId);
    }
    $('button[data-action="start"]').addEventListener('click', start);

    // 导出这一场: a quiet button beside 开始这一场. Only the built single file has its own source to copy.
    if (o.onExport) {
      const exp = button('导出这一场', 'export');
      if (!o.canExport) {
        exp.disabled = true;
        exp.title = NO_EXPORT;
      }
      exp.addEventListener('click', () => {
        if (current >= 0 && o.canExport) o.onExport(options[current].format, matchNow(), chosen.dataset.themeId);
      });
      const startBtn = $('button[data-action="start"]');
      startBtn.parentNode.insertBefore(exp, startBtn);
    }

    // A line at the top of the page for what just happened (the export's where-to-now).
    const notice = $('.dt-setup-notice');
    let noticeTimer = null;
    function toast(message) {
      clearTimeout(noticeTimer);
      notice.textContent = message;
      notice.setAttribute('data-shown', '');
      noticeTimer = setTimeout(() => notice.removeAttribute('data-shown'), NOTICE_MS);
    }

    // Enter steps through the text boxes and starts the match from the last one.
    // An Enter that ends an input-method composition only commits the text.
    // The order is the page's, so the team boxes are taken left to right, whichever side sits on the left.
    page.addEventListener('keydown', e => {
      if (texts.indexOf(e.target) < 0 || ENTER.indexOf(e.code) < 0 || e.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      const order = texts.slice().sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
      const i = order.indexOf(e.target);
      if (i === order.length - 1) start();
      else order[i + 1].focus();
    });

    if (o.onEdit) {
      const edit = button('编辑赛制', 'edit');
      edit.addEventListener('click', () => o.onEdit());
      const foot = $('.dt-setup-foot');
      foot.insertBefore(edit, foot.firstChild);
    }

    // Filled in before the page is attached, so the first frame has nothing to transition from.
    const wanted = options.findIndex(x => x.format.id === last.formatId);
    select(wanted >= 0 ? wanted : 0);
    root.appendChild(page);
    if (current >= 0) options[current].el.scrollIntoView({ block: 'nearest' });

    return {
      el: page,
      toast,
      destroy() {
        clearTimeout(noticeTimer);
        thumbs.forEach(t => t.destroy());
        page.remove();
      },
    };
  }

  // A match file that finds its match left part way (new spec §4.3) asks before it goes on: the file may have
  // been tried out before match day. Going on is the default, so Enter after a reload mid-match is all it takes.
  function ask(root, opts) {
    const o = opts || {};
    const page = el('div', 'dt-setup dt-setup-ask');
    const head = el('header', 'dt-setup-head');
    head.appendChild(el('h1', null, '辩论计时器'));
    head.appendChild(el('p', null, '这个文件里的比赛上次没有打完'));
    const banner = el('section', 'dt-setup-resume');
    banner.dataset.role = 'resume';
    const p = el('p');
    const parts = resumeText(o.resumable || {});
    p.appendChild(document.createTextNode('上次打到一半：'));
    p.appendChild(el('strong', null, parts[1]));
    p.appendChild(document.createTextNode(parts[2]));
    const acts = el('div', 'dt-setup-resume-acts');
    const resume = button('继续上次', 'resume', true);
    const restart = button('重新开始这一场', 'restart');
    resume.addEventListener('click', () => { if (o.onResume) o.onResume(); });
    restart.addEventListener('click', () => { if (o.onRestart) o.onRestart(); });
    acts.appendChild(resume);
    acts.appendChild(restart);
    const words = el('div', 'dt-setup-ask-words');
    words.appendChild(p);
    words.appendChild(el('p', 'dt-setup-hint', '重新开始会丢掉上次的计时，从开场卡重新来过'));
    banner.appendChild(words);
    banner.appendChild(acts);
    page.appendChild(head);
    page.appendChild(banner);
    root.appendChild(page);
    resume.focus();
    return { el: page, destroy() { page.remove(); } };
  }

  DT.setup = { mount, ask };
})(window.DT = window.DT || {});
