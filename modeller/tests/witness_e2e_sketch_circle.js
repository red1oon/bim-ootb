#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-SKETCH-CIRCLE: real-user, maths-asserted E2E of the circle sketch primitive.
 * BONSAI_KERNEL_RESEARCH.md §Follow-up spec — circle/arc sketch primitive (the "smaller than feared,
 * checked not guessed" resolution: kernel/lib/kernel/index.js already exports makeCircleEdge in the SAME
 * edge-primitive class as the makeLineEdge the GEOM_EXTRUDE_POLY handler uses — no new op type, no WASM
 * work). Scope: CIRCLE ONLY (arc placement UI is unsettled, out of scope); NO planegcs solver wiring
 * (tangent/circle_radius is the explicitly deferred next increment — a lone circle has nothing to
 * constrain against). Placement = the standard CAD convention: click sets CENTER, second click sets the
 * radius (distance centre→click), OR a typed #dim-radius + Enter sets it EXACTLY (same toolbar-field
 * pattern as #dim-w/#dim-h). The profile payload carries {circle:{cx,cy,r}} as a SIBLING key to
 * profile.points, per the leaf-op payload convention.
 *
 * Real path (puppeteer real mouse/keyboard on the production modeller.html — no engine seams):
 * Sketch → Constrain cycled to Circle → 2 real ground clicks (centre, rim) → typed #dim-radius →
 * Extrude → a real cylindrical solid in the op-log/scene. Assertions are HAND-DERIVED invariants
 * computed independently in this file's own maths — screenshots are for human skim only, never cited
 * as proof of a numbered claim.
 *   K1 MODE-CIRCLE        — the Constrain button cycles to the new 'circle' mode (label 'Circle').
 *   K2 DIM-RADIUS-SHOWN   — #dim-radius is visible in circle mode (gated on MODE, not the quad-length check).
 *   K3 RADIUS-FROM-CLICK  — centre-click then rim-click commits a circle whose radius equals THIS TEST's
 *                           own Euclidean distance between the two clicked world points (and whose centre
 *                           is the first click) — within click/raycast tolerance, NOT read back from the
 *                           app's r as if that were proof.
 *   K4 RADIUS-TYPED-EXACT — typing a value into #dim-radius + Enter sets the radius to EXACTLY the typed
 *                           value (provably different from the click-derived one).
 *   K5 OP-PAYLOAD-CIRCLE  — Extrude appends ONE GEOM_EXTRUDE_POLY whose profile carries circle:{cx,cy,r}
 *                           with r EXACTLY the typed value, and NO profile.points (sibling key, not both).
 *   K6 EXTRUDE-BBOX-SIZE  — the authored solid's real mesh bbox size equals the hand-computed
 *                           diameter × diameter × depth (2r,2r,depth) within tessellation tolerance.
 *   K7 EXTRUDE-BBOX-CENTRE— the bbox centre sits at (cx, cy, depth/2) — the cylinder is where the circle
 *                           was placed, not at the origin.
 *   K8 REGRESSION-QUAD    — cycling back to axis mode, a 4-click point-ring polygon still solves and
 *                           extrudes: bbox equals the hand-computed bbox of the op's own solved points ×
 *                           typed depth (the pre-existing flow is untouched by the circle branch).
 */
'use strict';
const { runE2E } = require('./e2e_harness');

