# 文档结构约定：宏决定排版

三类文档都是 LaTeX，写在 `assets/latex/debate.cls` 之上。这个类只提供**语义宏**：你写"这是主张""这是学理""这是一问"，版式由类决定。三份模板（`assets/*.tex`）已经把结构摆好，写作就是往宏里填内容。检查脚本也按这些宏解析文档，所以不要自造宏、不要在正文里写排版命令、不要用 `\textbf` 代替下面的语义宏。

用 `scripts/build_pdf.py prep/<题>/` 编译；它会打印页数，速查超过两页报 WARN。

## 1. 文档头

```latex
\documentclass[prep|quick|script, pro|con|both]{debate}
\motion{辩题：正方表述 / 反方表述}
\stance{反方}{更远}            % 速查与文稿；备赛文档不写
\meta{赛制}{…} \meta{生成日期}{…}
\begin{document}
\debatetitle
```

`prep` 备赛文档阅读版式；`quick` 速查紧凑版式（目标两页）；`script` 文稿 12pt 朗读版式。`pro` 红、`con` 蓝、`both` 灰，决定强调色和页眉。

## 2. 分节

| 宏 | 用途 |
|---|---|
| `\section{一、赛制要点}` | 一级节，编号写在标题里 |
| `\prosection{五、正方论点}` / `\consection{六、反方论点}` | 带持方色的一级节 |
| `\subsection{3.1 崇拜}` | 二级节 |
| `\prosubsection{论点一：门票效应}` / `\consubsection{…}` | 带持方色条的二级节 |
| `\begin{summary} … \end{summary}` | 结论速览面板，里面放 fields |
| `\begin{warnbox}{3.5 定义杀陷阱：双方都要背} … \end{warnbox}` | 警示框 |

## 3. 字段：一条字段 = 一个宏

所有"标签：内容"结构都放在 `\begin{fields} … \end{fields}` 里。内容里用 `\sub{子标签}{文字}` 折成第二层（有利之处、反方如何反驳它、合理性、核心主张、支撑、边界、出处、来源、方法、局限、代表性、状态、正方需要证明、反方需要证明、查证方向……子标签随内容写，不限于这些）。

| 宏 | 排版 | 用在 |
|---|---|---|
| `\field{标签}{内容}` | 左小标签、右内容 | 任何普通字段 |
| `\claim{一句话}`、`\claim[判准是什么]{…}`、`\claim[结论]{…}` | 引导句：放大加重 | 主张、判准是什么、结论、辩题性质 |
| `\proclaim{…}` / `\conclaim{…}` | 带持方色的引导句 | 结论速览里的持方判断 |
| `\begin{mechanism} \step … \step … \end{mechanism}` | 圆圈编号的步骤 | 机制，不超过三步 |
| `\begin{evidence}{学理}[已核实] 正文 \sub{核心主张}{…} \end{evidence}` | 证据卡：黑底类型标签 + 状态色块 + 边框卡片 | 学理、数据、案例、补充学理；状态可省 |
| `\closing{…}` | 收束句：左侧色条 | 回扣判准 |
| `\begin{clash} \pair{对方攻击}{我方回应} \end{clash}` | 左攻右回的双栏 | 对方最强攻击 → 我方回应 |
| `\begin{procard}{正方有利定义} \definition{定义一句。} 说明 \sub{…}{…} \end{procard}` | 红色条持方卡 | 正方有利定义 / 判准、正方的定义杀陷阱、劣势方打法（正方时） |
| `\begin{concard}{反方有利定义} … \end{concard}` | 蓝色条持方卡 | 反方的同类项 |
| `\begin{neutralcard}{中立定义} 定义 \sub{合理性}{…} \end{neutralcard}` | 底色面板，正文加重 | 中立定义 / 中立判准 |
| `\thesis{正方}{一句话立论}` | 红蓝底色论纲 | 结论速览 |
| `\begin{timeline} \when{第 10–8 天}{…} \end{timeline}` | 时间轴 | 备赛建议 |
| `\begin{checklist} \item … \end{checklist}` | 勾选框 | 每位队员赛前要背下来的 |

`\status{已核实 / 有把握 / 待核实}`、`\lean{偏正 / 略偏正 / 偏反 / 略偏反 / 均衡}`、`\srctag{最终 / 淘汰 / 常见}` 渲染成色块，可以放在任何文字里。

