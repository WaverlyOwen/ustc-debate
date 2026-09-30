#!/usr/bin/env bash
# SessionStart hook: make sure XeLaTeX + ctex + a CJK font are available so
# scripts/build_pdf.py can compile the debate documents.
#
# On Claude Code on the web the container starts empty, apt is reachable and
# the session runs as root, so install quietly. A personal machine is almost
# never root with apt; if it is, set DEBATE_PREP_NO_INSTALL=1 to opt out. In
# every other case nothing is installed: just say what is missing and how to
# get it.
set -u
if command -v xelatex >/dev/null 2>&1 && kpsewhich ctex.sty >/dev/null 2>&1 \
   && fc-list :lang=zh 2>/dev/null | grep -qiE "Noto (Sans|Serif) CJK|Source Han|PingFang|Microsoft YaHei|SimSun|WenQuanYi"; then
  exit 0
fi
if [ "$(id -u)" = "0" ] && command -v apt-get >/dev/null 2>&1 && [ -z "${DEBATE_PREP_NO_INSTALL:-}" ]; then
  echo "[debate-prep] 安装 XeLaTeX、ctex 与 Noto CJK 字体（约 2–3 分钟）..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq >/dev/null 2>&1
  apt-get install -y -qq --no-install-recommends \
      texlive-xetex texlive-lang-chinese texlive-latex-extra texlive-plain-generic texlive-fonts-recommended \
      fonts-noto-cjk latexmk poppler-utils >/dev/null 2>&1 \
    && echo "[debate-prep] TeX 环境就绪：$(xelatex --version | head -1)" \
    || echo "[debate-prep] apt 安装失败，PDF 生成会退回保留 .tex 并提示；请查看网络策略"
  exit 0
fi
cat <<'MSG'
[debate-prep] 没有找到 XeLaTeX + ctex + 中文字体，PDF 生成会跳过。安装方法：
  macOS   : brew install --cask mactex-no-gui   （或 basictex 后 tlmgr install ctex xecjk tcolorbox latexmk）
  Windows : 安装 TeX Live 或 MiKTeX，勾选 XeTeX 与中文支持
  Ubuntu  : sudo apt install texlive-xetex texlive-lang-chinese texlive-latex-extra texlive-plain-generic fonts-noto-cjk latexmk
MSG
exit 0
