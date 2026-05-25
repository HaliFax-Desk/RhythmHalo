# RhythmHalo · 霍文节奏

基于 **HTML5 + Python Flask + Vue 3 + pdf.js** 的专业演奏节奏仪表盘。

支持 HDR 视觉脉冲、节拍监测、多轨时间轴编辑、播放头拖拽无极调节，以及乐谱 PDF 实时同步滚动，专为钢琴/吉他演奏场景设计。

---

## 目录结构

```
RhythmHalo/
├── src/
│   ├── app.py                          # Flask 后端入口
│   ├── REAMDE.md                       # 本文档
│   ├── templates/
│   │   └── performance.html            # 主页面模板（Vue 定界符 [[ ]]）
│   ├── static/
│   │   ├── css/
│   │   │   ├── performance.css         # 主页面布局 & 色彩规范
│   │   │   └── timeline.css            # 时间轴组件样式（tl- 命名空间）
│   │   ├── js/
│   │   │   ├── performance.js          # 核心逻辑：BeatEngine + PdfRenderer + Vue App
│   │   │   └── timeline.js             # 时间轴编辑器（独立 IIFE + window.initTimeline）
│   │   ├── fonts/
│   │   │   └── PinyonScript.ttf        # 手写体字型（Key / gliss 标签）
│   │   └── vendor/                     # 离线化第三方库
│   │       ├── vue.global.prod.js      # Vue 3.5
│   │       ├── element-plus.full.js    # ElementPlus UI
│   │       ├── element-plus.css
│   │       ├── pdf.min.js              # pdfjs-dist 3.11 UMD
│   │       └── pdf.worker.min.js
│   └── upload/
│       └── Sheets/                     # 乐谱 PDF 存放目录
├── Script/                             # 原型 & 实验
│   ├── vis-timeline/                   # vis-timeline 库 demo（已弃用）
│   └── video-editing-timeline/         # 时间轴原型（独立 HTML，零依赖）
└── UIdesign/
    └── mainpage.svg                    # UI 设计稿参考
```

---

## 启动方式

```bash
cd src
python app.py
# → http://localhost:5000/performance
```

零配置，`debug=True` 自动热重载。

---

## 页面布局（CSS 坐标体系）

基于 `mainpage.svg` (2048×1152) 的 flex 布局：

```
┌────────────────────────────────────────────┐
│  顶栏 header  (15%)  BPM / Key / Para / 标记  │
├────────────────────────────────────────────┤
│                                            │
│  主区 main   (68%)  乐谱 PDF 滚动区         │
│                                            │
├────────────────────────────────────────────┤
│  底栏 header  (15%)  时间轴编辑器           │
├────────────────────────────────────────────┤
│  进度条 footer (2%)                        │
└────────────────────────────────────────────┘
```

| 层级 | CSS 变量 | 占比 | 说明 |
|------|----------|------|------|
| 顶栏 | `--header-h` | 15% | 4 列 grid，B 键收起/展开 |
| 主区 | `--main-h` | 68% | 顶底栏收起时变 `--main-h--full` |
| 底栏 | `--header-h` | 15% | 时间轴编辑器嵌入 |
| 进度条 | `--footer-h` | 2% | `showProgress()` 触发 |

---

## 色彩规范

| 用途 | 色值 | 色号 |
|------|------|------|
| 信息面板背景（8 个 DIV） | `#F5F5F5` | NIPPON BN7007-4-北风（Δ0） |
| 大数字文字 | `#222222` | COLORO 005-13-00（Δ0.5） |
| 主内容背景 | `#D8D8D8` | — |
| 分隔线 | `#636363` | — |
| 强调色 | `#ff5c28` | — |

---

## 后端 API（Flask）

### 核心接口

| 路由 | 方法 | 说明 |
|------|------|------|
| `/` `/performance` | GET | 返回主页面模板 |
| `/api/current-sheet` | GET | 返回后端变量指定的乐谱文件名 |
| `/api/sheets` | GET | 列出所有可用 PDF 文件 |
| `/sheets/<filename>` | GET | 提供 PDF 二进制流 |

### CURRENT_SHEET 变量控制

```python
# app.py 第 17 行
CURRENT_SHEET = None          # None → 自动取目录第一个
CURRENT_SHEET = "xxx.pdf"     # 指定文件（大小写不敏感）
```

- `find_sheet()` — 大小写不敏感文件名匹配
- 前端通过 `fetch('/api/current-sheet')` 获取，不再自己挑选

