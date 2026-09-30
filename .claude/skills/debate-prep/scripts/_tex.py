"""Shared LaTeX reading for the debate-prep checkers.

The documents are written against assets/latex/debate.cls, whose macros are
semantic (\\begin{speech}, \\q{…}{…}, \\source{…}×8, \\stress{…}, \\aside{…}).
The checkers never guess from layout: they read those macros.

    read(path)            file text with % comments removed
    balanced(text, i)     index just past the {…} group that starts at text[i] == "{"
    args(text, i, n)      n brace-groups starting at text[i], returns (list, end)
    sections(text)        [(kind, title, meta, body)] for speech / kit / stage / section
    kit_parts(body)       the parts of a \\begin{kit}: fixed, pick (with modules), live
    assemblies(parts)     every speech a kit can be assembled into, as (choices, tex)
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

    Each item is (kind, title, meta, body) with kind in {"speech", "kit", "stage", "section"}.
    The title of a speech is joined with its meta as '标题（meta）' so that the
    heading strings match the format file's 「各持方文稿标题」 table exactly.
    """
    items = []
    for name in ("speech", "kit", "stage"):
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


# ------------------------------------------------------------------ kits --
# A kit is a speech that answers the other side, so it cannot be finished
# before the match. It holds fixed parts, pick groups of conditional modules
# (the speaker picks k on the day) and live slots:
#   \begin{fixed}{名称} … \end{fixed}
#   \begin{pick}{名称}{k} \begin{module}{条件} … \end{module} \begin{fallback}{说明} … \end{fallback} \end{pick}
#   \live{约 N 字}

class Part:
    __slots__ = ("kind", "name", "k", "text", "modules", "live")

    def __init__(self, kind, name, k=0, text="", live=0):
        self.kind, self.name, self.k, self.text, self.live = kind, name, k, text, live
        self.modules = []          # [(condition, text, is_fallback)]


def _block(text, start, name, nargs):
    """(args, body, end) for \\begin{name}{…}… at text[start:], end after \\end{name}."""
    m = re.match(r"\\begin\{%s\}" % name, text[start:])
    a, i = args(text, start + m.end(), nargs)
    depth, j = 1, i
    opener, closer = "\\begin{%s}" % name, "\\end{%s}" % name
    while depth:
        o, c = text.find(opener, j), text.find(closer, j)
        if c < 0:
            return a, text[i:], len(text)
        if 0 <= o < c:
            depth += 1; j = o + len(opener)
        else:
            depth -= 1; j = c + len(closer)
    return a, text[i:j - len(closer)], j


def kit_parts(body):
    """Parts of a kit body in document order."""
    body = re.sub(r"\\begin\{contingency\}.*?\\end\{contingency\}", " ", body, flags=re.S)
    parts = []
    pos = 0
    pat = re.compile(r"\\begin\{(fixed|pick)\}|\\live\s*\{")
    while True:
        m = pat.search(body, pos)
        if not m:
            break
        if m.group(0).startswith("\\live"):
            a, e = args(body, m.end() - 1, 1)
            n = re.search(r"\d+", a[0] if a else "")
            parts.append(Part("live", "临场", live=int(n.group()) if n else 0))
            pos = e
        elif m.group(1) == "fixed":
            a, inner, e = _block(body, m.start(), "fixed", 1)
            parts.append(Part("fixed", a[0] if a else "", text=inner))
            pos = e
        else:
            a, inner, e = _block(body, m.start(), "pick", 2)
            k = re.search(r"\d+", a[1] if len(a) > 1 else "1")
            p = Part("pick", a[0] if a else "", k=int(k.group()) if k else 1)
            q = 0
            mp = re.compile(r"\\begin\{(module|fallback)\}")
            while True:
                mm = mp.search(inner, q)
                if not mm:
                    break
                aa, mtext, qe = _block(inner, mm.start(), mm.group(1), 1)
                p.modules.append((aa[0] if aa else "", mtext, mm.group(1) == "fallback"))
                q = qe
            parts.append(p)
            pos = e
    return parts


def assemblies(parts, limit=20000):
    """Yield (choices, tex) for every assembly: fixed parts plus k modules from each pick group.

    `choices` names the modules picked, for reporting. Live slots contribute no text."""
    from itertools import combinations, product
    groups = []
    for p in parts:
        if p.kind == "fixed":
            groups.append([((), p.text)])
        elif p.kind == "pick":
            if len(p.modules) < p.k:
                raise ValueError("「%s」要求任选 %d，但只写了 %d 个模块" % (p.name, p.k, len(p.modules)))
            opts = []
            for combo in combinations(p.modules, p.k):
                opts.append((tuple(c for c, _, _ in combo), "\n\n".join(t for _, t, _ in combo)))
            groups.append(opts)
    n = 0
    for pick in product(*groups):
        n += 1
        if n > limit:
            return
        yield tuple(c for ch, _ in pick for c in ch), "\n\n".join(t for _, t in pick)


def assembly_range(parts, measure):
    """(min, max) of measure(tex) summed over parts: fixed always, k smallest / largest per pick,
    live slots at their declared length. Exact for additive measures such as length."""
    lo = hi = 0
    for p in parts:
        if p.kind == "fixed":
            v = measure(p.text); lo += v; hi += v
        elif p.kind == "live":
            lo += p.live; hi += p.live
        else:
            if len(p.modules) < p.k:
                raise ValueError("「%s」要求任选 %d，但只写了 %d 个模块" % (p.name, p.k, len(p.modules)))
            vals = sorted(measure(t) for _, t, _ in p.modules)
            lo += sum(vals[:p.k]); hi += sum(vals[-p.k:]) if p.k else 0
    return lo, hi
