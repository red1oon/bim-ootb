#!/usr/bin/env node
// # ⚠ DO NOT REMOVE — probe 3 (not a witness): WHO is frontmost at a walked ELEC instance's screen position
// after the walk commit folds authored twins? For each sampled record: raycast frontmost object (authored
// mesh w/ _dw op? instanced marker?), then pixel-change with (i) instance hidden, (ii) instance+twin hidden.
// Read the log after the run; exit code is not evidence.
'use strict';
const { runE2E } = require('../modeller/tests/e2e_harness');
runE2E('PROBE-FRONTMOST', async (t) => {
  await t.open('Duplex');
  await t.pg.evaluate(() => window.discWalk('ELEC', { building: 'Duplex' }));
  await t.pg.waitForFunction(() => {
    const g = window.Bonsai.group(); const root = g && g.children.find(o => o.userData && o.userData.dwRoot);
    return !!(root && root.children.some(o => o.isInstancedMesh && o.userData.dwDisc === 'ELEC'));
  }, { timeout: 30000 }).catch(() => {});
  await t.sleep(3500);
  const res = await t.pg.evaluate(() => {
    const g = window.Bonsai.group(); const root = g.children.find(o => o.userData && o.userData.dwRoot);
    const ims = root.children.filter(o => o.isInstancedMesh && o.userData.dwDisc === 'ELEC' && o.userData.dwSub)
      .sort((a, b) => b.count - a.count);
    const im = ims[0]; const sub = im.userData.dwSub; const W = window.__dwWalks.ELEC;
    const cam = window.A.camera, ctl = window.A.controls, r = window.A.renderer;
    const ops = window.Bonsai.oplog._geomOps();
    function block(sx, sy) {
      r.render(window.A.scene, window.A.camera);
      const gl = r.getContext(); const cv = r.domElement; const rect = cv.getBoundingClientRect();
      const bw = gl.drawingBufferWidth, bh = gl.drawingBufferHeight;
      const gx = Math.round((sx - rect.left) * bw / rect.width), gy = Math.round(bh - (sy - rect.top) * bh / rect.height);
      const px = new Uint8Array(24 * 24 * 4);
      gl.readPixels(Math.max(0, gx - 12), Math.max(0, gy - 12), 24, 24, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let h = 0; for (let k = 0; k < px.length; k++) h = (h * 31 + px[k]) >>> 0;
      return h;
    }
    const rc = new window.THREE.Raycaster();
    const out = [];
    for (let i = 0; i < sub.length && out.length < 8; i += 17) {
      const p = sub[i]; if (!p || p.gated || p.clash) continue;
      const idx = W.indexOf(p); if (idx < 0) continue;
      cam.position.set(p.x + 1.6, p.y - 1.6, p.z + 0.9); ctl.target.set(p.x, p.y, p.z); ctl.update();
      const v = new window.THREE.Vector3(p.x, p.y, p.z).project(cam);
      const cv = r.domElement, rect = cv.getBoundingClientRect();
      const sx = (v.x * 0.5 + 0.5) * rect.width + rect.left, sy = (-v.y * 0.5 + 0.5) * rect.height + rect.top;
      // raycast exactly like pickAt: visible group meshes + visible dwRoot instanced buckets
      rc.setFromCamera(new window.THREE.Vector2(v.x, v.y), cam);
      const list = g.children.filter(o => o.isMesh && o.visible)
        .concat(root.children.filter(o => (o.isInstancedMesh || o.isMesh) && o.visible));
      const hits = rc.intersectObjects(list, false);
      const front = hits[0] || null;
      let kind = 'none', fid = null, dw = null, sameRec = false, dist = null;
      if (front) {
        dist = +front.distance.toFixed(3);
        if (front.object.isInstancedMesh && front.object.userData.dwSub) {
          kind = 'instance'; sameRec = front.object.userData.dwSub[front.instanceId] === p;
        } else if (front.object.userData && front.object.userData.featureId != null) {
          kind = 'authored'; fid = front.object.userData.featureId;
          const op = ops.find(o => o.id === fid);
          dw = op && op.parameters && op.parameters._dw ? op.parameters._dw.disc : null;
        } else kind = front.object.type;
      }
      // second hit info (is the instance right behind?)
      let second = null;
      if (hits[1]) second = (hits[1].object.isInstancedMesh ? 'instance(same=' +
        (hits[1].object.userData.dwSub && hits[1].object.userData.dwSub[hits[1].instanceId] === p) + ')' :
        'mesh fid=' + hits[1].object.userData.featureId) + ' d=' + hits[1].distance.toFixed(3);
      // pixel change: instance only, then instance+authored-twin
      const before = block(sx, sy);
      window.Bonsai.setPlacementVisible('ELEC', idx, false);
      const afterInst = block(sx, sy);
      let twinFid = null;
      if (kind === 'authored' && dw === 'ELEC') { const m = g.children.find(o => o.userData.featureId === fid); if (m) { m.visible = false; twinFid = fid; } }
      const afterBoth = block(sx, sy);
      if (twinFid != null) { const m = g.children.find(o => o.userData.featureId === twinFid); if (m) m.visible = true; }
      window.Bonsai.setPlacementVisible('ELEC', idx, true);
      out.push({ i, idx, kind, fid, dw, sameRec, dist, second,
        chInst: before !== afterInst, chBoth: before !== afterBoth });
    }
    return { imCount: im.count, probed: out, opsWithDw: ops.filter(o => o.parameters && o.parameters._dw && o.parameters._dw.disc === 'ELEC').length };
  });
  console.log('  §PROBE3 imCount=' + res.imCount + ' authoredDwOps=' + res.opsWithDw);
  res.probed.forEach(o => console.log('  §PROBE3 ' + JSON.stringify(o)));
  t.assert('probe ran (see §PROBE3 lines)', res.probed.length > 0, '');
}, { width: 1200, height: 850, dpr: 1 });
