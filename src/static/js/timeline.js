(function () {
'use strict';

var TOTAL_DURATION = 30;
var PER_PAGE_SECONDS = 21.816;

var sheetScrollParams = null;

var TRACKS = [
  { id: 't1', name: 'Track 1',  dot: '#555555', clipBg: '#555555' },
  { id: 't2', name: 'Track 2',  dot: '#555555', clipBg: '#555555' }
];

var CLIPS = [
  { track:'t1', start:0.5,  end:6.2,  label:'开场片头' },
  { track:'t1', start:7.0,  end:14.5, label:'主内容 A' },
  { track:'t1', start:15.0, end:22.0, label:'过渡片段' },
  { track:'t1', start:22.5, end:28.0, label:'结尾字幕' },
  { track:'t2', start:3.0,  end:9.0,  label:'B-Roll 素材' },
  { track:'t2', start:10.0, end:18.0, label:'画中画' },
  { track:'t2', start:18.5, end:26.0, label:'蒙太奇' }
];

var pxPerSec = 80;
var currentTime = 0;
var snapEnabled = true;
var playing = false;
var playRaf = null;

var timelineArea   = null;
var timelineInner  = null;
var tracksContainer = null;
var trackLabels    = null;
var rulerCanvas    = null;
var playheadEl     = null;
var clickCatcher   = null;
var timeDisplay    = null;
var zoomSlider     = null;
var zoomLabel      = null;

function fmtTime(sec) {
  var m = Math.floor(sec / 60);
  var s = (sec % 60);
  return ('0' + m).slice(-2) + ':' + s.toFixed(3).padStart(6, '0');
}
function fmtTimeRuler(sec) {
  var m = Math.floor(sec / 60);
  var s = Math.floor(sec % 60);
  return ('0' + m).slice(-2) + ':' + ('0' + s).slice(-2);
}

window.getCurrentTime = function () { return currentTime; };
window.setPageDuration = function (sec) { PER_PAGE_SECONDS = sec; };

function updateTimeDisplay() { if (timeDisplay) timeDisplay.textContent = fmtTime(currentTime); }

function updatePlayhead() {
  if (playheadEl) playheadEl.style.left = (currentTime * pxPerSec) + 'px';
}

function centerScroll(smooth) {
  if (!timelineArea) return;
  var playheadTarget = timelineArea.clientWidth / 3;
  var maxScroll = Math.max(0, TOTAL_DURATION * pxPerSec - timelineArea.clientWidth);
  var target = Math.min(maxScroll, Math.max(0, currentTime * pxPerSec - playheadTarget));
  if (smooth) {
    timelineArea.scrollLeft += (target - timelineArea.scrollLeft) * 0.12;
  } else {
    timelineArea.scrollLeft = target;
  }
}

function calcTickStep() {
  if (!timelineArea) return 0.5;
  var viewSec = timelineArea.clientWidth / pxPerSec;
  if (viewSec <= 5)  return 0.1;
  if (viewSec <= 15) return 0.2;
  if (viewSec <= 30) return 0.5;
  return 1;
}
function calcMajorEvery() {
  if (!timelineArea) return 4;
  var viewSec = timelineArea.clientWidth / pxPerSec;
  if (viewSec <= 3)  return 10;
  if (viewSec <= 10) return 5;
  if (viewSec <= 30) return 4;
  return 2;
}

function renderRuler() {
  if (!rulerCanvas || !timelineArea) return;
  var dpr = window.devicePixelRatio || 1;
  var rulerW = Math.max(timelineArea.clientWidth, TOTAL_DURATION * pxPerSec);
  rulerCanvas.width  = rulerW * dpr;
  rulerCanvas.height = 36 * dpr;
  rulerCanvas.style.width  = rulerW + 'px';
  rulerCanvas.style.height = '36px';
  var ctx = rulerCanvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#fafafa';
  ctx.fillRect(0, 0, rulerW, 36);
  ctx.strokeStyle = '#ccc';
  ctx.fillStyle   = '#666';
  ctx.font = '10px "Segoe UI","Microsoft YaHei",sans-serif';
  ctx.textAlign = 'center';
  var step = calcTickStep();
  var majorEvery = calcMajorEvery();
  var tickIdx = 0;
  for (var t = 0; t <= TOTAL_DURATION + step; t += step) {
    tickIdx++;
    var x = t * pxPerSec;
    if (x < -20 || x > rulerW + 20) continue;
    var isMajor = (tickIdx % majorEvery === 1) || step >= 0.5;
    var h = isMajor ? 18 : 10;
    ctx.beginPath();
    ctx.moveTo(x, 36);
    ctx.lineTo(x, 36 - h);
    ctx.stroke();
    if (isMajor) { ctx.fillText(fmtTimeRuler(t), x, 14); }
  }
}

function renderClips() {
  if (!tracksContainer) return;
  var trackEls = tracksContainer.querySelectorAll('.track-row');
  trackEls.forEach(function (el) { el.querySelectorAll('.clip').forEach(function (c) { c.remove(); }); });

  CLIPS.forEach(function (clip) {
    var trackEl = tracksContainer.querySelector('[data-track-id="' + clip.track + '"]');
    if (!trackEl) return;
    var track = TRACKS.find(function (t) { return t.id === clip.track; });
    if (!track) return;
    var el = document.createElement('div');
    el.className = 'clip';
    el.style.background = track.clipBg;
    el.style.left  = (clip.start * pxPerSec) + 'px';
    el.style.width = ((clip.end - clip.start) * pxPerSec) + 'px';
    el.textContent = clip.label;
    el.title = clip.label + '  [' + fmtTime(clip.start) + ' → ' + fmtTime(clip.end) + ']';
    trackEl.appendChild(el);
  });
}

function redraw() {
  if (!timelineInner) return;
  var totalW = TOTAL_DURATION * pxPerSec;
  timelineInner.style.width  = totalW + 'px';
  timelineInner.style.height = (36 + TRACKS.length * 56) + 'px';
  try { renderClips(); } catch (_) {}
  try { renderRuler(); } catch (_) {}
  try { updatePlayhead(); } catch (_) {}
}

function setTimeFromEvent(e) {
  if (!clickCatcher) return;
  var rect = clickCatcher.getBoundingClientRect();
  var x = e.clientX - rect.left;
  var t = Math.max(0, Math.min(TOTAL_DURATION, x / pxPerSec));
  if (snapEnabled) {
    t = Math.round(t / 0.1) * 0.1;
  }
  currentTime = t;
  try { updatePlayhead(); } catch (_) {}
  try { updateTimeDisplay(); } catch (_) {}
  try { syncSheetScroll(); } catch (_) {}
}

var dragging = false;

function computeScrollParams() {
  var sw = document.querySelector('.sheet-wrapper');
  if (!sw) return null;
  var canvases = sw.querySelectorAll('canvas');
  if (!canvases.length) return null;
  var totalH = 0;
  canvases.forEach(function (c) { totalH += c.getBoundingClientRect().height; });
  var maxScroll = totalH - sw.clientHeight;
  if (maxScroll <= 0) return null;
  var totalDuration = canvases.length * PER_PAGE_SECONDS;
  return { el: sw, maxScroll: maxScroll, totalDuration: totalDuration };
}

function syncSheetScroll() {
  if (!sheetScrollParams) sheetScrollParams = computeScrollParams();
  if (!sheetScrollParams) return;
  var pct = Math.min(1, currentTime / sheetScrollParams.totalDuration);
  sheetScrollParams.el.scrollTop = pct * sheetScrollParams.maxScroll;
}

function play() {
  if (playing) return;
  if (currentTime >= TOTAL_DURATION) currentTime = 0;
  playing = true;
  if (document.getElementById('playBtn')) document.getElementById('playBtn').textContent = '⏸ 暂停';
  sheetScrollParams = computeScrollParams();
  var last = performance.now();
  (function tick() {
    if (!playing) return;
    var now = performance.now();
    currentTime = Math.min(TOTAL_DURATION, currentTime + (now - last) / 1000);
    last = now;
    try { updatePlayhead(); } catch (_) {}
    try { updateTimeDisplay(); } catch (_) {}
    try { centerScroll(true); } catch (_) {}
    try { syncSheetScroll(); } catch (_) {}
    if (currentTime >= TOTAL_DURATION) {
      pause();
      currentTime = TOTAL_DURATION;
      try { updatePlayhead(); } catch (_) {}
      try { updateTimeDisplay(); } catch (_) {}
      return;
    }
    playRaf = requestAnimationFrame(tick);
  })();
}

function pause() {
  playing = false;
  if (document.getElementById('playBtn')) document.getElementById('playBtn').textContent = '▶ 播放';
  cancelAnimationFrame(playRaf);
}

function togglePlay() {
  if (playing) { pause(); } else { play(); }
}

// ======================== 键盘 ========================
document.addEventListener('keydown', function (e) {
  if (!e || !e.key) return;
  var tag = e.target && e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;

  if (e.key === ' ') {
    e.preventDefault();
    togglePlay();
    return;
  }
  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    if (playing) return;
    currentTime = Math.max(0, +(currentTime - 0.01).toFixed(4));
    updatePlayhead(); updateTimeDisplay(); centerScroll();
    try { syncSheetScroll(); } catch (_) {}
    return;
  }
  if (e.key === 'ArrowRight') {
    e.preventDefault();
    if (playing) return;
    currentTime = Math.min(TOTAL_DURATION, +(currentTime + 0.01).toFixed(4));
    updatePlayhead(); updateTimeDisplay(); centerScroll();
    try { syncSheetScroll(); } catch (_) {}
    return;
  }
  if (e.key === 'Home') {
    e.preventDefault();
    pause(); currentTime = 0;
    if (timelineArea) timelineArea.scrollLeft = 0;
    updatePlayhead(); updateTimeDisplay();
    try { syncSheetScroll(); } catch (_) {}
    return;
  }
  if (e.key === 'End') {
    e.preventDefault();
    pause(); currentTime = TOTAL_DURATION;
    if (timelineArea) timelineArea.scrollLeft = TOTAL_DURATION * pxPerSec;
    updatePlayhead(); updateTimeDisplay();
    try { syncSheetScroll(); } catch (_) {}
  }
});

// ======================== DOM 初始化 ========================
function initDOM() {
  timelineArea   = document.getElementById('timelineArea');
  timelineInner  = document.getElementById('timelineInner');
  tracksContainer = document.getElementById('tracksContainer');
  trackLabels    = document.getElementById('trackLabels');
  rulerCanvas    = document.getElementById('rulerCanvas');
  playheadEl     = document.getElementById('playhead');
  clickCatcher   = document.getElementById('clickCatcher');
  timeDisplay    = document.getElementById('timeDisplay');
  zoomSlider     = document.getElementById('zoomSlider');
  zoomLabel      = document.getElementById('zoomLabel');

  if (!timelineArea || !tracksContainer || !trackLabels) return;

  var spacer = document.createElement('div');
  spacer.className = 'ruler-spacer';
  trackLabels.appendChild(spacer);

  TRACKS.forEach(function (t) {
    var el = document.createElement('div');
    el.className = 'tl-track-label';
    el.innerHTML = '<span class="track-dot" style="background:' + t.dot + '"></span>' + t.name;
    trackLabels.appendChild(el);
  });

  TRACKS.forEach(function (t) {
    var el = document.createElement('div');
    el.className = 'track-row';
    el.dataset.trackId = t.id;
    tracksContainer.appendChild(el);
  });

  if (clickCatcher) {
    clickCatcher.addEventListener('click', function (e) { setTimeFromEvent(e); });
    clickCatcher.addEventListener('mousedown', function (e) { dragging = true; setTimeFromEvent(e); });
  }
  window.addEventListener('mousemove', function (e) {
    if (!dragging) return;
    setTimeFromEvent(e);
  });
  window.addEventListener('mouseup', function () {
    dragging = false;
    centerScroll(false);
  });

  if (zoomSlider) {
    zoomSlider.addEventListener('input', function () {
      pxPerSec = parseInt(this.value);
      if (zoomLabel) zoomLabel.textContent = pxPerSec + ' px/s';
      redraw();
    });
  }

  var fitBtn = document.getElementById('fitBtn');
  if (fitBtn) {
    fitBtn.addEventListener('click', function () {
      if (!timelineArea) return;
      pxPerSec = Math.round((timelineArea.clientWidth - 40) / TOTAL_DURATION);
      pxPerSec = Math.max(20, Math.min(400, pxPerSec));
      if (zoomSlider) zoomSlider.value = pxPerSec;
      if (zoomLabel) zoomLabel.textContent = pxPerSec + ' px/s';
      redraw();
    });
  }

  var snapBtn = document.getElementById('snapBtn');
  if (snapBtn) {
    snapBtn.addEventListener('click', function () {
      snapEnabled = !snapEnabled;
      this.textContent = '吸附: ' + (snapEnabled ? '开' : '关');
    });
  }

  var playBtn = document.getElementById('playBtn');
  if (playBtn) playBtn.addEventListener('click', togglePlay);

  if (timelineArea) {
    timelineArea.addEventListener('wheel', function (e) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        pxPerSec = Math.round(Math.max(20, Math.min(400, pxPerSec - e.deltaY * 0.5)));
        if (zoomSlider) zoomSlider.value = pxPerSec;
        if (zoomLabel) zoomLabel.textContent = pxPerSec + ' px/s';
        redraw();
        return;
      }
      e.preventDefault();
      timelineArea.scrollLeft += e.deltaY * 1.2;
    }, { passive: false });
  }

  window.addEventListener('resize', function () { redraw(); });

  updateTimeDisplay();
  redraw();
}

window.initTimeline = function () {
  initDOM();
};

})();
