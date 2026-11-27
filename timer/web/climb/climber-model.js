// All meshes use right-handed bone-local coordinates. The torso faces +Z.
// Limbs stretch along +Y from the first joint to the second.
const octagon = [[.54,1],[-.54,1],[-.96,.56],[-1,-.35],[-.62,-1],[.62,-1],[1,-.35],[.96,.56]];
const hexagon = [[.55,1],[-.55,1],[-1,-.10],[-.57,-1],[.57,-1],[1,-.10]];
const pentagon = [[0,1],[-.95,.42],[-.72,-.88],[.72,-.88],[.95,.42]];

const paints = {
  poster: {
    pro: ['#cf523a','#e76d45','#ad4941'], con: ['#378bb4','#438fb1','#416e9d'],
    bands: ['#fe342e','#167ff0'], flash: ['#ffb77c','#a7e8ef'],
    pack: ['#405c58','#64574b','#475866'], flap: '#7f9083',
    cloth: '#485765', gaiter: '#344755', web: '#354145', metal: '#ddcc91',
  },
  ink: {
    pro: ['#c6a294','#d0b2a0','#ac8c80'], con: ['#9aaeb4','#acb9b5','#8e9aa7'],
    bands: ['#e12d29','#1a74c8'], flash: ['#eb9a83','#96c2d3'],
    pack: ['#646b60','#746f61','#626c69'], flap: '#9a9b87',
    cloth: '#666d6a', gaiter: '#515c5b', web: '#4e5653', metal: '#c5bea3',
  },
  paper: {
    pro: ['#cc5941','#e5734f','#b65348'], con: ['#4089a9','#5499aa','#4a7798'],
    bands: ['#ff362e','#187bdd'], flash: ['#ffc392','#b0e1dd'],
    pack: ['#45655f','#715e4f','#495d65'], flap: '#8fa393',
    cloth: '#4a616b', gaiter: '#354e5d', web: '#354951', metal: '#d2c494',
  },
};

function tint(a,b,t) {
  const rgb=[1,3,5].map(i=>{
    const u=parseInt(a.slice(i,i+2),16), v=parseInt(b.slice(i,i+2),16);
    return Math.round(u+(v-u)*t).toString(16).padStart(2,'0');
  });
  return '#'+rgb.join('');
}

// The same topology serves horizontal fabric folds, a bent strap and a
// horizontal bedroll. Signed volume also covers a sweep that changes axis.
function loft(bone,name,rings,paint,ends) {
  const count=rings[0].length, vertices=rings.flat(), faces=[];
  function face(indices,color) { faces.push({indices,color}); }
  const cap=Array.from({length:count},(_,i)=>i);
  face(cap,ends[0]);
  for (let row=0; row<rings.length-1; row++) {
    for (let i=0; i<count; i++) {
      const j=(i+1)%count, k=row*count;
      face([k+i,k+count+i,k+count+j,k+j],paint(row,i));
    }
  }
  face(cap.map(i=>vertices.length-1-i),ends[1]);
  let volume=0;
  for (const {indices} of faces) {
    const a=vertices[indices[0]];
    for (let i=1; i<indices.length-1; i++) {
      const b=vertices[indices[i]], c=vertices[indices[i+1]];
      volume+=a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]);
    }
  }
  if (volume<0) for (const face of faces) face.indices.reverse();
  return {bone,name,vertices,faces:faces.filter(f=>f.color!=null)};
}

// Horizontal outline rings, listed as y, half-width, half-depth, depth offset.
function rings(outline,rows) {
  return rows.map(([y,w,d,z=0])=>outline.map(([x,v])=>[w*x,y,z+d*v]));
}

// Low-cost clothing envelopes used for contact and the actual boot geometry.
export const legShells={
  thigh:rings(pentagon,[[0,.195,.205],[.17,.196,.205],[.57,.171,.178,.005],[1,.145,.15,.01]]),
  shin:rings(pentagon,[[0,.151,.160,.010],[.32,.144,.154,-.002],[.62,.137,.148,-.013],[1,.122,.119]]),
  boot:[-1,1].map(sign=>{
    const outline=[[.55,1],[-.58,.97],[-1,.20],[-.76,-1],[.86,-.83]].map(([x,z])=>[sign*x,z]);
    return rings(outline,[[.008,.144,.249,.048],[.083,.148,.261,.05],
      [.149,.142,.247,.050],[.31,.106,.124,-.059]]);
  }),
};
// Each section has its own width and independent front/back depths. The
// quadriceps fill the front of the thigh, the kneecap projects forward,
// and the calf swells behind the shin before tapering into the boot.
const pantSection=[[0,1],[-.49,.87],[-.85,.54],[-1,.05],[-.94,-.42],[-.64,-.83],
  [0,-1],[.64,-.83],[.94,-.42],[1,.05],[.85,.54],[.49,.87]];
