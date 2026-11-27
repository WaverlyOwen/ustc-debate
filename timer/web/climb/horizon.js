const NS = 'http://www.w3.org/2000/svg';
let nextHorizon = 0;

const palettes = {
  poster: {
    sky: ['#dda183', '#eeb693', '#f6c79e', '#ffe3aa', '#efbd9b'],
    far: ['#bc9393', '#deaf9d'], farSnow: '#fbd1aa', farShade: '#af8a91',
    middle: ['#93818c', '#cd9e96'], snow: '#ffe0ac', half: '#e5b398',
    shade: '#776f82', crag: '#b99398', mist: '#ffe3bf', cloud: '#ffebc5',
  },
  ink: {
    sky: ['#e8e1ca', '#f0ead5', '#f7efda', '#f6eed9', '#e2dfc9'],
    far: ['#d4d2bb', '#e8e4cd'], farSnow: '#f9f0db', farShade: '#c2c5b1',
    middle: ['#c5c7b3', '#e4e1cb'], snow: '#f9f1dd', half: '#e9e7d0',
    shade: '#aab2a0', crag: '#8d9a8b', mist: '#f5efd9', cloud: '#f8f2df',
  },
  paper: {
    sky: ['#9cc9cb', '#abd0ce', '#c1dfd7', '#dbe8d9', '#b6d5ca'],
    far: ['#a2bfbc', '#a2bfbc'], farSnow: '#dfebda', farShade: '#86aaa9',
    middle: ['#75a3a2', '#75a3a2'], snow: '#e7efdc', half: '#bed9cb',
    shade: '#618c91', crag: '#9abeb7', mist: '#d3e4d7', cloud: '#e9efe0',
  },
};

function element(parent, name, attributes = {}) {
  const node = parent.ownerDocument.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  parent.appendChild(node);
  return node;
}

function path(parent, d, fill, opacity = 1) {
  return element(parent, 'path', { d, fill, opacity });
}

function gradient(defs, id, name, attributes, stops) {
  const node = element(defs, name, { id, ...attributes });
  for (const [offset, color, opacity = 1] of stops) {
    element(node, 'stop', { offset, 'stop-color': color, 'stop-opacity': opacity });
  }
  return 'url(#' + id + ')';
}

// One continuous skyline keeps the passes and buttresses connected across the view.
const farCrest = `M-1150 455 L-1050 426 -997 437 -917 376 -887 392 -833 374 -761 413 -705 397 -625 411
 -531 365 -506 379 -492 376 -434 413 -387 399 -354 419 -280 402 -236 424 -165 395
 -124 404 -61 352 -46 363 -29 357 11 383 28 382 59 398 90 384 102 389 132 369
 143 370 169 343 183 353 211 350 242 374 260 371 299 402 341 389 364 398
 382 390 407 394 428 379 443 381 467 361 478 367 490 358 516 376 535 370
 558 393 570 395 593 411 620 404 649 419 681 399 710 402 756 370 769 374
 800 346 816 359 834 354 864 380 876 376 899 396 927 383 951 393 973 379
 988 382 1019 362 1030 366 1055 348 1077 363 1092 362 1113 380 1128 379
 1155 397 1194 388 1212 400 1250 388 1282 395 1305 382 1324 383 1364 353
 1375 363 1391 354 1416 373 1431 369 1474 399 1522 378 1560 391 1620 357
 1649 376 1670 369 1726 403 1779 385 1859 406 1935 363 1980 381 2028 373
 2091 414 2125 395 2180 414 2279 372 2301 383 2360 371 2490 433 2620 417
 V1500 H-1150 Z`;

const farLit = `M-61 352 l-41 58 24-17 7-15 14-9 11-6 Z
 M132 369 l-25 35 26-17 11-17 Z M169 343 l-33 44 19-13 4-9 12-6 12-6 Z
 M467 361 l-31 34 26-12 10-9 6-7 Z M490 358 l-12 18 8-3 11 5 13 2 Z
 M800 346 l-41 51 23-13 13-18 13-6 8-1 Z M834 354 l-22 30 15-7 3-7 17 3 Z
 M1019 362 l-37 33 28-15 10-7 10-7 Z M1055 348 l-45 52 23-15 9-15 17-9 18 2 Z
 M1364 353 l-43 45 25-12 13-15 16-8 Z M1391 354 l-21 30 16-8 5-9 17 2 Z
 M1620 357 l-46 45 30-15 13-17 14-5 Z`;

