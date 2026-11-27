import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createTerrain } from '../web/climb/terrain.js';
import { createClimberModel, frontPoints } from '../web/climb/climber-model.js';
import { createParties } from '../web/climb/climbers.js';
import { createTreadGeometry, projectTread, mountFootprints } from '../web/climb/footprints.js';
import { climbTimeline } from '../web/climb/timeline.js';

const frame={origin:[0,0,0],x:[0,0,-1],y:[0,1,0],z:[1,0,0]};
const quad=(left,right,material)=>({material,color:'#aabbcc',points:[[left,0,-2],[left,0,2],[right,0,2],[right,0,-2]]});

test('a rotated boot leaves heel and forefoot impressions only on its supporting snow',()=>{
  const ledge=quad(-2,2,'snow');
  for (const point of ledge.points) point[1]=1;
  const geometry=createTreadGeometry({faces:[quad(-2,0,'rock'),quad(0,2,'snow'),ledge]});
  const pieces=geometry({frame,foot:0,material:'snow'});
  assert(pieces.length);
  for (const {points,material} of pieces) {
    assert.equal(material,'snow');
    for (const [x,y,z] of points) {
      assert(Math.abs(y)<1e-8);
      assert(x>=-1e-7 && x<=.302 && Math.abs(z)<=.146);
    }
  }
  const empty=createTreadGeometry({faces:[quad(-2,2,'rock')]});
  assert.deepEqual(empty({frame,foot:0,material:'snow'}),[]);
  assert.deepEqual(geometry({frame,foot:0,material:'ladder'}),[]);
  const ice=createTreadGeometry({faces:[quad(-2,2,'ice')]});
  const marks=ice({frame,foot:1,material:'ice'});
  assert(marks.length>=2 && marks.every(mark=>mark.material==='ice'));
});

test('on tilted ice only the steel front point that contacts the face leaves a puncture',()=>{
  const {person}=createParties()(createTerrain('paper'),{pro:0,con:0},0,{pro:false,con:false}).members[0];
  const model=createClimberModel(person,'paper'),foot=0,[tip]=frontPoints[foot];
  const teeth=model.filter(part=>part.bone==='crampon'+foot);
  for (const point of frontPoints[foot]) {
    assert(teeth.some(tooth=>tooth.vertices.some(p=>p.every((v,i)=>v===point[i]))));
  }
  const slope=(x,z)=>tip[1]+1.2*(x-tip[0])+2*(z-tip[2]);
  const face={material:'ice',points:[[-1,-1],[-1,1],[1,1],[1,-1]].map(([x,z])=>[x,slope(x,z),z])};
  const print=createTreadGeometry({faces:[face]});
  const boot={origin:[0,0,0],x:[1,0,0],y:[0,1,0],z:[0,0,1]};
  const pieces=print({frame:boot,foot,material:'ice'});
  assert.equal(pieces.length,1);
  for (const [x,y,z] of pieces[0].points) {
    assert(Math.abs(y-slope(x,z))<1e-8);
    assert(Math.hypot(x-tip[0],y-tip[1],z-tip[2])<.055);
  }
  assert.deepEqual(print({frame:{...boot,origin:[0,.55,0]},foot,material:'ice'}),[]);
});

