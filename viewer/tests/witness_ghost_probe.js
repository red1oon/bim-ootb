#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS §GHOST_PROBE + §ALTC_V3_CHAINAGE_ROW (bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md). Read the log.
// ISSUES (user 2026-10-06): "a faint but exact mirror reflection hovering above" the road film; "remove the term Jelapang from that HUD
// box on the right". MEASURED cause 1: the interior room probe sat at y=-5.0 inside the road band and 6 glossy materials (bridge slabs,
// pipes) mirrored its scene capture. Cause 2: the status box Room row fell back to the model name. GREEN = road: staging logs
// §MIRROR_ROOM_PROBE skipped and NO material's envMap is a cube capture; A.civilChainageAt(camera) is a number within the route length and
// the status row reads 'Chainage'. Duplex: probe still built, row still 'Room', civilChainageAt null. INCONCLUSIVE on a load failure.
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const ROOT = path.resolve(path.join(__dirname, '..', '..')), PORT = +(process.env.PORT || 8665), LOG = process.env.LOG || '/tmp/witness_ghost_probe.log';
const ROAD = process.env.ROAD_DB || path.join(require('os').homedir(), 'Downloads', 'JALAN JELAPANG IFC', 'JELAPANG_AFTER.db');
const out = []; const log = l => { out.push(l); console.log(l); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css' };
const server = http.createServer((q, r) => { try { const u = decodeURIComponent(q.url.split('?')[0]); let fp = u === '/road.db' ? ROAD : path.join(ROOT, u);
  if (!fs.existsSync(fp)) { const a = path.join('/home/red1/bim-ootb', u); if (fs.existsSync(a)) fp = a; else { r.writeHead(404); r.end(); return; } }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream', 'Content-Length': fs.statSync(fp).size }); fs.createReadStream(fp).pipe(r); } catch (e) { r.writeHead(500); r.end(); } });
async function probe(b, db) {
  const p = await b.newPage(), con = []; p.on('console', m => { const t = m.text(); if (/§MIRROR_ROOM_PROBE/.test(t)) con.push(t); });
  await p.goto(`http://127.0.0.1:${PORT}/viewer/viewer.html?db=${db}`, { waitUntil: 'domcontentloaded', timeout: 600000 });
  let ok = false; for (let i = 0; i < 900 && !ok; i++) { await new Promise(r => setTimeout(r, 1000)); try { ok = await p.evaluate(() => !!(window.APP && APP.db && APP.streaming === false && Object.keys(APP.guidMap || {}).length && (!APP.isCivilModel() || APP._civilLabels))); } catch (e) {} }
  if (!ok) { await p.close(); return null; }
  const r = await p.evaluate(async () => { const A = APP; A.startStillRefine(); await new Promise(r => setTimeout(r, 12000));
    let cube = 0, glossy = 0; Object.keys(A._matCache || {}).forEach(k => { const m = A._matCache[k]; if (!m || !m.userData) return; if (m.userData._photoRoomProbeEligible) glossy++; if (m.envMap && m.envMap.isCubeTexture && m.envMap.isRenderTargetTexture) cube++; });
    const ch = A.civilChainageAt ? A.civilChainageAt(A.camera.position.x, A.camera.position.z) : null;
    const rows = A.filmBoxesStatusRows ? A.filmBoxesStatusRows({ room: { name: 'x' }, roomLabel: (ch != null ? 'Chainage' : null) }) : [];
    try { A.stopStillRefine(true); } catch (e) {}
    return { civil: A.isCivilModel(), glossy, cube, ch, routeLen: A.civilDriveRoute ? (function (r) { if (!r) return null; let s = 0; for (let i = 1; i < r.length; i++) s += Math.hypot(r[i].x - r[i - 1].x, r[i].z - r[i - 1].z); return s; })(A.civilDriveRoute()) : null, rowLabel: rows[1] && rows[1].label }; });
  r.probeLines = con; await p.close(); return r;
}
(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const b = await puppeteer.launch({ headless: true, protocolTimeout: 1800000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const road = await probe(b, '/road.db'), bld = await probe(b, '/buildings/Duplex_extracted.db'); await b.close(); server.close();
  log('  road ' + JSON.stringify(road)); log('  Duplex ' + JSON.stringify(bld));
  if (!road || !bld) { log('§WITNESS_GHOST_PROBE INCONCLUSIVE — a model never loaded'); fs.writeFileSync(LOG, out.join('\n') + '\n'); process.exit(2); }
  const checks = [['road: room probe skipped (logged)', road.civil && road.probeLines.some(l => /skipped \(road model/.test(l))],
    ['road: no material reflects a scene cube capture (glossy set judged > 0)', road.glossy > 0 && road.cube === 0],
    ['road: chainage row = a distance within the drive', road.ch != null && road.ch >= 0 && road.ch <= road.routeLen + 1 && road.rowLabel === 'Chainage'],
    ['Duplex: probe still built, row still Room, no chainage', !bld.civil && bld.probeLines.some(l => /built|reused/.test(l)) && bld.rowLabel === 'Room' && bld.ch === null]];
  let fail = 0; checks.forEach(([n, v]) => { if (!v) fail++; log('  ' + (v ? 'PASS ' : 'FAIL ') + n); });
  log('§WITNESS_GHOST_PROBE ' + (fail ? 'FAIL ' : 'PASS ') + (checks.length - fail) + '/' + checks.length); fs.writeFileSync(LOG, out.join('\n') + '\n'); process.exit(fail ? 1 : 0);
})().catch(e => { log('CRASH ' + e.stack); fs.writeFileSync(LOG, out.join('\n') + '\n'); process.exit(2); });
