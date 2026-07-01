#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-ROTATE: real-user, maths-asserted E2E of the ROTATE tool (gizmo yaw ring).
 * Real path: open → click an element (select) → Move pill (transform gizmo) → drag the yellow yaw RING 30° → one
 * signed GEOM_ROTATE. Asserted by op-log + the rotated box's world-AABB extent (rendered == committed: a θ yaw of a
 * box turns its X-extent into ex·cosθ + ey·sinθ) + verifyChain + the history slider. Real pg.mouse on the real ring.
 *   R1 SELECT      — a real click selects an insert.
 *   R2 GIZMO       — Move mode builds the gizmo with a rotZ yaw ring.
 *   R3 ROT-COMMIT  — dragging the ring 30° commits one GEOM_ROTATE with drot ≈ 30 (15°-snapped).
 *   R4 CHAIN-OK    — verifyChain passes.
 *   R5 ATOMIC      — the rendered footprint AABB matches a 30° yaw (X-extent == ex·cos30 + ey·sin30).
 *   R6 REVERSIBLE  — undo restores the cursor AND the original footprint.
 */
'use strict';
const { runE2E } = require('./e2e_harness');
const aabb = (t, fid) => t.pg.evaluate((f) => {
  const g = window.Bonsai.group(); const m = g.children.find(o => o.isMesh && o.userData.featureId === f);
  if (!m) return null; m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox;
  return { ex: b.max.x - b.min.x, ey: b.max.y - b.min.y };
}, fid);
runE2E('W-E2E-ROTATE', async (t) => {
  await t.open('Duplex'); await t.shot('01-open');
  const sel = await t.pick();
  t.assert('R1 SELECT (insert selected)', !!sel, 'fid=' + (sel && sel.fid));
  if (!sel) return;
  const b0 = await aabb(t, sel.fid);

  await t.clickSel('#b-move'); await t.sleep(500);
  const giz = await t.pg.evaluate(() => {
    const gz = window.A.scene.getObjectByName('MoveGizmo'); if (!gz) return null;
    let ring = null; gz.traverse(o => { if (o.userData && o.userData.moveAxis === 'rotZ') ring = o; });
    if (!ring) return null;
    const c = new window.THREE.Vector3(); gz.getWorldPosition(c);
    const R = (ring.geometry && ring.geometry.parameters && ring.geometry.parameters.radius) || 0.9;
    return { centre: [c.x, c.y, c.z], R };
  });
  t.assert('R2 GIZMO (yaw ring present)', !!giz, giz ? 'R=' + giz.R.toFixed(2) : 'no ring');
  if (!giz) return;
  await t.shot('02-gizmo');
  await t.shotClip('gizmo', sel.fid, 200);

  // Drag the ring from angle 0° to 30° about the centre (on the horizontal plane through c0). 15°-snap → 30°.
  const th = 30 * Math.PI / 180, R = giz.R, c = giz.centre;
  const down = await t.proj(c[0] + R, c[1], c[2]);
  const up = await t.proj(c[0] + R * Math.cos(th), c[1] + R * Math.sin(th), c[2]);
  const before = await t.oplog();
  await t.drag(down, up, 12);
  await t.sleep(1500);
  const after = await t.oplog(); const last = await t.lastOp(); const chain = await t.verifyChain();
  let b1 = await aabb(t, sel.fid);
  for (let i = 0; i < 10 && !b1; i++) { await t.sleep(300); b1 = await aabb(t, sel.fid); }
  await t.shot('03-rotated');
  await t.shotClip('rotate-yaw', sel.fid, 100);

  t.assert('R3 ROT-COMMIT (one GEOM_ROTATE, drot≈30)',
    after.len === before.len + 1 && last && last.op_type === 'GEOM_ROTATE' && last.parameters && Math.abs(Math.abs(last.parameters.drot) - 30) < 0.6,
    'len ' + before.len + '→' + after.len + ' op=' + (last && last.op_type) + ' drot=' + (last && last.parameters && last.parameters.drot));
  t.assert('R4 CHAIN-OK (verifyChain)', chain === true, 'verifyChain=' + chain);
  const deg = Math.abs(last && last.parameters ? last.parameters.drot : 0) * Math.PI / 180;
  const wantEx = b0 ? b0.ex * Math.cos(deg) + b0.ey * Math.sin(deg) : null;
  const ok5 = b0 && b1 && wantEx && Math.abs(b1.ex - wantEx) < 0.03;
  t.assert('R5 ATOMIC (footprint AABB matches the yaw)', ok5,
    'ex ' + (b0 ? b0.ex.toFixed(3) : '?') + '→' + (b1 ? b1.ex.toFixed(3) : '?') + ' want=' + (wantEx ? wantEx.toFixed(3) : '?'));

  await t.undoToCursor(before.cur);
  const undo = await t.oplog(); const b2 = await aabb(t, sel.fid);
  await t.shot('04-undone');
  t.assert('R6 REVERSIBLE (undo restores cursor + footprint)',
    undo.cur === before.cur && b2 && b0 && Math.abs(b2.ex - b0.ex) < 1e-3 && Math.abs(b2.ey - b0.ey) < 1e-3,
    'cursor ' + after.cur + '→' + undo.cur + ' (want ' + before.cur + ') ex ' + (b2 ? b2.ex.toFixed(3) : '?') + ' (want ' + (b0 ? b0.ex.toFixed(3) : '?') + ')');
}, { width: 1200, height: 850, dpr: 2 });
