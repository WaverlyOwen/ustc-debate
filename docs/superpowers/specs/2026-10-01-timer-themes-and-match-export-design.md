# 计时器：五个新主题与「导出这一场」设计文档

日期：2026-10-01　分支：`feature/debate-timer`　基于：`docs/superpowers/specs/2026-09-30-debate-timer-design.md`（下文称「主规格」）

## 0. 要做什么

用户的两条新要求：

1. **导出这一场**：为某一场比赛生成一个专用的单文件，双击直接进这场的开场卡，辩题、队名、席位、赛制、主题都已经写在里面，不依赖浏览器里存过什么
2. **五个新主题**，风格各不相同，**全部由代码生成**（CSS 渐变、内联 SVG、Canvas），不带任何图片文件，由设计者发挥创意

主规格的约束全部继续有效：单文件、离线、零依赖、`file://` 下只用经典脚本、键盘用 `event.code`、`prefers-reduced-motion` 下关掉装饰动画。

## 1. 主题接口的扩展

主规格 §5.6 的主题只是一个 CSS 文件。要让主题能"用代码生成背景"，接口扩展为：**CSS 文件（必需）+ 同名 JS 文件（可选）**。

### 1.1 文件

```
timer/src/themes/<id>.css   必需；第一行 /* @theme id=<id> name=<名称> desc=<一句话> tone=<dark|light> */
timer/src/themes/<id>.js    可选；注册 SVG 定义与画布画师
```

`tone` 是新增的元数据字段，开赛页的主题缩略图和编辑器用它决定文字颜色；三个旧主题补上（hall=dark，daylight=light，chroma=dark）。

### 1.2 JS 注册接口

`render.js` 提供注册表（放在 render.js 里，因为只有渲染器消费它）：

```js
DT.themes = {
  register(id, spec),   // spec: { defs?: string, painter?: PainterFactory }
  get(id) → spec | null,
  ids() → string[]
}
```

- **`defs`**：一段 SVG 标记字符串（通常是 `<svg width="0" height="0" style="position:absolute"><defs><filter id="dt-<id>-…">…</filter></defs></svg>`）。渲染器在第一次用到这个主题时把它插入 `document.body` 一次（每个 document 一次，按 id 去重）。主题 CSS 就可以写 `filter: url(#dt-ink-edge)`。filter、pattern、gradient 的 id 一律以 `dt-<主题id>-` 开头，避免主题之间冲突
- **`painter`**：一个工厂函数 `(canvas, ctx) → { frame(view, now), resize(w, h), destroy() }`。渲染器在 `.dt-stage` 里、`.dt-backdrop` 之上、`.dt-field` 之下放一个 `<canvas class="dt-canvas">`，只在当前主题有 painter 时创建
  - 帧率上限 30fps（渲染器负责节流，画师不自己开 rAF）
  - `document.hidden` 时不调用 `frame`
  - `prefers-reduced-motion: reduce`、演示态 `frozen=1`、缩略图模式下：只在挂载与视图变化时各画一帧静态画面
  - 画面必须**确定**：随机性只能来自一个以主题 id 为种子的伪随机数生成器（`DT.themes.rng(seed) → () => [0,1)`，由 render.js 提供，mulberry32），这样截图可复现、投影窗口和操作台预览画面一致
  - canvas 的像素尺寸 = 容器尺寸 × `min(devicePixelRatio, 2)`
- 切换主题时渲染器销毁旧画师、移除旧 canvas，再按新主题挂载

### 1.3 CSS 可用的钩子

除主规格 §5.6 的变量契约外，主题 CSS 可以读渲染器写在 `.dt-stage` 上的：`--used`、`--tension`、`--warn-at`（单方 / 间隔），以及 `.dt-half` 上的 `--remain`（双方）。纹理用 `background-image: url("data:image/svg+xml,…")`（内联 SVG 里的 `feTurbulence` 在 Chromium 中作为图片可以渲染）；需要作用在 DOM 元素上的 SVG 滤镜用 `defs`。

