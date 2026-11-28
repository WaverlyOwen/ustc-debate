"""Check the climbing indicator across the actual lazy module and first draw."""
import re
import unittest
from html import unescape

from run_js_tests import find_browser
from test_export import dump, serve_pages


@unittest.skipUnless(find_browser(), "needs Edge or Chrome")
class ClimbLoadingTests(unittest.TestCase):
    def run_probe(self, code, *, module_prefix="", landscape=None):
        page = """<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="web/climb/match.css">
<style>.dt-stage { position: relative; width: 400px; height: 240px; container-type: size; }</style>
<script src="web/climb-theme.js"></script>
<div class="dt-stage" data-theme="climb-poster"><button>开始</button></div><output></output>
<script type="module">
const stage = document.querySelector('.dt-stage');
const status = el => el.querySelector('[role="status"]');
const viewData = {mode:'title',clocks:[],ascent:{progress:{pro:0,con:0}}};
const sleep = () => new Promise(resolve => setTimeout(resolve, 15));
async function until(check) {
  for (let i = 0; i < 90 && !check(); i++) await sleep();
  if (!check()) throw Error('Timed out waiting for '+check);
}
function check(ok, why) { if (!ok) throw Error(why); }
try { PROBE; document.querySelector('output').textContent = 'ok'; }
catch (error) { document.querySelector('output').textContent = String(error); }
</script>"""
        with serve_pages() as (site, url):
            module = site / 'web/climb/match-view.js'
            module.write_text(module_prefix + module.read_text(encoding='utf-8'), encoding='utf-8')
            if landscape is not None:
                (module.parent / 'landscape.js').write_text(landscape, encoding='utf-8')
            (site / 'loading.html').write_text(page.replace('PROBE', code), encoding='utf-8')
            dom = dump(url + 'loading.html')
        result = re.search(r'<output>(.*?)</output>', dom, re.S)
        self.assertIsNotNone(result, 'Loading probe did not run')
        self.assertEqual(unescape(result[1]), 'ok')

    def test_indicator_spans_import_and_first_draw_per_view(self):
        self.run_probe("""
let release;
window.importGate = new Promise(resolve => { release = resolve; });
const second = stage.cloneNode(true);
document.body.append(second);
const firstView = DT.webScenes.mount(stage), secondView = DT.webScenes.mount(second);
const indicator = status(stage);
check(indicator?.textContent.trim() && status(second), 'Missing immediate loading status');
check(indicator.checkVisibility() && getComputedStyle(indicator).pointerEvents === 'none',
  'Loading status is hidden or intercepts controls');
await until(() => window.importStarted);
secondView.destroy();
check(!status(second) && status(stage) === indicator, 'Destroy affected the wrong view');
release();
await until(() => stage.querySelector('.climb-match-scene'));
check(status(stage) === indicator && indicator.checkVisibility(), 'Status vanished before first draw');
check(!second.querySelector('.climb-match-scene'), 'Destroyed view remounted');
firstView.update(viewData);
await until(() => stage.classList.contains('has-climb-view'));
check(!status(stage), 'Status remained after first mountain frame');
firstView.destroy();
""", module_prefix="window.importStarted = true; await window.importGate;\n")

    def test_module_failure_removes_indicator_and_keeps_fallback(self):
        self.run_probe("""
const view = DT.webScenes.mount(stage);
check(status(stage), 'Missing status before failed import');
await until(() => !status(stage));
check(!stage.classList.contains('has-climb-view') && stage.querySelector('button').checkVisibility(),
  'Failed module hid the fallback');
view.destroy();
""", module_prefix="throw Error('unavailable');\n")

    def test_invalid_first_frame_removes_indicator_and_keeps_fallback(self):
        self.run_probe("""
const view = DT.webScenes.mount(stage);
view.update(viewData);
check(status(stage), 'Missing status before first draw');
await until(() => !status(stage));
check(!stage.classList.contains('has-climb-view'), 'Invalid mountain replaced the fallback');
view.destroy();
""", landscape="export function createLandscape() { return () => {}; }")
