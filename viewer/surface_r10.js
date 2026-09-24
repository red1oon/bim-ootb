// ══ §SURFACE_R10 — single-style windows and doors (bim-compiler prompts/PHOTOREAL_STILL_RENDER.md
// "§SURFACE_R10 — SPEC" + "R10 additions (watcher review)") ══
// Pure geometry, no THREE, no DOM: a JS port of the read-only measurement that fixed the algorithm and
// thresholds (photoreal scratchpad r10/: spec.md, split_lib.py, measure_windows.py, measure_doors.py).
// Nothing here is re-invented; every constant below is split_lib.py's, except DOMINANT_MIN, which the
// spec sets to 40 % (variant_dominance40.log: the 13 JKR windows at 47 % split cleanly; Terminal,
// Hospital and LTU counts are identical at 40 % and 50 %, re-run r10port/expect40.py).
//
// Input is what the viewer renders: a BufferGeometry's position (three space, blobToGeometry's
// Y<->Z swap applied) and index. The swap is undone first, so the maths runs on exactly the
// vertices the Python read from the DB (IFC local frame): X = x, Y = -z, Z = y.
//
// classifyWindow -> { verdict: 'CLEAN' | 'F_NO_PLANE' | 'F_NO_PANE' | 'F_LOW_COVER' | 'F_NO_BAND',
//                     why, flags: Uint8Array per triangle (1 = PANE) only when CLEAN, ... }
// classifyDoor   -> { verdict: 'SEPARABLE' | 'LEAF_NO_HW' | 'NO_LEAF' | 'HW_WELDED' | 'NOT_SLAB',
//                     flags: Uint8Array per triangle (1 = LEAF/rest, 0 = HARDWARE) only when SEPARABLE }
(function (global) {
  'use strict';
  var EPS = 1e-3;            // 1 mm edge-touch tolerance
  var DEPTH_Q = 5e-4;        // 0.5 mm depth quantisation
  var POS_Q = 1e-4;          // 0.1 mm vertex position quantisation for adjacency
  var PANE_MIN_AREA_FRAC = 0.02;
  var PANE_MIN_SIDE = 0.120;
  var PANE_MIN_SOLIDITY = 0.85;
  var COVER_MIN = 0.50;
  var BAND_MIN = 0.010;
  var DOMINANT_MIN = 0.40;   // spec: "a 40% dominance floor"
  var HW_MAX_SIDE = 0.350;   // measure_doors.py
  var HW_MAX_AREA_FRAC = 0.05;
  var LEAF_COVER_MIN = 0.40;

  // numpy.round is round-half-to-even; Math.round is half-up. Keys must bucket exactly as the Python did.
  function rne(x) {
    var r = Math.round(x);
    if (Math.abs(x % 1) === 0.5) r = 2 * Math.round(x / 2);
    return r;
  }

  function toIfc(pos) {
    var n = pos.length / 3, V = new Float64Array(pos.length);
    for (var i = 0; i < n; i++) { V[i * 3] = pos[i * 3]; V[i * 3 + 1] = -pos[i * 3 + 2]; V[i * 3 + 2] = pos[i * 3 + 1]; }
    return V;
  }

  function triNormalsAreas(V, F, m) {
    var N = new Float64Array(m * 3), A = new Float64Array(m);
    for (var t = 0; t < m; t++) {
      var a = F[t * 3] * 3, b = F[t * 3 + 1] * 3, c = F[t * 3 + 2] * 3;
      var e1x = V[b] - V[a], e1y = V[b + 1] - V[a + 1], e1z = V[b + 2] - V[a + 2];
      var e2x = V[c] - V[a], e2y = V[c + 1] - V[a + 1], e2z = V[c + 2] - V[a + 2];
      var nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
      var l = Math.sqrt(nx * nx + ny * ny + nz * nz);
      A[t] = 0.5 * l;
      if (l > 0) { N[t * 3] = nx / l; N[t * 3 + 1] = ny / l; N[t * 3 + 2] = nz / l; }
    }
    return { N: N, A: A };
  }

  // split_lib._cluster_dir: largest area-weighted cluster of (± folded) unit normals among mask.
  function clusterDir(N, A, m, mask) {
    var buckets = new Map(), keys = [], any = false;
    for (var t = 0; t < m; t++) {
      if (!mask(t)) { keys.push(null); continue; }
      any = true;
      var x = N[t * 3], y = N[t * 3 + 1], z = N[t * 3 + 2];
      var ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
      var dom = (ax >= ay && ax >= az) ? 0 : (ay >= az ? 1 : 2);   // np.argmax: first max
      var dv = dom === 0 ? x : (dom === 1 ? y : z);
      var s = dv > 0 ? 1 : (dv < 0 ? -1 : 1);
      var k = rne(x * s / 0.05) + ',' + rne(y * s / 0.05) + ',' + rne(z * s / 0.05);
      keys.push([k, x * s, y * s, z * s]);
      buckets.set(k, (buckets.get(k) || 0) + A[t]);
    }
    if (!any) return null;
    var best = null, bestA = -Infinity;
    buckets.forEach(function (v, k) { if (v > bestA) { bestA = v; best = k; } });
    var dx = 0, dy = 0, dz = 0;
    for (var t2 = 0; t2 < m; t2++) {
      var kk = keys[t2]; if (!kk || kk[0] !== best) continue;
      dx += kk[1] * A[t2]; dy += kk[2] * A[t2]; dz += kk[3] * A[t2];
    }
    var l = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (l === 0) return null;
    dx /= l; dy /= l; dz /= l;
    var close = 0;
    for (var t3 = 0; t3 < m; t3++) if (Math.abs(N[t3 * 3] * dx + N[t3 * 3 + 1] * dy + N[t3 * 3 + 2] * dz) >= 0.95) close += A[t3];
    return { d: [dx, dy, dz], area: close };
  }

  // split_lib.orient: oriented frame (u, v, n) from the mesh's own face normals, NOT the bbox.
  function orient(pos, index) {
    var V = toIfc(pos), F = index, m = Math.floor(F.length / 3);
    var na = triNormalsAreas(V, F, m), N = na.N, A = na.A;
    var tot = 0; for (var t = 0; t < m; t++) tot += A[t];
    var o = { V: V, F: F, m: m, N: N, A: A, total_area: tot };
    if (!(tot > 0)) { o.fail = 'F_NO_PLANE'; o.why = 'zero area'; return o; }
    var c = clusterDir(N, A, m, function (i) { return A[i] > 0; });
    o.dominant_frac = c ? c.area / tot : 0;
    if (!c || c.area / tot < DOMINANT_MIN) { o.fail = 'F_NO_PLANE'; o.why = 'dominant normal cluster ' + Math.round(o.dominant_frac * 100) + '% < 40%'; return o; }
    var n = c.d;
    var cu = clusterDir(N, A, m, function (i) { return A[i] > 0 && Math.abs(N[i * 3] * n[0] + N[i * 3 + 1] * n[1] + N[i * 3 + 2] * n[2]) < 0.05; });
    var u;
    if (cu) u = cu.d.slice();
    else {
      u = [0, n[2], -n[1]];                                   // n x [1,0,0]
      if (Math.hypot(u[0], u[1], u[2]) < 1e-6) u = [-n[2], 0, n[0]];   // n x [0,1,0]
      var ul = Math.hypot(u[0], u[1], u[2]); u = [u[0] / ul, u[1] / ul, u[2] / ul];
    }
    var un = u[0] * n[0] + u[1] * n[1] + u[2] * n[2];
    u = [u[0] - un * n[0], u[1] - un * n[1], u[2] - un * n[2]];
    var ul2 = Math.hypot(u[0], u[1], u[2]); u = [u[0] / ul2, u[1] / ul2, u[2] / ul2];
    var v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
    var nv = V.length / 3, P = new Float64Array(nv * 3);
    var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (var i = 0; i < nv; i++) {
      var X = V[i * 3], Y = V[i * 3 + 1], Z = V[i * 3 + 2];
      var p0 = X * u[0] + Y * u[1] + Z * u[2], p1 = X * v[0] + Y * v[1] + Z * v[2], p2 = X * n[0] + Y * n[1] + Z * n[2];
      P[i * 3] = p0; P[i * 3 + 1] = p1; P[i * 3 + 2] = p2;
      if (p0 < mn[0]) mn[0] = p0; if (p0 > mx[0]) mx[0] = p0;
      if (p1 < mn[1]) mn[1] = p1; if (p1 > mx[1]) mx[1] = p1;
      if (p2 < mn[2]) mn[2] = p2; if (p2 > mx[2]) mx[2] = p2;
    }
    var ext = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
    o.n = n; o.u = u; o.v = v; o.P = P; o.mn = mn; o.mx = mx; o.ext = ext;
    if (ext[2] > Math.min(ext[0], ext[1]) + 1e-9) { o.fail = 'F_NO_PLANE'; o.why = 'depth ' + ext[2].toFixed(3) + ' not the smallest extent'; }
    return o;
  }

  function triBoxes(o) {
    var m = o.m, F = o.F, P = o.P;
    var umin = new Float64Array(m), umax = new Float64Array(m), vmin = new Float64Array(m), vmax = new Float64Array(m), depthKey = new Array(m);
    for (var t = 0; t < m; t++) {
      var a = F[t * 3] * 3, b = F[t * 3 + 1] * 3, c = F[t * 3 + 2] * 3;
      umin[t] = Math.min(P[a], P[b], P[c]); umax[t] = Math.max(P[a], P[b], P[c]);
      vmin[t] = Math.min(P[a + 1], P[b + 1], P[c + 1]); vmax[t] = Math.max(P[a + 1], P[b + 1], P[c + 1]);
      depthKey[t] = rne((P[a + 2] + P[b + 2] + P[c + 2]) / 3 / DEPTH_Q);
    }
    return { umin: umin, umax: umax, vmin: vmin, vmax: vmax, depthKey: depthKey };
  }

  // split_lib._patches: group triangles by depth level, then by shared (u, v) vertex position.
  function patches(tris, o, depthKey) {
    var F = o.F, P = o.P, groups = new Map();
    for (var i = 0; i < tris.length; i++) { var t = tris[i], k = depthKey[t]; var g = groups.get(k); if (!g) groups.set(k, g = []); g.push(t); }
    var out = [];
    groups.forEach(function (ts, lvl) {
      var parent = new Map();
      var find = function (x) { if (!parent.has(x)) parent.set(x, x); while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
      var union = function (a, b) { var ra = find(a), rb = find(b); if (ra !== rb) parent.set(rb, ra); };
      var keys = new Array(ts.length);
      for (var j = 0; j < ts.length; j++) {
        var tt = ts[j], ks = [];
        for (var c = 0; c < 3; c++) { var vi = F[tt * 3 + c] * 3; ks.push(rne(P[vi] / POS_Q) + ',' + rne(P[vi + 1] / POS_Q)); }
        keys[j] = ks; union(ks[0], ks[1]); union(ks[0], ks[2]);
      }
      var comp = new Map();
      for (var j2 = 0; j2 < ts.length; j2++) { var r = find(keys[j2][0]); var l = comp.get(r); if (!l) comp.set(r, l = []); l.push(ts[j2]); }
      comp.forEach(function (l) { out.push({ lvl: lvl, tris: l }); });
    });
    return out;
  }

  function classifyWindow(pos, index) {
    var o = orient(pos, index);
    if (o.fail) return { verdict: o.fail, why: o.why, dominant: o.dominant_frac };
    var m = o.m, N = o.N, A = o.A, n = o.n, mn = o.mn, mx = o.mx;
    var boxA = o.ext[0] * o.ext[1];
    var bx = triBoxes(o);
    var cand = [];
    for (var t = 0; t < m; t++) {
      var along = Math.abs(N[t * 3] * n[0] + N[t * 3 + 1] * n[1] + N[t * 3 + 2] * n[2]) >= 0.95;
      var touches = bx.umin[t] <= mn[0] + EPS || bx.vmin[t] <= mn[1] + EPS || bx.umax[t] >= mx[0] - EPS || bx.vmax[t] >= mx[1] - EPS;
      if (along && !touches && A[t] > 0) cand.push(t);
    }
    var pp = patches(cand, o, bx.depthKey);
    var pane = new Uint8Array(m), levels = new Map(), pb = null, nOk = 0;
    for (var i = 0; i < pp.length; i++) {
      var ts = pp[i].tris, a = 0, pu0 = Infinity, pu1 = -Infinity, pv0 = Infinity, pv1 = -Infinity;
      for (var j = 0; j < ts.length; j++) {
        var q = ts[j]; a += A[q];
        if (bx.umin[q] < pu0) pu0 = bx.umin[q]; if (bx.umax[q] > pu1) pu1 = bx.umax[q];
        if (bx.vmin[q] < pv0) pv0 = bx.vmin[q]; if (bx.vmax[q] > pv1) pv1 = bx.vmax[q];
      }
      var side = Math.min(pu1 - pu0, pv1 - pv0), bb = (pu1 - pu0) * (pv1 - pv0);
      var sol = bb > 0 ? a / bb : 0;
      if (a >= PANE_MIN_AREA_FRAC * boxA && side >= PANE_MIN_SIDE && sol >= PANE_MIN_SOLIDITY) {
        for (var j2 = 0; j2 < ts.length; j2++) pane[ts[j2]] = 1;
        nOk++;
        levels.set(pp[i].lvl, (levels.get(pp[i].lvl) || 0) + a);
        pb = pb ? [Math.min(pb[0], pu0), Math.min(pb[1], pv0), Math.max(pb[2], pu1), Math.max(pb[3], pv1)] : [pu0, pv0, pu1, pv1];
      }
    }
    var res = { dominant: o.dominant_frac, paneLevels: levels.size };
    if (!nOk) { res.verdict = 'F_NO_PANE'; res.why = pp.length ? 'all candidate patches < 2%|B| or < 120mm side or hollow' : 'no inset triangle perpendicular to n'; return res; }
    var best = 0; levels.forEach(function (v) { if (v > best) best = v; });
    var cover = best / boxA; res.coverage = cover;
    var ft = [false, false, false, false], anyFrame = false;
    for (var t2 = 0; t2 < m; t2++) {
      if (pane[t2] || !(A[t2] > 0)) continue;
      anyFrame = true;
      if (bx.umin[t2] <= mn[0] + EPS) ft[0] = true; if (bx.vmin[t2] <= mn[1] + EPS) ft[1] = true;
      if (bx.umax[t2] >= mx[0] - EPS) ft[2] = true; if (bx.vmax[t2] >= mx[1] - EPS) ft[3] = true;
    }
    var inset = [pb[0] - mn[0], pb[1] - mn[1], mx[0] - pb[2], mx[1] - pb[3]];
    res.insetMm = inset.map(function (x) { return Math.round(x * 10000) / 10; });
    if (cover < COVER_MIN) { res.verdict = 'F_LOW_COVER'; res.why = 'best pane level covers ' + Math.round(cover * 100) + '% (< 50%)'; return res; }
    // BAND_MIN - 0.5 mm: a band authored at exactly 10 mm measures 0.00999 in float32 (split_lib.py note).
    if (Math.min.apply(null, inset) < BAND_MIN - 5e-4 || !(anyFrame && ft[0] && ft[1] && ft[2] && ft[3])) {
      res.verdict = 'F_NO_BAND'; res.why = 'band inset mm=' + res.insetMm.join('/') + ' frame touches all sides=' + (ft[0] && ft[1] && ft[2] && ft[3]); return res;
    }
    res.verdict = 'CLEAN'; res.flags = pane;
    var pa = 0; for (var t3 = 0; t3 < m; t3++) if (pane[t3]) pa += A[t3];
    res.paneAreaFrac = pa / o.total_area;
    return res;
  }

  // measure_doors.py: LEAF = largest solid along-n patch (edge contact allowed) >= 40 % of the elevation;
  // HARDWARE = position-merged components with longest side <= 350 mm and area <= 5 % of the door.
  function classifyDoor(pos, index) {
    var o = orient(pos, index);
    if (o.fail === 'F_NO_PLANE') return { verdict: 'NOT_SLAB', why: o.why };
    var m = o.m, N = o.N, A = o.A, n = o.n, P = o.P, F = o.F, tot = o.total_area;
    var boxA = o.ext[0] * o.ext[1];
    var bx = triBoxes(o), along = [];
    for (var t = 0; t < m; t++) if (A[t] > 0 && Math.abs(N[t * 3] * n[0] + N[t * 3 + 1] * n[1] + N[t * 3 + 2] * n[2]) >= 0.95) along.push(t);
    var pp = patches(along, o, bx.depthKey), bestA = 0, bestT = null;
    for (var i = 0; i < pp.length; i++) {
      var ts = pp[i].tris, a = 0, u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for (var j = 0; j < ts.length; j++) {
        var q = ts[j]; a += A[q];
        if (bx.umin[q] < u0) u0 = bx.umin[q]; if (bx.umax[q] > u1) u1 = bx.umax[q];
        if (bx.vmin[q] < v0) v0 = bx.vmin[q]; if (bx.vmax[q] > v1) v1 = bx.vmax[q];
      }
      var bb = (u1 - u0) * (v1 - v0), sol = bb > 0 ? a / bb : 0;
      if (sol >= 0.85 && a > bestA) { bestA = a; bestT = ts; }
    }
    var cover = bestA / boxA, leaf = bestT !== null && cover >= LEAF_COVER_MIN;
    // components by position-merged connectivity (3-D keys, 0.1 mm)
    var nv = P.length / 3, vid = new Int32Array(nv), keyId = new Map();
    for (var k = 0; k < nv; k++) {
      var key = rne(P[k * 3] / POS_Q) + ',' + rne(P[k * 3 + 1] / POS_Q) + ',' + rne(P[k * 3 + 2] / POS_Q);
      var id = keyId.get(key); if (id === undefined) { id = keyId.size; keyId.set(key, id); } vid[k] = id;
    }
    var parent = new Int32Array(keyId.size); for (var p = 0; p < parent.length; p++) parent[p] = p;
    var find = function (x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    for (var t2 = 0; t2 < m; t2++) {
      var ra = find(vid[F[t2 * 3]]), rb = find(vid[F[t2 * 3 + 1]]), rc = find(vid[F[t2 * 3 + 2]]);
      parent[rb] = ra; parent[rc] = ra;
    }
    var root = new Int32Array(m), comps = new Map();
    for (var t3 = 0; t3 < m; t3++) {
      var r = find(vid[F[t3 * 3]]); root[t3] = r;
      var c = comps.get(r);
      if (!c) comps.set(r, c = { area: 0, lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] });
      c.area += A[t3];
      for (var cc = 0; cc < 3; cc++) {
        var vi = F[t3 * 3 + cc] * 3;
        for (var ax = 0; ax < 3; ax++) { var val = P[vi + ax]; if (val < c.lo[ax]) c.lo[ax] = val; if (val > c.hi[ax]) c.hi[ax] = val; }
      }
    }
    var hw = new Set(), smallAny = false;
    comps.forEach(function (c, r) {
      var side = Math.max(c.hi[0] - c.lo[0], c.hi[1] - c.lo[1], c.hi[2] - c.lo[2]);
      if (side <= HW_MAX_SIDE) { smallAny = true; if (c.area <= HW_MAX_AREA_FRAC * tot) hw.add(r); }
    });
    var hwInLeaf = false;
    if (leaf) for (var b = 0; b < bestT.length; b++) if (hw.has(root[bestT[b]])) { hwInLeaf = true; break; }
    var res = { leafCover: cover, components: comps.size, hardwareComps: hw.size };
    if (leaf && hw.size && !hwInLeaf) {
      res.verdict = 'SEPARABLE';
      var flags = new Uint8Array(m), hwA = 0;
      for (var t4 = 0; t4 < m; t4++) { if (hw.has(root[t4])) hwA += A[t4]; else flags[t4] = 1; }
      res.flags = flags; res.hardwareAreaFrac = hwA / tot;
    } else if (leaf && !smallAny) res.verdict = 'LEAF_NO_HW';
    else if (!leaf) res.verdict = 'NO_LEAF';
    else res.verdict = 'HW_WELDED';
    return res;
  }

  var API = { classifyWindow: classifyWindow, classifyDoor: classifyDoor, orient: orient, rne: rne,
    K: { EPS: EPS, DEPTH_Q: DEPTH_Q, POS_Q: POS_Q, PANE_MIN_AREA_FRAC: PANE_MIN_AREA_FRAC, PANE_MIN_SIDE: PANE_MIN_SIDE,
      PANE_MIN_SOLIDITY: PANE_MIN_SOLIDITY, COVER_MIN: COVER_MIN, BAND_MIN: BAND_MIN, DOMINANT_MIN: DOMINANT_MIN,
      HW_MAX_SIDE: HW_MAX_SIDE, HW_MAX_AREA_FRAC: HW_MAX_AREA_FRAC, LEAF_COVER_MIN: LEAF_COVER_MIN } };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (global) global.SurfaceR10 = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
