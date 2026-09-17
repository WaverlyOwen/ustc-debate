#!/usr/bin/env python3
"""Convert a legacy Markdown debate document (the pre-LaTeX template) into a .tex
file written against assets/latex/debate.cls.

Usage:
    python3 md2tex.py prep/<题>/            # every .md in the folder
    python3 md2tex.py prep/<题>/速查-*.md

This is a migration tool for documents produced before the skill switched to
LaTeX as the source format. It reads the same conventions the old md2pdf.py
rendered (labelled lists become fields, the roles 主张 / 机制 / 学理 … pick the
macro, tables are recognised by their headers, script sections become
\\begin{speech} / \\begin{stage}). New documents are written in LaTeX directly
from the templates in assets/; this file is not part of the normal workflow.
"""
import argparse
import glob
import os
import re
import sys

# ------------------------------------------------------------ inline text --
SUBLABELS = ("有利之处", "合理性", "核心主张", "支撑", "边界", "口头版", "出处", "来源", "方法", "主要发现", "局限",
             "代表性", "贴合度", "状态", "补充学理", "词典义", "学术义", "法规义", "行业义", "国际组织义", "自律口径",
             "正方的自律口径", "反方的自律口径", "反方如何反驳它", "正方如何反驳它", "反方如何反驳", "正方如何反驳",
             "正方需要证明", "反方需要证明", "打法", "回应", "查证方向", "赛场口头引用", "百科义", "学界表述", "官方文件的间接界定",
             "在中立判准下，正方需要证明", "在中立判准下，反方需要证明", "理由")
SUB_RE = re.compile(r"(?:^|(?<=[。；;）)（(\s\"”’」』】]))\s*(?:\*\*)?(" + "|".join(map(re.escape, sorted(SUBLABELS, key=len, reverse=True)))
                    + r")(?:\*\*)?\s*[：:]\s*")
BOLD_SUB_RE = re.compile(r"(?:^|(?<=[。；;）)（(\s\"”’」』】]))\s*\*\*([^*：:]{2,14})\*\*\s*[：:]\s*")
LABEL_RE = re.compile(r"^\s*(?:在中立判准下[，,]\s*)?\*\*([^*]{1,40}?)\*\*(\s*[（(][^（）()]{1,30}[）)])?\s*[：:]\s*(.*)$", re.S)


def esc(s):
    """Escape plain text for LaTeX (no markdown inside)."""
    s = s.replace("\\", "\x00BS\x00")
    for a, b in (("&", r"\&"), ("%", r"\%"), ("$", r"\$"), ("#", r"\#"), ("_", r"\_"), ("{", r"\{"), ("}", r"\}"),
                 ("~", r"\textasciitilde{}"), ("^", r"\^{}")):
        s = s.replace(a, b)
    s = s.replace("\x00BS\x00", r"\textbackslash{}")
    return s


def quotes(s):
    s = re.sub(r'"([^"\n]*?)"', "“\\1”", s)
    s = re.sub(r"(?<![A-Za-z])'([^'\n]{1,40}?)'(?![A-Za-z])", "‘\\1’", s)
    return s


def inline(s, stress=False):
    """Markdown inline → LaTeX. **x** becomes \\textbf (or \\stress in speeches)."""
    s = quotes(s)
    parts = []
    pos = 0
    token = re.compile(r"(`[^`]+`|\[([^\]]+)\]\((https?://[^)\s]+)\)|https?://[^\s）)】>,，。；;\"”]+|\*\*(.+?)\*\*|\*([^*\n]+?)\*|<br\s*/?>)")
    for m in token.finditer(s):
        parts.append(esc(s[pos:m.start()]))
        t = m.group(0)
        if t.startswith("`"):
            parts.append(r"\texttt{%s}" % esc(t[1:-1]))
        elif t.startswith("["):
            parts.append(r"\href{%s}{%s}" % (m.group(3).replace("%", r"\%").replace("#", r"\#"), inline(m.group(2))))
        elif t.startswith("http"):
            parts.append(r"\url{%s}" % t.replace("%", r"\%").replace("#", r"\#"))
        elif t.startswith("**"):
            inner = inline(m.group(4), stress=False)
            parts.append((r"\stress{%s}" if stress else r"\textbf{%s}") % inner)
        elif t.startswith("*"):
            parts.append(r"\emph{%s}" % inline(m.group(5)))
        else:
            parts.append(r"\\ ")
        pos = m.end()
    parts.append(esc(s[pos:]))
    out = "".join(parts)
    out = re.sub(r"〔([^〕]*)〕", lambda m: r"\aside{%s}" % m.group(1), out)
    return out


