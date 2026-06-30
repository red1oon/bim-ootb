#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-CUT: real-user, maths-asserted E2E of the CUT (opening) tool.
 * Real path: open → click an element to select it → click the Cut pill → a GEOM_CUT void is committed into the
 * signed op-log as a child of the selection. Asserted by op-log + verifyChain + readPixels + the history slider.
 * First consumer of e2e_harness.js (validates the rig).
 *   C1 SELECT     — a real click selects an element.
 *   C2 CUT-COMMIT — clicking Cut commits exactly one GEOM_CUT op parented to the selection (op-log +1).
 *   C3 CHAIN-OK   — verifyChain passes after the cut.
 *   C4 VISIBLE    — the framebuffer changed (the void shows).
 *   C5 REVERSIBLE — undo via the history slider restores the pre-cut cursor.
 */
'use strict';
const { runE2E } = require('./e2e_harness');
runE2E('W-E2E-CUT', async (t) => {
  await t.open('Duplex');
  await t.shot('01-open');
  const sel = await t.pick();
  t.assert('C1 SELECT (real click selects element)', !!sel, 'fid=' + (sel && sel.fid));
  if (!sel) return;
  await t.shot('02-selected');
  const before = await t.oplog(); const pix0 = await t.pixsum();
  await t.clickSel('#b-cut'); await t.sleep(900);
  const after = await t.oplog(); const last = await t.lastOp(); const pix1 = await t.pixsum();
  const chain = await t.verifyChain();
  await t.shot('03-cut');
  t.assert('C2 CUT-COMMIT (one GEOM_CUT on selection)', after.len === before.len + 1 && last && last.op_type === 'GEOM_CUT' && last.parameters && last.parameters.parent === sel.fid, 'len ' + before.len + '→' + after.len + ' op=' + (last && last.op_type) + ' parent=' + (last && last.parameters && last.parameters.parent));
  t.assert('C3 CHAIN-OK (verifyChain)', chain === true, 'verifyChain=' + chain);
  t.assert('C4 VISIBLE (framebuffer changed)', pix0 !== pix1, 'pix ' + pix0 + '→' + pix1);
  await t.undoToCursor(before.cur);
  const undo = await t.oplog();
  t.assert('C5 REVERSIBLE (undo restores cursor)', undo.cur === before.cur, 'cursor ' + after.cur + '→' + undo.cur + ' (want ' + before.cur + ')');
});
