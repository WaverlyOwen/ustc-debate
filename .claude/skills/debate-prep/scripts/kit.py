"""Shared parser for speech sections: plain scripts and assembly kits.

A speech that depends on what the opponent says cannot be finished before the
match. It is written as a kit instead: parts that are fixed, groups of
conditional modules of which the speaker picks k on the day, and reserved live
slots. Headings carry the structure:

    ## 10. 反四结辩（套件 · 组装后 902–968 字 / 210 秒）
    ### 归纳分歧 · 任选 1
    #### 如果全场主战场落在「冲突时谁让路」
    ...module text...
    #### 如果全场主战场落在「爱从哪里来」
    ...
    ### 我方论点收束（固定）
    ...
    ### 临场（不写稿，约 60 字）

A section with no ### parts is a plain script: one fixed part holding the body.

Checks run over every possible assembly, not one sample: the shortest and the
longest the speaker could build must both fit the time band, so whichever
modules they pick live, the speech fits.
"""
import re

STAGE = re.compile(r"〔[^〕]*〕|【[^】]*】|（[^）]*）|\([^)]*\)")
CJK = re.compile(r"[一-鿿㐀-䶿]")
DIGIT = re.compile(r"\d")
LATIN = re.compile(r"[A-Za-z]+")
CONTINGENCY = re.compile(r"^\s*\**\s*如果……就……")


def spoken_len(text):
    """Spoken-character count under the canonical rule (see the format file)."""
    t = STAGE.sub(" ", text)
    t = re.sub(r"`[^`]*`", " ", t)
    t = re.sub(r"[*_#>|~-]", " ", t)
    return len(CJK.findall(t)) + len(DIGIT.findall(t)) + 2 * len(LATIN.findall(t))


class Part:
    __slots__ = ("name", "kind", "k", "text", "modules", "live")

    def __init__(self, name, kind, k=0, live=0):
        self.name, self.kind, self.k, self.live = name, kind, k, live
        self.text = ""
        self.modules = []          # list of (condition, text)


def part_kind(name):
    """('fixed'|'choice'|'live', k, live_chars) from an ### heading."""
    m = re.search(r"任选\s*(\d+)", name)
    if m:
        return "choice", int(m.group(1)), 0
    if "临场" in name:
        n = re.search(r"约\s*(\d+)\s*字", name)
        return "live", 0, int(n.group(1)) if n else 0
    return "fixed", 0, 0


def strip_notes(lines):
    """Cut the trailing 如果……就…… note list and trailing bullets/blank lines."""
    out = []
    for ln in lines:
        if CONTINGENCY.match(ln):
            break
        out.append(ln)
    while out and (not out[-1].strip() or out[-1].strip().startswith(("-", "*", ">", "---"))):
        out.pop()
    return out


def parse(section):
    """Return (heading, [Part]) for one '## …' section of a 文稿 file."""
    lines = section.split("\n")
    heading = lines[0].lstrip("# ").strip()
    body = strip_notes(lines[1:])
    if not any(re.match(r"^###\s", ln) for ln in body):
        p = Part("正文", "fixed")
        p.text = "\n".join(body)
        return heading, [p]
    parts, cur, mod = [], None, None
    lead = []
    for ln in body:
        m3 = re.match(r"^###\s+(.+?)\s*$", ln)
        m4 = re.match(r"^####\s+(.+?)\s*$", ln)
        if m3:
            kind, k, live = part_kind(m3.group(1))
            cur = Part(m3.group(1), kind, k, live)
            parts.append(cur)
            mod = None
        elif m4 and cur is not None and cur.kind == "choice":
            cur.modules.append([m4.group(1), ""])
            mod = cur.modules[-1]
        elif cur is None:
            lead.append(ln)            # an assembly note above the first part: not spoken
        elif mod is not None:
            mod[1] += ln + "\n"
        else:
            cur.text += ln + "\n"
    for p in parts:
        p.modules = [tuple(m) for m in p.modules]
    return heading, parts


def is_kit(parts):
    return not (len(parts) == 1 and parts[0].name == "正文")


def assembly_range(parts, measure=spoken_len, live_counts=True):
    """(min, max) of measure() over every assembly the speaker could build.

    Fixed parts always count; a choice group contributes its k smallest or k
    largest modules; a live slot contributes its declared length (for length
    measures) or nothing (for voice measures, pass live_counts=False)."""
    lo = hi = 0
    for p in parts:
        if p.kind == "fixed":
            v = measure(p.text); lo += v; hi += v
        elif p.kind == "live":
            if live_counts:
                lo += p.live; hi += p.live
        else:
            vals = sorted(measure(t) for _, t in p.modules)
            if len(vals) < p.k:
                raise ValueError("「%s」要求任选 %d，但只写了 %d 个模块" % (p.name, p.k, len(vals)))
            lo += sum(vals[:p.k]); hi += sum(vals[-p.k:]) if p.k else 0
    return lo, hi


def all_text(parts):
    """Every word written in the section, fixed parts and all modules."""
    chunks = []
    for p in parts:
        chunks.append(p.text)
        chunks.extend(t for _, t in p.modules)
    return "\n".join(chunks)


def pieces(parts):
    """Each independently spoken unit: every fixed part and every module."""
    out = []
    for p in parts:
        if p.kind == "fixed" and p.text.strip():
            out.append((p.name, p.text))
        for cond, t in p.modules:
            out.append(("%s / %s" % (p.name, cond), t))
    return out
