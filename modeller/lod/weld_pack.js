// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — weld_pack.js: the LOD Upgrade pack "Truss welds". Read the §LODUP_* log after every run; the exit code is not evidence.
// Implementing prompts/MODELLER_LOD_UPGRADE_PILL.md §4 P2 ("P2 SPEC") — Witness: W-LODUP-WELDS (modeller/tests/witness_lodup_welds.js).
// Issue proved/disproved: "the browser result differs from the proven Python result" (BIMCompiler scripts/lod/rebar_from_schedule.py section B, truss welds, incl. the outward-winding fix of 2026-11-18).
// Port of the Python oracle, same maths and same order of everything; deterministic (no clock, no random, every loop over sorted keys). Pure: input in, parts + change rows out. No DOM, no DB.
// INPUT  in.meta   {guid: {cls, name, storey, disc, building}}       every element of the open model
//        in.world(guid) -> Float64Array xyz triangle soup, or null  the element's world mesh (the MESH, never the DB rtree: spec §5)
// RULES  rule rows {key: {value, unit, source}} (lod/rules/weld_defaults.json, lod_rules.js)
// OPTS   {noMaterialGate: bool (the red control: weld any member to any plate), breakWinding: bool (the red control: the pre-2026-11-18 inward end caps; WELD_WINDING must then FAIL), log: fn(line)}
// OUTPUT {parts:[{guid, cls, name, storey, disc, building, tris:Float64Array, parents:[], attach:[member, plate], rgba}], changes:[{kind,guid,cls,host,rule,detail}], stats, audit}
// A weld is attached to its member and plate, not an aggregate child of either (the oracle writes no element_parts row for it; element_parts would hide the member on reload): parents = [], attach = [member, plate].
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./lod_registry.js'));
  else root.LodWeldPack = factory(root.LodRegistry);
})(typeof self !== 'undefined' ? self : this, function (REG) {
  'use strict';
  var K = REG.kit;   // the yield kit (lod_registry.js, P7)
  var IN = 0.0254, WD_RGBA = '0.40,0.34,0.30,1.000';

  // ---- formatting twins of Python's format specs
  function fmtG(x) { return String(parseFloat(Number(x).toPrecision(6))); }                  // {:g}
  function fx(x, d) { return Number(x).toFixed(d); }                                           // {:.Nf}
  function parseFracIn(s) { var m = /^(\d+)(?:\/(\d+))?$/.exec(s); return m ? (m[2] ? parseInt(m[1], 10) / parseInt(m[2], 10) : parseFloat(m[1])) * IN : null; }

  // ---- vectors (arrays of 3)
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { return Math.sqrt(dot(a, a)); }
  function aabb(V) {
    var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (var i = 0; i < V.length; i += 3) for (var a = 0; a < 3; a++) { var v = V[i + a]; if (v < lo[a]) lo[a] = v; if (v > hi[a]) hi[a] = v; }
    return [lo, hi];
  }
  function mean(V) { var s = [0, 0, 0], n = V.length / 3; for (var i = 0; i < V.length; i += 3) { s[0] += V[i]; s[1] += V[i + 1]; s[2] += V[i + 2]; } return [s[0] / n, s[1] / n, s[2] / n]; }

  // ---- bead: triangular fillet from corner line c0..c1; legs s_leg along n_hat and t_out. 8 triangles. Outward winding.
  function triOut(p0, p1, p2, ref) {                       // winding so that the normal points away from ref
    var n = cross(sub(p1, p0), sub(p2, p0)), c = mul(add(add(p0, p1), p2), 1 / 3);
    return dot(n, sub(c, ref)) >= 0 ? [p0, p1, p2] : [p0, p2, p1];
  }
  function bead(c0, c1, sLeg, nHat, tOut, breakWinding) {
    var a = [c0, add(c0, mul(nHat, sLeg)), add(c0, mul(tOut, sLeg))], b = [c1, add(c1, mul(nHat, sLeg)), add(c1, mul(tOut, sLeg))];
    var sum = [0, 0, 0]; a.concat(b).forEach(function (p) { sum = add(sum, p); }); var ref = mul(sum, 1 / 6);
    // end caps wound outward from the bead's own centroid (corrected 2026-11-18); breakWinding reproduces the first version, which measured them against a point displaced the wrong way
    var tris = [triOut(a[0], a[1], a[2], add(ref, breakWinding ? sub(c0, c1) : [0, 0, 0])), triOut(b[0], b[1], b[2], add(ref, breakWinding ? sub(c1, c0) : [0, 0, 0]))];
    for (var k = 0; k < 3; k++) { var k2 = (k + 1) % 3; tris.push(triOut(a[k], a[k2], b[k2], ref)); tris.push(triOut(a[k], b[k2], b[k], ref)); }
    return tris;
  }

  // ---- polygon clipping against a box (Sutherland-Hodgman, 6 planes: lo then hi on each axis)
  function clipPoly(poly, lo, hi) {
    var pts = poly.slice(), ax, s;
    for (ax = 0; ax < 3; ax++) for (s = 1; s >= -1; s -= 2) {
      var out = [], i;
      for (i = 0; i < pts.length; i++) {
        var p = pts[i], q = pts[(i + 1) % pts.length], dp = s === 1 ? p[ax] - lo[ax] : hi[ax] - p[ax], dq = s === 1 ? q[ax] - lo[ax] : hi[ax] - q[ax];
        if (dp >= 0) out.push(p);
        if ((dp >= 0) !== (dq >= 0)) out.push(add(p, mul(sub(q, p), dp / (dp - dq))));
      }
      pts = out; if (!pts.length) return [];
    }
    return pts;
  }
  // ---- triangle soup T (flat) vs box (centre c, half h): Akenine-Moller; true when ANY triangle hits
  function anyTriBox(T, c, h) {
    var hx = h[0], hy = h[1], hz = h[2];
    for (var i = 0; i + 8 < T.length; i += 9) {
      var v0 = [T[i] - c[0], T[i + 1] - c[1], T[i + 2] - c[2]], v1 = [T[i + 3] - c[0], T[i + 4] - c[1], T[i + 5] - c[2]], v2 = [T[i + 6] - c[0], T[i + 7] - c[1], T[i + 8] - c[2]], V = [v0, v1, v2], k, j, ok = true;
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
  // ---- ray parity: point P inside the closed mesh T (flat) when at least 2 of 3 rays cross an odd number of triangles
  var RAYS = [[0.577, 0.577, 0.577], [-0.267, 0.802, 0.535], [0.707, -0.1, -0.7]].map(function (d) { var n = norm(d); return [d[0] / n, d[1] / n, d[2] / n]; });
  function rayCount(o, d, T) {
    var n = 0;
    for (var i = 0; i + 8 < T.length; i += 9) {
      var t0 = [T[i], T[i + 1], T[i + 2]], e1 = [T[i + 3] - t0[0], T[i + 4] - t0[1], T[i + 5] - t0[2]], e2 = [T[i + 6] - t0[0], T[i + 7] - t0[1], T[i + 8] - t0[2]];
      var p = cross(d, e2), det = dot(e1, p); if (!(Math.abs(det) > 1e-12)) continue;
      var inv = 1 / det, s = sub(o, t0), u = dot(s, p) * inv, q = cross(s, e1), vv = dot(q, d) * inv, t = dot(e2, q) * inv;
      if (u >= 0 && vv >= 0 && u + vv <= 1 && t > 1e-9) n++;
    }
    return n;
  }
  function insideMesh(P, T) { var odd = 0; RAYS.forEach(function (d) { odd += rayCount(P, d, T) % 2; }); return odd >= 2; }

  // ---- symmetric 3x3 eigen-decomposition (cyclic Jacobi); returns the unit eigenvector of the LARGEST eigenvalue
  function topAxis(C) {
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
    var best = 0; for (k = 1; k < 3; k++) if (a[k][k] > a[best][best]) best = k;
    var ax = [v[0][best], v[1][best], v[2][best]], n = norm(ax); return [ax[0] / n, ax[1] / n, ax[2] / n];
  }
  // centroid and long axis; sign convention: largest component positive (this fixes which end is 'A')
  function memberAxis(V) {
    var c0 = mean(V), n = V.length / 3, C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], i, r, s;
    for (i = 0; i < V.length; i += 3) { var d = [V[i] - c0[0], V[i + 1] - c0[1], V[i + 2] - c0[2]]; for (r = 0; r < 3; r++) for (s = 0; s < 3; s++) C[r][s] += d[r] * d[s]; }
    for (r = 0; r < 3; r++) for (s = 0; s < 3; s++) C[r][s] /= (n - 1);
    var a = topAxis(C), im = 0; for (i = 1; i < 3; i++) if (Math.abs(a[i]) > Math.abs(a[im])) im = i;
    return { c0: c0, a: a[im] < 0 ? [-a[0], -a[1], -a[2]] : a };
  }
  // plate frame: thickness axis = smallest world extent; in-plane axes from the minimum-area rectangle of the triangle edges. R = {u, v, n} (the columns).
  function plateFrame(V) {
    var bb = aabb(V), ext = sub(bb[1], bb[0]), k = 0, i, t, e; for (i = 1; i < 3; i++) if (ext[i] < ext[k]) k = i;
    var ax = [0, 1, 2].filter(function (x) { return x !== k; }), nV = V.length / 3, best = null;
    for (t = 0; t + 8 < V.length; t += 9) for (e = 0; e < 3; e++) {
      var p = t + 3 * e, q = t + 3 * ((e + 1) % 3), d0 = V[q + ax[0]] - V[p + ax[0]], d1 = V[q + ax[1]] - V[p + ax[1]];
      if (Math.hypot(d0, d1) < 1e-9) continue;
      var ang = Math.atan2(d1, d0), c = Math.cos(ang), s = Math.sin(ang), l0 = Infinity, h0 = -Infinity, l1 = Infinity, h1 = -Infinity;
      for (i = 0; i < nV; i++) { var x = V[3 * i + ax[0]], y = V[3 * i + ax[1]], r0 = x * c + y * s, r1 = -x * s + y * c; if (r0 < l0) l0 = r0; if (r0 > h0) h0 = r0; if (r1 < l1) l1 = r1; if (r1 > h1) h1 = r1; }
      var a2 = (h0 - l0) * (h1 - l1); if (best === null || a2 < best[0] - 1e-12) best = [a2, ang];
    }
    var ang2 = best[1], c2 = Math.cos(ang2), s2 = Math.sin(ang2), u = [0, 0, 0], v = [0, 0, 0], n = [0, 0, 0];
    u[ax[0]] = c2; u[ax[1]] = s2; v[ax[0]] = -s2; v[ax[1]] = c2; n[k] = 1.0;
    return { u: u, v: v, n: n };
  }
  function toLocal(V, cp, R) { var o = new Float64Array(V.length); for (var i = 0; i < V.length; i += 3) { var d = [V[i] - cp[0], V[i + 1] - cp[1], V[i + 2] - cp[2]]; o[i] = dot(d, R.u); o[i + 1] = dot(d, R.v); o[i + 2] = dot(d, R.n); } return o; }
  function toWorld(l, R, cp) { return [l[0] * R.u[0] + l[1] * R.v[0] + l[2] * R.n[0] + cp[0], l[0] * R.u[1] + l[1] * R.v[1] + l[2] * R.n[1] + cp[1], l[0] * R.u[2] + l[1] * R.v[2] + l[2] * R.n[2] + cp[2]]; }
  function dirWorld(l, R) { return [l[0] * R.u[0] + l[1] * R.v[0] + l[2] * R.n[0], l[0] * R.u[1] + l[1] * R.v[1] + l[2] * R.n[1], l[0] * R.u[2] + l[1] * R.v[2] + l[2] * R.n[2]]; }

  // the J2.4 table, as data: "6:3, 13:5, 19:6, 999:8" (thinner part up to mm : weld mm) or a list of pairs / a flat comma list (what the panel's edit box shows for an array)
  function weldTable(v) {
    var pairs = [];
    if (Array.isArray(v)) { if (v.length && Array.isArray(v[0])) pairs = v.map(function (p) { return [Number(p[0]), Number(p[1])]; }); else for (var i = 0; i + 1 < v.length; i += 2) pairs.push([Number(v[i]), Number(v[i + 1])]); }
    else { var nums = String(v).split(/[\s,;:]+/).filter(Boolean).map(Number); for (var j = 0; j + 1 < nums.length; j += 2) pairs.push([nums[j], nums[j + 1]]); }
    return pairs.filter(function (p) { return isFinite(p[0]) && isFinite(p[1]); }).sort(function (a, b) { return a[0] - b[0]; });
  }
  function weldMin(table, tMm) { for (var i = 0; i < table.length; i++) if (tMm <= table[i][0]) return table[i][1]; return null; }

  function run(inp, RULES, opts) { return K.drain(runSteps(inp, RULES, opts)); }
  function* runSteps(inp, RULES, opts) {
    opts = opts || {}; var LOG = opts.log || function () { }, BREAK = !!opts.breakWinding, NOGATE = !!opts.noMaterialGate;
    var rv = function (k) { if (!RULES[k]) throw new Error('rule row missing: ' + k); return RULES[k].value; };
    var END_TOL = rv('weld_contact_end_tol_mm') / 1000, PAR = rv('weld_axis_parallel_max'), TABLE = weldTable(rv('weld_min_table_mm')), RE_T = new RegExp(rv('plate_thickness_name_pattern')), RE_M = new RegExp(rv('member_leg_name_pattern'));
    var META = inp.meta, allG = Object.keys(META).sort(), byClass = function (cl) { return allG.filter(function (g) { return META[g].cls === cl; }); };
    LOG('§LODUP_WELD_MODE break=' + (BREAK ? 1 : 0) + ' end_tol_mm=' + fmtG(END_TOL * 1000) + ' parallel_max=' + fmtG(PAR) + ' table=' + JSON.stringify(TABLE));
    var parts = [], CH = [], addedVerts = 0, change = function (kind, guid, cls, host, rule, detail) { CH.push({ kind: kind, guid: guid, cls: cls, host: host, rule: rule, detail: detail }); };
    var MEM = byClass('IfcMember'), PLT = byClass('IfcPlate'), MV = {}, PV = {}, PF = {}, noMesh = [], i;
    // material gate (P3 FIX SPEC 2): only steel members and steel plates are judged; anything else is outside the welded-truss rule (not refused, not listed)
    var gateWords = (function () { var v = RULES.weld_material_gate ? RULES.weld_material_gate.value : []; if (typeof v === 'string') v = v.split(','); return (v || []).map(function (x) { return String(x).trim().toLowerCase(); }).filter(Boolean); })();
    var steel = function (g) { if (!gateWords.length || NOGATE) return true; var m = META[g], mats = [m.mat].concat(m.layerMats || []).filter(function (x) { return x !== null && x !== undefined; }).map(function (x) { return String(x).toLowerCase(); }); return mats.some(function (t) { return gateWords.some(function (w) { return t.indexOf(w) >= 0; }); }); };
    var memAll = MEM.length, pltAll = PLT.length; MEM = MEM.filter(steel); PLT = PLT.filter(steel);
    LOG('§LODUP_WELD_GATE words=' + JSON.stringify(gateWords) + (NOGATE ? ' OFF(break)' : '') + ' members_steel=' + MEM.length + ' plates_steel=' + PLT.length + ' members_gated_out=' + (memAll - MEM.length) + ' plates_gated_out=' + (pltAll - PLT.length) + ((MEM.length && PLT.length) ? '' : ' (nothing left to judge)'));
    MEM = MEM.filter(function (g) { var w = inp.world(g); if (!w || !w.length) { noMesh.push(g); return false; } MV[g] = w; return true; });
    PLT = PLT.filter(function (g) { var w = inp.world(g); if (!w || !w.length) { noMesh.push(g); return false; } PV[g] = w; return true; });
    PLT.forEach(function (g) { var R = plateFrame(PV[g]), cp = mean(PV[g]), L = toLocal(PV[g], cp, R), bb = aabb(L); PF[g] = { R: R, cp: cp, lo: bb[0], hi: bb[1] }; });
    var thickIn = function (name, re) { var m = re.exec(name || ''); return m ? parseFracIn(m[1]) : null; };
    var contacts = [], touchOnly = 0, noContact = [], weldInfo = {}, skippedKeys = {}, weldSkipped = [];

    // ---- contact scan: member x plate
    yield* K.each(MEM, function (gm) {
      var VM = MV[gm], ma = memberAxis(VM), c0 = ma.c0, a = ma.a, slo = Infinity, shi = -Infinity, bm = aabb(VM), mlo = bm[0], mhi = bm[1], nCon = 0;
      for (i = 0; i < VM.length; i += 3) { var s = (VM[i] - c0[0]) * a[0] + (VM[i + 1] - c0[1]) * a[1] + (VM[i + 2] - c0[2]) * a[2]; if (s < slo) slo = s; if (s > shi) shi = s; }
      PLT.forEach(function (gp) {
        var f = PF[gp], R = f.R, cp = f.cp, lo = f.lo, hi = f.hi, bp = aabb(PV[gp]), plo = bp[0], phi = bp[1];
        for (var k = 0; k < 3; k++) if (mhi[k] < plo[k] - 1e-6 || mlo[k] > phi[k] + 1e-6) return;
        var TM = toLocal(VM, cp, R), mid = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2], h = [(hi[0] - lo[0]) / 2, (hi[1] - lo[1]) / 2, (hi[2] - lo[2]) / 2];
        var sat = anyTriBox(TM, mid, [h[0] + 1e-9, h[1] + 1e-9, h[2] + 1e-9]), cin = [];
        [0, 1].forEach(function (x) { [0, 1].forEach(function (y) { [0, 1].forEach(function (z) { var cn = [x ? hi[0] : lo[0], y ? hi[1] : lo[1], z ? hi[2] : lo[2]]; if (insideMesh(cn, TM)) cin.push(cn); }); }); });
        if (!sat && !cin.length) return;
        var pts = [], t;
        for (t = 0; t + 8 < TM.length; t += 9) clipPoly([[TM[t], TM[t + 1], TM[t + 2]], [TM[t + 3], TM[t + 4], TM[t + 5]], [TM[t + 6], TM[t + 7], TM[t + 8]]], lo, hi).forEach(function (p) { pts.push(p); });
        cin.forEach(function (p) { pts.push(p); });
        if (!pts.length) return;
        var al = [dot(R.u, a), dot(R.v, a), dot(R.n, a)], c0l = [dot(sub(c0, cp), R.u), dot(sub(c0, cp), R.v), dot(sub(c0, cp), R.n)], s0 = Infinity, s1 = -Infinity;
        pts.forEach(function (p) { var ss = dot(sub(p, c0l), al); if (ss < s0) s0 = ss; if (ss > s1) s1 = ss; });
        if (s1 - s0 < 1e-6) { touchOnly++; return; }
        var end = (s0 <= slo + END_TOL ? 'A' : '') + (s1 >= shi - END_TOL ? 'B' : ''); if (!end) end = 'T';   // T = through (mid-span) contact
        contacts.push({ m: gm, p: gp, s0: s0, s1: s1, end: end, a: a, c0: c0, slo: slo, shi: shi }); nCon++;
      });
      if (nCon === 0) noContact.push(gm);
    }, 'Welds: member');
    var nEndC = contacts.filter(function (r) { return r.end !== 'T'; }).length, nThr = contacts.length - nEndC;
    LOG('§LODUP_WELD_SCAN members=' + MEM.length + ' plates=' + PLT.length + ' contacts=' + contacts.length + ' end_contacts=' + nEndC + ' through_contacts=' + nThr + ' touch_only=' + touchOnly + ' members_without_any_contact=' + noContact.length + (noMesh.length ? ' no_mesh=' + noMesh.length : '') + ((MEM.length && PLT.length) ? '' : ' INCONCLUSIVE (the model has no member or no plate: nothing was judged)'));

    // ---- the welds
    var nWeld = 0;
    noMesh.forEach(function (g) { if (META[g].cls === 'IfcMember') change('REFUSED', g, 'IfcMember', g, 'Weld', 'the member has no mesh'); });
    yield* K.each(contacts.slice().sort(function (p, q) { return p.m < q.m ? -1 : p.m > q.m ? 1 : p.p < q.p ? -1 : p.p > q.p ? 1 : 0; }), function (rec) {
      var gm = rec.m, gp = rec.p, f = PF[gp], R = f.R, cp = f.cp, lo = f.lo, hi = f.hi, VM = MV[gm];
      var tp = thickIn(META[gp].name, RE_T), tm = thickIn(META[gm].name, RE_M);
      if (tp === null) tp = hi[2] - lo[2];                                // measured, only if the name gives none
      var thin = Math.min.apply(null, [tp, tm].filter(function (x) { return x !== null; })), wsz = weldMin(TABLE, thin * 1000);
      var refuse = function (why) { weldSkipped.push([gm, gp, why]); skippedKeys[gm + '|' + rec.end + '|' + gp] = 1; };
      if (wsz === null) { refuse('no row of the weld table covers a thinner part of ' + fx(thin * 1000, 2) + ' mm'); return; }
      var aL = [dot(R.u, rec.a), dot(R.v, rec.a), dot(R.n, rec.a)], cd = sub(rec.c0, cp), c0l = [dot(cd, R.u), dot(cd, R.v), dot(cd, R.n)], nL = [0, 0, 1];
      if (Math.abs(aL[2]) > PAR) { refuse('member axis not parallel to the plate plane (member lies across or against the plate face; the spec has no bead rule for it)'); return; }
      var tL = cross(nL, aL), tn = norm(tL); tL = [tL[0] / tn, tL[1] / tn, tL[2] / tn];
      var TM = toLocal(VM, cp, R), zpl = hi[2], seam = [], t, e;
      for (t = 0; t + 8 < TM.length; t += 9) for (e = 0; e < 3; e++) {
        var p = [TM[t + 3 * e], TM[t + 3 * e + 1], TM[t + 3 * e + 2]], q = [TM[t + 3 * ((e + 1) % 3)], TM[t + 3 * ((e + 1) % 3) + 1], TM[t + 3 * ((e + 1) % 3) + 2]];
        if ((p[2] - zpl) * (q[2] - zpl) < 0) { var pt = add(p, mul(sub(q, p), (zpl - p[2]) / (q[2] - p[2]))); seam.push(dot(pt, tL)); }   // the member is a prism: its section in the plate-face plane is the same along the whole length
      }
      if (!seam.length) { refuse('the member does not reach the plate face: no seam'); return; }
      var tHi = Math.max.apply(null, seam), tLo = Math.min.apply(null, seam), tc = dot(c0l, tL);
      var corner = function (s, tExt) { var base = add(c0l, mul(aL, s)); return add(add(base, mul(tL, tExt - tc)), mul(nL, zpl - base[2])); };
      var tris = [];
      [[tHi, tL], [tLo, mul(tL, -1)]].forEach(function (pr) {
        var c0w = toWorld(corner(rec.s0, pr[0]), R, cp), c1w = toWorld(corner(rec.s1, pr[0]), R, cp);
        bead(c0w, c1w, wsz / 1000, dirWorld(nL, R), dirWorld(pr[1], R), BREAK).forEach(function (tr) { tris.push(tr); });
      });
      var Lw = rec.s1 - rec.s0, guid = 'GEN-WD-' + gm + '-' + rec.end + '-' + gp, W = new Float64Array(tris.length * 9), wi = 0;
      tris.forEach(function (tr) { for (var k = 0; k < 3; k++) { W[wi++] = tr[k][0]; W[wi++] = tr[k][1]; W[wi++] = tr[k][2]; } });
      var how = rec.end === 'T' ? 'through contact' : 'end ' + rec.end, m0 = META[gm];
      parts.push({ guid: guid, cls: 'IfcFastener', name: '2 fillet welds ' + fmtG(wsz) + ' mm x ' + fx(Lw * 1000, 0) + ' mm, member ' + how + ' to gusset plate', storey: m0.storey, disc: m0.disc, building: m0.building, tris: W, parents: [], attach: [gm, gp], rgba: WD_RGBA });
      addedVerts += tris.length * 3;
      change('ADDED', guid, 'IfcFastener', gm, 'Fillet weld, AISC 360-16 Table J2.4 minimum for the thinner part (' + fx(thin * 1000, 2) + ' mm -> ' + fmtG(wsz) + ' mm) [' + RULES.weld_min_table_mm.source + ']; length = overlap length [default: ours]',
        'member "' + m0.name + '" ' + (rec.end === 'T' ? 'through contact (mid-span, clipped overlap with the plate box)' : 'end ' + rec.end) + ' -> gusset plate ' + gp + ' "' + META[gp].name + '" | overlap along the member ' + fx(Lw * 1000, 1) + ' mm | beads on the +face of the plate at the two outer edges of the member | plate t=' + fx(tp * 1000, 2) + ' mm, member leg t=' + (tm === null ? '-' : fx(tm * 1000, 2) + ' mm') + ' | storey ' + m0.storey);
      weldInfo[guid] = { m: gm, end: rec.end, p: gp, size: wsz, len: Lw, thin: thin }; nWeld++;
    }, 'Welds: weld');
    noContact.slice().sort().forEach(function (gm) { change('NOT_BUILT', gm, 'IfcMember', gm, 'Weld: member has no contact with a gusset plate', '"' + META[gm].name + '" | counted, not welded'); });
    weldSkipped.forEach(function (w) { change('REFUSED', w[0], 'IfcMember', w[0], 'Weld', 'plate ' + w[1] + ': ' + w[2]); });
    LOG('§LODUP_WELD_BUILT welds=' + nWeld + ' skipped=' + weldSkipped.length);
    var cnt = { ADDED: 0, NOT_BUILT: 0, REFUSED: 0 }; CH.forEach(function (c) { cnt[c.kind]++; });
    LOG('§LODUP_WELD_SUMMARY added=' + cnt.ADDED + ' not_built=' + cnt.NOT_BUILT + ' refused=' + cnt.REFUSED + ' addedVerts=' + addedVerts + (parts.length ? '' : ' INCONCLUSIVE (no weld built: nothing was judged)'));
    return { parts: parts, changes: CH, stats: { added: cnt.ADDED, notBuilt: cnt.NOT_BUILT, refused: cnt.REFUSED, addedVerts: addedVerts, appliesTo: MEM.length, judged: contacts.length, contacts: contacts.length, endContacts: nEndC, throughContacts: nThr, touchOnly: touchOnly },
      audit: { contacts: contacts, weldInfo: weldInfo, skipped: weldSkipped, noContact: noContact, PF: PF, MEM: MEM, PLT: PLT, table: TABLE } };
  }

  // how many elements the pack applies to (the panel's measured count): the steel members, when the model has gusset plates to weld them to
  function appliesTo(meta) {
    var m = 0, p = 0; Object.keys(meta).forEach(function (g) { var c = meta[g].cls; if (c === 'IfcMember') m++; else if (c === 'IfcPlate') p++; });
    return p ? m : 0;
  }
  var API = { id: 'welds', label: 'Truss welds', unit: 'member-plate contacts', rulesFile: 'rules/weld_defaults.json', run: run, runSteps: runSteps,
    appliesTo: function (inp, rows) { if (!rows) return appliesTo(inp.meta); try { return run(inp, rows, { log: function () { } }).stats.judged; } catch (e) { return 0; } },   // with rule rows: the member-plate contacts the run finds (same test), read-only dry run
   
    fmtG: fmtG, weldTable: weldTable, weldMin: weldMin, WD_RGBA: WD_RGBA, IN: IN };
  if (typeof window !== 'undefined' && window.LodRegistry) window.LodRegistry.register(API);   // browser: the pack registers itself; adding a pack needs no dialog change
  return API;
});
