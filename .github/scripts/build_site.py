#!/usr/bin/env python3
"""Assemble the GitHub Pages site: the timer at the root, the prep PDFs under prep/ with an index page.

Usage: python3 .github/scripts/build_site.py <output dir>
"""
import html
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "_site").resolve()

KIND_ORDER = {"备赛文档": 0, "速查": 1, "文稿": 2, "摘要": 3}


def kind_of(name: str) -> int:
    for k, v in KIND_ORDER.items():
        if name.startswith(k):
            return v
    return 9


def main() -> int:
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    timer = ROOT / "timer" / "debate-timer.html"
    shutil.copy(timer, OUT / "index.html")
    shutil.copy(timer, OUT / "debate-timer.html")
    (OUT / ".nojekyll").write_text("")

    rows = []
    for pdf in sorted((ROOT / "prep").rglob("*.pdf")):
        rel = pdf.relative_to(ROOT)
        dest = OUT / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(pdf, dest)
        for md in pdf.parent.glob("摘要-*.md"):
            shutil.copy(md, OUT / md.relative_to(ROOT))
        rows.append(rel)

    # One entry per motion: version / format / motion, then its files in a fixed order.
    motions = {}
    for rel in rows:
        motions.setdefault(rel.parent, []).append(rel)
    parts = []
    for folder in sorted(motions, key=lambda p: (p.parts[1], p.parts[2], p.parts[3]), reverse=True):
        version, fmt, motion = folder.parts[1:4]
        files = sorted(motions[folder], key=lambda p: (kind_of(p.name), p.name))
        # The index lives at prep/index.html, so links are relative to prep/.
        links = "".join(
            f'<li><a href="{html.escape(p.relative_to("prep").as_posix())}">{html.escape(p.stem)}</a></li>' for p in files
        )
        summary = folder / f"摘要-{motion}.md"
        summary_link = (
            f'<li><a href="{html.escape(summary.relative_to("prep").as_posix())}">摘要（Markdown）</a></li>'
            if (ROOT / summary).exists() else ""
        )
        parts.append(
            f"<section><h2>{html.escape(motion)}<small>{html.escape(fmt)} · {html.escape(version)}</small></h2>"
            f"<ul>{links}{summary_link}</ul></section>"
        )
    page = f"""<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>备赛文档</title>
<style>
:root{{color-scheme:light dark;--fg:#1a1a1a;--bg:#fbfaf7;--muted:#6b6b6b;--line:#e3e0d8;--link:#8a1c1c}}
@media(prefers-color-scheme:dark){{:root{{--fg:#eae7e0;--bg:#17181a;--muted:#9a9a9a;--line:#2c2e32;--link:#f0a3a3}}}}
body{{margin:0;padding:32px 16px 64px;font:16px/1.7 -apple-system,"PingFang SC","Noto Sans CJK SC","Microsoft YaHei",sans-serif;color:var(--fg);background:var(--bg)}}
main{{max-width:720px;margin:0 auto}}h1{{font-size:28px;margin:0 0 4px}}p.lead{{color:var(--muted);margin:0 0 28px}}
section{{border-top:1px solid var(--line);padding:18px 0}}h2{{font-size:20px;margin:0 0 8px}}h2 small{{display:block;font-size:13px;font-weight:400;color:var(--muted)}}
ul{{margin:0;padding-left:1.2em}}li{{margin:2px 0}}a{{color:var(--link);text-decoration:none}}a:hover{{text-decoration:underline}}
</style></head><body><main>
<h1>备赛文档</h1>
<p class="lead">每道辩题：双方共用的备赛文档，每方一份正赛速查与正赛文稿。<a href="../">计时器在这里</a>。</p>
{''.join(parts)}
</main></body></html>
"""
    (OUT / "prep" / "index.html").write_text(page, encoding="utf-8")
    print(f"site: {OUT}  pdfs: {len(rows)}  motions: {len(motions)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
