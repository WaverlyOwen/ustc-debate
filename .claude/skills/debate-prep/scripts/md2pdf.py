#!/usr/bin/env python3
"""Convert Markdown debate documents to PDF with proper CJK rendering.

Usage:
    python3 md2pdf.py FILE_OR_DIR [FILE_OR_DIR ...] [--out-dir DIR] [--keep-html]

Zero required dependencies. Markdown is rendered by a small built-in
converter that understands headings, paragraphs, emphasis, links, lists
(nested on two-space indents), tables, blockquotes, fenced code and rules —
everything the debate templates use — so output is identical on every machine.

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

/* ---- page frame: thead repeats on every printed page, so this is the running header ---- */
table.page { width: 100%; border-collapse: collapse; }
table.page > thead > tr > td.pagehead { padding: 0 0 5pt; font-size: 8pt; color: var(--ink-3); letter-spacing: .06em;
                                        border-bottom: 1px solid var(--rule); }
table.page > thead > tr > td.pagehead .r { float: right; color: var(--accent); font-weight: 600; }
table.page > tbody > tr > td.pagebody { padding: 14pt 0 0; }

/* ---- content tables ---- */
.tablewrap { margin: 8pt 0 14pt; overflow-x: auto; }
.tablewrap table { border-collapse: collapse; width: 100%; font-size: 9.5pt; line-height: 1.5; }
.tablewrap thead th { text-align: left; font-weight: 600; color: var(--ink-2); font-size: 9pt; letter-spacing: .04em; padding: 6pt 8pt;
                      border-top: 1.5px solid var(--ink); border-bottom: 1px solid var(--rule); background: var(--panel); }
.tablewrap td { padding: 6pt 8pt; border-bottom: 1px solid var(--rule-soft); vertical-align: top; }
.tablewrap tbody tr:last-child td { border-bottom: 1px solid var(--rule); }
.tablewrap tr { break-inside: avoid; page-break-inside: avoid; }
.tablewrap tr.grp td { background: var(--panel); font-weight: 700; font-size: 8.5pt; letter-spacing: .12em; color: var(--ink-2);
                       padding: 4pt 8pt; border-bottom: 1px solid var(--rule); }
.tablewrap td.forbid { color: #7A2E25; }
.tablewrap td.lead { font-weight: 600; }

/* ---- chips ---- */
.chip { display: inline-block; font-size: 8pt; line-height: 1; padding: 3pt 6pt; border-radius: 2px; letter-spacing: .06em;
        font-weight: 600; white-space: nowrap; vertical-align: middle; }
.chip-ok { background: #E4EFE6; color: #24512F; }
.chip-mid { background: transparent; color: #5E5748; border: 1px solid #B9B2A5; }
.chip-warn { background: #FBEBD7; color: #8A4B0B; }
.chip-pro { background: var(--pro-tint); color: var(--pro); }
.chip-con { background: var(--con-tint); color: var(--con); }
.chip-neutral { background: var(--panel); color: var(--ink-2); }
.chip-tag { background: var(--panel); color: var(--ink-3); font-weight: 500; }

/* ---- fields: a labelled list rendered as label / content rows ---- */
.fields { margin: 4pt 0 12pt; }
.field { display: grid; grid-template-columns: 6.5em 1fr; gap: 0 12pt; padding: 7pt 0; border-top: 1px solid var(--rule-soft);
         align-items: start; break-inside: avoid; }
.field:first-child { border-top: 0; padding-top: 2pt; }
.field > dt { font-size: 8.5pt; letter-spacing: .12em; color: var(--ink-3); font-weight: 600; padding-top: 3pt; line-height: 1.4; }
.field > dt .lsuf { display: block; font-weight: 400; letter-spacing: .02em; color: var(--ink-3); }
.field > dd { margin: 0; min-width: 0; }
.field > dd > p:last-child, .field > dd > ul:last-child, .field > dd > ol:last-child { margin-bottom: 0; }
.field .fields { margin: 4pt 0 0; }
.field .field { grid-template-columns: 5.5em 1fr; padding: 4pt 0; }
.field .field > dt { font-size: 8pt; }
.sub { display: grid; grid-template-columns: 7em 1fr; gap: 0 8pt; margin: 5pt 0 0; font-size: 10pt; color: var(--ink-2); line-height: 1.6; }
.sub > .sublabel { color: var(--ink-3); font-size: 8pt; letter-spacing: .08em; padding-top: 2.5pt; font-weight: 600; }
.sub > .subtext { min-width: 0; }
.sub > .subtext > .chip { margin-right: 5pt; }

/* roles */
.role-lead > dd { font-size: 12pt; font-weight: 600; line-height: 1.6; color: var(--ink); }
.role-lead.side-pro > dd { color: var(--pro); } .role-lead.side-con > dd { color: var(--con); }
ol.steps { list-style: none; padding: 0; margin: 2pt 0 0; counter-reset: step; }
ol.steps > li { counter-increment: step; position: relative; padding-left: 2em; margin-bottom: 4pt; }
ol.steps > li::before { content: counter(step); position: absolute; left: 0; top: .15em; width: 1.4em; height: 1.4em; border-radius: 50%;
                        border: 1.2px solid var(--accent); color: var(--accent); font-size: 8.5pt; font-weight: 700;
                        display: flex; align-items: center; justify-content: center; line-height: 1; }
.role-evidence { grid-template-columns: 1fr; padding: 0; border-top: 0; margin: 6pt 0; }
.role-evidence > dt { display: flex; align-items: center; gap: 8pt; font-size: 8.5pt; padding: 0 0 4pt; }
.role-evidence > dt .kind { display: inline-block; padding: 2.5pt 7pt; background: var(--ink); color: #fff; border-radius: 2px; letter-spacing: .14em; font-size: 8pt; }
.role-evidence > dt .kind.pro { background: var(--pro); } .role-evidence > dt .kind.con { background: var(--con); }
.role-evidence > dd { border: 1px solid var(--rule); border-left: 3px solid var(--accent); padding: 8pt 12pt 8pt; background: #FDFCFA; }
.role-evidence > dd > .main { margin: 0 0 4pt; }
.role-closing > dd { color: var(--ink-2); border-left: 3px solid var(--accent); padding-left: 10pt; }
.role-clash > dd .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border: 1px solid var(--rule); margin: 0 0 6pt; break-inside: avoid; }
.role-clash > dd .pair > div { padding: 7pt 10pt; font-size: 10pt; line-height: 1.6; }
.role-clash > dd .pair > .atk { background: var(--panel); color: var(--ink-2); border-right: 1px solid var(--rule); }
.role-clash > dd .pair > div > .tag { display: block; font-size: 7.5pt; letter-spacing: .16em; color: var(--ink-3); font-weight: 700; margin-bottom: 3pt; }
.role-clash > dd .pair > .rsp > .tag { color: var(--accent); }
.role-card { grid-template-columns: 1fr; border-top: 0; padding: 0; margin: 8pt 0; }
.role-card > dt { font-size: 10pt; letter-spacing: .04em; padding: 0 0 4pt; color: var(--ink); }
.role-card.side-pro > dt { color: var(--pro); } .role-card.side-con > dt { color: var(--con); }
.role-card > dd { border-left: 3px solid var(--both); padding: 6pt 12pt; }
.role-card.side-pro > dd { border-left-color: var(--pro); } .role-card.side-con > dd { border-left-color: var(--con); }
.role-card.side-neutral > dd { background: var(--panel); border-left-color: var(--ink); padding: 9pt 12pt; }
.role-card.side-neutral > dd > .main { font-weight: 600; }
.role-thesis { grid-template-columns: 1fr; border-top: 0; padding: 0; }
.role-thesis > dt { font-size: 8pt; padding: 0 0 3pt; }
.role-thesis > dd { padding: 8pt 12pt; background: var(--panel); border-left: 4px solid var(--both); font-size: 11pt; line-height: 1.65; }
.role-thesis.side-pro > dt { color: var(--pro); } .role-thesis.side-pro > dd { background: var(--pro-tint); border-left-color: var(--pro); }
.role-thesis.side-con > dt { color: var(--con); } .role-thesis.side-con > dd { background: var(--con-tint); border-left-color: var(--con); }
.stats { display: flex; gap: 8pt; margin: 6pt 0 2pt; }
.stats > div { flex: 1; border: 1px solid var(--rule); padding: 7pt 10pt; background: #fff; }
.stats > div > .n { font-size: 18pt; font-weight: 700; line-height: 1.1; }
.stats > div > .l { font-size: 8pt; letter-spacing: .1em; color: var(--ink-3); margin-top: 2pt; }
.stats > .ok > .n { color: #24512F; } .stats > .mid > .n { color: #5E5748; } .stats > .warn > .n { color: #8A4B0B; }
.role-timeline > dd > ul { list-style: none; padding: 0; margin: 0; }
.role-timeline > dd > ul > li { display: grid; grid-template-columns: 6em 1fr; gap: 0 10pt; padding: 4pt 0; border-top: 1px dotted var(--rule); }
.role-timeline > dd > ul > li:first-child { border-top: 0; }
.role-timeline > dd > ul > li > .when { font-weight: 700; color: var(--accent); font-size: 10pt; }
.role-checklist > dd > ul { list-style: none; padding: 0; }
.role-checklist > dd > ul > li { padding-left: 1.6em; position: relative; }
.role-checklist > dd > ul > li::before { content: ""; position: absolute; left: 0; top: .35em; width: .8em; height: .8em; border: 1.2px solid var(--ink-2); border-radius: 1.5px; }
.summary .fields { margin: 0; } .summary .field { border-top-color: var(--rule); }
.summary .role-lead > dd { font-size: 11pt; font-weight: 500; }
"""

