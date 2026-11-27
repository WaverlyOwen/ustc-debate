import assert from 'node:assert/strict';
import test from 'node:test';
import {createTerrain} from '../web/climb/terrain.js';
import {createParties} from '../web/climb/climbers.js';
import {createClimberModel} from '../web/climb/climber-model.js';
import {createPartyRenderer} from '../web/climb/party-renderer.js';

function node() {
  return {ownerDocument:{createElementNS:node},appendChild(){},replaceChildren(){},setAttribute(){},removeAttribute(){}};
}

const subtract=(a,b)=>a.map((v,i)=>v-b[i]);
const unit=v=>v.map(n=>n/Math.hypot(...v));
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const angle=(a,b)=>Math.acos(Math.min(1,Math.max(-1,dot(unit(a),unit(b)))));

test('the clothing follows the thigh, kneecap and rear calf around to the ankle',()=>{
  const terrain=createTerrain('poster'),sample=createParties();
  const climber=sample(terrain,{pro:0,con:0},0,{pro:false,con:false},'poster',150).members[0];
  const model=createClimberModel(climber.person);
  const sections=bone=>{
    const part=model.find(mesh=>mesh.bone===bone);
    return [...new Set(part.vertices.map(p=>p[1]))].map(y=>{
      const ring=part.vertices.filter(p=>p[1]===y);
      for (let i=0;i<ring.length;i++) {
        const a=ring[(i+ring.length-1)%ring.length],b=ring[i],c=ring[(i+1)%ring.length];
        assert.ok(angle(subtract(b,a),subtract(c,b))<Math.PI/4,'a long flat panel ends in a sharp corner');
      }
      return {y,width:Math.max(...ring.map(p=>p[0]))-Math.min(...ring.map(p=>p[0])),
        front:Math.max(...ring.map(p=>p[2])),back:-Math.min(...ring.map(p=>p[2]))};
    });
  };
  const thighs=sections('thigh0'),shins=sections('shin0'),knee=shins[0],ankle=shins.at(-1);
  const calf=shins.filter(r=>r.y>.20 && r.y<.65).reduce((a,b)=>a.back>b.back?a:b);
  assert.ok(Math.max(...thighs.map(r=>r.width))>knee.width*1.27);
  assert.ok(calf.width>knee.width*1.10 && calf.width>ankle.width*1.24);
  assert.ok(calf.back>knee.back*1.25 && calf.front<knee.front);
});

test('the two trouser panels share a moving hem through snow, bridge and ice poses',()=>{
  const terrain=createTerrain('poster'),sample=createParties(),render=createPartyRenderer(),parent=node();
  const poses=new Set(),models=new Map();
  let flexions=0;
  for (let tick=0;tick<=250;tick++) {
    const p=tick/250;
    const members=sample(terrain,{pro:p,con:p},p*150,{pro:true,con:true},'poster',150).members;
    for (const m of members) {
      if (!models.has(m.person)) models.set(m.person,createClimberModel(m.person));
      const foot=(tick+m.rank)%2,upper='thigh'+foot,lower='shin'+foot;
      const shapes=models.get(m.person).filter(s=>s.bone===upper||s.bone===lower);
      const world=[];
      const project=(v,out={})=>{
        world.push(v.slice());
        return Object.assign(out,{x:v[0]*50,y:-v[1]*50,depth:150-v[2],scale:50});
      };
      render(parent,project,[{...m,rank:0,groundShadow:[],carriedTools:null,
        bones:{[upper]:m.bones[upper],[lower]:m.bones[lower]}}],'poster',terrain);
      // The projector receives the climber's centre, then the vertices of both panels.
      const n=shapes[0].vertices.length,upperPoints=world.slice(1,1+n),lowerPoints=world.slice(1+n);
      const rings=(shape,points,y)=>shape.vertices.flatMap((v,i)=>v[1]===y?[points[i]]:[]);
      const top=rings(shapes[0],upperPoints,1),bottom=rings(shapes[1],lowerPoints,0);
      assert.equal(top.length,bottom.length);
      for (const [panel,end] of [[shapes[0],1],[shapes[1],0]]) {
        assert.ok(panel.faces.every(f=>f.indices.some(i=>panel.vertices[i][1]!==end)),'closed cap across knee');
      }
      for (let i=0;i<top.length;i++) {
        const gap=Math.hypot(...top[i].map((v,k)=>v-bottom[i][k]));
        assert.ok(gap<1e-8,`${m.side}${m.rank} knee opens ${gap} units at route fraction ${p}`);
        assert.ok(top[i][1]>=terrain.surface(top[i][0],top[i][2])[1]-.012);
      }
      const thigh=m.bones[upper],shin=m.bones[lower],bend=angle(thigh.y,shin.y);
      if (bend>Math.PI/3) {
        // Find the tip of the kneecap. Its outer fabric should turn across several
        // panels, without carrying the entire bend as a sharp edge at the common ring.
        const outside=subtract(unit(thigh.y),unit(shin.y));
        const tip=top.reduce((best,v,i)=>dot(v,outside)>dot(top[best],outside)?i:best,0);
        const before=upperPoints.at(-2*top.length+tip),after=lowerPoints[top.length+tip];
        const corner=angle(subtract(top[tip],before),subtract(after,top[tip]));
        assert.ok(corner<bend*.9,`outer knee folds at one edge on ${m.side}${m.rank}, p=${p}`);
        flexions++;
      }
      poses.add(m.side+'/'+(m.feature?.kind||'snow'));
    }
  }
  assert.equal(poses.size,6);
  assert.ok(flexions>300);
});