test('the near ridge clips a tread crossing its silhouette and hides a tread behind it',()=>{
  const square=[[0,0,0],[2,0,0],[2,0,2],[0,0,2]];
  const project=p=>({x:10+p[0]*20,y:10+p[2]*20,depth:20});
  project.width=80;project.height=80;
  const cover=(left,right,depth)=>(_box,_depth,visit)=>{
    const pts=[[left,0],[right,0],[right,70],[left,70]].map(([x,y])=>({x,y,depth}));
    visit(pts[0],pts[1],pts[2]);visit(pts[0],pts[2],pts[3]);
  };
  project.visitOccluders=cover(0,60,10);
  assert.equal(projectTread(square,project),'');
  project.visitOccluders=cover(30,60,10);
  const path=projectTread(square,project);
  const points=Array.from(path.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g),m=>[+m[1],+m[2]]);
  assert(points.length>=3);
  assert(Math.max(...points.map(p=>p[0]))<=30.2);
  assert(Math.min(...points.map(p=>p[0]))<11);
  project.visitOccluders=cover(18,20,10);
  const strip=projectTread(square,project);
  for (const fragment of strip.match(/M[^Z]+/g)) {
    const xs=Array.from(fragment.matchAll(/[ML](-?[\d.]+),/g),m=>+m[1]);
    assert(Math.max(...xs)<=18.01 || Math.min(...xs)>=19.99,'a narrow rail should cut the middle of the tread');
  }
});

test('six walkers reproduce planted boot frames and independent histories after seeking',()=>{
  const terrain=createTerrain('poster'),sample=createParties(), seconds={pro:1020,con:330};
  const stopped={pro:false,con:false}, walking={pro:true,con:true};
  const seen=new Set();
  for (const side of ['pro','con']) {
    const early=sample.footfalls(terrain,side,.2,seconds);
    const later=sample.footfalls(terrain,side,.52,seconds);
    assert(early.length>6 && later.length>early.length);
    assert.deepEqual(early,sample.footfalls(terrain,side,.2,seconds));
    assert.deepEqual(later,createParties().footfalls(terrain,side,.52,seconds));
    const ids=new Set(later.map(mark=>mark.id));
    assert.equal(ids.size,later.length);
    for (const mark of later.filter(mark=>mark.progress>.02 && mark.progress<.52).filter((_,i)=>i%5===0)) {
      const p=mark.progress+1e-8,progress={pro:p,con:p};
      const m=sample(terrain,progress,p*seconds[side],walking,'poster',seconds).members.find(m=>m.side===side&&m.rank===mark.rank);
      const boot=m.bones['boot'+mark.foot];
      for (const axis of ['origin','x','z']) {
        assert(Math.hypot(...mark.frame[axis].map((n,i)=>n-boot[axis][i]))<2e-4,side+' '+mark.id+' '+axis);
      }
      seen.add(side+mark.rank+mark.foot);
    }
    sample(terrain,{pro:.2,con:.5},100,stopped,'poster',seconds);
    assert.deepEqual(early,sample.footfalls(terrain,side,.2,seconds));
  }
  assert.equal(seen.size,12);
});

test('the painted tracks stop with each party and rebuild after a seek or a reset',()=>{
  const terrain=createTerrain('poster'),seconds={pro:1020,con:330};
  const project=p=>({x:330+p[0]*4,y:380-p[1]*4-p[2],depth:150-p[2]});
  Object.assign(project,{width:660,height:500,visitOccluders(){}});
  function scene() {
    const nodes=[],sample=createParties();
    const group={appendChild:node=>nodes.push(node),ownerDocument:{createElementNS(){
      const attributes=new Map();
      return {setAttribute:(key,value)=>attributes.set(key,value),getAttribute:key=>attributes.get(key)};
    }}};
    const draw=mountFootprints(group,terrain,'poster',sample);
    return (progress,t,pro=true,con=true)=>{
      const {members}=sample(terrain,progress,t,{pro,con},'poster',seconds);
      draw(project,'fixed',progress,seconds,members);
      const result={pro:{},con:{}};
      for (const node of nodes) {
        const data=node.getAttribute('d');
        if (!data) continue;
        const key=node.getAttribute('data-footprints');
        result[key.split('/')[0]][key]=createHash('sha256').update(data).digest('hex');
      }
      return result;
    };
  }
  const live=scene(),base={pro:0,con:0},mid={pro:.66,con:.48},late={pro:.83,con:.48};
  assert.deepEqual(live(base,0),{pro:{},con:{}});
  const walking=live(mid,10);
  for (const side of ['pro','con']) {
    assert.equal(Object.keys(walking[side]).filter(key=>key.endsWith('/snow')).length,6);
  }
  live(mid,10.01,false,false);
  const paused=live(mid,14,false,false);
  assert.deepEqual(live(mid,50,false,false),paused);
  const advanced=live(late,55,true,false);
  assert.deepEqual(advanced.con,{},'idle party prints weather away during the other speech');
  assert.notDeepEqual(advanced.pro,paused.pro);
  assert.deepEqual(live(mid,7),scene()(mid,7));
  assert.deepEqual(live(base,8),{pro:{},con:{}});
  assert.deepEqual(live(mid,9),scene()(mid,9));
});

