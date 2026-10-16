// WITNESS — §PHOTO_PREWARM (§R11, bim-compiler prompts/CPE_4D_PERF_MEM_STUDY.md).
//
// ISSUE IT PROVES/DISPROVES: the FIRST Alt+S cost the user ~27 s against ~7 s for every press
// after it. MEASURED from their own v1111 Hospital log: §MEP_SMOOTH_NORMALS ms=8923.6 ran ON the
// press, and §LAYER2_HDRI_READY / §GROUND_MAP arriving mid-fold restarted the accumulation twice
// (§STILL_REFINE_RESTART). This moves that one-time work to idle-after-streaming. Does it (a) fire
// at all, (b) actually do the smoothing THERE rather than on the press, (c) leave the press with
// NO smoothing left to do, (d) still produce a finished still, and (e) stay idempotent?
//
// (b) and (c) are load-bearing together: (b) alone would pass if the pass simply ran twice, which
// would be WORSE than the bug. Console ORDER is the evidence — §MEP_SMOOTH_NORMALS must appear
// before §STILL_REFINE start, and must not appear again after it.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const PORT = process.env.PORT || 8521, BLD = process.env.BLD || 'HHS_Office_Federated';
process.on('unhandledRejection', e => { console.error('UNHANDLED: ' + (e && e.stack || e)); process.exit(1); });
(async () => {
  const b = await puppeteer.launch({ headless: 'new',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
    protocolTimeout: 1800000 });
  const p = await b.newPage(); await p.setViewport({ width: 900, height: 500 });
  const seq = [], errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 160)));
  p.on('console', m => { const t = m.text();
    if (/§PHOTO_PREWARM|§MEP_SMOOTH_NORMALS|§STILL_REFINE start|§STILL_REFINE done|§PHOTO_STAGING on|§LAYER2_HDRI_READY/.test(t))
      seq.push(t.slice(0, 160)); });
  await p.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`,
    { waitUntil: 'domcontentloaded', timeout: 180000 });
  await p.waitForFunction(() => window.APP && window.APP.camera && typeof window.APP.startStillRefine === 'function',
    { timeout: 240000 });
  await p.waitForFunction(() => window.APP.streaming === true || (window.APP.streamQueue || []).length > 0,
    { timeout: 180000, polling: 250 }).catch(() => {});
  await p.waitForFunction(() => !window.APP.streaming || (window.APP.streamIdx >= (window.APP.streamQueue || []).length),
    { timeout: 900000, polling: 1000 }).catch(() => {});
  // give the idle callback its window (timeout:8000 in the code)
  await p.waitForFunction(() => window.APP._mepSmoothDone === true, { timeout: 120000, polling: 500 }).catch(() => {});
  const prewarmFired = seq.some(l => l.startsWith('§PHOTO_PREWARM'));
  const idxSmoothBefore = seq.findIndex(l => l.startsWith('§MEP_SMOOTH_NORMALS'));
  const twice = await p.evaluate(() => window.APP._photoPrewarm());   // idempotency: must return false
  const beforePress = seq.length;
  await p.evaluate(() => window.APP.startStillRefine());
  await p.waitForFunction(() => window.APP._stillRefineBusy === false, { timeout: 900000, polling: 200 }).catch(() => {});
  const after = seq.slice(beforePress);
  const idxStart = seq.findIndex(l => l.startsWith('§STILL_REFINE start'));
  console.log('='.repeat(84) + `\n§PHOTO_PREWARM witness — ${BLD}\n` + '='.repeat(84));
  seq.forEach((l, i) => console.log(`  ${String(i).padStart(2)} ${l}`));
  const G = [
    ['G-PW-1  §PHOTO_PREWARM fired after streaming', prewarmFired],
    ['G-PW-2  the smoothing ran in the PREWARM, before any Alt+S press',
      idxSmoothBefore >= 0 && (idxStart < 0 || idxSmoothBefore < idxStart)],
    ['G-PW-3  the press did NOT redo the smoothing (guard held, not run twice)',
      !after.some(l => l.startsWith('§MEP_SMOOTH_NORMALS'))],
    ['G-PW-4  the still still completes after the change',
      after.some(l => l.startsWith('§STILL_REFINE done'))],
    ['G-PW-5  prewarm is idempotent — a second call is a no-op', twice === false],
    ['G-PW-6  no page errors', errs.length === 0]
  ];
  let pass = 0; G.forEach(([n, v]) => { console.log('  ' + (v ? 'PASS' : 'FAIL') + '  ' + n); if (v) pass++; });
  if (errs.length) console.log('  errors: ' + errs.slice(0, 3).join(' | '));
  console.log(`\n  ${pass}/${G.length} — ${pass === G.length ? 'PASS' : 'FAIL'}`);
  await b.close();
  process.exit(pass === G.length ? 0 : 1);
})();
