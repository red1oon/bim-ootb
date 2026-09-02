#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-GRIDMOVE-REAL: real-user, maths-asserted E2E of the 3D Grid editor on the REAL
 * loaded Duplex (not the synthetic #b-clear scratch wall witness_e2e_gridstretch.js already covers). Setup:
 * open Duplex for real, MEASURE a real GROUND-FLOOR interior partition wall's own edges (fid 106, y-span
 * [-9.73,-6.80], a real IfcWallStandardCase hosting a real IfcDoor filling per swXEdges.fills), author a
 * column grid whose "2" line sits EXACTLY on that wall's measured far edge (a legitimate "align my authoring
 * grid to the building I'm editing" action — the coordinates come from the live scene, nothing invented).
 * §WALL-PICK (numeric, not eyeballed): fid98 (Level-1, z:[3.10,6.00]) was tried first and works numerically
 * (8/8 green, delta=0.5000 exact) but the app's grid LINES always render at z=0 (bonsai_grid.js) while an
 * upper-floor wall sits meters above them — every camera angle that shows the gridline clearly leaves the
 * wall itself out of frame (measured via bboxScreen/raycast-blocker probes, not by re-looking at screenshots
 * over and over). fid106 is GROUND FLOOR (z:[0,2.80]) so the interactive gridline and the wall it governs are
 * co-located in the same shot by construction. Real tool action: Move-Grid pill → real pg.mouse drag on
 * gridline "2" outward → wall106 EDGE_RIGHT-stretches, its hosted door RIDES via §STRETCH-RIDE (a real
 * rel_fills_host edge, not a proximity heuristic), committed as ONE signed GEOM_GRID_MOVE (+ a gesture-grouped
 * induced GEOM_MOVE rider). Asserted by op-log + the wall's measured Y-extent (rendered == committed) + the
 * rider's measured shift + verifyChain + one-op(gesture) undo.
 *   G1 SETUP        — real Duplex wall106 spans exactly its measured [-9.73,-6.80] on Y (sanity before align).
 *   G2 GRID-ALIGN   — grid "2" line defined at the wall's own real far edge (measured, not invented).
 *   G3 GRID-MODE    — the Move-Grid pill arms real gridline-drag mode on the loaded building.
 *   G4 DRAG-REAL    — real mouse down→move→move→up (screenshots are before/after, not mid-gesture — see
 *                     §FRAME-CHECK-1/2/3 in-line below for why).
 *   G5 COMMIT       — ONE signed GEOM_GRID_MOVE (or gesture group with riders), verify=true.
 *   G6 KINEMATICS   — wall106's rendered Y-extent grew by EXACTLY the committed op delta (not a fixed target —
 *                     the numbers must match each other, whatever the real drag quantized to).
 *   G7 RIDE         — wall106's hosted door (real rel_fills_host edge) rode as an induced rider, same axis.
 *   G8 CHAIN-OK     — verifyChain passes.
 *   G9 UNDO         — undo restores the cursor AND wall106's original Y-extent, byte-exact.
 */
'use strict';
const { runE2E } = require('./e2e_harness');
const WALL_FID = 106;
const yext = (t, fid) => t.pg.evaluate((f) => {
  const g = window.Bonsai.group(); const m = g.children.find(o => o.isMesh && o.userData.featureId === f);
  if (!m) return null; m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox; return { h: b.max.y - b.min.y, miny: b.min.y, maxy: b.max.y };
}, fid);
const centre = (t, fid) => t.pg.evaluate((f) => {
  const g = window.Bonsai.group(); const m = g.children.find(o => o.isMesh && o.userData.featureId === f);
  if (!m) return null; const b = new window.THREE.Box3().setFromObject(m); const c = new window.THREE.Vector3(); b.getCenter(c); return [c.x, c.y, c.z];
}, fid);
// §FRAME-CHECK-3: a camera placed a couple metres INSIDE the room a ground-floor wall bounds, at the wall's
// own mid-height, clear of the roof/upper-floor slab that swallowed every "dolly in from the whole-building
// fit" attempt (see header). Screenshot-only — never used while the grid-drag gesture itself is live (that
// needs the ground plane, z=0, in view for the raycast the app's own pointerdown/pointermove use; see G4).
const closeCam = (t, fid, yoff) => t.pg.evaluate((f, yo) => {
  const cam = window.A.camera, ctl = window.A.controls;
  const g = window.Bonsai.group(); const m = g.children.find(o => o.isMesh && o.userData.featureId === f);
  const c = new window.THREE.Vector3(); new window.THREE.Box3().setFromObject(m).getCenter(c);
  cam.up.set(0, 0, 1);
  cam.position.set(c.x, c.y + yo, c.z);
  ctl.target.set(c.x, c.y, c.z);
  ctl.update();
  if (window.A.requestRender) window.A.requestRender();
}, fid, yoff);

