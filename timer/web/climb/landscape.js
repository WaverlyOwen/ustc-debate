import { Matrix4, PerspectiveCamera, Vector3 } from '../vendor/three-0.187.0/build/three.core.js';
import { createTerrain } from './terrain.js';
import { createParties } from './climbers.js';
import { mountHorizon } from './horizon.js';
import { mountSnow } from './snow.js';
import { mountFootprints } from './footprints.js';
import { movingLayer } from './moving-layer.js';

const ns = 'http://www.w3.org/2000/svg';
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const blend = (a, b, amount) => a + (b - a) * amount;

function path(parent, attributes = {}) {
  const node = parent.ownerDocument.createElementNS(ns, 'path');
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  parent.appendChild(node);
  return node;
}

// Project each shared mountain vertex once. The depth order only depends on
// camera direction, so a dolly along the same sightline reuses the ordering.
export function mountMountain(group, faces) {
  if (group.nextElementSibling?.hasAttribute('data-moving-mountain')) group.nextElementSibling.remove();
  group.style.display='';
  const vertices = [], keys = new Map();
  function indexOf(point) {
    const key = point.join(',');
    if (!keys.has(key)) {
      keys.set(key, vertices.length);
      vertices.push(point);
    }
    return keys.get(key);
  }
  const surfaces=faces.map(face=>face.points.map(indexOf));
  const surfaceVertices=vertices.length;
  const items = faces.map((face,i) => {
    const marks = face.details || [];
    const owner = marks.length ? group.ownerDocument.createElementNS(ns,'g') : group;
    if (marks.length) group.appendChild(owner);
    const polygon = path(owner, { fill:face.color, stroke:face.color, 'stroke-width':'.62' });
    const details = new Map();
    for (const mark of marks) {
      if (!details.has(mark.color)) details.set(mark.color, { color:mark.color,node:path(owner,{fill:mark.color}), pieces:[] });
      details.get(mark.color).pieces.push(mark.points.map(indexOf));
    }
    return { color:face.color,polygon, node:marks.length ? owner : polygon, indices:surfaces[i], paintRank:i,
      details:[...details.values()], bridgeHardware:face.bridgeHardware, snowWall:face.material==='firn' };
  });
  // At a snowline the high end of a long rock face can project closer than
  // the average depth of its cap. Only give the cap priority over adjoining
  // beds whose planes lie below every vertex of the cap.
  const bedsByCorner=new Map(), rims=[];
  const mapKey=([x,,z])=>x.toFixed(5)+','+z.toFixed(5);
  faces.forEach((face,i)=>{
    if (face.material!=='rock') return;
    const [a,...others]=face.points;
    let nx,ny=0,nz;
    for (let j=1;j<others.length;j++) {
      const b=others[j-1],c=others[j];
      const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
      const area=uz*vx-ux*vz;
      if (Math.abs(area)<=Math.abs(ny)) continue;
      nx=uy*vz-uz*vy;ny=area;nz=ux*vy-uy*vx;
    }
    if (Math.abs(ny)<1e-6) return;
    const bed={item:items[i],above:([x,y,z])=>y-a[1]+(nx*(x-a[0])+nz*(z-a[2]))/ny>=-1e-6};
    for (const p of face.points) {
      const key=mapKey(p);
      if (!bedsByCorner.has(key)) bedsByCorner.set(key,[]);
      bedsByCorner.get(key).push(bed);
    }
  });
  faces.forEach((face,i)=>{
    if (!face.snowShoulder && !items[i].snowWall) return;
    const neighbours=new Set(face.points.flatMap(p=>bedsByCorner.get(mapKey(p))||[]));
    const beds=[...neighbours].filter(bed=>face.points.every(bed.above)).map(bed=>bed.item);
    if (beds.length) rims.push({cap:items[i],beds});
  });
  const projected = vertices.map(() => ({}));
  // Keep the projected terrain's depth in screen tiles. Climbers and flakes
  // can share it across frames while a paused match holds its camera still.
  const tiles = [], tileSize = 40;
  let columns = 0, viewWidth = 0, viewHeight = 0;
  // A diagonal handline can span a whole screen tile while covering only a
  // thin strip. Reject boxes outside a triangle edge before clipping clothing.
  function outsideEdge(a,b,sign,left,right,top,bottom) {
    const nx=(a.y-b.y)*sign,ny=(b.x-a.x)*sign;
    return nx*((nx>=0?right:left)-a.x)+ny*((ny>=0?bottom:top)-a.y)<-1e-8;
  }
  function triangleOverlaps(a,b,c,left,right,top,bottom) {
    const sign=Math.sign((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x));
    return sign && !outsideEdge(a,b,sign,left,right,top,bottom) &&
      !outsideEdge(b,c,sign,left,right,top,bottom) && !outsideEdge(c,a,sign,left,right,top,bottom);
  }
  function bridgeOverlaps(xmin,xmax,ymin,ymax,farthest) {
    const right=Math.min(columns-1,Math.floor(xmax/tileSize));
    const bottom=Math.min(Math.ceil(viewHeight/tileSize)-1,Math.floor(ymax/tileSize));
    for (let y=Math.max(0,Math.floor(ymin/tileSize)); y<=bottom; y++) {
      for (let x=Math.max(0,Math.floor(xmin/tileSize)); x<=right; x++) {
        const hardware=tiles[y*columns+x]?.hardware;
        if (!hardware) continue;
        for (const f of hardware) {
          if (f.near>=farthest || f.xmax<=xmin || f.xmin>=xmax || f.ymax<=ymin || f.ymin>=ymax) continue;
          const ids=f.indices,a=projected[ids[0]];
          for (let j=1;j<ids.length-1;j++) {
            if (triangleOverlaps(a,projected[ids[j]],projected[ids[j+1]],xmin,xmax,ymin,ymax)) return true;
          }
        }
      }
    }
    return false;
  }
  function terrainDepth(x,y,maxDepth=Infinity) {
    if (x<0 || y<0 || x>=viewWidth || y>=viewHeight) return Infinity;
    const tx=Math.floor(x/tileSize),ty=Math.floor(y/tileSize);
    const cell=tiles[ty*columns+tx];
    if (!cell) return Infinity;
    // In overview a single tile can contain hundreds of tiny rock and snow
    // faces. Refine just the patches sampled by boots, clothing and flakes.
    let candidates=cell;
    if (cell.length>24) {
      const size=tileSize/4;
      const sx=Math.floor(x/size),sy=Math.floor(y/size);
      const patches=cell.patches ||= [];
      candidates=patches[(sy-ty*4)*4+sx-tx*4] ||= [];
      if (candidates.frame!==frame) {
        candidates.frame=frame;
        candidates.length=0;
        const left=sx*size,top=sy*size,right=left+size,bottom=top+size;
        for (const f of cell) if (f.xmax>=left && f.xmin<right && f.ymax>=top && f.ymin<bottom) candidates.push(f);
        candidates.sort((a,b)=>b.near-a.near);
      }
    }
    let limit=maxDepth;
    for (let i=candidates.length-1;i>=0;i--) {
      const face=candidates[i];
      if (face.near>=limit) {
        if (candidates!==cell) break;
        continue;
      }
      if (x<face.xmin || x>face.xmax || y<face.ymin || y>face.ymax) continue;
      const ids = face.indices, a = projected[ids[0]];
      for (let j=1; j<ids.length-1; j++) {
        const b=projected[ids[j]], c=projected[ids[j+1]];
        const bx=b.x-a.x, by=b.y-a.y, cx=c.x-a.x, cy=c.y-a.y;
        const det=bx*cy-by*cx;
        if (Math.abs(det)<.001) continue;
        const u=((x-a.x)*cy-(y-a.y)*cx)/det, v=(bx*(y-a.y)-by*(x-a.x))/det;
        if (u<0 || v<0 || u+v>1) continue;
        const depth=1/((1-u-v)/a.depth + u/b.depth + v/c.depth);
        if (depth<limit) {
          // Visibility callers need any surface in front of their point.
          // Unbounded queries still return the nearest intersection.
          if (maxDepth!==Infinity) return depth;
          limit=depth;
        }
      }
    }
    return maxDepth===Infinity ? limit : Infinity;
  }
  function visitOccluders(box, farthest, visit) {
    const left=Math.max(0,Math.floor(box.left/tileSize)), right=Math.min(columns-1,Math.floor(box.right/tileSize));
    const top=Math.max(0,Math.floor(box.top/tileSize)), bottom=Math.min(Math.ceil(viewHeight/tileSize)-1,Math.floor(box.bottom/tileSize));
    const seen=left===right && top===bottom?null:new Set();
    for (let y=top;y<=bottom;y++) for (let x=left;x<=right;x++) {
      for (const face of tiles[y*columns+x]||[]) {
        if (face.near>farthest || face.xmax<=box.left || face.xmin>=box.right ||
            face.ymax<=box.top || face.ymin>=box.bottom || seen?.has(face)) continue;
        seen?.add(face);
        const ids=face.indices;
        for (let i=1;i<ids.length-1;i++) {
          const a=projected[ids[0]],b=projected[ids[i]],c=projected[ids[i+1]];
          if (triangleOverlaps(a,b,c,box.left,box.right,box.top,box.bottom)) visit(a,b,c);
        }
      }
    }
  }
  let lastAngle = '', lastView = '', frame=0;
  const visible=[];
  // Neighbouring projected corners reuse the same tenths of a screen pixel.
  // Bound the dictionary to ordinary viewport coordinates. At a decimal
  // midpoint defer to toFixed so its binary-to-decimal rounding is preserved.
  const decimalText=[];
  function coordinate(value) {
    const scaled=Math.abs(value)*10, rounded=Math.round(scaled);
    if (rounded>40960 || Math.abs(scaled-rounded)===.5) return value.toFixed(1);
    const digits=decimalText[rounded] ||= (rounded/10).toFixed(1);
    return value<0?'-'+digits:digits;
  }
  let raster, wasRaster=false,lastRatio=1;
  return (project, yaw, pitch, width, height, viewKey, motion=false) => {
    if (motion && raster===undefined) raster=movingLayer(group,'data-moving-mountain');
    const useRaster=Boolean(motion && raster);
    const ratio=useRaster ? Math.min(2,group.ownerDocument.defaultView.devicePixelRatio||1) : 1;
    if (viewKey===lastView && width===viewWidth && height===viewHeight && useRaster===wasRaster && ratio===lastRatio) return;
    const resumeSvg=wasRaster && !useRaster;
    if (wasRaster!==useRaster) {
      raster.layer.style.display=useRaster?'':'none';
      group.style.display=useRaster?'none':'';
    }
    wasRaster=useRaster;lastRatio=ratio;
    const ctx=useRaster ? raster.begin(width,height,ratio) : null;
    if (ctx) ctx.lineWidth=.62;
    lastView=viewKey;
    frame++;
    visible.length=0;
    viewWidth=width; viewHeight=height;
    columns = Math.ceil(width/tileSize);
    const rows = Math.ceil(height/tileSize);
    tiles.length=columns*rows;
    for (const cell of tiles) if (cell) {
      cell.length=0;
      if (cell.hardware) cell.hardware.length=0;
    }
    project.terrainDepth = terrainDepth;
    project.visitOccluders = visitOccluders;
    project.bridgeOverlaps = bridgeOverlaps;
    // Surface corners decide visibility and depth. Engravings on an invisible
    // face never need screen coordinates, including during a close follow shot.
    for (let i = 0; i < surfaceVertices; i++) {
      const p = project(vertices[i], projected[i]);
      p.clip = (p.x < -2 ? 1 : p.x > width+2 ? 2 : 0) | (p.y < -2 ? 4 : p.y > height+2 ? 8 : 0);
    }
    function polygonPath(indices) {
      let d='';
      for (const i of indices) {
        const p=projected[i];
        if (p.frame!==frame) {
          if (i>=surfaceVertices) project(vertices[i],p);
          p.coords=coordinate(p.x)+','+coordinate(p.y);
          p.frame=frame;
        }
        d+=(d?'L':'M')+p.coords;
      }
      return d+'Z';
    }
    function trace(indices) {
      for (let j=0;j<indices.length;j++) {
        const i=indices[j],p=projected[i];
        if (i>=surfaceVertices && p.frame!==frame) {project(vertices[i],p);p.frame=frame;}
        if (j===0) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y);
      }
      ctx.closePath();
    }
    const angle = Math.round(yaw * 90) + '/' + Math.round(pitch * 90);
    let reorder=angle!==lastAngle;
    if (reorder) {
      lastAngle = angle;
      for (const face of items) {
        face.depth = face.indices.reduce((sum, i) => sum + projected[i].depth, 0) / face.indices.length;
      }
      for (const {cap,beds} of rims) for (const bed of beds) cap.depth=Math.min(cap.depth,bed.depth-.0001);
      items.sort((a, b) => b.depth - a.depth);
    }
    for (const face of items) {
      let clip = 15, behind = false;
      for (const i of face.indices) { clip &= projected[i].clip; behind ||= projected[i].depth < 1; }
      let hidden = Boolean(clip || behind);
      if (!hidden && face.snowWall) {
        let area=0;
        const ids=face.indices;
        for (let i=0;i<ids.length;i++) {
          const a=projected[ids[i]], b=projected[ids[(i+1)%ids.length]];
          area+=(a.x-b.x)*(a.y+b.y);
        }
        hidden=area>=0;
      }
      if (!ctx && hidden !== face.hidden) {
        face.node.style.display = hidden ? 'none' : '';
        if (face.hidden && !hidden) reorder=true;
        if (hidden) face.paintRank=-1;
        face.hidden=hidden;
      }
      if (hidden) continue;
      if (!ctx) visible.push(face);
      let xmin=width, xmax=0, ymin=height, ymax=0, near=Infinity;
      for (const i of face.indices) {
        const p=projected[i];
        xmin=Math.min(xmin,p.x); xmax=Math.max(xmax,p.x);
        ymin=Math.min(ymin,p.y); ymax=Math.max(ymax,p.y);
        near=Math.min(near,p.depth);
      }
      face.xmin=xmin; face.xmax=xmax; face.ymin=ymin; face.ymax=ymax; face.near=near;
      const right=Math.min(columns-1,Math.floor(xmax/tileSize)), bottom=Math.min(rows-1,Math.floor(ymax/tileSize));
      for (let v=Math.max(0,Math.floor(ymin/tileSize)); v<=bottom; v++) {
        for (let u=Math.max(0,Math.floor(xmin/tileSize)); u<=right; u++) {
          const key=v*columns+u;
          const cell=tiles[key] ||= [];
          cell.push(face);
          if (face.bridgeHardware) (cell.hardware ||= []).push(face);
        }
      }
      if (ctx) {
        ctx.beginPath(); trace(face.indices);
        ctx.fillStyle=face.color; ctx.fill();
        ctx.strokeStyle=face.color; ctx.stroke();
        for (const detail of face.details) {
          ctx.beginPath();
          for (const piece of detail.pieces) trace(piece);
          ctx.fillStyle=detail.color;ctx.fill();
        }
      } else {
        const d=polygonPath(face.indices);
        if (d!==face.d) {face.polygon.setAttribute('d',d);face.d=d;}
        for (const detail of face.details) {
          const marks=detail.pieces.map(polygonPath).join('');
          if (marks!==detail.d) {detail.node.setAttribute('d',marks);detail.d=marks;}
        }
      }
    }
    if (!ctx && (reorder || resumeSvg)) {
      // Changing the angle mostly leaves neighbours in the same order. Keep
      // those nodes connected and insert only the faces that passed a neighbour
      // or have just entered the viewport. Hidden siblings can stay in place.
      let next=null,rank=Infinity;
      for (let i=visible.length-1;i>=0;i--) {
        const face=visible[i];
        if (face.paintRank<0 || face.paintRank>=rank) group.insertBefore(face.node,next);
        else rank=face.paintRank;
        face.paintRank=i;
        next=face.node;
      }
    }
  };
}