def split_subs(text):
    marks = [(m.start(), m.end(), m.group(1)) for m in SUB_RE.finditer(text)]
    for m in BOLD_SUB_RE.finditer(text):
        if not any(abs(m.start() - x[0]) < 3 for x in marks):
            marks.append((m.start(), m.end(), m.group(1)))
    marks.sort()
    if not marks:
        return text.strip(), []
    main = text[:marks[0][0]].strip()
    subs = []
    for i, (st, en, lab) in enumerate(marks):
        end = marks[i + 1][0] if i + 1 < len(marks) else len(text)
        subs.append((lab, text[en:end].strip()))
    return main, subs


STATUS_RE = re.compile(r"^\**(已核实|有把握|【待核实】|待核实)\**\s*(.*)$", re.S)


def render_subs(subs, stress=False):
    out = []
    for lab, body in subs:
        m = STATUS_RE.match(body.strip())
        if lab == "状态" and m:
            body = r"\status{%s}" % m.group(1).strip("【】") + (" " + inline(m.group(2)) if m.group(2).strip() else "")
        else:
            body = inline(body, stress)
        out.append(r"\sub{%s}{%s}" % (inline(lab), body))
    return "".join(out)


def chip(cell):
    c = cell.strip().strip("*")
    if c in ("已核实", "有把握", "【待核实】", "待核实"):
        return r"\status{%s}" % c.strip("【】")
    if c in ("偏正", "略偏正", "偏反", "略偏反", "均衡"):
        return r"\lean{%s}" % c
    if c in ("最终", "淘汰", "常见", "双方"):
        return r"\srctag{%s}" % c
    return inline(cell)


# ------------------------------------------------------------ block parser --
class Item:
    def __init__(self, indent, ordered, text):
        self.indent, self.ordered, self.text, self.children = indent, ordered, text, []


def parse_list(lines, i):
    """Parse consecutive list lines (with continuation) starting at i → (root items, next i)."""
    root = []
    stack = []  # (indent, item)
    while i < len(lines):
        ln = lines[i]
        m = re.match(r"^(\s*)([-*+]|\d+[.)])\s+(.*)$", ln)
        if m:
            indent = len(m.group(1).replace("\t", "    "))
            it = Item(indent, m.group(2)[0].isdigit(), m.group(3))
            while stack and stack[-1][0] >= indent:
                stack.pop()
            (stack[-1][1].children if stack else root).append(it)
            stack.append((indent, it))
            i += 1
        elif ln.strip() == "":
            # blank line: list continues only if the next non-blank line is a list item
            j = i + 1
            while j < len(lines) and lines[j].strip() == "":
                j += 1
            if j < len(lines) and re.match(r"^\s*([-*+]|\d+[.)])\s+", lines[j]) and stack:
                i = j
            else:
                break
        elif stack and re.match(r"^\s{2,}\S", ln):
            stack[-1][1].text += " " + ln.strip()
            i += 1
        else:
            break
    return root, i


def parse_blocks(lines):
    """Yield (kind, payload): heading (level, text) | table (rows) | list (items) | quote (lines) | para (text) | bold (text)."""
    i = 0
    n = len(lines)
    while i < n:
        ln = lines[i]
        s = ln.strip()
        if not s:
            i += 1
            continue
        if re.match(r"^-{3,}$|^\*{3,}$", s):
            i += 1
            continue
        m = re.match(r"^(#{1,4})\s+(.*)$", s)
        if m:
            yield "heading", (len(m.group(1)), m.group(2).strip())
            i += 1
            continue
        if s.startswith("|"):
            rows = []
            while i < n and lines[i].strip().startswith("|"):
                cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                if not all(set(c) <= set("-: ") for c in cells):
                    rows.append(cells)
                i += 1
            yield "table", rows
            continue
        if re.match(r"^\s*([-*+]|\d+[.)])\s+", ln):
            items, i = parse_list(lines, i)
            yield "list", items
            continue
        if s.startswith(">"):
            q = []
            while i < n and lines[i].strip().startswith(">"):
                q.append(lines[i].strip()[1:].strip())
                i += 1
            yield "quote", q
            continue
        if re.match(r"^\*\*[^*]+\*\*[^*]*$", s) and len(s) < 80:
            yield "bold", s
            i += 1
            continue
        para = [s]
        i += 1
        while i < n and lines[i].strip() and not re.match(r"^(#{1,4}\s|\||\s*([-*+]|\d+[.)])\s|>|\*\*[^*]+\*\*[^*]*$)", lines[i]) \
                and not re.match(r"^-{3,}$", lines[i].strip()):
            para.append(lines[i].strip())
            i += 1
        yield "para", " ".join(para)


