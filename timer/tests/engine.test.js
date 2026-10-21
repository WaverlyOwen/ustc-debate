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
      extras: [{ group: '奇袭', perSide: 1, where: 'break', after: { name: '评委打分', secs: 30 }, variants: [
        { name: '奇袭质询', type: 'single', secs: 150 }, { name: '奇袭申论', type: 'single', secs: 120 }] }],
    };
  }
  function at(i, now) { return E.goto(E.createSession(fx(), MATCH, T0), i, now === undefined ? T0 : now); }
  // The fixture with its extra group's rules changed (revised 2026-10-21), on stage i.
  function atWith(rules, i, now) {
    const f = fx();
    Object.assign(f.extras[0], rules);
    return E.goto(E.createSession(f, MATCH, T0), i, now === undefined ? T0 : now);
  }
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
    assert.deepEqual(E.effectiveBells(f, f.stages[0]), { warn: [30], countdown: 0, end: 'double', overtime: 'tick' });
    assert.deepEqual(E.effectiveBells(f, f.stages[4]), { warn: [30], countdown: 5, end: 'double', overtime: 'tick' });
    assert.deepEqual(E.effectiveBells({ bells: { end: 'triple' } }, { type: 'single' }),
      { warn: [30, 5], countdown: 3, end: 'triple', overtime: 'tick' });
    assert.deepEqual(E.effectiveBells(f, f.stages[2]), { warn: [], countdown: 3, end: 'chime', overtime: 'none' });
    assert.deepEqual(E.effectiveBells(f, { type: 'break', bells: { warn: [10] } }), { warn: [10], countdown: 3, end: 'chime', overtime: 'none' });
    assert.equal(E.effectiveBells({ bells: { overtime: 'none' } }, { type: 'single' }).overtime, 'none', 'the format turns it off');
    assert.equal(E.effectiveBells({ bells: { overtime: 'none' } }, { type: 'single', bells: { overtime: 'tick' } }).overtime, 'tick',
      'and a stage back on');
  });

  // Revised 2026-10-18: what the school cup asks of a speech, from a format that says nothing of its bells.
  DT.test('engine: the default bells ring at 30 s, 5 s, 3-2-1, the end and every second over; a break counts down and chimes', () => {
    const d = E.effectiveBells({}, { type: 'single' });
    assert.deepEqual(d, { warn: [30, 5], countdown: 3, end: 'double', overtime: 'tick' });
    assert.deepEqual(E.DEFAULT_BELLS, d);
    assert.deepEqual(E.bellPoints(d).map(p => [p.key, p.ms, p.type]), [
      ['w30', 30000, 'warn'], ['w5', 5000, 'warn'], ['c3', 3000, 'count'], ['c2', 2000, 'count'], ['c1', 1000, 'count'], ['end', 0, 'end']]);
    assert.deepEqual(E.effectiveBells({ bells: { warn: [60] } }, { type: 'break' }), { warn: [], countdown: 3, end: 'chime', overtime: 'none' });
    const f = fx(); delete f.bells;
    const s = E.toggle(E.goto(E.createSession(f, MATCH, T0), 0, T0), T0);
    const up = E.upcomingBells(s, T0 + 1000).map(b => [b.sound, b.at - T0]);
    assert.deepEqual(up.slice(0, 7), [['ding', 150000], ['ding', 175000], ['tick', 177000], ['tick', 178000], ['tick', 179000],
      ['double', 180000], ['tock', 181000]]);
    assert.equal(up.length, 6 + 30, 'thirty seconds over are planned ahead');
    assert.deepEqual(up[up.length - 1], ['tock', 210000]);
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

  // The title card says 空格开始, so one space starts the first stage (new spec §3; → only enters it).
  DT.test('engine: space on the title card starts the first stage', () => {
    const s = E.toggle(E.createSession(fx(), MATCH, T0), T0);
    assert.equal(s.cursor, 0);
    assert.ok(E.getRun(s).running);
  });

  DT.test('engine: space on the title card gives a free debate first stage to its first side, in one undo step', () => {
    const f = fx();
    f.stages = [f.stages[3]].concat(f.stages.filter((x, i) => i !== 3));
    f.stages[0].first = 'con';
    const s = E.toggle(E.createSession(f, MATCH, T0), T0);
    const r = E.getRun(s);
    assert.equal(r.active, 'con');
    assert.ok(r.running);
    assert.equal(s.history.length, 1);
    assert.equal(E.undo(s, T0 + 1000).cursor, -1);
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
    assert.deepEqual(out.events.map(e => e.key), ['c1', 'end'], 'its countdown before it (c3 and c2 are stale by now)');
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

  DT.test('engine: reset can target any stage and leaves the cursor alone', () => {
    let s = E.toggle(at(0), T0); s = E.next(s, T0 + 50000);       // stage 0 used 50 s, now on stage 1
    s = E.toggle(s, T0 + 50000);                                   // stage 1 running
    s = E.reset(s, T0 + 60000, 0);
    assert.equal(s.cursor, 1);
    assert.equal(E.remaining(E.getRun(s, 's1'), 'main', T0 + 70000), 180000);
    assert.ok(E.getRun(s).running, 'stage 1 untouched');
    s = E.undo(s, T0 + 61000);
    assert.equal(E.remaining(E.getRun(s, 's1'), 'main', T0 + 70000), 130000);
  });

  DT.test('engine: resetting the running current stage by its index stops it', () => {
    let s = E.toggle(at(1), T0);
    s = E.reset(s, T0 + 20000, 1);
    assert.equal(E.getRun(s).running, false);
    assert.equal(rem(s, 'main', T0 + 30000), 120000);
    assert.equal(E.reset(s, T0, 99).history.length, s.history.length, 'no such stage: nothing to undo');
  });

  // Revised 2026-10-18: a surprise attack goes in during the judges' break, as a package (the attack, then the break
  // again), and the timer moves onto it.
  DT.test('engine: a surprise attack goes in during a running break, with the break again after it, and the cursor on it', () => {
    let s = E.toggle(at(2), T0);                                   // the judges' break, running
    s = E.insertExtra(s, '奇袭', 0, 'con', T0 + 12000);
    assert.equal(s.lastFeedback, null);
    assert.equal(s.cursor, 3);
    assert.deepEqual(s.timeline.map(x => [x.id, x.name, x.type, x.side, x.secs, !!x.extra]).slice(2, 6), [
      ['b1', '评委打分', 'break', null, 30, false],
      ['x-1', '反方奇袭质询', 'single', 'con', 150, true],
      ['x-1-b', '评委打分', 'break', null, 30, true],
      ['s3', '自由辩论', 'dual', null, 240, false]]);
    const b = E.getRun(s, 'b1');
    assert.equal(b.running, false, 'the break is stopped');
    assert.equal(E.remaining(b, 'main', T0 + 20000), 18000, 'and charged up to the insert, no further');
    const r = E.getRun(s);
    assert.equal(r.running, false, 'the attack waits for space');
    assert.equal(E.remaining(r, 'main', T0 + 20000), 150000);
    assert.equal(s.extrasUsed['奇袭'].con, 1);
    assert.equal(s.extrasUsed['奇袭'].pro, 0);
    const v = E.view(s, T0 + 12000);
    assert.equal(v.stage.name, '反方奇袭质询');
    assert.equal(v.stage.extra, true);
    assert.equal(v.next.name, '评委打分');
    assert.deepEqual(v.progress.filter(p => p.extra).map(p => [p.index, p.type, p.side, p.state]),
      [[3, 'single', 'con', 'current'], [4, 'break', null, 'todo']]);
    s = E.toggle(s, T0 + 15000);
    assert.ok(E.getRun(s).running, 'space starts it');
  });

  // Revised 2026-10-21: the break after the attack is the group's `after`, no longer a copy of the current break.
  DT.test('engine: the break after a surprise attack is the group\'s own, not a copy of the break it went into', () => {
    const f = fx();
    f.stages[2].bells = { countdown: 5 };
    f.stages[2].note = '评委打分时只看表';
    f.extras[0].after = { name: '评委补分', secs: 45 };
    let s = E.goto(E.createSession(f, MATCH, T0), 2, T0);           // in the break, not started
    s = E.insertExtra(s, '奇袭', 1, 'pro', T0);
    const brk = s.timeline[4];
    assert.deepEqual(brk, { id: 'x-1-b', name: '评委补分', type: 'break', side: null, secs: 45, extra: true },
      'neither the current break\'s bells nor its note');
    assert.deepEqual(E.effectiveBells(s.format, brk), { warn: [], countdown: 3, end: 'chime', overtime: 'none' }, 'BREAK_BELLS');
    assert.equal(s.timeline[3].name, '正方奇袭申论');
    assert.equal(s.timeline[3].secs, 120);
    assert.equal(E.getRun(s, 'b1').running, false);
    assert.equal(Object.keys(s.runs).length, 0, 'a break never started is left without a run');
    f.extras[0].after = { name: '评委打分', secs: 30, bells: { countdown: 5 } };
    const own = E.insertExtra(E.goto(E.createSession(f, MATCH, T0), 2, T0), '奇袭', 0, 'con', T0).timeline[4];
    assert.deepEqual(own.bells, { countdown: 5 }, 'bells of its own when `after` has them');
    assert.equal(E.effectiveBells(f, own).countdown, 5);
  });

  DT.test('engine: a group without a break after it inserts the stage alone', () => {
    [null, undefined].forEach(after => {
      let s = E.toggle(atWith({ after }, 2), T0);
      s = E.insertExtra(s, '奇袭', 0, 'con', T0 + 5000);
      assert.deepEqual(s.timeline.map(x => x.id), ['s1', 's2', 'b1', 'x-1', 's3', 's4'], String(after));
      assert.equal(s.cursor, 3);
      assert.equal(E.getRun(s, 'b1').running, false, 'the break stops, and the rest of it is dropped');
      assert.equal(E.view(s, T0 + 5000).next.name, '自由辩论');
      const u = E.undo(s, T0 + 6000);
      assert.deepEqual(u.timeline.map(x => x.id), ['s1', 's2', 'b1', 's3', 's4']);
      assert.equal(u.cursor, 2);
    });
  });

  DT.test('engine: a surprise attack is refused outside a break', () => {
    const title = E.createSession(fx(), MATCH, T0);
    [title, at(0), E.toggle(at(0), T0), at(3), E.toggle(at(3), T0), at(4)].forEach((s, i) => {
      const r = E.insertExtra(s, '奇袭', 0, 'pro', T0 + 1000);
      assert.deepEqual(r.lastFeedback, { code: 'not-break', message: '奇袭只能在间隔里插入' }, 'case ' + i);
      assert.equal(r.timeline.length, s.timeline.length);
      assert.equal(r.cursor, s.cursor);
      assert.equal(r.history.length, s.history.length, 'nothing to undo');
    });
    const g = fx().extras[0];
    assert.deepEqual(E.insertBlocked(at(2), g), null);
    assert.deepEqual(E.insertBlocked(E.toggle(at(2), T0), g), null, 'a running break takes one');
    assert.equal(E.insertBlocked(title, g).code, 'not-break');
    assert.deepEqual(E.insertBlocked(at(0), Object.assign({}, g, { group: '突袭' })),
      { code: 'not-break', message: '突袭只能在间隔里插入' }, 'the refusal names the group');
    assert.equal(E.insertBlocked(at(0), { group: '奇袭', perSide: 1, variants: [] }).code, 'not-break',
      'a group saved before `where` existed goes in during a break');
  });

  // Revised 2026-10-21: a group with where 'any' goes in after any stage that is not running, as before 2026-10-18,
  // but as a package with the cursor on it, like a 'break' group.
  DT.test('engine: an any-stage group is refused while a clock runs, on the end card and on the title card', () => {
    const cases = [
      [atWith({ where: 'any' }, -1), 'not-started', '比赛还没开始'],
      [E.toggle(atWith({ where: 'any' }, 0), T0), 'running', '先暂停再插入'],
      [E.toggle(atWith({ where: 'any' }, 2), T0), 'running', '先暂停再插入'],
      [E.toggle(atWith({ where: 'any' }, 3), T0), 'running', '先暂停再插入'],
      [atWith({ where: 'any' }, 5), 'ended', '比赛已经结束'],
    ];
    cases.forEach(([s, code, message], i) => {
      const r = E.insertExtra(s, '奇袭', 0, 'pro', T0 + 1000);
      assert.deepEqual(r.lastFeedback, { code, message }, 'case ' + i);
      assert.deepEqual(E.insertBlocked(s, s.format.extras[0]), { code, message }, 'case ' + i);
      assert.equal(r.timeline.length, s.timeline.length);
      assert.equal(r.history.length, s.history.length, 'nothing to undo');
      if (code === 'running') assert.ok(E.getRun(r).running, 'the clock is left alone');
    });
  });

  DT.test('engine: an any-stage group goes in after a paused stage, with its break, and the cursor on it', () => {
    let s = E.toggle(atWith({ where: 'any' }, 0), T0);
    s = E.pause(s, T0 + 100000);                                   // 正方一辩, paused at 1:20 left
    s = E.insertExtra(s, '奇袭', 0, 'con', T0 + 101000);
    assert.equal(s.lastFeedback, null);
    assert.equal(s.cursor, 1);
    assert.deepEqual(s.timeline.slice(0, 4).map(x => [x.id, x.name, x.type, x.side, x.secs, !!x.extra]), [
      ['s1', '正方一辩开篇立论', 'single', 'pro', 180, false],
      ['x-1', '反方奇袭质询', 'single', 'con', 150, true],
      ['x-1-b', '评委打分', 'break', null, 30, true],
      ['s2', '反方四辩质询正方一辩', 'single', 'con', 120, false]]);
    assert.equal(E.getRun(s).running, false, 'not started');
    assert.equal(rem(s, 'main', T0 + 200000, 's1'), 80000, 'the paused speech keeps its time');
    assert.deepEqual(s.extrasUsed['奇袭'], { pro: 0, con: 1 });
    const u = E.undo(s, T0 + 102000);
    assert.equal(u.cursor, 0);
    assert.deepEqual(u.timeline.map(x => x.id), ['s1', 's2', 'b1', 's3', 's4']);
    assert.deepEqual(u.extrasUsed['奇袭'], { pro: 0, con: 0 });
    assert.equal(E.getRun(u).running, false, 'paused, as it was');
    // A dual stage never started, and a paused break, take one too; without `after` the stage goes in alone.
    const d = E.insertExtra(atWith({ where: 'any', after: null }, 3), '奇袭', 1, 'pro', T0);
    assert.deepEqual(d.timeline.map(x => x.id), ['s1', 's2', 'b1', 's3', 'x-1', 's4']);
    assert.equal(E.currentStage(d).name, '正方奇袭申论');
    const b = E.insertExtra(E.pause(E.toggle(atWith({ where: 'any' }, 2), T0), T0 + 4000), '奇袭', 1, 'pro', T0 + 5000);
    assert.deepEqual(b.timeline.slice(2, 5).map(x => x.id), ['b1', 'x-1', 'x-1-b']);
    assert.equal(rem(b, 'main', T0 + 9000, 'b1'), 26000, 'the paused break keeps the rest of its time');
  });

  DT.test('engine: each side has its surprise attacks per group, and a second package gets ids of its own', () => {
    let s = E.insertExtra(at(2), '奇袭', 0, 'con', T0);
    s = E.goto(s, 4, T0 + 200000);                                 // the break after the attack
    assert.equal(E.currentStage(s).id, 'x-1-b');
    const again = E.insertExtra(s, '奇袭', 1, 'con', T0 + 201000);
    assert.equal(again.lastFeedback.code, 'extra-limit');
    assert.equal(again.lastFeedback.message, '反方的奇袭已经用过了');
    assert.equal(again.timeline.length, s.timeline.length);
    const pro = E.insertExtra(s, '奇袭', 1, 'pro', T0 + 201000);
    assert.equal(pro.cursor, 5);
    assert.deepEqual(pro.timeline.slice(3, 7).map(x => x.id), ['x-1', 'x-1-b', 'x-2', 'x-2-b']);
    assert.equal(pro.timeline[5].name, '正方奇袭申论');
    assert.deepEqual(pro.extrasUsed['奇袭'], { pro: 1, con: 1 });
    assert.equal(E.insertExtra(at(2), '奇袭', 9, 'pro', T0).timeline.length, 5, 'no such form: nothing happens');
  });

  DT.test('engine: one undo takes a surprise attack back, and a break that was running runs on', () => {
    let s = E.toggle(at(2), T0);
    s = E.insertExtra(s, '奇袭', 0, 'pro', T0 + 10000);
    const u = E.undo(s, T0 + 13000);
    assert.equal(u.cursor, 2);
    assert.deepEqual(u.timeline.map(x => x.id), ['s1', 's2', 'b1', 's3', 's4']);
    assert.deepEqual(u.extrasUsed['奇袭'], { pro: 0, con: 0 });
    const r = E.getRun(u);
    assert.ok(r.running, 'the break was running, so it runs on');
    assert.equal(E.remaining(r, 'main', T0 + 13000), 17000);
    assert.equal(u.lastRung, null);
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
    const up = E.upcomingBells(s, T0 + 1000).map(b => [b.sound, b.at - T0]);
    assert.deepEqual(up.slice(0, 7), [
      ['ding', 180000], ['tick', 205000], ['tick', 206000], ['tick', 207000], ['tick', 208000], ['tick', 209000], ['double', 210000]]);
    assert.deepEqual(up.slice(7), Array.from({ length: 30 }, (x, i) => ['tock', 211000 + i * 1000]), 'then the seconds over');
    assert.deepEqual(E.upcomingBells(E.toggle(s, T0 + 2000), T0 + 2000), []);
    const b = E.toggle(at(2), T0);
    assert.deepEqual(E.upcomingBells(b, T0).map(x => [x.sound, x.at - T0]), [['tick', 27000], ['tick', 28000], ['tick', 29000], ['chime', 30000]]);
  });

  // ---- every second over (revised 2026-10-18) ----

  DT.test('engine: a single stage over time reports each whole second over at its exact moment', () => {
    let s = E.toggle(at(0), T0);
    const events = [];
    for (let t = 179000; t <= 183100; t += 250) {
      const out = E.tick(s, T0 + t); s = out.session; out.events.forEach(e => events.push(e));
    }
    assert.deepEqual(events.map(e => [e.type, e.clock, e.key, e.at - T0]), [
      ['end', 'main', 'end', 180000], ['over', 'main', 'o1', 181000], ['over', 'main', 'o2', 182000], ['over', 'main', 'o3', 183000]]);
    const r = E.getRun(s);
    assert.equal(r.over.main, 3);
    assert.equal(r.fired.main.filter(k => k[0] === 'o').length, 0, 'the seconds over are counted, not kept in fired');
    assert.ok(r.running, 'and the clock runs on');
    const up = E.upcomingBells(s, T0 + 183100);
    assert.deepEqual([up.length, up[0].sound, up[0].at - T0, up[29].at - T0], [30, 'tock', 184000, 213000], 'a rolling window from here');
  });

  DT.test('engine: seconds over follow the stale rule and stop with the clock', () => {
    let s = E.toggle(at(0), T0);
    let out = E.tick(s, T0 + 185600);                             // first look 5.6 s over: o5 is 0.6 s old, o4 1.6 s
    assert.deepEqual(out.events.map(e => e.key), ['o5']);
    assert.equal(E.getRun(out.session).over.main, 5, 'those before it are passed over');
    out = E.tick(out.session, T0 + 186500);
    assert.deepEqual(out.events.map(e => e.key), ['o6']);
    s = E.toggle(out.session, T0 + 186500);                        // paused
    assert.deepEqual(E.tick(s, T0 + 199000).events, []);
    assert.deepEqual(E.upcomingBells(s, T0 + 199000), []);
    s = E.toggle(s, T0 + 200000);                                  // on again, 6.5 s over
    assert.equal(E.upcomingBells(s, T0 + 200000)[0].at - T0, 200500);
    assert.deepEqual(E.tick(s, T0 + 200600).events.map(e => e.key), ['o7']);
    // A run saved before run.over existed counts from what is in front of it.
    const old = JSON.parse(JSON.stringify(E.toggle(at(0), T0)));
    delete old.runs.s1.over;
    out = E.tick(old, T0 + 185600);
    assert.deepEqual(out.events.map(e => e.key), ['o5']);
    assert.equal(E.getRun(out.session).over.main, 5);
  });

  DT.test('engine: setting the time back above zero clears the seconds over; setting it into overtime spends them', () => {
    let s = E.toggle(at(0), T0);
    s = E.tick(s, T0 + 184500).session;
    assert.equal(E.getRun(s).over.main, 4);
    s = E.adjust(s, 10000, T0 + 184500);                          // 5.5 s left
    assert.equal(E.getRun(s).over.main, 0);
    assert.ok(E.getRun(s).fired.main.indexOf('end') < 0, 'the end bell is armed again');
    let keys = [];
    for (let t = 184500; t <= 192000; t += 250) {
      const out = E.tick(s, T0 + t); s = out.session; keys = keys.concat(out.events.map(e => e.key));
    }
    assert.deepEqual(keys, ['end', 'o1', 'o2'], 'over again from the new zero, at 190 s');
    // Running, 5.5 s left, set 10 s back: 4.5 s over. The end bell rings at once; the four seconds behind stay silent.
    let t = E.tick(E.toggle(at(0), T0), T0 + 174500).session;
    t = E.adjust(t, -10000, T0 + 174500);
    assert.deepEqual(t.lastRung.map(e => [e.key, e.sound]), [['end', 'double']]);
    assert.equal(E.getRun(t).over.main, 4);
    assert.deepEqual(E.tick(t, T0 + 174600).events, [], 'no burst for the seconds set behind it');
    assert.deepEqual(E.upcomingBells(t, T0 + 174600).slice(0, 2).map(b => [b.sound, b.at - T0]), [['tock', 175000], ['tock', 176000]]);
    // Paused and set into overtime: nothing rings, and the count is ready for when it runs on.
    let p = E.toggle(E.toggle(at(0), T0), T0 + 170000);
    p = E.adjust(p, -12500, T0 + 171000);
    assert.equal(p.lastRung, null);
    assert.equal(E.getRun(p).over.main, 2);
  });

  DT.test('engine: undo rings a late end bell, not a late second over', () => {
    let s = E.toggle(at(0), T0);
    s = E.tick(s, T0 + 178000).session;
    s = E.toggle(s, T0 + 178000);                                  // paused by mistake
    const u = E.undo(s, T0 + 183500);                              // it ran on through 0:00 and three seconds over
    assert.deepEqual(u.lastRung.map(e => [e.key, e.sound]), [['end', 'double']]);
    assert.equal(E.getRun(u).over.main, 3);
    assert.equal(E.upcomingBells(u, T0 + 183500)[0].at - T0, 184000);
  });

  DT.test('engine: free debate sides, breaks and stages set to none never ring over', () => {
    const b = E.tick(E.toggle(at(2), T0), T0 + 30500).session;
    assert.deepEqual(E.tick(b, T0 + 40000).events, []);
    assert.ok(!E.upcomingBells(E.toggle(at(2), T0), T0).some(x => x.sound === 'tock'));
    const d = E.toggle(at(3), T0);
    const dout = E.tick(d, T0 + 485000);
    assert.ok(!dout.events.some(e => e.type === 'over'));
    assert.ok(!E.upcomingBells(d, T0).some(x => x.sound === 'tock'));
    const f = fx(); f.bells.overtime = 'none';
    const n = E.toggle(E.goto(E.createSession(f, MATCH, T0), 0, T0), T0);
    assert.ok(!E.tick(n, T0 + 183000).events.some(e => e.type === 'over'));
    assert.ok(!E.upcomingBells(n, T0).some(x => x.sound === 'tock'));
    assert.equal(E.getRun(E.tick(n, T0 + 183000).session).over.main, 0);
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
    const b = E.toggle(at(2), T0);
    const bsnap = JSON.stringify(b);
    E.insertExtra(b, '奇袭', 0, 'pro', T0 + 5000);
    E.tick(E.toggle(at(0), T0), T0 + 190000);
    assert.equal(JSON.stringify(b), bsnap);
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
    assert.deepEqual(E.upcomingBells(s, T0 + 148000).map(b => b.sound).slice(0, 2), ['double', 'tock'], 'the end bell, then the seconds over');
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

  DT.test('engine: nothing is inserted on the end card, nor on the title card', () => {
    const s = E.goto(E.createSession(fx(), MATCH, T0), 99, T0);
    const r = E.insertExtra(s, '奇袭', 0, 'pro', T0);
    assert.equal(r.lastFeedback.code, 'ended');
    assert.equal(r.lastFeedback.message, '比赛已经结束');
    assert.equal(r.timeline.length, s.timeline.length);
    assert.equal(E.view(r, T0).mode, 'end');
    const t = E.insertExtra(E.createSession(fx(), MATCH, T0), '奇袭', 0, 'pro', T0);
    assert.equal(t.cursor, -1);
    assert.equal(t.lastFeedback.code, 'not-break');
    assert.equal(t.timeline[0].name, '正方一辩开篇立论');
  });
})();
