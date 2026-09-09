#!/usr/bin/env python3
"""Check that numbers quoted in match documents all appear in the canonical 口径表.

Usage:
    python3 check_consistency.py --canon 01-备赛文档.md 02-速查-正方.md 03-文稿-正方.md ...

Every number-like token (35%, 1.2亿, 2023年, 3.4倍, 12000人 ...) found in the
checked files must also appear somewhere in the canonical document. Numbers
that only describe the format itself (180 秒, 约 700 字, 第 5.2 节) are ignored.
A number missing from the canon usually means a script drifted from the
agreed wording, or a datum was introduced without a source: fix the script,
or add the datum to the 口径表 with its source.

Exit code 1 if any mismatch is found.
"""
import argparse
import re
import signal
import sys

NUM = re.compile(r"(?<![\w.])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(%|％|倍|万|亿|千|百|年|人|个|次|元|美元|小时|分钟|天|岁|名|篇|项|例|份|家|所|万人|亿人|万元|亿元|千米|公里|米|分)?")
IGNORE_UNITS = {"秒", "字", "分钟", "分"}  # timing / length descriptors used by the format
SECTION = re.compile(r"^\s*(#+\s*)?\d+(\.\d+)*\s")  # 5.1 xxx style headings


SECTION_REF = re.compile(r"(见|第|节|章|条|附录|表|图)")


def tokens(text, skip_format=True):
    found = []
    for ln, line in enumerate(text.split("\n"), 1):
        scan = line
        if skip_format:
            scan = SECTION.sub(" ", scan, count=1)            # "### 2.6 标题" -> drop the heading number
            scan = re.sub(r"^\s*\|\s*\d+\s*\|", "| |", scan)     # "| 18 | ..." table row index
            scan = re.sub(r"\d+\s*(秒|字)", " ", scan)         # "约 700 字 / 180 秒" is format metadata
        for m in NUM.finditer(scan):
            num, unit = m.group(1), m.group(2) or ""
            if unit in IGNORE_UNITS:
                continue
            if unit == "" and len(num.replace(",", "")) <= 1:
                continue  # single digits without units are list/section markers
            if unit == "" and "." in num and skip_format:
                ctx = scan[max(0, m.start() - 4): m.end() + 4]
                if SECTION_REF.search(ctx):
                    continue  # "见 2.7 第 1 条" style cross-references
            found.append((num.replace(",", ""), unit, ln, line.strip()))
    return found


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--canon", required=True, help="the 备赛文档 (or 口径表) that holds every approved datum")
    ap.add_argument("files", nargs="+", help="quick-reference and script files to check")
    args = ap.parse_args()

    with open(args.canon, encoding="utf-8") as fh:
        canon_text = fh.read()
    canon_nums = {n for n, _, _, _ in tokens(canon_text, skip_format=False)}

    bad = 0
    for path in args.files:
        with open(path, encoding="utf-8") as fh:
            text = fh.read()
        missing = [(n, u, ln, line) for n, u, ln, line in tokens(text) if n not in canon_nums]
        if missing:
            print("== %s: %d number(s) not found in canon" % (path, len(missing)))
            for n, u, ln, line in missing:
                print("  line %d: %s%s    | %s" % (ln, n, u, line[:80]))
            bad += len(missing)
        else:
            print("== %s: OK" % path)
    if bad:
        print("\n%d mismatch(es). Align the wording with the 口径表 or add the datum (with source) to it." % bad)
        return 1
    return 0


if __name__ == "__main__":
    try:
        signal.signal(signal.SIGPIPE, signal.SIG_DFL)
    except (AttributeError, ValueError):
        pass
    sys.exit(main())
