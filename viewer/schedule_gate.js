/* schedule_gate.js — §gate (2026-05-30, XY-aware)
 * Support-gate FALLBACK scheduler for generated 4D (Time Machine). Pure + app-agnostic so the
 * browser (time_machine.js) and the Node witness (tests/test_schedule_gate.js) run the SAME code.
 *
 * THE RULE: an element cannot start until the structure PHYSICALLY UNDER IT — a load-bearing element
 * whose XY footprint overlaps and whose base sits below — has finished. "Build from below, at this
 * XY location." Replaces center-Z banding (floated beams) AND the first Z-only gate (which still
 * floated 84 beams + 765 members on Hospital, because it waited for the latest structure at that Z
 * ANYWHERE, not the column actually under the beam). XY-aware → 0 floats. Witnessed on real geometry.
 *
 * Scope: GENERATED fallback only. Captured IFC 4D is absorbed verbatim by the overlay AFTER this.
 * No CPM / dependency / resource leveling — that's the planner's (MS Project's) job.
 */
(function (global) {
  'use strict';
  var CELL = 4;     // m — XY grid cell for the spatial support index
  var EPS  = 0.5;   // m — a support must start at least this far below me (excludes same-level peers)
  var AUD_TOL = 1.0;// m — audit: a support tops within this of my base (the thing I bear on)

  function cellsOf(e) {
    var o = [], i, j;
    for (i = Math.floor(e.x0 / CELL); i <= Math.floor(e.x1 / CELL); i++)
      for (j = Math.floor(e.y0 / CELL); j <= Math.floor(e.y1 / CELL); j++) o.push(i + ',' + j);
    return o;
  }
  function overlap(a, b) { return a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0; }

  // elements: [{ guid, x0,x1,y0,y1, base_z, top_z, seq, resource, installSecs }] (seq<=4 = load-bearing)
  // returns { guid: { start, end } } in ms. Bottom-up; each element waits for the XY-overlapping
  // structure rising from below it (the columns/walls/slabs actually under its footprint).
  function computeSchedule(elements, baseMs, scaleFactor) {
    baseMs = baseMs || 0; scaleFactor = scaleFactor || 1;
    var ordered = elements.slice().sort(function (a, b) {
      return (a.base_z - b.base_z) || (a.seq - b.seq);
    });
    var grid = {};   // "i,j" -> [{x0,x1,y0,y1,base_z,end}]  (scheduled STRUCTURAL only)
    var rc = {};     // resource|level -> crew cursor (light serialisation, keeps the frontier thin)
    var out = {};
    for (var n = 0; n < ordered.length; n++) {
      var el = ordered[n];
      var g = 0, cs = cellsOf(el), c, arr, k, S;
      for (c = 0; c < cs.length; c++) {
        arr = grid[cs[c]]; if (!arr) continue;
        for (k = 0; k < arr.length; k++) {
          S = arr[k];
          if (S.base_z < el.base_z - EPS && S.end > g && overlap(S, el)) g = S.end;
        }
      }
      var rk = el.resource + '|' + Math.floor(el.top_z / 3);
      var earliest = rc[rk] || baseMs;
      if (g > earliest) earliest = g;
      var dur = Math.round((el.installSecs || 120) * scaleFactor * 1000);
      var end = earliest + dur;
      out[el.guid] = { start: earliest, end: end };
      rc[rk] = end;
      if (el.seq <= 4) {
        var rec = { x0: el.x0, x1: el.x1, y0: el.y0, y1: el.y1, base_z: el.base_z, end: end };
        for (c = 0; c < cs.length; c++) (grid[cs[c]] = grid[cs[c]] || []).push(rec);
      }
    }
    return out;
  }

  // Collapse sub-storeys onto their Level so the phase list stays ~8 bars (user: "collapsing is better").
  function collapsePhase(storey) {
    if (!storey) return '_UNKNOWN';
    var s = String(storey).replace(/\s+(Ceiling|TOS|Top of Steel|Soffit|Slab)\b.*$/i, '').trim();
    return s || String(storey);
  }

  // Independent XY-aware audit: count target elements that start before a TRUE support finishes — a
  // structural element XY-overlapping, rising >1m from below, topping within AUD_TOL of the target's
  // base (the thing it bears on). Returns the violation count. 0 ⇒ nothing floats over its support.
  function auditFloating(elements, sched, classFilter) {
    var grid = {}, i, c, cs;
    for (i = 0; i < elements.length; i++) {
      var e = elements[i];
      if (e.seq <= 4) { cs = cellsOf(e); for (c = 0; c < cs.length; c++) (grid[cs[c]] = grid[cs[c]] || []).push(e); }
    }
    var v = 0;
    for (i = 0; i < elements.length; i++) {
      var T = elements[i];
      if (classFilter && !classFilter(T)) continue;
      var se = 0, seen = {}, k, arr, S; cs = cellsOf(T);
      for (c = 0; c < cs.length; c++) {
        arr = grid[cs[c]]; if (!arr) continue;
        for (k = 0; k < arr.length; k++) {
          S = arr[k]; if (seen[S.guid] || S.guid === T.guid) continue; seen[S.guid] = 1;
          if (S.base_z < T.base_z - 1.0 && S.top_z <= T.base_z + AUD_TOL && overlap(S, T)) {
            var en = sched[S.guid].end; if (en > se) se = en;
          }
        }
      }
      if (se > 0 && sched[T.guid].start < se - 1) v++;
    }
    return v;
  }

  var API = { computeSchedule: computeSchedule, collapsePhase: collapsePhase, auditFloating: auditFloating, CELL: CELL };
  global.ScheduleGate = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