function timer() {
  const window={},ctx={window,document:{currentScript:null}};
  for (const file of ['../src/engine.js','../web/climb-theme.js']) {
    runInNewContext(readFileSync(new URL(file,import.meta.url),'utf8'),ctx);
  }
  return window.DT;
}

function svgGroup() {
  const nodes=[];
  return {nodes,appendChild:node=>nodes.push(node),ownerDocument:{createElementNS(){
    const attributes=new Map();
    return {setAttribute:(key,value)=>attributes.set(key,value),getAttribute:key=>attributes.get(key)};
  }}};
}

test('one planted tread fades on the SVG path and its expired geometry is never projected',()=>{
  const group=svgGroup(),terrain={faces:[quad(-2,2,'snow')]};
  const event={side:'pro',rank:0,foot:0,id:'planted',distance:2,progress:.1,material:'snow',frame};
  let planReads=0;
  const sample={footfalls(_t,side,p) {
    planReads++;
    return side==='pro' && p>=event.progress?[event]:[];
  }};
  const draw=mountFootprints(group,terrain,'poster',sample);
  let calls=0;
  const project=Object.assign(p=>{calls++;return {x:30+p[0]*50,y:30+p[2]*50,depth:20};},
    {width:80,height:80,visitOccluders(){}});
  const members=[{side:'pro',rank:0,t:0,legs:[{id:event.id,clearance:0,distance:2}]}];
  function opacity(now,view='fixed') {
    draw(project,view,{pro:.1,con:0},100,members,{now,at:()=>10});
    const path=group.nodes.find(n=>n.getAttribute('d'));
    return path?Number(path.getAttribute('opacity')):0;
  }
  const fresh=opacity(10),projected=calls;
  assert(fresh>0 && projected>0);
  assert.equal(opacity(12.5),fresh);
  const middle=opacity(22.5),older=opacity(32.49);
  assert.equal(middle,fresh/2);
  assert(older<middle && older>0);
  assert.equal(opacity(32.49),older);
  assert.equal(calls,projected,'age alone needs only an opacity update');
  assert.equal(opacity(32.5,'new view'),0);
  assert.equal(calls,projected,'expired geometry should be skipped, even with a new camera');
  assert.equal(opacity(22.5),middle,'a rewind restores the correct opacity');
  assert.equal(planReads,2,'fading and replay share one ordered landing plan per team');
});

