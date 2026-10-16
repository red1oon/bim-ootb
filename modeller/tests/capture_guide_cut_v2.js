#!/usr/bin/env node
/**
 * capture_guide_cut_v2.js — recapture cut-select.png/cut-open.png (round 6, guide screenshot mission).
 *
 * Round 5 (this same worktree's capture_guide_cut.js) proved the CUT itself works end-to-end on fid=87
 * (Duplex's richest 7-layer party wall) but could never land a legible crop: frameElement's dolly-along-
 * inherited-camera-direction (whatever #b-fit's default isometric view happened to be) either grazed
 * Duplex's sloped roof (flat gray) or produced a screen-space-AABB sliver (bboxScreen loose-fits a
 * rotated/isometric box, so a thin wall's true silhouette is much smaller than its AABB).
 *
 * This round: switched to a MANUALLY PLACED interior camera (the "closeCam" pattern already proven by
 * witness_e2e_gridmove_real.js's §CAMERA-LESSON, round 1 of this same guide-recapture saga) instead of
 * frameElement's auto-dolly. Numerically explored 4 candidates x up to 6 camera placements each (see
 * capture_probe_candidates.js, diag_closecam_orient.js, diag_closecam_v2/v3.js, diag_center_probe.js in
 * this same worktree for the full search log): fid=87 (0.55x2.2m footprint) sits almost exactly at
 * Duplex's own bbox centroid (a party-wall spine) and is enclosed too tightly for ANY 1.2-2.8m offset in
 * either axis/sign to clear neighbouring solids -- every attempt landed the camera embedded in an
 * adjacent wall/slab (flat solid-colour frame). fid=88 (a longer 4.2x0.49m wall) stepped fully OUTSIDE
 * the building envelope on the room-ward-computed sign at 1.2-2.8m (distant thin roofline against sky/
 * ground). fid=89 (0.12x2.92m partition, 3 layers, real-layer-seedable -- same cut-eligible population
 * §LAYER-SOLID-SEED / CUT_GATE_CSG_SPEC.md opened up) is the only candidate of the 4 probed that produced
 * a legible interior frame: offset -1.2m along its thin (X) axis lands the camera in the adjacent room,
 * clear of both the roof and neighbouring solids, showing real geometry (a door jamb, floor plane, wall
 * edge) -- matching this guide's own established bar for "real interior" shots (see
 * docs/img/modeller/grid-editor-before.png, similarly not photorealistic but recognizably real geometry).
 * Full-page t.shot() (not shotClip) is used, per round-1's own note that bboxScreen's 8-corner AABB is
 * unreliable at this close a grazing angle -- shotClip was the exact mechanism that produced the round-5
 * sliver bug, so this round avoids it entirely for the closeCam shots (same choice already proven live in
 * grid-editor-before/after.png and room-move.png, all closeCam + full-page, all currently embedded).
 */
'use strict';
const { runE2E } = require('./e2e_harness');
const FID = 89;
const tris = (t, fid) => t.pg.evaluate((f) => {
  const g = window.Bonsai.group(); const m = g.children.find(o => o.isMesh && o.userData.featureId === f);
  if (!m) return null; const idx = m.geometry.index; return idx ? idx.count / 3 : (m.geometry.attributes.position.count / 3);
}, fid);
// §RACE-FIX (round 6, after repeated flaky/flat captures at this exact camera distance): closeCam only
// called window.A.requestRender() -- if that just arms a debounced/rAF-scheduled redraw rather than
// rendering synchronously, puppeteer's screenshot() can grab the buffer BEFORE that redraw fires,
// capturing a stale (often near-flat, mid-transition) frame. Force a SYNCHRONOUS renderer.render() call
// right here, in the same evaluate(), so the GPU buffer is guaranteed current before we ever return to
// node and call pg.screenshot() -- closes the race at its source instead of guessing sleep durations or
// retrying whole browser sessions.
const closeCamX = (t, fid, off) => t.pg.evaluate((f, o) => {
  const cam = window.A.camera, ctl = window.A.controls;
  const g = window.Bonsai.group(); const m = g.children.find(x => x.isMesh && x.userData.featureId === f);
  const c = new window.THREE.Vector3(); new window.THREE.Box3().setFromObject(m).getCenter(c);
  cam.up.set(0, 0, 1);
  cam.position.set(c.x + o, c.y, c.z);
  ctl.target.set(c.x, c.y, c.z);
  ctl.update();
  window.A.renderer.render(window.A.scene, window.A.camera);
  if (window.A.requestRender) window.A.requestRender();
}, fid, off);
const forceRender = (t) => t.pg.evaluate(() => { window.A.renderer.render(window.A.scene, window.A.camera); });