### 1.4 构建

- `build.py` 把 `themes/*.js` 按文件名排序，内联在 `render.js` 之后、`setup.js` 之前；`script_files()` 同样返回它们，测试页因此也会加载
- `themes_meta()` 多读 `tone`；缺 `tone` 或值不是 dark / light 时构建失败并用中文报出文件名
- 有 `themes/x.js` 却没有 `themes/x.css` 时构建失败
- `src/index.html` 改由 `build.py` 生成（开发外壳：按顺序引用全部 CSS 与 JS），头部注释写明是生成文件，`--check` 一并比较。这样加主题不用手改外壳
- 测试页（`run_js_tests.py`）也加载全部样式（`<link>`），主题测试才能读计算样式

### 1.5 可读性硬约束（每个主题都要满足）

投影在讲堂里，最后一排也要看清。无论背景多花：

- 数字与它可能落在的每一种背景之间的对比度 ≥ 3:1（大字标准），标题与发言人 ≥ 4.5:1。纹理的不透明度要低到不破坏这一点
- 为了能自动检查，变量契约新增两个变量（`base.css` 默认都等于 `--ink`）：`--digits-on-field`（数字落在本方色场上时的颜色）与 `--digits-off-field`（落在色场收回后露出的底上时的颜色）。主题必须如实设置，`stage.css` 与主题的数字规则也必须用它们。`tests/themes.test.js` 对每个主题、正反两方、两种席位检查：`--digits-on-field` 对 `--side-color` ≥ 3:1，`--digits-off-field` 对 `--side-deep` ≥ 3:1，标题、发言人与顶栏的文字色对 `--text-field` 与 `--text-deep` **两者**都 ≥ 4.5:1（文字自带不透明底板时改对底板检查；半透明的文字色先叠到背景上再算；纹理的影响由截图评审把关）
- 文字所在的两种底：`--text-field`、`--text-deep`（`base.css` 默认分别等于 `--side-color`、`--side-deep`）。色场到不了顶栏和标题的主题（如「昼」的横带）把它们指向真正的底色；测试会核对这一点：`--text-field` 不等于 `--side-color` 时色场的范围不得碰到标题区与顶栏，`--text-deep` 不等于 `--side-deep` 时它必须等于舞台的背景色
- 发言人一行用自己的变量 `--speaker-ink`（默认 `--ink`），和标题的层次靠字号与字距拉开，不靠透明度
- 数字、标题、底栏文字永远在装饰层之上。z 轴顺序：backdrop → canvas → `.dt-deco`（色场之下的装饰，如「昼」的横带轨道）→ field / 双方的两半 → `.dt-deco-over`（色场之上的装饰：印章、记号、颗粒）→ 提示铃线 → 文字。双方环节每一半的底色取 `--half-ground`（默认 `--side-deep`），有画师的主题可以设为 `transparent`，让 canvas 在双方环节里也看得见
- 正方与反方一眼可分（不能只靠细微的色相差）
- 当前发言方、剩余时间、提示铃点、超时这四种信息在每个主题里都必须看得出来
- 1366×768 与 1920×1080 下都不溢出、不重叠

## 2. 五个新主题

每个主题有一个**立意**，由它推出色彩、纹理、字体和动效。下面是必须实现的立意与关键做法；具体数值由实现者在截图里调到好看为止。任何一个都不许退化成"换个配色的堂"。

### 2.1 墨 `ink`（tone=light）：宣纸上的朱砂与花青

- **立意**：辩论是中文的言语艺术。发言权像一笔水墨，从这一方的席位一侧落笔，时间用掉了，墨迹就往回收
- 底：宣纸，冷一些的纸色（不要用 #F4F1EA 一类暖奶油色），用 `feTurbulence` 生成纸纤维与细微的墨点纹理
- 色场：不是整块的平涂，而是一道**横贯屏幕的宽笔触**（约 44vh 高），边缘用 `feTurbulence + feDisplacementMap` 做出晕染与飞白；正方朱砂、反方花青，都是墨色的而不是荧光的
- 数字：浓墨色，落在笔触上的部分改为纸色（用两层数字：底层墨色，上层纸色并用和色场相同的 clip-path 裁切，这样数字在笔触内外都清楚）
- 标题：宋体，墨色；环节类型用一方小小的**朱文印章**标记（CSS 画的方框加文字）
- 提示铃点：一滴墨点，不是线
- 自由辩：两道笔触上下相对，发言方的那道更浓；换人时笔触"提笔再落笔"

