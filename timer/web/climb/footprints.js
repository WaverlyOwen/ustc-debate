import { frontPoints, legShells } from './climber-model.js';
import { clip, visiblePolygonPath } from './surface-occlusion.js';

const ns='http://www.w3.org/2000/svg';
const cellSize=5;
const key=(x,z)=>(x+64)*128+z+32;

// A tread starts in the shoe's actual sole plane. Preserve that height while
// clipping: only the contacting heel/toe of a boot tilted on a ridge prints.
function soleShapes(sole) {
  const zs=sole.map(p=>p[2]);
  const low=Math.min(...zs),length=Math.max(...zs)-low;
  const heel=clip(sole,p=>low+.29*length-p[2]);
  const forefoot=clip(sole,p=>p[2]-low-.41*length);
  return [heel,forefoot];
}

// Center each puncture on the contacting steel point. Draw it in the facet's
// tangent plane so its visible size holds up even on a very steep pitch.
function icePuncture(tip, lateral, scale, patch) {
  const n=[-patch.dx,1,-patch.dz].map(v=>v/patch.normalLength);
  const gap=tip.reduce((d,v,i)=>d+(v-patch.a[i])*n[i],0);
  if (Math.abs(gap)>.04*scale) return [];
  const center=tip.map((v,i)=>v-gap*n[i]);
  const tilt=lateral.reduce((d,v,i)=>d+v*n[i],0);
  const across=lateral.map((v,i)=>v-tilt*n[i]);
  const width=Math.hypot(...across);
  if (width<.001) return [];
  const tangent=across.map(v=>v/width);
  const [x,y,z]=tangent;
  const along=[y*n[2]-z*n[1],z*n[0]-x*n[2],x*n[1]-y*n[0]];
  return [[-.036,-.025],[.036,-.025],[.005,.047]].map(([u,v])=>
    center.map((c,i)=>c+scale*(u*tangent[i]+v*along[i])));
}

function bounds(points) {
  const xs=points.map(p=>p[0]),zs=points.map(p=>p[2]);
  return {left:Math.min(...xs),right:Math.max(...xs),back:Math.min(...zs),front:Math.max(...zs)};
}

function cells(box,visit) {
  for (let i=Math.floor(box.left/cellSize);i<=Math.floor(box.right/cellSize);i++) {
    for (let j=Math.floor(box.back/cellSize);j<=Math.floor(box.front/cellSize);j++) visit(key(i,j));
  }
}

export function createTreadGeometry(terrain) {
  const soles=legShells.boot.map(rings=>soleShapes(rings[0]));
  const bins=new Map();
  for (const {points,material} of terrain.faces) {
    if (material!=='snow' && material!=='ice') continue;
    const a=points[0], edges=[];
    let dx=0,dz=0,orientation=0;
    for (let i=0;i<points.length;i++) {
      const b=points[i],c=points[(i+1)%points.length];
      const det=(b[0]-a[0])*(c[2]-a[2])-(c[0]-a[0])*(b[2]-a[2]);
      if (!orientation && Math.abs(det)>1e-9) {
        orientation=Math.sign(det);
        dx=((b[1]-a[1])*(c[2]-a[2])-(c[1]-a[1])*(b[2]-a[2]))/det;
        dz=((b[0]-a[0])*(c[1]-a[1])-(c[0]-a[0])*(b[1]-a[1]))/det;
      }
      edges.push([b[0],b[2],c[0]-b[0],c[2]-b[2]]);
    }
    if (!orientation) continue;
    const patch={a,dx,dz,edges,orientation,material,box:bounds(points),normalLength:Math.hypot(dx,1,dz)};
    cells(patch.box,k=>{
      if (!bins.has(k)) bins.set(k,[]);
      bins.get(k).push(patch);
    });
  }

  return function geometry({frame,foot,material}) {
    if (material==='ladder') return [];
    const pieces=[];
    const place=p=>frame.origin.map((n,i)=>n+frame.x[i]*p[0]+frame.y[i]*p[1]+frame.z[i]*p[2]);
    const snow=soles[foot].map(poly=>poly.map(place));
    const tips=material==='ice'?frontPoints[foot].map(place):[];
    const box=bounds([...snow.flat(),...tips]), height=Math.hypot(...frame.y);
    if (tips.length) {
      const margin=.09*height;
      box.left-=margin;box.right+=margin;box.back-=margin;box.front+=margin;
    }
    const candidates=new Set();
    cells(box,k=>{for (const patch of bins.get(k)||[]) candidates.add(patch);});
    for (const patch of candidates) {
      const {left,right,back,front}=patch.box;
      if (right<box.left || left>box.right || back>box.front || front<box.back) continue;
      const floor=p=>patch.a[1]+patch.dx*(p[0]-patch.a[0])+patch.dz*(p[2]-patch.a[2]);
      const shapes=patch.material==='ice'?tips.map(tip=>icePuncture(tip,frame.x,height,patch)):snow;
      for (let poly of shapes) {
        if (poly.length<3) continue;
        for (const [x,z,edgeX,edgeZ] of patch.edges) {
          poly=clip(poly,p=>patch.orientation*(edgeX*(p[2]-z)-edgeZ*(p[0]-x)));
          if (poly.length<3) break;
        }
        const contactDepth=.065*height*patch.normalLength;
        poly=clip(poly,p=>contactDepth-(p[1]-floor(p)));
        poly=clip(poly,p=>contactDepth+(p[1]-floor(p)));
        if (poly.length>=3) pieces.push({material:patch.material,points:poly.map(p=>[p[0],floor(p),p[2]])});
      }
    }
    return pieces;
  };
}

