#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-ZOOMSEL scope (read this block first)
 * SCOPE: real-user witness for §ZOOM-SEL (prompts/MODELLER_ZOOM_TO_SELECTION.md in bim-compiler) — the port
 *   of the Viewer Find panel's zoom-to-frame-selection camera fly (_lerpCam/_fitDistForBox) into the
 *   Modeller, Z-up adapted. Real production path: open Duplex, REAL canvas clicks, hand-COMPUTED expected
 *   camera end positions (same frustum-fit math re-derived independently in Node, no THREE), projected
 *   on-screen size measured before/after. Read the log after every run; exit code is not evidence.
 *
 * Issues under test (each K names the issue it proves or disproves):
 *   K1 SELECT-TRIGGERS-FLY — a real canvas click that selects an element starts a camera fly (§ZOOM-SEL fill
 *                     logged). Was: zero camera-focus code in modeller.html — selection never framed anything.
 *   K2 END-POSITION-MATHS — the camera's settled position equals the HAND-COMPUTED expected end
 *                     (center + normalize(1,-1,1.3)·fitDist, fitDist re-derived in Node from the element's
 *                     real bbox + fov/aspect) within 1e-3 per axis. Proves the frustum-fit port is exact,
 *                     not "camera moved somewhere".
 *   K3 Z-UP-ADAPTATION — the hand-computed Z-up basis up-vector (fwd×(0,0,1) → right×fwd) matches the
 *                     camera's ACTUAL world up-axis (matrixWorld col-1) with dot > 0.999, while the Viewer's
 *                     original Y-up basis (up=(0,1,0)) does NOT (dot < 0.9). Proves the adaptation was
 *                     load-bearing, not cosmetic — blind-copying the Viewer constants would misfit the frame.
 *   K4 FILLS-VIEWPORT — the selected element's on-screen projected bbox is measurably larger after the fly
 *                     than before, and its max dimension lands in a sane fill band (0.45..1.35 of viewport)
 *                     — the "genuinely closer to filling the viewport" claim, measured not eyeballed.
 *   K5 RE-TRIGGER — selecting a SECOND, different element flies to the NEW hand-computed end (not stuck on
 *                     the first target); the two ends are genuinely different points.
 *   K6 FLY-YIELD — grabbing/dragging the OrbitControls mid-fly cancels the in-flight animation (§ZOOM-SEL
 *                     yield logged) and the camera does NOT arrive at the cancelled fly's end position.
 *   K7 EMPTY-NOOP — clearing the selection starts NO fly (no new §ZOOM-SEL fill line) and leaves the camera
 *                     where it was (the empty-selection guard).
 *   +  NO-ERROR — no pageerror across the whole sequence (harness-added).
 */
'use strict';
const { runE2E } = require('./e2e_harness');

// ── hand-derived maths (plain Node, NO THREE) — must mirror modeller.html §ZOOM-SEL exactly ─────
const norm = v => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const DIR = norm([1, -1, 1.3]);                       // the Modeller's witnessed CLASSIC iso dir (Z-up)
function basisFor(worldUp) {                          // right/up basis for a camera at +DIR looking -DIR
  const fwd = [-DIR[0], -DIR[1], -DIR[2]];
  const right = norm(cross(fwd, worldUp));
  const up = cross(right, fwd);
  return { fwd, right, up };
}
function fitDist(size, fov, aspect, worldUp) {        // re-derivation of _fitDistForBox
  const { fwd, right, up } = basisFor(worldUp);
  const h = [size[0] / 2, size[1] / 2, size[2] / 2];
  let hW = 0, hH = 0, hD = 0;
  for (let sx = -1; sx <= 1; sx += 2) for (let sy = -1; sy <= 1; sy += 2) for (let sz = -1; sz <= 1; sz += 2) {
    const c = [sx * h[0], sy * h[1], sz * h[2]];
    hW = Math.max(hW, Math.abs(dot(c, right))); hH = Math.max(hH, Math.abs(dot(c, up))); hD = Math.max(hD, Math.abs(dot(c, fwd)));
  }
  const tanV = Math.tan(fov * Math.PI / 360), tanH = tanV * aspect;
  return (Math.max(hH / tanV, hW / tanH) + hD * 0.3) * 1.03;
}
const expectedEnd = (c, dist) => [c[0] + DIR[0] * dist, c[1] + DIR[1] * dist, c[2] + DIR[2] * dist];
const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const f3 = a => a.map(x => x.toFixed(3)).join(',');

