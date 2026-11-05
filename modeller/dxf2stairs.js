// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf2stairs.js — stair flights from their tread lines (prompts/DXF2BIM_ARCHITECT_REVIEW.md §D109 P7). Pure, Node + browser.
// Parallel lines of one length, evenly spaced, are nosings. The drawing states no riser: rise = (blondel_m - tread) / 2, a yellow rule. A plan cuts a stair at its cut line, so flights may stop short of the next level: reported, not stretched. Lines in no flight are counted, never a box.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory({ P: require('./dxf2prep.js'), BM: require('./dxf2beams.js') });
  else root.Dxf2Stairs = factory({ P: root.Dxf2Prep, BM: root.Dxf2Beams });
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';
  var P = D.P, clean = D.BM.parts.clean, r6 = function (v) { return Number(Number(v).toFixed(6)); }, NAME = /^STAIR\s+([A-Z0-9]{1,2})$/i, UP = /^UP$/i, MIN_LINES = 3;
  function flightsOf(lines, tol, tMin, tMax, wMin) {
    var groups = [], out = [], used = {};
    lines.slice().sort(function (a, b) { return b.l - a.l; }).forEach(function (s) { var g = groups.filter(function (o) { return Math.abs(o.ux * s.uy - o.uy * s.ux) * s.l <= tol; })[0]; if (g) g.lines.push(s); else groups.push({ ux: s.ux, uy: s.uy, lines: [s] }); });
    groups.forEach(function (g) {
      var nx = -g.uy, ny = g.ux, L = g.lines.map(function (s) { var p = s.a.x * g.ux + s.a.y * g.uy, q = s.b.x * g.ux + s.b.y * g.uy; return { s0: Math.min(p, q), s1: Math.max(p, q), c: s.a.x * nx + s.a.y * ny, h: s.handle }; }).sort(function (a, b) { return a.c - b.c; });
      var open = L.slice();
      while (open.length) {
        var a = open.shift(), run = [a], twins = [], step = null;
        for (var i = 0; i < open.length; i++) { var o = open[i], last = run[run.length - 1]; if (Math.abs(o.s0 - a.s0) > tol || Math.abs(o.s1 - a.s1) > tol) continue; var d = o.c - last.c; if (d < tMin / 2) { twins.push(o); continue; }   /* one nosing can be drawn as two close lines (measured 19 mm apart at a 280 mm tread) */ if (step === null) { if (d < tMin || d > tMax) break; step = d; } else if (Math.abs(d - step) > tol) break; run.push(o); }
        if (run.length >= MIN_LINES && a.s1 - a.s0 >= wMin) { run.concat(twins).forEach(function (q) { used[q.h] = 1; var at = open.indexOf(q); if (at >= 0) open.splice(at, 1); }); out.push({ g: g, nx: nx, ny: ny, run: run, step: step, s0: a.s0, s1: a.s1 }); }
      }
    });
    return { flights: out, used: used };
  }
  function buildStairs(sheets, opts) {
    opts = opts || {};
    var els = [], gaps = [], report = { flights: 0, treads: 0, lines_unread: 0, named: 0, named_built: 0, repeats: 0, short_m: {} }, DF = opts.DF, setting = function (k, d) { return DF && DF.has(k) ? DF.get(k) : d; };
    if (setting('stair.flights', 'read') !== 'read') return { els: els, gaps: gaps, report: report };
    var meta = (DF && DF.meta('stair.flights')) || {}, tolM = Number(setting('beam.edge_tol', 0.006)), tMinM = Number(meta.tread_min_m || 0), tMaxM = Number(meta.tread_max_m || 0), built = {}, seen = [];
    var plans = sheets.filter(function (s) { return s.role === 'plan'; }).sort(function (a, b) { return a.level - b.level; }), levels = plans.map(function (p) { return p.level; }).filter(function (l, i, a) { return a.indexOf(l) === i; }), names = {};
    plans.forEach(function (ps, pi) {
      var ly = ((ps.desc && ps.desc.layers) || []).filter(function (l) { return l.type === 'stairlines'; }).map(function (l) { return l.layer; }); if (!ly.length) return;
      var k = ps.factor, tol = tolM / k, lines = [], T = (ps.dxf.entities || []).filter(function (e) { return e.type === 'TEXT' || e.type === 'MTEXT'; }).map(function (e) { var q = e.position || e.startPoint || {}; return { t: clean(e.text), x: q.x, y: q.y }; });
      (ps.dxf.entities || []).forEach(function (e) { if (e.type !== 'LINE' || ly.indexOf(e.layer) < 0) return; var q = e.vertices, dx = q[1].x - q[0].x, dy = q[1].y - q[0].y, l = Math.hypot(dx, dy); if (l > tol) lines.push({ a: q[0], b: q[1], l: l, ux: dx / l, uy: dy / l, handle: String(e.handle) }); });
      var F = flightsOf(lines, tol, tMinM / k, tMaxM / k, Number(meta.width_min_m || 0) / k); report.lines_unread += lines.filter(function (s) { return !F.used[s.handle]; }).length;
      var labels = T.filter(function (q) { return NAME.test(q.t); }), ups = T.filter(function (q) { return UP.test(q.t); });
      labels.forEach(function (q) { names[q.t.toUpperCase()] = 1; });
      var mid = function (f) { var c = (f.run[0].c + f.run[f.run.length - 1].c) / 2, s = (f.s0 + f.s1) / 2; return { x: s * f.g.ux + c * f.nx, y: s * f.g.uy + c * f.ny }; }, dist = function (a, b) { return Math.hypot(a.x - b.x, a.y - b.y); };
      var fresh = F.flights.filter(function (f) { var m = mid(f), dup = seen.some(function (o) { return o.pi !== pi && dist(o.m, m) * k <= tolM + o.wm && Math.abs(o.n - f.run.length) <= 1; }); if (dup) report.repeats++; else seen.push({ pi: pi, m: m, n: f.run.length, wm: tolM }); return !dup; });
      var byName = {}; fresh.forEach(function (f) { var m = mid(f), nm = labels.slice().sort(function (a, b) { return dist(a, m) - dist(b, m); })[0]; var key = nm ? nm.t.toUpperCase() : '(unnamed)'; (byName[key] = byName[key] || []).push(f); });
      Object.keys(byName).sort().forEach(function (name) {
        var fl = byName[name], top = levels.filter(function (l) { return l > ps.level; })[0];
        if (top === undefined) { gaps.push({ code: 'GAP:stair_no_top', kind: 'stair', sheet: ps.name, detail: name + ': no plan level above ' + ps.level }); return; }
        var z = ps.level, blondel = Number(meta.blondel_m || 0);
        var c0 = mid(fl[0]), up = ups.slice().sort(function (a, b) { return dist(a, c0) - dist(b, c0); })[0], at = up ? { x: up.x, y: up.y } : c0, todo = fl.slice();
        while (todo.length) {
          todo.sort(function (a, b) { return dist(mid(a), at) - dist(mid(b), at); });
          var f = todo.shift(), R = f.run, rise = (blondel - f.step * k) / 2, endOf = function (q) { var s = (f.s0 + f.s1) / 2; return { x: s * f.g.ux + q.c * f.nx, y: s * f.g.uy + q.c * f.ny }; }, order = dist(endOf(R[0]), at) <= dist(endOf(R[R.length - 1]), at) ? R : R.slice().reverse(), V = [], Fa = [], step = f.step * k, w = (f.s1 - f.s0) * k;
          for (var i = 0; i + 1 < order.length; i++) {
            var c0i = order[i].c, c1i = order[i + 1].c, corner = function (s, c) { return [r6((s * f.g.ux + c * f.nx) * k), r6((s * f.g.uy + c * f.ny) * k)]; }, ring = [corner(f.s0, c0i), corner(f.s1, c0i), corner(f.s1, c1i), corner(f.s0, c1i)], zb = r6(z + i * rise), zt = r6(z + (i + 1) * rise);
            var m = P.Solid.box(ring.map(function (q) { return [q[0], q[1], zb]; }).concat(ring.map(function (q) { return [q[0], q[1], zt]; }))), base = V.length; V = V.concat(m.vertices); Fa = Fa.concat(m.faces.map(function (t) { return t.map(function (n) { return n + base; }); }));
          }
          var zEnd = z + (order.length - 1) * rise, hd = String(order[0].h);
          if (DF && DF.has('stair.flights')) DF.use('stair.flights');
          report.flights++; report.treads += order.length - 1; built[name] = 1;
          els.push({ guid: 'body-stair-' + pi + '-' + hd, class: 'IfcStairFlight', storey: 'Level ' + (levels.indexOf(ps.level) + 1), vertices: V, faces: Fa, handle: hd, layer: ly[0], sheet: ps.name, kind: 'stair', mark: name, members: order.map(function (q) { return q.h; }), z0: r6(z), z1: r6(zEnd),
            size: { treads: order.length - 1, tread: { value: r6(step), source: 'drawn' }, width: { value: r6(w), source: 'drawn' }, rise: { value: r6(rise), source: '(blondel_m - tread) / 2' } }, height_source: 'plans', prov: 'generated', ifc: P.ifcType('stairlines', name, null) });
          z = zEnd + rise; at = endOf(order[order.length - 1]);
        }
        report.short_m[name + '@' + ps.level] = r6(top - z);
      });
    });
    report.named = Object.keys(names).length; report.named_built = Object.keys(names).filter(function (n) { return built[n]; }).length;
    return { els: els, gaps: gaps, report: report };
  }
  return { buildStairs: buildStairs };
});
