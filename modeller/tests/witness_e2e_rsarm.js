#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-RSARM: real-keypress witness for §V8 (prompts/RESUME_MODELLER_POLISH3.md §V8).
 * SCOPE: T arms the Move gizmo's rotate ring ("turn"), S arms the scale cubes — sub-mode ARMING only
 * (R stays Insert, decided 2026-07-03). Arming is affordance (opacity dim + status hint); the drag still
 * commits through the untouched rotZ/scale pointer paths. Read the log after every run.
 *
 * ⚠ FIRST-RED FINDING (probe-verified): a FIXED 0.6m cube drag on a ~long wall gives f≈1.1 which the
 * 0.25-snap rounds to ×1.00 → "scale: no change", NO commit — the raycast was fine (probe hit scaleX
 * clean). Drag distance must scale with the extent (dW = 0.6·ext, the proven W-E2E-SCALE recipe).
 * Order is scale-then-rotate mirroring W-E2E-NUMROT (GEOM_SCALE folds on LOCAL axes).
 *
 * CLAIMS:
 *   A1 ARM-T-AUTOENTER — 't' on a selected insert (NOT in Move) enters Move AND arms rot: __rsArm.kind='rot',
 *                        ring keeps base opacity while a move arrow + a scale cube dim below it.
 *   A2 SWITCH-S        — 's' switches the arm to scale: cubes full opacity, ring dimmed.
 *   A3 DRAG-SCALE      — cube drag while armed commits exactly ONE GEOM_SCALE (exactly one axis factor ≠ 1),
 *                        and the arm SURVIVES the post-commit gizmo rebuild (__rsArm still 'scale').
 *   A4 SWITCH-T        — 't' switches back to rot on the REBUILT gizmo (ring full, cubes dimmed).
 *   A5 DRAG-ROT        — ring drag while armed commits exactly ONE GEOM_ROTATE drot≈30 (right op type).
 *   A6 TOGGLE-OFF      — 't' again disarms: __rsArm null, ring/cube/arrow opacities all back at base
 *                        (arrow restore proves the shared-material _baseOpacity fix — first-RED finding).
 *   A7 GUARDS+ESC      — Ctrl+S arms nothing; typing 's' inside #dim-move arms nothing; 't' re-arms and
 *                        Esc exits Move + clears the arm.
 *   (+ harness NO-ERROR: no pageerror across the sequence.)
 */
'use strict';
const { runE2E } = require('./e2e_harness');

// opacity snapshot of one handle per set, keyed by moveAxis (ring=rotZ 0.9, cube=scaleX/Y/Z 0.95, arrow=x 0.92)
const handleOps = (t) => t.pg.evaluate(() => {
  const gz = window.A.scene.getObjectByName('MoveGizmo'); if (!gz) return null;
  const out = { ring: null, cube: null, arrow: null };
  gz.traverse(o => {
    if (!o.isMesh || !o.material) return;
    const ax = (o.userData && o.userData.moveAxis) || '';
    if (ax === 'rotZ') out.ring = o.material.opacity;
    else if (ax.indexOf('scale') === 0 && out.cube == null) out.cube = o.material.opacity;
    else if (ax === 'x' && out.arrow == null) out.arrow = o.material.opacity;
  });
  return out;
});
const arm = (t) => t.pg.evaluate(() => window.__rsArm ? window.__rsArm.kind : null);
const ringInfo = (t) => t.pg.evaluate(() => {
  const gz = window.A.scene.getObjectByName('MoveGizmo'); if (!gz) return null;
  let ring = null; gz.traverse(o => { if (o.userData && o.userData.moveAxis === 'rotZ') ring = o; });
  if (!ring) return null;
  const c = new window.THREE.Vector3(); gz.getWorldPosition(c);
  const R = (ring.geometry && ring.geometry.parameters && ring.geometry.parameters.radius) || 0.9;
  return { c: [c.x, c.y, c.z], R };
});

