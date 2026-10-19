/* bells.js: synthesized debate bells, scheduled on the audio clock so background throttling cannot delay them. */
(function (DT) {
  'use strict';
  const defaultFactory = () => new (window.AudioContext || window.webkitAudioContext)();
  let factory = defaultFactory;
  let ctx = null, master = null, volume = 0.8, muted = false;
  let pending = [];     // last list passed to schedule(), replayed after unlock
  let live = [];        // {nodes, key, at, start} per scheduled bell; at is on the page clock, start on the audio clock
  let check = [];       // the node groups of a sound check under way (demo); schedule() never touches them
  let noise = null;     // {ctx, buffer}: one burst of white noise, shared by every tick and tock of a context

  const RING_S = 5;     // every voice has died away within this many seconds of its start
  // A bell the engine has already passed counts as ringing while the audio clock is within this long of it. The page
  // reads the audio clock up to a render buffer late, so such a bell (which the engine no longer lists to plan again)
  // can still read as not started; the UI plans again on every bell it passes, every second over, so without this lead
  // such bells would be dropped. A bell still ahead of the page clock gets no lead: a pause or a ↑ pressed just before
  // it must stop it, or it would ring anyway, and once more at its new time.
  const DUE_S = 0.1;
  const NOISE_S = 0.06; // the longest click that uses the noise burst

  const SOUNDS = ['ding', 'double', 'triple', 'long', 'tick', 'tock', 'chime'];
  const PARTIALS = [[1, 1], [2.76, 0.35], [5.4, 0.15]];   // [frequency ratio, gain]
  // The sound check (revised 2026-10-18): what a stage rings, pressed into nine seconds, as [seconds in, sound]:
  // the 30 s and 5 s warnings, 3-2-1, the end bell, then three seconds over.
  const DEMO = Object.freeze([[0, 'ding'], [1.2, 'ding'], [2.2, 'tick'], [3.2, 'tick'], [4.2, 'tick'],
    [5.2, 'double'], [6.2, 'tock'], [7.2, 'tock'], [8.2, 'tock']]);
  const DEMO_LEAD_S = 0.05;   // the first strike waits this long, so a context only just resumed does not clip it

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

  // Made once per context: thirty tocks are planned ahead in overtime, and each would otherwise fill a buffer of its own.
  function noiseBuffer() {
    if (noise && noise.ctx === ctx) return noise.buffer;
    const len = Math.max(1, Math.floor(ctx.sampleRate * NOISE_S));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    noise = { ctx, buffer };
    return buffer;
  }

  // A short click: a sine through a fast envelope, with a breath of band-passed noise for the attack.
  function click(t, f0, band, peak, dur) {
    const g = envelope(t, peak, 0.002, dur);
    const nodes = [osc(f0, t, dur, g)];
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = band;
    bp.Q.value = 1.2;
    src.connect(bp);
    bp.connect(g);
    src.start(t);
    src.stop(t + dur);
    nodes.push(src);
    return nodes;
  }

  function tick(t) { return click(t, 1760, 2400, 0.6, 0.045); }
  // Every second over: lower, softer and a little longer than tick, a metronome rather than an alarm, since it
  // keeps going for as long as the speaker does.
  function tock(t) { return click(t, 880, 1200, 0.35, 0.06); }

  function chime(t) {
    return [[1046.5, t], [1568, t + 0.35]].map(([f, at]) => osc(f, at, 0.7, envelope(at, 0.4, 0.01, 0.7)));
  }

  const VOICES = {
    ding, tick, tock, chime,
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

  function stopNodes(nodes) {
    nodes.forEach(node => {
      try { node.stop(0); } catch (e) { /* already stopped */ }
      try { node.disconnect(); } catch (e) { /* already disconnected */ }
    });
  }

  // Stops every scheduled bell, including one that is ringing now, and a sound check.
  function cancelAll() {
    live.forEach(bell => stopNodes(bell.nodes));
    live = [];
    stopDemo();
  }

  // Stops the bells that have not started yet, except one already due by the page clock (`at` <= now) that the audio
  // clock reaches within DUE_S. A bell that is already ringing plays out, so an action taken right after a double or
  // long bell does not cut it off.
  function cancelPending(now) {
    const t = ctx ? ctx.currentTime : 0;
    const ringing = [];
    live.forEach(bell => {
      if (bell.start > (bell.at <= now ? t + DUE_S : t)) stopNodes(bell.nodes);
      else if (bell.start > t - RING_S) ringing.push(bell);
    });
    live = ringing;
  }

  function schedule(list, now) {
    cancelPending(now);
    pending = list || [];
    if (!ctx) return;
    const seen = {};
    live.forEach(bell => { seen[bell.key] = true; });   // never strike a ringing bell twice
    pending.forEach(item => {
      if (!VOICES[item.sound] || item.at < now - 20) return;
      const key = item.sound + '@' + item.at;
      if (seen[key]) return;
      seen[key] = true;
      const start = ctx.currentTime + Math.max(0, item.at - now) / 1000;
      live.push({ nodes: VOICES[item.sound](start), key, at: item.at, start });
    });
  }

  // The sound check on the title card: DEMO on the audio clock, from now, through the master gain like every bell, so a
  // volume or mute change during it is heard on the sounds still to come. It is kept apart from `live`, so a schedule()
  // (every action calls one) neither cuts it short nor is cut short by it. Called again, it starts over from the top.
  // It runs in a key press or a click, so it unlocks the audio itself. False when there is no audio to play it on.
  function demo() {
    stopDemo();
    if (!ctx) unlock();
    if (!ctx) return false;
    const t0 = ctx.currentTime + DEMO_LEAD_S;
    check = DEMO.map(([at, sound]) => VOICES[sound](t0 + at));
    return true;
  }

  function stopDemo() {
    check.forEach(stopNodes);
    check = [];
  }

  function resetForTests() {
    cancelAll();
    ctx = null; master = null; volume = 0.8; muted = false; pending = []; noise = null;
  }

  DT.bells = {
    unlock, isUnlocked, setVolume, setMuted, play, schedule, cancelAll, demo, stopDemo, SOUNDS, DEMO,
    _setContextFactory(fn) { factory = fn || defaultFactory; },
    _resetForTests: resetForTests,
    _master: () => master,
  };
})(window.DT = window.DT || {});
