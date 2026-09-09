#!/usr/bin/env python3
"""Convert Markdown debate documents to PDF with proper CJK rendering.

Usage:
    python3 md2pdf.py FILE_OR_DIR [FILE_OR_DIR ...] [--out-dir DIR] [--keep-html]

Zero required dependencies. Markdown is rendered by the `markdown` package
if installed, otherwise by a small built-in converter that understands
headings, paragraphs, emphasis, links, lists, tables, blockquotes, fenced
code and horizontal rules (everything the debate templates use).

PDF engines are tried in order:
  1. Chrome / Chromium / Edge headless (most students already have one)
  2. weasyprint (pip install weasyprint)
  3. pandoc + xelatex
If none is available the HTML file is kept and instructions are printed so
the user can open it in a browser and print to PDF.

Files whose name contains 速查 (quick reference) are laid out compactly
(smaller type, tighter margins) so they fit on one or two pages; --compact
forces that layout for every file.
"""
import argparse
import glob
import html
import os
import platform
import re
import shutil
import subprocess
import sys
import tempfile

CSS = """
@page { size: A4; margin: 18mm 16mm; @bottom-center { content: counter(page); font-size: 9pt; color: #888; } }
* { box-sizing: border-box; }
body { font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "微软雅黑",
       "Noto Sans CJK SC", "Source Han Sans SC", "WenQuanYi Zen Hei", "WenQuanYi Micro Hei",
       "Helvetica Neue", Arial, sans-serif;
       font-size: 11pt; line-height: 1.65; color: #111; max-width: 100%; margin: 0; }
h1 { font-size: 20pt; border-bottom: 2px solid #333; padding-bottom: 4pt; margin: 0 0 12pt; }
h2 { font-size: 15pt; margin: 20pt 0 8pt; border-left: 4px solid #444; padding-left: 8pt; page-break-after: avoid; }
h3 { font-size: 12.5pt; margin: 14pt 0 6pt; page-break-after: avoid; }
h4 { font-size: 11.5pt; margin: 10pt 0 4pt; page-break-after: avoid; }
p { margin: 0 0 7pt; text-align: justify; }
ul, ol { margin: 0 0 7pt; padding-left: 1.6em; }
li { margin-bottom: 2pt; }
li > p { margin: 0; }
blockquote { margin: 6pt 0 8pt; padding: 6pt 10pt; border-left: 4px solid #999; background: #f5f5f5; }
blockquote p { margin: 0; }
table { border-collapse: collapse; width: 100%; margin: 6pt 0 10pt; font-size: 10pt; page-break-inside: auto; }
tr { page-break-inside: avoid; }
th, td { border: 1px solid #999; padding: 4pt 6pt; vertical-align: top; text-align: left; }
th { background: #ececec; font-weight: 600; }
code { font-family: "SFMono-Regular", Menlo, Consolas, "Noto Sans Mono CJK SC", monospace; font-size: 9.5pt; background: #f2f2f2; padding: 0 3px; }
pre { background: #f2f2f2; padding: 8pt; overflow-x: auto; white-space: pre-wrap; page-break-inside: avoid; }
pre code { background: none; padding: 0; }
hr { border: 0; border-top: 1px solid #bbb; margin: 14pt 0; }
strong { font-weight: 700; }
.pb { page-break-before: always; }
"""

COMPACT_CSS = """
@page { margin: 10mm 10mm; }
body { font-size: 9.5pt; line-height: 1.4; }
h1 { font-size: 15pt; margin-bottom: 6pt; padding-bottom: 2pt; }
h2 { font-size: 11.5pt; margin: 9pt 0 4pt; }
h3 { font-size: 10.5pt; margin: 6pt 0 3pt; }
p { margin: 0 0 4pt; }
ul, ol { margin: 0 0 4pt; padding-left: 1.3em; }
li { margin-bottom: 1pt; }
table { font-size: 8.5pt; margin: 3pt 0 6pt; }
th, td { padding: 2pt 4pt; }
blockquote { margin: 3pt 0 5pt; padding: 3pt 6pt; }
"""


# ---------------------------------------------------------------- markdown --
def md_to_html(text):
    try:
        import markdown  # type: ignore
        return markdown.markdown(text, extensions=["tables", "fenced_code", "sane_lists"])
    except ImportError:
        return _builtin_md(text)


