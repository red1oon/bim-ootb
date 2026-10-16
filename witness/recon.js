// Exploratory recon (not a witness) — find aerial pose(s)/boost values that sweep active-element
// count across ~5k-30k, for the real W-BUDGET-PERF sweep. Prints active count at each combo.
const fs = require('fs');
const H = require('./harness_budget');
const LOG = [];
const sink = t => { LOG.push(t); console.log(t); };

(async () => {
  const { browser, page } = await H.launch(sink);
  try {
    await H.loadLTU(page, sink);
    await H.engageDlod(page, LOG);
    const env = await page.evaluate(() => {
      const A = window.APP || window.A;
      return A.dbQuery("SELECT MIN(center_x), MAX(center_x), MIN(center_y), MAX(center_y), MIN(center_z), MAX(center_z) FROM element_transforms")[0];
    });
    sink('§RECON_ENV ' + JSON.stringify(env));
    // set forceBoost=0 baseline first to disable controller drift during recon
    await page.evaluate(() => { window.__dlodNav.forceBoost = 0; });
    for (const factor of [0.25]) {
      const po = await H.aerialPose(page, factor, 0.7);
      await H.setPose(page, po.pos, po.look);
      for (const boost of [24, 30, 36, 42, 48, 54, 60, 68, 76, 84]) {
        await page.evaluate((b) => { window.__dlodNav.forceBoost = b; }, boost);
        const a = await H.settle(page, 15000);
        sink('§RECON factor=' + factor + ' boost=' + boost + ' active=' + a.real + ' boxed=' + a.boxed + ' mismatch=' + a.mismatch);
      }
    }
  } finally {
    fs.writeFileSync(__dirname + '/recon.log', LOG.join('\n'));
    await browser.close();
  }
})().catch(e => { LOG.push('ERR ' + e.stack); fs.writeFileSync(__dirname + '/recon.log', LOG.join('\n')); process.exit(1); });
