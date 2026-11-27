import { createLandscape } from './landscape.js';
import { climbTimeline } from './timeline.js';
import { createFrameClock } from './frame-clock.js';

const $ = selector => document.querySelector(selector);
const params = new URLSearchParams(location.search);
const format = window.DT.BUILTIN_FORMATS.find(f => f.id === 'ustc-chongxiao-cup');
const timeline = climbTimeline(format);
let elapsed = Math.max(0,Math.min(1, Number(params.get('p')) || 0)) * timeline.duration;
let speed = Number($('#speed').value), motion = elapsed/speed;
let playing = params.get('still') !== '1' && !matchMedia('(prefers-reduced-motion: reduce)').matches;
let snap = true, refresh = true, seeking = false, frame = 0;
const svg = $('#scene'), seek = $('#seek');
const cache = new Map();
const cameraState = {};
const draw = createLandscape(svg,cameraState);
const frameClock = createFrameClock();

function clock(seconds) {
  const n = Math.max(0,Math.floor(seconds));
  return String(Math.floor(n/60)).padStart(2,'0') + ':' + String(n%60).padStart(2,'0');
}
function setText(selector, content) {
  if (cache.get(selector) === content) return;
  $(selector).textContent = content; cache.set(selector,content);
}
function redraw(immediate = false) {
  refresh = true; snap ||= immediate;
  if (!frame && !document.hidden) frame = requestAnimationFrame(tick);
}
function paintControls(state) {
  const done = state.finished;
  const labelSide = done ? '完赛' : state.side === 'pro' ? '正方' : state.side === 'con' ? '反方' : '休息';
  const stageName = state.stage.startsWith(labelSide) ? state.stage.slice(labelSide.length) : state.stage;
  setText('#stage', done ? '两队登顶' : stageName);
  setText('#side',labelSide);
  setText('#remaining', clock(Math.ceil(state.remaining)));
  $('.stage').dataset.urgent = !done && Boolean(state.side) && state.remaining <= 30;
  $('.stage').dataset.side = done || !state.side ? 'break' : state.side;
  for (const side of ['pro','con']) setText('#'+side+'-used',clock(state.used[side]));
  setText('#elapsed',clock(elapsed));
  seek.value = Math.round(10000 * elapsed/timeline.duration);
  seek.setAttribute('aria-valuetext', clock(elapsed)+' / '+clock(timeline.duration));
  const label = playing ? '暂停预演' : done ? '重新预演' : '播放预演';
  if ($('#play').title !== label || !cache.has('play')) {
    $('#play').setAttribute('aria-label',label); $('#play').title = label;
    $('#play-icon').setAttribute('d', playing ? 'M7 5h3v14H7zm7 0h3v14h-3z' : 'M7 4l13 8-13 8z');
    cache.set('play',true);
  }
}
function autoShot(state) {
  if (state.finished || !state.side) return 'wide';
  const phase = motion % 26;
  return phase < 6 || phase >= 20 ? 'wide' : state.side;
}
function tick(now) {
  frame = 0;
  if (document.hidden) { frameClock.reset(); return; }
  const dt = frameClock.sample(now,refresh);
  if (dt === null) { frame=requestAnimationFrame(tick); return; }
  if (playing && !seeking) {
    motion += dt;
    elapsed = Math.min(timeline.duration,elapsed+dt*speed);
    if (elapsed >= timeline.duration) playing = false;
  }
  const state = timeline.at(elapsed,speed);
  cameraState.autoFollowObstacles = state.finished ? null : state.side;
  paintControls(state);
  draw(state.progress,motion,{ pro:!state.finished && state.side === 'pro', con:!state.finished && state.side === 'con' },
    autoShot(state),dt,snap,{pro:timeline.totals.pro/speed,con:timeline.totals.con/speed},state.footprintClock);
  snap = false; refresh = false;
  if (playing || cameraState.travel) frame=requestAnimationFrame(tick);
  else frameClock.reset();
}
function toggle() {
  if (!playing && elapsed >= timeline.duration) { elapsed=0; motion=0; snap=true; }
  playing = !playing; frameClock.reset(); redraw();
}
$('#play').addEventListener('click',toggle);
$('#speed').addEventListener('change',e => { speed=Number(e.target.value); redraw(); });
seek.addEventListener('pointerdown',() => { seeking=true; });
window.addEventListener('pointerup',() => { seeking=false; });
window.addEventListener('pointercancel',() => { seeking=false; });
seek.addEventListener('input',() => {
  elapsed = Number(seek.value)/10000*timeline.duration;
  motion = elapsed/speed; frameClock.reset(); redraw(true);
});
document.addEventListener('keydown',e => {
  if (e.code === 'Space' && !e.repeat && (e.target === document.body || e.target === svg)) {
    e.preventDefault(); toggle();
  }
});
$('#full').addEventListener('click',async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch { /* The embedding browser may handle fullscreen itself. */ }
});
document.addEventListener('fullscreenchange',() => {
  $('#full').setAttribute('aria-label',document.fullscreenElement ? '退出全屏' : '全屏预览');
  redraw(!playing);
});
document.addEventListener('visibilitychange',() => {
  frameClock.reset();
  if (document.hidden) { cancelAnimationFrame(frame); frame=0; } else redraw();
});
window.addEventListener('resize',() => redraw(!playing));
setText('#duration',clock(timeline.duration));
setText('#format',format.name);
for (const side of ['pro','con']) setText('#'+side+'-total','/ '+clock(timeline.totals[side]));
redraw(true);
