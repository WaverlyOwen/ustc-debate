/* The climbers share the mountain's world coordinates. Their boots and pole tips
   have distance-based contact points, so seeking the clock reproduces the pose. */
import { createPartyRenderer } from './party-renderer.js';
import { frontPoints, kneeSection, legPanelMeshes, legShells, parkaShell, posedVertex } from './climber-model.js';
const TAU = 2 * Math.PI;
const clamp = (value, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, value));
const mix = (a, b, u) => a + (b - a) * u;
const ease = u => u * u * (3 - 2 * u);
const smooth = (a,b,t) => ease(clamp((t-a)/(b-a)));

const PEOPLE = [
  { side: 'pro', rank: 0, height: 1.04, width: 1.01, skin: '#ab6747', light: '#df9d72', hair: '#322a2a', seed: 2 },
  { side: 'pro', rank: 1, height: .94, width: .94, skin: '#d08c66', light: '#f1bc89', hair: '#453627', seed: 7 },
  { side: 'pro', rank: 2, height: 1.01, width: 1.08, skin: '#80513e', light: '#be8560', hair: '#302a29', seed: 13 },
  { side: 'con', rank: 0, height: .98, width: .94, skin: '#c98964', light: '#edb98b', hair: '#3e3740', seed: 5 },
  { side: 'con', rank: 1, height: 1.05, width: 1.06, skin: '#87563e', light: '#bc8464', hair: '#2c2829', seed: 11 },
  { side: 'con', rank: 2, height: .95, width: .97, skin: '#b67555', light: '#e1a67c', hair: '#56392c', seed: 19 },
];

function pathTable(terrain, side) {
  const points = [];
  const lengths = [];
  let total = 0;
  for (let i = 0; i <= 400; i++) {
    const point = terrain.route(side, i / 400);
    if (i) {
      const prev = points[i - 1];
      total += Math.hypot(point[0] - prev[0], point[1] - prev[1], point[2] - prev[2]);
    }
    points.push(point);
    lengths.push(total);
  }
  // Offset a side lane with the vertex tangents on both ends of each edge.
  // A switchback then turns the party continuously, including its pole tips.
  const lateral=points.map((point,i)=>{
    const a=points[Math.max(i-1,0)],b=points[Math.min(i+1,points.length-1)];
    const heading=flatHeading(b,a);
    return [-heading[2],0,heading[0]];
  });
  function locate(distance) {
    let low = 0, high = lengths.length - 1;
    distance = clamp(distance, 0, total);
    while (high - low > 1) {
      const mid = (low + high) >> 1;
      if (lengths[mid] <= distance) low = mid;
      else high = mid;
    }
    const u = (distance - lengths[low]) / (lengths[high] - lengths[low] || 1);
    return { low, high, u, p:(low+u)/(points.length-1) };
  }
  const feature = d => terrain.featureAt?.(side,locate(d).p);
  function distanceAt(p) {
    const t=clamp(p)*(points.length-1), i=Math.min(points.length-2,Math.floor(t));
    return mix(lengths[i],lengths[i+1],t-i);
  }
  function rung(d) {
    const f=feature(d);
    return f?.kind==='ladder' ? distanceAt(mix(f.start,f.end,Math.round(f.u*f.steps)/f.steps)) : d;
  }
  const features=(terrain.features?.[side]||[]).map(f=>({f,a:distanceAt(f.start),b:distanceAt(f.end)}));
  function equipment(d) {
    const site=features.find(s=>d>s.a-2.6 && d<s.b+2.3);
    if (!site) return null;
    const {f,a,b}=site;
    return {...f,u:clamp((locate(d).p-f.start)/(f.end-f.start)),a,b,
      blend:smooth(a-2.6,a+.08,d)*(1-smooth(b-.1,b+2.3,d))};
  }
  function at(distance, lane = 0, lift = 0) {
    const {low,high,u,p}=locate(distance);
    const f=terrain.featureAt?.(side,p);
    if (f) {
      const pt=f.contact(f.u,lane);
      return [pt[0],pt[1]+lift,pt[2]];
    }
    const a = points[low], b = points[high];
    const x=mix(a[0]+lane*lateral[low][0],b[0]+lane*lateral[high][0],u);
    const z=mix(a[2]+lane*lateral[low][2],b[2]+lane*lateral[high][2],u);
    const snow = terrain.surface ? terrain.surface(x, z)[1] : mix(a[1], b[1], u);
    return [x, snow + lift, z];
  }
  const surface=terrain.surface && ((x,z)=>terrain.surface(x,z));
  if (surface && terrain.surface.maxHeight) {
    surface.maxHeight=terrain.surface.maxHeight;
    // Several hundred cloth samples around a knee tend to share a handful
    // of quarter-unit squares. Cache conservative heights, never sampled
    // point heights, so contact at a triangle edge still uses the real mesh.
    const heights=new Map();
    surface.localCeiling=(x,z)=>{
      const i=Math.floor(x*4),j=Math.floor(z*4);
      let column=heights.get(i);
      if (!column) heights.set(i,column=new Map());
      let top=column.get(j);
      if (top===undefined) {
        top=surface.maxHeight(i/4,(i+1)/4,j/4,(j+1)/4);
        column.set(j,top);
      }
      return top;
    };
  }
  return { total, at, feature, equipment, rung, distanceAt, bridges:features.filter(s=>s.f.kind==='ladder'), fraction:d=>locate(d).p,
    side,surface };
}

function noise(i, seed) {
  const h = Math.sin(i * 74.913 + seed * 38.535) * 4387.119;
  return h - Math.floor(h);
}

function approachLane(route, person) {
  if (person.rank===2) return route;
  const offset=person.side==='pro'?[.24,-.48][person.rank]:[-.48,.48][person.rank];
  const enter=route.distanceAt(.88), ledge=route.distanceAt(.915), leave=route.distanceAt(.98);
  const spread=distance=>smooth(enter,ledge,distance)*(1-smooth(leave,route.total,distance));
  return {...route, tangent(distance,footholdTangent) {
    const amount=spread(distance);
    if (!amount) return footholdTangent;
    // Across a sharp turn the two offset ledges can point in opposite
    // directions. The eyes, trunk and arms turn with the continuous trail
    // centerline while each boot still has its own fixed foothold.
    const trail=times(delta(route.at(distance+.65),route.at(distance-.65)),1/1.30);
    return between(footholdTangent,trail,amount);
  }, at(distance,lane=0,lift=0) {
    // They approach opposite edges of the ledge to meet shoulder-to-shoulder.
    // Offset the terrain sample at each individual foothold, so a planted
    // foot stays still when the center of mass moves farther up the route.
    return route.at(distance,lane+offset*spread(distance),lift);
  }};
}

