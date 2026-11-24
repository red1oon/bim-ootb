// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — dxf2stair.js: a stair from the sheet (prompts/DXF2BIM_MODELLER_LANE.md §L43). Read the § lines after every run.
// Implementing DXF2BIM_MODELLER_LANE.md §L43 — Witness: W-L43 (modeller/tests/witness_dxf_stair.js), scan set S5 (witness_dxf_scan_set.js)
// build(entities, K, stair, z0, z1, opts) -> { body: {vertices, faces} | null, treads, gaps, info }
//   entities: the plan's DXF entities (only layer A-FLOR-STRS is read); K: sheet units -> m; stair: {risers, rise_mm, going_mm} (the @STAIR mark);
//   z0 / z1: this storey's level and the next one's (m); opts.polygonClipping (node: require, page: window.polygonClipping), opts.sagitta (m).
// Pure: no DOM, no THREE. Treads are cut from (outline - holes) between the walk line's normals, one going apart, the run centred on the line.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./polygon-clipping.js'));
  else root.Dxf2Stair = factory(root.polygonClipping);
})(typeof self !== 'undefined' ? self : this, function (PCdefault) {
  'use strict';
  var LAYER = 'A-FLOR-STRS', EPS = 1e-9;
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  // an open (or closed) LWPOLYLINE with bulges -> points [x, y, rho] (rho = turn radius at that point, Infinity on a straight, and the turn centre)
  function facet(vs, closed, sag) {
    var out = [], n = vs.length, last = closed ? n : n - 1;
    for (var i = 0; i < last; i++) {
      var a = vs[i], b = vs[(i + 1) % n]; out.push({ x: a.x, y: a.y, rho: Infinity, c: null });
      if (!a.bulge) continue;
      var th = 4 * Math.atan(a.bulge), dx = b.x - a.x, dy = b.y - a.y, ch = Math.hypot(dx, dy); if (ch < EPS) continue;
      var R = ch / (2 * Math.sin(Math.abs(th) / 2)), sgn = a.bulge > 0 ? 1 : -1;
      var cx = (a.x + b.x) / 2 - sgn * dy / ch * R * Math.cos(th / 2), cy = (a.y + b.y) / 2 + sgn * dx / ch * R * Math.cos(th / 2);
      var a0 = Math.atan2(a.y - cy, a.x - cx), nseg = Math.max(8, Math.ceil(Math.abs(th) / (2 * Math.acos(Math.max(0, 1 - sag / Math.abs(R))))));
      out[out.length - 1].rho = Math.abs(R); out[out.length - 1].c = [cx, cy];
      for (var k = 1; k < nseg; k++) { var ang = a0 + th * k / nseg; out.push({ x: cx + Math.abs(R) * Math.cos(ang), y: cy + Math.abs(R) * Math.sin(ang), rho: Math.abs(R), c: [cx, cy] }); }
      out.push({ x: b.x, y: b.y, rho: Math.abs(R), c: [cx, cy], arcEnd: true });   // the arc's end point (a straight may follow: the next vertex overwrites it below)
    }
    if (!closed) out.push({ x: vs[n - 1].x, y: vs[n - 1].y, rho: Infinity, c: null });
    var d = []; out.forEach(function (p) { var q = d[d.length - 1]; if (q && Math.hypot(p.x - q.x, p.y - q.y) < 1e-7) { if (p.rho < q.rho) { q.rho = p.rho; q.c = p.c; } return; } d.push(p); });
    return d;
  }
  function ringArea(r) { var a = 0; for (var i = 0, n = r.length; i < n; i++) { var p = r[i], q = r[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
  function inRing(pt, r) { var c = false; for (var i = 0, j = r.length - 1; i < r.length; j = i++) { var a = r[i], b = r[j]; if (((a[1] > pt[1]) !== (b[1] > pt[1])) && (pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1] + EPS) + a[0])) c = !c; } return c; }
  // the point, the unit tangent, the turn radius and centre at arc length s along the walk line
  function at(W, cum, s) {
    var i = 1; while (i < W.length - 1 && cum[i] < s) i++;
    var a = W[i - 1], b = W[i], L = cum[i] - cum[i - 1] || EPS, t = Math.max(0, Math.min(1, (s - cum[i - 1]) / L));
    var tx = (b.x - a.x) / L, ty = (b.y - a.y) / L, onArc = isFinite(a.rho) && isFinite(b.rho) && a.c && b.c && Math.abs(a.c[0] - b.c[0]) < 1e-9 && Math.abs(a.c[1] - b.c[1]) < 1e-9;
    var rho = onArc ? a.rho : Infinity, c = onArc ? a.c : null;   // a segment turns only when both its ends lie on the same arc
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, tx: tx, ty: ty, rho: rho, c: c };
  }
  // a prism of a polygon (outer ring + holes, each CCW / CW irrelevant: triangulated by ear clipping on the outer ring with holes bridged) from zb to zt.
  // Kept simple and exact for the convex / near-convex pieces a tread is: fan from a hole-free ring; a piece with a hole is refused upstream (a tread never wraps the spine).
  function prism(ring, zb, zt) {
    var n = ring.length; if (n < 3) return null;
    var cw = ringArea(ring) < 0, R = cw ? ring.slice().reverse() : ring, V = [], F = [];
    R.forEach(function (p) { V.push([r6(p[0]), r6(p[1]), r6(zb)]); }); R.forEach(function (p) { V.push([r6(p[0]), r6(p[1]), r6(zt)]); });
    var idx = R.map(function (_, i) { return i; }), tri = [];
    var guard = 0;
    while (idx.length > 3 && guard++ < 10000) {   // ear clipping (the tread pieces are simple polygons)
      var cut = false;
      for (var k = 0; k < idx.length; k++) {
        var i0 = idx[(k + idx.length - 1) % idx.length], i1 = idx[k], i2 = idx[(k + 1) % idx.length], A = R[i0], B = R[i1], C = R[i2];
        if ((B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]) <= EPS) continue;
        if (idx.some(function (j) { if (j === i0 || j === i1 || j === i2) return false; return inRing(R[j], [A, B, C]); })) continue;
        tri.push([i0, i1, i2]); idx.splice(k, 1); cut = true; break;
      }
      if (!cut) break;
    }
    if (idx.length === 3) tri.push(idx.slice());
    if (!tri.length) return null;
    tri.forEach(function (t) { F.push([t[0], t[2], t[1]]); F.push([t[0] + n, t[1] + n, t[2] + n]); });   // bottom (down), top (up)
    for (var i = 0; i < n; i++) { var j = (i + 1) % n; F.push([i, j, j + n]); F.push([i, j + n, i + n]); }   // sides
    return { vertices: V, faces: F };
  }
  function build(entities, K, stair, z0, z1, opts) {
    opts = opts || {}; var PC = opts.polygonClipping || PCdefault, gaps = [], sag = typeof opts.sagitta === 'number' ? opts.sagitta : 0.005;
    var ents = (entities || []).filter(function (e) { return e.layer === LAYER && (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') && e.vertices && e.vertices.length >= 2; });
    var closed = ents.filter(function (e) { return e.shape; }), open = ents.filter(function (e) { return !e.shape; });
    if (open.length !== 1) { gaps.push({ code: 'GAP:stair_walk_line', count: open.length, reason: 'a stair needs exactly ONE open polyline (the walk line) on ' + LAYER + ', found ' + open.length }); return { body: null, treads: 0, gaps: gaps }; }
    var rings = closed.map(function (e) { var r = facet(e.vertices.map(function (v) { return { x: v.x * K, y: v.y * K, bulge: v.bulge || 0 }; }), true, sag).map(function (p) { return [p.x, p.y]; }); return { r: r, a: Math.abs(ringArea(r)), h: e.handle }; })
      .filter(function (x) { return x.a > EPS; }).sort(function (a, b) { return b.a - a.a; });
    if (!rings.length) { gaps.push({ code: 'GAP:stair_outline', reason: 'no closed outline on ' + LAYER }); return { body: null, treads: 0, gaps: gaps }; }
    var outer = rings[0], holes = rings.slice(1).filter(function (x) { var c = x.r.reduce(function (m, p) { return [m[0] + p[0] / x.r.length, m[1] + p[1] / x.r.length]; }, [0, 0]); return inRing(c, outer.r); });   // a hole may touch the outline's edge (a spine from wall to wall): its centre is inside
    var region = [[outer.r.concat([outer.r[0]])]];   // outline minus the holes by a real difference: a spine touching the outline's edge is still taken out
    holes.forEach(function (h) { region = PC.difference(region, [[h.r.concat([h.r[0]])]]); });
    var W = facet(open[0].vertices.map(function (v) { return { x: v.x * K, y: v.y * K, bulge: v.bulge || 0 }; }), false, sag), cum = [0];
    for (var i = 1; i < W.length; i++) cum.push(cum[i - 1] + Math.hypot(W[i].x - W[i - 1].x, W[i].y - W[i - 1].y));
    var Lw = cum[cum.length - 1], n = stair.risers, g = stair.going_mm / 1000, need = (n - 1) * g;
    if (!(z1 > z0)) { gaps.push({ code: 'GAP:stair_no_upper_storey', reason: 'no storey above this plan in the set' }); return { body: null, treads: 0, gaps: gaps }; }
    if (Lw + 1e-6 < need) { gaps.push({ code: 'GAP:stair_walk_short', walk_m: r6(Lw), need_m: r6(need), reason: 'the walk line is shorter than (risers - 1) x going' }); return { body: null, treads: 0, gaps: gaps }; }
    var s0 = (Lw - need) / 2, rise = (z1 - z0) / n, D = Math.hypot(outer.r.reduce(function (m, p) { return Math.max(m, p[0]); }, -1e9) - outer.r.reduce(function (m, p) { return Math.min(m, p[0]); }, 1e9),
      outer.r.reduce(function (m, p) { return Math.max(m, p[1]); }, -1e9) - outer.r.reduce(function (m, p) { return Math.min(m, p[1]); }, 1e9)) * 2;
    var V = [], F = [], treads = [];
    for (var k = 0; k < n - 1; k++) {
      var sa = s0 + k * g, sb = sa + g, pts = [at(W, cum, sa)];
      for (var j = 1; j < W.length - 1; j++) if (cum[j] > sa + 1e-9 && cum[j] < sb - 1e-9) pts.push({ x: W[j].x, y: W[j].y, tx: 0, ty: 0, rho: W[j].rho, c: W[j].c, mid: true });
      pts.push(at(W, cum, sb));
      // the cut polygon: each station's normal, out to D on the convex side, on the concave side of a turn no further than its centre
      var L = [], Rr = [];
      pts.forEach(function (p, ix) {
        var q = ix < pts.length - 1 ? pts[ix + 1] : pts[ix - 1], tx = p.tx || 0, ty = p.ty || 0;
        if (!tx && !ty) { var dx = (ix < pts.length - 1 ? q.x - p.x : p.x - q.x), dy = (ix < pts.length - 1 ? q.y - p.y : p.y - q.y), l = Math.hypot(dx, dy) || 1; tx = dx / l; ty = dy / l; }
        var nx = -ty, ny = tx, dl = D, dr = D;
        if (p.c && isFinite(p.rho)) { var side = (p.c[0] - p.x) * nx + (p.c[1] - p.y) * ny; if (side > 0) dl = Math.min(D, p.rho); else dr = Math.min(D, p.rho); }
        L.push([p.x + nx * dl, p.y + ny * dl]); Rr.push([p.x - nx * dr, p.y - ny * dr]);
      });
      var cutPoly = L.concat(Rr.reverse()); cutPoly.push(cutPoly[0]);
      var inter; try { inter = PC.intersection(region, [[cutPoly]]); } catch (e) { inter = []; }
      var mid = at(W, cum, (sa + sb) / 2), piece = null;
      (inter || []).forEach(function (poly) { if (!piece && inRing([mid.x, mid.y], poly[0]) && !poly.slice(1).some(function (h) { return inRing([mid.x, mid.y], h); })) piece = poly; });
      if (!piece) { gaps.push({ code: 'GAP:stair_tread_empty', tread: k + 1, reason: 'the cut between stations ' + r6(sa) + '..' + r6(sb) + ' m holds no region at the walk line' }); return { body: null, treads: 0, gaps: gaps }; }
      var ring = piece[0].slice(0, -1), zt = z0 + (k + 1) * rise, pm = prism(ring, zt - rise, zt);
      if (!pm) { gaps.push({ code: 'GAP:stair_tread_empty', tread: k + 1, reason: 'the tread piece makes no body' }); return { body: null, treads: 0, gaps: gaps }; }
      var o = V.length; pm.vertices.forEach(function (v) { V.push(v); }); pm.faces.forEach(function (f) { F.push([f[0] + o, f[1] + o, f[2] + o]); });
      treads.push({ k: k + 1, area: r6(Math.abs(ringArea(ring))), top: r6(zt), holes: piece.length - 1 });
    }
    return { body: { vertices: V, faces: F }, treads: treads.length, tread_list: treads, gaps: gaps,
      info: { risers: n, rise_label_mm: stair.rise_mm, rise_model_mm: r6(rise * 1000), going_mm: stair.going_mm, walk_m: r6(Lw), start_m: r6(s0), outline_handle: outer.h, holes: holes.length, turns: W.some(function (p) { return isFinite(p.rho); }) } };
  }
  // §L44 the stair's drawn outline (the largest closed ring on A-FLOR-STRS), metres; null without one. One owner: the stairwell uses it.
  function outline(entities, K, sag) {
    var best = null;
    (entities || []).forEach(function (e) {
      if (e.layer !== LAYER || !(e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') || !e.shape || !e.vertices || e.vertices.length < 3) return;
      var r = facet(e.vertices.map(function (v) { return { x: v.x * K, y: v.y * K, bulge: v.bulge || 0 }; }), true, sag || 0.005).map(function (p) { return [r6(p.x), r6(p.y)]; }), a = Math.abs(ringArea(r));
      if (a > EPS && (!best || a > best.a)) best = { r: r, a: a };
    });
    return best ? best.r : null;
  }
  // §L49 the closed rings on A-FLOR-VOID (metres): each is a void of its storey's slab. One owner of the list; the importer joins it to the stairwell's hole list.
  var VOID_LAYER = 'A-FLOR-VOID';
  function voids(entities, K, sag) {
    var out = [];
    (entities || []).forEach(function (e) {
      if (e.layer !== VOID_LAYER || !(e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') || !e.shape || !e.vertices || e.vertices.length < 3) return;
      var r = facet(e.vertices.map(function (v) { return { x: v.x * K, y: v.y * K, bulge: v.bulge || 0 }; }), true, sag || 0.005).map(function (p) { return [r6(p.x), r6(p.y)]; });
      if (Math.abs(ringArea(r)) > EPS) out.push(r);
    });
    return out;
  }
  return { build: build, outline: outline, voids: voids, LAYER: LAYER, VOID_LAYER: VOID_LAYER, facet: facet };
});
