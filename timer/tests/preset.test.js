(function () {
  const P = DT.preset;
  const F = () => DT.BUILTIN_FORMATS.find(f => f.id === 'ustc-freshman-cup');
  const MATCH = { title: '新生赛决赛', proMotion: '大学生应该优先发展兴趣', conMotion: '大学生不应该优先发展兴趣', proTeam: '物理学院', conTeam: '化学院', proSeat: 'left' };
  const PARTS = { lang: 'zh-CN', title: '辩论计时器', style: 'body{margin:0}', main: 'window.__main_ran = true;' };
  function docFrom(html) { return new DOMParser().parseFromString(html, 'text/html'); }
  function memStorage() {
    const m = new Map();
    return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m };
  }

  DT.test('preset: buildHtml has exactly one preset and one main script and no external references', () => {
    const html = P.buildHtml(PARTS, P.make(F(), MATCH, 'ink', 1790000000000));
    const doc = docFrom(html);
    assert.equal(doc.querySelectorAll('#dt-preset').length, 1);
    assert.equal(doc.querySelectorAll('#dt-main').length, 1);
    assert.equal(doc.querySelector('#dt-main').textContent, PARTS.main);
    assert.ok(!/<script[^>]+src=/.test(html) && !/<link[^>]+href=/.test(html));
    assert.ok(doc.body.hasAttribute('data-dt-autoboot'));
    assert.equal(doc.title, '新生赛决赛：辩论计时器');
  });

  DT.test('preset: script-like text in the motion is escaped', () => {
    const evil = Object.assign({}, MATCH, { proMotion: '</script><script>alert(1)</script>' });
    const html = P.buildHtml(PARTS, P.make(F(), evil, 'hall', 1));
    assert.equal(html.split('</script>').length - 1, 2, 'only the two real closing tags');
    const back = P.read(docFrom(html));
    assert.equal(back.match.proMotion, evil.proMotion);
  });

  DT.test('preset: read round-trips and rejects broken presets', () => {
    const preset = P.make(F(), MATCH, 'riso', 5);
    assert.deepEqual(P.read(docFrom(P.buildHtml(PARTS, preset))), preset);
    const wrap = json => docFrom('<html><body><script type="application/json" id="dt-preset">' + json + '</script></body></html>');
    assert.equal(P.read(wrap('{oops')), null);
    assert.equal(P.read(wrap(JSON.stringify(Object.assign({}, preset, { kind: 'x' })))), null);
    assert.equal(P.read(wrap(JSON.stringify(Object.assign({}, preset, { schema: 2 })))), null);
    const bad = JSON.parse(JSON.stringify(preset)); bad.format.stages = [];
    assert.equal(P.read(wrap(JSON.stringify(bad))), null);
    assert.equal(P.read(docFrom('<html><body></body></html>')), null);
  });

  DT.test('preset: exporting again replaces the preset instead of stacking', () => {
    const first = P.buildHtml(PARTS, P.make(F(), MATCH, 'hall', 1));
    const d = docFrom(first);
    P.captureSource(d);
    const again = P.buildHtml(P.sourceParts(), P.make(F(), Object.assign({}, MATCH, { title: '复赛' }), 'hall', 2));
    const d2 = docFrom(again);
    assert.equal(d2.querySelectorAll('#dt-preset').length, 1);
    assert.equal(P.read(d2).match.title, '复赛');
    P.captureSource(document);   // restore for other tests
  });

  DT.test('preset: the dev shell cannot export', () => {
    P.captureSource(docFrom('<html><head><style>x{}</style></head><body><script src="engine.js"></script></body></html>'));
    assert.equal(P.sourceParts(), null);
    P.captureSource(document);
  });

  DT.test('preset: file names follow title, then motion, then format', () => {
    assert.equal(P.fileName(P.make(F(), MATCH, 'hall', 1)), '新生赛决赛.html');
    assert.equal(P.fileName(P.make(F(), Object.assign({}, MATCH, { title: '' }), 'hall', 1)), '大学生应该优先发展兴趣.html');
    assert.equal(P.fileName(P.make(F(), Object.assign({}, MATCH, { title: '', proMotion: '' }), 'hall', 1)), '中国科学技术大学新生辩论赛.html');
    assert.equal(P.fileName(P.make(F(), Object.assign({}, MATCH, { title: 'a/b:c*' }), 'hall', 1)), 'a_b_c_.html');
  });

  DT.test('preset: namespaced storage keeps sessions apart', () => {
    const st = memStorage(); DT.store.useStorage(st);
    DT.store.setNamespace(null); DT.store.saveSession({ id: 'plain', history: [] });
    DT.store.setNamespace('m-abc');
    assert.equal(DT.store.loadSession(), null);
    DT.store.saveSession({ id: 'preset', history: [] });
    assert.ok(st.getItem('dt.m.m-abc.session.v1'));
    DT.store.setNamespace(null);
    assert.equal(DT.store.loadSession().id, 'plain');
  });

  // ---- beyond the brief ----

  DT.test('preset: make copies the format and keeps only the match fields', () => {
    const f = F();
    const p = P.make(f, Object.assign({ extra: 'x' }, MATCH, { proSeat: 'right' }), 'ink', 7);
    assert.equal(p.kind, 'debate-timer-match');
    assert.equal(p.schema, 1);
    assert.ok(/^m-./.test(p.id));
    assert.ok(P.make(f, MATCH, 'ink', 7).id !== p.id, 'every export has an id of its own');
    assert.equal(p.createdAt, 7);
    assert.equal(p.theme, 'ink');
    assert.deepEqual(Object.keys(p.match).sort(), ['conMotion', 'conTeam', 'proMotion', 'proSeat', 'proTeam', 'title']);
    assert.equal(p.match.proSeat, 'right');
    p.format.stages[0].name = '改过';
    assert.ok(F().stages[0].name !== '改过', 'the built-in format is untouched');
  });

  DT.test('preset: a namespace keeps the last match apart too, and leaves formats and settings shared', () => {
    const st = memStorage(); DT.store.useStorage(st);
    DT.store.setNamespace('m-abc');
    DT.store.saveLastMatch({ proTeam: '甲' });
    DT.store.saveSettings({ volume: 0.3, muted: true });
    assert.ok(st.getItem('dt.m.m-abc.lastMatch.v1'));
    assert.ok(st.getItem('dt.settings.v1'));
    DT.store.setNamespace(null);
    assert.equal(DT.store.loadLastMatch(), null);
    assert.equal(DT.store.loadSettings().volume, 0.3);
  });

  DT.test('preset: a file name loses control characters and trailing dots, and a long motion is cut to 16', () => {
    const long = '一二三四五六七八九十一二三四五六七八';
    assert.equal(P.fileName(P.make(F(), Object.assign({}, MATCH, { title: '' , proMotion: long }), 'hall', 1)), long.slice(0, 16) + '.html');
    assert.equal(P.fileName(P.make(F(), Object.assign({}, MATCH, { title: ' 第\t3 场. ' }), 'hall', 1)), '第_3 场.html');
  });

  DT.test('preset: the title of an exported page escapes markup in the match name', () => {
    const html = P.buildHtml(PARTS, P.make(F(), Object.assign({}, MATCH, { title: '</title><b>x' }), 'hall', 1));
    assert.equal(docFrom(html).title, '</title><b>x：辩论计时器');
  });
})();
