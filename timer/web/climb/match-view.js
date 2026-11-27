import { createLandscape } from './landscape.js';
import { createFrameClock } from './frame-clock.js';

const sides = ['pro', 'con', 'neutral'];
const sideNames = { pro: '正方', con: '反方', neutral: '环节计时' };
const atRest = { pro: false, con: false };

function speakingTime(used) { return (used.pro || 0) + (used.con || 0); }

function clockPanel(side) {
  return `<section class="climb-clock" data-side="${side}" hidden>
    <div class="climb-clock-label"><b class="climb-side">${sideNames[side]}</b>
      <span class="climb-team"></span><span class="climb-clock-state"></span></div>
    <div class="climb-time" role="timer" aria-live="off"></div>
  </section>`;
}

function text(node, value) {
  if (node.textContent !== value) node.textContent = value;
}

function attr(node, key, value) {
  if (node.getAttribute(key) !== value) node.setAttribute(key, value);
}

function clockState(phase, clockPhase, active, value) {
  if (clockPhase === 'over' || value.startsWith('+')) return '超时';
  if (clockPhase === 'done' || phase === 'done') return '时间到';
  if (phase === 'paused' && active) return '暂停';
  if (phase === 'ready' && active) return '待开始';
  if (clockPhase === 'count' || clockPhase === 'warn') return '即将到时';
  return '';
}

