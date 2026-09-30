/* demo.js: fixed scenes for ?demo=<name>, played out with engine actions; used for screenshots and visual review. */
(function (DT) {
  'use strict';
  const S = 1000;
  const FORMAT_ID = 'ustc-freshman-cup';
  const MATCH = {
    title: '新生赛 第 3 场', proMotion: '大学生应该优先发展兴趣', conMotion: '大学生不应该优先发展兴趣',
    proTeam: '物理学院', conTeam: '化学院', proSeat: 'left',
  };
  const LONG_NAME = '正方一辩就大学生是否应当优先发展个人兴趣而非专业技能进行开篇立论并回应对方的质疑';  // 40 characters
  const END_OVER = { '反方二辩驳论': 6, '正方四辩结辩': 9 };  // seconds of overtime on the end card

  function freshman() { return DT.BUILTIN_FORMATS.find(f => f.id === FORMAT_ID); }

  // The freshman cup with its first stage swapped for a 40-character, 60-minute one.
  function longFormat() {
    const f = JSON.parse(JSON.stringify(freshman()));
    f.stages[0] = { id: 'demo-long', name: LONG_NAME, type: 'single', side: 'pro', secs: 3600,
      speaker: '正一 陈述，反方四位辩手依次提问', block: 'A' };
    return f;
  }

  // Every stage gets some time; two single stages run over.
  function endScene() {
    const steps = [];
    let t = 0;
    freshman().stages.forEach((st, i) => {
      steps.push([t, 'goto', i]);
      t += 2;
      if (st.type === 'dual') {
        steps.push([t, 'floor', 'pro'], [t + st.secs - 4, 'floor', 'con'], [t + 2 * st.secs - 13, 'pause']);
        t += 2 * st.secs - 13;
      } else if (st.type === 'break') {
        steps.push([t, 'toggle']);
        t += st.secs;
      } else {
        const spoke = st.secs + (END_OVER[st.name] || -((i * 7) % 12 + 1));
        steps.push([t, 'toggle'], [t + spoke, 'toggle']);
        t += spoke;
      }
    });
    steps.push([t + 2, 'goto', freshman().stages.length]);
    return { at: t + 2, steps };
  }

  // Each scene (or a function returning one): `at` is the frozen moment in seconds after the first step;
  // steps are [second, action, arg?]; `dock: true` keeps the control dock open.
  const SINGLE = { at: 73, steps: [[0, 'goto', '正方一辩开篇立论'], [0, 'toggle']] };
  const DUAL = { at: 137, steps: [[0, 'goto', '自由辩论'], [0, 'floor', 'pro'], [20, 'floor', 'con'], [68, 'floor', 'pro']] };
  const SCENES = {
    'title': { at: 0, steps: [] },
    'single': SINGLE,
    'cross': { at: 96, steps: [[0, 'goto', '反方四辩质询正方一辩'], [0, 'toggle']] },
    'over': { at: 217, steps: [[0, 'goto', '反方四辩结辩'], [0, 'toggle']] },
    'dual': DUAL,
    'dual-locked': { at: 432, steps: [[0, 'goto', '自由辩论'], [0, 'floor', 'pro'], [100, 'floor', 'con']] },
    'dual-idle': { at: 4, steps: [[0, 'goto', '自由辩论']] },
    'break': { at: 12, steps: [[0, 'goto', '评委打分'], [0, 'toggle']] },
    'end': endScene,
    'daylight': Object.assign({ theme: 'daylight' }, SINGLE),
    'chroma': Object.assign({ theme: 'chroma' }, DUAL),
    'seat-right': Object.assign({ seat: 'right' }, DUAL),
    'long': { at: 73, format: longFormat, steps: [[0, 'goto', LONG_NAME], [0, 'toggle']] },
    'dock': Object.assign({ dock: true }, SINGLE),   // the control dock held open over a running stage
  };

  // Play the scene so that its last moment is `now`; the loop ticks before each action, as the UI does.
  function build(name, now) {
    if (!Object.prototype.hasOwnProperty.call(SCENES, name)) return null;
    const scene = typeof SCENES[name] === 'function' ? SCENES[name]() : SCENES[name];
    const E = DT.engine;
    const t0 = now - scene.at * S;
    const match = Object.assign({}, MATCH, scene.seat ? { proSeat: scene.seat } : {});
    let s = E.createSession((scene.format || freshman)(), match, t0, { theme: scene.theme });
    scene.steps.forEach(([sec, act, arg]) => {
      const t = t0 + sec * S;
      s = E.tick(s, t).session;
      if (act === 'goto') s = E.goto(s, typeof arg === 'number' ? arg : s.timeline.findIndex(x => x.name === arg), t);
      else if (act === 'floor') s = E.floor(s, arg, t);
      else s = E[act](s, t);
    });
    return { route: 'timer', session: E.tick(s, now).session, dock: !!scene.dock };
  }

  DT.demo = { names: Object.keys(SCENES), build };
})(window.DT = window.DT || {});
