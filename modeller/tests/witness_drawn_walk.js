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
  const K = o.k || 1, UNDECL = !!o.undeclared, L = [], f0 = x => (Number.isInteger(x) ? x + '.' : String(x)), f = x => f0(+(x * K).toFixed(6)), e = (n, s) => L.push('#' + n + '=' + s + ';'), so = o.storeyO, X = o.extra || null;   // K: file length unit in metres^-1 (1000 = a millimetre file); every written length is metres * K
  e(10, 'IFCCARTESIANPOINT((0.,0.,0.))'); e(11, 'IFCDIRECTION((0.,0.,1.))'); e(12, 'IFCDIRECTION((1.,0.,0.))'); e(13, 'IFCAXIS2PLACEMENT3D(#10,#11,#12)');
  e(14, K === 1000 && !UNDECL ? 'IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.)' : 'IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)'); e(15, 'IFCUNITASSIGNMENT((#14))');
  e(20, "IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-5,#13,$)"); e(21, "IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,#20,$,.MODEL_VIEW.,$)");
  e(1, `IFCPROJECT('${guid(1)}',$,'Fixture',$,$,$,$,(#20),#15)`);
  e(30, `IFCSITE('${guid(30)}',$,'Site',$,$,#31,$,$,.ELEMENT.,$,$,$,$,$)`); e(31, 'IFCLOCALPLACEMENT($,#13)');
  e(32, `IFCBUILDING('${guid(32)}',$,'Building',$,$,#33,$,$,.ELEMENT.,$,$,$)`); e(33, 'IFCLOCALPLACEMENT(#31,#13)');
  e(34, `IFCBUILDINGSTOREY('${guid(34 + (o.gsh || 0))}',$,'${o.storeyName || 'Level 1'}',$,$,#35,$,$,.ELEMENT.,${f(so[2])})`); e(35, 'IFCLOCALPLACEMENT(#33,#36)'); e(36, 'IFCAXIS2PLACEMENT3D(#37,$,$)'); e(37, `IFCCARTESIANPOINT((${so.map(f).join(',')}))`);
  e(40, `IFCRELAGGREGATES('${guid(40)}',$,$,$,#1,(#30))`); e(41, `IFCRELAGGREGATES('${guid(41)}',$,$,$,#30,(#32))`); e(42, `IFCRELAGGREGATES('${guid(42)}',$,$,$,#32,(#34${X ? ',#60' : ''}))`);
  if (X) { e(60, `IFCBUILDINGSTOREY('${guid(60 + (o.gx || 0))}',$,'${X.name}',$,$,#61,$,$,.ELEMENT.,${f(X.o[2])})`); e(61, 'IFCLOCALPLACEMENT(#33,#62)'); e(62, 'IFCAXIS2PLACEMENT3D(#63,$,$)'); e(63, `IFCCARTESIANPOINT((${X.o.map(f).join(',')}))`); }
  const contained = [], containedX = [];
  (o.boxes || []).forEach((b, k) => {
    const base = 1000 + k * 40, xs = b.st === 'x' && X, sO = xs ? X.o : so, X0 = b.box || null;
    const cls = b.cls.toUpperCase(), tail = cls === 'IFCSPACE' ? `,'${b.name}',.ELEMENT.,.INTERNAL.,$` : `,$,${b.pre}`;
    if (b.poly) {   // an extruded plan outline (world metres, z0..z1): the L-shaped slab of X3. Profile points are relative to the element origin (plan 0,0 at the storey origin).
      const z0 = b.z[0], z1 = b.z[1], pts = b.poly.concat([b.poly[0]]);
      pts.forEach((p, i) => e(base + i, `IFCCARTESIANPOINT((${f(p[0] - sO[0])},${f(p[1] - sO[1])}))`));
      e(base + 20, `IFCPOLYLINE((${pts.map((p, i) => '#' + (base + i)).join(',')}))`); e(base + 21, `IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,#${base + 20})`);
      e(base + 22, `IFCEXTRUDEDAREASOLID(#${base + 21},#13,#11,${f(z1 - z0)})`);
      e(base + 28, `IFCSHAPEREPRESENTATION(#21,'Body','SweptSolid',(#${base + 22}))`); e(base + 29, `IFCPRODUCTDEFINITIONSHAPE($,$,(#${base + 28}))`);
      e(base + 33, `IFCCARTESIANPOINT((0.,0.,${f(z0 - sO[2])}))`); e(base + 32, `IFCAXIS2PLACEMENT3D(#${base + 33},$,$)`); e(base + 31, `IFCLOCALPLACEMENT(#${xs ? 61 : 35},#${base + 32})`);
      e(base + 30, `${cls}('${b.gid}',$,'${b.name}',$,$,#${base + 31},#${base + 29}${tail})`);
      (xs ? containedX : contained).push(base + 30); return;
    }
    const c = [(X0[0] + X0[3]) / 2, (X0[1] + X0[4]) / 2, (X0[2] + X0[5]) / 2], h = [(X0[3] - X0[0]) / 2, (X0[4] - X0[1]) / 2, (X0[5] - X0[2]) / 2], P = [];
    let n = 0; for (const z of [-h[2], h[2]]) for (const [x, y] of [[-h[0], -h[1]], [h[0], -h[1]], [h[0], h[1]], [-h[0], h[1]]]) { e(base + n, `IFCCARTESIANPOINT((${f(+x.toFixed(6))},${f(+y.toFixed(6))},${f(+z.toFixed(6))}))`); P.push(base + n); n++; }
    [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]].forEach((q, i) => { e(base + 8 + i, `IFCPOLYLOOP((${q.map(j => '#' + P[j]).join(',')}))`); e(base + 14 + i, `IFCFACEOUTERBOUND(#${base + 8 + i},.T.)`); e(base + 20 + i, `IFCFACE((#${base + 14 + i}))`); });
    e(base + 26, `IFCCLOSEDSHELL((${[0, 1, 2, 3, 4, 5].map(i => '#' + (base + 20 + i)).join(',')}))`); e(base + 27, `IFCFACETEDBREP(#${base + 26})`);
    e(base + 28, `IFCSHAPEREPRESENTATION(#21,'Body','Brep',(#${base + 27}))`); e(base + 29, `IFCPRODUCTDEFINITIONSHAPE($,$,(#${base + 28}))`);
    e(base + 33, `IFCCARTESIANPOINT((${[c[0] - sO[0], c[1] - sO[1], c[2] - sO[2]].map(v => f(+v.toFixed(6))).join(',')}))`); e(base + 32, `IFCAXIS2PLACEMENT3D(#${base + 33},$,$)`); e(base + 31, `IFCLOCALPLACEMENT(#${xs ? 61 : 35},#${base + 32})`);
    e(base + 30, `${cls}('${b.gid}',$,'${b.name}',$,$,#${base + 31},#${base + 29}${tail})`);
    (xs ? containedX : contained).push(base + 30);
  });
  if (o.grid) {
    let n = 100; const axes = [], pt = p => { e(++n, `IFCCARTESIANPOINT((${f(p[0] - so[0])},${f(p[1] - so[1])}))`); return '#' + n; };
    const axis = (tag, pts) => { const ids = pts.map(pt); e(++n, `IFCPOLYLINE((${ids.join(',')}))`); const cur = n; e(++n, `IFCGRIDAXIS('${tag}',#${cur},.T.)`); axes.push(n); return n; };
    const ua = o.grid.u.map(([t, p]) => axis(t, p)), va = o.grid.v.map(([t, p]) => axis(t, p));
    e(50, `IFCGRID('${o.grid.gid}',$,'${o.grid.name}',$,$,#51,$,(${ua.map(i => '#' + i).join(',')}),(${va.map(i => '#' + i).join(',')}),$)`); e(51, 'IFCLOCALPLACEMENT(#35,#52)'); e(52, 'IFCAXIS2PLACEMENT3D(#53,#11,#12)'); e(53, 'IFCCARTESIANPOINT((0.,0.,0.))');
    contained.push(50);
  }
  e(90, `IFCRELCONTAINEDINSPATIALSTRUCTURE('${guid(90)}',$,$,$,(${contained.map(i => '#' + i).join(',')}),#34)`);
  if (containedX.length) e(91, `IFCRELCONTAINEDINSPATIALSTRUCTURE('${guid(91)}',$,$,$,(${containedX.map(i => '#' + i).join(',')}),#60)`);
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

// ── fixture X (§9 rulings, all written here): ARC_X in metres (storey Level 1, z 0): two ceilings (A over y 0..8, B over y 9..12), an L-SHAPED floor slab (box x 0..10 x y 0..8 with the notch x 5..10 x y 4..8 missing).
// STR_X in MILLIMETRES (generic names): storey STR GROUND (z 0, pairs with Level 1 by elevation) and STR LEVEL 01 (z 4 m, no partner). On STR LEVEL 01: S1 soffit 3.4 over x -1..11 y -1..9; TIGHT soffit 2.71 over ceiling B (ceiling top 2.70);
// an L-shaped roof (soffit 3.4, box x 20..30 y 0..8, notch x 25..30 y 4..8); a slab far out. On STR GROUND: a floor slab F top 0.15 at x 12..20 (no ARC slab there). The grid is written into ARC_X only, so the sheet fit has one set of axes.
const XS = { LROOF: guid(1108), S1: guid(1101), TIGHT: guid(1102), F: guid(1103), UP: guid(1104), LSLAB: guid(1105), CA: guid(1106), CB: guid(1107) };
const XGRID = (nm, g) => ({ gid: g, name: nm, u: [['A', [[0, -1], [0, 13]]], ['B', [[6, -1], [6, 13]]], ['C', [[12, -1], [12, 13]]]], v: [['1', [[-1, 0], [21, 0]]], ['2', [[-1, 4], [21, 4]]], ['3', [[-1, 12], [21, 12]]]] });
const ARC_X = ifcDoc({ storeyO: [0, 0, 0], tag: 'ARC_X', boxes: [
  { cls: 'IfcCovering', name: 'Ceiling A', box: [0, 0, 2.6, 6, 8, 2.7], pre: '.CEILING.', gid: XS.CA },
  { cls: 'IfcCovering', name: 'Ceiling B', box: [0, 9, 2.6, 6, 12, 2.7], pre: '.CEILING.', gid: XS.CB },
  { cls: 'IfcSpace', name: 'Room', box: [0, 0, 0, 6, 8, 2.6], pre: '', gid: guid(1109) },
  { cls: 'IfcSlab', name: 'L floor', poly: [[0, 0], [10, 0], [10, 4], [5, 4], [5, 8], [0, 8]], z: [-0.2, 0], pre: '.FLOOR.', gid: XS.LSLAB },
  { cls: 'IfcSlab', name: 'E floor', box: [20, 0, -0.2, 30, 8, 0], pre: '.FLOOR.', gid: guid(1110) }], grid: XGRID('Grid ARC X', guid(1150)) });   // §10: a floor under the L roof, so E5 is judged by the roof's outline and not by the missing floor
const STR_X = ifcDoc({ gsh: 500, storeyO: [0, 0, 0], k: 1000, storeyName: 'STR GROUND', extra: { name: 'STR LEVEL 01', o: [0, 0, 4] }, tag: 'STR_X', boxes: [
  { cls: 'IfcSlab', name: 'STR slab S1', box: [-1, -1, 3.4, 11, 9, 3.7], pre: '.FLOOR.', gid: XS.S1, st: 'x' },
  { cls: 'IfcSlab', name: 'STR tight', box: [0, 9, 2.71, 6, 12, 2.9], pre: '.FLOOR.', gid: XS.TIGHT, st: 'x' },
  { cls: 'IfcSlab', name: 'STR L roof', poly: [[20, 0], [30, 0], [30, 4], [25, 4], [25, 8], [20, 8]], z: [3.4, 3.5], pre: '.ROOF.', gid: XS.LROOF, st: 'x' },
  { cls: 'IfcSlab', name: 'STR floor F', box: [12, 0, -0.05, 20, 8, 0.15], pre: '.FLOOR.', gid: XS.F },
  { cls: 'IfcSlab', name: 'STR upper slab', box: [30, 0, 3.9, 40, 8, 4.0], pre: '.FLOOR.', gid: XS.UP, st: 'x' }] });

