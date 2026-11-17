#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-LODUP-REBAR: the LOD Upgrade pill's "Rebar from DXF-attached schedules" pack (JS) equals the proven Python run. Read the log after every run (§LODUP_*); the exit code is not evidence.
 * Spec: prompts/MODELLER_LOD_UPGRADE_PILL.md §4 P1. Oracle: BIMCompiler scripts/lod/rebar_from_schedule.py (+ rebar_defaults.json), output SHED_rebar.db.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: "the browser result differs from the proven Python result".
 *   P1 PARITY       same set ids, same names, same bar/loop counts, every WORLD vertex within 0.01 mm of the oracle's, the same rebar change-list rows (ADDED rebar + beam NOT_BUILT).
 *   P2 STATED       each set's bar count / diameter / spacing re-measured from the stored vertices equals the stated schedule string (independent of the generator).
 *   P3 INSIDE       every vertex inside its host box by >= cover - 1 mm.            P4 COUNTS  footing bar counts equal the formula.
 *   P5 CENTRE       each part's stored centre = its own bbox centre (spec §5), not its host's.
 *   P6 RULES        a stated row beats a default; an edited row changes the result; an unset zone row is counted unset.
 *   P7 DETERMINISM  two runs give the same op hash.
 *   P8 BREAK        the cover dropped when placing bars: INSIDE must FAIL (the red control; LODUP_BREAK=1 makes the MAIN run broken, expect exit 1).
 *   P9 REGISTRY     the dialog's model lists exactly the registered packs; adding a pack adds a row with no other change.
 * Inputs by environment only (no project path in the repo): LODUP_SRC_DB (the extracted building DB, read only), LODUP_ORACLE_DB (the Python output DB, read only),
 *   LODUP_ZONE_IN (optional: the column end-zone length stated by the drawing, inches; default = read from the oracle's own change-list text).
 * Either unset -> a SYNTHETIC fixture built here (stated on the first line); P1 is then INCONCLUSIVE, never PASS.
 */
'use strict';
var fs = require('fs'), path = require('path'), crypto = require('crypto');
global.window = undefined;   // pure node: the packs must not need a browser
var ROOT = process.env.MODELLER_ROOT || path.join(__dirname, '..');
var Rules = require(path.join(ROOT, 'lod/lod_rules.js')), Pack = require(path.join(ROOT, 'lod/rebar_pack.js')), Ops = require(path.join(ROOT, 'lod/lod_ops.js')),
  Reader = require(path.join(ROOT, 'lod/lod_reader.js')), Registry = require(path.join(ROOT, 'lod/lod_registry.js'));
var initSqlJs = require(path.join(ROOT, 'lib', 'sql-wasm.js')), wasmBinary = fs.readFileSync(path.join(ROOT, 'lib', 'sql-wasm.wasm'));
var SRC = process.env.LODUP_SRC_DB, ORA = process.env.LODUP_ORACLE_DB, MAIN_BREAK = process.env.LODUP_BREAK === '1';
var FAILS = [], INCONC = [];
function verdict(name, ok, line) { var v = ok === null ? 'INCONCLUSIVE' : ok ? 'PASS' : 'FAIL'; console.log('§LODUP_' + name + ' ' + line + ' -> ' + v); if (v === 'FAIL') FAILS.push(name); if (v === 'INCONCLUSIVE') INCONC.push(name); return v; }
function sha(x) { return crypto.createHash('sha256').update(x).digest('hex'); }
function q(db, sql) { var r = db.exec(sql); return r.length ? r[0].values : []; }

// ---- synthetic fixture (used only when the two env paths are unset)
function boxTris(lo, hi) {
  var c = [[lo[0], lo[1], lo[2]], [hi[0], lo[1], lo[2]], [hi[0], hi[1], lo[2]], [lo[0], hi[1], lo[2]], [lo[0], lo[1], hi[2]], [hi[0], lo[1], hi[2]], [hi[0], hi[1], hi[2]], [lo[0], hi[1], hi[2]]];
  var F = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]], out = [];
  F.forEach(function (t) { t.forEach(function (i) { out.push(c[i][0], c[i][1], c[i][2]); }); }); return out;
}
function synthetic(SQL) {
  var db = new SQL.Database();
  db.run('CREATE TABLE elements_meta (guid TEXT PRIMARY KEY, ifc_class TEXT, element_name TEXT, storey TEXT, discipline TEXT, material_name TEXT, material_rgba TEXT, building TEXT)');
  db.run('CREATE TABLE element_transforms (guid TEXT PRIMARY KEY, center_x REAL, center_y REAL, center_z REAL, rotation_x REAL, rotation_y REAL, rotation_z REAL, bbox_x REAL, bbox_y REAL, bbox_z REAL)');
  db.run('CREATE TABLE element_instances (guid TEXT PRIMARY KEY, geometry_hash TEXT)'); db.run('CREATE TABLE component_geometries (geometry_hash TEXT PRIMARY KEY, vertices BLOB, faces BLOB, building TEXT)');
  db.run('CREATE TABLE element_dxf2bim (guid TEXT, name TEXT, value TEXT, PRIMARY KEY (guid, name))');
  var N = 0;
  function el(guid, cls, name, lo, hi, sched) {
    var c = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2], W = boxTris(lo, hi), v = new Float32Array(W.length); for (var i = 0; i < W.length; i += 3) { v[i] = W[i] - c[0]; v[i + 1] = W[i + 1] - c[1]; v[i + 2] = W[i + 2] - c[2]; }
    db.run('INSERT INTO elements_meta VALUES (?,?,?,?,?,?,?,?)', [guid, cls, name, 'Level 1', 'STR', 'Concrete', '0.5,0.5,0.5,1', 'SYN']); db.run('INSERT INTO element_transforms VALUES (?,?,?,?,0,0,0,?,?,?)', [guid, c[0], c[1], c[2], hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]]);
    db.run('INSERT INTO element_instances VALUES (?,?)', [guid, 'syn' + (++N)]); db.run('INSERT INTO component_geometries VALUES (?,?,?,?)', ['syn' + N, new Uint8Array(v.buffer), new Uint8Array(0), 'SYN']);
    Object.keys(sched || {}).forEach(function (k) { db.run('INSERT INTO element_dxf2bim VALUES (?,?,?)', [guid, k, sched[k]]); });
  }
  el('FOOT1', 'IfcFooting', 'Footing F-1', [0, 0, -1.2], [1.4, 1.1, -0.8], { Sched_Footing_L_Bar: '12 mm dia @ 6" C/C', Sched_Footing_S_Bar: '12 mm dia @ 6" C/C', Sched_Footing_Size_L_x_B: '4\'-7" x 3\'-7"', Sched_Footing_T: '15.75"', Sched_Footing_Type: 'F-1', SchedSource_footing: 'synthetic fixture' });
  var col = { Sched_Column_Main_Bar: '6-16dia', Sched_Column_Stirrup_A: '10dia @ 5" C/C (A)', Sched_Column_Stirrup_B: '10dia @ 10" C/C (B)', Sched_Column_Type: 'C-1', SchedSource_column: 'synthetic fixture' };
  el('COL1', 'IfcColumn', 'Column below', [0.5, 0.4, -0.8], [0.8, 0.7, 0], col); el('COL2', 'IfcColumn', 'Column mid', [0.5, 0.4, 0], [0.8, 0.7, 1.5], col); el('COL3', 'IfcColumn', 'Column top', [0.5, 0.4, 1.5], [0.8, 0.7, 3.0], col);
  el('BEAM1', 'IfcBeam', 'Beam B-1', [0, 0, 3.0], [3, 0.3, 3.3], {});
  return db;
}