### 2.2 星轨 `startrail`（tone=dark）：长曝光的夜空

- **立意**：长曝光照片里，星星绕着天极画出同心的弧。一段发言就是一次曝光：时间越长，星轨越长。也向科大的天文与物理致意
- 底：深夜天空的深靛色（不是近黑的中性色），接近地平线处带一点光污染的暖色
- **Canvas 画师**：以屏幕外某一角为天极，画数百颗星的同心圆弧星轨（种子随机数决定星的半径、亮度、色温）。**已用时间 = 弧长**：随着 `--used` 增长，星轨从点变成弧。发言方一侧的星轨偏该方的色温（正方偏暖、反方偏冷）
- 色场：不画平涂色块，改为发言方一侧的一片**半透明星云光晕**，随剩余时间变淡
- 数字：星光白，带非常轻的辉光；进入最后 30 秒时，一颗流星从数字上方划过一次（只在越过提示铃点时，reduced-motion 下不画）
- 自由辩：两个天极，各在一方的外侧角落，发言方的星轨在转，另一方静止
- 性能：星数不超过 600，每帧只重画变化，30fps

### 2.3 黑板 `chalk`（tone=dark）：教室里的粉笔字

- **立意**：大学辩论赛常在教室里打。黑板、粉笔、擦过的痕迹
- 底：墨绿黑板色，用径向渐变和 `feTurbulence` 生成擦拭过的粉笔灰
- 色场：**斜向粉笔排线**（`repeating-linear-gradient`，加位移滤镜让线条抖动、有断续），正方粉笔红、反方粉笔蓝，收回时像被板擦擦掉
- 数字：粉笔白，用滤镜做出粉笔的颗粒边缘，但数字主体必须实心清楚
- 标题：**楷体**（`KaiTi`，Windows 自带），像老师板书；发言人一行像粉笔写的小字
- 提示铃点：画在色场上的一个粉笔勾号 ✓ 的位置标记
- 自由辩：中间一条粉笔竖线把黑板一分为二，发言方的排线更密

### 2.4 孔版 `riso`（tone=light）：两色孔版印刷海报

- **立意**：社团招新海报常用孔版印刷。正方红、反方蓝，恰好是孔版最经典的两种油墨
- 底：印刷用纸的冷白（带一点纸张颗粒）
- 油墨：Riso Bright Red `#F15060`、Riso Blue `#0078BF`，叠印处用 `mix-blend-mode: multiply` 出现第三种颜色
- 色场：**半色调网点**（`radial-gradient` 平铺），网点随剩余时间由密到疏：剩余越少，网点越小越稀
- 数字：用本方油墨印，另一种油墨偏移 3–5px 形成**套印不准**的错位（`text-shadow` 或第二层文字 + multiply）；整体加细颗粒
- 标题与顶栏：像海报排版，粗、紧，允许大胆的字距
- 自由辩：两张海报并排，发言方那张"刚印好"，另一张褪色

### 2.5 构成 `construct`（tone=dark 或 light，由实现者定）：构成主义几何海报

- **立意**：包豪斯与构成主义海报：几何、比例、网格、强烈的对角线
- 剩余时间用一个**大扇形**表示（`conic-gradient`，角度 = 剩余比例 × 180°：圆心在屏幕边缘外，露出来的只有朝里的半个圆盘，所以整段时间是这半圆，扇形以时钟所在的水平轴为中线向轴收拢），扇形圆心放在该方席位一侧的屏幕边缘外，只露出一部分，像一枚巨大的几何表盘
- 网格：细网格线与大号的环节序号作为构图元素（这里的序号是真实的顺序，合理）
- 标签：顶栏与发言人可以旋转 90° 贴边排；一条粗的对角色带
- 色彩：正方红、反方蓝、一种黄作为提示与超时的强调色，和一种深底或浅底，不能用近黑 #111 一类
- 自由辩：两个扇形从左右两侧相对，发言方的在转动收缩

