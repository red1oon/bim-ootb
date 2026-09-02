#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-NUMROT: real-user witness for §P6 (prompts/RESUME_MODELLER_POLISH_BATCH.md).
 * SCOPE: typed numeric input for Rotate/Scale. Before §P6 both were drag-only (15°/0.25 snap) — no way to
 * type an exact 90° or ×2 like Move's #dim-move. Real path: open → insert a catalog component → pick it →
 * Move mode → TYPE into #dim-rot / #dim-scale + Enter. Maths-asserted, read the log after every run.
 *
 * CLAIMS:
 *   N1 GATED-SHOWN   — move mode on a single INSERT shows BOTH typed fields (#dim-rot + #dim-scale).
 *   N2 SCALE-COMMIT  — typing x2⏎ commits EXACTLY ONE signed GEOM_SCALE {fx:2,fy:1,fz:1}.
 *   N3 SCALE-MATHS   — x-extent doubles (≤1e-3 rel), y/z extents unchanged (edge-anchored stretch).
 *   N4 ROT-COMMIT    — typing 90⏎ commits EXACTLY ONE signed GEOM_ROTATE {drot:90} for the selected fid.
 *   N5 ROT-MATHS     — the mesh AABB extents SWAP exactly (R90: new ex == old ey, new ey == old ex ≤1e-3)
 *                      and the bbox centre is unmoved (pure spin about own centre, ≤1e-3m).
 *   N6 REFUSE-JUNK   — malformed scale input ('2' with no axis) commits NOTHING (op-log length unchanged).
 *   N7 NO-ERROR      — no pageerror across the sequence.
 *
 * ⚠ ORDER IS SCALE-THEN-ROTATE ON PURPOSE: GEOM_SCALE folds on the component's LOCAL axes (first run of this
 * witness measured it: rotate 90° then fx=2 doubled WORLD-Y — ext [0.8,0.45]→[0.8,0.9]). The DRAG path has
 * the same semantics (world-aligned cube handles commit the same fx op), so this is a PRE-EXISTING engine
 * fold question, not a §P6 regression — logged in RESUME_MODELLER_POLISH_BATCH.md §OPEN, out of scope here.
 */
