#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-CUT: real-user, maths-asserted E2E of the CUT (opening) tool.
 * Real path: open → click an element to select it → click the Cut pill → a GEOM_CUT void is committed into the
 * signed op-log as a child of the selection. Asserted by op-log + verifyChain + readPixels + the history slider.
 * First consumer of e2e_harness.js (validates the rig).
 *   C1 SELECT     — a real click selects an element.
 *   C2 CUT-COMMIT — clicking Cut commits exactly one GEOM_CUT op parented to the selection (op-log +1).
 *   C3 CHAIN-OK   — verifyChain passes after the cut.
 *   C4 VISIBLE    — RETIRED as a verdict 2026-09-26 (pixel sum flipped with no code change); C6 is the numeric proof. Logged as info.
 *   C5 REVERSIBLE — undo via the history slider restores the pre-cut cursor.
 *   C6 GEOMETRY-REVERSIBLE — the cut changes the element's own mesh and the undo restores it exactly (was a pixel compare).
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
  // §F2-FRAMING: the guide caption says "the wall" — don't grab the biggest slab. cuttable (2026-07-30):
  // Duplex's front-ranked wallish candidates are now ROTATED inserts (openings-inherit-host-rotation data);
  // bCut honestly refuses those ("cut needs a box-shaped wall"), so the subject must be one the production
  // gate (Bonsai.canCut — §THE CALL widened this past just _insertCutBox to also accept a real per-layer
  // seed, CUT_GATE_CSG_SPEC.md) accepts — otherwise this witness measures the refusal path, not the cut.
  // maxVol (2026-08-08, found building §LAYER-SOLID-SEED): now that canCut() accepts 57/57 Duplex wallish
  // candidates instead of just 2 tiny footing boxes, pick()'s own largest-first sort landed on fid=112 (the
  // SAME pathological single-biggest-wall the W-E2E-MOVE finding already named, e2e_harness.js §F2-FRAMING)
  // — cap volume like that witness already does, same precedent, same reason (avoid the known
  // largest-mesh/swiftshader-resource-limit case, not an app regression).
  const sel = await t.pick({ prefer: 'wall', cuttable: true, maxVol: 6 });
  t.assert('C1 SELECT (real click selects element)', !!sel, 'fid=' + (sel && sel.fid));
  if (!sel) return;
  await t.frameElement(sel.fid, 0.42);            // §F2-FRAMING: real close-up BEFORE any pixsum baseline (camera then stays fixed)
  await t.shot('02-selected');
  await t.shotClip('cut-select', sel.fid, 80);   // guide frame (§F2 G4 element-clip): the wall, selected
const fpOf = (fid) => t.pg.evaluate((fid) => { const m = window.Bonsai.group().children.find(o => o.userData && o.userData.featureId === fid);
    if (!m) return null; const a = m.geometry.attributes.position.array; let sx = 0, sy = 0, sz = 0;
    for (let i = 0; i < a.length; i += 3) { sx += a[i]; sy += a[i + 1]; sz += a[i + 2]; }
    return { n: a.length / 3, idx: m.geometry.index ? m.geometry.index.count : 0, s: [sx, sy, sz].map(v => +v.toFixed(4)) }; }, fid);
    const before = await t.oplog(); const pix0 = await t.pixsum(); const geo0 = await fpOf(sel.fid);
  await t.clickSel('#b-cut'); await t.sleep(900);
  const after = await t.oplog(); const last = await t.lastOp(); const pix1 = await t.pixsum(); const geo1 = await fpOf(sel.fid);
  const chain = await t.verifyChain();
  await t.shot('03-cut');
  await t.shotClip('cut-open', sel.fid, 80);   // guide frame (§F2 G4 element-clip): the opening, cut
  t.assert('C2 CUT-COMMIT (one GEOM_CUT on selection)', after.len === before.len + 1 && last && last.op_type === 'GEOM_CUT' && last.parameters && last.parameters.parent === sel.fid, 'len ' + before.len + '→' + after.len + ' op=' + (last && last.op_type) + ' parent=' + (last && last.parameters && last.parameters.parent));
  t.assert('C3 CHAIN-OK (verifyChain)', chain === true, 'verifyChain=' + chain);
  // §NET-AUDIT PIXEL-AS-PROOF (2026-09-26): a whole-frame pixel sum is not a verdict (Primal Law). Measured flipping with no code change
  // — 09-26 serial runs: cut C4 red on main / green on the branch, cut_layers L6 the reverse, sketch K5b red only under load.
  // C4 is retired as a verdict: C6 already proves the void numerically (the element's own mesh changed, undo restores it).
  console.log('  §E2E-CUT C4-PIX info (retired verdict, see C6) pix ' + pix0 + '→' + pix1);
  await t.undoToCursor(before.cur);
  const undo = await t.oplog();
  const geo2 = await fpOf(sel.fid);   // §C6-GEOMETRY: the element's own mesh, read straight after the undo
  // C6 re-select, MEASURED PRECISION (2026-07-30, §SEL-TINT-REFOLD fix session): the old comment here blamed
  // lost selection TINT — wrong attribution. bCut.onclick ends in an explicit highlight(null) (deselect by
  // design), so pix0's selection visuals (emissive + §V5 outline) are legitimately absent post-undo; the
  // re-click restores SELECTION STATE, and the tint on the rebuilt mesh is now guaranteed by §SEL-TINT-REFOLD
  // (foldChainToScene → 'bonsai:refold' → _paintSel; Witness: W-E2E-SEL-TINT-REFOLD). What HAD broken C6
  // since §ZOOM-SEL landed: the re-click auto-flies the camera, so the frames could never match again.
  // Settle the fly, then re-frame with the SAME deterministic frameElement(fid, 0.42) that produced pix0's
  // camera (same bbox, same view dir = ZOOM_ISO_DIR after either fly) — identical camera, honest compare.
  {
    await t.clickOn(sel.fid); await t.flySettle();
    await t.frameElement(sel.fid, 0.42);
  }
  const pix2 = await t.pixsum();
  await t.shot('04-undone');
  t.assert('C5 REVERSIBLE (undo restores cursor)', undo.cur === before.cur, 'cursor ' + after.cur + '→' + undo.cur + ' (want ' + before.cur + ')');
  // §C6-GEOMETRY (2026-09-26): the old C6 compared whole-frame pixel checksums after a re-select click + re-frame. Measured on
  // main: the geometry WAS back (same bbox, 196 visible meshes) but the re-click selected a different element (sel=[124] vs [81])
  // and framed it, so the frames could never match — the witness, not the app. Primal Law: numbers, not pixels. C6 now reads
  // the cut element's own mesh: the cut CHANGED it and the undo RESTORED it exactly (vertex/index counts + position sums).
  const same = (a, b) => !!a && !!b && a.n === b.n && a.idx === b.idx && a.s.every((v, i) => Math.abs(v - b.s[i]) < 1e-3);
  t.assert('C6 GEOMETRY-REVERSIBLE (cut changed the element mesh; undo restored it exactly)', !same(geo0, geo1) && same(geo0, geo2),
    'pre=' + JSON.stringify(geo0) + ' cut=' + JSON.stringify(geo1) + ' undo=' + JSON.stringify(geo2) + ' (frames, not judged: ' + pix0 + '/' + pix1 + '/' + pix2 + ')');
}, { width: 1200, height: 850, dpr: 2 });