const farFacets = `M169 343 l14 10 28-3 18 14-24-7-10 6-11-3 15 21-25-20 Z
 M490 358 l26 18 19-6 18 19-19-12-7 6-22-14 6 14 Z
 M756 370 l13 4 31-28-17 24-15 11 Z M834 354 l30 26 12-4 18 17-24-13-10 5-16-18 Z
 M1055 348 l22 15 15-1 19 17-28-12-6 5-13-14 Z M1391 354 l25 19 15-4 21 15-27-10-8 5 Z`;

const middleCrest = `M-1150 506 L-980 426 -905 442 -827 378 -788 411 -720 385 -652 430 -573 408
 -504 443 -461 411 -388 436 -330 373 -305 389 -278 377 -245 407 -218 401 -180 424
 -147 416 -116 399 -91 407 -72 396 -45 399 -18 375 2 372 28 350 42 354 59 342
 80 350 100 336 110 339 141 315 153 318 172 296 182 292 193 277 200 284
 210 308 224 314 239 337 251 341 269 358 286 360 305 375 323 380 351 406
 365 410 377 421 391 416 413 426 426 423 457 439 486 439 521 456 543 455
 580 477 612 469 647 483 684 480 720 489 747 483 769 488 808 476 830 480
 866 468 880 470 902 455 929 455 952 440 974 438 993 423 1007 427 1020 418
 1041 417 1062 402 1078 407 1100 385 1110 388 1135 355 1144 359 1160 342
 1174 337 1196 306 1209 314 1218 312 1231 326 1248 328 1264 351 1284 353
 1315 377 1331 374 1365 392 1389 383 1415 388 1435 368 1454 370 1483 343
 1494 346 1518 326 1539 341 1563 342 1582 365 1603 369 1628 395 1651 393
 1685 418 1714 406 1740 413 1793 377 1817 381 1851 350 1874 374 1915 370
 1944 403 1969 397 2024 429 2068 412 2120 443 2210 394 2260 418 2310 389
 2371 431 2490 407 2620 480 V1500 H-1150 Z`;

// Highlights follow individual arêtes down the faces. Separate shapes leave exposed rock between snowfields.
const middleSnow = `M-330 373 l-35 49 23-15 11-17 12 7 14-8 Z
 M-18 375 l-53 54 29-16 18-26 23-9 5-11 -6 5 Z
 M59 342 l-57 72 25-19 10-17 11-4 5-12 16-6 11-6 Z
 M141 315 l-23 31-18 11-13 25 20-16 14-7 7-13 17-6 8-22 Z
 M193 277 l-11 15-10 4-19 22-8 22-19 25-13 7-21 31 34-26 16-7 9-14 11-8
 8-20 8-5 6-16 9-7 5 5 5 2-9-23 Z
 M153 346 l-12 20-14 14-3 7 12-8 11-9 17-12 14-24-14 17 Z
 M178 330 l-9 22 13-10 6-15 11-13-12 9 Z
 M224 314 l-11 26 1 8 10-14 9-5 Z M251 341 l-6 12-19 18 17-7 13-15 13 9 Z
 M305 375 l-27 30-18 12 17-5 15-11 10-13 10-5 Z
 M1135 355 l-25 33-10-3-22 22 19-8 9-8 7 1 22-22 13-6 8-15-12 10 Z
 M1196 306 l-22 31-14 5-18 23-13 22-10 8-4 12 20-14 10-17 15-10 7-12 18-9
 7-11 12-7 5-13 Z
 M1218 312 l-8 13-16 10-19 27 18-14 9-9 14-5 11-13 Z
 M1231 326 l-18 24-6 19 13-15 5-13 13-7 10-6 Z
 M1166 361 l-13 21-16 13 8-4 17-11 14-20 7-10 Z
 M1264 351 l-19 27 14-10 10-11 15-4 Z M1315 377 l-21 24 15-8 8-9 14-10 Z
 M1483 343 l-34 41 20-10 14-20 11-8 Z M1518 326 l-25 34-17 14-8 15 25-19 11-17 23-15 Z
 M1851 350 l-43 56 20-14 19-25 16-4 Z`;

