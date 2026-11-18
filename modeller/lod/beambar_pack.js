// Copyright (c) 2025-2026 Redhuan D. Oon
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — beambar_pack.js: the LOD Upgrade pack "Beam rebar (schedule)": reinforcement of concrete beams from a schedule TABLE the person loads. Read the §LODUP_* log after every run; the exit code is not evidence.
// Implementing prompts/MODELLER_LOD_UPGRADE_PILL.md §4 P6 ("P6 SPEC") — Witness: W-LODUP-BEAMBARS (modeller/tests/witness_lodup_beambars.js).
// Issue proved/disproved: "the browser result differs from the proven Python result" (BIMCompiler scripts/lod/rebar_beams.py, spec prompts/LOD400_DEFAULT_RULES_SCOPE.md section 7 + its RESULT, including its STATED FAIL on two beams).
// Port of the Python oracle: same maths, same order of everything, no clock, no random, every loop over sorted keys. Pure: input in, parts + change rows out. No DOM, no DB. Node + browser (window.LodBeamBarPack).
// INPUT  inp.meta {guid:{cls,name,storey,disc,building}}   inp.mesh(guid) -> {V: Float64Array world xyz, F: Uint32Array|null}  [else inp.world(guid) soup]   inp.sched {guid:{name:value}} (only when mark_source names a row there)
//        inp.inputs.beambars.schedule = the marks JSON the person loaded (format below)
// MARKS JSON  {"<mark>": {w, h (mm), bottom:[[n,dia]..] (columns A + ADD B), top:[[n,dia]..] (D + E), hanger:[[n,dia]..] (C, reported NOT_BUILT), side:"2T12-300" | "8T25" | "", stirrup:[dia, spacing_mm] | null,
//             stirrup_legs:n, stirrup_balance:[dia,spacing]|null, stirrup_inner:"", source:"<where the row was read>"}}   (BIMCompiler scripts/lod/s401_marks.py writes it from a drawing table; any tool may.)
// RULES  lod/rules/beambar_defaults.json rows. The mark is joined by the rows host_class + mark_regex (group 1) on element_name (mark_source). A mark with no schedule row is NOT_BUILT, never guessed.
// OPTS   {breakCover: bool (the red control: bars and stirrups placed with no cover; INSIDE must FAIL), log: fn(line)}
// OUTPUT {parts:[{guid, cls, name, storey, disc, building, tris, parents:[beam], rgba}], changes:[{kind,guid,cls,host,rule,detail}], stats, audit}
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rebar_pack.js'), require('./lod_registry.js'));
  else root.LodBeamBarPack = factory(root.LodRebarPack, root.LodRegistry);
})(typeof self !== 'undefined' ? self : this, function (RB, REG) {
  'use strict';
  var K = REG.kit;   // the yield kit (lod_registry.js, P7): run is one generator, drained in node and driven in slices in the browser
  if (!RB || !RB.make) throw new Error('§LODUP_BEAMBAR beambar_pack.js needs rebar_pack.js loaded first (lod/packs.json lists rebar before beambars)');
  var fmtG = RB.fmtG, RB_RGBA = RB.RB_RGBA;

  // ---------------------------------------------------------------- small helpers (numpy / Python twins)
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { return Math.sqrt(dot(a, a)); }
  function arange(start, stop, step) { var n = Math.max(0, Math.ceil((stop - start) / step)), o = new Array(n), i; for (i = 0; i < n; i++) o[i] = start + i * step; return o; }   // numpy.arange (float)
  function roundHalfEven(x) { var f = Math.floor(x), d = x - f; if (d < 0.5) return f; if (d > 0.5) return f + 1; return f % 2 === 0 ? f : f + 1; }
  function fx(x, n) { return Number(x).toFixed(n); }                                                  // {:.Nf}
  function S(x) { return x === undefined || x === null ? 'None' : String(x); }                          // a missing dict.get prints as None
  function srcHead(row) { return String(row.source).split(' (')[0]; }
  function pyList(a) { return '[' + a.map(function (x) { return typeof x === 'string' ? "'" + x + "'" : String(x); }).join(', ') + ']'; }
  function pyDict(o) { return '{' + Object.keys(o).map(function (k) { return "'" + k + "': " + (o[k] === null ? 'None' : typeof o[k] === 'string' ? "'" + o[k] + "'" : o[k]); }).join(', ') + '}'; }   // the Python repr of the parsed side string
  function soupOf(m) { if (!m) return null; if (!m.F) return m.V; var F = m.F, V = m.V, o = new Float64Array(F.length * 3), i, k; for (i = 0; i < F.length; i++) { k = 3 * F[i]; o[3 * i] = V[k]; o[3 * i + 1] = V[k + 1]; o[3 * i + 2] = V[k + 2]; } return o; }
  function flat(tris) { var o = new Float64Array(tris.length * 9), i = 0; tris.forEach(function (t) { for (var k = 0; k < 3; k++) { o[i++] = t[k][0]; o[i++] = t[k][1]; o[i++] = t[k][2]; } }); return o; }

  // ---------------------------------------------------------------- the beam frame
  function planAngle(V) {   // degrees; the rotation of the minimum-area rectangle of the plan outline, refined in steps down to 0.0001 deg (the oracle's plan_angle)
    var n = V.length / 3, mx = 0, my = 0, i, px = new Float64Array(n), py = new Float64Array(n);
    for (i = 0; i < n; i++) { mx += V[3 * i]; my += V[3 * i + 1]; } mx /= n; my /= n;
    for (i = 0; i < n; i++) { px[i] = V[3 * i] - mx; py[i] = V[3 * i + 1] - my; }
    function area(deg) {
      var a = deg * (Math.PI / 180), c = Math.cos(a), s = Math.sin(a), l0 = Infinity, h0 = -Infinity, l1 = Infinity, h1 = -Infinity, j, u, v;
      for (j = 0; j < n; j++) { u = px[j] * c + py[j] * s; v = -px[j] * s + py[j] * c; if (u < l0) l0 = u; if (u > h0) h0 = u; if (v < l1) l1 = v; if (v > h1) h1 = v; }
      return (h0 - l0) * (h1 - l1);
    }
    function argmin(list) { var best = list[0], ba = area(best), k, ar; for (k = 1; k < list.length; k++) { ar = area(list[k]); if (ar < ba) { ba = ar; best = list[k]; } } return best; }
    var best = argmin(arange(0, 180, 0.1)), sp = [[0.1, 0.01], [0.01, 0.001], [0.001, 0.0001]], q;
    for (q = 0; q < sp.length; q++) best = argmin(arange(best - sp[q][0], best + sp[q][0] + sp[q][1] / 2, sp[q][1]));
    return best;
  }
  // the vertical extent of the beam BODY: at stations along the axis a vertical line through the mid-width meets the mesh; the most common (zlo, zhi) to 1 mm is the reference section (a local stub must not set where the bars go).
  // L = local-frame triangle soup (9 per triangle). Returns [zlo, zhi, stations_used, stations_total, distinct_ranges] or null.
  function modalZ(L, lo, hi) {
    var step = 0.05, vm = (lo[1] + hi[1]) / 2, us = arange(lo[0] + step / 2, hi[0], step), nT = L.length / 9, cnt = new Map(), exact = {}, used = 0, t, k, u;
    var den = new Float64Array(nT), okA = new Uint8Array(nT);
    for (t = 0; t < nT; t++) { var o = 9 * t, d = (L[o + 4] - L[o + 1]) * (L[o + 6] - L[o]) - (L[o + 3] - L[o]) * (L[o + 7] - L[o + 1]); okA[t] = Math.abs(d) > 1e-12 ? 1 : 0; den[t] = okA[t] ? ((L[o + 3] - L[o]) * (L[o + 7] - L[o + 1]) - (L[o + 4] - L[o + 1]) * (L[o + 6] - L[o])) : 1; }
    for (k = 0; k < us.length; k++) {
      u = us[k]; var zmin = Infinity, zmax = -Infinity, any = false;
      for (t = 0; t < nT; t++) {
        if (!okA[t]) continue; var o2 = 9 * t, a0 = L[o2], a1 = L[o2 + 1], a2 = L[o2 + 2], b0 = L[o2 + 3], b1 = L[o2 + 4], b2 = L[o2 + 5], c0 = L[o2 + 6], c1 = L[o2 + 7], c2 = L[o2 + 8];
        var l1 = ((u - a0) * (c1 - a1) - (vm - a1) * (c0 - a0)) / den[t], l2 = ((vm - a1) * (b0 - a0) - (u - a0) * (b1 - a1)) / den[t];
        if (l1 >= -1e-9 && l2 >= -1e-9 && l1 + l2 <= 1 + 1e-9) { var z = a2 + l1 * (b2 - a2) + l2 * (c2 - a2); if (z < zmin) zmin = z; if (z > zmax) zmax = z; any = true; }
      }
      if (!any) continue;
      var key = (Math.round(zmin * 1000) / 1000) + ',' + (Math.round(zmax * 1000) / 1000); cnt.set(key, (cnt.get(key) || 0) + 1); if (!(key in exact)) exact[key] = [zmin, zmax]; used++;
    }
    if (!cnt.size) return null;
    var bestK = null, bestC = -1, bestH = -Infinity; cnt.forEach(function (c, key2) { var p = key2.split(','), h = parseFloat(p[1]) - parseFloat(p[0]); if (c > bestC || (c === bestC && h > bestH)) { bestK = key2; bestC = c; bestH = h; } });
    return [exact[bestK][0], exact[bestK][1], used, us.length, cnt.size];
  }

  // ---------------------------------------------------------------- the mesh tests (the oracle's pt_tri_dist / _inside, with an early exit that gives the same boolean)
  var DIRS = [[0.577, 0.577, 0.577], [-0.267, 0.802, 0.535], [0.707, -0.1, -0.7]].map(function (d) { var n = norm(d); return [d[0] / n, d[1] / n, d[2] / n]; });
  function TriSet(S9) {
    var n = S9.length / 9, t, o; this.S = S9; this.n = n; this.N = new Float64Array(n * 3); this.NN = new Float64Array(n); this.E1 = new Float64Array(n * 3); this.E2 = new Float64Array(n * 3);
    this.PV = [0, 1, 2].map(function () { return new Float64Array(n * 3); }); this.INV = [0, 1, 2].map(function () { return new Float64Array(n); });
    for (t = 0; t < n; t++) {
      o = 9 * t; var a = [S9[o], S9[o + 1], S9[o + 2]], b = [S9[o + 3], S9[o + 4], S9[o + 5]], c = [S9[o + 6], S9[o + 7], S9[o + 8]], e1 = sub(b, a), e2 = sub(c, a), nn = cross(e1, e2);
      this.N[3 * t] = nn[0]; this.N[3 * t + 1] = nn[1]; this.N[3 * t + 2] = nn[2]; this.NN[t] = dot(nn, nn);
      for (var k = 0; k < 3; k++) { this.E1[3 * t + k] = e1[k]; this.E2[3 * t + k] = e2[k]; }
      for (var di = 0; di < 3; di++) { var pv = cross(DIRS[di], e2), det = dot(e1, pv), okd = Math.abs(det) > 1e-12; this.PV[di][3 * t] = pv[0]; this.PV[di][3 * t + 1] = pv[1]; this.PV[di][3 * t + 2] = pv[2]; this.INV[di][t] = okd ? 1 / det : 0; }
    }
  }
  function segD2(px, py, pz, x0, x1, x2, y0, y1, y2) {   // squared distance from p to the segment x-y
    var dx = y0 - x0, dy = y1 - x1, dz = y2 - x2, dd = dx * dx + dy * dy + dz * dz, tt = ((px - x0) * dx + (py - x1) * dy + (pz - x2) * dz) / Math.max(dd, 1e-18);
    tt = tt < 0 ? 0 : tt > 1 ? 1 : tt; var ex = px - (x0 + tt * dx), ey = py - (x1 + tt * dy), ez = pz - (x2 + tt * dz); return ex * ex + ey * ey + ez * ez;
  }
  TriSet.prototype.triD2 = function (p, t) {   // squared distance from p to triangle t: plane distance if the projection falls inside, else the nearest edge (the oracle's pt_tri_dist; scalar form, the same operations in the same order)
    var S9 = this.S, o = 9 * t, a0 = S9[o], a1 = S9[o + 1], a2 = S9[o + 2], b0 = S9[o + 3], b1 = S9[o + 4], b2 = S9[o + 5], c0 = S9[o + 6], c1 = S9[o + 7], c2 = S9[o + 8], n0 = this.N[3 * t], n1 = this.N[3 * t + 1], n2 = this.N[3 * t + 2], nnn = this.NN[t], ok = nnn > 1e-18;
    var px = p[0], py = p[1], pz = p[2], tt = ((px - a0) * n0 + (py - a1) * n1 + (pz - a2) * n2) / (ok ? nnn : 1.0), q0 = px - n0 * tt, q1 = py - n1 * tt, q2 = pz - n2 * tt;
    if (ok) {
      var u0 = b0 - a0, u1 = b1 - a1, u2 = b2 - a2, w0 = q0 - a0, w1 = q1 - a1, w2 = q2 - a2, s1 = (u1 * w2 - u2 * w1) * n0 + (u2 * w0 - u0 * w2) * n1 + (u0 * w1 - u1 * w0) * n2;
      if (s1 >= 0) {
        u0 = c0 - b0; u1 = c1 - b1; u2 = c2 - b2; w0 = q0 - b0; w1 = q1 - b1; w2 = q2 - b2; var s2 = (u1 * w2 - u2 * w1) * n0 + (u2 * w0 - u0 * w2) * n1 + (u0 * w1 - u1 * w0) * n2;
        if (s2 >= 0) {
          u0 = a0 - c0; u1 = a1 - c1; u2 = a2 - c2; w0 = q0 - c0; w1 = q1 - c1; w2 = q2 - c2; var s3 = (u1 * w2 - u2 * w1) * n0 + (u2 * w0 - u0 * w2) * n1 + (u0 * w1 - u1 * w0) * n2;
          if (s3 >= 0) return tt * tt * nnn;
        }
      }
    }
    return Math.min(segD2(px, py, pz, a0, a1, a2, b0, b1, b2), segD2(px, py, pz, b0, b1, b2, c0, c1, c2), segD2(px, py, pz, c0, c1, c2, a0, a1, a2));
  };
  TriSet.prototype.dist2 = function (p) { var best = Infinity, t, d2; for (t = 0; t < this.n; t++) { d2 = this.triD2(p, t); if (d2 < best) best = d2; } return best; };   // min over triangles
  TriSet.prototype.nearer = function (p, thr2) { for (var t = 0; t < this.n; t++) if (this.triD2(p, t) < thr2) return true; return false; };   // some triangle closer than sqrt(thr2) (early exit)
  TriSet.prototype.inside = function (p) {   // ray parity along three oblique directions, majority vote (the build-1 rule)
    var S9 = this.S, cnt = 0, di, t;
    for (di = 0; di < 3; di++) {
      var d = DIRS[di], hits = 0, PV = this.PV[di], INV = this.INV[di];
      for (t = 0; t < this.n; t++) {
        var inv = INV[t]; if (inv === 0) continue; var o = 9 * t, sx = p[0] - S9[o], sy = p[1] - S9[o + 1], sz = p[2] - S9[o + 2];
        var u = (sx * PV[3 * t] + sy * PV[3 * t + 1] + sz * PV[3 * t + 2]) * inv; if (!(u >= 0)) continue;
        var e1x = this.E1[3 * t], e1y = this.E1[3 * t + 1], e1z = this.E1[3 * t + 2], qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
        var v = (qx * d[0] + qy * d[1] + qz * d[2]) * inv; if (!(v >= 0) || !(u + v <= 1)) continue;
        var tt = (this.E2[3 * t] * qx + this.E2[3 * t + 1] * qy + this.E2[3 * t + 2] * qz) * inv; if (tt > 1e-9) hits++;
      }
      cnt += hits % 2;
    }
    return cnt >= 2;
  };
  TriSet.prototype.clear = function (p, thr) {   // inside the mesh and at least thr from its surface (thr <= 0: only inside, as d >= thr is then always true)
    if (thr > 0 && this.nearer(p, thr * thr)) return false;
    return this.inside(p);
  };
  TriSet.prototype.signed = function (p) { var d = Math.sqrt(this.dist2(p)); return this.inside(p) ? d : -d; };   // positive inside

  // ---------------------------------------------------------------- stated strings
  function parseSide(s) {   // '2T12-300' -> per level 2 bars, dia 12, pitch 300 ; '8T25' -> 8 bars in all, no pitch. null if not readable.
    var m = /^\s*(\d+)\s*T\s*(\d+)\s*-\s*(\d+)\s*$/.exec(s || '');
    if (m) return { kind: 'pitch', n: parseInt(m[1], 10), dia: parseInt(m[2], 10), pitch: parseInt(m[3], 10) };
    m = /^\s*(\d+)\s*T\s*(\d+)\s*$/.exec(s || '');
    return m ? { kind: 'count', n: parseInt(m[1], 10), dia: parseInt(m[2], 10), pitch: null } : null;
  }
  function layersOf(dias, W, c, ds, clearMin) {   // fill layers in the stated order: the most bars per layer such that centre pitch - widest bar >= clear_min
    var layers = [], rest = dias.slice();
    while (rest.length) {
      var k = 1, kk;
      for (kk = 2; kk <= rest.length; kk++) {
        var avail = W - 2 * (c + ds) - rest[0] / 2000.0 - rest[kk - 1] / 2000.0;
        if (avail / (kk - 1) - Math.max.apply(null, rest.slice(0, kk)) / 1000.0 >= clearMin - 1e-12) k = kk; else break;
      }
      layers.push(rest.slice(0, k)); rest = rest.slice(k);
    }
    return layers;
  }
  // a marks JSON the person loaded: checked before it is used (a malformed file is refused with its reason, never half-read)
  function validateMarks(j) {
    if (!j || typeof j !== 'object' || Array.isArray(j)) return { ok: false, why: 'the file is not a JSON object of marks' };
    var keys = Object.keys(j).filter(function (k) { return k.charAt(0) !== '_'; }); if (!keys.length) return { ok: false, why: 'no marks in the file' };
    var pairs = function (a) { return Array.isArray(a) && a.every(function (p) { return Array.isArray(p) && p.length === 2 && isFinite(p[0]) && isFinite(p[1]); }); };
    for (var i = 0; i < keys.length; i++) {
      var r = j[keys[i]];
      if (!r || typeof r !== 'object') return { ok: false, why: 'mark ' + keys[i] + ' is not an object' };
      if (!pairs(r.bottom) || !pairs(r.top)) return { ok: false, why: 'mark ' + keys[i] + ': bottom / top must be lists of [n, dia]' };
      if (r.stirrup !== null && r.stirrup !== undefined && !(Array.isArray(r.stirrup) && r.stirrup.length === 2 && isFinite(r.stirrup[0]) && isFinite(r.stirrup[1]))) return { ok: false, why: 'mark ' + keys[i] + ': stirrup must be [dia, spacing_mm] or null' };
      if (!isFinite(r.w) || !isFinite(r.h)) return { ok: false, why: 'mark ' + keys[i] + ': w and h (mm) are needed' };
    }
    return { ok: true, count: keys.length, summary: keys.length + ' marks' };
  }
  function marksOf(inp) { var u = inp && inp.inputs && inp.inputs.beambars, s = u && u.schedule; if (!s) return null; var o = {}; Object.keys(s).sort().forEach(function (k) { if (k.charAt(0) !== '_') o[k] = s[k]; }); return o; }
  // P8: the join (which beam reads which schedule row) belongs to the schedule FORMAT, not to the geometry rule rows: lod/rules/schedule_formats.json, carried on the loaded schedule as _format
  function formatOf(inp) { var u = inp && inp.inputs && inp.inputs.beambars, s = u && u.schedule; return (s && s._format && s._format.join) ? s._format : null; }
  function joinOf(inp, RULES, MARKS) {   // host element -> mark (the format's join: host_class + mark_regex group 1 on mark_source)
    var F = formatOf(inp), META = inp.meta, hosts = [], HM = {}; if (!F) return { hosts: [], HM: {}, unjoined: [], format: null };
    var cls = F.join.host_class, RX = new RegExp(F.join.mark_regex), src = F.join.mark_source, nCls = 0;
    Object.keys(META).sort().forEach(function (g) {
      if (META[g].cls !== cls) return; nCls++; var text = src === 'element_name' ? META[g].name : ((inp.sched || {})[g] || {})[src], m = RX.exec(text || ''); if (!m) return; hosts.push(g); HM[g] = m[1];
    });
    return { hosts: hosts, HM: HM, unjoined: hosts.filter(function (g) { return !MARKS || !(HM[g] in MARKS); }), format: F, classCount: nCls };
  }
  // P8: one entry for both files "Load schedule…" takes. ctx (from lod_ui.js / the witness) = {formats: [...], LodSchedule, dxfSheet: async (text, name) -> {ok, sheet, why}}
  function attachFormat(json, formats, wantId) {   // a marks JSON names its format in _format (an id) or, when exactly one format exists, takes it; else refused
    var id = wantId || (typeof json._format === 'string' ? json._format : null), list = formats || [], f = id ? list.filter(function (x) { return x.id === id; })[0] : (list.length === 1 ? list[0] : null);
    if (!f) return { ok: false, why: id ? 'the file names schedule format "' + id + '", which is not in the formats list' : 'the file names no schedule format (_format) and ' + list.length + ' formats exist: name one' };
    var o = {}; Object.keys(json).forEach(function (k) { if (k !== '_format') o[k] = json[k]; }); o._format = f; return { ok: true, json: o, format: f };
  }
  async function readSchedule(text, name, ctx) {
    var lines = [];
    if (/\.dxf$/i.test(name || '')) {
      var d = await ctx.dxfSheet(text, name); if (!d.ok) return { ok: false, why: d.why };
      var r = ctx.LodSchedule.read(d.sheet, ctx.formats, name); if (r.detect) lines.push(r.detect); if (r.line) lines.push(r.line);
      if (!r.ok) return { ok: false, why: r.why, lines: lines };
      var a = attachFormat(r.marks, ctx.formats, r.format.id), v = validateMarks(a.json); if (!v.ok) return { ok: false, why: v.why, lines: lines };
      return { ok: true, json: a.json, lines: lines, summary: v.count + ' marks read from the drawing (format ' + r.format.id + ', ' + (r.format.status || 'status not stated') + ')' };
    }
    var j; try { j = JSON.parse(text); } catch (e) { return { ok: false, why: 'not valid JSON (' + e.message + ')' }; }
    var v2 = validateMarks(j); if (!v2.ok) return v2; var a2 = attachFormat(j, ctx.formats); if (!a2.ok) return a2;
    return { ok: true, json: a2.json, summary: v2.count + ' marks (format ' + a2.format.id + ', ' + (a2.format.status || 'status not stated') + ')' };
  }

  // ---------------------------------------------------------------- the run
  function run(inp, RULES, opts) { return K.drain(runSteps(inp, RULES, opts)); }
  function* runSteps(inp, RULES, opts) {
    opts = opts || {}; var LOG = opts.log || function () { }, t0 = Date.now(), P = '§LODUP_BEAMBAR_';
    var rv = function (k) { if (!RULES[k]) throw new Error('rule row missing: ' + k); return RULES[k].value; };
    var SIDES = parseInt(rv('bar_sides'), 10), G = RB.make(SIDES), STOCK = rv('stock_length_mm') / 1000.0, META = inp.meta, FMT = formatOf(inp), HC = FMT ? FMT.join.host_class : 'IfcBeam';
    var COVER = rv('beam_cover_mm') / 1000.0, MINCL = rv('beam_min_clear_mm') / 1000.0, LAYCL = rv('beam_layer_clear_mm') / 1000.0, STEP = rv('beam_sample_step_mm') / 1000.0, MARG = rv('beam_fit_margin_mm') / 1000.0;
    var BREAK = !!opts.breakCover, PLC = BREAK ? 0.0 : COVER, THR = PLC > 0 ? PLC + MARG : -0.0005;   // the break switch changes PLACEMENT only; the witnesses judge against the rule row
    var MARKS = marksOf(inp), empty = { parts: [], changes: [], stats: { added: 0, notBuilt: 0, refused: 0, addedVerts: 0, appliesTo: 0, judged: 0, ms: 0 }, audit: { hosts: [], HM: {}, unjoined: [], REC: {}, MARKS: {}, used: {}, refusedLines: [] } };
    if (!MARKS) { LOG(P + 'RUN VACUOUS no schedule loaded: nothing to join -> INCONCLUSIVE'); empty.stats.say = 'Load a schedule (marks JSON) first.'; return empty; }
    if (!FMT) { LOG(P + 'RUN VACUOUS the schedule carries no schedule format (_format): nothing says how a beam finds its row -> INCONCLUSIVE'); empty.stats.say = 'The loaded schedule names no schedule format.'; return empty; }
    LOG(P + 'MODE break=' + (BREAK ? 1 : 0) + ' cover_rule_mm=' + fmtG(COVER * 1000) + ' placement_cover_mm=' + fmtG(PLC * 1000) + ' min_clear_mm=' + fmtG(MINCL * 1000) + ' layer_clear_mm=' + fmtG(LAYCL * 1000) + ' sample_step_mm=' + fmtG(STEP * 1000));
    var J = joinOf(inp, RULES, MARKS), hosts = J.hosts, HM = J.HM, unjoined = J.unjoined, used = {};
    hosts.forEach(function (g) { if (HM[g] in MARKS) used[HM[g]] = (used[HM[g]] || 0) + 1; });
    var unused = Object.keys(MARKS).filter(function (m) { return !(m in used); }).sort();
    LOG(P + 'JOIN format=' + FMT.id + ' (' + (FMT.status || '-') + ') host_class=' + HC + ' in_model=' + J.classCount + ' names_matching_mark_regex=' + hosts.length + (hosts.length ? '' : ' -> INCONCLUSIVE: no ' + HC + ' name matches this format\'s mark_regex, nothing is joined (a format for this model\'s naming is needed)'));
    LOG(P + 'INPUT host_class=' + HC + ' hosts=' + hosts.length + ' schedule_marks=' + Object.keys(MARKS).length + ' marks_used=' + Object.keys(used).length + ' marks_unused=' + pyList(unused));
    var parts = [], CH = [], addedVerts = 0, REC = {}, nLines = 0, nLinesOk = 0, nCand = 0, nCandOk = 0, refusedLines = [];
    var change = function (kind, guid, cls, host, rule, detail) { CH.push({ kind: kind, guid: guid, cls: cls, host: host, rule: rule, detail: detail }); };
    var writePart = function (guid, name, g0, tris) { var m = META[g0]; parts.push({ guid: guid, cls: 'IfcReinforcingBar', name: name, storey: m.storey, disc: m.disc, building: m.building, tris: flat(tris), parents: [g0], rgba: RB_RGBA }); addedVerts += tris.length * 3; };
    unjoined.forEach(function (g) { change('NOT_BUILT', g, HC, g, 'No schedule row for the type mark; nothing guessed', '"' + META[g].name + '" | mark "' + HM[g] + '" is not in the schedule | storey ' + META[g].storey); });

    function* buildBeam(gb) {
      var mk = HM[gb], row = MARKS[mk], m = inp.mesh ? inp.mesh(gb) : (inp.world(gb) ? { V: inp.world(gb), F: null } : null), T9 = soupOf(m), nV = T9.length / 3, i, a;
      var o = [0, 0, 0]; for (i = 0; i < nV; i++) for (a = 0; a < 3; a++) o[a] += T9[3 * i + a]; o = [o[0] / nV, o[1] / nV, o[2] / nV];
      var ang = planAngle(T9) * (Math.PI / 180), c_ = Math.cos(ang), s_ = Math.sin(ang), u3 = [c_, s_, 0.0], v3 = [-s_, c_, 0.0], z3 = [0.0, 0.0, 1.0];
      var local = function () { var Lc = new Float64Array(T9.length), q; for (q = 0; q < nV; q++) { var d = [T9[3 * q] - o[0], T9[3 * q + 1] - o[1], T9[3 * q + 2] - o[2]]; Lc[3 * q] = dot(d, u3); Lc[3 * q + 1] = dot(d, v3); Lc[3 * q + 2] = dot(d, z3); } return Lc; };
      var Lc = local(), ptp = function (Lx, ax) { var lo = Infinity, hi = -Infinity; for (var q = 0; q < nV; q++) { var x = Lx[3 * q + ax]; if (x < lo) lo = x; if (x > hi) hi = x; } return hi - lo; };
      if (ptp(Lc, 0) < ptp(Lc, 1)) { var nu = v3, nv = mul(u3, -1); u3 = nu; v3 = nv; Lc = local(); }
      var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (i = 0; i < nV; i++) for (a = 0; a < 3; a++) { var x2 = Lc[3 * i + a]; if (x2 < lo[a]) lo[a] = x2; if (x2 > hi[a]) hi[a] = x2; }
      var Wd = hi[1] - lo[1], Ln = hi[0] - lo[0], Hbbox = hi[2] - lo[2], mz = modalZ(Lc, lo, hi);
      if (mz) { lo = lo.slice(); hi = hi.slice(); lo[2] = mz[0]; hi[2] = mz[1]; }   // reference section = the body, not a local stub
      var Hd = hi[2] - lo[2], TS = new TriSet(T9);
      var loc2w = function (u, v, z) { return [o[0] + u * u3[0] + v * v3[0] + z * z3[0], o[1] + u * u3[1] + v * v3[1] + z * z3[1], o[2] + u * u3[2] + v * v3[2] + z * z3[2]]; };
      var info = { mark: mk, W: Wd, H: Hd, H_bbox: Hbbox, body: mz ? mz.slice(2) : null, L: Ln, lo: lo, hi: hi, angle_deg: ang * (180 / Math.PI), stated_w: row.w / 1000.0, stated_h: row.h / 1000.0, notes: [], u3: u3, o: o };
      if (!row.stirrup) { info.notes.push('schedule row has no stirrup'); REC[gb] = info; return info; }
      var ds = row.stirrup[0] / 1000.0, sp = row.stirrup[1] / 1000.0; info.ds = ds; info.sp = sp; info.stirrup_legs = row.stirrup_legs;
      // ---- bar lines
      var bot = [], top = []; row.bottom.forEach(function (nd) { for (var q = 0; q < nd[0]; q++) bot.push(nd[1]); }); row.top.forEach(function (nd) { for (var q = 0; q < nd[0]; q++) top.push(nd[1]); });
      var lb = layersOf(bot, Wd, PLC, ds, MINCL), lt = layersOf(top, Wd, PLC, ds, MINCL); info.bot_layers = lb.map(function (x) { return x.length; }); info.top_layers = lt.map(function (x) { return x.length; }); info.bot_dias = bot; info.top_dias = top;
      var lines = [];   // [set, v, z, dia_mm]
      function place(layers, fromBottom, name) {
        var base = PLC + ds, cz = [];
        layers.forEach(function (lay) {
          var k = lay.length, va = lo[1] + PLC + ds + lay[0] / 2000.0, vb = hi[1] - PLC - ds - lay[k - 1] / 2000.0, vs = [], q;
          if (k === 1) vs = [(lo[1] + hi[1]) / 2]; else for (q = 0; q < k; q++) vs.push(va + (vb - va) * q / (k - 1));
          lay.forEach(function (d, qi) { var z = fromBottom ? lo[2] + base + d / 2000.0 : hi[2] - base - d / 2000.0; lines.push([name, vs[qi], z, d]); });
          cz.push([base + lay[0] / 2000.0, Math.max.apply(null, lay)]);   // centre offset of the face-column bar of this layer, widest dia
          base += Math.max.apply(null, lay) / 1000.0 + LAYCL;
        });
        return cz;
      }
      var cb = place(lb, true, 'BOT'), ct = place(lt, false, 'TOP');
      info.layer_detail = { BOT: lb.map(function (l) { return [l.length, Math.max.apply(null, l)]; }), TOP: lt.map(function (l) { return [l.length, Math.max.apply(null, l)]; }) };
      var sl = function (d) { return !d.length ? null : (d.length > 1 ? ((Wd - 2 * (PLC + ds) - d[0] / 2000.0 - d[d.length - 1] / 2000.0) / (d.length - 1) - Math.max.apply(null, d) / 1000.0) * 1000.0 : null); };
      info.single_layer_clear_mm = { BOT: sl(bot), TOP: sl(top) };
      // ---- side bars
      var sd = row.side || '', side = sd ? parseSide(sd) : null, sideWhy = null;
      if (sd && side === null) sideWhy = 'stated side string "' + sd + '" not readable';
      if (side) { if (side.n % 2 || (side.kind === 'pitch' && side.n !== 2)) { sideWhy = 'side string "' + sd + '": ' + side.n + ' bars per level / in all is not an even split with one bar per face per level'; side = null; } }
      info.side_parse = (!side && !sideWhy) ? null : (side ? side : sideWhy);
      if (side) {
        var dsd = side.dia / 1000.0, zA = cb.length ? lo[2] + cb[cb.length - 1][0] : lo[2] + PLC + ds, zB = ct.length ? hi[2] - ct[ct.length - 1][0] : hi[2] - PLC - ds, nseg;
        if (side.kind === 'pitch') nseg = Math.max(1, Math.ceil((zB - zA) / (side.pitch / 1000.0) - 1e-9)); else nseg = Math.floor(side.n / 2) + 1;
        var levels = []; for (i = 1; i < nseg; i++) levels.push(zA + (zB - zA) * i / nseg);
        var gap = (zB - zA) / nseg - (dsd + Math.max.apply(null, cb.length ? [cb[cb.length - 1][1]] : [0]) / 1000.0) / 2;
        if (levels.length && gap < MINCL - 1e-9) { sideWhy = 'side bars at ' + (side.pitch ? side.pitch : 'even') + ' pitch leave ' + fx(gap * 1000, 1) + ' mm clear to the corner bars (< ' + fmtG(MINCL * 1000) + ')'; levels = []; }
        info.side_levels = levels.length; info.side_zAB = [zA, zB];
        levels.forEach(function (z) { [lo[1] + PLC + ds + dsd / 2, hi[1] - PLC - ds - dsd / 2].forEach(function (v) { lines.push(['SIDE', v, z, side.dia]); }); });
      }
      if (sideWhy) info.notes.push(sideWhy);
      // ---- bars: the stretch of each line that lies inside the mesh with the cover kept
      var BARS = {}, lens = {}; info.lap = [];
      function* barLine(ln) {
        var name = ln[0], v = ln[1], z = ln[2], d = ln[3]; nLines++; var r = d / 2000.0;
        var e1 = cross(u3, Math.abs(u3[0]) < 0.9 ? [1.0, 0, 0] : [0, 1.0, 0]), e1n = norm(e1); e1 = [e1[0] / e1n, e1[1] / e1n, e1[2] / e1n]; var e2 = cross(u3, e1), ring = [], k;
        for (k = 0; k < SIDES; k++) { var t = 2 * Math.PI * k / SIDES; ring.push(add(mul(e1, r * Math.cos(t)), mul(e2, r * Math.sin(t)))); }
        var us = arange(lo[0], hi[0], STEP); us.push(hi[0]);
        var okAt = function (u) { var c = loc2w(u, v, z); for (var q = 0; q < SIDES; q++) if (!TS.clear(add(c, ring[q]), THR)) return false; return true; };
        var good = [], best = null, ii = 0, jj, qs; for (qs = 0; qs < us.length; qs++) { good.push(okAt(us[qs])); if (K.due()) yield K.state.prog; }
        while (ii < us.length) { if (good[ii]) { jj = ii; while (jj + 1 < us.length && good[jj + 1]) jj++; if (best === null || jj - ii > best[1] - best[0]) best = [ii, jj]; ii = jj + 1; } else ii++; }
        if (best === null) { refusedLines.push([gb, name, d, 'no stretch of this line is inside the mesh with the cover kept']); return; }
        var refine = function (g_, b_) { for (var q = 0; q < 30; q++) { var m_ = (g_ + b_) / 2; if (okAt(m_)) g_ = m_; else b_ = m_; } return g_; };
        var ua = best[0] === 0 ? us[best[0]] : refine(us[best[0]], us[best[0] - 1]), ub = best[1] === us.length - 1 ? us[best[1]] : refine(us[best[1]], us[best[1] + 1]);
        if (ub - ua <= 2 * r + 1e-6) { refusedLines.push([gb, name, d, 'inside stretch ' + fx(1000 * (ub - ua), 1) + ' mm is shorter than the bar diameter']); return; }
        var P0 = loc2w(ua, v, z), P1 = loc2w(ub, v, z); (BARS[name] = BARS[name] || []).push.apply(BARS[name], G.prism(P0, P1, r)); (lens[name] = lens[name] || []).push(ub - ua); nLinesOk++;
        if (ub - ua > STOCK) info.lap.push([name, d, ub - ua]);
      }
      for (var li = 0; li < lines.length; li++) { yield* barLine(lines[li]); if (K.due()) yield K.state.prog; }
      info.bar_lens = lens; info.bar_tris = BARS;
      // ---- stirrups: closed outer loops at the stated spacing, each must fit the mesh with the cover kept
      var hx = Wd / 2 - PLC - ds / 2 - 2 * MARG, hy = Hd / 2 - PLC - ds / 2 - 2 * MARG, vc = (lo[1] + hi[1]) / 2, zc = (lo[2] + hi[2]) / 2, tl = G.tieLoop(vc, zc, 0.0, hx, hy, ds / 2);   // the tie frame (X, Y, Z) = (v, z, u)
      var toW = function (p) { return [o[0] + p[2] * u3[0] + p[0] * v3[0] + p[1] * z3[0], o[1] + p[2] * u3[1] + p[0] * v3[1] + p[1] * z3[1], o[2] + p[2] * u3[2] + p[0] * v3[2] + p[1] * z3[2]]; };
      var tw = tl.map(function (t) { return t.map(toW); }), seen = {}, uniq = [];
      tw.forEach(function (t) { t.forEach(function (p) { var q = [Math.round(p[0] * 1e9) / 1e9, Math.round(p[1] * 1e9) / 1e9, Math.round(p[2] * 1e9) / 1e9], key = q.join(','); if (!seen[key]) { seen[key] = 1; uniq.push(q); } }); });
      var starts = [], u0 = lo[0] + PLC + ds / 2 + 2 * MARG, k2 = 0; while (u0 + k2 * sp <= hi[0] - PLC - ds / 2 - 2 * MARG + 1e-9) { starts.push(u0 + k2 * sp); k2++; }
      var fits = []; for (var fi = 0; fi < starts.length; fi++) { var u = starts[fi], ok1 = true; for (var q = 0; q < uniq.length; q++) if (!TS.clear([uniq[q][0] + u * u3[0], uniq[q][1] + u * u3[1], uniq[q][2] + u * u3[2]], THR)) { ok1 = false; break; } fits.push(ok1); if (K.due()) yield K.state.prog; }
      nCand += starts.length; var nOk = fits.filter(Boolean).length; nCandOk += nOk;
      info.stirrup_candidates = starts.length; info.stirrup_placed = nOk; info.stirrup_u = starts.filter(function (u, q) { return fits[q]; });
      info.stirrup_tris = info.stirrup_u.map(function (u) { return tw.map(function (t) { return t.map(function (p) { return [p[0] + u * u3[0], p[1] + u * u3[1], p[2] + u * u3[2]]; }); }); });
      REC[gb] = info; info.TS = TS; info.loc2w = loc2w; return info;
    }

    function* beamStep(gb) {
      if (unjoined.indexOf(gb) >= 0) return;
      var info = yield* buildBeam(gb), mk = info.mark, row = MARKS[mk];
      if (info.ds === undefined) { change('NOT_BUILT', gb, HC, gb, 'Schedule row has no readable stirrup', 'mark ' + mk + ' | ' + pyList(info.notes)); return; }
      var stor = META[gb].storey, src = row.source || '';
      var DESC = { BOT: ['Bottom bars', 'bottom', 'bottom (A + ADD B)'], TOP: ['Top bars', 'top', 'top (D + E)'], SIDE: ['Side bars', 'side', 'side'] };
      ['BOT', 'TOP', 'SIDE'].forEach(function (name) {
        var tris = info.bar_tris[name], j = function (a2) { return a2.map(function (nd) { return nd[0] + 'T' + nd[1]; }).join(' + '); };
        var stated = name === 'BOT' ? j(row.bottom) : name === 'TOP' ? j(row.top) : (row.side || '');
        var want = name === 'BOT' ? info.bot_dias.length : name === 'TOP' ? info.top_dias.length : 2 * (info.side_levels || 0);
        if (!tris || !tris.length) { if (want) change('REFUSED', 'GEN-RB-' + gb + '-' + name, 'IfcReinforcingBar', gb, DESC[name][0] + ': no bar placed', 'mark ' + mk + ' stated "' + stated + '" (' + src + ') | wanted ' + want + ' bars, none fits inside the mesh with the cover kept'); return; }
        var ls = info.bar_lens[name], placed = ls.length, lap = info.lap.filter(function (x) { return x[0] === name; }), layers = info.layer_detail[name], guid = 'GEN-RB-' + gb + '-' + name;
        writePart(guid, 'Beam ' + DESC[name][1] + ' bars ' + placed + ' x ' + stated + ' [stated "' + stated + '" | mark ' + mk + ' ' + src + ']', gb, tris);
        var layTxt = name === 'SIDE' ? '' : ' | ' + layers.length + ' layer(s): ' + layers.map(function (kd) { return kd[0] + ' bar(s) up to T' + kd[1]; }).join(', ');
        var sideTxt = name === 'SIDE' ? ' | side levels per face ' + S(info.side_levels) + ', parse ' + (info.side_parse && typeof info.side_parse === 'object' ? pyDict(info.side_parse) : S(info.side_parse)) : '';
        change('ADDED', guid, 'IfcReinforcingBar', gb, 'Beam ' + DESC[name][2] + ' bars from schedule mark ' + mk + '; one layer each at cover ' + fmtG(PLC * 1000) + ' mm + stirrup + d/2 across the width, a further layer only where min clear ' + fmtG(MINCL * 1000) + ' mm would break; bar = stretch of its line inside the mesh with the cover kept; no anchorage, no laps [' + srcHead(RULES.beam_cover_mm) + '; ' + srcHead(RULES.beam_min_clear_mm) + ']',
          'stated "' + stated + '" (' + src + ') | ' + placed + ' of ' + want + ' bars placed | length ' + fx(Math.min.apply(null, ls) * 1000, 0) + '..' + fx(Math.max.apply(null, ls) * 1000, 0) + ' mm of a ' + fx(info.L * 1000, 0) + ' mm beam' + layTxt + sideTxt + (lap.length ? ' | needs lap (not modelled): ' + lap.length + ' bar(s) over ' + fmtG(STOCK) + ' m' : '') + ' | storey ' + stor);
      });
      var legs = S(row.stirrup_legs), dsMm = row.stirrup[0], spMm = row.stirrup[1];
      if (info.stirrup_placed) {
        var trisS = []; info.stirrup_tris.forEach(function (ts) { ts.forEach(function (t) { trisS.push(t); }); });
        var gS = 'GEN-RB-' + gb + '-STR';
        writePart(gS, 'Beam stirrups ' + info.stirrup_placed + ' x T' + dsMm + ' @ ' + spMm + ' [stated "' + legs + 'T' + dsMm + '-' + spMm + '" | mark ' + mk + ' ' + src + ']', gb, trisS);
        change('ADDED', gS, 'IfcReinforcingBar', gb, 'Beam stirrups from schedule mark ' + mk + '; closed outer loops at the stated end-zone dia and spacing, first at cover + d/2 from the beam end, a loop that does not fit the mesh with cover ' + fmtG(PLC * 1000) + ' mm is skipped; hooks not modelled [' + srcHead(RULES.beam_stirrup_rule) + ']',
          'stated "' + legs + 'T' + dsMm + '-' + spMm + '" (' + src + ') | ' + info.stirrup_placed + ' loops of ' + info.stirrup_candidates + ' positions (' + (info.stirrup_candidates - info.stirrup_placed) + ' skipped, section cut) | loop z..u from ' + fx(Math.min.apply(null, info.stirrup_u) * 1000, 0) + ' to ' + fx(Math.max.apply(null, info.stirrup_u) * 1000, 0) + ' mm along the beam | storey ' + stor);
      } else change('REFUSED', 'GEN-RB-' + gb + '-STR', 'IfcReinforcingBar', gb, 'Stirrups: no loop fits', 'mark ' + mk + ' stated "' + legs + 'T' + dsMm + '-' + spMm + '" (' + src + ') | ' + info.stirrup_candidates + ' positions, none fits the mesh with the cover kept');
      var nb = [];
      if (row.hanger && row.hanger.length) nb.push('hanger column C ' + row.hanger.map(function (nd) { return nd[0] + 'T' + nd[1]; }).join(' + '));
      if (row.stirrup_inner) nb.push('inner legs ' + row.stirrup_inner);
      if (row.stirrup_balance && JSON.stringify(row.stirrup_balance) !== JSON.stringify(row.stirrup)) nb.push('balance zone T' + row.stirrup_balance[0] + '-' + row.stirrup_balance[1] + ' (end-zone spacing used over the full length: zone length not stated)');
      if (nb.length) change('NOT_BUILT', gb, HC, gb, 'Stated on the schedule, not modelled', 'mark ' + mk + ' (' + src + ') | ' + nb.join('; '));
    }
    for (var hi = 0; hi < hosts.length; hi++) { K.state.prog = { label: 'Beam rebar: beam', done: hi, total: hosts.length }; yield* beamStep(hosts[hi]); if (K.due()) { K.state.prog = { label: 'Beam rebar: beam', done: hi + 1, total: hosts.length }; yield K.state.prog; } }
    refusedLines.forEach(function (r) { change('REFUSED', 'GEN-RB-' + r[0] + '-' + r[1], 'IfcReinforcingBar', r[0], 'Bar line T' + r[2] + ' (' + r[1] + '): not placed', r[3]); });
    var built = hosts.filter(function (g) { return REC[g] && REC[g].ds !== undefined; }).length, cnt = { ADDED: 0, NOT_BUILT: 0, REFUSED: 0 }; CH.forEach(function (c) { cnt[c.kind]++; });
    LOG(P + 'BUILT beams_built=' + built + ' sets_added=' + cnt.ADDED + ' bar_lines=' + nLines + ' bar_lines_placed=' + nLinesOk + ' stirrup_positions=' + nCand + ' stirrup_loops_placed=' + nCandOk);
    var usedMarks = Object.keys(used), nBars = 0; Object.keys(REC).forEach(function (g) { var bl = REC[g].bar_lens || {}; Object.keys(bl).forEach(function (k) { nBars += bl[k].length; }); });
    var bal = usedMarks.filter(function (m) { var r = MARKS[m]; return r.stirrup_balance && JSON.stringify(r.stirrup_balance) !== JSON.stringify(r.stirrup); }).sort();
    LOG(P + 'ASSUMED anchorage=' + rv('beam_anchorage_modelled') + ' stirrup_hooks=' + rv('beam_hooks_modelled') + ' laps=' + rv('beam_laps_modelled') + ' stock_checked_bars=' + nBars + ' hanger_C_built=' + rv('beam_hanger_C_built') + ' hanger_C_marks=' + usedMarks.filter(function (m) { return MARKS[m].hanger && MARKS[m].hanger.length; }).length + ' balance_zone_differs_marks=' + pyList(bal) + ' inner_legs_marks=' + usedMarks.filter(function (m) { return MARKS[m].stirrup_inner; }).length);
    var spc = {}; hosts.forEach(function (g) { if (REC[g] && REC[g].side_parse) { var k = typeof REC[g].side_parse === 'object' ? pyDict(REC[g].side_parse) : String(REC[g].side_parse); spc[k] = (spc[k] || 0) + 1; } });
    LOG(P + 'SIDE_PARSE ' + (Object.keys(spc).length ? Object.keys(spc).sort().map(function (k) { return k + ' x' + spc[k]; }).join(' | ') : 'no side strings'));
    var heap = (typeof performance !== 'undefined' && performance.memory) ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null, ms = Date.now() - t0;
    LOG(P + 'SUMMARY added=' + cnt.ADDED + ' not_built=' + cnt.NOT_BUILT + ' refused=' + cnt.REFUSED + ' sets=' + parts.length + ' addedVerts=' + addedVerts + ' ms=' + ms + ' heapMB=' + heap + (parts.length ? '' : ' INCONCLUSIVE (no beam joined a schedule mark: nothing was judged)'));
    return { parts: parts, changes: CH, stats: { added: cnt.ADDED, notBuilt: cnt.NOT_BUILT, refused: cnt.REFUSED, addedVerts: addedVerts, appliesTo: hosts.length - unjoined.length, judged: hosts.length - unjoined.length, beamsBuilt: built, barLines: nLines, barLinesPlaced: nLinesOk, stirrupPositions: nCand, stirrupLoopsPlaced: nCandOk, ms: ms,
      say: parts.length ? undefined : (hosts.length ? 'Beam rebar: no beam joined a schedule mark (' + hosts.length + ' beams matched, ' + Object.keys(MARKS).length + ' marks loaded).' : 'Beam rebar: no ' + HC + ' name matches the format ' + FMT.id + ' (' + J.classCount + ' ' + HC + ' in the model).') },
      audit: { hosts: hosts, HM: HM, unjoined: unjoined, REC: REC, MARKS: MARKS, used: used, unused: unused, refusedLines: refusedLines, COVER: COVER, MINCL: MINCL, STOCK: STOCK, SIDES: SIDES, RB_NV: SIDES * 4 * 3, LOOP_NV: 4 * SIDES * 2 * 3 } };
  }

  // the panel's measured count: beams that join a loaded schedule mark (0 until a schedule is loaded; read-only, no geometry is touched)
  function appliesTo(inp, rows) {
    var MARKS = marksOf(inp); if (!MARKS || !rows) return 0;
    try { var J = joinOf(inp, rows, MARKS); return J.hosts.length - J.unjoined.length; } catch (e) { return 0; }
  }
  var API = { id: 'beambars', label: 'Beam rebar (schedule)', unit: 'beams', rulesFile: 'rules/beambar_defaults.json', run: run, runSteps: runSteps, appliesTo: appliesTo,
    inputs: [{ id: 'schedule', label: 'Load schedule…', accept: '.json,application/json,.dxf', validate: validateMarks, read: readSchedule }],
    dataFiles: [{ id: 'formats', label: 'Formats', file: 'rules/schedule_formats.json' }],   // P8: editable data the pack reads (the panel's Formats link); validated by LodSchedule.validateFormats
    validateMarks: validateMarks, attachFormat: attachFormat, readSchedule: readSchedule, formatOf: formatOf, parseSide: parseSide, joinOf: joinOf, TriSet: TriSet, planAngle: planAngle, modalZ: modalZ, roundHalfEven: roundHalfEven };
  if (typeof window !== 'undefined' && window.LodRegistry) window.LodRegistry.register(API);   // browser: the pack registers itself; adding a pack needs no dialog change
  return API;
});
