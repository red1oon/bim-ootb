#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS §CIVIL_FRESH_IMPORT_FLY (2026-10-05, bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §X)
// Scope: the user's real path — drop the JELAPANG IFC set into the viewer importer (A.importMultiIFC), open the
// saved import (A.openImported → import:// URL), press Fly (A.toggleFlyAround). Read the log after every run.
//
// ISSUE THIS PROVES OR DISPROVES: "Fly Tour on JELAPANG: the timeline scrubber does not appear" — the earlier
// test used a DB pre-built in Node, never the browser import. GREEN = after a FRESH browser import the opened
// model has element_psets with MAINLINE rows, buildTour returns the §CIVIL_ROUTE actions, walkMode is on and
// the scrubber is visible. Night fixtures (§V/§W) are read off the same opened model: fixture count > 0.
// CAN REPORT ITS OWN FAILURE: INCONCLUSIVE (import/open/stream failed — named), RED CONTROL (witness_kit).
// Env: ROOT · IFC_DIR · FILES (comma list; default every *.ifc in IFC_DIR) · GPU=sw|real · PORT · LOG
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const { Witness } = require('../../witness_kit/contract');
const ROOT = path.resolve(process.env.ROOT || path.join(__dirname, '..', '..'));
const IFC_DIR = process.env.IFC_DIR || path.join(os.homedir(), 'Downloads', 'JALAN JELAPANG IFC', 'IFC');
const FILES = process.env.FILES ? process.env.FILES.split(',') : fs.readdirSync(IFC_DIR).filter(f => /\.ifc$/i.test(f)).sort();
const GPU = process.env.GPU || 'sw';
const PORT = +(process.env.PORT || 8575);
const LOG = process.env.LOG || '/tmp/witness_civil_fresh_import_fly.log';
const logStream = fs.createWriteStream(LOG, { flags: 'w' });
function log(l) { logStream.write(l + '\n'); console.log(l); }
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.db': 'application/octet-stream', '.png': 'image/png', '.svg': 'image/svg+xml', '.hdr': 'application/octet-stream', '.gz': 'application/gzip', '.webp': 'image/webp', '.woff2': 'font/woff2', '.sql': 'application/sql', '.bin': 'application/octet-stream', '.ifc': 'application/octet-stream' };
const server = http.createServer((req, res) => { try {
  const u = decodeURIComponent(req.url.split('?')[0]);
  let fp = u.startsWith('/__ifc/') ? path.join(IFC_DIR, u.slice('/__ifc/'.length)) : path.join(ROOT, u.replace(/^\/+/, ''));
  if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) fp = path.join(fp, 'index.html');
  if (!fs.existsSync(fp)) { res.writeHead(404); res.end('404'); return; }
  const st = fs.statSync(fp); res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
  fs.createReadStream(fp).pipe(res); } catch (e) { res.writeHead(500); res.end(String(e)); } });

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const gpuArgs = { sw: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], real: ['--use-angle=gl-egl', '--ignore-gpu-blocklist'] }[GPU] || [];
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cfif-profile-'));
  const browser = await puppeteer.launch({ headless: true, userDataDir: profile, protocolTimeout: 60 * 60 * 1000,
    args: ['--no-sandbox', '--window-size=1300,840', '--js-flags=--max-old-space-size=8192'].concat(gpuArgs) });
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
  const tagged = [];
  page.on('console', m => { const t = m.text(); logStream.write('[con] ' + t + '\n');
    if (/§(MULTI_IMPORT|CIVIL_PSETS|CIVIL_ROUTE|TOUR_NO_ROOMS|FLY_INJECT|TOUR_CACHE|UNITS_V|IMPORT_OPEN|NIGHT_|PHOTO_EMBER|LAMP_)/.test(t) || /START cinematic|No walk data/.test(t)) { tagged.push(t); console.log('  ' + t.slice(0, 300)); } });
  page.on('pageerror', e => logStream.write('[pageerror] ' + e.message + '\n'));
  const R = { files: FILES.length };
  try {
    await page.evaluateOnNewDocument(() => { window.__opened = []; window.open = u => { window.__opened.push(u); return { focus() {} }; }; });
    const base = `http://127.0.0.1:${PORT}/viewer/viewer.html`; log('§CFIF_NAV ' + base + ' gpu=' + GPU + ' files=' + FILES.join('|'));
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.APP && window.APP.importMultiIFC && window.APP.openImported, { timeout: 300000, polling: 500 });
    const t0 = Date.now();
    R.importKey = await page.evaluate(async (names) => {
      const files = [];
      for (const n of names) { const b = await (await fetch('/__ifc/' + encodeURIComponent(n))).blob(); files.push(new File([b], n)); }
      const r = await window.APP.importMultiIFC(files);
      return r && r.key;
    }, FILES);
    R.importSec = +((Date.now() - t0) / 1000).toFixed(1);
    log('§CFIF_IMPORTED key=' + R.importKey + ' sec=' + R.importSec);
    if (!R.importKey) throw new Error('import returned no key');
    await page.evaluate(k => window.APP.openImported(k), R.importKey);
    const url = await page.evaluate(() => window.__opened[0]);
    log('§CFIF_OPEN ' + url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.APP && window.APP.activeBuilding && window.APP.buildingsRendered && window.APP.buildingsRendered.has(window.APP.activeBuilding) && !window.APP.streaming, { timeout: 1800000, polling: 1000 });
    Object.assign(R, await page.evaluate(() => {
      const A = window.APP, q = s => { try { return A.dbQuery(s); } catch (e) { return [['ERR ' + e.message]]; } };
      const has = q("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='element_psets'")[0][0];
      return { building: A.activeBuilding, elements: q('SELECT COUNT(*) FROM elements_meta')[0][0], hasPsets: has,
        psetRows: has ? q('SELECT COUNT(*) FROM element_psets')[0][0] : 0,
        mainline: has ? q("SELECT COUNT(*) FROM element_psets WHERE name='01_Component_Name' AND value='MAINLINE'")[0][0] : 0,
        signals: has ? q("SELECT COUNT(DISTINCT guid) FROM element_psets WHERE value LIKE 'TRAFFIC SIGNAL%' AND value NOT LIKE '%AHEAD%'")[0][0] : 0,
        lighting: q("SELECT COUNT(*) FROM elements_meta WHERE discipline='LIGHTING'")[0][0] };
    }));
    log('§CFIF_MODEL ' + JSON.stringify(R));
    await page.evaluate(() => window.APP.toggleFlyAround());
    await page.waitForFunction(() => { const A = window.APP; return (A.walkMode && A.walkActions && A.walkActions.length) || (A.flyTargets && A.flyTargets.length); }, { timeout: 600000, polling: 500 }).catch(() => {});
    await new Promise(r => setTimeout(r, 3000));
    Object.assign(R, await page.evaluate(() => {
      const A = window.APP;
      return { walkMode: !!A.walkMode, actions: (A.walkActions || []).length, firstAction: A.walkActions && A.walkActions[0] ? A.walkActions[0].name || A.walkActions[0].type : '',
        orbitFallback: !A.walkMode && !!(A.flyTargets && A.flyTargets.length), scrubVisible: !!(A._scrubVisible && A._scrubVisible()),
        nightFixtures: (A._nightFixtures || A._nightFixtureList || []).length || 0 };
    }));
    R.civilRouteLine = tagged.filter(t => /§CIVIL_ROUTE /.test(t)).pop() || '';
    log('§CFIF_FLY ' + JSON.stringify({ walkMode: R.walkMode, actions: R.actions, firstAction: R.firstAction, orbitFallback: R.orbitFallback, scrubVisible: R.scrubVisible }));
  } catch (e) { log('§CFIF verdict=INCONCLUSIVE reason=' + e.message); R.err = e.message; process.exitCode = 2; }
  finally { await browser.close(); server.close(); }
  if (R.err) { logStream.end(); return; }
  Witness('civil_fresh_import_fly')
    .population(() => [R])
    .schema({ type: 'object', required: ['importKey', 'elements', 'hasPsets', 'mainline', 'walkMode', 'actions', 'scrubVisible'] })
    .invariant('fresh import kept property labels (element_psets present, MAINLINE rows ≥ 10)', rs => rs.every(r => r.hasPsets && r.mainline >= 10))
    .invariant('Fly built the civil road route (§CIVIL_ROUTE logged, first action = Start of highway)', rs => rs.every(r => r.civilRouteLine && r.firstAction === 'Start of highway'))
    .invariant('tour is playing, not the orbit fallback', rs => rs.every(r => r.walkMode && r.actions > 0 && !r.orbitFallback))
    .invariant('timeline scrubber visible', rs => rs.every(r => r.scrubVisible))
    .redControl(rs => rs.map(r => Object.assign(r, { scrubVisible: false })))
    .run();
  logStream.end();
})();
