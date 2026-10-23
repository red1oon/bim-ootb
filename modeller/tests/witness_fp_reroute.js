#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-FP-REROUTE (rule D76, prompts/DXF2BIM_FOUNDATION_LANE.md §D76). Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: one signed move of one sprinkler head made the re-route verb route the BOM-tree network with the pattern bridge only (0 segments): the whole network (66 runs, 7 fittings) was signed away
 * and its 90 joint parts stayed behind tacked to nothing; and undoing the §D72 yield left the lamp markers where the yield put them.
 *   R1 FOLLOWS — after the move the BOM-tree network is re-routed from the op-log positions: same roles and counts (never 0), the moved head's drop stands at its NEW position.
 *   R2 RETACKED— 90 joint parts, three at each head's current x, y (1 mm), the moved head's included.
 *   R3 SIGNED  — the active rows are the new route's (sweeps = segments less filled drops, fittings = bendFittings of it, 90 parts, no duplicates); the log has no "segs N→0" for FP.
 *   R4 UNDO    — one real Ctrl+Z restores the first network and parts exactly (1 mm); Ctrl+Y brings the moved ones back.
 *   R7 YIELD   — undoing the yield moves puts every lamp marker at its op-log position (0 off) and clears yieldTo; redoing them again (0 off).
 * Input: the shed's Viewer database (SHED_DB; absent -> INCONCLUSIVE). Software GL, headless.
 * Usage: SHED_DB=<ShedFilm3_extracted.db> NODE_PATH=<dir with better-sqlite3> node modeller/tests/witness_fp_reroute.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer')), ROOT = path.join(__dirname, '..', '..'), DB = process.env.SHED_DB, DX = 0.4;
