"""Load a format (赛制) file and derive everything the skill and the checkers need from it.

A format lives in references/formats/<id>.yaml (schema: _template.yaml). From
the stage list this module derives:

    bands(fmt, level)     {stage n: (seconds, lo, hi)} spoken-character bands for speech stages
    documents(fmt, side)  the per-side 稿件清单: [(kind, heading_title, heading_meta, stage n)]
                          in the canonical slot order 立论 → 被质询 → 质询 → 驳论 → 对辩 → 盘问 →
                          被盘问 → 小结 → 申论 → 自由辩 → 结辩 → 奇袭 → 观众提问
    find(name_or_alias)   the format whose id, name or alias matches a piece of text
    list_formats()        ids of every format file

PyYAML is used when installed; otherwise a small parser for the subset the
schema uses (mappings, lists, flow lists / flow mappings, block scalars).
"""
import glob
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
FORMATS_DIR = os.path.normpath(os.path.join(HERE, "..", "references", "formats"))

LEVEL_RATE = {"新生": (250, 280), "校队": (270, 300), "高水平": (290, 320)}
SPEECH_TYPES = ("立论", "驳论", "小结", "结辩", "申论")
QUESTION_TYPES = ("质询", "盘问", "奇袭")
SLOT_ORDER = ["立论", "被质询", "质询", "驳论", "申论", "对辩", "盘问", "被盘问", "质询小结", "小结", "自由辩", "结辩", "奇袭", "观众提问", "其他"]
STAGE_TYPES = ("立论", "质询", "驳论", "对辩", "盘问", "小结", "申论", "自由辩", "结辩", "奇袭", "观众提问", "评委打分", "其他")
TIMINGS = ("单方", "双边计时", "单边计时", "各自计时")
SIDES = ("正方", "反方", "双方")


# ------------------------------------------------------------------ YAML --
def _scalar(s):
    s = s.strip()
    if s == "" or s == "~" or s == "null":
        return None
    if s[0] in "\"'" and s[-1] == s[0] and len(s) >= 2:
        return s[1:-1]
    if s.startswith("[") and s.endswith("]"):
        inner = s[1:-1].strip()
        return [_scalar(x) for x in _split_flow(inner)] if inner else []
    if s.startswith("{") and s.endswith("}"):
        d = {}
        for part in _split_flow(s[1:-1]):
            if ":" in part:
                k, v = part.split(":", 1)
                d[k.strip()] = _scalar(v)
        return d
    if s in ("true", "True", "yes"):
        return True
    if s in ("false", "False", "no"):
        return False
    if re.fullmatch(r"-?\d+", s):
        return int(s)
    if re.fullmatch(r"-?\d+\.\d+", s):
        return float(s)
    return s


def _split_flow(s):
    out, depth, cur, quote = [], 0, "", None
    for c in s:
        if quote:
            cur += c
            if c == quote:
                quote = None
            continue
        if c in "\"'":
            quote = c
        if c in "[{":
            depth += 1
        elif c in "]}":
            depth -= 1
        if c == "," and depth == 0:
            out.append(cur)
            cur = ""
        else:
            cur += c
    if cur.strip():
        out.append(cur)
    return out


def _strip_comment(line):
    out, quote = "", None
    for i, c in enumerate(line):
        if quote:
            if c == quote:
                quote = None
        elif c in "\"'":
            quote = c
        elif c == "#" and (i == 0 or line[i - 1] in " \t"):
            break
        out += c
    return out.rstrip()


