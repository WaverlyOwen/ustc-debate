#!/usr/bin/env python3
"""Count the spoken length of each speech in a 文稿 file and check it against the format's band.

Usage:
    python3 check_speeches.py prep/<题>/文稿-*.tex [--format ustc-freshman-cup] [--json]
    python3 check_speeches.py --list-formats

The file is LaTeX written against assets/latex/debate.cls. A speech is
\begin{speech}{标题}{正文 NNN 字 / 180 秒} … \end{speech}; everything else is a
\begin{stage}. Counting rule (the single canonical one, mirrored from the
format file):
  counted    汉字, 阿拉伯数字 (one char each), English words (two chars each)
  not counted  punctuation, whitespace, LaTeX macros
  not counted  \aside{…} stage directions, \reserve{…} 临场位 notes, and
                parenthesised asides （…）
  not counted  the contingency box (如果……就……), which sits outside the speech

Bands come from the format file's 「时长与字数换算」 table
(references/formats/<format>.md), so adding a format means adding a file, not
editing this script. Each row is read as: seconds from column 1, the main
range from column 2, and an optional 临场位 range from column 3; the 备注 column
says which speech the row is for (立论 / 驳论 / 小结 / 反四结辩 / 正四结辩 / 奇袭申论).
If the table cannot be read the built-in bands below are used.

Question chains (质询 / 盘问 / 奇袭质询) are checked too: every numbered
question must be 25 spoken characters or fewer (OUT), should read as a closed
question (WARN), and the number of chains and questions should sit in the
format's band (WARN).

Estimating by eye gives a different answer every time, which is how a script
that says "约 740 字" ends up being 771 on stage. Run this instead.

Exit code 1 if any speech falls outside its band or any question is too long.
"""
import argparse
import glob
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
FORMATS_DIR = os.path.join(HERE, "..", "references", "formats")
sys.path.insert(0, HERE)
import _tex  # noqa: E402

# Fallback only; the format file is the source of truth.
BUILTIN_BANDS = {
    "ustc-freshman-cup": {
        "立论": (180, 750, 840),
        "驳论": (120, 500, 560),
        "驳论·留临场位": (120, 400, 460),
        "小结": (90, 375, 420),
        "小结·留临场位": (90, 300, 340),
        "结辩·反四": (210, 875, 980),
        "结辩·正四": (175, 730, 815),
    },
    "ustc-school-cup-2025": {
        "立论": (180, 750, 840),
        "驳论": (120, 500, 560),
        "驳论·留临场位": (120, 400, 460),
        "小结": (120, 500, 560),
        "小结·留临场位": (120, 400, 460),
        "奇袭申论": (120, 500, 560),
        "结辩·反四": (210, 875, 980),
        "结辩·正四": (175, 730, 815),
    },
}
# chain-count guidance per question section kind: (chains_lo, chains_hi, q_lo, q_hi)
BUILTIN_CHAINS = {
    "质询": (3, 3, 6, 10),
    "盘问": (2, 2, 5, 8),
    "奇袭质询": (3, 4, 8, 12),
}
MAX_QUESTION = 25
CLOSED = ["吗", "是不是", "有没有", "会不会", "算不算", "还是", "对不对", "能不能", "是否", "承不承认",
          "该不该", "要不要", "同不同意", "可不可以", "愿不愿意", "认不认", "对吧", "是吧", "有吧", "没错吧"]

STAGE = re.compile(r"〔[^〕]*〕|【[^】]*】|（[^）]*）|\([^)]*\)")   # 括注不念
CJK = re.compile(r"[一-鿿㐀-䶿]")
DIGIT = re.compile(r"\d")
LATIN = re.compile(r"[A-Za-z]+")
RANGE = re.compile(r"(\d+)\s*[–—-]\s*(\d+)")


def spoken_len(text):
    """Spoken-character count under the canonical rule (text already macro-free)."""
    t = STAGE.sub(" ", text)
    return len(CJK.findall(t)) + len(DIGIT.findall(t)) + 2 * len(LATIN.findall(t))


