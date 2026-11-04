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
          els.push({ guid: guid, storey_level: ps.level, axis: { u: [g.ux, g.uy], s0: s0 * k, s1: s1 * k, c0: Math.min.apply(null, Y) * k, c1: Math.max.apply(null, Y) * k }, class: CLS, storey: 'Level ' + (levels.indexOf(ps.level) + 1), vertices: V, faces: pm.faces, handle: first, layer: ly[0], sheet: ps.name, kind: TAG, mark: null, members: Object.keys(mem), z0: ps.level, z1: top,
            size: { t: { value: r6((longest.c1 - longest.c0) * k), source: 'drawn' }, t_min: r6(tMin * k), t_max: r6(tMax * k), stretches: W.length, length: { value: r6(len * k), source: 'drawn' }, lines: nMax, top: { value: top, source: 'next plan level' } }, height_source: 'plans', prov: 'derived', ifc: P.ifcType(KIND, null, null) });
        }
      });
      if (els.length > before && DF && DF.has('wall.band_gap')) DF.use('wall.band_gap');
    });
    if (report.curved_m > 0) gaps.push({ code: 'GAP:wall_curved', kind: TAG, detail: TAG + ' arcs not built: ' + r6(report.curved_m) + ' m' });
    ['lines_m', 'covered_m', 'single_m', 'curved_m', 'thin_m'].forEach(function (q) { report[q] = r6(report[q]); });
    return { els: els, gaps: gaps, report: report };
  }
  // §D110 (c) wall tags on a plan layer typed `walltag`: the nearest wall of that plan's level takes the tag as its type name. A name, by distance, unchecked.
  var TAGFORM = /^[A-Z]{2,3}(?:\d{2})?[a-z]?$/, cleanT = function (t) { return String(t).replace(/\\[A-Za-z][^;\\]*;/g, '').replace(/\\P/g, ' ').replace(/[{}]/g, '').trim(); };
  var distTo = function (e, x, y) { var a = e.axis, nx = -a.u[1], ny = a.u[0], s = x * a.u[0] + y * a.u[1], c = x * nx + y * ny, ds = Math.max(a.s0 - s, 0, s - a.s1), dc = Math.max(a.c0 - c, 0, c - a.c1); return Math.hypot(ds, dc); };
  function readTags(sheets, els, opts) {
    var DF = opts.DF, reach = Number(DF && DF.has('wall.tag_reach') ? DF.get('wall.tag_reach') : 0), rep = { labels: 0, bound: 0, no_wall: 0, walls_typed: 0, two_tags: 0 }; if (!(reach > 0)) return rep;
    sheets.filter(function (s) { return s.role === 'plan'; }).forEach(function (ps) {
      var ly = ((ps.desc && ps.desc.layers) || []).filter(function (l) { return l.type === 'walltag'; }).map(function (l) { return l.layer; }); if (!ly.length) return;
      var k = ps.factor, W = els.filter(function (e) { return e.axis && e.z0 === ps.level; });
      (ps.dxf.entities || []).filter(function (e) { return (e.type === 'TEXT' || e.type === 'MTEXT') && ly.indexOf(e.layer) >= 0 && TAGFORM.test(cleanT(e.text)); }).map(function (e) { var q = e.position || e.startPoint || {}; return { t: cleanT(e.text), x: q.x * k, y: q.y * k }; }).sort(function (a, b) { return a.x - b.x || a.y - b.y || (a.t < b.t ? -1 : 1); }).forEach(function (q) {
        rep.labels++;
        var best = null, bd = Infinity; W.forEach(function (e) { var d = distTo(e, q.x, q.y); if (d < bd) { bd = d; best = e; } });
        if (!best || bd > reach) { rep.no_wall++; return; }
        rep.bound++; var sz = best.size; if (DF && DF.has('wall.tag_reach')) DF.use('wall.tag_reach');
        if (!sz.type) { sz.type = { value: q.t, source: 'tag', sheet: ps.name, dist_m: r6(bd) }; best.ifc = Object.assign({}, best.ifc, { type_name: q.t }); rep.walls_typed++; }
        else if (sz.type.value !== q.t) { rep.two_tags++; if (bd < sz.type.dist_m) { sz.type_also = sz.type.value; sz.type = { value: q.t, source: 'tag', sheet: ps.name, dist_m: r6(bd) }; best.ifc = Object.assign({}, best.ifc, { type_name: q.t }); } else sz.type_also = q.t; }
      });
    });
    return rep;
  }
  // §D110 (a) a wall on the grid line an elevation stands on takes its top and base from that elevation's wall lines over its own span. Lines of the elevation elsewhere along the line say nothing about it.
  // On one line a wall with another plan's wall above stops at its own top, a wall with one below keeps its base. Off the lines, inside the rectangle of a wing's end lines: no higher than the wing's top.
  function topsFromElevations(sheets, els, opts) {
    var DF = opts.DF, PN = opts.PN, rep = { on_line: 0, wing_capped: 0, no_span: 0, conflict: 0, ambiguous: 0, elevations: 0 };
    if (!DF || !DF.has('wall.top_from_elevation') || String(DF.get('wall.top_from_elevation')) !== 'read' || !PN) return null;
    var meta = DF.meta('wall.top_from_elevation') || {}, reach = Number(meta.line_reach_m), lyr = new RegExp(meta.elev_layer || '^A-WALL'), plans = sheets.filter(function (s) { return s.role === 'plan'; }), tol = Number(meta.z_tol_m), para = Number(meta.parallel_tol), fam = function (l) { var m = /^([A-Z])[A-Z0-9]+$/.exec(l); return m ? m[1] : ''; };
    var E = [];
    sheets.filter(function (s) { return s.role === 'elev' && s.desc && s.desc.plane !== undefined && s.desc.zs && s.desc.zs.length >= 2; }).forEach(function (es) {
      var base = plans.filter(function (p) { return PN.gridLine(p.desc, es.desc.plane, p.factor); })[0]; if (!base) return;
      var L = PN.gridLine(base.desc, es.desc.plane, base.factor), k = es.factor, z0 = es.desc.zs[0], zOf = function (y) { return z0.z + (y - z0.y) * k; }, segs = [];
      (es.dxf.entities || []).forEach(function (e) { if (!lyr.test(e.layer) || (e.type !== 'LINE' && e.type !== 'LWPOLYLINE')) return; (e.vertices || []).forEach(function (v, i, a) { if (!i) return; segs.push({ h0: Math.min(a[i - 1].x, v.x), h1: Math.max(a[i - 1].x, v.x), lo: Math.min(zOf(a[i - 1].y), zOf(v.y)), hi: Math.max(zOf(a[i - 1].y), zOf(v.y)) }); }); });
      if (!segs.length) return;
      var hs = segs.reduce(function (a, q) { a.push(q.h0, q.h1); return a; }, []), hc = (Math.min.apply(null, hs) + Math.max.apply(null, hs)) / 2, pf = PN.planeFit(base, es.desc, { k: k, hc: hc, mode: 'centre_on_wing' });
      var onS = pf && pf.fit === 'grid' ? function (q) { var a = pf.sg * q.h0 * k + pf.off, b = pf.sg * q.h1 * k + pf.off; return [Math.min(a, b), Math.max(a, b)]; } : null;   // no grid fit: the sheet's whole height speaks for the whole line, said by `whole_sheet`
      segs.forEach(function (q) { var sp = onS ? onS(q) : [-Infinity, Infinity]; q.s0 = sp[0]; q.s1 = sp[1]; });
      E.push({ plane: es.desc.plane, fam: fam(String(es.desc.plane)), L: L, n: [-L.u[1], L.u[0]], segs: segs, top: Math.max.apply(null, segs.map(function (q) { return q.hi; })), whole_sheet: !onS, sheet: es.name });
    });
    rep.elevations = E.length; rep.whole_sheet = E.filter(function (e) { return e.whole_sheet; }).length; if (!E.length) return rep;
    // a wing: its family's lines; per direction, the span between the outer lines
    var wings = {}; E.forEach(function (e) { (wings[e.fam] = wings[e.fam] || { top: -Infinity, lines: [] }).lines.push(e); wings[e.fam].top = Math.max(wings[e.fam].top, e.top); });
    var inWing = function (w, x, y, m) { var dirs = []; w.lines.forEach(function (e) { var d = dirs.filter(function (o) { return Math.abs(o.n[0] * e.n[1] - o.n[1] * e.n[0]) < para; })[0], c = e.L.p[0] * (d ? d.n[0] : e.n[0]) + e.L.p[1] * (d ? d.n[1] : e.n[1]); if (d) d.c.push(c); else dirs.push({ n: e.n, c: [c] }); }); var two = dirs.filter(function (d) { return d.c.length >= 2; }); return two.length >= 2 && two.every(function (d) { var v = x * d.n[0] + y * d.n[1]; return v >= Math.min.apply(null, d.c) - m && v <= Math.max.apply(null, d.c) + m; }); };
    var W = els.filter(function (e) { return e.class === 'IfcWall' && e.axis; }), on = [];
    W.forEach(function (w) {
      var a = w.axis, cm = (a.c0 + a.c1) / 2, sm = (a.s0 + a.s1) / 2, x = sm * a.u[0] - cm * a.u[1], y = sm * a.u[1] + cm * a.u[0], cand = E.filter(function (e) { return Math.abs(a.u[0] * e.L.u[1] - a.u[1] * e.L.u[0]) < para && Math.abs((x - e.L.p[0]) * e.n[0] + (y - e.L.p[1]) * e.n[1]) <= reach && inWing(wings[e.fam], x, y, reach); });
      w._c = [x, y];
      if (!cand.length) return;
      var e = cand.sort(function (p, q) { return Math.abs((x - p.L.p[0]) * p.n[0] + (y - p.L.p[1]) * p.n[1]) - Math.abs((x - q.L.p[0]) * q.n[0] + (y - q.L.p[1]) * q.n[1]) || (p.plane < q.plane ? -1 : 1); })[0], q0 = [a.s0 * a.u[0] - cm * a.u[1], a.s0 * a.u[1] + cm * a.u[0]], q1 = [a.s1 * a.u[0] - cm * a.u[1], a.s1 * a.u[1] + cm * a.u[0]];
      var sa = (q0[0] - e.L.p[0]) * e.L.u[0] + (q0[1] - e.L.p[1]) * e.L.u[1], sb = (q1[0] - e.L.p[0]) * e.L.u[0] + (q1[1] - e.L.p[1]) * e.L.u[1], s0 = Math.min(sa, sb), s1 = Math.max(sa, sb), over = e.segs.filter(function (q) { return q.s1 >= s0 && q.s0 <= s1; });
      if (!over.length) { rep.no_span++; return; }
      on.push({ w: w, e: e, s0: s0, s1: s1, top: Math.max.apply(null, over.map(function (q) { return q.hi; })), base: Math.min.apply(null, over.map(function (q) { return q.lo; })), z0: w.z0, z1: w.z1 });
    });
    var setZ = function (w, nb, nt) { var ob = w.z0, ot = w.z1; w.vertices = w.vertices.map(function (v) { return [v[0], v[1], v[2] === ot ? nt : v[2] === ob ? nb : v[2]]; }); w.z0 = nb; w.z1 = nt; };
    on.forEach(function (o) {
      var same = on.filter(function (p) { return p !== o && p.e.plane === o.e.plane && Math.min(p.s1, o.s1) - Math.max(p.s0, o.s0) > tol; }), above = same.some(function (p) { return p.z0 > o.z0; }), below = same.some(function (p) { return p.z0 < o.z0; });
      var nt = above ? o.z1 : Number(o.top.toFixed(6)), nb = below ? o.z0 : Number(o.base.toFixed(6));
      if (!(nt > nb) || (above && o.top < o.z1 - tol)) { rep.conflict++; return; }
      setZ(o.w, nb, nt); o.w.height_source = 'elevation'; o.w.size.top = { value: nt, source: above ? 'plan level, the elevation runs on above' : 'elevation', line: o.e.plane }; o.w.size.base = { value: nb, source: below ? 'plan level' : 'elevation', line: o.e.plane }; rep.on_line++;
    });
    W.forEach(function (w) {
      if (w.height_source === 'elevation' || !w._c) return;
      var inn = Object.keys(wings).filter(function (f) { return inWing(wings[f], w._c[0], w._c[1], 0); });
      if (inn.length > 1) { rep.ambiguous++; return; } if (!inn.length) return;
      var top = wings[inn[0]].top; if (w.z1 > top + tol && top > w.z0) { setZ(w, w.z0, Number(top.toFixed(6))); w.size.top = { value: Number(top.toFixed(6)), source: 'wing' }; w.height_source = 'wing'; rep.wing_capped++; }
    });
    W.forEach(function (w) { delete w._c; });
    if (rep.on_line || rep.wing_capped) DF.use('wall.top_from_elevation');
    return rep;
  }
  return { buildWalls: buildWalls, readTags: readTags, topsFromElevations: topsFromElevations };
});
