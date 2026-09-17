#!/usr/bin/env python3
"""Check the 论据出处清单 and make sure only verified data reaches the stage.

Usage:
    python3 check_evidence.py --canon 备赛文档-<题>.md 速查-*.md 文稿-*.md [--strict]

Two things are checked.

1. The 出处清单 table itself (the table whose header has 出处, 核实日期 and 状态):
     已核实      must carry a 核实日期 and a source with a year; a link or DOI is
                 expected (WARN, FAIL under --strict); the 原文引句 column, when
                 the table has one, must be filled (WARN, FAIL under --strict)
     有把握 / 【待核实】
                 should carry a 查证方向 so the team can split the checking (WARN)
   An 已核实 row that fails is not "verified": downgrade it to 有把握 or go and
   open the source.

2. Every number in the 速查 and 文稿 files (Arabic or spoken: 六成, 一千两百多)
   is matched against the numbers in the 论据 column. A number that matches only
   【待核实】 rows is a FAIL: unverified data must never be spoken on stage.
   Under --strict (the 2025 school cup, where a false datum loses the round)
   a number that matches only 有把握 rows also fails in 文稿 files and warns
   in 速查 files. Numbers that match no row at all are left to
   check_consistency.py.

Exit code 1 on any FAIL.
"""
import argparse
import os
import re
import signal
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _numerals import arabic_tokens, spoken_tokens, matches, strip_stage  # noqa: E402

DATE = re.compile(r"(19|20)\d{2}\s*[-./年]\s*\d{1,2}\s*[-./月]\s*\d{1,2}")
YEAR = re.compile(r"(19|20)\d{2}")
LINK = re.compile(r"https?://|doi\s*[:：]|10\.\d{4,}/|DOI", re.I)
EMPTY = {"", "—", "-", "–", "无", "/"}


def status_of(cell):
    c = re.sub(r"<[^>]+>|\*", "", cell).strip()
    if "待核实" in c:
        return "待核实"
    if "已核实" in c:
        return "已核实"
    if "有把握" in c:
        return "有把握"
    return c


def find_table(text):
    """Return (header_names, rows) for the evidence table, or (None, [])."""
    lines = text.split("\n")
    for i, line in enumerate(lines):
        if not line.strip().startswith("|"):
            continue
        heads = [h.strip() for h in line.strip().strip("|").split("|")]
        if not (any("出处" in h for h in heads) and any("核实日期" in h for h in heads) and "状态" in heads):
            continue
        rows = []
        j = i + 2  # skip the |---| line
        while j < len(lines) and lines[j].strip().startswith("|"):
            cells = [c.strip() for c in lines[j].strip().strip("|").split("|")]
            if len(cells) >= len(heads) - 1:
                rows.append((j + 1, cells))
            j += 1
        return heads, rows
    return None, []


def col(heads, key):
    for i, h in enumerate(heads):
        if key in h:
            return i
    return None


DATA_UNITS = {"%", "％", "倍", "万", "亿", "万人", "亿人", "万元", "亿元"}


def is_datum(t):
    """Small everyday counts (12 月, 第 3 条, 30 秒) are not data; keep percentages,
    multiples, magnitudes, decimals, and anything from 100 up."""
    if t["is_year"]:
        return False
    if t["unit"] == "" and 1900 <= t["value"] <= 2100 and t["kind"] == "arabic" and "." not in t["num"]:
        return False  # a bare year such as "Nelson & Norton 2005"
    if t["unit"] in DATA_UNITS:
        return True
    if t["kind"] == "arabic" and "." in t["num"]:
        return True
    return t["value"] >= 100


def row_values(cell):
    vals = []
    for t in arabic_tokens(cell, 0, cell):
        if not is_datum(t):
            continue
        vals.append(t["value"])
        if t.get("abs") is not None:
            vals.append(t["abs"])
    for t in spoken_tokens(cell, 0, cell):
        if is_datum(t):
            vals.append(t["value"])
    return vals


