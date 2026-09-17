#!/usr/bin/env python3
"""Check that numbers quoted in match documents all appear in the canonical 口径表.

Usage:
    python3 check_consistency.py --canon 备赛文档-<题>.tex 速查-*.tex 文稿-*.tex

Files are LaTeX (assets/latex/debate.cls); macros are stripped before numbers are read.

Every number found in the checked files must also appear in the canonical
document. Two readings are checked:

  Arabic    35%, 1.2亿, 2023年, 3.4倍, 12000人 ...  must match the canon exactly
  spoken    六成, 一成四, 百分之十四点一四, 一千两百多件, 三万, 两倍 ...
            the form speeches use (see speech-voice.md §3); each is converted
            to a value with a tolerance (六成 accepts 55–65, 一千两百多 accepts
            1200–1320) and must land on some number in the canon

Numbers that only describe the format itself (180 秒, 约 700 字, 第 5.2 节)
are ignored. A number missing from the canon usually means a script drifted
from the agreed wording, or a datum was introduced without a source: fix the
script, or add the datum to the 口径表 with its source.

Exit code 1 if any mismatch is found.
"""
import argparse
import os
import re
import signal
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _numerals import arabic_tokens, spoken_tokens, canon_values, matches, strip_stage  # noqa: E402
import _tex  # noqa: E402

IGNORE_UNITS = {"秒", "字", "分钟", "分"}  # timing / length descriptors used by the format
SECTION = re.compile(r"^\s*(#+\s*)?\d+(\.\d+)*\s")  # 5.1 xxx style headings
SECTION_REF = re.compile(r"(见|第|节|章|条|附录|表|图)")


def clean_line(line):
    scan = SECTION.sub(" ", line, count=1)                       # "### 2.6 标题" -> drop the heading number
    scan = re.sub(r"^\s*\|\s*\d+\s*\|", "| |", scan)              # "| 18 | ..." table row index
    scan = re.sub(r"(?<![\d.])\d+-(?=[^\d\s])", " ", scan)        # "01-备赛文档" file-name prefixes
    scan = re.sub(r"\b\d{1,2}\s*[–—-]\s*\d{1,2}\s*(个|条|次|句|点|问)", " ", scan)  # "6–8 个" template wording
    scan = re.sub(r"\d+\s*(秒|字)", " ", scan)                    # "约 700 字 / 180 秒" is format metadata
    scan = re.sub(r"(前|中|后|最后|剩)\s*\d+\s*秒", " ", scan)
    return scan


def file_tokens(text):
    found = []
    for ln, line in enumerate(text.split("\n"), 1):
        scan = clean_line(strip_stage(line))
        for t in arabic_tokens(scan, ln, line.strip()):
            if t["unit"] in IGNORE_UNITS:
                continue
            if t["unit"] == "" and len(t["num"]) <= 1:
                continue  # single digits without units are list/section markers
            if t["unit"] == "" and "." in t["num"]:
                ctx = scan[max(0, scan.find(t["raw"]) - 4): scan.find(t["raw"]) + len(t["raw"]) + 4]
                if SECTION_REF.search(ctx):
                    continue  # "见 2.7 第 1 条" style cross-references
            found.append(t)
        for t in spoken_tokens(scan, ln, line.strip()):
            found.append(t)
    return found


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--canon", required=True, help="the 备赛文档 (or 口径表) that holds every approved datum")
    ap.add_argument("--no-spoken", action="store_true", help="skip the spoken-number reading (old behaviour)")
    ap.add_argument("files", nargs="+", help="quick-reference and script files to check")
    args = ap.parse_args()

    canon_text = _tex.plain(_tex.read(args.canon))
    canon_exact = set()
    for ln, line in enumerate(canon_text.split("\n"), 1):
        for t in arabic_tokens(line, ln, line):
            canon_exact.add(t["num"])
    canon_vals = canon_values(canon_text)

    bad = 0
    for path in args.files:
        text = _tex.plain(_tex.read(path))
        missing = []
        for t in file_tokens(text):
            if t["kind"] == "arabic":
                ok = t["num"] in canon_exact or matches(t, canon_vals)
            else:
                if args.no_spoken:
                    continue
                ok = matches(t, canon_vals)
            if not ok:
                missing.append(t)
        if missing:
            print("== %s: %d number(s) not found in canon" % (path, len(missing)))
            for t in missing:
                tag = "" if t["kind"] == "arabic" else "  [口语数字 ≈ %s]" % ("%g" % t["value"])
                print("  line %d: %s%s    | %s" % (t["line"], t["raw"], tag, t["text"][:80]))
            bad += len(missing)
        else:
            print("== %s: OK" % path)
    if bad:
        print("\n%d mismatch(es). Align the wording with the 口径表 or add the datum (with source) to it.\n"
              "口语数字（六成、一千两百多）按数值近似匹配；报出来的多半是稿子里的数与口径表对不上，逐条判断。" % bad)
        return 1
    return 0


if __name__ == "__main__":
    try:
        signal.signal(signal.SIGPIPE, signal.SIG_DFL)
    except (AttributeError, ValueError):
        pass
    sys.exit(main())
