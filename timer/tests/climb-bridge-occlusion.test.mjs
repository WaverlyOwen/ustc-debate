import assert from 'node:assert/strict';
import test from 'node:test';
import { PerspectiveCamera, Vector3 } from '../web/vendor/three-0.187.0/build/three.core.js';
import { createTerrain } from '../web/climb/terrain.js';
import { createParties } from '../web/climb/climbers.js';
import { createClimberModel, kneeSection, posedVertex } from '../web/climb/climber-model.js';
import { createPartyRenderer } from '../web/climb/party-renderer.js';

function svgNode() {
  return {children:[],attributes:{},ownerDocument:{createElementNS:svgNode},
    appendChild(node){this.children.push(node);},replaceChildren(){this.children=[];},
    setAttribute(key,value){this.attributes[key]=value;},removeAttribute(key){delete this.attributes[key];}};
}

// An independent screen ray intersects the actual triangular surfaces. Compare
// the nearest metal and limb with the fill left in the renderer's SVG path.
function triangles(points) {
  return points.slice(2).map((c,i)=>{
    const a=points[0],b=points[i+1];
    const bx=b.x-a.x,by=b.y-a.y,cx=c.x-a.x,cy=c.y-a.y,det=bx*cy-by*cx;
    return {points:[a,b,c], depth(x,y){
      if (Math.abs(det)<.00001) return Infinity;
      const u=((x-a.x)*cy-(y-a.y)*cx)/det,v=(bx*(y-a.y)-by*(x-a.x))/det;
      return u>=0 && v>=0 && u+v<=1 ? 1/((1-u-v)/a.depth+u/b.depth+v/c.depth) : Infinity;
    }};
  });
}

