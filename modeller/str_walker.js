/**
 * BIM OOTB — STR Walker JS (the structural RouteWalker)
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * Implements prompts/STR_ROUTEWALKING_SPEC.md — the STRUCTURAL walker, mirror of RouteWalker.
 * SLICE 1 = the SKELETON walk (deterministic, RS-clean): derive the emergent structural grid
 * from a building's columns (the SDG datum_plane substrate), then WALK each column onto its
 * grid intersection. Position = f(grid). NON-INVENT: every gridline value is the MEAN of the
 * real column coordinates it owns (traceable), zero hardcoded spacing, zero invented positions.
 *
 * This file is NEW. It edits no existing file. GUID prefix: SW2D- (never collides with
 * IFC-extracted, Java RW-, or JS RW2D- elements).
 *
 * Witness: scripts/witness_str_walk_skeleton.js (W-STR-WALK-SKELETON).
 * Oracle: pristine *_extracted.db / raw extraction — NEVER cooked output.db.
 */
'use strict';

// ─── Constants ───────────────────────────────────────────────
var SW_PREFIX = 'SW2D-';
// Cluster gap tolerance (metres): a gap > this between consecutive sorted column coordinates
// starts a new gridline. Within-line jitter is centimetres; adjacent lines are ≥~0.5m apart.
// MEASURED on Terminal (158 cols): the grid RESOLVES at gapTol ≤ 0.5m → 18×10 lines, max column
// residual 0.329m, mean 5.2cm (a stable plateau; coarser tol MERGES real X-lines → false 0.855m
// residual). Tuned to the data via the sweep in witness_str_walk_skeleton.js, reported by §-log.
var SW_GRID_GAP_TOL = 0.5;
// A cluster whose total span exceeds this is rejected as NOT a single gridline (anti-drift guard
// against greedy chaining across a whole wing). Span is reported; never silently merged.
var SW_GRID_SPAN_MAX = 2.0;
// §ROW7-ROT (SPEC_ROW7_HGARAGE.md §C) — a lattice ROTATED against the world axes cannot be described by per-axis 1D
// clustering: HospitalGarage (IfcSite RefDirection #196106 = 88.000° ≡ −2° mod 90, applied by the extractor into the
// db's world frame) walked to 15×103 with 102 one-column lines and colRMS 1.19 m. The runtime db carries no site
// placement, so the rotation is MEASURED from the real columns: every column pair's direction mod 90° → 0.01° histogram
// → mode → mean of the ±2-bin inliers. Measured: HospitalGarage mode −2.00° (1,529 of 9,730 pairs in ONE bin) →
// −2.0000° = the IFC's angle; Terminal −0.0002°; Hospital −4.9993° = ITS IfcSite −5.000°. Two gates, both logged by the
// bridge (§STRWALK-ROT): the dead-band below, and the SUPPORT gate in swDetectRotation — the rotated frame must put MORE
// real columns exactly on gridlines than the axis-aligned one (HospitalGarage 6 → 132 applied; Hospital 43 → 26 REFUSED:
// its per-storey column stacks span ≥ 2 wing directions and no single lattice describes them). Nothing is invented: the
// frame is a rigid rotation of the real coordinates and every line value is still a real column coordinate (median).
var SW_GRID_ROT_BIN_DEG = 0.01;
var SW_GRID_ROT_MIN_DEG = 0.05;   // dead-band: below this a measured angle is within-line jitter (0.05° over 150 m = 131 mm), not a rotation
var SW_GRID_EXACT_TOL = 0.005;    // "exactly on a gridline" (5 mm): the support-gate census and the witnesses' exact(<5 mm) count

// ─── Frame rotation (world = R(θ)·frame; CCW about +Z, the same convention as bonsai_library.place()'s yaw) ──
function swToFrame(x, y, theta) { var c = Math.cos(theta), s = Math.sin(theta); return [x * c + y * s, -x * s + y * c]; }
function swToWorld(u, v, theta) { var c = Math.cos(theta), s = Math.sin(theta); return [u * c - v * s, u * s + v * c]; }