### 2.6 共同要求

- 每个主题都要覆盖全部画面：开场卡、单方、质询（warn 态）、超时、自由辩（进行 / 未开始 / 一方用完）、间隔、结束卡；席位对调时方向正确
- 缩略图（§3.3）里也要好看
- 每个主题只在它自己的文件里写规则（全部挂在 `[data-theme="<id>"]` 下），不改 `stage.css` 的公共规则；公共规则需要新钩子时，在主题基础设施任务里加

## 3. 开赛页的主题选择

8 个主题放不进现在的一排按钮。改为：

### 3.1 缩略图网格

开赛页右栏的「主题」一格改成网格，每格是这个主题的**真实缩略图**：用 `DT.render.mount` 在一个 16:9 的小 `.dt-stage-host` 里渲染一个固定的视图（正方一辩开篇立论，用掉 40%，在走），下面一行是主题名，悬停或聚焦时显示 `desc`。选中的格子有金色描边。键盘可用方向键在格子间移动、空格或回车选中。

### 3.2 缩略图模式

`DT.render.mount(root, { thumbnail: true })`：不播放入场动画、不插波纹、不显示提示条，画师只画一帧；`update` 之后不再需要每帧调用。

### 3.3 编辑器

编辑器里的主题保持下拉框加下方说明文字（现有做法），选项自动包含新主题，不用改。

## 4. 导出这一场

### 4.1 用户看到的

- 开赛页右栏底部「开始这一场」左边加一个次要按钮「导出这一场」
- 点击后下载一个文件，文件名：场次名；没有场次名就用「正方辩题（前 16 字）」；都没有就用「赛制名」。去掉 Windows 文件名非法字符，加后缀 `.html`。例：`新生赛决赛.html`
- 下载完成后提示条显示「已导出。把这个文件拷到比赛用的电脑上，双击就能直接开始这一场」
- 双击导出的文件：直接进入这场的开场卡。顶栏右侧显示赛制名，左侧显示场次名
- 结束卡的「新的一场」在导出文件里写作「重新开始这一场」，点击后回到这一场的开场卡（全新计时）。在开场卡上按 Esc（没有覆盖层时）或 Shift+E 可以进入普通的开赛页（专用文件也能当普通计时器用）。普通计时器里 Esc 仍然只关覆盖层（主规格），Shift+E 在开场卡上同样回开赛页

### 4.2 文件内容

导出文件 = 当前页面的完整源码 + 一个预设块：

```html
<script type="application/json" id="dt-preset">{ … }</script>
```

预设放在主脚本之前。预设内容：

```json
{
  "kind": "debate-timer-match",
  "schema": 1,
  "id": "m-<随机>",
  "createdAt": 1790000000000,
  "format": { …赛制的深拷贝… },
  "match": { "title": "", "proMotion": "", "conMotion": "", "proTeam": "", "conTeam": "", "proSeat": "left" },
  "theme": "ink"
}
```

**怎么拿到"当前页面的完整源码"**：构建产物只有一个 `<style>` 和一个主 `<script>`（外加可能已有的 `#dt-preset`）。`DT.preset.sourceParts()` 在**启动时**（任何 DOM 被应用改动之前）读取：`document.querySelector('head > style').textContent`、主脚本的 `textContent`（主脚本打上 `id="dt-main"`，由 `build.py` 写入）、`<title>`、`<html lang>`。`DT.preset.buildHtml(parts, preset)` 用这些拼出一个新的完整文档：

