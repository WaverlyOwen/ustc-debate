(function () {
  const E = DT.engine;
  const T0 = 1000000;
  const MATCH = { title: '第 1 场', proMotion: 'A 是 B', conMotion: 'A 不是 B', proTeam: '物理', conTeam: '化学', proSeat: 'left' };
  function fx() {
    return {
      id: 'fx', name: '测试赛制', theme: 'hall',
      bells: { warn: [30], countdown: 0, end: 'double' },
      stages: [
        { id: 's1', name: '正方一辩开篇立论', type: 'single', side: 'pro', secs: 180, speaker: '正一', block: 'A' },
        { id: 's2', name: '反方四辩质询正方一辩', type: 'single', side: 'con', secs: 120, speaker: '反四 问，正一 答', block: 'A' },
        { id: 'b1', name: '评委打分', type: 'break', side: null, secs: 30 },
        { id: 's3', name: '自由辩论', type: 'dual', side: null, secs: 240, first: 'pro', block: 'D' },
        { id: 's4', name: '反方四辩结辩', type: 'single', side: 'con', secs: 210, block: 'E', bells: { countdown: 5 } },
      ],
      extras: [{ group: '奇袭', perSide: 1, variants: [
        { name: '奇袭质询', type: 'single', secs: 150 }, { name: '奇袭申论', type: 'single', secs: 120 }] }],
    };
  }
  function at(i, now) { return E.goto(E.createSession(fx(), MATCH, T0), i, now === undefined ? T0 : now); }
  const rem = (s, clock, now, id) => E.remaining(E.getRun(s, id), clock, now);

  DT.test('engine: createSession copies the format and starts at the title card', () => {
    const f = fx(); const s = E.createSession(f, MATCH, T0);
    assert.equal(s.cursor, -1);
    f.stages[0].secs = 1;
    assert.equal(s.timeline[0].secs, 180);
    assert.equal(s.format.stages[0].secs, 180);
    assert.equal(E.view(s, T0).mode, 'title');
  });

  DT.test('engine: effectiveBells merges default, format and stage; breaks chime', () => {
    const f = fx();
    assert.deepEqual(E.effectiveBells(f, f.stages[0]), { warn: [30], countdown: 0, end: 'double' });
    assert.deepEqual(E.effectiveBells(f, f.stages[4]), { warn: [30], countdown: 5, end: 'double' });
    assert.deepEqual(E.effectiveBells({ bells: { end: 'triple' } }, { type: 'single' }), { warn: [30], countdown: 0, end: 'triple' });
    assert.deepEqual(E.effectiveBells(f, f.stages[2]), { warn: [], countdown: 0, end: 'chime' });
    assert.deepEqual(E.effectiveBells(f, { type: 'break', bells: { warn: [10] } }), { warn: [10], countdown: 0, end: 'chime' });
  });

  DT.test('engine: fmt rounds remaining up and overtime down', () => {
    assert.equal(E.fmt(180000), '3:00');
    assert.equal(E.fmt(179001), '3:00');
    assert.equal(E.fmt(179000), '2:59');
    assert.equal(E.fmt(1), '0:01');
    assert.equal(E.fmt(0), '0:00');
    assert.equal(E.fmt(-7999), '+0:07');
    assert.equal(E.fmt(-65000), '+1:05');
    assert.equal(E.fmt(3600000), '60:00');
  });

  DT.test('engine: space on the title card moves to the first stage', () => {
    const s = E.toggle(E.createSession(fx(), MATCH, T0), T0);
    assert.equal(s.cursor, 0);
    assert.equal(E.getRun(s).running, false);
  });

  DT.test('engine: single stage accumulates time across pauses', () => {
    let s = at(0);
    s = E.toggle(s, T0);
    s = E.toggle(s, T0 + 10000);
    assert.equal(rem(s, 'main', T0 + 50000), 170000);
    s = E.toggle(s, T0 + 60000);
    assert.equal(rem(s, 'main', T0 + 65000), 165000);
  });

  DT.test('engine: single stage runs into overtime without stopping', () => {
    let s = E.toggle(at(0), T0);
    const now = T0 + 187000;
    s = E.tick(s, now).session;
    const r = E.getRun(s);
    assert.ok(r.running);
    assert.equal(E.remaining(r, 'main', now), -7000);
    const c = E.view(s, now).clocks[0];
    assert.equal(c.phase, 'over'); assert.equal(c.overtime, 7000); assert.equal(c.fraction, 0);
    assert.equal(c.text, '+0:07');
  });

  DT.test('engine: pause toggles in every kind of stage', () => {
    let s = E.toggle(at(3), T0);
    s = E.pause(s, T0 + 5000);
    assert.equal(E.getRun(s).running, false); assert.equal(E.getRun(s).active, 'pro');
    s = E.pause(s, T0 + 9000);
    assert.ok(E.getRun(s).running); assert.equal(E.getRun(s).active, 'pro');
    assert.equal(rem(s, 'pro', T0 + 10000), 234000);
  });

  DT.test('engine: first space in a dual stage gives the floor to first', () => {
    const r = E.getRun(E.toggle(at(3), T0));
    assert.equal(r.active, 'pro'); assert.ok(r.running);
  });

  DT.test('engine: space switches the floor and charges each side its own time', () => {
    let s = E.toggle(at(3), T0);
    s = E.toggle(s, T0 + 20000);
    s = E.toggle(s, T0 + 35000);
    assert.equal(rem(s, 'pro', T0 + 35000), 220000);
    assert.equal(rem(s, 'con', T0 + 35000), 225000);
    assert.equal(E.getRun(s).active, 'pro');
  });

  DT.test('engine: floor gives the floor directly and ignores single stages', () => {
    const s = E.floor(at(3), 'con', T0);
    assert.equal(E.getRun(s).active, 'con');
    const same = E.floor(s, 'con', T0 + 1000);
    assert.equal(rem(same, 'con', T0 + 5000), 235000);
    const single = E.floor(at(0), 'pro', T0);
    assert.equal(E.getRun(single).running, false);
    assert.equal(single.lastFeedback.code, 'not-dual');
  });

  DT.test('engine: exhausting one side hands over at the exact moment', () => {
    const s = E.toggle(at(3), T0);
    const late = T0 + 240000 + 3700;
    const out = E.tick(s, late);
    const r = E.getRun(out.session);
    assert.ok(r.locked.pro);
    assert.equal(r.clocks.pro.used, 240000);
    assert.equal(r.active, 'con');
    assert.equal(E.remaining(r, 'con', late), 240000 - 3700);
    assert.ok(out.events.some(e => e.type === 'switch' && e.from === 'pro' && e.to === 'con' && e.at === T0 + 240000));
  });

  DT.test('engine: a locked side cannot take the floor', () => {
    let s = E.toggle(at(3), T0);
    s = E.tick(s, T0 + 240000).session;
    const a = E.floor(s, 'pro', T0 + 241000);
    assert.equal(E.getRun(a).active, 'con');
    assert.equal(a.lastFeedback.code, 'locked');
    const sp = E.toggle(s, T0 + 241000);
    assert.equal(E.getRun(sp).active, 'con');
    assert.equal(sp.lastFeedback.code, 'locked');
  });

  DT.test('engine: the dual stage is done when both sides run out, even in one tick', () => {
    let s = E.toggle(at(3), T0);
    s = E.tick(s, T0 + 480010).session;
    const r = E.getRun(s);
    assert.ok(r.locked.pro && r.locked.con); assert.ok(r.done); assert.equal(r.running, false);
  });

  DT.test('engine: yielding records the unused time and hands over', () => {
    let s = E.toggle(at(3), T0);
    s = E.yieldTime(s, T0 + 100000);
    const r = E.getRun(s);
    assert.ok(r.locked.pro); assert.equal(r.yielded.pro, 140000);
    assert.equal(r.active, 'con'); assert.ok(r.running);
    assert.equal(E.remaining(r, 'con', T0 + 110000), 230000);
  });

  DT.test('engine: undoing a mistaken switch keeps the first side running', () => {
    let s = E.toggle(at(3), T0);
    s = E.toggle(s, T0 + 10000);
    s = E.undo(s, T0 + 13000);
    const r = E.getRun(s);
    assert.equal(r.active, 'pro'); assert.ok(r.running);
    assert.equal(E.remaining(r, 'pro', T0 + 13000), 227000);
    assert.equal(E.remaining(r, 'con', T0 + 13000), 240000);
  });

  DT.test('engine: undo history is capped at 100 and empty undo gives feedback', () => {
    let s = at(0);
    for (let i = 0; i < 130; i++) s = E.toggle(s, T0 + i * 1000);
    assert.ok(s.history.length <= 100);
    const e = E.undo(E.createSession(fx(), MATCH, T0), T0);
    assert.equal(e.lastFeedback.code, 'nothing-to-undo');
  });

  DT.test('engine: adjust clamps at full time and re-arms bells above the new remaining', () => {
    let s = E.toggle(at(0), T0);
    s = E.tick(s, T0 + 150500).session;
    assert.ok(E.getRun(s).fired.main.indexOf('w30') >= 0);
    s = E.adjust(s, 5000, T0 + 150500);
    assert.ok(E.getRun(s).fired.main.indexOf('w30') < 0);
    s = E.adjust(s, 999000, T0 + 150500);
    assert.equal(rem(s, 'main', T0 + 150500), 180000);
  });

  DT.test('engine: adding time to a locked side unlocks it', () => {
    let s = E.toggle(at(3), T0);
    s = E.tick(s, T0 + 240000).session;
    s = E.adjust(s, 5000, T0 + 241000, 'pro');
    const r = E.getRun(s);
    assert.equal(r.locked.pro, false);
    assert.equal(E.remaining(r, 'pro', T0 + 241000), 5000);
    assert.equal(r.active, 'con');
  });

  DT.test('engine: a bell point fires once when crossed', () => {
    const s = E.toggle(at(0), T0);
    let out = E.tick(s, T0 + 150000);
    assert.deepEqual(out.events.map(e => e.key), ['w30']);
    out = E.tick(out.session, T0 + 150400);
    assert.equal(out.events.length, 0);
    out = E.tick(out.session, T0 + 180000);
    assert.deepEqual(out.events.map(e => e.type), ['end']);
  });

  DT.test('engine: stale bell points are marked without firing', () => {
    const out = E.tick(E.toggle(at(0), T0), T0 + 152000);
    assert.equal(out.events.length, 0);
    assert.ok(E.getRun(out.session).fired.main.indexOf('w30') >= 0);
  });

  DT.test('engine: crossing a bell point while paused does not fire', () => {
    let s = E.toggle(at(0), T0);
    s = E.toggle(s, T0 + 140000);
    s = E.adjust(s, -15000, T0 + 141000);
    const out = E.tick(s, T0 + 141000);
    assert.equal(out.events.length, 0);
    assert.ok(E.getRun(out.session).fired.main.indexOf('w30') >= 0);
  });

  DT.test('engine: countdown fires one event per second', () => {
    let s = E.toggle(at(4), T0);
    let keys = [];
    for (let t = 204000; t <= 210000; t += 250) {
      const out = E.tick(s, T0 + t); s = out.session; keys = keys.concat(out.events.map(e => e.key));
    }
    assert.deepEqual(keys, ['c5', 'c4', 'c3', 'c2', 'c1', 'end']);
  });

  DT.test('engine: a break stops itself at zero and fires end', () => {
    const s = E.toggle(at(2), T0);
    const out = E.tick(s, T0 + 30500);
    const r = E.getRun(out.session);
    assert.equal(r.running, false); assert.ok(r.done);
    assert.equal(E.remaining(r, 'main', T0 + 40000), 0);
    assert.deepEqual(out.events.map(e => e.type), ['end']);
    assert.equal(E.toggle(out.session, T0 + 41000).lastFeedback.code, 'done');
  });

  DT.test('engine: moving between stages pauses and keeps each stage', () => {
    let s = E.toggle(at(0), T0);
    s = E.next(s, T0 + 30000);
    assert.equal(s.cursor, 1);
    s = E.prev(s, T0 + 90000);
    const r = E.getRun(s);
    assert.equal(r.running, false);
    assert.equal(E.remaining(r, 'main', T0 + 90000), 150000);
  });

  DT.test('engine: goto clamps to the title and end cards', () => {
    const s = E.createSession(fx(), MATCH, T0);
    assert.equal(E.goto(s, -9, T0).cursor, -1);
    assert.equal(E.goto(s, 99, T0).cursor, 5);
    assert.equal(E.view(E.goto(s, 99, T0), T0).mode, 'end');
  });

  DT.test('engine: reset restores the current stage only', () => {
    let s = E.toggle(at(0), T0); s = E.next(s, T0 + 50000); s = E.toggle(s, T0 + 50000);
    s = E.reset(s, T0 + 60000);
    assert.equal(rem(s, 'main', T0 + 70000), 120000);
    assert.equal(rem(s, 'main', T0 + 70000, 's1'), 130000);
  });

  DT.test('engine: extras insert after the current stage and respect perSide', () => {
    let s = E.toggle(at(0), T0); s = E.toggle(s, T0 + 170000);
    s = E.insertExtra(s, '奇袭', 0, 'con', T0 + 171000);
    assert.equal(s.cursor, 0);
    assert.equal(s.timeline[1].name, '反方奇袭质询');
    assert.equal(s.timeline[1].side, 'con');
    assert.ok(s.timeline[1].extra);
    assert.equal(s.timeline[1].secs, 150);
    assert.equal(s.extrasUsed['奇袭'].con, 1);
    const again = E.insertExtra(s, '奇袭', 1, 'con', T0 + 172000);
    assert.equal(again.lastFeedback.code, 'extra-limit');
    assert.equal(again.timeline.length, s.timeline.length);
    const pro = E.insertExtra(s, '奇袭', 1, 'pro', T0 + 172000);
    assert.equal(pro.timeline[1].name, '正方奇袭申论');
    assert.ok(pro.timeline[1].id !== pro.timeline[2].id);
  });

  DT.test('engine: extras cannot be inserted while a clock is running', () => {
    const s = E.toggle(at(0), T0);
    assert.equal(E.insertExtra(s, '奇袭', 0, 'pro', T0 + 1000).lastFeedback.code, 'running');
  });

  DT.test('engine: view reports calm, warn, count, over and done phases', () => {
    const s = E.toggle(at(4), T0);
    const ph = t => E.view(s, T0 + t).clocks[0].phase;
    assert.equal(ph(100000), 'calm');
    assert.equal(ph(181000), 'warn');
    assert.equal(ph(206000), 'count');
    assert.equal(ph(211000), 'over');
    let d = E.toggle(at(3), T0); d = E.yieldTime(d, T0 + 1000);
    const pro = E.view(d, T0 + 2000).clocks.find(c => c.id === 'pro');
    assert.equal(pro.phase, 'done'); assert.ok(pro.locked);
  });

  DT.test('engine: view carries stage, next, progress and warnAt', () => {
    let s = E.toggle(at(0), T0); s = E.next(s, T0 + 180000);
    const v = E.view(s, T0 + 180000);
    assert.equal(v.mode, 'stage');
    assert.equal(v.stage.index, 1); assert.equal(v.stage.count, 5);
    assert.equal(v.stage.side, 'con'); assert.equal(v.next.name, '评委打分');
    assert.deepEqual(v.progress.map(p => p.state), ['done', 'current', 'todo', 'todo', 'todo']);
    assert.equal(v.proSeat, 'left');
    assert.near(v.warnAt, 30 / 120, 1e-9);
    const dv = E.view(at(3), T0);
    assert.deepEqual(dv.clocks.map(c => c.id), ['pro', 'con']);
    assert.deepEqual(dv.clocks.map(c => c.label), ['正方', '反方']);
  });

  DT.test('engine: view stage carries id and first', () => {
    const d = E.view(at(3), T0).stage;
    assert.equal(d.id, 's3'); assert.equal(d.first, 'pro');
    assert.equal(E.view(at(0), T0).stage.first, null);
    const f = fx(); delete f.stages[3].first;
    assert.equal(E.view(E.goto(E.createSession(f, MATCH, T0), 3, T0), T0).stage.first, 'pro');
  });

  DT.test('engine: view carries the format name in every mode', () => {
    const s = E.createSession(fx(), MATCH, T0);
    assert.equal(E.view(s, T0).formatName, '测试赛制');
    assert.equal(E.view(at(0), T0).formatName, '测试赛制');
    assert.equal(E.view(E.goto(s, 99, T0), T0).formatName, '测试赛制');
  });

  DT.test('engine: upcomingBells lists future bells of the running clock', () => {
    const s = E.toggle(at(4), T0);
    assert.deepEqual(E.upcomingBells(s, T0 + 1000).map(b => [b.sound, b.at - T0]), [
      ['ding', 180000], ['tick', 205000], ['tick', 206000], ['tick', 207000], ['tick', 208000], ['tick', 209000], ['double', 210000]]);
    assert.deepEqual(E.upcomingBells(E.toggle(s, T0 + 2000), T0 + 2000), []);
    const b = E.toggle(at(2), T0);
    assert.deepEqual(E.upcomingBells(b, T0).map(x => [x.sound, x.at - T0]), [['chime', 30000]]);
  });

  DT.test('engine: upcomingBells follows the handover in a dual stage', () => {
    let s = E.toggle(at(3), T0);
    s = E.toggle(s, T0 + 100000);
    s = E.toggle(s, T0 + 130000);
    assert.deepEqual(E.upcomingBells(s, T0 + 130000).map(b => [b.clock, b.sound, b.at - T0]), [
      ['pro', 'ding', 240000], ['pro', 'double', 270000], ['con', 'ding', 450000], ['con', 'double', 480000]]);
  });

  DT.test('engine: record reports planned and used time per stage', () => {
    let s = E.toggle(at(0), T0); s = E.next(s, T0 + 187000);
    s = E.toggle(s, T0 + 190000); s = E.next(s, T0 + 290000);
    const rec = E.record(s, T0 + 300000);
    assert.deepEqual(rec.slice(0, 2).map(r => [r.planned, r.used, r.over]), [[180000, 187000, 7000], [120000, 100000, 0]]);
    assert.equal(rec[2].used, 0);
    assert.equal(rec[3].planned, 480000);
  });

  DT.test('engine: record counts yielded time apart from time spoken in a dual stage', () => {
    let s = E.toggle(at(3), T0);
    s = E.yieldTime(s, T0 + 100000);
    const r = E.record(s, T0 + 130000)[3];
    assert.deepEqual([r.planned, r.used, r.yielded, r.over], [480000, 130000, 140000, 0]);
  });

  DT.test('engine: actions never mutate their input', () => {
    const s = E.toggle(at(3), T0);
    const snap = JSON.stringify(s);
    E.toggle(s, T0 + 1000); E.floor(s, 'con', T0 + 1000); E.yieldTime(s, T0 + 1000);
    E.adjust(s, 1000, T0 + 1000); E.tick(s, T0 + 999999); E.next(s, T0 + 1000); E.undo(s, T0 + 1000);
    E.insertExtra(E.pause(s, T0 + 1), '奇袭', 0, 'pro', T0 + 2);
    assert.equal(JSON.stringify(s), snap);
  });

  DT.test('engine: a session survives a JSON round trip', () => {
    let s = E.toggle(at(3), T0); s = E.toggle(s, T0 + 5000);
    const back = JSON.parse(JSON.stringify(s));
    assert.equal(E.remaining(E.getRun(back), 'con', T0 + 9000), 236000);
    assert.equal(E.getRun(E.toggle(back, T0 + 9000)).active, 'pro');
  });

  DT.test('engine: DT.clock can be replaced and restored', () => {
    DT.clock.set(() => 42);
    assert.equal(DT.clock.now(), 42);
    DT.clock.reset();
    assert.ok(DT.clock.now() > 1e12);
  });
  // ---- final review ----

  DT.test('engine: going to the stage already on screen leaves its clock running', () => {
    const s = E.toggle(at(0), T0);
    const g = E.goto(s, 0, T0 + 5000);
    assert.ok(E.getRun(g).running);
    assert.equal(g.history.length, s.history.length, 'nothing to undo');
    assert.equal(rem(g, 'main', T0 + 5000), 175000);
    assert.ok(E.getRun(E.goto(E.toggle(at(3), T0), 3, T0 + 5000)).running);
  });

  DT.test('engine: taking time off a running clock rings the bell points it crosses, now', () => {
    let s = E.toggle(at(0), T0);
    s = E.tick(s, T0 + 148000).session;            // 0:32 left
    s = E.adjust(s, -5000, T0 + 148000);           // 0:27: the 30 s point is behind it
    assert.deepEqual(s.lastRung.map(e => [e.type, e.clock, e.key, e.sound, e.at - T0]), [['warn', 'main', 'w30', 'ding', 148000]]);
    assert.ok(E.getRun(s).fired.main.indexOf('w30') >= 0);
    assert.equal(E.tick(s, T0 + 148100).events.length, 0, 'tick does not report it again');
    assert.deepEqual(E.upcomingBells(s, T0 + 148000).map(b => b.sound), ['double']);
    assert.equal(E.adjust(s, -1000, T0 + 149000).lastRung, null, 'the next action does not ring it again');
    const end = E.adjust(E.tick(s, T0 + 174000).session, -5000, T0 + 174000);   // 0:01 -> over
    assert.deepEqual(end.lastRung.map(e => [e.key, e.sound]), [['end', 'double']]);
    // A paused clock that is set past a bell point stays silent (spec §3.2).
    let p = E.toggle(E.tick(E.toggle(at(0), T0), T0 + 148000).session, T0 + 148000);
    p = E.adjust(p, -5000, T0 + 149000);
    assert.equal(p.lastRung, null);
  });

  DT.test('engine: undoing a mistaken switch rings the bells the speaking side crossed meanwhile', () => {
    let s = E.toggle(at(3), T0);                   // free debate, pro speaks
    s = E.tick(s, T0 + 205000).session;            // pro 0:35
    s = E.toggle(s, T0 + 205000);                  // switched to con by mistake
    s = E.tick(s, T0 + 213000).session;
    s = E.undo(s, T0 + 213000);                    // pro spoke on: its 30 s point passed at 210 s
    assert.deepEqual(s.lastRung.map(e => [e.type, e.clock, e.key, e.sound]), [['warn', 'pro', 'w30', 'ding']]);
    assert.ok(E.getRun(s).fired.pro.indexOf('w30') >= 0);
    assert.equal(E.tick(s, T0 + 213100).events.length, 0);
    // Pro ran out in the undone window: the end bell rings late and the floor has passed to con.
    let t = E.toggle(at(3), T0);
    t = E.tick(t, T0 + 238000).session;            // pro 0:02
    t = E.toggle(t, T0 + 238000);
    t = E.undo(E.tick(t, T0 + 243000).session, T0 + 243000);
    assert.deepEqual(t.lastRung.filter(e => e.sound).map(e => [e.clock, e.key, e.sound]), [['pro', 'end', 'double']]);
    const r = E.getRun(t);
    assert.equal(r.active, 'con'); assert.ok(r.locked.pro); assert.ok(r.running);
  });

  DT.test('engine: undo does not ring again a bell that already rang', () => {
    let s = E.toggle(at(0), T0);
    s = E.adjust(s, 1000, T0 + 100000);
    const out = E.tick(s, T0 + 151000);            // the 30 s point rings at 151 s
    assert.deepEqual(out.events.map(e => e.key), ['w30']);
    const u = E.undo(out.session, T0 + 152000);    // back to before the +1 s: the point is behind it
    assert.equal(u.lastRung, null);
    assert.ok(E.getRun(u).fired.main.indexOf('w30') >= 0);
  });

  DT.test('engine: nothing is inserted on the end card; the title card inserts before the first stage', () => {
    const s = E.goto(E.createSession(fx(), MATCH, T0), 99, T0);
    const r = E.insertExtra(s, '奇袭', 0, 'pro', T0);
    assert.equal(r.lastFeedback.code, 'ended');
    assert.equal(r.lastFeedback.message, '比赛已经结束');
    assert.equal(r.timeline.length, s.timeline.length);
    assert.equal(E.view(r, T0).mode, 'end');
    const t = E.insertExtra(E.createSession(fx(), MATCH, T0), '奇袭', 0, 'pro', T0);
    assert.equal(t.cursor, -1);
    assert.equal(t.timeline[0].name, '正方奇袭质询');
  });
})();
