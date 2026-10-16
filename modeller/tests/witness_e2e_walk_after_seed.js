#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-WALK-AFTER-SEED: a Walk clicked while the building is still loading waits for the ARC seed.
 * SCOPE: BIMCompiler prompts/Modeller/NEXT_0926/SPEC_WALK_AFTER_SEED.md. Real Open of Duplex. Read the log after every run.
 * ISSUE: the Walk row + walker are ready 4.4 s (Duplex) / 24 s (Terminal) before the ARC seed commits; a Walk in that window
 *   signed its rows BEFORE the seed's and the seed's re-fold dropped the walk layer (main 9325eb6d).
 *   W1 ORDER   — every walk row id > every arcseed row id.        (RED on main)
 *   W2 LAYER   — after both settle the PLB run tubes are on screen.
 *   W3 WAITED  — the early click really hit the window: §WALK-AFTER-SEED waited=N (N>0). If the seed was already in when the
 *                Walk fired, the run is VOID (nothing about the race was tested).
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const ROOT = path.join(__dirname, '..', '..'), BLD = 'Duplex';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.sql': 'text/plain' };
const server = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller/modeller.html';
  fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b); }); });
(async () => {
  await new Promise(r => server.listen(0, r));
  const br = await puppeteer.launch({ headless: 'new', protocolTimeout: 600000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await br.newPage(); const logs = [], errs = [];
  pg.on('console', m => { const t = m.text(); logs.push(t); if (/§WALK-AFTER-SEED|commitSeedGroup gid=(arcseed|dw)/.test(t)) console.log('    ' + t.slice(0, 140)); });
  pg.on('pageerror', e => errs.push(String(e)));
  await pg.goto(`http://localhost:${server.address().port}/modeller/modeller.html`, { waitUntil: 'load' });
  await pg.waitForFunction('window.__sceneReady === true && typeof window.discWalk==="function"', { timeout: 60000 });
  await pg.click('#b-open'); await pg.waitForSelector(`#m-open-panel .mo-row[data-key="${BLD}"]`); await pg.click(`#m-open-panel .mo-row[data-key="${BLD}"]`);
  // fire the Walk the moment the walker is usable — before the seed lands
  const early = await pg.waitForFunction(k => window.__dwName === k && window.DiscWalker && window.DiscWalker._ready() && !!window.__dwBuf, { timeout: 120000, polling: 20 }, BLD).then(() => true).catch(() => false);
  const seedAtFire = await pg.evaluate(() => { const n = window.Bonsai.oplog.length; window.discWalk('PLB', { building: window.__dwName }); return n; });
  console.log('  §FIRE walkerReady=' + early + ' oplogAtFire=' + seedAtFire);
  await pg.waitForFunction(() => ((window.__dwRowsByDisc || {}).PLB || {}).walk && window.__dwLastChainDisc === 'PLB' && !Object.keys(window.__dwChainAnimating || {}).some(k => window.__dwChainAnimating[k]), { timeout: 180000, polling: 250 }).catch(() => {});
  await pg.evaluate(async () => { const MH = window.ModellerHistory; await ((MH && MH.pending && MH.pending()) || Promise.resolve()); });
  await new Promise(r => setTimeout(r, 3000));
  const st = await pg.evaluate(() => {
    const ops = window.Bonsai.oplog._allGeom();
    const seed = ops.filter(o => typeof o.gid === 'string' && /^arcseed-/.test(o.gid)).map(o => o.id);
    const walk = ops.filter(o => typeof o.gid === 'string' && /^dw(walk|chain|fit)-/.test(o.gid)).map(o => o.id);
    const g = window.Bonsai.group(), root = g.children.find(o => o.userData && o.userData.dwRoot);
    const tubes = root ? root.children.filter(o => o.userData && o.userData.dwChain === 'PLB').reduce((s, m) => s + (m.isInstancedMesh ? m.count : 1), 0) : -1;
    return { seedN: seed.length, walkN: walk.length, maxSeed: seed.length ? Math.max(...seed) : null, minWalk: walk.length ? Math.min(...walk) : null, tubes };
  });
  console.log('  §STATE ' + JSON.stringify(st));
  const waited = logs.map(l => (l.match(/§WALK-AFTER-SEED waited=(\d+)ms/) || [])[1]).filter(Boolean).map(Number);
  let pass = 0, fail = 0; const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + '  ' + x); } else { fail++; console.log('  ❌ ' + n + '  ' + x); } };
  console.log('═══ W-WALK-AFTER-SEED ═══');
  if (seedAtFire > 0) console.log('  ⚪ VOID — the seed was already committed when the Walk fired (oplog=' + seedAtFire + '); the race was not exercised');
  chk('W1 ORDER (every walk row after every seed row)', seedAtFire === 0 && st.seedN > 0 && st.walkN > 0 && st.minWalk > st.maxSeed, 'maxSeed=' + st.maxSeed + ' minWalk=' + st.minWalk + ' seed=' + st.seedN + ' walk=' + st.walkN);
  chk('W2 LAYER (PLB run tubes on screen after both settle)', st.tubes > 0, 'tubes=' + st.tubes);
  chk('W3 WAITED (the early Walk waited for the seed)', seedAtFire === 0 && waited.length > 0 && waited[0] > 0, 'waited=' + JSON.stringify(waited));
  chk('W4 NO-ERROR', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log('W-WALK-AFTER-SEED: ' + pass + ' PASS / ' + fail + ' FAIL');
  await br.close(); server.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
