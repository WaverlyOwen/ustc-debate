// A few windswept shoulders carry a bank of hard snow. Its bright upper lip
// follows the slope across the mountain while its scalloped lee side deepens
// downslope. Coordinates use the same east/forward survey as the ridge mesh.
const snowBanks = [
  // Left tip x/z, length across the slope, fall along the lip, lee depth.
  [-58, 10, 8, -2.0, 1.4], [-49, 24, 9, -2.7, 2.1],
  [-40, 3, 10, -2.0, 1.6], [-31, -3, 9, -1.8, 1.9],
  [-23, -8, 9, -2.9, 1.6], [-12, -6, 7, -2.0, 1.5],
  [-5, -5, 7, 2.4, 1.7], [3, 11, 10, 3.1, 2.1],
  [11, -5, 8, 1.9, 1.4], [20, -2, 11, 2.7, 1.8],
  [29, 5, 9, 3.0, 1.6], [38, 21, 10, 2.5, 1.8], [49, 7, 10, 2.7, 1.5],
];

// Each station is a fraction of the lip's span, its bend in plan, and the
// width of the blue facet underneath. Both edges meet exactly at the tips.
const bankProfiles = [
  [[0,0,0],[.18,-.19,.11],[.36,-.36,.48],[.54,-.28,.22],[.69,-.38,.88],[.82,-.24,.29],[1,0,0]],
  [[0,0,0],[.13,-.10,.16],[.32,-.43,.72],[.47,-.35,.29],[.68,-.27,.38],[.87,-.13,.11],[1,0,0]],
  [[0,0,0],[.24,-.34,.18],[.40,-.39,.27],[.58,-.23,.71],[.74,-.18,.57],[.88,-.05,.22],[1,0,0]],
];

export function drawSnowBanks(mark, blade) {
  snowBanks.forEach(([x,z,span,fall,depth], index) => {
    const profile = bankProfiles[index % bankProfiles.length];
    const point = (t, offset) => [x + span*t, z + fall*t + depth*offset];
    const lip = profile.map(([t,bend]) => point(t,bend));
    const inner = profile.slice(1,-1);
    const face = inner.map(([t,bend,width]) => point(t,bend + width));
    mark([...lip, ...face.reverse()], 'snow', 'rime');
    const bevel = inner.map(([t,bend,width]) => point(t,bend - .28*width));
    mark([...lip, ...bevel.reverse()], 'snow', 'spark');
  });

  // In the lee of each shoulder the shorter grooves converge into a longer
  // flute. Their staggered heads leave broad areas of untouched snow.
  const flutes = [
    [-53,12,-1.5,6.2], [-43,20,-2.1,5.4], [-37,-3,-2.3,6.8],
    [-26,-7,-2.4,5.5], [-16,-11,-1.9,5.1], [-7,-7,-1.1,5.8],
    [3,-6,1.7,6.1], [13,-7,2.1,6.4], [22,-6,2.5,5.8],
    [33,1,2.7,7.3], [43,17,2.1,6.2], [55,5,3.0,6.4],
  ];
  for (const [x,z,drift,run] of flutes) {
    const wind = Math.sign(drift);
    for (const [offset,start,length,width] of [[0,0,1,.16],[.62,.24,.51,.11],[1.01,.17,.28,.065]]) {
      const xx = x + drift*start + offset*wind, zz = z + run*start;
      blade(xx,zz,drift*length-offset*wind*.39,run*length,width,wind*.31,'snow','rime');
      if (offset === 0) blade(xx-wind*.11,zz+.13,drift*.78,run*.76,.12,wind*.23,'snow','spark');
    }
  }
}

// These lenses follow the folded stratigraphic height already carried by each
// survey vertex (component 4). The same layer therefore changes direction as
// it wraps around a buttress and disappears naturally beneath the snow.
const beds = [
  // Centre x, half-span, stratigraphic height, local dip, half-thickness.
  [-50,11,12.2,.14,.83], [-35,12,23.8,-.12,1.08], [-27,14,34.7,-.12,1.03],
  [-15,10,43.4,.18,1.21], [-9,14,26.9,.21,1.08], [1,9,46.1,-.11,1.24],
  [8,12,32.8,-.06,1.18], [22,12,35.7,.18,.96], [33,13,24.0,.07,1.12],
  [45,12,15.9,-.17,1.04], [60,9,10.6,-.10,.74],
];

