#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-GESTURE-UNDO: ONE user gesture = ONE undo step = ONE redo step. Read the log after every run.
 * SPEC §ONE-GESTURE-ONE-UNDO (bim-compiler prompts/MODELLER_MASTER.md §SESSION 2026-09-30b):
 *   A GESTURE is everything one user action commits — one Move-gizmo release / one arrow nudge / one item-drag drop / one
 *   Accept click: the primary op for EVERY selected target PLUS every induced rider (hosted-by door/window rides, fills-opening
 *   rides, GEOM_CUT_MOVE voids). The group boundary lives in ONE place: bonsai_oplog.js commitGesture() — one signed
 *   'gesture-grp-N' gid; O.undo()/O.redo() treat that gid as one LIFO step (§P8) and ModellerHistory records ONE node for it.
 *   Any caller whose gesture lands >1 op MUST commit through commitGesture; a 1-op gesture keeps commit() (byte-unchanged).
 * ISSUE (found by the guide session 2026-09-30, RESUME_MODELLER_GUIDE_SCREENSHOT_FIX.md First Steps finding 1): modeller.html
 *   commitMove() committed the wall and each hosted rider as SEPARATE commit() calls → Duplex wall #110: oplog 196→199, one
 *   Ctrl+Z → 199→198, wall still 0.417 m off, next Save refused (§SAVE_BLOCKED RED_CLASH door-out(46,110)).
 * FALSIFIER (each claim below fails on that code): real Open Duplex → real click on a wall that HOSTS fillings (asked of the app's
 *   own SdgCascade.ridersFor, not guessed) → Move tool → real drag of the X arrow →
 *   G1 GESTURE    the release lands N = 1 + riders rows (N ≥ 2), wall AND every rider moved by the SAME committed delta
 *   G2 UNDO       ONE Ctrl+Z → active length back to the pre-gesture length, wall + every rider centre back to pre (≤1e-6 m)
 *   G3 REDO       ONE Ctrl+Y → all N rows active again, every centre back at its post-move value (≤1e-6 m)
 *   G4 UNDO-AGAIN ONE Ctrl+Z → pre-gesture again (the redo left a clean boundary)
 *   G5 SAVE       Save after the undo is NOT blocked: a §SAVE_SNAPSHOT line, no §SAVE_BLOCKED
 * E2E_URL=<live modeller.html> runs the SAME witness against a deployed page (used for the RED-first run on unmodified main).
 */
'use strict';
const { runE2E } = require('./e2e_harness');
const URL = process.env.E2E_URL || undefined;

