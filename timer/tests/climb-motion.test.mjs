import assert from 'node:assert/strict';
import test from 'node:test';
import { createParties } from '../web/climb/climbers.js';
import { createTerrain } from '../web/climb/terrain.js';

const terrain = createTerrain('poster');
const live = {pro:1020, con:1020};
const ownClock = {pro:true, con:false};
const distance = (a,b) => Math.hypot(...a.map((v,i)=>v-b[i]));
const endpoint = bone => bone.origin.map((v,i)=>v+bone.y[i]);

test('the blue leader faces continuously along the switchback above the ice',()=>{
  const sample=createParties(),seconds=150;
  let last;
  for (let tick=9145;tick<=9175;tick++) {
    const p=tick/10000,t=p*seconds;
    const leader=sample(terrain,{con:p,pro:.32},t,{con:true,pro:false},'poster',seconds).members[3];
    const b=leader.bones;
    const pose=[b.torso.z,b.head.z,b.hand0.origin,b.hand1.origin,b.pole0.origin,b.pole1.origin];
    if (last) for (let j=0;j<pose.length;j++) {
      assert.ok(distance(pose[j],last[j])<.14,`joint ${j} jumped at ${p}`);
    }
    last=pose;
  }
});

test('a live speech produces a weight transfer, a planted support foot and a human-duration swing', () => {
  const sample=createParties(), swings=[];
  let lifted=null, previous, preload=false, supported=false;
  for (let frame=0;frame<24*95;frame++) {
    const t=frame/24, p=(230+t)/1020;
    const m=sample(terrain,{pro:p,con:.5},t,ownClock,'poster',live).members[0];
    const foot=m.legs[0];
    if (foot.clearance>.018 && lifted===null) lifted=t;
    if (foot.clearance<=.018 && lifted!==null) { swings.push(t-lifted);lifted=null; }
    if (m.step.u>.08 && m.step.u<.18 && Math.abs(m.weight)>.12 && m.legs.every(l=>l.clearance===0)) preload=true;
    if (previous && distance(m.position,previous.position)>.001 &&
      m.legs[0].clearance>.04 && distance(m.legs[1].point,previous.legs[1].point)<1e-8) supported=true;
    previous=m;
  }
  assert(swings.length>=3 && Math.max(...swings)<1.5);
  assert(preload && supported);
});

test('each climber covers the longer course with human-sized steps and short rests on a real team clock',()=>{
  const sample=createParties(),seconds=1020;
  for (const side of ['pro','con']) {
    const landings=sample.footfalls(terrain,side,1,seconds);
    for (const rank of [0,1,2]) {
      const feet=landings.filter(event=>event.rank===rank);
      const intervals=feet.slice(1).map((event,i)=>(event.progress-feet[i].progress)*seconds).sort((a,b)=>a-b);
      const strides=feet.slice(1).map((event,i)=>distance(event.position,feet[i].position)).sort((a,b)=>a-b);
      const middle=Math.floor(intervals.length/2);
      assert.ok(feet.length*60/seconds>=12,`${side} ${rank} cadence`);
      assert.ok(intervals[middle]>2 && intervals[middle]<5);
      assert.ok(intervals.at(-1)>6 && intervals.at(-1)<16);
      assert.ok(strides[middle]>.70 && strides[middle]<1.20);
    }
    const end=sample(terrain,{pro:1,con:1},seconds,{pro:false,con:false},'poster',seconds).members;
    const leader=end.find(m=>m.side===side&&m.rank===0);
    assert.ok(distance(leader.position,terrain.route(side,1))<1e-6);
  }
});

test('a mid-ladder interruption settles in staggered time onto physical rungs', () => {
  const sample=createParties();
  let before, foot, p, t;
  for (let n=0;n<24*65;n++) {
    t=n/24; p=.25+t/1020;
    before=sample(terrain,{pro:p,con:.48},t,ownClock,'poster',live).members;
    const m=before[0];
    foot=m.legs.findIndex(l=>l.clearance>.14);
    if (m.feature?.kind==='ladder' && m.feature.u>.2 && m.feature.u<.75 && foot>=0) break;
  }
  assert(foot>=0 && before[0].feature?.kind==='ladder');
  const stopped=dt=>sample(terrain,{pro:p,con:.48},t+dt,{pro:false,con:false},'poster',live).members;
  const atSwitch=stopped(0);
  assert(distance(before[0].bones['boot'+foot].origin,atSwitch[0].bones['boot'+foot].origin)<1e-9);
  const easing=stopped(.35);
  assert(easing[0].activity<easing[1].activity && easing[1].activity<easing[2].activity);
  const settled=stopped(1.5), later=stopped(4.3);
  const m=settled[0], f=m.feature, contact=m.legs[foot].point;
  const [u,lane]=f.local(contact[0],contact[2]);
  assert(Math.abs(u*f.steps-Math.round(u*f.steps))<1e-7);
  assert(distance(contact,f.contact(u,lane))<1e-7);
  assert(distance(m.position,before[0].position)<1e-9);
  assert(distance(contact,later[0].legs[foot].point)<1e-9);
  assert(distance(m.bones.head.z,later[0].bones.head.z)>.005);
});

