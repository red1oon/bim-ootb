#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-DM-GRIDUNDO: real-user, maths-asserted E2E of M1 grid-undo correctness
 * (RESUME_SESSION_2026-07-08.md §OPEN item 4 — the direct-manip witness batch).
 *
 * ISSUE THIS PROVES OR DISPROVES: M1 (a committed GEOM_GRID_MOVE is a FOLD of the op-log — undo
 * reverts the gridline AND the recomposed walls) shipped with a dev witness (bonsai_gridundo_live.js)
 * that never drags anything — it calls window.Bonsai.gridmove.commit('gx1', 1.0) directly and undoes
 * via O.undo(). This witness drives the REAL user path: real #b-gridmove toolbar click, real mouse
 * drag of gridline B on the ground plane, real Ctrl+Z — and asserts the grid AND both attached walls
 * return to their EXACT pre-drag state (position for the translated wall, size for the stretched one).
 *
 * Fixture (hand-chosen exact numbers):
 *   grid xs=[0,2,4] (gridline B = gx1 at x=2), ys=[0,3]
 *   W-near bbox x[1.9,2.1] y[0,3]   z[0,3] — spans B
 *   W-edge bbox x[0,2]    y[0,0.2] z[0,3] — right edge ON B
 *   Engine attach rule (measured on the first run, confirmed by the op's own stored commands —
 *   both walls get {action:SCALE, axis:x, edge:far}): the FAR x-edge rides the gridline by delta,
 *   the near x-edge stays anchored → both walls stretch x-only; y/z never move.
 *   Real drag: grab the ground at (2.0,2.5), release at (3.0,2.5) → delta ≈ +1.0 (raw, unsnapped —
 *   commitGridMove passes the raw ground-raycast delta; asserted |delta−1.0|<0.05, then every
 *   downstream number asserted EXACTLY against the op's own committed delta, not against 1.0).
 *
 *   U1 DRAG-COMMITS    — real toolbar+drag commits EXACTLY ONE GEOM_GRID_MOVE on gx1 with
 *                        |delta−1.0|<0.05, and grid.xs[1] == 2+delta EXACTLY.
 *   U2 WALLS-RECOMPOSE — both walls stretched x-only: far edges at 2.1+delta / 2+delta, near edges
 *                        (1.9 / 0) and y/z extents untouched.
 *   U3 GRIDMOVE-LOG    — the real `§GRIDMOVE commit grid=gx1 delta=…` line fired.
 *   U4 SCRUB-BACK-EXACT— the real #hist-slider scrubbed to before the grid move: grid.xs[1] == 2
 *                        EXACTLY and both walls component-wise IDENTICAL to pre-drag (position AND
 *                        size — M1's claim that the gridline is a pure FOLD of the op-log).
 *   U5 SCRUB-FWD-EXACT — slider forward to the tip: 2+delta and the recomposed walls return exactly.
 *   U6 CTRLZ-SINGLE-STEP — ⚠ KNOWN RED 2026-07-08, a REAL REGRESSION this witness found and pins:
 *                        one real Ctrl+Z must undo ONE step (grid back to 2, BOTH walls intact at
 *                        pre-drag). TODAY it undoes TWO steps — common/history_bar.js _wireKeyboard's
 *                        document-level Ctrl+Z (wired for the modeller by PR #675 / d1b9e49 via
 *                        HB.configure) AND modeller.html §3197's own window-level Ctrl+Z BOTH call
 *                        HB.undo(), so the second undo also removes wall 2 (its mesh vanishes).
 *                        Evidence printed: two §HIST_UNDO + two §OPLOG-undo lines per ONE keypress.
 *                        The fold itself is correct (U4/U5 green; a single oplog.undo() restores
 *                        everything exactly — probed separately). Fix belongs to a follow-up lane:
 *                        de-duplicate the two Ctrl+Z listeners; then this leg flips GREEN unchanged.
 *   U7 CHAIN           — KernelOps chain verifies at the end regardless.
 */
'use strict';
const { runE2E } = require('./e2e_harness');

runE2E('W-E2E-DM-GRIDUNDO', async (t) => {
  const pg = t.pg;
  const fx = await pg.evaluate(async () => {
    const O = window.Bonsai.oplog;
    window.Bonsai.grid.define({ xs: [0, 2, 4], ys: [0, 3], xlabels: ['A', 'B', 'C'], ylabels: ['1', '2'] });
    window.Bonsai.grid.show(true); O.clear();
    const Ws = await O.commit({ op_type: 'GEOM_EXTRUDE_POLY', parameters: { profile: { points: [[1.9, 0], [2.1, 0], [2.1, 3], [1.9, 3]] }, depth: 3 } }, { color: 0x9fb4c8 });
    const We = await O.commit({ op_type: 'GEOM_EXTRUDE_POLY', parameters: { profile: { points: [[0, 0], [2, 0], [2, 0.2], [0, 0.2]] }, depth: 3 } }, { color: 0x9fb4c8 });
    const meshOf = f => window.Bonsai.group().children.find(o => o.isMesh && o.userData.featureId === f);
    for (let i = 0; i < 120 && !(meshOf(Ws.id) && meshOf(We.id)); i++) await new Promise(r => setTimeout(r, 50));
    return { ws: Ws.id, we: We.id, baseX1: window.Bonsai.grid.xs[1] };
  });
  const bboxOf = (fid) => pg.evaluate(f => { const m = window.Bonsai.group().children.find(o => o.isMesh && o.userData.featureId === f); if (!m) return null; m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox; return [b.min.x, b.max.x, b.min.y, b.max.y, b.min.z, b.max.z]; }, fid);
  const wsBefore = await bboxOf(fx.ws), weBefore = await bboxOf(fx.we);
  console.log('§DM-GRIDUNDO fixture ws=' + fx.ws + ' we=' + fx.we + ' baseX1=' + fx.baseX1 +
    ' wsBB=' + JSON.stringify(wsBefore) + ' weBB=' + JSON.stringify(weBefore));

  // top-down camera is fine here: the grid drag raycasts the GROUND plane directly, no gizmo occlusion
  await pg.evaluate(() => { const cam = window.A.camera, ctl = window.A.controls; cam.up.set(0, 1, 0); cam.position.set(2, 1.5, 14); ctl.target.set(2, 1.5, 0); ctl.update(); if (window.A.requestRender) window.A.requestRender(); });
  await t.sleep(350);
  const proj = (x, y, z) => pg.evaluate((a, b, c) => { const v = new window.THREE.Vector3(a, b, c).project(window.A.camera); const cv = window.A.renderer.domElement, r = cv.getBoundingClientRect(); return [(v.x * 0.5 + 0.5) * r.width + r.left, (-v.y * 0.5 + 0.5) * r.height + r.top]; }, x, y, z);

  // ── U1/U2/U3: real Move-Grid toolbar click + real gridline drag +1.0 ───────────────────────────
  await pg.click('#b-gridmove'); await t.sleep(300);
  const d0 = await proj(2.0, 2.5, 0), d1 = await proj(3.0, 2.5, 0);
  await pg.mouse.move(d0[0], d0[1]); await t.sleep(60);
  await pg.mouse.down(); await t.sleep(80);
  await pg.mouse.move((d0[0] + d1[0]) / 2, (d0[1] + d1[1]) / 2, { steps: 5 }); await t.sleep(50);
  await pg.mouse.move(d1[0], d1[1], { steps: 6 }); await t.sleep(100);
  await pg.mouse.up(); await t.sleep(1500);                      // commit + engine recompose + refold

  const afterMove = await pg.evaluate(() => {
    const O = window.Bonsai.oplog;
    const gm = O._geomOps().filter(o => o.op_type === 'GEOM_GRID_MOVE');
    return { x1: window.Bonsai.grid.xs[1], ops: gm.map(o => ({ grid: o.parameters.grid_id || o.parameters.gridId || o.parameters.id, delta: +o.parameters.delta })), raw: gm.map(o => o.parameters) };
  });
  const delta = afterMove.ops.length === 1 ? afterMove.ops[0].delta : NaN;
  console.log('§DM-GRIDUNDO afterMove x1=' + afterMove.x1 + ' ops=' + JSON.stringify(afterMove.raw));
  t.assert('U1 DRAG-COMMITS (one GEOM_GRID_MOVE on gx1, |delta−1.0|<0.05, grid.xs[1]==2+delta exactly)',
    afterMove.ops.length === 1 && Math.abs(delta - 1.0) < 0.05 && Math.abs(afterMove.x1 - (2 + delta)) < 1e-9 &&
    JSON.stringify(afterMove.raw).includes('gx1'),
    'x1=' + afterMove.x1 + ' delta=' + delta + ' ops=' + JSON.stringify(afterMove.raw));

  let wsAfter = null, weAfter = null;
  for (let i = 0; i < 100; i++) {
    wsAfter = await bboxOf(fx.ws); weAfter = await bboxOf(fx.we);
    if (wsAfter && weAfter && Math.abs(wsAfter[1] - (2.1 + delta)) < 1e-3 && Math.abs(weAfter[1] - (2 + delta)) < 1e-3) break;
    await t.sleep(80);
  }
  console.log('§DM-GRIDUNDO recompose wsBB=' + JSON.stringify(wsAfter) + ' weBB=' + JSON.stringify(weAfter));
  const near = (a, b, tol) => Math.abs(a - b) < (tol == null ? 1e-3 : tol);
  t.assert('U2 WALLS-RECOMPOSE (both walls stretch x-only: far edges ride the gridline by exactly delta, near edges/y/z fixed)',
    !!wsAfter && !!weAfter &&
    near(wsAfter[0], 1.9) && near(wsAfter[1], 2.1 + delta) && near(wsAfter[2], 0) && near(wsAfter[3], 3) && near(wsAfter[5], 3) &&
    near(weAfter[0], 0) && near(weAfter[1], 2 + delta) && near(weAfter[2], 0) && near(weAfter[3], 0.2) && near(weAfter[5], 3),
    'ws=' + JSON.stringify(wsAfter) + ' we=' + JSON.stringify(weAfter) + ' delta=' + delta);
  const gmLog = t.slog.find(l => /^§GRIDMOVE commit grid=gx1 /.test(l));
  t.assert('U3 GRIDMOVE-LOG (real §GRIDMOVE commit line for gx1 fired)', !!gmLog, 'log=' + gmLog);
  await t.shot('01-dragged');

  // ── U4/U5: the M1 fold claim, via the REAL #hist-slider (single-step, unaffected by the Ctrl+Z bug) ─
  await t.undoToCursor(2);                                       // back to before the grid move (ops 1,2 = the walls)
  let backState = null, wsBack = null, weBack = null;
  for (let i = 0; i < 100; i++) {
    backState = await pg.evaluate(() => ({ x1: window.Bonsai.grid.xs[1] }));
    wsBack = await bboxOf(fx.ws); weBack = await bboxOf(fx.we);
    if (backState.x1 === 2 && wsBack && weBack && Math.abs(wsBack[1] - 2.1) < 1e-6 && Math.abs(weBack[1] - 2) < 1e-6) break;
    await t.sleep(80);
  }
  console.log('§DM-GRIDUNDO scrubBack x1=' + backState.x1 + ' wsBB=' + JSON.stringify(wsBack) + ' weBB=' + JSON.stringify(weBack));
  t.assert('U4 SCRUB-BACK-EXACT (real slider → grid.xs[1]==2 exactly; BOTH walls component-wise identical to pre-drag)',
    backState.x1 === 2 && !!wsBack && !!weBack &&
    wsBefore.every((v, i) => Math.abs(v - wsBack[i]) < 1e-6) && weBefore.every((v, i) => Math.abs(v - weBack[i]) < 1e-6),
    'x1=' + backState.x1 + ' ws→' + JSON.stringify(wsBack) + ' we→' + JSON.stringify(weBack));

  await t.undoToCursor(3);                                       // forward to the tip — the recompose must return exactly
  let fwdState = null, wsFwd = null, weFwd = null;
  for (let i = 0; i < 100; i++) {
    fwdState = await pg.evaluate(() => ({ x1: window.Bonsai.grid.xs[1] }));
    wsFwd = await bboxOf(fx.ws); weFwd = await bboxOf(fx.we);
    if (wsFwd && weFwd && Math.abs(wsFwd[1] - (2.1 + delta)) < 1e-3 && Math.abs(weFwd[1] - (2 + delta)) < 1e-3) break;
    await t.sleep(80);
  }
  console.log('§DM-GRIDUNDO scrubFwd x1=' + fwdState.x1 + ' wsBB=' + JSON.stringify(wsFwd) + ' weBB=' + JSON.stringify(weFwd));
  t.assert('U5 SCRUB-FWD-EXACT (real slider forward → x1==2+delta and both recomposed walls return exactly)',
    Math.abs(fwdState.x1 - (2 + delta)) < 1e-9 && !!wsFwd && !!weFwd &&
    Math.abs(wsFwd[1] - (2.1 + delta)) < 1e-3 && Math.abs(weFwd[1] - (2 + delta)) < 1e-3,
    'x1=' + fwdState.x1 + ' ws=' + JSON.stringify(wsFwd) + ' we=' + JSON.stringify(weFwd));

  // ── U6: ⚠ KNOWN RED — ONE real Ctrl+Z must be ONE undo step; today two listeners each fire HB.undo() ─
  const undosBefore = t.slog.filter(l => /^§OPLOG undo /.test(l)).length;
  await pg.keyboard.down('Control'); await pg.keyboard.press('z'); await pg.keyboard.up('Control');
  await t.sleep(2500);                                           // let BOTH (bugged) undos + refolds settle
  const undoEvidence = t.slog.filter(l => /^§OPLOG undo |^§HIST_UNDO /.test(l));
  const undosFired = t.slog.filter(l => /^§OPLOG undo /.test(l)).length - undosBefore;
  let wsUndo = null, weUndo = null, undoState = null;
  for (let i = 0; i < 60; i++) {
    undoState = await pg.evaluate(() => ({ x1: window.Bonsai.grid.xs[1], gmOps: window.Bonsai.oplog._geomOps().filter(o => o.op_type === 'GEOM_GRID_MOVE').length, active: window.Bonsai.oplog.length }));
    wsUndo = await bboxOf(fx.ws); weUndo = await bboxOf(fx.we);
    if (undoState.x1 === 2 && wsUndo && weUndo) break;
    await t.sleep(80);
  }
  const diag = await pg.evaluate(() => ({
    kids: window.Bonsai.group().children.filter(o => o.isMesh).map(o => o.userData && o.userData.featureId),
    cursor: window.Bonsai.oplog.cursor, len: window.Bonsai.oplog.length,
  }));
  console.log('§DM-GRIDUNDO ctrlZ undosFired=' + undosFired + ' state=' + JSON.stringify(undoState) + ' diag=' + JSON.stringify(diag));
  console.log('§DM-GRIDUNDO ctrlZ evidence:\n  ' + undoEvidence.join('\n  '));
  t.assert('U6 CTRLZ-SINGLE-STEP (⚠ KNOWN RED — regression found 2026-07-08: one Ctrl+Z fires TWO undos, wall 2 vanishes; ' +
    'dual listeners common/history_bar.js _wireKeyboard + modeller.html §3197 both call HB.undo)',
    undosFired === 1 && undoState.x1 === 2 && undoState.gmOps === 0 && !!wsUndo && !!weUndo &&
    wsBefore.every((v, i) => Math.abs(v - wsUndo[i]) < 1e-6) && weBefore.every((v, i) => Math.abs(v - weUndo[i]) < 1e-6),
    'undosFired=' + undosFired + ' ws→' + JSON.stringify(wsUndo) + ' we→' + JSON.stringify(weUndo));

  const snapProbe = await pg.evaluate((d) => ({
    base: window.Bonsai.grid.snap(2.05, 1.5).x,
    movedGone: window.Bonsai.grid.snap(2 + d + 0.05, 1.5).x,
  }), delta);
  console.log('§DM-GRIDUNDO snapProbe=' + JSON.stringify(snapProbe) + ' (moved line would have been ' + (2 + delta).toFixed(3) + ')');
  t.assert('U7 CHAIN + SNAP-TRUTH (chain verifies; snap targets the base line, the moved line is gone)',
    (await t.verifyChain()) === true && snapProbe.base === 2 && Math.abs(snapProbe.movedGone - (2 + delta)) > 0.04,
    JSON.stringify(snapProbe));
  await t.shot('02-undone');
});
