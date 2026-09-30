(function () {
  const S = DT.store;
  function memStorage() {
    const m = new Map();
    return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m };
  }
  function good() {
    return { id: 'u-x', name: '周末模辩', theme: 'hall', bells: { warn: [30], countdown: 0, end: 'double' },
      stages: [{ id: 'a', name: '正方立论', type: 'single', side: 'pro', secs: 180 },
               { id: 'b', name: '自由辩', type: 'dual', side: null, secs: 120, first: 'con' },
               { id: 'c', name: '休息', type: 'break', side: null, secs: 30 }], extras: [] };
  }
  const withStage = patch => { const f = good(); Object.assign(f.stages[0], patch); return f; };

  DT.test('store: every builtin format validates', () => {
    assert.ok(DT.BUILTIN_FORMATS.length >= 5);
    DT.BUILTIN_FORMATS.forEach(f => assert.deepEqual(S.validateFormat(f), [], f.id));
    assert.deepEqual(S.validateFormat(good()), []);
  });

  DT.test('store: validation messages name the stage in Chinese', () => {
    assert.deepEqual(S.validateFormat(Object.assign(good(), { name: '' })), ['赛制名称不能为空']);
    assert.deepEqual(S.validateFormat(Object.assign(good(), { stages: [] })), ['至少要有一个环节']);
    assert.deepEqual(S.validateFormat(withStage({ secs: 0 })), ['第 1 个环节：时长要大于 0 秒']);
    assert.deepEqual(S.validateFormat(withStage({ secs: 3601 })), ['第 1 个环节：时长不能超过 60 分钟']);
    assert.deepEqual(S.validateFormat(withStage({ type: 'x' })), ['第 1 个环节：计时方式只能是单方、双方或间隔']);
    assert.deepEqual(S.validateFormat(withStage({ side: null })), ['第 1 个环节：单方环节要选正方或反方']);
    assert.deepEqual(S.validateFormat(withStage({ id: 'b' })), ['第 2 个环节：编号和第 1 个环节重复']);
    assert.deepEqual(S.validateFormat(withStage({ name: '长'.repeat(41) })), ['第 1 个环节：名称最多 40 个字']);
    const f = good(); f.stages[1].first = 'x';
    assert.deepEqual(S.validateFormat(f), ['第 2 个环节：先发言的一方只能是正方或反方']);
    assert.deepEqual(S.validateFormat(Object.assign(good(), { bells: { warn: [30], countdown: 11, end: 'double' } })), ['铃声：逐秒倒数最多 10 秒']);
    assert.deepEqual(S.validateFormat(withStage({ bells: { warn: [-5] } })), ['第 1 个环节：铃声：提示铃点要写成正整数秒']);
    assert.deepEqual(S.validateFormat(Object.assign(good(), { extras: [{ group: '奇袭', perSide: 0, variants: [{ name: 'x', type: 'single', secs: 60 }] }] })),
      ['可插入环节「奇袭」：每方次数至少 1 次']);
    assert.deepEqual(S.validateFormat(null), ['这不是一个赛制']);
  });

  DT.test('store: parseDuration accepts the written forms and rejects the rest', () => {
    const ok = { '3:00': 180, '180': 180, '180秒': 180, '180s': 180, '3分': 180, '3分钟': 180, '3分30秒': 210,
                 "1'30": 90, ' 2:05 ': 125, '1：30': 90, '60:00': 3600, '1': 1 };
    Object.keys(ok).forEach(k => assert.equal(S.parseDuration(k), ok[k], k));
    ['0', '', 'abc', '1:75', '61:00', '-5', '1.5', '3:', ':30', null, undefined].forEach(k => assert.equal(S.parseDuration(k), null, String(k)));
    assert.equal(S.formatDuration(180), '3:00');
    assert.equal(S.formatDuration(65), '1:05');
  });

  DT.test('store: builtins load first and edits override them', () => {
    const st = memStorage(); S.useStorage(st);
    let list = S.loadFormats();
    assert.equal(list[0].id, DT.BUILTIN_FORMATS[0].id);
    assert.ok(list.every(f => S.isPristine(f)));
    list[0] = Object.assign({}, list[0], { name: '改过的' });
    list.push(good());
    S.saveFormats(list);
    const stored = JSON.parse(st.getItem('dt.formats.v1'));
    assert.deepEqual(stored.formats.map(f => f.id), [DT.BUILTIN_FORMATS[0].id, 'u-x']);
    const again = S.loadFormats();
    assert.equal(again[0].name, '改过的');
    assert.equal(again[again.length - 1].id, 'u-x');
    const restored = S.restoreBuiltin(again, DT.BUILTIN_FORMATS[0].id);
    assert.ok(S.isPristine(restored[0]));
  });

  DT.test('store: bad storage never throws', () => {
    const st = memStorage(); S.useStorage(st);
    st.setItem('dt.formats.v1', '{not json'); st.setItem('dt.session.v1', 'x'); st.setItem('dt.settings.v1', '[');
    assert.equal(S.loadFormats().length, DT.BUILTIN_FORMATS.length);
    assert.equal(S.loadSession(), null);
    assert.deepEqual(S.loadSettings(), { volume: 0.8, muted: false });
    S.useStorage({ getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() {} });
    assert.equal(S.loadFormats().length, DT.BUILTIN_FORMATS.length);
    S.saveFormats([good()]);
  });

  DT.test('store: export then import round-trips', () => {
    const text = S.exportFormats([good()]);
    const back = S.parseImport(text);
    assert.deepEqual(back.errors, []);
    assert.deepEqual(back.formats[0], good());
    assert.deepEqual(S.parseImport(JSON.stringify(good())).formats[0].name, '周末模辩');
    assert.equal(S.exportFileName({ name: 'a/b:c' }), 'a_b_c.debate-timer.json');
  });

  DT.test('store: parseImport rejects broken, foreign and newer files', () => {
    assert.deepEqual(S.parseImport('{oops').errors, ['文件不是有效的 JSON']);
    assert.deepEqual(S.parseImport('{"hello": 1}').errors, ['这不是计时器的赛制文件']);
    assert.deepEqual(S.parseImport(JSON.stringify({ kind: 'debate-timer-formats', schema: 2, formats: [] })).errors,
      ['这个文件来自更新版本的计时器，请先更新计时器']);
    const bad = good(); bad.stages[0].secs = 0;
    const r = S.parseImport(S.exportFormats([bad, Object.assign(good(), { id: 'u-y' })]));
    assert.deepEqual(r.errors, ['「周末模辩」：第 1 个环节：时长要大于 0 秒']);
    assert.equal(r.formats.length, 1);
  });

  DT.test('store: parseImport fills defaults for minimal files', () => {
    const r = S.parseImport(JSON.stringify({ name: '极简', stages: [{ name: '立论', type: 'single', side: 'pro', secs: 60 }] }));
    assert.deepEqual(r.errors, []);
    const f = r.formats[0];
    assert.ok(/^u-/.test(f.id)); assert.equal(f.theme, 'hall');
    assert.deepEqual(f.bells, DT.engine.DEFAULT_BELLS); assert.deepEqual(f.extras, []);
    assert.ok(f.stages[0].id);
  });

  DT.test('store: import never touches existing formats on error', () => {
    const list = [good()];
    const r = S.parseImport('{oops');
    const after = r.formats.reduce((l, f) => S.addImported(l, f, 'copy'), list);
    assert.equal(after, list);
  });

  DT.test('store: addImported replaces or copies on id conflict', () => {
    const list = [good()];
    const incoming = Object.assign(good(), { name: '新版' });
    assert.equal(S.addImported(list, incoming, 'replace')[0].name, '新版');
    assert.equal(S.addImported(list, incoming, 'replace').length, 1);
    const copied = S.addImported(list, incoming, 'copy');
    assert.equal(copied.length, 2);
    assert.equal(copied[1].name, '新版（导入）');
    assert.ok(copied[1].id !== 'u-x');
    assert.equal(list.length, 1);
  });

  DT.test('store: new, duplicate and newStage give valid shapes', () => {
    assert.deepEqual(S.validateFormat(S.newFormat()), []);
    const d = S.duplicateFormat(DT.BUILTIN_FORMATS[0]);
    assert.equal(d.builtin, false); assert.ok(d.name.endsWith('（副本）'));
    assert.ok(d.id !== DT.BUILTIN_FORMATS[0].id); assert.equal(d.source, undefined);
    ['single', 'dual', 'break'].forEach(t => {
      const f = good(); f.stages.push(S.newStage(t));
      assert.deepEqual(S.validateFormat(f), [], t);
    });
  });

  DT.test('store: session is saved with a short history', () => {
    const st = memStorage(); S.useStorage(st);
    S.saveSession({ id: 's', history: new Array(60).fill({ x: 1 }) });
    assert.equal(S.loadSession().history.length, 20);
    S.clearSession();
    assert.equal(S.loadSession(), null);
    S.saveSettings({ volume: 0.3, muted: true });
    assert.deepEqual(S.loadSettings(), { volume: 0.3, muted: true });
    S.saveLastMatch({ proTeam: '甲' });
    assert.equal(S.loadLastMatch().proTeam, '甲');
  });
})();