PREP_CSS = """
@page { size: A4; margin: 20mm 18mm 22mm; }
"""

QUICK_CSS = """
@page { size: A4; margin: 9mm 10mm 10mm; }
html { font-size: 9pt; }
body { line-height: 1.34; }
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
.tablewrap table { font-size: 8pt; line-height: 1.3; }
.tablewrap thead th { padding: 2.5pt 4.5pt; font-size: 7.8pt; } .tablewrap td { padding: 2.5pt 4.5pt; }
table.page > tbody > tr > td.pagebody { padding-top: 8pt; }
.fields { margin: 2pt 0 6pt; }
.field { display: block; padding: 2.5pt 0; border-top: 1px solid var(--rule-soft); }
.field > dt { display: inline; font-size: 7.5pt; letter-spacing: .08em; padding: 0; margin-right: 6pt; }
.field > dt .lsuf { display: inline; margin-left: 2pt; }
.field > dd { display: inline; }
.field > dd > p { display: inline; margin: 0; }
.field > dd > p + p::before { content: " "; }
.field.role-lead > dd { font-size: 9.5pt; }
.field.role-card, .field.role-thesis, .field.role-evidence { display: grid; grid-template-columns: 1fr; }
.field.role-card > dt, .field.role-thesis > dt, .field.role-evidence > dt { display: block; }
.field.role-card > dd, .field.role-thesis > dd, .field.role-evidence > dd { display: block; }
.sub { margin-top: 1pt; }
.sub { font-size: 8.5pt; grid-template-columns: 5.5em 1fr; margin-top: 2pt; } .sub > .sublabel { font-size: 7.2pt; }
.role-lead > dd { font-size: 10pt; }
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
    """Always the built-in converter. python-markdown needs four-space indents to
    nest a list, so it flattens the two-space sub-items these documents use, and
    then the field/role layout cannot see the structure. Same input, same output,
    on every machine."""
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
    pro = any(k in text for k in ("正方", "正一", "正二", "正三", "正四"))
    con = any(k in text for k in ("反方", "反一", "反二", "反三", "反四"))
    if pro and not con:
        return "pro"
    if con and not pro:
        return "con"
    return None


# ------------------------------------------------------------ list model --
TOK = re.compile(r"(<ul>|</ul>|<ol>|</ol>|<li>|</li>)")
LABEL = re.compile(r"^\s*(?:在中立判准下[，,]\s*)?(?:<strong>)?((?:[^<>：:]|</?strong>){1,40}?)(?:</strong>)?(\s*[（(][^（）()<>]{1,24}[）)])?\s*[：:]\s*(.*)$", re.S)
SUBLABELS = ("有利之处", "合理性", "核心主张", "支撑", "边界", "口头版", "出处", "来源", "方法", "主要发现", "局限",
             "代表性", "贴合度", "状态", "补充学理", "词典义", "学术义", "法规义", "行业义", "国际组织义", "自律口径",
             "正方的自律口径", "反方的自律口径", "反方如何反驳它", "正方如何反驳它", "反方如何反驳", "正方如何反驳",
             "正方需要证明", "反方需要证明", "打法", "回应", "查证方向", "赛场口头引用")
SUB_RE = re.compile(r"(?:(?<=^)|(?<=[。；;）)（(\s\"”’」』])|(?<=</strong>))\s*(?:<strong>)?(" + "|".join(map(re.escape, sorted(SUBLABELS, key=len, reverse=True)))
                    + r")(?:</strong>)?\s*[：:]\s*")
BOLD_SUB_RE = re.compile(r"(?:(?<=^)|(?<=[。；;）)（(\s\"”’」』]))\s*<strong>([^<]{2,14})</strong>\s*[：:]\s*")
CHIP = {"已核实": "ok", "有把握": "mid", "待核实": "warn", "【待核实】": "warn", "偏正": "pro", "略偏正": "pro", "偏反": "con",
        "略偏反": "con", "均衡": "neutral", "最终": "tag", "淘汰": "tag", "常见": "tag", "双方": "neutral"}


def chip(text):
    t = text.strip()
    k = CHIP.get(t)
    return '<span class="chip chip-%s">%s</span>' % (k, t.strip("【】")) if k else text


class Item:
    __slots__ = ("text", "children")

    def __init__(self):
        self.text = ""
        self.children = []   # (list_tag, [Item])


def parse_list(tokens, i):
    """tokens[i] is <ul>/<ol>; returns (tag, items, next_i)."""
    tag = tokens[i][1:-1]
    i += 1
    items = []
    cur = None
    while i < len(tokens):
        t = tokens[i]
        if t == "</%s>" % tag:
            return tag, items, i + 1
        if t == "<li>":
            cur = Item(); items.append(cur); i += 1
        elif t == "</li>":
            cur = None; i += 1
        elif t in ("<ul>", "<ol>"):
            sub_tag, sub_items, i = parse_list(tokens, i)
            if cur is None:
                cur = Item(); items.append(cur)
            cur.children.append((sub_tag, sub_items))
        elif t in ("</ul>", "</ol>"):
            return tag, items, i + 1      # tolerate mismatch
        else:
            if cur is not None:
                cur.text += re.sub(r"</?p>", " ", t)
            i += 1
    return tag, items, i


def split_subs(text):
    """Split 'main text 有利之处：… 反方如何反驳它：…' into (main, [(label, body), …])."""
    marks = []
    for m in SUB_RE.finditer(text):
        marks.append((m.start(), m.end(), m.group(1)))
    for m in BOLD_SUB_RE.finditer(text):
        if not any(abs(m.start() - x[0]) < 3 for x in marks):
            marks.append((m.start(), m.end(), m.group(1)))
    marks.sort()
    if not marks:
        return text.strip(), []
    main = text[:marks[0][0]].strip()
    subs = []
    for idx, (st, en, lab) in enumerate(marks):
        end = marks[idx + 1][0] if idx + 1 < len(marks) else len(text)
        subs.append((lab, text[en:end].strip()))
    return main, subs


def render_subs(subs):
    out = []
    for lab, body in subs:
        body = body.strip()
        if lab == "状态":
            m = re.match(r"(?:<strong>)?(已核实|有把握|【待核实】|待核实)(?:</strong>)?\s*(.*)$", body, re.S)
            if m:
                body = chip(m.group(1)) + m.group(2)
        out.append('<div class="sub"><span class="sublabel">%s</span><span class="subtext">%s</span></div>' % (lab, body))
    return "".join(out)


def render_plain(tag, items, cls=""):
    out = ["<%s%s>" % (tag, ' class="%s"' % cls if cls else "")]
    for it in items:
        out.append("<li>" + it.text.strip() + "".join(render_list(t, its) for t, its in it.children) + "</li>")
    out.append("</%s>" % tag)
    return "".join(out)


def is_labelled(items):
    """A list is a field list when its first item carries a label and most do.
    Stray unlabelled items are attached to the field before them (see attach_strays)."""
    if not items or not LABEL.match(items[0].text):
        return False
    n = sum(1 for it in items if LABEL.match(it.text))
    return n >= max(1, round(len(items) * 0.6))


def attach_strays(items):
    out = []
    for it in items:
        if LABEL.match(it.text) or not out:
            out.append(it)
        else:
            out[-1].children.append(("ul", [it]))
    return out


def role_for(label):
    l = re.sub(r"<[^>]+>", "", label)
    l = re.sub(r"[（(].*?[）)]", "", l).strip()
    side = _side_of(label)
    if l in ("主张", "判准是什么", "结论", "持方优劣评估", "辩题性质"):
        return "role-lead", side
    if l.startswith("机制"):
        return "role-steps", None
    if l in ("学理", "数据", "案例", "补充学理"):
        return "role-evidence", None
    if l.startswith("回扣"):
        return "role-closing", None
    if "最强攻击" in l or l == "攻防":
        return "role-clash", None
    if l in ("正方有利定义", "反方有利定义", "正方有利判准", "反方有利判准"):
        return "role-card", side
    if l in ("中立定义", "中立判准"):
        return "role-card", "neutral"
    if "定义杀" in l or "打法" in l or "要防" in l:
        return "role-card", side
    if l.endswith("一句话立论"):
        return "role-thesis", side
    if l == "论据核实":
        return "role-stats", None
    if l == "时间表":
        return "role-timeline", None
    if "背下来" in l or "清单" in l:
        return "role-checklist", None
    return "", side


def render_fields(items, depth=0):
    out = ['<dl class="fields">']
    for it in attach_strays(items):
        m = LABEL.match(it.text)
        label, rest = m.group(1).strip(), m.group(3)
        suffix = (m.group(2) or "").strip()
        role, side = role_for(label)
        if suffix and role not in ("role-evidence",):
            label = label + '<span class="lsuf">%s</span>' % suffix
        cls = " ".join(c for c in (role, "side-%s" % side if side else "") if c)
        main, subs = split_subs(rest)
        body = ""
        # ---- role-specific bodies ----
        if role == "role-steps":
            steps = None
            for t, its in it.children:
                if t == "ol":
                    steps = its
            if steps is None and re.search(r"[（(]\s*[1１一]\s*[）)]", main):
                parts = [p.strip() for p in re.split(r"[（(]\s*[0-9０-９一二三四五六七八九]+\s*[）)]", main) if p.strip()]
                body = '<ol class="steps">' + "".join("<li>%s</li>" % p for p in parts) + "</ol>"
                main = ""
            elif steps is None and len(re.findall(r"(?:^|\s)[1-9]\.\s", main)) >= 2:
                head, *parts = re.split(r"(?:^|\s)[1-9]\.\s", main)
                body = '<ol class="steps">' + "".join("<li>%s</li>" % x.strip() for x in parts if x.strip()) + "</ol>"
                main = head.strip()
            elif steps is not None:
                body = '<ol class="steps">' + "".join("<li>%s</li>" % s_.text.strip() for s_ in steps) + "</ol>"
                it = Item()  # children consumed
            body = (("<p>%s</p>" % main) if main else "") + body
        elif role == "role-evidence":
            kind = re.sub(r"[（(].*?[）)]", "", label).strip()
            label = '<span class="kind">%s</span>' % kind
            body = ('<div class="main">%s</div>' % main if main else "") + render_subs(subs)
            subs = []
        elif role == "role-clash":
            pairs = []
            for t, its in it.children:
                for c in its:
                    txt = c.text.strip()
                    pm = re.match(r"(?:<strong>)?攻击(?:（[^）]*）)?(?:</strong>)?\s*[：:]\s*(.*?)\s*(?:→|->|—>)\s*(?:<strong>)?回应(?:</strong>)?\s*[：:]\s*(.*)$", txt, re.S)
                    if pm:
                        pairs.append((pm.group(1), pm.group(2)))
                    else:
                        pairs.append((txt, ""))
            it = Item()
            if pairs:
                body = "".join('<div class="pair"><div class="atk"><span class="tag">对方攻击</span>%s</div><div class="rsp"><span class="tag">我方回应</span>%s</div></div>' % (a_, r_) for a_, r_ in pairs)
            body = (("<p>%s</p>" % main) if main else "") + body
        elif role == "role-stats":
            nums = re.findall(r"(已核实|有把握|【待核实】|待核实)\s*<?[^0-9<]*?(\d+)\s*条", main)
            if nums:
                body = '<div class="stats">' + "".join('<div class="%s"><div class="n">%s</div><div class="l">%s</div></div>' % (CHIP.get(k, "tag"), n, k.strip("【】")) for k, n in nums) + "</div>"
                tail = re.sub(r".*?(?:条)(?=[（(]|$)", "", main, count=1)
                if "（" in main:
                    body += '<p class="muted">%s</p>' % main[main.rindex("（"):]
                main = ""
            body = (("<p>%s</p>" % main) if main else "") + body
        elif role == "role-timeline":
            rows = []
            for t, its in it.children:
                for c in its:
                    cm = re.match(r"\s*(?:<strong>)?([^：:<]{2,14})(?:</strong>)?\s*[：:]\s*(.*)$", c.text.strip(), re.S)
                    rows.append((cm.group(1), cm.group(2)) if cm else ("", c.text.strip()))
            it = Item()
            body = (("<p>%s</p>" % main) if main else "") + "<ul>" + "".join('<li><span class="when">%s</span><span>%s</span></li>' % r for r in rows) + "</ul>"
        elif role == "role-card":
            body = ('<div class="main">%s</div>' % main if main else "") + render_subs(subs)
            subs = []
        else:
            if len(re.findall(r"(?:^|\s)[1-9]\.\s", main)) >= 2:
                head, *parts = re.split(r"(?:^|\s)[1-9]\.\s", main)
                body = (("<p>%s</p>" % head.strip()) if head.strip() else "") + '<ol class="steps">' + "".join("<li>%s</li>" % x.strip() for x in parts if x.strip()) + "</ol>"
            else:
                body = ("<p>%s</p>" % main) if main else ""
        if subs:
            body += render_subs(subs)
        for t, its in it.children:
            body += render_list(t, its, depth + 1)
        out.append('<div class="field %s"><dt>%s</dt><dd>%s</dd></div>' % (cls, label, body))
    out.append("</dl>")
    return "".join(out)


def render_list(tag, items, depth=0):
    if tag == "ul" and is_labelled(items):
        return render_fields(items, depth)
    if tag == "ol":
        return render_plain("ol", items, "steps" if depth > 0 else "")
    return render_plain(tag, items)


def transform_lists(body):
    """Re-render every top-level list; labelled lists become field blocks."""
    tokens = [t for t in TOK.split(body) if t != ""]
    out = []
    i = 0
    while i < len(tokens):
        t = tokens[i]
        if t in ("<ul>", "<ol>"):
            tag, items, i = parse_list(tokens, i)
            out.append(render_list(tag, items, 0))
        else:
            out.append(t); i += 1
    merged = "".join(out)
    # a blank line between items makes the converter close the list; rejoin the field blocks
    return re.sub(r'</dl>\s*<dl class="fields">', "", merged)


def transform_tables(body):
    def one(m):
        tbl = m.group(0)
        heads = [re.sub(r"<[^>]+>", "", h).strip() for h in re.findall(r"<th>(.*?)</th>", tbl, re.S)]
        # chips in cells
        tbl = re.sub(r"<td>\s*(已核实|有把握|【待核实】|待核实|偏正|略偏正|偏反|略偏反|均衡|最终|淘汰|常见)\s*</td>",
                     lambda c: "<td>%s</td>" % chip(c.group(1)), tbl)
        if heads and heads[0] == "类别" and "标准表述" in heads:
            # group rows by 类别; mark 禁止的说法 column
            forbid = heads.index("禁止的说法") if "禁止的说法" in heads else -1
            rows = re.findall(r"<tr>(.*?)</tr>", tbl, re.S)
            head_row, body_rows = rows[0], rows[1:]
            new_rows, last = [], None
            for r in body_rows:
                cells = re.findall(r"<td>(.*?)</td>", r, re.S)
                if not cells:
                    continue
                cat = re.sub(r"<[^>]+>", "", cells[0]).strip()
                if cat != last:
                    new_rows.append('<tr class="grp"><td colspan="%d">%s</td></tr>' % (len(cells), cat)); last = cat
                cells[0] = ""
                tds = []
                for ci, c in enumerate(cells):
                    k = ' class="forbid"' if ci == forbid else (' class="lead"' if ci == 1 else "")
                    tds.append("<td%s>%s</td>" % (k, c))
                new_rows.append("<tr>" + "".join(tds) + "</tr>")
            tbl = re.sub(r"<tbody>.*?</tbody>", "<tbody>" + "".join(new_rows) + "</tbody>", tbl, flags=re.S)
        elif heads and heads[0] == "维度":
            pass
        return '<div class="tablewrap">%s</div>' % tbl
    return re.sub(r"<table>.*?</table>", one, body, flags=re.S)


def decorate(body, kind, side):
    """Build the document structure the CSS styles from the converter's flat output.

    The Markdown stays the source of truth. This adds: a title block from the
    H1 and its meta list; a repeating page header; the 结论速览 panel; side
    colouring on headings; labelled lists rendered as field rows with roles
    (主张 / 机制 / 学理·数据·案例 / 回扣 / 攻防 / 三版定义与判准 …); chips for
    评估倾向 and 核实状态; grouped 口径表; and for scripts the numbered stage
    header with its 字数 badge plus the boxed 临场预案.
    """
    m = re.search(r"<h1>(.*?)</h1>\s*(?:<ul>(.*?)</ul>)?", body, re.S)
    eyebrow = KIND_LABEL[kind]
    badge = ""
    meta_html = ""
    title = ""
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
            chips.append("<span><b>%s</b>%s</span>" % (km.group(1), km.group(2)) if km else "<span>%s</span>" % li)
        if chips:
            meta_html = '<div class="meta">%s</div>' % "".join(chips)
        block = ('<header class="titleblock"><div class="eyebrow">%s</div><h1>%s</h1>%s%s</header>'
                 % (eyebrow, html.escape(title), badge, meta_html))
        body = body[:m.start()] + block + body[m.end():]

    # side classes on headings, h3 inheriting from its h2
    cur = None; out = []; pos = 0
    for hm in re.finditer(r"<(h2|h3)>(.*?)</\1>", body, re.S):
        tag, text = hm.group(1), re.sub(r"<[^>]+>", "", hm.group(2))
        sd = _side_of(text)
        if tag == "h2":
            cur = sd
        cls = sd or (cur if tag == "h3" else None)
        out.append(body[pos:hm.start()])
        out.append("<%s%s>%s</%s>" % (tag, ' class="h-%s"' % cls if cls else "", hm.group(2), tag))
        pos = hm.end()
    out.append(body[pos:]); body = "".join(out)

    if kind == "script":
        body = re.sub(r"<ul>\s*<li>\s*(?:<strong>)?如果……就……(?:</strong>)?[：:]?\s*(<ul>.*?</ul>)\s*</li>\s*</ul>", r"\1", body, flags=re.S)
    body = transform_lists(body)
    body = transform_tables(body)

    # summary panel with the thesis pair and stat tiles
    sm = re.search(r"<h2>[^<]*结论速览[^<]*</h2>", body)
    if sm:
        nxt = re.search(r"<h2", body[sm.end():])
        end = sm.end() + (nxt.start() if nxt else len(body) - sm.end())
        inner = re.sub(r"<hr>\s*$", "", body[sm.start():end].strip())
        body = body[:sm.start()] + '<section class="summary">' + inner + "</section>" + body[end:]

    # script stages
    if kind == "script":
        parts = re.split(r"(?=<h2)", body)
        rebuilt = [parts[0]]
        for sec in parts[1:]:
            hm = re.match(r"<h2( class=\"[^\"]*\")?>(.*?)</h2>", sec, re.S)
            if not hm:
                rebuilt.append(sec); continue
            htext = re.sub(r"<[^>]+>", "", hm.group(2)).strip()
            nm = re.match(r"(\d+)[.、]\s*(.+?)(?:（(.+?)）)?\s*$", htext)
            if nm:
                num, name, meta = nm.group(1), nm.group(2), (nm.group(3) or "").replace(" / ", " · ")
                h2 = ('<h2%s><span class="num">%s</span><span class="name">%s</span>%s</h2>'
                      % (hm.group(1) or "", num, html.escape(name), '<span class="meta">%s</span>' % html.escape(meta) if meta else ""))
            else:
                h2 = hm.group(0)
            rest = sec[hm.end():]
            is_speech = "稿" in htext and "预案" not in htext
            if is_speech:
                cm = re.search(r"(<p><strong>如果[^<]*</strong>[^<]*</p>\s*)?(<ul>(?:(?!<ul>).)*?</ul>|<dl class=\"fields\">.*?</dl>)\s*(?:<hr>)?\s*$", rest, re.S)
                if cm and "如果" in cm.group(0):
                    inner = re.sub(r"^<ul>\s*<li>\s*如果……就……[：:]?\s*(<ul>.*</ul>)\s*</li>\s*</ul>$", r"\1", cm.group(2).strip(), flags=re.S)
                    rest = (rest[:cm.start()] + '<aside class="contingency"><div class="label">临场预案 · 如果……就……</div>'
                            + inner + "</aside>" + rest[cm.end():])
            rebuilt.append('<section class="stage%s">%s%s</section>' % (" speech" if is_speech else "", h2, rest))
        body = "".join(rebuilt)

    side_label = {"pro": "正方", "con": "反方", "both": "正反双方"}[side]
    head = ('<table class="page"><thead><tr><td class="pagehead">%s<span class="r">%s · %s</span></td></tr></thead>'
            '<tbody><tr><td class="pagebody">' % (html.escape(title), KIND_LABEL[kind], side_label))
    return head + body + "</td></tr></tbody></table>"


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
