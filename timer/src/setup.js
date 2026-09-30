/* setup.js: the setup page, the first page of the file. Pick a format, fill in this match, start (spec §5.9). */
(function (DT) {
  'use strict';
  const TEXT_FIELDS = ['title', 'proMotion', 'conMotion', 'proTeam', 'conTeam'];
  const PREFILL = ['proMotion', 'conMotion', 'proTeam', 'conTeam'];   // the match title is new every time
  const ENTER = ['Enter', 'NumpadEnter'];
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
    '<fieldset class="dt-setup-row dt-setup-teams"><legend class="dt-setup-label">队名</legend>' +
    '<label class="dt-setup-side" data-side="pro"><span>正方</span>' +
    '<input class="dt-input" type="text" name="proTeam" autocomplete="off" maxlength="40" placeholder="不填就显示「正方」"></label>' +
    '<label class="dt-setup-side" data-side="con"><span>反方</span>' +
    '<input class="dt-input" type="text" name="conTeam" autocomplete="off" maxlength="40" placeholder="不填就显示「反方」"></label>' +
    '</fieldset>' +
    '<div class="dt-setup-pair">' +
    '<fieldset class="dt-setup-row"><legend class="dt-setup-label">正方坐在</legend><div class="dt-setup-seat">' +
    '<div class="dt-choices">' +
    '<label class="dt-choice"><input type="radio" name="proSeat" value="left"><span>左边</span></label>' +
    '<label class="dt-choice"><input type="radio" name="proSeat" value="right"><span>右边</span></label></div>' +
    '<span class="dt-setup-seats" aria-hidden="true"><i data-side="pro">正</i><i data-side="con">反</i></span>' +
    '</div></fieldset>' +
    '<fieldset class="dt-setup-row"><legend class="dt-setup-label">主题</legend>' +
    '<div class="dt-choices dt-setup-themes"></div><p class="dt-setup-hint dt-setup-theme-desc"></p></fieldset>' +
    '</div>' +
    '<footer class="dt-setup-foot">' +
    '<button type="button" class="dt-button dt-setup-start" data-action="start" data-primary>开始这一场</button>' +
    '</footer></section></div>';

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

  function resumeText(r) {
    const where = r.cursor >= 0 ? '停在第 ' + (r.cursor + 1) + ' 个环节' : '还没开始第一个环节';
    return ['上一场还没打完：', String(r.title || ''), '，' + where + '。'];
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
        meta.appendChild(el('span', null, sum.stages + ' 个环节'));
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

    // ---- themes ----
    const themeBox = $('.dt-setup-themes');
    const themeDesc = $('.dt-setup-theme-desc');
    themes.forEach(th => {
      const label = el('label', 'dt-choice');
      const radio = el('input');
      radio.type = 'radio';
      radio.name = 'theme';
      radio.value = th.id;
      const swatch = el('span', 'dt-setup-swatch');
      swatch.setAttribute('data-theme', th.id);   // the theme's own variables paint the swatch
      swatch.setAttribute('aria-hidden', 'true');
      swatch.appendChild(el('i')).dataset.side = 'pro';
      swatch.appendChild(el('i')).dataset.side = 'con';
      label.appendChild(radio);
      label.appendChild(swatch);
      label.appendChild(el('span', null, th.name || th.id));
      if (th.desc) label.title = th.desc;
      themeBox.appendChild(label);
    });
    // Compared as values, not put into a selector: an imported format's theme id can be any string.
    const themeRadio = id => Array.from(themeBox.querySelectorAll('input')).find(r => r.value === id) || null;
    let themePicked = false;   // the theme follows the chosen format until the timekeeper picks one
    function setTheme(id) {
      const radio = themeRadio(id) || themeRadio('hall') || themeBox.querySelector('input');
      radio.checked = true;
      const th = themes.find(x => x.id === radio.value);
      themeDesc.textContent = (th && th.desc) || '';
    }
    themeBox.addEventListener('change', e => { themePicked = true; setTheme(e.target.value); });

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
      $('.dt-setup-meta').textContent = sum.stages + ' 个环节，约 ' + sum.minutes + ' 分钟';
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
    const seats = $('.dt-setup-seats');
    function paintSeat() { seats.dataset.seat = page.querySelector('input[name="proSeat"]:checked').value; }
    page.querySelectorAll('input[name="proSeat"]').forEach(r => r.addEventListener('change', paintSeat));
    paintSeat();

    function start() {
      if (current < 0 || !o.onStart) return;
      const match = {};
      TEXT_FIELDS.forEach(k => { match[k] = field(k).value.trim(); });
      match.proSeat = page.querySelector('input[name="proSeat"]:checked').value;
      o.onStart(options[current].format, match, themeBox.querySelector('input:checked').value);
    }
    $('button[data-action="start"]').addEventListener('click', start);

    // Enter steps through the text boxes and starts the match from the last one.
    // An Enter that ends an input-method composition only commits the text.
    page.addEventListener('keydown', e => {
      const i = texts.indexOf(e.target);
      if (i < 0 || ENTER.indexOf(e.code) < 0 || e.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      if (i === texts.length - 1) start();
      else texts[i + 1].focus();
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
      destroy() { page.remove(); },
    };
  }

  DT.setup = { mount };
})(window.DT = window.DT || {});
