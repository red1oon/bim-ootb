#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-DELETE: real-user, maths-asserted E2E of the DELETE tool (soft-delete a feature).
 * Real path: open → click an element (select) → Delete pill → the feature (and any children) soft-delete from the
 * signed log (undone=1, never rewritten) → its mesh leaves the scene. Real-user reverse = Redo (Ctrl+Y). Asserted by
 * the active op-count + scene census (rendered == committed) + verifyChain (the chain stays valid; undone is not
 * signed) + the slider/redo. Real pg.mouse + real toolbar + real keyboard.
 *   D1 SELECT      — a real click selects a feature.
 *   D2 DELETE      — Delete pill drops the active op-count by 1 and removes the feature's mesh.
 *   D3 CHAIN-OK    — verifyChain still passes (soft-delete doesn't touch the signed payload).
 *   D4 REVERSIBLE  — Redo (Ctrl+Y) restores the active count AND the mesh.
 */
'use strict';
const { runE2E } = require('./e2e_harness');
runE2E('W-E2E-DELETE', async (t) => {
  await t.open('Duplex'); await t.shot('01-open');
  const sel = await t.pick({ prefer: 'wall' });   // guide frame: a wall (may carry a window), not whatever solid the scan hits first
  t.assert('D1 SELECT (real click selects a feature)', !!sel, 'fid=' + (sel && sel.fid));
  if (!sel) return;
  const fidPred = new Function('o', 'return o.featureId === ' + sel.fid);
  const before = await t.oplog(); const present = await t.census(fidPred);
  t.assert('D1b PRESENT (the feature mesh is in the scene)', present.n === 1, 'meshes fid=' + sel.fid + ' → ' + present.n);
  await t.shot('02-selected');

  await t.clickSel('#b-del'); await t.sleep(900);
  const after = await t.oplog(); const gone = await t.census(fidPred); const chain = await t.verifyChain();
  await t.shot('03-deleted');
  await t.clickSel('#b-fit'); await t.sleep(600);   // guide frame: whole building, not the zoomed-to-selection pick frame
  await t.shot('delete-gone-raw');
  t.assert('D2 DELETE (active count −1 AND mesh removed)', after.len === before.len - 1 && gone.n === 0, 'len ' + before.len + '→' + after.len + ' meshFid' + sel.fid + '=' + gone.n);
  t.assert('D3 CHAIN-OK (verifyChain — soft-delete, payload untouched)', chain === true, 'verifyChain=' + chain);

  // Real-user reverse: Redo (Ctrl+Y) reactivates the most-recent undone feature.
  await t.pg.keyboard.down('Control'); await t.pg.keyboard.press('y'); await t.pg.keyboard.up('Control'); await t.sleep(900);
  const redo = await t.oplog(); const back = await t.census(fidPred);
  await t.shot('04-redone');
  t.assert('D4 REVERSIBLE (Redo restores active count + mesh)', redo.len === before.len && back.n === 1, 'len ' + after.len + '→' + redo.len + ' (want ' + before.len + ') meshFid' + sel.fid + '=' + back.n);
}, { width: 1200, height: 850, dpr: 2 });
