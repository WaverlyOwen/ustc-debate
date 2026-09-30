"""Tests for timer/build.py: parsing the format library and the drift check."""
import io
import shutil
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import build  # noqa: E402

FORMATS = build.DEFAULT_FORMATS_DIR


def by_id(formats):
    return {f["id"]: f for f in formats}


class ParseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.all = by_id(build.parse_all(FORMATS))

    def test_all_five_formats_are_found_and_template_is_skipped(self):
        self.assertEqual(sorted(self.all), ["recruit-1v1", "recruit-2v2", "recruit-3v3",
                                            "ustc-freshman-cup", "ustc-school-cup-2025"])

    def test_freshman_cup_stage_types(self):
        f = self.all["ustc-freshman-cup"]
        self.assertEqual(f["name"], "中国科学技术大学新生辩论赛")
        types = [s["type"] for s in f["stages"]]
        self.assertEqual(len(types), 18)
        self.assertEqual(types.count("break"), 4)
        self.assertEqual(types.count("dual"), 2)
        free = [s for s in f["stages"] if s["name"] == "自由辩论"][0]
        self.assertEqual((free["type"], free["secs"], free["first"], free["side"]), ("dual", 240, "pro", None))
        duel = [s for s in f["stages"] if s["name"] == "正反方二辩对辩"][0]
        self.assertEqual((duel["type"], duel["secs"]), ("dual", 90))

    def test_sides_and_notes(self):
        st = {s["name"]: s for s in self.all["ustc-freshman-cup"]["stages"]}
        self.assertEqual(st["正方一辩开篇立论"]["side"], "pro")
        self.assertEqual(st["反方四辩质询正方一辩"]["side"], "con")
        self.assertIn("双边计时", st["反方四辩质询正方一辩"]["note"])
        self.assertEqual(st["正方三辩盘问反方二辩、四辩"]["type"], "single")
        self.assertIn("按 P 暂停", st["正方三辩盘问反方二辩、四辩"]["note"])
        self.assertEqual(st["反方四辩结辩"]["secs"], 210)
        self.assertEqual(st["反方四辩结辩"]["block"], "E")
        self.assertEqual(st["反方四辩质询正方一辩"]["speaker"], "反四 问，正一 答")
        self.assertNotIn("speaker", st["评委打分"])

    def test_recruit_3v3_breaks_without_numbers(self):
        f = self.all["recruit-3v3"]
        self.assertEqual(len(f["stages"]), 20)
        breaks = [s for s in f["stages"] if s["type"] == "break"]
        self.assertEqual([b["id"] for b in breaks], ["recruit-3v3-b1", "recruit-3v3-b2", "recruit-3v3-b3"])
        self.assertEqual(len({s["id"] for s in f["stages"]}), 20)

    def test_school_cup_surprise_attack_becomes_extras(self):
        f = self.all["ustc-school-cup-2025"]
        self.assertEqual(len(f["stages"]), 18)
        self.assertFalse(any("奇袭" in s["name"] for s in f["stages"]))
        self.assertEqual(len(f["extras"]), 1)
        ex = f["extras"][0]
        self.assertEqual((ex["group"], ex["perSide"]), ("奇袭", 1))
        self.assertEqual([(v["name"], v["type"], v["secs"]) for v in ex["variants"]],
                         [("奇袭质询", "single", 150), ("奇袭申论", "single", 120)])
        self.assertIn("双边计时", ex["variants"][0]["note"])

    def test_defaults(self):
        for f in self.all.values():
            self.assertEqual(f["theme"], "hall")
            self.assertEqual(f["bells"], {"warn": [30], "countdown": 0, "end": "double"})
            self.assertTrue(f["builtin"])
            self.assertEqual(f["source"], f["id"] + ".md")

    def test_cn_int(self):
        self.assertEqual([build.cn_int(x) for x in ["一", "两", "三", "十", "2"]], [1, 2, 3, 10, 2])


class ErrorTests(unittest.TestCase):
    def test_missing_table_names_the_file(self):
        tmp = Path(tempfile.mkdtemp())
        try:
            (tmp / "broken.md").write_text("# 赛制：坏的\n\n没有表。\n", encoding="utf-8")
            with self.assertRaises(build.FormatError) as cm:
                build.parse_all(tmp)
            self.assertIn("broken.md", str(cm.exception))
        finally:
            shutil.rmtree(tmp)


class MissingDirTests(unittest.TestCase):
    def test_missing_or_empty_formats_dir_fails_and_writes_nothing(self):
        before = build.BUILTIN_JS.read_text(encoding="utf-8")
        tmp = Path(tempfile.mkdtemp())
        try:
            with self.assertRaises(build.FormatError):
                build.parse_all(tmp / "nope")
            with self.assertRaises(build.FormatError):
                build.parse_all(tmp)
            for d in (tmp / "nope", tmp):
                with redirect_stdout(io.StringIO()):
                    self.assertEqual(build.main(["--formats-dir", str(d)]), 1)
            self.assertEqual(build.BUILTIN_JS.read_text(encoding="utf-8"), before)
        finally:
            shutil.rmtree(tmp)


class CheckTests(unittest.TestCase):
    def test_check_passes_on_a_fresh_build_and_fails_after_an_edit(self):
        original = build.BUILTIN_JS.read_text(encoding="utf-8")
        try:
            with redirect_stdout(io.StringIO()):
                self.assertEqual(build.main(["--check"]), 0)
            build.BUILTIN_JS.write_text(original + "\n// edited\n", encoding="utf-8")
            with redirect_stdout(io.StringIO()):
                self.assertEqual(build.main(["--check"]), 1)
        finally:
            build.BUILTIN_JS.write_text(original, encoding="utf-8", newline="\n")