test('a swing planted during the opposing speech has the same age on a newly opened projector',()=>{
  const {engine:E,webScenes:scene}=timer(),terrain=createTerrain('poster'),plan=createParties(),budget=150;
  const geometry=createTreadGeometry(terrain);
  const project=Object.assign(p=>({x:1200+p[0]*7,y:1200-p[1]*7-p[2],depth:600-p[2]}),
    {width:2400,height:1800,visitOccluders(){}});
  const event=plan.footfalls(terrain,'pro',.55,budget).find(e=>e.progress>.15&&e.material==='snow'&&
    geometry(e).length&&geometry(e).every(f=>f.material==='snow'));
  const stop=(event.progress-.00050)*budget;
  const path=geometry(event).map(f=>projectTread(f.points,project)).join('');
  const lane='pro/'+event.rank+'/'+event.foot+'/snow';
  function projection() {
    const group=svgGroup(),sample=createParties(),draw=mountFootprints(group,terrain,'poster',sample);
    return (state,t)=>{
      const a=scene.ascent(state,t*1000),r=E.getRun(state);
      const moving={pro:r.active==='pro'&&r.running,con:r.active==='con'&&r.running};
      const m=sample(terrain,a.progress,t,moving,'poster',a.secondsPerTeam).members;
      draw(project,'same',a.progress,a.secondsPerTeam,m,a.footprintClock);
      return group.nodes.some(n=>n.getAttribute('data-footprints')===lane&&n.getAttribute('d').includes(path));
    };
  }
  const format={name:'Floor',stages:[{id:'d',type:'dual',first:'pro',secs:budget}]};
  let s=E.floor(E.goto(E.createSession(format,{},0,{theme:'climb-poster'}),0,0),'pro',0);
  const live=projection();
  live(s,stop-.12);
  assert.equal(live(s,stop),false);
  s=E.floor(s,'con',stop*1000);
  assert.equal(live(s,stop),false);
  assert.equal(live(s,stop+2),true);
  assert.equal(live(s,stop+59),false);
  s=E.floor(s,'pro',(stop+60)*1000);
  assert.equal(live(s,stop+60),false);
  assert.equal(live(s,stop+61.2),false);
  const copy={...s,history:[]};
  scene.preserveFootprintTurns(s,copy);
  assert.equal(projection()(JSON.parse(JSON.stringify(copy)),stop+61.2),false);
});

test('automatic dual exhaustion preserves actual touchdown times through reload, projection and a delayed tick',()=>{
  const {engine:E,webScenes:scene}=timer();
  const format={name:'Dual',stages:[{id:'d',name:'floor',type:'dual',secs:30}]};
  let s=E.createSession(format,{},0,{theme:'climb-poster'});
  s=E.floor(E.goto(s,0,0),'pro',0);
  s=E.floor(s,'con',10000);
  const projected=(state,kept)=>{
    const copy={...state,history:kept?state.history.slice(-kept):[]};
    scene.preserveFootprintTurns(state,copy);
    return JSON.parse(JSON.stringify(copy));
  };
  const check=(state,ms)=>{
    const c=scene.ascent(state,ms).footprintClock;
    assert.equal(c.now,ms/1000);
    assert.equal(c.at('pro',25/30),55);
    assert.equal(c.at('con',25/30),35);
  };
  for (const start of [s,projected(s,0),projected(s,1)]) {
    const mid=E.tick(start,40000).session;
    check(mid,59000);
    for (const copy of [mid,projected(mid,0),projected(mid,1)]) check(E.tick(copy,60000).session,60000);
    check(E.tick(start,60000).session,60000);
  }
});

test('neutral intervals and overtime age marks, while pauses and unspent yielded time do not',()=>{
  const {engine:E,webScenes:scene}=timer();
  const format={name:'Mixed',stages:[{id:'d',name:'dual',type:'dual',secs:40},
    {id:'r',name:'rest',type:'break',secs:60},{id:'s',name:'single',type:'single',side:'pro',secs:10}]};
  let s=E.createSession(format,{},0,{theme:'climb-ink'});
  s=E.floor(E.goto(s,0,0),'pro',0);
  s=E.floor(s,'con',10000);
  s=E.yieldTime(s,20000);
  s=E.pause(s,25000);
  for (const ms of [25000,90000]) {
    const c=scene.ascent(s,ms).footprintClock;
    assert.equal(c.now,25);assert.equal(c.at('pro',.26),23);
    assert.equal(c.at('con',.125),15);
  }
  s=E.toggle(E.goto(s,1,90000),90000);
  assert.equal(scene.ascent(s,104000).footprintClock.now,39);
  s=E.toggle(E.goto(s,2,104000),104000);
  const overtime=scene.ascent(s,124000).footprintClock;
  assert.equal(overtime.now,59);assert.equal(overtime.at('pro',.46),47);
  s=E.reset(s,124000);
  assert.equal(scene.ascent(s,124000).footprintClock.now,39);
});