export function createMatchView(host) {
  const doc = host.ownerDocument, win = doc.defaultView, stage = host.parentElement;
  host.classList.add('dt-climb-host');
  host.dataset.style = 'poster';
  host.innerHTML = `<svg class="climb-match-scene" aria-hidden="true" focusable="false">
    <g id="horizon" data-layer="horizon"></g><g id="mountain" data-layer="mountain" stroke-linejoin="round"></g>
    <g id="tracks" data-layer="tracks"></g><g id="parties" data-layer="parties"></g>
  </svg><div class="climb-round"><strong></strong><span></span></div>
  <div class="climb-readouts">${sides.map(clockPanel).join('')}</div>`;
  const scene = host.querySelector('.climb-match-scene');
  const round = host.querySelector('.climb-round');
  const readouts = host.querySelector('.climb-readouts');
  const panels = sides.map(side => {
    const box = readouts.querySelector(`[data-side="${side}"]`);
    return { side, box, name:box.querySelector('.climb-team'), state:box.querySelector('.climb-clock-state'),
      time:box.querySelector('.climb-time') };
  });
  const motionPreference = win.matchMedia('(prefers-reduced-motion: reduce)');
  const camera = { cameraTime:0 };
  const frameClock = createFrameClock();
  let data, draw, raf = 0, wake = 0, snap = true, visible = true, destroyed = false;
  let previousKey = '', previousPose = '', previousShot = 'wide', visualTime = null, settleUntil = 0;
  let restStart = 0, restShot = 'wide', lastSpeaker = 'pro', shotCycleStart = 0;

  function paintHud() {
    const card = data.phase === 'title' || data.phase === 'ended';
    const assigned = data.stageSide || data.active;
    const singleSide = assigned === 'pro' || assigned === 'con' ? assigned : 'neutral';
    const stageName = data.stage || '';
    text(round.firstElementChild, card ? '' : stageName);
    text(round.lastElementChild, card ? '' : data.speaker || '');
    attr(readouts, 'data-layout', data.dual ? 'dual' : 'single');
    for (const panel of panels) {
      const { side, box } = panel;
      const shown = !card && (data.dual ? side !== 'neutral' : side === singleSide);
      if (box.hidden === shown) box.hidden = !shown;
      if (!shown) continue;
      const active = data.dual ? data.phase !== 'done' && data.active === side : true;
      const value = (data.dual ? data.clocks[side] : data.mainClock || data.clocks[side]) || '';
      const urgency = data.clockPhases?.[data.dual ? side : 'main'] || '';
      const name = side === 'neutral' ? '' : data.teams?.[side] || '';
      const state = data.clockStates?.[data.dual ? side : 'main'] || clockState(data.phase, urgency, active, value);
      text(panel.name, name === sideNames[side] ? '' : name);
      text(panel.state, state);
      if (panel.time.textContent.length !== value.length) {
        box.style.setProperty('--time-chars', Math.max(value.length, 1));
      }
      text(panel.time, value);
      attr(box, 'data-active', active ? 'true' : 'false');
      attr(box, 'data-urgency', value.startsWith('+') ? 'over' : urgency);
      const label = side === 'neutral' ? stageName || '本环节' : sideNames[side];
      attr(panel.time, 'aria-label', label + '计时 ' + value);
    }
  }

  function schedule() {
    if (wake) { win.clearTimeout(wake); wake = 0; }
    if (!destroyed && data && visible && !doc.hidden && !raf) raf = win.requestAnimationFrame(paint);
  }

  function paint(now) {
    raf = 0;
    if (destroyed || !data || !visible || doc.hidden) return;
    const elapsed = frameClock.sample(now,snap);
    if (elapsed === null) { schedule(); return; }
    if (!scene.clientWidth || !scene.clientHeight) { frameClock.reset(); return; }
    const dt = Math.min(.18,elapsed);
    const still = data.still || motionPreference.matches;
    if (data.used) camera.cameraTime = speakingTime(data.used);
    else if (data.running) camera.cameraTime += dt;
    if (visualTime === null) visualTime = camera.cameraTime;
    else if (!still) visualTime += dt;
    const card = data.phase === 'title' || data.phase === 'ended';
    const moving = !card && data.running ? data.moving : atRest;
    camera.autoFollowObstacles = data.running && !still ? data.active : null;
    let shot = 'wide';
    if (!still && !card) {
      const restSeconds = (now - restStart) / 1000;
      if (data.phase === 'paused') {
        shot = previousShot;
      } else if (data.running && data.active) {
        const cycle = ((camera.cameraTime-shotCycleStart) % 32 + 32) % 32;
        shot = cycle >= 5 && cycle < 23 ? data.active : 'wide';
      } else if (restSeconds < 3.2) {
        shot = restShot;
      } else if (data.running && !data.dual && restSeconds >= 8) {
        // During a timed interval both ropes stay in place. Give each resting party a close shot.
        const cycle = (restSeconds - 8) % 34;
        if (cycle < 8) shot = lastSpeaker;
        else if (cycle >= 17 && cycle < 25) shot = lastSpeaker === 'pro' ? 'con' : 'pro';
      }
    }
    try {
      if (!draw) {
        draw = createLandscape(scene, camera);
        // createLandscape resolves its named layers once. Embedded previews can share a document.
        for (const layer of scene.querySelectorAll('g[data-layer]')) layer.removeAttribute('id');
      }
      draw(data.progress, still ? 0 : visualTime, moving, shot, dt, snap || still, data.secondsPerTeam, data.footprintClock);
    } catch (error) {
      destroy();
      win.console.error('登山场景无法绘制', error);
      return;
    }
    if (!host.hasAttribute('data-ready')) {
      const face = scene.querySelector('[data-layer="mountain"] path[d]');
      if (!face || face.getAttribute('d').includes('NaN')) return;
      host.setAttribute('data-ready','');
      stage.classList.add('has-climb-view');
    }
    previousShot = camera.shot || shot;
    snap = false;
    if (!still && !card) {
      if (data.running || now < settleUntil) schedule();
      else wake = win.setTimeout(schedule,145);
    }
  }

  function refresh() {
    if (!draw || data?.phase === 'title' || data?.phase === 'ended') snap = true;
    frameClock.reset();
    schedule();
  }
  function visibilityChange() {
    if (!doc.hidden) { refresh(); return; }
    win.cancelAnimationFrame(raf);
    win.clearTimeout(wake);
    wake = 0;
    raf = 0;
    frameClock.reset();
  }
  const size = new win.ResizeObserver(refresh);
  size.observe(host);
  const intersection = new win.IntersectionObserver(entries => {
    visible = entries[entries.length-1].isIntersecting;
    if (visible) refresh();
    else { win.cancelAnimationFrame(raf); win.clearTimeout(wake); raf = wake = 0; frameClock.reset(); }
  });
  intersection.observe(host);
  doc.addEventListener('visibilitychange', visibilityChange);
  motionPreference.addEventListener('change', refresh);

  function update(next) {
    if (destroyed) return;
    const speaking = next.running && (next.moving?.pro || next.moving?.con);
    const wasSpeaking = data?.running && (data.moving?.pro || data.moving?.con);
    if (!speaking && (!data || wasSpeaking || next.stageKey !== data.stageKey || next.running !== data.running)) {
      restStart = win.performance.now();
      restShot = previousShot;
    }
    const used = next.used ? speakingTime(next.used) : camera.cameraTime;
    if (next.used && data?.used && used < speakingTime(data.used) - .05) {
      // A stage restart or undo also rewinds the clock that schedules the shots.
      shotCycleStart = used;
    }
    if (speaking) {
      const side = next.moving.pro ? 'pro' : 'con';
      if (data && lastSpeaker !== side) {
        // Give the new speaker a full follow shot even near the end of an old shot cycle.
        shotCycleStart = used - 5;
      }
      lastSpeaker = side;
    }
    data = next;
    paintHud();
    const key = [data.stageKey, data.phase, data.active, data.running, data.moving?.pro, data.moving?.con, data.still].join('/');
    // A still or paused projection redraws on a visible change, even if the timer controller ticks at 60 Hz.
    const pose = [Math.round(data.progress.pro*500), Math.round(data.progress.con*500),
      Math.floor((data.footprintClock?.now||0)*2)].join('/');
    if (key !== previousKey || pose !== previousPose || !draw) {
      if (key !== previousKey) settleUntil = win.performance.now() + (restShot === 'wide' ? 3200 : 6400);
      if (key !== previousKey && (data.phase === 'title' || data.phase === 'ended')) snap = true;
      previousKey = key;
      previousPose = pose;
      if (!draw && visible && !doc.hidden && scene.clientWidth && scene.clientHeight) {
        paint(win.performance.now());
      } else {
        schedule();
      }
    }
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    win.cancelAnimationFrame(raf);
    win.clearTimeout(wake);
    size.disconnect();
    intersection.disconnect();
    doc.removeEventListener('visibilitychange', visibilityChange);
    motionPreference.removeEventListener('change', refresh);
    host.removeAttribute('data-ready');
    delete host.dataset.style;
    if (!stage.querySelector('.dt-climb-host[data-ready]')) stage.classList.remove('has-climb-view');
    host.classList.remove('dt-climb-host');
    host.replaceChildren();
    draw = null;
    data = null;
  }
  return { update, destroy };
}
