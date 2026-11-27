// Each cross-section gives x, z, the two toe widths, relief and snow
// cover, in the original mountain survey.
const exposures=[
  // A fractured bed emerges at the western col and dives under its talus.
  [[-32.2,-13.9,.55,.45,.4,.15],[-32.3,-12.2,1.35,1.3,1.9,.44],
    [-31.7,-11.35,1.75,1.4,2.15,.69],[-32,-10.65,2.20,1.7,2.45,.59],
    [-33,-9.8,2.05,1.15,1.3,.16],[-33.8,-8.75,1.7,1.35,1.7,.34],
    [-34.5,-8,1.45,1.3,1.4,.26],[-35.7,-5.8,1.4,.82,.7,.15],[-37.2,-3.6,.35,.32,.18,.04]],
  // The eastern horn has a short windward shelf and a sheared, steep nose.
  [[23.7,-13.4,.4,.35,.25,.20],[25.1,-11.8,2.25,1.4,3.35,.55],
    [26.9,-10.75,2.45,1.4,3.65,.85],[27.45,-10.45,2.05,1.9,4.15,.97],
    [28.25,-9.95,1.8,1.35,3.15,.65],[28.7,-9.55,1.3,.6,1.25,.22],[31.2,-8.2,.32,.36,.25,.04]],
  // A broad sheet on the central buttress sheds snow off its eastern lip.
  [[-1.2,4.8,.55,.64,.20,.68],[-.8,6.8,2.65,1.85,1.35,.94],
    [.35,8.9,3.05,2.25,3.25,1],[.7,11.35,2.45,1.65,2.75,.84],
    [.15,13.35,1.45,1.6,1.7,.40],[1.3,16.0,.57,.47,.28,.22]],
  // Low exposed slabs fan out where the far-west spur meets the snowfield.
  [[-47.4,-1.5,.4,.46,.3,.03],[-49.6,.0,1.85,1.1,1.35,.11],
    [-50.8,2.2,2.35,1.4,2.15,.20],[-52.9,3.2,1.85,1.9,.85,.08],
    [-54.6,5.6,1.15,1.1,1.12,.08],[-56.9,7.4,.33,.4,.22,.02]],
];

const inks={
  poster:{rock:['#494555','#655764','#8a6e68','#ab826c','#cd9b71','#dfb482'],
    snow:['#958da6','#b8a7b0','#e3c2b6','#f5dbb8','#fff1cb']},
  ink:{rock:['#686b69','#777976','#898983','#9c9b91','#b1aea0','#c2bdab'],
    snow:['#a9aaa4','#c4c4ba','#dad7c9','#e9e5d5','#f6f1df']},
  paper:{rock:['#3d536e','#49647a','#587180','#6c868a','#849995','#a0b4a9'],
    snow:['#88a5b4','#a1bcc2','#bfd4cf','#d5e3d8','#edf0dd']},
};

function pigment(a,b,c,palette,facet) {
  const x=b.map((value,i)=>value-a[i]),z=c.map((value,i)=>value-a[i]);
  const nx=x[1]*z[2]-x[2]*z[1],ny=x[2]*z[0]-x[0]*z[2],nz=x[0]*z[1]-x[1]*z[0];
  const sun=(-.80*nx+.64*ny+.32*nz)/(Math.hypot(nx,ny,nz)||1);
  const level=Math.max(0,Math.min(1,.46+.47*sun+facet));
  return palette[Math.round(level*(palette.length-1))];
}

export function addOutcrops(faces,surface,style,scale=1) {
  const colors=inks[style]||inks.poster;
  for (const [site,sections] of exposures.entries()) {
    // The crest and its toe share stations. Adjacent cap, soffit and rock
    // triangles therefore meet at exactly the same three-dimensional edge.
    const rows=sections.map(([x,z,left,right,h,snow],i)=>{
      const before=sections[Math.max(0,i-1)],after=sections[Math.min(i+1,sections.length-1)];
      const dx=after[0]-before[0],dz=after[1]-before[1],length=Math.hypot(dx,dz);
      const nx=-dz/length,nz=dx/length;
      const floor=s=>surface(x+nx*s,z+nz*s);
      const base=floor(0)[1],peak=base+h,lip=right*((site===1?.37:.10)+.38*snow);
      const point=(s,y)=>[x+nx*s,y,z+nz*s];
      const leftToe=floor(-left),rightToe=floor(right);
      leftToe[1]-=.65;rightToe[1]-=.65;
      const shoulder=-left*((site===1?.32:.12)+.52*snow),rim=peak-.15*h-.09;
      // The eastern cap sits on a jointed cliff. Its outer shoulder rises
      // under the prow, leaving a short, near-vertical break to the snow.
      const shoulderHeight=site===1?[.1,.35,.63,.59,.45,.38,.12][i]:.18;
      const row=[leftToe,point(shoulder,peak-.19*h),point(-.06*left,peak),
        point(lip,rim),point(lip-right*(.09+.16*snow),rim-.16*h-.06),
        point(right*(site===1?.89:.60),base+shoulderHeight*h),rightToe];
      if (site===0) {
        const breakHeight=leftToe[1]+(row[1][1]-leftToe[1])*(i%3===1?.69:.42)+.18;
        row.splice(1,0,point(-left*.77,breakHeight));
      }
      if (i===0 || i===sections.length-1) for (const p of row) {
        p[1]=Math.min(p[1],surface(p[0],p[2])[1]-.18);
      }
      return row.map(p=>p.map(v=>v*scale));
    });
    for (let i=1;i<rows.length;i++) {
      const a=rows[i-1],b=rows[i],snow=(sections[i-1][5]+sections[i][5])*.5;
      for (let j=0;j<a.length-1;j++) {
        const strip=site===0 && j>0?j-1:j;
        const cap=(strip===1 && snow>.37)||(strip===2 && snow>.23);
        const palette=cap?colors.snow:colors.rock;
        const shade=strip===3?-.18:site===3?-.06:site===0 && j===1?.09:0;
        const triangles=(i+j)%3===0 ? [[a[j],a[j+1],b[j]],[a[j+1],b[j+1],b[j]]] :
          [[a[j],a[j+1],b[j+1]],[a[j],b[j+1],b[j]]];
        for (const [p,q,r] of triangles) faces.push({points:[p,q,r],color:pigment(p,q,r,palette,shade)});
      }
    }
  }
}