function obstacleWeight(feature,team) {
  let weight=0;
  for (const member of team) {
    const [x,y,z]=member.position, [u,lane]=feature.local(x,z);
    if (u<-.47 || u>1.47 || Math.abs(lane)>1.9 || Math.abs(feature.contact(clamp(u,0,1))[1]-y)>3.2) continue;
    weight=Math.max(weight,clamp(Math.min((u+.47)/.45,(1.47-u)/.45),0,1));
  }
  return weight;
}

// Leave space at the edge of the overview for the boots of the rearmost
// walker as well as the summit. Portrait screens usually run out of width first.
function overviewDistance(goal,points,camera) {
  const sinYaw=Math.sin(goal.yaw),cosYaw=Math.cos(goal.yaw);
  const sinPitch=Math.sin(goal.pitch),cosPitch=Math.cos(goal.pitch);
  const halfHeight=Math.tan(camera.fov*Math.PI/360);
  let distance=0;
  for (const point of points) {
    const x=point[0]-goal.x,y=point[1]-goal.y,z=point[2]-goal.z;
    const forward=x*sinYaw+z*cosYaw;
    const depth=forward*cosPitch+y*sinPitch;
    const across=x*cosYaw-z*sinYaw, up=y*cosPitch-forward*sinPitch;
    distance=Math.max(distance,depth+Math.abs(across)/(.91*halfHeight*camera.aspect),
      depth+Math.abs(up)/(.88*halfHeight));
  }
  return distance;
}

