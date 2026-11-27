const frameMs = 1000 / 24;

// Keep the 24 Hz deadlines on one timeline. A late refresh can render once
// for its current slot without shifting the remaining deadlines.
export function createFrameClock() {
  let origin = 0, previousSlot = -1, lastDraw = null;
  return {
    reset() { lastDraw = null; },
    sample(now, force = false) {
      if (lastDraw === null || force) { origin = now; previousSlot = -1; }
      const slot = Math.floor((now - origin + .001) / frameMs);
      if (slot <= previousSlot) return null;
      const dt = lastDraw === null ? 0 : Math.max(0,(now - lastDraw) / 1000);
      previousSlot = slot;
      lastDraw = now;
      return dt;
    },
  };
}