## 4. 表格

| 环境 | 行宏 | 用在 |
|---|---|---|
| `\begin{flowtable}` | `\block{A}` 分组行；`\flow{环节}{时长}{发言人}{这一块要做到}` | 赛制要点 |
| `\begin{rebuttals}` | `\rebuttal{#}{对方论点}{一句话反驳}{展开反驳}{追问 → 再回应}{最终/淘汰/常见}` | 反驳库，每条排成一张卡 |
| `\begin{assessment}` | `\assess{维度}{分析}{偏正}` | 持方优劣评估 |
| `\begin{canon}{正方}` | `\canongroup{定义}` 分组行；`\canonrow{标签}{标准表述}{允许的换说法}{禁止的说法}{出处}` | 口径表，禁止列自动加警示色 |
| `\begin{sourcelist}` | `\source{#}{论据}{出处}{原文引句}{核实日期}{状态}{用在}{查证方向}`，空的参数留 `{}` | 论据出处清单；`check_evidence.py` 只认这个宏 |
| `\begin{qa}[对方会问][我方回答]` | `\qarow{问}{答}` | 被质询防守预案 |
| `\begin{qaa}` | `\qaarow{问}{二辩答}{四辩答}` | 被盘问防守预案 |
| `\begin{tabularx}{\linewidth}{@{}L{5em}Y Y@{}}` | 普通行，表头用 `\thead{…}`，`\toprule \midrule \bottomrule` | 速查里的短表；`Y` 是自动宽度列，`L{宽}` 是定宽列 |
| `\begin{longtable}{@{}L{…}L{…}@{}}` | 同上 | 会跨页的长表（longtable 里不能用 Y） |

## 5. 文稿

| 宏 | 说明 |
|---|---|
| `\begin{speech}{1. 正一开篇立论稿}{正文 813 字 / 180 秒} … \end{speech}` | 稿件。标题与括号内容按赛制文件「各持方文稿标题」原样写，字数由 `check_speeches.py` 数出来再填。`check_speeches.py`、`check_voice.py` 只认这个环境 |
| `\begin{stage}{3. 正四质询反一问题链}{120 秒，双边计时} … \end{stage}` | 非稿件环节：预案、问题链、对辩要点、自由辩 |
| `\stress{…}` | 着重号（重音提示），每篇最多两处；不要用 `\textbf` |
| `\aside{…}` | 舞台提示，灰色小字，不计字数 |
| `\reserve{…}` | 临场位说明框，不计字数 |
| `\begin{contingency} \ifthen{条件}{动作} \end{contingency}` | 「如果……就……」预案框，放在 `\end{speech}` 之后 |
| `\begin{chain}{链一：归因链}{目标} \q{问题}{分支} \cut{打断用语} \close{收束语} \end{chain}` | 问题链；`\q` 第一个参数是问题本身（25 字内），第二个是「答是 → / 答否 →」分支。`check_speeches.py` 数 `\q` |
| `\begin{points}{进攻点（4–5 个）} \item … \end{points}` | 带标题的要点列表 |
| `\begin{battleground}{战场一：归因} \begin{fields} … \end{fields} \end{battleground}` | 自由辩战场卡 |
| `\begin{thesisbox}[全场一句话立论] … \end{thesisbox}` | 速查与文稿开头的立论框 |
| `\begin{bullets} \item … \end{bullets}` | 普通项目列表 |

## 6. 写作注意

- 中文引号用 “ ” 和 「 」，不要用直引号 `"`；书名号、破折号照常（讲稿里不许有破折号，那是语感规则）
- 需要转义的字符：`&` `%` `$` `#` `_` 写成 `\&` `\%` `\$` `\#` `\_`；网址用 `\url{…}`
- 箭头 →、≠、①②③ 直接写，类已经把这些字符交给中文字体
- 不要用四级标题分层，用字段和子标签；不要把整段分析塞进一个字段而不用 `\sub`
- 不要在 `longtable` 里用 `Y` 列；速查的短表用 `tabularx`
- 类文件在 `assets/latex/debate.cls`，`build_pdf.py` 会把它加进 `TEXINPUTS`，不需要复制到输出目录
