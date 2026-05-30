/* schedule_gate.js — §gate (2026-05-30)
 * Support-gate FALLBACK scheduler for generated 4D (Time Machine). Pure + app-agnostic so the
 * browser (time_machine.js) and the Node witness (tests/test_schedule_gate.js) run the SAME code.
 *
 * THE RULE: an element cannot start until the structure that physically holds it up — a load-bearing
 * element that TOPS OUT within ±TOL of the element's base_z and rises from below — has finished.
 * Replaces the old center-Z banding ("band N waits N-1") that floated beams above still-building
 * tall columns (Hospital columns avg 6.87m vs 3m bands → the band under a beam was often empty).
 *
 * Scope: GENERATED fallback only. Captured IFC 4D is absorbed verbatim by the overlay AFTER this.
 * No CPM / dependency / resource leveling — that's the planner's (MS Project's) job, absorbed verbatim.
 */
(function (global) {
  'use strict';
  var TOL = 0.5;   // m — a support topping within ±TOL of my base_z carries me
  var BW  = 0.5;   // m — top_z bucket width for the support index

  // elements: [{ guid, base_z, top_z, seq, resource, installSecs }]  (seq<=4 = load-bearing structure)
  // returns { guid: { start, end } } in ms, gated bottom-up.
  function computeSchedule(elements, baseMs, scaleFactor) {
    baseMs = baseMs || 0; scaleFactor = scaleFactor || 1;
    // bottom-up: a support (lower base) is scheduled before what rests on it, so its finish is known
    var ordered = elements.slice().sort(function (a, b) {
      return (a.base_z - b.base_z) || (a.seq - b.seq) || (a.top_z - b.top_z);
    });
    var bucketEnd = {};   // floor(top_z/BW) -> latest STRUCTURAL finish topping in that 0.5m slice
    var rc = {};          // resource|level -> crew cursor (light serialisation, keeps frontier thin)
    var out = {};
    function gate(baseZ) {  // latest finish among structure topping within ±TOL of baseZ
      var g = 0, lo = Math.floor((baseZ - TOL) / BW), hi = Math.floor((baseZ + TOL) / BW);
      for (var k = lo; k <= hi; k++) if (bucketEnd[k] > g) g = bucketEnd[k];
      return g;
    }
    for (var i = 0; i < ordered.length; i++) {
      var el = ordered[i];
      var rk = el.resource + '|' + Math.floor(el.top_z / 3);
      var earliest = rc[rk] || baseMs;
      var g = gate(el.base_z); if (g > earliest) earliest = g;
      var dur = Math.round((el.installSecs || 120) * scaleFactor * 1000);
      var end = earliest + dur;
      out[el.guid] = { start: earliest, end: end };
      rc[rk] = end;
      if (el.seq <= 4) {                       // only structure carries load
        var bk = Math.floor(el.top_z / BW);
        if (!(bucketEnd[bk] > end)) bucketEnd[bk] = end;
      }
    }
    return out;
  }

  // Collapse sub-storeys onto their Level so the phase list stays ~8 bars (user: "collapsing is better").
  // "Level 3 Ceiling" / "Level 3 TOS" / "Level 3 Soffit" -> "Level 3".
  function collapsePhase(storey) {
    if (!storey) return '_UNKNOWN';
    var s = String(storey).replace(/\s+(Ceiling|TOS|Top of Steel|Soffit|Slab)\b.*$/i, '').trim();
    return s || String(storey);
  }

  // Independent runtime audit: count target elements that start before a TRUE support finishes.
  // A true support = structural element topping within ±TOL of the target base AND rising >1m from
  // below (a column/wall, not a same-level peer). Returns the violation count. 0 ⇒ Z order solved.
  function auditFloating(elements, sched, classFilter) {
    var sup = {};   // floor(top_z/BW) -> [{ base_z, end, guid }]
    for (var i = 0; i < elements.length; i++) {
      var e = elements[i];
      if (e.seq <= 4) {
        var bk = Math.floor(e.top_z / BW);
        (sup[bk] = sup[bk] || []).push({ base_z: e.base_z, end: sched[e.guid].end, guid: e.guid });
      }
    }
    var v = 0;
    for (var j = 0; j < elements.length; j++) {
      var T = elements[j];
      if (classFilter && !classFilter(T)) continue;
      var se = 0, lo = Math.floor((T.base_z - TOL) / BW), hi = Math.floor((T.base_z + TOL) / BW);
      for (var k = lo; k <= hi; k++) {
        var arr = sup[k]; if (!arr) continue;
        for (var m = 0; m < arr.length; m++) {
          var S = arr[m];
          if (S.guid !== T.guid && S.base_z < T.base_z - 1.0 && S.end > se) se = S.end;
        }
      }
      if (se > 0 && sched[T.guid].start < se - 1) v++;
    }
    return v;
  }

  var API = { computeSchedule: computeSchedule, collapsePhase: collapsePhase, auditFloating: auditFloating, TOL: TOL, BW: BW };
  global.ScheduleGate = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
