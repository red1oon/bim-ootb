#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-MEP-REROUTE: moving a generated fixture re-routes its network (real move commit path).
 * SCOPE: bim-compiler prompts/MODELLER_MASTER.md §STRATEGY 2026-09-24 lane L5 — the services leg of O15/O16
 * ("drag → the building recomposes → services re-route"). Drives: Open Duplex → discWalk('PLB') → a signed
 * GEOM_MOVE of one routed PLB fixture (the same Bonsai.oplog.commit call the Modeller's move uses) → real Ctrl+Z.
 * Waits on conditions. Read the log after every run.
 * ISSUES proved or disproved:
 *   R1 ROUTED    — the walk produced a routed PLB network, and the fixture chosen is a real run endpoint.
 *   R2 FOLLOWS   — after the move, the network is re-routed from the signed op-log and a run endpoint sits at the
 *                  fixture's NEW position (±5 mm). RED before §MEP-REROUTE: __dwChains stayed stale.
 *   R3 RENDERED  — every re-routed run is drawn (tubes == segs).
 *   R4 UNDO      — one Ctrl+Z undoes the move and the network re-routes back to the original run set.
 *   R5 NO-ERROR  — 0 pageerror, op-log verifies.
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const ROOT = path.join(__dirname, '..', '..'), DX = 1.0;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.sql': 'text/plain' };
const server = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller/modeller.html';
  fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b); }); });
