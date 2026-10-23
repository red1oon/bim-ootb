#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-EXCLUDE-STD (rule D58, prompts/DXF2BIM_FOUNDATION_LANE.md §D58). Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: the user's "Exclude area" (@EXCLUDE) did nothing on the standard path: the plan runs never passed it to the reader, so an excluded window was still read.
 *   X1 LEFT OUT  — boxes around the 4 Duplex Level 2 window clusters (B6, D5, F1, F8): those windows are gone from the convert AND from the editor's plan list (planDoors), one GAP:excluded_by_user advisory.
 *   X2 UNCHANGED — the same set without the boxes: run ids and verdict = BASE, code for code (a set that states no @EXCLUDE is untouched).
 *   X3 STRADDLE  — an entity only partly inside a box is kept and counted (the advisory's straddle count = the reader's report).
 *   X4 SEAM-5    — with the library (OCI; unreachable -> INCONCLUSIVE): fill_unbound 12 -> 0, the set qualifies.
 * Usage: NODE_PATH=<dir with better-sqlite3> BASE=<a modeller dir before D58> node modeller/tests/witness_dxf_exclude_std.js <Duplex Node model .db>
 */
'use strict';
const path = require('path'), crypto = require('crypto'), M = path.join(__dirname, '..'), hashHex = s => crypto.createHash('sha256').update(s).digest('hex');
const Database = require(path.join(process.env.HOME, 'bim-compiler/node_modules/better-sqlite3'));
let fail = 0, judged = 0; const say = s => console.log(s), check = (id, issue, ok, d) => { judged++; if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
const load = dir => { const D = path.join(dir, 'dxf2bim') + '/'; return { S: require(D + 'std2d.js'), Mk: require(D + 'std2d_marks.js'), MK: require(D + 'dxf2marks.js'), B: require(D + 'dxf2bim.js'), SHC: require(D + 'dxf2shell_config.js'), SC: require(D + 'std2d_scopes.js'),
  DxfParser: require(path.join(dir, 'lib/dxf-parser.js')), I: require(path.join(dir, 'dxf2bim_import.js')), SG: require(path.join(dir, 'dxf2suggest.js')) }; };
const N = load(M), BASE = process.env.BASE ? load(path.resolve(process.env.BASE)) : null, db = process.argv[2], CLUSTERS = ['B6', 'D5', 'F1', 'F8'];
const codes = v => { const m = {}; (v ? v.blocking.concat(v.advisory) : []).forEach(b => { m[b.code] = (m[b.code] || 0) + 1; }); return JSON.stringify(Object.keys(m).sort().map(k => [k, m[k]])); };
(async () => {
  if (!db) { say('MISSING input: the Duplex Node model .db (/tmp/db2/DXARC.db)'); process.exit(2); }
  const con = new Database(db, { readonly: true }), q = s => con.prepare(s).all(), R = N.S.writeStdSet(q, 'DX', {}), Dm = N.Mk.deriveMarks(R, { B: N.B, DxfParser: N.DxfParser, hashHex, MK: N.MK, SHC: N.SHC, SCOPES: N.SC }, { set: 'DX' });
  const plain = Object.keys(Dm.files).map(n => ({ name: n, text: Dm.files[n] })), sheets = N.I.readSheets(plain), P = new N.DxfParser();
  const L2 = sheets.find(s => s.role === 'plan' && /LEVEL_2/.test(s.name)), f = N.MK.UNITS[L2.desc.units];
  const run0 = N.B.run(L2.text, N.MK.withLayers(N.I.setWith('STD').MAP_PLAN, L2.desc), N.SHC.CFG, { DxfParser: N.DxfParser, hashHex, library: [] });
  const W = run0.ops.filter(o => o.op_type === 'DXF_OPENING' && o.params.kind === 'window' && CLUSTERS.indexOf(o.params.handle) >= 0);
  if (W.length !== CLUSTERS.length) { say('INCONCLUSIVE | the 4 Duplex window clusters were not found (' + W.length + '): wrong input db?'); process.exit(2); }
  const boxes = W.map(o => o.params.bbox.map(v => v / f)).map(b => [b[0] - 0.5, b[1] - 0.5, b[2] + 0.5, b[3] + 0.5].map(v => Number(v.toFixed(1))));
  const ex = plain.map(F => F.name !== L2.name ? F : { name: F.name, text: N.MK.writeMarks(N.SG.stripMarks(F.text), N.MK.readMarks(P.parseSync(F.text).entities).map(m => ({ text: m.raw, x: m.x, y: m.y })).concat(boxes.map(b => ({ text: '@EXCLUDE=' + b.join(',') + ' @BY=user', x: 0, y: 0 })))) });
  const SX = N.I.readSheets(ex), C1 = N.I.convert(SX, {}), L2x = SX.find(s => s.name === L2.name);
  const left = C1.ST.find(st => st.sheet === L2.name).after.filter(o => o.op_type === 'DXF_OPENING' && CLUSTERS.indexOf(o.params.handle) >= 0).length;
  const pd = N.I.planDoors(L2x, 'STD'), pdLeft = pd.windows.filter(w => CLUSTERS.indexOf(w.handle) >= 0).length, adv = C1.verdict.advisory.filter(a => a.code === 'GAP:excluded_by_user');
  check('X1', 'the 4 boxed window clusters are gone from the convert and from the editor\'s plan list; one GAP:excluded_by_user advisory names the count', left === 0 && pdLeft === 0 && adv.length === 1 && (adv[0].detail || {}).count > 0,
    `boxes=${boxes.length} convert_openings_left=${left} planDoors_windows_left=${pdLeft} advisories=${adv.length} count=${adv[0] && (adv[0].detail || {}).count} straddle=${adv[0] && (adv[0].detail || {}).straddle}`);
  const rep = C1.ST.find(st => st.sheet === L2.name).exRep;
  check('X3', 'an entity only partly inside a box is kept and counted: the advisory = the reader\'s own report', !!rep && adv.length === 1 && (adv[0].detail || {}).straddle === rep.exclude_straddle && (adv[0].detail || {}).count === rep.excluded, `report=${JSON.stringify(rep)}`);
  if (BASE) { const C0 = BASE.I.convert(BASE.I.readSheets(plain), {}), Cn = N.I.convert(N.I.readSheets(plain), {}), ids = C => C.ST.map(st => st.run_id).join(',');
    check('X2', 'no @EXCLUDE on the set -> run ids and verdict = BASE, code for code', ids(C0) === ids(Cn) && codes(C0.verdict) === codes(Cn.verdict) && C0.run_id === Cn.run_id, `run_id_equal=${C0.run_id === Cn.run_id} storey_ids_equal=${ids(C0) === ids(Cn)} verdict_equal=${codes(C0.verdict) === codes(Cn.verdict)}`); }
  else say('INFO X2 | needs BASE=<a modeller dir before D58>');
  let lib = null; try { lib = (await N.I.loadOci(SX, { fetchJson: async u => (await fetch(u)).json(), base: 'https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb/o/dxf2bim/library/' })).library; } catch (e) { say('INFO X4 | library fetch failed: ' + e.message); }
  if (!lib) say('INCONCLUSIVE X4 | no library reachable: nothing judged');
  else { const NOTIE = { defaultsRef: { defaults: { 'type.size_tie': { value: 'none' } } } }, a = N.I.convert(sheets, { library: lib, ...NOTIE }).verdict, b = N.I.convert(SX, { library: lib, ...NOTIE }).verdict, fu = v => v.blocking.filter(x => x.code === 'GAP:fill_unbound').length;
    check('X4', 'with the library: fill_unbound 12 -> 0 and the set qualifies (the user chose to leave the 4 stacked same-size windows out)', fu(a) === 12 && fu(b) === 0 && b.verdict === 'qualifies', `fill_unbound ${fu(a)} -> ${fu(b)} blocking ${a.blocking.length} -> ${b.blocking.length} verdict=${b.verdict}`); }
  say('SUMMARY fail=' + fail + ' judged=' + judged); process.exit(fail ? 1 : 0);
})().catch(e => { say('FATAL ' + e.stack); process.exit(1); });
