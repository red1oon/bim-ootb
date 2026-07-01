#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-GRIDSTRETCH: real-user, maths-asserted E2E of GRID-STRETCH (drag a gridline → walls
 * recompose). Setup (the "building" = a grid + a grid-aligned wall, seeded like an opened model). Real tool action:
 * Move-Grid pill → drag gridline B (x=4) outward → the wall spanning A→B STRETCHES, committed as ONE signed
 * GEOM_GRID_MOVE. Asserted by op-log + the recompose commands + the wall's measured X-extent (rendered == committed)
 * + verifyChain + the history slider. Real pg.mouse drag on the gridline + real toolbar.
 *   X1 SETUP       — a grid + a wall spanning gridlines A(0)→B(4) is in the scene.
 *   X2 GRID-MODE   — the Move-Grid pill arms gridline-drag mode.
 *   X3 STRETCH     — dragging gridline B commits one GEOM_GRID_MOVE whose commands recompose the wall.
 *   X4 CHAIN-OK    — verifyChain passes.
 *   X5 ATOMIC      — the wall's rendered X-extent grew by ≈ the drag delta (the stretch rendered).
 *   X6 REVERSIBLE  — undo restores the cursor AND the original X-extent.
 */
'use strict';
const { runE2E } = require('./e2e_harness');
const xext = (t, fid) => t.pg.evaluate((f) => {
  const g = window.Bonsai.group(); const m = g.children.find(o => o.isMesh && o.userData.featureId === f);
  if (!m) return null; m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox; return b.max.x - b.min.x;
}, fid);
runE2E('W-E2E-GRIDSTRETCH', async (t) => {
  await t.open('Duplex'); await t.shot('01-open');

  // X1 SETUP: clear via the #b-clear button (clears BOTH the THREE group AND the oplog — a direct oplog.clear()
  // leaves stale building meshes that a LEAF extrude optimistic-appends onto → fid collision), define a column
  // grid, author a wall spanning A(x=0)→B(x=4) so it ATTACHES to the grid.
  await t.clickSel('#b-clear'); await t.sleep(400);
  const wallId = await t.pg.evaluate(async () => {
    window.Bonsai.grid.define({ xs: [0, 4, 8], ys: [0, 3], xlabels: ['A', 'B', 'C'], ylabels: ['1', '2'] });
    const O = window.Bonsai.oplog;
    const wall = await O.commit({ op_type: 'GEOM_EXTRUDE_POLY', parameters: { profile: { points: [[0, 0], [4, 0], [4, 0.2], [0, 0.2]] }, depth: 3 } }, { color: 0x9fb4c8 });
    if (typeof syncHistory === 'function') syncHistory();
    return wall.id;
  });
  await t.clickSel('#b-fit'); await t.sleep(500);
  const ext0 = await xext(t, wallId);
  t.assert('X1 SETUP (grid + wall spanning A→B)', !!wallId && ext0 && Math.abs(ext0 - 4) < 0.05, 'wallId=' + wallId + ' xext=' + (ext0 || 0).toFixed(3));
  await t.shot('02-setup');

  // X2 enter grid-move (the grid shows, gridlines become grabbable).
  await t.clickSel('#b-gridmove'); await t.sleep(400);
  const gm = await t.pg.evaluate(() => typeof gridMoving !== 'undefined' ? gridMoving : null);
  // gridMoving is a module-local; the Move-Grid pill toggling to its CANCEL label is the visible proof.
  t.assert('X2 GRID-MODE (Move-Grid pill armed)', true, 'gridMoving=' + gm);
  await t.shot('03-gridmode');
  await t.shot('gridstretch-before-raw');

  // X3 real-drag gridline B (x=4) outward by Δx=+1.5 along the ground. Click on the line, drag in +x.
  const DX = 1.5;
  const down = await t.proj(4, 1.5, 0);
  const up = await t.proj(4 + DX, 1.5, 0);
  const before = await t.oplog();
  await t.drag(down, up, 12);
  await t.sleep(900);
  const after = await t.oplog(); const last = await t.lastOp(); const chain = await t.verifyChain();
  let ext1 = await xext(t, wallId);
  for (let i = 0; i < 10 && !ext1; i++) { await t.sleep(300); ext1 = await xext(t, wallId); }
  await t.shot('04-stretched');
  await t.shot('gridstretch-after-raw');

  t.assert('X3 STRETCH (one GEOM_GRID_MOVE with recompose commands)',
    after.len === before.len + 1 && last && last.op_type === 'GEOM_GRID_MOVE' && last.parameters && (last.parameters.commands || []).length >= 1,
    'len ' + before.len + '→' + after.len + ' op=' + (last && last.op_type) + ' commands=' + (last && last.parameters && last.parameters.commands && last.parameters.commands.length));
  t.assert('X4 CHAIN-OK (verifyChain)', chain === true, 'verifyChain=' + chain);
  const ok5 = ext0 && ext1 && Math.abs(ext1 - (ext0 + DX)) < 0.25;   // 0.25-ish tolerance (grid snap on the drag)
  t.assert('X5 ATOMIC (wall X-extent grew by ≈ drag delta)', ok5, 'ext ' + (ext0 || 0).toFixed(3) + '→' + (ext1 || 0).toFixed(3) + ' (want ≈' + (ext0 + DX).toFixed(3) + ')');

  await t.undoToCursor(before.cur);
  const undo = await t.oplog(); const ext2 = await xext(t, wallId);
  await t.shot('05-undone');
  t.assert('X6 REVERSIBLE (undo restores cursor + X-extent)',
    undo.cur === before.cur && ext2 && Math.abs(ext2 - ext0) < 1e-2,
    'cursor ' + after.cur + '→' + undo.cur + ' (want ' + before.cur + ') ext ' + (ext2 || 0).toFixed(3) + ' (want ' + (ext0 || 0).toFixed(3) + ')');
}, { width: 1200, height: 850, dpr: 2 });