// Plan footfalls in distance, then give each block a time on its team's clock.
// Both soles are on the ground at block boundaries, including the summit.
function journey(route, person) {
  const gap = Math.min(5.3, route.total * .13);
  const trailheadGap = Math.min(2.15, route.total * .055);
  const summitGap = Math.min(1.95, route.total * .05);
  const start = (2 - person.rank) * trailheadGap;
  const end = route.total - person.rank * summitGap;
  const trip = end - start;
  const count=Math.max(2,Math.round(trip/(.82*person.height)));
  const stepLength=trip/count, schedule=[];
  function progressAt(i) {
    if (i===0 || i===count) return i/count;
    const station=start+i*stepLength;
    let lo=0,hi=1;
    for (let n=0;n<22;n++) {
      const p=(lo+hi)/2;
      const space=mix(trailheadGap,gap,smooth(0,.19,p))-(gap-summitGap)*smooth(.72,1,p);
      if (mix(2*trailheadGap,route.total,p)-person.rank*space<station) lo=p; else hi=p;
    }
    return (lo+hi)/2;
  }
  for (let first=0;first<count;) {
    const last=Math.min(count,first+6+Math.floor(noise(first,person.seed)*7));
    const begin=progressAt(first),end=progressAt(last);
    const walk=last===count?1:mix(.84,.96,noise(first,person.seed+3));
    let previous=begin;
    for (let i=first;i<last;i++) {
      const jitter=i===last-1?0:(noise(i,person.seed+1)-.5)*.22;
      const until=mix(begin,end,(i+1-first+jitter)/(last-first)*walk);
      const station=start+i*stepLength,equipment=route.equipment(station+.5*stepLength);
      const ice=equipment?.kind==='ice'?smooth(equipment.a-.55,equipment.a+.38,station)*
        (1-smooth(equipment.b-.90,equipment.b+.10,station)):0;
      schedule.push({i,from:previous,to:until,station,ice,frontPointing:equipment?.kind==='ice'?equipment.blend:0,
        seconds:1.60+noise(i,person.seed+2)*.64, wait:mix(.14,.68,noise(i,person.seed+4))});
      previous=until;
    }
    first=last;
  }
  const sites=Array.from({length:count+2},(_,j)=>({d:start+(j-.5)*stepLength}));
  for (const {f,a,b} of route.bridges) {
    const pitch=(b-a)/f.steps;
    const first=sites.findIndex(s=>s.d>=a-1.38*pitch),stop=sites.findIndex(s=>s.d>b+1.38*pitch);
    if (first<0 || stop<first) continue;
    const rungs=Array.from({length:f.steps+1},(_,j)=>({
      d:mix(a,b,j/f.steps),feature:{...f,u:j/f.steps}
    }));
    // Match feet on the far end before stepping onto the bank if needed
    // to resume the original lead foot and cadence on the snow.
    if ((rungs.length-(stop-first))%2) rungs.push(rungs.at(-1));
    rungs.unshift({d:a-.85*pitch,bank:f,approach:true});
    rungs.push({d:b+.85*pitch,bank:f,approach:false});
    sites.splice(first,stop-first,...rungs);
  }
  function clockTime(d,entering) {
    const index=(d-start)/stepLength,nearest=Math.round(index);
    if (Math.abs(index-nearest)<1e-8) {
      if (nearest===0) return 0;
      if (nearest===count) return 1;
      return entering?schedule[nearest].from:schedule[nearest-1].to;
    }
    const i=Math.floor(index),base=schedule[i];
    return mix(base.from,base.to,index-i);
  }
  const steps=sites.slice(0,-2).map((site,i)=>{
    const next=sites[i+1],station=(site.d+next.d)/2,end=(next.d+sites[i+2].d)/2;
    const pattern=clamp(Math.round((station-start)/stepLength),0,count-1);
    const base=schedule[pattern],bridge=route.equipment(next.d);
    return {...base,i,pattern,station,length:end-station,from:clockTime(station,true),to:clockTime(end,false),
      bridge:bridge?.kind==='ladder'?bridge.blend:0};
  });
  function window(step, seconds) {
    const duration=step.to-step.from, width=Math.min(duration,step.seconds*(1+.85*step.ice-.05*step.bridge)/seconds);
    const wait=step.i===0?0:step.i===steps.length-1?1:step.wait;
    const from=step.from+(duration-width)*wait;
    // At a brisk pace one foot starts moving almost as soon as the other
    // takes the load. A slower ascent has a longer double-support phase.
    const brisk=smooth(1.38,.65,width*seconds);
    return {from,to:from+width,width,lift:mix(mix(mix(.19,.05,brisk),.14,step.bridge),.30,step.frontPointing),
      land:mix(mix(mix(.82,.95,brisk),.91,step.bridge),.94,step.frontPointing)};
  }
  function sampleStep(p, seconds) {
    let lo=0,hi=steps.length-1;
    while (lo<hi) {const mid=(lo+hi)>>1;if (steps[mid].to<p) lo=mid+1;else hi=mid;}
    const step=steps[lo], w=window(step,seconds), u=clamp((p-w.from)/w.width);
    // Continuous strides share their velocity at each planted step. A rest
    // gives that boundary a zero tangent, for gradual braking or takeoff.
    function tangent(adjacent, entering) {
      if (!adjacent) return 0;
      const other=window(adjacent,seconds);
      if (Math.abs(entering?w.from-other.to:other.from-w.to)>1e-8) return 0;
      return 2*w.width/(w.width+other.width);
    }
    const v=ease(u)+u*(1-u)*((1-u)*tangent(steps[lo-1],true)-u*tangent(steps[lo+1],false));
    // A planted pick takes the load before a boot releases. The hips make
    // most of their ascent after the replacement front points bite.
    const rockOver=.09*smooth(0,.32,u)+.33*smooth(.25,.78,u)+.58*smooth(.63,1,u);
    return {index:lo,pattern:step.pattern,u,distance:step.station+step.length*mix(v,rockOver,step.ice),station:step.station,
      length:step.length,lift:w.lift,land:w.land};
  }
  const soles=planSoles(route,person,sites);
  sampleStep.soles=soles;
  sampleStep.landings=seconds=>steps.map(step=>{
    const w=window(step,seconds), site=soles[step.i+2];
    return {side:person.side,rank:person.rank,foot:site.foot,progress:w.from+w.land*w.width,
      // After the swing midpoint a stop plants this boot on its destination.
      settleFrom:w.from+(w.lift+w.land)*.5*w.width,settleSeconds:stopDuration(person),
      position:site.point,forward:unit(site.frame.z,FORWARD),frame:site.frame,heightScale:person.height,
      distance:site.distance,id:site.id,material:site.material};
  });
  return sampleStep;
}

function stopDuration(person) { return .48+.27*person.rank+.08*noise(2,person.seed); }

function trailLane(person,equipment) {
  const lane=[0,.18,-.2][person.rank];
  if (equipment?.kind!=='ladder') return lane;
  const u=equipment.u;
  return lane*(1-smooth(0,.12,u)*(1-smooth(.90,1,u)));
}

function contact(route,step,lane,swinging,start,finish,height,reach=0,rungs=false,channel) {
  const support=step.station+.5*step.length+reach;
  const anchor=d=>rungs?route.rung(d):d;
  const raw=swinging?clamp((step.u-start)/(finish-start)):0;
  let q=raw;
  if (channel && swinging && step.activity<1 && raw>0 && raw<1) {
    // A stopped mid-swing shoe must land on one of its real footholds.
    // Retain that choice through the restart, even if progress crosses
    // the midpoint while the climber is transferring weight again.
    let plant=step.plants[channel];
    if (!plant || plant.step!==step.index) {
      plant={step:step.index,end:raw<.5?0:1};
      step.plants[channel]=plant;
    }
    q=mix(plant.end,raw,step.activity);
  }
  const distance=swinging?mix(anchor(support-step.length),anchor(support+step.length),ease(q)):anchor(support);
  const clearance=16*q*q*(1-q)*(1-q)*height;
  return {point:route.at(distance,lane,clearance),distance,lane,swing:q,phase:q>0&&q<1?.60+.40*q:0,clearance};
}

function frame(route, itinerary, person, progress, t, activity, seconds,plants) {
  const step=itinerary(progress,seconds),d=step.distance;
  Object.assign(step,{activity,plants});
  const swingLeg=(step.index+person.seed)%2;
  const support=swingLeg===0?1:-1;
  const feature=route.feature(d), equipment=route.equipment(d);
  const lane=trailLane(person,equipment);
  const snow=ordinaryStride(route,d,equipment);
  const soles=itinerary.soles,source=soles[step.index],stance=soles[step.index+1],target=soles[step.index+2];
  const iceSwing=source.material==='ice'||target.material==='ice';
  const bridgeSwing=source.material==='ladder'||target.material==='ladder';
  const lift=(iceSwing?.12:bridgeSwing?.16:mix(.29,.15,snow))+
    (bridgeSwing?.035:.08-.045*snow)*noise(step.pattern,person.seed+9);
  // The route's positive lane is left of uphill. Index 0 always represents
  // the climber's left side and index 1 the right, including at switchbacks.
  const legs = [1, -1].map((s, i) => {
    const leg=contact(route,step,lane+s*.245*person.width,i===swingLeg,step.lift,step.land,lift*activity,0,true,'boot'+i);
    placeFoot(leg,itinerary.soles,step,i,swingLeg,route,person);
    return leg;
  });
  const poles = [0, 1].map(i => contact(route,step,lane+(i?-.46:.44),i!==swingLeg,
    .03,.51,(.27+.07*noise(step.pattern,person.seed))*activity,i?.52:.64,true,'pole'+i));
  const ahead = route.at(d + .46, lane);
  const behind = route.at(d - .46, lane);
  const footTangent=times(delta(ahead,behind),1/.92);
  const tangent=route.tangent?route.tangent(d,footTangent):footTangent;
  const slope=clamp(tangent[1],-.8,.9);
  // Glances and equipment checks also happen while waiting for a turn.
  const period = 8.7 + .29 * person.seed;
  const clock = t + person.seed * 1.64;
  const tick = Math.floor(clock / period);
  const duration = .18 + noise(tick, person.seed) * .13;
  const beat = (clock / period)-tick-.09-.29*noise(tick,person.seed+7);
  const gesture=beat>=0&&beat<duration?Math.sin(Math.PI*beat/duration)**2:0;
  const checking=person.rank===1 && noise(tick,person.seed+6)>.38;
  const onIce=equipment?.kind==='ice'?equipment.blend:0;
  const weight=support*smooth(0,mix(.26,.40,onIce),step.u)*(1-smooth(mix(.65,.80,onIce),1,step.u))*activity;
  const drive=activity*smooth(0,.23,step.u)*(1-smooth(.72,1,step.u));
  const member = {
    side: person.side, rank: person.rank, person, position: route.at(d, lane), ahead, behind,
    slope, tangent, legs, poles, t, gesture, checking, feature, equipment, activity, drive, weight, step, lane,snow,
    stride:Math.PI*(step.index+step.u+person.seed), resting:activity===0||step.u===0||step.u===1,
  };
  if (equipment?.kind==='ladder') {
    const f=equipment,span=Math.hypot(...delta(f.contact(1),f.contact(0)));
    member.railUse=smooth(f.a-1.45,f.a+.05,d)*(1-smooth(f.b-.05,f.b+1.36,d));
    const handStation=site=>f.local(site.point[0],site.point[2])[0]+.57*person.height/span;
    member.rails=[0,1].map(i=>{
      const hand=contact(route,step,lane,i===swingLeg,.025,.60,0,0,false,'rail'+i);
      const u=i===swingLeg?mix(handStation(source),handStation(target),ease(hand.swing)):handStation(stance);
      return f.handhold(clamp(u),i?-1:1);
    });
  }
  return member;
}

const UP = [0, 1, 0];
const RIGHT = [1, 0, 0];
const FORWARD = [0, 0, 1];
const delta = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const times = (v, k) => [v[0] * k, v[1] * k, v[2] * k];
const along = (p, v, k) => [p[0] + v[0] * k, p[1] + v[1] * k, p[2] + v[2] * k];

function unit(v, fallback) {
  const length = Math.hypot(...v);
  return length > .00001 ? times(v, 1 / length) : fallback;
}

function pointIn(frame, x, y, z) {
  return along(along(along(frame.origin, frame.x, x), frame.y, y), frame.z, z);
}

function fullFrame(origin, x, y, z, height, width = 1) {
  return { origin, x: times(x, height * width), y: times(y, height), z: times(z, height) };
}

function flatHeading(a, b) {
  return unit([a[0] - b[0], 0, a[2] - b[2]], FORWARD);
}