### 难点：Vue 模板与 Jinja2 冲突

Flask 默认使用 `{{ }}` 作为模板变量语法，Vue 也使用 `{{ }}`。解决方案：Vue 端改用 `[[ ]]` 定界符：

```js
createApp({ delimiters: ['[[', ']]'] })
```

---

## 前端核心模块

### 1. BeatEngine（节拍引擎）— `performance.js:L18`

setTimeout 链式调度的高精度节拍脉冲发生器。

| 方法 | 说明 |
|------|------|
| `constructor(bpm, beatsPerMeasure)` | BPM=86, 4/4 拍 |
| `setBpm(v)` | 动态改 BPM，运行中自动 `_resync()` |
| `start()` / `stop()` / `reset()` | 播放/停止/重置 |
| `onBeat(fn)` | 注册回调，参数 `{ beatIndex, isDownbeat }` |

**关键技术：** 每次 `_fire()` 后 `_nextTick += intervalMs`，避免 setTimeout 漂移累积。`_resync()` 在 BPM 变化时重置时间基准 `_nextTick = performance.now()`。

### 2. CountdownTimer（倒计时器）— `performance.js:L128`

| 方法 | 说明 |
|------|------|
| `constructor(totalSeconds)` | 默认 300s (5:00) |
| `start()` / `stop()` / `reset()` | 控制 |
| `setTotal(sec)` | 修改总时长 |
| `onTick(fn)` | 回调参数 `{ remaining, display }` |
| `get display` | 格式化 `MM:SS` |

**实现：** 每帧 `performance.now()` 计算 delta 时间，扣减 `_remaining`。精度优于 setInterval。

### 3. SidePanelBlinker（HDR 侧边面板闪烁器）— `performance.js:L175`

| 属性/方法 | 说明 |
|----------|------|
| `constructor(bpm, min, max)` | BPM=86，亮度 0.2→3.0 |
| `setBpm(v)` | 同步 BPM 变化 |
| `start()` / `stop()` | 控制 |

**实现：** `rAF` 驱动，每帧计算 `(t % cycleMs) / cycleMs` 作为进度，亮度从 min → max 线性攀升，到达峰值后 `t % cycleMs` 归零自然回落。CSS `filter: brightness()` 实现 HDR 效果。

### 4. PdfRenderer（PDF 渲染器）— `performance.js:L78`

| 方法 | 说明 |
|------|------|
| `constructor(container)` | 绑定 DOM 容器 |
| `load(url)` | 异步加载 PDF，逐页渲染为 canvas |
| `destroy()` / `_clear()` | 清理 |

**实现：** pdf.js 逐页渲染 → 每页一个 `<canvas>` 垂直堆叠放入 `.sheet-wrapper`。每个 canvas 宽 = `container.clientWidth × 2(ratio)` 实现高清渲染。容器 `overflow-y: auto` 天然可滚动。

### 5. PerformanceApp（Vue 3 应用）— `performance.js:L218`

四个引擎（Beat / Timer / Blinker / PdfRenderer）的 Vue 桥接层。

**核心函数：**

| 函数 | 说明 |
|------|------|
| `togglePlay()` | Space / 按钮 → 启动/停止 Beat + Timer |
| `onBpmChange(v)` | ↑↓ 箭头 / 输入框 ±1 BPM |
| `toggleBars()` | B 键 → 收起/展开上下栏 |
| `showProgress(delay, text)` | 倒计时进度条（rAF 100%→0%） |
| `onKeydown(e)` | 全局键盘事件分发 |

**生命周期：** `onMounted` → `blinker.start()` → `window.initTimeline()` → `fetch('/api/current-sheet')` → `PdfRenderer.load()`。

### 6. Timeline（时间轴编辑器）— `timeline.js`

独立 IIFE 模块，通过 `window.initTimeline()` 在 Vue `onMounted` 的 `nextTick()` 后调用，解决 Vue 销毁并重建 `#app` DOM 导致的引用失效。

**核心设计：**

| 组件 | 说明 |
|------|------|
| 标尺 `renderRuler()` | Canvas 渲染，DPR 缩放，100ms 刻度，`MM:SS` 大刻 |
| 播放头 `updatePlayhead()` | `position: absolute; left: px`，随原生滚动容器移动 |
| 轨道片段 `renderClips()` | 2 条深灰轨，7 个 clip 块 |
| 点击拖拽 `setTimeFromEvent()` | 鼠标按下+拖拽无极定位，吸附 100ms |
| `centerScroll(smooth)` | 播放头锁定视口 1/3 处 → 轨道自动滚动 |
| `syncSheetScroll()` | 时间轴走时 → PDF 同步滚动 |

