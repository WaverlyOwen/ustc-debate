import { drawIceShoulders, drawRockBeds, drawSnowBanks, drawTalus } from './mountain-detail.js';

import { addOutcrops } from './outcrops.js';

// One surveyed ridge, two ascents, and three ways to draw the same relief.
// World coordinates are east, up, and toward the viewer.
const mountain = {
    seed: 17, summitX: -1, light: [-0.86, 0.55, 0.35],
    ridge: [
      [-84, 4], [-75, 11], [-68, 13], [-64, 20], [-58, 17], [-52, 25],
      [-47, 24], [-41, 31], [-37, 29], [-32, 36], [-28, 34], [-23, 41],
      [-18, 40], [-14, 47], [-11, 48], [-7, 56], [-5.5, 58], [-3.7, 63], [-2.85, 62.45],
      [-1, 63], [.55, 61.8], [1.7, 63], [4, 57], [7, 55], [13, 46], [18, 47], [23, 40],
      [29, 38], [33, 32], [39, 34], [46, 27], [51, 29], [59, 21],
      [64, 23], [71, 14], [77, 12], [84, 4],
    ],
    // Each spur is a crest position, a toe position, half-width and relief.
    spurs: [[-46,-54,9,6], [-24,-34,9,8], [-7,-20,8,10], [0,6,12,14], [18,35,10,8], [40,55,10,7]],
    trails: [
      [[-46,29],[-43,24],[-36,24],[-38,19],[-30,17],[-27,15],[-28,11],[-19,10],[-20,5],[-12,5],[-11,1],[-7,-1]],
      [[49,29],[44,26],[45,22],[36,20],[38,16],[31,15],[27,12],[28,9],[18,8],[19,4],[11,4],[9,0]],
    ],
};

const editions = {
  poster: {
    snow: ['#757f9f','#9eafc2','#e7d1ce','#ffdeb1','#fff3cb'],
    rock: ['#34334f','#514861','#827077','#bb8969','#e7ac6e','#ffd68c'],
  },
  ink: {
    snow: ['#9a9994','#bbbab0','#d9d6c7','#eee9d6','#f9f4e2'],
    rock: ['#585959','#777974','#92938a','#b5b3a6','#d4ceba'],
  },
  paper: {
    snow: ['#5a799a','#83a4b5','#a8c7c7','#d0e4d9','#f2eed6'],
    rock: ['#303b62','#435779','#526f89','#688e9c','#89afa9','#a6c5b6'],
  },
};

const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
// The original ridge survey and its drawings share these map units.
// Clothing, climbing equipment and lateral contact offsets use world units.
const worldPerMapUnit = 2;
// A wind slab rolls off the crown in two slopes before reaching its cut lip.
const shoulderSlope=.48, lipSlope=.72, shoulderWidth=.73, lipWidth=.39;
function shapeSnow(p) {
  p[7]=p[3]-shoulderWidth*p[6];
  p[8]=p[3]-lipWidth*p[6];
}
function snowHeight(depth,cover) {
  if (cover< -1e-10 || depth<=0) return 0;
  return depth+shoulderSlope*Math.min(0,cover-shoulderWidth*depth)+lipSlope*Math.min(0,cover-lipWidth*depth);
}
const mix = (a, b, t) => a + (b - a) * t;
const bell = n => Math.exp(-n * n);
const fract = n => n - Math.floor(n);
const hash = (a, b, seed) => fract(Math.sin(a * 127.1 + b * 311.7 + seed * 74.7) * 43758.5453);

function noise(x, z, seed) {
  const i = Math.floor(x), j = Math.floor(z);
  const u = fract(x), v = fract(z);
  const a = u * u * (3 - 2 * u), b = v * v * (3 - 2 * v);
  return mix(mix(hash(i,j,seed), hash(i+1,j,seed), a),
             mix(hash(i,j+1,seed), hash(i+1,j+1,seed), a), b);
}

function profile(x, knots) {
  if (x <= knots[0][0]) return knots[0][1];
  for (let i = 1; i < knots.length; i++) {
    const [right, h] = knots[i];
    if (x <= right) {
      const [left, l] = knots[i - 1];
      return mix(l, h, (x - left) / (right - left));
    }
  }
  return knots[knots.length - 1][1];
}

function palette(colors) {
  const rgb = colors.map(hex => [1,3,5].map(i => parseInt(hex.slice(i, i+2), 16)));
  return amount => {
    const p = clamp(amount) * (rgb.length - 1);
    const a = Math.min(rgb.length-2, Math.floor(p));
    return '#' + rgb[a].map((v,i) => Math.round(mix(v,rgb[a+1][i],p-a)).toString(16).padStart(2,'0')).join('');
  };
}

function tint(first, second, t) {
  return '#' + [1,3,5].map(i => {
    const a = parseInt(first.slice(i,i+2),16), b = parseInt(second.slice(i,i+2),16);
    return Math.round(mix(a,b,t)).toString(16).padStart(2,'0');
  }).join('');
}

// Clip a convex patch against a scalar field interpolated at its vertices.
function clip(poly, field, level, above) {
  const out = [];
  let a = poly[poly.length-1];
  for (const b of poly) {
    const aInside = above ? a[field] >= level : a[field] <= level;
    const bInside = above ? b[field] >= level : b[field] <= level;
    if (aInside !== bInside && a[field] !== level && b[field] !== level) {
      const t = (level - a[field]) / (b[field] - a[field]);
      out.push(a.map((v,i) => mix(v,b[i],t)));
    }
    if (bInside) out.push(b);
    a = b;
  }
  return out;
}

