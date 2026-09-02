'use strict';
// Deterministic closeCam sign: offset along the wall's FACE-NORMAL axis (perpendicular to its long
// in-plan axis), choosing the sign that points from the wall's centre TOWARD the whole building's
// centroid -- i.e. "into a room", not blindly guessing both signs. Smaller offset (1.2m, vs the 1.8m
// that stepped fid=88 clean outside the envelope on at least one sign) to stay inside a typical room.
const { runE2E } = require('./e2e_harness');
runE2E('DIAG-CLOSECAM-V2', async (t) => {
  await t.open('Duplex');
  const bldg = await t.pg.evaluate(() => {
    const g = window.Bonsai.group();
    const b = new window.THREE.Box3();
    g.children.forEach(o => { if (o.isMesh) b.expandByObject(o); });
    const c = new window.THREE.Vector3(); b.getCenter(c);
    return [c.x, c.y, c.z];
  });
  console.log('  §BUILDING-CENTROID ' + JSON.stringify(bldg));

  for (const FID of [88, 87, 85, 89]) {
    await t.pg.evaluate((f) => window.Bonsai.select(f), FID);
    await t.flySettle();
    const cand = await t.pg.evaluate((f) => {
      const ops = window.Bonsai.oplog._geomOps();
      const op = ops.find(o => o.id === f);
      const bb = op.parameters.bbox;
      return [bb[1]-bb[0], bb[3]-bb[2], bb[5]-bb[4]];
    }, FID);
    const axis = cand[0] < cand[1] ? 'x' : 'y'; // thin axis = face normal axis
    const info = await t.pg.evaluate((f, ax, bx, by, bz) => {
      const cam = window.A.camera, ctl = window.A.controls;
      const g = window.Bonsai.group();
      const m = g.children.find(o => o.isMesh && o.userData.featureId === f);
      const b = new window.THREE.Box3().setFromObject(m);
      const c = new window.THREE.Vector3(); b.getCenter(c);
      const sign = (ax === 'x') ? Math.sign(bx - c.x) : Math.sign(by - c.y);
      const OFF = 1.2;
      cam.up.set(0, 0, 1);
      const pos = c.clone();
      if (ax === 'x') pos.x += sign * OFF; else pos.y += sign * OFF;
      cam.position.copy(pos);
      ctl.target.copy(c);
      ctl.update();
      if (window.A.requestRender) window.A.requestRender();
      return { centre: [c.x, c.y, c.z], sign, axis: ax };
    }, FID, axis, bldg[0], bldg[1], bldg[2]);
    await t.sleep(250);
    await t.pg.screenshot({ path: '/tmp/claude-1000/-home-red1-bim-compiler/7da1cdf3-0a91-4a23-83a2-922463080789/scratchpad/v2-fid' + FID + '.png' });
    console.log('  §V2-SHOT fid=' + FID + ' ' + JSON.stringify(info) + ' saved');
  }
  t.assert('V2 done', true, '');
}, { width: 1200, height: 850, dpr: 2 });
