#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-SKETCH-TANGENT: real-user, maths-asserted E2E of the tangent-to-gridline
 * circle snap — the FIRST real planegcs circle constraint in this codebase (tangent_lc; push_circle had
 * zero call sites before this increment). Scope: line-to-circle tangency vs the ACTIVE authoring grid
 * ONLY (gridlines are global + always-present and ARE the wall/structural alignment per disc_walker's
 * "ARC walls → semi-grid" doctrine); tangent_cc/tangent_ca (circle↔circle/arc — needs a pick-an-entity
 * UI) stay deferred. Trigger mirrors the p2p_coincident weld: when the radius-defining click's raw radius
 * lands within WELD_TOL (0.4) of the perpendicular distance centre→nearest gridline, the circle is solved
 * EXACTLY tangent (centre FIXED, ONLY the radius free); otherwise behaviour is bit-identical to before.
 * Read-back mechanism (the previously unproven piece): apply_solution() → pull_circle re-sets the circle
 * primitive in gcs.sketch_index with the SOLVED `radius` (gcs_wrapper.js, property_offsets.circle.radius)
 * — sketch_index.get_primitive(id).radius, since get_sketch_point serves points only.
 *
 * Real path (puppeteer real mouse/keyboard on the production modeller.html — no engine seams):
 * grid defined + shown via the real #b-grid button → Sketch → Constrain cycled to Circle → real ground
 * clicks → Extrude. Assertions are HAND-DERIVED invariants computed independently in this file's own
 * maths. Spec mapping: item1→K2, item2→K3, item3→K1(+K6), item4→K4/K5, item5→K6/K7.
 *   K1 NO-FALSE-POSITIVE    — grid ON, a circle whose raw radius is FAR (>WELD_TOL) from the nearest
 *                             line's perpendicular distance keeps the raw clicked radius, no tangentTo.
 *   K2 TANGENT-SNAP-RADIUS  — raw radius within WELD_TOL of the perpendicular distance ⇒ the COMMITTED
 *                             radius equals THIS TEST's own |cx − gridX| exactly (solver tangency), which
 *                             is the hand-computed 2.5, and is provably NOT the raw clicked 2.2.
 *   K3 CENTRE-HELD-FIXED    — the committed centre is bit-identical to the app's own recorded pending
 *                             centre after click 1 — the solve moved ONLY the radius, never the centre.
 *   K4 OP-PAYLOAD-SOLVED-R  — Extrude appends ONE GEOM_EXTRUDE_POLY whose profile.circle.r is EXACTLY the
 *                             solved (tangent) radius, and no profile.points (sibling-key convention).
 *   K5 EXTRUDE-BBOX-SOLVED-R— the real mesh bbox equals hand-computed (2r,2r,depth) at (cx,cy,depth/2)
 *                             using the SOLVED radius — the snapped value flows through to the solid.
 *   K6 REGRESSION-GRID-OFF  — the SAME clicks that snapped in K2, with the grid toggled OFF (real
 *                             #b-grid), keep the raw clicked radius and record no tangentTo — the gate is
 *                             grid.active, the same rule as grid.snap(); pre-existing circle mode intact.
 *   K7 REGRESSION-QUAD      — axis-mode 4-point ring still solves + extrudes; bbox equals the
 *                             hand-computed bbox of the op's own solved points × typed depth.
 */
'use strict';
const { runE2E } = require('./e2e_harness');

runE2E('W-E2E-SKETCH-TANGENT', async (t) => {
  await t.open('Duplex'); await t.shot('01-open');

  const [x0, y0] = await t.clearGround(6);
  const GX = x0 + 1;                                   // ONE vertical gridline inside the clear square
  const GY_FAR = y0 + 20;                              // horizontal line parked FAR away — never the nearest, never click-snaps
  // Define the authoring grid relative to the clear spot (test-controlled coords; define() is the same
  // API the app itself calls at startup), then activate it via the REAL toolbar button.
  await t.pg.evaluate((gx, gy) => { window.Bonsai.grid.define({ xs: [gx], ys: [gy] }); }, GX, GY_FAR);
  await t.clickSel('#b-grid'); await t.sleep(300);
  const gridState = await t.pg.evaluate(() => ({ active: window.Bonsai.grid.active, xs: window.Bonsai.grid.xs, ys: window.Bonsai.grid.ys }));
  console.log('§SKETCH_TANGENT_GRID ' + JSON.stringify(gridState) + ' GX=' + GX);

  // Enter sketch, cycle Constrain axis→rect→square→circle.
  await t.clickSel('#b-sketch'); await t.sleep(300);
  for (let i = 0; i < 3; i++) { await t.clickSel('#b-constrain'); await t.sleep(120); }
  await t.overheadTo(x0 + 3, y0 + 3, 14);

  const click = async (wx, wy, ms) => {
    const p = await t.proj(wx, wy, 0);
    await t.pg.mouse.move(p[0], p[1]); await t.sleep(40);
    await t.pg.mouse.down(); await t.sleep(40); await t.pg.mouse.up(); await t.sleep(ms || 250);
  };
  const TOL = 0.06;   // click → screen px → ground-raycast round-trip tolerance (same order as the circle witness)

  // ── K1: circle FAR from tangency (grid ON) — raw radius kept, no snap, no tangentTo ────────────────────
  // Centre (x0+3.5, y0+4.5): perpendicular distance to x=GX is 2.5 (y line is ~15.5 away — never nearest).
  // Raw radius 1.5 ⇒ |1.5 − 2.5| = 1.0 > WELD_TOL(0.4) ⇒ must behave exactly as before the tangent feature.
  const CA = [x0 + 3.5, y0 + 4.5], RA = [x0 + 5, y0 + 4.5];
  const RAW_A = Math.hypot(RA[0] - CA[0], RA[1] - CA[1]);            // = 1.5, this test's own Euclid maths
  await click(CA[0], CA[1]); await click(RA[0], RA[1], 500);
  const stA = await t.pg.evaluate(() => window.Bonsai.sketch.circles.map(c => ({ cx: c.cx, cy: c.cy, r: c.r, tangentTo: c.tangentTo || null })));
  const a0 = stA[0];
  console.log('§SKETCH_TANGENT_FAR circle=' + JSON.stringify(a0) + ' wantRawR=' + RAW_A + ' perpDist=' + Math.abs(CA[0] - GX));
  t.assert('K1 NO-FALSE-POSITIVE (raw radius far from line distance ⇒ raw kept, no tangentTo)',
    stA.length === 1 && !!a0 && Math.abs(a0.r - RAW_A) < TOL && a0.tangentTo == null &&
    Math.abs(a0.r - Math.abs(a0.cx - GX)) > 0.5,
    'r=' + (a0 && a0.r) + ' wantRaw=' + RAW_A + ' tangentTo=' + JSON.stringify(a0 && a0.tangentTo));
  await t.shot('02-far-circle');

  // ── K2/K3: circle NEAR tangency (grid ON) — solved to exact tangency, centre held fixed ────────────────
  // Centre (x0+3.5, y0+2): perpendicular distance to x=GX is 2.5. Raw radius 2.2 ⇒ |2.2 − 2.5| = 0.3 ≤ 0.4
  // ⇒ tangent_lc solve fires; solved radius must be EXACTLY the perpendicular distance (hand-verifiable).
  const CTR = [x0 + 3.5, y0 + 2], RIM = [x0 + 5.7, y0 + 2];
  const RAW_B = Math.hypot(RIM[0] - CTR[0], RIM[1] - CTR[1]);        // = 2.2
  const PERP = Math.abs(CTR[0] - GX);                                // = 2.5, hand-computed expectation
  await click(CTR[0], CTR[1]);
  const pending = await t.pg.evaluate(() => ({ ...window.Bonsai.sketch.pendingCircle }));   // the app's own recorded centre
  await click(RIM[0], RIM[1], 1500);                                 // first planegcs load + tangent solve happens here
  const stB = await t.pg.evaluate(() => window.Bonsai.sketch.circles.map(c => ({ cx: c.cx, cy: c.cy, r: c.r, tangentTo: c.tangentTo || null })));
  const b = stB[1];
  const tangencyErr = b ? Math.abs(b.r - Math.abs(b.cx - GX)) : Infinity;    // solver truth vs THIS TEST's perpendicular formula
  console.log('§SKETCH_TANGENT_SNAP circle=' + JSON.stringify(b) + ' pending=' + JSON.stringify(pending) +
    ' rawR=' + RAW_B + ' perpHand=' + PERP + ' tangencyErr=' + tangencyErr);
  t.assert('K2 TANGENT-SNAP-RADIUS (r == test-computed |cx−gridX| exactly == hand 2.5; provably NOT the raw 2.2)',
    stB.length === 2 && !!b && tangencyErr < 1e-6 && Math.abs(b.r - PERP) < TOL && Math.abs(b.r - RAW_B) > 0.2 &&
    !!b.tangentTo && b.tangentTo.axis === 'x' && b.tangentTo.value === GX,
    'r=' + (b && b.r) + ' tangencyErr=' + tangencyErr.toFixed(9) + ' handPerp=' + PERP + ' raw=' + RAW_B +
    ' tangentTo=' + JSON.stringify(b && b.tangentTo));
  t.assert('K3 CENTRE-HELD-FIXED (committed centre bit-identical to the recorded click-1 centre)',
    !!b && !!pending && Math.abs(b.cx - pending.cx) < 1e-12 && Math.abs(b.cy - pending.cy) < 1e-12 &&
    Math.hypot(b.cx - CTR[0], b.cy - CTR[1]) < TOL,
    'centre=(' + (b && b.cx) + ',' + (b && b.cy) + ') pending=(' + pending.cx + ',' + pending.cy + ')');
  await t.shot('03-tangent-snapped');

  // ── K4/K5: extrude the tangent-snapped circle — solved radius flows into the op + the real solid ───────
  const DEPTH = 3;
  await t.pg.click('#dim-depth', { clickCount: 3 }); await t.pg.keyboard.type(String(DEPTH));
  const opsBefore = await t.oplog();
  await t.clickSel('#b-extrude'); await t.sleep(800);
  const opsAfter = await t.oplog(); const lastOp = await t.lastOp();
  const prof = lastOp && lastOp.parameters.profile;
  console.log('§SKETCH_TANGENT_EXTRUDE opsLen=' + opsBefore.len + '->' + opsAfter.len +
    ' op=' + (lastOp && lastOp.op_type) + ' profile=' + JSON.stringify(prof));
  t.assert('K4 OP-PAYLOAD-SOLVED-R (one new GEOM_EXTRUDE_POLY; profile.circle.r EXACTLY the solved radius; no points)',
    opsAfter.len === opsBefore.len + 1 && lastOp && lastOp.op_type === 'GEOM_EXTRUDE_POLY' &&
    prof && prof.circle && !!b && Math.abs(prof.circle.r - b.r) < 1e-9 && prof.points == null,
    'profile=' + JSON.stringify(prof) + ' solvedR=' + (b && b.r));
  const bb = await t.pg.evaluate((fid) => {
    const g = window.Bonsai.group(); const m = g.children.find(o => o.isMesh && o.userData.featureId === fid);
    if (!m) return null;
    const bx = new window.THREE.Box3().setFromObject(m);
    return { min: [bx.min.x, bx.min.y, bx.min.z], max: [bx.max.x, bx.max.y, bx.max.z] };
  }, lastOp && lastOp.id);
  const size = bb && [bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]];
  const centre = bb && [(bb.min[0] + bb.max[0]) / 2, (bb.min[1] + bb.max[1]) / 2, (bb.min[2] + bb.max[2]) / 2];
  const expSize = b && [2 * b.r, 2 * b.r, DEPTH];                    // hand maths off the SOLVED radius
  const expCentre = b && [b.cx, b.cy, DEPTH / 2];
  const TESS = 0.05;   // chordal rim approximation tolerance (same as the circle witness)
  console.log('§SKETCH_TANGENT_BBOX fid=' + (lastOp && lastOp.id) + ' size=' + JSON.stringify(size) +
    ' expectedSize=' + JSON.stringify(expSize) + ' centre=' + JSON.stringify(centre) + ' expectedCentre=' + JSON.stringify(expCentre));
  t.assert('K5 EXTRUDE-BBOX-SOLVED-R (real mesh bbox == hand-computed 2r x 2r x depth at (cx,cy,depth/2), r = SOLVED)',
    !!size && !!expSize && Math.abs(size[0] - expSize[0]) < TESS && Math.abs(size[1] - expSize[1]) < TESS &&
    Math.abs(size[2] - expSize[2]) < 1e-2 && Math.abs(centre[0] - expCentre[0]) < TESS &&
    Math.abs(centre[1] - expCentre[1]) < TESS && Math.abs(centre[2] - expCentre[2]) < 1e-2,
    'size=' + JSON.stringify(size) + ' exp=' + JSON.stringify(expSize) + ' centre=' + JSON.stringify(centre) + ' expCentre=' + JSON.stringify(expCentre));
  await t.shot('04-cylinder');

  // ── K6: grid toggled OFF (real button) — the SAME clicks that snapped in K2 now keep the raw radius ────
  // The gate is grid.active, the same rule as grid.snap(): a hidden grid never influences a sketch.
  await t.clickSel('#b-grid'); await t.sleep(200);                   // grid OFF
  await t.clickSel('#b-sketch'); await t.sleep(300);                 // re-enter (mode persisted as 'circle')
  await t.overheadTo(x0 + 3, y0 + 3, 14);
  await click(CTR[0], CTR[1]); await click(RIM[0], RIM[1], 800);
  const stC = await t.pg.evaluate(() => ({
    active: window.Bonsai.grid.active,
    circles: window.Bonsai.sketch.circles.map(c => ({ cx: c.cx, cy: c.cy, r: c.r, tangentTo: c.tangentTo || null })),
  }));
  const c0 = stC.circles[0];
  console.log('§SKETCH_TANGENT_GRIDOFF active=' + stC.active + ' circle=' + JSON.stringify(c0) + ' wantRawR=' + RAW_B);
  t.assert('K6 REGRESSION-GRID-OFF (same geometry, grid hidden ⇒ raw clicked radius kept, no tangentTo)',
    stC.active === false && stC.circles.length === 1 && !!c0 && Math.abs(c0.r - RAW_B) < TOL &&
    c0.tangentTo == null && Math.abs(c0.r - PERP) > 0.2,
    'r=' + (c0 && c0.r) + ' wantRaw=' + RAW_B + ' perpWas=' + PERP + ' tangentTo=' + JSON.stringify(c0 && c0.tangentTo));
  await t.shot('05-gridoff-raw');

  // ── K7: full regression — the pre-existing axis-mode point-ring flow, untouched by the tangent branch ──
  const S2 = 3.0;
  const g2 = await t.clearGround(S2 + 0.6);
  // circle → arc → axis (wrap-around, same cycle as the circle witness's own regression leg)
  for (let i = 0; i < 2; i++) { await t.clickSel('#b-constrain'); await t.sleep(120); }
  const mode2 = await t.pg.evaluate(() => window.Bonsai.sketch.mode);
  await t.overheadTo(g2[0] + S2 / 2, g2[1] + S2 / 2, 14);
  for (const [wx, wy] of [[g2[0], g2[1]], [g2[0] + S2, g2[1]], [g2[0] + S2, g2[1] + S2], [g2[0], g2[1] + S2]]) await click(wx, wy, 150);
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
    const bx = new window.THREE.Box3().setFromObject(m); const s = new window.THREE.Vector3(); bx.getSize(s);
    return [s.x, s.y, s.z];
  }, lastOp2 && lastOp2.id);
  const xs2 = pts2 ? pts2.map(p => p[0]) : [], ys2 = pts2 ? pts2.map(p => p[1]) : [];
  const exp2 = pts2 ? [Math.max(...xs2) - Math.min(...xs2), Math.max(...ys2) - Math.min(...ys2), DEPTH2] : null;
  console.log('§SKETCH_TANGENT_REGRESSION mode=' + mode2 + ' opsLen=' + ops2Before.len + '->' + ops2After.len +
    ' pts=' + JSON.stringify(pts2) + ' bbox=' + JSON.stringify(bb2) + ' expected=' + JSON.stringify(exp2));
  t.assert('K7 REGRESSION-QUAD (axis-mode 4-point ring still solves+extrudes; bbox == hand-computed solved-points bbox)',
    mode2 === 'axis' && ops2After.len === ops2Before.len + 1 && lastOp2 && lastOp2.op_type === 'GEOM_EXTRUDE_POLY' &&
    Array.isArray(pts2) && pts2.length === 4 && !!bb2 && !!exp2 &&
    Math.abs(bb2[0] - exp2[0]) < 5e-3 && Math.abs(bb2[1] - exp2[1]) < 5e-3 && Math.abs(bb2[2] - exp2[2]) < 5e-3,
    'mode=' + mode2 + ' pts=' + (pts2 && pts2.length) + ' bbox=' + JSON.stringify(bb2) + ' expected=' + JSON.stringify(exp2));
  await t.shot('06-regression-quad');
});
