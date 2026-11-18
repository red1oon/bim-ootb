// Copyright (c) 2025-2026 Redhuan D. Oon
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — gusset_pack.js: the LOD Upgrade pack "Bracing gussets" (gusset plate welded to the support, angle brace bolted to it). Read the §LODUP_* log after every run; the exit code is not evidence.
// Implementing prompts/MODELLER_LOD_UPGRADE_PILL.md §4 P5 ("P5 SPEC") — Witness: W-LODUP-GUSSETS (modeller/tests/witness_lodup_gussets.js).
// Issue proved/disproved: "the browser result differs from the proven Python result" (private oracle: the gusset generator for the STEEL_SKEW brace ends the joint survey finds; spec text BIMCompiler
// prompts/LOD400_DEFAULT_RULES_SCOPE.md sections 8, 8.1). Same maths, same order, no clock, no random; every loop over a fixed order.
// REUSES joint_pack.js (the survey, the true-box index, the meshes with the triangle grid, the ray / ray-parity primitives, the eigenframe): LodJointPack.kit. Nothing of those is copied here.
// INPUT / RULES / OPTS / OUTPUT: as joint_pack.js (inp.meta, inp.mesh(), inp.boxes(), inp.src; rule rows lod/rules/gusset_defaults.json; opts {noClash, log}; {parts, changes, stats, audit}).
// A gusset part is attached to its brace, not an aggregate child of it (element_parts would hide the brace on reload): parents = [], attach = [brace].
// The eccentricity (the brace gravity axis against the support axis, AISC 360-16 J1.1) is MEASURED and REPORTED per end, never corrected. Configuration only, capacity not checked.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./joint_pack.js'));
  else root.LodGussetPack = factory(root.LodJointPack);
})(typeof self !== 'undefined' ? self : this, function (JP) {
  'use strict';
  if (!JP || !JP.kit) throw new Error('§LODUP_GUSSET gusset_pack.js needs joint_pack.js loaded first (lod/packs.json lists joints before gussets)');
  var K = JP.kit, sub = K.sub, add = K.add, mul = K.mul, dot = K.dot, cross = K.cross, norm = K.norm, unit = K.unit, fx = K.fx, fmtG = K.fmtG, median = K.median, rayFirst = K.rayFirst, nowMs = K.nowMs;
  var RGBA = { PL: '0.55,0.57,0.60,1', BT: '0.32,0.33,0.36,1', WD: '0.40,0.34,0.30,1' }, CLS = { PL: 'IfcPlate', BT: 'IfcMechanicalFastener', WD: 'IfcFastener' }, LABEL = K.LABEL;
  var PREFIX_SKIP = ['GEN-LY-', 'GEN-RB-', 'GEN-GU-'];   // duplicates of their hosts (layers, rebar) and this pack's own earlier output (tested as generated parts instead)
  function tname(n) { return String(n || '').replace(/:\d+$/, '').split(':').pop(); }
  function startsAny(g, ps) { for (var i = 0; i < ps.length; i++) if (g.indexOf(ps[i]) === 0) return true; return false; }
  function roundHalfEven(x) { var f = Math.floor(x), d = x - f; if (d < 0.5) return f; if (d > 0.5) return f + 1; return f % 2 === 0 ? f : f + 1; }
  function ptp(a) { var lo = Infinity, hi = -Infinity; for (var i = 0; i < a.length; i++) { if (a[i] < lo) lo = a[i]; if (a[i] > hi) hi = a[i]; } return hi - lo; }

  // ---- the local frame of one end: (a along the brace axis, l along the leg, h along the leg normal), mm, origin = the brace gravity axis at the end cap
  function Frame(O, ua, lg, ng) {
    this.O = O; this.ua = ua; this.lg = lg; this.ng = ng;
  }
  Frame.prototype.loc = function (A) {
    var o = new Float64Array(A.length), O = this.O, ua = this.ua, lg = this.lg, ng = this.ng;
    for (var q = 0; q < A.length; q += 3) { var x = A[q] - O[0], y = A[q + 1] - O[1], z = A[q + 2] - O[2]; o[q] = (x * ua[0] + y * ua[1] + z * ua[2]) * 1000; o[q + 1] = (x * lg[0] + y * lg[1] + z * lg[2]) * 1000; o[q + 2] = (x * ng[0] + y * ng[1] + z * ng[2]) * 1000; }
    return o;
  };
  Frame.prototype.wld = function (L) { var O = this.O, ua = this.ua, lg = this.lg, ng = this.ng; return [O[0] + (L[0] * ua[0] + L[1] * lg[0] + L[2] * ng[0]) / 1000, O[1] + (L[0] * ua[1] + L[1] * lg[1] + L[2] * ng[1]) / 1000, O[2] + (L[0] * ua[2] + L[1] * lg[2] + L[2] * ng[2]) / 1000]; };

  // ---- convex solids (faces oriented outward) + the exact separating-axis test against triangles
  function Convex(V, faces) {
    var n = V.length, c = [0, 0, 0], i, k;
    for (i = 0; i < n; i++) { c[0] += V[i][0]; c[1] += V[i][1]; c[2] += V[i][2]; } c = [c[0] / n, c[1] / n, c[2] / n];
    this.V = V; this.faces = [];
    for (i = 0; i < faces.length; i++) {
      var f = faces[i], nn = cross(sub(V[f[1]], V[f[0]]), sub(V[f[2]], V[f[0]])), fm = [0, 0, 0];
      f.forEach(function (q) { fm = add(fm, V[q]); }); fm = mul(fm, 1 / f.length);
      if (dot(nn, sub(fm, c)) < 0) f = f.slice().reverse();
      this.faces.push(f);
    }
    var N = [], E = [], seen = {}, self = this;
    this.faces.forEach(function (f) {
      var nn = cross(sub(V[f[1]], V[f[0]]), sub(V[f[2]], V[f[0]])), L = norm(nn); if (L > 1e-9) N.push(mul(nn, 1 / L));
      for (var q = 0; q < f.length; q++) {
        var d = sub(V[f[(q + 1) % f.length]], V[f[q]]), Ld = norm(d); if (!(Ld > 1e-9)) continue; d = mul(d, 1 / Ld);
        var s = 0; for (var a = 0; a < 3; a++) if (Math.abs(d[a]) > 1e-9) { s = d[a] > 0 ? 1 : -1; break; }
        var kk = d.map(function (x) { return Math.round(x * s * 1e9); }).join(','); if (seen[kk]) continue; seen[kk] = 1; E.push(d);   // parallel edge directions give the same axis: one of each
      }
    });
    this.N = N; this.E = E; this.lo = [Infinity, Infinity, Infinity]; this.hi = [-Infinity, -Infinity, -Infinity];
    for (i = 0; i < n; i++) for (k = 0; k < 3; k++) { if (V[i][k] < this.lo[k]) this.lo[k] = V[i][k]; if (V[i][k] > this.hi[k]) this.hi[k] = V[i][k]; }
    this.projN = N.map(function (ax) { return self.proj(ax); });
  }
  Convex.prototype.proj = function (ax) { var mn = Infinity, mx = -Infinity; for (var i = 0; i < this.V.length; i++) { var p = dot(this.V[i], ax); if (p < mn) mn = p; if (p > mx) mx = p; } return [mn, mx]; };
  Convex.prototype.tris = function () { var out = [], V = this.V; this.faces.forEach(function (f) { for (var k = 1; k < f.length - 1; k++) out.push([V[f[0]], V[f[k]], V[f[k + 1]]]); }); return out; };
  function prism(poly, h0, h1) {   // polygon [[a,l],...] extruded along h
    var n = poly.length, V = [], i, faces = [[], []];
    poly.forEach(function (p) { V.push([p[0], p[1], h0]); }); poly.forEach(function (p) { V.push([p[0], p[1], h1]); });
    for (i = 0; i < n; i++) { faces[0].push(i); faces[1].push(n + i); }
    for (i = 0; i < n; i++) faces.push([i, (i + 1) % n, n + (i + 1) % n, n + i]);
    return new Convex(V, faces);
  }
  function ngon(a, l, r, n, h0, h1) { var p = [], k; for (k = 0; k < n; k++) p.push([a + r * Math.cos(2 * Math.PI * k / n + Math.PI / n), l + r * Math.sin(2 * Math.PI * k / n + Math.PI / n)]); return prism(p, h0, h1); }
  function bead(p0, p1, ub, uw, w) {   // triangular prism along p0->p1; cross-section P, P+w*ub, P+w*uw
    return new Convex([p0, add(p0, mul(ub, w)), add(p0, mul(uw, w)), p1, add(p1, mul(ub, w)), add(p1, mul(uw, w))], [[0, 1, 2], [3, 4, 5], [0, 1, 4, 3], [1, 2, 5, 4], [0, 2, 5, 3]]);
  }
  // do the triangles Lt (flat, local mm) overlap the convex solid C (penetration > EPS on every axis)?
  function satHit(Lt, C, EPS) {
    var lo = C.lo, hi = C.hi, n = Lt.length / 9, t, a, i, j, k;
    for (t = 0; t < n; t++) {
      var o = 9 * t, ok = true;
      for (a = 0; a < 3 && ok; a++) { var p = Lt[o + a], q = Lt[o + 3 + a], r = Lt[o + 6 + a]; if (!(Math.max(p, q, r) >= lo[a] && Math.min(p, q, r) <= hi[a])) ok = false; }
      if (!ok) continue;
      var v0 = [Lt[o], Lt[o + 1], Lt[o + 2]], v1 = [Lt[o + 3], Lt[o + 4], Lt[o + 5]], v2 = [Lt[o + 6], Lt[o + 7], Lt[o + 8]], sep = false;
      var test = function (ax, cp, valid) { var p0 = dot(v0, ax), p1 = dot(v1, ax), p2 = dot(v2, ax), pmn = Math.min(p0, p1, p2), pmx = Math.max(p0, p1, p2), c = cp || C.proj(ax); return valid && (pmx <= c[0] + EPS || pmn >= c[1] - EPS); };
      for (i = 0; i < C.N.length && !sep; i++) sep = test(C.N[i], C.projN[i], true);
      if (sep) continue;
      var e = [sub(v1, v0), sub(v2, v1), sub(v0, v2)], tn = cross(e[0], e[1]), tl = norm(tn);
      if (tl > 1e-12) { sep = test(mul(tn, 1 / tl), null, true); if (sep) continue; }
      for (j = 0; j < 3 && !sep; j++) for (k = 0; k < C.E.length && !sep; k++) { var ax2 = cross(e[j], C.E[k]), L2 = norm(ax2); if (L2 > 1e-9) sep = test(mul(ax2, 1 / L2), null, true); }
      if (!sep) return true;
    }
    return false;
  }
  function flatten(trisList) { var o = new Float64Array(trisList.length * 9), q = 0; trisList.forEach(function (t3) { for (var m = 0; m < 3; m++) { o[q++] = t3[m][0]; o[q++] = t3[m][1]; o[q++] = t3[m][2]; } }); return o; }
  function bboxOf(A) { var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (var q = 0; q < A.length; q += 3) for (var a = 0; a < 3; a++) { if (A[q + a] < lo[a]) lo[a] = A[q + a]; if (A[q + a] > hi[a]) hi[a] = A[q + a]; } return [lo, hi]; }

  // ---- ONE end. Returns {result, ...}; every refusal carries its reason. Same order of decisions as the oracle.
  function nrm0s(nv) { return '[' + nv[0].toFixed(2) + ',' + nv[1].toFixed(2) + ']'; }
  function genEnd(cx, j, G, opts, K2) {
    var rv = cx.rv, M = cx.meshes, meta = cx.meta, idx = K.indexOf(cx.inp), i, k, a;
    var d_b = rv('bolt_diameter_mm'), pitch = rv('bolt_pitch_mm'), e_used = rv('edge_used_mm'), e_min = rv('edge_min_mm'), hole = rv('hole_diameter_mm'), n_bolts = rv('bolts_min'), tg_min = rv('gusset_min_thickness_mm'), wr = rv('washer_od_mm') / 2;
    var wt = rv('washer_t_mm'), hh = rv('bolt_head_h_mm'), nh = rv('nut_h_mm'), FILL_MAX = rv('filler_max_mm'), PLANE_TOL = rv('plane_tol_deg'), REACH = rv('support_reach_mm'), FLG_FRAC = rv('flange_interval_max_fraction');
    var CTOL = rv('contact_tol_mm'), PTOL = rv('planar_tol_mm'), LAPMIN = rv('lap_min_mm'), LAPF = rv('lap_t_factor'), CT = rv('clash_tolerance_mm'), PARITY = rv('parity_max_triangles'), TABLE = JP.weldTable(rv('weld_min_table_mm'));
    var CAP_TOL = rv('end_cap_tol_mm') / 1000, CAP_MIN = rv('end_cap_min_triangles'), LEG_EDGE = rv('leg_edge_min_mm') / 1000, WINDOW = rv('support_window_m'), NRM_MIN = rv('contact_normal_min'), EPS = rv('clash_sat_eps_mm'), PROBE = rv('flange_probe_height_mm');
    var g = j.guid, endc = j.end > 0 ? 'B' : 'A', Ep = j.end_point, fail = function (res, why, extra) { return Object.assign({ result: res, why: why }, extra || {}); };
    if (!meta[g] || !meta[j.support] || !M.get(g) || !M.get(j.support)) return fail('NOT_IN_MODEL', 'brace or support not in the model');
    var V = M.get(g).V, T = M.soup(g), nTri = T.length / 9, fr = JP.frameOf(V), c = fr.c, ua = fr.U[2];
    if (dot(sub(Ep, c), ua) < 0) ua = mul(ua, -1);
    var Vs = M.get(j.support).V, frs = JP.frameOf(Vs), cs = frs.c, us = frs.U[2], oth = [frs.U[0], frs.U[1]], ud = Math.abs(oth[0][2]) > Math.abs(oth[1][2]) ? oth[0] : oth[1], pr = [];
    for (i = 0; i < Vs.length; i += 3) pr.push(Vs[i] * ud[0] + Vs[i + 1] * ud[1] + Vs[i + 2] * ud[2]); var D_sup = ptp(pr) * 1000;
    // ---- brace section: the end cap (every triangle lying in the end plane); its area centroid = the brace's gravity axis (AISC J1.1)
    var cap = [], ar = [], arSum = 0, gc = [0, 0, 0];
    for (i = 0; i < nTri; i++) {
      var o = 9 * i, okc = true;
      for (k = 0; k < 3 && okc; k++) if (!(Math.abs((T[o + 3 * k] - Ep[0]) * ua[0] + (T[o + 3 * k + 1] - Ep[1]) * ua[1] + (T[o + 3 * k + 2] - Ep[2]) * ua[2]) < CAP_TOL)) okc = false;
      if (okc) cap.push(i);
    }
    if (cap.length < CAP_MIN) return fail('NO_SECTION', 'end cap unreadable (' + cap.length + ' triangles)');
    var P3 = function (t, kk) { return [T[9 * t + 3 * kk], T[9 * t + 3 * kk + 1], T[9 * t + 3 * kk + 2]]; };
    cap.forEach(function (t) { var p0 = P3(t, 0), p1 = P3(t, 1), p2 = P3(t, 2), A = norm(cross(sub(p1, p0), sub(p2, p0))) / 2, m = [(p0[0] + p1[0] + p2[0]) / 3, (p0[1] + p1[1] + p2[1]) / 3, (p0[2] + p1[2] + p2[2]) / 3]; ar.push(A); arSum += A; gc = add(gc, mul(m, A)); });
    var gcen = mul(gc, 1 / arSum), cax = cross(ua, us), ecc = Math.abs(dot(sub(cs, gcen), cax)) / norm(cax) * 1000;
    var e1 = unit(cross(ua, [0, 0, 1])), e2 = cross(ua, e1), zr = 0, zi = 0, ecount = new Map(), edges = new Map(), keyOf = function (p) { return roundHalfEven(p[0] * 1e4) + ',' + roundHalfEven(p[1] * 1e4) + ',' + roundHalfEven(p[2] * 1e4); };
    cap.forEach(function (t) {   // boundary edges of the end cap only (triangulation diagonals would bias the leg angle)
      [[0, 1], [1, 2], [2, 0]].forEach(function (ab) {
        var pa = P3(t, ab[0]), pb = P3(t, ab[1]), ka = keyOf(pa), kb = keyOf(pb), kk = ka < kb ? ka + '|' + kb : kb + '|' + ka;
        ecount.set(kk, (ecount.get(kk) || 0) + 1); edges.set(kk, [pa, pb]);
      });
    });
    ecount.forEach(function (n, kk) { if (n === 1) { var d = sub(edges.get(kk)[1], edges.get(kk)[0]), L = norm(d); if (L > LEG_EDGE) { var ang = Math.atan2(dot(d, e2), dot(d, e1)); zr += L * Math.cos(4 * ang); zi += L * Math.sin(4 * ang); } } });
    var th = Math.atan2(zi, zr) / 4, lgs = [0, 1].map(function (kk) { return add(mul(e1, Math.cos(th + kk * Math.PI / 2)), mul(e2, Math.sin(th + kk * Math.PI / 2))); }), npl = mul(cax, 1 / norm(cax));
    var dev = lgs.map(function (l) { return Math.asin(Math.min(1, Math.abs(dot(l, npl)))) * 180 / Math.PI; }), iq = dev[1] < dev[0] ? 1 : 0;
    if (!(dev[iq] <= PLANE_TOL && dev[1 - iq] > PLANE_TOL)) return fail('AMBIGUOUS_PLANE', 'neither leg lies in the brace-support plane within ' + fx(PLANE_TOL, 0) + ' deg', { dev: dev.map(function (x) { return Number(x.toFixed(1)); }), ecc: ecc });
    var lg = lgs[iq], ng = unit(cross(ua, lg)), hv = [], lv = [], mn;
    var fillHL = function () { hv = []; lv = []; cap.forEach(function (t) { for (var kk = 0; kk < 3; kk++) { var q = sub(P3(t, kk), gcen); hv.push(dot(q, ng) * 1000); lv.push(dot(q, lg) * 1000); } }); }; fillHL();
    var hmax = Math.max.apply(null, hv), hmin = Math.min.apply(null, hv), ext = { 1: hmax, '-1': hmin };
    var spanl = function (sg) { var s = []; for (var q = 0; q < hv.length; q++) if (Math.abs(hv[q] - ext[sg]) < 0.4) s.push(lv[q]); return ptp(s); };
    if (!(spanl(1) > spanl(-1))) { lg = mul(lg, -1); ng = unit(cross(ua, lg)); fillHL(); }   // the h extreme along which the in-plane leg runs its full length = its outer (heel) face
    var H0 = Math.max.apply(null, hv), hmin2 = Math.min.apply(null, hv), l0 = Math.min.apply(null, lv), l1 = Math.max.apply(null, lv), lh = [];
    for (i = 0; i < hv.length; i++) if (Math.abs(hv[i] - hmin2) < 0.4) lh.push(lv[i]);
    var l_heel = lh.reduce(function (s, x) { return s + x; }, 0) / lh.length, l_toe = Math.abs(l1 - l_heel) > Math.abs(l0 - l_heel) ? l1 : l0, leg_len = l1 - l0, lb = (l0 + l1) / 2, xs = [];
    ecount.forEach(function (n, kk) {   // leg thickness: the end-cap boundary crossed by the line l = leg mid-length
      if (n !== 1) return; var pa = edges.get(kk)[0], pb = edges.get(kk)[1], qa = [dot(sub(pa, gcen), lg) * 1000, dot(sub(pa, gcen), ng) * 1000], qb = [dot(sub(pb, gcen), lg) * 1000, dot(sub(pb, gcen), ng) * 1000];
      if ((qa[0] - lb) * (qb[0] - lb) < 0) xs.push(qa[1] + (lb - qa[0]) / (qb[0] - qa[0]) * (qb[1] - qa[1]));
    });
    xs.sort(function (p, q) { return q - p; });
    if (xs.length < 2 || Math.abs(xs[0] - H0) > 0.5) return fail('NO_SECTION', 'leg thickness not measurable from the end cap', { ecc: ecc });
    var t_leg = xs[0] - xs[1], FR = new Frame(gcen, ua, lg, ng), a_end = dot(sub(Ep, gcen), ua) * 1000, tg = Math.max(t_leg, tg_min), nominal = /L(\d+)x(\d+)x([\d.]+)/.exec(j.name || '');
    // ---- support triangles in the local frame (anything within the window of the end)
    var Ss = M.soup(j.support), win = [];
    for (i = 0; i + 8 < Ss.length; i += 9) { var okw = true; for (a = 0; a < 3; a++) if (!(Math.abs((Ss[i + a] + Ss[i + 3 + a] + Ss[i + 6 + a]) / 3 - Ep[a]) < WINDOW)) { okw = false; break; } if (okw) for (a = 0; a < 9; a++) win.push(Ss[i + a]); }
    var Ls = FR.loc(Float64Array.from(win)), nLs = Ls.length / 9;
    if (!nLs) return fail('NO_ATTACHMENT', 'no support triangles near the brace end', { ecc: ecc });
    var sliceCache = {};
    var sliceSegments = function (Hs) {
      var key = String(Hs); if (sliceCache[key]) return sliceCache[key]; var segs = [], tt, kk;
      for (tt = 0; tt < nLs; tt++) {
        var o3 = 9 * tt, d3 = [Ls[o3 + 2] - Hs, Ls[o3 + 5] - Hs, Ls[o3 + 8] - Hs].map(function (x) { return x === 0 ? 1e-6 : x; }), pts = [], flc = 0, pairs = [[0, 1], [1, 2], [2, 0]];
        for (kk = 0; kk < 3; kk++) { var ii = pairs[kk][0], jj = pairs[kk][1]; if (d3[ii] * d3[jj] < 0) { var f = d3[ii] / (d3[ii] - d3[jj]); pts.push([Ls[o3 + 3 * ii] + (Ls[o3 + 3 * jj] - Ls[o3 + 3 * ii]) * f, Ls[o3 + 3 * ii + 1] + (Ls[o3 + 3 * jj + 1] - Ls[o3 + 3 * ii + 1]) * f]); flc++; } }
        if (flc === 2) segs.push([pts[0], pts[1]]);
      }
      return (sliceCache[key] = segs);
    };
    var entry = function (segs, l_line) {   // the first support face crossed along a at lateral position l_line: {a, v}
      var best = null;
      segs.forEach(function (pq) { var p = pq[0], q = pq[1]; if ((p[1] - l_line) * (q[1] - l_line) <= 0 && p[1] !== q[1]) { var a_x = p[0] + (l_line - p[1]) / (q[1] - p[1]) * (q[0] - p[0]); if (a_x > -1500 && (best === null || a_x < best.a)) best = { a: a_x, v: [q[0] - p[0], q[1] - p[1]] }; } });
      return best;
    };
    var nrmOf = function (v) { var vn = Math.hypot(v[0], v[1]), v0 = v[0] / vn, v1 = v[1] / vn, n0 = v1, n1 = -v0; return n0 < 0 ? [n0, n1, v0, v1] : [-n0, -n1, v0, v1]; };
    // ---- step 1: which support face does the leg plane meet? slice at the leg's own mid-plane
    var Hm = H0 - t_leg / 2, ent = entry(sliceSegments(Hm), lb);
    if (ent === null || Math.abs(ent.a - a_end) > REACH) return fail('NO_ATTACHMENT', 'leg plane meets no support face within ' + fmtG(REACH) + ' mm of the brace end' + (ent === null ? '' : ' (nearest ' + fx(ent.a - a_end, 0) + ')'), { ecc: ecc });
    var nv = nrmOf(ent.v);
    if (Math.abs(nv[0]) < NRM_MIN) return fail('NO_ATTACHMENT', 'contact face nearly parallel to the brace axis', { ecc: ecc });
    var Pin = [ent.a - nv[0] * 1.0, lb - nv[1] * 1.0, Hm], th_up = rayFirst(Pin, [0, 0, 1], Ls), th_dn = rayFirst(Pin, [0, 0, -1], Ls), interval = (th_up !== null && th_dn !== null) ? th_up + th_dn : null;
    var is_flange = interval !== null && interval <= FLG_FRAC * D_sup, box = /BOX|HSS/i.test(j.support_name || ''), atype, Hf = 0, tf = 0, Hs;
    if (is_flange) { Hf = Hm + th_up; tf = interval; atype = 'flange lap'; Hs = Hf - tf / 2; } else { atype = box ? 'box wall T' : 'web T'; Hs = H0 + tg / 2; }
    if (opts.trace) opts.trace('§LODUP_GUSSET_TRACE ' + g.slice(0, 6) + endc + ' atype=' + atype + ' H0=' + fx(H0, 1) + ' t_leg=' + fx(t_leg, 1) + ' Hm=' + fx(Hm, 1) + ' Hs=' + fx(Hs, 1) + ' interval=' + interval + ' D=' + fx(D_sup, 0) + ' a_end=' + fx(a_end, 0) + ' lb=' + fx(lb, 0) + ' ent.a=' + fx(ent.a, 1) + ' nrm=' + nrm0s(nv) + ' nLs=' + nLs + ' segsHs=' + sliceSegments(Hs).length);
    var ent2 = entry(sliceSegments(Hs), lb); if (ent2 === null) return fail('NO_ATTACHMENT', atype + ': contact slice found no face', { ecc: ecc });
    var a_e = ent2.a, nv2 = nrmOf(ent2.v), nrm = [nv2[0], nv2[1]], vx = nv2[2], vy = nv2[3];
    if (Math.abs(nrm[0]) < NRM_MIN || Math.abs(vy) < 1e-3) return fail('NO_ATTACHMENT', 'contact face nearly parallel to the brace axis', { ecc: ecc });
    var a_of = function (l) { return a_e + (l - lb) * vx / vy; }, bad_planar = 0;
    [lb - e_used, lb + e_used].forEach(function (l_chk) { var e_ = entry(sliceSegments(Hs), l_chk); bad_planar = Math.max(bad_planar, e_ === null ? 1e9 : Math.abs(e_.a - a_of(l_chk))); });
    if (bad_planar > PTOL) return fail('NO_ATTACHMENT', atype + ': contact face not straight across the gusset width (dev ' + fx(bad_planar, 1) + ' mm)', { ecc: ecc });
    // ---- support wall measured at the contact
    var t_sup;
    if (is_flange) t_sup = tf; else {
      var tw_ = rayFirst([a_e - nrm[0] * 0.3, lb - nrm[1] * 0.3, Hs], [-nrm[0], -nrm[1], 0], Ls);
      if (tw_ === null) return fail('NO_ATTACHMENT', atype + ': wall thickness not measurable', { ecc: ecc });
      t_sup = tw_ + 0.3; if (t_sup > rv('support_wall_max_mm')) return fail('NO_ATTACHMENT', atype + ': wall ' + fx(t_sup, 0) + ' mm is not a plate', { ecc: ecc });
    }
    // ---- gusset height and filler (section 8.1 rule 2)
    var lap = is_flange ? Math.max(LAPF * Math.min(tg, t_sup), LAPMIN) : 0, Hg, gap;
    if (is_flange) {
      Hg = null;   // the gusset bottom rests on the flange face (highest first hit over the lap)
      [lb - e_used, lb + e_used].forEach(function (l_s) { [1.0, lap].forEach(function (dd) { var th2 = rayFirst([a_of(l_s) + (-nrm[0]) * dd, l_s + (-nrm[1]) * dd, Hf + PROBE], [0, 0, -1], Ls); if (th2 !== null) Hg = Hg !== null ? Math.max(Hg, Hf + PROBE - th2) : Hf + PROBE - th2; }); });
      if (Hg === null) return fail('NO_ATTACHMENT', 'flange top face not found over the lap', { ecc: ecc });
      gap = Hg - H0;   // > 0: filler between leg and gusset; < 0: the gusset sits lower than the leg face and enters the author's angle
    } else { Hg = H0; gap = 0; }
    var filler = Math.max(gap, 0), overlap = Math.max(-gap, 0);
    if (filler > FILL_MAX) return fail('GAP_TOO_LARGE', 'filler ' + fx(filler, 1) + ' mm over ' + fmtG(FILL_MAX), { filler: Number(filler.toFixed(1)), atype: atype, ecc: ecc });
    if (overlap > tg) return fail('LEG_OVERLAP', 'gusset enters the angle by ' + fx(overlap, 1) + ' mm, more than its thickness', { overlap: Number(overlap.toFixed(1)), atype: atype, ecc: ecc });
    // ---- layout in the plane
    var d_first = e_used / (-nrm[0]), a1 = a_e - d_first, a_bolts = [], kb; for (kb = 0; kb < n_bolts; kb++) a_bolts.push(a1 - kb * pitch);
    var a_far = a_bolts[a_bolts.length - 1] - e_used;
    if (a1 > a_end - e_min) return fail('NO_ROOM', 'first bolt at a=' + fx(a1, 0) + ' is within ' + fmtG(e_min) + ' mm of the angle end (a=' + fx(a_end, 0) + ')', { ecc: ecc });
    var Pc1 = [a_of(lb - e_used), lb - e_used], Pc2 = [a_of(lb + e_used), lb + e_used], F1 = [a_far, lb - e_used], F2 = [a_far, lb + e_used], Pl1 = null, Pl2 = null, poly;
    if (is_flange) { Pl1 = [Pc1[0] - nrm[0] * lap, Pc1[1] - nrm[1] * lap]; Pl2 = [Pc2[0] - nrm[0] * lap, Pc2[1] - nrm[1] * lap]; poly = [F1, F2, Pc2, Pl2, Pl1, Pc1]; } else poly = [F1, F2, Pc2, Pc1];
    var cc = [0, 0]; poly.forEach(function (p) { cc[0] += p[0]; cc[1] += p[1]; }); cc = [cc[0] / poly.length, cc[1] / poly.length];
    poly = poly.map(function (p, ix) { return [Math.atan2(p[1] - cc[1], p[0] - cc[0]), ix, p]; }).sort(function (p, q) { return (p[0] - q[0]) || (p[1] - q[1]); }).map(function (x) { return x[2]; });
    var plate = prism(poly, Hg, Hg + tg), Hin = H0 - t_leg, Htop = Hg + tg, bolts = [];
    a_bolts.forEach(function (ab) {   // head + washer on the gusset outer face, nut + washer under the leg inner face (outstanding-leg side)
      bolts.push(ngon(ab, lb, wr, 16, Htop, Htop + wt), ngon(ab, lb, rv('bolt_head_af_mm') / Math.sqrt(3), 6, Htop + wt, Htop + wt + hh), ngon(ab, lb, d_b / 2, 12, Hin - wt - nh - 5, Htop + wt), ngon(ab, lb, wr, 16, Hin - wt, Hin), ngon(ab, lb, rv('nut_af_mm') / Math.sqrt(3), 6, Hin - wt - nh, Hin - wt));
    });
    var wl = JP.weldMin(TABLE, Math.min(tg, t_sup)), beads = [];
    if (wl === null) return fail('NO_ATTACHMENT', 'no row of the weld table covers a thinner part of ' + fx(Math.min(tg, t_sup), 2) + ' mm', { ecc: ecc });
    if (!is_flange) { var ub = [nrm[0], nrm[1], 0]; [[Hg + tg, 1], [Hg, -1]].forEach(function (hs) { beads.push(bead([Pc1[0], Pc1[1], hs[0]], [Pc2[0], Pc2[1], hs[0]], ub, [0, 0, hs[1]], wl)); }); }
    else [[Pc1, Pl1], [Pc2, Pl2]].forEach(function (pp) {   // the two lateral edges of the lapped part, on the flange face; the bead lies outside the plate side
      var Pa = pp[0], Pb = pp[1], ev = [Pb[0] - Pa[0], Pb[1] - Pa[1]], el = Math.hypot(ev[0], ev[1]), lat; ev = [ev[0] / el, ev[1] / el]; lat = [-ev[1], ev[0]];
      if (lat[0] * (cc[0] - Pa[0]) + lat[1] * (cc[1] - Pa[1]) > 0) lat = [-lat[0], -lat[1]];
      beads.push(bead([Pa[0], Pa[1], Hg], [Pb[0], Pb[1], Hg], [lat[0], lat[1], 0], [0, 0, 1], wl));
    });
    var parts = [['plate', plate]].concat(bolts.map(function (b) { return ['bolt', b]; })).concat(beads.map(function (b) { return ['weld', b]; }));
    // ---- CLEAR against every neighbour (true meshes); the brace is exempt (bolted angle), the support only where welded
    var allW = []; parts.forEach(function (pt) { pt[1].V.forEach(function (v) { var w = FR.wld(v); allW.push(w[0], w[1], w[2]); }); }); var bb = bboxOf(allW), qlo = bb[0].map(function (x) { return x - 0.02; }), qhi = bb[1].map(function (x) { return x + 0.02; });
    var nbl = idx.query(qlo, qhi).filter(function (x) { return x !== g && !startsAny(x, PREFIX_SKIP); }), genNb = Object.keys(G).filter(function (x) { var b = G[x].box; return b[0][0] <= qhi[0] && b[0][1] <= qhi[1] && b[0][2] <= qhi[2] && b[1][0] >= qlo[0] && b[1][1] >= qlo[1] && b[1][2] >= qlo[2]; }).sort();
    nbl = nbl.concat(genNb); if (nbl.indexOf(j.support) < 0) nbl.push(j.support);
    var plate_core = plate;
    if (!is_flange) { var pc = poly.map(function (p) { return (p === Pc1 || p === Pc2) ? [p[0] + nrm[0] * CT, p[1] + nrm[1] * CT] : p; }); plate_core = prism(pc, Hg, Hg + tg); }
    var hits = [], skipped = [], pre = bb[0].map(function (x) { return x - 0.1; }), prh = bb[1].map(function (x) { return x + 0.1; });
    nbl.forEach(function (gn) {
      var isGen = !!G[gn], nTg = isGen ? G[gn].tris.length / 9 : M.ntri(gn); if (!nTg) return;
      var sel = isGen ? K.trisInBox(G[gn].tris, pre, prh) : M.trisIn(gn, pre, prh), Lt = sel ? FR.loc(sel) : new Float64Array(0), lb_ = null;
      var localBounds = function () { if (lb_) return lb_; var Q = isGen ? G[gn].tris : (nTg > PARITY ? M.get(gn).V : M.soup(gn)); return (lb_ = bboxOf(FR.loc(Q))); };
      parts.forEach(function (pt) {
        var nm = pt[0], C = pt[1];
        if (gn === j.support) { if (nm === 'weld') return; if (nm === 'plate') { if (is_flange) return; C = plate_core; } }
        if (Lt.length && satHit(Lt, C, EPS)) { hits.push([nm, gn]); return; }
        var cen = [(C.lo[0] + C.hi[0]) / 2, (C.lo[1] + C.hi[1]) / 2, (C.lo[2] + C.hi[2]) / 2], L1 = null;
        var within = function () { L1 = localBounds(); return L1[0][0] <= cen[0] && L1[0][1] <= cen[1] && L1[0][2] <= cen[2] && L1[1][0] >= cen[0] && L1[1][1] >= cen[1] && L1[1][2] >= cen[2]; };
        if (nTg <= PARITY) { if (within() && K.inside(FR.wld(cen), isGen ? G[gn].tris : M.soup(gn))) hits.push([nm, gn]); }   // box possibly swallowed whole
        else if (within()) skipped.push(gn);
      });
    });
    var nameOf = function (x) { return meta[x] ? meta[x] : (G[x] ? { cls: G[x].cls, name: G[x].name } : { cls: '?', name: x }); };
    var base = { ecc: ecc, atype: atype, filler: filler, overlap: overlap, nominal: nominal ? [Number(nominal[1]), Number(nominal[3])] : null, t_leg: t_leg, leg_len: leg_len };
    if (hits.length && !opts.noClash) {   // the red control (opts.noClash) writes the clashing joints: CLEAR_POST on the written result must then FAIL
      var h0 = hits[0], mm = nameOf(h0[1]), who = h0[1] === j.support ? 'support' : tname(mm.name).slice(0, 40);
      return Object.assign({ result: 'REFUSED_CLASH', why: 'rule detail would clash (refused)', judged: true, skipped: skipped, clashKey: h0[0] + ' x ' + mm.cls + ' ' + who, clash: hits.slice(0, 4).map(function (h) { var m3 = nameOf(h[1]); return [h[0], h[1], m3.cls, m3.name]; }), allHits: hits }, base);
    }
    // ---- the built parts (world triangles)
    var mk = function (cv) { return cv.tris().map(function (t3) { return t3.map(function (p) { return FR.wld(p); }); }); };
    var tp = mk(plate), tb = [], tw = []; bolts.forEach(function (b) { tb = tb.concat(mk(b)); }); beads.forEach(function (b) { tw = tw.concat(mk(b)); });
    var Fp = flatten(tp), Fb = flatten(tb), Fw = flatten(tw), plL = ptp(poly.map(function (p) { return p[0]; })), plW = ptp(poly.map(function (p) { return p[1]; }));
    // ---- the 14 clauses MEASURED on the built meshes (local frame, mm)
    var Lp = FR.loc(Fp), Lb = FR.loc(Fb), Lw = FR.loc(Fw), tpH = [], pmaxH = -Infinity, pts2 = [];
    for (i = 0; i < Lp.length; i += 3) { tpH.push(Lp[i + 2]); if (Lp[i + 2] > pmaxH) pmaxH = Lp[i + 2]; }
    var tp_m = ptp(tpH), topMap = {}, hull = []; for (i = 0; i < Lp.length; i += 3) if (Lp[i + 2] > pmaxH - 0.01) { var kp = Lp[i].toFixed(3) + ',' + Lp[i + 1].toFixed(3); if (!topMap[kp]) { topMap[kp] = 1; hull.push([Number(Lp[i].toFixed(3)), Number(Lp[i + 1].toFixed(3))]); } }
    var hc = [0, 0]; hull.forEach(function (p) { hc[0] += p[0]; hc[1] += p[1]; }); hc = [hc[0] / hull.length, hc[1] / hull.length];
    hull = hull.map(function (p, ix) { return [Math.atan2(p[1] - hc[1], p[0] - hc[0]), ix, p]; }).sort(function (p, q) { return (p[0] - q[0]) || (p[1] - q[1]); }).map(function (x) { return x[2]; });
    var cents = a_bolts.map(function (ab) { var sa = 0, sl = 0, n = 0; for (var q = 0; q < Lb.length; q += 3) if (Lb[q + 2] > Htop + wt + 0.1 && Math.abs(Lb[q] - ab) < pitch / 2 && Math.abs(Lb[q + 1] - lb) < 30) { sa += Lb[q]; sl += Lb[q + 1]; n++; } return [sa / n, sl / n]; });
    var pit = []; for (i = 0; i + 1 < cents.length; i++) pit.push(-(cents[i + 1][0] - cents[i][0])); if (cents.length <= 1) pit = [pitch]; var pitMin = Math.min.apply(null, pit);
    var distEdges = function (pt, skip) { var res = []; for (var q = 0; q < hull.length; q++) { var p = hull[q], r = hull[(q + 1) % hull.length]; if (skip && skip(p, r)) continue; var d = [r[0] - p[0], r[1] - p[1]], dd = d[0] * d[0] + d[1] * d[1]; if (dd < 1e-12) continue; var tt = Math.max(0, Math.min(1, ((pt[0] - p[0]) * d[0] + (pt[1] - p[1]) * d[1]) / dd)); res.push(Math.hypot(p[0] + tt * d[0] - pt[0], p[1] + tt * d[1] - pt[1])); } return res; };
    var onContact = is_flange ? null : function (p, q) { return Math.abs((p[0] - a_e) * nrm[0] + (p[1] - lb) * nrm[1]) < 0.6 && Math.abs((q[0] - a_e) * nrm[0] + (q[1] - lb) * nrm[1]) < 0.6; };
    var e_pl = cents.map(function (ct) { return Math.min.apply(null, distEdges(ct, onContact)); }), Lbr = FR.loc(T), e_toe = [], e_end = [], bolt_in_leg = [], sgnToe = Math.sign(l_toe - lb);
    a_bolts.forEach(function (ab) {
      var o3 = [ab, lb, H0 - t_leg / 2], r1 = rayFirst(o3, [0, sgnToe, 0], Lbr), r2 = rayFirst(o3, [-1, 0, 0], Lbr); e_toe.push(r1 === null ? -1 : r1); e_end.push(r2 === null ? -1 : r2); bolt_in_leg.push(K.inside(FR.wld(o3), T));
    });
    var wl_beads = beads.map(function (b) { var Lh = FR.loc(flatten(mk(b))), hs = []; for (var q = 2; q < Lh.length; q += 3) hs.push(Lh[q]); return ptp(hs); });
    var emax_pl = Math.min(12 * Math.min(tp_m, t_leg), 150), emax_leg = Math.min(12 * t_leg, 150), contact_gap;
    if (!is_flange) { var mid = [(Pc1[0] + Pc2[0]) / 2, (Pc1[1] + Pc2[1]) / 2], ctr = rayFirst([mid[0] + nrm[0] * 2.0, mid[1] + nrm[1] * 2.0, Hg + tg / 2], [-nrm[0], -nrm[1], 0], Ls); contact_gap = ctr === null ? -1 : ctr - 2.0; }
    else { var gl = []; [Pl1, Pl2, [(Pl1[0] + Pl2[0]) / 2, (Pl1[1] + Pl2[1]) / 2]].forEach(function (pp) { var t2 = rayFirst([pp[0], pp[1], Hg + 30.0], [0, 0, -1], Ls); gl.push(t2 === null ? -1e9 : (Hg + 30.0 - t2) - Hg); }); contact_gap = Math.max.apply(null, gl.map(Math.abs)); }
    var chk = {
      pitch_ge_min: pitMin >= rv('bolt_pitch_min_mm') - 0.05, pitch_eq_row: Math.abs(pitMin - pitch) < 0.05, clear_between_holes_ge_d: (pitMin - hole) >= d_b - 0.05,
      plate_edges_ge_min: Math.min.apply(null, e_pl) >= e_min - 0.05, plate_nearest_edge_le_12t_150: Math.max.apply(null, e_pl) <= emax_pl + 0.05,
      angle_edges_ge_min: Math.min.apply(null, e_toe.concat(e_end)) >= e_min - 0.05, angle_toe_le_12t_150: Math.max.apply(null, e_toe) <= emax_leg + 0.05,
      weld_ge_table_thinner_part: Math.min.apply(null, wl_beads) >= JP.weldMin(TABLE, Math.min(tp_m, t_sup)) - 0.05, weld_le_j22b: Math.max.apply(null, wl_beads) <= (tp_m >= 6 ? tp_m - 2 : tp_m) + 0.05,
      plate_t_equals_row: Math.abs(tp_m - tg) < 0.05 && tp_m >= tg_min - 0.05, bolts_in_angle_leg: bolt_in_leg.every(Boolean),
      contact_le_tol: is_flange ? contact_gap <= CTOL : (-0.05 <= contact_gap && contact_gap <= CTOL + 1e-6), filler_le_max: filler <= FILL_MAX, bolt_count: cents.length === n_bolts
    };
    return Object.assign({ result: 'GENERATED', judged: true, skipped: skipped, nb: nbl.length, n_bolts: n_bolts, plate_L: plL, plate_W: plW, tg: tg, weld_mm: wl, t_sup: t_sup, lap: lap, gap: gap, contact_gap: contact_gap, interval: interval,
      measured: { pitch: pitMin, e_pl: e_pl, e_toe: e_toe, e_end: e_end, plate_t: tp_m, welds: wl_beads }, checks: chk, Fp: Fp, Fb: Fb, Fw: Fw, storey: meta[g].storey, n_beads: beads.length }, base);
  }

  // ---- the independent re-check on the WRITTEN parts: every part's surface (triangle centroids, nudged 2 % to the inside except welds) must lie inside no other solid.
  // items: [{guid, beam, support, kind:'PL'|'BT'|'WD', atype, tris: Float64Array (world)}]. The brace is exempt (bolted angle); the support only where welded (the welds; a lap plate; a T plate is judged by the exact test before writing).
  function clearPost(inp, RULES, items, log, extraParts) {
    var cx = K.makeCtx(inp, RULES, log), M = cx.meshes, idx = K.indexOf(inp), pmax = cx.rv('parity_max_triangles'), fails = [], skippedSet = {}, boxOf = {}, allX = items.concat(extraParts || []);   // extraParts (P6): live generated parts of other packs
    allX.forEach(function (it) { boxOf[it.guid] = bboxOf(it.tris); });
    items.forEach(function (it) {
      var b = boxOf[it.guid], lo = b[0], hi = b[1], A = it.tris, base = it.guid.replace(/-(PL|BT|WD)$/, '');
      var others = idx.query(lo, hi).filter(function (g) { return g !== it.beam && !startsAny(g, ['GEN-LY-', 'GEN-RB-']) && g.indexOf(base + '-') !== 0; });
      var extra = allX.filter(function (o) { return o.guid.indexOf(base + '-') !== 0 && boxOf[o.guid][0][0] <= hi[0] && boxOf[o.guid][0][1] <= hi[1] && boxOf[o.guid][0][2] <= hi[2] && boxOf[o.guid][1][0] >= lo[0] && boxOf[o.guid][1][1] >= lo[1] && boxOf[o.guid][1][2] >= lo[2]; });
      var nTr = A.length / 9, pts = [], cen = [0, 0, 0], q, bad = null, u;
      for (q = 0; q < A.length; q += 3) { cen[0] += A[q]; cen[1] += A[q + 1]; cen[2] += A[q + 2]; } cen = [cen[0] / (A.length / 3), cen[1] / (A.length / 3), cen[2] / (A.length / 3)];
      var step = Math.max(1, Math.floor(nTr / 400));
      for (q = 0; q < nTr; q += step) { var p = [(A[9 * q] + A[9 * q + 3] + A[9 * q + 6]) / 3, (A[9 * q + 1] + A[9 * q + 4] + A[9 * q + 7]) / 3, (A[9 * q + 2] + A[9 * q + 5] + A[9 * q + 8]) / 3]; if (it.kind !== 'WD') p = [p[0] + (cen[0] - p[0]) * 0.02, p[1] + (cen[1] - p[1]) * 0.02, p[2] + (cen[2] - p[2]) * 0.02]; pts.push(p); }
      others.forEach(function (g) {
        if (bad) return;
        if (g === it.support && it.kind === 'WD') return; if (g === it.support && it.kind === 'PL') return;   // lap: bears on the flange face by design; T: judged by the exact test with the contact strip removed
        var nT2 = M.ntri(g); if (!nT2) return; if (nT2 > pmax) { skippedSet[g] = 1; return; }
        var bx = idx.box(g), Tg = null;   // a point outside a neighbour's own box is not inside it
        for (u = 0; u < pts.length; u++) { var P = pts[u]; if (!(P[0] >= bx[0][0] && P[1] >= bx[0][1] && P[2] >= bx[0][2] && P[0] <= bx[1][0] && P[1] <= bx[1][1] && P[2] <= bx[1][2])) continue; if (!Tg) Tg = M.soup(g); if (K.inside(P, Tg)) { bad = [it.guid, g]; return; } }
      });
      extra.forEach(function (o) { if (bad) return; if (o.tris.length / 9 > pmax) return; for (u = 0; u < pts.length; u++) if (K.inside(pts[u], o.tris)) { bad = [it.guid, o.guid]; return; } });
      if (bad) fails.push(bad);
    });
    return { fails: fails, checked: items.length, skipped: Object.keys(skippedSet).sort() };
  }

  function run(inp, RULES, opts) {
    opts = opts || {}; var LOG = opts.log || function () { }, t0 = nowMs(), cx = K.makeCtx(inp, RULES, function (l) { LOG(String(l).replace('§LODUP_JOINT_', '§LODUP_GUSSET_')); }), rv = cx.rv, meta = cx.meta;
    LOG('§LODUP_GUSSET_MODE clash_check=' + (opts.noClash ? 'OFF(break)' : 'on') + ' bolts=' + rv('bolts_min') + ' x M' + rv('bolt_diameter_mm') + ' pitch=' + rv('bolt_pitch_mm') + ' edge=' + rv('edge_used_mm') + ' filler_max=' + rv('filler_max_mm') + ' filler_flag=' + rv('filler_flag_mm') + ' plane_tol_deg=' + rv('plane_tol_deg') + ' reach=' + rv('support_reach_mm') + ' flange_fraction=' + rv('flange_interval_max_fraction'));
    var S = K.survey(cx), t1 = nowMs(), ends = S.rows.filter(function (r) { return r.cls === 'STEEL_SKEW'; }), FLAG = rv('filler_flag_mm');
    LOG('§LODUP_GUSSET_JUDGED judged=' + ends.length + ' (STEEL_SKEW ends of the survey)' + (ends.length ? '' : ' INCONCLUSIVE (no angle brace end: nothing was judged)'));
    var parts = [], CH = [], out = [], reasons = {}, clashBy = {}, G = K.seedGenerated(inp, opts, 'GEN-GU-'), ruleFail = [], addedVerts = 0, judged = 0, skippedAll = {}, gen = [], eccAll = [];
    var bump = function (k) { reasons[k] = (reasons[k] || 0) + 1; };
    var change = function (kind, guid, cls, host, rule, detail) { CH.push({ kind: kind, guid: guid, cls: cls, host: host, rule: rule, detail: detail }); };
    var RULE = 'Gusset connection: AISC 360-16 detailing limits (J2.4, J2.2b, J3.3, J3.4M, J3.5, J5.2 filler tag) + shared fin-plate rows + gusset rows [' + RULES.filler_max_mm.source + ']; configuration only, capacity not checked';
    ends.forEach(function (j) {
      var endL = j.end > 0 ? 'B' : 'A', hostM = meta[j.guid], r = genEnd(cx, j, G, opts);
      if (r.ecc !== undefined) eccAll.push(r.ecc);
      (r.skipped || []).forEach(function (g) { skippedAll[g] = 1; }); if (r.judged) judged++;
      var tag = '"' + hostM.name + '" end ' + endL + ' | support "' + j.support_name + '"';
      if (r.result !== 'GENERATED') {
        bump(r.result); out.push(Object.assign({}, j, r));
        if (r.result === 'REFUSED_CLASH') { clashBy[r.clashKey] = (clashBy[r.clashKey] || 0) + 1; out[out.length - 1].hit_guids = r.allHits.map(function (h) { return h[1]; }).filter(function (g, i3, a3) { return a3.indexOf(g) === i3; }); }
        var extra = r.result === 'REFUSED_CLASH' ? ' hit=' + JSON.stringify(r.clash.slice(0, 2).map(function (c) { return [c[0], c[2], tname(c[3]).slice(0, 30)]; })) : ' why=' + r.why + (r.filler !== undefined ? ' filler=' + r.filler : '') + (r.overlap !== undefined && r.result === 'LEG_OVERLAP' ? ' overlap=' + r.overlap : '');
        change('REFUSED', j.guid, hostM.cls, j.guid, 'Gusset connection', tag + ' | ' + r.result + extra); return;
      }
      var fails = Object.keys(r.checks).filter(function (kk) { return !r.checks[kk]; }); if (fails.length) ruleFail.push([j.guid, j.end, fails]);
      var base = 'GEN-GU-' + j.guid + '-' + endL, ftag = r.filler > 0 ? (r.filler <= FLAG ? '<= 6 mm, AISC J5.2: no shear reduction' : '> 6 mm: engineer to check (AISC J5.2)') : 'none';
      var kinds = [['PL', r.Fp, 'Gusset plate ' + fx(r.tg, 0) + ' x ' + fx(r.plate_W, 0) + ' x ' + fx(r.plate_L, 0) + ' mm, ' + r.atype + ', filler ' + fx(r.filler, 1) + ' mm (' + ftag + ') ' + LABEL],
        ['BT', r.Fb, r.n_bolts + ' x M' + fmtG(rv('bolt_diameter_mm')) + ' bolt assemblies, pitch ' + fmtG(rv('bolt_pitch_mm')) + ', through angle leg and gusset ' + LABEL], ['WD', r.Fw, r.n_beads + ' fillet welds ' + fmtG(r.weld_mm) + ' mm to support (' + r.atype + ') ' + LABEL]];
      kinds.forEach(function (kd) {
        var A = kd[1], bx = bboxOf(A); G[base + '-' + kd[0]] = { box: bx, tris: A, cls: CLS[kd[0]], name: kd[2] };
        parts.push({ guid: base + '-' + kd[0], cls: CLS[kd[0]], name: kd[2], storey: hostM.storey, disc: hostM.disc, building: hostM.building, tris: A, parents: [], attach: [j.guid], rgba: RGBA[kd[0]], kind: kd[0], beam: j.guid, support: j.support, atype: r.atype });
        addedVerts += A.length / 3;
        change('ADDED', base + '-' + kd[0], CLS[kd[0]], j.guid, RULE, 'brace "' + hostM.name + '" end ' + endL + ' -> support ' + j.support + ' "' + j.support_name + '" | ' + kd[2].split(' (rules')[0] + ' | attach ' + r.atype + ' | brace-support axis eccentricity ' + fx(r.ecc, 1) + ' mm (J1.1, measured not corrected) | storey ' + r.storey);
      });
      out.push(Object.assign({}, j, r, { Fp: undefined, Fb: undefined, Fw: undefined })); gen.push(out[out.length - 1]); bump('generated');
    });
    var t2 = nowMs(), items = parts.map(function (p) { return { guid: p.guid, beam: p.beam, support: p.support, kind: p.kind, atype: p.atype, tris: p.tris }; }), post = clearPost(inp, RULES, items, function () { }, K.seededItems(G));
    post.skipped.forEach(function (g) { skippedAll[g] = 1; });
    var nClash = reasons.REFUSED_CLASH || 0, skNames = Object.keys(skippedAll).sort().map(function (g) { return tname(meta[g].name); }).filter(function (v, i2, a) { return a.indexOf(v) === i2; });
    LOG('§LODUP_GUSSET_RULES joints=' + gen.length + ' clause_failures=' + ruleFail.length + ' (measured on the built meshes; checks per joint=14) -> ' + (!gen.length ? 'INCONCLUSIVE' : (ruleFail.length ? 'FAIL ' + JSON.stringify(ruleFail.slice(0, 3)) : 'PASS')));
    LOG('§LODUP_GUSSET_CLEAR_POST parts_checked=' + parts.length + ' failures=' + post.fails.length + ' (surface points of each written part vs every neighbour solid, ray parity; brace exempt; support exempt only where welded) -> ' + (!parts.length ? 'INCONCLUSIVE' : (post.fails.length ? 'FAIL ' + JSON.stringify(post.fails.slice(0, 3)) : 'PASS')));
    var nbs = gen.map(function (o) { return o.nb; });
    LOG('§LODUP_GUSSET_CLEAR judged=' + judged + ' shipped=' + gen.length + ' refused_for_clash=' + nClash + ' neighbours_tested_per_joint min=' + (nbs.length ? Math.min.apply(null, nbs) : 0) + ' max=' + (nbs.length ? Math.max.apply(null, nbs) : 0) + ' clash_check=' + (opts.noClash ? 'OFF(break)' : 'on') + ' -> ' + (!judged ? 'INCONCLUSIVE' : (post.fails.length ? 'FAIL (see CLEAR_POST)' : 'PASS')));
    Object.keys(clashBy).sort(function (a, b) { return clashBy[b] - clashBy[a] || (a < b ? -1 : 1); }).forEach(function (k) { LOG('§LODUP_GUSSET_REFUSED_CLASH ' + k + ' joints=' + clashBy[k]); });
    LOG('§LODUP_GUSSET_PARITY_SKIPPED elements=' + Object.keys(skippedAll).length + ' ' + skNames.join(', '));
    var mmm = function (x) { return x.length ? 'min=' + fx(Math.min.apply(null, x), 1) + ' median=' + fx(median(x), 1) + ' max=' + fx(Math.max.apply(null, x), 1) : 'none'; };
    LOG('§LODUP_GUSSET_ECCENT (reported, not a pass/fail; J1.1 measured distance between the brace gravity axis and the support axis) generated: ' + mmm(gen.map(function (o) { return o.ecc; })) + ' | all ' + eccAll.length + ' measured ends: ' + mmm(eccAll) + ' -> ' + (eccAll.length ? 'PASS' : 'INCONCLUSIVE'));
    var att = {}; gen.forEach(function (o) { att[o.atype] = (att[o.atype] || 0) + 1; }); var ref = {}; Object.keys(reasons).forEach(function (k) { if (k !== 'generated') ref[k] = reasons[k]; });
    LOG('§LODUP_GUSSET_ATTACH generated_by_attachment=' + JSON.stringify(att) + ' refused_by_reason=' + JSON.stringify(ref));
    var fl = gen.map(function (o) { return o.filler; }), ov = gen.map(function (o) { return o.overlap; });
    LOG('§LODUP_GUSSET_FILLER generated=' + gen.length + ' filler_mm ' + mmm(fl) + ' | zero=' + fl.filter(function (x) { return x === 0; }).length + ' | 0<f<=6 (no J5.2 reduction)=' + fl.filter(function (x) { return x > 0 && x <= FLAG; }).length + ' | >6 engineer to check=' + fl.filter(function (x) { return x > FLAG; }).length + ' | gusset enters author angle (overlap_mm) n=' + ov.filter(function (x) { return x > 0; }).length);
    var tot = gen.length; Object.keys(ref).forEach(function (k) { tot += ref[k]; });
    LOG('§LODUP_GUSSET_COUNTS generated=' + gen.length + ' refused=' + JSON.stringify(ref) + ' total=' + tot + ' of ' + ends.length + ' judged -> ' + (!ends.length ? 'INCONCLUSIVE' : (tot === ends.length ? 'PASS' : 'FAIL')));
    if (gen.length) LOG('§LODUP_GUSSET_SIZES gusset_t_mm=' + JSON.stringify(gen.reduce(function (o, x) { o[x.tg] = (o[x.tg] || 0) + 1; return o; }, {})) + ' plate_len_mm ' + mmm(gen.map(function (o) { return o.plate_L; })) + ' weld_mm=' + JSON.stringify(gen.reduce(function (o, x) { o[x.weld_mm] = (o[x.weld_mm] || 0) + 1; return o; }, {})) + ' contact_gap_max_mm=' + fx(Math.max.apply(null, gen.map(function (o) { return o.contact_gap; })), 2) + ' leg_t_measured_vs_name_max_dev_mm=' + fx(Math.max.apply(null, gen.filter(function (o) { return o.nominal; }).map(function (o) { return Math.abs(o.t_leg - o.nominal[1]); })), 2));
    var nd = 0, ns = 0; Object.keys(RULES).forEach(function (k) { var s = String(RULES[k].source); if (/^default/.test(s)) nd++; else if (/^stated/.test(s)) ns++; });
    LOG('§LODUP_GUSSET_DEFAULTS rows=' + Object.keys(RULES).length + ' still_default=' + nd + ' stated=' + ns + ' verts_added=' + addedVerts);
    var cnt = { ADDED: 0, NOT_BUILT: 0, REFUSED: 0 }; CH.forEach(function (c) { cnt[c.kind]++; });
    var heap = (typeof performance !== 'undefined' && performance.memory) ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
    LOG('§LODUP_COST pack=gussets addedVerts=' + addedVerts + ' surveyMs=' + Math.round(t1 - t0) + ' generateMs=' + Math.round(t2 - t1) + ' clearPostMs=' + Math.round(nowMs() - t2) + ' totalMs=' + Math.round(nowMs() - t0) + ' heapMB=' + heap);
    LOG('§LODUP_GUSSET_SUMMARY added=' + cnt.ADDED + ' refused=' + cnt.REFUSED + ' joints=' + gen.length + ' ends=' + ends.length + ' addedVerts=' + addedVerts + (parts.length ? '' : ' INCONCLUSIVE (no gusset built: nothing was generated)'));
    return { parts: parts, changes: CH, stats: { added: cnt.ADDED, notBuilt: 0, refused: cnt.REFUSED, addedVerts: addedVerts, appliesTo: ends.length, judged: ends.length, joints: gen.length, ends: ends.length, ms: Math.round(nowMs() - t0) },
      audit: { survey: S.rows, ends: ends, results: out, reasons: reasons, clashBy: clashBy, ruleFail: ruleFail, post: post, generated: gen, skipped: Object.keys(skippedAll).sort(), ecc: eccAll } };
  }

  // the panel's measured count: the STEEL_SKEW brace ends the survey finds (read-only; the survey is cached per open model, shared with the joints pack)
  function appliesTo(inp, rows) {
    if (!rows) { var n = 0; Object.keys(inp.meta).forEach(function (g) { var c = inp.meta[g].cls; if (c === 'IfcBeam' || c === 'IfcMember') n++; }); return n; }
    try { return K.surveyCached(inp, rows).counts.STEEL_SKEW || 0; } catch (e) { return 0; }
  }
  var API = { id: 'gussets', label: 'Bracing gussets', unit: 'brace ends', rulesFile: 'rules/gusset_defaults.json', run: run, appliesTo: appliesTo, clearPost: clearPost };
  if (typeof window !== 'undefined' && window.LodRegistry) window.LodRegistry.register(API);   // browser: the pack registers itself; adding a pack needs no dialog change
  return API;
});
