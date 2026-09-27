// WITNESS — "Jump to Start doesn't clear the canvas" live report (2026-07-20, post-#912).
// ISSUE IT PROVES/DISPROVES: user reports that after scrubbing forward (building progresses),
// clicking Jump-to-Start (⏮ tm-start-btn) does NOT show an empty/pre-construction canvas — the
// scene stays as it was, until the user scrubs a bit, which then "fixes" it.
//   PASS = built-guid count at t=projectStart, reached via the REAL tm-start-btn click after having
//   scrubbed forward first, is 0 (or matches a fresh full-render at projectStart exactly).
//   FAIL = built count after clicking Jump-to-Start is > 0 (stale, matching the reported bug).
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8412;
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

    await page.evaluate(() => { window.APP.toggleShadow(); }); // shadows ON — matches the reported condition
    await page.evaluate(() => { window.toggleTimeMachine(); });
    const ready = await page.waitForFunction(() => {
      const st = window.tmGetState && window.tmGetState();
      return st && st.active && st.projectEnd > st.projectStart;
    }, { timeout: 180000 }).then(() => true).catch(() => false);
    if (!ready) { console.log('FAIL — TM never activated'); process.exit(1); }

    const state0 = await page.evaluate(() => window.tmGetState());

    // Scrub forward to ~40% via the REAL slider input event (onSlide), not a test hook — matches
    // "user scrubs, things build" from the report, and primes _incrPrimed via a real render path.
    await page.evaluate(() => {
      const slider = document.getElementById('tm-slider');
      slider.value = 50; // mid-range of the default 0-100 slider
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await new Promise(r => setTimeout(r, 500));
    const visMid = await page.evaluate(() => window.__tmSnapshotVisible());
    console.log('built count after scrubbing forward: ' + countBuilt(visMid));

    // Now click the REAL Jump-to-Start button.
    await page.click('#tm-start-btn');
    await new Promise(r => setTimeout(r, 500));
    const visStart = await page.evaluate(() => window.__tmSnapshotVisible());
    const builtAtStart = countBuilt(visStart);
    console.log('built count after clicking Jump-to-Start: ' + builtAtStart);

    // Ground truth: force a full-path re-render at the SAME cursor (projectStart) and compare.
    await page.evaluate(() => { window.__forceFull = true; window.__tmSetCursor(window.tmGetState().projectStart); });
    const visStartFull = await page.evaluate(() => window.__tmSnapshotVisible());
    const builtAtStartFull = countBuilt(visStartFull);
    console.log('built count via forced full-path at same cursor: ' + builtAtStartFull);

    pass = builtAtStart === 0 && builtAtStartFull === 0;
    console.log(pass ? 'PASS — Jump-to-Start correctly shows an empty canvas'
                      : 'FAIL — stale/non-empty canvas after Jump-to-Start (builtAtStart=' + builtAtStart +
                        ', groundTruth=' + builtAtStartFull + ')');

    const errs = logs.filter(l => l.startsWith('PAGEERROR'));
    if (errs.length) { console.log('PAGE ERRORS:\n' + errs.join('\n')); pass = false; }
  } catch (e) {
    console.log('CRASH: ' + e.message);
    pass = false;
  } finally {
    try { await page.close(); } catch (e) {}
    await browser.close();
  }
  process.exit(pass ? 0 : 1);
})();
