#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-SKETCH-WELD: real-user, maths-asserted E2E of the p2p_coincident vertex weld.
 * BONSAI_KERNEL_RESEARCH.md §GAP-TO-COMPETITIVE Tier 2 (planegcs constraint richness) — third increment
 * after p2p_distance (width/height) and l2l_angle_ll (corner angle). A click that lands within WELD_TOL of
 * an EARLIER point in the SAME sketch pins the new point p2p_coincident to it (`bonsai_sketch.js`
 * `addPointWeld`), instead of adding a near-duplicate point a few cm off — the standard CAD-sketch
 * "click near an existing vertex to weld onto it" convention. Same recipe as the prior two increments
 * (existing point primitives, no new architecture) — explicitly NOT the circle/arc primitive tangent/
 * circle_radius need, which is scoped separately (see this doc's own follow-up spec section) rather than
 * built improvised.
 *
 * Real path: Sketch (axis mode, default) → 5 real ground clicks tracing an L-shape, where the 5th
 * deliberately lands near the RAW (pre-solve) position of the 2nd click, not that point's eventual
 * H/V-cleaned position — this is the point of the test: proving the weld tracks the TARGET's SOLVED
 * position live, not a static coordinate copy taken at click time.
 *   K1 WELD-DETECTED     — addPointWeld reports the 5th point welded to the 2nd (index 4 → 1).
 *   K2 TARGET-ACTUALLY-MOVED — the target point's raw click position is NOT its solved position (proves
 *                          the H/V auto-cleanup did real, non-trivial work — otherwise K3 would be vacuous).
 *   K3 WELD-EXACT         — after solve(), the welded point lands EXACTLY on the target's SOLVED position
 *                          (not the target's raw click position) — computed independently (plain distance
 *                          on the actual returned points), not re-read from the app's own weld bookkeeping.
 *   K4 OTHER-POINTS-UNCHANGED — the two points NOT involved in the weld (p0 anchor, p3) land where the H/V
 *                          auto-constraints alone would put them — the weld didn't perturb unrelated points.
 *   K5 EXTRUDE-SUCCEEDS   — a profile containing a welded (repeated-position) point authors a real solid
 *                          with no error — the degenerate zero-length edge doesn't break Extrude.
 */
'use strict';
const { runE2E } = require('./e2e_harness');
const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

runE2E('W-E2E-SKETCH-WELD', async (t) => {
  await t.open('Duplex'); await t.shot('01-open');

  const [x0, y0] = await t.clearGround(5);
  // p1 clicked off-axis on purpose (dy=0.3 vs dx=4 -> within AXIS_TOL, so horizontal_pp WILL move it) —
  // the whole point of this test is proving the weld survives that cleanup, not a no-op on already-clean input.
  const p0 = [x0, y0], p1raw = [x0 + 4, y0 + 0.3], p2 = [x0 + 4, y0 + 3], p3 = [x0, y0 + 3], p4weld = [x0 + 4, y0 + 0.35];
  const corners = [p0, p1raw, p2, p3, p4weld];

  await t.clickSel('#b-sketch'); await t.sleep(300);
  const mode = await t.pg.evaluate(() => window.Bonsai.sketch.mode);
  await t.overheadTo(x0 + 2, y0 + 1.5, 14);
  for (const [wx, wy] of corners) {
    const p = await t.proj(wx, wy, 0);
    await t.pg.mouse.move(p[0], p[1]); await t.sleep(40);
    await t.pg.mouse.down(); await t.sleep(40); await t.pg.mouse.up(); await t.sleep(150);
  }
  await t.sleep(300);
  await t.shot('02-weld-drawn');

  const before = await t.pg.evaluate(() => ({ weld: window.Bonsai.sketch.weld, pts: window.Bonsai.sketch.points.map(p => [p.x, p.y]) }));
  console.log('§SKETCH_WELD_MAP weld=' + JSON.stringify(before.weld) + ' rawPts=' + JSON.stringify(before.pts) + ' mode=' + mode);
  t.assert('K1 WELD-DETECTED (5th point welded to the 2nd — index 4 -> 1)', before.weld['4'] === 1, 'weld=' + JSON.stringify(before.weld));

  const rawP1 = before.pts[1];

  const r = await t.pg.evaluate(async () => { const res = await window.Bonsai.sketch.solve(); return { points: res.points }; });
  const solved = r.points.map(p => [p.x, p.y]);
  console.log('§SKETCH_WELD_SOLVED pts=' + JSON.stringify(solved));
  const [s0, s1, s2, s3, s4] = solved;

  const targetMoved = len(rawP1, s1) > 0.05;   // the H/V cleanup actually relocated p1 by a real amount
  t.assert('K2 TARGET-ACTUALLY-MOVED (p1 raw != p1 solved — the cleanup this test depends on is real)',
    targetMoved, 'raw=' + JSON.stringify(rawP1) + ' solved=' + JSON.stringify(s1) + ' moved=' + len(rawP1, s1).toFixed(4) + 'm');

  const weldDrift = len(s4, s1);
  t.assert('K3 WELD-EXACT (welded point == target`s SOLVED position exactly, not its raw click position)',
    weldDrift < 1e-6, 'p4solved=' + JSON.stringify(s4) + ' p1solved=' + JSON.stringify(s1) + ' drift=' + weldDrift.toExponential(2));

  // p0 (anchor) must be untouched; p3 only affected by its OWN H/V edges (adjacent to p2/p0), not the weld.
  t.assert('K4 OTHER-POINTS-UNCHANGED (p0 anchor exactly fixed; p3 unperturbed by an unrelated weld)',
    len(s0, before.pts[0]) < 1e-9 && Math.abs(s3[0] - x0) < 0.05,
    'p0drift=' + len(s0, before.pts[0]).toExponential(2) + ' p3=' + JSON.stringify(s3));

  await t.pg.click('#dim-depth', { clickCount: 3 }); await t.pg.keyboard.type('3');
  const opsBefore = await t.oplog();
  await t.clickSel('#b-extrude'); await t.sleep(600);
  const opsAfter = await t.oplog(); const lastOp = await t.lastOp();
  console.log('§SKETCH_WELD_EXTRUDE opsLen=' + opsBefore.len + '->' + opsAfter.len + ' profilePts=' + (lastOp && lastOp.parameters.profile.points.length));
  t.assert('K5 EXTRUDE-SUCCEEDS (a profile with a welded/repeated-position point authors a real solid)',
    opsAfter.len === opsBefore.len + 1 && lastOp && lastOp.op_type === 'GEOM_EXTRUDE_POLY',
    'opsLen ' + opsBefore.len + '->' + opsAfter.len + ' op=' + (lastOp && lastOp.op_type));
  await t.shot('03-extruded');
});
