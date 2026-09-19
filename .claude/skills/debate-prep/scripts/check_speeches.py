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

The format (赛制) comes from references/formats/<id>.yaml: the file's
\meta{赛制}{…} line is matched against every format's name and aliases, or
pass --format <id>. Bands are seconds × speech rate (the format's, or the
--level 新生/校队/高水平 rate); a stage's reserve_seconds and bands overrides
in the YAML apply. Speeches are matched to stages by the heading title that
format_info.py --headings prints, so the headings must be used verbatim.

Question chains (质询 / 盘问 / 奇袭质询) are checked too: every numbered
question must be 25 spoken characters or fewer (OUT), should read as a closed
question (WARN), and the number of chains and questions should sit in the
format's band (WARN).

Estimating by eye gives a different answer every time, which is how a script
that says "约 740 字" ends up being 771 on stage. Run this instead.

Exit code 1 if any speech falls outside its band or any question is too long.
"""
import argparse
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import _tex  # noqa: E402
import _format as F  # noqa: E402

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


# ------------------------------------------------------------ format --
def detect_format(files):
    """The format named in \\meta{赛制}{…} of the first file that has one; falls back to titles."""
    for path in files:
        try:
            text = _tex.read(path)
        except OSError:
            continue
        m = re.search(r"\\meta\{赛制\}\s*\{", text)
        if m:
            a, _ = _tex.args(text, m.end() - 1, 1)
            fmt = F.find(_tex.plain(a[0]) if a else "")
            if fmt:
                return fmt
        heads = " ".join(_tex.heading(t, mt) for _, t, mt, _ in _tex.sections(text))
        fmt = F.find(heads)
        if fmt:
            return fmt
    return None


def side_of_file(path, text):
    base = os.path.basename(path)
    if "正方" in base:
        return "正方"
    if "反方" in base:
        return "反方"
    m = re.search(r"\\stance\{(正方|反方)\}", text)
    return m.group(1) if m else "正方"


def question_kind_of(doc):
    """Map a document item to the kind of question band it needs."""
    if doc["slot"] == "质询":
        return "质询"
    if doc["slot"] == "盘问":
        return "盘问"
    if doc["slot"] == "奇袭":
        return "奇袭质询"
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
    ap.add_argument("--format", default=None, help="format id or alias; omit to read \\meta{赛制} from the file")
    ap.add_argument("--level", choices=list(F.LEVEL_RATE), help="队伍水平，决定语速；省略用赛制默认")
    ap.add_argument("--list-formats", action="store_true", help="list the formats in references/formats/")
    ap.add_argument("--json", action="store_true", help="machine-readable output")
    args = ap.parse_args()

    if args.list_formats:
        for f in F.list_formats():
            print(f)
        return 0
    if not args.files:
        ap.error("no files given")

    if args.format:
        fmt = F.load(args.format) if args.format in F.list_formats() else F.find(args.format)
        if not fmt:
            print("unknown format %r; known: %s" % (args.format, ", ".join(F.list_formats())), file=sys.stderr)
            return 2
    else:
        fmt = detect_format(args.files)
        if not fmt:
            print("无法判断赛制：文稿的 \\meta{赛制}{…} 里写上赛制名或别名，或用 --format 指定。已有：%s"
                  % ", ".join(F.list_formats()), file=sys.stderr)
            return 2
    bands = F.bands(fmt, args.level)
    qbands = F.question_bands(fmt)
    lo_r, hi_r = F.rate(fmt, args.level)
    if not args.json:
        print("(赛制：%s%s；语速 %d–%d 字/分钟%s)" % (fmt["id"], "" if args.format else "，按 \\meta{赛制} 判断",
                                                lo_r, hi_r, "，--level " + args.level if args.level else ""))

    bad = 0
    warn = 0
    report = []
    for path in args.files:
        text = _tex.read(path)
        side = side_of_file(path, text)
        rows = []
        qrows = []
        for kind, title, meta, body in _tex.sections(text):
            if kind not in ("speech", "stage"):
                continue
            heading = _tex.heading(title, meta)
            doc = F.match_heading(fmt, side, "%s" % title)
            if doc is None:
                rows.append({"heading": heading, "kind": "?", "seconds": 0, "count": 0, "low": 0, "high": 0, "ok": True, "unknown": True})
                continue
            if kind == "speech" and doc["kind"] == "speech":
                n = spoken_len(speech_text(body))
                secs, lo, hi = bands.get(doc["n"], (0, 0, 0))
                ok = lo <= n <= hi if hi else True
                if not ok:
                    bad += 1
                rows.append({"heading": heading, "kind": doc["slot"], "seconds": secs, "count": n, "low": lo, "high": hi, "ok": ok})
                continue
            qk = question_kind_of(doc)
            if qk == "奇袭质询":
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
                cb = qbands.get(doc["n"])
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
            print("== %s（%s）" % (path, side))
            if not rows and not qrows:
                print("   (no \\begin{speech} found — check the headings against format_info.py --headings)")
            for r in rows:
                if r.get("unknown"):
                    print("   ??  %-46s 标题不在赛制的稿件清单里，用 format_info.py --headings %s 核对" % (r["heading"][:46], side))
                    warn += 1
                    continue
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
            print("（%d 处 WARN 只是提醒：边界链、必问里故意让对方答不出的开放问可以保留，其余请改成封闭式；链数与问题数以赛制表为准）" % warn)
    return 1 if bad else 0


if __name__ == "__main__":
    try:
        import signal
        signal.signal(signal.SIGPIPE, signal.SIG_DFL)
    except (AttributeError, ValueError):
        pass
    sys.exit(main())
