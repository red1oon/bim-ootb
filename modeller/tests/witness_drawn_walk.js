#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — W-DRAWN-WALK + W-FEDERATE, prompts/DISC_WALK_DRAWN_INTEGRATION.md §1, §1a, §2-§6. Read the log after every run; exit code is not evidence.
// ISSUES IT EXPOSES: (F) a federated open that keeps only the second file's columns, so STR slabs and beams never arrive and every drawn piece is plan-only;
// (D) drawn services that never enter the walk, a height read from an ARC finish slab, a drawn piece flagged provisional, borrowed terminals left beside drawn ones, a drawn run committed as a solid.
// A verdict line prints INCONCLUSIVE, never PASS, when nothing was judged. Node only, software only (no GL).
// Fixtures (all public): the Duplex ARC IFC in IFC/ (real), a small STR IFC written here (grid, slab, beam), a small mapped ARC+STR pair written here (far from the origin, for the one-frame claim),
// duct-sheet DXFs written here, and the public Clinic DB (D5, borrowed band terminals). IFC/ holds no public STR file and Duplex states no IfcGrid, so the grid is written into the STR fixture.
// Usage: NODE_PATH=~/bim-compiler/node_modules node modeller/tests/witness_drawn_walk.js > log 2>&1
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const M = path.join(__dirname, '..'), ROOT = path.join(M, '..');
const NM = path.join(process.env.HOME, 'bim-compiler', 'node_modules');
const initSqlJs = require(path.join(NM, 'sql.js')), WebIFC = require(path.join(NM, 'web-ifc/web-ifc-api-node.js')), Database = require(path.join(NM, 'better-sqlite3'));
const _init = WebIFC.IfcAPI.prototype.Init; WebIFC.IfcAPI.prototype.Init = function () { this.SetWasmPath(path.join(NM, 'web-ifc') + '/', true); return _init.call(this); };
const Core = require(path.join(M, 'dxf2bim', 'ifc_extract_core.js')), GridRead = require(path.join(ROOT, 'common', 'ifc_grid_read.js')), GeorefFrame = require(path.join(ROOT, 'common', 'georef_frame.js'));
const H = require('./walk_node_harness.js');
const log = console.log;
let pass = 0, fail = 0, inc = 0;
const ok = (id, cond, msg) => { log('§' + (cond ? 'PASS' : 'FAIL') + ' ' + id + ' | ' + (msg || '')); cond ? pass++ : fail++; return cond; };
const incon = (id, why) => { log('§INCONCLUSIVE ' + id + ' | ' + why); inc++; };
const near = (a, b, t) => Math.abs(a - b) <= t;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'wdrawn_'));
const TOOL = path.join(M, 'tools', 'extract_ifc2db.js'), MAINS = path.join(M, 'tools', 'mains_to_db.js');
const env = Object.assign({}, process.env, { NODE_PATH: NM });
const sh = (args, quiet) => { try { return cp.execFileSync('node', args, { env, maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] }).toString(); } catch (e) { return (e.stdout || '').toString() + (e.stderr || '').toString() + '\nEXIT-FAIL'; } };

// ── an IFC4 fixture writer: storey Level 1, boxes (faceted breps centred on their placement origin), an optional IfcGrid placed on the storey. Elements are given in WORLD metres. ──
const guid = n => '3' + String(n).padStart(21, '0');
function ifcDoc(o) {   // o: { storeyO:[x,y,z], boxes:[{cls,name,box:[x0,y0,z0,x1,y1,z1],pre,gid}], grid:{u:[[tag,[[x,y],[x,y]]]], v:[...]}|null, tag }
  const L = [], f = x => (Number.isInteger(x) ? x + '.' : String(x)), e = (n, s) => L.push('#' + n + '=' + s + ';'), so = o.storeyO;
  e(10, 'IFCCARTESIANPOINT((0.,0.,0.))'); e(11, 'IFCDIRECTION((0.,0.,1.))'); e(12, 'IFCDIRECTION((1.,0.,0.))'); e(13, 'IFCAXIS2PLACEMENT3D(#10,#11,#12)');
  e(14, 'IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)'); e(15, 'IFCUNITASSIGNMENT((#14))');
  e(20, "IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-5,#13,$)"); e(21, "IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,#20,$,.MODEL_VIEW.,$)");
  e(1, `IFCPROJECT('${guid(1)}',$,'Fixture',$,$,$,$,(#20),#15)`);
  e(30, `IFCSITE('${guid(30)}',$,'Site',$,$,#31,$,$,.ELEMENT.,$,$,$,$,$)`); e(31, 'IFCLOCALPLACEMENT($,#13)');
  e(32, `IFCBUILDING('${guid(32)}',$,'Building',$,$,#33,$,$,.ELEMENT.,$,$,$)`); e(33, 'IFCLOCALPLACEMENT(#31,#13)');
  e(34, `IFCBUILDINGSTOREY('${guid(34)}',$,'Level 1',$,$,#35,$,$,.ELEMENT.,${f(so[2])})`); e(35, 'IFCLOCALPLACEMENT(#33,#36)'); e(36, 'IFCAXIS2PLACEMENT3D(#37,$,$)'); e(37, `IFCCARTESIANPOINT((${so.map(f).join(',')}))`);
  e(40, `IFCRELAGGREGATES('${guid(40)}',$,$,$,#1,(#30))`); e(41, `IFCRELAGGREGATES('${guid(41)}',$,$,$,#30,(#32))`); e(42, `IFCRELAGGREGATES('${guid(42)}',$,$,$,#32,(#34))`);
  const contained = [];
  (o.boxes || []).forEach((b, k) => {
    const base = 1000 + k * 40, X = b.box, c = [(X[0] + X[3]) / 2, (X[1] + X[4]) / 2, (X[2] + X[5]) / 2], h = [(X[3] - X[0]) / 2, (X[4] - X[1]) / 2, (X[5] - X[2]) / 2], P = [];
    let n = 0; for (const z of [-h[2], h[2]]) for (const [x, y] of [[-h[0], -h[1]], [h[0], -h[1]], [h[0], h[1]], [-h[0], h[1]]]) { e(base + n, `IFCCARTESIANPOINT((${f(+x.toFixed(6))},${f(+y.toFixed(6))},${f(+z.toFixed(6))}))`); P.push(base + n); n++; }
    [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]].forEach((q, i) => { e(base + 8 + i, `IFCPOLYLOOP((${q.map(j => '#' + P[j]).join(',')}))`); e(base + 14 + i, `IFCFACEOUTERBOUND(#${base + 8 + i},.T.)`); e(base + 20 + i, `IFCFACE((#${base + 14 + i}))`); });
    e(base + 26, `IFCCLOSEDSHELL((${[0, 1, 2, 3, 4, 5].map(i => '#' + (base + 20 + i)).join(',')}))`); e(base + 27, `IFCFACETEDBREP(#${base + 26})`);
    e(base + 28, `IFCSHAPEREPRESENTATION(#21,'Body','Brep',(#${base + 27}))`); e(base + 29, `IFCPRODUCTDEFINITIONSHAPE($,$,(#${base + 28}))`);
    e(base + 33, `IFCCARTESIANPOINT((${[c[0] - so[0], c[1] - so[1], c[2] - so[2]].map(v => f(+v.toFixed(6))).join(',')}))`); e(base + 32, `IFCAXIS2PLACEMENT3D(#${base + 33},$,$)`); e(base + 31, `IFCLOCALPLACEMENT(#35,#${base + 32})`);
    const cls = b.cls.toUpperCase(), tail = cls === 'IFCSPACE' ? `,'${b.name}',.ELEMENT.,.INTERNAL.,$` : `,$,${b.pre}`;
    e(base + 30, `${cls}('${b.gid}',$,'${b.name}',$,$,#${base + 31},#${base + 29}${tail})`);
    contained.push(base + 30);
  });
  if (o.grid) {
    let n = 100; const axes = [], pt = p => { e(++n, `IFCCARTESIANPOINT((${f(p[0] - so[0])},${f(p[1] - so[1])}))`); return '#' + n; };
    const axis = (tag, pts) => { const ids = pts.map(pt); e(++n, `IFCPOLYLINE((${ids.join(',')}))`); const cur = n; e(++n, `IFCGRIDAXIS('${tag}',#${cur},.T.)`); axes.push(n); return n; };
    const ua = o.grid.u.map(([t, p]) => axis(t, p)), va = o.grid.v.map(([t, p]) => axis(t, p));
    e(50, `IFCGRID('${o.grid.gid}',$,'${o.grid.name}',$,$,#51,$,(${ua.map(i => '#' + i).join(',')}),(${va.map(i => '#' + i).join(',')}),$)`); e(51, 'IFCLOCALPLACEMENT(#35,#52)'); e(52, 'IFCAXIS2PLACEMENT3D(#53,#11,#12)'); e(53, 'IFCCARTESIANPOINT((0.,0.,0.))');
    contained.push(50);
  }
  e(90, `IFCRELCONTAINEDINSPATIALSTRUCTURE('${guid(90)}',$,$,$,(${contained.map(i => '#' + i).join(',')}),#34)`);
  L.sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));
  return "ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('ViewDefinition [ReferenceView]'),'2;1');\nFILE_NAME('" + (o.tag || 'fixture') + ".ifc','2026-11-08',(''),(''),'','','');\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n" + L.join('\n') + '\nENDSEC;\nEND-ISO-10303-21;\n';
}
// ── fixture A: the public Duplex ARC + a STR file in Duplex's frame ──
// Duplex Level 1 ceilings (measured from the extract): two large IfcCovering, top face z 2.66; the ARC Level 2 floor slab's lower face is 2.79 (an ARC finish slab, never structure).
// STR: a slab lower face 2.90 over both ceilings, a beam lower face 2.75 along x 4.5..4.8. The grid is written into this file (Duplex states none): lines x=0,4,8 (A B C), y=-16,-9,-3,2 (1 2 3 4).
const STR_SLAB = guid(701), STR_BEAM = guid(702);
const STR_A = ifcDoc({ storeyO: [0, 0, 0], tag: 'STR_A', boxes: [
  { cls: 'IfcSlab', name: 'STR slab', box: [-2, -20, 2.90, 11, 3, 3.20], pre: '.FLOOR.', gid: STR_SLAB },
  { cls: 'IfcBeam', name: 'STR beam', box: [4.5, -10, 2.75, 4.8, 0, 2.85], pre: '.BEAM.', gid: STR_BEAM },
  { cls: 'IfcSlab', name: 'STR roof slab', box: [-2, -20, 6.10, 20, 3, 6.40], pre: '.ROOF.', gid: guid(703) }],
  grid: { gid: guid(50), name: 'Grid STR', u: [['A', [[0, -20], [0, 4]]], ['B', [[4, -20], [4, 4]]], ['C', [[8, -20], [8, 4]]]], v: [['1', [[-2, -16], [10, -16]]], ['2', [[-2, -9], [10, -9]]], ['3', [[-2, -3], [10, -3]]], ['4', [[-2, 2], [10, 2]]]] } });