// ─── 1D clustering → gridlines (the emergent datum) ──────────
// Greedy by consecutive gap; gridline value = MEAN of the cluster it owns (non-invent).
// Returns [{ value, members:[v...], span }]. Members trace each line to real coordinates.
//   lineFit (§ROW7-LINE-FIT; DEFAULT 'median' since red1's 2026-09-26 call "on the beams"; 'mean' = the pre-09-26 behaviour):
//     'mean'   — least-squares value; MINIMISES the residual RMS for a fixed membership, but on a facade line
//                whose members mix on-line columns with face-flush eccentric ones it lands where NOTHING is
//                (Terminal south facade: mean −40.050 vs the 34 facade beams and 12 columns at −40.157).
//     'median' — a REAL member coordinate (zero new constants, traceable to a column); lands the line on the
//                structural line the beams prove, so the residual then measures ONLY design eccentricity.
//                Measured Terminal (true centres): RMS 0.1039 → 0.1323 (UP — the mean was optimal by construction),
//                exact(<5 mm) 92 → 131 of 158, Y0/Y9 → −40.157/−0.157 (0 mm from the beam line). A handle
//                decision red1 made 2026-09-26 (median), pinned both ways by W-ROW7-TRUE-CENTRE T5.
function swClusterAxis(values, gapTol, spanMax, lineFit) {
  if (!values.length) return [];
  var sorted = values.slice().sort(function (a, b) { return a - b; });
  var lines = [];
  var cur = [sorted[0]];
  for (var i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] <= gapTol) {
      cur.push(sorted[i]);
    } else {
      lines.push(cur); cur = [sorted[i]];
    }
  }
  lines.push(cur);
  return lines.map(function (members) {
    var sum = members.reduce(function (s, v) { return s + v; }, 0);
    var span = members[members.length - 1] - members[0];
    var value = lineFit === 'median' ? members[(members.length - 1) >> 1] : sum / members.length;   // members are sorted
    return { value: value, members: members, span: span, spanOk: span <= spanMax };
  });
}

// ─── Derive the emergent structural grid from columns ────────
// columns: [{ guid, x, y, z }]. Returns { xLines:[..], yLines:[..], xMeta, yMeta, gapTol, lineFit }.
function swDeriveGrid(columns, opts) {
  opts = opts || {};
  var gapTol = opts.gapTol != null ? opts.gapTol : SW_GRID_GAP_TOL;
  var spanMax = opts.spanMax != null ? opts.spanMax : SW_GRID_SPAN_MAX;
  var lineFit = opts.lineFit === 'mean' ? 'mean' : 'median';   // red1 2026-09-26: gridlines sit ON the structure (median); 'mean' = pre-09-26
  var xMeta = swClusterAxis(columns.map(function (c) { return c.x; }), gapTol, spanMax, lineFit);
  var yMeta = swClusterAxis(columns.map(function (c) { return c.y; }), gapTol, spanMax, lineFit);
  return {
    xLines: xMeta.map(function (m) { return m.value; }),
    yLines: yMeta.map(function (m) { return m.value; }),
    xMeta: xMeta, yMeta: yMeta, gapTol: gapTol, spanMax: spanMax, lineFit: lineFit
  };
}

