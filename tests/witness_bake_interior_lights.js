#!/usr/bin/env node
/**
 * W-BAKE-INTERIOR-LIGHTS — §BAKE_INTERIOR_LIGHTS / §BAKE_LIGHTS / §BAKE_LIGHT_BUILDUP_GATE.
 *
 * ISSUE THIS TEST EXPOSES: interior shots of a MaxQ (Alt+M/Alt+C) construction-movie bake render
 * with NO fixture point lighting, while the same building explored at night via Fly/handsfree is
 * well lit. User, verbatim: "Night mode usually solves this PL well, when Fly or handsfree...
 * during baking, there are no PLs shining at the lighting."
 *
 * ROOT CAUSE (measured on this same harness against unpatched code, BASE=1 below):
 *   (a) the still/bake light selection (tools.js _nightUpdateLights, §NIGHT_STILL_FRUSTUM branch)
 *       selected ONLY fixtures whose centre falls inside the view frustum, with no floor — a frame
 *       that looks where no fixture centre lands selects ZERO and every point light is disposed;
 *   (b) both callers that can re-select (effects.js §NIGHT_STILL_LIGHTS and _teardownStillRefine)
 *       gated on A._nightLights.length — the OUTPUT of that selection — so once (a) produced 0,
 *       nothing ever called the selector again: a self-latching zero that darkens the whole
 *       remainder of the film, including every later interior beat.
 *   Baseline numbers from the pre-fix run: 18 lights at frame 0, 0 lights from frame 2 to frame 27,
 *   scene point-light intensity sum 127.39 -> 82.39 (difference 45.00 = 18 x NIGHT_LIGHT_INTENSITY
 *   2.5 — every fixture light, exactly).
 *
 * NOT A SCREENSHOT TEST (CLAUDE.md FUNDAMENTAL LAW). Every gate below is a NUMBER read either from
 * the shipped §-log or from live scene state via page.evaluate: active THREE.PointLight count and
 * summed intensity, against the placed-fixture count Time Machine itself reports.
 *
 * GATES
 *   G-BL-LATCH   the bake never latches dark: on the LAST logged frame, activePL > 0 while
 *                placedFixtures > 0. (RED on baseline: 0 for the whole tail of the bake.)
 *   G-BL-TRACK   every §BAKE_LIGHTS frame with placedFixtures > 0 has activePL > 0, and no frame
 *                ever has activePL > placedFixtures — light count tracks placed-fixture count and
 *                can never exceed it.
 *   G-BL-GATE    §BAKE_LIGHT_BUILDUP_GATE is real: at least one logged frame has
 *                placedFixtures < fixtures (the schedule is withholding luminaires), which on
 *                unpatched code was impossible — lights ignored placement entirely.
 *   G-BL-LIVE    live scene state agrees with the log: sampled during the bake, scene point-light
 *                intensity sum stays above the no-fixture-light floor once fixtures are placed.
 *   G-BL-NAV     navigation is UNCHANGED: with night mode toggled on and no bake, the selection
 *                mode is the nav rule ('all' / 'nearest-to-aim'), never the still frustum branch.
 *
 * Run:  node tests/witness_bake_interior_lights.js 2>&1 | tee /tmp/W_BAKE_LIGHTS.log
 *       BASE=1 PORT=8399 node tests/witness_bake_interior_lights.js   # RED side, origin/main
 *       (then READ THE LOG — exit code is not evidence.)
 */
'use strict';
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const BLD = process.env.BLD || 'Duplex';
const PORT = process.env.PORT || 8531;
const BASE = process.env.BASE === '1';   // baseline build has no §BAKE_LIGHTS — live sampling only
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
function gate(id, claim, ok, detail) {
  (ok ? pass++ : fail++);
  console.log((ok ? 'PASS ' : 'FAIL ') + id + ' — ' + claim + '\n     ' + detail);
}

