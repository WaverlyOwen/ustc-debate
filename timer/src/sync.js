/* sync.js: the projector window (spec §5.11): opening it, pushing the console's state to it, and handing
   its keys back. The console stays the only authority; the projector draws what it is sent. */
(function (DT) {
  'use strict';
  const SOURCE = 'debate-timer';      // every message carries this; anything else on the channel is ignored
  const NAME = 'dt-projector';        // the window's name, so a refreshed console can find it again
  const HASH = '#projector';
  const FEATURES = 'popup,width=1280,height=720';
  const SESSION_KEY = 'dt.session.v1';
  const POLL_MS = 1000;               // how often the console checks whether the projector was closed
  const HEARTBEAT_MS = 1000;          // the last state goes out again this often, for a projector that missed it

  const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const ours = data => isObj(data) && data.source === SOURCE;

  function post(win, message) {
    try {
      win.postMessage(Object.assign({ source: SOURCE }, message), '*');
      return true;
    } catch (e) { return false; }   // the other window is gone or closing
  }

  // The code of a key, or for a presenter or an on-screen keyboard that sends none, the code its key stands for
  // (new spec §3). '' for a key the timer cannot read. Both windows read keys through this.
  function codeOf(e) {
    if (e.code) return e.code;
    const k = String(e.key || '');
    if (k === ' ') return 'Space';
    if (/^[a-z]$/i.test(k)) return 'Key' + k.toUpperCase();
    if (k === '/' || k === '?') return 'Slash';
    return /^(Arrow(Up|Down|Left|Right)|Page(Up|Down)|Escape)$/.test(k) ? k : '';
  }

  function parse(text) {
    try { const v = JSON.parse(text); return isObj(v) ? v : null; } catch (e) { return null; }
  }

  // This page's own file, without query or hash, opened as the projector. Null when the browser blocks it.
  function openProjector(win) {
    const w = win || window;
    try {
      const url = String(w.location.href).split('#')[0].split('?')[0] + HASH;
      return w.open(url, NAME, FEATURES) || null;
    } catch (e) { return null; }
  }

  // After a refresh: the projector window by its name, or null. Asking for a name nobody holds opens a blank
  // window, which is closed straight away.
  function findProjector(win) {
    const w = win || window;
    let found = null;
    try { found = w.open('', NAME); } catch (e) { return null; }
    if (!found) return null;
    let hash = HASH;
    // A loaded file:// page is cross-origin to this one, so reading its location throws; a blank window is not.
    try { hash = found.location.hash; } catch (e) { /* the projector page itself */ }
    if (hash === HASH) return found;
    try { found.close(); } catch (e) { /* already gone */ }
    return null;
  }

  // The console's end. opts: {getWindow() -> the projector window, onKey(code, mods), onClosed(), target
  // (the window whose messages to hear, default window), pollMs, heartbeatMs}. onClosed runs once.
  function createConsoleLink(opts) {
    const o = opts || {};
    const target = o.target || window;
    let last = null, stopped = false;

    function projector() {
      try { const w = o.getWindow(); return w && !w.closed ? w : null; } catch (e) { return null; }
    }

    function push(message) {
      if (stopped || !isObj(message)) return false;
      if (message.type === 'state' || message.type === 'clear') last = message;   // what the heartbeat repeats
      const w = projector();
      return !!w && post(w, message);
    }

    function onMessage(ev) {
      const d = ev && ev.data;
      if (stopped || !ours(d) || d.type !== 'key' || typeof d.code !== 'string') return;
      const w = projector();
      if (ev.source && w && ev.source !== w) return;   // only the projector we opened speaks for the room
      o.onKey(d.code, { shiftKey: !!d.shiftKey, ctrlKey: !!d.ctrlKey, altKey: !!d.altKey, repeat: !!d.repeat });
    }

    const poll = setInterval(() => {
      if (projector()) return;
      stop();
      if (o.onClosed) o.onClosed();
    }, o.pollMs || POLL_MS);
    const beat = setInterval(() => {
      const w = projector();
      if (last && w) post(w, last);
    }, o.heartbeatMs || HEARTBEAT_MS);
    target.addEventListener('message', onMessage);

    function stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(poll);
      clearInterval(beat);
      target.removeEventListener('message', onMessage);
    }

    return { push, stop };
  }

  // The projector's end. opts: {target (this window), opener (the console), storage (read for the saved
  // session at start, or null), sessionKey (where the console saves it; a match file has its own),
  // onState({session, settings, away}), onKey(code, event) for every key pressed here, onEvents(list),
  // onToast(message), onClear() when the console has dropped its match, onLost() for a key pressed after the
  // console has gone}. Keys other than F go to the
  // console; F stays for full screen here. `away` says whether the console has left the timer for the setup
  // page (new spec §2.2): true or false from the console, undefined from storage, which cannot tell.
  function createProjectorEnd(opts) {
    const o = opts || {};
    const target = o.target || window;
    const sessionKey = o.sessionKey || SESSION_KEY;
    let stopped = false;

    function consoleOpen() {
      try { return !!o.opener && !o.opener.closed; } catch (e) { return false; }
    }

    function state(session, settings, away) {
      if (!stopped && isObj(session)) o.onState({ session, settings: isObj(settings) ? settings : null, away });
    }

    function onMessage(ev) {
      const d = ev && ev.data;
      if (stopped || !ours(d)) return;
      if (d.type === 'state') state(d.session, d.settings, !!d.away);
      else if (d.type === 'events' && Array.isArray(d.events) && o.onEvents) o.onEvents(d.events);
      else if (d.type === 'toast' && o.onToast) o.onToast(String(d.message || ''));
      else if (d.type === 'clear' && o.onClear) o.onClear();
    }

    function onKeyDown(e) {
      if (stopped) return;
      const code = codeOf(e);
      if (o.onKey) o.onKey(code, e);
      if (code === 'KeyF' || !code) return;   // F is for this window; a key nobody can read stays with the browser
      // With the console gone nobody hears the key, so the browser keeps it (new spec §3, P4).
      if (!consoleOpen()) {
        if (o.onLost) o.onLost();
        return;
      }
      post(o.opener, { type: 'key', code, shiftKey: !!e.shiftKey, ctrlKey: !!e.ctrlKey,
        altKey: !!e.altKey, repeat: !!e.repeat });
      // Reload, close, the function keys and the like still belong to the browser.
      const browserKey = e.ctrlKey || e.altKey || e.metaKey || /^F\d+$/.test(code);
      if (!browserKey && e.preventDefault) e.preventDefault();
    }

    // Written by the console on every change: this keeps the picture going while the console reloads.
    function onStorage(ev) {
      if (!ev || ev.key !== sessionKey || !ev.newValue) return;
      state(parse(ev.newValue), null);
    }

    target.addEventListener('message', onMessage);
    target.addEventListener('keydown', onKeyDown);
    target.addEventListener('storage', onStorage);
    if (o.storage) {
      let saved = null;
      try { saved = o.storage.getItem(sessionKey); } catch (e) { saved = null; }
      if (saved) state(parse(saved), null);
    }

    return {
      stop() {
        if (stopped) return;
        stopped = true;
        target.removeEventListener('message', onMessage);
        target.removeEventListener('keydown', onKeyDown);
        target.removeEventListener('storage', onStorage);
      },
    };
  }

  DT.sync = { codeOf, openProjector, findProjector, createConsoleLink, createProjectorEnd };
})(window.DT = window.DT || {});
