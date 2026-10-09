#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS §VERT_WELD_IMPORT (bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §MEM_GROWTH M4-A, the FRESH-DROP path). Read the log after every run.
// ISSUE PROVEN/DISPROVEN: dropping a fresh IFC set into the viewer importer (A.importMultiIFC -> A.openImported) is welded AUTOMATICALLY for a CIVIL set and
// left ALONE for a building, and the weld changes nothing but the vertex count.
//  Each set is imported TWICE in fresh browsers: weld ON (shipped) and weld OFF (window.VertexWeld masked = the pre-M4 path). Compared on the opened model:
//  (1) CIVIL: §VERT_WELD_IMPORT printed with vertsAfter < vertsBefore, and the saved DB holds fewer vertices ON than OFF;
//  (2) BUILDING: no weld (no §VERT_WELD_IMPORT line, ON == OFF vertex counts) — the gate is civil-only;
//  (3) NO IMPACT (both): elements_meta / element_instances / geometry rows identical; scene mesh count identical; per-mesh (tris, area, bbox) fingerprint identical;
//  (4) VACUOUS guard: ON and OFF both nothing to weld on a civil set, or a missing import key -> INCONCLUSIVE, never PASS.
// Env: ROOT · IFC_DIR · FILES (comma list) · KIND=civil|building · GPU=sw|real · PORT · LOG
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const ROOT = path.resolve(process.env.ROOT || path.join(__dirname, '..', '..'));
const IFC_DIR = process.env.IFC_DIR, FILES = (process.env.FILES || '').split(',').filter(Boolean), KIND = process.env.KIND || 'civil';
const GPU = process.env.GPU || 'real', PORT = +(process.env.PORT || 8650), LOG = process.env.LOG || '/tmp/witness_vertex_weld_import_' + KIND + '.log';
const out = []; const log = l => { out.push(l); console.log(l); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => { try { const u = decodeURIComponent(req.url.split('?')[0]);
  let fp = u.startsWith('/__ifc/') ? path.join(IFC_DIR, u.slice(7)) : path.join(ROOT, u.replace(/^\/+/, ''));
  if (!fs.existsSync(fp)) { const a = path.join('/home/red1/bim-ootb', u); if (!u.startsWith('/__ifc/') && fs.existsSync(a)) fp = a; else { res.writeHead(404); res.end(); return; } }
  if (fs.statSync(fp).isDirectory()) fp = path.join(fp, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Content-Length': fs.statSync(fp).size, 'Cache-Control': 'no-store' }); fs.createReadStream(fp).pipe(res);
} catch (e) { res.writeHead(500); res.end(); } });
const sl = ms => new Promise(r => setTimeout(r, ms));
async function run(weldOn) {
  const gpu = { sw: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], real: ['--use-angle=gl-egl', '--ignore-gpu-blocklist'] }[GPU];
  const b = await puppeteer.launch({ headless: true, userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'wvi-')), protocolTimeout: 3600000,
    env: Object.assign({}, process.env, GPU === 'real' ? { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' } : {}), args: ['--no-sandbox', '--js-flags=--max-old-space-size=8192'].concat(gpu) });
  const tag = weldOn ? 'ON ' : 'OFF'; const lines = [];
  try {
    const p = await b.newPage(); await p.setViewport({ width: 1280, height: 720 });
    p.on('console', m => { const t = m.text(); if (/§(VERT_WELD_IMPORT|MESH_SLIM_IMPORT|MULTI_IMPORT|CIVIL_MODEL)/.test(t)) lines.push(t.slice(0, 220)); });
    await p.evaluateOnNewDocument((on) => { window.__opened = []; window.open = u => { window.__opened.push(u); return { focus() {} }; };
      if (!on) Object.defineProperty(window, 'VertexWeld', { configurable: true, get() { return undefined; }, set() {} }); }, weldOn);
    await p.goto(`http://127.0.0.1:${PORT}/viewer/viewer.html`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await p.waitForFunction(() => window.APP && window.APP.importMultiIFC && window.APP.openImported, { timeout: 300000, polling: 500 });
    const hasWeld = await p.evaluate(() => !!window.VertexWeld); if (hasWeld !== weldOn) throw new Error('weld mask not applied: VertexWeld=' + hasWeld + ' wanted ' + weldOn);
    const t0 = Date.now();
    const key = await p.evaluate(async (names) => { const files = []; for (const n of names) { const bl = await (await fetch('/__ifc/' + encodeURIComponent(n))).blob(); files.push(new File([bl], n)); }
      const r = await window.APP.importMultiIFC(files); return r && r.key; }, FILES);
    const impSec = +((Date.now() - t0) / 1000).toFixed(1); if (!key) throw new Error('import returned no key');
    await p.evaluate(k => window.APP.openImported(k), key); const url = await p.evaluate(() => window.__opened[0]);
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await p.waitForFunction(() => window.APP && window.APP.activeBuilding && window.APP.buildingsRendered && window.APP.buildingsRendered.has(window.APP.activeBuilding) && !window.APP.streaming, { timeout: 1800000, polling: 1000 });
    await sl(3000);
    const M = await p.evaluate(() => { const A = window.APP, q = s => { try { return A.dbQuery(s); } catch (e) { return [['ERR']]; } }, T = window.THREE;
      const tabs = q("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('component_geometries','base_geometries')").map(r => r[0]);
      let verts = 0, rows = 0; tabs.forEach(t => { const r = q('SELECT COUNT(*), COALESCE(SUM(LENGTH(vertices)),0) FROM ' + t)[0]; rows += r[0]; verts += r[1] / 12; });
      const meshes = A.collectMeshes(o => o.isMesh || o.isBatchedMesh || o.isInstancedMesh), sigs = []; let sceneVerts = 0;
      meshes.forEach(m => { const g = m.geometry; if (!g || !g.attributes.position) return; const P = g.attributes.position, I = g.index, n = I ? I.count : P.count; sceneVerts += P.count; let area = 0; const a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3();
        for (let t = 0; t + 2 < n; t += 3) { a.fromBufferAttribute(P, I ? I.getX(t) : t); b.fromBufferAttribute(P, I ? I.getX(t + 1) : t + 1); c.fromBufferAttribute(P, I ? I.getX(t + 2) : t + 2); area += b.clone().sub(a).cross(c.clone().sub(a)).length() / 2; }
        g.computeBoundingBox(); const bb = g.boundingBox; sigs.push([m.type, n / 3, area.toFixed(2), [bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z].map(x => x.toFixed(2)).join(',')].join('|')); });
      sigs.sort(); return { building: A.activeBuilding, elements: q('SELECT COUNT(*) FROM elements_meta')[0][0], instances: q('SELECT COUNT(*) FROM element_instances')[0][0], geomRows: rows, dbVerts: verts, meshes: meshes.length, sceneVerts, sigs,
        civil: !!(A.isCivilModel && A.isCivilModel()) }; });
    log('§VERT_WELD_IMPORT_RUN weld=' + tag + ' importSec=' + impSec + ' elements=' + M.elements + ' geomRows=' + M.geomRows + ' dbVerts=' + M.dbVerts + ' sceneVerts=' + M.sceneVerts + ' meshes=' + M.meshes + ' civil=' + M.civil);
    lines.forEach(l => log('    [con] ' + l)); return Object.assign(M, { lines });
  } finally { try { await b.close(); } catch (e) {} }
}
(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r)); log('§VERT_WELD_IMPORT kind=' + KIND + ' files=' + FILES.join('|') + ' gpu=' + GPU);
  let ON, OFF; try { ON = await run(true); OFF = await run(false); } catch (e) { log('§VERT_WELD_IMPORT verdict=INCONCLUSIVE (' + e.message + ')'); fs.writeFileSync(LOG, out.join('\n') + '\n'); server.close(); process.exit(2); }
  server.close(); const wl = ON.lines.map(l => /§VERT_WELD_IMPORT vertsBefore=(\d+) vertsAfter=(\d+)/.exec(l)).filter(Boolean).pop(), wOff = OFF.lines.some(l => { const m = /§VERT_WELD_IMPORT vertsBefore=(\d+) vertsAfter=(\d+)/.exec(l); return !!m && +m[1] > 0; });   // the masked run prints '0->0 INCONCLUSIVE(nothing welded)' by design: only a real weld (before>0) counts
  const eq = (n, a, b) => { const s = JSON.stringify(a) === JSON.stringify(b); log('§VERT_WELD_IMPORT ' + n + ' ' + (s ? 'SAME' : 'DIFF on=' + JSON.stringify(a).slice(0, 160) + ' off=' + JSON.stringify(b).slice(0, 160))); return s; };
  let ok = true; ok = eq('elements', ON.elements, OFF.elements) && ok; ok = eq('instances', ON.instances, OFF.instances) && ok; ok = eq('geometryRows', ON.geomRows, OFF.geomRows) && ok; ok = eq('meshCount', ON.meshes, OFF.meshes) && ok; ok = eq('meshFingerprint(tris,area,bbox)', ON.sigs, OFF.sigs) && ok;
  log('§VERT_WELD_IMPORT dbVerts on=' + ON.dbVerts + ' off=' + OFF.dbVerts + ' (' + (OFF.dbVerts ? ((ON.dbVerts - OFF.dbVerts) / OFF.dbVerts * 100).toFixed(1) : '0') + '%) sceneVerts on=' + ON.sceneVerts + ' off=' + OFF.sceneVerts + ' weldLineOn=' + (wl ? wl[1] + '->' + wl[2] : 'none') + ' weldLineOff=' + wOff);
  let gate, why = '';
  if (KIND === 'civil') { gate = !!wl && +wl[2] < +wl[1] && ON.dbVerts < OFF.dbVerts && !wOff; if (!wl || (wl && wl[1] === wl[2])) why = 'nothing welded on a civil set'; }
  else { gate = !wl && ON.dbVerts === OFF.dbVerts && !wOff; }
  log('§VERT_WELD_IMPORT gate(' + KIND + ')=' + gate);
  const verdict = why ? 'INCONCLUSIVE (' + why + ')' : (ok && gate ? 'PASS' : 'FAIL'); log('§VERT_WELD_IMPORT verdict=' + verdict); fs.writeFileSync(LOG, out.join('\n') + '\n'); process.exit(verdict === 'PASS' ? 0 : 1);
})();
