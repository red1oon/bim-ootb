#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-DM-SNAPGEOM: real-user, maths-asserted E2E of H2 snap-to-geometry
 * (RESUME_SESSION_2026-07-08.md §OPEN item 4 — the direct-manip witness batch).
 *
 * ISSUE THIS PROVES OR DISPROVES: H2 (drag snaps to OTHER features' vertices/edge-mids/face-centres,
 * beating the grid) shipped with only a dispatched-PointerEvent dev witness (bonsai_snapgeom_live.js,
 * ?snapgeom=demo) — never driven through REAL browser input. This drives the real path: real click-select,
 * real #b-move toolbar click, real XY-hub mouse drag — and asserts the committed delta is the EXACT
 * snapped value, not the raw drag.
 *
 * Fixture (hand-chosen exact numbers):
 *   grid xs=ys=[0..7] pitch 1 (integer gridlines), wall A bbox x[0,1] y[0,1] z[0,3],
 *   wall B bbox x[5.2,6.2] y[5.2,6.2] z[0,3] — B's near corner (5.2,5.2) deliberately OFF-grid.
 *   Real XY-hub drag of raw (+4.05,+4.08) puts A's far corner at (5.05,5.08) — 0.192m from B's
 *   corner on the free axes, inside GEOM_SNAP_TOL 0.3 and NOT resolvable by the 5.0 gridline.
 *   HAND-DERIVED EXACT COMMIT: ndx = raw + (5.2 − (1+raw)) = 4.2 — the raw drag epsilon cancels
 *   ALGEBRAICALLY, so the committed delta must be 4.2/4.2 EXACTLY, raw imprecision and all.
 *
 *   G1 SELECT+ARM        — real click on A selects it; real #b-move click arms the gizmo.
 *   G2 MARKER-MID-DRAG   — the snap marker (window.__snapMarkerShown) is up DURING the drag.
 *   G3 COMMIT-EXACT-SNAP — ONE GEOM_MOVE, dx==4.2 AND dy==4.2 exactly (±1e-6) — the snapped value,
 *                          provably NOT the raw (4.05,4.08) and NOT the grid's (4.5,4.5).
 *   G4 SNAP-LOG          — the real `§SNAPGEOM commit kind=geom … marker=(5.20,5.20,…)` line fired.
 *   G5 SCENE-CORNER-MET  — A's refolded far corner sits at (5.2,5.2): ON B's vertex, NOT the 5.0
 *                          gridline (geometry beat grid).
 *   G6 CHAIN             — signed op count 3 (2 inserts + 1 move), KernelOps chain verifies.
 */
'use strict';
const { runE2E } = require('./e2e_harness');