# ------------------------------------------------------------ format file --
def list_formats():
    return sorted(os.path.splitext(os.path.basename(p))[0]
                  for p in glob.glob(os.path.join(FORMATS_DIR, "*.md"))
                  if not os.path.basename(p).startswith("_"))


def load_bands(fmt):
    """Parse the 时长与字数换算 table of references/formats/<fmt>.md.

    Returns (bands, chains, source) where source says where the bands came from.
    """
    path = os.path.join(FORMATS_DIR, fmt + ".md")
    bands, chains = {}, {}
    try:
        text = open(path, encoding="utf-8").read()
    except OSError:
        return BUILTIN_BANDS.get(fmt, {}), BUILTIN_CHAINS, "builtin (no format file)"
    sec = re.search(r"##\s*时长与字数换算(.*?)(?=\n##\s|\Z)", text, re.S)
    if not sec:
        return BUILTIN_BANDS.get(fmt, {}), BUILTIN_CHAINS, "builtin (table not found)"
    for line in sec.group(1).split("\n"):
        if not line.strip().startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 2 or cells[0] in ("时长", "") or set(cells[0]) <= set("-: "):
            continue
        secs_m = re.search(r"(\d+)\s*秒", cells[0])
        if not secs_m:
            continue
        secs = int(secs_m.group(1))
        note = cells[2] if len(cells) > 2 else ""
        head = cells[0] + " " + cells[1]
        main = RANGE.search(cells[1])
        # question / point rows: "3 条问题链，共 6–10 个问题"
        if "问题" in cells[1]:
            cm = re.search(r"(\d+)(?:\s*[–—-]\s*(\d+))?\s*条", cells[1])
            qm = re.search(r"共\s*(\d+)\s*[–—-]\s*(\d+)", cells[1])
            if cm and qm:
                lo, hi = int(cm.group(1)), int(cm.group(2) or cm.group(1))
                key = "奇袭质询" if "奇袭" in head else "质询" if "质询" in head else "盘问" if "盘问" in head else None
                if key:
                    chains[key] = (lo, hi, int(qm.group(1)), int(qm.group(2)))
            continue
        if not main:
            continue
        lo, hi = int(main.group(1)), int(main.group(2))
        reserve = None
        rm = re.search(r"临场位[^0-9]*?(\d+)\s*[–—-]\s*(\d+)", note)
        if rm:
            reserve = (int(rm.group(1)), int(rm.group(2)))
        blob = head + " " + note
        if "奇袭" in blob and "申论" in blob:
            bands["奇袭申论"] = (secs, lo, hi)
        elif "立论" in blob:
            bands["立论"] = (secs, lo, hi)
        elif "驳论" in blob:
            bands["驳论"] = (secs, lo, hi)
            if reserve:
                bands["驳论·留临场位"] = (secs, reserve[0], reserve[1])
        elif "小结" in blob:
            bands["小结"] = (secs, lo, hi)
            if reserve:
                bands["小结·留临场位"] = (secs, reserve[0], reserve[1])
        elif "正四" in blob and "结辩" in blob:
            rs = re.search(r"留\s*(\d+)\s*秒", cells[0])
            bands["结辩·正四"] = (secs - int(rs.group(1)) if rs else secs, lo, hi)
        elif "反四" in blob and "结辩" in blob:
            bands["结辩·反四"] = (secs, lo, hi)
        elif "结辩" in blob:
            bands.setdefault("结辩·反四", (secs, lo, hi))
    need = {"立论", "驳论", "小结", "结辩·反四", "结辩·正四"}
    if not need <= set(bands):
        missing = need - set(bands)
        fallback = BUILTIN_BANDS.get(fmt, {})
        for k in missing:
            if k in fallback:
                bands[k] = fallback[k]
        return bands, chains or BUILTIN_CHAINS, "format file + builtin for %s" % "、".join(sorted(missing))
    return bands, chains or BUILTIN_CHAINS, "format file"


