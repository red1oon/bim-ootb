// W-BUDGET-DELTA (FLY_TOUR_DLOD_SCALE.md §20.4) — quantifies "less boxy" as a real number
// (elements promoted), not a screenshot or a feel, per this project's whitebox FUNDAMENTAL LAW.
// Method: at the SAME frozen aerial pose, measure the settled active/real count with the boost
// mechanism OFF (forceBoost=0, shipped §19 behavior) vs ON and converged (controller-driven,
// same pose as W-BUDGET-STABLE so the two witnesses corroborate each other).
const fs = require('fs');
const H = require('./harness_budget');
const LOG = [];
const sink = t => { LOG.push(t); };

(async () => {
  const { browser, page } = await H.launch(sink);
  try {
    await H.loadLTU(page, sink);
    await H.engageDlod(page, LOG);
    const po = await H.aerialPose(page, 0.25, 0.7);
    await H.setPose(page, po.pos, po.look);
    sink('§BUDGET_DELTA_POSE ' + JSON.stringify(po));

    // OFF: boost forced to 0 — shipped §19 partition at this pose
    await page.evaluate(() => { window.__dlodNav.forceBoost = 0; });
    const off = await H.settle(page, 20000);
    sink('§BUDGET_DELTA_OFF real=' + off.real + ' boxed=' + off.boxed + ' mismatch=' + off.mismatch);

    // ON: controller-driven, let it converge to the dead band (no pin). settle() alone is NOT
    // sufficient here — mismatch=0 is momentarily true at EVERY intermediate boost value during
    // the ramp too (the partition briefly catches up to each step before the next), so a plain
    // settle() can return early on an unconverged boost. Explicitly wait for boost itself to stop
    // changing first (same method as W-BUDGET-STABLE), THEN settle() drains the final partition.
    await page.evaluate(() => { window.__dlodNav.forceBoost = null; });
    const onBoost = await page.evaluate(async () => {
      const S = window.__dlodNav;
      const frame = () => new Promise(r => requestAnimationFrame(r));
      let holdCount = 0, lastBoost = -1;
      const t0 = performance.now();
      while (performance.now() - t0 < 30000) {
        await frame();
        if (S.budgetBoost === lastBoost) holdCount++; else { holdCount = 0; lastBoost = S.budgetBoost; }
        if (holdCount > 40) break;
      }
      return S.budgetBoost;
    });
    const on = await H.settle(page, 20000);
    sink('§BUDGET_DELTA_ON boost=' + onBoost + ' real=' + on.real + ' boxed=' + on.boxed + ' mismatch=' + on.mismatch);

    const deltaReal = on.real - off.real;
    const pctMore = off.real > 0 ? (100 * deltaReal / off.real) : (deltaReal > 0 ? Infinity : 0);
    sink('§BUDGET_DELTA_SUMMARY off_real=' + off.real + ' on_real=' + on.real + ' on_boost=' + onBoost +
      ' delta_real=' + deltaReal + ' pct_more_real=' + (isFinite(pctMore) ? pctMore.toFixed(0) + '%' : 'n/a(off was 0)') +
      ' on_settled=' + (on.mismatch === 0 && on.fades === 0));
    fs.writeFileSync(__dirname + '/w_budget_delta.json', JSON.stringify({ pose: po, off, on, boost: onBoost, deltaReal }, null, 1));
  } finally {
    fs.writeFileSync(__dirname + '/w_budget_delta.log', LOG.join('\n'));
    await browser.close();
  }
})().catch(e => { LOG.push('ERR ' + e.stack); fs.writeFileSync(__dirname + '/w_budget_delta.log', LOG.join('\n')); process.exit(1); });
