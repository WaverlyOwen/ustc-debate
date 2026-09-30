# ustc-debate

面向中国科学技术大学新生辩论赛的华语辩论备赛 Skill（Claude Code / Claude 通用）。

给它一道辩题（可选题解、赛制），它会**始终为正反双方对称备赛**，并交付三类文档，源文件是 LaTeX（`.tex`，写在自带的 `debate.cls` 之上），用 XeLaTeX 编译成 PDF：

| 文档 | 内容 |
|---|---|
| 备赛文档 | 关键词定义（正方有利 / 反方有利 / 中立三版及反驳）、判准与双方论证义务（三版及反驳）、双方各 2–3 个经对抗迭代的论点（学理、数据、案例，注明出处与研究方法）、覆盖对方全部可能论点的反驳库、持方优劣评估、双方口径表、论据出处清单 |
| 正赛速查（每方一份） | 一句话立论、定义与判准标准表述、论点与核心论据、对方论点的一句话反驳、必问必答、自由辩战场、临场预案；最后一页是场上记录卡 |
| 正赛文稿（每方一份） | 按赛制的全部环节：正一立论是定稿；反一立论、驳论、小结、结辩、奇袭申论是套件（见下）；质询链、对辩、盘问、自由辩战场是预案 |

## 目录结构

```
.claude/skills/debate-prep/
├── SKILL.md                         # 技能入口：原则、输入、九步流程（第 0–8 步）、输出、版本、后续互动
├── VERSION                          # 当前版本号（主版本.次版本）
├── CHANGELOG.md                     # 各版本的改动、兼容约定、每个版本下的辩题
├── references/
│   ├── formats/
│   │   ├── ustc-freshman-cup.md     # 中科大新生辩论赛赛制（默认）
│   │   ├── ustc-school-cup-2025.md  # 2025 中科大校赛赛制（二辩质询、四辩对辩、小结 120 秒、含奇袭、论据只许已核实）
│   │   ├── recruit-3v3.md / recruit-2v2.md / recruit-1v1.md  # 招新赛制：申论与对辩代替驳论、小结、自由辩；结辩 90 秒
│   │   └── _template.md             # 新增赛制的模板（换算表按固定格式写，脚本直接读）
│   ├── case-building.md             # 定义三分法、判准与论证义务、论点三件套、对抗迭代、反驳库、优劣评估、口径表
│   ├── speech-voice.md              # 讲稿语感：怎么写得像人在说话而不是念稿
│   ├── evidence.md                  # 来源等级、引用格式、核实流程（含原文引句）、校赛论据红线
│   ├── stage-playbooks.md           # 各环节打法与写法
│   ├── document-structure.md        # debate.cls 的宏清单：写文档就是往这些宏里填内容
│   └── sparring.md                  # 陪练、模辩复盘回流、压字数、打磨单篇的方法
├── assets/
│   ├── latex/debate.cls             # 文档类：prep / quick / script 三种版式，pro / con / both 三种配色，全部语义宏
│   ├── prep-doc-template.tex        # 备赛文档模板
│   ├── quickref-template.tex        # 正赛速查模板
│   ├── script-doc-template.tex      # 正赛文稿模板（新生赛、校赛）
│   ├── script-doc-template-recruit.tex  # 正赛文稿模板（招新赛）
│   └── agent-prompts.md             # 对抗迭代用的建构 / 攻击子代理提示词，两方共用只换持方
├── scripts/
│   ├── build_pdf.py                 # .tex → PDF（latexmk / xelatex；打印页数，速查正文超两页报 WARN；没有 TeX 时打印安装说明）
│   ├── check_speeches.py            # 口播字数是否落在赛制区间（区间从赛制文件读，套件算最短与最长组装）；问题链每问 ≤25 字、封闭式、链数
│   ├── check_voice.py               # 检出念稿腔：破折号、金句、等长句、书面连接词、黏合剂种类与重复、未口语化的数字；套件逐个组装查
│   ├── check_consistency.py         # 速查与文稿中的数字（阿拉伯与口语形式）是否都在口径表内
│   ├── check_recordcard.py          # 速查末页的场上记录卡与文稿套件的条件逐字一致
│   ├── check_evidence.py            # 出处清单：已核实必须有日期、出处、引句；【待核实】不得进稿件；--strict 为校赛红线
│   ├── _numerals.py                 # 中文数字解析（一致性与论据检查共用）
│   ├── _tex.py                      # LaTeX 读取：按 debate.cls 的宏切分节、抽稿件正文、套件组装、问题链、出处行
│   └── _version.py                  # 读版本号；从 prep/v<N>/<赛制>/ 路径认出辩题的版本与赛制；按版本启用检查规则
└── evals/
    └── evals.json                   # 测试用例（全套、部分请求、未抽签、校赛、陪练、压字数）
```

## 使用方法

**在 Claude Code 中**：克隆本仓库后在仓库目录内启动 Claude Code，技能会自动加载。直接说：

> 辩题：XXX / YYY，我方反方，中科大新生赛，帮我备赛。

也可以把 `.claude/skills/debate-prep` 复制到 `~/.claude/skills/` 供所有项目使用。生成的文档默认放在 `prep/v<主版本>/<赛制>/<辩题简称>/`，文件名带辩题不带编号：

