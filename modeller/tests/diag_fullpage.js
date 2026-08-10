'use strict';
// Decisive isolation: after the SAME well-timed sequence capture_guide_cut.js uses (t.open, select,
// #b-fit reset, frameElement 0.42), take a FULL-PAGE screenshot (no clip) to see if the wall is visible
// SOMEWHERE in the frame. If yes -> shotClip's crop-region math is the bug (scoped fix). If the whole page
// is also blank/flat -> the camera/scene itself is broken (bigger problem).
const { runE2E } = require('./e2e_harness');
runE2E('DIAG-FULLPAGE', async (t) => {
  await t.open('Duplex');
  await t.pg.evaluate(() => window.Bonsai.select(87));
  await t.flySettle();
  const fit = await t.pg.$('#b-fit'); if (fit) { await fit.click(); await t.sleep(500); }
  await t.frameElement(87, 0.42);
  await t.sleep(300);
  await t.pg.screenshot({ path: '/tmp/claude-1000/-home-red1-bim-compiler/7da1cdf3-0a91-4a23-83a2-922463080789/scratchpad/diag-fullpage-select.png' });
  console.log('  §DIAG full-page (post-select+frame) saved');

  await t.clickSel('#b-cut');
  let tw = null, tw0 = null;
  tw0 = await t.pg.evaluate(() => { const g = window.Bonsai.group(); const m = g.children.find(o => o.isMesh && o.userData.featureId === 87); return m ? (m.geometry.index ? m.geometry.index.count/3 : 0) : null; });
  for (let i = 0; i < 20; i++) { await t.sleep(500); tw = await t.pg.evaluate(() => { const g = window.Bonsai.group(); const m = g.children.find(o => o.isMesh && o.userData.featureId === 87); return m ? (m.geometry.index ? m.geometry.index.count/3 : 0) : null; }); if (tw !== tw0) break; }
  console.log('  §DIAG post-cut tris=' + tw);
  await t.pg.screenshot({ path: '/tmp/claude-1000/-home-red1-bim-compiler/7da1cdf3-0a91-4a23-83a2-922463080789/scratchpad/diag-fullpage-cut.png' });
  console.log('  §DIAG full-page (post-cut) saved');
  t.assert('DIAG done', true, '');
}, { width: 1200, height: 850, dpr: 2 });