def _parse_block(lines, i, indent):
    """Parse a mapping or a list at `indent`; returns (value, next_i)."""
    # decide list vs mapping by first content line
    j = i
    while j < len(lines) and not lines[j].strip():
        j += 1
    if j >= len(lines):
        return None, j
    is_list = lines[j].lstrip().startswith("- ")
    result = [] if is_list else {}
    while i < len(lines):
        raw = lines[i]
        if not raw.strip():
            i += 1
            continue
        ind = len(raw) - len(raw.lstrip(" "))
        if ind < indent:
            break
        if ind > indent:
            raise ValueError("unexpected indent at line %d: %s" % (i + 1, raw))
        line = raw.strip()
        if is_list:
            if not line.startswith("- "):
                break
            body = line[2:].strip()
            if body.startswith("{") and body.endswith("}"):
                result.append(_scalar(body)); i += 1; continue
            if ":" in body and not body.startswith("[") and not (body[0] in "\"'"):
                # list item that is a mapping; first key inline
                sub_indent = ind + 2
                first = raw[:ind] + "  " + body
                block_lines = [first]
                k = i + 1
                while k < len(lines):
                    nxt = lines[k]
                    if nxt.strip() and (len(nxt) - len(nxt.lstrip(" "))) < sub_indent:
                        break
                    block_lines.append(nxt)
                    k += 1
                val, _ = _parse_block(block_lines, 0, sub_indent)
                result.append(val)
                i = k
                continue
            result.append(_scalar(body))
            i += 1
            continue
        # mapping
        m = re.match(r"^([^:]+?):(?:\s+(.*))?$", line)
        if not m:
            raise ValueError("bad mapping line %d: %s" % (i + 1, raw))
        key, val = m.group(1).strip(), (m.group(2) or "").strip()
        if re.fullmatch(r"-?\d+", key):
            key = int(key)          # PyYAML reads `7:` as an int key; match it
        if val == "|" or val == ">":
            block = []
            i += 1
            while i < len(lines) and (not lines[i].strip() or (len(lines[i]) - len(lines[i].lstrip(" "))) > indent):
                block.append(lines[i][indent + 2:] if lines[i].strip() else "")
                i += 1
            text = "\n".join(block).rstrip("\n") + "\n"
            result[key] = text if val == "|" else " ".join(text.split())
            continue
        if val == "":
            # nested block
            k = i + 1
            while k < len(lines) and not lines[k].strip():
                k += 1
            if k < len(lines) and (len(lines[k]) - len(lines[k].lstrip(" "))) > indent:
                sub_ind = len(lines[k]) - len(lines[k].lstrip(" "))
                result[key], i = _parse_block(lines, k, sub_ind)
                continue
            result[key] = None
            i += 1
            continue
        result[key] = _scalar(val)
        i += 1
    return result, i


def load_yaml(text):
    try:
        import yaml  # type: ignore
        return yaml.safe_load(text)
    except ImportError:
        lines = [_strip_comment(l).replace("\t", "    ") for l in text.split("\n")]
        val, _ = _parse_block(lines, 0, 0)
        return val


# ---------------------------------------------------------------- formats --
def list_formats():
    return sorted(os.path.splitext(os.path.basename(p))[0]
                  for p in glob.glob(os.path.join(FORMATS_DIR, "*.yaml")) if not os.path.basename(p).startswith("_"))


def load(fmt_id):
    path = fmt_id if fmt_id.endswith(".yaml") else os.path.join(FORMATS_DIR, fmt_id + ".yaml")
    with open(path, encoding="utf-8") as fh:
        fmt = load_yaml(fh.read())
    fmt.setdefault("aliases", [])
    fmt.setdefault("bands", {}) or fmt.__setitem__("bands", {})
    fmt.setdefault("meta_overrides", {}) or fmt.__setitem__("meta_overrides", {})
    fmt["_path"] = path
    fmt["_md"] = os.path.splitext(path)[0] + ".md"
    return fmt


def find(text):
    """Return the format whose id, name or alias appears in `text` (longest alias wins), else None."""
    if not text:
        return None
    best, best_len = None, 0
    for fid in list_formats():
        fmt = load(fid)
        for key in [fid, fmt.get("name", "")] + list(fmt.get("aliases") or []):
            k = str(key).replace(" ", "")
            if k and k in text.replace(" ", "") and len(k) > best_len:
                best, best_len = fmt, len(k)
    return best


def rate(fmt, level=None):
    lv = level or fmt.get("level_default") or "校队"
    if not level and fmt.get("speech_rate"):
        return tuple(fmt["speech_rate"])
    return LEVEL_RATE.get(lv, LEVEL_RATE["校队"])


def stages(fmt):
    return [s for s in fmt.get("stages") or [] if isinstance(s, dict)]


def _lst(x):
    if x is None:
        return []
    return list(x) if isinstance(x, (list, tuple)) else [x]