let fail = 0, judged = 0; const say = s => console.log(s), check = (id, issue, ok, d) => { judged++; if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.db': 'application/octet-stream' };
(async () => {
  if (!DB || !fs.existsSync(DB)) { say('INCONCLUSIVE | SHED_DB (the shed\'s Viewer database) is absent: ' + DB); say('SUMMARY fail=0 judged=0'); process.exit(0); }
  const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(b); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const br = await puppeteer.launch({ headless: 'new', protocolTimeout: 1800000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await br.createBrowserContext(), pg = await ctx.newPage(); await pg.setViewport({ width: 1200, height: 700 }); const logs = [];
  pg.on('pageerror', e => say('§PAGEERR ' + String(e).slice(0, 200)));
  pg.on('console', m => { const t = m.text(); if (/§DW-YIELD|§MEP-REROUTE|§JOINT-BOM|§DW-ASM-COMMIT/.test(t)) { logs.push(t); say('  ' + t.slice(0, 200)); } });
  try {
    await pg.goto(base + '/modeller/modeller.html', { waitUntil: 'load', timeout: 120000 }); await pg.waitForFunction('window.__sceneReady===true && window.Bonsai && window.A', { timeout: 120000 });
    await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__local"]', { visible: true });
    const [c] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__local"]')]); await c.accept([DB]);
    await pg.waitForFunction('!!window.__dwBuf && !!window.__arcSeedReady', { timeout: 240000 }); await pg.evaluate(async () => { await window.__arcSeedReady; });
    await pg.evaluate(async () => { window.__idle = async (maxWait) => { const n = window.__dwRerouteIdle || 0, t0 = Date.now(); while ((window.__dwRerouteIdle || 0) <= n && Date.now() - t0 < (maxWait || 120000)) await new Promise(r => setTimeout(r, 200)); await new Promise(r => setTimeout(r, 4000)); };   // a burst of oplog events can bump the counter early: settle 4 s after the first bump
      window.__walk = async d => { window.__dwLastDoneDisc = null; window.discWalk(d); const t0 = Date.now(); while (window.__dwLastDoneDisc !== d && Date.now() - t0 < 300000) await new Promise(r => setTimeout(r, 200)); };
      window.__oplogPos = disc => { const rows = (window.__dwRowsByDisc || {})[disc], O = window.Bonsai.oplog, want = {}; (rows.walk || []).forEach(id => { want[id] = 1; }); const out = [];
        O._geomOps().forEach(x => { if (!want[x.id] || x.op_type !== 'GEOM_INSERT' || !x.parameters || !x.parameters.placement) return; const pp = x.parameters.placement, mv = O.moveDeltaFor(x.id); out.push({ id: x.id, x: pp.x + (mv.dx || 0), y: pp.y + (mv.dy || 0) }); }); return out; };
      window.__snap = () => { const O = window.Bonsai.oplog, act = {}; O._geomOps().forEach(x => { act[x.id] = x; });
        const cnt = (set, pred) => Object.keys(set || {}).filter(id => act[id] && pred(act[id])).length, roles = {}; (window.__dwChains.FP || []).forEach(s => { roles[s.role] = (roles[s.role] || 0) + 1; });
        const parts = (window.__dwAssembly.FP || []).map(p => [+p.pos[0].toFixed(3), +p.pos[1].toFixed(3), +p.pos[2].toFixed(3)]).sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
        return { roles, segs: (window.__dwChains.FP || []).length, parts, sweeps: cnt(window.__dwRouteRowIds.FP, o => o.op_type === 'GEOM_SWEEP'), fits: cnt(window.__dwRouteRowIds.FP, o => o.op_type === 'GEOM_INSERT'), asm: cnt(window.__dwAsmRowIds.FP, o => o.op_type === 'GEOM_INSERT'),
          heads: window.__oplogPos('FP').map(h => [h.x, h.y]), drops: (window.__dwChains.FP || []).filter(s => s.role === 'DROP').map(s => [s.from[0], s.from[1]]) }; }; });
    // walks: ELEC then FP (the lamps yield to the pipework: 24 signed GEOM_MOVE)
    await pg.evaluate(async () => { await window.__walk('ELEC'); await window.__walk('FP'); await new Promise(r => setTimeout(r, 1500)); });
    // R7: undo / redo the yield moves
    const Y = await pg.evaluate(async () => {
      const O = window.Bonsai.oplog, kr = O.db.exec("SELECT id, parameters FROM kernel_ops WHERE op_type='GEOM_MOVE' AND undone=0 ORDER BY id"), ys = (kr.length ? kr[0].values : []).filter(v => /dw-yield/.test(JSON.parse(v[1]).induced || '')).length;
      const cmp = () => { const op = window.__oplogPos('ELEC'), byId = {}; op.forEach(o => { byId[o.id] = o; }); let off = 0; window.__dwWalks.ELEC.forEach(p => { const o = byId[p._fid]; if (o && (Math.abs(o.x - p.x) > 0.002 || Math.abs(o.y - p.y) > 0.002)) off++; }); return { off, yieldTo: window.__dwWalks.ELEC.filter(p => p.yieldTo).length, n: window.__dwWalks.ELEC.length }; };
      const a = cmp(); for (let i = 0; i < ys; i++) await O.undo(); await window.__idle(); const u = cmp(); for (let i = 0; i < ys; i++) await O.redo(); await window.__idle(); const r = cmp();
      return { ys, a, u, r }; });
    check('R7', 'undoing the yield moves puts every lamp marker at its op-log position and clears yieldTo; redoing them again (0 off)', Y.ys === 24 && Y.a.off === 0 && Y.u.off === 0 && Y.u.yieldTo === 0 && Y.r.off === 0, `yield_moves=${Y.ys} after_yield off=${Y.a.off} after_undo off=${Y.u.off} yieldTo=${Y.u.yieldTo} after_redo off=${Y.r.off} lamps=${Y.u.n}`);
    // the head move
    const S0 = await pg.evaluate(() => window.__snap()), head = await pg.evaluate(() => { const h = window.__oplogPos('FP')[0]; return h; });
    await pg.evaluate(async (id, dx) => { await window.Bonsai.oplog.commit({ op_type: 'GEOM_MOVE', parameters: { parent: id, dx: dx, dy: 0, dz: 0 } }, {}); await window.__idle(); }, head.id, DX);
    const S1 = await pg.evaluate(() => { const s = window.__snap(); s.fitsWanted = window.DiscWalker.bendFittings ? window.DiscWalker.bendFittings('FP', window.__dwChains.FP, {}).length : null; return s; });
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b), near = (p, q) => Math.abs(p[0] - q[0]) <= 0.001 && Math.abs(p[1] - q[1]) <= 0.001;
    const newHead = [head.x + DX, head.y];
    check('R1', 'after one signed move the BOM-tree network is re-routed: same roles and counts, never 0 segments; the moved head\'s drop stands at its new position', S1.segs > 0 && same(S1.roles, S0.roles) && S1.drops.some(d => near(d, newHead)) && !S1.drops.some(d => near(d, [head.x, head.y])), `segs ${S0.segs}->${S1.segs} roles ${JSON.stringify(S0.roles)}->${JSON.stringify(S1.roles)} drop_at_new=${S1.drops.some(d => near(d, newHead))} drop_at_old=${S1.drops.some(d => near(d, [head.x, head.y]))}`);
    const partsAt = (S, h) => S.parts.filter(p => near(p, h)).length, bad = S1.heads.filter(h => partsAt(S1, h) !== 3).length;
    check('R2', '90 joint parts, three at each head\'s current x, y (1 mm), the moved head\'s included', S1.parts.length === 90 && bad === 0 && partsAt(S1, newHead) === 3, `parts ${S0.parts.length}->${S1.parts.length} heads=${S1.heads.length} heads_without_3_parts=${bad} parts_at_moved_head=${partsAt(S1, newHead)} parts_at_old_head=${partsAt(S1, [head.x, head.y])}`);
    const wipe = logs.filter(t => /§MEP-REROUTE disc=FP .*→0/.test(t)).length;
    check('R3', 'the active rows are the new route: sweeps = segments less the filled drops, fittings = bendFittings of it, 90 parts (no duplicates); no "segs N→0" for FP', S1.sweeps === S1.segs - (S1.roles.DROP || 0) && S1.fits === S1.fitsWanted && S1.asm === S0.asm && S0.asm === 90 && wipe === 0, `sweeps ${S0.sweeps}->${S1.sweeps} (segs - filled drops = ${S1.segs - (S1.roles.DROP || 0)}) fits ${S0.fits}->${S1.fits} (bendFittings of the new route ${S1.fitsWanted}) parts ${S0.asm}->${S1.asm} wipes=${wipe}`);
    await pg.keyboard.down('Control'); await pg.keyboard.press('z'); await pg.keyboard.up('Control'); await pg.evaluate(() => window.__idle(10000));
    const S2 = await pg.evaluate(() => window.__snap());
    await pg.keyboard.down('Control'); await pg.keyboard.press('y'); await pg.keyboard.up('Control'); await pg.evaluate(() => window.__idle(10000));
    const S3 = await pg.evaluate(() => window.__snap());
    check('R4', 'one Ctrl+Z restores the first network and parts exactly; Ctrl+Y brings the moved ones back', same(S2.parts, S0.parts) && same(S2.roles, S0.roles) && S2.sweeps === S0.sweeps && S2.asm === S0.asm && same(S3.parts, S1.parts) && same(S3.roles, S1.roles) && S3.asm === S1.asm,
      `after_undo parts_equal=${same(S2.parts, S0.parts)} roles_equal=${same(S2.roles, S0.roles)} rows ${S2.sweeps}/${S2.fits}/${S2.asm}; after_redo parts_equal=${same(S3.parts, S1.parts)} (to S0: ${same(S3.parts, S0.parts)}) roles_equal=${same(S3.roles, S1.roles)} rows ${S3.sweeps}/${S3.fits}/${S3.asm} heads_moved_at_redo=${S3.heads.some(h => near(h, newHead))} drops_at_new=${S3.drops.some(d => near(d, newHead))}`);
  } finally { await br.close(); srv.close(); }
  say('SUMMARY fail=' + fail + ' judged=' + judged); process.exit(fail ? 1 : 0);
})().catch(e => { say('FATAL ' + (e && e.stack || e)); process.exit(1); });