// Project the bend direction into the plane perpendicular to the line between
// the two endpoints. The law of cosines fixes the joint on that plane.
function solveJoint(start, end, proximal, distal, bend) {
  const line = delta(end, start);
  const reach = Math.max(Math.hypot(...line), .0001);
  const axis = times(line, 1 / reach);
  const offset = clamp((proximal ** 2 - distal ** 2 + reach ** 2) / (2 * reach), -proximal, proximal);
  const radius = Math.sqrt(Math.max(0, proximal ** 2 - offset ** 2));
  const outward = along(bend, axis, -dot(bend, axis));
  const fallback = unit(cross(axis, Math.abs(axis[1]) < .8 ? UP : RIGHT), FORWARD);
  return along(along(start, axis, offset), unit(outward, fallback), radius);
}

// The mesh's positive longitudinal axis runs from the proximal joint (0) to
// the distal joint (1). Its forward panels keep their orientation as it bends.
function segment(start, end, bodyRight, girth) {
  const y = delta(end, start);
  const direction = unit(y, [0, -1, 0]);
  const lateral = times(bodyRight, -1);
  const x = unit(along(lateral, direction, -dot(lateral, direction)), FORWARD);
  const z = unit(cross(x, direction), UP);
  return { origin: start, x: times(x, girth), y, z: times(z, girth) };
}

function localSlope(surface, p, direction, fallback, radius=.07) {
  if (!surface) return fallback;
  const a = surface(p[0] - radius * direction[0], p[2] - radius * direction[2]);
  const b = surface(p[0] + radius * direction[0], p[2] + radius * direction[2]);
  return (b[1] - a[1]) / (2 * radius);
}

// Extremities of the outsole and heel. Sampling the complete sole catches
// a toe through a facet even when its center is exactly on the snow.
function shellSamples(rings) {
  const samples=rings.flat();
  for (let row=0;row<rings.length;row++) {
    const ring=rings[row],next=rings[row+1];
    for (let i=0;i<ring.length;i++) {
      samples.push(between(ring[i],ring[(i+1)%ring.length],.5));
      if (next) samples.push(between(ring[i],next[i],.5));
    }
  }
  return samples;
}
const bootHull=legShells.boot.map(rings=>rings.flat()),soleBoundary=legShells.boot.map(shellSamples);
function clothContacts(model,envelope) {
  const seams=[],columns=model.rings[0].length;
  for (let row=0;row<model.rings.length;row++) for (let j=0;j<columns;j++) {
    const a=row*columns+j;
    seams.push([a,row*columns+(j+1)%columns]);
    if (row+1<model.rings.length) seams.push([a,a+columns]);
  }
  const radius=Math.max(...[...model.vertices,...envelope.flat()].map(([x,,z])=>Math.hypot(x,z)));
  return {model,seams,local:shellSamples(model.rings),radius};
}
const trousers=clothContacts(legPanelMeshes.thigh,legShells.thigh),gaiter=clothContacts(legPanelMeshes.shin,legShells.shin);
const trouserShell=shellSamples(legShells.thigh),gaiterShell=shellSamples(legShells.shin);
function posedCloth(cloth,bone,joint) {
  const points=cloth.model.vertices.map((_,i)=>posedVertex(cloth.model,i,bone,joint));
  for (const [a,b] of cloth.seams) points.push(between(points[a],points[b],.5));
  return points;
}
const coatPanels=parkaShell.flat();
const kneeDirections=[];
for (let x=-1;x<=1;x++) for (let y=-1;y<=1;y++) for (let z=-1;z<=1;z++) {
  if (x||y||z) kneeDirections.push(unit([x,y,z],UP));
}
function soleAxes(point,heading,grade,camber,person) {
  const right=cross(UP,heading),z=unit(along(heading,UP,grade),heading);
  const y=unit(cross(z,along(right,UP,camber)),UP);
  return fullFrame(point,cross(y,z),y,z,person.height,person.width);
}
function soleDepth(frame,foot,surface) {
  let depth=0,corner=frame.origin;
  for (const v of soleBoundary[foot]) {
    const p=pointIn(frame,...v);
    const below=surface(p[0],p[2])[1]-p[1];
    if (below>depth) { depth=below;corner=p; }
  }
  return {depth,corner};
}
function worldShell(frame,vertices) {
  return vertices.map(v=>pointIn(frame,...v));
}
// Positive clearance means a plane separates the actual two shells. A
// negative value gives the smallest translation along the tested axes.
function shellClearance(a,b,axes,margin=.018) {
  let gap=-Infinity,normal=RIGHT;
  for (const axis of axes) {
    const length=Math.hypot(...axis);
    if (length<.0001) continue;
    const n=times(axis,1/length);
    let a0=Infinity,a1=-Infinity,b0=Infinity,b1=-Infinity;
    for (const p of a) {const d=dot(p,n);a0=Math.min(a0,d);a1=Math.max(a1,d);}
    for (const p of b) {const d=dot(p,n);b0=Math.min(b0,d);b1=Math.max(b1,d);}
    const clearance=Math.max(a0-b1,b0-a1);
    if (clearance>gap) {gap=clearance;normal=a0-b1>b0-a1?n:times(n,-1);}
    if (gap>margin) break;
  }
  return {gap,normal};
}
function fitSole(point,heading,person,foot,route) {
  const right=cross(UP,heading),surface=route.surface;
  let pitch=localSlope(surface,point,heading,0),roll=localSlope(surface,point,right,0),best;
  for (let pass=0;pass<5;pass++) {
    const frame=soleAxes(point,heading,pitch,roll,person);
    const hit=surface?soleDepth(frame,foot,surface):{depth:0};
    if (!best||hit.depth<best.depth) best={frame,depth:hit.depth};
    if (hit.depth<.006) break;
    const span=delta(hit.corner,point),f=dot(span,heading),r=dot(span,right);
    const adjust=hit.depth/(f*f+r*r+.0001);
    pitch=clamp(pitch+adjust*f,-12,12);roll=clamp(roll+adjust*r,-12,12);
  }
  return best;
}
function ordinaryStride(route,d,equipment=route.equipment(d)) {
  // Before the ice, bridge or summit hand-up, blend back into the wider
  // technical stance used to hold a rail, plant a pick or brace a teammate.
  return (1-(equipment?.blend||0))*(1-smooth(.84,.90,route.fraction(d)));
}

function iceFacing(route,point,fallback) {
  if (!route.surface) return fallback;
  const x=localSlope(route.surface,point,RIGHT,0,.55),z=localSlope(route.surface,point,FORWARD,0,.55);
  return unit([x,0,z],fallback);
}

function frontPoint(frame,foot,surface) {
  const [a,b]=frontPoints[foot].map(v=>pointIn(frame,...v));
  const gap=p=>p[1]-surface(p[0],p[2])[1];
  return gap(a)<gap(b)?a:b;
}

function iceSole(point,heading,person,foot,route) {
  const facing=iceFacing(route,point,heading);
  // Present the points squarely with a low heel. Each tooth can bear the
  // load on uneven ice without forcing the ankle to parallel the hillside.
  const frame=soleAxes(point,facing,.06,0,person);
  const toe=frontPoints[foot][0];
  frame.origin=along(along(point,frame.z,-toe[2]),frame.y,-toe[1]);
  const bite=frontPoint(frame,foot,route.surface);
  const lift=route.surface(bite[0],bite[2])[1]-bite[1];
  frame.origin[1]+=lift;bite[1]+=lift;
  return {frame,point:bite,depth:soleDepth(frame,foot,route.surface).depth};
}