_INLINE_RULES = [
    (re.compile(r"`([^`]+)`"), lambda m: "<code>%s</code>" % html.escape(m.group(1))),
    (re.compile(r"\*\*(.+?)\*\*"), r"<strong>\1</strong>"),
    (re.compile(r"__(.+?)__"), r"<strong>\1</strong>"),
    (re.compile(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?!\w)"), r"<em>\1</em>"),
    (re.compile(r"\[([^\]]+)\]\(([^)\s]+)\)"), r'<a href="\2">\1</a>'),
]


def _inline(s):
    # protect code spans first, then escape, then apply the rest
    parts = re.split(r"(`[^`]+`)", s)
    out = []
    for p in parts:
        if p.startswith("`") and p.endswith("`") and len(p) > 1:
            out.append("<code>%s</code>" % html.escape(p[1:-1]))
        else:
            e = html.escape(p, quote=False)
            for rule, repl in _INLINE_RULES[1:]:
                e = rule.sub(repl, e)
            out.append(e)
    return "".join(out)


def _table(lines):
    def cells(row):
        row = row.strip()
        if row.startswith("|"):
            row = row[1:]
        if row.endswith("|"):
            row = row[:-1]
        return [c.strip() for c in row.split("|")]
    head = cells(lines[0])
    body = lines[2:]
    out = ["<table><thead><tr>"]
    out += ["<th>%s</th>" % _inline(c) for c in head]
    out.append("</tr></thead><tbody>")
    for r in body:
        cs = cells(r)
        cs += [""] * (len(head) - len(cs))
        out.append("<tr>" + "".join("<td>%s</td>" % _inline(c) for c in cs[: len(head)]) + "</tr>")
    out.append("</tbody></table>")
    return "".join(out)


def _builtin_md(text):
    lines = text.replace("\r\n", "\n").split("\n")
    out = []
    i = 0
    para = []
    list_stack = []  # list of (indent, tag)

    def flush_para():
        if para:
            out.append("<p>%s</p>" % _inline(" ".join(para)))
            para.clear()

    def close_lists(to_indent=-1):
        while list_stack and list_stack[-1][0] > to_indent:
            out.append("</li></%s>" % list_stack.pop()[1])

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        # fenced code
        if stripped.startswith("```"):
            flush_para(); close_lists()
            j = i + 1
            buf = []
            while j < len(lines) and not lines[j].strip().startswith("```"):
                buf.append(lines[j]); j += 1
            out.append("<pre><code>%s</code></pre>" % html.escape("\n".join(buf)))
            i = j + 1
            continue
        # blank
        if not stripped:
            flush_para(); close_lists()
            i += 1
            continue
        # heading
        m = re.match(r"^(#{1,6})\s+(.*?)\s*#*$", stripped)
        if m:
            flush_para(); close_lists()
            lvl = len(m.group(1))
            out.append("<h%d>%s</h%d>" % (lvl, _inline(m.group(2)), lvl))
            i += 1
            continue
        # hr
        if re.match(r"^(-{3,}|\*{3,}|_{3,})$", stripped):
            flush_para(); close_lists()
            out.append("<hr>")
            i += 1
            continue
        # table
        if stripped.startswith("|") and i + 1 < len(lines) and re.match(r"^\s*\|?\s*:?-{2,}", lines[i + 1]):
            flush_para(); close_lists()
            j = i
            block = []
            while j < len(lines) and lines[j].strip().startswith("|"):
                block.append(lines[j]); j += 1
            out.append(_table(block))
            i = j
            continue
        # blockquote
        if stripped.startswith(">"):
            flush_para(); close_lists()
            j = i
            buf = []
            while j < len(lines) and lines[j].strip().startswith(">"):
                buf.append(lines[j].strip()[1:].strip()); j += 1
            inner = _builtin_md("\n".join(buf))
            out.append("<blockquote>%s</blockquote>" % inner)
            i = j
            continue
        # list item
        m = re.match(r"^(\s*)([-*+]|\d+[.)])\s+(.*)$", line)
        if m:
            flush_para()
            indent = len(m.group(1).expandtabs(4))
            tag = "ol" if m.group(2)[0].isdigit() else "ul"
            content = m.group(3)
            cm = re.match(r"^\[([ xX])\]\s+(.*)$", content)
            if cm:
                box = "☑" if cm.group(1).lower() == "x" else "☐"
                content = box + " " + cm.group(2)
            if list_stack and indent > list_stack[-1][0]:
                out.append("<%s><li>%s" % (tag, _inline(content)))
                list_stack.append((indent, tag))
            else:
                close_lists(indent)
                if list_stack and list_stack[-1][0] == indent:
                    out.append("</li><li>%s" % _inline(content))
                else:
                    out.append("<%s><li>%s" % (tag, _inline(content)))
                    list_stack.append((indent, tag))
            i += 1
            continue
        # continuation of list item (indented text) or paragraph
        if list_stack and line.startswith(" "):
            out.append(" " + _inline(stripped))
            i += 1
            continue
        close_lists()
        para.append(stripped)
        i += 1
    flush_para(); close_lists()
    return "\n".join(out)


def wrap_html(body, title, compact=False):
    css = CSS + (COMPACT_CSS if compact else "")
    return ('<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">'
            "<title>%s</title><style>%s</style></head><body>%s</body></html>"
            % (html.escape(title), css, body))


# ----------------------------------------------------------------- engines --
def find_browser():
    cands = []
    for env in ("CHROME_PATH", "BROWSER_PATH", "PUPPETEER_EXECUTABLE_PATH"):
        if os.environ.get(env):
            cands.append(os.environ[env])
    names = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser",
             "chrome", "msedge", "microsoft-edge", "microsoft-edge-stable", "brave-browser"]
    for n in names:
        p = shutil.which(n)
        if p:
            cands.append(p)
    sysname = platform.system()
    if sysname == "Darwin":
        cands += ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
                  "/Applications/Chromium.app/Contents/MacOS/Chromium",
                  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
                  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"]
    elif sysname == "Windows":
        for base in (os.environ.get("PROGRAMFILES", r"C:\Program Files"),
                     os.environ.get("PROGRAMFILES(X86)", r"C:\Program Files (x86)"),
                     os.environ.get("LOCALAPPDATA", "")):
            if base:
                cands += [os.path.join(base, r"Google\Chrome\Application\chrome.exe"),
                          os.path.join(base, r"Microsoft\Edge\Application\msedge.exe"),
                          os.path.join(base, r"Chromium\Application\chrome.exe")]
    # playwright caches
    pw_roots = [os.environ.get("PLAYWRIGHT_BROWSERS_PATH", ""),
                os.path.expanduser("~/.cache/ms-playwright"),
                os.path.expanduser("~/Library/Caches/ms-playwright"),
                os.path.join(os.environ.get("LOCALAPPDATA", ""), "ms-playwright")]
    for root in pw_roots:
        if root and os.path.isdir(root):
            cands += glob.glob(os.path.join(root, "chromium*", "chrome-linux", "chrome"))
            cands += glob.glob(os.path.join(root, "chromium*", "chrome-mac*", "Chromium.app", "Contents", "MacOS", "Chromium"))
            cands += glob.glob(os.path.join(root, "chromium*", "chrome-win*", "chrome.exe"))
            cands.append(os.path.join(root, "chromium"))
    for c in cands:
        if c and os.path.exists(c):
            return c
    return None


