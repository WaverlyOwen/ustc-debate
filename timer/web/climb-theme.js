/* Pages registers the climbing theme before the shared timer boots.
   Three and the scene load on the first match. */
(function (DT) {
  'use strict';
  const entry = document.currentScript?.src;
  const moduleURL = entry ? new URL('./climb/match-view.js', entry).href : 'expedition/climb/match-view.js';
  const sides = ['pro', 'con'];
  function thumbnail(host) {
    host.innerHTML='<svg width="100%" height="100%" viewBox="0 0 176 78" preserveAspectRatio="xMidYMid slice" aria-hidden="true">'+
      '<rect width="176" height="78" fill="#f5d5ae"/><circle cx="137" cy="18" r="9" fill="#e39364"/>'+
      '<path d="M0 45 23 26 43 39 64 22 90 42 137 24 176 39V78H0Z" fill="#786071"/>'+
      '<path d="m0 64 36-18 13 4 33-26 14-8 8-9 19 24 10 4 10 14 33 14v15H0Z" fill="#fae5bf"/>'+
      '<path d="m104 7 6 18-7-6-13 24 5-2-8 14-34 17 41-8 18-25 10 6-6-14 27 18-13-15-9-4Z" fill="#9f777b"/>'+
      '<path d="m8 68 33-16-9 8 17-5-12 10 16-2-27 12Zm100-28 7-12 5 10-4-2 6 11-7-6-11 6Zm30 10 34 12 4 12-23-9 4 4-27-12Z" fill="#51495a"/>'+
      '<path d="M0 76 29 66 60 70 77 64 106 68 146 57 176 59V78H0Z" fill="#9f777b"/>'+
      '<path d="m41 58 2-5 2 4-1 3Zm7-3 2-5 2 4-1 2Z" fill="#ae352d"/>'+
      '<path d="m140 51 2-5 2 4-1 3Zm7 3 2-5 2 4-1 3Z" fill="#1b597e"/></svg>';
  }

  const theme = {id:'climb-poster', name:'攀登', tone:'light', thumbnail,
    desc:'日照金山与暖色岩壁，自动跟拍红蓝两队，正方在左、反方在右'};
  // Older saved matches and shared links can still open their mountain scene.
  function get(id) {
    if (id===theme.id || id==='climb-ink' || id==='climb-paper') return theme;
  }
  // A running neutral interval and speech overtime weather existing tracks.
  // Only credited speech advances a party along the route.
  const clockBaselines=new WeakMap();
  function credit(used,side,type,clock,yielded,elapsed=0) {
    const spent=(clock.used+elapsed)/1000, budget=clock.total/1000;
    if (side==='neutral') {
      used.neutral+=Math.max(0,type==='break'?Math.min(budget,spent):spent);
    } else {
      used[side]+=Math.max(0,Math.min(budget,spent)-yielded/1000);
      if (type==='single') used.neutral+=Math.max(0,spent-budget);
    }
  }
  function clockTotals(session, now) {
    let base=clockBaselines.get(session);
    if (!base) {
      base={used:{pro:0,con:0,neutral:0},secondsPerTeam:{pro:0,con:0},live:[]};
      for (const stage of session.timeline) {
        const dual=stage.type==='dual', run=session.runs[stage.id];
        const assigned=stage.type==='single' && sides.includes(stage.side)?stage.side:'neutral';
        for (const side of dual?sides:[assigned]) {
          const key=dual?side:'main', clock=run?.clocks[key];
          if (side!=='neutral') base.secondsPerTeam[side]+=clock?clock.total/1000:stage.secs;
          if (!clock) continue;
          const yielded=run.yielded?.[key]||0;
          if (run.running && run.active===key) base.live.push({side,type:stage.type,clock,yielded,since:run.since});
          else credit(base.used,side,stage.type,clock,yielded);
        }
      }
      clockBaselines.set(session,base);
    }
    const used={...base.used};
    for (const {side,type,clock,yielded,since} of base.live) credit(used,side,type,clock,yielded,(now??since)-since);
    return {used,secondsPerTeam:base.secondsPerTeam};
  }

  // Undo snapshots share immutable speaking intervals. An ordinary handoff
  // appends one interval without copying every earlier turn into each view.
  const footprintHistories=new WeakMap();
  function endTime(turn) { return turn ? turn.start+turn.duration : 0; }
  function appendTurn(last,side,from,duration) {
    if (last?.side===side) return {...last,duration:last.duration+duration};
    return {side,from,duration,start:endTime(last),previous:last};
  }
  function shortenTurns(last,side,seconds) {
    const kept=[];
    while (last && seconds>1e-8) {
      const {duration}=last;
      if (last.side!==side) kept.push(last);
      else {
        if (duration>seconds) kept.push({...last,duration:duration-seconds});
        seconds-=duration;
      }
      last=last.previous;
    }
    for (const turn of kept.reverse()) last=appendTurn(last,turn.side,turn.from,turn.duration);
    return last;
  }
  function footprintHistory(session,ancestors=session.history||[]) {
    if (footprintHistories.has(session)) return footprintHistories.get(session);
    const parent=ancestors.at(-1);
    const prior=parent && footprintHistory(parent,ancestors.slice(0,-1));
    let last=prior?.last,first=prior?.active||'pro';
    const used={pro:0,con:0,neutral:0,...prior?.used};
    if (!prior) for (const [side,duration] of session.footprintTurns||[]) {
      last=appendTurn(last,side,used[side],duration);
      used[side]+=duration;
    }
    function advanceTo(spent) {
      // A delayed dual tick can consume both teams. Its original speaker
      // reaches zero before the other side's remaining time is consumed.
      for (const side of [first,...['pro','con','neutral'].filter(s=>s!==first)]) {
        const delta=spent[side]-used[side];
        if (delta>1e-8) last=appendTurn(last,side,used[side],delta);
        else if (delta < -1e-8) last=shortenTurns(last,side,-delta);
        used[side]=spent[side];
      }
    }
    const handoffs=session.footprintHandoffs||[];
    for (let i=prior?.handoffs ?? session.footprintHandoffCount ?? 0;i<handoffs.length;i++) {
      advanceTo(handoffs[i].used);
      first=handoffs[i].active;
    }
    advanceTo(clockTotals(session).used);
    const stage=session.timeline[session.cursor],run=stage && session.runs[stage.id];
    const active=stage?.type==='break'?null:stage?.type==='dual'?run?.active||stage.first:stage?.side;
    const history={last,used,active:active||'neutral',handoffs:handoffs.length};
    footprintHistories.set(session,history);
    return history;
  }
  function rememberFootprintSnapshot(session,snapshot) {
    if (get(session.theme)) footprintHistories.set(snapshot,footprintHistory(session));
  }

  // Send a compact seed with a projector state or the oldest retained undo
  // snapshot. The projector never receives the undo stack itself.
  function preserveFootprintTurns(session,copy) {
    if (!get(session.theme)) return;
    const kept=copy.history?.length||0,ancestors=session.history||[];
    const cut=ancestors.length-kept;
    const seed=kept?footprintHistory(ancestors[cut],ancestors.slice(0,cut)):footprintHistory(session);
    if (kept===ancestors.length && !seed.last && !seed.handoffs) return;
    const packed=[];
    for (let t=seed.last;t;t=t.previous) packed.push([t.side,t.duration]);
    const target=kept?(copy.history[0]={...copy.history[0]}):copy;
    target.footprintTurns=packed.reverse();
    target.footprintHandoffCount=seed.handoffs;
  }

  // Automatic clock exhaustion does not add an undo action. Retain its
  // starting clock totals and speaker before tick can consume both turns.
  function noteFootprintHandoff(before,after,active) {
    if (get(before.theme)) after.footprintHandoffs=(before.footprintHandoffs||[])
      .concat({used:clockTotals(before).used,active});
  }

  function ascent(session, now) {
    const {used:all,secondsPerTeam}=clockTotals(session,now),used={pro:all.pro,con:all.con};
    const history=footprintHistory(session);
    const elapsed=all.pro+all.con+all.neutral;
    const footprintClock={now:elapsed,at(side,p) {
      const target=p*secondsPerTeam[side];
      if (target>history.used[side]+1e-9) return endTime(history.last)+target-history.used[side];
      let first=0;
      for (let turn=history.last;turn;turn=turn.previous) {
        if (turn.side!==side) continue;
        if (target>turn.from+1e-10) return turn.start+target-turn.from;
        first=turn.start;
      }
      return first;
    },settledAt(side,from,to,settle) {
      // A stopped swing plants early only when the speaker relinquishes
      // the floor after mid-swing and stays still long enough to settle.
      const low=from*secondsPerTeam[side],high=to*secondsPerTeam[side];
      let next=all[side]>history.used[side]+1e-9?endTime(history.last):elapsed,landed=null;
      for (let turn=history.last;turn;turn=turn.previous) {
        if (turn.side!==side) continue;
        const end=turn.from+turn.duration;
        if (end<low-1e-9) break;
        if (end<high && endTime(turn)+settle<=next) landed=endTime(turn)+settle;
        next=turn.start;
      }
      return landed;
    }};
    return {used,secondsPerTeam,footprintClock,progress:{
      pro:secondsPerTeam.pro ? used.pro/secondsPerTeam.pro : 0,
      con:secondsPerTeam.con ? used.con/secondsPerTeam.con : 0,
    }};
  }

  function matchData(v, still) {
    const st = v.stage, dual = st?.type==='dual', main = dual ? null : v.clocks[0];
    const owner = st?.type==='single' ? st.side : null;
    const active = dual ? v.clocks.find(c=>c.active)?.side || null : owner;
    const data = {
      ...v.ascent, still, dual, active, running:v.running, stageSide:owner, stage:st?.name || '',
      stageKey:st?.id || v.mode, speaker:st?.speaker || '', mainClock:main?.text || '',
      clockPhases:{main:main?.phase || '',pro:'',con:''}, clocks:{pro:'',con:''}, clockStates:{},
      teams:{pro:v.match?.proTeam || '正方',con:v.match?.conTeam || '反方'},
      moving:{pro:false,con:false},
      phase:v.mode==='title' ? 'title' : v.mode==='end' ? 'ended' : v.running ? 'running'
        : v.clocks.every(c=>c.locked) ? 'done' : v.clocks.some(c=>c.remaining!==c.total) ? 'paused' : 'ready',
    };
    for (const clock of v.clocks) {
      if (!sides.includes(clock.side)) continue;
      data.clocks[clock.side]=clock.text;
      data.clockPhases[clock.side]=clock.phase;
      if (clock.locked && clock.yielded>0) data.clockStates[clock.side]='已放弃';
      data.moving[clock.side]=clock.running && data.progress[clock.side]<1 && clock.remaining>0;
    }
    return data;
  }

  function mount(stage) {
    const host = stage.ownerDocument.createElement('div');
    stage.prepend(host);
    let last, view, destroyed=false;
    const still=stage.hasAttribute('data-still');
    import(moduleURL).then(({createMatchView}) => {
      if (destroyed) return;
      view=createMatchView(host);
      if (last) view.update(matchData(last,still));
    }).catch(error => {
      if (!destroyed) console.warn('攀登场景未能载入，继续显示比赛计时',error);
    });
    return {
      update(v) { last=v; if (view) view.update(matchData(v,still)); },
      destroy() { destroyed=true; if (view) view.destroy(); host.remove(); },
    };
  }
  // Each study opens a spot on the route with the regular match clocks and controls.
  const studies = {'climb-walk':.14,'climb-ladder':.31,'climb-ice':.72,'climb-assist':.946};
  function demo(name, now) {
    const seconds = name==='climb-assist' ? 540 : 150, side = 'pro', E=DT.engine;
    const format={id:'climb-study',name:'攀登动作预演', stages:[
      {id:'crossing',name:'自由辩论',type:'dual',first:side,secs:seconds}
    ]};
    const match={proTeam:'红队',conTeam:'蓝队'};
    let s=E.createSession(format,match,now,{theme:theme.id});
    s=E.goto(s,0,now);
    s=E.adjust(s,-seconds*1000*studies[name],now,'pro');
    s=E.adjust(s,-seconds*1000*.17,now,'con');
    return {route:'timer',session:E.floor(s,side,now)};
  }
  DT.webScenes = {themes:[theme], get, ascent, preserveFootprintTurns, noteFootprintHandoff, rememberFootprintSnapshot,
    mount, demoNames:Object.keys(studies), demo};
})(window.DT = window.DT || {});
