"""Shared number extraction for the debate-prep checkers.

Scripts are written with spoken numbers (六成、一千两百多件、百分之十四点一四) while
the 口径表 and the 出处清单 keep the precise Arabic form (58.3%, 1266 件, 14.14%).
A checker that only reads Arabic digits therefore sees nothing in a speech. This
module reads both forms and turns each into a value plus a tolerance, so that
"六成" can be matched against 58.3 and "一千两百多" against 1266.

Each token is a dict:
    value      float, the number (percent tokens are in percentage points)
    tol        absolute tolerance to accept when matching
    unit       the unit string that followed it ("" if none)
    raw        the text as written
    kind       "arabic" | "spoken"
    line       1-based line number
    text       the stripped line, for reports
    is_year    True for a bare 4-digit year
"""
import re

CN_DIGITS = {"零": 0, "〇": 0, "一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5, "六": 6,
             "七": 7, "八": 8, "九": 9}
CN_SMALL = {"十": 10, "百": 100, "千": 1000}
CN_BIG = {"万": 10 ** 4, "亿": 10 ** 8}
CN_CHARS = "零〇一二三四五六七八九两十百千万亿点"

VAGUE_PREFIX = ("上", "数", "几", "好几", "成", "近百", "过")   # 上百位、数百家: not a datum
APPROX_PREFIX = ("约", "大约", "近", "将近", "不到", "超过", "逾", "至少", "多达", "高达", "接近", "不足")
APPROX_SUFFIX = ("多", "余", "来", "左右", "上下", "出头", "以上", "以下", "不到")

# Arabic numbers with the units the documents use. Kept close to the older
# check_consistency pattern so its behaviour on precise numbers does not change.
ARABIC = re.compile(
    r"(?<![0-9A-Za-z.])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*"
    r"(%|％|倍|万人|亿人|万元|亿元|万|亿|千米|公里|千|百|年|人|个|次|元|美元|小时|分钟|天|岁|名|篇|项|例|份|家|所|米|分|件|条|位|场|次|款|种|部|本|集|秒|字)?")

PERCENT_OF = re.compile(r"百分之([零〇一二三四五六七八九两十百千点]{1,12})")
CHENG = re.compile(r"(?<![一-鿿])?(约|大约|近|将近|不到|超过|逾|接近|不足)?([一二三四五六七八九两])成([一二三四五六七八九半])?(?!绩|果|本|员|立|长|熟|功|为|就|人|年|交|效|型|分|家|语|品|片|绩|名)")
SPOKEN = re.compile(
    r"(约|大约|近|将近|不到|超过|逾|至少|多达|高达|接近|不足|上|数|几|好几)?"
    r"([零〇一二三四五六七八九两十百千万亿]{1,14}(?:点[零〇一二三四五六七八九两]{1,4})?)"
    r"(多|余|来|左右|上下|出头|以上|以下)?"
    r"(倍|年|人|件|名|篇|项|元|次|场|所|家|岁|个|位|条|款|种|部|本|集|万|亿|小时|分钟|天|米|公里|千米)?")


def cn_to_num(s):
    """Convert a Chinese numeral string to a float, or None if it is not one.

    Handles 一千两百、三万、十四、二十、一百零五、二〇二一、十点七四亿、一点五.
    """
    if not s or any(c not in CN_CHARS for c in s):
        return None
    if "点" in s:
        head, _, tail = s.partition("点")
        if not tail or any(c not in CN_DIGITS for c in tail):
            return None
        base = cn_to_num(head) if head else 0
        if base is None:
            return None
        frac = "".join(str(CN_DIGITS[c]) for c in tail)
        return float("%d.%s" % (int(base), frac))
    if all(c in CN_DIGITS for c in s):
        # digit sequence such as 二〇二一 or 二一; single digits too
        return float("".join(str(CN_DIGITS[c]) for c in s))
    total, section, number = 0, 0, 0
    for c in s:
        if c in CN_DIGITS:
            number = CN_DIGITS[c]
        elif c in CN_SMALL:
            unit = CN_SMALL[c]
            section += (number if number else 1) * unit
            number = 0
        elif c in CN_BIG:
            big = CN_BIG[c]
            section += number
            if section == 0:
                section = 1
            total = (total + section) * big if total else section * big
            section, number = 0, 0
        else:
            return None
    return float(total + section + number)