# ------------------------------------------------------------ renderers --
def side_of(text):
    pro = any(k in text for k in ("正方", "正一", "正二", "正三", "正四"))
    con = any(k in text for k in ("反方", "反一", "反二", "反三", "反四"))
    if pro and not con:
        return "pro"
    if con and not pro:
        return "con"
    return None


def role_for(label):
    l = re.sub(r"[（(].*?[）)]", "", label).strip()
    if l in ("主张", "判准是什么", "结论", "持方优劣评估", "辩题性质"):
        return "lead"
    if l.startswith("机制"):
        return "steps"
    if l in ("学理", "数据", "案例", "补充学理"):
        return "evidence"
    if l.startswith("回扣"):
        return "closing"
    if "最强攻击" in l or l == "攻防":
        return "clash"
    if l in ("正方有利定义", "反方有利定义", "正方有利判准", "反方有利判准"):
        return "card"
    if l in ("中立定义", "中立判准"):
        return "neutral"
    if "定义杀" in l or "打法" in l or "要防" in l:
        return "card"
    if l.endswith("一句话立论"):
        return "thesis"
    if l == "论据核实":
        return "skip"
    if l == "时间表":
        return "timeline"
    if "背下来" in l or "清单" in l:
        return "checklist"
    return ""


def is_labelled(items):
    if not items or not LABEL_RE.match(items[0].text):
        return False
    k = sum(1 for it in items if LABEL_RE.match(it.text))
    return k >= max(1, round(len(items) * 0.6))


def render_items(items, ctx, depth=0):
    if is_labelled(items):
        return render_fields(items, ctx, depth)
    ordered = items[0].ordered
    env = "enumerate" if ordered else "bullets"
    out = [r"\begin{%s}" % env + ("[leftmargin=1.8em,itemsep=2pt,topsep=2pt]" if ordered else "")]
    for it in items:
        out.append(r"\item " + inline(it.text, ctx.get("stress", False)))
        if it.children:
            out.append(render_items(it.children, ctx, depth + 1))
    out.append(r"\end{%s}" % env)
    return "\n".join(out)


def first_sentence(text):
    m = re.match(r"\s*(.{4,70}?[。．.！？])\s*(.*)$", text, re.S)
    return (m.group(1).strip(), m.group(2).strip()) if m else (text.strip(), "")