const middleShadow = `M-18 375 l20-3 26-22-12 19-3 16-17 10 Z
 M59 342 l21 8 20-14-12 22-15 9 3-10-9-8 Z
 M193 277 l7 7 10 24 14 6-11 26-16 23 6-21-3-10 8-18-9-9 1-10 Z
 M224 314 l15 23 12 4-6 12-17 16 7-19-5-5 2-10 Z
 M269 358 l17 2 19 15-11 9-14 22 8-22-16-5-10 5 9-13 Z
 M305 375 l18 5 28 26-18-7-13 19 3-15-12-2 8-12 Z
 M1007 427 l13-9 21-1 21-15-13 19-18 6-13 13 3-11 Z
 M1196 306 l13 8-5 13-14 10-9 18-9 4 9-19 14-15 Z
 M1218 312 l13 14-18 24-8 24-16 20 9-24 7-13 4-17 9-14 Z
 M1248 328 l16 23-19 27-18 16 9-20 12-16-7 3 12-18 Z
 M1284 353 l31 24-18 19-15 8 8-15 13-11-18-12-11 2 Z
 M1518 326 l21 15 24 1 15 17-23-9-16 13 5-14-21-11 Z`;

const middleRock = `M43 373 l-9 20-20 18 13-5 14-14 8-14 Z
 M93 380 l-14 12-13 19 15-12 17-18 Z M110 385 l-21 21-18 12 17-7 15-12 Z
 M176 362 l-9 19-12 19 20-19 5-15 Z M182 354 l7-14 5-3-6 14 Z
 M212 365 l-14 20-4 13 11-14 12-20 Z M251 370 l-10 18-18 15 14-5 12-15 Z
 M1129 408 l-16 15-13 8 12-4 11-8 Z M1158 392 l-17 28 11-10 10-16 Z
 M1185 374 l-12 22-17 18 17-11 17-31 Z M1246 385 l-13 17-7 15 17-20 Z`;

const shelves = 'M-22 428 l32-8 28-16-20 18-19 3-14 8 Z M143 387 l-13 17-36 29 25-16 15-6 19-29 Z M261 407 l-14 14-20 12 21-6 19-22 Z M1080 436 l32-12 15-11-11 15-29 10 Z M1201 389 l-15 24-19 15 13-4 15-16 10-23 Z M1301 410 l-26 18-17 6 17-1 16-9 Z';

function line(parent, d, color, width, opacity) {
  return element(parent, 'path', {
    d, fill: 'none', stroke: color, 'stroke-width': width, opacity,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  });
}