initSqlJs({ wasmBinary: wasmBinary }).then(function (SQL) {
  var REAL = !!(SRC && ORA), srcDb, oraDb = null;
  if (REAL) { srcDb = new SQL.Database(new Uint8Array(fs.readFileSync(SRC))); oraDb = new SQL.Database(new Uint8Array(fs.readFileSync(ORA))); }
  else srcDb = synthetic(SQL);
  console.log('§LODUP_MODE source=' + (REAL ? 'LODUP_SRC_DB (real)' : 'SYNTHETIC fixture (LODUP_SRC_DB / LODUP_ORACLE_DB unset)') + ' oracle=' + (REAL ? 'LODUP_ORACLE_DB' : 'none') + ' break=' + (MAIN_BREAK ? 1 : 0));
  var rd = Reader.fromDb(srcDb), inp = { meta: rd.meta, sched: rd.sched, world: rd.world, callouts: [] };
  var base = Rules.load(JSON.parse(fs.readFileSync(path.join(ROOT, 'lod/rules/rebar_defaults.json'), 'utf8')));
  // the one stated value the drawing gives (the column end-zone length): from LODUP_ZONE_IN, else from the oracle's own change text ("stated 20in=0.5080 m"), else (synthetic) a stated 20 in
  var zoneIn = process.env.LODUP_ZONE_IN ? parseFloat(process.env.LODUP_ZONE_IN) : null, zoneSrc = 'stated: LODUP_ZONE_IN';
  if (zoneIn === null && REAL) { var zr = q(oraDb, "SELECT detail FROM upgrade_changes WHERE guid LIKE 'GEN-RB-%-TA' LIMIT 1")[0], zm2 = zr && /stated (\d+(?:\.\d+)?)in=/.exec(zr[0]); if (zm2) { zoneIn = parseFloat(zm2[1]); zoneSrc = 'stated: read from the oracle change-list text'; } }
  if (zoneIn === null) { zoneIn = 20; zoneSrc = 'stated: synthetic fixture'; }
  var ed = Rules.merge(base, { column_zone_A_stated_in: { value: zoneIn, unit: 'in', source: zoneSrc } }); var RULES = ed.rows, RC = Rules.counts(RULES);
  console.log('§LODUP_RULES rows=' + RC.total + ' stated=' + RC.stated + ' default=' + RC.default + ' unset=' + RC.unset + ' zone_A_stated_in=' + zoneIn + ' (' + zoneSrc + ')');
  if (REAL) {   // the details-sheet beam callouts are not in the model DB: re-read from the oracle's first NOT_BUILT beam row, then re-formatted by the pack (tests the formatting, said here)
    var cr = q(oraDb, "SELECT detail FROM upgrade_changes WHERE change='NOT_BUILT' AND ifc_class='IfcBeam' LIMIT 1")[0];
    if (cr) { var tx = cr[0].split('by drawing handle: ')[1] || ''; inp.callouts = tx.split(' ; ').map(function (s) { var m = /^#([0-9A-Fa-f]+): (.*)$/.exec(s); return m ? [m[1], m[2]] : null; }).filter(Boolean); }
    console.log('§LODUP_CALLOUTS input=' + inp.callouts.length + ' texts (taken from the oracle row: the details DXF is not in the model DB)');
  }
  var logs = [], run = function (rows, o) { logs.length = 0; var r = Pack.run(inp, rows, Object.assign({ log: function (l) { logs.push(l); console.log(l); } }, o || {})); return r; };
  var R = run(RULES, { breakCover: MAIN_BREAK }), parts = R.parts, A = R.audit;
  var applies = Pack.appliesTo(inp);
  verdict('NONVACUOUS', parts.length ? true : (applies ? false : null), 'applies_to=' + applies + ' parts=' + parts.length + ' added_verts=' + R.stats.addedVerts + (parts.length ? '' : ' (nothing judged)'));

  // ---- P1 PARITY
  if (!REAL) verdict('PARITY', null, 'no oracle (synthetic fixture): set ids / vertices / change rows not compared');
  else {
    var ora = {}; q(oraDb, "SELECT i.guid, c.vertices, t.center_x, t.center_y, t.center_z, m.element_name FROM element_instances i JOIN component_geometries c USING(geometry_hash) JOIN element_transforms t USING(guid) JOIN elements_meta m USING(guid) WHERE i.guid LIKE 'GEN-RB-%' ORDER BY i.guid")
      .forEach(function (v) { var b = v[1], f = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)), W = new Float64Array(f.length); for (var i = 0; i < f.length; i += 3) { W[i] = f[i] + v[2]; W[i + 1] = f[i + 1] + v[3]; W[i + 2] = f[i + 2] + v[4]; } ora[v[0]] = { W: W, name: v[5] }; });
    var mine = {}; parts.forEach(function (p) { mine[p.guid] = p; });
    var oIds = Object.keys(ora).sort(), mIds = Object.keys(mine).sort();
    var onlyO = oIds.filter(function (g) { return !mine[g]; }), onlyM = mIds.filter(function (g) { return !ora[g]; });
    var nameBad = 0, vcBad = 0, maxD = 0, nVert = 0, worst = null, nBars = 0, nameFirst = null;
    mIds.forEach(function (g) {
      if (!ora[g]) return; var a = mine[g].tris, b = ora[g].W; if (mine[g].name !== ora[g].name) { nameBad++; if (!nameFirst) nameFirst = [g, mine[g].name, ora[g].name]; }
      if (a.length !== b.length) { vcBad++; return; } nVert += a.length / 3; nBars += a.length / 3 / (/-T[AB]$/.test(g) ? 192 : 96);
      for (var i = 0; i < a.length; i++) { var d = Math.abs(a[i] - b[i]); if (d > maxD) { maxD = d; worst = g; } }
    });
    verdict('PARITY_SETS', !onlyO.length && !onlyM.length && oIds.length > 0, 'oracle_sets=' + oIds.length + ' js_sets=' + mIds.length + ' only_in_oracle=' + onlyO.length + ' only_in_js=' + onlyM.length + (onlyO[0] ? ' first_only_oracle=' + onlyO[0] : '') + (onlyM[0] ? ' first_only_js=' + onlyM[0] : ''));
    verdict('PARITY_NAMES', nameBad === 0, 'name_mismatches=' + nameBad + (nameFirst ? ' first=' + JSON.stringify(nameFirst) : '') + ' (names carry n, dia, spacing and the stated string)');
    verdict('PARITY_VERTICES', vcBad === 0 && maxD <= 1e-5 && nVert > 0, 'vertices_compared=' + nVert + ' bars_or_loops=' + nBars + ' vertex_count_mismatch_sets=' + vcBad + ' max_world_delta_mm=' + (maxD * 1000).toFixed(6) + ' (worst set ' + worst + ') tolerance=0.01 mm');
    var orows = q(oraDb, "SELECT seq, change, guid, ifc_class, host_guid, rule, detail FROM upgrade_changes WHERE ifc_class IN ('IfcReinforcingBar','IfcBeam') ORDER BY seq");
    var myrows = R.changes.map(function (c, i) { return [i + 1, c.kind, c.guid, c.cls, c.host, c.rule, c.detail]; }), rowBad = 0, first = null;
    if (orows.length !== myrows.length) rowBad = Math.abs(orows.length - myrows.length);
    for (var i = 0; i < Math.min(orows.length, myrows.length); i++) for (var k = 0; k < 7; k++) if (String(orows[i][k]) !== String(myrows[i][k])) { rowBad++; if (!first) first = { seq: orows[i][0], field: k, oracle: String(orows[i][k]).slice(0, 160), js: String(myrows[i][k]).slice(0, 160) }; break; }
    verdict('PARITY_CHANGELIST', rowBad === 0 && orows.length > 0, 'oracle_rebar_rows=' + orows.length + ' js_rows=' + myrows.length + ' differing_rows=' + rowBad + (first ? ' first=' + JSON.stringify(first) : '') + ' (ADDED rebar + beam NOT_BUILT; the weld rows are P2)');
  }

  // ---- P2 STATED / P3 INSIDE / P4 COUNTS on the stored vertices (re-derived, independent of the generator's own variables)
  function evalChecks(parts, tag) {
    var P = {}; parts.forEach(function (p) { P[p.guid] = p; });
    var SIDES = A.SIDES, BAR_NV = SIDES * 4 * 3, LOOP_NV = 4 * SIDES * 2 * 3, INSIDE_TOL = RULES.inside_tol_mm.value / 1000, BOX = A.BOX;
    function chunks(g, nv) { var W = P[g].tris; if ((W.length / 3) % nv) throw new Error(g + ': ' + W.length / 3 + ' vertices not a multiple of ' + nv); var out = []; for (var o = 0; o < W.length; o += nv * 3) out.push(W.subarray(o, o + nv * 3)); return out; }
    function ptp(c, a) { var lo = Infinity, hi = -Infinity; for (var i = a; i < c.length; i += 3) { if (c[i] < lo) lo = c[i]; if (c[i] > hi) hi = c[i]; } return [lo, hi]; }
    var kids = {}; parts.forEach(function (p) { p.parents.forEach(function (h) { (kids[h] = kids[h] || []).push(p.guid); }); });
    var statedBad = [], judged = 0, tiesMeas = {}, sfx = function (k) { return k.slice(k.lastIndexOf('-') + 1); };
    A.F_IDS.concat(A.C_IDS).sort().forEach(function (g) {
      if (A.refused[g]) return; var s = inp.sched[g], ks = (kids[g] || []).slice().sort(); judged++;
      if (A.F_IDS.indexOf(g) >= 0) {
        var L = Pack.parse.diaSpacing(s.Sched_Footing_L_Bar), Sb = Pack.parse.diaSpacing(s.Sched_Footing_S_Bar), kinds = ks.map(sfx).sort();
        if (kinds.join() !== 'L,S') { statedBad.push([g, 'sets ' + kinds]); return; }
        [['L', L], ['S', Sb]].forEach(function (kt) {
          var CHK = chunks('GEN-RB-' + g + '-' + kt[0], BAR_NV), tg = kt[1], ext0 = [0, 1, 2].map(function (a) { var r = ptp(CHK[0], a); return r[1] - r[0]; }), runax = ext0.indexOf(Math.max.apply(null, ext0)), lat = [0, 1, 2].filter(function (a) { return a !== runax; });
          var dia = CHK.map(function (c) { return Math.min.apply(null, lat.map(function (a) { var r = ptp(c, a); return r[1] - r[0]; })) * 1000; });
          if (Math.max.apply(null, dia.map(function (d) { return Math.abs(d - tg[0]); })) > 0.01) statedBad.push([g, kt[0] + ' dia']);
          if (CHK.length > 1) { var cen = CHK.map(function (c) { return [0, 1, 2].map(function (a) { var r = ptp(c, a); return (r[0] + r[1]) / 2; }); });
            var da = lat.filter(function (a) { var v = cen.map(function (c) { return c[a]; }); return Math.max.apply(null, v) - Math.min.apply(null, v) > 1e-6; })[0], v = cen.map(function (c) { return c[da]; }).sort(function (a, b) { return a - b; });
            for (var i = 1; i < v.length; i++) if (Math.abs((v[i] - v[i - 1]) - tg[1]) > 1e-5) { statedBad.push([g, kt[0] + ' spacing ' + ((v[i] - v[i - 1]) * 1000).toFixed(3)]); break; } }
        });
      } else {
        var mb = Pack.parse.main(s.Sched_Column_Main_Bar), mains = ks.filter(function (k) { return /-MAIN$/.test(k); });
        if (mains.length !== 1) { statedBad.push([g, 'main sets ' + mains.length]); return; }
        var CM = chunks(mains[0], BAR_NV), dm = CM.map(function (c) { return Math.max(ptp(c, 0)[1] - ptp(c, 0)[0], ptp(c, 1)[1] - ptp(c, 1)[0]) * 1000; });
        if (CM.length !== mb[0]) statedBad.push([g, 'main bars ' + CM.length + ' != ' + mb[0]]);
        if (Math.max.apply(null, dm.map(function (d) { return Math.abs(d - mb[1]); })) > 0.01) statedBad.push([g, 'main dia']);
        ['A', 'B'].forEach(function (kind) {
          var tg = Pack.parse.diaSpacing(s['Sched_Column_Stirrup_' + kind]), tk = ks.filter(function (k) { return new RegExp('-T' + kind + '$').test(k); }); if (!tk.length) return;
          var CK = chunks(tk[0], LOOP_NV), dz = CK.map(function (c) { var r = ptp(c, 2); return (r[1] - r[0]) * 1000; });
          if (Math.max.apply(null, dz.map(function (d) { return Math.abs(d - tg[0]); })) > 0.01) statedBad.push([g, 'tie ' + kind + ' dia']);
          tiesMeas[g + '|' + kind] = CK.map(function (c) { var r = ptp(c, 2); return (r[0] + r[1]) / 2; }).sort(function (a, b) { return a - b; });
        });
      }
    });
    // which tie sets each piece must have, from the stated zone intervals (independent of the generator's loops)
    var missing = [], zS = A.ZONE_STATED;
    A.groups.forEach(function (G) {
      var pcs = G.pieces.slice().sort(function (a, b) { return (BOX[a][0][2] - BOX[b][0][2]) || (a < b ? -1 : 1); });
      if (pcs.length !== 3 || pcs.some(function (g) { return A.refused[g]; })) return;
      var zb = BOX[pcs[0]][0][2], zt = BOX[pcs[2]][1][2], zoneA = Math.max(zS, (zt - zb) / 6), Aint = [[zb, zb + zoneA], [zt - zoneA, zt]];
      pcs.forEach(function (g) {
        var zlo = BOX[g][0][2], zhi = BOX[g][1][2], ov = function (a, b) { return Math.min(zhi, b) - Math.max(zlo, a); };
        var needA = Aint.some(function (iv) { return ov(iv[0], iv[1]) > 0.02; }), needB = (zhi - zlo) - Aint.reduce(function (t, iv) { return t + Math.max(0, ov(iv[0], iv[1])); }, 0) > 0.02;
        var have = (kids[g] || []).map(sfx);
        if ((needA && have.indexOf('TA') < 0) || (needB && have.indexOf('TB') < 0) || have.indexOf('MAIN') < 0) missing.push([g, needA, needB, have]);
      });
    });
    var st = verdict('STATED' + tag, judged === 0 ? null : (!statedBad.length && !missing.length), 'elements_with_schedule=' + judged + ' sets_checked=' + parts.length + ' diameter_spacing_mismatches=' + statedBad.length + ' missing_expected_sets=' + missing.length + (statedBad[0] ? ' first=' + JSON.stringify(statedBad[0]) : ''));
    // tie spacing
    var tieBad = 0, tieJ = 0;
    A.groups.forEach(function (G) {
      var pcs = G.pieces.slice().sort(function (a, b) { return (BOX[a][0][2] - BOX[b][0][2]) || (a < b ? -1 : 1); }); if (pcs.length !== 3 || pcs.some(function (g) { return A.refused[g]; })) return;
      var s0 = inp.sched[pcs[0]], tA = Pack.parse.diaSpacing(s0.Sched_Column_Stirrup_A), tB = Pack.parse.diaSpacing(s0.Sched_Column_Stirrup_B), za = [], zb2 = [];
      pcs.forEach(function (g) { za = za.concat(tiesMeas[g + '|A'] || []); zb2 = zb2.concat(tiesMeas[g + '|B'] || []); }); tieJ++;
      var all = za.concat(zb2).sort(function (a, b) { return a - b; }), Aset = {}, Bset = {}; za.forEach(function (z) { Aset[z.toFixed(9)] = 1; }); zb2.forEach(function (z) { Bset[z.toFixed(9)] = 1; });
      for (var i = 0; i < all.length - 1; i++) { var gp = all[i + 1] - all[i], bothA = Aset[all[i].toFixed(9)] && Aset[all[i + 1].toFixed(9)] && gp < tB[1] * 0.99; if (bothA && Math.abs(gp - tA[1]) > 1e-5) tieBad++; if (gp > tB[1] + 1e-5) tieBad++; }
    });
    verdict('STATED_TIE_SPACING' + tag, tieJ === 0 ? null : tieBad === 0, 'columns=' + tieJ + ' violations=' + tieBad);
    // size check
    if (tag === '') verdict('SIZE_CHECK', R.setDims.length ? Math.max.apply(null, R.setDims.map(function (x) { return x[2]; })) <= 1.0 : null, 'stated sizes vs mesh boxes: elements=' + R.setDims.length + ' max_dev_mm=' + (R.setDims.length ? Math.max.apply(null, R.setDims.map(function (x) { return x[2]; })).toFixed(4) : '-'));
    // INSIDE
    var worstM = 1e9, worstG = null, nBad = 0, nV = 0, nS = 0, c0 = {};
    parts.forEach(function (p) {
      var g = p.guid, kind = sfx(g), pars = p.parents.slice().sort(), boxes = pars.filter(function (x) { return BOX[x]; }).map(function (x) { return BOX[x]; }), stack, foot = [];
      if (kind === 'MAIN' || kind === 'TA' || kind === 'TB') {
        var c = [(boxes[0][0][0] + boxes[0][1][0]) / 2, (boxes[0][0][1] + boxes[0][1][1]) / 2];
        stack = A.C_IDS.slice().sort().filter(function (x) { return BOX[x] && Math.abs((BOX[x][0][0] + BOX[x][1][0]) / 2 - c[0]) <= 0.002 && Math.abs((BOX[x][0][1] + BOX[x][1][1]) / 2 - c[1]) <= 0.002; }).map(function (x) { return BOX[x]; });
        if (kind === 'MAIN') foot = A.F_IDS.filter(function (x) { return BOX[x] && BOX[x][0][0] <= c[0] && c[0] <= BOX[x][1][0] && BOX[x][0][1] <= c[1] && c[1] <= BOX[x][1][1]; }).map(function (x) { return BOX[x]; });
      } else stack = boxes;
      var cover = (kind === 'L' || kind === 'S') ? A.COVER_F : A.COVER_C, allb = stack.concat(foot), W = p.tris, minz = function (bs) { return Math.min.apply(null, bs.map(function (b) { return b[0][2]; })); };
      var zloAll = kind !== 'MAIN' ? minz(allb) : foot.length ? minz(foot) : minz(stack), zhiAll = Math.max.apply(null, allb.map(function (b) { return b[1][2]; })), stackLo = minz(stack); nS++; nV += W.length / 3;
      for (var i = 0; i < W.length; i += 3) {
        var x = W[i], y = W[i + 1], z = W[i + 2], best = -1e9;
        allb.forEach(function (b) { if (b[0][2] - 1e-6 <= z && z <= b[1][2] + 1e-6) best = Math.max(best, Math.min(x - b[0][0], b[1][0] - x, y - b[0][1], b[1][1] - y)); });
        var m = kind !== 'MAIN' ? Math.min(best, Math.min(z - zloAll, zhiAll - z)) : Math.min(best, zhiAll - z);
        if (kind === 'MAIN' && z < stackLo - 1e-6) m = Math.min(best, z - zloAll);
        if (m < worstM) { worstM = m; worstG = g; } if (m - (cover - INSIDE_TOL) < 0) nBad++;
      }
    });
    var ins = verdict('INSIDE' + tag, nV === 0 ? null : nBad === 0, 'sets=' + nS + ' vertices=' + nV + ' violating_vertices=' + nBad + ' min_margin_mm=' + (worstM * 1000).toFixed(3) + ' (worst set ' + worstG + ') required>=cover-' + (INSIDE_TOL * 1000) + 'mm (footing ' + A.COVER_F * 1000 + ', column ' + A.COVER_C * 1000 + ')');
    // COUNTS
    var cb = [], cn = 0;
    A.F_IDS.slice().sort().forEach(function (g) {
      if (A.refused[g]) return; var s = inp.sched[g], L = Pack.parse.diaSpacing(s.Sched_Footing_L_Bar), Sb = Pack.parse.diaSpacing(s.Sched_Footing_S_Bar), lo = BOX[g][0], hi = BOX[g][1], dim = [hi[0] - lo[0], hi[1] - lo[1]], longAx = dim[0] >= dim[1] ? 0 : 1, shortAx = 1 - longAx;
      [['L', L, shortAx], ['S', Sb, longAx]].forEach(function (t) { var d = t[1][0] / 1000, want = Math.floor((dim[t[2]] - 2 * A.COVER_F - d) / t[1][1] + 1e-9) + 1, got = chunks('GEN-RB-' + g + '-' + t[0], BAR_NV).length; cn++; if (got !== want) cb.push([g, t[0], got, want]); });
    });
    var cv = verdict('COUNTS' + tag, cn === 0 ? null : !cb.length, 'footing_sets=' + cn + ' count_mismatches=' + cb.length + ' formula floor((side-2*cover-d)/spacing)+1');
    return { stated: st, inside: ins, counts: cv };
  }
  var main = evalChecks(parts, '');

  // ---- P5 CENTRE (through the same function the pill uses to write ops)
  var built = Ops.build(parts, 'rebar', inp.meta), cBad = 0, hostSame = 0, maxC = 0;
  built.ops.forEach(function (o, i) {
    var P = o.params, W = parts[i].tris, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (var k = 0; k < W.length; k += 3) for (var a = 0; a < 3; a++) { if (W[k + a] < lo[a]) lo[a] = W[k + a]; if (W[k + a] > hi[a]) hi[a] = W[k + a]; }
    var halfZ = (hi[2] - lo[2]) / 2, cen = [P.placement.x, P.placement.y, P.placement.z + halfZ], bc = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
    var d = Math.max(Math.abs(cen[0] - bc[0]), Math.abs(cen[1] - bc[1]), Math.abs(cen[2] - bc[2])); if (d > maxC) maxC = d; if (d > 1e-6) cBad++;
    var h = parts[i].parents[0], hb = REAL || true ? inp.world(h) : null; if (hb && hb.length) { var hl = [Infinity, Infinity, Infinity], hh = [-Infinity, -Infinity, -Infinity]; for (var k2 = 0; k2 < hb.length; k2 += 3) for (var a2 = 0; a2 < 3; a2++) { if (hb[k2 + a2] < hl[a2]) hl[a2] = hb[k2 + a2]; if (hb[k2 + a2] > hh[a2]) hh[a2] = hb[k2 + a2]; } if (Math.abs((hl[0] + hh[0]) / 2 - cen[0]) < 1e-6 && Math.abs((hl[1] + hh[1]) / 2 - cen[1]) < 1e-6 && Math.abs((hl[2] + hh[2]) / 2 - cen[2]) < 1e-6) hostSame++; }
    if (P.provenance !== 'generated:rebar' || o.op_type !== 'GEOM_INSERT' || !P.parts_of.length || !/capacity not checked/.test(P.note)) cBad++;
  });
  verdict('CENTRE', built.ops.length ? cBad === 0 : null, 'ops=' + built.ops.length + ' element_parts_rows=' + built.elementParts.length + ' centre_not_own_bbox_centre=' + cBad + ' max_delta_m=' + maxC.toExponential(2) + ' parts_whose_own_centre_equals_their_first_host_centre=' + hostSame + ' (provenance generated:rebar, GEOM_INSERT, parts_of, wording present)');

  // ---- P6 RULES
  var t1 = Rules.merge(RULES, { column_cover_mm: { value: 99, unit: 'mm', source: 'default: attempt' }, footing_cover_mm: { value: 50, unit: 'mm', source: 'stated: test edit' }, column_zone_A_stated_in: { value: 1, source: 'default: attempt' }, nosuch: { value: 1, source: 'stated: x' } });
  var okStatedWins = t1.rows.column_zone_A_stated_in.value === zoneIn && t1.refused.some(function (r) { return r.key === 'column_zone_A_stated_in'; }) && t1.rows.footing_cover_mm.value === 50 && t1.rows.column_cover_mm.value === 99 && t1.refused.some(function (r) { return r.key === 'nosuch'; });
  var u = Rules.counts(base), unsetZone = Rules.kind(base.column_zone_A_stated_in) === 'unset';
  var R2 = (parts.length ? Pack.run(inp, t1.rows, { log: function () { } }) : null), changed = R2 ? (R2.parts.length === parts.length && R2.stats.addedVerts !== R.stats.addedVerts || JSON.stringify(R2.changes[0]) !== JSON.stringify(R.changes[0])) : null;
  verdict('RULES', R2 ? (okStatedWins && unsetZone && changed) : null, 'stated_wins_over_default_edit=' + okStatedWins + ' edit_changes_result=' + changed + ' (footing cover 75 -> 50 mm: first change row differs) shipped_pack_rows stated=' + u.stated + ' default=' + u.default + ' unset=' + u.unset + ' zone_row_unset_in_shipped_pack=' + unsetZone);

  // ---- P7 DETERMINISM: two runs, same op hash
  function opHash(rr) { var b = Ops.build(rr.parts, 'rebar', inp.meta), h = crypto.createHash('sha256'); h.update(JSON.stringify(b.ops)); b.assets.forEach(function (a) { h.update(Buffer.from(a.v.buffer)); }); h.update(JSON.stringify(b.elementParts)); h.update(JSON.stringify(rr.changes)); return h.digest('hex'); }
  var h1 = opHash(R), h2 = opHash(run(RULES, { breakCover: MAIN_BREAK }));
  verdict('DETERMINISM', parts.length ? h1 === h2 : null, 'run1=' + h1.slice(0, 16) + ' run2=' + h2.slice(0, 16));

  // ---- P8 BREAK: the cover dropped when placing, INSIDE must FAIL
  var RB = Pack.run(inp, RULES, { breakCover: !MAIN_BREAK, log: function () { } }), saveF = FAILS.length; var Rsave = R, partsSave = parts;
  void Rsave; void partsSave;
  var before = FAILS.slice(); var bk = evalChecks(RB.parts, '_BREAKRUN'); FAILS.length = 0; before.forEach(function (f) { FAILS.push(f); }); void saveF;
  var bkIns = bk.inside;
  if (!MAIN_BREAK) verdict('BREAK_CHECK', bkIns === 'FAIL', 'switch=on (cover dropped when placing) expected INSIDE=FAIL got INSIDE=' + bkIns);
  else console.log('§LODUP_BREAK_CHECK main run is the broken run: INSIDE=' + main.inside + ' (expected FAIL) -> ' + (main.inside === 'FAIL' ? 'PASS' : 'FAIL'));

  // ---- change list text
  var txt = Ops.changeText(R.changes, { model: 'witness', pack: 'rebar', rules: RC }), dl = txt.split('\n').filter(function (l) { return /^\d+ \| /.test(l); }).length;
  verdict('CHANGELIST_TXT', R.changes.length ? dl === R.changes.length : null, 'data_lines=' + dl + ' rows=' + R.changes.length + ' wording_line=' + /capacity not checked/.test(txt));

  // ---- P9 REGISTRY
  Registry.clear(); Registry.register(Pack);
  var rowsOf = function () { return RULES; }, d1 = Registry.describe(inp, rowsOf, Rules);
  Registry.register({ id: 'dummy', label: 'Dummy (test pack)', appliesTo: function () { return 0; }, run: function () { return { parts: [], changes: [] }; } });
  var d2 = Registry.describe(inp, rowsOf, Rules);
  verdict('REGISTRY', d1.length === 1 && d1[0].id === 'rebar' && d1[0].appliesTo === applies && d1[0].stated === RC.stated && d1[0].default === RC.default && d2.map(function (x) { return x.id; }).join() === 'rebar,dummy',
    'listed=' + d1.map(function (x) { return x.id; }).join() + ' applies_to=' + d1[0].appliesTo + ' stated=' + d1[0].stated + ' default=' + d1[0].default + ' after_registering_one_more=' + d2.map(function (x) { return x.id; }).join() + ' (the dialog renders exactly describe())');

  // ---- cost (PERF BUDGET)
  var srcVerts = 0; Object.keys(inp.meta).forEach(function (g) { var w = inp.world(g); if (w) srcVerts += w.length / 3; });
  console.log('§LODUP_COST pack=rebar addedVerts=' + R.stats.addedVerts + ' modelVerts=' + srcVerts + ' addedPct=' + (srcVerts ? (100 * R.stats.addedVerts / srcVerts).toFixed(2) : '-') + ' heapMB=' + (R.stats.addedVerts * 170 / 1e6).toFixed(2) + ' (0.17 GB per M vertices) warnOver1M=' + (R.stats.addedVerts > 1e6));
  console.log('§LODUP_SUMMARY failed=' + (FAILS.length ? FAILS.join(',') : 'none') + ' inconclusive=' + (INCONC.length ? INCONC.join(',') : 'none') + ' mode=' + (REAL ? 'real' : 'synthetic') + ' break=' + (MAIN_BREAK ? 1 : 0));
  process.exit(MAIN_BREAK ? (main.inside === 'FAIL' ? 0 : 1) : FAILS.length ? 1 : 0);
}).catch(function (e) { console.error('§LODUP_CRASH ' + (e && e.stack || e)); process.exit(2); });