export function projectTread(polygon,project) {
  const pts=polygon.map(p=>project(p));
  if (pts.some(p=>p.depth<=1)) return '';
  const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y);
  const box={left:Math.min(...xs),right:Math.max(...xs),top:Math.min(...ys),bottom:Math.max(...ys)};
  if (box.right<=0 || box.left>=project.width || box.bottom<=0 || box.top>=project.height) return '';
  return visiblePolygonPath(pts,project,box,Math.max(...pts.map(p=>p.depth)));
}

// Age is measured in running match seconds, including the other party's turn.
const freshSeconds=2.5, lifetime=22.5, fadeBands=48;
function fadeBand(age) {
  if (age<=freshSeconds) return fadeBands;
  if (age>=lifetime) return 0;
  const t=(age-freshSeconds)/(lifetime-freshSeconds);
  return Math.max(1,Math.round(fadeBands*(1-t*t*(3-2*t))));
}

export function mountFootprints(group,terrain,style,sample) {
  const colors={poster:['#756777','#426a80'],ink:['#656760','#536269'],paper:['#507587','#467b94']};
  const palette=colors[style]||colors.poster,geometry=createTreadGeometry(terrain);
  const cache=new Map(),plans={},slots=[],early={pro:new Map(),con:new Map()};
  const fallbackBirth={pro:new Map(),con:new Map()};
  let previous={},lastTime,lastClock,lastView,lastBatch='',activeSlots=0;
  function paths(event,project,viewKey) {
    let mark=cache.get(event.id);
    if (!mark) {mark={pieces:geometry(event)};cache.set(event.id,mark);}
    if (!mark.projected || mark.view!==viewKey) {
      mark.view=viewKey;
      mark.projected={snow:'',ice:''};
      for (const piece of mark.pieces) mark.projected[piece.material]+=projectTread(piece.points,project);
    }
    return mark.projected;
  }
  function slot(index) {
    if (!slots[index]) {
      const node=group.ownerDocument.createElementNS(ns,'path');
      group.appendChild(node);
      slots[index]=node;
    }
    return slots[index];
  }
  function attr(node,key,value) {
    if (node.getAttribute(key)!==value) node.setAttribute(key,value);
  }
  return function draw(project,viewKey,progress,seconds,members,clock) {
    const events=[];
    const budget=side=>(typeof seconds==='number'?seconds:seconds?.[side])||1020;
    const now=clock?.now ?? progress.pro*budget('pro')+progress.con*budget('con');
    const rewound=now<lastClock || members[0].t<lastTime;
    lastClock=now;lastTime=members[0].t;
    for (const side of ['pro','con']) {
      const p=progress[side],team=members.filter(m=>m.side===side);
      const pending=early[side],fallback=fallbackBirth[side];
      const pace=budget(side);
      if (rewound || p<=0 || p<previous[side] || plans[side]?.budget!==pace) {
        pending.clear();fallback.clear();
      }
      if (plans[side]?.budget!==pace) {
        const all=sample.footfalls(terrain,side,1,seconds);
        plans[side]={budget:pace,landings:all,end:0,byID:new Map(all.map(event=>[event.id,event])),
          ahead:Math.max(0,...all.map(e=>e.progress-(e.settleFrom??e.progress)))};
      }
      const plan=plans[side],limit=p+(clock?.settledAt?plan.ahead:0);
      // Most frames stay between the same two landings. A seek can move the
      // cursor either way without copying the whole history of this team.
      while (plan.end && plan.landings[plan.end-1].progress>limit) plan.end--;
      while (plan.end<plan.landings.length && plan.landings[plan.end].progress<=limit) plan.end++;
      const at=event=>{
        if (clock) return clock.at(side,event.progress);
        // Direct renderers without a match ledger still know each observed
        // landing's time. Keep it fixed across handoffs to the other party.
        if (!fallback.has(event.id)) fallback.set(event.id,now-(p-event.progress)*pace);
        return fallback.get(event.id);
      };
      const recorded=new Set();
      for (let i=plan.end-1;i>=0;i--) {
        const event=plan.landings[i],future=event.progress>p;
        const scheduled=future?Infinity:at(event);
        if (now-scheduled>=lifetime) break;
        const settled=clock?.settledAt && event.settleFrom<=p?
          clock.settledAt(side,event.settleFrom,event.progress,event.settleSeconds):null;
        if (future && settled==null) continue;
        const leg=team[event.rank].legs[event.foot];
        if (settled==null && (event.distance>leg.distance+1e-6 || (!leg.id && event.distance>=leg.distance-1e-6))) continue;
        const band=fadeBand(now-(settled ?? pending.get(event.id)?.time ?? scheduled));
        recorded.add(event.id);
        if (band) events.push({event,band});
      }
      if (clock?.settledAt) continue;
      // A direct renderer without turn history can still see which boot
      // actually settled between frames.
      for (const member of team) for (const leg of member.legs) {
        if (!leg.id || leg.clearance>1e-7 || recorded.has(leg.id)||pending.has(leg.id)) continue;
        const event=plans[side].byID.get(leg.id);
        if (event && event.progress>p) pending.set(leg.id,{event,time:clock?Math.min(now,clock.at(side,p)):now});
      }
      for (const [id,{event,time}] of pending) {
        if (now-time>=lifetime && event.progress<=p && now-at(event)>=lifetime) {pending.delete(id);continue;}
        const band=fadeBand(now-time);
        if (band && !recorded.has(id)) events.push({event,band});
      }
    }
    previous={...progress};
    const signature=events.map(({event,band})=>event.id+'@'+band).join('|');
    if (lastView===viewKey && signature===lastBatch) return;
    lastView=viewKey;lastBatch=signature;
    const batches=new Map();
    for (const {event,band} of events) {
      const projected=paths(event,project,viewKey);
      for (const material of ['snow','ice']) {
        if (!projected[material]) continue;
        const lane=event.side+'/'+event.rank+'/'+event.foot+'/'+material,key=lane+'/'+band;
        if (!batches.has(key)) batches.set(key,{lane,band,material,d:''});
        batches.get(key).d+=projected[material];
      }
    }
    let count=0;
    for (const {lane,band,material,d} of batches.values()) {
      const node=slot(count++),ice=material==='ice';
      attr(node,'data-footprints',lane);
      attr(node,'fill',palette[ice?1:0]);
      attr(node,'opacity',((ice?.73:.54)*band/fadeBands).toFixed(3));
      attr(node,'d',d);
    }
    for (let i=count;i<activeSlots;i++) attr(slots[i],'d','');
    activeSlots=count;
  };
}
