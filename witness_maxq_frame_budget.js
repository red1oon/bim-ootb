// WITNESS — §MAXQ_FRAME_BUDGET (bim-compiler prompts/CPE_4D_PERF_MEM_STUDY.md §R10).
//
// ISSUE IT PROVES/DISPROVES: every exported MaxQ frame folds STILL_TAA_FRAMES 16 + STILL_AO_FRAMES
// 24 = 40 composer renders, and that is 85% of the measured bake clock (Hospital perFrameMs=1989:
// §STILL_REFINE ~1,200 = 62%, §PHOTO_AO ~450 = 23%). Cutting those two numbers is the only lever
// that shortens a bake. The question is not "is it faster" — that is arithmetic on the render count
// — it is "how much IMAGE do we lose", measured, per step down.
//
// ══ WHY THIS RUNS ALL CONDITIONS ON ONE PAGE LOAD ═══════════════════════════════════════════════
// The first three versions of this witness used ONE PAGE LOAD PER CONDITION, following
// §SESSION_2026-08-30 dead-end 5. That is the right rule for §PHOTO_GRADE and the WRONG rule here,
// and a CONTROL proved it: two runs at the SAME 16/24 setting, on two page loads, differed by
// RMS 32.19 — LARGER than every budget change being measured (25.52 to 30.31), with 22.86% of
// pixels differing by more than 8 and a max delta of 200. The scene is not reproducible across
// loads: staffage placement, ~200 night lights, env-map timing and streaming order all differ. So
// a per-load comparison cannot see the budget at all; it measures the reseed.
//
// ══ AND WHY ONE LOAD DOES NOT WORK EITHER — BOTH METHODS ARE DISPROVEN, MEASURED ═══════════════
// Running all conditions on one load was tried next. The old dead-end's hazard is not a caveat, it
// is total: only the FIRST fold on a page does real AO work. MEASURED, one load, six folds —
//   16/24 (first)  avgRenderMs=768.9  meanRGB=150.41   <- real
//   12/16          avgRenderMs=  4.8  meanRGB=118.47
//    8/12          avgRenderMs=  9.6  meanRGB=119.27
//    8/8           avgRenderMs= 14.9  meanRGB=121.93
//    4/8           avgRenderMs= 14.2  meanRGB=122.63
//   16/24 (control)avgRenderMs=  1.1  meanRGB=120.16   <- SAME settings as row 1, different image
// The same-load control at IDENTICAL settings lands 30 luma away from row 1. Neither method could
// see the budget: per-load the reseed noise is bigger than the effect, same-load the AO stops
// working. Both failures are now recorded in the study file so nobody re-walks them.
//
// ══ THE FIX: PER LOAD, WITH THE NONDETERMINISM REMOVED AT ITS SOURCE ════════════════════════════
// The cross-load noise has one cause: effects.js makes 13 Math.random() calls while staging —
// staffage species and placement, and the night-light subset (fixtures=410 -> nightLights=200).
// Seeding Math.random with a fixed PRNG before any page script runs makes two loads produce the
// SAME scene, so a per-load comparison measures the budget and nothing else. This changes no code
// under test; it removes the only reason two loads differ. The control row proves it worked: if
// the seeded control does not come back near RMS 0, the method is still invalid and nothing is
// scored.
//
// TIMINGS HERE ARE NOT THE USER'S TIMINGS — headless swiftshader. Only the render COUNT is
// hardware-independent; the speed projection uses the user's own measured per-render costs.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const fs = require('fs');
const PORT = process.env.PORT || 8521, BLD = process.env.BLD || 'HHS_Office_Federated';
const OUT = process.env.OUT || '/tmp/claude-1000/-home-red1-bim-compiler/a6f39c9e-e8c4-4b36-a515-4667fb1e5a52/scratchpad/sweep2';
const CONDS = [[16, 24], [12, 16], [8, 12], [8, 8], [4, 8], [16, 24]];  // last = control, same settings as first
const SEED = 20260830;
process.on('unhandledRejection', e => { console.error('UNHANDLED: ' + (e && e.stack || e)); process.exit(1); });