def render_fields(items, ctx, depth=0):
    out = [r"\begin{fields}"]
    pending = None
    for it in items:
        m = LABEL_RE.match(it.text)
        if not m:
            # stray unlabelled item: attach as a bullet under the previous field
            if pending is not None:
                pending.children.append(it)
            continue
        label, suffix, rest = m.group(1).strip(), (m.group(2) or "").strip(), m.group(3)
        pending = it
        role = role_for(label)
        side = side_of(label)
        full_label = label + (" " + suffix if suffix else "")
        main, subs = split_subs(rest)
        kids = [k for k in it.children]
        if role == "skip":
            continue
        if role == "lead":
            cmd = {"pro": r"\proclaim", "con": r"\conclaim"}.get(side, r"\claim")
            out.append(r"%s[%s]{%s%s}" % (cmd, inline(full_label), inline(main), render_subs(subs)))
        elif role == "steps":
            steps = []
            if kids and kids[0].ordered:
                steps = [k.text for k in kids]; kids = []
            elif re.search(r"[（(]\s*[1１一]\s*[）)]", main):
                steps = [p.strip() for p in re.split(r"[（(]\s*[0-9０-９一二三四五六七八九]+\s*[）)]", main) if p.strip()]
                main = ""
            elif main.count("→") >= 2:
                steps = [p.strip() for p in main.split("→") if p.strip()]
                main = ""
            out.append(r"\begin{mechanism}[%s]" % inline(full_label))
            if main:
                out.append(inline(main))
            for st in steps:
                out.append(r"\step " + inline(st))
            out.append(render_subs(subs))
            out.append(r"\end{mechanism}")
        elif role == "evidence":
            status = None
            keep = []
            for lab, sb in subs:
                sm = STATUS_RE.match(sb.strip())
                if lab == "状态" and sm and status is None:
                    status = sm.group(1).strip("【】")
                    if sm.group(2).strip():
                        keep.append(("状态说明", sm.group(2).strip()))
                    continue
                keep.append((lab, sb))
            kind = re.sub(r"[（(].*?[）)]", "", label).strip()
            out.append(r"\begin{evidence}{%s}%s" % (inline(kind + (suffix if suffix else "")), ("[%s]" % status) if status else ""))
            out.append(inline(main) + render_subs(keep))
            out.append(r"\end{evidence}")
        elif role == "closing":
            out.append(r"\closing[%s]{%s%s}" % (inline(full_label), inline(main), render_subs(subs)))
        elif role == "clash":
            out.append(r"\begin{clash}[%s]" % inline(full_label))
            if main:
                out.append(inline(main))
            for k in kids:
                txt = k.text.strip()
                pm = re.match(r"(?:\*\*)?攻击(?:\s*[A-Za-z0-9一二三四五六七八九]+)?(?:（[^）]*）)?(?:\*\*)?\s*[：:]\s*(.*?)\s*(?:→|->|—>)\s*(?:\*\*)?回应(?:（[^）]*）)?(?:\*\*)?\s*[：:]\s*(.*)$", txt, re.S)
                if pm:
                    out.append(r"\pair{%s}{%s}" % (inline(pm.group(1)), inline(pm.group(2))))
                else:
                    out.append(r"\pair{%s}{}" % inline(txt))
            kids = []
            out.append(r"\end{clash}")
        elif role in ("card", "neutral"):
            env = "neutralcard" if role == "neutral" else {"pro": "procard", "con": "concard"}.get(side, "sidecard")
            open_ = r"\begin{%s}{%s}" % (env, inline(full_label)) if env != "sidecard" else r"\begin{sidecard}{%s}" % inline(full_label)
            body = ""
            if role == "card" and ("定义" in label or "判准" in label):
                one, restm = first_sentence(main)
                body = r"\definition{%s}%s" % (inline(one), inline(restm))
            else:
                body = inline(main)
            out.append(open_ + body + render_subs(subs) + r"\end{%s}" % env)
        elif role == "thesis":
            who = "正方" if label.startswith("正方") else "反方" if label.startswith("反方") else "双方"
            out.append(r"\thesis{%s}{%s}" % (who, inline(main + " " + " ".join(b for _, b in subs))))
        elif role == "timeline":
            out.append(r"\begin{timeline}[%s]" % inline(full_label))
            if main:
                out.append(inline(main))
            for k in kids:
                cm = re.match(r"\s*(?:\*\*)?([^：:*]{2,14})(?:\*\*)?\s*[：:]\s*(.*)$", k.text.strip(), re.S)
                out.append(r"\when{%s}{%s}" % ((inline(cm.group(1)), inline(cm.group(2))) if cm else ("", inline(k.text))))
            kids = []
            out.append(r"\end{timeline}")
        elif role == "checklist":
            out.append(r"\begin{checklist}[%s]" % inline(full_label))
            if main:
                out.append(r"\item " + inline(main))
            for k in kids:
                out.append(r"\item " + inline(k.text))
            kids = []
            out.append(r"\end{checklist}")
        else:
            body = inline(main, ctx.get("stress", False)) + render_subs(subs)
            if len(re.findall(r"(?:^|\s)[1-9]\.\s", main)) >= 2 and not kids:
                head, *parts = re.split(r"(?:^|\s)[1-9]\.\s", main)
                body = inline(head) + r"\begin{enumerate}[leftmargin=1.8em,itemsep=1pt,topsep=1pt]" + "".join(r"\item " + inline(p) for p in parts if p.strip()) + r"\end{enumerate}" + render_subs(subs)
            out.append(r"\field{%s}{%s" % (inline(full_label), body))
            if kids:
                out.append(render_items(kids, ctx, depth + 1))
            out.append("}")
            kids = []
        if kids:
            # remaining children of a role field: nest as bullets after it
            out[-1] = out[-1]  # keep
            out.append(render_items(kids, ctx, depth + 1))
    out.append(r"\end{fields}")
    return "\n".join(out)


def col(heads, key):
    for i, h in enumerate(heads):
        if key in h:
            return i
    return None