runE2E('W-E2E-RSARM', async (t) => {
  await t.open('Duplex');
  const sel = await t.pick({ prefer: 'wall' });                 // a real insert — satisfies BOTH gizmo gates
  if (!sel) { t.assert('pick insert', false, 'no selection'); return; }

  // A1 — 't' from plain selection (not in Move): auto-enter Move + arm rot + dim the other handle sets
  await t.pg.keyboard.press('t'); await t.sleep(500);
  const st1 = await t.pg.evaluate(() => ({ moving: document.getElementById('b-move').classList.contains('on') }));
  const ops1 = await handleOps(t); const a1 = await arm(t);
  t.assert('A1 ARM-T-AUTOENTER (Move entered, rot armed, others dimmed)',
    st1.moving && a1 === 'rot' && ops1 && ops1.ring > 0.8 && ops1.arrow < 0.2 && ops1.cube < 0.2,
    'moving=' + st1.moving + ' arm=' + a1 + ' ops=' + JSON.stringify(ops1));
  await t.frameElement(sel.fid, 0.35);

  // A2 — 's' switches the arm to scale
  await t.pg.keyboard.press('s'); await t.sleep(300);
  const ops2 = await handleOps(t); const a2 = await arm(t);
  t.assert('A2 SWITCH-S (scale armed: cubes full, ring dimmed)',
    a2 === 'scale' && ops2 && ops2.cube > 0.8 && ops2.ring < 0.2,
    'arm=' + a2 + ' ops=' + JSON.stringify(ops2));

  // A3 — drag a scale cube outward (centre→cube direction: cubes sit on the insert's LOCAL axes, §Q1;
  // unrotated element = the proven W-E2E-SCALE drag geometry, see header ⚠)
  const gc = await t.pg.evaluate(() => {
    const gz = window.A.scene.getObjectByName('MoveGizmo'); if (!gz) return null;
    let cube = null; gz.traverse(o => { if (o.userData && o.userData.moveAxis === 'scaleX') cube = o; });
    if (!cube) return null;
    const w = new window.THREE.Vector3(); cube.getWorldPosition(w);
    const c = new window.THREE.Vector3(); gz.getWorldPosition(c);
    return { cube: [w.x, w.y, w.z], c: [c.x, c.y, c.z] };
  });
  if (!gc) { t.assert('A3 DRAG-SCALE', false, 'no scaleX cube'); return; }
  const ext0 = await t.pg.evaluate(f => { const g = window.Bonsai.group();
    const m = g.children.find(o => o.isMesh && o.userData.featureId === f); if (!m) return 0;
    m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox; return b.max.x - b.min.x; }, sel.fid);
  const od = [gc.cube[0] - gc.c[0], gc.cube[1] - gc.c[1], gc.cube[2] - gc.c[2]];
  const oL = Math.hypot(od[0], od[1], od[2]) || 1, dW = Math.max(0.6, 0.6 * ext0);   // see header ⚠: f≈1.6 → 0.25-snap 1.5, never the ×1.00 dead-zone
  const sdown = await t.proj(gc.cube[0], gc.cube[1], gc.cube[2]);
  const sup = await t.proj(gc.cube[0] + od[0] / oL * dW, gc.cube[1] + od[1] / oL * dW, gc.cube[2] + od[2] / oL * dW);
  const log0 = await t.oplog();
  await t.drag(sdown, sup, 10); await t.sleep(1500);
  const log1 = await t.oplog(); const scOp = await t.lastOp(); const a3 = await arm(t);
  const fac = scOp && scOp.parameters ? [scOp.parameters.fx, scOp.parameters.fy, scOp.parameters.fz] : [];
  t.assert('A3 DRAG-SCALE (one GEOM_SCALE while armed, arm survives rebuild)',
    log1.len === log0.len + 1 && scOp && scOp.op_type === 'GEOM_SCALE' && fac.filter(f => f !== 1).length === 1 && a3 === 'scale',
    'len ' + log0.len + '→' + log1.len + ' op=' + (scOp && scOp.op_type) + ' f=' + JSON.stringify(fac) + ' arm=' + a3);

  // A4 — 't' switches back to rot on the rebuilt gizmo
  await t.pg.keyboard.press('t'); await t.sleep(300);
  const ops4 = await handleOps(t); const a4 = await arm(t);
  t.assert('A4 SWITCH-T (rot armed on rebuilt gizmo: ring full, cubes dimmed)',
    a4 === 'rot' && ops4 && ops4.ring > 0.8 && ops4.cube < 0.2,
    'arm=' + a4 + ' ops=' + JSON.stringify(ops4));

  // A5 — drag the ring 30° while armed → exactly ONE GEOM_ROTATE
  const giz = await ringInfo(t);
  if (!giz) { t.assert('A5 DRAG-ROT', false, 'no ring'); return; }
  const th = 30 * Math.PI / 180;
  const rdown = await t.proj(giz.c[0] + giz.R, giz.c[1], giz.c[2]);
  const rup = await t.proj(giz.c[0] + giz.R * Math.cos(th), giz.c[1] + giz.R * Math.sin(th), giz.c[2]);
  await t.drag(rdown, rup, 12); await t.sleep(1500);
  const log2 = await t.oplog(); const rotOp = await t.lastOp();
  t.assert('A5 DRAG-ROT (one GEOM_ROTATE drot≈30 while armed)',
    log2.len === log1.len + 1 && rotOp && rotOp.op_type === 'GEOM_ROTATE' && Math.abs(Math.abs(rotOp.parameters.drot) - 30) < 0.6,
    'len ' + log1.len + '→' + log2.len + ' op=' + (rotOp && rotOp.op_type) + ' drot=' + (rotOp && rotOp.parameters && rotOp.parameters.drot));

  // A6 — 't' again disarms: everything back at base opacity (incl. the shared-material arrows)
  await t.pg.keyboard.press('t'); await t.sleep(300);
  const ops6 = await handleOps(t); const a6 = await arm(t);
  t.assert('A6 TOGGLE-OFF (disarmed, base opacities restored incl. arrows)',
    a6 === null && ops6 && ops6.ring > 0.8 && ops6.cube > 0.8 && ops6.arrow > 0.8,
    'arm=' + a6 + ' ops=' + JSON.stringify(ops6));

  // A7 — guards, then Esc clears: Ctrl+S no-arm, typing in a field no-arm, 't' re-arms, Esc exits + clears
  await t.pg.keyboard.down('Control'); await t.pg.keyboard.press('s'); await t.pg.keyboard.up('Control'); await t.sleep(200);
  const aCtrl = await arm(t);
  await t.pg.click('#dim-move'); await t.pg.type('#dim-move', 's'); await t.sleep(200);
  const aType = await arm(t);
  await t.pg.evaluate(() => { const d = document.getElementById('dim-move'); d.value = ''; d.blur(); });
  await t.pg.keyboard.press('t'); await t.sleep(300);
  const a7pre = await arm(t);
  await t.pg.keyboard.press('Escape'); await t.sleep(300);
  const st7 = await t.pg.evaluate(() => ({ moving: document.getElementById('b-move').classList.contains('on'), arm: window.__rsArm ? window.__rsArm.kind : null }));
  t.assert('A7 GUARDS+ESC (Ctrl+S no-arm, typed no-arm, re-arm then Esc clears)',
    aCtrl === null && aType === null && a7pre === 'rot' && !st7.moving && st7.arm === null,
    'ctrl=' + aCtrl + ' typed=' + aType + ' pre=' + a7pre + ' moving=' + st7.moving + ' arm=' + st7.arm);
}, { width: 1200, height: 850, dpr: 1 });