def bands(fmt, level=None):
    """{n: (seconds_for_writing, lo, hi)} for every speech stage."""
    lo_r, hi_r = rate(fmt, level)
    out = {}
    for s in stages(fmt):
        if s.get("type") not in SPEECH_TYPES:
            continue
        n = s["n"]
        secs = int(s.get("seconds") or 0)
        reserve = int(s.get("reserve_seconds") or 0)
        write_secs = max(secs - reserve, 0)
        ov = (fmt.get("bands") or {}).get(n) or (fmt.get("bands") or {}).get(str(n))
        if ov and ov.get("body"):
            lo, hi = ov["body"]
        else:
            lo, hi = round(write_secs * lo_r / 60), round(write_secs * hi_r / 60)
        out[n] = (write_secs, int(lo), int(hi))
    # 奇袭申论
    for s in stages(fmt):
        if s.get("type") == "奇袭" and isinstance(s.get("surprise"), dict) and s["surprise"].get("申论"):
            secs = int(s["surprise"]["申论"])
            out["奇袭申论"] = (secs, round(secs * lo_r / 60), round(secs * hi_r / 60))
    return out


def question_bands(fmt):
    """{n: (chains_lo, chains_hi, q_lo, q_hi)} for 质询 / 盘问 / 奇袭 stages."""
    out = {}
    for s in stages(fmt):
        if s.get("type") in QUESTION_TYPES:
            q = s.get("questions")
            if not q:
                secs = int(s.get("seconds") or 0)
                q = [3, 3, 6, 10] if secs >= 110 else [2, 2, 5, 8]
            out[s["n"]] = tuple(int(x) for x in q)
    return out


def _side_of_speaker(sp):
    return "正方" if str(sp).startswith("正") else "反方" if str(sp).startswith("反") else None


def _join(names):
    return "、".join(names)


