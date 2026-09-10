#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-OPENING-SLIDE: real-user, maths-asserted E2E of the along-host opening slide
 * (prompts/SPEC_DAGEVU_SLIDE.md §5; parent ROOM_MOVE_AND_ITEM_DRAG_SPEC.md §3.1/§3.3/Q5). Read the log after every run.
 *
 * Two scenarios, both on the real production path (the Drag-Item tool's own grab — window.__armItemDrag is the
 * same grabItem the canvas pick calls — a REAL mouse down→move→up, the real pointerup commit, the real gate):
 *
 *   O0 REAL-REFUSAL (SampleHouse) — every real rel_fills_host filling REFUSES the slide, and for the honest reason:
 *      the §ARC-1 seed resolves REAL LOD-300 wall meshes whose door holes are BAKED INTO the mesh; no op can move a
 *      baked hole, so a slide would leave it behind. Measured 2026-09-10: 7/7 refuse at Bonsai._insertCutBox. This
 *      is asserted (not skipped) so the guard is proven live on real data, never a dead branch.
 *   O1-O6 SKETCHED (fixture, same pattern as witness_e2e_grid_greenorange.js scenario B) — a sketched rectangular
 *      wall (GEOM_EXTRUDE_POLY, the tool's primary use case) hosting a sketched door, with a rel_fills_host row
 *      injected in the exact shape the real §ARC-1/CrossEdges pipeline produces. The constraint/gate/commit MATH is
 *      production code; only the {host, filling} wiring is a fixture.
 *   O1 GRAB      — the door grabs into a SLIDE session (engine edge, bounded t) — not a free drag, resolver unconsulted
 *   O2 READOUT   — mid-drag the §V7 floating label (window.__dimLabel oracle) carries the engine's along-host string
 *   O3 COMMIT    — pointerup commits exactly ONE GEOM_MOVE for the door; verifyChain true
 *   O4 KINEMATIC — the door's rendered centre moved along the wall by ≈ the drag t; orthogonal + z UNCHANGED (≤1e-6)
 *                  although the real mouse path drifted 0.25 m off-axis
 *   O5 GATE      — no door-out / door-crush RED (the door is still inside its wall)
 *   O6 UNDO      — one undo restores the cursor and the door's pre-drag centre
 */
'use strict';
const { runE2E } = require('./e2e_harness');

const centreOf = (t, fid) => t.pg.evaluate((f) => {
  const g = window.Bonsai.group(); const m = g.children.find(o => o.isMesh && o.userData.featureId === f);
  if (!m) return null; m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox;
  return [(b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2];
}, fid);

runE2E('W-E2E-OPENING-SLIDE', async (t) => {
  await t.open('SampleHouse'); await t.shot('01-open');
  await t.pg.waitForFunction(() => !!(window.__arcFidByGuid && window.__arcGuidByFid && window.swXEdges && window.swXEdges.fills && window.swXEdges.fills.length), { timeout: 20000 }).catch(() => {});

  // ── O0: REAL SampleHouse — every real filling must refuse, for the baked-hole reason ──────────────────────────
  const real = await t.pg.evaluate(() => {
    const fbg = window.__arcFidByGuid, fills = window.swXEdges.fills, out = [];
    for (const e of fills) {
      const f = fbg[e.filling_guid], h = fbg[e.host_guid];
      if (f == null || h == null) continue;
      const ok = window.__armItemDrag(f, {});
      const s = window.Bonsai.itemdrag._session;
      out.push({ fid: f, host: h, slide: !!(ok && s && s.slide) });
      if (typeof exitItemDrag === 'function') exitItemDrag();
    }
    return out;
  });
  const refusalLines = t.slog.filter(l => /§SLIDE REFUSED/.test(l));
  const bakedReason = refusalLines.filter(l => /not a plain axis-aligned box/.test(l)).length;
  console.log('  §SLIDE O0 real fillings=' + JSON.stringify(real));
  refusalLines.forEach(l => console.log('    ' + l.slice(0, 220)));
  t.assert('O0 REAL-REFUSAL (SampleHouse: every real filling refuses the slide — host is a real LOD-300 mesh with baked holes, Bonsai._insertCutBox says not a plain box)',
    real.length >= 1 && real.every(r => !r.slide) && bakedReason === real.length, 'fillings=' + real.length + ' refusals(plain-box)=' + bakedReason);

  // ── FIXTURE: sketched rectangular wall + sketched door + injected fills row (greenorange scenario-B pattern) ──
  await t.clickSel('#b-clear').catch(() => {}); await t.sleep(400);
  const ids = await t.pg.evaluate(async () => {
    const O = window.Bonsai.oplog;
    const host = await O.commit({ op_type: 'GEOM_EXTRUDE_POLY', parameters: { profile: { points: [[0, 0], [4, 0], [4, 0.2], [0, 0.2]] }, depth: 3 } }, { color: 0x9fb4c8 });
    const door = await O.commit({ op_type: 'GEOM_EXTRUDE_POLY', parameters: { profile: { points: [[1.0, 0.05], [1.9, 0.05], [1.9, 0.15], [1.0, 0.15]] }, depth: 2.1 } }, { color: 0xc8a06a });
    if (typeof syncHistory === 'function') syncHistory();
    window.__arcGuidByFid = { [host.id]: 'g-host', [door.id]: 'g-door' };
    window.__arcFidByGuid = { 'g-host': host.id, 'g-door': door.id };
    window.swXEdges = { fills: [{ host_guid: 'g-host', filling_guid: 'g-door', opening_guid: null, provenance: 'ifc:recovered' }], abuts: [] };
    window.__arcAnchorFids = null;                     // fixture hygiene: the previous resident's anchor fid set must not mask fids 1/2
    return { host: host.id, door: door.id };
  });
  await t.clickSel('#b-fit'); await t.sleep(500);
  const pre = await centreOf(t, ids.door);

  // O1 — grab into a slide session
  const grab = await t.pg.evaluate((fid) => {
    const ok = window.__armItemDrag(fid, {});
    const s = window.Bonsai.itemdrag._session;
    return ok && s && s.slide ? { ok, axis: s.slide.axis, tMin: s.slide.tMin, tMax: s.slide.tMax, opening: s.slide.openingFid, product: s.real.matchedProductId, pre: s.preCentre.slice() } : { ok, slide: false };
  }, ids.door);
  t.slog.filter(l => /§ITEMDRAG|§SLIDE/.test(l) && !/REFUSED fid=(7|11|12|13|14|15|34)/.test(l)).forEach(l => console.log('    ' + l.slice(0, 300)));
  console.log('  §SLIDE O1 ' + JSON.stringify(grab));
  t.assert('O1 GRAB (sketched door grabs into a SLIDE session: engine edge, axis x, tMin=-(1.0+0.05), tMax=(4-1.9)+0.05, product FILLING:*)',
    grab.ok && grab.axis === 0 && Math.abs(grab.tMin + 1.05) < 1e-6 && Math.abs(grab.tMax - 2.15) < 1e-6 && /^FILLING:/.test(grab.product), JSON.stringify(grab));
  if (!grab.ok || grab.slide === false) return;

  // real drag: +0.8 m along the wall with a deliberate 0.25 m off-axis drift in the mouse path
  const T = 0.8, K = 0, other = 1;
  const tgt = [pre[0] + T, pre[1] + 0.25, pre[2]];
  const p0 = await t.proj(pre[0], pre[1], pre[2]), p1 = await t.proj(tgt[0], tgt[1], tgt[2]);
  const before = await t.oplog();
  await t.pg.mouse.move(p0[0], p0[1]); await t.sleep(40);
  await t.pg.mouse.down(); await t.sleep(40);
  await t.pg.mouse.move((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, { steps: 5 }); await t.sleep(120);
  await t.pg.mouse.move(p1[0], p1[1], { steps: 5 }); await t.sleep(150);
  const mid = await t.pg.evaluate(() => ({ dim: window.__dimLabel ? window.__dimLabel.text : null, stat: (document.getElementById('stat') || {}).textContent || '' }));
  await t.shot('02-mid-slide');
  console.log('  §SLIDE O2 dimLabel="' + mid.dim + '" stat="' + String(mid.stat).slice(0, 160) + '"');
  t.assert('O2 READOUT (mid-drag §V7 floating label = the engine\'s "#door along #host x +t · lo|hi to ends" string; status line carries the same)',
    typeof mid.dim === 'string' && mid.dim.indexOf('#' + ids.door + ' along #' + ids.host + ' x +') === 0 && /to ends/.test(mid.dim) && String(mid.stat).indexOf(mid.dim) >= 0, 'dimLabel="' + mid.dim + '"');

  await t.pg.mouse.up(); await t.sleep(900);
  const after = await t.oplog(); const chain = await t.verifyChain();
  const ops = await t.pg.evaluate((fromLen, fid) => {
    const added = window.Bonsai.oplog._geomOps().slice(fromLen);
    const mv = added.find(o => o.op_type === 'GEOM_MOVE' && o.parameters && o.parameters.parent === fid && !o.parameters.induced);
    return { addedTypes: added.map(o => o.op_type), mv: mv ? mv.parameters : null, lastGate: window.__lastGate || '' };
  }, before.len, ids.door);
  console.log('  §SLIDE O3 ' + JSON.stringify(ops) + ' oplog ' + before.len + '→' + after.len + ' chain=' + chain);
  t.slog.filter(l => /§ITEMDRAG commit|§GATE|§DAGEVU/.test(l)).forEach(l => console.log('    ' + l.slice(0, 300)));
  await t.shot('03-committed');
  t.assert('O3 COMMIT (exactly ONE GEOM_MOVE for the door — no rider, no opening seeded; verifyChain true)',
    after.len === before.len + 1 && ops.addedTypes.length === 1 && ops.mv && chain === true, JSON.stringify(ops));

  const post = await centreOf(t, ids.door);
  const dAlong = post ? post[K] - pre[K] : NaN, dOrtho = post ? Math.abs(post[other] - pre[other]) : NaN, dZ = post ? Math.abs(post[2] - pre[2]) : NaN;
  console.log('  §SLIDE O4 pre=' + JSON.stringify(pre.map(v => +v.toFixed(4))) + ' post=' + JSON.stringify(post && post.map(v => +v.toFixed(4))) + ' dAlong=' + dAlong.toFixed(4) + ' (want≈' + T + ') dOrtho=' + dOrtho.toExponential(2) + ' dZ=' + dZ.toExponential(2));
  t.assert('O4 KINEMATIC (door centre moved along the wall by ≈0.8 m; y and z UNCHANGED ≤1e-6 despite the 0.25 m off-axis mouse path; committed dy=dz=0)',
    post && Math.abs(dAlong - T) < 0.06 && dOrtho < 1e-6 && dZ < 1e-6 && ops.mv && Math.abs(ops.mv.dx - dAlong) < 1e-6 && ops.mv.dy === 0 && ops.mv.dz === 0,
    'dAlong=' + dAlong.toFixed(4) + ' dOrtho=' + dOrtho.toExponential(2) + ' dZ=' + dZ.toExponential(2));
  t.assert('O5 GATE (no door-out / door-crush RED — the slid door is still inside its wall)', !/door-(out|crush)/.test(ops.lastGate), 'lastGate="' + ops.lastGate + '"');

  await t.undoToCursor(before.cur);
  const undone = await t.oplog(); const back = await centreOf(t, ids.door);
  const dBack = back ? Math.hypot(back[0] - pre[0], back[1] - pre[1], back[2] - pre[2]) : NaN;
  await t.shot('04-undone');
  t.assert('O6 UNDO (cursor restored, door back at its pre-drag centre ≤1e-3)', undone.cur === before.cur && dBack < 1e-3, 'cursor ' + after.cur + '→' + undone.cur + ' dBack=' + dBack.toExponential(2));
}, { width: 1280, height: 860, dpr: 2 });
