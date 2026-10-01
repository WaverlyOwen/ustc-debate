"""End to end: an exported match file opens straight on its title card."""
import html as htmllib
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import run_js_tests  # noqa: E402

BUILT = HERE.parent / "debate-timer.html"
OUT = HERE / "out"


def dump(url, budget=8000):
    browser = run_js_tests.find_browser()
    tmp = Path(tempfile.mkdtemp(prefix="dt-export-"))
    try:
        cmd = [browser, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
               "--allow-file-access-from-files", f"--user-data-dir={tmp}", f"--virtual-time-budget={budget}",
               "--dump-dom", url]
        return subprocess.run(cmd, capture_output=True, timeout=120).stdout.decode("utf-8", "replace")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


@unittest.skipUnless(run_js_tests.find_browser(), "needs Edge or Chrome")
class ExportEndToEnd(unittest.TestCase):
    def test_exported_file_opens_on_its_title_card(self):
        dom = dump(BUILT.as_uri() + "?exportProbe=1")
        m = re.search(r'<pre id="export-probe">(.*?)</pre>', dom, re.S)
        self.assertIsNotNone(m, "exportProbe did not write its output")
        exported = htmllib.unescape(m.group(1))
        OUT.mkdir(exist_ok=True)
        target = OUT / "export-test.html"
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