function contains(poly,x,y) {
  let inside=false;
  for (let i=0,j=poly.length-1;i<poly.length;j=i++) {
    const a=poly[i],b=poly[j];
    if ((a[1]>y)!==(b[1]>y) && x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
  }
  return inside;
}

const terrain=createTerrain('poster');

// Isolate the first of eight rope segments (x=10..20). The party stands out
// of frame so only its rope is rendered against these projected bridge faces.
function ropeAtRails(rails) {
  const group=svgNode(),metal=rails.flatMap(([left,right,nearLeft,nearRight=nearLeft])=>
    triangles([{x:left,y:0,depth:nearLeft},{x:right,y:0,depth:nearRight},
      {x:right,y:20,depth:nearRight},{x:left,y:20,depth:nearLeft}]));
  let visits=0;
  const project=(p,out={})=>Object.assign(out,{x:p[0],y:p[1],depth:p[2],scale:1});
  Object.assign(project,{width:100,height:100,
    terrainDepth:(x,y)=>Math.min(Infinity,...metal.map(f=>f.depth(x,y))),
    bridgeOverlaps:(left,right)=>rails.some(([a,b])=>a<right && b>left),
    visitOccluders:(_box,_far,visit)=>{visits++;for(const f of metal) visit(...f.points);}});
  const members=[0,1].map(rank=>({side:'pro',rank,person:{side:'pro',rank,skin:'#ded2ac',hair:'#453122',light:'#bbbbbb'},
    harness:[10+80*rank,10,10],position:[-100,0,10],bones:{}}));
  createPartyRenderer()(group,project,members,'poster',null);
  return {paths:group.children.at(-1).children.map(node=>node.attributes),visits};
}

function ropeXs(path) {
  return Array.from(path.matchAll(/[ML]([-\d.]+),/g),m=>Number(m[1]));
}

test('thin bridge rails clip a rope between visible endpoints and preserve clear segments',()=>{
  const clear=ropeAtRails([]),overlap=ropeAtRails([[13,14,5],[16,17,4],[11,12,18],[16.5,18,6]]);
  assert.equal(clear.visits,0);
  assert.deepEqual(ropeXs(overlap.paths[0].d),[10,13,14,16,18,20]);
  assert.equal(overlap.visits,1);
  assert.equal(overlap.paths[0]['stroke-linecap'],'butt');
  assert.deepEqual(overlap.paths.slice(1),clear.paths.slice(1));
  assert.deepEqual(ropeAtRails([[13,14,18]]).paths,clear.paths);
});

test('a rope behind both rails remains visible in their gap and on its side of a depth crossing',()=>{
  assert.deepEqual(ropeXs(ropeAtRails([[8,11,5],[19,21,5]]).paths[0].d),[11,19]);
  const crossed=ropeXs(ropeAtRails([[10,20,8,1/.075]]).paths[0].d);
  assert.equal(crossed.length,2);
  assert.ok(Math.abs(crossed[0]-15)<.03);
  assert.equal(crossed[1],20);
});

for (const [side,p] of [['con',.215],['pro',.306]]) {
  test(side+' bridge hardware occludes the interior of the near party’s trousers and boots',()=>{
    const feature=terrain.features[side].find(f=>f.kind==='ladder');
    const center=feature.contact(.5),end=feature.contact(1),start=feature.contact(0);
    const direction=new Vector3(start[2]-end[2],0,end[0]-start[0]).normalize();
    if (direction.z<0) direction.negate();
    const camera=new PerspectiveCamera(35,1440/900,.2,1000);
    camera.position.set(...center).addScaledVector(direction,29);
    camera.position.y+=15;
    camera.lookAt(center[0],center[1]+1.1,center[2]);camera.updateMatrixWorld();
    const vector=new Vector3();
    const project=(point,out={})=>{
      vector.set(...point).applyMatrix4(camera.matrixWorldInverse);
      const depth=-vector.z;
      vector.applyMatrix4(camera.projectionMatrix);
      return Object.assign(out,{x:720*(1+vector.x),y:450*(1-vector.y),depth,scale:1427/depth});
    };
    const metal=terrain.faces.filter(face=>face.bridgeHardware && face.points.every(point=>
      Math.hypot(...point.map((v,i)=>v-center[i]))<14)).flatMap(f=>triangles(f.points.map(p=>project(p))));
    const nearest=(faces,x,y)=>faces.reduce((d,t)=>Math.min(d,t.depth(x,y)),Infinity);
    Object.assign(project,{width:1440,height:900,terrainDepth:(x,y)=>nearest(metal,x,y),
      bridgeOverlaps:()=>true,visitOccluders:(_box,_far,visit)=>metal.forEach(t=>visit(...t.points))});
    const sample=createParties(), progress={pro:.47,con:.47,[side]:p};
    const {members}=sample(terrain,progress,p*150,{pro:true,con:true},'poster',150);
    let nearer=0,farther=0,leaks=0,holes=0;
    for (const member of members.filter(person=>person.side===side)) {
      const limbs=createClimberModel(member.person).filter(part=>/^(boot|thigh|shin)[01]$/.test(part.bone));
      const body=limbs.flatMap(part=>{
        const bones=member.bones,leg=part.knee?.leg;
        const joint=part.knee && kneeSection(bones['thigh'+leg],bones['shin'+leg]);
        const points=part.vertices.map((_,i)=>project(posedVertex(part,i,bones[part.bone],joint)));
        return part.faces.flatMap(face=>triangles(face.indices.map(i=>points[i])));
      });
      const group=svgNode(), bones=Object.fromEntries(limbs.map(part=>[part.bone,member.bones[part.bone]]));
      createPartyRenderer()(group,project,[{...member,rank:0,bones,carriedTools:null}],'poster',terrain);
      const fills=group.children.at(-1).children.filter(node=>node.attributes.fill!=='none')
        .flatMap(node=>node.attributes.d.match(/M[^MZ]+/g)||[])
        .map(loop=>Array.from(loop.matchAll(/[ML]([-\d.]+),([-\d.]+)/g),m=>[+m[1],+m[2]]));
      for (const {points:[a,b,c]} of metal) for (let i=1;i<9;i++) for (let j=1;j<10-i;j++) {
        const u=i/10,v=j/10,x=a.x+(b.x-a.x)*u+(c.x-a.x)*v,y=a.y+(b.y-a.y)*u+(c.y-a.y)*v;
        const limb=nearest(body,x,y), bridge=nearest(metal,x,y);
        if (!Number.isFinite(limb)||Math.abs(bridge-limb)<.16) continue;
        const painted=fills.some(poly=>contains(poly,x,y));
        if (bridge<limb) {nearer++;if (painted) leaks++;}
        else {farther++;if (!painted) holes++;}
      }
    }
    assert(nearer>20 && farther>20,'both depth orders must be visible');
    assert.equal(leaks,0,leaks+' of '+nearer+' nearer bridge samples were overpainted');
    assert.equal(holes,0,holes+' of '+farther+' foreground clothing samples were lost');
  });
}
