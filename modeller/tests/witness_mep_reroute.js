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
 *   R6 SIGNED    — (NEXT #2) after the move, the ACTIVE signed GEOM_SWEEP rows of the PLB route are exactly the re-routed runs
 *                  (±1 mm, one row each) and ≥1 of them is a NEW row. RED before §MEP-REROUTE-SIGN: the op-log kept the walk's
 *                  sweeps at the OLD route (0 new rows, "unsigned runs").
 *   R7 FITTINGS  — (NEXT #2) the ACTIVE bend-fitting rows equal DiscWalker.bendFittings(new route) (±1 mm, same kind) —
 *                  re-derived for the new route. RED before: the walk's fittings stayed, not re-derived.
 *   R8 ONE-GESTURE — (NEXT #2) Ctrl+Z → exactly the walk's own sweep+fitting rows active again and 0 re-route rows; Ctrl+Y →
 *                  exactly the post-move set back; neither key commits a new row (kernel_ops count unchanged).
 *   R9 LATER-EDIT — (NEXT #2 regression) a later plain edit (a signed GEOM_MOVE of an ARC element) then Ctrl+Z / Ctrl+Y
 *                  flips ONLY that edit's row: the route rows stay exactly the re-route set. Proves the kernel's boundary
 *                  undo()/redo() skip re-route-owned rows (without the skip, Ctrl+Y resurrects a superseded walk run).
 *                  (MEP_REROUTE_NO_OWN=1 empties the skip set first — a demonstration run that must turn R9 red.)
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
  await pg.waitForFunction(() => (window.__dwChains.PLB || []).length > 0 && ((window.__dwRowsByDisc || {}).PLB || {}).walk && !Object.keys(window.__dwChainAnimating || {}).some(k => window.__dwChainAnimating[k])
    && !!(window.__dwRouteSig || {}).PLB,   // the walk's finally stamps the route AFTER its runs + fittings are committed
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
  // Active route rows of PLB read from the signed op-log: the walk's chain+fit rows plus any re-route rows.
  const routeRows = () => pg.evaluate(() => {
    const O = window.Bonsai.oplog, R = (window.__dwRowsByDisc || {}).PLB || {}, own = window.__dwRouteRowIds && window.__dwRouteRowIds.PLB;
    const ids = {}; (R.chain || []).concat(R.fit || []).forEach(i => ids[i] = 1); if (own) Object.keys(own).forEach(i => ids[i] = 1);
    const sw = [], ft = []; O._geomOps().forEach(o => { if (!ids[o.id]) return; const P = o.parameters;
      if (o.op_type === 'GEOM_SWEEP') sw.push({ id: o.id, a: P.path[0], b: P.path[1] }); else if (P._dw && P._dw.fit) ft.push({ id: o.id, hash: P.hash, pl: P.placement }); });
    const nRows = O.db.exec('SELECT COUNT(*) FROM kernel_ops')[0].values[0][0];
    return { sw, ft, nRows, walkChain: (R.chain || []).slice(), walkFit: (R.fit || []).slice() };
  });
  const near = (p, q) => [0, 1, 2].every(i => Math.abs(p[i] - q[i]) <= 0.001);
  const idle = () => pg.evaluate(() => window.__dwRerouteIdle || 0);
  const settle = async (i0) => { for (let i = 0; i < 120 && (await idle()) <= i0; i++) await new Promise(r => setTimeout(r, 250));
    await pg.evaluate(async () => { const MH = window.ModellerHistory; await ((MH && MH.pending && MH.pending()) || Promise.resolve()); await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0)); }); };
  const W0 = await routeRows();
  const nLog = logs.length, i0 = await idle();
  await pg.evaluate((id, dx) => window.Bonsai.oplog.commit({ op_type: 'GEOM_MOVE', parameters: { parent: id, dx: dx, dy: 0, dz: 0 } }, {}), S0.pick.id, DX);
  for (let i = 0; i < 80 && !logs.slice(nLog).some(l => l.indexOf('§MEP-REROUTE') >= 0); i++) await new Promise(r => setTimeout(r, 250));
  await settle(i0);
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
  // R6/R7 — what the signed op-log holds for the network after the move
  const W1 = await routeRows();
  const segs1 = await pg.evaluate(() => (window.__dwChains.PLB || []).map(s => [s.from, s.to]));
  const usedS = {}; let mS = 0;
  segs1.forEach(sg => { const r = W1.sw.find(r => !usedS[r.id] && ((near(r.a, sg[0]) && near(r.b, sg[1])) || (near(r.a, sg[1]) && near(r.b, sg[0])))); if (r) { usedS[r.id] = 1; mS++; } });
  const newSw = W1.sw.filter(r => W0.sw.every(o => o.id !== r.id)).length;
  const rsLine = logs.slice(nLog).find(l => l.indexOf('§MEP-REROUTE-SIGN') >= 0) || 'NONE';
  chk('R6 SIGNED (active signed sweeps == the re-routed runs ±1 mm, ≥1 new row)', mS === segs1.length && W1.sw.length === segs1.length && newSw > 0,
    'runs=' + segs1.length + ' activeSweeps=' + W1.sw.length + ' matched=' + mS + ' newRows=' + newSw + ' ' + rsLine.replace(/^.*§MEP-REROUTE-SIGN/, '§MEP-REROUTE-SIGN'));
  const want = await pg.evaluate(() => window.DiscWalker.bendFittings('PLB', window.__dwChains.PLB, {}).map(f => ({ hash: f.hash, pl: f.placement })));
  const usedF = {}; let mF = 0;
  want.forEach(w => { const r = W1.ft.find(r => !usedF[r.id] && r.hash === w.hash && near([r.pl.x, r.pl.y, r.pl.z], [w.pl.x, w.pl.y, w.pl.z])); if (r) { usedF[r.id] = 1; mF++; } });
  const walkFitKey = W0.ft.map(r => r.hash + '@' + [r.pl.x, r.pl.y, r.pl.z].map(v => v.toFixed(3))).sort().join('|');
  const wantKey = want.map(w => w.hash + '@' + [w.pl.x, w.pl.y, w.pl.z].map(v => v.toFixed(3))).sort().join('|');
  chk('R7 FITTINGS (active bend fittings == bendFittings(new route), re-derived)', mF === want.length && W1.ft.length === want.length && wantKey !== walkFitKey,
    'walkFits=' + W0.ft.length + ' newRouteFits=' + want.length + ' active=' + W1.ft.length + ' matched=' + mF + ' fitSetChangedByMove=' + (wantKey !== walkFitKey));
  await pg.click('canvas').catch(() => {});
  const nLog2 = logs.length, i1 = await idle();
  await pg.keyboard.down('Control'); await pg.keyboard.press('z'); await pg.keyboard.up('Control');
  for (let i = 0; i < 80 && !logs.slice(nLog2).some(l => l.indexOf('§MEP-REROUTE') >= 0); i++) await new Promise(r => setTimeout(r, 250));
  // Compared within 1 mm, not by exact digits: the walk routes from its in-memory placements, the re-route from the
  // op-log's committed placements, which are rounded to 4 dp (≤0.05 mm apart, measured). Same topology either way.
  await settle(i1);
  const S2 = await pg.evaluate(() => (window.__dwChains.PLB || []).map(s => [s.from, s.to]));
  const W2 = await routeRows();
  const used = {}; let m = 0;
  S0.raw.forEach(a => { const j = S2.findIndex((b, k) => !used[k] && [0, 1].every(e => [0, 1, 2].every(i => Math.abs(a[e][i] - b[e][i]) < 0.001))); if (j >= 0) { used[j] = 1; m++; } });
  chk('R4 UNDO (Ctrl+Z → the original run set, re-routed back, ±1 mm)', S2.length === S0.raw.length && m === S0.raw.length,
    'runs ' + S0.raw.length + '→' + S2.length + ' matched=' + m + ' rerouteLines=' + logs.slice(nLog2).filter(l => l.indexOf('§MEP-REROUTE') >= 0).length);
  // R8 — Ctrl+Y, then compare row sets: Ctrl+Z == walk's own rows, Ctrl+Y == post-move rows, no key committed a row
  const i2 = await idle();
  await pg.keyboard.down('Control'); await pg.keyboard.press('y'); await pg.keyboard.up('Control');
  await settle(i2);
  const W3 = await routeRows();
  const set = w => w.sw.map(r => r.id).concat(w.ft.map(r => r.id)).sort((a, b) => a - b).join(',');
  const walkSet = W0.walkChain.concat(W0.walkFit).sort((a, b) => a - b).join(',');
  chk('R8 ONE-GESTURE (Ctrl+Z → the walk\'s own rows; Ctrl+Y → the re-route rows; no new rows)',
    set(W2) === walkSet && set(W3) === set(W1) && W2.nRows === W1.nRows && W3.nRows === W1.nRows && set(W1) !== walkSet,
    'undo=' + (set(W2) === walkSet ? 'walk rows' : 'MISMATCH(' + (W2.sw.length + W2.ft.length) + ')') + ' redo=' + (set(W3) === set(W1) ? 're-route rows' : 'MISMATCH(' + (W3.sw.length + W3.ft.length) + ')') +
    ' kernel_ops ' + W0.nRows + '→' + W1.nRows + '→' + W2.nRows + '→' + W3.nRows + ' moveChangedRows=' + (set(W1) !== walkSet));
  // R9 — a later plain edit, its Ctrl+Z / Ctrl+Y must not touch the route rows
  if (process.env.MEP_REROUTE_NO_OWN) await pg.evaluate(() => { window.Bonsai.oplog._treeOwned = new Set(); });
  const arcId = await pg.evaluate(() => { const O = window.Bonsai.oplog, R = window.__dwRowsByDisc || {}, dw = {};
    Object.keys(R).forEach(d => ['walk', 'chain', 'fit'].forEach(k => (R[d][k] || []).forEach(i => dw[i] = 1)));
    const o = O._geomOps().find(o => o.op_type === 'GEOM_INSERT' && !dw[o.id] && !(o.parameters && o.parameters._dw)); return o ? o.id : null; });
  const i3 = await idle();
  const eRow = await pg.evaluate(async (id) => (await window.Bonsai.oplog.commit({ op_type: 'GEOM_MOVE', parameters: { parent: id, dx: 0.1, dy: 0, dz: 0 } }, {})).id, arcId);
  await new Promise(r => setTimeout(r, 500)); await settle(i3 - 1);
  const act = () => pg.evaluate((e) => window.Bonsai.oplog._geomOps().some(o => o.id === e), eRow);
  const Wa = await routeRows(), eA = await act();
  await pg.keyboard.down('Control'); await pg.keyboard.press('z'); await pg.keyboard.up('Control'); await settle(await idle() - 1);
  await new Promise(r => setTimeout(r, 500));
  const Wb = await routeRows(), eB = await act();
  await pg.keyboard.down('Control'); await pg.keyboard.press('y'); await pg.keyboard.up('Control'); await settle(await idle() - 1);
  await new Promise(r => setTimeout(r, 500));
  const Wc = await routeRows(), eC = await act();
  chk('R9 LATER-EDIT (a later edit\'s Ctrl+Z/Ctrl+Y flips only its own row; route rows untouched)',
    arcId != null && eA && !eB && eC && set(Wa) === set(W1) && set(Wb) === set(W1) && set(Wc) === set(W1),
    'arc=' + arcId + ' editRow=' + eRow + ' active ' + eA + '→' + eB + '→' + eC + ' routeRows ' + [Wa, Wb, Wc].map(w => set(w) === set(W1) ? 'same' : 'CHANGED(' + (w.sw.length + w.ft.length) + ')').join('/'));
  const chain = await pg.evaluate(async () => { try { const db = await window.Bonsai.oplog._ensureDb(); return !!(await window.KernelOps.verifyChain(db)).ok; } catch (e) { return 'ERR:' + e.message; } });
  chk('R5 NO-ERROR (0 pageerror, op-log verifies)', errs.length === 0 && chain === true, 'errs=' + errs.length + ' chain=' + chain + (errs[0] ? ' ' + errs[0] : ''));
  console.log('W-MEP-REROUTE: ' + pass + ' PASS / ' + fail + ' FAIL');
  await br.close(); server.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
