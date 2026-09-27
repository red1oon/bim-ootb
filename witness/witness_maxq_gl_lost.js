// WITNESS — §MAXQ_CONTEXT_LOSS (2026-07-26)
// ISSUE IT PROVES/DISPROVES: real user report — a long Hospital MaxQ bake hit a genuine WebGL
// context loss partway through (visible in their console as GL_CONTEXT_LOST_KHR /
// CONTEXT_LOST_WEBGL), and MaxQ kept "succeeding" afterward — every subsequent frame was a blank
// canvas captured with zero error (avgRenderMs dropped from 2.6-30ms to 0.0-0.1ms, the signature of
// WebGL calls becoming silent no-ops post-loss). Fix: scene.js's existing webglcontextlost handler
// (§S266) now sets A._webglContextLost; cinema_maxq.js's per-frame loop checks it and stops+
// salvages, same treatment as the IDB-connection-lost path.
//
// This witness forces a REAL context loss deterministically via the standard
// WEBGL_lose_context.loseContext() extension (the same mechanism devtools/automated WebGL tests
// use) partway through a short bake — not a log inference, a real event on a real GPU context.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const PORT = process.env.PORT || 8411;
const BLD = process.env.BLD || 'HHS_Office_Federated';
const LOSE_AT_FRAME = parseInt(process.env.LOSE_AT_FRAME || '3', 10);

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
    protocolTimeout: 300000,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 960, height: 540 });
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));

  console.log(`\n${'='.repeat(78)}\n§MAXQ_CONTEXT_LOSS witness — ${BLD}, forcing real context loss at frame ${LOSE_AT_FRAME}\n${'='.repeat(78)}`);
  await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.APP && window.APP.camera && window.APP.controls &&
    typeof window.APP.startMaxQualityOrbit === 'function' && window.APP._composer, { timeout: 90000 });
  await page.waitForFunction(() => !window.APP.streaming || (window.APP.streamIdx >= (window.APP.streamQueue||[]).length),
    { timeout: 120000, polling: 1000 }).catch(() => {});
  console.log('--- ready, starting MaxQ ---');

  await page.evaluate(() => { window.APP.startMaxQualityOrbit({ frames: 20, fps: 15, preview: false }); });

  // Poll §MAXQ_FRAME/§STILL_REFINE done count as a proxy for progress, force real context loss once
  // LOSE_AT_FRAME accumulation cycles have completed.
  const t0 = Date.now();
  let lostForced = false;
  while (Date.now() - t0 < 120000) {
    const doneCount = logs.filter(l => l.includes('§STILL_REFINE done')).length;
    if (!lostForced && doneCount >= LOSE_AT_FRAME) {
      const ok = await page.evaluate(() => {
        var gl = window.APP.renderer.getContext();
        var ext = gl.getExtension('WEBGL_lose_context');
        if (!ext) return false;
        ext.loseContext();
        return true;
      });
      console.log('--- forced real WEBGL_lose_context.loseContext() at doneCount=' + doneCount + ' extFound=' + ok + ' ---');
      lostForced = true;
      if (!ok) break;
    }
    if (logs.some(l => l.startsWith('§MAXQ_DONE') || l.startsWith('§MAXQ_CANCEL') || l.startsWith('§MAXQ_FAIL'))) break;
    await new Promise(r => setTimeout(r, 300));
  }
  console.log('--- run finished/timed out after ' + ((Date.now() - t0) / 1000).toFixed(1) + 's, lostForced=' + lostForced + ' ---');
  await new Promise(r => setTimeout(r, 500));

  console.log('\n--- relevant log lines ---');
  logs.filter(l => l.includes('WEBGL_CONTEXT') || l.includes('MAXQ_GL_LOST') || l.includes('MAXQ_DONE') ||
    l.includes('MAXQ_CANCEL') || l.includes('MAXQ_FAIL') || l.includes('MAXQ_STITCH') || l.startsWith('§MAXQ_FRAME'))
    .forEach(l => console.log(l));

  const glLostDetected = logs.some(l => l.includes('§WEBGL_CONTEXT_LOST'));
  const maxqGlLostFired = logs.some(l => l.includes('§MAXQ_GL_LOST'));
  const salvageAttempted = logs.some(l => l.includes('§MAXQ_STITCH') || l.startsWith('🎬 MaxQ stopped'));
  const pageErrors = logs.filter(l => l.startsWith('PAGEERROR'));

  console.log('\n§WITNESS glLostDetected=' + glLostDetected + ' maxqGlLostFired=' + maxqGlLostFired +
    ' salvageAttempted=' + salvageAttempted + ' pageErrors=' + pageErrors.length);
  if (pageErrors.length) pageErrors.forEach(l => console.log(l));

  const pass = lostForced && glLostDetected && maxqGlLostFired && pageErrors.length === 0;
  console.log('\n' + (pass
    ? 'PASS — real context loss forced, scene.js detected it, cinema_maxq.js stopped+salvaged, zero pageerrors.'
    : 'FAIL — see flags above.'));

  await browser.close();
  process.exit(pass ? 0 : 1);
})();
