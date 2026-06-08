// probe_idle_blank.js — BLANK_SCREEN_IDLE.md witness probe.
// Proves/disproves: does the canvas go blank (a) at idle-park with no interaction, and
// (b) after a forced resize while parked? Samples the WebGL back-buffer (preserveDrawingBuffer
// is on) to count non-clear pixels, and captures the §IDLE_GATE / resize §-line sequence.
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright-core');
const PORT = process.env.PORT || 8161;
const BLD = process.env.BLD || 'LTU_AHouse';
const URL = `http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db&bld=${BLD}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Read the RENDERER's own drawing buffer (preserveDrawingBuffer=on → reflects what's on screen).
// Counts pixels that differ from the dark clear color (0x1a1a2e = 26,26,46). A blanked/cleared
// buffer reads ~0% content; a populated scene reads a meaningful %.
function sampleCanvas() {
  const A = window.A || window.APP;
  if (!A || !A.renderer) return { err: 'no-renderer' };
  const c = A.renderer.domElement;
  const g = A.renderer.getContext();
  if (!g) return { err: 'no-gl' };
  const w = c.width, h = c.height;
  const buf = new Uint8Array(w * h * 4);
  g.readPixels(0, 0, w, h, g.RGBA, g.UNSIGNED_BYTE, buf);
  let nonClear = 0, total = w * h;
  for (let i = 0; i < buf.length; i += 4) {
    const r = buf[i], gg = buf[i + 1], b = buf[i + 2];
    if (Math.abs(r - 26) > 10 || Math.abs(gg - 26) > 10 || Math.abs(b - 46) > 10) nonClear++;
  }
  return { w, h, total, nonClear, pctContent: +(100 * nonClear / total).toFixed(2) };
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  try {
    const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1200, height: 800 } });
    const page = await ctx.newPage();
    const logs = [];
    page.on('console', m => logs.push(m.text()));
    page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => { const A = window.A || window.APP; return A && A.db && A.activeBuilding; }, { timeout: 180000 }).catch(e => console.log('WAIT_FAIL ' + e.message));
    await page.waitForFunction(() => { const A = window.A || window.APP; return A && A.streaming === false; }, { timeout: 120000 }).catch(() => console.log('STREAM_WAIT timeout'));
    await sleep(1500);
    await page.evaluate(() => { const A = window.A || window.APP; A.markDirty(); });
    await sleep(800);

    const afterRender = await page.evaluate(sampleCanvas);
    console.log('§PROBE after-render: ' + JSON.stringify(afterRender));

    // Wait until the render loop is STABLY parked: no new §RENDER_LOOP start for 3s straight.
    // (Async UI settling can fire a late markDirty right after first park — we must wait it out
    // or the resize-delta witness is confounded.)
    let prevStarts = -1, stableFor = 0;
    for (let i = 0; i < 10 && stableFor < 3; i++) {
      await sleep(1000);
      const n = logs.filter(l => l.includes('§RENDER_LOOP start')).length;
      if (n === prevStarts) stableFor++; else { stableFor = 0; prevStarts = n; }
    }
    const parkLines = logs.filter(l => l.includes('§IDLE_GATE park'));
    console.log('§PROBE idle-park fired: ' + (parkLines.length > 0) + '  (' + parkLines.length + ' lines)');

    const afterIdle = await page.evaluate(sampleCanvas);
    console.log('§PROBE after-idle(no-touch): ' + JSON.stringify(afterIdle));

    // DETERMINISTIC fix test (independent of park state, which LTU's continuous wake sources
    // confound): wrap markDirty with a counter; a window resize MUST call it. Unfixed=0, fixed≥1.
    // This is the exact mechanism that keeps a parked scene from blanking on resize.
    await page.evaluate(() => {
      const A = window.A || window.APP;
      A.__mdCount = 0;
      const orig = A.markDirty.bind(A);
      A.markDirty = function () { A.__mdCount++; return orig(); };
    });
    await page.setViewportSize({ width: 1100, height: 760 });
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await sleep(300);
    const mdCount = await page.evaluate(() => (window.A || window.APP).__mdCount);
    console.log('§PROBE resize→markDirty calls: ' + mdCount + ' (want ≥1; unfixed=0)');
    const afterResize = await page.evaluate(sampleCanvas);
    console.log('§PROBE after-resize content: ' + JSON.stringify(afterResize));

    console.log('--- §IDLE_GATE / RESIZE sequence ---');
    console.log(logs.filter(l => /IDLE_GATE|RENDER_LOOP|RESIZE|WEBGL_CONTEXT/.test(l)).slice(-20).join('\n'));
    console.log('--- PAGEERRORS ---');
    console.log(logs.filter(l => l.startsWith('PAGEERROR')).join('\n') || '(none)');
    await ctx.close();
  } finally {
    await browser.close();
  }
})();