// ── fixture B: a mapped pair, 500 km from the origin (one frame, F3): ARC (slab, ceiling, room, grid) + STR (slab, beam) ──
const OFF = [500123.25, 2750456.75, 0];
const w3 = (x, y, z) => [OFF[0] + x, OFF[1] + y, z];
const bx = (a, b) => [OFF[0] + a[0], OFF[1] + a[1], a[2], OFF[0] + b[0], OFF[1] + b[1], b[2]];
const ARC_B = ifcDoc({ storeyO: [OFF[0], OFF[1], 0], tag: 'ARC_B', boxes: [
  { cls: 'IfcCovering', name: 'Ceiling', box: bx([0, 0, 2.6], [10, 8, 2.7]), pre: '.CEILING.', gid: guid(801) },
  { cls: 'IfcSlab', name: 'Floor', box: bx([0, 0, -0.2], [10, 8, 0]), pre: '.FLOOR.', gid: guid(802) },
  { cls: 'IfcSpace', name: 'Room', box: bx([0, 0, 0], [10, 8, 2.6]), pre: '', gid: guid(803) }],
  grid: { gid: guid(850), name: 'Grid ARC', u: [['A', [[0, -1], [0, 9]]], ['B', [[5, -1], [5, 9]]], ['C', [[10, -1], [10, 9]]]], v: [['1', [[-1, 0], [11, 0]]], ['2', [[-1, 4], [11, 4]]], ['3', [[-1, 8], [11, 8]]]] } });
const STR_B = ifcDoc({ storeyO: [OFF[0], OFF[1], 0], tag: 'STR_B', boxes: [
  { cls: 'IfcSlab', name: 'STR slab', box: bx([-1, -1, 3.4], [11, 9, 3.7]), pre: '.FLOOR.', gid: guid(811) },
  { cls: 'IfcBeam', name: 'STR beam', box: bx([4.8, 0, 3.0], [5.2, 8, 3.4]), pre: '.BEAM.', gid: guid(812) }],
  grid: { gid: guid(860), name: 'Grid STR', u: [['A', [[0, -1], [0, 9]]], ['B', [[5, -1], [5, 9]]]], v: [['1', [[-1, 0], [11, 0]]], ['2', [[-1, 4], [11, 4]]]] } });

// ── a duct-sheet DXF in raw ASCII (LINE, TEXT, INSERT), mm. building = sheet/1000 - off (translation only), so the fit has to recover the offset. ──
function sheetDxf(o) {   // o: { off:[ox,oy] metres (sheet = building + off), grid:{u:[[tag,x,y0,y1]],v:[[tag,y,x0,x1]]}, pieces:[[x0,y0,x1,y1]], terminals:[[x,y,name]] }  building metres
  const out = ['0', 'SECTION', '2', 'ENTITIES'], mm = (v, k) => String(Math.round((v + o.off[k]) * 1000));
  const line = (layer, a, b) => out.push('0', 'LINE', '8', layer, '10', mm(a[0], 0), '20', mm(a[1], 1), '30', '0', '11', mm(b[0], 0), '21', mm(b[1], 1), '31', '0');
  const text = (layer, s, p) => out.push('0', 'TEXT', '8', layer, '10', mm(p[0], 0), '20', mm(p[1], 1), '30', '0', '40', '200', '1', s);
  o.grid.u.forEach(([t, x, y0, y1]) => { line('S-GRID', [x, y0], [x, y1]); text('S-GRID-IDEN', t, [x, y0 - 0.3]); });
  o.grid.v.forEach(([t, y, x0, x1]) => { line('S-GRID', [x0, y], [x1, y]); text('S-GRID-IDEN', t, [x0 - 0.3, y]); });
  o.pieces.forEach(p => line('M-HVAC-DUCT-CNTR', [p[0], p[1]], [p[2], p[3]]));
  (o.terminals || []).forEach(t => out.push('0', 'INSERT', '8', 'M-HVAC-CDFF-OTLN', '2', t[2], '10', mm(t[0], 0), '20', mm(t[1], 1), '30', '0'));
  out.push('0', 'ENDSEC', '0', 'EOF'); return out.join('\n') + '\n';
}
const rowsOf = (db, sql, args) => { const st = db.prepare(sql); return args ? st.all(...args) : st.all(); };
const logsOf = f => { const lines = [], orig = console.log; console.log = s => { lines.push(String(s)); }; let r; try { r = f(); } finally { console.log = orig; } return { r, lines }; };