runE2E('W-E2E-DM-SNAPGEOM', async (t) => {
  const pg = t.pg;
  const ids = await pg.evaluate(async () => {
    const O = window.Bonsai.oplog;
    window.Bonsai.grid.define({ xs: [0, 1, 2, 3, 4, 5, 6, 7], ys: [0, 1, 2, 3, 4, 5, 6, 7], xlabels: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], ylabels: ['1', '2', '3', '4', '5', '6', '7', '8'] });
    window.Bonsai.grid.show(true); O.clear();
    const A = await O.commit({ op_type: 'GEOM_EXTRUDE_POLY', parameters: { profile: { points: [[0, 0], [1, 0], [1, 1], [0, 1]] }, depth: 3 } }, { color: 0x9fb4c8 });
    const B = await O.commit({ op_type: 'GEOM_EXTRUDE_POLY', parameters: { profile: { points: [[5.2, 5.2], [6.2, 5.2], [6.2, 6.2], [5.2, 6.2]] }, depth: 3 } }, { color: 0x9fb4c8 });
    const meshOf = f => window.Bonsai.group().children.find(o => o.isMesh && o.userData.featureId === f);
    for (let i = 0; i < 120 && !(meshOf(A.id) && meshOf(B.id)); i++) await new Promise(r => setTimeout(r, 50));
    return [A.id, B.id];
  });
  const [fA, fB] = ids;
  console.log('§DM-SNAP fixture A=' + fA + ' B=' + fB);

  // oblique camera (NOT top-down): from straight above, the gizmo's Z shaft projects onto the same
  // pixel as the XY hub and the raycast grabs 'z' instead of 'xy' (first run failed exactly there).
  await pg.evaluate(() => { const cam = window.A.camera, ctl = window.A.controls; cam.up.set(0, 0, 1); cam.position.set(10, -5, 13); ctl.target.set(3, 3, 0); ctl.update(); if (window.A.requestRender) window.A.requestRender(); });
  await t.sleep(350);
  const proj = (x, y, z) => pg.evaluate((a, b, c) => { const v = new window.THREE.Vector3(a, b, c).project(window.A.camera); const cv = window.A.renderer.domElement, r = cv.getBoundingClientRect(); return [(v.x * 0.5 + 0.5) * r.width + r.left, (-v.y * 0.5 + 0.5) * r.height + r.top]; }, x, y, z);
  const bboxOf = (fid) => pg.evaluate(f => { const m = window.Bonsai.group().children.find(o => o.isMesh && o.userData.featureId === f); if (!m) return null; m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox; return [b.min.x, b.max.x, b.min.y, b.max.y]; }, fid);

  // ── G1: real click-select A, real toolbar Move ──────────────────────────────────────────────────
  const pa = await proj(0.5, 0.5, 3);                            // ray straight down hits A's top face
  await pg.mouse.move(pa[0], pa[1]); await t.sleep(60);
  await pg.mouse.click(pa[0], pa[1]); await t.sleep(250);
  const selected = await pg.evaluate(() => window.Bonsai._selSet ? Array.from(window.Bonsai._selSet) : []);
  await pg.click('#b-move'); await t.sleep(300);
  const armed = await pg.evaluate(() => ({ on: !!document.querySelector('#b-move.on'), gizmo: !!window.A.scene.getObjectByName('MoveGizmo') }));
  console.log('§DM-SNAP selected=' + JSON.stringify(selected) + ' armed=' + JSON.stringify(armed));
  t.assert('G1 SELECT+ARM (real click selects A; real #b-move click arms the gizmo)',
    selected.length === 1 && selected[0] === fA && armed.on && armed.gizmo, JSON.stringify({ selected, armed }));

  // ── G2/G3: real XY-hub drag by raw (+4.05,+4.08); snap must pull the commit to EXACTLY (4.2,4.2) ─
  const hub = await proj(0.5, 0.5, 1.5);                         // hub sits at c0 = A's bbox centre
  const target = await proj(0.5 + 4.05, 0.5 + 4.08, 1.5);        // raw drag point on the z=1.5 drag plane
  await pg.mouse.move(hub[0], hub[1]); await t.sleep(60);
  await pg.mouse.down(); await t.sleep(80);
  await pg.mouse.move((hub[0] + target[0]) / 2, (hub[1] + target[1]) / 2, { steps: 5 }); await t.sleep(50);
  await pg.mouse.move(target[0], target[1], { steps: 6 }); await t.sleep(120);
  const markerMidDrag = await pg.evaluate(() => window.__snapMarkerShown === true);
  await pg.mouse.up(); await t.sleep(900);
  t.assert('G2 MARKER-MID-DRAG (snap marker visible while the drag hovers near B\'s vertex)',
    markerMidDrag === true, 'markerShown=' + markerMidDrag);

  const res = await pg.evaluate(() => {
    const O = window.Bonsai.oplog;
    const mv = O._geomOps().filter(o => o.op_type === 'GEOM_MOVE');
    return {
      moves: mv.map(m => ({ parent: m.parent, dx: +m.parameters.dx, dy: +m.parameters.dy, dz: +m.parameters.dz })),
      lastSnap: window.__lastSnap || null,
      signed: O.db.exec("SELECT COUNT(*) FROM kernel_ops WHERE sig IS NOT NULL")[0].values[0][0],
    };
  });
  const verify = await t.verifyChain();
  console.log('§DM-SNAP moves=' + JSON.stringify(res.moves) + ' lastSnap=' + JSON.stringify(res.lastSnap) + ' signed=' + res.signed + ' verify=' + verify);
  const m0 = res.moves[0] || {};
  t.assert('G3 COMMIT-EXACT-SNAP (ONE GEOM_MOVE; dx==4.2 dy==4.2 EXACTLY — snapped, not raw 4.05/4.08, not grid 4.5)',
    res.moves.length === 1 && m0.parent === fA &&
    Math.abs(m0.dx - 4.2) < 1e-6 && Math.abs(m0.dy - 4.2) < 1e-6 && m0.dz === 0,
    'moves=' + JSON.stringify(res.moves));
  const snapLog = t.slog.find(l => /^§SNAPGEOM commit kind=geom/.test(l));
  t.assert('G4 SNAP-LOG (real §SNAPGEOM commit line: kind=geom, marker on B\'s vertex (5.20,5.20))',
    !!snapLog && snapLog.includes('marker=(5.20,5.20') &&
    res.lastSnap && res.lastSnap.kind === 'geom' && Math.abs(res.lastSnap.marker.x - 5.2) < 1e-3 && Math.abs(res.lastSnap.marker.y - 5.2) < 1e-3,
    'log=' + snapLog + ' lastSnap=' + JSON.stringify(res.lastSnap));

  let aAfter = null;
  for (let i = 0; i < 100; i++) { aAfter = await bboxOf(fA); if (aAfter && Math.abs(aAfter[1] - 5.2) < 1e-3) break; await t.sleep(80); }
  console.log('§DM-SNAP A.after=' + JSON.stringify(aAfter));
  t.assert('G5 SCENE-CORNER-MET (A\'s far corner refolded to (5.2,5.2) — B\'s vertex, NOT the 5.0 gridline)',
    !!aAfter && Math.abs(aAfter[1] - 5.2) < 1e-3 && Math.abs(aAfter[3] - 5.2) < 1e-3 && Math.abs(aAfter[1] - 5.0) > 0.1,
    'A.after=' + JSON.stringify(aAfter));
  t.assert('G6 CHAIN (3 signed ops = 2 inserts + 1 move; chain verifies)',
    res.signed === 3 && verify === true, 'signed=' + res.signed + ' verify=' + verify);
  await t.shot('01-snapped');
});
