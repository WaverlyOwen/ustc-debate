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

Layout follows the file name: 备赛文档 gets the study layout, 速查 the compact
two-page layout, 文稿 the reading layout with 12pt speech text and boxed
临场预案 notes. 正方 / 反方 in the name colours the document red or blue, the
convention Chinese debate uses for the two sides. --compact forces the 速查
layout for every file.
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

BASE_CSS = """
:root {
  --ink: #1C1A17; --ink-2: #4A4740; --ink-3: #8A8378;
  --rule: #D5D0C7; --rule-soft: #E9E5DE; --panel: #F6F4EF; --paper: #FFFFFF;
  --pro: #B4362A; --pro-tint: #FBEFED;
  --con: #1F4E8C; --con-tint: #EDF2F9;
  --both: #6B6357; --both-tint: #F6F4EF;
  --accent: var(--both); --tint: var(--both-tint);
}
body.side-pro { --accent: var(--pro); --tint: var(--pro-tint); }
body.side-con { --accent: var(--con); --tint: var(--con-tint); }
* { box-sizing: border-box; }
html { font-size: 11pt; }
body { font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "微软雅黑",
       "Noto Sans CJK SC", "Source Han Sans SC", "WenQuanYi Zen Hei", "WenQuanYi Micro Hei",
       "Helvetica Neue", Arial, sans-serif;
       color: var(--ink); background: var(--paper); line-height: 1.7; margin: 0;
       font-variant-numeric: tabular-nums; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

/* ---- title block ---- */
.titleblock { margin: 0 0 22pt; padding: 0 0 12pt; border-bottom: 2px solid var(--accent); break-after: avoid; }
.titleblock .eyebrow { font-size: 9pt; letter-spacing: .16em; color: var(--ink-3); margin: 0 0 8pt; }
.titleblock .eyebrow .sep { margin: 0 .5em; color: var(--rule); }
.titleblock h1 { font-size: 22pt; line-height: 1.3; margin: 0; font-weight: 700; letter-spacing: .01em; text-wrap: balance; }
.titleblock .sidebadge { display: inline-block; font-size: 10pt; line-height: 1; padding: 4pt 9pt; border: 1.5px solid var(--accent);
                         color: var(--accent); border-radius: 2px; margin: 8pt 0 0; font-weight: 600; letter-spacing: .06em; }
.titleblock .meta { display: flex; flex-wrap: wrap; gap: 4pt 20pt; margin: 12pt 0 0; font-size: 9.5pt; color: var(--ink-2); }
.titleblock .meta b { color: var(--ink-3); font-weight: 500; margin-right: 5pt; letter-spacing: .06em; }

/* ---- headings ---- */
h2 { font-size: 15pt; margin: 26pt 0 10pt; padding-top: 10pt; border-top: 1px solid var(--rule); font-weight: 700;
     letter-spacing: .01em; line-height: 1.35; break-after: avoid; page-break-after: avoid; }
h2.h-pro { color: var(--pro); } h2.h-con { color: var(--con); }
h3 { font-size: 12pt; margin: 16pt 0 6pt; font-weight: 700; line-height: 1.4; break-after: avoid; page-break-after: avoid; }
h3.h-pro { border-left: 3px solid var(--pro); padding-left: 8pt; }
h3.h-con { border-left: 3px solid var(--con); padding-left: 8pt; }
h4 { font-size: 11pt; margin: 12pt 0 4pt; font-weight: 700; break-after: avoid; }
hr { display: none; }

/* ---- text ---- */
p { margin: 0 0 8pt; text-align: justify; }
ul, ol { margin: 0 0 8pt; padding-left: 1.5em; }
li { margin-bottom: 3pt; }
li > p { margin: 0; }
strong { font-weight: 700; }
code { font-family: Menlo, Consolas, "Noto Sans Mono CJK SC", monospace; font-size: 9.5pt; background: var(--panel); padding: 0 3px; border-radius: 2px; }
pre { background: var(--panel); padding: 8pt 10pt; white-space: pre-wrap; break-inside: avoid; font-size: 9.5pt; }
pre code { background: none; padding: 0; }

/* ---- callout (一句话立论 etc.) ---- */
blockquote { margin: 12pt 0 14pt; padding: 10pt 14pt; background: var(--tint); border-left: 4px solid var(--accent);
             font-size: 11.5pt; line-height: 1.7; break-inside: avoid; }
blockquote p { margin: 0 0 4pt; } blockquote p:last-child { margin: 0; }

/* ---- summary panel (结论速览) ---- */
.summary { background: var(--panel); border-left: 4px solid var(--both); padding: 12pt 16pt 8pt; margin: 0 0 22pt; break-inside: avoid; }
.summary h2 { border: 0; margin: 0 0 8pt; padding: 0; font-size: 10pt; letter-spacing: .18em; color: var(--ink-3); font-weight: 700; }
.summary ul { padding-left: 1.2em; margin: 0; } .summary li { margin-bottom: 6pt; }
.summary li:last-child { margin-bottom: 0; }

/* ---- tables ---- */
.tablewrap { margin: 8pt 0 14pt; overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: 9.5pt; line-height: 1.5; }
thead th { text-align: left; font-weight: 600; color: var(--ink-2); font-size: 9pt; letter-spacing: .04em; padding: 6pt 8pt;
           border-top: 1.5px solid var(--ink); border-bottom: 1px solid var(--rule); background: var(--panel); }
td { padding: 6pt 8pt; border-bottom: 1px solid var(--rule-soft); vertical-align: top; }
tbody tr:last-child td { border-bottom: 1px solid var(--rule); }
tr { break-inside: avoid; page-break-inside: avoid; }

/* ---- running footer ---- */
.runfoot { position: fixed; left: 0; right: 0; bottom: -13mm; display: flex; justify-content: space-between;
           font-size: 8pt; color: var(--ink-3); letter-spacing: .06em; }
.runfoot .side { color: var(--accent); font-weight: 600; }
"""

