#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS §EW_VOLUME_SURFACE (2026-10-06, bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §NEXT_WAVE §EW_VOLUME_SURFACE)
// Scope: the earthworks volume line on THREE surfaces — Alt+C ground card (viewer.html, A.roadPanelsCardOf('ground')),
// model_check_report.html (#ew-volume-line, Quantities card), boq_charts.html (#ew-volume-line, EARTHWORK row). No bake.
// Read the log after every run — the exit code is not evidence.
//
// ISSUES THIS PROVES OR DISPROVES: (1) the SAME string is shown on all three surfaces (one owner, earthworks_volume.js, no second
// computation); (2) it equals the string built from the INDEPENDENT numpy values (earthworks_volume_independent.py) and the literal
// "≈ 22,048 m³ (48 open edges, ±2.3 m³)" on CivilWorks.db; (3) the old 'planned' card no longer carries the volume row; (4) a building
// (Duplex) shows NO line on any surface; (5) RED control = ROOT at origin/main: the report/boq lines are ABSENT there.
// A surface that did not load (no page marker) -> INCONCLUSIVE, never PASS. 
// Env: ROOT · BLD · BLD_DIR · BLD2_DIR (building for the NON-IMPACT control; default ~/bim-ootb/buildings) · GPU=sw|real · PORT · LOG · SKIP_VIEWER=1
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os'), cp = require('child_process');
const { Witness } = require('../../witness_kit/contract');
const ROOT = path.resolve(process.env.ROOT || path.join(__dirname, '..', '..'));
const BLD = process.env.BLD || 'CivilWorks', BLD2 = process.env.BLD2 || 'Duplex_extracted';
const BLD_DIR = process.env.BLD_DIR || path.join(os.homedir(), 'Downloads', 'JALAN JELAPANG IFC');
const BLD2_DIR = process.env.BLD2_DIR || path.join(os.homedir(), 'bim-ootb', 'buildings');
const GPU = process.env.GPU || 'sw', PORT = +(process.env.PORT || 8583), LITERAL = '≈ 22,048 m³ (48 open edges, ±2.3 m³)';
const LOG = process.env.LOG || '/tmp/witness_ew_volume_surfaces.log';
const logStream = fs.createWriteStream(LOG, { flags: 'w' });
function log(l) { logStream.write(l + '\n'); console.log(l); }
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.db': 'application/octet-stream', '.png': 'image/png', '.svg': 'image/svg+xml', '.hdr': 'application/octet-stream', '.gz': 'application/gzip', '.webp': 'image/webp', '.woff2': 'font/woff2', '.sql': 'application/sql', '.bin': 'application/octet-stream' };
const server = http.createServer((req, res) => { try {
  const u = decodeURIComponent(req.url.split('?')[0]); let fp = path.join(ROOT, u.replace(/^\/+/, ''));
  if (u.startsWith('/buildings/')) { const n = u.slice('/buildings/'.length); for (const d of [BLD_DIR, BLD2_DIR]) if (fs.existsSync(path.join(d, n))) { fp = path.join(d, n); break; } }
  if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) fp = path.join(fp, 'index.html');
  if (!fs.existsSync(fp)) { res.writeHead(404); res.end('404'); return; }
  const st = fs.statSync(fp); res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
  fs.createReadStream(fp).pipe(res); } catch (e) { res.writeHead(500); res.end(String(e)); } });

