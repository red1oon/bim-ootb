// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf2synth.js — best-effort completion (prompts/DXF2BIM_MODELLER_LANE.md §L13.2). Pure, Node + browser.
// Adds the parts a drawing set implies but does not draw, each marked `derived` (computed from drawn evidence plus a stated convention) or `assumed`, each with a yellow default:
//   ground slab   footprint = the outermost grid lines of the base plan; top = the lowest base of the drawn columns (they stand on it); thickness = the rate pack's slab description (250 mm)
//   gabled roof   eaves at the base corners of the highest end-gable panels, ridge at their apex, length = distance between the two gable planes; sheet thickness = display default
// Nothing here is drawn: a missing input is a gap (GAP:synth_*), never a guess.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory({ P: require('./dxf2prep.js'), DF: require('./dxf2defaults.js') });
  else root.Dxf2Synth = factory({ P: root.Dxf2Prep, DF: root.Dxf2Defaults });
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';
  var P = D.P, DFM = D.DF, r6 = function (v) { return Number(Number(v).toFixed(6)); };
  function prismBox(x0, y0, z0, x1, y1, z1) {
    var V = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
    return { vertices: V, faces: P.Solid.BOX.map(function (f) { return f.slice(); }) };   // winding as before: the callers' own checks decide (output must stay byte-identical)
  }
  // a sloping slab: a parallelogram (x0..x1 along the length, from the edge point (ya, za) to (yb, zb)), thickened DOWN by t measured perpendicular to the slope
  function slopeSlab(x0, x1, ya, za, yb, zb, t, up) {
    var dy = yb - ya, dz = zb - za, len = Math.hypot(dy, dz), ny = -dz / len, nz = dy / len;   // a unit normal of the slope in the (y,z) plane
    if (nz < 0) { ny = -ny; nz = -nz; }                                                       // pointing up
    var oy = -ny * t, oz = -nz * t, V = [[x0, ya, za], [x1, ya, za], [x1, yb, zb], [x0, yb, zb], [x0, ya + oy, za + oz], [x1, ya + oy, za + oz], [x1, yb + oy, zb + oz], [x0, yb + oy, zb + oz]];
    var F = [[0, 1, 2], [0, 2, 3], [4, 6, 5], [4, 7, 6], [0, 4, 5], [0, 5, 1], [1, 5, 6], [1, 6, 2], [2, 6, 7], [2, 7, 3], [3, 7, 4], [3, 4, 0]];
    var m = { vertices: V.map(function (q) { return [r6(q[0]), r6(q[1]), r6(q[2])]; }), faces: F };
    var v = 0; m.faces.forEach(function (f) { var a = m.vertices[f[0]], b = m.vertices[f[1]], c = m.vertices[f[2]]; v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6; });
    if (v < 0) m.faces = m.faces.map(function (f) { return [f[0], f[2], f[1]]; });
    return m;
  }

  // sheets: readSheets output (for the base plan grids); bodies: the els already built; opts: { slabT (m), roofT (m), overhang (m) }
  function complete(sheets, bodies, opts) {
    opts = opts || {}; var els = [], gaps = [], own = !opts.DF, DF = opts.DF || DFM.create(opts.ref, sheets, opts.choices), slabT = 0, roofT = 0, overhang = 0;
    var plans = sheets.filter(function (s) { return s.role === 'plan'; }).sort(function (a, b) { return a.level - b.level; });
    if (!plans.length) { gaps.push({ code: 'GAP:synth_no_plan', detail: 'a plan with a grid is needed' }); return { els: els, gaps: gaps, defaults: [] }; }
    var pl = plans[0], gx = Object.keys(pl.desc.gridsX || {}).map(function (l) { return pl.desc.gridsX[l] * pl.factor; }), gy = Object.keys(pl.desc.gridsY || {}).map(function (l) { return pl.desc.gridsY[l] * pl.factor; });
    var storey = (bodies[0] && bodies[0].storey) || 'Level 1';
    if (gx.length < 2 || gy.length < 2) { gaps.push({ code: 'GAP:synth_no_grid', detail: 'the base plan needs two grid lines on each axis' }); return { els: els, gaps: gaps, defaults: [] }; }
    var x0 = Math.min.apply(null, gx), x1 = Math.max.apply(null, gx), y0 = Math.min.apply(null, gy), y1 = Math.max.apply(null, gy);
    // ---- ground slab ----
    var cols = bodies.filter(function (b) { return b.kind === 'column'; });
    if (!cols.length) gaps.push({ code: 'GAP:synth_slab_no_columns', detail: 'no drawn column gives the floor level' });
    else {
      slabT = DF.use('synth.slab.thickness'); DF.use('synth.slab.footprint');
      var top = Math.min.apply(null, cols.map(function (b) { return b.z0; })), m = prismBox(x0, y0, top - slabT, x1, y1, top);
      els.push({ guid: 'synth-slab-ground', class: P.ifcType('slab').ifc_class, storey: storey, vertices: m.vertices, faces: m.faces, handle: 'synth', layer: '(synthetic)', sheet: '(set)', kind: 'slab', prov: 'derived',
        ifc: P.ifcType('slab', 'Ground floor slab', null), mark: null, z0: r6(top - slabT), z1: r6(top), height_source: 'derived', size: { t: { number: slabT, source: 'default' } }, members: [] });
    }
    // ---- gabled roof from the end-gable panels ----
    var pan = bodies.filter(function (b) { return b.kind === 'panel'; });
    if (!pan.length) gaps.push({ code: 'GAP:synth_roof_no_gable', detail: 'no end-gable panel gives the roof profile' });
    else {
      var bbox = function (b) { var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]; b.vertices.forEach(function (p) { for (var k = 0; k < 3; k++) { if (p[k] < mn[k]) mn[k] = p[k]; if (p[k] > mx[k]) mx[k] = p[k]; } }); return { mn: mn, mx: mx }; };
      var bb = pan.map(function (b) { return { b: b, bb: bbox(b) }; }), ridgeZ = Math.max.apply(null, bb.map(function (q) { return q.bb.mx[2]; }));
      // the end gable = the panels on the plane of the panel that reaches the ridge; the gable TOPS are those starting at the highest base (the lower panels start lower): that base is the eave
      var apex = bb.filter(function (q) { return Math.abs(q.bb.mx[2] - ridgeZ) < 1e-3; })[0], xc = (apex.bb.mn[0] + apex.bb.mx[0]) / 2;
      var grp = bb.filter(function (q) { return Math.abs((q.bb.mn[0] + q.bb.mx[0]) / 2 - xc) < 1e-3; }), eaveZ = Math.max.apply(null, grp.map(function (q) { return q.bb.mn[2]; }));
      var gt = grp.filter(function (q) { return Math.abs(q.bb.mn[2] - eaveZ) < 1e-3; });
      var ya = Math.min.apply(null, gt.map(function (q) { return q.bb.mn[1]; })), yb = Math.max.apply(null, gt.map(function (q) { return q.bb.mx[1]; }));
      var apexV = apex.b.vertices.filter(function (p) { return Math.abs(p[2] - ridgeZ) < 1e-3; }), yr = apexV.reduce(function (s, p) { return s + p[1]; }, 0) / apexV.length;
      var otherX = pan.map(function (b) { var q = bbox(b); return (q.mn[0] + q.mx[0]) / 2; }).filter(function (c) { return Math.abs(c - xc) > 0.5; });
      if (!otherX.length) gaps.push({ code: 'GAP:synth_roof_one_end', detail: 'only one end gable is drawn: the roof length is unknown' });
      else {
        roofT = DF.use('synth.roof.sheet_thickness'); overhang = DF.use('synth.roof.overhang');
        var xo = otherX.reduce(function (a, c) { return Math.abs(c - xc) > Math.abs(a - xc) ? c : a; }, otherX[0]), xa = Math.min(xc, xo) - overhang, xb = Math.max(xc, xo) + overhang;
        var slope = Math.atan2(ridgeZ - eaveZ, Math.max(Math.abs(yr - ya), Math.abs(yb - yr))) * 180 / Math.PI;
        [['a', ya, yr], ['b', yb, yr]].forEach(function (s) {
          var m2 = slopeSlab(xa, xb, s[1], eaveZ, s[2], ridgeZ, roofT, true);
          els.push({ guid: 'synth-roof-' + s[0], class: P.ifcType('roof').ifc_class, storey: storey, vertices: m2.vertices, faces: m2.faces, handle: 'synth', layer: '(synthetic)', sheet: '(set)', kind: 'roof', prov: 'derived',
            ifc: P.ifcType('roof', 'Roof sheeting', null), mark: null, z0: r6(eaveZ), z1: r6(ridgeZ), height_source: 'derived', size: { t: { number: roofT, source: 'default' }, slope_deg: r6(slope) }, members: [] });
        });
      }
    }
    return { els: els, gaps: gaps, defaults: own ? DF.rows() : [] };
  }
  return { complete: complete };
});
