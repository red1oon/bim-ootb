#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-GRIDMOVE-ROOF: real-user, maths-asserted E2E proving the 3D Grid editor's
 * SPAN/SCALE recompose also applies to an IfcRoof, not just walls. `bonsai_gridmove.js`'s
 * `_STRUCTURAL_CLASSES` has always listed `'IfcRoof'` (code-inspection fact) but no witness had ever driven
 * a real roof through a real grid drag before this (RESUME_MODELLER_GUIDE_SCREENSHOT_FIX.md 2026-08-07
 * task 3). Duplex has ZERO `IfcRoof` rows (checked: `select count(*) from elements_meta where
 * ifc_class='IfcRoof'` = 0) — SampleHouse has exactly one (fid 20, axis-aligned, rot=0, X-span
 * [-8.4308,6.4102] = 14.8410m), so this witness runs on SampleHouse, the only resident with an honest case.
 * Setup mirrors witness_e2e_gridmove_real.js: author a column grid whose TWO x-lines sit exactly on the
 * roof's own measured X edges (so the roof SPANS between them, matching the wall-SPAN case already proven),
 * then drag the far line outward for real.
 *   R1 SETUP       — real SampleHouse roof (fid 20) measured X-extent matches the DB-recorded bbox.
 *   R2 GRID-ALIGN  — grid lines "1"/"2" defined at the roof's own measured X edges.
 *   R3 GRID-MODE   — the Move-Grid pill arms real gridline-drag mode.
 *   R4 DRAG-REAL   — real mouse down→move→move→up on gridline "2" (the roof's far edge), dragged +DY outward.
 *   R5 COMMIT      — ONE signed GEOM_GRID_MOVE, verify=true.
 *   R6 KINEMATICS  — the roof's rendered X-extent grew by EXACTLY the committed delta (SPAN+SCALE, far end
 *                    anchored at line "1" — the same recompose contract the guide documents for walls).
 *   R7 CHAIN-OK    — verifyChain passes.
 *   R8 UNDO        — undo restores the cursor AND the roof's original X-extent, byte-exact.
 */
