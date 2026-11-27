import assert from 'node:assert/strict';
import test from 'node:test';
import { createParties } from '../web/climb/climbers.js';
import { createClimberModel, kneeSection, posedVertex } from '../web/climb/climber-model.js';
import { createTerrain } from '../web/climb/terrain.js';

const terrain=createTerrain('poster');

test('collision ceilings include snow lips, bridge banks and the area outside the survey',()=>{
  const surface=terrain.surface;
  function check(x,z,r) {
    const bound=surface.maxHeight(x-r,x+r,z-r,z+r);
    for (const dx of [-r,0,r]) for (const dz of [-r,0,r]) {
      assert.ok(surface(x+dx,z+dz)[1]<=bound,'upper bound too low at '+[x+dx,z+dz]);
    }
  }
  // This lip crosses the zero-depth contour inside its parent triangle.
  check(71.32501386073108,24.086826460558942,.13);
  for (const f of terrain.faces.filter(f=>f.snowShoulder || f.material==='firn')) {
    for (const [x,,z] of f.points) check(x,z,.13);
  }
  for (const side of ['pro','con']) {
    const bridge=terrain.features[side].find(f=>f.kind==='ladder');
    for (const u of [0,.01,.25,.5,.75,.99,1]) for (const lane of [-2,-.95,-.6,0,.6,.95,2]) {
      const p=bridge.contact(u,lane);
      check(p[0],p[2],.25);
    }
  }
  assert.equal(surface.maxHeight(-500,500,-62,76),Infinity);
  check(-185,85,3);
});

test('broad-phase rejection gives the same knee positions as the exact custom surface',()=>{
  const fast=createParties(),exact=createParties(),walking={pro:true,con:true};
  const custom={...terrain,surface:(x,z)=>terrain.surface(x,z)};
  for (const start of [.14,.22,.315,.52,.75,.83,.96]) for (let i=0;i<18;i++) {
    const p=start+i/3600,time=p*150,progress={pro:p,con:p};
    const a=fast(terrain,progress,time,walking,'poster',150).members;
    const b=exact(custom,progress,time,walking,'poster',150).members;
    for (const [j,m] of a.entries()) for (const bone of ['shin0','shin1']) {
      assert.deepEqual(m.bones[bone].origin,b[j].bones[bone].origin);
    }
  }
});
const axes=[[1,0,0],[0,1,0],[0,0,1]];
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const distance=(a,b)=>Math.hypot(...sub(a,b));

// Independent separating-axis test on the rendered meshes. A trouser and
// a gaiter meet at the same knee by design. Test the nine opposite-side pairs.
function separated(a,b) {
  function divides(axis) {
    const length=Math.hypot(...axis);
    if (length<1e-8) return false;
    const av=a.points.map(p=>dot(p,axis)),bv=b.points.map(p=>dot(p,axis));
    const gap=Math.max(Math.min(...av)-Math.max(...bv),Math.min(...bv)-Math.max(...av));
    return gap>=-.005*length;
  }
  if (axes.some(divides)) return true;
  for (const shape of [a,b]) for (const f of shape.faces) {
    const [p,q,r]=f.indices.map(i=>shape.points[i]);
    if (divides(cross(sub(q,p),sub(r,p)))) return true;
  }
  return a.edges.some(e=>b.edges.some(f=>divides(cross(e,f))));
}

function posedMesh(model,bone,skeleton) {
  const leg=model.knee?.leg,joint=model.knee && kneeSection(skeleton['thigh'+leg],skeleton['shin'+leg]);
  const points=model.vertices.map((_,i)=>posedVertex(model,i,bone,joint));
  const edges=[],checks=points.slice();
  for (const face of model.faces) for (let i=0;i<face.indices.length;i++) {
    const a=face.indices[i],b=face.indices[(i+1)%face.indices.length];
    if (a>b) continue;
    edges.push(sub(points[a],points[b]));
    checks.push(points[a].map((v,k)=>(v+points[b][k])*.5));
  }
  return {points,edges,checks,faces:model.faces};
}