export function drawRockBeds(poly, pigments, clip, details) {
  const xs = poly.map(point => point[0]), left = Math.min(...xs), right = Math.max(...xs);
  for (const [center,span,level,dip,thickness] of beds) {
    if (right <= center-span || left >= center+span) continue;
    const section = poly.map(point => {
      const across = (point[0]-center)/span;
      const x = point[0], z = point[2];
      const fault = Math.sin(x*.52 + z*.31);
      const width = thickness*(1-Math.abs(across))*(.76+.24*fault);
      const height = point[4]-level-dip*(x-center)+.46*fault;
      // A darker wedge below the exposed lip comes to a point against a
      // diagonal joint. Only one end catches a small streak of light.
      const joint = across + .16*Math.sin(z*.33+center);
      const leftLens = Math.min(width,(-joint-.15)*span*.27);
      const rightLens = Math.min(width,(joint-.23)*span*.20);
      const rightHeight = height + .37*thickness;
      const cap = thickness*(.37-Math.abs(across+.52))*.45;
      return [x,point[1],z, height+leftLens,-height,
        rightHeight+rightLens*.58,-rightHeight, height-.09*width,.09*width+cap-height];
    });
    function band(lower, upper, pigment) {
      const piece = clip(clip(section,lower,0,true),upper,0,true);
      if (piece.length > 2) details.push({points:piece.map(point=>point.slice(0,3)), color:pigments[pigment]});
    }
    band(3,4,'cut');
    band(5,6,'cut');
    band(7,8,'ore');
  }
}

// Rockfall leaves groups of small angular fragments just over the contact
// between bedrock and snow. The largest exposed flake gets a second plane.
export function drawTalus(poly, seed, hash, mark) {
  const boundary = poly.filter(point => Math.abs(point[3]) < 1e-7);
  if (boundary.length !== 2) return;
  const [a,b] = boundary, dx=b[0]-a[0], dz=b[2]-a[2], length=Math.hypot(dx,dz);
  if (length < 1.1) return;
  const tx=dx/length, tz=dz/length;
  const inner=poly.find(point=>point[3]>.001);
  if (!inner) return;
  const sign=Math.sign(tx*(inner[2]-a[2])-tz*(inner[0]-a[0]));
  const origin=.25+.43*hash(seed,0,29);
  const point=(along,across)=>[a[0]+origin*dx+tx*along-sign*tz*across,
                               a[2]+origin*dz+tz*along+sign*tx*across];
  for (let i=0; i<6; i++) {
    const advance=.16+i*.18+.23*hash(seed,i,47), along=(hash(seed,i,32)-.5)*advance*2.0;
    const w=(.07+.10*hash(seed,i,53))*(i===4?1.75:1);
    const base=point(along-w,advance+w*.22), crown=point(along-w*.15,advance-w*.75);
    const toe=point(along+w,advance+w*.06);
    mark([base,crown,toe,point(along+w*.40,advance+w*.55)],'stone');
    if (i===4 || i===1) mark([base,crown,point(along+w*.22,advance+w*.14)],'ore');
  }
}

// Each shelf starts beside the ice at a different point on the actual pitch.
// Widths run across the fall line in world units and stay at boot-to-body scale
// even when the length of a pitch changes. The caller clips them to solid snow.
export function drawIceShoulders(mark) {
  // From/to along the pitch, two distances from its edge, lateral bow and
  // thickness. Long slips of firn sit obliquely beside shorter broken lips.
  const shelves = [
    [1,-.97,-.60,4.5,2.5,-.62,.24], [1,-.72,-.51,3.9,2.9,-.20,.11],
    [-1,-.68,-.35,1.6,.4,.42,.16],
    [-1,-.22,.04,1.2,3.3,.32,.18], [-1,.07,.36,3.8,2.2,-.40,.24],
    [-1,.52,.68,3.2,4.1,.21,.13], [-1,.67,1.03,2.4,3.9,-.64,.27],
    [1,-.10,.26,4.8,2.4,.48,.27], [1,.36,.61,2.4,3.9,-.42,.19],
    [1,.57,.72,4.5,5.1,-.16,.11], [1,.41,.76,6.9,5.5,.62,.20],
    [1,.79,1.12,3.8,2.2,-.59,.26],
  ];
  for (const [sign,start,end,near,far,bow,thickness] of shelves) {
    const point=(t,bend,side=0)=>[start+(end-start)*t,sign*(near+(far-near)*t+bow*bend+side*thickness)];
    const edge=[point(0,0),point(.26,.57),point(.44,1),point(.71,.73),point(1,0)];
    mark([...edge,point(.66,.72,.38),point(.42,.96,1),point(.22,.48,.25)],'shade');
    mark([...edge,point(.71,.73,-.20),point(.49,.98,-.44),point(.20,.48,-.16)],'light');
  }
}
