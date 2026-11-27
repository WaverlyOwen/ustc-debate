import assert from 'node:assert/strict';
import test from 'node:test';
import { createClimberModel } from '../web/climb/climber-model.js';
import { createParties } from '../web/climb/climbers.js';
import { createTerrain } from '../web/climb/terrain.js';

const terrain=createTerrain();
const moving={pro:true,con:true}, seconds={pro:150,con:150};
const dist=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));

test('a climber faces the ice and loads three fixed contacts while changing a pick or a front point',()=>{
  const angle=(a,b)=>{
    const dot=a.reduce((n,v,j)=>n+v*b[j],0);
    return Math.acos(Math.max(-1,Math.min(1,dot/(Math.hypot(...a)*Math.hypot(...b)))))*180/Math.PI;
  };
  for (const budget of [150,1020]) {
    const sample=createParties(),seen=new Set(),widths=[],loaded=[],directions=[];
    const ticks=budget*24;
    for (let tick=Math.floor(.70*ticks);tick<.94*ticks;tick++) {
      const p=tick/ticks;
      for (const m of sample(terrain,{pro:p,con:p},tick/24,moving,budget).members) {
        if (m.feature?.kind!=='ice') continue;
        const h=m.person.height,b=m.bones,floor=(x,z)=>terrain.surface(x,z)[1];
        const touching=p=>Math.abs(p[1]-floor(p[0],p[2]))<.012;
        const feet=m.legs.filter(leg=>leg.id && touching(leg.point)).length;
        const axes=m.icePicks.filter(k=>k.planted && touching(k.point)).length;
        assert.ok(feet+axes>=3,`${m.side}${m.rank} changing two contacts at once at ${p}`);
        if (m.feature.u<.10 || m.feature.u>.80) continue;
        const P=m.position;
        const uphill=[floor(P[0]+.14,P[2])-floor(P[0]-.14,P[2]),0,
          floor(P[0],P[2]+.14)-floor(P[0],P[2]-.14)];
        directions.push(angle([b.torso.z[0],0,b.torso.z[2]],uphill));
        const right=[b.torso.x[0],0,b.torso.x[2]];
        widths.push(Math.abs(right.reduce((n,v,k)=>n+v*(b.boot0.origin[k]-b.boot1.origin[k]),0))/(h*Math.hypot(...right)));
        for (const i of [0,1]) {
          const leg=m.legs[i],boot=b['boot'+i],pick=m.icePicks[i],thigh=b['thigh'+i],shin=b['shin'+i];
          const axis=thigh.y.map((v,k)=>v+shin.y[k]),length=Math.hypot(...axis);
          const along=thigh.y.reduce((n,v,k)=>n+v*axis[k],0)/(length*length);
          const bend=thigh.y.map((v,k)=>v-along*axis[k]);
          if (Math.hypot(...bend)>.25*h) {
            assert.ok(bend[0]*boot.z[0]+bend[2]*boot.z[2]>0,`inverted ice knee at ${p}`);
          }
          if (!leg.id) seen.add(m.side+m.rank+'kick'+i);
          if (pick.phase==='raise') seen.add(m.side+m.rank+'pick'+i);
          if (!leg.id) continue;
          assert.ok(angle(boot.z,[boot.z[0],0,boot.z[2]])<18,'toe lifted to lie parallel to the ice');
          assert.ok(Math.abs(leg.point[1]-floor(leg.point[0],leg.point[2]))<.008,'front point missed the ice');
          if (feet===1) loaded.push(angle(thigh.y,shin.y));
        }
      }
    }
    assert.equal(seen.size,24,'each of six climbers repositions both tools and both boots');
    for (const v of [widths,loaded,directions]) v.sort((a,b)=>a-b);
    assert.ok(widths[Math.floor(widths.length*.1)]>.53,'feet close together on the wall');
    assert.ok(directions[Math.floor(directions.length*.9)]<23,'shoulders turn away from the ice');
    assert.ok(loaded[Math.floor(loaded.length*.5)]<56,'climber hangs on a deeply buckled support knee');
  }
});

