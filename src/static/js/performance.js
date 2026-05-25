/* ============================================================
 * RhythmHalo — Performance Page 逻辑
 * 模块:
 *   BeatEngine     — 纯节拍脉冲生成 (setTimeout 链式调度)
 *   CountdownTimer — requestAnimationFrame 精准倒计时
 *   PerformanceApp — Vue 3 桥接引擎 → UI
 * ============================================================ */

const { createApp, ref, computed, onMounted, onBeforeUnmount, nextTick } = Vue;

// ============================================================
// BeatEngine: BPM 驱动的节拍脉冲发生器
// 用 setTimeout 链式调度，每次拍点调用 onBeat 注册的回调
// ============================================================
class BeatEngine {
  constructor(bpm = 120, beatsPerMeasure = 4) {
    this._bpm = bpm;
    this._beatsPerMeasure = beatsPerMeasure;  // 每小节拍数，默认 4/4
    this._beatIndex = -1;    // 当前拍号 0..3
    this._running = false;
    this._timer = null;      // setTimeout 句柄
    this._nextTick = 0;      // 下一次拍点的高精度时间戳
    this._callbacks = [];
  }

  // 每拍间隔 ms
  get intervalMs() { return 60000 / this._bpm; }

  setBpm(v) {
    this._bpm = Math.max(20, Math.min(400, v));
    if (this._running) this._resync();  // 运行中需重新对齐
  }

  // 注册回调 fn({ beatIndex, isDownbeat })
  onBeat(fn) { this._callbacks.push(fn); }

  start() {
    if (this._running) return;
    this._running = true;
    this._beatIndex = -1;
    this._nextTick = performance.now();
    this._schedule();
  }

  stop()  { this._running = false; clearTimeout(this._timer); }
  reset() { this.stop(); this._beatIndex = -1; }

  // 根据下一次拍点时间计算 delay 并投递 setTimeout
  _schedule() {
    if (!this._running) return;
    const delay = Math.max(0, this._nextTick - performance.now());
    this._timer = setTimeout(() => this._fire(), delay);
  }

  // BPM 变化时重置时间基准
  _resync() {
    clearTimeout(this._timer);
    this._nextTick = performance.now();
    this._schedule();
  }

  _fire() {
    this._beatIndex = (this._beatIndex + 1) % this._beatsPerMeasure;
    this._callbacks.forEach(fn => fn({
      beatIndex:  this._beatIndex,
      isDownbeat: this._beatIndex === 0,  // 第1拍为强拍
    }));
    // 按 intervalMs 步进，避免 setTimeout 漂移累积
    this._nextTick += this.intervalMs;
    this._schedule();
  }
}

// ============================================================
// PdfRenderer: 用 pdf.js 将 PDF 逐页渲染为满宽 canvas
// 零控件、无白边，多页垂直堆叠，容器可滚动查阅
// ============================================================
class PdfRenderer {
  constructor(container) {
    this._container = container;  // DOM 容器
    this._loaded = false;
    this._ratio = 2;              // 渲染分辨率倍数 (2x 高清)
  }

  get loaded() { return this._loaded; }

  async load(url) {
    this._clear();
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/static/vendor/pdf.worker.min.js';
    const doc = await pdfjsLib.getDocument(url).promise;
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 1 });
      const containerW = this._container.clientWidth;
      const scale = containerW / viewport.width * this._ratio;
      const scaledVp = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = scaledVp.width;
      canvas.height = scaledVp.height;
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport: scaledVp }).promise;
      this._container.appendChild(canvas);
    }
    this._loaded = true;
  }

  destroy() {
    this._clear();
    this._loaded = false;
  }

  _clear() {
    while (this._container.firstChild) {
      this._container.removeChild(this._container.firstChild);
    }
  }
}

