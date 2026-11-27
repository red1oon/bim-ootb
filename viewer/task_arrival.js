// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — SPEC: bim-compiler prompts/MOBILE_PERF.md WO-13 "Arrival: which task card comes up, as one pure function"
//   (+ the designer's additions of 2026-11-28: per-ELEMENT arrival). Witness: viewer/tests/witness_task_arrival.js (W-TASK-ARRIVAL).
// ISSUE: a site person walks the model; the card of the task assigned to them must come up where its work is, once, and not
//        again while they stand there. A task's elements are every element of the project line's item within the pushed set
//        (possibly many, e.g. every door), so arrival is tracked PER ELEMENT, not per task.
// WHAT:  two pure functions, no DOM, no THREE, no network; the caller owns sampling (walk.js _walkTraceMark) and the task source.
//   tasks  = [{ id, radius_m (number|null), qr (string|null), elements: [{ guid, storey, x, y }] }]   (model coordinates)
//   sample = { x, y, storey }   state = opaque object returned and passed back (start with {}); never mutated here.
//   arrive(sample, tasks, state)        -> { show: [{ taskId, guid, by:'distance', d_m }], state, scan:{tasks,with_radius,no_radius,shown} }
//     per task WITH a radius: among its elements on the sample's storey (string compare) whose horizontal Euclidean distance
//     is <= radius_m, take the NEAREST ARMED one (tie: lexically smallest guid); show it (at most one card per task per call)
//     and mark it shown. An element re-arms only after a sample where it is outside the radius or on another storey. An element
//     inside but not the nearest stays armed and may show on a later sample once it is the nearest armed one.
//     NO DEFAULT RADIUS: radius_m null/absent/<=0/non-finite -> the task never shows by distance and is counted in no_radius.
//   arriveBy(kind, payload, tasks, state) -> same shape; kind 'qr' (payload = scanned string, task.qr equals it exactly) or
//     'manual' (payload = taskId); by = 'qr'|'manual', guid = null, d_m = null; no element's armed state changes.
// LOG:   §TASK_ARRIVE task= guid= by= d_m= radius_m= storey=   and   §TASK_ARRIVE_SCAN tasks= with_radius= no_radius= shown=
// Storeys are NOT derived here: the caller maps the walker's height to a storey (A.walkStoreyLevels, viewer/walk.js).
(function (root) {
  'use strict';

  function _radiusOk(r) { return typeof r === 'number' && isFinite(r) && r > 0; }
  function _num(v) { return typeof v === 'number' && isFinite(v); }
  function _key(taskId, guid) { return String(taskId) + '\u0000' + String(guid); }
  function _copyState(state) {
    var s = { shown: {} }, src = state && state.shown;
    if (src) for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k)) s.shown[k] = true;
    return s;
  }
  function _f3(n) { return _num(n) ? n.toFixed(3) : 'null'; }

  function _scan(tasks, shown) {
    var withR = 0, noR = 0, i;
    for (i = 0; i < tasks.length; i++) { if (_radiusOk(tasks[i] && tasks[i].radius_m)) withR++; else noR++; }
    return { tasks: tasks.length, with_radius: withR, no_radius: noR, shown: shown };
  }
  function _logScan(scan) {
    console.log('§TASK_ARRIVE_SCAN tasks=' + scan.tasks + ' with_radius=' + scan.with_radius + ' no_radius=' + scan.no_radius + ' shown=' + scan.shown);
  }

  function arrive(sample, tasks, state) {
    tasks = Array.isArray(tasks) ? tasks : [];
    var next = _copyState(state), show = [];
    var sOk = !!sample && _num(sample.x) && _num(sample.y) && sample.storey != null;
    for (var t = 0; t < tasks.length; t++) {
      var task = tasks[t];
      if (!task || !_radiusOk(task.radius_m)) continue;
      var els = Array.isArray(task.elements) ? task.elements : [], best = null;
      for (var e = 0; e < els.length; e++) {
        var el = els[e], k = _key(task.id, el.guid), d = null, inside = false;
        if (sOk && _num(el.x) && _num(el.y)) {
          var dx = el.x - sample.x, dy = el.y - sample.y;
          d = Math.sqrt(dx * dx + dy * dy);
          inside = String(el.storey) === String(sample.storey) && d <= task.radius_m;   // R1 marker: storey test
        }
        if (!inside) { delete next.shown[k]; continue; }                                  // re-arm: outside the radius / other storey
        if (next.shown[k]) continue;                                                      // R2 marker: armed test
        if (!best || d < best.d || (d === best.d && String(el.guid) < String(best.guid))) best = { guid: el.guid, d: d, k: k };
      }
      if (best) {
        next.shown[best.k] = true;
        show.push({ taskId: task.id, guid: best.guid, by: 'distance', d_m: best.d });
        console.log('§TASK_ARRIVE task=' + task.id + ' guid=' + best.guid + ' by=distance d_m=' + _f3(best.d) + ' radius_m=' + task.radius_m + ' storey=' + sample.storey);
      }
    }
    var scan = _scan(tasks, show.length);
    _logScan(scan);
    return { show: show, state: next, scan: scan };
  }

  function arriveBy(kind, payload, tasks, state) {
    tasks = Array.isArray(tasks) ? tasks : [];
    var show = [];
    if (kind === 'qr' || kind === 'manual') {
      for (var t = 0; t < tasks.length; t++) {
        var task = tasks[t];
        if (!task) continue;
        var hit = kind === 'qr'
          ? (typeof payload === 'string' && payload !== '' && typeof task.qr === 'string' && task.qr === payload)
          : (payload != null && task.id != null && String(task.id) === String(payload));
        if (!hit) continue;
        show.push({ taskId: task.id, guid: null, by: kind, d_m: null });
        console.log('§TASK_ARRIVE task=' + task.id + ' guid=null by=' + kind + ' d_m=null radius_m=' + (task.radius_m == null ? 'null' : task.radius_m) + ' storey=null');
      }
    }
    var scan = _scan(tasks, show.length);
    _logScan(scan);
    return { show: show, state: _copyState(state), scan: scan };
  }

  var api = { arrive: arrive, arriveBy: arriveBy };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.TaskArrival = api;
})(typeof window !== 'undefined' ? window : null);