test('ordinary uphill steps bend toward the toe and pass over an unlocked support knee',()=>{
  const unit=v=>v.map(n=>n/Math.hypot(...v));
  const angle=(a,b)=>Math.acos(Math.max(-1,Math.min(1,dot(unit(a),unit(b)))))*180/Math.PI;
  const quantile=(sorted,q)=>sorted[Math.floor(q*(sorted.length-1))];
  for (const seconds of [150,1020]) {
    const sample=createParties(),swing=[],stance=[],loaded=[];
    for (const start of [.13,.145,.52,.54]) for (let frame=0;frame<240;frame++) {
      const t=start*seconds+frame/24,p=t/seconds;
      const members=sample(terrain,{pro:p,con:p},t,{pro:true,con:true},'poster',seconds).members;
      for (const m of members) {
        if (m.equipment || m.cooperation || m.slope<.05) continue;
        for (const i of [0,1]) {
          const thigh=m.bones['thigh'+i],shin=m.bones['shin'+i],toe=m.bones['boot'+i].z;
          const ankle=shin.origin.map((v,k)=>v+shin.y[k]);
          const axis=unit(sub(ankle,thigh.origin)),knee=sub(shin.origin,thigh.origin);
          const along=dot(knee,axis),bend=knee.map((v,k)=>v-along*axis[k]);
          if (Math.hypot(...bend)>.25*m.person.height) {
            const inAir=m.legs[i].swing>0 && m.legs[i].swing<1;
            (inAir?swing:stance).push(angle([bend[0],0,bend[2]],[toe[0],0,toe[2]]));
          }
          if (m.drive>.75 && i!==(m.step.index+m.person.seed)%2) loaded.push(angle(thigh.y,shin.y));
        }
      }
    }
    for (const phase of [swing,stance]) {
      phase.sort((a,b)=>a-b);
      assert.ok(phase.length>100,`too few ordinary bent knees at ${seconds}s`);
      assert.ok(quantile(phase,.9)<30,`knees flare sideways at ${seconds}s`);
      assert.ok(phase.at(-1)<90,`knee bends behind its toe at ${seconds}s`);
    }
    loaded.sort((a,b)=>a-b);
    assert.ok(quantile(loaded,.1)>15 && quantile(loaded,.5)<40,`locked or crouched support knee at ${seconds}s`);
  }
});

test('the raised boot and gaiter clear their own parka through the summit hand-up',()=>{
  const models=new Map();
  for (const seconds of [150,540,1020]) {
    const sample=createParties(),ticks=seconds*24;
    for (let tick=Math.floor(ticks*.90);tick<=ticks;tick++) {
      const p=tick/ticks;
      const members=sample(terrain,{pro:p,con:p},tick/24,{pro:true,con:true},'poster',seconds).members;
      for (const m of members) {
        const id=m.side+m.rank;
        if (!models.has(id)) {
          const parts=createClimberModel(m.person);
          models.set(id,{coat:parts.find(part=>part.name==='parka'),
            legs:parts.filter(part=>/^(shin|boot)[01]$/.test(part.bone))});
        }
        const {coat,legs}=models.get(id),jacket=posedMesh(coat,m.bones.torso);
        for (const part of legs) {
          const limb=posedMesh(part,m.bones[part.bone],m.bones);
          if (!separated(jacket,limb)) assert.fail(`${id} ${part.bone} enters its parka at ${p} (${seconds}s)`);
        }
      }
    }
  }
});

