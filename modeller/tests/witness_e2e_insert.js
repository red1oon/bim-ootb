#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-INSERT: real-user, maths-asserted E2E of the INSERT (assemble-from-catalog) tool.
 * Real path: open → click the Insert pill (panel opens) → click a catalog COMPONENT row (arms the ghost) → click a
 * ground cell on the grid → a GEOM_INSERT lands as a signed op-row + a baked mesh. Asserted by op-log + scene-graph
 * census (rendered == committed) + verifyChain + readPixels + the history slider. Real pg.mouse / real toolbar.
 *   I1 ARM        — clicking Insert opens the panel and arming a catalog leaf sets the pending component.
 *   I2 INS-COMMIT — a ground click commits exactly one GEOM_INSERT (op-log +1, op_type, placement present).
 *   I3 CHAIN-OK   — verifyChain passes after the insert.
 *   I4 ATOMIC     — a mesh with featureId == the new op id is in the scene (rendered geometry == committed op).
 *   I5 VISIBLE    — the framebuffer changed (the new box shows).
 *   I6 REVERSIBLE — undo via the history slider restores the cursor AND removes the inserted mesh.
 */
'use strict';
const { runE2E } = require('./e2e_harness');
runE2E('W-E2E-INSERT', async (t) => {
  await t.open('Duplex');
  await t.shot('01-open');
  await t.shot('workspace-open');   // guide frame (§F2 G4 HMI): full workspace after Open+Fit

  // I1 ARM: open the Insert panel, click the first catalog COMPONENT leaf (.ins-c, not an .ins-a assembly).
  await t.clickSel('#b-insert'); await t.sleep(300);
  const arm = await t.pg.evaluate(() => {
    const leaf = document.querySelector('#ins-panel .ins-c[data-hash]');
    if (!leaf) return { ok: false, why: 'no .ins-c leaf in catalog' };
    leaf.click();
    return { ok: window.insertHash != null, hash: window.insertHash, inserting: window.inserting === true, name: leaf.getAttribute('title') };
  }).catch(e => ({ ok: false, why: String(e) }));
  // window.insertHash / window.inserting are module-locals; fall back to a DOM-selected probe if not exposed.
  const armed = await t.pg.evaluate(() => {
    const sel = document.querySelector('#ins-panel .ins-c.sel[data-hash]');
    return { selHash: sel ? sel.getAttribute('data-hash') : null, panelShown: (document.querySelector('#ins-panel') || {}).style && document.querySelector('#ins-panel').style.display === 'block' };
  });
  t.assert('I1 ARM (Insert panel open + catalog leaf armed)', !!armed.selHash && armed.panelShown, 'hash=' + armed.selHash + ' panel=' + armed.panelShown);
  await t.shot('02-armed');
  await t.shot('insert-catalog');   // guide frame (§F2 G4 HMI): catalog panel armed

  // Ground target: a real element's footprint centre dropped to z=0 → project to a client pixel that raycasts
  // to the ground plane (the same plane the place handler intersects). Snap inside the handler decides the cell.
  const probe = await t.pg.evaluate(() => {
    const g = window.Bonsai.group(); const m = g.children.find(o => o.isMesh && o.userData.featureId != null);
    if (!m) return null; const b = new window.THREE.Box3().setFromObject(m); const c = new window.THREE.Vector3(); b.getCenter(c);
    return [c.x + 3, c.y + 3, 0];   // offset a few metres so the new box doesn't sit exactly on a wall
  });
  if (!probe) { t.assert('ground probe', false); return; }
  const px = await t.proj(probe[0], probe[1], probe[2]);

  const before = await t.oplog(); const pix0 = await t.pixsum();
  await t.pg.mouse.move(px[0], px[1]); await t.sleep(120);       // live ghost follows
  await t.pg.mouse.down(); await t.sleep(80); await t.pg.mouse.up(); await t.sleep(1400);  // pointerdown places + LOD upgrade settles
  const after = await t.oplog(); const last = await t.lastOp(); const pix1 = await t.pixsum();
  const chain = await t.verifyChain();
  await t.shot('03-inserted');

  t.assert('I2 INS-COMMIT (one GEOM_INSERT, placement present)',
    after.len === before.len + 1 && last && last.op_type === 'GEOM_INSERT' && last.parameters && last.parameters.placement && last.parameters.hash,
    'len ' + before.len + '→' + after.len + ' op=' + (last && last.op_type) + ' hash=' + (last && last.parameters && last.parameters.hash));
  t.assert('I3 CHAIN-OK (verifyChain)', chain === true, 'verifyChain=' + chain);

  const newId = last && last.id;                                 // census evals the predicate SOURCE in-page → bake the id in (no node closure)
  const fidPred = new Function('o', 'return o.featureId === ' + newId);
  const present = await t.census(fidPred);
  t.assert('I4 ATOMIC (mesh featureId==new op id in scene)', present.n === 1, 'meshes with fid=' + newId + ' → ' + present.n);
  t.assert('I5 VISIBLE (framebuffer changed)', pix0 !== pix1, 'pix ' + pix0 + '→' + pix1);

  await t.clickSel('#b-insert'); await t.sleep(200);   // real toggle-off (exitInsert) — closes the catalog panel, no model change
  await t.shot('insert-placed-raw');   // guide frame (§F2 G4 canvas-crop): raw, cropped post-capture → insert-placed

  await t.undoToCursor(before.cur);
  const undo = await t.oplog(); const gone = await t.census(fidPred);
  await t.shot('04-undone');
  t.assert('I6 REVERSIBLE (undo restores cursor + removes mesh)', undo.cur === before.cur && gone.n === 0, 'cursor ' + after.cur + '→' + undo.cur + ' (want ' + before.cur + ') meshFid' + newId + '=' + gone.n);
}, { width: 1200, height: 850, dpr: 2 });
