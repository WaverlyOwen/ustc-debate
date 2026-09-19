# ustc-debate

华语辩论备赛 Skill（Claude Code / Claude 通用），起于中国科学技术大学新生辩论赛，现在面向任何赛制：自带赛制库（新生赛、校赛、华语辩论世界杯、新国辩），新赛事口述录入。

给它一道辩题（可选题解、赛制），它会**始终为正反双方对称备赛**，并交付三类文档，源文件是 LaTeX（`.tex`，写在自带的 `debate.cls` 之上），用 XeLaTeX 编译成 PDF：

| 文档 | 内容 |
|---|---|
| 备赛文档 | 关键词定义（正方有利 / 反方有利 / 中立三版及反驳）、判准与双方论证义务（三版及反驳）、双方各 2–3 个经对抗迭代的论点（学理、数据、案例，注明出处与研究方法）、覆盖对方全部可能论点的反驳库、持方优劣评估、双方口径表、论据出处清单 |
| 正赛速查（每方一份） | 一句话立论、定义与判准标准表述、论点与核心论据、对方论点的一句话反驳、必问必答、自由辩战场、临场预案 |
| 正赛文稿（每方一份） | 按赛制的全部环节：一辩立论、质询链、驳论、对辩、盘问、盘问小结、自由辩战场、结辩（含价值升华） |

## 目录结构

```
.claude/skills/debate-prep/
├── SKILL.md                         # 技能入口：原则、输入、九步流程（第 0–8 步）、输出、后续互动
├── references/
│   ├── formats/                     # 赛制库：每个赛制一个 .yaml（流程、时长、发言人、临场位、语速、论据红线）+ 同名 .md（策略提醒）
│   │   ├── _template.yaml           # 新增赛制的模板与字段说明
│   │   ├── ustc-freshman-cup.yaml/.md     # 中科大新生辩论赛
│   │   ├── ustc-school-cup-2025.yaml/.md  # 2025 中科大校赛（二辩质询、四辩对辩、奇袭、论据判负条款）
│   │   ├── huayu-world-cup.yaml/.md       # 华语辩论世界杯
│   │   └── icdc-xinguobian.yaml/.md       # 国际华语辩论邀请赛（新国辩），17 分钟总计时自由分配制
│   ├── case-building.md             # 定义三分法、判准与论证义务、论点三件套、对抗迭代、反驳库、优劣评估、口径表、按队伍水平适配
│   ├── speech-voice.md              # 讲稿语感：怎么写得像人在说话而不是念稿
│   ├── evidence.md                  # 来源等级、引用格式、核实流程（含原文引句）、校赛论据红线
│   ├── stage-playbooks.md           # 各环节类型的打法与写法（立论、质询、驳论、对辩、盘问、小结、申论、自由辩、结辩、奇袭、观众提问）
│   ├── document-structure.md        # debate.cls 的宏清单：写文档就是往这些宏里填内容
│   └── sparring.md                  # 陪练、模辩复盘回流、压字数、打磨单篇的方法
├── assets/
│   ├── latex/debate.cls             # 文档类：prep / quick / script 三种版式，pro / con / both 三种配色，全部语义宏
│   ├── prep-doc-template.tex        # 备赛文档模板
│   ├── quickref-template.tex        # 正赛速查模板
│   ├── script-doc-template.tex      # 正赛文稿模板
│   └── agent-prompts.md             # 对抗迭代用的建构 / 攻击子代理提示词，两方共用只换持方
├── scripts/
│   ├── build_pdf.py                 # .tex → PDF（latexmk / xelatex；打印页数，速查超两页报 WARN；没有 TeX 时打印安装说明）
│   ├── md2tex.py                    # 旧版 Markdown 产出的迁移工具，正常流程不用
│   ├── format_info.py               # 读赛制 yaml，打印流程、每方稿件清单、文稿标题、字数区间
│   ├── check_format.py              # 校验新录入的赛制 yaml
│   ├── check_speeches.py            # 口播字数是否落在赛制区间（从 \meta{赛制} 认赛制，--level 换语速）；问题链每问 ≤25 字、封闭式、链数
│   ├── check_voice.py               # 检出念稿腔：破折号、金句、等长句、书面连接词、黏合剂种类与重复、未口语化的数字
│   ├── check_consistency.py         # 速查与文稿中的数字（阿拉伯与口语形式）是否都在口径表内
│   ├── check_evidence.py            # 出处清单：已核实必须有日期、出处、引句；【待核实】不得进稿件；--strict 为校赛红线
│   ├── _numerals.py                 # 中文数字解析（一致性与论据检查共用）
│   ├── _format.py                   # 赛制 yaml 加载与推导（字数区间、稿件清单、标题、别名匹配；无 PyYAML 时用内置解析）
│   └── _tex.py                      # LaTeX 读取：按 debate.cls 的宏切分节、抽稿件正文、问题链、出处行
└── evals/
    └── evals.json                   # 测试用例（全套、部分请求、未抽签、校赛、陪练、压字数）
```

