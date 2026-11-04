// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf2roofspots.js — a roof surface through a plan's own TOS spot levels (prompts/DXF2BIM_ARCHITECT_REVIEW.md §D109 P8). Pure, Node + browser.
// Derived, and says so: the surface reaches only as far as the spots, nothing states the roof's edge. Its fit is reported at each spot left out in turn; a spot outside the others' hull judges nothing and is counted as such.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory({ P: require('./dxf2prep.js'), BM: require('./dxf2beams.js') });
  else root.Dxf2RoofSpots = factory({ P: root.Dxf2Prep, BM: root.Dxf2Beams });
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';
  var P = D.P, clean = D.BM.parts.clean, r6 = function (v) { return Number(Number(v).toFixed(6)); }, TOS = /^TOS\b[^+-]*([+-]\d+\.\d+)/i, DECK = /\d+\s*MM\s+ABOVE\s+T\/STEEL/i;
  // Bowyer-Watson over a super-triangle; points [x, y, z]; returns triangles as index triples
  function delaunay(pts) {
    var xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; }), cx = (Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2, cy = (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2, R = Math.max(Math.max.apply(null, xs) - Math.min.apply(null, xs), Math.max.apply(null, ys) - Math.min.apply(null, ys)) * 1000 + 1;
    var V = pts.concat([[cx - 2 * R, cy - R], [cx + 2 * R, cy - R], [cx, cy + 2 * R]]), n = pts.length, T = [[n, n + 1, n + 2]];
    var inCircle = function (t, p) { var a = V[t[0]], b = V[t[1]], c = V[t[2]], ax = a[0] - p[0], ay = a[1] - p[1], bx = b[0] - p[0], by = b[1] - p[1], cx2 = c[0] - p[0], cy2 = c[1] - p[1], det = (ax * ax + ay * ay) * (bx * cy2 - cx2 * by) - (bx * bx + by * by) * (ax * cy2 - cx2 * ay) + (cx2 * cx2 + cy2 * cy2) * (ax * by - bx * ay), o = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); return o > 0 ? det > 0 : det < 0; };
    pts.forEach(function (p, i) {
      var bad = [], keep = []; T.forEach(function (t) { (inCircle(t, p) ? bad : keep).push(t); });
      var edges = {}; bad.forEach(function (t) { [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]].forEach(function (e) { var k = Math.min(e[0], e[1]) + '_' + Math.max(e[0], e[1]); edges[k] = edges[k] ? null : e; }); });
      T = keep; Object.keys(edges).forEach(function (k) { if (edges[k]) T.push([edges[k][0], edges[k][1], i]); });
    });
    return T.filter(function (t) { return t.every(function (q) { return q < n; }); });
  }
  function zAt(pts, tris, x, y) {
    for (var i = 0; i < tris.length; i++) {
      var a = pts[tris[i][0]], b = pts[tris[i][1]], c = pts[tris[i][2]], det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]); if (!det) continue;
      var u = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / det, v = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / det, w = 1 - u - v;
      if (u >= 0 && v >= 0 && w >= 0) return u * a[2] + v * b[2] + w * c[2];
    }
    return null;
  }
  function buildRoof(sheets, opts) {
    opts = opts || {};
    var els = [], gaps = [], report = { spots: 0 }, DF = opts.DF, setting = function (k, d) { return DF && DF.has(k) ? DF.get(k) : d; };
    if (setting('roof.from_spots', 'read') !== 'read') return { els: els, gaps: gaps, report: report };
    var meta = (DF && DF.meta('roof.from_spots')) || {}, plans = sheets.filter(function (s) { return s.role === 'plan'; }).sort(function (a, b) { return a.level - b.level; }), levels = plans.map(function (p) { return p.level; }).filter(function (l, i, a) { return a.indexOf(l) === i; }), best = null;
    plans.forEach(function (ps) { var T = (ps.dxf.entities || []).filter(function (e) { return e.type === 'TEXT' || e.type === 'MTEXT'; }).map(function (e) { var q = e.position || e.startPoint || {}; return { t: clean(e.text), x: q.x, y: q.y }; }), S = T.filter(function (q) { return TOS.test(q.t); }); if (S.length && (!best || S.length >= best.S.length)) best = { ps: ps, T: T, S: S }; });
    if (!best) return { els: els, gaps: gaps, report: report };
    var k = best.ps.factor, seen = {}, pts = [];
    best.S.forEach(function (q) { var key = q.x + ',' + q.y; if (seen[key]) return; seen[key] = 1; pts.push([q.x * k, q.y * k, Number(TOS.exec(q.t)[1])]); });
    report.spots = pts.length; report.sheet = best.ps.name;
    if (pts.length < 3) { gaps.push({ code: 'GAP:roof_too_few_spots', kind: 'roof', sheet: best.ps.name, detail: pts.length + ' TOS spots' }); return { els: els, gaps: gaps, report: report }; }
    if (!best.T.some(function (q) { return DECK.test(q.t); })) { gaps.push({ code: 'GAP:roof_no_deck_note', kind: 'roof', sheet: best.ps.name, detail: 'no note states the deck over the steel: no deck is assumed' }); return { els: els, gaps: gaps, report: report }; }
    var tris = delaunay(pts), up = Number(meta.deck_above_steel_m || 0), thick = Number(meta.deck_thick_m || 0), V = [], F = [];
    tris.forEach(function (t) {   // an open-seamed plate: each triangle its own prism, top and bottom follow the surface, so the volume is the plan area x the thickness
      var a = pts[t[0]], b = pts[t[1]], c = pts[t[2]], o = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]), R = o > 0 ? [a, b, c] : [a, c, b], n = V.length;
      R.forEach(function (p) { V.push([r6(p[0]), r6(p[1]), r6(p[2] + up - thick)]); }); R.forEach(function (p) { V.push([r6(p[0]), r6(p[1]), r6(p[2] + up)]); });
      [[3, 4, 5], [0, 2, 1], [0, 1, 4], [0, 4, 3], [1, 2, 5], [1, 5, 4], [2, 0, 3], [2, 3, 5]].forEach(function (f) { F.push([f[0] + n, f[1] + n, f[2] + n]); });
    });
    // the fit: each spot left out in turn
    var errs = [], outside = 0; pts.forEach(function (p, i) { var rest = pts.filter(function (_, j) { return j !== i; }); if (rest.length < 3) { outside++; return; } var z = zAt(rest, delaunay(rest), p[0], p[1]); if (z === null) outside++; else errs.push(Math.abs(z - p[2])); });
    report.fit = { judged: errs.length, outside: outside, max_m: errs.length ? r6(Math.max.apply(null, errs)) : null, mean_m: errs.length ? r6(errs.reduce(function (a, b) { return a + b; }, 0) / errs.length) : null, errors_m: errs.map(r6) };
    if (!errs.length) report.fit.verdict = 'INCONCLUSIVE: no spot lies inside the others';
    var zs = V.map(function (v) { return v[2]; }), z0 = Math.min.apply(null, zs), z1 = Math.max.apply(null, zs), lv = levels.filter(function (l) { return l <= z1; }).pop(); if (lv === undefined) lv = levels[0];
    if (DF && DF.has('roof.from_spots')) DF.use('roof.from_spots');
    els.push({ guid: 'body-roof-spots', class: 'IfcRoof', storey: 'Level ' + (levels.indexOf(lv) + 1), vertices: V, faces: F, handle: 'roof-spots', layer: '', sheet: best.ps.name, kind: 'roof', mark: null, members: [], z0: z0, z1: z1,
      size: { spots: pts.length, triangles: tris.length, thickness: { value: thick, source: 'note' }, outline: { source: 'the convex hull of the spots, not a drawn edge' } }, height_source: 'label', prov: 'derived', ifc: Object.assign(P.ifcType('roof', null, null), { PredefinedType: 'FREEFORM' }) });
    return { els: els, gaps: gaps, report: report };
  }
  return { buildRoof: buildRoof, delaunay: delaunay, zAt: zAt };
});
