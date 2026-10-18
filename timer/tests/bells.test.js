(function () {
  const B = DT.bells;
  function fakeCtx() {
    const started = [], made = [];
    function param() {
      return { value: 0, setValueAtTime() {}, linearRampToValueAtTime(v) { this.peak = v; }, exponentialRampToValueAtTime() {},
        setTargetAtTime() {}, cancelScheduledValues() {} };
    }
    function node(kind) {
      const n = { kind, frequency: param(), gain: param(), Q: param(), type: '', buffer: null, outs: [],
        connect(to) { this.outs.push(to); return this; }, disconnect() { this.disconnected = true; },
        start(t) { this.startAt = t; started.push(this); }, stop(t) { this.stopAt = t; (this.stopCalls = this.stopCalls || []).push(t); } };
      made.push(n);
      return n;
    }
    return {
      currentTime: 10, state: 'running', destination: node('dest'), sampleRate: 48000, started, made,
      resume() { this.state = 'running'; return Promise.resolve(); },
      createOscillator: () => node('osc'), createGain: () => node('gain'), createBiquadFilter: () => node('filter'),
      createBufferSource: () => node('buf'),
      createBuffer: (ch, len) => ({ getChannelData: () => new Float32Array(len) }),
    };
  }
  let ctx;
  function fresh() { ctx = fakeCtx(); B._setContextFactory(() => ctx); B._resetForTests(); }

  DT.test('bells: schedule places sounds on the audio clock, not on timers', () => {
    fresh(); DT.clock.set(() => 5000); B.unlock();
    B.schedule([{ at: 7500, sound: 'ding', clock: 'main' }], 5000);
    const starts = ctx.started.map(n => n.startAt);
    assert.ok(starts.length >= 3);
    starts.forEach(t => assert.near(t, 12.5, 0.01));
    DT.clock.reset();
  });

  DT.test('bells: schedule dedupes, skips the past and replaces the previous plan', () => {
    fresh(); DT.clock.set(() => 0); B.unlock();
    B.schedule([{ at: 1000, sound: 'ding' }], 0);
    const oneDing = ctx.started.length;
    assert.ok(oneDing >= 3);
    B.cancelAll(); ctx.started.length = 0;
    B.schedule([{ at: 1000, sound: 'ding' }, { at: 1000, sound: 'ding' }, { at: -5000, sound: 'ding' }], 0);
    const first = ctx.started.length;
    assert.equal(first, oneDing, 'duplicate and past dings are dropped');
    ctx.started.forEach(n => assert.near(n.startAt, 11, 0.01));
    const firstBatch = ctx.started.slice();
    assert.ok(!ctx.started.some(n => Math.abs(n.startAt - 12) < 0.01), 'no tick planned yet');
    B.schedule([{ at: 2000, sound: 'tick' }], 0);
    firstBatch.forEach(n => {
      assert.ok(n.stopCalls.includes(0), 'old node stopped at 0');
      assert.equal(n.disconnected, true, 'old node disconnected');
    });
    const fresh2 = ctx.started.slice(first);
    assert.ok(fresh2.length > 0);
    fresh2.forEach(n => assert.near(n.startAt, 12, 0.01));
    DT.clock.reset();
  });

  DT.test('bells: rescheduling lets a ringing bell play out but drops bells not yet started', () => {
    fresh(); DT.clock.set(() => 0); B.unlock();
    B.schedule([{ at: 1000, sound: 'double' }, { at: 5000, sound: 'long' }], 0);
    const ringing = ctx.started.filter(n => n.startAt < 12);
    const later = ctx.started.filter(n => n.startAt > 14);
    assert.ok(ringing.length > 0 && later.length > 0);
    ctx.currentTime = 11.2;   // between the two strikes of the double bell
    B.schedule([{ at: 1000, sound: 'double' }, { at: 1200, sound: 'double' }, { at: 4000, sound: 'ding' }], 1200);
    ringing.forEach(n => {
      assert.ok(!(n.stopCalls || []).includes(0), 'the ringing double is not stopped');
      assert.ok(!n.disconnected, 'the ringing double stays connected');
    });
    later.forEach(n => assert.ok(n.stopCalls.includes(0) && n.disconnected, 'the future long bell is dropped'));
    const added = ctx.started.slice(ringing.length + later.length);
    assert.ok(added.length > 0);
    added.forEach(n => assert.ok(n.startAt >= 11.2 - 0.01, 'nothing is struck in the past'));
    const restruck = added.filter(n => Math.abs(n.startAt - 11) < 0.01);
    assert.equal(restruck.length, 0, 'the ringing bell is not struck again');
    DT.clock.reset();
  });

  DT.test('bells: a ringing bell is not struck twice when the same plan is scheduled again', () => {
    fresh(); DT.clock.set(() => 0); B.unlock();
    B.schedule([{ at: 0, sound: 'ding' }], 0);
    const n = ctx.started.length;
    ctx.currentTime = 10.1;
    B.schedule([{ at: 0, sound: 'ding' }], 10);
    assert.equal(ctx.started.length, n);
    DT.clock.reset();
  });

  DT.test('bells: cancelAll stops a ringing bell too', () => {
    fresh(); DT.clock.set(() => 0); B.unlock();
    B.schedule([{ at: 0, sound: 'long' }], 0);
    const nodes = ctx.started.slice();
    ctx.currentTime = 11;
    B.cancelAll();
    nodes.forEach(n => assert.ok(n.stopCalls.includes(0) && n.disconnected));
    DT.clock.reset();
  });

  DT.test('bells: double and triple strike two and three times', () => {
    fresh(); DT.clock.set(() => 0); B.unlock();
    B.schedule([{ at: 0, sound: 'ding' }], 0); const one = ctx.started.length; B.cancelAll();
    ctx.started.length = 0; B.schedule([{ at: 0, sound: 'double' }], 0); assert.equal(ctx.started.length, one * 2);
    ctx.started.length = 0; B.schedule([{ at: 0, sound: 'triple' }], 0); assert.equal(ctx.started.length, one * 3);
    DT.clock.reset();
  });

  DT.test('bells: nothing plays before unlock, then the future part is scheduled', () => {
    fresh(); DT.clock.set(() => 0);
    B.schedule([{ at: 1000, sound: 'ding' }, { at: 9000, sound: 'double' }], 0);
    assert.equal(ctx.started.length, 0);
    assert.equal(B.isUnlocked(), false);
    DT.clock.set(() => 5000); B.unlock();
    assert.ok(B.isUnlocked());
    assert.ok(ctx.started.length > 0);
    ctx.started.forEach(n => assert.ok(n.startAt >= 10 + 3.9, 'only the 9000 ms bell'));
    DT.clock.reset();
  });

  DT.test('bells: mute and volume drive the master gain', () => {
    fresh(); DT.clock.set(() => 0); B.unlock();
    B.setVolume(0.5); assert.near(B._master().gain.value, 0.5, 1e-9);
    B.setMuted(true); assert.equal(B._master().gain.value, 0);
    B.setMuted(false); assert.near(B._master().gain.value, 0.5, 1e-9);
    DT.clock.reset();
  });

  DT.test('bells: every named sound can be played', () => {
    fresh(); DT.clock.set(() => 0); B.unlock();
    B.SOUNDS.forEach(name => { const n = ctx.started.length; B.play(name); assert.ok(ctx.started.length > n, name); });
    DT.clock.reset();
  });

  // Every second over (revised 2026-10-18): lower and softer than the countdown's tick.
  DT.test('bells: tock is a sound of its own, lower and softer than tick, and can be scheduled', () => {
    fresh(); DT.clock.set(() => 0); B.unlock();
    assert.ok(B.SOUNDS.indexOf('tock') >= 0);
    const voice = sound => {
      const from = ctx.made.length;
      B.schedule([{ at: 1000, sound }], 0);
      const nodes = ctx.made.slice(from);
      return {
        starts: nodes.filter(n => n.startAt !== undefined).map(n => n.startAt),
        osc: nodes.find(n => n.kind === 'osc').frequency.value,
        band: nodes.find(n => n.kind === 'filter').frequency.value,
        peak: Math.max.apply(null, nodes.filter(n => n.kind === 'gain').map(n => n.gain.peak || 0)),
      };
    };
    const tock = voice('tock'), tick = voice('tick');
    assert.ok(tock.starts.length >= 2);
    tock.starts.forEach(t => assert.near(t, 11, 0.01));
    assert.deepEqual([tock.osc, tock.band, tock.peak], [880, 1200, 0.35]);
    assert.deepEqual([tick.osc, tick.band, tick.peak], [1760, 2400, 0.6]);
    DT.clock.reset();
  });

  // The UI plans again on every bell the engine passes (every second over), and the page reads the audio clock a
  // little late: the tock just passed must not read as "not started" and be dropped.
  DT.test('bells: a bell due within a tenth of a second is left to ring when the plan changes', () => {
    fresh(); DT.clock.set(() => 0); B.unlock();
    B.schedule([{ at: 1000, sound: 'tock' }, { at: 2000, sound: 'tock' }], 0);
    const due = ctx.started.filter(n => Math.abs(n.startAt - 11) < 0.01);
    const next = ctx.started.filter(n => Math.abs(n.startAt - 12) < 0.01);
    assert.ok(due.length > 0 && next.length > 0);
    ctx.currentTime = 10.95;                              // the engine is 10 ms past the first tock already
    B.schedule([{ at: 2000, sound: 'tock' }], 1010);
    due.forEach(n => assert.ok(!(n.stopCalls || []).includes(0) && !n.disconnected, 'the tock just due still sounds'));
    next.forEach(n => assert.ok(n.stopCalls.includes(0), 'the later one is planned again'));
    const again = ctx.started.slice(due.length + next.length);
    assert.equal(again.length, next.length);
    again.forEach(n => assert.near(n.startAt, 11.94, 0.001));
    DT.clock.reset();
  });

  // The lead is only for a bell the engine has passed. One still ahead of the page clock is the timekeeper's to stop:
  // a pause 50 ms before the end bell must silence it (else it rings with the clock stopped at 0:01, and again on
  // resuming), and a ↑ just before it must move it, not ring it now and once more a second later.
  DT.test('bells: a bell not yet due by the page clock stops when the plan changes, however close it is', () => {
    fresh(); DT.clock.set(() => 0); B.unlock();
    B.schedule([{ at: 1000, sound: 'double' }], 0);
    const end = ctx.started.slice();
    ctx.currentTime = 10.95;                              // 50 ms before it, and the timekeeper pauses
    B.schedule([], 950);
    end.forEach(n => assert.ok(n.stopCalls.includes(0) && n.disconnected, 'the end bell does not ring on a stopped clock'));
    B.schedule([{ at: 1000, sound: 'double' }], 0);       // running again from the start: 1 s to go
    const again = ctx.started.slice(end.length);
    ctx.currentTime = 10.95;
    B.schedule([{ at: 2000, sound: 'double' }], 950);     // ↑ 50 ms before it: the end bell moves a second on
    again.forEach(n => assert.ok(n.stopCalls.includes(0) && n.disconnected, 'not struck at the old time'));
    const moved = ctx.started.slice(end.length + again.length);
    assert.equal(moved.length, end.length, 'struck once, at the new time');
    moved.forEach(n => assert.ok(n.startAt > 11.9, 'at the new time'));
    DT.clock.reset();
  });

  const reaches = (node, target) => node === target || node.outs.some(n => reaches(n, target));

  DT.test('bells: the sound check plays its nine sounds on the audio clock, through the master gain', () => {
    fresh(); DT.clock.set(() => 0);
    assert.equal(B.isUnlocked(), false);
    assert.equal(B.demo(), true);
    assert.ok(B.isUnlocked(), 'it runs in a key press or a click, so it unlocks the audio');
    assert.deepEqual(B.DEMO.map(d => d[1]), ['ding', 'ding', 'tick', 'tick', 'tick', 'double', 'tock', 'tock', 'tock']);
    assert.deepEqual(B.DEMO.map(d => d[0]), [0, 1.2, 2.2, 3.2, 4.2, 5.2, 6.2, 7.2, 8.2]);
    const starts = Array.from(new Set(ctx.started.map(n => Math.round((n.startAt - 10.05) * 1000) / 1000))).sort((a, b) => a - b);
    assert.deepEqual(starts, [0, 1.2, 2.2, 3.2, 4.2, 5.2, 5.52, 6.2, 7.2, 8.2], 'nine strikes and the second of the double');
    ctx.started.forEach(n => assert.ok(reaches(n, B._master()), 'a volume change is heard on the sounds still to come'));
    DT.clock.reset();
  });

  DT.test('bells: the sound check can be stopped, starts over when asked again, and is left alone by schedule', () => {
    fresh(); DT.clock.set(() => 0); B.unlock();
    B.demo();
    const first = ctx.started.slice();
    B.schedule([], 0);
    B.schedule([{ at: 500, sound: 'tick' }], 0);
    first.forEach(n => assert.ok(!(n.stopCalls || []).includes(0) && !n.disconnected, 'schedule does not cut it short'));
    const planned = ctx.started.slice(first.length);
    ctx.currentTime = 13;
    B.demo();
    first.forEach(n => assert.ok(n.stopCalls.includes(0) && n.disconnected, 'asked again, the first one stops'));
    const second = ctx.started.slice(first.length + planned.length);
    assert.equal(second.length, first.length);
    assert.near(Math.min.apply(null, second.map(n => n.startAt)), 13.05, 0.001, 'and it starts over from now');
    planned.forEach(n => assert.ok(!(n.stopCalls || []).includes(0), 'and leaves the planned bells alone'));
    B.stopDemo();
    second.forEach(n => assert.ok(n.stopCalls.includes(0) && n.disconnected));
    B.demo();
    const third = ctx.started.slice(first.length + planned.length + second.length);
    B.cancelAll();
    third.forEach(n => assert.ok(n.stopCalls.includes(0) && n.disconnected, 'cancelAll stops it too'));
    DT.clock.reset();
  });

  DT.test('bells: the sound check says so when there is no audio to play it on', () => {
    B._setContextFactory(() => { throw new Error('no audio'); }); B._resetForTests();
    assert.equal(B.demo(), false);
    assert.equal(B.isUnlocked(), false);
    B._setContextFactory(null); B._resetForTests();
  });
})();
