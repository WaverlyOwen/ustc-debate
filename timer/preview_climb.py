"""Bundle the interactive climbing preview for viewing directly from a local file."""
import json

import build


def main():
    scene = build.WEB / "climb"
    entry = scene / "preview.js"
    main_module, imports = build.embedded_modules(entry)
    formats = build.parse_all(build.DEFAULT_FORMATS_DIR)
    cup = next(f for f in formats if f["id"] == "ustc-chongxiao-cup")
    data = json.dumps([cup], ensure_ascii=False).replace("<", "\\u003c")
    license_text = (build.WEB / "vendor/three-0.187.0/LICENSE").read_text(encoding="utf-8")
    bootstrap = (f"<!-- {license_text} -->\n<script>window.DT = {{BUILTIN_FORMATS:{data}}};</script>\n"
                 f'<script type="importmap">{json.dumps({"imports": imports})}</script>\n'
                 f'<script type="module">import "{main_module}";</script>')
    page = (scene / "study.html").read_text(encoding="utf-8")
    page = page.replace('<link rel="stylesheet" href="./style.css">',
                        "<style>" + (scene / "style.css").read_text(encoding="utf-8") + "</style>")
    page = page.replace('<script defer src="../../assets/timer.js"></script>', "")
    page = page.replace('<script type="module" src="./preview.js"></script>', bootstrap)
    target = build.HERE / "dist/climb-preview.html"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(page, encoding="utf-8", newline="\n")
    print(target)


if __name__ == "__main__":
    main()
