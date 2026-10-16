#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-DELETE: real-user, maths-asserted E2E of the DELETE tool (soft-delete a feature).
 * Real path: open → click an element (select) → Delete pill → the feature (and any children) soft-delete from the
 * signed log (undone=1, never rewritten) → its mesh leaves the scene. Asserted by the active op-count + scene
 * census (rendered == committed) + verifyChain (the chain stays valid; undone is not signed) + the real keyboard.
 * Real pg.mouse + real toolbar + real keyboard.
 *   D1 SELECT      — a real click selects a feature.
 *   D2 DELETE      — Delete pill drops the active op-count by 1 and removes the feature's mesh.
 *   D3 CHAIN-OK    — verifyChain still passes (soft-delete doesn't touch the signed payload).
 *   D4 TIP-REDO    — §MHIST-ROWS (modeller_history.js): delete is now a real git-faithful tree node, and the
 *                    delete node IS the tip — nothing was pushed after it, so Ctrl+Y (redo) right after the
 *                    delete is a tree no-op: state unchanged. (Superseded 2026-09-10: before §MHIST-ROWS,
 *                    deleteFeature() was OFF the tree entirely — Ctrl+Y "worked" only by the flat-oplog accident
 *                    that redo()'s lowest-undone-id pick happened to match the just-deleted row.)
 *   D5 REVERSIBLE  — real-user reverse is Undo (Ctrl+Z), same gesture as any other edit — restores the active
 *                    count AND the mesh.
 *   D6 RE-DELETE   — a further Ctrl+Y re-applies the delete (symmetric, same tree node both ways).
 */
'use strict';
const { runE2E } = require('./e2e_harness');
runE2E('W-E2E-DELETE', async (t) => {
  await t.open('Duplex'); await t.shot('01-open');
  const sel = await t.pick();
  t.assert('D1 SELECT (real click selects a feature)', !!sel, 'fid=' + (sel && sel.fid));
  if (!sel) return;
  const fidPred = new Function('o', 'return o.featureId === ' + sel.fid);
  const before = await t.oplog(); const present = await t.census(fidPred);
  t.assert('D1b PRESENT (the feature mesh is in the scene)', present.n === 1, 'meshes fid=' + sel.fid + ' → ' + present.n);
  await t.shot('02-selected');

  await t.clickSel('#b-del'); await t.sleep(900);
  const after = await t.oplog(); const gone = await t.census(fidPred); const chain = await t.verifyChain();
  await t.shot('03-deleted');
  await t.shot('delete-gone-raw');
  t.assert('D2 DELETE (active count −1 AND mesh removed)', after.len === before.len - 1 && gone.n === 0, 'len ' + before.len + '→' + after.len + ' meshFid' + sel.fid + '=' + gone.n);
  t.assert('D3 CHAIN-OK (verifyChain — soft-delete, payload untouched)', chain === true, 'verifyChain=' + chain);

  const key = async (k) => { await t.pg.keyboard.down('Control'); await t.pg.keyboard.press(k); await t.pg.keyboard.up('Control'); await t.sleep(900); };

  // The delete node IS the tip — Ctrl+Y (redo) has nothing ahead of it → tree no-op, state unchanged.
  await key('y');
  const tip = await t.oplog(); const tipStill = await t.census(fidPred);
  t.assert('D4 TIP-REDO (Ctrl+Y at the tip is a no-op — state unchanged)', tip.len === after.len && tipStill.n === gone.n, 'len ' + after.len + '→' + tip.len + ' meshFid' + sel.fid + '=' + tipStill.n);

  // §MHIST-ROWS real-user reverse: Undo (Ctrl+Z) restores the deleted feature (delete is a real tree node now).
  await key('z');
  const undo = await t.oplog(); const back = await t.census(fidPred);
  await t.shot('04-undone');
  t.assert('D5 REVERSIBLE (Undo restores active count + mesh)', undo.len === before.len && back.n === 1, 'len ' + tip.len + '→' + undo.len + ' (want ' + before.len + ') meshFid' + sel.fid + '=' + back.n);

  // Ctrl+Y again re-applies the delete — same tree node, symmetric both ways.
  await key('y');
  const redo2 = await t.oplog(); const redo2Back = await t.census(fidPred);
  await t.shot('05-redone');
  t.assert('D6 RE-DELETE (Ctrl+Y re-applies the delete — symmetric)', redo2.len === before.len - 1 && redo2Back.n === 0, 'len ' + undo.len + '→' + redo2.len + ' (want ' + (before.len - 1) + ') meshFid' + sel.fid + '=' + redo2Back.n);
}, { width: 1200, height: 850, dpr: 2 });