```
<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" …><title>{场次名}：辩论计时器</title>
<style>{style}</style></head>
<body data-dt-autoboot><div id="app"></div>
<script type="application/json" id="dt-preset">{预设 JSON，其中 "</" 一律写成 "<\/"}</script>
<script id="dt-main">{main}</script></body></html>
```

从一个导出文件再导出（换一场）也可以：`sourceParts` 不包括旧的预设，新预设替换它。开发外壳（`src/index.html`，多个脚本）里 `sourceParts()` 返回 null，「导出这一场」按钮置灰并提示「在构建好的 debate-timer.html 里才能导出」。

下载用 `Blob` + `URL.createObjectURL` + 临时 `<a download>`（与编辑器导出同一个函数，提到 `DT.store.saveFile` 或一个共享的小工具里，别复制一份）。

### 4.3 启动与存储

- `DT.preset.read(document) → preset | null`：读 `#dt-preset`，校验 `kind`、`schema ≤ 1`、`format` 通过 `DT.store.validateFormat`；不合格就返回 null 并在控制台警告（页面退回普通计时器，不白屏）
- 有预设时：
  - 场次与上次填写信息的存储键加命名空间：`dt.session.v1` → `dt.m.<预设id>.session.v1`（`lastMatch` 同理）。因为 Edge 里所有 `file://` 页面共用同一个 localStorage，不加命名空间的话，普通计时器里没打完的一场会出现在导出文件里
  - 赛制库与设置（音量、静音）仍然共用
  - 路由：命名空间里有没打完的场次 → 恢复它；否则 → 用预设建一场，进开场卡。没打完的场次如果已经开始过（离开过开场卡，或者有任何环节计过时），先问「继续上次 / 重新开始这一场」（默认继续，回车即可），因为导出的文件可能在赛前被试用过；选重新开始就用预设新建一场进开场卡。只打开过的场次直接恢复，不问
  - 专用文件的开赛页上，「放弃并新开」用预设新建一场，回到这一场的开场卡。结束卡上「重新开始这一场」只用于预设的这一场；在开赛页另开的一场仍然写「新的一场」，回开赛页
- 预设的赛制不进入赛制库（不出现在编辑器里），只属于这一场

### 4.4 测试

- `buildHtml`：结果里只有一个 `#dt-preset`、一个 `#dt-main`；`</script>` 出现在预设字符串里时被转义；不含任何 `src=` / `href=`；再次 `sourceParts` + `buildHtml` 是幂等的（替换预设而不是叠加）
- `read`：坏 JSON、错误 kind、schema 2、非法赛制都返回 null
- 启动：有预设 → 开场卡、辩题与队名正确；命名空间里有进行中的场次 → 恢复；普通计时器的场次不会出现在预设文件里
- 端到端（`tests/test_export.py`，Python unittest）：用无头 Edge `--dump-dom` 打开构建产物的 `?exportProbe=1`。这个查询参数让 `ui.js` 不启动界面，而是用内置的新生赛和一组固定的辩题、队名调用 `DT.preset.buildHtml(DT.preset.sourceParts(), preset)`，把结果文本放进 `<pre id="export-probe">`。测试取出文本，写到 `timer/tests/out/export-test.html`，再用无头 Edge `--dump-dom --virtual-time-budget=5000` 打开它，断言 DOM 里是开场卡（`data-mode="title"`），并且有那组辩题与队名的文字

## 5. 验收

1. 全部测试、`build.py --check` 通过
2. 8 个主题 × 全部场景的截图，两种分辨率，逐张看过：可读性硬约束（§1.5）全部满足，五个新主题各有鲜明的、不能互换的面貌
3. 开赛页主题网格显示 8 个真实缩略图，键盘可操作
4. 导出的文件双击直接进开场卡；刷新后恢复这一场；普通计时器的场次不串过来；可以再导出另一场
5. `prefers-reduced-motion` 下星轨静止、没有流星、没有笔触动画
6. 在一台普通笔记本的 Edge 上，星轨主题 1920×1080 全屏时不卡（画师每帧耗时在性能面板里 < 8ms；无法实测时，至少保证每帧只画增量、星数 ≤ 600）
