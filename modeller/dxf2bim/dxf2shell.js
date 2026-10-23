// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf2shell.js — basic shapes from dxf2bim/dxf2elev ops: floor slabs, roof, openings bridged in drawn wall gaps, door/window fills from the
// LOD400 component library (no fallback). Spec: docs/DXF2BIM_BASIC_SHAPES_SPEC.md. Pure functions; no DOM, no DB access (rows are passed in).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./dxf2bim.js'));
  else root.Dxf2Shell = factory(root.Dxf2Bim);
})(typeof self !== 'undefined' ? self : this, function (Dxf2Bim) {
  'use strict';
  var WINDOW_EMBED = typeof process !== 'undefined' && process.env && process.env.DXF_WINDOW_EMBED ? Number(process.env.DXF_WINDOW_EMBED) : 0.05;   // §D55b (m) how far a window's drawn ends may reach into the jamb pieces (frame posts embedded; JKR 20 mm). A module constant, not CFG (no run_id changes).
  var r6 = Dxf2Bim.r6, EPS = 1e-9;
  function hnum(h) { return parseInt(h, 16); }
  function walls(ops) { return ops.filter(function (o) { return o.op_type === 'DXF_WALL'; }); }
  function isH(P) { return Math.abs(P.end[1] - P.start[1]) <= EPS; }                    // axis along x

  // ---- §3 SH-M rectilinear prism with holes: one closed outward mesh, or null ----
  function rectilinear(p) { return p.every(function (q, i) { var n = p[(i + 1) % p.length]; return Math.abs(q[0] - n[0]) <= EPS || Math.abs(q[1] - n[1]) <= EPS; }); }
  function inPoly(pt, p) {
    var c = false;
    for (var i = 0, j = p.length - 1; i < p.length; j = i++) {
      if ((p[i][1] > pt[1]) !== (p[j][1] > pt[1]) && pt[0] < (p[j][0] - p[i][0]) * (pt[1] - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) c = !c;
    }
    return c;
  }
  function uniq(v) { var s = v.slice().sort(function (a, b) { return a - b; }), o = []; s.forEach(function (x) { if (!o.length || x - o[o.length - 1] > EPS) o.push(x); }); return o; }
  function prismRect(outline, holes, z0, z1) {
    holes = holes || [];
    var all = [outline].concat(holes);
    if (all.some(function (p) { return p.length < 4 || !rectilinear(p); }) || !(z1 > z0)) return null;
    var X = uniq([].concat.apply([], all.map(function (p) { return p.map(function (q) { return r6(q[0]); }); })));
    var Y = uniq([].concat.apply([], all.map(function (p) { return p.map(function (q) { return r6(q[1]); }); })));
    var nx = X.length - 1, ny = Y.length - 1, solid = [];
    for (var j = 0; j < ny; j++) { solid.push([]); for (var i = 0; i < nx; i++) {
      var c = [(X[i] + X[i + 1]) / 2, (Y[j] + Y[j + 1]) / 2];
      solid[j].push(inPoly(c, outline) && !holes.some(function (h) { return inPoly(c, h); }));
    } }
    return prismCells(X, Y, solid, z0, z1);
  }
  function prismCells(X, Y, solid, z0, z1) {   // §D51: the mesh of a rectilinear cell set (solid[j][i] over the X / Y grid), split out of prismRect unchanged
    var nx = X.length - 1, ny = Y.length - 1;
    var V = [], F = [], idx = {};
    function vid(i, j, top) { var k = i + ',' + j + ',' + (top ? 1 : 0); if (!(k in idx)) { idx[k] = V.length; V.push([X[i], Y[j], top ? r6(z1) : r6(z0)]); } return idx[k]; }
    function S(i, j) { return i >= 0 && j >= 0 && i < nx && j < ny && solid[j][i]; }
    for (var j = 0; j < ny; j++) for (var i = 0; i < nx; i++) {
      if (!solid[j][i]) continue;
      var a = [i, j], b = [i + 1, j], c = [i + 1, j + 1], d = [i, j + 1];
      F.push([vid(a[0], a[1], 1), vid(b[0], b[1], 1), vid(c[0], c[1], 1)], [vid(a[0], a[1], 1), vid(c[0], c[1], 1), vid(d[0], d[1], 1)]);     // top, normal +z
      F.push([vid(a[0], a[1], 0), vid(c[0], c[1], 0), vid(b[0], b[1], 0)], [vid(a[0], a[1], 0), vid(d[0], d[1], 0), vid(c[0], c[1], 0)]);     // bottom, normal -z
      // sides: edge p->q with outward normal to the right of p->q when walking CCW around the cell
      [[a, b, S(i, j - 1)], [b, c, S(i + 1, j)], [c, d, S(i, j + 1)], [d, a, S(i - 1, j)]].forEach(function (e) {
        if (e[2]) return;
        var p = e[0], q = e[1];
        F.push([vid(p[0], p[1], 0), vid(q[0], q[1], 0), vid(q[0], q[1], 1)], [vid(p[0], p[1], 0), vid(q[0], q[1], 1), vid(p[0], p[1], 1)]);
      });
    }
    if (!F.length) return null;
    return { vertices: V, faces: F };
  }
  // §D70.1 a straight-edged prism with holes, any angles: a trapezoid decomposition at every vertex x (each cell's vertical sides split at every point any ring has on that line, each
  // ring edge split at every strip line), so the top / bottom / sides share every edge exactly twice (the `watertight` rule). Rings open, metres; returns { vertices, faces } or null.
  function ringSA(r) { var a = 0; for (var i = 0; i < r.length; i++) { var q = r[(i + 1) % r.length]; a += r[i][0] * q[1] - q[0] * r[i][1]; } return a / 2; }
  function prismPoly(outer, holes, z0, z1) {
    var clean = function (r, sgn) { var o = []; r.forEach(function (q) { var p = [r6(q[0]), r6(q[1])]; if (!o.length || o[o.length - 1][0] !== p[0] || o[o.length - 1][1] !== p[1]) o.push(p); });
      if (o.length > 1 && o[0][0] === o[o.length - 1][0] && o[0][1] === o[o.length - 1][1]) o.pop(); if (ringSA(o) * sgn < 0) o.reverse(); return o; };
    var rings = [clean(outer, 1)].concat((holes || []).map(function (h) { return clean(h, -1); }));
    if (rings.some(function (r) { return r.length < 3 || Math.abs(ringSA(r)) < EPS; }) || !(z1 > z0)) return null;
    var E = []; rings.forEach(function (r) { r.forEach(function (a, i) { E.push([a, r[(i + 1) % r.length]]); }); });
    var X = uniq([].concat.apply([], rings.map(function (r) { return r.map(function (q) { return q[0]; }); })));
    function yAt(e, x) { var a = e[0], b = e[1]; if (x === a[0]) return a[1]; if (x === b[0]) return b[1]; return r6(a[1] + (x - a[0]) * (b[1] - a[1]) / (b[0] - a[0])); }
    var Pon = {};   // x -> sorted y of every ring point on that line (vertices and crossings)
    X.forEach(function (x) { var ys = []; E.forEach(function (e) { var lo = Math.min(e[0][0], e[1][0]), hi = Math.max(e[0][0], e[1][0]); if (x < lo || x > hi) return; if (e[0][0] === e[1][0]) ys.push(e[0][1], e[1][1]); else ys.push(yAt(e, x)); }); Pon[x] = uniq(ys); });
    var between = function (x, y0, y1) { var lo = Math.min(y0, y1), hi = Math.max(y0, y1), v = Pon[x].filter(function (y) { return y > lo && y < hi; }); return y1 >= y0 ? v : v.reverse(); };
    var V = [], F = [], idx = {};
    function vid(x, y, top) { var k = x + ',' + y + ',' + (top ? 1 : 0); if (!(k in idx)) { idx[k] = V.length; V.push([x, y, top ? r6(z1) : r6(z0)]); } return idx[k]; }
    E.forEach(function (e) {   // sides: the ring's interior on the left (outer CCW, holes CW), outward to the right
      var a = e[0], b = e[1], pts;
      if (a[0] === b[0]) pts = [a].concat(between(a[0], a[1], b[1]).map(function (y) { return [a[0], y]; }), [b]);
      else { var xs = X.filter(function (x) { return x >= Math.min(a[0], b[0]) && x <= Math.max(a[0], b[0]); }); if (b[0] < a[0]) xs.reverse(); pts = xs.map(function (x) { return [x, yAt(e, x)]; }); }
      for (var i = 0; i + 1 < pts.length; i++) { var p = pts[i], q = pts[i + 1]; F.push([vid(p[0], p[1], 0), vid(q[0], q[1], 0), vid(q[0], q[1], 1)], [vid(p[0], p[1], 0), vid(q[0], q[1], 1), vid(p[0], p[1], 1)]); }
    });
    for (var i = 0; i + 1 < X.length; i++) {   // top / bottom: one cell per pair of edges crossing the strip, fanned from its centre
      var xa = X[i], xb = X[i + 1], xm = (xa + xb) / 2;
      var act = E.filter(function (e) { return e[0][0] !== e[1][0] && Math.min(e[0][0], e[1][0]) <= xa && Math.max(e[0][0], e[1][0]) >= xb; })
        .map(function (e) { return { e: e, ym: e[0][1] + (xm - e[0][0]) * (e[1][1] - e[0][1]) / (e[1][0] - e[0][0]) }; }).sort(function (p, q) { return p.ym - q.ym; });
      for (var k = 0; k + 1 < act.length; k += 2) {
        var lo = act[k].e, hi = act[k + 1].e, la = yAt(lo, xa), lb = yAt(lo, xb), ha = yAt(hi, xa), hb = yAt(hi, xb), B = [[xa, la], [xb, lb]];
        between(xb, lb, hb).forEach(function (y) { B.push([xb, y]); }); B.push([xb, hb], [xa, ha]); between(xa, ha, la).forEach(function (y) { B.push([xa, y]); });
        B = B.filter(function (p, j) { var n = B[(j + 1) % B.length]; return p[0] !== n[0] || p[1] !== n[1]; });
        if (B.length < 3) continue;
        var cx = 0, cy = 0; B.forEach(function (p) { cx += p[0]; cy += p[1]; }); cx /= B.length; cy /= B.length;
        var ct = V.length; V.push([cx, cy, r6(z1)]); var cb = V.length; V.push([cx, cy, r6(z0)]);
        for (var j = 0; j < B.length; j++) { var p = B[j], q = B[(j + 1) % B.length]; F.push([ct, vid(p[0], p[1], 1), vid(q[0], q[1], 1)], [cb, vid(q[0], q[1], 0), vid(p[0], p[1], 0)]); }
      }
    }
    return F.length ? { vertices: V, faces: F } : null;
  }
  // §D70.1 the plan's slab edge (layer type 'slabedge', A-FLOR-OTLN in the STD map): closed straight polylines, nested by containment (inside an odd number of rings = a hole).
  // Returns { pieces: [{ outer, holes, handles, rectilinear, area }], gaps }; an open polyline or one with a bulge is not read (advisory), never guessed closed or straightened.
  // §D75 a closed polyline's bulged edges as straight facets: the arc of a segment with bulge b = tan(theta/4) is cut so no chord lies further than `sag` from it (metres). Straight edges stay as they are.
  function facetBulges(vs, sag) {
    var out = [], n = vs.length;
    for (var i = 0; i < n; i++) {
      var a = vs[i], b = vs[(i + 1) % n]; out.push([r6(a.x), r6(a.y)]);
      if (!a.bulge) continue;
      var th = 4 * Math.atan(a.bulge), dx = b.x - a.x, dy = b.y - a.y, c = Math.sqrt(dx * dx + dy * dy); if (c < EPS) continue;
      var R = c / (2 * Math.sin(Math.abs(th) / 2)), cx = (a.x + b.x) / 2 - (a.bulge > 0 ? 1 : -1) * dy / c * R * Math.cos(th / 2), cy = (a.y + b.y) / 2 + (a.bulge > 0 ? 1 : -1) * dx / c * R * Math.cos(th / 2);
      var a0 = Math.atan2(a.y - cy, a.x - cx), nseg = Math.max(2, Math.ceil(Math.abs(th) / (2 * Math.acos(Math.max(0, 1 - sag / Math.abs(R))))));
      for (var k = 1; k < nseg; k++) { var ang = a0 + th * k / nseg; out.push([r6(cx + Math.abs(R) * Math.cos(ang)), r6(cy + Math.abs(R) * Math.sin(ang))]); }
    }
    return out;
  }
  function slabEdges(entities, layerMap, K, opts) {
    var rings = [], gaps = [], sagitta = opts && typeof opts.sagitta === 'number' ? opts.sagitta : 0.005;
    (entities || []).forEach(function (e) {
      var rule = Dxf2Bim.matchRule(e.layer, layerMap.rules); if (!rule || rule.type !== 'slabedge') return;
      if (!(e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') || !e.shape) { gaps.push({ code: 'GAP:slab_edge_open', handle: e.handle, reason: 'a slab edge must be a closed polyline: not read' }); return; }
      var p = facetBulges(e.vertices.map(function (q) { return { x: q.x * K, y: q.y * K, bulge: q.bulge || 0 }; }), sagitta);   // §D75 an arc is read as straight facets within the stated chord sagitta
      if (p.length < 3 || Math.abs(ringSA(p)) < EPS) return;
      rings.push({ handle: e.handle, p: p, a: Math.abs(ringSA(p)), top: typeof e.elevation === 'number' ? r6(e.elevation * K) : null, thickness: typeof e.depth === 'number' && e.depth > 0 ? r6(e.depth * K) : null });
    });
    rings.sort(function (a, b) { return b.a - a.a || hnum(a.handle) - hnum(b.handle); });
    var onV = function (q, o) { return o.p.some(function (v) { return v[0] === q[0] && v[1] === q[1]; }); };   // rings may touch at a vertex (the writer's union output), never cross
    var inside = function (r, o) { var strict = 0; for (var k = 0; k < r.p.length; k++) { if (onV(r.p[k], o)) continue; if (!inPoly(r.p[k], o.p)) return false; strict++; } return strict > 0; };
    rings.forEach(function (r, i) { r.depth = 0; r.parent = null; for (var j = 0; j < i; j++) if (rings[j].a > r.a && inside(r, rings[j])) { r.depth++; if (!r.parent || rings[j].a < r.parent.a) r.parent = rings[j]; } });
    var pieces = rings.filter(function (r) { return r.depth % 2 === 0; }).map(function (r) {
      var hs = rings.filter(function (h) { return h.parent === r && h.depth % 2 === 1; });
      return { outer: r.p, holes: hs.map(function (h) { return h.p; }), handles: [r.handle].concat(hs.map(function (h) { return h.handle; })), rectilinear: [r.p].concat(hs.map(function (h) { return h.p; })).every(rectilinear), top: r.top, thickness: r.thickness, area: r6(r.a - hs.reduce(function (t, h) { return t + h.a; }, 0)) };
    });
    return { pieces: pieces, gaps: gaps };
  }
  // §D51 best effort: the cells the walls bound on BOTH axes (row and column inside the first wall run from each side). Pieces as D44's cover (wall rects, bridges <= gap_max, opening boxes).
  // Interior walls lie inside, exterior walls outside. Returns { X, Y, solid, area, cells } or null; the caller makes the mesh (prismCells) and states it as a default (amber), never a reading.
  function boundedCells(ops, cfg, extra) {
    var ws = walls(ops).filter(function (o) { return o.params.rect && !o.params.infill; }).map(function (o) { return o.params.rect; });
    var rects = ws.concat(((extra && extra.bridges) || []).filter(function (o) { return o.params.rect && !(o.params.length > cfg.opening.gap_max); }).map(function (o) { return o.params.rect; }))
      .concat(ops.filter(function (o) { return o.op_type === 'DXF_OPENING'; }).map(function (o) { return openingRect(o.params.opening_box); }).filter(Boolean));
    if (!rects.length) return null;
    var X = uniq([].concat.apply([], rects.map(function (r) { return [r6(r[0]), r6(r[2])]; }))), Y = uniq([].concat.apply([], rects.map(function (r) { return [r6(r[1]), r6(r[3])]; })));
    var nx = X.length - 1, ny = Y.length - 1, W = [], ix = function (v) { return X.indexOf(r6(v)); }, iy = function (v) { return Y.indexOf(r6(v)); };
    for (var j = 0; j < ny; j++) { W.push([]); for (var i = 0; i < nx; i++) W[j].push(false); }
    rects.forEach(function (r) { for (var i = ix(r[0]); i < ix(r[2]); i++) for (var j = iy(r[1]); j < iy(r[3]); j++) W[j][i] = true; });
    function span(n, at) { var a = 0; while (a < n && !at(a)) a++; if (a === n) return null; while (a < n && at(a)) a++; var b = n - 1; while (b >= 0 && !at(b)) b--; while (b >= 0 && at(b)) b--; return a <= b ? [a, b] : null; }
    var row = [], col = [], solid = [], area = 0, cells = 0;
    for (j = 0; j < ny; j++) row.push(span(nx, function (i) { return W[j][i]; }));
    for (i = 0; i < nx; i++) col.push(span(ny, function (jj) { return W[jj][i]; }));
    for (j = 0; j < ny; j++) { solid.push([]); for (i = 0; i < nx; i++) {
      var on = !!(row[j] && col[i] && i >= row[j][0] && i <= row[j][1] && j >= col[i][0] && j <= col[i][1]); solid[j].push(on);
      if (on) { area += (X[i + 1] - X[i]) * (Y[j + 1] - Y[j]); cells++; } } }
    if (!cells) return null;
    // §D51 perf: keep only the grid lines where the cell pattern changes (LTU: 821 x 547 wall-edge lines -> a few dozen); same cells, same area, a mesh of the outline, not of every wall edge
    var keepX = [0], keepY = [0];
    for (i = 1; i < nx; i++) { var sameC = true; for (j = 0; j < ny && sameC; j++) if (solid[j][i] !== solid[j][i - 1]) sameC = false; if (!sameC) keepX.push(i); }
    for (j = 1; j < ny; j++) { var sameR = true; for (i = 0; i < nx && sameR; i++) if (solid[j][i] !== solid[j - 1][i]) sameR = false; if (!sameR) keepY.push(j); }
    var X2 = keepX.map(function (k) { return X[k]; }).concat([X[nx]]), Y2 = keepY.map(function (k) { return Y[k]; }).concat([Y[ny]]);
    var solid2 = keepY.map(function (jj) { return keepX.map(function (ii) { return solid[jj][ii]; }); });
    return { X: X2, Y: Y2, solid: solid2, area: r6(area), cells: cells, grid: [nx, ny], kept: [keepX.length, keepY.length] };
  }

  // ---- §4.1 S-O inner ring of the exterior walls (rectangular envelope only) ----
  function envelope(ws) {
    var r = ws.map(function (o) { return o.params.rect; });
    return [Math.min.apply(null, r.map(function (q) { return q[0]; })), Math.min.apply(null, r.map(function (q) { return q[1]; })),
      Math.max.apply(null, r.map(function (q) { return q[2]; })), Math.max.apply(null, r.map(function (q) { return q[3]; }))];
  }
  // §D44: the inner-face rectangle is the slab only when the walls DRAW a rectangle: every envelope face covered >= RECT_MIN_COVER of its length by pieces on the face plane
  // (wall rects, opening bridges, opening boxes). Measured 2026-10-23: Duplex 1.000 on every face; Clinic min 0.067-0.472, HHS 0.042-0.046 (notched / L plans). The 0.1 margin is for
  // openings drawn with no bridge. Below it the outline is a fact the drawing does not state: no slab, GAP:slab_outline_not_rectangular (advisory), never an invented polygon.
  var RECT_MIN_COVER = 0.9;
  function faceCover(E, rects, tol) {
    var FACES = { minX: [0, 1], maxX: [2, 1], minY: [1, 0], maxY: [3, 0] }, out = {};
    Object.keys(FACES).forEach(function (f) {
      var pi = FACES[f][0], ax = FACES[f][1], lo = ax ? E[1] : E[0], hi = ax ? E[3] : E[2];
      var iv = rects.filter(function (r) { return Math.abs(r[pi] - E[pi]) <= tol; }).map(function (r) { return ax ? [r[1], r[3]] : [r[0], r[2]]; }).sort(function (a, b) { return a[0] - b[0]; });
      var L = 0, cur = null;
      iv.forEach(function (v) { if (!cur || v[0] > cur[1] + tol) { if (cur) L += cur[1] - cur[0]; cur = v.slice(); } else cur[1] = Math.max(cur[1], v[1]); });
      if (cur) L += cur[1] - cur[0];
      out[f] = hi > lo ? r6(L / (hi - lo)) : 0;
    });
    return out;
  }
  function openingRect(b) { return !b || !b.along || !b.band ? null : b.axis === 'x' ? [b.along[0], b.band[0], b.along[1], b.band[1]] : [b.band[0], b.along[0], b.band[1], b.along[1]]; }
  function innerRing(ops, cfg, extra) {
    var tol = cfg.snap_tol, ws = walls(ops).filter(function (o) { return o.params.rect && !o.params.infill; }), gaps = [];
    if (!ws.length) return { outline: null, gaps: [{ code: 'GAP:slab_no_exterior_wall', face: 'all' }] };
    var E = envelope(ws), lines = {}, members = [];
    // face: [index of E coordinate, along-axis is x?, index of the rect side opposite the face]
    var FACES = { minX: [0, false, 2], maxX: [2, false, 0], minY: [1, true, 3], maxY: [3, true, 1] };
    Object.keys(FACES).forEach(function (f) {
      var F = FACES[f], vals = [];
      ws.forEach(function (o) {
        var r = o.params.rect, w = r[2] - r[0], h = r[3] - r[1];
        if (Math.abs(r[F[0]] - E[F[0]]) > tol) return;                                   // does not touch the face plane
        if (Math.abs(w - h) <= tol) return;                                                // squares / corner triangles: no direction
        if ((w > h) !== F[1]) return;                                                      // long axis not parallel to the face
        vals.push({ v: r[F[2]], h: o.params.handle });
      });
      if (!vals.length) { gaps.push({ code: 'GAP:slab_no_exterior_wall', face: f }); return; }
      var d = uniq(vals.map(function (x) { return x.v; })), spread = d[d.length - 1] - d[0];
      if (spread > tol) { gaps.push({ code: 'GAP:slab_inner_face_conflict', face: f, values: d }); return; }
      lines[f] = r6(d[0]); vals.forEach(function (x) { members.push(x.h); });
    });
    if (gaps.length) return { outline: null, gaps: gaps, envelope: E };
    var x0 = lines.minX, x1 = lines.maxX, y0 = lines.minY, y1 = lines.maxY;
    var cov;
    if (extra) {   // §D44 (the caller passes the bridges; without them the rule is not applied, as before)
      var pieces = ws.map(function (o) { return o.params.rect; }).concat((extra.bridges || []).filter(function (o) { return o.params.rect && !(o.params.length > cfg.opening.gap_max); }).map(function (o) { return o.params.rect; }))   // a bridge longer than an opening gap is no cover
        .concat(ops.filter(function (o) { return o.op_type === 'DXF_OPENING'; }).map(function (o) { return openingRect(o.params.opening_box); }).filter(Boolean));
      var low; cov = faceCover(E, pieces, tol); low = Object.keys(cov).filter(function (f) { return cov[f] < RECT_MIN_COVER; });
      if (low.length) return { outline: null, envelope: E, cover: cov, gaps: [{ code: 'GAP:slab_outline_not_rectangular', faces: low, cover: cov, min_cover: RECT_MIN_COVER,
        rect_m2: r6((x1 - x0) * (y1 - y0)), reason: 'the walls do not draw a rectangle (face cover ' + low.map(function (f) { return f + ' ' + cov[f]; }).join(', ') + ' < ' + RECT_MIN_COVER + '): the slab outline is not stated, so no slab is made' }] };
    }
    return { outline: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], envelope: E, gaps: [], cover: extra ? cov : undefined, members: uniq(members.map(hnum)).map(function (n) { return n.toString(16).toUpperCase(); }) };
  }

  // ---- §4.2 S-Z top / underside from elevation-derived wall heights ----
  function exteriorElev(ops, cfg) {
    var tol = cfg.snap_tol, ws = walls(ops).filter(function (o) { return o.params.rect && !o.params.infill; }), E = envelope(ws);
    return ws.filter(function (o) { var r = o.params.rect; return o.params.height_source === 'elevation' && (Math.abs(r[0] - E[0]) <= tol || Math.abs(r[1] - E[1]) <= tol || Math.abs(r[2] - E[2]) <= tol || Math.abs(r[3] - E[3]) <= tol); });
  }
  function agree(list, tol) { var d = uniq(list.map(function (x) { return r6(x.z); })); return { ok: d.length && d[d.length - 1] - d[0] <= tol, values: d, z: d[0] }; }
  function slabZ(upper, lower, cfg, opts) {
    var tol = typeof cfg.elev_tol === 'number' ? cfg.elev_tol : cfg.snap_tol, gaps = [];
    var tops = exteriorElev(upper.ops, cfg).map(function (o) { return { z: upper.level + o.params.base, h: o.params.handle }; });
    var sx = opts && opts.section && opts.section.slabs && opts.section.slabs[String(upper.level)];
    if (sx) {                                                                                  // L1.4 F5: the section states top and underside
      if (tops.length) { var T0 = agree(tops, tol); if (!T0.ok || Math.abs(T0.z - sx.top) > tol) gaps.push({ code: 'GAP:slab_top_conflict', values: T0.values, section: sx.top }); }
      return Object.assign({ top: sx.top, bottom: sx.bottom, thickness: sx.thickness, gaps: gaps, source: 'section', section_from: sx.from }, sx.defaulted ? { defaulted: true, share: sx.share } : {}, sx.stacked ? { stacked: true } : {});   // §D57
    }
    if (!tops.length) return { top: null, bottom: null, thickness: null, gaps: [{ code: 'GAP:slab_no_top' }] };
    var T = agree(tops, tol);
    if (!T.ok) return { top: null, bottom: null, thickness: null, gaps: [{ code: 'GAP:slab_top_conflict', values: T.values }] };
    var top = r6(T.z), res = { top: top, bottom: null, thickness: null, gaps: gaps, top_from: tops.map(function (x) { return x.h; }) };
    if (!lower) { gaps.push({ code: 'GAP:slab_no_underside', reason: 'no storey below in the set' }); return res; }
    var unders = walls(lower.ops).filter(function (o) { return o.params.height_source === 'elevation' && !o.params.infill; })
      .map(function (o) { return { z: lower.level + o.params.base + o.params.height, h: o.params.handle }; })
      .filter(function (x) { return x.z < top - tol; });
    if (!unders.length) { gaps.push({ code: 'GAP:slab_no_underside', reason: 'no lower elevation-seen wall ends below the top' }); return res; }
    var U = agree(unders, tol);
    if (!U.ok) { gaps.push({ code: 'GAP:slab_underside_conflict', values: U.values }); return res; }
    var bottom = r6(U.z);
    if (!(top - bottom > tol)) { gaps.push({ code: 'GAP:slab_bad_thickness', top: top, bottom: bottom }); return res; }
    res.bottom = bottom; res.thickness = r6(top - bottom); res.underside_from = unders.map(function (x) { return x.h; });
    return res;
  }

  // ---- lane spec L1.4 F5: slab top / underside from a marked SECTION sheet ----
  // entities: the section sheet; layerMap types 'sectslab' (S-SLAB) and 'roof' (A-ROOF); map: MK.align(plan, sectionDesc).map;
  // levels: stated plan levels (m); roofMark: the section's @ROOF (optional). Every closed polyline is read as a rectangle in (plan h, z).
  // §D57 the stack under a level (pure): the rects touching the level and every rect connected below them (touching or overlapping the one above in plan and z); per cut span (where a rect touches
  // the level) the stack's bottom; returns {spans:[{h0,h1,bottom}], byBottom:[{z,len}] longest first} or null
  function stackAt(slabs, L, tol) {
    var S0 = slabs.filter(function (s) { return Math.abs(s.top - L) <= tol; }); if (!S0.length) return null;
    var ov = function (a, b) { return Math.min(a.h[1], b.h[1]) - Math.max(a.h[0], b.h[0]) > tol; }, C = S0.slice(), grew = true;
    while (grew) { grew = false; slabs.forEach(function (r) { if (C.indexOf(r) >= 0 || r.top > L + tol) return; if (C.some(function (c) { return ov(r, c) && r.top >= c.bottom - tol && r.top <= c.top + tol; })) { C.push(r); grew = true; } }); }
    var xs = uniq([].concat.apply([], C.map(function (r) { return r.h; }))), spans = [], by = {};
    for (var i = 0; i + 1 < xs.length; i++) {
      var a = xs[i], b = xs[i + 1], m = (a + b) / 2; if (b - a <= tol) continue;
      if (!S0.some(function (r) { return r.h[0] <= m && r.h[1] >= m; })) continue;
      var bot = Math.min.apply(null, C.filter(function (r) { return r.h[0] <= m && r.h[1] >= m; }).map(function (r) { return r.bottom; }));
      spans.push({ h0: a, h1: b, bottom: r6(bot) }); by[r6(bot)] = (by[r6(bot)] || 0) + (b - a);
    }
    var byBottom = Object.keys(by).map(function (k) { return { z: Number(k), len: r6(by[k]) }; }).sort(function (p, q) { return q.len - p.len || p.z - q.z; });   // longest first; a tie takes the lower bottom
    return spans.length ? { spans: spans, byBottom: byBottom } : null;
  }
  function sectionSlabs(entities, layerMap, map, levels, cfg, roofMark, opts) {
    var tol = typeof cfg.elev_tol === 'number' ? cfg.elev_tol : cfg.snap_tol, gaps = [], slabs = [], roofs = [], swalls = [];
    (entities || []).forEach(function (e) {
      var rule = Dxf2Bim.matchRule(e.layer, layerMap.rules); if (!rule || (rule.type !== 'sectslab' && rule.type !== 'roof' && rule.type !== 'sectwall')) return;   // sectwall: lane spec L2.8
      if (!((e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') && e.shape)) return;
      var p = e.vertices.map(function (q) { return [r6(map.toPlan(q.x)), r6(map.zOf(q.y))]; });
      var hs = p.map(function (q) { return q[0]; }), zs = p.map(function (q) { return q[1]; });
      var r = [Math.min.apply(null, hs), Math.min.apply(null, zs), Math.max.apply(null, hs), Math.max.apply(null, zs)];
      var onEdge = p.every(function (q, i) { var n = p[(i + 1) % p.length];                 // rectilinear edges, every vertex on the bbox boundary
        return (Math.abs(q[0] - n[0]) <= tol || Math.abs(q[1] - n[1]) <= tol) && (Math.abs(q[0] - r[0]) <= tol || Math.abs(q[0] - r[2]) <= tol || Math.abs(q[1] - r[1]) <= tol || Math.abs(q[1] - r[3]) <= tol); });
      if (!onEdge) { gaps.push({ code: 'GAP:section_not_rect', handle: e.handle, layer: e.layer }); return; }
      (rule.type === 'roof' ? roofs : rule.type === 'sectwall' ? swalls : slabs).push({ handle: e.handle, h: [r[0], r[2]], bottom: r[1], top: r[3] });
    });
    slabs.sort(function (a, b) { return hnum(a.handle) - hnum(b.handle); }); roofs.sort(function (a, b) { return hnum(a.handle) - hnum(b.handle); });
    var out = {};
    (levels || []).slice().sort(function (a, b) { return a - b; }).forEach(function (L) {
      var at = slabs.filter(function (s) { return Math.abs(s.top - L) <= tol; }), onLevel = false;
      if (!at.length) { at = slabs.filter(function (s) { return Math.abs(s.bottom - L) <= tol; }); onLevel = at.length > 0; }   // §F8 D33: the storey placed at its slab's underside (HHS): the slab sitting ON the level
      if (!at.length) { gaps.push({ code: 'GAP:section_no_slab', level: L }); return; }
      if (onLevel) {
        var T = agree(at.map(function (s) { return { z: s.top }; }), tol);
        if (!T.ok) { gaps.push({ code: 'GAP:section_slab_conflict', level: L, values: T.values }); return; }
        out[String(L)] = { level: L, top: r6(T.z), bottom: r6(L), thickness: r6(T.z - L), source: 'section', on_level: true, from: at.map(function (s) { return s.handle; }) };
        return;
      }
      var B = agree(at.map(function (s) { return { z: s.bottom }; }), tol), how = null;
      // §D57 the slab under a level is the whole stack (finish on structure): read the stack's bottom when every stack agrees; stepped stacks = a best-effort underside (amber) when the setting allows
      var K = stackAt(slabs, L, tol), all = K ? K.byBottom.map(function (x) { return x.z; }) : [], lo = all.length ? Math.min.apply(null, all) : null, hi = all.length ? Math.max.apply(null, all) : null;
      if (K && hi - lo <= tol) { if (!B.ok || Math.abs(lo - B.z) > tol) how = { stacked: true }; B = { ok: true, z: B.ok && Math.abs(lo - B.z) <= tol ? B.z : lo }; }
      else if (K) {
        if (opts && opts.stepped === 'longest_cut') {
          var tot = K.byBottom.reduce(function (n, x) { return n + x.len; }, 0), pick = K.byBottom[0];
          B = { ok: true, z: pick.z }; how = { stacked: true, defaulted: true, share: r6(pick.len / tot), spread: [lo, hi] };
          gaps.push({ code: 'GAP:section_underside_defaulted', level: L, bottom: pick.z, share: how.share, values: K.byBottom.map(function (x) { return x.z + ':' + x.len; }), setting: 'slab.underside_when_stepped',
            reason: 'the slab under ' + L + ' steps (' + K.byBottom.length + ' undersides); took ' + pick.z + ' under ' + Math.round(how.share * 100) + '% of the cut (a default, amber): state @Z / turn it off with slab.underside_when_stepped=none' });
        }
        // setting none: today's reading (the rects touching the level), a conflict when they disagree
      }
      if (!B.ok) { gaps.push({ code: 'GAP:section_slab_conflict', level: L, values: B.values }); return; }
      var bottom = r6(B.z), top = r6(L);
      if (!(top - bottom > tol)) { gaps.push({ code: 'GAP:section_bad_thickness', level: L, top: top, bottom: bottom }); return; }
      out[String(L)] = Object.assign({ level: L, top: top, bottom: bottom, thickness: r6(top - bottom), source: 'section', from: at.map(function (s) { return s.handle; }) }, how || {});
    });
    var roof = null;
    if (roofs.length) {
      var RB = agree(roofs.map(function (s) { return { z: s.bottom }; }), tol), RT = agree(roofs.map(function (s) { return { z: s.top }; }), tol);
      if (!RB.ok || !RT.ok) gaps.push({ code: 'GAP:section_roof_conflict', bottoms: RB.values, tops: RT.values });
      else if (typeof roofMark === 'number' && Math.abs(RT.z - roofMark) > tol) gaps.push({ code: 'GAP:section_roof_top_conflict', drawn: r6(RT.z), marked: roofMark });
      else roof = { bottom: r6(RB.z), top: r6(RT.z), thickness: r6(RT.z - RB.z), source: 'section', from: roofs.map(function (s) { return s.handle; }) };
    }
    swalls.sort(function (a, b) { return hnum(a.handle) - hnum(b.handle); });
    return { slabs: out, roof: roof, walls: swalls, gaps: gaps };
  }

  // ---- §5.2 roof bottom / top ----
  function levelLinesZ(entities, layerMap, map) {                // z of drawn horizontal lines on layers typed 'levelline' (via the @Z calibration)
    var out = [];
    (entities || []).forEach(function (e) {
      var rule = Dxf2Bim.matchRule(e.layer, layerMap.rules); if (!rule || rule.type !== 'levelline' || e.type !== 'LINE') return;
      var a = e.vertices[0], b = e.vertices[1]; if (Math.abs(a.y - b.y) > 1e-9) return;
      out.push({ z: r6(map.zOf(a.y)), handle: e.handle });
    });
    return out;
  }
  function roofZ(top, elevs, cfg) {
    var tol = typeof cfg.elev_tol === 'number' ? cfg.elev_tol : cfg.snap_tol, gaps = [];
    var ext = exteriorElev(top.ops, cfg).map(function (o) { return { z: top.level + o.params.base + o.params.height, h: o.params.handle }; });
    var res = { bottom: null, top: null, thickness: null, gaps: gaps };
    if (!ext.length) gaps.push({ code: 'GAP:roof_no_bottom' });
    else { var B = agree(ext, tol); if (!B.ok) gaps.push({ code: 'GAP:roof_bottom_conflict', values: B.values }); else { res.bottom = r6(B.z); res.bottom_from = ext.map(function (x) { return x.h; }); } }
    var marks = elevs.filter(function (e) { return typeof e.roof === 'number'; });
    if (!marks.length) gaps.push({ code: 'GAP:roof_no_top' });
    else {
      var T = agree(marks.map(function (e) { return { z: e.roof }; }), tol);
      if (!T.ok) gaps.push({ code: 'GAP:roof_top_conflict', values: T.values });
      else {
        var notDrawn = marks.filter(function (e) { return !(e.lines || []).some(function (l) { return Math.abs(l.z - e.roof) <= tol; }); });
        if (notDrawn.length) gaps.push({ code: 'GAP:roof_top_not_drawn', views: notDrawn.map(function (e) { return e.name; }) });
        else { res.top = r6(T.z); res.top_from = marks.map(function (e) { return e.name + ':' + (e.lines.filter(function (l) { return Math.abs(l.z - e.roof) <= tol; })[0].handle); }); }
      }
    }
    if (res.top !== null && res.bottom !== null) { if (res.top - res.bottom > tol) res.thickness = r6(res.top - res.bottom); else gaps.push({ code: 'GAP:roof_bad_thickness', top: res.top, bottom: res.bottom }); }
    return res;
  }

  // ---- §5.1 / §5.4 roof plan: outline check and holes ----
  function closedRects(entities, layerMap, type, K) {
    var out = [];
    (entities || []).forEach(function (e) {
      var rule = Dxf2Bim.matchRule(e.layer, layerMap.rules); if (!rule || rule.type !== type) return;
      if (!((e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') && e.shape)) return;
      var p = e.vertices.map(function (q) { return [r6(q.x * K), r6(q.y * K)]; });
      var xs = p.map(function (q) { return q[0]; }), ys = p.map(function (q) { return q[1]; });
      var r = [Math.min.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, xs), Math.max.apply(null, ys)];
      var isRect = p.every(function (q) { return (Math.abs(q[0] - r[0]) <= EPS || Math.abs(q[0] - r[2]) <= EPS) && (Math.abs(q[1] - r[1]) <= EPS || Math.abs(q[1] - r[3]) <= EPS); });
      out.push({ handle: e.handle, rect: r, isRect: isRect });
    });
    return out.sort(function (a, b) { return hnum(a.handle) - hnum(b.handle); });
  }
  function roofPlan(entities, layerMap, K, topEnvelope, outline, cfg) {
    var tol = cfg.snap_tol, gaps = [], roofs = closedRects(entities, layerMap, 'roof', K);
    if (!outline || !topEnvelope) return { ok: false, holes: [], gaps: [{ code: 'GAP:roof_no_outline', reason: 'top storey has no inner-face ring' }] };
    if (roofs.length !== 1) return { ok: false, holes: [], gaps: [{ code: 'GAP:roof_outline_mismatch', reason: 'roof plan must hold exactly one closed roof outline', found: roofs.length }] };
    var R = roofs[0].rect, E = topEnvelope;
    if (!roofs[0].isRect || R.some(function (v, i) { return Math.abs(v - E[i]) > tol; })) return { ok: false, holes: [], gaps: [{ code: 'GAP:roof_outline_mismatch', roof: R, envelope: E }] };
    var holes = [];
    closedRects(entities, layerMap, 'glazing', K).forEach(function (g) {
      if (!g.isRect) { gaps.push({ code: 'GAP:roof_hole_not_rect', handle: g.handle }); return; }
      var r = g.rect, o = outline;
      var x0 = o[0][0], y0 = o[0][1], x1 = o[2][0], y1 = o[2][1];
      if (!(r[0] > x0 + tol && r[1] > y0 + tol && r[2] < x1 - tol && r[3] < y1 - tol)) { gaps.push({ code: 'GAP:roof_hole_outside', handle: g.handle, rect: r }); return; }
      holes.push({ handle: g.handle, rect: r, ring: [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]] });
    });
    return { ok: true, roof_handle: roofs[0].handle, holes: holes, gaps: gaps };
  }

  // ---- §2.3 W-H3 slab-above convention for walls the elevations do not show ----
  function applySlabAbove(opsAfter, opsBefore, U, level) {
    var pend = {}, out = [], n = 0;
    walls(opsBefore).forEach(function (o) { pend[o.params.handle + '|' + o.params.part] = o; });
    opsAfter.forEach(function (o) {
      if (o.op_type === 'DXF_GAP' && o.params.code === 'GAP:no_elevation_height' && typeof U === 'number') {
        var w = pend[o.params.handle + '|' + o.params.part];
        if (w) { n++; out.push(Object.assign({}, w, { params: Object.assign({}, w.params, { base: 0, height: r6(U - level), pending_elevation: false, height_source: 'slab_above' }) })); return; }
      }
      out.push(o);
    });
    return { ops: out, n: n };
  }

  // ---- §6 OP-1b door strip: the swing end point that lies on a wall strip's axis line through the hinge (closed leaf along the wall) ----
  function doorStrip(door, ws, tol) {
    // lane spec L2.6 G: the hinge on the strip's centre line (old set); only when no direction finds one, the hinge on a face line of the strip (std set, L1.2 R9)
    var q = door.params, Hh = q.hinge;
    function centre(r, ci) { return Math.abs((r[ci] + r[ci + 2]) / 2 - Hh[ci]) <= tol; }
    function face(r, ci) { return Math.abs(r[ci] - Hh[ci]) <= tol || Math.abs(r[ci + 2] - Hh[ci]) <= tol; }
    function pass(onLine) {
      var hits = [];
      [q.swing_start_deg, q.swing_end_deg].forEach(function (a) {
        var E = [Hh[0] + q.width * Math.cos(a * Math.PI / 180), Hh[1] + q.width * Math.sin(a * Math.PI / 180)];
        var ai = Math.abs(E[1] - Hh[1]) <= tol ? 0 : Math.abs(E[0] - Hh[0]) <= tol ? 1 : -1; if (ai < 0) return;
        var ci = 1 - ai, strip = ws.filter(function (w) { var r = w.params.rect, hz = (r[2] - r[0]) > (r[3] - r[1]) + tol; return (ai === 0 ? hz : !hz && (r[3] - r[1]) > (r[2] - r[0]) + tol) && onLine(r, ci); });
        if (strip.length) hits.push({ ai: ai, ci: ci, J: [r6(E[0]), r6(E[1])], cr: [strip[0].params.rect[ci], strip[0].params.rect[ci + 2]], strip: strip });
      });
      return hits;
    }
    if (q.opening_box) {                                                // L2.7 (4): the reader's opening box fixes the host: the wall line the hinge lies on, parallel to the closed leaf, jamb to jamb
      var bx = q.opening_box, bai = bx.axis === 'x' ? 0 : 1, bci = 1 - bai, Jb = null;
      [q.swing_start_deg, q.swing_end_deg].forEach(function (a) { var E = [Hh[0] + q.width * Math.cos(a * Math.PI / 180), Hh[1] + q.width * Math.sin(a * Math.PI / 180)]; if (Math.abs(E[bci] - Hh[bci]) <= tol) Jb = [r6(E[0]), r6(E[1])]; });
      var bs = ws.filter(function (w) { var r = w.params.rect; return Math.abs(r[bci] - bx.band[0]) <= tol && Math.abs(r[bci + 2] - bx.band[1]) <= tol && (r[bai + 2] <= bx.s[0] + tol || r[bai] >= bx.s[1] - tol); })
        .sort(function (p, r) { return p.params.rect[bai] - r.params.rect[bai]; });
      var jb = bs.filter(function (w) { return w.params.rect[bai + 2] <= bx.s[0] + tol; }).slice(-1).concat(bs.filter(function (w) { return w.params.rect[bai] >= bx.s[1] - tol; }).slice(0, 1));   // the two jamb pieces
      bs = jb;
      if (!Jb || !bs.length) return { gap: 'GAP:door_no_strip' };
      return { ai: bai, ci: bci, J: Jb, cr: [bx.band[0], bx.band[1]], strip: bs };
    }
    var hits = pass(centre); if (!hits.length) hits = pass(face);
    var nCand = hits.length;
    if (hits.length > 1) hits = hits.filter(function (h) {           // L2.7 (4): only when several: the closed leaf's span is a wall-free gap bounded by strip pieces at both ends
      var ai = h.ai, lo = Math.min(Hh[ai], h.J[ai]), hi = Math.max(Hh[ai], h.J[ai]);
      return h.strip.some(function (w) { return w.params.rect[ai + 2] <= lo + tol; }) && h.strip.some(function (w) { return w.params.rect[ai] >= hi - tol; }) &&
        !h.strip.some(function (w) { var r = w.params.rect; return r[ai] < hi - tol && r[ai + 2] > lo + tol; });
    });
    if (hits.length !== 1) return { gap: hits.length || nCand > 1 ? 'GAP:door_host_ambiguous' : 'GAP:door_no_strip' };
    return hits[0];
  }

  // ---- §6 openings in drawn gaps: infill around the void ----
  function bridgeOpenings(ops, cfg, opts) {
    var tol = cfg.snap_tol, ztol = typeof cfg.elev_tol === 'number' ? cfg.elev_tol : tol, level = opts.level, hashHex = opts.hashHex;
    var ws = walls(ops).filter(function (o) { return o.params.rect && !o.params.infill && typeof o.params.height === 'number'; });
    var gaps = [], notes = [], infill = [], voids = [], groups = {};
    function note(code, o, extra) { gaps.push(Object.assign({ code: code, handle: o.params.handle, kind: o.params.kind }, extra || {})); }
    var opens = ops.filter(function (o) { return o.op_type === 'DXF_OPENING' && (o.params.kind === 'window' || o.params.kind === 'door'); })
      .slice().sort(function (a, b) { return hnum(a.params.handle) - hnum(b.params.handle) || (a.params.sill || 0) - (b.params.sill || 0); });
    opens.forEach(function (o) {
      var q = o.params;
      var z0, z1;
      if (q.kind === 'window') { if (typeof q.sill !== 'number' || typeof q.height !== 'number') { note('GAP:no_height', o); return; } z0 = level + q.sill; z1 = z0 + q.height; }
      else { if (typeof q.height !== 'number') { note('GAP:no_height', o); return; } z0 = level; z1 = level + q.height; }
      var ai, ci, cr, c;
      if (q.kind === 'window') {                                                                 // window: its own drawn box gives axis and strip (a square corner host has no direction)
        var hz = (q.bbox[2] - q.bbox[0]) >= (q.bbox[3] - q.bbox[1]); ai = hz ? 0 : 1; ci = 1 - ai; cr = [q.bbox[ci], q.bbox[ci + 2]]; c = (q.bbox[ai] + q.bbox[ai + 2]) / 2;
      } else {                                                                                   // door: OP-1b, the strip the closed leaf lies in (not the nearest piece to the hinge)
        var dsx = doorStrip(o, ws, tol); if (dsx.gap) { note(dsx.gap, o); return; }
        ai = dsx.ai; ci = dsx.ci; cr = dsx.cr; c = (q.hinge[ai] + dsx.J[ai]) / 2;
      }
      var strip = ws.filter(function (w) { var r = w.params.rect; return Math.abs(r[ci] - cr[0]) <= tol && Math.abs(r[ci + 2] - cr[1]) <= tol; })
        .sort(function (a, b) { return a.params.rect[ai] - b.params.rect[ai] || hnum(a.params.handle) - hnum(b.params.handle); });
      if (strip.some(function (w) { var r = w.params.rect; return r[ai] < c - tol && r[ai + 2] > c + tol; })) { note('GAP:opening_inside_piece', o, { c: r6(c) }); return; }
      var A = null, B = null;
      strip.forEach(function (w) { var r = w.params.rect; if (r[ai + 2] <= c + tol && (!A || r[ai + 2] > A.params.rect[ai + 2])) A = w; if (r[ai] >= c - tol && (!B || r[ai] < B.params.rect[ai])) B = w; });
      if ((!A || !B) && q.kind === 'window') {   // §F8 D24b: a window drawn thinner than its wall (its own frame) sits INSIDE the wall's thickness: bounded by the nearest piece on
        // each side whose band contains the window band (the two may differ in thickness, e.g. corner pieces); the void / infill takes the band both share. Only when the exact match found no bounded strip
        var cont = ws.filter(function (w) { var r = w.params.rect; return r[ci] <= cr[0] + tol && r[ci + 2] >= cr[1] - tol; }), a = null, b = null;
        cont.forEach(function (w) { var r = w.params.rect; if (r[ai + 2] <= c + tol && (!a || r[ai + 2] > a.params.rect[ai + 2])) a = w; if (r[ai] >= c - tol && (!b || r[ai] < b.params.rect[ai])) b = w; });
        var e0 = q.bbox[ai], e1 = q.bbox[ai + 2];   // the bounding pieces meet the window's own ends (the writer cuts the gap at the window): never a piece further along the wall line
        if (a && b && Math.abs(a.params.rect[ai + 2] - e0) <= tol && Math.abs(b.params.rect[ai] - e1) <= tol && !cont.some(function (w) { var r = w.params.rect; return r[ai] < c - tol && r[ai + 2] > c + tol; })) {
          var ra = a.params.rect, rb = b.params.rect; A = a; B = b; cr = [Math.max(ra[ci], rb[ci]), Math.min(ra[ci + 2], rb[ci + 2])]; o.params.in_wall_band = cr.map(r6);
        }
      }
      if ((!A || !B) && q.kind === 'window') {   // §D55b a window drawn wider than its gap: its frame posts embedded in the jambs and / or its pane proud of the wall face (JKR W1: 1.29 m drawn
        // over a 1.25 m gap, 20 mm into each piece). Bounded by the two pieces of ONE strip whose ends lie inside the window's ends by at most WINDOW_EMBED; the void takes the wall's band.
        var w0 = q.bbox[ai], w1 = q.bbox[ai + 2], over = ws.filter(function (w) { var r = w.params.rect; return r[ci] < cr[1] - tol && r[ci + 2] > cr[0] + tol; });
        var ea = over.filter(function (w) { var r = w.params.rect; return r[ai] < w0 - tol && r[ai + 2] > w0 + tol && r[ai + 2] <= w0 + WINDOW_EMBED + tol; });
        var eb = over.filter(function (w) { var r = w.params.rect; return r[ai + 2] > w1 + tol && r[ai] < w1 - tol && r[ai] >= w1 - WINDOW_EMBED - tol; });
        if (ea.length === 1 && eb.length === 1) { var pa = ea[0].params.rect, pb = eb[0].params.rect;
          if (Math.abs(pa[ci] - pb[ci]) <= tol && Math.abs(pa[ci + 2] - pb[ci + 2]) <= tol && !over.some(function (w) { var r = w.params.rect; return w !== ea[0] && w !== eb[0] && r[ai] < pb[ai] - tol && r[ai + 2] > pa[ai + 2] + tol && r[ci] <= pa[ci] + tol && r[ci + 2] >= pa[ci + 2] - tol; })) {
            A = ea[0]; B = eb[0]; cr = [pa[ci], pa[ci + 2]]; o.params.in_wall_band = cr.map(r6); o.params.embedded = [r6(pa[ai + 2] - w0), r6(w1 - pb[ai])]; c = (pa[ai + 2] + pb[ai]) / 2;
          } }
      }
      if (!A || !B) { note('GAP:opening_gap_unbounded', o, { c: r6(c), before: A && A.params.handle, after: B && B.params.handle }); return; }
      var key = A.output_guid + '|' + B.output_guid;
      (groups[key] = groups[key] || { A: A, B: B, ai: ai, ci: ci, cr: cr, s0: A.params.rect[ai + 2], s1: B.params.rect[ai], items: [] }).items.push({ o: o, z0: r6(z0), z1: r6(z1), c: r6(c) });
    });
    var used = {};
    Object.keys(groups).sort().forEach(function (key) {
      var g = groups[key], A = g.A, B = g.B, zbA = level + A.params.base, ztA = zbA + A.params.height, zbB = level + B.params.base, ztB = zbB + B.params.height;
      g.items.forEach(function (it) { used[it.o.output_guid] = 1; });
      if (g.s1 - g.s0 > cfg.opening.gap_max + tol) { g.items.forEach(function (it) { note('GAP:opening_gap_unbounded', it.o, { c: it.c, gap: r6(g.s1 - g.s0), gap_max: cfg.opening.gap_max, reason: 'the gap between the wall pieces is longer than an opening gap: no wall is bridged over it (D52)' }); }); return; }   // §D52
      if (Math.abs(zbA - zbB) > ztol || Math.abs(ztA - ztB) > ztol) { g.items.forEach(function (it) { note('GAP:gap_height_conflict', it.o, { a: [r6(zbA), r6(ztA)], b: [r6(zbB), r6(ztB)] }); }); return; }
      var zb = r6(Math.min(zbA, zbB)), zt = r6(Math.max(ztA, ztB));
      var bad = g.items.filter(function (it) { return it.z0 < zb - ztol || it.z1 > zt + ztol; });
      if (bad.length) { bad.forEach(function (it) { note('GAP:opening_outside_wall', it.o, { z: [it.z0, it.z1], wall: [zb, zt] }); }); return; }
      var iv = g.items.map(function (it) { return [Math.max(zb, it.z0), Math.min(zt, it.z1)]; }).sort(function (p, q) { return p[0] - q[0]; });
      var rest = [], cur = zb;
      iv.forEach(function (x) { if (x[0] > cur + 1e-6) rest.push([cur, x[0]]); cur = Math.max(cur, x[1]); });
      if (zt > cur + 1e-6) rest.push([cur, zt]);
      var t = r6(g.cr[1] - g.cr[0]), cc = r6((g.cr[0] + g.cr[1]) / 2), s0 = r6(g.s0), s1 = r6(g.s1);
      voids.push({ s: [s0, s1], axis: g.ai === 0 ? 'x' : 'y', cross: [g.cr[0], g.cr[1]], z: iv.map(function (x) { return [r6(x[0]), r6(x[1])]; }), openings: g.items.map(function (it) { return it.o.params.handle; }), centre_xy: g.ai === 0 ? [r6((s0 + s1) / 2), cc] : [cc, r6((s0 + s1) / 2)], keyOf: g.items.map(function (it) { return it.o.output_guid; }) });
      rest.forEach(function (z, i) {
        var rect = g.ai === 0 ? [s0, r6(g.cr[0]), s1, r6(g.cr[1])] : [r6(g.cr[0]), s0, r6(g.cr[1]), s1];
        infill.push({ op_type: 'DXF_WALL', input_guids: [A.output_guid, B.output_guid], output_guid: hashHex(key + '|infill|' + i).slice(0, 32), params: {
          run_id: A.params.run_id, handle: A.params.handle, layer: A.params.layer, part: 'infill' + i, infill: true, infill_of: [A.params.handle, B.params.handle], openings: g.items.map(function (it) { return it.o.params.handle; }),
          start: g.ai === 0 ? [s0, cc] : [cc, s0], end: g.ai === 0 ? [s1, cc] : [cc, s1], length: r6(s1 - s0), thickness: t, rect: rect, footprint: true,
          base: r6(z[0] - level), height: r6(z[1] - z[0]), height_source: 'opening_bridge' } });
      });
    });
    // NOTE: drawn gaps in a strip that hold no opening (OP-5)
    var seenStrip = {};
    ws.forEach(function (w) {
      var hz = isH(w.params), ci = hz ? 1 : 0, ai = hz ? 0 : 1, r = w.params.rect, k = ai + ':' + r6(r[ci]) + ':' + r6(r[ci + 2]);
      if (seenStrip[k]) return; seenStrip[k] = 1;
      var strip = ws.filter(function (x) { var q = x.params.rect; return Math.abs(q[ci] - r[ci]) <= tol && Math.abs(q[ci + 2] - r[ci + 2]) <= tol; }).sort(function (a, b) { return a.params.rect[ai] - b.params.rect[ai]; });
      var endP = strip[0];                                                                     // piece reaching farthest so far (mitre bboxes overlap)
      for (var i = 1; i < strip.length; i++) {
        var a = endP.params.rect[ai + 2], b = strip[i].params.rect[ai];
        if (b - a > tol) {
          var k2 = endP.output_guid + '|' + strip[i].output_guid;
          if (!groups[k2]) notes.push({ code: 'NOTE:gap_without_opening', axis: ai === 0 ? 'x' : 'y', cross: [r[ci], r[ci + 2]], s: [r6(a), r6(b)], between: [endP.params.handle, strip[i].params.handle] });
        }
        if (strip[i].params.rect[ai + 2] > endP.params.rect[ai + 2]) endP = strip[i];
      }
    });
    return { infill: infill, voids: voids, gaps: gaps, notes: notes };
  }

  // ---- §6.1 door swing from the drawn arc: side it opens toward, and which jamb carries the hinge ----
  function doorSwing(door, ws, tol) {
    var q = door.params, st = doorStrip(door, ws, tol); if (st.gap) return { gap: st.gap };
    var ai = st.ai, ci = st.ci, J = st.J, Hh = q.hinge;
    var a0 = q.swing_start_deg, a1 = q.swing_end_deg; if (a1 < a0) a1 += 360;
    var mid = (a0 + a1) / 2 * Math.PI / 180, d = [Math.cos(mid), Math.sin(mid)], side = d[ci] > 0 ? '+' : '-';
    return { opens_to: side + (ci === 0 ? 'x' : 'y'), hinge_jamb: (Hh[ai] < J[ai] ? '-' : '+') + (ai === 0 ? 'x' : 'y'), hinge: Hh, closed_end: J, axis: ai === 0 ? 'x' : 'y', strip: st.strip.map(function (w) { return w.params.handle; }) };
  }

  // ---- §7 fills from the LOD400 library ----
  function pairKey(s) { var m = /(\d{3,4})\D{0,12}?[x×]\s*(\d{3,4})/.exec(s || ''); return m ? +m[1] + 'x' + +m[2] : null; }
  function familyToRef(fam, geoms) {
    var key = pairKey(fam.description), m = /(\d{3,4})\D{0,12}?[x×]\s*(\d{3,4})/.exec(fam.description || ''), token = m ? fam.description.slice(0, m.index).trim() : '';
    if (!key) return { gap: 'GAP:no_lod400_geometry', reason: 'no size pair in the family description' };
    var refs = uniqStr(geoms.filter(function (g) { return g.ifc_class === fam.ifc_class && pairKey(g.element_ref) === key; }).map(function (g) { return g.element_ref; }));
    var tok = refs.filter(function (r) { return r.split(':')[0] === token; });
    if (tok.length) refs = tok;
    if (!refs.length) return { gap: 'GAP:no_lod400_geometry', key: key, token: token };
    if (refs.length > 1) return { gap: 'GAP:lod400_ambiguous', key: key, token: token, candidates: refs };
    return { ref: refs[0], key: key, token: token };
  }
  function uniqStr(a) { var o = []; a.slice().sort().forEach(function (x) { if (o[o.length - 1] !== x) o.push(x); }); return o; }
  function placeFills(ops, lib, opts) {
    var level = opts.level, hashHex = opts.hashHex, gaps = [], els = [], hard = [], voidOf = opts.voidOf || {};
    var fams = {}; lib.families.forEach(function (f) { fams[f.family_id] = f; });
    ops.filter(function (o) { return o.op_type === 'DXF_OPENING' && (o.params.kind === 'window' || o.params.kind === 'door'); }).forEach(function (o) {
      var q = o.params, tid = q.type && q.type.type_id;
      function g(code, extra) { var x = Object.assign({ code: code, handle: q.handle, kind: q.kind, type_id: tid || null }, extra || {}); gaps.push(x); if (/lod400|no_lod400/.test(code)) hard.push(x); }
      if (!tid) { g('GAP:fill_unbound'); return; }
      var fam = fams[tid]; if (!fam) { g('GAP:no_lod400_geometry', { reason: 'bound id not in library families' }); return; }
      var m = familyToRef(fam, lib.geoms); if (m.gap) { g(m.gap, m); return; }
      var alongX = q.kind === 'window' ? (q.bbox[2] - q.bbox[0]) >= (q.bbox[3] - q.bbox[1]) : (voidOf[o.output_guid] ? voidOf[o.output_guid].axis === 'x' : null);
      if (alongX === null) { g('GAP:fill_no_void', { reason: 'door not matched to a drawn gap' }); return; }
      var cands = lib.geoms.filter(function (x) { return x.element_ref === m.ref && x.ifc_class === fam.ifc_class; })
        .filter(function (x) { var dx = x.bbox.max[0] - x.bbox.min[0], dy = x.bbox.max[1] - x.bbox.min[1]; return alongX ? dx >= dy : dy >= dx; })
        .sort(function (a, b) { return a.geometry_hash < b.geometry_hash ? -1 : a.geometry_hash > b.geometry_hash ? 1 : 0; });
      if (!cands.length) { g('GAP:lod400_orientation', { element_ref: m.ref, along: alongX ? 'x' : 'y' }); return; }
      var G = cands[0];
      if (G.faces.length <= 12) { g('GAP:lod400_envelope', { element_ref: m.ref, geometry_hash: G.geometry_hash, triangles: G.faces.length }); return; }
      var sill = q.kind === 'window' ? q.sill : 0;
      if (typeof sill !== 'number' || typeof q.height !== 'number') { g('GAP:no_height'); return; }
      var cx, cy;
      if (q.kind === 'window') { cx = (q.bbox[0] + q.bbox[2]) / 2; cy = (q.bbox[1] + q.bbox[3]) / 2; }
      else { cx = voidOf[o.output_guid].centre_xy[0]; cy = voidOf[o.output_guid].centre_xy[1]; }
      var cz = level + sill + q.height / 2, lc = [(G.bbox.min[0] + G.bbox.max[0]) / 2, (G.bbox.min[1] + G.bbox.max[1]) / 2, (G.bbox.min[2] + G.bbox.max[2]) / 2];
      var V = G.vertices.map(function (v) { return [r6(v[0] - lc[0] + cx), r6(v[1] - lc[1] + cy), r6(v[2] - lc[2] + cz)]; });
      var gw = alongX ? G.bbox.max[0] - G.bbox.min[0] : G.bbox.max[1] - G.bbox.min[1], gh = G.bbox.max[2] - G.bbox.min[2];
      var mw = q.kind === 'window' ? Math.max(q.bbox[2] - q.bbox[0], q.bbox[3] - q.bbox[1]) : (q.opening_box && q.opening_box.along ? r6(q.opening_box.along[1] - q.opening_box.along[0]) : r6(voidOf[o.output_guid].s[1] - voidOf[o.output_guid].s[0]));   // L2.7 (2): door = drawn frame extent (else the wall gap), not the leaf
      var dw = r6(gw - mw), dh = r6(gh - q.height);
      if (typeof opts.size_tol === 'number' && (Math.abs(dw) > opts.size_tol || Math.abs(dh) > opts.size_tol)) g('GAP:fill_size_mismatch', { delta_w: dw, delta_h: dh, element_ref: m.ref });
      els.push({ guid: hashHex(o.output_guid + '|fill|' + G.geometry_hash).slice(0, 32), class: q.kind === 'door' ? 'IfcDoor' : 'IfcWindow', handle: q.handle, layer: q.layer, piece: 0,
        family_id: tid, element_ref: m.ref, geometry_hash: G.geometry_hash, centre: [r6(cx), r6(cy), r6(cz)], size_delta: [dw, dh], vertices: V, faces: G.faces.map(function (f) { return f.slice(); }) });
    });
    if (hard.length) {
      var err = new Error('LOD400 HARD FAIL (no fallback): ' + hard.map(function (x) { return x.code + ' ' + x.kind + ' ' + x.handle + ' ' + x.type_id; }).join('; '));
      err.gaps = gaps; err.hard = hard; throw err;
    }
    return { elements: els, gaps: gaps };
  }


  // ---- lane spec L2.8 (1): wall BASE from the lowest stated source: section (if it cuts the piece) > elevation > plan level (+ advisory) ----
  // opts: { level, lowerLevel (next lower plan level, or undefined), lowerPieces: [rect m] of the lower plan, section: { walls:[{h:[a,b], bottom, top, handle}], axis:'X'|'Y', at:m } | null, tol }
  function applyWallBases(ops, opts) {
    var tol = opts.tol, level = opts.level, sec = opts.section, floor = typeof opts.lowerLevel === 'number' ? opts.lowerLevel : level, out = [], adv = [], rep = { section: 0, elevation: 0, plan_level: 0 };
    // a cut inside a drawn opening (door opening_box s0..s1 / window bbox, same band) states the base of that opening's two jamb pieces
    var jambCut = {};
    if (sec) {
      var sai = sec.axis === 'X' ? 0 : 1, sci = 1 - sai;
      ops.forEach(function (o) {
        if (o.op_type !== 'DXF_OPENING') return; var q = o.params, span = null, band = null;
        if (q.opening_box && (q.opening_box.axis === 'x' ? 0 : 1) === sai) { span = q.opening_box.s; band = q.opening_box.band; }
        else if (q.kind === 'window' && q.bbox) { span = [q.bbox[sai], q.bbox[sai + 2]]; band = [q.bbox[sci], q.bbox[sci + 2]]; }
        if (!span || !(span[0] < sec.at - tol && span[1] > sec.at + tol)) return;
        ops.forEach(function (w) { if (w.op_type !== 'DXF_WALL' || !w.params.rect) return; var r = w.params.rect;
          if (Math.abs(r[sci] - band[0]) <= tol && Math.abs(r[sci + 2] - band[1]) <= tol && (Math.abs(r[sai + 2] - span[0]) <= tol || Math.abs(r[sai] - span[1]) <= tol)) jambCut[w.output_guid] = true; });
      });
    }
    ops.forEach(function (o) {
      if (o.op_type !== 'DXF_WALL' || typeof o.params.height !== 'number' || typeof o.params.base !== 'number') { out.push(o); return; }
      var p = o.params, r = p.rect, z1 = level + p.base + p.height, found = null;
      if (sec && r) {
        var ai = sec.axis === 'X' ? 0 : 1, ci = 1 - ai;
        if ((r[ai] < sec.at - tol && r[ai + 2] > sec.at + tol) || jambCut[o.output_guid]) {
          var mine = sec.walls.filter(function (w) {
            if (Math.abs(w.h[0] - r[ci]) > tol || Math.abs(w.h[1] - r[ci + 2]) > tol) return false;
            if (w.bottom < floor - tol || w.bottom >= z1 - tol) return false;
            if (w.bottom < level - tol && (opts.lowerPieces || []).some(function (q) { return Math.abs(q[ci] - w.h[0]) <= tol && Math.abs(q[ci + 2] - w.h[1]) <= tol; })) return false;   // the lower plan draws this wall line: its rect
            return true;
          });
          if (mine.length) found = { z0: Math.min.apply(null, mine.map(function (w) { return w.bottom; })), from: mine.map(function (w) { return w.handle; }) };
        }
      }
      if (found) { rep.section++; out.push(Object.assign({}, o, { params: Object.assign({}, p, { base: r6(found.z0 - level), height: r6(z1 - found.z0), base_source: 'section', base_from: found.from }) })); return; }
      if (p.height_source === 'elevation') { rep.elevation++; out.push(Object.assign({}, o, { params: Object.assign({}, p, { base_source: 'elevation' }) })); return; }
      rep.plan_level++; out.push(Object.assign({}, o, { params: Object.assign({}, p, { base_source: 'plan_level' }) }));
      if (!p.infill) adv.push({ code: 'GAP:wall_base_from_plan_level', handle: p.handle, part: p.part, layer: p.layer, height_source: p.height_source || null });
    });
    return { ops: out, advisories: adv, report: rep };
  }

  // ---- lane spec L2.8 (2): one wall per footprint across consecutive plans (no GUIDs in drawings: footprint only) ----
  // storeys: [{ name, level, ops }] in level order; a piece on storey i+1 with the same rect (tol) whose z-range overlaps or touches (ztol) a piece on storey i -> one wall on storey i
  function mergeStacked(storeys, tol, ztol) {
    var merged = [];
    for (var i = 0; i + 1 < storeys.length; i++) {
      var lo = storeys[i], up = storeys[i + 1], drop = {};
      var zr = function (st, o) { var z0 = st.level + o.params.base; return [z0, z0 + o.params.height]; };
      var walls = function (st) { return st.ops.filter(function (o) { return o.op_type === 'DXF_WALL' && o.params.rect && typeof o.params.height === 'number' && !o.params.infill; }); };
      var upW = walls(up);
      lo.ops = lo.ops.map(function (o) {
        if (o.op_type !== 'DXF_WALL' || !o.params.rect || typeof o.params.height !== 'number' || o.params.infill) return o;
        var a = zr(lo, o), m = upW.find(function (u) { return !drop[u.output_guid] && u.params.rect.every(function (v, k) { return Math.abs(v - o.params.rect[k]) <= tol; }) && (function (b) { return b[0] <= a[1] + ztol && a[0] <= b[1] + ztol; })(zr(up, u)); });
        if (!m) return o;
        var b = zr(up, m), z0 = Math.min(a[0], b[0]), z1 = Math.max(a[1], b[1]); drop[m.output_guid] = 1;
        merged.push({ lower: o.params.handle, upper: m.params.handle, storeys: [lo.name, up.name], z: [r6(z0), r6(z1)] });
        return Object.assign({}, o, { params: Object.assign({}, o.params, { base: r6(z0 - lo.level), height: r6(z1 - z0), height_source: 'stacked:' + (o.params.height_source || '?') + '+' + (m.params.height_source || '?'), merged_with: { handle: m.params.handle, storey: up.name } }) });
      });
      up.ops = up.ops.filter(function (o) { return !drop[o.output_guid]; });
    }
    return { storeys: storeys, merged: merged };
  }

  return { prismRect: prismRect, innerRing: innerRing, envelope: envelope, slabZ: slabZ, sectionSlabs: sectionSlabs, stackAt: stackAt, roofZ: roofZ, levelLinesZ: levelLinesZ, roofPlan: roofPlan, closedRects: closedRects,
    applySlabAbove: applySlabAbove, applyWallBases: applyWallBases, mergeStacked: mergeStacked, bridgeOpenings: bridgeOpenings, faceCover: faceCover, boundedCells: boundedCells, prismCells: prismCells, prismPoly: prismPoly, slabEdges: slabEdges, doorSwing: doorSwing, doorStrip: doorStrip, placeFills: placeFills, familyToRef: familyToRef, pairKey: pairKey };
});