// ─── SEMI-GRID: derive the structural grid from ARC (the spec's "missing 4th handle") ──
// Per convention (§VISION-LOCK): DROP ARC only, then WALK. The datums emerge from the ARC itself —
// wall centerlines + any column centroids — so a WALL-BEARING building (no column frame, e.g.
// residential SC) still yields a grid. A wall running in X sits at a constant Y → a Y-line; a
// Y-running wall → an X-line; a column contributes both. NON-INVENT: lines = means of real ARC
// coordinates; never seeded from STR (keeps "STR walks FROM ARC" non-circular).
//   arcElements: [{ cx, cy, lx, ly, isColumn? }]   (lx/ly = bbox extents; long axis = run direction)
function swDeriveSemiGrid(arcElements, opts) {
  opts = opts || {};
  var gap = opts.gapTol != null ? opts.gapTol : SW_GRID_GAP_TOL;
  var xPts = [], yPts = [];
  arcElements.forEach(function (e) {
    if (e.isColumn) { xPts.push(e.cx); yPts.push(e.cy); }
    else if (e.lx >= e.ly) { yPts.push(e.cy); }   // X-running wall → contributes a Y datum
    else { xPts.push(e.cx); }                      // Y-running wall → contributes an X datum
  });
  return {
    xLines: swClusterAxis(xPts, gap, 1e9).map(function (m) { return m.value; }),
    yLines: swClusterAxis(yPts, gap, 1e9).map(function (m) { return m.value; }),
    source: 'derived:arc-semigrid'
  };
}

// ─── Nearest gridline ────────────────────────────────────────
function swNearest(value, lines) {
  var best = lines[0], bestD = Math.abs(value - lines[0]);
  for (var i = 1; i < lines.length; i++) {
    var d = Math.abs(value - lines[i]);
    if (d < bestD) { bestD = d; best = lines[i]; }
  }
  return { line: best, dist: bestD };
}

// ─── SKELETON WALK: snap each column onto its grid intersection ──
// Position = f(grid): walked (x,y) is EXACTLY a gridline pair (deterministic, RS-clean).
// residual = planar distance from the real column to its snapped intersection (reported, the
// grid-quantization error). z is kept verbatim (Z lattice handled by a later slice).
function swWalkColumns(columns, grid, opts) {
  opts = opts || {};
  var out = [];
  for (var i = 0; i < columns.length; i++) {
    var c = columns[i];
    var nx = swNearest(c.x, grid.xLines);
    var ny = swNearest(c.y, grid.yLines);
    var residual = Math.hypot(nx.dist, ny.dist);
    out.push({
      guid: SW_PREFIX + (c.guid || ('col' + i)),
      srcGuid: c.guid,                 // the extracted column this walks (oracle link)
      x: nx.line, y: ny.line, z: c.z,  // ON the grid — f(grid)
      residual: residual,
      provenance: 'derived:grid'       // never ifc_extract; the position is computed from the datum
    });
  }
  return out;
}

// ─── SPANS WALK: girders between adjacent grid columns ───────
// The `spans` edge (prompts/SPATIAL_DEPENDENCY_GRAPH.md §SPANS): along each gridline, columns
// snapped to that line are sorted and ADJACENT pairs get a girder. The girder runs ON one datum
// (its gridline) and SPANS between two distinct perpendicular datums (the two gridlines its
// endpoints sit on); span == |toDatum − fromDatum| = one structural bay. Cross-section is NOT
// derived here (held; sized by the regulatory handler later). NON-INVENT: endpoints are real
// snapped columns, span is a measured grid gap, zero invented length.
function swWalkGirders(columns, grid, opts) {
  var snap = columns.map(function (c) {
    return { x: swNearest(c.x, grid.xLines).line, y: swNearest(c.y, grid.yLines).line, srcGuid: c.guid };
  });
  var girders = [];
  function emit(axis, onDatum, fromD, toD, from, to, i) {
    girders.push({
      guid: SW_PREFIX + 'GIRDER-' + axis + onDatum.toFixed(2) + '-' + i,
      axis: axis, onDatum: onDatum,            // the gridline the girder runs along
      fromDatum: fromD, toDatum: toD,          // the two distinct datums it spans between
      from: from, to: to, span: Math.abs(toD - fromD),
      provenance: 'derived:str-walk'
    });
  }
  // Girders along each X-line span between adjacent Y-datums (sort the line's columns by y).
  grid.xLines.forEach(function (xl) {
    var on = snap.filter(function (s) { return s.x === xl; }).sort(function (a, b) { return a.y - b.y; });
    for (var i = 1; i < on.length; i++) {
      if (on[i].y === on[i - 1].y) continue;   // duplicate column at one intersection
      emit('Xline@', xl, on[i - 1].y, on[i].y, [xl, on[i - 1].y], [xl, on[i].y], i);
    }
  });
  // Girders along each Y-line span between adjacent X-datums.
  grid.yLines.forEach(function (yl) {
    var on = snap.filter(function (s) { return s.y === yl; }).sort(function (a, b) { return a.x - b.x; });
    for (var i = 1; i < on.length; i++) {
      if (on[i].x === on[i - 1].x) continue;
      emit('Yline@', yl, on[i - 1].x, on[i].x, [on[i - 1].x, yl], [on[i].x, yl], i);
    }
  });
  return girders;
}

