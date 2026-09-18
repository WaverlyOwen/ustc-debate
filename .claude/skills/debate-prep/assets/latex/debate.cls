%% debate.cls — 华语辩论备赛文档类（备赛文档 / 正赛速查 / 正赛文稿）
%%
%% 用法：\documentclass[prep|quick|script, pro|con|both]{debate}
%%   prep   备赛文档（双方共用，阅读版式）
%%   quick  正赛速查（紧凑版式，目标两页）
%%   script 正赛文稿（12pt 朗读版式）
%%   pro / con / both  正方红、反方蓝、双方灰，决定强调色与页眉
%%
%% 需要 XeLaTeX。中文字体按顺序寻找 Noto / 思源 / 苹方 / 微软雅黑 / 文泉驿。
%% 所有宏都是语义宏：写内容时只说"这是主张""这是学理"，版式由本文件决定；
%% scripts/ 里的检查脚本也按这些宏名解析文档。宏的清单见 references/document-structure.md。
\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{debate}[2026/09/17 v1.0 USTC debate-prep documents]

\newif\ifdebate@quick \newif\ifdebate@script
\def\debate@kind{prep}\def\debate@kindname{备赛文档}
\def\debate@side{both}
\DeclareOption{prep}{\def\debate@kind{prep}\def\debate@kindname{备赛文档}}
\DeclareOption{quick}{\debate@quicktrue\def\debate@kind{quick}\def\debate@kindname{正赛速查}}
\DeclareOption{script}{\debate@scripttrue\def\debate@kind{script}\def\debate@kindname{正赛文稿}}
\DeclareOption{pro}{\def\debate@side{pro}}
\DeclareOption{con}{\def\debate@side{con}}
\DeclareOption{both}{\def\debate@side{both}}
\DeclareOption*{\PassOptionsToClass{\CurrentOption}{ctexart}}
\ProcessOptions\relax
\PassOptionsToPackage{table}{xcolor}
\LoadClass[11pt,a4paper,fontset=none,heading=false,punct=kaiming]{ctexart}

\RequirePackage{xcolor}
\RequirePackage{geometry}
\RequirePackage{fontspec}
\RequirePackage{xeCJKfntef}
\RequirePackage[many]{tcolorbox}
\RequirePackage{booktabs,longtable,array,tabularx}
\RequirePackage{enumitem}
\RequirePackage{fancyhdr}
\RequirePackage{titlesec}
\RequirePackage{needspace}
\RequirePackage{etoolbox}
\RequirePackage{ragged2e}
\RequirePackage{hyperref}
\hypersetup{hidelinks,unicode}

%% ---------------------------------------------------------------- colours
\definecolor{ink}{HTML}{1C1A17}
\definecolor{inkb}{HTML}{4A4740}
\definecolor{inkc}{HTML}{8A8378}
\definecolor{rule}{HTML}{D5D0C7}
\definecolor{rulesoft}{HTML}{E9E5DE}
\definecolor{panel}{HTML}{F6F4EF}
\definecolor{pro}{HTML}{B4362A}
\definecolor{protint}{HTML}{FBEFED}
\definecolor{con}{HTML}{1F4E8C}
\definecolor{contint}{HTML}{EDF2F9}
\definecolor{both}{HTML}{6B6357}
\definecolor{bothtint}{HTML}{F6F4EF}
\definecolor{okbg}{HTML}{E4EFE6}\definecolor{okfg}{HTML}{24512F}
\definecolor{midfg}{HTML}{5E5748}\definecolor{midbd}{HTML}{B9B2A5}
\definecolor{warnbg}{HTML}{FBEBD7}\definecolor{warnfg}{HTML}{8A4B0B}
\definecolor{warnframe}{HTML}{C08A3E}\definecolor{warnback}{HTML}{FDF6EA}\definecolor{warnhead}{HTML}{8A5B12}
\definecolor{forbid}{HTML}{7A2E25}
\colorlet{accent}{both}\colorlet{tint}{bothtint}
\ifdefstring{\debate@side}{pro}{\colorlet{accent}{pro}\colorlet{tint}{protint}}{}
\ifdefstring{\debate@side}{con}{\colorlet{accent}{con}\colorlet{tint}{contint}}{}
\color{ink}