runE2E('CAPTURE-CUT-V2', async (t) => {
  await t.open('Duplex');

  // Confirm fid=89 is still in the real-layer-seedable cut-eligible pool (not a box, not refused) --
  // same check capture_guide_cut.js's own §CAPTURE-POOL used, re-run here so this script is self-
  // contained and doesn't silently drift if the pool changes.
  const eligible = await t.pg.evaluate((f) => {
    const ops = window.Bonsai.oplog._geomOps();
    const op = ops.find(o => o.id === f);
    if (!op || op.op_type !== 'GEOM_INSERT') return { ok: false, reason: 'not-insert' };
    let boxOk = false, layerSeed = null;
    try { boxOk = !!window.Bonsai._insertCutBox(op); } catch (e) {}
    if (boxOk) return { ok: false, reason: 'is-box' };
    try { layerSeed = window.Bonsai._insertCutLayerSeed(op); } catch (e) {}
    return { ok: !!layerSeed, nLayers: layerSeed && layerSeed.layers.length };
  }, FID);
  t.assert('ELIGIBLE (fid=' + FID + ' is real-layer-seedable, not box)', eligible.ok, JSON.stringify(eligible));

  // §V2-RETRY (escalated twice): neither a small nor a large fixed settle-time reliably fixed this
  // camera placement taken straight after select() -- two runs at the SAME 1.2m offset gave two
  // DIFFERENT broken results (flat/distant one run, a tiny sliver of stairs the next), while
  // diag_closecam_v2.js's run -- which cycled through 3 OTHER fids (88,87,85) before reaching 89 -- was
  // the one clean result found across the whole search. Not fully root-caused (possibly a lazy
  // LOD/texture warm-up that only completes after the renderer has done a few real frames of work on
  // OTHER parts of the scene, not just elapsed wall-clock time on this one). Pragmatic fix: replicate
  // that priming step directly -- touch a couple of other fids first, then do the real fid=89 sequence.
  for (const primeFid of [88]) {
    await t.pg.evaluate((f) => window.Bonsai.select(f), primeFid);
    await t.flySettle();
    await closeCamX(t, primeFid, -1.2);
    await t.sleep(300);
  }

  await t.pg.evaluate((f) => window.Bonsai.select(f), FID);
  await t.flySettle();
  const sel = await t.pg.evaluate((f) => Array.from(window.Bonsai._selSet || []).includes(f), FID);
  t.assert('SEL (fid=' + FID + ' selected)', sel, 'fid=' + FID);

  await closeCamX(t, FID, -1.2);
  await t.sleep(400);
  await closeCamX(t, FID, -1.2);
  await t.sleep(400);
  const tw0 = await tris(t, FID);
  await forceRender(t);
  await t.shot('cut-select');

  await t.clickSel('#b-cut');
  let tw1 = tw0;
  for (let i = 0; i < 20 && tw1 === tw0; i++) { await t.sleep(500); tw1 = await tris(t, FID); }
  const last = await t.lastOp();
  const chain = await t.verifyChain();

  // Re-place closeCam post-cut. Same priming trick as pre-cut (touch other fids first) -- the flakiness
  // moved from the select-shot to THIS shot on the run that fixed the first one, confirming it's a
  // genuine per-shot render race, not something fixed once for the whole session.
  for (const primeFid of [88]) {
    await t.pg.evaluate((f) => window.Bonsai.select(f), primeFid);
    await t.flySettle();
    await closeCamX(t, primeFid, -1.2);
    await t.sleep(300);
  }
  await t.pg.evaluate((f) => window.Bonsai.select(f), FID);
  await t.flySettle();
  await closeCamX(t, FID, -1.2);
  await t.sleep(400);
  await closeCamX(t, FID, -1.2);
  await t.sleep(400);
  await forceRender(t);
  await t.shot('cut-open');

  t.assert('CUT-COMMIT (one GEOM_CUT on the partition wall)', last && last.op_type === 'GEOM_CUT' && last.parameters && last.parameters.parent === FID,
    'op=' + (last && last.op_type) + ' parent=' + (last && last.parameters && last.parameters.parent));
  t.assert('CHAIN-OK (verifyChain)', chain === true, 'verifyChain=' + chain);
  t.assert('GEOMETRY-CHANGED (real void subtracted -- tri count changed)', tw0 !== tw1, 'tris ' + tw0 + '->' + tw1);
  console.log('  §CAPTURE-SUMMARY fid=' + FID + ' tris ' + tw0 + '->' + tw1);
}, { width: 1200, height: 850, dpr: 2 });
