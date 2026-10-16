// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf2bim_import.js — DXF2BIM lane L3 (prompts/DXF2BIM_MODELLER_LANE.md §L3 "L3 build spec"): the ORCHESTRATION of BIMCompiler
// tests/dxf2bim/rosetta_dx_shell.js pipeline() (variant A, the main model), ported so the Modeller runs the SAME basic-shapes
// pipeline on dropped DXF files. Every geometric rule lives in the verbatim modules under dxf2bim/ (see dxf2bim/SOURCE.md);
// every number comes from dxf2bim/dxf2shell_config.js. This file only: reads sheets, assigns roles from DXF2BIM-MARK markings,
// gates, calls the modules in the witness's order, and maps the result to the Modeller's ARC-seed op form (toOps).
// UMD: Node (witness C1-PORT) and the page (window.Dxf2BimImport). Pure: no DOM, no THREE, no network.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory({ DxfParser: require('./lib/dxf-parser.js'), B: require('./dxf2bim/dxf2bim.js'), MK: require('./dxf2bim/dxf2marks.js'),
      E: require('./dxf2bim/dxf2elev.js'), M: require('./dxf2bim/dxf2mesh.js'), T: require('./dxf2bim/dxf2types.js'), S: require('./dxf2bim/dxf2shell.js'),
      C: require('./dxf2bim/dxf2shell_config.js'), Q: require('./dxf2bim/dxf2qualify.js') });
  } else {
    root.Dxf2BimImport = factory({ DxfParser: root.DxfParser, B: root.Dxf2Bim, MK: root.Dxf2Marks, E: root.Dxf2Elev, M: root.Dxf2Mesh, T: root.Dxf2Types, S: root.Dxf2Shell, C: root.Dxf2ShellConfig, Q: root.Dxf2Qualify });
  }
})(typeof self !== 'undefined' ? self : this, function (L) {
  'use strict';
  var TAG = '§DXF-IMPORT';
  var DxfParser = L.DxfParser, B = L.B, MK = L.MK, E = L.E, M = L.M, T = L.T, S = L.S, C = L.C, Q = L.Q;

  // ---- SHA-256 (FIPS 180-4), synchronous, over the UTF-8 bytes of a string: the modules need a sync hashHex (crypto.subtle is async).
  // Equality with Node crypto is witnessed by C1 (run_id hashes every sheet text and every storey run id).
  var KS = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  function utf8(s) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
    var out = [], i, c; s = unescape(encodeURIComponent(s)); for (i = 0; i < s.length; i++) { c = s.charCodeAt(i); out.push(c); } return new Uint8Array(out);
  }
  function sha256Hex(str) {
    var msg = utf8(str), n = msg.length, nb = ((n + 9 + 63) >> 6) << 6, buf = new Uint8Array(nb), w = new Int32Array(64), i, j, t;
    buf.set(msg); buf[n] = 0x80;
    var bits = n * 8, hi = Math.floor(bits / 4294967296), lo = bits >>> 0;
    buf[nb - 8] = hi >>> 24; buf[nb - 7] = (hi >>> 16) & 255; buf[nb - 6] = (hi >>> 8) & 255; buf[nb - 5] = hi & 255;
    buf[nb - 4] = lo >>> 24; buf[nb - 3] = (lo >>> 16) & 255; buf[nb - 2] = (lo >>> 8) & 255; buf[nb - 1] = lo & 255;
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    for (i = 0; i < nb; i += 64) {
      for (j = 0; j < 16; j++) w[j] = (buf[i + 4 * j] << 24) | (buf[i + 4 * j + 1] << 16) | (buf[i + 4 * j + 2] << 8) | buf[i + 4 * j + 3];
      for (j = 16; j < 64; j++) {
        var x = w[j - 15], y = w[j - 2];
        var s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3), s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
        w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (j = 0; j < 64; j++) {
        var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7)), ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + KS[j] + w[j]) | 0;
        var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10)), mj = (a & b) ^ (a & c) ^ (b & c);
        t = (S0 + mj) | 0; h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0; H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map(function (v) { return ('00000000' + (v >>> 0).toString(16)).slice(-8); }).join('');
  }

  var r6 = B.r6, J = JSON.stringify;
  var FACE_ORDER = ['minY', 'maxY', 'minX', 'maxX'];   // elevation order = the witness's FRONT, REAR, LEFT, RIGHT (deterministic, stated)
  function parse(text) { return new DxfParser().parseSync(text); }

  // ---- R1-R4 sheet roles from DXF2BIM-MARK markings only ----
  function readSheet(name, text, hashHex) {
    var dxf = parse(text), marks = MK.readMarks(dxf.entities), de = MK.describe(marks), d = de.desc;
    var sh = { name: name, text: text, sha: hashHex(text), dxf: dxf, marks: marks.length, desc: d, errors: de.errors, role: null, why: null };
    var missing = [], other = [];
    de.errors.forEach(function (e) { if (e.code === 'MARK:missing') missing = missing.concat(e.keys || []); else other.push(e.code + ' ' + (e.message || '')); });
    if (!marks.length) sh.why = 'no DXF2BIM-MARK marking';
    else if (other.length) sh.why = other.join('; ');
    else if (d.view === 'PLAN' && typeof d.level === 'number' && !missing.length) { sh.role = 'plan'; sh.level = d.level; }
    else if (d.view === 'ELEV' && d.face && !missing.length) { sh.role = 'elev'; sh.face = d.face; }
    else if (d.view === 'ROOF' && typeof d.roof === 'number' && !missing.length) { sh.role = 'roof'; sh.roofZ = d.roof; }   // BIMCompiler #182 (lane L2.3 D1): @VIEW=ROOF + @LEVEL + @ROOF
    else if (d.view === 'SECTION' && d.cut && !missing.length) { sh.role = 'section'; sh.cut = d.cut; }   // §L3.3 R5: @VIEW=SECTION (NEED SET,VIEW,UNITS,HAXIS,CUT + GRIDH, Z)
    else sh.why = 'markings name no role (view=' + d.view + (missing.length ? ', missing ' + missing.join(',') : '') + ')';
    if (sh.role && !(d.units in MK.UNITS)) { sh.role = null; sh.why = 'no @UNITS'; }
    if (sh.role) sh.factor = MK.UNITS[d.units];
    return sh;
  }
  function readSheets(files, opts) {
    var hashHex = (opts && opts.hashHex) || sha256Hex;
    return files.map(function (f) { return readSheet(f.name, f.text, hashHex); });
  }
  // §L3.3 layer-map set (DX or STD): the set whose elevation-wall layer (its MAP_ELEV 'elevwall' rule, read from the copied config) has
  // entities on EVERY elevation sheet; both or neither -> null (the gate refuses, no guess).
  var SETS = { DX: { MAP_PLAN: C.MAP_PLAN, MAP_ELEV: C.MAP_ELEV, MAP_LEVL: C.MAP_LEVL, MAP_ROOF: C.MAP_ROOF, MAP_SECT: C.STD.MAP_SECT, EXCL_ELEV: null, QUALIFY: C.QUALIFY, maps: undefined },
    STD: { MAP_PLAN: C.STD.MAP_PLAN, MAP_ELEV: C.STD.MAP_ELEV, MAP_LEVL: C.STD.MAP_LEVL, MAP_ROOF: C.STD.MAP_ROOF, MAP_SECT: C.STD.MAP_SECT, EXCL_ELEV: C.STD.EXCL_ELEV, QUALIFY: C.STD.QUALIFY,
      maps: { plan: C.STD.MAP_PLAN, elev: C.STD.MAP_ELEV, levl: C.STD.MAP_LEVL, roof: C.STD.MAP_ROOF, sect: C.STD.MAP_SECT } } };
  function elevWallLayers(map) { return map.rules.filter(function (r) { return r.type === 'elevwall' && r.match === 'exact'; }).map(function (r) { return r.pattern; }); }
  function setOf(sheets) {
    var el = sheets.filter(function (s) { return s.role === 'elev'; });
    var fit = Object.keys(SETS).filter(function (k) { var ly = elevWallLayers(SETS[k].MAP_ELEV);
      return el.length && el.every(function (s) { return s.dxf.entities.some(function (e) { return ly.indexOf(e.layer) >= 0; }); }); });
    return { name: fit.length === 1 ? fit[0] : null, fits: fit, layers: Object.keys(SETS).map(function (k) { return k + ':' + elevWallLayers(SETS[k].MAP_ELEV).join('|'); }) };
  }
  // §L4.1: the editor's layer rules [{role:'plan'|'elev'|'levl'|'roof'|'sect', layer, type, ui}] appended as exact rules to that role's map of the set
  // (pipeline AND qualify); 'dims'/'grid' also join QUALIFY.layers. With rules, the run_id hashes the effective maps (stated). No rules = the set itself.
  function setWith(name, rules) {
    var S0 = SETS[name]; if (!S0) return null;
    rules = (rules || []).slice().sort(function (a, b) { return a.role < b.role ? -1 : a.role > b.role ? 1 : a.layer < b.layer ? -1 : a.layer > b.layer ? 1 : 0; });
    if (!rules.length) return S0;
    var add = function (role, M) { var ex = rules.filter(function (r) { return r.role === role; }).map(function (r) { return { match: 'exact', pattern: r.layer, type: r.type }; });
      return ex.length ? { version: M.version, rules: M.rules.concat(ex) } : M; };
    var Qs = JSON.parse(JSON.stringify(S0.QUALIFY));
    rules.forEach(function (r) { ['dims', 'grid'].forEach(function (k) { if (r.ui === k && Qs.layers[k].indexOf(r.layer) < 0) Qs.layers[k].push(r.layer); }); });
    var o = { MAP_PLAN: add('plan', S0.MAP_PLAN), MAP_ELEV: add('elev', S0.MAP_ELEV), MAP_LEVL: add('levl', S0.MAP_LEVL), MAP_ROOF: add('roof', S0.MAP_ROOF), MAP_SECT: add('sect', S0.MAP_SECT),
      EXCL_ELEV: S0.EXCL_ELEV, QUALIFY: Qs, rules: rules };
    o.maps = { plan: o.MAP_PLAN, elev: o.MAP_ELEV, levl: o.MAP_LEVL, roof: o.MAP_ROOF, sect: o.MAP_SECT, layer_rules: rules.map(function (r) { return [r.role, r.layer, r.type]; }) };
    return o;
  }
  function gate(sheets, opts) {   // opts.set: the set the USER states (editor); otherwise from the elevation-wall layer evidence
    var userSet = opts && opts.set && SETS[opts.set] ? opts.set : null;
    var refused = sheets.filter(function (s) { return !s.role; }).map(function (s) { return { sheet: s.name, reason: s.why }; });
    var n = function (r) { return sheets.filter(function (s) { return s.role === r; }).length; };
    if (!n('plan')) refused.push({ sheet: '(set)', reason: 'no storey plan (@VIEW=PLAN + @LEVEL)' });
    if (!n('elev')) refused.push({ sheet: '(set)', reason: 'no elevation (@VIEW=ELEV + @FACE)' });
    if (n('roof') !== 1) refused.push({ sheet: '(set)', reason: 'roof plans=' + n('roof') + ' (need exactly 1: @VIEW=ROOF + @LEVEL + @ROOF)' });
    var lv = {}; sheets.filter(function (s) { return s.role === 'plan'; }).forEach(function (s) { if (lv[s.level]) refused.push({ sheet: s.name, reason: 'two plans at @LEVEL=' + s.level }); lv[s.level] = 1; });
    var fc = {}; sheets.filter(function (s) { return s.role === 'elev'; }).forEach(function (s) { if (fc[s.face]) refused.push({ sheet: s.name, reason: 'two elevations on @FACE=' + s.face }); fc[s.face] = 1; });
    if (n('section') > 1) refused.push({ sheet: '(set)', reason: 'sections=' + n('section') + ' (at most 1: @VIEW=SECTION)' });
    var so = n('elev') ? setOf(sheets) : null;
    if (userSet) return { ok: refused.length === 0, refused: refused, set: userSet, setFrom: 'user', evidence: so ? so.name : null };
    if (so && !so.name) refused.push({ sheet: '(set)', reason: 'layer set ambiguous: elevation-wall layers ' + so.layers.join(', ') + ' fit ' + (so.fits.join('+') || 'none') + ' on every elevation' });
    return { ok: refused.length === 0, refused: refused, set: so ? so.name : null, setFrom: 'evidence' };
  }
  // §L4.1: the verdict when the pipeline does NOT run (roles incomplete, or the pipeline refused): the gaps are UNKNOWN, so one blocking
  // GAP:pipeline_not_run {reason} stands for them (never a silent pass); markings, layers, units, dimension and grid checks still run.
  function qualifyNotRun(sheets, opts) {
    opts = opts || {};
    var SET = setWith(opts.set, opts.layerRules), CFG = C.CFG, files = [], planOps = {};
    var mapsOf = function (v) { return !SET ? null : v === 'PLAN' ? [SET.MAP_PLAN] : v === 'ROOF' ? [SET.MAP_ROOF] : v === 'SECTION' ? [SET.MAP_SECT] : v === 'ELEV' ? [SET.MAP_ELEV, SET.MAP_LEVL].concat(SET.EXCL_ELEV ? [SET.EXCL_ELEV] : []) : null; };
    sheets.slice().sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; }).forEach(function (sh) {
      var f = { name: sh.name, dxf: sh.dxf }, lm = mapsOf(sh.desc.view); if (lm) f.layer_maps = lm; files.push(f);
      if (SET && sh.desc.view === 'PLAN') { try { planOps[sh.name] = B.run(sh.text, SET.MAP_PLAN, CFG, { DxfParser: DxfParser, hashHex: opts.hashHex || sha256Hex, library: [] }).ops; } catch (e) { /* qualify: check_skipped */ } }
    });
    return Q.qualify({ files: files, plan_ops: planOps, gaps: [{ code: 'GAP:pipeline_not_run', reason: opts.why || 'pipeline not run' }], resolved: {} }, SET ? SET.QUALIFY : C.QUALIFY);
  }

  // ---- the pipeline: rosetta_dx_shell.js pipeline({convention:false}), same calls, same order ----
  // library (optional): { families:[{id, ot, ifc_class, w, h, d}], wallTypes:[{id, t}], geoms:[{element_ref, ifc_class, geometry_hash, vertices, faces, bbox}], labels:{<storey>:[...]} }
  function convert(sheets, opts) {
    opts = opts || {};
    var hashHex = opts.hashHex || sha256Hex, library = opts.library || null;
    var g = gate(sheets, { set: opts.set }); if (!g.ok) return { refused: g.refused };
    var CFG = C.CFG, deps = { DxfParser: DxfParser, hashHex: hashHex, library: [] }, SET = setWith(g.set, opts.layerRules);   // §L4.1 + the editor's layer rules
    var plans = sheets.filter(function (s) { return s.role === 'plan'; }).sort(function (a, b) { return a.level - b.level; });
    var roofSh = sheets.filter(function (s) { return s.role === 'roof'; })[0], sectSh = sheets.filter(function (s) { return s.role === 'section'; })[0] || null;
    var elevSh = sheets.filter(function (s) { return s.role === 'elev'; }).sort(function (a, b) { return FACE_ORDER.indexOf(a.face) - FACE_ORDER.indexOf(b.face); });
    var R = { gaps: [], refused: null, set: g.set, setFrom: g.setFrom };
    var refuse = function (sheet, reason) { R.refused = (R.refused || []).concat([{ sheet: sheet, reason: reason }]); return R; };
    var base = plans[0].desc;
    var elevs = [];
    for (var ei = 0; ei < elevSh.length; ei++) {
      var es = elevSh[ei], al = MK.align(base, es.desc, C.MARK_ALIGN_TOL);
      if (!al.map || !al.map.zOf) return refuse(es.name, 'elevation does not align with plan ' + plans[0].name + ' (' + J(al.errors || al.error || null) + ')');
      elevs.push({ name: es.name, face: es.face, roof: es.desc.roof, map: al.map, lines: S.levelLinesZ(es.dxf.entities, SET.MAP_LEVL, al.map),
        clusters: E.elevClusters(es.dxf.entities, SET.MAP_ELEV, al.map, CFG.snap_tol, 'glazing'), walls: E.elevWallRects(es.dxf.entities, SET.MAP_ELEV, al.map),
        doors: E.elevClusters(es.dxf.entities, SET.MAP_ELEV, al.map, CFG.snap_tol, 'elevdoor') });
    }
    R.elevs = elevs;
    var allRects = [].concat.apply([], elevs.map(function (e) { return e.walls; }));
    var ST = plans.map(function (p, i) { return { name: 'Level ' + (i + 1), sheet: p.name, sh: p, level: p.level }; });
    for (var si = 0; si < ST.length; si++) {
      var st = ST[si];
      st.levelDrawn = allRects.filter(function (r) { return Math.abs(r.z0 - st.level) <= CFG.elev_tol; }).map(function (r) { return r.handle; });
      if (!st.levelDrawn.length) return refuse(st.sheet, '@LEVEL=' + st.level + ' is not a drawn elevation boundary (BASIC_SHAPES_SPEC §2.3 LV)');
      var nxt = ST[si + 1] ? ST[si + 1].level : Math.max.apply(null, allRects.filter(function (r) { return Math.abs(r.z0 - st.level) <= CFG.elev_tol; }).map(function (r) { return r.z1; }));
      st.top = nxt;
      var run = B.run(st.sh.text, SET.MAP_PLAN, CFG, deps); st.before = run.ops; st.planGaps = run.report.gaps; st.run_id = run.run_id;
      var ops = E.applyElevations(run.ops, elevs.map(function (e) { return { face: e.face, clusters: e.clusters }; }), Object.assign({}, CFG, { wall: Object.assign({ height: r6(nxt - st.level) }, CFG.wall) }), { level: st.level, hashHex: hashHex }).ops;
      ops = E.applyWallHeights(ops, elevs.map(function (e) { return { face: e.face, walls: e.walls }; }), CFG, { level: st.level }).ops;
      // L2.6 C: the plan's door tags label the doors before their heights; a door no elevation shows takes the scheduled height
      var pd = st.sh.desc, sch = T.scheduleFromDesc(pd, MK.UNITS);
      if ((pd.tags || []).length) { var tg = T.applyTags(ops, [{ desc: pd }], MK.UNITS, { snap_tol: CFG.snap_tol, level: st.level }); ops = tg.ops; st.tagged = tg.labelled; }
      var dh = E.applyDoorHeights(ops, elevs.map(function (e) { return { face: e.face, doors: e.doors }; }), CFG, { level: st.level, schedule: Object.keys(sch).length ? sch : null, schedule_head_frame: C.CASING });
      ops = dh.ops; st.doorRep = dh.report;
      st.after = ops;
    }
    R.ST = ST;
    // L2.6 E: a marked SECTION sheet states slab top / underside (Dxf2Shell.sectionSlabs)
    var sopt = null;
    if (sectSh) {
      var sal = MK.align(base, sectSh.desc, C.MARK_ALIGN_TOL);
      R.section = sal.map ? S.sectionSlabs(sectSh.dxf.entities, SET.MAP_SECT, sal.map, ST.map(function (st) { return st.level; }), CFG, sectSh.desc.roof)
        : { slabs: {}, roof: null, gaps: [{ code: 'GAP:section_align_fail', errors: sal.errors.map(function (e) { return e.code; }) }] };
      R.sectionSheet = sectSh.name; sopt = { section: R.section };
      if (sectSh.desc.cut && sal.map) { var cp = sectSh.desc.cut.split(','); R.sectionCut = { axis: cp[0], at: Number(cp[1]) * MK.UNITS[sectSh.desc.units] }; }
    }
    R.slabZ = {};
    ST.forEach(function (st, i) { R.slabZ[st.name] = S.slabZ({ level: st.level, ops: st.after }, i ? { level: ST[i - 1].level, ops: ST[i - 1].after } : null, CFG, sopt); });
    var TOP = ST[ST.length - 1];
    R.roofZ = S.roofZ({ level: TOP.level, ops: TOP.after }, elevs, CFG);
    // L2.6 A: wall tops the plan's @WALLTOP markings state; U = underside of the slab above (the top storey: the roof bottom)
    ST.forEach(function (st, i) {
      var d = st.sh.desc; if (!(d.walltop || []).length && !(d.walltop_walls || []).length) return;
      var U = ST[i + 1] ? R.slabZ[ST[i + 1].name].bottom : R.roofZ.bottom;
      var a = E.applyWallTops(st.after, st.before, d, st.level, U); st.after = a.ops; st.wallTopRep = a.report;
    });
    // lane spec L2.8 (1): wall base from the lowest stated source (section > elevation > plan level + advisory)
    ST.forEach(function (st, i) {
      var lower = ST[i - 1], sec = R.section && R.sectionCut ? { walls: R.section.walls || [], axis: R.sectionCut.axis, at: R.sectionCut.at } : null;
      var wb = S.applyWallBases(st.after, { level: st.level, lowerLevel: lower ? lower.level : undefined,
        lowerPieces: lower ? lower.before.filter(function (o) { return o.op_type === 'DXF_WALL' && o.params.rect; }).map(function (o) { return o.params.rect; }) : [], section: sec, tol: CFG.snap_tol });
      st.after = wb.ops; st.baseAdv = wb.advisories; st.baseRep = wb.report;
    });
    ST.forEach(function (st) { st.ring = S.innerRing(st.after, CFG); });
    R.roofPlan = S.roofPlan(roofSh.dxf.entities, SET.MAP_ROOF, roofSh.factor, TOP.ring.envelope, TOP.ring.outline, CFG);
    R.roofSheet = roofSh.name;
    R.run_id = C.runId(B.canon, hashHex, ST.map(function (st) { return st.run_id; }), sheets.map(function (s) { return s.sha; }), SET.maps);
    // type binding + labels: only with library rows (the rosetta_dx_types chain)
    if (library) {
      var LIB = { wall: library.wallTypes.filter(function (w) { return w.id !== 'NONE'; }).map(function (w) { return { id: w.id, thickness: w.t / 1000 }; }),
        window: library.families.filter(function (f) { return f.ot === 'WINDOW'; }).map(function (f) { return { id: f.id, set: C.setOf(f.id), width: f.w / 1000, height: f.h / 1000 }; }),
        door: library.families.filter(function (f) { return f.ot === 'DOOR'; }).map(function (f) { return { id: f.id, set: C.setOf(f.id), width: f.w / 1000, height: f.h / 1000 }; }) };
      ST.forEach(function (st) {
        var lr = T.applyLabels(st.after, { units: 'm', labels: (library.labels && library.labels[st.name]) || [] }, { m: 1 }, { snap_tol: CFG.snap_tol, level: st.level });
        st.labelGaps = lr.gaps.length;
        st.after = T.bindTypes(lr.ops, LIB, { bind: { size_tol: C.TYPES.size_tol, prefer: C.TYPES.prefer } }, {}).ops;
      });
    }
    ST.forEach(function (st) {
      var b = S.bridgeOpenings(st.after, CFG, { level: st.level, hashHex: hashHex });
      st.bridge = b; st.infill = b.infill; st.voidOf = {};
      b.voids.forEach(function (v) { v.keyOf.forEach(function (k) { st.voidOf[k] = v; }); });
    });
    R.fillHard = []; R.fillGaps = [];
    if (library) {
      // §L3.2: a subset library holds the candidate set COMPLETE only for library.complete, and library.withheld names the families whose
      // selected product (familyToRef's ref) has a candidate mesh the file does not hold. Their openings are taken out BEFORE placeFills
      // and each is a named hard GAP (never a substitute, never a box); the rest go through placeFills unchanged (its own throw = storey hard fail).
      var withheld = library.withheld || {}, complete = library.complete || null;
      var libRows = { families: library.families.map(function (f) { return { family_id: f.id, ifc_class: f.ifc_class, description: f.d }; }), geoms: library.geoms };
      ST.forEach(function (st) {
        var pre = [], ops = st.after.filter(function (o) {
          var q = o.params, tid = o.op_type === 'DXF_OPENING' && (q.kind === 'window' || q.kind === 'door') && q.type && q.type.type_id;
          if (!tid) return true;
          if (withheld[tid]) { pre.push({ code: 'GAP:lod400_mesh_missing', handle: q.handle, kind: q.kind, type_id: tid, element_ref: withheld[tid].ref, missing: withheld[tid].hashes }); return false; }
          if (complete && complete.indexOf(tid) < 0) { pre.push({ code: 'GAP:lod400_not_in_subset', handle: q.handle, kind: q.kind, type_id: tid }); return false; }
          return true;
        });
        var hardMsg = pre.map(function (x) { return x.code + ' ' + x.kind + ' ' + x.handle + ' ' + x.type_id + (x.missing ? ' (' + x.missing.join(',') + ')' : ''); });
        try { st.fills = S.placeFills(ops, libRows, { level: st.level, hashHex: hashHex, size_tol: C.FILL.size_tol, voidOf: st.voidOf }); }
        catch (e) { st.fills = { elements: [], gaps: e.gaps || [] }; hardMsg.push(e.message); }
        st.fills = { elements: st.fills.elements, gaps: pre.concat(st.fills.gaps) };
        st.hard = hardMsg.length ? hardMsg.join('; ') : null;
        if (st.hard) R.fillHard.push(st.name + ': ' + st.hard);
        st.fills.gaps.forEach(function (x) { R.fillGaps.push(Object.assign({ storey: st.name }, x)); });
      });
    } else {
      // §L3 fills STOPPED: the Modeller has no reachable LOD400 library rows. Every cut opening needs a fill → one hard GAP each, no box.
      ST.forEach(function (st) {
        var need = [].concat.apply([], st.bridge.voids.map(function (v) { return v.openings; }));
        st.fills = { elements: [], gaps: need.map(function (h) { return { code: 'GAP:lod400_library_unreachable', handle: h, storey: st.name }; }) };
        st.hard = need.length ? 'GAP:lod400_library_unreachable x' + need.length : null;
        if (need.length) R.fillHard.push(st.name + ': ' + st.hard);
      });
    }
    // mesh (as the witness): pieces + infill, slabs with a thickness, fills, roof
    // L2.8 (2): one wall per footprint across consecutive plans, on the final element set
    var msk = S.mergeStacked(ST.map(function (st) { return { name: st.name, level: st.level, ops: st.after.filter(function (o) { return o.op_type === 'DXF_WALL'; }) }; }), CFG.snap_tol, CFG.elev_tol);
    msk.storeys.forEach(function (x, i) { ST[i].meshWalls = x.ops; }); R.merged = msk.merged;
    var els = [];
    ST.forEach(function (st) {
      var wallOps = st.meshWalls.concat(st.infill);
      var m = M.meshFromOps(wallOps, { level: st.level, hashHex: hashHex, snapTol: CFG.snap_tol });
      st.meshGaps = m.gaps;
      m.elements.forEach(function (e) { els.push(Object.assign(e, { storey: st.name, sheet: st.sheet })); });
      var sz = R.slabZ[st.name];
      if (st.ring.outline && typeof sz.thickness === 'number') {
        var pm = S.prismRect(st.ring.outline, [], sz.bottom, sz.top);
        if (pm) els.push({ guid: hashHex('slab|' + st.name + '|' + J(st.ring.outline)).slice(0, 32), class: 'IfcSlab', handle: (st.ring.members || []).join(','), layer: 'A-WALL-*', piece: 0, vertices: pm.vertices, faces: pm.faces, storey: st.name, sheet: st.sheet });
      }
      st.fills.elements.forEach(function (e) { els.push(Object.assign(e, { storey: st.name, sheet: st.sheet })); });
    });
    if (TOP.ring.outline && R.roofPlan.ok && typeof R.roofZ.thickness === 'number') {
      var rpm = S.prismRect(TOP.ring.outline, R.roofPlan.holes.map(function (h) { return h.ring; }), R.roofZ.bottom, R.roofZ.top);
      if (rpm) els.push({ guid: hashHex('roof|' + J(TOP.ring.outline)).slice(0, 32), class: 'IfcRoof', handle: R.roofPlan.roof_handle, layer: 'A-ROOF', piece: 0, vertices: rpm.vertices, faces: rpm.faces, storey: 'Roof', sheet: roofSh.name });
    }
    els.forEach(function (e) { if (e.volume === undefined) { e.volume = r6(M.volume(e)); e.watertight = M.watertight(e); } });
    R.els = els;
    R.libGeom = {}; if (library) library.geoms.forEach(function (gm) { if (gm.vertices && gm.vertices.length) R.libGeom[gm.geometry_hash] = gm; });
    // infill identity: the mesh guid meshFromOps gives each infill op (asked of the module, not re-derived)
    R.infillGuid = {};
    ST.forEach(function (st) {
      st.infill.forEach(function (o) { var me = M.meshFromOps([o], { level: st.level, hashHex: hashHex, snapTol: CFG.snap_tol }).elements; if (me.length === 1) R.infillGuid[me[0].guid] = { storey: st.name, op: o }; });
    });
    // §L3.3 qualify input, exactly as rosetta_dx_shell.js writes dx_shell_gaps.json (variant A) + rosetta_qualify.js builds the files / plan_ops
    var qg = [], resolved = {}, pick = function (x) { var o = Object.assign({}, x); delete o.run_id; return o; };
    ST.forEach(function (st) {
      var sheet = st.sheet, sz = R.slabZ[st.name];
      st.after.filter(function (o) { return o.op_type === 'DXF_GAP'; }).forEach(function (o) { qg.push(Object.assign({ sheet: sheet }, pick(o.params))); });
      (st.ring.gaps || []).concat(sz.gaps || []).forEach(function (x) { qg.push(Object.assign({ sheet: sheet, shape: 'slabs' }, pick(x))); });
      st.bridge.gaps.concat(st.fills.gaps).forEach(function (x) { qg.push(Object.assign({ sheet: sheet, shape: 'openings' }, pick(x))); });
      st.meshGaps.forEach(function (x) { qg.push(Object.assign({ sheet: sheet }, pick(x))); });
      (st.baseAdv || []).forEach(function (x) { qg.push(Object.assign({ sheet: sheet, shape: 'walls' }, pick(x))); });
      var opH = {}; st.after.filter(function (o) { return o.op_type === 'DXF_OPENING'; }).forEach(function (o) { opH[o.params.handle] = (o.params.parts || []).map(function (q) { return q.handle; }); });
      var rs = {}; st.bridge.voids.forEach(function (v) { v.openings.forEach(function (h) { rs[h] = 1; (opH[h] || []).forEach(function (x) { rs[x] = 1; }); }); });
      st.fills.elements.forEach(function (e) { if (typeof e.handle === 'string') rs[e.handle] = 1; });
      resolved[sheet] = Object.keys(rs).sort(function (a, b) { return parseInt(a, 16) - parseInt(b, 16); });
    });
    ((R.section && R.section.gaps) || []).forEach(function (x) { qg.push(Object.assign({ sheet: R.sectionSheet, shape: 'slabs' }, pick(x))); });
    R.roofPlan.gaps.concat(R.roofZ.gaps || []).forEach(function (x) { qg.push(Object.assign({ sheet: roofSh.name, shape: 'roof' }, pick(x))); });
    var mapsOf = function (sh) { return sh.role === 'plan' ? [SET.MAP_PLAN] : sh.role === 'roof' ? [SET.MAP_ROOF] : sh.role === 'section' ? [SET.MAP_SECT] : [SET.MAP_ELEV, SET.MAP_LEVL].concat(SET.EXCL_ELEV ? [SET.EXCL_ELEV] : []); };
    var planOps = {}; ST.forEach(function (st) { planOps[st.sheet] = st.before; });
    R.qualifyInput = { files: sheets.slice().sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; }).map(function (sh) { return { name: sh.name, dxf: sh.dxf, layer_maps: mapsOf(sh) }; }),
      plan_ops: planOps, gaps: qg, resolved: resolved };
    R.verdict = Q.qualify(R.qualifyInput, SET.QUALIFY);
    return R;
  }

  // ---- map to the Modeller's ARC-seed form (L3 design decision). Pure: returns registerable meshes + ops; parent = index into inserts. ----
  function bboxOf(V) {
    var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    V.forEach(function (v) { for (var a = 0; a < 3; a++) { if (v[a] < mn[a]) mn[a] = v[a]; if (v[a] > mx[a]) mx[a] = v[a]; } });
    return { min: mn, max: mx };
  }
  function asset(guid, V, F, uncut) {
    var bb = bboxOf(V), c = [0, 1, 2].map(function (a) { return (bb.min[a] + bb.max[a]) / 2; });
    var v = new Float32Array(V.length * 3), f = new Uint32Array(F.length * 3);
    V.forEach(function (p, i) { v[3 * i] = p[0] - c[0]; v[3 * i + 1] = p[1] - c[1]; v[3 * i + 2] = p[2] - c[2]; });
    F.forEach(function (t, i) { f[3 * i] = t[0]; f[3 * i + 1] = t[1]; f[3 * i + 2] = t[2]; });
    var lb = [bb.min[0] - c[0], bb.max[0] - c[0], bb.min[1] - c[1], bb.max[1] - c[1], bb.min[2] - c[2], bb.max[2] - c[2]];
    return { hash: 'dxf-' + guid, v: v, f: f, bbox: lb, anchorOffset: [0, 0, 0], uncut: !!uncut, centre: c, halfZ: (bb.max[2] - bb.min[2]) / 2 };
  }
  function toOps(R, opts) {
    opts = opts || {};
    var hashHex = opts.hashHex || sha256Hex, colorFor = opts.colorFor || function () { return undefined; };
    var level = {}; R.ST.forEach(function (st) { level[st.name] = st.level; });
    var assets = [], inserts = [], cuts = [], groups = [], skipped = [];
    function insert(guid, cls, storey, V, F, prov, uncut) {
      var a = asset(guid, V, F, uncut); assets.push(a);
      var P = { realGeomHash: a.hash, bbox: a.bbox, placement: { x: r6(a.centre[0]), y: r6(a.centre[1]), z: r6(a.centre[2] - a.halfZ), rot: 0 }, ifc_class: cls,
        storey: storey, provenance: prov };
      if (typeof level[storey] === 'number') P.storey_elev = level[storey];
      var col = colorFor(cls); if (col != null) P.color = col;
      inserts.push({ op_type: 'GEOM_INSERT', params: P, outputGuid: 'dxf-' + guid });
      return inserts.length - 1;
    }
    // 1. every non-infill, non-fill element as its own body (fills: none in the page; with a library they are listed, see C1-PORT)
    R.els.forEach(function (e) {
      if (R.infillGuid[e.guid] || e.class === 'IfcDoor' || e.class === 'IfcWindow') return;
      insert(e.guid, e.class, e.storey, e.vertices, e.faces, { dxf_handle: String(e.handle), layer: e.layer, sheet: e.sheet, run_id: R.run_id });
    });
    // 2. each §6 void group: ONE uncut body G x strip x [zb,zt] + one GEOM_CUT per opening z-interval (§SLIDE-SEED form)
    R.ST.forEach(function (st) {
      st.bridge.voids.forEach(function (v) {
        var key = v.openings.join(',') + '@' + v.s.join('..');
        var inf = st.infill.filter(function (o) { return o.params.openings.join(',') + '@' + o.params.length === v.openings.join(',') + '@' + r6(v.s[1] - v.s[0]) &&
          Math.abs((v.axis === 'x' ? o.params.rect[0] : o.params.rect[1]) - v.s[0]) <= 1e-9; });
        if (!inf.length) { skipped.push({ storey: st.name, openings: v.openings, reason: 'no infill (opening spans the whole wall height): nothing to cut' }); return; }
        var zs = inf.map(function (o) { return [st.level + o.params.base, st.level + o.params.base + o.params.height]; }).concat(v.z);
        var zb = Math.min.apply(null, zs.map(function (z) { return z[0]; })), zt = Math.max.apply(null, zs.map(function (z) { return z[1]; }));
        var ivs = v.z.map(function (z) { return z.slice(); }).sort(function (p, q) { return p[0] - q[0]; }), uni = 0, cur = null;
        ivs.forEach(function (z) { if (!cur || z[0] > cur[1]) { if (cur) uni += cur[1] - cur[0]; cur = z.slice(); } else cur[1] = Math.max(cur[1], z[1]); }); if (cur) uni += cur[1] - cur[0];
        var infH = inf.reduce(function (n, o) { return n + o.params.height; }, 0);
        if (Math.abs(uni + infH - (zt - zb)) > 1e-6) { skipped.push({ storey: st.name, openings: v.openings, reason: 'voids + infill != body height (' + r6(uni) + '+' + r6(infH) + ' vs ' + r6(zt - zb) + ')', refuse: true }); return; }
        var rc = inf[0].params.rect, ring = [[rc[0], rc[1]], [rc[2], rc[1]], [rc[2], rc[3]], [rc[0], rc[3]]];
        var pm = S.prismRect(ring, [], r6(zb), r6(zt));
        if (!pm) { skipped.push({ storey: st.name, openings: v.openings, reason: 'body not rectilinear', refuse: true }); return; }
        var bguid = hashHex(inf[0].input_guids.join('|') + '|gap-body').slice(0, 32);
        var prov = { dxf_handle: inf[0].params.infill_of.join('+'), layer: inf[0].params.layer, sheet: st.sheet, run_id: R.run_id };
        var hi = insert(bguid, 'IfcWall', st.name, pm.vertices, pm.faces, prov, true);
        groups.push({ storey: st.name, body: hi, guid: 'dxf-' + bguid, rect: rc, zb: r6(zb), zt: r6(zt), openings: v.openings, infill: inf.map(function (o) { return o.output_guid; }), voids: v.z });
        v.z.forEach(function (z, i) {
          cuts.push({ op_type: 'GEOM_CUT', params: { parent: hi, void: { c1: [rc[0], rc[1], z[0]], c2: [rc[2], rc[3], z[1]] }, slide: { opening: v.openings.join('+'), filling: null, fillingFid: null },
            provenance: { dxf_handle: v.openings.join('+'), layer: 'A-DOOR|A-GLAZ', sheet: st.sheet, run_id: R.run_id } }, outputGuid: 'dxf-' + hashHex(bguid + '|cut|' + i).slice(0, 32) });
        });
      });
    });
    // 3. §L3.2 fills: GEOM_INSERT of the bound LOD400 library mesh, registered ONCE per geometry_hash ('lib-<hash>', recentred on its bbox centre)
    var libAsset = {}, fills = [];
    R.els.forEach(function (e) {
      if (e.class !== 'IfcDoor' && e.class !== 'IfcWindow') return;
      var G = R.libGeom && R.libGeom[e.geometry_hash];
      if (!G) { skipped.push({ storey: e.storey, openings: [e.handle], reason: 'fill mesh ' + e.geometry_hash + ' not in the library rows', refuse: true }); return; }
      var a = libAsset[e.geometry_hash];
      if (!a) { a = asset('x', G.vertices, G.faces, false); a.hash = 'lib-' + e.geometry_hash; libAsset[e.geometry_hash] = a; assets.push(a); }
      var P = { realGeomHash: a.hash, bbox: a.bbox, placement: { x: r6(e.centre[0]), y: r6(e.centre[1]), z: r6(e.centre[2] - a.halfZ), rot: 0 }, ifc_class: e.class, storey: e.storey,
        provenance: { dxf_handle: String(e.handle), layer: e.layer, sheet: e.sheet, run_id: R.run_id, element_ref: e.element_ref, geometry_hash: e.geometry_hash, family_id: e.family_id } };
      if (typeof level[e.storey] === 'number') P.storey_elev = level[e.storey];
      var col = colorFor(e.class); if (col != null) P.color = col;
      inserts.push({ op_type: 'GEOM_INSERT', params: P, outputGuid: 'dxf-' + e.guid }); fills.push(inserts.length - 1);
    });
    return { assets: assets, inserts: inserts, cuts: cuts, groups: groups, skipped: skipped, fills: fills };
  }

  // §L3.2: the locally generated library subset (BIMCompiler scripts/export_library_subset.js) → the `library` convert takes.
  // A family whose candidate set references a mesh the file does not hold is WITHHELD (selection without every candidate could pick
  // another mesh): its openings hard-fail GAP:lod400_mesh_missing. Pure; no I/O.
  function librarySubset(J0) {
    if (!J0 || J0.format !== 'dxf2bim-library-subset/1') throw new Error('library subset: unknown format ' + (J0 && J0.format));
    var rows = J0.rows, meshes = J0.meshes || {}, missing = [];
    var geoms = rows.ad_geometry_map.map(function (m) {
      var g = meshes[m.geometry_hash];
      if (!g) { missing.push(m.geometry_hash); return { element_ref: m.element_ref, ifc_class: m.ifc_class, geometry_hash: m.geometry_hash, vertices: [], faces: [], missing: true }; }
      var V = [], F = [], i;
      for (i = 0; i + 2 < g.vertices.length; i += 3) V.push([g.vertices[i], g.vertices[i + 1], g.vertices[i + 2]]);
      for (i = 0; i + 2 < g.faces.length; i += 3) F.push([g.faces[i], g.faces[i + 1], g.faces[i + 2]]);
      var mn = [0, 1, 2].map(function (a) { return Math.min.apply(null, V.map(function (v) { return v[a]; })); }), mx = [0, 1, 2].map(function (a) { return Math.max.apply(null, V.map(function (v) { return v[a]; })); });
      return { element_ref: m.element_ref, ifc_class: m.ifc_class, geometry_hash: m.geometry_hash, vertices: V, faces: F, bbox: { min: mn, max: mx } };
    });
    var families = rows.ad_opening_family.map(function (f) { return { id: f.family_id, ot: f.opening_type, ifc_class: f.ifc_class, w: f.default_width_mm, h: f.default_height_mm, d: f.description }; });
    // withheld: the product familyToRef selects (from the map rows, which are all present) has a candidate row whose mesh is absent
    var withheld = {};
    if (missing.length) families.forEach(function (f) {
      var m = S.familyToRef({ family_id: f.id, ifc_class: f.ifc_class, description: f.d }, geoms); if (!m.ref) return;
      var hit = geoms.filter(function (g) { return g.missing && g.element_ref === m.ref && g.ifc_class === f.ifc_class; }).map(function (g) { return g.geometry_hash; });
      if (hit.length) withheld[f.id] = { ref: m.ref, hashes: hit };
    });
    return { families: families, wallTypes: rows.ad_wall_type.map(function (w) { return { id: w.wall_type_id, t: w.total_mm }; }),
      geoms: geoms.filter(function (g) { return !g.missing; }), labels: J0.labels || {}, complete: J0.complete_for_families, withheld: withheld, missing: missing,
      header: { source: J0.source, input: J0.input, counts: J0.counts } };
  }

  function counts(R) {
    var by = {}; R.els.forEach(function (e) { var k = e.storey + '/' + e.class + (R.infillGuid[e.guid] ? '(infill)' : ''); by[k] = (by[k] || 0) + 1; });
    return by;
  }

  return { TAG: TAG, sha256Hex: sha256Hex, readSheets: readSheets, readSheet: readSheet, librarySubset: librarySubset, SETS: SETS, setOf: setOf, setWith: setWith, qualifyNotRun: qualifyNotRun, gate: gate, convert: convert, toOps: toOps, counts: counts, parse: parse, FACE_ORDER: FACE_ORDER };
});
