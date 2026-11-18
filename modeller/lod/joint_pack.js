// Copyright (c) 2025-2026 Redhuan D. Oon
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — joint_pack.js: the LOD Upgrade pack "Steel joints" (fin plate / single plate shear). Read the §LODUP_* log after every run; the exit code is not evidence.
// Implementing prompts/MODELLER_LOD_UPGRADE_PILL.md §4 P4 ("P4 SPEC") — Witness: W-LODUP-JOINTS (modeller/tests/witness_lodup_joints.js).
// Issue proved/disproved: "the browser result differs from the proven Python result" (private oracle: survey of steel beam ends + fin plate generator v2.1 with the 2026-11-18 centre fix,
// rules = AISC 360-16 rows + named defaults, every neighbour tested with TRUE mesh boxes). Same maths, same order, no clock, no random; every loop over sorted keys.
// INPUT  inp.meta {guid:{cls,name,storey,disc,building,mat,layerMats}}   inp.mesh(guid) -> {V: Float64Array world xyz, F: Uint32Array|null} (indexed; null F = V is a soup)  [else inp.world(guid) soup]
//        inp.boxes() -> {guid:[lo,hi]} TRUE world boxes from the meshes (never the DB rtree: spec section 5)  [else computed from the meshes]   inp.src = the DB object (cache key)
// RULES  rule rows {key:{value,unit,source}} (lod/rules/joint_defaults.json)
// OPTS   {noClash: bool (the red control: the clash check is switched off; CLEAR_POST on the written result must then FAIL), log: fn(line)}
// OUTPUT {parts:[{guid,cls,name,storey,disc,building,tris:Float64Array world,parents:[],attach:[beam],rgba,kind,beam,support}], changes:[{kind,guid,cls,host,rule,detail}], stats, audit}
// A joint part is attached to its beam, not an aggregate child of it (element_parts would hide the beam on reload): parents = [], attach = [beam] (the same rule as the welds).
// The generated part is NOT tuned to the oracle: where a number flips a decision the witness lists the joint with its margin.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LodJointPack = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var RGBA = { PL: '0.55,0.57,0.60,1', BT: '0.32,0.33,0.36,1', WD: '0.40,0.34,0.30,1' }, CLS = { PL: 'IfcPlate', BT: 'IfcMechanicalFastener', WD: 'IfcFastener' };
  var LABEL = '(rules: AISC 360-16 + defaults; configuration only, capacity not checked)';
  var nowMs = function () { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); };

  // ---- formatting twins of Python's format specs
  function fx(x, d) { return Number(x).toFixed(d); }                                   // {:.Nf}
  function fmtG(x) { return String(parseFloat(Number(x).toPrecision(6))); }            // {:g}
  function round1(x) { return Number(Number(x).toFixed(1)); }                          // round(x, 1)

  // ---- vectors (arrays of 3)
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { return Math.sqrt(dot(a, a)); }
  function unit(a) { var n = norm(a); return [a[0] / n, a[1] / n, a[2] / n]; }
  function median(xs) { var s = xs.slice().sort(function (a, b) { return a - b; }), n = s.length; return n % 2 ? s[(n - 1) >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2; }
  function linspace(a, b, n) { var o = [], st = n > 1 ? (b - a) / (n - 1) : 0, i; for (i = 0; i < n; i++) o.push(a + i * st); if (n > 1) o[n - 1] = b; return o; }
  function arange(a, b, st) { var n = Math.max(0, Math.ceil((b - a) / st)), d = (a + st) - a, o = [], i; for (i = 0; i < n; i++) o.push(a + i * d); return o; }   // numpy.arange (float): start + i * ((start + step) - start)

  // ---- symmetric 3x3 eigen-decomposition (cyclic Jacobi), eigenvalues ascending; U[k] = the k-th unit eigenvector
  function eig3(C) {
    var a = [C[0].slice(), C[1].slice(), C[2].slice()], v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], sweep, p, q, k;
    for (sweep = 0; sweep < 60; sweep++) {
      var off = a[0][1] * a[0][1] + a[0][2] * a[0][2] + a[1][2] * a[1][2], dg = a[0][0] * a[0][0] + a[1][1] * a[1][1] + a[2][2] * a[2][2];
      if (off <= 1e-34 * dg || off === 0) break;
      for (p = 0; p < 2; p++) for (q = p + 1; q < 3; q++) {
        if (a[p][q] === 0) continue;
        var th = (a[q][q] - a[p][p]) / (2 * a[p][q]), t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (k = 0; k < 3; k++) { var akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
        for (k = 0; k < 3; k++) { var apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
        for (k = 0; k < 3; k++) { var vkp = v[k][p], vkq = v[k][q]; v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq; }
      }
    }
    var idx = [0, 1, 2].sort(function (i, j) { return (a[i][i] - a[j][j]) || (i - j); });
    return { w: idx.map(function (i) { return a[i][i]; }), U: idx.map(function (i) { return unit([v[0][i], v[1][i], v[2][i]]); }) };
  }
  // numpy.cov of the vertex cloud (divisor n-1) about its mean, then the eigenframe. Eigenvector signs are arbitrary in any solver; the conventions below are fixed, not found:
  // axis ua: the first component larger than 1e-9 is negative (numpy returned exactly that on all 117 members of the proven run); depth ud and width uw: the largest component positive.
  function frameOf(V) {
    var n = V.length / 3, c = [0, 0, 0], i, r, s;
    for (i = 0; i < V.length; i += 3) { c[0] += V[i]; c[1] += V[i + 1]; c[2] += V[i + 2]; }
    c = [c[0] / n, c[1] / n, c[2] / n];
    var C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (i = 0; i < V.length; i += 3) { var d = [V[i] - c[0], V[i + 1] - c[1], V[i + 2] - c[2]]; for (r = 0; r < 3; r++) for (s = 0; s < 3; s++) C[r][s] += d[r] * d[s]; }
    for (r = 0; r < 3; r++) for (s = 0; s < 3; s++) C[r][s] /= (n - 1);
    var e = eig3(C), ua = e.U[2], ud = e.U[1], uw = e.U[0], k = 0;
    while (k < 2 && Math.abs(ua[k]) <= 1e-9) k++; if (ua[k] > 0) ua = mul(ua, -1);
    var big = function (u) { var m = 0; for (var q = 1; q < 3; q++) if (Math.abs(u[q]) > Math.abs(u[m])) m = q; return u[m] < 0 ? mul(u, -1) : u; };
    return { c: c, ua: ua, ud: big(ud), uw: big(uw), w: e.w, U: e.U };
  }
  function axisOf(V) { return frameOf(V).U[2]; }                                  // the support's longest axis (sign irrelevant: only |cos| is used)

  // ---- rays against a triangle soup T (flat, 9 per triangle): all hits with t > tmin, ascending (Moller-Trumbore, the oracle's arithmetic)
  function rayAll(o, d, T, tmin) {
    var out = [], ox = o[0], oy = o[1], oz = o[2], dx = d[0], dy = d[1], dz = d[2];
    for (var i = 0; i + 8 < T.length; i += 9) {
      var t0x = T[i], t0y = T[i + 1], t0z = T[i + 2], e1x = T[i + 3] - t0x, e1y = T[i + 4] - t0y, e1z = T[i + 5] - t0z, e2x = T[i + 6] - t0x, e2y = T[i + 7] - t0y, e2z = T[i + 8] - t0z;
      var px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x, det = e1x * px + e1y * py + e1z * pz;
      if (!(Math.abs(det) > 1e-12)) continue;
      var inv = 1 / det, sx = ox - t0x, sy = oy - t0y, sz = oz - t0z, u = (sx * px + sy * py + sz * pz) * inv;
      if (!(u >= 0)) continue;
      var qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x, v = (qx * dx + qy * dy + qz * dz) * inv;
      if (!(v >= 0 && u + v <= 1)) continue;
      var t = (e2x * qx + e2y * qy + e2z * qz) * inv; if (t > tmin) out.push(t);
    }
    return out.sort(function (a, b) { return a - b; });
  }
  function rayFirst(o, d, T) { var h = rayAll(o, d, T, 1e-7); return h.length ? h[0] : null; }
  var RAYS = [[0.577, 0.577, 0.577], [-0.267, 0.802, 0.535], [0.707, -0.1, -0.7]].map(unit);
  function rayCount(o, d, T, tmin) {   // how many triangles the ray crosses (t > tmin): the same test as rayAll, without keeping the hits
    var n = 0, ox = o[0], oy = o[1], oz = o[2], dx = d[0], dy = d[1], dz = d[2];
    for (var i = 0; i + 8 < T.length; i += 9) {
      var t0x = T[i], t0y = T[i + 1], t0z = T[i + 2], e1x = T[i + 3] - t0x, e1y = T[i + 4] - t0y, e1z = T[i + 5] - t0z, e2x = T[i + 6] - t0x, e2y = T[i + 7] - t0y, e2z = T[i + 8] - t0z;
      var px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x, det = e1x * px + e1y * py + e1z * pz;
      if (!(Math.abs(det) > 1e-12)) continue;
      var inv = 1 / det, sx = ox - t0x, sy = oy - t0y, sz = oz - t0z, u = (sx * px + sy * py + sz * pz) * inv;
      if (!(u >= 0)) continue;
      var qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x, v = (qx * dx + qy * dy + qz * dz) * inv;
      if (!(v >= 0 && u + v <= 1)) continue;
      if ((e2x * qx + e2y * qy + e2z * qz) * inv > tmin) n++;
    }
    return n;
  }
  function inside(P, T) { var a = rayCount(P, RAYS[0], T, 1e-7) % 2, b = rayCount(P, RAYS[1], T, 1e-7) % 2; if (a === b) return a === 1; return rayCount(P, RAYS[2], T, 1e-7) % 2 === 1; }   // 2 of 3 rays odd (the third ray is cast only when the first two disagree)   // point inside a closed mesh: ray parity, 2 of 3
  // Akenine-Moller: does ANY triangle of the flat soup T (joint frame, mm) overlap the axis-aligned box (centre c, half h)?
  function anyTriBox(T, c, h) {
    var hx = h[0], hy = h[1], hz = h[2];
    for (var i = 0; i + 8 < T.length; i += 9) {
      var v0 = [T[i] - c[0], T[i + 1] - c[1], T[i + 2] - c[2]], v1 = [T[i + 3] - c[0], T[i + 4] - c[1], T[i + 5] - c[2]], v2 = [T[i + 6] - c[0], T[i + 7] - c[1], T[i + 8] - c[2]], k, j, ok = true;
      for (k = 0; k < 3 && ok; k++) { var mn = Math.min(v0[k], v1[k], v2[k]), mx = Math.max(v0[k], v1[k], v2[k]); if (!(mn <= h[k] && mx >= -h[k])) ok = false; }
      if (!ok) continue;
      var e = [sub(v1, v0), sub(v2, v1), sub(v0, v2)], n = cross(e[0], e[1]);
      if (!(Math.abs(dot(n, v0)) <= Math.abs(n[0]) * hx + Math.abs(n[1]) * hy + Math.abs(n[2]) * hz)) continue;
      for (j = 0; j < 3 && ok; j++) {
        var ei = e[j], axes = [[0, -ei[2], ei[1]], [ei[2], 0, -ei[0]], [-ei[1], ei[0], 0]];
        for (k = 0; k < 3; k++) { var a = axes[k], p0 = dot(v0, a), p1 = dot(v1, a), p2 = dot(v2, a), rr = Math.abs(a[0]) * hx + Math.abs(a[1]) * hy + Math.abs(a[2]) * hz;
          if (!(Math.min(p0, p1, p2) <= rr && Math.max(p0, p1, p2) >= -rr)) { ok = false; break; } }
      }
      if (ok) return true;
    }
    return false;
  }

  // ---- the J2.4 table as data: "6:3, 13:5, 19:6, 999:8" (thinner part up to mm : weld mm), or a list of pairs
  function weldTable(v) {
    var pairs = [];
    if (Array.isArray(v)) { if (v.length && Array.isArray(v[0])) pairs = v.map(function (p) { return [Number(p[0]), Number(p[1])]; }); else for (var i = 0; i + 1 < v.length; i += 2) pairs.push([Number(v[i]), Number(v[i + 1])]); }
    else { var nums = String(v).split(/[\s,;:]+/).filter(Boolean).map(Number); for (var j = 0; j + 1 < nums.length; j += 2) pairs.push([nums[j], nums[j + 1]]); }
    return pairs.filter(function (p) { return isFinite(p[0]) && isFinite(p[1]); }).sort(function (a, b) { return a[0] - b[0]; });
  }
  function weldMin(table, tMm) { for (var i = 0; i < table.length; i++) if (tMm <= table[i][0]) return table[i][1]; return null; }

  // ---- the spatial index over the TRUE boxes: a uniform grid, big elements kept in a short list (no O(n^2) scan)
  function buildIndex(boxes) {
    var ids = Object.keys(boxes).sort(), n = ids.length, lo = new Float64Array(3 * n), hi = new Float64Array(3 * n), S = 3.0, cells = {}, big = [], i, a;
    for (i = 0; i < n; i++) {
      var b = boxes[ids[i]], i0 = [], i1 = [], cnt = 1;
      for (a = 0; a < 3; a++) { lo[3 * i + a] = b[0][a]; hi[3 * i + a] = b[1][a]; i0[a] = Math.floor(b[0][a] / S); i1[a] = Math.floor(b[1][a] / S); cnt *= (i1[a] - i0[a] + 1); }
      if (cnt > 512) { big.push(i); continue; }
      for (var x = i0[0]; x <= i1[0]; x++) for (var y = i0[1]; y <= i1[1]; y++) for (var z = i0[2]; z <= i1[2]; z++) { var k = x + ',' + y + ',' + z; (cells[k] || (cells[k] = [])).push(i); }
    }
    function query(ql, qh) {   // elements whose box overlaps [ql, qh] (inclusive), ascending guid
      var seen = {}, out = [], x, y, z, j;
      var ok = function (j2) { return lo[3 * j2] <= qh[0] && lo[3 * j2 + 1] <= qh[1] && lo[3 * j2 + 2] <= qh[2] && hi[3 * j2] >= ql[0] && hi[3 * j2 + 1] >= ql[1] && hi[3 * j2 + 2] >= ql[2]; };
      var x0 = Math.floor(ql[0] / S), x1 = Math.floor(qh[0] / S), y0 = Math.floor(ql[1] / S), y1 = Math.floor(qh[1] / S), z0 = Math.floor(ql[2] / S), z1 = Math.floor(qh[2] / S);
      for (x = x0; x <= x1; x++) for (y = y0; y <= y1; y++) for (z = z0; z <= z1; z++) { var c = cells[x + ',' + y + ',' + z]; if (c) for (j = 0; j < c.length; j++) if (!seen[c[j]]) { seen[c[j]] = 1; if (ok(c[j])) out.push(c[j]); } }
      for (j = 0; j < big.length; j++) if (!seen[big[j]] && ok(big[j])) out.push(big[j]);
      return out.sort(function (p, q) { return p - q; }).map(function (k2) { return ids[k2]; });
    }
    return { ids: ids, query: query, box: function (g) { return boxes[g]; } };
  }
  var INDEX_CACHE = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function indexOf(inp) {
    var c = INDEX_CACHE && inp.src && typeof inp.src === 'object' ? INDEX_CACHE.get(inp.src) : null; if (c) return c;
    var boxes = inp.boxes ? inp.boxes() : (function () {
      var o = {}; Object.keys(inp.meta).sort().forEach(function (g) { var w = inp.world(g); if (!w || !w.length) return; var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (var i = 0; i < w.length; i += 3) for (var a = 0; a < 3; a++) { if (w[i + a] < lo[a]) lo[a] = w[i + a]; if (w[i + a] > hi[a]) hi[a] = w[i + a]; } o[g] = [lo, hi]; });
      return o;
    })();
    var idx = buildIndex(boxes); if (INDEX_CACHE && inp.src && typeof inp.src === 'object') INDEX_CACHE.set(inp.src, idx); return idx;
  }

  // the triangles of a flat soup whose own box overlaps [lo, hi], as a new flat soup, or null (used for small soups: the parts already generated)
  function trisInBox(S, lo, hi) {
    var out = [], i, a, any = false;
    for (i = 0; i + 8 < S.length; i += 9) {
      var ok = true;
      for (a = 0; a < 3 && ok; a++) { var p = S[i + a], q = S[i + 3 + a], r = S[i + 6 + a], mn = Math.min(p, q, r), mx = Math.max(p, q, r); if (!(mx >= lo[a] && mn <= hi[a])) ok = false; }
      if (ok) { any = true; for (a = 0; a < 9; a++) out.push(S[i + a]); }
    }
    return any ? Float64Array.from(out) : null;
  }
  // P6: the clash neighbours of a pack = the model as read PLUS every live generated part of the OTHER packs in the op-log (inp.generated(): world soups rebuilt from the op rows, lod_ops.fromOps).
  // So Run Joints then Run Gussets (either order) cannot overlap. Skipped: this pack's own parts (a re-run is refused anyway), aggregate children of a host (parts_of: layers, rebar: duplicates of their hosts,
  // the same rule as the PREFIX skip of the model), and any guid the model already holds. opts.noGenerated = the old behaviour (the red control of W-LODUP-NEIGHBOURS).
  function seedGenerated(inp, opts, ownPrefix) {
    var G = {}; if (!inp || (opts && opts.noGenerated)) return G;
    var L = typeof inp.generated === 'function' ? inp.generated() : (inp.generated || []);
    L.forEach(function (p) {
      if (!p || !p.tris || !p.tris.length || String(p.guid).indexOf(ownPrefix) === 0 || (p.parents && p.parents.length) || (inp.meta && inp.meta[p.guid])) return;
      var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], A = p.tris, q, a; for (q = 0; q < A.length; q += 3) for (a = 0; a < 3; a++) { if (A[q + a] < lo[a]) lo[a] = A[q + a]; if (A[q + a] > hi[a]) hi[a] = A[q + a]; }
      G[p.guid] = { box: [lo, hi], tris: A, cls: p.cls, name: p.name, seeded: true };
    });
    return G;
  }
  function seededItems(G) { return Object.keys(G).filter(function (g) { return G[g].seeded; }).sort().map(function (g) { return { guid: g, tris: G[g].tris }; }); }
  // ---- meshes on demand with a size budget (a neighbour is read when a ray or a clash test needs it; first in, first out)
  // A big mesh (more than GRID_MIN triangles) is never expanded to a soup: its triangles are found through a uniform grid built once, and only the triangles near the query are copied out.
  var GRID_MIN = 4000;
  function triGrid(m) {
    if (m.G) return m.G; var V = m.V, F = m.F, n = F ? F.length / 3 : V.length / 9, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], i, a;
    for (i = 0; i < V.length; i += 3) for (a = 0; a < 3; a++) { if (V[i + a] < lo[a]) lo[a] = V[i + a]; if (V[i + a] > hi[a]) hi[a] = V[i + a]; }
    var ext = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]), cs = Math.max(ext / 48, 1e-6), dim = [0, 1, 2].map(function (q) { return Math.floor((hi[q] - lo[q]) / cs) + 1; }), cells = new Map();
    var vi = function (t, k) { return F ? 3 * F[3 * t + k] : 9 * t + 3 * k; };
    for (var t = 0; t < n; t++) {
      var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      for (var k = 0; k < 3; k++) { var o = vi(t, k); for (a = 0; a < 3; a++) { var v = V[o + a]; if (v < mn[a]) mn[a] = v; if (v > mx[a]) mx[a] = v; } }
      var i0 = [0, 1, 2].map(function (q) { return Math.floor((mn[q] - lo[q]) / cs); }), i1 = [0, 1, 2].map(function (q) { return Math.floor((mx[q] - lo[q]) / cs); });
      for (var x = i0[0]; x <= i1[0]; x++) for (var y = i0[1]; y <= i1[1]; y++) for (var z = i0[2]; z <= i1[2]; z++) { var key = x + dim[0] * (y + dim[1] * z), c = cells.get(key); if (c) c.push(t); else cells.set(key, [t]); }
    }
    return (m.G = { lo: lo, cs: cs, dim: dim, cells: cells, n: n });
  }
  function Meshes(inp) {
    var cache = {}, order = [], floats = 0, BUDGET = 1.2e7;
    function fetch(g) {
      return inp.mesh ? inp.mesh(g) : (function () { var w = inp.world(g); return w ? { V: w, F: null } : null; })();
    }
    function get(g) {
      if (g in cache) return cache[g]; var m = fetch(g); cache[g] = m; if (!m) return m;
      order.push(g); floats += m.V.length + (m.F ? m.F.length : 0);
      while (floats > BUDGET && order.length > 1) { var old = order.shift(), om = cache[old]; delete cache[old]; if (om) floats -= om.V.length + (om.F ? om.F.length : 0) + (om.S && om.S !== om.V ? om.S.length : 0); }
      return m;
    }
    function ntri(g) { var m = get(g); return m ? (m.F ? m.F.length / 3 : m.V.length / 9) : 0; }
    function soup(g) {   // the whole triangle soup V[F] (flat, 9 per triangle); for small meshes only (the parity test, the survey of a beam)
      var m = get(g); if (!m) return null; if (m.S) return m.S;
      if (!m.F) { m.S = m.V; return m.S; }
      var F = m.F, V = m.V, S = new Float64Array(F.length * 3), i, k;
      for (i = 0; i < F.length; i++) { k = 3 * F[i]; S[3 * i] = V[k]; S[3 * i + 1] = V[k + 1]; S[3 * i + 2] = V[k + 2]; }
      m.S = S; floats += S.length; return S;
    }
    // the triangles of g whose own box overlaps [lo, hi] (the oracle's per-neighbour prefilter), as a new flat soup, or null
    function trisIn(g, lo, hi) {
      var m = get(g); if (!m) return null; var V = m.V, F = m.F, n = F ? F.length / 3 : V.length / 9, ids = null, out = [], any = false, a, t;
      if (n > GRID_MIN) {
        var G = triGrid(m), i0 = [0, 1, 2].map(function (q) { return Math.max(0, Math.floor((lo[q] - G.lo[q]) / G.cs)); }), i1 = [0, 1, 2].map(function (q) { return Math.min(G.dim[q] - 1, Math.floor((hi[q] - G.lo[q]) / G.cs)); }), seen = {}; ids = [];
        for (var x = i0[0]; x <= i1[0]; x++) for (var y = i0[1]; y <= i1[1]; y++) for (var z = i0[2]; z <= i1[2]; z++) { var c = G.cells.get(x + G.dim[0] * (y + G.dim[1] * z)); if (c) for (var u = 0; u < c.length; u++) if (!seen[c[u]]) { seen[c[u]] = 1; ids.push(c[u]); } }
        ids.sort(function (p, q) { return p - q; });
      }
      var cnt = ids ? ids.length : n;
      for (var ii = 0; ii < cnt; ii++) {
        t = ids ? ids[ii] : ii; var ok = true, o = [0, 0, 0].map(function (_, k) { return F ? 3 * F[3 * t + k] : 9 * t + 3 * k; });
        for (a = 0; a < 3 && ok; a++) { var p = V[o[0] + a], q2 = V[o[1] + a], r = V[o[2] + a], mn = Math.min(p, q2, r), mx = Math.max(p, q2, r); if (!(mx >= lo[a] && mn <= hi[a])) ok = false; }
        if (ok) { any = true; for (var k2 = 0; k2 < 3; k2++) out.push(V[o[k2]], V[o[k2] + 1], V[o[k2] + 2]); }
      }
      return any ? Float64Array.from(out) : null;
    }
    return { get: get, soup: soup, ntri: ntri, trisIn: trisIn };
  }

  // ---- the context of one run: rules, member / support classification, meshes, index
  function makeCtx(inp, RULES, log) {
    var rv = function (k) { if (!RULES[k]) throw new Error('rule row missing: ' + k); return RULES[k].value; };
    var cx = { inp: inp, R: RULES, rv: rv, log: log || function () { }, meta: inp.meta, meshes: Meshes(inp) };
    var words = (function () { var v = RULES.member_material_gate ? RULES.member_material_gate.value : []; if (typeof v === 'string') v = v.split(','); return (v || []).map(function (x) { return String(x).trim().toLowerCase(); }).filter(Boolean); })();
    var reInc = new RegExp(rv('member_name_include')), reExc = new RegExp(rv('member_name_exclude')), reConc = new RegExp(rv('concrete_name_pattern'), 'i'), info = {};
    var matOk = function (m) { if (!words.length) return true; var mats = [m.mat].concat(m.layerMats || []).filter(function (x) { return x !== null && x !== undefined; }).map(function (x) { return String(x).toLowerCase(); }); return mats.some(function (t) { return words.some(function (w) { return t.indexOf(w) >= 0; }); }); };
    cx.words = words;
    cx.info = function (g) {   // is_steel_any (beam/member/column by name), is_conc, structural: the oracle's classes
      if (info[g]) return info[g]; var m = cx.meta[g] || { cls: '', name: '', mat: '' }, nm = m.name || '', steelAny = ['IfcBeam', 'IfcMember', 'IfcColumn'].indexOf(m.cls) >= 0 && !reExc.test(nm) && reInc.test(nm);
      var conc = reConc.test(nm + ' ' + (m.mat || '')) || m.cls === 'IfcFooting', structural = steelAny || conc || ['IfcBeam', 'IfcColumn', 'IfcMember', 'IfcSlab', 'IfcWall', 'IfcWallStandardCase', 'IfcFooting'].indexOf(m.cls) >= 0;
      return (info[g] = { steelAny: steelAny, conc: conc, structural: structural });
    };
    cx.isMember = function (g) { var m = cx.meta[g]; return (m.cls === 'IfcBeam' || m.cls === 'IfcMember') && cx.info(g).steelAny && matOk(m); };
    cx.matOk = matOk;
    return cx;
  }

  // ---- STEP 1: the survey. For every steel member end: rays from the end face along the outward beam axis; the element hit by most rays is the support.
  function survey(cx) {
    var rv = cx.rv, REACH = rv('support_reach_mm') / 1000, BACK = rv('survey_ray_back_mm') / 1000, idx = indexOf(cx.inp), rows = [], meta = cx.meta, M = cx.meshes;
    var allG = Object.keys(meta).sort(), members = allG.filter(function (g) { return cx.isMember(g) && M.get(g) && M.get(g).V.length; });
    var gateOut = allG.filter(function (g) { var c = meta[g].cls; return (c === 'IfcBeam' || c === 'IfcMember') && cx.info(g).steelAny && !cx.matOk(meta[g]); }).length;
    cx.log('§LODUP_JOINT_GATE words=' + JSON.stringify(cx.words) + ' members_steel=' + members.length + ' members_gated_out_by_material=' + gateOut + (members.length ? '' : ' (nothing left to judge)'));
    var ndep = rv('survey_depth_rays'), nwid = rv('survey_width_rays'), sdep = rv('survey_depth_span'), swid = rv('survey_width_span'), angW = rv('angle_web_min_deg'), angI = rv('angle_inline_max_deg'), cope = rv('cope_jump_mm') / 1000;
    members.forEach(function (g) {
      var m = M.get(g), V = m.V, fr = frameOf(V), c = fr.c, ua = fr.ua, ud = fr.ud, uw = fr.uw, i;
      var amin = Infinity, amax = -Infinity, dmin = Infinity, dmax = -Infinity, wmin = Infinity, wmax = -Infinity;
      for (i = 0; i < V.length; i += 3) { var d = [V[i] - c[0], V[i + 1] - c[1], V[i + 2] - c[2]], pa = dot(d, ua), pd = dot(d, ud), pw = dot(d, uw); if (pa < amin) amin = pa; if (pa > amax) amax = pa; if (pd < dmin) dmin = pd; if (pd > dmax) dmax = pd; if (pw < wmin) wmin = pw; if (pw > wmax) wmax = pw; }
      var dc = (dmax + dmin) / 2, wc = (wmax + wmin) / 2, Dm = dmax - dmin, Bm = wmax - wmin;
      [[1, amax], [-1, amin]].forEach(function (se) {
        var sgn = se[0], E = add(c, mul(ua, se[1])), axis = mul(ua, sgn), rr = REACH + Math.max(Dm, Bm), lo = [E[0] - rr, E[1] - rr, E[2] - rr], hi = [E[0] + rr, E[1] + rr, E[2] + rr];
        var cands = idx.query(lo, hi).filter(function (x) { return x !== g; }), tris = [];
        cands.forEach(function (x) { var T = M.trisIn(x, lo, hi); if (T) tris.push([x, T]); });
        var hits = [], hitIdx = {};   // insertion-ordered support -> clearances
        var dds = linspace(-sdep, sdep, ndep).map(function (f) { return f * Dm + dc; }), wws = linspace(-swid, swid, nwid).map(function (f) { return f * Bm + wc; }), Ec = sub(E, c), ed = dot(Ec, ud), ew = dot(Ec, uw);
        dds.forEach(function (dd) { wws.forEach(function (ww) {
          var o = add(add(sub(E, mul(axis, BACK)), mul(ud, dd - ed)), mul(uw, ww - ew)), cand = [];
          tris.forEach(function (xt) {
            var x = xt[0], ts = rayAll(o, axis, xt[1], 0).map(function (t) { return t - BACK; }); if (!ts.length) return;
            var behind = ts.filter(function (t) { return t < -0.002; }), ahead = ts.filter(function (t) { return t >= -0.002; }), inf = cx.info(x);
            var closed = ts.length % 2 === 0, pri = inf.steelAny ? 0 : (inf.structural ? 1 : 2), crossed = behind.length && ahead.length && behind[0] > -BACK + 0.005;
            if (crossed && (inf.steelAny || (inf.structural && closed && behind.length % 2 === 1))) cand.push([pri, behind[0], x]);
            else if (ahead.length && ahead[0] <= REACH) cand.push([pri, ahead[0], x]);
          });
          if (!cand.length) return;
          var pmin = Math.min.apply(null, cand.map(function (q) { return q[0]; })), c2 = cand.filter(function (q) { return q[0] === pmin; }).sort(function (p, q) { return p[1] - q[1]; }), best = c2[0];   // Array.prototype.sort is stable: ties keep candidate order
          if (!(best[2] in hitIdx)) { hitIdx[best[2]] = hits.length; hits.push([best[2], []]); }
          hits[hitIdx[best[2]]][1].push(best[1]);
        }); });
        if (!hits.length) { rows.push({ guid: g, name: meta[g].name, end: sgn, end_point: E, cls: 'NONE' }); return; }
        var sup = hits[0]; hits.forEach(function (h) { if (h[1].length > sup[1].length) sup = h; });   // max(): the first of the most-hit supports
        var cl = sup[1], supG = sup[0], Us = axisOf(M.get(supG).V), ang = Math.acos(Math.min(1, Math.abs(dot(ua, Us)))) * 180 / Math.PI, inf2 = cx.info(supG), cls;
        if (inf2.steelAny) cls = ang >= angW ? 'STEEL_WEB' : (ang < angI ? 'STEEL_INLINE' : 'STEEL_SKEW'); else if (inf2.conc) cls = 'CONCRETE'; else cls = 'OTHER';
        var near = Math.min.apply(null, cl), far = Math.max.apply(null, cl), nHit = 0; hits.forEach(function (h) { nHit += h[1].length; });
        rows.push({ guid: g, name: meta[g].name, end: sgn, end_point: E, cls: cls, support: supG, support_name: meta[supG].name, support_class: meta[supG].cls, angle: round1(ang), rays_hit: nHit, rays_support: cl.length,
          clear_min_mm: round1(near * 1000), clear_max_mm: round1(far * 1000), cope_needed: cls === 'STEEL_WEB' && (far - near) > cope, D_mm: round1(Dm * 1000), B_mm: round1(Bm * 1000) });
      });
    });
    var cnt = {}; rows.forEach(function (r) { cnt[r.cls] = (cnt[r.cls] || 0) + 1; });
    cx.log('§LODUP_JOINT_SURVEY members=' + members.length + ' ends=' + rows.length + ' ' + Object.keys(cnt).sort().map(function (k) { return k + '=' + cnt[k]; }).join(' ') + ' cope_needed=' + rows.filter(function (r) { return r.cope_needed; }).length + (rows.length ? '' : ' INCONCLUSIVE (no steel member end: nothing was judged)'));
    return { rows: rows, members: members.length, counts: cnt };
  }

  // ---- STEP 2: one joint. Returns {result, ...}. Same order of decisions as the oracle; every refusal carries its reason.
  var REASON = {
    NOT_I: 'gap: not a rolled I-section (no web, flange and root fillet found in the end mesh)', NO_WEB: 'gap: web faces not found in the beam mesh', OVERLAP: 'gap: beam overlaps its support in the model', NO_SURF: 'gap: no support surface behind the web zone',
    NO_PATH: 'gap: no clear path to the support web', NO_ROOM: 'gap: not enough clear web depth for the minimum bolts', NO_T: 'gap: support wall thickness not measurable', CLASH: 'gap: rule detail would clash (refused)'
  };
  function genJoint(cx, j, G, opts) {
    var rv = cx.rv, M = cx.meshes, meta = cx.meta, idx = indexOf(cx.inp), i, k;
    var d_b = rv('bolt_diameter_mm'), pitch = rv('bolt_pitch_mm'), e_used = rv('edge_used_mm'), e_min = rv('edge_min_mm'), tp = rv('plate_thickness_mm'), hole = rv('hole_diameter_mm'), tol = rv('clash_tolerance_mm'), wr = rv('washer_od_mm') / 2, TABLE = weldTable(rv('weld_min_table_mm'));
    var NEAR = rv('near_end_window_m');
    var mb = M.get(j.guid), V = mb.V, T = M.soup(j.guid), nTri = T.length / 9, fr = frameOf(V), c = fr.c, U = fr.U, ua = U[2], Ep = j.end_point;
    if (dot(sub(Ep, c), ua) < 0) ua = mul(ua, -1);                       // end picked by the stored end point
    var uw0 = U[0], ud0 = U[1];
    // ---- per-triangle frame: unit normal, area weight, centroid, "reaches into the last NEAR m"
    var nT = new Float64Array(nTri * 3), ar = new Float64Array(nTri), okT = new Uint8Array(nTri), cen = new Float64Array(nTri * 3), nearEnd = new Uint8Array(nTri), lim = dot(sub(Ep, c), ua) - NEAR;
    for (i = 0; i < nTri; i++) {
      var o = 9 * i, e1 = [T[o + 3] - T[o], T[o + 4] - T[o + 1], T[o + 5] - T[o + 2]], e2 = [T[o + 6] - T[o], T[o + 7] - T[o + 1], T[o + 8] - T[o + 2]], n = cross(e1, e2), L = norm(n);
      ar[i] = L; okT[i] = L > 0 ? 1 : 0; if (L > 0) { nT[3 * i] = n[0] / L; nT[3 * i + 1] = n[1] / L; nT[3 * i + 2] = n[2] / L; }
      for (k = 0; k < 3; k++) cen[3 * i + k] = (T[o + k] + T[o + 3 + k] + T[o + 6 + k]) / 3;
      var smax = -Infinity; for (k = 0; k < 3; k++) { var s = (T[o + 3 * k] - c[0]) * ua[0] + (T[o + 3 * k + 1] - c[1]) * ua[1] + (T[o + 3 * k + 2] - c[2]) * ua[2]; if (s > smax) smax = s; }
      nearEnd[i] = smax > lim ? 1 : 0;
    }
    var N = function (t) { return [nT[3 * t], nT[3 * t + 1], nT[3 * t + 2]]; }, CEN = function (t) { return [cen[3 * t], cen[3 * t + 1], cen[3 * t + 2]]; };
    // ---- is this end a rolled I-section? read from the end mesh (the oracle looked the profile up in the IFC: not available here)
    var wmin0 = Infinity, wmax0 = -Infinity, lp = Infinity, ln = -Infinity, nFil = 0;
    for (i = 0; i < V.length; i += 3) { var pw0 = (V[i] - c[0]) * uw0[0] + (V[i + 1] - c[1]) * uw0[1] + (V[i + 2] - c[2]) * uw0[2]; if (pw0 < wmin0) wmin0 = pw0; if (pw0 > wmax0) wmax0 = pw0; }
    for (i = 0; i < nTri; i++) {
      if (!okT[i] || !nearEnd[i]) continue; var nn = N(i), na = Math.abs(dot(nn, ua)), nw = dot(nn, uw0), nd = Math.abs(dot(nn, ud0)), aw = Math.abs(nw);
      if (na < 0.01 && aw > 0.999) { var lat = dot(sub(CEN(i), Ep), uw0); if (nw > 0) { if (lat < lp) lp = lat; } else if (lat > ln) ln = lat; }
      if (na < 0.05 && aw > 0.1 && aw < 0.99 && nd > 0.1 && nd < 0.99) nFil++;
    }
    var tw0 = lp - ln, Bw = wmax0 - wmin0, rolled = isFinite(tw0) && tw0 > 0 && tw0 <= rv('web_width_fraction_max') * Bw;
    if (rolled && rv('rolled_section_only') && nFil < rv('root_fillet_faces_min')) rolled = false;
    if (!rolled) return { result: 'NOT_I', reason: REASON.NOT_I };
    if (j.clear_min_mm < -1) return { result: 'OVERLAP_IN_MODEL', reason: REASON.OVERLAP };
    // ---- the frame from the web faces near this end
    var webI = [], twm = tw0 * 1.5, nw3 = [0, 0, 0];
    for (i = 0; i < nTri; i++) {
      if (!okT[i] || !nearEnd[i]) continue; var n2 = N(i);
      if (Math.abs(dot(n2, ua)) < 0.05 && Math.abs(dot(n2, uw0)) > 0.9 && Math.abs(dot(sub(CEN(i), Ep), uw0)) < twm) webI.push(i);
    }
    if (webI.length < 2) return { result: 'NO_WEB', reason: REASON.NO_WEB };
    webI.forEach(function (t) { var n3 = N(t), sg = Math.sign(dot(n3, uw0)) * ar[t]; nw3 = add(nw3, mul(n3, sg)); });
    var uw = sub(nw3, mul(ua, dot(nw3, ua))); uw = unit(uw); var ud = cross(uw, ua); if (ud[2] < 0) { ud = mul(ud, -1); uw = mul(uw, -1); }
    var pwP = [], pwM = [];
    webI.forEach(function (t) { var p = dot(sub(CEN(t), Ep), uw) * 1000, sg = Math.sign(dot(N(t), uw)); if (sg > 0) pwP.push(p); else if (sg < 0) pwM.push(p); });
    if (!pwP.length || !pwM.length) return { result: 'NO_WEB', reason: REASON.NO_WEB };
    var w_plus = median(pwP), w_minus = median(pwM), tw_meas = w_plus - w_minus, pdMin = Infinity, pdMax = -Infinity;
    for (i = 0; i < nTri; i++) { if (!okT[i] || !nearEnd[i]) continue; if (Math.abs(dot(N(i), ud)) > 0.9) { var pdv = dot(sub(CEN(i), Ep), ud) * 1000; if (pdv < pdMin) pdMin = pdv; if (pdv > pdMax) pdMax = pdv; } }
    var E = add(add(Ep, mul(ud, (pdMax + pdMin) / 2000)), mul(uw, (w_plus + w_minus) / 2000));   // section centre
    w_plus = tw_meas / 2; w_minus = -tw_meas / 2;
    var smx = -Infinity; for (i = 0; i < V.length; i += 3) { var sv = (V[i] - E[0]) * ua[0] + (V[i + 1] - E[1]) * ua[1] + (V[i + 2] - E[2]) * ua[2]; if (sv > smx) smx = sv; }
    E = add(E, mul(ua, smx));                                            // end plane = the beam's own end face
    var locFlat = function (A) { var o = new Float64Array(A.length), a0 = ua[0], a1 = ua[1], a2 = ua[2], w0 = uw[0], w1 = uw[1], w2 = uw[2], d0 = ud[0], d1 = ud[1], d2 = ud[2]; for (var q = 0; q < A.length; q += 3) { var x = A[q] - E[0], y = A[q + 1] - E[1], z = A[q + 2] - E[2]; o[q] = (x * a0 + y * a1 + z * a2) * 1000; o[q + 1] = (x * w0 + y * w1 + z * w2) * 1000; o[q + 2] = (x * d0 + y * d1 + z * d2) * 1000; } return o; };
    var wp = function (a, w, d) { return [E[0] + (a * ua[0] + w * uw[0] + d * ud[0]) / 1000, E[1] + (a * ua[1] + w * uw[1] + d * ud[1]) / 1000, E[2] + (a * ua[2] + w * uw[2] + d * ud[2]) / 1000]; };
    // the clear web half-height: the flat web faces' extent along the depth axis (D/2 - tf - r: the oracle took it from the IFC profile)
    var zmin = Infinity, zmax = -Infinity;
    webI.forEach(function (t) { if (Math.abs(dot(N(t), uw)) > 0.9999) for (var q = 0; q < 3; q++) { var dv = dot(sub([T[9 * t + 3 * q], T[9 * t + 3 * q + 1], T[9 * t + 3 * q + 2]], E), ud) * 1000; if (dv < zmin) zmin = dv; if (dv > zmax) zmax = dv; } });
    if (!isFinite(zmin)) return { result: 'NO_WEB', reason: REASON.NO_WEB };
    var zone = (zmax - zmin) / 2;
    // ---- the support's triangles near the joint
    var Ts = M.trisIn(j.support, [E[0] - 0.7, E[1] - 0.7, E[2] - 0.7], [E[0] + 0.7, E[1] + 0.7, E[2] + 0.7]) || new Float64Array(0);
    var ds = arange(-zone, zone + 0.01, 2.0), reach = [];
    ds.forEach(function (dd) {
      var rr = [w_plus + 0.5, w_plus + tp - 0.5].map(function (w) { var o3 = [E[0] - ua[0] * 0.01 + (uw[0] * w + ud[0] * dd) / 1000, E[1] - ua[1] * 0.01 + (uw[1] * w + ud[1] * dd) / 1000, E[2] - ua[2] * 0.01 + (uw[2] * w + ud[2] * dd) / 1000]; return rayFirst(o3, ua, Ts); });
      reach.push(rr[0] === null || rr[1] === null ? null : Math.min(rr[0], rr[1]) * 1000 - 10);
    });
    var good = reach.filter(function (x) { return x !== null; }).sort(function (a, b) { return a - b; });
    if (!good.length) return { result: 'NO_SURF', reason: REASON.NO_SURF };
    var thr = good[0] - 1, gmax = -Infinity, garg = -1;
    for (i = 0; i + 1 < good.length; i++) { var g1 = good[i + 1] - good[i]; if (g1 > gmax) { gmax = g1; garg = i; } }
    if (good.length > 1 && gmax > rv('flange_web_gap_mm')) thr = good[garg + 1] - 1e-6;
    var okd = reach.map(function (x) { return x !== null && x >= thr; }), best = [0, -1], s0 = null;
    okd.concat([false]).forEach(function (f, ii) { if (f && s0 === null) s0 = ii; if (!f && s0 !== null) { if (ii - 1 - s0 > best[1] - best[0]) best = [s0, ii - 1]; s0 = null; } });
    if (best[1] < 0) return { result: 'NO_PATH', reason: REASON.NO_PATH };
    var d_lo = ds[best[0]], d_hi = ds[best[1]], H_av = d_hi - d_lo;
    var nb = H_av >= 2 * e_used ? Math.floor((H_av - 2 * e_used) / pitch) + 1 : 0; nb = Math.min(nb, rv('bolts_max'));
    if (nb < rv('bolts_min')) return { result: 'NO_ROOM', reason: REASON.NO_ROOM, H_av: H_av };
    var H = (nb - 1) * pitch + 2 * e_used, dmid = (d_lo + d_hi) / 2, d0 = dmid - H / 2, d1 = dmid + H / 2;
    // the plate front follows the support face: the reach at the sample nearest to the plate end. The samples lie on a 2 mm lattice, and for most plate heights the plate end sits exactly half way
    // between two samples (a TIE: 42 of the 50 joints on the proven model). The sample depths are measured here to float rounding, so a tie is decided by a micrometre of noise; the rule is therefore FIXED:
    // within TIE_MM the DEEPER sample wins. (Decided after the first parity run: the lower sample moved the plate and weld front face by 0.02-0.036 mm = one 2 mm step times the support's skew on those 42
    // joints; the oracle's own pick was the deeper one on all of them. The non-tie joints are identical either way.) The margin of every pick is kept (audit): a tie-decided joint is listed, not hidden.
    var TIE_MM = 1e-3, ties = [];
    var reachAt = function (d) { var bi = 0, bd = Infinity, sd = Infinity; for (var q = 0; q < ds.length; q++) { var dq = Math.abs(ds[q] - d); if (dq <= bd + TIE_MM) { sd = bd; bd = Math.min(bd, dq); bi = q; } else if (dq < sd) sd = dq; } ties.push(sd - bd); return reach[bi]; };
    var a1lo = reachAt(d0), a1hi = reachAt(d1), a_bolt = -e_used, a0 = a_bolt - e_used;
    // ---- support wall thickness MEASURED around the plate (column flange vs web etc.)
    var tList = [], dqs = [d0 + 0.2 * (d1 - d0), dmid, d1 - 0.2 * (d1 - d0)];
    arange(w_plus - 25, w_plus + tp + 25.1, 5.0).forEach(function (wq2) { dqs.forEach(function (dq) {
      var oc = [E[0] + (uw[0] * wq2 + ud[0] * dq) / 1000 - ua[0] * 0.01, E[1] + (uw[1] * wq2 + ud[1] * dq) / 1000 - ua[1] * 0.01, E[2] + (uw[2] * wq2 + ud[2] * dq) / 1000 - ua[2] * 0.01], tf_ = rayFirst(oc, ua, Ts);
      if (tf_ === null) return; var tt = rayAll([oc[0] + ua[0] * (tf_ + 0.0005), oc[1] + ua[1] * (tf_ + 0.0005), oc[2] + ua[2] * (tf_ + 0.0005)], ua, Ts, 1e-7);
      if (tt.length && tt[0] * 1000 + 0.5 >= 1.0) tList.push(tt[0] * 1000 + 0.5);
    }); });
    var t_sup = tList.length ? Math.min.apply(null, tList) : null;
    if (t_sup === null || t_sup > rv('support_wall_max_mm')) return { result: 'NO_SUPPORT_T', reason: REASON.NO_T };
    var wl = weldMin(TABLE, Math.min(tp, t_sup));
    if (wl === null) return { result: 'NO_SUPPORT_T', reason: 'gap: no row of the weld table covers a thinner part of ' + fx(Math.min(tp, t_sup), 2) + ' mm' };
    var storey = meta[j.guid].storey;
    // ---- the geometry (the oracle's builder: triangles as triples of world points)
    var quad = function (L, a, b, c2, d) { L.push([a, b, c2]); L.push([a, c2, d]); };
    var tris_p = [], tris_b = [], tris_w = [];
    (function () {
      var C8 = function (ii, jj, kk) { return wp(ii === 0 ? a0 : (kk === 0 ? a1lo : a1hi), [w_plus, w_plus + tp][jj], [d0, d1][kk]); };
      [[[0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1]], [[1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0]], [[0, 0, 0], [0, 0, 1], [1, 0, 1], [1, 0, 0]], [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]], [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], [[0, 0, 1], [0, 1, 1], [1, 1, 1], [1, 0, 1]]]
        .forEach(function (f) { var p = f.map(function (q) { return C8(q[0], q[1], q[2]); }); quad(tris_p, p[0], p[1], p[2], p[3]); });
    })();
    var prism = function (L, a, d, w0, w1, rad, nn) {
      var ring = [], q; for (q = 0; q < nn; q++) ring.push([a + rad * Math.cos(2 * Math.PI * q / nn + Math.PI / nn), d + rad * Math.sin(2 * Math.PI * q / nn + Math.PI / nn)]);
      for (q = 0; q < nn; q++) { var p = ring[q], r = ring[(q + 1) % nn]; quad(L, wp(p[0], w0, p[1]), wp(r[0], w0, r[1]), wp(r[0], w1, r[1]), wp(p[0], w1, p[1])); L.push([wp(a, w1, d), wp(p[0], w1, p[1]), wp(r[0], w1, r[1])]); L.push([wp(a, w0, d), wp(r[0], w0, r[1]), wp(p[0], w0, p[1])]); }
    };
    var rows_d = []; for (i = 0; i < nb; i++) rows_d.push(d0 + e_used + i * pitch);
    var w_head0 = w_plus + tp, w_nut0 = w_minus, wt = rv('washer_t_mm'), hh = rv('bolt_head_h_mm'), nh = rv('nut_h_mm');
    rows_d.forEach(function (dd) {
      prism(tris_b, a_bolt, dd, w_head0, w_head0 + wt, wr, 16);
      prism(tris_b, a_bolt, dd, w_head0 + wt, w_head0 + wt + hh, rv('bolt_head_af_mm') / Math.sqrt(3), 6);
      prism(tris_b, a_bolt, dd, w_nut0 - wt - nh - 5, w_head0, d_b / 2, 12);
      prism(tris_b, a_bolt, dd, w_nut0 - wt, w_nut0, wr, 16);
      prism(tris_b, a_bolt, dd, w_nut0 - wt - nh, w_nut0 - wt, rv('nut_af_mm') / Math.sqrt(3), 6);
    });
    var fillet = function (L, a0f, a1f, w_face, dd0, dd1, leg, sw, sa) {
      var A = [[a0f, w_face], [a0f, w_face + sw * leg], [a0f + sa * leg, w_face]], B = [[a1f, w_face], [a1f, w_face + sw * leg], [a1f + sa * leg, w_face]];
      for (var q = 0; q < 3; q++) { var p0 = A[q], q0 = A[(q + 1) % 3], p1 = B[q], q1 = B[(q + 1) % 3]; quad(L, wp(p0[0], p0[1], dd0), wp(q0[0], q0[1], dd0), wp(q1[0], q1[1], dd1), wp(p1[0], p1[1], dd1)); }
      L.push(A.map(function (x) { return wp(x[0], x[1], dd0); })); L.push(B.slice().reverse().map(function (x) { return wp(x[0], x[1], dd1); }));
    };
    fillet(tris_w, a1lo, a1hi, w_plus, d0, d1, wl, -1, -1); fillet(tris_w, a1lo, a1hi, w_plus + tp, d0, d1, wl, +1, -1);
    var flat = function (L) { var o = new Float64Array(L.length * 9), q = 0; L.forEach(function (t3) { for (var m = 0; m < 3; m++) { o[q++] = t3[m][0]; o[q++] = t3[m][1]; o[q++] = t3[m][2]; } }); return o; };
    var Fp = flat(tris_p), Fb = flat(tris_b), Fw = flat(tris_w), Lp = locFlat(Fp), Lb = locFlat(Fb), Lw = locFlat(Fw);
    // ---- W-CONN-RULES, MEASURED on the built meshes
    var heads = [], pitDs = [], cents = [], pmin = Infinity, pmaxd = -Infinity, tpmin = Infinity, tpmax = -Infinity, pa0 = Infinity;
    for (i = 0; i < Lb.length; i += 3) if (Lb[i + 1] > w_head0 + wt + 0.1) heads.push([Lb[i], Lb[i + 2]]);
    rows_d.forEach(function (dd) { var sel = heads.filter(function (h) { return Math.abs(h[1] - dd) < pitch / 2; }), sa = 0, sd = 0; sel.forEach(function (h) { sa += h[0]; sd += h[1]; }); cents.push([sa / sel.length, sd / sel.length]); });
    for (i = 0; i + 1 < cents.length; i++) pitDs.push(cents[i + 1][1] - cents[i][1]); if (nb <= 1) pitDs = [pitch];
    for (i = 0; i < Lp.length; i += 3) { if (Lp[i + 1] < tpmin) tpmin = Lp[i + 1]; if (Lp[i + 1] > tpmax) tpmax = Lp[i + 1]; if (Lp[i + 2] < pmin) pmin = Lp[i + 2]; if (Lp[i + 2] > pmaxd) pmaxd = Lp[i + 2]; if (Lp[i] < pa0) pa0 = Lp[i]; }
    var tp_m = tpmax - tpmin, pit = Math.min.apply(null, pitDs), e_top = pmaxd - Math.max.apply(null, cents.map(function (q) { return q[1]; })), e_bot = Math.min.apply(null, cents.map(function (q) { return q[1]; })) - pmin;
    var e_back = cents.reduce(function (s2, q) { return s2 + q[0]; }, 0) / cents.length - pa0, e_end = Math.min.apply(null, cents.map(function (q) { var te = rayFirst(wp(q[0], 0, q[1]), ua, T); return te !== null ? te * 1000 : -1; }));
    var legMin = Infinity, legMax = -Infinity; for (i = 0; i < Lw.length; i += 3) if (Lw[i + 1] > w_plus + tp - 0.01) { if (Lw[i + 1] < legMin) legMin = Lw[i + 1]; if (Lw[i + 1] > legMax) legMax = Lw[i + 1]; }
    var leg_m = legMax >= legMin ? legMax - legMin : 0, emax = Math.min(12 * Math.min(tp_m, tw_meas), 150), edges = [e_top, e_bot, e_back, e_end];
    var chk = { pitch_ge_min: pit >= rv('bolt_pitch_min_mm') - 0.05, clear_between_holes_ge_d: (pit - hole) >= d_b - 0.05, edges_ge_min: Math.min.apply(null, edges) >= e_min - 0.05, edges_le_12t_thinner_part: Math.max.apply(null, edges) <= emax + 0.05,
      weld_ge_table_thinner_part: leg_m >= weldMin(TABLE, Math.min(tp_m, t_sup)) - 0.05, weld_le_j22b_plate_edge: leg_m <= (tp_m >= 6 ? tp_m - 2 : tp_m) + 0.05, plate_t_equals_row: Math.abs(tp_m - tp) < 0.05, plate_in_web_zone: (pmin >= -zone - 0.05 && pmaxd <= zone + 0.05) };
    // ---- W-CONN-CLEAR against EVERY neighbour, including the beam itself and the parts already generated
    var boxes = [['plate', [a0, Math.max(a1lo, a1hi)], [w_plus + tol, w_plus + tp], [d0, d1]]];
    rows_d.forEach(function (dd) { boxes.push(['bolt head side', [a_bolt - wr, a_bolt + wr], [w_plus + tp + tol, w_head0 + wt + hh], [dd - wr, dd + wr]]); boxes.push(['bolt nut side', [a_bolt - wr, a_bolt + wr], [w_nut0 - wt - nh - 5, w_minus - tol], [dd - wr, dd + wr]]); });
    boxes.push(['welds', [Math.min(a1lo, a1hi) - wl, Math.max(a1lo, a1hi)], [w_plus - wl, w_plus + tp + wl], [d0, d1]]);
    var plo = [Infinity, Infinity, Infinity], phi = [-Infinity, -Infinity, -Infinity];
    [Fp, Fb, Fw].forEach(function (A) { for (var q = 0; q < A.length; q += 3) for (var a = 0; a < 3; a++) { if (A[q + a] < plo[a]) plo[a] = A[q + a]; if (A[q + a] > phi[a]) phi[a] = A[q + a]; } });
    var qlo = [plo[0] - 0.02, plo[1] - 0.02, plo[2] - 0.02], qhi = [phi[0] + 0.02, phi[1] + 0.02, phi[2] + 0.02];
    var nbG = idx.query(qlo, qhi).filter(function (g2) { return g2 !== j.guid && g2.indexOf('GEN-CR-') !== 0; }), genNb = Object.keys(G).filter(function (g2) { var b = G[g2].box; return b[0][0] <= qhi[0] && b[0][1] <= qhi[1] && b[0][2] <= qhi[2] && b[1][0] >= qlo[0] && b[1][1] >= qlo[1] && b[1][2] >= qlo[2]; });
    var hits = [], skipped = [], pmaxTri = rv('parity_max_triangles');
    if (!opts.noClash) {
      var pre = [plo[0] - 0.1, plo[1] - 0.1, plo[2] - 0.1], prh = [phi[0] + 0.1, phi[1] + 0.1, phi[2] + 0.1];
      var targets = [{ g: j.guid, n: nTri, sel: function () { return M.trisIn(j.guid, pre, prh); }, full: function () { return T; }, V: mb.V }]
        .concat(nbG.map(function (g2) { return { g: g2, n: M.ntri(g2), sel: function () { return M.trisIn(g2, pre, prh); }, full: function () { return M.soup(g2); }, V: M.get(g2) && M.get(g2).V }; }))
        .concat(genNb.map(function (g2) { return { g: g2, n: G[g2].tris.length / 9, sel: function () { return trisInBox(G[g2].tris, pre, prh); }, full: function () { return G[g2].tris; }, V: G[g2].tris }; }));
      targets.forEach(function (tg) {
        var g2 = tg.g, nTg = tg.n; if (!nTg) return; var sel = tg.sel(), Lt = sel ? locFlat(sel) : new Float64Array(0), nt = Lt.length / 9, tmn = new Float64Array(nt * 3), tmx = new Float64Array(nt * 3), q, a, lb = null;
        for (q = 0; q < nt; q++) for (a = 0; a < 3; a++) { var x0 = Lt[9 * q + a], x1 = Lt[9 * q + 3 + a], x2 = Lt[9 * q + 6 + a]; tmn[3 * q + a] = Math.min(x0, x1, x2); tmx[3 * q + a] = Math.max(x0, x1, x2); }
        var localBounds = function () { if (lb) return lb; var Q = nTg > pmaxTri ? tg.V : tg.full(), Lf = locFlat(Q), mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]; for (var u = 0; u < Lf.length; u += 3) for (var b = 0; b < 3; b++) { if (Lf[u + b] < mn[b]) mn[b] = Lf[u + b]; if (Lf[u + b] > mx[b]) mx[b] = Lf[u + b]; } return (lb = [mn, mx]); };
        boxes.forEach(function (bx) {
          var nm = bx[0], A_ = bx[1], W_ = bx[2], D_ = bx[3], a_hi = A_[1];
          if (g2 === j.support && (nm === 'plate' || nm === 'welds')) a_hi = Math.min(a1lo, a1hi) - tol;   // plate and welds bear on the support face by design
          var cc = [(A_[0] + a_hi) / 2, (W_[0] + W_[1]) / 2, (D_[0] + D_[1]) / 2], hh2 = [(a_hi - A_[0]) / 2, (W_[1] - W_[0]) / 2, (D_[1] - D_[0]) / 2];
          if (hh2[0] <= 0 || hh2[1] <= 0 || hh2[2] <= 0) return;
          var keep = []; for (var t = 0; t < nt; t++) { var ok2 = true; for (var b = 0; b < 3; b++) if (!(tmx[3 * t + b] >= cc[b] - hh2[b] && tmn[3 * t + b] <= cc[b] + hh2[b])) { ok2 = false; break; } if (ok2) for (var z = 0; z < 9; z++) keep.push(Lt[9 * t + z]); }
          var hit = keep.length > 0 && anyTriBox(Float64Array.from(keep), cc, hh2);
          if (!hit && g2 !== j.guid && nTg > pmaxTri) { var L1 = localBounds(); if (L1[0][0] <= cc[0] && L1[0][1] <= cc[1] && L1[0][2] <= cc[2] && L1[1][0] >= cc[0] && L1[1][1] >= cc[1] && L1[1][2] >= cc[2]) skipped.push(g2); }
          if (!hit && g2 !== j.guid && nTg <= pmaxTri) { var L2 = localBounds(); if (L2[0][0] <= cc[0] && L2[0][1] <= cc[1] && L2[0][2] <= cc[2] && L2[1][0] >= cc[0] && L2[1][1] >= cc[1] && L2[1][2] >= cc[2]) hit = inside(wp(cc[0], cc[1], cc[2]), tg.full()); }   // box possibly swallowed whole
          if (hit) hits.push([nm, g2]);
        });
      });
    }
    var nameOf = function (g2) { return meta[g2] ? meta[g2] : (G[g2] ? { cls: G[g2].cls, name: G[g2].name } : { cls: '?', name: g2 }); };
    if (hits.length) {
      var h0 = hits[0], gg = h0[1], mm = nameOf(gg), nmx = gg === j.guid ? 'own beam' : (gg === j.support ? 'support' : String(mm.name).replace(/:\d+$/, '').split(':').pop().slice(0, 40));
      return { result: 'REFUSED_CLASH', reason: REASON.CLASH, clashKey: h0[0] + ' x ' + mm.cls + ' ' + nmx, clash: hits.slice(0, 4).map(function (h) { var m3 = nameOf(h[1]); return [h[0], h[1], m3.cls, m3.name]; }), allHits: hits, skipped: skipped, judged: true };
    }
    return { result: 'GENERATED', judged: true, skipped: skipped, nb: nbG.length + genNb.length + 1, E: E, ua: ua, uw: uw, ud: ud, n_bolts: nb, H: H, a0: a0, a1lo: a1lo, a1hi: a1hi, tp: tp, wl: wl, t_sup: t_sup, tw_meas: tw_meas, zone: zone, storey: storey, tieMargins: ties,
      Fp: Fp, Fb: Fb, Fw: Fw, chk: chk, measured: { pitch: pit, e_top: e_top, e_bot: e_bot, e_back: e_back, e_end: e_end, plate_t: tp_m, weld_leg: leg_m }, web_mm: median(reach.filter(function (x) { return x !== null && x >= thr; })), front_skew_mm: Math.abs(a1hi - a1lo), plate_L: Math.max(a1lo, a1hi) - a0 };
  }

  // ---- the independent re-check on the WRITTEN parts: every part's surface (triangle centroids) must lie inside no other element's solid.
  // items: [{guid, beam, support, kind:'PL'|'BT'|'WD', tris: Float64Array (world)}]. Used by run() on its own parts and by the witness on parts rebuilt from the op-log rows.
  function clearPost(inp, RULES, items, log, extraParts) {
    var cx = makeCtx(inp, RULES, log), M = cx.meshes, idx = indexOf(inp), pmax = cx.rv('parity_max_triangles'), fails = [], skippedSet = {}, boxOf = {}, allX = items.concat(extraParts || []);   // extraParts (P6): live generated parts of other packs, solids to test against, never judged here
    allX.forEach(function (it) { var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], A = it.tris; for (var q = 0; q < A.length; q += 3) for (var a = 0; a < 3; a++) { if (A[q + a] < lo[a]) lo[a] = A[q + a]; if (A[q + a] > hi[a]) hi[a] = A[q + a]; } boxOf[it.guid] = [lo, hi]; });
    items.forEach(function (it) {
      var b = boxOf[it.guid], lo = b[0], hi = b[1], A = it.tris, base = it.guid.replace(/-(PL|BT|WD)$/, '');
      var others = idx.query(lo, hi).filter(function (g) { return g !== it.beam; }), extra = allX.filter(function (o) { return o.guid.indexOf(base) !== 0 && boxOf[o.guid][0][0] <= hi[0] && boxOf[o.guid][0][1] <= hi[1] && boxOf[o.guid][0][2] <= hi[2] && boxOf[o.guid][1][0] >= lo[0] && boxOf[o.guid][1][1] >= lo[1] && boxOf[o.guid][1][2] >= lo[2]; });
      var nTr = A.length / 9, pts = [], step = Math.max(1, Math.floor(nTr / 40)), q, bad = null;
      for (q = 0; q < nTr; q += step) pts.push([(A[9 * q] + A[9 * q + 3] + A[9 * q + 6]) / 3, (A[9 * q + 1] + A[9 * q + 4] + A[9 * q + 7]) / 3, (A[9 * q + 2] + A[9 * q + 5] + A[9 * q + 8]) / 3]);
      others.forEach(function (g) {
        if (bad) return; if (g === it.support && (it.kind === 'PL' || it.kind === 'WD')) return;   // the plate bears on the support face by design (tested by the box test before writing)
        var nT2 = M.ntri(g); if (!nT2) return; if (nT2 > pmax) { skippedSet[g] = 1; return; }
        var bx = idx.box(g), Tg = null;   // a point outside a neighbour's own box is not inside it (the ray-parity test on an open mesh could otherwise answer 'odd' far away)
        for (var u = 0; u < pts.length; u++) { var P = pts[u]; if (!(P[0] >= bx[0][0] && P[1] >= bx[0][1] && P[2] >= bx[0][2] && P[0] <= bx[1][0] && P[1] <= bx[1][1] && P[2] <= bx[1][2])) continue; if (!Tg) Tg = M.soup(g); if (inside(P, Tg)) { bad = [it.guid, g]; return; } }
      });
      extra.forEach(function (o) { if (bad) return; if (o.tris.length / 9 > pmax) return; for (var u = 0; u < pts.length; u++) if (inside(pts[u], o.tris)) { bad = [it.guid, o.guid]; return; } });
      if (bad) fails.push(bad);
    });
    return { fails: fails, checked: items.length, skipped: Object.keys(skippedSet).sort() };
  }

  function run(inp, RULES, opts) {
    opts = opts || {}; var LOG = opts.log || function () { }, t0 = nowMs(), cx = makeCtx(inp, RULES, LOG), rv = cx.rv, meta = cx.meta;
    LOG('§LODUP_JOINT_MODE clash_check=' + (opts.noClash ? 'OFF(break)' : 'on') + ' rolled_only=' + rv('rolled_section_only') + ' bolts=M' + rv('bolt_diameter_mm') + ' plate=' + rv('plate_thickness_mm') + ' table=' + JSON.stringify(weldTable(rv('weld_min_table_mm'))));
    var S = survey(cx), t1 = nowMs(), rows = S.rows, parts = [], CH = [], out = [], reasons = {}, clashBy = {}, G = seedGenerated(inp, opts, 'GEN-CR-'), ruleFail = [], addedVerts = 0, judged = 0, skippedAll = {}, gen = [];
    LOG('§LODUP_JOINT_NEIGHBOURS model_as_read + live_parts_of_other_packs=' + Object.keys(G).length + (opts.noGenerated ? ' (OFF: the old behaviour, break switch)' : '') + ' (op-log parts seeded as clash neighbours, the same rule for every pack)');
    var bump = function (k) { reasons[k] = (reasons[k] || 0) + 1; };
    var change = function (kind, guid, cls, host, rule, detail) { CH.push({ kind: kind, guid: guid, cls: cls, host: host, rule: rule, detail: detail }); };
    var lab = LABEL, ruleTxt = 'Fin plate joint (single plate shear): AISC 360-16 rows + defaults [' + RULES.bolt_pitch_mm.source + ']; configuration only, capacity not checked';
    rows.forEach(function (j) {
      var endL = j.end > 0 ? 'B' : 'A', hostM = meta[j.guid];
      var refuse = function (res, reason, extra) { bump(reason); out.push(Object.assign({}, j, { result: res }, extra || {})); change('REFUSED', j.guid, hostM.cls, j.guid, 'Fin plate joint', 'end ' + endL + (j.support ? ' -> support ' + j.support + ' "' + j.support_name + '"' : '') + ': ' + reason + (extra && extra.note ? ' | ' + extra.note : '')); };
      if (j.cls !== 'STEEL_WEB') { bump('gap: ' + j.cls); out.push(Object.assign({}, j, { result: 'GAP' })); change('REFUSED', j.guid, hostM.cls, j.guid, 'Fin plate joint', 'end ' + endL + ': gap: ' + j.cls + (j.support ? ' (support ' + j.support + ' "' + j.support_name + '")' : ' (nothing within reach of the end)') + ' | not detailed by this pack'); return; }
      var r = genJoint(cx, j, G, opts);
      if (r.result === 'NOT_I' || r.result === 'NO_WEB' || r.result === 'NO_SUPPORT_T' || r.result === 'NO_SURF' || r.result === 'NO_PATH') { refuse(r.result, r.reason); return; }
      if (r.result === 'OVERLAP_IN_MODEL') { refuse(r.result, r.reason, { note: 'clearance ' + fx(j.clear_min_mm, 1) + ' to ' + fx(j.clear_max_mm, 1) + ' mm' }); return; }
      if (r.result === 'NO_ROOM') { refuse('NO_ROOM', r.reason, { H_av: r.H_av, note: 'clear web depth ' + fx(r.H_av, 1) + ' mm' }); return; }
      judged++; (r.skipped || []).forEach(function (g) { skippedAll[g] = 1; });
      if (r.result === 'REFUSED_CLASH') {
        bump(r.reason); clashBy[r.clashKey] = (clashBy[r.clashKey] || 0) + 1; out.push(Object.assign({}, j, { result: 'REFUSED_CLASH', clash: r.clash, hit_guids: r.allHits.map(function (h) { return h[1]; }).filter(function (g, i3, a3) { return a3.indexOf(g) === i3; }) }));
        change('REFUSED', j.guid, hostM.cls, j.guid, 'Fin plate joint', 'end ' + endL + ' -> support ' + j.support + ' "' + j.support_name + '": ' + r.reason + ' | ' + r.clash.map(function (c) { return c[0] + ' x ' + c[2] + ' ' + c[3]; }).join('; ')); return;
      }
      var fails = Object.keys(r.chk).filter(function (kk) { return !r.chk[kk]; }); if (fails.length) ruleFail.push([j.guid, j.end, fails]);
      var base = 'GEN-CR-' + j.guid + '-' + endL, kinds = [['PL', r.Fp, 'Fin plate ' + fx(r.tp, 0) + ' x ' + fx(r.H, 0) + ' x ' + fx(r.plate_L, 0) + ' mm ' + lab], ['BT', r.Fb, r.n_bolts + ' x M' + fmtG(rv('bolt_diameter_mm')) + ' bolt assemblies, pitch ' + fx(rv('bolt_pitch_mm'), 0) + ' ' + lab], ['WD', r.Fw, '2 fillet welds ' + fx(r.wl, 0) + ' mm x ' + fx(r.H, 0) + ' mm to support ' + lab]];
      kinds.forEach(function (kd) {
        var A = kd[1], lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (var q = 0; q < A.length; q += 3) for (var a = 0; a < 3; a++) { if (A[q + a] < lo[a]) lo[a] = A[q + a]; if (A[q + a] > hi[a]) hi[a] = A[q + a]; }
        G[base + '-' + kd[0]] = { box: [lo, hi], tris: A, cls: CLS[kd[0]], name: kd[2] };
        parts.push({ guid: base + '-' + kd[0], cls: CLS[kd[0]], name: kd[2], storey: hostM.storey, disc: hostM.disc, building: hostM.building, tris: A, parents: [], attach: [j.guid], rgba: RGBA[kd[0]], kind: kd[0], beam: j.guid, support: j.support });
        addedVerts += A.length / 3;
        change('ADDED', base + '-' + kd[0], CLS[kd[0]], j.guid, ruleTxt, 'beam "' + hostM.name + '" end ' + endL + ' -> support ' + j.support + ' "' + j.support_name + '" | ' + kd[2] + ' | web t ' + fx(r.tw_meas, 2) + ' mm, support wall ' + fx(r.t_sup, 1) + ' mm, clear web ' + fx(r.web_mm, 1) + ' mm | storey ' + r.storey);
      });
      out.push(Object.assign({}, j, { result: 'GENERATED', n_bolts: r.n_bolts, plate_H: r.H, plate_L: r.plate_L, web_mm: r.web_mm, front_skew_mm: r.front_skew_mm, weld_mm: r.wl, support_t_measured_mm: r.t_sup, tw_measured_mm: r.tw_meas, zone_mm: r.zone, tie_margin_mm: Math.min.apply(null, r.tieMargins), measured: r.measured, neighbours_tested: r.nb, checks: r.chk }));
      gen.push(out[out.length - 1]); bump('generated');
    });
    var t2 = nowMs(), items = parts.map(function (p) { return { guid: p.guid, beam: p.beam, support: p.support, kind: p.kind, tris: p.tris }; }), post = clearPost(inp, RULES, items, function () { }, seededItems(G));
    post.skipped.forEach(function (g) { skippedAll[g] = 1; });
    LOG('§LODUP_JOINT_PARITY_SKIPPED elements=' + Object.keys(skippedAll).length + ' ' + Object.keys(skippedAll).sort().map(function (g) { return String(meta[g].name).replace(/:\d+$/, ''); }).filter(function (v, i2, a) { return a.indexOf(v) === i2; }).join(', '));
    LOG('§LODUP_JOINT_CLEAR_POST parts_checked=' + parts.length + ' failures=' + post.fails.length + ' -> ' + (!parts.length ? 'INCONCLUSIVE' : (post.fails.length ? 'FAIL ' + JSON.stringify(post.fails.slice(0, 3)) : 'PASS')));
    Object.keys(reasons).sort().forEach(function (k) { LOG('§LODUP_JOINT_GEN ' + k + ' ends=' + reasons[k]); });
    Object.keys(clashBy).sort(function (a, b) { return clashBy[b] - clashBy[a] || (a < b ? -1 : 1); }).forEach(function (k) { LOG('§LODUP_JOINT_REFUSED_CLASH ' + k + ' joints=' + clashBy[k]); });
    LOG('§LODUP_JOINT_RULES joints=' + gen.length + ' clause_failures=' + ruleFail.length + ' (measured on the built meshes) -> ' + (!gen.length ? 'INCONCLUSIVE' : (ruleFail.length ? 'FAIL ' + JSON.stringify(ruleFail.slice(0, 3)) : 'PASS')));
    var nClash = out.filter(function (o) { return o.result === 'REFUSED_CLASH'; }).length;
    LOG('§LODUP_JOINT_CLEAR judged=' + judged + ' shipped=' + gen.length + ' refused_for_clash=' + nClash + ' clash_check=' + (opts.noClash ? 'OFF(break)' : 'on') + ' -> ' + (!judged ? 'INCONCLUSIVE' : (post.fails.length ? 'FAIL (see CLEAR_POST)' : 'PASS')));
    if (gen.length) { var bc = {}, wc = {}, sc = {}; gen.forEach(function (o) { bc[o.n_bolts] = (bc[o.n_bolts] || 0) + 1; wc[o.weld_mm] = (wc[o.weld_mm] || 0) + 1; sc[o.support_t_measured_mm.toFixed(1)] = (sc[o.support_t_measured_mm.toFixed(1)] || 0) + 1; });
      LOG('§LODUP_JOINT_SIZES bolts_per_joint=' + JSON.stringify(bc) + ' weld_mm=' + JSON.stringify(wc) + ' support_t_mm=' + JSON.stringify(sc) + ' plate_len_mm min=' + fx(Math.min.apply(null, gen.map(function (o) { return o.plate_L; })), 0) + ' max=' + fx(Math.max.apply(null, gen.map(function (o) { return o.plate_L; })), 0)); }
    var nd = 0, ns = 0; Object.keys(RULES).forEach(function (k) { var s = String(RULES[k].source); if (/^default/.test(s)) nd++; else if (/^stated/.test(s)) ns++; });
    LOG('§LODUP_JOINT_DEFAULTS rows=' + Object.keys(RULES).length + ' still_default=' + nd + ' stated=' + ns + ' verts_added=' + addedVerts);
    var cnt = { ADDED: 0, NOT_BUILT: 0, REFUSED: 0 }; CH.forEach(function (c) { cnt[c.kind]++; });
    var heap = (typeof performance !== 'undefined' && performance.memory) ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
    LOG('§LODUP_COST pack=joints addedVerts=' + addedVerts + ' surveyMs=' + Math.round(t1 - t0) + ' generateMs=' + Math.round(t2 - t1) + ' clearPostMs=' + Math.round(nowMs() - t2) + ' totalMs=' + Math.round(nowMs() - t0) + ' heapMB=' + heap);
    LOG('§LODUP_JOINT_SUMMARY added=' + cnt.ADDED + ' refused=' + cnt.REFUSED + ' joints=' + gen.length + ' ends=' + rows.length + ' addedVerts=' + addedVerts + (parts.length ? '' : ' INCONCLUSIVE (no joint built: nothing was judged)'));
    return { parts: parts, changes: CH, stats: { added: cnt.ADDED, notBuilt: 0, refused: cnt.REFUSED, addedVerts: addedVerts, appliesTo: S.counts.STEEL_WEB || 0, judged: S.counts.STEEL_WEB || 0, joints: gen.length, ends: rows.length, ms: Math.round(nowMs() - t0) },
      audit: { survey: rows, results: out, reasons: reasons, clashBy: clashBy, ruleFail: ruleFail, post: post, generated: gen, skipped: Object.keys(skippedAll).sort() } };
  }

  // the survey, cached per open model + the rows the survey itself reads (P5: the gusset pack asks for the same survey, so the chooser surveys once). Read-only: callers must not change the returned rows.
  var SURVEY_KEYS = ['member_material_gate', 'member_name_include', 'member_name_exclude', 'concrete_name_pattern', 'support_reach_mm', 'survey_ray_back_mm', 'survey_depth_rays', 'survey_width_rays', 'survey_depth_span', 'survey_width_span', 'angle_web_min_deg', 'angle_inline_max_deg', 'cope_jump_mm'];
  var SURVEY_CACHE = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function surveyCached(inp, rows) {
    var key = JSON.stringify(SURVEY_KEYS.map(function (k) { return rows[k] ? rows[k].value : null; })), c = SURVEY_CACHE && inp.src && typeof inp.src === 'object' ? SURVEY_CACHE.get(inp.src) : null;
    if (c && c.key === key) return c.S;
    var S = survey(makeCtx(inp, rows, function () { })); if (SURVEY_CACHE && inp.src && typeof inp.src === 'object') SURVEY_CACHE.set(inp.src, { key: key, S: S }); return S;
  }
  // the panel's measured count: the beam ends whose support is a steel web, found by the survey (read-only; cached per open model + rule rows)
  function appliesTo(inp, rows) {
    if (!rows) { var n = 0; Object.keys(inp.meta).forEach(function (g) { var c = inp.meta[g].cls; if (c === 'IfcBeam' || c === 'IfcMember') n++; }); return n; }
    try { return surveyCached(inp, rows).counts.STEEL_WEB || 0; } catch (e) { return 0; }
  }
  var API = { id: 'joints', label: 'Steel joints', unit: 'beam ends', rulesFile: 'rules/joint_defaults.json', run: run, appliesTo: appliesTo, clearPost: clearPost, survey: function (inp, RULES, log) { return survey(makeCtx(inp, RULES, log)); }, weldTable: weldTable, weldMin: weldMin, frameOf: frameOf, eig3: eig3, REASON: REASON,
    // P5 (gussets): the primitives the gusset pack REUSES (survey, true-box index, meshes with the triangle grid, rays, ray parity, vector helpers); not a second copy
    kit: { seedGenerated: seedGenerated, seededItems: seededItems, makeCtx: makeCtx, survey: survey, surveyCached: surveyCached, indexOf: indexOf, trisInBox: trisInBox, rayAll: rayAll, rayFirst: rayFirst, inside: inside, unit: unit, sub: sub, add: add, mul: mul, dot: dot, cross: cross, norm: norm, median: median, fx: fx, fmtG: fmtG, nowMs: nowMs, RGBA: RGBA, CLS: CLS, LABEL: LABEL } };
  if (typeof window !== 'undefined' && window.LodRegistry) window.LodRegistry.register(API);   // browser: the pack registers itself; adding a pack needs no dialog change
  return API;
});
