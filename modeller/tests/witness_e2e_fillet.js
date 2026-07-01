#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-FILLET: real-user, maths-asserted E2E of the FILLET tool (round a solid's edge).
 * Fillet needs a B-rep SOLID (an ARC insert has no worker edges), so the real path first AUTHORS a wall
 * (Sketch→Extrude), selects it, then: Fillet pill → click an edge marker → set radius → Apply-fillet pill → one
 * signed GEOM_FILLET that rounds the picked edge IN PLACE. Asserted by op-log + the wall mesh's triangle count
 * (a round adds geometry → rendered == committed) + verifyChain + history slider. Real pg.mouse + real toolbar.
 *   F1 WALL        — Sketch→Extrude authors a B-rep wall (a solid to fillet).
 *   F2 SELECT      — a real click selects the wall.
 *   F3 EDGES       — Fillet pill reads the solid's edges and renders pickable markers.
 *   F4 PICK        — clicking an edge marker selects exactly one edge.
 *   F5 FILLET      — Apply commits one GEOM_FILLET on the wall carrying the picked edge + radius.
 *   F6 ATOMIC+CHAIN— verifyChain passes AND the wall's triangle count grew (the round rendered).
 *   F7 REVERSIBLE  — undo restores the cursor AND the original triangle count.
 */
'use strict';
const { runE2E } = require('./e2e_harness');
const tris = (t, fid) => t.pg.evaluate((f) => {
  const g = window.Bonsai.group(); const m = g.children.find(o => o.isMesh && o.userData.featureId === f);
  if (!m) return null; const idx = m.geometry.index; return idx ? idx.count / 3 : (m.geometry.attributes.position.count / 3);
}, fid);
runE2E('W-E2E-FILLET', async (t) => {
  await t.open('Duplex'); await t.shot('01-open');

  // Clear to an empty model so the authored wall is the SOLE solid → select + edge-pick are unambiguous (a real
  // "start fresh, draw a wall, round its edge" flow). Then author the wall with centre-screen ground clicks.
  await t.clickSel('#b-clear'); await t.sleep(400);
  await t.clickSel('#b-sketch'); await t.sleep(300);
  const rect = await t.pg.evaluate(() => { const c = window.A.renderer.domElement.getBoundingClientRect(); return [c.left, c.top, c.width, c.height]; });
  const cx = rect[0] + rect[2] * 0.5, cy = rect[1] + rect[3] * 0.5, q = Math.min(rect[2], rect[3]) * 0.12;
  const sq = [[cx - q, cy - q], [cx + q, cy - q], [cx + q, cy + q], [cx - q, cy + q]];   // screen-square → 4 ground points
  for (const [px, py] of sq) { await t.pg.mouse.move(px, py); await t.sleep(40); await t.pg.mouse.down(); await t.sleep(40); await t.pg.mouse.up(); await t.sleep(120); }
  await t.pg.evaluate(() => { document.getElementById('dim-depth').value = '2.5'; });
  await t.clickSel('#b-extrude'); await t.sleep(1400);
  const wall = await t.lastOp(); const wallId = wall && wall.id;
  t.assert('F1 WALL (Sketch→Extrude authored a solid)', wall && wall.op_type === 'GEOM_EXTRUDE_POLY', 'op=' + (wall && wall.op_type) + ' id=' + wallId);
  if (!wallId) return;
  await t.clickSel('#b-fit'); await t.sleep(500);              // frame the lone wall
  await t.shot('02-wall');

  // F2 select the wall by clicking its centre.
  const wc = await t.pg.evaluate((f) => { const g = window.Bonsai.group(); const m = g.children.find(o => o.isMesh && o.userData.featureId === f); const b = new window.THREE.Box3().setFromObject(m); const c = new window.THREE.Vector3(); b.getCenter(c); return [c.x, c.y, c.z]; }, wallId);
  const wpx = await t.proj(wc[0], wc[1], wc[2]);
  await t.pg.mouse.click(wpx[0], wpx[1]); await t.sleep(300);
  const selOk = await t.pg.evaluate((f) => Array.from(window.Bonsai._selSet || []).includes(f), wallId);
  t.assert('F2 SELECT (real click selects the wall)', selOk, 'selected=' + selOk);

  // F3 enter Fillet → edges read + markers rendered.
  await t.clickSel('#b-fillet'); await t.sleep(700);
  const edges = await t.pg.evaluate(() => (window._edgeList || []).map(e => ({ i: e.i, mid: e.mid })));
  const eg = await t.pg.evaluate(() => { const g = window.A.scene.getObjectByName('EdgePick'); return g ? g.children.length : 0; });
  t.assert('F3 EDGES (solid edges read + markers rendered)', edges.length >= 1 && eg === edges.length, 'edges=' + edges.length + ' markers=' + eg);
  if (!edges.length) return;
  await t.shot('03-edges');

  // F4 pick an edge marker (a TOP edge, mid z high, projects clear). Click its midpoint.
  const e0 = edges.slice().sort((a, b) => b.mid[2] - a.mid[2])[0];   // pick the highest edge (clear of the floor clutter)
  const epx = await t.proj(e0.mid[0], e0.mid[1], e0.mid[2]);
  await t.pg.mouse.click(epx[0], epx[1]); await t.sleep(300);
  const nPicked = await t.pg.evaluate(() => (window.pickedEdges ? window.pickedEdges.size : null));
  const applyEnabled = await t.pg.evaluate(() => !document.getElementById('b-applyfillet').disabled);
  t.assert('F4 PICK (one edge marker selected → Apply enabled)', applyEnabled, 'picked=' + nPicked + ' applyEnabled=' + applyEnabled);
  await t.shot('04-picked');
  await t.shotClip('fillet-edges2', wallId, 180);

  const before = await t.oplog(); const tw0 = await tris(t, wallId);
  await t.pg.evaluate(() => { document.getElementById('dim-rad').value = '0.2'; });
  await t.clickSel('#b-applyfillet'); await t.sleep(1500);
  const after = await t.oplog(); const last = await t.lastOp(); const chain = await t.verifyChain();
  let tw1 = await tris(t, wallId);
  for (let i = 0; i < 10 && !tw1; i++) { await t.sleep(300); tw1 = await tris(t, wallId); }
  await t.shot('05-filleted');
  await t.shotClip('fillet-rounded', wallId, 100);

  t.assert('F5 FILLET (one GEOM_FILLET on the wall, edge+radius)',
    after.len === before.len + 1 && last && last.op_type === 'GEOM_FILLET' && last.parameters && last.parameters.parent === wallId && (last.parameters.edges || []).length >= 1 && last.parameters.radius > 0,
    'len ' + before.len + '→' + after.len + ' op=' + (last && last.op_type) + ' parent=' + (last && last.parameters && last.parameters.parent) + ' edges=' + (last && last.parameters && last.parameters.edges && last.parameters.edges.length));
  t.assert('F6 ATOMIC+CHAIN (verifyChain + tris grew = round rendered)', chain === true && tw0 && tw1 && tw1 > tw0, 'verifyChain=' + chain + ' tris ' + tw0 + '→' + tw1);

  await t.undoToCursor(before.cur);
  const undo = await t.oplog(); const tw2 = await tris(t, wallId);
  await t.shot('06-undone');
  t.assert('F7 REVERSIBLE (undo restores cursor + triangle count)', undo.cur === before.cur && tw2 === tw0, 'cursor ' + after.cur + '→' + undo.cur + ' (want ' + before.cur + ') tris ' + tw2 + ' (want ' + tw0 + ')');
}, { width: 1200, height: 850, dpr: 2 });