// ═══ REGULATORY HANDLER — span/depth + deflection → RED/ORANGE (STR_ROUTEWALKING_SPEC §2B) ═══
// EVERY threshold lives in this CITED table — no magic numbers in the logic below (the door
// doctrine: measure/cite, never invent). These are PRELIMINARY (LOD 200-300) sizing rules of
// thumb with their code basis; a full check is the engineer's, not the walker's. UBBL (Malaysia)
// governs structural design by ADOPTING the MS EN Eurocodes, so Eurocode is the citation of record.
var SW_SPAN_RULES = {
  STEEL: {
    depthRatio: 20,        // preliminary girder depth ≈ span/20
    deflectionDenom: 360,  // serviceability δ ≤ span/360 (variable load)
    maxBeamSpan: 18,       // practical rolled-section span; beyond → plate girder / truss
    source: 'EN 1993-1-1 (Eurocode 3) §7.2 serviceability δ≤L/360; preliminary depth ≈ L/20 ' +
            '(SCI Steel Designers\' Manual). Cross-ref AISC 360-16; IBC/ASCE 7 Table 1604.3.'
  },
  RC: {
    depthRatio: 12,        // preliminary RC beam overall depth ≈ span/12
    deflectionDenom: 250,  // total deflection ≈ span/250 basic
    maxBeamSpan: 12,       // beyond → post-tension / deep beam
    source: 'EN 1992-1-1 (Eurocode 2) §7.4.2 span/effective-depth basic ratios; preliminary depth ' +
            '≈ L/12. Cross-ref ACI 318-19 Table 9.3.1.1 (L/16 simply-supported).'
  }
};

// Check one walked girder's span against the cited rule → a RED/ORANGE/GREEN signal.
// span (m); opts.material 'STEEL'|'RC'; opts.proposedDepth (m, optional) = the depth being offered.
function swCheckGirder(span, opts) {
  opts = opts || {};
  var mat = opts.material || 'STEEL';
  var rule = SW_SPAN_RULES[mat];
  var requiredDepth = span / rule.depthRatio;
  var maxDeflection = span / rule.deflectionDenom;
  var signal, message;
  if (span > rule.maxBeamSpan) {
    signal = 'RED';
    message = 'span ' + span.toFixed(1) + 'm > ' + rule.maxBeamSpan + 'm max for a ' + mat +
      ' beam → no valid solid-beam load path: add an intermediate column or use a truss';
  } else if (opts.proposedDepth != null && opts.proposedDepth < requiredDepth - 1e-9) {
    signal = 'ORANGE';
    message = 'proposed depth ' + opts.proposedDepth.toFixed(2) + 'm < required ' +
      requiredDepth.toFixed(2) + 'm (L/' + rule.depthRatio + ') → upsize';
  } else {
    signal = 'GREEN';
    message = 'ok: provide depth ≥ ' + requiredDepth.toFixed(2) + 'm (L/' + rule.depthRatio +
      '), keep δ ≤ ' + maxDeflection.toFixed(3) + 'm (L/' + rule.deflectionDenom + ')';
  }
  return {
    signal: signal, material: mat, span: span, requiredDepth: requiredDepth,
    maxDeflection: maxDeflection, rule: 'span/depth+deflection', source: rule.source,
    message: message, provenance: 'derived:regulatory'
  };
}

