#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-IFC-GRID (prompts/DISC_WALK_DRAWN_MAINS.md §4.2a). Read the log after every run; exit code is not evidence.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: an opened IFC loses its stated grid, so a sheet cannot be placed. Both IFC routes (the Modeller's open through
 * the shared extractor, and the Viewer's import worker + builder) must keep the IfcGrid / IfcGridAxis as data (table ifc_grid_axis, one reader:
 * common/ifc_grid_read.js), each in its OWN element_transforms frame.
 *
 * No public IFC in this repo states a grid, so this witness WRITES one (IFC4): a storey placed at an offset; an IfcGrid placed relative to that storey with a
 * translation AND a 28 degree rotation; U axes A B C and V axes 1 2 3 (polylines, one 3-point; A and 3 are trimmed IfcLine, A by points, 3 by parameters);
 * an IfcColumn placed exactly where axes B and 2 cross. A second copy sits at a map offset (500 km), where the import route rebases and the open route does not.
 *
 *   G1 axes and tags per grid equal the file's (6 axes, tags A B C 1 2 3, storey, grid name), per route.
 *   G2 per route: the column centre (that route's own element_transforms) lies on axes B and 2, perpendicular distance < 1 mm.
 *      RED CONTROL: the same axes with the placement chain left out (raw curve coordinates) must FAIL G2 (else G2 cannot see a missing chain).
 *   G3 a file with no grid writes no rows and no table, and logs grids=0 (each route).
 *   G4 the trimmed IfcLine axes (3 by parameters, A by points) keep their stated ends, and a 3-point polyline keeps first and last.
 *   G5 nothing else changes versus the same file on origin/main's code (BASE=<ref> to change): same tables except ifc_grid_axis, same elements_meta and
 *      element_transforms rows. INCONCLUSIVE when the base already holds the reader.
 * Usage: NODE_PATH=~/bim-compiler/node_modules node modeller/tests/witness_ifc_grid.js
 */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..'), NM = path.join(os.homedir(), 'bim-compiler', 'node_modules');
const WebIFC = require(path.join(NM, 'web-ifc/web-ifc-api-node.js')), initSqlJs = require(path.join(NM, 'sql.js'));
const _init = WebIFC.IfcAPI.prototype.Init; WebIFC.IfcAPI.prototype.Init = function () { this.SetWasmPath(path.join(NM, 'web-ifc') + '/', true); return _init.call(this); };   // the worker builds its own IfcAPI with a browser wasm locator
const GridRead = require(path.join(ROOT, 'common', 'ifc_grid_read.js'));
const say = s => console.log(s);
let pass = 0, fail = 0, inconclusive = 0;
const chk = (id, ok, d) => { if (ok) pass++; else fail++; say((ok ? '§PASS ' : '§FAIL ') + id + ' | ' + d); };
const inc = (id, d) => { inconclusive++; say('§INCONCLUSIVE ' + id + ' | ' + d); };

// ── the fixture: every number below is the file's, and the expected world positions are computed here from them, independently of the reader ──
const ANG = 28 * Math.PI / 180, C = Math.cos(ANG), S = Math.sin(ANG), GRID_LOC = [10, 5, 0];
const U = [['A', [[0, -2], [0, 14]], 'trimPts'], ['B', [[6, -2], [6, 14]]], ['C', [[12, -2], [12, 7], [12, 14]]]];   // x = const lines
const V = [['1', [[-2, 0], [14, 0]]], ['2', [[-2, 5], [14, 5]]], ['3', [[-2, 10], [14, 10]], 'trimParam']];           // y = const lines
const HERE = [6, 5];   // axes B and 2 cross
const world = (storeyO, p) => [storeyO[0] + GRID_LOC[0] + C * p[0] - S * p[1], storeyO[1] + GRID_LOC[1] + S * p[0] + C * p[1]];
const guid = n => '3' + String(n).padStart(21, '0');
function ifc(storeyO, withGrid) {
  const L = [], f = x => (Number.isInteger(x) ? x + '.' : String(x)), e = (n, s) => L.push('#' + n + '=' + s + ';');
  e(10, 'IFCCARTESIANPOINT((0.,0.,0.))'); e(11, 'IFCDIRECTION((0.,0.,1.))'); e(12, 'IFCDIRECTION((1.,0.,0.))'); e(13, 'IFCAXIS2PLACEMENT3D(#10,#11,#12)');
  e(14, 'IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)'); e(15, 'IFCUNITASSIGNMENT((#14))');
  e(20, 'IFCGEOMETRICREPRESENTATIONCONTEXT($,\'Model\',3,1.E-5,#13,$)'); e(21, 'IFCGEOMETRICREPRESENTATIONSUBCONTEXT(\'Body\',\'Model\',*,*,*,*,#20,$,.MODEL_VIEW.,$)');
  e(1, `IFCPROJECT('${guid(1)}',$,'Fixture',$,$,$,$,(#20),#15)`);
  e(30, `IFCSITE('${guid(30)}',$,'Site',$,$,#31,$,$,.ELEMENT.,$,$,$,$,$)`); e(31, 'IFCLOCALPLACEMENT($,#13)');
  e(32, `IFCBUILDING('${guid(32)}',$,'Building',$,$,#33,$,$,.ELEMENT.,$,$,$)`); e(33, 'IFCLOCALPLACEMENT(#31,#13)');
  e(34, `IFCBUILDINGSTOREY('${guid(34)}',$,'Level 1',$,$,#35,$,$,.ELEMENT.,${f(storeyO[2])})`); e(35, 'IFCLOCALPLACEMENT(#33,#36)');
  e(36, 'IFCAXIS2PLACEMENT3D(#37,$,$)'); e(37, `IFCCARTESIANPOINT((${storeyO.map(f).join(',')}))`);
  e(40, `IFCRELAGGREGATES('${guid(40)}',$,$,$,#1,(#30))`); e(41, `IFCRELAGGREGATES('${guid(41)}',$,$,$,#30,(#32))`); e(42, `IFCRELAGGREGATES('${guid(42)}',$,$,$,#32,(#34))`);
  // the column: placed in the STOREY's frame at gridLoc + R * HERE (the rotation does not matter to a square profile; the position does)
  const colLoc = [GRID_LOC[0] + C * HERE[0] - S * HERE[1], GRID_LOC[1] + S * HERE[0] + C * HERE[1], 0];
  e(70, `IFCCOLUMN('${guid(70)}',$,'Col B2',$,$,#71,#73,$,.COLUMN.)`); e(71, 'IFCLOCALPLACEMENT(#35,#72)'); e(72, 'IFCAXIS2PLACEMENT3D(#74,$,$)');
  e(74, `IFCCARTESIANPOINT((${colLoc.map(x => x.toFixed(12)).join(',')}))`);
  // the body: a closed faceted box centred on the placement origin (8 corners, 6 quads), so the mesh-vertex mean the extractor calls the centre IS the origin in x,y
  // (an extruded profile tessellates to 34 vertices whose mean sits 11.7 mm off the origin: measured, and it is the extractor's centre rule, not this change's)
  e(73, 'IFCPRODUCTDEFINITIONSHAPE($,$,(#75))'); e(75, 'IFCSHAPEREPRESENTATION(#21,\'Body\',\'Brep\',(#76))'); e(76, 'IFCFACETEDBREP(#77)'); e(77, 'IFCCLOSEDSHELL((#1101,#1102,#1103,#1104,#1105,#1106))');
  const K = []; for (const z of [0, 3]) for (const [x, y] of [[-0.2, -0.2], [0.2, -0.2], [0.2, 0.2], [-0.2, 0.2]]) { K.push(60 + K.length); e(K[K.length - 1], `IFCCARTESIANPOINT((${x},${y},${z}.))`); }
  [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]].forEach((f, i) => { e(1201 + i, `IFCPOLYLOOP((${f.map(k => '#' + K[k]).join(',')}))`); e(1301 + i, `IFCFACEOUTERBOUND(#${1201 + i},.T.)`); e(1101 + i, `IFCFACE((#${1301 + i}))`); });
  const contained = [70];
  if (withGrid) {
    let n = 100; const axes = [];
    const pt = p => { e(++n, `IFCCARTESIANPOINT((${f(p[0])},${f(p[1])}))`); return '#' + n; };
    const axis = (tag, pts, kind) => {
      let cur;
      if (kind === 'trimPts' || kind === 'trimParam') {   // an IfcTrimmedCurve over an IfcLine through the first point, running along the line
        const a = pts[0], b = pts[pts.length - 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]), P = pt(a);
        e(++n, `IFCDIRECTION((${f((b[0] - a[0]) / len)},${f((b[1] - a[1]) / len)}))`); const d = n;
        e(++n, `IFCVECTOR(#${d},1.)`); const v = n; e(++n, `IFCLINE(${P},#${v})`); const ln = n;
        if (kind === 'trimPts') { const t1 = pt(a), t2 = pt(b); e(++n, `IFCTRIMMEDCURVE(#${ln},(${t1}),(${t2}),.T.,.CARTESIAN.)`); }
        else e(++n, `IFCTRIMMEDCURVE(#${ln},(IFCPARAMETERVALUE(0.)),(IFCPARAMETERVALUE(${f(len)})),.T.,.PARAMETER.)`);
        cur = n;
      } else { const ids = pts.map(pt); e(++n, `IFCPOLYLINE((${ids.join(',')}))`); cur = n; }
      e(++n, `IFCGRIDAXIS('${tag}',#${cur},.T.)`); axes.push(n); return n;
    };
    const ua = U.map(([t, p, k]) => axis(t, p, k)), va = V.map(([t, p, k]) => axis(t, p, k));
    e(50, `IFCGRID('${guid(50)}',$,'Grid 1',$,$,#51,$,(${ua.map(i => '#' + i).join(',')}),(${va.map(i => '#' + i).join(',')}),$)`);
    e(51, 'IFCLOCALPLACEMENT(#35,#52)'); e(52, 'IFCAXIS2PLACEMENT3D(#53,#11,#54)');
    e(53, `IFCCARTESIANPOINT((${GRID_LOC.map(f).join(',')}))`); e(54, `IFCDIRECTION((${C.toFixed(15)},${S.toFixed(15)},0.))`);
    contained.push(50);
  }
  e(90, `IFCRELCONTAININEDX`.replace('IFCRELCONTAININEDX', `IFCRELCONTAINEDINSPATIALSTRUCTURE('${guid(90)}',$,$,$,(${contained.map(i => '#' + i).join(',')}),#34)`));
  L.sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));
  return 'ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION((\'ViewDefinition [ReferenceView]\'),\'2;1\');\nFILE_NAME(\'grid_fixture.ifc\',\'2026-11-08\',(\'\'),(\'\'),\'\',\'\',\'\');\nFILE_SCHEMA((\'IFC4\'));\nENDSEC;\nDATA;\n' + L.join('\n') + '\nENDSEC;\nEND-ISO-10303-21;\n';
}