// The drawing lives in mountain coordinates. A whole seam or pen stroke can
// cross several facets without changing direction at their boundaries.
function drawing(style) {
  const cells = new Map();
  const key = (i,j) => (i+24)*64+j+12;
  function mark(points, material, pigment) {
    const xs=points.map(v=>v[0]), zs=points.map(v=>v[1]);
    const bounds=[Math.min(...xs),Math.max(...xs),Math.min(...zs),Math.max(...zs)];
    const item={points,material,pigment,bounds};
    for (let i=Math.floor(bounds[0]/10); i<=Math.floor(bounds[1]/10); i++) {
      for (let j=Math.floor(bounds[2]/10); j<=Math.floor(bounds[3]/10); j++) {
        const k=key(i,j);
        if (!cells.has(k)) cells.set(k,[]);
        cells.get(k).push(item);
      }
    }
  }
  function blade(x,z,dx,dz,w,bend,material,pigment) {
    const len=Math.hypot(dx,dz), nx=-dz/len, nz=dx/len;
    const p=(t,h) => [x+t*dx+h*nx,z+t*dz+h*nz];
    mark([p(0,0),p(.38,bend+w*.55),p(.69,bend*.62+w*.25),p(1,0),
          p(.62,bend*.75-w*.32),p(.32,bend*.81-w*.51)],material,pigment);
  }
  function seam(path,material,pigment) {
    for (let i=1; i<path.length; i++) {
      const [x,z,w]=path[i-1], [xx,zz,ww]=path[i];
      mark([[x-w,z],[x+w,z],[xx+ww,zz],[xx-ww,zz]],material,pigment);
    }
  }
  const ink=style==='ink', paper=style==='paper';
  drawSnowBanks(style,mark,blade);
  // Snow in branching couloirs runs lengthwise down the stratified wall.
  for (const [x,z,len,drift] of [[-46,-5,21,-8],[-29,-7,28,-8],[-10,-5,33,-8],
    [-1,-4,15,-4],[10,-7,28,9],[25,-3,26,8],[42,-2,23,10],[57,-2,19,6]]) {
    const p=(t,off,w)=>[x+drift*t+off,z+len*t,w];
    seam([p(0,0,.6),p(.22,1.1,.57),p(.37,-.55,.42),p(.56,.7,.84),
      p(.71,-.4,.53),p(.83,-.2,.28),p(1,-1.2,.016)],'rock','vein');
    seam([p(.22,-2.9,.06),p(.36,-1.9,.23),p(.56,.7,.47)],'rock','vein');
    if (paper) seam([p(.04,.7,.26),p(.22,1.65,.23),p(.37,-.27,.12),p(.55,1.09,.05)],'rock','lip');
  }
  // Winds curl over the buttresses and carve small, crescent-shaped sastrugi
  // into the softer snow below. Their broken lee edges follow each snowfield.
  for (const [x,z,dx,dz] of [[-55,14,4,-2],[-40,5,3.2,-2.1],[-29,17,4.2,-1.5],
    [-20,1,3.7,-2.6],[-15,24,4.1,-1.5],[-9,-3,2.8,-1.8],[7,3,4.4,1.7],
    [16,17,4.1,2.3],[31,9,3.8,1.2],[41,23,4.4,1],[54,10,3.5,1.6],[12,39,5.2,-.9]]) {
    const ridges=3+Math.floor(hash(x,z,63)*3);
    for (let i=0;i<ridges;i++) {
      const sx=x+i*.55+hash(x,i,82)*.76, sz=z+i*1.14;
      const length=.58+.66*hash(i,z,32), width=.10+.13*hash(x+i,z,73);
      const bend=(i%3===1?-.61:-.35)*length;
      blade(sx,sz,dx*length,dz*length,width*(ink?.61:paper?1.48:1),bend,'snow','rime');
      if (i%2===0 && !ink) blade(sx+.15,sz-.15,dx*length*.85,dz*length*.83,width*.82,bend,'snow','spark');
    }
  }
  for (let i=-11; i<=10; i++) for (let j=-2; j<=6; j++) {
    const rnd=k=>hash(i*29+k,j*13-k,61);
    const x=(i+rnd(0))*8, z=(j+rnd(1))*8;
    const dip=(noise(x*.06,z*.05,86)-.48)*1.9;
    const pocket = noise(x*.075,z*.071,11);
    if (paper) {
      if (pocket>.46) blade(x,z,1.1+dip,2+rnd(2)*3,.36+rnd(3)*.34,-.45,'rock','cut');
      if (pocket>.72) blade(x+.31,z+.07,.9+dip,2+rnd(2)*2.8,.13,-.37,'rock','lip');
      continue;
    }
    if (ink) {
      const count=2+Math.floor(pocket*8);
      const dx=1.6+2.2*rnd(2), dz=2+4.2*rnd(3);
      const step=.34+.24*rnd(4);
      for (let n=0; n<count; n++) {
        const t=(n+.5)/count;
        const len=(.3+.75*Math.sin(Math.PI*t))*(.7+.35*rnd(n+5));
        blade(x+n*step,z-n*step*.31,dx*len+dip,dz*len,.05+rnd(n+17)*.08,.1+dip*.20,'rock','pen');
      }
      if (pocket>.54) {
        for (let n=0; n<3; n++) blade(x+.3*n,z+.4*n,1.7+rnd(n+31),-1.1,.06,.09,'rock','pen');
      }
      if (pocket>.63) {
        for (let n=0; n<4; n++) blade(x+.4*n,z-.13*n,1.4,.9+rnd(n+20),.05,.17,'snow','pencil');
      }
    } else {
      const count=1+Math.floor(rnd(4)*4);
      for (let n=0; n<count; n++) {
        const sx=x+(rnd(5+n)-.5)*2.7, sz=z+(rnd(n+11)-.5)*3.1;
        const len=.85+2.9*rnd(n+14);
        blade(sx,sz,len*(dip+.32),len,.15+.27*rnd(19+n),dip*.4,'rock',n%3?'cut':'ore');
      }
      if (pocket>.42) blade(x+.7,z,1+dip,3+rnd(2)*2,.17,.28,'snow','pencil');
    }
    if (pocket>.47) {
      // Bedding appears in short, locally parallel runs beneath a broken lip.
      const len=2.4+rnd(42)*4.8;
      blade(x,z,len,.18+dip*1.6,.12+rnd(43)*.19,-.25,'rock',ink?'fault':'ore');
      if (pocket>.62) blade(x+.25,z+.3,len*.61,dip+.23,.11,-.12,'rock','cut');
    }
    if (z>12 && pocket>.30) {
      for (let n=0; n<5; n++) {
        const sx=x+(rnd(50+n)-.5)*4.1, sz=z+(rnd(57+n)-.5)*3.3;
        const w=.16+.5*rnd(65+n);
        mark([[sx-w,sz+w*.3],[sx-.12*w,sz-w],[sx+w,sz+w*.36],[sx+.14*w,sz+w*.63]],'both','stone');
        if (w>.40) mark([[sx-w,sz+w*.3],[sx-.12*w,sz-w],[sx+w*.17,sz+.02*w]],'both','ore');
      }
    }
  }
  // Long irregular joints and pale adjacent flakes define individual cliffs.
  for (const [x,z,toe,run] of [[-62,-4,-69,19],[-43,-4,-45,29],[-28,-7,-38,39],
    [-11,-7,-17,32],[3,-4,13,40],[17,-3,27,32],[35,-3,48,29],[54,-2,63,21]]) {
    const width=ink?.11:paper?.34:.21;
    const path=[[x,z,.01],[x+.9,z+run*.18,width],[x-1.3,z+run*.31,width*.6],
      [mix(x,toe,.53),z+run*.51,width],[mix(x,toe,.75)-.7,z+run*.65,width*.55],[toe,z+run,.01]];
    seam(path,'rock',ink?'fault':'cut');
    if (paper) seam(path.map(([sx,sz,w])=>[sx+w+.2,sz,w*.52]),'rock','lip');
  }
  return (minX,maxX,minZ,maxZ) => {
    const found=new Set();
    for (let i=Math.floor(minX/10); i<=Math.floor(maxX/10); i++) {
      for (let j=Math.floor(minZ/10); j<=Math.floor(maxZ/10); j++) {
        for (const m of cells.get(key(i,j)) || []) {
          const b=m.bounds;
          if (b[0]<maxX && b[1]>minX && b[2]<maxZ && b[3]>minZ) found.add(m);
        }
      }
    }
    return found;
  };
}

// Clip a drawn shape to its owning bedrock or snow patch in plan view. Then
// the renderer can paint it immediately after that surface in depth order.
function fitMark(points,poly,lift) {
  let drawing=points;
  for (let i=0; i<poly.length && drawing.length; i++) {
    const a=poly[i], b=poly[(i+1)%poly.length];
    const dx=b[0]-a[0], dz=b[2]-a[2];
    const side=p=>(p[0]-a[0])*dz-(p[1]-a[2])*dx;
    const out=[];
    let prev=drawing[drawing.length-1], last=side(prev);
    for (const p of drawing) {
      const value=side(p);
      if ((last>=0)!==(value>=0)) {
        const t=last/(last-value);
        out.push([mix(prev[0],p[0],t),mix(prev[1],p[1],t)]);
      }
      if (value>=0) out.push(p);
      prev=p; last=value;
    }
    drawing=out;
  }
  return drawing.length>2 ? drawing.map(p=>lift(p[0],p[1])) : [];
}

// At a cap's lip, two solids can have different heights at the same x/z.
// Put a clipped mark on the plane of its owner, including its boundary.
function facePlane(poly) {
  const a=poly[0];
  let area=0,sx=0,sz=0;
  for (let i=2;i<poly.length;i++) {
    const b=poly[i-1],c=poly[i],bx=b[0]-a[0],bz=b[2]-a[2],cx=c[0]-a[0],cz=c[2]-a[2];
    const det=bx*cz-cx*bz;
    if (Math.abs(det)<=Math.abs(area)) continue;
    area=det;sx=((b[1]-a[1])*cz-(c[1]-a[1])*bz)/det;
    sz=(bx*(c[1]-a[1])-cx*(b[1]-a[1]))/det;
  }
  return (x,z)=>[x,a[1]+sx*(x-a[0])+sz*(z-a[2]),z];
}

