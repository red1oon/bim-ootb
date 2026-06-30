#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-SCALE: real-user, maths-asserted E2E of the SCALE tool (gizmo cube handle).
 * Real path: open → click an element (select) → Move pill (transform gizmo) → drag the +X scale CUBE outward → one
 * signed GEOM_SCALE (edge-anchored non-uniform stretch, host-side PATH B for an insert). Asserted by op-log + the
 * measured bbox X-extent (rendered == committed) + verifyChain + the history slider. Real pg.mouse on the real gizmo.
 *   S1 SELECT      — a real click selects an insert.
 *   S2 GIZMO       — Move mode builds the gizmo with a scaleX cube handle on the single insert.
 *   S3 SCALE-COMMIT— dragging the cube commits one GEOM_SCALE with fx>1 (the dragged axis ≠ 1).
 *   S4 CHAIN-OK    — verifyChain passes.
 *   S5 ATOMIC      — the rendered X-extent grew by ≈ fx (rendered geometry == the committed factor).
 *   S6 REVERSIBLE  — undo restores the cursor AND the original X-extent.
 */
'use strict';
const { runE2E } = require('./e2e_harness');
const xext = (t, fid) => t.pg.evaluate((f) => {
  const g = window.Bonsai.group(); const m = g.children.find(o => o.isMesh && o.userData.featureId === f);
  if (!m) return null; m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox; return b.max.x - b.min.x;
}, fid);
runE2E('W-E2E-SCALE', async (t) => {
  await t.open('Duplex'); await t.shot('01-open');
  const sel = await t.pick();
  t.assert('S1 SELECT (insert selected)', !!sel, 'fid=' + (sel && sel.fid));
  if (!sel) return;
  const ext0 = await xext(t, sel.fid);

  await t.clickSel('#b-move'); await t.sleep(500);              // enter Move mode → gizmo built on the selection
  const giz = await t.pg.evaluate(() => {
    const gz = window.A.scene.getObjectByName('MoveGizmo'); if (!gz) return null;
    let cube = null; gz.traverse(o => { if (o.userData && o.userData.moveAxis === 'scaleX') cube = o; });
    if (!cube) return null;
    const w = new window.THREE.Vector3(); cube.getWorldPosition(w);
    const c = new window.THREE.Vector3(); gz.getWorldPosition(c);
    return { cube: [w.x, w.y, w.z], centre: [c.x, c.y, c.z] };
  });
  t.assert('S2 GIZMO (scaleX cube handle present)', !!giz, giz ? 'cube@' + giz.cube.map(n => n.toFixed(2)) : 'no gizmo/cube');
  if (!giz) return;
  await t.shot('02-gizmo');

  // Drag the cube outward +X by ~0.6·ext (f≈1.5 after 0.25-snap). down = cube px; up = (cube + Δx) px.
  const dxWorld = Math.max(0.6, 0.6 * ext0);
  const down = await t.proj(giz.cube[0], giz.cube[1], giz.cube[2]);
  const up = await t.proj(giz.cube[0] + dxWorld, giz.cube[1], giz.cube[2]);
  const before = await t.oplog();
  await t.drag(down, up, 10);                                   // real mouse down→move→up on the cube
  await t.sleep(1500);                                          // full-chain re-fold (253 ops) settles
  const after = await t.oplog(); const last = await t.lastOp(); const chain = await t.verifyChain();
  let ext1 = await xext(t, sel.fid);
  for (let i = 0; i < 10 && !ext1; i++) { await t.sleep(300); ext1 = await xext(t, sel.fid); }   // re-fold may still be replacing meshes
  await t.shot('03-scaled');

  t.assert('S3 SCALE-COMMIT (one GEOM_SCALE, fx>1)',
    after.len === before.len + 1 && last && last.op_type === 'GEOM_SCALE' && last.parameters && last.parameters.fx > 1.0001,
    'len ' + before.len + '→' + after.len + ' op=' + (last && last.op_type) + ' fx=' + (last && last.parameters && last.parameters.fx));
  t.assert('S4 CHAIN-OK (verifyChain)', chain === true, 'verifyChain=' + chain);
  const fx = last && last.parameters && last.parameters.fx;
  const grew = ext0 && ext1 && Math.abs(ext1 / ext0 - fx) < 0.02;
  t.assert('S5 ATOMIC (rendered X-extent grew by ≈ fx)', grew, 'ext ' + (ext0 || 0).toFixed(3) + '→' + (ext1 || 0).toFixed(3) + ' ratio=' + (ext0 ? (ext1 / ext0).toFixed(3) : '?') + ' fx=' + fx);

  await t.undoToCursor(before.cur);
  const undo = await t.oplog(); const ext2 = await xext(t, sel.fid);
  await t.shot('04-undone');
  t.assert('S6 REVERSIBLE (undo restores cursor + X-extent)',
    undo.cur === before.cur && ext2 && Math.abs(ext2 - ext0) < 1e-3,
    'cursor ' + after.cur + '→' + undo.cur + ' (want ' + before.cur + ') ext ' + (ext2 || 0).toFixed(3) + ' (want ' + (ext0 || 0).toFixed(3) + ')');
});
