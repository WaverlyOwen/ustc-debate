DT.test('builtin: five formats load with unique stage ids', () => {
  assert.equal(DT.BUILTIN_FORMATS.length, 5);
  DT.BUILTIN_FORMATS.forEach(f => {
    const ids = f.stages.map(s => s.id);
    assert.equal(new Set(ids).size, ids.length, f.id);
  });
});
