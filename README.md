# ustc-debate

面向中国科学技术大学新生辩论赛的华语辩论备赛 Skill（Claude Code / Claude 通用）。

给它一道辩题（可选题解、赛制、你的持方），它会**始终为正反双方对称备赛**，并交付三类文档，每类都有 Markdown 与 PDF：

| 文档 | 内容 |
|---|---|
| 备赛文档 | 关键词定义（正方有利 / 反方有利 / 中立三版及反驳）、判准与双方论证义务（三版及反驳）、双方各 2–3 个经对抗迭代的论点（学理、数据、案例，注明出处与研究方法）、覆盖对方全部可能论点的反驳库、持方优劣评估、双方口径表、论据出处清单 |
| 正赛速查（每方一份） | 一句话立论、定义与判准标准表述、论点与核心论据、对方论点的一句话反驳、必问必答、自由辩战场、临场预案 |
| 正赛文稿（每方一份） | 按赛制的全部环节：一辩立论、质询链、驳论、对辩、盘问、盘问小结、自由辩战场、结辩（含价值升华） |

## 目录结构

```
.claude/skills/debate-prep/
├── SKILL.md                         # 技能入口：原则、输入、九步流程、输出
├── references/
│   ├── formats/
│   │   ├── ustc-freshman-cup.md     # 中科大新生辩论赛赛制（默认）
│   │   └── _template.md             # 新增赛制的模板
│   ├── case-building.md             # 定义三分法、判准与论证义务、论点三件套、对抗迭代、反驳库、优劣评估、口径表
│   ├── evidence.md                  # 来源等级、引用格式、核实流程、研究/理论/案例的描述方法
│   └── stage-playbooks.md           # 各环节打法与写法
├── assets/
│   ├── prep-doc-template.md         # 备赛文档模板
│   ├── quickref-template.md         # 正赛速查模板
│   └── script-doc-template.md       # 正赛文稿模板
├── scripts/
│   ├── md2pdf.py                    # Markdown → PDF（无需额外安装包，自动寻找 Chrome/Chromium/Edge）
│   └── check_consistency.py         # 检查速查与文稿中的数字是否都在口径表内
└── evals/
    └── evals.json                   # 测试用例
```

## 使用方法

**在 Claude Code 中**：克隆本仓库后在仓库目录内启动 Claude Code，技能会自动加载。直接说：

> 辩题：XXX / YYY，我方反方，中科大新生赛，帮我备赛。

也可以把 `.claude/skills/debate-prep` 复制到 `~/.claude/skills/` 供所有项目使用。生成的文档默认放在 `prep/<辩题简称>/`。

**在 Claude.ai 中**：把 `.claude/skills/debate-prep` 目录打包为 `.skill` 文件上传。Claude.ai 环境没有文件工具时会在对话中分段输出。

## PDF 生成

`scripts/md2pdf.py` 不依赖任何 Python 包。它依次尝试本机的 Chrome / Chromium / Edge（无头打印）、weasyprint、pandoc + xelatex；都没有时保留 HTML 并提示用浏览器"打印 → 另存为 PDF"。手动用法：

```
python3 .claude/skills/debate-prep/scripts/md2pdf.py prep/<辩题简称>/
```

## 需要提供的信息

| 信息 | 必要性 |
|---|---|
| 辩题（含正反表述） | 必需 |
| 题解 | 可选，视为硬约束 |
| 赛制 | 可选，默认中科大新生辩论赛 |
| 我方持方 | 可选，只影响摘要重点与建议，双方文档都会生成 |
| 比赛日期、队员分工、对手信息 | 可选 |

## 新增赛制

复制 `references/formats/_template.md`，填写新赛制的流程、计时方式、打分块、双方稿件清单与字数换算，保存为 `references/formats/<赛制简称>.md`，并在 `SKILL.md` 的输入表格"赛制"一行加上说明。