function planSoles(route,person,sites) {
  const soles=[];
  for (const [j,site] of sites.entries()) {
    const foot=(j+person.seed)&1, sign=foot?1:-1;
    const d=site.d,feature=site.feature||route.feature(d),lane=trailLane(person,route.equipment(d));
    const ice=feature?.kind==='ice',snow=ordinaryStride(route,d),halfStance=ice?.38:mix(.245,.195,snow);
    const heading=flatHeading(route.at(d+1.35,lane),route.at(d-1.35,lane));
    const right=cross(UP,ice?iceFacing(route,route.at(d,lane),heading):heading),previous=soles.at(-1);
    let best;
    // On a narrow turn try a neighbouring patch of the same ledge. On a
    // bridge only lateral placement on the selected metal rung is allowed.
    const bridge=feature?.kind==='ladder';
    const advances=bridge?[0]:[0,-.16,.16,-.32,.32,-.58,.58];
    outer:for (const advance of advances) {
      for (const spread of [0,.13,-.075,.26,-.15,.4,-.21]) {
        const offset=sign*(halfStance*person.width+spread),base=route.at(d+(bridge?0:advance),lane);
        let point=along(base,right,offset),soleHeading=heading;
        if (ice && previous?.material==='ice') {
          const width=sign*dot(delta(point,previous.point),right);
          point=along(point,right,sign*Math.max(0,.70*person.height-width));
        }
        if (bridge) {
          if (Math.abs(lane-offset)>.55) continue;
          point=feature.contact(clamp(feature.u+advance/feature.steps),lane-offset);
          soleHeading=flatHeading(feature.contact(1),feature.contact(0));
        }
        else if (route.surface) point=route.surface(point[0],point[2]);
        if (site.bank) {
          const [u]=site.bank.local(point[0],point[2]);
          if (site.approach?u>=-.003:u<=1.003) continue;
        }
        let fitted=ice?iceSole(point,soleHeading,person,foot,route):fitSole(point,soleHeading,person,foot,route);
        if (bridge && (feature.u===0||feature.u===1)) {
          const direction=unit(delta(feature.contact(1),feature.contact(0)),soleHeading);
          const grade=direction[1]/Math.hypot(direction[0],direction[2]);
          // At the end rail the heel or the forefoot can share support
          // with the bank. Keep the contact inside the sole outline.
          const insets=feature.u===0?[0,.06,.12,.18,.217]:[0,.08,.15,.22,.27,.305];
          for (const shift of insets) {
            const center=along(point,direction,(feature.u?-1:1)*shift*person.height);
            const frame=soleAxes(center,soleHeading,grade,0,person),hit=soleDepth(frame,foot,route.surface);
            if (hit.depth<fitted.depth) fitted={frame,depth:hit.depth};
            if (fitted.depth<.003) break;
          }
        }
        if (fitted.point) point=fitted.point;
        if (!ice && !bridge && fitted.depth>.004) {
          const lateral=cross(UP,soleHeading);
          for (const toeOut of [sign*.22,-sign*.22,sign*.43,-sign*.43]) {
            const toe=unit(along(soleHeading,lateral,toeOut),soleHeading);
            const trial=fitSole(point,toe,person,foot,route);
            if (trial.depth<fitted.depth) fitted=trial;
            if (fitted.depth<.003) break;
          }
        }
        const gap=previous?Math.hypot(...delta(point,previous.point)):1,from=soles.at(-2);
        const longKick=from&&(ice||bridge||site.bank||from.material==='ice'||from.material==='ladder')?
          Math.max(0,Math.hypot(...delta(fitted.frame.origin,from.frame.origin))-1.82*person.height):0;
        const penalty=fitted.depth*180+Math.max(0,.60*person.height-gap)*12+
          Math.max(0,gap-1.32*person.height)*4+longKick*6+
          .20*Math.abs(advance)+.18*Math.abs(spread);
        if (!best||penalty<best.penalty) best={point,frame:fitted.frame,distance:d,snow,bank:!!site.bank,
          material:feature?.kind||'snow',foot,penalty,id:person.side+':'+person.rank+':'+foot+':'+d.toFixed(5)};
        if (penalty<.018) break outer;
      }
    }
    soles.push(best);
  }
  return soles;
}
function placeFoot(leg,soles,step,i,swingLeg,route,person) {
  const stance=soles[step.index+1], source=soles[step.index], target=soles[step.index+2];
  const q=leg.swing;
  leg.crampon=(i!==swingLeg?stance.material: q<.5?source.material:target.material)==='ice';
  if (i!==swingLeg||q<1e-8||q>1-1e-8) {
    const anchor=i!==swingLeg?stance:q<.5?source:target;
    Object.assign(leg,{point:anchor.point,frame:anchor.frame,distance:anchor.distance,id:anchor.id});
    return;
  }
  const a=source.frame,b=target.frame;
  const ice=source.material==='ice'&&target.material==='ice',bridge=source.material==='ladder'&&target.material==='ladder';
  const bank=source.bank||target.bank||(!bridge&&(source.material==='ladder'||target.material==='ladder'));
  const heading=ice?unit([a.z[0]+b.z[0],0,a.z[2]+b.z[2]],FORWARD):
    flatHeading(route.at(step.station+1.3),route.at(step.station-1.3)),right=cross(UP,heading);
  const footSide=i?1:-1,snow=Math.min(source.snow,target.snow);
  function swingFrame(u) {
    const rising=b.origin[1]>=a.origin[1],t=bank?smooth(rising?.20:.04,rising?.96:.80,u):ease(u);
    const arc=16*u*u*(1-u)*(1-u),point=between(a.origin,b.origin,t);
    if (bank) point[1]=mix(a.origin[1],b.origin[1],smooth(rising?0:.42,rising?.58:1,u));
    const margin=dot(delta(point,stance.frame.origin),right)*footSide;
    const outside=arc*Math.max(0,(ice?.70:bridge?.43:mix(.55,.465,snow))*person.height-margin);
    point[0]+=right[0]*outside*footSide;point[2]+=right[2]*outside*footSide;
    const y=unit(between(a.y,b.y,t),UP),x=unit(cross(y,unit(between(a.z,b.z,t),heading)),right);
    const z=cross(x,y);
    // Push off the toe, then bring it up slightly as the boot comes through.
    // Rotate around the toe box so the heel leads the lift out of the print.
    const roll=snow*(-.29*smooth(0,.22,u)*(1-smooth(.22,.58,u))+
      .13*smooth(.39,.70,u)*(1-smooth(.70,1,u)));
    const shoeZ=along(times(z,Math.cos(roll)),y,Math.sin(roll));
    const origin=along(point,delta(z,shoeZ),.22*person.height);
    if (ice) {
      // Pull the points clear, bring the knee up, then kick the toe back
      // into the wall. Its return path is square to the actual ice face.
      const facing=unit([z[0],0,z[2]],heading);
      const draw=smooth(0,.30,u)*(1-smooth(.58,1,u))*.30*person.height;
      origin[0]-=facing[0]*draw;origin[2]-=facing[2]*draw;
    }
    return fullFrame(origin,x,cross(shoeZ,x),shoeZ,person.height,person.width);
  }
  if (bank && !target.bankHeights) {
    // Raise the boot before advancing over the lip, or clear the edge
    // before descending. Anticipate just the nearby high ground instead
    // of raising the entire swing to clear a single corner of the bank.
    const heights=[],samples=32;
    let rate=3.2*person.height;
    for (let n=0;n<=samples;n++) {
      const u=n/samples,trial=swingFrame(u);
      const y=trial.origin[1]+(route.surface?soleDepth(trial,i,route.surface).depth:0);
      heights.push(y);
      if (n>0) rate=Math.max(rate,(y-a.origin[1])/u);
      if (n<samples) rate=Math.max(rate,(y-b.origin[1])/(1-u));
    }
    target.bankHeights=heights.map((_,n)=>Math.max(...heights.map((y,k)=>y-rate*Math.abs(n-k)/samples)));
  } else if (!bank && target.arcHeight===undefined) {
    let height=0;
    if (route.surface) for (let j=1;j<24;j++) {
      const u=j/24,trial=swingFrame(u);
      const depth=soleDepth(trial,i,route.surface).depth;
      height=Math.max(height,depth/Math.sin(Math.PI*u));
    }
    target.arcHeight=height;
  }
  const frame=swingFrame(q),point=frame.origin;
  if (bank) {
    const profile=target.bankHeights,t=q*(profile.length-1),j=Math.min(profile.length-2,Math.floor(t));
    point[1]=Math.max(point[1]+leg.clearance,mix(profile[j],profile[j+1],t-j));
  } else point[1]+=target.arcHeight*Math.sin(Math.PI*q)+leg.clearance;
  if (route.surface) point[1]+=soleDepth(frame,i,route.surface).depth;
  if (Math.hypot(...delta(point,stance.frame.origin))<.90*person.height) {
    const held=stance.frame;
    const collision=shellClearance(worldShell(frame,bootHull[i]),worldShell(held,bootHull[1-i]),
      [delta(point,stance.point),right,UP,frame.x,frame.y,frame.z,held.x,held.y,held.z]);
    if (collision.gap<.012) {
      const shift=.012-collision.gap;
      for (let j=0;j<3;j++) point[j]+=collision.normal[j]*shift;
      if (route.surface) point[1]+=soleDepth(frame,i,route.surface).depth;
    }
  }
  leg.point=leg.crampon?frontPoint(frame,i,route.surface):point;leg.frame=frame;
}

function makeShadow(member, route, right, heading) {
  const points = [], center = member.position;
  for (let i = 0; i < 12; i++) {
    const theta = TAU * i / 12;
    const p = along(along(center, right, .53 * Math.cos(theta) + .09),
      heading, .78 * Math.sin(theta) - .13);
    if (route.surface) p[1] = route.surface(p[0], p[2])[1];
    p[1] += .035;
    points.push(p);
  }
  return points;
}