// ============================================================
// CountdownTimer: requestAnimationFrame 驱动的倒计时器
// 精度优于 setInterval，显示 MM:SS
// ============================================================
class CountdownTimer {
  constructor(totalSeconds = 300) {
    this._total = totalSeconds;      // 总秒数
    this._remaining = totalSeconds;  // 剩余秒数(浮点)
    this._running = false;
    this._raf = null;    // requestAnimationFrame 句柄
    this._last = 0;      // 上一帧时间戳
    this._callbacks = [];
  }

  // 格式化为 MM:SS
  get display() {
    const m = Math.floor(this._remaining / 60);
    const s = Math.floor(this._remaining % 60);
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  setTotal(sec) { this._total = sec; this._remaining = sec; this._emit(); }
  onTick(fn)    { this._callbacks.push(fn); }

  start() {
    if (this._running) return;
    this._running = true;
    this._last = performance.now();
    this._tick();
  }

  stop()  { this._running = false; cancelAnimationFrame(this._raf); }
  reset() { this.stop(); this._remaining = this._total; this._emit(); }

  // 每帧计算 delta 时间并扣减剩余秒数
  _tick() {
    if (!this._running) return;
    const now = performance.now();
    this._remaining = Math.max(0, this._remaining - (now - this._last) / 1000);
    this._last = now;
    this._emit();
    if (this._remaining > 0) {
      this._raf = requestAnimationFrame(() => this._tick());
    } else {
      this._running = false;  // 倒计时结束
    }
  }

  _emit() {
    this._callbacks.forEach(fn => fn({
      remaining: this._remaining,
      display:   this.display,
    }));
  }
}

// ============================================================
// SidePanelBlinker: rAF 驱动 HDR 闪烁
// BPM → 周期 60000/bpm ms，亮度 20%→HDR上限，到达峰值瞬间回落到20%
// ============================================================
class SidePanelBlinker {
  constructor(bpm = 86, minBrightness = 0.2, maxBrightness = 3) {
    this._bpm = bpm;
    this._min = minBrightness;
    this._max = maxBrightness;
    this._panels = null;
    this._running = false;
    this._raf = null;
  }

  get bpm() { return this._bpm; }

  setBpm(v) { this._bpm = Math.max(1, v); }

  start() {
    this._panels = document.querySelectorAll('.side-panel');
    if (!this._panels.length) return;
    this._running = true;
    this._tick();
  }

  stop() {
    this._running = false;
    cancelAnimationFrame(this._raf);
  }

  get _cycleMs() { return 60000 / this._bpm; }