def pdf_via_browser(html_path, pdf_path, browser):
    url = "file://" + os.path.abspath(html_path)
    if platform.system() == "Windows":
        url = "file:///" + os.path.abspath(html_path).replace("\\", "/")
    cmd = [browser, "--headless=new", "--disable-gpu", "--no-sandbox",
           "--no-pdf-header-footer", "--print-to-pdf=" + os.path.abspath(pdf_path), url]
    try:
        r = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=180)
    except (subprocess.TimeoutExpired, OSError):
        return False
    if os.path.exists(pdf_path) and os.path.getsize(pdf_path) > 0:
        return True
    # old chrome needs --headless (not =new)
    cmd[1] = "--headless"
    try:
        subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=180)
    except (subprocess.TimeoutExpired, OSError):
        return False
    return os.path.exists(pdf_path) and os.path.getsize(pdf_path) > 0


def pdf_via_weasyprint(html_path, pdf_path):
    try:
        import weasyprint  # type: ignore
    except ImportError:
        return False
    try:
        weasyprint.HTML(filename=html_path).write_pdf(pdf_path)
        return os.path.exists(pdf_path)
    except Exception as e:  # noqa: BLE001
        print("  weasyprint failed:", e, file=sys.stderr)
        return False


def pdf_via_pandoc(md_path, pdf_path):
    if not shutil.which("pandoc"):
        return False
    engine = None
    for e in ("xelatex", "tectonic", "lualatex"):
        if shutil.which(e):
            engine = e
            break
    if not engine:
        return False
    fonts = ["PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC",
             "Source Han Sans SC", "WenQuanYi Zen Hei", "SimSun"]
    if shutil.which("fc-list"):
        try:
            have = subprocess.run(["fc-list", ":lang=zh", "family"], stdout=subprocess.PIPE,
                                  text=True, timeout=30).stdout
            fonts = [f for f in fonts if f in have] or fonts
        except (subprocess.TimeoutExpired, OSError):
            pass
    for f in fonts[:3]:
        cmd = ["pandoc", md_path, "-o", pdf_path, "--pdf-engine=" + engine,
               "-V", "CJKmainfont=" + f, "-V", "geometry:margin=18mm"]
        try:
            r = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=300)
        except (subprocess.TimeoutExpired, OSError):
            continue
        if r.returncode == 0 and os.path.exists(pdf_path):
            return True
    return False