def render_table(rows, ctx):
    heads = rows[0]
    body = rows[1:]

    def g(r, i):
        return r[i].strip() if i is not None and i < len(r) else ""
    if heads and heads[0] == "块" and any("环节" in h for h in heads):
        out = [r"\begin{flowtable}"]
        last = None
        for r in body:
            blk = g(r, 0)
            if blk and blk != last:
                out.append(r"\block{%s}" % inline(blk)); last = blk
            out.append(r"\flow{%s}{%s}{%s}{%s}" % tuple(inline(g(r, i)) for i in (1, 2, 3, 4)))
        out.append(r"\end{flowtable}")
        return "\n".join(out)
    if heads and heads[0] == "#" and any("一句话反驳" in h for h in heads):
        ic = next((i for i, h in enumerate(heads) if h.endswith("论点")), 1)
        i1, i2, i3, i4 = col(heads, "一句话反驳"), col(heads, "展开反驳"), col(heads, "追问"), col(heads, "来源")
        out = [r"\begin{rebuttals}"]
        for r in body:
            out.append(r"\rebuttal{%s}{%s}{%s}{%s}{%s}{%s}" % (inline(g(r, 0)), inline(g(r, ic)), inline(g(r, i1)), inline(g(r, i2)), inline(g(r, i3)), g(r, i4).strip("*")))
        out.append(r"\end{rebuttals}")
        return "\n".join(out)
    if heads and heads[0] == "#" and any("出处" in h for h in heads) and any("核实日期" in h for h in heads):
        ic, isrc, iq, idt, ist, iu, idr = (col(heads, k) for k in ("论据", "出处", "原文引句", "核实日期", "状态", "用在", "查证方向"))
        out = [r"\begin{sourcelist}"]
        for r in body:
            st = g(r, ist).strip("*").strip("【】")
            vals = [inline(g(r, 0)), inline(g(r, ic)), inline(g(r, isrc)), inline(g(r, iq)), inline(g(r, idt)), st, inline(g(r, iu)), inline(g(r, idr))]
            vals = ["" if v in ("—", "-", "–") else v for v in vals]
            out.append(r"\source{%s}{%s}{%s}{%s}{%s}{%s}{%s}{%s}" % tuple(vals))
        out.append(r"\end{sourcelist}")
        return "\n".join(out)
    if heads and heads[0] == "类别" and any("标准表述" in h for h in heads):
        it, isd, ia, ifb, isrc = (col(heads, k) for k in ("标签", "标准表述", "允许", "禁止", "出处"))
        out = [r"\begin{canon}{%s}" % ctx.get("canon_side", "")]
        last = None
        for r in body:
            cat = g(r, 0)
            if cat and cat != last:
                out.append(r"\canongroup{%s}" % inline(cat)); last = cat
            fb = g(r, ifb)
            fb = "" if fb in ("—", "-", "–") else fb
            out.append(r"\canonrow{%s}{%s}{%s}{%s}{%s}" % (inline(g(r, it)), inline(g(r, isd)), inline(g(r, ia)), inline(fb), inline(g(r, isrc))))
        out.append(r"\end{canon}")
        return "\n".join(out)
    if heads and heads[0] == "维度":
        out = [r"\begin{assessment}"]
        for r in body:
            out.append(r"\assess{%s}{%s}{%s}" % (inline(g(r, 0)), inline(g(r, 1)), g(r, 2).strip("*")))
        out.append(r"\end{assessment}")
        return "\n".join(out)
    if len(heads) == 2 and ("会问" in heads[0] or "对方" in heads[0]) and ("回答" in heads[1] or "我方" in heads[1] or "答" in heads[1]):
        out = [r"\begin{qa}[%s][%s]" % (inline(heads[0]), inline(heads[1]))]
        for r in body:
            out.append(r"\qarow{%s}{%s}" % (inline(g(r, 0)), inline(g(r, 1))))
        out.append(r"\end{qa}")
        return "\n".join(out)
    if len(heads) == 3 and "二辩" in heads[1] and "四辩" in heads[2]:
        out = [r"\begin{qaa}[%s][%s][%s]" % tuple(inline(h) for h in heads)]
        for r in body:
            out.append(r"\qaarow{%s}{%s}{%s}" % (inline(g(r, 0)), inline(g(r, 1)), inline(g(r, 2))))
        out.append(r"\end{qaa}")
        return "\n".join(out)
    # generic: longtable with widths weighted by content length
    ncol = len(heads)
    lens = []
    for i in range(ncol):
        cells = [g(r, i) for r in body] + [heads[i]]
        lens.append(max(6, min(60, sum(len(c) for c in cells) / max(1, len(cells)))))
    total = sum(lens)
    spec = "".join(r"L{\dimexpr%.3f\linewidth-%d\tabcolsep}" % (l / total, 2 * (ncol - 1) if i == 0 else 0) for i, l in enumerate(lens))
    # distribute the tabcolsep subtraction across all columns instead
    spec = "".join(r"L{\dimexpr%.3f\linewidth-%.2f\tabcolsep}" % (l / total, 2.0 * (ncol - 1) / ncol) for l in lens)
    out = [r"\begin{longtable}{@{}%s@{}}" % spec, r"\toprule " + " & ".join(r"\thead{%s}" % inline(h) for h in heads) + r"\\\midrule\endhead"]
    for r in body:
        out.append(" & ".join(chip(g(r, i)) for i in range(ncol)) + r"\\")
    out.append(r"\bottomrule\end{longtable}")
    return "\n".join(out)


