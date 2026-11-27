const NS = 'http://www.w3.org/2000/svg';
const clamp = (x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const smooth = n=>n*n*(3-2*n);
const bands = [
  { layer:'far', from:63, to:139, spacing:24, radius:.079, opacity:.62 },
  { layer:'middle', from:25, to:56, spacing:9.2, radius:.049, opacity:.79 },
  { layer:'near', from:7.5, to:21, spacing:4.7, radius:.033, opacity:.88 },
];
const colors = {
  poster: { snow:'#fff7e5', edge:'#aa9dac', dust:'#fff1cd' },
  ink: { snow:'#fff8e6', edge:'#7d8077', dust:'#f4edda' },
  paper: { snow:'#edf4e6', edge:'#739ca7', dust:'#d8eadd' },
};

function element(parent,name,attributes) {
  const node=parent.ownerDocument.createElementNS(NS,name);
  for (const [key,value] of Object.entries(attributes)) node.setAttribute(key,value);
  parent.appendChild(node);
  return node;
}

// A repeating table provides independent offsets inside each world-space cell.
// The cells advect with the wind, so orbiting unveils neighbouring snowflakes.
const particles=Array.from({length:251},(_,i)=>{
  const fraction=k=>{const n=Math.sin(i*152.31+k*73.87)*47123.924; return n-Math.floor(n);};
  return {x:fraction(1),y:fraction(2),z:fraction(3),size:.66+.74*fraction(4),phase:fraction(5)*Math.PI*2};
});
function particleAt(i,j,k,band) {
  const hash=(Math.imul(i,73856093)^Math.imul(j,19349663)^Math.imul(k,83492791)^band)>>>0;
  return particles[hash%particles.length];
}

function summitPlume(group,style,color,scale) {
  const paths=[.43,.30,.21].map((opacity,i)=>element(group,'path',{
    fill:color, opacity:style==='ink'?opacity*.76:opacity, 'data-spindrift':i,
  }));
  return (summit,project,time)=>{
    for (let i=0;i<paths.length;i++) {
      const wind=Math.sin(time*.19+i*.87)*.58;
      const points=[];
      for (let j=0;j<=7;j++) {
        const t=j/7, billow=Math.sin(t*Math.PI);
        const x=summit[0]+scale*(.2*i+t*(8.8+3.4*i)+wind*t);
        const z=summit[2]-scale*(.2+i*.18+t*(1.9+.6*i));
        const height=summit[1]+scale*(-.22+i*.15+billow*(.83+.36*i)+t*(.64+.53*i)+wind*billow*.39);
        const thickness=scale*(.12+.12*i)*billow*(.35+.65*t);
        points.push([project([x,height+thickness,z]),project([x,height-thickness,z])]);
      }
      if (points.some(pair=>pair[0].depth<=1)) { paths[i].setAttribute('d',''); continue; }
      const outline=points.map(p=>p[0]).concat(points.slice().reverse().map(p=>p[1]));
      paths[i].setAttribute('d','M'+outline.map(p=>p.x.toFixed(1)+','+p.y.toFixed(1)).join('L')+'Z');
    }
  };
}

export function mountSnow(svg,groups,style,summit,scale=1) {
  const palette=colors[style] || colors.poster;
  // The atmosphere uses the scene's clock. It does not start a second loop.
  for (const layer of svg.querySelectorAll('[data-climb-weather]')) layer.remove();
  for (const plume of groups.horizon.querySelectorAll('[data-spindrift]')) plume.remove();
  const background=element(svg,'g',{'data-climb-weather':'background','pointer-events':'none','aria-hidden':'true'});
  svg.insertBefore(background,groups.parties);
  const foreground=element(svg,'g',{'data-climb-weather':'foreground','pointer-events':'none','aria-hidden':'true'});
  const plume=summitPlume(groups.horizon,style,palette.dust,scale);
  const parents=[background,background,foreground];
  const layers=bands.map((band,i)=>{
    const group=element(parents[i],'g',{'data-snow-layer':band.layer,'pointer-events':'none','aria-hidden':'true'});
    const shadow=element(group,'path',{ fill:palette.edge, opacity:style==='ink'?.57:style==='paper'?.56:.33 });
    const face=element(group,'path',{ fill:palette.snow, opacity:band.opacity });
    return {shadow,face,flakes:[]};
  });
  const point=[0,0,0], projected={};

  function sample(camera,project,width,height,time,reduced) {
    const matrix=camera.matrixWorld.elements, projection=camera.projectionMatrix.elements;
    const tanX=1/projection[0], tanY=1/projection[5], timeSec=reduced?0:time;
    const drift=[timeSec*.20, -timeSec*.35, -timeSec*.045];
    plume(summit,project,timeSec);
    for (let b=0;b<bands.length;b++) {
      const band=bands[b], flakes=layers[b].flakes;
      flakes.length=0;
      const spacing=band.spacing*Math.cbrt(Math.max(1,tanX/tanY/2.1))*(reduced?1.58:1);
      const lo=[], hi=[];
      // World bounds of the truncated frustum, enlarged by the maximum sway.
      for (let a=0;a<3;a++) {
        const center=matrix[12+a]-drift[a], forward=-matrix[8+a];
        const slope=Math.abs(matrix[a])*tanX+Math.abs(matrix[4+a])*tanY;
        lo[a]=Math.floor((Math.min(center+(forward-slope)*band.from,center+(forward-slope)*band.to)-.30)/spacing);
        hi[a]=Math.floor((Math.max(center+(forward+slope)*band.from,center+(forward+slope)*band.to)+.30)/spacing);
      }
      for (let i=lo[0];i<=hi[0];i++) for (let j=lo[1];j<=hi[1];j++) for (let k=lo[2];k<=hi[2];k++) {
        const p=particleAt(i,j,k,b);
        const sway=Math.sin(timeSec*.40+p.phase);
        point[0]=(i+p.x)*spacing+drift[0]+.23*sway;
        point[1]=(j+p.y)*spacing+drift[1];
        point[2]=(k+p.z)*spacing+drift[2]+.13*Math.cos(timeSec*.24+p.phase);
        const v=project(point,projected);
        if (v.depth<=band.from || v.depth>=band.to || v.x<0 || v.x>width || v.y<0 || v.y>height) continue;
        const position=(v.depth-band.from)/(band.to-band.from);
        const fade=smooth(clamp(Math.min(position/.15,(1-position)/.17),0,1));
        const r=clamp(band.radius*v.scale*p.size,.5,b===2?3.25:1.85)*fade;
        if (r<.31) continue;
        const flake={x:v.x,y:v.y,depth:v.depth,r,sway};
        flakes.push(flake);
      }
    }
  }

  function paint(depthAt) {
    for (let i=0;i<layers.length;i++) {
      const layer=layers[i];
      let faces='',shadows='';
      for (const {x,y,depth,r,sway} of layer.flakes) {
        const limit=depth-.08;
        if (depthAt(x,y,limit)<limit) continue;
        const pt=(dx,dy)=>(x+r*dx).toFixed(1)+','+(y+r*dy).toFixed(1);
        const slant=sway*.22;
        if (style==='paper') {
          faces+='M'+pt(-.9+slant,-.05)+'L'+pt(-.2,-.72)+' '+pt(.87+slant,-.12)+' '+pt(.31,.64)+' '+pt(-.52,.43)+'Z';
          if (i) shadows+='M'+pt(-.52,.43)+'L'+pt(.31,.64)+' '+pt(.87+slant,-.12)+' '+pt(.53,.88)+'Z';
        } else {
          faces+='M'+pt(-.81+slant,-.23)+'Q'+pt(.12,-.86)+' '+pt(.85+slant,-.22)+'Q'+pt(.44,.70)+' '+pt(-.26,.67)+'Q'+pt(-.85,.42)+' '+pt(-.81+slant,-.23)+'Z';
          if (i) shadows+='M'+pt(-.76,.25)+'Q'+pt(.03,.96)+' '+pt(.83,-.12)+'Q'+pt(.30,1.13)+' '+pt(-.42,.88)+'Z';
        }
      }
      layer.shadow.setAttribute('d',shadows);
      layer.face.setAttribute('d',faces);
    }
  }
  return {sample,paint};
}