// Both knees bend on their anatomical side of a plane through the pelvis
// and ankle midpoints. At a switchback its orientation follows the stance
// rather than spinning with the route tangent between two fixed boots.
function kneePose(hip,ankle,thigh,shin,bend,right,mid,normal,sign,girth,surface,otherBoot,otherFoot,previous,dt,opposite,coat,snow,ice) {
  const axis=unit(delta(ankle,hip),[0,-1,0]),reach=Math.hypot(...delta(ankle,hip));
  const offset=clamp((thigh*thigh-shin*shin+reach*reach)/(2*Math.max(.001,reach)),0,thigh);
  const radius=Math.sqrt(Math.max(0,thigh*thigh-offset*offset)),center=along(hip,axis,offset);
  const outward=times(normal,sign),across=unit(along(outward,axis,-dot(outward,axis)),right);
  const around=cross(axis,across),preferred=unit(along(bend,axis,-dot(bend,axis)),across);
  // The knee flexes from the outward side toward the toe. Keeping this
  // branch fixed avoids a 180-degree flip when the downhill hint passes
  // behind a planted foot.
  const theta=sign*Math.atan2(Math.max(0,sign*dot(preferred,around)),Math.max(.12,dot(preferred,across)));
  const room=(.188*girth-dot(delta(center,mid),outward))/Math.max(.0001,radius*dot(across,outward));
  const limit=Math.acos(clamp(room,-1,1));
  let target=clamp(theta,-limit,limit);
  // A raised foot flexes the knee in front of the belt. Choose the lower
  // part of the same IK circle before the shank folds into the jacket.
  const peak=Math.atan2(around[1],across[1]),vertical=radius*Math.hypot(across[1],around[1]);
  const ceiling=Math.max(hip[1]-.28*girth,ankle[1]+.18*girth);
  if (vertical>.001 && center[1]+vertical*Math.cos(target-peak)>ceiling) {
    const edge=Math.acos(clamp((ceiling-center[1])/vertical,-1,1));
    const nearest=Math.atan2(Math.sin(target-peak),Math.cos(target-peak));
    target=peak+(nearest<0?-edge:edge);
  }
  const old=previous?delta(previous,center):null;
  const prior=old?Math.atan2(dot(old,around),dot(old,across)):target;
  const difference=Math.atan2(Math.sin(target-prior),Math.cos(target-prior));
  const turnRate=mix(3.8,10,snow);
  const angle=prior+clamp(difference,-turnRate*dt,turnRate*dt);
  function inspect(knee) {
    const upper=segment(hip,knee,right,girth),lower=segment(knee,ankle,right,girth);
    const joint=kneeSection(upper,lower);
    let below=0,crossed=0,clip=0,legsClip=0,hemClip=0,lengthError=0;
    const nudges={};
    function correction(key,direction,depth,weight) {
      const movement=depth/Math.max(.25,weight);
      nudges[key]=times(direction,movement);
    }
    for (const [bone,cloth,vertices] of [[upper,trousers,trouserShell],[lower,gaiter,gaiterShell]]) {
      const upperLeg=bone===upper,nominal=upperLeg?thigh:shin,length=Math.hypot(...bone.y);
      const adjustment=clamp(length,nominal*.83,nominal*1.16)-length;
      if (adjustment) {
        lengthError+=Math.abs(adjustment);
        nudges[upperLeg?'thigh':'shin']=times(bone.y,(upperLeg?1:-1)*adjustment/Math.max(.001,length));
      }
      const shell=worldShell(bone,vertices);
      if (!opposite) for (let i=0;i<shell.length;i++) {
        const p=shell[i],weight=bone===upper?vertices[i][1]:1-vertices[i][1];
        const inside=-dot(delta(p,mid),outward);
        if (inside>crossed && weight>.05) {crossed=inside;correction('outside',outward,inside+.002,weight);}
      }
      // Even when the knee bends, both transverse frames preserve girth.
      // Every fabric sample lies inside this expanded bone segment. Query
      // exact terrain only for samples that can reach it.
      const from=bone.origin,to=upperLeg?knee:ankle;
      const pad=girth*cloth.radius+(joint?Math.hypot(...joint.inset):0)+1e-7;
      const floor=surface?.maxHeight?.(Math.min(from[0],to[0])-pad,Math.max(from[0],to[0])+pad,
        Math.min(from[2],to[2])-pad,Math.max(from[2],to[2])+pad)??Infinity;
      if (surface && Math.min(from[1],to[1])-pad<=floor) {
        const fabric=posedCloth(cloth,bone,joint);
        let deepest,contactWeight;
        for (let i=0;i<shell.length+fabric.length;i++) {
          const p=i<shell.length?shell[i]:fabric[i-shell.length];
          const v=i<shell.length?vertices[i]:cloth.local[i-shell.length],weight=upperLeg?v[1]:1-v[1];
          if (p[1]>=floor || weight<=.015 || (surface.localCeiling && p[1]>=surface.localCeiling(p[0],p[2]))) continue;
          const d=surface(p[0],p[2])[1]-p[1];
          if (d>below) {below=d;deepest=p;contactWeight=weight;}
        }
        if (deepest) {
          const gx=localSlope(surface,deepest,RIGHT,0),gz=localSlope(surface,deepest,FORWARD,0);
          const magnitude=Math.hypot(gx,1,gz),dir=[-gx/magnitude,1/magnitude,-gz/magnitude];
          correction('ground',dir,(below+.002)/magnitude,contactWeight);
          correction('lift',UP,below+.003,contactWeight);
        }
      }
      const center=along(bone.origin,bone.y,.5);
      if (!upperLeg && Math.max(knee[1],ankle[1])>coat.low-.19*girth) {
        const separation=delta(center,coat.center);
        const hit=shellClearance(shell,coat.points,[...coat.axes,separation,bone.x,bone.y,bone.z]);
        hemClip=Math.max(0,.016-hit.gap);
        if (hemClip) correction('hem',hit.normal,hemClip+.002,.72);
      }
      if (opposite) for (const other of opposite) {
        const gap=delta(center,other.center);
        if (Math.hypot(...gap)>.57*(Math.hypot(...other.bone.y)+Math.hypot(...bone.y))+.38*girth) continue;
        const axes=[normal,gap,bone.x,bone.y,bone.z,other.bone.x,other.bone.y,other.bone.z];
        const hit=shellClearance(shell,other.shell,axes);
        if (.005-hit.gap>legsClip) {
          legsClip=.005-hit.gap;correction('outside',hit.normal,legsClip+.001,.55);
        }
      }
      if (Math.hypot(...delta(center,otherBoot.origin))<1.02*girth) {
        const axes=[delta(center,otherBoot.origin),right,UP,otherBoot.x,otherBoot.y,otherBoot.z,
          bone.x,bone.y,bone.z];
        const collision=shellClearance(shell,worldShell(otherBoot,bootHull[otherFoot]),axes),depth=.006-collision.gap;
        if (depth>clip) {clip=depth;correction('boot',collision.normal,depth+.002,.56);}
      }
    }
    const contactError=below*2+crossed+legsClip*2+hemClip*4+clip*2;
    return {upper,lower,knee,contactError,error:contactError+lengthError*.35,nudges};
  }
  function candidate(a) {
    const knee=along(along(center,across,radius*Math.cos(a)),around,radius*Math.sin(a));
    return inspect(knee);
  }
  let best=candidate(angle);
  // Near a cliff edge two collision-free bends on the rigid IK circle may
  // be almost opposite. Let fabric at the knee compress slightly while
  // keeping both endpoints fixed, instead of switching branches in a frame.
  const kneeSpeed=mix(5.4,6.75,ice)*girth*dt,contactSpeed=mix(6.6,7.8,ice)*girth*dt;
  if (previous) {
    const travel=delta(best.knee,previous),length=Math.hypot(...travel);
    if (length>kneeSpeed+.00001) best=inspect(along(previous,travel,kneeSpeed/length));
  }
  for (let n=0;n<12 && best.error>.001;n++) {
    const start=best,adjustments=Object.values(start.nudges);
    if (adjustments.length>1) {
      const lateral=start.nudges.outside||start.nudges.boot||[0,0,0];
      adjustments.push(along(lateral,start.nudges.ground||[0,0,0],1),
        along(lateral,start.nudges.lift||[0,0,0],1));
    }
    for (const move of adjustments) {
      const trial=inspect(along(start.knee,move,1));
      if (trial.error<best.error) best=trial;
      if (best.error<.001) break;
    }
    if (best.error>=start.error-.00001) break;
  }
  if (previous && (best.error>.004 || Math.hypot(...delta(best.knee,previous))>contactSpeed)) {
    // At a facet or a frozen boot the contact normal can change abruptly.
    // Find the nearest free position at this tick before considering any
    // further point on the rigid IK circle.
    const toward=delta(best.knee,previous),distance=Math.hypot(...toward);
    const limited=inspect(along(previous,toward,Math.min(1,contactSpeed/Math.max(.0001,distance))));
    if (limited.contactError<.002 && limited.error<.045*girth) return limited;
    let local=limited;
    for (const radius of [.06,.13,.20,.26,.30,.35,.42]) {
      for (const dir of kneeDirections) {
        const trial=inspect(along(previous,dir,radius*girth));
        if (trial.error<local.error) local=trial;
      }
      if (local.error<.001) break;
    }
    if (local.error<.001) {
      const safe=local.knee;
      let lo=0,hi=1;
      for (let i=0;i<6;i++) {
        const f=(lo+hi)*.5,trial=inspect(between(previous,safe,f));
        if (trial.error<.001) {local=trial;hi=f;} else lo=f;
      }
    }
    if (local.error<.004 || local.error<best.error) best=local;
    return best;
  }
  if (best.error<=.004) return best;
  if (best.error>.001 && radius>.001) {
    const ends=[-sign*limit,sign*limit];
    for (const end of ends) {
      let last=angle;
      for (let i=1;i<=8;i++) {
        const value=mix(angle,end,i/8), next=candidate(value);
        if (next.error<best.error) best=next;
        if (next.error<.0005) {
          let lo=last,hi=value;
          for (let j=0;j<5;j++) {
            const m=(lo+hi)*.5,middle=candidate(m);
            if (middle.error<.0005) {hi=m;best=middle;} else lo=m;
          }
          return best;
        }
        last=value;
      }
    }
  }
  return best;
}

