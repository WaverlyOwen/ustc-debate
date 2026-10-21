DT.test('builtin: five formats load with unique stage ids', () => {
  assert.equal(DT.BUILTIN_FORMATS.length, 5);
  DT.BUILTIN_FORMATS.forEach(f => {
    const ids = f.stages.map(s => s.id);
    assert.equal(new Set(ids).size, ids.length, f.id);
  });
});

// Revised 2026-10-18: build.py writes the engine's default bells into every built-in format (test_build.py checks
// that the two definitions match).
DT.test('builtin: every format rings the default bells: 30 s, 5 s, 3-2-1, the end and every second over', () => {
  DT.BUILTIN_FORMATS.forEach(f => assert.deepEqual(f.bells, DT.engine.DEFAULT_BELLS, f.id));
});

// Revised 2026-10-21: the school cup's surprise attack goes in during a judges' break and is followed by one of its
// own, copied from the format's 评委打分 break; only the school cup has extras.
DT.test('builtin: the school cup\'s surprise attack goes in during a break, with a 30 s 评委打分 after it', () => {
  const cup = DT.BUILTIN_FORMATS.find(f => f.id === 'ustc-school-cup');
  assert.deepEqual(cup.extras.map(g => [g.group, g.where, g.after]), [['奇袭', 'break', { name: '评委打分', secs: 30 }]]);
  const judges = cup.stages.find(s => s.type === 'break' && s.name === '评委打分');
  assert.deepEqual(cup.extras[0].after, { name: judges.name, secs: judges.secs });
  DT.BUILTIN_FORMATS.filter(f => f !== cup).forEach(f => assert.deepEqual(f.extras, [], f.id));
});