PREP_CSS = """
@page { size: A4; margin: 20mm 18mm 22mm; }
"""

QUICK_CSS = """
@page { size: A4; margin: 10mm 11mm 12mm; }
html { font-size: 9.2pt; }
body { line-height: 1.38; }
.titleblock { margin: 0 0 8pt; padding: 0 0 5pt; }
.titleblock .eyebrow { margin-bottom: 3pt; font-size: 7.5pt; }
.titleblock h1 { font-size: 14pt; line-height: 1.25; }
.titleblock .sidebadge { font-size: 8pt; padding: 2.5pt 6pt; margin-top: 4pt; }
.titleblock .meta { margin-top: 5pt; font-size: 8pt; }
h2 { font-size: 10pt; margin: 9pt 0 3pt; padding-top: 5pt; letter-spacing: .1em; color: var(--accent); }
h3 { font-size: 9.5pt; margin: 6pt 0 2pt; }
p { margin: 0 0 3pt; }
ul, ol { margin: 0 0 3pt; padding-left: 1.25em; } li { margin-bottom: 1pt; }
blockquote { margin: 5pt 0 7pt; padding: 5pt 9pt; font-size: 9.5pt; line-height: 1.45; }
.tablewrap { margin: 2pt 0 6pt; }
table { font-size: 8.2pt; line-height: 1.33; }
thead th { padding: 2.5pt 4.5pt; font-size: 7.8pt; } td { padding: 2.5pt 4.5pt; }
.runfoot { bottom: -8mm; font-size: 7.2pt; }
"""