test('fast handoffs surviving undo-history pruning keep their interleaved timestamps',()=>{
  const {engine:E,webScenes:scene}=timer();
  const f={name:'Quick turns',stages:[{id:'d',name:'floor',type:'dual',secs:100}]};
  let s=E.floor(E.goto(E.createSession(f,{},0,{theme:'climb-paper'}),0,0),'pro',0);
  for (let i=1;i<=140;i++) s=E.floor(s,i%2?'con':'pro',i*200);
  assert.equal(s.history.length,100);
  for (const kept of [null,0,20]) {
    let saved=s;
    if (kept!==null) {
      saved={...s,history:kept?s.history.slice(-kept):[]};
      scene.preserveFootprintTurns(s,saved);
      saved=JSON.parse(JSON.stringify(saved));
    }
    const c=scene.ascent(saved,28000).footprintClock;
    assert(Math.abs(c.at('pro',.025)-4.9)<1e-7); // 12 earlier blue turns
    assert(Math.abs(c.at('con',.025)-5.1)<1e-7);
    assert(Math.abs(c.now-28)<1e-7);
  }
  // The oldest surviving undo state still has pre-pruning turns in memory.
  // Saving fewer than twenty undo states must persist that prefix too.
  for (let i=0;i<89;i++) s=E.undo(s,28000-i);
  const saved={...s,history:s.history.slice()};
  assert.equal(saved.history.length,11);
  scene.preserveFootprintTurns(s,saved);
  for (const state of [s,JSON.parse(JSON.stringify(saved))]) {
    const c=scene.ascent(state,28000).footprintClock;
    assert(Math.abs(c.at('pro',.025)-4.9)<1e-7);
    assert(Math.abs(c.at('con',.025)-5.1)<1e-7);
  }
  assert(saved.history.filter(t=>t.footprintTurns).length===1);
  while (s.history.length) s=E.undo(s,28000);
  for (const restored of [s,JSON.parse(JSON.stringify(s))]) {
    const c=scene.ascent(restored,28000).footprintClock;
    assert(Math.abs(c.at('pro',.025)-4.9)<1e-7);
    assert(Math.abs(c.at('con',.025)-5.1)<1e-7);
  }
});

test('ordinary timer sessions, undo snapshots and projected states carry no footprint data',()=>{
  const {engine:E,webScenes:scene}=timer();
  const format={name:'Ordinary',stages:[{id:'d',type:'dual',secs:30}]};
  let s=E.floor(E.goto(E.createSession(format,{},0,{theme:'classic'}),0,0),'pro',0);
  s=E.floor(s,'con',10000);
  s=E.tick(s,60000).session;
  const projected={...s,history:[]};
  scene.preserveFootprintTurns(s,projected);
  assert(!JSON.stringify([s,projected]).includes('footprint'));
});

test('the independently seekable rehearsal clock includes breaks and uses simulated seconds at every speed',()=>{
  const t=climbTimeline({stages:[{name:'red',type:'single',side:'pro',secs:20},
    {name:'break',type:'break',secs:8},{name:'dual',type:'dual',secs:40}]});
  for (const elapsed of [20,74,28,0,90,64]) {
    const clock=t.at(elapsed).footprintClock;
    assert.equal(clock.now,elapsed);
    assert.equal(clock.at('pro',.25),15);
    assert.equal(clock.at('con',.25),68);
    assert.equal(clock.at('pro',.9),92);
  }
  for (const [now,speed,expected] of [[20,1,null],[21,1,21],[25,4,24],[23,4,null],[70,20,null]]) {
    assert.equal(t.at(now,speed).footprintClock.settledAt('pro',.31,.35,1),expected);
  }
});