class MissingSourceTests(unittest.TestCase):
    """A source named in ORDER or STYLES that is not on disk fails the build instead of being skipped."""

    def setUp(self):
        self.order, self.styles = build.ORDER, build.STYLES

    def tearDown(self):
        build.ORDER, build.STYLES = self.order, self.styles

    def test_a_missing_script_fails_the_build_and_is_listed(self):
        build.ORDER = self.order + ["gone.js"]
        self.assertIn(build.SRC / "gone.js", build.script_files())
        with self.assertRaises(build.FormatError) as cm:
            build.inline_html(build.parse_all(FORMATS))
        self.assertIn("gone.js", str(cm.exception))
        with redirect_stdout(io.StringIO()):
            self.assertEqual(build.main(["--check"]), 1)

    def test_a_missing_stylesheet_fails_the_build(self):
        build.STYLES = self.styles + ["styles/gone.css"]
        with self.assertRaises(build.FormatError) as cm:
            build.inline_html(build.parse_all(FORMATS))
        self.assertIn("gone.css", str(cm.exception))

    def test_the_test_page_refuses_to_run_without_every_script(self):
        sys.path.insert(0, str(HERE))
        import run_js_tests
        build.ORDER = self.order + ["gone.js"]
        self.assertEqual(run_js_tests.missing_sources(), [build.SRC / "gone.js"])
        build.ORDER = self.order
        self.assertEqual(run_js_tests.missing_sources(), [])
        self.assertIn("__loadErrors", run_js_tests.test_page(""))


class FontTests(unittest.TestCase):
    """Edge loads the system Bahnschrift as named faces and ignores font-variation-settings on it; an
    @font-face with axis ranges over local("Bahnschrift") gives the digits their continuous tension (spec 5.3)."""

    def test_the_digit_face_declares_both_axes_and_leads_every_digit_stack(self):
        import re
        base = (build.SRC / "styles" / "base.css").read_text(encoding="utf-8")
        face = re.search(r"@font-face\s*\{([^}]*)\}", base)
        self.assertIsNotNone(face)
        body = face.group(1)
        self.assertIn('font-family: "DT Digits"', body)
        self.assertIn('local("Bahnschrift")', body)
        self.assertRegex(body, r"font-weight:\s*300 700")
        self.assertRegex(body, r"font-stretch:\s*75% 100%")
        for p in [build.SRC / "styles" / "base.css"] + sorted((build.SRC / "themes").glob("*.css")):
            stacks = re.findall(r"--font-digits:\s*([^;]+);", p.read_text(encoding="utf-8"))
            self.assertTrue(stacks, p.name)
            for stack in stacks:
                self.assertTrue(stack.startswith('"DT Digits", "Bahnschrift"'), f"{p.name}: {stack}")


class InlineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = build.inline_html(build.parse_all(FORMATS))

    def test_no_external_references(self):
        import re
        self.assertIsNone(re.search(r'<script[^>]+src=', self.html))
        self.assertIsNone(re.search(r'<link[^>]+href=', self.html))
        self.assertNotIn("http://", self.html.replace("http://www.w3.org", ""))
        self.assertNotIn("https://", self.html)

    def test_every_source_is_inlined_in_order(self):
        positions = [self.html.index(f"=== {name} ===") for name in build.ORDER]
        self.assertEqual(positions, sorted(positions))
        for p in build.style_files():
            self.assertIn(f"=== {p.relative_to(build.SRC).as_posix()} ===", self.html)

    def test_themes_are_declared(self):
        ids = [t["id"] for t in build.themes_meta()]
        self.assertEqual(sorted(ids), ["chalk", "chroma", "construct", "daylight", "flame", "frost", "hall", "ink", "marble", "neon", "riso", "startrail", "vintage"])
        self.assertIn('DT.THEMES = ', self.html)

    def test_generated_banner(self):
        self.assertIn("由 timer/build.py 生成", self.html[:400])

    def test_demo_names_match_screenshots(self):
        import re
        demo_js = (build.SRC / "demo.js").read_text(encoding="utf-8")
        sys.path.insert(0, str(HERE))
        import screenshots
        for name in screenshots.DEMOS:
            self.assertIn(f"'{name}'", demo_js)


class ThemeBuildTests(unittest.TestCase):
    def test_themes_meta_has_tone(self):
        for t in build.themes_meta():
            self.assertIn(t["tone"], ("dark", "light"), t["id"])

    def test_theme_scripts_follow_render(self):
        names = [p.name for p in build.script_files()]
        r = names.index("render.js")
        for p in build.theme_scripts():
            self.assertGreater(names.index(p.name), r)
            self.assertLess(names.index(p.name), names.index("setup.js"))

    def test_dev_index_is_generated_and_complete(self):
        page = build.dev_index_html()
        self.assertIn("generated by timer/build.py", page)
        for p in build.script_files():
            self.assertIn(p.relative_to(build.SRC).as_posix(), page)
        for p in build.style_files():
            self.assertIn(p.relative_to(build.SRC).as_posix(), page)

    def test_main_script_is_tagged(self):
        html = build.inline_html(build.parse_all(FORMATS))
        self.assertEqual(html.count('<script id="dt-main">'), 1)

    def test_orphan_theme_script_fails(self):
        orphan = build.SRC / "themes" / "zz-orphan.js"
        orphan.write_text("// orphan\n", encoding="utf-8")
        try:
            with self.assertRaises(build.FormatError):
                build.theme_scripts()
        finally:
            orphan.unlink()


if __name__ == "__main__":
    unittest.main()