// Validate a REAL member's as-built depth against the rule (depth adequate ⟺ span/depth ≤ ratio).
function swConforms(span, depth, opts) {
  var mat = (opts && opts.material) || 'STEEL';
  var rule = SW_SPAN_RULES[mat];
  var ratio = depth > 0 ? span / depth : Infinity;
  return { conforms: ratio <= rule.depthRatio, ratio: ratio, limit: rule.depthRatio, source: rule.source };
}

// ═══ TESSELLATION WALKER — the GENERATIVE half (STR_ROUTEWALKING_SPEC §2A.3 / §5) ═══
// A space-frame / cladding system = ONE measured unit repeated n times over a measured surface
// domain = `instanced-by n` (extent = f(n); collapse n→1 ⇒ the system vanishes). This walk is
// GENERATIVE: it reconstructs the COUNT + COVERAGE within tol, NEVER bit-exact positions, and is
// graded against extracted plates as ORACLE. NON-INVENT: unit, domain, surface profile and band
// density are all MEASURED; provenance derived:str-walk; the non-modal tail is reported, not dropped.

// Measure the tessellation parameters from a real plate cloud (no invention).
// plates: [{ x,y,z, bx,by,bz }]. opts.edgeTrim = fraction of extreme x-bands dropped as taper.
function swDeriveTessellation(plates, opts) {
  opts = opts || {};
  // NON-INVENT generality: a building with no space-frame (e.g. residential — walls, not a canopy)
  // has NO tessellated system. Return null → the walker fabricates nothing. (W-STR-GENERAL-SC C2.)
  if (!plates || !plates.length) return null;
  var edgeTrim = opts.edgeTrim != null ? opts.edgeTrim : 0.1;
  // modal unit = most common rounded bbox (the repeated cell)
  var hist = {};
  plates.forEach(function (p) {
    var k = p.bx.toFixed(1) + 'x' + p.by.toFixed(1) + 'x' + p.bz.toFixed(2);
    hist[k] = (hist[k] || 0) + 1;
  });
  var modeKey = Object.keys(hist).sort(function (a, b) { return hist[b] - hist[a]; })[0];
  var modalCount = hist[modeKey];
  var mb = modeKey.split('x').map(Number);
  // domain = bbox of centres
  var xs = plates.map(function (p) { return p.x; }), ys = plates.map(function (p) { return p.y; }),
      zs = plates.map(function (p) { return p.z; });
  var domain = {
    minX: Math.min.apply(null, xs), maxX: Math.max.apply(null, xs),
    minY: Math.min.apply(null, ys), maxY: Math.max.apply(null, ys),
    minZ: Math.min.apply(null, zs), maxZ: Math.max.apply(null, zs)
  };
  // surface profile z ≈ f(x): mean z per 1m x-band. NOTE this is a 1D MID-SURFACE simplification of
  // the true z=f(x,y) shell (the canopy curves in BOTH x and y; measured locally thin = 0.07m/cell,
  // globally 8.7m). Sufficient for count/extent reconstruction; a full 2D surface fit is a later slice.
  var bandSum = {}, bandN = {};
  plates.forEach(function (p) { var b = Math.floor(p.x); bandSum[b] = (bandSum[b] || 0) + p.z; bandN[b] = (bandN[b] || 0) + 1; });
  var bands = Object.keys(bandN).map(Number).sort(function (a, b) { return a - b; });
  var zProfile = bands.map(function (b) { return { x: b, z: bandSum[b] / bandN[b], n: bandN[b] }; });
  // interior band density (edge-trimmed) → independent count predictor
  var counts = bands.map(function (b) { return bandN[b]; }).sort(function (a, b) { return a - b; });
  var lo = Math.floor(counts.length * edgeTrim);
  var interior = counts.slice(lo, counts.length - lo);
  var bandDensity = interior.reduce(function (s, v) { return s + v; }, 0) / interior.length;
  return {
    unit: { bx: mb[0], by: mb[1], bz: mb[2] }, modalShare: modalCount / plates.length,
    tail: plates.length - modalCount, domain: domain, zProfile: zProfile,
    nBands: bands.length, bandDensity: bandDensity, predictedN: Math.round(bandDensity * bands.length),
    extractedN: plates.length
  };
}

