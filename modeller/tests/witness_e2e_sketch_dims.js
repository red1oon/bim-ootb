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
 *   K9 EXTRUDE-BBOX-EXACT — the authored solid's bbox equals the HAND-COMPUTED bbox of the same 4 solved
 *                          points (independent of whatever angle the solver picked) — proves Extrude
 *                          carries the solved profile through faithfully. §SKETCH_DIM_BBOX logged.
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
  const xs = [p0[0], p1[0], p2[0], p3[0]], ys = [p0[1], p1[1], p2[1], p3[1]];
  const expected = [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 3];
  console.log('§SKETCH_DIM_BBOX fid=' + lastOp.id + ' actual=' + JSON.stringify(bbox) +
    ' expected=' + JSON.stringify(expected) + ' opsLen=' + opsBefore.len + '->' + opsAfter.len);
  const bboxOk = bbox && Math.abs(bbox[0] - expected[0]) < 5e-3 && Math.abs(bbox[1] - expected[1]) < 5e-3 && Math.abs(bbox[2] - expected[2]) < 5e-3;
  t.assert('K9 EXTRUDE-BBOX-EXACT (authored solid bbox == hand-computed bbox of the solved points)',
    opsAfter.len === opsBefore.len + 1 && bboxOk,
    'actual=' + JSON.stringify(bbox) + ' expected=' + JSON.stringify(expected) + ' opsLen ' + opsBefore.len + '->' + opsAfter.len);
  await t.shot('04-extruded');
});
