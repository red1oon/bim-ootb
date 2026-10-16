// §R15 PROBE — CPE_4D_PERF_MEM_STUDY.md §R15.0/§R15.1. Issue it proves or disproves:
//   C1 — does the §20 budget controller integrate on STALE feedback during a MOVING-camera fly
//        tour (no scan pass completed since its previous step)?
//   C2 — does the integrator WIND UP (saturated at MAX_BOOST while the measurement still asks for
//        more, so the step bought nothing)?
//   C3 — what is the per-frame cost split while the boost is MOVING vs. STEADY?
// This is a PROBE, not the fix witness: it changes no behaviour, it only reads the counters
// §R15 added to dlod_nav.js plus the shipped §-log.
//
// Run:  WITNESS_URL=http://localhost:8421/viewer/viewer.html?db=/buildings/LTU_AHouse_extracted.db \
//       node witness/probe_r15_tour.js
const fs = require('fs');
const H = require('./harness_budget');
const LOG = [];
const sink = t => { LOG.push(t); };
const OUT = __dirname + '/probe_r15_tour';
const TOUR_MS = +(process.env.R15_TOUR_MS || 120000);

(async () => {
  const { browser, page } = await H.launch(sink);
  try {
    await H.loadLTU(page, sink);
    await H.engageDlod(page, LOG);
    sink('§R15_PROBE_ENGAGED');

    // Per-frame sampler. Runs on its OWN rAF chain so it observes the viewer's loop rather than
    // participating in it; every field is read straight off live state, none is derived here.
    await page.evaluate(() => {
      const A = window.APP || window.A;
      window.__r15 = { samples: [], on: true, t0: performance.now() };
      let last = performance.now();
      (function step() {
        if (!window.__r15.on) return;
        const now = performance.now();
        const S = window.__dlodNav;
        const ri = A.renderer ? A.renderer.info : null;
        window.__r15.samples.push({
          t: +(now - window.__r15.t0).toFixed(0),
          dt: +(now - last).toFixed(2),
          boost: S.budgetBoost, elig: S.activeElig, active: S.active, boxed: S.boxed,
          passSeq: S.passSeq, evalMs: S.evalMs,
          bTicks: S.budgetTicks, bStale: S.budgetStaleTicks, bWind: S.budgetWindupTicks,
          calls: ri ? ri.render.calls : -1, tris: ri ? ri.render.triangles : -1,
          fly: A.flyActive ? 1 : 0, eng: window._dlodNavEngaged ? 1 : 0
        });
        last = now;
        requestAnimationFrame(step);
      })();
    });

    // Fire the REAL fly tour (the reported scenario), not a synthetic camera path.
    await page.evaluate(() => window.toggleFlyAround());
    sink('§R15_PROBE_FLY_REQUESTED');
    // Wait for the tour to actually start moving the camera — prepare is async (room graph).
    let started = false;
    for (let i = 0; i < 240; i++) {
      const st = await page.evaluate(() => {
        const A = window.APP || window.A;
        return { fly: !!A.flyActive, targets: (A.flyTargets || []).length, prep: !!A._flyPreparing };
      });
      if (st.fly && st.targets > 0) { started = true; sink('§R15_PROBE_TOUR_START targets=' + st.targets + ' waited_s=' + i); break; }
      await new Promise(r => setTimeout(r, 1000));
    }
    if (!started) sink('§R15_PROBE_TOUR_START verdict=NEVER_STARTED');

    await new Promise(r => setTimeout(r, TOUR_MS));

    const res = await page.evaluate(() => {
      window.__r15.on = false;
      const S = window.__dlodNav;
      return { samples: window.__r15.samples,
        final: { bTicks: S.budgetTicks, bStale: S.budgetStaleTicks, bWind: S.budgetWindupTicks,
                 passSeq: S.passSeq, boost: S.budgetBoost } };
    });
    await page.evaluate(() => { const A = window.APP || window.A; if (A.flyActive) window.toggleFlyAround(); });

    const S = res.samples;
    fs.writeFileSync(OUT + '.json', JSON.stringify(res));

    // ---- C1: stale-feedback share of control periods ----
    const f = res.final;
    const c1_vacuous = f.bTicks === 0;
    sink('§R15_C1 budgetTicks=' + f.bTicks + ' staleTicks=' + f.bStale +
      ' stalePct=' + (f.bTicks ? (100 * f.bStale / f.bTicks).toFixed(1) : 'n/a') +
      ' passes=' + f.passSeq + ' verdict=' + (c1_vacuous ? 'VACUOUS (controller never ticked)' :
        (f.bStale > 0 ? 'STALE-CONFIRMED' : 'FRESH — H1 not the mechanism')));

    // ---- C2: windup ----
    sink('§R15_C2 windupTicks=' + f.bWind +
      ' verdict=' + (c1_vacuous ? 'VACUOUS' : (f.bWind > 0 ? 'WINDUP-CONFIRMED' : 'no windup observed')));

    // ---- boost excursion / sawtooth shape ----
    const boosts = S.map(s => s.boost);
    const bmin = Math.min(...boosts), bmax = Math.max(...boosts);
    let reversals = 0, dir = 0;
    for (let i = 1; i < S.length; i++) {
      const d = Math.sign(S[i].boost - S[i - 1].boost);
      if (d !== 0) { if (dir !== 0 && d !== dir) reversals++; dir = d; }
    }
    sink('§R15_SAWTOOTH boostMin=' + bmin + ' boostMax=' + bmax + ' reversals=' + reversals +
      ' samples=' + S.length);

    // ---- C3: per-frame cost split, boost MOVING vs STEADY ----
    // "moving" = this sample's boost differs from the previous sample's.
    const mov = [], sty = [];
    for (let i = 1; i < S.length; i++) (S[i].boost !== S[i - 1].boost ? mov : sty).push(S[i]);
    const mean = (a, k) => a.length ? +(a.reduce((x, s) => x + s[k], 0) / a.length).toFixed(2) : null;
    const p95 = (a, k) => { if (!a.length) return null; const v = a.map(s => s[k]).sort((x, y) => x - y); return +v[Math.floor(v.length * 0.95)].toFixed(2); };
    sink('§R15_C3 movingN=' + mov.length + ' steadyN=' + sty.length +
      ' | dt_mean mov=' + mean(mov, 'dt') + ' sty=' + mean(sty, 'dt') +
      ' | dt_p95 mov=' + p95(mov, 'dt') + ' sty=' + p95(sty, 'dt') +
      ' | evalMs_mean mov=' + mean(mov, 'evalMs') + ' sty=' + mean(sty, 'evalMs') +
      ' | calls_mean mov=' + mean(mov, 'calls') + ' sty=' + mean(sty, 'calls') +
      ' | tris_mean mov=' + mean(mov, 'tris') + ' sty=' + mean(sty, 'tris') +
      ' verdict=' + (mov.length === 0 ? 'VACUOUS (boost never moved)' : 'measured'));

    // ---- shipped §-log rollups (never re-derived by hand) ----
    for (const tag of ['§FPS_MODE', '§DLOD_TICK', '§DLOD_NAV_BUDGET', '§DUCT_SILHOUETTE', '§PROGRESSIVE_FLUSH']) {
      const hits = LOG.filter(l => l.indexOf(tag) >= 0);
      sink('§R15_LOGROLL ' + tag + ' n=' + hits.length + (hits.length ? ' last=' + hits[hits.length - 1] : ''));
    }
  } finally {
    fs.writeFileSync(OUT + '.log', LOG.join('\n'));
    await browser.close();
  }
})().catch(e => { LOG.push('ERR ' + e.stack); fs.writeFileSync(OUT + '.log', LOG.join('\n')); process.exit(1); });
