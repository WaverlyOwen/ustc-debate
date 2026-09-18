#!/usr/bin/env python3
"""Flag the mechanical tells that make a debate script sound read rather than spoken.

Usage:
    python3 check_voice.py prep/<题>/文稿-*.tex [--verbose]

The file is LaTeX (assets/latex/debate.cls): a speech is \begin{speech}…\end{speech},
emphasis is \stress{…}, stage directions \aside{…} and 临场位 notes \reserve{…}
are not spoken and are ignored here.

Checks the tells that can be counted objectively (see
references/speech-voice.md for the ones that need a human ear):

  破折号        must be zero — a dash is inaudible, so it marks a pause the
                audience hears but cannot account for
  着重号        \stress{…} at most 2 per speech, and never on the closing
                sentence of several paragraphs in a row: a flourish every
                paragraph trains the judge to stop hearing them
  句长落差      no run of 3+ sentences of near-equal length
  三连排比      at most one per speech
  书面连接词    none: 综上所述 / 值得注意的是 / 鉴于 / 旨在 / 因而 / 与此同时 …
  口语黏合剂    at least 3 per speech, of at least 2 different kinds, and no
                single phrase more than 3 times — "请评委" three times is not
                talking, it is passing the check
  数字口语化    no decimals or percent signs in the spoken text; the precise
                value lives in the 速查 (百分之十四出头, 将近六成 on stage)

Exit code 1 if any speech fails.
"""
import argparse
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _tex  # noqa: E402

BOOKISH = ["综上所述", "值得注意的是", "鉴于", "旨在", "因而", "与此同时", "由此可见",
           "不言而喻", "众所周知", "从某种意义上", "换而言之", "诚然如此", "基于此",
           "在此基础上", "总而言之", "一言以蔽之", "毋庸置疑", "不可否认的是", "综上"]
# Each entry is one kind of glue; variants of the same move are listed together
# so that the "different kinds" rule counts moves, not spellings.
COLLOQUIAL = {
    "问评委": ["请评委", "各位评委", "评委您", "请各位", "各位"],
    "招呼听众": ["你想想", "大家想", "想一想", "你有没有", "你有没有想过", "大家有没有", "您想想", "各位想"],
    "坦白": ["我方承认", "我们承认", "老实说", "坦白说", "不瞒各位", "我承认", "说实话", "我方不否认"],
    "口语转折": ["说白了", "说到底", "这么说吧", "话说回来", "换句话说", "也就是说", "打个比方", "我举个例子",
             "举个例子", "比如说"],
    "路标": ["我先说", "先说清", "先说一件事", "请问", "我问一句", "问一句", "我再说一遍", "记住这句话"],
}
STAGE = re.compile(r"〔[^〕]*〕|【[^】]*】")
DECIMAL = re.compile(r"\d+\.\d+|\d+\s*[%％]")


def sentences(text):
    t = STAGE.sub(" ", text)
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
            tails = [x.strip()[-1] for x in trio if x.strip()]
            if max(lens) - min(lens) <= 2 and all(cjk(x) <= 8 for x in trio) and (len(set(heads)) == 1 or len(set(tails)) == 1):
                n += 1   # short, equal, and rhyming on the same head or tail character: that is parallelism, not a list
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


def speech_body(body):
    """Spoken text of a speech: macros stripped, \aside / \reserve dropped, contingency box excluded."""
    body = re.sub(r"\\begin\{contingency\}.*?\\end\{contingency\}", " ", body, flags=re.S)
    return _tex.spoken(body), body


def glue_counts(body):
    """{kind: {phrase: count}} counting each occurrence once, longest phrase first."""
    text = STAGE.sub(" ", body)
    found = {}
    phrases = sorted(((p, k) for k, ps in COLLOQUIAL.items() for p in ps), key=lambda x: -len(x[0]))
    for p, k in phrases:
        n = text.count(p)
        if n:
            found.setdefault(k, {})[p] = n
            text = text.replace(p, " ")
    return found


def check(heading, raw, verbose=False):
    body, tex = speech_body(raw)
    problems = []
    dash = len(re.findall(r"——", body))
    if dash:
        problems.append(("破折号", dash, "应为 0；改成句号断句，或换成「也就是说」「比如」"))

    bold = [x for x in _tex.stresses(tex) if len(x) >= 6]
    if len(bold) > 2:
        problems.append(("着重号", len(bold), "\\stress 最多 2 处；着重号是重音提示，不是每段的收尾装饰"))

    paras = _tex.speech_paragraphs(tex)
    closers = sum(1 for p in paras if re.search(r"\\stress\{[^{}]{6,}\}\s*[。！？]?\s*$", p))
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

    found = glue_counts(body)
    glue = sum(sum(v.values()) for v in found.values())
    kinds = len(found)
    top = max(((p, n) for v in found.values() for p, n in v.items()), key=lambda x: x[1], default=("", 0))
    if glue < 3:
        problems.append(("口语黏合剂", glue, "至少 3 处：问评委一句、招呼听众动脑、坦白一句"))
    elif kinds < 2:
        problems.append(("黏合剂单一", "只有「%s」一类" % next(iter(found)), "换着来：问评委、招呼听众、坦白、口语转折至少两类"))
    if top[1] > 3:
        problems.append(("黏合剂重复", "「%s」×%d" % top, "同一句话最多 3 次；重复同一句不是口语，是凑数"))

    decimals = DECIMAL.findall(body)
    if decimals:
        problems.append(("数字未口语化", "、".join(decimals[:4]), "稿里写「百分之十四出头」「将近六成」，精确值放速查"))

    return problems, {"dash": dash, "bold": len(bold), "glue": glue, "kinds": kinds, "sents": len(sents)}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="+")
    ap.add_argument("--verbose", action="store_true", help="also print stats for speeches that pass")
    args = ap.parse_args()

    bad = 0
    for path in args.files:
        text = _tex.read(path)
        print("== %s" % path)
        for kind, title, meta, body in _tex.sections(text):
            if kind != "speech":
                continue
            heading = _tex.heading(title, meta)
            if not re.search(r"(立论|驳论|小结|结辩|申论)稿", heading):
                continue
            problems, stats = check(heading, body, args.verbose)
            if problems:
                bad += 1
                print("   FAIL %s" % heading[:44])
                for name, value, fix in problems:
                    print("        %-6s %-14s %s" % (name, value, fix))
            else:
                print("   OK   %-44s 破折号 %d 着重 %d 口语 %d（%d 类）"
                      % (heading[:44], stats["dash"], stats["bold"], stats["glue"], stats["kinds"]))
    if bad:
        print("\n%d 篇稿件有机械痕迹。改法见 references/speech-voice.md，"
              "剩下的三条（画面、形容词、不工整）要自己出声念一遍。" % bad)
    return 1 if bad else 0


if __name__ == "__main__":
    try:
        import signal
        signal.signal(signal.SIGPIPE, signal.SIG_DFL)
    except (AttributeError, ValueError):
        pass
    sys.exit(main())
