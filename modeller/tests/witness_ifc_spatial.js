#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-IFC-SPATIAL: Export ▸ IFC writes a real spatial tree (prompts/DXF2BIM_MODELLER_LANE.md L3, §IFC-SPATIAL).
 *
 * THE ISSUE THIS PROVES OR DISPROVES: until 2026-10-16 bonsai_ifc.js wrote NO IfcProject / IfcSite / IfcBuilding /
 * IfcBuildingStorey and no containment, so an exported file was not a valid IFC4 model and every product floated
 * outside any building. A DXF-converted model needs its storeys (Level 1 / Level 2) in the file.
 *
 *   S1 TREE        — re-import finds exactly 1 project, 1 site, 1 building (aggregated project > site > building).
 *   S2 STOREYS     — two ops carrying parameters.storey + storey_elev (L1 @0, L2 @3.1) give exactly 2 storeys.
 *   S3 CONTAINED   — every product except openings is contained exactly once: the demo wall (no storey) in the
 *                    building, one element in each storey. contained == products, no product dropped or doubled.
 *   S4 NO-GUESS    — an op with a storey NAME but no storey_elev is NOT given a guessed storey: it lands in the
 *                    building, and the storey count stays 2. (A storey invented from a name alone would turn S4 RED.)
 *
 * Falsify: delete the rel(IFCRELCONTAINEDINSPATIALSTRUCTURE…) lines in bonsai_ifc.js → S3 RED (contained=0).
 */
const http = require('http'), fs = require('fs'), path = require('path');
const VIEWER = path.join(__dirname, '..');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css' };
const server = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller.html';
  fs.readFile(path.join(VIEWER, p), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b); });
});
(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage();
  pg.on('console', m => { const t = m.text(); if (/§IFC-SPATIAL|§IFC build|ERR/.test(t)) console.log('  ' + t); });
  pg.on('pageerror', e => console.log('  ERR ' + String(e).slice(0, 300)));
  await pg.goto(`http://localhost:${port}/modeller.html?ifc=demo`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__ifcDone === true', { timeout: 120000 });
  const x = await pg.evaluate(async () => {
    const box = (x0, y0) => ({ profile: { points: [[x0, y0], [x0 + 2, y0], [x0 + 2, y0 + 0.2], [x0, y0 + 0.2]] }, depth: 3 });
    await window.Bonsai.oplog.commit({ op_type: 'GEOM_EXTRUDE_POLY', parameters: Object.assign(box(10, 0), { storey: 'Level 1', storey_elev: 0 }) });
    await window.Bonsai.oplog.commit({ op_type: 'GEOM_EXTRUDE_POLY', parameters: Object.assign(box(10, 5), { storey: 'Level 2', storey_elev: 3.1 }) });
    await window.Bonsai.oplog.commit({ op_type: 'GEOM_EXTRUDE_POLY', parameters: Object.assign(box(10, 10), { storey: 'Level 3' }) });   // name, no elevation
    const b = await window.Bonsai.ifc.build();
    const re = await window.Bonsai.ifc.reimport(b.bytes);
    return { walls: b.walls, re };
  });
  await br.close(); server.close();
  const sp = x.re.spatial || {};
  const products = x.walls;   // GEOM_EXTRUDE_POLY products (demo wall + 3); the demo opening is not a contained product
  const checks = [
    ['S1 TREE', 'no single project > site > building', sp.projects === 1 && sp.sites === 1 && sp.buildings === 1 && sp.aggregates === 3, JSON.stringify(sp)],
    ['S2 STOREYS', 'storeys from storey+storey_elev missing or extra', sp.storeys === 2, 'storeys=' + sp.storeys],
    ['S3 CONTAINED', 'a product not contained, or contained twice', sp.contained === products && products === 4, 'contained=' + sp.contained + ' products=' + products],
    ['S4 NO-GUESS', 'a storey invented from a name without an elevation', sp.storeys === 2 && sp.containRels === 3, 'containRels=' + sp.containRels + ' (L1, L2, building)'],
  ];
  let fail = 0;
  for (const [id, issue, ok, d] of checks) { if (!ok) fail++; console.log((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); }
  console.log('SUMMARY fail=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('ERR ' + e.stack); process.exit(1); });
