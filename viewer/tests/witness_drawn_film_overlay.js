#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — W-DRAWN-FILM, prompts/DRAWN_SERVICES_FILM.md. Read the log after every run; exit code is not evidence.
// ISSUES IT EXPOSES: (T) drawn ducts (line ops) and drawn FP equipment (anchor-only markers) have no mesh, so the Viewer-DB export drops them and the bake films nothing drawn;
// (O) an overlay that draws something other than the table rows, (D) a drawn-only view that hides the wrong meshes or changes data, (E) a DB with no drawn tables that errors, (F) a lost one-frame offset.
// A verdict line prints INCONCLUSIVE, never PASS, when nothing was judged. Software GL (swiftshader), no GPU.
// Fixtures (public only): Duplex_ARC.ifc (real), a small STR IFC and the duct / equipment sheets written below. The fixture writer (guid, ifcDoc, sheetDxf, STR_A) is COPIED from
// modeller/tests/witness_drawn_walk.js (that file runs on require and exports nothing); keep the two in step. The walk runs IN THE MODELLER PAGE (_discWalkOne), the export is the page's own.
// Usage: NODE_PATH=~/bim-compiler/node_modules node viewer/tests/witness_drawn_film_overlay.js > log 2>&1
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process'), http = require('http');
const ROOT = path.join(__dirname, '..', '..'), M = path.join(ROOT, 'modeller');
const NM = path.join(process.env.HOME, 'bim-compiler', 'node_modules');
const puppeteer = require(path.join(NM, 'puppeteer')), initSqlJs = require(path.join(NM, 'sql.js')), Database = require(path.join(NM, 'better-sqlite3')), WebIFC = require(path.join(NM, 'web-ifc/web-ifc-api-node.js'));
const log = console.log;
let pass = 0, fail = 0, inc = 0;
const ok = (id, cond, msg) => { log('§' + (cond ? 'PASS' : 'FAIL') + ' ' + id + ' | ' + (msg || '')); cond ? pass++ : fail++; return cond; };
const incon = (id, why) => { log('§INCONCLUSIVE ' + id + ' | ' + why); inc++; };
const near = (a, b, t) => Math.abs(a - b) <= t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'wdfo_'));
const TOOL = path.join(M, 'tools', 'extract_ifc2db.js'), MAINS = path.join(M, 'tools', 'mains_to_db.js');
const env = Object.assign({}, process.env, { NODE_PATH: NM });
const sh = args => { try { return cp.execFileSync('node', args, { env, maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] }).toString(); } catch (e) { return (e.stdout || '').toString() + (e.stderr || '').toString() + '\nEXIT-FAIL'; } };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.db': 'application/octet-stream' };
// ── COPIED from modeller/tests/witness_drawn_walk.js L30-L76 (ifcDoc), L80-L85 (STR_A), L119-L131 (sheetDxf) ──
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
const STR_SLAB = guid(701), STR_BEAM = guid(702);
const STR_A = ifcDoc({ storeyO: [0, 0, 0], tag: 'STR_A', boxes: [
  { cls: 'IfcSlab', name: 'STR slab', box: [-2, -20, 2.90, 11, 3, 3.20], pre: '.FLOOR.', gid: STR_SLAB },
  { cls: 'IfcBeam', name: 'STR beam', box: [4.5, -10, 2.75, 4.8, 0, 2.85], pre: '.BEAM.', gid: STR_BEAM },
  { cls: 'IfcSlab', name: 'STR roof slab', box: [-2, -20, 6.10, 20, 3, 6.40], pre: '.ROOF.', gid: guid(703) }],
  grid: { gid: guid(50), name: 'Grid STR', u: [['A', [[0, -20], [0, 4]]], ['B', [[4, -20], [4, 4]]], ['C', [[8, -20], [8, 4]]]], v: [['1', [[-2, -16], [10, -16]]], ['2', [[-2, -9], [10, -9]]], ['3', [[-2, -3], [10, -3]]], ['4', [[-2, 2], [10, 2]]]] } });
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

