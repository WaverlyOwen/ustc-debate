const frameMs = 1000 / 60;

// Follow each refresh on a 60 Hz display and every other one at 120 Hz.
// Re-anchor on the delivered refresh so a missed frame never queues catch-up work.
export function createFrameClock() {
  let lastDraw = null;
  return {
    reset() { lastDraw = null; },
    sample(now, force = false) {
      const dt = lastDraw === null ? 0 : Math.max(0,(now - lastDraw) / 1000);
      // Chromium timestamps can round a 16.667 ms interval down to 16.6 ms.
      if (!force && lastDraw !== null && now - lastDraw < frameMs - .5) return null;
      lastDraw = now;
      return dt;
    },
  };
}
