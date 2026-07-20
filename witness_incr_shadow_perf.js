// WITNESS — W-INCR-PERF (TM_INCREMENTAL_RENDER_PERF.md §5), Phase 2 scope.
// ISSUE IT PROVES/DISPROVES: does removing the blanket !app._shadowOn gate on _incrOK, plus wiring
// the delta skip into the BatchedMesh branch, actually cut §PERF_TRAVERSE ms with shadows ON?
//   Run once against a BEFORE server (origin/main, pre-Phase-2) and once against an AFTER server
//   (this session's worktree) on the SAME PORT env var swap, same building, same tick sequence.
//   PASS/FAIL is judged by comparing the two runs' printed mean/median/p90, not by this script alone.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8410;
const BLD = process.env.BLD || 'LTU_AHouse';
const N = parseInt(process.env.N || '40', 10);
const TICK_MS = parseInt(process.env.TICK_MS || '3600000', 10); // 1 simulated hour/tick, matches __tmStep default

function pct(arr, p) {
  const s = arr.slice().sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.floor(p * s.length));
  return s[idx];
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 700 });
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));

  try {
    const url = `http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`;
    console.log(`PORT=${PORT} BLD=${BLD} N=${N} TICK_MS=${TICK_MS}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.APP && window.APP.camera && window.APP.controls,
      { timeout: 120000 });
    await new Promise(r => setTimeout(r, 8000));

    await page.waitForFunction(() => {
      const A = window.APP;
      try { const r = A.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r.length && r[0][0] > 0; }
      catch (e) { return false; }
    }, { timeout: 180000, polling: 2000 });

    await page.evaluate(() => { window.APP.toggleShadow(); }); // off -> grass (shadows ON)
    await page.evaluate(() => { window.toggleTimeMachine(); });
    const ready = await page.waitForFunction(() => {
      const st = window.tmGetState && window.tmGetState();
      return st && st.active && st.projectEnd > st.projectStart;
    }, { timeout: 120000 }).then(() => true).catch(() => false);

    if (!ready) { console.log(`${BLD}: FAIL — TM never became active/ready`); process.exit(1); }

    const state0 = await page.evaluate(() => window.tmGetState());
    const shadowOn = await page.evaluate(() => !!window.APP._shadowOn);
    console.log(`${BLD}: projectStart=${state0.projectStart} projectEnd=${state0.projectEnd} shadowOn=${shadowOn}`);

    // Jump near the middle of the timeline (plenty of placed + some frontier), then step forward N times.
    const mid = state0.projectStart + (state0.projectEnd - state0.projectStart) * 0.4;
    await page.evaluate((m) => {
      // No __tmSetCursor on the BEFORE server (pre-Phase-2) — use __tmStep's own cursor advance instead.
      return window.__tmStep ? window.__tmStep(m) : null;
    }, mid - state0.projectStart);

    const samples = [];
    for (let i = 0; i < N; i++) {
      const trav = await page.evaluate((dms) => window.__tmStep(dms), TICK_MS);
      if (trav) samples.push(trav);
    }

    const ms = samples.map(s => s.ms);
    const deltaN = samples.filter(s => s.mode === 'delta').length;
    const fullN = samples.filter(s => s.mode === 'full').length;
    const mean = ms.reduce((a, b) => a + b, 0) / (ms.length || 1);
    console.log(`§PERF_TRAVERSE_SUMMARY n=${ms.length} mean=${mean.toFixed(2)}ms median=${pct(ms, 0.5).toFixed(2)}ms ` +
      `p90=${pct(ms, 0.9).toFixed(2)}ms min=${Math.min(...ms).toFixed(2)} max=${Math.max(...ms).toFixed(2)} ` +
      `deltaMode=${deltaN} fullMode=${fullN}`);
    console.log('RAW=' + JSON.stringify(samples));

    const errs = logs.filter(l => l.startsWith('PAGEERROR'));
    if (errs.length) console.log('PAGE ERRORS:\n' + errs.join('\n'));
  } catch (e) {
    console.log('CRASH: ' + e.message);
    process.exitCode = 1;
  } finally {
    try { await page.close(); } catch (e) {}
    await browser.close();
  }
})();