// Solve visibility at the party we are framing. During a handoff the orbit pivot
// passes between routes, where a ridge can be much higher than either climber.
function clearSightline(goal,terrain,progress) {
  const angle=clamp((Math.abs(goal.yaw)-.40)/.09,0,1);
  const approach=clamp((.94-progress)/.05,0,1);
  if (!angle || !approach) return;
  const horizontal=goal.distance*Math.cos(goal.pitch), altitude=goal.distance*Math.sin(goal.pitch);
  const dx=horizontal*Math.sin(goal.yaw), dz=horizontal*Math.cos(goal.yaw);
  const foot=goal.y-1.2;
  let clear=altitude;
  for (const along of [.15,.28,.48,.70,1]) {
    const ridge=terrain.surface(goal.x+along*dx,goal.z+along*dz)[1]+.46;
    clear=Math.max(clear,foot-goal.y+(ridge-foot)/along);
  }
  const height=blend(altitude,clear,angle*angle*(3-2*angle)*approach*approach*(3-2*approach));
  goal.pitch=Math.atan2(height,horizontal);
  goal.distance=Math.hypot(height,horizontal);
}

export function createLandscape(svg, cameraState = {}) {
  const groups = {};
  for (const name of ['horizon','mountain','tracks','parties']) {
    groups[name] = svg.querySelector('[data-layer="'+name+'"]') || svg.querySelector('#'+name);
    groups[name].replaceChildren();
  }
  const terrain = createTerrain();
  const sky = mountHorizon(groups.horizon);
  const drawMountain = mountMountain(groups.mountain, terrain.faces);
  const sample = createParties();
  const drawTracks = mountFootprints(groups.tracks,terrain,sample);
  const weather = mountSnow(svg, groups, terrain.summit,terrain.scale);
  const motionPreference = svg.ownerDocument.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)');
  const camera = new PerspectiveCamera(35, 1, .2, 1200);
  const matrix = new Matrix4(), lookAt = new Vector3();
  const rig = cameraState.rig ||= { x:0, y:25, z:4, yaw:0, pitch:.17, distance:120 };
  const velocity = cameraState.velocity ||= { x:0, y:0, z:0, yaw:0, pitch:0, distance:0 };
  let width = 0, height = 0;
  function project(point, result = {}) {
    const [x,y,z] = point, m = matrix.elements;
    const depth = m[3]*x + m[7]*y + m[11]*z + m[15], divisor = Math.max(.01,depth);
    result.x = width/2 * (1 + (m[0]*x + m[4]*y + m[8]*z + m[12])/divisor);
    result.y = height/2 * (1 - (m[1]*x + m[5]*y + m[9]*z + m[13])/divisor);
    result.depth = depth;
    result.scale = height/2 * camera.projectionMatrix.elements[5] / divisor;
    return result;
  }

  return function draw(progress, time, moving, shot, dt, snap = false, secondsPerTeam, footprintClock,
    bounds = svg.getBoundingClientRect()) {
    if (bounds.width < 2 || bounds.height < 2) return;
    if (Math.round(bounds.width) !== width || Math.round(bounds.height) !== height) {
      width = Math.round(bounds.width); height = Math.round(bounds.height);
      svg.setAttribute('viewBox', '0 0 '+width+' '+height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
    const parties = sample(terrain, progress, time, moving, secondsPerTeam);
    const goal = {};
    const amount = (progress.pro + progress.con)/2;
    const target = side => parties.members.find(person => person.side === side).position;
    const a = target('pro'), b = target('con');
    // Orbit around the same world-space pivot so foreground climbers and
    // distant ridges move at different rates.
    const reducedMotion=Boolean(motionPreference?.matches);
    const atmosphereTime=reducedMotion?0:time;
    const orbitTime=reducedMotion?0:(cameraState.cameraTime??time);
    const orbit = Math.sin(orbitTime*.17 - .85), rise = Math.sin(orbitTime*.11 + .3);
    const autoSide=cameraState.autoFollowObstacles;
    if (shot==='wide' && !reducedMotion && terrain.features[autoSide]) {
      const activeTeam=parties.members.filter(member=>member.side===autoSide);
      const pulling=activeTeam.some(member=>member.cooperation?.role==='pull');
      if (pulling || terrain.features[autoSide].some(feature=>obstacleWeight(feature,activeTeam)>.65)) shot=autoSide;
    }
    if (shot === 'wide') {
      const packed = Math.max(0, (amount-.4)/.6);
      goal.x = (a[0]+b[0])*.1;
      goal.y = blend(30*terrain.scale, terrain.summit[1]-8*terrain.scale, packed);
      goal.z = blend(3*terrain.scale,terrain.summit[2],packed*.75);
      goal.yaw = -.015 + .23*orbit;
      goal.pitch = .18 + .032*rise;
      goal.distance = Math.max((123-packed*47)*terrain.scale,
        overviewDistance(goal,[terrain.summit,...parties.members.map(member=>member.position)],camera));
    } else {
      const side = shot, sign = side === 'pro' ? -1 : 1;
      const team = parties.members.filter(p => p.side === side);
      const leader = team[0].position, tail = team[team.length-1].position;
      goal.x = blend(tail[0],leader[0],.57);
      goal.y = blend(tail[1],leader[1],.54) + 2.3;
      goal.z = blend(tail[2],leader[2],.57);
      goal.yaw = sign*(.19 + .20*orbit);
      goal.pitch = .27 + .042*rise;
      goal.distance = Math.max(31, 2.3*(Math.abs(leader[1]-tail[1])+5), 31/camera.aspect);
      // View the bridge across its long axis so the rungs, both anchors and
      // the belayer stay visible together. The ice pitch is framed from below
      // its lip with room for the climber's reaching axe.
      for (const feature of terrain.features[side]) {
        const weight=obstacleWeight(feature,team);
        if (!weight) continue;
        const section=clamp(feature.local(goal.x,goal.z)[0],0,1);
        const center=feature.contact(blend(.5,section,.72)),lower=feature.contact(0),upper=feature.contact(1);
        const bridge=feature.kind==='ladder';
        const dx=upper[0]-lower[0], dz=upper[2]-lower[2];
        const normal=dx>=0?1:-1;
        const yaw=bridge?Math.atan2(-dz*normal,dx*normal):sign*.31;
        goal.x=blend(goal.x,center[0],weight*.48);
        goal.y=blend(goal.y,center[1]+1.75,weight*.55);
        goal.z=blend(goal.z,center[2],weight*.53);
        goal.yaw=blend(goal.yaw,yaw,weight*.79);
        goal.pitch=blend(goal.pitch,bridge?.47:.30,weight*.83);
        goal.distance=Math.max(goal.distance,blend(0,bridge?34:32,weight));
      }
      const helper=team.find(member=>member.cooperation?.role==='pull');
      const partner=team.find(member=>member.cooperation?.role==='reach');
      if (helper && partner) {
        const a=helper.position, b=partner.position, dx=b[0]-a[0], dz=b[2]-a[2];
        const palm=helper.bones['hand'+helper.cooperation.hand]?.origin || helper.bones.torso.origin;
        const otherPalm=partner.bones['hand'+partner.cooperation.hand]?.origin || partner.bones.torso.origin;
        const normal=dx>=0?1:-1;
        goal.x=blend((a[0]+b[0])/2,(palm[0]+otherPalm[0])/2,.42);
        goal.y=blend((a[1]+b[1])/2+1.9,(palm[1]+otherPalm[1])/2,.43);
        goal.z=blend((a[2]+b[2])/2,(palm[2]+otherPalm[2])/2,.42);
        goal.yaw=clamp(Math.atan2(-dz*normal,dx*normal),-.91,.91);
        goal.pitch=.35;
        goal.distance=Math.max(24,25/camera.aspect);
      }
      // Approach the summit from the open side of each trail. A change in
      // which partner is uphill must not send the camera behind the spur.
      const nearSummit=clamp((progress[side]-.89)/.05,0,1);
      const summitOrbit=nearSummit*nearSummit*(3-2*nearSummit);
      goal.yaw=blend(goal.yaw,sign*(.83+.09*orbit),summitOrbit);
      goal.pitch=blend(goal.pitch,.35+.02*rise,summitOrbit);
      clearSightline(goal,terrain,progress[side]);
    }
    const previous={...rig};
    const immediate=snap || reducedMotion || !cameraState.shot;
    if (immediate) {
      Object.assign(rig,goal);
      for (const key of Object.keys(velocity)) velocity[key]=0;
      cameraState.travel = null;
    } else if (shot !== cameraState.shot) {
      const gap = Math.hypot(goal.x-rig.x,goal.y-rig.y,goal.z-rig.z);
      cameraState.travel = { start:previous, target:{...goal}, velocity:{...velocity},
        elapsed:0, duration:2+Math.min(2.5,gap*.023), gap };
    }
    cameraState.shot = shot;
    const travel = cameraState.travel;
    const follow=1-Math.exp(-dt*3.2);
    if (travel) {
      travel.elapsed += dt;
      const t = clamp(travel.elapsed/travel.duration,0,1);
      const ease = t*t*(3-2*t), lift = Math.sin(Math.PI*t)**2;
      // Carry the incoming camera motion through a second press mid-pan.
      const carry=travel.elapsed*Math.exp(-travel.elapsed/.38)*(1-ease);
      for (const key of Object.keys(rig)) {
        travel.target[key]=blend(travel.target[key],goal[key],follow);
        rig[key]=blend(travel.start[key],travel.target[key],ease)+travel.velocity[key]*carry;
      }
      rig.distance += lift*travel.gap*.67;
      rig.pitch += lift*.07;
      if (t === 1) cameraState.travel = null;
    } else {
      for (const key of Object.keys(rig)) rig[key] = blend(rig[key],goal[key],follow);
    }
    if (dt>0 && !immediate) {
      for (const key of Object.keys(rig)) velocity[key]=(rig[key]-previous[key])/dt;
    }
    const pitch=rig.pitch, horizontal=rig.distance*Math.cos(pitch);
    camera.position.set(rig.x+horizontal*Math.sin(rig.yaw),rig.y+rig.distance*Math.sin(pitch),
      rig.z+horizontal*Math.cos(rig.yaw));
    lookAt.set(rig.x,rig.y,rig.z);
    camera.lookAt(lookAt); camera.updateMatrixWorld();
    matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    sky({width,height,yaw:rig.yaw,pitch,focusX:rig.x/terrain.scale,focusY:rig.y/terrain.scale,time:atmosphereTime});
    project.width = width; project.height = height;
    const viewKey=width+'x'+height+'/'+matrix.elements.map(n=>Math.round(n*1e6)).join('/');
    drawMountain(project,rig.yaw,pitch,width,height,viewKey,!immediate);
    drawTracks(project,viewKey,progress,secondsPerTeam,parties.members,footprintClock);
    parties.draw(groups.parties,project,!immediate);
    weather.sample(camera,project,width,height,atmosphereTime,reducedMotion);
    weather.paint(project.terrainDepth);
  };
}