(async () => {
  const api = new WebIFC.IfcAPI(); await api.Init();
  const SQL = await initSqlJs();
  const arcPath = path.join(ROOT, 'IFC', 'Duplex_ARC.ifc');
  if (!fs.existsSync(arcPath)) { incon('ALL', 'IFC/Duplex_ARC.ifc absent: nothing judged'); log('§VERDICT INCONCLUSIVE'); process.exit(0); }
  const files = { strA: path.join(TMP, 'STR_A.ifc'), arcB: path.join(TMP, 'ARC_B.ifc'), strB: path.join(TMP, 'STR_B.ifc') };
  fs.writeFileSync(files.strA, STR_A); fs.writeFileSync(files.arcB, ARC_B); fs.writeFileSync(files.strB, STR_B);
  log('§W_DW FIXTURES public only: Duplex_ARC.ifc (real), STR_A / ARC_B / STR_B written by the witness (IFC/ holds no STR file; Duplex states no IfcGrid, so the grid is written into STR_A) tmp=' + TMP);

  // the single opens, the way the Modeller's open runs the core (reader handed in)
  async function singleOpen(file, disc, force) {
    const db = new Database(':memory:'), ex = await Core.extractToDb({ WebIFC, ifcApi: api, ifcData: new Uint8Array(fs.readFileSync(file)), db, Buf: Buffer, GridRead, GeorefFrame, discOverride: disc, forceGeorefOffset: force,
      buildingName: path.basename(file, '.ifc'), sourceName: path.basename(file), log: () => {}, progress: () => {} });
    return { db, ex };
  }
  const byDisc = db => { const o = {}; rowsOf(db, 'SELECT discipline d, count(*) n FROM elements_meta GROUP BY 1').forEach(r => { o[r.d] = r.n; }); return o; };
  const cnt = (db, t) => { try { return rowsOf(db, 'SELECT count(*) n FROM ' + t)[0].n; } catch (e) { return 0; } };
  const sum = (a, b) => { const o = Object.assign({}, a); Object.keys(b).forEach(k => { o[k] = (o[k] || 0) + b[k]; }); return o; };

  // ── F: federation ──
  const fedA = path.join(TMP, 'fed_A.db'), alsoA = path.join(TMP, 'also_A.db'), fedA0 = path.join(TMP, 'fed_A_nodisc.db'), fedB = path.join(TMP, 'fed_B.db'), arcOnlyB = path.join(TMP, 'single_B.db');
  const outFed = sh([TOOL, '--ifc', arcPath, '--federate', files.strA, '--federate-disc', 'STR', '-o', fedA]);
  const outAlso = sh([TOOL, '--ifc', arcPath, '--also', files.strA, '-o', alsoA]);
  const outNoDisc = sh([TOOL, '--ifc', arcPath, '--federate', files.strA, '-o', fedA0]);
  const outFedB = sh([TOOL, '--ifc', files.arcB, '--federate', files.strB, '--federate-disc', 'STR', '-o', fedB]);
  [['federate', outFed], ['also(main behaviour)', outAlso], ['federate-no-disc', outNoDisc], ['federate mapped', outFedB]].forEach(([k, o]) => log('  tool ' + k + ': ' + (o.split('\n').filter(l => /§FEDERATE|§MERGE|§FATAL|EXIT-FAIL|§DB_WRITTEN/.test(l)).join(' || ') || '(no tool line)')));
  if (!fs.existsSync(fedA) || !fs.existsSync(fedB)) { incon('F*', 'the federated DBs were not written: see the tool lines above'); log('§VERDICT INCONCLUSIVE pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc); process.exit(1); }
  const dA = new Database(fedA, { readonly: true }), dAlso = new Database(alsoA, { readonly: true }), dA0 = new Database(fedA0, { readonly: true }), dB = new Database(fedB, { readonly: true });
  const arcS = await singleOpen(arcPath), strS = await singleOpen(files.strA, 'STR', arcS.ex.georefOffset);
  const arcSB = await singleOpen(files.arcB), strSB = await singleOpen(files.strB, 'STR', arcSB.ex.georefOffset);
  const expDisc = sum(byDisc(arcS.db), byDisc(strS.db)), gotDisc = byDisc(dA);
  ok('F1 federated element count per discipline equals the two single opens added (Duplex ARC + STR_A)', JSON.stringify(expDisc) === JSON.stringify(gotDisc) && Object.keys(expDisc).length >= 2, 'single ARC+STR=' + JSON.stringify(expDisc) + ' federated=' + JSON.stringify(gotDisc));
  const expB = sum(byDisc(arcSB.db), byDisc(strSB.db)), gotB = byDisc(dB);
  ok('F1b same on the mapped pair', JSON.stringify(expB) === JSON.stringify(gotB), 'single=' + JSON.stringify(expB) + ' federated=' + JSON.stringify(gotB));
  const strRows = db => rowsOf(db, "SELECT m.guid g, m.ifc_class c, m.discipline d, i.geometry_hash h, (SELECT count(*) FROM component_geometries c WHERE c.geometry_hash=i.geometry_hash) body FROM elements_meta m LEFT JOIN element_instances i ON i.guid=m.guid WHERE m.guid IN ('" + STR_SLAB + "','" + STR_BEAM + "')");
  const sr = strRows(dA);
  ok('F2 STR IfcSlab and IfcBeam are present with bodies and discipline STR', sr.length === 2 && sr.every(r => r.d === 'STR' && r.h && r.body > 0) && sr.some(r => r.c === 'IfcSlab') && sr.some(r => r.c === 'IfcBeam'), JSON.stringify(sr.map(r => [r.c, r.d, r.body])));
  const offOf = db => rowsOf(db, "SELECT key, value FROM project_metadata WHERE key LIKE 'georef_offset_%' ORDER BY key").map(r => r.key + '=' + r.value).join(',');
  const oB = offOf(dB), oSB = offOf(arcSB.db);
  if (!oSB) incon('F3', 'the mapped ARC single open has no offset rows: nothing judged');
  else {
    ok('F3 the federated offset equals the ARC single open\'s (mapped pair, 500 km out)', oB === oSB, 'single=' + oSB + ' federated=' + oB);
    const ctr = db => rowsOf(db, "SELECT t.center_x x, t.center_y y FROM element_transforms t WHERE t.guid=?", [guid(811)])[0];
    const c = ctr(dB), want = [OFF[0] + 5 - arcSB.ex.georefOffset[0], OFF[1] + 4 - arcSB.ex.georefOffset[1]];
    ok('F3b the STR slab sits in the ARC frame (centre = world centre minus the ARC offset, < 1 mm)', c && near(c.x, want[0], 0.001) && near(c.y, want[1], 0.001), 'federated=(' + (c && c.x.toFixed(4)) + ',' + (c && c.y.toFixed(4)) + ') expected=(' + want.map(v => v.toFixed(4)) + ')');
  }
  const eqCnt = (db, single, t) => cnt(db, t) === single.reduce((a, d) => a + cnt(d, t), 0) && cnt(db, t) > 0;
  ok('F4 ifc_grid_axis rows equal the single opens\' (Duplex has none, STR_A has 7)', eqCnt(dA, [arcS.db, strS.db], 'ifc_grid_axis'), 'single=' + cnt(arcS.db, 'ifc_grid_axis') + '+' + cnt(strS.db, 'ifc_grid_axis') + ' federated=' + cnt(dA, 'ifc_grid_axis'));
  ok('F4b ifc_grid_axis on the mapped pair keeps both grids\' guids', eqCnt(dB, [arcSB.db, strSB.db], 'ifc_grid_axis') && rowsOf(dB, 'SELECT count(DISTINCT grid_guid) n FROM ifc_grid_axis')[0].n === 2, 'rows=' + cnt(dB, 'ifc_grid_axis') + ' grids=' + rowsOf(dB, 'SELECT count(DISTINCT grid_guid) n FROM ifc_grid_axis')[0].n);
  ok('F4c ifc_spaces rows equal the single opens\' (Duplex 21, mapped 1)', eqCnt(dA, [arcS.db, strS.db], 'ifc_spaces') && eqCnt(dB, [arcSB.db, strSB.db], 'ifc_spaces'), 'duplex ' + cnt(dA, 'ifc_spaces') + ' mapped ' + cnt(dB, 'ifc_spaces'));
  const slabsAlso = rowsOf(dAlso, "SELECT count(*) n FROM elements_meta WHERE guid IN ('" + STR_SLAB + "','" + STR_BEAM + "')")[0].n;
  ok('F5 RED: main\'s behaviour (--also, columns only) holds 0 of the STR slab and beam, so F2 would FAIL there', slabsAlso === 0, 'STR_A slab+beam present via --also=' + slabsAlso + ' (via --federate=' + sr.length + ')');
  const s0 = strRows(dA0);
  ok('F6 without --federate-disc the STR file keeps the class map: the slab reads ARC, the beam STR', s0.length === 2 && s0.find(r => r.c === 'IfcSlab').d === 'ARC' && s0.find(r => r.c === 'IfcBeam').d === 'STR', JSON.stringify(s0.map(r => [r.c, r.d])));
  ok('F7 the --also path is untouched: no ifc_grid_axis table (reader not handed in), as before', !rowsOf(dAlso, "SELECT name FROM sqlite_master WHERE name='ifc_grid_axis'").length, 'tables=' + rowsOf(dAlso, "SELECT name FROM sqlite_master WHERE name LIKE 'ifc_%'").map(r => r.name));
  [dAlso, dA0, dB].forEach(d => d.close());

  // ── D: the drawn walk, on the Duplex ARC + STR_A federation ──
  // Pieces in building metres. P1 under ceiling 1 and the STR slab; P5 joins P1 and P3 end to end; P3 under the beam; P2 under ceiling 2; P4 far outside every ceiling.
  const PCS = { P1: [0, -3, 4, -3], P5: [4, -3, 4.65, -3], P3: [4.65, -5, 4.65, -3], P2: [1, -14, 5, -14], P4: [20, 0, 24, 0] };
  const TERMS = [[1.5, -2, 'DIFFUSER_SUPPLY'], [6, -14, 'DIFFUSER_RETURN'], [2.5, -5, 'DIFFUSER']];
  const GRIDSHEET = { u: [['A', 0, -20, 4], ['B', 4, -20, 4], ['C', 8, -20, 4]], v: [['1', -16, -2, 10], ['2', -9, -2, 10], ['3', -3, -2, 10], ['4', 2, -2, 10]] };
  const dxfA = path.join(TMP, 'M-101.dxf'); fs.writeFileSync(dxfA, sheetDxf({ off: [100, 200], grid: GRIDSHEET, pieces: Object.values(PCS), terminals: TERMS }));
  const dbDrawn = path.join(TMP, 'drawn_A.db'); fs.copyFileSync(fedA, dbDrawn);
  const meta = JSON.stringify({ number: 'M-101', revision: 'A', storeys: ['Level 1'] });
  const m1 = sh([MAINS, dbDrawn, dxfA, '--sheet-meta=' + meta]);
  log(m1.split('\n').filter(l => /§MAINS-(TO-DB|READ|FIT|TERMINALS|REFUSE)/.test(l)).map(l => '  tool ' + l.slice(0, 260)).join('\n'));
  const dd = new SQL.Database(new Uint8Array(fs.readFileSync(dbDrawn)));
  const q = (db, sql) => { const r = db.exec(sql); return r.length ? r[0].values : []; };
  const routeN = q(dd, 'SELECT count(*), sum(sqrt((x1-x0)*(x1-x0)+(y1-y0)*(y1-y0))) FROM drawn_route')[0];
  const sheetRow = q(dd, 'SELECT pieces, length_m, fit_median_mm, refused FROM drawn_route_sheet')[0];
  log('§W_DW tool result: drawn_route rows=' + routeN[0] + ' length=' + (routeN[1] || 0).toFixed(4) + ' sheet row=' + JSON.stringify(sheetRow) + ' terminals stored=' + q(dd, 'SELECT count(*) FROM drawn_terminal')[0][0]);
  if (!routeN[0] || (sheetRow && sheetRow[3])) { incon('D*', 'the sheet was not read (' + JSON.stringify(sheetRow) + '): nothing walked'); log('§VERDICT INCONCLUSIVE pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc); process.exit(1); }
  const stack = await H.loadStack(SQL); H.openBuildingRules(SQL, stack, 'Duplex');
  const walk = (file, extra) => { const buf = new Uint8Array(fs.readFileSync(file)); return logsOf(() => H.walkLive(SQL, stack, 'ACMV', buf, 'Duplex', [], extra)); };
  const W = walk(dbDrawn), w = W.r, has = (lines, rx) => lines.filter(l => rx.test(l));
  const wl = has(W.lines, /§WALK-MAINS disc=ACMV drawn=/)[0] || '';
  log('  walk: ' + W.lines.filter(l => /§WALK-(MAINS|TERMINALS|DRAWN)/.test(l)).join('\n        '));

  // D1
  const drawn = w.drawn;
  ok('D1 the ACMV runs equal the drawn_route pieces (count and length), none from the band', !!drawn && drawn.pieces.length === routeN[0] && near(drawn.length, routeN[1], 1e-6) && w.mains.pieces === routeN[0] && w.mains.placed === drawn.known.length && w.placed === (w.placements || []).filter(p => !p.provisional).length + drawn.known.length &&
    !(w.placements || []).some(p => _isMainPiece(p)) && new RegExp('drawn=' + routeN[0] + '/' + routeN[1].toFixed(3) + ' placed=4 planOnly=1').test(wl), 'walk pieces=' + (drawn && drawn.pieces.length) + ' length=' + (drawn && drawn.length.toFixed(4)) + ' record rows=' + routeN[0] + ' length=' + routeN[1].toFixed(4) + ' line=' + wl.trim());
  function _isMainPiece(p) { return ['IfcPipeSegment', 'IfcPipeFitting', 'IfcDuctSegment', 'IfcDuctFitting', 'IfcFlowSegment', 'IfcFlowFitting'].indexOf(p.ifc_class) >= 0 && /^placed:/.test(p.prov || ''); }
  const pristine = walk(fedA);
  ok('D1 RED: the same building with no drawn_route walks as §9 did: no drawn pieces, "none reason=no sheet held"', !pristine.r.drawn && has(pristine.lines, /§WALK-MAINS disc=ACMV .*none reason=no sheet held/).length === 1 && (pristine.r.mains || {}).none === 'no sheet held', 'mains=' + JSON.stringify(pristine.r.mains));
  // D2 and the labels
  const byPc = {}; (drawn.pieces || []).forEach(p => { byPc[p.pc] = p; });
  const order = Object.keys(PCS);   // piece numbers follow the DXF order: P1=1, P5=2, P3=3, P2=4, P4=5
  const P = n => byPc[order.indexOf(n) + 1];
  // The oracle reads the DB's own world boxes (element_world_bbox), not the walker's mesh box: ceiling top = maxZ of the walk's own host; structure = the lowest STR slab/beam/roof lower face above it whose footprint holds the midpoint.
  const wb = g => q(dd, "SELECT minX, maxX, minY, maxY, minZ, maxZ FROM element_world_bbox WHERE guid='" + g + "'")[0];
  const strAll = q(dd, "SELECT m.guid, m.ifc_class FROM elements_meta m WHERE m.discipline='STR' AND m.ifc_class IN ('IfcSlab','IfcBeam','IfcRoof')").map(r => ({ g: r[0], c: r[1], b: wb(r[0]) }));
  const oracle = p => { const cb = wb(p.ceiling), top = cb[5]; let best = null; strAll.forEach(h => { if (p.mx < h.b[0] || p.mx > h.b[1] || p.my < h.b[2] || p.my > h.b[3] || h.b[4] < top - 0.001) return; if (!best || h.b[4] < best.b[4]) best = h; }); return best ? { z: (top + best.b[4]) / 2, g: best.g, c: best.c, lower: best.b[4], top } : null; };
  const cOK = (n, st, cls) => { const p = P(n), o = p && p.ceiling && oracle(p); return !!(p && o && p.z != null && near(p.z, o.z, 0.005) && p.heightBasis === 'void-middle' && p.structure === o.g && p.structureClass === o.c && (!st || (p.structure === st && cls === p.structureClass))); };
  const dz = n => { const p = P(n), o = p && p.ceiling && oracle(p); return n + ' z=' + (p && p.z != null ? p.z.toFixed(4) : 'none') + ' oracle=' + (o ? o.z.toFixed(4) + ' (ceiling top ' + o.top.toFixed(3) + ', ' + o.c + ' lower ' + o.lower.toFixed(3) + ')' : 'none'); };
  ok('D2 a piece under a ceiling with STR structure above takes the void middle, labelled with its ceiling and structure (P1, P2: the STR slab; P3: the lower STR beam; P5: the lowest STR element the file holds there)',
    cOK('P1', STR_SLAB, 'IfcSlab') && cOK('P2', STR_SLAB, 'IfcSlab') && cOK('P3', STR_BEAM, 'IfcBeam') && cOK('P5'), ['P1', 'P2', 'P3', 'P5'].map(dz).join(' | '));
  const z1 = P('P1').z, z3 = P('P3').z, zc = oracle(P('P1')).top;
  ok('D2b a piece under no ceiling is plan only: no z, counted, listed with its reason (P4)', P('P4').z == null && P('P4').heightBasis === 'none' && drawn.planOnly.length === 1 && w.mains.planOnly === 1 && has(W.lines, /§WALK-MAINS-PLANONLY n=1 /).length === 1, 'P4 why=' + P('P4').why);
  ok('D2c a component whose pieces sit at different heights is counted, not bridged (P1+P5+P3)', drawn.stepped === 1 && has(W.lines, /steppedComponents=1/).length === 1, 'stepped=' + drawn.stepped);
  const arcOnly = path.join(TMP, 'drawn_A_arconly.db'); { const d = new SQL.Database(new Uint8Array(fs.readFileSync(dbDrawn))); d.run("DELETE FROM elements_meta WHERE discipline='STR' AND ifc_class IN ('IfcSlab','IfcBeam')"); fs.writeFileSync(arcOnly, Buffer.from(d.export())); d.close(); }
  const Wn = walk(arcOnly), wn = Wn.r;
  ok('D2 RED: with no STR the pieces are plan only (placed=0, planOnly=5) and none gets a z', wn.drawn && wn.drawn.known.length === 0 && wn.drawn.planOnly.length === 5 && wn.drawn.pieces.every(p => p.z == null) && has(Wn.lines, /placed=0 planOnly=5/).length === 1, 'known=' + (wn.drawn && wn.drawn.known.length) + ' why(P1)=' + (wn.drawn && wn.drawn.pieces[0].why));
  // D3
  const arcSlabLower = q(dd, "SELECT min(t.center_z - t.bbox_z/2) FROM elements_meta m JOIN element_transforms t USING(guid) WHERE m.ifc_class='IfcSlab' AND m.discipline='ARC' AND m.storey='Level 2'")[0][0];
  const Wr = walk(arcOnly, { drawnStructAnyDisc: true }), wr = Wr.r, pr1 = wr.drawn.pieces[0];
  const discOf = g => q(dd, "SELECT discipline FROM elements_meta WHERE guid='" + g + "'")[0][0];
  ok('D3 an ARC finish slab above is never taken as structure (the STR-less building has one at Level 2, lower face ' + arcSlabLower.toFixed(3) + ' m): no height from it, and every structure cited in the federated walk is STR', wn.drawn.known.length === 0 && drawn.known.length > 0 && drawn.known.every(p => discOf(p.structure) === 'STR'), 'ARC-only known=0; federated structures cited: ' + JSON.stringify([...new Set(drawn.known.map(p => discOf(p.structure) + ':' + p.structureClass))]));
  ok('D3 RED: the witness-only switch that takes any discipline finds a z from the ARC slab, so D3 can see it', pr1.z != null && near(pr1.z, (zc + arcSlabLower) / 2, 0.003) && !near(pr1.z, z1, 0.01), 'P1 z with the switch=' + (pr1.z && pr1.z.toFixed(4)) + ' (ARC slab lower ' + arcSlabLower.toFixed(3) + ' gives ' + ((zc + arcSlabLower) / 2).toFixed(4) + '; STR gives ' + z1.toFixed(4) + ')');
  // D4
  const DW = require(path.join(M, 'disc_walker.js')), ops = DW.drawnOps(drawn);
  const prov = ops.filter(o => o.params._dw.provisional === true).length;
  ok('D4 drawn pieces carry no Provisional=TRUE, and per-attribute strength: position drawn, height provisional with HeightBasis void-middle', ops.length === drawn.known.length && prov === 0 && ops.every(o => o.params._dw.positionBasis === 'drawn' && o.params._dw.heightBasis === 'void-middle' && o.params._dw.strength.height === 'provisional' && o.params._dw.strength.position === 'drawn'), 'ops=' + ops.length + ' provisional=' + prov + ' widthBasis=' + JSON.stringify([...new Set(ops.map(o => o.params._dw.widthBasis))]));
  const PT = require(path.join(ROOT, 'viewer', 'provisional_totals.js'));
  // the rows the export writes for these ops (Provisional from _dw.provisional, HeightBasis from _dw.heightBasis), then the Viewer's own count predicate over them; a second DB adds one borrowed row flagged TRUE
  const mkV = withBorrowed => { const v = new SQL.Database(); v.run('CREATE TABLE elements_meta(guid TEXT, ifc_class TEXT); CREATE TABLE element_pset_common (guid TEXT, pset TEXT, name TEXT, value TEXT, source TEXT)');
    ops.forEach((o, i) => { v.run('INSERT INTO elements_meta VALUES(?,?)', ['d' + i, 'IfcDuctSegment']); v.run("INSERT INTO element_pset_common VALUES(?,?,?,?,'walk')", ['d' + i, 'BIMOOTB_Walk', 'Provisional', o.params._dw.provisional ? 'TRUE' : 'FALSE']); v.run("INSERT INTO element_pset_common VALUES(?,?,?,?,'walk')", ['d' + i, 'BIMOOTB_Walk', 'HeightBasis', o.params._dw.heightBasis]); });
    if (withBorrowed) { v.run("INSERT INTO elements_meta VALUES('b1','IfcAirTerminal')"); v.run("INSERT INTO element_pset_common VALUES('b1','BIMOOTB_Walk','Provisional','TRUE','walk')"); } return v; };
  const cntV = v => q(v, 'SELECT ' + PT.count(v, 'guid', 'w') + ' FROM elements_meta')[0][0];
  const t0 = cntV(mkV(false)), t1 = cntV(mkV(true));
  ok('D4b the Viewer totals (ProvTotals) count the drawn pieces: ' + ops.length + ' drawn count ' + t0 + '; a borrowed row flagged TRUE is left out (still ' + t1 + ' of ' + (ops.length + 1) + ')', t0 === ops.length && t1 === ops.length && ops.length > 0, 'drawn=' + t0 + ' with one provisional borrowed row added=' + t1);
  const ifcSrc = fs.readFileSync(path.join(M, 'bonsai_ifc.js'), 'utf8'), coreSrc = fs.readFileSync(path.join(M, 'dxf2bim', 'ifc_extract_core.js'), 'utf8');
  ok('D4c the IFC walk set writes HeightBasis (export) and the extract reads it back (core)', /label\('HeightBasis'\)/.test(ifcSrc) && /'HeightBasis'\]\)/.test(coreSrc), 'bonsai_ifc.js writes it, ifc_extract_core.js walkWant reads it (source check: the export is a page path; no page run here)');
  // D5 is below (Clinic). D6:
  const allLogs = W.lines.join('\n');
  ok('D6 "no sheet held" and "no routing rule pairs them" do not fire once drawn_route exists', !/no sheet held|no routing rule/.test(allLogs) && /§WALK-MAINS disc=ACMV drawn=/.test(allLogs), 'matches of the §9 wording in the drawn walk: ' + (allLogs.match(/no sheet held|no routing rule/g) || []).length);
  // D7
  const noSolid = ops.every(o => o.op_type === 'GEOM_INSERT' && o.params.anchorOnly === true && o.params.line && !o.params.realGeomHash && !o.params.hash && !o.params.profile && !o.params.path);
  const html = fs.readFileSync(path.join(M, 'modeller.html'), 'utf8'), body = (html.match(/function _renderDrawnMains[\s\S]*?\n}\n/) || [''])[0];
  ok('D7 the look: committed runs are line ops (invisible anchor inserts carrying a line), plan-only pieces are not committed, and the page draws LineSegments only', noSolid && ops.length === drawn.known.length && ops.length < drawn.pieces.length && /LineSegments/.test(body) && !/new THREE\.Mesh|InstancedMesh|CylinderGeometry|BoxGeometry/.test(body) && body.length > 0,
    'ops=' + ops.length + ' of ' + drawn.pieces.length + ' pieces; renderer source: ' + (body.length ? 'LineSegments only' : 'NOT FOUND'));
  // terminals on the Duplex case (D5a): the walk's own schedule terminals are borrowed (projected from room schedules), so on the covered storey they are dropped and counted apart; the other storeys keep theirs
  const tD = drawn.terminals.byStorey['Level 1'], baseP = pristine.r.placements || [], schedOn = sk => baseP.filter(p => /^sched:/.test(p.prov || '') && p.storey === sk).length;
  const keptSched = (w.placements || []).filter(p => /^sched:/.test(p.prov || '')).length;
  ok('D5a (Duplex) §7.5: 3 drawn terminals on the covered storey, the schedule terminals there dropped and counted apart, those on other storeys kept', tD && tD.drawn === 3 && tD.borrowedDropped === 0 && tD.schedDropped === schedOn('Level 1') && tD.schedDropped > 0 && keptSched === baseP.filter(p => /^sched:/.test(p.prov || '')).length - schedOn('Level 1') && tD.placed + tD.noMesh === 3 && tD.noKind === 1,
    JSON.stringify(tD) + ' | independent: base walk schedule terminals on Level 1=' + schedOn('Level 1') + ', kept=' + keptSched + ' of ' + baseP.filter(p => /^sched:/.test(p.prov || '')).length + ' | ' + (has(W.lines, /§WALK-TERMINALS storey=Level 1/)[0] || '').trim());
  // D8 (§7.3): a sheet naming a SET of storeys. Pieces: Q1 under a Level 1 ceiling only, Q2 under a Level 2 ceiling only, P1 under both (ambiguous), Q3 under none.
  // Duplex's Level 2 ceilings all lie inside its Level 1 footprint (measured), so no point is under Level 2 alone. The fixture DB gets ONE extra Level 2 ceiling: a copy of an existing one moved 10 m in x (a stated edit of the fixture, rows copied in
  // elements_meta, element_transforms, element_world_bbox, element_instances). Q2 sits under it only.
  const Q = { Q1: [4.2, -3, 4.6, -3], Q2: [16, -4, 17, -4], P1: [0.6, -3, 4, -3], Q3: [30, 0, 34, 0] };
  const dxfB = path.join(TMP, 'M-102.dxf'); fs.writeFileSync(dxfB, sheetDxf({ off: [100, 200], grid: GRIDSHEET, pieces: Object.values(Q) }));
  const dbSet = path.join(TMP, 'drawn_set.db');
  { const d = new SQL.Database(new Uint8Array(fs.readFileSync(fedA))), src = q(d, "SELECT m.guid FROM elements_meta m JOIN element_world_bbox b USING(guid) WHERE m.ifc_class='IfcCovering' AND m.storey='Level 2' AND b.minX>4.6 AND b.maxX<8.4 AND b.minY>-6.7 AND b.maxY<-0.4")[0][0], ng = 'CLONE_L2_CEILING';
    const clone = (t, mut) => { const r = d.exec("SELECT * FROM " + t + " WHERE guid='" + src + "'")[0], cols = r.columns, v = r.values[0].slice(); v[cols.indexOf('guid')] = ng; Object.keys(mut).forEach(c => { v[cols.indexOf(c)] += mut[c]; }); d.run('INSERT INTO ' + t + ' VALUES(' + cols.map(() => '?').join(',') + ')', v); };
    clone('elements_meta', {}); clone('element_transforms', { center_x: 10 }); clone('element_world_bbox', { minX: 10, maxX: 10 }); clone('element_instances', {}); fs.writeFileSync(dbSet, Buffer.from(d.export())); d.close(); }
  const mSet = sh([MAINS, dbSet, dxfB, '--sheet-meta=' + JSON.stringify({ number: 'M-102', revision: 'A', storeys: ['Level 1', 'Level 2'] })]);
  log(mSet.split('\n').filter(l => /§MAINS-(STOREYS|TO-DB)/.test(l)).map(l => '  tool ' + l.slice(0, 200)).join('\n'));
  const Ws = walk(dbSet), ws = Ws.r, pq = n => ws.drawn.pieces[Object.keys(Q).indexOf(n)];
  const ddSet = new SQL.Database(new Uint8Array(fs.readFileSync(dbSet))), covers = (sk, p) => q(ddSet, "SELECT m.guid FROM elements_meta m JOIN element_world_bbox b USING(guid) WHERE m.ifc_class='IfcCovering' AND m.storey='" + sk + "' AND (b.maxZ-b.minZ)<0.15 AND " + p.mx + " BETWEEN b.minX AND b.maxX AND " + p.my + " BETWEEN b.minY AND b.maxY").map(r => r[0]);
  const exp = n => { const p = pq(n), l1 = covers('Level 1', p), l2 = covers('Level 2', p); return { l1: l1.length, l2: l2.length }; };
  const e1 = exp('Q1'), e2 = exp('Q2'), eP = exp('P1'), e3 = exp('Q3');
  ok('D8 a 2-storey set places pieces on BOTH storeys by the ceiling that holds them (independent: world boxes of the coverings): Q1 on Level 1, Q2 on Level 2', e1.l1 > 0 && e1.l2 === 0 && e2.l2 > 0 && e2.l1 === 0 && pq('Q1').storey === 'Level 1' && pq('Q2').storey === 'Level 2' && pq('Q1').z != null && pq('Q2').z != null && pq('Q2').z > pq('Q1').z + 2,
    'Q1 storey=' + pq('Q1').storey + ' z=' + (pq('Q1').z && pq('Q1').z.toFixed(3)) + ' (coverings L1/L2 ' + e1.l1 + '/' + e1.l2 + ') Q2 storey=' + pq('Q2').storey + ' z=' + (pq('Q2').z && pq('Q2').z.toFixed(3)) + ' (' + e2.l1 + '/' + e2.l2 + ') | ' + (has(Ws.lines, /§WALK-MAINS disc=ACMV/)[0] || '').trim());
  ok('D8b a piece held by the ceilings of both storeys is ambiguous: plan only, counted, never picked (P1); a piece under none is plan only (Q3)', eP.l1 > 0 && eP.l2 > 0 && pq('P1').z == null && /ceilings of 2 storeys/.test(pq('P1').why) && e3.l1 === 0 && e3.l2 === 0 && pq('Q3').z == null && has(Ws.lines, /ambiguous=1 /).length === 1 && ws.drawn.known.length === 2, 'P1 why=' + pq('P1').why + ' | ' + (has(Ws.lines, /§WALK-MAINS-HEIGHT/)[0] || '').slice(0, 230));
  // D9 (§7.3): the set from the view title through the alias row, and a title that matches nothing
  const dbT1 = path.join(TMP, 'drawn_title1.db'), dbT2 = path.join(TMP, 'drawn_title2.db'); fs.copyFileSync(fedA, dbT1); fs.copyFileSync(fedA, dbT2);
  const mT1 = sh([MAINS, dbT1, dxfB, '--sheet-meta=' + JSON.stringify({ number: 'M-103', revision: 'A', title: 'FIRST FLOOR CEILING PLAN' })]);
  const mT2 = sh([MAINS, dbT2, dxfB, '--sheet-meta=' + JSON.stringify({ number: 'M-104', revision: 'A', title: 'BASEMENT SERVICES PLAN' })]);
  const stl1 = (mT1.match(/§MAINS-STOREYS[^\n]*/) || [''])[0], stl2 = (mT2.match(/§MAINS-STOREYS[^\n]*/) || [''])[0];
  log('  tool ' + stl1 + '\n  tool ' + stl2);
  const Wt1 = walk(dbT1), Wt2 = walk(dbT2);
  ok('D9 a title word matched by the alias row gives the set ("first floor" = the first storey above ground = Level 2 here), and its pieces are placed on it', /source=title storeys=\["Level 2"\]/.test(stl1) && Wt1.r.drawn.known.some(p => p.storey === 'Level 2') && Wt1.r.drawn.known.every(p => p.storey === 'Level 2'), stl1.slice(0, 200) + ' | placed storeys=' + JSON.stringify([...new Set(Wt1.r.drawn.known.map(p => p.storey))]));
  ok('D9b a title word that matches no storey and has no argument gives plan only, logged (tool and walker)', /source=title none: no storey word/.test(stl2) && Wt2.r.drawn.known.length === 0 && Wt2.r.drawn.planOnly.length === 4 && has(Wt2.lines, /noStoreySet=4/).length === 1 && has(Wt2.lines, /placed=0 planOnly=4/).length === 1, stl2.slice(0, 200) + ' | ' + (has(Wt2.lines, /§WALK-MAINS disc=ACMV/)[0] || '').trim());
  ok('D4d §7.4 the log states the sloped rule: sloped=<n> with the 0.3 m threshold', has(W.lines, /sloped=0 slopedCeilings=0 \(sloped = ceiling bbox_z > 0.3 m;/).length === 1, (has(W.lines, /§WALK-MAINS-HEIGHT/)[0] || '').slice(0, 300));

  // ── D5 on the public Clinic DB: borrowed band terminals exist (provisional), one storey is covered by a drawn sheet ──
  const clinicPath = path.join(process.env.HOME, 'bim-ootb', 'buildings', 'Clinic_extracted.db');
  if (!fs.existsSync(clinicPath)) incon('D5', 'Clinic_extracted.db absent: nothing judged');
  else {
    const cdb = new SQL.Database(new Uint8Array(fs.readFileSync(clinicPath)));
    const cov = q(cdb, "SELECT t.center_x, t.center_y, t.center_z, t.bbox_x, t.bbox_y, t.bbox_z FROM elements_meta m JOIN element_transforms t USING(guid) WHERE m.ifc_class='IfcCovering' AND m.storey='First Floor' AND t.bbox_z<0.15 AND t.bbox_x>1.2 AND t.bbox_y>1.2 ORDER BY t.center_x, t.center_y");
    const picks = cov.filter((c, i) => i % Math.max(1, Math.floor(cov.length / 6)) === 0).slice(0, 4);
    if (picks.length < 3) incon('D5', 'fewer than 3 flat First Floor coverings in Clinic: nothing judged');
    else {
      const xs = cov.map(c => c[0]), ys = cov.map(c => c[1]), x0 = Math.min(...xs) - 3, x1 = Math.max(...xs) + 3, y0 = Math.min(...ys) - 3, y1 = Math.max(...ys) + 3;
      const gu = [['A', x0], ['B', (x0 * 2 + x1) / 3], ['C', (x0 + x1 * 2) / 3], ['D', x1]], gv = [['1', y0], ['2', (y0 * 2 + y1) / 3], ['3', (y0 + y1 * 2) / 3], ['4', y1]];
      cdb.run('CREATE TABLE ifc_grid_axis(grid_guid TEXT, grid_name TEXT, storey TEXT, axis_guid TEXT, tag TEXT, x0 REAL, y0 REAL, x1 REAL, y1 REAL, axis_set TEXT)');
      gu.forEach(([t, x], i) => cdb.run('INSERT INTO ifc_grid_axis VALUES(?,?,?,?,?,?,?,?,?,?)', ['G-FIX', 'Fixture grid', 'First Floor', 'g:U' + i, t, x, y0, x, y1, 'U']));
      gv.forEach(([t, y], i) => cdb.run('INSERT INTO ifc_grid_axis VALUES(?,?,?,?,?,?,?,?,?,?)', ['G-FIX', 'Fixture grid', 'First Floor', 'g:V' + i, t, x0, y, x1, y, 'V']));
      const clinicDb = path.join(TMP, 'clinic_drawn.db'), clinicBase = path.join(TMP, 'clinic_base.db');
      fs.writeFileSync(clinicBase, Buffer.from(cdb.export()));   // the fixture DB: Clinic + grid rows given directly (Clinic states none)
      fs.copyFileSync(clinicBase, clinicDb);
      const terms = picks.slice(0, 3).map((c, i) => [c[0], c[1], i === 2 ? 'DIFFUSER' : 'DIFFUSER_SUPPLY']);
      const dxfC = path.join(TMP, 'M-201.dxf'); fs.writeFileSync(dxfC, sheetDxf({ off: [50, 70], grid: { u: gu.map(([t, x]) => [t, x, y0, y1]), v: gv.map(([t, y]) => [t, y, x0, x1]) }, pieces: [[picks[0][0], picks[0][1], picks[1][0], picks[1][1]]], terminals: terms }));
      const mc = sh([MAINS, clinicDb, dxfC, '--sheet-meta=' + JSON.stringify({ number: 'M-201', revision: 'A', storeys: ['First Floor'] })]);
      log(mc.split('\n').filter(l => /§MAINS-(TO-DB|READ|TERMINALS|REFUSE)/.test(l)).map(l => '  tool ' + l.slice(0, 220)).join('\n'));
      H.openBuildingRules(SQL, stack, 'Clinic');
      const walkC = (file, extra) => { const buf = new Uint8Array(fs.readFileSync(file)); return logsOf(() => H.walkLive(SQL, stack, 'ACMV', buf, 'Clinic', [], extra)); };
      const Cb = walkC(clinicBase), Cd = walkC(clinicDb), cb = Cb.r, cw = Cd.r;
      log('  clinic walk: ' + Cd.lines.filter(l => /§WALK-(MAINS|TERMINALS|DRAWN)/.test(l)).map(l => l.slice(0, 200)).join('\n               '));
      // independent expectation: borrowed provisional terminals of the base walk whose storey (host's, else nearest storey by median z) is First Floor
      const stz = {}; q(cdb, "SELECT m.storey, t.center_z FROM elements_meta m JOIN element_transforms t USING(guid) WHERE m.storey<>'Unknown'").forEach(r => { (stz[r[0]] = stz[r[0]] || []).push(r[1]); });
      const med = a => { a = a.slice().sort((x, y) => x - y); return a[a.length >> 1]; }, stm = Object.keys(stz).map(k => [k, med(stz[k])]);
      const hostStorey = g => { const r = q(cdb, "SELECT storey FROM elements_meta WHERE guid='" + g.replace(/'/g, "''") + "'")[0]; return r ? r[0] : null; };
      const stOf = p => (p.host && hostStorey(p.host)) || stm.slice().sort((a, b) => Math.abs(a[1] - p.z) - Math.abs(b[1] - p.z))[0][0];
      const borrowed = (cb.placements || []).filter(p => p.provisional === true && !_isMainPiece(p) && p.ifc_class !== 'IfcDuctSegment' && p.ifc_class !== 'IfcDuctFitting');
      const onFF = borrowed.filter(p => stOf(p) === 'First Floor'), elsewhere = borrowed.length - onFF.length;
      const termL = Cd.lines.filter(l => /§WALK-TERMINALS storey=First Floor drawn=/.test(l))[0] || '';
      const dropN = +((/borrowedDropped=(\d+)/.exec(termL) || [])[1]), schedN = +((/schedDropped=(\d+)/.exec(termL) || [])[1]), schedFF = (cb.placements || []).filter(p => /^sched:/.test(p.prov || '') && p.storey === 'First Floor').length, schedAll = (cb.placements || []).filter(p => /^sched:/.test(p.prov || '')).length, drawnN = +((/drawn=(\d+)/.exec(termL) || [])[1]);
      const after = (cw.placements || []), drawnT = after.filter(p => p.prov === 'drawn:terminal'), stillBorrowed = after.filter(p => p.provisional === true && !_isMainPiece(p) && p.ifc_class !== 'IfcDuctSegment' && p.ifc_class !== 'IfcDuctFitting');
      if (!borrowed.length || !onFF.length) incon('D5', 'the base Clinic walk has no borrowed terminal on First Floor (' + onFF.length + ' of ' + borrowed.length + '): nothing judged');
      else {
        ok('D5 covered storey: the drawn terminals are placed and the borrowed band ones dropped, both counted', drawnN === 3 && dropN === onFF.length && schedN === schedFF && schedFF > 0 && (cw.placements || []).filter(p => /^sched:/.test(p.prov || '')).length === schedAll - schedFF && drawnT.length === 3 && stillBorrowed.length === elsewhere && !stillBorrowed.some(p => stOf(p) === 'First Floor'),
          'log: ' + termL.trim() + ' | independent: borrowed on First Floor=' + onFF.length + ' of ' + borrowed.length + ', drawn placed=' + drawnT.length + ', borrowed kept=' + stillBorrowed.length + ' (expected ' + elsewhere + ')');
        ok('D5b uncovered storeys keep their borrowed terminals provisional', stillBorrowed.length === elsewhere && stillBorrowed.every(p => p.provisional === true), 'kept=' + stillBorrowed.length + ' provisional=' + stillBorrowed.filter(p => p.provisional === true).length);
        const near1 = drawnT.every(p => terms.some(t => near(t[0], p.x, 0.001) && near(t[1], p.y, 0.001)));
        const noKindT = drawnT.filter(p => p.system == null);
        ok('D5c a drawn terminal keeps its drawn x,y (< 1 mm), takes its height from the ceiling that holds it (host, bottom face), and a terminal of no kind is placed and gives no system', near1 && drawnT.every(p => p.host && p.heightBasis === 'ceiling:' + p.host && p.provisional === false) && noKindT.length === 1 && drawnT.filter(p => p.system).length === 2, 'positions match=' + near1 + ' noKind=' + noKindT.length + ' kinds=' + JSON.stringify(drawnT.map(p => p.system)));
      }
    }
  }
  log('§VERDICT ' + (fail ? 'CLAIM NOT MET' : inc ? 'INCONCLUSIVE' : 'CLAIM MET') + ' pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('§ERROR ' + (e && e.stack || e)); process.exit(1); });
