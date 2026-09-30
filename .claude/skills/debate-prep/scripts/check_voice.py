#!/usr/bin/env python3
"""Flag the mechanical tells that make a debate script sound read rather than spoken.

Usage:
    python3 check_voice.py prep/v<版本>/<赛制>/<题>/文稿-*.tex [--verbose]

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

A kit (\\begin{kit}, see _tex.kit_parts) is checked over EVERY assembly the
speaker could build on the day, by running the full check above on each one:
a live choice of modules must never produce a speech that fails. The report
names one failing assembly by its chosen modules.

Desk mode (--desk) checks the lines of a 备赛文档 or 速查 that a debater will
say out loud: the whole of a 速查, and in a 备赛文档 the \\definition one-liners,
\\thesis and thesisbox, the 标准表述 and 允许的换说法 columns of \\canonrow,
\\sub{口头版}, and any \\field whose label ends in 口径. There, dashes must be
zero. Analysis prose may keep its dashes.

Exit code 1 if anything fails.
"""
import argparse
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _tex  # noqa: E402
import _version  # noqa: E402

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


def check_kit(heading, raw):
    """Run check() on every assembly of a kit. Returns (problems, stats, n_assemblies)."""
    parts = _tex.kit_parts(raw)
    seen, first_bad, n = {}, None, 0
    worst = {"dash": 0, "bold": 0, "glue": 10 ** 6, "kinds": 10 ** 6}
    for choices, tex in _tex.assemblies(parts):
        n += 1
        probs, st = check(heading, tex)
        worst["dash"] = max(worst["dash"], st["dash"]); worst["bold"] = max(worst["bold"], st["bold"])
        worst["glue"] = min(worst["glue"], st["glue"]); worst["kinds"] = min(worst["kinds"], st["kinds"])
        for name, value, fix in probs:
            if name not in seen:
                seen[name] = [0, value, fix, choices]
            seen[name][0] += 1
    # Pieces that trip a check on their own: names the module to rewrite instead of an assembly.
    pieces = [("固定「%s」" % p.name, p.text) for p in parts if p.kind == "fixed"]
    pieces += [("「%s」%s" % (p.name, cond), t) for p in parts if p.kind == "pick" for cond, t, _ in p.modules]
    problems = []
    for name, (cnt, value, fix, choices) in seen.items():
        own = [label for label, t in pieces if any(pn == name for pn, _, _ in check(heading, t)[0])]
        where = ("出在：" + "；".join(own)) if own else ("如：" + ("；".join(choices) or "固定段"))
        problems.append((name, "%s（%d/%d 种组装，%s）" % (value, cnt, n, where), fix))
    if n == 0:
        worst = {"dash": 0, "bold": 0, "glue": 0, "kinds": 0}
    return problems, worst, n


SPOKEN_ONE_ARG = ("definition",)


def spoken_dash(t):
    """A dash inside a sentence. A cell holding only "——" is a placeholder, not speech."""
    return re.search(r"[^\s{}&]——|——[^\s{}&]", _tex.plain(t)) is not None


def desk_lines(path):
    """Yield (line, text) for each spoken line in a 备赛文档 / 速查 that contains a dash."""
    text = _tex.read(path)
    body_start = text.find("\\begin{document}")
    body = text[body_start:] if body_start >= 0 else text
    offset = text.count("\n", 0, max(body_start, 0))
    quick = "速查" in os.path.basename(path) or re.search(r"\\documentclass\[[^\]]*quick", text)
    hits = []
    if quick:
        for k, ln in enumerate(body.split("\n"), 1):
            if spoken_dash(ln):
                hits.append((offset + k, _tex.plain(ln).strip()))
        return hits

    def grab(pattern, n_args, keep):
        for m in re.finditer(pattern, body):
            a, _ = _tex.args(body, m.end() - 1, n_args)
            for idx in keep:
                if idx < len(a) and spoken_dash(a[idx]):
                    hits.append((offset + body.count("\n", 0, m.start()) + 1, _tex.plain(a[idx]).strip()))
    grab(r"\\definition\s*\{", 1, [0])
    grab(r"\\thesis\s*\{", 2, [1])
    grab(r"\\canonrow\s*\{", 5, [1, 2])
    for m in re.finditer(r"\\sub\s*\{口头版\}", body):
        a, _ = _tex.args(body, m.end(), 1)
        if a and spoken_dash(a[0]):
            hits.append((offset + body.count("\n", 0, m.start()) + 1, _tex.plain(a[0]).strip()))
    for m in re.finditer(r"\\field\s*\{", body):
        a, _ = _tex.args(body, m.end() - 1, 2)
        if len(a) == 2 and _tex.plain(a[0]).strip().endswith("口径") and spoken_dash(a[1]):
            hits.append((offset + body.count("\n", 0, m.start()) + 1, _tex.plain(a[1]).strip()))
    for m in re.finditer(r"\\begin\{thesisbox\}", body):
        end = body.find("\\end{thesisbox}", m.end())
        seg = re.sub(r"^\s*\[[^\]]*\]", "", body[m.end():end])
        if spoken_dash(seg):
            hits.append((offset + body.count("\n", 0, m.start()) + 1, _tex.plain(seg).strip()))
    return sorted(set(hits))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="+")
    ap.add_argument("--verbose", action="store_true", help="also print stats for speeches that pass")
    ap.add_argument("--desk", action="store_true", help="check the spoken lines of 备赛文档 / 速查 instead of speeches")
    args = ap.parse_args()

    bad = 0
    if args.desk:
        for path in args.files:
            if not _version.applies("desk-dash", path):
                print("== %s  跳过（v%d 辩题；这条规则从 v%d 起）" % (path, _version.topic_version(path), _version.RULES["desk-dash"]))
                continue
            hits = desk_lines(path)
            if hits:
                bad += 1
                print("== %s  %d 处会被念出口的破折号" % (path, len(hits)))
                for ln, t in hits:
                    print("   line %d: %s" % (ln, t[:70]))
            else:
                print("== %s  OK" % path)
        if bad:
            print("\n这些句子会被队员说出口。破折号改成句号断句，或换成冒号、「也就是说」「比如」。")
        return 1 if bad else 0
    for path in args.files:
        text = _tex.read(path)
        print("== %s" % path)
        for kind, title, meta, body in _tex.sections(text):
            if kind not in ("speech", "kit"):
                continue
            heading = _tex.heading(title, meta)
            if not re.search(r"(立论|驳论|小结|结辩|申论)", heading):
                continue
            if kind == "kit":
                try:
                    problems, stats, n = check_kit(heading, body)
                except ValueError as e:
                    problems, stats, n = [("套件结构", "", str(e))], {"dash": 0, "bold": 0, "glue": 0, "kinds": 0}, 0
            else:
                if "稿" not in heading:
                    continue
                problems, stats = check(heading, body, args.verbose)
                n = 0
            if problems:
                bad += 1
                print("   FAIL %s" % heading[:44])
                for name, value, fix in problems:
                    print("        %-6s %-14s %s" % (name, value, fix))
            else:
                if n:
                    print("   OK   %-44s %d 种组装全过：着重≤%d 口语≥%d（≥%d 类）  [套件]"
                          % (heading[:44], n, stats["bold"], stats["glue"], stats["kinds"]))
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
