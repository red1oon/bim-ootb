'use strict';
// Generalized closeCam (witness_e2e_gridmove_real.js's proven pattern, offset axis made a parameter):
// fid=87's own bbox shape (X=0.55 thin, Y=2.2 long, Z=2.795 tall) means its FACE NORMAL points along X
// (the thin axis) -- wall106 (the round-1 proven case) had the opposite aspect and was offset along Y.
// Probe both candidate offset axes/signs with a full-page screenshot each (no shotClip -- round-1's own
// note: bboxScreen corners are unreliable at this close grazing angle) and eyeball which actually shows
// the wall face, not an edge-on sliver or an occluded/into-another-wall view.
const { runE2E } = require('./e2e_harness');
const closeCamAxis = (t, fid, axis, off) => t.pg.evaluate((f, ax, o) => {
  const cam = window.A.camera, ctl = window.A.controls;
  const g = window.Bonsai.group(); const m = g.children.find(x => x.isMesh && x.userData.featureId === f);
  const c = new window.THREE.Vector3(); new window.THREE.Box3().setFromObject(m).getCenter(c);
  cam.up.set(0, 0, 1);
  const pos = c.clone();
  if (ax === 'x') pos.x += o; else if (ax === 'y') pos.y += o; else pos.z += o;
  cam.position.copy(pos);
  ctl.target.copy(c);
  ctl.update();
  if (window.A.requestRender) window.A.requestRender();
}, fid, axis, off);

runE2E('DIAG-CLOSECAM-ORIENT', async (t) => {
  await t.open('Duplex');
  const FID = 88;
  await t.pg.evaluate((f) => window.Bonsai.select(f), FID);
  await t.flySettle();
  const variants = [['x', 1.8], ['x', -1.8], ['y', 1.8], ['y', -1.8]];
  for (const [axis, off] of variants) {
    await closeCamAxis(t, FID, axis, off);
    await t.sleep(250);
    await t.pg.screenshot({ path: '/tmp/claude-1000/-home-red1-bim-compiler/7da1cdf3-0a91-4a23-83a2-922463080789/scratchpad/orient-fid' + FID + '-' + axis + '-' + (off > 0 ? 'pos' : 'neg') + '.png' });
    console.log('  §ORIENT-SHOT axis=' + axis + ' off=' + off + ' saved');
  }
  t.assert('ORIENT-PROBE done', true, '');
}, { width: 1200, height: 850, dpr: 2 });
