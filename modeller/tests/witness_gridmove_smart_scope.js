#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-GRIDMOVE-SMARTSCOPE: proves prompts/GRID_SMART_ELEMENT_SCOPE.md's decided fix.
 * Real bug (confirmed 2026-07-09): a gridline drag on an opened-but-uncleared Duplex swept ~50 of its own
 * real walls/doors/windows into ONE commit, because bonsai_gridmove.js's elementData() fed the WHOLE scene
 * (any ifc_class, any distance) to the shared grid_kinematics.js engine, whose gridlines are otherwise
 * infinite (classifies by along-axis centerline distance only, no locality). Fixed via two independent
 * narrowings in elementData(): (1) a structural/enclosure ifc_class allowlist (furniture/openings/coverings
 * excluded), (2) grab-locality (candidates scoped to near the pointerdown hit's orthogonal coordinate,
 * radius derived from the grid's own orthogonal-axis bay spacing).
 *
 *   S1 CLASS-ALLOWLIST — a real Duplex furniture element is excluded from elementData() even with no active
 *                        drag session (pure class filter, locality irrelevant).
 *   S2 MASS-SWEEP FIXED — opening Duplex (NOT cleared), defining an overlapping synthetic grid, and dragging
 *                        one of its lines commits a BOUNDED number of real elements (not the ~50-100 the
 *                        unfixed code produced), and the synthetic wall's own command is still present.
 *   S3 LOCALITY HONEST — every REAL Duplex element that DOES end up governed is provably within the derived
 *                        bay radius of the grab point (not a coincidence — checked by direct computation).
 *   S4 NO-REGRESSION — witness_e2e_gridstretch.js / witness_e2e_stretch_ride.js / witness_e2e_grid_greenorange.js
 *                        still pass (run separately; this file only asserts this one's own claims, per the
 *                        spec's §4 requirement to prove the mass-sweep is gone, not re-run siblings here).
 */
'use strict';
const { runE2E } = require('./e2e_harness');

runE2E('W-GRIDMOVE-SMARTSCOPE', async (t) => {
  await t.open('Duplex');

  // S1: class allowlist alone (no drag session active -- draggedAxis is null, locality doesn't apply here).
  const s1 = await t.pg.evaluate(() => {
    const classByFid = window.Bonsai.gridmove._buildClassByFid();
    const furnFid = Object.keys(classByFid).find(k => classByFid[k] === 'IfcFurnishingElement');
    const present = window.Bonsai.gridmove.elementData().some(e => String(e.guid) === String(furnFid));
    return { furnFid, present, totalArc: Object.keys(classByFid).length,
      furnCount: Object.values(classByFid).filter(c => c === 'IfcFurnishingElement').length };
  });
  t.assert('S1 CLASS-ALLOWLIST (a real furniture element is excluded from elementData())',
    s1.furnFid != null && s1.present === false, JSON.stringify(s1));

  // S2/S3 setup: SAME synthetic grid+wall as witness_e2e_gridstretch.js's own proven X1, but DELIBERATELY
  // skip #b-clear (this IS the confirmed-real bug scenario, GUIDE_VISUAL_QUALITY.md's flagged observation).
  const wallId = await t.pg.evaluate(async () => {
    window.Bonsai.grid.define({ xs: [0, 4, 8], ys: [0, 3], xlabels: ['A', 'B', 'C'], ylabels: ['1', '2'] });
    const O = window.Bonsai.oplog;
    const wall = await O.commit({ op_type: 'GEOM_EXTRUDE_POLY', parameters: { profile: { points: [[0, 0], [4, 0], [4, 0.2], [0, 0.2]] }, depth: 3 } }, { color: 0x9fb4c8 });
    if (typeof syncHistory === 'function') syncHistory();
    return wall.id;
  });
  await t.clickSel('#b-fit'); await t.sleep(500);
  const before = await t.oplog();

  await t.clickSel('#b-gridmove'); await t.sleep(400);
  const DX = 1.5;
  const down = await t.proj(4, 1.5, 0);
  const up = await t.proj(4 + DX, 1.5, 0);
  await t.drag(down, up, 12);
  await t.sleep(900);
  const after = await t.oplog();
  const last = await t.lastOp();

  const gridMoveRow = await t.pg.evaluate(() => {
    const db = window.Bonsai.oplog.db;
    const r = db.exec("SELECT parameters FROM kernel_ops WHERE op_type='GEOM_GRID_MOVE' ORDER BY id DESC LIMIT 1");
    if (!r.length) return null;
    return JSON.parse(r[0].values[0][0]);
  });
  const commandCount = gridMoveRow ? gridMoveRow.commands.length : -1;
  const hasSyntheticWall = gridMoveRow ? gridMoveRow.commands.some(c => c.featureId === wallId) : false;

  t.assert('S2 MASS-SWEEP FIXED (bounded command count, not the ~50-100 the unfixed code produced)',
    commandCount >= 1 && commandCount <= 10, 'commandCount=' + commandCount + ' (unfixed baseline was ~54)');
  t.assert('S2b synthetic wall itself still governed (its own command present)', hasSyntheticWall, 'wallId=' + wallId);
  t.assert('S2c op-log grew by a bounded amount (grid-move + at most a few riders/rewalk, not 9+)',
    (after.len - before.len) >= 1 && (after.len - before.len) <= 4, 'delta=' + (after.len - before.len));

  // S3: every OTHER (real, non-synthetic) element governed must be within the derived locality radius of
  // the grab point (orthoAt=1.5 on the y axis, since we dragged an x-line) -- prove this directly, not assume it.
  const radius = await t.pg.evaluate(() => window.Bonsai.gridmove._localityRadius('x'));
  const realGoverned = gridMoveRow ? gridMoveRow.commands.filter(c => c.featureId !== wallId) : [];
  const localityCheck = await t.pg.evaluate((fids) => {
    const g = window.Bonsai.group();
    return fids.map(fid => {
      const m = g.children.find(o => o.isMesh && o.userData.featureId === fid);
      if (!m) return null;
      m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox;
      return (b.min.y + b.max.y) / 2;
    });
  }, realGoverned.map(c => c.featureId));
  const allWithinRadius = localityCheck.every(cy => cy != null && Math.abs(cy - 1.5) <= radius);
  t.assert('S3 LOCALITY HONEST (every real governed element is within the derived bay radius of the grab point)',
    allWithinRadius, 'radius=' + radius.toFixed(3) + ' cys=' + JSON.stringify(localityCheck));

  console.log('§GRIDMOVE-SMARTSCOPE last_op=' + (last && last.op_type) + ' oplog ' + before.len + '->' + after.len +
    ' grid_move_commands=' + commandCount + ' real_governed=' + realGoverned.length);
}, { width: 1200, height: 850, dpr: 2 });
