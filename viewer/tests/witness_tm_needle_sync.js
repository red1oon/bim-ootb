#!/usr/bin/env node
// ⚠ DO NOT REMOVE — SCOPE: WITNESS W-NS, "needle = canvas" (guarantee G-A of the Gantt editor lane).
// Spec: bim-compiler prompts/4D_MODEL_INTEGRITY.md §Q.19.1 (G-A), §Q.19.5 (these claims, written before this file).
// Read the log after every run, not the exit code.
//
// ISSUE THIS PROVES OR DISPROVES (owner, 2026-11-18: "make sure they are synched with actual canvas beats on timeline
// vertical needle"): at any cursor instant the Gantt drawer (bars, active frame, hairline, ruler), the slider and the
// day counter must read the SAME instant the canvas is building, before and after a bar edit. Until this file no
// witness covered the needle at all.
//
// WHAT IS JUDGED, AND THROUGH WHAT. The population is the PERSISTED PLAYED LAYER of the seven buildings
// (scripts/cache_4d_run.js, CACHE.layerOf(run) = played — the instants kernel_ops carries). It is turned into ops in
// loadOps' own field names (read off loadOps' source) and judged through the SHIPPED code only: GanttModel.buildTasks /
// computeDays (required) and the panel and drawer functions sliced out of the time_machine family by brace matching
// (computeDays wrapper, buildGanttTasks, drawGanttMini, drawGanttRuler, ganttRulerTicks, updateStatus,
// anchorFromCursor, configSlider, onSlide, commitGanttDrag, retimeTaskElements ...). The canvas is a recording 2D
// context, so "which bar is framed active" and "where is the hairline" are read off what the drawer drew.
// "What the canvas builds at cursor" is the §I rule of renderAtTime: start_ts <= cursor < end_ts (guarded by NS-0).
//
//   NS-0  the fixture is the viewer's shape: op field names come from loadOps; every element sits in one bar; the
//         frontier rule quoted above is still the one in renderAtTime.
//   NS-1  every element plays inside its own bar (bar start <= start < end <= bar end).
//   NS-2  no bar is under the needle with nothing of it building: uncovered time per bar <= 1 ms per member
//         (the rounding W-RWB-1 already allows).
//   NS-3  the bars the drawer frames as active are exactly the bars that own an element the canvas is building,
//         at every bar boundary and at slider stops.
//   NS-4  the needle is never parked while the canvas still builds (display axis covers the playback bounds), and
//         the drawn hairline lies inside every framed bar's drawn rectangle.
//   NS-5  one day origin: ruler ticks sit exactly on bar-day boundaries, the counter reads the tick's day there, the
//         slider's ladder is on the same grid, and counter and slider notch name the same day at sampled cursors.
//   NS-6  slider round trip (DAY, HR, finest mode): set a notch, slide, read back — same notch, and the counter
//         names that day / hour.
//   NS-7  after a committed bar MOVE and a RESIZE through the shipped commitGanttDrag on a real building db:
//         NS-1..NS-5 hold on the new timeline and the slider's range and notch equal a fresh read of the cursor.
//   NS-R  red controls: an element pushed outside its bar must fail NS-1; a bar stretched past its elements must
//         fail NS-2.
// Every claim prints the population it judged; an empty population prints INCONCLUSIVE, never PASS.
//
// Command: node viewer/tests/witness_tm_needle_sync.js [Building ...]     (default: the seven)
//          NS_BLD=<building> picks the building NS-7 edits (default Duplex); NS_TZ="UTC,Asia/Kuala_Lumpur" the zones.
'use strict';
const __readSrc = require('./_split_families.js').readSource;
const fs = require('fs'), path = require('path'), vm = require('vm');
const V = path.join(__dirname, '..'), ROOT = path.join(V, '..');
const CACHE = require(path.join(ROOT, 'scripts', 'cache_4d_run.js'));
const GM = require(path.join(V, 'gantt_model.js'));
const tmSrc = __readSrc(path.join(V, 'time_machine.js'), 'utf8');
const DAY = 86400000, HOUR = 3600000;
const ZONES = (process.env.NS_TZ || 'UTC,Asia/Kuala_Lumpur,America/New_York').split(',');
const NS_BLD = process.env.NS_BLD || 'Duplex';
const SAMPLE_CAP = 200;   // slider stops / sample days judged per building and zone; the line prints "of M" when capped

