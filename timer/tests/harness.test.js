DT.test('harness: deepEqual ignores key order', () => {
  assert.deepEqual({ a: 1, b: [1, { c: 2, d: 3 }] }, { b: [1, { d: 3, c: 2 }], a: 1 });
});
DT.test('harness: throws and near', () => {
  assert.throws(() => { throw new Error('x'); });
  assert.near(0.1 + 0.2, 0.3, 1e-9);
});
DT.test('harness: async tests are awaited', async () => {
  const v = await new Promise(r => setTimeout(() => r(7), 5));
  assert.equal(v, 7);
});
