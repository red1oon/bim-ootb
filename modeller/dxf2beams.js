// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf2beams.js — beams from their size labels, in any direction (prompts/DXF2BIM_ARCHITECT_REVIEW.md §D109 P2d). Pure, Node + browser.
// A layer typed `beamlabel` holds labels <mark>(<w>x<d>). The drawing gives the edges: two parallel line runs spaced w, near the label, on any layer that is not annotation (a floor edge may be drawn over a beam edge,
// so the layer cannot decide). The label gives the depth and the mark. No pair = a gap per label: a label alone is never a box.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory({ P: require('./dxf2prep.js') });
  else root.Dxf2Beams = factory({ P: root.Dxf2Prep });
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';
  var P = D.P, r6 = function (v) { return Number(Number(v).toFixed(6)); };
  var LABEL = /^-?\s*([A-Z]*B\d*)\(\s*(\d+)\s*[xX]\s*(\d+)\s*\)$/, TOC = /^TOC:?\s*([+-]\d+\.\d+)\s*m?$/i, NOT_EDGE = /GRID|DIM|ANNO|TEXT|IDEN|SYMB|TTLB|WALL|DETL/i;
  var clean = function (t) { return String(t).replace(/\\[A-Za-z][^;\\]*;/g, '').replace(/\\P/g, ' ').replace(/[{}]/g, '').trim(); };
  function segments(sheet) {
    var out = [];
    (sheet.dxf.entities || []).forEach(function (e) {
      if (NOT_EDGE.test(e.layer)) return;
      var vs = e.type === 'LINE' ? [e.vertices] : e.type === 'LWPOLYLINE' ? e.vertices.slice(1).map(function (v, i) { return [e.vertices[i], v]; }) : [];
      vs.forEach(function (q) { var dx = q[1].x - q[0].x, dy = q[1].y - q[0].y, l = Math.hypot(dx, dy); if (l > 0) out.push({ a: q[0], b: q[1], l: l, ux: dx / l, uy: dy / l, layer: e.layer, handle: String(e.handle) }); });
    });
    return out;
  }
  function distTo(s, x, y) { var t = (x - s.a.x) * s.ux + (y - s.a.y) * s.uy; t = Math.max(0, Math.min(s.l, t)); return Math.hypot(s.a.x + t * s.ux - x, s.a.y + t * s.uy - y); }
  var parallel = function (a, b, tol) { return Math.abs(a.ux * b.uy - a.uy * b.ux) * Math.max(a.l, b.l) <= tol; };
  var offset = function (a, q) { return -(q.x - a.a.x) * a.uy + (q.y - a.a.y) * a.ux; };
  var along = function (a, q) { return (q.x - a.a.x) * a.ux + (q.y - a.a.y) * a.uy; };
  // every piece on the same line as s, contiguous with it (a gap no wider than the beam), as one interval along s
  function runOf(s, all, tol, gap) {
    var iv = all.filter(function (o) { return parallel(s, o, tol) && Math.abs(offset(s, o.a)) <= tol && Math.abs(offset(s, o.b)) <= tol; }).map(function (o) { var p = along(s, o.a), q = along(s, o.b); return { s0: Math.min(p, q), s1: Math.max(p, q), handle: o.handle }; }).sort(function (m, n) { return m.s0 - n.s0; });
    var lo = 0, hi = s.l, members = {}, changed = true; members[s.handle] = 1;
    while (changed) { changed = false; iv.forEach(function (o) { if (members[o.handle] && o.s0 >= lo && o.s1 <= hi) return; if (o.s1 >= lo - gap && o.s0 <= hi + gap) { if (o.s0 < lo) { lo = o.s0; changed = true; } if (o.s1 > hi) { hi = o.s1; changed = true; } members[o.handle] = 1; } }); }
    return { s0: lo, s1: hi, members: Object.keys(members) };
  }
  function buildBeams(sheets, opts) {
    opts = opts || {};
    var els = [], gaps = [], report = { labels: 0, built: 0, no_edges: 0, same_footprint: 0, other_plan: 0 }, DF = opts.DF, S = (P.Solid);
    var setting = function (k, d) { return DF && DF.has(k) ? DF.get(k) : d; };
    var reachM = Number(setting('beam.label_reach', 2.5)), tolM = Number(setting('beam.edge_tol', 0.006)), splitOn = setting('beam.span_split', 'label_midpoint') === 'label_midpoint'; if (!(reachM > 0)) return { els: els, gaps: gaps, report: report };
    var plans = sheets.filter(function (s) { return s.role === 'plan'; }).sort(function (a, b) { return a.level - b.level; }), levels = plans.map(function (p) { return p.level; }).filter(function (l, i, a) { return a.indexOf(l) === i; }), seen = {};
    plans.forEach(function (ps, pi) {
      var ly = ((ps.desc && ps.desc.layers) || []).filter(function (l) { return l.type === 'beamlabel'; }).map(function (l) { return l.layer; }); if (!ly.length) return;
      var k = ps.factor, reach = reachM / k, tol = tolM / k, segs = segments(ps);
      var texts = (ps.dxf.entities || []).filter(function (e) { return e.type === 'TEXT' || e.type === 'MTEXT'; }).map(function (e) { var q = e.position || e.startPoint || {}; return { t: clean(e.text), x: q.x, y: q.y, layer: e.layer, handle: String(e.handle) }; });
      var tocs = texts.map(function (q) { var m = TOC.exec(q.t); return m ? { z: Number(m[1]), x: q.x, y: q.y } : null; }).filter(Boolean);
      var hits = [];
      texts.filter(function (q) { return ly.indexOf(q.layer) >= 0 && LABEL.test(q.t); }).forEach(function (lab) {
        report.labels++;
        var m = LABEL.exec(lab.t), mark = m[1], w = Number(m[2]) * 0.001 / k, depth = Number(m[3]) * 0.001, near = segs.filter(function (s) { return distTo(s, lab.x, lab.y) <= reach; }), best = null;
        for (var i = 0; i < near.length; i++) for (var j = i + 1; j < near.length; j++) {
          var A = near[i], B = near[j]; if (!parallel(A, B, tol)) continue;
          var sp = offset(A, B.a); if (Math.abs(Math.abs(sp) - w) > tol) continue;
          var ra = runOf(A, segs, tol, w), rb = runOf(B, segs, tol, w);
          var pa = along(A, B.a), pb = along(A, B.b), sgn = (pb - pa) >= 0 ? 1 : -1;   // B's run in A's frame
          var b0 = sgn > 0 ? pa + rb.s0 : pa - rb.s1, b1 = sgn > 0 ? pa + rb.s1 : pa - rb.s0, s0 = Math.max(ra.s0, b0), s1 = Math.min(ra.s1, b1), ov = s1 - s0;
          if (ov < Math.max(1 / k, 2 * w)) continue;
          var mid = sp / 2, cl = { a: { x: A.a.x + s0 * A.ux - mid * A.uy, y: A.a.y + s0 * A.uy + mid * A.ux }, ux: A.ux, uy: A.uy, l: ov }, d0 = distTo(cl, lab.x, lab.y);
          if (!best || d0 < best.d - tol || (Math.abs(d0 - best.d) <= tol && ov > best.ov)) best = { d: d0, ov: ov, A: A, sp: sp, s0: s0, s1: s1, members: ra.members.concat(rb.members), layers: [A.layer, B.layer], cl: cl };
        }
        if (!best) { report.no_edges++; gaps.push({ code: 'GAP:beam_label_no_edges', kind: 'beam', sheet: ps.name, handle: lab.handle, detail: lab.t + ': no two parallel lines ' + m[2] + ' mm apart within ' + reachM + ' m' }); return; }
        hits.push({ lab: lab, mark: mark, label: Number(m[2]) * 0.001, depth: depth, best: best });
      });
      // one run, several labels: a label owns its part of the run. Key = the run in a frame that does not depend on which edge was found first.
      var runKey = function (h) { var A = h.best.A, nx = -A.uy, ny = A.ux, c = function (s, o) { return Math.round((A.a.x + s * A.ux + o * nx) * k * 100) + ',' + Math.round((A.a.y + s * A.uy + o * ny) * k * 100); }; return [c(h.best.s0, 0), c(h.best.s1, 0), c(h.best.s1, h.best.sp), c(h.best.s0, h.best.sp)].sort().join(';'); };
      var byRun = {}; hits.forEach(function (h) { var q = runKey(h); (byRun[q] = byRun[q] || []).push(h); });
      Object.keys(byRun).sort().forEach(function (rk) {
        var H = byRun[rk], first = H[0].best, at = function (h) { return along(first.A, { x: h.lab.x, y: h.lab.y }); };
        H.sort(function (a, b) { return at(a) - at(b); });
        var spans = [];
        if (splitOn) H.forEach(function (h) { var last = spans[spans.length - 1]; if (last && last.h.mark === h.mark) { report.same_footprint++; last.at1 = at(h); return; } if (last) { var cut = (last.at1 + at(h)) / 2; last.s1 = cut; spans.push({ h: h, s0: cut, s1: first.s1, at1: at(h), split: true }); last.split = true; } else spans.push({ h: h, s0: first.s0, s1: first.s1, at1: at(h) }); });
        else { spans.push({ h: H[0], s0: first.s0, s1: first.s1 }); report.same_footprint += H.length - 1; }
        spans.forEach(function (sp2) {
          var h = sp2.h, A2 = first.A, nx = -A2.uy, ny = A2.ux, corner = function (s, o) { return [r6((A2.a.x + s * A2.ux + o * nx) * k), r6((A2.a.y + s * A2.uy + o * ny) * k)]; };
          var ring = [corner(sp2.s0, 0), corner(sp2.s1, 0), corner(sp2.s1, first.sp), corner(sp2.s0, first.sp)];
          // plans run lowest first: the upper plan sees it through a void. Its split may fall elsewhere, so the test is the same line and most of the same length, not the same corners.
          var P0 = { x: A2.a.x + sp2.s0 * A2.ux + first.sp / 2 * nx, y: A2.a.y + sp2.s0 * A2.uy + first.sp / 2 * ny }, lenS = sp2.s1 - sp2.s0, rec = { a: P0, ux: A2.ux, uy: A2.uy, l: lenS, pi: pi };
          var dup = (seen[h.mark] || []).some(function (q) { if (q.pi === pi || !parallel(q, rec, tol) || Math.abs(offset(q, P0)) > tol) return false; var p = along(q, P0), e = p + (A2.ux * q.ux + A2.uy * q.uy) * lenS, ov = Math.min(q.l, Math.max(p, e)) - Math.max(0, Math.min(p, e)); return ov > Math.min(q.l, lenS) / 2; });
          if (dup) { report.other_plan++; return; } (seen[h.mark] = seen[h.mark] || []).push(rec);
          var clS = { a: { x: A2.a.x + sp2.s0 * A2.ux + first.sp / 2 * nx, y: A2.a.y + sp2.s0 * A2.uy + first.sp / 2 * ny }, ux: A2.ux, uy: A2.uy, l: sp2.s1 - sp2.s0 };
          var toc = tocs.map(function (c) { return { z: c.z, d: distTo(clS, c.x, c.y) }; }).filter(function (c) { return c.d <= reach; }).sort(function (a, b) { return a.d - b.d; })[0], top = toc ? toc.z : ps.level;
          var z0 = r6(top - h.depth), z1 = r6(top), V = ring.map(function (c) { return [c[0], c[1], z0]; }).concat(ring.map(function (c) { return [c[0], c[1], z1]; })), mesh = S.box(V), lv = levels.filter(function (l) { return l <= z1; }).pop(); if (lv === undefined) lv = levels[0];
          if (DF) { ['beam.label_reach', 'beam.edge_tol'].forEach(function (q) { if (DF.has(q)) DF.use(q); }); if (sp2.split && DF.has('beam.span_split')) DF.use('beam.span_split'); }
          report.built++;
          els.push({ guid: 'body-beam-' + pi + '-' + h.lab.handle, class: 'IfcBeam', storey: 'Level ' + (levels.indexOf(lv) + 1), vertices: mesh.vertices, faces: mesh.faces, handle: h.lab.handle, layer: h.lab.layer, sheet: ps.name, kind: 'beam', mark: h.mark, band: false, members: first.members, z0: z0, z1: z1,
            size: { w: { value: r6(Math.abs(first.sp) * k), source: 'drawn', label: h.label }, d: { value: h.depth, source: 'label' }, top: { value: z1, source: toc ? 'TOC label' : 'plan level' }, length: { value: r6((sp2.s1 - sp2.s0) * k), source: sp2.split ? 'split at the midpoint between labels' : 'drawn' } }, height_source: toc ? 'label' : 'plan', prov: 'derived', ifc: P.ifcType('beam', h.mark, null) });
        });
      });
    });
    return { els: els, gaps: gaps, report: report };
  }
  return { buildBeams: buildBeams, LABEL: LABEL, parts: { segments: segments, distTo: distTo, along: along, runOf: runOf, clean: clean } };
});