let pass = 0, fail = 0, inconclusive = 0;
function claim(id, where, pop, bad, detail) {
  const v = pop === 0 ? 'INCONCLUSIVE' : (bad === 0 ? 'PASS' : 'FAIL');
  if (v === 'PASS') pass++; else if (v === 'FAIL') fail++; else inconclusive++;
  console.log('§W_NS ' + id.padEnd(8) + v.padEnd(13) + 'judged=' + String(pop).padEnd(8) + 'bad=' + String(bad).padEnd(7) + '[' + where + '] ' + (detail || ''));
  return v;
}
function sliceFn(src, name) {   // line-anchored: a comment that mentions `function NAME(` cannot match
  const m = new RegExp('^[ \\t]*function ' + name + '\\(', 'm').exec(src);
  if (!m) throw new Error(name + ' not found in the time_machine family (no line-anchored definition)');
  const idx = m.index + m[0].indexOf('function');
  let d = 0, open = false;
  for (let i = idx; i < src.length; i++) {
    if (src[i] === '{') { d++; open = true; }
    else if (src[i] === '}') { d--; if (open && d === 0) return src.slice(idx, i + 1); }
  }
  throw new Error('unbalanced braces for ' + name);
}
function stride(arr, cap) { if (arr.length <= cap) return arr.slice(); const out = [], st = arr.length / cap; for (let i = 0; i < cap; i++) out.push(arr[Math.floor(i * st)]); if (out[out.length - 1] !== arr[arr.length - 1]) out.push(arr[arr.length - 1]); return out; }
const isoDay = ms => new Date(ms).toISOString().slice(0, 10);   // what ScheduleAuthor._addDays writes to tasks.schedule_start

// ── loadOps' own field names (NS-0) ──────────────────────────────────────────────────────────
const loadOpsSrc = sliceFn(tmSrc, 'loadOps');
const OP_START = (/(\w+):\s*row\[1\]/.exec(loadOpsSrc) || [])[1], OP_END = (/(\w+):\s*params\._end_ts/.exec(loadOpsSrc) || [])[1];
const renderSrc = sliceFn(tmSrc, 'renderAtTime');
const FRONTIER_RULE_OK = /if \(op\.start_ts > cursorMs\) break;/.test(renderSrc) && /if \(op\.end_ts <= cursorMs\) \{\s*placed\[guid\] = true;/.test(renderSrc);

// ── a headless Gantt: the shipped functions in one vm context, a recording canvas, DOM stubs ──
function recCtx() {
  const calls = [];
  const state = { fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '', globalAlpha: 1 };
  const ctx = new Proxy(state, {
    get(t, k) { if (k === '__calls') return calls; if (k in t) return t[k];
      if (k === 'measureText') return () => ({ width: 0 });
      return (...a) => { calls.push({ m: k, a: a, strokeStyle: t.strokeStyle, fillStyle: t.fillStyle, lineWidth: t.lineWidth }); }; },
    set(t, k, v) { t[k] = v; return true; },
  });
  return ctx;
}
const SLICED = ['loadOps', '_placeOps', 'computeDays', '_tmDayParts', '_tmNotchEnd', 'updateStatus', 'anchorFromCursor', 'configSlider', 'onSlide',
  'invalidateGanttModel', 'buildGanttTasks', 'ganttRulerTicks', 'drawGanttRuler', 'drawGanttMini',
  '_retimeSpan', 'retimeTaskElements', '_tmResyncAfterRetime', '_tmBusyRecording', '_tmEditLocked', '_tmEditSnapshot', '_tmEditRefresh', '_tmCommitEdit', 'commitGanttDrag'];
function makeTM(o) {   // o: { ops, idx | db, bld, SA, rules, gcv, logs }
  const dom = {
    'tm-slider': { min: 0, max: 100, value: 50 },
    'tm-big-counter': { textContent: '' }, 'tm-label': { textContent: '' }, 'tm-status': { textContent: '' },
    'tm-progress-bar': { style: {} }, 'tm-gantt-hair': { style: {} }, 'tm-gantt-lockmsg': { textContent: '', style: {} },
    'tm-gantt-tip': { textContent: '', style: {} },
    'tm-gantt-box': { clientWidth: 660, clientHeight: 0, scrollHeight: 0, scrollTop: 0, style: {} },
    'tm-gantt-canvas': { width: 0, height: 0, style: {}, ctx: recCtx(), getContext() { return this.ctx; } },
    'tm-gantt-ruler': { width: 0, height: 0, style: {}, ctx: recCtx(), getContext() { return this.ctx; } },
  };
  const logs = o.logs || [];
  const sb = {
    console: { log: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push(a.join(' ')) }, JSON: JSON,
    document: { getElementById: id => dom[id] || null },
    window: { GanttModel: GM, ScheduleAuthor: o.SA || null, SEQUENCE_RULES: o.rules || null, devicePixelRatio: 1, performance: null },
    A: () => ({ db: o.db || null, activeBuilding: o.bld }),
    _ops: o.ops || [], _cursor: 0, _prevCursor: 0, _projectStart: 0, _projectEnd: 0, _days: [], _dayOrigin: null,
    _anchorDay: null, _anchorHr: null, _mode: 'DAY', _ganttAxisStart: 0, _ganttAxisEnd: 0,
    _ganttTasks: [], _ganttDirty: true, _ganttRebuildN: 0, _ganttIdentified: 0, _ganttUnidentified: 0, _ganttSpanFromTask: 0,
    _ganttSpanFromOps: 0, _ganttTasksComputed: false, _cpmPrimed: true, _taskIndex: null, _taskIndexFor: null,
    _ganttEditable: false, _ganttAutoGenAttempted: true, _ganttBoxH: 0, _ganttSelected: {}, _ganttCritical: {},
    CPM_COLOR_CRITICAL: '#e53935', CPM_COLOR_FLOAT: '#26a69a', PHASE_COLORS: {}, PHASE_INK: {}, PHASE_SHORT: {},
    _playing: false, _panel: null, _lastEdit: null, _GANTT_CACHE_VERSION: o.gcv || 0, _4dTemplate: null,
    _evMesh: null, _evSig: '', _incrPrimed: false, __idx: o.idx || null,
  };
  sb.window.window = sb.window;
  vm.createContext(sb);
  const rulerVar = (/^[ \t]*var _RULER_STEPS = \[[^\]]*\];/m.exec(tmSrc) || [''])[0];
  if (!rulerVar) throw new Error('_RULER_STEPS not found in the time_machine family');
  const code = [rulerVar].concat(SLICED.map(n => sliceFn(tmSrc, n))).concat([
    o.db ? sliceFn(tmSrc, 'buildTaskIndex') : 'function buildTaskIndex() { return __idx; }',
    'function renderAtTime(ms) { _prevCursor = _cursor; _cursor = ms; }',   // the cursor write only; no scene here
    'function wireGanttResize() {} function wireGanttRulerShift() {} function _tmAnnotateCpm() {} function _tmPersistEdit() {}',
    'function _tmRebuildXrayCache() {} function _tmSay() {} function setTimeout() {} function tickMs() { return 3200000; }',
    'this.__api = { loadOps: loadOps, computeDays: computeDays, updateStatus: updateStatus, anchorFromCursor: anchorFromCursor,',
    '  configSlider: configSlider, onSlide: onSlide, ganttRulerTicks: ganttRulerTicks, drawGanttMini: drawGanttMini,',
    '  commitGanttDrag: commitGanttDrag, invalidateGanttModel: invalidateGanttModel };',
  ]).join('\n');
  vm.runInContext(code, sb);
  const tm = { sb: sb, dom: dom, logs: logs, api: sb.__api };
  // draw(cursor) -> what the drawer drew: framed bar indices, bar rectangles, hairline x
  tm.draw = function (cursor) {
    sb._cursor = cursor;
    dom['tm-gantt-canvas'].ctx.__calls.length = 0; dom['tm-gantt-ruler'].ctx.__calls.length = 0;
    tm.api.drawGanttMini();
    const calls = dom['tm-gantt-canvas'].ctx.__calls, framed = {};
    calls.forEach(c => { if (c.m === 'strokeRect' && c.strokeStyle === '#ff8c00' && c.lineWidth === 1.5) framed[Math.round((c.a[1] - 2) / 14)] = true; });
    return { framed: framed, rects: sb.window.__tmGanttBars || [], hx: parseFloat(dom['tm-gantt-hair'].style.left), rulerCalls: dom['tm-gantt-ruler'].ctx.__calls };
  };
  tm.counter = function (cursor) {   // what the big counter shows at this cursor
    // updateStatus also walks every op to count "placed" for the status line; the counter does not read that walk,
    // so it runs over an empty list here (122K ops x hundreds of reads otherwise — minutes, for a text nobody judges)
    const keep = sb._ops; sb._ops = []; sb._cursor = cursor;
    try { tm.api.updateStatus(); } finally { sb._ops = keep; }
    const m = /(\d+)\D+(\d+)/.exec(dom['tm-big-counter'].textContent || '');
    return m ? { day: +m[1], hr: +m[2], text: dom['tm-big-counter'].textContent } : null;
  };
  tm.readSlider = function () { tm.api.anchorFromCursor(); tm.api.configSlider(); return { max: +dom['tm-slider'].max, value: +dom['tm-slider'].value }; };
  return tm;
}

