#!/usr/bin/env python3
"""Compile the debate documents (.tex, written against assets/latex/debate.cls) to PDF.

Usage:
    python3 build_pdf.py prep/<题>/            # every .tex in the folder
    python3 build_pdf.py prep/<题>/速查-*.tex  # just these
    python3 build_pdf.py --check              # only report whether the toolchain is there

Needs XeLaTeX with ctex + tcolorbox and a Simplified Chinese font (Noto /
思源 / 苹方 / 微软雅黑 / 文泉驿). .claude/hooks/ensure-tex.sh installs it on
Claude Code on the web; on a personal machine install TeX Live / MacTeX.
Nothing is pip-installed here.

latexmk is used when present (it reruns as needed and cleans up); otherwise
xelatex is run twice. After each PDF the page count is printed; a 速查 that
runs past two pages gets a WARN, because the sheet is read on stage.

Exit code 1 if any file fails to compile or the toolchain is missing.
"""
import argparse
import glob
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
CLS_DIR = os.path.join(HERE, "..", "assets", "latex")
QUICKREF_MAX_PAGES = 2

INSTALL = """没有找到 XeLaTeX（或缺 ctex / tcolorbox）。安装方法：
  macOS   : brew install --cask mactex-no-gui
  Windows : TeX Live 或 MiKTeX，勾选 XeTeX 与中文支持
  Ubuntu  : sudo apt install texlive-xetex texlive-lang-chinese texlive-latex-extra texlive-plain-generic fonts-noto-cjk latexmk
装好后重新运行本脚本；.tex 文件已经写好，不会丢。"""


def toolchain():
    xe = shutil.which("xelatex")
    if not xe:
        return None, "xelatex 不在 PATH 里"
    for sty in ("ctexart.cls", "tcolorbox.sty", "xeCJKfntef.sty", "ulem.sty"):
        r = subprocess.run(["kpsewhich", sty], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if r.returncode != 0:
            return None, "缺 %s" % sty
    return xe, ""


def pdf_pages(pdf_path):
    if shutil.which("pdfinfo"):
        r = subprocess.run(["pdfinfo", pdf_path], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        m = re.search(r"Pages:\s+(\d+)", r.stdout)
        if m:
            return int(m.group(1))
    try:
        data = open(pdf_path, "rb").read()
    except OSError:
        return None
    n = len(re.findall(rb"/Type\s*/Page(?![s/a-zA-Z])", data))
    if n:
        return n
    counts = [int(x) for x in re.findall(rb"/Type\s*/Pages[^>]*?/Count\s+(\d+)", data, re.S)]
    return max(counts) if counts else None


def compile_one(tex_path, env):
    d = os.path.dirname(os.path.abspath(tex_path)) or "."
    base = os.path.basename(tex_path)
    if shutil.which("latexmk"):
        cmd = ["latexmk", "-xelatex", "-interaction=nonstopmode", "-halt-on-error", "-silent", base]
        r = subprocess.run(cmd, cwd=d, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        ok = r.returncode == 0
        subprocess.run(["latexmk", "-c", "-silent", base], cwd=d, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    else:
        ok = True
        for _ in range(2):
            r = subprocess.run(["xelatex", "-interaction=nonstopmode", "-halt-on-error", base], cwd=d, env=env,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if r.returncode != 0:
                ok = False
                break
        for ext in (".aux", ".out", ".toc", ".fls", ".fdb_latexmk", ".xdv"):
            p = os.path.join(d, os.path.splitext(base)[0] + ext)
            if os.path.exists(p):
                os.remove(p)
    pdf = os.path.join(d, os.path.splitext(base)[0] + ".pdf")
    log = os.path.join(d, os.path.splitext(base)[0] + ".log")
    errors = []
    if not ok and os.path.exists(log):
        with open(log, encoding="utf-8", errors="replace") as fh:
            lines = fh.read().split("\n")
        for i, ln in enumerate(lines):
            if ln.startswith("!"):
                errors.append("\n".join(lines[i:i + 4]))
                if len(errors) >= 3:
                    break
    if ok and os.path.exists(log):
        os.remove(log)
    return ok and os.path.exists(pdf), pdf, errors


def collect(paths):
    files = []
    for p in paths:
        if os.path.isdir(p):
            files += sorted(glob.glob(os.path.join(p, "*.tex")))
        elif p.lower().endswith(".tex"):
            files.append(p)
    return files


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("paths", nargs="*", help=".tex files or folders")
    ap.add_argument("--check", action="store_true", help="only check the toolchain")
    args = ap.parse_args()

    xe, why = toolchain()
    if not xe:
        print("FAIL %s\n%s" % (why, INSTALL))
        return 1
    if args.check:
        v = subprocess.run(["xelatex", "--version"], stdout=subprocess.PIPE, text=True).stdout.split("\n")[0]
        print("OK   %s（%s）" % (v, xe))
        return 0
    files = collect(args.paths)
    if not files:
        print("no .tex files found", file=sys.stderr)
        return 2
    env = dict(os.environ)
    env["TEXINPUTS"] = ".:" + os.path.abspath(CLS_DIR) + ":" + env.get("TEXINPUTS", "")
    failed, over = [], []
    for tex in files:
        ok, pdf, errors = compile_one(tex, env)
        if not ok:
            failed.append(tex)
            print("FAIL %s" % tex)
            for e in errors:
                print("     " + e.replace("\n", "\n     "))
            continue
        pages = pdf_pages(pdf)
        print("OK   %s  ->  %s%s" % (tex, pdf, ("  %d 页" % pages) if pages else ""))
        if "速查" in os.path.basename(tex) and pages and pages > QUICKREF_MAX_PAGES:
            over.append((tex, pages))
            print("WARN %s 排出 %d 页，速查要控制在 %d 页以内：删对方论点表里最弱的行、合并临场预案，不要缩字号"
                  % (os.path.basename(tex), pages, QUICKREF_MAX_PAGES))
    if failed:
        print("\n%d 个文件编译失败（.log 保留在同目录，看第一个 ! 开头的错误）。" % len(failed))
        return 1
    if over:
        print("\n%d 份速查超过 %d 页（见上方 WARN），内容删到两页以内再重新生成。" % (len(over), QUICKREF_MAX_PAGES))
    return 0


if __name__ == "__main__":
    sys.exit(main())