function _swZAt(zProfile, x) {
  var best = zProfile[0];
  for (var i = 1; i < zProfile.length; i++) if (Math.abs(zProfile[i].x - x) < Math.abs(best.x - x)) best = zProfile[i];
  return best.z;
}

// Generate n unit placements tiling the surface domain (extent = f(n)). The domain filled is
// PROPORTIONAL to n: collapse n→1 ⇒ a single cell. Positions are a regular reconstruction of the
// distribution (band by band at the measured density), NOT a claim to match extracted positions.
function swWalkTessellation(tess, n, opts) {
  var d = tess.domain, out = [];
  var perBand = Math.max(1, Math.round(tess.bandDensity));
  var bandsNeeded = Math.ceil(n / perBand);
  for (var bi = 0; bi < bandsNeeded && out.length < n; bi++) {
    var x = d.minX + bi;                  // 1m x-strips, as measured
    if (x > d.maxX) break;
    var z = _swZAt(tess.zProfile, x);     // surface height at this strip (z = f(x))
    var inStrip = Math.min(perBand, n - out.length);
    for (var j = 0; j < inStrip; j++) {
      var y = d.minY + (d.maxY - d.minY) * (inStrip > 1 ? j / (inStrip - 1) : 0);
      out.push({ guid: SW_PREFIX + 'PLATE-' + bi + '-' + j, x: x, y: y, z: z,
        bx: tess.unit.bx, by: tess.unit.by, bz: tess.unit.bz, provenance: 'derived:str-walk' });
    }
  }
  return out;
}

// ═══ RE-WALK LOOP — ARC edit → STR re-walks (STR_ROUTEWALKING_SPEC §3/§4) = THE WEDGE ═══
// An ARC grid edit (a datum moves by Δ) cascades through the walker as ONE signed op chain:
// columns on the moved datum re-anchor; girders touching it re-span (cross-section HELD); the
// regulatory handler re-checks the changed spans and any signal that FLIPS becomes an EXCEPTION
// (the "you may need to upsize / add a column" message). NON-INVENT: the ONLY new number is the
// user's Δ; every new position/span is Δ folded onto a measured value; every exception is cited.
//   base  = { grid, walked, girders } from swWalkSkeleton
//   edit  = { axis:'x'|'y', datum:<gridline value to move>, delta:<metres>, material }
function swReWalk(base, edit, opts) {
  opts = opts || {};
  var mat = edit.material || 'STEEL';
  var ops = [{ opType: 'GEOM_GRID_MOVE', params: { axis: edit.axis, datum: edit.datum, delta: edit.delta }, provenance: 'user-edit' }];

  // 1. re-anchor columns sitting on the moved datum (others untouched) — position = f(new grid)
  var movedColumns = [];
  var newWalked = base.walked.map(function (c) {
    var on = edit.axis === 'y' ? c.y === edit.datum : c.x === edit.datum;
    if (!on) return c;
    var nc = Object.assign({}, c);
    if (edit.axis === 'y') nc.y = c.y + edit.delta; else nc.x = c.x + edit.delta;
    movedColumns.push(nc);
    ops.push({ opType: 'STR_REANCHOR', params: { srcGuid: c.srcGuid, from: [c.x, c.y], to: [nc.x, nc.y] }, provenance: 'derived:grid' });
    return nc;
  });

  // 2. re-span girders touching the moved datum + regulatory re-check
  var changedGirders = [], exceptions = [];
  var newGirders = base.girders.map(function (g) {
    var spansIt = (g.fromDatum === edit.datum || g.toDatum === edit.datum);
    var runsAlong = (edit.axis === 'y' && g.axis === 'Yline@' && g.onDatum === edit.datum) ||
                    (edit.axis === 'x' && g.axis === 'Xline@' && g.onDatum === edit.datum);
    if (!spansIt && !runsAlong) return g;
    var ng = Object.assign({}, g);
    if (runsAlong) {                          // girder ALONG the moved line: translate, span held
      ng.onDatum = g.onDatum + edit.delta;
      if (Array.isArray(g.from)) { ng.from = g.from.slice(); ng.to = g.to.slice(); }
      return ng;
    }
    if (g.fromDatum === edit.datum) ng.fromDatum = g.fromDatum + edit.delta;
    if (g.toDatum === edit.datum) ng.toDatum = g.toDatum + edit.delta;
    ng.span = Math.abs(ng.toDatum - ng.fromDatum);   // cross-section held; only the span changes
    ops.push({ opType: 'STR_RESPAN', params: { guid: g.guid, oldSpan: g.span, newSpan: ng.span }, provenance: 'derived:str-walk' });
    changedGirders.push(ng);
    var before = swCheckGirder(g.span, { material: mat });
    var after = swCheckGirder(ng.span, { material: mat });
    if (before.signal !== after.signal) {            // the WEDGE: an edit surfaces a consequence
      exceptions.push({ guid: g.guid, oldSignal: before.signal, newSignal: after.signal, span: ng.span, message: after.message, source: after.source });
      ops.push({ opType: 'STR_SIGNAL', params: { guid: g.guid, from: before.signal, to: after.signal, message: after.message }, source: after.source, provenance: 'derived:regulatory' });
    }
    return ng;
  });

  return { ops: ops, movedColumns: movedColumns, changedGirders: changedGirders,
           exceptions: exceptions, after: { grid: base.grid, walked: newWalked, girders: newGirders } };
}