// ── the checks, over whatever state a headless Gantt holds (used before and after an edit) ────
function barIndex(tm) {
  const sb = tm.sb, byGuid = {};
  sb._ops.forEach(op => { if (op.op_type === 'ELEMENT_PLACE' && op.output_guid) byGuid[op.output_guid] = op; });
  const bars = sb._ganttTasks.map(b => {
    const iv = []; (b.guids || []).forEach(g => { const op = byGuid[g]; if (op) iv.push([op[OP_START], op[OP_END]]); });
    iv.sort((x, y) => x[0] - y[0]);
    const starts = iv.map(x => x[0]), pmax = []; let mx = -Infinity;
    iv.forEach(x => { if (x[1] > mx) mx = x[1]; pmax.push(mx); });
    return { bar: b, iv: iv, starts: starts, pmax: pmax };
  });
  return { bars: bars, byGuid: byGuid };
}
function buildsAt(B, c) {   // §I "is it on screen at cursor?": some member has start <= c < end
  let lo = 0, hi = B.starts.length - 1, k = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (B.starts[mid] <= c) { k = mid; lo = mid + 1; } else hi = mid - 1; }
  return k >= 0 && B.pmax[k] > c;
}
function checkBars(tm, where, tag) {
  const sb = tm.sb, X = barIndex(tm);
  let nEl = 0, outside = 0, firstOut = '';
  let idle = 0, worst = { ms: 0, name: '' };
  X.bars.forEach(B => {
    const b = B.bar; let cov = 0, cur = b.startTs;
    B.iv.forEach(([s, e]) => { nEl++;
      if (!(b.startTs <= s && s < e && e <= b.endTs)) { outside++; if (!firstOut) firstOut = (b.taskId || b.phase) + ' el=[' + (s - b.startTs) + ',' + (e - b.endTs) + ']ms past [start,end]'; }
      const a = Math.max(s, cur), z = Math.min(e, b.endTs); if (z > a) cov += z - a; if (e > cur) cur = e; });
    const dead = (b.endTs - b.startTs) - cov;
    if (dead > B.iv.length) { idle++; }
    if (dead > worst.ms) worst = { ms: dead, name: b.taskId || (b.storey + '|' + b.phase) };
  });
  const r1 = claim('NS-1' + tag, where, nEl, outside, 'elements inside their own bar' + (firstOut ? ' — first: ' + firstOut : ''));
  const r2 = claim('NS-2' + tag, where, X.bars.length, idle, 'bars with idle time under the needle (> 1 ms per member); worst=' + worst.ms + 'ms ' + worst.name);
  return { X: X, nEl: nEl, outside: outside, idle: idle, ok: r1 === 'PASS' && r2 === 'PASS' };
}
function sliderStops(tm) {   // every DAY notch -> the cursor onSlide writes for it
  const sb = tm.sb, out = [];
  sb._mode = 'DAY';
  for (let i = 0; i < sb._days.length; i++) { tm.dom['tm-slider'].value = i; tm.api.onSlide(); out.push({ i: i, cursor: sb._cursor }); }
  return out;
}
function checkNeedle(tm, where, tag, X) {
  const sb = tm.sb, bars = X.bars;
  // NS-3 + NS-4b at every bar boundary, at slider stops, and at the playback bounds
  const stopsAll = sliderStops(tm), stops = stride(stopsAll, SAMPLE_CAP);
  const instants = [sb._projectStart, sb._projectEnd];
  bars.forEach(B => { instants.push(B.bar.startTs - 1, B.bar.startTs, B.bar.endTs - 1, B.bar.endTs); });
  stops.forEach(s => instants.push(s.cursor));
  let framedIdle = 0, buildUnframed = 0, hairOut = 0, framedN = 0, ex = '';
  instants.forEach(c => {
    const d = tm.draw(c);
    bars.forEach((B, i) => {
      const builds = buildsAt(B, c), framed = !!d.framed[i];
      if (framed) { framedN++; const r = d.rects[i]; if (!r || !(r.x - 1e-6 <= d.hx && d.hx <= r.x + r.w + 1e-6)) hairOut++; }
      if (framed && !builds) { framedIdle++; if (!ex) ex = 'framed but not building: ' + (B.bar.taskId || B.bar.phase) + ' at bar end ' + (c - B.bar.endTs) + 'ms'; }
      if (!framed && builds) { buildUnframed++; if (!ex) ex = 'building but not framed: ' + (B.bar.taskId || B.bar.phase); }
    });
  });
  claim('NS-3' + tag, where, instants.length * bars.length, framedIdle + buildUnframed,
    'instants=' + instants.length + ' (bar boundaries + ' + stops.length + ' of ' + stopsAll.length + ' slider stops) framedButIdle=' + framedIdle + ' buildingButUnframed=' + buildUnframed + (ex ? ' — ' + ex : ''));
  const firstStart = sb._ops.filter(o => o.op_type === 'ELEMENT_PLACE')[0][OP_START];
  const parkedHead = Math.max(0, sb._ganttAxisStart - firstStart), parkedTail = Math.max(0, sb._projectEnd - sb._ganttAxisEnd);
  claim('NS-4' + tag, where, 2 + framedN, (parkedHead ? 1 : 0) + (parkedTail ? 1 : 0) + hairOut,
    'needle parked while the canvas builds: head=' + parkedHead + 'ms tail=' + parkedTail + 'ms; hairline outside a framed bar=' + hairOut + ' of ' + framedN + ' frames');

  // NS-5 one day origin. P0 = the first instant any bar starts (the programme's day grid: bars sit on P0 + k days).
  let P0 = Infinity; bars.forEach(B => { if (B.bar.startTs < P0) P0 = B.bar.startTs; });
  const R = tm.api.ganttRulerTicks(600);
  let offGrid = 0, counterOff = 0, ex5 = '';
  R.ticks.forEach(t => {
    if ((t.ts - P0) % DAY !== 0) { offGrid++; if (!ex5) ex5 = 'tick d' + t.day + ' sits ' + ((t.ts - P0) % DAY) + 'ms off its day'; }
    const cn = tm.counter(t.ts);
    if (!cn || cn.day !== t.day || cn.hr !== 0) { counterOff++; if (!ex5) ex5 = 'at tick d' + t.day + ' the counter reads "' + (cn && cn.text) + '"'; }
  });
  let ladderOff = 0; sb._days.forEach(d => { if ((d - P0) % DAY !== 0) ladderOff++; });
  const startDays = {}; sb._ops.forEach(op => { if (op.op_type === 'ELEMENT_PLACE') startDays[Math.floor((op[OP_START] - P0) / DAY)] = true; });
  const ks = stride(Object.keys(startDays).map(Number).sort((a, b) => a - b), SAMPLE_CAP);
  let disagree = 0, exD = '';
  ks.forEach(k => { [6, 18].forEach(h => {
    const c = P0 + k * DAY + h * HOUR, cn = tm.counter(c);
    sb._cursor = c; const s = tm.readSlider(), notchDay = (sb._days[s.value] - P0) / DAY;
    if (!cn || cn.day !== k || notchDay !== k) { disagree++; if (!exD) exD = 'day ' + k + ' +' + h + 'h: counter "' + (cn && cn.text) + '", slider notch names day ' + (Math.round(notchDay * 1000) / 1000); }
  }); });
  claim('NS-5' + tag, where, R.ticks.length * 2 + sb._days.length + ks.length * 2, offGrid + counterOff + ladderOff + disagree,
    'ticks off the bar-day grid=' + offGrid + '/' + R.ticks.length + ' counter!=tick=' + counterOff + ' ladder days off the grid=' + ladderOff + '/' + sb._days.length +
    ' counter/slider disagree=' + disagree + '/' + (ks.length * 2) + (ex5 ? ' — ' + ex5 : '') + (exD ? ' — ' + exD : ''));
  return { P0: P0, stopsAll: stopsAll };
}
function checkRoundTrip(tm, where, P0) {
  const sb = tm.sb, sl = tm.dom['tm-slider'];
  let bad = 0, n = 0, ex = '';
  sb._mode = 'DAY';
  const idxs = stride(sb._days.map((d, i) => i), SAMPLE_CAP);
  idxs.forEach(i => { n++; sl.value = i; tm.api.onSlide(); const c = sb._cursor, back = tm.readSlider().value, cn = tm.counter(c);
    // a notch reads its own day; the one exception is the programme's last instant, which reads the whole days elapsed
    const k = (c === sb._projectEnd) ? Math.floor((c - P0) / DAY) : (sb._days[i] - P0) / DAY;
    if (back !== i || !cn || cn.day !== k) { bad++; if (!ex) ex = 'DAY notch ' + i + ' reads back ' + back + ', counter "' + (cn && cn.text) + '" for day ' + (Math.round(k * 1000) / 1000); } });
  const m = sb._days[Math.floor(sb._days.length / 2)];
  sb._mode = 'HR';
  for (let v = 0; v < 24; v++) { n++; sb._anchorDay = m; sl.value = v; tm.api.onSlide(); const c = sb._cursor, back = tm.readSlider().value, cn = tm.counter(c);
    if (back !== v || !cn || cn.hr !== v) { bad++; if (!ex || ex.indexOf('HR') < 0 && ex.length < 140) ex += (ex ? '; ' : '') + 'HR notch ' + v + ' reads back ' + back + ', counter "' + (cn && cn.text) + '"'; } }
  sb._mode = 'MIN';
  for (let v = 0; v < 60; v++) { n++; sb._anchorDay = m; sb._anchorHr = 5; sb._cursor = m + 5 * HOUR + 17 * 60000; sl.value = v; tm.api.onSlide(); const back = tm.readSlider().value;
    if (back !== v) { bad++; if (ex.indexOf('finest') < 0 && ex.length < 260) ex += (ex ? '; ' : '') + 'finest notch ' + v + ' reads back ' + back; } }
  sb._mode = 'DAY';
  claim('NS-6', where, n, bad, 'slider round trips (DAY ' + idxs.length + ' of ' + sb._days.length + ', HR 24, finest 60)' + (ex ? ' — ' + ex : ''));
}

