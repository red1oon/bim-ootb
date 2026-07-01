#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-ROUTE: real-user, maths-asserted E2E of ROUTE→RUN (sweep a run/duct along a path).
 * Real path: open → Route pill → click ≥2 ground points (a polyline spine) → set profile → Sweep-Run pill → one
 * signed GEOM_SWEEP occt pipe lands. Asserted by op-log + scene census + verifyChain + readPixels + history slider.
 * Real pg.mouse ground clicks + real toolbar (a true B-rep, worker fold via kernel.pipe). Also exercises the L-rail
 * fix: the Sweep-Run pill is revealed on mode-enter and must be clickable (it was stranded at 0,0 before the fix).
 *   U1 ROUTE-MODE — Route pill arms route mode and reveals the Sweep-Run pill.
 *   U2 POINTS     — ≥2 real ground clicks register ≥2 route points.
 *   U3 SWEEP      — Sweep-Run commits exactly one GEOM_SWEEP carrying the path + profile.
 *   U4 CHAIN-OK   — verifyChain passes.
 *   U5 ATOMIC     — a solid mesh with featureId == the new op id is in the scene with triangles.
 *   U6 REVERSIBLE — undo restores the cursor AND removes the run.
 */
'use strict';
const { runE2E } = require('./e2e_harness');
runE2E('W-E2E-ROUTE', async (t) => {
  await t.open('Duplex'); await t.shot('01-open');

  await t.clickSel('#b-route'); await t.sleep(300);
  const armed = await t.pg.evaluate(() => document.getElementById('b-run').style.display !== 'none');
  t.assert('U1 ROUTE-MODE (Route pill arms + Sweep-Run revealed)', armed, 'runShown=' + armed);

  // enterRoute() hard-resets the camera to the same fixed top-down plan view as Sketch (looking at world
  // (2, 1.5)) — (2,0)-(4.4,2.4) is verified-clear open ground near that look-at point (§F2 sketch witness probe).
  const x0 = 2, y0 = 0;
  const path = [[x0, y0], [x0 + 2, y0], [x0 + 2, y0 + 2]];      // L-shaped spine, 3 points
  const screenPts = [];
  for (const [wx, wy] of path) { const p = await t.proj(wx, wy, 0); screenPts.push(p); await t.pg.mouse.move(p[0], p[1]); await t.sleep(40); await t.pg.mouse.down(); await t.sleep(40); await t.pg.mouse.up(); await t.sleep(120); }
  const nPts = await t.pg.evaluate(() => window.routePts ? window.routePts.length : null);
  // routePts is a module-local; assert via the Sweep-Run pill becoming enabled (it gates on ≥2 points).
  const runEnabled = await t.pg.evaluate(() => !document.getElementById('b-run').disabled);
  t.assert('U2 POINTS (≥2 route points placed → Run enabled)', runEnabled, 'runEnabled=' + runEnabled + ' nPts=' + nPts);
  await t.shot('02-routed');
  await t.shotPts('route-spine', screenPts);   // guide frame (§F2 G4): clipped around the laid spine (route mode zooms the camera in)

  const before = await t.oplog(); const pix0 = await t.pixsum();
  await t.pg.evaluate(() => { document.getElementById('dim-prof').value = '0.4'; });
  await t.clickSel('#b-run'); await t.sleep(1600);
  const after = await t.oplog(); const last = await t.lastOp(); const chain = await t.verifyChain(); const pix1 = await t.pixsum();
  await t.shot('03-swept');

  // guide frame (§F2 G4): exitRoute already restored the wide camera — select the new run + click the real
  // Fit pill (frames the selection), same trick as the Sketch witness's sketch-wall frame.
  {
    const runCentre = await t.centre(last && last.id);
    if (runCentre) { const wp = await t.proj(runCentre[0], runCentre[1], runCentre[2]); await t.pg.mouse.click(wp[0], wp[1]); await t.sleep(200); }
    await t.clickSel('#b-fit'); await t.sleep(500);
    // the run's 0.4m profile is thin — Fit alone zooms in too tight to read as a duct; dolly back a little
    // for surrounding context (equivalent to a real user's scroll-to-zoom-out after an over-tight auto-fit).
    await t.pg.evaluate(() => {
      const dir = new window.THREE.Vector3().subVectors(window.A.camera.position, window.A.controls.target);
      window.A.camera.position.copy(window.A.controls.target).add(dir.multiplyScalar(3));
      window.A.controls.update();
    });
    await t.sleep(150);
    await t.shot('route-run');
  }

  t.assert('U3 SWEEP (one GEOM_SWEEP with path+profile)',
    after.len === before.len + 1 && last && last.op_type === 'GEOM_SWEEP' && last.parameters && (last.parameters.path || []).length >= 2 && last.parameters.profile,
    'len ' + before.len + '→' + after.len + ' op=' + (last && last.op_type) + ' path=' + (last && last.parameters && last.parameters.path && last.parameters.path.length));
  t.assert('U4 CHAIN-OK (verifyChain)', chain === true, 'verifyChain=' + chain);

  const newId = last && last.id;
  const present = await t.census(new Function('o,obj', 'return o.featureId === ' + newId));
  t.assert('U5 ATOMIC (solid mesh featureId==new op id, has tris)', present.n === 1 && present.inst >= 1, 'meshes fid=' + newId + ' → ' + present.n);
  t.assert('U5b VISIBLE (framebuffer changed)', pix0 !== pix1, 'pix ' + pix0 + '→' + pix1);

  await t.undoToCursor(before.cur);
  const undo = await t.oplog(); const gone = await t.census(new Function('o,obj', 'return o.featureId === ' + newId));
  await t.shot('04-undone');
  t.assert('U6 REVERSIBLE (undo restores cursor + removes run)', undo.cur === before.cur && gone.n === 0, 'cursor ' + after.cur + '→' + undo.cur + ' (want ' + before.cur + ') meshFid' + newId + '=' + gone.n);
}, { width: 1200, height: 850, dpr: 2 });
