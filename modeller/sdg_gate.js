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
  //           hostOf: {fillingFid: hostFid}, abuts: [{a,b}] (real face-touch fid pairs) }
  //   opts = {clashTol, clearance}
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

  // (5) UBBL ROOM SIZE — DEMO INDICATOR (STATIC, not part of evaluate()'s delta contract).
  // Implementing UBBL_RULES_GATE.md §2 (bim-compiler prompts) — Witness: W-UBBL-ROOM-DEMO.
  // Unlike cases (1)-(4), which are delta-honest edit checks (a pre-existing as-extracted condition is
  // NEVER flagged), this case is a static per-room inspection of as-extracted `spatial_structure`
  // IfcSpace rows — the pre-existing state is exactly what it reports on. Folding it into evaluate()
  // would violate that file-level doctrine, so it is a separate pure entry point emitting the 5th kind.
  // NON-INVENT: the ONLY two thresholds wired are the two independently-verified numbers from
  // UBBL_RULES_GATE.md §1b (By-Law 42): "all other rooms" floor area >= 6.5 m² and headroom >= 2.5 m.
  // The 11 m² / 9.3 m² first/second-habitable-room tiers and any per-room-TYPE threshold are
  // deliberately NOT built — they need a room-order/type classifier that does not exist (§1c BLOCKED);
  // inventing a type mapping to unlock them would violate PRIME RULE. Demo/mockup scope only
  // (user decision 2026-07-05): every output carries UBBL_DEMO_LABEL verbatim — it is an indicator,
  // NOT a compliance verdict, and the label is the guardrail against it silently becoming one.
  var UBBL_MIN_AREA = 6.5;      // m² — By-Law 42 "all other rooms" minimum (verified, spec §1b)
  var UBBL_MIN_HEADROOM = 2.5;  // m  — By-Law 42 minimum headroom height (verified, spec §1b)
  var UBBL_DEMO_LABEL = "UBBL-style demo indicator (By-Law 42, 'all other rooms' minimum only) — not a compliance verdict";

  // ubblRoomSizeDemo(spaces, opts) → {kind:'ubbl-room-size', checked, flagged:[…], label}. PURE.
  //   spaces = [{guid, name, size_x, size_y, size_z}, …]  (spatial_structure rows, type='IfcSpace' —
  //            Duplex-extractor schema; SampleHouse predates it and has no such table: caller's concern)
  //   opts   = {minArea, minHeadroom} — explicit params like CLEARANCE, defaults are the §1b numbers
  // Rooms with NULL/missing dims are reported under `unmeasured`, never guessed at (non-invent).
  function ubblRoomSizeDemo(spaces, opts) {
    opts = opts || {};
    var minArea = opts.minArea != null ? opts.minArea : UBBL_MIN_AREA;
    var minHeadroom = opts.minHeadroom != null ? opts.minHeadroom : UBBL_MIN_HEADROOM;
    var flagged = [], unmeasured = [], checked = 0;
    (spaces || []).forEach(function (s) {
      if (s == null || s.size_x == null || s.size_y == null || s.size_z == null) {
        unmeasured.push({ kind: 'ubbl-room-size', guid: s && s.guid, name: s && s.name, label: UBBL_DEMO_LABEL });
        return;
      }
      checked++;
      var area = s.size_x * s.size_y;
      var belowArea = area < minArea, belowHeadroom = s.size_z < minHeadroom;
      if (belowArea || belowHeadroom) {
        flagged.push({
          kind: 'ubbl-room-size', guid: s.guid, name: s.name,
          size_x: +s.size_x.toFixed(3), size_y: +s.size_y.toFixed(3), size_z: +s.size_z.toFixed(3),
          area: +area.toFixed(3), belowArea: belowArea, belowHeadroom: belowHeadroom,
          minArea: minArea, minHeadroom: minHeadroom, label: UBBL_DEMO_LABEL
        });
      }
    });
    return { kind: 'ubbl-room-size', checked: checked, flagged: flagged, unmeasured: unmeasured, label: UBBL_DEMO_LABEL };
  }

  return { evaluate: evaluate, ubblRoomSizeDemo: ubblRoomSizeDemo, penetration: penetration, faceGap: faceGap, overlaps: overlaps, CLASH_TOL: CLASH_TOL, CLEARANCE: CLEARANCE, UBBL_MIN_AREA: UBBL_MIN_AREA, UBBL_MIN_HEADROOM: UBBL_MIN_HEADROOM, UBBL_DEMO_LABEL: UBBL_DEMO_LABEL };
});