## 使用方法

**在 Claude Code 中**：克隆本仓库后在仓库目录内启动 Claude Code，技能会自动加载。直接说：

> 辩题：XXX / YYY，我方反方，中科大新生赛，校队水平，帮我备赛。

赛制必须说（新生赛、校赛、世界杯、新国辩，或库里的任何别名）；没说会先问。队伍水平（新生 / 校队 / 高水平）可选，决定语速与写法。

也可以把 `.claude/skills/debate-prep` 复制到 `~/.claude/skills/` 供所有项目使用。生成的文档默认放在 `prep/<辩题简称>/`，文件名带辩题不带编号：

```
prep/宠物之爱/
├── 备赛文档-宠物之爱.tex / .pdf      # 双方共用
├── 速查-正方-宠物之爱.tex / .pdf     # 每方一份，两页以内
├── 速查-反方-宠物之爱.tex / .pdf
├── 文稿-正方-宠物之爱.tex / .pdf     # 每方按赛制的全部环节
├── 文稿-反方-宠物之爱.tex / .pdf
├── 摘要-宠物之爱.md                  # 对话摘要，直接转发队友
└── .work/                           # 迭代中间产物，不进仓库
```

交付前五个脚本都要跑：`check_speeches.py`（字数、问题链）、`check_voice.py`（语感）、`check_consistency.py`（数字口径）、`check_evidence.py`（论据状态；校赛加 `--strict`）、`build_pdf.py`（PDF 与页数）。

**在 Claude.ai 中**：把 `.claude/skills/debate-prep` 目录打包为 `.skill` 文件上传。Claude.ai 环境没有文件工具时会在对话中分段输出。

## PDF 生成与 TeX 环境

文档源文件是 LaTeX，`scripts/build_pdf.py` 用 latexmk（没有就直接跑两遍 xelatex）编译，打印页数，速查超过两页报 WARN。需要 XeLaTeX + ctex + tcolorbox + 一款简体中文字体（Noto / 思源 / 苹方 / 微软雅黑 / 文泉驿，`debate.cls` 按这个顺序找）。

- **Claude Code on the web**：仓库自带 `.claude/settings.json` 的 SessionStart 钩子 `.claude/hooks/ensure-tex.sh`，会话启动时检测到没有 XeLaTeX 就用 apt 装 `texlive-xetex texlive-lang-chinese texlive-latex-extra texlive-plain-generic texlive-fonts-recommended fonts-noto-cjk latexmk`，约两三分钟。不想自动装就在环境变量里设 `DEBATE_PREP_NO_INSTALL=1`
- **自己的机器**：macOS 装 MacTeX（`brew install --cask mactex-no-gui`），Windows 装 TeX Live 或 MiKTeX，Ubuntu 用上面那串 apt 包。脚本找不到 TeX 时会打印这段说明，`.tex` 已经写好不会丢

手动用法：

```
python3 .claude/skills/debate-prep/scripts/build_pdf.py --check          # 只看环境
python3 .claude/skills/debate-prep/scripts/build_pdf.py prep/<辩题简称>/
```

版式由 `\documentclass[prep|quick|script, pro|con|both]{debate}` 决定：备赛文档用阅读版式，速查用紧凑两页版式，文稿用 12pt 朗读版式并把"如果……就……"预案收进虚线框；正方红、反方蓝，是华语辩论的惯例色。宏的清单见 `references/document-structure.md`。

## 需要提供的信息

| 信息 | 必要性 |
|---|---|
| 辩题（含正反表述） | 必需 |
| 题解 | 可选，视为硬约束 |
| 赛制 | 必需；库里没有的赛事口述录入 |
| 队伍水平 | 可选：新生 / 校队 / 高水平，默认取赛制的设定 |
| 比赛日期、队员分工、对手信息 | 可选 |

## 新增赛制

直接对 Claude 说"我们的比赛是……"并贴流程或章程，它会按 `references/formats/_template.yaml` 问清缺的字段，写出 `references/formats/<id>.yaml`（流程、时长、发言人、临场位、语速、评审、论据红线、待确认事项）和同名 `.md`（策略提醒），跑 `check_format.py` 校验后入库。稿件清单、文稿标题、字数区间都由 `format_info.py` 从 yaml 推出，不需要改任何脚本。手动查看：

```
python3 .claude/skills/debate-prep/scripts/format_info.py --list
python3 .claude/skills/debate-prep/scripts/format_info.py 世界杯 --level 高水平
```