def detect_format(files):
    """Look only at the ## headings: the school cup gives 质询 to 二辩, 对辩 to 四辩, and has 奇袭."""
    for path in files:
        try:
            text = _tex.read(path)
        except OSError:
            continue
        heads = " ".join(_tex.heading(t, m) for _, t, m, _ in _tex.sections(text))
        if re.search(r"奇袭", heads) or re.search(r"[正反]四对辩", heads) or re.search(r"[正反]二质询", heads):
            return "ustc-school-cup-2025"
    return "ustc-freshman-cup"


# ------------------------------------------------------------- speeches --
def classify(heading):
    """Map a section heading to a band key, or None if it is not a full speech."""
    h = heading
    reserve = "临场位" in h or "临场回应" in h
    if "奇袭" in h and "预案" in h:
        return None   # composite section: a question chain plus a speech, handled by split_surprise()
    if "奇袭" in h and "申论" in h:
        return "奇袭申论"
    if "立论" in h and "稿" in h:
        return "立论"
    if "驳论" in h and "稿" in h:
        return "驳论·留临场位" if reserve else "驳论"
    if "小结" in h and "稿" in h:
        return "小结·留临场位" if reserve else "小结"
    if "结辩" in h and "稿" in h:
        first = h.split("结辩")[0]
        return "结辩·反四" if ("反" in first[-3:] or "封路" in h) else "结辩·正四"
    return None


def question_kind(heading):
    if "小结" in heading or "防守" in heading or "预案" in heading and "奇袭" not in heading:
        return None
    if "奇袭" in heading:
        return "奇袭质询"
    if "质询" in heading and "问题链" in heading:
        return "质询"
    if "盘问" in heading and "问题链" in heading:
        return "盘问"
    return None


def speech_text(body):
    """What is said: macros stripped, \aside / \reserve dropped, contingency box excluded."""
    body = re.sub(r"\\begin\{contingency\}.*?\\end\{contingency\}", " ", body, flags=re.S)
    return _tex.spoken(body)


def split_surprise(body):
    """A 奇袭预案 stage holds question chains and then a 申论稿 as a nested speech
    (\begin{speech}{奇袭申论稿}{正文 NNN 字 / 120 秒}). Returns (chain_part, speech_body)."""
    m = re.search(r"\\begin\{speech\}", body)
    if not m:
        return body, ""
    a, i = _tex.args(body, m.end(), 2)
    end = body.find("\\end{speech}", i)
    return body[:m.start()], body[i:end if end > 0 else len(body)]


