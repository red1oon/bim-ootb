#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-FP-ELEC-CLEAR (rule D72, prompts/DXF2BIM_FOUNDATION_LANE.md §D72). Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: on the shed the sprinkler pipework ran through the lamps (12 / 30 branches, 18 / 90 joint parts, 6 / 30 heads met a lamp's box, min gap 0): every third head row
 * lies on a lamp row. The lamps must give way (the Terminal's measured rule: ELEC yields to FP, 0.155 m), the pipework stays where it is.
 *   C1 RULE      — farm_rules.db rule_avoidance has the ELEC / FP row (0.155, yields ELEC) projected from terminal_rules.db; no row = NO-OP.
 *   C2 CLEAR     — ELEC then FP: every lamp box keeps >= 0.155 m from every FP pipe (real outside diameter), head and joint part; 69 lamps, 30 heads; the FP heads and network equal an FP-only walk.
 *   C3 LEAST     — each moved lamp moved sideways only (dz 0), by at most its footprint + 0.155 + 0.05 m, inside the plan box; the unmoved lamps are where they were.
 *   C4 SIGNED    — the moves are ONE signed group of GEOM_MOVE ops, one per moved lamp, parent = that lamp's insert op, dx / dy = its shift.
 *   C5 EITHER    — FP then ELEC: the same clearance, the lamps placed clear before their commit (no yield GEOM_MOVE).
 * Input: the shed's Viewer database (SHED_DB, local; absent -> INCONCLUSIVE). Software GL, headless.
 * Usage: SHED_DB=<SHED_extracted.db> NODE_PATH=<dir with better-sqlite3> node modeller/tests/witness_fp_elec_clear.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer')), ROOT = path.join(__dirname, '..', '..');
const DB = process.env.SHED_DB, MC = 0.155;
let fail = 0, judged = 0; const say = s => console.log(s), check = (id, issue, ok, d) => { judged++; if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.db': 'application/octet-stream' };
const ARGS = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
(async () => {
  if (!DB || !fs.existsSync(DB)) { say('INCONCLUSIVE | SHED_DB (the shed\'s Viewer database) is absent: ' + DB); say('SUMMARY fail=0 judged=0'); process.exit(0); }
  // C1 the rule, read from the shipped rules db
  let row = null; try { const D = require('better-sqlite3'), d = new D(path.join(ROOT, 'modeller', 'farm_rules.db'), { readonly: true }); row = d.prepare("SELECT disc_a, disc_b, min_clear_m, yields, n_measured, provenance FROM rule_avoidance WHERE disc_a='ELEC' AND disc_b='FP'").get() || null; d.close(); } catch (e) { say('  rules db read: ' + e.message); }
  if (!row) { check('C1', 'farm_rules.db carries the ELEC / FP avoidance row', false, 'NO-OP: no ELEC/FP row in rule_avoidance'); }
  else check('C1', 'farm_rules.db carries the ELEC / FP avoidance row (0.155, yields ELEC) projected from terminal_rules.db', Math.abs(row.min_clear_m - MC) < 1e-9 && row.yields === 'ELEC' && /terminal_rules\.db/.test(row.provenance), JSON.stringify(row));
  const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(b); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const br = await puppeteer.launch({ headless: 'new', protocolTimeout: 1800000, args: ARGS });
  // each run its own browser context: the op-log persists per origin, a second page of the same context would inherit the first run's ops
  const open = async () => { const ctx = br.createBrowserContext ? await br.createBrowserContext() : await br.createIncognitoBrowserContext(), pg = await ctx.newPage(); pg.ctx = ctx; await pg.setViewport({ width: 1200, height: 700 }); pg.errs = []; pg.logs = [];
    pg.on('pageerror', e => { pg.errs.push(String(e).slice(0, 200)); say('§PAGEERR ' + String(e).slice(0, 200)); });
    pg.on('console', m => { const t = m.text(); if (/§DW-YIELD|§DISC-WALK |§BOM-TREE |§JOINT-BOM/.test(t)) { pg.logs.push(t); say('  ' + t.slice(0, 220)); } });
    await pg.goto(base + '/modeller/modeller.html', { waitUntil: 'load', timeout: 120000 }); await pg.waitForFunction('window.__sceneReady===true && window.Bonsai && window.A', { timeout: 120000 });
    await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__local"]', { visible: true });
    const [c] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__local"]')]); await c.accept([DB]);
    await pg.waitForFunction('!!window.__dwBuf && !!window.__arcSeedReady', { timeout: 240000 }); await pg.evaluate(async () => { await window.__arcSeedReady; }); return pg; };
  // walk discs in order; snapshot ELEC before FP; read the drawn state
  const run = (pg, order) => pg.evaluate(async (order, MC) => {
    const walk = async d => { window.__dwLastDoneDisc = null; window.discWalk(d); const t0 = Date.now(); while (window.__dwLastDoneDisc !== d && Date.now() - t0 < 300000) await new Promise(r => setTimeout(r, 200)); };
    const snap = {}, n0 = window.Bonsai.oplog.length;
    const T0 = window.THREE, M0 = new T0.Matrix4(), W0 = new T0.Matrix4(), overNow = () => { const ids = new Set(window.Bonsai.oplog._geomOps().filter(o => o.parameters && o.parameters._dw).map(o => o.id)), pl = new T0.Box3(); window.Bonsai.group().children.forEach(m => { if (m.isMesh && m.visible && !m.isInstancedMesh && !ids.has(m.userData && m.userData.featureId)) pl.union(new T0.Box3().setFromObject(m)); });
      const out = []; window.A.scene.traverse(o => { if (!(o.isInstancedMesh && o.userData && o.userData.dwDisc === 'ELEC')) return; o.updateMatrixWorld(); if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); for (let i = 0; i < o.instanceMatrix.count; i++) { o.getMatrixAt(i, M0); W0.multiplyMatrices(o.matrixWorld, M0); const b = o.geometry.boundingBox.clone().applyMatrix4(W0); out.push(+Math.max(0, pl.min.x - b.min.x, b.max.x - pl.max.x, pl.min.y - b.min.y, b.max.y - pl.max.y).toFixed(4)); } }); return out; };
    for (const d of order) { if (d === 'FP' && window.__dwWalks.ELEC) { snap.elec = window.__dwWalks.ELEC.map(p => [p.x, p.y, p.z, p._fid]); snap.over = overNow(); } await walk(d); }
    await new Promise(r => setTimeout(r, 1500));
    const T = window.THREE, M = new T.Matrix4(), W = new T.Matrix4(), boxes = k => { const out = []; window.A.scene.traverse(o => { if (!(o.isInstancedMesh && o.userData && k(o.userData))) return; o.updateMatrixWorld(); if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      for (let i = 0; i < o.instanceMatrix.count; i++) { o.getMatrixAt(i, M); W.multiplyMatrices(o.matrixWorld, M); out.push(o.geometry.boundingBox.clone().applyMatrix4(W)); } }); return out; };
    const lamps = boxes(u => u.dwDisc === 'ELEC'), parts = boxes(u => u.dwAsm === 'FP'), heads = boxes(u => u.dwDisc === 'FP'), nParts = (window.__dwAssembly.FP || []).length;
    const segs = (window.__dwChains.FP || []).filter(s => !(s.role === 'DROP' && nParts)), pipes = segs.map(s => { const r = (s.dia_mm || 80) / 2000; return new T.Box3(new T.Vector3(Math.min(s.from[0], s.to[0]) - r, Math.min(s.from[1], s.to[1]) - r, Math.min(s.from[2], s.to[2]) - r), new T.Vector3(Math.max(s.from[0], s.to[0]) + r, Math.max(s.from[1], s.to[1]) + r, Math.max(s.from[2], s.to[2]) + r)); });
    const gap = (a, b) => Math.hypot(Math.max(0, a.min.x - b.max.x, b.min.x - a.max.x), Math.max(0, a.min.y - b.max.y, b.min.y - a.max.y), Math.max(0, a.min.z - b.max.z, b.min.z - a.max.z));
    const minGap = list => { let g = 1e9, n = 0; list.forEach(b => lamps.forEach(l => { const x = gap(b, l); if (x < g) g = x; if (x < MC - 1e-4) n++; })); return { min: +g.toFixed(4), under: n }; };
    const dwIds = new Set(window.Bonsai.oplog._geomOps().filter(o => o.parameters && o.parameters._dw).map(o => o.id)), plan = new T.Box3(); window.Bonsai.group().children.forEach(m => { if (m.isMesh && m.visible && !m.isInstancedMesh && !dwIds.has(m.userData && m.userData.featureId)) plan.union(new T.Box3().setFromObject(m)); });
    const over = b => Math.max(0, plan.min.x - b.min.x, b.max.x - plan.max.x, plan.min.y - b.min.y, b.max.y - plan.max.y);
    const kr = window.Bonsai.oplog.db.exec("SELECT id, parameters, gid FROM kernel_ops WHERE op_type='GEOM_MOVE' AND undone=0 ORDER BY id"), yops = (kr.length ? kr[0].values : []).map(v => ({ p: JSON.parse(v[1]), gid: v[2] })).filter(o => /dw-yield/.test(o.p.induced || ''));
    const P = o => o.p;
    return { lampsN: lamps.length, headsN: heads.length, pipesN: pipes.length, partsN: parts.length, pipes: minGap(pipes), heads: minGap(heads), parts: minGap(parts),
      over0: snap.over || [], elec: (window.__dwWalks.ELEC || []).map(p => ({ x: p.x, y: p.y, z: p.z, fid: p._fid, y2: p.yieldTo || null, bx: p.bx, by: p.by })), snap: snap.elec || null,
      lampOver: lamps.map(b => +over(b).toFixed(4)),
      plan: [plan.min.x, plan.max.x, plan.min.y, plan.max.y].map(v => +v.toFixed(3)),
      fp: { heads: (window.__dwWalks.FP || []).map(p => [+p.x.toFixed(4), +p.y.toFixed(4), +p.z.toFixed(4)]), segs: (window.__dwChains.FP || []).map(s => s.role + ':' + s.from.map(v => v.toFixed(4)) + '>' + s.to.map(v => v.toFixed(4))) },
      yops: yops.map(o => ({ parent: P(o).parent, dx: P(o).dx, dy: P(o).dy, dz: P(o).dz, gid: o.gid })) };
  }, order, MC);
  try {
    const pa = await open(), A = await run(pa, ['ELEC', 'FP']); await pa.ctx.close();
    const pf = await open(), F = await run(pf, ['FP']); await pf.ctx.close();
    const sameFP = JSON.stringify(A.fp) === JSON.stringify(F.fp);
    check('C2', 'ELEC then FP: every lamp keeps >= 0.155 m from every FP pipe, head and joint part; 69 lamps, 30 heads; the FP heads and network equal an FP-only walk', A.lampsN === 69 && A.headsN === 30 && A.pipes.under === 0 && A.heads.under === 0 && A.parts.under === 0 && A.pipesN > 0 && A.partsN > 0 && sameFP,
      `lamps=${A.lampsN} heads=${A.headsN} pipes=${A.pipesN} parts=${A.partsN} under_clear pipes=${A.pipes.under} heads=${A.heads.under} parts=${A.parts.under} min_gap pipes=${A.pipes.min} heads=${A.heads.min} parts=${A.parts.min} fp_equal_fp_only=${sameFP}`);
    const moved = A.elec.filter(p => p.y2), snapOk = A.snap && A.snap.length === A.elec.length;
    const least = moved.every((p, i) => { const k = A.elec.indexOf(p), s = A.snap[k]; return Math.abs(p.z - s[2]) < 1e-9 && Math.hypot(p.x - s[0], p.y - s[1]) <= Math.max(p.bx || 0, p.by || 0) + MC + 0.05 && Math.abs(Math.hypot(p.x - s[0], p.y - s[1]) - Math.hypot(p.y2.dx, p.y2.dy)) < 1e-3; });
    const still = A.elec.every((p, k) => p.y2 || (p.x === A.snap[k][0] && p.y === A.snap[k][1] && p.z === A.snap[k][2]));
    const S0 = A.snap0 || [], movedOut = A.elec.map((p, k) => p.y2 && A.lampOver[k] > (A.over0[k] || 0) + 1e-4 ? k : -1).filter(k => k >= 0);
    check('C3', 'each moved lamp moved sideways only (dz 0), by at most its footprint + 0.155 + 0.05 m, never further outside the building\'s plan box than before; the unmoved lamps are where they were', snapOk && moved.length > 0 && least && still && !movedOut.length,
      `moved=${moved.length} of ${A.elec.length} max_shift=${Math.max(0, ...moved.map(p => Math.hypot(p.y2.dx, p.y2.dy))).toFixed(3)} sideways_and_bounded=${least} unmoved_equal=${still} moved_further_outside=${movedOut.length} (lamps overhanging the plan before the yield: ${A.over0.filter(x => x > 1e-4).length}, max ${Math.max(0, ...A.over0).toFixed(3)} m; plan ${JSON.stringify(A.plan)})`);
    const byFid = {}; moved.forEach(p => { byFid[p.fid] = p; }); const gids = new Set(A.yops.map(o => o.gid));
    const signed = A.yops.length === moved.length && moved.length > 0 && gids.size === 1 && A.yops.every(o => byFid[o.parent] && Math.abs(o.dx - byFid[o.parent].y2.dx) < 1e-6 && Math.abs(o.dy - byFid[o.parent].y2.dy) < 1e-6 && o.dz === 0);
    check('C4', 'the moves are ONE signed group of GEOM_MOVE ops, one per moved lamp, on its own insert, equal to its shift', signed, `yield_moves=${A.yops.length} moved=${moved.length} groups=${gids.size}`);
    const pb = await open(), B = await run(pb, ['FP', 'ELEC']); const yb = pb.logs.filter(t => /§DW-YIELD disc=ELEC/.test(t)).pop() || ''; await pb.ctx.close();
    check('C5', 'FP then ELEC: the same clearance; the lamps are placed clear before their commit (no yield GEOM_MOVE)', B.lampsN === 69 && B.pipes.under === 0 && B.heads.under === 0 && B.parts.under === 0 && B.yops.length === 0 && /before its commit/.test(yb) && B.elec.some(p => p.y2),
      `lamps=${B.lampsN} under_clear pipes=${B.pipes.under} heads=${B.heads.under} parts=${B.parts.under} yield_moves=${B.yops.length} ${yb.slice(0, 120)}`);
  } finally { await br.close(); srv.close(); }
  say('SUMMARY fail=' + fail + ' judged=' + judged); process.exit(fail ? 1 : 0);
})().catch(e => { say('FATAL ' + (e && e.stack || e)); process.exit(1); });
