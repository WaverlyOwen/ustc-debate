/* ui.js: application assembly: boot, routing, demo scenes and the frame loop. */
(function (DT) {
  'use strict';

  // Demos keep their writes in memory so they never touch the real saved match.
  function memoryStorage() {
    const m = new Map();
    return {
      getItem: k => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => { m.set(k, String(v)); },
      removeItem: k => { m.delete(k); },
    };
  }

  function routeOf(loc) {
    const params = new URLSearchParams(loc.search || '');
    const demo = params.get('demo');
    if (demo && DT.demo.names.indexOf(demo) >= 0) return { name: 'demo', demo, frozen: params.get('frozen') === '1' };
    // '#projector' becomes the projector window in the sync task; until then it opens like any other page.
    return { name: 'timer' };
  }

  function boot(opts) {
    const o = opts || {};
    const root = o.root;
    if (o.clock) DT.clock.set(() => o.clock.now());
    const route = routeOf(o.location || window.location);
    let session;
    if (route.name === 'demo') {
      DT.store.useStorage(memoryStorage());
      const now = DT.clock.now();
      if (route.frozen) DT.clock.set(() => now);
      session = DT.demo.build(route.demo, now).session;
    } else {
      if (o.storage) DT.store.useStorage(o.storage);
      // Until the setup page exists: open a match in the first built-in format, on its title card.
      session = DT.engine.createSession(DT.BUILTIN_FORMATS[0], {}, DT.clock.now());
    }

    root.classList.add('dt-app');
    const stage = DT.render.mount(root);
    let raf = null;

    function viewAt(now) {
      const v = DT.engine.view(session, now);
      if (v.mode === 'end') v.record = DT.engine.record(session, now);
      return v;
    }

    // One frame: apply the automatic rules, play their visual events, repaint.
    function frame() {
      const now = DT.clock.now();
      const out = DT.engine.tick(session, now);
      session = out.session;
      out.events.forEach(e => stage.pulse(e));
      stage.update(viewAt(now));
      raf = requestAnimationFrame(frame);
    }
    frame();

    return {
      session: () => session,
      view: () => viewAt(DT.clock.now()),
      destroy() {
        cancelAnimationFrame(raf);
        stage.destroy();
        root.classList.remove('dt-app');
      },
    };
  }

  function autoboot() {
    if (document.body.hasAttribute('data-dt-autoboot')) boot({ root: document.getElementById('app') });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoboot);
  else autoboot();

  DT.app = { boot };
})(window.DT = window.DT || {});