SCRIPT_CSS = """
@page { size: A4; margin: 20mm 18mm 22mm; }
.stage { break-before: auto; }
.stage > h2 { display: flex; align-items: baseline; gap: 10pt; flex-wrap: wrap; }
.stage > h2 .num { font-size: 11pt; color: var(--accent); font-weight: 700; min-width: 1.6em; letter-spacing: .04em; }
.stage > h2 .name { flex: 1 1 auto; }
.stage > h2 .meta { font-size: 8.5pt; color: var(--ink-3); font-weight: 500; letter-spacing: .06em; border: 1px solid var(--rule);
                    padding: 2pt 7pt; border-radius: 2px; white-space: nowrap; }
.stage.speech > p { font-size: 12pt; line-height: 1.95; margin: 0 0 11pt; }
.stage.speech > p strong { font-weight: 600; -webkit-text-emphasis: filled sesame var(--accent); text-emphasis: filled sesame var(--accent);
                           -webkit-text-emphasis-position: under right; text-emphasis-position: under right; }
.contingency { margin: 12pt 0 4pt; padding: 8pt 12pt; border: 1px dashed var(--rule); background: #FCFBF9; font-size: 9.5pt;
               color: var(--ink-2); line-height: 1.55; break-inside: avoid; }
.contingency .label { font-weight: 700; letter-spacing: .14em; font-size: 8.5pt; color: var(--ink-3); margin: 0 0 4pt; }
.contingency ul { margin: 0; padding-left: 1.3em; } .contingency li { margin-bottom: 3pt; }
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


KIND_LABEL = {"prep": "备赛文档", "quick": "正赛速查", "script": "正赛文稿"}
KIND_CSS = {"prep": PREP_CSS, "quick": QUICK_CSS, "script": SCRIPT_CSS}


def classify_file(base):
    """(kind, side) from the file name: 备赛文档 / 速查 / 文稿, 正方 / 反方 / both."""
    if "速查" in base or "quickref" in base.lower():
        kind = "quick"
    elif "文稿" in base or "script" in base.lower():
        kind = "script"
    else:
        kind = "prep"
    side = "pro" if "正方" in base else "con" if "反方" in base else "both"
    return kind, side


def _side_of(text):
    pro, con = "正方" in text or "正一" in text or "正二" in text or "正三" in text or "正四" in text, \
               "反方" in text or "反一" in text or "反二" in text or "反三" in text or "反四" in text
    if pro and not con:
        return "pro"
    if con and not pro:
        return "con"
    return None


def decorate(body, kind, side):
    """Turn the flat converter output into the document structure the CSS styles.

    The Markdown is the source of truth; this only adds wrappers and classes:
    a title block from the H1 + its meta list, a summary panel for 结论速览,
    side colouring on headings, table wrappers, and for scripts the
    number / name / 字数 badge split plus a boxed 如果……就…… note.
    """
    # -- title block --
    m = re.search(r"<h1>(.*?)</h1>\s*(?:<ul>(.*?)</ul>)?", body, re.S)
    eyebrow = KIND_LABEL[kind]
    badge = ""
    meta_html = ""
    if m:
        title = re.sub(r"<[^>]+>", "", m.group(1)).strip()
        title = re.sub(r"^(备赛文档|正赛速查|正赛文稿|备赛手册)[：:]\s*", "", title)
        bm = re.search(r"[（(]\s*(正方|反方)\s*[：:]\s*(.*?)\s*[）)]\s*$", title)
        if bm:
            badge = '<span class="sidebadge">%s · %s</span>' % (bm.group(1), html.escape(bm.group(2)))
            title = title[:bm.start()].strip()
        chips = []
        for li in re.findall(r"<li>(.*?)</li>", m.group(2) or "", re.S):
            li = li.strip()
            km = re.match(r"<strong>(.*?)</strong>\s*[：:]\s*(.*)$", li, re.S)
            if km:
                chips.append("<span><b>%s</b>%s</span>" % (km.group(1), km.group(2)))
            else:
                chips.append("<span>%s</span>" % li)
        if chips:
            meta_html = '<div class="meta">%s</div>' % "".join(chips)
        block = ('<header class="titleblock"><div class="eyebrow">%s</div><h1>%s</h1>%s%s</header>'
                 % (eyebrow, html.escape(title), badge, meta_html))
        body = body[:m.start()] + block + body[m.end():]
        foot_title = title
    else:
        foot_title = ""

    # -- summary panel: first h2 named 结论速览 up to the next h2 --
    sm = re.search(r"<h2>[^<]*结论速览[^<]*</h2>", body)
    if sm:
        nxt = re.search(r"<h2>", body[sm.end():])
        end = sm.end() + (nxt.start() if nxt else len(body) - sm.end())
        inner = body[sm.start():end]
        inner = re.sub(r"<hr>\s*$", "", inner.strip())
        body = body[:sm.start()] + '<section class="summary">' + inner + "</section>" + body[end:]

    # -- side classes on headings, h3 inheriting from the enclosing h2 --
    cur = None
    out = []
    pos = 0
    for hm in re.finditer(r"<(h2|h3)>(.*?)</\1>", body, re.S):
        tag, text = hm.group(1), re.sub(r"<[^>]+>", "", hm.group(2))
        sd = _side_of(text)
        if tag == "h2":
            cur = sd
        cls = sd or (cur if tag == "h3" else None)
        out.append(body[pos:hm.start()])
        out.append("<%s%s>%s</%s>" % (tag, ' class="h-%s"' % cls if cls else "", hm.group(2), tag))
        pos = hm.end()
    out.append(body[pos:])
    body = "".join(out)

    # -- tables --
    body = re.sub(r"(<table>.*?</table>)", r'<div class="tablewrap">\1</div>', body, flags=re.S)

    # -- script stages --
    if kind == "script":
        parts = re.split(r"(?=<h2)", body)
        rebuilt = [parts[0]]
        for sec in parts[1:]:
            hm = re.match(r"<h2( class=\"[^\"]*\")?>(.*?)</h2>", sec, re.S)
            if not hm:
                rebuilt.append(sec)
                continue
            htext = re.sub(r"<[^>]+>", "", hm.group(2)).strip()
            nm = re.match(r"(\d+)[.、]\s*(.+?)(?:（(.+?)）)?\s*$", htext)
            if nm:
                num, name, meta = nm.group(1), nm.group(2), nm.group(3)
                meta = (meta or "").replace(" / ", " · ")
                h2 = ('<h2%s><span class="num">%s</span><span class="name">%s</span>%s</h2>'
                      % (hm.group(1) or "", num, html.escape(name),
                         '<span class="meta">%s</span>' % html.escape(meta) if meta else ""))
            else:
                h2 = hm.group(0)
            rest = sec[hm.end():]
            is_speech = "稿" in htext and "预案" not in htext
            if is_speech:
                cm = re.search(r"(<p><strong>如果[^<]*</strong>[^<]*</p>\s*)?(<ul>(?:(?!<ul>).)*?</ul>)\s*(?:<hr>)?\s*$", rest, re.S)
                if cm and "如果" in cm.group(0):
                    rest = (rest[:cm.start()] + '<aside class="contingency"><div class="label">临场预案 · 如果……就……</div>'
                            + cm.group(2) + "</aside>" + rest[cm.end():])
            rebuilt.append('<section class="stage%s">%s%s</section>' % (" speech" if is_speech else "", h2, rest))
        body = "".join(rebuilt)

    side_label = {"pro": "正方", "con": "反方", "both": "正反双方"}[side]
    body += ('<div class="runfoot"><span>%s</span><span class="side">%s · %s</span></div>'
             % (html.escape(foot_title), KIND_LABEL[kind], side_label))
    return body


def wrap_html(body, title, kind="prep", side="both"):
    body = decorate(body, kind, side)
    css = BASE_CSS + KIND_CSS[kind]
    return ('<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">'
            "<title>%s</title><style>%s</style></head>"
            '<body class="doc-%s side-%s">%s</body></html>'
            % (html.escape(title), css, kind, side, body))


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
    ap.add_argument("--compact", action="store_true", help="force the compact 速查 layout for every file")
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
        kind, side = classify_file(base)
        if args.compact:
            kind = "quick"
        with open(html_path, "w", encoding="utf-8") as fh:
            fh.write(wrap_html(body, title, kind, side))

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
