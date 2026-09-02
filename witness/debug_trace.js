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
    await page.evaluate(() => { window.__dlodNav.forceBoost = null; window.__dlodNav.budgetBoostEnabled = true; });
    const trace = await page.evaluate(async () => {
      const S = window.__dlodNav;
      const frame = () => new Promise(r => requestAnimationFrame(r));
      const out = [];
      const t0 = performance.now();
      let lastB = -1;
      while (performance.now() - t0 < 40000) {
        await frame();
        const a = window.__dlodNavAudit();
        if (S.budgetBoost !== lastB) {
          lastB = S.budgetBoost;
          out.push({ t: +(performance.now() - t0).toFixed(0), boost: S.budgetBoost, active: S.active, boxed: S.boxed, mismatch: a.mismatch, fades: a.fades });
        }
      }
      const final = window.__dlodNavAudit();
      return { changes: out, final: { boost: S.budgetBoost, active: S.active, mismatch: final.mismatch, fades: final.fades } };
    });
    sink('§TRACE ' + JSON.stringify(trace.changes));
    sink('§TRACE_FINAL ' + JSON.stringify(trace.final));
  } finally {
    fs.writeFileSync(__dirname + '/debug_trace.log', LOG.join('\n'));
    await browser.close();
  }
})().catch(e => { LOG.push('ERR ' + e.stack); fs.writeFileSync(__dirname + '/debug_trace.log', LOG.join('\n')); process.exit(1); });