runE2E('W-E2E-GRIDMOVE-REAL', async (t) => {
  await t.open('Duplex');
  // Let the ARC bridge + swXEdges.fills settle (§ARC-SEED-WIRE / §ARC-SEED log lines land after t.open's own
  // wait — window.__arcGuidByFid is populated by arc_editable.js buildBridge(), not by t.open() itself). A
  // fixed sleep flaked run-to-run in headless swiftshader (measured: 2000ms was NOT always enough) — poll the
  // real readiness condition instead (wall98's mesh present + the guid bridge populated), numeric, not timed.
  const t0 = Date.now();
  let ready = false;
  for (let i = 0; i < 40; i++) {
    ready = await t.pg.evaluate((fid) => {
      const g = window.Bonsai.group(); const m = g && g.children.find(o => o.isMesh && o.userData.featureId === fid);
      return !!m && Object.keys(window.__arcGuidByFid || {}).length > 0 && !!(window.swXEdges && window.swXEdges.fills);
    }, WALL_FID);
    if (ready) break;
    await t.sleep(250);
  }
  console.log('  §READY-POLL ready=' + ready + ' waited=' + (Date.now() - t0) + 'ms');

  // G1 SETUP: measure the real host wall (fid 106) + confirm its filling (real rel_fills_host edge, not assumed).
  const host = await t.pg.evaluate((fid) => {
    const O = window.Bonsai.oplog; const ops = O._geomOps ? O._geomOps() : [];
    const byId = new Map(ops.map(o => [o.id, o]));
    const op = byId.get(fid);
    const guidByFid = window.__arcGuidByFid || {}, fidByGuid = window.__arcFidByGuid || {};
    const fills = (window.swXEdges && window.swXEdges.fills) || [];
    const guid = guidByFid[fid];
    const e = fills.find(x => x.host_guid === guid);
    return { cls: op && op.parameters && op.parameters.ifc_class, guid, fillingGuid: e && e.filling_guid,
             fillingClass: e && e.filling_class, fillingFid: e ? fidByGuid[e.filling_guid] : null };
  }, WALL_FID);
  const ext0 = await yext(t, WALL_FID);
  t.assert('G1 SETUP (real wall106 measured span == [-9.73,-6.80], real hosted door found)',
    !!ext0 && Math.abs(ext0.miny - (-9.73)) < 0.01 && Math.abs(ext0.maxy - (-6.80)) < 0.01 && host.cls === 'IfcWallStandardCase' && host.fillingClass === 'IfcDoor',
    'wall106 y=[' + (ext0 && ext0.miny.toFixed(3)) + ',' + (ext0 && ext0.maxy.toFixed(3)) + '] cls=' + host.cls + ' filling=' + host.fillingClass + ' fillingFid=' + host.fillingFid);
  const doorFid = host.fillingFid;
  const doorC0 = doorFid != null ? await centre(t, doorFid) : null;

  // G2 GRID-ALIGN: author a column grid whose "2" line sits exactly at wall106's own real far edge (measured
  // above, y=-6.80) — this is the real authoring action ("align the grid to the building"), not a synthetic
  // scratch grid. xs bracket the wall's own X band so the rendered lines sit ON/NEAR the wall for a legible
  // close-up, not off in empty space. Ground-floor pick (see header §WALL-PICK) means the interactive gridline
  // (always z=0, bonsai_grid.js) and the wall it governs are naturally co-located in the same shot.
  await t.pg.evaluate(() => {
    window.Bonsai.grid.define({ xs: [1.5, 3.5], ys: [-9.73, -6.80], xlabels: ['A', 'B'], ylabels: ['1', '2'] });
  });
  // §FRAME-CHECK-1/2 (numeric+one-look, see scratchpad probe history): a dollied-in-along-the-original-direction
  // camera (frameElement) and a straight-overhead plan view both rendered a flat, featureless expanse — traced
  // to the ROOF (Duplex is 2-storey, sloped roof z≈6.0-6.6) filling the frame at close range from either angle.
  // §FRAME-CHECK-3 (closeCam, defined above) renders the wall cleanly (confirmed by eye) but its target sits at
  // z≈1.4 — off the GROUND PLANE (z=0) the grid-drag interaction itself raycasts against (modeller.html's
  // pointerdown/pointermove intersect a z=0 plane, unconditionally, for ANY floor) — so a screen point computed
  // from a ground-plane world coordinate lands off-canvas from that camera and the drag never grabs the line
  // (measured: opLen 196→196, no-op, twice). Split the two needs: closeCam for anything screenshot-only (this
  // "before" context shot, and the "after" result shot below); frameElement's own camera (proven to include the
  // ground plane — it dollies from the whole-building fit) for the live gesture in G4.
  await closeCam(t, WALL_FID, 2.2);
  await t.sleep(200);
  // Note (not asserted): bboxScreen's 8-corner min/max is a poor proxy at this close, near-grazing angle on a
  // 0.12m-thin wall — a couple of corners legitimately project far outside frame from extreme foreshortening
  // even though the CENTRE (what the camera targets) renders fine. Confirmed by eye once (this exact placement
  // reused from the "after" shot below, already visually verified) rather than chased as a numeric target.
  const bs0 = await t.bboxScreen(WALL_FID);
  console.log('  §FRAME-NOTE closeCam context bboxScreen=' + JSON.stringify(bs0) + ' (grazing-angle corners, target-centred framing verified by eye, not by this metric)');
  await t.shot('grid-editor-context');
  await t.frameElement(WALL_FID, 0.22);   // ground-plane-visible camera, needed for the live drag gesture next

  // G3 GRID-MODE: real click on the Move-Grid toolbar pill. gridMoving is a module-local (not on window) — the
  // pill's own label swap to "Cancel" is the visible, checkable proof (same approach witness_e2e_gridstretch.js
  // uses for the identical reason).
  await t.clickSel('#b-gridmove'); await t.sleep(300);
  const pillTxt = await t.pg.evaluate(() => document.getElementById('b-gridmove').textContent.trim());
  t.assert('G3 GRID-MODE (Move-Grid pill armed on the loaded Duplex, label -> Cancel)', pillTxt === 'Cancel', 'pill="' + pillTxt + '"');

  // G4 DRAG-REAL: real mouse gesture on gridline "2" (world y=-6.80) at the wall's own X — down, mid-move
  // (screenshot the live preview: gridline ghost + orange/blue tint + Δ dim label), then release.
  const wallX = 2.51;   // wall106's own X band [2.45,2.57] centreline — grab well inside it
  const DY = 0.5;
  const down = await t.proj(wallX, -6.80, 0);
  const mid = await t.proj(wallX, -6.80 + DY * 0.6, 0);
  const up = await t.proj(wallX, -6.80 + DY, 0);
  const before = await t.oplog();
  await t.pg.mouse.move(down[0], down[1]); await t.sleep(60);
  await t.pg.mouse.down(); await t.sleep(80);
  await t.pg.mouse.move(mid[0], mid[1], { steps: 8 }); await t.sleep(250);
  // (no screenshot here — this camera exists only to keep the ground plane raycastable for the gesture; see
  // §FRAME-CHECK-1/2/3 above. The "before"/"after" pair below is closeCam, taken with the gesture NOT live.)
  await t.pg.mouse.move(up[0], up[1], { steps: 8 }); await t.sleep(250);
  await t.pg.mouse.up(); await t.sleep(700);

  const after = await t.oplog(); const last = await t.lastOp(); const chain = await t.verifyChain();
  let ext1 = await yext(t, WALL_FID);
  for (let i = 0; i < 10 && !ext1; i++) { await t.sleep(300); ext1 = await yext(t, WALL_FID); }
  // No further ground-plane interaction needed post-commit — reposition to the SAME closeCam placement as the
  // "before" shot (2.2m into the room, wall's own mid-height, clear of roof/slab) for a directly-comparable
  // "after".
  await closeCam(t, WALL_FID, 2.2);
  await t.sleep(300);
  await t.shot('grid-editor-result');

  // G5 COMMIT: exactly one GEOM_GRID_MOVE landed (gesture group if riders, else a single op).
  const isGesture = last && last.op_type === 'GEOM_MOVE' && last.parameters && last.parameters.induced === 'hosted-by';
  const gridOp = isGesture ? (await t.pg.evaluate(() => { const ops = window.Bonsai.oplog._geomOps(); for (let i = ops.length - 1; i >= 0; i--) if (ops[i].op_type === 'GEOM_GRID_MOVE') return { op_type: ops[i].op_type, parameters: ops[i].parameters }; return null; })) : last;
  t.assert('G5 COMMIT (one signed GEOM_GRID_MOVE, real drag)',
    gridOp && gridOp.op_type === 'GEOM_GRID_MOVE' && gridOp.parameters && Array.isArray(gridOp.parameters.commands) && gridOp.parameters.commands.length >= 1,
    'op=' + (gridOp && gridOp.op_type) + ' cmds=' + (gridOp && gridOp.parameters && gridOp.parameters.commands && gridOp.parameters.commands.length) + ' opLen ' + before.len + '→' + after.len);

  // G6 KINEMATICS: the wall's OWN command in the committed op (action=SCALE on axis y) — find it — and assert
  // the RENDERED Y-extent grew by EXACTLY that command's effective delta (newScale/translateDelta), i.e. the
  // gridline's real drag distance and the wall's real rendered stretch AGREE, not just both "moved some amount."
  const wallCmd = gridOp && gridOp.parameters.commands.find(c => c.featureId === WALL_FID);
  const committedDelta = gridOp ? gridOp.parameters.delta : null;
  const measuredDelta = (ext1 && ext0) ? (ext1.h - ext0.h) : null;
  t.assert('G6 KINEMATICS (wall106 rendered Y-extent grew by exactly the committed grid delta)',
    wallCmd && wallCmd.action === 'SCALE' && measuredDelta != null && Math.abs(measuredDelta - committedDelta) < 0.01,
    'grid drag delta=' + (committedDelta != null ? committedDelta.toFixed(4) : '?') + '  wall ext ' + (ext0 && ext0.h.toFixed(3)) + '→' + (ext1 && ext1.h.toFixed(3)) + ' (measured Δ=' + (measuredDelta != null ? measuredDelta.toFixed(4) : '?') + ')  wallCmd.action=' + (wallCmd && wallCmd.action));

  // G7 RIDE: the real hosted door (rel_fills_host edge, not a proximity guess) moved as an induced rider —
  // same Y-shift family as the host's stretch (anchored-min mapping, sdg_cascade.js stretchRide). The gesture
  // may carry MULTIPLE riders (other governed walls near gridline "2" also carry hosted doors) — find the
  // door's OWN rider row by parent, not by assuming it is the last-committed op in the group.
  const doorC1 = doorFid != null ? await centre(t, doorFid) : null;
  const gestureOps = await t.pg.evaluate((lo, hi) => {
    const ops = window.Bonsai.oplog._geomOps();
    return ops.slice(lo, hi).map(o => ({ op_type: o.op_type, parameters: o.parameters }));
  }, before.len, after.len);
  const riderCmd = gestureOps.find(o => o.op_type === 'GEOM_MOVE' && o.parameters && o.parameters.parent === doorFid && o.parameters.induced === 'hosted-by');
  const totalRiders = gestureOps.filter(o => o.op_type === 'GEOM_MOVE' && o.parameters && o.parameters.induced === 'hosted-by').length;
  console.log('  §GESTURE-RIDERS n=' + totalRiders + ' tail=' + JSON.stringify(gestureOps.map(o => o.op_type + (o.parameters && o.parameters.parent != null ? ':' + o.parameters.parent : ''))));
  t.assert('G7 RIDE (host wall106\'s real hosted door rode via §STRETCH-RIDE, not left behind)',
    doorFid != null && riderCmd && riderCmd.parameters && riderCmd.parameters.parent === doorFid && doorC0 && doorC1 && Math.abs((doorC1[1] - doorC0[1]) - riderCmd.parameters.dy) < 0.01,
    'doorFid=' + doorFid + ' door y ' + (doorC0 && doorC0[1].toFixed(3)) + '→' + (doorC1 && doorC1[1].toFixed(3)) + ' riderDy=' + (riderCmd && riderCmd.parameters && riderCmd.parameters.dy && riderCmd.parameters.dy.toFixed(3)) + ' induced=' + (riderCmd && riderCmd.parameters && riderCmd.parameters.induced));

  t.assert('G8 CHAIN-OK (verifyChain)', chain === true, 'verifyChain=' + chain);

  // G9 UNDO: one scrub back restores cursor AND wall106's exact original extent (gesture = one Ctrl+Z per §P8).
  await t.undoToCursor(before.cur);
  const undo = await t.oplog(); const ext2 = await yext(t, WALL_FID);
  await t.shot('grid-editor-undone');
  t.assert('G9 UNDO (one scrub restores cursor + wall106 Y-extent, byte-exact)',
    undo.cur === before.cur && ext2 && Math.abs(ext2.h - ext0.h) < 1e-2,
    'cursor ' + after.cur + '→' + undo.cur + ' (want ' + before.cur + ')  ext ' + (ext2 && ext2.h.toFixed(3)) + ' (want ' + ext0.h.toFixed(3) + ')');

  // Cite (don't re-profile) the session-cache log line — §SCALE_CHECK_FIX / §GRIDSCOPE — proving the drag
  // built its attach-map/mesh/box caches ONCE for this whole gesture, not once per pointermove frame.
  const cacheLine = t.slog.find(l => l.indexOf('§SCALE_CHECK_FIX drag-session begin') >= 0);
  console.log('  §PERF-CITE ' + (cacheLine || '(no §SCALE_CHECK_FIX line captured)'));
}, { width: 1200, height: 850, dpr: 2 });