# -------------------------------------------------------------------- main --
def collect(paths):
    files = []
    for p in paths:
        if os.path.isdir(p):
            files += sorted(glob.glob(os.path.join(p, "*.md")))
        elif p.lower().endswith(".md"):
            files.append(p)
        else:
            print("skip (not .md):", p, file=sys.stderr)
    return files


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("paths", nargs="+", help=".md files or directories containing them")
    ap.add_argument("--out-dir", help="write PDFs here instead of next to the source")
    ap.add_argument("--keep-html", action="store_true", help="keep the intermediate .html next to the PDF")
    ap.add_argument("--compact", action="store_true", help="compact layout for every file (default: only names containing 速查)")
    args = ap.parse_args()

    files = collect(args.paths)
    if not files:
        print("no markdown files found", file=sys.stderr)
        return 2
    browser = find_browser()
    failures = []
    for md_path in files:
        with open(md_path, encoding="utf-8") as fh:
            text = fh.read()
        m = re.search(r"^#\s+(.+)$", text, re.M)
        title = m.group(1).strip() if m else os.path.splitext(os.path.basename(md_path))[0]
        body = md_to_html(text)
        out_dir = args.out_dir or os.path.dirname(os.path.abspath(md_path))
        os.makedirs(out_dir, exist_ok=True)
        base = os.path.splitext(os.path.basename(md_path))[0]
        pdf_path = os.path.join(out_dir, base + ".pdf")
        html_path = os.path.join(out_dir, base + ".html")
        compact = args.compact or "速查" in base or "quickref" in base.lower()
        with open(html_path, "w", encoding="utf-8") as fh:
            fh.write(wrap_html(body, title, compact))

        ok = False
        used = None
        if browser and pdf_via_browser(html_path, pdf_path, browser):
            ok, used = True, "browser (%s)" % os.path.basename(browser)
        elif pdf_via_weasyprint(html_path, pdf_path):
            ok, used = True, "weasyprint"
        elif pdf_via_pandoc(md_path, pdf_path):
            ok, used = True, "pandoc"
        if ok:
            print("OK  %s  ->  %s  [%s]" % (md_path, pdf_path, used))
            if not args.keep_html:
                os.remove(html_path)
        else:
            failures.append((md_path, html_path))
            print("FAIL %s (html kept at %s)" % (md_path, html_path))

    if failures:
        print("\nNo PDF engine worked. Options:\n"
              "  * install Google Chrome / Chromium / Edge, or set CHROME_PATH to the browser binary\n"
              "  * pip install weasyprint\n"
              "  * install pandoc + xelatex\n"
              "  * or open the kept .html in any browser and use Print -> Save as PDF", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