runE2E('W-E2E-ZOOMSEL', async (t) => {
  await t.open('Duplex');
  const pg = t.pg, sleep = t.sleep;
  const camPos = () => pg.evaluate(() => window.A.camera.position.toArray());
  const camMeta = await pg.evaluate(() => ({ fov: window.A.camera.fov, aspect: window.A.camera.aspect }));
  const vw = pg.viewport().width, vh = pg.viewport().height;
  const selBoxOf = () => pg.evaluate(() => {          // same union shape as modeller.html selBox()
    const g = window.Bonsai.group(); const sel = window.Bonsai._selSet || new Set();
    const ms = g.children.filter(o => o.isMesh && sel.has(o.userData.featureId));
    const b = new window.THREE.Box3(); ms.forEach(m => { m.geometry.computeBoundingBox(); b.expandByObject(m); });
    if (!isFinite(b.min.x)) return null;
    const c = new window.THREE.Vector3(), s = new window.THREE.Vector3(); b.getCenter(c); b.getSize(s);
    return { c: c.toArray(), s: s.toArray() };
  });
  // Wait for fly completion via the whitebox oracle (window.__flyLive) — headless-swiftshader rAF runs at
  // ~14fps with 600ms stalls (measured), so wall-clock camera sampling alone false-settles mid-fly. Then
  // wait out the OrbitControls damping tail with two consecutive stable samples.
  async function settle(maxMs) {
    const t0 = Date.now(); maxMs = maxMs || 20000;
    while (Date.now() - t0 < maxMs && await pg.evaluate(() => !!window.__flyLive)) await sleep(120);
    // damping tail decays EXPONENTIALLY (slow creep can pass a single loose sample-pair) — require THREE
    // consecutive near-zero deltas at a tight threshold before calling the camera quiescent
    let prev = await camPos(), stable = 0;
    while (stable < 3 && Date.now() - t0 < maxMs) {
      await sleep(300);
      const cur = await camPos();
      if (d3(cur, prev) < 2e-5) stable++; else stable = 0;
      prev = cur;
    }
    return prev;
  }
  const zoomLogs = () => t.slog.filter(l => l.startsWith('§ZOOM-SEL fill')).length;

  // ── K1: real click selects → fly starts ───────────────────────────────────────────────────────
  const pos0 = await camPos();
  const logs0 = zoomLogs();
  // precompute BEFORE screen bboxes for every clickable candidate (camera flies the instant one is selected,
  // so "before" must be captured up front)
  const cands = await pg.evaluate(() => window.__e2e.candidates());
  const beforeBB = {};
  for (const c of cands.slice(0, 12)) beforeBB[c.fid] = await t.bboxScreen(c.fid);
  const picked = await t.pick();
  t.assert('K1 SELECT-TRIGGERS-FLY (real click selected + §ZOOM-SEL fill logged)',
    !!picked && zoomLogs() > logs0,
    picked ? 'fid=' + picked.fid + ' zoomLogs=' + zoomLogs() : 'no pickable element');
  if (!picked) return;

  // ── K2: settled camera position == hand-computed end ─────────────────────────────────────────
  const end1cam = await settle();
  const box1 = await selBoxOf();
  const dist1 = fitDist(box1.s, camMeta.fov, camMeta.aspect, [0, 0, 1]);
  const exp1 = expectedEnd(box1.c, dist1);
  t.assert('K2 END-POSITION-MATHS (|cam-expected| < 1e-3 per axis)',
    Math.abs(end1cam[0] - exp1[0]) < 1e-3 && Math.abs(end1cam[1] - exp1[1]) < 1e-3 && Math.abs(end1cam[2] - exp1[2]) < 1e-3,
    'cam=(' + f3(end1cam) + ') expected=(' + f3(exp1) + ') dist=' + dist1.toFixed(3));

  // ── K3: Z-up basis adaptation is the camera's REAL screen-up; the Viewer's Y-up basis is not ──
  const camUpAxis = await pg.evaluate(() => { const e = window.A.camera.matrixWorld.elements; return [e[4], e[5], e[6]]; });
  const upZ = norm(basisFor([0, 0, 1]).up), upY = norm(basisFor([0, 1, 0]).up), cu = norm(camUpAxis);
  const dZ = dot(cu, upZ), dY = dot(cu, upY);
  t.assert('K3 Z-UP-ADAPTATION (hand Z-up basis == camera up-axis; Y-up basis would be wrong)',
    dZ > 0.999 && dY < 0.9,
    'dot(camUp, ZupBasis)=' + dZ.toFixed(4) + '  dot(camUp, YupBasis)=' + dY.toFixed(4));

  // ── K4: element measurably closer to filling the viewport ────────────────────────────────────
  const bbA = await t.bboxScreen(picked.fid), bbB = beforeBB[picked.fid];
  const areaB = bbB ? bbB.width * bbB.height : 0, areaA = bbA ? bbA.width * bbA.height : 0;
  const fill = bbA ? Math.max(bbA.width / vw, bbA.height / vh) : 0;
  t.assert('K4 FILLS-VIEWPORT (projected bbox grew + max fill in 0.45..1.35)',
    areaA > areaB * 1.2 && fill > 0.45 && fill < 1.35,
    'areaBefore=' + Math.round(areaB) + 'px² areaAfter=' + Math.round(areaA) + 'px² fill=' + fill.toFixed(2));

  // ── K5: second selection re-flies to the NEW hand-computed end ───────────────────────────────
  // try a real click on a different visible element; fall back to the Outliner/programmatic entry
  // (window.Bonsai.select funnels through the same setSelectionIds) if none is cleanly clickable now
  let fid2 = null;
  const cands2 = (await pg.evaluate(() => window.__e2e.candidates())).filter(c => c.fid !== picked.fid);
  if (cands2.length) {
    await pg.mouse.move(cands2[0].sx, cands2[0].sy); await sleep(40);
    await pg.mouse.click(cands2[0].sx, cands2[0].sy); await sleep(150);
    const sel = await pg.evaluate(() => Array.from(window.Bonsai._selSet || []));
    if (sel.length === 1 && sel[0] !== picked.fid) fid2 = sel[0];
  }
  if (fid2 == null) {
    fid2 = await pg.evaluate(f1 => { const g = window.Bonsai.group();
      const m = g.children.find(o => o.isMesh && o.userData.featureId != null && o.userData.featureId !== f1);
      return m ? window.Bonsai.select(m.userData.featureId) : null; }, picked.fid);
    console.log('  (K5 second select via programmatic/Outliner entry, fid=' + fid2 + ')');
  }
  const end2cam = await settle();
  const box2 = await selBoxOf();
  const dist2 = fitDist(box2.s, camMeta.fov, camMeta.aspect, [0, 0, 1]);
  const exp2 = expectedEnd(box2.c, dist2);
  t.assert('K5 RE-TRIGGER (2nd element → new hand-computed end, different from 1st)',
    fid2 != null && fid2 !== picked.fid && d3(end2cam, exp2) < 2e-3 && d3(exp2, exp1) > 0.05,
    'fid2=' + fid2 + ' cam=(' + f3(end2cam) + ') expected=(' + f3(exp2) + ') Δends=' + d3(exp2, exp1).toFixed(2));

  // ── K6: FLY-YIELD — user grab mid-fly cancels the animation ──────────────────────────────────
  // grab point must land on the CANVAS (a side panel eats the pointerdown and OrbitControls never sees the
  // grab — measured failure mode of the first run); verify with elementFromPoint before dragging
  const grabPt = await pg.evaluate(() => {
    const cv = window.A.renderer.domElement;
    for (const [x, y] of [[cv.clientWidth - 180, 160], [cv.clientWidth - 180, cv.clientHeight - 220], [cv.clientWidth / 2, 120]])
      if (document.elementFromPoint(x, y) === cv) return [x, y];
    return [cv.clientWidth / 2, cv.clientHeight * 0.25];   // last resort: upper mid-canvas
  });
  await pg.mouse.move(grabPt[0], grabPt[1]);           // pre-position so the grab lands with minimal latency
  const fid3 = await pg.evaluate(f2 => { const g = window.Bonsai.group();
    const ms = g.children.filter(o => o.isMesh && o.userData.featureId != null && o.userData.featureId !== f2);
    return ms.length ? window.Bonsai.select(ms[ms.length - 1].userData.featureId) : null; }, fid2);
  await sleep(100);                                    // fly is ~25 rAF frames (~1.8s at headless 14fps) — grab mid-flight
  await pg.mouse.down(); await sleep(30);
  await pg.mouse.move(grabPt[0] - 220, grabPt[1] + 180, { steps: 8 }); await sleep(30);
  await pg.mouse.up();
  const end3cam = await settle();
  const box3 = await selBoxOf();
  const exp3 = expectedEnd(box3.c, fitDist(box3.s, camMeta.fov, camMeta.aspect, [0, 0, 1]));
  const yielded = t.slog.some(l => l.startsWith('§ZOOM-SEL yield'));
  t.assert('K6 FLY-YIELD (grab mid-fly → §ZOOM-SEL yield logged + camera NOT at cancelled end)',
    fid3 != null && yielded && d3(end3cam, exp3) > 0.2,
    'fid3=' + fid3 + ' yieldLogged=' + yielded + ' |cam-cancelledEnd|=' + d3(end3cam, exp3).toFixed(3));

  // ── K7: empty selection = guarded no-op ───────────────────────────────────────────────────────
  const logs7 = zoomLogs(), pos7 = await camPos();
  await pg.evaluate(() => window.Bonsai.select(null));
  await sleep(450);
  const pos7b = await camPos();
  t.assert('K7 EMPTY-NOOP (deselect → no new fly, camera untouched)',
    zoomLogs() === logs7 && d3(pos7, pos7b) < 1e-3,
    'zoomLogs=' + zoomLogs() + '/' + logs7 + ' camDrift=' + d3(pos7, pos7b).toFixed(5));

  await t.shot('final');
});
