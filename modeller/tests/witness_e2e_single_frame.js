#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-SINGLE-FRAME: real-user witness for §SINGLE-FRAME (bim-compiler
 * prompts/MODELLER_ZOOM_TO_SELECTION.md §SINGLE-FRAME). Read the log after every run.
 * ISSUE IT PROVES OR DISPROVES: a walked Outliner LEAF click framed every element at a fixed 3.6 m from ABOVE
 * (frameInstanceRow → _frameTo(point, 1.5)), so a small device was a few px and a ceiling-hung one sat behind its
 * own ceiling. Real path: open Duplex → production discWalk → real click on a leaf row.
 * CLAIMS:
 *   S1 SIZE    projected box height of the framed instance in [1/16, 1/4] of the canvas height. RED on main.
 *   S2 BELOW   a mount=BOTTOM leaf: camera z < element z, and the first scene ray hit toward its centre is that instance.
 *   S3 VISIBLE a leaf with no BOTTOM mount is framed from above unless a ray shows that view blocked, then from below; the first
 *              ray hit from the final camera is the instance (or the log says occluded=both). Measured on the first fix: an
 *              unmounted FP head framed from above hit a ceiling element first.
 *   S4 TARGET  controls.target = the instance box centre ≤ 1e-3.
 *   F1 FACE    §FACING: wall-anchored schedule rows carry face = [cos rot, sin rot, 0], BOTTOM binds [0,0,-1].
 *   F2 FRONT   a wall-faced leaf is framed from its face side; the first ray hit lies inside the device's own box (its
 *              signed folded twin counts). Measured before §FACING: all 6 Duplex ELEC close-ups logged occluded=both.
 *   F3 COUNTS  walk placed/provisional unchanged vs main (face is a new field only).
 * A claim with no leaf of its kind on this building prints INCONCLUSIVE, never PASS.
 */
'use strict';
const { runE2E } = require('./e2e_harness');

// in-page: find a leaf of the wanted mount kind, return its row id + instance identity
const FIND = (disc, wantBottom) => {
  const g = window.Bonsai.group(); const root = g.children.find(o => o.userData && o.userData.dwRoot);
  const W = (window.__dwWalks && window.__dwWalks[disc]) || [];
  for (let idx = 0; idx < W.length; idx++) {
    const p = W[idx]; if (!p || (p.mount === 'BOTTOM') !== wantBottom) continue;
    for (const im of root.children) { if (!im.isInstancedMesh || !Array.isArray(im.userData.dwSub)) continue;
      const i = im.userData.dwSub.indexOf(p); if (i >= 0) return { row: 'dwp|' + disc + '|' + idx, mount: p.mount || null, ims: root.children.indexOf(im), i }; }
  }
  return null;
};
// in-page: measure the framed instance — projected box height / canvas, camera vs element z, first ray hit
const MEASURE = (a) => {
  const g = window.Bonsai.group(); const root = g.children.find(o => o.userData && o.userData.dwRoot);
  const im = root.children[a.ims], cam = window.A.camera, ct = window.A.controls; cam.updateMatrixWorld();
  if (!im.geometry.boundingBox) im.geometry.computeBoundingBox();
  const m = new THREE.Matrix4(); im.getMatrixAt(a.i, m);
  const bb = im.geometry.boundingBox.clone().applyMatrix4(m.premultiply(im.matrixWorld));
  const c = bb.getCenter(new THREE.Vector3()); let y0 = Infinity, y1 = -Infinity;
  for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) { const v = new THREE.Vector3(x, y, z).project(cam); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
  const rc = new THREE.Raycaster(); rc.set(cam.position.clone(), c.clone().sub(cam.position).normalize());
  const hits = rc.intersectObjects(window.A.scene.children, true).filter(h => h.object.visible !== false && h.object.isMesh && !(h.object.material && h.object.material.visible === false));
  const h0 = hits[0] || null; const own = bb.clone().expandByScalar(0.02);
  return { frac: (y1 - y0) / 2, camZ: cam.position.z, elZ: c.z, dT: ct.target.distanceTo(c), size: bb.getSize(new THREE.Vector3()).toArray().map(v => +v.toFixed(3)),
    dist: +cam.position.distanceTo(c).toFixed(3), firstIsIt: !!(h0 && ((h0.object === im && h0.instanceId === a.i) || own.containsPoint(h0.point))), camPos: cam.position.toArray(), centre: c.toArray(),
    first: h0 ? (h0.object.userData && (h0.object.userData.dwDisc ? 'inst ' + h0.object.userData.dwDisc + '#' + h0.instanceId : 'fid ' + h0.object.userData.featureId)) + ' d=' + h0.distance.toFixed(2) : 'none' };
};

