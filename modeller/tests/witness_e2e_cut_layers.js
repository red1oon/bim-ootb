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
 *   L3 SELECT       — a real click selects a reachable layered wall (§L3-AIM: camera placed face-on by the
 *                      wall's own mesh bbox so its face is the first raycast hit; the 7-layer party-wall
 *                      core fid 87 is enclosed by other walls on every side and is logged UNREACHABLE).
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
  // §L3-AIM: a selection starts the §ZOOM-SEL camera fly (25 rAF frames). Wait for it to END (condition:
  // window.__flyLive falsy, cap 20 s — on a normal box it is <1 s). Measured here (headless swiftshader,
  // load ~29): rAF fires at ~0.15 fps, the fly was STILL LIVE after 60 s, and every later camera placement
  // got overwritten by its next frame (that is what made the post-select re-aim and L6 fail in runs 1-2).
  // If the cap expires, yield the fly exactly as a user does — a RIGHT-button pan grab on the canvas
  // (OrbitControls dispatches 'start' → _flyId++, the app's own documented "fly cancelled by user grab"
  // path; the pick handler only acts on button 0, so the selection is untouched). __flyLive resets on the
  // fly's next rAF tick; poll for it, but the camera stops moving at the grab either way. All logged.
  const settle = async (tag) => {
    const t0 = Date.now(); await t.flySettle(20000);
    let live = await t.pg.evaluate(() => window.__flyLive || 0), yielded = false;
    if (live) {
      yielded = true;
      await t.pg.mouse.move(600, 425); await t.pg.mouse.down({ button: 'right' }); await t.pg.mouse.move(610, 433, { steps: 3 }); await t.pg.mouse.up({ button: 'right' });
      const t1 = Date.now(); while (Date.now() - t1 < 20000) { live = await t.pg.evaluate(() => window.__flyLive || 0); if (!live) break; await t.sleep(200); }
    }
    console.log('  §SETTLE ' + tag + ' waitedMs=' + (Date.now() - t0) + ' yieldedByGrab=' + yielded + ' flyLive=' + live);
  };

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

  // L3 select A REACHABLE layered wall by a real click at a point on the wall's OWN face.
  // §L3-AIM (2026-09-25, diagnosis of the reproducible 4/1 fail): the old loop framed each candidate with
  // frameElement(fid, 0.5) — a dolly along the CURRENT (iso) view direction — then clickOn(). Measured on
  // origin/main 39673dd7: from that placement clickPointFor() was null for 27/27 wallish layered walls (a
  // low interior wall is behind upper-storey slabs/walls from the iso direction), so clickOn() fell back to
  // the projected bbox centre and the page's own pickAt correctly selected the OCCLUDER (fid 55, 22, 195…)
  // — 8 candidates × 2 attempts, 0 selections, deterministic, not flake (CUT_GATE_CSG_SPEC.md §11 called
  // it "flaky"; it never passes from that aim). The pick path is fine: a layered wall is ONE mesh
  // (bonsai_library.js foldInsert, one buffer with per-layer face ranges) with userData.featureId, and a
  // real click on its face selects it (measured: fid 88/107/15 → selSet=[fid] via pickAt). So the fix is
  // the AIM: t.framePickable(fid) puts the camera face-on to the wall (first raycast hit = its own mesh,
  // pixel on the canvas) using its real mesh bbox, and the click goes to that verified point. The
  // richest candidate, fid 87 (7-layer party-wall core), is enclosed by walls 5/14/13/6/90 on every side
  // — a user cannot click it either; the loop logs that and takes the next-richest reachable wall.
  // Selection is awaited as a CONDITION (poll _selSet), not a fixed sleep.
  let target = null, sel = false;
  for (const cand of pool.slice(0, 8)) {
    const aim = await t.framePickable(cand.fid);
    if (!aim) continue;
    await t.pg.mouse.click(aim.pt[0], aim.pt[1]);
    const t0 = Date.now();
    while (Date.now() - t0 < 3000) {
      sel = await t.pg.evaluate((f) => Array.from(window.Bonsai._selSet || []).includes(f), cand.fid);
      if (sel) break; await t.sleep(100);
    }
    console.log('  §L3-CLICK fid=' + cand.fid + ' selected=' + sel + ' waitedMs=' + (Date.now() - t0) + ' selSet=' + JSON.stringify(await t.pg.evaluate(() => Array.from(window.Bonsai._selSet || []))));
    if (sel) { target = cand; break; }
  }
  t.assert('L3 SELECT (real click selects a real layered wall)', sel, 'fid=' + (target && target.fid) + ' nLayers=' + (target && target.nLayers) + ' selected=' + sel);
  if (!sel) return;
  // §L3-AIM: a selection starts the §ZOOM-SEL camera fly (25 rAF frames). Measured here: headless
  // swiftshader on a loaded box runs rAF at ~1 fps, so the fly lasts >20 s and flySettle's default 15 s cap
  // returned with it STILL LIVE (window.__flyLive=2) — every later camera placement was then overwritten by
  // the next fly frame. Wait on the real condition (fly ended) with a cap that fits the measured rate.
  await settle('post-L3-select');
  // §L3-AIM: after the selection's own §ZOOM-SEL fly, go BACK to the face-on placement — L6's framebuffer
  // compare must look at the face the void is cut into; from the iso direction that face is the occluded
  // one (the very reason the old aim missed), so a real cut could read as "no visible change" there.
  await t.framePickable(target.fid);
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
  // §NET-AUDIT PIXEL-AS-PROOF (2026-09-26): a whole-frame pixel sum is not a verdict (Primal Law). Measured flipping with no code change
  // — 09-26 serial runs: cut C4 red on main / green on the branch, cut_layers L6 the reverse, sketch K5b red only under load.
  // The claim stands on the element's own rendered triangles; the pixel sum stays in the log as info.
  console.log('  §CUT-LAYERS L6-PIX info pix ' + pix0 + '→' + pix1);
  t.assert('L6 VISIBLE (the element\'s rendered tri count changed — real void subtracted)',
    tw0 > 0 && tw1 > 0 && tw0 !== tw1, 'tris ' + tw0 + '→' + tw1 + ' (pix ' + pix0 + '→' + pix1 + ', info)');

  // L7: Fillet-edge PREREQUISITE (§CHAIN-SURVIVES-LAYER-CUT) — real edges must resolve off the layer-cut solid.
  // §L3-AIM: bCut.onclick ends in highlight(null) (deselect by design, see witness_e2e_cut.js C6 note) and
  // enterFillet() refuses with no selection ("select a solid first, then Fillet") — so the cut wall must be
  // RE-SELECTED by a real click first (never reached on origin/main: L3 failed before this line). The
  // rebuilt (worker B-rep, void subtracted) mesh carries the same featureId, so the same aim applies. Then
  // wait on the CONDITION enterFillet itself reports in #stat ("fillet: click edges (N available)…" or
  // "FAIL …"), not a fixed sleep — queryEdges is a worker round-trip whose latency depends on load.
  {
    const aim = await t.framePickable(target.fid);
    if (aim) { await t.pg.mouse.click(aim.pt[0], aim.pt[1]); }
    const t0 = Date.now(); let resel = false;
    while (Date.now() - t0 < 3000) { resel = await t.pg.evaluate((f) => Array.from(window.Bonsai._selSet || []).includes(f), target.fid); if (resel) break; await t.sleep(100); }
    console.log('  §L7-RESELECT fid=' + target.fid + ' selected=' + resel + ' waitedMs=' + (Date.now() - t0));
    await settle('post-L7-reselect');
  }
  await t.clickSel('#b-fillet');
  {
    const t0 = Date.now(); let stat = '';
    while (Date.now() - t0 < 15000) { stat = await t.pg.evaluate(() => (document.getElementById('stat') || {}).textContent || ''); if (/^fillet: click edges|^FAIL|^select a solid first/.test(stat)) break; await t.sleep(100); }
    console.log('  §L7-STAT "' + stat + '" waitedMs=' + (Date.now() - t0));
  }
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
