// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf2walls.js — walls from their plan lines, in any direction (prompts/DXF2BIM_ARCHITECT_REVIEW.md §D109 P3). Pure, Node + browser.
// A layer typed `wallband` holds wall lines. One wall may be several lines (its leaves): lines of one direction closer than wall.band_gap are one wall, solid from outer line to outer line.
// With no wall type schedule a leaf cannot be told from a cavity: that is stated in the setting's basis. A line alone is counted, never a box. An arc is counted, not built.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory({ P: require('./dxf2prep.js') });
  else root.Dxf2Walls = factory({ P: root.Dxf2Prep });
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';
  var P = D.P, r6 = function (v) { return Number(Number(v).toFixed(6)); };
  function buildWalls(sheets, opts) {
    opts = opts || {};
    var els = [], gaps = [], report = { lines_m: 0, covered_m: 0, single_m: 0, curved_m: 0, walls: 0 }, DF = opts.DF;
    var setting = function (k, d) { return DF && DF.has(k) ? DF.get(k) : d; };
    var gapM = Number(setting('wall.band_gap', 0.35)), tolM = Number(setting('loops.skew_tol', 0.001)); if (!(gapM > 0)) return { els: els, gaps: gaps, report: report };
    var plans = sheets.filter(function (s) { return s.role === 'plan'; }).sort(function (a, b) { return a.level - b.level; }), levels = plans.map(function (p) { return p.level; }).filter(function (l, i, a) { return a.indexOf(l) === i; });
    plans.forEach(function (ps, pi) {
      var ly = ((ps.desc && ps.desc.layers) || []).filter(function (l) { return l.type === 'wallband'; }).map(function (l) { return l.layer; }); if (!ly.length) return;
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
        var open = [];   // open walls of this direction: { c0, c1, s0, s1, lines }
        for (var i = 0; i + 1 < cuts.length; i++) {
          var a0 = cuts[i], a1 = cuts[i + 1], mid = (a0 + a1) / 2, on = L.filter(function (q) { return q.s0 <= mid && q.s1 >= mid; }).sort(function (m, n) { return m.c - n.c; }), bands = [];
          on.forEach(function (q) { var b = bands[bands.length - 1]; if (b && q.c - b.c1 <= gap) { b.c1 = q.c; b.lines.push(q); } else bands.push({ c0: q.c, c1: q.c, lines: [q] }); });
          var still = [];
          bands.forEach(function (b) {
            if (b.lines.length < 2 || b.c1 - b.c0 <= tol) { report.single_m += (a1 - a0) * k * b.lines.length; return; }
            b.lines.forEach(function (q) { covered[q.handle] = covered[q.handle] || 0; }); report.covered_m += (a1 - a0) * k * b.lines.length;
            var o = open.filter(function (w) { return Math.abs(w.c0 - b.c0) <= tol && Math.abs(w.c1 - b.c1) <= tol && a0 - w.s1 <= tol; })[0];
            if (o) { o.s1 = a1; o.n = Math.max(o.n, b.lines.length); b.lines.forEach(function (q) { o.members[q.handle] = 1; }); still.push(o); open.splice(open.indexOf(o), 1); }
            else { var mem = {}; b.lines.forEach(function (q) { mem[q.handle] = 1; }); still.push({ c0: b.c0, c1: b.c1, s0: a0, s1: a1, n: b.lines.length, members: mem }); }
          });
          open.forEach(emit); open = still;
        }
        open.forEach(emit);
        function emit(w) {
          var t = w.c1 - w.c0, len = w.s1 - w.s0; if (len <= t) { report.stub_m = (report.stub_m || 0) + len * k; return; }   // shorter than it is thick: a wall's end, not a wall
          var first = Object.keys(w.members)[0], guid = 'body-wall-' + pi + '-' + report.walls;
          if (top === undefined) { gaps.push({ code: 'GAP:wall_no_top', kind: 'wall', sheet: ps.name, handle: first, detail: 'plan level ' + ps.level + ' has no plan level above it' }); return; }
          var corner = function (s, c) { return [r6((s * g.ux + c * nx) * k), r6((s * g.uy + c * ny) * k)]; }, ring = [corner(w.s0, w.c0), corner(w.s1, w.c0), corner(w.s1, w.c1), corner(w.s0, w.c1)];
          var mesh = P.Solid.box(ring.map(function (c) { return [c[0], c[1], ps.level]; }).concat(ring.map(function (c) { return [c[0], c[1], top]; })));
          report.walls++;
          els.push({ guid: guid, class: 'IfcWall', storey: 'Level ' + (levels.indexOf(ps.level) + 1), vertices: mesh.vertices, faces: mesh.faces, handle: first, layer: ly[0], sheet: ps.name, kind: 'wall', mark: null, members: Object.keys(w.members), z0: ps.level, z1: top,
            size: { t: { value: r6(t * k), source: 'drawn' }, length: { value: r6(len * k), source: 'drawn' }, lines: w.n, top: { value: top, source: 'next plan level' } }, height_source: 'plans', prov: 'derived', ifc: P.ifcType('wallband', null, null) });
        }
      });
      if (els.length > before && DF && DF.has('wall.band_gap')) DF.use('wall.band_gap');
    });
    if (report.curved_m > 0) gaps.push({ code: 'GAP:wall_curved', kind: 'wall', detail: 'wall arcs not built: ' + r6(report.curved_m) + ' m' });
    ['lines_m', 'covered_m', 'single_m', 'curved_m'].forEach(function (q) { report[q] = r6(report[q]); });
    return { els: els, gaps: gaps, report: report };
  }
  return { buildWalls: buildWalls };
});
