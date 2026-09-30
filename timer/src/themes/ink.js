/* themes/ink.js: 墨's SVG filters (spec §2.1): the brush stroke's bled edge and dry tip, the worn seal, the drop. */
(function (DT) {
  'use strict';
  // The filters work in screen pixels, so there is one brush per stage size and ink.css picks it by the stage's
  // width: a thumbnail's stroke is the projector's stroke made small, not shredded by full-size displacement.
  // k scales every length (and divides every frequency); 1 is drawn for a 1920-pixel-wide stage.
  const SIZES = { xl: 1, l: 0.72, m: 0.45, s: 0.14 };

  const n = x => String(Math.round(x * 10000) / 10000);
  const freq = (fx, fy, k) => n(fx / k) + ' ' + n(fy / k);

  // The stroke's own geometry (ink.css) is a flat band with a few loose hairs at its edges; this makes it a brush:
  // 1. every row of hairs ends at its own place, so the tip frays into 飞白 (dry brush);
  // 2. the edges swell and thin with the brush's pressure, then bleed a little into the paper's fibres (晕染);
  // 3. ink pools in streaks along the stroke and the brush's hairs leave paler lines, so the colour has the depth
  //    of 墨 rather than a flat print.
  function brush(name, k) {
    return '<filter id="dt-ink-brush-' + name + '" x="-4%" y="-12%" width="108%" height="124%" color-interpolation-filters="sRGB">' +
      '<feTurbulence type="fractalNoise" baseFrequency="' + freq(0.0012, 0.075, k) + '" numOctaves="2" seed="4" result="hairs"/>' +
      '<feColorMatrix in="hairs" type="matrix" values="1 0 0 0 0  0 0 0 0 .5  0 0 0 0 0  0 0 0 0 1" result="rows"/>' +
      '<feDisplacementMap in="SourceGraphic" in2="rows" scale="' + n(110 * k) + '" xChannelSelector="R" yChannelSelector="G" result="dry"/>' +
      '<feTurbulence type="fractalNoise" baseFrequency="' + freq(0.005, 0.018, k) + '" numOctaves="3" seed="9" result="press"/>' +
      '<feDisplacementMap in="dry" in2="press" scale="' + n(64 * k) + '" xChannelSelector="G" yChannelSelector="R" result="swell"/>' +
      '<feTurbulence type="fractalNoise" baseFrequency="' + freq(0.3, 0.3, k) + '" numOctaves="1" seed="2" result="fibre"/>' +
      '<feDisplacementMap in="swell" in2="fibre" scale="' + n(4 * k) + '" xChannelSelector="R" yChannelSelector="G" result="frayed"/>' +
      '<feGaussianBlur in="frayed" stdDeviation="' + n(0.8 * k) + '" result="bled"/>' +
      '<feTurbulence type="fractalNoise" baseFrequency="' + freq(0.0015, 0.05, k) + '" numOctaves="3" seed="15" result="tone"/>' +
      '<feColorMatrix in="tone" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.1 0 0 0 -.5" result="pool"/>' +
      '<feComposite in="pool" in2="bled" operator="in" result="pooled"/>' +
      '<feTurbulence type="fractalNoise" baseFrequency="' + freq(0.0008, 0.11, k) + '" numOctaves="3" seed="23" result="grain"/>' +
      '<feColorMatrix in="grain" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  1 0 0 0 -.64" result="hair"/>' +
      '<feComposite in="hair" in2="bled" operator="in" result="haired"/>' +
      '<feMerge><feMergeNode in="bled"/><feMergeNode in="pooled"/><feMergeNode in="haired"/></feMerge>' +
      '</filter>';
  }

  // A seal pressed onto paper: its edges a little rough, its ink missing in a few worn spots. The light one is for a
  // smaller stage, where the small seal's strokes are only a pixel or two wide and the full wear would eat them.
  const seal = (id, rough, wear) => '<filter id="' + id + '" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">' +
    '<feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" seed="5" result="grain"/>' +
    '<feDisplacementMap in="SourceGraphic" in2="grain" scale="' + rough + '" xChannelSelector="R" yChannelSelector="G" result="rough"/>' +
    '<feTurbulence type="fractalNoise" baseFrequency=".09" numOctaves="3" seed="8" result="wear"/>' +
    '<feColorMatrix in="wear" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  9 0 0 0 ' + wear + '" result="kept"/>' +
    '<feComposite in="rough" in2="kept" operator="in"/>' +
    '</filter>';
  const SEAL = seal('dt-ink-seal', 2.4, -2.6) + seal('dt-ink-seal-light', 1.1, -1.6);

  // A drop of ink soaking into the paper: a fibrous rim. It also roughens the title card's dabs and the break's circle.
  const DROP = '<filter id="dt-ink-drop" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB">' +
    '<feTurbulence type="fractalNoise" baseFrequency=".3" numOctaves="2" seed="3" result="fibre"/>' +
    '<feDisplacementMap in="SourceGraphic" in2="fibre" scale="4.5" xChannelSelector="R" yChannelSelector="G"/>' +
    '</filter>';

  DT.themes.register('ink', {
    defs: '<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>' +
      Object.keys(SIZES).map(name => brush(name, SIZES[name])).join('') + SEAL + DROP + '</defs></svg>',
  });
})(window.DT = window.DT || {});
