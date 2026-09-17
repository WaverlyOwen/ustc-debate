"""Shared LaTeX reading for the debate-prep checkers.

The documents are written against assets/latex/debate.cls, whose macros are
semantic (\\begin{speech}, \\q{…}{…}, \\source{…}×8, \\stress{…}, \\aside{…}).
The checkers never guess from layout: they read those macros.

    read(path)            file text with % comments removed
    balanced(text, i)     index just past the {…} group that starts at text[i] == "{"
    args(text, i, n)      n brace-groups starting at text[i], returns (list, end)
    sections(text)        [(kind, title, meta, body)] for speech / stage / section
    plain(text)           the spoken/read text of a fragment, macros stripped
    spoken(text)          plain() minus \\aside{…} and \\reserve{…}
    questions(body)       (chains, [question text …]) from \\q{…}{…}
    sources(text)         [dict] from \\source{#}{论据}{出处}{原文引句}{核实日期}{状态}{用在}{查证方向}
    stresses(body)        the \\stress{…} contents
"""
import re

COMMENT = re.compile(r"(?<!\\)%.*")
NOT_SPOKEN = ("aside", "reserve")


def read(path):
    with open(path, encoding="utf-8") as fh:
        return COMMENT.sub("", fh.read())


def balanced(text, i):
    """text[i] must be '{'; return index after the matching '}'."""
    depth = 0
    n = len(text)
    while i < n:
        c = text[i]
        if c == "\\":
            i += 2
            continue
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    return n


def args(text, i, n):
    out = []
    while len(out) < n:
        while i < len(text) and text[i] in " \t\n":
            i += 1
        if i >= len(text) or text[i] != "{":
            break
        j = balanced(text, i)
        out.append(text[i + 1:j - 1])
        i = j
    return out, i


def _envs(text, name):
    """(title, meta, body, start, end) for every \\begin{name}{title}{meta} … \\end{name}."""
    out = []
    for m in re.finditer(r"\\begin\{%s\}" % re.escape(name), text):
        a, i = args(text, m.end(), 2)
        end = text.find("\\end{%s}" % name, i)
        if end < 0:
            end = len(text)
        title = a[0] if a else ""
        meta = a[1] if len(a) > 1 else ""
        out.append((title, meta, text[i:end], m.start(), end))
    return out


def sections(text):
    """Speeches and stages in a 文稿, or \\section blocks in a 备赛文档 / 速查.

    Each item is (kind, title, meta, body) with kind in {"speech", "stage", "section"}.
    The title of a speech is joined with its meta as '标题（meta）' so that the
    heading strings match the format file's 「各持方文稿标题」 table exactly.
    """
    items = []
    for name in ("speech", "stage"):
        for title, meta, body, start, end in _envs(text, name):
            items.append((start, name, title, meta, body))
    if not items:
        heads = list(re.finditer(r"\\(?:pro|con)?section\*?\{", text))
        for k, m in enumerate(heads):
            j = balanced(text, m.end() - 1)
            title = plain(text[m.end():j - 1])
            body_end = heads[k + 1].start() if k + 1 < len(heads) else len(text)
            items.append((m.start(), "section", title, "", text[j:body_end]))
    items.sort()
    return [(k, t, m, b) for _, k, t, m, b in items]


def heading(title, meta):
    return "%s（%s）" % (title, meta) if meta else title


_KEEP_ARG = ("textbf", "emph", "stress", "textcolor", "href", "url", "sub", "field", "claim", "closing",
             "proclaim", "conclaim", "definition", "when", "q", "qarow", "qaarow", "flow", "canonrow",
             "assess", "rebuttal", "pair", "ifthen", "cut", "close", "item", "thesis", "meta", "status",
             "lean", "srctag", "thead", "texttt", "textit", "source", "canongroup", "block", "step",
             "makebox", "parbox", "mbox", "texorpdfstring")


def plain(text, drop=()):
    """Strip macros to running text. Macros in `drop` disappear with their argument."""
    t = text
    # drop whole macros with one argument
    for name in drop:
        pos = 0
        while True:
            m = re.search(r"\\%s\s*\{" % name, t[pos:])
            if not m:
                break
            s = pos + m.start()
            e = balanced(t, pos + m.end() - 1)
            t = t[:s] + " " + t[e:]
            pos = s
    # table preambles (nested braces, dimension arithmetic) are not text
    for env, nargs in (("longtable", 1), ("tabularx", 2), ("tabular", 1)):
        pos = 0
        while True:
            m = re.search(r"\\begin\{%s\}" % env, t[pos:])
            if not m:
                break
            st = pos + m.start()
            _, en = args(t, pos + m.end(), nargs)
            t = t[:st] + " " + t[en:]
            pos = st
    t = re.sub(r"\\begin\{[^}]*\}(\[[^\]]*\])?", " ", t)
    t = re.sub(r"\\end\{[^}]*\}", " ", t)
    t = re.sub(r"\\(?:item|step)\s*(\[[^\]]*\])?", "\n", t)
    t = re.sub(r"\\\\(\[[^\]]*\])?", "\n", t)
    # unwrap macros with braced args: keep the text of every arg, separated by spaces
    prev = None
    while prev != t:
        prev = t
        t = re.sub(r"\\[A-Za-z@]+\*?(\[[^\]]*\])?\s*\{", "{", t, count=0)
    # now remove braces
    t = t.replace("{", " ").replace("}", " ")
    t = re.sub(r"\\[A-Za-z@]+\*?", " ", t)          # bare macros (\hfill, \par, \midrule …)
    t = t.replace("\\&", "\x00").replace("&", " ").replace("\x00", "&")   # cell separators go, \& stays
    t = t.replace("\\%", "%").replace("\\_", "_").replace("\\#", "#").replace("\\$", "$")
    t = t.replace("~", " ")
    t = re.sub(r"[ \t]+", " ", t)
    return t


def spoken(text):
    """Text that is actually said on stage: no stage directions, no 临场位 notes."""
    return plain(text, drop=NOT_SPOKEN)


def questions(body):
    """(chain_count, [question …]) for a question-chain section."""
    chains = len(re.findall(r"\\begin\{chain\}", body))
    qs = []
    for m in re.finditer(r"\\q\s*\{", body):
        a, _ = args(body, m.end() - 1, 1)
        if a:
            qs.append(plain(a[0]).strip())
    return chains, qs


def stresses(body):
    out = []
    for m in re.finditer(r"\\stress\s*\{", body):
        a, _ = args(body, m.end() - 1, 1)
        if a:
            out.append(plain(a[0]).strip())
    return out


SOURCE_FIELDS = ("num", "claim", "src", "quote", "date", "status", "used", "direction")


def sources(text):
    out = []
    for m in re.finditer(r"\\source\s*\{", text):
        a, _ = args(text, m.end() - 1, 8)
        if len(a) < 8:
            continue
        d = dict(zip(SOURCE_FIELDS, (plain(x).strip() for x in a)))
        d["line"] = text.count("\n", 0, m.start()) + 1
        out.append(d)
    return out


def speech_paragraphs(body):
    """Paragraphs of a speech body (blank-line separated), macros kept."""
    paras = [p.strip() for p in re.split(r"\n\s*\n", body) if p.strip()]
    return [p for p in paras if not p.startswith("\\begin{contingency}")]
