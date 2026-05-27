/* ============================================================
 * VTT 乐谱记号解析引擎 v1.0
 * 严格遵循 WebVTT 乐谱记号规范 v1.1
 *
 * 公开 API（全局函数）:
 *   VttEngine.parse(raw)          → { info, events }
 *   VttEngine.buildSnapshots(evt) → snapshots[]
 *   VttEngine.getSnapshot(snaps,t)→ { bpm, key, dynamic, ... }
 *   VttEngine.getActiveEffects(evt,t) → [{ id, effectType, display }]
 *   VttEngine.getActiveCues(evt,t,notified) → [{ id, text, countdown }]
 *   VttEngine.fmtSeconds(sec)      → "MM:SS.ss"
 *   VttEngine.validateBpm / validateKey / validateDynamic
 * ============================================================ */
(function () {
'use strict';

function parseVttTime(hms) {
  var m = (hms || '').match(/^(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/);
  if (!m) return null;
  return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] * 0.001;
}

function fmtSeconds(sec) {
  var s = sec || 0;
  var m = Math.floor(s / 60);
  var secPart = (s % 60).toFixed(2);
  return ('0' + m).slice(-2) + ':' + secPart.padStart(5, '0');
}

var DYNAMIC_ORDER = { pppp:0, ppp:1, pp:2, p:3, mp:4, mf:5, f:6, ff:7, fff:8, ffff:9 };

function validateBpm(v) {
  var n = parseFloat(v);
  return !isNaN(n) && n >= 20 && n <= 400 ? n : null;
}
function validateKey(v) {
  return /^[a-gA-G](#|b)?$/.test(v) ? v : null;
}
function validateDynamic(v) {
  var low = v.toLowerCase();
  return DYNAMIC_ORDER.hasOwnProperty(low) ? low : null;
}

function parseDataLine(raw) {
  if (!raw || !raw.trim()) return null;
  var text = raw.trim();
  var colonIdx = text.indexOf(':');
  var eqIdx   = text.indexOf('=');

  if (eqIdx > -1 && (colonIdx === -1 || eqIdx < colonIdx)) {
    return {
      typeName: text.substring(0, eqIdx).trim(),
      params: { value: text.substring(eqIdx + 1).trim() },
      raw: text
    };
  } else if (colonIdx > -1) {
    var typeName = text.substring(0, colonIdx).trim();
    var paramStr = text.substring(colonIdx + 1).trim();
    var params = {};
    paramStr.split(',').forEach(function (pair) {
      var ei = pair.indexOf('=');
      if (ei > -1) {
        params[pair.substring(0, ei).trim()] = pair.substring(ei + 1).trim();
      }
    });
    return { typeName: typeName, params: params, raw: text };
  } else {
    return { typeName: text, params: {}, raw: text };
  }
}

function parse(raw) {
  var lines = raw.split(/\r?\n/);
  var events = [];
  var info = { title: '', notes: [] };
  var inHeader = true;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];

    if (inHeader) {
      if (line.indexOf('-->') !== -1) inHeader = false;
      else {
        var ti = line.indexOf('NOTE');
        if (ti !== -1) {
          var note = line.substring(ti + 4).trim();
          if (note) info.notes.push(note);
          if (note.indexOf('乐谱：') !== -1 && !info.title) info.title = note.replace('乐谱：','').trim();
        }
        continue;
      }
    }

    var semiIdx = line.indexOf(';');
    if (semiIdx !== -1) line = line.substring(0, semiIdx);
    if (!line.trim()) continue;

    var arrowIdx = line.indexOf('-->');
    if (arrowIdx === -1) continue;

    var startRaw = line.substring(0, arrowIdx).trim();
    var endRaw   = line.substring(arrowIdx + 3).trim();
    var t = parseVttTime(startRaw);
    var e = parseVttTime(endRaw);
    if (t === null || e === null) continue;
    if (t > e) continue;

    var dataLines = [];
    for (var j = i + 1; j < lines.length && lines[j].trim() && lines[j].indexOf('-->') === -1; j++) {
      var dl = lines[j];
      var ds = dl.indexOf(';');
      if (ds !== -1) dl = dl.substring(0, ds);
      if (dl.trim()) dataLines.push(dl.trim());
    }

    dataLines.forEach(function (dl) {
      var parsed = parseDataLine(dl);
      if (!parsed) return;
      var typeName = parsed.typeName;
      var baseType = typeName.split(':')[0];

      var _cat;
      if (baseType === 'cue') {
        _cat = 'cue';
      } else if (Math.abs(e - t) < 0.001 && (baseType === 'bpm' || baseType === 'key' || baseType === 'dynamic' || baseType === 'technique' || baseType === 'expression')) {
        _cat = 'state';
      } else if (Math.abs(e - t) < 0.001) {
        return;
      } else if (e > t) {
        _cat = 'effect';
      } else {
        return;
      }

      var evt = {
        id: 'evt' + events.length,
        t: t, e: e,
        startStr: startRaw, endStr: endRaw,
        duration: +(e - t).toFixed(4),
        _cat: _cat,
        typeName: typeName,
        baseType: baseType,
        params: parsed.params,
        raw: parsed.raw
      };

      if (_cat === 'state') {
        var v;
        if (baseType === 'bpm') { v = validateBpm(parsed.params.value); if (v === null) return; evt.value = v; }
        else if (baseType === 'key') { v = validateKey(parsed.params.value); if (v === null) return; evt.value = v; }
        else if (baseType === 'dynamic') { v = validateDynamic(parsed.params.value); if (v === null) return; evt.value = v; }
        else { evt.value = parsed.params.value || ''; }
      }

      events.push(evt);
    });
  }

  if (!info.title && info.notes.length) info.title = info.notes[0].substring(0, 40);
  events.sort(function (a, b) { return a.t - b.t; });
  return { info: info, events: events };
}

function buildSnapshots(events) {
  var states = events.filter(function (e) { return e._cat === 'state'; });
  states.sort(function (a, b) { return a.t - b.t; });

  var current = { bpm: '—', key: '—', dynamic: '—', technique: '', expression: '' };
  var timePoints = [];
  var seenTime = {};

  states.forEach(function (s) {
    if (s.baseType === 'bpm') current.bpm = s.value;
    else if (s.baseType === 'key') current.key = s.value;
    else if (s.baseType === 'dynamic') current.dynamic = s.value;
    else if (s.baseType === 'technique') current.technique = s.value;
    else if (s.baseType === 'expression') current.expression = s.value;

    var tk = s.t.toFixed(3);
    var snap = { bpm: current.bpm, key: current.key, dynamic: current.dynamic, technique: current.technique, expression: current.expression };
    if (!seenTime[tk]) {
      seenTime[tk] = true;
      timePoints.push({ t: s.t, snap: snap, bpm: current.bpm, key: current.key, dynamic: current.dynamic, technique: current.technique, expression: current.expression });
    } else {
      timePoints[timePoints.length - 1] = { t: s.t, snap: snap, bpm: current.bpm, key: current.key, dynamic: current.dynamic, technique: current.technique, expression: current.expression };
    }
  });

  return timePoints;
}

function getSnapshot(snapshots, t) {
  if (!snapshots.length) return { bpm: '—', key: '—', dynamic: '—', technique: '', expression: '' };
  var s = snapshots[0];
  for (var i = snapshots.length - 1; i >= 0; i--) {
    if (snapshots[i].t <= t + 0.001) { s = snapshots[i]; break; }
  }
  return s;
}

function getActiveEffects(events, tNow) {
  var active = events.filter(function (evt) {
    if (evt._cat !== 'effect') return false;
    return tNow >= evt.t && tNow < evt.e;
  });

  var byType = {};
  active.forEach(function (evt) {
    if (!byType[evt.baseType]) byType[evt.baseType] = [];
    byType[evt.baseType].push(evt);
  });

  var result = [];
  Object.keys(byType).forEach(function (typeName) {
    var group = byType[typeName];
    group.sort(function (a, b) { return a.t - b.t; });
    var latest = group[group.length - 1];
    if (latest) result.push(latest);
  });

  return result.map(function (evt) {
    var display = evt.typeName;
    var keys = Object.keys(evt.params);
    if (keys.length) {
      display += ' ' + keys.map(function (k) { return k + '=' + evt.params[k]; }).join(',');
    }
    return { id: evt.id, effectType: evt.baseType, display: display, t: evt.t, e: evt.e };
  });
}

function getActiveCues(events, tNow, notified) {
  return events.filter(function (evt) {
    if (evt._cat !== 'cue') return false;
    var advance = parseFloat(evt.params.advance) || 3;
    var windowStart = Math.max(0, evt.t - advance);
    var windowEnd = evt.t > 0.001 ? evt.t : 0.5;
    return tNow >= windowStart && tNow < windowEnd;
  }).map(function (evt) {
    return {
      id: evt.id,
      text: evt.params.text || evt.params.value || '提示',
      countdown: Math.max(0, +(evt.t - tNow).toFixed(1)),
      targetTime: evt.t,
      advance: parseFloat(evt.params.advance) || 3,
      notified: !!notified[evt.id]
    };
  });
}

window.VttEngine = {
  parse:            parse,
  buildSnapshots:   buildSnapshots,
  getSnapshot:      getSnapshot,
  getActiveEffects: getActiveEffects,
  getActiveCues:    getActiveCues,
  fmtSeconds:       fmtSeconds,
  validateBpm:      validateBpm,
  validateKey:      validateKey,
  validateDynamic:  validateDynamic
};

})();