def _percent_tokens(scan, ln, text):
    out = []
    for m in PERCENT_OF.finditer(scan):
        v = cn_to_num(m.group(1))
        if v is None:
            continue
        tol = 0.05 if "点" in m.group(1) else 0.5
        out.append({"value": v, "tol": tol, "unit": "%", "raw": m.group(0), "kind": "spoken",
                    "line": ln, "text": text, "is_year": False})
    for m in CHENG.finditer(scan):
        tens = CN_DIGITS[m.group(2)]
        if m.group(3):
            ones = 5 if m.group(3) == "半" else CN_DIGITS[m.group(3)]
            v, tol = tens * 10 + ones, 1.0
        else:
            v, tol = tens * 10, 5.0
        out.append({"value": float(v), "tol": tol, "unit": "%", "raw": m.group(0), "kind": "spoken",
                    "line": ln, "text": text, "is_year": False})
    return out


def _spoken_tokens(scan, ln, text):
    out = []
    # blank out the percent forms first so their digits are not re-read as plain numerals
    scan = PERCENT_OF.sub(" ", scan)
    scan = CHENG.sub(" ", scan)
    for m in SPOKEN.finditer(scan):
        prefix, num, suffix, unit = m.group(1) or "", m.group(2), m.group(3) or "", m.group(4) or ""
        start = m.start(2)
        if start > 0 and scan[start - 1] in "第星期周礼拜":
            continue          # 第一、星期三
        if prefix in VAGUE_PREFIX:
            continue          # 上百位、数百家、几千人: rhetorical scale, not a datum
        v = cn_to_num(num)
        if v is None:
            continue
        if unit in CN_BIG:    # "三万" parsed as num=三 unit=万, or num already ate the 万
            v *= CN_BIG[unit]
            unit = ""
        is_year = unit == "年" and 1900 <= v <= 2100 and "点" not in num
        if is_year:
            tol = 0.0
        elif unit == "倍":
            tol = 0.25
        elif v < 100 and not is_year:
            continue          # 三年、两个人、十五秒: everyday counts, not data
        elif prefix in APPROX_PREFIX or suffix in APPROX_SUFFIX:
            tol = max(0.1 * v, 1.0)
        else:
            tol = max(0.02 * v, 0.5)
        out.append({"value": v, "tol": tol, "unit": unit, "raw": m.group(0), "kind": "spoken",
                    "line": ln, "text": text, "is_year": is_year})
    return out


def arabic_tokens(scan, ln, text):
    out = []
    for m in ARABIC.finditer(scan):
        num, unit = m.group(1), m.group(2) or ""
        v = float(num.replace(",", ""))
        is_year = unit == "年" and 1900 <= v <= 2100 and "." not in num
        if unit == "万":
            v_abs = v * 1e4
        elif unit == "亿":
            v_abs = v * 1e8
        else:
            v_abs = None
        out.append({"value": v, "tol": 0.0, "unit": unit, "raw": m.group(0).strip(), "kind": "arabic",
                    "line": ln, "text": text, "is_year": is_year, "abs": v_abs, "num": num.replace(",", "")})
    return out


def spoken_tokens(scan, ln, text):
    return _percent_tokens(scan, ln, text) + _spoken_tokens(scan, ln, text)


def canon_values(text):
    """All numeric values a canonical document contains, in every reading."""
    vals = set()
    for ln, line in enumerate(text.split("\n"), 1):
        for t in arabic_tokens(line, ln, line):
            vals.add(t["value"])
            if t.get("abs") is not None:
                vals.add(t["abs"])
        for t in spoken_tokens(line, ln, line):
            vals.add(t["value"])
    return vals


def matches(tok, values):
    v, tol = tok["value"], tok["tol"]
    for c in values:
        if abs(c - v) <= tol:
            return True
    return False


def strip_stage(text):
    """Drop stage directions and asides that are never spoken."""
    return re.sub(r"〔[^〕]*〕|【[^】]*】", " ", text)
