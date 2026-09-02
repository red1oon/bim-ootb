#!/usr/bin/env node
// # ⚠ DO NOT REMOVE — probe 2 (not a witness): after a REAL ELEC walk on Duplex, does hiding ONE instance
// (new §I5 setPlacementVisible) change pixels at its screen position, given the folded authored twins at the
// same xyz? Measures per-record so the witness can target a genuinely visible instance. Read the log.
'use strict';
const { runE2E } = require('../modeller/tests/e2e_harness');
runE2E('PROBE-INSTHIDE-PIXELS', async (t) => {
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
    const out = [];
    let tried = 0;
    for (let i = 0; i < sub.length && out.length < 12 && tried < 40; i++) {
      const p = sub[i]; if (!p || p.gated || p.clash) continue;
      tried++;
      const idx = W.indexOf(p); if (idx < 0) continue;
      cam.position.set(p.x + 1.6, p.y - 1.6, p.z + 0.9); ctl.target.set(p.x, p.y, p.z); ctl.update();
      const v = new window.THREE.Vector3(p.x, p.y, p.z).project(cam);
      const cv = r.domElement, rect = cv.getBoundingClientRect();
      const sx = (v.x * 0.5 + 0.5) * rect.width + rect.left, sy = (-v.y * 0.5 + 0.5) * rect.height + rect.top;
      const before = block(sx, sy);
      const twins = window.Bonsai.setPlacementVisible('ELEC', idx, false);
      const after = block(sx, sy);
      window.Bonsai.setPlacementVisible('ELEC', idx, true);
      const restored = block(sx, sy);
      out.push({ i, idx, twins, changed: before !== after, roundtrip: before === restored, z: +p.z.toFixed(2) });
    }
    return { imCount: im.count, probed: out };
  });
  console.log('  §PROBE2 imCount=' + res.imCount);
  res.probed.forEach(o => console.log('  §PROBE2 ' + JSON.stringify(o)));
  const changed = res.probed.filter(o => o.changed).length;
  console.log('  §PROBE2 summary changed=' + changed + '/' + res.probed.length +
    ' roundtripOK=' + res.probed.filter(o => o.roundtrip).length);
  t.assert('probe ran (see §PROBE2 lines)', res.probed.length > 0, '');
}, { width: 1200, height: 850, dpr: 1 });
