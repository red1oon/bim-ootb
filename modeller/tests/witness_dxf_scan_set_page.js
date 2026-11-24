#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-L41-PAGE (prompts/DXF2BIM_MODELLER_LANE.md §L41; BIMCompiler prompts/PDF2BIM_VECTOR_PROBE.md §46 W-S46d). Read the § lines after EVERY run; exit code alone is not evidence.
// THE ISSUE THIS PROVES OR DISPROVES: the owner asked for the scanned German set to reach the Viewer through the Modeller. On the REAL page (CPU GL, real clicks for open/Convert):
//   P1 the 7 sheets open and the gate qualifies (blocking 0, accepted > 0)     P2 Convert builds, no hard fail or refusal
//   P3 Export ▸ Viewer database is on the menu and its DB holds the Convert's inserts + one IfcOpeningElement per cut     P4 the Viewer opens that DB as the building ("DONE ... N elements")
//   P5 the DB carries the house ground slab (an IfcSlab whose bbox is z -0.275..0)     E 0 page errors
// Inputs: SCAN_SET_DIR (scan2dxf.py std/, a private client set, never committed); SCAN_LIB_DIR = a local library export served in place of the bucket (else the PUBLISHED library is used, and
// the log says which answered). SCAN_DB_OUT = where to keep the exported DB. Absent sheets -> §SKIP, INCONCLUSIVE.
// usage: NODE_PATH=~/bim-compiler/node_modules SCAN_SET_DIR=<dir> [SCAN_LIB_DIR=<lib/>] [SCAN_DB_OUT=<file.db>] node modeller/tests/witness_dxf_scan_set_page.js
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer')), Database = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'better-sqlite3'));
const ROOT = path.join(__dirname, '..', '..'), DIR = process.env.SCAN_SET_DIR || '', LIBD = process.env.SCAN_LIB_DIR || '';
let fails = 0, judged = 0; const ok = (id, c, m) => { judged++; console.log((c ? '§PASS ' : '§FAIL ') + id + (m ? '  ' + m : '')); if (!c) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.db': 'application/octet-stream' };
(async () => {
  const names = DIR && fs.existsSync(DIR) ? fs.readdirSync(DIR).filter(f => /\.dxf$/i.test(f)).sort() : [];
  if (names.length !== 7) { console.log('§SKIP W-L41-PAGE the 7 scan sheets are absent (INCONCLUSIVE: nothing judged): ' + DIR); process.exit(0); }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scanpage-'));
  const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(p.startsWith('/__lib/') ? path.join(LIBD, p.slice(7)) : path.join(ROOT, p), (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(b); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], userDataDir: tmp + '/udd', protocolTimeout: 600000 });
  const pg = await br.newPage(); await pg.setViewport({ width: 1440, height: 810 }); const errs = [], logs = [];
  pg.on('pageerror', e => errs.push(String(e).slice(0, 200))); pg.on('console', m => logs.push(m.text()));
  if (LIBD) { await pg.setBypassServiceWorker(true); await pg.evaluateOnNewDocument(() => { const f0 = window.fetch, LP = '/dxf2bim/library/'; window.fetch = function (u, o) { const t = typeof u === 'string' ? u : (u && u.url) || '', k = t.indexOf(LP); return k >= 0 ? f0.call(this, '/__lib/' + t.slice(k + LP.length), o) : f0.call(this, u, o); }; }); console.log('§LOCAL-LIB the library is served from ' + LIBD + ': this run proves nothing about the published one'); }   // not request interception: it stalled the kernel worker (§L39)
  await pg.goto(base + '/modeller/modeller.html', { waitUntil: 'load', timeout: 120000 }); await pg.waitForFunction('window.__sceneReady===true && window.DxfImportUI && window.Bonsai && window.Bonsai.exportViewerDb && window.__restoreDone===true', { timeout: 180000 });
  await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true });
  const [ch] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(names.map(n => path.join(DIR, n)));
  await pg.waitForFunction('window.DxfImportUI.state.gate && window.DxfImportUI.state.gate.verdict && window.DxfMetaEditor && !window.DxfMetaEditor.state.busy', { timeout: 300000 }); await sleep(2500);
  const g = await pg.evaluate(() => { const v = window.DxfImportUI.state.gate.verdict; return { ok: window.DxfImportUI.state.gate.ok, verdict: v.verdict, blocking: v.blocking.length, accepted: (v.accepted || []).length, adv: v.advisory.map(a => a.code), status: (document.getElementById('stat') || {}).textContent }; });
  console.log('§GATE ' + JSON.stringify(g).slice(0, 400)); console.log((logs.find(l => /§DXF-LIB/.test(l)) || '§DXF-LIB (none logged)').slice(0, 160));
  ok('P1 the scan sheets open and the gate qualifies', g.ok === true && g.verdict === 'qualifies' && g.blocking === 0 && g.accepted > 0, 'blocking=' + g.blocking + ' accepted=' + g.accepted + ' advisory has superseded=' + g.adv.includes('GAP:slab_derivation_superseded'));
  await pg.click('#dxf-convert'); await pg.waitForFunction('window.DxfImportUI.state.last && window.DxfImportUI.state.last.nInserts > 0', { timeout: 300000 }).catch(() => {}); await sleep(1500);
  const L = await pg.evaluate(() => { const l = window.DxfImportUI.state.last; return l ? { ins: l.nInserts, cuts: l.nCuts, fills: l.fills.length } : null; }); console.log('§CONVERTED ' + JSON.stringify(L));
  ok('P2 Convert builds, no hard fail and no refusal', !!(L && L.ins > 0) && !logs.some(l => /LOD400 HARD FAIL|Convert refused|REFUSED/.test(l)), JSON.stringify(L));
  const menu = await pg.evaluate(() => { document.getElementById('b-export').click(); const has = !!document.querySelector('#m-export-panel .me-row[data-key="vdb"]'); document.getElementById('b-export').click(); return has; });
  const R = await pg.evaluate(async () => { const r = await window.Bonsai.exportViewerDb({ download: false }); let s = ''; const u = r.bytes; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return { elements: r.elements, b64: btoa(s) }; });
  const vdb = path.join(tmp, 'scan_set.db'); fs.writeFileSync(vdb, Buffer.from(R.b64, 'base64'));
  const d = new Database(vdb, { readonly: true }), cls = {}; d.prepare("select ifc_class c, count(*) n from elements_meta group by ifc_class").all().forEach(r => { cls[r.c] = r.n; });
  const slabs = d.prepare("select m.guid, b.minZ as minz, b.maxZ as maxz from elements_meta m join element_world_bbox b on b.guid = m.guid where m.ifc_class = 'IfcSlab'").all(); d.close();
  const nOpen = cls.IfcOpeningElement || 0, nAll = Object.values(cls).reduce((a, b) => a + b, 0);
  console.log('§VDB classes ' + JSON.stringify(cls) + ' slabs z ' + JSON.stringify(slabs.map(s => [+s.minz.toFixed(3), +s.maxz.toFixed(3)])));
  ok('P3 Export ▸ Viewer database is on the menu; its DB = the inserts + one IfcOpeningElement per cut', menu && L && nAll === L.ins + nOpen && nOpen === L.cuts, 'menu=' + menu + ' elements_meta=' + nAll + ' inserts=' + (L && L.ins) + ' openings=' + nOpen + ' cuts=' + (L && L.cuts));
  ok('P5 the DB carries the house ground slab, z -0.275..0', slabs.some(s => Math.abs(s.minz + 0.275) < 0.001 && Math.abs(s.maxz) < 0.001), slabs.length + ' slabs');
  if (process.env.SCAN_EXPECT_STAIR) ok('P6 §L43 the DB carries the stair: one IfcStairFlight', (cls.IfcStairFlight || 0) === 1, 'IfcStairFlight=' + (cls.IfcStairFlight || 0));
  if (process.env.SCAN_DB_OUT) { fs.copyFileSync(vdb, process.env.SCAN_DB_OUT); console.log('§VDB kept ' + process.env.SCAN_DB_OUT + ' bytes=' + fs.statSync(vdb).size); }
  const fv = path.join(ROOT, 'viewer', 'buildings', '_w_scan_set_test.db'); fs.copyFileSync(vdb, fv);
  const p = await br.newPage(); await p.setViewport({ width: 1280, height: 720 }); const verr = []; p.on('pageerror', e => verr.push(String(e).slice(0, 200)));
  await p.goto(base + '/viewer/viewer.html?db=buildings/_w_scan_set_test.db', { waitUntil: 'load', timeout: 120000 }); let t = '';
  for (let i = 0; i < 120; i++) { await sleep(1000); t = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 200)); if (/DONE/.test(t)) break; }
  try { fs.unlinkSync(fv); } catch (e) { }
  const nBodies = L ? L.ins : -1; console.log('§VIEWER ' + t.slice(0, 160) + ' | viewer page errors=' + verr.length);
  ok('P4 the Viewer opens the exported database as the building', new RegExp('DONE.*' + nBodies + ' elements').test(t), t.slice(0, 120));
  ok('E 0 page errors (Modeller and Viewer)', errs.length === 0 && verr.length === 0, errs.concat(verr).join(' | ').slice(0, 300));
  await br.close(); srv.close();
  console.log('§RESULT judged=' + judged + ' fails=' + fails + ' ' + (fails ? 'FAIL' : judged ? 'PASS' : 'INCONCLUSIVE')); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('§FAIL W-L41-PAGE crashed ' + String(e && e.stack || e).slice(0, 700)); process.exit(1); });