runE2E('W-E2E-SINGLE-FRAME', async (t) => {
  await t.open('Duplex');
  for (const d of ['ELEC', 'ACMV', 'FP']) {
    await t.pg.evaluate((x) => window.discWalk(x, { building: 'Duplex' }), d);
    await t.pg.waitForFunction((x) => window.__dwLastDoneDisc === x, { timeout: 120000 }, d).catch(() => {});
  }
  await t.pg.waitForFunction(() => { const g = window.Bonsai.group(); const root = g && g.children.find(o => o.userData && o.userData.dwRoot);
    const ims = root ? root.children.filter(o => o.isInstancedMesh && Array.isArray(o.userData.dwSub)) : []; return ims.length && ims.every(im => im.count === im.userData.dwSub.length); }, { timeout: 60000 }).catch(() => {});
  await t.sleep(1500); await t.flySettle();
  await t.pg.evaluate(() => { const ol = window.Bonsai.outliner; ol._collapsed = {}; ol._paint(); });
  const mounts = await t.pg.evaluate(() => { const o = {}; Object.keys(window.__dwWalks || {}).forEach(d => (window.__dwWalks[d] || []).forEach(p => { const k = d + ':' + (p && p.mount); o[k] = (o[k] || 0) + 1; })); return o; });
  console.log('§SINGLEFRAME mounts=' + JSON.stringify(mounts));

  // F1 — face written where the walker decides facing: wall-anchored schedule rows [cos rot, sin rot, 0]; BOTTOM binds [0,0,-1]
  const f1 = await t.pg.evaluate(() => { let wall = 0, wallOk = 0, bot = 0, botOk = 0, unset = 0;
    Object.keys(window.__dwWalks || {}).forEach(d => (window.__dwWalks[d] || []).forEach(p => {
      if (!p) return;
      if (p.yaw !== undefined && p.rot != null && /^sched:/.test(p.prov || '')) { wall++; if (Array.isArray(p.face) && Math.abs(p.face[0] - Math.cos(p.rot)) < 1e-9 && Math.abs(p.face[1] - Math.sin(p.rot)) < 1e-9 && p.face[2] === 0) wallOk++; }
      else if (p.mount === 'BOTTOM') { bot++; if (Array.isArray(p.face) && p.face[2] === -1) botOk++; }
      else if (!p.face) unset++; }));
    return { wall, wallOk, bot, botOk, unset }; });
  t.assert('F1 FACE-WRITTEN (wall-anchored schedule rows face = [cos rot, sin rot, 0]; BOTTOM binds face down)', f1.wall > 0 && f1.wallOk === f1.wall && f1.bot > 0 && f1.botOk === f1.bot, JSON.stringify(f1));
  // F3 — counts unchanged: the face is a new field only (main 9017997: ELEC placed=102, ACMV placed=19, FP placed=0 provisional=38)
  const wl = ['ELEC', 'ACMV', 'FP'].map(d => (t.slog.filter(l => new RegExp('§DISC-WALK ' + d + ' placed=').test(l)).pop() || '').replace(/.*(placed=\d+ provisional=\d+).*/, d + ' $1'));
  t.assert('F3 COUNTS-UNCHANGED (walk placed/provisional = main)', wl.join('|') === 'ELEC placed=102 provisional=0|ACMV placed=19 provisional=0|FP placed=0 provisional=38', wl.join(' | '));
  // F2 — a wall-faced leaf: camera on the face side, first ray hit inside the device's own box
  const wleaf = await t.pg.evaluate(() => { const g = window.Bonsai.group(); const root = g.children.find(o => o.userData && o.userData.dwRoot);
    for (const d of Object.keys(window.__dwWalks || {})) { const W = window.__dwWalks[d] || [];
      for (let idx = 0; idx < W.length; idx++) { const p = W[idx]; if (!p || !Array.isArray(p.face) || Math.abs(p.face[2]) > 0.5) continue;
        for (const im of root.children) { if (!im.isInstancedMesh || !Array.isArray(im.userData.dwSub)) continue; const i = im.userData.dwSub.indexOf(p);
          if (i >= 0 && document.querySelector('[data-bnode="dwp|' + d + '|' + idx + '"]')) return { row: 'dwp|' + d + '|' + idx, ims: root.children.indexOf(im), i, face: p.face }; } } }
    return null; });
  if (!wleaf) console.log('  ⚠ INCONCLUSIVE F2: no rendered wall-faced leaf');
  else {
    await t.pg.click('[data-bnode="' + wleaf.row + '"]'); await t.sleep(400); await t.flySettle(120000); await t.sleep(300);
    const m = await t.pg.evaluate(MEASURE, wleaf);
    const fl = t.slog.filter(l => /§FRAME-LEAF/.test(l)).pop() || '';
    const side = (m.camPos[0] - m.centre[0]) * wleaf.face[0] + (m.camPos[1] - m.centre[1]) * wleaf.face[1];
    t.assert('F2 FRONT (wall-faced leaf: camera on the face side, first ray hit inside the device box)', side > 0 && m.firstIsIt && /dir=front/.test(fl),
      'row=' + wleaf.row + ' face=' + wleaf.face.map(v => v.toFixed(2)).join(',') + ' dot=' + side.toFixed(3) + ' first=' + m.first + ' frac=' + m.frac.toFixed(3) + ' log="' + fl.slice(0, 110) + '"');
    await t.pg.keyboard.press('Escape'); await t.sleep(200);
  }

  for (const kind of [{ bottom: true, name: 'BOTTOM' }, { bottom: false, name: 'other' }]) {
    let leaf = null;
    for (const d of ['FP', 'ELEC', 'ACMV']) { leaf = await t.pg.evaluate(FIND, d, kind.bottom); if (leaf) break; }
    if (!leaf) { console.log('  ⚠ INCONCLUSIVE ' + kind.name + ': no walked leaf with that mount on Duplex'); continue; }
    const sel = '[data-bnode="' + leaf.row + '"]';
    const present = await t.pg.evaluate(s => !!document.querySelector(s), sel);
    if (!present) { console.log('  ⚠ INCONCLUSIVE ' + kind.name + ': leaf row ' + leaf.row + ' not rendered'); continue; }
    await t.pg.click(sel); await t.sleep(400); await t.flySettle(120000); await t.sleep(300);   // frame-based fly (25 rAF): ~1 fps under swiftshader with 3 walks drawn
    const m = await t.pg.evaluate(MEASURE, leaf);
    const fl = t.slog.filter(l => /§FRAME-LEAF|§FRAME_FEATURE dwp=/.test(l)).pop() || '';
    console.log('§SINGLEFRAME ' + kind.name + ' row=' + leaf.row + ' mount=' + leaf.mount + ' ' + JSON.stringify(m) + ' log="' + fl.slice(0, 120) + '"');
    if (/occluded=both/.test(fl)) console.log('  ⚠ INCONCLUSIVE S1 ' + kind.name + ': the device is blocked from both sides (' + fl.slice(0, 100) + '), so its framed size is not judged');
    else t.assert('S1 SIZE (' + kind.name + ': projected box height in [1/16, 1/4] of the canvas)', m.frac >= 1 / 16 && m.frac <= 1 / 4, 'frac=' + m.frac.toFixed(4) + ' size=' + m.size.join('x') + ' dist=' + m.dist);
    if (kind.bottom) t.assert('S2 BELOW (BOTTOM-mounted: camera under it, first ray hit = the instance)', m.camZ < m.elZ && m.firstIsIt, 'camZ=' + m.camZ.toFixed(2) + ' elZ=' + m.elZ.toFixed(2) + ' first=' + m.first);
    else t.assert('S3 VISIBLE (no BOTTOM mount: from above unless that view is blocked; first ray hit = the instance, or the log says occluded=both)',
      (m.firstIsIt && (m.camZ > m.elZ || /dir=up/.test(fl))) || /occluded=both/.test(fl), 'camZ=' + m.camZ.toFixed(2) + ' elZ=' + m.elZ.toFixed(2) + ' first=' + m.first + ' log="' + fl.slice(0, 90) + '"');
    t.assert('S4 TARGET (' + kind.name + ': controls.target = instance box centre ≤1e-3)', m.dT < 1e-3, 'dT=' + m.dT.toExponential(2));
    await t.pg.keyboard.press('Escape'); await t.sleep(200);
  }
}, { width: 1200, height: 850, dpr: 1 });
