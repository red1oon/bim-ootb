// W-PVS-PERF (the decisive witness, per FLY_TOUR_DLOD_SCALE.md §16.6 — frame-time A/B, NOT just
// draw-call count, per §13's own lesson that a 3% call cut moved nothing) — issue proved/
// disproved: does §16's portal-PVS room-mismatch (a SUPERSET of §13's plain room-equality) measurably
// improve interior flyPath legs on LTU beyond what §13 alone already bought, on real GPU? Same
// machine/session/route. roomOcclEnabled=true THE WHOLE TIME (§13's mechanism always engaged,
// isolating the INCREMENTAL effect of pvsEnabled on top of it) — four tour runs interleaved
// false,true,true,false to cancel warm-up drift; per-frame rAF dt + renderer.info.render.calls
// sampled on INTERIOR (flyPath) frames only. A negative/no-win result is a valid, reportable
// outcome (§13/§15's own discipline) — do not keep tuning until a number looks good.
const fs = require('fs');
const H = require('./harness');
const LOG = [];
const sink = t => { LOG.push(t); };
const INTERIOR_FRAMES = 3000; // ~50s @60fps of flyPath frames per run

async function runTour(page, enabled, runName) {
  await page.evaluate((en) => {
    const A = window.APP || window.A;
    window.__dlodNav.roomOcclEnabled = true;  // §13's mechanism always ON — isolate PVS's OWN effect
    window.__dlodNav.pvsEnabled = en;
    // clean tour state so toggleFlyAround builds a FRESH route (not resume)
    A.flyActive = false; A.walkMode = false; A.walkActions = []; A.walkActionIdx = 0; A.walkActionT = 0;
    if (A.markDirty) A.markDirty();
  }, enabled);
  await page.evaluate(() => (window.APP || window.A).toggleFlyAround());
  await page.waitForFunction(() => {
    const A = window.APP || window.A;
    return A.flyActive && A.walkActions && A.walkActions.length > 0;
  }, null, { timeout: 180000, polling: 500 });
  const routeSig = await page.evaluate(() => {
    const A = window.APP || window.A;
    return A.walkActions.map(a => a.type + (a.points ? ':' + a.points.length : '')).join(',');
  });
  const samples = await page.evaluate(async (NEED) => {
    const A = window.APP || window.A;
    const S = window.__dlodNav;
    const dts = [], calls = [], boxed = [];
    let last = performance.now(), interior = 0, total = 0;
    while (interior < NEED && total < 40000) {
      await new Promise(r => requestAnimationFrame(r));
      const now = performance.now();
      const dt = now - last; last = now;
      total++;
      if (!A.flyActive) break; // tour ended early
      const act = A.walkActions[A.walkActionIdx];
      if (act && act.type === 'flyPath') {
        interior++;
        dts.push(dt); calls.push(A.renderer.info.render.calls); boxed.push(S.boxed);
      }
    }
    return { dts, calls, boxed, total, interior };
  }, INTERIOR_FRAMES);
  // stop the tour
  await page.evaluate(() => {
    const A = window.APP || window.A;
    A.flyActive = false; A.walkMode = false; A.walkActions = []; A.walkActionIdx = 0; A.walkActionT = 0;
  });
  const roomState = await page.evaluate(() => ({
    changes: window.__dlodNav.roomChanges, evals: window.__dlodNav.roomEvals,
    rects: window.__dlodNav.roomIdxRects, pvsRooms: window.__dlodNav.pvsRooms,
    pvsAvgVisible: window.__dlodNav.pvsAvgVisible }));
  fs.writeFileSync(__dirname + '/w_pvs_perf_' + runName + '.json', JSON.stringify(samples));
  const st = stats(samples.dts), cs = stats(samples.calls), bx = stats(samples.boxed);
  sink('§PVS_PERF run=' + runName + ' pvsEnabled=' + enabled +
    ' interiorFrames=' + samples.interior + ' totalFrames=' + samples.total +
    ' frame_ms mean=' + st.mean.toFixed(2) + ' median=' + st.med.toFixed(2) + ' p95=' + st.p95.toFixed(2) +
    ' drawCalls mean=' + cs.mean.toFixed(0) + ' median=' + cs.med.toFixed(0) +
    ' boxed mean=' + bx.mean.toFixed(0) +
    ' roomChanges=' + roomState.changes + ' pvsRooms=' + roomState.pvsRooms +
    ' pvsAvgVisible=' + roomState.pvsAvgVisible + ' routeSigLen=' + routeSig.length);
  return { enabled, runName, st, cs, bx, routeSig, roomState };
}

function stats(a) {
  if (!a.length) return { mean: 0, med: 0, p95: 0 };
  const s = a.slice().sort((x, y) => x - y);
  return { mean: a.reduce((p, c) => p + c, 0) / a.length,
    med: s[Math.floor(s.length / 2)], p95: s[Math.floor(s.length * 0.95)] };
}

(async () => {
  const { browser, page } = await H.launch(sink);
  try {
    await H.loadLTU(page, sink);
    await H.engageDlod(page, LOG);
    await H.ensureRooms(page, sink);
    const runs = [];
    runs.push(await runTour(page, false, 'off1'));
    runs.push(await runTour(page, true,  'on1'));
    runs.push(await runTour(page, true,  'on2'));
    runs.push(await runTour(page, false, 'off2'));
    // route determinism guard: all four route signatures must be identical
    const sig0 = runs[0].routeSig;
    const sameRoute = runs.every(r => r.routeSig === sig0);
    const agg = en => {
      const rs = runs.filter(r => r.enabled === en);
      return { ms: rs.reduce((p, r) => p + r.st.mean, 0) / rs.length,
        p95: rs.reduce((p, r) => p + r.st.p95, 0) / rs.length,
        calls: rs.reduce((p, r) => p + r.cs.mean, 0) / rs.length,
        boxed: rs.reduce((p, r) => p + r.bx.mean, 0) / rs.length };
    };
    const off = agg(false), on = agg(true);
    sink('§PVS_PERF_SUMMARY sameRoute=' + sameRoute +
      ' pvsOFF(§13-only) frame_ms=' + off.ms.toFixed(2) + ' p95=' + off.p95.toFixed(2) + ' drawCalls=' + off.calls.toFixed(0) + ' boxed=' + off.boxed.toFixed(0) +
      ' | pvsON frame_ms=' + on.ms.toFixed(2) + ' p95=' + on.p95.toFixed(2) + ' drawCalls=' + on.calls.toFixed(0) + ' boxed=' + on.boxed.toFixed(0) +
      ' | delta_ms=' + (on.ms - off.ms).toFixed(2) + ' delta_calls=' + (on.calls - off.calls).toFixed(0));
  } finally {
    fs.writeFileSync(__dirname + '/w_pvs_perf.log', LOG.join('\n'));
    await browser.close();
  }
})().catch(e => { LOG.push('ERR ' + e.stack); fs.writeFileSync(__dirname + '/w_pvs_perf.log', LOG.join('\n')); process.exit(1); });