// ── PART A — the persisted played layer, seven buildings ─────────────────────────────────────
function opsFromRun(run, play) {
  const ops = run.els.filter(e => play[e.guid]).map((e, i) => ({ id: i + 1, [OP_START]: play[e.guid].s, [OP_END]: play[e.guid].e, op_type: 'ELEMENT_PLACE',
    parameters: { _end_ts: play[e.guid].e, storey: e.storey, phase: e.phase, cls: e.cls, name: e.name }, input_guids: [], output_guid: e.guid }));
  ops.sort((a, b) => a[OP_START] - b[OP_START]);   // loadOps: ORDER BY timestamp
  return ops;
}
function idxFromRun(run) {   // the shape buildTaskIndex returns; NS-7a proves it equals the db's own on the edited building
  const base = Date.parse(CACHE.PROJECT_START + 'T00:00:00Z'), idx = { ok: true, scheduleId: 'SCH_AUTHORED', tasks: {}, guidTask: {}, n: 0 };
  run.tasks.forEach(t => { idx.tasks[t.id] = { id: t.id, name: t.id, start: isoDay(base + t.sDays * DAY), finish: isoDay(base + t.eDays * DAY) }; idx.n++;
    t.guids.forEach(g => { idx.guidTask[g] = t.id; }); });
  return idx;
}
function partA(bld, rules) {
  const run = CACHE.read(bld);
  if (!run) { claim('NS-0', bld, 0, 0, 'no persisted run for the current code — run scripts/cache_4d_run.js ' + bld); return null; }
  const L = CACHE.layerOf(run, 'played');
  if (L.missing) { claim('NS-0', bld, 0, 0, 'the persisted run carries no played layer'); return null; }
  console.log('§W_NS_BUILDING ' + bld + ' layer=' + L.id + ' elements=' + run.els.length + ' tasks=' + run.tasks.length + ' db=' + run.dbFile + ' run=' + path.basename(run.dir));
  const ops = opsFromRun(run, L.map), idx = idxFromRun(run);
  let bars0 = null;
  ZONES.forEach((tz, zi) => {
    process.env.TZ = tz;
    const where = bld + ' ' + tz;
    const tm = makeTM({ ops: ops.map(o => Object.assign({}, o)), idx: idx, bld: bld, rules: rules });
    tm.api.computeDays(); tm.draw(tm.sb._projectStart);
    const sb = tm.sb;
    if (zi === 0) {
      const inBar = {}; sb._ganttTasks.forEach(b => (b.guids || []).forEach(g => { inBar[g] = (inBar[g] || 0) + 1; }));
      const noBar = ops.filter(o => inBar[o.output_guid] !== 1).length, fromTask = sb._ganttTasks.filter(b => b.spanFrom === 'task').length;
      claim('NS-0', bld, ops.length + sb._ganttTasks.length + 2, noBar + (sb._ganttTasks.length - fromTask) + (OP_START === 'start_ts' && OP_END === 'end_ts' ? 0 : 1) + (FRONTIER_RULE_OK ? 0 : 1),
        'ops=' + ops.length + ' in loadOps names (' + OP_START + ',' + OP_END + ') elementsNotInExactlyOneBar=' + noBar + ' bars=' + sb._ganttTasks.length + ' spanFromTask=' + fromTask + ' frontierRuleInRenderAtTime=' + FRONTIER_RULE_OK);
      const cb = checkBars(tm, bld, '');
      // NS-R red controls, on copies
      const t2 = makeTM({ ops: ops.map(o => Object.assign({}, o)), idx: idx, bld: bld, rules: rules }); t2.api.computeDays(); t2.draw(t2.sb._projectStart);
      const b0 = t2.sb._ganttTasks.filter(b => b.guids && b.guids.length > 1)[0];
      const victim = t2.sb._ops.filter(o => o.output_guid === b0.guids[0])[0]; victim[OP_END] = b0.endTs + HOUR;
      const X2 = barIndex(t2); let out2 = 0; X2.bars.forEach(B => B.iv.forEach(([s, e]) => { if (!(B.bar.startTs <= s && s < e && e <= B.bar.endTs)) out2++; }));
      b0.endTs += 3 * DAY; let dead2 = 0; { const B = barIndex(t2).bars.filter(q => q.bar === b0)[0]; let cov = 0, cur = b0.startTs; B.iv.forEach(([s, e]) => { const a = Math.max(s, cur), z = Math.min(e, b0.endTs); if (z > a) cov += z - a; if (e > cur) cur = e; }); dead2 = (b0.endTs - b0.startTs) - cov; }
      claim('NS-R', bld, 2, (out2 >= 1 ? 0 : 1) + (dead2 > b0.guids.length ? 0 : 1), 'red controls: an element pushed 1 h past its bar is counted (' + out2 + '), a bar stretched 3 days is counted idle (' + dead2 + 'ms)');
      bars0 = cb;
    }
    const X = barIndex(tm);
    const nd = checkNeedle(tm, where, '', X);
    checkRoundTrip(tm, where, nd.P0);
    console.log('§W_NS_STATE ' + where + ' firstStart-projectStart=' + (ops[0][OP_START] - sb._projectStart) + 'ms axisStart-firstStart=' + (sb._ganttAxisStart - ops[0][OP_START]) +
      'ms axisEnd-projectEnd=' + (sb._ganttAxisEnd - sb._projectEnd) + 'ms ladderDays=' + sb._days.length + ' ladder[0]-firstBarStart=' + ((sb._days[0] - nd.P0) / HOUR) + 'h');
  });
  return { run: run, ops: ops, idx: idx };
}

