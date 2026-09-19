#!/usr/bin/env python3
"""Validate a format (赛制) YAML file before it enters the library.

Usage:
    python3 check_format.py references/formats/<id>.yaml

Checks: required top-level fields; every stage has n / name / type / seconds
and the fields its type needs (speaker, or asker + target); enumerations
(type, timing, side); serials are 1..N in order; speakers use the 正一 / 反四
form and the position exists in `positions`; every side has at least one
立论 and one 结辩; first_opening / first_closing agree with the stage order;
speech bands can be derived; each side's document list is non-empty. Prints
the derived headings so the author can eyeball them.

Exit code 1 on any error. Warnings (unconfirmed fields, missing sources) do not fail.
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _format as F  # noqa: E402

CN_NUM = "一二三四五六七八九"


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    path = sys.argv[1]
    errors, warns = [], []
    try:
        fmt = F.load(path)
    except Exception as e:  # noqa: BLE001
        print("FAIL 无法解析：%s" % e)
        return 1
    for k in ("id", "name", "teams", "first_opening", "first_closing", "stages"):
        if not fmt.get(k):
            errors.append("缺字段 %s" % k)
    if fmt.get("id") and os.path.splitext(os.path.basename(path))[0] != fmt["id"]:
        errors.append("id (%s) 与文件名不一致" % fmt["id"])
    if fmt.get("level_default") and fmt["level_default"] not in F.LEVEL_RATE:
        errors.append("level_default 只能是 %s" % " / ".join(F.LEVEL_RATE))
    positions = fmt.get("positions") or ["一辩", "二辩", "三辩", "四辩"]
    npos = len(positions)

    def ok_speaker(sp):
        if sp in ("全员", "正方", "反方", "双方"):
            return True
        m = re.fullmatch(r"([正反])([%s])" % CN_NUM, str(sp))
        return bool(m) and CN_NUM.index(m.group(2)) < npos

    seen_n = []
    for s in F.stages(fmt):
        n = s.get("n")
        tag = "环节 %s（%s）" % (n, s.get("name", "?"))
        if n is None:
            errors.append("有环节缺 n"); continue
        seen_n.append(n)
        for k in ("name", "type", "seconds"):
            if s.get(k) in (None, ""):
                errors.append("%s 缺 %s" % (tag, k))
        if s.get("type") not in F.STAGE_TYPES:
            errors.append("%s type=%r 不在枚举里：%s" % (tag, s.get("type"), " / ".join(F.STAGE_TYPES)))
        if s.get("timing") and s["timing"] not in F.TIMINGS:
            errors.append("%s timing=%r 不在枚举里：%s" % (tag, s["timing"], " / ".join(F.TIMINGS)))
        if s.get("side") and s["side"] not in F.SIDES:
            errors.append("%s side=%r 只能是 %s" % (tag, s["side"], " / ".join(F.SIDES)))
        t = s.get("type")
        if t in F.SPEECH_TYPES:
            if not s.get("speaker") or not s.get("side"):
                errors.append("%s 是%s，需要 speaker 与 side" % (tag, t))
            elif not ok_speaker(s["speaker"]):
                errors.append("%s speaker=%r 写法应为 正一 / 反四，且辩位不超过 %d" % (tag, s["speaker"], npos))
        if t in ("质询", "盘问"):
            if not s.get("asker") or not s.get("target") or not s.get("side"):
                errors.append("%s 是%s，需要 asker、target 与 side" % (tag, t))
            else:
                for sp in [s["asker"]] + F._lst(s["target"]):
                    if not ok_speaker(sp):
                        errors.append("%s 发言人 %r 写法应为 正一 / 反四" % (tag, sp))
        if t == "对辩" and not s.get("speaker"):
            errors.append("%s 是对辩，需要 speaker（两人列表）" % tag)
        if s.get("reserve_seconds") and int(s["reserve_seconds"]) >= int(s.get("seconds") or 0):
            errors.append("%s 临场位不能大于等于时长" % tag)
        if s.get("questions") and len(F._lst(s["questions"])) != 4:
            errors.append("%s questions 要 4 个数：链下限、链上限、问下限、问上限" % tag)
    if seen_n != list(range(1, len(seen_n) + 1)):
        errors.append("环节序号必须从 1 连续编到 %d，现在是 %s" % (len(seen_n), seen_n))

    for side in ("正方", "反方"):
        types = [s.get("type") for s in F.stages(fmt) if s.get("side") == side]
        if "立论" not in types:
            warns.append("%s没有立论环节" % side)
        if "结辩" not in types:
            warns.append("%s没有结辩环节" % side)
    opens = [s for s in F.stages(fmt) if s.get("type") == "立论"]
    closes = [s for s in F.stages(fmt) if s.get("type") == "结辩"]
    if opens and fmt.get("first_opening") and opens[0].get("side") != fmt["first_opening"]:
        errors.append("first_opening=%s，但第一个立论环节是%s" % (fmt["first_opening"], opens[0].get("side")))
    if closes and fmt.get("first_closing") and closes[0].get("side") != fmt["first_closing"]:
        errors.append("first_closing=%s，但第一个结辩环节是%s" % (fmt["first_closing"], closes[0].get("side")))
    if not fmt.get("sources"):
        warns.append("没有 sources：写明规则出处与查阅日期")
    for u in fmt.get("unconfirmed") or []:
        warns.append("待确认：%s" % u)

    if not errors:
        try:
            F.bands(fmt)
            for side in ("正方", "反方"):
                if not F.documents(fmt, side):
                    errors.append("%s推不出任何稿件，检查 side / speaker" % side)
        except Exception as e:  # noqa: BLE001
            errors.append("推导字数区间或稿件清单失败：%s" % e)

    for e in errors:
        print("FAIL " + e)
    for w in warns:
        print("WARN " + w)
    if errors:
        print("\n%d 处错误，改完再放进赛制库。" % len(errors))
        return 1
    print("OK   %s（%s）：%d 个环节，%d 篇稿件/方" % (fmt.get("name"), fmt.get("id"), len(F.stages(fmt)), len(F.documents(fmt, "正方"))))
    for side in ("正方", "反方"):
        print("  %s：" % side)
        for h in F.headings(fmt, side):
            print("    " + h)
    return 0


if __name__ == "__main__":
    try:
        import signal
        signal.signal(signal.SIGPIPE, signal.SIG_DFL)
    except (AttributeError, ValueError):
        pass
    sys.exit(main())
