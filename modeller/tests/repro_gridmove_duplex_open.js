#!/usr/bin/env node
// SCRATCH repro (not a permanent witness) -- reproduces the GUIDE_VISUAL_QUALITY.md observation: leaving
// Duplex OPEN (not #b-cleared) under a synthetic grid+wall, then dragging a gridline, allegedly commits a
// stray GEOM_MOVE instead of GEOM_GRID_MOVE. Mirrors witness_e2e_gridstretch.js's own proven X1-X6 setup,
// MINUS the #b-clear step, to isolate whether that's really the cause.
'use strict';
const { runE2E } = require('./e2e_harness');
runE2E('REPRO-GRIDMOVE-DUPLEX-OPEN', async (t) => {
  await t.open('Duplex'); await t.shot('01-open-not-cleared');

  // SAME setup as witness_e2e_gridstretch.js X1, but DELIBERATELY SKIP #b-clear.
  const wallId = await t.pg.evaluate(async () => {
    window.Bonsai.grid.define({ xs: [0, 4, 8], ys: [0, 3], xlabels: ['A', 'B', 'C'], ylabels: ['1', '2'] });
    const O = window.Bonsai.oplog;
    const wall = await O.commit({ op_type: 'GEOM_EXTRUDE_POLY', parameters: { profile: { points: [[0, 0], [4, 0], [4, 0.2], [0, 0.2]] }, depth: 3 } }, { color: 0x9fb4c8 });
    if (typeof syncHistory === 'function') syncHistory();
    return wall.id;
  });
  console.log('wallId=' + wallId);
  await t.clickSel('#b-fit'); await t.sleep(500);
  await t.shot('02-setup-duplex-visible');

  const gridMovingBefore = await t.pg.evaluate(() => typeof gridMoving !== 'undefined' ? gridMoving : 'undefined');
  console.log('gridMoving BEFORE click=' + gridMovingBefore);

  await t.clickSel('#b-gridmove'); await t.sleep(400);
  const gridMovingAfter = await t.pg.evaluate(() => typeof gridMoving !== 'undefined' ? gridMoving : 'undefined');
  console.log('gridMoving AFTER click=' + gridMovingAfter);
  const dragGridState = await t.pg.evaluate(() => typeof _dragGrid !== 'undefined' ? JSON.stringify(_dragGrid) : 'undefined');
  console.log('_dragGrid AFTER click (should be null pre-drag)=' + dragGridState);
  await t.shot('03-gridmode-armed');

  const before = await t.oplog();
  const DX = 1.5;
  const down = await t.proj(4, 1.5, 0);
  const up = await t.proj(4 + DX, 1.5, 0);
  console.log('drag down px=' + JSON.stringify(down) + ' up px=' + JSON.stringify(up));
  await t.drag(down, up, 12);
  await t.sleep(900);
  const after = await t.oplog();
  const last = await t.lastOp();
  console.log('oplog ' + before.len + ' -> ' + after.len + ', last op_type=' + (last && last.op_type));
  console.log(JSON.stringify(last, null, 2));
  await t.shot('04-after-drag');

  const gridMovingFinal = await t.pg.evaluate(() => typeof gridMoving !== 'undefined' ? gridMoving : 'undefined');
  console.log('gridMoving FINAL (post-drag)=' + gridMovingFinal);

  t.assert('REPRO check', true, 'see console output above for the actual op_type');
}, { width: 1200, height: 850, dpr: 2 });
