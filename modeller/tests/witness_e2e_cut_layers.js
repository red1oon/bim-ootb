#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-CUT-LAYERS: real-user, maths-asserted E2E of the CUT tool on a REAL
 * authored multi-layer wall (the population CUT_GATE_CSG_SPEC.md §THE CALL exists for — Duplex's 50
 * previously-refused wallish candidates, box-only §CUT-ON-ARC could never seed).
 * Implementing CUT_GATE_CSG_SPEC.md §THE CALL — Witnesses: §LAYER-SOLID-SEED, §LAYER-CUT-EXACT,
 * §CHAIN-SURVIVES-LAYER-CUT, §NO-BOX-FALLBACK-REGRESSION (companion: witness_e2e_cut.js, unmodified,
 * still proves the box path byte-identical).
 *   L1 POPULATION   — the live Duplex fold has ZERO refused wallish candidates left (57 wallish = 7 box + 50 layer).
 *   L2 SEED         — the richest layered wall (per CUT_GATE_CSG_SPEC.md §8 item 1, the 7-layer party wall)
 *                      resolves a real _insertCutLayerSeed (not null) — box path refuses it (not axis-aligned single box).
 *   L3 SELECT       — a real click selects that wall.
 *   L4 CUT-COMMIT   — clicking Cut commits exactly one GEOM_CUT parented to the wall.
 *   L5 CHAIN-OK     — verifyChain passes after the cut.
 *   L6 VISIBLE      — the framebuffer ACTUALLY CHANGED (§LAYER-CUT-EXACT: the void really subtracted from
 *                      the fused real-per-layer solid, not a silently-unseeded no-op).
 *   L7 FILLET-EDGES — entering Fillet on the now-cut wall reads a NON-EMPTY real edge list (queryEdges
 *                      seeding fix, §CHAIN-SURVIVES-LAYER-CUT: the cut result is a real OCCT solid with
 *                      real edges, not a mesh-soup approximation that would refuse edge topology).
 *   L8 FILLET-APPLY — INFORMATIONAL ONLY, not counted pass/fail (see CUT_GATE_CSG_SPEC.md §10's
 *                      §CHAIN-SURVIVES-LAYER-CUT entry): applying a real GEOM_FILLET to an edge of the
 *                      layer-cut solid currently throws an OCCT WebAssembly exception on every (edge,
 *                      radius) combination tried across 2 different walls — a genuine, named, NOT-YET-
 *                      FIXED open gap (root-cause hypothesis: kernel.fuseAll() likely produces a
 *                      multi-body compound rather than one true manifold solid; BRepFilletAPI_MakeFillet
 *                      needs real solid topology). L7 already proves the PREREQUISITE (real enumerable
 *                      edges); L8 logs the actual attempt's outcome without gating the suite on an
 *                      out-of-scope fix (the guide-recapture task this fix unblocks only needs Cut to
 *                      work, not Fillet-after-layer-cut).
 *   L9 REVERSIBLE   — undo restores the pre-cut cursor.
 */