def questions_of(body):
    chains, qs = _tex.questions(body)
    out = []
    for qt in qs:
        qt = re.sub(r"^\s*问[正反][一二三四]\s*[：:]\s*", "", qt)   # 「问反二：」是舞台提示
        n = spoken_len(qt)
        closed = any(c in qt for c in CLOSED) or bool(re.search(r"([一-鿿]{1,2})不\1", qt))   # 会不会、承认不承认
        out.append((qt, n, closed))
    return chains, out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="*", help="文稿-*.tex files")
    ap.add_argument("--format", default=None,
                    help="format key (a file in references/formats/); omit to detect from the ## headings")
    ap.add_argument("--list-formats", action="store_true", help="list the formats that have a file")
    ap.add_argument("--json", action="store_true", help="machine-readable output")
    args = ap.parse_args()

    if args.list_formats:
        for f in list_formats():
            print(f)
        return 0
    if not args.files:
        ap.error("no files given")

    fmt = args.format or detect_format(args.files)
    bands, chain_bands, source = load_bands(fmt)
    if not bands:
        print("unknown format %r; known: %s" % (fmt, ", ".join(list_formats() or BUILTIN_BANDS)), file=sys.stderr)
        return 2
    if not args.json:
        print("(format: %s%s；区间来源：%s)" % (fmt, "" if args.format else "，按二级标题自动判断；用 --format 可指定", source))

    bad = 0
    warn = 0
    report = []
    for path in args.files:
        text = _tex.read(path)
        rows = []
        qrows = []
        for kind, title, meta, body in _tex.sections(text):
            if kind not in ("speech", "stage"):
                continue
            heading = _tex.heading(title, meta)
            key = classify(heading) if kind == "speech" else None
            if key:
                n = spoken_len(speech_text(body))
                secs, lo, hi = bands[key]
                ok = lo <= n <= hi
                if not ok:
                    bad += 1
                rows.append({"heading": heading, "kind": key, "seconds": secs,
                             "count": n, "low": lo, "high": hi, "ok": ok})
                continue
            qk = question_kind(heading)
            if qk == "奇袭质询" and "预案" in heading:
                body, speech = split_surprise(body)
                if speech.strip() and "奇袭申论" in bands:
                    n = spoken_len(speech_text(speech))
                    secs, lo, hi = bands["奇袭申论"]
                    ok = lo <= n <= hi
                    if not ok:
                        bad += 1
                    rows.append({"heading": heading[:20] + "·奇袭申论稿", "kind": "奇袭申论", "seconds": secs,
                                 "count": n, "low": lo, "high": hi, "ok": ok})
            if qk:
                chains, qs = questions_of(body)
                long_qs = [(q, n) for q, n, _ in qs if n > MAX_QUESTION]
                open_qs = [q for q, _, c in qs if not c]
                cb = chain_bands.get(qk)
                counts_ok = True
                if cb and qs:
                    c_lo, c_hi, q_lo, q_hi = cb
                    counts_ok = (c_lo <= chains <= c_hi or chains == 0) and q_lo <= len(qs) <= q_hi
                bad += len(long_qs)
                warn += len(open_qs) + (0 if counts_ok else 1)
                qrows.append({"heading": heading, "kind": qk, "chains": chains, "questions": len(qs),
                              "long": long_qs, "open": open_qs, "counts_ok": counts_ok, "band": cb})
        report.append({"file": path, "speeches": rows, "questions": qrows})
        if not args.json:
            print("== %s" % path)
            if not rows:
                print("   (no \\begin{speech} found — check the headings against the format file)")
            for r in rows:
                mark = "OK  " if r["ok"] else "OUT "
                delta = "" if r["ok"] else ("  (%+d)" % (r["count"] - (r["high"] if r["count"] > r["high"] else r["low"])))
                print("   %s%-46s %4d 字  目标 %d–%d / %d 秒%s"
                      % (mark, r["heading"][:46], r["count"], r["low"], r["high"], r["seconds"], delta))
            for q in qrows:
                status = "OUT " if q["long"] else ("WARN" if (q["open"] or not q["counts_ok"]) else "OK  ")
                band = ""
                if q["band"]:
                    band = "  目标 %d–%d 链 / %d–%d 问" % q["band"]
                print("   %s%-46s %d 链 %2d 问%s" % (status, q["heading"][:46], q["chains"], q["questions"], band))
                for qt, n in q["long"]:
                    print("        超长 %d 字（上限 %d）：%s" % (n, MAX_QUESTION, qt[:50]))
                if not q["counts_ok"]:
                    print("        链数或问题数不在区间内")
                for qt in q["open"]:
                    print("        非封闭式？%s" % qt[:50])

    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        if bad:
            print("\n%d 处超出区间。稿件删减顺序：论据 → 修饰语 → 机制中间步骤；价值升华段不删。"
                  "问题超过 %d 字就拆成两问或去掉铺垫。" % (bad, MAX_QUESTION))
        if warn:
            print("（%d 处 WARN 只是提醒：非封闭式问题请确认是不是故意的，链数与问题数以赛制表为准）" % warn)
    return 1 if bad else 0


if __name__ == "__main__":
    try:
        import signal
        signal.signal(signal.SIGPIPE, signal.SIG_DFL)
    except (AttributeError, ValueError):
        pass
    sys.exit(main())