function legRings(rows) {
  return rows.map(([y,width,front,back,taper])=>pantSection.map(([x,z])=>
    [x*width*(1-taper*Math.max(0,z)),y,z*(z>0?front:back)]));
}
const knee=[.137,.159,.113,.10];
const trouserPanels=legRings([[0,.183,.169,.167,.025],[.20,.204,.194,.178,.025],
  [.47,.192,.190,.161,.035],[.68,.167,.164,.139,.06],[.82,.146,.150,.120,.08],
  [.91,.139,.154,.114,.095],[1,...knee]]);
const gaiterPanels=legRings([[0,...knee],[.09,.139,.157,.122,.12],[.19,.148,.146,.145,.17],
  [.36,.158,.135,.172,.18],[.53,.150,.125,.163,.15],[.74,.125,.114,.133,.10],
  [1,.105,.101,.108,.055]]);
const weightsByRing=(rings,weights)=>rings.flatMap((ring,i)=>Array(ring.length).fill(weights[i]));
export const legPanelMeshes={
  thigh:{rings:trouserPanels,vertices:trouserPanels.flat(),
    knee:{upper:true,weights:weightsByRing(trouserPanels,[0,0,0,0,.12,.72,1])}},
  shin:{rings:gaiterPanels,vertices:gaiterPanels.flat(),
    knee:{upper:false,weights:weightsByRing(gaiterPanels,[1,.72,.12,0,0,0,0])}},
};

const unit=v=>{const n=Math.hypot(...v)||1;return v.map(x=>x/n);};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];

// Both trouser panels meet on the plane halfway around the bend. Rotate the
// cross-section here so flexion preserves the circumference of the knee.
export function kneeSection(thigh,shin) {
  if (!thigh || !shin) return null;
  const upperLength=Math.hypot(...thigh.y),lowerLength=Math.hypot(...shin.y);
  if (!upperLength || !lowerLength) return null;
  const u=thigh.y.map(x=>x/upperLength),v=shin.y.map(x=>x/lowerLength);
  const y=unit(u.map((x,i)=>x+v[i]));
  const lateral=thigh.x.map((x,i)=>x+shin.x[i]);
  const z=unit(cross(lateral,y)),x=cross(y,z),girth=Math.hypot(...shin.x);
  const span=.24*Math.min(upperLength,lowerLength);
  return {x:x.map(n=>n*girth),z:z.map(n=>n*girth),inset:v.map((n,i)=>(n-u[i])*span/4),
    upperScale:upperLength/span,lowerScale:lowerLength/span};
}

export function posedVertex(part,index,bone,joint,out=[0,0,0]) {
  const [u,v,s]=part.vertices[index],{origin,x,y,z}=bone;
  for (let k=0;k<3;k++) out[k]=origin[k]+x[k]*u+y[k]*v+z[k]*s;
  if (joint) {
    // A quadratic arc rounds the fabric's centreline between the two rigid
    // sections. Its tangent matches the thigh and calf at the respective ends.
    const weight=part.knee.weights[index];
    const t=Math.max(0,1-(part.knee.upper ? (1-v)*joint.upperScale : v*joint.lowerScale));
    for (let k=0;k<3;k++) out[k]+=weight*((joint.x[k]-x[k])*u+(joint.z[k]-z[k])*s)+t*t*joint.inset[k];
  }
  return out;
}

// Boot-local contacts shared by the steel teeth, the foot solver and the marks in the ice.
export const frontPoints=legShells.boot.map(()=>[[-.078,-.025,.39],[.078,-.025,.39]]);
const panels=[[.032,1],[-.032,1],[-.63,.92],[-1,.14],[-.71,-1],[.71,-1],[1,.14],[.63,.92]];
export const parkaShell=rings(panels,[
  [-.08,.394,.235],[.08,.414,.254],[.166,.414,.254],[1.15,.482,.273],[1.29,.255,.177],
]);
// The padded sleeve is fullest below the shoulder seam. A little cloth
// carries over the elbow, then gathers into the glove cuff.
const sleeveSection=[[0,1],[-.59,.81],[-.94,.33],[-.95,-.29],[-.58,-.82],
  [0,-.93],[.58,-.82],[.95,-.29],[.94,.33],[.59,.81]];
const upperSleeve=rings(sleeveSection,[[-.10,.128,.13],[.05,.172,.173],[.26,.182,.18,.009],
  [.57,.163,.166,.010],[.85,.143,.145,-.003],[1,.139,.139,-.012],[1.09,.105,.102,-.010]]);
