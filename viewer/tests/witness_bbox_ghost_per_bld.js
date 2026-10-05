#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS §BBOX_GHOST_PER_BLD (2026-10-06, bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §MERGED_DB)
// Scope: the bbox view (Alt+Z bbox state / Find lens ghost, navigate_find.js _buildMergedGhost). Read the log after every run.
//
// ISSUE THIS PROVES OR DISPROVES: "the merged road shows no bounding boxes" — the shell-or-all decision was scene-wide;
// road + bridge = 587 ARC envelope of 19,903 (2.9 %) → "envelope only" → the 15,164-element civil road (0 envelope
// classes) got 0 boxes. GREEN = civil DB: boxes = every element of each civil 0-envelope building + the envelope of the
// others (oracle from sqlite3). NON-IMPACT: a fleet multi-building DB (Clinic, 5 buildings, 0 civil rows) draws exactly the
// box count the scene-wide rule gives (oracle: sqlite3, same rule as main).
// CAN REPORT ITS OWN FAILURE: INCONCLUSIVE (load failed / civil DB has no civil building), RED per DB.
// Env: ROOT · CIVIL (default ~/Downloads/JALAN JELAPANG IFC/Merged.db) · FLEET (default ~/bim-ootb/buildings/Clinic_extracted.db)
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os'), { execFileSync } = require('child_process');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const ROOT = path.resolve(process.env.ROOT || path.join(__dirname, '..', '..'));
const CIVIL = process.env.CIVIL || path.join(os.homedir(), 'Downloads', 'JALAN JELAPANG IFC', 'Merged.db');
const FLEET = process.env.FLEET || path.join(os.homedir(), 'bim-ootb', 'buildings', 'Clinic_extracted.db');
const GPU = process.env.GPU || 'sw', PORT = +(process.env.PORT || 8580);
const LOG = process.env.LOG || '/tmp/witness_bbox_ghost_per_bld.log';
const out = fs.createWriteStream(LOG, { flags: 'w' });
function log(l) { out.write(l + '\n'); console.log(l); }
const SERVE = { '/__civil.db': CIVIL, '/__fleet.db': FLEET };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2', '.sql': 'application/sql' };
const server = http.createServer((req, res) => { try {
  const u = decodeURIComponent(req.url.split('?')[0]); let fp = SERVE[u] || path.join(ROOT, u.replace(/^\/+/, ''));
  if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) fp = path.join(fp, 'index.html');
  if (!fs.existsSync(fp)) { res.writeHead(404); res.end('404'); return; }
  const st = fs.statSync(fp); res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
  fs.createReadStream(fp).pipe(res); } catch (e) { res.writeHead(500); res.end(String(e)); } });

const ENV = "(ifc_class GLOB 'IfcWall*' OR ifc_class GLOB 'IfcSlab*' OR ifc_class GLOB 'IfcRoof*' OR ifc_class GLOB 'IfcCurtainWall*' OR ifc_class GLOB 'IfcCovering*' OR ifc_class GLOB 'IfcPlate*')";
const CIVIL_CODES = "('ROAD','FURNITURE','LIGHTING','DRAINAGE','SIGNAGE','MARKING','EARTHWORK','GEOTECH','GABION','CHAINAGE','ROW')";
function oracle(db) {   // per building: n, env, civ (rows with a transform centre — same population the viewer reads)
  const rows = execFileSync('sqlite3', ['-readonly', db, `SELECT COALESCE(m.building,''), COUNT(*), SUM(${ENV}), SUM(m.discipline IN ${CIVIL_CODES}) FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid WHERE t.center_x IS NOT NULL GROUP BY 1`]).toString().trim().split('\n').map(l => { const [b, n, e, c] = l.split('|'); return { b, n: +n, env: +e, civ: +c }; });
  const total = rows.reduce((s, r) => s + r.n, 0), envAll = rows.reduce((s, r) => s + r.env, 0);
  const sceneWide = (envAll === 0 || (envAll / total < 0.02 && envAll < 200)) ? total : envAll;   // main's rule
  const civB = rows.filter(r => r.civ > 0 && r.env === 0);
  const perBld = (rows.length > 1 && civB.length) ? rows.reduce((s, r) => s + (civB.includes(r) ? r.n : r.env), 0) : sceneWide;
  return { rows, sceneWide, perBld, civilBuildings: civB.map(r => r.b) };
}

async function ghostCount(browser, url) {
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
  page.on('console', m => out.write('[con] ' + m.text() + '\n'));
  page.on('pageerror', e => out.write('[pageerror] ' + e.message + '\n'));
  await page.goto(`http://127.0.0.1:${PORT}/viewer/viewer.html?db=${url}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.APP && window.APP.activeBuilding && window.APP.buildingsRendered && window.APP.buildingsRendered.has(window.APP.activeBuilding) && !window.APP.streaming, { timeout: 1800000, polling: 1000 });
  let stable = 0; for (let i = 0; i < 300 && stable < 4; i++) { await new Promise(r => setTimeout(r, 1500));
    stable = (await page.evaluate(() => !!window.APP.streaming || (window.APP._mergePending || []).length > 0)) ? 0 : stable + 1; }
  await page.evaluate(() => window.APP.loadNavigate());
  const n = await page.evaluate(() => { const ok = window.toggleGhostXray && window.toggleGhostXray(); if (!ok) return null;
    let n = 0; window.APP.scene.traverse(o => { if (o.isInstancedMesh && o.material && o.material.wireframe && o.renderOrder === -1) n += o.count; }); return n; });
  await page.close(); return n;
}

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const gpuArgs = { sw: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], real: ['--use-angle=gl-egl', '--ignore-gpu-blocklist'] }[GPU] || [];
  const browser = await puppeteer.launch({ headless: true, userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'bgp-')), protocolTimeout: 30 * 60 * 1000, args: ['--no-sandbox', '--window-size=1300,840'].concat(gpuArgs) });
  const v = {};
  try {
    const oc = oracle(CIVIL), of = oracle(FLEET);
    log('§BGP_ORACLE civil ' + JSON.stringify(oc));
    log('§BGP_ORACLE fleet ' + JSON.stringify(of));
    const nc = await ghostCount(browser, '/__civil.db'); log(`§BGP_CIVIL boxes=${nc} expect=${oc.perBld} (scene-wide rule would give ${oc.sceneWide})`);
    v.civil = !oc.civilBuildings.length ? 'INCONCLUSIVE no civil 0-envelope building' : nc === oc.perBld ? 'GREEN' : 'RED';
    const nf = await ghostCount(browser, '/__fleet.db'); log(`§BGP_FLEET boxes=${nf} expect=${of.sceneWide} (unchanged rule)`);
    v.fleet = of.civilBuildings.length ? 'INCONCLUSIVE fleet DB has civil rows' : nf === of.sceneWide ? 'GREEN' : 'RED';
  } catch (e) { log('§BGP_ERR ' + e.message); }
  const all = ['civil', 'fleet'].map(k => k + '=' + (v[k] || 'INCONCLUSIVE'));
  const verdict = all.every(s => s.endsWith('GREEN')) ? 'GREEN' : all.some(s => /RED/.test(s)) ? 'RED' : 'INCONCLUSIVE';
  log('§BGP_VERDICT ' + verdict + ' ' + all.join(' '));
  await browser.close(); server.close(); out.end(); process.exit(verdict === 'GREEN' ? 0 : verdict === 'RED' ? 1 : 2);
})();