async function newPage(browser, tag) {
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
  page.on('console', m => logStream.write('[con:' + tag + '] ' + m.text() + '\n'));
  page.on('pageerror', e => logStream.write('[pageerror:' + tag + '] ' + e.message + '\n'));
  return page;
}
const base = `http://127.0.0.1:${PORT}/viewer/`;
// each surface -> { loaded: bool (page really rendered), line: string|null }
async function reportSurface(browser, bld) {
  const page = await newPage(browser, 'report:' + bld);
  try {
    await page.goto(base + 'model_check_report.html?db=/buildings/' + bld + '.db', { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => document.querySelector('.stat-cards') || /Load the model first/.test(document.getElementById('info').textContent), { timeout: 300000, polling: 500 });
    return await page.evaluate(() => ({ loaded: !!document.querySelector('.stat-cards'), line: (document.getElementById('ew-volume-line') || {}).textContent || null,
      quantitiesLabel: !!document.getElementById('ew-volume-card') }));
  } catch (e) { return { loaded: false, err: e.message }; } finally { await page.close(); }
}
async function boqSurface(browser, bld) {
  const page = await newPage(browser, 'boq:' + bld);
  try {
    await page.goto(base + 'boq_charts.html?db=/buildings/' + bld + '.db', { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => document.querySelector('tr.total-row') || /Load the building first/.test(document.getElementById('info').textContent), { timeout: 300000, polling: 500 });
    return await page.evaluate(() => ({ loaded: !!document.querySelector('tr.total-row'), line: (document.getElementById('ew-volume-line') || {}).textContent || null,
      row: document.querySelector('tr.ew-volume-row') ? document.querySelector('tr.ew-volume-row').firstChild.textContent : null }));
  } catch (e) { return { loaded: false, err: e.message }; } finally { await page.close(); }
}
async function viewerSurface(browser, bld) {
  const page = await newPage(browser, 'viewer:' + bld);
  try {
    await page.goto(base + 'viewer.html?db=/buildings/' + bld + '.db', { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.APP && window.APP.activeBuilding && window.APP.buildingsRendered && window.APP.buildingsRendered.has(window.APP.activeBuilding) && !window.APP.streaming && (!window.APP.isCivilModel() || window.APP._civilLabels), { timeout: 1800000, polling: 1000 });
    return await page.evaluate(() => { const A = window.APP, g = typeof A.roadPanelsCardOf === 'function' ? A.roadPanelsCardOf('ground') : undefined, p = typeof A.roadPanelsCardOf === 'function' ? A.roadPanelsCardOf('planned') : undefined;
      const vol = c => c ? (c.rows.find(r => r.vol) || {}).value || null : null;
      return { loaded: true, civil: A.isCivilModel(), hasCards: typeof A.roadPanelsCardOf === 'function', groundCard: !!g, line: vol(g) != null ? String(vol(g)) : null, plannedVol: vol(p) != null ? String(vol(p)) : null, plannedLabels: p ? p.rows.map(r => r.label) : null }; });
  } catch (e) { return { loaded: false, err: e.message }; } finally { await page.close(); }
}
(async () => {
  const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const gpuArgs = { sw: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], real: ['--use-angle=gl-egl', '--ignore-gpu-blocklist'] }[GPU] || [];
  const browser = await puppeteer.launch({ headless: true, userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'ews-profile-')), protocolTimeout: 30 * 60 * 1000, args: ['--no-sandbox', '--window-size=1300,840'].concat(gpuArgs) });
  const R = { root: ROOT, civil: {}, bld: {} };
  try {
    R.civil.report = await reportSurface(browser, BLD); R.bld.report = await reportSurface(browser, BLD2);
    R.civil.boq = await boqSurface(browser, BLD); R.bld.boq = await boqSurface(browser, BLD2);
    if (!process.env.SKIP_VIEWER) { R.civil.viewer = await viewerSurface(browser, BLD); R.bld.viewer = await viewerSurface(browser, BLD2); }
  } finally { await browser.close(); server.close(); }
  let indep; try { indep = JSON.parse(cp.execFileSync('python3', ['-I', path.join(__dirname, 'earthworks_volume_independent.py'), path.join(BLD_DIR, BLD + '.db')], { maxBuffer: 1 << 26 }).toString()); }
  catch (e) { log('§EWS verdict=INCONCLUSIVE reason=independent computation failed: ' + e.message); process.exitCode = 2; return; }
  const iV = indep.reduce((s, x) => s + x.V, 0), iB = indep.reduce((s, x) => s + x.B, 0), iE = indep.reduce((s, x) => s + x.E, 0);
  const expected = '≈ ' + Math.round(iV).toLocaleString('en-US') + ' m³ (' + iE + ' open edges, ±' + (Math.ceil(iB * 10) / 10).toFixed(1) + ' m³)';
  log('§EWS_INDEP V=' + iV.toFixed(3) + ' B=' + iB.toFixed(3) + ' E=' + iE + ' expected="' + expected + '"');
  for (const k of Object.keys(R.civil)) log('§EWS_SURFACE civil ' + k + ' ' + JSON.stringify(R.civil[k]));
  for (const k of Object.keys(R.bld)) log('§EWS_SURFACE building ' + k + ' ' + JSON.stringify(R.bld[k]));
  const surfaces = Object.keys(R.civil);
  const notLoaded = [].concat(surfaces.map(k => R.civil[k].loaded ? null : 'civil.' + k), surfaces.map(k => R.bld[k].loaded ? null : 'building.' + k)).filter(Boolean);
  if (notLoaded.length) { log('§EWS verdict=INCONCLUSIVE reason=surface did not load: ' + notLoaded.join(',')); process.exitCode = 2; return; }
  R.expected = expected;
  const sv = surfaces.length;
  Witness('ew_volume_surfaces')
    .population(() => [R])
    .schema({ type: 'object', required: ['civil', 'bld', 'expected'] })
    .invariant('not vacuous: ' + sv + ' surfaces loaded on the civil model and on the building', rs => rs.every(r => sv === (process.env.SKIP_VIEWER ? 2 : 3)))
    .invariant('civil: EVERY surface shows a line (RED on origin/main: report/boq lines absent)', rs => rs.every(r => surfaces.every(k => typeof r.civil[k].line === 'string' && r.civil[k].line.length > 0)))
    .invariant('civil: all surfaces show the SAME string (one owner)', rs => rs.every(r => new Set(surfaces.map(k => r.civil[k].line)).size === 1))
    .invariant('civil: the string equals the one built from the independent numpy V/B/E', rs => rs.every(r => surfaces.every(k => r.civil[k].line === r.expected)))
    .invariant('civil: the string equals the literal "' + LITERAL + '"', rs => rs.every(r => surfaces.every(k => r.civil[k].line === LITERAL)))
    .invariant('civil: the report line sits on a Quantities card; the 4D/5D line on an EARTHWORK row', rs => rs.every(r => r.civil.report.quantitiesLabel && r.civil.boq.row === 'EARTHWORK'))
    .invariant('civil viewer: volume is on the ground card and NOT on the planned card', rs => rs.every(r => !r.civil.viewer || (r.civil.viewer.groundCard && r.civil.viewer.plannedVol === null)))
    .invariant('NON-IMPACT building: no line on any surface (Duplex)', rs => rs.every(r => surfaces.every(k => r.bld[k].line === null)))
    .redControl(rs => rs.map(r => { const c = JSON.parse(JSON.stringify(r)); c.civil.report.line = c.civil.report.line + ' '; c.bld.boq.line = 'x'; return c; }))
    .run();
  logStream.end();
})();
