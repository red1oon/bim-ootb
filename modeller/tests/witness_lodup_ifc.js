#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-LODUP-IFC: the LOD Upgrade pill's "Add-on IFC" (JS) equals the proven Python add-on IFC. Read the log after every run (§LODUP_IFC_*); the exit code is not evidence.
 * Spec: prompts/MODELLER_LOD_UPGRADE_PILL.md §4 P7 and "P7 SPEC". Oracle (private, read only): BIMCompiler scripts/lod/export_parts_ifc.py (spec prompts/LOD400_DEFAULT_RULES_SCOPE.md section 9 + RESULT) and the IFC files it wrote.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: "the browser add-on IFC differs from the proven Python add-on IFC" (other classes, other GlobalIds, a different place, or not valid IFC).
 *   GUID_UNIT       the GlobalId of 'project' equals the value the Python oracle wrote (UUID5 in the oracle's namespace, compressed); our SHA-1 equals node's; our 128-bit compress equals the Viewer's
 *                   ifc_export_worker.js compressBytes on 2000 random inputs (the worker cannot be imported: this binds the two implementations, so there is one GlobalId definition, not two).
 *   SYNTH_TRUTH     a hand-derived fixture (mixed-diameter bar set split in two, a plate + bolts + welds joint grouped in one IfcElementAssembly, a layer part, in IFC2X3 and IFC4): the counts, GlobalIds,
 *                   diameters, bar counts, bar lengths, assembly aggregation, materials, and the refusal of a storey with no elevation; both files then go through ifcopenshell.validate (python half).
 *   REAL_REBAR      (LODUP_SRC_DB + LODUP_MARKS_JSON + LODUP_FRAME_JSON + LODUP_REF_IFC_REBAR) the JS beam-rebar sets exported IFC2X3 with the frame JSON: the same rooted class counts and the SAME GlobalId set as the oracle file.
 *   REAL_SHED       (LODUP_SHED_DB + LODUP_REF_IFC_SHED) the JS rebar + welds exported IFC4 with the DB frame as is: the same rooted class counts and the same GlobalId set.
 *   REAL_GUSSET     (optional LODUP_REF_IFC_GUSSET) the JS gusset joint: the same, including its IfcElementAssembly.
 *   REAL_JOINTS     (LODUP_JOINT_DB + LODUP_FRAME_JSON; P4 FIX SPEC) the joints pack exported: the writer's MESH and the python SOLIDS PASS; BREAK_JOINTS_MESH: the old weld caps must FAIL MESH.
 *   PY_*            the python half (witness_lodup_ifc_check.py): ifcopenshell.validate 0 errors, closed wound solids, every product's bbox within 1 mm of the oracle's, names / diameters / lengths / Pset equal.
 *                   SKIP (never PASS) when ifcopenshell is not installed.
 *   DETERMINISM     two exports give the same SHA-256.
 *   BREAK_GUID      the red control: random GlobalIds must FAIL the GlobalId check (LODUP_BREAK=1 makes the MAIN run use them, expect exit 1 through the same FAIL).
 * Inputs by environment only (no project path in the repo): the DBs, the frame JSON (it holds site offsets: never commit it) and the oracle IFCs are read only. Unset = SYNTH_TRUTH alone, parity INCONCLUSIVE, never PASS.
 */
'use strict';
var fs = require('fs'), path = require('path'), crypto = require('crypto'), os = require('os'), vm = require('vm'), cp = require('child_process');
global.window = undefined;   // pure node
var ROOT = process.env.MODELLER_ROOT || path.join(__dirname, '..');
var Rules = require(path.join(ROOT, 'lod/lod_rules.js')), Reg = require(path.join(ROOT, 'lod/lod_registry.js')), Rebar = require(path.join(ROOT, 'lod/rebar_pack.js')), Beam = require(path.join(ROOT, 'lod/beambar_pack.js')),
    Weld = require(path.join(ROOT, 'lod/weld_pack.js')), Joint = require(path.join(ROOT, 'lod/joint_pack.js')), Gusset = require(path.join(ROOT, 'lod/gusset_pack.js')), Ops = require(path.join(ROOT, 'lod/lod_ops.js')),
    Reader = require(path.join(ROOT, 'lod/lod_reader.js')), Ifc = require(path.join(ROOT, 'lod/lod_ifc.js'));
var initSqlJs = require(path.join(ROOT, 'lib', 'sql-wasm.js')), wasmBinary = fs.readFileSync(path.join(ROOT, 'lib', 'sql-wasm.wasm'));
var E = process.env, OUT = E.LODUP_OUT_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'lodup_ifc_')), PY = E.LODUP_PY || 'python3', MAIN_BREAK = E.LODUP_BREAK === '1', FAILS = [], INCONC = [], SKIPS = [];
function verdict(name, ok, line) { var v = ok === null ? 'INCONCLUSIVE' : ok ? 'PASS' : 'FAIL'; console.log('§LODUP_IFC_' + name + ' ' + line + ' -> ' + v); if (v === 'FAIL') FAILS.push(name); if (v === 'INCONCLUSIVE') INCONC.push(name); return v; }
function q(db, sql, bind) { var st = db.prepare(sql), out = []; if (bind) st.bind(bind); while (st.step()) out.push(st.get()); st.free(); return out; }
function sha(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
function counter(a) { var o = {}; a.forEach(function (x) { o[x] = (o[x] || 0) + 1; }); return o; }
function sameMap(a, b) { var ka = Object.keys(a).sort(), kb = Object.keys(b).sort(); return ka.join() === kb.join() && ka.every(function (k) { return a[k] === b[k]; }); }

// ---- the stored form a reload reads: Ops.build -> op rows -> fromOps (the exact path the browser's live part list takes), joined to the ADDED change rows
function elementsOf(packs) {   // packs = [{id, res, inp}]
  var out = [];
  packs.forEach(function (pk) {
    var built = Ops.build(pk.res.parts, pk.id, pk.inp.meta), byHash = {}; built.assets.forEach(function (a) { byHash[a.hash] = a; });
    var gen = Ops.fromOps(built.ops.map(function (o) { return { guid: o.outputGuid, params: o.params }; }), function (h) { return byHash[h]; }), ch = {};
    pk.res.changes.forEach(function (c) { if (c.kind === 'ADDED' && !ch[c.guid]) ch[c.guid] = c; });
    gen.forEach(function (p) { var c = ch[p.guid] || {}; out.push({ guid: p.guid, cls: p.cls, name: p.name, storey: p.storey, host: c.host || (p.parents && p.parents[0]) || null, rule: c.rule || null, detail: c.detail === undefined ? null : c.detail, tris: p.tris }); });
  });
  return out;
}
// ---- a STEP file read as text: the rooted entities' classes and GlobalIds (what the oracle's own roundtrip counts)
function stepRoots(text) {
  var cls = {}, ids = [], re = /^#\d+=(IFC\w+)\('([0-9A-Za-z_$]{22})',#\d+,/, i = 0, n = text.length;
  while (i < n) { var j = text.indexOf('\n', i); if (j < 0) j = n; var m = re.exec(text.substr(i, 140)); if (m) { cls[m[1]] = (cls[m[1]] || 0) + 1; ids.push(m[2]); } i = j + 1; }
  return { cls: cls, ids: ids };
}
function pyCheck(mine, ref, label, extra) {   // the python half: ifcopenshell.validate + solids (+ bbox and attributes against the oracle file)
  var a = [path.join(__dirname, 'witness_lodup_ifc_check.py'), mine]; if (ref) a.push(ref); (extra || []).forEach(function (x) { a.push(x); });
  var r = cp.spawnSync(PY, a, { encoding: 'utf8', maxBuffer: 1 << 28 }), out = (r.stdout || '') + (r.stderr || '');
  out.split('\n').filter(Boolean).forEach(function (l) { console.log('[' + label + ' py] ' + l); });
  if (r.status === 77) { SKIPS.push(label); console.log('§LODUP_IFC_PY_' + label + ' SKIP ifcopenshell not installed: the python half did not run (never PASS)'); return 'SKIP'; }
  var ok = r.status === 0; verdict('PY_' + label, ok, 'exit=' + r.status + ' ' + (out.match(/§LODUP_IFC_PY_\w+ [^\n]*-> (PASS|FAIL|INCONCLUSIVE)/g) || []).map(function (l) { return l.split(' ')[0].replace('§LODUP_IFC_PY_', '') + '=' + l.split('-> ')[1]; }).join(' '));
  return ok ? 'PASS' : 'FAIL';
}
fs.mkdirSync(OUT, { recursive: true });
function writeOut(name, res) { var f = path.join(OUT, name); fs.writeFileSync(f, res.parts.join('')); return f; }

// ================================================================== GUID_UNIT
(function () {
  var known = '0xWZS7etvJdu4PfpDR6tGq';   // gid('project') as the Python oracle wrote it into its files (UUID5 of 'project' in the oracle's namespace)
  var okKnown = Ifc.gidOf('project') === known;
  var b = Buffer.from('abc'.repeat(70)), okSha = Buffer.from(Ifc.sha1(b)).toString('hex') === crypto.createHash('sha1').update(b).digest('hex');
  var okUuid = Buffer.from(Ifc.uuid5Bytes('GEN-X-1')).toString('hex') === (function () { var h = crypto.createHash('sha1').update(Buffer.concat([Buffer.from('6f6b7a10-2b4e-4b4e-9b1e-1c0de0bb1d17'.replace(/-/g, ''), 'hex'), Buffer.from('GEN-X-1')])).digest(), d = Buffer.from(h.slice(0, 16)); d[6] = (d[6] & 0x0f) | 0x50; d[8] = (d[8] & 0x3f) | 0x80; return d.toString('hex'); })();
  var vpath = path.join(ROOT, '..', 'viewer', 'ifc_export_worker.js'), bound = null, nRand = 2000;
  if (fs.existsSync(vpath)) {
    var ctx = { self: {}, postMessage: function () { }, TextEncoder: TextEncoder, console: { log: function () { } } }; vm.createContext(ctx); vm.runInContext(fs.readFileSync(vpath, 'utf8'), ctx);
    var eq = 0; for (var i = 0; i < nRand; i++) { var bs = crypto.randomBytes(16), a1 = ctx.compressBytes(Array.from(bs)), a2 = Ifc.compress(bs); if (a1 === a2) eq++; } bound = eq === nRand;
  }
  verdict('GUID_UNIT', okKnown && okSha && okUuid && bound !== false ? (bound === null ? null : true) : false, 'project_gid=' + Ifc.gidOf('project') + ' python_value_equal=' + okKnown + ' sha1_equals_node=' + okSha + ' uuid5_equals_node=' + okUuid + ' compress_equals_viewer_worker=' + bound + ' (' + nRand + ' random inputs; null = the Viewer file was not found)');
})();

// ================================================================== SYNTH_TRUTH
var SYN = (function () {
  var G = Rebar.make(8), els = [];
  function flat(tris) { var W = new Float64Array(tris.length * 9), k = 0; tris.forEach(function (t) { for (var a = 0; a < 3; a++) for (var c = 0; c < 3; c++) W[k++] = t[a][c]; }); return W; }
  function box(lo, hi) {   // a closed outward-wound box: 12 triangles
    var P = function (x, y, z) { return [x ? hi[0] : lo[0], y ? hi[1] : lo[1], z ? hi[2] : lo[2]]; }, F = [[[0, 0, 0], [0, 1, 0], [1, 1, 0]], [[0, 0, 0], [1, 1, 0], [1, 0, 0]], [[0, 0, 1], [1, 0, 1], [1, 1, 1]], [[0, 0, 1], [1, 1, 1], [0, 1, 1]], [[0, 0, 0], [1, 0, 0], [1, 0, 1]], [[0, 0, 0], [1, 0, 1], [0, 0, 1]],
      [[1, 0, 0], [1, 1, 0], [1, 1, 1]], [[1, 0, 0], [1, 1, 1], [1, 0, 1]], [[1, 1, 0], [0, 1, 0], [0, 1, 1]], [[1, 1, 0], [0, 1, 1], [1, 1, 1]], [[0, 1, 0], [0, 0, 0], [0, 0, 1]], [[0, 1, 0], [0, 0, 1], [0, 1, 1]]];
    return F.map(function (t) { return t.map(function (p) { return P(p[0], p[1], p[2]); }); });
  }
  var bars = []; [[20, 0], [20, 0.2], [20, 0.4], [16, 0.6], [16, 0.8]].forEach(function (b) { G.prism([0, b[1], 1], [3, b[1], 1], b[0] / 2000).forEach(function (t) { bars.push(t); }); });   // 3 x T20 then 2 x T16, each 3.000 m long
  els.push({ guid: 'GEN-RB-HOSTBEAM-BOT', cls: 'IfcReinforcingBar', name: 'Beam bottom bars 5 x 3T20 + 2T16 [stated "3T20 + 2T16" | mark B1 DXF]', storey: 'L1', host: 'HOSTBEAM', rule: 'Beam bottom bars from schedule mark B1', detail: 'stated "3T20 + 2T16" (DXF) | 5 of 5 bars placed | length 3000..3000 mm of a 3100 mm beam', tris: flat(bars) });
  var st = []; G.tieLoop(1.5, 1.0, 0.0, 0.1, 0.2, 0.005).forEach(function (t) { st.push(t); });
  els.push({ guid: 'GEN-RB-HOSTBEAM-STR', cls: 'IfcReinforcingBar', name: 'Beam stirrups 1 x T10 @ 150 [stated "2T10-150" | mark B1 DXF]', storey: 'L1', host: 'HOSTBEAM', rule: 'Beam stirrups from schedule mark B1', detail: 'stated "2T10-150" (DXF) | 1 loops of 1 positions', tris: flat(st.map(function (t) { return [[t[0][2], t[0][0], t[0][1]], [t[1][2], t[1][0], t[1][1]], [t[2][2], t[2][0], t[2][1]]]; })) });
  els.push({ guid: 'GEN-CR-HOSTBEAM-A-PL', cls: 'IfcPlate', name: 'Fin plate 10 x 150 x 100 mm', storey: 'L1', host: 'HOSTBEAM', rule: 'Fin plate joint', detail: 'beam "B" end A | Fin plate', tris: flat(box([0, 0, 0], [0.1, 0.01, 0.15])) });
  els.push({ guid: 'GEN-CR-HOSTBEAM-A-BT', cls: 'IfcMechanicalFastener', name: '2 x M20 bolt assemblies, pitch 60', storey: 'L1', host: 'HOSTBEAM', rule: 'Fin plate joint', detail: 'beam "B" end A | bolts', tris: flat(box([0.02, 0, 0.02], [0.04, 0.03, 0.04])) });
  els.push({ guid: 'GEN-CR-HOSTBEAM-A-WD', cls: 'IfcFastener', name: '2 fillet welds 6 mm', storey: 'L1', host: 'HOSTBEAM', rule: 'Fin plate joint', detail: 'beam "B" end A | welds', tris: flat(box([0.05, 0, 0.05], [0.06, 0.02, 0.06])) });
  els.push({ guid: 'GEN-LY-WALL1-0', cls: 'IfcBuildingElementPart', name: 'Concrete C30 100.0 mm (layer 0 of Wall 200)', storey: 'L1', host: 'WALL1', rule: 'Layer split along IfcMaterialLayerSetUsage AXIS2', detail: 'host=IfcWall "W" | layer 0', tris: flat(box([5, 5, 0], [5.1, 6, 3])) });
  return els;
})();
(function () {
  var frame = { frame_name: 'synthetic frame', project_name: 'Synthetic add-on', shift_m: [1000, 2000, 0], site: { location_m: [10, 20, 0], ref_direction: [0.6, 0.8], latitude: [10, 20, 30, 0], longitude: [40, 50, 10, 0], elevation_m: 0 }, storey_elevations_m: { L1: 3.5 } };
  var vf = Ifc.validateFrame(frame), r2 = Ifc.build(SYN, { schema: 'IFC2X3', frame: frame, fileName: 'synth.ifc' }), r4 = Ifc.build(SYN, { schema: 'IFC4', frame: null, elev: { L1: 3.5 }, fileName: 'synth4.ifc', gradeOf: function (h) { return h === 'HOSTBEAM' ? { fy: '500', src: 'synthetic' } : null; } });
  var ok = vf.ok && r2.ok && r4.ok, why = [];
  var t2 = r2.ok ? Ifc.textOf(r2) : '', R2 = stepRoots(t2), R4 = r4.ok ? stepRoots(Ifc.textOf(r4)) : { cls: {}, ids: [] };
  // hand truth: the T20 / T16 set splits in 2 bars (3 + 2), the stirrup loop is 1 bar set (1 diameter), plate + bolts + welds -> 1 assembly, 1 layer part; every product has 1 Pset + 1 rel
  var want = { IFCREINFORCINGBAR: 3, IFCPLATE: 1, IFCMECHANICALFASTENER: 1, IFCFASTENER: 1, IFCBUILDINGELEMENTPART: 1, IFCELEMENTASSEMBLY: 1, IFCPROPERTYSET: 7, IFCRELDEFINESBYPROPERTIES: 7 };
  Object.keys(want).forEach(function (k) { if (R2.cls[k] !== want[k]) { ok = false; why.push(k + '=' + R2.cls[k] + ' want ' + want[k]); } });
  var gids = [Ifc.gidOf('GEN-RB-HOSTBEAM-BOT#T20'), Ifc.gidOf('GEN-RB-HOSTBEAM-BOT#T16'), Ifc.gidOf('GEN-RB-HOSTBEAM-STR'), Ifc.gidOf('GEN-CR-HOSTBEAM-A-PL'), Ifc.gidOf('GEN-CR-HOSTBEAM-A'), Ifc.gidOf('GEN-LY-WALL1-0')];
  gids.forEach(function (g, i) { if (R2.ids.indexOf(g) < 0) { ok = false; why.push('GlobalId ' + i + ' missing'); } });
  if (new Set(R2.ids).size !== R2.ids.length) { ok = false; why.push('GlobalIds not unique'); }
  var T = t2, nd20 = /IFCREINFORCINGBAR\([^\n]*,0\.02,[^\n]*\.MAIN\./.test(T), nd16 = /IFCREINFORCINGBAR\([^\n]*,0\.016,[^\n]*\.MAIN\./.test(T), lig = /IFCREINFORCINGBAR\([^\n]*\.LIGATURE\./.test(T), len3 = /IFCREINFORCINGBAR\([^\n]*,3\.,\.MAIN\./.test(T), cnt3 = /'BarCount',\$,IFCREAL\(3\.\)/.test(T);
  if (!(nd20 && nd16 && lig && len3 && cnt3)) { ok = false; why.push('bar values nd20=' + nd20 + ' nd16=' + nd16 + ' ligature=' + lig + ' BarLength3=' + len3 + ' BarCount3=' + cnt3); }
  if (!/IFCRELAGGREGATES\('[^']+',#\d+,\$,\$,#\d+,\(#\d+,#\d+,#\d+\)\)/.test(T)) { ok = false; why.push('no 3-part aggregation'); }
  if (!/IFCMATERIAL\('Concrete C30'\)/.test(T) || !/IFCMATERIAL\('Steel \(grade not stated\)'\)/.test(T) || !/IFCMATERIAL\('Reinforcing steel \(grade not stated\)'\)/.test(T)) { ok = false; why.push('materials'); }
  if (!/frame: synthetic frame \(shift_m=\[1000\.0, 2000\.0, 0\.0\]\)/.test(T)) { ok = false; why.push('description does not state the frame'); }
  var T4 = r4.ok ? Ifc.textOf(r4) : '';
  if (!/DB frame written as is \(no frame file given\)/.test(T4) || !/IFCTRIANGULATEDFACESET/.test(T4) || !/'fy 500 MPa \(stated\)'/.test(T4) || !/\.BOLT\./.test(T4) || !/\.WELD\./.test(T4) || !/FILE_SCHEMA\(\('IFC4'\)\)/.test(T4)) { ok = false; why.push('IFC4 file shape'); }
  if (R4.ids.length !== R2.ids.length || !sameMap(R2.cls, R4.cls)) { ok = false; why.push('IFC4 class counts differ from IFC2X3'); }
  var bad = Ifc.build(SYN, { schema: 'IFC2X3', frame: { storey_elevations_m: { OTHER: 1 } } }), refused = !bad.ok && /Storey "L1" has no elevation/.test(bad.why || '');
  if (!refused) { ok = false; why.push('a storey without an elevation was not refused: ' + bad.why); }
  var mf = Ifc.validateFrame({ shift_m: [1, 2] }), mf2 = Ifc.validateFrame([1]), refusedFrame = !mf.ok && !mf2.ok; if (!refusedFrame) { ok = false; why.push('a malformed frame was accepted'); }
  verdict('SYNTH_TRUTH', ok, 'IFC2X3 roots=' + R2.ids.length + ' classes=' + JSON.stringify(R2.cls) + ' IFC4 roots=' + R4.ids.length + ' T20/T16 split=' + (nd20 && nd16) + ' ligature=' + lig + ' stated_len=' + len3 + ' assembly=1 materials ok frame_stated=true storey_without_elevation_refused=' + refused + ' malformed_frame_refused=' + refusedFrame + (why.length ? ' PROBLEMS: ' + why.join('; ') : ''));
  if (r2.ok && r4.ok) { var f2 = writeOut('synth_IFC2X3.ifc', r2), f4 = writeOut('synth_IFC4.ifc', r4); pyCheck(f2, null, 'SYNTH2'); pyCheck(f4, null, 'SYNTH4'); }
})();

// ================================================================== the real parity runs
function loadDb(SQL, p) { return new SQL.Database(new Uint8Array(fs.readFileSync(p))); }
function rowsOf(file, over) { var base = Rules.load(JSON.parse(fs.readFileSync(path.join(ROOT, 'lod/rules/' + file), 'utf8'))); return over ? Rules.merge(base, over).rows : base; }
function parityVs(name, mineText, refPath, stat) {
  var ref = fs.readFileSync(refPath, 'utf8'), M = stepRoots(mineText), R = stepRoots(ref), sm = new Set(M.ids), sr = new Set(R.ids), onlyM = M.ids.filter(function (g) { return !sr.has(g); }).length, onlyR = R.ids.filter(function (g) { return !sm.has(g); }).length;
  var okCls = sameMap(M.cls, R.cls), okIds = !onlyM && !onlyR && M.ids.length === R.ids.length && sm.size === M.ids.length;
  verdict(name + '_CLASSES', okCls, 'mine=' + JSON.stringify(M.cls) + ' oracle=' + JSON.stringify(R.cls) + (stat ? ' ' + stat : ''));
  verdict(name + '_GLOBALIDS', okIds, 'mine=' + M.ids.length + ' oracle=' + R.ids.length + ' unique_mine=' + sm.size + ' only_in_mine=' + onlyM + ' only_in_oracle=' + onlyR);
  return okCls && okIds;
}

initSqlJs({ wasmBinary: wasmBinary }).then(function (SQL) {
  var frame = E.LODUP_FRAME_JSON ? JSON.parse(fs.readFileSync(E.LODUP_FRAME_JSON, 'utf8')) : null, anyReal = false;
  var optsBase = function (fileName, schema, fr, elev, gradeOf) { return { schema: schema, frame: fr, elev: elev || {}, fileName: fileName, gradeOf: gradeOf, breakGuid: MAIN_BREAK }; };
  // ---------------------------------------------------------------- REAL_REBAR: the beam-rebar sets of the base model, IFC2X3, the frame JSON
  if (E.LODUP_SRC_DB && E.LODUP_MARKS_JSON && frame && E.LODUP_REF_IFC_REBAR) {
    anyReal = true; var db = loadDb(SQL, E.LODUP_SRC_DB), inp = Reader.fromDb(db); inp.callouts = []; inp.inputs = { beambars: { schedule: JSON.parse(fs.readFileSync(E.LODUP_MARKS_JSON, 'utf8')) } }; inp.generated = function () { return []; };
    var t0 = Date.now(), res = Beam.run(inp, rowsOf('beambar_defaults.json'), { log: function () { } }), els = elementsOf([{ id: 'beambars', res: res, inp: inp }]);
    console.log('§LODUP_IFC_MODE real rebar: ' + res.parts.length + ' sets built in ' + (Date.now() - t0) + ' ms (source LODUP_SRC_DB, marks LODUP_MARKS_JSON, frame LODUP_FRAME_JSON, oracle LODUP_REF_IFC_REBAR) break_guid=' + (MAIN_BREAK ? 1 : 0));
    var o1 = optsBase('beam_rebar_addon.ifc', 'IFC2X3', frame), t1 = Date.now(), r1 = Ifc.build(els, o1), ms1 = Date.now() - t1;
    verdict('REAL_REBAR_BUILD', r1.ok && r1.stats.untraced === 0 && r1.stats.mesh.open === 0, 'ok=' + r1.ok + ' parts=' + (r1.stats && r1.stats.parts) + ' classes=' + JSON.stringify(r1.stats && r1.stats.classes) + ' split=' + JSON.stringify(r1.stats && r1.stats.split) + ' mixed_elements=' + (r1.stats && r1.stats.mixed.length) + ' mesh=' + JSON.stringify(r1.stats && r1.stats.mesh) + ' untraced=' + (r1.stats && r1.stats.untraced) + ' ms=' + ms1);
    if (r1.ok) {
      var text1 = Ifc.textOf(r1), file1 = path.join(OUT, 'beam_rebar_addon_js.ifc'); fs.writeFileSync(file1, text1); var h1 = sha(text1);
      var ok = parityVs('REAL_REBAR', text1, E.LODUP_REF_IFC_REBAR, 'mixed_diameter_elements=' + r1.stats.mixed.length + ' per_diameter_counts_equal_stated=' + r1.stats.mixed.filter(function (m) { return m.stated && m.per.every(function (p) { return m.stated[p[0]] === p[1]; }); }).length);
      var r1b = Ifc.build(els, o1), h2 = sha(Ifc.textOf(r1b));
      verdict('DETERMINISM', MAIN_BREAK ? null : h1 === h2, 'sha256 run1=' + h1.slice(0, 16) + ' run2=' + h2.slice(0, 16) + ' bytes=' + text1.length + (MAIN_BREAK ? ' (random GlobalIds: not applicable in the break run)' : ''));
      if (!MAIN_BREAK) {
        // the red control: random GlobalIds must fail the GlobalId check
        var rb = Ifc.build(els.slice(0, 20), Object.assign({}, o1, { breakGuid: true })), Mb = stepRoots(Ifc.textOf(rb)), Rr = stepRoots(fs.readFileSync(E.LODUP_REF_IFC_REBAR, 'utf8')), sr = new Set(Rr.ids), hit = Mb.ids.filter(function (g) { return sr.has(g); }).length;
        verdict('BREAK_CHECK', hit < Mb.ids.length, 'switch=on (random GlobalIds): ' + Mb.ids.length + ' ids, ' + hit + ' equal to the oracle (the GlobalId check must FAIL: 0 of ' + Mb.ids.length + ' expected equal) expected GLOBALIDS=FAIL got ' + (hit === Mb.ids.length ? 'PASS' : 'FAIL'));
        pyCheck(file1, E.LODUP_REF_IFC_REBAR, 'REBAR');
      }
    }
  }
  // ---------------------------------------------------------------- REAL_SHED: rebar + welds, IFC4, the DB frame as is
  if (E.LODUP_SHED_DB && E.LODUP_REF_IFC_SHED) {
    anyReal = true; var sdb = loadDb(SQL, E.LODUP_SHED_DB), sinp = Reader.fromDb(sdb); sinp.callouts = []; sinp.inputs = {}; sinp.generated = function () { return []; };
    var zone = parseFloat(E.LODUP_ZONE_IN || '20'), rr = Rebar.run(sinp, rowsOf('rebar_defaults.json', { column_zone_A_stated_in: { value: zone, unit: 'in', source: 'stated: LODUP_ZONE_IN' } }), { log: function () { } }), wr = Weld.run(sinp, rowsOf('weld_defaults.json'), { log: function () { } });
    var selev = {}; try { q(sdb, 'SELECT name, elevation_attr_m FROM storey_elevation').forEach(function (v) { if (v[1] !== null) selev[v[0]] = Number(v[1]); }); } catch (e) { selev = {}; }
    var sels = elementsOf([{ id: 'rebar', res: rr, inp: sinp }, { id: 'welds', res: wr, inp: sinp }]);
    var gradeOf = function (h) { var s = sinp.sched[h]; return s && s.Note_fy_MPa !== undefined && s.Note_fy_MPa !== null ? { fy: s.Note_fy_MPa, src: s.NoteSource_fy_MPa === undefined || s.NoteSource_fy_MPa === null ? 'None' : s.NoteSource_fy_MPa } : null; };
    console.log('§LODUP_IFC_MODE real shed: ' + rr.parts.length + ' rebar sets + ' + wr.parts.length + ' welds, storeys from the DB table=' + JSON.stringify(selev) + ' (oracle LODUP_REF_IFC_SHED) break_guid=' + (MAIN_BREAK ? 1 : 0));
    var so = optsBase('SHED_rebar_welds_addon.ifc', 'IFC4', null, selev, gradeOf), sr1 = Ifc.build(sels, so);
    verdict('REAL_SHED_BUILD', sr1.ok && sr1.stats.untraced === 0 && sr1.stats.mesh.open === 0, 'ok=' + sr1.ok + (sr1.ok ? ' parts=' + sr1.stats.parts + ' classes=' + JSON.stringify(sr1.stats.classes) + ' mesh=' + JSON.stringify(sr1.stats.mesh) + ' untraced=' + sr1.stats.untraced + ' frame=' + sr1.stats.frame : ' why=' + sr1.why));
    if (sr1.ok) {
      var st1 = Ifc.textOf(sr1), sf = path.join(OUT, 'SHED_rebar_welds_addon_js.ifc'); fs.writeFileSync(sf, st1);
      parityVs('REAL_SHED', st1, E.LODUP_REF_IFC_SHED, 'steel_grade_stated=' + (st1.match(/'fy [^']* MPa \(stated\)'/g) || []).length + ' places');
      var sh2 = sha(Ifc.textOf(Ifc.build(sels, so)));
      verdict('DETERMINISM_SHED', MAIN_BREAK ? null : sha(st1) === sh2, 'sha256 run1=' + sha(st1).slice(0, 16) + ' run2=' + sh2.slice(0, 16));
      if (!MAIN_BREAK) pyCheck(sf, E.LODUP_REF_IFC_SHED, 'SHED');
    }
  }
  // ---------------------------------------------------------------- REAL_GUSSET (optional): one joint = plate + bolts + welds in one IfcElementAssembly
  if (E.LODUP_SRC_DB && frame && E.LODUP_REF_IFC_GUSSET) {
    anyReal = true; var gdb = loadDb(SQL, E.LODUP_SRC_DB), ginp = Reader.fromDb(gdb); ginp.callouts = []; ginp.inputs = {}; ginp.generated = function () { return []; };
    var gr = Gusset.run(ginp, rowsOf('gusset_defaults.json'), { log: function () { } }), gels = elementsOf([{ id: 'gussets', res: gr, inp: ginp }]), go = optsBase('gussets_addon.ifc', 'IFC2X3', frame), g1 = Ifc.build(gels, go);
    verdict('REAL_GUSSET_BUILD', g1.ok && g1.stats.mesh.open === 0, 'ok=' + g1.ok + (g1.ok ? ' parts=' + g1.stats.parts + ' classes=' + JSON.stringify(g1.stats.classes) : ' why=' + g1.why));
    if (g1.ok) { var gt = Ifc.textOf(g1), gf = path.join(OUT, 'gussets_addon_js.ifc'); fs.writeFileSync(gf, gt); parityVs('REAL_GUSSET', gt, E.LODUP_REF_IFC_GUSSET, ''); if (!MAIN_BREAK) pyCheck(gf, E.LODUP_REF_IFC_GUSSET, 'GUSSET', ['--ignore-pset', 'Rule']); }
    // --ignore-pset Rule: the P5 gusset pack words the rule column from its rule rows ("+ shared fin-plate rows + gusset rows [default: ...]"), the oracle wrote "conn_rules.json / gusset_rules.json defaults":
    // a P5 wording difference (change rows were compared without the rule text), counted and printed, not an IFC defect.
  }
  // ---------------------------------------------------------------- REAL_JOINTS (P4 FIX SPEC): the joints pack exported IFC2X3 with the frame JSON's storeys; the writer's MESH and the python SOLIDS must PASS; the old weld caps must FAIL MESH
  if (E.LODUP_JOINT_DB && frame) {
    anyReal = true; var jdb = loadDb(SQL, E.LODUP_JOINT_DB), jinp = Reader.fromDb(jdb); jinp.callouts = []; jinp.inputs = {}; jinp.generated = function () { return []; };
    var jr = Joint.run(jinp, rowsOf('joint_defaults.json'), { log: function () { } }), jels = elementsOf([{ id: 'joints', res: jr, inp: jinp }]), jo = optsBase('joints_addon.ifc', 'IFC2X3', frame), j1 = Ifc.build(jels, jo);
    verdict('REAL_JOINTS_BUILD', j1.ok && j1.stats.mesh.open === 0 && j1.stats.mesh.closed > 0 && j1.stats.untraced === 0, 'ok=' + j1.ok + (j1.ok ? ' parts=' + j1.stats.parts + ' classes=' + JSON.stringify(j1.stats.classes) + ' mesh=' + JSON.stringify(j1.stats.mesh) + ' untraced=' + j1.stats.untraced : ' why=' + j1.why));
    if (j1.ok && !MAIN_BREAK) { var jf = path.join(OUT, 'joints_addon_js.ifc'); fs.writeFileSync(jf, Ifc.textOf(j1)); pyCheck(jf, null, 'JOINTS');
      var jb = Joint.run(jinp, rowsOf('joint_defaults.json'), { log: function () { }, breakWeldWinding: true }), jb1 = Ifc.build(elementsOf([{ id: 'joints', res: jb, inp: jinp }]), jo);
      verdict('BREAK_JOINTS_MESH', jb1.ok && jb1.stats.mesh.open > 0, 'switch=on (the old weld caps): mesh=' + JSON.stringify(jb1.ok ? jb1.stats.mesh : null) + ' expected MESH=FAIL got MESH=' + (jb1.ok && jb1.stats.mesh.open > 0 ? 'FAIL' : 'PASS')); }
  }
  if (!anyReal) { verdict('REAL_PARITY', null, 'LODUP_SRC_DB / LODUP_MARKS_JSON / LODUP_FRAME_JSON / LODUP_REF_IFC_REBAR and LODUP_SHED_DB / LODUP_REF_IFC_SHED not set: the parity against the oracle files was NOT judged (SYNTH_TRUTH only)'); }
  console.log('§LODUP_IFC_OUT dir=' + OUT + ' (the exported files; private, not committed)');
  console.log('§LODUP_IFC_SUMMARY failed=' + (FAILS.join(',') || 'none') + ' inconclusive=' + (INCONC.join(',') || 'none') + ' python_half_skipped=' + (SKIPS.join(',') || 'none') + ' mode=' + (anyReal ? 'real' : 'synthetic') + ' break=' + (MAIN_BREAK ? 1 : 0));
  process.exit(FAILS.length ? 1 : 0);
}).catch(function (e) { console.error('§LODUP_IFC_CRASH ' + (e && e.stack || e)); process.exit(2); });