function articulate(member,route,previous,dt) {
  const { person, position, legs, poles, stride, t, gesture } = member;
  const h = person.height, width = person.width, bones = {};
  const idle=1-member.drive, equipment=member.equipment;
  const ice=equipment?.kind==='ice'?equipment.blend:0, ladder=equipment?.kind==='ladder'?equipment.blend:0;
  const mantle=ice?smooth(equipment.b-3.0*h,equipment.b-.35*h,member.step.distance)*
    (1-smooth(equipment.b+.12*h,equipment.b+1.65*h,member.step.distance)):0;
  const trail=unit([member.tangent[0],0,member.tangent[2]],FORWARD);
  const bridgeLine=ladder?delta(equipment.contact(1),equipment.contact(0)):null;
  const heading=ice?unit(between(trail,iceFacing(route,position,trail),ice),trail):
    ladder?unit(between(trail,unit([bridgeLine[0],0,bridgeLine[2]],trail),ladder),trail):trail;
  const right = cross(UP, heading);
  const breath = Math.sin(t * (1.17 + person.seed * .015) + person.seed);
  const strideWave = Math.sin(stride);
  const order=member.cooperation, trust=order?.amount||0;
  const snow=member.snow*(1-trust);
  const settle=idle*(.70*Math.sin(t*(.39+.02*person.rank)+person.seed)+.30*Math.sin(t*.73+person.seed*.4));
  const balance=mix(mix(.15,.095,Math.max(snow,ladder)),.25,ice)*member.weight+
    mix(.065,.025,Math.max(snow,ice,ladder))*settle;
  const partner=order?delta(order.partnerPosition,position):heading;
  const bearing=Math.atan2(dot(partner,right),dot(partner,heading));
  const facing=Math.abs(bearing)>2.2?(person.seed%2?1:-1)*1.58:clamp(bearing,-1.58,1.58);
  const sockets = [], ankles = [];
  const feet=delta(legs[1].frame.origin,legs[0].frame.origin),footRight=unit([feet[0],0,feet[2]],right);
  const turn=(1-Math.max(ice,ladder))*smooth(mix(.49,.29,snow)*h,.12*h,dot(feet,right));
  const legRight=unit(between(right,footRight,turn),right);
  const uphill=localSlope(route.surface,position,heading,member.slope,.48), crossSlope=localSlope(route.surface,position,right,0,.48);
  const ramp=bridgeLine?bridgeLine[1]/Math.hypot(bridgeLine[0],bridgeLine[2]):uphill;
  const foreGrade=mix(uphill,ramp,ladder),sideGrade=crossSlope*(1-ladder);
  const grade=Math.hypot(foreGrade,sideGrade);
  const fallLine=unit(along(times(heading,-foreGrade),right,-sideGrade),heading);
  const wall=smooth(.42,1.9,grade);
  const steepTraverse=smooth(.95,2.15,grade);
  const hips = along(along(along(position, right, balance*h), heading, (.055-.065*trust)*h),
    fallLine,mix(mix(.49,mix(.23,.68,steepTraverse),snow),.63,ice)*h*wall*(1-ladder));
  const thigh = .98 * h, shin = .96 * h;
  let hipY=position[1]+h*(1.96+.045*member.drive+.024*breath-.038*Math.abs(settle)
    -.15*Math.max(0,member.slope)-.025*ladder+.25*ice-(order?.role==='pull'?.52:.10)*trust);

  for (let i=0;i<2;i++) {
    bones['boot'+i]=legs[i].frame;
    if (legs[i].crampon || ice>.05) bones['crampon'+i]=legs[i].frame;
    ankles[i]=pointIn(legs[i].frame,0,.22,-.08);
  }
  // On the lip of a crevasse the ground tangent can turn between the two
  // rungs. Keep the pelvis over its real feet before setting its height.
  const ankleMid=between(ankles[0],ankles[1],.5);
  const reachXZ=Math.max(...ankles.map(p=>Math.hypot(p[0]-hips[0],p[2]-hips[2])));
  const recenter=smooth(.86*h,1.64*h,reachXZ)*.90;
  hips[0]=mix(hips[0],ankleMid[0],recenter);hips[2]=mix(hips[2],ankleMid[2],recenter);
  hipY=Math.max(hipY,Math.max(ankles[0][1],ankles[1][1])+.72*h);
  const stance=1-(member.step.index+person.seed)%2,loaded=ankles[stance];
  const socket=along(hips,legRight,(stance?1:-1)*.242*h*width);
  const horizontal=Math.hypot(loaded[0]-socket[0],loaded[2]-socket[2]);
  const standingReach=(thigh+shin)*.967;
  const supportHeight=loaded[1]+Math.sqrt(Math.max(.01,standingReach**2-horizontal**2));
  // Rise over the planted boot in midstance, then lower the pelvis as
  // weight passes to the next foot. The supporting knee stays unlocked.
  hipY=mix(hipY,supportHeight,(Math.max(snow,ladder)+ice*smooth(.35,.82,member.step.u))*Math.abs(member.weight));
  // The ice flattens at the rim. Keep weight low over the tools while
  // stepping up onto the lip, then stand after both boots have crossed.
  hipY-=.60*h*mantle;

  // A lower foothold limits hip height. Both legs retain their lengths even
  // when a step crosses the edge between two steep facets of the mountain.
  const standing=hipY,extended=(thigh+shin)*mix(.995,.985,Math.max(snow,ice,ladder));
  for (let pass=0;pass<5;pass++) {
    hipY=standing;
    for (let i=0;i<2;i++) {
      sockets[i]=along(hips,legRight,(i?1:-1)*.242*h*width);
      const dx=sockets[i][0]-ankles[i][0],dz=sockets[i][2]-ankles[i][2];
      hipY=Math.min(hipY,ankles[i][1]+Math.sqrt(Math.max(.01,extended*extended-dx*dx-dz*dz)));
    }
    if (!route.surface || pass===4) break;
    // A sharp ridge can be higher next to the socket than under the body.
    // Shift the pelvis downhill just enough for the outside of the trousers.
    let buried=0,steepest;
    for (const socket of sockets) {
      const gx=localSlope(route.surface,socket,RIGHT,0),gz=localSlope(route.surface,socket,FORWARD,0);
      const grade=Math.hypot(gx,gz),toHill=unit([gx,0,gz],heading);
      const rim=along(socket,toHill,.218*h*width);
      const gap=route.surface(rim[0],rim[2])[1]-hipY+.025;
      if (gap>buried && grade>.2) {buried=gap;steepest={toHill,grade};}
    }
    if (!steepest) break;
    const shift=clamp((buried+.025)/steepest.grade,.02,.55*h);
    hips[0]-=steepest.toHill[0]*shift;hips[2]-=steepest.toHill[2]*shift;
  }
  hips[1] = hipY;
  const attention=order?.role==='crossing'?trust*.16:trust;
  const footStagger=clamp(dot(feet,heading)/(.79*h),-1,1);
  const twist=(mix(.11*strideWave,.13*footStagger,snow)+.055*settle+facing*attention*.81)*(1-.65*ice);
  const rightTwisted = along(times(right, Math.cos(twist)), heading, -Math.sin(twist));
  const lean=mix(.08+.25*Math.max(0,member.slope)+.038*member.drive-.035*ladder
    +(member.checking?.14:-.035)*gesture+(order?.role==='belay'?-.16:.08)*trust,
    .45+.05*smooth(.47,.92,member.step.u)*(1-smooth(.92,1,member.step.u))+.52*mantle,ice);
  const toward=unit([partner[0],0,partner[2]],heading);
  let trunk=along(along(UP,heading,Math.tan(lean)),right,.28*balance);
  if (order?.role==='pull') trunk=along(trunk,toward,.16*trust);
  if (order?.role==='reach') trunk=between(trunk,along(UP,toward,-.22),trust);
  const upTorso=unit(trunk,UP);
  const xTorso = unit(along(rightTwisted, upTorso, -dot(rightTwisted, upTorso)), right);
  const zTorso = cross(xTorso, upTorso);
  const torso = fullFrame(hips, xTorso, upTorso, zTorso, h, width);
  if (ladder) {
    // The rails rise with the rungs. Lower the shoulders just enough to
    // keep both mitts around the physical ropes throughout weight transfer.
    let lower=0;
    for (const i of [0,1]) {
      const shoulder=pointIn(torso,(i?1:-1)*.40,1.22,.012),grip=member.rails[i];
      const reach=1.225*h,run=Math.hypot(shoulder[0]-grip[0],shoulder[2]-grip[2]);
      lower=Math.max(lower,shoulder[1]-grip[1]-Math.sqrt(Math.max(.01,reach*reach-run*run)));
    }
    hips[1]-=lower*member.railUse;hipY=hips[1];
  }
  const coat={points:worldShell(torso,coatPanels),center:pointIn(torso,0,.48,0),axes:[upTorso,xTorso,zTorso]};
  coat.low=Math.min(...coat.points.map(p=>p[1]));
  // A boot on a high foothold is fixed. Move the pelvis off its toe if the
  // jacket hem would cover it, before placing the two knees and the hands.
  for (let i=0;i<2;i++) {
    const boot=bones['boot'+i];
    if (boot.origin[1]+.70*h<coat.low) continue;
    const foot=worldShell(boot,bootHull[i]),offset=delta(hips,boot.origin);
    // The cuff around the ankle can extend beyond the upper boot leather.
    // Include it when deciding how far the belayer must lean away.
    for (const axis of [boot.x,boot.y,boot.z]) {
      foot.push(along(ankles[i],axis,.19),along(ankles[i],axis,-.19));
    }
    const hit=shellClearance(coat.points,foot,[...coat.axes,offset,boot.x,boot.y,boot.z],.08*h);
    if (hit.gap>=.08*h) continue;
    const shift=times(hit.normal,.08*h-hit.gap);
    for (let k=0;k<3;k++) {
      hips[k]+=shift[k];coat.center[k]+=shift[k];
      for (const p of coat.points) p[k]+=shift[k];
      for (const socket of sockets) socket[k]+=shift[k];
    }
    hipY=hips[1];coat.low+=shift[1];
  }
  bones.torso = torso;
  bones.pack = torso;
  member.harness = pointIn(torso, 0, .045, .29);

  const glanceSide = person.seed % 2 ? -1 : 1;
  const yaw=mix(twist*.45+.11*Math.sin(t*.57+person.seed)
    +glanceSide*gesture*(member.checking?.38:1.42),facing*1.12,attention);
  const gaze = along(times(heading, Math.cos(yaw)), right, Math.sin(yaw));
  const headX = cross(UP, gaze);
  const gazeAtPartner=order?.role==='pull'?-.33:order?.role==='reach'?.24:0;
  const pitch=-.045+.17*member.slope+.025*breath-(member.checking?.52:-.10)*gesture
    -.28*ladder+.22*ice+gazeAtPartner*trust;
  const headZ = along(times(gaze, Math.cos(pitch)), UP, Math.sin(pitch));
  bones.head = fullFrame(pointIn(torso, 0, 1.40, .012), headX, cross(headZ, headX), headZ, h, width);

  const legAxis=unit(delta(hips,ankleMid),UP);
  const dividingNormal=unit(along(legRight,legAxis,-dot(legRight,legAxis)),legRight);
  for (let i = 0; i < 2; i++) {
    const sign = i ? 1 : -1, hip = sockets[i], ankle = ankles[i];
    hip[1] = hipY;
    const technical=along(along(heading,legRight,sign*(.38+.66*wall)),fallLine,1.85*wall);
    // On a traverse the knee follows the boot's toe, irrespective of the
    // direction in which the hillside falls away under the stance.
    const toe=unit([legs[i].frame.z[0],0,legs[i].frame.z[2]],heading);
    const forwardBend=along(along(toe,legRight,sign*.065),fallLine,.28*steepTraverse);
    const trailBend=between(between(technical,forwardBend,snow),along(toe,legRight,sign*.08),ladder);
    const bend=between(trailBend,along(heading,legRight,sign*.27),ice);
    const other=i===1?[bones.thigh0,bones.shin0]:null;
    const opposite=other?.map((bone,j)=>({bone,center:along(bone.origin,bone.y,.5),
      shell:worldShell(bone,(j?legShells.shin:legShells.thigh).flat())}));
    const knee=kneePose(hip,ankle,thigh,shin,bend,legRight,hips,dividingNormal,sign,h*width,route.surface,
      bones['boot'+(1-i)],1-i,previous?.[i],dt,opposite,coat,Math.max(snow,ice,ladder),ice);
    bones['thigh' + i] = knee.upper;
    bones['shin' + i] = knee.lower;

    const shoulder = pointIn(torso, .40 * sign, 1.22, .012);
    const upper = .64 * h, forearm = .61 * h;
    const hasPole = person.rank !== 1 || i === 0;
    const counterSwing=(i?-1:1)*footStagger;
    let palm;
    if (hasPole) {
      const tip = poles[i].point;
      const loading=member.drive*(i===(member.step.index+person.seed)%2?.25:1);
      const reachForward=mix(.44+.13*Math.cos(stride+i*Math.PI),.31+.30*counterSwing,snow);
      const aim=along(along(along(shoulder,right,sign*mix(.115,.075,snow)*h),UP,(-.77-.12*loading)*h),
        heading,reachForward*h);
      const distance = Math.hypot(...delta(tip, shoulder));
      const armReach = upper + forearm - .02 * h;
      // The wrist lies at the intersection of the pole-length sphere and
      // the arm's reach. The pole telescopes only on exceptionally steep steps.
      const staff = clamp((2.33 + .07 * i) * h, Math.max(.58 * h, distance - armReach + .03 * h),
        distance + armReach - .03 * h);
      const reach = clamp(Math.hypot(...delta(aim, shoulder)), Math.abs(distance - staff) + .012 * h, armReach);
      const desired=delta(aim,shoulder),axis=unit(delta(tip,shoulder),UP);
      const leverage=Math.hypot(...along(desired,axis,-dot(desired,axis)))/h;
      const rigid=solveJoint(shoulder,tip,reach,staff,desired);
      // Close to alignment, the shoulder/tip circle cannot distinguish
      // which side to bend toward. Absorb the shortening in the pole and
      // keep the hand in front of the climber on that transition.
      palm=between(aim,rigid,smooth(.18,.78,leverage));
      bones['pole' + i] = {...segment(palm, tip, right, h),location:'hand'};
    } else {
      const adjust = member.checking ? gesture : 0;
      const swing=mix(.18+.29*strideWave,.13+.40*counterSwing,snow);
      palm = along(along(along(shoulder, right, (.14 - .27 * adjust) * h), UP, (-.94 + .79 * adjust) * h),
        heading, mix(swing,.27,adjust)*h);
    }
    const elbow = solveJoint(shoulder, palm, upper, forearm, along(times(heading, -1), right, sign * .62));
    bones['upperArm' + i] = segment(shoulder, elbow, right, h * width);
    bones['forearm' + i] = segment(elbow, palm, right, h * width);
    bones['hand' + i] = fullFrame(palm, xTorso, upTorso, zTorso, h, width);
  }
  member.bones = bones;
  member.groundShadow = makeShadow(member, route, right, heading);
}

