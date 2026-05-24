/* ============================================================
 * RhythmHalo — Performance Page 逻辑
 * 模块:
 *   BeatEngine     — 纯节拍脉冲生成 (setTimeout 链式调度)
 *   CountdownTimer — requestAnimationFrame 精准倒计时
 *   PerformanceApp — Vue 3 桥接引擎 → UI
 * ============================================================ */

const { createApp, ref, computed, onMounted, onBeforeUnmount } = Vue;

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
// Vue 3 应用：绑定引擎事件到响应式状态，暴露给模板
// ============================================================
const PerformanceApp = {
  setup() {
    /* ---- 引擎实例 ---- */
    const beat  = new BeatEngine(120, 4);     // BPM=120, 4/4拍
    const timer = new CountdownTimer(300);    // 5:00 倒计时

    /* ---- 响应式状态 (Vue ref) ---- */
    const isPlaying     = ref(false);
    const bpm           = ref(120);
    const beatIndex     = ref(0);
    const beatsPerMeasure = ref(4);
    const timeDisplay   = ref('05:00');
    const progressPercent = ref(0);   // 进度线 top 百分比
    const blinkCount    = ref(0);     // 累计闪烁次数
    const presetDuration = ref(300);  // 下拉框当前值

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
      progressPercent.value = timer._total > 0
        ? (1 - evt.remaining / timer._total) * 90  // 0~90% 避免出界
        : 0;
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

    function onBpmChange(v)    { bpm.value = v; beat.setBpm(v); }
    function onPresetChange(v) { timer.setTotal(v); }

    /* ---- 键盘快捷键 ---- */
    function onKeydown(e) {
      // 在输入框中不拦截
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === ' ')         { e.preventDefault(); togglePlay(); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); onBpmChange(Math.min(400, bpm.value + 1)); }
      if (e.key === 'ArrowDown') { e.preventDefault(); onBpmChange(Math.max(20,  bpm.value - 1)); }
      if (e.key === 'r' && !e.ctrlKey && !e.metaKey) handleReset();
    }

    onMounted(() => document.addEventListener('keydown', onKeydown));
    onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));

    return {
      isPlaying, bpm, beatIndex, beatsPerMeasure, beatDots,
      timeDisplay, progressPercent, blinkCount, presetDuration,
      togglePlay, handleReset, onBpmChange, onPresetChange,
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
