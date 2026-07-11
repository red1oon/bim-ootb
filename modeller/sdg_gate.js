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

  // ── §OBB NARROW PHASE (Implementing CLASH_GATE_OBB_NARROWPHASE.md §2 — Witness: W-SDG-OBB) ─────────────────
  // Two-phase clash test: the AABB overlaps()/penetration() above stays the cheap broad phase (unchanged, byte-
  // identical when no OBB data is supplied); for AABB-overlapping pairs where either side is genuinely ROTATED,
  // an OBB-OBB Separating Axis Test refines the verdict — a rotated pair whose world AABBs overlap but whose
  // real oriented boxes are disjoint is CLEARED (the classic AABB false positive), and a genuinely penetrating
  // rotated pair gets its true minimum-translation depth instead of the AABB's inflated one.
  //
  // DATA CONVENTIONS (verified against real SampleHouse_extracted.db, 2026-07-11 — do not "fix" without re-measuring):
  //   • element_transforms.bbox_x/y/z is the WORLD-AABB FULL extent (maxK−minK), NOT the local box: a −90° wall
  //     stores (0.29, 5.8) world vs (5.8, 0.29) local mesh; the 37° furniture stores exactly |L·cosθ|+|W·sinθ|.
  //     So obb.h must be LOCAL half-extents (from the element's own local mesh/base bbox) — never bbox_x/y/z/2
  //     for a rotated element.
  //   • rotation_x/y/z are RADIANS. obbAxes() mirrors bonsai_library.js place()'s TWO branches exactly (the
  //     production fold math the gate's AABBs come from): yaw-only ⇒ R = Rz(rz); rotX/rotY present ⇒
  //     R = Rx(rx)·Ry(rz)·Rz(−ry) (THREE Euler(rotX, rotZRad, −rotY), order 'XYZ' — viewer/streaming.js parity).
  //   • The OBB CENTRE is derived from the pair's own passed AABB (a box's world AABB is always centred on the
  //     box centre), so translation moves need no obb update — h/axes are per-element STATIC shape data.
  var OBB_EPS = 1e-6;   // cross-product axis |A_i×B_j| = sin(angle between edges); below 1e-6 (~6e-5°) the axis
  // direction is numerical noise — SKIP it (Ericson, Real-Time Collision Detection §4.4.1's near-parallel-edge
  // robustness pitfall). Skipping is CONSERVATIVE: it can only miss a separation (keeping the AABB-era flag),
  // never fabricate one — and when edges are truly parallel the face axes already prove any separation.
  function _rx(t) { var c = Math.cos(t), s = Math.sin(t); return [[1, 0, 0], [0, c, -s], [0, s, c]]; }
  function _ry(t) { var c = Math.cos(t), s = Math.sin(t); return [[c, 0, s], [0, 1, 0], [-s, 0, c]]; }
  function _rz(t) { var c = Math.cos(t), s = Math.sin(t); return [[c, -s, 0], [s, c, 0], [0, 0, 1]]; }
  function _mm(A, B) {
    var C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) C[i][j] = A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j];
    return C;
  }
  // obbAxes([rx,ry,rz] radians — the element_transforms convention) → the box's 3 local axes in world (unit,
  // columns of R). Branch selection mirrors place() EXACTLY, including its 3-axis Euler mapping seam.
  function obbAxes(r) {
    var rx = r[0] || 0, ry = r[1] || 0, rz = r[2] || 0;
    var R = (rx || ry) ? _mm(_mm(_rx(rx), _ry(rz)), _rz(-ry)) : _rz(rz);
    return [[R[0][0], R[1][0], R[2][0]], [R[0][1], R[1][1], R[2][1]], [R[0][2], R[1][2], R[2][2]]];
  }
  function _prepObb(e) {   // {h:[hx,hy,hz] LOCAL half-extents (m), r:[rx,ry,rz] radians} → prepared OBB
    var r = e.r || [0, 0, 0];
    var rotated = Math.abs(r[0] || 0) > 1e-9 || Math.abs(r[1] || 0) > 1e-9 || Math.abs(r[2] || 0) > 1e-9;
    return { h: e.h, axes: obbAxes(r), rotated: rotated };
  }
  function _axisObb(box) {   // identity OBB straight off an AABB (exact for any unrotated element)
    return { h: [(box[1] - box[0]) / 2, (box[3] - box[2]) / 2, (box[5] - box[4]) / 2], axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], rotated: false };
  }
  // OBB-OBB SAT over the 15 candidate axes (3 of A, 3 of B, 9 edge-cross products). Returns 0 when a separating
  // axis exists (disjoint — even if the AABBs overlap), else the minimum normalized overlap = the real
  // penetration depth (m) along the minimum-translation axis. Centres come from the passed AABBs (see above).
  function obbPenetration(a, oa, b, ob) {
    var ca = centre(a), cb = centre(b);
    var d = [cb[0] - ca[0], cb[1] - ca[1], cb[2] - ca[2]];
    var A = oa.axes, B = ob.axes, ha = oa.h, hb = ob.h;
    var best = Infinity;
    function axisOk(L) {   // false ⇔ L separates the boxes
      var n2 = L[0] * L[0] + L[1] * L[1] + L[2] * L[2];
      if (n2 < OBB_EPS * OBB_EPS) return true;                 // degenerate cross (near-parallel edges) — skip
      var ra = 0, rb = 0, k;
      for (k = 0; k < 3; k++) ra += ha[k] * Math.abs(A[k][0] * L[0] + A[k][1] * L[1] + A[k][2] * L[2]);
      for (k = 0; k < 3; k++) rb += hb[k] * Math.abs(B[k][0] * L[0] + B[k][1] * L[1] + B[k][2] * L[2]);
      var dist = Math.abs(d[0] * L[0] + d[1] * L[1] + d[2] * L[2]);
      var ov = (ra + rb - dist) / Math.sqrt(n2);               // normalize → metres (cross axes are non-unit)
      if (ov < 0) return false;
      if (ov < best) best = ov;
      return true;
    }
    var i, j;
    for (i = 0; i < 3; i++) if (!axisOk(A[i])) return 0;
    for (i = 0; i < 3; i++) if (!axisOk(B[i])) return 0;
    for (i = 0; i < 3; i++) for (j = 0; j < 3; j++) {
      var u = A[i], v = B[j];
      if (!axisOk([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]])) return 0;
    }
    return best;
  }
  function withinXY(box, pt, tol) {       // is pt inside box's XY footprint (the wall opening sits in plan)
    tol = tol || 0;
    return pt[0] >= box[0] - tol && pt[0] <= box[1] + tol && pt[1] >= box[2] - tol && pt[1] <= box[3] + tol;
  }

  // evaluate(before, after, moved, rel, opts) → {red:[{kind,a,b,depth?}], orange:[{kind,a,b,gap}]}. PURE.
  //   before/after = {fid: aabb}      moved = [fid,…] (host + cascade riders)
  //   rel = { related(a,b)->bool  (hosted-by/abuts/anchored = EXPECTED contact, never a clash),
  //           hostOf: {fillingFid: hostFid}, abuts: [{a,b}] (real face-touch fid pairs) }
  //   opts = {clashTol, clearance, obb}
  //   opts.obb (OPTIONAL, §OBB above) = {fid: {h:[hx,hy,hz] LOCAL half-extents m, r:[rx,ry,rz] radians}} —
  //   enables the SAT narrow phase on the clash test for pairs where either side is rotated. Absent (every
  //   pre-existing caller) ⇒ behaviour byte-identical to the AABB-only gate. Only kind (1) clash consumes it:
  //   faceGap/clearance, door-out, door-crush, abuts-realign stay AABB-based (CLASH_GATE_OBB_NARROWPHASE.md §4
  //   non-goals — their surrounding logic is untouched; the clearance gap on a rotated pair therefore remains
  //   the conservative AABB approximation, stated honestly rather than half-upgraded).
  function evaluate(before, after, moved, rel, opts) {
    opts = opts || {}; rel = rel || {};
    var clashTol = opts.clashTol != null ? opts.clashTol : CLASH_TOL;
    var clearance = opts.clearance != null ? opts.clearance : CLEARANCE;
    var obbPrep = null;
    if (opts.obb) {
      obbPrep = {};
      Object.keys(opts.obb).forEach(function (f) {
        var e = opts.obb[f];
        if (e && e.h && e.h.length === 3) obbPrep[f] = _prepObb(e);
      });
    }
    // narrow-refined penetration: broad AABB first (cheap, common case unchanged); SAT only when the AABBs
    // overlap AND either side is genuinely rotated (unrotated OBB ≡ AABB — skipping keeps them byte-identical).
    function pen2(x, y, bx, by) {
      var p = penetration(bx, by);
      if (p <= 0 || !obbPrep) return p;
      var ox = obbPrep[x], oy = obbPrep[y];
      if (!(ox && ox.rotated) && !(oy && oy.rotated)) return p;
      return obbPenetration(bx, ox || _axisObb(bx), by, oy || _axisObb(by));
    }
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
        var penA = pen2(+m, +o, after[m], after[o]);          // §OBB: SAT-refined for rotated pairs (else = AABB)
        var penB = (before[m] && before[o]) ? pen2(+m, +o, before[m], before[o]) : 0;
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

    // (4) ABUTS REALIGN — a neighbour PULLED AWAY from a real face-touch partner during THIS edit (one side
    // moved, the other didn't) → propose an ORANGE Δ that would restore the touch (SPATIAL_DEPENDENCY_GRAPH.md's
    // `abuts` backward signal: "neighbor pulled away → gap → ORANGE realign"). REPORTS ONLY — proposedDelta is a
    // suggestion; applying it is a future accept-gated op (SDG_BACKPROP_ABUTS_REALIGN.md), not this function's
    // concern (mirrors clash/door-out/door-crush: never mutates, only flags). One-hop, delta-honest: a pair
    // already separated beyond tol in `before` can't trigger it (the edit didn't cause it).
    // "Touching" mirrors cross_edges.js's OWN faceTouch contract (min-|overlap| axis, SIGN-AGNOSTIC — a flush or
    // slightly-interpenetrating pair counts as contact, not just a gapped one): this is the edge's own definition,
    // not sdg_gate's stricter `faceGap` (built for clearance, gap-only) — reusing faceGap here would silently
    // never fire on a real flush (ov≈0, non-negative) abuts pair, the common case (recon: DOOR_WIDTH_CRUSH_GATE.md
    // pattern — verify against real data before shipping a check that could be permanently dead).
    var ABUTS_TOL = 0.03;   // m — SAME touch tolerance cross_edges.js uses to derive the edge (non-invent reuse)
    function touchAxis(a, b, tol) {
      var ov = overlaps(a, b), k = 0;
      for (var i = 1; i < 3; i++) if (Math.abs(ov[i]) < Math.abs(ov[k])) k = i;
      return Math.abs(ov[k]) <= tol ? k : -1;
    }
    (rel.abuts || []).forEach(function (pr) {
      var a = pr.a, b = pr.b;
      if (!after[a] || !after[b] || !before[a] || !before[b]) return;
      var movedA = !!movedSet[a], movedB = !!movedSet[b];
      if (movedA === movedB) return;                                  // both or neither moved — nothing pulled away
      var nb = movedA ? b : a, mv = movedA ? a : b;                    // nb = neighbour (unmoved), mv = the moved side
      var k = touchAxis(before[a], before[b], ABUTS_TOL);
      if (k < 0) return;                                               // wasn't genuinely touching before this edit
      var ovAfterK = overlaps(after[a], after[b])[k];
      var gapAfter = ovAfterK < 0 ? -ovAfterK : 0;
      if (gapAfter <= ABUTS_TOL) return;                               // still touching (within tol) — no realign needed
      var dir = centre(after[mv])[k] - centre(after[nb])[k] >= 0 ? 1 : -1;
      var delta = [0, 0, 0]; delta[k] = dir * gapAfter;
      orange.push({ kind: 'abuts-realign', a: nb, b: mv, gap: +gapAfter.toFixed(4), axis: 'xyz'[k], proposedDelta: delta });
    });

    return { red: red, orange: orange };
  }

  return { evaluate: evaluate, penetration: penetration, faceGap: faceGap, overlaps: overlaps,
    obbPenetration: obbPenetration, obbAxes: obbAxes, OBB_EPS: OBB_EPS,   // §OBB narrow phase (W-SDG-OBB)
    CLASH_TOL: CLASH_TOL, CLEARANCE: CLEARANCE };
});
