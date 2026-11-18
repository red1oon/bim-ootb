// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — layer_pack.js: the LOD Upgrade pack "Layers". Read the §LODUP_* log after every run; the exit code is not evidence.
// Implementing prompts/MODELLER_LOD_UPGRADE_PILL.md §4 P3 ("P3 SPEC") — Witness: W-LODUP-LAYERS (modeller/tests/witness_lodup_layers.js).
// Issue proved/disproved: "the browser result differs from the proven Python result" (BIMCompiler DAGCompiler/python/extractIFCtoDB.py compile_layer_geometry L1403 and helpers, the §LAYER-REFUSE rules, and the part names / change rows of jpam/build_jpam.py section A).
// Splits a multi-layer element (IfcMaterialLayerSetUsage) into one IfcBuildingElementPart per layer. Two honest input states (never mixed, spec "P3 SPEC"):
//   SLICED   the extractor already compiled this hash: the host mesh is the concatenated slabs + component_geometry_layers rows. The parts are those triangle ranges, RE-VERIFIED against the authored tables.
//   ENVELOPE the host still holds its one solid: the slicer itself (plane clip + caps), a port of _slice_slab / _cross_section_loops / _cap_triangles / _layer_intervals / _orient_coherently.
// Pure: input in, parts + change rows out. No DOM, no DB handle (inp.layers is the reader's accessor set). Deterministic (no clock, no random, every loop in sorted / stored order).
// INPUT  inp.meta {guid:{cls,name,storey,disc,building,rgba}}, inp.layers (lod_reader.js layerApi)    RULES rows of lod/rules/layer_defaults.json
// OPTS   {ignoreSense: bool (the red control: the direction sense is ignored, every stack runs from the positive end), log: fn(line)}
// OUTPUT {parts:[{guid, cls, name, storey, disc, building, tris:Float64Array world xyz soup, parents:[host], rgba, host, seq, th, path}], changes, stats, audit}
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LodLayerPack = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var AXIS = { AXIS1: 0, AXIS2: 1, AXIS3: 2 };

  function Refusal(msg) { this.message = msg; }                         // §LAYER-REFUSE: authored data missing / ambiguous for a deterministic slice. Never guess.
  Refusal.prototype = Object.create(Error.prototype);
  function refuse(msg) { throw new Refusal(msg); }

  // ---- Python formatting twins
  function reprNum(x) { if (x === null || x === undefined) return 'None'; var s = String(x); return /^-?\d+$/.test(s) ? s + '.0' : s; }
  function reprStr(x) { if (x === null || x === undefined) return 'None'; var s = String(x); return (s.indexOf("'") >= 0 && s.indexOf('"') < 0) ? '"' + s + '"' : "'" + s.replace(/'/g, "\\'") + "'"; }
  function f(x, d) { return (Object.is(x, -0) ? '-' : '') + Number(x).toFixed(d); }   // Python prints a negative zero as -0.0000; a body face stored as -0.0 shows in the §LAYER-REFUSE text

  // ---- mesh helpers (V Float64Array xyz, F Int32Array triples)
  function weldMesh(V, F) {                                              // _weld_mesh: round to 1e-9 m, unique rows (np.unique order), drop collapsed faces
    var n = V.length / 3, key = {}, uq = [], inv = new Int32Array(n), i, rd = function (x) { return Math.round(x * 1e9) / 1e9; };   // np.round keeps the sign of a zero
    for (i = 0; i < n; i++) { var x = rd(V[3 * i]), y = rd(V[3 * i + 1]), z = rd(V[3 * i + 2]), k = x + ',' + y + ',' + z, id = key[k]; if (id === undefined) { id = uq.length; key[k] = id; uq.push([x, y, z]); } inv[i] = id; }
    var order = uq.map(function (_, j) { return j; }).sort(function (a, b) { var p = uq[a], q = uq[b]; return (p[0] - q[0]) || (p[1] - q[1]) || (p[2] - q[2]); }), rank = new Int32Array(uq.length), v = new Float64Array(uq.length * 3);
    order.forEach(function (o, r) { rank[o] = r; v[3 * r] = uq[o][0]; v[3 * r + 1] = uq[o][1]; v[3 * r + 2] = uq[o][2]; });
    var out = [];
    for (i = 0; i + 2 < F.length; i += 3) { var a = rank[inv[F[i]]], b = rank[inv[F[i + 1]]], c = rank[inv[F[i + 2]]]; if (a !== b && b !== c && c !== a) out.push(a, b, c); }
    return { v: v, f: Int32Array.from(out) };
  }
  function signedVolume(v, F, mask) {                                    // divergence theorem; positive when the winding is outward
    var s = 0;
    for (var t = 0; t + 2 < F.length; t += 3) {
      if (mask && !mask[t / 3]) continue;
      var a = 3 * F[t], b = 3 * F[t + 1], c = 3 * F[t + 2];
      s += v[a] * (v[b + 1] * v[c + 2] - v[b + 2] * v[c + 1]) + v[a + 1] * (v[b + 2] * v[c] - v[b] * v[c + 2]) + v[a + 2] * (v[b] * v[c + 1] - v[b + 1] * v[c]);
    }
    return s / 6;
  }
  function edgeCounts(F) {
    var m = {}, nv = 0, i; for (i = 0; i < F.length; i++) if (F[i] >= nv) nv = F[i] + 1;
    for (i = 0; i + 2 < F.length; i += 3) for (var e = 0; e < 3; e++) { var p = F[i + e], q = F[i + (e + 1) % 3], k = p < q ? p * nv + q : q * nv + p; m[k] = (m[k] || 0) + 1; }
    return m;
  }
  function assertWatertight(F, what) {
    var m = edgeCounts(F), bad = 0, n = 0; Object.keys(m).forEach(function (k) { n++; if (m[k] !== 2) bad++; });
    if (bad) refuse(what + ' not watertight (' + bad + '/' + n + ' edges not shared by exactly 2 faces)');
  }

  function orientCoherently(v, F) {                                      // _orient_coherently: one orientation across shared edges, each closed component outward, refuses non-manifold / non-orientable / nested
    var nf = F.length / 3, nv = v.length / 3, em = {}, fi, e;
    for (fi = 0; fi < nf; fi++) for (e = 0; e < 3; e++) { var i = F[3 * fi + e], j = F[3 * fi + (e + 1) % 3], key = i < j ? i * nv + j : j * nv + i; (em[key] = em[key] || []).push([fi, i < j]); }
    var flip = new Uint8Array(nf), seen = new Uint8Array(nf), comp = new Int32Array(nf).fill(-1), ncomp = 0, seed;
    for (seed = 0; seed < nf; seed++) {
      if (seen[seed]) continue;
      var stack = [seed]; seen[seed] = 1; comp[seed] = ncomp;
      while (stack.length) {
        var cur = stack.pop();
        for (e = 0; e < 3; e++) {
          var a = F[3 * cur + e], b = F[3 * cur + (e + 1) % 3], k2 = a < b ? a * nv + b : b * nv + a, pair = em[k2];
          if (pair.length !== 2) refuse('envelope not edge-manifold during winding normalization');
          var fwdI = a < b;
          for (var pi = 0; pi < 2; pi++) { var fj = pair[pi][0], fwdJ = pair[pi][1]; if (fj === cur || seen[fj]) continue; flip[fj] = (((fwdI ? 1 : 0) ^ flip[cur]) === (fwdJ ? 1 : 0)) ? 1 : 0; seen[fj] = 1; comp[fj] = ncomp; stack.push(fj); }
        }
      }
      ncomp++;
    }
    var out = Int32Array.from(F);
    for (fi = 0; fi < nf; fi++) if (flip[fi]) { var t = out[3 * fi + 1]; out[3 * fi + 1] = out[3 * fi + 2]; out[3 * fi + 2] = t; }
    var dirs = {};
    for (fi = 0; fi < nf; fi++) for (e = 0; e < 3; e++) { var p = out[3 * fi + e], q = out[3 * fi + (e + 1) % 3], kk = p < q ? p * nv + q : q * nv + p; (dirs[kk] = dirs[kk] || []).push(p < q); }
    Object.keys(dirs).forEach(function (kk) { var dd = dirs[kk]; if (dd.length !== 2 || dd[0] === dd[1]) refuse('envelope surface is non-orientable — cannot normalize winding'); });
    if (ncomp > 1) {
      var boxes = [], ci, cj, q2;
      for (ci = 0; ci < ncomp; ci++) { var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (fi = 0; fi < nf; fi++) if (comp[fi] === ci) for (e = 0; e < 3; e++) for (q2 = 0; q2 < 3; q2++) { var x = v[3 * out[3 * fi + e] + q2]; if (x < lo[q2]) lo[q2] = x; if (x > hi[q2]) hi[q2] = x; } boxes.push([lo, hi]); }
      for (ci = 0; ci < ncomp; ci++) for (cj = 0; cj < ncomp; cj++) if (ci !== cj) { var inside = true; for (q2 = 0; q2 < 3; q2++) if (!(boxes[ci][0][q2] >= boxes[cj][0][q2] - 1e-9 && boxes[ci][1][q2] <= boxes[cj][1][q2] + 1e-9)) inside = false; if (inside) refuse('nested closed components (internal cavity?) — ambiguous orientation, refusing'); }
    }
    for (var c2 = 0; c2 < ncomp; c2++) {
      var mask = new Uint8Array(nf); for (fi = 0; fi < nf; fi++) mask[fi] = comp[fi] === c2 ? 1 : 0;
      if (signedVolume(v, out, mask) < 0) for (fi = 0; fi < nf; fi++) if (mask[fi]) { var t2 = out[3 * fi + 1]; out[3 * fi + 1] = out[3 * fi + 2]; out[3 * fi + 2] = t2; }
    }
    return out;
  }

  // ---- authored intervals (_layer_intervals): ABSOLUTE anchoring (offset +- cumsum) when both body faces land on authored boundaries, else RELATIVE (body extent == authored total)
  function layerIntervals(off, sense, th, ymin, ymax, guid, axisVals, TOL) {
    var sign = sense === 'POSITIVE' ? 1 : -1, cum = [0], i;
    for (i = 0; i < th.length; i++) cum.push(cum[i] + th[i]);
    function nearest(vals, b) { var m = Infinity; for (var q = 0; q < vals.length; q++) { var d = Math.abs(vals[q] - b); if (d < m) m = d; } return m; }
    function classify(bounds) {
      bounds = bounds.map(function (b) { return Math.abs(b - ymin) < TOL ? ymin : b; }).map(function (b) { return Math.abs(b - ymax) < TOL ? ymax : b; });
      if (axisVals) {
        for (var bi = 0; bi < bounds.length; bi++) {
          var b = bounds[bi]; if (b === ymin || b === ymax || nearest(axisVals, b) >= 1e-7) continue;
          var hit = null, steps = Math.floor(TOL / 2 / 1e-6);
          for (var step = 1; step <= steps && hit === null; step++) { var cands = [b + step * 1e-6, b - step * 1e-6]; for (var ci = 0; ci < 2; ci++) if (nearest(axisVals, cands[ci]) >= 1e-7) { hit = cands[ci]; break; } }
          if (hit === null) return null; bounds[bi] = hit;
        }
      }
      var iv = [], any = false;
      for (var j = 0; j < th.length; j++) {
        var lo = Math.min(bounds[j], bounds[j + 1]), hi = Math.max(bounds[j], bounds[j + 1]);
        if (hi <= ymin + TOL || lo >= ymax - TOL) iv.push([lo, hi, false]);
        else if (lo >= ymin - TOL && hi <= ymax + TOL) { iv.push([lo, hi, true]); any = true; }
        else return null;                                                 // partial-layer coverage: ambiguous
      }
      return any ? iv : null;
    }
    if (off !== null && off !== undefined) {
      var bAbs = cum.map(function (c) { return off + sign * c; });
      if (nearest(bAbs, ymin) < TOL && nearest(bAbs, ymax) < TOL) { var iv = classify(bAbs); if (iv) return iv; }
    }
    var extent = ymax - ymin, total = cum[cum.length - 1];
    if (Math.abs(extent - total) < TOL) { var anchor = sense === 'POSITIVE' ? ymin : ymax, iv2 = classify(cum.map(function (c) { return anchor + sign * c; })); if (iv2) return iv2; }
    refuse('body span [' + f(ymin, 4) + ',' + f(ymax, 4) + '] (extent ' + f(extent, 4) + ') does not align with the authored layer set (total ' + f(total, 4) + ', offset ' + reprNum(off) + ', sense ' + sense + ') under absolute OR relative anchoring');
  }

  // ---- plane clip + caps
  function clipHalf(poly, k, c, keepGe) {                                // Sutherland-Hodgman against axis_k >= c (keepGe) or <= c
    var out = [], n = poly.length;
    for (var i = 0; i < n; i++) {
      var p = poly[i], q = poly[(i + 1) % n], sp = keepGe ? p[k] - c : c - p[k], sq = keepGe ? q[k] - c : c - q[k];
      if (sp >= 0) { out.push(p); if (sq < 0) { var t = sp / (sp - sq); out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1]), p[2] + t * (q[2] - p[2])]); } }
      else if (sq >= 0) { var t2 = sp / (sp - sq); out.push([p[0] + t2 * (q[0] - p[0]), p[1] + t2 * (q[1] - p[1]), p[2] + t2 * (q[2] - p[2])]); }
    }
    return out;
  }
  function crossSectionLoops(v, F, k, c) {                               // closed loops of the watertight mesh at axis_k = c; points keyed by the mesh EDGE they lie on, so the two triangles sharing an edge chain bit-identically
    var nv = v.length / 3, s = new Float64Array(nv), pos = new Uint8Array(nv), i;
    for (i = 0; i < nv; i++) { s[i] = v[3 * i + k] - c; if (Math.abs(s[i]) < 1e-7) refuse('mesh vertex lies on interior cut plane axis' + k + '=' + f(c, 6) + ' (ambiguous cut)'); pos[i] = s[i] > 0 ? 1 : 0; }
    var pts = new Map(), adj = new Map();
    for (var t = 0; t + 2 < F.length; t += 3) {
      var keys = [];
      for (var e = 0; e < 3; e++) {
        var a = F[t + e], b = F[t + (e + 1) % 3];
        if (pos[a] !== pos[b]) { var i0 = a < b ? a : b, j0 = a < b ? b : a, key = i0 * nv + j0; if (!pts.has(key)) { var tt = s[i0] / (s[i0] - s[j0]); pts.set(key, [v[3 * i0] + tt * (v[3 * j0] - v[3 * i0]), v[3 * i0 + 1] + tt * (v[3 * j0 + 1] - v[3 * i0 + 1]), v[3 * i0 + 2] + tt * (v[3 * j0 + 2] - v[3 * i0 + 2])]); } keys.push(key); }
      }
      if (keys.length === 2) { if (!adj.has(keys[0])) adj.set(keys[0], []); if (!adj.has(keys[1])) adj.set(keys[1], []); adj.get(keys[0]).push(keys[1]); adj.get(keys[1]).push(keys[0]); }
      else if (keys.length !== 0) refuse('degenerate plane crossing at axis' + k + '=' + f(c, 6) + ' (triangle cut on ' + keys.length + ' edges)');
    }
    var loops = [], visited = new Set();
    adj.forEach(function (_n, start) {
      if (visited.has(start)) return;
      if (adj.get(start).length !== 2) refuse('non-manifold cross-section at axis' + k + '=' + f(c, 6) + ' (cut-edge degree != 2)');
      var loop = [start], prev = null, cur = start; visited.add(start);
      for (;;) {
        var nb = adj.get(cur); if (nb.length !== 2) refuse('non-manifold cross-section at axis' + k + '=' + f(c, 6) + ' (cut-edge degree != 2)');
        var nxt = nb[0] !== prev ? nb[0] : nb[1];
        if (nxt === start) break;
        if (visited.has(nxt)) refuse('cross-section loop chaining failed at axis' + k + '=' + f(c, 6));
        loop.push(nxt); visited.add(nxt); prev = cur; cur = nxt;
      }
      if (loop.length >= 3) loops.push(loop.map(function (key) { return pts.get(key); }));
    });
    if (!loops.length) refuse('no cross-section at interior plane axis' + k + '=' + f(c, 6) + ' (disjoint envelope body?)');
    return loops;
  }

  // ---- cap triangulation: ear clipping with hole bridges, ALL ring points used (no Steiner point, no collinear point dropped), so the caps weld watertight against the clipped sides
  function area2(r) { var a = 0; for (var i = 0; i < r.length; i++) { var p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; } return a; }
  function inRing(r, pt) { var inside = false; for (var i = 0, j = r.length - 1; i < r.length; j = i++) { var a = r[i], b = r[j]; if (((a[1] > pt[1]) !== (b[1] > pt[1])) && (pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1]) + a[0])) inside = !inside; } return inside; }
  function same(p, q) { return p[0] === q[0] && p[1] === q[1]; }
  function orient(a, b, c) { return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); }
  function segHit(p, q, r, s) {                                          // do segments pq and rs cross or touch other than at a shared end point
    if (same(p, r) || same(p, s) || same(q, r) || same(q, s)) return false;
    var o1 = orient(p, q, r), o2 = orient(p, q, s), o3 = orient(r, s, p), o4 = orient(r, s, q), E = 1e-14;
    if (((o1 > E && o2 < -E) || (o1 < -E && o2 > E)) && ((o3 > E && o4 < -E) || (o3 < -E && o4 > E))) return true;
    var on = function (a, b, c) { return Math.abs(orient(a, b, c)) <= E && Math.min(a[0], b[0]) - 1e-12 <= c[0] && c[0] <= Math.max(a[0], b[0]) + 1e-12 && Math.min(a[1], b[1]) - 1e-12 <= c[1] && c[1] <= Math.max(a[1], b[1]) + 1e-12; };
    return on(p, q, r) || on(p, q, s) || on(r, s, p) || on(r, s, q);
  }
  function triangulate(outer, holes, k, c) {
    var ring = outer.slice(); if (area2(ring) < 0) ring.reverse();
    var hs = holes.map(function (h) { var r = h.slice(); if (area2(r) > 0) r.reverse(); return r; });
    hs.sort(function (a, b) { var ma = Math.max.apply(null, a.map(function (p) { return p[0]; })), mb = Math.max.apply(null, b.map(function (p) { return p[0]; })); return mb - ma; });
    var pending = hs.slice();
    while (pending.length) {
      var hole = pending.shift(), best = null, edges = [];
      function addEdges(r) { for (var i = 0; i < r.length; i++) edges.push([r[i], r[(i + 1) % r.length]]); }
      addEdges(ring); addEdges(hole); pending.forEach(addEdges);
      for (var hi = 0; hi < hole.length; hi++) for (var ri = 0; ri < ring.length; ri++) {
        var d = (hole[hi][0] - ring[ri][0]) * (hole[hi][0] - ring[ri][0]) + (hole[hi][1] - ring[ri][1]) * (hole[hi][1] - ring[ri][1]);
        if (best && d >= best.d) continue;
        var ok = true; for (var ei = 0; ei < edges.length && ok; ei++) if (segHit(hole[hi], ring[ri], edges[ei][0], edges[ei][1])) ok = false;
        if (!ok) continue;
        var mid = [(hole[hi][0] + ring[ri][0]) / 2, (hole[hi][1] + ring[ri][1]) / 2];
        if (!inRing(ring, mid) || inRing(hole, mid)) continue;
        best = { d: d, hi: hi, ri: ri };
      }
      if (!best) refuse('cap hole bridge not found at axis' + k + '=' + f(c, 6));
      var rot = hole.slice(best.hi).concat(hole.slice(0, best.hi));
      ring = ring.slice(0, best.ri + 1).concat(rot, [rot[0]], [ring[best.ri]], ring.slice(best.ri + 1));
    }
    var idx = ring.map(function (_, i) { return i; }), tris = [], guard = 0;
    while (idx.length > 3) {
      var ear = -1, n = idx.length;
      for (var i = 0; i < n && ear < 0; i++) {
        var a = ring[idx[(i + n - 1) % n]], b = ring[idx[i]], cc = ring[idx[(i + 1) % n]];
        if (orient(a, b, cc) <= 1e-12) continue;
        var free = true;
        for (var j = 0; j < n && free; j++) {
          var q = ring[idx[j]]; if (same(q, a) || same(q, b) || same(q, cc)) continue;
          var d1 = orient(a, b, q), d2 = orient(b, cc, q), d3 = orient(cc, a, q), E = -1e-12;
          if (d1 >= E && d2 >= E && d3 >= E) free = false;
        }
        if (free) ear = i;
      }
      if (ear < 0) refuse('cap triangulation failed at axis' + k + '=' + f(c, 6) + ' (no ear in a ' + idx.length + '-point ring)');
      tris.push([ring[idx[(ear + n - 1) % n]], ring[idx[ear]], ring[idx[(ear + 1) % n]]]); idx.splice(ear, 1); if (++guard > 100000) refuse('cap triangulation did not terminate');
    }
    if (idx.length === 3 && Math.abs(orient(ring[idx[0]], ring[idx[1]], ring[idx[2]])) > 1e-12) tris.push([ring[idx[0]], ring[idx[1]], ring[idx[2]]]);
    return tris;
  }
  function capTriangles(loops, k, c, ccw) {
    var u = (k + 1) % 3, w = (k + 2) % 3, rings = loops.map(function (lp) { return lp.map(function (p) { return [p[u], p[w]]; }); }), n = rings.length, i, j;
    rings.forEach(function (r) { if (Math.abs(area2(r)) / 2 <= 1e-12) refuse('invalid/degenerate cross-section loop at axis' + k + '=' + f(c, 6)); });
    var depth = []; for (i = 0; i < n; i++) { depth[i] = 0; for (j = 0; j < n; j++) if (i !== j && inRing(rings[j], rings[i][0])) depth[i]++; }
    var tris2 = [];
    for (var si = 0; si < n; si++) {
      if (depth[si] % 2 !== 0) continue;
      var holes = []; for (j = 0; j < n; j++) if (j !== si && depth[j] === depth[si] + 1 && inRing(rings[si], rings[j][0])) holes.push(rings[j]);
      var polyArea = Math.abs(area2(rings[si])) / 2; holes.forEach(function (h) { polyArea -= Math.abs(area2(h)) / 2; });
      var tr = triangulate(rings[si], holes, k, c), got = 0; tr.forEach(function (t) { got += Math.abs(orient(t[0], t[1], t[2])) / 2; });
      if (Math.abs(got - polyArea) > 1e-9 + 1e-6 * polyArea) refuse('cap triangulation area mismatch at axis' + k + '=' + f(c, 6) + ' (' + f(got, 9) + ' vs ' + f(polyArea, 9) + ' m²)');
      tr.forEach(function (t) { tris2.push(t); });
    }
    var verts = [], tris = [];
    tris2.forEach(function (t2) {
      var a2 = orient(t2[0], t2[1], t2[2]); if (a2 === 0) return; if ((a2 > 0) !== ccw) t2 = [t2[0], t2[2], t2[1]];
      var base = verts.length; t2.forEach(function (p) { var q = [0, 0, 0]; q[k] = c; q[u] = p[0]; q[w] = p[1]; verts.push(q); }); tris.push([base, base + 1, base + 2]);
    });
    return { verts: verts, tris: tris };
  }
  function sliceSlab(v, F, k, lo, hi, ymin, ymax, volSign, TOL) {         // one layer slab = mesh ∩ {lo <= axis_k <= hi}, capped at interior planes, welded, watertight
    var sv = [], st = [], nf = F.length / 3, t, e;
    for (t = 0; t < nf; t++) {
      var tri = [F[3 * t], F[3 * t + 1], F[3 * t + 2]], mn = Infinity, mx = -Infinity;
      for (e = 0; e < 3; e++) { var x = v[3 * tri[e] + k]; if (x < mn) mn = x; if (x > mx) mx = x; }
      var inside = mn >= lo - 1e-12 && mx <= hi + 1e-12;
      if (inside) { var base = sv.length / 3; for (e = 0; e < 3; e++) sv.push(v[3 * tri[e]], v[3 * tri[e] + 1], v[3 * tri[e] + 2]); st.push(base, base + 1, base + 2); }
      else if (mx > lo && mn < hi) {
        var poly = tri.map(function (id) { return [v[3 * id], v[3 * id + 1], v[3 * id + 2]]; });
        poly = clipHalf(poly, k, lo, true); if (poly.length >= 3) poly = clipHalf(poly, k, hi, false);
        if (poly.length >= 3) { var b2 = sv.length / 3; poly.forEach(function (p) { sv.push(p[0], p[1], p[2]); }); for (var q = 1; q < poly.length - 1; q++) st.push(b2, b2 + q, b2 + q + 1); }
      }
    }
    [[lo, false], [hi, true]].forEach(function (cu) {
      var c = cu[0], upper = cu[1];
      if (ymin + TOL < c && c < ymax - TOL) {
        var cap = capTriangles(crossSectionLoops(v, F, k, c), k, c, upper === (volSign > 0)), base = sv.length / 3;
        cap.verts.forEach(function (p) { sv.push(p[0], p[1], p[2]); }); cap.tris.forEach(function (tt) { st.push(tt[0] + base, tt[1] + base, tt[2] + base); });
      }
    });
    if (!st.length) refuse('empty slab in [' + f(lo, 4) + ',' + f(hi, 4) + '] on axis ' + k + ' despite body coverage');
    var w = weldMesh(Float64Array.from(sv), Int32Array.from(st));
    assertWatertight(w.f, 'layer slab [' + f(lo, 4) + ',' + f(hi, 4) + ']');
    return w;
  }

  // ---- placement: the extractor's own rotation (R_recon, Euler rx,ry,rz) then the centre
  function rotMat(a, b, c) {
    var ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
    return [[cb * cc, sa * sb * cc - ca * sc, ca * sb * cc + sa * sc], [cb * sc, sa * sb * sc + ca * cc, ca * sb * sc - sa * cc], [-sb, sa * cb, ca * cb]];
  }
  function toWorld(v, F, fs, fc, tr) {                                   // triangles F[fs .. fs+fc) of the local mesh -> world xyz soup
    var M = rotMat(tr.r[0], tr.r[1], tr.r[2]), out = new Float64Array(fc * 9), o = 0;
    for (var t = fs; t < fs + fc; t++) for (var e = 0; e < 3; e++) {
      var i = 3 * F[3 * t + e], x = v[i], y = v[i + 1], z = v[i + 2];
      out[o++] = M[0][0] * x + M[0][1] * y + M[0][2] * z + tr.c[0]; out[o++] = M[1][0] * x + M[1][1] * y + M[1][2] * z + tr.c[1]; out[o++] = M[2][0] * x + M[2][1] * y + M[2][2] * z + tr.c[2];
    }
    return out;
  }
  function spanAxis(v, F, fs, fc, k) { var mn = Infinity, mx = -Infinity; for (var t = fs; t < fs + fc; t++) for (var e = 0; e < 3; e++) { var x = v[3 * F[3 * t + e] + k]; if (x <= mn) mn = x; if (x >= mx) mx = x; } return [mn, mx]; }

  function run(inp, RULES, opts) {
    opts = opts || {}; var LOG = opts.log || function () { }, IGN = !!opts.ignoreSense;
    var rv = function (k) { if (!RULES[k]) throw new Error('rule row missing: ' + k); return RULES[k].value; };
    var TOL = rv('layer_tol_mm') / 1000, SUMTOL = rv('layer_sum_tol_mm') / 1000, VRT = rv('layer_volume_rtol'), MINC = rv('layer_min_count'), META = inp.meta, L = inp.layers;
    LOG('§LODUP_LAYER_MODE ignoreSense=' + (IGN ? 1 : 0) + ' tol_mm=' + (TOL * 1000) + ' sum_tol_mm=' + (SUMTOL * 1000) + ' volume_rtol=' + VRT);
    var parts = [], CH = [], refused = [], addedVerts = 0, nStored = 0, nSliced = 0, clipped = 0, audit = { hosts: [], refused: refused };
    if (!L) { LOG('§LODUP_LAYER_SCAN hosts=0 INCONCLUSIVE (the model carries no layer-set tables: nothing was judged)'); return { parts: parts, changes: CH, stats: { added: 0, notBuilt: 0, refused: 0, addedVerts: 0, appliesTo: 0, judged: 0 }, audit: audit }; }
    var hosts = L.hosts().filter(function (h) { return h.count >= MINC; });
    LOG('§LODUP_LAYER_SCAN hosts=' + hosts.length + (hosts.length ? '' : ' INCONCLUSIVE (no multi-layer element: nothing was judged)'));

    hosts.forEach(function (h) {
      var m = META[h.guid] || { cls: '?', name: '?', storey: null, disc: null, building: null }, why = null, got = null;
      try { got = host(h, m); } catch (e) { if (e instanceof Refusal) why = e.message; else throw e; }
      if (why !== null) { refused.push({ guid: h.guid, hash: h.hash, cls: m.cls, name: m.name, reason: why }); LOG('§LODUP_LAYER_REFUSE guid=' + h.guid + ' hash=' + h.hash + ' — ' + why); return; }
      got.forEach(function (p) { parts.push(p.part); CH.push(p.change); addedVerts += p.part.tris.length / 3; }); if (got.path === 'stored') nStored++; else nSliced++; if (got.clipped) { clipped += got.clipped.length; LOG('§LODUP_LAYER_CLIP guid=' + h.guid + ' set=' + reprStr(h.set) + ': layers [' + got.clipped.join(', ') + '] clipped away by the authored geometry — rows omitted (the ' + got.length + ' remaining slabs are the element\'s real material)'); }
      audit.hosts.push({ guid: h.guid, hash: h.hash, path: got.path, layers: got.length, dir: h.dir, sense: h.sense, total: h.total });
    });
    // the extractor lists refusals in hash order; the change rows follow it
    refused.slice().sort(function (a, b) { return a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : a.guid < b.guid ? -1 : a.guid > b.guid ? 1 : 0; }).forEach(function (r) { CH.push({ kind: 'REFUSED', guid: r.guid, cls: r.cls, host: r.guid, rule: 'Layer split', detail: '"' + r.name + '" | ' + r.reason + ' (§LAYER-REFUSE)' }); });
    LOG('§LODUP_LAYER_BUILT hosts_split=' + audit.hosts.length + ' parts=' + parts.length + ' refused=' + refused.length + ' state: stored_slabs_verified=' + nStored + ' envelope_sliced=' + nSliced + ' layers_clipped=' + clipped);
    LOG('§LODUP_LAYER_SUMMARY added=' + parts.length + ' refused=' + refused.length + ' addedVerts=' + addedVerts + (parts.length ? '' : ' INCONCLUSIVE (no layer part built: nothing was judged)'));
    return { parts: parts, changes: CH, stats: { added: parts.length, notBuilt: 0, refused: refused.length, addedVerts: addedVerts, appliesTo: hosts.length, judged: hosts.length, hostsSplit: audit.hosts.length, stored: nStored, sliced: nSliced }, audit: audit };

    // ---- one host -> its parts (throws Refusal). The checks run in the extractor's order.
    function host(h, m) {
      var mesh = L.mesh(h.hash); if (!mesh) refuse('no mesh blob in ' + L.table + ' for this hash');
      if (!(h.dir in AXIS)) refuse('LayerSetDirection missing/unknown (' + reprStr(h.dir) + ')');
      if (h.sense !== 'POSITIVE' && h.sense !== 'NEGATIVE') refuse('DirectionSense missing/unknown (' + reprStr(h.sense) + ')');
      if (h.total === null || h.total === undefined || h.total <= 0) refuse('authored total thickness missing/zero (' + reprNum(h.total) + ')');
      var lay = L.layerRows(h.set);
      if (lay.length !== h.count) refuse('material_layers has ' + lay.length + ' rows for set ' + reprStr(h.set) + ' but the authored usage declares layer_count=' + h.count);
      if (lay.some(function (r) { return r.th === null || r.th === undefined || r.th <= 0; })) refuse('a layer thickness is missing/zero in set ' + reprStr(h.set));
      var th = lay.map(function (r) { return +r.th; }), sum = th.reduce(function (a, b) { return a + b; }, 0);
      if (Math.abs(sum - +h.total) > SUMTOL) refuse('authored layer thicknesses sum ' + f(sum, 6) + ' != authored total ' + f(h.total, 6) + ' for set ' + reprStr(h.set));
      var k = AXIS[h.dir], sense = IGN ? 'POSITIVE' : h.sense, tr = L.transform(h.guid); if (!tr) refuse('no element_transforms row for the host');
      var idx = L.index(h.hash);
      return idx.length ? fromStored(h, m, mesh, lay, th, k, sense, tr, idx) : fromEnvelope(h, m, mesh, lay, th, k, sense, tr);
    }
    function partOf(h, m, seq, mat, thk, tris, meas, tr) {
      var guid = 'GEN-LY-' + h.guid + '-' + seq;
      return { part: { guid: guid, cls: 'IfcBuildingElementPart', name: mat + ' ' + f(thk * 1000, 1) + ' mm (layer ' + seq + ' of ' + h.set + ')', storey: m.storey, disc: m.disc, building: m.building, tris: tris, parents: [h.guid], attach: [], rgba: m.rgba || '0.6,0.6,0.6,1.000', host: h.guid, seq: seq, th: thk },
        change: { kind: 'ADDED', guid: guid, cls: 'IfcBuildingElementPart', host: h.guid, rule: 'Layer split along IfcMaterialLayerSetUsage ' + h.dir, detail: 'host=' + m.cls + ' "' + m.name + '" | layer ' + seq + ' ' + mat + ' | stated ' + f(thk * 1000, 2) + ' mm | measured ' + f(meas * 1000, 2) + ' mm | storey ' + m.storey } };
    }
    // SLICED state: the extractor's slabs, re-verified against the authored tables (verify_layer_geometry's idea, plus the interval and watertight proofs)
    function fromStored(h, m, mesh, lay, th, k, sense, tr, idx) {
      var v = mesh.v, F = mesh.f, nf = F.length / 3, ymin = Infinity, ymax = -Infinity, i;
      idx.forEach(function (r) { if (r.fc === null || r.fc <= 0 || r.fs < 0 || r.fs + r.fc > nf) refuse('layer row ' + r.seq + ' points outside the mesh (face_start ' + r.fs + ', face_count ' + r.fc + ', mesh faces ' + nf + ')'); var sp = spanAxis(v, F, r.fs, r.fc, k); if (sp[0] < ymin) ymin = sp[0]; if (sp[1] > ymax) ymax = sp[1]; });
      var iv = layerIntervals(h.off, sense, th, ymin, ymax, h.guid, null, TOL), out = [], seen = {}, clip = [];
      idx.forEach(function (r) {
        var s = r.seq; if (s < 0 || s >= lay.length || seen[s]) refuse('layer row ' + s + ' is not a layer of set ' + reprStr(h.set)); seen[s] = 1;
        if (r.mat !== lay[s].mat || Math.abs(r.th - lay[s].th) > SUMTOL) refuse('layer row ' + s + ' (' + r.mat + ', ' + reprNum(r.th) + ') differs from the authored layer ' + s + ' of set ' + reprStr(h.set) + ' (' + lay[s].mat + ', ' + reprNum(lay[s].th) + ')');
        if (!iv[s][2]) refuse('layer row ' + s + ' exists although the authored layer lies outside the body');
        var sp = spanAxis(v, F, r.fs, r.fc, k), ext = sp[1] - sp[0];
        if (Math.abs(ext - th[s]) > TOL) refuse('slab ' + s + ' extent ' + f(ext, 4) + ' != authored layer thickness ' + f(th[s], 4) + ' (set ' + reprStr(h.set) + ')');
        if (Math.abs(sp[0] - Math.max(iv[s][0], ymin)) > TOL || Math.abs(sp[1] - Math.min(iv[s][1], ymax)) > TOL) refuse('slab ' + s + ' span [' + f(sp[0], 4) + ',' + f(sp[1], 4) + '] != authored interval [' + f(iv[s][0], 4) + ',' + f(iv[s][1], 4) + '] (direction sense ' + sense + ')');
        var sub = new Int32Array(r.fc * 3); for (i = 0; i < r.fc * 3; i++) sub[i] = F[3 * r.fs + i];
        assertWatertight(sub, 'layer slab ' + s); if (signedVolume(v, sub) <= 0) refuse('slab ' + s + ' signed volume is not positive');
        out.push(partOf(h, m, s, r.mat, +r.th, toWorld(v, F, r.fs, r.fc, tr), ext, tr));
      });
      iv.forEach(function (x, s) { if (x[2] && !seen[s]) refuse('layer ' + s + ' of set ' + reprStr(h.set) + ' lies inside the body but has no stored slab'); if (!x[2]) clip.push(s); });
      out.path = 'stored'; if (clip.length) out.clipped = clip; return out;
    }
    // ENVELOPE state: the slicer (compile_layer_geometry's loop body)
    function fromEnvelope(h, m, mesh, lay, th, k, sense, tr) {
      var w = weldMesh(mesh.v, mesh.f); assertWatertight(w.f, 'envelope');
      var F = orientCoherently(w.v, w.f), v = w.v, envVol = signedVolume(v, F);
      if (Math.abs(envVol) < 1e-12) refuse('envelope has zero volume');
      var ymin = Infinity, ymax = -Infinity, ax = [], i; for (i = 0; i < v.length; i += 3) { var x = v[i + k]; if (x <= ymin) ymin = x; if (x >= ymax) ymax = x; ax.push(x); }   // ties: the later value wins, as np.min / np.max do (a -0.0 and a 0.0 face give the Python text)
      var iv = layerIntervals(h.off, sense, th, ymin, ymax, h.guid, ax, TOL), out = [], volSum = 0, clip = [];
      iv.forEach(function (x, s) {
        if (!x[2]) { clip.push(s); return; }
        var slab = sliceSlab(v, F, k, Math.max(x[0], ymin), Math.min(x[1], ymax), ymin, ymax, envVol > 0 ? 1 : -1, TOL), mn = Infinity, mx = -Infinity;
        for (var q = 0; q < slab.v.length; q += 3) { var y = slab.v[q + k]; if (y < mn) mn = y; if (y > mx) mx = y; }
        var ext = mx - mn; if (Math.abs(ext - th[s]) > TOL) refuse('slab ' + s + ' extent ' + f(ext, 4) + ' != authored layer thickness ' + f(th[s], 4) + ' (set ' + reprStr(h.set) + ')');
        var sv = signedVolume(slab.v, slab.f); if (sv * envVol <= 0) refuse('slab ' + s + ' signed volume ' + sv.toExponential(6) + ' inverted vs envelope ' + envVol.toExponential(6));
        volSum += sv; out.push(partOf(h, m, s, lay[s].mat, th[s], toWorld(slab.v, slab.f, 0, slab.f.length / 3, tr), ext, tr)); out[out.length - 1].part.vol = sv;
      });
      if (Math.abs(volSum - envVol) > Math.max(1e-9, VRT * Math.abs(envVol))) refuse('slab volumes sum ' + f(volSum, 9) + ' != envelope volume ' + f(envVol, 9) + ' m³ — the slice lost or invented material');
      if (!out.length) refuse('every layer of set ' + reprStr(h.set) + ' lies outside the body — nothing to compile');
      out.path = 'sliced'; if (clip.length) out.clipped = clip; return out;
    }
  }

  // how many elements the pack applies to (the panel's measured count): the multi-layer elements with a stored mesh
  function appliesTo(inp, rows) { if (!inp.layers) return 0; if (!rows) return inp.layers.hosts().length; try { return run(inp, rows, { log: function () { } }).stats.judged; } catch (e) { return 0; } }   // with rule rows: the multi-layer elements the run judges (split or refused), read-only dry run
  var API = { id: 'layers', label: 'Layers', rulesFile: 'rules/layer_defaults.json', run: run, appliesTo: appliesTo, rotMat: rotMat, layerIntervals: layerIntervals, weldMesh: weldMesh };
  if (typeof window !== 'undefined' && window.LodRegistry) window.LodRegistry.register(API);   // browser: the pack registers itself; adding a pack needs no dialog change
  return API;
});