export function createTerrain(style = 'poster') {
  const edition = editions[style] || editions.poster;
  const ink = edition === editions.ink, paper = edition === editions.paper;
  const {ridge, seed, summitX, light: sun} = mountain;
  const snowColor = palette(edition.snow), rockColor = palette(edition.rock);
  const marksFor = drawing(style);
  const crest = x => -9 + clamp((Math.abs(x-summitX)-3)/6) *
    (3.2*Math.sin((x-summitX)*.088) + 1.7*Math.sin((x-summitX)*.18)) +
    1.32*bell((x-summitX)/1.5) - .62*bell((x-.8)/1.3);
  const front = x => 46 + 3.3*Math.sin(x*0.091 + seed) + 2.1*Math.cos(x*0.19);
  const back = x => -43 + 3*Math.sin(x*0.086 + seed);

  function height(x, z) {
    const divide = crest(x);
    const top = profile(x, ridge);
    const facing = z >= divide;
    const t = clamp((z-divide) / ((facing ? front(x) : back(x))-divide));
    const fringe = 1.0 + 1.9*noise(x*0.1,z*0.1,seed);
    const envelope = 4*t*(1-t);
    if (!facing) {
      return mix(top, fringe, t) + envelope*(2.3*Math.sin(0.24*x+t*4) + 2*noise(x*.14,z*.14,seed));
    }
    if (Math.abs(x-summitX) <= 3 && z <= -6.8) return top;
    let relief = 0;
    for (const [start, toe, width, uplift] of mountain.spurs) {
      const axis = mix(start,toe,t) + 1.7*Math.sin(Math.PI*t*2 + start*.3)*Math.sin(Math.PI*t);
      const halfWidth = width * (0.54 + 0.72*t);
      const across = (x-axis)/halfWidth;
      // A narrow divide breaks more steeply on its lee (east) face.
      relief += uplift * Math.max(0, 1 - Math.abs(across * (across > 0 ? 1.20 : .81)));
    }
    const slab = 0.48*Math.sin(z*.69 + x*.055 + 1.1*Math.sin(x*.11)) +
      0.7*Math.sin(x*.66-z*.24) + 2.2*(noise(x*.20,z*.22,seed)-.5);
    return mix(fringe, top, Math.pow(1-t,1.11)) + envelope*(relief + slab);
  }

  function vertex(x,z) {
    const y = height(x,z);
    const dx = (height(x+1.6,z)-height(x-1.6,z))/3.2;
    const dz = (height(x,z+1.6)-height(x,z-1.6))/3.2;
    const len = Math.hypot(dx,1,dz);
    const n = noise(x*.12,z*.12,seed);
    const drift = noise(x*.048,z*.055,seed+1);
    // Outcrops follow folded geological bedding through several mesh cells.
    const bed = y - .105*x + 2.3*Math.sin(x*.095+z*.055) + .9*Math.sin(x*.23-z*.12);
    const outcrop = .5 + .5*Math.cos(bed*.67 + drift*1.7);
    const t = clamp((z-crest(x))/(front(x)-crest(x)));
    const gully1 = summitX-6 - 12*t + 1.7*Math.sin(t*7);
    const gully2 = summitX+8 + 13*t + 1.4*Math.sin(t*5);
    const couloirs = bell((x-gully1)/2.7) + .8*bell((x-gully2)/2.5);
    const cornice = bell((z-crest(x))/1.7)*clamp((y-32)/15);
    const snow = (y-22)*.034 + (1/len-.67)*3.8 + .50*(drift-.5) +
      .55*(n-.5) - .54*outcrop + .3*clamp((y-49)/11) + .75*couloirs + .46*cornice;
    const light = (-dx*sun[0] + sun[1] - dz*sun[2])/len;
    return [x,y,z,snow,bed,light];
  }

  const xColumns = [];
  ridge.forEach(([x],i) => {
    if (i && x-ridge[i-1][0] >= 7) xColumns.push((ridge[i-1][0]+x)/2);
    xColumns.push(x);
  });
  const rearRows = 3, frontRows = 15;
  const rows = rearRows + frontRows;
  const grid = xColumns.map((column,c) => Array.from({length: rows+1}, (_,r) => {
    const atEdge = c === 0 || c === xColumns.length-1;
    const onRidge = r === rearRows;
    const width = atEdge ? 0 : Math.min(column-xColumns[c-1], xColumns[c+1]-column);
    const onPlateau = r === rearRows+1 && Math.abs(column-summitX) <= 3;
    const x = column + (onRidge || onPlateau ? 0 : (hash(c,r,seed)-.5)*width*.53);
    const toFront = r >= rearRows;
    const distance = Math.abs(r-rearRows);
    const count = toFront ? frontRows : rearRows;
    const jitter = distance === 0 || distance === count ? 0 : (hash(c+17,r,seed)-.5)*.57;
    const t = (distance+jitter)/count;
    return vertex(x, onPlateau ? -7 : mix(crest(x), toFront ? front(x) : back(x), t));
  }));

  // Sampling uses the exact plane of each rendered triangle. Small bins keep
  // each route query local even while a camera follows both parties.
  const bins = new Map(), verticalSections = new Map();
  const binSize = 8, key = (i,j) => (i+32)*64 + j+16;
  const faces = [], survey=[];
  function triangle(a,b,c,index,forefield=false) {
    const tri = [a,b,c];
    const minX=Math.min(a[0],b[0],c[0]), maxX=Math.max(a[0],b[0],c[0]);
    const minZ=Math.min(a[2],b[2],c[2]), maxZ=Math.max(a[2],b[2],c[2]);
    survey.push({tri,index,forefield,minX,maxX,minZ,maxZ});
    if (!forefield) {
      for (let i=Math.floor(minX/binSize); i<=Math.floor(maxX/binSize); i++) {
        if (!verticalSections.has(i)) verticalSections.set(i,[]);
        verticalSections.get(i).push(tri);
        for (let j=Math.floor(minZ/binSize); j<=Math.floor(maxZ/binSize); j++) {
          const address=key(i,j);
          if (!bins.has(address)) bins.set(address,[]);
          bins.get(address).push(tri);
        }
      }
    }
  }
  function drawTriangle({tri,index,forefield,minX,maxX,minZ,maxZ}) {
    const [a,b,c]=tri;
    const x=(a[0]+b[0]+c[0])/3, z=(a[2]+b[2]+c[2])/3;
    const ux=b[0]-a[0], uy=b[1]-a[1], uz=b[2]-a[2];
    const vx=c[0]-a[0], vy=c[1]-a[1], vz=c[2]-a[2];
    const nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx;
    const sign = ny < 0 ? -1 : 1;
    const light = sign*(nx*sun[0]+ny*sun[1]+nz*sun[2])/Math.hypot(nx,ny,nz);
    const broadLight = (a[5]+b[5]+c[5])/3;
    const scatter = hash(index,1,seed);
    const variation=.05*(scatter-.5)+.12*(noise(x*.08,z*.08,seed)-.5);
    let exposure=clamp(.29+.69*(light*.55+broadLight*.45)+variation);
    if (paper) {
      const broad=clamp(.23+.76*(light*.18+broadLight*.82));
      exposure=Math.round(broad*7)/7;
    }
    if (forefield) exposure=clamp(.32+.42*broadLight+.35*(noise(x*.051,z*.07,77)-.5));
    const snow=clip(tri,3,0,true), rock=clip(tri,3,0,false);
    const tonalSnow=clamp(exposure+.11);
    const snowBase=snowColor(tonalSnow), rockBase=rockColor(exposure);
    const marks=z<72 && z>crest(x)-8 ? marksFor(minX,maxX,minZ,maxZ) : [];
    const bedHeight=(xx,zz)=>a[1]-(nx*(xx-a[0])+nz*(zz-a[2]))/ny;
    function paint(poly,material,base,thickness,shoulder=false) {
      if (poly.length<3) return;
      const [origin]=poly;
      if (!poly.slice(2).some((p,i)=>Math.abs((poly[i+1][0]-origin[0])*(p[2]-origin[2])-
          (poly[i+1][2]-origin[2])*(p[0]-origin[0]))>1e-9)) return;
      const face={points:poly.map(p=>p.slice(0,3)),color:base,material};
      if (shoulder) face.snowShoulder=true;
      const details=[];
      const lift=(xx,zz)=>[xx,bedHeight(xx,zz),zz];
      const pigments={
        pen:tint(base,'#373c3d',.72), fault:tint(base,ink?'#292e31':'#394050',.86),
        cut:tint(base,paper?'#243b61':ink?'#44494a':'#4f4058',paper?.48:.53),
        ore:tint(base,ink?'#e4ddc7':paper?'#c3daca':'#ffdc9b',.58),
        pencil:tint(base,ink?'#6d7474':paper?'#6f9da9':'#a099b0',ink?.59:.47),
        vein:snowColor(clamp(tonalSnow-.13)), lip:paper?'#bfdccd':snowColor(tonalSnow),
        stone:tint(base,ink?'#484b49':'#46435a',.64),
        rime:tint(base,ink?'#767e77':paper?'#6c99aa':'#899eb0',ink?.59:.43),
        spark:tint(base,paper?'#f4f3dc':'#fff3d9',.79),
      };
      if (material==='rock' && !forefield && z>crest(x)-4) drawRockBeds(poly,style,pigments,clip,details);
      if (material==='snow' && rock.length && !forefield && z>crest(x)-2 && Math.abs(x)<58 && scatter<.19) {
        drawTalus(poly,index,hash,(outline,pigment)=>{
          const points=fitMark(outline,poly,lift);
          if (points.length) details.push({points,color:pigments[pigment]});
        });
      }
      if (paper && material==='rock' && snow.length && z>crest(x) && broadLight>-.15) {
        const bevel=clip(rock,3,-.13,true);
        if (bevel.length>2) details.push({points:bevel.map(p=>p.slice(0,3)),color:tint(rockBase,snowBase,.59)});
      }
      for (const mark of marks) {
        if (mark.material!=='both' && mark.material!==material) continue;
        const points=fitMark(mark.points,poly,lift);
        if (points.length) details.push({points,color:pigments[mark.pigment]});
      }
      if (thickness) {
        // The roof and shoulder each have their own plane. Lift the drawing by
        // exactly the same affine field as the snow that carries it.
        const ha=thickness(a), hb=thickness(b)-ha, hc=thickness(c)-ha;
        const sx=(uz*hc-vz*hb)/ny, sz=(vx*hb-ux*hc)/ny;
        for (const p of face.points) p[1]+=ha+sx*(p[0]-a[0])+sz*(p[2]-a[2]);
        for (const detail of details) for (const p of detail.points) p[1]+=ha+sx*(p[0]-a[0])+sz*(p[2]-a[2]);
        const gx=-nx/ny+sx,gz=-nz/ny+sz;
        const lit=(-gx*sun[0]+sun[1]-gz*sun[2])/Math.hypot(gx,1,gz);
        face.color=snowColor(clamp(tonalSnow+.38*(lit-light)));
      }
      if (details.length) face.details=details;
      faces.push(face);
    }
    paint(rock,'rock',rockBase);
    if (forefield || !snow.some(p=>p[6]>1e-8)) {
      paint(snow,'snow',snowBase);
      return;
    }
    const raised=clip(snow,6,0,true);
    paint(clip(snow,6,0,false),'snow',snowBase);
    const roll=clip(raised,7,0,false);
    const shoulder=p=>p[6]+shoulderSlope*p[7], lip=p=>shoulder(p)+lipSlope*p[8];
    paint(clip(raised,7,0,true),'snow',snowBase,p=>p[6]);
    paint(clip(roll,8,0,true),'snow',snowBase,shoulder,true);
    paint(clip(roll,8,0,false),'snow',snowBase,lip,true);
    // At the snowline the wind-rounded shoulder breaks to a shaded firn face.
    // Both thickness and lip width run continuously across survey triangles.
    for (let i=0;i<raised.length;i++) {
      const p=raised[i],q=raised[(i+1)%raised.length];
      if (Math.abs(p[3])>1e-7 || Math.abs(q[3])>1e-7) continue;
      const dx=q[0]-p[0],dz=q[2]-p[2],len=Math.hypot(dx,dz);
      if (len<1e-6) continue;
      const sideLight=(-sun[0]*dz+sun[2]*dx)/len;
      const base=p=>p.slice(0,3), rim=p=>[p[0],p[1]+lip(p),p[2]];
      const shade=snowColor(clamp(.24+.23*sideLight+.28*tonalSnow));
      faces.push({points:[base(p),base(q),rim(q),rim(p)],material:'firn',
        color:tint(shade,ink?'#616761':paper?'#385e77':'#685e78',.16)});
    }
  }

  for (let c=0; c<grid.length-1; c++) for (let r=0; r<rows; r++) {
    const a=grid[c][r], b=grid[c+1][r], d=grid[c][r+1], e=grid[c+1][r+1];
    const index=2*(c*rows+r);
    // Use the diagonal with the shorter vertical step to preserve ledges.
    if (Math.abs(a[1]-e[1]) < Math.abs(b[1]-d[1])) {
      triangle(a,e,b,index);
      triangle(a,d,e,index+1);
    } else {
      triangle(a,d,b,index);
      triangle(b,d,e,index+1);
    }
  }

  // Continue the foot of the mountain into a debris-covered glacial forefield.
  // The first row is shared with the mountain and the moraine widens downhill.
  let previous=grid.map(column=>column[rows]);
  const toe=previous;
  for (const [band,station] of [59,76,103,146,200,260].entries()) {
    const row=toe.map((p,c)=>{
      const t=(station-p[2])/(260-p[2]);
      const x=p[0]*(1+.7*t)+(c===0||c===toe.length-1?0:1.4*Math.sin(c*2.7+band));
      const z=station+(station===260?0:2.0*Math.sin(c*.62+band*.9));
      const d=z-p[2];
      const vein=(x-8*Math.sin(z*.053)-.12*z)/11;
      const moraine=2.7*bell((Math.abs(vein)-1.4)/.50)-1.3*bell(vein/1.2);
      const cold=noise(x*.075,z*.059,7);
      const height=p[1]-.075*d+Math.min(1,d/16)*(moraine+3.3*(cold-.5));
      const snowAmount=1.8*(cold-.51)+.48*bell(vein)-.42*bell((Math.abs(vein)-1.4)/.65);
      return [x,height,z,snowAmount,height,.55+.62*(noise(x*.06,z*.07,19)-.5)];
    });
    for (let i=1; i<row.length; i++) {
      triangle(previous[i-1],row[i],previous[i],i*31+band,true);
      triangle(previous[i-1],row[i-1],row[i],i*31+band+1,true);
    }
    previous=row;
  }

  function surface(x,z,snowpack=false) {
    const candidates = bins.get(key(Math.floor(x/binSize),Math.floor(z/binSize))) || [];
    for (const tri of candidates) {
      const [a,b,c]=tri;
      const det = (b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);
      const u = ((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/det;
      const v = ((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/det;
      if (u >= -1e-7 && v >= -1e-7 && u+v <= 1+1e-7) {
        const w=1-u-v;
        let y=u*a[1]+v*b[1]+w*c[1];
        if (snowpack && tri.lips) {
          for (const [p,q,r] of tri.lips) {
            const d=(q[2]-r[2])*(p[0]-r[0])+(r[0]-q[0])*(p[2]-r[2]);
            const s=((q[2]-r[2])*(x-r[0])+(r[0]-q[0])*(z-r[2]))/d;
            const t=((r[2]-p[2])*(x-r[0])+(p[0]-r[0])*(z-r[2]))/d;
            if (s< -1e-7 || t< -1e-7 || s+t>1+1e-7) continue;
            y+=snowHeight(s*p[6]+t*q[6]+(1-s-t)*r[6],s*p[3]+t*q[3]+(1-s-t)*r[3]);
            break;
          }
        } else if (snowpack) {
          y+=snowHeight(u*a[6]+v*b[6]+w*c[6],u*a[3]+v*b[3]+w*c[3]);
        }
        return [x,y,z];
      }
    }
    return [x,height(x,z),z];
  }

  function altitudePoint(x,y,nearZ) {
    let best, distance=Infinity;
    // Intersect a vertical line of constant east coordinate and altitude with
    // the mesh. Multiple candidates can occur on the two sides of a buttress.
    for (const [a,b,c] of verticalSections.get(Math.floor(x/binSize)) || []) {
      const det=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
      if (Math.abs(det)<1e-9) continue;
      const u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/det;
      const v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/det;
      if (u< -1e-8 || v< -1e-8 || u+v>1+1e-8) continue;
      const z=u*a[2]+v*b[2]+(1-u-v)*c[2];
      if (z<crest(x)-.4) continue;
      if (Math.abs(nearZ-z)<distance) {
        distance=Math.abs(nearZ-z);
        best=[x,y,z];
      }
    }
    return best || surface(x,nearZ);
  }

  function closestContour(x,y,z) {
    const gridX=Math.floor(x/binSize), gridZ=Math.floor(z/binSize);
    let best, distance=Infinity;
    for (let i=gridX-1; i<=gridX+1; i++) for (let j=gridZ-1; j<=gridZ+1; j++) {
      for (const tri of bins.get(key(i,j)) || []) {
        const intersections=[];
        for (let e=0; e<3; e++) {
          const a=tri[e], b=tri[(e+1)%3];
          if ((y>a[1])===(y>b[1])) continue;
          const t=(y-a[1])/(b[1]-a[1]);
          intersections.push([mix(a[0],b[0],t),mix(a[2],b[2],t)]);
        }
        if (intersections.length!==2) continue;
        const [a,b]=intersections, dx=b[0]-a[0], dz=b[1]-a[1];
        const t=clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz || 1));
        const xx=a[0]+t*dx, zz=a[1]+t*dz, d=(x-xx)**2+(z-zz)**2;
        if (d<distance) { distance=d; best=[xx,y,zz]; }
      }
    }
    return best || surface(x,z);
  }

  const summit = surface(summitX,crest(summitX));
  const paths = mountain.trails.map((anchors,side) => {
    const ledge = summitX + (side ? 2.7 : -2.7);
    const end = [ledge, -7];
    const knots = [...anchors,end];
    // Round the switchbacks in the horizontal plane. Altitude is always
    // recomputed on the mountain, including between the original waypoints.
    let rounded = knots;
    for (let pass=0; pass<2; pass++) {
      const next = [rounded[0]];
      for (let i=1; i<rounded.length; i++) {
        const a=rounded[i-1], b=rounded[i];
        next.push([mix(a[0],b[0],.25),mix(a[1],b[1],.25)], [mix(a[0],b[0],.75),mix(a[1],b[1],.75)]);
      }
      next.push(rounded[rounded.length-1]);
      rounded=next;
    }
    const planar=[{x:rounded[0][0],z:rounded[0][1],distance:0}];
    let flatLength=0;
    for (let i=1; i<rounded.length; i++) {
      const a=rounded[i-1], b=rounded[i];
      const d=Math.hypot(b[0]-a[0],b[1]-a[1]);
      const steps=Math.ceil(d/.5);
      for (let n=1; n<=steps; n++) {
        const t=n/steps;
        planar.push({x:mix(a[0],b[0],t),z:mix(a[1],b[1],t),distance:flatLength+d*t});
      }
      flatLength+=d;
    }
    const first=surface(...rounded[0]), last=surface(...end);
    // Each traverse has to clear the lowest shoulder still ahead. Work back
    // from the plateau to give every switchback an attainable, rising contour.
    let ceiling=last[1];
    for (let i=planar.length-1; i>=0; i--) {
      const pt=planar[i], t=pt.distance/flatLength;
      const remaining=i===planar.length-1?0:planar[i+1].distance-pt.distance;
      const crestHeight=surface(pt.x,crest(pt.x))[1];
      ceiling=Math.min(ceiling-.11*remaining,crestHeight-.65*Math.sin(Math.PI*t));
      pt.altitude=Math.min(mix(first[1],last[1],t*(.80+.20*t)),ceiling);
    }
    const samples=[];
    let length=0;
    for (let i=0; i<planar.length; i++) {
      const pt=planar[i];
      let pos;
      if (i===0) pos=first;
      else if (i===planar.length-1) pos=last;
      else {
        pos=altitudePoint(pt.x,pt.altitude,pt.z);
        if (Math.abs(pos[1]-pt.altitude)>1e-6) pos=closestContour(pt.x,pt.altitude,pos[2]);
      }
      if (samples.length) {
        const prev=samples[samples.length-1].pos;
        length+=Math.hypot(pos[0]-prev[0],pos[1]-prev[1],pos[2]-prev[2]);
      }
      samples.push({pos,length});
    }
    samples.push({pos:[ledge,summit[1],-7.7],length:length+.7});
    return samples;
  });

  function route(side,p) {
    const path = paths[side === 'con' ? 1 : 0];
    const distance = clamp(p)*path[path.length-1].length;
    let hi=path.length-1, lo=0;
    while (hi-lo>1) {
      const mid=(hi+lo)>>1;
      if (path[mid].length < distance) lo=mid;
      else hi=mid;
    }
    const a=path[lo], b=path[hi];
    const t=(distance-a.length)/(b.length-a.length);
    if (t<=1e-10) return a.pos.slice();
    if (t>=1-1e-10) return b.pos.slice();
    const x=mix(a.pos[0],b.pos[0],t), z=mix(a.pos[2],b.pos[2],t);
    const y=mix(a.pos[1],b.pos[1],t), ground=surface(x,z);
    return Math.abs(ground[1]-y)<1e-6 ? ground : closestContour(x,y,z);
  }

  // The route was surveyed on the compacted surface. Loose snow builds up on
  // the shoulders and in sheltered gullies, thinning into the walked track.
  const track=[];
  for (const side of ['pro','con']) for (let j=0;j<=300;j++) track.push(route(side,j/300));
  const nodes=new Set(survey.flatMap(item=>item.tri));
  for (const p of nodes) {
    const [x,y,z]=p;
    let nearest=Infinity;
    for (const q of track) nearest=Math.min(nearest,(x-q[0])**2+(z-q[2])**2);
    const shelter=noise(x*.077,z*.096,seed+8);
    const pack=(.35+1.42*shelter+.51*clamp(p[3]))*clamp((front(x)-z)/5);
    p[6]=Math.min(pack,(Math.sqrt(nearest)-1.8)*.88,summit[1]-y);
  }
  // A survey facet occasionally bridges across a tight hairpin. Constrain
  // its interpolated thickness at the track as well as at its corner samples.
  const deductions=new Map();
  for (const p of track) for (const [ox,oz] of [[0,0],[1.35,0],[-1.35,0],[0,1.35],[0,-1.35]]) {
    const x=p[0]+ox,z=p[2]+oz;
    for (const tri of bins.get(key(Math.floor(x/binSize),Math.floor(z/binSize))) || []) {
      const [a,b,c]=tri;
      const det=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);
      const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/det;
      const v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/det;
      if (u<0 || v<0 || u+v>1) continue;
      const excess=u*a[6]+v*b[6]+(1-u-v)*c[6]+.22;
      if (excess>0) for (const vertex of tri) deductions.set(vertex,Math.max(deductions.get(vertex)||0,excess));
      break;
    }
  }
  for (const p of nodes) {
    p[6]-=deductions.get(p)||0;
    // These signed fields locate the folds from the crown down to the lip.
    shapeSnow(p);
  }
  for (const item of survey) {
    const {tri,index,forefield}=item;
    const snow=clip(tri,3,0,true);
    const edge=snow.filter(p=>Math.abs(p[3])<1e-8);
    if (forefield || edge.length!==2 || Math.max(...edge.map(p=>p[6]))<.36 ||
        Math.hypot(edge[0][0]-edge[1][0],edge[0][2]-edge[1][2])<2.65) {
      drawTriangle(item);
      continue;
    }
    // Break long straight cut edges into wind-sculpted lobes. The added
    // station is inside the facet, so adjacent facets retain common seams.
    const t=.35+.31*hash(index,4,seed), towards=hash(index,5,seed)>.38?snow:clip(tri,3,0,false);
    const bend=.16+.32*hash(index,6,seed);
    const tip=edge[0].map((v,i)=>mix(mix(v,edge[1][i],t),
      towards.reduce((sum,p)=>sum+p[i],0)/towards.length,bend));
    tip[3]=0;tip[6]*=.64+.30*hash(index,7,seed);shapeSnow(tip);
    tri.lips=tri.map((p,i)=>[p,tri[(i+1)%3],tip]);
    for (const patch of tri.lips) drawTriangle({...item,tri:patch});
  }

  const worldPoint=([x,y,z])=>[x*worldPerMapUnit,y*worldPerMapUnit,z*worldPerMapUnit];
  for (const face of faces) {
    face.points=face.points.map(worldPoint);
    for (const detail of face.details||[]) detail.points=detail.points.map(worldPoint);
  }
  addOutcrops(faces,surface,style,worldPerMapUnit);
  const worldRoute=(side,p)=>worldPoint(route(side,p));
  function worldSurface(x,z) {
    const point=surface(x/worldPerMapUnit,z/worldPerMapUnit,true);
    point[0]=x;point[1]*=worldPerMapUnit;point[2]=z;
    return point;
  }
  // Over a rectangle, an affine surface is bounded by its uphill corner.
  // Interpolate the nonnegative snow depths at the corners. This also
  // bounds inserted wind lips where an originally negative depth moves
  // towards zero, and exposed rock where negative snow means bare ground.
  const rearLimit=Math.max(...grid.map(column=>column[0][2]));
  const frontLimit=Math.min(...grid.map(column=>column[rows][2]));
  for (const item of survey) {
    if (item.forefield) continue;
    const {tri}=item,[a,b,c]=tri;
    const bx=b[0]-a[0],bz=b[2]-a[2],cx=c[0]-a[0],cz=c[2]-a[2],det=bx*cz-bz*cx;
    const plane=(ha,hb,hc)=>{
      const dx=((hb-ha)*cz-bz*(hc-ha))/det,dz=(bx*(hc-ha)-(hb-ha)*cx)/det;
      const peak=Math.max(ha,hb,hc);
      return {dx,dz,offset:ha-dx*a[0]-dz*a[2],peak:peak+3e-7*(peak-Math.min(ha,hb,hc))};
    };
    const top=plane(a[1]+Math.max(0,a[6]),b[1]+Math.max(0,b[6]),c[1]+Math.max(0,c[6]));
    const edges=tri.map((p,i)=>{
      const q=tri[(i+1)%3],dx=(p[2]-q[2])*Math.sign(det),dz=(q[0]-p[0])*Math.sign(det);
      return {dx,dz,offset:-dx*p[0]-dz*p[2]};
    });
    // Match the barycentric edge tolerance of surface() at survey seams.
    const padX=(item.maxX-item.minX)*3e-7,padZ=(item.maxZ-item.minZ)*3e-7;
    tri.bounds={minX:item.minX-padX,maxX:item.maxX+padX,minZ:item.minZ-padZ,maxZ:item.maxZ+padZ,
      top,edges,tolerance:Math.abs(det)*1.01e-7};
  }
  worldSurface.maxHeight=(left,right,back,front)=>{
    left/=worldPerMapUnit;right/=worldPerMapUnit;back/=worldPerMapUnit;front/=worldPerMapUnit;
    if (left<xColumns[0] || right>xColumns.at(-1) || back<rearLimit || front>frontLimit) return Infinity;
    let peak=-Infinity;
    for (let i=Math.floor(left/binSize);i<=Math.floor(right/binSize);i++) {
      for (let j=Math.floor(back/binSize);j<=Math.floor(front/binSize);j++) {
        for (const {bounds} of bins.get(key(i,j)) || []) {
          if (bounds.maxX<left || bounds.minX>right || bounds.maxZ<back || bounds.minZ>front) continue;
          if (bounds.edges.some(e=>e.offset+e.dx*(e.dx<0?left:right)+e.dz*(e.dz<0?back:front)<-bounds.tolerance)) continue;
          const p=bounds.top, high=p.offset+p.dx*(p.dx<0?left:right)+p.dz*(p.dz<0?back:front);
          peak=Math.max(peak,Math.min(high,p.peak));
        }
      }
    }
    return peak===-Infinity?Infinity:(peak+.00001)*worldPerMapUnit;
  };
  return {scale:worldPerMapUnit,summit:worldPoint(summit),...mountaineeringCourse(faces,worldRoute,worldSurface,style)};
}

// Cut a convex footprint into the existing facets. Every new rim vertex is
// interpolated on the very triangle it cuts, including the high and low banks.
function dividedPatch(points,edges) {
  let inside=points;
  const outside=[];
  for (const line of edges) {
    if (!inside.length) break;
    const distances=inside.map(p=>line(p[0],p[2],p[1]));
    if (distances.every(d=>d>=-1e-8)) continue;
    if (distances.every(d=>d<=1e-8)) { outside.push(inside); inside=[]; break; }
    const positive=[], negative=[];
    let a=inside[inside.length-1], last=distances[distances.length-1];
    for (let j=0;j<inside.length;j++) {
      const b=inside[j], d=distances[j];
      if (d*last<0) {
        const t=last/(last-d), crossing=a.map((v,k)=>mix(v,b[k],t));
        positive.push(crossing); negative.push(crossing);
      }
      if (d>=0) positive.push(b);
      if (d<=0) negative.push(b);
      a=b; last=d;
    }
    if (negative.length>=3) outside.push(negative);
    inside=positive.length>=3?positive:[];
  }
  return {inside,outside};
}

function mountaineeringCourse(sourceFaces,baseRoute,ground,style) {
  const deckHalfWidth=.72;
  const icePalettes={
    poster:{ rim:'#e4f1e7', ice:'#9ed5d6', face:'#76adb9', shade:'#52738d', deep:'#35425e',
      alloy:'#c5c6b3', steel:'#626978', line:'#a95737', flag:'#f4cf7d' },
    ink:{ rim:'#f6f0d9', ice:'#c5d2c7', face:'#a9beb8', shade:'#768b89', deep:'#46555d',
      alloy:'#d5d1b9', steel:'#565e60', line:'#72624b', flag:'#d2b475' },
    paper:{ rim:'#e7f0db', ice:'#a0d9d1', face:'#79b9c1', shade:'#4c8098', deep:'#344768',
      alloy:'#c3d4bc', steel:'#4b6376', line:'#ac6b48', flag:'#e4bb77' },
  };
  const palette=icePalettes[style] || icePalettes.poster;
  const features={pro:[],con:[]};
  const decks=[];
  let faces=sourceFaces;
  for (const [side,kind,start,end] of [
    ['pro','ladder',.285,.355],['pro','ice',.704,.782],
    ['con','ladder',.195,.266],['con','ice',.780,.878],
  ]) {
    const a=baseRoute(side,start), b=baseRoute(side,end), delta=b.map((v,i)=>v-a[i]);
    const run=Math.hypot(delta[0],delta[2]), length=Math.hypot(...delta);
    const alongX=delta[0]/run, alongZ=delta[2]/run, leftX=-alongZ, leftZ=alongX;
    const at=(u,lane=0,h=0)=>[a[0]+delta[0]*u+leftX*lane,a[1]+delta[1]*u+h,a[2]+delta[2]*u+leftZ*lane];
    const local=(x,z)=>[((x-a[0])*alongX+(z-a[2])*alongZ)/run,(x-a[0])*leftX+(z-a[2])*leftZ];
    const ladder=kind==='ladder', depth=(side==='pro'?4.3:5.0)*worldPerMapUnit;
    const footprint=ladder ? (side==='pro'
      ? [[.33,-4.5],[.14,-2.6],[.10,-.8],[.17,.7],[.40,1.8],[.68,2.7],[.82,2.1],[.90,.5],[.75,-1.45],[.55,-3.25]]
      : [[.29,-7.1],[.10,-4.3],[.09,-1.1],[.16,2.5],[.42,6.2],[.60,6.9],[.78,4.9],[.93,1.1],[.82,-3.0],[.61,-5.7]])
      : [[-.11,-.55],[.05,-1.6],[.41,-2.16],[.77,-2.03],[1.09,-1.14],[1.12,.49],[.90,1.79],[.47,2.0],[.08,1.58],[-.10,.65]];
    const border=footprint.map(([u,l])=>at(u,l*worldPerMapUnit));
    const center=at(.5,0);
    const edges=border.map((p,i)=>{
      const q=border[(i+1)%border.length], dx=q[0]-p[0], dz=q[2]-p[2];
      const orient=Math.sign(dx*(center[2]-p[2])-dz*(center[0]-p[0]))/Math.hypot(dx,dz);
      return (x,z)=>orient*(dx*(z-p[2])-dz*(x-p[0]));
    });
    const xmin=Math.min(...border.map(p=>p[0])), xmax=Math.max(...border.map(p=>p[0]));
    const zmin=Math.min(...border.map(p=>p[2])), zmax=Math.max(...border.map(p=>p[2]));
    const contains=(x,z)=>x>=xmin&&x<=xmax&&z>=zmin&&z<=zmax&&edges.every(line=>line(x,z)>=-1e-7);
    const surveyBays=Math.max(7,Math.round(length/worldPerMapUnit/(ladder?.65:.70)));
    const steps=surveyBays*worldPerMapUnit;
    const contact=(u,lane=0)=>{
      u=clamp(u);
      if (ladder) return at(u,lane);
      const p=baseRoute(side,mix(start,end,u));
      return lane?ground(p[0]+leftX*lane,p[2]+leftZ*lane):p;
    };
    const handhold=(u,sign=1)=>at(clamp(u),sign*.95,1.96-.80*clamp(u)*(1-clamp(u)));
    const feature={kind,start,end,steps,contact,handhold,local,contains,depth};
    features[side].push(feature);
    const iceDrawings=[];
    function iceMark(localPoints,color) {
      const points=localPoints.map(([u,l])=>{const p=at(u,l*worldPerMapUnit);return [p[0],p[2]];});
      iceDrawings.push({points,color});
    }
    if (!ladder) {
      // Long flutes catch light on one wall while the adjacent vein stays blue.
      for (let n=0;n<15;n++) {
        const l=-2.05+n*.295, u=.02+.29*hash(n,3,21), end=.68+.46*hash(n,5,53);
        const w=.055+.15*hash(n,4,81), bend=.11+.30*hash(n,7,23);
        iceMark([[u,l],[u+.14,l+w],[end-.16,l+bend+w],[end,l+bend],
          [end-.25,l+bend*.61],[u+.17,l-.024]], n%3===1?palette.face:tint(palette.rim,palette.ice,.40));
        if (n%2===0) iceMark([[u+.02,l-.008],[u+.16,l-.052],[end-.21,l+bend*.53],[end-.08,l+bend*.84]],
          tint(palette.face,palette.shade,.64));
      }
      for (let n=0;n<10;n++) {
        const u=.09+.084*n, l=(n%2?-1:1)*(.3+.95*hash(n,2,34)), sign=n%2?1:-1;
        const width=.45+.72*hash(n,5,74);
        iceMark([[u,l],[u+.033,l+.30*sign],[u+.008,l+width*sign],
          [u+.019,l+.32*sign],[u-.038,l-.29*sign]],palette.shade);
      }
    }
    const revised=[];
    for (const face of faces) {
      const points=face.points;
      if (points.every(p=>p[0]<=xmin)||points.every(p=>p[0]>=xmax)||
          points.every(p=>p[2]<=zmin)||points.every(p=>p[2]>=zmax)) { revised.push(face); continue; }
      const {inside,outside}=dividedPatch(points,edges);
      if (!inside.length) { revised.push(face); continue; }
      for (const kept of outside) revised.push({points:kept,color:face.color,material:face.material});
      const low=p=>[p[0],p[1]-depth,p[2]];
      if (!ladder) {
        const tone=hash(points[0][0]/worldPerMapUnit,points[0][2]/worldPerMapUnit,191);
        const iceFace={points:inside,color:tint(palette.face,palette.ice,.20+.63*tone),material:'ice'};
        const details=[];
        const lift=facePlane(inside);
        for (const mark of iceDrawings) {
          const cut=fitMark(mark.points,inside,lift);
          if (cut.length) details.push({points:cut,color:mark.color});
        }
        if (details.length) iceFace.details=details;
        revised.push(iceFace);
        continue;
      }
      revised.push({points:inside.map(low),color:tint(palette.deep,palette.shade,.12+.20*hash(points[0][0]/worldPerMapUnit,points[0][2]/worldPerMapUnit,3))});
      // The surface layers of compacted firn sit over blue ice and a dark bed.
      for (let j=0;j<inside.length;j++) {
        const p=inside[j], q=inside[(j+1)%inside.length];
        if (!edges.some(line=>Math.abs(line(p[0],p[2]))<1e-6 && Math.abs(line(q[0],q[2]))<1e-6)) continue;
        const edgeLen=Math.hypot(p[0]-q[0],p[2]-q[2]); if (edgeLen<1e-5) continue;
        const light=clamp(.42+(q[0]-p[0])*.35/edgeLen);
        const rings=[0,.24*worldPerMapUnit,1.11*worldPerMapUnit,depth];
        const paints=[palette.rim,tint(palette.ice,palette.face,light),tint(palette.shade,palette.face,light)];
        for (let k=0;k<3;k++) {
          const down=(v,d)=>[v[0],v[1]-d,v[2]];
          const wall={points:[down(p,rings[k]),down(q,rings[k]),down(q,rings[k+1]),down(p,rings[k+1])],color:paints[k],crevasseWall:true};
          if (k===2 && edgeLen>.36) {
            const w=(u,v)=>down(p.map((n,i)=>mix(n,q[i],u)),mix(rings[k],rings[k+1],v));
            wall.details=[
              {points:[w(.04,0),w(.39,0),w(.55,.52),w(.70,.96),w(.36,.65)],color:tint(paints[k],palette.rim,.25)},
              {points:[w(.43,0),w(.49,0),w(.59,.43),w(.71,.61),w(.67,.63),w(.55,.46)],color:tint(paints[k],palette.deep,.63)},
              {points:[w(.60,1),w(.91,.81),w(1,.59),w(1,1)],color:tint(paints[k],palette.deep,.44)},
            ];
          }
          revised.push(wall);
        }
      }
    }
    if (!ladder) {
      const shoulders=[];
      drawIceShoulders(style,(outline,pigment)=>{
        const points=outline.map(([u,lane])=>{const [x,,z]=at(u,lane);return [x,z];});
        const xs=points.map(p=>p[0]), zs=points.map(p=>p[1]);
        shoulders.push({points,pigment,left:Math.min(...xs),right:Math.max(...xs),back:Math.min(...zs),front:Math.max(...zs)});
      });
      const west=Math.min(...shoulders.map(s=>s.left)), east=Math.max(...shoulders.map(s=>s.right));
      const north=Math.min(...shoulders.map(s=>s.back)), south=Math.max(...shoulders.map(s=>s.front));
      for (const face of revised) {
        if (face.material!=='snow' || face.points.every(p=>p[0]<west) || face.points.every(p=>p[0]>east)
            || face.points.every(p=>p[2]<north) || face.points.every(p=>p[2]>south)) continue;
        const xs=face.points.map(p=>p[0]), zs=face.points.map(p=>p[2]);
        const left=Math.min(...xs), right=Math.max(...xs), back=Math.min(...zs), front=Math.max(...zs);
        const lift=facePlane(face.points);
        for (const mark of shoulders) {
          if (right<mark.left || left>mark.right || front<mark.back || back>mark.front) continue;
          const points=fitMark(mark.points,face.points,lift);
          if (!points.length) continue;
          const color=mark.pigment==='light' ? tint(face.color,palette.rim,.72) : tint(face.color,palette.shade,.36);
          (face.details||=[]).push({points,color});
        }
      }
    }
    faces=revised;
    if (ladder) {
      // Cut seats for the two ends of the ladder into the uphill bank.
      // The top of every exposed rung is also the walkers' support plane.
      const corners=[at(0,-deckHalfWidth),at(1,-deckHalfWidth),at(0,deckHalfWidth),at(1,deckHalfWidth)];
      const xs=corners.map(p=>p[0]),zs=corners.map(p=>p[2]);
      const left=Math.min(...xs),right=Math.max(...xs),back=Math.min(...zs),front=Math.max(...zs);
      decks.push({left,right,back,front,xmin,xmax,zmin,zmax,feature,alongX,alongZ,base:a[1],rise:delta[1]});
      const deck=(x,z)=>a[1]+delta[1]*local(x,z)[0]-.14;
      const margins=[(x,z)=>local(x,z)[0],(x,z)=>1-local(x,z)[0],
        (x,z)=>deckHalfWidth+local(x,z)[1],(x,z)=>deckHalfWidth-local(x,z)[1]];
      const cut=[...margins,(x,z,y)=>y-deck(x,z)];
      const seat=[];
      for (const face of faces) {
        if ((!face.material && !face.crevasseWall) || face.points.every(p=>p[0]<left) || face.points.every(p=>p[0]>right) ||
            face.points.every(p=>p[2]<back) || face.points.every(p=>p[2]>front)) {
          seat.push(face);
          continue;
        }
        const {inside,outside}=dividedPatch(face.points,cut);
        if (!inside.length) {seat.push(face);continue;}
        for (const points of outside) seat.push({...face,points,details:undefined});
        if (face.crevasseWall) continue;
        const floor=inside.map(([x,,z])=>[x,deck(x,z),z]);
        seat.push({points:floor,material:'rock',color:tint(face.color,palette.steel,.27)});
        for (let i=0;i<inside.length;i++) {
          const j=(i+1)%inside.length,p=inside[i],q=inside[j];
          if (margins.some(edge=>Math.abs(edge(p[0],p[2]))<1e-7 && Math.abs(edge(q[0],q[2]))<1e-7)) {
            seat.push({points:[p,q,floor[j],floor[i]],color:tint(face.color,palette.shade,.28)});
          }
        }
      }
      faces=seat;
    }
    function beam(from,to,width,lit,shade) {
      const direction=to.map((v,k)=>v-from[k]), h=Math.hypot(direction[0],direction[2]);
      const cross=h?[-direction[2]/h,0,direction[0]/h]:[1,0,0];
      const up=[direction[1]*cross[2]-direction[2]*cross[1],direction[2]*cross[0]-direction[0]*cross[2],direction[0]*cross[1]-direction[1]*cross[0]];
      const norm=Math.hypot(...up), points=[from,to].map(p=>[[1,0],[0,1],[-1,0],[0,-1]].map(([u,v])=>
        p.map((n,i)=>n+width*(u*cross[i]+v*up[i]/norm))));
      for (let j=0;j<4;j++) faces.push({points:[points[0][j],points[0][(j+1)%4],points[1][(j+1)%4],points[1][j]],
        color:j<2?lit:shade,bridgeHardware:true});
    }
    if (ladder) {
      for (const sign of [-1,1]) {
        const tip=footprint.reduce((best,v)=>v[1]*sign>best[1]*sign?v:best);
        for (const branch of [0,1]) {
          const run=branch?2.1:4.6;
          let last;
          for (let j=0;j<=5;j++) {
            const t=j/5, lane=(tip[1]+sign*(t*run))*worldPerMapUnit;
            const u=tip[0]+(branch?.16:-.13)*t+.061*Math.sin(t*(branch?6:8));
            const wide=(1-t)*.046+.006;
            const pair=[-wide,wide].map(offset=>{
              const p=at(u+offset,lane);
              const g=ground(p[0],p[2]);g[1]+=.027;return g;
            });
            if (last) faces.push({points:[last[0],last[1],pair[1],pair[0]],color:j<3?palette.shade:palette.face});
            last=pair;
          }
        }
      }
      // Rungs, rigid side stringers and handlines are independently projected.
      // Short sections can disappear behind the bank as the camera turns.
      for (const sign of [-1,1]) {
        for (let j=0;j<steps;j++) {
          const u=j/steps, v=(j+1)/steps;
          beam(at(u,sign*.66,-.085),at(v,sign*.66,-.085),.102,palette.alloy,palette.steel);
          beam(handhold(u,sign),handhold(v,sign),.037,palette.line,palette.steel);
        }
        for (const u of [0,1]) {
          const foot=at(u,sign*.95,-.18), top=handhold(u,sign);
          beam(foot,top,.062,palette.alloy,palette.steel);
          const knot=at(u,sign*.95,1.79);
          beam(knot,top,.085,palette.flag,palette.line);
        }
      }
      for (let j=0;j<=steps;j++) {
        const u=j/steps;
        beam(at(u,-.67,-.065),at(u,.67,-.065),.065,palette.rim,palette.steel);
      }
    } else {
      // Pressure ridges and tapered melt channels run along the actual pitch.
      // Their facets are kept to the sides of the crampon and axe corridor.
      for (let j=0;j<17;j++) {
        const u=.09+.73*hash(j,14,41), lane=(j%2?1:-1)*(.72+.76*hash(j,12,88))*worldPerMapUnit;
        const extent=.095+.19*hash(j,58,71), width=(.045+.13*hash(j,64,75))*worldPerMapUnit;
        const tip=contact(u,lane), base=contact(Math.min(1,u+extent),lane+.12*worldPerMapUnit);
        const flank=contact(u+extent*.61,lane+width), thin=contact(u+extent*.54,lane-width);
        const lip=contact(u+extent*.64,lane-.015*worldPerMapUnit);
        lip[1]+=(.085+.22*hash(j,11,57))*worldPerMapUnit;
        faces.push({points:[tip,thin,lip,base],color:palette.rim},{points:[tip,lip,base,flank],color:palette.shade});
      }
    }
  }
  function featureAt(side,p) {
    const section=features[side]?.find(feature=>p>=feature.start && p<=feature.end);
    return section?{...section,u:clamp((p-section.start)/(section.end-section.start))}:null;
  }
  function route(side,p) {
    const feature=featureAt(side,p);
    return feature?.kind==='ladder'?feature.contact(feature.u):baseRoute(side,p);
  }
  function surface(x,z) {
    for (const deck of decks) {
      const feature=deck.feature;
      if (x>=deck.left && x<=deck.right && z>=deck.back && z<=deck.front) {
        const [u,lane]=feature.local(x,z);
        if (u>=0 && u<=1 && Math.abs(lane)<=deckHalfWidth) return [x,feature.contact(u)[1],z];
      }
      if (feature.contains(x,z)) {const p=ground(x,z);p[1]-=feature.depth;return p;}
    }
    return ground(x,z);
  }
  surface.maxHeight=(left,right,back,front)=>{
    const bed=ground.maxHeight(left,right,back,front);
    let floor=bed,highestDeck=-Infinity;
    for (const deck of decks) {
      const pit=left<=deck.xmax && right>=deck.xmin && back<=deck.zmax && front>=deck.zmin;
      const bridge=left<=deck.right && right>=deck.left && back<=deck.front && front>=deck.back;
      if (!pit && !bridge) continue;
      const {feature}=deck;
      const inPit=pit && feature.contains(left,back) && feature.contains(left,front) &&
        feature.contains(right,back) && feature.contains(right,front);
      if (inPit) floor=bed-feature.depth;
      if (bridge) {
        const [u]=feature.local(deck.alongX*deck.rise<0?left:right,deck.alongZ*deck.rise<0?back:front);
        highestDeck=Math.max(highestDeck,deck.base+clamp(u)*deck.rise+.00001);
      }
    }
    return Math.max(floor,highestDeck);
  };
  return {faces,features,featureAt,route,surface};
}
