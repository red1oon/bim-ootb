#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-UNDO-RESURRECT: a plain Ctrl+Y must never bring back a row a history node undid.
 * SCOPE: BIMCompiler prompts/Modeller/NEXT_0926/SPEC_UNDO_RESURRECT.md (MODELLER_MASTER NEXT #4). Real keypress
 * (doUndo/doRedo → ModellerHistory), Duplex. Waits on conditions. Read the log after every run.
 * ISSUE: oplog.redo() reactivates the LOWEST-id undone row. A walk undone by its history node leaves its rows undone
 * below any later edit, so the edit's own Ctrl+Y resurrected a walk row instead of the edit (same for a delete).
 *   R1 PRE      — walk PLB, Ctrl+Z: 0 walk rows active (precondition; VOID if not met).
 *   R2 UNDO     — a move (oplog.commit GEOM_MOVE, the move tool's call, modeller.html:2740), Ctrl+Z: the move row undone.
 *   R3 REDO     — Ctrl+Y: the move row active AND 0 walk rows active.   RED on main 9bc2d3c8 (expected).
 *   R4 DELETE   — delete element A, move element B, Ctrl+Z, Ctrl+Y: B's move active, A still deleted.
 *   R5 NO-ERROR — 0 pageerror, op-log verifies.
 */
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const ROOT = path.join(__dirname, '..', '..'), BLD = 'Duplex', DISC = 'PLB';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.sql': 'text/plain' };
const server = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller/modeller.html';
  fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b); }); });
(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new', protocolTimeout: 600000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage(); await pg.setViewport({ width: 1200, height: 850 });
  const logs = []; pg.on('console', m => { const t = m.text(); logs.push(t); if (/§OPLOG|redo id|undo id|setUndone/.test(t)) console.log('    ' + t.slice(0, 160)); });
  pg.on('pageerror', e => logs.push('PAGEERROR ' + e));
  await pg.goto(`http://localhost:${port}/modeller/modeller.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__sceneReady === true && !!window.Bonsai && typeof window.discWalk==="function"', { timeout: 60000 });
  await pg.click('#b-open'); await pg.waitForSelector(`#m-open-panel .mo-row[data-key="${BLD}"]`);
  await pg.click(`#m-open-panel .mo-row[data-key="${BLD}"]`);
  await pg.waitForFunction(k => window.__dwName === k && !!window.__arcFidByGuid && window.Bonsai.oplog.length > 0 && window.DiscWalker && window.DiscWalker._ready(), { timeout: 120000, polling: 300 }, BLD);
  const settle = () => pg.evaluate(async () => { const MH = window.ModellerHistory; await ((MH && MH.pending && MH.pending()) || Promise.resolve()); await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0)); });
  const key = async (k) => { await pg.keyboard.down('Control'); await pg.keyboard.press(k); await pg.keyboard.up('Control'); await new Promise(r => setTimeout(r, 300)); await settle(); };
  const state = (ids) => pg.evaluate((ids) => {
    const ops = window.Bonsai.oplog._allGeom();
    const walk = ops.filter(o => typeof o.gid === 'string' && /^dw(walk|chain|fit)-/.test(o.gid));
    const byId = new Map(ops.map(o => [o.id, o]));
    return { walkActive: walk.filter(o => !o.undone).length, walkTotal: walk.length,
      rows: (ids || []).map(id => ({ id, undone: byId.has(id) ? !!byId.get(id).undone : 'missing' })) };
  }, ids);
  // two ARC seed rows to edit (the first GEOM_INSERTs of the seeded building)
  const arc = await pg.evaluate(() => window.Bonsai.oplog._allGeom().filter(o => !o.undone && o.op_type === 'GEOM_INSERT' && typeof o.gid === 'string' && /^arcseed-/.test(o.gid)).slice(0, 3).map(o => o.id));
  console.log('═══ W-UNDO-RESURRECT — ' + BLD + ' ═══  arcRows=' + JSON.stringify(arc));

  await pg.evaluate((d, b) => window.discWalk(d, { building: b }), DISC, BLD);
  await pg.waitForFunction(d => ((window.__dwRowsByDisc || {})[d] || {}).walk && !Object.keys(window.__dwChainAnimating || {}).some(k => window.__dwChainAnimating[k]), { timeout: 120000, polling: 300 }, DISC);
  await settle(); await pg.click('canvas').catch(() => {});
  const sWalk = await state();
  await key('z'); const s1 = await state();
  // R2: a plain move (the move tool's own call)
  const mv = await pg.evaluate(async (a) => (await window.Bonsai.oplog.commit({ op_type: 'GEOM_MOVE', parameters: { parent: a, dx: 0.5, dy: 0, dz: 0 } }, {})).id, arc[0]);
  await settle();
  await key('z'); const s2 = await state([mv]);
  await key('y'); const s3 = await state([mv]);
  // R4: delete A, move B, Ctrl+Z, Ctrl+Y
  await pg.evaluate(async (a) => { await window.Bonsai.oplog.deleteFeature(a); }, arc[1]); await settle();
  const mv2 = await pg.evaluate(async (b) => (await window.Bonsai.oplog.commit({ op_type: 'GEOM_MOVE', parameters: { parent: b, dx: 0.5, dy: 0, dz: 0 } }, {})).id, arc[2]);
  await settle();
  await key('z'); await key('y'); const s4 = await state([mv2, arc[1]]);
  [['after-walk', sWalk], ['walk-ctrl-z', s1], ['move-ctrl-z', s2], ['move-ctrl-y', s3], ['delete+move z/y', s4]].forEach(([l, s]) => console.log('  ' + l + ' ' + JSON.stringify(s)));
  const chain = await pg.evaluate(async () => { try { const db = await window.Bonsai.oplog._ensureDb(); return !!(await window.KernelOps.verifyChain(db)).ok; } catch (e) { return 'ERR:' + e.message; } });
  const errs = logs.filter(l => l.indexOf('PAGEERROR') === 0);
  let pass = 0, fail = 0; const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + '  ' + x); } else { fail++; console.log('  ❌ ' + n + '  ' + x); } };
  const pre = sWalk.walkActive > 0 && s1.walkActive === 0 && arc.length === 3;
  if (!pre) console.log('  ⚪ VOID — precondition not met (walk did not commit, its Ctrl+Z did not undo it, or <3 ARC rows): nothing below is judged');
  chk('R1 PRE (walk committed, one Ctrl+Z undid every walk row)', pre, 'walkActive ' + sWalk.walkActive + '→' + s1.walkActive + ' arc=' + arc.length);
  chk('R2 UNDO (Ctrl+Z undid the move row)', pre && s2.rows[0].undone === true && s2.walkActive === 0, JSON.stringify(s2));
  chk('R3 REDO (Ctrl+Y brought back the MOVE, no walk row resurrected)', pre && s3.rows[0].undone === false && s3.walkActive === 0, JSON.stringify(s3));
  chk('R4 DELETE (Ctrl+Y brought back the move, the deleted row stayed deleted)', pre && s4.rows[0].undone === false && s4.rows[1].undone === true && s4.walkActive === 0, JSON.stringify(s4));
  chk('R5 NO-ERROR (0 pageerror, op-log verifies)', errs.length === 0 && chain === true, 'errs=' + errs.length + ' ' + errs.slice(0, 2).join(' | ') + ' chain=' + chain);
  console.log('W-UNDO-RESURRECT: ' + pass + ' PASS / ' + fail + ' FAIL');
  await br.close(); server.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
