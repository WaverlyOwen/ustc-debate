/* bells.js: synthesized debate bells, scheduled on the audio clock so background throttling cannot delay them. */
(function (DT) {
  'use strict';
  const defaultFactory = () => new (window.AudioContext || window.webkitAudioContext)();
  let factory = defaultFactory;
  let ctx = null, master = null, volume = 0.8, muted = false;
  let pending = [];     // last list passed to schedule(), replayed after unlock
  let live = [];        // {node, key} currently scheduled, stopped by cancelAll()

  const SOUNDS = ['ding', 'double', 'triple', 'long', 'tick', 'chime'];
  const PARTIALS = [[1, 1], [2.76, 0.35], [5.4, 0.15]];   // [frequency ratio, gain]

  function masterGain() { return muted ? 0 : volume; }

  // One gain envelope shared by several sources: 3 ms attack, exponential decay.
  function envelope(t, peak, attack, decay) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    g.connect(master);
    return g;
  }

  function osc(freq, t, dur, out) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    o.connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  // A struck bell: three sine partials through one envelope.
  function strike(t, f0, decay) {
    const g = envelope(t, 0.5, 0.003, decay);
    return PARTIALS.map(([ratio, gain]) => {
      const pg = ctx.createGain();
      pg.gain.value = gain;
      pg.connect(g);
      return osc(f0 * ratio, t, decay, pg);
    });
  }

  function ding(t) { return strike(t, 1318, 1.4); }
  function repeated(t, n, gap) {
    let nodes = [];
    for (let i = 0; i < n; i++) nodes = nodes.concat(ding(t + i * gap));
    return nodes;
  }

  function tick(t) {
    const dur = 0.045;
    const g = envelope(t, 0.6, 0.002, dur);
    const nodes = [osc(1760, t, dur, g)];
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2400;
    bp.Q.value = 1.2;
    src.connect(bp);
    bp.connect(g);
    src.start(t);
    src.stop(t + dur);
    nodes.push(src);
    return nodes;
  }

  function chime(t) {
    return [[1046.5, t], [1568, t + 0.35]].map(([f, at]) => osc(f, at, 0.7, envelope(at, 0.4, 0.01, 0.7)));
  }

  const VOICES = {
    ding, tick, chime,
    double: t => repeated(t, 2, 0.32),
    triple: t => repeated(t, 3, 0.28),
    long: t => strike(t, 1046, 3),
  };

  function unlock() {
    if (!ctx) {
      try {
        ctx = factory();
        master = ctx.createGain();
        master.gain.value = masterGain();
        master.connect(ctx.destination);
      } catch (e) { ctx = null; master = null; return; }
    }
    try { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* stays suspended */ }
    schedule(pending, DT.clock.now());
  }

  function isUnlocked() { return !!ctx; }

  function setVolume(v) {
    volume = Math.min(1, Math.max(0, Number(v) || 0));
    if (master) master.gain.value = masterGain();
  }

  function setMuted(b) {
    muted = !!b;
    if (master) master.gain.value = masterGain();
  }

  // Plays immediately; manual bells are short and are not cancelled by schedule().
  function play(sound) {
    if (!ctx || !VOICES[sound]) return;
    VOICES[sound](ctx.currentTime);
  }

  function cancelAll() {
    live.forEach(({ node }) => {
      try { node.stop(0); } catch (e) { /* already stopped */ }
      try { node.disconnect(); } catch (e) { /* already disconnected */ }
    });
    live = [];
  }

  function schedule(list, now) {
    cancelAll();
    pending = list || [];
    if (!ctx) return;
    const seen = {};
    pending.forEach(item => {
      if (!VOICES[item.sound] || item.at < now - 20) return;
      const key = item.sound + '@' + item.at;
      if (seen[key]) return;
      seen[key] = true;
      VOICES[item.sound](ctx.currentTime + Math.max(0, item.at - now) / 1000).forEach(node => live.push({ node, key }));
    });
  }

  function resetForTests() {
    cancelAll();
    ctx = null; master = null; volume = 0.8; muted = false; pending = [];
  }

  DT.bells = {
    unlock, isUnlocked, setVolume, setMuted, play, schedule, cancelAll, SOUNDS,
    _setContextFactory(fn) { factory = fn || defaultFactory; },
    _resetForTests: resetForTests,
    _master: () => master,
  };
})(window.DT = window.DT || {});
