/* themes/chalk.js: 黑板's SVG filters (spec §2.3): chalk lines that shake and break, and a chalk grain on the edges of
   the digits and the writing. */
(function (DT) {
  'use strict';
  // The filters work in screen pixels, so there is one set per stage size and chalk.css picks it by the stage's
  // width: a thumbnail's hatching is the projector's hatching made small, not shaken apart.
  // k scales every length (and divides every frequency); 1 is drawn for a 1920-pixel-wide stage.
  const SIZES = { xl: 1, l: 0.72, m: 0.45, s: 0.14 };

  const n = x => String(Math.round(x * 10000) / 10000);
  const freq = (f, k) => n(f / k);
  // An alpha channel made from the noise's red channel: alpha = a * R + b, clamped.
  const alpha = (a, b) => '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ' + a + ' 0 0 0 ' + b;

  // A line drawn in chalk: the hand is never quite straight (a slow bend and a fine shake), the stick skips where the
  // board is worn (breaks along the line) and the chalk only catches on the board's tooth (a grain all over).
  function stroke(name, k) {
    return '<filter id="dt-chalk-stroke-' + name + '" x="-3%" y="-3%" width="106%" height="106%" color-interpolation-filters="sRGB">' +
      '<feTurbulence type="fractalNoise" baseFrequency="' + freq(0.005, k) + '" numOctaves="2" seed="7" result="bend"/>' +
      '<feDisplacementMap in="SourceGraphic" in2="bend" scale="' + n(10 * k) + '" xChannelSelector="R" yChannelSelector="G" result="bent"/>' +
      '<feTurbulence type="fractalNoise" baseFrequency="' + freq(0.06, k) + '" numOctaves="2" seed="4" result="shake"/>' +
      '<feDisplacementMap in="bent" in2="shake" scale="' + n(2.6 * k) + '" xChannelSelector="R" yChannelSelector="G" result="shaken"/>' +
      '<feTurbulence type="fractalNoise" baseFrequency="' + freq(0.024, k) + '" numOctaves="2" seed="11" result="skip"/>' +
      '<feColorMatrix in="skip" type="matrix" values="' + alpha(-12, 8.6) + '" result="kept"/>' +
      '<feComposite in="shaken" in2="kept" operator="in" result="broken"/>' +
      '<feTurbulence type="fractalNoise" baseFrequency="' + freq(0.9, k) + '" numOctaves="1" seed="2" result="tooth"/>' +
      '<feColorMatrix in="tooth" type="matrix" values="' + alpha(5, -1.6) + '" result="grain"/>' +
      '<feComposite in="broken" in2="grain" operator="in"/>' +
      '</filter>';
  }

  // The digits in chalk (spec §2.3): the body stays solid, only a band along the edges is rough and grainy, with a
  // faint dust around it.
  function grain(name, k) {
    return '<filter id="dt-chalk-grain-' + name + '" x="-4%" y="-6%" width="108%" height="112%" color-interpolation-filters="sRGB">' +
      '<feTurbulence type="fractalNoise" baseFrequency="' + freq(0.5, k) + '" numOctaves="2" seed="5" result="tooth"/>' +
      '<feDisplacementMap in="SourceGraphic" in2="tooth" scale="' + n(5 * k) + '" xChannelSelector="R" yChannelSelector="G" result="rough"/>' +
      '<feColorMatrix in="tooth" type="matrix" values="' + alpha(6, -2.2) + '" result="specks"/>' +
      '<feComposite in="rough" in2="specks" operator="in" result="grainy"/>' +
      '<feMorphology in="SourceGraphic" operator="erode" radius="' + n(3 * k) + '" result="core"/>' +
      '<feGaussianBlur in="rough" stdDeviation="' + n(3 * k) + '" result="blur"/>' +
      '<feColorMatrix in="blur" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 .22 0" result="dust"/>' +
      '<feMerge><feMergeNode in="dust"/><feMergeNode in="grainy"/><feMergeNode in="core"/></feMerge>' +
      '</filter>';
  }

  // Writing on the board: the same grain, lighter, so the thin strokes of 楷体 stay whole.
  function write(name, k) {
    return '<filter id="dt-chalk-write-' + name + '" x="-2%" y="-10%" width="104%" height="120%" color-interpolation-filters="sRGB">' +
      '<feTurbulence type="fractalNoise" baseFrequency="' + freq(0.7, k) + '" numOctaves="1" seed="9" result="tooth"/>' +
      '<feDisplacementMap in="SourceGraphic" in2="tooth" scale="' + n(1.6 * k) + '" xChannelSelector="R" yChannelSelector="G" result="rough"/>' +
      '<feColorMatrix in="tooth" type="matrix" values="' + alpha(4, -0.9) + '" result="specks"/>' +
      '<feComposite in="rough" in2="specks" operator="in"/>' +
      '</filter>';
  }

  // ---- Motion (spec §2.3): decorate adds chalk dust particles and count dots ----

  let stageCount = 0;

  function decorate(stage, flags) {
    const doc = stage.ownerDocument, win = doc.defaultView || window, n = ++stageCount, added = [];
    const still = !!(flags && (flags.thumbnail || flags.reducedMotion || flags.frozen));

    const put = (parent, html) => {
      if (!parent) return;
      const box = doc.createElement('div');
      box.innerHTML = html;
      added.push(parent.appendChild(box.firstChild));
    };

    const q = sel => stage.querySelector(sel);

    // Chalk dust particles container for enter, warn moments
    const dustContainer = '<div class="dt-chalk-dust" id="dt-chalk-dust-' + n + '" aria-hidden="true"></div>';
    put(q('.dt-deco'), dustContainer);

    // Count dot that appears below digits
    const countDot = '<span class="dt-chalk-count-dot" id="dt-chalk-count-' + n + '" aria-hidden="true"></span>';
    put(q('.dt-deco-over'), countDot);

    return {
      moment(name, detail) {
        // Moment animations are primarily CSS-driven via .is-m-<name> classes
        // JS can add special handling if needed (e.g., spawning dust particles)
        if (still) return;

        // For warn moment, could add dust particle animation trigger here
        // For count moment, could pulse the count dot
        // For now, CSS handles everything via the moment classes
      },
      destroy() {
        added.forEach(el => el.remove());
      },
    };
  }

  DT.themes.register('chalk', {
    defs: '<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>' +
      Object.keys(SIZES).map(name => stroke(name, SIZES[name]) + grain(name, SIZES[name]) + write(name, SIZES[name])).join('') +
      '</defs></svg>',
    decorate,
  });
})(window.DT = window.DT || {});
