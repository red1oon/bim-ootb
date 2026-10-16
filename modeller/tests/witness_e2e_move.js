#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-MOVE: real-user, maths-asserted E2E of the MOVE tool (gizmo X-axis arrow).
 * Real path: open → click an element (select) → Move pill (transform gizmo) → drag the X-axis ARROW handle →
 * one signed GEOM_MOVE (X-only). Asserted by op-log + the measured bbox-centre displacement (rendered ==
 * committed) + framebuffer change + the real history-slider undo. Real pg.mouse on the real gizmo.
 *   A1 SELECT      — a real click selects an element.
 *   A2 GIZMO       — Move mode builds the gizmo with an X-axis arrow handle on the selection.
 *   A3 MOVE-COMMIT — dragging the X handle commits a GEOM_MOVE for the selection (dy==0, dz==0, |dx|>0.01);
 *                    if the selection HOSTS fillings (a door/window on this wall) their own GEOM_MOVE rides
 *                    along with the identical delta (§STRETCH-RIDE-style cascade, not a separate free op).
 *   A4 ATOMIC      — the moved mesh's bbox-centre displacement == the committed op delta within 1e-3m.
 *   A5 VISIBLE     — the framebuffer changed after the move (readPixels checksum differs).
 *   A6 REVERSIBLE  — undo via the real history slider restores the bbox-centre within 1e-3m, cursor −1.
 *
 * §F2-FRAMING (2026-08-07, guide-recapture card RESUME_MODELLER_GUIDE_SCREENSHOT_FIX.md): ported from a
 * standalone raw-puppeteer script to the shared e2e_harness (same rig as witness_e2e_rotate.js /
 * witness_e2e_scale.js) so `move-gizmo.png` gets the SAME t.frameElement+t.shotClip close-up treatment as
 * its Transform-section neighbors (gizmo.png / rotate-yaw.png / scale-stretched.png) instead of the old wide
 * whole-building shot (watchdog-flagged 2026-07-02 NIGHT as a composition regression, never fixed — the PR
 * #608 recapture batch that fixed the other Transform frames didn't include this one). All A1-A6 maths are
 * the same claims as the pre-port A1-A9 (old A1 OPEN-REAL / A9 NO-ERROR are now the harness's own built-in
 * checks, not separate assertions here).
 */
'use strict';
const { runE2E } = require('./e2e_harness');
runE2E('W-E2E-MOVE', async (t) => {
  await t.open('Duplex'); await t.shot('01-open');
  const sel = await t.pick({ prefer: 'wall', axisSafe: true, maxVol: 6 });   // §F2-FRAMING: element-scale subject; axisSafe rules out tilted inserts where local-X≠world-X; maxVol avoids the pathological-largest-mesh crash (see e2e_harness.js §F2-FRAMING notes, W-E2E-MOVE finding)
  t.assert('A1 SELECT (real click selects element)', !!sel, 'fid=' + (sel && sel.fid));
  if (!sel) return;
  const c0 = sel.centre;

  await t.clickSel('#b-move'); await t.sleep(500);
  const giz = await t.pg.evaluate(() => {
    const gz = window.A.scene.getObjectByName('MoveGizmo'); if (!gz) return null;
    let handle = null; gz.traverse(o => { if (o.userData && o.userData.moveAxis === 'x' && !handle) handle = o; });
    if (!handle) return null;
    const w = new window.THREE.Vector3(); handle.getWorldPosition(w);
    return { handle: [w.x, w.y, w.z], on: document.getElementById('b-move').classList.contains('on') };
  });
  t.assert('A2 GIZMO (X-axis handle present)', !!giz && giz.on === true, giz ? 'handle@' + giz.handle.map(n => n.toFixed(2)) : 'no gizmo/handle');
  if (!giz) return;

  const before = await t.oplog(); const pix0 = await t.pixsum();
  const DELTA = 1.0;
  // §AXIS-PATH (2026-08-07 finding): t.drag() interpolates LINEARLY IN SCREEN SPACE between down/up — under
  // perspective, the screen-space image of a straight WORLD-axis line is itself slightly curved, so that
  // shortcut walks the intermediate mouse positions a little off the true axis (measured: a run landed
  // dy=-0.095m, comfortably outside noise). Project each intermediate WORLD point on the axis individually
  // (same fix rotate.js/scale.js already apply to their ring/cube drags) so every frame of the gesture is a
  // real on-axis point, not a screen-space shortcut between two on-axis endpoints.
  const STEPS = 8, pts = [];
  for (let i = 0; i <= STEPS; i++) { const f = i / STEPS; pts.push(await t.proj(giz.handle[0] + DELTA * f, giz.handle[1], giz.handle[2])); }
  await t.pg.mouse.move(pts[0][0], pts[0][1]); await t.sleep(60);
  await t.pg.mouse.down(); await t.sleep(60);
  for (let i = 1; i < pts.length; i++) { await t.pg.mouse.move(pts[i][0], pts[i][1], { steps: 3 }); await t.sleep(30); }
  await t.sleep(60); await t.pg.mouse.up();
  await t.sleep(1500);   // full re-fold settle, same budget as witness_e2e_rotate.js/witness_e2e_scale.js

  const after = await t.oplog(); const last = await t.lastOp(); const pix1 = await t.pixsum();
  // §RIDE (2026-08-07 finding): moving a HOST wall cascades a GEOM_MOVE onto each hosted filling with the
  // identical delta (the guide's own caption: "a moved host drags its hosted fillings") — op-log +1 is only
  // true for a childless subject. Fetch every new op (not just the newest) so a hosted-fillings subject is
  // asserted correctly instead of failing on op-count.
  const newOps = await t.pg.evaluate(n => window.Bonsai.oplog._geomOps().slice(n), before.len);
  let c1 = await t.centre(sel.fid);
  for (let i = 0; i < 10 && !c1; i++) { await t.sleep(300); c1 = await t.centre(sel.fid); }   // re-fold may still be replacing meshes
  await t.frameElement(sel.fid, 0.35);   // §F2-FRAMING (spec G4): element close-up — was a wide whole-building shot
  await t.shot('02-moved');
  await t.shotClip('move-gizmo', sel.fid, 150);

  const selOp = newOps.find(o => o.parameters && o.parameters.parent === sel.fid);
  const selD = selOp && selOp.parameters ? [selOp.parameters.dx, selOp.parameters.dy, selOp.parameters.dz] : [0, 0, 0];
  const allMoveSameDelta = newOps.length > 0 && newOps.every(o => o.op_type === 'GEOM_MOVE' &&
    Math.abs(o.parameters.dx - selD[0]) < 1e-6 && Math.abs(o.parameters.dy - selD[1]) < 1e-6 && Math.abs(o.parameters.dz - selD[2]) < 1e-6);

  const dMove = c0 && c1 ? [c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]] : null;
  const atomicErr = dMove ? Math.hypot(dMove[0] - selD[0], dMove[1] - selD[1], dMove[2] - selD[2]) : Infinity;

  t.assert('A3 MOVE-COMMIT (GEOM_MOVE for selection [+ any hosted fillings riding the same delta], X-only)',
    after.len === before.len + newOps.length && !!selOp && allMoveSameDelta &&
    Math.abs(selD[0]) > 0.01 && Math.abs(selD[1]) < 1e-6 && Math.abs(selD[2]) < 1e-6,
    'len ' + before.len + '→' + after.len + ' newOps=' + newOps.length + ' selDelta=' + JSON.stringify(selD));
  t.assert('A4 ATOMIC (rendered centre delta == committed delta)', atomicErr < 1e-3, 'atomicErr=' + atomicErr.toExponential(2) + 'm');
  t.assert('A5 VISIBLE (framebuffer changed)', pix0 !== pix1, 'pix ' + pix0 + '→' + pix1);

  await t.undoToCursor(before.cur);
  const undo = await t.oplog(); const c2 = await t.centre(sel.fid);
  await t.shot('03-undone');
  const residual = c0 && c2 ? Math.hypot(c2[0] - c0[0], c2[1] - c0[1], c2[2] - c0[2]) : Infinity;
  t.assert('A6 REVERSIBLE (undo restores centre + cursor)', undo.cur === before.cur && residual < 1e-3,
    'cursor ' + after.cur + '→' + undo.cur + ' (want ' + before.cur + ') residual=' + residual.toExponential(2) + 'm');
}, { width: 1200, height: 850, dpr: 2 });