def render_quote(lines, ctx):
    out = []
    text = " ".join(l for l in lines if l)
    parts = re.split(r"(?=\*\*[^*]{2,14}\*\*\s*[：:])", text)
    for p in parts:
        p = p.strip()
        if not p:
            continue
        m = re.match(r"\*\*([^*]{2,14})\*\*\s*[：:]\s*(.*)$", p, re.S)
        if m:
            out.append(r"\begin{thesisbox}[%s]%s\end{thesisbox}" % (inline(m.group(1)), inline(m.group(2))))
        else:
            out.append(r"\begin{thesisbox}%s\end{thesisbox}" % inline(p))
    return "\n".join(out)


# ------------------------------------------------------------ documents --
def parse_title(h1):
    kind = "prep"
    t = h1
    m = re.match(r"^(备赛文档|正赛速查|正赛文稿|备赛手册)[：:]\s*(.*)$", t)
    if m:
        kind = {"正赛速查": "quick", "正赛文稿": "script"}.get(m.group(1), "prep")
        t = m.group(2)
    stance = None
    bm = re.search(r"[（(]\s*(正方|反方)\s*[：:]\s*(.*?)\s*[）)]\s*$", t)
    if bm:
        stance = (bm.group(1), bm.group(2))
        t = t[:bm.start()].strip()
    return kind, t.strip(), stance


def convert(md_text, filename):
    lines = md_text.split("\n")
    blocks = list(parse_blocks(lines))
    if not blocks or blocks[0][0] != "heading" or blocks[0][1][0] != 1:
        raise ValueError("%s: no H1 title" % filename)
    kind, motion, stance = parse_title(blocks[0][1][1])
    base = os.path.basename(filename)
    if "速查" in base:
        kind = "quick"
    elif "文稿" in base:
        kind = "script"
    side = "pro" if "正方" in base else "con" if "反方" in base else "both"
    out = [r"\documentclass[%s,%s]{debate}" % (kind, side), r"\motion{%s}" % inline(motion)]
    if stance:
        out.append(r"\stance{%s}{%s}" % (stance[0], inline(stance[1])))
    ctx = {"kind": kind, "stress": False}
    i = 1
    extras = []
    # meta list right after the title
    if i < len(blocks) and blocks[i][0] == "list" and is_labelled(blocks[i][1]):
        for it in blocks[i][1]:
            m = LABEL_RE.match(it.text)
            if not m:
                continue
            lab, val = m.group(1).strip(), m.group(3).strip()
            if lab in ("赛制", "生成日期", "口径来源", "比赛日期", "持方"):
                out.append(r"\meta{%s}{%s}" % (inline(lab), inline(val)))
            elif lab in ("上场纪律",):
                extras.append(r"\begin{contingency}%s\end{contingency}" % inline(val))
            else:
                extras.append(r"\begin{thesisbox}[%s]%s\end{thesisbox}" % (inline(lab), inline(val)))
        i += 1
    out.append(r"\begin{document}")
    out.append(r"\debatetitle")
    out.extend(extras)

    body = render_body(blocks[i:], ctx)
    out.append(body)
    out.append(r"\end{document}")
    return "\n".join(out) + "\n"