// ── the fixture: Duplex ARC (real) federated with STR_A, then a duct sheet and an FP equipment sheet read onto it by the shipped tool ──
const PCS = { P1: [0, -3, 4, -3], P5: [4, -3, 4.65, -3], P3: [4.65, -5, 4.65, -3], P2: [1, -14, 5, -14], P4: [20, 0, 24, 0] };   // as witness_drawn_walk D (P4 outside every ceiling = plan only)
const TERMS = [[1.5, -2, 'DIFFUSER_SUPPLY'], [6, -14, 'DIFFUSER_RETURN'], [2.5, -5, 'DIFFUSER']];
const GRIDSHEET = { u: [['A', 0, -20, 4], ['B', 4, -20, 4], ['C', 8, -20, 4]], v: [['1', -16, -2, 10], ['2', -9, -2, 10], ['3', -3, -2, 10], ['4', 2, -2, 10]] };
const EQS = [[2, -2, 'EXTINGUISHER FOAM 9L'], [1, -10, 'FIRE CABINET 1'], [6, -14, 'Fire_Blanket']];
const NAME = 'DuplexDrawn';   // the name carries 'Duplex': the residential rules (common/walk_rules.js)
function buildFixture() {
  const arcPath = path.join(ROOT, 'IFC', 'Duplex_ARC.ifc');
  if (!fs.existsSync(arcPath)) return null;
  const strA = path.join(TMP, 'STR_A.ifc'); fs.writeFileSync(strA, STR_A);
  const db = path.join(TMP, NAME + '.db');
  const o1 = sh([TOOL, '--ifc', arcPath, '--federate', strA, '--federate-disc', 'STR', '-o', db]);
  const dxfD = path.join(TMP, 'M-101.dxf'), dxfE = path.join(TMP, 'FP-101.dxf');
  fs.writeFileSync(dxfD, sheetDxf({ off: [100, 200], grid: GRIDSHEET, pieces: Object.values(PCS), terminals: TERMS }));
  fs.writeFileSync(dxfE, sheetDxf({ off: [100, 200], grid: GRIDSHEET, pieces: [], terminals: [], equip: EQS }));
  const o2 = sh([MAINS, db, dxfD, '--sheet-meta=' + JSON.stringify({ number: 'M-101', revision: 'A', storeys: ['Level 1'] })]);
  const o3 = sh([MAINS, db, dxfE, '--sheet-meta=' + JSON.stringify({ number: 'FP-101', revision: 'A', storeys: ['Level 1'] })]);
  [['federate', o1, /§FEDERATE|§FATAL|EXIT-FAIL/], ['mains', o2, /§MAINS-(TO-DB|READ|FIT|REFUSE)|EXIT-FAIL/], ['equip', o3, /§MAINS-(EQUIP|TO-DB|READ|REFUSE|INCONCLUSIVE)|EXIT-FAIL/]].forEach(([k, o, rx]) => log('  tool ' + k + ': ' + (o.split('\n').filter(l => rx.test(l)).map(l => l.slice(0, 220)).join(' || ') || '(no tool line)')));
  return db;
}
const enc = 'b => { let s = ""; for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode.apply(null, b.subarray(i, i + 32768)); return s; }';

