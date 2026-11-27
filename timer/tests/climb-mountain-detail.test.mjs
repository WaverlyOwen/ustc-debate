import assert from 'node:assert/strict';
import test from 'node:test';
import { createTerrain } from '../web/climb/terrain.js';

test('snowfields have a raised, sloping shoulder joined to an exposed firn edge', () => {
  const mountain=createTerrain();
  const rims=mountain.faces.filter(face=>face.material==='firn');
  assert.ok(rims.length>40,'Snow needs exposed thickness across the massif');
  const shoulders=mountain.faces.filter(face=>face.snowShoulder);
  const tips=new Set(shoulders.flatMap(face=>face.points.map(p=>p.map(v=>v.toFixed(5)).join('/'))));
  let deep=0, west=0, east=0;
  for (const rim of rims) {
    if (rim.points.length!==4) continue;
    const [a,b,topB,topA]=rim.points;
    if (a[0]!==topA[0] || b[2]!==topB[2]) continue;
    const thickness=(topA[1]-a[1]+topB[1]-b[1])/2;
    if (thickness<.45) continue;
    if (![topA,topB].every(p=>tips.has(p.map(v=>v.toFixed(5)).join('/')))) continue;
    deep++;
    if (a[0]<-10 && a[2]>-20) west++;
    if (a[0]>10 && a[2]>-20) east++;
  }
  assert.ok(deep>25 && west>5 && east>5,'Both slopes need connected snow caps and exposed sides');
  for (const face of shoulders) {
    const mid=face.points.reduce((v,p)=>v.map((n,i)=>n+p[i]/face.points.length),[0,0,0]);
    assert.ok(Math.abs(mountain.surface(mid[0],mid[2])[1]-mid[1])<1e-5,
      'Contact height must match the carved shoulder');
  }
});
test('mountain drawings stay within the solid surface that owns them', () => {
  const terrain = createTerrain();
  for (const face of terrain.faces) {
    if (!face.details || !['rock','snow'].includes(face.material)) continue;
    const [origin,...rest] = face.points;
    const area = rest.slice(0,-1).reduce((total,p,i) => {
      const q = rest[i+1];
      return total + (p[0]-origin[0])*(q[2]-origin[2]) - (p[2]-origin[2])*(q[0]-origin[0]);
    },0);
    const touching = face.details.flatMap(detail=>detail.points);
    const xs=face.points.map(p=>p[0]),zs=face.points.map(p=>p[2]);
    for (const point of touching) {
      assert.ok(point.every(Number.isFinite));
      // A clipping plane through a vertex can reduce its owner to a line
      // or point. Such a patch must never paint a full stroke across the sky.
      assert.ok(point[0]>=Math.min(...xs)-1e-6 && point[0]<=Math.max(...xs)+1e-6 &&
        point[2]>=Math.min(...zs)-1e-6 && point[2]<=Math.max(...zs)+1e-6);
    }
    if (Math.abs(area)<1e-7) continue;
    for (const [i,a] of face.points.entries()) {
      const b=face.points[(i+1)%face.points.length], dx=b[0]-a[0], dz=b[2]-a[2];
      for (const point of touching) {
        const side=dx*(point[2]-a[2])-dz*(point[0]-a[0]);
        assert.ok(side*Math.sign(area)>=-1e-6,'A drawing extended beyond a clipped mountain face');
      }
    }
    // Use the triangle with the widest base in plan. A clipped polygon can
    // begin with coincident or collinear points where the ice meets the bank.
    let determinant = 0, slopeX, slopeZ;
    for (let i=1; i<rest.length; i++) {
      const [ax,ay,az]=rest[i-1].map((n,k)=>n-origin[k]);
      const [bx,by,bz]=rest[i].map((n,k)=>n-origin[k]);
      const det=ax*bz-az*bx;
      if (Math.abs(det)<=Math.abs(determinant)) continue;
      determinant=det;
      slopeX=(ay*bz-az*by)/det;
      slopeZ=(ax*by-ay*bx)/det;
    }
    for (const [x,y,z] of touching) {
      const onFace=origin[1]+slopeX*(x-origin[0])+slopeZ*(z-origin[2]);
      assert.ok(Math.abs(y-onFace)<1e-5,'A drawing lifted off its supporting face');
    }
  }
});
