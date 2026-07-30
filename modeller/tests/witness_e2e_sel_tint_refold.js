#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-SEL-TINT-REFOLD scope (read this block first; read the log after every run)
 * ISSUE UNDER TEST (§SEL-TINT-REFOLD — MODELLER_MASTER.md OPEN row 16, first documented as an unfixed UX
 * nit in witness_e2e_cut.js C6): an AUTHORITATIVE RE-FOLD rebuilds every mesh FRESH, and the rebuilt mesh
 * for a STILL-SELECTED featureId comes back WITHOUT its selection emissive (2b5a8c → 000000) even though
 * window.Bonsai._selSet still logically holds it.
 *
 * MEASURED PRECISION (2026-07-30, this witness's own RED runs): the cut path itself is NOT a repro today —
 * bCut.onclick ends in an explicit `highlight(null)` (deselect by design, predates the nit note), so after
 * a cut the set is EMPTY and 000000 is correct. The genuine repro is every re-fold that does NOT `_emit()`
 * — bonsai_oplog.scrubTo (the real #hist-slider = undo/redo scrub, x-ray restore, Connect timeline) — where
 * nothing clears the selection and nothing repaints it either (the bonsai:oplog → _paintSel hook never
 * fires because scrubTo deliberately never emits).
 *
 * PROOF PROTOCOL: RED first on unmodified main (proving it catches the bug), then GREEN with the fix
 * (foldChainToScene announces 'bonsai:refold' after the rebuilt meshes land → modeller.html re-runs
 * _paintSel, the ONE existing tinting path, membership re-resolved by featureId).
 *
 * CLAIMS (all maths off the live scene graph + _selSet — no screenshots as evidence):
 *   T1 SELECT-TINT       — a real click selects a cut-eligible wall, primary emissive 0x2b5a8c.
 *   T2 CUT+RESELECT-TINT — cut commits (authoritative re-fold; cut deselects by design), a real re-click
 *                          re-selects the SAME featureId on its REBUILT mesh (new uuid) and tints it.
 *   T3 TINT-AFTER-UNDO   — undo via the real #hist-slider (scrubTo re-fold, the no-_emit path) with the
 *                          selection LIVE: _selSet still holds the fid, the again-rebuilt mesh (new uuid)
 *                          must carry 2b5a8c. THE BUG: it comes back 000000.
 *   T4 TINT-AFTER-REDO   — slider forward to the post-cut cursor (same no-_emit re-fold, other direction):
 *                          membership persisted, rebuilt mesh must carry 2b5a8c.
 */
'use strict';
const { runE2E } = require('./e2e_harness');
runE2E('W-E2E-SEL-TINT-REFOLD', async (t) => {
  const probe = (fid) => t.pg.evaluate(f => {
    const g = window.Bonsai.group();
    const m = g.children.find(o => o.isMesh && o.userData.featureId === f);
    return {
      uuid: m ? m.uuid : null,
      emissive: (m && m.material && m.material.emissive) ? m.material.emissive.getHexString() : null,
      inSel: !!(window.Bonsai._selSet && window.Bonsai._selSet.has(f)),
      selN: window.Bonsai._selSet ? window.Bonsai._selSet.size : 0
    };
  }, fid);
  const reclick = async (fid) => {   // real mouse re-click on the mesh (raycast-verified point, production select path)
    const ok = await t.clickOn(fid); await t.flySettle();
    return ok;
  };

  await t.open('Duplex');
  // subject must be cut-ELIGIBLE (see e2e_harness pick opts.cuttable). pick() marches real clicks and can
  // exhaust its 2 passes on headless-swiftshader timing flake — re-Fit and retry up to 3 times.
  let sel = null;
  for (let i = 0; i < 3 && !sel; i++) {
    sel = await t.pick({ prefer: 'wall', cuttable: true });
    if (!sel) { const fit = await t.pg.$('#b-fit'); if (fit) { await fit.click(); await t.sleep(600); } }
  }
  t.assert('T0 SELECT (real click selects a cut-eligible wall)', !!sel, 'fid=' + (sel && sel.fid));
  if (!sel) return;

  const p0 = await probe(sel.fid);
  console.log('  §SEL-TINT stage=selected ' + JSON.stringify(p0));
  t.assert('T1 SELECT-TINT (primary emissive 2b5a8c on select)', p0.inSel && p0.emissive === '2b5a8c', 'emissive=' + p0.emissive + ' inSel=' + p0.inSel);

  const before = await t.oplog();
  await t.clickSel('#b-cut'); await t.sleep(900);
  const after = await t.oplog(); const last = await t.lastOp();
  t.assert('T2a CUT-COMMIT (one GEOM_CUT parented to the selection)', after.len === before.len + 1 && last && last.op_type === 'GEOM_CUT' && last.parameters && last.parameters.parent === sel.fid, 'len ' + before.len + '→' + after.len + ' op=' + (last && last.op_type));

  // cut DESELECTS by design (bCut.onclick → highlight(null)) — re-select the same wall with a real click,
  // exactly the flow a user takes before scrubbing history with the element still selected.
  await reclick(sel.fid);
  const p1 = await probe(sel.fid);
  console.log('  §SEL-TINT stage=post-cut-reselect ' + JSON.stringify(p1) + ' (pre-cut uuid=' + p0.uuid + ')');
  t.assert('T2 CUT+RESELECT-TINT (rebuilt mesh — new uuid — selected + tinted)', p1.uuid !== null && p1.uuid !== p0.uuid && p1.inSel && p1.emissive === '2b5a8c', 'uuid ' + p0.uuid + '→' + p1.uuid + ' inSel=' + p1.inSel + ' emissive=' + p1.emissive);

  // THE ISSUE: slider undo → scrubToShared → oplog.scrubTo → foldChainToScene, and scrubTo NEVER _emit()s —
  // nothing deselects, nothing repaints. Selection must survive the re-fold WITH its tint.
  await t.undoToCursor(before.cur);
  const undo = await t.oplog();
  t.assert('T3a UNDO (slider restored the pre-cut cursor)', undo.cur === before.cur, 'cursor ' + after.cur + '→' + undo.cur + ' (want ' + before.cur + ')');
  const p2 = await probe(sel.fid);
  console.log('  §SEL-TINT stage=post-undo ' + JSON.stringify(p2) + ' (post-cut uuid=' + p1.uuid + ')');
  t.assert('T3 TINT-AFTER-UNDO (scrub re-fold keeps membership AND repaints emissive)', p2.uuid !== null && p2.uuid !== p1.uuid && p2.inSel && p2.emissive === '2b5a8c', 'uuid ' + p1.uuid + '→' + p2.uuid + ' inSel=' + p2.inSel + ' emissive=' + p2.emissive + ' (want 2b5a8c)');

  // scrub FORWARD (redo direction) — same no-_emit re-fold, opposite direction.
  await t.undoToCursor(after.cur);
  const redo = await t.oplog();
  t.assert('T4a REDO (slider restored the post-cut cursor)', redo.cur === after.cur, 'cursor ' + undo.cur + '→' + redo.cur + ' (want ' + after.cur + ')');
  const p3 = await probe(sel.fid);
  console.log('  §SEL-TINT stage=post-redo ' + JSON.stringify(p3) + ' (post-undo uuid=' + p2.uuid + ')');
  t.assert('T4 TINT-AFTER-REDO (forward scrub re-fold keeps membership AND repaints emissive)', p3.uuid !== null && p3.uuid !== p2.uuid && p3.inSel && p3.emissive === '2b5a8c', 'uuid ' + p2.uuid + '→' + p3.uuid + ' inSel=' + p3.inSel + ' emissive=' + p3.emissive + ' (want 2b5a8c)');
}, { width: 1200, height: 850, dpr: 2 });