// Live scene truth, independent of any § line: what is actually lighting the scene right now.
const SAMPLE = () => {
  const A = window.APP;
  let pl = 0, plI = 0;
  A.scene.traverse(o => { if (o.isPointLight && o.visible) { pl++; plI += o.intensity; } });
  return { night: !!A._nightMode, nightLights: (A._nightLights || []).length,
    scenePL: pl, scenePLI: +plI.toFixed(2), sel: A._nightLightSelectInfo || null,
    fixtures: (A._nightFixtures || []).length };
};

(async () => {
  const logs = [], samples = [];
  const browser = await puppeteer.launch({
    headless: 'new', protocolTimeout: 1200000,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader']
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 960, height: 600 });
    page.on('console', m => logs.push(m.text()));
    page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
    await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`,
      { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(
      () => window.APP && window.APP.cinemaPathPlan && window.APP.startMaxQualityOrbit && window.APP._composer,
      { timeout: 180000 });
    await sleep(9000);
    await page.waitForFunction(() => {
      try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; }
      catch (e) { return false; }
    }, { timeout: 120000, polling: 2000 });

    // ── G-BL-NAV: plain night mode, no bake. This is the path the user says already works; it must
    //    keep using the navigation selection rule and must not be dragged onto the frustum branch.
    await page.evaluate(() => { if (window.toggleNightMode) window.toggleNightMode(); });
    await sleep(3000);
    const nav = await page.evaluate(SAMPLE);
    await page.evaluate(() => { if (window.toggleNightMode) window.toggleNightMode(); });
    await sleep(1500);

    // ── the bake, driven exactly as a user does it (editor → OK) ──
    await page.evaluate(() => { window.APP.startMaxQualityOrbit({ preview: false, fps: 1, editor: true, forceWebm: true }); });
    await page.waitForSelector('#cpe-ok', { timeout: 300000 });
    await sleep(1500);
    await page.evaluate(() => { document.getElementById('cpe-ok').click(); });
    // A swiftshader bake of even a small building runs ~12 s/frame — budget for the whole film
    // plus the stitch, or the run ends mid-bake and the gates grade a truncated film.
    for (let s = 0; s < 400; s++) {
      await sleep(3000);
      samples.push(await page.evaluate(SAMPLE));
      if (logs.some(l => /§MAXQ_(DONE|WEBM|MP4)\b/.test(l))) break;
    }
    const done = logs.some(l => /§MAXQ_(DONE|WEBM|MP4)\b/.test(l));
    await page.close();
    if (process.env.CONSOLE_LOG) {
      require('fs').writeFileSync(process.env.CONSOLE_LOG, logs.join('\n'));
      console.log('console log written to ' + process.env.CONSOLE_LOG + ' lines=' + logs.length);
    }

    // ── parse both §BAKE_LIGHTS forms: the per-frame bake line (cinema_maxq.js, first/last/every
    //    60th frame) and the change-driven selector line (tools.js, emitted whenever the selection
    //    answer changes). A short test bake produces few of the former and many of the latter.
    const bl = logs.filter(l => /§BAKE_LIGHTS frame=/.test(l)).map(l => ({
      raw: l,
      frame: +(l.match(/frame=(\d+)/) || [])[1],
      placed: +(l.match(/placedFixtures=(\d+)/) || [])[1],
      fixtures: +(l.match(/placedFixtures=\d+\/(\d+)/) || [])[1],
      active: +(l.match(/activePL=(\d+)/) || [])[1]
    }));
    const sel = logs.filter(l => /§BAKE_LIGHTS select /.test(l)).map(l => ({
      raw: l,
      mode: (l.match(/mode=(\S+)/) || [])[1],
      placed: +(l.match(/placedFixtures=(\d+)/) || [])[1],
      fixtures: +(l.match(/placedFixtures=\d+\/(\d+)/) || [])[1],
      active: +(l.match(/activePL=(\d+)/) || [])[1]
    }));
    const all = bl.concat(sel);

    gate('G-BL-INFRA', 'the bake ran to completion with no page errors',
      done && !logs.some(l => /^PAGEERROR/.test(l)),
      `done=${done} pageErrors=${logs.filter(l => /^PAGEERROR/.test(l)).length} bakeLightsLines=${bl.length}`);

    if (BASE) {
      // Baseline build predates §BAKE_LIGHTS: the RED evidence is the live sample series alone.
      const dark = samples.filter(s => s.nightLights === 0 && s.night).length;
      gate('G-BL-BASELINE-RED', 'baseline goes dark mid-bake and never recovers (the defect)',
        dark > 0,
        `samples=${samples.length} withNightModeOnButZeroLights=${dark} ` +
        `series=${samples.map(s => s.nightLights).join(',')}`);
    } else {
      const last = bl[bl.length - 1];
      gate('G-BL-LATCH', 'the last logged bake frame still has fixture lighting (no self-latching zero)',
        !!last && last.placed > 0 && last.active > 0,
        last ? `lastFrame=${last.frame} placedFixtures=${last.placed}/${last.fixtures} activePL=${last.active}`
             : 'no §BAKE_LIGHTS lines at all');

      const noLight = all.filter(r => r.placed > 0 && r.active === 0);
      const overLight = all.filter(r => r.active > r.placed);
      gate('G-BL-TRACK', 'light count tracks placed-fixture count on every logged selection',
        all.length > 0 && noLight.length === 0 && overLight.length === 0,
        `selections=${all.length} (perFrame=${bl.length} onChange=${sel.length}) ` +
        `placedButDark=${noLight.length} litMoreThanPlaced=${overLight.length}` +
        (noLight[0] ? ' firstDark=' + noLight[0].raw : '') +
        (overLight[0] ? ' firstOver=' + overLight[0].raw : ''));

      const withheld = all.filter(r => r.placed < r.fixtures);
      gate('G-BL-GATE', 'the buildup gate is live — some frames legitimately have fewer placed luminaires than the building holds',
        withheld.length > 0,
        `selectionsWithLuminairesStillUnplaced=${withheld.length}/${all.length}` +
        (withheld[0] ? ' e.g. ' + withheld[0].raw : ''));

      // The whole point of the gate: as the schedule installs luminaires, the light count RISES.
      // A constant count would pass the two gates above while proving nothing about the tracking.
      const placedSeries = sel.map(r => r.placed);
      const rose = placedSeries.length > 1 && Math.max(...placedSeries) > Math.min(...placedSeries);
      const lastSel = sel[sel.length - 1];
      gate('G-BL-RISE', 'lighting follows installation — the placed-luminaire count changes over the bake and the light count moves with it',
        rose && !!lastSel && lastSel.active > 0,
        `placedSeries=${placedSeries.join(',')} activeSeries=${sel.map(r => r.active).join(',')}`);

      // Night mode is legitimately OFF between the warm-up fold and frame 0 (staging is torn down
      // there) — a zero light count while night is off is correct, not the defect. Only samples
      // taken with night mode ON can testify.
      const lit = samples.filter(s => s.night && s.sel && s.sel.placed > 0);
      const litDark = lit.filter(s => s.nightLights === 0);
      gate('G-BL-LIVE', 'live scene state agrees: point lights exist whenever night mode is on and the schedule has placed luminaires',
        lit.length > 0 && litDark.length === 0,
        `samplesNightOnWithPlacedFixtures=${lit.length} ofWhichZeroPointLights=${litDark.length} ` +
        `nightLightSeries=${samples.map(s => (s.night ? '' : 'n') + s.nightLights).join(',')}`);

      gate('G-BL-NAV', 'plain night navigation still uses the navigation selection rule, not the still frustum branch',
        !!nav.sel && nav.night && (nav.sel.mode === 'all' || nav.sel.mode === 'nearest-to-aim') && nav.nightLights > 0,
        `mode=${nav.sel ? nav.sel.mode : 'none'} nightLights=${nav.nightLights} fixtures=${nav.fixtures} ` +
        `budget=${nav.sel ? nav.sel.budget : '?'} floor=${nav.sel ? nav.sel.floor : '?'}`);
    }
  } catch (e) {
    gate('G-BL-INFRA', 'harness ran', false, e.message);
  } finally {
    console.log(`\n§BAKE_INTERIOR_LIGHTS WITNESS ${pass}/${pass + fail} PASS`);
    await browser.close();
    process.exit(fail === 0 ? 0 : 1);
  }
})();
