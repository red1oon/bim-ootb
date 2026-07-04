// sdg_gate.js — §GATE-1: the RED/ORANGE conformity gate on a committed edit (the spine's "planner's gate" / MRP
// exception message). After a move/ride, CHECK the result: RED = a hard constraint the edit BROKE, ORANGE = soft
// accept/ignore. DELTA-based: flags only what the EDIT changed (a pre-existing as-extracted overlap is NOT a
// violation — the building shipped that way). Pure geometry over MEASURED AABBs + RECOVERED edges; invents no rule.
// Reuses the cross_edges overlap convention. See RESUME_MODELLER_CONFORMITY_GATE.md §GATE-1. Dual-export (window+node).
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.SdgGate = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  var CLASH_TOL = 0.02;       // m — interpenetration deeper than this (and deeper than before) = a clash
  var CLEARANCE = 0.5;        // m — default soft clearance (measured residential standard ~0.5m; a PARAMETER)

  // AABB layout = [minx,maxx,miny,maxy,minz,maxz]. signed per-axis overlap: >0 interpenetrate, =0 touch, <0 gap.
  function overlaps(a, b) {
    var ov = [];
    for (var k = 0; k < 3; k++) ov.push(Math.min(a[2 * k + 1], b[2 * k + 1]) - Math.max(a[2 * k], b[2 * k]));
    return ov;
  }
  // >0 ⇒ volumetric interpenetration depth (min separating translation); 0 ⇒ not overlapping.
  function penetration(a, b) {
    var ov = overlaps(a, b);
    return (ov[0] > 0 && ov[1] > 0 && ov[2] > 0) ? Math.min(ov[0], ov[1], ov[2]) : 0;
  }
  // face-gap when separated on EXACTLY one axis (a clean face-to-face near-miss); null for corner/overlap.
  function faceGap(a, b) {
    var ov = overlaps(a, b), sep = [];
    for (var k = 0; k < 3; k++) if (ov[k] < 0) sep.push(k);
    return sep.length === 1 ? -ov[sep[0]] : null;
  }
  function centre(a) { return [(a[0] + a[1]) / 2, (a[2] + a[3]) / 2, (a[4] + a[5]) / 2]; }
  function withinXY(box, pt, tol) {       // is pt inside box's XY footprint (the wall opening sits in plan)
    tol = tol || 0;
    return pt[0] >= box[0] - tol && pt[0] <= box[1] + tol && pt[1] >= box[2] - tol && pt[1] <= box[3] + tol;
  }

  // evaluate(before, after, moved, rel, opts) → {red:[{kind,a,b,depth?}], orange:[{kind,a,b,gap}]}. PURE.
  //   before/after = {fid: aabb}      moved = [fid,…] (host + cascade riders)
  //   rel = { related(a,b)->bool  (hosted-by/abuts/anchored = EXPECTED contact, never a clash),
  //           hostOf: {fillingFid: hostFid} }      opts = {clashTol, clearance}
  function evaluate(before, after, moved, rel, opts) {
    opts = opts || {}; rel = rel || {};
    var clashTol = opts.clashTol != null ? opts.clashTol : CLASH_TOL;
    var clearance = opts.clearance != null ? opts.clearance : CLEARANCE;
    var related = rel.related || function () { return false; };
    var hostOf = rel.hostOf || {};
    var movedSet = {}; moved.forEach(function (m) { movedSet[m] = 1; });
    var allFids = Object.keys(after);
    var red = [], orange = [], seen = {};

    // (1) CLASH + (3) CLEARANCE — each moved element vs every other (deduped by unordered pair)
    moved.forEach(function (m) {
      if (!after[m]) return;
      allFids.forEach(function (o) {
        if (+o === +m) return;
        var key = Math.min(+m, +o) + '|' + Math.max(+m, +o);
        if (seen[key]) return; seen[key] = 1;
        if (related(+m, +o)) return;                          // expected contact (door-in-wall, abuts) → never a clash
        var penA = penetration(after[m], after[o]);
        var penB = (before[m] && before[o]) ? penetration(before[m], before[o]) : 0;
        if (penA > clashTol && penA > penB + clashTol) {       // NEW or WORSENED interpenetration
          red.push({ kind: 'clash', a: +m, b: +o, depth: +penA.toFixed(4) }); return;
        }
        var gapA = faceGap(after[m], after[o]);
        var gapB = (before[m] && before[o]) ? faceGap(before[m], before[o]) : null;
        if (gapA != null && gapA >= 0 && gapA < clearance && (gapB == null || gapA < gapB - 1e-9)) {
          orange.push({ kind: 'clearance', a: +m, b: +o, gap: +gapA.toFixed(4) });
        }
      });
    });

    // (2) DOOR OUT OF HOST — a moved filling whose centre left its host footprint (catches sliding a door off its wall)
    Object.keys(hostOf).forEach(function (fStr) {
      var f = +fStr, h = hostOf[f];
      if (!movedSet[f] && !movedSet[h]) return;
      if (!after[f] || !after[h] || !before[f] || !before[h]) return;
      if (withinXY(before[h], centre(before[f]), 0.05) && !withinXY(after[h], centre(after[f]), 0.05)) {
        red.push({ kind: 'door-out', a: f, b: h });
      }
    });

    // (3) DOOR CRUSH — a hosted filling's own footprint no longer fits the host's on the axis the edit actually
    // changed (host stretched narrower than the filling's real measured width), even though the filling's CENTRE
    // may still sit inside the host (door-out above only tests the centre point). Restricted to the axis whose
    // HOST extent changed — NOT all 3: a real filling's AABB commonly overhangs the host's OTHER axes (frame/
    // casing beyond wall thickness) even pre-edit (recon: DOOR_WIDTH_CRUSH_GATE.md), so a naive 3-axis containment
    // check would never fire for any real door, ever. Delta-honest like (1)/(2): a pair that never fit on the
    // stretch axis to begin with can't trigger it.
    Object.keys(hostOf).forEach(function (fStr) {
      var f = +fStr, h = hostOf[f];
      if (!movedSet[f] && !movedSet[h]) return;
      if (!after[f] || !after[h] || !before[f] || !before[h]) return;
      for (var k = 0; k < 3; k++) {
        var w0 = before[h][2 * k + 1] - before[h][2 * k], w1 = after[h][2 * k + 1] - after[h][2 * k];
        if (Math.abs(w1 - w0) < 1e-6) continue;                          // host didn't change extent on this axis
        var fitBefore = before[f][2 * k] >= before[h][2 * k] - 0.05 && before[f][2 * k + 1] <= before[h][2 * k + 1] + 0.05;
        var fitAfter  = after[f][2 * k]  >= after[h][2 * k]  - 0.05 && after[f][2 * k + 1]  <= after[h][2 * k + 1]  + 0.05;
        if (fitBefore && !fitAfter) { red.push({ kind: 'door-crush', a: f, b: h, axis: 'xyz'[k] }); break; }
      }
    });

    return { red: red, orange: orange };
  }

  return { evaluate: evaluate, penetration: penetration, faceGap: faceGap, overlaps: overlaps, CLASH_TOL: CLASH_TOL, CLEARANCE: CLEARANCE };
});
