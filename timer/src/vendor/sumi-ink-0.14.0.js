/* TenguByte Sumi v0.14.0, github.com/tengubyte/sumi @ 19c6ef8dbd20c156374c475e0190b6c8e8cd2985.
   Original side-view fluid and traced renderers, bundled with esbuild 0.25.12.
   Upstream entry points: copy src/core/inkDrop.ts to src/core/timerInkSide.ts in that checkout and append:
   export function tracedSide(canvas, gl, drops, options, run) { return tracedPainter(canvas, gl, DROP_FRAGMENT, drops, options, run); }
   Bundle the following two exports from stdin with --bundle --format=iife --global-name=SumiInk --target=es2020 --charset=utf8:
   export { fluidPainter } from "./src/core/dropFluid.ts"; export { tracedSide } from "./src/core/timerInkSide.ts";
   Local adaptation: the traced side renderer sizes its drop uniforms and accepts updated entry times for a live debate.

MIT License

Copyright (c) 2026 TenguByte

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
var SumiInk = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target2, all) => {
    for (var name in all)
      __defProp(target2, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // <stdin>
  var stdin_exports = {};
  __export(stdin_exports, {
    fluidPainter: () => fluidPainter,
    tracedSide: () => tracedSide
  });

  // src/core/noiseGlsl.ts
  var NOISE_GLSL = `
float hash2(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise2(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}
float clamp01(float x) {
  return clamp(x, 0.0, 1.0);
}
`;

  // src/core/fluidGlsl.ts
  var FLUID_VERTEX = `
attribute vec2 corner;
uniform vec2 texel;
varying vec2 uv, l, r, t, b;
void main() {
  uv = corner * 0.5 + 0.5;
  l = uv - vec2(texel.x, 0.0);
  r = uv + vec2(texel.x, 0.0);
  t = uv + vec2(0.0, texel.y);
  b = uv - vec2(0.0, texel.y);
  gl_Position = vec4(corner, 0.0, 1.0);
}`;
  var HEAD = `
precision highp float;
varying vec2 uv, l, r, t, b;
`;
  var ADVECT = `${HEAD}
uniform sampler2D vel, src;
uniform float dt, decay, aspect;
void main() {
  vec2 v = texture2D(vel, uv).xy;
  gl_FragColor = decay * texture2D(src, uv - dt * vec2(v.x / aspect, v.y));
}`;
  var CURL = `${HEAD}
uniform sampler2D vel;
uniform float h;
void main() {
  float c = texture2D(vel, r).y - texture2D(vel, l).y - texture2D(vel, t).x + texture2D(vel, b).x;
  gl_FragColor = vec4(c / (2.0 * h), 0.0, 0.0, 1.0);
}`;
  var FORCE = `${HEAD}
uniform sampler2D vel, curl, ink;
uniform float dt, eps, sink, h;
void main() {
  float c = texture2D(curl, uv).x;
  vec2 n = vec2(abs(texture2D(curl, t).x) - abs(texture2D(curl, b).x), abs(texture2D(curl, r).x) - abs(texture2D(curl, l).x));
  n /= length(n) + 1e-4;
  vec2 v = texture2D(vel, uv).xy + dt * eps * h * c * vec2(n.x, -n.y);
  v.y -= dt * sink * texture2D(ink, uv).a;
  gl_FragColor = vec4(v, 0.0, 1.0);
}`;
  var DIVERGENCE = `${HEAD}
uniform sampler2D vel;
uniform float h;
void main() {
  vec2 c = texture2D(vel, uv).xy;
  float L = l.x < 0.0 ? -c.x : texture2D(vel, l).x;
  float R = r.x > 1.0 ? -c.x : texture2D(vel, r).x;
  float T = t.y > 1.0 ? -c.y : texture2D(vel, t).y;
  float B = b.y < 0.0 ? -c.y : texture2D(vel, b).y;
  gl_FragColor = vec4((R - L + T - B) / (2.0 * h), 0.0, 0.0, 1.0);
}`;
  var JACOBI = `${HEAD}
uniform sampler2D p, div;
uniform float h;
void main() {
  float s = texture2D(p, l).x + texture2D(p, r).x + texture2D(p, t).x + texture2D(p, b).x;
  gl_FragColor = vec4((s - h * h * texture2D(div, uv).x) * 0.25, 0.0, 0.0, 1.0);
}`;
  var PROJECT = `${HEAD}
uniform sampler2D p, vel;
uniform float h;
void main() {
  vec2 g = vec2(texture2D(p, r).x - texture2D(p, l).x, texture2D(p, t).x - texture2D(p, b).x) / (2.0 * h);
  gl_FragColor = vec4(texture2D(vel, uv).xy - g, 0.0, 1.0);
}`;
  var SPLAT = `${HEAD}
${NOISE_GLSL}
uniform sampler2D src;
uniform vec2 at;
uniform float aspect, radius, rough, seed;
uniform vec4 add;
void main() {
  vec2 e = uv - at;
  e.x *= aspect;
  float g = exp(-dot(e, e) / (radius * radius));
  float n = mix(1.0, 0.4 + 1.2 * fbm(uv * vec2(aspect, 1.0) * 40.0 + seed), rough);
  gl_FragColor = texture2D(src, uv) + add * g * n;
}`;
  var SHOW = `${HEAD}
uniform sampler2D ink;
uniform float strength, aspect;
void main() {
  vec4 i = texture2D(ink, uv);
  float d = max(i.a, 0.0);
  float wall = min(min(uv.x, 1.0 - uv.x) * aspect, min(uv.y, 1.0 - uv.y));
  float a = (1.0 - exp(-strength * d)) * smoothstep(0.0, 0.06, wall);
  gl_FragColor = vec4(clamp(i.rgb / max(d, 1e-4), 0.0, 1.0) * a, a);
}`;

  // src/core/webgl.ts
  function compile(gl, type, source) {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) === true) return shader;
    gl.deleteShader(shader);
    return null;
  }
  function linkProgram(gl, vertexSource, fragmentSource) {
    const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
    if (!vertex || !fragment) return null;
    const program2 = gl.createProgram();
    gl.attachShader(program2, vertex);
    gl.attachShader(program2, fragment);
    gl.linkProgram(program2);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (gl.getProgramParameter(program2, gl.LINK_STATUS) === true) return program2;
    gl.deleteProgram(program2);
    return null;
  }
  function fitCanvas(gl, canvas, maxPixels = Infinity) {
    const area = Math.max(canvas.clientWidth * canvas.clientHeight, 1);
    const scale = Math.min(window.devicePixelRatio, 2, Math.sqrt(maxPixels / area));
    const width = Math.max(1, Math.round(canvas.clientWidth * scale));
    const height = Math.max(1, Math.round(canvas.clientHeight * scale));
    if (canvas.width === width && canvas.height === height) return false;
    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, width, height);
    return true;
  }
  var COVER_VERTEX = `
attribute vec2 corner;
void main() {
  gl_Position = vec4(corner, 0.0, 1.0);
}`;
  function coverProgram(gl, fragmentSource) {
    const program2 = linkProgram(gl, COVER_VERTEX, fragmentSource);
    if (!program2) return null;
    gl.useProgram(program2);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const corner = gl.getAttribLocation(program2, "corner");
    gl.enableVertexAttribArray(corner);
    gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
    return (name) => gl.getUniformLocation(program2, name);
  }
  function drawCover(gl) {
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // src/core/fluid.ts
  var Pair = class {
    constructor(read, write) {
      this.read = read;
      this.write = write;
    }
    swap() {
      [this.read, this.write] = [this.write, this.read];
    }
  };
  var PASSES = { advect: ADVECT, curl: CURL, force: FORCE, divergence: DIVERGENCE, jacobi: JACOBI, project: PROJECT, splat: SPLAT, show: SHOW };
  var VELOCITY_ROWS = 160;
  var INK_ROWS = 640;
  var PRESSURE_STEPS = 24;
  function target(gl, type, width, height) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, type, null);
    const buffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, buffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    if (complete) {
      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return complete ? { texture, buffer, width, height } : null;
  }
  function program(gl, fragment) {
    const linked = linkProgram(gl, FLUID_VERTEX, fragment);
    if (!linked) return null;
    const found = /* @__PURE__ */ new Map();
    const at = (name) => {
      if (!found.has(name)) found.set(name, gl.getUniformLocation(linked, name));
      return found.get(name) ?? null;
    };
    return [linked, at];
  }
  var Fluid = class _Fluid {
    constructor(gl, programs, fields, aspect) {
      this.gl = gl;
      this.programs = programs;
      this.fields = fields;
      this.aspect = aspect;
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    }
    /** Null when the device cannot render to and filter half-float textures, or the shaders fail. */
    static open(gl, aspect) {
      const half = gl.getExtension("OES_texture_half_float");
      if (!half || !gl.getExtension("OES_texture_half_float_linear")) return null;
      gl.getExtension("EXT_color_buffer_half_float");
      const programs = {};
      for (const [pass, source] of Object.entries(PASSES)) {
        const made = program(gl, source);
        if (!made) return null;
        programs[pass] = made;
      }
      const make = (rows) => target(gl, half.HALF_FLOAT_OES, Math.max(1, Math.round(rows * aspect)), rows);
      const [a, b] = [make(INK_ROWS), make(INK_ROWS)];
      const [c, d, e, f, g, h] = Array.from({ length: 6 }, () => make(VELOCITY_ROWS));
      if (!a || !b || !c || !d || !e || !f || !g || !h) return null;
      const fields = { ink: new Pair(a, b), velocity: new Pair(c, d), pressure: new Pair(e, f), divergence: g, curl: h };
      return new _Fluid(gl, programs, fields, aspect);
    }
    /** A soft blob at `at` (shares of the canvas, y up), `radius` in canvas heights. */
    splat(field, at, radius, add, rough = 0, seed = 0) {
      const pair = this.fields[field];
      this.run("splat", pair.write, { src: pair.read, at, aspect: this.aspect, radius, rough, seed, add });
      pair.swap();
    }
    step(dt, flow) {
      const { velocity, pressure, ink, divergence, curl } = this.fields;
      const { aspect } = this;
      const h = 1 / VELOCITY_ROWS;
      this.run("curl", curl, { vel: velocity.read, h });
      this.run("force", velocity.write, { vel: velocity.read, curl, ink: ink.read, dt, h, eps: flow.curl, sink: flow.sink });
      velocity.swap();
      this.run("divergence", divergence, { vel: velocity.read, h });
      for (let i = 0; i < PRESSURE_STEPS; i++) {
        this.run("jacobi", pressure.write, { p: pressure.read, div: divergence, h });
        pressure.swap();
      }
      this.run("project", velocity.write, { p: pressure.read, vel: velocity.read, h });
      velocity.swap();
      this.run("advect", velocity.write, { vel: velocity.read, src: velocity.read, dt, decay: flow.velocityDecay, aspect });
      velocity.swap();
      this.run("advect", ink.write, { vel: velocity.read, src: ink.read, dt, decay: flow.inkDecay, aspect });
      ink.swap();
    }
    /** Draws the ink to the canvas as premultiplied colour. */
    show(strength) {
      this.run("show", null, { ink: this.fields.ink.read, strength, aspect: this.aspect });
    }
    run(pass, out, uniforms) {
      const { gl } = this;
      const [linked, at] = this.programs[pass];
      gl.useProgram(linked);
      const corner = gl.getAttribLocation(linked, "corner");
      gl.enableVertexAttribArray(corner);
      gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
      let unit = 0;
      for (const [name, value] of Object.entries(uniforms)) {
        if (typeof value === "number") gl.uniform1f(at(name), value);
        else if (!(value instanceof Float32Array)) {
          gl.activeTexture(gl.TEXTURE0 + unit);
          gl.bindTexture(gl.TEXTURE_2D, value.texture);
          gl.uniform1i(at(name), unit++);
        } else if (value.length === 2) gl.uniform2fv(at(name), value);
        else gl.uniform4fv(at(name), value);
      }
      const width = out ? out.width : gl.drawingBufferWidth;
      const height = out ? out.height : gl.drawingBufferHeight;
      gl.uniform2f(at("texel"), 1 / width, 1 / height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, out ? out.buffer : null);
      gl.viewport(0, 0, width, height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  };

  // src/core/random.ts
  function random(seed) {
    let a = Math.floor(seed * 1e3) >>> 0;
    return () => {
      a = a + 1831565813 >>> 0;
      let t = a;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // src/core/splatShader.ts
  function rgb(hex) {
    const n = /^#[0-9a-f]{6}$/i.test(hex) ? parseInt(hex.slice(1), 16) : 0;
    return [(n >> 16) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  }

  // src/core/dropFluid.ts
  var STEP = 1 / 60;
  var STRENGTH = 4;
  var vec = (...values) => Float32Array.from(values);
  function land(fluid, drop, ink, seed, swirl) {
    const [x, top] = drop;
    const y = 1 - top;
    fluid.splat("ink", vec(x, y), 0.035, vec(...ink.map((c) => c * 1.4), 1.4), 0.6, seed);
    fluid.splat("velocity", vec(x, y + 0.01), 0.03, vec(0, -0.12, 0, 0));
    const jitter = 0.01 * swirl;
    for (let k = 0; k < 6; k++) {
      const at = vec(x + Math.sin(seed * 13 + k * 7.1) * 0.12, y - 0.05 - 0.08 * k + Math.cos(seed * 5 + k * 3.3) * 0.08);
      fluid.splat("velocity", at, 0.02, vec(Math.sin(k * 2.1 + seed) * jitter, Math.cos(k * 1.7 + seed) * jitter, 0, 0));
    }
  }
  function fluidPainter(canvas, gl, drops, options, run) {
    fitCanvas(gl, canvas);
    const aspect = Math.min(Math.max(canvas.clientWidth / Math.max(canvas.clientHeight, 1), 0.25), 4);
    const fluid = Fluid.open(gl, aspect);
    if (!fluid) return null;
    const seed = random(options.seed ?? 1)() * 50;
    const swirl = Math.min(Math.max(options.swirl ?? 0.6, 0), 2);
    const speed = Math.max(options.speed ?? 1, 0.05);
    const inks = drops.map(([, , , color]) => rgb(color ?? options.color ?? "#161314"));
    const flow = { curl: 10 * swirl, sink: 2, velocityDecay: 0.99, inkDecay: 0.9995 };
    let clock = 0;
    const landed = /* @__PURE__ */ new Set();
    const advance = (until) => {
      while (clock < until) {
        drops.forEach((drop, i) => {
          if (landed.has(i) || clock < (drop[2] ?? 0)) return;
          landed.add(i);
          land(fluid, drop, inks[i] ?? [0, 0, 0], seed + i * 1.7, swirl);
        });
        fluid.step(STEP, flow);
        clock += STEP;
      }
    };
    return {
      duration: run / speed,
      draw(seconds) {
        fitCanvas(gl, canvas);
        advance(Math.min(seconds * speed, run));
        fluid.show(STRENGTH);
      },
      dispose() {
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      }
    };
  }

  // src/core/dropGlsl.ts
  var DROP_FRAGMENT = `
precision highp float;
uniform vec2 size;
uniform float time;
uniform float seed;
uniform float swirl;
uniform vec4 drops[DROP_SLOTS];
uniform vec3 colors[DROP_SLOTS];
${NOISE_GLSL}
const float A = 0.05;
const float RC = 0.065;
const float G0 = 0.18;
const float T = 3.0;
const float SPREAD = 0.5;
const int K = 16;

// Value noise and its gradient from one look at four corners.
vec2 noiseGrad(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  vec2 du = 6.0 * f * (1.0 - f);
  float a = hash2(i);
  float b = hash2(i + vec2(1.0, 0.0));
  float c = hash2(i + vec2(0.0, 1.0));
  float k = a - b - c + hash2(i + vec2(1.0, 1.0));
  return du * vec2(b - a + k * u.y, c - a + k * u.x);
}

// How far the ring has sunk s seconds after landing. It widens as it slows, a = A (1 + SPREAD u) with
// u = 1 - exp(-s / T), and moves at the speed each core induces at the other, g / (4 pi a).
float sunk(float s) {
  return G0 * T / (12.566 * A * SPREAD) * log(1.0 + SPREAD * (1.0 - exp(-s / T))) * (1.0 - exp(-4.0 * A * A / (RC * RC)));
}

vec2 ringFlow(vec2 p, vec4 d, float tau, float aspect) {
  float s = tau - d.z;
  if (d.w < 0.5 || s < 0.0) return vec2(0.0);
  float a = A * (1.0 + SPREAD * (1.0 - exp(-s / T)));
  float g = G0 * exp(-s / T);
  vec2 r = p - vec2(d.x * aspect, d.y + sunk(s));
  vec2 v = vec2(0.0);
  for (int k = 0; k < 2; k++) {
    float sg = k == 0 ? 1.0 : -1.0;
    vec2 q = r + vec2(sg * a, 0.0);
    float r2 = dot(q, q) + 1e-6;
    v += sg * g / (6.2832 * r2) * (1.0 - exp(-r2 / (RC * RC))) * vec2(-q.y, q.x);
  }
  return v;
}

vec2 velocity(vec2 p, float tau, float aspect) {
  vec2 v = vec2(0.0);
  for (int j = 0; j < DROP_SLOTS; j++) v += ringFlow(p, drops[j], tau, aspect);
  // Where the water moves, a curl of noise frays it. A curl has no divergence, so ink never bunches up.
  vec2 o = vec2(seed, tau * 0.25);
  vec2 grad = 10.0 * noiseGrad(p * 10.0 + o) + 10.0 * noiseGrad(p * 20.0 - o);
  return v + swirl * (0.002 + 0.6 * length(v)) * vec2(grad.y, -grad.x) * 0.06;
}

float blob(vec2 q, vec4 d, float aspect, float age) {
  vec2 t = q - vec2(d.x * aspect, d.y);
  float w = 0.006 + 0.018 * age;
  float body = smoothstep(0.055 + w, 0.055 - w, length(t));
  // A thin stem where the drop went in.
  float stem = 0.3 * smoothstep(0.004 + 0.3 * w, 0.0, abs(t.x)) * smoothstep(-0.04, -0.01, t.y) * step(t.y, 0.0);
  return max(body, stem);
}

void main() {
  float aspect = size.x / size.y;
  vec2 p = vec2(gl_FragCoord.x / size.y, 1.0 - gl_FragCoord.y / size.y);
  // Ink only ever reaches a box round each drop's path, so the rest of the canvas skips the trace.
  bool near = false;
  for (int j = 0; j < DROP_SLOTS; j++) {
    vec4 d = drops[j];
    vec2 r = p - vec2(d.x * aspect, d.y);
    near = near || (d.w > 0.5 && time >= d.z && abs(r.x) < 0.24 && r.y > -0.12 && r.y < sunk(time - d.z) + 0.22);
  }
  if (!near) {
    gl_FragColor = vec4(0.0);
    return;
  }
  // The swirl is fastest just after landing and dies away, so steps are packed toward the start: equal
  // steps in 1 - exp(-t / T), each taken at its midpoint.
  float span = 1.0 - exp(-time / T);
  vec2 q = p;
  float tau = time;
  float got[DROP_SLOTS];
  for (int j = 0; j < DROP_SLOTS; j++) got[j] = -1.0;
  for (int k = 0; k < K; k++) {
    float next = -T * log(1.0 - (1.0 - float(k + 1) / float(K)) * span);
    float h = tau - next;
    vec2 mid = q - 0.5 * h * velocity(q, tau, aspect);
    q -= h * velocity(mid, tau - 0.5 * h, aspect);
    tau = next;
    for (int j = 0; j < DROP_SLOTS; j++) {
      vec4 d = drops[j];
      if (d.w > 0.5 && time >= d.z && got[j] < 0.0 && tau <= d.z + 1e-4) {
        got[j] = blob(q, d, aspect, time - d.z);
      }
    }
  }
  vec4 col = vec4(0.0);
  for (int j = 0; j < DROP_SLOTS; j++) {
    float rho = max(got[j], 0.0);
    // The ink thins as it spreads, from near black to a grey wash.
    float sigma = 3.5 * (0.3 + 0.7 * exp(-max(time - drops[j].z, 0.0) / 3.0));
    float a = (1.0 - exp(-sigma * rho)) * 0.97;
    col = vec4(colors[j] * a, a) + col * (1.0 - a);
  }
  gl_FragColor = col;
}`;

  // src/core/timerInkSide.ts
  var MAX_PIXELS = 5e5;
  function tracedPainter(canvas, gl, fragment, drops, options, run, look) {
    const at = coverProgram(gl, "#define DROP_SLOTS " + drops.length + "\n" + fragment);
    if (!at) return null;
    const packed = new Float32Array(4 * drops.length);
    const colors = new Float32Array(3 * drops.length);
    drops.forEach(([x, y, start = 0, color], i) => {
      packed.set([x, y, Math.max(start, 0), 1], i * 4);
      colors.set(rgb(color ?? options.color ?? "#161314"), i * 3);
    });
    const uDrops = at("drops");
    gl.uniform4fv(uDrops, packed);
    gl.uniform3fv(at("colors"), colors);
    gl.uniform1f(at("seed"), random(options.seed ?? 1)() * 50);
    gl.uniform1f(at("swirl"), Math.min(Math.max(options.swirl ?? 0.6, 0), 2));
    if (look) gl.uniform3fv(at("look"), look);
    const speed = Math.max(options.speed ?? 1, 0.05);
    const uSize = at("size");
    const uTime = at("time");
    return {
      updateStarts() {
        drops.forEach((drop, i) => { packed[i * 4 + 2] = drop[2]; });
        gl.uniform4fv(uDrops, packed);
      },
      duration: run / speed,
      draw(seconds) {
        fitCanvas(gl, canvas, MAX_PIXELS);
        gl.uniform2f(uSize, canvas.width, canvas.height);
        gl.uniform1f(uTime, Math.min(Math.max(seconds * speed, 1e-4), run));
        drawCover(gl);
      },
      dispose() {
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      }
    };
  }
  function tracedSide(canvas, gl, drops, options, run) {
    return tracedPainter(canvas, gl, DROP_FRAGMENT, drops, options, run);
  }
  return __toCommonJS(stdin_exports);
})();