%% ---------------------------------------------------------------- fonts
\newcommand\debate@pick[3]{% #1 candidate list (comma), #2 setter, #3 options
  \def\debate@found{}%
  \@for\debate@f:=#1\do{%
    \ifdefempty{\debate@found}{\IfFontExistsTF{\debate@f}{\edef\debate@found{\debate@f}}{}}{}}%
  \ifdefempty{\debate@found}{\ClassWarningNoLine{debate}{No CJK font found among #1}}{%
    \edef\debate@tmp{\noexpand#2{\debate@found}[#3]}\debate@tmp}}
\debate@pick{Noto Serif CJK SC,Source Han Serif SC,Songti SC,SimSun,Noto Sans CJK SC,PingFang SC,Microsoft YaHei,WenQuanYi Zen Hei}%
  {\setCJKmainfont}{Language=Chinese Simplified,BoldFont=*,BoldFeatures={Weight=1.5},AutoFakeBold=1.5}
\debate@pick{Noto Sans CJK SC,Source Han Sans SC,PingFang SC,Microsoft YaHei,WenQuanYi Zen Hei}%
  {\setCJKsansfont}{Language=Chinese Simplified,AutoFakeBold=1.5}
\debate@pick{Noto Sans Mono CJK SC,WenQuanYi Zen Hei Mono,Noto Sans CJK SC}{\setCJKmonofont}{Language=Chinese Simplified}
\IfFontExistsTF{TeX Gyre Pagella}{\setmainfont{TeX Gyre Pagella}}{}
\IfFontExistsTF{TeX Gyre Heros}{\setsansfont{TeX Gyre Heros}}{}
\xeCJKsetup{CJKmath=false,PunctStyle=kaiming,CheckSingle=true}
%% 箭头、数学符号、杂项符号、带圈数字交给 CJK 字体，Latin 字体里没有这些字形
\xeCJKDeclareCharClass{CJK}{"2190->"21FF,"2200->"22FF,"2460->"24FF,"25A0->"25FF,"2600->"27BF,"3000->"303F,"FF00->"FFEF}
\linespread{1.32}

%% ---------------------------------------------------------------- page
\ifdebate@quick
  \geometry{margin=12mm,top=11mm,bottom=12mm,headheight=10pt,headsep=5pt}
\else
  \geometry{left=18mm,right=18mm,top=20mm,bottom=22mm,headheight=12pt,headsep=8pt}
\fi
\setlength{\parindent}{0pt}
\setlength{\parskip}{6pt}
\raggedbottom
\pagestyle{fancy}\fancyhf{}
\renewcommand{\headrulewidth}{0.4pt}\renewcommand{\headrule}{{\color{rule}\hrule width\headwidth height\headrulewidth}}
\fancyhead[L]{\footnotesize\color{inkc}\debate@motion}
\fancyhead[R]{\footnotesize\bfseries\color{accent}\debate@kindname\ · \debate@sidename}
\fancyfoot[C]{\footnotesize\color{inkc}\thepage}

%% ---------------------------------------------------------------- meta
\def\debate@motion{}\def\debate@sidename{正反双方}\def\debate@stance{}\def\debate@metalist{}
\newcommand{\motion}[1]{\gdef\debate@motion{#1}}
\newcommand{\stance}[2]{\gdef\debate@sidename{#1}\gdef\debate@stance{#2}}
\newcommand{\meta}[2]{\g@addto@macro\debate@metalist{{\color{inkc}\scriptsize\bfseries #1}\hspace{5pt}#2\hspace{18pt}}}
\newcommand{\debatetitle}{%
  \begingroup\needspace{8\baselineskip}%
  {\scriptsize\color{inkc}\sffamily\bfseries\debate@kindname}\par\vspace{4pt}
  {\ifdebate@quick\fontsize{15}{19}\else\fontsize{21}{27}\fi\selectfont\bfseries\debate@motion\par}
  \ifdefempty{\debate@stance}{}{\vspace{6pt}{\small\bfseries\color{accent}\fboxsep=3pt\fcolorbox{accent}{white}{\debate@sidename\ · \debate@stance}}\par}
  \ifdefempty{\debate@metalist}{}{\vspace{6pt}{\small\color{inkb}\debate@metalist\par}}
  \vspace{4pt}{\color{accent}\hrule height 1.5pt}\vspace{\ifdebate@quick 6pt\else 14pt\fi}
  \endgroup}

%% ---------------------------------------------------------------- headings
\newcommand\debate@secfmt{\ifdebate@quick\fontsize{10.5}{13}\else\fontsize{14.5}{18}\fi\selectfont\bfseries\sffamily}
\titleformat{\section}{\debate@secfmt}{}{0pt}{{\color{rule}\titlerule}\vspace{\ifdebate@quick 4pt\else 8pt\fi}}
\titlespacing*{\section}{0pt}{\ifdebate@quick 9pt\else 20pt\fi}{\ifdebate@quick 3pt\else 8pt\fi}
\titleformat{\subsection}{\ifdebate@quick\fontsize{10}{12}\else\fontsize{12}{15}\fi\selectfont\bfseries\sffamily}{}{0pt}{}
\titlespacing*{\subsection}{0pt}{\ifdebate@quick 6pt\else 14pt\fi}{\ifdebate@quick 2pt\else 5pt\fi}
\titleformat{\subsubsection}{\normalsize\bfseries\sffamily}{}{0pt}{}
\titlespacing*{\subsubsection}{0pt}{10pt}{3pt}
\setcounter{secnumdepth}{0}
\newcommand{\prosection}[1]{\section{\texorpdfstring{\textcolor{pro}{#1}}{#1}}}
\newcommand{\consection}[1]{\section{\texorpdfstring{\textcolor{con}{#1}}{#1}}}
\newcommand{\prosubsection}[1]{\subsection{\texorpdfstring{{\color{pro}\vrule width 3pt\hspace{8pt}}#1}{#1}}}
\newcommand{\consubsection}[1]{\subsection{\texorpdfstring{{\color{con}\vrule width 3pt\hspace{8pt}}#1}{#1}}}

%% ---------------------------------------------------------------- chips
\newcommand{\status}[1]{\debate@statuschip{#1}}
\newcommand{\debate@statuschip}[1]{%
  \ifstrequal{#1}{已核实}{\debate@chipx{okbg}{okbg}{okfg}{已核实}}{%
  \ifstrequal{#1}{有把握}{\debate@chipx{white}{midbd}{midfg}{有把握}}{%
  \debate@chipx{warnbg}{warnbg}{warnfg}{待核实}}}}
\newcommand{\debate@chipx}[4]{{\fboxsep=2.2pt\fboxrule=0.6pt\scriptsize\sffamily\bfseries\fcolorbox{#2}{#1}{\textcolor{#3}{\strut #4}}}}
\newcommand{\lean}[1]{%
  \ifstrequal{#1}{偏正}{\debate@chipx{protint}{protint}{pro}{偏正}}{%
  \ifstrequal{#1}{略偏正}{\debate@chipx{protint}{protint}{pro}{略偏正}}{%
  \ifstrequal{#1}{偏反}{\debate@chipx{contint}{contint}{con}{偏反}}{%
  \ifstrequal{#1}{略偏反}{\debate@chipx{contint}{contint}{con}{略偏反}}{%
  \debate@chipx{panel}{panel}{inkb}{#1}}}}}}
\newcommand{\srctag}[1]{\debate@chipx{panel}{panel}{inkc}{#1}}

%% ---------------------------------------------------------------- fields
%% \begin{fields} \field{标签}{内容} … \end{fields}
%% 内容里用 \sub{子标签}{文字} 折成第二层。
\newlength{\debate@fieldw}
\newenvironment{fields}{%
  \ifdebate@quick\setlength{\debate@fieldw}{6em}\else\setlength{\debate@fieldw}{6.5em}\fi
  \begin{list}{}{\setlength{\leftmargin}{\dimexpr\debate@fieldw+10pt}\setlength{\labelwidth}{\debate@fieldw}%
    \setlength{\labelsep}{10pt}\setlength{\itemindent}{0pt}\setlength{\listparindent}{0pt}%
    \setlength{\itemsep}{\ifdebate@quick 3pt\else 6pt\fi}\setlength{\parsep}{2pt}\setlength{\topsep}{2pt}%
    \renewcommand{\makelabel}[1]{\parbox[t]{\labelwidth}{\RaggedRight\scriptsize\sffamily\bfseries\color{inkc}##1}\hfil}}%
  }{\end{list}}
\newcommand{\field}[2]{\item[{#1}]{#2}}
\newcommand{\sub}[2]{\par{\scriptsize\sffamily\bfseries\color{inkc}#1}\hspace{6pt}{\small\color{inkb}#2}}
%% 引导句：主张 / 判准是什么 / 结论
\newcommand{\claim}[2][主张]{\item[{#1}]{\ifdebate@quick\normalsize\else\fontsize{12}{16}\selectfont\fi\bfseries #2}}
\newcommand{\proclaim}[2][主张]{\item[{#1}]{\fontsize{12}{16}\selectfont\bfseries\color{pro}#2}}
\newcommand{\conclaim}[2][主张]{\item[{#1}]{\fontsize{12}{16}\selectfont\bfseries\color{con}#2}}
%% 机制步骤：\begin{mechanism} \step … \step … \end{mechanism}
\newcounter{debatestep}
\newenvironment{mechanism}[1][机制]{\item[{#1}]\setcounter{debatestep}{0}\par\vspace{-\parskip}\vspace{2pt}}{}
\newcommand{\step}{\par\stepcounter{debatestep}\hangindent=1.9em\hangafter=1%
  {\fboxsep=1.5pt\fboxrule=0.7pt\scriptsize\sffamily\bfseries\textcolor{accent}{\fcolorbox{accent}{white}{\makebox[0.9em]{\thedebatestep}}}}\hspace{6pt}}
%% 收束句：回扣判准
\newcommand{\closing}[2][回扣判准]{\item[{#1}]{\color{inkb}\leavevmode{\color{accent}\vrule width 2.5pt}\hspace{8pt}\parbox[t]{\dimexpr\linewidth-2.5pt-8pt}{#2}}}
%% 证据卡：\begin{evidence}{学理}[已核实] 正文 \sub{核心主张}{…} \end{evidence}
\NewDocumentEnvironment{evidence}{m o}{%
  \item[{\fboxsep=2.5pt\scriptsize\sffamily\bfseries\colorbox{ink}{\textcolor{white}{\strut #1}}\IfValueT{#2}{\hspace{4pt}\status{#2}}}]%
  \begin{tcolorbox}[enhanced,breakable,frame hidden,boxrule=0pt,colback=white,borderline west={2.5pt}{0pt}{accent},
    borderline={0.5pt}{0pt}{rule},left=9pt,right=8pt,top=6pt,bottom=6pt,boxsep=0pt,arc=0pt,before skip=2pt,after skip=4pt]
  \small}{\end{tcolorbox}}
%% 攻防对：\begin{clash} \pair{攻击}{回应} \end{clash}
\newenvironment{clash}[1][对方最强攻击 → 我方回应]{\item[{#1}]\par\vspace{-\parskip}\vspace{2pt}}{}
\newcommand{\pair}[2]{\par\noindent\begin{tcolorbox}[enhanced,frame hidden,boxrule=0pt,colback=white,borderline={0.5pt}{0pt}{rule},
    left=0pt,right=0pt,top=0pt,bottom=0pt,boxsep=0pt,arc=0pt,before skip=2pt,after skip=4pt]
  \begin{tabularx}{\linewidth}{@{}>{\columncolor{panel}}X|X@{}}
    {\tiny\sffamily\bfseries\color{inkc}对方攻击}\newline{\small\color{inkb}#1} &
    {\tiny\sffamily\bfseries\color{accent}我方回应}\newline{\small #2}
  \end{tabularx}\end{tcolorbox}}
%% 持方卡与中立卡：\begin{sidecard}{正方有利定义} 定义。\sub{有利之处}{…} \end{sidecard}
\newcommand{\debate@cardcolor}[1]{\ifstrequal{#1}{pro}{pro}{\ifstrequal{#1}{con}{con}{both}}}
\NewDocumentEnvironment{sidecard}{O{both} m}{%
  \item[{\normalsize\sffamily\bfseries\color{#1}#2}]%
  \begin{tcolorbox}[enhanced,breakable,frame hidden,boxrule=0pt,colback=white,borderline west={3pt}{0pt}{#1},
    left=10pt,right=4pt,top=3pt,bottom=3pt,boxsep=0pt,arc=0pt,before skip=2pt,after skip=4pt]}{\end{tcolorbox}}
\newenvironment{procard}[1]{\begin{sidecard}[pro]{#1}}{\end{sidecard}}
\newenvironment{concard}[1]{\begin{sidecard}[con]{#1}}{\end{sidecard}}
\NewDocumentEnvironment{neutralcard}{m}{%
  \item[{\normalsize\sffamily\bfseries #1}]%
  \begin{tcolorbox}[enhanced,breakable,frame hidden,boxrule=0pt,colback=panel,borderline west={3pt}{0pt}{ink},
    left=10pt,right=8pt,top=6pt,bottom=6pt,boxsep=0pt,arc=0pt,before skip=2pt,after skip=4pt]\bfseries}{\end{tcolorbox}}
\newcommand{\definition}[1]{{\bfseries #1}\par\vspace{2pt}\mdseries}
%% 论纲：\thesis{正方}{一句话立论}
\newcommand{\thesis}[2]{\ifstrequal{#1}{正方}{\debate@thesisx{pro}{#1}{#2}}{\ifstrequal{#1}{反方}{\debate@thesisx{con}{#1}{#2}}{\debate@thesisx{both}{#1}{#2}}}}
\newcommand{\debate@thesisx}[3]{\item[{\scriptsize\sffamily\bfseries\color{#1}#2一句话立论}]%
  \begin{tcolorbox}[enhanced,frame hidden,boxrule=0pt,colback=#1tint,borderline west={4pt}{0pt}{#1},
    left=10pt,right=8pt,top=6pt,bottom=6pt,boxsep=0pt,arc=0pt,before skip=2pt,after skip=4pt]#3\end{tcolorbox}}
%% 时间表与清单
\newenvironment{timeline}[1][时间表]{\item[{#1}]\par\vspace{-\parskip}\vspace{2pt}}{}
\newcommand{\when}[2]{\par\hangindent=6em\hangafter=1{\bfseries\color{accent}\makebox[5.4em][l]{#1}}#2}
\newenvironment{checklist}[1][每位队员赛前要背下来的]{\item[{#1}]\begin{itemize}[label={\raisebox{.1ex}{\fboxsep=0pt\fboxrule=0.7pt\fcolorbox{inkb}{white}{\rule{0pt}{.75em}\hspace{.75em}}}},leftmargin=1.6em,itemsep=2pt,topsep=2pt]}{\end{itemize}}

%% ---------------------------------------------------------------- boxes
\newtcolorbox{summary}{enhanced,breakable,frame hidden,boxrule=0pt,colback=panel,borderline west={4pt}{0pt}{both},
  left=12pt,right=12pt,top=8pt,bottom=4pt,arc=0pt,before skip=4pt,after skip=16pt,
  title={\scriptsize\sffamily\bfseries\color{inkc}结论速览},coltitle=inkc,colbacktitle=panel,toptitle=6pt,bottomtitle=0pt}
\newtcolorbox{warnbox}[1]{enhanced,breakable,colframe=warnframe,colback=warnback,boxrule=1.2pt,arc=1pt,
  left=10pt,right=10pt,top=6pt,bottom=4pt,before skip=8pt,after skip=12pt,
  title={\small\sffamily\bfseries ⚠ #1},coltitle=warnhead,colbacktitle=warnback,toptitle=4pt,bottomtitle=0pt,attach title to upper=\par}
\newtcolorbox{thesisbox}[1][一句话立论]{enhanced,frame hidden,boxrule=0pt,colback=tint,borderline west={4pt}{0pt}{accent},
  left=12pt,right=10pt,top=7pt,bottom=7pt,arc=0pt,before skip=6pt,after skip=10pt,fontupper=\ifdebate@quick\small\else\normalsize\fi,
  title={\scriptsize\sffamily\bfseries #1},coltitle=accent,colbacktitle=tint,toptitle=5pt,bottomtitle=0pt,attach title to upper=\par}
\newtcolorbox{card}[1]{enhanced,breakable,frame hidden,boxrule=0pt,colback=white,borderline={0.5pt}{0pt}{rule},borderline west={3pt}{0pt}{accent},
  left=10pt,right=8pt,top=6pt,bottom=4pt,arc=0pt,before skip=6pt,after skip=8pt,
  title={\small\sffamily\bfseries #1},coltitle=accent,colbacktitle=white,toptitle=6pt,bottomtitle=0pt,attach title to upper=\par}
\newenvironment{battleground}[1]{\begin{card}{#1}}{\end{card}}

%% ---------------------------------------------------------------- tables
\newcolumntype{Y}{>{\RaggedRight\arraybackslash}X}
\newcolumntype{L}[1]{>{\RaggedRight\arraybackslash}p{#1}}
\AtBeginEnvironment{longtable}{\small\ifdebate@quick\renewcommand{\arraystretch}{1.12}\else\renewcommand{\arraystretch}{1.25}\fi}
\AtBeginEnvironment{tabularx}{\small\ifdebate@quick\renewcommand{\arraystretch}{1.12}\else\renewcommand{\arraystretch}{1.25}\fi}
\AtBeginEnvironment{tabular}{\small\renewcommand{\arraystretch}{1.25}}
\newcommand{\thead}[1]{{\scriptsize\sffamily\bfseries\color{inkb}#1}}
%% 反驳库：\begin{rebuttals} \rebuttal{#}{对方论点}{一句话反驳}{展开反驳}{追问 → 再回应}{来源} \end{rebuttals}
\newenvironment{rebuttals}{}{}
\newcommand{\rebuttal}[6]{\begin{card}{#1 · #2\hspace{6pt}\srctag{#6}}\begin{fields}
  \field{一句话反驳}{\bfseries #3}\field{展开反驳}{#4}\field{追问 → 再回应}{#5}\end{fields}\end{card}}
%% 口径表：\begin{canon}{正方} \canongroup{定义} \canonrow{标签}{标准表述}{允许的换说法}{禁止的说法}{出处} \end{canon}
\newenvironment{canon}[1]{\begin{longtable}{@{}L{5em}L{\dimexpr0.52\linewidth-5em-8\tabcolsep}L{0.18\linewidth}L{0.16\linewidth}L{0.14\linewidth}@{}}
  \toprule\thead{标签}&\thead{标准表述}&\thead{允许的换说法}&\thead{禁止的说法}&\thead{出处}\\\midrule\endhead}{\bottomrule\end{longtable}}
\newcommand{\canongroup}[1]{\rowcolor{panel}\multicolumn{5}{@{}l@{}}{\scriptsize\sffamily\bfseries\color{inkb}#1}\\}
\newcommand{\canonrow}[5]{{\bfseries #1}&#2&#3&{\color{forbid}\ifblank{#4}{—}{{\sffamily\bfseries ×}\,#4}}&{\scriptsize #5}\\}
%% 出处清单：\begin{sourcelist} \source{#}{论据}{出处}{原文引句}{核实日期}{状态}{用在}{查证方向} \end{sourcelist}
\newenvironment{sourcelist}{\par{\color{ink}\hrule height 1.2pt}\vspace{2pt}}{}
\newcommand{\source}[8]{\par\needspace{4\baselineskip}\noindent\begin{minipage}{\linewidth}\small
  \makebox[1.8em][l]{\color{inkc}\scriptsize #1}\parbox[t]{\dimexpr\linewidth-1.8em-5em}{#2}\hfill\parbox[t]{4.6em}{\raggedleft\status{#6}}\par
  \vspace{2pt}\hspace{1.8em}\parbox{\dimexpr\linewidth-1.8em}{\scriptsize\color{inkb}\debate@srcbit{出处}{#3}\debate@srcbit{原文引句}{#4}\debate@srcbit{核实日期}{#5}\debate@srcbit{用在}{#7}\debate@srcbit{查证方向}{#8}}
  \end{minipage}\par\vspace{2pt}{\color{rulesoft}\hrule}\vspace{2pt}}
\newcommand{\debate@srcbit}[2]{\ifblank{#2}{}{{\color{inkc}\sffamily #1}\hspace{3pt}#2\hspace{7pt}}}
%% 流程表：\begin{flowtable} \block{A} \flow{环节}{时长}{发言人}{这一块要做到} \end{flowtable}
\newenvironment{flowtable}{\begin{longtable}{@{}L{0.30\linewidth}L{5em}L{5.5em}L{\dimexpr0.70\linewidth-10.5em-6\tabcolsep}@{}}\toprule
  \thead{环节}&\thead{时长}&\thead{发言人}&\thead{这一块要做到}\\\midrule\endhead}{\bottomrule\end{longtable}}
\newcommand{\block}[1]{\rowcolor{panel}\multicolumn{4}{@{}l@{}}{\scriptsize\sffamily\bfseries\color{inkb}#1 块}\\}
\newcommand{\flow}[4]{#1&#2&#3&#4\\}
%% 评估表：\begin{assessment} \assess{定义空间}{分析}{偏正} \end{assessment}
\newenvironment{assessment}{\begin{longtable}{@{}L{5.5em}L{\dimexpr\linewidth-10em-4\tabcolsep}L{4.5em}@{}}\toprule\thead{维度}&\thead{分析}&\thead{倾向}\\\midrule\endhead}{\bottomrule\end{longtable}}
\newcommand{\assess}[3]{{\bfseries #1}&#2&\lean{#3}\\}

%% ---------------------------------------------------------------- scripts
%% \begin{speech}{1. 正一开篇立论稿}{正文 813 字 / 180 秒} … \end{speech}
%% \begin{stage}{2. 正一被质询防守预案}{反四质询，120 秒双边计时} … \end{stage}
\newcommand{\stagehead}[2]{\par\needspace{6\baselineskip}\vspace{18pt}{\color{rule}\hrule}\vspace{8pt}
  {\fontsize{14.5}{18}\selectfont\sffamily\bfseries\debate@stagenum{#1}\hfill\ifblank{#2}{}{\fboxsep=3pt\fboxrule=0.5pt\fcolorbox{rule}{white}{\scriptsize\sffamily\mdseries\color{inkc}#2}}}\par\vspace{8pt}}
\newcommand{\debate@stagenum}[1]{\debate@splitnum#1\@nil}
\def\debate@splitnum#1.#2\@nil{\textcolor{accent}{#1.}\hspace{8pt}#2}
\newenvironment{speech}[2]{\stagehead{#1}{#2}\begingroup\fontsize{12}{22}\selectfont\setlength{\parskip}{10pt}}{\endgroup\par}
\newenvironment{stage}[2]{\stagehead{#1}{#2}}{\par}
\newcommand{\stress}[1]{\CJKunderdot{#1}}
\newcommand{\aside}[1]{{\small\color{inkc}〔#1〕}}
\newcommand{\reserve}[1]{\par{\fboxsep=5pt\fboxrule=0.5pt\fcolorbox{rule}{panel}{\parbox{\dimexpr\linewidth-12pt}{\small\color{inkb}{\scriptsize\sffamily\bfseries\color{inkc}临场位}\hspace{6pt}#1}}}\par}
\newtcolorbox{contingency}{enhanced,breakable,frame hidden,boxrule=0pt,colback=white,borderline={0.6pt}{0pt}{rule,dashed},
  left=10pt,right=8pt,top=4pt,bottom=4pt,arc=0pt,before skip=10pt,after skip=6pt,fontupper=\small\color{inkb},
  title={\scriptsize\sffamily\bfseries\color{inkc}临场预案 · 如果……就……},colbacktitle=white,toptitle=6pt,bottomtitle=0pt,attach title to upper=\par}
\newcommand{\ifthen}[2]{\par\hangindent=1.2em\hangafter=1{\bfseries 如果}#1\,→\,#2}
%% 问题链：\begin{chain}{链一：归因链}{目标：…} \q{问题}{答"是"→…；答"否"→…} \cut{打断用语} \close{收束语} \end{chain}
\newcounter{debateq}
\newenvironment{chain}[2]{\par\needspace{4\baselineskip}\vspace{6pt}{\bfseries\color{accent}#1}\ifblank{#2}{}{\hspace{8pt}{\small\color{inkb}（#2）}}\par\setcounter{debateq}{0}}{\par\vspace{4pt}}
\newcommand{\q}[2]{\par\stepcounter{debateq}\hangindent=1.8em\hangafter=1\makebox[1.8em][l]{\bfseries\thedebateq.}{\bfseries「#1」}\ifblank{#2}{}{\par\hspace{1.8em}{\small\color{inkb}→ #2}}}
\newcommand{\cut}[1]{\par{\small{\sffamily\bfseries\color{inkc}打断用语}\hspace{6pt}#1}}
\newcommand{\close}[1]{\par{\small{\sffamily\bfseries\color{inkc}收束语}\hspace{6pt}#1}}
%% 问答表：\begin{qa}[对方会问][我方回答] \qarow{问}{答} \end{qa}；三栏：\begin{qaa} \qaarow{问}{二辩答}{四辩答} \end{qaa}
\NewDocumentEnvironment{qa}{O{对方会问} O{我方回答（简短，守住前提）}}{\begin{longtable}{@{}L{0.40\linewidth}L{\dimexpr0.60\linewidth-2\tabcolsep}@{}}\toprule\thead{#1}&\thead{#2}\\\midrule\endhead}{\bottomrule\end{longtable}}
\newcommand{\qarow}[2]{#1&#2\\}
\NewDocumentEnvironment{qaa}{O{对方会问} O{二辩答} O{四辩答（必须一致）}}{\begin{longtable}{@{}L{0.30\linewidth}L{\dimexpr0.35\linewidth-2\tabcolsep}L{\dimexpr0.35\linewidth-2\tabcolsep}@{}}\toprule\thead{#1}&\thead{#2}&\thead{#3}\\\midrule\endhead}{\bottomrule\end{longtable}}
\newcommand{\qaarow}[3]{#1&#2&#3\\}
%% 要点表：\begin{points}{进攻点（4–5 个）} \item … \end{points}
\newenvironment{points}[1]{\par\vspace{4pt}{\sffamily\bfseries\small #1}\begin{enumerate}[leftmargin=1.8em,itemsep=2pt,topsep=2pt]}{\end{enumerate}}
\newenvironment{bullets}{\begin{itemize}[leftmargin=1.2em,itemsep=2pt,topsep=2pt]}{\end{itemize}}

\AtBeginDocument{\ifdebate@quick\fontsize{9}{12.5}\selectfont\setlength{\parskip}{2pt}\renewcommand{\arraystretch}{1.12}\fi}
\endinput