```
prep/v3/新生赛/宠物之爱/
├── 备赛文档-宠物之爱.tex / .pdf      # 双方共用
├── 速查-正方-宠物之爱.tex / .pdf     # 每方一份，正文两页 + 场上记录卡
├── 速查-反方-宠物之爱.tex / .pdf
├── 文稿-正方-宠物之爱.tex / .pdf     # 每方按赛制的全部环节
├── 文稿-反方-宠物之爱.tex / .pdf
├── 摘要-宠物之爱.md                  # 对话摘要，直接转发队友
└── .work/                           # 迭代中间产物，不进仓库
```

### 定稿与套件

文稿写在赛前，对方说什么要到台上才知道。所以只有正方一辩立论写成定稿；其余成段讲稿都写成套件：

- **固定段**：不管对方说了什么都成立的话，赛前写好、磨好。结辩的价值升华和结尾就在这里
- **选择组**：几个条件模块加一个兜底。模块标题写使用条件（“对方把 X 定义成 Y”），正文只说条件保证为真的事；兜底不依赖对方说了什么
- **临场位**：留出字数，场上现写一两句

封路也按这个办法写：按“对方全场主打哪条路”分条件，预先驳这条路，不写“他们待会儿会说什么”。速查最后一页是场上记录卡，选手边听边勾，勾到哪条念哪个模块。`check_speeches.py` 同时算最短和最长的组装，两头都要落在字数区间内；`check_voice.py` 把每一种组装都查一遍。

交付前七条检查都要跑：`check_speeches.py`（字数、问题链、标题照赛制表）、`check_recordcard.py`（场上记录卡与文稿套件逐字对应）、`check_voice.py`（语感；`--desk` 查备赛文档和速查里会被念出来的句子）、`check_consistency.py`（数字口径）、`check_evidence.py`（论据状态；校赛加 `--strict`）、`build_pdf.py`（PDF 与页数）。

**在 Claude.ai 中**：把 `.claude/skills/debate-prep` 目录打包为 `.skill` 文件上传。Claude.ai 环境没有文件工具时会在对话中分段输出。

## PDF 生成与 TeX 环境

文档源文件是 LaTeX，`scripts/build_pdf.py` 用 latexmk（没有就直接跑两遍 xelatex）编译，打印页数，速查超过两页报 WARN。需要 XeLaTeX + ctex + tcolorbox + 一款简体中文字体（Noto / 思源 / 苹方 / 微软雅黑 / 文泉驿，`debate.cls` 按这个顺序找）。

- **Claude Code on the web**：仓库自带 `.claude/settings.json` 的 SessionStart 钩子 `.claude/hooks/ensure-tex.sh`，会话启动时检测到没有 XeLaTeX 就用 apt 装 `texlive-xetex texlive-lang-chinese texlive-latex-extra texlive-plain-generic texlive-fonts-recommended fonts-noto-cjk latexmk`，约两三分钟。不想自动装就在环境变量里设 `DEBATE_PREP_NO_INSTALL=1`
- **自己的机器**：macOS 装 MacTeX（`brew install --cask mactex-no-gui`），Windows 装 TeX Live 或 MiKTeX，Ubuntu 用上面那串 apt 包。脚本找不到 TeX 时会打印这段说明，`.tex` 已经写好不会丢

手动用法：

```
python3 .claude/skills/debate-prep/scripts/build_pdf.py --check          # 只看环境
python3 .claude/skills/debate-prep/scripts/build_pdf.py prep/v3/新生赛/<辩题简称>/
```

版式由 `\documentclass[prep|quick|script, pro|con|both]{debate}` 决定：备赛文档用阅读版式，速查用紧凑两页版式，文稿用 12pt 朗读版式，把"如果……就……"预案收进虚线框，套件的选择组、兜底和临场位各有自己的框；正方红、反方蓝，是华语辩论的惯例色。宏的清单见 `references/document-structure.md`。

## 需要提供的信息

| 信息 | 必要性 |
|---|---|
| 辩题（含正反表述） | 必需 |
| 题解 | 可选，视为硬约束 |
| 赛制 | 可选，默认中科大新生辩论赛 |
| 比赛日期、队员分工、对手信息 | 可选 |

## 版本

技能有版本号（`VERSION`），改动记在 `CHANGELOG.md`。辩题按「版本 / 赛制」分目录，在哪个版本下建成就一直留在那里：

```
prep/
├── v2/新生赛/…            # LaTeX，成段讲稿都是定稿（七道题）
└── v3/招新3v3/…           # 当前版本：回应型发言是套件（三道题）；新题按赛制放 v3/新生赛、v3/校赛2025、v3/招新2v2 …
```

新辩题直接用当前版本；旧辩题不用跟着升级。检查脚本从路径认出版本，某个版本新加的规则只管这个版本以后的辩题；`debate.cls` 只加宏不删宏，旧辩题照样能编译。想让旧辩题用上新写法，就复制到新版本目录重做。每个主版本对应的 git 提交记在 `CHANGELOG.md` 里，可以取回当时的完整技能。

## 新增赛制

复制 `references/formats/_template.md`，填写新赛制的流程、计时方式、打分块、双方稿件清单与字数换算，保存为 `references/formats/<赛制简称>.md`（开头「目录名」一行是它在 `prep/v<N>/` 下的目录名），并在 `SKILL.md` 的输入表格"赛制"一行加上说明。字数换算表按模板里的固定格式写，`check_speeches.py --format <赛制简称>` 会直接从这个文件读区间，不需要改脚本；`--list-formats` 列出已有赛制。
