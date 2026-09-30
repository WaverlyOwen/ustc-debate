#!/usr/bin/env python3
"""Check that each 速查's 场上记录卡 matches the kits in the same side's 文稿.

Usage:
    python3 check_recordcard.py prep/v<版本>/<赛制>/<题>/速查-*.tex prep/v<版本>/<赛制>/<题>/文稿-*.tex

The card is how a debater picks a module on stage, so the two have to agree
word for word:

- every \\opt{…} on the card is the condition of a module (without its leading
  「如果」) or of a fallback in that side's 文稿
- every module and fallback condition in the 文稿 appears on the card

Files are paired by side (正方 / 反方) and folder. Rows without \\opt (free
writing such as 「对方回避了哪些问题」) are not checked. Topics older than the
rule's version (see _version.RULES) are skipped. Exit code 1 on any mismatch.
"""
import argparse
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _tex  # noqa: E402
import _version  # noqa: E402


def norm(s):
    return re.sub(r"\s+", "", _tex.plain(s))


def card_options(text):
    m = re.search(r"\\begin\{recordcard\}(.*?)\\end\{recordcard\}", text, re.S)
    if not m:
        return None
    body, out = m.group(1), []
    for om in re.finditer(r"\\opt\s*\{", body):
        a, _ = _tex.args(body, om.end() - 1, 1)
        if a:
            out.append(norm(a[0]))
    return out


def kit_conditions(text):
    """[(kit heading, group name, condition)] for every module and fallback."""
    out = []
    for kind, title, meta, body in _tex.sections(text):
        if kind != "kit":
            continue
        for p in _tex.kit_parts(body):
            if p.kind != "pick":
                continue
            for cond, _, is_fallback in p.modules:
                c = norm(cond)
                if not is_fallback:
                    c = re.sub(r"^如果", "", c)
                out.append((title, p.name, c))
        # a kit nested in a stage (奇袭申论) is listed by sections() as well
    return out


def side_of(path):
    b = os.path.basename(path)
    return "正方" if "正方" in b else "反方" if "反方" in b else None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="+", help="速查-*.tex and 文稿-*.tex")
    args = ap.parse_args()

    quick = [f for f in args.files if "速查" in os.path.basename(f)]
    script = [f for f in args.files if "文稿" in os.path.basename(f)]
    bad = 0
    for q in quick:
        if not _version.applies("record-card", q):
            print("== %s  跳过（v%d 辩题；这条规则从 v%d 起）" % (q, _version.topic_version(q), _version.RULES["record-card"]))
            continue
        side, folder = side_of(q), os.path.dirname(os.path.abspath(q))
        mates = [s for s in script if side_of(s) == side and os.path.dirname(os.path.abspath(s)) == folder]
        opts = card_options(_tex.read(q))
        if opts is None:
            print("== %s  没有场上记录卡（\\begin{recordcard}）" % q)
            bad += 1
            continue
        if not mates:
            print("== %s  找不到同目录的 文稿-%s-*.tex，没法对照" % (q, side))
            bad += 1
            continue
        conds = [c for s in mates for c in kit_conditions(_tex.read(s))]
        known = {c for _, _, c in conds}
        stray = [o for o in opts if o not in known]
        missing = [(t, g, c) for t, g, c in conds if c not in set(opts)]
        if not stray and not missing:
            print("== %s  OK（%d 个选项）" % (q, len(opts)))
            continue
        bad += 1
        print("== %s  %d 个选项对不上文稿，%d 个模块条件没上卡" % (q, len(stray), len(missing)))
        for o in stray:
            print("   卡上有、文稿没有：%s" % o[:60])
        for t, g, c in missing:
            print("   文稿有、卡上没有：%s ·「%s」：%s" % (t[:20], g, c[:50]))
    if bad:
        print("\n记录卡的选项要和文稿里模块的条件逐字一致（去掉开头的「如果」）。"
              "改一边就同步改另一边；条件太长放不下，就回文稿把条件写短。")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