(async () => {
  const fixDb = buildFixture();
  if (!fixDb || !fs.existsSync(fixDb)) { incon('ALL', 'fixture not built (IFC/Duplex_ARC.ifc absent or the tool failed): nothing judged'); log('§W-DRAWN-FILM INCONCLUSIVE'); process.exit(0); }
  // The fixture is Duplex in its own frame (offset 0): the opened building states a one-frame offset by project_metadata rows only (the geometry is already local), so the V6 value
  // test needs rows to carry. They are written here, public made-up map coordinates, the same values witness_drawn_walk's mapped pair uses.
  const OFFV = { georef_offset_x: '500123.25', georef_offset_y: '2750456.75', georef_offset_z: '0', unit_scale: '1' };
  { const w = new Database(fixDb); Object.keys(OFFV).forEach(k => w.prepare('INSERT OR REPLACE INTO project_metadata(key, value) VALUES (?, ?)').run(k, OFFV[k])); w.close(); }
  const fd = new Database(fixDb, { readonly: true });
  const nRoute = fd.prepare('SELECT count(*) n FROM drawn_route').get().n, nEq = fd.prepare('SELECT count(*) n FROM drawn_equipment').get().n;
  log('§W_DFO fixture ' + fixDb + ' drawn_route=' + nRoute + ' drawn_equipment=' + nEq + ' offset=' + JSON.stringify(fd.prepare("select key,value from project_metadata where key like 'georef_offset_%'").all())); fd.close();
  if (!nRoute || !nEq) { incon('ALL', 'the tool stored drawn_route=' + nRoute + ' drawn_equipment=' + nEq + ': nothing walked'); log('§W-DRAWN-FILM INCONCLUSIVE'); process.exit(0); }

  const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]);
    fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(b); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const br = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = [], cons = [];
  const watch = (pg, tag) => { pg.on('pageerror', e => { errs.push(tag + ' ' + String(e).slice(0, 200)); log('§PAGEERR ' + tag + ' ' + String(e).slice(0, 200)); });
    pg.on('console', m => { const t = m.text(); cons.push(t); if (/§(VIEWERDB|DRAWN|DISC-WALK-COMMIT|DW-DRAWN|WALK-MAINS|FP-EQUIP|VIEW-DRAWN)/.test(t)) log('  [' + tag + '] ' + t.slice(0, 500)); }); };
  const pg = await br.newPage(); await pg.setViewport({ width: 1280, height: 720 }); watch(pg, 'mod');
  await pg.goto(base + '/modeller/modeller.html', { waitUntil: 'load', timeout: 120000 });
  await pg.waitForFunction('window.__sceneReady===true && window.Bonsai && window.Bonsai.exportViewerDb && typeof window.discWalk==="function"', { timeout: 120000 });
  await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__local"]', { visible: true });
  const [ch] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__local"]')]); await ch.accept([fixDb]);
  await pg.waitForFunction('!!window.__dwBuf && !!window.__arcSeedReady', { timeout: 240000 }); await pg.evaluate(async () => { await window.__arcSeedReady; }); await sleep(3000);
  const walk = await pg.evaluate(async () => { const o = {}, n = window.__dwName;
    for (const d of ['ACMV', 'FP']) { window.__dwLastDoneDisc = null; await window.discWalk(d, { building: n });
      for (let i = 0; i < 1200 && window.__dwLastDoneDisc !== d; i++) await new Promise(r => setTimeout(r, 500)); o[d] = window.__dwLastDoneDisc === d ? 'done' : 'TIMEOUT'; }
    return { name: n, walk: o, ops: window.Bonsai.oplog.length }; });
  log('§W_DFO page walk ' + JSON.stringify(walk));
  const dops = await pg.evaluate(() => window.Bonsai.oplog._geomOps().filter(o => o.parameters && o.parameters._dw && /^drawn-/.test(o.parameters._dw.kind)).map(o => ({ kind: o.parameters._dw.kind, line: o.parameters.line || null, pl: o.parameters.placement, dw: o.parameters._dw })));
  log('§W_DFO drawn ops committed: ' + dops.length + ' ' + JSON.stringify(dops.map(d => d.kind).reduce((a, k) => (a[k] = (a[k] || 0) + 1, a), {})));
  // ── export: with the mechanism on, and the falsifier (opts.drawn=false: mechanism off) ──
  const expo = (drawn) => pg.evaluate(async (drawn, encSrc) => { const O = window.Bonsai.oplog, n0 = O.length;
    const r = await window.Bonsai.exportViewerDb({ download: false, carry: false, drawn: drawn }); const e = eval('(' + encSrc + ')');
    return { db: e(r.bytes), elements: r.elements, opsBefore: n0, opsAfter: O.length, info: r.drawn }; }, drawn, enc);
  const on = await expo(true), off = await expo(false);
  const dbOn = path.join(TMP, 'exp_on.db'), dbOff = path.join(TMP, 'exp_off.db'), dbRed = path.join(TMP, 'exp_red.db');
  fs.writeFileSync(dbOn, Buffer.from(on.db, 'latin1')); fs.writeFileSync(dbOff, Buffer.from(off.db, 'latin1'));
  log('§W_DFO export on: elements=' + on.elements + ' ops ' + on.opsBefore + '->' + on.opsAfter + ' info=' + JSON.stringify(on.info) + ' | off: elements=' + off.elements + ' info=' + JSON.stringify(off.info));
  const dopsAll = dops;
  const lineOps = dopsAll.filter(d => d.kind === 'drawn-main'), markOps = dopsAll.filter(d => d.kind === 'drawn-equipment');
  const logNum = (rx) => { const m = cons.filter(t => rx.test(t)).map(t => +(rx.exec(t) || [])[1]); return m.length ? m[m.length - 1] : null; };
  const walkLines = logNum(/§DW-DRAWN-LINES ACMV segments=(\d+)/), walkTicks = logNum(/§DW-DRAWN-LINES FP segments=\d+ equipTicks=(\d+)/);
  const E = new Database(dbOn, { readonly: true }), tbl = n => E.prepare("select name from sqlite_master where name=?").get(n);
  if (!lineOps.length || !markOps.length || !tbl('drawn_walk_line') || !tbl('drawn_walk_marker')) { incon('V1', 'lineOps=' + lineOps.length + ' markOps=' + markOps.length + ' tables=' + !!tbl('drawn_walk_line') + '/' + !!tbl('drawn_walk_marker') + ': nothing judged'); }
  else {
    const L = E.prepare('select * from drawn_walk_line').all(), K = E.prepare('select * from drawn_walk_marker').all();
    let worst = 0, basisOk = true, matched = 0;
    lineOps.forEach(o => { const r = L.find(x => x.sheet === o.dw.sheet && x.piece === o.dw.piece); if (!r) return; matched++;
      [[r.x0, o.line.from[0]], [r.y0, o.line.from[1]], [r.z0, o.line.from[2]], [r.x1, o.line.to[0]], [r.y1, o.line.to[1]], [r.z1, o.line.to[2]]].forEach(([a, b]) => { worst = Math.max(worst, Math.abs(a - b)); });
      if (r.basis !== o.dw.heightBasis || r.system !== o.dw.system || (r.width_drawn_mm != null ? r.width_drawn_mm : null) !== (o.dw.widthMm == null ? null : o.dw.widthMm)) basisOk = false; });
    let worstM = 0, basisM = true, matchedM = 0;
    markOps.forEach(o => { const r = K.find(x => x.sheet === o.dw.sheet && x.item === o.dw.item); if (!r) return; matchedM++;
      [[r.x, o.pl.x], [r.y, o.pl.y], [r.z, o.pl.z]].forEach(([a, b]) => { worstM = Math.max(worstM, Math.abs(a - b)); });
      if (r.basis !== o.dw.heightBasis || r.label !== o.dw.label || r.ifc_class !== o.dw.ifcClass || r.object_type !== o.dw.objectType || r.kind !== o.dw.itemKind) basisM = false; });
    const bases = [...new Set(L.map(r => r.basis))], mb = [...new Set(K.map(r => r.basis))];
    log('§V1 tables lines=' + L.length + ' markers=' + K.length + ' | committed ops lines=' + lineOps.length + ' markers=' + markOps.length + ' | walk log segments=' + walkLines + ' equipTicks=' + walkTicks + ' | worst coordinate delta line=' + worst.toExponential(2) + ' marker=' + worstM.toExponential(2) + ' m | line bases=' + JSON.stringify(bases) + ' marker bases=' + JSON.stringify(mb));
    ok('V1 the exported tables equal the walk\'s committed lines and markers: counts, coordinates to 1 mm, basis/system/width/label per row', L.length === lineOps.length && K.length === markOps.length && matched === lineOps.length && matchedM === markOps.length && L.length === walkLines && K.length === walkTicks && worst < 0.001 && worstM < 0.001 && basisOk && basisM && mb.length === 1 && mb[0] === 'owner-stated' && bases.every(b => /^(void-middle|exposed-under-structure|on-roof-surface)$/.test(b)),
      'lines ' + L.length + '/' + lineOps.length + ' markers ' + K.length + '/' + markOps.length);
    ok('V1b ops and elements unchanged by the export (the op-log is read, never written)', on.opsBefore === on.opsAfter && off.opsBefore === on.opsBefore, 'ops ' + on.opsBefore + '->' + on.opsAfter);
    ok('V1c the sheet is stored (column present, non-empty) and the Viewer never shows it (the overlay file has no sheet text)', L.every(r => r.sheet) && K.every(r => r.sheet) && !/\.sheet\b|r\.sheet|sheet:/.test(fs.readFileSync(path.join(ROOT, 'viewer', 'cpe_drawn_services.js'), 'utf8').replace(/\/\/.*$/gm, '').replace(/userData\.drawnMarker = \{[^}]*\}/, '')), 'sheets=' + JSON.stringify([...new Set(L.map(r => r.sheet).concat(K.map(r => r.sheet)))]));
    const pre = E.prepare("select count(*) n from drawn_walk_line").get().n; log('  lines rows ' + pre);
    // V4's DB: one line row deleted
    fs.copyFileSync(dbOn, dbRed); const R = new Database(dbRed); R.prepare('delete from drawn_walk_line where rowid = (select min(rowid) from drawn_walk_line)').run(); log('  RED db lines=' + R.prepare('select count(*) n from drawn_walk_line').get().n); R.close();
  }
  // V6 the one-frame offset
  { const rd = d => { const x = new Database(d, { readonly: true }), o = {}; x.prepare("select key, value from project_metadata where key in ('georef_offset_x','georef_offset_y','georef_offset_z','unit_scale')").all().forEach(r => { o[r.key] = r.value; }); x.close(); return o; };
    const oOn = rd(dbOn), oOff = rd(dbOff);
    log('§V6 opened building ' + JSON.stringify(OFFV) + ' | export ' + JSON.stringify(oOn) + ' | export with the mechanism off ' + JSON.stringify(oOff));
    ok('V6 the one-frame offset is present in the exported DB and equals the walked building\'s', JSON.stringify(oOn) === JSON.stringify(Object.fromEntries(Object.keys(OFFV).sort().map(k => [k, OFFV[k]]))) || Object.keys(OFFV).every(k => oOn[k] === OFFV[k]), 'rows=' + Object.keys(oOn).length);
    ok('V6 RED: with the mechanism off the offset is absent (so the claim can fail)', Object.keys(oOff).length === 0, 'rows=' + Object.keys(oOff).length); }
  E.close();

  // ── the Viewer page: open an exported DB, enable the overlay + drawn-only, read the § lines ──
  const vb = path.join(ROOT, 'viewer', 'buildings'); const toClean = [];
  async function viewerRun(dbFile, tagName) {
    const fn = '_w_dfo_' + tagName + '.db', dst = path.join(vb, fn); fs.copyFileSync(dbFile, dst); toClean.push(dst);
    const vp = await br.newPage(); await vp.setViewport({ width: 1280, height: 720 }); const vlog = [], e0 = errs.length;
    vp.on('pageerror', e => { errs.push('viewer-' + tagName + ' ' + String(e).slice(0, 200)); log('§PAGEERR viewer-' + tagName + ' ' + String(e).slice(0, 200)); });
    vp.on('console', m => { const t = m.text(); vlog.push(t); if (/§DRAWN|§PROV-TOTALS|§FILTER_GUIDS|§LOAD_FAIL/.test(t)) log('  [v-' + tagName + '] ' + t.slice(0, 400)); });
    await vp.goto(base + '/viewer/viewer.html?db=buildings/' + fn, { waitUntil: 'load', timeout: 120000 });
    let t = ''; for (let i = 0; i < 150; i++) { await sleep(1000); t = await vp.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 200)); if (/DONE/.test(t)) break; }
    await vp.waitForFunction('window.APP && APP.db && APP.scene && typeof APP.drawnServicesEnable==="function"', { timeout: 60000 }).catch(() => { });
    await sleep(3000);
    const pre = await vp.evaluate(() => { const A = window.APP, q = s => { const r = A.db.exec(s); return r.length ? r[0].values[0][0] : null; };
      return { elements: q('select count(*) from elements_meta'), lazy: !window.setupCpeDrawnServices, scripts: [].slice.call(document.scripts).filter(s => /cpe_drawn_services/.test(s.src)).length }; });
    return { vp, vlog, pre, done: /DONE/.test(t), e0 };
  }
  const readLast = (vlog, rx) => { const m = vlog.filter(t => rx.test(t)); return m.length ? m[m.length - 1] : ''; };
  const parseOverlay = l => { const m = /§DRAWN-OVERLAY lines=(\d+) markers=(\d+) byBasis=(\{[^}]*\})/.exec(l); return m ? { lines: +m[1], markers: +m[2], byBasis: JSON.parse(m[3]) } : null; };
  const tbCount = (d) => { const x = new Database(d, { readonly: true }); let o = { lines: 0, markers: 0, byBasis: {} }; try { o.lines = x.prepare('select count(*) n from drawn_walk_line').get().n; x.prepare('select basis, count(*) n from drawn_walk_line group by 1').all().forEach(r => { o.byBasis[r.basis] = r.n; }); } catch (e) { } try { o.markers = x.prepare('select count(*) n from drawn_walk_marker').get().n; x.prepare('select basis, count(*) n from drawn_walk_marker group by 1').all().forEach(r => { o.byBasis[r.basis] = (o.byBasis[r.basis] || 0) + r.n; }); } catch (e) { } x.close(); return o; };
  if (lineOps.length && markOps.length) {
    const V = await viewerRun(dbOn, 'on'); const tOn = tbCount(dbOn);
    if (!V.done) incon('V2', 'the Viewer did not open the exported DB');
    else {
      ok('V2a the overlay is lazy: no script tag, not loaded at page open', V.pre.lazy && V.pre.scripts === 0, 'loadedAtOpen=' + !V.pre.lazy + ' tags=' + V.pre.scripts);
      const before = await V.vp.evaluate(() => { const A = window.APP; return { drawnObjs: A.scene.children.filter(o => /^drawnServices/.test(o.name)).length }; });
      await V.vp.evaluate(async () => { await window.APP.drawnServicesEnable(true); }); await sleep(1500);
      const ov = parseOverlay(readLast(V.vlog, /§DRAWN-OVERLAY lines=/));
      const scene = await V.vp.evaluate(() => { const objs = window.APP.scene.children.filter(o => /^drawnServices/.test(o.name)); return { lines: objs.filter(o => o.name === 'drawnServicesLines').reduce((a, o) => a + o.geometry.attributes.position.count / 2, 0), markers: objs.filter(o => o.name === 'drawnServicesMarker').length, labels: objs.filter(o => o.name === 'drawnServicesLabel').length }; });
      log('§V2 overlay line ' + JSON.stringify(ov) + ' | table ' + JSON.stringify(tOn) + ' | scene objects ' + JSON.stringify(scene) + ' before=' + JSON.stringify(before));
      ok('V2 the Viewer overlay draws exactly the table rows (§DRAWN-OVERLAY counts and byBasis = rows; the scene holds that many segments, markers and labels)', !!ov && before.drawnObjs === 0 && ov.lines === tOn.lines && ov.markers === tOn.markers && JSON.stringify(ov.byBasis) === JSON.stringify(tOn.byBasis) && scene.lines === tOn.lines && scene.markers === tOn.markers && scene.labels === tOn.markers, 'overlay=' + JSON.stringify(ov));
      // V3 drawn-only
      const OL = readLast(V.vlog, /§DRAWN-ONLY hidden=/), mo = /§DRAWN-ONLY hidden=(\{[^}]*\}) hiddenTotal=(\d+) shown=(\d+) overlay=(\d+) elements=(\d+)/.exec(OL);
      const X = new Database(dbOn, { readonly: true });
      const truthH = {}; X.prepare("select m.ifc_class c, count(*) n from element_pset_common p join elements_meta m on m.guid=p.guid where p.pset='BIMOOTB_Walk' and p.name='Provenance' and p.value not like 'drawn:%' group by 1").all().forEach(r => { truthH[r.c] = r.n; });
      const truthAll = X.prepare('select count(*) n from elements_meta').get().n, truthDrawnShown = X.prepare("select count(*) n from element_pset_common p where p.pset='BIMOOTB_Walk' and p.name='Provenance' and p.value like 'drawn:%'").get().n; X.close();
      const hid = Object.values(truthH).reduce((a, b) => a + b, 0);
      const sc = await V.vp.evaluate((hideG) => { const A = window.APP, H = new Set(hideG), r = { plainHidden: 0, plainShown: 0, plainHideSetVisible: 0, instHidden: 0, batchHidden: 0, kinds: {} };
        A.scene.traverse(o => { if (o.isInstancedMesh) r.kinds.inst = (r.kinds.inst || 0) + 1; else if (o.isBatchedMesh) r.kinds.batched = (r.kinds.batched || 0) + 1; else if (o.isMesh && o.userData && o.userData.guid !== undefined) { r.kinds.plain = (r.kinds.plain || 0) + 1; if (o.visible) r.plainShown++; else r.plainHidden++; if (H.has(o.userData.guid) && o.visible) r.plainHideSetVisible++; } });
        r.bHideSet = 0; r.bHideSetVisible = 0; r.bKeep = 0; r.bKeepVisible = 0;   // batched meshes: the bake's real case; per element via the viewer's own slot visibility
        A.scene.traverse(o => { if (!o.isBatchedMesh) return; (A._batchMeta && A._batchMeta[o.id] || []).forEach(mt => { const v = o.getVisibleAt(mt.slotId); if (H.has(mt.guid)) { r.bHideSet++; if (v) r.bHideSetVisible++; } else { r.bKeep++; if (v) r.bKeepVisible++; } }); });
        r.filter = A.activeGuidFilter ? A.activeGuidFilter.size : null; return r; }, await (async () => { const X2 = new Database(dbOn, { readonly: true }); const g = X2.prepare("select p.guid g from element_pset_common p where p.pset='BIMOOTB_Walk' and p.name='Provenance' and p.value not like 'drawn:%'").all().map(r => r.g); X2.close(); return g; })());
      log('§V3 ' + OL.slice(0, 300) + ' | node truth hidden=' + JSON.stringify(truthH) + ' drawn-walk elements kept=' + truthDrawnShown + ' | scene ' + JSON.stringify(sc));
      const post = await V.vp.evaluate(() => { const A = window.APP, r = A.db.exec('select count(*) from elements_meta'); return { elements: r[0].values[0][0], tbl: A.db.exec('select count(*) from drawn_walk_line')[0].values[0][0] }; });
      ok('V3 drawn-only hides the walked/borrowed meshes and shows the overlay: hidden per class = the BIMOOTB_Walk non-drawn rows of the DB; shown = the rest; the overlay is up; no hidden-set mesh is visible (batched slots: all of them off, every other one on); elements and table rows unchanged',
        !!mo && hid > 0 && JSON.stringify(Object.entries(JSON.parse(mo[1])).sort()) === JSON.stringify(Object.entries(truthH).sort()) && +mo[2] === hid && +mo[3] === truthAll - hid && +mo[4] === tOn.lines + tOn.markers && +mo[5] === truthAll && sc.plainHideSetVisible === 0 && sc.bHideSet > 0 && sc.bHideSetVisible === 0 && sc.bKeep > 0 && sc.bKeepVisible === sc.bKeep && post.elements === V.pre.elements && post.elements === truthAll && post.tbl === tOn.lines,
        'hidden=' + hid + ' shown=' + (truthAll - hid) + ' elements ' + V.pre.elements + '->' + post.elements + ' scene.plainHideSetVisible=' + sc.plainHideSetVisible + ' plainHidden=' + sc.plainHidden + ' batched hide-set slots=' + sc.bHideSet + ' still visible=' + sc.bHideSetVisible + ' | other slots ' + sc.bKeep + ' visible=' + sc.bKeepVisible + ' kinds=' + JSON.stringify(sc.kinds));
      if (!hid) incon('V3', 'no walked rows hidden: vacuous');
      // off restores
      await V.vp.evaluate(async () => { await window.APP.drawnServicesEnable(false); }); await sleep(800);
      const rest = await V.vp.evaluate(() => ({ filter: window.APP.activeGuidFilter, objs: window.APP.scene.children.filter(o => /^drawnServices/.test(o.name)).length }));
      ok('V3b switching it off disposes the overlay and restores every mesh (no filter left, 0 drawn objects)', !rest.filter && rest.objs === 0, JSON.stringify(rest));
    }
    await V.vp.close();
    // V4 RED
    const VR = await viewerRun(dbRed, 'red');
    if (!VR.done) incon('V4', 'the Viewer did not open the edited DB'); else {
      await VR.vp.evaluate(async () => { await window.APP.drawnServicesEnable(true); }); await sleep(1000);
      const ovR = parseOverlay(readLast(VR.vlog, /§DRAWN-OVERLAY lines=/));
      log('§V4 RED overlay ' + JSON.stringify(ovR) + ' (full DB: lines=' + tOn.lines + ')');
      ok('V4 RED: one drawn_walk_line row deleted, the overlay count drops by exactly one (markers unchanged)', !!ovR && ovR.lines === tOn.lines - 1 && ovR.markers === tOn.markers, 'lines ' + tOn.lines + ' -> ' + (ovR && ovR.lines));
    }
    await VR.vp.close();
    // V5: a DB with no drawn tables
    const V5 = await viewerRun(dbOff, 'none');
    if (!V5.done) incon('V5', 'the Viewer did not open the no-drawn-tables DB'); else {
      const eb = errs.length; await V5.vp.evaluate(async () => { await window.APP.drawnServicesEnable(true); }); await sleep(1000);
      const ov5 = readLast(V5.vlog, /§DRAWN-OVERLAY/), objs = await V5.vp.evaluate(() => window.APP.scene.children.filter(o => /^drawnServices/.test(o.name)).length);
      log('§V5 ' + ov5);
      ok('V5 a DB with no drawn tables draws nothing, with no error', /lines=0 markers=0/.test(ov5) && objs === 0 && errs.length === eb && errs.length === V5.e0, 'objects=' + objs + ' pageErrors=' + errs.length);
    }
    await V5.vp.close();
  }
  toClean.forEach(f => { try { fs.unlinkSync(f); } catch (e) { } });
  await br.close(); srv.close();
  const modErrs = errs.filter(e => /^mod /.test(e)).length;
  ok('V0 no page error on the Modeller page', modErrs === 0, 'errors=' + modErrs);
  log('§W-DRAWN-FILM ' + (fail ? 'FAIL ' + fail : (pass && !inc ? 'PASS ' + pass : 'INCONCLUSIVE pass=' + pass + ' inconclusive=' + inc)));
  process.exit(fail ? 1 : 0);
})().catch(e => { log('§FAIL W-DRAWN-FILM crashed ' + (e && e.stack || e)); process.exit(1); });