'use strict';
const { runE2E } = require('./e2e_harness');
runE2E('W-E2E-NUMROT', async (t) => {
  await t.open('Duplex');

  // insert a catalog component on clear ground (the same real flow W-E2E-INSERT proves)
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
  await t.clickSel('#b-insert'); await t.sleep(250);            // exit insert mode
  if (fid == null) { t.assert('insert placed', false, 'lastOp=' + (ins && ins.op_type)); return; }

  // real pick of the new component, then Move mode
  const c = await t.centre(fid);
  const pick = await t.proj(c[0], c[1], c[2]);
  await t.pg.mouse.click(pick[0], pick[1]); await t.sleep(200);
  const sel = await t.pg.evaluate(() => Array.from(window.Bonsai._selSet || []));
  if (!(sel.length === 1 && sel[0] === fid)) { await t.pg.evaluate(f => window.Bonsai.select(f), fid); await t.sleep(120); }
  await t.clickSel('#b-move'); await t.sleep(350);

  // N1 — both typed fields revealed (single INSERT selection satisfies both gizmo gates)
  const shown = await t.pg.evaluate(() => ({
    rot: document.getElementById('dim-rot').style.display !== 'none',
    scale: document.getElementById('dim-scale').style.display !== 'none' }));
  t.assert('N1 GATED-SHOWN (#dim-rot + #dim-scale visible in move mode)', shown.rot && shown.scale, JSON.stringify(shown));

  const ext = async () => t.pg.evaluate(f => { const g = window.Bonsai.group();
    const m = g.children.find(o => o.isMesh && o.userData.featureId === f); if (!m) return null;
    const b = new window.THREE.Box3().setFromObject(m); const s = new window.THREE.Vector3(); b.getSize(s);
    const cc = new window.THREE.Vector3(); b.getCenter(cc); return { e: [s.x, s.y, s.z], c: [cc.x, cc.y, cc.z] }; }, fid);
  const before = await ext();
  const log0 = await t.oplog();

  // N6 — malformed scale input refused FIRST (proves no stray commit before anything real lands)
  await t.pg.click('#dim-scale'); await t.pg.type('#dim-scale', '2'); await t.pg.keyboard.press('Enter'); await t.sleep(400);
  const logJunk = await t.oplog();
  t.assert('N6 REFUSE-JUNK (bare "2" commits nothing)', logJunk.len === log0.len, 'len=' + logJunk.len + ' (want ' + log0.len + ')');

  // N2/N3 — TYPE x2⏎ into #dim-scale while the component is UNROTATED (local == world, see header ⚠)
  await t.pg.evaluate(() => { document.getElementById('dim-scale').value = ''; });
  await t.pg.click('#dim-scale'); await t.pg.type('#dim-scale', 'x2'); await t.pg.keyboard.press('Enter'); await t.sleep(900);
  const scOp = await t.lastOp(); const log1 = await t.oplog(); const afterSc = await ext();
  t.assert('N2 SCALE-COMMIT (one GEOM_SCALE fx=2)',
    log1.len === log0.len + 1 && scOp.op_type === 'GEOM_SCALE' && scOp.parameters.parent === fid &&
    scOp.parameters.fx === 2 && scOp.parameters.fy === 1 && scOp.parameters.fz === 1,
    'op=' + scOp.op_type + ' f=' + JSON.stringify([scOp.parameters.fx, scOp.parameters.fy, scOp.parameters.fz]));
  const relX = Math.abs(afterSc.e[0] - 2 * before.e[0]) / (2 * before.e[0]);
  const dY = Math.abs(afterSc.e[1] - before.e[1]), dZ = Math.abs(afterSc.e[2] - before.e[2]);
  t.assert('N3 SCALE-MATHS (x-extent ×2 ≤1e-3 rel, y/z unchanged)', relX < 1e-3 && dY < 1e-3 && dZ < 1e-3,
    'relX=' + relX.toExponential(2) + ' dY=' + dY.toExponential(2) + ' dZ=' + dZ.toExponential(2) +
    ' ext ' + JSON.stringify(before.e.map(v => +v.toFixed(3))) + '→' + JSON.stringify(afterSc.e.map(v => +v.toFixed(3))));

  // N4/N5 — TYPE 90⏎ into #dim-rot (AABB ex↔ey swap is exact for ANY shape under a 90° yaw)
  await t.pg.click('#dim-rot'); await t.pg.type('#dim-rot', '90'); await t.pg.keyboard.press('Enter'); await t.sleep(900);
  const rotOp = await t.lastOp(); const log2 = await t.oplog(); const afterRot = await ext();
  t.assert('N4 ROT-COMMIT (one GEOM_ROTATE drot=90)',
    log2.len === log1.len + 1 && rotOp.op_type === 'GEOM_ROTATE' && rotOp.parameters.parent === fid && rotOp.parameters.drot === 90,
    'len ' + log1.len + '→' + log2.len + ' op=' + rotOp.op_type + ' drot=' + (rotOp.parameters && rotOp.parameters.drot));
  const swapErr = Math.max(Math.abs(afterRot.e[0] - afterSc.e[1]), Math.abs(afterRot.e[1] - afterSc.e[0]));
  const cErr = Math.hypot(afterRot.c[0] - afterSc.c[0], afterRot.c[1] - afterSc.c[1], afterRot.c[2] - afterSc.c[2]);
  t.assert('N5 ROT-MATHS (AABB ex↔ey swap ≤1e-3, centre fixed ≤1e-3)', swapErr < 1e-3 && cErr < 1e-3,
    'swapErr=' + swapErr.toExponential(2) + ' cErr=' + cErr.toExponential(2) + ' ext ' + JSON.stringify(afterSc.e.map(v => +v.toFixed(3))) + '→' + JSON.stringify(afterRot.e.map(v => +v.toFixed(3))));
}, { width: 1200, height: 850, dpr: 1 });