// ── PART B — NS-7: the shipped commit path on a real building db ─────────────────────────────
async function partB(bld, rulesJsonRules, A) {
  const where0 = bld + ' edit';
  const dbf = CACHE.resolveDbFile(bld);
  if (!dbf.path || !A) { claim('NS-7', where0, 0, 0, 'no db or no persisted run for ' + bld + ' — the edit chain judged nothing'); return; }
  const SG = require(path.join(V, 'schedule_gate.js')); global.ScheduleGate = SG;
  const SA = require(path.join(V, 'schedule_author.js'));
  const SS = require(path.join(V, 'support_sweep.js')); global.SupportSweep = SS;
  const CP = require(path.join(V, 'cpm_schedule.js')); global.CpmSchedule = CP;
  global.GanttModel = GM;
  globalThis.RoomWalker = require(path.join(V, 'lib', 'room_walker.js'));
  globalThis.LevelDeriver = require(path.join(V, 'lib', 'level_deriver.js'));
  globalThis.LocationAxis = require(path.join(V, 'location_axis.js'));
  const TMP = require(path.join(ROOT, 'scripts', 'lib', 'tm_played_layer.js'));
  const T = JSON.parse(__readSrc(path.join(V, 'rates', '4D_template.json'), 'utf8'));
  const rsb = { console: { log() {}, warn() {}, error() {} } }; vm.createContext(rsb); vm.runInContext(__readSrc(path.join(V, 'rates.js'), 'utf8'), rsb);
  const gcv = +((/var _GANTT_CACHE_VERSION = (\d+);/.exec(tmSrc) || [])[1] || 0);
  const initSqlJs = require(path.join(ROOT, 'modeller', 'lib', 'sql-wasm.js'));
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(ROOT, 'modeller', 'lib', 'sql-wasm.wasm')) });
  const db0 = new SQL.Database(new Uint8Array(fs.readFileSync(dbf.path)));
  // the cache build's own chain (scripts/cache_4d_run.js build()), with the pipeline's §-log left on the terminal
  const tmsb = TMP.buildSandbox({ tmSrc: tmSrc, SA: SA, SG: SG, CP: CP, GM: GM, SS: SS, LABOR_RATES: rsb.LABOR_RATES, console: console });
  const base = { start: CACHE.PROJECT_START, laborRates: rsb.LABOR_RATES, rates: rsb.RATES, nameOverrides: rsb.SEQUENCE_NAME_OVERRIDES,
    defaultRule: rsb.SEQUENCE_DEFAULT, scheduleGate: SG, shiftHours: T.calendar.hours_per_shift, template: T, db: db0,
    displayRemap: tmsb._tmDisplayRemap, genVersion: gcv };
  const rawEls = SA._buildScheduleElements(db0, rsb.SEQUENCE_RULES, base);
  globalThis.APP = { db: db0 };
  const res = SA.materializeZones(db0, rsb.SEQUENCE_RULES, base);
  delete globalThis.APP;
  const tasks = res && res.tasks ? res.tasks.map(t => ({ id: t.id, sDays: t.sDays, eDays: t.eDays, phase: t.phase, storey: t.storey, guids: t.guids })) : null;
  const mp = tasks ? TMP.mirrorInjectGantt({ sb: tmsb, elements: rawEls, tasks: tasks, db: db0, startISO: base.start, applyTiling: true, log: console.log }) : { ok: false, reason: 'no tasks' };
  if (!mp.ok) { claim('NS-7', where0, 0, 0, 'the chain produced no played layer: ' + mp.reason); return; }
  const persisted = CACHE.layerOf(A.run, 'played').map; let diff = 0, nP = 0;
  for (const g in mp.play) { nP++; const p = persisted[g]; if (!p || p.s !== mp.play[g].s || p.e !== mp.play[g].e) diff++; }
  db0.run('CREATE TABLE IF NOT EXISTS kernel_ops (id INTEGER PRIMARY KEY, timestamp INTEGER NOT NULL, op_type TEXT NOT NULL, parameters TEXT NOT NULL, input_guids TEXT, output_guid TEXT, undone INTEGER DEFAULT 0)');
  db0.run("DELETE FROM kernel_ops WHERE op_type='ELEMENT_PLACE'");
  const ins = db0.prepare('INSERT INTO kernel_ops (timestamp,op_type,parameters,input_guids,output_guid,undone) VALUES(?,?,?,?,?,0)');
  db0.run('BEGIN');
  rawEls.forEach(e => { const p = mp.play[e.guid]; if (!p) return;
    ins.run([p.s, 'ELEMENT_PLACE', JSON.stringify({ _end_ts: p.e, storey: e.storey, phase: e.phase, cls: e.cls, name: e.name || '' }), '[]', e.guid]); });
  db0.run('COMMIT'); ins.free();
  const bytes = db0.export(); db0.close();

  ZONES.forEach((tz, zi) => {
    process.env.TZ = tz;
    const where = bld + ' ' + tz;
    const db = new SQL.Database(bytes);
    const tm = makeTM({ db: db, bld: bld, SA: SA, rules: rulesJsonRules, gcv: gcv });
    const sb = tm.sb;
    sb._ops = tm.api.loadOps().filter(o => o.op_type === 'ELEMENT_PLACE');
    tm.api.computeDays(); tm.draw(sb._projectStart);
    if (zi === 0) {
      // NS-7a: this db-backed Gantt is the SAME model part A judged from the persisted run
      const ta = makeTM({ ops: A.ops.map(o => Object.assign({}, o)), idx: A.idx, bld: bld, rules: rulesJsonRules }); ta.api.computeDays(); ta.draw(ta.sb._projectStart);
      const key = b => b.taskId + '|' + b.startTs + '|' + b.endTs + '|' + b.count;
      const sa = ta.sb._ganttTasks.map(key).sort().join('\n'), sd = sb._ganttTasks.map(key).sort().join('\n');
      claim('NS-7a', where0, nP + sb._ganttTasks.length, diff + (sa === sd ? 0 : 1), 'the edit fixture is the persisted played layer (instants differing=' + diff + '/' + nP + ') and its bars from the db\'s own task index equal part A\'s (' + (sa === sd) + ', bars=' + sb._ganttTasks.length + ', regenLines=' + tm.logs.filter(l => l.indexOf('§GANTT_SCHEDULE_STALE_REGEN') === 0).length + ')');
    }
    const edits = [
      { name: 'move +10d the last bar', pick: bars => bars.slice().sort((a, b) => b.endTs - a.endTs)[0], mode: 'move', delta: () => 10, cursor: () => sb._projectEnd - HOUR },
      { name: 'resize the largest bar by -30%', pick: bars => bars.slice().sort((a, b) => b.count - a.count)[0], mode: 'resizeR',
        delta: b => -Math.max(1, Math.round(0.3 * (b.endTs - b.startTs) / DAY)), cursor: () => sb._projectStart + Math.floor((sb._projectEnd - sb._projectStart) / 2) },
    ];
    edits.forEach((ed, ei) => {
      const tag = '/' + (ei + 1);
      const bar = ed.pick(sb._ganttTasks.filter(b => b.taskId && b.guids && b.guids.length)), delta = ed.delta(bar);
      sb._cursor = ed.cursor(); const before = tm.readSlider(), c0 = sb._cursor, endBefore = sb._projectEnd, barBefore = bar.startTs + '..' + bar.endTs;
      tm.logs.length = 0;
      const ok = tm.api.commitGanttDrag(bar, ed.mode, delta);
      const commitLine = tm.logs.filter(l => l.indexOf('§GANTT_DRAG_COMMIT') === 0 || l.indexOf('§GANTT_DRAG_REJECT') === 0 || l.indexOf('§TM_EDIT_EXCEPTION') === 0)[0] || '(no commit line)';
      console.log('§W_NS_EDIT ' + where + ' ' + ed.name + ' task=' + bar.taskId + ' delta=' + delta + 'd committed=' + (ok === true) + ' | ' + commitLine);
      if (ok !== true) { claim('NS-7' + tag, where, 0, 0, 'the edit did not commit — nothing judged'); return; }
      const left = { max: +tm.dom['tm-slider'].max, value: +tm.dom['tm-slider'].value };   // the slider as the commit left it
      const nb = sb._ganttTasks.filter(b => b.taskId === bar.taskId)[0];
      const movedOk = nb && (nb.startTs + '..' + nb.endTs) !== barBefore;
      const fresh = tm.readSlider();
      const changed = fresh.max !== before.max || fresh.value !== before.value;
      claim('NS-7' + tag, where, changed ? 2 : 0, (left.max !== fresh.max ? 1 : 0) + (left.value !== fresh.value ? 1 : 0),
        ed.name + ': bar ' + barBefore + ' -> ' + (nb ? nb.startTs + '..' + nb.endTs : 'gone') + ' (moved=' + movedOk + ') cursor unchanged=' + (sb._cursor === c0) +
        ' projectEnd ' + (sb._projectEnd - endBefore) / DAY + 'd; slider before=' + JSON.stringify(before) + ' leftByCommit=' + JSON.stringify(left) + ' freshRead=' + JSON.stringify(fresh) +
        (changed ? '' : ' — the edit did not change what the slider should read'));
      const cb = checkBars(tm, where, tag);
      const nd = checkNeedle(tm, where, tag, cb.X);
    });
    db.close();
  });
}

