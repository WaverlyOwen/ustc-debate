"""Exercise the real Pages module graph with outbound network access blocked."""
import json
import re
import unittest
from html import unescape

from run_js_tests import find_browser
from test_export import dump, serve_pages


@unittest.skipUnless(find_browser(), "needs Edge or Chrome")
class Web3DTests(unittest.TestCase):
    def test_preview_pauses_rendering_and_scrubs_at_selected_speed(self):
        scheduler = """<script>
const previewFrames = new Map(); let frameId = 0, now = performance.now();
Object.defineProperty(performance,'now',{value:()=>now});
window.sceneCalls = []; window.matchCalls = [];
window.requestAnimationFrame = callback => {previewFrames.set(++frameId,callback); return frameId;};
window.cancelAnimationFrame = id => previewFrames.delete(id);
function step(ms=50) {
  now += ms;
  const callbacks = [...previewFrames.values()]; previewFrames.clear();
  for (const callback of callbacks) callback(now);
}
</script>"""
        probe = """<output id="result"></output><script type="module">
import './preview.js';
import {createMatchView} from './match-view.js';
const result = document.getElementById('result'), errors = [];
step();
document.getElementById('play').click();
for (let i=0;i<5;i++) step();
document.getElementById('play').click();
const beforePause = sceneCalls.length;
for (let i=0;i<45;i++) step();
if (sceneCalls.length-beforePause !== 1 || previewFrames.size)
  errors.push('idle draws '+(sceneCalls.length-beforePause));
const speed = document.getElementById('speed'), seek = document.getElementById('seek');
for (const rate of [1,12,24,60]) {
  speed.value = rate; speed.dispatchEvent(new Event('change'));
  seek.value = 2000; seek.dispatchEvent(new Event('input')); step();
  const {motion,elapsed} = sceneCalls.at(-1);
  if (!elapsed || Math.abs(motion-elapsed/rate)>1e-6) errors.push('wrong motion at '+rate+'x');
}
const host = document.body.appendChild(document.createElement('div'));
for (const hz of [60,120]) {
  document.getElementById('play').click(); step(0);
  const match = createMatchView(host,'poster');
  match.update({phase:'running',running:true,active:'pro',stageSide:'pro',progress:{pro:0,con:0},
    moving:{pro:true,con:false},clocks:{pro:'1:00',con:''},teams:{pro:'Pro',con:'Con'}});
  const views = [sceneCalls,matchCalls], starts = views.map(calls=>calls.length);
  for (let i=0;i<2*hz;i++) step(1000/hz);
  for (const [index,calls] of views.entries()) {
    const start = starts[index], name = index ? 'match' : 'preview';
    if (calls.length-start !== 48) errors.push(name+' drew '+(calls.length-start)+' at '+hz+' Hz');
    for (let i=start;i<calls.length;i++) {
      if (Math.abs(calls[i].dt-(calls[i].at-calls[i-1].at)/1000)>1e-6) errors.push(name+' wrong dt');
    }
  }
  const beforeDelay = views.map(calls=>calls.length);
  step(160); step(.2);
  if (views.some((calls,i)=>calls.length!==beforeDelay[i]+1 || Math.abs(calls.at(-1).dt-.16)>.00001))
    errors.push('late frame caught up with extra draws or wrong dt at '+hz+' Hz');
  Object.defineProperty(document,'hidden',{configurable:true,value:true});
  document.dispatchEvent(new Event('visibilitychange')); step(4000);
  Object.defineProperty(document,'hidden',{configurable:true,value:false});
  document.dispatchEvent(new Event('visibilitychange')); step(5);
  if (views.some((calls,i)=>calls.length!==beforeDelay[i]+2 || calls.at(-1).dt!==0))
    errors.push('visibility resumed with elapsed background time');
  document.getElementById('play').click(); step(); match.destroy();
}
result.textContent = errors.join(', ') || 'ok';
</script>"""
        with serve_pages() as (site, url):
            climb = site / 'web/climb'
            (climb / 'landscape.js').write_text("""
export function createLandscape(svg) {
  const group = svg.querySelector('[data-layer="mountain"]');
  if (group) group.innerHTML = '<path d="M0,0"/>';
  const calls = group ? window.matchCalls : window.sceneCalls;
  return (progress,motion,moving,shot,dt,snap,budget,clock) =>
    calls.push({motion,elapsed:clock?.now,dt,at:performance.now()});
}""", encoding='utf-8')
            source = (climb / 'study.html').read_text(encoding='utf-8')
            source = source.replace('<head>', '<head>'+scheduler).replace('</body>', probe+'</body>')
            (climb / 'preview-controls.html').write_text(source, encoding='utf-8')
            dom = dump(url+'web/climb/preview-controls.html?still=1')
        result = re.search(r'<output id="result">(.*?)</output>', dom, re.S)
        self.assertIsNotNone(result)
        self.assertEqual(unescape(result[1]), 'ok')

    def test_match_captions_and_progress_float_centered_over_the_mountain(self):
        probe = r"""<output id="result"></output><script type="module">
const screen = document.createElement('div');
screen.style.cssText = 'position:fixed;inset:0 auto auto 0;width:320px;height:844px';
document.body.append(screen);
const view = DT.render.mount(screen), stage = view.el;
function check(condition, message) { if (!condition) throw Error(message); }
function transparent(element) {
  const style = getComputedStyle(element);
  check(style.backgroundColor === 'rgba(0, 0, 0, 0)' && style.backgroundImage === 'none' &&
    !parseFloat(style.borderTopWidth) && !parseFloat(style.borderBottomWidth), 'Strip on '+element.className);
  for (const pseudo of ['::before','::after']) {
    const p = getComputedStyle(element,pseudo);
    check(p.display === 'none' || ['none','normal'].includes(p.content) ||
      (p.backgroundImage === 'none' && p.backgroundColor === 'rgba(0, 0, 0, 0)' &&
       !parseFloat(p.borderTopWidth) && !parseFloat(p.borderBottomWidth)), 'Strip on '+element.className+pseudo);
  }
}
function centered(nodes, label) {
  const bounds = stage.getBoundingClientRect();
  const rects = [...nodes].map(node => node.getBoundingClientRect()).filter(r => r.width && r.height);
  check(rects.length, 'Hidden '+label);
  const left = Math.min(...rects.map(r => r.left)), right = Math.max(...rects.map(r => r.right));
  check(left >= bounds.left-1 && right <= bounds.right+1, label+' clipped at '+bounds.width);
  check(Math.abs(left+right-bounds.left-bounds.right)<4, label+' off center at '+bounds.width);
}
try {
  const format = DT.BUILTIN_FORMATS.find(f => f.id === 'recruit-3v3');
  const session = DT.engine.createSession(format, {title:'校园辩论赛'}, 0, {theme:'climb-paper'});
  view.update(DT.engine.view(DT.engine.goto(session,0,0),0));
  await import('./web/climb/match-view.js');
  for (let i=0; i<40 && !stage.classList.contains('has-climb-view'); i++) await new Promise(r => setTimeout(r,20));
  check(stage.classList.contains('has-climb-view'), 'Match scene did not mount');
  for (const [width,height] of [[320,844],[1280,800]]) {
    screen.style.width=width+'px'; screen.style.height=height+'px';
    const round=stage.querySelector('.climb-round'), footer=stage.querySelector('.dt-bottom');
    for (let node=round; node && !node.classList.contains('dt-climb-host'); node=node.parentElement) transparent(node);
    for (const node of stage.querySelectorAll('.dt-top,.dt-bottom,.dt-progress,.dt-next')) transparent(node);
    centered(round.children,'round');
    centered(footer.querySelectorAll('.dt-next span'),'next stage');
    const markers=footer.querySelectorAll('.dt-seg');
    check(markers.length === format.stages.length && markers.length>=20,'Missing stages');
    check([...markers].every(n => n.getBoundingClientRect().width>=1),'Invisible stage');
    centered(markers,'progress');
    const fill = selector => getComputedStyle(footer.querySelector(selector)).backgroundColor;
    check(fill('[data-side="pro"]')!==fill('[data-side="con"]'),'Lost team colors');
    check(getComputedStyle(footer.querySelector('[data-kind="dual"]')).backgroundImage.includes('gradient'),
      'Lost dual stage colors');
    const current=getComputedStyle(footer.querySelector('[data-state="current"]'),'::after');
    check(current.display!=='none' && parseFloat(current.height)>0,'Missing current stage indicator');
  }
  document.getElementById('result').textContent='ok';
} catch (error) { document.getElementById('result').textContent=String(error); }
finally { view.destroy(); screen.remove(); }
</script>"""
        with serve_pages() as (site, url):
            source = (site / 'index.html').read_text(encoding='utf-8')
            (site / 'captions.html').write_text(source.replace('</body>', probe+'</body>'), encoding='utf-8')
            dom = dump(url + 'captions.html?frozen=1')
        result = re.search(r'<output id="result">(.*?)</output>', dom, re.S)
        self.assertIsNotNone(result)
        self.assertEqual(unescape(result[1]), 'ok')

    def test_climb_readouts_fit_their_sides_without_a_frame(self):
        page = r"""<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="match.css">
<div id="screen" style="container-type:size;position:relative">
<div class="dt-stage has-climb-view" style="position:absolute;inset:0"><div id="host"></div></div></div>
<output id="result"></output><script type="module">
import {createMatchView} from './match-view.js';
const screen = document.getElementById('screen'), host = document.getElementById('host');
const view = createMatchView(host,'paper'), stage = host.parentElement;
const base = {phase:'paused', teams:{pro:'Red',con:'Blue'}, progress:{pro:0,con:0}, still:true,
  active:'pro', dual:true, clocks:{pro:'9:59',con:'2:30'}};
function inspect(data, bell, sides) {
  stage.dataset.bellClock = bell;
  view.update({...base,...data});
  const boxes = [...host.querySelectorAll('.climb-clock:not([hidden])')];
  if (boxes.map(b => b.dataset.side).join('/') !== sides) throw Error('Clock placement: '+sides);
  const container = screen.getBoundingClientRect();
  let previousRight = container.left;
  return boxes.map(box => {
    const time = box.querySelector('.climb-time'), style = getComputedStyle(box), range = document.createRange();
    range.selectNodeContents(time);
    const rect = range.getBoundingClientRect();
    if (style.backgroundColor !== 'rgba(0, 0, 0, 0)' || style.boxShadow !== 'none' ||
        style.outlineStyle !== 'none' || ['Top','Right','Bottom','Left'].some(s => parseFloat(style['border'+s+'Width'])))
      throw Error('Visible clock frame: '+sides+' '+bell);
    if (!rect.width || rect.left < previousRight || rect.right > container.right+1)
      throw Error('Clipped or overlapping digits: '+time.textContent+' at '+container.width+' ('+rect.left+', '+rect.right+')');
    previousRight = rect.right;
    return parseFloat(getComputedStyle(time).fontSize);
  });
}
try {
  for (const [w,h] of [[320,568],[390,844],[1280,800]]) {
    screen.style.width = w+'px'; screen.style.height = h+'px';
    const [active,idle] = inspect({},'', 'pro/con');
    if (active <= idle || active < Math.min(w*.16,h*.20)) throw Error('Clock too small at '+w);
    inspect({active:'con',clocks:{pro:'+12345:59',con:'+12345:59'}},'con','pro/con');
    inspect({dual:false,stageSide:'con',mainClock:'+12345:59'},'main','con');
    inspect({dual:false,active:null,mainClock:'0:05',clockPhases:{main:'warn'}},'main','neutral');
  }
  document.querySelector('output').textContent = 'ok';
} catch(e) { document.querySelector('output').textContent = String(e); }
finally { view.destroy(); }
</script>"""
        with serve_pages() as (site, url):
            (site / 'web/climb/readout-test.html').write_text(page, encoding='utf-8')
            dom = dump(url + 'web/climb/readout-test.html')
        result = re.search(r'<output id="result">(.*?)</output>', dom, re.S)
        self.assertIsNotNone(result)
        self.assertEqual(unescape(result[1]), 'ok')

    def test_match_route_uses_the_actual_clocks_and_selected_seats(self):
        probe = r"""
<output id="result"></output><script>
addEventListener('load', () => {
  const result = document.getElementById('result');
  function check(condition, message) { if (!condition) throw Error(message); }
  try {
    const options = document.querySelectorAll('[data-theme-id^="climb-"]');
    check(options.length === 3, 'Three choices on the opening screen');
    document.querySelector('[data-action="swap-seats"]').click();
    for (const option of options) {
      option.click();
      const tile = option.querySelector('.dt-setup-thumb');
      const ring = getComputedStyle(tile,'::after');
      check(Math.abs(parseFloat(ring.width)-tile.clientWidth)<1 &&
        Math.abs(parseFloat(ring.height)-tile.clientHeight)<1, 'Selection border escaped '+option.dataset.themeId);
      check(document.querySelector('.dt-setup-seating').dataset.seat === 'left', 'Red team on left');
      check(document.querySelector('[data-action="swap-seats"]').disabled, 'Seats fixed for this theme');
    }
    document.querySelector('[data-theme-id="hall"]').click();
    check(document.querySelector('.dt-setup-seating').dataset.seat === 'right', 'Other seats restored');
    const E = DT.engine, format = {name:'Test', stages:[
      {id:'d',name:'Dual',type:'dual',secs:10}, {id:'p',name:'Pro',type:'single',side:'pro',secs:20},
      {id:'b',name:'Break',type:'break',secs:40}
    ]};
    let s = E.createSession(format, {}, 0, {theme:'climb-ink'});
    const route = now => E.view(s,now).ascent;
    check(route(0).secondsPerTeam.pro === 30 && route(0).secondsPerTeam.con === 10, 'Side budgets');
    s = E.floor(E.goto(s,0,0),'pro',0);
    s = E.floor(s,'con',3000);
    s = E.yieldTime(s,5000);
    s = E.pause(s,7000);
    check(route(9000).used.pro === 5 && route(9000).used.con === 2, 'Handoff, yield and pause');
    s = E.toggle(E.goto(s,2,9000),9000);
    check(route(12000).used.pro === 5 && route(12000).used.con === 2, 'Break gave nobody distance');
    s = E.reset(s,12000,0);
    check(route(12000).used.pro === 0 && route(12000).used.con === 0, 'Reset');
    s = E.undo(s,12000);
    check(route(12000).used.pro === 5 && route(12000).used.con === 2, 'Undo');
    s = E.toggle(E.goto(s,1,15000),15000);
    check(route(55000).used.pro === 25 && route(55000).used.con === 2, 'Overtime capped to stage budget');
    result.textContent='ok';
  } catch (error) { result.textContent=String(error); }
});
</script>"""
        with serve_pages() as (site, url):
            index = site / 'index.html'
            index.write_text(index.read_text(encoding='utf-8').replace('</body>', probe+'</body>'), encoding='utf-8')
            dom = dump(url)
        match = re.search(r'<output id="result">(.*?)</output>', dom, re.S)
        self.assertIsNotNone(match)
        self.assertEqual(unescape(match[1]), 'ok')

    def test_climbers_have_articulated_volume_and_planted_contacts(self):
        page = r"""<!doctype html><meta charset="utf-8"><output id="result"></output>
<svg width="1000" height="700"><g id="figures"></g></svg>
<script type="module">
const output = document.getElementById('result');
const check = (pass, message) => { if (!pass) throw Error(message); };
const subtract = (a,b) => a.map((v,i) => v-b[i]);
const dot = (a,b) => a.reduce((sum,v,i) => sum + v*b[i], 0);
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const along = v => v.map(x => x/Math.hypot(...v));
// A double-sided plane can look solid until the camera passes its edge.
// Weld coincident seam vertices before checking that every edge has two faces.
function closedVolume({vertices, faces}) {
  const spans = [0,1,2].map(axis => {
    const values = vertices.map(v => v[axis]);
    return Math.max(...values) - Math.min(...values);
  });
  if (Math.min(...spans) < 0.07 * Math.max(...spans)) return 0;
  const center = [0,1,2].map(i => vertices.reduce((sum,v) => sum + v[i], 0)/vertices.length);
  const keys = vertices.map(v => v.map(x => x.toFixed(5)).join(','));
  const edges = new Map();
  let volume = 0;
  for (const {indices} of faces) {
    for (let i=0; i<indices.length; i++) {
      const edge = [keys[indices[i]], keys[indices[(i+1)%indices.length]]].sort().join('/');
      edges.set(edge, (edges.get(edge) || 0) + 1);
    }
    const points = indices.map(index => subtract(vertices[index],center));
    for (let i=1; i+1<points.length; i++) volume += Math.abs(dot(points[0],cross(points[i],points[i+1])))/6;
  }
  const closed = [...edges.values()].every(count => count === 2);
  return closed && volume > 0.08 * spans.reduce((a,b) => a*b) ? volume : 0;
}
try {
  const [{createTerrain}, {createParties}, {createClimberModel}] = await Promise.all([
    import('./terrain.js'), import('./climbers.js'), import('./climber-model.js'),
  ]);
  const terrain = createTerrain('poster'), sample = createParties();
  // This section is open snow, beyond both ladder crossings and below the ice walls.
  const progress = {pro:.52, con:.48}, paused = {pro:false, con:false};
  const pose = sample(terrain,progress,3,paused,'poster'), leader = pose.members[0];
  const later = sample(terrain,progress,13,paused,'poster');
  for (const [i,member] of pose.members.entries()) {
    const other = later.members[i];
    check(member.bones.pole0, 'Missing the planted trekking pole');
    for (let foot=0; foot<2; foot++) {
      const bone = 'boot'+foot;
      const contacts = [[member.bones[bone].origin, other.bones[bone].origin]];
      if (member.bones['pole'+foot]) {
        const tips = [member,other].map(pose => {
          const {origin,y} = pose.bones['pole'+foot];
          const tip = origin.map((v,axis) => v+y[axis]);
          check(Math.hypot(...subtract(tip,pose.poles[foot].point)) < 1e-6, 'Pole missed its contact');
          return tip;
        });
        contacts.push(tips);
      }
      for (const [a,b] of contacts) {
        check(Math.hypot(...subtract(a,b)) < 1e-6, 'Resting contact slid on '+member.side+' '+member.rank);
        check(Math.abs(a[1]-terrain.surface(a[0],a[2])[1]) < 1e-5, 'Resting contact left the snow');
      }
    }
  }
  const bends = [];
  for (let step=0; step<12; step++) {
    const {bones} = sample(terrain,{...progress,pro:.34 + step*.002},3,{pro:true,con:false},'poster').members[0];
    bends.push(dot(along(bones.thigh0.y),along(bones.shin0.y)));
  }
  check(Math.max(...bends)-Math.min(...bends) > .025, 'Advancing the climber did not bend the knee');
  const model = createClimberModel(leader.person,'poster');
  const solids = ['torso','head'].map(bone => {
    const candidates = model.filter(piece => piece.bone === bone)
      .map(piece => ({piece, volume:closedVolume(piece)})).sort((a,b) => b.volume-a.volume);
    const frame = leader.bones[bone];
    const worldScale = Math.abs(dot(frame.x,cross(frame.y,frame.z)));
    const stature = Math.hypot(...subtract(leader.bones.head.origin,leader.bones.boot0.origin));
    check(candidates[0]?.volume * worldScale > .0015 * stature**3,
      bone+' needs a closed, body-sized three-dimensional mesh');
    return candidates[0].piece;
  });
  const figures = document.getElementById('figures');
  const visible = [];
  for (const angle of [.12, Math.PI/2+.12, Math.PI+.12]) {
    const {x,z,origin} = leader.bones.torso;
    const eye = along(x.map((v,i) => v*Math.sin(angle) + z[i]*Math.cos(angle) + (i===1 ? .12 : 0)));
    const right = along(cross([0,1,0],eye)), up = cross(eye,right);
    function project(point,out={}) {
      const relative = subtract(point,origin);
      return Object.assign(out,{x:500+35*dot(relative,right), y:350-35*dot(relative,up),
        depth:150-dot(relative,eye), scale:35});
    }
    pose.draw(figures,project);
    check(!figures.querySelector('image,use'), 'Found a sprite in the climber artwork');
    // Compare actual SVG outlines to the model's independently projected vertices.
    // A screen-aligned drawing would turn to face each camera.
    const visibleFaces = new Set();
    for (const solid of solids) {
      const frame = leader.bones[solid.bone];
      const points = solid.vertices.map(v => project(frame.origin.map((o,i) =>
        o + v[0]*frame.x[i] + v[1]*frame.y[i] + v[2]*frame.z[i])));
      const outlines = [...figures.querySelectorAll('path[data-part="'+solid.bone+'"]')].flatMap(path => {
        const d = path.getAttribute('d') || '';
        if (getComputedStyle(path).display === 'none') return [];
        return (d.match(/M[^MmZz]+/g) || []).map(loop => {
          const nums = (loop.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || []).map(Number);
          return nums.filter((_,i) => !(i%2)).map((x,i) => [x,nums[i*2+1]]);
        });
      });
      solid.faces.forEach(({indices},i) => {
        const seen = outlines.some(loop => indices.every(index =>
          loop.some(([x,y]) => Math.hypot(x-points[index].x,y-points[index].y)<0.16)));
        if (seen) visibleFaces.add(solid.bone+'/'+i);
      });
      check([...visibleFaces].some(key => key.startsWith(solid.bone+'/')),
        'Drawn '+solid.bone+' facets do not project from their bone in view '+angle);
    }
    visible.push(visibleFaces);
  }
  for (let i=0; i<visible.length; i++) {
    const other = visible[(i+1)%visible.length];
    check([...visible[i]].some(key => !other.has(key)), 'Orbiting never revealed different facets');
  }
  output.textContent = 'ok';
} catch (error) { output.textContent = String(error); }
</script>"""
        with serve_pages() as (site, url):
            (site / "web/climb/pose-test.html").write_text(page, encoding="utf-8")
            dom = dump(url + "web/climb/pose-test.html")
        match = re.search(r'<output id="result">(.*?)</output>', dom, re.S)
        self.assertIsNotNone(match, "the Pages pose test did not start")
        self.assertEqual(unescape(match[1]), "ok")

    def test_bridge_camera_handoffs_keep_the_rendered_view_continuous(self):
        page = """<!doctype html><output id="result"></output>
<svg width="640" height="400"><g id="horizon"></g><g id="mountain"></g><g id="tracks"></g><g id="parties"></g></svg>
<script type="module">
import { PerspectiveCamera, Vector3 } from '../vendor/three-0.187.0/build/three.core.js';
import { createLandscape } from './landscape.js';
const original=PerspectiveCamera.prototype.updateMatrixWorld;
let camera;
PerspectiveCamera.prototype.updateMatrixWorld=function(...args) { camera=this; return original.apply(this,args); };
try {
  const state={cameraTime:81}, draw=createLandscape(document.querySelector('svg'),'poster',state);
  const progress={pro:.337,con:.224}, dt=1/24;
  function frame(shot,elapsed,snap=false) {
    state.cameraTime+=elapsed;
    draw(progress,state.cameraTime,{pro:false,con:false},shot,elapsed,snap,180);
    return {eye:camera.position.clone(),direction:camera.getWorldDirection(new Vector3()),
      pivot:new Vector3(state.rig.x,state.rig.y,state.rig.z)};
  }
  for (const [from,to] of [['pro','con'],['con','pro']]) {
    let last=frame(from,0,true), step=new Vector3();
    for (let n=0;n<144;n++) {
      const next=frame(to,dt), distance=last.eye.distanceTo(last.pivot);
      const delta=next.eye.clone().sub(last.eye);
      if (delta.length()/distance>.10 || next.direction.angleTo(last.direction)>.042)
        throw Error(from+' camera jumped at frame '+n);
      last=next; step=delta;
      if (n===25) {
        const held=frame(from,0);
        if (held.eye.distanceTo(last.eye)>1e-6) throw Error('Handoff changed eye at zero elapsed time');
        const back=frame(from,dt), change=back.eye.clone().sub(held.eye).sub(step).length();
        if (change>Math.max(.15,step.length()*.36)) throw Error('Interrupted pan lost its velocity');
        last=back;
      }
    }
    const destination=frame(to,0,true);
    if (last.pivot.distanceTo(destination.pivot)>.8 || last.direction.angleTo(destination.direction)>.02)
      throw Error(from+' handoff missed the other party');
  }
  document.querySelector('output').textContent='ok';
} catch(e) { document.querySelector('output').textContent=String(e); }
finally { PerspectiveCamera.prototype.updateMatrixWorld=original; }
</script>"""
        with serve_pages() as (site, url):
            (site / 'web/climb/handoff-test.html').write_text(page, encoding='utf-8')
            dom = dump(url + 'web/climb/handoff-test.html')
        self.assertIn('<output id="result">ok</output>', dom[:2000])

    def test_overview_frames_the_peak_and_both_parties_on_the_larger_mountain(self):
        page = """<!doctype html><output id="result"></output>
<svg><g id="horizon"></g><g id="mountain"></g><g id="tracks"></g><g id="parties"></g></svg>
<script type="module">
import { PerspectiveCamera, Vector3 } from '../vendor/three-0.187.0/build/three.core.js';
import { createLandscape } from './landscape.js';
import { createParties } from './climbers.js';
import { createTerrain } from './terrain.js';
try {
  const svg=document.querySelector('svg'), state={cameraTime:35}, draw=createLandscape(svg,'poster',state);
  const terrain=createTerrain('poster'), sample=createParties(), moving={pro:true,con:false};
  for (const [width,height] of [[1280,720],[390,740]]) {
    svg.setAttribute('width',width);svg.setAttribute('height',height);
    for (const progress of [{pro:0,con:0},{pro:.80,con:.05},{pro:.96,con:1}]) {
      draw(progress,35,moving,'wide',0,true,1020);
      const r=state.rig, camera=new PerspectiveCamera(35,width/height,.2,1200);
      const horizontal=r.distance*Math.cos(r.pitch);
      camera.position.set(r.x+horizontal*Math.sin(r.yaw),r.y+r.distance*Math.sin(r.pitch),r.z+horizontal*Math.cos(r.yaw));
      camera.lookAt(r.x,r.y,r.z);camera.updateMatrixWorld();
      const {members}=sample(terrain,progress,35,moving,'poster',1020);
      const anchors=[terrain.summit,...members.flatMap(m=>[m.bones.head.origin,m.bones.boot0.origin])];
      for (const anchor of anchors) {
        const point=new Vector3(...anchor).project(camera);
        if (Math.abs(point.x)>.98 || Math.abs(point.y)>.98 || point.z>1) throw Error('Overview cropped a subject');
      }
    }
  }
  document.querySelector('output').textContent='ok';
} catch(e) {document.querySelector('output').textContent=String(e);}
</script>"""
        with serve_pages() as (site, url):
            (site / 'web/climb/overview-test.html').write_text(page, encoding='utf-8')
            dom = dump(url + 'web/climb/overview-test.html')
        self.assertIn('<output id="result">ok</output>', dom[:2000])

    def test_distant_snow_respects_mountain_depth(self):
        page = """<!doctype html><output></output>
<svg><g id="sky"></g><g id="mountain"></g><g id="tracks"></g><g id="parties"></g></svg>
<script type="module">
import {mountSnow} from './snow.js';
import {PerspectiveCamera} from '../vendor/three-0.187.0/build/three.core.js';
try {
  const svg=document.querySelector('svg'), get=id=>document.getElementById(id);
  const groups={horizon:get('sky'),mountain:get('mountain'),tracks:get('tracks'),parties:get('parties')};
  mountSnow(svg,groups,'ink',[0,0,-115]);
  const weather=mountSnow(svg,groups,'paper',[0,0,-115]);
  if (svg.querySelectorAll('[data-climb-weather]').length!==2 || groups.horizon.querySelectorAll('[data-spindrift]').length!==3)
    throw Error('Remount left duplicate weather layers or summit plumes');
  const camera=new PerspectiveCamera(35,1.6,.2,1200);
  camera.updateMatrixWorld();
  const project=([x,y,z],out={})=>Object.assign(out,{x:320+x*600/-z,y:200-y*600/-z,depth:-z,scale:600/-z});
  const flakes=svg.querySelector('[data-snow-layer="far"] path:last-child');
  weather.sample(camera,project,640,400,30,false);
  weather.paint(()=>Infinity);
  if (!flakes.getAttribute('d') || !(get('mountain').compareDocumentPosition(flakes)&Node.DOCUMENT_POSITION_FOLLOWING))
    throw Error('The mountain hid snow falling in front of it');
  weather.paint(()=>62);
  if (flakes.getAttribute('d')) throw Error('Distant snow bled through a foreground ridge');
  document.querySelector('output').textContent='ok';
} catch(e) { document.querySelector('output').textContent=String(e); }
</script>"""
        with serve_pages() as (site, url):
            (site / 'web/climb/snow-depth-test.html').write_text(page, encoding='utf-8')
            dom = dump(url + 'web/climb/snow-depth-test.html')
        self.assertIn('<output>ok</output>', dom[:2000])

    def test_mountain_depth_tiles_follow_overlapping_faces_and_the_viewport(self):
        page = """<!doctype html><output></output><svg><g></g></svg><script type="module">
import {mountMountain} from './landscape.js';
try {
  const faces=[];
  function rectangle(x1,x2,z) {
    faces.push({color:'#eee',points:[[x1,5,z],[x2,5,z],[x2,35,z],[x1,35,z]]});
  }
  for (let i=0;i<30;i++) rectangle(0,40,40+i);
  rectangle(10,20,7);
  rectangle(20,40,9);
  let offset=0,vertical=0;
  function project([x,y,depth],out={}) { return Object.assign(out,{x:x+offset,y:y+vertical,depth}); }
  const draw=mountMountain(document.querySelector('g'),faces);
  const same=(a,b)=>a===b || Math.abs(a-b)<1e-8;
  for (const x of [0,19,0]) {
    offset=x;
    draw(project,0,0,96,48,String(x));
    for (const [dx,expected] of [[0,40],[9.99,40],[10,7],[19.99,7],[20,7],[20.01,9],[39.99,9],[40,9],[41,Infinity]]) {
      const px=x+dx,y=22;
      if (!same(project.terrainDepth(px,y),expected)) throw Error('Nearest surface at '+px);
      for (const limit of [6,8,10,41]) {
        const d=project.terrainDepth(px,y,limit);
        if ((d<limit)!==(expected<limit)) throw Error('Visibility at '+px+' depth '+limit);
      }
    }
  }
  offset=40;
  draw(project,0,0,176,48,'0');
  if (!same(project.terrainDepth(55,22),7) || project.terrainDepth(15,22)!==Infinity)
    throw Error('Width changed but the original depth tiles survived');
  vertical=30;
  draw(project,0,0,176,108,'0');
  if (!same(project.terrainDepth(55,52),7) || project.terrainDepth(55,22)!==Infinity)
    throw Error('Height changed but the original depth tiles survived');
  document.querySelector('output').textContent='ok';
} catch(e) { document.querySelector('output').textContent=String(e); }
</script>"""
        with serve_pages() as (site, url):
            (site / 'web/climb/tile-test.html').write_text(page, encoding='utf-8')
            dom = dump(url + 'web/climb/tile-test.html')
        self.assertIn('<output>ok</output>', dom[:2000])

    def test_visible_snow_lips_draw_over_the_matching_bedrock(self):
        page = """<!doctype html><output></output>
<svg width="960" height="600"><g id="horizon"></g><g id="mountain"></g><g id="tracks"></g><g id="parties"></g></svg>
<script type="module">
import {createTerrain} from './terrain.js';
import {createLandscape} from './landscape.js';
try {
  const svg=document.querySelector('svg'), group=svg.querySelector('#mountain');
  const draw=createLandscape(svg,'poster',{cameraTime:81}), nodes=[...group.children];
  const faces=createTerrain('poster').faces, beds=new Map(),caps=new Map();
  const key=p=>p.map(n=>n.toFixed(5)).join(',');
  const edge=(a,b)=>[key(a),key(b)].sort().join('/');
  for (const [i,f] of faces.entries()) {
    const table=f.material==='rock'?beds:f.snowShoulder?caps:null;
    if (table) f.points.forEach((a,j)=>table.set(edge(a,f.points[(j+1)%f.points.length]),nodes[i]));
  }
  // A resize can bring hidden faces back without changing the orbit angle.
  for (const [view,p,width] of [['pro',.63,960],['con',.525,960],['wide',.30,960],
      ['wide',.30,340],['wide',.30,1280]]) {
    svg.setAttribute('width',width);
    draw({pro:p,con:p},81,{pro:false,con:false},view,0,true,180);
    const order=new Map([...group.children].map((node,i)=>[node,i]));
    let checked=0;
    for (const f of faces) {
      if (f.material!=='firn' || f.points.length!==4) continue;
      const [a,b,c,d]=f.points,bed=beds.get(edge(a,b)),cap=caps.get(edge(c,d));
      if (!bed || !cap || bed.style.display==='none' || cap.style.display==='none') continue;
      if (order.get(bed)>=order.get(cap)) throw Error('Exposed rock covers its snow lip in '+view);
      checked++;
    }
    if (!checked) throw Error('No visible snow-to-rock seams in '+view);
  }
  document.querySelector('output').textContent='ok';
} catch(e) { document.querySelector('output').textContent=String(e); }
</script>"""
        with serve_pages() as (site, url):
            (site / 'web/climb/snow-lip-test.html').write_text(page, encoding='utf-8')
            dom = dump(url + 'web/climb/snow-lip-test.html')
        self.assertIn('<output>ok</output>', dom[:2000])

    def test_summit_follow_keeps_the_climbers_in_view(self):
        page = """<!doctype html><output id="result"></output>
<svg width="1366" height="768"><g id="horizon"></g><g id="mountain"></g><g id="tracks"></g><g id="parties"></g></svg>
<script type="module">
import { createLandscape } from './landscape.js';
try {
  const state={autoFollowObstacles:'pro'}, svg=document.querySelector('svg');
  const draw=createLandscape(svg,'ink',state);
  for (let i=0;i<80;i++) {
    const elapsed=.946*540+i/8, remaining=540-elapsed;
    state.cameraTime=elapsed+.17*540;
    draw({pro:elapsed/540,con:.17},state.cameraTime,{pro:true,con:false},'pro',.125,i===0,{pro:540,con:540});
    if (remaining>=20 && remaining<=24) {
      const boots=svg.querySelectorAll('path[data-mesh="boot"][d]:not([d=""])');
      if (boots.length<6) throw Error('Summit ridge hid the party at '+remaining);
      const coats=Array.from(svg.querySelectorAll('path[data-mesh="parka"][d]'));
      const height=Math.max(...coats.map(path=>path.getBBox().height));
      if (height<28) throw Error('Camera pulled too far from the climbers at '+remaining);
    }
  }
  document.querySelector('output').textContent='ok';
} catch(e) { document.querySelector('output').textContent=String(e); }
</script>"""
        with serve_pages() as (site, url):
            (site / 'web/climb/summit-test.html').write_text(page, encoding='utf-8')
            dom = dump(url + 'web/climb/summit-test.html')
        self.assertIn('<output id="result">ok</output>', dom[:2000])

    def test_climbing_uses_each_teams_own_clock(self):
        page = """<!doctype html><meta charset="utf-8"><output id="result"></output>
<script type="module">
import { climbTimeline } from './timeline.js';
const match = climbTimeline({stages:[
  {name:'opening', type:'single', side:'pro', secs:60},
  {name:'break', type:'break', secs:20},
  {name:'free', type:'dual', first:'con', secs:75}
]});
const samples = [35,60,79,80,110,140,200,215,230].map(t => {
  const {used,remaining,progress,finished} = match.at(t);
  return [used.pro,used.con,remaining,progress.pro === 1,progress.con === 1,finished];
});
document.querySelector('output').textContent = JSON.stringify(samples);
</script>"""
        with serve_pages() as (site, url):
            (site / "web/climb/clock-test.html").write_text(page, encoding="utf-8")
            dom = dump(url + "web/climb/clock-test.html")
        values = json.loads(re.search(r'<output id="result">(.*?)</output>', dom).group(1))
        self.assertEqual([v[:3] for v in values], [
            [35, 0, 25], [60, 0, 20], [60, 0, 1], [60, 0, 75], [60, 30, 75],
            [90, 30, 45], [120, 60, 15], [120, 75, 15], [135, 75, 0],
        ])
        self.assertEqual(values[-2][3:], [False, True, False])
        self.assertEqual(values[-1][3:], [True, True, True])

    def test_lazy_modules_on_pages(self):
        probe = r"""
<output id="result"></output>
<script>
window.addEventListener('load', async () => {
  const result = document.getElementById('result');
  try {
    const files = performance.getEntriesByType('resource');
    if (files.some(file => /\/(vendor|three-runtime)\b/.test(new URL(file.name).pathname))) {
      throw new Error('3D files loaded before the first request');
    }
    const [first, second] = await Promise.all([DT.web.load3D(), DT.web.load3D()]);
    if (first !== second) throw new Error('Multiple runtime instances');
    const { THREE, OrbitControls, GLTFLoader } = first;
    if (typeof THREE.WebGLRenderer !== 'function') throw new Error('Missing WebGLRenderer');
    const controls = new OrbitControls(new THREE.PerspectiveCamera(), document.createElement('canvas'));
    controls.update();
    controls.dispose();
    const model = await new GLTFLoader().parseAsync({
      asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: 'test-node' }]
    }, '');
    if (!(model.scene.getObjectByName('test-node') instanceof THREE.Object3D)) throw new Error('Invalid glTF scene');
    result.textContent = 'ok';
  } catch (error) {
    result.textContent = String(error);
  }
});
</script>
"""
        with serve_pages() as (site, url):
            index = site / "index.html"
            html = index.read_text(encoding="utf-8")
            index.write_text(html.replace("</body>", probe + "</body>"), encoding="utf-8")
            dom = dump(url)
        match = re.search(r'<output id="result">(.*?)</output>', dom, re.S)
        self.assertIsNotNone(match, "the Pages test did not start")
        self.assertEqual(unescape(match[1]), "ok")