  _tick() {
    if (!this._running) return;
    const t = (performance.now() % this._cycleMs) / this._cycleMs;
    const brightness = this._min + t * (this._max - this._min);
    const filter = `brightness(${brightness.toFixed(2)}) contrast(1.02)`;
    for (const p of this._panels) p.style.filter = filter;
    this._raf = requestAnimationFrame(() => this._tick());
  }
}

// ============================================================
// Vue 3 应用：绑定引擎事件到响应式状态，暴露给模板
// ============================================================
const PerformanceApp = {
  setup() {
    /* ---- 引擎实例 ---- */
    const beat  = new BeatEngine(86, 4);     // BPM=86, 4/4拍
    const timer = new CountdownTimer(300);    // 5:00 倒计时

    /* ---- 响应式状态 (Vue ref) ---- */
    const isPlaying     = ref(false);
    const bpm           = ref(86);
    const beatIndex     = ref(0);
    const beatsPerMeasure = ref(4);
    const timeDisplay   = ref('05:00');
    const blinkCount    = ref(0);     // 累计闪烁次数
    const presetDuration = ref(300);  // 下拉框当前值
    const showBars       = ref(true);   // 上下栏显示/收起
    const sheetLoaded    = ref(false);  // 乐谱加载状态
    const sheetContainer = ref(null);   // DOM 容器引用
    const progressVisible = ref(false);
    const progressText = ref('');
    const progressPercent = ref(78);
    let pdfRenderer      = null;
    const blinker        = new SidePanelBlinker(86, 0.2, 3);
    let progressRaf    = null;

    // 拍点圆点数组 [0,1,2,3]
    const beatDots = computed(() =>
      Array.from({ length: beatsPerMeasure.value }, (_, i) => i)
    );

    /* ---- 引擎 → 状态 回调 ---- */
    beat.onBeat(evt => {
      beatIndex.value = evt.beatIndex;
      blinkCount.value++;
    });

    timer.onTick(evt => {
      timeDisplay.value = evt.display;
    });

    /* ---- 操作函数 ---- */
    function togglePlay() {
      if (isPlaying.value) { beat.stop();  timer.stop(); }
      else                 { beat.start(); timer.start(); }
      isPlaying.value = !isPlaying.value;
    }

    function handleReset() {
      beat.reset(); timer.reset();
      isPlaying.value = false;
      beatIndex.value = 0;
      blinkCount.value = 0;
    }

    function onBpmChange(v)    { bpm.value = v; beat.setBpm(v); blinker.setBpm(v); }
    function onPresetChange(v) { timer.setTotal(v); }
    function toggleBars()    { showBars.value = !showBars.value; }

    function showProgress(delay, text) {
      cancelAnimationFrame(progressRaf);
      progressText.value = text;
      progressVisible.value = true;
      progressPercent.value = 100;
      if (delay > 0) {
        const start = performance.now();
        const tick = () => {
          const elapsed = performance.now() - start;
          const pct = Math.max(0, 100 - (elapsed / delay) * 100);
          progressPercent.value = pct;
          if (pct > 0) {
            progressRaf = requestAnimationFrame(tick);
          } else {
            progressVisible.value = false;
            progressPercent.value = 78;
          }
        };
        progressRaf = requestAnimationFrame(tick);
      }
    }
    window.showProgress = showProgress;

    /* ---- 键盘快捷键 ---- */
    function onKeydown(e) {
      // 在输入框中不拦截
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === ' ')         { e.preventDefault(); togglePlay(); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); onBpmChange(Math.min(400, bpm.value + 1)); }
      if (e.key === 'ArrowDown') { e.preventDefault(); onBpmChange(Math.max(20,  bpm.value - 1)); }
      if (e.key === 'r' && !e.ctrlKey && !e.metaKey) handleReset();
      if (e.key === 'b' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); toggleBars(); }
    }

    onMounted(async () => {
      blinker.start();
      document.addEventListener('keydown', onKeydown);
      await nextTick();
      if (window.initTimeline) window.initTimeline();
      // 获取第一个可用乐谱并渲染
      try {
        const res = await fetch('/api/sheets');
        const files = await res.json();
        if (files.length && sheetContainer.value) {
          const url = '/sheets/' + encodeURIComponent(files[0]);
          pdfRenderer = new PdfRenderer(sheetContainer.value);
          await pdfRenderer.load(url);
          sheetLoaded.value = true;
        }
      } catch (e) {
        console.error('PDF 加载失败:', e);
      }
    });
    onBeforeUnmount(() => { blinker.stop(); cancelAnimationFrame(progressRaf); document.removeEventListener('keydown', onKeydown); });

    return {
      isPlaying, bpm, beatIndex, beatsPerMeasure, beatDots,
      timeDisplay, blinkCount, presetDuration,
      showBars,
      sheetLoaded, sheetContainer,
      progressVisible, progressText, progressPercent, showProgress,
      togglePlay, handleReset, onBpmChange, onPresetChange, toggleBars,
    };
  },
};

// 入口：创建 + 挂载 Vue 应用，[[ ]] 定界符与 Jinja2 兼容
window.mountPerformanceApp = function () {
  const app = createApp(PerformanceApp);
  app.config.compilerOptions = { delimiters: ['[[', ']]'] };
  app.use(ElementPlus);
  app.mount('#app');
};
