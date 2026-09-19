#!/usr/bin/env python3
"""Print what a format (赛制) file implies: flow, per-side document list, 文稿 headings, word bands.

Usage:
    python3 format_info.py --list                       # every format in references/formats/
    python3 format_info.py <id|alias>                   # overview: flow table, bands, both sides' headings
    python3 format_info.py <id> --headings 正方          # exactly the \\begin{speech}/\\begin{stage} titles to use
    python3 format_info.py <id> --bands [--level 校队]   # spoken-character bands per speech
    python3 format_info.py <id> --checklist 反方         # 稿件清单 with what each item is for
    python3 format_info.py <id> --flow                   # the stage table for the 备赛文档 赛制要点 section

The 文稿 must use the headings verbatim: check_speeches.py matches speeches to
the format by these titles.
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _format as F  # noqa: E402

PURPOSE = {
    "立论": "全部定义、中立判准与双方义务、全部论点、后场追问的问题",
    "被质询": "对方一定会问的问题与我方口径，回答短、守住前提",
    "质询": "封闭式问题链，每问 25 字内，附预期回答与分支、打断用语、收束语",
    "驳论": "挑对方最致命的一到两点打穿，后发言者留临场位",
    "对辩": "4–5 个进攻点、6–8 个备用点、对方最可能问的三个问题",
    "盘问": "两条链，先问一人再问另一人同一问题检验口径",
    "被盘问": "两人口径必须一致的问答表",
    "小结": "盘问成果 → 与论点的连接 → 当前战场总结",
    "申论": "重建被打塌的论点或立起未被触碰的战场",
    "自由辩": "二到三个主战场、必问必答、时间分配与站位",
    "结辩": "归纳分歧 → 处理对方最强点 → 论点收束 → 价值升华 → 结尾短句",
    "奇袭": "质询链 + 申论稿各一份，附发动时机判断",
    "观众提问": "可能被问到的问题与口径",
    "其他": "按赛制说明准备",
}


def resolve(key):
    if key in F.list_formats():
        return F.load(key)
    fmt = F.find(key)
    if not fmt:
        sys.exit("未知赛制 %r；已有：%s" % (key, ", ".join(F.list_formats())))
    return fmt


def print_flow(fmt):
    print("| 序 | 环节 | 时长 | 计时 | 发言人 | 打分块 |")
    print("|---|---|---|---|---|---|")
    for s in F.stages(fmt):
        who = s.get("speaker") or (("%s 问，%s 答" % (s.get("asker"), "/".join(F._lst(s.get("target"))))) if s.get("asker") else "—")
        if isinstance(who, list):
            who = " 与 ".join(who)
        print("| %s | %s | %s 秒 | %s | %s | %s |" % (s["n"], s.get("name", ""), s.get("seconds", ""), s.get("timing", "—"), who, s.get("block", "—")))


def print_bands(fmt, level):
    lo, hi = F.rate(fmt, level)
    print("语速 %d–%d 口播字/分钟（%s）" % (lo, hi, level or fmt.get("level_default") or "赛制默认"))
    b = F.bands(fmt, level)
    by_n = {s["n"]: s for s in F.stages(fmt)}
    for n, (secs, lo_, hi_) in b.items():
        name = by_n[n]["name"] if n in by_n else "奇袭申论"
        extra = ""
        if n in by_n and by_n[n].get("reserve_seconds"):
            extra = "（留临场位 %d 秒，正文按 %d 秒写）" % (by_n[n]["reserve_seconds"], secs)
        print("  %-22s %4d–%4d 字 / %d 秒%s" % (name, lo_, hi_, by_n[n]["seconds"] if n in by_n else secs, extra))
    q = F.question_bands(fmt)
    for n, (c1, c2, q1, q2) in q.items():
        print("  %-22s %d–%d 条链，共 %d–%d 问，每问 25 字内" % (by_n[n]["name"], c1, c2, q1, q2))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("format", nargs="?")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--headings", metavar="SIDE")
    ap.add_argument("--checklist", metavar="SIDE")
    ap.add_argument("--bands", action="store_true")
    ap.add_argument("--flow", action="store_true")
    ap.add_argument("--level", choices=list(F.LEVEL_RATE))
    args = ap.parse_args()
    if args.list or not args.format:
        for fid in F.list_formats():
            fmt = F.load(fid)
            print("%-24s %s  别名：%s" % (fid, fmt.get("name", ""), "、".join(fmt.get("aliases") or [])))
        return 0
    fmt = resolve(args.format)
    if args.headings:
        for h in F.headings(fmt, args.headings):
            print(h)
        return 0
    if args.checklist:
        for i, d in enumerate(F.documents(fmt, args.checklist), 1):
            print("%2d. %s（%s）\n    %s" % (i, d["title"], d["meta"], PURPOSE.get(d["slot"], "")))
        return 0
    if args.bands:
        print_bands(fmt, args.level)
        return 0
    if args.flow:
        print_flow(fmt)
        return 0
    print("%s（%s）  %s，%s先立论，%s先结辩，默认水平：%s，论据红线：%s" % (
        fmt.get("name"), fmt["id"], fmt.get("teams"), fmt.get("first_opening"), fmt.get("first_closing"),
        fmt.get("level_default"), "是" if fmt.get("evidence_strict") else "否"))
    print("别名：" + "、".join(fmt.get("aliases") or []))
    pool = fmt.get("time_pool")
    if pool:
        print("时间池：%s" % pool.get("note", "每队 %s 秒由队伍自由分配到环节 %s，每环节不少于 %s 秒" % (pool.get("seconds"), pool.get("stages"), pool.get("min_per_stage"))))
    print("\n## 流程"); print_flow(fmt)
    print("\n## 字数区间"); print_bands(fmt, args.level)
    for side in ("正方", "反方"):
        print("\n## %s文稿标题（原样使用）" % side)
        for h in F.headings(fmt, side):
            print("  " + h)
    if fmt.get("unconfirmed"):
        print("\n## 待确认（赛前问组委会）")
        for u in fmt["unconfirmed"]:
            print("  - " + str(u))
    md = fmt.get("_md")
    if md and os.path.exists(md):
        print("\n策略性提醒见 %s" % os.path.relpath(md))
    return 0


if __name__ == "__main__":
    try:
        import signal
        signal.signal(signal.SIGPIPE, signal.SIG_DFL)
    except (AttributeError, ValueError):
        pass
    sys.exit(main())
