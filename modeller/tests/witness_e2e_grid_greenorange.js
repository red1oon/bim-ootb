#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-GRID-GREENORANGE: real-user, maths-asserted E2E of the grid-drag GREEN/ORANGE
 * pre-drag opt-out preview. Implementing GRID_PREDRAG_GREENORANGE_PREVIEW.md — Watchdog-tracked. Read the log
 * after every run.
 *
 * Real production path: real #b-gridmove toolbar pill, real ctrl+click (pg.keyboard modifier + pg.mouse.click),
 * real pg.mouse drag on a gridline, real commit via pointerup -> commitGridMove() -> Bonsai.gridmove.commit().
 *
 * SCENARIO A (synthetic 2-wall grid, deterministic screen coords — mirrors witness_e2e_gridstretch.js's rig):
 *   wall1 spans A(0)->B(4) (will STRETCH/orange on a B-drag), wall2 spans B(4)->6 (will TRANSLATE/blue; kept
 *   short of gridline C so its OWN right edge doesn't also attach and overwrite the gx1 classification).
 *   G1/G2/G3 — ctrl+click wall2 BEFORE any gridline is grabbed: toggles green->orange->green, BOTH directions,
 *              proven via window.Bonsai.gridmove.isExcluded() AND the live emissive hex on the mesh.
 *   G4        — mid-drag (mouse still down, before release): wall1 tints ORANGE, wall2 (excluded) tints GREEN
 *               (not the blue it would otherwise show) — proves the preview honors the override live, DURING
 *               the drag, not just before it.
 *   G5/G6     — commit: the committed GEOM_GRID_MOVE's own parameters.commands carries NO entry for wall2 (it
 *               was genuinely skipped, not merely re-colored) AND wall2's measured world bbox is numerically
 *               IDENTICAL before vs after (position before == position after, not "no visible movement").
 *   G7        — wall1 (never excluded) still stretched normally — the override on wall2 caused no regression
 *               to wall1's own default-orange behavior.
 *
 * SCENARIO B (synthetic rider fixture — isolates the item-1 STRETCH-RIDE-in-live-preview fix from the real
 *   ARC-1/SampleHouse extraction pipeline, which is already exhaustively covered by witness_stretch_ride.js +
 *   witness_e2e_stretch_ride.js; here we only need SOME believable {host,filling,fills} wiring to prove the UI
 *   preview math, and injecting it directly keeps this witness deterministic and independent of a real
 *   building's on-screen gridline coordinates):
 *   host wall spans A(0)->B(4); "door" is a 2nd solid whose OWN right edge also sits exactly at B(x=4) — the
 *   engine classifies it independently as EDGE_RIGHT (its own SCALE command) exactly like the real bug
 *   describes. A synthetic rel_fills_host edge (door hosted by wall) is injected via window.swXEdges.fills +
 *   the §ARC-1 bridge globals (window.__arcGuidByFid/__arcFidByGuid) — same shape the real pipeline produces.
 *   H1 — BEFORE the fix's code path would have shown the door's raw command (SCALE/orange). AFTER the fix,
 *        mid-drag (still held down, before release) the door tints BLUE (rides its host, never its own scale)
 *        — the exact "before AND during a grid drag, including openings" DONE-criterion.
 *   H2 — commit: the door's own command is absent from the committed GEOM_GRID_MOVE (stripped, matches the
 *        already-proven commit-time behavior) — preview and commit agree.
 */
'use strict';
const { runE2E } = require('./e2e_harness');
const GREEN = 0x1ea83c, BLUE = 0x1e66c8, ORANGE = 0xc8731e;

function bboxOf(t, fid) {
  return t.pg.evaluate((f) => {
    const g = window.Bonsai.group(); const m = g.children.find(o => o.isMesh && o.userData.featureId === f);
    if (!m) return null; m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox;
    return [b.min.x, b.max.x, b.min.y, b.max.y, b.min.z, b.max.z];
  }, fid);
}
function emisOf(t, fid) {
  return t.pg.evaluate((f) => {
    const g = window.Bonsai.group(); const m = g.children.find(o => o.isMesh && o.userData.featureId === f);
    return (m && m.material && m.material.emissive) ? m.material.emissive.getHex() : null;
  }, fid);
}
async function ctrlClick(t, x, y) {
  await t.pg.keyboard.down('Control');
  await t.pg.mouse.move(x, y); await t.sleep(30);
  await t.pg.mouse.click(x, y);
  await t.pg.keyboard.up('Control');
  await t.sleep(150);
}

runE2E('W-E2E-GRID-GREENORANGE', async (t) => {
  await t.open('Duplex'); await t.shot('01-open');

  // ── SCENARIO A: synthetic 2-wall grid, deterministic screen coords ─────────────────────────────
  await t.clickSel('#b-clear'); await t.sleep(400);
  // Duplex auto-seeds a REAL §ARC-1 bridge + rel_fills_host edges on Open (str_walker_outliner.js) — those
  // featureIds are now STALE (the clear reset the id counter to 1,2 for our synthetic walls below), so leaving
  // them live would make stretchRide reinterpret wall1/wall2 as an unrelated host/filling pair from the OLD
  // building. Clear the bridge for this synthetic-fixture scenario (Scenario B injects its OWN fresh bridge).
  await t.pg.evaluate(() => { window.__arcGuidByFid = undefined; window.__arcFidByGuid = undefined; window.swXEdges = undefined; });
  const idsA = await t.pg.evaluate(async () => {
    window.Bonsai.grid.define({ xs: [0, 4, 8], ys: [0, 3], xlabels: ['A', 'B', 'C'], ylabels: ['1', '2'] });
    const O = window.Bonsai.oplog;
    const w1 = await O.commit({ op_type: 'GEOM_EXTRUDE_POLY', parameters: { profile: { points: [[0, 0], [4, 0], [4, 0.2], [0, 0.2]] }, depth: 3 } }, { color: 0x9fb4c8 });
    // wall2 spans B(4)->6, deliberately NOT to gridline C(8): _findBestGrid's edge-detection has no priority
    // over multiple matches on the SAME element — a wall spanning EXACTLY two gridlines (like a naive B->C here
    // would) gets its LEFT-edge attach OVERWRITTEN by the later loop iteration's RIGHT-edge match (the classifier
    // walks grid lines in position order and the LAST edge match wins). Ending wall2's right edge at x=6 (far
    // from any gridline) keeps it unambiguously EDGE_LEFT-attached to gx1 only.
    const w2 = await O.commit({ op_type: 'GEOM_EXTRUDE_POLY', parameters: { profile: { points: [[4, 0], [6, 0], [6, 0.2], [4, 0.2]] }, depth: 3 } }, { color: 0xb49f9f });
    if (typeof syncHistory === 'function') syncHistory();
    return { w1: w1.id, w2: w2.id };
  });
  await t.clickSel('#b-fit'); await t.sleep(500);
  const w2box0 = await bboxOf(t, idsA.w2);
  t.assert('A0 SETUP (wall1 A->B, wall2 B->C)', !!idsA.w1 && !!idsA.w2 && !!w2box0, JSON.stringify(idsA) + ' w2box0=' + JSON.stringify(w2box0));
  await t.shot('02-setupA');

  await t.clickSel('#b-gridmove'); await t.sleep(300);

  // wall2's centre, projected — the ctrl+click target (well inside the mesh footprint, unoccluded).
  const w2c = [(w2box0[0] + w2box0[1]) / 2, (w2box0[2] + w2box0[3]) / 2, (w2box0[4] + w2box0[5]) / 2];
  const w2px = await t.proj(w2c[0], w2c[1], w2c[2]);

  // G1 — ctrl+click #1: orange(default/none) -> green(excluded)
  await ctrlClick(t, w2px[0], w2px[1]);
  const s1b = await t.pg.evaluate((fid) => window.Bonsai.gridmove.isExcluded(fid), idsA.w2);
  const e1 = await emisOf(t, idsA.w2);
  console.log('  §GREENORANGE G1 excluded=' + s1b + ' emissive=0x' + (e1 || 0).toString(16));
  t.assert('G1 ctrl+click #1 excludes wall2 (isExcluded true, emissive GREEN)', s1b === true && e1 === GREEN, 'excluded=' + s1b + ' hex=0x' + (e1 || 0).toString(16));

  // G2 — ctrl+click #2: green -> back to orange/included (2nd direction)
  await ctrlClick(t, w2px[0], w2px[1]);
  const s2 = await t.pg.evaluate((fid) => window.Bonsai.gridmove.isExcluded(fid), idsA.w2);
  const e2 = await emisOf(t, idsA.w2);
  console.log('  §GREENORANGE G2 excluded=' + s2 + ' emissive=0x' + (e2 || 0).toString(16));
  t.assert('G2 ctrl+click #2 flips wall2 BACK to included (isExcluded false) — both directions proven', s2 === false, 'excluded=' + s2 + ' hex=0x' + (e2 || 0).toString(16));

  // G3 — ctrl+click #3: re-exclude, kept green for the upcoming drag
  await ctrlClick(t, w2px[0], w2px[1]);
  const s3 = await t.pg.evaluate((fid) => window.Bonsai.gridmove.isExcluded(fid), idsA.w2);
  t.assert('G3 ctrl+click #3 re-excludes wall2 (kept green for the drag below)', s3 === true, 'excluded=' + s3);
  await t.shot('03-w2-excluded');

  // G4 — mid-drag (mouse still DOWN, before release): manual down+move+pause+evaluate+move+up (not t.drag, which
  // completes the whole gesture atomically) so we can inspect the LIVE preview tint BEFORE commit.
  const down = await t.proj(4, 1.5, 0);
  const midUp = await t.proj(4 + 0.8, 1.5, 0);
  const finalUp = await t.proj(4 + 1.5, 1.5, 0);
  const before = await t.oplog();
  await t.pg.mouse.move(down[0], down[1]); await t.sleep(40);
  await t.pg.mouse.down(); await t.sleep(40);
  await t.pg.mouse.move(midUp[0], midUp[1], { steps: 6 }); await t.sleep(150);
  const midW1 = await emisOf(t, idsA.w1), midW2 = await emisOf(t, idsA.w2);
  console.log('  §GREENORANGE G4 mid-drag (pointer still down) wall1=0x' + (midW1 || 0).toString(16) + ' wall2=0x' + (midW2 || 0).toString(16));
  t.assert('G4 mid-drag (before release): wall1 tints ORANGE (default, stretches), wall2 stays GREEN (excluded — would otherwise be blue-translate)',
    midW1 === ORANGE && midW2 === GREEN, 'wall1=0x' + (midW1 || 0).toString(16) + ' wall2=0x' + (midW2 || 0).toString(16));
  await t.shot('04-middrag');

  await t.pg.mouse.move(finalUp[0], finalUp[1], { steps: 6 }); await t.sleep(60);
  await t.pg.mouse.up(); await t.sleep(900);
  const after = await t.oplog(); const last = await t.lastOp();
  await t.shot('05-committed');

  // G5 — the committed op's OWN command list has NO entry for wall2 (genuinely skipped, not just re-colored)
  const gridMoveCmds = (last && last.op_type === 'GEOM_GRID_MOVE') ? (last.parameters.commands || []) : null;
  const w2InCommands = gridMoveCmds ? gridMoveCmds.some(c => c.featureId === idsA.w2) : null;
  const w1InCommands = gridMoveCmds ? gridMoveCmds.some(c => c.featureId === idsA.w1) : null;
  console.log('  §GREENORANGE G5 committed op=' + (last && last.op_type) + ' cmds=' + JSON.stringify(gridMoveCmds && gridMoveCmds.map(c => c.featureId + ':' + c.action)));
  t.assert('G5 commit: GEOM_GRID_MOVE carries NO command for excluded wall2, but DOES for wall1',
    after.len === before.len + 1 && last && last.op_type === 'GEOM_GRID_MOVE' && w2InCommands === false && w1InCommands === true,
    'len ' + before.len + '->' + after.len + ' w2InCommands=' + w2InCommands + ' w1InCommands=' + w1InCommands);

  // G6 — numeric proof: wall2's world bbox is IDENTICAL before vs after (position before == position after)
  const w2box1 = await bboxOf(t, idsA.w2);
  const maxDiff = w2box0.reduce((m, v, i) => Math.max(m, Math.abs(v - w2box1[i])), 0);
  console.log('  §GREENORANGE G6 wall2 bbox before=' + JSON.stringify(w2box0) + ' after=' + JSON.stringify(w2box1) + ' maxDiff=' + maxDiff.toExponential(2));
  t.assert('G6 excluded wall2 genuinely did NOT move on commit (bbox before == after, maxDiff<1e-9)', maxDiff < 1e-9, 'maxDiff=' + maxDiff.toExponential(2));

  // G7 — wall1 (never excluded) DID stretch as normal — the override elsewhere caused no regression to it.
  const w1box1 = await bboxOf(t, idsA.w1);
  const w1xExt = w1box1[1] - w1box1[0];
  console.log('  §GREENORANGE G7 wall1 xExtent after=' + w1xExt.toFixed(3) + ' (want >=4.9, orig 4 + 1.5 drag)');
  t.assert('G7 non-excluded wall1 still stretched normally (default-orange unaffected by wall2 opt-out)', w1xExt > 4.9, 'xExt=' + w1xExt.toFixed(3));

  await t.clickSel('#b-clear').catch(() => {}); await t.sleep(300);

  // ── SCENARIO B: synthetic host+rider fixture — proves item 1 (stretchRide now applied in the LIVE preview,
  // not just at commit) for a HOSTED OPENING specifically, independent of the real ARC-1/SampleHouse pipeline.
  const idsB = await t.pg.evaluate(async () => {
    window.Bonsai.grid.define({ xs: [0, 4, 8], ys: [0, 3], xlabels: ['A', 'B', 'C'], ylabels: ['1', '2'] });
    const O = window.Bonsai.oplog;
    const host = await O.commit({ op_type: 'GEOM_EXTRUDE_POLY', parameters: { profile: { points: [[0, 0], [4, 0], [4, 0.2], [0, 0.2]] }, depth: 3 } }, { color: 0x9fb4c8 });
    // door: its OWN right edge sits exactly at x=4 too (within EDGE_TOL) -> the engine classifies it
    // INDEPENDENTLY as EDGE_RIGHT (its own SCALE command) — the exact bug the header describes.
    const door = await O.commit({ op_type: 'GEOM_EXTRUDE_POLY', parameters: { profile: { points: [[3.7, 0.05], [4.0, 0.05], [4.0, 0.15], [3.7, 0.15]] }, depth: 1 } }, { color: 0x6a8caa });
    if (typeof syncHistory === 'function') syncHistory();
    // Inject a rel_fills_host edge in the SAME shape the real §ARC-1/CrossEdges pipeline produces (this fixture
    // isolates the UI-preview math from the extraction pipeline, already proven real in witness_stretch_ride.js
    // + witness_e2e_stretch_ride.js against SampleHouse) — non-invent in scope: the fold/ride MATH is the real
    // production code (SdgCascade.stretchRide), only the {host,filling} WIRING is a fixture.
    window.__arcGuidByFid = { [host.id]: 'g-host', [door.id]: 'g-door' };
    window.__arcFidByGuid = { 'g-host': host.id, 'g-door': door.id };
    window.swXEdges = { fills: [{ host_guid: 'g-host', filling_guid: 'g-door', provenance: 'ifc:recovered' }] };
    return { host: host.id, door: door.id };
  });
  await t.clickSel('#b-fit'); await t.sleep(500);
  const doorBox0 = await bboxOf(t, idsB.door);
  t.assert('B0 SETUP (host + door fixture, door edge at gx1 like host)', !!idsB.host && !!idsB.door && !!doorBox0, JSON.stringify(idsB));

  await t.clickSel('#b-gridmove'); await t.sleep(300);
  const downB = await t.proj(4, 1.5, 0);
  const midB = await t.proj(4 + 0.8, 1.5, 0);
  const finalB = await t.proj(4 + 1.5, 1.5, 0);
  const beforeB = await t.oplog();
  await t.pg.mouse.move(downB[0], downB[1]); await t.sleep(40);
  await t.pg.mouse.down(); await t.sleep(40);
  await t.pg.mouse.move(midB[0], midB[1], { steps: 6 }); await t.sleep(150);
  const midHost = await emisOf(t, idsB.host), midDoor = await emisOf(t, idsB.door);
  console.log('  §GREENORANGE H1 mid-drag host=0x' + (midHost || 0).toString(16) + ' door=0x' + (midDoor || 0).toString(16) + ' (door must be BLUE=rides, NOT orange=its own raw SCALE)');
  t.assert('H1 mid-drag (before release): hosted door tints BLUE (rides host via §STRETCH-RIDE), NOT orange (its own raw SCALE — the item-1 bug)',
    midHost === ORANGE && midDoor === BLUE, 'host=0x' + (midHost || 0).toString(16) + ' door=0x' + (midDoor || 0).toString(16));
  await t.shot('06-scenarioB-middrag');

  await t.pg.mouse.move(finalB[0], finalB[1], { steps: 6 }); await t.sleep(60);
  await t.pg.mouse.up(); await t.sleep(900);
  const afterB = await t.oplog();
  // with a rider present the commit is a GESTURE GROUP [GEOM_GRID_MOVE, GEOM_MOVE(induced)] — t.lastOp() alone
  // would only see the trailing induced GEOM_MOVE, so scan the ops ADDED since beforeB (mirrors
  // witness_e2e_stretch_ride.js's E3 opCheck pattern) to find the GEOM_GRID_MOVE itself.
  const opCheckB = await t.pg.evaluate((beforeLen, doorFid) => {
    const ops = window.Bonsai.oplog._geomOps();
    const added = ops.slice(beforeLen);
    const gridMove = added.find(o => o.op_type === 'GEOM_GRID_MOVE');
    const induced = added.filter(o => o.op_type === 'GEOM_MOVE' && o.parameters && o.parameters.induced === 'hosted-by' && o.parameters.parent === doorFid);
    return { addedTypes: added.map(o => o.op_type), gridMoveCmds: gridMove ? gridMove.parameters.commands.map(c => c.featureId + ':' + c.action) : null,
      doorInCommands: gridMove ? gridMove.parameters.commands.some(c => c.featureId === doorFid) : null, inducedCount: induced.length };
  }, beforeB.len, idsB.door);
  console.log('  §GREENORANGE H2 ' + JSON.stringify(opCheckB));
  t.assert('H2 commit: door\'s own command is STRIPPED from the committed GEOM_GRID_MOVE + exactly ONE induced hosted-by GEOM_MOVE for it (preview and commit AGREE)',
    afterB.len === beforeB.len + 2 && opCheckB.doorInCommands === false && opCheckB.inducedCount === 1, JSON.stringify(opCheckB));
  await t.shot('07-scenarioB-committed');

  // Surface the REAL production §GRIDMOVE log lines captured off the app's own console (t.slog) — the app code
  // itself (bonsai_gridmove.js) is what logs §GREEN-EXCLUDE toggle/reset/commit-skip, not just this witness's
  // own assertions; print them so the Log Mandate evidence trail includes the production log, not only the test.
  console.log('  §GREENORANGE production log lines (from the app itself, captured via page console):');
  t.slog.filter(l => /§GRIDMOVE|§GREEN-EXCLUDE|§STRETCH-RIDE/.test(l)).forEach(l => console.log('    ' + l));
}, { width: 1200, height: 850, dpr: 2 });
