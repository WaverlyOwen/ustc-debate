export function clip(poly,distance) {
  const out=[];
  let a=poly[poly.length-1], previous=a && distance(a);
  for (const b of poly) {
    const d=distance(b);
    if ((previous>=0)!==(d>=0)) {
      const t=previous/(previous-d);
      out.push(a.map((n,i)=>n+(b[i]-n)*t));
    }
    if (d>=0) out.push(b);
    a=b;previous=d;
  }
  return out;
}

// Subtract an occluding triangle in screen space. Reciprocal depth varies
// linearly over a projected plane, so a narrow rail or rock tip can cut the
// interior of a projected face even when its corners remain visible.
function subtract(poly,planes) {
  if (planes.some(plane=>poly.every(p=>plane(p)<=0))) return [poly];
  const outside=[];
  for (const plane of planes) {
    if (poly.every(p=>plane(p)>=0)) continue;
    const keep=clip(poly,p=>-plane(p));
    if (keep.length>=3) outside.push(keep);
    poly=clip(poly,plane);
    if (poly.length<3) break;
  }
  return outside;
}

// A triangulated mesh face returns null when intact, so its existing
// silhouette stroke survives. A cut mesh returns only its visible fill.
export function visiblePolygonPath(pts,project,box,farthest,triangulate=false) {
  const vertices=pts.map(p=>[p.x,p.y,1/p.depth]);
  const original=triangulate ? vertices.slice(2).map((v,i)=>[vertices[0],vertices[i+1],v]) : [vertices];
  let visible=original;
  const slack=.006/(farthest*farthest);
  project.visitOccluders(box,farthest,(a,b,c)=>{
    if (!visible.length) return;
    const bx=b.x-a.x,by=b.y-a.y,cx=c.x-a.x,cy=c.y-a.y, det=bx*cy-by*cx;
    if (Math.abs(det)<.0001) return;
    const az=1/a.depth,bz=1/b.depth-az,cz=1/c.depth-az;
    const dx=(bz*cy-cz*by)/det,dy=(cz*bx-bz*cx)/det;
    const closer=p=>az+dx*(p[0]-a.x)+dy*(p[1]-a.y)-p[2]-slack;
    if (visible.every(poly=>poly.every(p=>closer(p)<=0))) return;
    const sign=Math.sign(det);
    const edge=(from,to)=>p=>sign*((to.x-from.x)*(p[1]-from.y)-(to.y-from.y)*(p[0]-from.x));
    const planes=[closer,edge(a,b),edge(b,c),edge(c,a)];
    visible=visible.flatMap(poly=>subtract(poly,planes));
  });
  const clipped=visible.length!==original.length || visible.some((poly,i)=>poly!==original[i]);
  if (triangulate && !clipped) return null;
  return visible.filter(poly=>{
    let area=0;
    for (let i=1;i<poly.length-1;i++) area+=(poly[i][0]-poly[0][0])*(poly[i+1][1]-poly[0][1])-
      (poly[i][1]-poly[0][1])*(poly[i+1][0]-poly[0][0]);
    return Math.abs(area)>.001;
  }).map(poly=>'M'+poly.map(p=>p[0].toFixed(2)+','+p[1].toFixed(2)).join('L')+'Z').join('');
}

// Clip a parameter interval to the part of a segment where a linear
// function is nonnegative. f0 and f1 are its values at the two endpoints.
function clipInterval(range,f0,f1) {
  if (f0<0 && f1<0) return false;
  if (f0<0) range[0]=Math.max(range[0],f0/(f0-f1));
  if (f1<0) range[1]=Math.min(range[1],f0/(f0-f1));
  return range[0]<range[1];
}

// A thin rail may cover the middle of a rope, or two rails can cover its
// endpoints while leaving a gap. Intersect the centerline with each nearer
// triangle and emit the complement of the union of their covered intervals.
export function bridgeRopePath(from,to,project) {
  if (!project.bridgeOverlaps || !project.visitOccluders) return null;
  const left=Math.min(from.x,to.x),right=Math.max(from.x,to.x);
  const top=Math.min(from.y,to.y),bottom=Math.max(from.y,to.y);
  const far=Math.max(from.depth,to.depth);
  if (!project.bridgeOverlaps(left,right,top,bottom,far)) return null;
  const hidden=[],slack=.006/(far*far);
  project.visitOccluders({left,right,top,bottom},far,(a,b,c)=>{
    const bx=b.x-a.x,by=b.y-a.y,cx=c.x-a.x,cy=c.y-a.y,det=bx*cy-by*cx;
    if (Math.abs(det)<.0001) return;
    const fx=from.x-a.x,fy=from.y-a.y,tx=to.x-a.x,ty=to.y-a.y;
    const u0=(fx*cy-fy*cx)/det,u1=(tx*cy-ty*cx)/det;
    const v0=(bx*fy-by*fx)/det,v1=(bx*ty-by*tx)/det;
    const range=[0,1];
    if (!clipInterval(range,u0,u1) || !clipInterval(range,v0,v1) ||
        !clipInterval(range,1-u0-v0,1-u1-v1)) return;
    // Barycentric weights and reciprocal depths are linear in screen space.
    const az=1/a.depth,bz=1/b.depth-az,cz=1/c.depth-az;
    const d0=az+bz*u0+cz*v0-1/from.depth-slack;
    const d1=az+bz*u1+cz*v1-1/to.depth-slack;
    if ((d0>0 || d1>0) && clipInterval(range,d0,d1)) hidden.push(range);
  });
  if (!hidden.length) return null;
  hidden.sort((a,b)=>a[0]-b[0]);
  function point(t) {
    if (t===0) return from.coords;
    if (t===1) return to.coords;
    return (from.x+(to.x-from.x)*t).toFixed(2)+','+(from.y+(to.y-from.y)*t).toFixed(2);
  }
  let d='',start=0;
  for (const [lo,hi] of hidden) {
    if (lo>start+1e-10) d+='M'+point(start)+'L'+point(lo);
    start=Math.max(start,hi);
  }
  if (start<1-1e-10) d+='M'+point(start)+'L'+point(1);
  return d;
}
