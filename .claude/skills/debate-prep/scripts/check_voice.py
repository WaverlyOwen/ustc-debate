#!/usr/bin/env python3
"""Flag the mechanical tells that make a debate script sound read rather than spoken.

Usage:
    python3 check_voice.py prep/<题>/文稿-*.md
    python3 check_voice.py --desk prep/<题>/备赛文档-*.md prep/<题>/速查-*.md

Speech mode (文稿) checks the five tells that can be counted (the other four in
references/speech-voice.md need a human ear):

  破折号        zero anywhere in the speech: a dash is inaudible
  加粗          at most 2 in any assembly the speaker could build
  段末金句      not on the closing line of 3+ paragraphs of one piece
  句长落差      no run of 3+ near-equal sentences within one piece
  三连排比      at most one per piece
  书面连接词    none
  口语黏合剂    at least 3 in EVERY assembly, i.e. even the one built from the
                modules with the fewest

A kit (套件, see kit.py) is checked over every possible assembly, not a sample:
a live choice of modules must never produce a speech that fails.

Desk mode (--desk) checks only the text a debater will say out loud: the whole
of a 速查, and in a 备赛文档 the 口径表's 标准表述 and 允许的换说法 columns, the
first sentence of every 定义 / 判准 card, and lines labelled 口头版, 一句话… or
…口径. There, dashes must be zero. Analysis prose may keep its dashes.

Exit code 1 if anything fails.
"""
import argparse
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

BOOKISH = ["综上所述", "值得注意的是", "鉴于", "旨在", "因而", "与此同时", "由此可见",
           "不言而喻", "众所周知", "从某种意义上", "换而言之", "诚然如此", "基于此",
           "在此基础上", "总而言之", "一言以蔽之"]
COLLOQUIAL = ["请评委", "你想想", "大家想", "说白了", "我举个例子", "打个比方", "这么说吧",
              "我方承认", "我们承认", "说到底", "你有没有", "各位", "请问", "想一想",
              "我先说", "先说清", "话说回来", "老实说", "坦白说", "不瞒各位"]
STAGE = re.compile(r"〔[^〕]*〕|【[^】]*】")


def sentences(text):
    t = STAGE.sub(" ", text)
    t = re.sub(r"\*+", "", t)
    parts = [p.strip() for p in re.split(r"[。！？\n]", t)]
    return [p for p in parts if len(re.findall(r"[一-鿿]", p)) >= 4]


def cjk(s):
    return len(re.findall(r"[一-鿿]", s))


def parallel_triples(sents):
    """Rough count of three-part parallelism: a sentence with 2+ internal 、or ，
    whose segments are near-equal length and start with the same character."""
    n = 0
    for s in sents:
        segs = [x for x in re.split(r"[，、；]", s) if cjk(x) >= 3]
        if len(segs) < 3:
            continue
        for i in range(len(segs) - 2):
            trio = segs[i:i + 3]
            lens = [cjk(x) for x in trio]
            heads = [x.strip()[0] for x in trio if x.strip()]
            if max(lens) - min(lens) <= 2 and len(set(heads)) == 1:
                n += 1
                break
            if max(lens) - min(lens) <= 3 and all(cjk(x) <= 8 for x in trio):
                n += 1
                break
    return n


def flat_runs(sents, window=3, tol=4):
    """Runs of `window` consecutive sentences whose lengths differ by <= tol."""
    runs = 0
    i = 0
    lens = [cjk(s) for s in sents]
    while i <= len(lens) - window:
        chunk = lens[i:i + window]
        if max(chunk) - min(chunk) <= tol and min(chunk) >= 12:
            runs += 1
            i += window
        else:
            i += 1
    return runs


def n_bold(t):
    return len(re.findall(r"\*\*([^*\n]{6,})\*\*", t))


def n_glue(t):
    return sum(t.count(w) for w in COLLOQUIAL)


def check_piece(text):
    """Local tells: they belong to one continuous stretch of speech."""
    problems = []
    paras = [p.strip() for p in text.split("\n") if p.strip() and not p.strip().startswith(("-", "*", ">", "|", "#"))]
    closers = sum(1 for p in paras if re.search(r"\*\*[^*]{6,}\*\*\s*$", p))
    if closers >= 3:
        problems.append(("段末金句", closers, "让一部分段落平着收，反差才能突出真正的重点"))
    sents = sentences(text)
    runs = flat_runs(sents)
    if runs >= 3:
        problems.append(("等长句串", runs, "插入 6 字以内的短句或 40 字以上的长句打破节奏"))
    tri = parallel_triples(sents)
    if tri > 1:
        problems.append(("三连排比", tri, "每段最多 1 次；把其中一项拆成单句或删掉第三项"))
    return problems