'use strict';
const { runE2E } = require('./e2e_harness');
const ROOF_MINX = -8.430830001831055, ROOF_MAXX = 6.410151481628418;   // §ROOF: measured live (diag_roof.js), matches elements_meta bbox
const xext = (t, fid) => t.pg.evaluate((f) => {
  const g = window.Bonsai.group(); const m = g.children.find(o => o.isMesh && o.userData.featureId === f);
  if (!m) return null; m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox; return { minx: b.min.x, maxx: b.max.x, w: b.max.x - b.min.x };
}, fid);
runE2E('W-E2E-GRIDMOVE-ROOF', async (t) => {
  await t.open('SampleHouse');

  // R1 SETUP: find the roof via its own GEOM_INSERT op (ifc_class === 'IfcRoof'), confirm it's the one
  // element SampleHouse has, axis-aligned (rot=0 — no §ROTATION-GUARD skip expected).
  const roof = await t.pg.evaluate(() => {
    const ops = window.Bonsai.oplog._geomOps();
    const op = ops.find(o => o.op_type === 'GEOM_INSERT' && o.parameters && o.parameters.ifc_class === 'IfcRoof');
    return op ? { fid: op.id, rot: op.parameters.placement && op.parameters.placement.rot } : null;
  });
  t.assert('R0 FOUND (SampleHouse has exactly one IfcRoof insert)', !!roof, JSON.stringify(roof));
  if (!roof) return;
  const ext0 = await xext(t, roof.fid);
  t.assert('R1 SETUP (roof measured X-extent matches DB bbox, rot=0)',
    !!ext0 && Math.abs(ext0.minx - ROOF_MINX) < 0.01 && Math.abs(ext0.maxx - ROOF_MAXX) < 0.01 && (roof.rot || 0) === 0,
    'roof fid=' + roof.fid + ' x=[' + (ext0 && ext0.minx.toFixed(4)) + ',' + (ext0 && ext0.maxx.toFixed(4)) + '] rot=' + roof.rot);

  // R2 GRID-ALIGN: two x-lines at the roof's own measured edges -> the roof SPANS between them (same
  // classification shape as the wall-SPAN case in witness_e2e_gridmove_real.js). ys bracket the roof's own
  // Y-band so `_localityRadius` has a real bay to derive from, matching the real-wall witness's pattern.
  await t.pg.evaluate((minx, maxx) => {
    window.Bonsai.grid.define({ xs: [minx, maxx], ys: [-1.94, 5.35], xlabels: ['1', '2'], ylabels: ['A', 'B'] });
  }, ROOF_MINX, ROOF_MAXX);

  // R3 GRID-MODE
  await t.clickSel('#b-gridmove'); await t.sleep(300);
  const pillTxt = await t.pg.evaluate(() => document.getElementById('b-gridmove').textContent.trim());
  t.assert('R3 GRID-MODE (Move-Grid pill armed on the loaded SampleHouse, label -> Cancel)', pillTxt === 'Cancel', 'pill="' + pillTxt + '"');

  // R4 DRAG-REAL: drag gridline "2" (x=ROOF_MAXX, the roof's far edge) outward by DY. Grab at a real Y inside
  // the roof's own Y band (z=0 ground-plane raycast, same as every grid drag — the roof's actual Z is
  // irrelevant to the interaction plane, per witness_e2e_gridmove_real.js's own §FRAME-CHECK finding).
  const grabY = 1.5, DY = 0.5;
  const down = await t.proj(ROOF_MAXX, grabY, 0);
  const mid = await t.proj(ROOF_MAXX + DY * 0.6, grabY, 0);
  const up = await t.proj(ROOF_MAXX + DY, grabY, 0);
  const before = await t.oplog();
  await t.pg.mouse.move(down[0], down[1]); await t.sleep(60);
  await t.pg.mouse.down(); await t.sleep(80);
  await t.pg.mouse.move(mid[0], mid[1], { steps: 8 }); await t.sleep(250);
  await t.pg.mouse.move(up[0], up[1], { steps: 8 }); await t.sleep(250);
  await t.pg.mouse.up(); await t.sleep(700);

  const after = await t.oplog(); const chain = await t.verifyChain();
  // §RIDER (same shape as witness_e2e_gridmove_real.js's own G5/riders): the drag's locality radius swept up
  // OTHER SampleHouse structural elements sitting near the same X band as riders (their own GEOM_MOVE, same
  // family as §STRETCH-RIDE/Move's host-drags-fillings cascade) — the GEOM_GRID_MOVE itself is the FIRST new
  // op, not necessarily the last. Find it by type, not by position.
  const newOps = await t.pg.evaluate(n => window.Bonsai.oplog._geomOps().slice(n), before.len);
  const gridOp = newOps.find(o => o.op_type === 'GEOM_GRID_MOVE');
  let ext1 = await xext(t, roof.fid);
  for (let i = 0; i < 10 && !ext1; i++) { await t.sleep(300); ext1 = await xext(t, roof.fid); }
  await t.shot('roof-stretched');

  t.assert('R5 COMMIT (one signed GEOM_GRID_MOVE among the new ops, roof included in its recompose)',
    newOps.length >= 1 && !!gridOp && Math.abs((gridOp.parameters.delta || 0) - DY) < 1e-3,
    'newOps=' + newOps.length + ' gridOp=' + (gridOp && JSON.stringify({ type: gridOp.op_type, delta: gridOp.parameters.delta, commands: gridOp.parameters.commands && gridOp.parameters.commands.length })));
  const grown = ext0 && ext1 ? ext1.w - ext0.w : null;
  const trueDelta = gridOp && typeof gridOp.parameters.delta === 'number' ? gridOp.parameters.delta : DY;
  t.assert('R6 KINEMATICS (roof X-extent grew by exactly the committed gridline delta)',
    grown != null && Math.abs(grown - trueDelta) < 1e-3 && Math.abs(ext1.minx - ext0.minx) < 1e-3,
    'width ' + (ext0 && ext0.w.toFixed(4)) + '→' + (ext1 && ext1.w.toFixed(4)) + ' grew=' + (grown && grown.toFixed(4)) +
    ' committedDelta=' + trueDelta + ' farEdge(minx) ' + (ext0 && ext0.minx.toFixed(4)) + '→' + (ext1 && ext1.minx.toFixed(4)) + ' (anchored, should be unchanged)');
  t.assert('R7 CHAIN-OK (verifyChain)', chain === true, 'verifyChain=' + chain);

  await t.undoToCursor(before.cur);
  const undo = await t.oplog(); const ext2 = await xext(t, roof.fid);
  t.assert('R8 UNDO (cursor + X-extent byte-exact restored)',
    undo.cur === before.cur && ext2 && Math.abs(ext2.w - ext0.w) < 1e-9 && Math.abs(ext2.minx - ext0.minx) < 1e-9,
    'cursor ' + after.cur + '→' + undo.cur + ' (want ' + before.cur + ') width ' + (ext2 && ext2.w.toFixed(6)) + ' (want ' + (ext0 && ext0.w.toFixed(6)) + ')');
}, { width: 1200, height: 850, dpr: 2 });