// Short, slightly bowed marks follow individual wedges of rock like an engraved plate.
function engravedFaces(parent, runs, strength) {
  let hatching = '';
  for (const [x, y, count, step, slope, dx, dy] of runs) {
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const weight = 0.3 + 0.7 * Math.sin(Math.PI * t);
      const px = x + i * step, py = y + i * slope + Math.sin(i * 0.73);
      const ex = dx * weight, ey = dy * weight + Math.sin(i * 1.23) * 2;
      hatching += `M${px.toFixed(1)} ${py.toFixed(1)} q${(ex*0.35).toFixed(1)} ${(ey*0.62).toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
    }
  }
  line(parent, hatching, '#526960', 1.05, strength);
}

const distantEngravings = [
  [166, 351, 12, 2.5, 0.8, -9, 18], [484, 368, 12, 2.7, 0.6, -5, 17],
  [802, 355, 16, 2.9, 0.55, -8, 19], [1049, 360, 14, 2.5, 0.35, -9, 14],
  [1360, 362, 13, 2.8, 0.45, -6, 16],
];
const nearEngravings = [
  [36, 360, 18, 2.5, -0.35, -10, 20], [115, 349, 17, 2.5, -1.25, -14, 25],
  [187, 311, 19, 2.3, 1.2, -13, 34], [221, 350, 20, 2.5, 1.1, -18, 30],
  [267, 378, 19, 2.4, 0.95, -21, 27], [320, 406, 16, 2.7, 0.9, -23, 21],
  [1087, 426, 21, 2.5, -1.45, -15, 24], [1147, 381, 25, 2.2, -1.6, -14, 29],
  [1211, 332, 20, 2.1, 1.25, -12, 30], [1257, 367, 20, 2.5, 0.7, -17, 29],
  [1303, 394, 20, 2.6, 0.65, -23, 22], [1490, 361, 16, 2.6, -1.2, -13, 24],
];

// Preserve the endpoints of each ridge segment while giving each paper edge a little broken fiber.
function tornCrest(d) {
  const vertices = d.split('V')[0].match(/-?\d+/g).map(Number);
  let rough = 'M' + vertices[0] + ' ' + vertices[1] + ' L';
  for (let i = 2; i < vertices.length; i += 2) {
    const x = vertices[i], y = vertices[i+1];
    const dx = x - vertices[i-2], dy = y - vertices[i-1];
    const steps = Math.ceil(Math.hypot(dx, dy) / 10);
    for (let j = 1; j < steps; j++) {
      const t = j / steps;
      const tooth = Math.sin(i * 2.17 + j * 4.91) * 1.3;
      rough += (x - dx*(1-t)).toFixed(1) + ' ' + (y - dy*(1-t) + tooth).toFixed(1) + ' ';
    }
    rough += x + ' ' + y + ' ';
  }
  return rough + 'V1500 H-1150 Z';
}

function addRange(parent, defs, prefix, style, colors, distant) {
  const group = element(parent, 'g');
  const name = distant ? 'far' : 'middle';
  const crest = distant ? farCrest : middleCrest;
  const outline = style === 'paper' ? tornCrest(crest) : crest;
  const fill = style === 'paper' ? colors[name][0] : gradient(defs, prefix + name, 'linearGradient',
    { gradientUnits: 'userSpaceOnUse', x1: 0, x2: 0, y1: distant ? 340 : 285, y2: distant ? 485 : 590 },
    [[0, colors[name][0]], [1, colors[name][1]]]);
  if (style === 'paper') {
    path(group, outline, '#527876', 0.26).setAttribute('transform', 'translate(5 4)');
    path(group, outline, distant ? '#d0e0ce' : '#bbdbca').setAttribute('transform', 'translate(-2 -2.5)');
  }
  path(group, outline, fill);
  const clipId = prefix + name + '-clip';
  const cut = element(defs, 'clipPath', { id: clipId });
  path(cut, outline, '#fff');
  const faces = element(group, 'g', { 'clip-path': 'url(#' + clipId + ')' });
  const snow = distant ? farLit : middleSnow;
  const rock = distant ? farFacets : middleShadow;
  path(faces, rock, distant ? colors.farShade : colors.shade, style === 'ink' ? 0.58 : 0.84);
  if (style === 'paper') {
    path(faces, snow, '#527c82', 0.52).setAttribute('transform', 'translate(3.5 3.8)');
  }
  path(faces, snow, distant ? colors.farSnow : colors.snow, style === 'poster' && distant ? 0.84 : 1);
  if (!distant) {
    path(faces, middleRock, colors.crag);
    path(faces, shelves, colors.half);
  }
  if (style === 'ink') {
    line(faces, rock, '#6e8176', distant ? 0.75 : 1.05, distant ? 0.45 : 0.64);
    engravedFaces(faces, distant ? distantEngravings : nearEngravings, distant ? 0.40 : 0.80);
    line(group, outline, '#69796b', distant ? 0.90 : 1.35, distant ? 0.57 : 0.82);
  }
  return group;
}

const cirrus = [
  'M-170 217 C-62 206 54 201 145 192 S279 178 350 186 C299 180 257 187 201 195 S78 209 25 211 L-46 217Z M151 199 C220 194 272 180 316 183 C272 184 237 197 190 199Z',
  'M917 182 C1001 172 1040 155 1119 150 C1160 148 1216 153 1278 139 C1236 153 1165 155 1118 156 C1043 159 993 179 917 182Z M1081 162 C1142 154 1196 162 1254 149 C1204 164 1152 162 1117 164Z',
  'M1099 255 C1175 251 1230 235 1309 236 C1392 238 1471 217 1568 217 C1470 225 1399 242 1315 241 C1248 240 1180 255 1099 255Z',
];

const etchedClouds = `M-80 222 C-18 218 49 212 93 209 M105 208 C177 207 219 189 281 190
 M212 198 C236 192 256 190 273 190 M895 186 C952 182 1015 167 1058 164
 M1075 161 C1143 147 1173 157 1226 149 M1184 161 C1217 157 1236 156 1264 147
 M1079 261 C1151 258 1211 244 1262 243 M1271 243 C1350 243 1387 236 1447 229`;

const sunVeils = 'M-58 15 Q-31 14-7 16 T42 16 Q24 18-5 18 T-58 15Z M-46 25 Q-24 23 2 24 L31 25 Q10 27-16 26Z';

function addSun(parent, defs, prefix, style) {
  const light = element(parent, 'g');
  if (style === 'poster') {
    const glow = gradient(defs, prefix + 'glow', 'radialGradient', {},
      [[0, '#ffe1a1', 0.84], [0.28, '#ffe5a5', 0.38], [0.7, '#ffe8b8', 0.11], [1, '#ffe1a1', 0]]);
    element(light, 'circle', { r: 202, fill: glow });
    const disk = gradient(defs, prefix + 'disk', 'linearGradient', { x2: 0, y2: 1 },
      [[0, '#fff8d6'], [0.74, '#fff0b3'], [1, '#ffdd93']]);
    element(light, 'circle', { r: 34, fill: disk });
    path(light, sunVeils, '#e8af87', 0.47);
  } else if (style === 'ink') {
    element(light, 'circle', { r: 34, fill: '#efd9aa', stroke: '#9e9169', 'stroke-width': 1.1 });
    line(light, 'M-30-22 C-14-42 14-42 31-19 M31 18 Q27 25 21 29', '#b2a37a', 0.8, 0.76);
    line(light, 'M-30 13 Q-18 12-8 13 M-26 16 Q-13 15 3 16 M-26 19 Q-8 18 9 19 M-22 22 Q-6 21 14 22 M-19 25 Q-4 24 12 25 M-13 28 Q-3 27 5 28', '#9d8c65', 0.88, 0.62);
  } else {
    const disc = 'M0-34 L9-33 18-29 25-23 30-16 33-8 34 2 32 11 28 19 22 26 13 31 4 34 -6 34 -15 31 -23 25 -29 18 -33 9 -34-1 -33-10 -29-18 -23-25 -15-30 -8-33Z';
    path(light, disc, '#628f89', 0.38).setAttribute('transform', 'translate(3.5 4.5)');
    path(light, disc, '#fff0c5');
    path(light, 'M-28-17 l5-8 9-5 13-4 12 1-12 .8-13 4.2Z', '#fff8dd');
  }
  return light;
}

const valleyMist = [
  'M-342 452 C-204 437-85 448 21 459 C125 471 188 465 264 449 C324 437 355 438 402 442 C338 441 317 451 260 462 C184 478 108 478 16 468 C-127 452-221 454-342 464Z',
  'M830 471 C928 460 977 440 1040 439 C1092 439 1131 448 1200 441 C1290 432 1370 409 1515 423 C1393 419 1315 437 1213 451 C1141 462 1083 447 1041 447 C976 446 922 471 830 471Z',
  'M-175 506 C-49 494 40 490 130 503 C205 512 264 509 334 498 C398 486 462 491 532 502 C434 496 393 496 333 508 C246 525 180 522 119 514 C36 504-77 503-175 514Z',
  'M916 527 C1005 520 1079 494 1177 492 C1250 492 1322 505 1423 486 C1505 470 1578 470 1689 475 C1600 475 1538 477 1435 497 C1328 519 1246 504 1180 505 C1090 506 1006 528 916 527Z',
];

// Cold air pools behind the closer range. The upper bank breaks into two
// separate wind shelves, leaving the shape of the distant passes visible.
const cloudBank = [
  'M-250 428 Q-99 411 37 427 T289 424 Q374 417 453 427 Q375 424 299 432 Q169 450 37 434 T-250 438Z',
  'M755 448 Q847 432 926 432 Q1006 431 1068 416 Q1141 399 1230 406 Q1343 421 1431 401 Q1524 385 1664 400 Q1557 393 1450 414 Q1342 433 1232 416 Q1144 411 1072 426 Q999 440 927 440 Q834 440 755 452Z',
];

export function mountHorizon(svgGroup, style) {
  if (!Object.hasOwn(palettes, style)) style = 'poster';
  const colors = palettes[style];
  const prefix = 'climb-horizon-' + ++nextHorizon + '-';
  const defs = element(svgGroup, 'defs');
  const sky = gradient(defs, prefix + 'sky', 'linearGradient', { x2: '0', y2: '1' },
    [0, 0.27, 0.48, 0.66, 1].map((offset, i) => [offset, colors.sky[i]]));
  const field = element(svgGroup, 'rect', { x: 0, y: 0, fill: sky });
  const light = addSun(svgGroup, defs, prefix, style);
  const clouds = element(svgGroup, 'g');
  for (const d of cirrus) {
    if (style === 'paper') {
      path(clouds, d, '#74a8a4', 0.45).setAttribute('transform', 'translate(2.8 3.3)');
      path(clouds, d, colors.cloud);
    } else {
      path(clouds, d, colors.cloud, style === 'ink' ? 0.9 : 0.73);
      if (style === 'ink') line(clouds, d, '#8d9680', 0.95, 0.53);
    }
  }
  if (style === 'ink') line(clouds, etchedClouds, '#7f8d79', 1.05, 0.59);
  const far = addRange(svgGroup, defs, prefix, style, colors, true);
  const bank = element(svgGroup,'g');
  for (const d of cloudBank) {
    if (style==='paper') path(bank,d,'#719797',.29).setAttribute('transform','translate(1.5 2.3)');
    path(bank,d,colors.mist,style==='paper'?.78:style==='ink'?.81:.52);
    if (style==='ink') line(bank,d,'#a0a592',.57,.39);
  }
  const middle = addRange(svgGroup, defs, prefix, style, colors, false);
  const mist = element(svgGroup, 'g');
  for (const [i, d] of valleyMist.entries()) {
    if (style === 'paper') {
      path(mist, d, '#557f80', 0.38).setAttribute('transform', 'translate(3 4)');
      path(mist, d, i < 2 ? colors.mist : '#b8d2c6');
    } else {
      path(mist, d, colors.mist, style === 'ink' ? 0.72 : i < 2 ? 0.32 : 0.22);
      if (style === 'ink') line(mist, d, '#9aa18c', 0.8, 0.5);
    }
  }

  let lastWidth, lastHeight;
  return function update({ width, height, yaw = 0, pitch = 0, focusX = 0, focusY = 0, time = 0 }) {
    if (width !== lastWidth || height !== lastHeight) {
      field.setAttribute('width', width);
      field.setAttribute('height', height);
      lastWidth = width;
      lastHeight = height;
    }
    const scaleX = Math.max(width / 1440, Math.min(height / 820, width / 960));
    const scaleY = Math.min(height / 800, scaleX * 1.25);
    const horizontal = -Math.sin(yaw) * 175 - Math.tanh(focusX / 24) * 42;
    const vertical = Math.sin(pitch) * 92 + Math.tanh(focusY / 36) * 42;
    const centerX = width / 2;
    const horizonY = height * 0.52;
    const position = (layer, depth, drift = 0) => {
      const x = centerX + (horizontal * depth + drift - 720) * scaleX;
      const y = horizonY + (vertical * depth - 416) * scaleY;
      layer.setAttribute('transform', `matrix(${scaleX} 0 0 ${scaleY} ${x} ${y})`);
    };
    const diskScale = Math.min(width / 805, height / 680);
    light.setAttribute('transform', `translate(${width * 0.365 + horizontal * 0.17 * scaleX} ${height * 0.255 + vertical * 0.15 * scaleY}) scale(${diskScale})`);
    const drift = Math.sin(time / 94) * 10;
    position(clouds, 0.26, drift);
    position(far, 0.48);
    position(bank, 0.57, drift*.59);
    position(middle, 0.72);
    position(mist, 0.77, drift * 1.45);
  };
}
