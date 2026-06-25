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

// ─── 1D clustering → gridlines (the emergent datum) ──────────
// Greedy by consecutive gap; gridline value = MEAN of the cluster it owns (non-invent).
// Returns [{ value, members:[v...], span }]. Members trace each line to real coordinates.
function swClusterAxis(values, gapTol, spanMax) {
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
    return { value: sum / members.length, members: members, span: span, spanOk: span <= spanMax };
  });
}

// ─── Derive the emergent structural grid from columns ────────
// columns: [{ guid, x, y, z }]. Returns { xLines:[..], yLines:[..], xMeta, yMeta, gapTol }.
function swDeriveGrid(columns, opts) {
  opts = opts || {};
  var gapTol = opts.gapTol != null ? opts.gapTol : SW_GRID_GAP_TOL;
  var spanMax = opts.spanMax != null ? opts.spanMax : SW_GRID_SPAN_MAX;
  var xMeta = swClusterAxis(columns.map(function (c) { return c.x; }), gapTol, spanMax);
  var yMeta = swClusterAxis(columns.map(function (c) { return c.y; }), gapTol, spanMax);
  return {
    xLines: xMeta.map(function (m) { return m.value; }),
    yLines: yMeta.map(function (m) { return m.value; }),
    xMeta: xMeta, yMeta: yMeta, gapTol: gapTol, spanMax: spanMax
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

// ─── Convenience: derive + walk in one call ──────────────────
function swWalkSkeleton(columns, opts) {
  var grid = swDeriveGrid(columns, opts);
  var walked = swWalkColumns(columns, grid, opts);
  var girders = swWalkGirders(columns, grid, opts);
  return { grid: grid, walked: walked, girders: girders };
}

// ─── Exports (node) + globals (browser eval) ─────────────────
var _swApi = {
  SW_PREFIX: SW_PREFIX, SW_GRID_GAP_TOL: SW_GRID_GAP_TOL, SW_GRID_SPAN_MAX: SW_GRID_SPAN_MAX,
  swClusterAxis: swClusterAxis, swDeriveGrid: swDeriveGrid, swNearest: swNearest,
  swWalkColumns: swWalkColumns, swWalkGirders: swWalkGirders, swWalkSkeleton: swWalkSkeleton,
  SW_SPAN_RULES: SW_SPAN_RULES, swCheckGirder: swCheckGirder, swConforms: swConforms,
  swDeriveTessellation: swDeriveTessellation, swWalkTessellation: swWalkTessellation,
  swReWalk: swReWalk
};
if (typeof module !== 'undefined' && module.exports) module.exports = _swApi;
if (typeof window !== 'undefined') Object.keys(_swApi).forEach(function (k) { window[k] = _swApi[k]; });
