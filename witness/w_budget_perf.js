// W-BUDGET-PERF (FLY_TOUR_DLOD_SCALE.md §20.2/§20.4) — issue proved/disproved: at what real
// active-element count does frame_ms actually start climbing meaningfully above the §10 fully-
// boxed aerial floor (17.3ms)? MEASURE BEFORE ESTIMATING — the 20k figure from conversation is a
// starting guess only, not trusted here. Method: ONE fixed aerial pose (factor=0.25, angle=0.7 —
// found via recon.js to sweep active count smoothly with boost), forceBoost pinned to a series of
// values so the resulting active-element count sweeps ~1k-45k (recon-confirmed real counts, not
// invented round numbers); at each, settle to mismatch=0/fades=0 then sample REAL rendered frames
// (static camera — isolates render cost from camera/eval cost) for frame_ms + draw calls.
const fs = require('fs');
const H = require('./harness_budget');
const LOG = [];
const sink = t => { LOG.push(t); };
const SAMPLE_FRAMES = 180; // 3s @60fps of static-camera render cost per point

function stats(a) {
  const s = a.slice().sort((x, y) => x - y);
  return { mean: a.reduce((p, c) => p + c, 0) / a.length,
    med: s[Math.floor(s.length / 2)], p95: s[Math.floor(s.length * 0.95)] };
}

(async () => {
  const { browser, page } = await H.launch(sink);
  try {
    await H.loadLTU(page, sink);
    await H.engageDlod(page, LOG);
    await page.evaluate(() => { window.__dlodNav.budgetBoostEnabled = false; window.__dlodNav.forceBoost = 0; });
    const po = await H.aerialPose(page, 0.25, 0.7);
    await H.setPose(page, po.pos, po.look);
    sink('§BUDGET_PERF_POSE ' + JSON.stringify(po));

    // Baseline: fully-boxed floor at this exact pose (boost forced 0), for direct comparison to
    // the §10 wide-orbit figure (17.3ms) rather than assuming it transfers unchanged.
    const boosts = [0, 24, 30, 36, 42, 48, 54, 60, 68, 76, 84];
    const points = [];
    for (const b of boosts) {
      await page.evaluate((bb) => { window.__dlodNav.forceBoost = bb; }, b);
      const a = await H.settle(page, 20000);
      if (a.mismatch !== 0 || a.fades !== 0) throw new Error('did not settle at boost=' + b + ' mismatch=' + a.mismatch + ' fades=' + a.fades);
      const samples = await page.evaluate(async (NEED) => {
        const A = window.APP || window.A;
        const dts = [], calls = [];
        let last = performance.now();
        for (let i = 0; i < NEED; i++) {
          if (A.markDirty) A.markDirty(); // static camera — force a real render each sampled frame
          await new Promise(r => requestAnimationFrame(r));
          const now = performance.now();
          dts.push(now - last); last = now;
          calls.push(A.renderer.info.render.calls);
        }
        return { dts, calls };
      }, SAMPLE_FRAMES);
      const st = stats(samples.dts), cs = stats(samples.calls);
      const pt = { boost: b, active: a.real, boxed: a.boxed,
        frame_ms_mean: +st.mean.toFixed(2), frame_ms_p95: +st.p95.toFixed(2),
        drawCalls_mean: Math.round(cs.mean) };
      points.push(pt);
      sink('§BUDGET_PERF_POINT boost=' + b + ' active=' + a.real + ' boxed=' + a.boxed +
        ' frame_ms_mean=' + pt.frame_ms_mean + ' frame_ms_p95=' + pt.frame_ms_p95 +
        ' drawCalls_mean=' + pt.drawCalls_mean);
    }
    fs.writeFileSync(__dirname + '/w_budget_perf_sweep.json', JSON.stringify(points, null, 1));
    const floor = points[0]; // boost=0, this pose's fully-boxed floor
    sink('§BUDGET_PERF_FLOOR active=' + floor.active + ' frame_ms_mean=' + floor.frame_ms_mean +
      ' drawCalls_mean=' + floor.drawCalls_mean + ' (cf. §10 wide-orbit fully-boxed 17.3ms/16 calls)');
    // Report the knee: first point where frame_ms_mean exceeds floor by >50%
    let knee = null;
    for (const p of points) { if (p.frame_ms_mean > floor.frame_ms_mean * 1.5) { knee = p; break; } }
    sink('§BUDGET_PERF_KNEE ' + (knee ? JSON.stringify(knee) : 'none found in sweep range'));
  } finally {
    fs.writeFileSync(__dirname + '/w_budget_perf.log', LOG.join('\n'));
    await browser.close();
  }
})().catch(e => { LOG.push('ERR ' + e.stack); fs.writeFileSync(__dirname + '/w_budget_perf.log', LOG.join('\n')); process.exit(1); });