test('both teams clear snow, ice, bridge ends and the opposite shoe with the actual mesh',()=>{
  const models=new Map(),kinds=new Set();
  for (const [seconds,running,count] of [[150,true,1500],[1020,true,740],[150,false,600]]) {
    const sample=createParties(),moving={pro:running,con:running};
    for (let tick=0;tick<=count;tick++) {
      const p=tick/count;
      for (const m of sample(terrain,{pro:p,con:p},p*seconds,moving,'poster',seconds).members) {
        const id=m.side+m.rank;
        if (!models.has(id)) models.set(id,createClimberModel(m.person).filter(o=>/^(thigh|shin|boot)[01]$/.test(o.bone)));
        kinds.add(m.feature?.kind||'snow');
        const legs=[[],[]];
        for (const model of models.get(id)) {
          const shape=posedMesh(model,m.bones[model.bone],m.bones);
          legs[Number(model.bone.at(-1))].push(shape);
          for (const [x,y,z] of shape.checks) {
            const gap=y-terrain.surface(x,z)[1];
            if (gap<-.012) assert.fail(`${id} ${model.bone} at ${p} below the surface by ${-gap}`);
          }
        }
        for (const a of legs[0]) for (const b of legs[1]) {
          if (!separated(a,b)) assert.fail(`${id} has intersecting legs at ${p}`);
        }
      }
    }
  }
  assert.deepEqual([...kinds].sort(),['ice','ladder','snow']);
});

test('a planted boot stays fixed and a loaded knee follows the same bend through switchbacks',()=>{
  const sample=createParties(),moving={pro:true,con:true},travel=[];
  let prior;
  for (let tick=0;tick<=3600;tick++) {
    const p=tick/3600,group=sample(terrain,{pro:p,con:p},tick/24,moving,'poster',150).members;
    if (prior) for (let i=0;i<group.length;i++) for (const foot of [0,1]) {
      const a=prior[i],b=group[i],boot='boot'+foot,knee='shin'+foot;
      if (b.legs[foot].id && b.legs[foot].id===a.legs[foot].id) {
        assert.deepEqual(a.bones[boot],b.bones[boot]);
      }
      travel.push(distance(a.bones[knee].origin,b.bones[knee].origin));
    }
    prior=group;
  }
  travel.sort((a,b)=>a-b);
  assert.ok(travel.at(-1)<.55,`single-frame knee travel ${travel.at(-1)}`);
  assert.ok(travel[Math.floor(.999*travel.length)]<.32);
});

test('the rendered banks leave room for planted boots at both ends of each bridge',()=>{
  const sample=createParties();
  const who=sample(terrain,{pro:0,con:0},0,{pro:true,con:true}).members[0].person;
  const boots=[0,1].map(i=>createClimberModel(who).find(part=>part.bone==='boot'+i));
  for (const side of ['pro','con']) {
    const bridge=terrain.features[side][0];
    const nearby=terrain.faces.filter(face=>{
      if (!face.material) return false;
      const uv=face.points.map(([x,,z])=>bridge.local(x,z));
      return ![v=>v[0]<-.2,v=>v[0]>1.2,v=>v[1]<-2,v=>v[1]>2].some(outside=>uv.every(outside));
    });
    let count=0;
    for (const landing of sample.footfalls(terrain,side,1,150)) {
      const [u,lane]=bridge.local(landing.position[0],landing.position[2]);
      if (u<-.1 || u>1.1 || Math.abs(lane)>1.5) continue;
      count++;
      for (const [x,y,z] of posedMesh(boots[landing.foot],landing.frame).checks) {
        for (const {points} of nearby) {
          const a=points[0];
          for (let i=1;i+1<points.length;i++) {
            const b=sub(points[i],a),c=sub(points[i+1],a),det=b[0]*c[2]-b[2]*c[0];
            if (Math.abs(det)<1e-8) continue;
            const s=((x-a[0])*c[2]-(z-a[2])*c[0])/det;
            const t=(b[0]*(z-a[2])-b[2]*(x-a[0]))/det;
            if (s>=0 && t>=0 && s+t<=1) {
              assert(y+.012>=a[1]+s*b[1]+t*c[1],`rendered bank intersects ${landing.id}`);
            }
          }
        }
      }
    }
    assert(count>5);
  }
});
