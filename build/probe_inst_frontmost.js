#!/usr/bin/env node
// # ⚠ DO NOT REMOVE — probe 4 (not a witness): is a walked ELEC INSTANCE ever the frontmost raycast hit
// (needed for a genuine instance-level hover/pick exclusion claim)? Samples records × screen offsets from a
// per-record camera; also: does the instance become frontmost after its authored twin is hidden (V1 API)?
// Read the log after the run; exit code is not evidence.
'use strict';
const { runE2E } = require('../modeller/tests/e2e_harness');
runE2E('PROBE-INST-FRONTMOST', async (t) => {
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
    const cam = window.A.camera, ctl = window.A.controls;
    const ops = window.Bonsai.oplog._geomOps();
    const key = p => (+p.x).toFixed(4) + '|' + (+p.y).toFixed(4) + '|' + (+p.z).toFixed(4);
    const fidByKey = {};
    ops.forEach(o => { const pm = o.parameters; if (pm && pm._dw && pm._dw.disc === 'ELEC' && pm.placement)
      (fidByKey[pm.placement.x.toFixed(4) + '|' + pm.placement.y.toFixed(4) + '|' + pm.placement.z.toFixed(4)] =
        fidByKey[pm.placement.x.toFixed(4) + '|' + pm.placement.y.toFixed(4) + '|' + pm.placement.z.toFixed(4)] || []).push(o.id); });
    const rc = new window.THREE.Raycaster();
    function frontAt(ndcX, ndcY) {
      rc.setFromCamera(new window.THREE.Vector2(ndcX, ndcY), cam);
      const list = g.children.filter(o => o.isMesh && o.visible)
        .concat(root.children.filter(o => (o.isInstancedMesh || o.isMesh) && o.visible));
      return rc.intersectObjects(list, false)[0] || null;
    }
    const out = [];
    for (let i = 0; i < sub.length && out.length < 10; i += 13) {
      const p = sub[i]; if (!p || p.gated || p.clash) continue;
      const idx = W.indexOf(p); if (idx < 0) continue;
      cam.position.set(p.x + 1.6, p.y - 1.6, p.z + 0.9); ctl.target.set(p.x, p.y, p.z); ctl.update();
      const v0 = new window.THREE.Vector3(p.x, p.y, p.z).project(cam);
      // 5x5 NDC offsets ±0.12 around the record
      let natural = 0, afterTwinHide = 0, total = 0, sampleNat = null, sampleAfter = null;
      const fids = fidByKey[key(p)] || [];
      for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
        const nx = v0.x + dx * 0.06, ny = v0.y + dy * 0.06; total++;
        const h = frontAt(nx, ny);
        if (h && h.object === im && h.object.userData.dwSub[h.instanceId] === p) { natural++; if (!sampleNat) sampleNat = [nx, ny]; }
      }
      // hide authored twin(s) via the §V1 production API, re-sample
      fids.forEach(f => window.Bonsai.setFeatureVisible(f, false));
      for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
        const nx = v0.x + dx * 0.06, ny = v0.y + dy * 0.06;
        const h = frontAt(nx, ny);
        if (h && h.object === im && h.object.userData.dwSub[h.instanceId] === p) { afterTwinHide++; if (!sampleAfter) sampleAfter = [nx, ny]; }
      }
      fids.forEach(f => window.Bonsai.setFeatureVisible(f, true));
      out.push({ i, idx, twinFids: fids, natural: natural + '/' + total, afterTwinHide: afterTwinHide + '/' + total });
    }
    return { probed: out };
  });
  res.probed.forEach(o => console.log('  §PROBE4 ' + JSON.stringify(o)));
  t.assert('probe ran (see §PROBE4 lines)', res.probed.length > 0, '');
}, { width: 1200, height: 850, dpr: 1 });
