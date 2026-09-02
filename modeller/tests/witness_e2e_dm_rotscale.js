#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-DM-ROTSCALE: real-user, maths-asserted E2E of H3 gizmo rotate + scale
 * (RESUME_SESSION_2026-07-08.md §OPEN item 4 — the direct-manip witness batch).
 *
 * ISSUE THIS PROVES OR DISPROVES: H3 rotate shipped with a dispatched-PointerEvent dev witness
 * (bonsai_rotate_live.js) whose extents-swap assertion CANNOT distinguish CW from CCW; H3 scale's
 * witness (bonsai_scale_live.js) never touches the gizmo AT ALL (its own header: "driven PURELY
 * through the signed op-log — no canvas pointer"). This witness drives BOTH through real mouse drags
 * on the real gizmo handles, and proves the fold's rotation DIRECTION empirically (the same
 * verify-the-convention-don't-assume-it lesson as this session's arc witness).
 *
 * ROTATE fixture — an L-shaped solid (NO rotational symmetry): ring [(0,0),(2,0),(2,0.5),(0.5,0.5),
 * (0.5,2),(0,2)], depth 1, bbox centre c=(1,1,0.5). Hand-derived coverage oracle (point-in-triangle
 * over the mesh's own XY-projected triangles — robust to re-tessellation):
 *   before:              covers (0.25,1.2) [left arm]   , NOT (1.75,1.2)
 *   after +90 IF CCW:    covers (1.75,1.2) [right arm]  , NOT (0.25,1.2)   ← image = bottom+right L
 *   after +90 IF CW:     covers (0.25,1.2) [left arm]   , NOT (1.75,1.2)   ← image = left+top L
 * The drag itself is hand-constructed to be exactly +90°: grab the yaw ring at world angle 0
 * (c+(R,0)) and release at world angle 90 (c+(0,R)) — 15°-snap absorbs the raycast epsilon.
 *
 *   R1 ARM             — real click-select + real #b-move → gizmo with a rotZ ring.
 *   R2 ONE-ROTATE-OP   — real ring drag commits EXACTLY ONE GEOM_ROTATE {parent, drot:90} (op
 *                        parameter empirically in DEGREES, 15°-snapped) and ZERO GEOM_MOVE (single
 *                        selection ⇒ pure spin, no centroid orbit).
 *   R3 CCW-PROVEN      — post-fold coverage matches the CCW hypothesis AND contradicts the CW one
 *                        (and the no-op one): the kernel folds +drot as COUNTER-CLOCKWISE about +Z.
 *   R4 CENTRE-FIXED    — bbox centre stays (1,1) and size stays 2×2×1 (spin in place, rigid).
 *   R5 ROTATE-LOG      — real `§ROTATE commit drot=90.00 parent=… verify=true` line fired.
 *   R6 SCRUB-RESTORES  — the real #hist-slider scrubbed back one step restores the exact pre-rotate
 *                        coverage (left arm back), scrubbed forward re-applies it (deterministic fold).
 *                        NOTE (2026-07-08): this leg deliberately does NOT use Ctrl+Z — one real Ctrl+Z
 *                        currently fires TWO undos (document-level listener in common/history_bar.js
 *                        _wireKeyboard + the window-level handler in modeller.html §3197 both call
 *                        HB.undo). That regression is pinned RED by W-E2E-DM-GRIDUNDO U6.
 *
 * SCALE fixture — a catalog IfcDoor INSERT at (3,3), yaw 0 (scale cubes are gated to a single
 * insert). Measured baseline ext=ex0; real scaleX-cube drag of +0.5·ex0 along +X ⇒ raw factor
 * (ext+0.5ext)/ext = 1.5, 0.25-snap absorbs the epsilon ⇒ committed f == 1.5 EXACTLY.
 *   C1 ARM-CUBES       — single insert offers scaleX/scaleY/scaleZ cube handles.
 *   C2 ONE-SCALE-OP    — real cube drag commits EXACTLY ONE GEOM_SCALE {fx:1.5, fy:1, fz:1}.
 *   C3 EDGE-ANCHORED   — X extent ×1.5 with the −X (min) edge FIXED; Y and Z extents unchanged.
 *   C4 SCALE-LOG       — real `§SCALE commit x=1.500 parent=… verify=true` line fired.
 *   C5 CHAIN           — signed chain verifies after both legs.
 */
'use strict';
const { runE2E } = require('./e2e_harness');

runE2E('W-E2E-DM-ROTSCALE', async (t) => {
  const pg = t.pg;
  const proj = (x, y, z) => pg.evaluate((a, b, c) => { const v = new window.THREE.Vector3(a, b, c).project(window.A.camera); const cv = window.A.renderer.domElement, r = cv.getBoundingClientRect(); return [(v.x * 0.5 + 0.5) * r.width + r.left, (-v.y * 0.5 + 0.5) * r.height + r.top]; }, x, y, z);
  // coverage oracle: does the mesh's own triangle set, projected to XY, contain world point (px,py)?
  const covers = (fid, px, py) => pg.evaluate((f, qx, qy) => {
    const m = window.Bonsai.group().children.find(o => o.isMesh && o.userData.featureId === f); if (!m) return null;
    const P = m.geometry.getAttribute('position'); const I = m.geometry.getIndex();
    const n = I ? I.count : P.count;
    const at = k => { const i = I ? I.getX(k) : k; return [P.getX(i), P.getY(i)]; };
    const inTri = (p, a, b, c) => {
      const s = (u, v, w) => (w[0] - v[0]) * (p[1] - v[1]) - (w[1] - v[1]) * (p[0] - v[0]);
      const d1 = s(p, a, b), d2 = s(p, b, c), d3 = s(p, c, a);
      const neg = (d1 < 0) || (d2 < 0) || (d3 < 0), pos = (d1 > 0) || (d2 > 0) || (d3 > 0);
      return !(neg && pos);
    };
    for (let k = 0; k + 2 < n + 1; k += 3) { if (inTri([qx, qy], at(k), at(k + 1), at(k + 2))) return true; }
    return false;
  }, fid, px, py);
  const bboxOf = (fid) => pg.evaluate(f => { const m = window.Bonsai.group().children.find(o => o.isMesh && o.userData.featureId === f); if (!m) return null; m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox; return [b.min.x, b.max.x, b.min.y, b.max.y, b.min.z, b.max.z]; }, fid);

  // ═══ LEG 1 — ROTATE (L-shaped solid, direction proven empirically) ═══════════════════════════
  const fL = await pg.evaluate(async () => {
    const O = window.Bonsai.oplog; window.Bonsai.grid.show(false); O.clear();
    const L = await O.commit({ op_type: 'GEOM_EXTRUDE_POLY', parameters: { profile: { points: [[0, 0], [2, 0], [2, 0.5], [0.5, 0.5], [0.5, 2], [0, 2]] }, depth: 1 } }, { color: 0x9fb4c8 });
    const meshOf = f => window.Bonsai.group().children.find(o => o.isMesh && o.userData.featureId === f);
    for (let i = 0; i < 120 && !meshOf(L.id); i++) await new Promise(r => setTimeout(r, 50));
    return L.id;
  });
  const preLeft = await covers(fL, 0.25, 1.2), preRight = await covers(fL, 1.75, 1.2);
  console.log('§DM-ROT fixture fid=' + fL + ' coverage before: left(0.25,1.2)=' + preLeft + ' right(1.75,1.2)=' + preRight);

  // oblique camera (top-down would put the Z shaft over the hub/ring — same lesson as W-E2E-DM-SNAPGEOM)
  await pg.evaluate(() => { const cam = window.A.camera, ctl = window.A.controls; cam.up.set(0, 0, 1); cam.position.set(6, -5, 9); ctl.target.set(1, 1, 0.5); ctl.update(); if (window.A.requestRender) window.A.requestRender(); });
  await t.sleep(350);

  // real click-select on the L's bottom arm top face (1.5, 0.25, 1)
  const pk = await proj(1.5, 0.25, 1);
  await pg.mouse.move(pk[0], pk[1]); await t.sleep(60); await pg.mouse.click(pk[0], pk[1]); await t.sleep(250);
  // §ZOOM-SEL: the select auto-flew the camera — settle, then RESTORE the hand-chosen oblique framing this
  // witness depends on before computing any drag coordinates
  await t.flySettle();
  await pg.evaluate(() => { const cam = window.A.camera, ctl = window.A.controls; cam.up.set(0, 0, 1); cam.position.set(6, -5, 9); ctl.target.set(1, 1, 0.5); ctl.update(); if (window.A.requestRender) window.A.requestRender(); });
  await t.sleep(350);
  await pg.click('#b-move'); await t.sleep(300);
  const ringInfo = await pg.evaluate(() => {
    const gz = window.A.scene.getObjectByName('MoveGizmo'); if (!gz) return null;
    const ring = gz.children.find(o => o.userData.moveAxis === 'rotZ');
    return ring ? { R: ring.geometry.parameters.radius, c: [gz.position.x, gz.position.y, gz.position.z] } : null;
  });
  const sel1 = await pg.evaluate(() => Array.from(window.Bonsai._selSet || []));
  t.assert('R1 ARM (real click-select + real #b-move → gizmo with a rotZ ring)',
    sel1.length === 1 && sel1[0] === fL && !!ringInfo, 'sel=' + JSON.stringify(sel1) + ' ring=' + JSON.stringify(ringInfo));

  // hand-constructed +90° drag: grab ring at world angle 0, release at world angle 90 (about c=(1,1,0.5))
  const { R, c } = ringInfo;
  const g0 = await proj(c[0] + R, c[1], c[2]);
  const gMid = await proj(c[0] + R * Math.SQRT1_2, c[1] + R * Math.SQRT1_2, c[2]);   // 45° waypoint keeps the snap path monotone
  const g90 = await proj(c[0], c[1] + R, c[2]);
  await pg.mouse.move(g0[0], g0[1]); await t.sleep(60);
  await pg.mouse.down(); await t.sleep(80);
  await pg.mouse.move(gMid[0], gMid[1], { steps: 5 }); await t.sleep(50);
  await pg.mouse.move(g90[0], g90[1], { steps: 5 }); await t.sleep(100);
  await pg.mouse.up(); await t.sleep(1200);

  const rotOps = await pg.evaluate(() => {
    const O = window.Bonsai.oplog;
    return {
      rot: O._geomOps().filter(o => o.op_type === 'GEOM_ROTATE').map(o => ({ parent: o.parent, drot: +o.parameters.drot })),
      mov: O._geomOps().filter(o => o.op_type === 'GEOM_MOVE').length,
    };
  });
  console.log('§DM-ROT ops=' + JSON.stringify(rotOps));
  t.assert('R2 ONE-ROTATE-OP (exactly one GEOM_ROTATE {parent,drot:90} — degrees, 15°-snapped; zero GEOM_MOVE)',
    rotOps.rot.length === 1 && rotOps.rot[0].parent === fL && rotOps.rot[0].drot === 90 && rotOps.mov === 0,
    JSON.stringify(rotOps));

  // poll the refold, then the CCW-vs-CW coverage oracle
  let postLeft = null, postRight = null;
  for (let i = 0; i < 100; i++) { postRight = await covers(fL, 1.75, 1.2); if (postRight === true) break; await t.sleep(80); }
  postLeft = await covers(fL, 0.25, 1.2);
  const bb = await bboxOf(fL);
  console.log('§DM-ROT coverage after: left=' + postLeft + ' right=' + postRight + ' bbox=' + JSON.stringify(bb));
  t.assert('R3 CCW-PROVEN (before: left ∧ ¬right; after +90: right ∧ ¬left — matches CCW, contradicts CW and no-op)',
    preLeft === true && preRight === false && postRight === true && postLeft === false,
    'pre=(' + preLeft + ',' + preRight + ') post=(' + postLeft + ',' + postRight + ')');
  const near = (a, b, tol) => Math.abs(a - b) < (tol || 0.02);
  t.assert('R4 CENTRE-FIXED (bbox centre stays (1,1), size stays 2×2×1 — rigid spin in place)',
    !!bb && near((bb[0] + bb[1]) / 2, 1) && near((bb[2] + bb[3]) / 2, 1) &&
    near(bb[1] - bb[0], 2) && near(bb[3] - bb[2], 2) && near(bb[5] - bb[4], 1),
    'bbox=' + JSON.stringify(bb));
  const rotLog = t.slog.find(l => /^§ROTATE commit drot=90\.00 parent=/.test(l));
  t.assert('R5 ROTATE-LOG (real §ROTATE commit line, drot=90.00, verify=true)',
    !!rotLog && rotLog.includes('verify=true'), 'log=' + rotLog);
  await t.shot('01-rotated');

  // real #hist-slider scrub — the fold must restore the exact pre-rotate shape, then re-apply it
  await pg.keyboard.press('Escape'); await t.sleep(200);        // leave Move mode first (clean keyboard context)
  await t.undoToCursor(1);                                       // real slider: back to before the rotate
  let backLeft = null;
  for (let i = 0; i < 100; i++) { backLeft = await covers(fL, 0.25, 1.2); if (backLeft === true) break; await t.sleep(80); }
  const backRight = await covers(fL, 1.75, 1.2);
  await t.undoToCursor(2);                                       // real slider: forward to the rotated tip
  let fwdRight = null;
  for (let i = 0; i < 100; i++) { fwdRight = await covers(fL, 1.75, 1.2); if (fwdRight === true) break; await t.sleep(80); }
  const fwdLeft = await covers(fL, 0.25, 1.2);
  console.log('§DM-ROT scrub back: left=' + backLeft + ' right=' + backRight + '  fwd: left=' + fwdLeft + ' right=' + fwdRight);
  t.assert('R6 SCRUB-RESTORES (real #hist-slider back → exact pre-rotate shape; forward → rotated again)',
    backLeft === true && backRight === false && fwdRight === true && fwdLeft === false,
    'back=(' + backLeft + ',' + backRight + ') fwd=(' + fwdLeft + ',' + fwdRight + ')');

  // ═══ LEG 2 — SCALE (catalog insert, real cube-handle drag) ═══════════════════════════════════
  await pg.keyboard.press('Escape'); await t.sleep(150); await pg.keyboard.press('Escape'); await t.sleep(150);
  const door = await pg.evaluate(async () => {
    const O = window.Bonsai.oplog;
    const g = window.Bonsai.group(); while (g.children.length) g.remove(g.children[0]);   // reset scene like the rotate demo does
    O.clear();
    await window.Bonsai.library.ready();
    const d = window.Bonsai.library.catalog().find(cc => cc.ifc_class === 'IfcDoor');
    const ins = await O.commit({ op_type: 'GEOM_INSERT', parameters: { hash: d.hash, placement: { x: 3, y: 3, z: 0, rot: 0 }, lod: '200' } });
    const meshOf = f => window.Bonsai.group().children.find(o => o.isMesh && o.userData.featureId === f);
    for (let i = 0; i < 120 && !meshOf(ins.id); i++) await new Promise(r => setTimeout(r, 50));
    const m = meshOf(ins.id); m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox;
    return { fid: ins.id, bb: [b.min.x, b.max.x, b.min.y, b.max.y, b.min.z, b.max.z] };
  });
  const ex0 = door.bb[1] - door.bb[0], ey0 = door.bb[3] - door.bb[2], ez0 = door.bb[5] - door.bb[4];
  console.log('§DM-SCALE fixture fid=' + door.fid + ' bb=' + JSON.stringify(door.bb) + ' ext=(' + ex0.toFixed(3) + ',' + ey0.toFixed(3) + ',' + ez0.toFixed(3) + ')');
  await pg.evaluate(() => { const cam = window.A.camera, ctl = window.A.controls; cam.up.set(0, 0, 1); cam.position.set(8, -2, 8); ctl.target.set(3, 3, 1); ctl.update(); if (window.A.requestRender) window.A.requestRender(); });
  await t.sleep(350);

  const dc = [(door.bb[0] + door.bb[1]) / 2, (door.bb[2] + door.bb[3]) / 2];
  const pkd = await proj(dc[0], dc[1], door.bb[5] - 0.02);       // click the door near its top face
  await pg.mouse.move(pkd[0], pkd[1]); await t.sleep(60); await pg.mouse.click(pkd[0], pkd[1]); await t.sleep(250);
  // §ZOOM-SEL: settle the select-fly, restore this section's hand-chosen framing (same as R-section above)
  await t.flySettle();
  await pg.evaluate(() => { const cam = window.A.camera, ctl = window.A.controls; cam.up.set(0, 0, 1); cam.position.set(8, -2, 8); ctl.target.set(3, 3, 1); ctl.update(); if (window.A.requestRender) window.A.requestRender(); });
  await t.sleep(350);
  await pg.click('#b-move'); await t.sleep(300);
  const cubeInfo = await pg.evaluate(() => {
    const gz = window.A.scene.getObjectByName('MoveGizmo'); if (!gz) return null;
    gz.updateMatrixWorld(true);
    const cube = gz.children.find(o => o.userData.moveAxis === 'scaleX'); if (!cube) return null;
    const w = new window.THREE.Vector3(); cube.getWorldPosition(w);
    const axes = gz.children.filter(o => o.userData.moveAxis && String(o.userData.moveAxis).indexOf('scale') === 0).map(o => o.userData.moveAxis).sort();
    return { pos: [w.x, w.y, w.z], axes };
  });
  const sel2 = await pg.evaluate(() => Array.from(window.Bonsai._selSet || []));
  t.assert('C1 ARM-CUBES (single insert selected → scaleX/scaleY/scaleZ cube handles offered)',
    sel2.length === 1 && sel2[0] === door.fid && !!cubeInfo && cubeInfo.axes.join(',') === 'scaleX,scaleY,scaleZ',
    'sel=' + JSON.stringify(sel2) + ' cubes=' + JSON.stringify(cubeInfo && cubeInfo.axes));

  // real cube drag: +0.5·ex0 along world +X ⇒ raw f = 1.5 ± ε ⇒ 0.25-snap ⇒ EXACTLY 1.5
  const cp = cubeInfo.pos;
  const s0 = await proj(cp[0], cp[1], cp[2]);
  const s1 = await proj(cp[0] + 0.5 * ex0, cp[1], cp[2]);
  await pg.mouse.move(s0[0], s0[1]); await t.sleep(60);
  await pg.mouse.down(); await t.sleep(80);
  await pg.mouse.move((s0[0] + s1[0]) / 2, (s0[1] + s1[1]) / 2, { steps: 4 }); await t.sleep(50);
  await pg.mouse.move(s1[0], s1[1], { steps: 5 }); await t.sleep(100);
  await pg.mouse.up(); await t.sleep(1200);

  const scOps = await pg.evaluate(() => {
    const O = window.Bonsai.oplog;
    return O._geomOps().filter(o => o.op_type === 'GEOM_SCALE').map(o => ({ parent: o.parent, fx: +o.parameters.fx, fy: +o.parameters.fy, fz: +o.parameters.fz }));
  });
  console.log('§DM-SCALE ops=' + JSON.stringify(scOps));
  t.assert('C2 ONE-SCALE-OP (real cube drag → exactly one GEOM_SCALE {fx:1.5, fy:1, fz:1} — 0.25-snapped)',
    scOps.length === 1 && scOps[0].parent === door.fid && scOps[0].fx === 1.5 && scOps[0].fy === 1 && scOps[0].fz === 1,
    JSON.stringify(scOps));
  let dbb = null;
  for (let i = 0; i < 100; i++) { dbb = await bboxOf(door.fid); if (dbb && Math.abs((dbb[1] - dbb[0]) - 1.5 * ex0) < 0.02) break; await t.sleep(80); }
  console.log('§DM-SCALE bbox after=' + JSON.stringify(dbb) + ' expected ex=' + (1.5 * ex0).toFixed(3) + ' anchored xmin=' + door.bb[0].toFixed(3));
  t.assert('C3 EDGE-ANCHORED (X extent == 1.5×baseline with −X edge FIXED; Y/Z extents unchanged)',
    !!dbb && Math.abs((dbb[1] - dbb[0]) - 1.5 * ex0) < 0.02 && Math.abs(dbb[0] - door.bb[0]) < 0.01 &&
    Math.abs((dbb[3] - dbb[2]) - ey0) < 0.01 && Math.abs((dbb[5] - dbb[4]) - ez0) < 0.01,
    'after=' + JSON.stringify(dbb));
  const scLog = t.slog.find(l => /^§SCALE commit x=1\.500 parent=/.test(l));
  const verify2 = await t.verifyChain();
  t.assert('C4 SCALE-LOG (real §SCALE commit line, x=1.500, verify=true)',
    !!scLog && scLog.includes('verify=true'), 'log=' + scLog);
  t.assert('C5 CHAIN (signed chain verifies after both legs)', verify2 === true, 'verify=' + verify2);
  await t.shot('02-scaled');
});