test('a belayer passes the brake hand from rope to ice tool without a one-frame jump in the stowed pole',()=>{
  const sample=createParties(),seen=new Map(),last=new Map();
  const ice=Object.values(terrain.features).flat().filter(f=>f.kind==='ice');
  const start=Math.floor((Math.min(...ice.map(f=>f.start))-.03)*10000);
  const end=Math.ceil((Math.max(...ice.map(f=>f.end))+.06)*10000);
  for (let tick=start;tick<=end;tick++) {
    const p=tick/10000;
    const party=sample(terrain,{pro:p,con:p},150*p,moving,seconds).members;
    for (const m of party) {
      const pole=m.bones.pole1||m.carriedTools.pole1;
      if (!pole) continue;
      const id=m.side+m.rank,old=last.get(id);
      const handingOver=m.cooperation?.role==='belay' && m.icePicks?.[1]?.phase==='transfer';
      const pose=[pole.origin,pole.origin.map((v,i)=>v+pole.y[i]),m.bones.hand1.origin];
      if (handingOver || old?.handingOver) {
        assert.notEqual(pole.location,'hand','the brake hand stays free throughout the handover');
        seen.set(id,(seen.get(id)||0)+1);
        if (old) pose.forEach((point,i)=>{
          const travel=dist(point,old.pose[i]);
          assert(travel<.16*m.person.height,`${id} joint ${i} moved ${travel} in 15 ms at ${p}`);
        });
      }
      last.set(id,{pose,handingOver});
    }
  }
  for (const side of ['pro','con']) for (const rank of [0,2]) assert((seen.get(side+rank)||0)>20);
});

test('each climber takes both axes from the pack before stepping onto ice and replaces them after the lip',()=>{
  const sample=createParties(), snow=sample(terrain,{pro:.55,con:.55},0,moving,seconds).members;
  for (const m of snow) {
    for (let i=0;i<2;i++) {
      assert.equal(m.carriedTools?.['axe'+i]?.location,'pack');
      if (m.rank!==1||!i) assert.equal(m.bones['pole'+i].location,'hand');
    }
  }
  const contact=new Set(), strokes=new Set(), mixed=new Set(), stationary=new Set(), last=new Map();
  for (let n=0;n<=1100;n++) {
    const p=.63+n/3200, party=sample(terrain,{pro:p,con:p},p*150,moving,seconds).members;
    for (const side of ['pro','con']) {
      const team=party.filter(m=>m.side===side);
      if (team.some(m=>m.feature?.kind==='ice')&&team.some(m=>m.bones.pole0?.location==='hand')) mixed.add(side);
    }
    for (const m of party) {
      if (m.feature?.kind!=='ice') continue;
      for (let i=0;i<2;i++) {
        const id=m.side+m.rank+i, axe=m.bones['axe'+i], hand=m.bones['hand'+i], pick=m.icePicks[i];
        assert.equal(axe.location,'hand',id);
        assert(dist(axe.origin,hand.origin)<1e-7,id);
        assert.equal(m.bones['pole'+i],undefined);
        if (m.rank!==1||!i) {
          const packed=m.carriedTools['pole'+i];
          assert.equal(packed.location,'pack');
          assert(Math.hypot(...packed.y)<1.5*m.person.height,id);
        }
        if (pick.planted) {
          assert(dist(axe.origin.map((v,j)=>v+axe.y[j]),pick.contact)<.015,id);
          contact.add(id);
          const old=last.get(id);
          if (old&&dist(old.wall,pick.contact)<1e-7&&dist(old.body,m.position)>.0001) stationary.add(id);
          last.set(id,{wall:pick.contact,body:m.position});
        }
        if (pick.phase==='raise' && dist(pick.point,pick.contact)>.4*m.person.height) strokes.add(id);
      }
    }
  }
  assert.equal(mixed.size,2);
  assert.equal(contact.size,12);
  assert.equal(stationary.size,12);
  assert.equal(strokes.size,12);
});

test('the ice axe has a hooked steel pick, a flared opposing adze and a separate colored shaft',()=>{
  const person=createParties()(terrain,{pro:0,con:0},0,moving).members[0].person;
  const model=createClimberModel(person);
  const {vertices:blade}=model.find(p=>p.bone==='axe0'&&p.name==='ice-pick');
  const {vertices:adze}=model.find(p=>p.bone==='axe0'&&p.name==='ice-adze');
  assert(blade.some(p=>dist(p,[0,1,0])<1e-8));
  assert(Math.max(...blade.map(p=>p[2]))>.50 && Math.max(...blade.map(p=>p[1]))>1.12);
  assert(Math.max(...adze.map(p=>p[2]))>.74 && Math.max(...adze.map(p=>p[0]))>.14);
  const shaft=model.find(p=>p.bone==='axe0'&&p.name==='axe-shaft');
  assert(new Set(shaft.faces.map(f=>f.color)).size>=3);
});