// ── a duct-sheet DXF in raw ASCII (LINE, TEXT, INSERT), mm. building = sheet/1000 - off (translation only), so the fit has to recover the offset. ──
function sheetDxf(o) {   // o: { off:[ox,oy] metres (sheet = building + off), grid:{u:[[tag,x,y0,y1]],v:[[tag,y,x0,x1]]}, pieces:[[x0,y0,x1,y1]], terminals:[[x,y,name]] }  building metres
  const out = [], mm = (v, k) => String(Math.round((v + o.off[k]) * 1000));
  if (o.blocks) { out.push('0', 'SECTION', '2', 'BLOCKS'); Object.keys(o.blocks).forEach(n => out.push('0', 'BLOCK', '8', '0', '2', n, '70', '0', '10', '0', '20', '0', '30', '0', '3', n, '0', 'LINE', '8', '0', '10', '0', '20', '0', '30', '0', '11', '100', '21', '0', '31', String(o.blocks[n]), '0', 'ENDBLK', '8', '0')); out.push('0', 'ENDSEC'); }   // o.blocks: { name: Z extent in sheet units (mm) }
  out.push('0', 'SECTION', '2', 'ENTITIES');
  const line = (layer, a, b) => out.push('0', 'LINE', '8', layer, '10', mm(a[0], 0), '20', mm(a[1], 1), '30', '0', '11', mm(b[0], 0), '21', mm(b[1], 1), '31', '0');
  const text = (layer, s, p) => out.push('0', 'TEXT', '8', layer, '10', mm(p[0], 0), '20', mm(p[1], 1), '30', '0', '40', '200', '1', s);
  o.grid.u.forEach(([t, x, y0, y1]) => { line('S-GRID', [x, y0], [x, y1]); text('S-GRID-IDEN', t, [x, y0 - 0.3]); });
  o.grid.v.forEach(([t, y, x0, x1]) => { line('S-GRID', [x0, y], [x1, y]); text('S-GRID-IDEN', t, [x0 - 0.3, y]); });
  o.pieces.forEach(p => line('M-HVAC-DUCT-CNTR', [p[0], p[1]], [p[2], p[3]]));
  (o.terminals || []).forEach(t => out.push('0', 'INSERT', '8', 'M-HVAC-CDFF-OTLN', '2', t[2], '10', mm(t[0], 0), '20', mm(t[1], 1), '30', '0'));
  (o.equip || []).forEach(e => out.push('0', 'INSERT', '8', e[3] || 'M-EQPM', '2', e[2], '10', mm(e[0], 0), '20', mm(e[1], 1), '30', '0'));   // equipment: [x, y, block name, layer]
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

  // ── P: FP equipment in the walk (prompts/DISC_WALK_DRAWN_INTEGRATION.md §8). Fixture C (public, written here): Level 1 with two floor slabs that STEP (A top 0.00 over x 0..6, B top 0.30 over x 6..12) and a grid.
  // ISSUES IT EXPOSES: (P1) equipment placed at a guessed or storey-elevation z; (P2) a stepped floor ignored; (P3) a block whose bottom would sit under 0.10 m left unclamped; (P4) band sprinkler heads left beside drawn equipment;
  // (P5) an item with no floor placed anyway; (P6) borrowed kinds unlabelled, or the height's basis/source missing; (P7) a box (or any mesh not keyed on the item's kind) standing in for the item.
  {
    const SLAB_A = guid(901), SLAB_B = guid(902), kv = (l, k) => { const m = new RegExp(k + '=(\\S+)').exec(l); return m ? m[1] : null; };
    const ARC_C = ifcDoc({ storeyO: [0, 0, 0], tag: 'ARC_C', boxes: [
      { cls: 'IfcSlab', name: 'Floor A', box: [0, 0, -0.2, 6, 8, 0], pre: '.FLOOR.', gid: SLAB_A },
      { cls: 'IfcSlab', name: 'Floor B', box: [6, 0, 0.1, 12, 8, 0.3], pre: '.FLOOR.', gid: SLAB_B }],
      grid: { gid: guid(950), name: 'Grid C', u: [['A', [[0, -1], [0, 9]]], ['B', [[6, -1], [6, 9]]], ['C', [[12, -1], [12, 9]]]], v: [['1', [[-1, 0], [13, 0]]], ['2', [[-1, 4], [13, 4]]], ['3', [[-1, 8], [13, 8]]]] } });
    const ifcC = path.join(TMP, 'ARC_C.ifc'), dbC = path.join(TMP, 'fp_C.db'), dbCbase = path.join(TMP, 'fp_C_base.db');
    fs.writeFileSync(ifcC, ARC_C); sh([TOOL, '--ifc', ifcC, '-o', dbCbase]);
    { const g0 = new SQL.Database(new Uint8Array(fs.readFileSync(dbCbase)));   // the single-file extract states no grid rows (the reader is handed in only by the federated path): given directly, as D5 does for Clinic
      g0.run('CREATE TABLE IF NOT EXISTS ifc_grid_axis(grid_guid TEXT, grid_name TEXT, storey TEXT, axis_guid TEXT, tag TEXT, x0 REAL, y0 REAL, x1 REAL, y1 REAL, axis_set TEXT)');
      [['A', 0], ['B', 6], ['C', 12]].forEach(([t, x], i) => g0.run('INSERT INTO ifc_grid_axis VALUES(?,?,?,?,?,?,?,?,?,?)', ['G-C', 'Grid C', 'Level 1', 'g:U' + i, t, x, -1, x, 9, 'U']));
      [['1', 0], ['2', 4], ['3', 8]].forEach(([t, y], i) => g0.run('INSERT INTO ifc_grid_axis VALUES(?,?,?,?,?,?,?,?,?,?)', ['G-C', 'Grid C', 'Level 1', 'g:V' + i, t, -1, y, 13, y, 'V']));
      fs.writeFileSync(dbCbase, Buffer.from(g0.export())); g0.close(); }
    fs.copyFileSync(dbCbase, dbC);
    const EQS = [[2, 2, 'EXTINGUISHER FOAM 9L'], [9, 4, 'EXTINGUISHER FOAM 9L'], [3, 6, 'FIRE CABINET 1'], [10, 6, 'Fire_Blanket'], [4, 1, 'FIRE CABINET TALL'], [20, 4, 'EXTINGUISHER FOAM 9L']];   // items 1..6 in DXF order
    const dxfE = path.join(TMP, 'FP-101.dxf');
    fs.writeFileSync(dxfE, sheetDxf({ off: [100, 200], grid: { u: [['A', 0, -1, 9], ['B', 6, -1, 9], ['C', 12, -1, 9]], v: [['1', 0, -1, 13], ['2', 4, -1, 13], ['3', 8, -1, 13]] }, pieces: [], terminals: [], equip: EQS, blocks: { 'FIRE CABINET TALL': 1600 } }));
    const mE = sh([MAINS, dbC, dxfE, '--sheet-meta=' + JSON.stringify({ number: 'FP-101', revision: 'A', storeys: ['Level 1'] })]);
    log(mE.split('\n').filter(l => /§MAINS-(EQUIP-TO-DB|TO-DB|READ|EQUIP |REFUSE|INCONCLUSIVE|STOREYS)/.test(l)).map(l => '  tool ' + l.slice(0, 260)).join('\n'));
    const pdb = new SQL.Database(new Uint8Array(fs.readFileSync(dbC)));
    const nEq = q(pdb, 'SELECT count(*) FROM drawn_equipment')[0][0], ruleRow = q(pdb, 'SELECT id, mount_m, basis FROM drawn_equipment_rule')[0], sizeRows = q(pdb, 'SELECT block, height_m FROM drawn_equipment_size');
    log('§W_DW P tool result: drawn_equipment=' + nEq + ' rule=' + JSON.stringify(ruleRow) + ' sizes=' + JSON.stringify(sizeRows) + ' storeys=' + JSON.stringify(q(pdb, 'SELECT sheet_number, storey FROM drawn_sheet_meta')));
    if (nEq !== EQS.length || !ruleRow) incon('P*', 'the equipment sheet was not stored (items ' + nEq + ' of ' + EQS.length + ', rule ' + JSON.stringify(ruleRow) + '): nothing walked');
    else {
      H.openBuildingRules(SQL, stack, 'Duplex');
      const walkFP = file => { const buf = new Uint8Array(fs.readFileSync(file)); return logsOf(() => H.walkLive(SQL, stack, 'FP', buf, 'Duplex', [], {})); };
      const DWm = stack.DW, RULESJ = JSON.parse(fs.readFileSync(path.join(M, 'drawn_mains_rules.json'), 'utf8')), ROW = RULESJ.rows.find(r => r.role === 'mount_height');   // §9 item 8: the owner's 1.2 m anchor row
      const WP = walkFP(dbC), wp = WP.r, ops = wp.drawn ? DWm.drawnOps(wp.drawn) : [], fpL = (WP.lines.filter(l => /§FP-EQUIP placed=/.test(l))[0] || '');
      log('  walk: ' + WP.lines.filter(l => /§FP-EQUIP/.test(l)).map(l => l.slice(0, 300)).join('\n        '));
      const byItem = {}; ops.forEach(o => { byItem[o.params._dw.item] = o; });
      const zAnc = o => o.params.placement.z;   // the anchor (mount point) of the item
      const fl = g => q(pdb, "SELECT maxZ FROM element_world_bbox WHERE guid='" + g + "'")[0][0];
      const floorA = fl(SLAB_A), floorB = fl(SLAB_B), MOUNT = ROW.mount_m;
      const top = (i, f) => byItem[i] && near(zAnc(byItem[i]), f + MOUNT, 0.0005);
      ok('P1 equipment-only sheet through mains_to_db, walk FP: every item (extinguisher, cabinet, blanket) is anchored at floor + ' + MOUNT + ' m (owner: wall mounted at 1.2 m; oracle: the floor element\'s own world box); the log states mount_m and basis=owner', !!ROW && ROW.id === 'fp-mount-owner-1p2' && MOUNT === 1.2 && top(1, floorA) && top(2, floorB) && top(3, floorA) && top(4, floorB) && ops.length === 6 && kv(fpL, 'placed') === '6' && kv(fpL, 'heightRule') === 'fp-mount-owner-1p2' && kv(fpL, 'mount_m') === '1.2' && kv(fpL, 'basis') === 'owner',
        'floors A=' + floorA.toFixed(3) + ' B=' + floorB.toFixed(3) + ' anchors=' + [1, 2, 3, 4].map(i => byItem[i] ? zAnc(byItem[i]).toFixed(4) : 'none') + ' ops=' + ops.length + ' | ' + fpL.slice(0, 260));
      const dbNo = path.join(TMP, 'fp_C_norule.db'); fs.copyFileSync(dbC, dbNo); { const d0 = new SQL.Database(new Uint8Array(fs.readFileSync(dbNo))); d0.run('DELETE FROM drawn_equipment_rule'); fs.writeFileSync(dbNo, Buffer.from(d0.export())); d0.close(); }
      const WN = walkFP(dbNo), wn = WN.r, nL = (WN.lines.filter(l => /§FP-EQUIP placed=/.test(l))[0] || ''), nD = (WN.lines.filter(l => /§FP-EQUIP-DETAIL/.test(l))[0] || '');
      ok('P1 RED: with the height row removed nothing is placed: placed=0, heightRule=none, all ' + EQS.length + ' counted noRule, no op and so no z (never a guessed one)', kv(nL, 'placed') === '0' && kv(nL, 'heightRule') === 'none' && kv(nD, 'noRule') === String(EQS.length) && DWm.drawnOps(wn.drawn).length === 0, nL.slice(0, 160) + ' | ' + nD.slice(0, 120));
      ok('P2 a floor step (two slabs in one storey, tops ' + floorA.toFixed(2) + ' and ' + floorB.toFixed(2) + ') puts each item on its own floor: items 1,3 on slab A, items 2,4 on slab B, floorZ and host recorded', floorB - floorA > 0.25 && [1, 3].every(i => byItem[i] && byItem[i].params._dw.floor === SLAB_A && near(byItem[i].params._dw.floorZ, floorA, 0.0005)) && [2, 4].every(i => byItem[i] && byItem[i].params._dw.floor === SLAB_B && near(byItem[i].params._dw.floorZ, floorB, 0.0005)),
        [1, 2, 3, 4].map(i => i + ':' + (byItem[i] ? byItem[i].params._dw.floor.slice(-3) + '@' + byItem[i].params._dw.floorZ : 'none')).join(' '));
      const o5 = byItem[5];
      ok('P3 no size logic in the active path: the 1.6 m block (item 5) is anchored at floor + ' + MOUNT + ' like every other item; no bottom clamp, no bottomClamped on the log or the op', !!o5 && near(zAnc(o5), floorA + MOUNT, 0.0005) && o5.params._dw.bottomClamped === undefined && kv(fpL, 'bottomClamped') === null && ops.every(o => o.params._dw.bottomClamped === undefined),
        'anchor=' + (o5 ? zAnc(o5).toFixed(4) : 'none') + ' ' + fpL.slice(0, 160));
      const o6 = byItem[6];
      ok('P5 no slab under an item (item 6, 8 m past the last slab): the floor is the set storey\'s STATED elevation, labelled "floor = storey elevation, no slab under", floorFromStoreyElev=1, noFloor=0 (§9 item 5)', !!o6 && o6.params._dw.floorBasis === 'storey-elevation' && o6.params._dw.floorLabel === 'floor = storey elevation, no slab under' && o6.params._dw.floor === null && near(o6.params._dw.floorZ, 0, 1e-9) && near(zAnc(o6), MOUNT, 0.0005) && kv(fpL, 'floorFromStoreyElev') === '1' && kv(fpL, 'noFloor') === '0',
        'item6 floorBasis=' + (o6 && o6.params._dw.floorBasis) + ' anchor=' + (o6 ? zAnc(o6).toFixed(4) : 'none') + ' ' + fpL.slice(0, 220));
      const dbNoSE = path.join(TMP, 'fp_C_noelev.db'); fs.copyFileSync(dbC, dbNoSE); { const d0 = new SQL.Database(new Uint8Array(fs.readFileSync(dbNoSE))); d0.run('DELETE FROM storey_elevation'); fs.writeFileSync(dbNoSE, Buffer.from(d0.export())); d0.close(); }
      const WE = walkFP(dbNoSE), eL = (WE.lines.filter(l => /§FP-EQUIP placed=/.test(l))[0] || '');
      ok('P5 RED: with no stated storey elevation there is no floor to state: item 6 is not placed, noFloor=1, floorFromStoreyElev=0 (never a guessed z)', kv(eL, 'noFloor') === '1' && kv(eL, 'floorFromStoreyElev') === '0' && kv(eL, 'placed') === '5', eL.slice(0, 200));
      const strengthOK = o => { const d = o.params._dw; return d.heightBasis === 'owner-stated' && d.source === ROW.source && d.heightRule === ROW.id && d.strength.position === 'drawn' && d.strength.height === 'owner-stated' && d.provisional === false && d.positionBasis === 'drawn' && d.mountM === 1.2 && d.heightDatum === 'anchor'; };
      ok('P6 all three kinds take the one owner row and none is borrowed (borrowedKinds=0, heightRuleUse=rule); every op carries HeightBasis=owner-stated and Source = the row\'s citation; strength: position drawn, height owner-stated; no Provisional flag', ops.every(o => o.params._dw.heightRuleUse === 'rule') && kv(fpL, 'borrowedKinds') === '0' && ops.every(strengthOK) && /owner 2026-11-08: wall mounted at 1\.2 m/.test(ROW.source) && /NFPA 10/.test(ROW.note) && ROW.top_m === undefined,
        'borrowedKinds=' + kv(fpL, 'borrowedKinds') + ' uses=' + ops.map(o => o.params._dw.heightRuleUse).join(',') + ' basis=' + (ops[0] && ops[0].params._dw.heightBasis) + ' source=' + (ops[0] && ops[0].params._dw.source || '').slice(0, 50));
      const kindOT = { extinguisher: 'FIREEXTINGUISHER', cabinet: 'FIRECABINET', blanket: 'FIREBLANKET' };
      ok('P6b the IFC class comes from the row: IfcFireSuppressionTerminal, USERDEFINED, ObjectType by kind; discipline FP', ops.every(o => { const d = o.params._dw; return d.disc === 'FP' && d.ifcClass === 'IfcFireSuppressionTerminal' && d.predefined === 'USERDEFINED' && d.objectType === kindOT[d.itemKind] && d.label === d.objectType; }), ops.map(o => o.params._dw.objectType).join(','));
      ok('P7 no box and no borrowed mesh: every op is anchorOnly with no geometry hash, no prim, a marker bbox only; noMesh counts every placed item; the mined FP mesh row is not keyed on ObjectType, so none may be used', ops.length === 6 && ops.every(o => o.op_type === 'GEOM_INSERT' && o.params.anchorOnly === true && !o.params.geometry_hash && !o.params.prim && o.params._dw.meshState === 'noMesh' && o.params.bbox[1] <= 0.05 + 1e-9 && o.params.bbox[3] <= 0.05 + 1e-9) && kv(fpL, 'noMesh') === '6' && /objectTypeKeyedMesh=no/.test(WP.lines.join('\n')) && !(wp.placements || []).some(p => /^drawn:equipment/.test(p.prov || '')),
        'noMesh=' + kv(fpL, 'noMesh') + ' ' + (WP.lines.filter(l => /objectTypeKeyedMesh/.test(l))[0] || '').slice(0, 220));
      pdb.close();
    }
    // P4 band sprinkler heads, on the Duplex + STR_A federation: a sheet covering Level 1 (its equipment on Level 1 floors); heads on Level 1 dropped and counted, Level 2 unchanged
    const dbF = path.join(TMP, 'fp_F.db'); fs.copyFileSync(fedA, dbF);
    const dxfF = path.join(TMP, 'FP-102.dxf');
    fs.writeFileSync(dxfF, sheetDxf({ off: [100, 200], grid: GRIDSHEET, pieces: [], terminals: [], equip: [[1.5, -2, 'EXTINGUISHER FOAM 9L'], [6, -14, 'FIRE CABINET 1']] }));
    sh([MAINS, dbF, dxfF, '--sheet-meta=' + JSON.stringify({ number: 'FP-102', revision: 'A', storeys: ['Level 1'] })]);
    H.openBuildingRules(SQL, stack, 'Duplex');
    const fdb = new SQL.Database(new Uint8Array(fs.readFileSync(fedA)));
    const walkF = file => { const buf = new Uint8Array(fs.readFileSync(file)); return logsOf(() => H.walkLive(SQL, stack, 'FP', buf, 'Duplex', [], {})); };
    const Fb = walkF(fedA), Fd = walkF(dbF), fb = Fb.r, fw = Fd.r;
    const stz = {}; q(fdb, "SELECT m.storey, t.center_z FROM elements_meta m JOIN element_transforms t USING(guid) WHERE m.storey<>'Unknown'").forEach(r => { (stz[r[0]] = stz[r[0]] || []).push(r[1]); });
    const med = a => { a = a.slice().sort((x, y) => x - y); return a[a.length >> 1]; }, stm = Object.keys(stz).map(k => [k, med(stz[k])]);
    const hostStorey = g => { const r = q(fdb, "SELECT storey FROM elements_meta WHERE guid='" + g.replace(/'/g, "''") + "'")[0]; return r ? r[0] : null; };
    const stOf = p => (p.host && hostStorey(p.host)) || stm.slice().sort((a, b) => Math.abs(a[1] - p.z) - Math.abs(b[1] - p.z))[0][0];
    const isHead = p => /FireSuppressionTerminal|Sprinkler/i.test(p.ifc_class || '');
    const heads = (fb.placements || []).filter(isHead), onL1 = heads.filter(p => stOf(p) === 'Level 1'), elsewhereN = heads.length - onL1.length;
    const fL = (Fd.lines.filter(l => /§FP-EQUIP placed=/.test(l))[0] || ''), keptHeads = (fw.placements || []).filter(p => isHead(p) && !/^drawn:/.test(p.prov || ''));
    log('  duplex base FP heads=' + heads.length + ' on Level 1=' + onL1.length + ' elsewhere=' + elsewhereN + ' | drawn walk: ' + Fd.lines.filter(l => /§FP-EQUIP/.test(l)).map(l => l.slice(0, 260)).join(' || '));
    if (!onL1.length || !elsewhereN) incon('P4', 'the base Duplex FP walk has no band head on Level 1 or elsewhere (' + onL1.length + ' / ' + elsewhereN + '): nothing judged');
    else {
      ok('P4 band sprinkler heads on the covered storey are dropped and counted (bandDropped = the base walk\'s Level 1 heads); on the uncovered storey they are unchanged and still provisional', kv(fL, 'bandDropped') === String(onL1.length) && keptHeads.length === elsewhereN && keptHeads.every(p => p.provisional === true && stOf(p) !== 'Level 1'),
        'base heads=' + heads.length + ' L1=' + onL1.length + ' elsewhere=' + elsewhereN + ' | drawn walk bandDropped=' + kv(fL, 'bandDropped') + ' kept=' + keptHeads.length + ' | ' + fL.slice(0, 170));
      ok('P4b RED: the base walk (no drawn_equipment) is untouched: no §FP-EQUIP line, no drawn record, every head kept', !Fb.lines.some(l => /§FP-EQUIP/.test(l)) && !fb.drawn && heads.length === onL1.length + elsewhereN, 'lines=' + Fb.lines.filter(l => /§FP-EQUIP/.test(l)).length);
    }
    fdb.close();
  }
  // ── X: the §9 owner rulings and defect fixes (prompts/DISC_WALK_DRAWN_INTEGRATION.md §9). Fixture X (public, written here): ARC_X in metres + STR_X in millimetres, federated (see the fixture comment above).
  // ISSUES IT EXPOSES: (X1) a run or terminal with no ceiling void left plan only / at a guessed z; (X2) sprinkler heads placed where the author has not said there are sprinklers, or residents changed; (X3) a slab's BOX standing for its outline (floor and structure-above);
  // (X4) a federated second file's storeys lost, in raw millimetres, or not matched to the first file's by elevation; (X5) an unstated floor; (X6) "refused" for a sheet that only lacks a centreline layer; (X7) a film filter that changes data or counts.
  {
    const kv = (l, k) => { const m = new RegExp(k + '=(\\S+)').exec(l || ''); return m ? m[1] : null; };
    const L1 = (lines, rx) => (lines.filter(l => rx.test(l))[0] || '');
    const xArc = path.join(TMP, 'ARC_X.ifc'), xStr = path.join(TMP, 'STR_X.ifc'), fedX = path.join(TMP, 'fed_X.db');
    fs.writeFileSync(xArc, ARC_X); fs.writeFileSync(xStr, STR_X);
    const fedOut = sh([TOOL, '--ifc', xArc, '--federate', xStr, '--federate-disc', 'STR', '-o', fedX]);
    const fsLine = L1(fedOut.split('\n'), /§FEDERATE-STOREYS/);
    log('  X tool: ' + fsLine.slice(0, 260));
    if (!fs.existsSync(fedX)) incon('X*', 'the X federation was not written: ' + fedOut.slice(-300));
    else {
      const xdb = new Database(fedX, { readonly: true });
      // ---- X4: federation storeys. Oracle: the fixture states STR LEVEL 01 at 4000 mm = 4 m and STR GROUND at 0 (file 2 is in millimetres).
      const se = rowsOf(xdb, 'SELECT name, elevation_attr_m a, placement_z_m z FROM storey_elevation ORDER BY name'), ss = rowsOf(xdb, "SELECT name, elevation e FROM spatial_structure WHERE type='IfcBuildingStorey' ORDER BY name");
      const zOf = n => (se.find(r => r.name === n) || {}).z, eOf = n => (ss.find(r => r.name === n) || {}).e;
      ok('X4 the federation merges the second (millimetre) file\'s storeys in METRES: STR LEVEL 01 = 4 (not 4000) in storey_elevation and spatial_structure, STR GROUND = 0, file 1\'s Level 1 untouched; elements keep the second file\'s storey names',
        se.length === 3 && near(zOf('STR LEVEL 01'), 4, 1e-6) && near(zOf('STR GROUND'), 0, 1e-6) && near(zOf('Level 1'), 0, 1e-6) && near(eOf('STR LEVEL 01'), 4, 1e-6) && ss.length === 3 && rowsOf(xdb, "SELECT count(DISTINCT storey) n FROM elements_meta WHERE discipline='STR'")[0].n === 2,
        'storey_elevation=' + JSON.stringify(se.map(r => [r.name, r.z])) + ' spatial=' + JSON.stringify(ss.map(r => [r.name, r.e])));
      ok('X4b the pairing is by ELEVATION within 0.05 m and logged: STR GROUND pairs with Level 1 under a different name, STR LEVEL 01 has no partner and stays its own storey', /paired=1 of 2 /.test(fsLine) && /unpaired=\["STR LEVEL 01"\]/.test(fsLine), fsLine.slice(0, 200));
      // RED: the unfixed tool (HEAD's copy, written beside it for the run and removed) keeps none of file 2's storeys
      const preTool = path.join(M, 'tools', '_pre_fix_extract_tmp.js'), preDb = path.join(TMP, 'fed_X_prefix.db');
      let preSe = null;
      try { fs.writeFileSync(preTool, cp.execFileSync('git', ['-C', ROOT, 'show', '98122fc0:modeller/tools/extract_ifc2db.js']).toString()); sh([preTool, '--ifc', xArc, '--federate', xStr, '--federate-disc', 'STR', '-o', preDb]); const pdb = new Database(preDb, { readonly: true }); preSe = rowsOf(pdb, 'SELECT name FROM storey_elevation').map(r => r.name); pdb.close(); } catch (e) { preSe = 'ERR ' + e.message; } finally { try { fs.unlinkSync(preTool); } catch (e) { /* absent */ } }
      if (!Array.isArray(preSe)) incon('X4 RED', 'the pre-change tool did not run: ' + preSe);
      else ok('X4 RED: before the merge fix the federated DB holds 0 storeys from file 2 (only Level 1), though the STR elements carry their own storey names', preSe.length === 1 && preSe[0] === 'Level 1', 'pre-change tool storey_elevation=' + JSON.stringify(preSe));
      // an undeclared-unit millimetre file: the storeys take the geometry's factor, never raw millimetres
      const undIfc = path.join(TMP, 'STR_UND.ifc'), undDb = path.join(TMP, 'STR_UND.db');
      fs.writeFileSync(undIfc, ifcDoc({ storeyO: [0, 0, 0], k: 1000, undeclared: true, storeyName: 'STR UND', extra: { name: 'STR UND UP', o: [0, 0, 4] }, tag: 'STR_UND', boxes: [{ cls: 'IfcSlab', name: 'a', box: [0, 0, -0.2, 20, 20, 0], pre: '.FLOOR.', gid: guid(1201) }, { cls: 'IfcSlab', name: 'b', box: [0, 0, 3.8, 20, 20, 4], pre: '.FLOOR.', gid: guid(1202), st: 'x' }] }));
      const undOut = sh([TOOL, '--ifc', undIfc, '-o', undDb]); const udb = new Database(undDb, { readonly: true }); const useRows = rowsOf(udb, 'SELECT name, placement_z_m z, elevation_attr_m a FROM storey_elevation ORDER BY z'); udb.close();
      ok('X4c a millimetre file that declares metres (undeclared unit): storey_elevation takes the geometry\'s factor, so STR UND UP = 4 m and not 4000', useRows.length === 2 && near(useRows[1].z, 4, 1e-6) && near(useRows[1].a, 4, 1e-6) && /§STOREY_ELEVATION_UNITS/.test(undOut), JSON.stringify(useRows) + ' ' + L1(undOut.split('\n'), /§STOREY_ELEVATION_UNITS/).slice(0, 160));

      // ---- X1 / X3 (structure) : ACMV on X
      const XP = { E1: [7.5, 2, 9.5, 2], E2: [1, 2, 5, 2], E3: [1, 10.5, 5, 10.5], E4: [20, -2, 24, -2], E5: [26, 6, 28, 6] }, XT = [[8, 2, 'DIFFUSER_SUPPLY'], [2, 2, 'DIFFUSER_SUPPLY']];
      const XGS = { u: [['A', 0, -1, 13], ['B', 6, -1, 13], ['C', 12, -1, 13]], v: [['1', 0, -1, 21], ['2', 4, -1, 21], ['3', 12, -1, 21]] };
      const dxfXM = path.join(TMP, 'XM-101.dxf'); fs.writeFileSync(dxfXM, sheetDxf({ off: [100, 200], grid: XGS, pieces: Object.values(XP), terminals: XT }));
      const dbXM = path.join(TMP, 'x_acmv.db'); fs.copyFileSync(fedX, dbXM);
      const mX = sh([MAINS, dbXM, dxfXM, '--sheet-meta=' + JSON.stringify({ number: 'XM-101', revision: 'A', storeys: ['Level 1'] })]);
      log(mX.split('\n').filter(l => /§MAINS-(TO-DB|READ|FIT|TERMINALS|REFUSE|HEIGHT-RULE)/.test(l)).map(l => '  tool ' + l.slice(0, 260)).join('\n'));
      H.openBuildingRules(SQL, stack, 'Duplex');
      const walkA = (file, extra) => { const buf = new Uint8Array(fs.readFileSync(file)); return logsOf(() => H.walkLive(SQL, stack, 'ACMV', buf, 'Duplex', [], extra || {})); };
      const bbX = g => rowsOf(xdb, 'SELECT minZ, maxZ FROM element_world_bbox WHERE guid=?', [g])[0];
      const XA = walkA(dbXM), xw = XA.r, xd = xw.drawn;
      log('  X walk: ' + XA.lines.filter(l => /§WALK-(MAINS|OUTLINE)|§STOREY-ELEV/.test(l)).map(l => l.slice(0, 330)).join('\n          '));
      if (!xd) incon('X1', 'no drawn record on the X walk');
      else {
        const px = n => xd.pieces[Object.keys(XP).indexOf(n)], ex = XA.lines.filter(l => /§WALK-MAINS-EXPOSED/.test(l))[0] || '';
        const s1 = bbX(XS.S1), tg = bbX(XS.TIGHT), cB = bbX(XS.CB), cA = bbX(XS.CA);
        ok('X1 a run with NO ceiling (E1) takes the underside of the lowest structure above (STR slab S1 soffit ' + s1.minZ.toFixed(3) + '), labelled exposed with HeightBasis = exposed-under-structure; a run with structure within 20 mm of its ceiling (E3) takes that soffit (' + tg.minZ.toFixed(3) + '); both counted',
          px('E1').z != null && near(px('E1').z, s1.minZ, 0.002) && px('E1').heightBasis === 'exposed-under-structure' && px('E1').heightLabel === 'exposed, height provisional' && px('E1').structure === XS.S1 && !px('E1').ceiling &&
          px('E3').z != null && near(px('E3').z, tg.minZ, 0.002) && px('E3').heightBasis === 'exposed-under-structure' && px('E3').structure === XS.TIGHT && px('E3').ceiling === XS.CB && kv(ex, 'pieces') === '2' && kv(ex, 'rule') === 'exposed-under-structure',
          'E1 z=' + (px('E1').z && px('E1').z.toFixed(4)) + ' E3 z=' + (px('E3').z && px('E3').z.toFixed(4)) + ' | ' + ex.slice(0, 200));
        const e2 = px('E2'), kn = xd.known.length;
        ok('X1b controls: E2 under ceiling A keeps the void middle ((ceiling top ' + cA.maxZ.toFixed(3) + ' + S1 soffit ' + s1.minZ.toFixed(3) + ')/2); E4 (no ceiling, no structure above the storey floor) stays plan only; placed/planOnly follow',
          e2.z != null && near(e2.z, (cA.maxZ + s1.minZ) / 2, 0.002) && e2.heightBasis === 'void-middle' && px('E4').z == null && px('E4').heightBasis === 'none' && kn === 3 && xd.planOnly.length === 2 && new RegExp('placed=3 planOnly=2').test(L1(XA.lines, /§WALK-MAINS disc=ACMV drawn=/)), 'known=' + kn + ' planOnly=' + xd.planOnly.length + ' ' + L1(XA.lines, /§WALK-MAINS disc=ACMV drawn=/).slice(0, 120));
        const xops = stack.DW.drawnOps(xd), e1op = xops.find(o => o.params._dw.piece === 1);
        ok('X1c the op of an exposed run carries the label and strength: HeightBasis exposed-under-structure, exposed=true, strength.height provisional, no Provisional flag, the structure it hangs from', !!e1op && e1op.params._dw.heightBasis === 'exposed-under-structure' && e1op.params._dw.exposed === true && e1op.params._dw.heightLabel === 'exposed, height provisional' && e1op.params._dw.strength.height === 'provisional' && e1op.params._dw.provisional === false && e1op.params._dw.structure === XS.S1 && near(e1op.params.line.from[2], s1.minZ, 0.002), JSON.stringify(e1op && e1op.params._dw).slice(0, 220));
        const t1 = (xd.terminals && xd.terminals.byStorey) ? xd.terminals : null, wt = XA.lines.filter(l => /§WALK-TERMINALS-DETAIL/.test(l)).join(' | ');
        const tp = (xw.placements || []).filter(p => p.prov === 'drawn:terminal'), tpE = tp.filter(p => p.exposed);
        ok('X1d a drawn terminal with no ceiling (8, 2) hangs from the structure underside: counted in the log (terminals=1); when a device mesh exists it is placed at the soffit with the label, otherwise it is listed noMesh', kv(ex, 'terminals') === '1' && (tpE.length === 0 ? /noMesh=[1-9]/.test(wt) : tpE.length === 1 && near(tpE[0].z, s1.minZ, 0.002) && tpE[0].heightBasis === 'exposed-under-structure' && tpE[0].heightLabel === 'exposed, height provisional'), 'terminals(exposed)=' + kv(ex, 'terminals') + ' placedExposed=' + tpE.length + ' drawnTerminalsPlaced=' + tp.length + ' ' + wt.slice(0, 160));
        // X1e: the same on the Duplex + STR_A federation, where Level 1 carries rule-mined terminal meshes: a terminal at (5,2), past the last ceiling (9.5,-5 lies on no floor slab of Duplex, so §10 leaves it plan only), over the Level 1 floor slab and under the STR slab, is PLACED at the slab soffit
        const dxfT = path.join(TMP, 'XT-101.dxf'), dbT = path.join(TMP, 'x_term.db'); fs.copyFileSync(fedA, dbT);
        fs.writeFileSync(dxfT, sheetDxf({ off: [100, 200], grid: GRIDSHEET, pieces: [PCS.P1], terminals: [[5, 2, 'DIFFUSER_SUPPLY'], [1.5, -2, 'DIFFUSER_SUPPLY']] }));
        sh([MAINS, dbT, dxfT, '--sheet-meta=' + JSON.stringify({ number: 'XT-101', revision: 'A', storeys: ['Level 1'] })]);
        const dtt = new Database(dbT, { readonly: true }), strS = rowsOf(dtt, 'SELECT minZ FROM element_world_bbox WHERE guid=?', [STR_SLAB])[0].minZ; dtt.close();
        const XTW = walkA(dbT), xtp = (XTW.r.placements || []).filter(p => p.prov === 'drawn:terminal'), xte = xtp.filter(p => p.exposed), xtl = L1(XTW.lines, /§WALK-MAINS-EXPOSED/);
        ok('X1e a drawn terminal past the last ceiling (5,2) is PLACED at the underside of the STR slab (' + strS.toFixed(3) + '), labelled exposed; the terminal under a ceiling (1.5,-2) still hangs from the ceiling lower face', xte.length === 1 && near(xte[0].z, strS, 0.002) && xte[0].heightBasis === 'exposed-under-structure' && xte[0].heightLabel === 'exposed, height provisional' && xte[0].host === STR_SLAB && kv(xtl, 'terminals') === '1' && xtp.length === 2 && xtp.filter(p => !p.exposed).every(p => /^ceiling:/.test(p.heightBasis) && p.z < strS),
          'placed drawn terminals=' + xtp.length + ' exposed=' + xte.length + ' z=' + xtp.map(p => p.z.toFixed(3) + (p.exposed ? '(exposed)' : '')).join(',') + ' | ' + xtl.slice(0, 120));
        // RED: row removed from the DB: stays plan only
        const dbXN = path.join(TMP, 'x_acmv_norule.db'); fs.copyFileSync(dbXM, dbXN); { const d0 = new SQL.Database(new Uint8Array(fs.readFileSync(dbXN))); d0.run('DELETE FROM drawn_height_rule'); fs.writeFileSync(dbXN, Buffer.from(d0.export())); d0.close(); }
        const XN = walkA(dbXN), xn = XN.r.drawn, exN = XN.lines.filter(l => /§WALK-MAINS-EXPOSED/.test(l))[0] || '';
        ok('X1 RED: with the row removed, the same pieces stay plan only (E1 no ceiling, E3 no void): pieces=0 terminals=0 rule=none, placed=1 planOnly=4', xn.pieces[0].z == null && xn.pieces[2].z == null && kv(exN, 'pieces') === '0' && kv(exN, 'terminals') === '0' && kv(exN, 'rule') === 'none' && xn.known.length === 1 && xn.planOnly.length === 4, 'known=' + xn.known.length + ' planOnly=' + xn.planOnly.length + ' ' + exN.slice(0, 120));
        // X3 structure-above: E5 is inside the L roof's BOX but in its notch
        const poly = [[20, 0], [30, 0], [30, 4], [25, 4], [25, 8], [20, 8]], inPoly = (x, y) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { if ((poly[i][1] > y) !== (poly[j][1] > y) && x < (poly[j][0] - poly[i][0]) * (y - poly[i][1]) / (poly[j][1] - poly[i][1]) + poly[i][0]) c = !c; } return c; };
        const lrw = rowsOf(xdb, 'SELECT minX, maxX, minY, maxY FROM element_world_bbox WHERE guid=?', [XS.LROOF])[0], e5 = px('E5'), inBox = e5.mx >= lrw.minX && e5.mx <= lrw.maxX && e5.my >= lrw.minY && e5.my <= lrw.maxY;
        ok('X3 structure-above uses the OUTLINE: E5 midpoint (' + e5.mx.toFixed(1) + ',' + e5.my.toFixed(1) + ') is inside the L roof\'s box but outside its outline (independent polygon test), so it is not "under" it: plan only', inBox && !inPoly(e5.mx, e5.my) && e5.z == null, 'inBox=' + inBox + ' inPolygon=' + inPoly(e5.mx, e5.my) + ' E5 z=' + e5.z + ' why=' + e5.why);
        const XB = walkA(dbXM, { drawnBoxOnly: true }), xb = XB.r.drawn;
        ok('X3 RED: a box-only test (witness control) would say E5 is under the L roof and give it the soffit ' + bbX(XS.LROOF).minZ.toFixed(3), xb && xb.pieces[4].z != null && near(xb.pieces[4].z, bbX(XS.LROOF).minZ, 0.002) && xb.pieces[4].structure === XS.LROOF, 'box-only E5 z=' + (xb && xb.pieces[4].z));
      }

      // ---- FP on X: items Q1 in the L slab\'s notch (box yes, outline no), Q2 on the L slab, Q3 on the STR GROUND floor slab F (second file, differently named storey, same elevation)
      const XQ = [[7, 6, 'EXTINGUISHER FOAM 9L'], [2, 2, 'EXTINGUISHER FOAM 9L'], [16, 4, 'EXTINGUISHER FOAM 9L']];
      const dxfXF = path.join(TMP, 'XF-201.dxf'); fs.writeFileSync(dxfXF, sheetDxf({ off: [100, 200], grid: XGS, pieces: [], terminals: [], equip: XQ }));
      const dbXF = path.join(TMP, 'x_fp.db'); fs.copyFileSync(fedX, dbXF);
      const mF = sh([MAINS, dbXF, dxfXF, '--sheet-meta=' + JSON.stringify({ number: 'XF-201', revision: 'A', storeys: ['Level 1'] })]);
      log(mF.split('\n').filter(l => /§MAINS-(TO-DB|EQUIP-TO-DB|STOREYS|NO-CENTRELINE)/.test(l)).map(l => '  tool ' + l.slice(0, 260)).join('\n'));
      const walkP = (file, extra) => { const buf = new Uint8Array(fs.readFileSync(file)); return logsOf(() => H.walkLive(SQL, stack, 'FP', buf, 'Duplex', [], extra || {})); };
      const XFW = walkP(dbXF), xfw = XFW.r, xfl = L1(XFW.lines, /§FP-EQUIP placed=/), em = L1(XFW.lines, /§STOREY-ELEV-MATCH set=Level 1/);
      log('  X FP walk: ' + XFW.lines.filter(l => /§FP-EQUIP|§STOREY-ELEV|§WALK-AREAHOST/.test(l)).map(l => l.slice(0, 330)).join('\n             '));
      const fops = xfw.drawn ? stack.DW.drawnOps(xfw.drawn) : [], fI = i => fops.find(o => o.params._dw.item === i);
      if (fops.length !== 3) incon('X*FP', 'expected 3 FP ops, got ' + fops.length + ' | ' + xfl);
      else {
        const lsw = rowsOf(xdb, 'SELECT minX, maxX, minY, maxY FROM element_world_bbox WHERE guid=?', [XS.LSLAB])[0], lpoly = [[0, 0], [10, 0], [10, 4], [5, 4], [5, 8], [0, 8]];
        const inP = (x, y) => { let c = false; for (let i = 0, j = lpoly.length - 1; i < lpoly.length; j = i++) { if ((lpoly[i][1] > y) !== (lpoly[j][1] > y) && x < (lpoly[j][0] - lpoly[i][0]) * (y - lpoly[i][1]) / (lpoly[j][1] - lpoly[i][1]) + lpoly[i][0]) c = !c; } return c; };
        const q1in = XQ[0][0] >= lsw.minX && XQ[0][0] <= lsw.maxX && XQ[0][1] >= lsw.minY && XQ[0][1] <= lsw.maxY, f = bbX(XS.F), MOUNT = 1.2;
        const d1 = fI(1).params._dw, d2 = fI(2).params._dw, d3 = fI(3).params._dw;
        ok('X3 FP floor uses the OUTLINE: Q1 (7,6) is inside the L slab\'s box but outside its outline (independent polygon test), so no slab is under it; Q2 (2,2) on the slab takes it', q1in && !inP(7, 6) && inP(2, 2) && d1.floor === null && d2.floor === XS.LSLAB, 'Q1 inBox=' + q1in + ' inPolygon=' + inP(7, 6) + ' floor=' + d1.floor + ' | Q2 floor=' + d2.floor);
        ok('X5 the item with no slab outline under it (Q1) takes the set storey\'s STATED elevation as its floor (0), labelled "floor = storey elevation, no slab under", anchor = floor + ' + MOUNT + '; counted floorFromStoreyElev=1', d1.floorBasis === 'storey-elevation' && d1.floorLabel === 'floor = storey elevation, no slab under' && near(d1.floorZ, 0, 1e-9) && near(fI(1).params.placement.z, MOUNT, 0.0005) && kv(xfl, 'floorFromStoreyElev') === '1' && kv(xfl, 'noFloor') === '0', xfl.slice(0, 260));
        ok('X4d storey match by ELEVATION: Q3 (16,4) sits on the STR GROUND slab F (top ' + f.maxZ.toFixed(3) + '), a floor of the second file\'s differently named storey at Level 1\'s elevation; it is found, and the log names the matched STR storey', d3.floor === XS.F && near(d3.floorZ, f.maxZ, 0.002) && d3.floorBasis === 'slab' && /matched=\["STR GROUND@0\.000\[STR:1\]"\]/.test(em), 'Q3 floor=' + d3.floor + ' floorZ=' + d3.floorZ + ' | ' + em.slice(0, 220));
        // RED: STR GROUND's stated elevation moved out of tolerance -> not the same storey -> name-only behaviour: the slab is not seen
        const dbXS = path.join(TMP, 'x_fp_shift.db'); fs.copyFileSync(dbXF, dbXS); { const d0 = new SQL.Database(new Uint8Array(fs.readFileSync(dbXS))); d0.run("UPDATE storey_elevation SET placement_z_m=0.30 WHERE name='STR GROUND'"); fs.writeFileSync(dbXS, Buffer.from(d0.export())); d0.close(); }
        const XS2 = walkP(dbXS), fo2 = XS2.r.drawn ? stack.DW.drawnOps(XS2.r.drawn) : [], q3 = fo2.find(o => o.params._dw.item === 3);
        ok('X4d RED: with STR GROUND 0.30 m off Level 1 (outside +/-0.05 m) it is not matched, as a name-only filter would: Q3 does not see slab F and falls back to the storey elevation', !!q3 && q3.params._dw.floor === null && q3.params._dw.floorBasis === 'storey-elevation' && kv(L1(XS2.lines, /§FP-EQUIP placed=/), 'floorFromStoreyElev') === '2', 'Q3 floor=' + (q3 && q3.params._dw.floor) + ' ' + L1(XS2.lines, /§FP-EQUIP placed=/).slice(0, 200));
        // X3 RED: box-only says Q1 is under the L slab
        const XFB = walkP(dbXF, { drawnBoxOnly: true }), fb = XFB.r.drawn ? stack.DW.drawnOps(XFB.r.drawn) : [], b1 = fb.find(o => o.params._dw.item === 1);
        ok('X3 RED: a box-only test (witness control) would say Q1 is under the L slab and give it that slab as its floor', !!b1 && b1.params._dw.floor === XS.LSLAB, 'box-only Q1 floor=' + (b1 && b1.params._dw.floor));
      }

      // ---- X6: wording
      const dxfE6 = path.join(TMP, 'FP-E6.dxf'), dbE6 = path.join(TMP, 'x_e6.db'); fs.copyFileSync(fedX, dbE6);
      fs.writeFileSync(dxfE6, sheetDxf({ off: [100, 200], grid: XGS, pieces: [], terminals: [], equip: [[2, 2, 'EXTINGUISHER FOAM 9L']] }));
      const m6 = sh([MAINS, dbE6, dxfE6, '--sheet-meta=' + JSON.stringify({ number: 'FP-E6', revision: 'A', storeys: ['Level 1'] })]);
      const l6 = L1(m6.split('\n'), /§MAINS-TO-DB sheets=/), n6 = L1(m6.split('\n'), /§MAINS-NO-CENTRELINE/);
      const dxfR = path.join(TMP, 'XR.dxf'), dbR = path.join(TMP, 'x_ref.db'); fs.copyFileSync(fedX, dbR);
      fs.writeFileSync(dxfR, sheetDxf({ off: [100, 200], grid: { u: [], v: [] }, pieces: [[1, 2, 5, 2]], terminals: [] }));
      const mR = sh([MAINS, dbR, dxfR, '--sheet-meta=' + JSON.stringify({ number: 'XR', revision: 'A', storeys: ['Level 1'] })]), lR = L1(mR.split('\n'), /§MAINS-TO-DB sheets=/);
      ok('X6 a sheet with no centreline layer for the discipline is counted noCentreline, not refused: "refused=0 noCentreline=1" and the line says "no centreline layer for this discipline"', /refused=0 noCentreline=1 /.test(l6) && /no centreline layer for this discipline/.test(n6) && !/refused/.test(n6.replace('not refused', '')), l6.slice(0, 160) + ' | ' + n6.slice(0, 160));
      ok('X6 RED: a real refusal (a run sheet with no grid to fit) is still "refused": refused=1 noCentreline=0', /refused=1 noCentreline=0 /.test(lR), lR.slice(0, 160));

      // ---- X2: sprinklered
      const baseFP = path.join(TMP, 'x2_base.db'); fs.copyFileSync(fedA, baseFP);
      const setSpr = (v, from) => { const dst = path.join(TMP, 'x2_' + v + '.db'); fs.copyFileSync(from || fedA, dst); sh([MAINS, dst, '--sprinklered=' + v]); return dst; };
      const heads = w => (w.placements || []).filter(p => /FireSuppressionTerminal|Sprinkler/i.test(p.ifc_class || '') && !/^drawn:/.test(p.prov || ''));
      H.openBuildingRules(SQL, stack, 'Duplex');
      const B0 = walkP(baseFP), h0 = heads(B0.r).length, tot0 = B0.r.placed + B0.r.provisional;
      const U = walkP(setSpr('unknown')), N = walkP(setSpr('no')), Y = walkP(setSpr('yes'));
      const sl = r => L1(r.lines, /§FP-SPRINKLERED/);
      ok('X2 sprinklered=unknown turns every band sprinkler head off (base walk ' + h0 + ' heads on all storeys -> 0), logged value=unknown bandHeadsOff=' + h0 + '; the totals follow (placed+provisional drops by exactly the heads)', h0 > 0 && heads(U.r).length === 0 && kv(sl(U), 'value') === 'unknown' && kv(sl(U), 'bandHeadsOff') === String(h0) && (U.r.placed + U.r.provisional) === tot0 - h0, 'base heads=' + h0 + ' unknown heads=' + heads(U.r).length + ' | ' + sl(U).slice(0, 140));
      ok('X2b sprinklered=no does the same; sprinklered=yes is today\'s band behaviour (all ' + h0 + ' heads kept, bandHeadsOff=0)', heads(N.r).length === 0 && kv(sl(N), 'bandHeadsOff') === String(h0) && heads(Y.r).length === h0 && kv(sl(Y), 'bandHeadsOff') === '0' && (Y.r.placed + Y.r.provisional) === tot0, 'no heads=' + heads(N.r).length + ' yes heads=' + heads(Y.r).length);
      ok('X2 RED: with no row set nothing changes (resident non-regression): same head count and totals as the base walk, no §FP-SPRINKLERED line', !B0.lines.some(l => /§FP-SPRINKLERED/.test(l)) && heads(B0.r).length === h0 && h0 === (process.env.DW_NO_RULES_PATCH ? 51 : 10), 'base heads=' + h0 + ' (Duplex; 51 before DISC_WALK_BAND_NO_HOST.md §12, 10 with it: its Terminal-borrowed heads are re-anchored to this fixture\'s floors and placed only on a host, W-BAND-REANCHOR; DW_NO_RULES_PATCH=1 gives back 51)');
      // not inferred from drawn equipment: a building with drawn equipment AND unknown has heads off everywhere (incl. the storey no sheet covers) while the drawn items are still placed
      const dbU2 = path.join(TMP, 'x2_eq_unknown.db'), dxfU2 = path.join(TMP, 'FP-U2.dxf'); fs.copyFileSync(fedA, dbU2);
      fs.writeFileSync(dxfU2, sheetDxf({ off: [100, 200], grid: GRIDSHEET, pieces: [], terminals: [], equip: [[1.5, -2, 'EXTINGUISHER FOAM 9L'], [6, -14, 'FIRE CABINET 1']] }));
      sh([MAINS, dbU2, dxfU2, '--sheet-meta=' + JSON.stringify({ number: 'FP-U2', revision: 'A', storeys: ['Level 1'] }), '--sprinklered=unknown']);
      const U2 = walkP(dbU2), eqU = L1(U2.lines, /§FP-EQUIP placed=/);
      ok('X2c drawn equipment is present AND sprinklered=unknown: heads are off on EVERY storey (not only the covered one) and the drawn items are still placed; the answer is a stored fact, never inferred from the equipment', heads(U2.r).length === 0 && kv(eqU, 'placed') === '2' && kv(sl(U2), 'bandHeadsOff') === String(h0), eqU.slice(0, 160) + ' | ' + sl(U2).slice(0, 120));
      const tool2 = sh([MAINS, path.join(TMP, 'x2_unknown.db'), '--sprinklered=unknown']), dbR2 = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(TMP, 'x2_unknown.db'))));
      ok('X2d the answer is stored as project_metadata fp_sprinklered (the table that already holds per-building facts), set by mains_to_db --sprinklered, logged', q(dbR2, "SELECT value FROM project_metadata WHERE key='fp_sprinklered'")[0][0] === 'unknown' && /§MAINS-SPRINKLERED fp_sprinklered=unknown/.test(tool2), L1(tool2.split('\n'), /§MAINS-SPRINKLERED/).slice(0, 140)); dbR2.close();
      // Clinic resident, if present
      const clinicDb = path.join(M, 'Clinic_ARC.db');
      if (fs.existsSync(clinicDb) && fs.statSync(clinicDb).size > 10240) {
        H.openBuildingRules(SQL, stack, 'Clinic');
        const wc = file => logsOf(() => H.walkLive(SQL, stack, 'FP', new Uint8Array(fs.readFileSync(file)), 'Clinic', [], {}));
        const C0 = wc(clinicDb), c0 = heads(C0.r).length, cu = path.join(TMP, 'clinic_unk.db'); fs.copyFileSync(clinicDb, cu); sh([MAINS, cu, '--sprinklered=unknown']);
        const CU = wc(cu);
        log('  X2 Clinic: base heads=' + c0 + ' unknown heads=' + heads(CU.r).length + ' | ' + sl(CU).slice(0, 120));
        if (!c0) incon('X2 Clinic', 'the Clinic base FP walk has no sprinkler heads: nothing judged'); else ok('X2e Clinic resident: no row = base heads (' + c0 + '), none of its FP lines mention sprinklered; unknown = 0 heads', !C0.lines.some(l => /§FP-SPRINKLERED/.test(l)) && heads(CU.r).length === 0 && kv(sl(CU), 'bandHeadsOff') === String(c0), 'base=' + c0 + ' unknown=' + heads(CU.r).length);
        H.openBuildingRules(SQL, stack, 'Duplex');
      } else incon('X2 Clinic', 'Clinic_ARC.db absent or a stub: Duplex judged alone');

      // ---- X7: the drawn-only film filter, on the Duplex drawn walk (D) : display only
      H.openBuildingRules(SQL, stack, 'Duplex');
      const walkD = file => logsOf(() => H.walkLive(SQL, stack, 'ACMV', new Uint8Array(fs.readFileSync(file)), 'Duplex', [], {}));
      const D7 = walkD(dbDrawn), w7 = D7.r, opsBefore = JSON.stringify(stack.DW.drawnOps(w7.drawn)), pl = w7.placements || [], nonDrawn = pl.filter(p => !/^drawn:/.test(p.prov || '')), drawnP = pl.filter(p => /^drawn:/.test(p.prov || ''));
      const before = { placed: w7.placed, prov: w7.provisional, n: pl.length, known: w7.drawn.known.length, plan: w7.drawn.planOnly.length };
      if (!nonDrawn.length || !drawnP.length) incon('X7', 'the Duplex drawn walk has ' + nonDrawn.length + ' non-drawn and ' + drawnP.length + ' drawn placements: nothing to filter');
      else {
        const vis = {}; pl.forEach((p, i) => { vis[i] = true; }); const calls = [];
        const setVis = (d, i, v) => { calls.push([d, i, v]); const ch = vis[i] !== v; vis[i] = v; return ch; };
        const V = logsOf(() => stack.DW.setDrawnOnlyView(true, { ACMV: pl }, { ACMV: w7.drawn }, setVis));
        const hiddenIdx = Object.keys(vis).filter(i => !vis[i]).map(Number), expectIdx = pl.map((p, i) => /^drawn:/.test(p.prov || '') ? -1 : i).filter(i => i >= 0);
        const vl = L1(V.lines, /§VIEW-DRAWN-ONLY/);
        ok('X7 the drawn-only view hides exactly the non-drawn walk devices (' + nonDrawn.length + ') and shows what the drawings state (' + drawnP.length + ' drawn terminals + ' + w7.drawn.known.length + ' drawn runs); logged', JSON.stringify(hiddenIdx) === JSON.stringify(expectIdx) && kv(vl, 'on') === 'true' && kv(vl, 'hidden') === String(nonDrawn.length) && kv(vl, 'shown') === String(drawnP.length + w7.drawn.known.length) && V.r.hidden === nonDrawn.length && calls.every(c => c[2] === false), vl.slice(0, 160));
        ok('X7b display only: the op-log ops, placed/provisional totals and every list are identical before and after (op-log string equal, ' + before.n + ' placements, placed ' + before.placed + ')', JSON.stringify(stack.DW.drawnOps(w7.drawn)) === opsBefore && w7.placed === before.placed && w7.provisional === before.prov && (w7.placements || []).length === before.n && w7.drawn.known.length === before.known && w7.drawn.planOnly.length === before.plan, 'ops equal=' + (JSON.stringify(stack.DW.drawnOps(w7.drawn)) === opsBefore));
        const V0 = logsOf(() => stack.DW.setDrawnOnlyView(false, { ACMV: pl }, { ACMV: w7.drawn }, setVis));
        ok('X7c turning it off restores every device (all visible again) and still changes no count', Object.keys(vis).every(i => vis[i]) && V0.r.hidden === 0 && kv(L1(V0.lines, /§VIEW-DRAWN-ONLY/), 'on') === 'false' && w7.placed === before.placed && (w7.placements || []).length === before.n, L1(V0.lines, /§VIEW-DRAWN-ONLY/).slice(0, 140));
      }

      // ---- Y: floor first for items with no ceiling (prompts/DISC_WALK_DRAWN_INTEGRATION.md §10). Fixtures Y1-Y3 (public, written here): an ARC file (storeys, a far ceiling, the grid) + a STR file (floors, roof), federated; storeys pair by elevation.
      // ISSUES IT EXPOSES: (Y1) a lower storey taking the upper storey's own floor slab as "structure above" so a no-ceiling piece is called ambiguous and left plan only; (Y2) no floor of the set under an item (double-height hall) leaving it plan only; (Y3) an item with no floor under it on any storey still given a height;
      // (Y4) a height with no per-item trace of the floor and structure it came from; (Y5) the floor-first rule changing items that sit under a ceiling.
      {
        const YGS = { u: [['A', 0, -1, 13], ['B', 6, -1, 13], ['C', 12, -1, 13]], v: [['1', 0, -1, 21], ['2', 4, -1, 21], ['3', 12, -1, 21]] };
        const Y = { A1: guid(1301), B1: guid(1302), R1: guid(1303), G2: guid(1311), L2: guid(1312), R2: guid(1313), A3: guid(1321), R3: guid(1322), CE: guid(1399) };
        const arcY = (nm, s0, s1) => ifcDoc({ storeyO: [0, 0, s0[1]], storeyName: s0[0], extra: { name: s1[0], o: [0, 0, s1[1]] }, tag: nm, boxes: [{ cls: 'IfcCovering', name: 'Far ceiling', box: [40, 0, s0[1] + 2.6, 45, 8, s0[1] + 2.7], pre: '.CEILING.', gid: Y.CE }, { cls: 'IfcSpace', name: 'Far room', box: [40, 10, s0[1], 44, 14, s0[1] + 2.6], pre: '', gid: guid(1398) }], grid: XGRID('Grid ' + nm, guid(1350)) });
        const strY = (nm, s0, s1, boxes) => ifcDoc({ gsh: 500, gx: 500, storeyO: [0, 0, s0[1]], storeyName: s0[0], extra: { name: s1[0], o: [0, 0, s1[1]] }, tag: nm, boxes: boxes });
        const slab = (name, box, pre, gid, st) => ({ cls: 'IfcSlab', name: name, box: box, pre: pre, gid: gid, st: st });
        const yBuild = (key, arcDoc, strDoc, set, pieces, terms) => {
          const a = path.join(TMP, 'ARC_' + key + '.ifc'), b = path.join(TMP, 'STR_' + key + '.ifc'), fed = path.join(TMP, 'fed_' + key + '.db'), dx = path.join(TMP, key + '-101.dxf'), out = path.join(TMP, 'acmv_' + key + '.db');
          fs.writeFileSync(a, arcDoc); fs.writeFileSync(b, strDoc);
          sh([TOOL, '--ifc', a, '--federate', b, '--federate-disc', 'STR', '-o', fed]);
          if (!fs.existsSync(fed)) return null;
          fs.writeFileSync(dx, sheetDxf({ off: [100, 200], grid: YGS, pieces: pieces, terminals: terms || [] })); fs.copyFileSync(fed, out);
          const m = sh([MAINS, out, dx, '--sheet-meta=' + JSON.stringify({ number: key + '-101', revision: 'A', storeys: set })]);
          return { fed: fed, db: out, sheet: key + '-101', tool: m };
        };
        const yWalk = (stk, file) => { const buf = new Uint8Array(fs.readFileSync(file)); return logsOf(() => H.walkLive(SQL, stk, 'ACMV', buf, 'Duplex', [], {})); };
        const itemLines = lines => lines.filter(l => /§WALK-EXPOSED-ITEM/.test(l));
        const preFile = path.join(M, '_pre_disc_walker_tmp.js');
        const bb = (fedPath, g) => { const d = new Database(fedPath, { readonly: true }); try { return rowsOf(d, 'SELECT minZ, maxZ FROM element_world_bbox WHERE guid=?', [g])[0]; } finally { d.close(); } };
        const Y1 = yBuild('Y1', arcY('ARC_Y1', ['Level A', 0], ['Level B', -0.3]), strY('STR_Y1', ['STR GROUND', 0], ['STR LOW', -0.3], [
          slab('STR A floor', [0, 0, -0.2, 10, 4, 0], '.FLOOR.', Y.A1), slab('STR B floor', [0, 2, -0.5, 10, 8, -0.3], '.FLOOR.', Y.B1, 'x'), slab('STR roof', [0, 0, 3.0, 10, 8, 3.3], '.ROOF.', Y.R1)]),
          ['Level A', 'Level B'], [[3, 3, 7, 3], [3, 6, 7, 6]]);
        const Y2 = yBuild('Y2', arcY('ARC_Y2', ['Ground', 0], ['Level 1', 4]), strY('STR_Y2', ['STR G', 0], ['STR L1', 4], [
          slab('STR ground floor', [0, 0, -0.2, 10, 8, 0], '.FLOOR.', Y.G2), slab('STR gallery floor', [0, 0, 3.8, 10, 3, 4.0], '.FLOOR.', Y.L2, 'x'), slab('STR hall roof', [0, 0, 8.0, 10, 8, 8.3], '.ROOF.', Y.R2, 'x')]),
          ['Level 1'], [[3, 1.5, 7, 1.5], [3, 6, 7, 6]]);
        const Y3 = yBuild('Y3', arcY('ARC_Y3', ['Level A', 0], ['Level B', -0.3]), strY('STR_Y3', ['STR GROUND', 0], ['STR LOW', -0.3], [
          slab('STR A floor', [0, 0, -0.2, 10, 4, 0], '.FLOOR.', Y.A3), slab('STR wide roof', [0, 0, 3.0, 25, 8, 3.3], '.ROOF.', Y.R3)]),
          ['Level A', 'Level B'], [[3, 2, 7, 2], [17, 4, 19, 4]]);
        if (!Y1 || !Y2 || !Y3) incon('Y*', 'a Y federation was not written: Y1=' + !!Y1 + ' Y2=' + !!Y2 + ' Y3=' + !!Y3);
        else {
          H.openBuildingRules(SQL, stack, 'Duplex');
          const W1 = yWalk(stack, Y1.db), W2 = yWalk(stack, Y2.db), W3 = yWalk(stack, Y3.db);
          const d1 = W1.r.drawn, d2 = W2.r.drawn, d3 = W3.r.drawn;
          log('  Y walks:\n          ' + [W1, W2, W3].map(W => W.lines.filter(l => /§WALK-EXPOSED-ITEM|§WALK-MAINS-EXPOSED|§WALK-MAINS-PLANONLY/.test(l)).map(l => l.slice(0, 300)).join('\n          ')).join('\n          '));
          if (!d1 || !d2 || !d3) incon('Y*', 'a Y walk holds no drawn record: ' + [d1, d2, d3].map(d => !!d));
          else {
            const a1 = bb(Y1.fed, Y.A1), b1 = bb(Y1.fed, Y.B1), r1 = bb(Y1.fed, Y.R1), g2 = bb(Y2.fed, Y.G2), l2 = bb(Y2.fed, Y.L2), r2 = bb(Y2.fed, Y.R2), r3 = bb(Y3.fed, Y.R3), a3 = bb(Y3.fed, Y.A3);
            const sx1 = L1(W1.lines, /§WALK-MAINS-EXPOSED/), sx2 = L1(W2.lines, /§WALK-MAINS-EXPOSED/), sx3 = L1(W3.lines, /§WALK-MAINS-EXPOSED/);
            ok('Y1 self-hit: set {Level A 0.0, Level B -0.3}, A\'s STR floor overlapping B\'s in plan: the piece over both (5,3) takes the roof soffit (' + r1.minZ.toFixed(3) + '), floor A (top ' + a1.maxZ.toFixed(3) + '), and never A\'s slab (lower ' + a1.minZ.toFixed(3) + ') as structure; the piece over B\'s floor only (5,6) takes the same soffit from floor B (top ' + b1.maxZ.toFixed(3) + ')',
              d1.pieces[0].z != null && near(d1.pieces[0].z, r1.minZ, 0.002) && d1.pieces[0].structure === Y.R1 && d1.pieces[0].structure !== Y.A1 && d1.pieces[1].z != null && near(d1.pieces[1].z, r1.minZ, 0.002) && d1.pieces[1].structure === Y.R1 && kv(sx1, 'pieces') === '2' && d1.planOnly.length === 0,
              'z=' + d1.pieces.map(p => p.z && p.z.toFixed(3)) + ' structure=' + d1.pieces.map(p => p.structure === Y.R1 ? 'roof' : p.structure === Y.A1 ? 'A-SLAB' : p.structure) + ' | ' + sx1.slice(0, 160));
            ok('Y2 floor below: set {Level 1 @4.0}: the piece over the gallery (5,1.5) stands on the Level 1 slab (top ' + l2.maxZ.toFixed(3) + ', set) and takes the hall roof (' + r2.minZ.toFixed(3) + '); the piece over the double-height hall (5,6), no Level 1 floor there, stands on the ground slab (top ' + g2.maxZ.toFixed(3) + ', below the set) and takes the same roof: floorBelowSet=1',
              d2.pieces[0].z != null && near(d2.pieces[0].z, r2.minZ, 0.002) && d2.pieces[1].z != null && near(d2.pieces[1].z, r2.minZ, 0.002) && d2.pieces[1].structure === Y.R2 && kv(sx2, 'floorBelowSet') === '1' && kv(sx2, 'noFloorAnyStorey') === '0' && kv(sx2, 'pieces') === '2',
              'z=' + d2.pieces.map(p => p.z && p.z.toFixed(3)) + ' | ' + sx2.slice(0, 160));
            ok('Y3 no floor under the item on any storey: the piece at (18,4) is under the wide roof (soffit ' + r3.minZ.toFixed(3) + ') but over no slab: plan only with a reason, noFloorAnyStorey=1; the piece over A\'s floor (5,2) still takes the roof',
              d3.pieces[1].z == null && /no floor slab/.test(d3.pieces[1].why || '') && d3.pieces[0].z != null && near(d3.pieces[0].z, r3.minZ, 0.002) && kv(sx3, 'noFloorAnyStorey') === '1' && kv(sx3, 'pieces') === '1' && d3.planOnly.length === 1,
              'z=' + d3.pieces.map(p => p.z && p.z.toFixed(3)) + ' why=' + d3.pieces[1].why + ' | ' + sx3.slice(0, 160));
            // Y4: one line per no-ceiling item, values against the oracle (element_world_bbox)
            const i1 = itemLines(W1.lines), i2 = itemLines(W2.lines), i3 = itemLines(W3.lines);
            const f3 = v => v.toFixed(3);
            const has4 = (lines, sheet, id, fl, src, st, h) => lines.filter(l => l.indexOf('sheet=' + sheet + '#' + id + ' ') >= 0 && l.indexOf(' floor=' + fl + ' ') >= 0 && l.indexOf(' floorSource=' + src + ' ') >= 0 && l.indexOf(' structure=' + st + ' ') >= 0 && / height=(\S+)/.exec(l)[1] === h).length === 1;
            ok('Y4 the per-item detail line, one per no-ceiling item, carries floor@top, floorSource, structure class/discipline@lower and height, each equal to the oracle from element_world_bbox (Y1: floor A@' + f3(a1.maxZ) + ' set, floor B@' + f3(b1.maxZ) + ' set; Y2: floor Level 1@' + f3(l2.maxZ) + ' set, floor STR G (the slab\'s own storey)@' + f3(g2.maxZ) + ' below; Y3: floor Level A@' + f3(a3.maxZ) + ' set, none)',
              i1.length === 2 && i2.length === 2 && i3.length === 2 &&
              has4(i1, Y1.sheet, 'p1', 'Level A@' + f3(a1.maxZ), 'set', 'IfcSlab/STR@' + f3(r1.minZ), f3(r1.minZ)) && has4(i1, Y1.sheet, 'p2', 'Level B@' + f3(b1.maxZ), 'set', 'IfcSlab/STR@' + f3(r1.minZ), f3(r1.minZ)) &&
              has4(i2, Y2.sheet, 'p1', 'Level 1@' + f3(l2.maxZ), 'set', 'IfcSlab/STR@' + f3(r2.minZ), f3(r2.minZ)) && has4(i2, Y2.sheet, 'p2', 'STR G@' + f3(g2.maxZ), 'below', 'IfcSlab/STR@' + f3(r2.minZ), f3(r2.minZ)) &&
              has4(i3, Y3.sheet, 'p1', 'Level A@' + f3(a3.maxZ), 'set', 'IfcSlab/STR@' + f3(r3.minZ), f3(r3.minZ)) && i3.filter(l => l.indexOf('#p2 ') >= 0 && /floor=none floorSource=none structure=none height=none/.test(l)).length === 1,
              (i1.concat(i2, i3)).map(l => l.slice(l.indexOf('sheet='))).join(' || ').slice(0, 900));
            // RED + Y5 against the pre-change walker (9ea689c6)
            let preStack = null, perr = null;
            try {
              fs.writeFileSync(preFile, cp.execFileSync('git', ['-C', ROOT, 'show', '9ea689c6:modeller/disc_walker.js'], { maxBuffer: 1 << 26 }).toString());
              preStack = { DW: require(preFile), WalkRules: stack.WalkRules }; H.openBuildingRules(SQL, preStack, 'Duplex');
            } catch (e) { perr = e.message; }
            if (!preStack) incon('Y RED / Y5', 'the pre-change walker did not load: ' + perr);
            else {
              try {
                const P1 = yWalk(preStack, Y1.db), P3 = yWalk(preStack, Y3.db), p1 = P1.r.drawn, p3 = P3.r.drawn;
                ok('Y1 RED: the pre-change rule (9ea689c6) leaves the self-hit piece (5,3) plan only as "structure above in 2 storeys of the set" while the piece over B\'s floor only (5,6) is fine', !!p1 && p1.pieces[0].z == null && /structure above in 2 storeys/.test(p1.pieces[0].why || '') && p1.pieces[1].z != null, 'pre-change z=' + (p1 && p1.pieces.map(p => p.z)) + ' why=' + (p1 && p1.pieces[0].why));
                ok('Y3 RED: the pre-change rule gives the floorless piece (18,4) the roof soffit (' + r3.minZ.toFixed(3) + ') anyway', !!p3 && p3.pieces[1].z != null && near(p3.pieces[1].z, r3.minZ, 0.002), 'pre-change z=' + (p3 && p3.pieces.map(p => p.z)));
                // Y5: every item under a ceiling, on the X ceiling walk and the Duplex drawn walk, is byte-identical (z and basis) to the pre-change walker
                const cmp = (file) => { const nw = walkA(file), od = yWalk(preStack, file); const np = nw.r.drawn.pieces, op = od.r.drawn.pieces; let n = 0, same = 0; np.forEach((p, i) => { if (!p.ceiling) return; n++; if (op[i] && op[i].ceiling === p.ceiling && op[i].z === p.z && op[i].heightBasis === p.heightBasis) same++; });
                  const tn = (nw.r.placements || []).filter(p => p.prov === 'drawn:terminal' && !p.exposed), to = (od.r.placements || []).filter(p => p.prov === 'drawn:terminal' && !p.exposed); let tsame = 0; tn.forEach((p, i) => { if (to[i] && to[i].z === p.z && to[i].host === p.host) tsame++; });
                  return { n: n, same: same, tn: tn.length, tsame: tsame }; };
                const cx = cmp(dbXM), cd = cmp(dbDrawn);
                H.openBuildingRules(SQL, stack, 'Duplex');
                ok('Y5 items under a ceiling keep their heights byte-identical to the pre-change walker (z === and HeightBasis, per piece; ceiling terminals z and host): fixture X ' + cx.same + '/' + cx.n + ' pieces ' + cx.tsame + '/' + cx.tn + ' terminals, Duplex drawn walk ' + cd.same + '/' + cd.n + ' pieces ' + cd.tsame + '/' + cd.tn + ' terminals',
                  cx.n >= 2 && cx.same === cx.n && cx.tsame === cx.tn && cd.n >= 4 && cd.same === cd.n && cd.tsame === cd.tn && cd.tn >= 1, JSON.stringify({ X: cx, D: cd }));
              } finally { try { fs.unlinkSync(preFile); } catch (e) { /* absent */ } H.openBuildingRules(SQL, stack, 'Duplex'); }
            }
          }
        }

        // ---- R: on the roof surface (prompts/DISC_WALK_DRAWN_INTEGRATION.md §11, owner 2026-11-08 "On the roof surface"). Fixtures R1-R4 (public, written here): the Y federation shape, set {Roof L @3.2}.
        // ISSUES IT EXPOSES: (R1) a run on a low roof with nothing above left plan only; (R2) the rule putting a duct on an INDOOR floor whose roof is missing; (R3) "roof" decided by a name only, so an IfcRoof is missed; (R4) the roof rule firing before exposed-under-structure; (R5) the rule moving items that sit under a ceiling.
        {
          const RG = { A1: guid(1401), B1: guid(1402), C1: guid(1403), D1: guid(1404), U1: guid(1405) };
          const arcR = (nm, more) => ifcDoc({ storeyO: [0, 0, 0], storeyName: 'Level A', extra: { name: 'Roof L', o: [0, 0, 3.2] }, tag: nm, boxes: (more || []).concat([{ cls: 'IfcCovering', name: 'Far ceiling', box: [40, 0, 2.6, 45, 8, 2.7], pre: '.CEILING.', gid: guid(1498) }, { cls: 'IfcSpace', name: 'Far room', box: [40, 10, 0, 44, 14, 2.6], pre: '', gid: guid(1497) }]), grid: XGRID('Grid ' + nm, guid(1450)) });
          const strR = (nm, boxes) => ifcDoc({ gsh: 500, gx: 500, storeyO: [0, 0, 0], storeyName: 'STR G', extra: { name: 'STR RL', o: [0, 0, 3.2] }, tag: nm, boxes: boxes });
          const sl = (name, box, pre, gid, cls) => ({ cls: cls || 'IfcSlab', name: name, box: box, pre: pre, gid: gid, st: 'x' });
          const rBuild = (key, boxes, pieces, terms, arcBoxes) => {
            const a = path.join(TMP, 'ARC_' + key + '.ifc'), b = path.join(TMP, 'STR_' + key + '.ifc'), fed = path.join(TMP, 'fed_' + key + '.db'), dx = path.join(TMP, key + '-101.dxf'), out = path.join(TMP, 'acmv_' + key + '.db');
            fs.writeFileSync(a, arcR('ARC_' + key, arcBoxes)); fs.writeFileSync(b, strR('STR_' + key, boxes));
            sh([TOOL, '--ifc', a, '--federate', b, '--federate-disc', 'STR', '-o', fed]);
            if (!fs.existsSync(fed)) return null;
            fs.writeFileSync(dx, sheetDxf({ off: [100, 200], grid: YGS, pieces: pieces, terminals: terms || [] })); fs.copyFileSync(fed, out);
            const m = sh([MAINS, out, dx, '--sheet-meta=' + JSON.stringify({ number: key + '-101', revision: 'A', storeys: ['Roof L'] })]);
            return { fed: fed, db: out, sheet: key + '-101', tool: m };
          };
          const rWalk = (stk, file) => { const buf = new Uint8Array(fs.readFileSync(file)); return logsOf(() => H.walkLive(SQL, stk, 'ACMV', buf, 'Duplex', [], {})); };
          const bbR = (fedPath, g) => { const d = new Database(fedPath, { readonly: true }); try { return rowsOf(d, 'SELECT minZ, maxZ FROM element_world_bbox WHERE guid=?', [g])[0]; } finally { d.close(); } };
          const R1 = rBuild('R1', [sl('Roofing membrane TPO', [0, 0, 3.0, 10, 8, 3.4], '.FLOOR.', RG.A1)], [[3, 3, 7, 3]], [[8, 5, 'DIFFUSER_SUPPLY']]);
          const R2 = rBuild('R2', [sl('Floor finish', [0, 0, 3.0, 10, 8, 3.2], '.FLOOR.', RG.B1)], [[3, 3, 7, 3]]);
          const R3 = rBuild('R3', [sl('Cover', [0, 0, 3.0, 10, 8, 3.4], '.FLAT_ROOF.', RG.C1, 'IfcRoof')], [[3, 3, 7, 3]]);
          const R6 = rBuild('R6', [sl('Floor:SLAB 200', [0, 0, 2.85, 10, 8, 3.05], '.FLOOR.', guid(1406))], [[3, 3, 7, 3]], null, [sl('Basic Roof:COMBO ROOFING_150mm', [0, 0, 3.05, 10, 8, 3.8], '.FLOOR.', guid(1407))]);
          const R4 = rBuild('R4', [sl('Roofing membrane', [0, 0, 3.0, 10, 8, 3.4], '.FLOOR.', RG.D1), sl('Deck above', [0, 0, 6.0, 10, 8, 6.3], '.FLOOR.', RG.U1)], [[3, 3, 7, 3]]);
          if (!R1 || !R2 || !R3 || !R4 || !R6) incon('R*', 'an R federation was not written: ' + [R1, R2, R3, R4].map(x => !!x));
          else {
            H.openBuildingRules(SQL, stack, 'Duplex');
            const V1 = rWalk(stack, R1.db), V2 = rWalk(stack, R2.db), V3 = rWalk(stack, R3.db), V4 = rWalk(stack, R4.db);
            log('  R walks:\n          ' + [V1, V2, V3, V4].map(W => W.lines.filter(l => /§WALK-EXPOSED-ITEM|§WALK-MAINS-ONROOF|§WALK-MAINS-PLANONLY/.test(l)).map(l => l.slice(0, 330)).join('\n          ')).join('\n          '));
            const e1 = V1.r.drawn, e2 = V2.r.drawn, e3 = V3.r.drawn, e4 = V4.r.drawn;
            if (!e1 || !e2 || !e3 || !e4) incon('R*', 'an R walk holds no drawn record');
            else {
              const t1 = bbR(R1.fed, RG.A1), t3 = bbR(R3.fed, RG.C1), u4 = bbR(R4.fed, RG.U1), f3 = v => v.toFixed(3);
              const on1 = L1(V1.lines, /§WALK-MAINS-ONROOF/), on2 = L1(V2.lines, /§WALK-MAINS-ONROOF/), on3 = L1(V3.lines, /§WALK-MAINS-ONROOF/), on4 = L1(V4.lines, /§WALK-MAINS-ONROOF/);
              const it = (W, id) => itemLinesR(W.lines).filter(l => l.indexOf('#' + id + ' ') >= 0);
              const itemLinesR = lines => lines.filter(l => /§WALK-EXPOSED-ITEM/.test(l));
              const term1 = (V1.r.placements || []).filter(p => p.prov === 'drawn:terminal');
              ok('R1 a run over a slab NAMED "Roofing membrane TPO" (class IfcSlab, PredefinedType FLOOR), nothing above, sits on the slab top (' + f3(t1.maxZ) + '): HeightBasis on-roof-surface, label "on roof, height provisional"; the drawn terminal over it too (terminals=1); the item line names structure=none surface=IfcSlab:roof@top height basis=on-roof-surface',
                e1.pieces[0].z != null && near(e1.pieces[0].z, t1.maxZ, 0.002) && e1.pieces[0].heightBasis === 'on-roof-surface' && e1.pieces[0].heightLabel === 'on roof, height provisional' && kv(on1, 'pieces') === '1' && kv(on1, 'terminals') === '1' && kv(on1, 'rule') === 'on-roof-surface' && kv(on1, 'notRoofNoStructure') === '0' &&
                it(V1, 'p1').length === 1 && it(V1, 'p1')[0].indexOf(' structure=none surface=IfcSlab:roof@' + f3(t1.maxZ) + ' height=' + f3(t1.maxZ) + ' basis=on-roof-surface') >= 0 && it(V1, 't0').length === 1 && /basis=on-roof-surface/.test(it(V1, 't0')[0]) && e1.planOnly.length === 0 && (term1.length === 0 || (term1.length === 1 && near(term1[0].z, t1.maxZ, 0.002) && term1[0].heightBasis === 'on-roof-surface')),
                'z=' + e1.pieces[0].z + ' | ' + on1.slice(0, 150) + ' | ' + (it(V1, 'p1')[0] || '').slice(-140) + ' | terminal placements=' + term1.length);
              // R1 RED: the row removed from the building DB (the rule travels in the DB), same run
              const r1x = path.join(TMP, 'acmv_R1_norow.db'); fs.copyFileSync(R1.db, r1x); const dbx = new SQL.Database(new Uint8Array(fs.readFileSync(r1x))); dbx.run("DELETE FROM drawn_height_rule WHERE role='roof_surface_height'"); fs.writeFileSync(r1x, Buffer.from(dbx.export())); dbx.close();
              const V1x = rWalk(stack, r1x), e1x = V1x.r.drawn;
              ok('R1 RED: with the row removed from drawn_height_rule the same run is plan only (no height), no §WALK-MAINS-ONROOF line', !!e1x && e1x.pieces[0].z == null && e1x.planOnly.length === 1 && !V1x.lines.some(l => /§WALK-MAINS-ONROOF/.test(l)), 'z=' + (e1x && e1x.pieces[0].z) + ' ' + (e1x && e1x.pieces[0].why));
              ok('R2 guard: a slab that is NOT a roof by class, PredefinedType or name ("Floor finish"), nothing above, stays plan only; notRoofNoStructure=1; never a duct on an indoor floor (a walk that places nothing is run twice by the harness, so its lines repeat)',
                e2.pieces[0].z == null && e2.planOnly.length === 1 && kv(on2, 'pieces') === '0' && kv(on2, 'notRoofNoStructure') === '1' && !it(V2, 'p1').some(l => /surface=/.test(l)) && it(V2, 'p1').length >= 1, on2.slice(0, 150) + ' | ' + (it(V2, 'p1')[0] || '').slice(-90));
              ok('R3 an IfcRoof element ("Cover", no roof word in its name, no slab under the run) under the run qualifies by class: z = its top (' + f3(t3.maxZ) + '), surface=IfcRoof:class',
                e3.pieces[0].z != null && near(e3.pieces[0].z, t3.maxZ, 0.002) && e3.pieces[0].heightBasis === 'on-roof-surface' && kv(on3, 'pieces') === '1' && it(V3, 'p1').length === 1 && it(V3, 'p1')[0].indexOf('surface=IfcRoof:class@' + f3(t3.maxZ)) >= 0, 'z=' + e3.pieces[0].z + ' | ' + (it(V3, 'p1')[0] || '').slice(-120));
              ok('R4 order: the same run under STR structure above (deck lower face ' + f3(u4.minZ) + ') over a slab named "Roofing membrane" takes exposed-under-structure at the deck soffit, not on-roof; no surface= on its line; ONROOF pieces=0',
                e4.pieces[0].z != null && near(e4.pieces[0].z, u4.minZ, 0.002) && e4.pieces[0].heightBasis === 'exposed-under-structure' && kv(on4, 'pieces') === '0' && it(V4, 'p1').length === 1 && !/surface=/.test(it(V4, 'p1')[0]) && /structure=IfcSlab\/STR@/.test(it(V4, 'p1')[0]), 'z=' + e4.pieces[0].z + ' | ' + (it(V4, 'p1')[0] || '').slice(-110));
              {
                const V6 = rWalk(stack, R6.db), e6 = V6.r.drawn, roofTop = bbR(R6.fed, guid(1407)), deckTop = bbR(R6.fed, guid(1406)), it6 = itemLinesR(V6.lines).filter(l => l.indexOf('#p1 ') >= 0);
                ok('R6 (§11a) a non-roof STR deck "Floor:SLAB 200" (top ' + f3(deckTop.maxZ) + ') with a roof-named ARC build-up "Basic Roof:COMBO ROOFING_150mm" on top (top ' + f3(roofTop.maxZ) + '), nothing above: the run sits on the BUILD-UP top, not the deck top; the item line names the roofing surface',
                  e6.pieces[0].z != null && near(e6.pieces[0].z, roofTop.maxZ, 0.002) && !near(e6.pieces[0].z, deckTop.maxZ, 0.01) && e6.pieces[0].heightBasis === 'on-roof-surface' && kv(L1(V6.lines, /§WALK-MAINS-ONROOF/), 'pieces') === '1' && it6.length >= 1 && it6[0].indexOf('surface=IfcSlab:roof@' + f3(roofTop.maxZ)) >= 0, 'z=' + e6.pieces[0].z + ' | ' + (it6[0] || '').slice(-120));
                const r6x = path.join(TMP, 'acmv_R6_norow.db'); fs.copyFileSync(R6.db, r6x); const d6 = new SQL.Database(new Uint8Array(fs.readFileSync(r6x))); d6.run("DELETE FROM drawn_height_rule WHERE role='roof_surface_height'"); fs.writeFileSync(r6x, Buffer.from(d6.export())); d6.close();
                ok('R6 RED: with the row removed the same run is plan only', rWalk(stack, r6x).r.drawn.pieces[0].z == null, 'row removed');
              }
              // R5: items under a ceiling, byte-identical z against the 37130e8e walker (git show into a temp file)
              const preR = path.join(M, '_pre_disc_walker_r_tmp.js'); let preR_stack = null, perrR = null;
              try { fs.writeFileSync(preR, cp.execFileSync('git', ['-C', ROOT, 'show', '37130e8e:modeller/disc_walker.js'], { maxBuffer: 1 << 26 }).toString()); preR_stack = { DW: require(preR), WalkRules: stack.WalkRules }; H.openBuildingRules(SQL, preR_stack, 'Duplex'); } catch (e) { perrR = e.message; }
              if (!preR_stack) incon('R5', 'the 37130e8e walker did not load: ' + perrR);
              else {
                try {
                  const cmpR = file => { const nw = walkA(file), od = rWalk(preR_stack, file), np = nw.r.drawn.pieces, op = od.r.drawn.pieces; let n = 0, same = 0; np.forEach((p, i) => { if (!p.ceiling) return; n++; if (op[i] && op[i].ceiling === p.ceiling && op[i].z === p.z && op[i].heightBasis === p.heightBasis) same++; });
                    const tn = (nw.r.placements || []).filter(p => p.prov === 'drawn:terminal' && !p.exposed), to = (od.r.placements || []).filter(p => p.prov === 'drawn:terminal' && !p.exposed); let tsame = 0; tn.forEach((p, i) => { if (to[i] && to[i].z === p.z && to[i].host === p.host) tsame++; });
                    return { n: n, same: same, tn: tn.length, tsame: tsame }; };
                  const cx = cmpR(dbXM), cd = cmpR(dbDrawn);
                  H.openBuildingRules(SQL, stack, 'Duplex');
                  ok('R5 items under a ceiling keep z, HeightBasis and host byte-identical (===) to the 37130e8e walker: fixture X ' + cx.same + '/' + cx.n + ' pieces ' + cx.tsame + '/' + cx.tn + ' terminals, Duplex drawn walk ' + cd.same + '/' + cd.n + ' pieces ' + cd.tsame + '/' + cd.tn + ' terminals',
                    cx.n >= 2 && cx.same === cx.n && cx.tsame === cx.tn && cd.n >= 4 && cd.same === cd.n && cd.tsame === cd.tn && cd.tn >= 1, JSON.stringify({ X: cx, D: cd }));
                } finally { try { fs.unlinkSync(preR); } catch (e) { /* absent */ } H.openBuildingRules(SQL, stack, 'Duplex'); }
              }
            }
          }
        }
      }
      xdb.close();
    }
  }
  log('§VERDICT ' + (fail ? 'CLAIM NOT MET' : inc ? 'INCONCLUSIVE' : 'CLAIM MET') + ' pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('§ERROR ' + (e && e.stack || e)); process.exit(1); });
