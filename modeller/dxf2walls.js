// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf2walls.js — walls from their plan lines, in any direction (prompts/DXF2BIM_ARCHITECT_REVIEW.md §D109 P3). Pure, Node + browser.
// A layer typed `wallband` holds wall lines. One wall may be several lines (its leaves): lines of one direction closer than wall.band_gap are one wall, solid from outer line to outer line.
// With no wall type schedule a leaf cannot be told from a cavity: that is stated in the setting's basis. A line alone is counted, never a box. An arc is counted, not built.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory({ P: require('./dxf2prep.js'), S: require('./dxf2bim/dxf2shell.js') });
  else root.Dxf2Walls = factory({ P: root.Dxf2Prep, S: root.Dxf2Shell });
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';
  var P = D.P, S = D.S, r6 = function (v) { return Number(Number(v).toFixed(6)); };
  function buildWalls(sheets, opts) {
    opts = opts || {};
    var KIND = opts.kind || 'wallband', CLS = P.ifcType(KIND).ifc_class, TAG = KIND === 'wallband' ? 'wall' : 'curtain', els = [], gaps = [], report = { lines_m: 0, covered_m: 0, single_m: 0, curved_m: 0, thin_m: 0, walls: 0 }, DF = opts.DF;
    var setting = function (k, d) { return DF && DF.has(k) ? DF.get(k) : d; };
    var gapM = Number(setting('wall.band_gap', 0.35)), tolM = Number(setting('loops.skew_tol', 0.001)), thinM = Number(setting('wall.min_thick', 0.05)); if (!(gapM > 0)) return { els: els, gaps: gaps, report: report };
    var plans = sheets.filter(function (s) { return s.role === 'plan'; }).sort(function (a, b) { return a.level - b.level; }), levels = plans.map(function (p) { return p.level; }).filter(function (l, i, a) { return a.indexOf(l) === i; });
    plans.forEach(function (ps, pi) {
      var ly = ((ps.desc && ps.desc.layers) || []).filter(function (l) { return l.type === KIND; }).map(function (l) { return l.layer; }); if (!ly.length) return;
      var k = ps.factor, gap = gapM / k, tol = tolM / k, segs = [], top = levels.filter(function (l) { return l > ps.level; })[0], before = els.length;
      (ps.dxf.entities || []).forEach(function (e) {
        if (ly.indexOf(e.layer) < 0) return;
        if (e.type === 'ARC') { var ang = e.endAngle - e.startAngle; if (ang < 0) ang += 2 * Math.PI; report.curved_m += Math.abs(ang) * e.radius * k; return; }
        var vs = e.type === 'LINE' ? [e.vertices] : e.type === 'LWPOLYLINE' ? e.vertices.slice(1).map(function (v, i) { return [e.vertices[i], v]; }).concat(e.shape ? [[e.vertices[e.vertices.length - 1], e.vertices[0]]] : []) : [];
        vs.forEach(function (q) { var dx = q[1].x - q[0].x, dy = q[1].y - q[0].y, l = Math.hypot(dx, dy); if (!(l > tol)) return; report.lines_m += l * k; segs.push({ a: q[0], b: q[1], l: l, ux: dx / l, uy: dy / l, handle: String(e.handle) }); });
      });
      // direction groups: a line joins a group when the turn moves its far end by no more than the tolerance
      var groups = []; segs.slice().sort(function (a, b) { return b.l - a.l; }).forEach(function (s) { var g = groups.filter(function (o) { return Math.abs(o.ux * s.uy - o.uy * s.ux) * s.l <= tol; })[0]; if (g) g.lines.push(s); else groups.push({ ux: s.ux, uy: s.uy, lines: [s] }); });
      var covered = {};
      groups.forEach(function (g) {
        var nx = -g.uy, ny = g.ux, L = g.lines.map(function (s) { var p = s.a.x * g.ux + s.a.y * g.uy, q = s.b.x * g.ux + s.b.y * g.uy, c = (s.a.x * nx + s.a.y * ny + s.b.x * nx + s.b.y * ny) / 2; return { s0: Math.min(p, q), s1: Math.max(p, q), c: c, handle: s.handle, l: s.l }; });   // either drawing sense: both ends projected on the group's direction
        var cuts = L.reduce(function (a, q) { a.push(q.s0, q.s1); return a; }, []).sort(function (m, n) { return m - n; }).filter(function (v, i, a) { return !i || v - a[i - 1] > tol; });
        var parts = [];   // every stretch of wall in this direction: { c0, c1, s0, s1, n, members }
        for (var i = 0; i + 1 < cuts.length; i++) {
          var a0 = cuts[i], a1 = cuts[i + 1], mid = (a0 + a1) / 2, on = L.filter(function (q) { return q.s0 <= mid && q.s1 >= mid; }).sort(function (m, n) { return m.c - n.c; }), bands = [];
          on.forEach(function (q) { var b = bands[bands.length - 1]; if (b && q.c - b.c1 <= gap) { b.c1 = q.c; b.lines.push(q); } else bands.push({ c0: q.c, c1: q.c, lines: [q] }); });
          bands.forEach(function (b) {
            if (b.lines.length < 2 || b.c1 - b.c0 <= tol) { report.single_m += (a1 - a0) * k * b.lines.length; return; }
            if (KIND === 'wallband' && (b.c1 - b.c0) * k < thinM) { report.thin_m += (a1 - a0) * k * b.lines.length; return; }   // a finish line, not a wall
            report.covered_m += (a1 - a0) * k * b.lines.length;
            var mem = {}; b.lines.forEach(function (q) { mem[q.handle] = 1; }); parts.push({ c0: b.c0, c1: b.c1, s0: a0, s1: a1, n: b.lines.length, members: mem });
          });
        }
        // §D109 P3b one wall: stretches that follow each other along the line and overlap across it
        var par = parts.map(function (_, q) { return q; }), find = function (q) { while (par[q] !== q) q = par[q] = par[par[q]]; return q; };
        parts.forEach(function (A, x) { parts.forEach(function (B, y) { if (y <= x) return; var touch = Math.abs(B.s0 - A.s1) <= tol || Math.abs(A.s0 - B.s1) <= tol, over = Math.min(A.c1, B.c1) - Math.max(A.c0, B.c0); if (touch && over > tol) par[find(y)] = find(x); }); });
        var walls = {}; parts.forEach(function (A, x) { (walls[find(x)] = walls[find(x)] || []).push(A); });
        Object.keys(walls).forEach(function (w) { emit(walls[w]); });
        function emit(W) {
          var s0 = Math.min.apply(null, W.map(function (q) { return q.s0; })), s1 = Math.max.apply(null, W.map(function (q) { return q.s1; })), len = s1 - s0, ts = W.map(function (q) { return q.c1 - q.c0; }), tMax = Math.max.apply(null, ts), tMin = Math.min.apply(null, ts);
          if (len <= tMax) { report.stub_m = (report.stub_m || 0) + len * k; return; }   // shorter than it is thick: a wall's end, not a wall
          var mem = {}, nMax = 0; W.forEach(function (q) { Object.keys(q.members).forEach(function (h) { mem[h] = 1; }); if (q.n > nMax) nMax = q.n; }); var first = Object.keys(mem)[0], guid = 'body-' + TAG + '-' + pi + '-' + report.walls;
          if (top === undefined) { gaps.push({ code: 'GAP:wall_no_top', kind: TAG, sheet: ps.name, handle: first, detail: 'plan level ' + ps.level + ' has no plan level above it' }); return; }
          var uniq = function (f) { var v = []; W.forEach(function (q) { f(q).forEach(function (x) { v.push(x); }); }); v.sort(function (m, n) { return m - n; }); return v.filter(function (x, q) { return !q || x - v[q - 1] > tol; }); };
          var X = uniq(function (q) { return [q.s0, q.s1]; }), Y = uniq(function (q) { return [q.c0, q.c1]; }), solid = [];
          for (var j = 0; j + 1 < Y.length; j++) { solid.push([]); for (var i2 = 0; i2 + 1 < X.length; i2++) { var cu = (X[i2] + X[i2 + 1]) / 2, cv = (Y[j] + Y[j + 1]) / 2; solid[j].push(W.some(function (q) { return cu > q.s0 && cu < q.s1 && cv > q.c0 - tol && cv < q.c1 + tol; })); } }
          var pm = S.prismCells(X.map(function (v) { return v * k; }), Y.map(function (v) { return v * k; }), solid, ps.level, top); if (!pm) return;
          var V = pm.vertices.map(function (v) { return [r6(v[0] * g.ux + v[1] * nx), r6(v[0] * g.uy + v[1] * ny), v[2]]; }), longest = W.slice().sort(function (a, b) { return (b.s1 - b.s0) - (a.s1 - a.s0); })[0];
          report.walls++;
          els.push({ guid: guid, class: CLS, storey: 'Level ' + (levels.indexOf(ps.level) + 1), vertices: V, faces: pm.faces, handle: first, layer: ly[0], sheet: ps.name, kind: TAG, mark: null, members: Object.keys(mem), z0: ps.level, z1: top,
            size: { t: { value: r6((longest.c1 - longest.c0) * k), source: 'drawn' }, t_min: r6(tMin * k), t_max: r6(tMax * k), stretches: W.length, length: { value: r6(len * k), source: 'drawn' }, lines: nMax, top: { value: top, source: 'next plan level' } }, height_source: 'plans', prov: 'derived', ifc: P.ifcType(KIND, null, null) });
        }
      });
      if (els.length > before && DF && DF.has('wall.band_gap')) DF.use('wall.band_gap');
    });
    if (report.curved_m > 0) gaps.push({ code: 'GAP:wall_curved', kind: TAG, detail: TAG + ' arcs not built: ' + r6(report.curved_m) + ' m' });
    ['lines_m', 'covered_m', 'single_m', 'curved_m', 'thin_m'].forEach(function (q) { report[q] = r6(report[q]); });
    return { els: els, gaps: gaps, report: report };
  }
  return { buildWalls: buildWalls };
});