function between(a,b,t) {
  return [mix(a[0],b[0],t),mix(a[1],b[1],t),mix(a[2],b[2],t)];
}

function setGrip(member,i,target,weight) {
  const {bones,person}=member, h=person.height,side=i?1:-1;
  const shoulder=bones['upperArm'+i].origin;
  const vector=delta(between(bones['hand'+i].origin,target,weight),shoulder);
  const reach=Math.hypot(...vector);
  const hand=along(shoulder,unit(vector,UP),clamp(reach,.12*h,1.24*h));
  const right=unit(bones.torso.x,RIGHT),forward=unit(bones.torso.z,FORWARD);
  const elbow=solveJoint(shoulder,hand,.64*h,.61*h,along(times(forward,-1),right,.65*side));
  bones['upperArm'+i]=segment(shoulder,elbow,right,h*person.width);
  bones['forearm'+i]=segment(elbow,hand,right,h*person.width);
  bones['hand'+i]={...bones['hand'+i],origin:hand};
  return hand;
}

// The same staff moves from its grip onto a pack strap as the climber takes
// a handline, a partner's hand or an ice tool. Planted pole bones remain
// separately identifiable for contact tests and the normal walking rig.
function slingStaff(member,i,weight) {
  const {bones,person}=member, key='pole'+i, staff=bones[key]||member.carriedTools?.[key];
  if (!staff||weight<=0||staff.stowed===1) return;
  const side=i?1:-1, torso=bones.torso;
  const a=between(staff.origin,pointIn(torso,side*.31,1.24,-.59),weight);
  const b=between(along(staff.origin,staff.y,1),pointIn(torso,side*.40,.10,-.59),weight);
  const stowed=mix(staff.stowed||0,1,weight);
  (member.carriedTools||={})[key]={...segment(a,b,unit(torso.x,RIGHT),person.height),stowed,
    location:stowed>.999?'pack':'transfer'};
  delete bones[key];
}

function axeFrame(origin,direction,outward,h,location) {
  const x=unit(cross(direction,outward),RIGHT), z=unit(cross(x,direction),FORWARD);
  return {origin,x:times(x,h),y:times(direction,1.18*h),z:times(z,h),location};
}

function iceToolChange(member,i) {
  const {equipment:f,person,step}=member;
  if (f?.kind!=='ice') return 0;
  const h=person.height;
  return smooth(f.a-(i?1.82:2.45)*h,f.a-(i?.05:.40)*h,step.distance)*
    (1-smooth(f.b+(i?.04:.47)*h,f.b+(i?1.65:2.12)*h,step.distance));
}

// A belayer already has the staff on the pack. Let go of the rope after the
// staff is secure and before extracting that hand's axe. On the far bank the
// same sequence runs backwards as the climber takes the rope for a partner.
function freeHand(member,i) {
  return 1-smooth(.27,.57,iceToolChange(member,i));
}

function obstacleGrips(member,route) {
  const {equipment:f,step,person,bones}=member;
  const h=person.height,right=unit(bones.torso.x,RIGHT),forward=unit(bones.torso.z,FORWARD);
  const swingLeg=(step.index+person.seed)%2;
  const carried=member.carriedTools||={};
  for (let i=0;i<2;i++) {
    const sign=i?1:-1,key='axe'+i;
    const rackBase=pointIn(bones.torso,sign*.42,1.19,-.41);
    const rackAxis=unit(delta(pointIn(bones.torso,sign*.40,.13,-.64),rackBase),times(UP,-1));
    // Axes are lashed upside down with their blades turned across the pack.
    const rackOut=unit(along(times(right,-sign),forward,-.34),RIGHT);
    carried[key]=axeFrame(rackBase,rackAxis,rackOut,h,'pack');
    if (!f) continue;
    const stationU=d=>clamp((route.fraction(d)-f.start)/(f.end-f.start));
    if (f.kind==='ladder' && f.handhold) {
      const rail=member.rails[i];
      slingStaff(member,i,f.blend);
      setGrip(member,i,rail,member.railUse);
      if (i===1) member.railGrip={hand:i,target:rail,amount:member.railUse};
    }
    if (f.kind==='ice') {
      const lane=member.lane-sign*.50;
      const anchor=contact(route,step,lane,i!==swingLeg,.012,.27,0,0,false,'pick'+i);
      // A diagonal route across the wall still needs a pick above the
      // shoulder, not ahead of the climber along the diagonal. Each fixed
      // bite is shared by the two consecutive foot placements below it.
      const center=route.at(anchor.distance-.42*step.length,member.lane);
      const facing=iceFacing(route,center,flatHeading(member.ahead,member.behind));
      const acrossFace=cross(UP,facing);
      const grade=Math.max(.72,localSlope(route.surface,center,facing,1.65,.58));
      const reach=(i?2.32:2.45)*h/grade;
      const insertion=along(along(center,acrossFace,sign*.48*h),facing,clamp(reach,.94*h,1.68*h));
      const wall=route.surface(insertion[0],insertion[2]);
      const u=stationU(anchor.distance+2.05*h);
      const uphill=delta(f.contact(clamp(u+.012),lane),f.contact(clamp(u-.012),lane));
      const across=delta(f.contact(u,lane+.08),f.contact(u,lane-.08));
      let normal=unit(cross(across,uphill),UP);
      if (normal[1]<0) normal=times(normal,-1);
      const q=anchor.swing,draw=smooth(0,.30,q)*(1-smooth(.67,.97,q));
      const lift=smooth(.14,.63,q)*(1-smooth(.67,.97,q));
      const target=along(along(along(wall,normal,.73*h*draw),UP,.86*h*lift),right,sign*.12*h*draw);
      const shoulder=bones['upperArm'+i].origin, span=Math.hypot(...delta(target,shoulder)), tool=1.18*h;
      const aim=along(along(along(target,normal,.44*h),UP,-.98*h),right,sign*.09*h);
      const arm=clamp(Math.hypot(...delta(aim,shoulder)),Math.min(1.23*h,Math.abs(span-tool)+.011*h),
        Math.min(1.23*h,span+tool-.011*h));
      const workGrip=solveJoint(shoulder,target,arm,tool,delta(aim,shoulder));
      // Above the lip there is no higher ice for the pick to bite. Bring the
      // still-held tool over the ledge with its head up before racking it.
      const crest=smooth(f.b+.30*h,f.b+1.12*h,step.distance)*smooth(2.25*h,2.52*h,span)*(u>.95?1:0);
      const carryGrip=along(along(along(shoulder,forward,.58*h),UP,-.54*h),right,sign*.22*h);
      const grip=between(workGrip,carryGrip,crest);
      const change=iceToolChange(member,i);
      const fetch=smooth(.06,.57,change),use=smooth(.57,1,change);
      const staffStow=smooth(0,.27,change);
      slingStaff(member,i,staffStow);
      if (staffStow>0 && carried['pole'+i]) {
        setGrip(member,i,carried['pole'+i].origin,1);
      }
      const hand=setGrip(member,i,between(rackBase,grip,use),fetch);
      const workAxis=unit(between(unit(delta(target,hand),UP),unit(along(UP,forward,.27),UP),crest),UP);
      const axis=unit(along(between(rackAxis,workAxis,use),right,sign*.74*Math.sin(Math.PI*use)),UP);
      if (use>0) {
        bones[key]=axeFrame(hand,axis,unit(between(rackOut,normal,use),normal),h,use>.999?'hand':'transfer');
        delete carried[key];
      }
      const frame=bones[key]||carried[key], point=along(frame.origin,frame.y,1);
      const planted=use>.999&&Math.hypot(...delta(point,wall))<.012;
      const phase=use<.999?'transfer':crest>.1?'mantle':q<=0||q>=1?'load':q<.22?'withdraw':q<.67?'raise':'strike';
      (member.icePicks||=[])[i]={point,contact:wall,planted,amount:use,phase};
    }
  }
}

