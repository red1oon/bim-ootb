#!/usr/bin/env node
/* ⚠ WITNESS — proves/disproves §GANTT_RETIME_RESYNC (4D_SCHEDULE_PERFECTION.md, 2026-08-07, user
 * report: "foundation piling nor others does not seem to come onto canvas anymore, though i dragged
 * to certain bars passing" — witnessed in the user's console as §PERF_TRAVERSE cand=0 on every scrub
 * after §GANTT_RETIME): the retime paths moved op timestamps but never rebuilt the §PERF_INCR event
 * index, re-sorted _ops, or rebuilt the §XRAY solidify cache — so the incremental reveal skipped
 * meshes straight across their new transitions.
 *
 * PASS iff after driving the REAL ruler-shift commit path (__tmGanttShift(-93)):
 *   - §GANTT_RETIME fired with rows>0 (ops actually moved)
 *   - §PERF_INCR_INDEX fired AGAIN after the shift (event index rebuilt on the new times)
 *   - §XRAY_EDGES fired AGAIN after the shift (solidify cache rebuilt)
 *   - functional: tmPlacedCount at 30% of the NEW project span is >0 (reveal not blacked out)
 */
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright-core');
const URL = process.env.WITNESS_URL ||
  'http://localhost:8484/viewer/viewer.html?db=https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb/o/buildings/Hospital_extracted.db&ghost=1';
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true,
    args: ['--no-sandbox', '--disable-gpu'] });
  const page = await (await browser.newContext()).newPage();
  const lines = [];
  page.on('console', m => { const t = m.text();
    if (/§GANTT_RETIME|§PERF_INCR_INDEX|§XRAY_EDGES|§TM_RULER_SHIFT|§SE_SHIFT/.test(t)) {
      lines.push(t); console.log('[console]', t.slice(0, 160)); } });
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.APP && window.APP.db && window.toggleTimeMachine, null, { timeout: 180000 });
  await page.evaluate(() => window.toggleTimeMachine());
  await page.waitForFunction(() => { try { return window.tmGetState && window.tmGetState().active; } catch (e) { return false; } }, null, { timeout: 300000 });
  await page.evaluate(() => document.getElementById('tm-gantt').dispatchEvent(new PointerEvent('pointerup', { bubbles: true })));
  await page.waitForTimeout(4000);
  const before = lines.length;                          // everything up to here is activation noise
  await page.evaluate(() => window.__tmGanttShift(-93));
  await page.waitForTimeout(4000);
  const after = lines.slice(before);
  const placed = await page.evaluate(() => {
    const st = window.tmGetState();
    const t = st.projectStart + (st.projectEnd - st.projectStart) * 0.3;
    window.tmSetCursor(t);
    return window.tmPlacedCount(t);
  });
  const n = re => after.filter(l => re.test(l)).length;
  const retime = after.find(l => /§GANTT_RETIME/.test(l)) || '';
  const rows = +(retime.match(/rows=(\d+)/) || [0, 0])[1];
  const idxRebuilt = n(/§PERF_INCR_INDEX/), xrayRebuilt = n(/§XRAY_EDGES/);
  console.log(`§RETIME_RESYNC_CHECK rows=${rows} perfIndexRebuilds=${idxRebuilt} xrayRebuilds=${xrayRebuilt} placedAt30pct=${placed}`);
  const pass = rows > 0 && idxRebuilt >= 1 && xrayRebuilt >= 1 && placed > 0;
  console.log(pass ? 'PASS — retime resyncs the event index + xray cache; reveal alive after an edit'
                   : 'FAIL — a stale derived structure survived the retime (the canvas blackout)');
  await browser.close();
  process.exit(pass ? 0 : 1);
})();