def check_section(parts):
    problems = []
    whole = kit.all_text(parts)
    dash = whole.count("——")
    if dash:
        problems.append(("破折号", dash, "应为 0；改成句号断句，或换成「也就是说」「比如」"))
    found = [w for w in BOOKISH if w in whole]
    if found:
        problems.append(("书面连接词", "、".join(found), "换成「所以」「说到底」「还有」"))
    _, bold_max = kit.assembly_range(parts, n_bold, live_counts=False)
    if bold_max > 2:
        problems.append(("加粗", bold_max, "任何一种组装最多 2 处；加粗是重音提示，不是每段的收尾装饰"))
    glue_min, _ = kit.assembly_range(parts, n_glue, live_counts=False)
    if glue_min < 3:
        problems.append(("口语黏合剂", glue_min, "最少的那种组装也要有 3 处：问评委一句、招呼听众动脑、坦白一句"))
    for name, text in kit.pieces(parts):
        for pr in check_piece(text):
            problems.append((pr[0], "%s（%s）" % (pr[1], name[:18]), pr[2]))
    return problems, {"dash": dash, "bold": bold_max, "glue": glue_min}


SPOKEN_LABEL = re.compile(r"(口头版|一句话[^：:*]{0,6}|[^：:*\s]{0,8}口径|标准表述)\**\s*[：:](.*)$")


def desk_spoken(text, whole_file):
    """Yield (line_no, snippet) for every dash in text that will be said aloud."""
    lines = text.split("\n")
    if whole_file:
        for i, ln in enumerate(lines, 1):
            if "——" in ln:
                yield i, ln.strip()
        return
    cols, in_kj = [], False
    for i, ln in enumerate(lines, 1):
        st = ln.strip()
        if st.startswith("|"):
            cells = [c.strip() for c in st.strip("|").split("|")]
            if cells and cells[0] == "类别" and "标准表述" in cells:
                cols = [j for j, c in enumerate(cells) if c in ("标准表述", "允许的换说法")]
                in_kj = True
                continue
            if in_kj and not re.match(r"^[\s|:-]+$", st):
                for j in cols:
                    if j < len(cells) and "——" in cells[j] and cells[j].strip("—- ") != "":
                        yield i, cells[j]
            continue
        in_kj = False
        m = SPOKEN_LABEL.search(st)
        if m:
            said = m.group(2)
            q = re.match(r"\s*[\"“「](.*?)[\"”」]", said)          # a quoted line: only the quote is said
            said = q.group(1) if q else re.split(r"(?<=[。！？])|(?:出处|来源|状态|支撑|边界)[：:]", said, maxsplit=1)[0]
            if "——" in said:
                yield i, said.strip()
                continue
        m = re.match(r"^\s*[-*]\s*\*\*[^*]*(?:有利|中立)(?:定义|判准)\*\*\s*[：:]\s*(.*)$", ln)
        if m:
            first = re.split(r"(?<=[。．])", m.group(1).strip(), maxsplit=1)[0]
            if "——" in first:
                yield i, first


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="+")
    ap.add_argument("--desk", action="store_true", help="check the spoken fields of 备赛文档 / 速查 instead of speeches")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    bad = 0
    if args.desk:
        for path in args.files:
            text = open(path, encoding="utf-8").read()
            hits = list(desk_spoken(text, whole_file="速查" in os.path.basename(path)))
            if hits:
                bad += 1
                print("== %s  %d 处会被念出口的破折号" % (path, len(hits)))
                for ln, snip in hits:
                    print("   line %d: %s" % (ln, snip[:70]))
            else:
                print("== %s  OK" % path)
        if bad:
            print("\n这些句子会被队员说出口。破折号改成句号断句，或换成「也就是说」「比如」。")
        return 1 if bad else 0

    for path in args.files:
        text = open(path, encoding="utf-8").read()
        print("== %s" % path)
        for sec in re.split(r"\n(?=## )", text):
            if not sec.lstrip().startswith("## "):
                continue
            heading, parts = kit.parse(sec.lstrip())
            if not re.search(r"(立论|驳论|小结|结辩|申论)", heading) or not ("稿" in heading or "套件" in heading):
                continue
            try:
                problems, stats = check_section(parts)
            except ValueError as e:
                problems, stats = [("套件结构", "", str(e))], {"dash": 0, "bold": 0, "glue": 0}
            if problems:
                bad += 1
                print("   FAIL %s" % heading[:44])
                for name, value, fix in problems:
                    print("        %-6s %-22s %s" % (name, value, fix))
            else:
                print("   OK   %-44s 破折号 %d 加粗≤%d 口语≥%d%s"
                      % (heading[:44], stats["dash"], stats["bold"], stats["glue"],
                         "  [套件]" if kit.is_kit(parts) else ""))
    if bad:
        print("\n%d 篇有机械痕迹。改法见 references/speech-voice.md；"
              "画面、数字口语化、形容词、不工整这四条要自己出声念一遍。" % bad)
    return 1 if bad else 0


if __name__ == "__main__":
    try:
        import signal
        signal.signal(signal.SIGPIPE, signal.SIG_DFL)
    except (AttributeError, ValueError):
        pass
    sys.exit(main())