**键盘绑定：**

| 键 | 功能 |
|----|------|
| Space | 播放/暂停时间轴 + 同步 PDF 滚动 |
| ← | 光标 -10ms |
| → | 光标 +10ms |
| Home | 跳到 00:00 并暂停 |
| End | 跳到结尾并暂停 |
| 滚轮 | 横向滚动 (×1.2) |
| Ctrl+滚轮 | 缩放 (20~400 px/s) |

**PDF 同步滚动参数：**

- `PER_PAGE_SECONDS = 21.816` — 每页 21.816 秒
- `window.setPageDuration(sec)` — 动态修改
- `computeScrollParams()` — 播放开始时动态读取 canvas 总高度
- 滚动位置 = `(currentTime / 总时长) × 总可滚高度`

---

## 关键技术难点 & 卡住的问题

### 1. Vue DOM 重建导致引用失效 ★★★

**问题：** `timeline.js` 在 `DOMContentLoaded` 时获取 DOM 引用，但 Vue 挂载到 `#app` 后会销毁并重建内部所有节点，导致原有引用指向已删节点（`inDOM: false`, `offsetWidth: 0`）。

**解决：** timeline.js 改为暴露 `window.initTimeline()`，由 `performance.js` 的 `onMounted → nextTick()` 后调用，确保 DOM 已稳定。

### 2. Space 键盘冲突 ★★

**问题：** `performance.js`（Beat 引擎）和 `timeline.js`（时间轴）都在 `document` 上监听 Space，同时触发各自 `togglePlay()`。

**解决：** 不在代码层面互斥，两个 `togglePlay` 各自独立——一个控制节拍脉冲 + 倒计时，一个控制时间轴走时 + PDF 滚动。同一颗 Space 同时启动两者，协同工作。

### 3. 播放头位置偏移（双倍 scrollLeft）★★

**问题：** 播放头 `left = px - scrollLeft`，但 `left` 在滚动容器内已有 offset，导致播放头移动速度与标尺不同步（双倍偏移）。

**解决：** 播放头在 `.timeline-inner` 内用 `position: absolute; left: currentTime * pxPerSec` 定位，不做 scrollLeft 减法。标尺也用 `position: sticky` 自动跟随原生滚动。

### 4. 点击定位坐标偏移 ★★

**问题：** `e.clientX - rect.left + timelineArea.scrollLeft`，但 `getBoundingClientRect()` 已经包含滚动偏移，再加一次导致点击位置向后跳。

**解决：** 去掉末尾的 `+ timelineArea.scrollLeft`，只用 `e.clientX - rect.left`。

### 5. CDN 资源被 Edge 拦截 ★

**问题：** Edge Tracking Prevention 阻止 unpkg.com CDN 访问 localStorage，导致 Vue 加载失败。

**解决：** 所有 vendor 文件下载到 `/static/vendor/` 本地引用。

### 6. pdfjs-dist 4.x UMD 移除 ★

**问题：** `pdfjs-dist@4.0` 不再提供 `pdf.min.js` UMD 构建（`.mjs` ESM 不兼容 script 标签加载）。

**解决：** 降级到 `@3.11.174`，保留 `global pdfjsLib` 全局变量。

---

## 调用链路速查

```
页面加载
  └→ DOMContentLoaded
       └→ mountPerformanceApp()        # Vue 挂载
            └→ onMounted()
                 ├→ blinker.start()    # HDR 闪烁
                 ├→ onKeydown 注册      # 键盘监听
                 ├→ nextTick()
                 ├→ window.initTimeline()  # 时间轴 DOM 初始化
                 └→ fetch('/api/current-sheet') → PdfRenderer.load()

Space 按下
  ├→ performance.js onKeydown → togglePlay()
  │    ├→ BeatEngine.start()
  │    └→ CountdownTimer.start()
  └→ timeline.js keydown → togglePlay()
       └→ rAF tick() → updatePlayhead() + centerScroll(true) + syncSheetScroll()

拖动时间轴
  └→ mousedown/mousemove → setTimeFromEvent() → updatePlayhead() + syncSheetScroll()
  └→ mouseup → centerScroll(false)
```