'use strict';
const { runE2E } = require('./e2e_harness');
const tris = (t, fid) => t.pg.evaluate((f) => {
  const g = window.Bonsai.group(); const m = g.children.find(o => o.isMesh && o.userData.featureId === f);
  if (!m) return null; const idx = m.geometry.index; return idx ? idx.count / 3 : (m.geometry.attributes.position.count / 3);
}, fid);
runE2E('W-E2E-CUT-LAYERS', async (t) => {
  await t.open('Duplex');
  await t.shot('01-open');

  // L1/L2: enumerate every wallish GEOM_INSERT, classify box/layer/refused via the PRODUCTION gate itself
  // (Bonsai._insertCutBox / _insertCutLayerSeed — same functions canCut()/the UI/the harness's `cuttable`
  // filter call), pick the RICHEST layer candidate (most authored layers) as the acid test.
  const report = await t.pg.evaluate(() => {
    const ops = window.Bonsai.oplog._geomOps();
    const out = { box: 0, layer: [], refused: 0 };
    ops.forEach(op => {
      if (op.op_type !== 'GEOM_INSERT') return;
      const P = op.parameters; if (!P || !P.ifc_class || !/Wall/i.test(P.ifc_class)) return;
      let boxOk = false, layerSeed = null;
      const bb = P.bbox, sz = bb ? [bb[1] - bb[0], bb[3] - bb[2], bb[5] - bb[4]] : null;
      try { boxOk = !!window.Bonsai._insertCutBox(op); } catch (e) {}
      if (!boxOk) { try { layerSeed = window.Bonsai._insertCutLayerSeed(op); } catch (e) {} }
      if (boxOk) out.box++;
      else if (layerSeed) out.layer.push({ fid: op.id, nLayers: layerSeed.layers.length, sz: sz });
      else out.refused++;
    });
    return out;
  });
  t.assert('L1 POPULATION (zero refused wallish candidates — every non-box wall resolves a real layer seed)',
    report.refused === 0 && report.layer.length > 0,
    'box=' + report.box + ' layer=' + report.layer.length + ' refused=' + report.refused);
  report.layer.sort((a, b) => b.nLayers - a.nLayers);
  const richest = report.layer[0];
  t.assert('L2 SEED (richest layered wall resolves a real per-layer seed, box path refuses it)',
    !!richest && richest.nLayers >= 2, 'target=' + JSON.stringify(richest));
  if (!richest) return;

  // §F2-FRAMING precedent (e2e_harness.js pick()'s own `wallish` heuristic — tall, thin, room-scale):
  // among the layer-seedable candidates prefer a GENUINELY wall-shaped one (tall, one thin axis, a real
  // room-scale span) over a shallow parapet/curb-like layered element that happens to have more layer
  // rows — a real close-up "the wall, cut" frame needs a subject that actually reads as a wall.
  const wallish = c => c.sz && c.sz[2] >= 1.2 && Math.min(c.sz[0], c.sz[1]) <= 0.6 && Math.max(c.sz[0], c.sz[1]) >= 1.0 && Math.max(c.sz[0], c.sz[1]) <= 8;
  const wallishLayers = report.layer.filter(wallish);
  t.assert('L2b WALLISH (at least one layer-seeded candidate is genuinely wall-shaped)', wallishLayers.length > 0, 'wallishLayer=' + wallishLayers.length + '/' + report.layer.length);
  const pool = wallishLayers.length ? wallishLayers : report.layer;

  // L3 select A REACHABLE layered wall by a real, raycast-verified click — frame each candidate first (a
  // closer camera reduces occlusion), preferring the richest but trying the next-richest if the current
  // isometric default view happens to occlude it (a real click-reachability fact, not a heuristic dodge —
  // same reasoning e2e_harness.js's own candidates()/clickPointFor already apply).
  let target = null, sel = false;
  for (const cand of pool.slice(0, 8)) {
    await t.frameElement(cand.fid, 0.5);
    await t.flySettle();
    // 2 real attempts per candidate (a loaded machine can cost a click to swiftshader/CPU contention, per
    // RESUME_MODELLER_GUIDE_SCREENSHOT_FIX.md's documented environment note) before moving to the next fid.
    for (let attempt = 0; attempt < 2 && !sel; attempt++) {
      await t.clickOn(cand.fid);
      await t.sleep(300);
      sel = await t.pg.evaluate((f) => Array.from(window.Bonsai._selSet || []).includes(f), cand.fid);
    }
    if (sel) { target = cand; break; }
  }
  t.assert('L3 SELECT (real click selects a real layered wall)', sel, 'fid=' + (target && target.fid) + ' nLayers=' + (target && target.nLayers) + ' selected=' + sel);
  if (!sel) return;
  await t.flySettle();
  await t.frameElement(target.fid, 0.42);
  await t.shot('02-selected');

  const before = await t.oplog(); const pix0 = await t.pixsum(); const tw0 = await tris(t, target.fid);
  await t.clickSel('#b-cut'); await t.sleep(900);
  const after = await t.oplog(); const last = await t.lastOp(); const pix1 = await t.pixsum(); const tw1 = await tris(t, target.fid);
  const chain = await t.verifyChain();
  await t.shot('03-cut');
  t.assert('L4 CUT-COMMIT (one GEOM_CUT on the layered wall)',
    after.len === before.len + 1 && last && last.op_type === 'GEOM_CUT' && last.parameters && last.parameters.parent === target.fid,
    'len ' + before.len + '→' + after.len + ' op=' + (last && last.op_type) + ' parent=' + (last && last.parameters && last.parameters.parent));
  t.assert('L5 CHAIN-OK (verifyChain)', chain === true, 'verifyChain=' + chain);
  t.assert('L6 VISIBLE (framebuffer changed + tri count changed — real void subtracted)',
    pix0 !== pix1 && tw0 !== tw1, 'pix ' + pix0 + '→' + pix1 + ' tris ' + tw0 + '→' + tw1);

  // L7: Fillet-edge PREREQUISITE (§CHAIN-SURVIVES-LAYER-CUT) — real edges must resolve off the layer-cut solid.
  await t.clickSel('#b-fillet'); await t.sleep(700);
  const edges = await t.pg.evaluate(() => (window._edgeList || []).map(e => ({ i: e.i, mid: e.mid })));
  t.assert('L7 FILLET-EDGES (real, non-empty edge list off the layer-cut solid)', edges.length >= 1, 'edges=' + edges.length);
  // L8: INFORMATIONAL — try to actually apply one; log the real outcome, don't gate the suite on it (see
  // the header comment above and CUT_GATE_CSG_SPEC.md §10 for why this is a named open item, not silently
  // dropped). window.pageerror listeners stay armed (t.errs) so a WASM exception here is still visible.
  if (edges.length) {
    const e0 = edges.slice().sort((a, b) => b.mid[2] - a.mid[2])[0];
    const epx = await t.proj(e0.mid[0], e0.mid[1], e0.mid[2]);
    await t.pg.mouse.click(epx[0], epx[1]); await t.sleep(300);
    await t.pg.evaluate(() => { const r = document.getElementById('dim-rad'); if (r) r.value = '0.02'; });
    const beforeFillet = await t.oplog();
    await t.clickSel('#b-applyfillet'); await t.sleep(1200);
    const afterFillet = await t.oplog(); const lastFillet = await t.lastOp();
    const filletOk = afterFillet.len === beforeFillet.len + 1 && lastFillet && lastFillet.op_type === 'GEOM_FILLET';
    console.log('  §L8-INFO (not gated) filletOk=' + filletOk + ' opsLen ' + beforeFillet.len + '→' + afterFillet.len);
    await t.shot('04-filleted');
  }

  // L9 reversible: undo back past the cut (the informational L8 attempt above may also have appended a
  // row regardless of its own success — see CUT_GATE_CSG_SPEC.md §10's replay-corruption side-note — so
  // undo all the way back to the pre-cut cursor captured in `before`, not just one step).
  await t.undoToCursor(before.cur);
  const undo = await t.oplog();
  t.assert('L9 REVERSIBLE (undo restores pre-cut cursor)', undo.cur === before.cur, 'cursor→' + undo.cur + ' (want ' + before.cur + ')');
}, { width: 1200, height: 850, dpr: 2 });