test('both teams take successive physical rungs and keep a hand braced as the other boot crosses',()=>{
  const sample=createParties(),moving={pro:true,con:true};
  for (const side of ['pro','con']) {
    const bridge=terrain.features[side].find(f=>f.kind==='ladder');
    const landings=sample.footfalls(terrain,side,1,150).filter(event=>event.material==='ladder');
    for (const rank of [0,1,2]) {
      const rungs=landings.filter(s=>s.rank===rank).map(s=>{
        const [u,lane]=bridge.local(s.position[0],s.position[2]);
        assert.ok(distance(s.position,bridge.contact(u,lane))<1e-7);
        return Math.round(u*bridge.steps);
      });
      assert.deepEqual([...new Set(rungs)],Array.from({length:bridge.steps+1},(_,i)=>i));
    }
  }
  for (const seconds of [150,1020]) {
    const seen=new Set(),last=new Map();
    for (let tick=Math.floor(.16*seconds*24);tick<.44*seconds*24;tick++) {
      const t=tick/24,p=t/seconds;
      for (const m of sample(terrain,{pro:p,con:p},t,moving,'poster',seconds).members) {
        const f=m.feature,b=m.bones,id=m.side+m.rank;
        if (f?.kind!=='ladder'||f.u<.10||f.u>.90) continue;
        const palms=[b.hand0.origin,b.hand1.origin];
        for (let i=0;i<2;i++) {
          assert.equal(b['pole'+i],undefined,'the pole would fall between the rungs');
          const [u]=f.local(palms[i][0],palms[i][2]);
          assert.ok(distance(palms[i],f.handhold(u,i?-1:1))<.016,'palm lost its handline');
        }
        const swinging=m.legs.findIndex(l=>!l.id);
        if (swinging>=0 && last.has(id)) {
          const support=1-swinging;
          assert.ok(distance(palms[support],last.get(id)[support])<.04,'support hand slides during single support');
          seen.add(id+swinging);
        }
        last.set(id,palms);
      }
    }
    assert.equal(seen.size,12);
  }
});

test('the summit hand-up keeps a shared reachable grip above the rock ledge',()=>{
  const sample=createParties();
  let previous;
  for (let tick=9570;tick<=9640;tick++) {
    const p=tick/10000,[leader,second]=sample(terrain,{pro:p,con:.31},p*150,ownClock,'poster',150).members;
    assert.equal(leader.cooperation?.role,'pull');
    assert.equal(second.cooperation?.role,'reach');
    const palms=[leader,second].map(m=>{
      const i=m.cooperation.hand,palm=m.bones['hand'+i].origin;
      assert.ok(distance(palm,m.bones['upperArm'+i].origin)<=1.24*m.person.height+1e-7);
      assert.ok(palm[1]>terrain.surface(palm[0],palm[2])[1]+.12,`buried grip at ${p}`);
      return palm;
    });
    assert.ok(distance(...palms)<.001);
    if (previous) assert.ok(distance(previous,palms[0])<.10);
    previous=palms[0];
  }
});

test('obstacle grips meet the modeled handline, ice and belay rope, and partners clasp hands', () => {
  const sample=createParties(), quick={pro:42.5,con:42.5}, seen={};
  for (let n=0;n<=600;n++) {
    const p=n/600;
    const members=sample(terrain,{pro:p,con:p},42.5*p,{pro:true,con:true},'poster',quick).members;
    for (const m of members) {
      const j=m.railGrip?.hand;
      if (m.railGrip?.amount>.999 && distance(m.bones['hand'+j].origin,m.railGrip.target)<.025) seen.ladder=true;
      for (const [i,pick] of (m.icePicks||[]).entries()) {
        if (!pick.planted) continue;
        assert(distance(endpoint(m.bones['axe'+i]),pick.contact)<.013);
        seen.ice=true;
      }
      const action=m.cooperation;
      if (!action || action.amount<.998) continue;
      const other=members.find(q=>q.side===m.side && q.rank===action.partnerRank);
      if (action.role==='belay' && other.cooperation?.role==='crossing') {
        const link=m.rank>other.rank?m:other;
        assert(distance(link.ropeGuide,m.bones.hand1.origin)<.003);
        seen.belay=true;
      }
      if (action.role==='pull' && action.hand!==undefined && other.cooperation?.role==='reach') {
        const first=m.bones['hand'+action.hand].origin, second=other.bones['hand'+other.cooperation.hand].origin;
        if (distance(first,second)<.02 && distance(first,m.bones.torso.origin)>.71) seen.assist=true;
      }
    }
  }
  assert.deepEqual(seen,{ladder:true,belay:true,ice:true,assist:true});
});
