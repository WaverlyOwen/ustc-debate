/* themes/ink.js: 墨 (spec 2026-11-27-ink-water-design): ink dropped into a tank of still water, seen from the side, drawn
   by one WebGL fragment shader as a function of the view; and the filters the seals and the title card's dabs use. */
(function (DT) {
  'use strict';

  // ---- where things are, in stage heights from the top (the surface itself comes from ink.css, --ink-surface) ----
  const GAP = 0.04;            // a stage's front with none of its time used: just under the surface
  const BED = 0.955;           // the front with all of it used: the ink lies on the bed of the tank
  const RES = 0.5;             // the drawing buffer's share of the stage's device pixels: ink is soft, CSS scales it
  const MIN_ROWS = 400;        // a small stage (the console's preview) draws at least this many rows, or its own
  const MAX_ROWS = 900;
  const ENTER_MS = 560;        // a new stage's drops fall to its front (wall time, the one thing that is)
  // Drop positions are fractions of the tank width and entry times are fractions of each speaker's clock.
  const DROPS = [[0.28, 0], [0.78, 0.14], [0.09, 0.34], [0.90, 0.55], [0.48, 0.77]];
  const FLUID_SECONDS = 23;
  const SUMI_HZ = 60;          // native integration rate of Sumi's fluidPainter
  const LAST_FRAME = FLUID_SECONDS * SUMI_HZ - 1;
  const DUEL_LAST_FRAME = 2 * FLUID_SECONDS * SUMI_HZ - 1;
  const DUEL_X = [0.445, 0.36, 0.475, 0.29, 0.42];  // mirrored entry points for the two pigments
  const NOT_DROPPED = 2;  // later than the end of the shared timeline at 1
  const MASK_W = 384, MASK_H = 240;
  const BELL_S = 1.1;          // a bell's drop falls to the front in this much time used...
  const MELT_S = 0.6;          // ...and melts into it in this much more
  const PAD = 0.012;           // a box the ink is thinned in reaches this far past its text...
  const FEATHER = 0.035;       // ...and fades out over this much more
  const STILL_T = 47;          // under reduced motion the water's turbulence stands at this many seconds
  const NP = 16, NB = 6, NR = 4;   // the shader's plume, box and ripple slots
  const SETTLE_MS = 800;       // the layout is read on every frame for this long after anything that moves it changes
  const RING_GAP_S = 0.32;     // an end bell's second drop (render.js RING_GAP_MS)
  const DIM = 0.5;             // the waiting side's ink at half strength
  const LOCK_FADE = 0.3;       // locked clocks retain their ink at reduced strength

  // ---- the shader ----
  // Every length is in stage heights: p.x runs 0..aspect, p.y 0 (top) .. 1 (bottom). Live debate stages sample one
  // Sumi tank across the stage. The decorative scenes can use separate columns. Their ink's
  // density D at a pixel is the sum of its column's plumes (a vortex-ring head and its stem each) and a veil of old,
  // diffused ink between the surface and the front, all looked up through a few steps of curl noise (older ink,
  // higher up, has been stirred further), then textured with filaments that are sharp near the front and soft above
  // it. The water's colour is then thinned per channel by Beer–Lambert, exp(-D K), K the ink's optical density. In
  // the boxes round the text the density is held under a cap worked out from the stylesheet's --side-color (and
  // --ink-cap-text), so the ink there is never darker than it; a per-channel floor at that colour backs it up.
  const VERT = 'attribute vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }';
  const FRAG = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH', 'precision highp float;', '#else', 'precision mediump float;', '#endif',
    '#define NP ' + NP, '#define NB ' + NB, '#define NR ' + NR,
    'uniform vec2 uRes;',          // the drawing buffer, px
    'uniform float uAspect;',      // stage width / height
    'uniform sampler2D uNoise;',
    'uniform sampler2D uInk0, uNext0, uInk1, uNext1;',
    'uniform float uDuel;',
    'uniform vec4 uDrop[2];',     // x at the two walls, bed y, opacity
    'uniform vec3 uAir, uTop, uDeep;',   // linear rgb: the air over the tank, the water under its surface, at its bed
    'uniform float uSurface;',
    'uniform vec4 uSplit;',        // where the columns part, the axis (0 x, 1 y), the clear band either side, columns
    'uniform vec4 uColA[2];',      // ink top, front, fractional Sumi frame, strength
    'uniform vec4 uColB[2];',      // x0, x1, seat (+1 at x0, -1 at x1, 0 none), veil
    'uniform vec4 uColC[2];',      // seed, how far across its old ink has spread, flowing drops
    'uniform vec4 uColD[2];',      // the drift of its water: two offsets, wrapped
    'uniform vec3 uK[2];',         // its ink's optical density, per channel
    'uniform vec3 uFloor[2];',     // the darkest the digits' box may be over its ink (linear)
    'uniform vec3 uFloorT[2];',    // and any other text's
    'uniform float uN;',           // how many plume slots are in use
    'uniform vec4 uP[NP];',        // a plume: head x, head y, radius, strength
    'uniform vec4 uQ[NP];',        // column, phase, top of its stem, kind (0 ring, 1 bell, 2 bloom, 3 settled, 4 drop)
    'uniform vec4 uW[NP];',        // squash, lean, stem, -
    'uniform vec4 uBox[NB];',      // boxes round the text: the digits' first (uDigits of them), then the rest
    'uniform float uDigits;',
    'uniform vec2 uCaps[2];',      // the most ink, as density, behind the digits and behind other text, per column
    'uniform vec4 uRipple[NR];',   // x, age (s), amplitude, -
    'uniform vec4 uThread;',       // x, time over (s), strength, reach
    'uniform vec4 uThreadB;',      // bead phase, wobble phase, -, -
    'uniform vec3 uKThread;',
    'vec4 N(vec2 q) { return texture2D(uNoise, q); }',
    'float ridge(float n) { return 1.0 - abs(2.0 * n - 1.0); }',
    'vec3 enc(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }',
    'vec3 lin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }',
    // how far inside the digits' boxes (x) and the other text's (y) a point is: 1 inside, 0 a feather away
    'vec2 boxes(vec2 p) {',
    '  vec2 m = vec2(0.0);',
    '  for (int i = 0; i < NB; i++) {',
    '    vec4 b = uBox[i];',
    '    vec2 h = 0.5 * (b.zw - b.xy);',
    '    vec2 d = abs(p - 0.5 * (b.xy + b.zw)) - h;',
    '    float sd = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);',
    '    float k = (1.0 - smoothstep(0.0, ' + FEATHER.toFixed(4) + ', sd)) * step(0.0001, h.x);',
    '    if (float(i) < uDigits) m.x = max(m.x, k); else m.y = max(m.y, k);',
    '  }',
    '  return m;',
    '}',
    // a density held under cap: as it is up to half of it, then easing toward it
    'float held(float D, float cap) {',
    '  float knee = 0.55 * cap;',
    '  return min(D, knee + (cap - knee) * (1.0 - exp(-max(D - knee, 0.0) / (cap - knee))));',
    '}',
    'void main() {',
    '  vec2 uv = gl_FragCoord.xy / uRes;',
    '  vec2 p = vec2(uv.x * uAspect, 1.0 - uv.y);',
    // the column this pixel's ink is in, and the clear band where two meet
    // (the parting wanders a little, as two inks that have not met do)
    '  float along = mix(p.x, p.y, uSplit.y), across = mix(p.y, p.x, uSplit.y);',
    '  float two = step(1.5, uSplit.w);',
    '  float split = uSplit.x + uSplit.z * 1.4 * (N(vec2(across * 1.3, 0.43)).b - 0.5);',
    '  float side = two * step(split, along);',
    '  float apart = two * (1.0 - smoothstep(0.25 * uSplit.z, 1.6 * uSplit.z, abs(along - split)));',
    '  vec4 A = mix(uColA[0], uColA[1], side), B = mix(uColB[0], uColB[1], side);',
    '  vec4 C = mix(uColC[0], uColC[1], side), Dr = mix(uColD[0], uColD[1], side);',
    '  vec3 K = mix(uK[0], uK[1], side), F = mix(uFloor[0], uFloor[1], side), FT = mix(uFloorT[0], uFloorT[1], side);',
    '  vec2 caps = mix(uCaps[0], uCaps[1], side);',
    '  float top = A.x, front = A.y;',
    // the surface, and its ripples
    '  float wave = 0.0;',
    '  for (int i = 0; i < NR; i++) {',
    '    vec4 r = uRipple[i];',
    '    float dx = abs(p.x - r.x);',
    '    float reach = 0.03 + r.y * 0.5;',
    '    wave += r.z * exp(-r.y * 2.2) * sin(70.0 * dx - 16.0 * r.y) * smoothstep(reach, reach * 0.4, dx) * smoothstep(0.0, 0.05, r.y);',
    '  }',
    '  float S = uSurface + wave;',
    '  float wet = smoothstep(S - 0.0015, S + 0.0015, p.y);',
    // how old the ink here is: 0 at the front, 1 at the top of its column
    '  float age = clamp((front - p.y) / max(front - top, 0.03), 0.0, 1.0);',
    '  float amp = mix(0.010, 0.045, age);',
    '  vec2 q = p;',
    '  vec2 v = N(q * 0.8 + C.xy + Dr.xy).rg * 2.0 - 1.0; q += v * amp;',
    '  v = N(q * 0.8 + C.xy + Dr.xy).rg * 2.0 - 1.0; q += v * amp;',
    '  v = N(q * 2.1 + C.yx + Dr.zw).rg * 2.0 - 1.0; q += v * amp * 0.45;',
    '  if (C.w > 0.5) {',
    '    vec2 eddy = N(q * vec2(1.4, 1.9) + C.yx - Dr.zw).rg * 2.0 - 1.0;',
    '    q += eddy * vec2(0.024, 0.017) * smoothstep(S, S + 0.12, p.y);',
    '  }',
    // the plumes of this column: each a head and its stem; cov is how far the old ink round the stems has spread
    '  float heads = 0.0, stems = 0.0, cov = 0.0, Dair = 0.0;',
    '  vec2 sw = vec2(0.0);',
    '  for (int i = 0; i < NP; i++) {',
    '    if (float(i) >= uN) break;',
    '    vec4 P = uP[i], Q = uQ[i], W = uW[i];',
    '    if (P.w <= 0.0 || abs(Q.x - side) > 0.5) continue;',
    '    float R = P.z;',
    '    if (Q.w > 3.5) {',      // a drop still falling through the air
    '      vec2 e = (p - P.xy) / vec2(R, R * 1.6);',
    '      Dair += P.w * smoothstep(1.0, 0.5, length(e));',
    '      continue;',
    '    }',
    '    if (q.y > P.y + 2.0 * R || q.y < min(Q.z - 0.004, P.y - 2.0 * R)) continue;',   // under it, or over its stem and head
    '    vec2 d = (q - P.xy) / R;',
    // the stem: from where the drop came in down to the head, wider and paler the older it is
    '    float above = P.y - q.y;',
    '    float len = max(P.y - Q.z, 0.001);',
    '    float al = clamp(above / len, 0.0, 1.0);',
    '    float wob = R * al * (0.9 * sin(q.y * 7.0 + Q.y * 2.0) + 0.45 * sin(q.y * 17.0 + Q.y * 5.0)) + W.y * al * al;',
    '    float inStem = smoothstep(0.0, 0.7 * R, above) * smoothstep(Q.z - 0.004, Q.z + 0.02 + 0.5 * len * C.w, q.y);',
    '    float w = R * (0.1 + 0.55 * al);',
    '    float sx = (q.x - P.x - wob) / w;',
    '    stems += W.z * P.w * (0.8 - 0.5 * al) * exp(-sx * sx) * inStem;',
    '    float hw = R * (0.8 + 5.0 * al * al);',
    '    float hx = (q.x - P.x - 1.6 * wob) / hw;',
    '    cov = max(cov, W.z * exp(-hx * hx) * inStem);',
    '    if (abs(d.x) > 2.3 + 0.9 * W.x || d.y > 1.5 || d.y < -1.75) continue;',
    // the head: a vortex ring seen side on, a cap with its two rolled-up cores
    '    float sq = W.x;',
    '    d.x += C.w * (0.17 * d.y * sin(Q.y) + 0.12 * sin(2.7 * d.y + Q.y));',
    '    d.y /= 1.0 - 0.58 * C.w * sq;',   // the rolled-up cores also flatten when the drop meets the bed
    '    vec2 e = d / vec2(1.3 + 0.55 * sq, (d.y > 0.0 ? 0.6 : 0.98) * (1.0 - 0.5 * sq));',
    '    float r = length(e);',
    '    float body = smoothstep(1.0, 0.55, r);',
    '    float skin = smoothstep(1.03, 0.93, r) * smoothstep(0.62, 0.93, r) * smoothstep(-0.2, 0.45, d.y);',
    '    float cores = 0.0;',
    '    for (int s = 0; s < 2; s++) {',
    '      float sg = s == 0 ? -1.0 : 1.0;',
    '      vec2 c = d - vec2(0.82 * sg * (1.0 + 0.3 * sq), -0.1);',
    '      float rho = length(c);',
    '      if (rho > 1.35) continue;',
    '      float th = atan(c.y, c.x * sg);',
    '      float arm = cos(th + 3.6 * log(rho + 0.05) - Q.y - C.w * sg * 0.8);',
    '      cores += exp(-rho * rho * 4.5) * mix(0.42 + 0.58 * arm * arm, 0.55 + 0.37 * arm, C.w);',
    '      float rot = sg * 2.6 * exp(-rho * rho * 2.6);',
    '      vec2 cr = vec2(c.x * cos(rot) - c.y * sin(rot), c.x * sin(rot) + c.y * cos(rot));',
    '      sw += (cr - c) * R * smoothstep(0.0, 0.25, P.w);',
    '    }',
    '    float k = Q.w > 0.5 && Q.w < 1.5 ? 1.4 : 1.0;',   // a bell's ring is crisper
    '    heads += P.w * (0.28 * body + 0.85 * skin * k + 1.0 * cores);',
    '    cov = max(cov, min(1.0, P.w) * smoothstep(1.6, 0.8, r));',
    '  }',
    // the old ink between the top of the column and its front: near the stems first, all across toward the surface,
    // in translucent sheets whose edges are fine filaments; paler and softer the older it is
    '  cov = max(cov, smoothstep(0.3, 1.0, age) * 0.85 * C.z);',
    // (a column whose ink starts under the surface, the end card's lower layer, has a stirred top edge, not a level one)
    '  cov *= smoothstep(front + 0.02, front - 0.06, q.y) * smoothstep(top - 0.004, top + 0.03, mix(p.y, q.y, step(uSurface + 0.05, top)));',
    '  vec2 qd = q + sw;',
    '  float soft = mix(0.035, 0.17, age);',
    '  float lw = mix(0.012, 0.05, age);',
    '  float f1 = N(qd * vec2(0.7, 0.3) + C.xy + Dr.zw * 0.6).b;',
    '  float f2 = N(qd * vec2(1.2, 0.55) - C.yx + Dr.xy * 0.8).a;',
    '  float f3 = N(qd * 2.3 + C.yx * 1.7 - Dr.zw).b;',
    '  float sheets = 0.25 + 0.42 * smoothstep(0.5 - soft, 0.5 + soft, f1) + 0.33 * smoothstep(0.47 - soft, 0.47 + soft, f2);',
    '  float lines = 0.55 * exp(-pow((f1 - 0.5) / lw, 2.0)) + 0.45 * exp(-pow((f2 - 0.47) / lw, 2.0));',
    '  float young = 1.0 - age;',
    '  float veil = B.w * cov * mix(0.48, 0.17, age) * (sheets + lines * (0.25 + 0.75 * young)) * (0.85 + 0.3 * f3);',
    '  float fromSeat = B.z > 0.5 ? (p.x - B.x) : (B.y - p.x);',
    '  veil *= 1.0 + 0.22 * abs(B.z) * (1.0 - 2.0 * smoothstep(0.0, B.y - B.x, fromSeat));',
    // the stems are streaked along their length, the heads take the curl of their cores
    '  float streak = ridge(N(vec2(qd.x * 6.5, qd.y * 0.7) + C.xy * 2.1 + Dr.zw * 0.3).a);',
    '  stems *= 0.55 + 0.9 * streak * streak;',
    '  heads *= 0.6 + 0.55 * smoothstep(0.3, 0.7, f2) + 0.35 * lines;',
    '  float D = (heads + stems + veil) * A.w * wet * (1.0 - apart) * step(B.x - 0.001, p.x) * step(p.x, B.y + 0.001);',
    // overtime: a thread of the accent's ink falling from the surface at the seat
    '  float Dt = 0.0;',
    '  if (uThread.z > 0.0) {',
    '    float cx = uThread.x + 0.004 * sin(p.y * 31.0 + uThreadB.y) + 0.0025 * sin(p.y * 77.0 - uThreadB.y * 1.7);',
    '    float tw = 0.0024 + 0.0016 * sin(p.y * 13.0 + uThreadB.y * 0.5);',
    '    float tx = (mix(p.x, q.x, 0.25) - cx) / tw;',
    '    float beads = 0.62 + 0.38 * sin(p.y * 90.0 - uThreadB.x);',
    '    Dt = exp(-tx * tx) * beads * smoothstep(S, S + 0.01, p.y) * smoothstep(uThread.w + 0.01, uThread.w - 0.01, p.y);',
    '    vec2 pool = (q - vec2(uThread.x, ' + BED.toFixed(4) + ')) / vec2(0.02 + 0.03 * min(uThread.y, 30.0) / 30.0, 0.018);',
    '    Dt += 0.55 * exp(-dot(pool, pool)) * smoothstep(' + (BED - 0.02).toFixed(4) + ', ' + BED.toFixed(4) + ', uThread.w);',
    '    Dt *= uThread.z * wet;',
    '  }',
    // the water and its light, the ink in it, the air over it
    '  vec3 water = mix(uTop, uDeep, smoothstep(S, 1.0, p.y));',
    '  water *= 1.0 + 0.05 * exp(-(p.y - S) * 12.0);',
    '  vec2 m = boxes(p);',
    '  D = mix(mix(D, held(D, caps.y), m.y), held(D, caps.x), m.x);',
    '  Dt = mix(Dt, min(Dt, 0.15), max(m.x, m.y));',
    '  vec3 col = water * exp(-(D * K + Dt * uKThread));',
    // Composite the original Sumi side-view opacity at the water's scale. Its shape and movement come from Sumi.
    '  if (uDuel > 0.5 && A.z >= 0.0) {',
    '    vec4 tank = uDrop[0];',
    '    vec2 coord = vec2((p.x - tank.x) / (tank.y - tank.x), (p.y - uSurface) / (tank.z - uSurface));',
    '    vec4 dye = mix(texture2D(uInk0, coord), texture2D(uNext0, coord), fract(A.z));',
    '    float con = dye.b / max(dye.r + dye.b, 0.0001);',
    '    float right = tank.y > tank.x ? con : 1.0 - con;',
    '    vec3 pigment = mix(enc(uDeep * exp(-uK[0])), enc(uDeep * exp(-uK[1])), right);',
    '    col = lin(mix(enc(col), pigment, dye.a * tank.w * wet * step(coord.y, 1.0)));',
    '    F = mix(uFloor[0], uFloor[1], right); FT = mix(uFloorT[0], uFloorT[1], right);',
    '  } else if (A.z >= 0.0) {',
    '    vec4 drop = mix(uDrop[0], uDrop[1], side);',
    '    vec2 coord = vec2((p.x - drop.x) / (drop.y - drop.x), (p.y - uSurface) / (drop.z - uSurface));',
    '    float ink = side < 0.5 ? mix(texture2D(uInk0, coord).a, texture2D(uNext0, coord).a, fract(A.z))',
    '                           : mix(texture2D(uInk1, coord).a, texture2D(uNext1, coord).a, fract(A.z));',
    '    float opacity = ink * drop.w * A.w * wet * (1.0 - apart);',
    '    opacity *= step(0.0, coord.x) * step(coord.x, 1.0) * step(coord.y, 1.0);',
    '    col = lin(mix(enc(col), enc(uDeep * exp(-K)), opacity));',
    '  }',
    '  float line = exp(-pow((p.y - S) / 0.0017, 2.0));',
    '  float men = exp(-pow((p.y - S - 0.005) / 0.0032, 2.0));',
    '  col = mix(uAir, col, wet);',
    '  col *= 1.0 - 0.17 * line;',
    '  col += 0.045 * men * wet;',
    '  col *= exp(-Dair * mix(uK[0], uK[1], side));',
    '  col = mix(col, max(col, FT), m.y);',
    '  col = mix(col, max(col, F), m.x);',
    '  gl_FragColor = vec4(enc(clamp(col, 0.0, 1.0)), 1.0);',
    '}',
  ].join('\n');

  // ---- the noise the shader looks up: four tileable channels in one 256 x 256 image, made once from DT.themes.rng ----
  // r, g: the curl of a smooth potential (divergence free, so a few steps along it stir rather than smear); b: value
  // noise of 16 cells to the tile, with a little of 37; a: of 32 cells. Mipmapped, so a thumbnail's lookups average rather than sparkle.
  const SIZE = 256;
  let noise = null;   // made once for the page: every stage's water is the same water
  function noiseImage() {
    if (noise) return noise;
    const rand = DT.themes.rng('ink/water');
    const grid = cells => { const g = new Float32Array(cells * cells); for (let i = 0; i < g.length; i++) g[i] = rand(); return g; };
    const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
    const sampler = (g, cells) => (x, y) => {
      const fx = x / SIZE * cells, fy = y / SIZE * cells;
      const i = Math.floor(fx), j = Math.floor(fy), u = fade(fx - i), v = fade(fy - j);
      const at = (a, b) => g[((b % cells + cells) % cells) * cells + ((a % cells + cells) % cells)];
      const top = at(i, j) + (at(i + 1, j) - at(i, j)) * u, bottom = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * u;
      return top + (bottom - top) * v;
    };
    const psiA = sampler(grid(6), 6), psiB = sampler(grid(13), 13), nB = sampler(grid(16), 16), nA = sampler(grid(32), 32);
    const nB2 = sampler(grid(37), 37);
    const psi = (x, y) => psiA(x, y) + 0.45 * psiB(x, y);
    const curl = new Float32Array(SIZE * SIZE * 2);
    let max = 0;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const dx = (psi(x + 1, y) - psi(x - 1, y)) / 2, dy = (psi(x, y + 1) - psi(x, y - 1)) / 2;
        const k = (y * SIZE + x) * 2;
        curl[k] = dy;
        curl[k + 1] = -dx;
        max = Math.max(max, Math.abs(dx), Math.abs(dy));
      }
    }
    const data = new Uint8Array(SIZE * SIZE * 4);
    const byte = v => Math.max(0, Math.min(255, Math.round(v * 255)));
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const i = y * SIZE + x;
        data[i * 4] = byte(0.5 + 0.5 * curl[i * 2] / max);
        data[i * 4 + 1] = byte(0.5 + 0.5 * curl[i * 2 + 1] / max);
        data[i * 4 + 2] = byte(0.72 * nB(x, y) + 0.28 * nB2(x, y));
        data[i * 4 + 3] = byte(nA(x, y));
      }
    }
    return (noise = data);
  }

  // ---- colours: read from the stage's computed style, kept linear ----
  const toLinear = v => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  function parseColour(css, probe2d) {
    const m = /rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/.exec(css);
    if (m) return [m[1], m[2], m[3]].map(x => Number(x) / 255);
    probe2d.fillStyle = '#000';
    probe2d.fillStyle = css;
    probe2d.clearRect(0, 0, 1, 1);
    probe2d.fillRect(0, 0, 1, 1);
    const d = probe2d.getImageData(0, 0, 1, 1).data;
    return [d[0] / 255, d[1] / 255, d[2] / 255];
  }

  // The context: webgl2 if it can be had, else webgl; none is an error, and render.js then stops the painter and the
  // stylesheet carries on alone.
  function contextOf(canvas) {
    const opts = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
      preserveDrawingBuffer: false, powerPreference: 'low-power' };
    let gl = null;
    try { gl = canvas.getContext('webgl2', opts) || canvas.getContext('webgl', opts); } catch (e) { gl = null; }
    if (!gl) throw new Error('墨：这台机器上没有 WebGL');
    return gl;
  }

  function program(gl) {
    const shader = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error('墨：着色器没有编译 ' + gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
    gl.bindAttribLocation(prog, 0, 'aPos');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error('墨：着色器没有链接 ' + gl.getProgramInfoLog(prog));
    return prog;
  }

  // The uniforms, in the order they are packed: each a name and its length in floats.
  const LAYOUT = [
    ['uRes', 2], ['uAspect', 1], ['uAir', 3], ['uTop', 3], ['uDeep', 3], ['uSurface', 1], ['uSplit', 4], ['uDuel', 1],
    ['uColA', 8], ['uColB', 8], ['uColC', 8], ['uColD', 8], ['uDrop', 8], ['uK', 6], ['uFloor', 6], ['uFloorT', 6],
    ['uN', 1], ['uP', 4 * NP], ['uQ', 4 * NP], ['uW', 4 * NP], ['uBox', 4 * NB], ['uDigits', 1], ['uCaps', 4], ['uRipple', 4 * NR],
    ['uThread', 4], ['uThreadB', 4], ['uKThread', 3],
  ];
  const ARRAYS = ['uColA', 'uColB', 'uColC', 'uColD', 'uDrop', 'uK', 'uFloor', 'uFloorT', 'uCaps', 'uP', 'uQ', 'uW', 'uBox', 'uRipple'];
  const VEC3 = ['uAir', 'uTop', 'uDeep', 'uK', 'uFloor', 'uFloorT', 'uKThread'];
  const OFFSET = {};
  let FLOATS = 0;
  LAYOUT.forEach(([name, n]) => { OFFSET[name] = FLOATS; FLOATS += n; });

  const clamp01 = x => Math.min(1, Math.max(0, x));
  const easeOut = x => 1 - Math.pow(1 - clamp01(x), 3);
  const TAU = Math.PI * 2;
  const wrap = x => x - Math.floor(x);

  // A column's plumes: where across it from its seat (at), how far ahead of the front (lead), size, strength, the
  // phase of its rolling cores and its entrance's lag. The same seed gives the same water on every screen.
  function plumesOf(seed, n, spread) {
    const rand = DT.themes.rng(seed);
    const out = [];
    for (let i = 0; i < n; i++) {
      const at = (i + 0.5) / n + (rand() - 0.5) * spread / n;
      out.push({ at: Math.min(0.94, Math.max(0.06, at)), lead: (rand() - 0.5) * 0.05, r: 0.048 + rand() * 0.028,
        s: 0.85 + rand() * 0.3, phase: rand() * TAU, lag: rand(), spin: 0.18 + rand() * 0.14 });
    }
    return out;
  }

  // A bell's point: how much of its clock is left when it rings, from the engine's key (w30: 30 s left; end: none).
  function pointOf(event) {
    if (!event || (event.type !== 'warn' && event.type !== 'end')) return null;
    if (event.type === 'end') return 0;
    const m = /^w(\d+(?:\.\d+)?)$/.exec(String(event.key || ''));
    return m ? Number(m[1]) * 1000 : null;
  }

  // Single-colour stages reuse the same Sumi frames. A dual stage owns its tank because its
  // injection times depend on the speakers. Each cache holds at most 16 canvases (under 6 MiB).
  const singleTank = { masks: new Map(), sources: [null, null] };
  const MASK_CACHE_SIZE = 16;
  let consumers = 0;
  function closeSource(source) {
    for (const layer of source.layers) {
      if (layer.painter) layer.painter.dispose();
      else layer.gl?.getExtension('WEBGL_lose_context')?.loseContext();
      layer.canvas.remove();
    }
  }

  function openSource(tank) {
    const layers = [];
    const layer = () => {
      const canvas = document.createElement('canvas');
      canvas.style.cssText = 'position:fixed;left:-1000px;top:0;visibility:hidden;width:' + MASK_W + 'px;height:' + MASK_H + 'px';
      canvas.setAttribute('aria-hidden', 'true');
      document.body.appendChild(canvas);   // upstream fitCanvas reads the CSS size
      const gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: false, premultipliedAlpha: true });
      const target = { canvas, gl, painter: null };
      layers.push(target);
      if (!gl) throw new Error('墨：Sumi 无法取得 WebGL');
      return target;
    };
    const source = { layers, fluid: false, frame: -1 };
    try {
      const first = layer(), gl = first.gl;
      const options = { seed: 1, color: '#000000', swirl: 0.6 };
      const shared = !!tank.starts;
      const fluidSeconds = shared ? 2 * FLUID_SECONDS : FLUID_SECONDS;
      const tracedSeconds = shared ? 18 : 11.5;
      const dropsAt = run => shared ? tank.starts.map((start, i) => {
        const x = DUEL_X[Math.floor(i / 2)];
        return [i % 2 ? 1 - x : x, 0.075, start * run, i % 2 ? '#0000ff' : '#ff0000'];
      }) : DROPS.map(([x, progress]) => [x, 0.075, progress * run]);
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      const software = info && /swiftshader|llvmpipe|software rasterizer|basic render driver/i.test(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
      // The original fluid solver injects every drop into the same velocity field.
      let drops = dropsAt(fluidSeconds);
      if (!software) first.painter = SumiInk.fluidPainter(first.canvas, gl, drops, options, fluidSeconds);
      source.fluid = !!first.painter;
      if (!source.fluid) {
        drops = dropsAt(tracedSeconds);
        // Single-colour playback retains its original batches. In a debate every drop contributes
        // to the same traced velocity field, including an earlier drop from the other side.
        const batchSize = shared ? drops.length : 3;
        for (let i = 0; i < drops.length; i += batchSize) {
          const target = i === 0 ? first : layer();
          target.painter = SumiInk.tracedSide(target.canvas, target.gl, drops.slice(i, i + batchSize), options, tracedSeconds);
          if (!target.painter) throw new Error('墨：Sumi 无法绘制墨滴');
        }
      }
      if (shared) source.updateStarts = () => {
        drops.forEach((drop, i) => { drop[2] = tank.starts[i] * first.painter.duration; });
        first.painter.updateStarts?.();
      };
      return source;
    } catch (e) {
      closeSource(source);
      throw e;
    }
  }

  function dropMask(frame, side, tank) {
    const { masks, sources } = tank;
    let mask = masks.get(frame);
    if (mask) {
      masks.delete(frame);
      masks.set(frame, mask);
      return mask;
    }
    let source = sources[side];
    if (source && ((source.fluid && frame < source.frame) || source.layers.some(layer => layer.gl.isContextLost()))) {
      closeSource(source);
      source = sources[side] = null;
    }
    if (!source) source = sources[side] = openSource(tank);
    if (masks.size === MASK_CACHE_SIZE) {
      const oldest = masks.keys().next().value;
      mask = masks.get(oldest);
      masks.delete(oldest);
    } else {
      mask = document.createElement('canvas');
      mask.width = MASK_W; mask.height = MASK_H;
    }
    const sample = mask.getContext('2d'), layers = source.layers;
    // The traced rendition settles higher in its canvas. Frame that tank around its actual descent.
    const crop = source.fluid ? 1 : 0.80;
    for (const { painter, canvas, gl } of layers) {
      // The solver advances while its clock is below this time. Sampling inside the step avoids
      // duplicating or skipping a step due to floating-point rounding at an exact 1/60 boundary.
      painter.draw(source.fluid ? (frame + 0.5) / SUMI_HZ :
        Math.max(1 / 120, painter.duration * frame / (tank.starts ? DUEL_LAST_FRAME : LAST_FRAME)));
      if (gl.isContextLost()) {
        closeSource(source);
        sources[side] = null;
        throw new Error('墨：Sumi 的画布丢了');
      }
      sample.globalCompositeOperation = canvas === layers[0].canvas ? 'copy' : 'source-over';
      sample.drawImage(canvas, 0, 0, canvas.width, canvas.height * crop, 0, 0, MASK_W, MASK_H);
    }
    source.frame = frame;
    masks.set(frame, mask);
    return mask;
  }

  function painter(canvas, ctx, flags) {
    const still = !!(flags && (flags.thumbnail || flags.reducedMotion || flags.frozen));
    const motionless = !!(flags && flags.reducedMotion);
    const gl = contextOf(canvas);
    let prog;
    try {
      prog = program(gl);
      if (gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS) < 3 * NP + NB + NR + 40) throw new Error('墨：显卡的着色器常量不够');
    } catch (e) {
      // A card that cannot run the shader gives its context back now, not when the canvas is collected: a browser keeps
      // only a few live. The theme carries on with its stylesheet (render.js stops the painter on this throw).
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
      throw e;
    }
    const loc = {};
    LAYOUT.forEach(([name, n]) => { loc[name] = gl.getUniformLocation(prog, name + (ARRAYS.indexOf(name) >= 0 ? '[0]' : '')); });
    const uNoise = gl.getUniformLocation(prog, 'uNoise');
    const inkSamplers = ['uInk0', 'uNext0', 'uInk1', 'uNext1'].map(name => gl.getUniformLocation(prog, name));
    const duelTank = { masks: new Map(), sources: [null], starts: Array(DROPS.length * 2).fill(NOT_DROPPED) };
    const inkTextures = inkSamplers.map(() => {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, MASK_W, MASK_H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      return { texture, frame: -1 };
    });
    consumers++;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, SIZE, SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, noiseImage());
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

    const probe2d = (() => { const c = document.createElement('canvas'); c.width = c.height = 1; return c.getContext('2d', { willReadFrequently: true }); })();
    let W = 0, H = 0;          // the stage, CSS px
    let palette = null, paletteSig = null;
    let lastKey = null, enterAt = null, openingFrame = null;
    let bells = [];            // the bells this stage has rung: {clock, ms, type}
    const layout = { sig: null, steps: null, until: -Infinity, m: null };
    const plumeCache = {};
    let drawn = null;          // the uniforms last drawn
    const u = new Float32Array(FLOATS);

    // Translate each speaker's five milestones to time in the shared tank. Settled turns survive
    // pause, undo, reload and projection. Only the current turn grows between actions.
    function duelFrame(v) {
      const clocks = ['pro', 'con'].map(side => v.clocks.find(c => c.id === side));
      const total = clocks[0].total + clocks[1].total;
      const used = clocks.map(c => Math.max(0, c.total - (c.yielded || c.remaining)));
      const spent = [0, 0], starts = Array(2 * DROPS.length).fill(NOT_DROPPED);
      let elapsed = 0;
      function turn(side, duration) {
        const i = side === 'pro' ? 0 : 1;
        const end = spent[i] + Math.min(duration, Math.max(0, used[i] - spent[i]));
        DROPS.forEach(([, fraction], j) => {
          const threshold = fraction * clocks[i].total, slot = 2 * j + i;
          if (starts[slot] !== NOT_DROPPED || threshold < spent[i] || threshold > end) return;
          const at = (elapsed + threshold - spent[i]) / total;
          // Two integration steps leave room for the already displayed interpolation neighbour at a handoff.
          starts[slot] = at > 0 ? (Math.ceil(at * (DUEL_LAST_FRAME + 1)) + 2) / (DUEL_LAST_FRAME + 1) : 0;
        });
        elapsed += end - spent[i];
        spent[i] = end;
      }
      for (const [side, ms] of v.turns || []) turn(side, ms);
      clocks.forEach((c, i) => { if (used[i] > spent[i] || c.active) turn(c.id, used[i] - spent[i]); });

      let changedAt = NOT_DROPPED;
      starts.forEach((start, i) => {
        if (start !== duelTank.starts[i]) changedAt = Math.min(changedAt, start, duelTank.starts[i]);
      });
      if (changedAt !== NOT_DROPPED) {
        duelTank.starts = starts;
        const cut = Math.floor(changedAt * DUEL_LAST_FRAME);
        const source = duelTank.sources[0];
        if (source && source.fluid && source.frame >= cut) {
          closeSource(source);
          duelTank.sources[0] = null;
        } else if (source) source.updateStarts();
        for (const f of duelTank.masks.keys()) if (f >= cut) duelTank.masks.delete(f);
        for (const slot of inkTextures) if (slot.tank === duelTank && slot.frame >= cut) slot.frame = -1;
        drawn = null;
      }
      const landed = starts.filter(start => start < NOT_DROPPED);
      if (!landed.length) return -1;
      const at = motionless ? Math.max(...landed) + 0.01 : elapsed / total;
      return clamp01(at) * DUEL_LAST_FRAME;
    }

    const stageEl = () => canvas.parentNode;

    // ---- the colours, from the stage's computed style (ink.css defines them, once) ----
    function readPalette(el) {
      const probe = document.createElement('i');
      probe.setAttribute('aria-hidden', 'true');
      probe.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;visibility:hidden';
      el.appendChild(probe);
      const cs = getComputedStyle(el);
      const colour = name => {
        probe.style.color = 'var(' + name + ')';
        return parseColour(getComputedStyle(probe).color, probe2d);
      };
      const num = (name, fallback) => { const x = parseFloat(cs.getPropertyValue(name)); return isFinite(x) ? x : fallback; };
      const srgb = {
        air: colour('--ground'), top: colour('--ink-water-top'), deep: colour('--ink-water-deep'),
        pro: colour('--pro'), con: colour('--con'), neutral: colour('--ink-neutral'), accent: colour('--accent'),
      };
      probe.remove();
      const lin = c => c.map(toLinear);
      const deep = lin(srgb.deep);
      const cap = clamp01(num('--ink-cap', 0.6)), capText = clamp01(num('--ink-cap-text', 0.3));
      const mixed = (name, k) => srgb[name].map((v, i) => toLinear(srgb.deep[i] + (v - srgb.deep[i]) * k));
      const ink = name => {
        // the ink's optical density: how much of each channel of the water a unit of it takes away
        const K = lin(srgb[name]).map((v, i) => Math.max(0.02, -Math.log(Math.max(v, 1e-4) / deep[i])));
        // ink.css's --side-color, color-mix(in srgb, the ink --ink-cap, the water at the bed), is the darkest the ink
        // may make anything behind the digits; as a density, the most of this ink that leaves every channel of the
        // water at its bed at least that light. The ink behind the text is held under it, softly, so it keeps its
        // grain; the floor itself is only a backstop.
        const floor = mixed(name, cap), floorText = mixed(name, capText);
        const most = f => Math.min.apply(null, K.map((k, i) => (f[i] < deep[i] ? -Math.log(f[i] / deep[i]) / k : Infinity)));
        return { K, floor, floorText, caps: [most(floor), most(floorText)] };
      };
      return {
        air: lin(srgb.air), top: lin(srgb.top), deep, cap, capText, surface: num('--ink-surface', 30) / 100,
        pro: ink('pro'), con: ink('con'), neutral: ink('neutral'), accent: ink('accent'),
      };
    }

    // ---- the layout, read off the stage, in stage heights ----
    function rectOf(el, box) {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      return [(r.left - box.left) / box.height, (r.top - box.top) / box.height, (r.right - box.left) / box.height, (r.bottom - box.top) / box.height];
    }
    const union = list => list.filter(Boolean).reduce((a, b) => (a ? [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])] : b), null);
    const pad = r => (r ? [r[0] - PAD, r[1] - PAD, r[2] + PAD, r[3] + PAD] : null);
    // The digits' box and, when they show, the overtime sign and 「暂停」 / 时间到 beside them.
    function clockBox(clock, box) {
      if (!clock || getComputedStyle(clock).display === 'none') return null;
      const parts = [rectOf(clock, box)];
      clock.querySelectorAll('.dt-digits:not(.dt-digits-on) > span, .dt-state').forEach(el => { if (el.textContent) parts.push(rectOf(el, box)); });
      return pad(union(parts));
    }
    const varOf = (el, name) => { const x = parseFloat(getComputedStyle(el).getPropertyValue(name)); return isFinite(x) ? x : 0; };
    const sel = (el, s) => el.querySelector(s);

    // What moves the layout: the stage and its attributes, the halves', the digits' length and tension. Inline
    // styles and attributes only, so working it out costs no style or layout.
    function layoutSig(el, v) {
      const parts = [W, H, v.mode, v.stage ? v.stage.id : '', v.proSeat, el.classList.contains('is-entering'),
        el.getAttribute('data-kind'), el.getAttribute('data-side'), el.getAttribute('data-phase')];
      el.querySelectorAll('.dt-half').forEach(h => parts.push(h.getAttribute('data-side'), h.hasAttribute('data-active'),
        h.hasAttribute('data-locked')));
      v.clocks.forEach(c => parts.push(c.phase, c.running));
      const steps = [el.style.getPropertyValue('--tension')];
      el.querySelectorAll('.dt-half').forEach(h => steps.push(h.style.getPropertyValue('--tension')));
      v.clocks.forEach(c => steps.push(c.text.length));
      return { moves: parts.join('|'), steps: steps.join('|') };
    }

    function measure(el) {
      const box = el.getBoundingClientRect();
      const halves = Array.from(el.querySelectorAll('.dt-half')).map(h => ({
        side: h.getAttribute('data-side') === 'con' ? 'con' : 'pro',
        dim: varOf(h, '--dim'), clear: varOf(h, '--ink-clear'), clock: clockBox(sel(h, '.dt-clock'), box),
      }));
      return {
        aspect: box.width / Math.max(1, box.height), halves,
        top: el.dataset.kind === 'single' ? Array.from(el.querySelectorAll('.dt-top span'), node => pad(rectOf(node, box))) : [],
        clock: clockBox(sel(el, '.dt-clock[data-clock="main"]'), box), head: pad(rectOf(sel(el, '.dt-head'), box)),
        motions: pad(rectOf(sel(el, '.dt-motions'), box)), teams: pad(rectOf(sel(el, '.dt-teams'), box)),
        record: pad(rectOf(sel(el, '.dt-record'), box)), next: pad(rectOf(sel(el, '.dt-next'), box)),
        progress: pad(rectOf(sel(el, '.dt-progress'), box)),
      };
    }

    // Read on every frame for a while after anything that moves it has changed (the divider's spring, a half's fade,
    // the digits' size, the text rising in), once after a step (the digits' tension, a minute's digit), and otherwise
    // kept: read on every frame, it would lay the page out twice on every frame.
    function layoutOf(el, v, now) {
      const sig = layoutSig(el, v);
      let fresh = !layout.m || still;
      if (sig.moves !== layout.sig) { layout.sig = sig.moves; layout.until = now + SETTLE_MS; }
      if (sig.steps !== layout.steps) { layout.steps = sig.steps; fresh = true; }
      if (fresh || now <= layout.until) layout.m = measure(el);
      return layout.m;
    }

    // ---- the scene: the view and the layout made into columns of water, plumes and boxes ----
    function seedOf(key) {
      let h = 0;
      for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
      return [(h % 997) / 997, ((h >>> 10) % 991) / 991];
    }
    function plumes(key, n, spread) { return plumeCache[key + '|' + n] || (plumeCache[key + '|' + n] = plumesOf(key, n, spread)); }

    function scene(v, m, now) {
      const aspect = m.aspect;
      const S = palette.surface;
      const seat = v.proSeat === 'right' ? 'right' : 'left';
      const st = v.mode === 'stage' ? v.stage : null;
      const sc = { aspect, columns: [], plumes: [], digits: [], text: [], ripples: [], thread: null, split: { at: 0, axis: 0, band: 0 } };
      const entering = enterAt !== null && !still ? clamp01((now - enterAt) / ENTER_MS) : 1;
      const timeOf = ms => (motionless ? STILL_T : ms / 1000);
      const bed = st?.type === 'single' ? 1 : BED;
      const frontOf = used => S + GAP + (bed - S - GAP) * clamp01(used);
      const usedOf = c => Math.max(0, c.total - c.remaining);
      const across = (c, at) => (c.seat >= 0 ? c.x0 + at * (c.x1 - c.x0) : c.x1 - at * (c.x1 - c.x0));
      // A column of water, x0..x1, its seat (+1 at x0, -1 at x1, 0 none), its ink, its turbulence's time t (s), the top
      // and front of its ink; its old ink pours in with the drops as the stage comes in.
      const column = o => {
        const c = Object.assign({ top: S, veil: 0, amount: 1, seat: 0, spread: 1 }, o);
        c.flow = st && !motionless ? 1 : 0;
        c.veil *= clamp01(entering * 1.6 - 0.2);
        c.seed = seedOf(o.seedKey);
        // Some lookups scale these offsets by .3, .6 or .8. Ten tiles is a full period for all of them.
        // Signed remainders also let a negative current start at zero without jumping a tile on the first tick.
        const t = c.t * (c.flow ? 3 : 1);
        c.drift = [(0.0017 * t) % 10, (-0.0011 * t) % 10, (-0.0026 * t) % 10, (0.0019 * t) % 10];
        sc.columns.push(c);
        return c;
      };
      // Schedule each side's Sumi drops using only its own elapsed speaking time.
      const rain = (c, progress, inset = 0) => {
        // Reduced motion holds a still for each entry until the next drop is due.
        const at = motionless ? DROPS.reduce((last, [, start]) => progress >= start ? start + 0.01 : last, 0) : progress;
        c.frame = clamp01(at) * LAST_FRAME;
        c.drop = [across(c, inset), across(c, 1 - inset), bed, still ? 1 : easeOut((entering - 0.2) / 0.8)];
        if (entering < 0.2) {
          const x = c.drop[0] + (c.drop[1] - c.drop[0]) * DROPS[0][0];
          const fall = entering / 0.2;
          sc.plumes.push({ x, y: S - 0.042 * (1 - fall * fall), r: 0.011, s: 1.6, col: sc.columns.indexOf(c),
            phase: 0, top: S, kind: 4, squash: 0, lean: 0, stem: 0 });
        }
      };
      // The end card's two bands of settled pigment sit behind the match record.
      const settledBand = (c, idx) => {
        plumes(c.seedKey, 3, 0.8).forEach(pl => {
          const x = across(c, pl.at), R = 1.2 * pl.r;
          let y = Math.min(c.front + pl.lead - 0.7 * R, BED - 0.45 * R);
          let radius = R, strength = pl.s, kind = 3;
          const e = clamp01(entering * 1.35 - 0.35 * pl.lag);
          if (e < 1) {
            const hit = 0.22;
            if (e < hit) {
              const k = e / hit;
              kind = 4; radius = 0.008 + 0.004 * k; y = S - 0.07 + 0.07 * k * k; strength = 2.2 * c.amount;
            } else {
              const k = easeOut((e - hit) / (1 - hit));
              radius = R * (0.35 + 0.65 * k);
              y = S + 0.01 + (y - S - 0.01) * k;
              sc.ripples.push({ x, age: (e - hit) * ENTER_MS / 1000, amp: 0.0045 });
            }
          }
          sc.plumes.push({ x, y, r: radius, s: strength, col: idx, phase: wrap((pl.phase + pl.spin * c.t) / TAU) * TAU,
            top: c.top, kind, squash: 1, lean: 0, stem: 0 });
        });
      };
      // A bell's drop falls on the speaking side and punches a crisp ring down to the front, then melts into it; an
      // end bell's two drops are 320 ms apart. Its age is the clock's time used since the bell's point.
      const bellDrops = (c, idx, clockId, clock, list) => {
        if (still || !clock) return;
        bells.forEach(b => {
          if (b.clock !== clockId || (b.type === 'end' && st.type === 'dual')) return;
          [0, RING_GAP_S].slice(0, b.type === 'end' ? 2 : 1).forEach((delay, j) => {
            const age = (usedOf(clock) - (clock.total - b.ms)) / 1000 - delay;
            if (age < 0 || age > BELL_S + MELT_S) return;
            // between two of the column's own drops, nearest the seat, so it is not lost in a stem
            const gap = Math.min(j, list.length - 2);
            const x = across(c, gap >= 0 ? (list[gap].at + list[gap + 1].at) / 2 : 0.25 + 0.1 * j);
            const fall = 0.1;
            if (age < fall) {
              sc.plumes.push({ x, y: S - 0.05 + 0.05 * (age / fall), r: 0.007, s: 2.2, col: idx, phase: 0, top: S, kind: 4, squash: 0, lean: 0, stem: 0 });
              return;
            }
            const k = easeOut((age - fall) / (BELL_S - fall));
            const melt = clamp01((age - BELL_S) / MELT_S);
            const target = Math.min(c.front - 0.03, BED - 0.03);
            sc.plumes.push({ x, y: S + 0.02 + (target - S - 0.02) * k, r: (0.024 + 0.02 * k) * (1 + 0.7 * melt), s: 1.7 * (1 - melt) * c.amount,
              col: idx, phase: wrap(age * 0.9) * TAU, top: S, kind: 1, squash: 0, lean: 0, stem: 0.8 * (1 - melt) });
            if (j === 0 || b.type === 'end') sc.ripples.push({ x, age: age - fall, amp: b.type === 'end' ? 0.006 : 0.004 });
          });
        });
      };

      if (v.mode === 'title') {
        // Each side's drop blooming on its own side, its tendrils reaching in toward the middle.
        const left = seat === 'left' ? 'pro' : 'con', right = left === 'pro' ? 'con' : 'pro';
        [[left, 0, aspect / 2, 1], [right, aspect / 2, aspect, -1]].forEach(([side, x0, x1, dir], i) => {
          const c = column({ x0, x1, seat: dir, ink: side, t: 31 + 7 * i, front: 0.66, veil: 0.3, seedKey: 'title/' + side });
          c.frame = (0.095 + i * 0.015) * LAST_FRAME;
          c.drop = [across(c, 0), across(c, 1), BED, easeOut(entering)];
        });
        sc.split = { at: aspect / 2, axis: 0, band: 0.03 };
        sc.text.push(m.motions, m.teams);
      } else if (v.mode === 'end') {
        // Both inks at rest in the tank, in two layers, 正方's over 反方's.
        const k = easeOut(entering), lift = 0.05 * (1 - k);
        const c0 = column({ x0: 0, x1: aspect, ink: 'pro', t: 63, top: 0.6 - lift, front: 0.76 - lift, veil: 0.75, seedKey: 'end/pro' });
        const c1 = column({ x0: 0, x1: aspect, ink: 'con', t: 74, top: 0.79 - lift, front: 0.97 - lift, veil: 0.85, seedKey: 'end/con' });
        settledBand(c0, 0);
        settledBand(c1, 1);
        sc.split = { at: 0.775 - lift, axis: 1, band: 0.012 };
        sc.text.push(m.head, m.record);
      } else if (st && st.type === 'dual') {
        sc.duel = true;
        const frame = duelFrame(v);
        const split = aspect / 2;
        m.halves.forEach((h, i) => {
          const clock = v.clocks.find(c => c.id === h.side);
          if (!clock) return;
          let used = usedOf(clock);
          const yielded = clock.locked && clock.yielded > 0;
          if (yielded) used = Math.max(0, clock.total - clock.yielded);
          const amount = (1 - DIM * h.dim) * (1 - LOCK_FADE * h.clear);
          const c = column({ x0: i ? split : 0, x1: i ? aspect : split, seat: i ? -1 : 1, ink: h.side, t: timeOf(used),
            front: frontOf(used / Math.max(1, clock.total)), amount, seedKey: st.id + '/' + h.side });
          const list = plumes(st.id + '/' + h.side, 3, 0.7);
          c.frame = frame;
          c.drop = [seat === 'left' ? 0 : aspect, seat === 'left' ? aspect : 0, BED, easeOut(entering)];
          if (clock.active && entering < 0.2) {
            const x = aspect * (i === 0 ? DUEL_X[0] : 1 - DUEL_X[0]), fall = entering / 0.2;
            sc.plumes.push({ x, y: S - 0.042 * (1 - fall * fall), r: 0.011, s: 1.6, col: i,
              phase: 0, top: S, kind: 4, squash: 0, lean: 0, stem: 0 });
          }
          bellDrops(c, i, h.side, clock, list);
          sc.digits.push(h.clock);
        });
        sc.split = { at: split, axis: 0, band: 0.011 };
      } else if (st) {
        const clock = v.clocks[0];
        const used = clock ? usedOf(clock) : 0;
        const total = clock ? Math.max(1, clock.total) : 1;
        if (st.type === 'break') {
          // Neutral ink sinks in the middle during the break.
          const c = column({ x0: 0, x1: aspect, ink: 'neutral', t: timeOf(used), front: frontOf(used / total), spread: 0,
            seedKey: 'break/' + st.id });
          rain(c, used / total, 0.30);
          sc.digits.push(m.clock);
          sc.text.push(m.head, m.motions);
        } else {
          const side = st.side === 'con' ? 'con' : 'pro';
          const left = (side === 'pro') === (seat === 'left');
          const c = column({ x0: 0, x1: aspect, seat: left ? 1 : -1, ink: side, t: timeOf(used), front: frontOf(used / total),
            seedKey: st.id + '/' + side });
          const list = plumes(st.id + '/' + side, 4, 0.8);
          rain(c, used / total);
          sc.text.push(m.head, ...m.top);
          bellDrops(c, 0, 'main', clock, list);
          if (clock && clock.phase === 'over') {
            // The time spilling over: a thread of the accent's ink falling from the surface at the seat, reaching the
            // bed in under two seconds and pooling there.
            const over = motionless ? 30 : (used - total) / 1000;
            sc.thread = { x: left ? 0.075 * aspect : aspect - 0.075 * aspect, over, reach: S + (BED - S) * clamp01(over / 1.8),
              beads: wrap(over * 0.45) * TAU, wobble: wrap(over * 0.05) * TAU };
          }
          sc.digits.push(m.clock);
        }
      }
      sc.text.push(m.next, m.progress);
      return sc;
    }

    function pack(sc) {
      const pal = palette;
      u.fill(0);
      const set = (name, i, values) => { for (let k = 0; k < values.length; k++) u[OFFSET[name] + i + k] = values[k]; };
      set('uRes', 0, [canvas.width, canvas.height]);
      set('uAspect', 0, [sc.aspect]);
      set('uDuel', 0, [sc.duel ? 1 : 0]);
      set('uAir', 0, pal.air); set('uTop', 0, pal.top); set('uDeep', 0, pal.deep);
      set('uSurface', 0, [pal.surface]);
      set('uSplit', 0, [sc.split.at, sc.split.axis, sc.split.band, sc.columns.length]);
      sc.columns.slice(0, 2).forEach((c, i) => {
        const ink = pal[c.ink] || pal.neutral;
        set('uColA', 4 * i, [c.top, c.front, c.frame ?? -1, c.amount]);
        set('uColB', 4 * i, [c.x0, c.x1, c.seat, c.veil]);
        set('uColC', 4 * i, [c.seed[0], c.seed[1], c.spread, c.flow]);
        set('uColD', 4 * i, c.drift);
        if (c.drop) set('uDrop', 4 * i, c.drop);
        set('uK', 3 * i, ink.K);
        set('uFloor', 3 * i, ink.floor);
        set('uFloorT', 3 * i, ink.floorText);
        set('uCaps', 2 * i, ink.caps);
      });
      if (sc.columns.length === 1) {   // a lone column's values on both sides of a split that is never crossed
        ['uColA', 'uColB', 'uColC', 'uColD', 'uDrop'].forEach(n => u.copyWithin(OFFSET[n] + 4, OFFSET[n], OFFSET[n] + 4));
        ['uK', 'uFloor', 'uFloorT'].forEach(n => u.copyWithin(OFFSET[n] + 3, OFFSET[n], OFFSET[n] + 3));
        u.copyWithin(OFFSET.uCaps + 2, OFFSET.uCaps, OFFSET.uCaps + 2);
      }
      set('uN', 0, [Math.min(NP, sc.plumes.length)]);
      sc.plumes.slice(0, NP).forEach((pl, i) => {
        set('uP', 4 * i, [pl.x, pl.y, pl.r, pl.s]);
        set('uQ', 4 * i, [pl.col, pl.phase, pl.top, pl.kind]);
        set('uW', 4 * i, [pl.squash, pl.lean, pl.stem, 0]);
      });
      const digits = sc.digits.filter(Boolean), text = sc.text.filter(Boolean);
      digits.concat(text).slice(0, NB).forEach((b, i) => set('uBox', 4 * i, b));
      set('uDigits', 0, [digits.length]);
      sc.ripples.slice(0, NR).forEach((r, i) => set('uRipple', 4 * i, [r.x, r.age, r.amp, 0]));
      if (sc.thread) {
        set('uThread', 0, [sc.thread.x, sc.thread.over, 1, sc.thread.reach]);
        set('uThreadB', 0, [sc.thread.beads, sc.thread.wobble, 0, 0]);
      }
      set('uKThread', 0, pal.accent.K);
    }

    function draw(values) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(uNoise, 0);
      const left = values[OFFSET.uColA + 2], right = values[OFFSET.uColA + 6];
      const tank = values[OFFSET.uDuel] ? duelTank : singleTank;
      const frames = [Math.floor(left), Math.ceil(left), Math.floor(right), Math.ceil(right)];
      frames.forEach((frame, i) => {
        // The previous upper neighbour becomes the next lower one. Rebind its existing texture.
        const slot = frame < 0 ? inkTextures[0] : inkTextures.find(s => s.tank === tank && s.frame === frame) ||
          inkTextures.find(s => s.tank !== tank || s.frame < 0 || !frames.includes(s.frame));
        gl.activeTexture(gl.TEXTURE1 + i);
        gl.bindTexture(gl.TEXTURE_2D, slot.texture);
        gl.uniform1i(inkSamplers[i], i + 1);
        if (frame >= 0 && (frame !== slot.frame || slot.tank !== tank)) {
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, tank === duelTank);
          gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, dropMask(frame, i < 2 || tank === duelTank ? 0 : 1, tank));
          slot.tank = tank;
          slot.frame = frame;
        }
      });
      LAYOUT.forEach(([name, n]) => {
        const at = OFFSET[name], l = loc[name];
        if (!l) return;
        if (n === 1) gl.uniform1f(l, values[at]);
        else if (name === 'uRes' || name === 'uCaps') gl.uniform2fv(l, values.subarray(at, at + n));
        else if (VEC3.indexOf(name) >= 0) gl.uniform3fv(l, values.subarray(at, at + n));
        else gl.uniform4fv(l, values.subarray(at, at + n));
      });
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    return {
      frame(v, now) {
        if (!W || !H || !v) return;
        if (gl.isContextLost()) throw new Error('墨：WebGL 的画布丢了');
        const el = stageEl();
        if (!el) return;
        const key = v.mode + '|' + (v.stage ? v.stage.id : '');
        if (key !== lastKey) {
          // A new stage is a new tank: its drops fall in as it comes in (never in a still), and its bells are gone.
          openingFrame = !still && lastKey === 'title|' && v.mode === 'stage' ? drawn : null;
          lastKey = key;
          enterAt = !still && el.classList.contains('is-entering') ? now : null;
          bells = [];
        }
        if (enterAt !== null && now - enterAt > ENTER_MS) enterAt = null;
        const active = v.clocks.find(c => c.active) || v.clocks[0];
        const sig = [v.mode, el.getAttribute('data-kind'), el.getAttribute('data-side'), active ? active.phase : ''].join('|');
        if (!palette || sig !== paletteSig) { palette = readPalette(el); paletteSig = sig; }
        pack(scene(v, layoutOf(el, v, now), now));
        if (openingFrame && enterAt !== null) {
          draw(openingFrame);
          gl.enable(gl.BLEND);
          const p = clamp01((now - enterAt) / ENTER_MS);
          gl.blendColor(0, 0, 0, p * p * (3 - 2 * p));
          gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA);
          draw(u);
          gl.disable(gl.BLEND);
        } else {
          if (!openingFrame && drawn && drawn.every((x, i) => x === u[i])) return;
          openingFrame = null;
          draw(u);
        }
        drawn = Float32Array.from(u);
      },
      resize(w, h) {
        W = w; H = h;
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const rows = h * ratio;
        const want = Math.max(Math.min(rows, MIN_ROWS), Math.min(rows * RES, MAX_ROWS));
        const k = flags && flags.thumbnail ? ratio : want / Math.max(1, h);
        canvas.width = Math.max(1, Math.round(w * k));
        canvas.height = Math.max(1, Math.round(h * k));
        palette = null;
        layout.m = null;
        drawn = null;
        openingFrame = null;
      },
      bell(event) {
        const ms = pointOf(event);
        if (ms === null || still) return;
        const id = event.clock || 'main';
        if (bells.some(b => b.clock === id && b.ms === ms)) return;
        bells.push({ clock: id, ms, type: event.type });
      },
      destroy() {
        drawn = null;
        try {
          const tanks = --consumers === 0 ? [singleTank, duelTank] : [duelTank];
          for (const tank of tanks) {
            tank.sources.forEach(source => { if (source) closeSource(source); });
            tank.sources.fill(null);
            tank.masks.clear();
          }
          inkTextures.forEach(slot => gl.deleteTexture(slot.texture));
          gl.deleteTexture(tex);
          gl.deleteBuffer(buf);
          gl.deleteProgram(prog);
          const lose = gl.getExtension('WEBGL_lose_context');
          if (lose) lose.loseContext();
        } catch (e) { /* it is going anyway */ }
      },
    };
  }

  // ---- the seals and the title card's dabs ----

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

  // A drop of ink's soft, uneven rim, for the dabs that mark each motion on the title card and the stroke between
  // the teams.
  const DROP = '<filter id="dt-ink-drop" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB">' +
    '<feTurbulence type="fractalNoise" baseFrequency=".3" numOctaves="2" seed="3" result="fibre"/>' +
    '<feDisplacementMap in="SourceGraphic" in2="fibre" scale="4.5" xChannelSelector="R" yChannelSelector="G"/>' +
    '</filter>';

  DT.themes.register('ink', {
    context: 'webgl',
    frameInterval: 0,
    followsClock: true,
    painter,
    defs: '<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>' + SEAL + DROP + '</defs></svg>',
  });
})(window.DT = window.DT || {});
