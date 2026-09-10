#!/usr/bin/env python3
"""Count the spoken length of each speech in a 文稿 file and check it against the format's band.

Usage:
    python3 check_speeches.py prep/<题>/03-文稿-*.md [--format ustc-freshman-cup] [--json]

Counting rule (the single canonical one, mirrored from the format file):
  counted    汉字, 阿拉伯数字 (one char each), English words (two chars each)
  not counted  punctuation, whitespace, Markdown marks
  not counted  stage directions and asides: 〔…〕【…】(…) （…）
  not counted  the 临场位 reserve, and the "如果……就……" bullet list at the end
                of a speech section (those are notes, not spoken text)

Estimating by eye gives a different answer every time, which is how a script
that says "约 740 字" ends up being 771 on stage. Run this instead.

Exit code 1 if any speech falls outside its band.
"""
import argparse
import json
import re
import sys

# duration -> (low, high) in spoken characters; see the format file's 时长与字数换算
BANDS = {
    "ustc-freshman-cup": {
        "立论": (180, 750, 840),
        "驳论": (120, 500, 560),
        "驳论·留临场位": (120, 400, 460),
        "小结": (90, 375, 420),
        "小结·留临场位": (90, 300, 340),
        "结辩·反四": (210, 875, 980),
        "结辩·正四": (175, 730, 815),
    }
}

STAGE = re.compile(r"〔[^〕]*〕|【[^】]*】|（[^）]*）|\([^)]*\)")
CJK = re.compile(r"[一-鿿㐀-䶿]")
DIGIT = re.compile(r"\d")
LATIN = re.compile(r"[A-Za-z]+")


def spoken_len(text):
    """Spoken-character count under the canonical rule."""
    t = STAGE.sub(" ", text)
    t = re.sub(r"`[^`]*`", " ", t)
    t = re.sub(r"[*_#>|~-]", " ", t)
    return len(CJK.findall(t)) + len(DIGIT.findall(t)) + 2 * len(LATIN.findall(t))


def classify(heading):
    """Map a section heading to a band key, or None if it is not a full speech.

    A speech that reserves a 临场位 (the second-speaking side answering the
    first) has a shorter 正文 band, because the reserve is spoken live.
    """
    h = heading
    reserve = "临场位" in h or "临场回应" in h
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


def body_of(section):
    """Strip the heading, the trailing 如果……就…… note list and any 临场位 block."""
    lines = section.split("\n")[1:]
    out = []
    for ln in lines:
        s = ln.strip()
        if re.match(r"^\**如果[^*]*就", s) or s.startswith("**如果"):
            break
        if "临场位" in s and (s.startswith("-") or s.startswith("*") or s.startswith(">")):
            continue
        out.append(ln)
    # drop a trailing block of bullets (预案 notes)
    while out and out[-1].strip().startswith(("-", "*", ">")):
        out.pop()
    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="+", help="03-文稿-*.md files")
    ap.add_argument("--format", default="ustc-freshman-cup", help="format key (default: ustc-freshman-cup)")
    ap.add_argument("--json", action="store_true", help="machine-readable output")
    args = ap.parse_args()

    bands = BANDS.get(args.format)
    if bands is None:
        print("unknown format %r; known: %s" % (args.format, ", ".join(BANDS)), file=sys.stderr)
        return 2

    bad = 0
    report = []
    for path in args.files:
        with open(path, encoding="utf-8") as fh:
            text = fh.read()
        sections = re.split(r"\n(?=## )", text)
        rows = []
        for sec in sections:
            heading = sec.split("\n")[0].lstrip("# ").strip()
            key = classify(heading)
            if not key:
                continue
            n = spoken_len(body_of(sec))
            secs, lo, hi = bands[key]
            ok = lo <= n <= hi
            if not ok:
                bad += 1
            rows.append({"heading": heading, "kind": key, "seconds": secs,
                         "count": n, "low": lo, "high": hi, "ok": ok})
        report.append({"file": path, "speeches": rows})
        if not args.json:
            print("== %s" % path)
            if not rows:
                print("   (no full speeches found — check the headings against the format file)")
            for r in rows:
                mark = "OK  " if r["ok"] else "OUT "
                delta = "" if r["ok"] else ("  (%+d)" % (r["count"] - (r["high"] if r["count"] > r["high"] else r["low"])))
                print("   %s%-46s %4d 字  目标 %d–%d / %d 秒%s"
                      % (mark, r["heading"][:46], r["count"], r["low"], r["high"], r["seconds"], delta))

    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    elif bad:
        print("\n%d 篇稿件超出区间。删减顺序：论据 → 修饰语 → 机制中间步骤；价值升华段不删。" % bad)
    return 1 if bad else 0


if __name__ == "__main__":
    try:
        import signal
        signal.signal(signal.SIGPIPE, signal.SIG_DFL)
    except (AttributeError, ValueError):
        pass
    sys.exit(main())
