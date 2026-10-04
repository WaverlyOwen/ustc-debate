"""Smoke test of tests/motion.py: one moment of one theme sampled into a contact sheet and a summary.

Launches its own headless Edge through motion.py and ends only that browser. Skipped when no Edge/Chrome is
installed.
"""
import contextlib
import io
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import motion  # noqa: E402
from run_js_tests import find_browser  # noqa: E402

OUT = HERE / "out"


@unittest.skipUnless(find_browser(), "no Edge or Chrome installed")
class MotionToolTest(unittest.TestCase):
    def test_hall_enter_makes_a_sheet_and_frame_times(self):
        OUT.mkdir(parents=True, exist_ok=True)
        out = Path(tempfile.mkdtemp(prefix="motion-test-", dir=str(OUT)))
        try:
            said = io.StringIO()
            with contextlib.redirect_stdout(said):
                code = motion.main(["--theme", "hall", "--moments", "enter", "--frames", "4", "--slow", "2",
                                    "--size", "960x540", "--out", str(out)])
            self.assertEqual(code, 0, said.getvalue())
            sheet = out / "hall" / "enter.png"
            self.assertTrue(sheet.exists())
            self.assertEqual(sheet.read_bytes()[:8], b"\x89PNG\r\n\x1a\n")
            entry = json.loads((out / "hall" / "summary.json").read_text("utf-8"))["moments"]["enter"]
            self.assertGreater(entry["frame_ms"]["p50"], 0)
            self.assertGreaterEqual(entry["frame_ms"]["p95"], entry["frame_ms"]["p50"])
            times = [f["t_ms"] for f in entry["frames"]]
            self.assertEqual(len(times), 4)
            self.assertEqual(times, sorted(times))
            # The frames span the moment: the first at its start, the last near the end of its window.
            self.assertLess(times[0], 0.2 * entry["window_ms"])
            self.assertGreater(times[-1], 0.8 * entry["window_ms"])
        finally:
            shutil.rmtree(out, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