def documents(fmt, side):
    """Per-side 稿件清单 in canonical slot order.

    Each item: dict(kind=speech|stage, slot, title, meta, n, type, speaker)
    title is what goes in \\begin{speech}{…} / \\begin{stage}{…} without the
    leading serial; the caller numbers them 1..N.
    """
    items = []
    st = stages(fmt)
    by_n = {s["n"]: s for s in st}
    ov = {str(k): v for k, v in (fmt.get("meta_overrides") or {}).items()}
    for s in st:
        t = s.get("type")
        n = s["n"]
        secs = int(s.get("seconds") or 0)
        reserve = int(s.get("reserve_seconds") or 0)
        sside = s.get("side")
        if t == "立论" and sside == side:
            sp = s["speaker"]
            meta = ov.get(str(n)) or "正文 NNN 字 / %d 秒" % secs
            items.append(dict(kind="speech", slot="立论", title="%s开篇立论稿" % sp, meta=meta, n=n, type=t, speaker=sp))
        elif t == "质询":
            asker, target = s.get("asker"), _lst(s.get("target"))
            if sside == side:
                items.append(dict(kind="stage", slot="质询", title="%s质询%s问题链" % (asker, _join(target)),
                                  meta=ov.get(str(n)) or "%d 秒，%s" % (secs, s.get("timing", "双边计时")), n=n, type=t, speaker=asker))
            else:
                items.append(dict(kind="stage", slot="被质询", title="%s被质询防守预案" % _join(target),
                                  meta=ov.get(str(n)) or "%s质询，%d 秒%s" % (asker, secs, s.get("timing", "双边计时")), n=n, type="被质询", speaker=target))
        elif t == "驳论" and sside == side:
            sp = s["speaker"]
            meta = ov.get(str(n)) or ("正文 NNN 字 + 临场位 NNN 字 / %d 秒" % secs if reserve else "正文 NNN 字 / %d 秒" % secs)
            items.append(dict(kind="speech", slot="驳论", title="%s驳论稿" % sp, meta=meta, n=n, type=t, speaker=sp))
        elif t == "对辩":
            sps = [x for x in _lst(s.get("speaker")) if _side_of_speaker(x) == side]
            if sps or sside == side:
                sp = sps[0] if sps else side
                items.append(dict(kind="stage", slot="对辩", title="%s对辩要点" % sp,
                                  meta=ov.get(str(n)) or "%d 秒，%s" % (secs, s.get("timing", "单边计时")), n=n, type=t, speaker=sp))
        elif t == "盘问":
            asker, target = s.get("asker"), _lst(s.get("target"))
            if sside == side:
                items.append(dict(kind="stage", slot="盘问", title="%s盘问问题链" % asker,
                                  meta=ov.get(str(n)) or "%d 秒，%s" % (secs, s.get("timing", "单边计时")), n=n, type=t, speaker=asker))
            else:
                cn = "两三四五六"
                many = "%s人口径必须一致" % (cn[len(target) - 2] if 2 <= len(target) <= 7 else str(len(target)))
                items.append(dict(kind="stage", slot="被盘问", title="%s被盘问防守预案" % _join(target),
                                  meta=ov.get(str(n)) or (many if len(target) > 1 else "%s盘问，%d 秒" % (asker, secs)), n=n, type="被盘问", speaker=target))
        elif t == "小结" and sside == side:
            sp = s["speaker"]
            meta = ov.get(str(n)) or ("正文 NNN 字 + 临场位 NNN 字 / %d 秒" % secs if reserve else "正文 NNN 字 / %d 秒" % secs)
            short = s.get("short") or "盘问小结"
            items.append(dict(kind="speech", slot="质询小结" if "质询" in short else "小结", title="%s%s稿" % (sp, short), meta=meta, n=n, type=t, speaker=sp))
        elif t == "申论" and sside == side:
            sp = s["speaker"]
            meta = ov.get(str(n)) or ("正文 NNN 字 + 临场位 NNN 字 / %d 秒" % secs if reserve else "正文 NNN 字 / %d 秒" % secs)
            items.append(dict(kind="speech", slot="申论", title="%s%s稿" % (sp, s.get("short") or "申论"), meta=meta, n=n, type=t, speaker=sp))
        elif t == "自由辩":
            items.append(dict(kind="stage", slot="自由辩", title="自由辩战场设计", meta=ov.get(str(n)) or "%d 秒" % secs, n=n, type=t, speaker="全员"))
        elif t == "结辩" and sside == side:
            sp = s["speaker"]
            if ov.get(str(n)):
                meta = ov[str(n)]
            elif s.get("style"):
                meta = "正文 NNN 字 / %d 秒，%s" % (secs, s["style"])
            elif reserve:
                meta = "正文 NNN 字 / %d 秒，留 %d 秒临场回应" % (secs, reserve)
            else:
                meta = "正文 NNN 字 / %d 秒" % secs
            items.append(dict(kind="speech", slot="结辩", title="%s%s稿" % (sp, s.get("short") or "结辩"), meta=meta, n=n, type=t, speaker=sp))
        elif t == "奇袭":
            sur = s.get("surprise") or {}
            meta = ov.get(str(n)) or ("质询 %s 秒双边 / 申论 %s 秒，二选一" % (sur.get("质询", secs), sur.get("申论", "")) if sur else "%d 秒" % secs)
            items.append(dict(kind="stage", slot="奇袭", title="%s奇袭预案" % side, meta=meta, n=n, type=t, speaker=side))
        elif t == "观众提问":
            items.append(dict(kind="stage", slot="观众提问", title="观众提问应答预案", meta=ov.get(str(n)) or "%d 秒" % secs, n=n, type=t, speaker=side))
        elif t == "其他" and (sside in (side, "双方")):
            items.append(dict(kind=s.get("kind", "stage"), slot="其他", title=s.get("name", "其他"), meta=ov.get(str(n)) or "%d 秒" % secs, n=n, type=t, speaker=s.get("speaker", side)))
    items.sort(key=lambda d: (SLOT_ORDER.index(d["slot"]) if d["slot"] in SLOT_ORDER else 99, d["n"]))
    return items


def headings(fmt, side):
    """['1. 正一开篇立论稿（正文 NNN 字 / 180 秒）', …] exactly as the 文稿 must write them."""
    return ["%d. %s（%s）" % (i, d["title"], d["meta"]) for i, d in enumerate(documents(fmt, side), 1)]


def match_heading(fmt, side, heading):
    """Find the document item whose serial+title matches a heading string from a 文稿."""
    m = re.match(r"\s*(\d+)[.、]\s*(.+?)(?:（.*)?$", heading)
    if not m:
        return None
    docs = documents(fmt, side)
    k = int(m.group(1))
    if 1 <= k <= len(docs) and docs[k - 1]["title"] == m.group(2).strip():
        return docs[k - 1]
    for d in docs:
        if d["title"] == m.group(2).strip():
            return d
    return None