// ── the two routes, driven the way their witnesses drive them ──
const rowsOf = (db, sql) => { try { const r = db.exec(sql); return r.length ? r[0].values : []; } catch (e) { return null; } };
const tablesOf = db => (rowsOf(db, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name") || []).map(r => r[0]);
async function openRoute(SQL, api, dir, bytes, withReader) {   // dir: a code tree holding modeller/dxf2bim/ifc_extract_core.js + modeller/ifc_open_db.js
  const Core = require(path.join(dir, 'modeller', 'dxf2bim', 'ifc_extract_core.js')), IOD = require(path.join(dir, 'modeller', 'ifc_open_db.js')), logs = [];
  const r = await IOD.open({ WebIFC, ifcApi: api, SQL, Core, GridRead: withReader ? GridRead : undefined, bytes, name: 'grid_fixture', log: s => logs.push(String(s)) });
  return { db: r.db, logs };
}
function importRoute(SQL, dir, bytes, withReader) {   // dir: a code tree holding viewer/import_worker.js + viewer/import_db_builder.js + viewer/ifc_declared_storeys.js
  const V = path.join(dir, 'viewer'), logs = [], S2 = require(path.join(V, 'ifc_declared_storeys.js'));
  const base = () => ({ URL, Blob, TextDecoder, TextEncoder, setTimeout, Math, JSON, Date, Float32Array, Float64Array, Int32Array, Uint8Array, Uint32Array, Uint16Array, Int8Array, Int16Array, ArrayBuffer, Map, Set, Object, Array, String, Number, parseInt, parseFloat, isNaN, isFinite, Promise, performance });
  const cons = { log: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push('WARN ' + a.join(' ')), error: (...a) => logs.push('ERR ' + a.join(' ')) };
  return new Promise(res => {
    const self = { IfcDeclaredStoreys: S2 }; if (fs.existsSync(path.join(dir, 'common', 'georef_frame.js'))) self.GeorefFrame = require(path.join(dir, 'common', 'georef_frame.js')); /* §ONE-FRAME: the worker's rebase module (absent in a base tree that predates it) */ if (withReader) self.IfcGridRead = GridRead;
    const c = Object.assign(base(), { self, WebIFC, console: cons, importScripts() {} });
    self.postMessage = m => {
      if (m.type === 'done') { const c2 = Object.assign(base(), { console: cons }); vm.createContext(c2); vm.runInContext(fs.readFileSync(path.join(V, 'import_db_builder.js'), 'utf8'), c2); const o = c2.buildImportDBs(SQL, m); res({ db: new SQL.Database(new Uint8Array(o.metaDb || o.extractedDb)), logs }); }
      else if (m.type === 'error') res({ db: null, logs, error: m.message });
    };
    vm.createContext(c); vm.runInContext(fs.readFileSync(path.join(V, 'import_worker.js'), 'utf8'), c);
    self.onmessage({ data: { arrayBuffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), filename: 'grid_fixture.ifc' } });
  });
}
const gridLine = logs => logs.filter(l => l.includes('§IFC-GRID ')).join(' || ') || '(no §IFC-GRID line)';
const dist = (a, b, p) => { const dx = b[0] - a[0], dy = b[1] - a[1]; return Math.abs(dx * (p[1] - a[1]) - dy * (p[0] - a[0])) / Math.hypot(dx, dy); };
const colCentre = db => { const r = rowsOf(db, "SELECT t.center_x, t.center_y FROM element_transforms t JOIN elements_meta m ON m.guid=t.guid WHERE m.ifc_class='IfcColumn'"); return r && r.length ? r[0] : null; };
const axesOf = db => (rowsOf(db, 'SELECT grid_guid, grid_name, storey, tag, x0, y0, x1, y1, axis_set FROM ifc_grid_axis ORDER BY axis_set, tag') || []);

// the base code: origin/main's files, into a temp tree (git show), same relative layout
function baseTree(ref) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wifcgrid_base_'));
  const files = ['modeller/dxf2bim/ifc_extract_core.js', 'modeller/ifc_open_db.js', 'viewer/import_worker.js', 'viewer/import_db_builder.js', 'viewer/ifc_declared_storeys.js', 'viewer/ifc_surface_names.js'];
  try {
    for (const f of files) { const out = cp.execFileSync('git', ['-C', ROOT, 'show', ref + ':' + f], { maxBuffer: 1 << 26 }); fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), out); }
    let has = true; try { cp.execFileSync('git', ['-C', ROOT, 'cat-file', '-e', ref + ':common/ifc_grid_read.js'], { stdio: 'ignore' }); } catch (e) { has = false; }
    return { dir, alreadyHasReader: has };
  } catch (e) { return { dir: null, err: e.message.split('\n')[0] }; }
}

