#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-SKETCH-ARC: real-user, maths-asserted E2E of the arc sketch primitive.
 * BONSAI_KERNEL_RESEARCH.md §Follow-up spec — circle/arc sketch primitive, ARC leg (the sibling increment
 * to W-E2E-SKETCH-CIRCLE). Placement = FreeCAD Sketcher's "Arc by center" convention, deliberately the
 * SAME gesture shape as the shipped circle mode: click 1 = CENTER, click 2 = START point (radius =
 * distance center→click, same maths as circle's click 2), click 3 = END point where ONLY the DIRECTION
 * matters — its distance from center is IGNORED (matching FreeCAD's actual behavior). No typed-value
 * field in this increment (pure 3-click gesture). Angles are RADIANS, CCW (Math.atan2 / OCCT convention).
 *
 * CLOSURE (disclosed reasoned default, not silently invented): a lone arc is an OPEN curve — the extrude
 * closes it as the circular SECTOR (pie slice): center→start line + the arc + end→center line, the ONLY
 * closure built from ONLY the 3 authored points (a chord closure would silently drop the center from the
 * boundary). The witness case is a ~quarter sector 0°→90° so the bbox is HAND-computable: within one
 * quadrant no arc bulge escapes [cx, cx+r] × [cy, cy+r] × [0, depth] — this also proves the kernel's
 * sweep is CCW start→end as authored (a CW sweep of the complementary 270° would blow the bbox to 2r×2r).
 *
 * Real path (puppeteer real mouse on the production modeller.html — no engine seams): Sketch → Constrain
 * cycled to Arc → 3 real ground clicks (center, start, end) → Extrude → a real sector solid in the
 * op-log/scene. Assertions are HAND-DERIVED invariants computed independently in this file's own maths —
 * screenshots are for human skim only, never cited as proof of a numbered claim.
 *   K1 MODE-ARC           — the Constrain button cycles to the new 'arc' mode (label 'Arc'); the cycle is
 *                           now 5 stops (axis→rect→square→circle→arc).
 *   K2 CENTER-FROM-CLICK  — click 1 pends the arc center at THIS TEST's own clicked world point.
 *   K3 RADIUS-FROM-CLICK  — click 2 sets r == THIS TEST's own Euclidean |start−center| distance (and a
 *                           startAngle == this test's own Math.atan2 on the same click coordinates).
 *   K4 ENDANGLE-DIRECTION — click 3 commits with endAngle == this test's own Math.atan2 of the end click's
 *                           DIRECTION, while r STAYS click 2's value (the end click is at distance 1 ≠ r=2,
 *                           proving its distance is ignored) — computed independently, not read back as proof.
 *   K5 OP-PAYLOAD-ARC     — Extrude appends ONE GEOM_EXTRUDE_POLY whose profile is exactly
 *                           {arc:{cx,cy,r,startAngle,endAngle}} — no profile.points, no profile.circle.
 *   K6 EXTRUDE-BBOX-SIZE  — the real extruded mesh bbox size == the hand-computed quarter-sector box
 *                           (r, r, depth) — this is the sweep-direction proof (CCW as authored).
 *   K7 EXTRUDE-BBOX-CENTRE— the bbox centre sits at (cx + r/2, cy + r/2, depth/2) — the sector is where it
 *                           was placed, in the authored quadrant, not at the origin or mirrored.
 *   K8a REGRESSION-CIRCLE — circle mode still works after the arc change: center+rim clicks extrude to a
 *                           profile.circle cylinder with bbox 2r×2r×depth.
 *   K8b REGRESSION-QUAD   — axis mode still works: a 4-click point-ring still solves and extrudes, bbox ==
 *                           the hand-computed bbox of the op's own solved points × typed depth.
 */
'use strict';
const { runE2E } = require('./e2e_harness');

runE2E('W-E2E-SKETCH-ARC', async (t) => {
  await t.open('Duplex'); await t.shot('01-open');

  const [x0, y0] = await t.clearGround(6);
  const CTR = [x0 + 3, y0 + 3];                       // click 1 — the center
  const START = [x0 + 5, y0 + 3];                     // click 2 — start point: r=2, angle 0 (east)
  const END = [x0 + 3, y0 + 4];                       // click 3 — end DIRECTION: angle π/2 (north), distance 1 ≠ r
  const R_CLICK = Math.hypot(START[0] - CTR[0], START[1] - CTR[1]);            // this test's own radius (=2)
  const A_START = Math.atan2(START[1] - CTR[1], START[0] - CTR[0]);            // this test's own start angle (=0)
  const A_END = Math.atan2(END[1] - CTR[1], END[0] - CTR[0]);                  // this test's own end angle (=π/2)
  const TOL = 0.05;      // click → screen px → ground-raycast round-trip tolerance (same as the circle witness)
  const ANG_TOL = 0.08;  // rad — same click tolerance projected onto the angle (end click is at distance 1)

  // Enter sketch, cycle Constrain axis→rect→square→circle→arc (4 real clicks from the default).
  await t.clickSel('#b-sketch'); await t.sleep(300);
  for (let i = 0; i < 4; i++) { await t.clickSel('#b-constrain'); await t.sleep(120); }
  const modeState = await t.pg.evaluate(() => ({
    mode: window.Bonsai.sketch.mode,
    label: document.getElementById('b-constrain').querySelector('span').textContent,
    stops: window.Bonsai.sketch.MODES.length,
  }));
  t.assert('K1 MODE-ARC (Constrain cycles to the new arc mode, label tracks, 5-stop cycle)',
    modeState.mode === 'arc' && modeState.label === 'Arc' && modeState.stops === 5,
    'mode=' + modeState.mode + ' label=' + modeState.label + ' stops=' + modeState.stops);

  await t.overheadTo(CTR[0], CTR[1], 14);

  // Click 1: center — real mouse, real ground raycast.
  const click = async (wx, wy) => {
    const p = await t.proj(wx, wy, 0);
    await t.pg.mouse.move(p[0], p[1]); await t.sleep(40);
    await t.pg.mouse.down(); await t.sleep(40); await t.pg.mouse.up(); await t.sleep(200);
  };
  await click(CTR[0], CTR[1]);
  const st1 = await t.pg.evaluate(() => ({ pending: window.Bonsai.sketch.pendingArc, arcs: window.Bonsai.sketch.arcs.length }));
  console.log('§SKETCH_ARC_CENTER pending=' + JSON.stringify(st1.pending) + ' expected=' + JSON.stringify(CTR));
  const ctrErr = st1.pending ? Math.hypot(st1.pending.cx - CTR[0], st1.pending.cy - CTR[1]) : Infinity;
  t.assert('K2 CENTER-FROM-CLICK (click 1 pends the center at this test\'s own clicked point)',
    !!st1.pending && st1.pending.r == null && st1.arcs === 0 && ctrErr < TOL,
    'pending=' + JSON.stringify(st1.pending) + ' centreErr=' + ctrErr.toFixed(4));

  // Click 2: start point — radius = |start−center|, startAngle = its direction (same maths as circle's click 2).
  await click(START[0], START[1]);
  const st2 = await t.pg.evaluate(() => ({ pending: window.Bonsai.sketch.pendingArc, arcs: window.Bonsai.sketch.arcs.length }));
  console.log('§SKETCH_ARC_START pending=' + JSON.stringify(st2.pending) + ' expectedR=' + R_CLICK + ' expectedStartAngle=' + A_START);
  const rErr = st2.pending && st2.pending.r != null ? Math.abs(st2.pending.r - R_CLICK) : Infinity;
  const aErr = st2.pending && st2.pending.startAngle != null ? Math.abs(st2.pending.startAngle - A_START) : Infinity;
  t.assert('K3 RADIUS-FROM-CLICK (r == test-computed |start-center| Euclid; startAngle == test\'s own atan2)',
    !!st2.pending && st2.arcs === 0 && rErr < TOL && aErr < ANG_TOL,
    'pending=' + JSON.stringify(st2.pending) + ' rErr=' + rErr.toFixed(4) + ' startAngleErr=' + aErr.toFixed(4));
  await t.shot('02-arc-start');

  // Click 3: end DIRECTION — clicked at distance 1 from the center (≠ r=2): only its atan2 angle may matter.
  await click(END[0], END[1]);
  const st3 = await t.pg.evaluate(() => ({ pending: window.Bonsai.sketch.pendingArc, arcs: window.Bonsai.sketch.arcs.map(a => [a.cx, a.cy, a.r, a.startAngle, a.endAngle]) }));
  console.log('§SKETCH_ARC_END arcs=' + JSON.stringify(st3.arcs) + ' expectedEndAngle=' + A_END + ' (end click distance=1, r must stay ' + R_CLICK + ')');
  const a0 = st3.arcs[0];
  const endErr = a0 ? Math.abs(a0[4] - A_END) : Infinity;
  const rStay = a0 ? Math.abs(a0[2] - R_CLICK) : Infinity;
  t.assert('K4 ENDANGLE-DIRECTION (endAngle == test\'s own atan2 of click 3; r STAYS click 2\'s — click 3 distance IGNORED)',
    st3.arcs.length === 1 && !st3.pending && endErr < ANG_TOL && rStay < TOL,
    'arc=' + JSON.stringify(a0) + ' endAngleErr=' + endErr.toFixed(4) + ' rDrift=' + rStay.toFixed(4));
  await t.shot('03-arc-committed');

  // Extrude depth 3 → one GEOM_EXTRUDE_POLY with profile exactly {arc:{cx,cy,r,startAngle,endAngle}}.
  const DEPTH = 3;
  await t.pg.click('#dim-depth', { clickCount: 3 }); await t.pg.keyboard.type(String(DEPTH));
  const opsBefore = await t.oplog();
  await t.clickSel('#b-extrude'); await t.sleep(800);
  const opsAfter = await t.oplog(); const lastOp = await t.lastOp();
  const prof = lastOp && lastOp.parameters.profile;
  console.log('§SKETCH_ARC_EXTRUDE opsLen=' + opsBefore.len + '->' + opsAfter.len +
    ' op=' + (lastOp && lastOp.op_type) + ' profile=' + JSON.stringify(prof));
  const arcKeys = prof && prof.arc ? Object.keys(prof.arc).sort().join(',') : '';
  t.assert('K5 OP-PAYLOAD-ARC (one new GEOM_EXTRUDE_POLY; profile is exactly {arc:{cx,cy,r,startAngle,endAngle}}; no points/circle)',
    opsAfter.len === opsBefore.len + 1 && lastOp && lastOp.op_type === 'GEOM_EXTRUDE_POLY' &&
    prof && prof.arc && prof.points == null && prof.circle == null &&
    arcKeys === 'cx,cy,endAngle,r,startAngle' && Math.abs(prof.arc.r - R_CLICK) < TOL,
    'opsLen ' + opsBefore.len + '->' + opsAfter.len + ' profileKeys=' + JSON.stringify(prof ? Object.keys(prof) : null) + ' arcKeys=' + arcKeys + ' profile=' + JSON.stringify(prof));

  // Hand-computed bbox: a ~0°→90° sector at (cx,cy) radius r, extruded by depth, stays inside its own
  // quadrant — box [cx, cx+r] × [cy, cy+r] × [0, depth] ⇒ size (r, r, depth), centre (cx+r/2, cy+r/2, depth/2).
  // A CW sweep (the complementary 270°) would blow the x/y size to 2r — this assert IS the CCW proof.
  const bb = await t.pg.evaluate((fid) => {
    const g = window.Bonsai.group(); const m = g.children.find(o => o.isMesh && o.userData.featureId === fid);
    if (!m) return null;
    const b = new window.THREE.Box3().setFromObject(m);
    return { min: [b.min.x, b.min.y, b.min.z], max: [b.max.x, b.max.y, b.max.z] };
  }, lastOp && lastOp.id);
  const size = bb && [bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]];
  const centre = bb && [(bb.min[0] + bb.max[0]) / 2, (bb.min[1] + bb.max[1]) / 2, (bb.min[2] + bb.max[2]) / 2];
  const expSize = [R_CLICK, R_CLICK, DEPTH];
  const expCentre = [CTR[0] + R_CLICK / 2, CTR[1] + R_CLICK / 2, DEPTH / 2];
  console.log('§SKETCH_ARC_BBOX fid=' + (lastOp && lastOp.id) + ' size=' + JSON.stringify(size) +
    ' expectedSize=' + JSON.stringify(expSize) + ' centre=' + JSON.stringify(centre) + ' expectedCentre=' + JSON.stringify(expCentre));
  // x/y tolerance = click noise on r AND on the two boundary angles (≤ r·angErr) + tessellation; z is exact.
  const XY_TOL = 0.12;
  t.assert('K6 EXTRUDE-BBOX-SIZE (real mesh bbox == hand-computed quarter-sector r x r x depth — CCW sweep as authored)',
    !!size && Math.abs(size[0] - expSize[0]) < XY_TOL && Math.abs(size[1] - expSize[1]) < XY_TOL && Math.abs(size[2] - expSize[2]) < 1e-2,
    'size=' + JSON.stringify(size) + ' expected=' + JSON.stringify(expSize));
  t.assert('K7 EXTRUDE-BBOX-CENTRE (sector sits in the authored quadrant: centre (cx+r/2, cy+r/2, depth/2))',
    !!centre && Math.abs(centre[0] - expCentre[0]) < XY_TOL && Math.abs(centre[1] - expCentre[1]) < XY_TOL && Math.abs(centre[2] - expCentre[2]) < 1e-2,
    'centre=' + JSON.stringify(centre) + ' expected=' + JSON.stringify(expCentre));
  await t.shot('04-sector');

  // ── Regression 1: the circle primitive, untouched by the arc branch ──────────────────────────────────
  const g2 = await t.clearGround(6);
  const CTR2 = [g2[0] + 3, g2[1] + 3], RIM2 = [g2[0] + 4.5, g2[1] + 3];
  const R2 = Math.hypot(RIM2[0] - CTR2[0], RIM2[1] - CTR2[1]);
  await t.clickSel('#b-sketch'); await t.sleep(300);            // re-enter (mode persisted as 'arc')
  // arc → axis → rect → square → circle (4 clicks around the 5-stop cycle)
  for (let i = 0; i < 4; i++) { await t.clickSel('#b-constrain'); await t.sleep(120); }
  const modeC = await t.pg.evaluate(() => window.Bonsai.sketch.mode);
  await t.overheadTo(CTR2[0], CTR2[1], 14);
  await click(CTR2[0], CTR2[1]); await click(RIM2[0], RIM2[1]);
  const DEPTH2 = 2;
  await t.pg.click('#dim-depth', { clickCount: 3 }); await t.pg.keyboard.type(String(DEPTH2));
  const opsC0 = await t.oplog();
  await t.clickSel('#b-extrude'); await t.sleep(800);
  const opsC1 = await t.oplog(); const opC = await t.lastOp();
  const profC = opC && opC.parameters.profile;
  const bbC = await t.pg.evaluate((fid) => {
    const g = window.Bonsai.group(); const m = g.children.find(o => o.isMesh && o.userData.featureId === fid);
    if (!m) return null;
    const b = new window.THREE.Box3().setFromObject(m); const s = new window.THREE.Vector3(); b.getSize(s);
    return [s.x, s.y, s.z];
  }, opC && opC.id);
  console.log('§SKETCH_ARC_REGRESSION_CIRCLE mode=' + modeC + ' opsLen=' + opsC0.len + '->' + opsC1.len +
    ' profile=' + JSON.stringify(profC) + ' bbox=' + JSON.stringify(bbC) + ' expected=' + JSON.stringify([2 * R2, 2 * R2, DEPTH2]));
  t.assert('K8a REGRESSION-CIRCLE (circle mode still authors a profile.circle cylinder, bbox 2r x 2r x depth)',
    modeC === 'circle' && opsC1.len === opsC0.len + 1 && profC && profC.circle && profC.arc == null &&
    !!bbC && Math.abs(bbC[0] - 2 * R2) < 0.15 && Math.abs(bbC[1] - 2 * R2) < 0.15 && Math.abs(bbC[2] - DEPTH2) < 1e-2,
    'mode=' + modeC + ' profile=' + JSON.stringify(profC) + ' bbox=' + JSON.stringify(bbC));
  await t.shot('05-regression-circle');

  // ── Regression 2: the pre-existing axis point-ring polygon flow ───────────────────────────────────────
  const S3 = 3.0;
  const g3 = await t.clearGround(S3 + 0.6);
  const corners = [[g3[0], g3[1]], [g3[0] + S3, g3[1]], [g3[0] + S3, g3[1] + S3], [g3[0], g3[1] + S3]];
  await t.clickSel('#b-sketch'); await t.sleep(300);            // re-enter (mode persisted as 'circle')
  // circle → arc → axis (2 clicks, wrap-around)
  for (let i = 0; i < 2; i++) { await t.clickSel('#b-constrain'); await t.sleep(120); }
  const modeQ = await t.pg.evaluate(() => window.Bonsai.sketch.mode);
  await t.overheadTo(g3[0] + S3 / 2, g3[1] + S3 / 2, 14);
  for (const [wx, wy] of corners) await click(wx, wy);
  const DEPTH3 = 2;
  await t.pg.click('#dim-depth', { clickCount: 3 }); await t.pg.keyboard.type(String(DEPTH3));
  const opsQ0 = await t.oplog();
  await t.clickSel('#b-extrude'); await t.sleep(800);
  const opsQ1 = await t.oplog(); const opQ = await t.lastOp();
  const ptsQ = opQ && opQ.parameters.profile.points;
  const bbQ = await t.pg.evaluate((fid) => {
    const g = window.Bonsai.group(); const m = g.children.find(o => o.isMesh && o.userData.featureId === fid);
    if (!m) return null;
    const b = new window.THREE.Box3().setFromObject(m); const s = new window.THREE.Vector3(); b.getSize(s);
    return [s.x, s.y, s.z];
  }, opQ && opQ.id);
  const xs = ptsQ ? ptsQ.map(p => p[0]) : [], ys = ptsQ ? ptsQ.map(p => p[1]) : [];
  const expQ = ptsQ ? [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), DEPTH3] : null;
  console.log('§SKETCH_ARC_REGRESSION_QUAD mode=' + modeQ + ' opsLen=' + opsQ0.len + '->' + opsQ1.len +
    ' pts=' + JSON.stringify(ptsQ) + ' bbox=' + JSON.stringify(bbQ) + ' expected=' + JSON.stringify(expQ));
  t.assert('K8b REGRESSION-QUAD (axis-mode 4-point ring still solves+extrudes; bbox == hand-computed solved-points bbox)',
    modeQ === 'axis' && opsQ1.len === opsQ0.len + 1 && opQ && opQ.op_type === 'GEOM_EXTRUDE_POLY' &&
    Array.isArray(ptsQ) && ptsQ.length === 4 && !!bbQ && !!expQ &&
    Math.abs(bbQ[0] - expQ[0]) < 5e-3 && Math.abs(bbQ[1] - expQ[1]) < 5e-3 && Math.abs(bbQ[2] - expQ[2]) < 5e-3,
    'mode=' + modeQ + ' pts=' + (ptsQ && ptsQ.length) + ' bbox=' + JSON.stringify(bbQ) + ' expected=' + JSON.stringify(expQ));
  await t.shot('06-regression-quad');
});
