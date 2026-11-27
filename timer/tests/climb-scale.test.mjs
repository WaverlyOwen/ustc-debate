import assert from 'node:assert/strict';
import test from 'node:test';
import { createTerrain } from '../web/climb/terrain.js';

const gap=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));
const near=(x,y,tolerance=1e-6)=>assert(Math.abs(x-y)<=tolerance,`${x} differs from ${y}`);

// Survey stations and arclengths measured on the original one-unit relief.
const survey={
  pro:{stations:[[-46,10.143711044,29],[-33.225816986,24.411604523,11.328441805],
    [-23.040883579,36.146205456,-1.720748690],[-3.7,63,-7.7]],
    distance:105.730446628,walkingDistance:103.866917683,bridgeLength:7.18415337645,rungSpacing:.65310485240},
  con:{stations:[[49,13.104483350,29],[36.835488915,26.183175099,5.259278853],
    [24.274153266,38.066524859,-4.401356372],[1.7,63,-7.7]],
    distance:96.557983363,walkingDistance:96.125728670,bridgeLength:6.75850208777,rungSpacing:.67585020878},
};

function onTriangle([x,y,z],a,b,c) {
  const bx=b[0]-a[0],bz=b[2]-a[2],cx=c[0]-a[0],cz=c[2]-a[2],det=bx*cz-bz*cx;
  if (Math.abs(det)<1e-8) return false;
  const u=((x-a[0])*cz-(z-a[2])*cx)/det,v=(bx*(z-a[2])-bz*(x-a[0]))/det;
  return u>=-1e-7 && v>=-1e-7 && u+v<=1+1e-7 && Math.abs(y-a[1]-u*(b[1]-a[1])-v*(c[1]-a[1]))<1e-6;
}

const mountain=createTerrain();
test('the summit, mountain and both measured routes use twice the surveyed dimensions',()=>{
  assert.equal(mountain.scale,2);
  near(gap(mountain.summit,[-2,126,-15.542309701]),0);
  const vertices=mountain.faces.filter(face=>face.material).flatMap(face=>face.points);
  near(Math.min(...vertices.map(p=>p[2])),-91.996880028);
  near(Math.max(...vertices.map(p=>p[2])),520);
  near(Math.min(...vertices.map(p=>p[0])),-285.6);
  near(Math.max(...vertices.map(p=>p[0])),285.6);
  for (const [side,record] of Object.entries(survey)) {
    for (const [i,p] of [0,.33,.58,1].entries()) {
      near(gap(mountain.route(side,p),record.stations[i].map(n=>2*n)),0);
    }
    let last=mountain.route(side,0),distance=0,lastWalking=last,walkingDistance=0;
    for (let i=1;i<=4000;i++) {
      const point=mountain.route(side,i/4000);
      near(point[1],mountain.surface(point[0],point[2])[1]);
      distance+=gap(last,point);last=point;
      if (i%10===0) {walkingDistance+=gap(lastWalking,point);lastWalking=point;}
    }
    near(distance,2*record.distance);
    near(walkingDistance,2*record.walkingDistance);
  }
});

test('rungs, handlines and ice contacts retain human dimensions on the enlarged mountain',()=>{
  const hardware=mountain.faces.filter(face=>face.bridgeHardware).flatMap(face=>face.points);
  const iceMesh=mountain.faces.filter(face=>face.material==='ice').flatMap(({points})=>
    points.slice(2).map((p,i)=>[points[0],points[i+1],p]));
  for (const [side,record] of Object.entries(survey)) {
    const bridge=mountain.features[side].find(f=>f.kind==='ladder');
    const length=gap(bridge.contact(0),bridge.contact(1));
    near(length,2*record.bridgeLength);
    near(length/bridge.steps,record.rungSpacing);
    for (let j=0;j<=bridge.steps;j++) {
      const u=j/bridge.steps,sole=bridge.contact(u);
      near(gap(bridge.contact(u,.67),bridge.contact(u,-.67)),1.34);
      for (const sign of [-1,1]) {
        const end=bridge.contact(u,sign*.67);
        assert(hardware.some(point=>gap(point,end)<1e-7),'missing rung under the boot');
        const hand=bridge.handhold(u,sign);
        near(Math.hypot(hand[0]-sole[0],hand[2]-sole[2]),.95);
        near(hand[1]-sole[1],1.96-.8*u*(1-u));
        assert(hardware.some(point=>gap(point,hand)<.038),'handline misses its handhold');
      }
    }
    const ice=mountain.features[side].find(f=>f.kind==='ice');
    for (const u of [.1,.3,.5,.7,.9]) {
      const center=ice.contact(u);
      for (const lane of [-.47,.47]) {
        const axe=ice.contact(u,lane);
        near(Math.hypot(axe[0]-center[0],axe[2]-center[2]),Math.abs(lane));
        near(axe[1],mountain.surface(axe[0],axe[2])[1]);
        assert(iceMesh.some(triangle=>onTriangle(axe,...triangle)),'axe contact must land on a rendered ice facet');
      }
    }
  }
});