def render_body(blocks, ctx):
    out = []
    open_env = []          # stack of env names to close: speech / stage / summary / warnbox / battleground
    cur_section_side = None
    chain_open = False
    kind = ctx["kind"]

    def close_to(level):
        """Close open block envs down to `level` items on the stack."""
        nonlocal chain_open
        if chain_open:
            out.append(r"\end{chain}"); chain_open = False
        while len(open_env) > level:
            out.append(r"\end{%s}" % open_env.pop())

    for kind_b, payload in blocks:
        if kind_b == "heading":
            level, text = payload
            if level == 2:
                close_to(0)
                ctx["stress"] = False
                if kind == "script":
                    nm = re.match(r"(\d+)[.、]\s*(.+?)(?:（(.+?)）)?\s*$", text)
                    if nm:
                        title = "%s. %s" % (nm.group(1), nm.group(2))
                        meta = nm.group(3) or ""
                        is_speech = "稿" in nm.group(2) and "预案" not in nm.group(2)
                        env = "speech" if is_speech else "stage"
                        out.append(r"\begin{%s}{%s}{%s}" % (env, inline(title), inline(meta)))
                        open_env.append(env)
                        ctx["stress"] = is_speech
                        continue
                    out.append(r"\section{%s}" % inline(text))
                    continue
                if "结论速览" in text:
                    out.append(r"\begin{summary}")
                    open_env.append("summary")
                    continue
                if kind == "quick" and "如果" in text and "就" in text:
                    out.append(r"\section{%s}" % inline(text))
                    out.append(r"\begin{contingency}")
                    open_env.append("contingency")
                    continue
                sd = side_of(text)
                cur_section_side = sd
                cmd = {"pro": r"\prosection", "con": r"\consection"}.get(sd, r"\section")
                out.append(r"%s{%s}" % (cmd, inline(text)))
            elif level == 3:
                close_to(1 if open_env and open_env[0] in ("speech", "stage") else 0)
                if "定义杀" in text:
                    out.append(r"\begin{warnbox}{%s}" % inline(text))
                    open_env.append("warnbox")
                    continue
                if "战场" in text:
                    out.append(r"\begin{battleground}{%s}" % inline(text))
                    open_env.append("battleground")
                    continue
                sd = side_of(text) or cur_section_side
                cmd = {"pro": r"\prosubsection", "con": r"\consubsection"}.get(sd, r"\subsection")
                if "论点" not in text and "口径表" not in text:
                    cmd = r"\subsection"
                out.append(r"%s{%s}" % (cmd, inline(text)))
            else:
                out.append(r"\subsubsection{%s}" % inline(text))
            continue

        if kind_b == "bold":
            m = re.match(r"^\*\*(.+?)\*\*\s*(.*)$", payload)
            head, rest = m.group(1).strip(), m.group(2).strip()
            if re.match(r"^链[一二三四五六七八九十0-9]", head) or head.startswith("奇袭质询"):
                if chain_open:
                    out.append(r"\end{chain}")
                goal = rest.strip("（）() ")
                goal = re.sub(r"^目标[：:]\s*", "", goal)
                gm = re.match(r"^(.*?)(?:（(目标[：:].*)）)?$", head)
                if gm and gm.group(2):
                    head, goal = gm.group(1), re.sub(r"^目标[：:]\s*", "", gm.group(2))
                out.append(r"\begin{chain}{%s}{%s}" % (inline(head), inline(goal)))
                chain_open = True
                continue
            if chain_open:
                out.append(r"\end{chain}"); chain_open = False
            if re.match(r"^如果", head) and not rest:
                out.append(r"\begin{contingency}")
                open_env.append("contingency")
                continue
            if head.startswith("奇袭申论"):
                sm = re.search(r"正文\s*\d+\s*字\s*/\s*\d+\s*秒", head + rest)
                out.append(r"\begin{speech}{奇袭申论稿}{%s}" % inline(sm.group(0) if sm else "120 秒"))
                open_env.append("speech")
                ctx["stress"] = True
                continue
            # a bold pseudo heading: 必问 / 必答 / 总目标 / 原则 …
            if rest.startswith("：") or rest.startswith(":"):
                out.append(r"\field{%s}{%s}" % (inline(head), inline(rest[1:].strip())) if False else
                           r"\textbf{%s}：%s" % (inline(head), inline(rest[1:].strip())))
            else:
                ctx["pending_points"] = inline(head + (" " + rest if rest else ""))
            continue

        if kind_b == "list":
            items = payload
            if chain_open:
                for it in items:
                    q = it.text.strip()
                    if re.match(r"^\**(打断用语|收束语)", q):
                        cm = re.match(r"^\**(打断用语|收束语)\**\s*[：:]\s*(.*)$", q)
                        if cm:
                            out.append((r"\cut{%s}" if cm.group(1) == "打断用语" else r"\close{%s}") % inline(cm.group(2)))
                        continue
                    parts = re.split(r"\s*(?:→|->|—>)\s*", q, maxsplit=1)
                    qt, branch = parts[0].strip(), (parts[1].strip() if len(parts) == 2 else "")
                    qm = re.match(r'^(（[^）]*）\s*)?["“]([^"”]+)["”]\s*(（[^）]*）)?\s*$', qt)
                    if qm:
                        qt = (qm.group(1) or "") + qm.group(2) + (qm.group(3) or "")
                    if not branch and it.children:
                        branch = "；".join(c.text.strip() for c in it.children)
                    out.append(r"\q{%s}{%s}" % (inline(qt), inline(branch)))
                continue
            if open_env and open_env[-1] == "contingency":
                for it in items:
                    t = it.text
                    t = re.sub(r"^\*\*如果……就……\*\*[：:]?\s*", "", t)
                    t = re.sub(r"^如果", "", t.strip())
                    parts = re.split(r"\s*(?:→|->|—>)\s*", t, maxsplit=1)
                    cond, act = (parts[0], parts[1]) if len(parts) == 2 else (parts[0], "")
                    out.append(r"\ifthen{%s}{%s}" % (inline(cond.strip()), inline(act.strip())))
                continue
            if (len(items) == 1 and re.match(r"^\**如果[^*]*就[^*]*\**\s*[：:]?\s*$", items[0].text.strip()) and items[0].children) \
                    or (ctx.get("stress") and all(re.match(r"^\**如果", it.text.strip()) for it in items)):
                if not (len(items) == 1 and items[0].children):
                    items = [Item(0, False, "如果……就……")]
                    items[0].children = payload
                out.append(r"\begin{contingency}")
                for it in items[0].children:
                    t = re.sub(r"^如果", "", it.text.strip())
                    parts = re.split(r"\s*(?:→|->|—>)\s*", t, maxsplit=1)
                    cond, act = (parts[0], parts[1]) if len(parts) == 2 else (parts[0], "")
                    out.append(r"\ifthen{%s}{%s}" % (inline(cond.strip()), inline(act.strip())))
                out.append(r"\end{contingency}")
                continue
            if ctx.get("pending_points"):
                out.append(r"\begin{points}{%s}" % ctx.pop("pending_points"))
                for it in items:
                    out.append(r"\item " + inline(it.text))
                    if it.children:
                        out.append(render_items(it.children, ctx))
                out.append(r"\end{points}")
                continue
            out.append(render_items(items, ctx))
            continue

        if kind_b == "table":
            ctx["canon_side"] = "正方" if cur_section_side == "pro" else "反方" if cur_section_side == "con" else ""
            out.append(render_table(payload, ctx))
            continue

        if kind_b == "quote":
            out.append(render_quote(payload, ctx))
            continue

        if kind_b == "para":
            text = payload
            if chain_open:
                cm = re.match(r"^\**(打断用语|收束语)\**\s*[：:]\s*(.*)$", text)
                if cm:
                    out.append((r"\cut{%s}" if cm.group(1) == "打断用语" else r"\close{%s}") % inline(cm.group(2)))
                    continue
                out.append(r"\end{chain}"); chain_open = False
            m = re.match(r"^\**(打断用语|收束语)\**\s*[：:]\s*(.*)$", text)
            if m:
                out.append((r"\cut{%s}" if m.group(1) == "打断用语" else r"\close{%s}") % inline(m.group(2)))
                continue
            if ctx.get("stress") and re.match(r"^【[^】]*临场[^】]*】", text):
                out.append(r"\reserve{%s}" % inline(text.strip("【】")))
                continue
            out.append(inline(text, ctx.get("stress", False)))
            out.append("")
            continue
    close_to(0)
    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("paths", nargs="+")
    ap.add_argument("--out-dir")
    args = ap.parse_args()
    files = []
    for p in args.paths:
        if os.path.isdir(p):
            files += sorted(glob.glob(os.path.join(p, "*.md")))
        else:
            files.append(p)
    rc = 0
    for f in files:
        if os.path.basename(f).startswith("摘要") or os.path.basename(f) == "reply.md":
            continue
        try:
            tex = convert(open(f, encoding="utf-8").read(), f)
        except Exception as e:  # noqa: BLE001
            print("FAIL %s: %s" % (f, e))
            rc = 1
            continue
        out = os.path.join(args.out_dir or os.path.dirname(f), os.path.splitext(os.path.basename(f))[0] + ".tex")
        with open(out, "w", encoding="utf-8") as fh:
            fh.write(tex)
        print("OK   %s -> %s" % (f, out))
    return rc


if __name__ == "__main__":
    sys.exit(main())
