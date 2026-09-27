// WITNESS — "first second of play at Hour 0 does not clear the canvas" live report (2026-07-20,
// post-#912, LTU). ISSUE IT PROVES/DISPROVES: startPlayback()'s wrap-around warps assigned _cursor
// directly (no render), so the first playTick's delta window was (start, start+1tick] — the
// fully-built end-state scene never got hidden until a manual scrub (the user's workaround).
//   PASS = after TM activates at projectEnd (full building visible) and the REAL ▶ button starts
//   playback (wrap to start), the visible-built count a moment into playback EQUALS the forced
//   full-path ground truth at the same cursor (and both are far below the end-state count).
//   FAIL = visible count stays at/near the end-state count (stale canvas, the reported bug).
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8415;
const BLD = process.env.BLD || 'Hospital';

function countBuilt(vis) {
  return vis.mesh.length +
    Object.values(vis.batched || {}).reduce((a, v) => a + Object.values(v).filter(Boolean).length, 0) +
    Object.values(vis.instanced || {}).reduce((a, v) => a + Object.values(v).filter(Boolean).length, 0);
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

  let pass = false;
  try {
    const url = `http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.APP && window.APP.camera && window.APP.controls, { timeout: 120000 });
    await new Promise(r => setTimeout(r, 8000));
    await page.waitForFunction(() => {
      const A = window.APP;
      try { const r = A.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r.length && r[0][0] > 0; }
      catch (e) { return false; }
    }, { timeout: 180000, polling: 2000 });

    await page.evaluate(() => { window.APP.toggleShadow(); }); // shadows ON — matches the live condition
    await page.evaluate(() => { window.toggleTimeMachine(); });
    const ready = await page.waitForFunction(() => {
      const st = window.tmGetState && window.tmGetState();
      return st && st.active && st.projectEnd > st.projectStart;
    }, { timeout: 180000 }).then(() => true).catch(() => false);
    if (!ready) { console.log('FAIL — TM never activated'); process.exit(1); }
    await new Promise(r => setTimeout(r, 1000));

    // TM activation renders at projectEnd — the full building. This is the bug precondition.
    const visEnd = await page.evaluate(() => window.__tmSnapshotVisible());
    const builtAtEnd = countBuilt(visEnd);
    console.log('built count at activation (projectEnd): ' + builtAtEnd);

    // REAL ▶ press: startPlayback(+1) with _cursor >= projectEnd → the wrap-around warp under test.
    const preFwdIdx = logs.length;
    await page.click('#tm-fwd-btn');
    await new Promise(r => setTimeout(r, 1500));      // a few playback ticks into hour 0-3
    await page.click('#tm-stop-btn');                 // pause so the cursor holds still
    await new Promise(r => setTimeout(r, 300));
    const visPlay = await page.evaluate(() => window.__tmSnapshotVisible());
    const builtAfterPlay = countBuilt(visPlay);
    const cursorNow = await page.evaluate(() => window.tmGetState().cursor);
    console.log('built count a moment into playback-from-end: ' + builtAfterPlay +
      ' (cursor=' + Math.round(cursorNow) + ')');

    // Ground truth: forced full-path re-render at the SAME cursor.
    await page.evaluate(() => { window.__forceFull = true; window.__tmSetCursor(window.tmGetState().cursor); });
    const visFull = await page.evaluate(() => window.__tmSnapshotVisible());
    const builtFull = countBuilt(visFull);
    console.log('built count via forced full-path at same cursor: ' + builtFull);

    // PASS needs equivalence AND a real discrimination margin: early-playback truth must be far
    // below the end-state count, or the scenario never exercised the wrap (e.g. empty schedule).
    pass = builtAfterPlay === builtFull && builtFull < builtAtEnd * 0.5 && builtAtEnd > 0;
    console.log(pass ? 'PASS — playback from end starts from a correctly cleared canvas'
                     : 'FAIL — stale canvas after ▶ at end (afterPlay=' + builtAfterPlay +
                       ' groundTruth=' + builtFull + ' endState=' + builtAtEnd + ')');

    console.log('ALL perf/incr lines from ▶ press onward:\n' +
      logs.slice(preFwdIdx).filter(l => /§PERF_TRAVERSE|§PERF_INCR|§CINE_OPENING|§TM_PLAY|§TM_/.test(l)).join('\n'));

    const errs = logs.filter(l => l.startsWith('PAGEERROR'));
    if (errs.length) { console.log('PAGE ERRORS:\n' + errs.join('\n')); pass = false; }
  } catch (e) {
    console.log('CRASH: ' + (e.stack || e.message));
    console.log('last 30 page-log lines:\n' + logs.slice(-30).join('\n'));
    pass = false;
  } finally {
    try { await page.close(); } catch (e) {}
    await browser.close();
  }
  process.exit(pass ? 0 : 1);
})();
