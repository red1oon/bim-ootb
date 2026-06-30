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

  await t.clickSel('#b-sketch'); await t.sleep(300);
  const armed = await t.pg.evaluate(() => ({ sketching: !!window.sketching, extrudeShown: document.getElementById('b-extrude').style.display !== 'none' }));
  // sketching is a module-local; fall back to the visible Extrude pill (revealed only in sketch mode) as the proof.
  t.assert('K1 SKETCH-MODE (Sketch pill arms + Extrude revealed)', armed.extrudeShown, 'extrudeShown=' + armed.extrudeShown);

  // A reference ground point near a real element, then a ~2.4m square profile at z=0 (4 ground clicks).
  const ref = await t.pg.evaluate(() => {
    const g = window.Bonsai.group(); const m = g.children.find(o => o.isMesh && o.userData.featureId != null);
    const b = new window.THREE.Box3().setFromObject(m); const c = new window.THREE.Vector3(); b.getCenter(c);
    return [c.x, c.y];
  });
  const S = 2.4, x0 = ref[0] + 1, y0 = ref[1] + 1;
  const corners = [[x0, y0], [x0 + S, y0], [x0 + S, y0 + S], [x0, y0 + S]];
  for (const [wx, wy] of corners) { const p = await t.proj(wx, wy, 0); await t.pg.mouse.move(p[0], p[1]); await t.sleep(40); await t.pg.mouse.down(); await t.sleep(40); await t.pg.mouse.up(); await t.sleep(120); }
  const nPts = await t.pg.evaluate(() => window.Bonsai.sketch.points.length);
  t.assert('K2 POINTS (≥3 sketch points placed)', nPts >= 3, 'points=' + nPts);
  await t.shot('02-sketched');

  const before = await t.oplog(); const pix0 = await t.pixsum();
  await t.pg.evaluate(() => { document.getElementById('dim-depth').value = '2.5'; });
  await t.clickSel('#b-extrude'); await t.sleep(1400);
  const after = await t.oplog(); const last = await t.lastOp(); const chain = await t.verifyChain(); const pix1 = await t.pixsum();
  await t.shot('03-extruded');

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
});
