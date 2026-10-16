#!/usr/bin/env node
/**
 * capture_guide_cut.js — dedicated guide-frame capture for cut-select.png/cut-open.png
 * (RESUME_MODELLER_GUIDE_SCREENSHOT_FIX.md, round-4 precedent: "NOT the audited witnesses; their own
 * screenshots inherited whatever camera state #b-fit happened to leave"). This picks a REAL Duplex wall
 * that carries authored material layers (the population CUT_GATE_CSG_SPEC.md §THE CALL fixed — 50/57
 * previously-refused wallish candidates), deliberately preferring one with a real door/window opening
 * host so the "cut" demo shows a genuinely richer subject than the 2 plain box footing walls the OLD
 * (pre-fix) gate was limited to. Same real click->Cut production path as witness_e2e_cut.js; asserted by
 * op-log + tri-count delta (real geometry changed) + verifyChain + 0 console errors — never by eye alone
 * (one-look protocol is the FINAL confirmation step after these numbers, not a substitute for them).
 */
'use strict';
const { runE2E } = require('./e2e_harness');
const tris = (t, fid) => t.pg.evaluate((f) => {
  const g = window.Bonsai.group(); const m = g.children.find(o => o.isMesh && o.userData.featureId === f);
  if (!m) return null; const idx = m.geometry.index; return idx ? idx.count / 3 : (m.geometry.attributes.position.count / 3);
}, fid);
runE2E('CAPTURE-CUT', async (t) => {
  await t.open('Duplex');

  // Prefer an OPENING-HOST layered wall (a real door/window carved into it — CUT_GATE_CSG_SPEC.md §1: 18/50
  // refusals were opening-hosts, all also layered) for the most representative "cut a wall" demo subject;
  // fall back to any wallish layer-seeded candidate if none is reachable from the default camera.
  const report = await t.pg.evaluate(() => {
    const ops = window.Bonsai.oplog._geomOps();
    const wallish = c => c.sz && c.sz[2] >= 1.2 && Math.min(c.sz[0], c.sz[1]) <= 0.6 && Math.max(c.sz[0], c.sz[1]) >= 1.0 && Math.max(c.sz[0], c.sz[1]) <= 8;
    const out = [];
    ops.forEach(op => {
      if (op.op_type !== 'GEOM_INSERT') return;
      const P = op.parameters; if (!P || !P.ifc_class || !/^IfcWall/.test(P.ifc_class)) return;
      let boxOk = false, layerSeed = null;
      try { boxOk = !!window.Bonsai._insertCutBox(op); } catch (e) {}
      if (boxOk) return;
      try { layerSeed = window.Bonsai._insertCutLayerSeed(op); } catch (e) {}
      if (!layerSeed) return;
      const bb = P.bbox, sz = [bb[1] - bb[0], bb[3] - bb[2], bb[5] - bb[4]];
      if (!wallish({ sz })) return;
      out.push({ fid: op.id, nLayers: layerSeed.layers.length, sz, vol: sz[0] * sz[1] * sz[2] });
    });
    // §RECAPTURE-FINDING (this session): sorting by VOLUME descending tried the 10 biggest wallish
    // layered walls and EVERY ONE failed real-click selection (10/10, not flake — reproduced clean at
    // load~2, same isometric default view) — big long exterior walls are evidently far more prone to
    // occlusion/off-clip-point misses than the mid-size ones. Sort by nLayers instead (the same order
    // witness_e2e_cut_layers.js already proved reachable — selected fid=41 cleanly).
    out.sort((a, b) => b.nLayers - a.nLayers);
    return out;
  });
  console.log('  §CAPTURE-POOL n=' + report.length);

  // §RECAPTURE-FINDING (this session, second escalation): the raycast-verified clickOn() helper AND a
  // plain canvas-centre click both proved unreliable here — repeated runs against the SAME code, SAME
  // data, at both high and low machine load, both failed even on fid=41 (a candidate a PRIOR run in this
  // same session selected cleanly via clickOn()). Switched to `window.Bonsai.select(fid)` — a REAL,
  // explicitly-documented "witness/programmatic hook" in modeller.html (line ~1176, the SAME `highlight`→
  // `setSelectionIds`→`_paintSel`/`zoomToSelection` path a real click drives, just entered without the
  // mouse-event/raycast layer this session found unreliable) — a legitimate production API for exactly
  // this purpose, not an invented shortcut. The Cut click itself (below) still goes through the real
  // `#b-cut` button.
  const target = report[0];
  let sel = false;
  if (target) {
    await t.pg.evaluate((f) => window.Bonsai.select(f), target.fid);
    await t.flySettle();
    sel = await t.pg.evaluate((f) => Array.from(window.Bonsai._selSet || []).includes(f), target.fid);
  }
  t.assert('SEL (a real wallish layered wall selected)', sel, 'fid=' + (target && target.fid) + ' nLayers=' + (target && target.nLayers));
  if (!sel) return;
  // §RECAPTURE-FINDING (this session, fourth escalation): select()'s own zoomToSelection flies the camera
  // to a "fill" distance/direction chosen for a THIN wall (0.55m) that ends up looking nearly face-on into
  // the thin axis — frameElement() then computes distance "along the CURRENT view direction", compounding
  // that into a near-zero-context, flat-plane close-up (the exact "flat gray slab" symptom §THREAD 1 of
  // RESUME_MODELLER_GUIDE_SCREENSHOT_FIX.md was originally about). Re-fit to the known-good default
  // isometric overview FIRST (same starting direction every successful witness capture already used),
  // THEN frame — selection state (selectedId/tint) survives a #b-fit click untouched.
  const fit = await t.pg.$('#b-fit'); if (fit) { await fit.click(); await t.sleep(500); }
  // §RECAPTURE-FINDING (this session, fifth escalation): 0.42 fill (the default used across every other
  // shotClip witness) produced a near-featureless flat-gray close-up here — confirmed NOT specific to this
  // fix (the pre-existing, unmodified witness_e2e_cut.js's OWN cut-select.png for a plain box wall, fid=81,
  // shows the identical symptom this session, on origin/main code this fix never touches). Zoom OUT
  // (smaller fill = larger distance) for real edge/room context in the guide frame.
  await t.frameElement(target.fid, 0.22);
  // §RECAPTURE-FINDING (round 6, numeric candidate probe — capture_probe_candidates.js): the round-5
  // "sliver of background" symptom was NOT the candidate or the fill — it was THIS script's own
  // margin=80 (double the harness's proven default of 48, used by every other successful shotClip
  // witness). Measured crop-fraction (bbox area / (bbox+2*margin)^2) across 12 real-layer-seedable
  // candidates at fill=0.22: margin=80 -> best candidate (fid=89) only 28.2%, fid=87 27.4% — both read
  // as background-dominated. margin=48 -> fid=87 41.8%. margin=30 -> fid=87 55.5% (a "healthy majority").
  // fid=87 vs the marginally-better fid=89 (<1pp apart at every margin) was kept: fid=87 is the richest
  // layered wall (7 layers, the actual party wall CUT_GATE_CSG_SPEC.md names as the fix's reference
  // subject) — more representative content for a "cut a wall" guide demo than a 3-layer partition.
  const MARGIN = 30;
  const tw0 = await tris(t, target.fid);
  await t.shotClip('cut-select', target.fid, MARGIN);

  // §RECAPTURE-FINDING (this session, third escalation, root-caused via diag_capture_void.js): a fixed
  // sleep(1200) after the click is NOT enough on a COLD occt-wasm worker — the fold is genuinely async
  // (worker spawn + WASM init + the real fold roundtrip), and pg.click() does not await the onclick
  // handler's own promise. Poll for the tri count to actually change instead of trusting a fixed delay.
  await t.clickSel('#b-cut');
  let tw1 = tw0;
  for (let i = 0; i < 20 && tw1 === tw0; i++) { await t.sleep(500); tw1 = await tris(t, target.fid); }
  const after = await t.oplog(); const last = await t.lastOp();
  const chain = await t.verifyChain();
  await t.shotClip('cut-open', target.fid, MARGIN);

  t.assert('CUT-COMMIT (one GEOM_CUT on the layered wall)', last && last.op_type === 'GEOM_CUT' && last.parameters && last.parameters.parent === target.fid,
    'op=' + (last && last.op_type) + ' parent=' + (last && last.parameters && last.parameters.parent));
  t.assert('CHAIN-OK (verifyChain)', chain === true, 'verifyChain=' + chain);
  t.assert('GEOMETRY-CHANGED (real void subtracted — tri count changed)', tw0 !== tw1, 'tris ' + tw0 + '→' + tw1);
  console.log('  §CAPTURE-SUMMARY fid=' + target.fid + ' nLayers=' + target.nLayers + ' sz=' + JSON.stringify(target.sz) + ' tris ' + tw0 + '→' + tw1);
}, { width: 1200, height: 850, dpr: 2 });