(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage(); await pg.setViewport({ width: 1200, height: 850 });
  const logs = [], errs = []; pg.on('console', m => logs.push(m.text())); pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  let pass = 0, fail = 0; const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + '  ' + x); } else { fail++; console.log('  ❌ ' + n + '  ' + x); } };
  console.log('═══ W-MEP-REROUTE — move a generated PLB fixture, the network follows (Duplex) ═══');
  await pg.goto(`http://localhost:${port}/modeller/modeller.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__sceneReady === true && typeof window.discWalk==="function"', { timeout: 60000 });
  await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="Duplex"]'); await pg.click('#m-open-panel .mo-row[data-key="Duplex"]');
  await pg.waitForFunction(() => window.__dwName === 'Duplex' && window.Bonsai.oplog.length > 0 && window.DiscWalker && window.DiscWalker._ready(), { timeout: 120000, polling: 300 });
  await pg.evaluate(() => window.discWalk('PLB', { building: 'Duplex' }));
  await pg.waitForFunction(() => (window.__dwChains.PLB || []).length > 0 && ((window.__dwRowsByDisc || {}).PLB || {}).walk && !Object.keys(window.__dwChainAnimating || {}).some(k => window.__dwChainAnimating[k]),
    { timeout: 120000, polling: 300 }).catch(() => {});
  // a fixture whose committed position is a run endpoint (plan XY within 5 mm)
  const S0 = await pg.evaluate(() => {
    const O = window.Bonsai.oplog, segs = window.__dwChains.PLB || [], rows = ((window.__dwRowsByDisc || {}).PLB || {}).walk || [];
    const ends = []; segs.forEach(s => { ends.push(s.from); ends.push(s.to); });
    const byId = {}; O._geomOps().forEach(o => byId[o.id] = o);
    let pick = null;
    for (const id of rows) { const pp = byId[id] && byId[id].parameters.placement; if (!pp) continue;
      if (ends.some(e => Math.abs(e[0] - pp.x) < 0.005 && Math.abs(e[1] - pp.y) < 0.005)) { pick = { id, x: pp.x, y: pp.y }; break; } }
    const key = segs.map(s => [s.from, s.to].map(p => p.map(v => v.toFixed(3)).join(',')).join('>')).sort().join('|');
    return { segs: segs.length, rows: rows.length, pick, key, raw: segs.map(s => [s.from, s.to]) };
  });
  chk('R1 ROUTED (PLB network exists; chosen fixture is a run endpoint)', S0.segs > 0 && !!S0.pick, 'segs=' + S0.segs + ' walkRows=' + S0.rows + ' pick=' + JSON.stringify(S0.pick));
  if (!S0.pick) { console.log('W-MEP-REROUTE: ' + pass + ' PASS / ' + (fail + 4) + ' FAIL (no endpoint fixture — later gates not runnable)'); await br.close(); server.close(); process.exit(1); }
  const nLog = logs.length;
  await pg.evaluate((id, dx) => window.Bonsai.oplog.commit({ op_type: 'GEOM_MOVE', parameters: { parent: id, dx: dx, dy: 0, dz: 0 } }, {}), S0.pick.id, DX);
  for (let i = 0; i < 80 && !logs.slice(nLog).some(l => l.indexOf('§MEP-REROUTE') >= 0); i++) await new Promise(r => setTimeout(r, 250));
  const S1 = await pg.evaluate((pick, dx) => {
    const segs = window.__dwChains.PLB || [], root = window.Bonsai.group().children.find(o => o.userData && o.userData.dwRoot);
    const tubes = root ? root.children.filter(o => o.userData && o.userData.dwChain === 'PLB').reduce((s, m) => s + (m.isInstancedMesh ? m.count : 1), 0) : 0;
    const nx = pick.x + dx, ny = pick.y;
    const atNew = segs.filter(s => [s.from, s.to].some(e => Math.abs(e[0] - nx) < 0.005 && Math.abs(e[1] - ny) < 0.005)).length;
    const key = segs.map(s => [s.from, s.to].map(p => p.map(v => v.toFixed(3)).join(',')).join('>')).sort().join('|');
    return { segs: segs.length, tubes, atNew, key };
  }, S0.pick, DX);
  const rr = logs.slice(nLog).filter(l => l.indexOf('§MEP-REROUTE') >= 0);
  chk('R2 FOLLOWS (re-routed from the op-log; a run ends at the moved fixture)', rr.length > 0 && S1.atNew > 0 && S1.key !== S0.key,
    'reroute=' + (rr[0] || 'NONE').replace(/^.*§MEP-REROUTE/, '§MEP-REROUTE') + ' runsAtNewPos=' + S1.atNew + ' changed=' + (S1.key !== S0.key));
  chk('R3 RENDERED (tubes == segs after re-route)', S1.tubes === S1.segs && S1.segs > 0, 'segs=' + S1.segs + ' tubes=' + S1.tubes);
  await pg.click('canvas').catch(() => {});
  const nLog2 = logs.length;
  await pg.keyboard.down('Control'); await pg.keyboard.press('z'); await pg.keyboard.up('Control');
  for (let i = 0; i < 80 && !logs.slice(nLog2).some(l => l.indexOf('§MEP-REROUTE') >= 0); i++) await new Promise(r => setTimeout(r, 250));
  // Compared within 1 mm, not by exact digits: the walk routes from its in-memory placements, the re-route from the
  // op-log's committed placements, which are rounded to 4 dp (≤0.05 mm apart, measured). Same topology either way.
  const S2 = await pg.evaluate(() => (window.__dwChains.PLB || []).map(s => [s.from, s.to]));
  const used = {}; let m = 0;
  S0.raw.forEach(a => { const j = S2.findIndex((b, k) => !used[k] && [0, 1].every(e => [0, 1, 2].every(i => Math.abs(a[e][i] - b[e][i]) < 0.001))); if (j >= 0) { used[j] = 1; m++; } });
  chk('R4 UNDO (Ctrl+Z → the original run set, re-routed back, ±1 mm)', S2.length === S0.raw.length && m === S0.raw.length,
    'runs ' + S0.raw.length + '→' + S2.length + ' matched=' + m + ' rerouteLines=' + logs.slice(nLog2).filter(l => l.indexOf('§MEP-REROUTE') >= 0).length);
  const chain = await pg.evaluate(async () => { try { const db = await window.Bonsai.oplog._ensureDb(); return !!(await window.KernelOps.verifyChain(db)).ok; } catch (e) { return 'ERR:' + e.message; } });
  chk('R5 NO-ERROR (0 pageerror, op-log verifies)', errs.length === 0 && chain === true, 'errs=' + errs.length + ' chain=' + chain + (errs[0] ? ' ' + errs[0] : ''));
  console.log('W-MEP-REROUTE: ' + pass + ' PASS / ' + fail + ' FAIL');
  await br.close(); server.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
