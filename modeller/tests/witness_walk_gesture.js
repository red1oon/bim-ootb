#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-WALK-GESTURE: a disc walk is ONE undoable gesture on the REAL keyboard path.
 * SCOPE: bim-compiler prompts/MODELLER_MASTER.md §STRATEGY 2026-09-24 lane L4 (the "edit minimally" loop: a user
 * must be able to take a generated walk back and re-apply it). Drives: Open Duplex → discWalk(<disc>) → real
 * Ctrl+Z → real Ctrl+Y (keyboard → doUndo/doRedo → ModellerHistory). Waits on conditions. Read the log after every run.
 * ISSUES proved or disproved:
 *   G1 RECORDED  — the walk is ONE history node ("Walk <disc>"). RED on main 2026-09-24: commitSeedGroup is not in
 *                  the history tree, so the last node stayed "Opened Duplex".
 *   G2 UNDO      — one Ctrl+Z undoes EVERY row the walk committed, and its fixtures + run tubes leave the screen.
 *                  RED on main: all 102 ELEC rows stayed active.
 *   G3 REDO      — one Ctrl+Y restores every row, and the same fixture/tube counts come back.
 *   G4 NO-ERROR  — 0 pageerror, op-log verifies.
 * Usage: node witness_walk_gesture.js [disc=PLB] [building=Duplex]. PLB exercises runs + bend fittings too.
 */
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const ROOT = path.join(__dirname, '..', '..'), DISC = process.argv[2] || 'PLB', BLD = process.argv[3] || 'Duplex';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.sql': 'text/plain' };
const server = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller/modeller.html';
  fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b); }); });
(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage(); await pg.setViewport({ width: 1200, height: 850 });
  const logs = []; pg.on('console', m => logs.push(m.text())); pg.on('pageerror', e => logs.push('PAGEERROR ' + e));
  await pg.goto(`http://localhost:${port}/modeller/modeller.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__sceneReady === true && !!window.Bonsai && typeof window.discWalk==="function"', { timeout: 60000 });
  await pg.click('#b-open'); await pg.waitForSelector(`#m-open-panel .mo-row[data-key="${BLD}"]`);
  await pg.click(`#m-open-panel .mo-row[data-key="${BLD}"]`);
  await pg.waitForFunction(k => window.__dwName === k && !!window.__arcFidByGuid && window.Bonsai.oplog.length > 0 && window.DiscWalker && window.DiscWalker._ready(), { timeout: 120000, polling: 300 }, BLD);
  // settle = history tree stops changing (condition)
  const snap = async (label) => pg.evaluate((d, label) => {
    const g = window.Bonsai.group(), root = g.children.find(o => o.userData && o.userData.dwRoot);
    const cnt = (pred) => root ? root.children.filter(pred).reduce((s, m) => s + (m.isInstancedMesh ? m.count : 1), 0) : 0;
    const ops = window.Bonsai.oplog._allGeom();
    const walkRows = ops.filter(o => typeof o.gid === 'string' && /^dw(walk|chain|fit)-/.test(o.gid));
    const MH = window.ModellerHistory, tips = MH && MH.list ? MH.list() : null;
    return { label, active: ops.filter(o => !o.undone).length, walkRowsActive: walkRows.filter(o => !o.undone).length, walkRowsTotal: walkRows.length,
      fixtures: cnt(o => o.userData && o.userData.dwDisc === d), tubes: cnt(o => o.userData && o.userData.dwChain === d),
      lastNode: tips && tips.length ? JSON.stringify(tips[tips.length - 1]).slice(0, 160) : String(tips && tips.length) };
  }, DISC, label);
  const out = [];
  out.push(await snap('before-walk'));
  await pg.evaluate((d, b) => window.discWalk(d, { building: b }), DISC, BLD);
  await pg.waitForFunction(d => (window.__dwWalks || {})[d] && !Object.keys(window.__dwChainAnimating || {}).some(k => window.__dwChainAnimating[k]), { timeout: 120000, polling: 300 }, DISC);
  out.push(await snap('after-walk'));
  await pg.click('canvas').catch(() => {});
  // Wait on the CONDITION that the keypress finished: the row flip (sync), then ModellerHistory's pending restore
  // (the async re-fold, which with signed GEOM_SWEEP rows includes the kernel's sweep solids), then two macrotasks
  // so doUndo/doRedo's own continuation (the §WALK-GESTURE-DRAW redraw) has run. Snapshotting at the row flip
  // alone read the layer BEFORE its redraw once sweeps made the fold slower (measured: fixtures 18→0 at redo).
  const waitOps = async (prev) => {
    for (let i = 0; i < 60; i++) { const n = await pg.evaluate(() => window.Bonsai.oplog._allGeom().filter(o => !o.undone).length); if (n !== prev) break; await new Promise(r => setTimeout(r, 250)); }
    await pg.evaluate(async () => { const MH = window.ModellerHistory; await ((MH && MH.pending && MH.pending()) || Promise.resolve()); await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0)); });
  };
  let prev = out[out.length - 1].active;
  await pg.keyboard.down('Control'); await pg.keyboard.press('z'); await pg.keyboard.up('Control'); await waitOps(prev);
  out.push(await snap('after-ctrl-z'));
  prev = out[out.length - 1].active;
  await pg.keyboard.down('Control'); await pg.keyboard.press('y'); await pg.keyboard.up('Control'); await waitOps(prev);
  out.push(await snap('after-ctrl-y'));
  out.forEach(o => console.log('  ' + JSON.stringify(o)));
  const [b, a, z, y] = out, errs = logs.filter(l => l.indexOf('PAGEERROR') === 0);
  const chain = await pg.evaluate(async () => { try { const db = await window.Bonsai.oplog._ensureDb(); return !!(await window.KernelOps.verifyChain(db)).ok; } catch (e) { return 'ERR:' + e.message; } });
  let pass = 0, fail = 0; const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + '  ' + x); } else { fail++; console.log('  ❌ ' + n + '  ' + x); } };
  console.log('═══ W-WALK-GESTURE — ' + DISC + ' on ' + BLD + ' ═══');
  chk('G1 RECORDED (the walk is ONE history node)', a.walkRowsTotal > 0 && /"label":"Walk /.test(a.lastNode), 'rows=' + a.walkRowsTotal + ' lastNode=' + a.lastNode);
  chk('G2 UNDO (one Ctrl+Z: all walk rows undone, layer off screen)', z.walkRowsActive === 0 && z.active === b.active && z.fixtures === 0 && z.tubes === 0,
    'active ' + a.active + '→' + z.active + ' (pre-walk ' + b.active + ') walkRowsActive=' + z.walkRowsActive + ' fixtures=' + z.fixtures + ' tubes=' + z.tubes);
  chk('G3 REDO (one Ctrl+Y: every row and the same layer back)', y.walkRowsActive === a.walkRowsActive && y.active === a.active && y.fixtures === a.fixtures && y.tubes === a.tubes,
    'active=' + y.active + ' fixtures ' + a.fixtures + '→' + y.fixtures + ' tubes ' + a.tubes + '→' + y.tubes);
  chk('G4 NO-ERROR (0 pageerror, op-log verifies)', errs.length === 0 && chain === true, 'errs=' + errs.length + ' chain=' + chain);
  console.log('W-WALK-GESTURE: ' + pass + ' PASS / ' + fail + ' FAIL');
  await br.close(); server.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
