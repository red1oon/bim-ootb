#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-SKETCH: real-user, maths-asserted E2E of SKETCH→EXTRUDE (author a B-rep wall).
 * Real path: open → Sketch pill → click ≥3 ground points (a closed profile) → set depth → Extrude pill → one signed
 * GEOM_EXTRUDE_POLY occt solid lands. Asserted by op-log + scene census (rendered == committed) + verifyChain +
 * readPixels + the history slider. Real pg.mouse ground clicks + real toolbar (a true B-rep, worker fold).
 *   K1 SKETCH-MODE — Sketch pill arms sketch mode and reveals the Extrude pill.
 *   K2 POINTS      — ≥3 real ground clicks register ≥3 sketch points.
 *   K3 EXTRUDE     — Extrude commits exactly one GEOM_EXTRUDE_POLY carrying the depth.
 *   K4 CHAIN-OK    — verifyChain passes.
 *   K5 ATOMIC      — a solid mesh with featureId == the new op id is in the scene with triangles.
 *   K6 REVERSIBLE  — undo restores the cursor AND removes the wall.
 */
'use strict';
const { runE2E } = require('./e2e_harness');
runE2E('W-E2E-SKETCH', async (t) => {
  await t.open('Duplex'); await t.shot('01-open');

  // §F2-FRAMING: derive a PLAN-CLEAR, camera-visible, unoccluded ground square from the live scene while
  // the wide fit view is up — the old hardcoded (2,0)-(4.4,2.4) spot is clear of standing meshes at ground
  // level but sits UNDER THE ROOF, so every plan capture there was occluded.
  const S = 2.4;
  const [x0, y0] = await t.clearGround(S + 0.6);
  const corners = [[x0, y0], [x0 + S, y0], [x0 + S, y0 + S], [x0, y0 + S]];

  await t.clickSel('#b-sketch'); await t.sleep(300);
  const armed = await t.pg.evaluate(() => ({ sketching: !!window.sketching, extrudeShown: document.getElementById('b-extrude').style.display !== 'none' }));
  // sketching is a module-local; fall back to the visible Extrude pill (revealed only in sketch mode) as the proof.
  t.assert('K1 SKETCH-MODE (Sketch pill arms + Extrude revealed)', armed.extrudeShown, 'extrudeShown=' + armed.extrudeShown);
  // Sketch mode enters at a fixed plan view over (2,1.5); pan it over the derived spot (real user pan).
  await t.overheadTo(x0 + S / 2, y0 + S / 2, 12);
  const screenPts = [];
  for (const [wx, wy] of corners) { const p = await t.proj(wx, wy, 0); screenPts.push(p); await t.pg.mouse.move(p[0], p[1]); await t.sleep(40); await t.pg.mouse.down(); await t.sleep(40); await t.pg.mouse.up(); await t.sleep(120); }
  const nPts = await t.pg.evaluate(() => window.Bonsai.sketch.points.length);
  t.assert('K2 POINTS (≥3 sketch points placed)', nPts >= 3, 'points=' + nPts);
  await t.shot('02-sketched');
  // guide frame (§F2 G4): the closed profile on open grid, plan view — camera already panned over the spot
  await t.shotPts('sketch-profile', screenPts, 150);

  const before = await t.oplog(); const pix0 = await t.pixsum();
  await t.pg.evaluate(() => { document.getElementById('dim-depth').value = '2.5'; });
  await t.clickSel('#b-extrude'); await t.sleep(1400);
  const after = await t.oplog(); const last = await t.lastOp(); const chain = await t.verifyChain(); const pix1 = await t.pixsum();
  await t.shot('03-extruded');

  // guide frame (§F2 G4 element-clip): exitSketch already restored the wide camera, so a plain bbox-clip would
  // sit at wide-view scale (tiny). Select the new wall + click the real Fit pill (frames the selection) — a
  // genuine app affordance — then shoot full-canvas for a properly zoomed close-up.
  {
    const wallCentre = await t.centre(last && last.id);
    if (wallCentre) { const wp = await t.proj(wallCentre[0], wallCentre[1], wallCentre[2]); await t.pg.mouse.click(wp[0], wp[1]); await t.sleep(200); }
    await t.clickSel('#b-fit'); await t.sleep(500);
    await t.shot('sketch-wall');
  }

  t.assert('K3 EXTRUDE (one GEOM_EXTRUDE_POLY with depth)',
    after.len === before.len + 1 && last && last.op_type === 'GEOM_EXTRUDE_POLY' && last.parameters && last.parameters.depth > 0 && last.parameters.profile && (last.parameters.profile.points || []).length >= 3,
    'len ' + before.len + '→' + after.len + ' op=' + (last && last.op_type) + ' depth=' + (last && last.parameters && last.parameters.depth) + ' pts=' + (last && last.parameters && last.parameters.profile && last.parameters.profile.points.length));
  t.assert('K4 CHAIN-OK (verifyChain)', chain === true, 'verifyChain=' + chain);

  const newId = last && last.id;
  const present = await t.census(new Function('o,obj', 'return o.featureId === ' + newId));
  t.assert('K5 ATOMIC (solid mesh featureId==new op id, has tris)', present.n === 1 && present.inst >= 1, 'meshes fid=' + newId + ' → ' + present.n);
  t.assert('K5b VISIBLE (framebuffer changed)', pix0 !== pix1, 'pix ' + pix0 + '→' + pix1);

  await t.undoToCursor(before.cur);
  const undo = await t.oplog(); const gone = await t.census(new Function('o,obj', 'return o.featureId === ' + newId));
  await t.shot('04-undone');
  t.assert('K6 REVERSIBLE (undo restores cursor + removes wall)', undo.cur === before.cur && gone.n === 0, 'cursor ' + after.cur + '→' + undo.cur + ' (want ' + before.cur + ') meshFid' + newId + '=' + gone.n);
}, { width: 1200, height: 850, dpr: 2 });