(async () => {
  const SQL = await initSqlJs(), api = new WebIFC.IfcAPI(); await api.Init();
  const enc = t => new TextEncoder().encode(t);
  const FIX = [['near', [100, 200, 3]], ['mapped', [500123.25, 2750456.75, 3]]];
  const BASE = process.env.BASE || 'origin/main', bt = baseTree(BASE);
  const results = {};
  for (const [key, so] of FIX) {
    const text = ifc(so, true), bytes = enc(text);
    const o = await openRoute(SQL, api, ROOT, bytes, true), im = await importRoute(SQL, ROOT, bytes, true);
    results[key] = { o, im, so };
    say(`  ${key}: open  -> ${gridLine(o.logs)}`); say(`  ${key}: import-> ${gridLine(im.logs)}` + (im.error ? ' ERROR ' + im.error : ''));
    const expectTags = ['1', '2', '3', 'A', 'B', 'C'];
    for (const [route, r] of [['open', o], ['import', im]]) {
      if (!r.db) { inc(`G1 ${key}/${route}`, 'route produced no DB: ' + (r.error || 'unknown')); continue; }
      const ax = axesOf(r.db), tags = ax.map(a => a[3]).sort();
      chk(`G1 ${key}/${route} axes and tags equal the file's`, ax.length === 6 && JSON.stringify(tags) === JSON.stringify(expectTags) && ax.every(a => a[2] === 'Level 1' && a[1] === 'Grid 1' && a[0] === guid(50)) &&
        ax.filter(a => a[8] === 'U').length === 3 && ax.filter(a => a[8] === 'V').length === 3, `rows=${ax.length} tags=${tags.join('')} storey=${[...new Set(ax.map(a => a[2]))]} grid=${[...new Set(ax.map(a => a[1]))]} | ${gridLine(r.logs)}`);
      const logOk = r.logs.some(l => l.includes('§IFC-GRID grids=1 axes=6 tagged=6 skippedCurves=0 route=' + route));
      chk(`G1 ${key}/${route} the §IFC-GRID line states the counts`, logOk, gridLine(r.logs));
      // G2: the column sits on B and 2 in THIS route's own frame
      const cc = colCentre(r.db), B = ax.find(a => a[3] === 'B'), T2 = ax.find(a => a[3] === '2');
      if (!cc || !B || !T2) { inc(`G2 ${key}/${route}`, `nothing to judge (column=${!!cc} B=${!!B} 2=${!!T2})`); continue; }
      const dB = dist([B[4], B[5]], [B[6], B[7]], cc), d2 = dist([T2[4], T2[5]], [T2[6], T2[7]], cc);
      chk(`G2 ${key}/${route} column centre on axes B and 2 (< 1 mm)`, dB < 0.001 && d2 < 0.001, `column=(${cc[0].toFixed(4)},${cc[1].toFixed(4)}) distB=${(dB * 1000).toFixed(4)}mm dist2=${(d2 * 1000).toFixed(4)}mm`);
      // RED CONTROL: the same axes, no placement chain (raw curve coordinates)
      const rawB = U[1][1], raw2 = V[1][1], rB = dist(rawB[0], rawB[1], cc), r2 = dist(raw2[0], raw2[1], cc);
      chk(`G2-RED ${key}/${route} control: axes WITHOUT the placement chain fail G2 (so G2 can see a missing chain)`, !(rB < 0.001 && r2 < 0.001), `rawB=${rB.toFixed(3)}m raw2=${r2.toFixed(3)}m from the column`);
      // G4: ends as stated, lifted through the chain (computed here independently), in this route's frame (import: minus its rebase)
      const offs = route === 'import' ? [Math.round(0), 0] : [0, 0];
      const baseOff = (() => { const m = r.logs.find(l => l.includes('§GEOREF_REBASE')); const mm = m && /offset=\(([^)]*)\)/.exec(m); return mm ? mm[1].split(',').map(Number) : [0, 0, 0]; })();   // §ONE-FRAME: both routes rebase now, and both log the §GEOREF_REBASE offset
      const want = (tag, set) => { const src = (set === 'U' ? U : V).find(a => a[0] === tag)[1]; return [src[0], src[src.length - 1]].map(p => { const w = world(so, p); return [w[0] - baseOff[0], w[1] - baseOff[1]]; }); };
      let worst = 0; const bad = [];
      ax.forEach(a => { const w = want(a[3], a[8]), d = Math.max(Math.hypot(a[4] - w[0][0], a[5] - w[0][1]), Math.hypot(a[6] - w[1][0], a[7] - w[1][1])); worst = Math.max(worst, d); if (d > 0.001) bad.push(a[3]); });
      chk(`G4 ${key}/${route} every axis keeps its stated ends (trimmed by points: A, by parameters: 3, 3-point polyline: C)`, worst < 0.001 && !bad.length, `worst end error=${(worst * 1000).toFixed(4)}mm bad=[${bad}] frameOffset=(${baseOff})`);
    }
  }
  // §ONE-FRAME: the frame of the two routes on the mapped copy. Before (A) the open route kept the map offset and the import was local (two frames, G2-FRAME asserted that difference); now both are local and equal
  { const m = results.mapped; if (m.o.db && m.im.db) { const a = axesOf(m.o.db).find(x => x[3] === 'B'), b = axesOf(m.im.db).find(x => x[3] === 'B');
      const dx = a[4] - b[4]; chk('G2-FRAME mapped: ONE frame: the open route and the import route give the grid in the same local frame (B.x0 equal within 1 mm, both < 1 km)', Math.abs(dx) < 0.001 && Math.abs(a[4]) < 1000 && Math.abs(b[4]) < 1000, `open B.x0=${a[4].toFixed(3)} import B.x0=${b[4].toFixed(3)} diff=${dx.toFixed(3)}`); } }
  // G3: no grid
  const noGrid = enc(ifc([100, 200, 3], false));
  const o0 = await openRoute(SQL, api, ROOT, noGrid, true), i0 = await importRoute(SQL, ROOT, noGrid, true);
  for (const [route, r] of [['open', o0], ['import', i0]]) {
    if (!r.db) { inc(`G3 ${route}`, 'route produced no DB: ' + (r.error || '')); continue; }
    const cols = rowsOf(r.db, 'SELECT count(*) FROM elements_meta')[0][0];
    if (!cols) { inc(`G3 ${route}`, 'the no-grid file kept no elements: nothing judged'); continue; }
    chk(`G3 ${route} no grid: no ifc_grid_axis table, and the log says grids=0`, !tablesOf(r.db).includes('ifc_grid_axis') && r.logs.some(l => l.includes('§IFC-GRID grids=0 axes=0 tagged=0 skippedCurves=0 route=' + route)), `tables has ifc_grid_axis=${tablesOf(r.db).includes('ifc_grid_axis')} | ${gridLine(r.logs)}`);
  }
  // G5: the same files on the base code
  if (!bt.dir) inc('G5', `base ${BASE} could not be read (${bt.err})`);
  else if (bt.alreadyHasReader) inc('G5', `${BASE} already holds common/ifc_grid_read.js: the comparison would be this code against itself`);
  else {
    const baseApi = new WebIFC.IfcAPI(); await baseApi.Init();
    const cases = [['near+grid', enc(ifc([100, 200, 3], true))], ['near no-grid', noGrid], ['mapped+grid', enc(ifc(FIX[1][1], true))]];
    for (const [label, bytes] of cases) for (const route of ['open', 'import']) {
      const nw = route === 'open' ? await openRoute(SQL, api, ROOT, bytes, true) : await importRoute(SQL, ROOT, bytes, true);
      const bs = route === 'open' ? await openRoute(SQL, baseApi, bt.dir, bytes, false) : await importRoute(SQL, bt.dir, bytes, false);
      if (!nw.db || !bs.db) { inc(`G5 ${label}/${route}`, 'a route produced no DB'); continue; }
      const tn = tablesOf(nw.db).filter(t => t !== 'ifc_grid_axis'), tb = tablesOf(bs.db), sameT = JSON.stringify(tn) === JSON.stringify(tb);
      const cmp = t => { const q = 'SELECT * FROM ' + t + ' ORDER BY guid'; return JSON.stringify(rowsOf(nw.db, q)) === JSON.stringify(rowsOf(bs.db, q)); };
      const pmKV = d => { const o = {}; (rowsOf(d, 'SELECT key, value FROM project_metadata') || []).forEach(r => o[r[0]] = r[1]); return o; }, pn = pmKV(nw.db), pb = pmKV(bs.db);
      const pmDiff = ' project_metadata keys that differ: [' + Object.keys(Object.assign({}, pn, pb)).filter(k => pn[k] !== pb[k]).join(',') + ']';
      const nM = rowsOf(nw.db, 'SELECT count(*) FROM elements_meta')[0][0];
      if (!nM) { inc(`G5 ${label}/${route}`, 'no elements kept: nothing judged'); continue; }
      const diffT = tn.filter(t => { try { const q = 'SELECT * FROM ' + t; const f = d => JSON.stringify((rowsOf(d, q) || []).map(r => r.map(v => (v && v.length > 64 ? '<blob>' : v)))); return f(nw.db) !== f(bs.db); } catch (e) { return true; } }), allSame = !diffT.length;
      chk(`G5 ${label}/${route} same tables except ifc_grid_axis; elements_meta and element_transforms rows equal`, sameT && cmp('elements_meta') && cmp('element_transforms') && nM > 0, `tables new-minus-grid=${tn.length} base=${tb.length} sameTables=${sameT} elements_meta=${nM} elements_meta_eq=${cmp('elements_meta')} transforms_eq=${cmp('element_transforms')} allRowsEq=${allSame}${allSame ? '' : ' differing=[' + diffT + ']'}${pmDiff}`);
    }
    fs.rmSync(bt.dir, { recursive: true, force: true });
  }
  const judged = pass + fail;
  say(`§VERDICT ${judged === 0 ? 'INCONCLUSIVE (nothing was judged)' : fail ? 'CLAIM NOT MET' : (inconclusive ? 'CLAIM MET on what was judged; ' + inconclusive + ' leg(s) INCONCLUSIVE' : 'CLAIM MET')} pass=${pass} fail=${fail} inconclusive=${inconclusive}`);
  process.exit(fail || !judged ? 1 : 0);
})().catch(e => { say('§FAIL ERROR ' + (e && e.stack || e)); say('§VERDICT CLAIM NOT MET (witness error)'); process.exit(1); });