function pairAction(team,progress) {
  const [leader,second]=team;
  // On the last switchbacks the distance between adjacent ledges is short
  // enough for a direct hand-up. Along a wider obstacle the second belays.
  const near=Math.hypot(...delta(leader.position,second.position));
  const pull=smooth(.82,.95,progress)*(1-smooth(.985,1,progress))*(1-smooth(1.85,3.0,near))*
    Math.min(freeHand(leader,0),freeHand(leader,1),freeHand(second,0),freeHand(second,1));
  let helper=leader,partner=second,amount=pull,kind='hand',score=pull,runnerUp=0;
  for (const member of team) {
    const f=member.equipment;
    if (!f) continue;
    const strength=f.blend*smooth(0,.15,f.u)*(1-smooth(.83,1,f.u));
    for (const index of [member.rank-1,member.rank+1]) {
      const neighbour=team[index];
      if (!neighbour) continue;
      const available=neighbour.equipment?.kind==='ladder'?1-neighbour.equipment.blend:freeHand(neighbour,1);
      const weight=strength*available;
      // When either end can belay, keep the downhill climber on the rope.
      const priority=weight*(neighbour.rank>member.rank?1:.84);
      if (priority>score) {
        runnerUp=score;score=priority;helper=neighbour;partner=member;amount=weight;kind='rope';
      } else runnerUp=Math.max(runnerUp,priority);
    }
  }
  // Let the first gesture finish before different hands take up the load.
  if (runnerUp>0) amount*=smooth(0,.15,(score-runnerUp)/score);
  if (amount<.001) return null;
  helper.cooperation={role:kind==='hand'?'pull':'belay',partnerRank:partner.rank,partnerPosition:partner.position,amount};
  partner.cooperation={role:kind==='hand'?'reach':'crossing',partnerRank:helper.rank,partnerPosition:helper.position,amount};
  return {helper,partner,amount,kind};
}

function clearHandhold(palm,a,b,helperHeight,partnerHeight,surface) {
  const mittenRadius=.15*Math.max(helperHeight,partnerHeight);
  function clearance(p) {
    const floor=surface(p[0],p[2])[1];
    const gx=localSlope(surface,p,RIGHT,0),gz=localSlope(surface,p,FORWARD,0);
    return p[1]-floor-mittenRadius*Math.hypot(1,gx,gz);
  }
  if (clearance(palm)>=0) return palm;
  // Bending both elbows brings the hands toward the line joining their
  // shoulders. This whole segment lies inside both reachable arm volumes.
  let inside=between(a,b,helperHeight/(helperHeight+partnerHeight));
  if (clearance(inside)<0) {
    inside=solveJoint(a,b,1.24*helperHeight,1.24*partnerHeight,UP);
    if (clearance(inside)<0) return null;
  }
  let lo=0,hi=1;
  for (let i=0;i<14;i++) {
    const mid=(lo+hi)*.5;
    if (clearance(between(palm,inside,mid))<0) lo=mid; else hi=mid;
  }
  return between(palm,inside,hi);
}

function joinPartners(action,surface) {
  if (!action) return;
  const {helper,partner,amount,kind}=action;
  if (kind==='hand') {
    const gap=delta(partner.position,helper.position);
    let open=unit([gap[2],0,-gap[0]],FORWARD);
    if (open[2]<0) open=times(open,-1);
    const i=dot(helper.bones.torso.x,open)>0?1:0, j=dot(partner.bones.torso.x,open)>0?1:0;
    const a=helper.bones['upperArm'+i].origin,b=partner.bones['upperArm'+j].origin;
    const separation=Math.hypot(...delta(a,b)),total=1.23*(helper.person.height+partner.person.height);
    const blend=amount*(1-smooth(total-.02,total+.24,separation));
    if (blend===0) return;
    const h1=helper.person.height,h2=partner.person.height;
    const reach=clamp(separation/(h1+h2),1.19,1.24);
    let palm=solveJoint(a,b,reach*h1,reach*h2,along(open,UP,-.13));
    if (surface && separation<=1.24*(h1+h2)) {
      palm=clearHandhold(palm,a,b,h1,h2,surface);
      if (!palm) return;
    }
    slingStaff(helper,i,blend);slingStaff(partner,j,blend);
    setGrip(helper,i,palm,blend);setGrip(partner,j,palm,blend);
    helper.cooperation.hand=i;partner.cooperation.hand=j;
  } else {
    const toward=unit(delta(partner.harness,helper.harness),FORWARD);
    const brake=along(along(helper.harness,toward,.48*helper.person.height),UP,.38*helper.person.height);
    slingStaff(helper,1,amount);
    const palm=setGrip(helper,1,brake,amount);
    const link=helper.rank>partner.rank?helper:partner;
    link.ropeGuide=between(helper.harness,palm,amount);
    link.ropeTension=amount;
  }
}

export function createParties() {
  const paths = new WeakMap(), render = createPartyRenderer();
  function courseFor(terrain) {
    let course = paths.get(terrain);
    if (!course) {
      const route = { pro: pathTable(terrain, 'pro'), con: pathTable(terrain, 'con') };
      const tracks=PEOPLE.map(person=>approachLane(route[person.side],person));
      course = { tracks, journeys: PEOPLE.map((person,i)=>journey(tracks[i],person)), clocks:[], landings:{} };
      paths.set(terrain, course);
    }
    return course;
  }
  function sample(terrain, progress, t, moving, variant = 'poster', secondsPerTeam = {}) {
    const course=courseFor(terrain);
    const members = PEOPLE.map((p,i) => {
      const seconds=Math.max(.01,(typeof secondsPerTeam==='number'?secondsPerTeam:secondsPerTeam?.[p.side])||1020);
      const progressNow=progress[p.side];
      const running=moving[p.side]?1:0, old=course.clocks[i], dt=old?t-old.t:0;
      // A scrub starts at the requested pose. During playback, an interrupted
      // swing settles over the support foot at each person's own response time.
      const seek=!old||dt<0||(!running && !old.target && progressNow!==old.p)||
        Math.abs(progressNow-old.p)>.001+Math.max(0,dt)*2/Math.min(seconds,old?.seconds||seconds);
      const clock=seek?{target:running,from:running,since:t,seconds,oldPace:seconds,paceSince:t}:old;
      const transition=(now)=>mix(clock.from,clock.target,smooth(0,stopDuration(p),now-clock.since));
      if (clock.target!==running) {clock.from=transition(t);clock.since=t;clock.target=running;}
      const paceAt=(now)=>mix(clock.oldPace,clock.seconds,smooth(0,.68,now-clock.paceSince));
      if (clock.seconds!==seconds) {clock.oldPace=paceAt(t);clock.paceSince=t;clock.seconds=seconds;}
      Object.assign(clock,{p:progressNow,t});course.clocks[i]=clock;
      clock.poseDt=!seek && dt<=.32?Math.max(0,dt):1;
      if (clock.poseDt===1) clock.knees=null;
      const activity=transition(t);
      if (!clock.plants || activity===1) clock.plants={};
      return frame(course.tracks[i],course.journeys[i],p,progressNow,t,activity,paceAt(t),clock.plants);
    });
    const pairs=[pairAction(members.slice(0,3),progress.pro),pairAction(members.slice(3),progress.con)];
    for (const [i,member] of members.entries()) {
      const route=course.tracks[i];
      const clock=course.clocks[i];
      articulate(member,route,clock.knees,clock.poseDt);
      clock.knees=[member.bones.shin0.origin,member.bones.shin1.origin];
      obstacleGrips(member,route);
      delete member.step.plants;
    }
    for (const pair of pairs) joinPartners(pair,terrain.surface);
    return { members, draw: (group, project) => render(group, project, members, variant, terrain) };
  }
  sample.footfalls=(terrain,side,progress,secondsPerTeam={})=>{
    const course=courseFor(terrain);
    const seconds=Math.max(.01,(typeof secondsPerTeam==='number'?secondsPerTeam:secondsPerTeam[side])||1020);
    let cached=course.landings[side];
    if (cached?.seconds!==seconds) {
      const events=course.journeys.flatMap((track,i)=>PEOPLE[i].side===side?track.landings(seconds):[]);
      events.sort((a,b)=>a.progress-b.progress);
      cached=course.landings[side]={seconds,events};
    }
    let lo=0,hi=cached.events.length;
    while (lo<hi) {const mid=(lo+hi)>>1;if (cached.events[mid].progress<=progress) lo=mid+1;else hi=mid;}
    return cached.events.slice(0,lo);
  };
  return sample;
}
