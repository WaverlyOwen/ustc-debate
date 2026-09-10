#!/usr/bin/env python3
"""Flag the mechanical tells that make a debate script sound read rather than spoken.

Usage:
    python3 check_voice.py prep/<题>/03-文稿-*.md [--verbose]

Checks the five tells that can be counted objectively (see
references/speech-voice.md for the other four, which need a human ear):

  破折号        must be zero — a dash is inaudible, so it marks a pause the
                audience hears but cannot account for
  加粗          at most 2 per speech, and never on the closing sentence of
                several paragraphs in a row: a bolded flourish every paragraph
                trains the judge to stop hearing them
  句长落差      no run of 3+ sentences of near-equal length
  三连排比      at most one per speech
  书面连接词    none: 综上所述 / 值得注意的是 / 鉴于 / 旨在 / 因而 / 与此同时 …
  口语黏合剂    at least 3 per speech (a question to the judges, a nudge to the
                audience, an admission) — the thing that makes a script sound
                like talking

Exit code 1 if any speech fails.
"""
import argparse
import re
import sys

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


def body_of(section):
    lines = section.split("\n")[1:]
    out = []
    for ln in lines:
        s = ln.strip()
        if re.match(r"^\**如果[^*]*就", s) or s.startswith("**如果"):
            break
        out.append(ln)
    while out and (not out[-1].strip() or out[-1].strip().startswith(("-", "*", ">"))):
        out.pop()
    return "\n".join(out)


def check(heading, body, verbose=False):
    problems = []
    dash = len(re.findall(r"——", body))
    if dash:
        problems.append(("破折号", dash, "应为 0；改成句号断句，或换成「也就是说」「比如」"))

    bold = re.findall(r"\*\*([^*\n]{6,})\*\*", body)
    if len(bold) > 2:
        problems.append(("加粗句", len(bold), "最多 2 处；加粗是重音提示，不是每段的收尾装饰"))

    paras = [p.strip() for p in body.split("\n") if p.strip() and not p.strip().startswith(("-", "*", ">", "|"))]
    closers = sum(1 for p in paras if re.search(r"\*\*[^*]{6,}\*\*\s*$", p))
    if closers >= 3:
        problems.append(("段末金句", closers, "让一部分段落平着收，反差才能突出真正的重点"))

    sents = sentences(body)
    runs = flat_runs(sents)
    if runs >= 3:
        problems.append(("等长句串", runs, "插入 6 字以内的短句或 40 字以上的长句打破节奏"))

    tri = parallel_triples(sents)
    if tri > 1:
        problems.append(("三连排比", tri, "全稿最多 1 次；把其中一项拆成单句或删掉第三项"))

    found_bookish = [w for w in BOOKISH if w in body]
    if found_bookish:
        problems.append(("书面连接词", "、".join(found_bookish), "换成「所以」「说到底」「还有」"))

    glue = sum(body.count(w) for w in COLLOQUIAL)
    if glue < 3:
        problems.append(("口语黏合剂", glue, "至少 3 处：问评委一句、招呼听众动脑、坦白一句"))

    return problems, {"dash": dash, "bold": len(bold), "glue": glue, "sents": len(sents)}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="+")
    ap.add_argument("--verbose", action="store_true", help="also print stats for speeches that pass")
    args = ap.parse_args()

    bad = 0
    for path in args.files:
        with open(path, encoding="utf-8") as fh:
            text = fh.read()
        print("== %s" % path)
        for sec in re.split(r"\n(?=## )", text):
            heading = sec.split("\n")[0].lstrip("# ").strip()
            if not re.search(r"(立论|驳论|小结|结辩)稿", heading):
                continue
            problems, stats = check(heading, body_of(sec), args.verbose)
            if problems:
                bad += 1
                print("   FAIL %s" % heading[:44])
                for name, value, fix in problems:
                    print("        %-6s %-14s %s" % (name, value, fix))
            else:
                print("   OK   %-44s 破折号 %d 加粗 %d 口语 %d"
                      % (heading[:44], stats["dash"], stats["bold"], stats["glue"]))
    if bad:
        print("\n%d 篇稿件有机械痕迹。改法见 references/speech-voice.md，"
              "剩下的四条（画面、数字口语化、形容词、不工整）要自己出声念一遍。" % bad)
    return 1 if bad else 0


if __name__ == "__main__":
    try:
        import signal
        signal.signal(signal.SIGPIPE, signal.SIG_DFL)
    except (AttributeError, ValueError):
        pass
    sys.exit(main())