runE2E('W-E2E-GESTURE-UNDO', async (t) => {
  const pg = t.pg;
  const D = (a, b) => (a && b) ? Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) : Infinity;
  const centres = async (fids) => { const o = {}; for (const f of fids) o[f] = await t.centre(f); return o; };
  const maxRes = (A, B, fids, off) => Math.max(...fids.map(f => { const b = off ? [B[f][0] - off[0], B[f][1] - off[1], B[f][2] - off[2]] : B[f]; return D(A[f], b); }));
  const key = async (k) => { await pg.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
    await pg.keyboard.down('Control'); await pg.keyboard.press(k); await pg.keyboard.up('Control'); };
  const settle = async (fid, want, ms) => { const t0 = Date.now(); let c = await t.centre(fid); while (Date.now() - t0 < (ms || 20000) && D(c, want) > 1e-6) { await t.sleep(300); c = await t.centre(fid); } return Date.now() - t0; };

  await t.open('Duplex');
  { const t1 = Date.now(); while (Date.now() - t1 < 60000 && !(await pg.evaluate(() => window.Bonsai.group().children.filter(o => o.isMesh).length))) await t.sleep(300); }
  await pg.waitForFunction(() => !!(window.__arcFidByGuid && window.swXEdges && window.swXEdges.fills && window.swXEdges.fills.length && window.SdgCascade), { timeout: 30000 }).catch(() => {});

  // subject = an axis-aligned wall that HOSTS ≥1 filling, visible from the fitted camera (the app's own resolver answers "hosts")
  const cands = await pg.evaluate(() => {
    const ops = window.Bonsai.oplog._geomOps(), by = new Map(ops.map(o => [o.id, o])), out = [];
    for (const c of window.__e2e.candidates()) {
      const o = by.get(c.fid), P = o && o.parameters; if (!P || !/Wall/i.test(P.ifc_class || '')) continue;
      const pl = P.placement; if (pl && !(Math.abs(pl.rotX || 0) < 1e-6 && Math.abs(pl.rotY || 0) < 1e-6)) continue;
      const r = window.SdgCascade.ridersFor([c.fid], window.__arcGuidByFid, window.__arcFidByGuid, window.swXEdges.fills, new Set([c.fid]));
      if (r.length) out.push({ fid: c.fid, riders: r });
    }
    return out;
  });
  console.log('  §GESTURE-UNDO candidates (walls hosting fillings) n=' + cands.length + ' ' + JSON.stringify(cands.slice(0, 8)));
  let sel = null;
  for (const c of cands) {
    const pt = await pg.evaluate(f => window.__e2e.clickPointFor(f), c.fid); if (!pt) continue;
    await pg.mouse.click(pt[0], pt[1]); await t.sleep(250);
    const ss = await pg.evaluate(() => Array.from(window.Bonsai._selSet || []));
    if (ss.length === 1 && ss[0] === c.fid) { await t.flySettle(); sel = c; break; }
    await t.flySettle(); await pg.evaluate(() => window.Bonsai.select(null)); await pg.click('#b-fit'); await t.sleep(900);
  }
  if (!sel) { console.log('W-E2E-GESTURE-UNDO: INCONCLUSIVE — no door-hosting wall could be selected by a real click; nothing judged'); t.assert('G0 SUBJECT (a real click selects a wall hosting ≥1 filling)', false, 'INCONCLUSIVE'); return; }
  const fids = [sel.fid].concat(sel.riders);
  const pre = await centres(fids);
  console.log('  §GESTURE-UNDO subject wall=' + sel.fid + ' riders=' + JSON.stringify(sel.riders) + ' pre=' + JSON.stringify(Object.fromEntries(fids.map(f => [f, pre[f] && pre[f].map(v => +v.toFixed(4))]))));

  await pg.click('#b-move'); await t.sleep(800);
  const giz = await pg.evaluate(() => { const gz = window.A.scene.getObjectByName('MoveGizmo'); if (!gz) return null; let h = null; gz.traverse(o => { if (o.userData && o.userData.moveAxis === 'x' && !h) h = o; }); if (!h) return null; const w = new window.THREE.Vector3(); h.getWorldPosition(w); return [w.x, w.y, w.z]; });
  if (!giz) { t.assert('G0 SUBJECT (Move gizmo present)', false, 'no MoveGizmo'); return; }
  const before = await t.oplog();
  { const DELTA = 0.5, STEPS = 8, pts = [];
    for (let i = 0; i <= STEPS; i++) pts.push(await t.proj(giz[0] + DELTA * i / STEPS, giz[1], giz[2]));
    await pg.mouse.move(pts[0][0], pts[0][1]); await t.sleep(60); await pg.mouse.down(); await t.sleep(60);
    for (let i = 1; i < pts.length; i++) { await pg.mouse.move(pts[i][0], pts[i][1], { steps: 3 }); await t.sleep(30); }
    await t.sleep(60); await pg.mouse.up(); await t.sleep(1500); }
  { const t0 = Date.now(); while (Date.now() - t0 < 20000 && D(await t.centre(sel.fid), pre[sel.fid]) < 0.05) await t.sleep(400); }
  const after = await t.oplog();
  const newOps = await pg.evaluate(n => { const O = window.Bonsai.oplog, gidOf = new Map(O._allGeom().map(o => [o.id, o.gid])); return O._geomOps().slice(n).map(o => ({ id: o.id, op_type: o.op_type, gid: gidOf.get(o.id), parameters: o.parameters })); }, before.len);
  const wallOp = newOps.find(o => o.parameters && o.parameters.parent === sel.fid && !o.parameters.induced);
  const d = wallOp ? [wallOp.parameters.dx, wallOp.parameters.dy, wallOp.parameters.dz] : null;
  const post = await centres(fids);
  const moveRes = d ? maxRes(post, pre, fids, [-d[0], -d[1], -d[2]]) : Infinity;   // post − d == pre for every fid
  const gids = Array.from(new Set(newOps.map(o => o.gid)));
  console.log('  §GESTURE-UNDO move oplog ' + before.len + '→' + after.len + ' cursor ' + before.cur + '→' + after.cur + ' ops=' + JSON.stringify(newOps.map(o => o.op_type + '#' + o.id + '(' + (o.parameters.induced || 'primary') + ')')) + ' gids=' + JSON.stringify(gids) + ' d=' + JSON.stringify(d) + ' maxResidual(post−d−pre)=' + moveRes.toExponential(2));
  t.assert('G1 GESTURE (one release lands 1+' + sel.riders.length + ' rows; wall + every rider moved by the SAME committed delta ≤1e-6 m)',
    newOps.length === fids.length && !!d && Math.abs(d[0]) > 0.01 && moveRes < 1e-6, 'rows=' + newOps.length + ' want=' + fids.length + ' gids=' + gids.length + ' res=' + moveRes.toExponential(2));

  // G2 — ONE Ctrl+Z
  await key('KeyZ'); await t.sleep(1500); await settle(sel.fid, pre[sel.fid]);
  const u1 = await t.oplog(), c2 = await centres(fids), res2 = maxRes(c2, pre, fids);
  console.log('  §GESTURE-UNDO undo cursor ' + after.cur + '→' + u1.cur + ' len ' + after.len + '→' + u1.len + ' maxCentreResidual=' + res2.toExponential(2) + ' per-fid=' + JSON.stringify(Object.fromEntries(fids.map(f => [f, +D(c2[f], pre[f]).toFixed(4)]))));
  t.assert('G2 UNDO (ONE Ctrl+Z → active length back to pre-gesture ' + before.len + ', wall + every rider centre restored ≤1e-6 m)', u1.len === before.len && res2 < 1e-6, 'len=' + u1.len + ' residual=' + res2.toExponential(2));

  // G3 — ONE Ctrl+Y
  await key('KeyY'); await t.sleep(1500); await settle(sel.fid, post[sel.fid]);
  const r1 = await t.oplog(), c3 = await centres(fids), res3 = maxRes(c3, post, fids);
  console.log('  §GESTURE-UNDO redo len ' + u1.len + '→' + r1.len + ' maxResidualVsPost=' + res3.toExponential(2));
  t.assert('G3 REDO (ONE Ctrl+Y → all ' + fids.length + ' rows active again, every centre at its post-move value ≤1e-6 m)', r1.len === after.len && res3 < 1e-6, 'len=' + r1.len + ' residual=' + res3.toExponential(2));

  // G4 — ONE Ctrl+Z again
  await key('KeyZ'); await t.sleep(1500); await settle(sel.fid, pre[sel.fid]);
  const u2 = await t.oplog(), c4 = await centres(fids), res4 = maxRes(c4, pre, fids);
  console.log('  §GESTURE-UNDO undo-again len ' + r1.len + '→' + u2.len + ' residual=' + res4.toExponential(2));
  t.assert('G4 UNDO-AGAIN (ONE Ctrl+Z after the redo → pre-gesture again)', u2.len === before.len && res4 < 1e-6, 'len=' + u2.len + ' residual=' + res4.toExponential(2));

  t.slog.filter(l => /§ONE-GESTURE|§GESTURE-UNDO|§GESTURE-REDO|commitGesture gid|§MHIST/.test(l)).slice(-12).forEach(l => console.log('    app: ' + l.slice(0, 220)));
  // G5 — Save is not blocked
  const saveLog = []; pg.on('console', m => { const x = m.text(); if (/^§SAVE_/.test(x)) saveLog.push(x); });
  await pg.click('#b-save');
  { const t1 = Date.now(); while (Date.now() - t1 < 90000 && !saveLog.some(l => /SAVE_SNAPSHOT|SAVE_BLOCKED /.test(l))) await t.sleep(300); }
  saveLog.forEach(l => console.log('    ' + l.slice(0, 220)));
  const blocked = saveLog.find(l => /^§SAVE_BLOCKED /.test(l)), snap = saveLog.find(l => /^§SAVE_SNAPSHOT/.test(l));
  t.assert('G5 SAVE (Save after the undo is NOT blocked — §SAVE_SNAPSHOT, no §SAVE_BLOCKED)', !!snap && !blocked, blocked ? blocked.slice(0, 160) : (snap ? snap.slice(0, 120) : 'no §SAVE line in 90 s'));
}, { width: 1280, height: 860, dpr: 1, url: URL });