const CAPTURE = `(() => {
  const A = window.APP;
  const c = A.renderer.domElement, g = document.createElement('canvas');
  g.width = c.width; g.height = c.height;
  const gx = g.getContext('2d'); gx.drawImage(c, 0, 0);
  const d = gx.getImageData(0, 0, g.width, g.height).data;
  let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i+1] + d[i+2];
  return { url: g.toDataURL('image/png'), meanRGB: s / (d.length / 4 * 3) };
})()`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ headless: 'new',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
    protocolTimeout: 3600000 });
  console.log('='.repeat(96) + `\n§MAXQ_FRAME_BUDGET sweep — ${BLD} @ :${PORT} — one SEEDED load per condition (seed=${SEED})\n` + '='.repeat(96));

  async function oneRun(taa, ao, tag) {
    const page = await browser.newPage();
    await page.setViewport({ width: 960, height: 540 });
    // Deterministic scene: effects.js makes 13 Math.random() calls while staging (staffage species
    // and placement, the night-light subset). Seeding before ANY page script runs makes two loads
    // produce the same scene, which is the only thing that made a per-load comparison impossible.
    await page.evaluateOnNewDocument(seed => {
      let s = seed >>> 0;
      Math.random = function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    }, SEED);
    let aoMs = null, aoFrames = null, taaSamples = null;
    page.on('console', m => {
      const t = m.text();
      let k = t.match(/§PHOTO_AO start frames=(\d+)/); if (k) aoFrames = +k[1];
      k = t.match(/§PHOTO_AO done frames=\d+ totalMs=\d+ avgRenderMs=([\d.]+)/); if (k) aoMs = +k[1];
      k = t.match(/§STILL_REFINE start samples=(\d+)/); if (k) taaSamples = +k[1];
    });
    await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`,
      { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForFunction(() => window.APP && window.APP.camera && window.APP._composer &&
      typeof window.APP.startStillRefine === 'function', { timeout: 240000 });
    await page.waitForFunction(() => window.APP.streaming === true || (window.APP.streamQueue || []).length > 0,
      { timeout: 180000, polling: 250 }).catch(() => {});
    await page.waitForFunction(() => !window.APP.streaming || (window.APP.streamIdx >= (window.APP.streamQueue || []).length),
      { timeout: 900000, polling: 1000 }).catch(() => {});
    // the viewer's OWN framing — a witness that invents a camera can invent an empty frustum, which
    // is exactly how an earlier version of this file scored five black frames as "no quality loss".
    const pose = await page.evaluate(() => window.APP.camera.position.toArray().map(v => +v.toFixed(2)));
    const preRGB = await page.evaluate(() => {
      const A = window.APP;
      if (A._composer && A._composerEnabled) A._composer.render(); else A.renderer.render(A.scene, A.camera);
      const c = A.renderer.domElement, g = document.createElement('canvas');
      g.width = c.width; g.height = c.height;
      const gx = g.getContext('2d'); gx.drawImage(c, 0, 0);
      const d = gx.getImageData(0, 0, g.width, g.height).data;
      let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
      return s / (d.length / 4 * 3);
    });
    if (preRGB < 5) {
      console.log(`  ${tag.padEnd(11)} INCONCLUSIVE — camera sees nothing before the fold (meanRGB=${preRGB.toFixed(2)})`);
      await page.close();
      return { taa, ao, tag, inconclusive: 'empty frustum', preRGB: +preRGB.toFixed(2) };
    }
    await page.evaluate(b => { window.APP._stillBudget = b; }, { taa, ao });
    const t0 = Date.now();
    await page.evaluate(() => window.APP.startStillRefine());
    await page.waitForFunction(() => window.APP._stillRefineBusy === false, { timeout: 900000, polling: 200 }).catch(() => {});
    const foldMs = Date.now() - t0;
    await new Promise(r => setTimeout(r, 1000));
    const cap = await page.evaluate(CAPTURE);
    fs.writeFileSync(`${OUT}/f_${tag}.png`, Buffer.from(cap.url.split(',')[1], 'base64'));
    await page.close();
    const r = { taa, ao, tag, aoMs, aoFrames, taaSamples, foldMs, pose,
                meanRGB: +cap.meanRGB.toFixed(2), preRGB: +preRGB.toFixed(2) };
    console.log(`  ${tag.padEnd(11)} logged taa=${taaSamples} ao=${aoFrames}  aoAvgRenderMs=${aoMs}` +
      `  foldMs=${foldMs}  renders=${taa + ao}  meanRGB=${r.meanRGB}` +
      (r.meanRGB < 5 ? '  ⚠ VACUOUS — black' : '') +
      (aoMs !== null && aoMs < 100 ? '  ⚠ AO did no real work' : ''));
    return r;
  }

  const runs = [];
  for (let i = 0; i < CONDS.length; i++) {
    const [taa, ao] = CONDS[i];
    runs.push(await oneRun(taa, ao, (i === CONDS.length - 1) ? `ctl_${taa}_${ao}` : `${taa}_${ao}`));
  }
  fs.writeFileSync(`${OUT}/runs.json`, JSON.stringify(runs, null, 1));
  await browser.close();
  // The witness states its OWN verdict (WITNESS_INTERFACE_FRAMEWORK rule 4) rather than leaving a
  // pile of PNGs for someone to eyeball — which would be the very failure this measurement exists
  // to avoid. Scoring needs numpy/PIL, so it shells out; a missing scorer is INCONCLUSIVE, not PASS.
  const { spawnSync } = require('child_process');
  const sc = spawnSync('python3', [__dirname + '/score_frame_budget.py', OUT], { encoding: 'utf8' });
  if (sc.status !== 0 && !sc.stdout) {
    console.log('\n  INCONCLUSIVE — scorer did not run: ' + (sc.stderr || sc.error || '').toString().slice(0, 300));
    process.exit(1);
  }
  console.log(sc.stdout);
  if (sc.stderr) console.log(sc.stderr.slice(0, 400));
})();
