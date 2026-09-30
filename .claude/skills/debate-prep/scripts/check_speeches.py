#!/usr/bin/env python3
"""Count the spoken length of each speech in a 文稿 file and check it against the format's band.

Usage:
    python3 check_speeches.py prep/<题>/文稿-*.md [--format ustc-freshman-cup] [--json]

Counting rule (the single canonical one, mirrored from the format file):
  counted    汉字, 阿拉伯数字 (one char each), English words (two chars each)
  not counted  punctuation, whitespace, Markdown marks
  not counted  stage directions and asides: 〔…〕【…】(…) （…）
  not counted  the "如果……就……" note list at the end of a speech section

Two kinds of speech section (see kit.py):
  定稿   a plain script; its body is counted as is
  套件   fixed parts + conditional modules chosen on the day + live slots.
         The shortest and the longest assembly are both computed, and BOTH
         must fit the band, so any choice the speaker makes live fits the time.

The number written in the heading must equal the computed one. A heading that
says 约 740 字 over a body of 771 is exactly the drift this script exists to
stop, so a mismatch fails.

Exit code 1 if any speech is outside its band or its heading disagrees.
"""
import argparse
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

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
        "结辩": (210, 875, 980),
    },
    # 2025 校赛: 盘问小结 runs 120 s here, not 90; 奇袭申论 is a 120 s speech.
    "ustc-school-cup-2025": {
        "立论": (180, 750, 840),
        "驳论": (120, 500, 560),
        "驳论·留临场位": (120, 400, 460),
        "小结": (120, 500, 560),
        "小结·留临场位": (120, 400, 460),
        "奇袭申论": (120, 500, 560),
        "结辩·反四": (210, 875, 980),
        "结辩·正四": (175, 730, 815),
        "结辩": (210, 875, 980),
    },
}

spoken_len = kit.spoken_len


def classify(heading, is_kit=False):
    """Map a section heading to a band key, or None if it is not a full speech.

    A plain script that reserves a 临场位 has a shorter 正文 band, since the
    reserve is spoken live. A kit never does: its live slots are declared parts
    and are counted, so it is checked against the full band.
    """
    h = heading
    if not ("稿" in h or "套件" in h):
        return None
    reserve = (not is_kit) and ("临场位" in h or "临场回应" in h)
    if "奇袭" in h and "申论" in h:
        return "奇袭申论"
    if "立论" in h:
        return "立论"
    if "驳论" in h:
        return "驳论·留临场位" if reserve else "驳论"
    if "小结" in h:
        return "小结·留临场位" if reserve else "小结"
    if "结辩" in h:
        if is_kit:
            return "结辩"
        first = h.split("结辩")[0]
        return "结辩·反四" if ("反" in first[-3:] or "封路" in h) else "结辩·正四"
    return None


def declared(heading):
    """Numbers the heading claims: (lo, hi) for a kit, (n, n) for a script, or None."""
    m = re.search(r"组装后\s*(\d+)\s*[–—-]\s*(\d+)\s*字", heading)
    if m:
        return int(m.group(1)), int(m.group(2))
    m = re.search(r"正文\s*(\d+)\s*字", heading)
    if m:
        return int(m.group(1)), int(m.group(1))
    return None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="+", help="文稿-*.md files")
    ap.add_argument("--format", default=None,
                    help="format key; omit to detect from the file (校赛 headings say 反二质询/正四对辩), "
                         "default ustc-freshman-cup. Known: " + ", ".join(BANDS))
    ap.add_argument("--json", action="store_true", help="machine-readable output")
    args = ap.parse_args()

    fmt = args.format
    if fmt is None:
        fmt = "ustc-freshman-cup"
        for path in args.files:
            try:
                head = open(path, encoding="utf-8").read(4000)
            except OSError:
                continue
            # 校赛 gives 质询 to 二辩 and 对辩 to 四辩; the freshman cup does the opposite.
            if "奇袭" in head or re.search(r"[正反]四对辩", head) or re.search(r"[正反]二质询", head):
                fmt = "ustc-school-cup-2025"
                break
        print("(format: %s%s)" % (fmt, "" if args.format else "，自动判断；用 --format 可指定"))
    bands = BANDS.get(fmt)
    if bands is None:
        print("unknown format %r; known: %s" % (fmt, ", ".join(BANDS)), file=sys.stderr)
        return 2

    bad = 0
    report = []
    for path in args.files:
        with open(path, encoding="utf-8") as fh:
            text = fh.read()
        sections = re.split(r"\n(?=## )", text)
        rows = []
        for sec in sections:
            if not sec.startswith("## ") and not sec.lstrip().startswith("## "):
                continue
            heading, parts = kit.parse(sec.lstrip())
            is_kit = kit.is_kit(parts)
            key = classify(heading, is_kit)
            if not key:
                continue
            secs, lo, hi = bands[key]
            try:
                amin, amax = kit.assembly_range(parts)
                err = None
            except ValueError as e:
                amin = amax = 0
                err = str(e)
            ok = err is None and lo <= amin and amax <= hi
            dec = declared(heading)
            mismatch = dec is not None and dec != (amin, amax)
            if not ok or mismatch:
                bad += 1
            rows.append({"heading": heading, "kind": key, "kit": is_kit, "seconds": secs,
                         "min": amin, "max": amax, "low": lo, "high": hi, "ok": ok,
                         "declared": dec, "mismatch": mismatch, "error": err})
        report.append({"file": path, "speeches": rows})
        if not args.json:
            print("== %s" % path)
            if not rows:
                print("   (no full speeches found — check the headings against the format file)")
            for r in rows:
                mark = "OK  " if (r["ok"] and not r["mismatch"]) else ("OUT " if not r["ok"] else "标题 ")
                n = ("%d–%d" % (r["min"], r["max"])) if r["kit"] else ("%d" % r["min"])
                extra = ""
                if r["error"]:
                    extra = "  " + r["error"]
                elif not r["ok"]:
                    if r["min"] < r["low"]:
                        extra = "  （最短组装少 %d 字）" % (r["low"] - r["min"])
                    if r["max"] > r["high"]:
                        extra += "  （最长组装多 %d 字）" % (r["max"] - r["high"])
                if r["mismatch"]:
                    extra += "  标题写的是 %s，实际 %s" % (
                        ("%d–%d" % r["declared"]) if r["kit"] else r["declared"][0], n)
                print("   %s%-44s %9s 字  目标 %d–%d / %d 秒%s%s"
                      % (mark, r["heading"][:44], n, r["low"], r["high"], r["seconds"],
                         "  [套件]" if r["kit"] else "", extra))

    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    elif bad:
        print("\n%d 篇稿件未通过。超区间的删减顺序：论据 → 修饰语 → 机制中间步骤，价值升华不删；"
              "套件要让最短和最长两种组装都落在区间内；标题数字照脚本输出填，不要手写。" % bad)
    return 1 if bad else 0


if __name__ == "__main__":
    try:
        import signal
        signal.signal(signal.SIGPIPE, signal.SIG_DFL)
    except (AttributeError, ValueError):
        pass
    sys.exit(main())
