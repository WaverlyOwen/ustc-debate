(function () {
  const B = DT.bells;
  function fakeCtx() {
    const started = [];
    function param() { return { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} }; }
    function node(kind) {
      return { kind, frequency: param(), gain: param(), Q: param(), type: '', buffer: null,
        connect() { return this; }, disconnect() { this.disconnected = true; },
        start(t) { this.startAt = t; started.push(this); }, stop(t) { this.stopAt = t; (this.stopCalls = this.stopCalls || []).push(t); } };
    }
    return {
      currentTime: 10, state: 'running', destination: node('dest'), sampleRate: 48000, started,
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
})();
