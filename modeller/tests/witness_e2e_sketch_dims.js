#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-SKETCH-DIMS: real-user, maths-asserted E2E of the editable sketch W/H dimension.
 * BONSAI_KERNEL_RESEARCH.md §GAP-TO-COMPETITIVE Tier 2 (planegcs constraint richness, p2p_distance) — the
 * actual "drag/type one dimension, everything else updates" primitive, the gap between fixed hand-drawn
 * geometry and Grasshopper/Dynamo-class parametrics. Real path: Sketch → Constrain=rect → 4 real ground
 * clicks → typed value in #dim-w (real click+keyboard, Enter commits) → the WHOLE quad re-solves → Extrude.
 *
 * Found+fixed live while proving this: #dim-w/#dim-h (and every pre-existing dim-* toolbar field —
 * rot/scale/move/depth/prof/rad) rendered invisible under the Outliner panel and were unfocusable by a
 * real mouse click (`#bar`'s inherited `pointer-events:none`, only `button` got the override back; the
 * inputs also had no real screen position, just flow-origin (0,0)). Fixed via a dedicated `#dim-row`
 * container, same "clear the Outliner" left:252px convention already used by #hist/#stat.
 *
 * ⚠ CORRECTED same-day, per RESUME_SESSION_2026-07-07_WATCHDOG.md's sharpened acceptance bar: the first
 * pass of this witness proved "the shape moved" (a threshold) and leaned on screenshots as evidence. A
 * screenshot only proves "looks plausible" — weaker than a numeric check, not a substitute for one. This
 * version asserts HAND-DERIVED exact invariants instead: the fixed anchor doesn't move AT ALL (bit-level),
 * the pinned edge's length matches the typed value exactly, and the rect/square constraint EQUATIONS
 * (perpendicularity = zero dot product, parallelism = zero cross product) hold to solver precision on the
 * ACTUAL returned points — computed independently in this file's own maths, not re-read from the solver's
 * own log line. This is the same rigor as M5's 90°-bend-to-135.0000°-yaw proof (WalkerDoctrine.md §7):
 * recomputed independently, not eyeballed. Screenshots are still taken (useful for a human skim) but are
 * not cited as proof of any K-numbered claim below.
 *   K1 MODE-RECT        — Constrain cycles to rect.
 *   K2 DIM-SHOWN         — #dim-w/#dim-h appear once the 4th point closes a quad, prefilled with current W/H.
 *   K3 WIDTH-EXACT       — typing a new width (real click+type+Enter) sets |p1-p0| to EXACTLY that value.
 *   K4 ANCHOR-FIXED      — p0 (the solver's `fixed:true` point) is BIT-IDENTICAL before/after the edit.
 *   K5 PERP-L0-L1        — (p1-p0)·(p2-p1) ≈ 0 (right angle actually holds, not assumed).
 *   K6 PAR-L0-L2         — cross((p1-p0),(p2-p3)) ≈ 0, normalized (opposite edge actually parallel).
 *   K7 PAR-L1-L3         — cross((p2-p1),(p0-p3)) ≈ 0, normalized.
 *   K8 RECT-EQUAL-SIDES  — |L0|==|L2| and |L1|==|L3| (a geometric CONSEQUENCE of K5+K6+K7 on a closed
 *                          quad, not a separate constraint — proves the consequence actually holds numerically).
 *   K9-K13               — SAME rigor, now editing #dim-h (height) too, on top of the already-pinned width
 *                          (disclosed gap from the original PR: height used the same p2p_distance mechanism
 *                          but was never independently proven the way width was) — proves both dimensions
 *                          compose (pinning one doesn't silently break the other's own pin).
 *   K14-K18              — l2l_angle_ll corner-angle constraint (generalizes the old hardcoded
 *                          perpendicular_ll into a typed angle — unlocks skewed/parallelogram profiles,
 *                          not just rectangles). FOUND+FIXED before this witness was written: l2l_angle_ll's
 *                          own "angle" measures the TURN between L0/L1's direction vectors, not the
 *                          polygon's INTERIOR corner a user means by "70° corner" — they're supplementary
 *                          (180-x), invisible at 90° (self-complementary), only caught by actually typing a
 *                          non-90° value (70°) and measuring independently (first attempt: typed 70,
 *                          measured 110). bonsai_sketch.js now complements internally (`180 - angleDeg`);
 *                          this witness recomputes the interior angle itself, not reused from the fix.
 *   K19 EXTRUDE-BBOX-EXACT — the authored solid's bbox equals the HAND-COMPUTED bbox of the same 4 solved
 *                          points (independent of whatever angle the solver picked) — proves Extrude
 *                          carries the solved profile through faithfully, width+height+angle all edited.
 *                          §SKETCH_DIM_BBOX logged.
 */
'use strict';
const { runE2E } = require('./e2e_harness');

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

runE2E('W-E2E-SKETCH-DIMS', async (t) => {
  await t.open('Duplex'); await t.shot('01-open');

  const S = 3.0;
  const [x0, y0] = await t.clearGround(S + 0.6);
  const corners = [[x0, y0], [x0 + S, y0], [x0 + S, y0 + S], [x0, y0 + S]];

  await t.clickSel('#b-sketch'); await t.sleep(300);
  await t.clickSel('#b-constrain'); await t.sleep(150);
  const mode1 = await t.pg.evaluate(() => window.Bonsai.sketch.mode);
  t.assert('K1 MODE-RECT (constrain cycled to rect)', mode1 === 'rect', 'mode=' + mode1);

  await t.overheadTo(x0 + S / 2, y0 + S / 2, 14);
  for (const [wx, wy] of corners) {
    const p = await t.proj(wx, wy, 0);
    await t.pg.mouse.move(p[0], p[1]); await t.sleep(40);
    await t.pg.mouse.down(); await t.sleep(40); await t.pg.mouse.up(); await t.sleep(150);
  }
  await t.sleep(300);
  await t.shot('02-quad-drawn');

  const before = await t.pg.evaluate(() => ({
    w: document.getElementById('dim-w').style.display, h: document.getElementById('dim-h').style.display,
    wVal: document.getElementById('dim-w').value, hVal: document.getElementById('dim-h').value,
    pts: window.Bonsai.sketch.points.map(p => [p.x, p.y]),
  }));
  t.assert('K2 DIM-SHOWN (W/H inputs visible, prefilled with current length)',
    before.w !== 'none' && before.h !== 'none' && Math.abs(parseFloat(before.wVal) - S) < 0.05,
    'display=[' + before.w + ',' + before.h + '] wVal=' + before.wVal + ' hVal=' + before.hVal);
  console.log('§SKETCH_DIM_BEFORE pts=' + JSON.stringify(before.pts));

  // Real mouse click (focus) + real keyboard input (type + Enter) — the actual user path, not window.evaluate.
  const NEW_W = (parseFloat(before.wVal) + 2).toFixed(2);
  await t.pg.click('#dim-w', { clickCount: 3 });
  await t.pg.keyboard.type(NEW_W);
  await t.pg.keyboard.press('Enter');
  await t.sleep(400);
  await t.shot('03-width-edited');

  const after = await t.pg.evaluate(() => ({
    pts: window.Bonsai.sketch.points.map(p => [p.x, p.y]),
  }));
  console.log('§SKETCH_DIM_AFTER pts=' + JSON.stringify(after.pts) + ' typedWidth=' + NEW_W);

  const [p0, p1, p2, p3] = after.pts;
  const [p0b] = before.pts;

  const edge0 = len(p0, p1);
  t.assert('K3 WIDTH-EXACT (|p1-p0| equals the typed value exactly)', Math.abs(edge0 - parseFloat(NEW_W)) < 1e-3,
    'edge0=' + edge0.toFixed(6) + ' typed=' + NEW_W);

  const anchorDrift = Math.hypot(p0[0] - p0b[0], p0[1] - p0b[1]);
  t.assert('K4 ANCHOR-FIXED (p0 bit-identical before/after — the solver`s own fixed:true point)', anchorDrift < 1e-9,
    'p0before=' + JSON.stringify(p0b) + ' p0after=' + JSON.stringify(p0) + ' drift=' + anchorDrift.toExponential(2));

  const v01 = sub(p1, p0), v12 = sub(p2, p1), v23 = sub(p3, p2), v30 = sub(p0, p3);
  const e0 = Math.hypot(v01[0], v01[1]), e1 = Math.hypot(v12[0], v12[1]);
  const perpDot = dot(v01, v12) / (e0 * e1);   // normalized: cos(angle) between L0 and L1 — 0 iff exactly perpendicular
  t.assert('K5 PERP-L0-L1 ((p1-p0)·(p2-p1) normalized ≈ 0 — a real right angle, not assumed)', Math.abs(perpDot) < 1e-4,
    'normalizedDot=' + perpDot.toExponential(3));

  // parallel(a,b) iff cross(a,b) == 0; normalize by |a||b| so the tolerance is angle-scale, not length-scale.
  const e2 = Math.hypot(v23[0], v23[1]), e3 = Math.hypot(v30[0], v30[1]);
  const parL0L2 = cross(v01, [-v23[0], -v23[1]]) / (e0 * e2);   // L2 direction p2->p3 is -v23; compare to L0
  t.assert('K6 PAR-L0-L2 (opposite edge normalized cross ≈ 0 — actually parallel)', Math.abs(parL0L2) < 1e-4,
    'normalizedCross=' + parL0L2.toExponential(3));
  const parL1L3 = cross(v12, [-v30[0], -v30[1]]) / (e1 * e3);
  t.assert('K7 PAR-L1-L3 (opposite edge normalized cross ≈ 0 — actually parallel)', Math.abs(parL1L3) < 1e-4,
    'normalizedCross=' + parL1L3.toExponential(3));

  // On a closed quad, perpendicular-adjacent + parallel-opposite pairs FORCE a rectangle: opposite sides
  // equal is then a geometric CONSEQUENCE, not a separately-pinned constraint — check it actually lands.
  t.assert('K8 RECT-EQUAL-SIDES (|L0|==|L2| and |L1|==|L3|, forced by K5-K7 on a closed quad)',
    Math.abs(e0 - e2) < 1e-3 && Math.abs(e1 - e3) < 1e-3,
    'e0=' + e0.toFixed(4) + ' e2=' + e2.toFixed(4) + '  e1=' + e1.toFixed(4) + ' e3=' + e3.toFixed(4));

  // ── Now edit #dim-h too, on TOP of the already-pinned width — closes the disclosed gap (height used the
  // same mechanism but was never independently proven) and proves the two dimensions COMPOSE.
  const beforeH = await t.pg.evaluate(() => document.getElementById('dim-h').value);
  const NEW_H = (parseFloat(beforeH) + 1.5).toFixed(2);
  await t.pg.click('#dim-h', { clickCount: 3 });
  await t.pg.keyboard.type(NEW_H);
  await t.pg.keyboard.press('Enter');
  await t.sleep(400);
  await t.shot('03b-height-edited');

  const after2 = await t.pg.evaluate(() => ({ pts: window.Bonsai.sketch.points.map(p => [p.x, p.y]) }));
  console.log('§SKETCH_DIM_AFTER2 pts=' + JSON.stringify(after2.pts) + ' typedHeight=' + NEW_H);
  const [q0, q1, q2, q3] = after2.pts;

  const edge0b = len(q0, q1), edge1b = len(q1, q2);
  t.assert('K9 HEIGHT-EXACT (|p2-p1| equals the typed value exactly)', Math.abs(edge1b - parseFloat(NEW_H)) < 1e-3,
    'edge1=' + edge1b.toFixed(6) + ' typed=' + NEW_H);
  t.assert('K10 WIDTH-STILL-PINNED (editing height did not disturb the earlier width pin)', Math.abs(edge0b - parseFloat(NEW_W)) < 1e-3,
    'edge0=' + edge0b.toFixed(6) + ' stillWanted=' + NEW_W);

  const anchorDrift2 = Math.hypot(q0[0] - p0b[0], q0[1] - p0b[1]);
  t.assert('K11 ANCHOR-STILL-FIXED (p0 bit-identical after BOTH edits)', anchorDrift2 < 1e-9,
    'p0before=' + JSON.stringify(p0b) + ' p0after2=' + JSON.stringify(q0) + ' drift=' + anchorDrift2.toExponential(2));

  const w01 = sub(q1, q0), w12 = sub(q2, q1), w23 = sub(q3, q2), w30 = sub(q0, q3);
  const f0 = Math.hypot(w01[0], w01[1]), f1 = Math.hypot(w12[0], w12[1]), f2 = Math.hypot(w23[0], w23[1]), f3 = Math.hypot(w30[0], w30[1]);
  const perpDot2 = dot(w01, w12) / (f0 * f1);
  t.assert('K12 PERP-STILL-HOLDS (right angle survives pinning BOTH edges independently)', Math.abs(perpDot2) < 1e-4,
    'normalizedDot=' + perpDot2.toExponential(3));
  t.assert('K13 RECT-EQUAL-SIDES-BOTH-PINNED (|L0|==|L2|==typedW, |L1|==|L3|==typedH)',
    Math.abs(f0 - f2) < 1e-3 && Math.abs(f1 - f3) < 1e-3 && Math.abs(f0 - parseFloat(NEW_W)) < 1e-3 && Math.abs(f1 - parseFloat(NEW_H)) < 1e-3,
    'f0=' + f0.toFixed(4) + ' f2=' + f2.toFixed(4) + ' f1=' + f1.toFixed(4) + ' f3=' + f3.toFixed(4));

  // ── Now edit #dim-angle too, on top of the already-pinned width+height — the l2l_angle_ll generalization
  // of the old hardcoded perpendicular_ll (BONSAI_KERNEL_RESEARCH.md §GAP-TO-COMPETITIVE Tier 2). Found+
  // fixed live before this witness was written: l2l_angle_ll's own "angle" measures the TURN between L0/L1's
  // direction vectors, not the polygon's INTERIOR corner a user means — supplementary (180-x), invisible at
  // 90° (self-complementary) and only caught by actually typing a non-90 value and measuring independently
  // (typing 70 first produced a measured 110° corner). bonsai_sketch.js now complements internally; this
  // witness recomputes the interior angle itself (same atan2(|cross|,-dot) formula, independent of the
  // app's own display code) rather than trusting the fix blindly.
  const NEW_ANGLE = 70;   // deliberately far from 90 — the only way to actually exercise the turn/interior distinction
  await t.pg.click('#dim-angle', { clickCount: 3 });
  await t.pg.keyboard.type(String(NEW_ANGLE));
  await t.pg.keyboard.press('Enter');
  await t.sleep(400);
  await t.shot('03c-angle-edited');

  const after3 = await t.pg.evaluate(() => ({ pts: window.Bonsai.sketch.points.map(p => [p.x, p.y]) }));
  console.log('§SKETCH_DIM_AFTER3 pts=' + JSON.stringify(after3.pts) + ' typedAngleDeg=' + NEW_ANGLE);
  const [r0, r1, r2, r3] = after3.pts;

  const u01 = sub(r1, r0), u12 = sub(r2, r1);
  const angleDot = dot(u01, u12), angleCross = cross(u01, u12);
  const measuredAngleDeg = Math.atan2(Math.abs(angleCross), -angleDot) * 180 / Math.PI;
  t.assert('K14 ANGLE-EXACT (independently-measured interior corner == typed value, not its 180-x supplement)',
    Math.abs(measuredAngleDeg - NEW_ANGLE) < 0.05,
    'measured=' + measuredAngleDeg.toFixed(4) + ' typed=' + NEW_ANGLE);

  const g0 = len(r0, r1), g1 = len(r1, r2), g2b = len(r2, r3), g3 = len(r3, r0);
  t.assert('K15 DIMS-STILL-PINNED (width+height survive an angle edit too)',
    Math.abs(g0 - parseFloat(NEW_W)) < 1e-3 && Math.abs(g1 - parseFloat(NEW_H)) < 1e-3,
    'edge0=' + g0.toFixed(4) + ' wantW=' + NEW_W + '  edge1=' + g1.toFixed(4) + ' wantH=' + NEW_H);

  const anchorDrift3 = Math.hypot(r0[0] - p0b[0], r0[1] - p0b[1]);
  t.assert('K16 ANCHOR-STILL-FIXED (p0 bit-identical after all three edits)', anchorDrift3 < 1e-9,
    'drift=' + anchorDrift3.toExponential(2));

  // Parallelogram property (opposite sides equal) holds for ANY corner angle, not just 90° — a rectangle is
  // just the 90° special case. Proves the K8/K13 consequence generalizes, isn't secretly rectangle-only.
  t.assert('K17 PARALLELOGRAM-EQUAL-SIDES (|L0|==|L2|, |L1|==|L3| — holds at 70°, not just 90°)',
    Math.abs(g0 - g2b) < 1e-3 && Math.abs(g1 - g3) < 1e-3,
    'g0=' + g0.toFixed(4) + ' g2=' + g2b.toFixed(4) + '  g1=' + g1.toFixed(4) + ' g3=' + g3.toFixed(4));

  // The OTHER 3 corners of a parallelogram are forced too: DIAGONALLY-opposite corners are EQUAL (p3 is
  // opposite p1 in a p0-p1-p2-p3 quad), ADJACENT corners are SUPPLEMENTARY (p2 shares edge L1 with p1) — a
  // real geometric consequence of "opposite sides parallel", checked independently, not assumed. (First
  // draft of this check mislabeled p2 as "opposite" p1 — it's adjacent; caught by the assertion failing
  // with the exact supplementary value 110°=180-70, not a random number, which is what made the labeling
  // error obvious rather than a real bug.)
  const u23 = sub(r3, r2), angleAtP2 = Math.atan2(Math.abs(cross(u12, u23)), -dot(u12, u23)) * 180 / Math.PI;
  const u30 = sub(r0, r3), angleAtP3 = Math.atan2(Math.abs(cross(u23, u30)), -dot(u23, u30)) * 180 / Math.PI;
  t.assert('K18 PARALLELOGRAM-CORNER-RELATIONS (diagonal-opposite p3==typed, adjacent p2==180-typed)',
    Math.abs(angleAtP3 - NEW_ANGLE) < 0.05 && Math.abs(angleAtP2 - (180 - NEW_ANGLE)) < 0.05,
    'angleAtP3=' + angleAtP3.toFixed(4) + ' (want ' + NEW_ANGLE + ')  angleAtP2=' + angleAtP2.toFixed(4) + ' (want ' + (180 - NEW_ANGLE) + ')');

  await t.pg.click('#dim-depth', { clickCount: 3 }); await t.pg.keyboard.type('3');
  const opsBefore = await t.oplog();
  await t.clickSel('#b-extrude'); await t.sleep(600);
  const opsAfter = await t.oplog(); const lastOp = await t.lastOp();
  const bbox = await t.pg.evaluate((fid) => {
    const g = window.Bonsai.group(); const m = g.children.find(o => o.isMesh && o.userData.featureId === fid);
    if (!m) return null;
    const b = new window.THREE.Box3().setFromObject(m); const s = new window.THREE.Vector3(); b.getSize(s);
    return [s.x, s.y, s.z];
  }, lastOp.id);
  // Hand-compute the EXPECTED bbox from the same 4 solved points (independent of whatever angle the
  // solver picked) — this isolates "did Extrude faithfully carry the profile" from "is the profile
  // axis-aligned" (it need not be; rect mode only constrains angles+one length, not orientation).
  const xs = [r0[0], r1[0], r2[0], r3[0]], ys = [r0[1], r1[1], r2[1], r3[1]];
  const expected = [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 3];
  console.log('§SKETCH_DIM_BBOX fid=' + lastOp.id + ' actual=' + JSON.stringify(bbox) +
    ' expected=' + JSON.stringify(expected) + ' opsLen=' + opsBefore.len + '->' + opsAfter.len);
  const bboxOk = bbox && Math.abs(bbox[0] - expected[0]) < 5e-3 && Math.abs(bbox[1] - expected[1]) < 5e-3 && Math.abs(bbox[2] - expected[2]) < 5e-3;
  t.assert('K19 EXTRUDE-BBOX-EXACT (authored solid bbox == hand-computed bbox of the solved points, W+H+angle all edited)',
    opsAfter.len === opsBefore.len + 1 && bboxOk,
    'actual=' + JSON.stringify(bbox) + ' expected=' + JSON.stringify(expected) + ' opsLen ' + opsBefore.len + '->' + opsAfter.len);
  await t.shot('04-extruded');
});