const lowerSleeve=rings(sleeveSection,[[-.07,.106,.107],[.09,.14,.142,-.008],[.30,.143,.141,.006],
  [.65,.122,.119],[.82,.107,.105],[.86,.112,.108],[1,.104,.101]]);

export function createClimberModel(person,variant='poster') {
  const kit=paints[variant] || paints.poster, red=person.side==='pro', rank=person.rank;
  const shell=kit[red?'pro':'con'][rank], band=kit.bands[red?0:1], flash=kit.flash[red?0:1];
  const pack=kit.pack[rank], skin=person.skin, hair=person.hair, light=person.light;
  const shellShadow=tint(shell,kit.web,.34), shoulder=tint(shell,flash,.33);
  const leather=tint(kit.gaiter,'#846445',.62), glass=red?'#334b53':'#304957';
  const parts=[];
  function add(bone,name,levels,paint,lower,upper=lower) {
    parts.push(loft(bone,name,levels,typeof paint==='function'?paint:()=>paint,[lower,upper]));
  }

  // A narrow face down the front joins the weatherproof zip into the shell.
  add('torso','parka',parkaShell,(r,i)=>{
    if (r===1) return i===0?kit.metal:kit.web;
    if (i===0) return r===0?kit.web:tint(shell,kit.metal,.72);
    if (r===3) return i===3||i===5?shell:shoulder;
    if (i===3 || i===5) return shellShadow;
    return shell;
  },shellShadow,shell);

  // A dropped hood has a raised windward back, hollow rim, and a front V.
  const hood=hexagon.map(([x,z])=>{
    const back=(1-z)/2;
    return [[x*.33,1.10+.04*back,z*.23-.032],
            [x*.354,1.235+.22*back,z*.245-.048],
            [x*.193,1.22+.14*back,z*.145-.006]];
  });
  add('torso','hood',[0,1,2].map(i=>hood.map(p=>p[i])),
    (r,i)=>r===1?tint(shell,kit.web,.60):i===0?shoulder:shellShadow,shellShadow,kit.web);
  add('torso','neck',rings(hexagon,[[1.215,.155,.132],[1.473,.142,.121,.026]]),
    (_,i)=>i===0?tint(skin,light,.35):skin,skin);

  // Shoulder straps pass from the hip belt up the chest and over the shell.
  for (const sign of [-1,1]) {
    const guide=[[.222,.20,.249],[.302,1.236,.270],[.267,1.10,-.32]];
    const strap=guide.map(([x,y,z],i)=>{
      const [,ya,za]=guide[Math.max(0,i-1)], [,yb,zb]=guide[Math.min(guide.length-1,i+1)];
      const len=Math.hypot(yb-ya,zb-za), ny=-(zb-za)/len, nz=(yb-ya)/len;
      return [[sign*x-.058,y,z],[sign*x+.058,y,z],[sign*x+.009,y+ny*.033,z+nz*.033]];
    });
    add('torso','shoulder-strap-'+(sign<0?'L':'R'),strap,
      (_,i)=>i===1?tint(kit.web,kit.flap,.4):kit.web,kit.web);
  }

  // The rucksack bulges away from the spine. Its lid rolls over the buckled
  // back panel, with a bedroll lashed horizontally across the top.
  add('torso','pack',rings(hexagon,[
    [.035,.265,.142,-.39],[.23,.345,.198,-.407],[.91,.368,.226,-.430],[1.135,.300,.155,-.42],
  ]),(r,i)=>r===2?kit.flap:i===3?tint(pack,kit.flap,.20):pack,pack,kit.flap);
  // Push the rear panel out into a keeper pocket, sharing its four outside
  // edges with the bag. The dark upper welt remains legible from behind.
  const rucksack=parts[parts.length-1], pocket=rucksack.faces[1+hexagon.length+3];
  const old=pocket.indices, raised=[];
  for (const index of old) {
    const [x,y]=rucksack.vertices[index], high=y>.5;
    raised.push(rucksack.vertices.length);
    rucksack.vertices.push([x*(high?.92:.74),high?.704:.303,high?-.682:-.648]);
  }
  for (let i=0;i<4;i++) {
    const j=(i+1)%4, top=rucksack.vertices[old[i]][1]>.5&&rucksack.vertices[old[j]][1]>.5;
    rucksack.faces.push({indices:[old[i],old[j],raised[j],raised[i]],color:top?kit.web:pack});
  }
  pocket.indices=raised;
  pocket.color=tint(pack,kit.flap,.51);
  const mat=rank===1?tint(kit.flap,'#9ba59d',.35):tint(kit.metal,rank===0?'#c78f53':'#aa7357',.54);
  const roll=[-.405,-.059,.057,.405].map(x=>
    hexagon.map(([u,v])=>[x,1.17+u*.122,-.49+v*.127]));
  add('torso','bedroll',roll,r=>r===1?kit.web:mat,tint(mat,kit.web,.24));

  // The jaw projects ahead of the neck and the cheekbones are wider than
  // the temples. The occiput and the ears remain modeled in profile and back.
  const faceRows=[[.005,.148,.130,.054],[.138,.259,.211,.035],[.31,.306,.242,.014],
    [.59,.307,.260,-.011],[.69,.251,.218,-.025],
    [.758+(rank===1?.014:0),.119,.113,-.036]];
  add('head','head',rings(octagon,faceRows),(r,i)=>{
    if (r>=3 || (r>=2 && i>=3 && i<=5)) return hair;
    if (rank===2 && r===0) return tint(hair,skin,.26);
    if (i===0) return r===0?tint(skin,light,.31):light;
    return i===1||i===7?tint(skin,light,.54):skin;
  },skin,hair);
  for (const sign of [-1,1]) {
    const ear=[[0,-1],[-.91,-.2],[-.24,1],[.85,.43]];
    const shell=ear.map(([z,y])=>[sign*.286,.297+y*.094,.012+z*.067]);
    const rim=ear.map(([z,y])=>[sign*(.315+.016*(1-y*y)),.299+y*.071,.013+z*.043]);
    add('head','ear-'+(sign<0?'L':'R'),[shell,rim],(r,i)=>i<3?skin:light,skin,tint(skin,light,.47));
  }
  const triangle=[[0,1],[-.91,-.54],[.91,-.54]];
  add('head','nose',rings(triangle,[
    [.215,.063,.037,.257],[.262,.071,.057,.292],[.406,.034,.024,.242],
  ]),(_,i)=>i===0||i===2?light:tint(skin,light,.35),skin,light);
  const lips=[[-.077,.143,.244,.003],[-.012,.139,.256,.010],[.079,.146,.245,.003]]
    .map(([x,y,z,h])=>[[x,y+h,z-.008],[x,y+h*.2,z+.008],[x,y-h,z]]);
  add('head','mouth',lips,(_,f)=>f===0?tint(skin,'#654442',.47):skin,skin);

  // Sunglass arms return to both temples. The shallow bridge divides two
  // dark glacier lenses, whose sloping upper bevel catches the light.
  const visor=[
    [-.304,-.035,.369,.407],[-.285,.188,.350,.420],[-.158,.253,.314,.422],
    [-.032,.267,.383,.410],[.032,.267,.383,.410],[.158,.253,.314,.422],
    [.285,.188,.350,.420],[.304,-.035,.369,.407],
  ].map(([x,z,lo,hi])=>[[x,hi,z-.013],[x,hi-.008,z+.027],[x,lo,z+.016]]);
  add('head','goggles',visor,(r,i)=>{
    if (r===3 || r===0 || r===6) return kit.web;
    if (i===0) return tint(glass,flash,.50);
    return i===1?glass:kit.web;
  },kit.web);

  const bandRings=[0,1].map(r=>octagon.map(([x,z])=>{
    const tilt=.022*x+.015*z;
    return [x*(r?.323:.325),.470+.112*r+tilt,z*.267-.004];
  }));
  add('head','headband',bandRings,(_,i)=>i===2||i===6?tint(band,flash,.15):band,band,tint(band,flash,.23));
  const knot=rings(triangle,[[.433,.059,.062,-.291],[.521,.070,.048,-.282]]);
  add('head','band-knot',knot,(_,i)=>i===1?flash:band,band);
  for (let i=0;i<2;i++) {
    const s=i?1:-1, lean=rank===1?-.04:.02;
    const tail=[[-.28,.493,.024,.042,.013],[-.43,.463-i*.048,.072,.057,.019],
      [-.54-i*.092,.328+i*.055,.15+i*.07,.022,.009]].map(([z,y,x,w,t],j)=>
        [[s*x-w+lean,y,z],[s*x+w+lean,y+t,z+.008],[s*x+lean,y-t,z-(j===1?.035:.012)]]);
    add('head','band-tail-'+i,tail,(r,f)=>f===1?tint(band,flash,.36):band,band);
  }
  if (rank===1) {
    add('head','hair-knot',rings(pentagon,[[.52,.073,.071,-.229],[.607,.12,.124,-.263],
      [.705,.069,.070,-.25]]),hair,hair);
  }

  for (let i=0;i<2;i++) {
    const s=i?1:-1;
    const clothPanel=tint(kit.cloth,kit.flap,.085);
    const trouserPanel=f=>f===1||f===10?clothPanel:kit.cloth;
    add('thigh'+i,'trousers',trouserPanels,
      (r,f)=>r===0?kit.web:trouserPanel(f),kit.cloth,null);
    parts.at(-1).knee={leg:i,...legPanelMeshes.thigh.knee};
    add('shin'+i,'gaiter',gaiterPanels,(r,f)=>r<2?trouserPanel(f):r===2?
      tint(kit.cloth,kit.gaiter,.28):r===3?tint(kit.cloth,kit.gaiter,.64):kit.gaiter,null,kit.gaiter);
    parts.at(-1).knee={leg:i,...legPanelMeshes.shin.knee};
    const sleevePanel=f=>f===4 || f===5 ? shellShadow : shell;
    add('upperArm'+i,'sleeve',upperSleeve,(r,f)=>r<2?shoulder:sleevePanel(f),shell);
    add('forearm'+i,'cuff',lowerSleeve,(r,f)=>r>=4?kit.gaiter:sleevePanel(f),shell,kit.gaiter);
    const mitt=rings(triangle,[[-.111,.087,.10],[.005,.11,.134,.012],[.116,.079,.088]]);
    mitt[1][s>0?1:2][0]-=s*.043;
    mitt[1][s>0?1:2][2]+=.044;
    add('hand'+i,'mitten',mitt,(_,f)=>f===0?tint(kit.web,kit.flap,.30):kit.web,kit.web);
    add('boot'+i,'boot',legShells.boot[i],(r,f)=>{
      if (r===0) return tint(kit.metal,leather,.50);
      if (r===1) return kit.gaiter;
      return f===0?tint(leather,kit.metal,.38):leather;
    },kit.gaiter,leather);
    for (const [x,y,z] of frontPoints[i]) {
      const tooth=[
        [[x-.033,.018,.15],[x+.033,.018,.15],[x,.061,.15]],
        [[x-.033,.009,.28],[x+.033,.009,.28],[x,.056,.28]],
        [[x-.003,y+.003,z-.005],[x+.003,y+.003,z-.005],[x,y,z]],
      ];
      add('crampon'+i,'crampon-front-point',tooth,(_,f)=>f===0?kit.gaiter:kit.metal,kit.gaiter,kit.metal);
    }
    // Local +Z faces away from the wall. The steel curves back to the
    // working point at (0,1,0), leaving knuckle clearance under the head.
    const handle=variant==='ink'?'#ba6b35':variant==='paper'?'#ea8233':'#f38a28';
    const steel=variant==='ink'?'#383e40':'#293e4b', bevel=variant==='ink'?'#a7aaa1':'#b6d5d5';
    add('axe'+i,'axe-shaft',rings(hexagon,[[-.15,.10,.11,.04],[-.10,.071,.064,.017],
      [.18,.068,.065,.065],[.47,.056,.061,.24],[.89,.058,.066,.40],[1.08,.068,.071,.49]]),
      (r,f)=>r<2?kit.web:r===4?steel:f===0?tint(handle,'#ffd287',.55):handle,kit.web,steel);
    const pickSections=[[.035,.992,1.042,.013],[.18,1.014,1.121,.034],
      [.31,1.045,1.165,.044],[.50,1.020,1.160,.063],[.58,1.028,1.135,.065]];
    const blade=pickSections.map(([z,lo,hi,w])=>[[-w,lo,z],[w,lo,z],[w,hi,z],[-w,hi,z]]);
    blade.unshift([[0,1,0],[.008,1,.007],[.008,1.011,.010],[-.008,1.011,.010]]);
    add('axe'+i,'ice-pick',blade,(_,f)=>f===2?bevel:steel,steel);
    const adze=[[.48,1.067,1.137,.069],[.64,1.078,1.145,.094],[.82,1.030,1.077,.17]]
      .map(([z,lo,hi,w])=>[[-w,lo,z],[w,lo,z],[w,hi,z],[-w,hi,z]]);
    add('axe'+i,'ice-adze',adze,(_,f)=>f===2?bevel:steel,steel,bevel);
    if (rank===1 && i===1) continue;
    const shaft=rings(triangle,[[0,.043,.045],[.100,.018,.018],[.878,.014,.014],
      [.899,.077,.064],[.913,.016,.014],[1,.006,.006]]);
    add('pole'+i,'pole',shaft,r=>r===0||r===3?kit.web:r===1?kit.metal:kit.gaiter,kit.web);
  }
  return parts;
}
