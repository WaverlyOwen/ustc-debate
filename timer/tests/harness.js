/* harness.js: a tiny test runner for the timer's browser tests. */
(function (DT) {
  'use strict';
  const tests = [];
  function test(name, fn) { tests.push({ name, fn }); }
  function canon(v) {
    if (Array.isArray(v)) return v.map(canon);
    if (v && typeof v === 'object') {
      const o = {};
      Object.keys(v).sort().forEach(k => { o[k] = canon(v[k]); });
      return o;
    }
    return v;
  }
  function fail(msg, detail) { throw new Error((msg ? msg + ': ' : '') + detail); }
  const assert = {
    equal(a, b, msg) { if (a !== b) fail(msg, 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); },
    deepEqual(a, b, msg) {
      const x = JSON.stringify(canon(a)), y = JSON.stringify(canon(b));
      if (x !== y) fail(msg, 'expected ' + y + ', got ' + x);
    },
    ok(v, msg) { if (!v) fail(msg, 'expected truthy, got ' + JSON.stringify(v)); },
    throws(fn, msg) { let threw = false; try { fn(); } catch (e) { threw = true; } if (!threw) fail(msg, 'expected an exception'); },
    near(a, b, eps, msg) { if (Math.abs(a - b) > eps) fail(msg, 'expected ' + b + ' ± ' + eps + ', got ' + a); },
  };
  async function run(filter) {
    const results = [];
    for (const t of tests) {
      if (filter && t.name.indexOf(filter) < 0) continue;
      try { await t.fn(); results.push({ name: t.name, ok: true }); }
      catch (e) { results.push({ name: t.name, ok: false, error: String(e && e.stack || e) }); }
    }
    const failed = results.filter(r => !r.ok).length;
    return { passed: results.length - failed, failed, results };
  }
  test.run = run;
  DT.test = test;
  window.assert = assert;
})(window.DT = window.DT || {});
