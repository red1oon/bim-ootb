// WITNESS — §CPE_VF_BUILDUP_BLANK (2026-08-06)
// Proves: B's own scissor render pass (cinema_path_editor.js _vfRender, counted by _vfPerf.n) keeps
// firing DURING a povOnly BuildUp rehearsal, not just before/after it. This is the exact numeric
// signature of the user's report ("B blank during BuildUp playback, only showing when paused") —
// zero §CPE_VF_FRAME_DIAG for the whole playback in the user's own console log was the same claim,
// this just makes it a hard assertion instead of a log read.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const PORT = process.env.PORT || 8470;
const BLD = process.env.BLD || 'HHS_Office_Federated';
const sleep = ms => new Promise(r => setTimeout(r, ms));

let logs = [];
(async () => {
  const browser = await puppeteer.launch({
    headless: 'new', protocolTimeout: 900000,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 700 });
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
  await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`,
    { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(
    () => window.APP && window.APP.cinemaPathEditor && window.APP.startMaxQualityOrbit,
    { timeout: 120000 });
  await sleep(6000);
  await page.waitForFunction(() => {
    try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; }
    catch (e) { return false; }
  }, { timeout: 60000, polling: 1000 });
  await page.evaluate(() => { window.APP.startMaxQualityOrbit({ preview: false, fps: 1, editor: true }); });
  await page.waitForSelector('#cpe-ok', { timeout: 300000 });
  await sleep(500);

  // B on (installs the render hook + scrub panel).
  const vfOn = await page.evaluate(() => window.APP.cinemaPathEditor._vfToggle());
  await sleep(300);

  // Confirm BuildUp is checked (default) before starting the rehearsal.
  const buildupChecked = await page.evaluate(() => document.getElementById('cpe-buildup').checked);

  const before = await page.evaluate(() => window.APP.cinemaPathEditor._vfPerf());
  const tmTicksBefore = logs.filter(l => l.startsWith('§PERF_TRAVERSE')).length;

  // Click the scrub panel's own play button — the real product path (_previewFly(true), povOnly),
  // same one the user's own log shows firing ("§CPE_SCRUB_INPUT_TRACE play click").
  await page.click('#cpe-scrub-play');
  await sleep(5000);   // let several real BuildUp/TM ticks elapse mid-flight (swiftshader is slow —
                        // give it a real window rather than a frame-count guess)
  const flyingMid = await page.evaluate(() => window.APP.cinemaPathEditor._flyState());
  const after = await page.evaluate(() => window.APP.cinemaPathEditor._vfPerf());

  // Stop the rehearsal cleanly (pause) so the browser can close without a dangling rAF chain.
  await page.evaluate(() => window.APP.cinemaPathEditor._flyPause());
  await sleep(200);

  const tmTicksAfter = logs.filter(l => l.startsWith('§PERF_TRAVERSE')).length;
  const tmTicksDuring = tmTicksAfter - tmTicksBefore;   // ground truth: how many times TM actually
                                                          // advanced the buildup cursor in this window
  const vfRendersDuring = after.n - before.n;            // how many of those ticks B actually painted
  const frameDiagCount = logs.filter(l => l.startsWith('§CPE_VF_FRAME_DIAG ')).length;
  const buildupOn = logs.some(l => l.startsWith('§CPE_BUILDUP ON'));
  const tmOn = logs.some(l => l.includes('§TIME_MACHINE ON'));
  const coverage = tmTicksDuring ? (vfRendersDuring / tmTicksDuring) : null;

  console.log('=== §CPE_VF_BUILDUP_BLANK witness ===');
  console.log('buildupChecked=' + buildupChecked + ' vfOn=' + vfOn + ' buildupOnLogged=' + buildupOn + ' tmOnLogged=' + tmOn);
  console.log('vfPerf.n before=' + before.n + ' after(+5.0s)=' + after.n + ' flyingMid=' + JSON.stringify(flyingMid));
  console.log('TM ticks (§PERF_TRAVERSE) during window=' + tmTicksDuring + '  B renders during window=' + vfRendersDuring +
    '  coverage=' + (coverage == null ? 'n/a' : (coverage * 100).toFixed(0) + '%') +
    '  (coverage = what fraction of the buildup cursor advances B actually painted — this IS "blank during playback" made numeric)');
  console.log('§CPE_VF_FRAME_DIAG lines seen in console: ' + frameDiagCount);

  // The bug's signature is coverage near 0% (B painted almost never while TM kept ticking).
  // The fix's signature is coverage near/at 100% (B repainted on every tick, unconditionally).
  const ok = coverage != null && coverage >= 0.9;
  console.log(ok
    ? 'PASS — B repainted on (near-)every BuildUp/TM tick during the rehearsal (coverage >= 90%)'
    : 'FAIL — B missed most BuildUp/TM ticks during the rehearsal (coverage < 90%) — this is the blank-during-playback bug');

  if (!ok) console.log('recent logs tail:\n' + logs.slice(-40).join('\n'));
  await browser.close();
  process.exit(ok ? 0 : 1);
})().catch(async e => {
  console.error('WITNESS_ERROR ' + e.message);
  try { console.log('logs tail:\n' + logs.slice(-60).join('\n')); } catch (_e) {}
  process.exit(2);
});
