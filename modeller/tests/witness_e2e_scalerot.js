#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-SCALEROT: real-user witness for §Q1 (prompts/RESUME_MODELLER_POLISH2.md).
 * ISSUE IT PROVES: the GEOM_SCALE fold operates on the insert's LOCAL axes (bonsai_library foldInsert), but the
 * scale cube handles, the drag delta and the ghost preview were WORLD-aligned — on a rotated component the
 * preview showed a world-axis stretch while the commit folded a local-axis stretch (preview ≠ fold, logged in
 * RESUME_MODELLER_POLISH_BATCH.md §OPEN by W-E2E-NUMROT's first run). Real path: insert → rotate 90° → Move
 * mode → REAL cube drag. Maths-asserted, read the log after every run.
 *
 * CLAIMS:
 *   S1 HANDLE-LOCAL  — after a 90° yaw, the scaleX cube sits on the LOCAL x axis (world +Y), not world +X.
 *   S2 DRAG-GHOST    — a real drag of that cube shows the ScaleGhost preview (factor visible in #stat).
 *   S3 PREVIEW==FOLD — the ghost AABB captured DURING the drag equals the folded mesh AABB after release
 *                      (≤2e-3 per component — the exact disagreement this fix kills).
 *   S4 OP-LOCAL      — the commit is EXACTLY ONE signed GEOM_SCALE {fx=f, fy:1, fz:1}: the LOCAL axis letter,
 *                      even though the drag direction on screen was world +Y.
 *   S5 WORLD-MATHS   — world-Y extent ×f (≤1e-3 rel) and world-X extent UNCHANGED — pre-fix, the preview
 *                      claimed the opposite (world-X stretch).
 */
'use strict';
const { runE2E } = require('./e2e_harness');
runE2E('W-E2E-SCALEROT', async (t) => {
  await t.open('Duplex');

  // insert a catalog component on clear ground (same real flow as W-E2E-NUMROT)
  await t.clickSel('#b-insert'); await t.sleep(300);
  await t.pg.evaluate(() => { const leaf = document.querySelector('#ins-panel .ins-c[data-hash]'); if (leaf) leaf.click(); return true; });
  await t.sleep(150);
  const spot = await t.clearGround(1.5);
  if (!spot) { t.assert('ground spot', false, 'no clear ground'); return; }
  const px = await t.proj(spot[0] + 0.75, spot[1] + 0.75, 0);
  await t.pg.mouse.move(px[0], px[1]); await t.sleep(150);
  await t.pg.mouse.down(); await t.sleep(80); await t.pg.mouse.up(); await t.sleep(1500);
  const ins = await t.lastOp();
  const fid = ins && ins.op_type === 'GEOM_INSERT' ? ins.id : null;
  await t.clickSel('#b-insert'); await t.sleep(250);
  if (fid == null) { t.assert('insert placed', false, 'lastOp=' + (ins && ins.op_type)); return; }

  // pick it, enter Move mode, rotate 90° via the typed field (the W-E2E-NUMROT-proven path)
  const c0 = await t.centre(fid);
  const pick = await t.proj(c0[0], c0[1], c0[2]);
  await t.pg.mouse.click(pick[0], pick[1]); await t.sleep(200);
  const sel = await t.pg.evaluate(() => Array.from(window.Bonsai._selSet || []));
  if (!(sel.length === 1 && sel[0] === fid)) { await t.pg.evaluate(f => window.Bonsai.select(f), fid); await t.sleep(120); }
  await t.clickSel('#b-move'); await t.sleep(350);
  await t.pg.click('#dim-rot'); await t.pg.type('#dim-rot', '90'); await t.pg.keyboard.press('Enter'); await t.sleep(1000);

  // S1 — the scaleX cube must now sit on LOCAL x == world +Y (gizmo rebuilt by commitRotate)
  const h = await t.pg.evaluate(() => {
    const gz = window.A.scene.children.find(o => o.name === 'MoveGizmo'); if (!gz) return null;
    let cube = null; gz.traverse(o => { if (o.userData && o.userData.moveAxis === 'scaleX') cube = o; }); if (!cube) return null;
    gz.updateMatrixWorld(true);
    const w = cube.getWorldPosition(new window.THREE.Vector3());
    const off = w.clone().sub(gz.position); const L = off.length();
    return { off: [off.x, off.y, off.z], nx: Math.abs(off.x) / L, ny: off.y / L, world: [w.x, w.y, w.z] };
  });
  t.assert('S1 HANDLE-LOCAL (scaleX cube on world +Y after 90° yaw)', !!h && h.nx < 0.05 && h.ny > 0.95,
    h ? 'off=' + JSON.stringify(h.off.map(v => +v.toFixed(3))) : 'no gizmo/cube');
  if (!h) return;

  // real cube drag: down on the cube, drag outward along world +Y (the cube's own axis), sample the ghost, release
  const log0 = await t.oplog();
  const pre = await t.pg.evaluate(fd => { const g = window.Bonsai.group();
    const m = g.children.find(o => o.isMesh && o.userData.featureId === fd); if (!m) return null;
    const b = new window.THREE.Box3().setFromObject(m); const s = new window.THREE.Vector3(); b.getSize(s);
    return [s.x, s.y, s.z]; }, fid);
  const pDown = await t.proj(h.world[0], h.world[1], h.world[2]);
  const pUp = await t.proj(h.world[0], h.world[1] + 0.6, h.world[2]);   // +0.6m along world +Y ⇒ f>1, 0.25-snapped
  await t.pg.mouse.move(pDown[0], pDown[1]); await t.sleep(120);
  await t.pg.mouse.down(); await t.sleep(120);
  for (let i = 1; i <= 6; i++) { await t.pg.mouse.move(pDown[0] + (pUp[0] - pDown[0]) * i / 6, pDown[1] + (pUp[1] - pDown[1]) * i / 6); await t.sleep(60); }
  const during = await t.pg.evaluate(() => {
    const gh = window.A.scene.children.find(o => o.name === 'ScaleGhost'); if (!gh) return null;
    gh.updateMatrixWorld(true);
    const b = new window.THREE.Box3().setFromObject(gh);
    return { min: [b.min.x, b.min.y, b.min.z], max: [b.max.x, b.max.y, b.max.z], stat: document.getElementById('stat').textContent };
  });
  await t.pg.mouse.up(); await t.sleep(1200);
  t.assert('S2 DRAG-GHOST (ScaleGhost live during drag, factor in #stat)', !!during && /scale X ×/.test(during.stat || ''),
    during ? 'stat="' + during.stat + '"' : 'no ghost');
  if (!during) return;

  // S4 — one signed GEOM_SCALE on the LOCAL axis letter (fx), even though the screen drag was world +Y
  const op = await t.lastOp(); const log1 = await t.oplog();
  const f = op && op.parameters ? op.parameters.fx : null;
  t.assert('S4 OP-LOCAL (one GEOM_SCALE fx=f>1, fy=fz=1)',
    log1.len === log0.len + 1 && op.op_type === 'GEOM_SCALE' && op.parameters.parent === fid &&
    f > 1 && op.parameters.fy === 1 && op.parameters.fz === 1,
    'len ' + log0.len + '→' + log1.len + ' op=' + op.op_type + ' f=' + JSON.stringify(op.parameters && [op.parameters.fx, op.parameters.fy, op.parameters.fz]));

  // S3 — the ghost the user saw IS what folded (per-component AABB agreement)
  const after = await t.pg.evaluate(fd => { const g = window.Bonsai.group();
    const m = g.children.find(o => o.isMesh && o.userData.featureId === fd); if (!m) return null;
    const b = new window.THREE.Box3().setFromObject(m);
    return { min: [b.min.x, b.min.y, b.min.z], max: [b.max.x, b.max.y, b.max.z] }; }, fid);
  let dMax = 0;
  for (let k = 0; k < 3; k++) { dMax = Math.max(dMax, Math.abs(after.min[k] - during.min[k]), Math.abs(after.max[k] - during.max[k])); }
  t.assert('S3 PREVIEW==FOLD (ghost AABB == folded AABB ≤2e-3)', dMax < 2e-3,
    'dMax=' + dMax.toExponential(2) + ' ghost=[' + during.min.map(v => +v.toFixed(3)) + ']..[' + during.max.map(v => +v.toFixed(3)) + '] folded=[' + after.min.map(v => +v.toFixed(3)) + ']..[' + after.max.map(v => +v.toFixed(3)) + ']');

  // S5 — vs the PRE-DRAG mesh: world-Y extent ×f, world-X extent unchanged (the pre-fix preview claimed
  // the opposite: a world-X stretch). local x == world Y after the 90° yaw, so fx must land on world Y.
  const eY1 = after.max[1] - after.min[1], eX1 = after.max[0] - after.min[0];
  const relY = Math.abs(eY1 - f * pre[1]) / (f * pre[1]), dX = Math.abs(eX1 - pre[0]);
  t.assert('S5 WORLD-MATHS (world-Y ×f ≤1e-3 rel, world-X unchanged ≤1e-3)', relY < 1e-3 && dX < 1e-3,
    'f=' + f + ' extY ' + pre[1].toFixed(3) + '→' + eY1.toFixed(3) + ' extX ' + pre[0].toFixed(3) + '→' + eX1.toFixed(3) +
    ' relY=' + relY.toExponential(2) + ' dX=' + dX.toExponential(2));
}, { width: 1200, height: 850, dpr: 1 });
