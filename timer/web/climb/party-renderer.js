import { createClimberModel, kneeSection, posedVertex } from './climber-model.js';
import { bridgeRopePath, visiblePolygonPath } from './surface-occlusion.js';

const SVG = 'http://www.w3.org/2000/svg';
const dot = (a,b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const mix = (a,b,t) => a+(b-a)*t;
const clamp = (n,min,max) => Math.max(min,Math.min(max,n));
const light = [-.70,.64,.32];

function svg(parent,name,attrs = {}) {
  const node = parent.ownerDocument.createElementNS(SVG,name);
  for (const [key,value] of Object.entries(attrs)) node.setAttribute(key,value);
  parent.appendChild(node);
  return node;
}

// Cache rest normals and neighbours. At a flexed knee the fabric's normal
// is calculated from the posed panel before shading.
function preparePart(part) {
  const edges = new Map();
  const weights=part.knee?.weights;
  const faces = part.faces.map((spec,index) => {
    const indices = spec.indices, normal = [0,0,0], neighbours = [];
    for (let i=0; i<indices.length; i++) {
      const a = indices[i], b = indices[(i+1)%indices.length];
      const p = part.vertices[a], q = part.vertices[b];
      normal[0] += (p[1]-q[1])*(p[2]+q[2]);
      normal[1] += (p[2]-q[2])*(p[0]+q[0]);
      normal[2] += (p[0]-q[0])*(p[1]+q[1]);
      const key = a < b ? a+','+b : b+','+a;
      const adjacent = edges.get(key);
      if (adjacent) {
        adjacent.neighbours[adjacent.i] = index;
        neighbours[i] = adjacent.index;
      } else {
        edges.set(key,{ index, i, neighbours });
        neighbours[i] = -1;
      }
    }
    return { ...spec, normal, neighbours, flexible:weights && indices.some(i=>weights[i]>0),front:false, depth:0 };
  });
  return { ...part, faces,weights, points:part.vertices.map(()=>({})), world:[0,0,0] };
}

function lighting(variant) {
  const cache = new Map();
  return (base, illumination, fabric) => {
    // The narrow bevels of the trousers turn gradually into the light. Keep
    // enough tonal steps to read their shape even in the paper-cut palette.
    const steps = fabric ? (variant==='paper'?10:22) : (variant==='paper'?5:14);
    const band = Math.round(clamp((illumination+.55)/1.55,0,1)*steps);
    const key = base+'/'+steps+'/'+band;
    if (cache.has(key)) return cache.get(key);
    const t = band/steps, amount = fabric ? .65+.56*t : variant === 'ink' ? .74+.37*t : .69+.45*t;
    const warm = variant === 'poster' ? [12,5,-2] : variant === 'paper' ? [1,8,8] : [6,5,1];
    const rgb = [1,3,5].map((start,i) => {
      const channel = parseInt(base.slice(start,start+2),16);
      return Math.round(clamp(channel*amount + warm[i]*t,0,255)).toString(16).padStart(2,'0');
    });
    const value = '#'+rgb.join('');
    cache.set(key,value);
    return value;
  };
}

function transformPart(part,bone,project,joint) {
  const w = part.world;
  let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity,far=-Infinity;
  for (let i=0; i<part.vertices.length; i++) {
    posedVertex(part,i,bone,joint,w);
    const point = project(w,part.points[i]);
    part.points[i] = point;
    if (part.knee) {point.wx=w[0];point.wy=w[1];point.wz=w[2];}
    point.coords = null;
    point.hidden = undefined;
    left=Math.min(left,point.x);right=Math.max(right,point.x);
    top=Math.min(top,point.y);bottom=Math.max(bottom,point.y);far=Math.max(far,point.depth);
  }
  part.atBridge=project.bridgeOverlaps?.(left,right,top,bottom,far);
}

function coordinates(point) {
  return point.coords ??= point.x.toFixed(2)+','+point.y.toFixed(2);
}

function behindTerrain(project,x,y,depth,slack=.065) {
  const limit=depth-slack;
  return Boolean(project.terrainDepth && project.terrainDepth(x,y,limit)<limit);
}

// Bisect a projected edge at the terrain silhouette. Depth along the screen
// segment is reciprocal-linear for a perspective camera.
function snowIntersection(a,b,project) {
  let lo=0, hi=1;
  for (let i=0; i<5; i++) {
    const t=(lo+hi)/2, x=mix(a.x,b.x,t), y=mix(a.y,b.y,t);
    const depth=1/mix(1/a.depth,1/b.depth,t);
    if (behindTerrain(project,x,y,depth) === Boolean(a.hidden)) lo=t;
    else hi=t;
  }
  const t=(lo+hi)/2;
  return mix(a.x,b.x,t).toFixed(2)+','+mix(a.y,b.y,t).toFixed(2);
}

function addPart(queue,part,bone,shade,variant,project,owner) {
  const points = part.points;
  // The cofactor transforms normals correctly even on stretched shin/pole bones.
  const nx = cross(bone.y,bone.z), ny = cross(bone.z,bone.x), nz = cross(bone.x,bone.y);
  const handedness = dot(bone.x,nx) < 0 ? -1 : 1;
  for (const face of part.faces) {
    let area = 0, depth = 0, near = Infinity;
    const ids = face.indices;
    for (let i=0; i<ids.length; i++) {
      const a = points[ids[i]], b = points[ids[(i+1)%ids.length]];
      area += (a.x-b.x)*(a.y+b.y);
      depth += a.depth;
      near = Math.min(near,a.depth);
    }
    face.front = area*handedness < 0;
    face.draw = near>1 && (face.front || face.doubleSided) && Math.abs(area)>.035;
    face.depth = depth/ids.length;
  }
  for (const face of part.faces) {
    if (!face.draw) continue;
    // Adjacent front panels share corners. Test each against the mountain only
    // when a visible panel needs it, and leave back-facing panels unformatted.
    const ids=face.indices;
    let obscured=0;
    for (const index of ids) {
      const p=points[index];
      if (p.hidden===undefined) p.hidden=behindTerrain(project,p.x,p.y,p.depth);
      if (p.hidden) obscured++;
    }
    if (obscured===ids.length && !part.atBridge) continue;
    const clipped=obscured>0;
    const [u,v,s] = face.normal;
    let x = nx[0]*u+ny[0]*v+nz[0]*s, y = nx[1]*u+ny[1]*v+nz[1]*s, z = nx[2]*u+ny[2]*v+nz[2]*s;
    if (face.flexible) {
      x=0;y=0;z=0;
      for (let i=0;i<face.indices.length;i++) {
        const a=points[face.indices[i]],b=points[face.indices[(i+1)%face.indices.length]];
        x+=(a.wy-b.wy)*(a.wz+b.wz);y+=(a.wz-b.wz)*(a.wx+b.wx);z+=(a.wx-b.wx)*(a.wy+b.wy);
      }
    }
    const intensity = (x*light[0]+y*light[1]+z*light[2])*handedness*(face.front ? 1 : -1)/(Math.hypot(x,y,z)||1);
    let exact=null;
    if (part.atBridge) {
      const projected=ids.map(index=>points[index]);
      const xs=projected.map(p=>p.x),ys=projected.map(p=>p.y),far=Math.max(...projected.map(p=>p.depth));
      const left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
      if (project.bridgeOverlaps(left,right,top,bottom,far)) {
        // Loft faces can twist. Interpolate depth over their individual
        // triangles when a thin rung or handline crosses the mesh.
        exact=visiblePolygonPath(projected,project,{left,right,top,bottom},far,true);
        if (exact==='') continue;
      }
    }
    let d=exact, outline='';
    if (d===null) {
      d='';
      for (let i=0; i<ids.length; i++) {
        const a = points[ids[i]], b = points[ids[(i+1)%ids.length]];
        if (!a.hidden) d += (d?'L':'M')+coordinates(a);
        if (clipped && a.hidden!==b.hidden) d += (d?'L':'M')+snowIntersection(a,b,project);
        const neighbour = face.neighbours[i];
        const sharedHem=neighbour===-1 && part.weights?.[ids[i]]===1 && part.weights[ids[(i+1)%ids.length]]===1;
        if (!clipped && !sharedHem && variant === 'ink' && (neighbour === -1 || !part.faces[neighbour].front)
            && Math.abs(a.x-b.x)+Math.abs(a.y-b.y)>2.4) outline += 'M'+coordinates(a)+'L'+coordinates(b);
      }
      if (!d) continue;
      d+='Z';
    }
    queue.push({ depth:face.depth, d, clipped:exact!==null, color:shade(face.color,intensity,part.knee),
      bone:part.bone, name:part.name || part.bone, outline, location:bone.location, owner:bone.location && owner });
  }
}

function groundHeight(terrain,x,z,fallback) {
  return terrain?.surface ? terrain.surface(x,z)[1] : fallback;
}

function addRope(queue,a,b,member,project,terrain,variant) {
  const side = member.side;
  const color = side==='pro' ? (variant==='ink'?'#976449':'#ba6843') : (variant==='ink'?'#4f707a':'#43829a');
  // Split the catenary into short pieces so a nearer shoulder or backpack
  // can hide just the section of rope passing behind it.
  function ropePoint(point) {
    const p = project(point);
    p.hidden = behindTerrain(project,p.x,p.y,p.depth);
    p.coords = p.x.toFixed(2)+','+p.y.toFixed(2);
    return p;
  }
  let from = ropePoint(a);
  const sag = Math.min(.95,.27+Math.hypot(a[0]-b[0],a[2]-b[2])*.10)*(1-.84*(member.ropeTension||0));
  for (let i=1; i<=8; i++) {
    const t = i/8, x = mix(a[0],b[0],t), z = mix(a[2],b[2],t);
    let y = mix(a[1],b[1],t) - 4*t*(1-t)*sag;
    if (i<8) y = Math.max(y,groundHeight(terrain,x,z,y-.2)+.06);
    const to = ropePoint([x,y,z]);
    if (from.depth>1 && to.depth>1) {
      const exact=bridgeRopePath(from,to,project);
      let d=exact;
      if (d===null && !(from.hidden && to.hidden)) {
        const cut=from.hidden!==to.hidden ? snowIntersection(from,to,project) : '';
        d='M'+(from.hidden?cut:from.coords)+'L'+(to.hidden?cut:to.coords);
      }
      if (d) queue.push({ depth:(from.depth+to.depth)/2, bone:'rope', name:'rope', color,
        width:clamp((from.scale+to.scale)*.032,.5,3.6), d, linecap:exact===null?undefined:'butt' });
    }
    from = to;
  }
}

export function createPartyRenderer() {
  let art;
  function mount(parent,members,variant) {
    parent.replaceChildren();
    const shadows = svg(parent,'g',{fill:variant==='paper'?'#274556':'#343742', opacity:variant==='ink'?'.17':'.20'});
    return { parent, variant, shade:lighting(variant), shadows:members.map(()=>svg(shadows,'path')),
      people:members.map(member=>createClimberModel(member.person,variant).map(preparePart)),
      layer:svg(parent,'g',{'stroke-linejoin':'round','stroke-linecap':'round'}), slots:[] };
  }
  return function render(parent,project,members,variant,terrain) {
    if (!art || art.parent!==parent || art.variant!==variant) art = mount(parent,members,variant);
    const queue = [];
    for (let i=0; i<members.length; i++) {
      const member = members[i], shadow = member.groundShadow || [];
      if (member.rank>0) {
        const a=members[i-1].harness,b=member.harness,guide=member.ropeGuide;
        if (guide) addRope(queue,a,guide,member,project,terrain,variant);
        addRope(queue,guide||a,b,member,project,terrain,variant);
      }
      const center=project(member.position), margin=center.scale*6;
      if (center.depth<1 || (project.width && (center.x < -margin || center.y < -margin ||
          center.x > project.width+margin || center.y > project.height+margin))) {
        art.shadows[i].removeAttribute('d');
        continue;
      }
      const cloud = shadow.map(p=>project(p));
      const shadowVisible=cloud.length && cloud.every(p=>p.depth>1) &&
        cloud.some(p=>!behindTerrain(project,p.x,p.y,p.depth,.15));
      art.shadows[i].setAttribute('d',shadowVisible ?
        'M'+cloud.map(p=>p.x.toFixed(1)+','+p.y.toFixed(1)).join('L')+'Z' : '');
      const knees=[0,1].map(leg=>kneeSection(member.bones['thigh'+leg],member.bones['shin'+leg]));
      for (const part of art.people[i]) {
        const bone = member.bones[part.bone] || member.carriedTools?.[part.bone];
        if (!bone) continue;
        transformPart(part,bone,project,part.knee && knees[part.knee.leg]);
        addPart(queue,part,bone,art.shade,variant,project,member.side+'-'+member.rank);
      }
    }
    queue.sort((a,b)=>b.depth-a.depth);
    let count=0;
    function attr(slot,key,value) {
      if (slot[key]===value) return;
      if (value===undefined) slot.node.removeAttribute(key);
      else slot.node.setAttribute(key,value);
      slot[key]=value;
    }
    function emit(face,d,fill,stroke,width) {
      let slot = art.slots[count++];
      if (!slot) {
        slot = { node:svg(art.layer,'path') };
        art.slots.push(slot);
      }
      slot.node.setAttribute('d',d);
      attr(slot,'fill',fill); attr(slot,'stroke',stroke); attr(slot,'stroke-width',width);
      attr(slot,'stroke-linecap',face.linecap);
      attr(slot,'data-part',face.bone); attr(slot,'data-mesh',face.name);
      attr(slot,'data-tool-location',face.location); attr(slot,'data-tool-owner',face.owner);
    }
    for (const face of queue) {
      if (face.bone==='rope') {
        emit(face,face.d,'none',face.color,face.width.toFixed(2));
      } else {
        emit(face,face.d,face.color,face.clipped?'none':face.color,face.clipped?undefined:'.32');
        if (face.outline) emit(face,face.outline,'none','#3c4038','.53');
      }
    }
    for (let i=count; i<(art.active||0); i++) art.slots[i].node.removeAttribute('d');
    art.active=count;
  };
}