(async () => {
  const rulesJson = JSON.parse(__readSrc(path.join(V, 'rates', 'sequence_rules.json'), 'utf8'));
  const rules = rulesJson.SEQUENCE_RULES || rulesJson;
  const list = process.argv.slice(2).filter(a => a[0] !== '-');
  const blds = list.length ? list : ['Duplex', 'HHS_Office_Federated', 'Hospital', 'Terminal', 'Clinic', 'JKR', 'LTU_AHouse'];
  process.env.TZ = 'UTC'; const h0 = new Date(0).getHours(); process.env.TZ = 'Asia/Kuala_Lumpur'; const h8 = new Date(0).getHours();
  console.log('§W_NS_ZONES ' + ZONES.join(',') + ' zoneSwitchWorks=' + (h0 === 0 && h8 === 7 || h0 === 0 && h8 === 8) + ' (hour of epoch 0: UTC=' + h0 + ' Kuala_Lumpur=' + h8 + ')');
  if (h0 === h8) { claim('NS-TZ', 'process', 0, 0, 'this node cannot switch time zone at run time — zone claims would all be one zone'); }
  const A = {};
  for (const b of blds) A[b] = partA(b, rules);
  if (blds.indexOf(NS_BLD) >= 0 || process.env.NS_BLD) { if (!A[NS_BLD]) A[NS_BLD] = partA(NS_BLD, rules); await partB(NS_BLD, rules, A[NS_BLD]); }
  else console.log('§W_NS NS-7 not run: ' + NS_BLD + ' is not in the building list');
  console.log('§W_NS_SUMMARY pass=' + pass + ' fail=' + fail + ' inconclusive=' + inconclusive);
  if (fail) { console.error('FAIL — ' + fail + ' claim(s) failed'); process.exit(1); }
  if (!pass || inconclusive) { console.log('INCONCLUSIVE — ' + inconclusive + ' claim(s) judged nothing'); process.exit(2); }
  console.log('PASS — bars, frame, hairline, ruler, counter and slider read the instant the canvas builds, before and after an edit');
})().catch(e => { console.error('§W_NS_ERROR ' + (e && e.stack || e)); process.exit(3); });
