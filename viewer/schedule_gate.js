/* schedule_gate.js — §gate (2026-05-30, two-pass: geometry + trade order)
 * Support-gate FALLBACK scheduler for generated 4D (Time Machine) = "synthetic 4D" organised by
 * phase/task, the same shape a captured MS Project / IFC programme would have. Pure + app-agnostic
 * so the browser (time_machine.js) and the Node witness (tests/test_schedule_gate.js) run identical code.
 *
 * TWO RULES, two passes:
 *   PASS A — STRUCTURE (seq<=4), bottom-up by base_z: an element waits for the structure whose XY
 *            footprint overlaps it and whose base is below ("build from below, at this location").
 *            Eliminates floating beams/members/slabs.
 *   PASS B — NON-STRUCTURE (seq>4), by trade then base_z: each item waits for (1) the structure under
 *            its footprint (no floating furniture/MEP) AND (2) the lower trades in its own Level/phase
 *            (so MEP is late and furniture is last, per Level).
 *
 * ε = 0.05m: a support need only start just below me — the thin slab a chair/duct sits on (~0.2m
 * below) counts. (ε=0.5 wrongly skipped it → furniture/flow floated.) Scope: GENERATED fallback only;
 * captured IFC 4D is absorbed verbatim by the overlay AFTER this. No CPM/dependency solving (planner's).
 */
(function (global) {
  'use strict';
  var CELL = 4;     // m — XY grid cell for the spatial support index
  var EPS  = 0.05;  // m — a support must start at least this far below me (excludes same-level peers)
  var GAP  = 0.5;   // m — audit: a support tops within this of my base (the thing I bear on)

  function cellsOf(e) {
    var o = [], i, j;
    for (i = Math.floor(e.x0 / CELL); i <= Math.floor(e.x1 / CELL); i++)
      for (j = Math.floor(e.y0 / CELL); j <= Math.floor(e.y1 / CELL); j++) o.push(i + ',' + j);
    return o;
  }
  function overlap(a, b) { return a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0; }

  // Collapse sub-storeys onto their Level so the phase list stays ~8 (user: "collapsing is better").
  // "Level 3 Ceiling" / "Level 3 TOS" -> "Level 3". Also the JSON phase key + the trade-gate group.
  function collapsePhase(storey) {
    if (!storey) return '_UNKNOWN';
    var s = String(storey).replace(/\s+(Ceiling|TOS|Top of Steel|Soffit|Slab)\b.*$/i, '').trim();
    return s || String(storey);
  }

  // elements: [{ guid, x0,x1,y0,y1, base_z, top_z, seq, storey, resource, installSecs }] (seq<=4 = structure)
  // returns { guid: { start, end } } ms.
  function computeSchedule(elements, baseMs, scaleFactor) {
    baseMs = baseMs || 0; scaleFactor = scaleFactor || 1;
    var grid = {}, out = {}, c, cs, k, arr, S;
    function geoGate(el) {                 // latest finish of XY-overlapping structure rising from below
      var g = baseMs; cs = cellsOf(el);
      for (c = 0; c < cs.length; c++) { arr = grid[cs[c]]; if (!arr) continue;
        for (k = 0; k < arr.length; k++) { S = arr[k];
          if (S.base_z < el.base_z - EPS && S.end > g && overlap(S, el)) g = S.end; } }
      return g;
    }
    function place(el, start) {
      var dur = Math.round((el.installSecs || 120) * scaleFactor * 1000);
      var end = start + dur; out[el.guid] = { start: start, end: end };
      if (el.seq <= 4) { var rec = { x0: el.x0, x1: el.x1, y0: el.y0, y1: el.y1, base_z: el.base_z, end: end };
        cs = cellsOf(el); for (c = 0; c < cs.length; c++) (grid[cs[c]] = grid[cs[c]] || []).push(rec); }
      return end;
    }
    // PASS A — structure, bottom-up by base_z (supports scheduled before what rests on them)
    var struct = elements.filter(function (e) { return e.seq <= 4; })
      .sort(function (a, b) { return (a.base_z - b.base_z) || (a.seq - b.seq); });
    var rcA = {};
    struct.forEach(function (el) {
      var rk = el.resource + '|' + Math.floor(el.top_z / 3);
      var start = Math.max(geoGate(el), rcA[rk] || baseMs);
      rcA[rk] = place(el, start);
    });
    // PASS B — non-structure, by trade then base_z, on the COMPLETED structure grid.
    // Per-Level trade gate: trade k waits for all lower trades (s<k) in its Level → MEP late, furniture last.
    var nonst = elements.filter(function (e) { return e.seq > 4; })
      .sort(function (a, b) { return (a.seq - b.seq) || (a.base_z - b.base_z); });
    var phaseTrade = {}, rcB = {};
    nonst.forEach(function (el) {
      var ph = collapsePhase(el.storey);
      var pt = phaseTrade[ph] || {}, tg = baseMs, s;
      for (s in pt) if (+s < el.seq && pt[s] > tg) tg = pt[s];
      var rk = el.resource + '|' + ph;
      var start = Math.max(geoGate(el), tg, rcB[rk] || baseMs);
      var end = place(el, start);
      rcB[rk] = end;
      (phaseTrade[ph] = phaseTrade[ph] || {});
      if (!(phaseTrade[ph][el.seq] > end)) phaseTrade[ph][el.seq] = end;
    });
    return out;
  }

  // Pick the elements assigned to a JSON phase/task. phaseKey = collapsed Level name; optional seq
  // (trade) narrows to a task within the phase. The seam to captured tasks AND to MSP/MSPDI export.
  function elementsInPhase(elements, phaseKey, seq) {
    return elements.filter(function (e) {
      return collapsePhase(e.storey) === phaseKey && (seq == null || e.seq === seq);
    });
  }

  // Independent audit: count elements that start before a TRUE support finishes — structural,
  // XY-overlapping, rising from below (base < base-ε), topping within GAP of the target base.
  // 0 ⇒ nothing floats over its physical support. Works for any class (beams, furniture, MEP…).
  function auditFloating(elements, sched, classFilter) {
    var grid = {}, i, c, cs, k, arr, S;
    for (i = 0; i < elements.length; i++) { var e = elements[i];
      if (e.seq <= 4) { cs = cellsOf(e); for (c = 0; c < cs.length; c++) (grid[cs[c]] = grid[cs[c]] || []).push(e); } }
    var v = 0;
    for (i = 0; i < elements.length; i++) { var T = elements[i];
      if (classFilter && !classFilter(T)) continue;
      var se = 0, seen = {}; cs = cellsOf(T);
      for (c = 0; c < cs.length; c++) { arr = grid[cs[c]]; if (!arr) continue;
        for (k = 0; k < arr.length; k++) { S = arr[k]; if (seen[S.guid] || S.guid === T.guid) continue; seen[S.guid] = 1;
          if (S.base_z < T.base_z - EPS && S.top_z >= T.base_z - GAP && overlap(S, T)) {
            var en = sched[S.guid].end; if (en > se) se = en; } } }
      if (se > 0 && sched[T.guid].start < se - 1) v++;
    }
    return v;
  }

  var API = { computeSchedule: computeSchedule, collapsePhase: collapsePhase, elementsInPhase: elementsInPhase, auditFloating: auditFloating, CELL: CELL };
  global.ScheduleGate = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
