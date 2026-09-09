# ustc-debate

面向中国科学技术大学新生辩论赛的华语辩论备赛 Skill（Claude Code / Claude 通用）。

给它一道辩题（含正反持方）、可选的题解和赛制，它会产出一份完整备赛手册：拆题分析、立论框架、对方预判、攻防口径表、按赛制逐环节的稿件（立论、质询、驳论、对辩、盘问、小结、自由辩战场、结辩）以及论据核实清单。

## 目录结构

```
.claude/skills/debate-prep/
├── SKILL.md                         # 技能入口：工作流程与写作原则
├── references/
│   ├── formats/
│   │   ├── ustc-freshman-cup.md     # 中科大新生辩论赛赛制（默认）
│   │   └── _template.md             # 新增赛制的模板
│   ├── case-building.md             # 拆题与立论方法
│   └── stage-playbooks.md           # 各环节打法与写法
├── assets/
│   └── handbook-template.md         # 备赛手册输出模板
└── evals/
    └── evals.json                   # 测试用例
```

## 使用方法

**在 Claude Code 中**：克隆本仓库后在仓库目录内启动 Claude Code，技能会自动加载。直接说：

> 辩题：XXX / YYY，我方反方，中科大新生赛，帮我备赛。

也可以把 `.claude/skills/debate-prep` 复制到 `~/.claude/skills/` 供所有项目使用。

**在 Claude.ai 中**：把 `.claude/skills/debate-prep` 目录打包为 `.skill` 文件上传，或直接把 `SKILL.md` 与 references 文件作为项目知识添加。

## 需要提供的信息

| 信息 | 必要性 |
|---|---|
| 辩题（含正反持方） | 必需 |
| 我方持方 | 必需（未抽签可说明，会给双方各出一版） |
| 题解 | 可选，视为硬约束 |
| 赛制 | 可选，默认中科大新生辩论赛 |
| 队员分工、对手信息、侧重环节 | 可选 |

## 新增赛制

复制 `references/formats/_template.md`，按其中结构填写新赛制的流程、计时方式、打分块、稿件清单与字数换算，保存为 `references/formats/<赛制简称>.md`，并在 `SKILL.md` 第二步附近加一行说明。
