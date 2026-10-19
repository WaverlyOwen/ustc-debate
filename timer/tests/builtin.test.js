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
