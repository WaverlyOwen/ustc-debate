"""End to end: an exported match file opens straight on its title card."""
import html as htmllib
import json
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from contextlib import contextmanager
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import run_js_tests  # noqa: E402
import build  # noqa: E402

BUILT = HERE.parent / "ustc-debate-timer.html"
OUT = HERE / "out"


def dump(url, budget=8000):
    browser = run_js_tests.find_browser()
    tmp = Path(tempfile.mkdtemp(prefix="dt-export-"))
    try:
        cmd = [browser, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
               "--proxy-server=http://127.0.0.1:9",  # only loopback and file URLs are reachable
               "--allow-file-access-from-files", f"--user-data-dir={tmp}", f"--virtual-time-budget={budget}",
               "--dump-dom", url]
        return subprocess.run(cmd, capture_output=True, timeout=120).stdout.decode("utf-8", "replace")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


@contextmanager
def serve_pages():
    """Build and serve a clean Pages site under its project subpath."""
    with tempfile.TemporaryDirectory() as tmp:
        site = Path(tmp) / "ustc-debate"
        for path, content in build.web_outputs(build.parse_all(build.DEFAULT_FORMATS_DIR)).items():
            target = site / path.relative_to(build.PAGES)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content if isinstance(content, bytes) else content.encode())
        handler = partial(SimpleHTTPRequestHandler, directory=tmp)
        with ThreadingHTTPServer(("127.0.0.1", 0), handler) as server:
            thread = Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                yield site, f"http://127.0.0.1:{server.server_port}/ustc-debate/"
            finally:
                server.shutdown()
                thread.join()


@unittest.skipUnless(run_js_tests.find_browser(), "needs Edge or Chrome")
class ExportEndToEnd(unittest.TestCase):
    def test_exported_legacy_climb_match_renders_the_poster_offline(self):
        probe = """<output id="climb-export"></output><script>
addEventListener('load', async () => {
  const f = DT.BUILTIN_FORMATS.find(f => f.id === 'ustc-chongxiao-cup');
  const oldTheme = 'climb-paper';
  const p = DT.preset.make(f, {proTeam:'红杉', conTeam:'蓝海'}, oldTheme, 1);
  document.getElementById('climb-export').textContent =
    DT.preset.buildHtml(await DT.web.exportSource(oldTheme), p);
});</script>"""
        with serve_pages() as (site, base):
            source = (site / 'index.html').read_text(encoding='utf-8')
            (site / 'export.html').write_text(source.replace('</body>',probe+'</body>'),encoding='utf-8')
            match = re.search(r'<output id="climb-export">(.*?)</output>',dump(base+'export.html'),re.S)
            self.assertIsNotNone(match)
            page = htmllib.unescape(match[1])
            preset = re.search(r'<script type="application/json" id="dt-preset">(.*?)</script>', page, re.S)
            self.assertIsNotNone(preset)
            self.assertEqual(json.loads(preset[1])['theme'], 'climb-poster')
        # Take the server away before opening the exported match, including its file:// ES modules.
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'climb.html'
            path.write_text(page,encoding='utf-8')
            out = dump(path.as_uri())
        stage = re.search(r'<div class="dt-stage[^"]*has-climb-view[^>]*>', out)
        self.assertIsNotNone(stage, 'Offline match did not render the mountain')
        self.assertIn('data-theme="climb-poster"', stage[0])
        host = re.search(r'<div class="dt-climb-host"[^>]*>', out)
        self.assertIsNotNone(host)
        self.assertIn('data-style="poster"', host[0])
        self.assertIn('data-ready', host[0])
        self.assertIsNotNone(re.search(r'<path\b[^>]*data-mesh="parka"', out))

    def test_exported_file_opens_on_its_title_card(self):
        self.check_export(BUILT.as_uri(), "export-test.html")

    def test_pages_offers_the_formal_release_and_exports_an_offline_match(self):
        with serve_pages() as (site, base):
            # Serve a fixed release response while exercising the real Pages assets under a project subpath.
            index = (site / "index.html").read_text(encoding="utf-8")
            for name, response in (("released", 'Response.json({assets: [{name: "ustc-debate-timer.html"}]})'),
                                   ("unreleased", "new Response(null, {status: 404})")):
                stub = ("<script>const realFetch = window.fetch; window.fetch = (url, opts) => "
                        "String(url).startsWith('https://api.github.com/') ? Promise.resolve("
                        + response + ") : realFetch(url, opts);</script>")
                (site / (name + ".html")).write_text(index.replace("</head>", stub + "</head>"), encoding="utf-8")
            self.check_export(base, "export-from-pages.html")
            href = "https://github.com/WaverlyOwen/ustc-debate/releases/latest/download/" + BUILT.name
            self.assertIn(f'href="{href}">下载离线版</a>', dump(base + "released.html"))
            self.assertIn(">离线版尚未发布</a>", dump(base + "unreleased.html"))

    def check_export(self, url, filename):
        dom = dump(url + "?exportProbe=1")
        m = re.search(r'<pre id="export-probe">(.*?)</pre>', dom, re.S)
        self.assertIsNotNone(m, "exportProbe did not write its output")
        exported = htmllib.unescape(m.group(1))
        self.assertNotRegex(exported, r'<(?:script\b[^>]*\bsrc|link\b[^>]*\bhref)=')
        OUT.mkdir(exist_ok=True)
        target = OUT / filename
        target.write_text(exported, encoding="utf-8")
        page = dump(target.as_uri())
        self.assertIn('data-mode="title"', page)
        self.assertIn("探针辩题正方", page)
        self.assertIn("探针队甲", page)
        # The page's own CSS and preset JSON hold those strings too, so look at the rendered elements alone.
        self.assertRegex(page, r'<div\b[^<>]*\sdata-mode="title"')
        shown = re.sub(r"<(script|style)\b.*?</\1>", "", page, flags=re.S)
        self.assertIn("探针辩题正方", shown)
        self.assertIn("探针队甲", shown)


if __name__ == "__main__":
    unittest.main()