// ─── §ROW7-ROT: measure the lattice rotation from the real columns (see the constants block) ──
// Returns the census + the gate verdict so the caller can LOG it; `applied` is the only field the walk acts on.
//   opts.theta (radians) — explicit override (witness use); opts.rotate === false — the caller disables detection.
function _swExactCensus(columns, opts) {
  var grid = swDeriveGrid(columns, opts), n = 0;
  for (var i = 0; i < columns.length; i++) {
    var d = Math.hypot(swNearest(columns[i].x, grid.xLines).dist, swNearest(columns[i].y, grid.yLines).dist);
    if (d < SW_GRID_EXACT_TOL) n++;
  }
  return { exact: n, lines: grid.xLines.length + grid.yLines.length, grid: grid.xLines.length + '×' + grid.yLines.length };
}
function swDetectRotation(columns, opts) {
  opts = opts || {};
  var out = { thetaDeg: 0, theta: 0, modeDeg: 0, modeN: 0, modeShare: 0, pairs: 0, inliers: 0, applied: false, reason: 'no-pairs',
              exact0: null, exactRot: null, lines0: null, linesRot: null, grid0: null, gridRot: null };
  if (opts.theta != null) { out.theta = opts.theta; out.thetaDeg = opts.theta * 180 / Math.PI; out.applied = out.theta !== 0; out.reason = 'opts.theta'; return out; }
  var bin = SW_GRID_ROT_BIN_DEG, hist = {}, angs = [], pairs = 0;
  for (var i = 0; i < columns.length; i++) {
    for (var j = i + 1; j < columns.length; j++) {
      var dx = columns[j].x - columns[i].x, dy = columns[j].y - columns[i].y;
      if (dx * dx + dy * dy < 1e-12) continue;                 // stacked columns (same plan position) carry no direction
      var a = Math.atan2(dy, dx) * 180 / Math.PI;
      a = ((a + 45) % 90 + 90) % 90 - 45;                      // mod 90 → [−45, 45)
      angs.push(a); pairs++;
      var k = Math.round(a / bin); hist[k] = (hist[k] || 0) + 1;
    }
  }
  out.pairs = pairs;
  if (!pairs) return out;
  // mode bin — ties broken deterministically (smaller |angle|, then smaller angle), never by insertion order
  var keys = Object.keys(hist).map(Number).sort(function (p, q) { return hist[q] - hist[p] || Math.abs(p) - Math.abs(q) || p - q; });
  var mk = keys[0], modeDeg = mk * bin;
  var inl = angs.filter(function (v) { return Math.abs(v - modeDeg) <= 2 * bin; });
  var refined = inl.reduce(function (s, v) { return s + v; }, 0) / inl.length;
  out.modeDeg = modeDeg; out.modeN = hist[mk]; out.modeShare = hist[mk] / pairs; out.inliers = inl.length;
  out.thetaDeg = refined; out.theta = refined * Math.PI / 180;
  if (Math.abs(refined) < SW_GRID_ROT_MIN_DEG) { out.reason = 'below-deadband'; return out; }
  // SUPPORT gate: the rotated frame must land MORE real columns exactly on gridlines than the axis-aligned walk.
  var e0 = _swExactCensus(columns, opts);
  var frame = columns.map(function (c) { var p = swToFrame(c.x, c.y, out.theta); return { x: p[0], y: p[1] }; });
  var eR = _swExactCensus(frame, opts);
  out.exact0 = e0.exact; out.exactRot = eR.exact; out.lines0 = e0.lines; out.linesRot = eR.lines; out.grid0 = e0.grid; out.gridRot = eR.grid;
  if (eR.exact > e0.exact) { out.applied = true; out.reason = 'more-exact'; } else { out.reason = 'fewer-exact'; }
  return out;
}

