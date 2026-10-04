#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS §CIVIL_NIGHT_LAMPS (2026-10-05, bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §W/§X)
// Scope: (1) Night mode on a civil model lights its road lamps + traffic signals (A._loadNightFixtures, the one
// owner that also feeds Alt+S lamps via A._nightFixtureWorldPositions); (2) Fly on a civil import that has NO
// property labels (saved before §CIVIL_PSETS) still flies the road (§CIVIL_ROUTE_LAZY) instead of the orbit fallback.
// Read the log after every run — the exit code is not evidence.
//
// ISSUES THIS PROVES OR DISPROVES: "Night mode finds zero fixtures on JELAPANG" (names are IfcBuildingElementProxy_<id>,
// the name vocabulary misses them → one synthetic storey lamp in the middle of a 2 km road), and "Fly shows no scrubber
// on an older import". GREEN = fixtures come from civil-lighting with heads read from the mesh, every head is near
// its column top and inside its column's plan box, no stray below the road is lit; Fly with element_psets dropped
// plays a road-discipline tour with the scrubber visible.
// CAN REPORT ITS OWN FAILURE: INCONCLUSIVE (load failed), VACUOUS (rotation never exercised — logged), RED CONTROL.
// Env: ROOT · BLD (default JELAPANG_AFTER) · BLD_DIR · GPU=sw|real · PORT · LOG
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const { Witness } = require('../../witness_kit/contract');
const ROOT = path.resolve(process.env.ROOT || path.join(__dirname, '..', '..'));
const BLD = process.env.BLD || 'JELAPANG_AFTER';
const BLD_DIR = process.env.BLD_DIR || path.join(os.homedir(), 'Downloads', 'JALAN JELAPANG IFC');
const GPU = process.env.GPU || 'sw';
const PORT = +(process.env.PORT || 8576);
const LOG = process.env.LOG || '/tmp/witness_civil_night_lamps.log';
const logStream = fs.createWriteStream(LOG, { flags: 'w' });
function log(l) { logStream.write(l + '\n'); console.log(l); }
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.db': 'application/octet-stream', '.png': 'image/png', '.svg': 'image/svg+xml', '.hdr': 'application/octet-stream', '.gz': 'application/gzip', '.webp': 'image/webp', '.woff2': 'font/woff2', '.sql': 'application/sql', '.bin': 'application/octet-stream' };
const server = http.createServer((req, res) => { try {
  const u = decodeURIComponent(req.url.split('?')[0]); let fp = path.join(ROOT, u.replace(/^\/+/, ''));
  if (!fs.existsSync(fp) && u.startsWith('/buildings/')) fp = path.join(BLD_DIR, u.slice('/buildings/'.length));
  if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) fp = path.join(fp, 'index.html');
  if (!fs.existsSync(fp)) { res.writeHead(404); res.end('404'); return; }
  const st = fs.statSync(fp); res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
  fs.createReadStream(fp).pipe(res); } catch (e) { res.writeHead(500); res.end(String(e)); } });

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const gpuArgs = { sw: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], real: ['--use-angle=gl-egl', '--ignore-gpu-blocklist'] }[GPU] || [];
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cnl-profile-'));
  const browser = await puppeteer.launch({ headless: true, userDataDir: profile, protocolTimeout: 30 * 60 * 1000, args: ['--no-sandbox', '--window-size=1300,840'].concat(gpuArgs) });
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
  const tagged = [];
  page.on('console', m => { const t = m.text(); logStream.write('[con] ' + t + '\n'); if (/§(NIGHT_CIVIL_LAMPS|NIGHT_MODE|GROUND_Y|GROUND_ROBUST|CIVIL_ROUTE)/.test(t) || /START cinematic|No walk data/.test(t)) { tagged.push(t); console.log('  ' + t.slice(0, 320)); } });
  page.on('pageerror', e => logStream.write('[pageerror] ' + e.message + '\n'));
  const R = {};
  try {
    const url = `http://127.0.0.1:${PORT}/viewer/viewer.html?db=/buildings/${BLD}.db`; log('§CNL_NAV ' + url + ' gpu=' + GPU);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.APP && window.APP.activeBuilding && window.APP.buildingsRendered && window.APP.buildingsRendered.has(window.APP.activeBuilding) && !window.APP.streaming, { timeout: 1800000, polling: 1000 });
    Object.assign(R, await page.evaluate(() => {
      const A = window.APP;
      A.toggleNightMode();
      const F = A._nightFixtures || [];
      const q = s => A.dbQuery(s);
      const cols = {}; q("SELECT m.guid, t.center_x, t.center_y, t.center_z, t.bbox_x, t.bbox_y, t.bbox_z FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid WHERE m.discipline='LIGHTING'")
        .forEach(r => { cols[r[0]] = r; });
      const civil = F.filter(f => f.civil);
      // each head row's column = the guid on its first head; later heads of the same column carry guid null → pair by order
      let lastCol = null, inBox = 0, nearTop = 0, belowGround = 0, offCentre = 0, worst = 0;
      civil.forEach(f => {
        if (f.guid) lastCol = cols[f.guid];
        const c = lastCol; if (!c) return;
        const top = c[3] + c[6] / 2;
        if (f.x >= c[1] - c[4] / 2 - 0.05 && f.x <= c[1] + c[4] / 2 + 0.05 && f.y >= c[2] - c[5] / 2 - 0.05 && f.y <= c[2] + c[5] / 2 + 0.05) inBox++;
        if (Math.abs(f.z - top) <= 0.05) nearTop++;
        if (typeof A.groundIfcZ === 'number' && c[3] - c[6] / 2 < A.groundIfcZ - 1) belowGround++;
        const d = Math.hypot(f.x - c[1], f.y - c[2]); if (d > 0.5) offCentre++; worst = Math.max(worst, d);
      });
      // independent stray oracle (NOT the module's gap rule): a column is buried if its TOP is below the lowest bottom of
      // every non-LIGHTING element on the site. Tall columns (≥ 2.5 m, the module's column rule) not buried must ALL be lit
      // (over-rejection — a single ground datum rejected 67 on a climbing road; a neighbour rule rejected a real signal).
      const minOther = q("SELECT MIN(t.center_z - t.bbox_z/2) FROM element_transforms t JOIN elements_meta m ON m.guid=t.guid WHERE m.discipline IS NOT 'LIGHTING'")[0][0];
      const litCol = {}; civil.forEach(f => { if (f.guid) litCol[f.guid] = 1; });
      let tallUpper = 0, tallUpperLit = 0, lowerLit = 0, lower = 0;
      Object.values(cols).forEach(c => { const top = c[3] + c[6] / 2; if (top < minOther) { lower++; if (litCol[c[0]]) lowerLit++; } else if (c[6] >= 2.5) { tallUpper++; if (litCol[c[0]]) tallUpperLit++; } });
      const out = { minOtherBottom: +minOther.toFixed(1), buried: lower, lowerCluster: lower, lowerLit, tallUpper, tallUpperLit, source: A._nightFixtureSource || '', fixtures: F.length, civilHeads: civil.length, civilColumns: civil.filter(f => f.guid).length,
        inBox, nearTop, belowGround, offCentre, maxHeadOffsetM: +worst.toFixed(2), groundZ: A.groundIfcZ,
        signalsExpected: (function () { try { return q("SELECT COUNT(DISTINCT guid) FROM element_psets WHERE value LIKE 'TRAFFIC SIGNAL%' AND value NOT LIKE '%AHEAD%'")[0][0]; } catch (e) { return -1; } })(), signals: (function () { const lit = {}; civil.forEach(f => { if (f.guid) lit[f.guid] = 1; }); let n = 0; try { q("SELECT DISTINCT guid FROM element_psets WHERE value LIKE 'TRAFFIC SIGNAL%' AND value NOT LIKE '%AHEAD%'").forEach(r => { if (lit[r[0]]) n++; }); } catch (e) {} return n; })(), worldPositions: (A._nightFixtureWorldPositions() || []).length };
      A.toggleNightMode();
      return out;
    }));
    R.civilLine = tagged.filter(t => /§NIGHT_CIVIL_LAMPS/.test(t)).pop() || '';
    log('§CNL_NIGHT ' + JSON.stringify(R));
    // (2) lazy route: drop the labels table in THIS page's in-memory DB only (no file is changed), bust the tour cache, Fly
    await page.evaluate(() => { const A = window.APP; A.db.run('DROP TABLE IF EXISTS element_psets'); if (A._tourCacheBust) A._tourCacheBust(); A._tourCachedRoute = null; A.toggleFlyAround(); });
    await page.waitForFunction(() => { const A = window.APP; return (A.walkMode && A.walkActions && A.walkActions.length) || (A.flyTargets && A.flyTargets.length); }, { timeout: 600000, polling: 500 }).catch(() => {});
    await new Promise(r => setTimeout(r, 2000));
    Object.assign(R, await page.evaluate(() => { const A = window.APP; return { lazyWalk: !!A.walkMode, lazyActions: (A.walkActions || []).length, lazyFirst: A.walkActions && A.walkActions[0] ? A.walkActions[0].name : '', lazyScrub: !!(A._scrubVisible && A._scrubVisible()) }; }));
    R.lazyLine = tagged.filter(t => /§CIVIL_ROUTE_LAZY/.test(t)).pop() || '';
    log('§CNL_LAZY ' + JSON.stringify({ lazyWalk: R.lazyWalk, lazyActions: R.lazyActions, lazyFirst: R.lazyFirst, lazyScrub: R.lazyScrub, lazyLine: R.lazyLine.slice(0, 200) }));
  } catch (e) { log('§CNL verdict=INCONCLUSIVE reason=' + e.message); R.err = e.message; process.exitCode = 2; }
  finally { await browser.close(); server.close(); }
  if (R.err) { logStream.end(); return; }
  Witness('civil_night_lamps')
    .population(() => [R])
    .schema({ type: 'object', required: ['source', 'fixtures', 'civilHeads', 'civilColumns', 'inBox', 'nearTop'] })
    .invariant('night: fixtures come from civil lighting (not the synthetic storey lamp)', rs => rs.every(r => /civil-lighting/.test(r.source) && r.civilHeads > 0 && !/ceiling-plant/.test(r.source)))
    .invariant('night: every head sits at its column top (±5 cm)', rs => rs.every(r => r.nearTop === r.civilHeads))
    .invariant('night: every head inside its column plan box', rs => rs.every(r => r.inBox === r.civilHeads))
    .invariant('night: heads are NOT the box centre (arm ends found: some head > 0.5 m off centre)', rs => rs.every(r => r.offCentre > 0))
    .invariant('night: no buried stray (top below every other element) is lit', rs => rs.every(r => r.lowerCluster > 0 && r.lowerLit === 0))
    .invariant('night: every real column (tall, not buried) is lit — no over-rejection', rs => rs.every(r => r.tallUpper > 0 && r.tallUpperLit === r.tallUpper))
    .invariant('night: every traffic signal column is a light source', rs => rs.every(r => r.signals > 0 && r.signals === r.signalsExpected))
    .invariant('night: Alt+S world positions read the same list', rs => rs.every(r => r.worldPositions === r.fixtures))
    .invariant('lazy fly: no labels → road-discipline route logged, tour playing, scrubber visible', rs => rs.every(r => r.lazyLine && r.lazyWalk && r.lazyFirst === 'Start of highway' && r.lazyScrub))
    .redControl(rs => rs.map(r => Object.assign(r, { nearTop: 0 })))
    .run();
  logStream.end();
})();