def file_numbers(text):
    out = []
    for ln, line in enumerate(text.split("\n"), 1):
        s = line.strip()
        if s.startswith("#"):
            continue
        scan = strip_stage(line)
        scan = re.sub(r"^\s*\d+\.\s", " ", scan)                       # "12. 对辩要点" list numbering
        scan = re.sub(r"^\s*\|\s*\d+\s*\|", "| |", scan)              # table row index
        scan = re.sub(r"\d+\s*[–—-]\s*\d+\s*(秒|字|分钟)", " ", scan)   # "30–40 秒"
        scan = re.sub(r"\d+\s*(秒|字)", " ", scan)
        for t in arabic_tokens(scan, ln, s):
            if is_datum(t):
                out.append(t)
        for t in spoken_tokens(scan, ln, s):
            if is_datum(t):
                out.append(t)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--canon", required=True, help="the 备赛文档 holding the 论据出处清单")
    ap.add_argument("--strict", action="store_true",
                    help="2025 校赛 rule: 已核实 needs a link/DOI and a quote; 有把握 may not appear in 文稿")
    ap.add_argument("files", nargs="*", help="速查 / 文稿 files to check against the list")
    args = ap.parse_args()

    with open(args.canon, encoding="utf-8") as fh:
        canon = fh.read()
    heads, rows = find_table(canon)
    fails, warns = 0, 0
    if heads is None:
        print("FAIL %s: 找不到论据出处清单（表头需含「出处」「核实日期」「状态」）" % args.canon)
        return 1
    c_num, c_claim = col(heads, "#"), col(heads, "论据")
    c_src, c_date, c_status = col(heads, "出处"), col(heads, "核实日期"), col(heads, "状态")
    c_dir, c_quote = col(heads, "查证方向"), col(heads, "原文引句")
    if c_quote is None:
        print("NOTE %s: 出处清单没有「原文引句」列；新模板要求已核实条目附原文引句（40 字内）" % args.canon)

    print("== %s: %d 条论据" % (args.canon, len(rows)))
    table = []  # (status, values, label)
    for ln, cells in rows:
        g = lambda i: cells[i] if i is not None and i < len(cells) else ""
        st = status_of(g(c_status))
        label = "#%s" % re.sub(r"<[^>]+>", "", g(c_num)).strip()
        table.append((st, row_values(g(c_claim)), label, g(c_claim)[:40]))
        if st == "已核实":
            src = g(c_src)
            if not DATE.search(g(c_date)):
                fails += 1
                print("   FAIL %s 已核实但没有核实日期（line %d）→ 降级为「有把握」或补上日期" % (label, ln))
            if src.strip() in EMPTY:
                fails += 1
                print("   FAIL %s 已核实但出处为空（line %d）→ 降级为「有把握」或补上出处" % (label, ln))
            elif not YEAR.search(src):
                warns += 1
                print("   WARN %s 已核实但出处没有年份；网页类出处至少写机构 + 页面名（line %d）" % (label, ln))
            if not LINK.search(src):
                if args.strict:
                    fails += 1
                    print("   FAIL %s 已核实但没有链接或 DOI（校赛严格模式）（line %d）" % (label, ln))
                else:
                    warns += 1
                    print("   WARN %s 已核实但没有链接或 DOI，队员赛前复查会慢（line %d）" % (label, ln))
            if c_quote is not None and g(c_quote).strip() in EMPTY:
                if args.strict:
                    fails += 1
                    print("   FAIL %s 已核实但没有原文引句（校赛严格模式）（line %d）" % (label, ln))
                else:
                    warns += 1
                    print("   WARN %s 已核实但没有原文引句（line %d）" % (label, ln))
        elif st in ("有把握", "待核实"):
            if c_dir is not None and g(c_dir).strip() in EMPTY:
                warns += 1
                print("   WARN %s %s 但没有查证方向（line %d）" % (label, st, ln))
        else:
            fails += 1
            print("   FAIL %s 状态「%s」不是三种之一（已核实 / 有把握 / 【待核实】）（line %d）" % (label, g(c_status), ln))

    for path in args.files:
        with open(path, encoding="utf-8") as fh:
            text = fh.read()
        is_script = "文稿" in os.path.basename(path)
        hits = []
        for t in file_numbers(text):
            sts = {st for st, vals, _, _ in table if matches(t, vals)}
            if not sts:
                continue
            if "已核实" in sts:
                continue
            labels = [lab for st, vals, lab, _ in table if matches(t, vals) and st != "已核实"]
            if "待核实" in sts and "有把握" not in sts:
                hits.append(("FAIL", t, "只对应【待核实】条目 %s" % "、".join(labels)))
            elif args.strict:
                hits.append(("FAIL" if is_script else "WARN", t, "只对应「有把握」条目 %s（校赛：正赛稿件只许已核实数据）" % "、".join(labels)))
        if hits:
            print("== %s" % path)
            for lvl, t, why in hits:
                if lvl == "FAIL":
                    fails += 1
                else:
                    warns += 1
                print("   %s line %d: %s → %s    | %s" % (lvl, t["line"], t["raw"], why, t["text"][:60]))
        else:
            print("== %s: OK" % path)

    print("\n%d FAIL, %d WARN" % (fails, warns))
    if fails:
        print("已核实的门槛是硬的：出处 + 核实日期缺一就降级；【待核实】的数据不得写进速查与文稿。")
    return 1 if fails else 0


if __name__ == "__main__":
    try:
        signal.signal(signal.SIGPIPE, signal.SIG_DFL)
    except (AttributeError, ValueError):
        pass
    sys.exit(main())
