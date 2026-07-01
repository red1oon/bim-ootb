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
 *   C6 GEOMETRY-REVERSIBLE — after undo the framebuffer returns EXACTLY to the pre-cut frame (the void closed).
 *
 * §CUT-ON-ARC ROOT-CAUSE (this session): the resume flagged a C5 "undo→0" anomaly. The real bug was deeper — a
 * seeded ARC wall is a BAKED GEOM_INSERT mesh, not a worker B-rep, so the occt fold of GEOM_CUT threw "parent not
 * found": the op committed to the signed log (C2/C3 pass) but never rendered (C4 fail) and the failed fold skipped
 * syncHistory(), leaving the slider dead so undo collapsed to 0 (C5 fail). Fix: a box-like insert that is a cut
 * target is PROMOTED to a B-rep box built from its EXACT measured corners (bonsai_kernel._insertCutBox + worker
 * seedBoxes) — non-invent (box == baked mesh vertex-for-vertex); rotated/non-box inserts are refused up front.
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
  await t.shotClip('cut-select', sel.fid, 80);   // guide frame (§F2 G4 element-clip): the wall, selected
  const before = await t.oplog(); const pix0 = await t.pixsum();
  await t.clickSel('#b-cut'); await t.sleep(900);
  const after = await t.oplog(); const last = await t.lastOp(); const pix1 = await t.pixsum();
  const chain = await t.verifyChain();
  await t.shot('03-cut');
  await t.shotClip('cut-open', sel.fid, 80);   // guide frame (§F2 G4 element-clip): the opening, cut
  t.assert('C2 CUT-COMMIT (one GEOM_CUT on selection)', after.len === before.len + 1 && last && last.op_type === 'GEOM_CUT' && last.parameters && last.parameters.parent === sel.fid, 'len ' + before.len + '→' + after.len + ' op=' + (last && last.op_type) + ' parent=' + (last && last.parameters && last.parameters.parent));
  t.assert('C3 CHAIN-OK (verifyChain)', chain === true, 'verifyChain=' + chain);
  t.assert('C4 VISIBLE (framebuffer changed)', pix0 !== pix1, 'pix ' + pix0 + '→' + pix1);
  await t.undoToCursor(before.cur);
  const undo = await t.oplog(); const pix2 = await t.pixsum();
  await t.shot('04-undone');
  t.assert('C5 REVERSIBLE (undo restores cursor)', undo.cur === before.cur, 'cursor ' + after.cur + '→' + undo.cur + ' (want ' + before.cur + ')');
  t.assert('C6 GEOMETRY-REVERSIBLE (void closed, frame == pre-cut)', pix2 === pix0, 'pix0=' + pix0 + ' postCut=' + pix1 + ' postUndo=' + pix2);
}, { width: 1200, height: 850, dpr: 2 });
