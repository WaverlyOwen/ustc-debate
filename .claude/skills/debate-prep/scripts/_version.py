"""Skill version and the version / format a prep folder was made with.

Topics live in prep/v<major>/<目录名>/<题>/ and stay in the version they were
made with. A check introduced in version N declares it in RULES and only runs
on topics of version N or later, so a new release never asks old topics to be
rewritten. A path without a v<N> component counts as the current version.
"""
import glob
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL = os.path.normpath(os.path.join(HERE, ".."))
FORMATS_DIR = os.path.join(SKILL, "references", "formats")

# check name -> first major version that applies it
RULES = {
    "desk-dash": 3,      # check_voice --desk: no dashes in spoken lines of 备赛文档 / 速查
    "pinned-headings": 3,  # check_speeches: every numbered section heading is one row of the format table
    "record-card": 3,    # check_recordcard: 场上记录卡 options equal the kit conditions word for word
}


def skill_version():
    with open(os.path.join(SKILL, "VERSION"), encoding="utf-8") as fh:
        return fh.read().strip()


CURRENT = int(skill_version().split(".")[0])


def _parts(path):
    return os.path.abspath(path).replace("\\", "/").split("/")


def topic_version(path):
    """Major version from a v<N> path component, or CURRENT."""
    for part in reversed(_parts(path)):
        m = re.fullmatch(r"v(\d+)", part)
        if m:
            return int(m.group(1))
    return CURRENT


# old 目录名 -> current 目录名, so a topic left in a folder named before a rename is still recognised
DIR_ALIASES = {
    "校赛2025": "校赛",   # v3.3 dropped the year from the school cup
}


def format_dirs():
    """{目录名: format key} from the 目录名： line of each format file, plus DIR_ALIASES."""
    out = {}
    for p in glob.glob(os.path.join(FORMATS_DIR, "*.md")):
        key = os.path.splitext(os.path.basename(p))[0]
        if key.startswith("_"):
            continue
        with open(p, encoding="utf-8") as fh:
            m = re.search(r"^目录名：\s*(\S+)", fh.read(), re.M)
        if m:
            out[m.group(1)] = key
    for old, new in DIR_ALIASES.items():
        if new in out and old not in out:
            out[old] = out[new]
    return out


def topic_format(path):
    """Format key from the 目录名 component of the path, or None."""
    dirs = format_dirs()
    for part in reversed(_parts(path)):
        if part in dirs:
            return dirs[part]
    return None


def applies(rule, path):
    return topic_version(path) >= RULES.get(rule, 0)


if __name__ == "__main__":
    print(skill_version())