runE2E('W-E2E-SKETCH-CIRCLE', async (t) => {
  await t.open('Duplex'); await t.shot('01-open');

  const [x0, y0] = await t.clearGround(6);
  const CTR = [x0 + 3, y0 + 3];                      // first click — the centre
  const RIM = [x0 + 5, y0 + 3];                      // second click — a rim point
  const R_CLICK = Math.hypot(RIM[0] - CTR[0], RIM[1] - CTR[1]);   // THIS TEST's own Euclidean radius (=2)

  // Enter sketch, cycle Constrain axis→rect→square→circle (3 real clicks from the default).
  await t.clickSel('#b-sketch'); await t.sleep(300);
  for (let i = 0; i < 3; i++) { await t.clickSel('#b-constrain'); await t.sleep(120); }
  const modeState = await t.pg.evaluate(() => ({
    mode: window.Bonsai.sketch.mode,
    label: document.getElementById('b-constrain').querySelector('span').textContent,
  }));
  t.assert('K1 MODE-CIRCLE (Constrain cycles to the new circle mode, label tracks)',
    modeState.mode === 'circle' && modeState.label === 'Circle',
    'mode=' + modeState.mode + ' label=' + modeState.label);

  await t.overheadTo(CTR[0], CTR[1], 14);

  // Click 1: centre. Click 2: rim (radius = centre→click distance) — real mouse, real ground raycast.
  for (const [wx, wy] of [CTR, RIM]) {
    const p = await t.proj(wx, wy, 0);
    await t.pg.mouse.move(p[0], p[1]); await t.sleep(40);
    await t.pg.mouse.down(); await t.sleep(40); await t.pg.mouse.up(); await t.sleep(200);
  }
  await t.sleep(300);
  await t.shot('02-circle-clicked');

  const st = await t.pg.evaluate(() => ({
    dimRadius: document.getElementById('dim-radius').style.display,
    dimW: document.getElementById('dim-w').style.display,
    circles: window.Bonsai.sketch.circles.map(c => [c.cx, c.cy, c.r]),
    pending: window.Bonsai.sketch.pendingCircle,
  }));
  console.log('§SKETCH_CIRCLE_CLICKED circles=' + JSON.stringify(st.circles) + ' pending=' + JSON.stringify(st.pending) +
    ' dimRadius=' + JSON.stringify(st.dimRadius) + ' expectedCentre=' + JSON.stringify(CTR) + ' expectedR=' + R_CLICK);
  t.assert('K2 DIM-RADIUS-SHOWN (#dim-radius visible in circle mode; quad W field stays hidden)',
    st.dimRadius !== 'none' && st.dimW === 'none',
    'dimRadius display=' + JSON.stringify(st.dimRadius) + ' dimW display=' + JSON.stringify(st.dimW));

  const c0 = st.circles[0];
  const TOL = 0.05;   // click → screen px → ground-raycast round-trip tolerance (same order as the weld witness)
  const centreErr = c0 ? Math.hypot(c0[0] - CTR[0], c0[1] - CTR[1]) : Infinity;
  const radiusErr = c0 ? Math.abs(c0[2] - R_CLICK) : Infinity;
  t.assert('K3 RADIUS-FROM-CLICK (r == test-computed |rim-centre| Euclid distance; centre == first click)',
    st.circles.length === 1 && !st.pending && centreErr < TOL && radiusErr < TOL,
    'circle=' + JSON.stringify(c0) + ' centreErr=' + centreErr.toFixed(4) + ' radiusErr=' + radiusErr.toFixed(4) + ' wantR=' + R_CLICK);

  // Typed radius — real focus click + keyboard + Enter, sets EXACTLY (deliberately != the click-derived 2.0).
  const R_TYPED = 1.75;
  await t.pg.click('#dim-radius', { clickCount: 3 });
  await t.pg.keyboard.type(String(R_TYPED));
  await t.pg.keyboard.press('Enter');
  await t.sleep(300);
  await t.shot('03-radius-typed');
  const afterType = await t.pg.evaluate(() => window.Bonsai.sketch.circles.map(c => [c.cx, c.cy, c.r]));
  console.log('§SKETCH_CIRCLE_TYPED circles=' + JSON.stringify(afterType) + ' typed=' + R_TYPED);
  t.assert('K4 RADIUS-TYPED-EXACT (r is EXACTLY the typed value, not the click-derived one)',
    afterType.length === 1 && Math.abs(afterType[0][2] - R_TYPED) < 1e-9 && Math.abs(R_TYPED - R_CLICK) > 0.1,
    'r=' + (afterType[0] && afterType[0][2]) + ' typed=' + R_TYPED + ' clickDerivedWas=' + (c0 && c0[2]));

  // Extrude depth 3 → one GEOM_EXTRUDE_POLY with profile.circle (sibling key to profile.points).
  const DEPTH = 3;
  await t.pg.click('#dim-depth', { clickCount: 3 }); await t.pg.keyboard.type(String(DEPTH));
  const opsBefore = await t.oplog();
  await t.clickSel('#b-extrude'); await t.sleep(800);
  const opsAfter = await t.oplog(); const lastOp = await t.lastOp();
  const prof = lastOp && lastOp.parameters.profile;
  console.log('§SKETCH_CIRCLE_EXTRUDE opsLen=' + opsBefore.len + '->' + opsAfter.len +
    ' op=' + (lastOp && lastOp.op_type) + ' profile=' + JSON.stringify(prof));
  t.assert('K5 OP-PAYLOAD-CIRCLE (one new GEOM_EXTRUDE_POLY; profile.circle r EXACTLY typed; no profile.points)',
    opsAfter.len === opsBefore.len + 1 && lastOp && lastOp.op_type === 'GEOM_EXTRUDE_POLY' &&
    prof && prof.circle && Math.abs(prof.circle.r - R_TYPED) < 1e-9 && prof.points == null,
    'opsLen ' + opsBefore.len + '->' + opsAfter.len + ' profile=' + JSON.stringify(prof));

  // Hand-computed bbox: a circle at (cx,cy) radius r extruded by depth ⇒ size (2r,2r,depth), centre (cx,cy,depth/2).
  const bb = await t.pg.evaluate((fid) => {
    const g = window.Bonsai.group(); const m = g.children.find(o => o.isMesh && o.userData.featureId === fid);
    if (!m) return null;
    const b = new window.THREE.Box3().setFromObject(m);
    return { min: [b.min.x, b.min.y, b.min.z], max: [b.max.x, b.max.y, b.max.z] };
  }, lastOp && lastOp.id);
  const size = bb && [bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]];
  const centre = bb && [(bb.min[0] + bb.max[0]) / 2, (bb.min[1] + bb.max[1]) / 2, (bb.min[2] + bb.max[2]) / 2];
  const expSize = [2 * R_TYPED, 2 * R_TYPED, DEPTH];
  const expCentre = [prof && prof.circle ? prof.circle.cx : NaN, prof && prof.circle ? prof.circle.cy : NaN, DEPTH / 2];
  console.log('§SKETCH_CIRCLE_BBOX fid=' + (lastOp && lastOp.id) + ' size=' + JSON.stringify(size) +
    ' expectedSize=' + JSON.stringify(expSize) + ' centre=' + JSON.stringify(centre) + ' expectedCentre=' + JSON.stringify(expCentre));
  // x/y get a tessellation tolerance (the mesh is a chordal approximation of the rim); z is an exact extrude.
  const TESS = 0.05;
  t.assert('K6 EXTRUDE-BBOX-SIZE (real mesh bbox == hand-computed diameter x diameter x depth)',
    !!size && Math.abs(size[0] - expSize[0]) < TESS && Math.abs(size[1] - expSize[1]) < TESS && Math.abs(size[2] - expSize[2]) < 1e-2,
    'size=' + JSON.stringify(size) + ' expected=' + JSON.stringify(expSize));
  t.assert('K7 EXTRUDE-BBOX-CENTRE (cylinder sits at the authored centre, z-centred at depth/2)',
    !!centre && Math.abs(centre[0] - expCentre[0]) < TESS && Math.abs(centre[1] - expCentre[1]) < TESS && Math.abs(centre[2] - expCentre[2]) < 1e-2,
    'centre=' + JSON.stringify(centre) + ' expected=' + JSON.stringify(expCentre));
  await t.shot('04-cylinder');

  // ── Regression: the pre-existing point-ring polygon flow, untouched by the circle branch ──────────────
  const S2 = 3.0;
  const g2 = await t.clearGround(S2 + 0.6);          // fresh clear spot (the cylinder now occupies the first)
  const corners = [[g2[0], g2[1]], [g2[0] + S2, g2[1]], [g2[0] + S2, g2[1] + S2], [g2[0], g2[1] + S2]];
  await t.clickSel('#b-sketch'); await t.sleep(300);          // re-enter (mode persisted as 'circle')
  // circle → arc → axis (wrap-around — the cycle grew a 5th 'arc' stop, W-E2E-SKETCH-ARC)
  for (let i = 0; i < 2; i++) { await t.clickSel('#b-constrain'); await t.sleep(120); }
  const mode2 = await t.pg.evaluate(() => window.Bonsai.sketch.mode);
  await t.overheadTo(g2[0] + S2 / 2, g2[1] + S2 / 2, 14);
  for (const [wx, wy] of corners) {
    const p = await t.proj(wx, wy, 0);
    await t.pg.mouse.move(p[0], p[1]); await t.sleep(40);
    await t.pg.mouse.down(); await t.sleep(40); await t.pg.mouse.up(); await t.sleep(150);
  }
  await t.sleep(300);
  const DEPTH2 = 2;
  await t.pg.click('#dim-depth', { clickCount: 3 }); await t.pg.keyboard.type(String(DEPTH2));
  const ops2Before = await t.oplog();
  await t.clickSel('#b-extrude'); await t.sleep(800);
  const ops2After = await t.oplog(); const lastOp2 = await t.lastOp();
  const pts2 = lastOp2 && lastOp2.parameters.profile.points;
  const bb2 = await t.pg.evaluate((fid) => {
    const g = window.Bonsai.group(); const m = g.children.find(o => o.isMesh && o.userData.featureId === fid);
    if (!m) return null;
    const b = new window.THREE.Box3().setFromObject(m); const s = new window.THREE.Vector3(); b.getSize(s);
    return [s.x, s.y, s.z];
  }, lastOp2 && lastOp2.id);
  // Hand-computed expectation from the op's own solved ring (same recipe as W-E2E-SKETCH-DIMS K19).
  const xs = pts2 ? pts2.map(p => p[0]) : [], ys = pts2 ? pts2.map(p => p[1]) : [];
  const exp2 = pts2 ? [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), DEPTH2] : null;
  console.log('§SKETCH_CIRCLE_REGRESSION mode=' + mode2 + ' opsLen=' + ops2Before.len + '->' + ops2After.len +
    ' pts=' + JSON.stringify(pts2) + ' bbox=' + JSON.stringify(bb2) + ' expected=' + JSON.stringify(exp2));
  t.assert('K8 REGRESSION-QUAD (axis-mode 4-point ring still solves+extrudes; bbox == hand-computed solved-points bbox)',
    mode2 === 'axis' && ops2After.len === ops2Before.len + 1 && lastOp2 && lastOp2.op_type === 'GEOM_EXTRUDE_POLY' &&
    Array.isArray(pts2) && pts2.length === 4 && !!bb2 && !!exp2 &&
    Math.abs(bb2[0] - exp2[0]) < 5e-3 && Math.abs(bb2[1] - exp2[1]) < 5e-3 && Math.abs(bb2[2] - exp2[2]) < 5e-3,
    'mode=' + mode2 + ' pts=' + (pts2 && pts2.length) + ' bbox=' + JSON.stringify(bb2) + ' expected=' + JSON.stringify(exp2));
  await t.shot('05-regression-quad');
});
