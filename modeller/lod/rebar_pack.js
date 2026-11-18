// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — rebar_pack.js: the LOD Upgrade pack "Rebar from DXF-attached schedules". Read the §LODUP_* log after every run; the exit code is not evidence.
// Implementing prompts/MODELLER_LOD_UPGRADE_PILL.md §4 P1 — Witness: W-LODUP-REBAR (modeller/tests/witness_lodup_rebar.js).
// Issue proved/disproved: "the browser result differs from the proven Python result" (BIMCompiler scripts/lod/rebar_from_schedule.py, sections A: footings, columns, ties, beams not built).
// Port of the Python oracle, same maths and same order of everything; deterministic (no clock, no random, every loop over sorted keys). Welds are P2, not here.
// Pure: input in, parts + change rows out. No DOM, no DB. Node + browser (window.LodRebarPack).
// INPUT  in.meta   {guid: {cls, name, storey, disc, building}}      every element of the open model
//        in.sched  {guid: {name: value}}                            the DXF-attached schedule rows (element_dxf2bim)
//        in.world(guid) -> Float64Array xyz triangle soup, or null  the element's world mesh (the MESH, never the DB rtree: spec §5)
//        in.callouts  [[handle, text]] optional                      beam callout texts of a details sheet (listed on the NOT_BUILT rows)
// RULES  resolved rule rows {key: {value, unit, source}} (lod_rules.js)
// OPTS   {breakCover: bool (the red control: bars placed with no cover, INSIDE must FAIL), log: fn(line)}
// OUTPUT {parts:[{guid, cls, name, storey, disc, building, tris:Float64Array, parents:[guid], rgba}], changes:[{kind,guid,cls,host,rule,detail}], setDims, audit, stats}
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LodRebarPack = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var IN = 0.0254;   // inches -> metres, exact by definition
  var RB_RGBA = '0.45,0.20,0.12,1.000';

  // ---- formatting twins of Python's format specs
  function fmtG(x) { return String(parseFloat(Number(x).toPrecision(6))); }                  // {:g}
  function S(x) { return x === undefined || x === null ? 'None' : String(x); }                // a missing dict.get prints as None
  function srcHead(row) { return String(row.source).split(' (')[0]; }

  // ---- vectors
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { return Math.sqrt(dot(a, a)); }
  function unit(a) { var n = norm(a); return [a[0] / n, a[1] / n, a[2] / n]; }

  // ---- parse the stated strings (same regexes as the oracle)
  function parseDiaSpacing(s) {   // '10dia @ 5" C/C (A)'  /  '12 mm dia @ 6" C/C'  -> [dia_mm, spacing_m, letter, spacing_in]
    var m = /^\s*(\d+(?:\.\d+)?)\s*(?:mm)?\s*dia\s*@\s*(\d+(?:\.\d+)?)\s*"\s*C\/C(?:\s*\((\w)\))?\s*$/.exec(s || '');
    return m ? [parseFloat(m[1]), parseFloat(m[2]) * IN, m[3] || null, parseFloat(m[2])] : null;
  }
  function parseMain(s) { var m = /^\s*(\d+)\s*-\s*(\d+(?:\.\d+)?)\s*dia\s*$/.exec(s || ''); return m ? [parseInt(m[1], 10), parseFloat(m[2])] : null; }
  function parseFtIn(s) { var m = /^\s*(\d+)'\s*-\s*(\d+(?:\.\d+)?)"\s*$/.exec(s || ''); return m ? (parseInt(m[1], 10) * 12 + parseFloat(m[2])) * IN : null; }
  function parseSizeIn(s) { var m = /^\s*(\d+(?:\.\d+)?)"\s*x\s*(\d+(?:\.\d+)?)"\s*$/.exec(s || ''); return m ? [parseFloat(m[1]) * IN, parseFloat(m[2]) * IN] : null; }
  function parseFracIn(s) { var m = /^(\d+)(?:\/(\d+))?$/.exec(s); return m ? (m[2] ? parseInt(m[1], 10) / parseInt(m[2], 10) : parseFloat(m[1])) * IN : null; }

  // ---- mesh helpers on a flat soup
  function aabb(V) {
    var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (var i = 0; i < V.length; i += 3) for (var a = 0; a < 3; a++) { var v = V[i + a]; if (v < lo[a]) lo[a] = v; if (v > hi[a]) hi[a] = v; }
    return [lo, hi];
  }
  function meshVolume(V) {
    var s = 0;
    for (var i = 0; i + 8 < V.length; i += 9) {
      var a = [V[i], V[i + 1], V[i + 2]], b = [V[i + 3], V[i + 4], V[i + 5]], c = [V[i + 6], V[i + 7], V[i + 8]];
      s += dot(a, cross(b, c));
    }
    return Math.abs(s / 6.0);
  }
  function isBox(V) { var bb = aabb(V), p = (bb[1][0] - bb[0][0]) * (bb[1][1] - bb[0][1]) * (bb[1][2] - bb[0][2]); return Math.abs(meshVolume(V) - p) <= 1e-4 * p; }

  // ---- geometry builders (triangle soup, outward-wound), SIDES from the rule row
  function make(SIDES) {
    function ringDirs() { var o = []; for (var k = 0; k < SIDES; k++) o.push(2 * Math.PI * k / SIDES); return o; }
    var DIRS = ringDirs();
    function triOut(p0, p1, p2, ref) {
      var n = cross(sub(p1, p0), sub(p2, p0)), c = mul(add(add(p0, p1), p2), 1 / 3);
      return dot(n, sub(c, ref)) >= 0 ? [p0, p1, p2] : [p0, p2, p1];
    }
    function prism(P0, P1, r) {
      var ax = sub(P1, P0), L = norm(ax); ax = mul(ax, 1 / L);
      var e1 = unit(cross(ax, Math.abs(ax[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0])), e2 = cross(ax, e1);
      var ring = function (C) { return DIRS.map(function (t) { return add(C, add(mul(e1, r * Math.cos(t)), mul(e2, r * Math.sin(t)))); }); };
      var a = ring(P0), b = ring(P1), tris = [], ref = mul(add(P0, P1), 0.5);
      for (var k = 0; k < SIDES; k++) {
        var k2 = (k + 1) % SIDES;
        tris.push(triOut(a[k], a[k2], b[k2], ref)); tris.push(triOut(a[k], b[k2], b[k], ref));
        tris.push(triOut(P1, b[k], b[k2], sub(P1, ax))); tris.push(triOut(P0, a[k], a[k2], add(P0, ax)));
      }
      return tris;
    }
    function tieLoop(cx, cy, z, hx, hy, r) {
      var P = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(function (s) { return [cx + s[0] * hx, cy + s[1] * hy, z]; });
      var T = [0, 1, 2, 3].map(function (i) { return unit(sub(P[(i + 1) % 4], P[i])); });
      var N = T.map(function (t) { return cross([0, 0, 1], t); }), zhat = [0, 0, 1], rings = [];
      for (var i = 0; i < 4; i++) {
        var n0 = N[(i + 3) % 4], n1 = N[i], qd = mul(add(n0, n1), 1 / (1 + dot(n0, n1)));
        rings.push(DIRS.map(function (t) { return add(P[i], add(mul(zhat, r * Math.cos(t)), mul(qd, r * Math.sin(t)))); }));
      }
      var tris = [];
      for (var j = 0; j < 4; j++) {
        var a = rings[j], b = rings[(j + 1) % 4], ref = mul(add(P[j], P[(j + 1) % 4]), 0.5);
        for (var k = 0; k < SIDES; k++) { var k2 = (k + 1) % SIDES; tris.push(triOut(a[k], a[k2], b[k2], ref)); tris.push(triOut(a[k], b[k2], b[k], ref)); }
      }
      return tris;
    }
    return { prism: prism, tieLoop: tieLoop };
  }
  function flat(tris) { var o = new Float64Array(tris.length * 9), i = 0; tris.forEach(function (t) { for (var k = 0; k < 3; k++) { o[i++] = t[k][0]; o[i++] = t[k][1]; o[i++] = t[k][2]; } }); return o; }

  function run(inp, RULES, opts) {
    opts = opts || {}; var LOG = opts.log || function () { };
    var rv = function (k) { if (!RULES[k]) throw new Error('rule row missing: ' + k); return RULES[k].value; };
    var SIDES = parseInt(rv('bar_sides'), 10), G = make(SIDES);
    var COVER_F = rv('footing_cover_mm') / 1000, COVER_C = rv('column_cover_mm') / 1000, STOCK = rv('stock_length_mm') / 1000;
    var zoneIn = rv('column_zone_A_stated_in'), ZONE_STATED = zoneIn == null ? 0 : zoneIn * IN;
    var ZLABEL = zoneIn == null ? 'stated -' : 'stated ' + fmtG(zoneIn) + 'in';
    var ZLABEL_RULE = zoneIn == null ? 'stated -' : 'stated ' + fmtG(zoneIn) + ' in';   // the rule column spells the unit with a space, the detail column without (as the oracle does)
    var BREAK = !!opts.breakCover, PLACE_F = BREAK ? 0 : COVER_F, PLACE_C = BREAK ? 0 : COVER_C;
    var META = inp.meta, ST = inp.sched || {};
    LOG('§LODUP_REBAR_MODE break=' + (BREAK ? 1 : 0) + ' cover_footing_rule_mm=' + fmtG(COVER_F * 1000) + ' cover_column_rule_mm=' + fmtG(COVER_C * 1000) + ' placement_cover_footing_mm=' + fmtG(PLACE_F * 1000) + ' placement_cover_column_mm=' + fmtG(PLACE_C * 1000));
    var allG = Object.keys(META).sort();
    var byClass = function (cl) { return allG.filter(function (g) { return META[g].cls === cl; }); };
    var sched = function (g) { return ST[g] || {}; };
    var parts = [], CH = [], addedVerts = 0, setDims = [];
    var change = function (kind, guid, cls, host, rule, detail) { CH.push({ kind: kind, guid: guid, cls: cls, host: host, rule: rule, detail: detail }); };
    var writePart = function (guid, name, g0, tris, parents) { var m = META[g0]; parts.push({ guid: guid, cls: 'IfcReinforcingBar', name: name, storey: m.storey, disc: m.disc, building: m.building, tris: flat(tris), parents: parents.slice(), rgba: RB_RGBA }); addedVerts += tris.length * 3; };

    // ------------------------------------------------ A. footings and columns
    var F_IDS = byClass('IfcFooting').filter(function (g) { return sched(g).Sched_Footing_L_Bar !== undefined; });
    var C_IDS = byClass('IfcColumn').filter(function (g) { return sched(g).Sched_Column_Main_Bar !== undefined; });
    var BOX = {}, refused = {}, judged = 0;
    F_IDS.concat(C_IDS).sort().forEach(function (g) {
      var V = inp.world(g); if (V && V.length) judged++;   // judged = scheduled elements whose mesh the run can read
      if (!V || !V.length || !isBox(V)) { refused[g] = 'mesh is not an axis-aligned box'; return; }
      BOX[g] = aabb(V);
    });
    LOG('§LODUP_REBAR_INPUT footings_with_schedule=' + F_IDS.length + ' column_pieces_with_schedule=' + C_IDS.length + ' boxes_ok=' + Object.keys(BOX).length + ' refused=' + Object.keys(refused).length);
    var statedFooting = function (g) { var s = sched(g); return [parseDiaSpacing(s.Sched_Footing_L_Bar), parseDiaSpacing(s.Sched_Footing_S_Bar)]; };
    var nAddedF = 0, fCounts = {}, nFootBars = 0, fSets = 0;
    F_IDS.slice().sort().forEach(function (g) {
      if (refused[g]) { change('REFUSED', g, META[g].cls, g, 'Footing mesh', refused[g]); return; }
      var s = sched(g), LS = statedFooting(g), L = LS[0], Sb = LS[1];
      if (!L || !Sb) { change('REFUSED', g, META[g].cls, g, 'Footing mesh', 'could not parse stated bars L="' + S(s.Sched_Footing_L_Bar) + '" S="' + S(s.Sched_Footing_S_Bar) + '"'); return; }
      var lo = BOX[g][0], hi = BOX[g][1], dim = sub(hi, lo), cx = (lo[0] + hi[0]) / 2, cy = (lo[1] + hi[1]) / 2; void cx; void cy;
      var longAx = dim[0] >= dim[1] ? 0 : 1, shortAx = 1 - longAx;
      var m = /^(.*)\s+x\s+(.*)$/.exec(s.Sched_Footing_Size_L_x_B || ''), stL = m ? parseFtIn(m[1]) : null, stB = m ? parseFtIn(m[2]) : null;
      var stT = s.Sched_Footing_T ? parseFracIn(s.Sched_Footing_T.replace(/"+$/, '')) : null;
      if (stL && stB && stT) { var srt = [stL, stB].sort(function (a, b) { return a - b; }), mnd = Math.min(dim[0], dim[1]), mxd = Math.max(dim[0], dim[1]); setDims.push(['footing', g, Math.max(Math.abs(srt[0] - mnd), Math.abs(srt[1] - mxd), Math.abs(stT - dim[2])) * 1000]); }
      var first = rv('footing_bottom_layer'), order = first === 'L_Bar' ? ['L_Bar', 'S_Bar'] : ['S_Bar', 'L_Bar'];
      var spec = { L_Bar: L, S_Bar: Sb }, zCursor = lo[2] + PLACE_F, zc = {};
      order.forEach(function (k) { zc[k] = zCursor + spec[k][0] / 2000.0; zCursor += spec[k][0] / 1000.0; });
      [['L_Bar', longAx, shortAx], ['S_Bar', shortAx, longAx]].forEach(function (kk) {
        var k = kk[0], axRun = kk[1], axDist = kk[2], d_mm = spec[k][0], sp = spec[k][1], spIn = spec[k][3], d = d_mm / 1000, side = dim[axDist];
        var n = Math.floor((side - 2 * PLACE_F - d) / sp + 1e-9) + 1, nSpec = Math.floor((side - 2 * PLACE_F) / sp + 1e-9) + 1;
        var avail = side - 2 * (PLACE_F + d / 2), marg = (avail - (n - 1) * sp) / 2, tris = [];
        for (var i = 0; i < n; i++) {
          var pos = lo[axDist] + PLACE_F + d / 2 + marg + i * sp, P0 = [0, 0, 0], P1 = [0, 0, 0];
          P0[axRun] = lo[axRun] + PLACE_F; P1[axRun] = hi[axRun] - PLACE_F; P0[axDist] = P1[axDist] = pos; P0[2] = P1[2] = zc[k];
          G.prism(P0, P1, d / 2).forEach(function (t) { tris.push(t); });
        }
        var blen = hi[axRun] - lo[axRun] - 2 * PLACE_F;
        if (blen > STOCK) { change('REFUSED', g, META[g].cls, g, 'Footing mesh', 'bar ' + (blen * 1000).toFixed(1) + ' mm longer than stock ' + fmtG(STOCK * 1000) + ' mm and laps are not modelled'); return; }
        var st = s['Sched_Footing_' + k];
        var nm = 'Footing ' + k + ' ' + n + ' x ' + fmtG(d_mm) + ' mm @ ' + fmtG(spIn) + '" c/c [stated "' + st + '" | ' + S(s.SchedSource_footing) + ']';
        var guid = 'GEN-RB-' + g + '-' + (k === 'L_Bar' ? 'L' : 'S');
        writePart(guid, nm, g, tris, [g]);
        change('ADDED', guid, 'IfcReinforcingBar', g, 'Footing mesh from schedule ' + S(s.Sched_Footing_Type) + '; cover ' + fmtG(PLACE_F * 1000) + ' mm [' + srcHead(RULES.footing_cover_mm) + ']; layer order ' + first + ' first [' + srcHead(RULES.footing_bottom_layer) + ']',
          k + ': stated "' + st + '" (' + S(s.SchedSource_footing) + ') | ' + n + ' bars (spec formula alone gives ' + nSpec + ') | each ' + (blen * 1000).toFixed(1) + ' mm long, runs along ' + 'xy'[axRun] + ' | centred in the cover-bounded span (margin ' + (marg * 1000).toFixed(2) + ' mm beyond cover) | storey ' + META[g].storey);
        fCounts[g + '|' + k] = [n, nSpec]; nAddedF++; nFootBars += n;
      });
    });
    fSets = nAddedF;
    LOG('§LODUP_REBAR_FOOTING sets_added=' + nAddedF + ' footings=' + (F_IDS.length - F_IDS.filter(function (g) { return refused[g]; }).length) + ' bars=' + nFootBars);

    // ---- columns: group the pieces into drawn columns by plan position
    var groups = [];
    C_IDS.slice().sort().forEach(function (g) {
      if (refused[g]) { change('REFUSED', g, 'IfcColumn', g, 'Column bars', refused[g]); return; }
      var lo = BOX[g][0], hi = BOX[g][1], c = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2], hit = false;
      for (var i = 0; i < groups.length; i++) { var Gi = groups[i]; if (Math.abs(Gi.c[0] - c[0]) <= 0.002 && Math.abs(Gi.c[1] - c[1]) <= 0.002) { Gi.pieces.push(g); hit = true; break; } }
      if (!hit) groups.push({ c: c, pieces: [g] });
    });
    var sizes = {}; groups.forEach(function (Gr) { sizes[Gr.pieces.length] = (sizes[Gr.pieces.length] || 0) + 1; });
    var sizeKeys = Object.keys(sizes).sort(function (a, b) { return a - b; });
    LOG('§LODUP_REBAR_COLGROUP drawn_columns=' + groups.length + ' pieces_per_column=' + JSON.stringify(sizes) + ' -> ' + (sizeKeys.length === 1 && sizeKeys[0] === '3' ? 'PASS' : 'FAIL'));
    var FOOT = {}; F_IDS.forEach(function (g) { if (BOX[g]) FOOT[g] = BOX[g]; });
    var nMain = 0, nTieA = 0, nTieB = 0, zoneGov = {}, nCols = 0, sampleL = null, sampleL6 = null;
    groups.slice().sort(function (p, q) { return p.c[0] - q.c[0] || p.c[1] - q.c[1]; }).forEach(function (Gr) {
      var pcs = Gr.pieces.slice().sort(function (a, b) { return (BOX[a][0][2] - BOX[b][0][2]) || (a < b ? -1 : a > b ? 1 : 0); }), host0 = pcs[0];
      var refuse = function (why) { pcs.forEach(function (g) { change('REFUSED', g, 'IfcColumn', host0, 'Column bars', why); }); };
      if (pcs.length !== 3) { refuse(pcs.length + ' pieces at this plan position, expected 3'); return; }
      for (var i = 0; i < 2; i++) if (!(Math.abs(BOX[pcs[i]][1][2] - BOX[pcs[i + 1]][0][2]) <= 0.001)) { refuse('pieces are not stacked contiguously (gap > 1 mm)'); return; }
      var rows = pcs.map(sched), keys = ['Sched_Column_Main_Bar', 'Sched_Column_Stirrup_A', 'Sched_Column_Stirrup_B', 'Sched_Column_Type', 'SchedSource_column'];
      if (rows.some(function (r) { return keys.some(function (k) { return r[k] !== rows[0][k]; }); })) { refuse('the pieces carry different schedule rows'); return; }
      var mb = parseMain(rows[0].Sched_Column_Main_Bar), tA = parseDiaSpacing(rows[0].Sched_Column_Stirrup_A), tB = parseDiaSpacing(rows[0].Sched_Column_Stirrup_B);
      if (!(mb && tA && tB && tA[2] === 'A' && tB[2] === 'B')) { refuse('could not parse stated bars main="' + S(rows[0].Sched_Column_Main_Bar) + '" A="' + S(rows[0].Sched_Column_Stirrup_A) + '" B="' + S(rows[0].Sched_Column_Stirrup_B) + '"'); return; }
      if (mb[0] !== 6) { refuse('stated ' + mb[0] + ' main bars; the arrangement rule (3 + 3 on two faces) fits 6 only'); return; }
      var dm = mb[1] / 1000, dt = Math.max(tA[0], tB[0]) / 1000, sA = tA[1], sB = tB[1];
      var fl = Object.keys(FOOT).filter(function (g) { var b = FOOT[g]; return b[0][0] <= Gr.c[0] && Gr.c[0] <= b[1][0] && b[0][1] <= Gr.c[1] && Gr.c[1] <= b[1][1]; });
      if (fl.length !== 1) { refuse(fl.length + ' footings under the column centre, expected 1'); return; }
      var fg = fl[0], flo = FOOT[fg][0], LS = statedFooting(fg), Ls = LS[0], Ss = LS[1];
      if (!Ls || !Ss) { refuse('footing under it has no parsable bars'); return; }
      var d12 = rv('footing_bottom_layer') === 'L_Bar' ? [Ls[0], Ss[0]] : [Ss[0], Ls[0]];
      var zMeshTop = flo[2] + PLACE_F + (d12[0] + d12[1]) / 1000.0;
      var zbot = BOX[pcs[0]][0][2], ztop = BOX[pcs[2]][1][2], H = ztop - zbot;
      var hx = Math.min.apply(null, pcs.map(function (g) { return (BOX[g][1][0] - BOX[g][0][0]) / 2; })), hy = Math.min.apply(null, pcs.map(function (g) { return (BOX[g][1][1] - BOX[g][0][1]) / 2; }));
      var cx = (pcs.map(function (g) { return (BOX[g][0][0] + BOX[g][1][0]) / 2; }).reduce(function (a, b) { return a + b; }, 0)) / pcs.length;
      var cy = (pcs.map(function (g) { return (BOX[g][0][1] + BOX[g][1][1]) / 2; }).reduce(function (a, b) { return a + b; }, 0)) / pcs.length;
      var sa = parseSizeIn(rows[0].Sched_Column_Above_Gr), sb = parseSizeIn(rows[0].Sched_Column_Below_Gr);
      if (sa && sb) [[pcs[0], sb], [pcs[2], sa]].forEach(function (pw) { var d = sub(BOX[pw[0]][1], BOX[pw[0]][0]); setDims.push(['column', pw[0], Math.max(Math.abs(d[0] - pw[1][0]), Math.abs(d[1] - pw[1][1])) * 1000]); });
      var zoneL6 = H / 6.0, zoneA = Math.max(ZONE_STATED, zoneL6), gov = zoneL6 >= ZONE_STATED ? 'L/6' : ZLABEL; zoneGov[gov] = (zoneGov[gov] || 0) + 1;
      var axN = rv('column_bar_face_normal_axis') === 'x' ? 0 : 1, axT = 1 - axN, half = [hx, hy];
      var offN = half[axN] - (PLACE_C + dt + dm / 2), offT = half[axT] - (PLACE_C + dt + dm / 2);
      var z0 = zMeshTop, z1 = ztop - PLACE_C, blen = z1 - z0;
      if (blen > STOCK) { refuse('main bar ' + blen.toFixed(3) + ' m exceeds stock ' + fmtG(STOCK) + ' m and laps are not modelled'); return; }
      var tris = [];
      [-1, 1].forEach(function (sn) { [-1, 0, 1].forEach(function (st) {
        var P0 = [0, 0, 0], P1 = [0, 0, 0], cc = [cx, cy]; P0[axN] = P1[axN] = cc[axN] + sn * offN; P0[axT] = P1[axT] = cc[axT] + st * offT; P0[2] = z0; P1[2] = z1;
        G.prism(P0, P1, dm / 2).forEach(function (t) { tris.push(t); });
      }); });
      var guid = 'GEN-RB-' + host0 + '-MAIN', r0 = rows[0];
      writePart(guid, 'Column main bars ' + mb[0] + ' x ' + fmtG(mb[1]) + ' mm dia [stated "' + S(r0.Sched_Column_Main_Bar) + '" | ' + S(r0.Sched_Column_Type) + ' ' + S(r0.SchedSource_column) + ']', host0, tris, pcs);
      change('ADDED', guid, 'IfcReinforcingBar', host0, 'Column main bars from schedule ' + S(r0.Sched_Column_Type) + '; 3 + 3 on two opposite faces normal to ' + rv('column_bar_face_normal_axis') + ' [' + srcHead(RULES.column_bar_face_normal_axis) + ']; cover ' + fmtG(PLACE_C * 1000) + ' mm [' + srcHead(RULES.column_cover_mm) + '] on the smallest section; footing mesh top to column top',
        'stated "' + S(r0.Sched_Column_Main_Bar) + '" (' + S(r0.SchedSource_column) + ') | 6 bars, each ' + (blen * 1000).toFixed(1) + ' mm, continuous through ' + pcs.length + ' pieces ' + pcs.join(', ') + ' | lands on footing ' + fg + ' mesh top z=' + zMeshTop.toFixed(4) + ' | stock ' + fmtG(STOCK) + ' m ok, no laps | storey ' + META[host0].storey);
      nMain++;
      var zAlo = zbot + PLACE_C + dt / 2, zAhi = ztop - PLACE_C - dt / 2, nK = Math.floor((zoneA + 1e-9) / sA) + 2, Abot = [], Atop = [];
      for (var k = 0; k < nK; k++) { var zb = zAlo + k * sA; if (zb <= zbot + zoneA + 1e-9) Abot.push(zb); }
      for (var k2 = 0; k2 < nK; k2++) { var zt = zAhi - k2 * sA; if (zt >= ztop - zoneA - 1e-9) Atop.push(zt); }
      Atop.sort(function (a, b) { return a - b; });
      if (!Abot.length || !Atop.length || Abot[Abot.length - 1] >= Atop[0]) { refuse('end zones overlap (column too short for two (A) zones)'); return; }
      var gap = Atop[0] - Abot[Abot.length - 1], nseg = Math.max(1, Math.ceil(gap / sB - 1e-9)), B = [];
      for (var i2 = 1; i2 < nseg; i2++) B.push(Abot[Abot.length - 1] + gap * i2 / nseg);
      var ztAll = Abot.concat(Atop).map(function (z) { return [z, 'A']; }).concat(B.map(function (z) { return [z, 'B']; }));
      var thx = hx - PLACE_C - dt / 2, thy = hy - PLACE_C - dt / 2;
      pcs.forEach(function (g, pi) {
        var zlo = BOX[g][0][2], zhi = BOX[g][1][2], last = pi === 2;
        var mine = ztAll.filter(function (zk) { var z = zk[0]; return (zlo - 1e-9 <= z && z < zhi - 1e-9) || (last && Math.abs(z - zhi) <= 1e-9); });
        [['A', tA], ['B', tB]].forEach(function (kt) {
          var kind = kt[0], tg = kt[1], zs = mine.filter(function (x) { return x[1] === kind; }).map(function (x) { return x[0]; }).sort(function (a, b) { return a - b; });
          if (!zs.length) return;
          var tt = []; zs.forEach(function (z) { G.tieLoop(cx, cy, z, thx, thy, dt / 2).forEach(function (t) { tt.push(t); }); });
          var sfx = kind === 'A' ? 'TA' : 'TB', tg2 = 'GEN-RB-' + g + '-' + sfx, rs = sched(g)['Sched_Column_Stirrup_' + kind];
          writePart(tg2, 'Column ties ' + kind + ' ' + zs.length + ' x ' + fmtG(tg[0]) + ' mm dia @ ' + fmtG(tg[3]) + '" c/c [stated "' + rs + '" | ' + S(sched(g).SchedSource_column) + ']', g, tt, [g]);
          change('ADDED', tg2, 'IfcReinforcingBar', g, 'Column ties (' + kind + ') from schedule ' + S(sched(g).Sched_Column_Type) + '; closed perimeter loops, hooks not modelled, no cross-ties [default: ours]; zone A = max(' + ZLABEL_RULE + ', L/6) = ' + (zoneA * 1000).toFixed(1) + ' mm [' + srcHead(RULES.column_zone_A_rule) + ']; cover ' + fmtG(PLACE_C * 1000) + ' mm',
            'stated "' + rs + '" (' + S(sched(g).SchedSource_column) + ') | ' + zs.length + ' loops in this piece, z ' + zs[0].toFixed(4) + '..' + zs[zs.length - 1].toFixed(4) + ' | clear height L=' + H.toFixed(4) + ' m, L/6=' + zoneL6.toFixed(4) + ' m, ' + ZLABEL + '=' + ZONE_STATED.toFixed(4) + ' m, governs: ' + gov + ' | storey ' + META[g].storey);
          if (kind === 'A') nTieA += zs.length; else nTieB += zs.length;
        });
      });
      nCols++; if (sampleL === null) { sampleL = H; sampleL6 = zoneL6; }
    });
    LOG('§LODUP_REBAR_ZONE columns=' + nCols + ' governs=' + JSON.stringify(zoneGov) + ' (' + ZLABEL + '=' + ZONE_STATED.toFixed(4) + ' m; L/6 per column logged in the change list)' + (nCols ? ' sample_L=' + sampleL.toFixed(4) + ' L/6=' + sampleL6.toFixed(4) : ''));
    LOG('§LODUP_REBAR_ASSUMED tie_hooks=' + rv('tie_hooks_modelled') + ' cross_ties=' + rv('cross_ties_modelled') + ' laps=' + rv('laps_modelled') + ' stock_checked_bars=' + (nAddedF + nMain));

    // ---- not built: beams (no schedule row). callout texts from a details sheet, if given.
    var BEAMS = byClass('IfcBeam'), callouts = (inp.callouts || []).slice().sort(function (a, b) { return parseInt(a[0], 16) - parseInt(b[0], 16) || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0); });
    var noSched = BEAMS.filter(function (g) { return !Object.keys(sched(g)).some(function (k) { return k.indexOf('Sched_') === 0; }); });
    var ctext = callouts.length ? callouts.map(function (c) { return '#' + c[0] + ': ' + c[1]; }).join(' ; ') : 'details sheet not supplied';
    noSched.forEach(function (g) {
      change('NOT_BUILT', g, 'IfcBeam', g, 'Beam bars: no schedule row on the element', '"' + META[g].name + '" | reader task (scope section 5 item 1b): beam rebar callouts are on long sections, not in a table, and the DB does not attribute them to a beam | texts on the details sheet, by drawing handle: ' + ctext);
    });
    LOG('§LODUP_REBAR_BEAMS beams=' + BEAMS.length + ' without_schedule_row=' + noSched.length + ' not_built=' + noSched.length + ' details_sheet_rebar_texts=' + callouts.length + (BEAMS.length ? '' : ' INCONCLUSIVE (no beams)'));

    var cnt = { ADDED: 0, NOT_BUILT: 0, REFUSED: 0 }; CH.forEach(function (c) { cnt[c.kind]++; });
    LOG('§LODUP_REBAR_SUMMARY added=' + cnt.ADDED + ' not_built=' + cnt.NOT_BUILT + ' refused=' + cnt.REFUSED + ' sets=' + parts.length + ' addedVerts=' + addedVerts + (parts.length ? '' : ' INCONCLUSIVE (the model has no footing or column with a schedule row: nothing was judged)'));
    return { parts: parts, changes: CH, setDims: setDims, stats: { added: cnt.ADDED, notBuilt: cnt.NOT_BUILT, refused: cnt.REFUSED, addedVerts: addedVerts, appliesTo: F_IDS.length + C_IDS.length, judged: judged, fSets: fSets, nMain: nMain, nTieA: nTieA, nTieB: nTieB },
      audit: { F_IDS: F_IDS, C_IDS: C_IDS, BOX: BOX, refused: refused, groups: groups, fCounts: fCounts, SIDES: SIDES, COVER_F: COVER_F, COVER_C: COVER_C, ZONE_STATED: ZONE_STATED } };
  }

  // how many elements the pack applies to (the panel's measured count): footings + column pieces carrying a schedule row
  function appliesTo(meta, sched) {
    var n = 0; Object.keys(meta).forEach(function (g) { var c = meta[g].cls, s = sched[g]; if (!s) return; if ((c === 'IfcFooting' && s.Sched_Footing_L_Bar !== undefined) || (c === 'IfcColumn' && s.Sched_Column_Main_Bar !== undefined)) n++; });
    return n;
  }
  var API = { id: 'rebar', label: 'Rebar (from schedules)', rulesFile: 'rules/rebar_defaults.json', run: run,
    appliesTo: function (inp, rows) { if (!rows) return appliesTo(inp.meta, inp.sched || {}); try { return run(inp, rows, { log: function () { } }).stats.judged; } catch (e) { return 0; } },   // with rule rows: what the run judges (read-only dry run)
    fmtG: fmtG, parse: { diaSpacing: parseDiaSpacing, main: parseMain }, RB_RGBA: RB_RGBA, IN: IN, make: make };   // make(SIDES) -> {prism, tieLoop}: the bar and tie geometry, reused by beambar_pack.js (P6)
  if (typeof window !== 'undefined' && window.LodRegistry) window.LodRegistry.register(API);   // browser: the pack registers itself; adding a pack needs no dialog change
  return API;
});