// ─── Convenience: derive + walk in one call ──────────────────
// §ROW7-ROT: when a rotation is measured AND supported, the column list is rotated into the lattice frame and the
// EXISTING derive/walk/girder steps run unchanged there — walked x/y and every girder datum are then FRAME coordinates
// (grid.theta; world = swToWorld). θ = 0 (Terminal, every axis-aligned fixture) ⇒ the same objects and values as before.
function swWalkSkeleton(columns, opts) {
  opts = opts || {};
  var rot = opts.rotate === false ? null : swDetectRotation(columns, opts);
  var theta = rot && rot.applied ? rot.theta : 0;
  var frame = theta ? columns.map(function (c) { var p = swToFrame(c.x, c.y, theta); var f = Object.assign({}, c); f.x = p[0]; f.y = p[1]; return f; }) : columns;
  var grid = swDeriveGrid(frame, opts);
  grid.theta = theta; grid.thetaDeg = theta * 180 / Math.PI; grid.rotation = rot;
  var walked = swWalkColumns(frame, grid, opts);
  var girders = swWalkGirders(frame, grid, opts);
  return { grid: grid, walked: walked, girders: girders };
}

// ─── Exports (node) + globals (browser eval) ─────────────────
var _swApi = {
  SW_PREFIX: SW_PREFIX, SW_GRID_GAP_TOL: SW_GRID_GAP_TOL, SW_GRID_SPAN_MAX: SW_GRID_SPAN_MAX,
  SW_GRID_ROT_BIN_DEG: SW_GRID_ROT_BIN_DEG, SW_GRID_ROT_MIN_DEG: SW_GRID_ROT_MIN_DEG, SW_GRID_EXACT_TOL: SW_GRID_EXACT_TOL,
  swToFrame: swToFrame, swToWorld: swToWorld, swDetectRotation: swDetectRotation,
  swClusterAxis: swClusterAxis, swDeriveGrid: swDeriveGrid, swDeriveSemiGrid: swDeriveSemiGrid, swNearest: swNearest,
  swWalkColumns: swWalkColumns, swWalkGirders: swWalkGirders, swWalkSkeleton: swWalkSkeleton,
  SW_SPAN_RULES: SW_SPAN_RULES, swCheckGirder: swCheckGirder, swConforms: swConforms,
  swDeriveTessellation: swDeriveTessellation, swWalkTessellation: swWalkTessellation,
  swReWalk: swReWalk
};
if (typeof module !== 'undefined' && module.exports) module.exports = _swApi;
if (typeof window !== 'undefined') Object.keys(_swApi).forEach(function (k) { window[k] = _swApi[k]; });
